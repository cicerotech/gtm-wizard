/**
 * Intelligence Digest Service
 * Daily digest generation and interactive approval workflow
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const intelligenceStore = require('../services/intelligenceStore');
const { query, sfConnection } = require('../salesforce/connection');

// Configuration
const DIGEST_CHANNEL = process.env.INTEL_DIGEST_CHANNEL;
const DIGEST_TIME = process.env.INTEL_DIGEST_TIME || '08:00';
const MAX_ITEMS_PER_ACCOUNT = 5;  // Limit items shown per account in digest

let digestSchedule = null;
let slackClient = null;

/**
 * Initialize the digest service
 */
function initialize(client) {
  slackClient = client;
  
  if (process.env.INTEL_SCRAPER_ENABLED === 'true' && DIGEST_CHANNEL) {
    scheduleDigest();
    logger.info(`✅ Intelligence Digest Service initialized (daily at ${DIGEST_TIME} ET)`);
  } else {
    logger.info('⚠️ Intelligence Digest disabled (missing INTEL_DIGEST_CHANNEL or INTEL_SCRAPER_ENABLED)');
  }
}

/**
 * Schedule the daily digest
 */
function scheduleDigest() {
  const [hour, minute] = DIGEST_TIME.split(':');
  const cronExpression = `${minute || 0} ${hour || 8} * * *`;
  
  digestSchedule = cron.schedule(cronExpression, async () => {
    logger.info('📊 Generating daily intelligence digest...');
    await sendDigest();
  }, {
    timezone: 'America/New_York'
  });
  
  logger.info(`📊 Daily digest scheduled: ${cronExpression} (${DIGEST_TIME} ET)`);
}

/**
 * Stop the digest schedule
 */
function stopDigest() {
  if (digestSchedule) {
    digestSchedule.stop();
    digestSchedule = null;
    logger.info('📊 Digest schedule stopped');
  }
}

/**
 * Send the daily digest
 */
