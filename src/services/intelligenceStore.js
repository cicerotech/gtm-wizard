/**
 * Intelligence Store Service
 * SQLite-based storage for channel monitoring and intelligence extraction
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

// Database path - store in project data directory
const DB_PATH = process.env.INTEL_DB_PATH || path.join(__dirname, '../../data/intelligence.db');

let db = null;

/**
 * Initialize the SQLite database and create tables
 */
async function initialize() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Failed to open intelligence database:', err);
        reject(err);
        return;
      }
      
      logger.info(`📦 Intelligence database opened: ${DB_PATH}`);
      
      // Create tables
      db.serialize(() => {
        // Monitored channels table
        db.run(`
          CREATE TABLE IF NOT EXISTS monitored_channels (
            channel_id TEXT PRIMARY KEY,
            channel_name TEXT,
            account_name TEXT,
            account_id TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_polled TEXT,
            is_active INTEGER DEFAULT 1
          )
        `, (err) => {
          if (err) logger.error('Failed to create monitored_channels table:', err);
        });
        
        // Pending intelligence table
        db.run(`
          CREATE TABLE IF NOT EXISTS pending_intelligence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT,
            account_name TEXT,
            account_id TEXT,
            message_ts TEXT UNIQUE,
            message_author TEXT,
            message_author_name TEXT,
            message_text TEXT,
            category TEXT,
            summary TEXT,
            confidence REAL,
            captured_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            synced_at TEXT,
            reviewed_by TEXT
          )
        `, (err) => {
          if (err) logger.error('Failed to create pending_intelligence table:', err);
        });
        
        // Create indexes for faster queries
        db.run(`CREATE INDEX IF NOT EXISTS idx_intel_status ON pending_intelligence(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_intel_channel ON pending_intelligence(channel_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_intel_account ON pending_intelligence(account_name)`);
        
        logger.info('✅ Intelligence database tables initialized');
        resolve();
      });
    });
  });
}

/**
 * Close the database connection
 */
function close() {
  if (db) {
    db.close((err) => {
      if (err) logger.error('Error closing intelligence database:', err);
      else logger.info('Intelligence database closed');
    });
    db = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL REGISTRY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a channel to monitoring
 */
async function addMonitoredChannel(channelId, channelName, accountName = null, accountId = null) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`
      INSERT OR REPLACE INTO monitored_channels 
      (channel_id, channel_name, account_name, account_id, added_at, is_active)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
    `, [channelId, channelName, accountName, accountId], function(err) {
      if (err) {
        logger.error('Failed to add monitored channel:', err);
        reject(err);
      } else {
        logger.info(`📡 Added channel to monitoring: #${channelName} (${channelId})`);
        resolve({ channelId, channelName, accountName, accountId });
      }
    });
  });
}

/**
 * Remove a channel from monitoring
 */
async function removeMonitoredChannel(channelId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`UPDATE monitored_channels SET is_active = 0 WHERE channel_id = ?`, 
      [channelId], function(err) {
      if (err) {
        logger.error('Failed to remove monitored channel:', err);
        reject(err);
      } else {
        logger.info(`📡 Removed channel from monitoring: ${channelId}`);
        resolve({ channelId, removed: this.changes > 0 });
      }
    });
  });
}

/**
 * Get all active monitored channels
 */
