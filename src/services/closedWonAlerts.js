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
    accountName,
    oppName,
    productLine,
    acv: formattedACV,
    closeDate,
    revenueType,
    ownerName
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
    
    logger.info(`Closed Won alert posted to ${targetChannel} for ${accountName}`);
  } catch (error) {
    logger.error('Failed to post Closed Won alert to Slack:', error);
  }
}

/**
 * Format the Slack message for a closed won deal
 */
function formatClosedWonMessage({ accountName, oppName, productLine, acv, closeDate, revenueType, ownerName }) {
  // Format revenue type display
  let typeDisplay = revenueType;
  if (revenueType === 'Recurring') typeDisplay = 'Recurring (ARR)';
  if (revenueType === 'Commitment') typeDisplay = 'LOI';
  if (revenueType === 'Project') typeDisplay = 'Project';
  
  return `*A Deal has been Won!*

*Client:* ${accountName}
*Deal:* ${oppName}
*ACV:* ${acv}
*Type:* ${typeDisplay}
*Product Line:* ${productLine}
*Close Date:* ${closeDate}
*Deal Owner:* ${ownerName}`;
}

module.exports = {
  subscribeToClosedWonEvents,
  handleClosedWonEvent,
  formatClosedWonMessage
};

