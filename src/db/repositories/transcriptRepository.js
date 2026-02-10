/**
 * Transcript Archive Repository
 * New capability — stores all transcribed meetings for search and analysis.
 */
const db = require('../connection');
const logger = require('../../observability/logger');

class TranscriptRepository {
  /**
   * Archive a transcribed meeting
   */
  async archiveTranscript(data) {
    if (!db.isAvailable()) {
      logger.debug('[TranscriptRepo] DB not available, transcript not archived');
      return null;
    }

    try {
      const result = await db.query(`
        INSERT INTO transcript_archive 
          (meeting_date, meeting_subject, account_name, account_id, transcript,
           summary, sections, duration_seconds, attendees, meeting_type, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        data.meetingDate || new Date(),
        data.meetingSubject,
        data.accountName,
        data.accountId,
        data.transcript,
        data.summary,
        JSON.stringify(data.sections || {}),
        data.durationSeconds,
        JSON.stringify(data.attendees || []),
        data.meetingType || 'discovery',
        data.source || 'plugin'
      ]);
      return result.rows[0]?.id;
    } catch (err) {
      logger.warn('[TranscriptRepo] Archive failed:', err.message);
      return null;
    }
  }

  /**
   * Search transcripts by account
   */
  async getByAccount(accountId, limit = 20) {
    if (!db.isAvailable()) return [];
    try {
      const result = await db.query(`
        SELECT id, meeting_date, meeting_subject, summary, meeting_type, duration_seconds
        FROM transcript_archive 
        WHERE account_id = $1 
        ORDER BY meeting_date DESC 
        LIMIT $2
      `, [accountId, limit]);
      return result.rows;
    } catch (err) {
      logger.warn('[TranscriptRepo] Search failed:', err.message);
      return [];
    }
  }

  /**
   * Get pipeline review transcripts
   */
  async getPipelineReviews(limit = 10) {
    if (!db.isAvailable()) return [];
    try {
      const result = await db.query(`
        SELECT * FROM transcript_archive 
        WHERE meeting_type = 'pipeline_review' 
        ORDER BY meeting_date DESC 
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (err) {
      logger.warn('[TranscriptRepo] Pipeline review search failed:', err.message);
      return [];
    }
  }

  /**
   * Full-text search across transcripts
   */
  async searchTranscripts(searchTerm, limit = 10) {
    if (!db.isAvailable()) return [];
    try {
      const result = await db.query(`
        SELECT id, meeting_date, meeting_subject, account_name, meeting_type,
               LEFT(summary, 200) as summary_preview
        FROM transcript_archive 
        WHERE transcript ILIKE $1 OR summary ILIKE $1 OR meeting_subject ILIKE $1
        ORDER BY meeting_date DESC 
        LIMIT $2
      `, [`%${searchTerm}%`, limit]);
      return result.rows;
    } catch (err) {
      logger.warn('[TranscriptRepo] Search failed:', err.message);
      return [];
    }
  }

  /**
   * Save a pipeline review summary
   */
  async savePipelineReviewSummary(data) {
    if (!db.isAvailable()) return null;
    try {
      const result = await db.query(`
        INSERT INTO pipeline_review_summaries 
          (review_date, summary_markdown, priority_actions, bl_context,
           account_details, forecast_changes, action_items, salesforce_snapshot, transcript_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        data.reviewDate || new Date(),
        data.summaryMarkdown,
        JSON.stringify(data.priorityActions || []),
        JSON.stringify(data.blContext || {}),
        JSON.stringify(data.accountDetails || {}),
        JSON.stringify(data.forecastChanges || []),
        JSON.stringify(data.actionItems || []),
        JSON.stringify(data.salesforceSnapshot || {}),
        data.transcriptId
      ]);
      return result.rows[0]?.id;
    } catch (err) {
      logger.warn('[TranscriptRepo] Pipeline summary save failed:', err.message);
      return null;
    }
  }
}

module.exports = new TranscriptRepository();
