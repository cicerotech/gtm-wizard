/**
 * Meeting Classifier Service
 * AI-powered meeting type classification for sales velocity tracking
 * 
 * Uses a multi-signal approach:
 * 1. High-confidence pattern matching (fast, no API call)
 * 2. Claude LLM fallback for ambiguous cases
 * 3. Contextual signals (sequence, stage, attendees)
 */

const logger = require('../utils/logger');
const { classifyMeetingByPattern, MEETING_TYPES } = require('./calendarService');

// Claude API for LLM classification
let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  logger.warn('Anthropic SDK not available for meeting classification');
}

// LLM Classification prompt
const CLASSIFICATION_PROMPT = `You are a sales meeting classifier for a B2B legal tech company (Eudia). 
Classify this meeting into one of the following types based on subject, attendees, and context.

MEETING TYPES:
- intro: First substantive meeting, CLO engagement, company introduction, "meet Eudia"
- cab: Customer Advisory Board discussion, memorandum, strategic partnership agreement
- demo: Product demonstration, platform walkthrough, use case show, Sigma/Contracts demo
- discovery: Deep dive on requirements, use case identification, pain point discussion
- scoping: Pricing discussion, pilot planning, SOW review, assessment
- compliance: InfoSec review, legal review, security questionnaire, DPA, SOC2
- proposal: Contract review, MSA/SOW walkthrough, redlining
- negotiation: Final terms, pricing negotiation, executive approval
- followup: General sync, check-in, status update, touchpoint

CONTEXT:
- Subject: "{subject}"
- Account: {accountName}
- Attendees: {attendees}
- Meeting # for this account: {sequenceNumber}
- Days since last meeting: {daysSinceLast}
- Current Opportunity Stage: {opportunityStage}
- Previous meeting types: {previousTypes}

Respond with ONLY valid JSON (no markdown):
{"type": "intro|cab|demo|discovery|scoping|compliance|proposal|negotiation|followup", "confidence": 0.0-1.0, "reasoning": "one sentence"}`;

// Cache for LLM classifications to avoid repeated calls
const classificationCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Classify meeting using LLM (Claude)
 * Only called when pattern matching fails or has low confidence
 */
async function classifyMeetingWithLLM(subject, context = {}) {
  const {
    accountName = 'Unknown',
    attendees = [],
    sequenceNumber = null,
    daysSinceLast = null,
    opportunityStage = null,
    previousTypes = []
  } = context;

  // Check cache first
  const cacheKey = `${subject}_${accountName}_${sequenceNumber}`;
  const cached = classificationCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    logger.debug(`[MeetingClassifier] Cache hit for: ${subject}`);
    return cached.result;
  }

  if (!Anthropic || !process.env.ANTHROPIC_API_KEY) {
    logger.warn('[MeetingClassifier] Anthropic API not available, using default classification');
    return {
      type: 'followup',
      confidence: 0.40,
      method: 'default_no_llm',
      reasoning: 'LLM not available'
    };
  }

  try {
    const anthropic = new Anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Format attendees for prompt
    const attendeeStr = attendees.length > 0
      ? attendees.map(a => `${a.name || 'Unknown'} (${a.email || 'no email'})`).join(', ')
      : 'None provided';

    const prompt = CLASSIFICATION_PROMPT
      .replace('{subject}', subject || 'No subject')
      .replace('{accountName}', accountName)
      .replace('{attendees}', attendeeStr)
      .replace('{sequenceNumber}', sequenceNumber ? `#${sequenceNumber}` : 'Unknown')
      .replace('{daysSinceLast}', daysSinceLast !== null ? `${daysSinceLast} days` : 'Unknown')
      .replace('{opportunityStage}', opportunityStage || 'Unknown')
      .replace('{previousTypes}', previousTypes.length > 0 ? previousTypes.join(', ') : 'None');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Fast, cheap model for classification
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = response.content[0]?.text || '';
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate type
    const validTypes = Object.keys(MEETING_TYPES);
    if (!validTypes.includes(parsed.type)) {
      parsed.type = 'followup';
      parsed.confidence = 0.50;
    }

    const result = {
      type: parsed.type,
      confidence: Math.min(parsed.confidence || 0.70, 0.95), // Cap at 0.95
      method: 'llm',
      reasoning: parsed.reasoning || 'LLM classification'
    };

    // Cache the result
    classificationCache.set(cacheKey, { result, timestamp: Date.now() });

    logger.info(`[MeetingClassifier] LLM classified "${subject}" as ${result.type} (${(result.confidence * 100).toFixed(0)}%)`);

    return result;

  } catch (error) {
    logger.error(`[MeetingClassifier] LLM classification failed:`, error.message);
    return {
      type: 'followup',
      confidence: 0.40,
      method: 'llm_error',
      reasoning: `LLM error: ${error.message}`
    };
  }
}

