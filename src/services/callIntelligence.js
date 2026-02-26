/**
 * callIntelligence.js
 * 
 * Service for call analysis with speaker diarization and coaching metrics.
 * Provides speaker-separated transcripts, talk time analysis, and coaching insights.
 * 
 * Priority 5: Call Intelligence & Manager Coaching Layer
 * 
 * Architecture:
 * - Uses Whisper for transcription (via existing TranscriptionService)
 * - Uses external diarization service (pyannote.audio or AssemblyAI)
 * - LLM analysis for coaching metrics extraction
 * 
 * @author GTM Brain
 * @date January 2026
 */

const logger = require('../utils/logger');
const OpenAI = require('openai');
const Database = require('better-sqlite3');
const path = require('path');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize SQLite database for call analysis storage
const dbPath = path.join(process.env.DATA_PATH || './data', 'call_analysis.db');
let db;

try {
  db = new Database(dbPath);
  initializeDatabase();
} catch (error) {
  logger.error('Failed to initialize call analysis database', { error: error.message });
}

/**
 * Initialize database schema
 * Includes both Sales coaching metrics and CS analytics fields
 */
function initializeDatabase() {
  // Core call analysis table
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_analysis (
      id TEXT PRIMARY KEY,
      call_date TEXT NOT NULL,
      account_id TEXT,
      account_name TEXT,
      rep_id TEXT,
      rep_name TEXT,
      duration_seconds INTEGER,
      talk_ratio_rep REAL,
      talk_ratio_customer REAL,
      question_count INTEGER,
      open_question_count INTEGER,
      closed_question_count INTEGER,
      objection_count INTEGER,
      value_articulation_score REAL,
      next_step_clarity INTEGER,
      overall_score REAL,
      coaching_summary TEXT,
      key_topics TEXT,
      full_analysis_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      -- CS-specific fields (added for Customer Success analytics)
      pain_points_json TEXT,           -- [{category, description, severity, quote}]
      feature_requests_json TEXT,      -- [{feature, business_justification, priority}]
      adoption_blockers_json TEXT,     -- [{blocker, type: training|integration|workflow}]
      sentiment_score REAL,            -- -1.0 to +1.0
      escalation_risk INTEGER,         -- 0/1 flag
      health_indicators_json TEXT,     -- {positive: [], concerns: [], risk_level}
      
      -- Additional analytics fields
      call_type TEXT,                  -- 'sales' | 'cs' | 'onboarding' | 'support'
      user_group TEXT,                 -- 'bl' | 'cs' | 'sales_leader' | etc.
      competitor_mentions_json TEXT,   -- [{competitor, sentiment, context}]
      positive_signals_json TEXT,      -- [signal1, signal2, ...]
      entities_json TEXT,              -- {products, companies, people, terms}
      keywords_json TEXT               -- [{term, count, sentiment}]
    );
    
    CREATE INDEX IF NOT EXISTS idx_call_analysis_rep ON call_analysis(rep_id);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_account ON call_analysis(account_id);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_date ON call_analysis(call_date);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_type ON call_analysis(call_type);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_risk ON call_analysis(escalation_risk);
  `);
  
  // Add new columns if they don't exist (for existing databases)
  const newColumns = [
    'pain_points_json TEXT',
    'feature_requests_json TEXT',
    'adoption_blockers_json TEXT',
    'sentiment_score REAL',
    'escalation_risk INTEGER',
    'health_indicators_json TEXT',
    'call_type TEXT',
    'user_group TEXT',
    'competitor_mentions_json TEXT',
    'positive_signals_json TEXT',
    'entities_json TEXT',
    'keywords_json TEXT'
  ];
  
  for (const column of newColumns) {
    const [columnName] = column.split(' ');
    try {
      db.exec(`ALTER TABLE call_analysis ADD COLUMN ${column}`);
      logger.info(`Added column ${columnName} to call_analysis`);
    } catch (e) {
      // Column likely already exists - ignore
    }
  }
  
  // Conversation trends table for aggregation
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_trends (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      scope_type TEXT NOT NULL,        -- 'team', 'rep', 'region', 'account'
      scope_id TEXT NOT NULL,          -- Team ID, rep email, region name, account ID
      
      -- Talk time trends
      avg_talk_ratio REAL,
      talk_ratio_trend REAL,           -- Week-over-week change
      
      -- Question quality trends
      avg_open_question_rate REAL,
      question_rate_trend REAL,
      
      -- Objection trends
      top_objections_json TEXT,        -- [{objection, count, handle_rate}]
      objection_handle_rate_trend REAL,
      
      -- Topic trends
      trending_topics_json TEXT,       -- [{topic, count, sentiment_avg}]
      emerging_topics_json TEXT,       -- Topics new this period
      
      -- Pain point aggregation
      top_pain_points_json TEXT,       -- [{pain_point, count, category}]
      
      -- Health indicators
      avg_score REAL,
      score_trend REAL,
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_trends_scope ON conversation_trends(scope_type, scope_id);
    CREATE INDEX IF NOT EXISTS idx_trends_period ON conversation_trends(period_start, period_end);
  `);
  
  // Conversation patterns table for ML/data science
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,      -- 'objection', 'success_factor', 'risk_indicator', 'pain_point'
      pattern_text TEXT NOT NULL,
      occurrence_count INTEGER DEFAULT 1,
      success_correlation REAL,        -- Correlation with won/lost deals (-1 to +1)
      example_quotes_json TEXT,        -- [quote1, quote2, ...]
      first_seen TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_patterns_type ON conversation_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_patterns_correlation ON conversation_patterns(success_correlation);
  `);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SCIENCE FOUNDATION TABLES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Global keywords table for cross-call term tracking and frequency analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL UNIQUE,
      category TEXT,                    -- 'product', 'competitor', 'pain_point', 'feature', 'legal_term', 'general'
      occurrence_count INTEGER DEFAULT 1,
      positive_sentiment_count INTEGER DEFAULT 0,
      negative_sentiment_count INTEGER DEFAULT 0,
      neutral_sentiment_count INTEGER DEFAULT 0,
      avg_sentiment REAL DEFAULT 0.0,   -- Weighted average sentiment (-1 to +1)
      
      -- Context tracking
      associated_accounts_json TEXT,    -- [account_id1, account_id2, ...]
      associated_reps_json TEXT,        -- [rep_email1, rep_email2, ...]
      example_contexts_json TEXT,       -- [{quote, call_id, date}, ...]
      
      -- Trend data
      first_seen TEXT,
      last_seen TEXT,
      weekly_trend REAL,                -- Week-over-week change percentage
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_keywords_term ON keywords(term);
    CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);
    CREATE INDEX IF NOT EXISTS idx_keywords_occurrence ON keywords(occurrence_count DESC);
    CREATE INDEX IF NOT EXISTS idx_keywords_sentiment ON keywords(avg_sentiment);
  `);
  
  // Sentiment analysis table - per-call detailed sentiment tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentiment_analysis (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL,
      account_id TEXT,
      rep_id TEXT,
      call_date TEXT,
      
      -- Overall sentiment
      overall_sentiment REAL,           -- -1.0 to +1.0
      sentiment_label TEXT,             -- 'very_negative', 'negative', 'neutral', 'positive', 'very_positive'
      
      -- Segment-level sentiment
      segments_json TEXT,               -- [{start_time, end_time, speaker, sentiment, text_preview}]
      
      -- Sentiment trajectory
      opening_sentiment REAL,           -- First 2 minutes
      closing_sentiment REAL,           -- Last 2 minutes
      sentiment_delta REAL,             -- Closing - opening (positive = improved)
      lowest_point_time INTEGER,        -- Time in seconds of lowest sentiment
      highest_point_time INTEGER,       -- Time in seconds of highest sentiment
      
      -- Emotional triggers
      positive_triggers_json TEXT,      -- [{phrase, impact_score, timestamp}]
      negative_triggers_json TEXT,      -- [{phrase, impact_score, timestamp}]
      
      -- Confidence
      analysis_confidence REAL,         -- 0.0 to 1.0
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_sentiment_call ON sentiment_analysis(call_id);
    CREATE INDEX IF NOT EXISTS idx_sentiment_account ON sentiment_analysis(account_id);
    CREATE INDEX IF NOT EXISTS idx_sentiment_rep ON sentiment_analysis(rep_id);
    CREATE INDEX IF NOT EXISTS idx_sentiment_score ON sentiment_analysis(overall_sentiment);
    CREATE INDEX IF NOT EXISTS idx_sentiment_delta ON sentiment_analysis(sentiment_delta);
  `);
  
  // Topic modeling table - for clustering and trend identification
  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_models (
      id TEXT PRIMARY KEY,
      topic_name TEXT NOT NULL,
      topic_description TEXT,
      
      -- Topic composition
      keywords_json TEXT,               -- [{term, weight}, ...] - top terms defining this topic
      representative_quotes_json TEXT,  -- Example quotes representing this topic
      
      -- Prevalence
      total_occurrences INTEGER DEFAULT 0,
      unique_calls INTEGER DEFAULT 0,
      unique_accounts INTEGER DEFAULT 0,
      
      -- Correlation with outcomes
      win_rate_correlation REAL,        -- Correlation with won deals
      risk_correlation REAL,            -- Correlation with churn/risk
      sentiment_avg REAL,               -- Average sentiment when topic discussed
      
      -- Trend data
      period_occurrences_json TEXT,     -- {week1: count1, week2: count2, ...}
      trend_direction TEXT,             -- 'rising', 'stable', 'declining'
      trend_velocity REAL,              -- Rate of change
      
      -- Metadata
      auto_generated INTEGER DEFAULT 1, -- 1 = ML-generated, 0 = manually defined
      active INTEGER DEFAULT 1,
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_topics_name ON topic_models(topic_name);
    CREATE INDEX IF NOT EXISTS idx_topics_trend ON topic_models(trend_direction);
    CREATE INDEX IF NOT EXISTS idx_topics_active ON topic_models(active);
  `);
  
  // Call-topic association table (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_topics (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      relevance_score REAL,             -- 0.0 to 1.0 - how relevant topic is to this call
      mention_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(call_id, topic_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_call_topics_call ON call_topics(call_id);
    CREATE INDEX IF NOT EXISTS idx_call_topics_topic ON call_topics(topic_id);
  `);
  
  // Entity recognition table - people, companies, products mentioned
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,        -- 'person', 'company', 'product', 'legal_term', 'technology'
      entity_name TEXT NOT NULL,
      normalized_name TEXT,             -- Canonical form (e.g., 'Microsoft' for 'MSFT', 'MS')
      
      occurrence_count INTEGER DEFAULT 1,
      mention_contexts_json TEXT,       -- [{call_id, quote, sentiment}]
      associated_accounts_json TEXT,    -- Accounts where this entity is mentioned
      
      -- For competitor tracking
      is_competitor INTEGER DEFAULT 0,
      competitor_sentiment_avg REAL,    -- Sentiment when this competitor is mentioned
      
      first_seen TEXT,
      last_seen TEXT,
      
      UNIQUE(entity_type, normalized_name)
    );
    
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_entities_competitor ON entities(is_competitor);
  `);
  
  // Conversation flow patterns - for understanding successful conversation structures
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_flows (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL,
      
      -- Flow structure
      flow_sequence_json TEXT,          -- [{phase, start_pct, end_pct, speaker_ratio, sentiment}]
      phase_transitions_json TEXT,      -- [{from_phase, to_phase, was_smooth}]
      
      -- Key moments
      objection_moments_json TEXT,      -- [{time_pct, objection, handled_well}]
      discovery_moments_json TEXT,      -- [{time_pct, insight_gained}]
      commitment_moments_json TEXT,     -- [{time_pct, commitment_type, strength}]
      
      -- Pattern matching
      matches_winning_pattern REAL,     -- Similarity to successful calls (0-1)
      pattern_deviations_json TEXT,     -- Where this call differs from ideal
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_flows_call ON conversation_flows(call_id);
    CREATE INDEX IF NOT EXISTS idx_flows_pattern ON conversation_flows(matches_winning_pattern);
  `);
  
  logger.info('Call analysis database schema initialized (with data science tables)');
}

/**
 * Analyze a call recording with diarization
 * @param {object} options - Analysis options
 * @param {string} options.audioBase64 - Base64 encoded audio
 * @param {string} options.accountId - Salesforce Account ID
 * @param {string} options.accountName - Account name
 * @param {string} options.repId - Rep User ID
 * @param {string} options.repName - Rep name
 * @returns {object} Analysis result
 */
async function analyzeCall(options) {
  const correlationId = logger.operationStart('analyzeCall', {
    service: 'callIntelligence',
    accountId: options.accountId,
    repId: options.repId
  });

  try {
    // Step 1: Get diarized transcript
    logger.info('Starting diarization', { correlationId });
    const diarizedTranscript = await getDiarizedTranscript(options.audioBase64);

    // Step 2: Calculate talk time ratios
    const talkTimeMetrics = calculateTalkTimeMetrics(diarizedTranscript);

    // Step 3: Extract coaching metrics using LLM
    logger.info('Extracting coaching metrics', { correlationId });
    const coachingMetrics = await extractCoachingMetrics(diarizedTranscript);

    // Step 4: Calculate overall score
    const overallScore = calculateOverallScore(talkTimeMetrics, coachingMetrics);

    // Step 5: Generate coaching summary
    const coachingSummary = await generateCoachingSummary(
      talkTimeMetrics,
      coachingMetrics,
      options.repName
    );

    // Step 6: Store analysis
    const analysisId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const analysis = {
      id: analysisId,
      callDate: new Date().toISOString(),
      accountId: options.accountId,
      accountName: options.accountName,
      repId: options.repId,
      repName: options.repName,
      durationSeconds: diarizedTranscript.duration || 0,
      talkRatioRep: talkTimeMetrics.repRatio,
      talkRatioCustomer: talkTimeMetrics.customerRatio,
      questionCount: coachingMetrics.totalQuestions,
      openQuestionCount: coachingMetrics.openQuestions,
      closedQuestionCount: coachingMetrics.closedQuestions,
      objectionCount: coachingMetrics.objections.length,
      valueArticulationScore: coachingMetrics.valueScore,
      nextStepClarity: coachingMetrics.nextStepClear ? 1 : 0,
      overallScore,
      coachingSummary,
      keyTopics: coachingMetrics.keyTopics,
      fullAnalysis: {
        transcript: diarizedTranscript,
        metrics: coachingMetrics,
        talkTime: talkTimeMetrics
      }
    };

    storeAnalysis(analysis);

    logger.operationSuccess('analyzeCall', {
      correlationId,
      analysisId,
      overallScore
    });

    return {
      success: true,
      analysisId,
      analysis
    };

  } catch (error) {
    logger.operationError('analyzeCall', error, { correlationId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get diarized transcript (speaker-separated) with intelligent speaker attribution
 * Uses AssemblyAI for diarization, then LLM for speaker identification
 * 
 * @param {string} audioBase64 - Base64 encoded audio
 * @param {Object} context - Context for speaker attribution
 * @param {string} context.repName - Rep's display name
 * @param {string} context.repEmail - Rep's email
 * @param {string[]} context.attendees - List of attendees
 * @param {string} context.accountName - Customer account name
 * @returns {Object} Diarized transcript with speaker attribution
 */
async function getDiarizedTranscript(audioBase64, context = {}) {
  // Check if AssemblyAI is configured
  const assemblyAiKey = process.env.ASSEMBLYAI_API_KEY;
  
  let rawTranscript;
  
  if (assemblyAiKey) {
    // Audio-level diarization (most accurate - 95%+)
    logger.info('[Diarization] Using AssemblyAI for audio-based speaker separation');
    rawTranscript = await assemblyAiDiarization(audioBase64, assemblyAiKey);
  } else {
    // LLM-based pseudo-diarization (uses existing OpenAI key - ~70-80% accuracy)
    logger.info('[Diarization] AssemblyAI not configured, using LLM-based dialogue parsing');
    
    // Step 1: Get Whisper transcription with pause-based pre-segmentation
    rawTranscript = await enhancedWhisperTranscription(audioBase64);
    
    // Step 2: Use LLM to refine speaker assignments based on conversational patterns
    rawTranscript = await llmDialogueParse(rawTranscript, context);
    
    logger.info(`[Diarization] LLM dialogue parsing complete. Method: ${rawTranscript.diarizationMethod}`);
  }
  
  // Apply intelligent speaker attribution if we have diarized segments
  if (rawTranscript.rawSegments && rawTranscript.rawSegments.length > 0) {
    const attributedTranscript = await attributeSpeakers(rawTranscript, context);
    return attributedTranscript;
  }
  
  return rawTranscript;
}

/**
 * Use AssemblyAI for diarization
 */
async function assemblyAiDiarization(audioBase64, apiKey) {
  const fetch = require('node-fetch');
  
  // Convert base64 to buffer for upload
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  
  // Upload audio
  const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'content-type': 'application/octet-stream'
    },
    body: audioBuffer
  });
  
  const { upload_url } = await uploadResponse.json();
  
  // Start transcription with speaker diarization
  const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      speakers_expected: 4
    })
  });
  
  const { id: transcriptId } = await transcriptResponse.json();
  
  // Poll for completion
  let result;
  while (true) {
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'authorization': apiKey }
    });
    result = await pollResponse.json();
    
    if (result.status === 'completed') break;
    if (result.status === 'error') throw new Error(result.error);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Transform to our format with raw speaker labels
  const rawSegments = result.utterances.map(u => ({
    speakerLabel: u.speaker, // Keep raw label (A, B, C, etc.)
    text: u.text,
    startTime: u.start / 1000,
    endTime: u.end / 1000,
    confidence: u.confidence
  }));
  
  return {
    rawSegments,
    segments: rawSegments, // Will be replaced by attributed segments
    duration: result.audio_duration,
    fullText: result.text,
    speakerLabels: [...new Set(rawSegments.map(s => s.speakerLabel))]
  };
}

/**
 * Intelligently attribute speakers in a diarized transcript
 * Uses context and LLM analysis to determine who is the rep vs customer
 * 
 * @param {Object} diarizedTranscript - Raw diarized transcript from AssemblyAI
 * @param {Object} context - Context for speaker attribution
 * @param {string} context.repName - Rep's display name
 * @param {string} context.repEmail - Rep's email
 * @param {string[]} context.attendees - List of attendees
 * @param {string} context.accountName - Customer account name
 * @returns {Object} Transcript with attributed speakers
 */
async function attributeSpeakers(diarizedTranscript, context = {}) {
  if (!diarizedTranscript.rawSegments || diarizedTranscript.rawSegments.length === 0) {
    return diarizedTranscript;
  }

  const speakerLabels = diarizedTranscript.speakerLabels || [];
  
  // If only one speaker, can't determine roles
  if (speakerLabels.length < 2) {
    logger.warn('[SpeakerAttribution] Only one speaker detected, cannot determine roles');
    return {
      ...diarizedTranscript,
      segments: diarizedTranscript.rawSegments.map(s => ({
        ...s,
        speaker: 'unknown',
        speakerName: 'Unknown'
      }))
    };
  }

  // Build context sample from first few segments of each speaker
  const speakerSamples = {};
  for (const label of speakerLabels) {
    const samples = diarizedTranscript.rawSegments
      .filter(s => s.speakerLabel === label)
      .slice(0, 5)
      .map(s => s.text)
      .join(' ');
    speakerSamples[label] = samples.substring(0, 500);
  }

  try {
    // Use LLM to determine speaker roles
    const attributionPrompt = buildSpeakerAttributionPrompt(speakerSamples, context);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SPEAKER_ATTRIBUTION_SYSTEM_PROMPT },
        { role: 'user', content: attributionPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    });

    const attribution = JSON.parse(response.choices[0].message.content);
    
    // Map speaker labels to roles
    const speakerMap = {};
    for (const [label, role] of Object.entries(attribution.speakers || {})) {
      speakerMap[label] = {
        role: role.role || 'unknown',
        name: role.name || (role.role === 'rep' ? (context.repName || 'Eudia Rep') : 'Customer'),
        confidence: role.confidence || 0.5
      };
    }
    
    // Apply attribution to segments
    const attributedSegments = diarizedTranscript.rawSegments.map(segment => ({
      ...segment,
      speaker: speakerMap[segment.speakerLabel]?.role || 'unknown',
      speakerName: speakerMap[segment.speakerLabel]?.name || 'Unknown',
      attributionConfidence: speakerMap[segment.speakerLabel]?.confidence || 0
    }));

    logger.info(`[SpeakerAttribution] Attributed ${speakerLabels.length} speakers: ${JSON.stringify(speakerMap)}`);

    return {
      ...diarizedTranscript,
      segments: attributedSegments,
      speakerMap,
      attributionMethod: 'llm'
    };

  } catch (error) {
    logger.error('[SpeakerAttribution] LLM attribution failed, using heuristic:', error.message);
    
    // Fallback: Use simple heuristics
    // Speaker who talks about "our product", "Eudia", "we offer" is likely the rep
    return heuristicSpeakerAttribution(diarizedTranscript, context);
  }
}

/**
 * System prompt for speaker attribution
 */
const SPEAKER_ATTRIBUTION_SYSTEM_PROMPT = `You are analyzing a sales/customer call to identify which speaker is the sales rep and which is the customer.

The rep typically:
- Introduces themselves and their company (Eudia, an AI legal tech company)
- Uses "we", "our product", "our team", "we can help"
- Asks discovery questions about the customer's needs
- Explains product features (Sigma, AI Contracting, etc.)
- Discusses pricing, implementation, next steps

The customer typically:
- Describes their current challenges and pain points
- Asks questions about the product
- Mentions their team, company, budget constraints
- Uses "we" to refer to their own organization
- Discusses their evaluation process

Return a JSON object with speaker attributions:
{
  "speakers": {
    "A": { "role": "rep|customer", "name": "inferred name or generic", "confidence": 0.0-1.0 },
    "B": { "role": "rep|customer", "name": "inferred name or generic", "confidence": 0.0-1.0 }
  },
  "reasoning": "brief explanation"
}`;

/**
 * Build the attribution prompt with context
 */
function buildSpeakerAttributionPrompt(speakerSamples, context) {
  let prompt = 'Analyze these speaker samples to determine who is the sales rep and who is the customer.\n\n';
  
  if (context.repName) {
    prompt += `Known rep name: ${context.repName}\n`;
  }
  if (context.accountName) {
    prompt += `Customer account: ${context.accountName}\n`;
  }
  if (context.attendees && context.attendees.length > 0) {
    prompt += `Attendees: ${context.attendees.slice(0, 5).join(', ')}\n`;
  }
  
  prompt += '\nSpeaker samples:\n';
  for (const [label, sample] of Object.entries(speakerSamples)) {
    prompt += `\n--- Speaker ${label} ---\n"${sample}"\n`;
  }
  
  return prompt;
}

/**
 * Heuristic-based speaker attribution fallback
 */
function heuristicSpeakerAttribution(diarizedTranscript, context) {
  const repIndicators = [
    'eudia', 'sigma', 'our product', 'our platform', 'we offer', 'we can help',
    'our team', 'ai contracting', 'ai compliance', 'let me show', 'i\'ll walk you through',
    'as your account', 'our solution'
  ];
  
  const speakerScores = {};
  
  for (const segment of diarizedTranscript.rawSegments) {
    const label = segment.speakerLabel;
    if (!speakerScores[label]) {
      speakerScores[label] = { repScore: 0, customerScore: 0, wordCount: 0 };
    }
    
    const lowerText = segment.text.toLowerCase();
    speakerScores[label].wordCount += segment.text.split(/\s+/).length;
    
    for (const indicator of repIndicators) {
      if (lowerText.includes(indicator)) {
        speakerScores[label].repScore += 1;
      }
    }
  }
  
  // Determine which speaker is likely the rep
  const labels = Object.keys(speakerScores);
  let repLabel = labels[0];
  let maxRepScore = speakerScores[labels[0]]?.repScore || 0;
  
  for (const label of labels) {
    if (speakerScores[label].repScore > maxRepScore) {
      maxRepScore = speakerScores[label].repScore;
      repLabel = label;
    }
  }
  
  // Build speaker map
  const speakerMap = {};
  for (const label of labels) {
    speakerMap[label] = {
      role: label === repLabel ? 'rep' : 'customer',
      name: label === repLabel ? (context.repName || 'Eudia Rep') : 'Customer',
      confidence: maxRepScore > 0 ? 0.7 : 0.3
    };
  }
  
  // Apply to segments
  const attributedSegments = diarizedTranscript.rawSegments.map(segment => ({
    ...segment,
    speaker: speakerMap[segment.speakerLabel]?.role || 'unknown',
    speakerName: speakerMap[segment.speakerLabel]?.name || 'Unknown',
    attributionConfidence: speakerMap[segment.speakerLabel]?.confidence || 0
  }));
  
  return {
    ...diarizedTranscript,
    segments: attributedSegments,
    speakerMap,
    attributionMethod: 'heuristic'
  };
}

/**
 * Detect natural speaker breaks based on timing gaps in transcript segments
 * Large pauses (>1.5s) suggest speaker changes in conversational audio
 * 
 * @param {Array} segments - Whisper transcript segments with timing
 * @param {number} pauseThreshold - Seconds of silence to consider a speaker change (default 1.5s)
 * @returns {Array} Segments with tentative speaker labels based on pause detection
 */
function detectNaturalBreaks(segments, pauseThreshold = 1.5) {
  const result = [];
  let speakerIndex = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const prevEnd = i > 0 ? segments[i - 1].end : 0;
    const gap = segment.start - prevEnd;
    
    // Large pause suggests speaker change
    if (gap > pauseThreshold && i > 0) {
      speakerIndex++;
    }
    
    result.push({
      text: segment.text,
      startTime: segment.start,
      endTime: segment.end,
      speakerLabel: `Speaker_${speakerIndex % 2}`,  // Alternating for 2-party call
      pauseBeforeMs: Math.round(gap * 1000),
      segmentIndex: i
    });
  }
  
  return result;
}

/**
 * Enhanced Whisper transcription with pause-based speaker segmentation
 * Used as fallback when AssemblyAI is not configured
 * Returns segments suitable for LLM-based dialogue parsing
 * 
 * @param {string} audioBase64 - Base64 encoded audio
 * @returns {Object} Transcript with pre-segmented speaker breaks
 */
async function enhancedWhisperTranscription(audioBase64) {
  const FormData = require('form-data');
  const fetch = require('node-fetch');
  
  // Convert base64 to buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  
  // Create form data for Whisper API
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: 'audio/webm'
  });
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  // Pre-segment based on natural pauses
  const preSegmented = detectNaturalBreaks(result.segments || []);
  
  // Extract unique speaker labels for attribution
  const speakerLabels = [...new Set(preSegmented.map(s => s.speakerLabel))];
  
  logger.info(`[EnhancedWhisper] Transcribed ${result.duration}s audio, detected ${speakerLabels.length} potential speakers via pause analysis`);
  
  return {
    rawSegments: preSegmented,
    speakerLabels,
    duration: result.duration,
    fullText: result.text,
    requiresLlmDiarization: true,
    diarizationMethod: 'pause-detection'
  };
}

/**
 * System prompt for LLM-based dialogue parsing
 * Used to infer speaker changes when audio-based diarization is not available
 */
const LLM_DIALOGUE_PARSE_PROMPT = `You are an expert at analyzing sales and customer success call transcripts.

Your task is to identify speaker changes in a transcript that has been pre-segmented by natural pauses. 
The transcript comes from a call between a Eudia sales rep and a customer.

Eudia is a legal AI startup that offers:
- Sigma: AI-powered contract analysis
- AI Contracting: Automated contract generation
- AI Compliance: Regulatory compliance automation

For each segment, determine the most likely speaker based on:

1. **Dialogue Patterns**:
   - "Thank you for joining", "Thanks for taking the time" = likely the meeting host (usually rep)
   - "Tell me about...", "What challenges are you facing?" = discovery questions (rep)
   - "We're looking for...", "Our team needs..." = describing needs (customer)

2. **Topic Indicators**:
   - "Our platform", "Eudia", "we offer", "our product", "our team at Eudia" = rep
   - "Our company", "our legal team", "we currently use" = customer referring to their org
   
3. **Conversational Flow**:
   - Questions about product features = customer
   - Answers about how the product works = rep
   - Pain point descriptions = customer
   - Value proposition statements = rep

4. **Turn-Taking**:
   - Segments with long pauses before them often indicate speaker changes
   - Short acknowledgments ("Right", "Okay", "I see") can be either speaker

Return a JSON object mapping each segment index to its speaker:
{
  "segments": [
    { "index": 0, "speaker": "rep", "confidence": 0.9 },
    { "index": 1, "speaker": "customer", "confidence": 0.85 },
    ...
  ],
  "reasoning": "Brief explanation of key patterns observed"
}`;

/**
 * LLM-based dialogue parsing to infer speaker labels
 * Analyzes conversational patterns to determine who is speaking
 * 
 * @param {Object} transcript - Pre-segmented transcript from enhancedWhisperTranscription
 * @param {Object} context - Context for speaker identification
 * @returns {Object} Transcript with LLM-inferred speaker labels
 */
async function llmDialogueParse(transcript, context = {}) {
  if (!transcript.rawSegments || transcript.rawSegments.length === 0) {
    logger.warn('[LLMDialogueParse] No segments to parse');
    return transcript;
  }

  // Build the user prompt with transcript and context
  let userPrompt = 'Analyze this call transcript and identify the speaker for each segment.\n\n';
  
  // Add context
  userPrompt += '## Context\n';
  if (context.repName) {
    userPrompt += `- Eudia Rep: ${context.repName}\n`;
  }
  if (context.repEmail) {
    userPrompt += `- Rep Email: ${context.repEmail}\n`;
  }
  if (context.accountName) {
    userPrompt += `- Customer Account: ${context.accountName}\n`;
  }
  if (context.attendees && context.attendees.length > 0) {
    userPrompt += `- Attendees: ${context.attendees.slice(0, 5).join(', ')}\n`;
  }
  
  // Add segments with timing info
  userPrompt += '\n## Transcript Segments\n';
  for (const segment of transcript.rawSegments) {
    const pauseInfo = segment.pauseBeforeMs > 1000 ? ` [${(segment.pauseBeforeMs / 1000).toFixed(1)}s pause]` : '';
    userPrompt += `\n[${segment.segmentIndex}]${pauseInfo} (${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s):\n"${segment.text.trim()}"\n`;
  }

  try {
    logger.info(`[LLMDialogueParse] Analyzing ${transcript.rawSegments.length} segments with GPT-4o-mini`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: LLM_DIALOGUE_PARSE_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('Invalid LLM response format');
    }

    // Build speaker map from LLM results
    const speakerAssignments = {};
    for (const seg of parsed.segments) {
      speakerAssignments[seg.index] = {
        speaker: seg.speaker,
        confidence: seg.confidence || 0.7
      };
    }

    // Apply LLM-inferred labels to segments
    const refinedSegments = transcript.rawSegments.map(segment => {
      const assignment = speakerAssignments[segment.segmentIndex];
      return {
        ...segment,
        speakerLabel: assignment ? 
          (assignment.speaker === 'rep' ? 'Speaker_0' : 'Speaker_1') : 
          segment.speakerLabel,
        llmSpeaker: assignment?.speaker || 'unknown',
        llmConfidence: assignment?.confidence || 0
      };
    });

    // Recalculate speaker labels based on LLM assignments
    const repLabel = 'Speaker_0';
    const customerLabel = 'Speaker_1';

    logger.info(`[LLMDialogueParse] Successfully parsed dialogue. Reasoning: ${parsed.reasoning || 'N/A'}`);

    return {
      ...transcript,
      rawSegments: refinedSegments,
      speakerLabels: [repLabel, customerLabel],
      diarizationMethod: 'llm-dialogue-parse',
      llmReasoning: parsed.reasoning
    };

  } catch (error) {
    logger.error('[LLMDialogueParse] LLM parsing failed, keeping pause-based segmentation:', error.message);
    
    // Return original transcript with pause-based labels
    return {
      ...transcript,
      diarizationMethod: 'pause-detection-fallback'
    };
  }
}

/**
 * Basic Whisper transcription without diarization (legacy fallback)
 */
async function basicWhisperTranscription(audioBase64) {
  const response = await openai.audio.transcriptions.create({
    file: Buffer.from(audioBase64, 'base64'),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  });
  
  return {
    segments: response.segments.map(s => ({
      speaker: 'unknown',
      text: s.text,
      startTime: s.start,
      endTime: s.end
    })),
    duration: response.duration,
    fullText: response.text
  };
}

/**
 * Calculate talk time metrics
 */
function calculateTalkTimeMetrics(transcript) {
  let repTime = 0;
  let customerTime = 0;
  
  for (const segment of transcript.segments) {
    const duration = segment.endTime - segment.startTime;
    
    if (segment.speaker === 'rep') {
      repTime += duration;
    } else if (segment.speaker === 'customer') {
      customerTime += duration;
    }
  }
  
  const totalTime = repTime + customerTime || 1;
  
  return {
    repTime,
    customerTime,
    totalTime,
    repRatio: repTime / totalTime,
    customerRatio: customerTime / totalTime,
    isHealthyRatio: (repTime / totalTime) >= 0.35 && (repTime / totalTime) <= 0.55
  };
}

/**
 * Extract coaching metrics using LLM
 */
async function extractCoachingMetrics(transcript) {
  const systemPrompt = `You are a sales call coach analyzing a call transcript. Extract the following metrics:

Return a JSON object with:
{
  "totalQuestions": number,
  "openQuestions": number,  // Questions starting with who, what, when, where, why, how
  "closedQuestions": number,
  "objections": [{"objection": "text", "handled": true/false}],
  "valueStatements": ["statement1", "statement2"],
  "valueScore": 0-10,  // How well did rep articulate value?
  "nextStepClear": true/false,  // Was a clear next step established?
  "nextStep": "description of next step",
  "keyTopics": ["topic1", "topic2"],
  "competitorMentions": ["competitor1"],
  "positiveSignals": ["signal1"],
  "concerns": ["concern1"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Transcript:\n${transcript.fullText}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 1000
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Calculate overall score (0-100)
 */
function calculateOverallScore(talkTime, coaching) {
  let score = 0;
  
  // Talk time (20 points) - optimal is 40-50% rep
  if (talkTime.isHealthyRatio) {
    score += 20;
  } else if (talkTime.repRatio < 0.3 || talkTime.repRatio > 0.6) {
    score += 5;
  } else {
    score += 12;
  }
  
  // Question quality (20 points)
  const openRatio = coaching.openQuestions / (coaching.totalQuestions || 1);
  score += Math.min(20, openRatio * 30);
  
  // Value articulation (20 points)
  score += (coaching.valueScore / 10) * 20;
  
  // Next step clarity (20 points)
  score += coaching.nextStepClear ? 20 : 0;
  
  // Objection handling (20 points)
  const handledObjections = coaching.objections?.filter(o => o.handled).length || 0;
  const totalObjections = coaching.objections?.length || 0;
  if (totalObjections > 0) {
    score += (handledObjections / totalObjections) * 20;
  } else {
    score += 15; // No objections = partial credit
  }
  
  return Math.round(score);
}

/**
 * Generate coaching summary
 */
async function generateCoachingSummary(talkTime, coaching, repName) {
  const systemPrompt = `You are a sales manager providing brief coaching feedback. Be specific and actionable. Max 3 bullet points.`;
  
  const userPrompt = `Metrics for ${repName}:
- Talk ratio: ${Math.round(talkTime.repRatio * 100)}% rep / ${Math.round(talkTime.customerRatio * 100)}% customer
- Questions asked: ${coaching.totalQuestions} (${coaching.openQuestions} open, ${coaching.closedQuestions} closed)
- Value score: ${coaching.valueScore}/10
- Next step clear: ${coaching.nextStepClear ? 'Yes' : 'No'}
- Objections: ${coaching.objections?.length || 0} (${coaching.objections?.filter(o => o.handled).length || 0} handled)

Provide 3 specific coaching points.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  return response.choices[0].message.content;
}

/**
 * Store analysis in database
 */
/**
 * Store call analysis with all metrics (Sales and CS)
 * @param {Object} analysis - Complete analysis object
 */
function storeAnalysis(analysis) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO call_analysis (
      id, call_date, account_id, account_name, rep_id, rep_name,
      duration_seconds, talk_ratio_rep, talk_ratio_customer,
      question_count, open_question_count, closed_question_count,
      objection_count, value_articulation_score, next_step_clarity,
      overall_score, coaching_summary, key_topics, full_analysis_json,
      -- CS-specific fields
      pain_points_json, feature_requests_json, adoption_blockers_json,
      sentiment_score, escalation_risk, health_indicators_json,
      -- Additional analytics
      call_type, user_group, competitor_mentions_json, positive_signals_json,
      entities_json, keywords_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    analysis.id,
    analysis.callDate,
    analysis.accountId,
    analysis.accountName,
    analysis.repId,
    analysis.repName,
    analysis.durationSeconds,
    analysis.talkRatioRep,
    analysis.talkRatioCustomer,
    analysis.questionCount,
    analysis.openQuestionCount,
    analysis.closedQuestionCount,
    analysis.objectionCount,
    analysis.valueArticulationScore,
    analysis.nextStepClarity,
    analysis.overallScore,
    analysis.coachingSummary,
    JSON.stringify(analysis.keyTopics),
    JSON.stringify(analysis.fullAnalysis),
    // CS-specific fields
    JSON.stringify(analysis.painPoints || null),
    JSON.stringify(analysis.featureRequests || null),
    JSON.stringify(analysis.adoptionBlockers || null),
    analysis.sentimentScore || null,
    analysis.escalationRisk || 0,
    JSON.stringify(analysis.healthIndicators || null),
    // Additional analytics
    analysis.callType || 'sales',
    analysis.userGroup || null,
    JSON.stringify(analysis.competitorMentions || null),
    JSON.stringify(analysis.positiveSignals || null),
    JSON.stringify(analysis.entities || null),
    JSON.stringify(analysis.keywords || null)
  );
}

/**
 * Get rep coaching insights (aggregated)
 */
function getRepCoachingInsights(repId, days = 30) {
  const stmt = db.prepare(`
    SELECT 
      AVG(overall_score) as avg_score,
      AVG(talk_ratio_rep) as avg_talk_ratio,
      AVG(question_count) as avg_questions,
      AVG(open_question_count) as avg_open_questions,
      SUM(objection_count) as total_objections,
      AVG(value_articulation_score) as avg_value_score,
      AVG(next_step_clarity) as next_step_rate,
      COUNT(*) as call_count
    FROM call_analysis
    WHERE rep_id = ?
    AND call_date >= datetime('now', ?)
  `);
  
  return stmt.get(repId, `-${days} days`);
}

/**
 * Get team coaching leaderboard
 */
function getTeamLeaderboard(days = 30) {
  const stmt = db.prepare(`
    SELECT 
      rep_id,
      rep_name,
      AVG(overall_score) as avg_score,
      COUNT(*) as call_count,
      AVG(value_articulation_score) as avg_value_score
    FROM call_analysis
    WHERE call_date >= datetime('now', ?)
    GROUP BY rep_id, rep_name
    ORDER BY avg_score DESC
  `);
  
  return stmt.all(`-${days} days`);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA SCIENCE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store or update a keyword in the global keywords table
 * @param {object} keyword - Keyword data
 */
function storeKeyword(keyword) {
  const { term, category, sentiment, callId, accountId, repEmail, context } = keyword;
  const id = `kw-${term.toLowerCase().replace(/\s+/g, '-')}`;
  
  // Check if keyword exists
  const existing = db.prepare('SELECT * FROM keywords WHERE term = ?').get(term.toLowerCase());
  
  if (existing) {
    // Update existing keyword
    const updates = {
      occurrence_count: existing.occurrence_count + 1,
      positive_sentiment_count: existing.positive_sentiment_count + (sentiment > 0.3 ? 1 : 0),
      negative_sentiment_count: existing.negative_sentiment_count + (sentiment < -0.3 ? 1 : 0),
      neutral_sentiment_count: existing.neutral_sentiment_count + (sentiment >= -0.3 && sentiment <= 0.3 ? 1 : 0),
      last_seen: new Date().toISOString()
    };
    
    // Recalculate average sentiment
    const totalSentimentCalls = updates.positive_sentiment_count + updates.negative_sentiment_count + updates.neutral_sentiment_count;
    updates.avg_sentiment = (existing.avg_sentiment * (totalSentimentCalls - 1) + sentiment) / totalSentimentCalls;
    
    // Update associated accounts and reps
    let accounts = JSON.parse(existing.associated_accounts_json || '[]');
    let reps = JSON.parse(existing.associated_reps_json || '[]');
    let contexts = JSON.parse(existing.example_contexts_json || '[]');
    
    if (accountId && !accounts.includes(accountId)) accounts.push(accountId);
    if (repEmail && !reps.includes(repEmail)) reps.push(repEmail);
    if (context && contexts.length < 5) {
      contexts.push({ quote: context.substring(0, 200), call_id: callId, date: new Date().toISOString() });
    }
    
    db.prepare(`
      UPDATE keywords SET
        occurrence_count = ?,
        positive_sentiment_count = ?,
        negative_sentiment_count = ?,
        neutral_sentiment_count = ?,
        avg_sentiment = ?,
        associated_accounts_json = ?,
        associated_reps_json = ?,
        example_contexts_json = ?,
        last_seen = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE term = ?
    `).run(
      updates.occurrence_count,
      updates.positive_sentiment_count,
      updates.negative_sentiment_count,
      updates.neutral_sentiment_count,
      updates.avg_sentiment,
      JSON.stringify(accounts),
      JSON.stringify(reps),
      JSON.stringify(contexts),
      updates.last_seen,
      term.toLowerCase()
    );
  } else {
    // Insert new keyword
    db.prepare(`
      INSERT INTO keywords (
        id, term, category, occurrence_count,
        positive_sentiment_count, negative_sentiment_count, neutral_sentiment_count,
        avg_sentiment, associated_accounts_json, associated_reps_json,
        example_contexts_json, first_seen, last_seen
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      term.toLowerCase(),
      category || 'general',
      sentiment > 0.3 ? 1 : 0,
      sentiment < -0.3 ? 1 : 0,
      sentiment >= -0.3 && sentiment <= 0.3 ? 1 : 0,
      sentiment,
      JSON.stringify(accountId ? [accountId] : []),
      JSON.stringify(repEmail ? [repEmail] : []),
      JSON.stringify(context ? [{ quote: context.substring(0, 200), call_id: callId, date: new Date().toISOString() }] : [])
    );
  }
}

/**
 * Store detailed sentiment analysis for a call
 * @param {object} sentimentData - Sentiment analysis data
 */
function storeSentimentAnalysis(sentimentData) {
  const {
    callId, accountId, repId, callDate,
    overallSentiment, sentimentLabel, segments,
    openingSentiment, closingSentiment,
    lowestPointTime, highestPointTime,
    positiveTriggers, negativeTriggers,
    confidence
  } = sentimentData;
  
  const id = `sentiment-${callId}`;
  const sentimentDelta = closingSentiment - openingSentiment;
  
  db.prepare(`
    INSERT OR REPLACE INTO sentiment_analysis (
      id, call_id, account_id, rep_id, call_date,
      overall_sentiment, sentiment_label, segments_json,
      opening_sentiment, closing_sentiment, sentiment_delta,
      lowest_point_time, highest_point_time,
      positive_triggers_json, negative_triggers_json,
      analysis_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, callId, accountId, repId, callDate,
    overallSentiment, sentimentLabel, JSON.stringify(segments || []),
    openingSentiment, closingSentiment, sentimentDelta,
    lowestPointTime, highestPointTime,
    JSON.stringify(positiveTriggers || []), JSON.stringify(negativeTriggers || []),
    confidence
  );
  
  return { id, sentimentDelta };
}

/**
 * Store or update a conversation pattern
 * @param {object} pattern - Pattern data
 */
function storePattern(pattern) {
  const { type, text, exampleQuote, outcomeCorrelation } = pattern;
  const normalizedText = text.toLowerCase().trim();
  const id = `pattern-${type}-${normalizedText.substring(0, 50).replace(/\s+/g, '-')}`;
  
  const existing = db.prepare('SELECT * FROM conversation_patterns WHERE pattern_type = ? AND pattern_text = ?')
    .get(type, normalizedText);
  
  if (existing) {
    let examples = JSON.parse(existing.example_quotes_json || '[]');
    if (exampleQuote && examples.length < 10) {
      examples.push(exampleQuote.substring(0, 300));
    }
    
    // Update with weighted correlation average
    const newCount = existing.occurrence_count + 1;
    const newCorrelation = outcomeCorrelation !== undefined
      ? (existing.success_correlation * existing.occurrence_count + outcomeCorrelation) / newCount
      : existing.success_correlation;
    
    db.prepare(`
      UPDATE conversation_patterns SET
        occurrence_count = ?,
        success_correlation = ?,
        example_quotes_json = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newCount, newCorrelation, JSON.stringify(examples), existing.id);
  } else {
    db.prepare(`
      INSERT INTO conversation_patterns (
        id, pattern_type, pattern_text, occurrence_count,
        success_correlation, example_quotes_json, first_seen
      ) VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id, type, normalizedText,
      outcomeCorrelation || 0,
      JSON.stringify(exampleQuote ? [exampleQuote.substring(0, 300)] : [])
    );
  }
}

/**
 * Store entity (person, company, product) mention
 * @param {object} entity - Entity data
 */
function storeEntity(entity) {
  const { type, name, callId, context, sentiment, accountId, isCompetitor } = entity;
  const normalizedName = name.toLowerCase().trim();
  const id = `entity-${type}-${normalizedName.replace(/\s+/g, '-')}`;
  
  const existing = db.prepare('SELECT * FROM entities WHERE entity_type = ? AND normalized_name = ?')
    .get(type, normalizedName);
  
  if (existing) {
    let contexts = JSON.parse(existing.mention_contexts_json || '[]');
    let accounts = JSON.parse(existing.associated_accounts_json || '[]');
    
    if (context && contexts.length < 10) {
      contexts.push({ call_id: callId, quote: context.substring(0, 200), sentiment });
    }
    if (accountId && !accounts.includes(accountId)) {
      accounts.push(accountId);
    }
    
    // Update competitor sentiment average
    let newCompetitorSentiment = existing.competitor_sentiment_avg;
    if (isCompetitor && sentiment !== undefined) {
      const prevTotal = existing.occurrence_count * (existing.competitor_sentiment_avg || 0);
      newCompetitorSentiment = (prevTotal + sentiment) / (existing.occurrence_count + 1);
    }
    
    db.prepare(`
      UPDATE entities SET
        occurrence_count = occurrence_count + 1,
        mention_contexts_json = ?,
        associated_accounts_json = ?,
        is_competitor = ?,
        competitor_sentiment_avg = ?,
        last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(contexts),
      JSON.stringify(accounts),
      isCompetitor ? 1 : existing.is_competitor,
      newCompetitorSentiment,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO entities (
        id, entity_type, entity_name, normalized_name,
        occurrence_count, mention_contexts_json, associated_accounts_json,
        is_competitor, competitor_sentiment_avg, first_seen, last_seen
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id, type, name, normalizedName,
      JSON.stringify(context ? [{ call_id: callId, quote: context.substring(0, 200), sentiment }] : []),
      JSON.stringify(accountId ? [accountId] : []),
      isCompetitor ? 1 : 0,
      isCompetitor ? sentiment : null
    );
  }
}

/**
 * Store conversation flow analysis
 * @param {object} flowData - Flow analysis data
 */
function storeConversationFlow(flowData) {
  const {
    callId, flowSequence, phaseTransitions,
    objectionMoments, discoveryMoments, commitmentMoments,
    matchesWinningPattern, patternDeviations
  } = flowData;
  
  const id = `flow-${callId}`;
  
  db.prepare(`
    INSERT OR REPLACE INTO conversation_flows (
      id, call_id, flow_sequence_json, phase_transitions_json,
      objection_moments_json, discovery_moments_json, commitment_moments_json,
      matches_winning_pattern, pattern_deviations_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, callId,
    JSON.stringify(flowSequence || []),
    JSON.stringify(phaseTransitions || []),
    JSON.stringify(objectionMoments || []),
    JSON.stringify(discoveryMoments || []),
    JSON.stringify(commitmentMoments || []),
    matchesWinningPattern || 0,
    JSON.stringify(patternDeviations || [])
  );
}

/**
 * Get top trending keywords
 * @param {number} days - Lookback period
 * @param {number} limit - Max results
 * @returns {Array} Trending keywords
 */
function getTrendingKeywords(days = 30, limit = 20) {
  const stmt = db.prepare(`
    SELECT 
      term, category, occurrence_count, avg_sentiment,
      positive_sentiment_count, negative_sentiment_count
    FROM keywords
    WHERE last_seen >= datetime('now', ?)
    ORDER BY occurrence_count DESC
    LIMIT ?
  `);
  
  return stmt.all(`-${days} days`, limit);
}

/**
 * Get top patterns by type
 * @param {string} patternType - Pattern type to filter
 * @param {number} limit - Max results
 * @returns {Array} Patterns
 */
function getTopPatterns(patternType, limit = 10) {
  const stmt = db.prepare(`
    SELECT 
      pattern_text, occurrence_count, success_correlation,
      example_quotes_json
    FROM conversation_patterns
    WHERE pattern_type = ?
    ORDER BY occurrence_count DESC
    LIMIT ?
  `);
  
  return stmt.all(patternType, limit).map(row => ({
    ...row,
    exampleQuotes: JSON.parse(row.example_quotes_json || '[]')
  }));
}

/**
 * Get competitor mentions and sentiment
 * @param {number} days - Lookback period
 * @returns {Array} Competitor data
 */
function getCompetitorInsights(days = 90) {
  const stmt = db.prepare(`
    SELECT 
      entity_name, normalized_name, occurrence_count,
      competitor_sentiment_avg, associated_accounts_json
    FROM entities
    WHERE is_competitor = 1
    AND last_seen >= datetime('now', ?)
    ORDER BY occurrence_count DESC
  `);
  
  return stmt.all(`-${days} days`).map(row => ({
    ...row,
    associatedAccounts: JSON.parse(row.associated_accounts_json || '[]')
  }));
}

/**
 * Get sentiment trends by rep
 * @param {string} repId - Rep identifier
 * @param {number} days - Lookback period
 * @returns {object} Sentiment trends
 */
function getRepSentimentTrends(repId, days = 30) {
  const stmt = db.prepare(`
    SELECT 
      AVG(overall_sentiment) as avg_sentiment,
      AVG(sentiment_delta) as avg_improvement,
      COUNT(CASE WHEN sentiment_delta > 0 THEN 1 END) as improved_calls,
      COUNT(CASE WHEN sentiment_delta < 0 THEN 1 END) as declined_calls,
      COUNT(*) as total_calls
    FROM sentiment_analysis
    WHERE rep_id = ?
    AND call_date >= datetime('now', ?)
  `);
  
  return stmt.get(repId, `-${days} days`);
}

module.exports = {
  analyzeCall,
  getDiarizedTranscript,
  attributeSpeakers,
  extractCoachingMetrics,
  calculateTalkTimeMetrics,
  getRepCoachingInsights,
  getTeamLeaderboard,
  storeAnalysis,
  formatDiarizedTranscript,
  // LLM-based diarization functions (fallback when AssemblyAI not configured)
  enhancedWhisperTranscription,
  llmDialogueParse,
  detectNaturalBreaks,
  // Data science functions
  storeKeyword,
  storeSentimentAnalysis,
  storePattern,
  storeEntity,
  storeConversationFlow,
  getTrendingKeywords,
  getTopPatterns,
  getCompetitorInsights,
  getRepSentimentTrends
};

/**
 * Format diarized transcript for display in notes
 * Creates a readable conversation format with speaker names
 * 
 * @param {Object} diarizedTranscript - Attributed diarized transcript
 * @param {string} repName - Override name for the rep
 * @returns {string} Formatted transcript
 */
function formatDiarizedTranscript(diarizedTranscript, repName = null) {
  if (!diarizedTranscript || !diarizedTranscript.segments) {
    return diarizedTranscript?.fullText || '';
  }
  
  const lines = [];
  let lastSpeaker = null;
  let currentBlock = [];
  
  for (const segment of diarizedTranscript.segments) {
    const speakerName = segment.speaker === 'rep' 
      ? (repName || segment.speakerName || 'Eudia Rep')
      : (segment.speakerName || 'Customer');
    
    // Combine consecutive segments from same speaker
    if (segment.speakerLabel === lastSpeaker) {
      currentBlock.push(segment.text);
    } else {
      // Output previous block
      if (currentBlock.length > 0 && lastSpeaker !== null) {
        const prevSegment = diarizedTranscript.segments.find(s => s.speakerLabel === lastSpeaker);
        const prevSpeakerName = prevSegment?.speaker === 'rep'
          ? (repName || prevSegment?.speakerName || 'Eudia Rep')
          : (prevSegment?.speakerName || 'Customer');
        const suffix = prevSegment?.speaker === 'rep' ? ' (Eudia)' : '';
        lines.push(`**${prevSpeakerName}${suffix}:** ${currentBlock.join(' ')}`);
      }
      
      lastSpeaker = segment.speakerLabel;
      currentBlock = [segment.text];
    }
  }
  
  // Output last block
  if (currentBlock.length > 0) {
    const lastSegment = diarizedTranscript.segments.find(s => s.speakerLabel === lastSpeaker);
    const lastSpeakerName = lastSegment?.speaker === 'rep'
      ? (repName || lastSegment?.speakerName || 'Eudia Rep')
      : (lastSegment?.speakerName || 'Customer');
    const suffix = lastSegment?.speaker === 'rep' ? ' (Eudia)' : '';
    lines.push(`**${lastSpeakerName}${suffix}:** ${currentBlock.join(' ')}`);
  }
  
  return lines.join('\n\n');
}
