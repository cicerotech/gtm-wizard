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
    logger.info('✅ Snapshots saved to file');
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
 * Get snapshot from a specific date
 */
function getSnapshot(date) {
  const data = readSnapshots();
  return data.snapshots[date] || null;
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
 * Query accounts and opportunities per BL from Salesforce
 * Returns: { "BL Name": { accounts: N, opportunities: N }, ... }
 */
async function queryBLMetrics() {
  try {
    logger.info('📊 Querying BL metrics from Salesforce...');
    
    // Query all open opportunities with owner and account info
    // We need to count unique accounts per owner
    const soql = `
      SELECT Owner.Name, AccountId, Account.Name
      FROM Opportunity
      WHERE IsClosed = false
      ORDER BY Owner.Name
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No opportunity records found');
      return {};
    }
    
    logger.info(`📊 Found ${result.totalSize} open opportunities`);
    
    // Aggregate by owner
    const blMetrics = {};
    
    result.records.forEach(opp => {
      const ownerName = opp.Owner?.Name;
      const accountId = opp.AccountId;
      
      if (!ownerName) return;
      
      // Initialize BL if not exists
      if (!blMetrics[ownerName]) {
        blMetrics[ownerName] = {
          accounts: new Set(),
          opportunities: 0
        };
      }
      
      // Add account to set (for unique count) and increment opp count
      blMetrics[ownerName].accounts.add(accountId);
      blMetrics[ownerName].opportunities++;
    });
    
    // Convert Sets to counts
    const finalMetrics = {};
    Object.entries(blMetrics).forEach(([bl, data]) => {
      finalMetrics[bl] = {
        accounts: data.accounts.size,
        opportunities: data.opportunities
      };
    });
    
    logger.info('📊 BL Metrics computed:', finalMetrics);
    return finalMetrics;
    
  } catch (error) {
    logger.error('Failed to query BL metrics:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format change indicator with sign
 */
function formatChange(current, previous) {
  if (previous === undefined || previous === null) {
    return '(new)';
  }
  
  const diff = current - previous;
  if (diff === 0) {
    return '(+0)';
  } else if (diff > 0) {
    return `(+${diff})`;
  } else {
    return `(${diff})`;
  }
}

/**
 * Format a single BL line for the message
 */
function formatBLLine(blName, current, previous, capacityAlerts) {
  const currentAccounts = current?.accounts || 0;
  const currentOpps = current?.opportunities || 0;
  const previousAccounts = previous?.accounts;
  const previousOpps = previous?.opportunities;
  
  const accountChange = formatChange(currentAccounts, previousAccounts);
  const oppChange = formatChange(currentOpps, previousOpps);
  
  // Check for capacity alert
  const accountDiff = previousAccounts !== undefined ? currentAccounts - previousAccounts : 0;
  let alertFlag = '';
  if (accountDiff >= CAPACITY_ALERT_THRESHOLD) {
    alertFlag = ' [!]';
    capacityAlerts.push({ name: blName, change: accountDiff });
  }
  
  // Get first name for display
  const firstName = blName.split(' ')[0];
  
  return `• ${firstName} — ${currentAccounts} accounts ${accountChange}${alertFlag}, ${currentOpps} opps ${oppChange}`;
}

/**
 * Format the complete Slack message
 */
function formatSlackMessage(currentMetrics, previousMetrics, dateStr) {
  const capacityAlerts = [];
  
  let message = `*Weekly BL Summary — ${dateStr}*\n\n`;
  
  // US Pod
  message += '*US Pod*\n';
  US_POD.forEach(bl => {
    const current = currentMetrics[bl] || { accounts: 0, opportunities: 0 };
    const previous = previousMetrics ? previousMetrics[bl] : null;
    message += formatBLLine(bl, current, previous, capacityAlerts) + '\n';
  });
  
  message += '\n';
  
  // EU Pod
  message += '*EU Pod*\n';
  EU_POD.forEach(bl => {
    const current = currentMetrics[bl] || { accounts: 0, opportunities: 0 };
    const previous = previousMetrics ? previousMetrics[bl] : null;
    message += formatBLLine(bl, current, previous, capacityAlerts) + '\n';
  });
  
  // Add capacity alerts if any
  if (capacityAlerts.length > 0) {
    message += '\n';
    message += '_Capacity alerts:_\n';
    capacityAlerts.forEach(alert => {
      message += `• ${alert.name.split(' ')[0]} +${alert.change} accounts this week\n`;
    });
  }
  
  // Add footer with context
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
    logger.info('📊 Generating weekly BL summary...');
    
    // Get current date string (YYYY-MM-DD)
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Query current metrics from Salesforce
    const currentMetrics = await queryBLMetrics();
    
    // Get previous week's snapshot
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`📊 Previous snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the message
    const message = formatSlackMessage(currentMetrics, previousMetrics, displayDate);
    
    // Save current snapshot (before sending to ensure data is captured)
    saveSnapshot(dateStr, currentMetrics);
    
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
    
    logger.info(`✅ Weekly BL summary sent to ${channel}`);
    
    return {
      success: true,
      channel,
      dateStr,
      blCount: Object.keys(currentMetrics).length,
      message
    };
    
  } catch (error) {
    logger.error('❌ Failed to send weekly BL summary:', error);
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
    logger.info('⏰ Running scheduled BL weekly summary (Thursday 9 AM EST)');
    
    try {
      await sendBLWeeklySummary(app, false); // Production mode
      logger.info('✅ Scheduled BL weekly summary completed');
    } catch (error) {
      logger.error('❌ Scheduled BL weekly summary failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('📅 BL Weekly Summary scheduled (Thursday 9 AM EST)');
}

/**
 * Manual trigger for testing
 */
async function sendBLSummaryNow(app, testMode = true) {
  logger.info(`📧 Sending BL summary now (test mode: ${testMode})`);
  return await sendBLWeeklySummary(app, testMode);
}

/**
 * Get current snapshot data (for debugging/testing)
 */
function getSnapshotData() {
  return readSnapshots();
}

module.exports = {
  scheduleBLWeeklySummary,
  sendBLSummaryNow,
  sendBLWeeklySummary,
  queryBLMetrics,
  getSnapshotData,
  formatSlackMessage,
  // Exported for testing
  US_POD,
  EU_POD,
  CAPACITY_ALERT_THRESHOLD
};

