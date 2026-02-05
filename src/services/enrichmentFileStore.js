/**
 * Enrichment File Store
 * File-based storage for attendee enrichment data
 * 
 * Zero Render Storage Architecture:
 * - Data stored in data/enrichment-cache.json (committed to git)
 * - In-memory cache for fast reads
 * - Atomic file writes with debouncing
 * - Survives Render deployments via git persistence
 * 
 * Stores both Clay enrichments and Claude fallback enrichments.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// File path for enrichment data
const ENRICHMENT_FILE = path.join(__dirname, '../../data/enrichment-cache.json');

// In-memory cache
let enrichmentCache = null;
let cacheLoadedAt = null;

// Debounced save
let pendingSave = null;
const SAVE_DEBOUNCE_MS = 5000; // 5 seconds

/**
 * Load enrichment data from file
 */
function loadEnrichmentFile() {
  try {
    if (fs.existsSync(ENRICHMENT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ENRICHMENT_FILE, 'utf8'));
      logger.debug(`[EnrichmentStore] Loaded ${Object.keys(data.enrichments || {}).length} enrichments from file`);
      return data;
    }
  } catch (error) {
    logger.error('[EnrichmentStore] Failed to load file:', error.message);
  }
  
  // Return empty structure
  return {
    enrichments: {},
    lastModified: null
  };
}

/**
 * Save enrichment data to file (atomic write)
 */
function saveEnrichmentFile() {
  if (!enrichmentCache) return false;
  
  try {
    enrichmentCache.lastModified = new Date().toISOString();
    
    // Ensure directory exists
    const dir = path.dirname(ENRICHMENT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write: write to temp file, then rename
    const tempFile = ENRICHMENT_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(enrichmentCache, null, 2));
    fs.renameSync(tempFile, ENRICHMENT_FILE);
    
    logger.debug(`[EnrichmentStore] Saved ${Object.keys(enrichmentCache.enrichments || {}).length} enrichments to file`);
    return true;
    
  } catch (error) {
    logger.error('[EnrichmentStore] Failed to save file:', error.message);
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
    saveEnrichmentFile();
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
  return saveEnrichmentFile();
}

/**
 * Get cache, loading from file if needed
 */
function getCache() {
  if (!enrichmentCache) {
    enrichmentCache = loadEnrichmentFile();
    cacheLoadedAt = Date.now();
  }
  return enrichmentCache;
}

/**
 * Initialize the enrichment file store
 */
async function init() {
  enrichmentCache = loadEnrichmentFile();
  cacheLoadedAt = Date.now();
  
  const enrichmentCount = Object.keys(enrichmentCache.enrichments || {}).length;
  logger.info(`[EnrichmentStore] Initialized with ${enrichmentCount} enrichments`);
  
  return { initialized: true, enrichmentCount };
}

/**
 * Save attendee enrichment data
 * @param {Object} data - { email, name, title, linkedinUrl, company, summary, source }
 */
async function saveAttendeeEnrichment(data) {
  const cache = getCache();
  
  const { email, name, title, linkedinUrl, company, summary, source = 'clay' } = data;
  
  if (!email) {
    throw new Error('email is required');
  }
  
  const emailLower = email.toLowerCase();
  const now = new Date().toISOString();
  const existing = cache.enrichments[emailLower];
  
  cache.enrichments[emailLower] = {
    email: emailLower,
    name: name || existing?.name,
    title: title || existing?.title,
    linkedin_url: linkedinUrl || existing?.linkedin_url,
    company: company || existing?.company,
    summary: summary || existing?.summary,
    source: source,
    enriched_at: existing?.enriched_at || now,
    updated_at: now
  };
  
  scheduleSave(); // Use debounced save for enrichments (high volume)
  
  logger.debug(`[EnrichmentStore] Saved enrichment for: ${emailLower}`);
  return { email: emailLower, saved: true };
}

/**
 * Get attendee enrichment by email
 * @param {string} email
 */
async function getAttendeeEnrichment(email) {
  if (!email) return null;
  
  const cache = getCache();
  const row = cache.enrichments[email.toLowerCase()];
  
  if (!row) {
    return null;
  }
  
  return {
    email: row.email,
    name: row.name,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    company: row.company,
    summary: row.summary,
    source: row.source,
    enrichedAt: row.enriched_at,
    updatedAt: row.updated_at
  };
}

/**
 * Get enrichment for multiple attendees
 * @param {Array<string>} emails
 */
async function getAttendeeEnrichments(emails) {
  if (!emails || emails.length === 0) {
    return {};
  }
  
  const cache = getCache();
  const result = {};
  
  for (const email of emails) {
    const emailLower = email.toLowerCase();
    const row = cache.enrichments[emailLower];
    
    if (row) {
      result[emailLower] = {
        email: row.email,
        name: row.name,
        title: row.title,
        linkedinUrl: row.linkedin_url,
        company: row.company,
        summary: row.summary,
        source: row.source
      };
    }
  }
  
  return result;
}

/**
 * Migrate enrichments from SQLite rows
 * @param {Array} sqliteRows - Rows from SQLite attendee_enrichment table
 * @returns {number} Number of enrichments migrated
 */
async function migrateFromSQLite(sqliteRows) {
  if (!sqliteRows || sqliteRows.length === 0) {
    return 0;
  }
  
  const cache = getCache();
  let migrated = 0;
  
  for (const row of sqliteRows) {
    const emailLower = row.email?.toLowerCase();
    
    if (!emailLower) continue;
    
    // Skip if already exists in file store
    if (cache.enrichments[emailLower]) {
      continue;
    }
    
    cache.enrichments[emailLower] = {
      email: emailLower,
      name: row.name,
      title: row.title,
      linkedin_url: row.linkedin_url,
      company: row.company,
      summary: row.summary,
      source: row.source || 'sqlite_migration',
      enriched_at: row.enriched_at,
      updated_at: row.updated_at
    };
    
    migrated++;
  }
  
  if (migrated > 0) {
    forceSave();
    logger.info(`[EnrichmentStore] Migrated ${migrated} enrichments from SQLite`);
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
    file: ENRICHMENT_FILE,
    enrichmentCount: Object.keys(cache.enrichments || {}).length,
    lastModified: cache.lastModified,
    cacheLoadedAt: cacheLoadedAt ? new Date(cacheLoadedAt).toISOString() : null
  };
}

/**
 * Get all enrichments (for debugging/admin)
 */
async function getAllEnrichments() {
  const cache = getCache();
  
  return Object.values(cache.enrichments).map(row => ({
    email: row.email,
    name: row.name,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    company: row.company,
    summary: row.summary,
    source: row.source,
    enrichedAt: row.enriched_at,
    updatedAt: row.updated_at
  }));
}

module.exports = {
  init,
  saveAttendeeEnrichment,
  getAttendeeEnrichment,
  getAttendeeEnrichments,
  migrateFromSQLite,
  getStoreStatus,
  getAllEnrichments,
  forceSave,
  ENRICHMENT_FILE
};
