/**
 * Migration 002: User Account Management
 * 
 * Adds tables for remote account management:
 * - user_account_overrides: Admin-pushed account additions/removals per user
 * - user_sync_flags: Signals to trigger actions on user plugin (resync, update, etc.)
 * 
 * These enable admins to add/remove accounts for any user remotely,
 * and trigger account re-syncs without requiring the user to take action.
 */

async function up(client) {
  // user_account_overrides — Admin-pushed account additions/removals
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_account_overrides (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      account_id VARCHAR(18) NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      action VARCHAR(10) NOT NULL DEFAULT 'add',
      admin_email VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_action CHECK (action IN ('add', 'remove')),
      UNIQUE(user_email, account_id, action)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_acct_override_user ON user_account_overrides(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_acct_override_account ON user_account_overrides(account_id)`);

  // user_sync_flags — Signals for plugin to act on (resync, update, etc.)
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_sync_flags (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      flag VARCHAR(50) NOT NULL,
      payload JSONB DEFAULT '{}',
      admin_email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      CONSTRAINT valid_flag CHECK (flag IN ('resync_accounts', 'update_plugin', 'reset_setup', 'custom'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sync_flag_user ON user_sync_flags(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sync_flag_pending ON user_sync_flags(user_email, consumed_at) WHERE consumed_at IS NULL`);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS user_sync_flags CASCADE');
  await client.query('DROP TABLE IF EXISTS user_account_overrides CASCADE');
}

module.exports = { up, down };
