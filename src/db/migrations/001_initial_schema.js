/**
 * Migration 001: Initial Schema
 * 
 * Creates all core tables for the GTM Brain database.
 * Replaces: JSON files, SQLite databases, in-memory caches.
 */

async function up(client) {
  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1: Replace fragile storage patterns
  // ═══════════════════════════════════════════════════════════════════════

  // intent_queries — Replace data/intent-learning.json
  await client.query(`
    CREATE TABLE IF NOT EXISTS intent_queries (
      id SERIAL PRIMARY KEY,
      query_hash VARCHAR(64) NOT NULL,
      query_text TEXT NOT NULL,
      detected_intent VARCHAR(100),
      confidence REAL DEFAULT 0,
      method VARCHAR(50),
      correct_intent VARCHAR(100),
      usage_count INTEGER DEFAULT 1,
      last_used_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_queries_hash ON intent_queries(query_hash)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_queries_intent ON intent_queries(detected_intent)`);

  // pipeline_snapshots — Replace data/bl-snapshots.json (unlimited history)
  await client.query(`
    CREATE TABLE IF NOT EXISTS pipeline_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      bl_name VARCHAR(255) NOT NULL,
      deal_count INTEGER DEFAULT 0,
      total_acv NUMERIC(12,2) DEFAULT 0,
      weighted_acv NUMERIC(12,2) DEFAULT 0,
      commit_acv NUMERIC(12,2) DEFAULT 0,
      in_qtr_commit_acv NUMERIC(12,2) DEFAULT 0,
      deals_by_stage JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_snap_date ON pipeline_snapshots(snapshot_date)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_snap_bl ON pipeline_snapshots(bl_name)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_snap_unique ON pipeline_snapshots(snapshot_date, bl_name)`);

  // calendar_events — Replace in-memory calendar cache
  await client.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      event_id VARCHAR(500) NOT NULL,
      subject TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      location TEXT,
      organizer_name VARCHAR(255),
      organizer_email VARCHAR(255),
      attendees JSONB DEFAULT '[]',
      is_all_day BOOLEAN DEFAULT FALSE,
      is_cancelled BOOLEAN DEFAULT FALSE,
      body_preview TEXT,
      web_link TEXT,
      account_name VARCHAR(255),
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_email, event_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_user ON calendar_events(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_start ON calendar_events(start_time)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_user_date ON calendar_events(user_email, start_time)`);

  // meeting_intelligence — Replace intelligence.db SQLite
  await client.query(`
    CREATE TABLE IF NOT EXISTS meeting_intelligence (
      id SERIAL PRIMARY KEY,
      account_id VARCHAR(18),
      account_name VARCHAR(255),
      meeting_date DATE,
      meeting_subject TEXT,
      summary TEXT,
      key_signals JSONB DEFAULT '[]',
      meddicc_signals JSONB DEFAULT '{}',
      next_steps JSONB DEFAULT '[]',
      attendees JSONB DEFAULT '[]',
      source VARCHAR(50) DEFAULT 'obsidian',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_meeting_intel_account ON meeting_intelligence(account_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_meeting_intel_date ON meeting_intelligence(meeting_date)`);

  // call_analyses — Replace call_analysis.db SQLite
  await client.query(`
    CREATE TABLE IF NOT EXISTS call_analyses (
      id SERIAL PRIMARY KEY,
      analysis_id VARCHAR(64) UNIQUE,
      account_id VARCHAR(18),
      account_name VARCHAR(255),
      rep_email VARCHAR(255),
      rep_name VARCHAR(255),
      call_date TIMESTAMPTZ DEFAULT NOW(),
      duration_seconds INTEGER,
      talk_time_rep REAL,
      talk_time_customer REAL,
      total_questions INTEGER DEFAULT 0,
      open_questions INTEGER DEFAULT 0,
      closed_questions INTEGER DEFAULT 0,
      objections_count INTEGER DEFAULT 0,
      value_score REAL DEFAULT 0,
      next_step_clear BOOLEAN DEFAULT FALSE,
      key_topics JSONB DEFAULT '[]',
      competitor_mentions JSONB DEFAULT '[]',
      positive_signals JSONB DEFAULT '[]',
      concerns JSONB DEFAULT '[]',
      coaching_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_call_analysis_account ON call_analyses(account_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_call_analysis_rep ON call_analyses(rep_email)`);

  // user_tokens — Replace data/user-tokens.enc.json (still AES-encrypted values)
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL UNIQUE,
      encrypted_token TEXT NOT NULL,
      token_type VARCHAR(50) DEFAULT 'oauth',
      expires_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tokens_email ON user_tokens(user_email)`);

  // enrichment_cache — Replace data/enrichment-cache.json
  await client.query(`
    CREATE TABLE IF NOT EXISTS enrichment_cache (
      id SERIAL PRIMARY KEY,
      contact_email VARCHAR(255) NOT NULL UNIQUE,
      contact_name VARCHAR(255),
      company VARCHAR(255),
      title VARCHAR(255),
      linkedin_url VARCHAR(500),
      phone VARCHAR(50),
      enrichment_source VARCHAR(50),
      enrichment_data JSONB DEFAULT '{}',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_enrichment_email ON enrichment_cache(contact_email)`);

  // telemetry_events — Replace data/telemetry-log.json
  await client.query(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50) NOT NULL,
      user_email VARCHAR(255),
      plugin_version VARCHAR(20),
      event_data JSONB DEFAULT '{}',
      error_message TEXT,
      error_stack TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_type ON telemetry_events(event_type)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_user ON telemetry_events(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at)`);

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2: New capabilities unlocked by persistent storage
  // ═══════════════════════════════════════════════════════════════════════

  // agent_jobs — Job queue for async agent tasks
  await client.query(`
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id SERIAL PRIMARY KEY,
      job_type VARCHAR(100) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      payload JSONB DEFAULT '{}',
      result JSONB,
      error_message TEXT,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      locked_by VARCHAR(100),
      locked_at TIMESTAMPTZ,
      scheduled_for TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead_letter'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status, scheduled_for)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_type ON agent_jobs(job_type)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_pending ON agent_jobs(status, priority DESC, scheduled_for ASC) WHERE status = 'pending'`);

  // agent_state — Multi-step workflow state
  await client.query(`
    CREATE TABLE IF NOT EXISTS agent_state (
      id SERIAL PRIMARY KEY,
      workflow_id VARCHAR(64) NOT NULL,
      agent_type VARCHAR(100) NOT NULL,
      current_step VARCHAR(100),
      state_data JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'active',
      parent_job_id INTEGER REFERENCES agent_jobs(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_state_workflow ON agent_state(workflow_id)`);

  // transcript_archive — Searchable meeting transcript archive
  await client.query(`
    CREATE TABLE IF NOT EXISTS transcript_archive (
      id SERIAL PRIMARY KEY,
      meeting_date DATE NOT NULL,
      meeting_subject TEXT,
      account_name VARCHAR(255),
      account_id VARCHAR(18),
      transcript TEXT NOT NULL,
      summary TEXT,
      sections JSONB DEFAULT '{}',
      duration_seconds INTEGER,
      attendees JSONB DEFAULT '[]',
      meeting_type VARCHAR(50) DEFAULT 'discovery',
      source VARCHAR(50) DEFAULT 'plugin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_transcript_account ON transcript_archive(account_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_transcript_date ON transcript_archive(meeting_date)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_transcript_type ON transcript_archive(meeting_type)`);

  // pipeline_review_summaries — Weekly pipeline meeting outputs
  await client.query(`
    CREATE TABLE IF NOT EXISTS pipeline_review_summaries (
      id SERIAL PRIMARY KEY,
      review_date DATE NOT NULL,
      summary_markdown TEXT NOT NULL,
      priority_actions JSONB DEFAULT '[]',
      bl_context JSONB DEFAULT '{}',
      account_details JSONB DEFAULT '{}',
      forecast_changes JSONB DEFAULT '[]',
      action_items JSONB DEFAULT '[]',
      salesforce_snapshot JSONB DEFAULT '{}',
      transcript_id INTEGER REFERENCES transcript_archive(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_review_date ON pipeline_review_summaries(review_date)`);

  // analytics_events — Persistent user analytics
  await client.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      user_email VARCHAR(255),
      user_agent TEXT,
      ip_address VARCHAR(45),
      properties JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at)`);

  // notification_queue — Outbound notifications
  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_queue (
      id SERIAL PRIMARY KEY,
      channel VARCHAR(50) NOT NULL,
      recipient VARCHAR(255) NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_channel CHECK (channel IN ('slack', 'email', 'plugin'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_status ON notification_queue(status) WHERE status = 'pending'`);
}

async function down(client) {
  // Drop in reverse dependency order
  const tables = [
    'notification_queue',
    'analytics_events',
    'pipeline_review_summaries',
    'transcript_archive',
    'agent_state',
    'agent_jobs',
    'telemetry_events',
    'enrichment_cache',
    'user_tokens',
    'call_analyses',
    'meeting_intelligence',
    'calendar_events',
    'pipeline_snapshots',
    'intent_queries'
  ];
  
  for (const table of tables) {
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

module.exports = { up, down };
