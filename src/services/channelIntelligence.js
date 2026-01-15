/**
 * Channel Intelligence Service
 * Core service for polling messages and extracting intelligence using LLM
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const intelligenceStore = require('./intelligenceStore');
const { socratesAdapter } = require('../ai/socratesAdapter');

// Configuration
const POLL_INTERVAL_HOURS = parseInt(process.env.INTEL_POLL_INTERVAL_HOURS) || 1;
const CONFIDENCE_THRESHOLD = parseFloat(process.env.INTEL_CONFIDENCE_THRESHOLD) || 0.7;
const MIN_MESSAGE_LENGTH = 10;  // Lowered to catch short but important messages like "🎉 CLOSED!"
const MAX_MESSAGES_PER_CHANNEL = 100;  // Rate limit per poll
const MAX_INTEL_PER_CHANNEL_PER_DAY = 20;  // Prevent digest overload from high-volume channels

// Track daily intel counts per channel (resets on poll)
const dailyIntelCounts = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL CONFIGURATION - Conservative limits to protect shared Claude API
// ═══════════════════════════════════════════════════════════════════════════
const BACKFILL_CONFIG = {
  MAX_TOKENS_PER_RUN: 50000,      // Hard cap on API tokens per backfill
  MAX_CHANNELS_PER_RUN: 3,        // Process max 3 channels at a time
  BATCH_SIZE: 20,                 // Messages per LLM call (batched)
  DAYS_BACK: 90,                  // How far back to scrape
  RATE_LIMIT_MS: 2000,            // 2 seconds between API calls
  SLACK_RATE_LIMIT_MS: 1200,      // 1.2 seconds between Slack API calls
  TOKENS_PER_MESSAGE_ESTIMATE: 150  // Rough estimate for budget calculation
};

// Pre-filtering patterns - applied BEFORE LLM to save API calls
const SKIP_PATTERNS = [
  /^(ok|okay|k|thanks|thank you|thx|ty|got it|sounds good|perfect|great|cool|nice|yep|yup|yes|no|sure|will do)[\s!.]*$/i,
  /^(👍|🙏|✅|👌|💯|🎉|😊|😀|🙂|👏|❤️|💪|🔥|✨|⭐)+$/,  // Pure emoji responses
  /^<@\w+>[\s]*$/,                                    // Just a mention with no content
  /^\s*$/,                                            // Empty/whitespace
  /^(hi|hello|hey|good morning|good afternoon|gm|morning)[\s!]*$/i,  // Greetings only
  /has joined the channel/i,                          // System: user joined
  /has left the channel/i,                            // System: user left
  /set the channel (topic|description|purpose)/i,    // System: channel settings
  /pinned a message/i,                               // System: pinned
  /unpinned a message/i,                             // System: unpinned
  /added an integration/i,                           // System: integration
  /removed an integration/i,                         // System: integration
  /archived this channel/i,                          // System: archived
  /^<https?:\/\/[^|]+>$/,                            // Just a URL with no context
  /^<https?:\/\/[^|]+\|[^>]+>$/,                     // Slack formatted URL only
  /This message was deleted/i,                       // Deleted message placeholder
  /^(brb|bbl|afk|gtg|ttyl)[\s!.]*$/i,               // Away messages
];

// Patterns that indicate likely relevance - fast-track to LLM
const LIKELY_RELEVANT_PATTERNS = [
  /\$[\d,]+/,                      // Dollar amounts ($500, $1,000,000)
  /\d+k\b/i,                       // K notation (500k, 50K)
  /closed|won|signed|booked/i,    // Deal signals
  /lost|churned|cancelled/i,       // Churn signals
  /meeting|call|demo|presentation/i,  // Meeting references
  /contract|deal|renewal|expansion/i, // Deal terms
  /POC|pilot|trial|proof of concept/i, // POC references
  /decision maker|dm|champion|blocker|sponsor/i, // Stakeholder terms
  /timeline|deadline|go-live|launch/i,  // Timeline references
  /competitor|competing|alternative/i,  // Competitive intel
  /budget|pricing|discount|proposal/i,  // Commercial terms
  /risk|concern|blocker|issue|problem/i, // Risk signals
  /ACV|TCV|ARR|MRR/i,              // Revenue metrics
  /MSA|SOW|NDA|DPA/i,              // Legal docs
  /CFO|CEO|CTO|CLO|GC|VP|Director/i, // Exec titles
];

/**
 * Check if a message should be skipped (obvious noise)
 */
