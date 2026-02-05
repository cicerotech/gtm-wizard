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

// ═══════════════════════════════════════════════════════════════════════════
// ZERO RENDER STORAGE - Direct write capabilities
// ═══════════════════════════════════════════════════════════════════════════

const MAX_INTEL_PER_ACCOUNT = 20; // Keep last 20 intel items per account

/**
 * Add a single intel item to the file cache (Zero Render Storage)
 * This is the primary write path for new intel
 * @param {Object} intel - Intel item to add
 * @returns {boolean} Success status
 */
function addIntelItem(intel) {
  if (!intel || !intel.accountId) {
    logger.warn('[SlackIntelCache] Cannot add intel without accountId');
    return false;
  }
  
  try {
    const cache = loadIntelCache();
    
    // Initialize account array if needed
    if (!cache.accounts) {
      cache.accounts = {};
    }
    if (!cache.accounts[intel.accountId]) {
      cache.accounts[intel.accountId] = [];
    }
    
    // Check for duplicate (by messageTs)
    const existing = cache.accounts[intel.accountId].find(
      item => item.messageTs === intel.messageTs
    );
    if (existing) {
      logger.debug(`[SlackIntelCache] Intel already exists: ${intel.messageTs}`);
      return true; // Already exists, not an error
    }
    
    // Add new intel item
    const intelItem = {
      id: intel.id || `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      category: intel.category || 'Intel',
      summary: intel.summary || intel.messageText?.substring(0, 200) || '',
      messageTs: intel.messageTs,
      author: intel.messageAuthorName || intel.messageAuthor || 'Unknown',
      capturedAt: intel.capturedAt || new Date().toISOString(),
      status: intel.status || 'pending',
      account_name: intel.accountName,
      confidence: intel.confidence
    };
    
    // Add to front (most recent first)
    cache.accounts[intel.accountId].unshift(intelItem);
    
    // Trim to max per account
    if (cache.accounts[intel.accountId].length > MAX_INTEL_PER_ACCOUNT) {
      cache.accounts[intel.accountId] = cache.accounts[intel.accountId].slice(0, MAX_INTEL_PER_ACCOUNT);
    }
    
    // Save immediately
    return saveIntelCache(cache);
    
  } catch (error) {
    logger.error('[SlackIntelCache] Failed to add intel item:', error.message);
    return false;
  }
}

/**
 * Update intel item status
 * @param {string} accountId - Account ID
 * @param {string} messageTs - Message timestamp (unique identifier)
 * @param {string} status - New status ('pending', 'approved', 'rejected')
 * @returns {boolean} Success status
 */
function updateIntelStatus(accountId, messageTs, status) {
  try {
    const cache = loadIntelCache();
    
    if (!cache.accounts?.[accountId]) {
      return false;
    }
    
    const item = cache.accounts[accountId].find(i => i.messageTs === messageTs);
    if (!item) {
      return false;
    }
    
    item.status = status;
    if (status === 'approved') {
      item.syncedAt = new Date().toISOString();
    }
    
    return saveIntelCache(cache);
    
  } catch (error) {
    logger.error('[SlackIntelCache] Failed to update intel status:', error.message);
    return false;
  }
}

/**
 * Get all intel items (for migration/admin purposes)
 * @returns {Array} All intel items across all accounts
 */
function getAllIntelItems() {
  const cache = loadIntelCache();
  const allItems = [];
  
  for (const [accountId, items] of Object.entries(cache.accounts || {})) {
    for (const item of items) {
      allItems.push({
        ...item,
        accountId
      });
    }
  }
  
  return allItems;
}

/**
 * Check if a message has already been processed (deduplication)
 * @param {string} messageTs - Message timestamp
 * @returns {boolean} True if already processed
 */
function isMessageProcessed(messageTs) {
  if (!messageTs) return false;
  
  const cache = loadIntelCache();
  
  for (const items of Object.values(cache.accounts || {})) {
    if (items.some(item => item.messageTs === messageTs)) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  loadIntelCache,
  saveIntelCache,
  getIntelForAccount,
  getIntelByAccountName,
  getCacheStatus,
  invalidateMemoryCache,
  // Zero Render Storage additions
  addIntelItem,
  updateIntelStatus,
  getAllIntelItems,
  isMessageProcessed,
  INTEL_CACHE_FILE,
  MAX_INTEL_PER_ACCOUNT
};
