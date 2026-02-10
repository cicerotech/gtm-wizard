/**
 * Migration 003: Account Snapshots
 * 
 * Adds a table to track the last-known set of accounts for each business lead.
 * The account sync cron job compares current Salesforce data against these
 * snapshots to detect additions, removals, and transfers -- then creates
 * resync_accounts flags so the Obsidian plugin can pick up changes automatically.
 */

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_account_snapshots (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL UNIQUE,
      account_ids JSONB NOT NULL DEFAULT '[]',
      account_names JSONB NOT NULL DEFAULT '{}',
      account_count INTEGER NOT NULL DEFAULT 0,
      snapshot_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_snapshot_email ON user_account_snapshots(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_snapshot_updated ON user_account_snapshots(updated_at)`);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS user_account_snapshots CASCADE');
}

module.exports = { up, down };
