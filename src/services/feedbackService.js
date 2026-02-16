/**
 * Feedback Service
 * Collects user feedback on GTM Brain intelligence responses.
 * JSON file-based storage (Zero Render Storage pattern).
 * 
 * Data stored: query, answer snippet, account, user, rating, optional comment.
 * Used to identify failure patterns and improve prompt quality over time.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const FEEDBACK_PATH = path.join(__dirname, '../../data/response-feedback.json');
const MAX_FEEDBACK_ITEMS = 5000;

let feedbackData = [];
let saveDebounce = null;

function loadFeedback() {
  try {
    if (fs.existsSync(FEEDBACK_PATH)) {
      feedbackData = JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8'));
      logger.info(`[Feedback] Loaded ${feedbackData.length} feedback items`);
    }
  } catch (err) {
    logger.warn('[Feedback] Could not load feedback file:', err.message);
    feedbackData = [];
  }
}

function saveFeedback() {
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    try {
      const tmpPath = FEEDBACK_PATH + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(feedbackData, null, 2), 'utf8');
      fs.renameSync(tmpPath, FEEDBACK_PATH);
      logger.info(`[Feedback] Saved ${feedbackData.length} feedback items`);
    } catch (err) {
      logger.error('[Feedback] Save failed:', err.message);
    }
  }, 2000);
}

/**
 * Submit feedback on a response
 * @param {object} feedback - { query, answerSnippet, accountName, accountId, userEmail, sessionId, rating, comment }
 */
function submitFeedback(feedback) {
  const item = {
    id: 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6),
    query: feedback.query || '',
    answerSnippet: (feedback.answerSnippet || '').substring(0, 500),
    accountName: feedback.accountName || null,
    accountId: feedback.accountId || null,
    userEmail: feedback.userEmail || null,
    sessionId: feedback.sessionId || null,
    rating: feedback.rating || 'unknown', // 'helpful' | 'not_helpful'
    comment: (feedback.comment || '').substring(0, 500),
    timestamp: new Date().toISOString()
  };

  feedbackData.push(item);

  // Trim if too large
  if (feedbackData.length > MAX_FEEDBACK_ITEMS) {
    feedbackData = feedbackData.slice(-MAX_FEEDBACK_ITEMS);
  }

  saveFeedback();
  logger.info(`[Feedback] ${item.rating} for "${item.query.substring(0, 40)}" on ${item.accountName || 'no account'}`);
  return item.id;
}

/**
 * Get feedback summary for admin review
 */
function getSummary() {
  const total = feedbackData.length;
  const helpful = feedbackData.filter(f => f.rating === 'helpful').length;
  const notHelpful = feedbackData.filter(f => f.rating === 'not_helpful').length;

  // Recent not-helpful for review
  const recentUnhelpful = feedbackData
    .filter(f => f.rating === 'not_helpful')
    .slice(-20)
    .reverse()
    .map(f => ({
      query: f.query,
      accountName: f.accountName,
      comment: f.comment,
      timestamp: f.timestamp
    }));

  // Top failure patterns (queries that got not_helpful)
  const failureQueries = {};
  feedbackData
    .filter(f => f.rating === 'not_helpful')
    .forEach(f => {
      const key = f.query.toLowerCase().substring(0, 60);
      failureQueries[key] = (failureQueries[key] || 0) + 1;
    });
  const topFailures = Object.entries(failureQueries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  return {
    total,
    helpful,
    notHelpful,
    helpfulRate: total > 0 ? Math.round((helpful / total) * 100) : 0,
    recentUnhelpful,
    topFailures,
    oldestFeedback: feedbackData[0]?.timestamp || null,
    newestFeedback: feedbackData[feedbackData.length - 1]?.timestamp || null
  };
}

// Initialize on load
loadFeedback();

module.exports = {
  submitFeedback,
  getSummary,
  getFeedbackCount: () => feedbackData.length
};
