/**
 * CS Staffing Alerts - Platform Event Subscriber
 * 
 * Listens for CS_Staffing_Alert__e Platform Events from Salesforce
 * and posts staffing notifications to the CS channel in Slack.
 * 
 * Triggered when an Opportunity reaches Stage 4 (Proposal) or Stage 5 (Negotiation).
 * Only fires once per Opportunity (guarded by CS_Staffing__c checkbox in Salesforce).
 */

const logger = require('../utils/logger');

// Channel to post alerts to (set via env var)
const ALERT_CHANNEL = process.env.CS_STAFFING_ALERT_CHANNEL || null;

// Guard against double subscription
let isSubscribed = false;

// ═══════════════════════════════════════════════════════════════════════════
// EVENT DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════
// During zero-downtime deployments, Render briefly runs two instances.
// Both subscribe to Salesforce Platform Events and receive the same broadcast.
// We deduplicate by tracking each event's unique ReplayId for 60 seconds.
// ═══════════════════════════════════════════════════════════════════════════
const processedEvents = new Map(); // ReplayId -> timestamp
const DEDUP_TTL_MS = 60000; // 60 seconds

/**
 * Clean up expired entries from the deduplication cache
 */
function cleanupProcessedEvents() {
  const now = Date.now();
  for (const [replayId, timestamp] of processedEvents) {
    if (now - timestamp > DEDUP_TTL_MS) {
      processedEvents.delete(replayId);
    }
  }
}

/**
 * Subscribe to CS Staffing Platform Events
 */
async function subscribeToCSStaffingEvents(app) {
  // Prevent double subscription
  if (isSubscribed) {
    logger.warn('Already subscribed to CS Staffing Platform Events - skipping duplicate subscription');
    return;
  }
  
  try {
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    if (!conn || !conn.streaming) {
      logger.warn('Salesforce connection not available for CS Staffing Platform Event subscription');
      return;
    }

    const channel = '/event/CS_Staffing_Alert__e';
    
    logger.info(`Subscribing to Platform Event: ${channel}`);
    
    conn.streaming.topic(channel).subscribe(async (message) => {
      try {
        // Extract ReplayId for deduplication
        const replayId = message.event?.replayId;
        
        // Check if we've already processed this event (from another instance)
        if (replayId && processedEvents.has(replayId)) {
          logger.info(`Skipping duplicate CS Staffing event (ReplayId: ${replayId})`);
          return;
        }
        
        // Mark as processed before handling
        if (replayId) {
          processedEvents.set(replayId, Date.now());
          cleanupProcessedEvents(); // Prevent memory growth
        }
        
        logger.info('Received CS Staffing Alert:', JSON.stringify(message));
        await handleCSStaffingEvent(app, message);
      } catch (error) {
        logger.error('Error handling CS Staffing event:', error);
      }
    });
    
    isSubscribed = true;
    logger.info('Successfully subscribed to CS Staffing Platform Events');
    
  } catch (error) {
    logger.error('Failed to subscribe to CS Staffing Platform Events:', error);
  }
}

/**
 * Handle incoming CS Staffing event and post to Slack
 */
async function handleCSStaffingEvent(app, message) {
  const payload = message.payload;
  
  // Extract fields from Platform Event
  const opportunityId = payload.Opportunity_Id__c || '';
  const opportunityName = payload.Opportunity_Name__c || 'Unknown Opportunity';
  const accountName = payload.Account_Name__c || 'Unknown Account';
  const accountId = payload.Account_Id__c || '';
  const stageName = payload.Stage_Name__c || 'Unknown Stage';
  const acv = payload.ACV__c || 0;
  const ownerId = payload.Owner_Id__c || '';
  const productLine = payload.Product_Line__c || 'Not specified';
  const targetSignDate = payload.Target_Sign_Date__c || null;
  
  // Look up owner name from ID
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
  
  // Format target date
  let formattedTargetDate = 'Not set';
  if (targetSignDate) {
    try {
      const date = new Date(targetSignDate);
      formattedTargetDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      formattedTargetDate = targetSignDate;
    }
  }
  
  // Build Salesforce URL
  const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
  const oppUrl = `${sfBaseUrl}/lightning/r/Opportunity/${opportunityId}/view`;
  
  // Format the message
  const slackMessage = formatCSStaffingMessage({
    accountName,
    opportunityName,
    stageName,
    acv: formattedACV,
    productLine,
    ownerName,
    targetSignDate: formattedTargetDate,
    oppUrl
  });
  
  // Determine where to send
  if (!ALERT_CHANNEL) {
    logger.warn('No CS_STAFFING_ALERT_CHANNEL configured. Skipping Slack notification.');
    logger.info('Would have posted:', slackMessage);
    return;
  }
  
  try {
    await app.client.chat.postMessage({
      channel: ALERT_CHANNEL,
      text: slackMessage,
      unfurl_links: false
    });
    
    logger.info(`CS Staffing alert posted to ${ALERT_CHANNEL} for ${accountName} - ${stageName}`);
  } catch (error) {
    logger.error('Failed to post CS Staffing alert to Slack:', error);
  }
}

/**
 * Format the Slack message for a CS Staffing alert
 * 
 * @param {Object} params - Message parameters
 * @param {string} params.accountName - Account name
 * @param {string} params.opportunityName - Opportunity name
 * @param {string} params.stageName - Current stage (Stage 4 or 5)
 * @param {string} params.acv - Formatted ACV
 * @param {string} params.productLine - Product line(s)
 * @param {string} params.ownerName - Deal owner name
 * @param {string} params.targetSignDate - Target sign date
 * @param {string} params.oppUrl - Salesforce opportunity URL
 */
function formatCSStaffingMessage({ accountName, opportunityName, stageName, acv, productLine, ownerName, targetSignDate, oppUrl }) {
  // Determine stage-specific messaging
  const isProposal = stageName.includes('4');
  const stageEmoji = isProposal ? '📋' : '📝';
  const stageLabel = isProposal ? 'Proposal' : 'Negotiation';
  
  let message = `${stageEmoji} *CS Staffing Alert: ${stageLabel}*\n\n`;
  
  message += `*Account:* ${accountName}\n`;
  message += `*Opportunity:* <${oppUrl}|${opportunityName}>\n`;
  message += `*Stage:* ${stageName}\n`;
  message += `*ACV:* ${acv}\n`;
  message += `*Product Line:* ${productLine}\n`;
  message += `*Deal Owner:* ${ownerName}\n`;
  message += `*Target Sign:* ${targetSignDate}\n`;
  
  message += `\n_This deal has entered the ${stageLabel.toLowerCase()} stage and may require CS staffing planning._`;
  
  return message;
}

module.exports = {
  subscribeToCSStaffingEvents,
  handleCSStaffingEvent,
  formatCSStaffingMessage
};

