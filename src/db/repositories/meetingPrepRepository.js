/**
 * Meeting Prep Repository
 * Replaces file-based meeting prep storage with PostgreSQL + file fallback.
 * Enables queryable, durable meeting prep data that survives Render restarts.
 */
const db = require('../connection');
const logger = require('../../observability/logger');

class MeetingPrepRepository {
  /**
   * Save or update meeting prep (upsert by meeting_id)
   */
  async save(data) {
    if (!db.isAvailable()) return false;

    try {
      await db.query(`
        INSERT INTO meeting_preps 
          (meeting_id, account_id, account_name, meeting_title, meeting_date,
           agenda, goals, demo_selections, context_override, additional_notes,
           external_attendees, internal_attendees, source, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (meeting_id) DO UPDATE SET
          account_id = COALESCE($2, meeting_preps.account_id),
          account_name = COALESCE($3, meeting_preps.account_name),
          meeting_title = COALESCE($4, meeting_preps.meeting_title),
          meeting_date = COALESCE($5, meeting_preps.meeting_date),
          agenda = $6,
          goals = $7,
          demo_selections = $8,
          context_override = COALESCE($9, meeting_preps.context_override),
          additional_notes = $10,
          external_attendees = COALESCE($11, meeting_preps.external_attendees),
          internal_attendees = COALESCE($12, meeting_preps.internal_attendees),
          updated_at = NOW()
      `, [
        data.meetingId || data.meeting_id,
        data.accountId || data.account_id || null,
        data.accountName || data.account_name || null,
        data.meetingTitle || data.meeting_title || null,
        data.meetingDate || data.meeting_date || null,
        JSON.stringify(data.agenda || []),
        JSON.stringify(data.goals || []),
        JSON.stringify(data.demoSelections || data.demo_selections || []),
        data.contextOverride || data.context_override || null,
        JSON.stringify(data.additionalNotes || data.additional_notes || []),
        JSON.stringify(data.externalAttendees || data.external_attendees || []),
        JSON.stringify(data.internalAttendees || data.internal_attendees || []),
        data.source || 'outlook',
        data.createdBy || data.created_by || null
      ]);
      return true;
    } catch (err) {
      logger.warn('[MeetingPrepRepo] DB write failed:', err.message);
      return false;
    }
  }

  /**
   * Get meeting prep by meeting ID
   */
  async getByMeetingId(meetingId) {
    if (!db.isAvailable()) return null;

    try {
      const result = await db.query(
        'SELECT * FROM meeting_preps WHERE meeting_id = $1',
        [meetingId]
      );
      return result.rows[0] ? this._rowToPrep(result.rows[0]) : null;
    } catch (err) {
      logger.warn('[MeetingPrepRepo] DB read failed:', err.message);
      return null;
    }
  }

  /**
   * Get all meeting preps for an account (historical context)
   */
  async getByAccountId(accountId) {
    if (!db.isAvailable()) return [];

    try {
      const result = await db.query(
        'SELECT * FROM meeting_preps WHERE account_id = $1 ORDER BY meeting_date DESC LIMIT 50',
        [accountId]
      );
      return result.rows.map(this._rowToPrep);
    } catch (err) {
      logger.warn('[MeetingPrepRepo] DB read failed:', err.message);
      return [];
    }
  }

  /**
   * Delete meeting prep
   */
  async delete(meetingId) {
    if (!db.isAvailable()) return false;

    try {
      await db.query('DELETE FROM meeting_preps WHERE meeting_id = $1', [meetingId]);
      return true;
    } catch (err) {
      logger.warn('[MeetingPrepRepo] DB delete failed:', err.message);
      return false;
    }
  }

  _rowToPrep(row) {
    return {
      meetingId: row.meeting_id,
      accountId: row.account_id,
      accountName: row.account_name,
      meetingTitle: row.meeting_title,
      meetingDate: row.meeting_date,
      agenda: row.agenda || [],
      goals: row.goals || [],
      demoSelections: row.demo_selections || [],
      contextOverride: row.context_override,
      additionalNotes: row.additional_notes || [],
      externalAttendees: row.external_attendees || [],
      internalAttendees: row.internal_attendees || [],
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = new MeetingPrepRepository();
