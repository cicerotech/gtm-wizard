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

// PDF Design constants - matches gtm-snapshot-fixed.html exactly
const GREEN_ACCENT = '#10b981';   // Pod titles, targeting box, gradient start
const BLUE_ACCENT = '#3b82f6';    // Gradient end
const DARK_TEXT = '#1a1a1a';      // Headers, values
const MEDIUM_TEXT = '#666666';    // Labels, subtexts
const LIGHT_TEXT = '#999999';     // Footer, muted text
const BODY_TEXT = '#333333';      // Table content
const BORDER_GRAY = '#e5e5e5';    // Table header borders
const LIGHT_BORDER = '#f3f4f6';   // Table row borders
const GREEN_BG = '#f0fdf4';       // Targeting box background

/**
 * Generate professional PDF snapshot - matches gtm-snapshot-fixed.html exactly
 * Uses green accent (#10b981) with gradient divider, proper typography and spacing
 */
function generatePDFSnapshot(pipelineData, dateStr, signedData = {}, logosByType = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { blMetrics, stageBreakdown, totals, fiscalQuarterLabel, proposalThisMonth, allDeals } = pipelineData;
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE SETUP - Letter size with proper margins (matches HTML padding: 40px 50px)
      // ═══════════════════════════════════════════════════════════════════════
      const doc = new PDFDocument({ 
        size: 'LETTER',  // 612 x 792 points
        margins: { top: 40, bottom: 40, left: 50, right: 50 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Page dimensions
      const LEFT = 50;
      const PAGE_WIDTH = 512;  // 612 - 50 - 50
      const MID = LEFT + PAGE_WIDTH / 2;
      const halfWidth = PAGE_WIDTH / 2 - 15;
      const RIGHT_COL = MID + 15;
      const SECTION_GAP = 30;  // Gap between major sections
      
      // Fonts
      const fontRegular = 'Helvetica';
      const fontBold = 'Helvetica-Bold';
      
      let y = 40;  // Start position
      
      // ═══════════════════════════════════════════════════════════════════════
      // HEADER - Centered title + date + gradient line
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(28).fillColor(DARK_TEXT);
      doc.text('Eudia GTM Weekly Snapshot', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
      y += 32;
      
      doc.font(fontRegular).fontSize(14).fillColor(MEDIUM_TEXT);
      doc.text(dateStr, LEFT, y, { width: PAGE_WIDTH, align: 'center' });
      y += 24;
      
      // Gradient line (green to blue) - draw as two overlapping lines since PDFKit doesn't support gradients easily
      const gradientY = y;
      const grad = doc.linearGradient(LEFT, gradientY, LEFT + PAGE_WIDTH, gradientY);
      grad.stop(0, GREEN_ACCENT).stop(1, BLUE_ACCENT);
      doc.rect(LEFT, gradientY, PAGE_WIDTH, 3).fill(grad);
      y += 3 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP METRICS - 5 columns matching HTML exactly
      // ═══════════════════════════════════════════════════════════════════════
      const metricsY = y;
      const colWidth = PAGE_WIDTH / 5;  // 102.4px each
      
      // Calculate logos
      const revenueLogos = (logosByType.revenue || []).length;
      const pilotLogos = (logosByType.pilot || []).length;
      const loiWithLogos = (logosByType.loiWithDollar || []).length;
      const loiNoLogos = (logosByType.loiNoDollar || []).length;
      const totalLogos = revenueLogos + pilotLogos + loiWithLogos + loiNoLogos;
      
      // Column 1: Pipeline Overview - Total Gross ACV
      let colX = LEFT;
      doc.font(fontBold).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text('PIPELINE OVERVIEW', colX, metricsY);
      doc.font(fontRegular).fontSize(10).fillColor(MEDIUM_TEXT);
      doc.text('Total Gross ACV', colX, metricsY + 14);
      doc.font(fontBold).fontSize(32).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.grossACV), colX, metricsY + 26);
      doc.font(fontRegular).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text(`${totals.totalOpportunities} opps • ${totals.totalAccounts} accts`, colX, metricsY + 62);
      
      // Column 2: Weighted Pipeline
      colX = LEFT + colWidth;
      doc.font(fontRegular).fontSize(10).fillColor(MEDIUM_TEXT);
      doc.text('Weighted Pipeline', colX, metricsY + 14);
      doc.font(fontBold).fontSize(32).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.weightedThisQuarter), colX, metricsY + 26);
      doc.font(fontRegular).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text(fiscalQuarterLabel, colX, metricsY + 62);
      
      // Column 3: Avg Deal Size
      colX = LEFT + colWidth * 2;
      doc.font(fontRegular).fontSize(10).fillColor(MEDIUM_TEXT);
      doc.text('Avg Deal Size', colX, metricsY + 14);
      doc.font(fontBold).fontSize(32).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.avgDealSize), colX, metricsY + 26);
      
      // Column 4: Current Logos
      colX = LEFT + colWidth * 3;
      doc.font(fontBold).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text('CURRENT LOGOS', colX, metricsY);
      doc.font(fontBold).fontSize(48).fillColor(DARK_TEXT);
      doc.text(totalLogos.toString(), colX, metricsY + 14);
      doc.font(fontRegular).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text(`Revenue: ${revenueLogos} • Pilot: ${pilotLogos} • LOI$: ${loiWithLogos} • LOI: ${loiNoLogos}`, colX, metricsY + 62, { width: colWidth + 50 });
      
      // Column 5: By Revenue Type
      colX = LEFT + colWidth * 4;
      doc.font(fontBold).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text('BY REVENUE TYPE', colX, metricsY);
      const recurringACV = totals.recurringACV || 0;
      const projectACV = totals.projectACV || 0;
      doc.font(fontRegular).fontSize(11).fillColor(MEDIUM_TEXT);
      doc.text(`Recurring: ${formatCurrency(recurringACV)}`, colX, metricsY + 18);
      doc.text(`Project: ${formatCurrency(projectACV)}`, colX, metricsY + 32);
      
      y = metricsY + 80 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TWO COLUMN SECTION: Stage Distribution (left) + Proposal Stage (right)
      // ═══════════════════════════════════════════════════════════════════════
      const twoColY = y;
      
      // LEFT: Stage Distribution
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('STAGE DISTRIBUTION', LEFT, twoColY);
      
      // Table header
      let tableY = twoColY + 14;
      doc.font(fontBold).fontSize(10).fillColor(MEDIUM_TEXT);
      doc.text('Stage', LEFT, tableY);
      doc.text('Deals', LEFT + 110, tableY, { width: 40, align: 'right' });
      doc.text('Gross ACV', LEFT + 155, tableY, { width: 55, align: 'right' });
      doc.text('Weighted', LEFT + 210, tableY, { width: 50, align: 'right' });
      
      tableY += 12;
      doc.strokeColor(BORDER_GRAY).lineWidth(1).moveTo(LEFT, tableY).lineTo(LEFT + halfWidth, tableY).stroke();
      tableY += 8;
      
      // Table rows
      const stageOrder = [...ACTIVE_STAGES].reverse();
      doc.font(fontRegular).fontSize(12).fillColor(BODY_TEXT);
      stageOrder.forEach(stage => {
        const data = stageBreakdown[stage] || { count: 0, grossACV: 0, weightedACV: 0 };
        const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
        doc.text(stageLabel, LEFT, tableY);
        doc.text(data.count.toString(), LEFT + 110, tableY, { width: 40, align: 'right' });
        doc.text(formatCurrency(data.grossACV), LEFT + 155, tableY, { width: 55, align: 'right' });
        doc.text(formatCurrency(data.weightedACV), LEFT + 210, tableY, { width: 50, align: 'right' });
        tableY += 18;
        doc.strokeColor(LIGHT_BORDER).lineWidth(0.5).moveTo(LEFT, tableY - 4).lineTo(LEFT + halfWidth, tableY - 4).stroke();
      });
      
      // RIGHT: Proposal Stage (S4)
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('PROPOSAL STAGE (S4)', RIGHT_COL, twoColY);
      
      // Proposal table header
      let propTableY = twoColY + 14;
      doc.font(fontBold).fontSize(10).fillColor(MEDIUM_TEXT);
      doc.text('Metric', RIGHT_COL, propTableY);
      doc.text('Deals', RIGHT_COL + 90, propTableY, { width: 40, align: 'right' });
      doc.text('Gross ACV', RIGHT_COL + 135, propTableY, { width: 55, align: 'right' });
      doc.text('Wtd ACV', RIGHT_COL + 195, propTableY, { width: 50, align: 'right' });
      
      propTableY += 12;
      doc.strokeColor(BORDER_GRAY).lineWidth(1).moveTo(RIGHT_COL, propTableY).lineTo(LEFT + PAGE_WIDTH, propTableY).stroke();
      propTableY += 8;
      
      // Proposal rows
      doc.font(fontRegular).fontSize(12).fillColor(BODY_TEXT);
      const s4Data = stageBreakdown['Stage 4 - Proposal'] || { weightedACV: 0 };
      
      // Total
      doc.text('Total', RIGHT_COL, propTableY);
      doc.text(totals.proposalCount.toString(), RIGHT_COL + 90, propTableY, { width: 40, align: 'right' });
      doc.text(formatCurrency(totals.proposalGrossACV), RIGHT_COL + 135, propTableY, { width: 55, align: 'right' });
      doc.text(formatCurrency(s4Data.weightedACV), RIGHT_COL + 195, propTableY, { width: 50, align: 'right' });
      propTableY += 18;
      doc.strokeColor(LIGHT_BORDER).lineWidth(0.5).moveTo(RIGHT_COL, propTableY - 4).lineTo(LEFT + PAGE_WIDTH, propTableY - 4).stroke();
      
      // This Month
      doc.text('This Month', RIGHT_COL, propTableY);
      doc.text(totals.proposalThisMonthCount.toString(), RIGHT_COL + 90, propTableY, { width: 40, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisMonthACV), RIGHT_COL + 135, propTableY, { width: 55, align: 'right' });
      doc.text('—', RIGHT_COL + 195, propTableY, { width: 50, align: 'right' });
      propTableY += 18;
      doc.strokeColor(LIGHT_BORDER).lineWidth(0.5).moveTo(RIGHT_COL, propTableY - 4).lineTo(LEFT + PAGE_WIDTH, propTableY - 4).stroke();
      
      // This Quarter
      doc.text('This Quarter', RIGHT_COL, propTableY);
      doc.text(totals.proposalThisQuarterCount.toString(), RIGHT_COL + 90, propTableY, { width: 40, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisQuarterGrossACV), RIGHT_COL + 135, propTableY, { width: 55, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisQuarterWeightedACV || 0), RIGHT_COL + 195, propTableY, { width: 50, align: 'right' });
      propTableY += 22;
      
      // Targeting This Month box (green background with green left border)
      if (proposalThisMonth && proposalThisMonth.length > 0) {
        const boxX = RIGHT_COL;
        const boxY = propTableY;
        const boxWidth = PAGE_WIDTH / 2 - 10;
        const boxHeight = Math.min(proposalThisMonth.length, 6) * 14 + 30;
        
        // Green background
        doc.rect(boxX, boxY, boxWidth, boxHeight).fill(GREEN_BG);
        // Green left border
        doc.rect(boxX, boxY, 3, boxHeight).fill(GREEN_ACCENT);
        
        // Title
        doc.font(fontBold).fontSize(11).fillColor(GREEN_ACCENT);
        doc.text('TARGETING THIS MONTH', boxX + 12, boxY + 10);
        
        // Deal list
        doc.font(fontRegular).fontSize(11).fillColor(BODY_TEXT);
        let dealY = boxY + 26;
        const dealsToShow = proposalThisMonth.slice(0, 5);
        dealsToShow.forEach(d => {
          const name = d.accountName.length > 18 ? d.accountName.substring(0, 18) + '...' : d.accountName;
          doc.text(`${name} • ${formatCurrency(d.acv)} • ${formatDate(d.targetDate)}`, boxX + 12, dealY);
          dealY += 14;
        });
        if (proposalThisMonth.length > 5) {
          doc.fillColor(MEDIUM_TEXT);
          doc.text(`+${proposalThisMonth.length - 5} more deals`, boxX + 12, dealY);
        }
        propTableY += boxHeight + 10;
      }
      
      y = Math.max(tableY, propTableY) + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BUSINESS LEAD SUMMARY
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BUSINESS LEAD SUMMARY', LEFT, y);
      y += 16;
      
      // Helper function to draw BL table with right-aligned numbers
      const drawBLTable = (title, blList, startX, startY, colWidth) => {
        const activeBLs = blList
          .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
          .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
        
        if (activeBLs.length === 0) return startY;
        
        // Pod title (green)
        doc.font(fontBold).fontSize(11).fillColor(GREEN_ACCENT);
        doc.text(title, startX, startY);
        
        // Table header
        let headerY = startY + 14;
        doc.font(fontBold).fontSize(10).fillColor(MEDIUM_TEXT);
        doc.text('Name', startX, headerY);
        doc.text('Accts', startX + 60, headerY, { width: 35, align: 'right' });
        doc.text('Opps', startX + 100, headerY, { width: 35, align: 'right' });
        doc.text('Gross', startX + 140, headerY, { width: 50, align: 'right' });
        doc.text('Wtd', startX + 195, headerY, { width: 45, align: 'right' });
        
        headerY += 12;
        doc.strokeColor(BORDER_GRAY).lineWidth(1).moveTo(startX, headerY).lineTo(startX + colWidth - 10, headerY).stroke();
        
        let rowY = headerY + 6;
        doc.font(fontRegular).fontSize(11).fillColor(BODY_TEXT);
        activeBLs.forEach(bl => {
          const m = blMetrics[bl];
          const displayName = bl.split(' ')[0];
          doc.text(displayName, startX, rowY);
          doc.text(m.accounts.toString(), startX + 60, rowY, { width: 35, align: 'right' });
          doc.text(m.opportunities.toString(), startX + 100, rowY, { width: 35, align: 'right' });
          doc.text(formatCurrency(m.grossACV), startX + 140, rowY, { width: 50, align: 'right' });
          doc.text(formatCurrency(m.weightedACV), startX + 195, rowY, { width: 45, align: 'right' });
          rowY += 14;
        });
        
        return rowY;
      };
      
      const usEndY = drawBLTable('US Pod', US_POD, LEFT, y, halfWidth + 20);
      const euEndY = drawBLTable('EU Pod', EU_POD, RIGHT_COL, y, halfWidth + 20);
      
      y = Math.max(usEndY, euEndY) + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP DEALS BY BUSINESS LEAD (single section, sorted by target date)
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('TOP DEALS BY BUSINESS LEAD', LEFT, y);
      doc.font(fontRegular).fontSize(10).fillColor(LIGHT_TEXT);
      doc.text('Sorted by Target Sign Date', LEFT + 175, y + 1);
      y += 18;
      
      // Get deals sorted by target date per BL
      const dealsForTop5 = allDeals || [];
      const dealsByBL = {};
      dealsForTop5.forEach(deal => {
        const blName = deal.ownerFirstName || deal.ownerName?.split(' ')[0] || 'Unknown';
        if (!dealsByBL[blName]) dealsByBL[blName] = [];
        dealsByBL[blName].push(deal);
      });
      
      // Sort by target date and limit to 5
      Object.keys(dealsByBL).forEach(bl => {
        dealsByBL[bl].sort((a, b) => {
          if (!a.targetDate && !b.targetDate) return 0;
          if (!a.targetDate) return 1;
          if (!b.targetDate) return -1;
          return new Date(a.targetDate) - new Date(b.targetDate);
        });
        dealsByBL[bl] = dealsByBL[bl].slice(0, 5);
      });
      
      // Sort BLs by total ACV
      const sortedBLs = Object.keys(dealsByBL)
        .map(bl => ({ name: bl, deals: dealsByBL[bl], totalACV: dealsByBL[bl].reduce((sum, d) => sum + (d.acv || 0), 0) }))
        .sort((a, b) => b.totalACV - a.totalACV);
      
      // Split into 2 columns (4 BLs each)
      const leftBLs = sortedBLs.filter((_, i) => i % 2 === 0).slice(0, 4);
      const rightBLs = sortedBLs.filter((_, i) => i % 2 === 1).slice(0, 4);
      
      // Draw BL deals
      const drawDealsColumn = (bls, startX, startY, maxWidth) => {
        let dealY = startY;
        
        bls.forEach(bl => {
          if (bl.deals.length === 0) return;
          
          // BL Name (green)
          doc.font(fontBold).fontSize(12).fillColor(GREEN_ACCENT);
          doc.text(bl.name, startX, dealY);
          dealY += 14;
          
          // Deals
          doc.font(fontRegular).fontSize(11).fillColor(BODY_TEXT);
          bl.deals.forEach(deal => {
            const name = deal.accountName.length > 20 ? deal.accountName.substring(0, 20) + '...' : deal.accountName;
            doc.text(`${name} • ${formatCurrency(deal.acv)} • ${formatDate(deal.targetDate)}`, startX, dealY);
            dealY += 13;
          });
          
          dealY += 16;  // Gap between BLs
        });
        
        return dealY;
      };
      
      const dealsStartY = y;
      const leftEndY = drawDealsColumn(leftBLs, LEFT, dealsStartY, halfWidth);
      const rightEndY = drawDealsColumn(rightBLs, RIGHT_COL, dealsStartY, halfWidth);
      
      y = Math.max(leftEndY, rightEndY);
      
      // ═══════════════════════════════════════════════════════════════════════
      // FOOTER - Simple gray border-top with centered text
      // ═══════════════════════════════════════════════════════════════════════
      const footerY = y + 10;
      doc.strokeColor(BORDER_GRAY).lineWidth(1).moveTo(LEFT, footerY).lineTo(LEFT + PAGE_WIDTH, footerY).stroke();
      
      doc.font(fontRegular).fontSize(10).fillColor(LIGHT_TEXT);
      doc.text('Generated by Eudia GTM Brain • www.eudia.com • Internal use only', LEFT, footerY + 8, { width: PAGE_WIDTH, align: 'center' });
      
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
