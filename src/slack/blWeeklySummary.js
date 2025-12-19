const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { ALL_BUSINESS_LEADS, BL_ASSIGNMENTS } = require('../services/accountAssignment');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = path.join(__dirname, '../../data/bl-snapshots.json');
const GTM_CHANNEL = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || '#gtm-account-planning';
const CAPACITY_ALERT_THRESHOLD = parseInt(process.env.BL_CAPACITY_ALERT_THRESHOLD) || 10;
const MAX_DEALS_PER_BL = 3; // Max deals to show per BL in proposal section
const DIVIDER = '───────────────────────';

// Active pipeline stages (must match Salesforce "All Active Pipeline" report)
const ACTIVE_STAGES = [
  'Stage 0 - Qualifying',
  'Stage 1 - Discovery',
  'Stage 2 - SQO',
  'Stage 3 - Pilot',
  'Stage 4 - Proposal'
];

// US and EU Pod categorization for display
const US_POD = [
  'Asad Hussain',
  'Himanshu Agarwal',
  'Julie Stefanich',
  'Olivia Jung',
  'Ananth Cherukupally',
  'Justin Hills',
  'Mike Masiello'
];

const EU_POD = [
  'Greg MacHale',
  'Nathan Shine',
  'Tom Clancy',
  'Conor Molloy',
  'Alex Fox',
  'Nicola Fratini',
  'Emer Flynn',
  'Riona McHale'
];

// Proposal stage = Stage 4 - Proposal
const PROPOSAL_STAGE = 'Stage 4 - Proposal';

// ═══════════════════════════════════════════════════════════════════════════
// FISCAL QUARTER LOGIC (Feb-Jan Fiscal Year)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get fiscal quarter end date
 * Fiscal year runs Feb 1 - Jan 31
 * Q1: Feb 1 - Apr 30
 * Q2: May 1 - Jul 31
 * Q3: Aug 1 - Oct 31
 * Q4: Nov 1 - Jan 31
 */
function getFiscalQuarterEnd() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  const year = now.getFullYear();
  
  // Feb-Jan fiscal year, quarters end: Apr 30, Jul 31, Oct 31, Jan 31
  if (month >= 1 && month <= 3) {       // Feb(1)-Apr(3) = Q1
    return new Date(year, 3, 30);       // Apr 30
  } else if (month >= 4 && month <= 6) { // May(4)-Jul(6) = Q2
    return new Date(year, 6, 31);       // Jul 31
  } else if (month >= 7 && month <= 9) { // Aug(7)-Oct(9) = Q3
    return new Date(year, 9, 31);       // Oct 31
  } else {                               // Nov(10)-Dec(11) or Jan(0) = Q4
    // If Nov-Dec, quarter ends next year Jan 31
    // If Jan, quarter ends this year Jan 31
    const qEndYear = month === 0 ? year : year + 1;
    return new Date(qEndYear, 0, 31);   // Jan 31
  }
}

/**
 * Get fiscal quarter label for display (e.g., "thru Jan 31")
 */
function getFiscalQuarterLabel() {
  const qEnd = getFiscalQuarterEnd();
  return `thru ${qEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Check if a date falls within the current fiscal quarter (between today and quarter end)
 */
function isInCurrentFiscalQuarter(dateStr) {
  if (!dateStr) return false;
  
  // Parse as UTC to avoid timezone issues
  const targetDate = new Date(dateStr + 'T12:00:00Z');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const quarterEnd = getFiscalQuarterEnd();
  // Set to end of day on quarter end
  quarterEnd.setHours(23, 59, 59, 999);
  
  return targetDate >= today && targetDate <= quarterEnd;
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

function readSnapshots() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const data = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Failed to read snapshots file:', error);
  }
  return { snapshots: {} };
}

function writeSnapshots(data) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
    logger.info('Snapshots saved to file');
  } catch (error) {
    logger.error('Failed to write snapshots file:', error);
    throw error;
  }
}

function getLastSnapshotDate(snapshots) {
  const dates = Object.keys(snapshots.snapshots || {}).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function saveSnapshot(date, blData) {
  const data = readSnapshots();
  data.snapshots[date] = blData;
  
  // Keep only last 12 weeks of snapshots
  const dates = Object.keys(data.snapshots).sort();
  if (dates.length > 12) {
    const toRemove = dates.slice(0, dates.length - 12);
    toRemove.forEach(d => delete data.snapshots[d]);
  }
  
  writeSnapshots(data);
}

// ═══════════════════════════════════════════════════════════════════════════
// SALESFORCE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

async function queryPipelineData() {
  try {
    logger.info('Querying pipeline data from Salesforce...');
    
    // Build stage filter to match "All Active Pipeline" report (Stages 0-4)
    const stageFilter = ACTIVE_STAGES.map(s => `'${s}'`).join(', ');
    
    const soql = `
      SELECT Owner.Name, AccountId, Account.Name, 
             ACV__c, Weighted_ACV__c, StageName,
             Target_LOI_Date__c, Product_Line__c
      FROM Opportunity
      WHERE IsClosed = false
        AND StageName IN (${stageFilter})
      ORDER BY Owner.Name, Target_LOI_Date__c ASC NULLS LAST
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No opportunity records found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} active pipeline opportunities (Stages 0-4)`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query pipeline data:', error);
    throw error;
  }
}

/**
 * Query current logos by Account.Type__c
 * Type values: Revenue, Pilot, LOI with $ attached, LOI no $ attached
 */
async function queryLogosByType() {
  try {
    logger.info('Querying logos by type from Salesforce...');
    
    const soql = `
      SELECT Name, Type__c, First_Deal_Closed__c
      FROM Account
      WHERE Type__c != null
      ORDER BY Type__c, Name
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No logos found');
      return { revenue: [], pilot: [], loiWithDollar: [], loiNoDollar: [] };
    }
    
    // Categorize by Type__c
    const logos = { revenue: [], pilot: [], loiWithDollar: [], loiNoDollar: [] };
    
    result.records.forEach(acc => {
      const type = (acc.Type__c || '').toLowerCase().trim();
      const entry = { name: acc.Name, firstClosed: acc.First_Deal_Closed__c };
      
      if (type.includes('revenue') || type === 'arr' || type === 'recurring') {
        logos.revenue.push(entry);
      } else if (type.includes('pilot')) {
        logos.pilot.push(entry);
      } else if (type.includes('loi') && type.includes('with')) {
        logos.loiWithDollar.push(entry);
      } else if (type.includes('loi')) {
        logos.loiNoDollar.push(entry);
      }
    });
    
    logger.info(`Logos by type: Revenue=${logos.revenue.length}, Pilot=${logos.pilot.length}, LOI$=${logos.loiWithDollar.length}, LOI=${logos.loiNoDollar.length}`);
    return logos;
    
  } catch (error) {
    logger.error('Failed to query logos:', error);
    return { revenue: [], pilot: [], loiWithDollar: [], loiNoDollar: [] };
  }
}