function shouldSkipMessage(text) {
  if (!text || text.length < MIN_MESSAGE_LENGTH) return true;
  return SKIP_PATTERNS.some(pattern => pattern.test(text.trim()));
}

/**
 * Check if a message is likely relevant (fast-track to LLM)
 */
function isLikelyRelevant(text) {
  if (!text) return false;
  return LIKELY_RELEVANT_PATTERNS.some(pattern => pattern.test(text));
}

// LLM Relevance Classification Prompt
const RELEVANCE_PROMPT = `You are an AI analyzing Slack messages from customer account channels for a fast-paced B2B sales team. Your job is to identify actionable account intelligence worth syncing to Salesforce.

## CLASSIFY AS RELEVANT (capture these):

**Deal Signals** 🔥
- Closed/won announcements (even emoji-heavy like "🎉 CLOSED!")
- Pricing discussions, discounts, negotiation updates
- Contract value mentions, ACV/TCV references
- Renewal, upsell, expansion conversations
- POC/pilot status updates

**Meeting Intelligence** 📝
- Meeting recaps, call summaries, demo feedback
- Customer quotes or sentiment
- Executive sponsor mentions
- Champion/blocker identification

**Stakeholder Intel** 👥
- New contacts, title changes, org restructures
- Departures, promotions, role changes
- Decision maker identification
- Procurement/legal team involvement

**Technical Requirements** 🔧
- Product requirements, feature requests
- Integration needs, security requirements
- Implementation timelines, go-live dates

**Risk Signals** ⚠️
- Competitive mentions (other vendors being evaluated)
- Budget concerns, delays, objections
- Escalations, blockers, red flags
- Timeline slippage

**Next Steps** ✅
- Action items with owners
- Follow-up commitments
- Milestone confirmations

## CLASSIFY AS NOISE (skip these):

- Pure scheduling logistics without context ("let's meet at 2pm")
- Simple acknowledgments: "ok", "thanks", "got it", "👍"
- Casual greetings, small talk, off-topic
- Bot/automated messages (Zoom links, calendar invites)
- Internal team banter unrelated to account

## EDGE CASES - LEAN TOWARD RELEVANT:
- Short celebratory messages about wins → RELEVANT (deal_update)
- Scheduling that mentions deal context → RELEVANT (action_items)
- Emoji-heavy messages with deal info → RELEVANT
- Messages with $ amounts → RELEVANT

## SALES ACRONYMS TO RECOGNIZE:
POC (proof of concept), MSA (master service agreement), SOW (statement of work), 
ACV (annual contract value), TCV (total contract value), ARR (annual recurring revenue),
NDA (non-disclosure), DPA (data processing agreement), QBR (quarterly business review),
CS (customer success), AE (account executive), SE (sales engineer)

Respond with valid JSON only:
{
  "relevant": true/false,
  "confidence": 0.0-1.0,
  "category": "deal_update|meeting_notes|stakeholder|technical|risk_signal|competitive|action_items|other",
  "summary": "One actionable sentence if relevant, null if noise",
  "urgency": "high|medium|low"
}

MESSAGE TO ANALYZE:
Author: {author}
Text: {message}`;

let pollerSchedule = null;
let slackClient = null;

/**
 * Initialize the intelligence service
 */
async function initialize(client) {
  slackClient = client;
  
  // Initialize the database
  await intelligenceStore.initialize();
  
  // Set up hourly polling schedule
  if (process.env.INTEL_SCRAPER_ENABLED === 'true') {
    startPolling();
    logger.info(`✅ Channel Intelligence Service initialized (polling every ${POLL_INTERVAL_HOURS}h)`);
  } else {
    logger.info('⚠️ Channel Intelligence Service disabled (INTEL_SCRAPER_ENABLED != true)');
  }
}

/**
 * Start the polling schedule
 */
