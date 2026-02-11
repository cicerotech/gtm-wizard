/**
 * Account Sync Cron Job
 * 
 * Runs every N hours (default 6, configurable via ACCOUNT_SYNC_INTERVAL_HOURS).
 * For each business lead, queries Salesforce for ALL owned accounts (full BoB),
 * determines hadOpportunity flag, compares against the stored snapshot in
 * PostgreSQL, and creates resync_accounts flags when changes are detected.
 * The Obsidian plugin picks up these flags on next startup.
 * 
 * Detects:
 *   - Account additions/removals (ownership changes)
 *   - Tier changes: prospect -> active (gained first opp)
 * 
 * Architecture:
 *   SF Query (all accounts) -> Opp check for tier -> 
 *   Diff against user_account_snapshots -> 
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

// All BL emails to track (21 owners from the full BoB Excel)
const ALL_BL_EMAILS = [
  'alex.fox@eudia.com',
  'ananth.cherukupally@eudia.com',
  'asad.hussain@eudia.com',
  'conor.molloy@eudia.com',
  'david.vanreyk@eudia.com',
  'emer.flynn@eudia.com',
  'greg.machale@eudia.com',
  'himanshu.agarwal@eudia.com',
  'jon.cobb@eudia.com',
  'julie.stefanich@eudia.com',
  'justin.hills@eudia.com',
  'mike.ayres@eudia.com',
  'mike@eudia.com',
  'mitch.loquaci@eudia.com',
  'nathan.shine@eudia.com',
  'nicola.fratini@eudia.com',
  'olivia.jung@eudia.com',
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
 * Query Salesforce for ALL accounts owned by a given email.
 * Returns each account with a hadOpportunity flag.
 */
