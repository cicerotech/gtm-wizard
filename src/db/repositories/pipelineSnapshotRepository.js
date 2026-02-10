/**
 * Pipeline Snapshot Repository
 * Replaces data/bl-snapshots.json with PostgreSQL + file fallback.
 * Unlimited history instead of 12-week rolling window.
 */
const db = require('../connection');
const fs = require('fs');
const path = require('path');
const logger = require('../../observability/logger');

const FALLBACK_PATH = path.join(__dirname, '..', '..', '..', 'data', 'bl-snapshots.json');

class PipelineSnapshotRepository {
  /**
   * Store a weekly BL snapshot
   */
  async saveSnapshot(snapshotDate, blName, data) {
    if (db.isAvailable()) {
      try {
        await db.query(`
          INSERT INTO pipeline_snapshots (snapshot_date, bl_name, deal_count, total_acv, weighted_acv, commit_acv, in_qtr_commit_acv, deals_by_stage, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (snapshot_date, bl_name) DO UPDATE SET
            deal_count = $3, total_acv = $4, weighted_acv = $5,
            commit_acv = $6, in_qtr_commit_acv = $7,
            deals_by_stage = $8, metadata = $9
        `, [
          snapshotDate, blName,
          data.dealCount || 0, data.totalAcv || 0, data.weightedAcv || 0,
          data.commitAcv || 0, data.inQtrCommitAcv || 0,
          JSON.stringify(data.dealsByStage || {}),
          JSON.stringify(data.metadata || {})
        ]);
        return;
      } catch (err) {
        logger.warn('[PipelineSnapshotRepo] DB write failed:', err.message);
      }
    }
    this._saveToFile(snapshotDate, blName, data);
  }

  /**
   * Get snapshots for a specific BL over time
   */
  async getBlHistory(blName, weeks = 52) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT * FROM pipeline_snapshots 
          WHERE bl_name = $1 
          ORDER BY snapshot_date DESC 
          LIMIT $2
        `, [blName, weeks]);
        return result.rows;
      } catch (err) {
        logger.warn('[PipelineSnapshotRepo] DB read failed:', err.message);
      }
    }
    return this._readFromFile(blName);
  }

  /**
   * Get the latest snapshot for all BLs
   */
  async getLatestSnapshots() {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT DISTINCT ON (bl_name) *
          FROM pipeline_snapshots
          ORDER BY bl_name, snapshot_date DESC
        `);
        return result.rows;
      } catch (err) {
        logger.warn('[PipelineSnapshotRepo] DB read failed:', err.message);
      }
    }
    return [];
  }

  /**
   * Get WoW deltas for a BL
   */
  async getWowDeltas(blName) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT * FROM pipeline_snapshots 
          WHERE bl_name = $1 
          ORDER BY snapshot_date DESC 
          LIMIT 2
        `, [blName]);
        if (result.rows.length < 2) return null;
        const [current, previous] = result.rows;
        return {
          acvDelta: (current.total_acv || 0) - (previous.total_acv || 0),
          dealCountDelta: (current.deal_count || 0) - (previous.deal_count || 0),
          commitDelta: (current.commit_acv || 0) - (previous.commit_acv || 0),
          current, previous
        };
      } catch (err) {
        logger.warn('[PipelineSnapshotRepo] DB read failed:', err.message);
      }
    }
    return null;
  }

  // ── File fallback ─────────────────────────────────────────────────
  _saveToFile(snapshotDate, blName, data) {
    try {
      let existing = {};
      if (fs.existsSync(FALLBACK_PATH)) {
        existing = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
      }
      if (!existing[blName]) existing[blName] = [];
      existing[blName].unshift({ date: snapshotDate, ...data });
      // Keep last 12 weeks in file mode
      existing[blName] = existing[blName].slice(0, 12);
      fs.writeFileSync(FALLBACK_PATH, JSON.stringify(existing, null, 2));
    } catch (e) {
      logger.warn('[PipelineSnapshotRepo] File write failed:', e.message);
    }
  }

  _readFromFile(blName) {
    try {
      if (!fs.existsSync(FALLBACK_PATH)) return [];
      const data = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
      return data[blName] || [];
    } catch (e) {
      return [];
    }
  }
}

module.exports = new PipelineSnapshotRepository();