function startPolling() {
  // Run every hour at minute 0
  const cronExpression = `0 */${POLL_INTERVAL_HOURS} * * *`;
  
  pollerSchedule = cron.schedule(cronExpression, async () => {
    logger.info('🔄 Starting scheduled channel intelligence poll...');
    await pollAllChannels();
  }, {
    timezone: 'America/New_York'
  });
  
  logger.info(`📡 Channel polling scheduled: ${cronExpression}`);
}

/**
 * Stop the polling schedule
 */
function stopPolling() {
  if (pollerSchedule) {
    pollerSchedule.stop();
    pollerSchedule = null;
    logger.info('📡 Channel polling stopped');
  }
}

/**
 * Poll all monitored channels for new messages
 */
async function pollAllChannels() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channelIntelligence.js:pollAllChannels',message:'POLL_START - Starting channel poll',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  if (!slackClient) {
    logger.error('Slack client not initialized');
    return { error: 'Slack client not initialized' };
  }
  
  try {
    const channels = await intelligenceStore.getMonitoredChannels();
    
    if (channels.length === 0) {
      logger.info('No channels to poll');
      return { channelsPolled: 0, messagesProcessed: 0 };
    }
    
    logger.info(`📡 Polling ${channels.length} monitored channels...`);
    
    let totalMessages = 0;
    let totalIntelligence = 0;
    
    for (const channel of channels) {
      try {
        const result = await pollChannel(channel);
        totalMessages += result.messagesProcessed;
        totalIntelligence += result.intelligenceFound;
      } catch (error) {
        logger.error(`Error polling channel ${channel.channel_name}:`, error.message);
      }
    }
    
    logger.info(`📡 Poll complete: ${totalMessages} messages processed, ${totalIntelligence} intelligence items found`);
    
    return {
      channelsPolled: channels.length,
      messagesProcessed: totalMessages,
      intelligenceFound: totalIntelligence
    };
    
  } catch (error) {
    logger.error('Error in pollAllChannels:', error);
    return { error: error.message };
  }
}

/**
 * Poll a single channel for new messages
 */