async function getMonitoredChannels() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`SELECT * FROM monitored_channels WHERE is_active = 1`, [], (err, rows) => {
      if (err) {
        logger.error('Failed to get monitored channels:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get a specific monitored channel
 */
async function getMonitoredChannel(channelId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`SELECT * FROM monitored_channels WHERE channel_id = ? AND is_active = 1`, 
      [channelId], (err, row) => {
      if (err) {
        logger.error('Failed to get monitored channel:', err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Update channel's account mapping
 */
async function updateChannelAccount(channelId, accountName, accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`UPDATE monitored_channels SET account_name = ?, account_id = ? WHERE channel_id = ?`,
      [accountName, accountId, channelId], function(err) {
      if (err) {
        logger.error('Failed to update channel account:', err);
        reject(err);
      } else {
        logger.info(`📡 Updated channel account mapping: ${channelId} -> ${accountName}`);
        resolve({ channelId, accountName, accountId, updated: this.changes > 0 });
      }
    });
  });
}

/**
 * Update channel's last polled timestamp
 */
async function updateChannelLastPolled(channelId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`UPDATE monitored_channels SET last_polled = CURRENT_TIMESTAMP WHERE channel_id = ?`,
      [channelId], function(err) {
      if (err) reject(err);
      else resolve({ channelId, updated: this.changes > 0 });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE STORAGE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store extracted intelligence
 */
async function storeIntelligence(intel) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      channelId,
      accountName,
      accountId,
      messageTs,
      messageAuthor,
      messageAuthorName,
      messageText,
      category,
      summary,
      confidence
    } = intel;
    
    db.run(`
      INSERT OR IGNORE INTO pending_intelligence 
      (channel_id, account_name, account_id, message_ts, message_author, 
       message_author_name, message_text, category, summary, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [channelId, accountName, accountId, messageTs, messageAuthor, 
        messageAuthorName, messageText, category, summary, confidence], 
    function(err) {
      if (err) {
        logger.error('Failed to store intelligence:', err);
        reject(err);
      } else {
        if (this.changes > 0) {
          logger.info(`🧠 Stored intelligence: [${category}] ${summary?.substring(0, 50)}...`);
        }
        resolve({ id: this.lastID, inserted: this.changes > 0 });
      }
    });
  });
}

/**
 * Get pending intelligence items (for daily digest)
 */
async function getPendingIntelligence() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT pi.*, mc.channel_name 
      FROM pending_intelligence pi
      LEFT JOIN monitored_channels mc ON pi.channel_id = mc.channel_id
      WHERE pi.status = 'pending'
      ORDER BY pi.account_name, pi.captured_at DESC
    `, [], (err, rows) => {
      if (err) {
        logger.error('Failed to get pending intelligence:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get pending intelligence grouped by account
 */
async function getPendingIntelligenceByAccount() {
  const items = await getPendingIntelligence();
  
  const grouped = {};
  for (const item of items) {
    const key = item.account_name || 'Unknown Account';
    if (!grouped[key]) {
      grouped[key] = {
        accountName: key,
        accountId: item.account_id,
        items: []
      };
    }
    grouped[key].items.push(item);
  }
  
  return Object.values(grouped);
}

/**
 * Update intelligence status (approve/reject)
 */
async function updateIntelligenceStatus(id, status, reviewedBy = null) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const syncedAt = status === 'approved' ? 'CURRENT_TIMESTAMP' : 'NULL';
    
    db.run(`
      UPDATE pending_intelligence 
      SET status = ?, reviewed_by = ?, synced_at = ${status === 'approved' ? 'CURRENT_TIMESTAMP' : 'NULL'}
      WHERE id = ?
    `, [status, reviewedBy, id], function(err) {
      if (err) {
        logger.error('Failed to update intelligence status:', err);
        reject(err);
      } else {
        logger.info(`🧠 Intelligence ${id} marked as: ${status}`);
        resolve({ id, status, updated: this.changes > 0 });
      }
    });
  });
}

/**
 * Get intelligence item by ID
 */
async function getIntelligenceById(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT pi.*, mc.channel_name 
      FROM pending_intelligence pi
      LEFT JOIN monitored_channels mc ON pi.channel_id = mc.channel_id
      WHERE pi.id = ?
    `, [id], (err, row) => {
      if (err) {
        logger.error('Failed to get intelligence by ID:', err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Batch update intelligence status
 */
async function batchUpdateIntelligenceStatus(ids, status, reviewedBy = null) {
  const results = [];
  for (const id of ids) {
    try {
      const result = await updateIntelligenceStatus(id, status, reviewedBy);
      results.push(result);
    } catch (error) {
      results.push({ id, error: error.message });
    }
  }
  return results;
}

/**
 * Get intelligence stats
 */
async function getIntelligenceStats() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM pending_intelligence
    `, [], (err, row) => {
      if (err) {
        logger.error('Failed to get intelligence stats:', err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Check if message already processed (deduplication)
 */
async function isMessageProcessed(messageTs) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`SELECT id FROM pending_intelligence WHERE message_ts = ?`, 
      [messageTs], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the last backfill timestamp
 */
async function getLastBackfillTime() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    
    // Check if backfill_history table exists, create if not
    db.run(`
      CREATE TABLE IF NOT EXISTS backfill_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backfill_at TEXT DEFAULT CURRENT_TIMESTAMP,
        channels_processed INTEGER,
        messages_processed INTEGER,
        intelligence_found INTEGER,
        tokens_used INTEGER
      )
    `, (err) => {
      if (err) {
        logger.error('Failed to create backfill_history table:', err);
      }
      
      db.get(
        'SELECT backfill_at FROM backfill_history ORDER BY id DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) {
            logger.error('Error getting last backfill time:', err);
            resolve(null);
          } else {
            resolve(row?.backfill_at || null);
          }
        }
      );
    });
  });
}

/**
 * Record a backfill run
 */
async function recordBackfill(results) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    
    db.run(`
      INSERT INTO backfill_history (channels_processed, messages_processed, intelligence_found, tokens_used)
      VALUES (?, ?, ?, ?)
    `, [
      results.channelsProcessed || 0,
      results.messagesAfterFilter || 0,
      results.intelligenceFound || 0,
      results.tokensUsed || 0
    ], (err) => {
      if (err) {
        logger.error('Failed to record backfill:', err);
      }
      resolve();
    });
  });
}

module.exports = {
  initialize,
  close,
  // Channel registry
  addMonitoredChannel,
  removeMonitoredChannel,
  getMonitoredChannels,
  getMonitoredChannel,
  updateChannelAccount,
  updateChannelLastPolled,
  // Intelligence storage
  storeIntelligence,
  getPendingIntelligence,
  getPendingIntelligenceByAccount,
  updateIntelligenceStatus,
  getIntelligenceById,
  batchUpdateIntelligenceStatus,
  getIntelligenceStats,
  isMessageProcessed,
  // Backfill tracking
  getLastBackfillTime,
  recordBackfill
};

