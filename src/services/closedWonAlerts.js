/**
 * Closed Won Alerts - Platform Event Subscriber
 * 
 * Listens for Closed_Won_Alert__e Platform Events from Salesforce
 * and posts deal win notifications to Slack.
 */

const logger = require('../utils/logger');

// Channel to post alerts to (set via env var, defaults to test channel)
const ALERT_CHANNEL = process.env.CLOSED_WON_ALERT_CHANNEL || null;
const ALERT_USER = process.env.CLOSED_WON_ALERT_USER || null; // For DM testing

/**
 * Subscribe to Closed Won Platform Events
 */
async function subscribeToClosedWonEvents(app) {
  try {
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    if (!conn || !conn.streaming) {
      logger.warn('Salesforce connection not available for Platform Event subscription');
      return;
    }

    const channel = '/event/Closed_Won_Alert__e';
    
    logger.info(`Subscribing to Platform Event: ${channel}`);
    
    conn.streaming.topic(channel).subscribe(async (message) => {
      try {
        logger.info('Received Closed Won Alert:', JSON.stringify(message));
        await handleClosedWonEvent(app, message);
      } catch (error) {
        logger.error('Error handling Closed Won event:', error);
      }
    });
    
    logger.info('Successfully subscribed to Closed Won Platform Events');
    
  } catch (error) {
    logger.error('Failed to subscribe to Platform Events:', error);
  }
}

/**
 * Handle incoming Closed Won event and post to Slack
 */
async function handleClosedWonEvent(app, message) {
  const payload = message.payload;
  
  // Extract fields from Platform Event
  const accountName = payload.Account_Name__c || 'Unknown Account';
  const oppName = payload.Opportunity_Name__c || 'Unknown Deal';
  const productLine = payload.Product_Line__c || 'Not specified';
  const acv = payload.ACV__c || 0;
  const closeDate = payload.Close_Date__c || 'Not specified';
  const revenueType = payload.Revenue_Type__c || 'Not specified';
  const ownerId = payload.Owner_Name__c || ''; // This contains OwnerId
  const isEudiaCounselOpp = payload.Eudia_Counsel_Opp__c === true;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIDENTIAL DEAL DETECTION (Eudia Counsel)
  // ═══════════════════════════════════════════════════════════════════════════
  // Some clients have privacy/confidentiality agreements (Eudia Counsel).
  // For these deals, we REPLACE the account name with the codename from the opp name.
  // 
  // Conditions for confidentiality:
  // 1. Eudia_Counsel_Opp__c checkbox is true, OR
  // 2. Opportunity name contains "(EC)" or any parentheses with content
  //
  // Example: "Pluto (EC) - Contracting" on account "Petsmart"
  //   → Client: Pluto (EC)      ← codename replaces real client
  //   → Deal: Contracting       ← remainder of opp name
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hasCodename = /\([^)]+\)/.test(oppName); // Contains parentheses like (EC), (Project X), etc.
  const isConfidential = isEudiaCounselOpp || hasCodename;
  
  let displayAccountName = accountName;
  let displayOppName = oppName;
  
  if (isConfidential) {
    logger.info(`Confidential deal detected: ${oppName} (EudiaCounsel: ${isEudiaCounselOpp}, Codename: ${hasCodename})`);
    
    // Extract codename and deal type from opportunity name
    // Pattern: "Codename (EC) - Deal Type" or "Codename (EC)"
    const oppParts = oppName.split(/\s*-\s*/);
    
    if (oppParts.length >= 2) {
      // "Pluto (EC) - Contracting" → Client: "Pluto (EC)", Deal: "Contracting"
      displayAccountName = oppParts[0].trim();
      displayOppName = oppParts.slice(1).join(' - ').trim();
    } else {
      // Just "Pluto (EC)" with no dash → use full name as client
      displayAccountName = oppName;
      displayOppName = 'Eudia Counsel';
    }
    
    logger.info(`Confidential display: Client="${displayAccountName}", Deal="${displayOppName}"`);
  }
  
  // Look up owner name from ID if we have it
  let ownerName = 'Unknown';
  if (ownerId && ownerId.startsWith('005')) {
    try {
      const { query } = require('../salesforce/connection');
      const result = await query(`SELECT Name FROM User WHERE Id = '${ownerId}' LIMIT 1`);
      if (result.records && result.records.length > 0) {
        ownerName = result.records[0].Name;
      }
    } catch (error) {
      logger.warn('Could not look up owner name:', error.message);
    }
  }
  
  // Format currency
  const formattedACV = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(acv);
  
  // Format the message
  const slackMessage = formatClosedWonMessage({
    accountName: displayAccountName,
    oppName: displayOppName,
    productLine,
    acv: formattedACV,
    closeDate,
    revenueType,
    ownerName,
    isConfidential
  });
  
  // Determine where to send
  let targetChannel = ALERT_CHANNEL;
  
  // If no channel configured, try DM to specific user
  if (!targetChannel && ALERT_USER) {
    targetChannel = ALERT_USER;
  }
  
  // If still no target, log and skip
  if (!targetChannel) {
    logger.warn('No CLOSED_WON_ALERT_CHANNEL or CLOSED_WON_ALERT_USER configured. Skipping Slack notification.');
    logger.info('Would have posted:', slackMessage);
    return;
  }
  
  try {
    await app.client.chat.postMessage({
      channel: targetChannel,
      text: slackMessage,
      unfurl_links: false
    });
    
    const logName = isConfidential ? `[CONFIDENTIAL] ${oppName}` : accountName;
    logger.info(`Closed Won alert posted to ${targetChannel} for ${logName}`);
  } catch (error) {
    logger.error('Failed to post Closed Won alert to Slack:', error);
  }
}

/**
 * Format the Slack message for a closed won deal
 * 
 * @param {Object} params - Message parameters
 * @param {string} params.accountName - Account name (or "[Confidential - Eudia Counsel]" for confidential deals)
 * @param {string} params.oppName - Opportunity name
 * @param {string} params.productLine - Product line
 * @param {string} params.acv - Formatted ACV
 * @param {string} params.closeDate - Close date
 * @param {string} params.revenueType - Revenue type
 * @param {string} params.ownerName - Deal owner name
 * @param {boolean} params.isConfidential - Whether this is a confidential deal
 */
function formatClosedWonMessage({ accountName, oppName, productLine, acv, closeDate, revenueType, ownerName, isConfidential = false }) {
  // Format revenue type display
  let typeDisplay = revenueType;
  if (revenueType === 'Recurring') typeDisplay = 'Recurring (ARR)';
  if (revenueType === 'Commitment') typeDisplay = 'LOI';
  if (revenueType === 'Project') typeDisplay = 'Project';
  
  // Build the message
  let message = `*A Deal has been Won!*\n\n`;
  
  message += `*Client:* ${accountName}\n`;
  message += `*Deal:* ${oppName}\n`;
  message += `*ACV:* ${acv}\n`;
  message += `*Type:* ${typeDisplay}\n`;
  message += `*Product Line:* ${productLine}\n`;
  message += `*Close Date:* ${closeDate}\n`;
  message += `*Deal Owner:* ${ownerName}`;
  
  // Add confidentiality note for private deals
  if (isConfidential) {
    message += `\n\n_This client has a confidentiality agreement._`;
  }
  
  return message;
}

module.exports = {
  subscribeToClosedWonEvents,
  handleClosedWonEvent,
  formatClosedWonMessage
};

