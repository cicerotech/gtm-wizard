/**
 * Meeting Prep File Store
 * File-based storage for BL meeting preparation data
 * 
 * Zero Render Storage Architecture:
 * - Data stored in data/meeting-prep-cache.json (committed to git)
 * - In-memory cache for fast reads
 * - Atomic file writes with debouncing
 * - Survives Render deployments via git persistence
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// File path for meeting prep data
const MEETING_PREP_FILE = path.join(__dirname, '../../data/meeting-prep-cache.json');

// In-memory cache
let prepCache = null;
let cacheLoadedAt = null;

// Debounced save
let pendingSave = null;
const SAVE_DEBOUNCE_MS = 5000; // 5 seconds

/**
 * Load meeting prep data from file
 */
function loadPrepFile() {
  try {
    if (fs.existsSync(MEETING_PREP_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEETING_PREP_FILE, 'utf8'));
      logger.debug(`[MeetingPrepStore] Loaded ${Object.keys(data.preps || {}).length} meeting preps from file`);
      return data;
    }
  } catch (error) {
    logger.error('[MeetingPrepStore] Failed to load file:', error.message);
  }
  
  // Return empty structure
  return {
    preps: {},
    lastModified: null
  };
}

/**
 * Save meeting prep data to file (atomic write)
 */
function savePrepFile() {
  if (!prepCache) return false;
  
  try {
    prepCache.lastModified = new Date().toISOString();
    
    // Ensure directory exists
    const dir = path.dirname(MEETING_PREP_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write: write to temp file, then rename
    const tempFile = MEETING_PREP_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(prepCache, null, 2));
    fs.renameSync(tempFile, MEETING_PREP_FILE);
    
    logger.debug(`[MeetingPrepStore] Saved ${Object.keys(prepCache.preps || {}).length} meeting preps to file`);
    return true;
    
  } catch (error) {
    logger.error('[MeetingPrepStore] Failed to save file:', error.message);
    return false;
  }
}

/**
 * Schedule a debounced save
 */
function scheduleSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
  }
  
  pendingSave = setTimeout(() => {
    savePrepFile();
    pendingSave = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force immediate save (for shutdown or important operations)
 */
function forceSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  return savePrepFile();
}

/**
 * Get cache, loading from file if needed
 */
function getCache() {
  if (!prepCache) {
    prepCache = loadPrepFile();
    cacheLoadedAt = Date.now();
  }
  return prepCache;
}

/**
 * Initialize the meeting prep file store
 */
async function init() {
  prepCache = loadPrepFile();
  cacheLoadedAt = Date.now();
  
  const prepCount = Object.keys(prepCache.preps || {}).length;
  logger.info(`[MeetingPrepStore] Initialized with ${prepCount} meeting preps`);
  
  return { initialized: true, prepCount };
}

/**
 * Save or update meeting prep (upsert by meeting_id)
 * @param {Object} data - Meeting prep data
 */
async function saveMeetingPrep(data) {
  const cache = getCache();
  
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
    contextOverride,
    isFirstMeeting,
    authorId,
    source
  } = data;
  
  if (!meetingId) {
    throw new Error('meetingId is required');
  }
  
  const now = new Date().toISOString();
  const existing = cache.preps[meetingId];
  
  cache.preps[meetingId] = {
    meeting_id: meetingId,
    account_id: accountId,
    account_name: accountName,
    meeting_title: meetingTitle,
    meeting_date: meetingDate,
    attendees: attendees || [],
    agenda: agenda || [],
    goals: goals || [],
    demo_required: demoRequired ? 1 : 0,
    demo_selections: demoSelections || [],
    context_snapshot: contextSnapshot || {},
    is_first_meeting: isFirstMeeting ? 1 : 0,
    author_id: authorId,
    source: source || 'manual',
    created_at: existing?.created_at || now,
    updated_at: now
  };
  
  forceSave(); // Meeting prep is important, save immediately
  
  logger.info(`[MeetingPrepStore] Saved meeting prep: ${meetingTitle} (${meetingId})`);
  return { meetingId, saved: true };
}

/**
 * Get meeting prep by meeting ID
 * @param {string} meetingId
 */
async function getMeetingPrep(meetingId) {
  const cache = getCache();
  const row = cache.preps[meetingId];
  
  if (!row) {
    return null;
  }
  
  // Parse to expected format
  return {
    ...row,
    meetingId: row.meeting_id,
    accountId: row.account_id,
    accountName: row.account_name,
    meetingTitle: row.meeting_title,
    meetingDate: row.meeting_date,
    attendees: row.attendees || [],
    agenda: row.agenda || [],
    goals: row.goals || [],
    demoSelections: row.demo_selections || [],
    contextSnapshot: row.context_snapshot || {},
    demoRequired: row.demo_required === 1,
    isFirstMeeting: row.is_first_meeting === 1
  };
}

/**
 * Get all meeting preps for an account
 * @param {string} accountId
 */
