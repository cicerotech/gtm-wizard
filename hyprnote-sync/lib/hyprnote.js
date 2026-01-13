/**
 * Hyprnote Database Reader
 * 
 * Reads meeting sessions from Hyprnote's local SQLite database.
 * Dynamically detects ANY Hyprnote version/installation.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Known database paths (checked first for speed)
const KNOWN_DB_PATHS = {
  stable: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.stable/db.sqlite'),
  nightly: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.nightly/db.sqlite'),
  legacy: path.join(os.homedir(), 'Library/Application Support/hyprnote/db.sqlite'),
  app: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.app/db.sqlite'),
  dev: path.join(os.homedir(), 'Library/Application Support/com.hyprnote.dev/db.sqlite')
};

// Cache the found database to avoid repeated scans
let cachedDatabase = null;

/**
 * Scan Application Support for any Hyprnote database
 * This finds ANY version, even unknown future releases
 */
function scanForHyprnoteDatabase() {
  const appSupport = path.join(os.homedir(), 'Library/Application Support');
  
  try {
    const dirs = fs.readdirSync(appSupport);
    
    // Look for any folder containing 'hyprnote' or 'hypr'
    for (const dir of dirs) {
      const lowerDir = dir.toLowerCase();
      if (lowerDir.includes('hyprnote') || lowerDir.includes('hypr')) {
        const dbPath = path.join(appSupport, dir, 'db.sqlite');
        if (fs.existsSync(dbPath)) {
          console.log(`  Found Hyprnote database: ${dir}`);
          return { version: dir, path: dbPath };
        }
        
        // Also check for database in subdirectories
        const dirPath = path.join(appSupport, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          try {
            const subFiles = fs.readdirSync(dirPath);
            for (const file of subFiles) {
              if (file === 'db.sqlite' || file.endsWith('.sqlite')) {
                const fullPath = path.join(dirPath, file);
                console.log(`  Found Hyprnote database: ${dir}/${file}`);
                return { version: dir, path: fullPath };
              }
            }
          } catch (e) {
            // Can't read subdirectory, skip
          }
        }
      }
    }
  } catch (err) {
    console.log('Warning: Could not scan Application Support: ' + err.message);
  }
  
  return null;
}

/**
 * Find the active Hyprnote database
 * 1. First checks known paths for speed
 * 2. Falls back to dynamic scan for unknown versions
 * 3. Caches result for subsequent calls
 */
function findDatabase() {
  // Return cached result if available
  if (cachedDatabase) {
    return cachedDatabase;
  }
  
  // First, try known paths (fast)
  for (const [version, dbPath] of Object.entries(KNOWN_DB_PATHS)) {
    if (fs.existsSync(dbPath)) {
      cachedDatabase = { version, path: dbPath };
      return cachedDatabase;
    }
  }
  
  // Fall back to dynamic scan (finds any version)
  console.log('  Scanning for Hyprnote installation...');
  const scannedResult = scanForHyprnoteDatabase();
  if (scannedResult) {
    cachedDatabase = scannedResult;
    return cachedDatabase;
  }
  
  return null;
}

/**
 * Clear the database cache (useful if user installs Hyprnote mid-session)
 */
function clearDatabaseCache() {
  cachedDatabase = null;
}

/**
 * Get all searched paths for error messages
 */
function getSearchedPaths() {
  const paths = Object.values(KNOWN_DB_PATHS);
  paths.push(path.join(os.homedir(), 'Library/Application Support/*hyprnote*/ (dynamic scan)'));
  return paths;
}

/**
 * Test database connection
 */
async function testConnection() {
  const dbInfo = findDatabase();
  
  if (!dbInfo) {
    return {
      success: false,
      error: 'Hyprnote database not found. Please ensure Hyprnote is installed and you have recorded at least one meeting.',
      searchedPaths: getSearchedPaths()
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
 * Parse HTML to clean plain text for Salesforce
 * Produces readable format without markdown symbols
 */
function htmlToText(html) {
  if (!html) return '';
  
  let text = html
    // Convert headers to uppercase section titles
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n$1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n$1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n$1\n')
    // Handle lists - keep bullet with content on same line
    .replace(/<li[^>]*>\s*/gi, '  - ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '')
    // Paragraphs
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up markdown symbols that might be in the content
    .replace(/^##\s*/gm, '')
    .replace(/^\*\s*/gm, '  - ')
    .replace(/^•\s*/gm, '  - ')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')           // Multiple spaces to single
    .replace(/\n[ \t]+/g, '\n')        // Trim line starts
    .replace(/[ \t]+\n/g, '\n')        // Trim line ends
    .replace(/\n{3,}/g, '\n\n')        // Max 2 newlines
    .replace(/^\s+|\s+$/g, '');        // Trim start/end
  
  // Clean up any remaining bullet misalignment
  const lines = text.split('\n');
  const cleanedLines = [];
  let lastWasBullet = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines after bullets
    if (!trimmed && lastWasBullet) continue;
    
    // Detect standalone bullets and merge with next line
    if (trimmed === '-' || trimmed === '•' || trimmed === '*') {
      lastWasBullet = true;
      continue;
    }
    
    // If this line follows a standalone bullet, prefix it
    if (lastWasBullet && trimmed) {
      cleanedLines.push('  - ' + trimmed);
      lastWasBullet = false;
      continue;
    }
    
    cleanedLines.push(trimmed);
    lastWasBullet = trimmed.startsWith('- ') || trimmed.startsWith('  - ');
  }
  
  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  scanForHyprnoteDatabase,
  clearDatabaseCache,
  getSearchedPaths,
  testConnection,
  getSessions,
  getSessionParticipants,
  getCalendarEvent,
  getCurrentUser,
  htmlToText,
  getDuration,
  KNOWN_DB_PATHS
};


