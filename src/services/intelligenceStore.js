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
        
        // Calendar Events table - persistent storage for fetched calendar data
        // Survives deploys, eliminates need to re-fetch on every page load
        db.run(`
          CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT UNIQUE NOT NULL,
            owner_email TEXT NOT NULL,
            subject TEXT,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT,
            external_attendees TEXT,
            internal_attendees TEXT,
            all_attendees TEXT,
            account_id TEXT,
            account_name TEXT,
            is_customer_meeting INTEGER DEFAULT 0,
            location TEXT,
            body_preview TEXT,
            web_link TEXT,
            raw_event_json TEXT,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) logger.error('Failed to create calendar_events table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_calendar_owner ON calendar_events(owner_email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_datetime)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_calendar_account ON calendar_events(account_id)`);
        
        // Calendar Sync Status table - tracks when calendars were last synced
        db.run(`
          CREATE TABLE IF NOT EXISTS calendar_sync_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_type TEXT UNIQUE DEFAULT 'full',
            last_sync_at TEXT,
            next_sync_at TEXT,
            events_fetched INTEGER DEFAULT 0,
            errors TEXT,
            status TEXT DEFAULT 'idle'
          )
        `, (err) => {
          if (err) logger.error('Failed to create calendar_sync_status table:', err);
        });
        
        // Meeting Milestones table - for sales velocity tracking
        db.run(`
          CREATE TABLE IF NOT EXISTS meeting_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            account_name TEXT,
            opportunity_id TEXT,
            
            -- Meeting details
            meeting_id TEXT,
            meeting_date TEXT,
            meeting_subject TEXT,
            meeting_type TEXT,
            classification_confidence REAL,
            classification_method TEXT,
            
            -- Sequence tracking
            sequence_number INTEGER,
            days_from_first INTEGER,
            days_from_previous INTEGER,
            
            -- Stage context
            stage_at_meeting TEXT,
            
            -- Source
            source TEXT,
            bl_email TEXT,
            
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(account_id, meeting_date, meeting_subject)
          )
        `, (err) => {
          if (err) logger.error('Failed to create meeting_milestones table:', err);
        });
        
        // Create indexes for meeting_milestones
        db.run(`CREATE INDEX IF NOT EXISTS idx_milestones_account ON meeting_milestones(account_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_milestones_type ON meeting_milestones(meeting_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_milestones_date ON meeting_milestones(meeting_date)`);
        
        // Contact Gap Analysis table - tracks identified and created contacts from gap analysis
        db.run(`
          CREATE TABLE IF NOT EXISTS contact_gaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            first_name TEXT,
            last_name TEXT,
            title TEXT,
            account_id TEXT,
            account_name TEXT,
            account_owner TEXT,
            domain TEXT,
            meeting_count INTEGER DEFAULT 0,
            last_meeting_date TEXT,
            enrichment_source TEXT,
            match_method TEXT,
            status TEXT DEFAULT 'identified',
            contact_id TEXT,
            created_by TEXT,
            created_at TEXT,
            identified_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(email)
          )
        `, (err) => {
          if (err) logger.error('Failed to create contact_gaps table:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_gaps_email ON contact_gaps(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gaps_status ON contact_gaps(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gaps_account ON contact_gaps(account_id)`);
        
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

// ============================================================
// CALENDAR EVENTS - Persistent storage for calendar data
// ============================================================

/**
 * Save calendar events to database (bulk upsert)
 * @param {Array} events - Array of normalized calendar events
 * @returns {Object} { saved: number, errors: number }
 */
async function saveCalendarEvents(events) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    if (!events || events.length === 0) {
      resolve({ saved: 0, errors: 0 });
      return;
    }
    
    let saved = 0;
    let errors = 0;
    
    const stmt = db.prepare(`
      INSERT INTO calendar_events 
      (event_id, owner_email, subject, start_datetime, end_datetime,
       external_attendees, internal_attendees, all_attendees,
       account_id, account_name, is_customer_meeting, location, body_preview, web_link, raw_event_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_id) DO UPDATE SET
        owner_email = excluded.owner_email,
        subject = excluded.subject,
        start_datetime = excluded.start_datetime,
        end_datetime = excluded.end_datetime,
        external_attendees = excluded.external_attendees,
        internal_attendees = excluded.internal_attendees,
        all_attendees = excluded.all_attendees,
        account_id = excluded.account_id,
        account_name = excluded.account_name,
        is_customer_meeting = excluded.is_customer_meeting,
        location = excluded.location,
        body_preview = excluded.body_preview,
        web_link = excluded.web_link,
        raw_event_json = excluded.raw_event_json,
        fetched_at = CURRENT_TIMESTAMP
    `);
    
    db.serialize(() => {
      for (const event of events) {
        stmt.run([
          event.eventId,
          event.ownerEmail,
          event.subject,
          event.startDateTime,
          event.endDateTime,
          JSON.stringify(event.externalAttendees || []),
          JSON.stringify(event.internalAttendees || []),
          JSON.stringify(event.allAttendees || []),
          event.accountId || null,
          event.accountName || null,
          event.isCustomerMeeting ? 1 : 0,
          event.location || null,
          event.bodyPreview || null,
          event.webLink || null,
          JSON.stringify(event)
        ], function(err) {
          if (err) {
            errors++;
            logger.error(`Failed to save calendar event ${event.eventId}:`, err.message);
          } else {
            saved++;
          }
        });
      }
      
      stmt.finalize((err) => {
        if (err) {
          logger.error('Failed to finalize calendar events statement:', err);
        }
        logger.info(`📅 [CalendarDB] Saved ${saved} events, ${errors} errors`);
        resolve({ saved, errors });
      });
    });
  });
}

