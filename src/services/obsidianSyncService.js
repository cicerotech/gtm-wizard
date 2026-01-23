/**
 * Obsidian Sync Service
 * Integrates Obsidian vault notes into GTM Brain
 * 
 * Features:
 * - Smart matching to Salesforce accounts
 * - Claude-powered summarization
 * - Privacy controls (skip internal meetings)
 * - Integration with Meeting Prep context
 */

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { query } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');
const { calendarService, BL_EMAILS } = require('./calendarService');
const contactSync = require('./salesforceContactSync');

// Import Obsidian sync libraries (from obsidian-sync module)
let vaultReader, smartMatcher, summarizer;

try {
  vaultReader = require('../../obsidian-sync/lib/vault-reader');
  smartMatcher = require('../../obsidian-sync/lib/smart-matcher');
  summarizer = require('../../obsidian-sync/lib/summarizer');
} catch (e) {
  logger.warn('Obsidian sync libraries not fully loaded:', e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
  // Vault discovery
  VAULT_SEARCH_PATHS: [
    // Will search for vaults at these base paths
    process.env.OBSIDIAN_VAULT_PATH,
    path.join(require('os').homedir(), 'Documents'),
    path.join(require('os').homedir(), 'Obsidian'),
    path.join(require('os').homedir(), 'Library/Mobile Documents/iCloud~md~obsidian/Documents')
  ].filter(Boolean),
  
  // Sync settings
  MEETINGS_FOLDER: 'Meetings',
  SYNC_DAYS: 7,                // Only process notes from last 7 days
  MAX_NOTES_PER_SYNC: 50,      // Limit per sync run
  
  // Summarization
  ENABLE_SUMMARIZATION: true,
  SUMMARIZE_LONG_NOTES_ONLY: true,
  
  // Salesforce sync (contact creation + event logging)
  SYNC_TO_SALESFORCE: true,              // Enable auto-sync to SF
  CREATE_MISSING_CONTACTS: true,         // Create contacts if they don't exist
  CREATE_SF_EVENTS: true,                // Create Events with meeting notes
  MIN_LENGTH_FOR_SUMMARY: 1000  // Only summarize notes > 1000 chars
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build matching context for a BL
 * Fetches calendar events and owned accounts
 */
async function buildMatchingContext(blEmail) {
  try {
    // Get calendar events for BL (last 7 days + next 7 days)
    await calendarService.initialize();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    
    const calendarEvents = await calendarService.getCalendarEvents(blEmail, startDate, endDate);
    
    // Get accounts owned by this BL
    const ownedAccounts = await getOwnedAccounts(blEmail);
    
    // Build domain to account map
    const domainToAccount = await buildDomainMap();
    
    return {
      blEmail,
      calendarEvents,
      ownedAccounts,
      domainToAccount
    };
  } catch (error) {
    logger.error(`Error building matching context for ${blEmail}:`, error);
    return {
      blEmail,
      calendarEvents: [],
      ownedAccounts: [],
      domainToAccount: new Map()
    };
  }
}

/**
 * Get accounts owned by a BL
 */
async function getOwnedAccounts(blEmail) {
  try {
    // First get the User ID for this email
    const userQuery = `SELECT Id, Name FROM User WHERE Email = '${blEmail}' LIMIT 1`;
    const userResult = await query(userQuery, true);
    const user = userResult?.records?.[0];
    
    if (!user) {
      logger.warn(`User not found for email: ${blEmail}`);
      return [];
    }
    
    // Get accounts owned by this user
    const accountsQuery = `
      SELECT Id, Name, Website, Customer_Type__c
      FROM Account
      WHERE OwnerId = '${user.Id}'
      ORDER BY LastModifiedDate DESC
      LIMIT 200
    `;
    
    const result = await query(accountsQuery, true);
    return (result?.records || []).map(a => ({
      id: a.Id,
      name: a.Name,
      website: a.Website,
      type: a.Customer_Type__c
    }));
  } catch (error) {
    logger.error('Error fetching owned accounts:', error);
    return [];
  }
}

/**
 * Build a map of email domains to account IDs
 */
async function buildDomainMap() {
  try {
    const domainMap = new Map();
    
    // Get accounts with websites
    const accountsQuery = `
      SELECT Id, Name, Website
      FROM Account
      WHERE Website != null
      LIMIT 500
    `;
    
    const result = await query(accountsQuery, true);
    
    for (const account of (result?.records || [])) {
      if (account.Website) {
        // Extract domain from website
        try {
          const url = new URL(account.Website.startsWith('http') 
            ? account.Website 
            : 'https://' + account.Website);
          const domain = url.hostname.replace('www.', '').toLowerCase();
          domainMap.set(domain, account.Id);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }
    
    return domainMap;
  } catch (error) {
    logger.error('Error building domain map:', error);
    return new Map();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync notes from a BL's Obsidian vault
 * 
 * @param {string} vaultPath - Path to the Obsidian vault
 * @param {string} blEmail - BL's email address
 * @param {Object} options - Sync options
 * @returns {Object} Sync results
 */
async function syncVault(vaultPath, blEmail, options = {}) {
  const results = {
    processed: 0,
    synced: 0,
    skipped: 0,
    errors: 0,
    details: []
  };
  
  if (!vaultReader || !smartMatcher) {
    logger.error('Obsidian sync libraries not loaded');
    return { ...results, error: 'Libraries not loaded' };
  }
  
  try {
    logger.info(`📚 Starting Obsidian sync for ${blEmail}`);
    logger.info(`   Vault: ${vaultPath}`);
    
    // Verify vault exists
    if (!fs.existsSync(vaultPath)) {
      logger.error(`Vault not found: ${vaultPath}`);
      return { ...results, error: 'Vault not found' };
    }
    
    // Build matching context
    const context = await buildMatchingContext(blEmail);
    logger.info(`   Context: ${context.ownedAccounts.length} owned accounts, ${context.calendarEvents.length} calendar events`);
    
    // Scan for meeting notes
    const files = vaultReader.scanVault(vaultPath, {
      folder: options.folder || CONFIG.MEETINGS_FOLDER,
      maxAge: options.maxAge || CONFIG.SYNC_DAYS,
      recursive: true
    });
    
    logger.info(`   Found ${files.length} notes in last ${CONFIG.SYNC_DAYS} days`);
    
    // Process each note (up to limit)
    const toProcess = files.slice(0, CONFIG.MAX_NOTES_PER_SYNC);
    
    for (const file of toProcess) {
      results.processed++;
      
      try {
        const result = await processNote(file, context, options);
        
        if (result.synced) {
          results.synced++;
        } else {
          results.skipped++;
        }
        
        results.details.push({
          file: file.name,
          ...result
        });
        
      } catch (error) {
        results.errors++;
        results.details.push({
          file: file.name,
          error: error.message
        });
      }
    }
    
    logger.info(`📚 Obsidian sync complete: ${results.synced} synced, ${results.skipped} skipped, ${results.errors} errors`);
    
    return results;
    
  } catch (error) {
    logger.error('Obsidian sync failed:', error);
    return { ...results, error: error.message };
  }
}

/**
 * Process a single note
 */
async function processNote(file, context, options = {}) {
  // Parse the note
  const note = vaultReader.parseNote(file.path);
  if (!note) {
    return { synced: false, reason: 'parse_failed' };
  }
  
  // Extract meeting info
  const meetingInfo = vaultReader.extractMeetingInfo(note);
  
  // Check privacy filter
  const skipCheck = smartMatcher.shouldSkipNote(meetingInfo, file.path);
  if (skipCheck.skip) {
    return { synced: false, reason: skipCheck.reason };
  }
  
  // Check if already synced
  if (meetingInfo.syncedToSf && !options.force) {
    return { synced: false, reason: 'already_synced' };
  }
  
  // Smart match to account
  const match = smartMatcher.matchToAccount(meetingInfo, context);
  
  if (!match.accountId) {
    return { 
      synced: false, 
      reason: 'no_account_match',
      confidence: match.confidence
    };
  }
  
  // Generate summary if enabled and note is long enough
  let summary = null;
  if (CONFIG.ENABLE_SUMMARIZATION && summarizer) {
    const noteLength = meetingInfo.rawBody?.length || 0;
    
    if (!CONFIG.SUMMARIZE_LONG_NOTES_ONLY || noteLength >= CONFIG.MIN_LENGTH_FOR_SUMMARY) {
      const summaryResult = await summarizer.summarizeMeeting(meetingInfo.rawBody, {
        accountName: match.accountName,
        attendees: meetingInfo.attendees,
        title: meetingInfo.title
      });
      
      if (summaryResult.success) {
        summary = summaryResult.summary;
      }
    }
  }
  
  // Store in intelligence store for Meeting Prep integration
  await storeObsidianNote({
    accountId: match.accountId,
    accountName: match.accountName,
    blEmail: context.blEmail,
    noteTitle: meetingInfo.title,
    noteDate: meetingInfo.date,
    notePath: file.relativePath,
    summary: summary?.compactSummary || vaultReader.generateSummary(meetingInfo),
    fullSummary: summary?.fullText || null,
    sentiment: summary?.sentiment || null,
    matchMethod: match.matchMethod,
    matchConfidence: match.confidence
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // SALESFORCE SYNC: Create contacts + Event with meeting notes
  // ═══════════════════════════════════════════════════════════════════════
  let salesforceResult = null;
  
  if (CONFIG.SYNC_TO_SALESFORCE && options.syncToSalesforce !== false) {
    try {
      // Format attendees for Salesforce sync
      const attendees = (meetingInfo.attendees || []).map(a => {
        if (typeof a === 'string') {
          // Parse "Name (email)" or just "Name"
          const emailMatch = a.match(/\(([^)]+@[^)]+)\)/);
          return {
            name: a.replace(/\s*\([^)]+\)\s*$/, '').trim(),
            email: emailMatch ? emailMatch[1] : null
          };
        }
        return { name: a.name, email: a.email, title: a.title };
      }).filter(a => a.email); // Only sync attendees with emails
      
      if (attendees.length > 0 || CONFIG.CREATE_SF_EVENTS) {
        logger.info(`[ObsidianSync] 📤 Syncing to Salesforce: ${meetingInfo.title}`);
        
        salesforceResult = await contactSync.syncMeetingToSalesforce({
          accountId: match.accountId,
          accountName: match.accountName,
          attendees,
          subject: meetingInfo.title,
          dateTime: meetingInfo.date ? `${meetingInfo.date}T10:00:00Z` : new Date().toISOString(),
          notes: summary?.fullText || meetingInfo.rawBody?.substring(0, 5000) || '',
          durationMinutes: 60
        });
        
        if (salesforceResult.contactsCreated?.length > 0) {
          logger.info(`[ObsidianSync] ✅ Created ${salesforceResult.contactsCreated.length} contacts in Salesforce`);
        }
        if (salesforceResult.event) {
          logger.info(`[ObsidianSync] ✅ Created Salesforce Event: ${salesforceResult.event.id}`);
        }
      }
    } catch (sfError) {
      logger.warn(`[ObsidianSync] Salesforce sync failed (non-blocking):`, sfError.message);
      salesforceResult = { success: false, error: sfError.message };
    }
  }
  
  // Optionally mark as synced in Obsidian
  if (options.markAsSynced !== false) {
    vaultReader.markAsSynced(file.path);
  }
  
  return {
    synced: true,
    accountId: match.accountId,
    accountName: match.accountName,
    matchMethod: match.matchMethod,
    confidence: match.confidence,
    hasSummary: !!summary,
    salesforce: salesforceResult
  };
}

/**
 * Store Obsidian note in intelligence store
 */
async function storeObsidianNote(noteData) {
  try {
    // Store in a dedicated table for Obsidian notes
    await intelligenceStore.storeObsidianNote(noteData);
    
    logger.debug(`Stored Obsidian note: ${noteData.noteTitle} → ${noteData.accountName}`);
    return true;
  } catch (error) {
    logger.error('Error storing Obsidian note:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MEETING CONTEXT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Obsidian notes for an account (for Meeting Prep context)
 */
async function getObsidianNotesForAccount(accountId) {
  try {
    const notes = await intelligenceStore.getObsidianNotesByAccount(accountId);
    
    return notes.map(note => ({
      date: note.note_date,
      title: note.note_title,
      summary: note.summary,
      sentiment: note.sentiment,
      blEmail: note.bl_email,
      source: 'obsidian'
    }));
  } catch (error) {
    logger.error('Error fetching Obsidian notes for account:', error);
    return [];
  }
}

/**
 * Get all Obsidian notes for a BL
 */
async function getObsidianNotesForBL(blEmail) {
  try {
    const notes = await intelligenceStore.getObsidianNotesByBL(blEmail);
    return notes;
  } catch (error) {
    logger.error('Error fetching Obsidian notes for BL:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find Obsidian vaults on the system
 */
function discoverVaults() {
  const vaults = [];
  const homeDir = require('os').homedir();
  
  const searchLocations = [
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Obsidian'),
    path.join(homeDir, 'Library/Mobile Documents/iCloud~md~obsidian/Documents'),
    path.join(homeDir, 'Dropbox')
  ];
  
  for (const basePath of searchLocations) {
    if (!fs.existsSync(basePath)) continue;
    
    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const obsidianDir = path.join(basePath, entry.name, '.obsidian');
          if (fs.existsSync(obsidianDir)) {
            vaults.push({
              name: entry.name,
              path: path.join(basePath, entry.name)
            });
          }
        }
      }
    } catch (e) {
      // Permission denied or other error, skip
    }
  }
  
  return vaults;
}

/**
 * Get sync status for a BL
 */
async function getSyncStatus(blEmail) {
  try {
    const notes = await getObsidianNotesForBL(blEmail);
    const rateLimitStatus = summarizer?.getRateLimitStatus() || { remaining: 0, limit: 0 };
    
    return {
      blEmail,
      totalNotesSynced: notes.length,
      lastSyncDate: notes[0]?.synced_at || null,
      summarization: {
        enabled: CONFIG.ENABLE_SUMMARIZATION,
        ...rateLimitStatus
      }
    };
  } catch (error) {
    return {
      blEmail,
      error: error.message
    };
  }
}

module.exports = {
  syncVault,
  getObsidianNotesForAccount,
  getObsidianNotesForBL,
  discoverVaults,
  getSyncStatus,
  buildMatchingContext,
  CONFIG
};

