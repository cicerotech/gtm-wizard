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
        
        // Meeting Prep table - for BL meeting preparation
        db.run(`
          CREATE TABLE IF NOT EXISTS meeting_prep (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id TEXT UNIQUE,
            account_id TEXT NOT NULL,
            account_name TEXT,
            meeting_title TEXT,
            meeting_date TEXT,
            attendees TEXT,
            agenda TEXT,
            goals TEXT,
            demo_required INTEGER DEFAULT 0,
            demo_selections TEXT,
            context_snapshot TEXT,
            is_first_meeting INTEGER DEFAULT 0,
            author_id TEXT,
            source TEXT DEFAULT 'manual',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) logger.error('Failed to create meeting_prep table:', err);
        });
        
        // Create indexes for meeting_prep
        db.run(`CREATE INDEX IF NOT EXISTS idx_meeting_prep_account ON meeting_prep(account_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_meeting_prep_date ON meeting_prep(meeting_date)`);
        
        // Attendee Enrichment table - stores Clay enrichment data
        db.run(`
          CREATE TABLE IF NOT EXISTS attendee_enrichment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            title TEXT,
            linkedin_url TEXT,
            company TEXT,
            summary TEXT,
            source TEXT DEFAULT 'clay',
            enriched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) logger.error('Failed to create attendee_enrichment table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_enrichment_email ON attendee_enrichment(email)`);
        
        // Attendee Enrichment Cache - for Claude fallback enrichments
        db.run(`
          CREATE TABLE IF NOT EXISTS attendee_enrichment_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            title TEXT,
            summary TEXT,
            confidence TEXT,
            source TEXT DEFAULT 'claude_fallback',
            enriched_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) logger.error('Failed to create attendee_enrichment_cache table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_cache_email ON attendee_enrichment_cache(email)`);
        
        // Obsidian Notes table - for synced meeting notes from Obsidian vaults
        db.run(`
          CREATE TABLE IF NOT EXISTS obsidian_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            account_name TEXT,
            bl_email TEXT,
            note_title TEXT,
            note_date TEXT,
            note_path TEXT,
            summary TEXT,
            full_summary TEXT,
            sentiment TEXT,
            match_method TEXT,
            match_confidence REAL,
            synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
            pushed_to_sf INTEGER DEFAULT 0,
            pushed_at TEXT
          )
        `, (err) => {
          if (err) logger.error('Failed to create obsidian_notes table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_obsidian_account ON obsidian_notes(account_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_obsidian_bl ON obsidian_notes(bl_email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_obsidian_date ON obsidian_notes(note_date)`);
        
        // Context Summaries table - AI-generated meeting context summaries
        db.run(`
          CREATE TABLE IF NOT EXISTS context_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'combined',
            source_hash TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            raw_excerpt TEXT,
            full_notes_url TEXT,
            generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT,
            UNIQUE(account_id, source_type)
          )
        `, (err) => {
          if (err) logger.error('Failed to create context_summaries table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_context_account ON context_summaries(account_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_context_hash ON context_summaries(source_hash)`);
        
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

/**
 * Get the database instance (for use by other services)
 * @returns {sqlite3.Database|null} Database instance
 */
function getDb() {
  return db;
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

// ═══════════════════════════════════════════════════════════════════════════
// MEETING PREP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save or update meeting prep (upsert by meeting_id)
 */
async function saveMeetingPrep(data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      meetingId,
      accountId,
      accountName,
      meetingTitle,
      meetingDate,
      attendees,
      agenda,
      goals,
      demoRequired,
      demoSelections,
      contextSnapshot,
      isFirstMeeting,
      authorId,
      source
    } = data;
    
    db.run(`
      INSERT INTO meeting_prep 
      (meeting_id, account_id, account_name, meeting_title, meeting_date,
       attendees, agenda, goals, demo_required, demo_selections,
       context_snapshot, is_first_meeting, author_id, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(meeting_id) DO UPDATE SET
        account_id = excluded.account_id,
        account_name = excluded.account_name,
        meeting_title = excluded.meeting_title,
        meeting_date = excluded.meeting_date,
        attendees = excluded.attendees,
        agenda = excluded.agenda,
        goals = excluded.goals,
        demo_required = excluded.demo_required,
        demo_selections = excluded.demo_selections,
        context_snapshot = excluded.context_snapshot,
        is_first_meeting = excluded.is_first_meeting,
        author_id = excluded.author_id,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `, [
      meetingId,
      accountId,
      accountName,
      meetingTitle,
      meetingDate,
      JSON.stringify(attendees || []),
      JSON.stringify(agenda || []),
      JSON.stringify(goals || []),
      demoRequired ? 1 : 0,
      JSON.stringify(demoSelections || []),
      JSON.stringify(contextSnapshot || {}),
      isFirstMeeting ? 1 : 0,
      authorId,
      source || 'manual'
    ], function(err) {
      if (err) {
        logger.error('Failed to save meeting prep:', err);
        reject(err);
      } else {
        logger.info(`📅 Saved meeting prep: ${meetingTitle} (${meetingId})`);
        resolve({ meetingId, saved: true });
      }
    });
  });
}

/**
 * Get meeting prep by meeting ID
 */
async function getMeetingPrep(meetingId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`SELECT * FROM meeting_prep WHERE meeting_id = ?`, [meetingId], (err, row) => {
      if (err) {
        logger.error('Failed to get meeting prep:', err);
        reject(err);
      } else if (row) {
        // Parse JSON fields
        resolve({
          ...row,
          attendees: JSON.parse(row.attendees || '[]'),
          agenda: JSON.parse(row.agenda || '[]'),
          goals: JSON.parse(row.goals || '[]'),
          demoSelections: JSON.parse(row.demo_selections || '[]'),
          contextSnapshot: JSON.parse(row.context_snapshot || '{}'),
          demoRequired: row.demo_required === 1,
          isFirstMeeting: row.is_first_meeting === 1
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get all meeting preps for an account (historical context)
 */
async function getMeetingPrepsByAccount(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM meeting_prep 
      WHERE account_id = ? 
      ORDER BY meeting_date DESC
    `, [accountId], (err, rows) => {
      if (err) {
        logger.error('Failed to get meeting preps by account:', err);
        reject(err);
      } else {
        const parsed = (rows || []).map(row => ({
          ...row,
          attendees: JSON.parse(row.attendees || '[]'),
          agenda: JSON.parse(row.agenda || '[]'),
          goals: JSON.parse(row.goals || '[]'),
          demoSelections: JSON.parse(row.demo_selections || '[]'),
          contextSnapshot: JSON.parse(row.context_snapshot || '{}'),
          demoRequired: row.demo_required === 1,
          isFirstMeeting: row.is_first_meeting === 1
        }));
        resolve(parsed);
      }
    });
  });
}

/**
 * Get upcoming meetings within date range
 */
async function getUpcomingMeetingPreps(startDate, endDate) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM meeting_prep 
      WHERE meeting_date >= ? AND meeting_date <= ?
      ORDER BY meeting_date ASC
    `, [startDate, endDate], (err, rows) => {
      if (err) {
        logger.error('Failed to get upcoming meeting preps:', err);
        reject(err);
      } else {
        const parsed = (rows || []).map(row => ({
          ...row,
          attendees: JSON.parse(row.attendees || '[]'),
          agenda: JSON.parse(row.agenda || '[]'),
          goals: JSON.parse(row.goals || '[]'),
          demoSelections: JSON.parse(row.demo_selections || '[]'),
          contextSnapshot: JSON.parse(row.context_snapshot || '{}'),
          demoRequired: row.demo_required === 1,
          isFirstMeeting: row.is_first_meeting === 1
        }));
        resolve(parsed);
      }
    });
  });
}

/**
 * Delete a meeting prep
 */
async function deleteMeetingPrep(meetingId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`DELETE FROM meeting_prep WHERE meeting_id = ?`, [meetingId], function(err) {
      if (err) {
        logger.error('Failed to delete meeting prep:', err);
        reject(err);
      } else {
        logger.info(`📅 Deleted meeting prep: ${meetingId}`);
        resolve({ meetingId, deleted: this.changes > 0 });
      }
    });
  });
}

/**
 * Get all meeting preps (for admin/dashboard view)
 */
async function getAllMeetingPreps() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`SELECT * FROM meeting_prep ORDER BY meeting_date DESC`, [], (err, rows) => {
      if (err) {
        logger.error('Failed to get all meeting preps:', err);
        reject(err);
      } else {
        const parsed = (rows || []).map(row => ({
          ...row,
          attendees: JSON.parse(row.attendees || '[]'),
          agenda: JSON.parse(row.agenda || '[]'),
          goals: JSON.parse(row.goals || '[]'),
          demoSelections: JSON.parse(row.demo_selections || '[]'),
          contextSnapshot: JSON.parse(row.context_snapshot || '{}'),
          demoRequired: row.demo_required === 1,
          isFirstMeeting: row.is_first_meeting === 1
        }));
        resolve(parsed);
      }
    });
  });
}

/**
 * Save attendee enrichment data
 * @param {Object} data - { email, name, title, linkedinUrl, company, summary, source }
 */
async function saveAttendeeEnrichment(data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const { email, name, title, linkedinUrl, company, summary, source = 'clay' } = data;
    
    db.run(`
      INSERT INTO attendee_enrichment (email, name, title, linkedin_url, company, summary, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(excluded.name, attendee_enrichment.name),
        title = COALESCE(excluded.title, attendee_enrichment.title),
        linkedin_url = COALESCE(excluded.linkedin_url, attendee_enrichment.linkedin_url),
        company = COALESCE(excluded.company, attendee_enrichment.company),
        summary = COALESCE(excluded.summary, attendee_enrichment.summary),
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `, [email.toLowerCase(), name, title, linkedinUrl, company, summary, source], function(err) {
      if (err) {
        logger.error('Failed to save attendee enrichment:', err);
        reject(err);
      } else {
        logger.info(`👤 Saved enrichment for: ${email}`);
        resolve({ email, saved: true });
      }
    });
  });
}