/**
 * Get stored calendar events for a date range
 * @param {Date} startDate - Start of date range
 * @param {Date} endDate - End of date range
 * @param {Object} options - { ownerEmail, customerMeetingsOnly }
 * @returns {Array} Calendar events
 */
async function getStoredCalendarEvents(startDate, endDate, options = {}) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    let query = `
      SELECT * FROM calendar_events 
      WHERE start_datetime >= ? AND start_datetime <= ?
    `;
    const params = [startDate.toISOString(), endDate.toISOString()];
    
    if (options.ownerEmail) {
      query += ` AND owner_email = ?`;
      params.push(options.ownerEmail);
    }
    
    if (options.customerMeetingsOnly) {
      query += ` AND is_customer_meeting = 1`;
    }
    
    query += ` ORDER BY start_datetime ASC`;
    
    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('Failed to get stored calendar events:', err);
        reject(err);
      } else {
        // Parse JSON fields
        const events = (rows || []).map(row => ({
          ...row,
          externalAttendees: JSON.parse(row.external_attendees || '[]'),
          internalAttendees: JSON.parse(row.internal_attendees || '[]'),
          allAttendees: JSON.parse(row.all_attendees || '[]'),
          isCustomerMeeting: row.is_customer_meeting === 1
        }));
        resolve(events);
      }
    });
  });
}

/**
 * Clear old calendar events (older than specified days)
 * @param {number} daysOld - Delete events older than this many days (default 30)
 * @returns {number} Number of deleted rows
 */
async function clearOldCalendarEvents(daysOld = 30) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    db.run(`
      DELETE FROM calendar_events 
      WHERE end_datetime < ?
    `, [cutoffDate.toISOString()], function(err) {
      if (err) {
        logger.error('Failed to clear old calendar events:', err);
        reject(err);
      } else {
        if (this.changes > 0) {
          logger.info(`📅 [CalendarDB] Cleared ${this.changes} old calendar events`);
        }
        resolve(this.changes);
      }
    });
  });
}

