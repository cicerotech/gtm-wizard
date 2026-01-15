/**
 * Channel Monitor Service
 * Handles channel join events and registry management for intelligence scraping
 */

const logger = require('../utils/logger');
const fuzzyAccountMatcher = require('../utils/fuzzyAccountMatcher');
const intelligenceStore = require('../services/intelligenceStore');

// Common channel prefixes that indicate customer channels
const CUSTOMER_CHANNEL_PREFIXES = [
  'customer-',
  'cust-',
  'acct-',
  'account-',
  'client-',
  'ext-',
  'external-'
];

// Patterns to extract account name from channel name
const CHANNEL_NAME_PATTERNS = [
  /^(?:customer|cust|acct|account|client|ext|external)-(.+)$/i,
  /^(.+?)-(?:support|team|project|internal|external)$/i,
  /^(.+)$/i  // Fallback: use entire channel name
];

/**
 * Extract potential account name from channel name
 */
function extractAccountFromChannelName(channelName) {
  if (!channelName) return null;
  
  // Clean up channel name
  let cleaned = channelName.toLowerCase().trim();
  
  // Try each pattern
  for (const pattern of CHANNEL_NAME_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      // Clean up extracted name
      let accountName = match[1]
        .replace(/-/g, ' ')      // Replace hyphens with spaces
        .replace(/_/g, ' ')      // Replace underscores with spaces
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
      
      // Capitalize words
      accountName = accountName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return accountName;
    }
  }
  
  return null;
}

/**
 * Check if channel looks like a customer channel
 */
function isLikelyCustomerChannel(channelName) {
  if (!channelName) return false;
  
  const lower = channelName.toLowerCase();
  
  // Check for customer prefixes
  for (const prefix of CUSTOMER_CHANNEL_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true;
    }
  }
  
  // Could add more heuristics here
  return false;
}

/**
 * Register event handlers for channel monitoring
 */
function registerChannelMonitorHandlers(app) {
  // Handle bot being added to a channel
  app.event('member_joined_channel', async ({ event, client }) => {
    try {
      // Check if the bot was the one added
      const botUserId = (await client.auth.test()).user_id;
      
      if (event.user !== botUserId) {
        // Not the bot joining, ignore
        return;
      }
      
      const channelId = event.channel;
      
      // Get channel info
      const channelInfo = await client.conversations.info({ channel: channelId });
      const channelName = channelInfo.channel?.name || 'unknown';
      
      logger.info(`🤖 Bot joined channel: #${channelName} (${channelId})`);
      
      // Check if intelligence scraping is enabled
      if (process.env.INTEL_SCRAPER_ENABLED !== 'true') {
        logger.info('Intel scraper disabled, skipping channel registration');
        return;
      }
      
      // Extract potential account name
      const extractedAccountName = extractAccountFromChannelName(channelName);
      
      // Try to match to Salesforce account
      let accountId = null;
      let accountName = extractedAccountName;
      
      if (extractedAccountName) {
        try {
          const match = await fuzzyAccountMatcher.findAccount(extractedAccountName);
          if (match && match.confidence >= 0.7) {
            accountId = match.id;
            accountName = match.name;
            logger.info(`📡 Matched channel #${channelName} to account: ${accountName} (confidence: ${match.confidence})`);
          } else {
            logger.info(`📡 Could not auto-match channel #${channelName} to account (extracted: ${extractedAccountName})`);
          }
        } catch (error) {
          logger.error('Error matching account:', error);
        }
      }
      
      // Register the channel for monitoring
      await intelligenceStore.addMonitoredChannel(channelId, channelName, accountName, accountId);
      
      // Send a welcome message to the channel
      const welcomeMessage = accountId
        ? `🧠 *Intelligence Monitoring Active*\n\nThis channel is now linked to account *${accountName}*. I'll capture relevant meeting notes, deal updates, and stakeholder intel for the daily digest.\n\nTo change the linked account, use: \`/intel set-account AccountName\``
        : `🧠 *Intelligence Monitoring Active*\n\nI couldn't auto-detect which account this channel is for. Please link it manually:\n\n\`/intel set-account AccountName\``;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channelMonitor.js:welcome',message:'SENDING welcome message to channel',data:{channelId,channelName,accountName},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      await client.chat.postMessage({
        channel: channelId,
        text: welcomeMessage
      });
      
    } catch (error) {
      logger.error('Error handling member_joined_channel:', error);
    }
  });
  
  // Handle bot being removed from a channel
  app.event('member_left_channel', async ({ event, client }) => {
    try {
      // Check if the bot was the one removed
      const botUserId = (await client.auth.test()).user_id;
      
      if (event.user !== botUserId) {
        return;
      }
      
      const channelId = event.channel;
      
      logger.info(`🤖 Bot left channel: ${channelId}`);
      
      // Remove from monitoring
      await intelligenceStore.removeMonitoredChannel(channelId);
      
    } catch (error) {
      logger.error('Error handling member_left_channel:', error);
    }
  });
  
  // Handle channel rename
  app.event('channel_rename', async ({ event }) => {
    try {
      const channelId = event.channel?.id;
      const newName = event.channel?.name;
      
      if (!channelId || !newName) return;
      
      // Check if this channel is monitored
      const channel = await intelligenceStore.getMonitoredChannel(channelId);
      if (!channel) return;
      
      logger.info(`📡 Monitored channel renamed: ${channel.channel_name} -> ${newName}`);
      
      // Update the channel name and try to re-match account
      const extractedAccountName = extractAccountFromChannelName(newName);
      
      if (extractedAccountName && !channel.account_id) {
        // Try to match to account if not already matched
        try {
          const match = await fuzzyAccountMatcher.findAccount(extractedAccountName);
          if (match && match.confidence >= 0.7) {
            await intelligenceStore.updateChannelAccount(channelId, match.name, match.id);
            logger.info(`📡 Updated channel account mapping: ${newName} -> ${match.name}`);
          }
        } catch (error) {
          logger.error('Error updating channel account on rename:', error);
        }
      }
      
    } catch (error) {
      logger.error('Error handling channel_rename:', error);
    }
  });
  
  logger.info('✅ Channel monitor handlers registered');
}