async function queryAllAccountsForUser(email) {
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

  // Step 2: Query ALL accounts owned by this user (no BoB filter)
  const allAccountsQuery = `
    SELECT Id, Name
    FROM Account
    WHERE OwnerId = '${userId}'
      AND (NOT Name LIKE '%Sample%')
      AND (NOT Name LIKE '%Test%')
    ORDER BY Name ASC
  `;
  const allResult = await sfConnection.query(allAccountsQuery);

  // Step 3: Determine which accounts have ever had an opportunity
  const accountIds = (allResult.records || []).map(a => a.Id);
  const oppAccountIds = new Set();
  
  if (accountIds.length > 0) {
    for (let i = 0; i < accountIds.length; i += 200) {
      const batch = accountIds.slice(i, i + 200);
      const idList = batch.map(id => `'${id}'`).join(',');
      const oppQuery = `SELECT AccountId FROM Opportunity WHERE AccountId IN (${idList}) GROUP BY AccountId`;
      const oppResult = await sfConnection.query(oppQuery);
      (oppResult.records || []).forEach(r => oppAccountIds.add(r.AccountId));
    }
  }

  // Build accounts array with tier info
  const accounts = (allResult.records || []).map(acc => ({
    id: acc.Id,
    name: acc.Name,
    hadOpportunity: oppAccountIds.has(acc.Id)
  }));
  accounts.sort((a, b) => a.name.localeCompare(b.name));

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
 * Now includes hadOpportunity tier info in the names object.
 */
async function saveSnapshot(email, accounts) {
  if (!db.isAvailable()) return;

  const accountIds = accounts.map(a => a.id).sort();
  const accountNames = {};
  accounts.forEach(a => { 
    accountNames[a.id] = { name: a.name, hadOpp: a.hadOpportunity }; 
  });

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
 * Diff two sets of accounts. Returns { added, removed, promoted } arrays.
 * - added/removed: accounts gained/lost
 * - promoted: accounts that changed from prospect (no opp) to active (has opp)
 */
function diffAccounts(previousSnapshot, currentAccounts) {
  const prevIds = new Set(previousSnapshot.accountIds || []);
  const prevNames = previousSnapshot.accountNames || {};
  
  const currentMap = new Map();
  currentAccounts.forEach(a => currentMap.set(a.id, a));
  const currentIds = new Set(currentAccounts.map(a => a.id));

  const added = [];
  const removed = [];
  const promoted = [];

  // Find added and promoted accounts
  for (const acc of currentAccounts) {
    if (!prevIds.has(acc.id)) {
      added.push({ id: acc.id, name: acc.name, hadOpportunity: acc.hadOpportunity });
    } else if (acc.hadOpportunity) {
      // Check if it was previously a prospect (no opp)
      const prevInfo = prevNames[acc.id];
      // Handle both old format (string name) and new format ({ name, hadOpp })
      const prevHadOpp = typeof prevInfo === 'object' ? prevInfo.hadOpp : true;
      if (!prevHadOpp) {
        promoted.push({ id: acc.id, name: acc.name });
      }
    }
  }

  // Find removed accounts
  for (const prevId of previousSnapshot.accountIds || []) {
    if (!currentIds.has(prevId)) {
      const prevInfo = prevNames[prevId];
      const name = typeof prevInfo === 'object' ? prevInfo.name : (prevInfo || 'Unknown');
      removed.push({ id: prevId, name });
    }
  }

  return { added, removed, promoted };
}

/**
 * Run the sync for a single user. Returns a summary object.
 */
async function syncUserAccounts(email) {
  try {
    const { userId, accounts } = await queryAllAccountsForUser(email);

    if (!userId) {
      return { email, status: 'skipped', reason: 'user_not_found' };
    }

    const activeCount = accounts.filter(a => a.hadOpportunity).length;
    const prospectCount = accounts.filter(a => !a.hadOpportunity).length;

    const snapshot = await loadSnapshot(email);

    if (!snapshot) {
      // First run: just save the snapshot, no flag needed
      await saveSnapshot(email, accounts);
      return {
        email,
        status: 'initialized',
        accountCount: accounts.length,
        activeCount,
        prospectCount,
      };
    }

    // Diff (including tier changes)
    const { added, removed, promoted } = diffAccounts(snapshot, accounts);

    if (added.length === 0 && removed.length === 0 && promoted.length === 0) {
      // Even if no changes, update the snapshot to keep tier info fresh
      await saveSnapshot(email, accounts);
      return {
        email,
        status: 'no_changes',
        accountCount: accounts.length,
        activeCount,
        prospectCount,
      };
    }

    // Changes detected!
    const changes = {
      added: added,
      removed: removed,
      promoted: promoted,
      previousCount: snapshot.accountCount,
      currentCount: accounts.length,
      activeCount,
      prospectCount,
      detectedAt: new Date().toISOString(),
    };

    logger.info(`[AccountSync] Changes for ${email}: +${added.length} added, -${removed.length} removed, ${promoted.length} promoted (${snapshot.accountCount} -> ${accounts.length}, ${activeCount} active + ${prospectCount} prospects)`);
    
    if (added.length > 0) {
      logger.info(`[AccountSync]   Added: ${changes.added.map(a => a.name).join(', ')}`);
    }
    if (removed.length > 0) {
      logger.info(`[AccountSync]   Removed: ${changes.removed.map(a => a.name).join(', ')}`);
    }
    if (promoted.length > 0) {
      logger.info(`[AccountSync]   Promoted (prospect->active): ${changes.promoted.map(a => a.name).join(', ')}`);
    }

    // Save new snapshot and create resync flag
    await saveSnapshot(email, accounts);
    await createResyncFlag(email, changes);

    return {
      email,
      status: 'changes_detected',
      added: changes.added,
      removed: changes.removed,
      promoted: changes.promoted,
      accountCount: accounts.length,
      activeCount,
      prospectCount,
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

  logger.info(`[AccountSync] Starting full BoB account sync for ${ALL_BL_EMAILS.length} business leads...`);

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

  const totalActive = results.reduce((sum, r) => sum + (r.activeCount || 0), 0);
  const totalProspect = results.reduce((sum, r) => sum + (r.prospectCount || 0), 0);

  const summary = {
    success: true,
    timestamp: new Date().toISOString(),
    durationMs: duration,
    totalUsers: ALL_BL_EMAILS.length,
    totalAccounts: totalActive + totalProspect,
    totalActive,
    totalProspect,
    changesDetected: changesDetected.length,
    errors: errors.length,
    initialized: initialized.length,
    noChanges: results.filter(r => r.status === 'no_changes').length,
    details: results,
  };

  if (changesDetected.length > 0) {
    logger.info(`[AccountSync] Completed in ${duration}ms: ${changesDetected.length} user(s) with changes, ${errors.length} errors (${totalActive} active + ${totalProspect} prospect accounts total)`);
    changesDetected.forEach(r => {
      const parts = [];
      if (r.added && r.added.length > 0) parts.push(`+${r.added.length}`);
      if (r.removed && r.removed.length > 0) parts.push(`-${r.removed.length}`);
      if (r.promoted && r.promoted.length > 0) parts.push(`${r.promoted.length} promoted`);
      logger.info(`[AccountSync]   ${r.email}: ${parts.join(' / ')}`);
    });
  } else {
    logger.info(`[AccountSync] Completed in ${duration}ms: No changes detected (${totalActive} active + ${totalProspect} prospect accounts total)`);
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

  logger.info(`[AccountSync] Scheduling full BoB account sync every ${SYNC_INTERVAL_HOURS} hours (cron: ${cronExpr})`);

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
  queryAllAccountsForUser,
};
