/**
 * Migration 006: Device Fleet Management + Vault Operations Queue
 * 
 * Creates tables for:
 * - device_registrations: Per-device identity tracking (UUID + email + health)
 * - vault_operations: Command queue for admin-to-device vault operations
 * 
 * Enables: remote vault management, per-device admin control, fleet health monitoring
 */

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS device_registrations (
      id SERIAL PRIMARY KEY,
      device_id UUID NOT NULL UNIQUE,
      user_email VARCHAR(255) NOT NULL,
      device_name VARCHAR(255),
      platform VARCHAR(50) DEFAULT 'obsidian',
      plugin_version VARCHAR(20),
      os_info VARCHAR(255),
      last_heartbeat TIMESTAMPTZ,
      account_count INTEGER DEFAULT 0,
      sf_connected BOOLEAN DEFAULT FALSE,
      calendar_connected BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_device_user_email
    ON device_registrations (user_email)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vault_operations (
      id SERIAL PRIMARY KEY,
      target_email VARCHAR(255),
      target_device_id UUID,
      operation_type VARCHAR(50) NOT NULL,
      operation_data JSONB NOT NULL,
      priority INTEGER DEFAULT 5,
      status VARCHAR(20) DEFAULT 'pending',
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      executed_at TIMESTAMPTZ,
      result JSONB,
      error_message TEXT,
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_vault_ops_target
    ON vault_operations (target_email, status)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_vault_ops_device
    ON vault_operations (target_device_id, status)
  `);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS vault_operations');
  await client.query('DROP TABLE IF EXISTS device_registrations');
}

module.exports = { up, down };
