/**
 * Calendar Event Repository
 * Replaces in-memory calendar cache with PostgreSQL + memory fallback.
 * Events persist across restarts.
 */
const db = require('../connection');
const logger = require('../../observability/logger');

// In-memory fallback (matches existing behavior)
const memoryCache = {};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

class CalendarRepository {
  /**
   * Store calendar events for a user
   */
  async cacheEvents(userEmail, events) {
    if (db.isAvailable()) {
      try {
        // Use a transaction to replace all events for this user/date range
        await db.transaction(async (client) => {
          for (const event of events) {
            await client.query(`
              INSERT INTO calendar_events 
                (user_email, event_id, subject, start_time, end_time, location,
                 organizer_name, organizer_email, attendees, is_all_day, 
                 is_cancelled, body_preview, web_link, account_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (user_email, event_id) DO UPDATE SET
                subject = $3, start_time = $4, end_time = $5, location = $6,
                organizer_name = $7, organizer_email = $8, attendees = $9,
                is_all_day = $10, is_cancelled = $11, body_preview = $12,
                web_link = $13, account_name = $14, fetched_at = NOW()
            `, [
              userEmail, event.id, event.subject, event.start, event.end,
              event.location, event.organizer?.name, event.organizer?.email,
              JSON.stringify(event.attendees || []), event.isAllDay || false,
              event.isCancelled || false, event.bodyPreview, event.webLink,
              event.accountName
            ]);
          }
        });
        return;
      } catch (err) {
        logger.warn('[CalendarRepo] DB write failed:', err.message);
      }
    }
    // Memory fallback
    memoryCache[userEmail] = { events, cachedAt: Date.now() };
  }

  /**
   * Get today's events for a user
   */
  async getTodayEvents(userEmail) {
    if (db.isAvailable()) {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        
        const result = await db.query(`
          SELECT * FROM calendar_events 
          WHERE user_email = $1 
            AND start_time >= $2 
            AND start_time < $3 
            AND is_cancelled = FALSE
          ORDER BY start_time ASC
        `, [userEmail, startOfDay.toISOString(), endOfDay.toISOString()]);
        
        if (result.rows.length > 0) {
          return result.rows.map(this._rowToEvent);
        }
        // Fall through to null if DB has no results (trigger fresh fetch)
      } catch (err) {
        logger.warn('[CalendarRepo] DB read failed:', err.message);
      }
    }
    
    // Memory fallback
    const cached = memoryCache[userEmail];
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return cached.events;
    }
    return null; // Cache miss — caller should fetch from Graph API
  }

  /**
   * Get events for a user within a date range
   */
  async getEventsByRange(userEmail, startDate, endDate) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT * FROM calendar_events 
          WHERE user_email = $1 
            AND start_time >= $2 
            AND start_time < $3 
            AND is_cancelled = FALSE
          ORDER BY start_time ASC
        `, [userEmail, startDate, endDate]);
        return result.rows.map(this._rowToEvent);
      } catch (err) {
        logger.warn('[CalendarRepo] DB read failed:', err.message);
      }
    }
    return [];
  }

  /**
   * Invalidate cache for a user (force re-fetch)
   */
  async invalidate(userEmail) {
    delete memoryCache[userEmail];
    if (db.isAvailable()) {
      try {
        await db.query(
          'DELETE FROM calendar_events WHERE user_email = $1', [userEmail]
        );
      } catch (err) {
        // Non-critical
      }
    }
  }

  _rowToEvent(row) {
    return {
      id: row.event_id,
      subject: row.subject,
      start: row.start_time,
      end: row.end_time,
      location: row.location,
      organizer: { name: row.organizer_name, email: row.organizer_email },
      attendees: row.attendees || [],
      isAllDay: row.is_all_day,
      isCancelled: row.is_cancelled,
      bodyPreview: row.body_preview,
      webLink: row.web_link,
      accountName: row.account_name
    };
  }
}

module.exports = new CalendarRepository();
