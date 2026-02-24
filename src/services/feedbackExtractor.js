/**
 * Product Feedback Extractor
 * Monitors #eudia_product_channel on a schedule and uses AI to extract
 * structured product feedback from unstructured Slack messages.
 * Adapted from channelIntelligence.js for product feedback use case.
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const feedbackStore = require('./feedbackStore');
const { socratesAdapter } = require('../ai/socratesAdapter');

const FEEDBACK_CHANNEL_ID = process.env.FEEDBACK_CHANNEL_ID || 'C09F9MUVA3F';
const FEEDBACK_CHANNEL_NAME = 'eudia_product_channel';
const MIN_MESSAGE_LENGTH = 20;
const MAX_MESSAGES_PER_CYCLE = 50;
const DRY_RUN = process.env.FEEDBACK_DRY_RUN === 'true';
const CRON_SCHEDULE = process.env.FEEDBACK_CRON || '0 10 * * 2,4,6';

let slackClient = null;
let isPolling = false;
let lastPollTime = null;
let cycleStats = { classified: 0, stored: 0, skipped: 0 };

const FEEDBACK_CLASSIFICATION_PROMPT = `You are analyzing a Slack message from #eudia_product_channel — Eudia's internal product feedback channel. Eudia is a legal AI company with products: Contracting, Compliance, M&A, Sigma (platform), Insights, Litigation, and custom FDE solutions.

Your job: determine if this message contains actionable product feedback and extract structured data.

## CLASSIFY AS FEEDBACK (capture these):
- Customer demo feedback (feature gaps, UX issues, missing capabilities)
- Feature requests from internal team or relayed from customers
- Bug reports or quality issues
- Use case queries (customer exploring new product capabilities)
- Product improvement suggestions
- Competitive comparisons mentioning what competitors do better

## SKIP (not feedback):
- Simple acknowledgments ("thanks", "got it", emoji-only)
- Meeting scheduling ("let's sync tomorrow")
- General chatter unrelated to product
- Status updates without product feedback substance
- Messages under 20 characters

## EXTRACT:
Return ONLY valid JSON (no markdown, no code blocks):

{
  "is_feedback": true/false,
  "confidence": 0.0-1.0,
  "feedback_type": "Issue" | "Feature Request" | "Quality Feedback" | "Use Case Query",
  "product_area": ["Contracting", "Compliance", "M&A", "Sigma", "Insights", "Litigation", "Platform", "Other"],
  "account_name": "Company Name or null if not account-specific",
  "summary": "Concise 1-3 sentence summary of the feedback",
  "priority": "High" | "Medium" | "Low",
  "tags": ["keyword1", "keyword2"]
}

Priority guide:
- High: active customer blocking issue, demo feedback from key account, urgent product gap
- Medium: feature request from customer, use case exploration, quality improvement
- Low: nice-to-have, general suggestion, minor UX issue

Author: {author}
Message:
{message}`;

const SYSTEM_PATTERNS = [
  /^\/\w+/,
  /<@\w+>\s+has\s+joined/i,
  /<@\w+>\s+has\s+left/i,
  /set\s+the\s+channel/i,
  /pinned\s+a\s+message/i,
  /changed\s+the\s+channel/i,
];

function initialize(client) {
  slackClient = client;
  logger.info(`[FeedbackExtractor] Initialized for #${FEEDBACK_CHANNEL_NAME} (${FEEDBACK_CHANNEL_ID})`);
}

function startPolling() {
  if (!slackClient) {
    logger.warn('[FeedbackExtractor] Cannot start polling - Slack client not initialized');
    return;
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info('[FeedbackExtractor] Scheduled poll triggered');
    await pollChannel();
  });

  logger.info(`[FeedbackExtractor] Polling scheduled: ${CRON_SCHEDULE} (ET)${DRY_RUN ? ' [DRY RUN]' : ''}`);
}

async function pollChannel() {
  if (isPolling) {
    logger.info('[FeedbackExtractor] Poll already in progress, skipping');
    return { messagesProcessed: 0, feedbackFound: 0 };
  }

  if (!slackClient) {
    logger.error('[FeedbackExtractor] Slack client not available');
    return { messagesProcessed: 0, feedbackFound: 0 };
  }

  isPolling = true;
  const startTime = Date.now();
  cycleStats = { classified: 0, stored: 0, skipped: 0 };

  try {
    const oldest = lastPollTime
      ? (lastPollTime / 1000).toString()
      : ((Date.now() - 72 * 60 * 60 * 1000) / 1000).toString();

    const response = await slackClient.conversations.history({
      channel: FEEDBACK_CHANNEL_ID,
      oldest,
      limit: MAX_MESSAGES_PER_CYCLE
    });

    if (!response.ok || !response.messages) {
      logger.error('[FeedbackExtractor] Failed to fetch messages');
      return { messagesProcessed: 0, feedbackFound: 0 };
    }

    const messages = response.messages || [];
    logger.info(`[FeedbackExtractor] Fetched ${messages.length} messages (cap: ${MAX_MESSAGES_PER_CYCLE})`);

    let feedbackFound = 0;
    let classifiedCount = 0;

    for (const message of messages) {
      if (classifiedCount >= MAX_MESSAGES_PER_CYCLE) {
        logger.info(`[FeedbackExtractor] Hit cycle cap (${MAX_MESSAGES_PER_CYCLE}), stopping`);
        break;
      }

      if (message.bot_id || message.subtype === 'bot_message') continue;
      if (!message.text || message.text.length < MIN_MESSAGE_LENGTH) continue;
      if (SYSTEM_PATTERNS.some(p => p.test(message.text))) continue;

      const alreadyProcessed = await feedbackStore.isMessageProcessed(message.ts);
      if (alreadyProcessed) continue;

      let messageText = message.text;
      if (message.thread_ts && message.thread_ts !== message.ts) {
        try {
          const threadReply = await slackClient.conversations.replies({
            channel: FEEDBACK_CHANNEL_ID,
            ts: message.thread_ts,
            limit: 5
          });
          if (threadReply.ok && threadReply.messages && threadReply.messages.length > 0) {
            const parentText = threadReply.messages[0].text || '';
            messageText = `[Parent message: ${parentText.substring(0, 500)}]\n\nReply: ${message.text}`;
          }
        } catch (e) {
          // continue without thread context
        }
      }

      let authorName = message.user;
      try {
        const userInfo = await slackClient.users.info({ user: message.user });
        if (userInfo.ok) {
          authorName = userInfo.user.real_name || userInfo.user.name || message.user;
        }
      } catch (e) {
        // use raw user ID
      }

      const classification = await classifyFeedback(messageText, authorName);
      classifiedCount++;

      if (!classification || !classification.is_feedback || classification.confidence < 0.6) {
        cycleStats.skipped++;
        continue;
      }

      const slackLink = `https://eudia.slack.com/archives/${FEEDBACK_CHANNEL_ID}/p${message.ts.replace('.', '')}`;

      const feedbackItem = {
        summary: classification.summary,
        feedback_type: classification.feedback_type || 'Quality Feedback',
        product_area: Array.isArray(classification.product_area) ? classification.product_area.join(';') : (classification.product_area || 'Other'),
        account_name: classification.account_name || null,
        source_author: authorName,
        source_date: new Date(parseFloat(message.ts) * 1000).toISOString(),
        raw_message: message.text,
        priority: classification.priority || 'Medium',
        status: 'New',
        tags: Array.isArray(classification.tags) ? classification.tags.join(', ') : (classification.tags || ''),
        source_channel: FEEDBACK_CHANNEL_NAME,
        slack_message_ts: message.ts,
        slack_message_link: slackLink
      };

      if (DRY_RUN) {
        logger.info(`[FeedbackExtractor] [DRY RUN] Would store: [${classification.feedback_type}] ${classification.summary?.substring(0, 100)}`);
      } else {
        await feedbackStore.storeFeedback(feedbackItem);
      }
      feedbackFound++;
      cycleStats.stored++;
      logger.info(`[FeedbackExtractor] Captured: [${classification.feedback_type}] ${classification.summary?.substring(0, 80)}`);
    }

    lastPollTime = Date.now();
    cycleStats.classified = classifiedCount;
    const elapsed = Date.now() - startTime;
    const estTokens = classifiedCount * 500;
    logger.info(`[FeedbackExtractor] Cycle complete: ${messages.length} fetched, ${classifiedCount} classified, ${feedbackFound} feedback items, ${cycleStats.skipped} skipped (${elapsed}ms, est. ~${Math.round(estTokens / 1000)}K tokens)${DRY_RUN ? ' [DRY RUN]' : ''}`);

    return { messagesProcessed: messages.length, feedbackFound, classified: classifiedCount, tokensEstimate: estTokens };

  } catch (error) {
    logger.error('[FeedbackExtractor] Poll error:', error.message);
    return { messagesProcessed: 0, feedbackFound: 0 };
  } finally {
    isPolling = false;
  }
}

async function classifyFeedback(messageText, authorName) {
  try {
    const prompt = FEEDBACK_CLASSIFICATION_PROMPT
      .replace('{author}', authorName || 'Unknown')
      .replace('{message}', messageText);

    const response = await socratesAdapter.createChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 600
    });

    if (!response || !response.choices || !response.choices[0]) return null;

    let content = (response.choices[0].message?.content || response.choices[0].text || '').trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();

    return JSON.parse(content);
  } catch (error) {
    logger.error('[FeedbackExtractor] Classification error:', error.message);
    return null;
  }
}

async function backfill(daysBack = 30) {
  if (!slackClient) {
    logger.error('[FeedbackExtractor] Cannot backfill - Slack client not initialized');
    return { total: 0, feedback: 0 };
  }

  logger.info(`[FeedbackExtractor] Starting backfill: ${daysBack} days`);
  const oldest = ((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000).toString();
  let cursor;
  let totalMessages = 0;
  let totalFeedback = 0;

  try {
    do {
      const params = { channel: FEEDBACK_CHANNEL_ID, oldest, limit: 200 };
      if (cursor) params.cursor = cursor;

      const response = await slackClient.conversations.history(params);
      if (!response.ok) break;

      const messages = response.messages || [];
      totalMessages += messages.length;

      for (const message of messages) {
        if (message.bot_id || message.subtype === 'bot_message') continue;
        if (!message.text || message.text.length < MIN_MESSAGE_LENGTH) continue;
        if (SYSTEM_PATTERNS.some(p => p.test(message.text))) continue;

        const alreadyProcessed = await feedbackStore.isMessageProcessed(message.ts);
        if (alreadyProcessed) continue;

        let authorName = message.user;
        try {
          const userInfo = await slackClient.users.info({ user: message.user });
          if (userInfo.ok) authorName = userInfo.user.real_name || userInfo.user.name || message.user;
        } catch (e) { /* use raw ID */ }

        const classification = await classifyFeedback(message.text, authorName);
        if (!classification || !classification.is_feedback || classification.confidence < 0.6) continue;

        const slackLink = `https://eudia.slack.com/archives/${FEEDBACK_CHANNEL_ID}/p${message.ts.replace('.', '')}`;

        await feedbackStore.storeFeedback({
          summary: classification.summary,
          feedback_type: classification.feedback_type || 'Quality Feedback',
          product_area: Array.isArray(classification.product_area) ? classification.product_area.join(';') : (classification.product_area || 'Other'),
          account_name: classification.account_name || null,
          source_author: authorName,
          source_date: new Date(parseFloat(message.ts) * 1000).toISOString(),
          raw_message: message.text,
          priority: classification.priority || 'Medium',
          status: 'New',
          tags: Array.isArray(classification.tags) ? classification.tags.join(', ') : (classification.tags || ''),
          source_channel: FEEDBACK_CHANNEL_NAME,
          slack_message_ts: message.ts,
          slack_message_link: slackLink
        });
        totalFeedback++;

        await new Promise(r => setTimeout(r, 1500));
      }

      cursor = response.response_metadata?.next_cursor;
      if (cursor) await new Promise(r => setTimeout(r, 1200));

    } while (cursor);

    logger.info(`[FeedbackExtractor] Backfill complete: ${totalMessages} messages → ${totalFeedback} feedback items`);
    return { total: totalMessages, feedback: totalFeedback };

  } catch (error) {
    logger.error('[FeedbackExtractor] Backfill error:', error.message);
    return { total: totalMessages, feedback: totalFeedback };
  }
}

function getStatus() {
  return {
    channelId: FEEDBACK_CHANNEL_ID,
    channelName: FEEDBACK_CHANNEL_NAME,
    isPolling,
    dryRun: DRY_RUN,
    schedule: CRON_SCHEDULE,
    maxPerCycle: MAX_MESSAGES_PER_CYCLE,
    lastPollTime: lastPollTime ? new Date(lastPollTime).toISOString() : null,
    lastCycleStats: cycleStats
  };
}

module.exports = {
  initialize,
  startPolling,
  pollChannel,
  classifyFeedback,
  backfill,
  getStatus
};
