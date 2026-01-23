/**
 * Calendar Sync Job
 * Background job to sync Outlook calendars to SQLite database
 * 
 * Purpose:
 * - Fetch calendars from Microsoft Graph API in the background
 * - Store events in SQLite for instant page loads
 * - Runs on schedule (6am, 12pm, 6pm PT) and on server startup
 * 
 * Benefits:
 * - Page loads read from SQLite (~10ms) instead of Graph API (15+ minutes)
 * - Survives deploys (SQLite on Render Disk persists)
 * - No race conditions from multiple users loading the page
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
 * Main sync job - fetches all BL calendars and stores to SQLite
 */
async function runCalendarSync() {
  // Check if sync is stuck (been running too long)
  if (syncInProgress && syncStartTime) {
    const elapsed = Date.now() - syncStartTime;
    if (elapsed > MAX_SYNC_DURATION_MS) {
      logger.warn(`📅 [CalendarSync] Previous sync appears stuck (${Math.round(elapsed/1000)}s), forcing reset`);
      syncInProgress = false;
      syncStartTime = null;
    }
  }

  if (syncInProgress) {
    logger.info('📅 [CalendarSync] Sync already in progress, skipping');
    return { skipped: true, reason: 'Already in progress' };
  }

  syncInProgress = true;
  syncStartTime = Date.now();
  const startTime = Date.now();
  
  logger.info('📅 [CalendarSync] Starting background calendar sync...');

  try {
    // Run the calendar sync
    const result = await calendarService.syncCalendarsToDatabase(DAYS_AHEAD);
    
    logger.info(`📅 [CalendarSync] Calendar sync complete: ${result.eventsSaved} events saved`);
    
    // ENHANCED: Create missing contacts from calendar attendees
    let contactSyncResult = null;
    if (SYNC_CONTACTS_ON_CALENDAR && result.eventsSaved > 0) {
      try {
        logger.info(`📅 [CalendarSync] Processing attendees for contact creation...`);
        
        // Get the saved events with external attendees
        const storedEvents = await intelligenceStore.getStoredCalendarEvents(
          new Date().toISOString(),
          new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString()
        );
        
        // Filter to events with external attendees
        const eventsWithAttendees = storedEvents.filter(e => 
          e.externalAttendees && e.externalAttendees.length > 0
        );
        
        if (eventsWithAttendees.length > 0) {
          contactSyncResult = await contactSync.syncCalendarAttendees(eventsWithAttendees);
          logger.info(`📅 [CalendarSync] Contact sync: ${contactSyncResult.contactsCreated} created, ${contactSyncResult.contactsFound} found`);
        }
      } catch (contactError) {
        logger.warn(`📅 [CalendarSync] Contact sync failed (non-blocking):`, contactError.message);
        contactSyncResult = { error: contactError.message };
      }
    }
    
    lastSyncResult = {
      ...result,
      contactSync: contactSyncResult,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime
    };

    logger.info(`📅 [CalendarSync] Full sync complete in ${Date.now() - startTime}ms`);
    
    return lastSyncResult;

  } catch (error) {
    logger.error('📅 [CalendarSync] Sync failed:', error.message);
    
    lastSyncResult = {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime
    };
    
    // Update status in DB
    await intelligenceStore.updateCalendarSyncStatus({
      status: 'error',
      errors: [{ error: error.message }]
    });
    
    return lastSyncResult;

  } finally {
    syncInProgress = false;
    syncStartTime = null;
  }
}

/**
 * Check if we need to sync (>6 hours since last sync or no data)
 */
async function checkAndSync() {
  try {
    const needsSync = await calendarService.isCalendarSyncNeeded();
    
    if (needsSync) {
      logger.info('📅 [CalendarSync] Calendar data is stale, triggering sync...');
      return runCalendarSync();
    } else {
      logger.debug('📅 [CalendarSync] Calendar data is fresh, no sync needed');
      return { skipped: true, reason: 'Data is fresh' };
    }
  } catch (error) {
    logger.error('📅 [CalendarSync] Failed to check sync status:', error.message);
    // On error, try to sync anyway
    return runCalendarSync();
  }
}

