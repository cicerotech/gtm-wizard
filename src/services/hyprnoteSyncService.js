/**
 * Hyprnote Sync Service
 * 
 * Monitors Hyprnote's local SQLite database for completed meetings
 * and syncs meeting notes to Salesforce.
 * 
 * Architecture:
 * Hyprnote (local) → SQLite → This Service → Salesforce
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');
const { getConnection } = require('../salesforce/connection');
const logger = require('../utils/logger');

// Hyprnote database path (macOS)
const HYPRNOTE_DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/com.hyprnote.stable/db.sqlite'
);

// Track synced sessions to avoid duplicates
const syncedSessions = new Set();
let lastCheckedTime = null;

/**
 * Initialize the sync service
 */
function initHyprnoteSync() {
  // Load previously synced sessions from cache/file
  loadSyncedSessions();
  
  logger.info('[Hyprnote] Sync service initialized');
  logger.info(`[Hyprnote] Monitoring database: ${HYPRNOTE_DB_PATH}`);
  
  return {
    checkForNewMeetings,
    syncSessionToSalesforce,
    getRecentSessions,
    startPolling,
    stopPolling
  };
}

/**
 * Load previously synced session IDs
 */
function loadSyncedSessions() {
  try {
    const cacheFile = path.join(__dirname, '../../data/hyprnote-synced.json');
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      data.sessions.forEach(id => syncedSessions.add(id));
      lastCheckedTime = data.lastChecked;
      logger.info(`[Hyprnote] Loaded ${syncedSessions.size} previously synced sessions`);
    }
  } catch (error) {
    logger.warn('[Hyprnote] Could not load sync cache:', error.message);
  }
}

/**
 * Save synced session IDs
 */
function saveSyncedSessions() {
  try {
    const cacheFile = path.join(__dirname, '../../data/hyprnote-synced.json');
    const data = {
      sessions: Array.from(syncedSessions),
      lastChecked: new Date().toISOString()
    };
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.warn('[Hyprnote] Could not save sync cache:', error.message);
  }
}

/**
 * Get recent sessions from Hyprnote database
 */
