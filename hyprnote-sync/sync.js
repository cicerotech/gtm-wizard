#!/usr/bin/env node

/**
 * Hyprnote to Salesforce Sync
 * 
 * Syncs completed Hyprnote meetings to Salesforce:
 * - Creates Events linked to Account/Contact
 * - Updates Customer_Brain__c with meeting insights
 * - Tracks synced sessions to prevent duplicates
 * 
 * Run with: npm run sync
 * Status:   npm run status
 */

const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');
const salesforce = require('./lib/salesforce');
const matcher = require('./lib/matcher');
const obsidian = require('./lib/obsidian');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const SYNCED_FILE = path.join(__dirname, 'data', 'synced-sessions.json');

// Load parent .env if needed
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log('ERROR: Not configured. Run: npm run setup');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function loadSyncedSessions() {
  if (!fs.existsSync(SYNCED_FILE)) {
    return { sessions: [] };
  }
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf-8'));
}

function saveSyncedSessions(data) {
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(data, null, 2));
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function showStatus() {
  console.log('\n========================================');
  console.log('       HYPRNOTE SYNC STATUS');
  console.log('========================================\n');
  
  const config = loadConfig();
  const synced = loadSyncedSessions();
  
  console.log('Rep: ' + config.rep.name + ' <' + config.rep.email + '>');
  console.log('SF User ID: ' + config.rep.salesforceUserId);
  console.log('Synced Sessions: ' + synced.sessions.length);
  
  // Check Hyprnote
  const hStatus = await hyprnote.testConnection();
  console.log('\nHyprnote: ' + (hStatus.success ? 'Connected' : 'Not found'));
  if (hStatus.success) {
    console.log('  Total sessions: ' + hStatus.sessionCount);
  }
  
  // Get recent sessions
  const syncedIds = new Set(synced.sessions.map(s => s.id));
  const sessions = await hyprnote.getSessions(config.settings.lookbackHours, new Set());
  const unsynced = sessions.filter(s => !syncedIds.has(s.id));
  
  console.log('\nRecent Meetings (last 7 days):');
  console.log('  Total: ' + sessions.length);
  console.log('  Synced: ' + (sessions.length - unsynced.length));
  console.log('  Pending: ' + unsynced.length);
  
  if (unsynced.length > 0) {
    console.log('\nPending sync:');
    for (const session of unsynced.slice(0, 5)) {
      console.log('  - ' + (session.title || 'Untitled') + ' (' + formatDate(session.created_at) + ')');
    }
    if (unsynced.length > 5) {
      console.log('  ... and ' + (unsynced.length - 5) + ' more');
    }
  }
  
  console.log('\nRun "npm run sync" to sync pending meetings.\n');
}

// Internal domains - meetings with only these participants are skipped
const INTERNAL_DOMAINS = ['eudia.com', 'cicerotech.com', 'johnstonhana.com'];

// ============================================================================
// Name Correction - Fix LLM transcription confusions for similar-sounding names
// ============================================================================
// The LLM often confuses phonetically similar names (e.g., "Julie" vs "Justin")
// This corrects speaker attributions based on who recorded the meeting
const NAME_CORRECTIONS = {
  // If rep is Justin, correct "Julie" mentions to "Justin" in speaker attributions
  'justin.hills@eudia.com': [
    { wrong: /\bJulie\b(?=\s+(?:said|mentioned|asked|noted|explained|agreed|confirmed|stated|added|replied|responded))/gi, correct: 'Justin' },
    { wrong: /\bJulie:\s/gi, correct: 'Justin: ' },
    { wrong: /\bJulie\s+\(Eudia\)/gi, correct: 'Justin (Eudia)' }
  ],
  // If rep is Julie, correct "Justin" mentions to "Julie" in speaker attributions
  'julie.stefanich@eudia.com': [
    { wrong: /\bJustin\b(?=\s+(?:said|mentioned|asked|noted|explained|agreed|confirmed|stated|added|replied|responded))/gi, correct: 'Julie' },
    { wrong: /\bJustin:\s/gi, correct: 'Julie: ' },
    { wrong: /\bJustin\s+\(Eudia\)/gi, correct: 'Julie (Eudia)' }
  ]
};

/**
 * Correct known name confusions in transcription based on the recording rep
 * @param {string} text - The transcribed text
 * @param {string} repEmail - Email of the rep who recorded
 * @returns {string} - Corrected text
 */
