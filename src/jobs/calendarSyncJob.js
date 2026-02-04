/**
 * Calendar Sync Job
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * DEPRECATED - Phase 2 Data Residency Migration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This job previously synced Outlook calendars to SQLite database.
 * As of Phase 2 migration, calendar data uses EPHEMERAL IN-MEMORY CACHE only.
 * No customer meeting data is persisted to disk on Render.
 * 
 * The calendarService.getUpcomingMeetingsForAllBLs() function now handles:
 * - Fetching from Microsoft Graph API
 * - Caching in memory (10-min TTL)
 * - Automatic refresh on cache expiry
 * 
 * This file is kept for backward compatibility and API endpoints that
 * may still reference these functions, but they are now no-ops.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const { calendarService } = require('../services/calendarService');
const intelligenceStore = require('../services/intelligenceStore');
const contactSync = require('../services/salesforceContactSync');

// Configuration
const DAYS_AHEAD = 14; // Sync next 14 days of meetings
const SYNC_INTERVAL_HOURS = 6; // Sync every 6 hours
const SYNC_CONTACTS_ON_CALENDAR = true; // Create missing contacts during calendar sync

// State
let syncInProgress = false;
let lastSyncResult = null;
let scheduledInterval = null;
let syncStartTime = null;
const MAX_SYNC_DURATION_MS = 10 * 60 * 1000; // 10 minute max sync time

/**
 * @deprecated SQLite calendar sync is deprecated - using in-memory cache now
 * Main sync job - now a NO-OP, returns immediately
 * Calendar data is handled by in-memory cache in calendarService
 */
async function runCalendarSync() {
  logger.info('📅 [CalendarSync] DEPRECATED: SQLite calendar sync is disabled');
  logger.info('📅 [CalendarSync] Calendar data now uses ephemeral in-memory cache');
  
  return {
    success: true,
    deprecated: true,
    message: 'SQLite sync disabled - using in-memory cache per Phase 2 Data Residency Migration',
    eventsSaved: 0,
    completedAt: new Date().toISOString()
  };
}

/**
 * @deprecated SQLite sync check is deprecated - in-memory cache handles freshness
 */
async function checkAndSync() {
  logger.debug('📅 [CalendarSync] DEPRECATED: checkAndSync is a no-op');
  return { skipped: true, reason: 'Deprecated - using in-memory cache' };
}

/**
 * @deprecated SQLite sync scheduling is deprecated - no longer needed
 */
function scheduleSync() {
  logger.info('📅 [CalendarSync] DEPRECATED: Scheduled sync disabled - using in-memory cache');
  return null;
}

/**
 * @deprecated SQLite calendar sync initialization is deprecated
 * Calendar data now uses ephemeral in-memory cache - no initialization needed
 */
async function initializeCalendarSync() {
  logger.info('📅 [CalendarSync] DEPRECATED: SQLite sync initialization skipped');
  logger.info('📅 [CalendarSync] Calendar data uses in-memory cache (auto-initialized on first request)');
  
  return { 
    initialized: true, 
    deprecated: true,
    message: 'Using in-memory cache per Phase 2 Data Residency Migration'
  };
}

/**
 * Get sync status for API/UI
 * Now returns deprecated status since SQLite sync is disabled
 */
async function getSyncStatus() {
  return {
    deprecated: true,
    message: 'SQLite calendar sync disabled - using in-memory cache',
    syncInProgress: false,
    syncState: 'disabled',
    cacheType: 'in-memory',
    cacheTTL: '10 minutes',
    config: {
      daysAhead: DAYS_AHEAD,
      note: 'Scheduled SQLite sync is disabled per Phase 2 Data Residency Migration'
    }
  };
}

/**
 * @deprecated Manual sync trigger is deprecated - in-memory cache auto-refreshes
 */
async function triggerManualSync() {
  logger.info('📅 [CalendarSync] DEPRECATED: Manual sync trigger is a no-op');
  return {
    deprecated: true,
    message: 'SQLite sync disabled - in-memory cache auto-refreshes on access',
    tip: 'Calendar data is fetched from Microsoft Graph on first access and cached for 10 minutes'
  };
}

/**
 * Stop scheduled syncs (for cleanup)
 */
function stopScheduledSync() {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
    scheduledInterval = null;
    logger.info('📅 [CalendarSync] Scheduled sync stopped');
  }
}

module.exports = {
  runCalendarSync,
  checkAndSync,
  scheduleSync,
  initializeCalendarSync,
  getSyncStatus,
  triggerManualSync,
  stopScheduledSync,
  DAYS_AHEAD,
  SYNC_INTERVAL_HOURS
};