async function getRecentSessions(hoursBack = 24) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(HYPRNOTE_DB_PATH)) {
      reject(new Error(`Hyprnote database not found at ${HYPRNOTE_DB_PATH}`));
      return;
    }

    const db = new sqlite3.Database(HYPRNOTE_DB_PATH, sqlite3.OPEN_READONLY);
    
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    const query = `
      SELECT 
        s.id,
        s.title,
        s.created_at,
        s.record_start,
        s.record_end,
        s.enhanced_memo_html,
        s.raw_memo_html
      FROM sessions s
      WHERE s.record_end IS NOT NULL
        AND s.created_at >= ?
      ORDER BY s.created_at DESC
    `;
    
    db.all(query, [cutoffTime], (err, rows) => {
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
 * Get participants for a session
 */
async function getSessionParticipants(sessionId) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(HYPRNOTE_DB_PATH, sqlite3.OPEN_READONLY);
    
    const query = `
      SELECT 
        h.id,
        h.full_name,
        h.email,
        h.job_title,
        o.name as organization_name,
        o.website_url as organization_website
      FROM session_participants sp
      JOIN humans h ON sp.human_id = h.id
      LEFT JOIN organizations o ON h.organization_id = o.id
      WHERE sp.session_id = ?
        AND sp.deleted = 0
        AND h.is_user = 0
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
 * Check for new meetings that haven't been synced
 */
async function checkForNewMeetings() {
  try {
    const sessions = await getRecentSessions(24);
    const newSessions = sessions.filter(s => !syncedSessions.has(s.id));
    
    logger.info(`[Hyprnote] Found ${sessions.length} recent sessions, ${newSessions.length} new`);
    
    return newSessions;
  } catch (error) {
    logger.error('[Hyprnote] Error checking for new meetings:', error.message);
    return [];
  }
}

/**
 * Parse HTML meeting summary to plain text
 */
function htmlToPlainText(html) {
  if (!html) return '';
  
  return html
    .replace(/<h1[^>]*>/gi, '\n## ')
    .replace(/<h2[^>]*>/gi, '\n### ')
    .replace(/<h3[^>]*>/gi, '\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract action items from meeting notes
 */
function extractActionItems(memoHtml) {
  const actionItems = [];
  
  // Look for common action item patterns
  const patterns = [
    /action items?:?\s*(?:<[^>]+>)*([^<]+)/gi,
    /next steps?:?\s*(?:<[^>]+>)*([^<]+)/gi,
    /follow[- ]?ups?:?\s*(?:<[^>]+>)*([^<]+)/gi,
    /<li[^>]*>([^<]*(?:action|follow|schedule|send|contact|call|email)[^<]*)<\/li>/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(memoHtml)) !== null) {
      const item = match[1].trim();
      if (item && item.length > 5) {
        actionItems.push(item);
      }
    }
  });
  
  return [...new Set(actionItems)]; // Remove duplicates
}

/**
 * Sync a single session to Salesforce
 */
async function syncSessionToSalesforce(session) {
  try {
    logger.info(`[Hyprnote] Syncing session: ${session.title}`);
    
    const participants = await getSessionParticipants(session.id);
    const plainTextMemo = htmlToPlainText(session.enhanced_memo_html || session.raw_memo_html);
    const actionItems = extractActionItems(session.enhanced_memo_html || session.raw_memo_html);
    
    const conn = getConnection();
    
    // Find or create contacts for each participant
    const contactIds = [];
    const accountIds = [];
    
    for (const participant of participants) {
      if (!participant.email) continue;
      
      try {
        // Search for existing contact
        let contact = await conn.sobject('Contact').findOne({
          Email: participant.email
        });
        
        if (!contact) {
          // Search for account by company name
          let accountId = null;
          if (participant.organization_name) {
            const accounts = await conn.sobject('Account').find({
              Name: { $like: `%${participant.organization_name}%` }
            }).limit(1);
            
            if (accounts.length > 0) {
              accountId = accounts[0].Id;
              accountIds.push(accountId);
            }
          }
          
          // Create new contact
          const newContact = await conn.sobject('Contact').create({
            FirstName: participant.full_name?.split(' ')[0] || '',
            LastName: participant.full_name?.split(' ').slice(1).join(' ') || participant.full_name || 'Unknown',
            Email: participant.email,
            Title: participant.job_title || '',
            AccountId: accountId
          });
          
          if (newContact.success) {
            contactIds.push(newContact.id);
            logger.info(`[Hyprnote] Created contact: ${participant.full_name}`);
          }
        } else {
          contactIds.push(contact.Id);
          if (contact.AccountId) accountIds.push(contact.AccountId);
        }
      } catch (contactError) {
        logger.warn(`[Hyprnote] Could not process contact ${participant.email}:`, contactError.message);
      }
    }
    
    // Create Task with meeting notes
    const taskSubject = `Meeting Notes: ${session.title}`;
    const taskDescription = `
Meeting: ${session.title}
Date: ${new Date(session.record_start).toLocaleString()}
Duration: ${calculateDuration(session.record_start, session.record_end)}

PARTICIPANTS:
${participants.map(p => `• ${p.full_name} (${p.email}) - ${p.organization_name || 'N/A'}`).join('\n')}

SUMMARY:
${plainTextMemo}

${actionItems.length > 0 ? `\nACTION ITEMS:\n${actionItems.map(a => `• ${a}`).join('\n')}` : ''}

---
Synced from Hyprnote via GTM Brain
    `.trim();
    
    // Create the task
    const taskData = {
      Subject: taskSubject.substring(0, 255),
      Description: taskDescription.substring(0, 32000),
      Status: 'Completed',
      Priority: 'Normal',
      ActivityDate: new Date(session.record_start).toISOString().split('T')[0],
      Type: 'Meeting'
    };
    
    // Link to first contact if available
    if (contactIds.length > 0) {
      taskData.WhoId = contactIds[0];
    }
    
    // Link to first account if available
    if (accountIds.length > 0) {
      taskData.WhatId = accountIds[0];
    }
    
    const task = await conn.sobject('Task').create(taskData);
    
    if (task.success) {
      logger.info(`[Hyprnote] Created Salesforce Task: ${task.id}`);
      
      // Mark session as synced
      syncedSessions.add(session.id);
      saveSyncedSessions();
      
      return {
        success: true,
        taskId: task.id,
        contactsProcessed: contactIds.length,
        sessionId: session.id
      };
    } else {
      throw new Error('Failed to create Task');
    }
    
  } catch (error) {
    logger.error(`[Hyprnote] Error syncing session ${session.id}:`, error.message);
    return {
      success: false,
      error: error.message,
      sessionId: session.id
    };
  }
}

/**
 * Calculate meeting duration
 */
function calculateDuration(start, end) {
  if (!start || !end) return 'Unknown';
  
  const startTime = new Date(start);
  const endTime = new Date(end);
  const diffMs = endTime - startTime;
  const diffMins = Math.round(diffMs / 60000);
  
  if (diffMins < 60) {
    return `${diffMins} minutes`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }
}

/**
 * Sync all new meetings
 */
async function syncAllNewMeetings() {
  const newSessions = await checkForNewMeetings();
  const results = [];
  
  for (const session of newSessions) {
    const result = await syncSessionToSalesforce(session);
    results.push(result);
    
    // Small delay between syncs
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const successful = results.filter(r => r.success).length;
  logger.info(`[Hyprnote] Sync complete: ${successful}/${results.length} sessions synced`);
  
  return results;
}

// Polling interval (in ms)
let pollingInterval = null;

/**
 * Start polling for new meetings
 */
function startPolling(intervalMinutes = 5) {
  if (pollingInterval) {
    logger.warn('[Hyprnote] Polling already running');
    return;
  }
  
  logger.info(`[Hyprnote] Starting polling every ${intervalMinutes} minutes`);
  
  // Initial check
  syncAllNewMeetings();
  
  // Set up interval
  pollingInterval = setInterval(() => {
    syncAllNewMeetings();
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('[Hyprnote] Polling stopped');
  }
}

module.exports = {
  initHyprnoteSync,
  checkForNewMeetings,
  syncSessionToSalesforce,
  syncAllNewMeetings,
  getRecentSessions,
  getSessionParticipants,
  startPolling,
  stopPolling,
  HYPRNOTE_DB_PATH
};