function correctNameConfusions(text, repEmail) {
  if (!text || !repEmail) return text;
  
  const corrections = NAME_CORRECTIONS[repEmail.toLowerCase()];
  if (!corrections) return text;
  
  let corrected = text;
  let correctionsMade = 0;
  
  for (const { wrong, correct } of corrections) {
    const before = corrected;
    corrected = corrected.replace(wrong, correct);
    if (corrected !== before) {
      correctionsMade++;
    }
  }
  
  if (correctionsMade > 0) {
    console.log('    Name corrections applied: ' + correctionsMade);
  }
  
  return corrected;
}

function isInternalMeeting(participants) {
  if (!participants || participants.length === 0) return true;
  
  const externalParticipants = participants.filter(p => {
    if (!p.email) return false;
    const domain = p.email.split('@')[1]?.toLowerCase();
    return domain && !INTERNAL_DOMAINS.some(d => domain.includes(d));
  });
  
  return externalParticipants.length === 0;
}

async function syncSession(session, config, sfConnection) {
  const title = session.title || 'Meeting';
  
  console.log('\n  Processing: ' + title);
  console.log('    Date: ' + formatDate(session.record_start));
  
  // Get participants
  const participants = await hyprnote.getSessionParticipants(session.id);
  console.log('    Participants: ' + participants.length);
  
  // Skip internal meetings (only Eudia/internal participants)
  if (isInternalMeeting(participants)) {
    console.log('    Type: INTERNAL (skipping - no external participants)');
    return { success: false, reason: 'internal_meeting' };
  }
  
  // Get calendar event if available
  const calendarEvent = await hyprnote.getCalendarEvent(session.calendar_event_id);
  
  // Match to Salesforce Account (with ownership prioritization)
  const match = await matcher.matchAccount(session, participants, calendarEvent, config.rep.salesforceUserId);
  
  if (!match.account) {
    console.log('    Account: NOT FOUND (skipping)');
    return { success: false, reason: 'no_account_match' };
  }
  
  console.log('    Account: ' + match.account.Name + ' (' + match.matchMethod + ', ' + match.confidence + '% confidence)');
  
  // Get or create Contact
  let contactId = match.contact?.Id;
  
  if (!contactId && config.settings.createContacts) {
    const primaryParticipant = matcher.getPrimaryContact(participants);
    if (primaryParticipant && primaryParticipant.email) {
      console.log('    Creating contact: ' + primaryParticipant.full_name);
      
      const nameParts = (primaryParticipant.full_name || '').split(' ');
      const contactResult = await salesforce.createContact({
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || 'Unknown',
        email: primaryParticipant.email,
        title: primaryParticipant.job_title,
        accountId: match.account.Id
      });
      
      if (contactResult.success) {
        contactId = contactResult.id;
        console.log('    Contact created: ' + contactResult.id);
      }
    }
  }
  
  // Prepare meeting notes with name correction
  let notesText = hyprnote.htmlToText(session.enhanced_memo_html || session.raw_memo_html);
  
  // Apply name corrections for known transcription confusions
  notesText = correctNameConfusions(notesText, config.rep.email);
  
  const duration = hyprnote.getDuration(session.record_start, session.record_end);
  
  const description = [
    '=== MEETING NOTES ===',
    'Date: ' + formatDate(session.record_start),
    'Duration: ' + duration,
    'Participants: ' + participants.map(p => p.full_name).join(', '),
    '',
    notesText
  ].join('\n');
  
  // Create Event in Salesforce
  try {
    const eventResult = await salesforce.createEvent({
      subject: title,
      description: description.substring(0, 32000),
      startTime: session.record_start,
      endTime: session.record_end,
      contactId: contactId,
      accountId: match.account.Id,
      ownerId: config.rep.salesforceUserId
    });
    
    if (eventResult.success) {
      console.log('    Event created: ' + eventResult.id);
    } else {
      console.log('    Event failed: ' + eventResult.errors?.join(', '));
      return { success: false, reason: 'event_creation_failed' };
    }
  } catch (err) {
    console.log('    Event error: ' + err.message);
    
    // Try Task as fallback
    try {
      const taskResult = await salesforce.createTask({
        subject: 'Meeting: ' + title,
        description: description,
        activityDate: session.record_start?.split('T')[0],
        contactId: contactId,
        accountId: match.account.Id,
        ownerId: config.rep.salesforceUserId
      });
      
      if (taskResult.success) {
        console.log('    Task created (fallback): ' + taskResult.id);
      }
    } catch (taskErr) {
      console.log('    Task fallback also failed');
      return { success: false, reason: 'activity_creation_failed' };
    }
  }
  
  // Update Customer_Brain__c
  if (config.settings.updateCustomerBrain && match.account.Id) {
    try {
      const brainEntry = [
        '--- Meeting: ' + formatDate(session.record_start) + ' ---',
        'Rep: ' + config.rep.name,
        'Duration: ' + duration,
        'Participants: ' + participants.filter(p => !p.is_user).map(p => p.full_name).join(', '),
        '',
        notesText.substring(0, 5000) // Limit size per entry
      ].join('\n');
      
      await salesforce.updateCustomerBrain(match.account.Id, brainEntry);
      console.log('    Customer Brain updated');
    } catch (err) {
      console.log('    Customer Brain update failed: ' + err.message);
    }
  }
  
  // Export to Obsidian vault (if enabled)
  if (config.settings.exportToObsidian) {
    try {
      obsidian.configure({
        enabled: true,
        vaultPath: config.settings.obsidianVaultPath || obsidian.DEFAULT_VAULT_PATH,
        createAccountFolders: true,
        includeParticipants: true,
        includeActionItems: true,
        linkToSalesforce: true
      });
      
      const obsidianResult = obsidian.exportMeeting(session, participants, match, { success: true });
      if (obsidianResult.success) {
        console.log('    Obsidian: Exported to vault');
      }
    } catch (err) {
      console.log('    Obsidian export failed: ' + err.message);
    }
  }
  
  return { success: true, accountId: match.account.Id, accountName: match.account.Name };
}