/**
 * Update calendar sync status
 * @param {Object} status - { lastSyncAt, nextSyncAt, eventsFetched, errors, status }
 */
async function updateCalendarSyncStatus(status) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.run(`
      INSERT INTO calendar_sync_status (sync_type, last_sync_at, next_sync_at, events_fetched, errors, status)
      VALUES ('full', ?, ?, ?, ?, ?)
      ON CONFLICT(sync_type) DO UPDATE SET
        last_sync_at = excluded.last_sync_at,
        next_sync_at = excluded.next_sync_at,
        events_fetched = excluded.events_fetched,
        errors = excluded.errors,
        status = excluded.status
    `, [
      status.lastSyncAt || new Date().toISOString(),
      status.nextSyncAt || null,
      status.eventsFetched || 0,
      JSON.stringify(status.errors || []),
      status.status || 'idle'
    ], function(err) {
      if (err) {
        logger.error('Failed to update calendar sync status:', err);
        reject(err);
      } else {
        resolve({ updated: true });
      }
    });
  });
}

/**
 * Get calendar sync status
 * @returns {Object|null} Sync status
 */
async function getCalendarSyncStatus() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`SELECT * FROM calendar_sync_status WHERE sync_type = 'full'`, (err, row) => {
      if (err) {
        logger.error('Failed to get calendar sync status:', err);
        reject(err);
      } else {
        if (row) {
          row.errors = JSON.parse(row.errors || '[]');
        }
        resolve(row || null);
      }
    });
  });
}

/**
 * Get calendar event count and stats
 * @returns {Object} { totalEvents, customerMeetings, lastSync }
 */
async function getCalendarStats() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN is_customer_meeting = 1 THEN 1 ELSE 0 END) as customer_meetings,
        MAX(fetched_at) as last_fetched,
        COUNT(DISTINCT owner_email) as unique_owners
      FROM calendar_events
    `, (err, row) => {
      if (err) {
        logger.error('Failed to get calendar stats:', err);
        reject(err);
      } else {
        resolve({
          totalEvents: row?.total_events || 0,
          customerMeetings: row?.customer_meetings || 0,
          lastFetched: row?.last_fetched || null,
          uniqueOwners: row?.unique_owners || 0
        });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MEETING MILESTONES - Sales Velocity Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save a meeting milestone for velocity tracking
 * @param {Object} milestone - Milestone data
 */
async function saveMeetingMilestone(milestone) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      accountId,
      accountName,
      opportunityId,
      meetingId,
      meetingDate,
      meetingSubject,
      meetingType,
      classificationConfidence,
      classificationMethod,
      sequenceNumber,
      daysFromFirst,
      daysFromPrevious,
      stageAtMeeting,
      source,
      blEmail
    } = milestone;
    
    db.run(`
      INSERT OR REPLACE INTO meeting_milestones 
      (account_id, account_name, opportunity_id, meeting_id, meeting_date, 
       meeting_subject, meeting_type, classification_confidence, classification_method,
       sequence_number, days_from_first, days_from_previous, stage_at_meeting, 
       source, bl_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      accountId, accountName, opportunityId, meetingId, meetingDate,
      meetingSubject, meetingType, classificationConfidence, classificationMethod,
      sequenceNumber, daysFromFirst, daysFromPrevious, stageAtMeeting,
      source, blEmail
    ], function(err) {
      if (err) {
        logger.error('Failed to save meeting milestone:', err);
        reject(err);
      } else {
        logger.info(`📊 Saved milestone: ${meetingType} for ${accountName} (#${sequenceNumber})`);
        resolve({ id: this.lastID, ...milestone });
      }
    });
  });
}

/**
 * Get meeting milestones for an account
 * @param {string} accountId - Salesforce account ID
 * @returns {Array} Milestones sorted by date
 */
