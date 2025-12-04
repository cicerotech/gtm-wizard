/**
 * Hyprnote Sync Service
 * 
 * Monitors Hyprnote's local SQLite database for completed meetings
 * and syncs meeting notes to Salesforce.
 * 
 * Data Flow:
 * Hyprnote Meeting Ends
 *     ↓
 * Extract: Contact info, Company, Summary, Date
 *     ↓
 * Salesforce Actions:
 *     ├─→ Contact: Create if missing, link to Account
 *     ├─→ Event: Create event on meeting date, attach to Account
 *     ├─→ Meeting Note: Log on Event record
 *     └─→ Customer Brain Field: Update at Account level with insights
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');
const logger = require('../utils/logger');

// Hyprnote database paths (macOS)
const HYPRNOTE_STABLE_PATH = path.join(
  os.homedir(),
  'Library/Application Support/com.hyprnote.stable/db.sqlite'
);

const HYPRNOTE_NIGHTLY_PATH = path.join(
  os.homedir(),
  'Library/Application Support/com.hyprnote.nightly/db.sqlite'
);

// Use stable by default, fall back to nightly
const HYPRNOTE_DB_PATH = fs.existsSync(HYPRNOTE_STABLE_PATH) 
  ? HYPRNOTE_STABLE_PATH 
  : HYPRNOTE_NIGHTLY_PATH;

// Track synced sessions to avoid duplicates
const syncedSessions = new Set();
let lastCheckedTime = null;

/**
 * Initialize the sync service
 */
function initHyprnoteSync() {
  loadSyncedSessions();
  
  logger.info('[Hyprnote] Sync service initialized');
  logger.info(`[Hyprnote] Monitoring database: ${HYPRNOTE_DB_PATH}`);
  
  return {
    checkForNewMeetings,
    syncSessionToSalesforce,
    getRecentSessions,
    startPolling,
    stopPolling,
    testConnection
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
 * Test database connection
 */
async function testConnection() {
  return new Promise((resolve) => {
    if (!fs.existsSync(HYPRNOTE_DB_PATH)) {
      resolve({ 
        success: false, 
        error: `Database not found at ${HYPRNOTE_DB_PATH}`,
        path: HYPRNOTE_DB_PATH
      });
      return;
    }

    const db = new sqlite3.Database(HYPRNOTE_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({ success: false, error: err.message, path: HYPRNOTE_DB_PATH });
      } else {
        db.get('SELECT COUNT(*) as count FROM sessions', (err, row) => {
          db.close();
          if (err) {
            resolve({ success: false, error: err.message, path: HYPRNOTE_DB_PATH });
          } else {
            resolve({ 
              success: true, 
              sessionCount: row.count,
              path: HYPRNOTE_DB_PATH
            });
          }
        });
      }
    });
  });
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
    const sessions = await getRecentSessions(168); // Last 7 days
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
 * Extract key insights from meeting notes for Customer Brain
 */
function extractCustomerBrainInsights(memoHtml, title) {
  const plainText = htmlToPlainText(memoHtml);
  
  // Extract key sections
  const insights = [];
  
  // Look for key topics/outcomes
  const patterns = [
    { label: 'Key Interest', regex: /interest(?:ed)?\s+in[:\s]*([^.\n]+)/gi },
    { label: 'Pain Point', regex: /pain\s*point[s]?[:\s]*([^.\n]+)/gi },
    { label: 'Decision', regex: /decision[:\s]*([^.\n]+)/gi },
    { label: 'Budget', regex: /budget[:\s]*([^.\n]+)/gi },
    { label: 'Timeline', regex: /timeline[:\s]*([^.\n]+)/gi },
    { label: 'Next Step', regex: /next\s*step[s]?[:\s]*([^.\n]+)/gi },
    { label: 'Action Item', regex: /action\s*item[s]?[:\s]*([^.\n]+)/gi }
  ];
  
  patterns.forEach(({ label, regex }) => {
    let match;
    while ((match = regex.exec(plainText)) !== null) {
      insights.push(`${label}: ${match[1].trim()}`);
    }
  });
  
  // Create a condensed summary
  const summary = plainText.substring(0, 500);
  
  return {
    insights: insights.slice(0, 5), // Top 5 insights
    summary
  };
}

/**
 * Smart account matching - fuzzy match company name
 */
async function findMatchingAccount(conn, companyName) {
  if (!companyName) return null;
  
  // Clean company name
  const cleanName = companyName
    .replace(/\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?)\s*$/i, '')
    .trim();
  
  // Try exact match first
  let accounts = await conn.query(`
    SELECT Id, Name, Owner.Name, Customer_Brain__c
    FROM Account 
    WHERE Name = '${cleanName.replace(/'/g, "\\'")}'
    LIMIT 1
  `);
  
  if (accounts.records?.length > 0) {
    return accounts.records[0];
  }
  
  // Try LIKE match
  accounts = await conn.query(`
    SELECT Id, Name, Owner.Name, Customer_Brain__c
    FROM Account 
    WHERE Name LIKE '%${cleanName.replace(/'/g, "\\'").substring(0, 20)}%'
    LIMIT 5
  `);
  
  if (accounts.records?.length > 0) {
    // Return best match (shortest name that contains the search term)
    return accounts.records.sort((a, b) => a.Name.length - b.Name.length)[0];
  }
  
  return null;
}

