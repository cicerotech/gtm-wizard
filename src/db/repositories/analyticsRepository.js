/**
 * Analytics Event Repository
 * Replaces in-memory analytics tracking with persistent PostgreSQL storage.
 */
const db = require('../connection');
const logger = require('../../observability/logger');

// In-memory fallback (current behavior)
const memoryCounters = {
  requestCount: 0,
  errorCount: 0,
  uniqueUsers: new Set(),
  commandCounts: {}
};

class AnalyticsRepository {
  /**
   * Track an analytics event
   */
  async trackEvent(eventName, userEmail, properties = {}) {
    if (db.isAvailable()) {
      try {
        await db.query(`
          INSERT INTO analytics_events (event_name, user_email, properties)
          VALUES ($1, $2, $3)
        `, [eventName, userEmail, JSON.stringify(properties)]);
        return;
      } catch (err) {
        // Silent fallback for analytics
      }
    }
    // Memory fallback
    memoryCounters.requestCount++;
    if (userEmail) memoryCounters.uniqueUsers.add(userEmail);
    if (properties.command) {
      memoryCounters.commandCounts[properties.command] = 
        (memoryCounters.commandCounts[properties.command] || 0) + 1;
    }
  }

  /**
   * Track an error event
   */
  async trackError(userEmail, errorMessage, properties = {}) {
    memoryCounters.errorCount++;
    return this.trackEvent('error', userEmail, { ...properties, errorMessage });
  }

  /**
   * Get usage summary for the last N days
   */
  async getUsageSummary(days = 7) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT 
            COUNT(*) as total_events,
            COUNT(DISTINCT user_email) as unique_users,
            COUNT(CASE WHEN event_name = 'error' THEN 1 END) as errors,
            DATE(created_at) as day
          FROM analytics_events 
          WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
          ORDER BY day DESC
        `);
        return result.rows;
      } catch (err) {
        logger.warn('[AnalyticsRepo] DB read failed:', err.message);
      }
    }
    // Memory fallback
    return [{
      total_events: memoryCounters.requestCount,
      unique_users: memoryCounters.uniqueUsers.size,
      errors: memoryCounters.errorCount,
      day: new Date().toISOString().split('T')[0]
    }];
  }

  /**
   * Get top commands/features by usage
   */
  async getTopFeatures(days = 30, limit = 20) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT event_name, COUNT(*) as count 
          FROM analytics_events 
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND event_name != 'error'
          GROUP BY event_name 
          ORDER BY count DESC 
          LIMIT $1
        `, [limit]);
        return result.rows;
      } catch (err) {
        logger.warn('[AnalyticsRepo] DB read failed:', err.message);
      }
    }
    return Object.entries(memoryCounters.commandCounts)
      .map(([name, count]) => ({ event_name: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get in-memory counters (for backward compatibility)
   */
  getMemoryCounters() {
    return {
      requestCount: memoryCounters.requestCount,
      errorCount: memoryCounters.errorCount,
      uniqueUsers: memoryCounters.uniqueUsers.size
    };
  }
}

module.exports = new AnalyticsRepository();
