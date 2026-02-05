/**
 * TelemetryStore - Persists plugin telemetry events to Git-versioned JSON
 * 
 * Stores error logs, heartbeats, and sync events for admin debugging.
 * Auto-purges events older than 7 days on each write.
 * 
 * Data stored in: data/telemetry-log.json
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger') || console;

const DATA_DIR = path.join(__dirname, '../../data');
const TELEMETRY_FILE = path.join(DATA_DIR, 'telemetry-log.json');
const RETENTION_DAYS = 7;
const MAX_EVENTS = 10000; // Safety limit

// In-memory cache for fast reads
let telemetryCache = null;
let isDirty = false;
let saveTimeout = null;

/**
 * Initialize telemetry store
 */
function init() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      const data = fs.readFileSync(TELEMETRY_FILE, 'utf8');
      telemetryCache = JSON.parse(data);
      logger.info(`[TelemetryStore] Loaded ${telemetryCache.events?.length || 0} events`);
    } else {
      telemetryCache = {
        events: [],
        userStats: {},
        lastPurge: null
      };
      saveToDisk();
      logger.info('[TelemetryStore] Initialized new telemetry store');
    }
  } catch (error) {
    logger.error('[TelemetryStore] Failed to load telemetry:', error);
    telemetryCache = {
      events: [],
      userStats: {},
      lastPurge: null
    };
  }
}

/**
 * Save telemetry data to disk (debounced)
 */
function scheduleSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  isDirty = true;
  saveTimeout = setTimeout(saveToDisk, 5000); // 5 second debounce
}

/**
 * Immediately save to disk
 */
function saveToDisk() {
  if (!telemetryCache) return;
  
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(telemetryCache, null, 2));
    isDirty = false;
    logger.verbose?.('[TelemetryStore] Saved to disk');
  } catch (error) {
    logger.error('[TelemetryStore] Failed to save:', error);
  }
}

/**
 * Purge events older than retention period
 */
function purgeOldEvents() {
  if (!telemetryCache) return;
  
  const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const beforeCount = telemetryCache.events.length;
  
  telemetryCache.events = telemetryCache.events.filter(event => {
    const eventTime = new Date(event.timestamp).getTime();
    return eventTime > cutoff;
  });
  
  // Also limit to MAX_EVENTS
  if (telemetryCache.events.length > MAX_EVENTS) {
    telemetryCache.events = telemetryCache.events.slice(-MAX_EVENTS);
  }
  
  telemetryCache.lastPurge = new Date().toISOString();
  
  const purgedCount = beforeCount - telemetryCache.events.length;
  if (purgedCount > 0) {
    logger.info(`[TelemetryStore] Purged ${purgedCount} old events`);
  }
}

/**
 * Record a telemetry event
 */
function recordEvent(type, email, data = {}) {
  if (!telemetryCache) init();
  
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    type,
    email: email?.toLowerCase().trim() || 'anonymous',
    timestamp: new Date().toISOString(),
    ...data
  };
  
  telemetryCache.events.push(event);
  
  // Update user stats
  const userEmail = event.email;
  if (!telemetryCache.userStats[userEmail]) {
    telemetryCache.userStats[userEmail] = {
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      eventCount: 0,
      errorCount: 0,
      version: null
    };
  }
  
  const stats = telemetryCache.userStats[userEmail];
  stats.lastSeen = event.timestamp;
  stats.eventCount++;
  
  if (type === 'error') {
    stats.errorCount++;
  }
  
  if (data.version) {
    stats.version = data.version;
  }
  
  if (data.accountCount !== undefined) {
    stats.accountCount = data.accountCount;
  }
  
  // Purge old events periodically (every 100 events)
  if (telemetryCache.events.length % 100 === 0) {
    purgeOldEvents();
  }
  
  scheduleSave();
  
  return event.id;
}

/**
 * Record an error event
 */
function recordError(email, message, context = {}) {
  return recordEvent('error', email, {
    message,
    context,
    level: 'error'
  });
}

/**
 * Record a warning event
 */
function recordWarning(email, message, context = {}) {
  return recordEvent('warning', email, {
    message,
    context,
    level: 'warning'
  });
}

/**
 * Record an info event
 */
