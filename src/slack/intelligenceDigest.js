/**
 * Intelligence Digest Service
 * Daily digest generation with layered, topic-based organization
 * 
 * Output Structure:
 * - HEADLINES: 2-3 key takeaways per account
 * - DETAIL BY TOPIC: Grouped signals with full quotes
 * - Expandable full list
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const intelligenceStore = require('../services/intelligenceStore');
const { query, sfConnection } = require('../salesforce/connection');
const { socratesAdapter } = require('../ai/socratesAdapter');
const { buildTopicClusteringPrompt, TOPIC_CLUSTERING_SYSTEM } = require('../ai/digestPrompts');

// Configuration
const DIGEST_CHANNEL = process.env.INTEL_DIGEST_CHANNEL;
const DIGEST_TIME = process.env.INTEL_DIGEST_TIME || '08:00';
const MAX_ITEMS_PER_ACCOUNT = 5;  // Limit items shown per account in digest
const MAX_TOPICS_PER_ACCOUNT = 5; // Max topics to show in layered view
const MAX_SIGNALS_PER_TOPIC = 3;  // Max signals shown per topic in detail

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligenceDigest.js:cronTrigger',message:'CRON_TRIGGER - Digest scheduled task triggered',data:{cronExpression},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligenceDigest.js:noItems',message:'SENDING no-items digest message',data:{channel},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      await slackClient.chat.postMessage({
        channel,
        text: '📊 *Intelligence Digest*\n\nNo new account intelligence to review today. 🎉'
      });
      
      return { sent: true, itemCount: 0 };
    }
    
    // Count total items
    const totalItems = accountGroups.reduce((sum, g) => sum + g.items.length, 0);
    const totalAccounts = accountGroups.length;
    
    // Build the digest message with Block Kit (now async for AI clustering)
    const blocks = await buildDigestBlocks(accountGroups);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligenceDigest.js:sendDigest',message:'SENDING DIGEST to channel',data:{channel,totalItems,totalAccounts},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
 * Cluster signals by topic using Claude AI
 * Groups related signals and generates headlines
 */
async function clusterSignalsByTopic(signals, accountName) {
  if (!signals || signals.length === 0) {
    return { topics: [], signalCount: 0 };
  }
  
  // For small signal counts, skip AI and use category-based grouping
  if (signals.length <= 3) {
    return fallbackCategoryClustering(signals);
  }
  
  try {
    const prompt = buildTopicClusteringPrompt(signals);
    
    const response = await socratesAdapter.makeRequest(
      [
        { role: 'system', content: TOPIC_CLUSTERING_SYSTEM },
        { role: 'user', content: prompt }
      ],
      { 
        model: 'eudia-claude-opus-4.5',
        max_tokens: 2000,
        temperature: 0.3  // Lower temperature for more consistent output
      }
    );
    
    // Extract content from response
    const responseText = response?.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn(`[Digest] Failed to parse topic clustering for ${accountName}, using fallback`);
      return fallbackCategoryClustering(signals);
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Validate and enrich with original signal data
    if (result.topics && Array.isArray(result.topics)) {
      result.topics = result.topics.map(topic => ({
        ...topic,
        signals: topic.signals.map(s => {
          // Find the original signal to preserve all data
          const original = signals.find(orig => orig.id === s.id);
          return original || s;
        })
      }));
    }
    
    return result;
    
  } catch (error) {
    logger.error(`[Digest] Error clustering signals for ${accountName}:`, error.message);
    return fallbackCategoryClustering(signals);
  }
}

/**
 * Fallback clustering when AI is unavailable
 * Groups by category instead of topic
 */
