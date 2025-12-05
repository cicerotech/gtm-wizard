/**
 * Hyprnote Database Reader
 * 
 * Reads meeting sessions from Hyprnote's local SQLite database.
 * Handles both stable and nightly versions.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Database paths for different Hyprnote versions
const DB_PATHS = {
  stable: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.stable/db.sqlite'),
  nightly: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.nightly/db.sqlite'),
  legacy: path.join(os.homedir(), 'Library/Application Support/hyprnote/db.sqlite')
};

/**
 * Find the active Hyprnote database
 */
function findDatabase() {
  for (const [version, dbPath] of Object.entries(DB_PATHS)) {
    if (fs.existsSync(dbPath)) {
      return { version, path: dbPath };
    }
  }
  return null;
}

/**
 * Test database connection
 */
async function testConnection() {
  const dbInfo = findDatabase();
  
  if (!dbInfo) {
    return {
      success: false,
      error: 'Hyprnote database not found. Please ensure Hyprnote is installed.',
      searchedPaths: Object.values(DB_PATHS)
    };
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({ success: false, error: err.message, path: dbInfo.path });
        return;
      }
      
      db.get('SELECT COUNT(*) as count FROM sessions', (err, row) => {
        db.close();
        if (err) {
          resolve({ success: false, error: err.message, path: dbInfo.path });
        } else {
          resolve({
            success: true,
            version: dbInfo.version,
            path: dbInfo.path,
            sessionCount: row.count
          });
        }
      });
    });
  });
}

/**
 * Get completed sessions from the database
 * @param {number} hoursBack - How many hours back to look (default: 168 = 7 days)
 * @param {Set} excludeIds - Session IDs to exclude (already synced)
 */
async function getSessions(hoursBack = 168, excludeIds = new Set()) {
  const dbInfo = findDatabase();
  if (!dbInfo) {
    throw new Error('Hyprnote database not found');
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY);
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    const query = `
      SELECT 
        s.id,
        s.title,
        s.created_at,
        s.visited_at,
        s.record_start,
        s.record_end,
        s.raw_memo_html,
        s.enhanced_memo_html,
        s.calendar_event_id
      FROM sessions s
      WHERE s.record_end IS NOT NULL
        AND s.created_at >= ?
      ORDER BY s.created_at DESC
    `;
    
    db.all(query, [cutoffTime], (err, rows) => {
      if (err) {
        db.close();
        reject(err);
        return;
      }
      
      // Filter out already synced sessions
      const newSessions = (rows || []).filter(s => !excludeIds.has(s.id));
      
      db.close();
      resolve(newSessions);
    });
  });
}

/**
 * Get participants for a session
 * @param {string} sessionId - The session ID
 */
async function getSessionParticipants(sessionId) {
  const dbInfo = findDatabase();
  if (!dbInfo) {
    throw new Error('Hyprnote database not found');
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY);
    
    const query = `
      SELECT 
        h.id,
        h.full_name,
        h.email,
        h.job_title,
        h.is_user,
        o.name as company,
        o.website_url as company_website
      FROM session_participants sp
      JOIN humans h ON sp.human_id = h.id
      LEFT JOIN organizations o ON h.organization_id = o.id
      WHERE sp.session_id = ?
        AND sp.deleted = 0
    `;
    
    db.all(query, [sessionId], (err, rows) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get calendar event details if available
 * @param {string} eventId - Calendar event ID
 */
async function getCalendarEvent(eventId) {
  if (!eventId) return null;
  
  const dbInfo = findDatabase();
  if (!dbInfo) return null;
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY);
    
    const query = `
      SELECT 
        e.id,
        e.name,
        e.start_date,
        e.end_date,
        e.participants,
        e.google_event_url
      FROM events e
      WHERE e.id = ?
    `;
    
    db.get(query, [eventId], (err, row) => {
      db.close();
      resolve(err ? null : row);
    });
  });
}

/**
 * Get the current user from Hyprnote
 */
async function getCurrentUser() {
  const dbInfo = findDatabase();
  if (!dbInfo) return null;
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY);
    
    const query = `
      SELECT id, full_name, email, job_title
      FROM humans
      WHERE is_user = 1
      LIMIT 1
    `;
    
    db.get(query, (err, row) => {
      db.close();
      resolve(err ? null : row);
    });
  });
}

/**
 * Parse HTML to plain text
 */
function htmlToText(html) {
  if (!html) return '';
  
  return html
    .replace(/<h1[^>]*>/gi, '\n## ')
    .replace(/<h2[^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Calculate meeting duration
 */
function getDuration(startTime, endTime) {
  if (!startTime || !endTime) return 'Unknown';
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  const mins = Math.round(diffMs / 60000);
  
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

module.exports = {
  findDatabase,
  testConnection,
  getSessions,
  getSessionParticipants,
  getCalendarEvent,
  getCurrentUser,
  htmlToText,
  getDuration,
  DB_PATHS
};

