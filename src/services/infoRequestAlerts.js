/**
 * Info Request Alerts - Platform Event Subscriber
 * 
 * Listens for Info_Request__e Platform Events from Salesforce
 * and posts notification to admin (Keigan) via Slack DM.
 * 
 * Triggered when a rep clicks "Request Info" on an Account record page.
 */

const logger = require('../utils/logger');

const ADMIN_USER_ID = process.env.INFO_REQUEST_ADMIN || 'U094AQE9V7D';

let isSubscribed = false;

const processedEvents = new Map();
const DEDUP_TTL_MS = 60000;

function cleanupProcessedEvents() {
  const now = Date.now();
  for (const [replayId, timestamp] of processedEvents) {
    if (now - timestamp > DEDUP_TTL_MS) {
      processedEvents.delete(replayId);
    }
  }
}

async function subscribeToInfoRequestEvents(app) {
  if (isSubscribed) {
    logger.warn('Already subscribed to Info Request Platform Events');
    return;
  }
  
  try {
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    if (!conn || !conn.streaming) {
      logger.warn('Salesforce connection not available for Info Request Platform Event subscription');
      return;
    }

    const channel = '/event/Info_Request__e';
    
    logger.info(`Subscribing to Platform Event: ${channel}`);
    
    conn.streaming.topic(channel).subscribe(async (message) => {
      try {
        const replayId = message.event?.replayId;
        
        if (replayId && processedEvents.has(replayId)) {
          logger.info(`Skipping duplicate Info Request event (ReplayId: ${replayId})`);
          return;
        }
        
        if (replayId) {
          processedEvents.set(replayId, Date.now());
          cleanupProcessedEvents();
        }
        
        logger.info('[InfoRequest] Received Info Request event:', JSON.stringify(message));
        await handleInfoRequestEvent(app, message);
      } catch (error) {
        logger.error('[InfoRequest] Error handling event:', error);
      }
    });
    
    isSubscribed = true;
    logger.info('Successfully subscribed to Info Request Platform Events');
    
  } catch (error) {
    logger.error('Failed to subscribe to Info Request Platform Events:', error);
  }
}

async function handleInfoRequestEvent(app, message) {
  const payload = message.payload;
  
  const accountName = payload.Account_Name__c || 'Unknown Account';
  const accountId = payload.Account_Id__c || '';
  const requestTypes = payload.Request_Types__c || 'Not specified';
  const additionalDetail = payload.Additional_Detail__c || '';
  const requestedBy = payload.Requested_By__c || 'Unknown';
  const accountOwner = payload.Account_Owner__c || 'Unknown';
  
  const accountUrl = accountId 
    ? `https://eudia.lightning.force.com/lightning/r/Account/${accountId}/view`
    : '';

  let slackText = `*Account Info Request*\n`;
  slackText += `*Account:* <${accountUrl}|${accountName}> (${accountOwner})\n`;
  slackText += `*Requested:* ${requestTypes}\n`;
  if (additionalDetail) {
    slackText += `*Detail:* ${additionalDetail}\n`;
  }
  slackText += `*From:* ${requestedBy}`;

  try {
    await app.client.chat.postMessage({
      channel: ADMIN_USER_ID,
      text: slackText,
      unfurl_links: false
    });
    
    logger.info(`[InfoRequest] Slack DM sent to admin for ${accountName} (requested by ${requestedBy})`);
  } catch (error) {
    logger.error(`[InfoRequest] Failed to send Slack DM:`, error.message);
  }
}

module.exports = {
  subscribeToInfoRequestEvents
};