async function pollChannel(channel) {
  const { channel_id, channel_name, account_name, account_id, last_polled } = channel;
  
  try {
    // Determine oldest timestamp to fetch (last poll or 24 hours ago)
    let oldest;
    if (last_polled) {
      oldest = new Date(last_polled).getTime() / 1000;
    } else {
      // First poll - get last 24 hours
      oldest = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
    }
    
    // Fetch messages from Slack
    const response = await slackClient.conversations.history({
      channel: channel_id,
      oldest: oldest.toString(),
      limit: MAX_MESSAGES_PER_CHANNEL
    });
    
    if (!response.ok || !response.messages) {
      logger.error(`Failed to fetch messages from #${channel_name}`);
      return { messagesProcessed: 0, intelligenceFound: 0 };
    }
    
    const messages = response.messages || [];
    logger.info(`📨 Fetched ${messages.length} messages from #${channel_name}`);
    
    let intelligenceFound = 0;
    
    // Patterns for Slack system messages to skip (saves LLM calls)
    const SYSTEM_MESSAGE_PATTERNS = [
      /^\/\w+/,                        // Slash commands like /invite, /remind
      /<@\w+>\s+has\s+joined/i,        // "User has joined the channel"
      /<@\w+>\s+has\s+left/i,          // "User has left the channel"
      /set\s+the\s+channel/i,          // Channel setting changes
      /pinned\s+a\s+message/i,         // Pinned message notifications
      /changed\s+the\s+channel/i,      // Channel changes
      /added\s+an\s+integration/i,     // Integration added
      /removed\s+an\s+integration/i,   // Integration removed
      /^<https?:\/\/[^|]+\|[^>]+>$/,   // Pure link messages with no context
    ];

    for (const message of messages) {
      // Skip bot messages and very short messages
      if (message.bot_id || message.subtype === 'bot_message') {
        continue;
      }
      
      if (!message.text || message.text.length < MIN_MESSAGE_LENGTH) {
        continue;
      }

      // Skip Slack system messages to save LLM calls
      if (SYSTEM_MESSAGE_PATTERNS.some(pattern => pattern.test(message.text))) {
        logger.debug(`Skipping system message: "${message.text.substring(0, 50)}..."`);
        continue;
      }
      
      // Check if already processed
      const isProcessed = await intelligenceStore.isMessageProcessed(message.ts);
      if (isProcessed) {
        continue;
      }
      
      // Check daily limit per channel
      const todayKey = `${channel_id}_${new Date().toDateString()}`;
      const currentCount = dailyIntelCounts.get(todayKey) || 0;
      if (currentCount >= MAX_INTEL_PER_CHANNEL_PER_DAY) {
        logger.info(`📊 Channel ${channel_name} hit daily intel limit (${MAX_INTEL_PER_CHANNEL_PER_DAY}), skipping remaining`);
        break;
      }
      
      // Get thread context if this is a reply
      let messageText = message.text;
      if (message.thread_ts && message.thread_ts !== message.ts) {
        try {
          const threadContext = await getThreadContext(channel_id, message.thread_ts, message.ts);
          if (threadContext) {
            messageText = `[Thread context: ${threadContext}]\n\nReply: ${message.text}`;
          }
        } catch (e) {
          // Continue without thread context
        }
      }
      
      // Classify message using LLM
      const classification = await classifyMessage(messageText, message.user);
      
      if (classification && classification.relevant && classification.confidence >= CONFIDENCE_THRESHOLD) {
        // Get user info for author name
        let authorName = message.user;
        try {
          const userInfo = await slackClient.users.info({ user: message.user });
          authorName = userInfo.user?.real_name || userInfo.user?.name || message.user;
        } catch (e) {
          // Use user ID if lookup fails
        }
        
        // Store the intelligence
        await intelligenceStore.storeIntelligence({
          channelId: channel_id,
          accountName: account_name,
          accountId: account_id,
          messageTs: message.ts,
          messageAuthor: message.user,
          messageAuthorName: authorName,
          messageText: message.text,
          category: classification.category,
          summary: classification.summary,
          confidence: classification.confidence
        });
        
        intelligenceFound++;
        
        // Increment daily counter
        const todayKey = `${channel_id}_${new Date().toDateString()}`;
        dailyIntelCounts.set(todayKey, (dailyIntelCounts.get(todayKey) || 0) + 1);
      }
    }
    
    // Update last polled timestamp
    await intelligenceStore.updateChannelLastPolled(channel_id);
    
    return {
      messagesProcessed: messages.length,
      intelligenceFound
    };
    
  } catch (error) {
    logger.error(`Error polling channel ${channel_name}:`, error);
    return { messagesProcessed: 0, intelligenceFound: 0, error: error.message };
  }
}

/**
 * Get thread context for a reply message
 */
async function getThreadContext(channelId, threadTs, currentTs) {
  if (!slackClient) return null;
  
  try {
    const response = await slackClient.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 5  // Get parent + first few replies for context
    });
    
    if (!response.ok || !response.messages || response.messages.length === 0) {
      return null;
    }
    
    // Get the parent message (first in thread)
    const parent = response.messages[0];
    if (!parent || parent.ts === currentTs) {
      return null;
    }
    
    // Return truncated parent text as context
    const parentText = parent.text?.substring(0, 300) || '';
    return parentText;
    
  } catch (error) {
    logger.debug('Error fetching thread context:', error.message);
    return null;
  }
}

/**
 * Classify a message using LLM
 */
async function classifyMessage(messageText, authorId) {
  try {
    // Build the prompt
    const prompt = RELEVANCE_PROMPT
      .replace('{author}', authorId || 'Unknown')
      .replace('{message}', messageText);
    
    // Call the LLM
    const response = await socratesAdapter.createChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500
    });
    
    if (!response || !response.choices || !response.choices[0]) {
      logger.warn('Empty response from LLM');
      return null;
    }
    
    // Parse the JSON response
    let content = (response.choices[0].message?.content || response.choices[0].text || '').trim();
    
    // Extract JSON if wrapped in markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    }
    
    const classification = JSON.parse(content);
    
    return {
      relevant: classification.relevant === true,
      confidence: parseFloat(classification.confidence) || 0,
      category: classification.category || 'other',
      summary: classification.summary || null
    };
    
  } catch (error) {
    logger.error('Error classifying message:', error.message);
    return null;
  }
}

/**
 * Process a single message in real-time (for mentions/reactions)
 */