/**
 * Query closed-won deals for this fiscal quarter
 */
async function querySignedDeals() {
  try {
    logger.info('Querying signed deals from Salesforce...');
    
    // Get fiscal quarter date range (Q4: Nov 1 - Jan 31)
    const now = new Date();
    const month = now.getMonth();
    
    // Calculate fiscal quarter start
    let fiscalQStart;
    if (month >= 1 && month <= 3) {       // Feb-Apr = Q1
      fiscalQStart = new Date(now.getFullYear(), 1, 1);
    } else if (month >= 4 && month <= 6) { // May-Jul = Q2
      fiscalQStart = new Date(now.getFullYear(), 4, 1);
    } else if (month >= 7 && month <= 9) { // Aug-Oct = Q3
      fiscalQStart = new Date(now.getFullYear(), 7, 1);
    } else {                               // Nov-Dec or Jan = Q4
      fiscalQStart = month === 0 
        ? new Date(now.getFullYear() - 1, 10, 1)  // Jan -> Nov last year
        : new Date(now.getFullYear(), 10, 1);     // Nov-Dec -> Nov this year
    }
    
    const startStr = fiscalQStart.toISOString().split('T')[0];
    
    const soql = `
      SELECT AccountId, Account.Name, Name, ACV__c, CloseDate, Revenue_Type__c, Owner.Name
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND CloseDate >= ${startStr}
      ORDER BY CloseDate DESC
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No signed deals found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} signed deals this fiscal quarter`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query signed deals:', error);
    return []; // Don't fail if signed query fails
  }
}

/**
 * Process signed deals data - by Revenue_Type__c
 * Revenue_Type__c values: Recurring (ARR), Commitment (LOI), Project
 */
function processSignedDeals(records) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  
  // Totals
  let totalDeals = 0;
  let totalACV = 0;
  const uniqueAccounts = new Set();
  
  // By Revenue Type
  let recurringDeals = 0, recurringACV = 0;
  let loiDeals = 0, loiACV = 0;       // Commitment = LOI
  let projectDeals = 0, projectACV = 0;
  
  // This month
  let thisMonthDeals = 0;
  let thisMonthACV = 0;
  const thisMonthAccountSet = new Set();
  const thisMonthDealsList = [];
  
  records.forEach(opp => {
    const acv = opp.ACV__c || 0;
    const closeDate = opp.CloseDate ? new Date(opp.CloseDate) : null;
    const revenueType = (opp.Revenue_Type__c || '').toLowerCase().trim();
    const accountId = opp.AccountId;
    
    totalDeals++;
    totalACV += acv;
    uniqueAccounts.add(accountId);
    
    // Revenue type breakdown
    if (revenueType.includes('recurring') || revenueType === 'arr') {
      recurringDeals++;
      recurringACV += acv;
    } else if (revenueType.includes('commitment') || revenueType.includes('booking') || revenueType.includes('loi')) {
      loiDeals++;
      loiACV += acv;
    } else if (revenueType.includes('project')) {
      projectDeals++;
      projectACV += acv;
    } else {
      // Default to project if unknown
      projectDeals++;
      projectACV += acv;
    }
    
    // This month check
    if (closeDate && closeDate.getMonth() === thisMonth && closeDate.getFullYear() === thisYear) {
      thisMonthDeals++;
      thisMonthACV += acv;
      thisMonthAccountSet.add(accountId);
      thisMonthDealsList.push({
        accountName: opp.Account?.Name || 'Unknown',
        oppName: opp.Name,
        acv,
        closeDate: opp.CloseDate,
        revenueType: opp.Revenue_Type__c
      });
    }
  });
  
  return {
    // Total quarter
    totalLogos: uniqueAccounts.size,
    totalDeals,
    totalACV,
    // By type
    recurringDeals,
    recurringACV,
    loiDeals,
    loiACV,
    projectDeals,
    projectACV,
    // This month
    thisMonthLogos: thisMonthAccountSet.size,
    thisMonthDeals,
    thisMonthACV,
    thisMonthDealsList: thisMonthDealsList.sort((a, b) => b.acv - a.acv)
  };
}

/**
 * Check if date is in current month
 */
function isInCurrentMonth(dateStr) {
  if (!dateStr) return false;
  const targetDate = new Date(dateStr + 'T12:00:00Z');
  const now = new Date();
  return targetDate.getMonth() === now.getMonth() && targetDate.getFullYear() === now.getFullYear();
}

/**
 * Process raw opportunity data into metrics
 */