function recordInfo(email, message, context = {}) {
  return recordEvent('info', email, {
    message,
    context,
    level: 'info'
  });
}

/**
 * Record a heartbeat from a plugin
 */
function recordHeartbeat(email, data = {}) {
  return recordEvent('heartbeat', email, {
    ...data,
    level: 'info'
  });
}

/**
 * Record a sync event
 */
function recordSync(email, result = {}) {
  return recordEvent('sync', email, {
    ...result,
    level: 'info'
  });
}

/**
 * Get all user stats
 */
function getUserStats() {
  if (!telemetryCache) init();
  return telemetryCache.userStats || {};
}

/**
 * Get recent errors (last 24 hours by default)
 */
function getRecentErrors(sinceHours = 24) {
  if (!telemetryCache) init();
  
  const cutoff = Date.now() - (sinceHours * 60 * 60 * 1000);
  
  return telemetryCache.events.filter(event => {
    const eventTime = new Date(event.timestamp).getTime();
    return event.type === 'error' && eventTime > cutoff;
  });
}

/**
 * Get events for a specific user
 */
function getUserEvents(email, limit = 100) {
  if (!telemetryCache) init();
  
  const normalizedEmail = email?.toLowerCase().trim();
  
  return telemetryCache.events
    .filter(event => event.email === normalizedEmail)
    .slice(-limit);
}

/**
 * Get all users with their latest activity
 */
function getAllUsers() {
  if (!telemetryCache) init();
  
  const stats = telemetryCache.userStats || {};
  
  return Object.entries(stats).map(([email, data]) => ({
    email,
    lastSeen: data.lastSeen,
    firstSeen: data.firstSeen,
    eventCount: data.eventCount,
    errorCount: data.errorCount,
    version: data.version,
    accountCount: data.accountCount
  })).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

/**
 * Get user debug info
 */
function getUserDebugInfo(email) {
  if (!telemetryCache) init();
  
  const normalizedEmail = email?.toLowerCase().trim();
  const stats = telemetryCache.userStats[normalizedEmail] || null;
  const recentEvents = getUserEvents(normalizedEmail, 50);
  const recentErrors = recentEvents.filter(e => e.type === 'error');
  
  return {
    email: normalizedEmail,
    stats,
    recentEvents: recentEvents.slice(-20),
    recentErrors: recentErrors.slice(-10),
    lastHeartbeat: recentEvents.filter(e => e.type === 'heartbeat').pop() || null
  };
}

/**
 * Store a pushed config for a user (admin feature)
 */
function storePushedConfig(email, updates) {
  if (!telemetryCache) init();
  
  const normalizedEmail = email?.toLowerCase().trim();
  
  if (!telemetryCache.pushedConfigs) {
    telemetryCache.pushedConfigs = {};
  }
  
  telemetryCache.pushedConfigs[normalizedEmail] = {
    updates,
    pushedAt: new Date().toISOString(),
    delivered: false
  };
  
  scheduleSave();
  return true;
}

/**
 * Get and clear pushed config for a user
 */
function getPushedConfig(email) {
  if (!telemetryCache) init();
  
  const normalizedEmail = email?.toLowerCase().trim();
  
  if (!telemetryCache.pushedConfigs || !telemetryCache.pushedConfigs[normalizedEmail]) {
    return null;
  }
  
  const config = telemetryCache.pushedConfigs[normalizedEmail];
  
  // Mark as delivered and clear
  config.delivered = true;
  config.deliveredAt = new Date().toISOString();
  delete telemetryCache.pushedConfigs[normalizedEmail];
  
  scheduleSave();
  
  return config.updates;
}

/**
 * Force save (for graceful shutdown)
 */
function forceSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (isDirty) {
    saveToDisk();
  }
}

// Initialize on module load
init();

// Handle graceful shutdown
process.on('SIGTERM', forceSave);
process.on('SIGINT', forceSave);

module.exports = {
  init,
  recordEvent,
  recordError,
  recordWarning,
  recordInfo,
  recordHeartbeat,
  recordSync,
  getUserStats,
  getRecentErrors,
  getUserEvents,
  getAllUsers,
  getUserDebugInfo,
  storePushedConfig,
  getPushedConfig,
  forceSave
};