/**
 * Get channel monitoring status
 */
async function getMonitoringStatus() {
  try {
    const channels = await intelligenceStore.getMonitoredChannels();
    const stats = await intelligenceStore.getIntelligenceStats();
    
    return {
      channelsMonitored: channels.length,
      channels: channels.map(c => ({
        name: c.channel_name,
        account: c.account_name,
        hasAccountId: !!c.account_id,
        lastPolled: c.last_polled
      })),
      intelligence: stats
    };
  } catch (error) {
    logger.error('Error getting monitoring status:', error);
    return { error: error.message };
  }
}

/**
 * Manually set account mapping for a channel
 */
async function setChannelAccount(channelId, accountName) {
  try {
    // Find the account in Salesforce
    const match = await fuzzyAccountMatcher.findAccount(accountName);
    
    if (!match) {
      return {
        success: false,
        error: `Could not find account matching "${accountName}" in Salesforce`
      };
    }
    
    // Update the channel mapping
    await intelligenceStore.updateChannelAccount(channelId, match.name, match.id);
    
    return {
      success: true,
      accountName: match.name,
      accountId: match.id,
      confidence: match.confidence
    };
  } catch (error) {
    logger.error('Error setting channel account:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Manually add a channel to monitoring (for existing channels)
 */
async function addChannelToMonitoring(client, channelId) {
  try {
    // Get channel info
    const channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel?.name || 'unknown';
    
    // Extract and match account
    const extractedAccountName = extractAccountFromChannelName(channelName);
    let accountId = null;
    let accountName = extractedAccountName;
    
    if (extractedAccountName) {
      const match = await fuzzyAccountMatcher.findAccount(extractedAccountName);
      if (match && match.confidence >= 0.7) {
        accountId = match.id;
        accountName = match.name;
      }
    }
    
    // Register the channel
    await intelligenceStore.addMonitoredChannel(channelId, channelName, accountName, accountId);
    
    return {
      success: true,
      channelId,
      channelName,
      accountName,
      accountId
    };
  } catch (error) {
    logger.error('Error adding channel to monitoring:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  registerChannelMonitorHandlers,
  extractAccountFromChannelName,
  isLikelyCustomerChannel,
  getMonitoringStatus,
  setChannelAccount,
  addChannelToMonitoring
};

