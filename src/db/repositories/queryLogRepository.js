/**
 * Query Log Repository
 * Logs every GTM Brain query to PostgreSQL for analytics, quality tracking,
 * and feedback linkage. Falls back to in-memory buffer if DB unavailable.
 */
const db = require('../connection');
const crypto = require('crypto');
const logger = require('../../observability/logger') || console;

class QueryLogRepository {
  constructor() {
    this._buffer = [];
    this._maxBuffer = 100;
  }

  _hashQuery(text) {
    return crypto.createHash('sha256').update((text || '').toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  async logQuery({ query, intent, accountId, accountName, userEmail, sessionId, responseSnippet, responseLength, contextType, dataFreshness, responseTimeMs, sfStatus, error }) {
    const queryHash = this._hashQuery(query);
    const snippet = (responseSnippet || '').substring(0, 500);

    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          INSERT INTO query_logs (query_text, query_hash, detected_intent, account_id, account_name, user_email, session_id, response_snippet, response_length, context_type, data_freshness, response_time_ms, sf_connection_status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `, [query, queryHash, intent, accountId || null, accountName || null, userEmail || null, sessionId || null, snippet, responseLength || 0, contextType || null, dataFreshness || null, responseTimeMs || 0, sfStatus || null, error || null]);
        return result.rows?.[0]?.id || null;
      } catch (err) {
        logger.warn('[QueryLogRepo] DB write failed:', err.message);
      }
    }

    if (this._buffer.length < this._maxBuffer) {
      this._buffer.push({ query, queryHash, intent, accountId, userEmail, timestamp: new Date().toISOString() });
    }
    return null;
  }

  async saveFeedback({ queryLogId, queryText, queryHash, answerSnippet, accountName, accountId, userEmail, sessionId, rating, category, comment }) {
    if (!queryHash && queryText) {
      queryHash = this._hashQuery(queryText);
    }

    if (db.isAvailable()) {
      try {
        // Try to find the most recent query_log entry matching this session/hash
        let resolvedLogId = queryLogId;
        if (!resolvedLogId && (sessionId || queryHash)) {
          const lookup = await db.query(
            `SELECT id FROM query_logs WHERE (session_id = $1 OR query_hash = $2) ORDER BY created_at DESC LIMIT 1`,
            [sessionId || '', queryHash || '']
          );
          resolvedLogId = lookup.rows?.[0]?.id || null;
        }

        await db.query(`
          INSERT INTO feedback (query_log_id, query_text, query_hash, answer_snippet, account_name, account_id, user_email, session_id, rating, category, comment)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [resolvedLogId, (queryText || '').substring(0, 200), queryHash, (answerSnippet || '').substring(0, 500), accountName || null, accountId || null, userEmail || null, sessionId || null, rating, category || null, comment || null]);
        return true;
      } catch (err) {
        logger.warn('[QueryLogRepo] Feedback write failed:', err.message);
      }
    }
    return false;
  }

  async getFeedbackAnalytics(days = 30) {
    if (!db.isAvailable()) return null;
    try {
      const [totals, byIntent, byCategory, byAccount, weekly] = await Promise.all([
        db.query(`
          SELECT rating, COUNT(*) as cnt FROM feedback
          WHERE created_at >= NOW() - INTERVAL '${days} days' GROUP BY rating
        `),
        db.query(`
          SELECT ql.detected_intent as intent, f.rating, COUNT(*) as cnt
          FROM feedback f LEFT JOIN query_logs ql ON f.query_log_id = ql.id
          WHERE f.created_at >= NOW() - INTERVAL '${days} days' AND ql.detected_intent IS NOT NULL
          GROUP BY ql.detected_intent, f.rating ORDER BY cnt DESC LIMIT 20
        `),
        db.query(`
          SELECT category, COUNT(*) as cnt FROM feedback
          WHERE rating = 'not_helpful' AND created_at >= NOW() - INTERVAL '${days} days' AND category IS NOT NULL
          GROUP BY category ORDER BY cnt DESC
        `),
        db.query(`
          SELECT account_name, rating, COUNT(*) as cnt FROM feedback
          WHERE created_at >= NOW() - INTERVAL '${days} days' AND account_name IS NOT NULL
          GROUP BY account_name, rating ORDER BY cnt DESC LIMIT 20
        `),
        db.query(`
          SELECT DATE_TRUNC('week', created_at) as week, rating, COUNT(*) as cnt
          FROM feedback WHERE created_at >= NOW() - INTERVAL '90 days'
          GROUP BY week, rating ORDER BY week
        `)
      ]);

      const helpfulCount = totals.rows.find(r => r.rating === 'helpful')?.cnt || 0;
      const notHelpfulCount = totals.rows.find(r => r.rating === 'not_helpful')?.cnt || 0;
      const total = parseInt(helpfulCount) + parseInt(notHelpfulCount);

      return {
        period: `${days} days`,
        total,
        helpful: parseInt(helpfulCount),
        notHelpful: parseInt(notHelpfulCount),
        helpfulRate: total > 0 ? Math.round((parseInt(helpfulCount) / total) * 100) : 0,
        byIntent: byIntent.rows,
        byCategory: byCategory.rows,
        byAccount: byAccount.rows,
        weeklyTrend: weekly.rows
      };
    } catch (err) {
      logger.warn('[QueryLogRepo] Analytics query failed:', err.message);
      return null;
    }
  }
}

module.exports = new QueryLogRepository();