async function getMeetingPrepsByAccount(accountId) {
  const cache = getCache();
  
  const preps = Object.values(cache.preps)
    .filter(p => p.account_id === accountId)
    .sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date))
    .map(row => ({
      ...row,
      meetingId: row.meeting_id,
      accountId: row.account_id,
      accountName: row.account_name,
      meetingTitle: row.meeting_title,
      meetingDate: row.meeting_date,
      attendees: row.attendees || [],
      agenda: row.agenda || [],
      goals: row.goals || [],
      demoSelections: row.demo_selections || [],
      contextSnapshot: row.context_snapshot || {},
      demoRequired: row.demo_required === 1,
      isFirstMeeting: row.is_first_meeting === 1
    }));
  
  return preps;
}

/**
 * Get upcoming meetings within date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
async function getUpcomingMeetingPreps(startDate, endDate) {
  const cache = getCache();
  
  const preps = Object.values(cache.preps)
    .filter(p => {
      const date = new Date(p.meeting_date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    })
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))
    .map(row => ({
      ...row,
      meetingId: row.meeting_id,
      accountId: row.account_id,
      accountName: row.account_name,
      meetingTitle: row.meeting_title,
      meetingDate: row.meeting_date,
      attendees: row.attendees || [],
      agenda: row.agenda || [],
      goals: row.goals || [],
      demoSelections: row.demo_selections || [],
      contextSnapshot: row.context_snapshot || {},
      demoRequired: row.demo_required === 1,
      isFirstMeeting: row.is_first_meeting === 1
    }));
  
  return preps;
}

/**
 * Delete a meeting prep
 * @param {string} meetingId
 */
async function deleteMeetingPrep(meetingId) {
  const cache = getCache();
  
  if (!cache.preps[meetingId]) {
    return { meetingId, deleted: false };
  }
  
  delete cache.preps[meetingId];
  forceSave();
  
  logger.info(`[MeetingPrepStore] Deleted meeting prep: ${meetingId}`);
  return { meetingId, deleted: true };
}

/**
 * Get all meeting preps
 */
async function getAllMeetingPreps() {
  const cache = getCache();
  
  return Object.values(cache.preps)
    .sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date))
    .map(row => ({
      ...row,
      meetingId: row.meeting_id,
      accountId: row.account_id,
      accountName: row.account_name,
      meetingTitle: row.meeting_title,
      meetingDate: row.meeting_date,
      attendees: row.attendees || [],
      agenda: row.agenda || [],
      goals: row.goals || [],
      demoSelections: row.demo_selections || [],
      contextSnapshot: row.context_snapshot || {},
      demoRequired: row.demo_required === 1,
      isFirstMeeting: row.is_first_meeting === 1
    }));
}

/**
 * Migrate meeting preps from SQLite rows
 * @param {Array} sqliteRows - Rows from SQLite meeting_prep table
 * @returns {number} Number of preps migrated
 */
async function migrateFromSQLite(sqliteRows) {
  if (!sqliteRows || sqliteRows.length === 0) {
    return 0;
  }
  
  const cache = getCache();
  let migrated = 0;
  
  for (const row of sqliteRows) {
    const meetingId = row.meeting_id;
    
    // Skip if already exists in file store
    if (cache.preps[meetingId]) {
      continue;
    }
    
    cache.preps[meetingId] = {
      meeting_id: row.meeting_id,
      account_id: row.account_id,
      account_name: row.account_name,
      meeting_title: row.meeting_title,
      meeting_date: row.meeting_date,
      attendees: typeof row.attendees === 'string' ? JSON.parse(row.attendees) : (row.attendees || []),
      agenda: typeof row.agenda === 'string' ? JSON.parse(row.agenda) : (row.agenda || []),
      goals: typeof row.goals === 'string' ? JSON.parse(row.goals) : (row.goals || []),
      demo_required: row.demo_required,
      demo_selections: typeof row.demo_selections === 'string' ? JSON.parse(row.demo_selections) : (row.demo_selections || []),
      context_snapshot: typeof row.context_snapshot === 'string' ? JSON.parse(row.context_snapshot) : (row.context_snapshot || {}),
      is_first_meeting: row.is_first_meeting,
      author_id: row.author_id,
      source: row.source || 'sqlite_migration',
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    
    migrated++;
  }
  
  if (migrated > 0) {
    forceSave();
    logger.info(`[MeetingPrepStore] Migrated ${migrated} meeting preps from SQLite`);
  }
  
  return migrated;
}

/**
 * Get store status for diagnostics
 */
function getStoreStatus() {
  const cache = getCache();
  
  return {
    type: 'file',
    file: MEETING_PREP_FILE,
    prepCount: Object.keys(cache.preps || {}).length,
    lastModified: cache.lastModified,
    cacheLoadedAt: cacheLoadedAt ? new Date(cacheLoadedAt).toISOString() : null
  };
}

module.exports = {
  init,
  saveMeetingPrep,
  getMeetingPrep,
  getMeetingPrepsByAccount,
  getUpcomingMeetingPreps,
  deleteMeetingPrep,
  getAllMeetingPreps,
  migrateFromSQLite,
  getStoreStatus,
  forceSave,
  MEETING_PREP_FILE
};