async function sendDigest(targetChannel = null) {
  const channel = targetChannel || DIGEST_CHANNEL;
  
  if (!channel) {
    logger.error('No digest channel configured');
    return { error: 'No digest channel configured' };
  }
  
  if (!slackClient) {
    logger.error('Slack client not initialized');
    return { error: 'Slack client not initialized' };
  }
  
  try {
    // Get pending intelligence grouped by account
    const accountGroups = await intelligenceStore.getPendingIntelligenceByAccount();
    
    if (accountGroups.length === 0) {
      logger.info('No pending intelligence to digest');
      
      await slackClient.chat.postMessage({
        channel,
        text: '📊 *Intelligence Digest*\n\nNo new account intelligence to review today. 🎉'
      });
      
      return { sent: true, itemCount: 0 };
    }
    
    // Count total items
    const totalItems = accountGroups.reduce((sum, g) => sum + g.items.length, 0);
    const totalAccounts = accountGroups.length;
    
    // Build the digest message with Block Kit
    const blocks = buildDigestBlocks(accountGroups);
    
    // Send the digest
    const result = await slackClient.chat.postMessage({
      channel,
      text: `📊 Account Intelligence Digest - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      blocks
    });
    
    logger.info(`📊 Digest sent: ${totalItems} items from ${totalAccounts} accounts`);
    
    return {
      sent: true,
      itemCount: totalItems,
      accountCount: totalAccounts,
      messageTs: result.ts
    };
    
  } catch (error) {
    logger.error('Error sending digest:', error);
    return { error: error.message };
  }
}

/**
 * Build Block Kit blocks for the digest
 */
function buildDigestBlocks(accountGroups) {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  const totalItems = accountGroups.reduce((sum, g) => sum + g.items.length, 0);
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Account Intelligence Digest',
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${today} • ${totalItems} insights from ${accountGroups.length} accounts`
        }
      ]
    },
    {
      type: 'divider'
    }
  ];
  
  // Add each account's intelligence
  for (const group of accountGroups) {
    const accountName = group.accountName;
    const items = group.items.slice(0, MAX_ITEMS_PER_ACCOUNT);
    const hasMore = group.items.length > MAX_ITEMS_PER_ACCOUNT;
    
    // Account header
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${accountName}* (${group.items.length} item${group.items.length > 1 ? 's' : ''})`
      }
    });
    
    // Add each item with approve/reject buttons
    for (const item of items) {
      const categoryEmoji = getCategoryEmoji(item.category);
      const confidenceIndicator = item.confidence >= 0.9 ? '🟢' : item.confidence >= 0.8 ? '🟡' : '🟠';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${categoryEmoji} *${formatCategory(item.category)}*\n${item.summary || item.message_text?.substring(0, 100)}...\n_by ${item.message_author_name} in #${item.channel_name || 'unknown'}_ ${confidenceIndicator}`
        },
        accessory: {
          type: 'overflow',
          options: [
            {
              text: {
                type: 'plain_text',
                text: '✅ Approve',
                emoji: true
              },
              value: `approve_intel_${item.id}`
            },
            {
              text: {
                type: 'plain_text',
                text: '❌ Reject',
                emoji: true
              },
              value: `reject_intel_${item.id}`
            },
            {
              text: {
                type: 'plain_text',
                text: '👁️ View Full',
                emoji: true
              },
              value: `view_intel_${item.id}`
            }
          ],
          action_id: 'intel_item_action'
        }
      });
    }
    
    if (hasMore) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_...and ${group.items.length - MAX_ITEMS_PER_ACCOUNT} more items_`
          }
        ]
      });
    }
    
    blocks.push({
      type: 'divider'
    });
  }
  
  // Add bulk action buttons
  const allIds = accountGroups.flatMap(g => g.items.map(i => i.id));
  
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Approve All',
          emoji: true
        },
        style: 'primary',
        action_id: 'intel_approve_all',
        value: allIds.join(',')
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '❌ Reject All',
          emoji: true
        },
        style: 'danger',
        action_id: 'intel_reject_all',
        value: allIds.join(',')
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📊 View Stats',
          emoji: true
        },
        action_id: 'intel_view_stats'
      }
    ]
  });
  
  return blocks;
}

/**
 * Get emoji for category
 */
function getCategoryEmoji(category) {
  const emojis = {
    'meeting_notes': '📝',
    'deal_update': '💰',
    'stakeholder': '👥',
    'technical': '🔧',
    'legal': '⚖️',
    'competitive': '🏁',
    'timeline': '📅',
    'budget': '💵',
    'action_items': '✅',
    'other': '📌'
  };
  return emojis[category] || '📌';
}

/**
 * Format category for display
 */
function formatCategory(category) {
  const formatted = category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return formatted;
}

/**
 * Register interactive handlers for digest actions
 */
function registerDigestHandlers(app) {
  // Handle overflow menu actions
  app.action('intel_item_action', async ({ action, ack, respond, body }) => {
    await ack();
    
    const value = action.selected_option?.value;
    if (!value) return;
    
    const userId = body.user?.id;
    
    if (value.startsWith('approve_intel_')) {
      const id = parseInt(value.replace('approve_intel_', ''));
      await handleApprove(id, userId, respond);
    } else if (value.startsWith('reject_intel_')) {
      const id = parseInt(value.replace('reject_intel_', ''));
      await handleReject(id, userId, respond);
    } else if (value.startsWith('view_intel_')) {
      const id = parseInt(value.replace('view_intel_', ''));
      await handleViewFull(id, respond);
    }
  });
  
  // Handle Approve All button
  app.action('intel_approve_all', async ({ action, ack, respond, body }) => {
    await ack();
    
    const ids = action.value.split(',').map(id => parseInt(id));
    const userId = body.user?.id;
    
    await respond({
      text: `⏳ Approving ${ids.length} items and syncing to Salesforce...`,
      replace_original: false
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of ids) {
      try {
        const result = await approveAndSync(id, userId);
        if (result.success) successCount++;
        else errorCount++;
      } catch (error) {
        errorCount++;
      }
    }
    
    await respond({
      text: `✅ Approved and synced ${successCount} items to Salesforce.${errorCount > 0 ? ` (${errorCount} errors)` : ''}`,
      replace_original: false
    });
  });
  
  // Handle Reject All button
  app.action('intel_reject_all', async ({ action, ack, respond, body }) => {
    await ack();
    
    const ids = action.value.split(',').map(id => parseInt(id));
    const userId = body.user?.id;
    
    const results = await intelligenceStore.batchUpdateIntelligenceStatus(ids, 'rejected', userId);
    const successCount = results.filter(r => r.updated).length;
    
    await respond({
      text: `❌ Rejected ${successCount} items.`,
      replace_original: false
    });
  });
  
  // Handle View Stats button
  app.action('intel_view_stats', async ({ ack, respond }) => {
    await ack();
    
    const stats = await intelligenceStore.getIntelligenceStats();
    
    await respond({
      text: `📊 *Intelligence Stats*\n\n• Total: ${stats.total}\n• Pending: ${stats.pending}\n• Approved: ${stats.approved}\n• Rejected: ${stats.rejected}`,
      replace_original: false
    });
  });
  
  logger.info('✅ Digest interactive handlers registered');
}

/**
 * Handle single item approval
 */
async function handleApprove(id, userId, respond) {
  try {
    const result = await approveAndSync(id, userId);
    
    if (result.success) {
      await respond({
        text: `✅ Approved and synced to ${result.accountName}'s Customer Brain.`,
        replace_original: false
      });
    } else {
      await respond({
        text: `❌ Error: ${result.error}`,
        replace_original: false
      });
    }
  } catch (error) {
    await respond({
      text: `❌ Error: ${error.message}`,
      replace_original: false
    });
  }
}

