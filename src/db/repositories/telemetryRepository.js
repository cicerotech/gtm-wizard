/**
 * Telemetry Event Repository
 * Replaces data/telemetry-log.json with PostgreSQL + file fallback.
 */
const db = require('../connection');
const fs = require('fs');
const path = require('path');
const logger = require('../../observability/logger');

const FALLBACK_PATH = path.join(__dirname, '..', '..', '..', 'data', 'telemetry-log.json');

class TelemetryRepository {
  /**
   * Record a telemetry event
   */
  async recordEvent(eventType, userEmail, pluginVersion, eventData, errorMessage, errorStack) {
    if (db.isAvailable()) {
      try {
        await db.query(`
          INSERT INTO telemetry_events (event_type, user_email, plugin_version, event_data, error_message, error_stack)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventType, userEmail, pluginVersion, JSON.stringify(eventData || {}), errorMessage, errorStack]);
        return;
      } catch (err) {
        logger.warn('[TelemetryRepo] DB write failed:', err.message);
      }
    }
    this._appendToFile({ eventType, userEmail, pluginVersion, eventData, errorMessage, timestamp: new Date().toISOString() });
  }

  /**
   * Get recent telemetry events
   */
  async getRecentEvents(limit = 100, eventType = null) {
    if (db.isAvailable()) {
      try {
        let query = 'SELECT * FROM telemetry_events';
        const params = [];
        if (eventType) {
          query += ' WHERE event_type = $1';
          params.push(eventType);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const result = await db.query(query, params);
        return result.rows;
      } catch (err) {
        logger.warn('[TelemetryRepo] DB read failed:', err.message);
      }
    }
    return this._readFromFile(limit);
  }

  /**
   * Get error counts by type in the last N hours
   */
  async getErrorCounts(hours = 24) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT event_type, COUNT(*) as count 
          FROM telemetry_events 
          WHERE event_type = 'error' 
            AND created_at > NOW() - INTERVAL '${hours} hours'
          GROUP BY event_type
        `);
        return result.rows;
      } catch (err) {
        logger.warn('[TelemetryRepo] DB read failed:', err.message);
      }
    }
    return [];
  }

  // ── File fallback ─────────────────────────────────────────────────
  _appendToFile(data) {
    try {
      let existing = [];
      if (fs.existsSync(FALLBACK_PATH)) {
        existing = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
        if (!Array.isArray(existing)) existing = [];
      }
      existing.push(data);
      // Keep last 500 in file mode
      if (existing.length > 500) existing = existing.slice(-500);
      fs.writeFileSync(FALLBACK_PATH, JSON.stringify(existing, null, 2));
    } catch (e) {
      // Silent fail for telemetry
    }
  }

  _readFromFile(limit) {
    try {
      if (!fs.existsSync(FALLBACK_PATH)) return [];
      const data = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
      if (!Array.isArray(data)) return [];
      return data.slice(-limit).reverse();
    } catch (e) {
      return [];
    }
  }
}

module.exports = new TelemetryRepository();
