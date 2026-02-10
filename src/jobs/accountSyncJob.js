/**
 * Account Sync Cron Job
 * 
 * Runs every N hours (default 6, configurable via ACCOUNT_SYNC_INTERVAL_HOURS).
 * For each business lead, queries Salesforce with the BoB report filter
 * (Customer Type = Existing OR open opps), compares against the stored
 * snapshot in PostgreSQL, and creates a resync_accounts flag when changes
 * are detected. The Obsidian plugin picks up these flags on next startup.
 * 
 * Architecture:
 *   SF Query -> Diff against user_account_snapshots -> 
 *   Create user_sync_flags if delta -> Update snapshot
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const db = require('../db/connection');
const { sfConnection } = require('../salesforce/connection');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SYNC_INTERVAL_HOURS = parseInt(process.env.ACCOUNT_SYNC_INTERVAL_HOURS || '6', 10);

// All BL emails to track (must match the 18 owners from the Excel BoB report)
const ALL_BL_EMAILS = [
  'alex.fox@eudia.com',
  'ananth@eudia.com',
  'asad.hussain@eudia.com',
  'conor.molloy@eudia.com',
  'emer.flynn@eudia.com',
  'greg.machale@eudia.com',
  'julie.stefanich@eudia.com',
  'justin.hills@eudia.com',
  'keigan.pesenti@eudia.com',
  'mike.masiello@eudia.com',
  'mitchell.loquaci@eudia.com',
  'nathan.shine@eudia.com',
  'nicola.fratini@eudia.com',
  'olivia@eudia.com',
  'rajeev.patel@eudia.com',
  'riley.stack@eudia.com',
  'sean.boyd@eudia.com',
  'tom.clancy@eudia.com',
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE LOGIC
// ═══════════════════════════════════════════════════════════════════════════

let syncInProgress = false;
let lastSyncResult = null;
let scheduledTask = null;

/**
 * Query Salesforce for the filtered accounts owned by a given email.
 * Uses the same BoB report filter as /api/accounts/ownership/:email.
 */
