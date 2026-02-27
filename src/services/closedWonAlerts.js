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
 * Subscribe to Closed Won Platform Events
 */
async function subscribeToClosedWonEvents(app) {
  // Prevent double subscription
  if (isSubscribed) {
    logger.warn('Already subscribed to Closed Won Platform Events - skipping duplicate subscription');
    return;
  }
  
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
        // Extract ReplayId for deduplication
        const replayId = message.event?.replayId;
        
        // Check if we've already processed this event (from another instance)
        if (replayId && processedEvents.has(replayId)) {
          logger.info(`Skipping duplicate Closed Won event (ReplayId: ${replayId})`);
          return;
        }
        
        // Mark as processed before handling
        if (replayId) {
          processedEvents.set(replayId, Date.now());
          cleanupProcessedEvents(); // Prevent memory growth
        }
        
        logger.info('Received Closed Won Alert:', JSON.stringify(message));
        await handleClosedWonEvent(app, message);
      } catch (error) {
        logger.error('Error handling Closed Won event:', error);
      }
    });
    
    isSubscribed = true;
    logger.info('Successfully subscribed to Closed Won Platform Events');
    
  } catch (error) {
    logger.error('Failed to subscribe to Platform Events:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIAL DEAL OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════
// Some deals require custom messaging (e.g., finance review notes).
// Match by Account Name for simplicity (no Platform Event changes needed).
// ═══════════════════════════════════════════════════════════════════════════
const DEAL_OVERRIDES_BY_ACCOUNT = {
  'OpenAi': {
    typeOverride: 'Subject to Finance Review*',
    forceNetChangeZero: true,
    footnote: '*No incremental revenue vs. December run-rate. 21-month term secures capacity for near-term expansion.'
  },
  'Cargill': {
    footnote: 'Deal announcement delayed to confirm key deal terms. This client is affiliated with Eudia Counsel.'
  }
};

/**
 * Handle incoming Closed Won event and post to Slack
 */
async function handleClosedWonEvent(app, message) {
  const payload = message.payload;
  
  // Extract account name first for override lookup
  const accountName = payload.Account_Name__c || 'Unknown Account';
  
  // Check for special deal overrides by account name
  const override = DEAL_OVERRIDES_BY_ACCOUNT[accountName] || null;
  if (override) {
    logger.info(`Special override detected for Account "${accountName}":`, override);
  }
  
  // Extract fields from Platform Event
  const oppName = payload.Opportunity_Name__c || 'Unknown Deal';
  // Clean product line: replace underscores with spaces for display
  const productLineRaw = payload.Product_Line__c || 'Not specified';
  const productLine = productLineRaw.replace(/_/g, ' ');
  const acv = payload.ACV__c || 0;
  const closeDate = payload.Close_Date__c || 'Not specified';
  const revenueType = payload.Revenue_Type__c || 'Not specified';
  const ownerId = payload.Owner_Name__c || ''; // This contains OwnerId
  const isEudiaCounselOpp = payload.Eudia_Counsel_Opp__c === true;
  
  // New fields for Sales Type and Renewal tracking
  const salesType = payload.Sales_Type__c || 'New Business';
  const renewalNetChange = payload.Renewal_Net_Change__c || null;
  
  // Products Breakdown - itemized list when multiple products exist
  const productsBreakdown = payload.Products_Breakdown__c || null;
  
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
  
  // Format renewal net change if present
  let formattedNetChange = null;
  if (renewalNetChange !== null && renewalNetChange !== 0) {
    formattedNetChange = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.abs(renewalNetChange)); // Use absolute value, we'll add +/- in formatter
  }
  
  // Log what we received for debugging
  logger.info(`Closed Won fields - Sales Type: "${salesType}", Net Change: ${renewalNetChange}`);
  
  // Format the message
  const slackMessage = formatClosedWonMessage({
    accountName: displayAccountName,
    oppName: displayOppName,
    productLine,
    productsBreakdown,
    acv: formattedACV,
    salesType,
    renewalNetChange: override?.forceNetChangeZero ? '$0' : formattedNetChange,
    rawNetChange: override?.forceNetChangeZero ? 0 : renewalNetChange,
    closeDate,
    revenueType,
    ownerName,
    isConfidential,
    typeOverride: override?.typeOverride || null,
    footnote: override?.footnote || null
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
 * @param {string} params.accountName - Account name (or codename for confidential deals)
 * @param {string} params.oppName - Opportunity name
 * @param {string} params.productLine - Product line (single value, fallback)
 * @param {string|null} params.productsBreakdown - Itemized products with ACV (multi-product deals)
 * @param {string} params.acv - Formatted ACV
 * @param {string} params.salesType - Sales Type (New Business, Expansion, Renewal)
 * @param {string|null} params.renewalNetChange - Formatted net change for Expansion/Renewal deals
 * @param {number|null} params.rawNetChange - Raw net change value for +/- formatting
 * @param {string} params.closeDate - Close date
 * @param {string} params.revenueType - Revenue type (Recurring, Project, Commitment)
 * @param {string} params.ownerName - Deal owner name
 * @param {boolean} params.isConfidential - Whether this is a confidential deal
 * @param {string|null} params.typeOverride - Override for Type display (e.g., "Subject to Finance Review*")
 * @param {string|null} params.footnote - Custom footnote for special deals
 */
function formatClosedWonMessage({ accountName, oppName, productLine, productsBreakdown, acv, salesType, renewalNetChange, rawNetChange, closeDate, revenueType, ownerName, isConfidential = false, typeOverride = null, footnote = null }) {
  // Format revenue type display - use override if provided
  let typeDisplay = typeOverride || revenueType || 'Not specified';
  if (!typeOverride) {
    if (typeDisplay === 'Recurring, Project, or Commit') typeDisplay = 'Recurring';
    if (typeDisplay === 'Commitment') typeDisplay = 'Recurring';
  }
  
  // Build the message in requested order
  let message = `*A Deal has been Won!*\n\n`;
  
  message += `*Client:* ${accountName}\n`;
  message += `*Deal Owner:* ${ownerName}\n`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT LINE DISPLAY LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  // If productsBreakdown exists (multi-product deal), show itemized list below ACV
  // Otherwise, fall back to single Product Line field
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hasMultipleProducts = productsBreakdown && productsBreakdown.trim().length > 0;
  
  if (!hasMultipleProducts) {
    // Single product - show Product Line as before
    message += `*Product Line:* ${productLine}\n`;
  }
  
  message += `*ACV:* ${acv}\n`;

  // Show Net ACV when Renewal_Net_Change__c is populated (any sales type)
  if (renewalNetChange && rawNetChange !== null && rawNetChange !== 0) {
    message += `*Net ACV:* ${renewalNetChange}\n`;
  }
  
  // If multi-product deal, show product names only (no dollar amounts or terms)
  if (hasMultipleProducts) {
    const lines = productsBreakdown.split('\n')
      .filter(line => line.trim().startsWith('•'))
      .map(line => {
        let name = line.trim();
        // Strip dollar amounts, terms, and trailing punctuation
        // "• AI Contracting - Technology: $100,000 (12 mo)" → "• AI Contracting - Technology"
        name = name.replace(/:\s*\$[\d,.]+.*$/, '');
        // Also handle format "• Product Name ($XXK, 12 mo)"
        name = name.replace(/\s*\(\$[\d,.]+[^)]*\)\s*$/, '');
        // Also handle "• Product Name - $XXK (12 mo)"
        name = name.replace(/\s*-\s*\$[\d,.]+.*$/, '');
        return `  ${name.trim()}`;
      })
      .join('\n');
    
    if (lines) {
      message += `${lines}\n`;
    }
  }
  
  message += `*Sales Type:* ${salesType}\n`;
  message += `*Type:* ${typeDisplay}\n`;
  message += `*Close Date:* ${closeDate}`;
  
  // Add custom footnote if provided
  if (footnote) {
    message += `\n\n_${footnote}_`;
  }
  // Add confidentiality note for private deals (if no custom footnote)
  else if (isConfidential) {
    message += `\n\n_This client has a confidentiality agreement._`;
  }
  
  return message;
}

module.exports = {
  subscribeToClosedWonEvents,
  handleClosedWonEvent,
  formatClosedWonMessage
};

