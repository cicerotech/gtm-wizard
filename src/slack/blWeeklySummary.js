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
 * Query closed-won deals for this fiscal quarter
 */
async function querySignedDeals() {
  try {
    logger.info('Querying signed deals from Salesforce...');
    
    // Get fiscal quarter date range (Q4: Nov 1 - Jan 31)
    const fiscalQEnd = getFiscalQuarterEnd();
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
      SELECT AccountId, Account.Name, ACV__c, CloseDate, Revenue_Type__c, Owner.Name
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
 * Process signed deals data
 */
function processSignedDeals(records) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  
  let totalCount = 0;
  let totalACV = 0;
  let recurringACV = 0;
  let projectACV = 0;
  let thisMonthCount = 0;
  let thisMonthACV = 0;
  const uniqueAccounts = new Set();
  const thisMonthAccounts = new Set();
  
  records.forEach(opp => {
    const acv = opp.ACV__c || 0;
    const closeDate = opp.CloseDate ? new Date(opp.CloseDate) : null;
    const revenueType = opp.Revenue_Type__c || '';
    const accountId = opp.AccountId;
    
    totalCount++;
    totalACV += acv;
    uniqueAccounts.add(accountId);
    
    // Revenue type breakdown
    if (revenueType.toLowerCase().includes('recurring')) {
      recurringACV += acv;
    } else {
      projectACV += acv;
    }
    
    // This month check
    if (closeDate && closeDate.getMonth() === thisMonth && closeDate.getFullYear() === thisYear) {
      thisMonthCount++;
      thisMonthACV += acv;
      thisMonthAccounts.add(accountId);
    }
  });
  
  return {
    totalLogos: uniqueAccounts.size,
    totalDeals: totalCount,
    totalACV,
    recurringACV,
    projectACV,
    thisMonthLogos: thisMonthAccounts.size,
    thisMonthDeals: thisMonthCount,
    thisMonthACV
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
  let totalGrossACV = 0;
  let totalWeightedACV = 0;
  let totalWeightedThisQuarter = 0;
  const allAccountIds = new Set();
  
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
  
  // Calculate proposal stage totals
  const proposalGrossACV = proposalDeals.reduce((sum, d) => sum + d.acv, 0);
  
  // Calculate proposal targeting this month vs this quarter
  const proposalThisMonth = proposalDeals.filter(d => isInCurrentMonth(d.targetDate));
  const proposalThisQuarter = proposalDeals.filter(d => isInCurrentFiscalQuarter(d.targetDate));
  
  return {
    blMetrics: finalBLMetrics,
    proposalDeals,
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
 */
function generatePDFSnapshot(pipelineData, dateStr, signedData = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { blMetrics, stageBreakdown, totals, fiscalQuarterLabel, proposalThisMonth } = pipelineData;
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 36, bottom: 36, left: 48, right: 48 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Fonts
      const fontRegular = 'Helvetica';
      const fontBold = 'Helvetica-Bold';
      
      // Layout constants - surgical positioning
      const LEFT = 48;
      const CENTER_SPLIT = 295;  // Page center divider
      const RIGHT = CENTER_SPLIT + 20;
      const PAGE_WIDTH = 516;    // Total usable width (612 - 48*2)
      const COL_WIDTH = PAGE_WIDTH / 2 - 10;
      
      // ═══════════════════════════════════════════════════════════════════════
      // HEADER
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(18).fillColor(DARK_GRAY);
      doc.text('Eudia GTM Weekly Snapshot', LEFT, 36, { width: PAGE_WIDTH, align: 'center' });
      doc.font(fontRegular).fontSize(10).fillColor(MEDIUM_GRAY);
      doc.text(dateStr, LEFT, doc.y + 2, { width: PAGE_WIDTH, align: 'center' });
      
      // Teal accent line
      const headerLineY = doc.y + 10;
      doc.strokeColor(TEAL_ACCENT).lineWidth(2).moveTo(LEFT, headerLineY).lineTo(LEFT + PAGE_WIDTH, headerLineY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 1: PIPELINE OVERVIEW (left) + SIGNED THIS QUARTER (right)
      // ═══════════════════════════════════════════════════════════════════════
      const row1Y = headerLineY + 16;
      
      // LEFT: Pipeline Overview
      doc.font(fontBold).fontSize(9).fillColor(DARK_GRAY);
      doc.text('PIPELINE OVERVIEW', LEFT, row1Y);
      
      const pipelineMetricsY = row1Y + 14;
      
      // Gross ACV
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('Total Gross ACV', LEFT, pipelineMetricsY);
      doc.font(fontBold).fontSize(15).fillColor(DARK_GRAY);
      doc.text(formatCurrency(totals.grossACV), LEFT, pipelineMetricsY + 10);
      doc.font(fontRegular).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text(`${totals.totalOpportunities} opps  •  ${totals.totalAccounts} accounts`, LEFT, pipelineMetricsY + 28);
      
      // Weighted Pipeline (2nd column of left side)
      const col2X = LEFT + 120;
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('Weighted Pipeline', col2X, pipelineMetricsY);
      doc.font(fontBold).fontSize(15).fillColor(DARK_GRAY);
      doc.text(formatCurrency(totals.weightedThisQuarter), col2X, pipelineMetricsY + 10);
      doc.font(fontRegular).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text(fiscalQuarterLabel, col2X, pipelineMetricsY + 28);
      
      // Avg Deal Size (3rd column)
      const col3X = LEFT + 210;
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('Avg Deal Size', col3X, pipelineMetricsY);
      doc.font(fontBold).fontSize(15).fillColor(DARK_GRAY);
      doc.text(formatCurrency(totals.avgDealSize), col3X, pipelineMetricsY + 10);
      
      // RIGHT: Signed This Quarter
      doc.font(fontBold).fontSize(9).fillColor(DARK_GRAY);
      doc.text('SIGNED THIS QUARTER', RIGHT, row1Y);
      
      // Signed metrics
      const signedY = row1Y + 14;
      const signedLogos = signedData.totalLogos || 0;
      const signedRevenue = signedData.totalACV || 0;
      const signedRecurring = signedData.recurringACV || 0;
      const signedProject = signedData.projectACV || 0;
      const thisMonthLogos = signedData.thisMonthLogos || 0;
      const thisMonthACV = signedData.thisMonthACV || 0;
      
      // Logos column
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('Logos', RIGHT, signedY);
      doc.font(fontBold).fontSize(15).fillColor(DARK_GRAY);
      doc.text(signedLogos.toString(), RIGHT, signedY + 10);
      doc.font(fontRegular).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text(`${thisMonthLogos} this month`, RIGHT, signedY + 28);
      
      // Revenue column
      const signedCol2 = RIGHT + 70;
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('Revenue', signedCol2, signedY);
      doc.font(fontBold).fontSize(15).fillColor(DARK_GRAY);
      doc.text(formatCurrency(signedRevenue), signedCol2, signedY + 10);
      doc.font(fontRegular).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text(`${formatCurrency(thisMonthACV)} this month`, signedCol2, signedY + 28);
      
      // Revenue type breakdown
      const signedCol3 = RIGHT + 160;
      doc.font(fontRegular).fontSize(8).fillColor(MEDIUM_GRAY);
      doc.text('By Type', signedCol3, signedY);
      doc.font(fontRegular).fontSize(9).fillColor(DARK_GRAY);
      doc.text(`Recurring: ${formatCurrency(signedRecurring)}`, signedCol3, signedY + 12);
      doc.text(`Project: ${formatCurrency(signedProject)}`, signedCol3, signedY + 24);
      
      // Divider line
      const row1EndY = pipelineMetricsY + 48;
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, row1EndY).lineTo(LEFT + PAGE_WIDTH, row1EndY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 2: STAGE DISTRIBUTION (left) + PROPOSAL STAGE (right) - matching table formats
      // ═══════════════════════════════════════════════════════════════════════
      const row2Y = row1EndY + 12;
      
      // LEFT: Stage Distribution Table
      doc.font(fontBold).fontSize(9).fillColor(DARK_GRAY);
      doc.text('STAGE DISTRIBUTION', LEFT, row2Y);
      
      // Table header
      const stageTableY = row2Y + 14;
      doc.font(fontBold).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text('Stage', LEFT, stageTableY);
      doc.text('Deals', LEFT + 90, stageTableY);
      doc.text('Gross ACV', LEFT + 130, stageTableY);
      doc.text('Weighted', LEFT + 195, stageTableY);
      
      // Header underline
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, stageTableY + 10).lineTo(LEFT + 245, stageTableY + 10).stroke();
      
      // Stage rows
      let stageRowY = stageTableY + 14;
      const stageOrder = [...ACTIVE_STAGES].reverse();
      doc.font(fontRegular).fontSize(8).fillColor(DARK_GRAY);
      stageOrder.forEach(stage => {
        const data = stageBreakdown[stage] || { count: 0, grossACV: 0, weightedACV: 0 };
        const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
        doc.text(stageLabel, LEFT, stageRowY);
        doc.text(data.count.toString(), LEFT + 90, stageRowY);
        doc.text(formatCurrency(data.grossACV), LEFT + 130, stageRowY);
        doc.text(formatCurrency(data.weightedACV), LEFT + 195, stageRowY);
        stageRowY += 12;
      });
      
      // RIGHT: Proposal Stage Table (matching format)
      doc.font(fontBold).fontSize(9).fillColor(DARK_GRAY);
      doc.text('PROPOSAL STAGE (S4)', RIGHT, row2Y);
      
      // Proposal table header
      doc.font(fontBold).fontSize(7).fillColor(MEDIUM_GRAY);
      doc.text('Metric', RIGHT, stageTableY);
      doc.text('Deals', RIGHT + 100, stageTableY);
      doc.text('Gross ACV', RIGHT + 140, stageTableY);
      doc.text('Wtd ACV', RIGHT + 205, stageTableY);
      
      // Header underline
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(RIGHT, stageTableY + 10).lineTo(RIGHT + 250, stageTableY + 10).stroke();
      
      // Proposal rows
      let propRowY = stageTableY + 14;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_GRAY);
      
      // Total S4
      doc.text('Total', RIGHT, propRowY);
      doc.text(totals.proposalCount.toString(), RIGHT + 100, propRowY);
      doc.text(formatCurrency(totals.proposalGrossACV), RIGHT + 140, propRowY);
      const s4Data = stageBreakdown['Stage 4 - Proposal'] || { weightedACV: 0 };
      doc.text(formatCurrency(s4Data.weightedACV), RIGHT + 205, propRowY);
      propRowY += 12;
      
      // This Month
      doc.text('This Month', RIGHT, propRowY);
      doc.text(totals.proposalThisMonthCount.toString(), RIGHT + 100, propRowY);
      doc.text(formatCurrency(totals.proposalThisMonthACV), RIGHT + 140, propRowY);
      doc.text('—', RIGHT + 205, propRowY);
      propRowY += 12;
      
      // This Quarter
      doc.text('This Quarter', RIGHT, propRowY);
      doc.text(totals.proposalThisQuarterCount.toString(), RIGHT + 100, propRowY);
      doc.text(formatCurrency(totals.proposalThisQuarterGrossACV), RIGHT + 140, propRowY);
      doc.text(formatCurrency(totals.proposalThisQuarterWeightedACV || 0), RIGHT + 205, propRowY);
      propRowY += 16;
      
      // Targeting This Month - deal list
      if (proposalThisMonth && proposalThisMonth.length > 0) {
        doc.font(fontBold).fontSize(7).fillColor(TEAL_ACCENT);
        doc.text('TARGETING THIS MONTH', RIGHT, propRowY);
        propRowY += 10;
        
        doc.font(fontRegular).fontSize(7).fillColor(DARK_GRAY);
        const dealsToShow = proposalThisMonth.slice(0, 5);
        dealsToShow.forEach(d => {
          const name = d.accountName.length > 18 ? d.accountName.substring(0, 18) + '...' : d.accountName;
          doc.text(`${name}  •  ${formatCurrency(d.acv)}  •  ${formatDate(d.targetDate)}`, RIGHT, propRowY);
          propRowY += 9;
        });
        if (proposalThisMonth.length > 5) {
          doc.fillColor(MEDIUM_GRAY);
          doc.text(`+${proposalThisMonth.length - 5} more deals`, RIGHT, propRowY);
        }
      }
      
      // Divider line
      const row2EndY = Math.max(stageRowY + 8, propRowY + 8);
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).moveTo(LEFT, row2EndY).lineTo(LEFT + PAGE_WIDTH, row2EndY).stroke();
      
      // ═══════════════════════════════════════════════════════════════════════
      // ROW 3: BUSINESS LEAD SUMMARY - US Pod (left) + EU Pod (right)
      // ═══════════════════════════════════════════════════════════════════════
      const row3Y = row2EndY + 12;
      
      doc.font(fontBold).fontSize(9).fillColor(DARK_GRAY);
      doc.text('BUSINESS LEAD SUMMARY', LEFT, row3Y);
      
      // Helper function to draw a BL table in a column
      const drawBLTableInColumn = (title, blList, startX, startY, colWidth) => {
        const activeBLs = blList
          .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
          .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
        
        if (activeBLs.length === 0) return startY;
        
        // Pod title
        doc.font(fontBold).fontSize(8).fillColor(TEAL_ACCENT);
        doc.text(title, startX, startY);
        
        // Table header
        const headerY = startY + 12;
        doc.font(fontBold).fontSize(6).fillColor(MEDIUM_GRAY);
        doc.text('Name', startX, headerY);
        doc.text('Accts', startX + 95, headerY);
        doc.text('Opps', startX + 125, headerY);
        doc.text('Gross', startX + 155, headerY);
        doc.text('Wtd', startX + 195, headerY);
        
        // Header line
        doc.strokeColor(LIGHT_GRAY).lineWidth(0.3).moveTo(startX, headerY + 8).lineTo(startX + 230, headerY + 8).stroke();
        
        // Rows
        let rowY = headerY + 11;
        doc.font(fontRegular).fontSize(7).fillColor(DARK_GRAY);
        activeBLs.forEach(bl => {
          const m = blMetrics[bl];
          const displayName = bl.split(' ')[0]; // First name only for compactness
          doc.text(displayName, startX, rowY);
          doc.text(m.accounts.toString(), startX + 95, rowY);
          doc.text(m.opportunities.toString(), startX + 125, rowY);
          doc.text(formatCurrency(m.grossACV), startX + 155, rowY);
          doc.text(formatCurrency(m.weightedACV), startX + 195, rowY);
          rowY += 10;
        });
        
        return rowY;
      };
      
      const blTableStartY = row3Y + 14;
      const usEndY = drawBLTableInColumn('US Pod', US_POD, LEFT, blTableStartY, COL_WIDTH);
      const euEndY = drawBLTableInColumn('EU Pod', EU_POD, RIGHT, blTableStartY, COL_WIDTH);
      
      // ═══════════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════════
      const footerY = Math.max(usEndY, euEndY) + 16;
      doc.strokeColor(TEAL_ACCENT).lineWidth(1).moveTo(LEFT, footerY).lineTo(LEFT + PAGE_WIDTH, footerY).stroke();
      
      doc.font(fontRegular).fontSize(6).fillColor(MEDIUM_GRAY);
      doc.text('Generated by Eudia GTM Brain  •  www.eudia.com  •  Internal use only', LEFT, footerY + 6, { width: PAGE_WIDTH, align: 'center' });
      
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
    
    // Query signed deals
    const signedRecords = await querySignedDeals();
    const signedData = processSignedDeals(signedRecords);
    
    // Process into metrics
    const pipelineData = processPipelineData(records);
    
    // Get previous week's snapshot
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`Previous snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the condensed Slack message
    const message = formatSlackMessage(pipelineData, previousMetrics, displayDate);
    
    // Generate PDF snapshot with signed data
    logger.info('Generating PDF snapshot...');
    const pdfBuffer = await generatePDFSnapshot(pipelineData, displayDate, signedData);
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
