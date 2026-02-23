/**
 * Product Feedback Store
 * SQLite + JSON cache + SFDC sync for product feedback.
 * Adapted from intelligenceStore.js for product feedback use case.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { sfConnection } = require('../salesforce/connection');

const DB_PATH = process.env.INTEL_DB_PATH || path.join(__dirname, '../../data/intelligence.db');
const CACHE_PATH = path.join(__dirname, '../../data/product-feedback-cache.json');

let db = null;

async function initialize(existingDb) {
  if (existingDb) {
    db = existingDb;
  } else {
    await new Promise((resolve, reject) => {
      db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) { reject(err); return; }
        resolve();
      });
    });
  }

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS product_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT,
        feedback_type TEXT,
        product_area TEXT,
        account_name TEXT,
        account_id TEXT,
        source_author TEXT,
        source_date TEXT,
        raw_message TEXT,
        priority TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'New',
        tags TEXT,
        source_channel TEXT,
        slack_message_ts TEXT UNIQUE,
        slack_message_link TEXT,
        sf_record_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) { reject(err); return; }
      db.run(`CREATE INDEX IF NOT EXISTS idx_fb_status ON product_feedback(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fb_type ON product_feedback(feedback_type)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fb_product ON product_feedback(product_area)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fb_account ON product_feedback(account_name)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fb_ts ON product_feedback(slack_message_ts)`, () => resolve());
    });
  });

  logger.info('[FeedbackStore] Initialized');
}

async function storeFeedback(item) {
  if (!db) await initialize();

  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR IGNORE INTO product_feedback
        (summary, feedback_type, product_area, account_name, source_author,
         source_date, raw_message, priority, status, tags, source_channel,
         slack_message_ts, slack_message_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      item.summary, item.feedback_type, item.product_area, item.account_name,
      item.source_author, item.source_date, item.raw_message, item.priority,
      item.status || 'New', item.tags, item.source_channel,
      item.slack_message_ts, item.slack_message_link
    ], function(err) {
      if (err) {
        logger.error('[FeedbackStore] SQLite insert error:', err.message);
        reject(err);
        return;
      }
      updateFileCache();
      resolve(this.lastID);
    });
  });
}

async function isMessageProcessed(messageTs) {
  if (!db) return false;
  return new Promise((resolve) => {
    db.get('SELECT id FROM product_feedback WHERE slack_message_ts = ?', [messageTs], (err, row) => {
      resolve(!!row);
    });
  });
}

async function getAllFeedback(filters = {}) {
  if (!db) await initialize();
  let query = 'SELECT * FROM product_feedback WHERE 1=1';
  const params = [];

  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  if (filters.feedback_type) { query += ' AND feedback_type = ?'; params.push(filters.feedback_type); }
  if (filters.product_area) { query += ' AND product_area LIKE ?'; params.push(`%${filters.product_area}%`); }
  if (filters.account_name) { query += ' AND account_name LIKE ?'; params.push(`%${filters.account_name}%`); }
  if (filters.days_back) {
    const since = new Date(Date.now() - filters.days_back * 24 * 60 * 60 * 1000).toISOString();
    query += ' AND source_date >= ?'; params.push(since);
  }

  query += ' ORDER BY source_date DESC';
  if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }

  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) { reject(err); return; }
      resolve(rows || []);
    });
  });
}

async function getFeedbackStats(daysBack = 30) {
  if (!db) await initialize();
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    db.all(`
      SELECT feedback_type, COUNT(*) as count
      FROM product_feedback
      WHERE source_date >= ?
      GROUP BY feedback_type
      ORDER BY count DESC
    `, [since], (err, typeRows) => {
      if (err) { reject(err); return; }

      db.all(`
        SELECT product_area, COUNT(*) as count
        FROM product_feedback
        WHERE source_date >= ?
        GROUP BY product_area
        ORDER BY count DESC
      `, [since], (err2, areaRows) => {
        if (err2) { reject(err2); return; }

        db.get(`SELECT COUNT(*) as total FROM product_feedback WHERE source_date >= ?`, [since], (err3, totalRow) => {
          if (err3) { reject(err3); return; }
          resolve({
            total: totalRow?.total || 0,
            byType: typeRows || [],
            byArea: areaRows || [],
            period: `${daysBack} days`
          });
        });
      });
    });
  });
}

async function updateStatus(id, status) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    db.run('UPDATE product_feedback SET status = ? WHERE id = ?', [status, id], (err) => {
      if (err) { reject(err); return; }
      updateFileCache();
      resolve();
    });
  });
}

async function syncToSalesforce(feedbackId) {
  if (!db) return null;
  if (!sfConnection || !sfConnection.conn) {
    logger.warn('[FeedbackStore] SF connection not available for sync');
    return null;
  }

  const item = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM product_feedback WHERE id = ?', [feedbackId], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });

  if (!item) return null;
  if (item.sf_record_id) {
    logger.info(`[FeedbackStore] Already synced: ${item.sf_record_id}`);
    return item.sf_record_id;
  }

  try {
    const record = {
      Summary__c: (item.summary || '').substring(0, 5000),
      Feedback_Type__c: item.feedback_type,
      Product_Area__c: item.product_area,
      Source_Author__c: item.source_author,
      Source_Date__c: item.source_date,
      Raw_Message__c: (item.raw_message || '').substring(0, 10000),
      Priority__c: item.priority,
      Status__c: item.status || 'New',
      Tags__c: (item.tags || '').substring(0, 500),
      Source_Channel__c: item.source_channel,
      Slack_Message_Ts__c: item.slack_message_ts,
      Slack_Message_Link__c: item.slack_message_link
    };

    if (item.account_name) {
      try {
        const accounts = await sfConnection.conn.query(
          `SELECT Id FROM Account WHERE Name LIKE '%${item.account_name.replace(/'/g, "\\'")}%' LIMIT 1`
        );
        if (accounts.records && accounts.records.length > 0) {
          record.Account__c = accounts.records[0].Id;
        }
      } catch (e) {
        logger.debug(`[FeedbackStore] Could not match account: ${item.account_name}`);
      }
    }

    const result = await sfConnection.conn.sobject('Product_Feedback__c').create(record);

    if (result.success) {
      await new Promise((resolve) => {
        db.run('UPDATE product_feedback SET sf_record_id = ?, account_id = ? WHERE id = ?',
          [result.id, record.Account__c || null, feedbackId], () => resolve());
      });
      logger.info(`[FeedbackStore] Synced to SFDC: ${result.id}`);
      return result.id;
    } else {
      logger.warn('[FeedbackStore] SFDC create failed:', result.errors);
      return null;
    }
  } catch (error) {
    logger.error('[FeedbackStore] SFDC sync error:', error.message);
    return null;
  }
}

async function syncAllUnsyncedToSalesforce() {
  if (!db) return { synced: 0, failed: 0 };

  const unsynced = await new Promise((resolve, reject) => {
    db.all('SELECT id FROM product_feedback WHERE sf_record_id IS NULL ORDER BY id', (err, rows) => {
      if (err) { reject(err); return; }
      resolve(rows || []);
    });
  });

  let synced = 0, failed = 0;
  for (const row of unsynced) {
    const result = await syncToSalesforce(row.id);
    if (result) synced++; else failed++;
    await new Promise(r => setTimeout(r, 500));
  }

  logger.info(`[FeedbackStore] Bulk sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

function updateFileCache() {
  if (!db) return;
  db.all('SELECT * FROM product_feedback ORDER BY source_date DESC LIMIT 200', (err, rows) => {
    if (err) return;
    try {
      const cache = {
        lastUpdated: new Date().toISOString(),
        totalCount: rows.length,
        items: rows || []
      };
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch (e) {
      logger.debug('[FeedbackStore] Cache write skipped:', e.message);
    }
  });
}

function getFileCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { items: [], totalCount: 0 };
}

module.exports = {
  initialize,
  storeFeedback,
  isMessageProcessed,
  getAllFeedback,
  getFeedbackStats,
  updateStatus,
  syncToSalesforce,
  syncAllUnsyncedToSalesforce,
  getFileCache
};