/**
 * Get attendee enrichment by email
 * @param {string} email
 */
async function getAttendeeEnrichment(email) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`SELECT * FROM attendee_enrichment WHERE email = ?`, [email.toLowerCase()], (err, row) => {
      if (err) {
        logger.error('Failed to get attendee enrichment:', err);
        reject(err);
      } else if (row) {
        resolve({
          email: row.email,
          name: row.name,
          title: row.title,
          linkedinUrl: row.linkedin_url,
          company: row.company,
          summary: row.summary,
          source: row.source,
          enrichedAt: row.enriched_at,
          updatedAt: row.updated_at
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get enrichment for multiple attendees
 * @param {Array<string>} emails
 */
async function getAttendeeEnrichments(emails) {
  return new Promise((resolve, reject) => {
    if (!db || !emails || emails.length === 0) {
      resolve({});
      return;
    }
    
    const placeholders = emails.map(() => '?').join(',');
    const lowerEmails = emails.map(e => e.toLowerCase());
    
    db.all(`SELECT * FROM attendee_enrichment WHERE email IN (${placeholders})`, lowerEmails, (err, rows) => {
      if (err) {
        logger.error('Failed to get attendee enrichments:', err);
        reject(err);
      } else {
        const result = {};
        (rows || []).forEach(row => {
          result[row.email] = {
            email: row.email,
            name: row.name,
            title: row.title,
            linkedinUrl: row.linkedin_url,
            company: row.company,
            summary: row.summary,
            source: row.source
          };
        });
        resolve(result);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSIDIAN NOTES FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store an Obsidian note
 */
async function storeObsidianNote(noteData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      accountId, accountName, blEmail, noteTitle, noteDate,
      notePath, summary, fullSummary, sentiment, matchMethod, matchConfidence
    } = noteData;
    
    // Check if note already exists (by path + account)
    db.get(
      `SELECT id FROM obsidian_notes WHERE note_path = ? AND account_id = ?`,
      [notePath, accountId],
      (err, existing) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (existing) {
          // Update existing note
          db.run(`
            UPDATE obsidian_notes SET
              summary = ?,
              full_summary = ?,
              sentiment = ?,
              synced_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [summary, fullSummary, sentiment, existing.id], function(err) {
            if (err) reject(err);
            else resolve({ id: existing.id, updated: true });
          });
        } else {
          // Insert new note
          db.run(`
            INSERT INTO obsidian_notes 
            (account_id, account_name, bl_email, note_title, note_date, note_path, 
             summary, full_summary, sentiment, match_method, match_confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            accountId, accountName, blEmail, noteTitle, noteDate, notePath,
            summary, fullSummary, sentiment, matchMethod, matchConfidence
          ], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, inserted: true });
          });
        }
      }
    );
  });
}

/**
 * Get Obsidian notes for an account
 */
async function getObsidianNotesByAccount(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM obsidian_notes 
      WHERE account_id = ?
      ORDER BY note_date DESC, synced_at DESC
      LIMIT 20
    `, [accountId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Get Obsidian notes for a BL
 */
async function getObsidianNotesByBL(blEmail) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM obsidian_notes 
      WHERE bl_email = ?
      ORDER BY synced_at DESC
      LIMIT 100
    `, [blEmail], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Get recent Obsidian notes (for dashboard/stats)
 */
async function getRecentObsidianNotes(limit = 20) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM obsidian_notes 
      ORDER BY synced_at DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Mark an Obsidian note as pushed to Salesforce
 */
async function markObsidianNotePushed(noteId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`
      UPDATE obsidian_notes SET 
        pushed_to_sf = 1,
        pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [noteId], function(err) {
      if (err) reject(err);
      else resolve({ updated: this.changes > 0 });
    });
  });
}

/**
 * Get Obsidian notes pending Salesforce push
 */
async function getObsidianNotesPendingPush() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM obsidian_notes 
      WHERE pushed_to_sf = 0
      ORDER BY synced_at ASC
      LIMIT 50
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ============================================================
// CONTEXT SUMMARIES - AI-generated meeting context
// ============================================================

/**
 * Save or update an AI-generated context summary
 * @param {Object} data - Summary data
 */
async function saveContextSummary(data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      accountId,
      sourceType = 'combined',
      sourceHash,
      summaryJson,
      rawExcerpt,
      fullNotesUrl
    } = data;
    
    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    db.run(`
      INSERT INTO context_summaries 
      (account_id, source_type, source_hash, summary_json, raw_excerpt, full_notes_url, generated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(account_id, source_type) DO UPDATE SET
        source_hash = excluded.source_hash,
        summary_json = excluded.summary_json,
        raw_excerpt = excluded.raw_excerpt,
        full_notes_url = excluded.full_notes_url,
        generated_at = CURRENT_TIMESTAMP,
        expires_at = excluded.expires_at
    `, [accountId, sourceType, sourceHash, summaryJson, rawExcerpt, fullNotesUrl, expiresAt], function(err) {
      if (err) {
        logger.error('Failed to save context summary:', err);
        reject(err);
      } else {
        logger.debug(`[IntelStore] Saved context summary for account ${accountId}`);
        resolve({ id: this.lastID, accountId, sourceType });
      }
    });
  });
}

/**
 * Get cached context summary for an account
 * @param {string} accountId - Salesforce Account ID
 * @param {string} sourceType - Source type (default 'combined')
 * @returns {Object|null} Cached summary or null
 */
async function getContextSummary(accountId, sourceType = 'combined') {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT * FROM context_summaries 
      WHERE account_id = ? AND source_type = ?
    `, [accountId, sourceType], (err, row) => {
      if (err) {
        logger.error('Failed to get context summary:', err);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Check if context summary is stale (hash mismatch)
 * @param {string} accountId - Salesforce Account ID
 * @param {string} newSourceHash - Hash of current source content
 * @returns {boolean} True if stale or missing
 */
async function isContextSummaryStale(accountId, newSourceHash) {
  const cached = await getContextSummary(accountId);
  
  if (!cached) return true;
  if (cached.source_hash !== newSourceHash) return true;
  
  // Also check expiry
  if (cached.expires_at && new Date(cached.expires_at) < new Date()) {
    return true;
  }
  
  return false;
}

/**
 * Delete expired context summaries
 * @returns {number} Number of deleted rows
 */
async function cleanExpiredContextSummaries() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`
      DELETE FROM context_summaries 
      WHERE expires_at < CURRENT_TIMESTAMP
    `, function(err) {
      if (err) {
        logger.error('Failed to clean expired summaries:', err);
        reject(err);
      } else {
        if (this.changes > 0) {
          logger.info(`[IntelStore] Cleaned ${this.changes} expired context summaries`);
        }
        resolve(this.changes);
      }
    });
  });
}

/**
 * Get all cached context summaries (for stats/debugging)
 * @returns {Array} All summaries
 */
async function getAllContextSummaries() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT account_id, source_type, source_hash, generated_at, expires_at,
             LENGTH(summary_json) as summary_length
      FROM context_summaries 
      ORDER BY generated_at DESC
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

module.exports = {
  initialize,
  close,
  getDb,
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
  recordBackfill,
  // Meeting prep
  saveMeetingPrep,
  getMeetingPrep,
  getMeetingPrepsByAccount,
  getUpcomingMeetingPreps,
  deleteMeetingPrep,
  getAllMeetingPreps,
  // Attendee enrichment
  saveAttendeeEnrichment,
  getAttendeeEnrichment,
  getAttendeeEnrichments,
  // Obsidian notes
  storeObsidianNote,
  getObsidianNotesByAccount,
  getObsidianNotesByBL,
  getRecentObsidianNotes,
  markObsidianNotePushed,
  getObsidianNotesPendingPush,
  // Context summaries
  saveContextSummary,
  getContextSummary,
  isContextSummaryStale,
  cleanExpiredContextSummaries,
  getAllContextSummaries
};

