/**
 * Migration 004: Query Logs and Feedback
 * 
 * Creates tables for:
 * - query_logs: Every GTM Brain query with context, response, and performance data
 * - feedback: User feedback (helpful/not helpful) linked to query_logs
 * 
 * These tables enable:
 * - Identifying which queries fail most often
 * - Tracking response quality over time
 * - Linking feedback to specific queries for targeted improvement
 * - Analytics on usage patterns by user, account, and intent
 */

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS query_logs (
      id SERIAL PRIMARY KEY,
      query_text TEXT NOT NULL,
      query_hash VARCHAR(64),
      detected_intent VARCHAR(100),
      account_id VARCHAR(18),
      account_name VARCHAR(255),
      user_email VARCHAR(255),
      session_id VARCHAR(64),
      response_snippet TEXT,
      response_length INTEGER,
      context_type VARCHAR(50),
      data_freshness VARCHAR(20),
      response_time_ms INTEGER,
      sf_connection_status VARCHAR(20),
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_user ON query_logs(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_intent ON query_logs(detected_intent)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_account ON query_logs(account_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_session ON query_logs(session_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_created ON query_logs(created_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ql_hash ON query_logs(query_hash)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      query_log_id INTEGER REFERENCES query_logs(id) ON DELETE SET NULL,
      query_text VARCHAR(200),
      query_hash VARCHAR(64),
      answer_snippet VARCHAR(500),
      account_name VARCHAR(255),
      account_id VARCHAR(18),
      user_email VARCHAR(255),
      session_id VARCHAR(64),
      rating VARCHAR(20) NOT NULL,
      category VARCHAR(50),
      comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fb_rating ON feedback(rating)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fb_user ON feedback(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fb_created ON feedback(created_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fb_query_log ON feedback(query_log_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fb_category ON feedback(category)`);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS feedback CASCADE');
  await client.query('DROP TABLE IF EXISTS query_logs CASCADE');
}

module.exports = { up, down };
