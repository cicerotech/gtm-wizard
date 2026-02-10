/**
 * Database Migration Runner
 * 
 * Runs migrations in order from src/db/migrations/ directory.
 * Each migration file exports { up(client), down(client) }.
 * Tracks applied migrations in a `_migrations` table.
 * 
 * Usage:
 *   node src/db/migrate.js          # Run all pending migrations
 *   node src/db/migrate.js --down   # Rollback last migration
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../observability/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function createMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT name FROM _migrations ORDER BY id');
  return result.rows.map(r => r.name);
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
  
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort(); // Alphabetical = chronological with YYYYMMDD prefix
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set. Cannot run migrations.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  
  try {
    await createMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();
    
    const pending = files.filter(f => !applied.includes(f));
    
    if (pending.length === 0) {
      console.log('[Migrations] All migrations are up to date.');
      return;
    }

    console.log(`[Migrations] ${pending.length} pending migration(s) to apply...`);

    for (const file of pending) {
      console.log(`[Migrations] Applying: ${file}`);
      const migration = require(path.join(MIGRATIONS_DIR, file));
      
      await client.query('BEGIN');
      try {
        await migration.up(client);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migrations]   ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations]   ✗ ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(`[Migrations] Done. ${pending.length} migration(s) applied.`);

  } finally {
    client.release();
    await pool.end();
  }
}

async function rollbackLastMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    await createMigrationsTable(client);
    const result = await client.query('SELECT name FROM _migrations ORDER BY id DESC LIMIT 1');
    
    if (result.rows.length === 0) {
      console.log('[Migrations] Nothing to rollback.');
      return;
    }

    const lastMigration = result.rows[0].name;
    console.log(`[Migrations] Rolling back: ${lastMigration}`);
    
    const migration = require(path.join(MIGRATIONS_DIR, lastMigration));
    
    await client.query('BEGIN');
    try {
      await migration.down(client);
      await client.query('DELETE FROM _migrations WHERE name = $1', [lastMigration]);
      await client.query('COMMIT');
      console.log(`[Migrations]   ✓ Rolled back ${lastMigration}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migrations]   ✗ Rollback failed: ${err.message}`);
      throw err;
    }

  } finally {
    client.release();
    await pool.end();
  }
}

// CLI entry point
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  
  const isRollback = process.argv.includes('--down');
  
  (isRollback ? rollbackLastMigration() : runMigrations())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations, rollbackLastMigration };