async function processMessageRealtime(channelId, messageTs, messageText, userId) {
  try {
    // Get channel info
    const channel = await intelligenceStore.getMonitoredChannel(channelId);
    if (!channel) {
      // Channel not monitored
      return null;
    }
    
    // Check if already processed
    const isProcessed = await intelligenceStore.isMessageProcessed(messageTs);
    if (isProcessed) {
      return { alreadyProcessed: true };
    }
    
    // Classify the message
    const classification = await classifyMessage(messageText, userId);
    
    if (classification && classification.relevant && classification.confidence >= CONFIDENCE_THRESHOLD) {
      // Get user info
      let authorName = userId;
      if (slackClient) {
        try {
          const userInfo = await slackClient.users.info({ user: userId });
          authorName = userInfo.user?.real_name || userInfo.user?.name || userId;
        } catch (e) {
          // Use user ID if lookup fails
        }
      }
      
      // Store the intelligence
      await intelligenceStore.storeIntelligence({
        channelId,
        accountName: channel.account_name,
        accountId: channel.account_id,
        messageTs,
        messageAuthor: userId,
        messageAuthorName: authorName,
        messageText,
        category: classification.category,
        summary: classification.summary,
        confidence: classification.confidence
      });
      
      return {
        stored: true,
        classification
      };
    }
    
    return {
      stored: false,
      classification
    };
    
  } catch (error) {
    logger.error('Error processing message realtime:', error);
    return { error: error.message };
  }
}

/**
 * Force poll all channels (manual trigger)
 */
async function forcePoll() {
  logger.info('🔄 Force polling all channels...');
  return await pollAllChannels();
}

/**
 * Get service status
 */
function getStatus() {
  return {
    enabled: process.env.INTEL_SCRAPER_ENABLED === 'true',
    pollingActive: !!pollerSchedule,
    pollIntervalHours: POLL_INTERVAL_HOURS,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    slackClientReady: !!slackClient
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORICAL BACKFILL FUNCTIONS - One-time scrape with API safeguards
// ═══════════════════════════════════════════════════════════════════════════

// Track backfill state
let backfillInProgress = false;
let tokensUsedThisRun = 0;

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch classify messages using a single LLM call
 * Reduces API calls by ~95% compared to individual classification
 */
async function classifyMessageBatch(messages, accountName) {
  if (!messages || messages.length === 0) return [];
  
  const batchPrompt = `You are analyzing ${messages.length} Slack messages from the "${accountName}" customer account channel.
Classify EACH message for sales intelligence. Focus on deal signals, meeting notes, stakeholder info, risks, and action items.

RESPOND WITH A JSON ARRAY - one object per message:
[
  {"index": 0, "relevant": true/false, "category": "deal_update|meeting_notes|stakeholder|technical|risk_signal|competitive|action_items|other", "summary": "One sentence if relevant, null if noise", "confidence": 0.0-1.0},
  ...
]

MESSAGES TO ANALYZE:
${messages.map((m, i) => `[${i}] @${m.authorName || 'unknown'}: ${m.text.substring(0, 500)}`).join('\n\n')}

RESPOND WITH VALID JSON ARRAY ONLY:`;

  try {
    const response = await socratesAdapter.createChatCompletion({
      messages: [{ role: 'user', content: batchPrompt }],
      temperature: 0.3,
      max_tokens: 2000
    });
    
    // Track token usage (estimate)
    tokensUsedThisRun += (batchPrompt.length / 4) + 500; // Rough estimate
    
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      logger.error('Empty response from LLM batch classification');
      return messages.map(() => ({ relevant: false, error: 'Empty response' }));
    }
    
    // Parse JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error('Could not extract JSON array from LLM response');
      return messages.map(() => ({ relevant: false, error: 'Parse error' }));
    }
    
    const results = JSON.parse(jsonMatch[0]);
    return results;
    
  } catch (error) {
    logger.error('Batch classification failed:', error.message);
    return messages.map(() => ({ relevant: false, error: error.message }));
  }
}

/**
 * Fetch all messages from a channel going back N days with pagination
 */
