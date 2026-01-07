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
    
    for (const message of messages) {
      // Skip bot messages and very short messages
      if (message.bot_id || message.subtype === 'bot_message') {
        continue;
      }
      
      if (!message.text || message.text.length < MIN_MESSAGE_LENGTH) {
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

module.exports = {
  initialize,
  startPolling,
  stopPolling,
  pollAllChannels,
  pollChannel,
  classifyMessage,
  processMessageRealtime,
  forcePoll,
  getStatus
};

