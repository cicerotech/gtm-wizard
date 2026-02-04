/**
 * Slack Intel File Cache
 * 
 * Stores Slack intelligence in a JSON file within the repo (data/ folder).
 * This ensures data survives deploys while keeping it out of Render's SQLite.
 * 
 * Pattern follows bl-snapshots.json - file is committed to git and refreshed
 * by scheduled jobs.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Cache file location - in repo data/ folder (survives deploys)
const INTEL_CACHE_FILE = path.join(__dirname, '../../data/slack-intel-cache.json');

// In-memory cache for fast reads (loaded from file on startup)
let memoryCache = null;
let memoryCacheLoadedAt = null;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes before re-reading file

/**
 * Load Slack intel cache from JSON file
 * Returns cached data grouped by account ID
 */
function loadIntelCache() {
  // Check memory cache first
  if (memoryCache && memoryCacheLoadedAt && 
      (Date.now() - memoryCacheLoadedAt) < MEMORY_CACHE_TTL_MS) {
    return memoryCache;
  }
  
  try {
    if (fs.existsSync(INTEL_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(INTEL_CACHE_FILE, 'utf8'));
      memoryCache = data;
      memoryCacheLoadedAt = Date.now();
      logger.debug(`[SlackIntelCache] Loaded cache with ${Object.keys(data.accounts || {}).length} accounts`);
      return data;
    }
  } catch (error) {
    logger.warn(`[SlackIntelCache] Failed to load cache file: ${error.message}`);
  }
  
  // Return empty structure if file doesn't exist or fails to parse
  return { accounts: {}, lastRefresh: null, totalIntelCount: 0 };
}

/**
 * Save Slack intel cache to JSON file
 * @param {Object} data - { accounts: { [accountId]: intel[] }, ... }
 */
function saveIntelCache(data) {
  try {
    // Add metadata
    data.lastRefresh = new Date().toISOString();
    data.totalIntelCount = Object.values(data.accounts || {}).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
    );
    
    // Ensure directory exists
    const dir = path.dirname(INTEL_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write atomically (write to temp, then rename)
    const tempFile = INTEL_CACHE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, INTEL_CACHE_FILE);
    
    // Update memory cache
    memoryCache = data;
    memoryCacheLoadedAt = Date.now();
    
    logger.info(`[SlackIntelCache] Saved cache: ${data.totalIntelCount} intel items for ${Object.keys(data.accounts).length} accounts`);
    return true;
  } catch (error) {
    logger.error(`[SlackIntelCache] Failed to save cache: ${error.message}`);
    return false;
  }
}

/**
 * Get Slack intel for a specific account
 * @param {string} accountId - Salesforce Account ID
 * @returns {Array} Array of intel items for the account
 */
function getIntelForAccount(accountId) {
  if (!accountId) return [];
  
  const cache = loadIntelCache();
  return cache.accounts?.[accountId] || [];
}

/**
 * Get Slack intel by account name (fuzzy match)
 * @param {string} accountName - Account name to search for
 * @returns {Array} Array of intel items matching the account name
 */
function getIntelByAccountName(accountName) {
  if (!accountName) return [];
  
  const cache = loadIntelCache();
  const nameLower = accountName.toLowerCase();
  
  // Look for direct match in account names stored in cache metadata
  for (const [accountId, intelItems] of Object.entries(cache.accounts || {})) {
    if (Array.isArray(intelItems) && intelItems.length > 0) {
      const firstItem = intelItems[0];
      if (firstItem.account_name?.toLowerCase() === nameLower) {
        return intelItems;
      }
    }
  }
  
  return [];
}

/**
 * Get cache metadata (for debugging/status endpoints)
 */
function getCacheStatus() {
  const cache = loadIntelCache();
  return {
    lastRefresh: cache.lastRefresh,
    accountCount: Object.keys(cache.accounts || {}).length,
    totalIntelCount: cache.totalIntelCount || 0,
    cacheFile: INTEL_CACHE_FILE
  };
}

/**
 * Clear memory cache (force reload from file on next access)
 */
function invalidateMemoryCache() {
  memoryCache = null;
  memoryCacheLoadedAt = null;
  logger.debug('[SlackIntelCache] Memory cache invalidated');
}

module.exports = {
  loadIntelCache,
  saveIntelCache,
  getIntelForAccount,
  getIntelByAccountName,
  getCacheStatus,
  invalidateMemoryCache,
  INTEL_CACHE_FILE
};
