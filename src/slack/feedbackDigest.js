/**
 * Product Feedback Weekly Digest
 * Sends a categorized summary of product feedback to Slack.
 * Groups by product area and feedback type with trend counts.
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const feedbackStore = require('../services/feedbackStore');

const DIGEST_CHANNEL = process.env.FEEDBACK_DIGEST_CHANNEL || 'U094AQE9V7D';

let slackClient = null;

function initialize(client) {
  slackClient = client;
}

function scheduleWeeklyDigest() {
  cron.schedule('0 9 * * 5', async () => {
    logger.info('[FeedbackDigest] Weekly digest triggered');
    await sendDigest(DIGEST_CHANNEL);
  });
  logger.info('[FeedbackDigest] Weekly digest scheduled: Fridays 9:00 AM');
}

async function sendDigest(channelId, daysBack = 7) {
  if (!slackClient) {
    logger.error('[FeedbackDigest] Slack client not initialized');
    return;
  }

  try {
    const feedback = await feedbackStore.getAllFeedback({ days_back: daysBack });
    const stats = await feedbackStore.getFeedbackStats(daysBack);

    if (feedback.length === 0) {
      await slackClient.chat.postMessage({
        channel: channelId,
        text: `📋 *Product Feedback Digest* (last ${daysBack} days)\n\nNo new feedback captured this period.`
      });
      return;
    }

    const byArea = {};
    for (const item of feedback) {
      const areas = (item.product_area || 'Other').split(';');
      for (const area of areas) {
        const trimmed = area.trim();
        if (!byArea[trimmed]) byArea[trimmed] = [];
        byArea[trimmed].push(item);
      }
    }

    const byType = {};
    for (const item of feedback) {
      const type = item.feedback_type || 'Other';
      byType[type] = (byType[type] || 0) + 1;
    }

    let headerText = `📋 *Product Feedback Digest* — Last ${daysBack} days\n`;
    headerText += `*${feedback.length} items* captured`;

    const typeSummary = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}: ${count}`)
      .join(' · ');
    if (typeSummary) headerText += ` (${typeSummary})`;

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `Product Feedback Digest — Last ${daysBack} days` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${feedback.length} items* captured  (${typeSummary})` } },
      { type: 'divider' }
    ];

    const sortedAreas = Object.entries(byArea).sort((a, b) => b[1].length - a[1].length);

    for (const [area, items] of sortedAreas) {
      const areaTypes = {};
      for (const item of items) {
        const t = item.feedback_type || 'Other';
        areaTypes[t] = (areaTypes[t] || 0) + 1;
      }
      const areaTypeLine = Object.entries(areaTypes).map(([t, c]) => `${c} ${t.toLowerCase()}`).join(', ');

      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${area}* — ${items.length} items (${areaTypeLine})` }
      });

      const topItems = items
        .sort((a, b) => {
          const pOrder = { High: 0, Medium: 1, Low: 2 };
          return (pOrder[a.priority] || 1) - (pOrder[b.priority] || 1);
        })
        .slice(0, 5);

      for (const item of topItems) {
        const priorityIcon = item.priority === 'High' ? '🔴' : item.priority === 'Medium' ? '🟡' : '⚪';
        const acctLabel = item.account_name ? ` · _${item.account_name}_` : '';
        const link = item.slack_message_link ? ` <${item.slack_message_link}|view>` : '';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${priorityIcon} ${item.summary}${acctLabel}${link}\n_${item.source_author} · ${formatDate(item.source_date)}_`
          }
        });
      }

      if (items.length > 5) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `_+${items.length - 5} more in ${area}_` }]
        });
      }

      blocks.push({ type: 'divider' });
    }

    const tagCounts = {};
    for (const item of feedback) {
      if (!item.tags) continue;
      for (const tag of item.tags.split(',').map(t => t.trim()).filter(t => t)) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topTags.length > 0) {
      const tagLine = topTags.map(([tag, count]) => `\`${tag}\` (${count})`).join('  ');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Trending Tags:* ${tagLine}` }
      });
    }

    await slackClient.chat.postMessage({
      channel: channelId,
      text: headerText,
      blocks: blocks.slice(0, 50)
    });

    logger.info(`[FeedbackDigest] Digest sent to ${channelId}: ${feedback.length} items`);

  } catch (error) {
    logger.error('[FeedbackDigest] Error sending digest:', error.message);
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

module.exports = {
  initialize,
  scheduleWeeklyDigest,
  sendDigest
};