async function getMilestonesByAccount(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM meeting_milestones 
      WHERE account_id = ?
      ORDER BY meeting_date ASC
    `, [accountId], (err, rows) => {
      if (err) {
        logger.error('Failed to get milestones:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get meeting count for an account (for sequence number calculation)
 * @param {string} accountId - Salesforce account ID
 * @returns {number} Number of meetings
 */
async function getMeetingCountForAccount(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT COUNT(*) as count FROM meeting_milestones 
      WHERE account_id = ?
    `, [accountId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row?.count || 0);
      }
    });
  });
}

/**
 * Get first meeting date for an account
 * @param {string} accountId - Salesforce account ID
 * @returns {string|null} First meeting date
 */
async function getFirstMeetingDate(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT MIN(meeting_date) as first_date FROM meeting_milestones 
      WHERE account_id = ?
    `, [accountId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row?.first_date || null);
      }
    });
  });
}

/**
 * Get most recent meeting date for an account
 * @param {string} accountId - Salesforce account ID
 * @returns {string|null} Most recent meeting date
 */
async function getLastMeetingDate(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT MAX(meeting_date) as last_date FROM meeting_milestones 
      WHERE account_id = ?
    `, [accountId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row?.last_date || null);
      }
    });
  });
}

/**
 * Get velocity metrics for an account
 * Returns days between key milestones
 */
async function getAccountVelocityMetrics(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.get(`
      SELECT 
        account_id,
        account_name,
        MIN(meeting_date) as first_meeting_date,
        MAX(meeting_date) as last_meeting_date,
        COUNT(*) as total_meetings,
        MIN(CASE WHEN meeting_type = 'intro' THEN meeting_date END) as first_intro,
        MIN(CASE WHEN meeting_type = 'demo' THEN meeting_date END) as first_demo,
        MIN(CASE WHEN meeting_type = 'cab' THEN meeting_date END) as first_cab,
        MIN(CASE WHEN meeting_type = 'discovery' THEN meeting_date END) as first_discovery,
        MIN(CASE WHEN meeting_type = 'scoping' THEN meeting_date END) as first_scoping,
        MIN(CASE WHEN meeting_type = 'compliance' THEN meeting_date END) as first_compliance,
        MIN(CASE WHEN meeting_type = 'proposal' THEN meeting_date END) as first_proposal,
        MIN(CASE WHEN meeting_type = 'negotiation' THEN meeting_date END) as first_negotiation,
        GROUP_CONCAT(DISTINCT meeting_type) as meeting_types_seen
      FROM meeting_milestones 
      WHERE account_id = ?
      GROUP BY account_id, account_name
    `, [accountId], (err, row) => {
      if (err) {
        logger.error('Failed to get velocity metrics:', err);
        reject(err);
      } else {
        if (!row) {
          resolve(null);
          return;
        }
        
        // Calculate days between milestones
        const metrics = {
          accountId: row.account_id,
          accountName: row.account_name,
          totalMeetings: row.total_meetings,
          meetingTypesSeen: row.meeting_types_seen?.split(',') || [],
          milestones: {
            firstMeeting: row.first_meeting_date,
            firstDemo: row.first_demo,
            firstCab: row.first_cab,
            firstProposal: row.first_proposal
          },
          velocity: {}
        };
        
        // Calculate days between stages
        if (row.first_meeting_date && row.first_demo) {
          const d1 = new Date(row.first_meeting_date);
          const d2 = new Date(row.first_demo);
          metrics.velocity.introToDemo = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        }
        
        if (row.first_meeting_date && row.first_proposal) {
          const d1 = new Date(row.first_meeting_date);
          const d2 = new Date(row.first_proposal);
          metrics.velocity.introToProposal = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        }
        
        if (row.first_demo && row.first_proposal) {
          const d1 = new Date(row.first_demo);
          const d2 = new Date(row.first_proposal);
          metrics.velocity.demoToProposal = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        }
        
        resolve(metrics);
      }
    });
  });
}