/**
 * Full classification pipeline
 * 1. Try pattern matching (fast)
 * 2. If low confidence or no match, enrich with context
 * 3. If still uncertain, use LLM
 */
async function classifyMeetingFull(subject, context = {}) {
  const { useLLM = true } = context;

  // Step 1: Pattern matching
  const patternResult = classifyMeetingByPattern(subject);
  
  if (patternResult && patternResult.confidence >= 0.85) {
    // High confidence pattern match - use it
    logger.debug(`[MeetingClassifier] High-confidence pattern: ${patternResult.type}`);
    return patternResult;
  }

  // Step 2: Contextual enhancement
  const { sequenceNumber, opportunityStage, attendees } = context;
  
  // Boost intro confidence if it's the first meeting
  if (patternResult?.type === 'intro' && sequenceNumber === 1) {
    return { ...patternResult, confidence: 0.95, method: 'pattern+sequence' };
  }
  
  // If we have a pattern match with decent confidence, use it
  if (patternResult && patternResult.confidence >= 0.70) {
    return patternResult;
  }

  // Step 3: LLM fallback for ambiguous cases
  if (useLLM) {
    const llmResult = await classifyMeetingWithLLM(subject, context);
    return llmResult;
  }

  // Fallback to pattern result or default
  return patternResult || {
    type: 'followup',
    confidence: 0.50,
    method: 'default',
    reasoning: 'No classification signals'
  };
}

/**
 * Batch classify multiple meetings efficiently
 * Uses pattern matching for most, LLM only for uncertain ones
 */
async function classifyMeetingsBatch(meetings, contextMap = {}) {
  const results = [];
  const needsLLM = [];

  // First pass: pattern matching
  for (const meeting of meetings) {
    const patternResult = classifyMeetingByPattern(meeting.subject);
    
    if (patternResult && patternResult.confidence >= 0.80) {
      results.push({
        meetingId: meeting.eventId || meeting.id,
        subject: meeting.subject,
        ...patternResult
      });
    } else {
      needsLLM.push({ meeting, patternResult });
    }
  }

  logger.info(`[MeetingClassifier] Batch: ${results.length} pattern-matched, ${needsLLM.length} need LLM`);

  // Second pass: LLM for uncertain ones (rate-limited)
  for (const { meeting, patternResult } of needsLLM) {
    const context = contextMap[meeting.eventId || meeting.id] || {};
    
    // Try LLM, but use pattern result if available and LLM fails
    try {
      const llmResult = await classifyMeetingWithLLM(meeting.subject, context);
      results.push({
        meetingId: meeting.eventId || meeting.id,
        subject: meeting.subject,
        ...llmResult
      });
    } catch (error) {
      results.push({
        meetingId: meeting.eventId || meeting.id,
        subject: meeting.subject,
        ...(patternResult || { type: 'followup', confidence: 0.40, method: 'error' })
      });
    }

    // Small delay between LLM calls to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

/**
 * Get classification statistics from cache
 */
function getClassificationStats() {
  const stats = {
    cacheSize: classificationCache.size,
    byType: {},
    byMethod: {}
  };

  for (const [, { result }] of classificationCache) {
    stats.byType[result.type] = (stats.byType[result.type] || 0) + 1;
    stats.byMethod[result.method] = (stats.byMethod[result.method] || 0) + 1;
  }

  return stats;
}

module.exports = {
  classifyMeetingFull,
  classifyMeetingWithLLM,
  classifyMeetingsBatch,
  getClassificationStats,
  MEETING_TYPES
};