/**
 * Handle single item rejection
 */
async function handleReject(id, userId, respond) {
  try {
    await intelligenceStore.updateIntelligenceStatus(id, 'rejected', userId);
    await respond({
      text: `❌ Item rejected.`,
      replace_original: false
    });
  } catch (error) {
    await respond({
      text: `❌ Error: ${error.message}`,
      replace_original: false
    });
  }
}

/**
 * Handle view full message
 */
async function handleViewFull(id, respond) {
  try {
    const item = await intelligenceStore.getIntelligenceById(id);
    
    if (!item) {
      await respond({
        text: '❌ Item not found.',
        replace_original: false
      });
      return;
    }
    
    const text = `*Full Message*\n\n*Account:* ${item.account_name}\n*Channel:* #${item.channel_name}\n*Author:* ${item.message_author_name}\n*Category:* ${formatCategory(item.category)}\n*Confidence:* ${(item.confidence * 100).toFixed(0)}%\n\n>>> ${item.message_text}`;
    
    await respond({
      text,
      replace_original: false
    });
  } catch (error) {
    await respond({
      text: `❌ Error: ${error.message}`,
      replace_original: false
    });
  }
}

/**
 * Approve an item and sync to Salesforce
 */
async function approveAndSync(id, reviewedBy) {
  try {
    const item = await intelligenceStore.getIntelligenceById(id);
    
    if (!item) {
      return { success: false, error: 'Item not found' };
    }
    
    if (!item.account_id) {
      return { success: false, error: 'No Salesforce account linked' };
    }
    
    // Get the current Customer_Brain__c field value
    const accountQuery = `SELECT Id, Name, Customer_Brain__c FROM Account WHERE Id = '${item.account_id}'`;
    const result = await query(accountQuery, false);
    
    if (!result.records || result.records.length === 0) {
      return { success: false, error: 'Account not found in Salesforce' };
    }
    
    const account = result.records[0];
    const existingNotes = account.Customer_Brain__c || '';
    
    // Format the new note
    const date = new Date();
    const dateShort = `${date.getMonth() + 1}/${date.getDate()}`;
    const categoryLabel = formatCategory(item.category);
    const formattedNote = `${dateShort} - [${categoryLabel}] ${item.summary || item.message_text?.substring(0, 200)}\nSource: #${item.channel_name} (via ${item.message_author_name})`;
    
    // Prepend new note to existing notes
    const updatedNotes = formattedNote + (existingNotes ? '\n\n' + existingNotes : '');
    
    // Update Salesforce
    const conn = sfConnection.getConnection();
    await conn.sobject('Account').update({
      Id: item.account_id,
      Customer_Brain__c: updatedNotes
    });
    
    // Mark as approved in our database
    await intelligenceStore.updateIntelligenceStatus(id, 'approved', reviewedBy);
    
    logger.info(`✅ Intelligence ${id} synced to ${account.Name}`);
    
    return {
      success: true,
      accountName: account.Name,
      accountId: item.account_id
    };
    
  } catch (error) {
    logger.error(`Error approving and syncing intelligence ${id}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Manually trigger digest (for testing)
 */
async function triggerDigest(channel = null) {
  return await sendDigest(channel);
}

module.exports = {
  initialize,
  scheduleDigest,
  stopDigest,
  sendDigest,
  registerDigestHandlers,
  approveAndSync,
  triggerDigest
};

