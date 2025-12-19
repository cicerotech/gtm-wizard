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
  let totalWeightedThisQuarter = 0;
  const allAccountIds = new Set();
  
  // Stage breakdown
  const stageBreakdown = {};
  ACTIVE_STAGES.forEach(s => {
    stageBreakdown[s] = { count: 0, grossACV: 0 };
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
    
    // Add to total gross
    totalGrossACV += acv;
    
    // Track stage breakdown
    if (stageBreakdown[stageName]) {
      stageBreakdown[stageName].count++;
      stageBreakdown[stageName].grossACV += acv;
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
        grossACV: 0
      };
    }
    
    // Add to BL metrics
    blMetrics[ownerName].accounts.add(accountId);
    blMetrics[ownerName].opportunities++;
    blMetrics[ownerName].grossACV += acv;
    
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
      grossACV: data.grossACV
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
    stageBreakdown,
    totals: {
      grossACV: totalGrossACV,
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

/**
 * Generate professional PDF snapshot
 * Times New Roman, 11pt, one-page internal memo format
 */
function generatePDFSnapshot(pipelineData, dateStr) {
  return new Promise((resolve, reject) => {
    try {
      const { blMetrics, proposalDeals, stageBreakdown, totals, fiscalQuarterLabel } = pipelineData;
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Use Times-Roman (built-in PDF font, similar to Times New Roman)
      const fontRegular = 'Times-Roman';
      const fontBold = 'Times-Bold';
      
      // Header
      doc.font(fontBold).fontSize(16).text('EUDIA GTM WEEKLY SNAPSHOT', { align: 'center' });
      doc.font(fontRegular).fontSize(11).text(dateStr, { align: 'center' });
      doc.moveDown(1);
      
      // Divider line
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);
      
      // ═══════════════════════════════════════════════════════════════════════
      // PIPELINE OVERVIEW
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(12).text('PIPELINE OVERVIEW');
      doc.moveDown(0.3);
      
      doc.font(fontRegular).fontSize(11);
      doc.text(`Total Gross ACV: ${formatCurrency(totals.grossACV)}`);
      doc.text(`Weighted Pipeline (${fiscalQuarterLabel}): ${formatCurrency(totals.weightedThisQuarter)}`);
      doc.text(`Total Opportunities: ${totals.totalOpportunities}`);
      doc.text(`Active Accounts: ${totals.totalAccounts}`);
      doc.text(`Average Deal Size: ${formatCurrency(totals.avgDealSize)}`);
      doc.moveDown(0.5);
      
      // Stage Distribution
      doc.font(fontBold).fontSize(11).text('Stage Distribution');
      doc.font(fontRegular).fontSize(10);
      
      // Reverse order to show S4 first
      const stageOrder = [...ACTIVE_STAGES].reverse();
      stageOrder.forEach(stage => {
        const data = stageBreakdown[stage] || { count: 0, grossACV: 0 };
        const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
        doc.text(`  ${stageLabel}: ${data.count} deals, ${formatCurrency(data.grossACV)}`);
      });
      doc.moveDown(0.8);
      
      // ═══════════════════════════════════════════════════════════════════════
      // PROPOSAL STAGE OPPORTUNITIES
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(12).text('PROPOSAL STAGE OPPORTUNITIES');
      doc.moveDown(0.3);
      
      doc.font(fontRegular).fontSize(11);
      doc.text(`${totals.proposalCount} deals, ${formatCurrency(totals.proposalGrossACV)} gross ACV`);
      doc.text(`Targeting This Month: ${totals.proposalThisMonthCount} deals, ${formatCurrency(totals.proposalThisMonthACV)} ACV`);
      doc.text(`Targeting This Quarter: ${totals.proposalThisQuarterCount} deals, ${formatCurrency(totals.proposalThisQuarterGrossACV)} gross, ${formatCurrency(totals.proposalThisQuarterWeightedACV)} weighted`);
      doc.moveDown(0.5);
      
      // Group proposal deals by BL
      const byOwner = {};
      proposalDeals.forEach(deal => {
        const owner = deal.ownerName;
        if (!byOwner[owner]) byOwner[owner] = [];
        byOwner[owner].push(deal);
      });
      
      // Sort owners by total ACV descending
      const sortedOwners = Object.entries(byOwner)
        .map(([owner, deals]) => ({
          owner,
          deals: deals.sort((a, b) => new Date(a.targetDate || '2099-01-01') - new Date(b.targetDate || '2099-01-01')),
          totalACV: deals.reduce((sum, d) => sum + d.acv, 0)
        }))
        .sort((a, b) => b.totalACV - a.totalACV);
      
      doc.font(fontBold).fontSize(10).text('By Business Lead (sorted by target sign date):');
      doc.moveDown(0.3);
      
      sortedOwners.forEach(({ owner, deals, totalACV }) => {
        doc.font(fontBold).fontSize(10).text(`${owner} (${deals.length} deals, ${formatCurrency(totalACV)})`);
        doc.font(fontRegular).fontSize(9);
        
        // Show top 3 deals per BL
        const dealsToShow = deals.slice(0, 3);
        dealsToShow.forEach(d => {
          doc.text(`    ${d.accountName} — ${formatCurrency(d.acv)} — ${formatDate(d.targetDate)}`);
        });
        if (deals.length > 3) {
          doc.text(`    +${deals.length - 3} more`);
        }
        doc.moveDown(0.2);
      });
      
      doc.moveDown(0.5);
      
      // ═══════════════════════════════════════════════════════════════════════
      // BUSINESS LEAD SUMMARY
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(12).text('BUSINESS LEAD SUMMARY');
      doc.moveDown(0.3);
      
      // Table header
      doc.font(fontBold).fontSize(9);
      const colX = { name: 50, accts: 200, opps: 260, acv: 320 };
      doc.text('Name', colX.name, doc.y);
      doc.text('Accounts', colX.accts, doc.y - 11);
      doc.text('Opps', colX.opps, doc.y - 11);
      doc.text('Gross ACV', colX.acv, doc.y - 11);
      doc.moveDown(0.3);
      
      // Divider
      const tableY = doc.y;
      doc.moveTo(50, tableY).lineTo(400, tableY).stroke();
      doc.moveDown(0.2);
      
      // Sort all BLs by ACV
      const allBLs = [...US_POD, ...EU_POD]
        .filter(bl => blMetrics[bl])
        .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
      
      doc.font(fontRegular).fontSize(9);
      allBLs.forEach(bl => {
        const m = blMetrics[bl];
        if (!m || (m.accounts === 0 && m.opportunities === 0)) return;
        
        const y = doc.y;
        doc.text(bl, colX.name, y);
        doc.text(m.accounts.toString(), colX.accts, y);
        doc.text(m.opportunities.toString(), colX.opps, y);
        doc.text(formatCurrency(m.grossACV), colX.acv, y);
        doc.moveDown(0.4);
      });
      
      // Footer
      doc.moveDown(1);
      doc.font(fontRegular).fontSize(8).fillColor('#666666');
      doc.text('Generated by Eudia GTM Brain — Internal use only', { align: 'center' });
      
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
 * Format condensed BL summary for Slack (one line per BL)
 */
function formatBLSummaryLine(blList, blMetrics) {
  return blList
    .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0))
    .map(bl => `${bl.split(' ')[0]} ${formatCurrency(blMetrics[bl].grossACV)}`)
    .join(' | ');
}

/**
 * Format the complete Slack message - condensed with PDF attachment
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
  message += `Avg Deal Size: ${formatCurrency(totals.avgDealSize)}\n`;
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // PROPOSAL STAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  message += `*PROPOSAL STAGE (S4)* — ${totals.proposalCount} deals, ${formatCurrency(totals.proposalGrossACV)} gross ACV\n`;
  message += `Targeting This Month: ${totals.proposalThisMonthCount} deals, ${formatCurrency(totals.proposalThisMonthACV)} ACV\n`;
  message += `Targeting This Quarter: ${totals.proposalThisQuarterCount} deals, ${formatCurrency(totals.proposalThisQuarterGrossACV)} gross, ${formatCurrency(totals.proposalThisQuarterWeightedACV)} weighted\n`;
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // CONDENSED BY BUSINESS LEAD
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY BUSINESS LEAD*\n';
  
  const usSummary = formatBLSummaryLine(US_POD, blMetrics);
  const euSummary = formatBLSummaryLine(EU_POD, blMetrics);
  
  if (usSummary) {
    message += `US: ${usSummary}\n`;
  }
  if (euSummary) {
    message += `EU: ${euSummary}\n`;
  }
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // PDF REFERENCE
  // ═══════════════════════════════════════════════════════════════════════
  message += '_See attached PDF for proposal stage details by business lead._';
  
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
    
    // Process into metrics
    const pipelineData = processPipelineData(records);
    
    // Get previous week's snapshot
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`Previous snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the condensed Slack message
    const message = formatSlackMessage(pipelineData, previousMetrics, displayDate);
    
    // Generate PDF snapshot
    logger.info('Generating PDF snapshot...');
    const pdfBuffer = await generatePDFSnapshot(pipelineData, displayDate);
    const pdfFilename = `Eudia_GTM_Weekly_Snapshot_${dateStr}.pdf`;
    
    // Save current snapshot (BL metrics only for comparison)
    saveSnapshot(dateStr, pipelineData.blMetrics);
    
    // Determine channel
    const channel = testMode ? 
      (process.env.TEST_CHANNEL || 'U094AQE9V7D') :
      GTM_CHANNEL;
    
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