async function fetchChannelHistory(channelId, channelName, daysBack) {
  const oldest = (Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000;
  let cursor = null;
  let allMessages = [];
  let pageCount = 0;
  
  logger.info(`📜 Fetching ${daysBack} days of history from #${channelName}...`);
  
  do {
    try {
      const params = {
        channel: channelId,
        oldest: oldest.toString(),
        limit: 200
      };
      if (cursor) params.cursor = cursor;
      
      const response = await slackClient.conversations.history(params);
      
      if (!response.ok) {
        logger.error(`Failed to fetch history from #${channelName}: ${response.error}`);
        break;
      }
      
      allMessages.push(...(response.messages || []));
      cursor = response.response_metadata?.next_cursor;
      pageCount++;
      
      logger.info(`  Page ${pageCount}: ${response.messages?.length || 0} messages (total: ${allMessages.length})`);
      
      // Rate limit for Slack API
      if (cursor) {
        await sleep(BACKFILL_CONFIG.SLACK_RATE_LIMIT_MS);
      }
      
    } catch (error) {
      logger.error(`Error fetching history page ${pageCount} from #${channelName}:`, error.message);
      break;
    }
    
  } while (cursor);
  
  return allMessages;
}

/**
 * Fetch thread replies for a parent message
 */
async function fetchThreadReplies(channelId, threadTs) {
  try {
    const response = await slackClient.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 100
    });
    
    if (!response.ok || !response.messages) return [];
    
    // Skip the parent message (first one), return only replies
    return response.messages.slice(1);
    
  } catch (error) {
    logger.warn(`Failed to fetch thread replies: ${error.message}`);
    return [];
  }
}

/**
 * Group intelligence items by week for organized output
 */
function groupByWeek(items) {
  const weeks = {};
  
  for (const item of items) {
    const date = new Date(parseFloat(item.message_ts) * 1000);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = [];
    }
    weeks[weekKey].push(item);
  }
  
  // Sort weeks descending (newest first)
  return Object.entries(weeks)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, items]) => ({
      weekStart,
      weekLabel: formatWeekLabel(weekStart),
      items: items.sort((a, b) => parseFloat(b.message_ts) - parseFloat(a.message_ts))
    }));
}

/**
 * Format week label for display
 */