/**
 * Get aggregate velocity benchmarks across all accounts
 */
async function getVelocityBenchmarks() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT 
        account_id,
        MIN(meeting_date) as first_meeting,
        MIN(CASE WHEN meeting_type = 'demo' THEN meeting_date END) as first_demo,
        MIN(CASE WHEN meeting_type = 'proposal' THEN meeting_date END) as first_proposal
      FROM meeting_milestones 
      GROUP BY account_id
      HAVING first_demo IS NOT NULL OR first_proposal IS NOT NULL
    `, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      const introToDemos = [];
      const introToProposals = [];
      const demoToProposals = [];
      
      for (const row of (rows || [])) {
        if (row.first_meeting && row.first_demo) {
          const days = Math.round((new Date(row.first_demo) - new Date(row.first_meeting)) / (1000 * 60 * 60 * 24));
          if (days > 0) introToDemos.push(days);
        }
        if (row.first_meeting && row.first_proposal) {
          const days = Math.round((new Date(row.first_proposal) - new Date(row.first_meeting)) / (1000 * 60 * 60 * 24));
          if (days > 0) introToProposals.push(days);
        }
        if (row.first_demo && row.first_proposal) {
          const days = Math.round((new Date(row.first_proposal) - new Date(row.first_demo)) / (1000 * 60 * 60 * 24));
          if (days > 0) demoToProposals.push(days);
        }
      }
      
      const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      
      resolve({
        sampleSize: rows?.length || 0,
        introToDemo: {
          avg: avg(introToDemos),
          min: introToDemos.length > 0 ? Math.min(...introToDemos) : null,
          max: introToDemos.length > 0 ? Math.max(...introToDemos) : null,
          samples: introToDemos.length
        },
        introToProposal: {
          avg: avg(introToProposals),
          min: introToProposals.length > 0 ? Math.min(...introToProposals) : null,
          max: introToProposals.length > 0 ? Math.max(...introToProposals) : null,
          samples: introToProposals.length
        },
        demoToProposal: {
          avg: avg(demoToProposals),
          min: demoToProposals.length > 0 ? Math.min(...demoToProposals) : null,
          max: demoToProposals.length > 0 ? Math.max(...demoToProposals) : null,
          samples: demoToProposals.length
        }
      });
    });
  });
}

/**
 * Get previous meeting types for an account (for LLM context)
 */
async function getPreviousMeetingTypes(accountId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT meeting_type FROM meeting_milestones 
      WHERE account_id = ?
      ORDER BY meeting_date DESC
      LIMIT 5
    `, [accountId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve((rows || []).map(r => r.meeting_type));
      }
    });
  });
}

// ============================================================
// CONTACT GAP ANALYSIS HELPERS
// ============================================================

/**
 * Get calendar events after a cutoff date for specific BL emails
 * @param {string} cutoffISO - ISO date string for cutoff
 * @param {Array<string>} blEmails - Array of BL email addresses
 * @returns {Array} Calendar events
 */