function processPipelineData(records) {
  // Initialize accumulators
  const blMetrics = {};
  const proposalDeals = [];
  const allDeals = []; // All active pipeline deals for Top 5 section
  let totalGrossACV = 0;
  let totalWeightedACV = 0;
  let totalWeightedThisQuarter = 0;
  const allAccountIds = new Set();
  
  // Revenue type tracking
  let recurringACV = 0;
  let projectACV = 0;
  
  // Stage breakdown with weighted
  const stageBreakdown = {};
  ACTIVE_STAGES.forEach(s => {
    stageBreakdown[s] = { count: 0, grossACV: 0, weightedACV: 0 };
  });
  
  records.forEach(opp => {
    const ownerName = opp.Owner?.Name;
    const accountId = opp.AccountId;
    const accountName = opp.Account?.Name || 'Unknown';
    const acv = opp.ACV__c || 0;
    const weightedAcv = opp.Weighted_ACV__c || 0;
    const stageName = opp.StageName;
    const targetDate = opp.Target_LOI_Date__c;
    const productLine = opp.Product_Line__c || '';
    
    if (!ownerName) return;
    
    // Track all unique accounts
    allAccountIds.add(accountId);
    
    // Add to totals
    totalGrossACV += acv;
    totalWeightedACV += weightedAcv;
    
    // Track stage breakdown (with weighted)
    if (stageBreakdown[stageName]) {
      stageBreakdown[stageName].count++;
      stageBreakdown[stageName].grossACV += acv;
      stageBreakdown[stageName].weightedACV += weightedAcv;
    }
    
    // Add to weighted this quarter if target date is between today and fiscal quarter end
    if (isInCurrentFiscalQuarter(targetDate)) {
      totalWeightedThisQuarter += weightedAcv;
    }
    
    // Initialize BL if not exists
    if (!blMetrics[ownerName]) {
      blMetrics[ownerName] = {
        accounts: new Set(),
        opportunities: 0,
        grossACV: 0,
        weightedACV: 0
      };
    }
    
    // Add to BL metrics (including weighted)
    blMetrics[ownerName].accounts.add(accountId);
    blMetrics[ownerName].opportunities++;
    blMetrics[ownerName].grossACV += acv;
    blMetrics[ownerName].weightedACV += weightedAcv;
    
    // Track all deals for Top 5 section (all stages, sorted by target date)
    allDeals.push({
      accountName,
      acv,
      weightedAcv,
      targetDate,
      productLine,
      stageName,
      ownerName,
      ownerFirstName: ownerName.split(' ')[0]
    });
    
    // Collect proposal stage deals (Stage 4)
    if (stageName === PROPOSAL_STAGE) {
      proposalDeals.push({
        accountName,
        acv,
        weightedAcv,
        targetDate,
        productLine,
        ownerName,
        ownerFirstName: ownerName.split(' ')[0]
      });
    }
  });
  
  // Convert BL Sets to counts
  const finalBLMetrics = {};
  Object.entries(blMetrics).forEach(([bl, data]) => {
    finalBLMetrics[bl] = {
      accounts: data.accounts.size,
      opportunities: data.opportunities,
      grossACV: data.grossACV,
      weightedACV: data.weightedACV
    };
  });
  
  // Sort proposal deals by target date (soonest first)
  proposalDeals.sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });
  
  // Sort all deals by target date for Top 5 section
  allDeals.sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });
  
  // Calculate proposal stage totals
  const proposalGrossACV = proposalDeals.reduce((sum, d) => sum + d.acv, 0);
  
  // Calculate proposal targeting this month vs this quarter
  const proposalThisMonth = proposalDeals.filter(d => isInCurrentMonth(d.targetDate));
  const proposalThisQuarter = proposalDeals.filter(d => isInCurrentFiscalQuarter(d.targetDate));
  
  return {
    blMetrics: finalBLMetrics,
    proposalDeals,
    allDeals, // All deals for Top 5 section
    proposalThisMonth, // Include for PDF
    stageBreakdown,
    totals: {
      grossACV: totalGrossACV,
      weightedACV: totalWeightedACV,
      weightedThisQuarter: totalWeightedThisQuarter,
      totalOpportunities: records.length,
      totalAccounts: allAccountIds.size,
      avgDealSize: records.length > 0 ? totalGrossACV / records.length : 0,
      proposalCount: proposalDeals.length,
      proposalGrossACV,
      // This month targeting
      proposalThisMonthCount: proposalThisMonth.length,
      proposalThisMonthACV: proposalThisMonth.reduce((sum, d) => sum + d.acv, 0),
      // This quarter targeting
      proposalThisQuarterCount: proposalThisQuarter.length,
      proposalThisQuarterGrossACV: proposalThisQuarter.reduce((sum, d) => sum + d.acv, 0),
      proposalThisQuarterWeightedACV: proposalThisQuarter.reduce((sum, d) => sum + d.weightedAcv, 0)
    },
    fiscalQuarterLabel: getFiscalQuarterLabel()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Brand colors
const TEAL_ACCENT = '#3EB8A5';
const DARK_GRAY = '#333333';
const LIGHT_GRAY = '#E5E5E5';
const MEDIUM_GRAY = '#888888';

/**
 * Draw a horizontal line with optional color
 */
function drawLine(doc, y, color = LIGHT_GRAY, width = 512) {
  doc.strokeColor(color).lineWidth(1).moveTo(50, y).lineTo(50 + width, y).stroke();
  doc.strokeColor('#000000'); // Reset
}

/**
 * Draw a teal accent line (thin)
 */
function drawTealLine(doc, y, width = 512) {
  doc.strokeColor(TEAL_ACCENT).lineWidth(1.5).moveTo(50, y).lineTo(50 + width, y).stroke();
  doc.strokeColor('#000000'); // Reset
}

/**
 * Generate professional PDF snapshot
 * Clean Helvetica design with teal accents, proper tables, good positioning
 * Redesigned: Removed signed sections, added Top 5 Deals by BL, optimized layout
 */
function generatePDFSnapshot(pipelineData, dateStr, signedData = {}, logosByType = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { blMetrics, stageBreakdown, totals, fiscalQuarterLabel, proposalThisMonth, allDeals } = pipelineData;
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 24, bottom: 24, left: 36, right: 36 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Fonts
      const fontRegular = 'Helvetica';
      const fontBold = 'Helvetica-Bold';
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE GEOMETRY - Dynamic proportional layout to fill entire page
      // ═══════════════════════════════════════════════════════════════════════
      const PAGE_HEIGHT = 792;  // Letter size in points
      const MARGIN_TOP = 24;
      const MARGIN_BOTTOM = 24;
      const LEFT = 36;
      const PAGE_WIDTH = 540;
      const MID = LEFT + PAGE_WIDTH / 2;
      const FOOTER_HEIGHT = 18;
      const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;  // 744pt
      const CONTENT_HEIGHT = USABLE_HEIGHT - FOOTER_HEIGHT;  // 726pt for content
      
      // Section proportions (sum to 100%) - optimized to fill page
      const SECTIONS = {
        header: 0.055,      // ~40pt - Title + date + teal line
        keyMetrics: 0.065,  // ~47pt - 5-column metrics bar
        stageRow: 0.16,     // ~116pt - Stage Distribution + Proposal Stage
        blSummary: 0.18,    // ~131pt - Business Lead tables (7 BLs each)
        topDeals: 0.54      // ~392pt - Top Deals by BL (fills remaining space)
      };
      
      // Calculate absolute Y positions dynamically
      let currentY = MARGIN_TOP;
      
      const headerStartY = currentY;
      const headerHeight = Math.floor(CONTENT_HEIGHT * SECTIONS.header);
      currentY += headerHeight;
      
      const metricsStartY = currentY;
      const metricsHeight = Math.floor(CONTENT_HEIGHT * SECTIONS.keyMetrics);
      currentY += metricsHeight;
      
      const stageRowStartY = currentY;
      const stageRowHeight = Math.floor(CONTENT_HEIGHT * SECTIONS.stageRow);
      currentY += stageRowHeight;
      
      const blSummaryStartY = currentY;
      const blSummaryHeight = Math.floor(CONTENT_HEIGHT * SECTIONS.blSummary);
      currentY += blSummaryHeight;
      
      const topDealsStartY = currentY;
      const topDealsHeight = Math.floor(CONTENT_HEIGHT * SECTIONS.topDeals);
      
      const footerY = PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_HEIGHT;
      
      const halfWidth = PAGE_WIDTH / 2 - 10;
      const RIGHT_COL = MID + 10;
      
      // ═══════════════════════════════════════════════════════════════════════
      // HEADER
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(16).fillColor(DARK_GRAY);
      doc.text('Eudia GTM Weekly Snapshot', LEFT, headerStartY, { width: PAGE_WIDTH, align: 'center' });
      doc.font(fontRegular).fontSize(9).fillColor(MEDIUM_GRAY);
      doc.text(dateStr, LEFT, headerStartY + 18, { width: PAGE_WIDTH, align: 'center' });
      
      const headerLineY = headerStartY + headerHeight - 4;
      doc.strokeColor(TEAL_ACCENT).lineWidth(2).moveTo(LEFT, headerLineY).lineTo(LEFT + PAGE_WIDTH, headerLineY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 1: KEY METRICS BAR (5 equal columns across full width)
      // ═══════════════════════════════════════════════════════════════════════
      const row1Y = metricsStartY;
      
      // Calculate logos
      const revenueLogos = (logosByType.revenue || []).length;
      const pilotLogos = (logosByType.pilot || []).length;
      const loiWithLogos = (logosByType.loiWithDollar || []).length;
      const loiNoLogos = (logosByType.loiNoDollar || []).length;
      const totalLogos = revenueLogos + pilotLogos + loiWithLogos + loiNoLogos;
      
      // 5-column layout for key metrics
      const metricColW = PAGE_WIDTH / 5;  // 108px each
      const metrics = [
        { label: 'Total Gross ACV', value: formatCurrency(totals.grossACV), sub: `${totals.totalOpportunities} opps • ${totals.totalAccounts} accts` },
        { label: 'Weighted Pipeline', value: formatCurrency(totals.weightedThisQuarter), sub: fiscalQuarterLabel },
        { label: 'Avg Deal Size', value: formatCurrency(totals.avgDealSize), sub: '' },
        { label: 'Current Logos', value: totalLogos.toString(), sub: `Rev: ${revenueLogos} • Pilot: ${pilotLogos}` },
        { label: 'S4 Proposal ACV', value: formatCurrency(totals.proposalGrossACV), sub: `${totals.proposalCount} deals` }
      ];
      
      metrics.forEach((m, i) => {
        const x = LEFT + (i * metricColW);
        doc.font(fontRegular).fontSize(6.5).fillColor(MEDIUM_GRAY);
        doc.text(m.label, x, row1Y, { width: metricColW - 5 });
        doc.font(fontBold).fontSize(18).fillColor(DARK_GRAY);
        doc.text(m.value, x, row1Y + 9, { width: metricColW - 5 });
        if (m.sub) {
          doc.font(fontRegular).fontSize(5.5).fillColor(MEDIUM_GRAY);
          doc.text(m.sub, x, row1Y + 28, { width: metricColW - 5 });
        }
      });
      
      // Divider line
      const row1EndY = metricsStartY + metricsHeight - 2;
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, row1EndY).lineTo(LEFT + PAGE_WIDTH, row1EndY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 2: STAGE DISTRIBUTION (left) + PROPOSAL STAGE (right)
      // ═══════════════════════════════════════════════════════════════════════
      const row2Y = stageRowStartY + 4;
      
      // LEFT: Stage Distribution Table
      doc.font(fontBold).fontSize(8).fillColor(DARK_GRAY);
      doc.text('STAGE DISTRIBUTION', LEFT, row2Y);
      
      const stageTableY = row2Y + 11;
      doc.font(fontBold).fontSize(6).fillColor(MEDIUM_GRAY);
      doc.text('Stage', LEFT, stageTableY);
      doc.text('Deals', LEFT + 90, stageTableY);
      doc.text('Gross ACV', LEFT + 130, stageTableY);
      doc.text('Weighted', LEFT + 195, stageTableY);
      
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, stageTableY + 8).lineTo(LEFT + halfWidth, stageTableY + 8).stroke();
      
      let stageRowY = stageTableY + 11;
      const stageOrder = [...ACTIVE_STAGES].reverse();
      doc.font(fontRegular).fontSize(7).fillColor(DARK_GRAY);
      stageOrder.forEach(stage => {
        const data = stageBreakdown[stage] || { count: 0, grossACV: 0, weightedACV: 0 };
        const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
        doc.text(stageLabel, LEFT, stageRowY);
        doc.text(data.count.toString(), LEFT + 90, stageRowY);
        doc.text(formatCurrency(data.grossACV), LEFT + 130, stageRowY);
        doc.text(formatCurrency(data.weightedACV), LEFT + 195, stageRowY);
        stageRowY += 10;
      });
      
      // RIGHT: Proposal Stage Detail
      const RIGHT_COL = MID + 10;
      doc.font(fontBold).fontSize(8).fillColor(DARK_GRAY);
      doc.text('PROPOSAL STAGE (S4)', RIGHT_COL, row2Y);
      
      doc.font(fontBold).fontSize(6).fillColor(MEDIUM_GRAY);
      doc.text('Metric', RIGHT_COL, stageTableY);
      doc.text('Deals', RIGHT_COL + 80, stageTableY);
      doc.text('Gross ACV', RIGHT_COL + 120, stageTableY);
      doc.text('Wtd ACV', RIGHT_COL + 185, stageTableY);
      
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(RIGHT_COL, stageTableY + 8).lineTo(LEFT + PAGE_WIDTH, stageTableY + 8).stroke();
      
      let propRowY = stageTableY + 11;
      doc.font(fontRegular).fontSize(7).fillColor(DARK_GRAY);
      
      // Total S4
      const s4Data = stageBreakdown['Stage 4 - Proposal'] || { weightedACV: 0 };
      doc.text('Total', RIGHT_COL, propRowY);
      doc.text(totals.proposalCount.toString(), RIGHT_COL + 80, propRowY);
      doc.text(formatCurrency(totals.proposalGrossACV), RIGHT_COL + 120, propRowY);
      doc.text(formatCurrency(s4Data.weightedACV), RIGHT_COL + 185, propRowY);
      propRowY += 10;
      
      // This Month
      doc.text('This Month', RIGHT_COL, propRowY);
      doc.text(totals.proposalThisMonthCount.toString(), RIGHT_COL + 80, propRowY);
      doc.text(formatCurrency(totals.proposalThisMonthACV), RIGHT_COL + 120, propRowY);
      doc.text('—', RIGHT_COL + 185, propRowY);
      propRowY += 10;
      
      // This Quarter
      doc.text('This Quarter', RIGHT_COL, propRowY);
      doc.text(totals.proposalThisQuarterCount.toString(), RIGHT_COL + 80, propRowY);
      doc.text(formatCurrency(totals.proposalThisQuarterGrossACV), RIGHT_COL + 120, propRowY);
      doc.text(formatCurrency(totals.proposalThisQuarterWeightedACV || 0), RIGHT_COL + 185, propRowY);
      propRowY += 12;
      
      // Targeting This Month deals
      if (proposalThisMonth && proposalThisMonth.length > 0) {
        doc.font(fontBold).fontSize(6).fillColor(TEAL_ACCENT);
        doc.text('TARGETING THIS MONTH', RIGHT_COL, propRowY);
        propRowY += 8;
        
        doc.font(fontRegular).fontSize(6).fillColor(DARK_GRAY);
        const dealsToShow = proposalThisMonth.slice(0, 5);
        dealsToShow.forEach(d => {
          const name = d.accountName.length > 20 ? d.accountName.substring(0, 20) + '...' : d.accountName;
          doc.text(`${name}  •  ${formatCurrency(d.acv)}  •  ${formatDate(d.targetDate)}`, RIGHT_COL, propRowY);
          propRowY += 8;
        });
        if (proposalThisMonth.length > 5) {
          doc.fillColor(MEDIUM_GRAY);
          doc.text(`+${proposalThisMonth.length - 5} more deals`, RIGHT_COL, propRowY);
          propRowY += 8;
        }
      }
      
      // Divider line
      const row2EndY = stageRowStartY + stageRowHeight - 2;
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, row2EndY).lineTo(LEFT + PAGE_WIDTH, row2EndY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 3: BUSINESS LEAD SUMMARY - US Pod (left) + EU Pod (right)
      // ═══════════════════════════════════════════════════════════════════════
      const row3Y = blSummaryStartY + 4;
      
      doc.font(fontBold).fontSize(8).fillColor(DARK_GRAY);
      doc.text('BUSINESS LEAD SUMMARY', LEFT, row3Y);
      
      // Helper function to draw BL table
      const drawBLTableInColumn = (title, blList, startX, startY, colWidth) => {
        const activeBLs = blList
          .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
          .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
        
        if (activeBLs.length === 0) return startY;
        
        doc.font(fontBold).fontSize(7).fillColor(TEAL_ACCENT);
        doc.text(title, startX, startY);
        
        const headerY = startY + 9;
        doc.font(fontBold).fontSize(5.5).fillColor(MEDIUM_GRAY);
        doc.text('Name', startX, headerY);
        doc.text('Accts', startX + 55, headerY);
        doc.text('Opps', startX + 85, headerY);
        doc.text('Gross', startX + 115, headerY);
        doc.text('Wtd', startX + 165, headerY);
        
        doc.strokeColor(LIGHT_GRAY).lineWidth(0.3).moveTo(startX, headerY + 6).lineTo(startX + colWidth - 20, headerY + 6).stroke();
        
        let rowY = headerY + 8;
        doc.font(fontRegular).fontSize(6.5).fillColor(DARK_GRAY);
        activeBLs.forEach(bl => {
          const m = blMetrics[bl];
          const displayName = bl.split(' ')[0];
          doc.text(displayName, startX, rowY);
          doc.text(m.accounts.toString(), startX + 55, rowY);
          doc.text(m.opportunities.toString(), startX + 85, rowY);
          doc.text(formatCurrency(m.grossACV), startX + 115, rowY);
          doc.text(formatCurrency(m.weightedACV), startX + 165, rowY);
          rowY += 8;
        });
        
        return rowY;
      };
      
      const blTableStartY = row3Y + 10;
      const usEndY = drawBLTableInColumn('US Pod', US_POD, LEFT, blTableStartY, halfWidth + 20);
      const euEndY = drawBLTableInColumn('EU Pod', EU_POD, RIGHT_COL, blTableStartY, halfWidth + 20);
      
      // Divider line
      const row3EndY = blSummaryStartY + blSummaryHeight - 2;
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, row3EndY).lineTo(LEFT + PAGE_WIDTH, row3EndY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 4: TOP DEALS BY BUSINESS LEAD (fills remaining space to footer)
      // ═══════════════════════════════════════════════════════════════════════
      const row4Y = topDealsStartY + 4;
      
      doc.font(fontBold).fontSize(8).fillColor(DARK_GRAY);
      doc.text('TOP DEALS BY BUSINESS LEAD', LEFT, row4Y);
      doc.font(fontRegular).fontSize(6).fillColor(MEDIUM_GRAY);
      doc.text('Sorted by Target Sign Date', LEFT + 160, row4Y + 1);
      
      // Get all active pipeline deals sorted by target date
      const dealsForTop5 = allDeals || [];
      
      // Group deals by BL and get top 5 per BL
      const dealsByBL = {};
      dealsForTop5.forEach(deal => {
        const blName = deal.ownerFirstName || deal.ownerName?.split(' ')[0] || 'Unknown';
        if (!dealsByBL[blName]) {
          dealsByBL[blName] = [];
        }
        dealsByBL[blName].push(deal);
      });
      
      // Sort each BL's deals by target date and limit to 6 (expanded to fill space)
      Object.keys(dealsByBL).forEach(bl => {
        dealsByBL[bl].sort((a, b) => {
          if (!a.targetDate && !b.targetDate) return 0;
          if (!a.targetDate) return 1;
          if (!b.targetDate) return -1;
          return new Date(a.targetDate) - new Date(b.targetDate);
        });
        dealsByBL[bl] = dealsByBL[bl].slice(0, 6);
      });
      
      // Get BLs sorted by total ACV
      const sortedBLs = Object.keys(dealsByBL)
        .map(bl => ({
          name: bl,
          deals: dealsByBL[bl],
          totalACV: dealsByBL[bl].reduce((sum, d) => sum + (d.acv || 0), 0)
        }))
        .sort((a, b) => b.totalACV - a.totalACV);
      
      // ═══════════════════════════════════════════════════════════════════════
      // FORCE FILL: Calculate dynamic row heights to fill space to footer
      // ═══════════════════════════════════════════════════════════════════════
      
      // Split BLs into 2 columns
      const leftBLs = sortedBLs.filter((_, i) => i % 2 === 0);
      const rightBLs = sortedBLs.filter((_, i) => i % 2 === 1);
      
      // Step 1: Calculate EXACT available height from deals header to footer
      const dealsHeaderHeight = 16;  // "TOP DEALS BY BUSINESS LEAD" header + subtitle
      const dealsContentStartY = row4Y + dealsHeaderHeight;
      const dealsContentEndY = footerY - 6;  // Small gap before footer line
      const totalDealsHeight = dealsContentEndY - dealsContentStartY;
      
      // Step 2: Count total rows to render
      const numBLsLeft = Math.min(leftBLs.length, 6);
      const numBLsRight = Math.min(rightBLs.length, 6);
      const maxBLs = Math.max(numBLsLeft, numBLsRight, 1);
      const dealsPerBL = 5;
      
      // Each BL section: 1 header + dealsPerBL deals + 0.5 gap = 6.5 rows per BL
      const rowsPerBL = 1 + dealsPerBL + 0.5;
      const totalRows = maxBLs * rowsPerBL;
      
      // Step 3: Calculate dynamic row height to FORCE fill available space
      const dynamicRowHeight = totalDealsHeight / totalRows;
      // Clamp between 9pt (min readable) and 16pt (max reasonable)
      const rowHeight = Math.max(9, Math.min(16, dynamicRowHeight));
      const blHeaderHeight = rowHeight + 3;
      const blGapHeight = Math.floor(rowHeight * 0.6);
      
      // Font sizes scale with row height
      const dealFontSize = Math.max(6.5, Math.min(8, rowHeight - 2));
      const blNameFontSize = Math.max(7, Math.min(10, rowHeight));
      
      // Step 4: Render with dynamic heights
      const drawBLDeals = (bls, startX, startY, maxWidth) => {
        let y = startY;
        
        bls.slice(0, 6).forEach(bl => {
          if (bl.deals.length === 0) return;
          
          // BL Name header with dynamic font size
          doc.font(fontBold).fontSize(blNameFontSize).fillColor(TEAL_ACCENT);
          doc.text(bl.name, startX, y);
          y += blHeaderHeight;
          
          // Deals with dynamic row height and font size
          doc.font(fontRegular).fontSize(dealFontSize).fillColor(DARK_GRAY);
          bl.deals.slice(0, dealsPerBL).forEach(deal => {
            const name = deal.accountName.length > 26 ? deal.accountName.substring(0, 26) + '...' : deal.accountName;
            const date = formatDate(deal.targetDate);
            doc.text(`${name}  •  ${formatCurrency(deal.acv)}  •  ${date}`, startX, y, { width: maxWidth });
            y += rowHeight;
          });
          
          y += blGapHeight;
        });
        
        return y;
      };
      
      const dealsStartY = dealsContentStartY;
      const leftDealsEndY = drawBLDeals(leftBLs, LEFT, dealsStartY, halfWidth);
      const rightDealsEndY = drawBLDeals(rightBLs, RIGHT_COL, dealsStartY, halfWidth);
      
      // ═══════════════════════════════════════════════════════════════════════
      // FOOTER - Flows naturally after content (NOT at fixed page position)
      // ═══════════════════════════════════════════════════════════════════════
      // Position footer 20px after the last content row
      const contentEndY = Math.max(leftDealsEndY, rightDealsEndY);
      const dynamicFooterY = contentEndY + 20;
      
      doc.strokeColor(TEAL_ACCENT).lineWidth(1).moveTo(LEFT, dynamicFooterY).lineTo(LEFT + PAGE_WIDTH, dynamicFooterY).stroke();
      
      doc.font(fontRegular).fontSize(5.5).fillColor(MEDIUM_GRAY);
      doc.text('Generated by Eudia GTM Brain  •  www.eudia.com  •  Internal use only', LEFT, dynamicFooterY + 4, { width: PAGE_WIDTH, align: 'center' });
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format currency for display (lowercase m and k)
 */
function formatCurrency(amount) {
  if (!amount || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}m`;  // lowercase m
  } else if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}k`;      // lowercase k
  } else {
    return `$${Math.round(amount)}`;
  }
}

/**
 * Format date for display (Dec 20)
 */
function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format change indicator with sign
 */
function formatChange(current, previous) {
  if (previous === undefined || previous === null) {
    return '';
  }
  
  const diff = current - previous;
  if (diff === 0) {
    return ' (+0)';
  } else if (diff > 0) {
    return ` (+${diff})`;
  } else {
    return ` (${diff})`;
  }
}

/**
 * Format ACV change indicator
 */
function formatACVChange(current, previous) {
  if (previous === undefined || previous === null) {
    return '';
  }
  
  const diff = current - previous;
  if (Math.abs(diff) < 1000) {
    return '';
  } else if (diff > 0) {
    return ` (+${formatCurrency(diff)})`;
  } else {
    return ` (${formatCurrency(diff)})`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a single BL line for the message (compact format)
 */
function formatBLLine(blName, current, previous) {
  const currentAccounts = current?.accounts || 0;
  const currentOpps = current?.opportunities || 0;
  const currentACV = current?.grossACV || 0;
  
  const previousAccounts = previous?.accounts;
  const previousOpps = previous?.opportunities;
  const previousACV = previous?.grossACV;
  
  const accountChange = formatChange(currentAccounts, previousAccounts);
  const oppChange = formatChange(currentOpps, previousOpps);
  const acvChange = formatACVChange(currentACV, previousACV);
  
  const firstName = blName.split(' ')[0];
  
  // Use 'accts' for brevity, remove 'gross' to shorten
  return `• ${firstName} — ${currentAccounts} accts${accountChange}, ${currentOpps} opps${oppChange}, ${formatCurrency(currentACV)}${acvChange}`;
}

/**
 * Format proposal deals grouped by BL - vertical scannable format
 * Each BL gets a header line, then indented deal lines
 */
function formatProposalDealsByBL(proposalDeals) {
  if (proposalDeals.length === 0) return '';
  
  // Group by owner first name
  const byOwner = {};
  proposalDeals.forEach(deal => {
    const owner = deal.ownerFirstName;
    if (!byOwner[owner]) {
      byOwner[owner] = [];
    }
    byOwner[owner].push(deal);
  });
  
  // Sort owners by total ACV descending
  const sortedOwners = Object.entries(byOwner)
    .map(([owner, deals]) => ({
      owner,
      deals,
      totalACV: deals.reduce((sum, d) => sum + d.acv, 0)
    }))
    .sort((a, b) => b.totalACV - a.totalACV);
  
  // Format each owner's deals - vertical format
  let output = '';
  sortedOwners.forEach(({ owner, deals }) => {
    const dealCount = deals.length;
    
    // Sort deals by ACV descending for display
    deals.sort((a, b) => b.acv - a.acv);
    
    // BL header line with bold name and deal count
    output += `*${owner}* (${dealCount} ${dealCount === 1 ? 'deal' : 'deals'})\n`;
    
    // Show top deals, each on its own indented line
    const dealsToShow = deals.slice(0, MAX_DEALS_PER_BL);
    dealsToShow.forEach(d => {
      output += `  › ${d.accountName} — ${formatCurrency(d.acv)} — ${formatDate(d.targetDate)}\n`;
    });
    
    // Add "+X more" if needed
    if (deals.length > MAX_DEALS_PER_BL) {
      output += `  › +${deals.length - MAX_DEALS_PER_BL} more\n`;
    }
    
    // Add blank line between BLs for readability
    output += '\n';
  });
  
  return output;
}

/**
 * Format BL line for Slack message
 */
function formatBLLineForSlack(blName, metrics) {
  if (!metrics) return null;
  const firstName = blName.split(' ')[0];
  return `• ${firstName} — ${metrics.accounts} accts, ${metrics.opportunities} opps, ${formatCurrency(metrics.grossACV)}`;
}

/**
 * Format the complete Slack message - blended format with BL details
 */
function formatSlackMessage(pipelineData, previousMetrics, dateStr) {
  const { blMetrics, totals, fiscalQuarterLabel } = pipelineData;
  
  let message = `*Eudia GTM Weekly Snapshot — ${dateStr}*\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // PIPELINE SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════
  message += '*PIPELINE SNAPSHOT*\n';
  message += `Total Gross ACV: ${formatCurrency(totals.grossACV)} (${totals.totalOpportunities} opps across ${totals.totalAccounts} accounts)\n`;
  message += `Weighted Pipeline (${fiscalQuarterLabel}): ${formatCurrency(totals.weightedThisQuarter)}\n`;
  message += `Avg Deal Size: ${formatCurrency(totals.avgDealSize)}\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // PROPOSAL STAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  message += `*PROPOSAL STAGE (S4)* — ${totals.proposalCount} deals, ${formatCurrency(totals.proposalGrossACV)} gross ACV\n`;
  message += `Targeting This Month: ${totals.proposalThisMonthCount} deals, ${formatCurrency(totals.proposalThisMonthACV)} ACV\n`;
  message += `Targeting This Quarter: ${totals.proposalThisQuarterCount} deals, ${formatCurrency(totals.proposalThisQuarterGrossACV)} gross, ${formatCurrency(totals.proposalThisQuarterWeightedACV)} weighted\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY REGION BUSINESS LEAD VIEW
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY BUSINESS LEAD* _(accounts, opps, gross ACV)_\n\n';
  
  // US Pod
  const usPodBLs = US_POD
    .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (usPodBLs.length > 0) {
    message += '*US Pod*\n';
    usPodBLs.forEach(bl => {
      message += formatBLLineForSlack(bl, blMetrics[bl]) + '\n';
    });
    message += '\n';
  }
  
  // EU Pod
  const euPodBLs = EU_POD
    .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (euPodBLs.length > 0) {
    message += '*EU Pod*\n';
    euPodBLs.forEach(bl => {
      message += formatBLLineForSlack(bl, blMetrics[bl]) + '\n';
    });
    message += '\n';
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PDF REFERENCE
  // ═══════════════════════════════════════════════════════════════════════
  message += '_See attached PDF for full details._';
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sendBLWeeklySummary(app, testMode = false) {
  try {
    logger.info('Generating weekly BL summary with PDF...');
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Query pipeline data from Salesforce
    const records = await queryPipelineData();
    
    // Query signed deals and logos
    const signedRecords = await querySignedDeals();
    const signedData = processSignedDeals(signedRecords);
    const logosByType = await queryLogosByType();
    
    // Process into metrics
    const pipelineData = processPipelineData(records);
    
    // Get previous week's snapshot
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`Previous snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the condensed Slack message
    const message = formatSlackMessage(pipelineData, previousMetrics, displayDate);
    
    // Generate PDF snapshot with signed data and logos
    logger.info('Generating PDF snapshot...');
    const pdfBuffer = await generatePDFSnapshot(pipelineData, displayDate, signedData, logosByType);
    const pdfFilename = `Eudia_GTM_Weekly_Snapshot_${dateStr}.pdf`;
    
    // Save current snapshot (BL metrics only for comparison)
    saveSnapshot(dateStr, pipelineData.blMetrics);
    
    // Determine channel
    let channel = testMode ? 
      (process.env.TEST_CHANNEL || 'U094AQE9V7D') :
      GTM_CHANNEL;
    
    // For DMs (user IDs), we need to open a conversation first
    if (channel.startsWith('U')) {
      const conversation = await app.client.conversations.open({
        users: channel
      });
      channel = conversation.channel.id;
    }
    
    // Upload PDF and send message together
    await app.client.files.uploadV2({
      channel_id: channel,
      file: pdfBuffer,
      filename: pdfFilename,
      title: `Eudia GTM Weekly Snapshot — ${displayDate}`,
      initial_comment: message
    });
    
    logger.info(`Weekly BL summary with PDF sent to ${channel}`);
    
    return {
      success: true,
      channel,
      dateStr,
      blCount: Object.keys(pipelineData.blMetrics).length,
      totals: pipelineData.totals,
      fiscalQuarterLabel: pipelineData.fiscalQuarterLabel,
      message,
      pdfFilename
    };
    
  } catch (error) {
    logger.error('Failed to send weekly BL summary:', error);
    throw error;
  }
}

function scheduleBLWeeklySummary(app) {
  cron.schedule('0 9 * * 4', async () => {
    logger.info('Running scheduled BL weekly summary (Thursday 9 AM EST)');
    
    try {
      await sendBLWeeklySummary(app, false);
      logger.info('Scheduled BL weekly summary completed');
    } catch (error) {
      logger.error('Scheduled BL weekly summary failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('BL Weekly Summary scheduled (Thursday 9 AM EST)');
}

async function sendBLSummaryNow(app, testMode = true) {
  logger.info(`Sending BL summary now (test mode: ${testMode})`);
  return await sendBLWeeklySummary(app, testMode);
}

function getSnapshotData() {
  return readSnapshots();
}

async function queryBLMetrics() {
  const records = await queryPipelineData();
  const pipelineData = processPipelineData(records);
  return pipelineData.blMetrics;
}

module.exports = {
  scheduleBLWeeklySummary,
  sendBLSummaryNow,
  sendBLWeeklySummary,
  queryBLMetrics,
  getSnapshotData,
  formatSlackMessage,
  queryPipelineData,
  processPipelineData,
  getFiscalQuarterEnd,
  getFiscalQuarterLabel,
  isInCurrentFiscalQuarter,
  US_POD,
  EU_POD,
  CAPACITY_ALERT_THRESHOLD
};