function formatWeekLabel(weekStartStr) {
  const start = new Date(weekStartStr);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Week of ${formatDate(start)} - ${formatDate(end)}`;
}

/**
 * Run historical backfill on monitored channels
 * @param {Object} options - { dryRun, channelId, progressCallback }
 */
async function backfillChannels(options = {}) {
  const { dryRun = false, channelId = null, progressCallback = null } = options;
  
  if (!slackClient) {
    return { error: 'Slack client not initialized' };
  }
  
  if (backfillInProgress) {
    return { error: 'Backfill already in progress. Please wait.' };
  }
  
  // Check daily limit (stored in intelligence database)
  if (!dryRun) {
    const lastBackfill = await intelligenceStore.getLastBackfillTime();
    if (lastBackfill) {
      const lastDate = new Date(lastBackfill).toDateString();
      const today = new Date().toDateString();
      if (lastDate === today) {
        return { error: 'Daily backfill limit reached. Try again tomorrow to protect API budget.' };
      }
    }
  }
  
  backfillInProgress = true;
  tokensUsedThisRun = 0;
  
  try {
    // Get channels to process
    let channels = await intelligenceStore.getMonitoredChannels();
    
    if (channelId) {
      channels = channels.filter(c => c.channel_id === channelId);
      if (channels.length === 0) {
        backfillInProgress = false;
        return { error: `Channel ${channelId} is not being monitored. Add it first with /intel add` };
      }
    } else {
      // Limit channels per run to protect API
      channels = channels.slice(0, BACKFILL_CONFIG.MAX_CHANNELS_PER_RUN);
    }
    
    if (channels.length === 0) {
      backfillInProgress = false;
      return { error: 'No channels to backfill. Add channels with /intel add first.' };
    }
    
    const results = {
      dryRun,
      channelsProcessed: 0,
      totalMessages: 0,
      messagesAfterFilter: 0,
      intelligenceFound: 0,
      tokensUsed: 0,
      channelDetails: [],
      weeklyGroups: []
    };
    
    // Process each channel
    for (const channel of channels) {
      const channelResult = {
        channelName: channel.channel_name,
        accountName: channel.account_name,
        messagesFound: 0,
        messagesAfterFilter: 0,
        intelligenceFound: 0,
        items: []
      };
      
      // Fetch history
      const messages = await fetchChannelHistory(
        channel.channel_id, 
        channel.channel_name, 
        BACKFILL_CONFIG.DAYS_BACK
      );
      
      channelResult.messagesFound = messages.length;
      results.totalMessages += messages.length;
      
      // Pre-filter messages to save LLM calls
      const filteredMessages = [];
      for (const msg of messages) {
        if (msg.bot_id || msg.subtype === 'bot_message') continue;
        if (shouldSkipMessage(msg.text)) continue;
        
        filteredMessages.push({
          ts: msg.ts,
          text: msg.text,
          author: msg.user,
          authorName: msg.user, // Will resolve later if needed
          threadTs: msg.thread_ts,
          replyCount: msg.reply_count || 0
        });
        
        // Also fetch thread replies for messages with threads
        if (msg.reply_count > 0 && msg.thread_ts === msg.ts) {
          await sleep(BACKFILL_CONFIG.SLACK_RATE_LIMIT_MS);
          const replies = await fetchThreadReplies(channel.channel_id, msg.ts);
          
          for (const reply of replies) {
            if (reply.bot_id || shouldSkipMessage(reply.text)) continue;
            filteredMessages.push({
              ts: reply.ts,
              text: reply.text,
              author: reply.user,
              authorName: reply.user,
              threadTs: msg.ts,
              isThreadReply: true
            });
          }
        }
      }
      
      channelResult.messagesAfterFilter = filteredMessages.length;
      results.messagesAfterFilter += filteredMessages.length;
      
      if (progressCallback) {
        progressCallback(`#${channel.channel_name}: ${messages.length} messages → ${filteredMessages.length} after filtering`);
      }
      
      // DRY RUN: Just count, don't call LLM
      if (dryRun) {
        results.channelDetails.push(channelResult);
        results.channelsProcessed++;
        continue;
      }
      
      // Process in batches to limit API usage
      const batches = [];
      for (let i = 0; i < filteredMessages.length; i += BACKFILL_CONFIG.BATCH_SIZE) {
        batches.push(filteredMessages.slice(i, i + BACKFILL_CONFIG.BATCH_SIZE));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Check token budget
        if (tokensUsedThisRun >= BACKFILL_CONFIG.MAX_TOKENS_PER_RUN) {
          logger.warn(`⚠️ Token budget exhausted (${tokensUsedThisRun}/${BACKFILL_CONFIG.MAX_TOKENS_PER_RUN}). Stopping backfill.`);
          if (progressCallback) {
            progressCallback(`⚠️ Token budget reached. Partial results saved.`);
          }
          break;
        }
        
        const batch = batches[batchIndex];
        
        if (progressCallback) {
          progressCallback(`#${channel.channel_name}: Processing batch ${batchIndex + 1}/${batches.length}...`);
        }
        
        // Classify batch
        const classifications = await classifyMessageBatch(batch, channel.account_name);
        
        // Store relevant items
        for (let i = 0; i < classifications.length; i++) {
          const classification = classifications[i];
          const message = batch[i];
          
          if (classification.relevant && classification.confidence >= CONFIDENCE_THRESHOLD) {
            try {
              await intelligenceStore.storeIntelligence({
                channelId: channel.channel_id,
                accountName: channel.account_name,
                accountId: channel.account_id,
                messageTs: message.ts,
                messageAuthor: message.author,
                messageAuthorName: message.authorName,
                messageText: message.text,
                category: classification.category,
                summary: classification.summary,
                confidence: classification.confidence
              });
              
              channelResult.items.push({
                message_ts: message.ts,
                category: classification.category,
                summary: classification.summary,
                author: message.authorName
              });
              
              channelResult.intelligenceFound++;
              results.intelligenceFound++;
              
            } catch (error) {
              // Likely duplicate - skip silently
              if (!error.message?.includes('UNIQUE constraint')) {
                logger.warn(`Failed to store intelligence: ${error.message}`);
              }
            }
          }
        }
        
        // Rate limit between batches
        await sleep(BACKFILL_CONFIG.RATE_LIMIT_MS);
      }
      
      results.channelDetails.push(channelResult);
      results.channelsProcessed++;
    }
    
    results.tokensUsed = tokensUsedThisRun;
    
    // Record backfill completion (for daily limit tracking)
    if (!dryRun) {
      await intelligenceStore.recordBackfill(results);
      
      // Group results by week for organized output
      const allItems = results.channelDetails.flatMap(cd => 
        cd.items.map(item => ({ ...item, channelName: cd.channelName }))
      );
      results.weeklyGroups = groupByWeek(allItems);
    }
    
    backfillInProgress = false;
    return results;
    
  } catch (error) {
    backfillInProgress = false;
    logger.error('Backfill failed:', error);
    return { error: error.message };
  }
}