async function getCalendarEventsAfter(cutoffISO, blEmails = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    // Build owner email filter
    const emailPlaceholders = blEmails.map(() => '?').join(',');
    const params = [cutoffISO, ...blEmails.map(e => e.toLowerCase())];
    
    const query = blEmails.length > 0
      ? `SELECT * FROM calendar_events WHERE start_datetime >= ? AND LOWER(owner_email) IN (${emailPlaceholders}) ORDER BY start_datetime DESC`
      : `SELECT * FROM calendar_events WHERE start_datetime >= ? ORDER BY start_datetime DESC`;
    
    const queryParams = blEmails.length > 0 ? params : [cutoffISO];
    
    db.all(query, queryParams, (err, rows) => {
      if (err) {
        logger.error('Failed to get calendar events after date:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Save or update a contact gap record
 * @param {Object} data - Contact gap data
 */
async function saveContactGap(data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const {
      email, firstName, lastName, title, accountId, accountName, accountOwner,
      domain, meetingCount, lastMeetingDate, enrichmentSource, matchMethod, status = 'identified'
    } = data;
    
    db.run(`
      INSERT INTO contact_gaps 
      (email, first_name, last_name, title, account_id, account_name, account_owner,
       domain, meeting_count, last_meeting_date, enrichment_source, match_method, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        first_name = COALESCE(excluded.first_name, contact_gaps.first_name),
        last_name = COALESCE(excluded.last_name, contact_gaps.last_name),
        title = COALESCE(excluded.title, contact_gaps.title),
        account_id = excluded.account_id,
        account_name = excluded.account_name,
        account_owner = excluded.account_owner,
        meeting_count = excluded.meeting_count,
        last_meeting_date = excluded.last_meeting_date,
        enrichment_source = excluded.enrichment_source,
        match_method = excluded.match_method
    `, [
      email?.toLowerCase(), firstName, lastName, title, accountId, accountName, accountOwner,
      domain, meetingCount, lastMeetingDate, enrichmentSource, matchMethod, status
    ], function(err) {
      if (err) {
        logger.error('Failed to save contact gap:', err);
        reject(err);
      } else {
        resolve({ email, saved: true });
      }
    });
  });
}

/**
 * Log when a contact from gap analysis is created
 * @param {Object} data - { email, contactId, accountId, accountName, approver, source }
 */
async function logContactGapCreation(data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const { email, contactId, accountId, accountName, approver, source } = data;
    
    db.run(`
      UPDATE contact_gaps SET
        status = 'created',
        contact_id = ?,
        created_by = ?,
        created_at = CURRENT_TIMESTAMP
      WHERE LOWER(email) = ?
    `, [contactId, approver, email?.toLowerCase()], function(err) {
      if (err) {
        logger.error('Failed to log contact gap creation:', err);
        reject(err);
      } else {
        logger.info(`[ContactGap] Logged creation: ${email} -> ${contactId}`);
        resolve({ email, contactId, logged: true });
      }
    });
  });
}

/**
 * Get contact gaps by status
 * @param {string} status - 'identified', 'created', 'skipped'
 * @param {number} limit - Max records to return
 */
async function getContactGapsByStatus(status = 'identified', limit = 100) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT * FROM contact_gaps 
      WHERE status = ?
      ORDER BY meeting_count DESC, identified_at DESC
      LIMIT ?
    `, [status, limit], (err, rows) => {
      if (err) {
        logger.error('Failed to get contact gaps:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get contact gap stats
 */
async function getContactGapStats() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    db.all(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(meeting_count) as total_meetings
      FROM contact_gaps
      GROUP BY status
    `, [], (err, rows) => {
      if (err) {
        logger.error('Failed to get contact gap stats:', err);
        reject(err);
      } else {
        const stats = { identified: 0, created: 0, skipped: 0, totalMeetings: 0 };
        for (const row of (rows || [])) {
          stats[row.status] = row.count;
          stats.totalMeetings += row.total_meetings || 0;
        }
        resolve(stats);
      }
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
  getAllContextSummaries,
  // Calendar events (persistent storage)
  saveCalendarEvents,
  getStoredCalendarEvents,
  clearOldCalendarEvents,
  updateCalendarSyncStatus,
  getCalendarSyncStatus,
  getCalendarStats,
  // Meeting milestones (sales velocity tracking)
  saveMeetingMilestone,
  getMilestonesByAccount,
  getMeetingCountForAccount,
  getFirstMeetingDate,
  getLastMeetingDate,
  getAccountVelocityMetrics,
  getVelocityBenchmarks,
  getPreviousMeetingTypes,
  // Contact gap analysis
  getCalendarEventsAfter,
  saveContactGap,
  logContactGapCreation,
  getContactGapsByStatus,
  getContactGapStats
};