/**
 * Schedule regular syncs
 * Runs every SYNC_INTERVAL_HOURS hours
 */
function scheduleSync() {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
  }

  const intervalMs = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
  
  logger.info(`📅 [CalendarSync] Scheduled to run every ${SYNC_INTERVAL_HOURS} hours`);
  
  scheduledInterval = setInterval(() => {
    logger.info('📅 [CalendarSync] Scheduled sync triggered');
    runCalendarSync().catch(err => {
      logger.error('📅 [CalendarSync] Scheduled sync failed:', err.message);
    });
  }, intervalMs);

  return scheduledInterval;
}

/**
 * Initialize calendar sync on server startup
 * - Checks if we have data, if not triggers immediate sync
 * - Sets up scheduled syncs
 */
async function initializeCalendarSync() {
  logger.info('📅 [CalendarSync] Initializing calendar sync service...');

  try {
    // Check if we have any calendar data
    const stats = await intelligenceStore.getCalendarStats();
    const syncStatus = await intelligenceStore.getCalendarSyncStatus();
    
    logger.info(`📅 [CalendarSync] Current state: ${stats.totalEvents} events, last sync: ${syncStatus?.last_sync_at || 'never'}`);

    // Schedule regular syncs
    scheduleSync();

    // If no data or stale, trigger immediate background sync
    if (stats.totalEvents === 0) {
      logger.info('📅 [CalendarSync] No calendar data found, triggering initial sync...');
      // Run in background - don't block server startup
      setImmediate(() => {
        runCalendarSync().catch(err => {
          logger.error('📅 [CalendarSync] Initial sync failed:', err.message);
        });
      });
    } else {
      // Check if data is stale
      const needsSync = await calendarService.isCalendarSyncNeeded();
      if (needsSync) {
        logger.info('📅 [CalendarSync] Calendar data is stale, triggering background sync...');
        setImmediate(() => {
          runCalendarSync().catch(err => {
            logger.error('📅 [CalendarSync] Background sync failed:', err.message);
          });
        });
      } else {
        logger.info('📅 [CalendarSync] Calendar data is fresh, no immediate sync needed');
      }
    }

    return { initialized: true, currentEvents: stats.totalEvents };

  } catch (error) {
    logger.error('📅 [CalendarSync] Failed to initialize:', error.message);
    // Still schedule syncs even if initial check fails
    scheduleSync();
    return { initialized: false, error: error.message };
  }
}

/**
 * Get sync status for API/UI
 */
async function getSyncStatus() {
  try {
    const stats = await intelligenceStore.getCalendarStats();
    const syncStatus = await intelligenceStore.getCalendarSyncStatus();
    
    // Check if sync is stuck
    let syncState = syncInProgress ? 'syncing' : 'idle';
    if (syncInProgress && syncStartTime) {
      const elapsed = Date.now() - syncStartTime;
      if (elapsed > MAX_SYNC_DURATION_MS) {
        syncState = 'stuck';
      }
    }
    
    return {
      syncInProgress,
      syncState,
      syncElapsedMs: syncStartTime ? Date.now() - syncStartTime : null,
      lastSyncResult,
      databaseStats: stats,
      syncStatus: {
        lastSync: syncStatus?.last_sync_at || null,
        nextSync: syncStatus?.next_sync_at || null,
        status: syncStatus?.status || 'unknown',
        errors: syncStatus?.errors || []
      },
      config: {
        daysAhead: DAYS_AHEAD,
        syncIntervalHours: SYNC_INTERVAL_HOURS,
        maxSyncDurationMs: MAX_SYNC_DURATION_MS
      }
    };
  } catch (error) {
    return {
      syncInProgress,
      lastSyncResult,
      error: error.message
    };
  }
}

/**
 * Manual trigger for API endpoint
 */
async function triggerManualSync() {
  logger.info('📅 [CalendarSync] Manual sync triggered via API');
  return runCalendarSync();
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