/**
 * Format backfill results for Slack message
 */
function formatBackfillResults(results) {
  if (results.error) {
    return `❌ Backfill failed: ${results.error}`;
  }
  
  if (results.dryRun) {
    const estimatedBatches = Math.ceil(results.messagesAfterFilter / BACKFILL_CONFIG.BATCH_SIZE);
    const estimatedTokens = results.messagesAfterFilter * BACKFILL_CONFIG.TOKENS_PER_MESSAGE_ESTIMATE;
    
    let msg = `📊 *BACKFILL ESTIMATE* (Dry Run - No API calls made)\n\n`;
    msg += `*Channels to process:* ${results.channelsProcessed}\n`;
    msg += `*Total messages found:* ${results.totalMessages.toLocaleString()}\n`;
    msg += `*After pre-filtering:* ${results.messagesAfterFilter.toLocaleString()} messages\n`;
    msg += `*Estimated API calls:* ${estimatedBatches} (${BACKFILL_CONFIG.BATCH_SIZE} msgs/batch)\n`;
    msg += `*Estimated tokens:* ~${estimatedTokens.toLocaleString()} / ${BACKFILL_CONFIG.MAX_TOKENS_PER_RUN.toLocaleString()} budget\n\n`;
    
    msg += `*Channel Breakdown:*\n`;
    for (const cd of results.channelDetails) {
      msg += `• #${cd.channelName}: ${cd.messagesFound} → ${cd.messagesAfterFilter} after filter\n`;
    }
    
    msg += `\n_Run \`/intel backfill confirm\` or \`@gtm-brain backfill confirm\` to proceed._`;
    return msg;
  }
  
  // Actual results
  let msg = `✅ *BACKFILL COMPLETE*\n\n`;
  msg += `*Processed:* ${results.channelsProcessed} channels, ${results.messagesAfterFilter.toLocaleString()} messages\n`;
  msg += `*API tokens used:* ${results.tokensUsed.toLocaleString()} / ${BACKFILL_CONFIG.MAX_TOKENS_PER_RUN.toLocaleString()} budget\n`;
  msg += `*Intelligence found:* ${results.intelligenceFound} items\n\n`;
  
  // Show weekly breakdown (limit to avoid message length issues)
  if (results.weeklyGroups && results.weeklyGroups.length > 0) {
    msg += `*Weekly Summary:*\n`;
    for (const week of results.weeklyGroups.slice(0, 5)) {
      msg += `\n📅 *${week.weekLabel}* (${week.items.length} items)\n`;
      for (const item of week.items.slice(0, 5)) {
        const category = item.category?.replace('_', ' ') || 'other';
        msg += `  • [${category}] ${item.summary || item.text?.substring(0, 50)}\n`;
      }
      if (week.items.length > 5) {
        msg += `  _...and ${week.items.length - 5} more_\n`;
      }
    }
    if (results.weeklyGroups.length > 5) {
      msg += `\n_...and ${results.weeklyGroups.length - 5} more weeks_\n`;
    }
  }
  
  msg += `\n_Use \`/intel digest\` to review and approve items for Salesforce sync._`;
  return msg;
}

module.exports = {
  initialize,
  startPolling,
  stopPolling,
  pollAllChannels,
  pollChannel,
  classifyMessage,
  processMessageRealtime,
  forcePoll,
  getStatus,
  // Backfill functions
  backfillChannels,
  formatBackfillResults,
  shouldSkipMessage,
  isLikelyRelevant,
  BACKFILL_CONFIG
};