async function runSync() {
  console.log('\n========================================');
  console.log('         MEETING NOTES SYNC');
  console.log('========================================');
  
  loadEnv();
  const config = loadConfig();
  const synced = loadSyncedSessions();
  
  console.log('\nRep: ' + config.rep.name);
  
  // Check if sync is enabled
  if (!config.salesforce?.syncEnabled || !config.rep?.salesforceUserId) {
    console.log('\n  INTERNAL USE MODE');
    console.log('  ─────────────────────────────────────');
    console.log('  Salesforce sync is not enabled for your account.');
    console.log('  Your notes stay local in checks (Hyprnote).');
    console.log('  \n  If you should have sync access, contact Keigan (RevOps).\n');
    return;
  }
  
  console.log('SF User: ' + config.rep.salesforceUserId);
  
  // Connect to Salesforce
  console.log('\nConnecting to Salesforce...');
  
  let sfConfig = {};
  if (config.salesforce.useEnvFile) {
    sfConfig = {
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN || '',
      instanceUrl: process.env.SF_INSTANCE_URL
    };
  } else {
    sfConfig = config.salesforce;
  }
  
  if (!sfConfig.username || !sfConfig.password) {
    console.log('ERROR: Salesforce credentials not configured');
    console.log('  Run setup again or add credentials to .env file');
    process.exit(1);
  }
  
  try {
    await salesforce.connect(sfConfig);
    const testResult = await salesforce.testConnection();
    console.log('  Connected! (tested with: ' + testResult.sampleAccount + ')');
  } catch (err) {
    console.log('ERROR: Salesforce connection failed');
    console.log('  ' + err.message);
    process.exit(1);
  }
  
  // Get unsynced sessions
  const syncedIds = new Set(synced.sessions.map(s => s.id));
  const sessions = await hyprnote.getSessions(config.settings.lookbackHours, syncedIds);
  
  console.log('\nFound ' + sessions.length + ' meetings to sync');
  
  if (sessions.length === 0) {
    console.log('No new meetings to sync.\n');
    return;
  }
  
  // Sync each session
  let successCount = 0;
  let failCount = 0;
  
  for (const session of sessions) {
    try {
      const result = await syncSession(session, config, null);
      
      if (result.success) {
        successCount++;
        synced.sessions.push({
          id: session.id,
          title: session.title,
          syncedAt: new Date().toISOString(),
          accountId: result.accountId,
          accountName: result.accountName
        });
      } else {
        failCount++;
      }
    } catch (err) {
      console.log('    ERROR: ' + err.message);
      failCount++;
    }
  }
  
  // Save synced sessions
  saveSyncedSessions(synced);
  
  console.log('\n========================================');
  console.log('              SYNC COMPLETE');
  console.log('========================================');
  console.log('  Synced: ' + successCount);
  console.log('  Failed: ' + failCount);
  console.log('  Total tracked: ' + synced.sessions.length);
  console.log('\n');
}

// Main entry point
const args = process.argv.slice(2);

if (args.includes('--status') || args.includes('-s')) {
  showStatus().catch(err => {
    console.log('ERROR: ' + err.message);
    process.exit(1);
  });
} else {
  runSync().catch(err => {
    console.log('ERROR: ' + err.message);
    process.exit(1);
  });
}

