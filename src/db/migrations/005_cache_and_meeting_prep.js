/**
 * Migration 005: Cache Entries and Meeting Preps
 * 
 * Creates tables for:
 * - cache_entries: Generic key-value cache with TTL (Postgres L2 cache layer)
 * - meeting_preps: Structured meeting prep storage (replaces file-based JSON store)
 * 
 * cache_entries eliminates the cold-start problem by persisting AI summaries,
 * account context, and other ephemeral data across Render restarts.
 * 
 * meeting_preps makes meeting prep data durable, queryable by account/date,
 * and survives Render restarts without depending on git commits.
 */

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key TEXT PRIMARY KEY,
      cache_value JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cache_entries_expires 
    ON cache_entries (expires_at)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS meeting_preps (
      id SERIAL PRIMARY KEY,
      meeting_id TEXT UNIQUE NOT NULL,
      account_id TEXT,
      account_name TEXT,
      meeting_title TEXT,
      meeting_date TIMESTAMPTZ,
      agenda JSONB DEFAULT '[]'::jsonb,
      goals JSONB DEFAULT '[]'::jsonb,
      demo_selections JSONB DEFAULT '[]'::jsonb,
      context_override TEXT,
      additional_notes JSONB DEFAULT '[]'::jsonb,
      external_attendees JSONB DEFAULT '[]'::jsonb,
      internal_attendees JSONB DEFAULT '[]'::jsonb,
      source TEXT DEFAULT 'outlook',
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_meeting_preps_account 
    ON meeting_preps (account_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_meeting_preps_date 
    ON meeting_preps (meeting_date DESC)
  `);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS meeting_preps');
  await client.query('DROP TABLE IF EXISTS cache_entries');
}

module.exports = { up, down };