async function queryFilteredAccountsForUser(email) {
  if (!sfConnection || !sfConnection.isConnected) {
    throw new Error('Salesforce not connected');
  }

  // Step 1: Resolve the User ID from the email
  const safeEmail = email.replace(/'/g, "\\'");
  const userQuery = `SELECT Id FROM User WHERE Email = '${safeEmail}' AND IsActive = true LIMIT 1`;
  const userResult = await sfConnection.query(userQuery);
  
  if (!userResult.records || userResult.records.length === 0) {
    return { userId: null, accounts: [] };
  }

  const userId = userResult.records[0].Id;

  // Step 2: Query accounts with the BoB report filter
  const accountQuery = `
    SELECT Id, Name
    FROM Account
    WHERE OwnerId = '${userId}'
      AND (
        Customer_Type__c = 'Existing'
        OR Id IN (SELECT AccountId FROM Opportunity WHERE OwnerId = '${userId}' AND IsClosed = false)
      )
      AND (NOT Name LIKE '%Sample%')
      AND (NOT Name LIKE '%Test%')
    ORDER BY Name ASC
  `;
  const accountResult = await sfConnection.query(accountQuery);

  const accounts = (accountResult.records || []).map(acc => ({
    id: acc.Id,
    name: acc.Name,
  }));

  return { userId, accounts };
}

/**
 * Load the previous account snapshot for a user from PostgreSQL.
 * Returns null if no snapshot exists (first run).
 */
async function loadSnapshot(email) {
  if (!db.isAvailable()) return null;

  const result = await db.query(
    'SELECT account_ids, account_names, account_count, snapshot_at FROM user_account_snapshots WHERE user_email = $1',
    [email]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    accountIds: row.account_ids || [],
    accountNames: row.account_names || {},
    accountCount: row.account_count,
    snapshotAt: row.snapshot_at,
  };
}

/**
 * Save or update the account snapshot for a user.
 */
async function saveSnapshot(email, accounts) {
  if (!db.isAvailable()) return;

  const accountIds = accounts.map(a => a.id).sort();
  const accountNames = {};
  accounts.forEach(a => { accountNames[a.id] = a.name; });

  await db.query(`
    INSERT INTO user_account_snapshots (user_email, account_ids, account_names, account_count, snapshot_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (user_email)
    DO UPDATE SET
      account_ids = $2,
      account_names = $3,
      account_count = $4,
      snapshot_at = NOW(),
      updated_at = NOW()
  `, [email, JSON.stringify(accountIds), JSON.stringify(accountNames), accounts.length]);
}

/**
 * Create a resync_accounts flag for a user so the plugin picks up changes.
 * Includes a payload describing what changed.
 */
async function createResyncFlag(email, changes) {
  if (!db.isAvailable()) return;

  await db.query(`
    INSERT INTO user_sync_flags (user_email, flag, payload, admin_email, created_at)
    VALUES ($1, 'resync_accounts', $2, 'system@cron', NOW())
  `, [email, JSON.stringify(changes)]);
}

/**
 * Diff two sets of account IDs. Returns { added, removed } arrays.
 */
function diffAccountIds(previousIds, currentIds) {
  const prevSet = new Set(previousIds);
  const currSet = new Set(currentIds);

  const added = currentIds.filter(id => !prevSet.has(id));
  const removed = previousIds.filter(id => !currSet.has(id));

  return { added, removed };
}

/**
 * Run the sync for a single user. Returns a summary object.
 */
async function syncUserAccounts(email) {
  try {
    const { userId, accounts } = await queryFilteredAccountsForUser(email);

    if (!userId) {
      return { email, status: 'skipped', reason: 'user_not_found' };
    }

    const currentIds = accounts.map(a => a.id).sort();
    const currentNames = {};
    accounts.forEach(a => { currentNames[a.id] = a.name; });

    const snapshot = await loadSnapshot(email);

    if (!snapshot) {
      // First run: just save the snapshot, no flag needed
      await saveSnapshot(email, accounts);
      return {
        email,
        status: 'initialized',
        accountCount: accounts.length,
      };
    }

    // Diff
    const { added, removed } = diffAccountIds(snapshot.accountIds, currentIds);

    if (added.length === 0 && removed.length === 0) {
      return {
        email,
        status: 'no_changes',
        accountCount: accounts.length,
      };
    }

    // Changes detected!
    const changes = {
      added: added.map(id => ({ id, name: currentNames[id] || 'Unknown' })),
      removed: removed.map(id => ({ id, name: snapshot.accountNames[id] || 'Unknown' })),
      previousCount: snapshot.accountCount,
      currentCount: accounts.length,
      detectedAt: new Date().toISOString(),
    };

    logger.info(`[AccountSync] Changes for ${email}: +${added.length} added, -${removed.length} removed (${snapshot.accountCount} -> ${accounts.length})`);
    
    if (added.length > 0) {
      logger.info(`[AccountSync]   Added: ${changes.added.map(a => a.name).join(', ')}`);
    }
    if (removed.length > 0) {
      logger.info(`[AccountSync]   Removed: ${changes.removed.map(a => a.name).join(', ')}`);
    }

    // Save new snapshot and create resync flag
    await saveSnapshot(email, accounts);
    await createResyncFlag(email, changes);

    return {
      email,
      status: 'changes_detected',
      added: changes.added,
      removed: changes.removed,
      accountCount: accounts.length,
    };

  } catch (err) {
    logger.error(`[AccountSync] Error syncing ${email}: ${err.message}`);
    return {
      email,
      status: 'error',
      error: err.message,
    };
  }
}

/**
 * Run the full sync across all BLs.
 */
async function runAccountSync() {
  if (syncInProgress) {
    logger.warn('[AccountSync] Sync already in progress, skipping');
    return lastSyncResult;
  }

  if (!sfConnection || !sfConnection.isConnected) {
    logger.warn('[AccountSync] Salesforce not connected, skipping sync');
    return { success: false, reason: 'sf_not_connected' };
  }

  if (!db.isAvailable()) {
    logger.warn('[AccountSync] PostgreSQL not available, skipping sync');
    return { success: false, reason: 'db_not_available' };
  }

  syncInProgress = true;
  const startTime = Date.now();

  logger.info(`[AccountSync] Starting account sync for ${ALL_BL_EMAILS.length} business leads...`);

  const results = [];

  for (const email of ALL_BL_EMAILS) {
    const result = await syncUserAccounts(email);
    results.push(result);

    // Small delay between queries to avoid hitting SF rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const duration = Date.now() - startTime;
  const changesDetected = results.filter(r => r.status === 'changes_detected');
  const errors = results.filter(r => r.status === 'error');
  const initialized = results.filter(r => r.status === 'initialized');

  const summary = {
    success: true,
    timestamp: new Date().toISOString(),
    durationMs: duration,
    totalUsers: ALL_BL_EMAILS.length,
    changesDetected: changesDetected.length,
    errors: errors.length,
    initialized: initialized.length,
    noChanges: results.filter(r => r.status === 'no_changes').length,
    details: results,
  };

  if (changesDetected.length > 0) {
    logger.info(`[AccountSync] Completed in ${duration}ms: ${changesDetected.length} user(s) with changes, ${errors.length} errors`);
    changesDetected.forEach(r => {
      logger.info(`[AccountSync]   ${r.email}: +${r.added.length} / -${r.removed.length}`);
    });
  } else {
    logger.info(`[AccountSync] Completed in ${duration}ms: No changes detected for any user`);
  }

  if (errors.length > 0) {
    logger.warn(`[AccountSync] ${errors.length} error(s):`);
    errors.forEach(r => logger.warn(`[AccountSync]   ${r.email}: ${r.error}`));
  }

  lastSyncResult = summary;
  syncInProgress = false;

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the cron-scheduled account sync.
 * Runs immediately on startup, then on a repeating schedule.
 */
function startAccountSyncSchedule() {
  const cronExpr = `0 */${SYNC_INTERVAL_HOURS} * * *`;

  logger.info(`[AccountSync] Scheduling account sync every ${SYNC_INTERVAL_HOURS} hours (cron: ${cronExpr})`);

  scheduledTask = cron.schedule(cronExpr, async () => {
    logger.info('[AccountSync] Cron trigger: starting scheduled account sync...');
    await runAccountSync();
  });

  // Run initial sync after a 60-second delay (let SF connection stabilize)
  setTimeout(async () => {
    logger.info('[AccountSync] Running initial account sync (startup)...');
    await runAccountSync();
  }, 60 * 1000);
}

/**
 * Stop the scheduled cron.
 */
function stopAccountSyncSchedule() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[AccountSync] Stopped account sync schedule');
  }
}

/**
 * Get the last sync result (for health checks / admin endpoints).
 */
function getLastSyncResult() {
  return lastSyncResult;
}

module.exports = {
  runAccountSync,
  startAccountSyncSchedule,
  stopAccountSyncSchedule,
  getLastSyncResult,
  syncUserAccounts,
  queryFilteredAccountsForUser,
};
