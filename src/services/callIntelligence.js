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
 */
function initializeDatabase() {
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_call_analysis_rep ON call_analysis(rep_id);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_account ON call_analysis(account_id);
    CREATE INDEX IF NOT EXISTS idx_call_analysis_date ON call_analysis(call_date);
  `);
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
 * Get diarized transcript (speaker-separated)
 * Uses AssemblyAI or falls back to simple Whisper
 */
async function getDiarizedTranscript(audioBase64) {
  // Check if AssemblyAI is configured
  const assemblyAiKey = process.env.ASSEMBLYAI_API_KEY;
  
  if (assemblyAiKey) {
    return await assemblyAiDiarization(audioBase64, assemblyAiKey);
  }
  
  // Fallback: Use Whisper without diarization (limited analysis)
  logger.warn('AssemblyAI not configured, using non-diarized transcription');
  return await basicWhisperTranscription(audioBase64);
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
      speakers_expected: 2
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
  
  // Transform to our format
  const segments = result.utterances.map(u => ({
    speaker: u.speaker === 'A' ? 'rep' : 'customer',
    text: u.text,
    startTime: u.start / 1000,
    endTime: u.end / 1000,
    confidence: u.confidence
  }));
  
  return {
    segments,
    duration: result.audio_duration,
    fullText: result.text
  };
}

/**
 * Basic Whisper transcription without diarization
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
function storeAnalysis(analysis) {
  const stmt = db.prepare(`
    INSERT INTO call_analysis (
      id, call_date, account_id, account_name, rep_id, rep_name,
      duration_seconds, talk_ratio_rep, talk_ratio_customer,
      question_count, open_question_count, closed_question_count,
      objection_count, value_articulation_score, next_step_clarity,
      overall_score, coaching_summary, key_topics, full_analysis_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(analysis.fullAnalysis)
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

module.exports = {
  analyzeCall,
  getDiarizedTranscript,
  extractCoachingMetrics,
  calculateTalkTimeMetrics,
  getRepCoachingInsights,
  getTeamLeaderboard,
  storeAnalysis
};
