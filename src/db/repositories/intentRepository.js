/**
 * Intent Query Repository
 * Replaces data/intent-learning.json with PostgreSQL + file fallback.
 */
const db = require('../connection');
const fs = require('fs');
const path = require('path');
const logger = require('../../observability/logger');

const FALLBACK_PATH = path.join(__dirname, '..', '..', '..', 'data', 'intent-learning.json');

class IntentRepository {
  /**
   * Record a query and its detected intent
   */
  async recordQuery(queryHash, queryText, detectedIntent, confidence, method) {
    if (db.isAvailable()) {
      try {
        await db.query(`
          INSERT INTO intent_queries (query_hash, query_text, detected_intent, confidence, method)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (query_hash) DO UPDATE SET
            usage_count = intent_queries.usage_count + 1,
            last_used_at = NOW(),
            confidence = GREATEST(intent_queries.confidence, $4)
        `, [queryHash, queryText, detectedIntent, confidence, method]);
        return;
      } catch (err) {
        logger.warn('[IntentRepo] DB write failed, falling back to file:', err.message);
      }
    }
    // File fallback
    this._appendToFile(queryHash, { queryText, detectedIntent, confidence, method });
  }

  /**
   * Get learning data for a specific query hash
   */
  async getByHash(queryHash) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          'SELECT * FROM intent_queries WHERE query_hash = $1', [queryHash]
        );
        return result.rows[0] || null;
      } catch (err) {
        logger.warn('[IntentRepo] DB read failed:', err.message);
      }
    }
    return this._readFromFile(queryHash);
  }

  /**
   * Get top intents by usage
   */
  async getTopIntents(limit = 20) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          'SELECT detected_intent, COUNT(*) as count, AVG(confidence) as avg_confidence FROM intent_queries GROUP BY detected_intent ORDER BY count DESC LIMIT $1',
          [limit]
        );
        return result.rows;
      } catch (err) {
        logger.warn('[IntentRepo] DB read failed:', err.message);
      }
    }
    return [];
  }

  // ── File fallback helpers ──────────────────────────────────────────
  _appendToFile(queryHash, data) {
    try {
      let existing = {};
      if (fs.existsSync(FALLBACK_PATH)) {
        existing = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
      }
      existing[queryHash] = { ...data, lastUsed: new Date().toISOString() };
      fs.writeFileSync(FALLBACK_PATH, JSON.stringify(existing, null, 2));
    } catch (e) {
      logger.warn('[IntentRepo] File write failed:', e.message);
    }
  }

  _readFromFile(queryHash) {
    try {
      if (!fs.existsSync(FALLBACK_PATH)) return null;
      const data = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
      return data[queryHash] || null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = new IntentRepository();
