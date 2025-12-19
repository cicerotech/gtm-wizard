const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { ALL_BUSINESS_LEADS, BL_ASSIGNMENTS } = require('../services/accountAssignment');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = path.join(__dirname, '../../data/bl-snapshots.json');
const GTM_CHANNEL = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || '#gtm-account-planning';
const CAPACITY_ALERT_THRESHOLD = parseInt(process.env.BL_CAPACITY_ALERT_THRESHOLD) || 10;
const MAX_LATE_STAGE_DEALS = 15; // Cap to avoid message length issues

// US and EU Pod categorization for display
const US_POD = [
  'Asad Hussain',
  'Himanshu Agarwal',
  'Julie Stefanich',
  'Olivia Jung',
  'Ananth Cherukupally',
  'Justin Hills'
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

// Late stage = Stage 4 - Proposal
const LATE_STAGE = 'Stage 4 - Proposal';

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read snapshots from file
 */
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

/**
 * Write snapshots to file
 */
function writeSnapshots(data) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
    logger.info('Snapshots saved to file');
  } catch (error) {
    logger.error('Failed to write snapshots file:', error);
    throw error;
  }
}

/**
 * Get the most recent snapshot date
 */
function getLastSnapshotDate(snapshots) {
  const dates = Object.keys(snapshots.snapshots || {}).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * Save current snapshot
 */
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

/**
 * Query all pipeline data from Salesforce with full details
 * Returns raw opportunity records for processing
 */
async function queryPipelineData() {
  try {
    logger.info('Querying pipeline data from Salesforce...');
    
    // Enhanced query with all fields needed for the summary
    const soql = `
      SELECT Owner.Name, AccountId, Account.Name, 
             ACV__c, Weighted_ACV__c, StageName,
             Target_LOI_Date__c, Product_Line__c
      FROM Opportunity
      WHERE IsClosed = false
      ORDER BY Owner.Name, Target_LOI_Date__c ASC NULLS LAST
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No opportunity records found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} open opportunities`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query pipeline data:', error);
    throw error;
  }
}

/**
 * Process raw opportunity data into metrics
 */
function processPipelineData(records) {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const currentYear = now.getFullYear();
  
  // Initialize accumulators
  const blMetrics = {};
  const lateStageDeals = [];
  let totalGrossACV = 0;
  let totalWeightedThisQuarter = 0;
  const allAccountIds = new Set();
  
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
    
    // Check if target date is this quarter for weighted calculation
    if (targetDate) {
      const targetDateObj = new Date(targetDate);
      const targetQuarter = Math.floor(targetDateObj.getMonth() / 3);
      const targetYear = targetDateObj.getFullYear();
      
      if (targetYear === currentYear && targetQuarter === currentQuarter) {
        totalWeightedThisQuarter += weightedAcv;
      }
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
    
    // Collect late stage deals (Stage 4 - Proposal)
    if (stageName === LATE_STAGE) {
      lateStageDeals.push({
        accountName,
        acv,
        targetDate,
        productLine,
        ownerName,
        ownerFirstName: ownerName.split(' ')[0]
      });
    }
  });
  
  // Convert BL Sets to counts and prepare final metrics
  const finalBLMetrics = {};
  Object.entries(blMetrics).forEach(([bl, data]) => {
    finalBLMetrics[bl] = {
      accounts: data.accounts.size,
      opportunities: data.opportunities,
      grossACV: data.grossACV
    };
  });
  
  // Sort late stage deals by target date
  lateStageDeals.sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });
  
  // Calculate late stage totals
  const lateStageGrossACV = lateStageDeals.reduce((sum, d) => sum + d.acv, 0);
  
  return {
    blMetrics: finalBLMetrics,
    lateStageDeals,
    totals: {
      grossACV: totalGrossACV,
      weightedThisQuarter: totalWeightedThisQuarter,
      totalOpportunities: records.length,
      totalAccounts: allAccountIds.size,
      avgDealSize: records.length > 0 ? totalGrossACV / records.length : 0,
      lateStageCount: lateStageDeals.length,
      lateStageGrossACV
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format currency for display
 */
function formatCurrency(amount) {
  if (!amount || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}K`;
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
 * Format a single BL line for the message
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
  
  // Get first name for display
  const firstName = blName.split(' ')[0];
  
  return `• ${firstName} — ${currentAccounts} accounts${accountChange}, ${currentOpps} opps${oppChange}, ${formatCurrency(currentACV)}${acvChange}`;
}

/**
 * Format the complete Slack message
 */
function formatSlackMessage(pipelineData, previousMetrics, dateStr) {
  const { blMetrics, lateStageDeals, totals } = pipelineData;
  
  let message = `*Weekly BL Summary — ${dateStr}*\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // HEADLINE STATS
  // ═══════════════════════════════════════════════════════════════════════
  message += '*PIPELINE SNAPSHOT*\n';
  message += `Total Gross: ${formatCurrency(totals.grossACV)} (${totals.totalOpportunities} opps / ${totals.totalAccounts} accounts)\n`;
  message += `Weighted This Quarter: ${formatCurrency(totals.weightedThisQuarter)}\n`;
  message += `Avg Deal Size: ${formatCurrency(totals.avgDealSize)}\n`;
  message += `Late Stage: ${totals.lateStageCount} deals (${formatCurrency(totals.lateStageGrossACV)})\n`;
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // US POD (sorted by gross ACV descending, filter zeros)
  // ═══════════════════════════════════════════════════════════════════════
  const usPodBLs = US_POD
    .filter(bl => {
      const metrics = blMetrics[bl];
      return metrics && (metrics.accounts > 0 || metrics.opportunities > 0);
    })
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (usPodBLs.length > 0) {
    message += '*US Pod*\n';
    usPodBLs.forEach(bl => {
      const current = blMetrics[bl];
      const previous = previousMetrics ? previousMetrics[bl] : null;
      message += formatBLLine(bl, current, previous) + '\n';
    });
    message += '\n';
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // EU POD (sorted by gross ACV descending, filter zeros)
  // ═══════════════════════════════════════════════════════════════════════
  const euPodBLs = EU_POD
    .filter(bl => {
      const metrics = blMetrics[bl];
      return metrics && (metrics.accounts > 0 || metrics.opportunities > 0);
    })
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (euPodBLs.length > 0) {
    message += '*EU Pod*\n';
    euPodBLs.forEach(bl => {
      const current = blMetrics[bl];
      const previous = previousMetrics ? previousMetrics[bl] : null;
      message += formatBLLine(bl, current, previous) + '\n';
    });
    message += '\n';
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // LATE STAGE DEALS (Stage 4 - Proposal, sorted by target date)
  // ═══════════════════════════════════════════════════════════════════════
  if (lateStageDeals.length > 0) {
    message += '*DEALS IN PROPOSAL*\n';
    
    const dealsToShow = lateStageDeals.slice(0, MAX_LATE_STAGE_DEALS);
    dealsToShow.forEach(deal => {
      const dateDisplay = formatDate(deal.targetDate);
      const productDisplay = deal.productLine ? ` | ${deal.productLine}` : '';
      message += `${dateDisplay} | ${deal.accountName} | ${formatCurrency(deal.acv)}${productDisplay} | ${deal.ownerFirstName}\n`;
    });
    
    if (lateStageDeals.length > MAX_LATE_STAGE_DEALS) {
      message += `_...and ${lateStageDeals.length - MAX_LATE_STAGE_DEALS} more_\n`;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  if (!previousMetrics) {
    message += '\n_First week - no comparison data available yet_';
  }
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate and send the weekly BL summary to Slack
 */
async function sendBLWeeklySummary(app, testMode = false) {
  try {
    logger.info('Generating weekly BL summary...');
    
    // Get current date string (YYYY-MM-DD)
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'short', 
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
    
    // Format the message
    const message = formatSlackMessage(pipelineData, previousMetrics, displayDate);
    
    // Save current snapshot (BL metrics only for comparison)
    saveSnapshot(dateStr, pipelineData.blMetrics);
    
    // Determine channel
    const channel = testMode ? 
      (process.env.TEST_CHANNEL || 'U094AQE9V7D') : // DM to Keigan in test mode
      GTM_CHANNEL;
    
    // Send to Slack
    await app.client.chat.postMessage({
      channel: channel,
      text: message,
      mrkdwn: true
    });
    
    logger.info(`Weekly BL summary sent to ${channel}`);
    
    return {
      success: true,
      channel,
      dateStr,
      blCount: Object.keys(pipelineData.blMetrics).length,
      totals: pipelineData.totals,
      message
    };
    
  } catch (error) {
    logger.error('Failed to send weekly BL summary:', error);
    throw error;
  }
}

/**
 * Schedule the weekly summary (Thursday 9 AM EST)
 */
function scheduleBLWeeklySummary(app) {
  // Thursday at 9 AM Eastern Time
  // Cron: minute hour day-of-month month day-of-week
  // 0 9 * * 4 = 9 AM on Thursdays
  
  cron.schedule('0 9 * * 4', async () => {
    logger.info('Running scheduled BL weekly summary (Thursday 9 AM EST)');
    
    try {
      await sendBLWeeklySummary(app, false); // Production mode
      logger.info('Scheduled BL weekly summary completed');
    } catch (error) {
      logger.error('Scheduled BL weekly summary failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('BL Weekly Summary scheduled (Thursday 9 AM EST)');
}

/**
 * Manual trigger for testing
 */
async function sendBLSummaryNow(app, testMode = true) {
  logger.info(`Sending BL summary now (test mode: ${testMode})`);
  return await sendBLWeeklySummary(app, testMode);
}

/**
 * Get current snapshot data (for debugging/testing)
 */
function getSnapshotData() {
  return readSnapshots();
}

/**
 * Query current metrics (for API endpoint)
 */
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
  // Exported for testing
  US_POD,
  EU_POD,
  CAPACITY_ALERT_THRESHOLD
};