function fallbackCategoryClustering(signals) {
  const categoryGroups = {};
  
  for (const signal of signals) {
    const category = signal.category || 'other';
    if (!categoryGroups[category]) {
      categoryGroups[category] = {
        topicName: formatCategory(category),
        headline: `${signals.length} ${formatCategory(category).toLowerCase()} signal${signals.length > 1 ? 's' : ''} captured`,
        signals: []
      };
    }
    categoryGroups[category].signals.push(signal);
  }
  
  // Generate simple headlines based on first signal
  Object.values(categoryGroups).forEach(group => {
    if (group.signals.length > 0) {
      const firstSignal = group.signals[0];
      group.headline = firstSignal.summary || firstSignal.message_text?.substring(0, 100) + '...';
    }
  });
  
  return {
    topics: Object.values(categoryGroups).slice(0, MAX_TOPICS_PER_ACCOUNT),
    signalCount: signals.length
  };
}

/**
 * Build Block Kit blocks for the LAYERED digest
 * Layer 1: Headlines per account
 * Layer 2: Detail by topic with full quotes
 */
async function buildDigestBlocks(accountGroups) {
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
  
  // Process each account with topic clustering
  for (const group of accountGroups) {
    const accountName = group.accountName;
    const signalCount = group.items.length;
    
    // Cluster signals by topic (with AI if available)
    const clustered = await clusterSignalsByTopic(group.items, accountName);
    
    // ═══════════════════════════════════════════════════
    // ACCOUNT HEADER
    // ═══════════════════════════════════════════════════
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*${accountName}*                                           _${signalCount} signals_`
      }
    });
    
    // ═══════════════════════════════════════════════════
    // LAYER 1: HEADLINES
    // ═══════════════════════════════════════════════════
    if (clustered.topics && clustered.topics.length > 0) {
      const headlineText = clustered.topics
        .slice(0, 3)  // Max 3 headlines
        .map(t => `• ${t.headline}`)
        .join('\n');
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*HEADLINES*\n${headlineText}`
        }
      });
      
      // ═══════════════════════════════════════════════════
      // LAYER 2: DETAIL BY TOPIC
      // ═══════════════════════════════════════════════════
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '─────────────────────────────────────────\n*DETAIL BY TOPIC*'
          }
        ]
      });
      
      for (const topic of clustered.topics.slice(0, MAX_TOPICS_PER_ACCOUNT)) {
        // Topic header
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `\n📌 *${topic.topicName}*`
            }
          ]
        });
        
        // Show signals with full quotes (up to MAX_SIGNALS_PER_TOPIC)
        const topicSignals = topic.signals.slice(0, MAX_SIGNALS_PER_TOPIC);
        
        for (const signal of topicSignals) {
          const categoryEmoji = getCategoryEmoji(signal.category);
          const fullText = signal.message_text || signal.fullText || signal.summary || '';
          const truncatedText = fullText.length > 300 
            ? fullText.substring(0, 300) + '...' 
            : fullText;
          
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${categoryEmoji} *${formatCategory(signal.category)}*: "${truncatedText}"\n_— ${signal.message_author_name || signal.author} in #${signal.channel_name || signal.channel || 'unknown'}_`
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
                  value: `approve_intel_${signal.id}`
                },
                {
                  text: {
                    type: 'plain_text',
                    text: '❌ Reject',
                    emoji: true
                  },
                  value: `reject_intel_${signal.id}`
                },
                {
                  text: {
                    type: 'plain_text',
                    text: '👁️ View Full',
                    emoji: true
                  },
                  value: `view_intel_${signal.id}`
                }
              ],
              action_id: 'intel_item_action'
            }
          });
        }
        
        // Show "more items" indicator for this topic
        if (topic.signals.length > MAX_SIGNALS_PER_TOPIC) {
          blocks.push({
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `_...and ${topic.signals.length - MAX_SIGNALS_PER_TOPIC} more in this topic_`
              }
            ]
          });
        }
      }
    } else {
      // Fallback to simple list if no topics
      const items = group.items.slice(0, MAX_ITEMS_PER_ACCOUNT);
      for (const item of items) {
        const categoryEmoji = getCategoryEmoji(item.category);
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${categoryEmoji} *${formatCategory(item.category)}*\n${item.summary || item.message_text?.substring(0, 100)}...\n_by ${item.message_author_name} in #${item.channel_name || 'unknown'}_`
          }
        });
      }
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
    // Enable caching to avoid SF rate limits
    const result = await query(accountQuery, true);
    
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

