/**
 * Refresh Intel Cache Job
 * 
 * Scheduled job that refreshes the Slack intel JSON file cache from SQLite.
 * Runs every 6 hours and on server startup to ensure cache is populated.
 * 
 * This bridges the gap between SQLite storage and the data residency requirements:
 * - SQLite stores the raw intelligence (existing functionality)
 * - JSON file cache provides fast reads without hitting SQLite in hot paths
 * - File is in the repo data/ folder, survives deploys
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const intelligenceStore = require('../services/intelligenceStore');
const { saveIntelCache, getCacheStatus } = require('../services/slackIntelCache');

// Configuration
const REFRESH_INTERVAL_HOURS = 6;
const MAX_INTEL_PER_ACCOUNT = 20; // Keep last 20 intel items per account

// State
let refreshInProgress = false;
let lastRefreshResult = null;
let scheduledTask = null;

/**
 * Refresh the Slack intel cache from SQLite
 * Groups intel by account ID for fast lookups
 */
async function refreshSlackIntelCache() {
  if (refreshInProgress) {
    logger.info('[IntelCache] Refresh already in progress, skipping');
    return { skipped: true, reason: 'Already in progress' };
  }
  
  refreshInProgress = true;
  const startTime = Date.now();
  
  logger.info('[IntelCache] Starting Slack intel cache refresh...');
  
  try {
    // Get all pending intelligence from SQLite
    const allIntel = await intelligenceStore.getPendingIntelligence();
    
    logger.info(`[IntelCache] Fetched ${allIntel.length} intel items from SQLite`);
    
    // Group by account ID
    const byAccount = {};
    let skippedNoAccount = 0;
    
    for (const intel of allIntel) {
      const accountId = intel.account_id;
      
      if (!accountId) {
        skippedNoAccount++;
        continue;
      }
      
      if (!byAccount[accountId]) {
        byAccount[accountId] = [];
      }
      
      // Transform to the format expected by intelligenceQueryService
      byAccount[accountId].push({
        id: intel.id,
        category: intel.category || 'Intel',
        summary: intel.summary || intel.message_text?.substring(0, 200) || '',
        messageTs: intel.message_ts,
        author: intel.message_author_name || intel.message_author,
        capturedAt: intel.captured_at,
        status: intel.status,
        account_name: intel.account_name,
        confidence: intel.confidence
      });
    }
    
    // Trim to max per account and sort by recency
    for (const accountId of Object.keys(byAccount)) {
      byAccount[accountId] = byAccount[accountId]
        .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))
        .slice(0, MAX_INTEL_PER_ACCOUNT);
    }
    
    // Save to JSON file
    const success = saveIntelCache({ accounts: byAccount });
    
    const duration = Date.now() - startTime;
    
    lastRefreshResult = {
      success,
      accountCount: Object.keys(byAccount).length,
      totalIntel: allIntel.length,
      skippedNoAccount,
      duration,
      completedAt: new Date().toISOString()
    };
    
    logger.info(`[IntelCache] Refresh complete: ${Object.keys(byAccount).length} accounts, ${allIntel.length} intel items (${duration}ms)`);
    
    return lastRefreshResult;
    
  } catch (error) {
    logger.error('[IntelCache] Refresh failed:', error.message);
    
    lastRefreshResult = {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString()
    };
    
    return lastRefreshResult;
    
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Schedule the refresh job to run every N hours
 */
function scheduleRefresh() {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  // Run every 6 hours at minute 15 (to avoid conflicts with other jobs)
  const cronSchedule = `15 */${REFRESH_INTERVAL_HOURS} * * *`;
  
  scheduledTask = cron.schedule(cronSchedule, async () => {
    logger.info('[IntelCache] Scheduled refresh triggered');
    await refreshSlackIntelCache();
  });
  
  logger.info(`[IntelCache] Scheduled to run every ${REFRESH_INTERVAL_HOURS} hours`);
  
  return scheduledTask;
}

/**
 * Initialize the intel cache on server startup
 * - Schedules regular refreshes
 * - Runs an immediate refresh if cache is stale or empty
 */
async function initializeIntelCache() {
  logger.info('[IntelCache] Initializing Slack intel cache...');
  
  // Schedule regular refreshes
  scheduleRefresh();
  
  // Check current cache status
  const status = getCacheStatus();
  
  let needsRefresh = false;
  
  if (!status.lastRefresh) {
    logger.info('[IntelCache] No cache file found, will refresh');
    needsRefresh = true;
  } else {
    const lastRefreshTime = new Date(status.lastRefresh).getTime();
    const hoursSinceRefresh = (Date.now() - lastRefreshTime) / (1000 * 60 * 60);
    
    if (hoursSinceRefresh > REFRESH_INTERVAL_HOURS) {
      logger.info(`[IntelCache] Cache is ${hoursSinceRefresh.toFixed(1)} hours old, will refresh`);
      needsRefresh = true;
    } else {
      logger.info(`[IntelCache] Cache is fresh (${hoursSinceRefresh.toFixed(1)} hours old, ${status.totalIntelCount} items)`);
    }
  }
  
  // Run immediate refresh in background if needed
  if (needsRefresh) {
    setImmediate(() => {
      refreshSlackIntelCache().catch(err => {
        logger.error('[IntelCache] Initial refresh failed:', err.message);
      });
    });
  }
  
  return {
    initialized: true,
    cacheStatus: status,
    scheduledRefresh: true
  };
}

/**
 * Get refresh status for API/monitoring
 */
function getRefreshStatus() {
  const cacheStatus = getCacheStatus();
  
  return {
    refreshInProgress,
    lastRefreshResult,
    cacheStatus,
    config: {
      intervalHours: REFRESH_INTERVAL_HOURS,
      maxIntelPerAccount: MAX_INTEL_PER_ACCOUNT
    }
  };
}

/**
 * Manual trigger for API endpoint
 */
async function triggerManualRefresh() {
  logger.info('[IntelCache] Manual refresh triggered via API');
  return refreshSlackIntelCache();
}

/**
 * Stop scheduled refreshes (for cleanup)
 */
function stopScheduledRefresh() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[IntelCache] Scheduled refresh stopped');
  }
}

module.exports = {
  refreshSlackIntelCache,
  scheduleRefresh,
  initializeIntelCache,
  getRefreshStatus,
  triggerManualRefresh,
  stopScheduledRefresh,
  REFRESH_INTERVAL_HOURS
};