/**
 * Sync a single session to Salesforce
 * 
 * Flow:
 * 1. Contact: Create if missing, link to Account
 * 2. Event: Create event on meeting date, attach to Account
 * 3. Meeting Note: Log on Event record
 * 4. Customer Brain: Update at Account level with insights
 */
async function syncSessionToSalesforce(session, sfConnection = null) {
  try {
    logger.info(`[Hyprnote] Syncing session: ${session.title}`);
    
    // Get Salesforce connection
    let conn = sfConnection;
    if (!conn) {
      const { getConnection } = require('../salesforce/connection');
      conn = getConnection();
    }
    
    const participants = await getSessionParticipants(session.id);
    const plainTextMemo = htmlToPlainText(session.enhanced_memo_html || session.raw_memo_html);
    const { insights, summary } = extractCustomerBrainInsights(
      session.enhanced_memo_html || session.raw_memo_html,
      session.title
    );
    
    // Meeting date (use record_start, fallback to created_at)
    const meetingDate = new Date(session.record_start || session.created_at);
    const meetingDateStr = meetingDate.toISOString().split('T')[0];
    const meetingDateDisplay = meetingDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Results tracking
    const results = {
      contacts: [],
      account: null,
      event: null,
      customerBrainUpdated: false
    };
    
    // Primary company for account matching
    const primaryCompany = participants.find(p => p.organization_name)?.organization_name;
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: ACCOUNT MATCHING
    // ═══════════════════════════════════════════════════════════════════════
    let account = null;
    if (primaryCompany) {
      account = await findMatchingAccount(conn, primaryCompany);
      if (account) {
        results.account = { id: account.Id, name: account.Name };
        logger.info(`[Hyprnote] Matched account: ${account.Name}`);
      } else {
        logger.info(`[Hyprnote] No account found for: ${primaryCompany}`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: CONTACT HANDLING
    // ═══════════════════════════════════════════════════════════════════════
    let primaryContactId = null;
    
    for (const participant of participants) {
      if (!participant.email) continue;
      
      try {
        // Search for existing contact
        const existingContacts = await conn.query(`
          SELECT Id, FirstName, LastName, Email, AccountId
          FROM Contact 
          WHERE Email = '${participant.email.replace(/'/g, "\\'")}'
          LIMIT 1
        `);
        
        let contactId;
        
        if (existingContacts.records?.length > 0) {
          // Contact exists
          contactId = existingContacts.records[0].Id;
          results.contacts.push({
            id: contactId,
            name: participant.full_name,
            email: participant.email,
            created: false
          });
          logger.info(`[Hyprnote] Found existing contact: ${participant.full_name}`);
        } else {
          // Create new contact
          const nameParts = (participant.full_name || 'Unknown').split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || nameParts[0] || 'Unknown';
          
          const newContact = await conn.sobject('Contact').create({
            FirstName: firstName,
            LastName: lastName,
            Email: participant.email,
            Title: participant.job_title || '',
            AccountId: account?.Id || null
          });
          
          if (newContact.success) {
            contactId = newContact.id;
            results.contacts.push({
              id: contactId,
              name: participant.full_name,
              email: participant.email,
              created: true
            });
            logger.info(`[Hyprnote] Created contact: ${participant.full_name}`);
          }
        }
        
        // Track primary contact (first external participant)
        if (!primaryContactId && contactId) {
          primaryContactId = contactId;
        }
        
      } catch (contactError) {
        logger.warn(`[Hyprnote] Error processing contact ${participant.email}:`, contactError.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: EVENT CREATION (with meeting notes)
    // ═══════════════════════════════════════════════════════════════════════
    const eventSubject = `Meeting: ${session.title}`;
    const eventDescription = `
MEETING SUMMARY
═══════════════════════════════════════

Title: ${session.title}
Date: ${meetingDateDisplay}
Duration: ${calculateDuration(session.record_start, session.record_end)}

PARTICIPANTS:
${participants.map(p => `• ${p.full_name} (${p.email}) - ${p.organization_name || 'N/A'}`).join('\n')}

NOTES:
${plainTextMemo}

${insights.length > 0 ? `\nKEY INSIGHTS:\n${insights.map(i => `• ${i}`).join('\n')}` : ''}

───────────────────────────────────────
Synced from Hyprnote via GTM Brain
    `.trim();
    
    try {
      // Calculate event times
      const startDateTime = new Date(session.record_start || session.created_at);
      const endDateTime = new Date(session.record_end || session.created_at);
      
      // If no end time, assume 30 min meeting
      if (!session.record_end) {
        endDateTime.setMinutes(endDateTime.getMinutes() + 30);
      }
      
      const eventData = {
        Subject: eventSubject.substring(0, 255),
        Description: eventDescription.substring(0, 32000),
        StartDateTime: startDateTime.toISOString(),
        EndDateTime: endDateTime.toISOString(),
        Type: 'Meeting',
        IsAllDayEvent: false
      };
      
      // Link to Contact (WhoId)
      if (primaryContactId) {
        eventData.WhoId = primaryContactId;
      }
      
      // Link to Account (WhatId) - Note: Can't set both WhoId and WhatId for Events in some orgs
      // If we have account but no contact, use WhatId
      if (account?.Id && !primaryContactId) {
        eventData.WhatId = account.Id;
      }
      
      const event = await conn.sobject('Event').create(eventData);
      
      if (event.success) {
        results.event = { id: event.id, subject: eventSubject };
        logger.info(`[Hyprnote] Created Event: ${event.id}`);
      }
    } catch (eventError) {
      logger.warn(`[Hyprnote] Error creating Event:`, eventError.message);
      
      // Fallback to Task if Event fails
      try {
        const taskData = {
          Subject: eventSubject.substring(0, 255),
          Description: eventDescription.substring(0, 32000),
          Status: 'Completed',
          Priority: 'Normal',
          ActivityDate: meetingDateStr,
          Type: 'Meeting'
        };
        
        if (primaryContactId) taskData.WhoId = primaryContactId;
        if (account?.Id) taskData.WhatId = account.Id;
        
        const task = await conn.sobject('Task').create(taskData);
        if (task.success) {
          results.event = { id: task.id, subject: eventSubject, type: 'Task (fallback)' };
          logger.info(`[Hyprnote] Created Task (fallback): ${task.id}`);
        }
      } catch (taskError) {
        logger.error(`[Hyprnote] Error creating Task fallback:`, taskError.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: CUSTOMER BRAIN UPDATE (Account level)
    // ═══════════════════════════════════════════════════════════════════════
    if (account?.Id) {
      try {
        const existingBrain = account.Customer_Brain__c || '';
        
        // Create new brain entry
        const brainEntry = `
───────────────────────────────────────
${meetingDateDisplay} - ${session.title}
───────────────────────────────────────
${summary}
${insights.length > 0 ? `\nKey Insights: ${insights.join(' | ')}` : ''}
`.trim();
        
        // Prepend new entry (most recent first)
        const updatedBrain = brainEntry + '\n\n' + existingBrain;
        
        // Update Account
        await conn.sobject('Account').update({
          Id: account.Id,
          Customer_Brain__c: updatedBrain.substring(0, 131072) // SF long text limit
        });
        
        results.customerBrainUpdated = true;
        logger.info(`[Hyprnote] Updated Customer_Brain__c for ${account.Name}`);
        
      } catch (brainError) {
        logger.warn(`[Hyprnote] Error updating Customer Brain:`, brainError.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // MARK AS SYNCED
    // ═══════════════════════════════════════════════════════════════════════
    syncedSessions.add(session.id);
    saveSyncedSessions();
    
    return {
      success: true,
      sessionId: session.id,
      sessionTitle: session.title,
      meetingDate: meetingDateDisplay,
      ...results
    };
    
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
async function syncAllNewMeetings(sfConnection = null) {
  const newSessions = await checkForNewMeetings();
  const results = [];
  
  for (const session of newSessions) {
    const result = await syncSessionToSalesforce(session, sfConnection);
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
function startPolling(intervalMinutes = 5, sfConnection = null) {
  if (pollingInterval) {
    logger.warn('[Hyprnote] Polling already running');
    return;
  }
  
  logger.info(`[Hyprnote] Starting polling every ${intervalMinutes} minutes`);
  
  // Initial check
  syncAllNewMeetings(sfConnection);
  
  // Set up interval
  pollingInterval = setInterval(() => {
    syncAllNewMeetings(sfConnection);
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
  testConnection,
  HYPRNOTE_DB_PATH
};
