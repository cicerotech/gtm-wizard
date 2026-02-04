/**
 * Context Summarizer Service
 * Uses Claude (direct Anthropic API) to generate AI-powered meeting context summaries
 * 
 * Purpose: Transform raw meeting notes from Customer_Brain, Obsidian, and Slack
 * into concise, actionable intelligence for sales rep meeting preparation.
 * 
 * IMPORTANT: This service respects rate limits and caches results to control costs.
 * PRIORITY: Uses direct Anthropic API when key is available (more reliable than Socrates)
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 DATA RESIDENCY MIGRATION: In-Memory Cache (Ephemeral)
// Replaces SQLite context_summaries table - no customer data persisted to disk
// ═══════════════════════════════════════════════════════════════════════════
const summaryCache = new Map();
const SUMMARY_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (shorter than SQLite's 24h)

function getMemoryCachedSummary(accountId, contentHash) {
  const cached = summaryCache.get(accountId);
  if (cached && cached.sourceHash === contentHash) {
    const age = Date.now() - cached.timestamp;
    if (age < SUMMARY_CACHE_TTL_MS) {
      logger.debug(`[ContextSummarizer] Memory cache HIT for ${accountId} (${Math.round(age / 60000)}m old)`);
      return cached;
    }
    // Expired
    summaryCache.delete(accountId);
  }
  return null;
}

function setMemoryCachedSummary(accountId, summary, contentHash, rawExcerpt) {
  // Limit cache size to prevent memory leaks
  if (summaryCache.size > 100) {
    const firstKey = summaryCache.keys().next().value;
    summaryCache.delete(firstKey);
  }
  summaryCache.set(accountId, {
    summary,
    sourceHash: contentHash,
    rawExcerpt,
    timestamp: Date.now(),
    generatedAt: new Date().toISOString()
  });
  logger.debug(`[ContextSummarizer] Memory cache SET for ${accountId}`);
}

// Check for direct Anthropic API key (preferred over Socrates)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const USE_DIRECT_ANTHROPIC = !!ANTHROPIC_API_KEY;

// ============================================================
// CONFIGURATION - Cost Control & Rate Limiting
// ============================================================
const CONFIG = {
  // Feature toggle - can be disabled via env var
  enabled: process.env.CONTEXT_SUMMARIZER_ENABLED !== 'false',
  
  // Rate limits (conservative to control costs)
  hourlyLimitPerAccount: 3,   // Max 3 summaries per account per hour
  dailyLimitTotal: 50,        // Max 50 summaries across all accounts per day
  
  // Model selection
  model: process.env.CLAUDE_SUMMARIZER_MODEL || 'eudia-claude-sonnet-45',
  maxTokens: 800,
  temperature: 0.3,  // Lower temperature for consistent summaries
  
  // Cache settings
  cacheTTLHours: 24,  // Summaries valid for 24 hours
  maxInputChars: 15000, // Truncate input to avoid token limits
  
  // Minimum content to summarize
  minContentLength: 100  // Don't summarize if less than 100 chars
};

// ============================================================
// EUDIA SYSTEM PROMPT - Sales-focused context summarization
// ============================================================
const EUDIA_CONTEXT_PROMPT = `You are an AI assistant for Eudia, a legal operations platform that helps enterprise legal teams work more efficiently with AI-powered contract analysis, matter management, and legal intelligence.

Your task is to summarize meeting notes and account context to help Eudia sales representatives prepare for upcoming customer meetings.

Focus on extracting:
1. **Decision Makers**: Key stakeholders, their roles, and priorities
2. **Pain Points**: Challenges with current legal operations (manual processes, lack of visibility, compliance risks)
3. **Eudia Fit**: Which Eudia capabilities align with their needs:
   - CLM (Contract Lifecycle Management)
   - Contract Analysis & Review
   - Legal Intel & Reporting
   - Workflow Automation
4. **Deal Progress**: Current stage, blockers, next steps discussed
5. **Competitive Intel**: Mentions of competitors (Ironclad, Agiloft, Icertis, Evisort, DocuSign CLM)
6. **Sentiment**: Are they engaged, skeptical, enthusiastic, or at-risk?

Output ONLY valid JSON in this exact format:
{
  "executiveSummary": "2-3 sentence overview for quick scan before the meeting",
  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "dealIntel": {
    "stage": "Discovery/Demo/Pilot/Proposal/Negotiation/Unknown",
    "blockers": ["blocker 1 if any"],
    "champions": ["internal advocates if mentioned"],
    "competitors": ["mentioned competitors if any"]
  },
  "nextSteps": ["recommended action 1", "recommended action 2"],
  "sentiment": "positive/neutral/cautious/at-risk"
}

Be concise. Prioritize actionable intelligence. If information is missing, use "Unknown" or empty arrays rather than guessing.`;

// ============================================================
// RATE LIMITING - In-memory tracking
// ============================================================
let rateLimits = {
  dailyCount: 0,
  dailyResetDate: new Date().toDateString(),
  accountHourly: new Map()  // accountId -> { count, resetTime }
};

/**
 * Check if we can summarize for this account
 * @param {string} accountId - Salesforce Account ID
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkRateLimits(accountId) {
  const now = Date.now();
  const today = new Date().toDateString();
  
  // Reset daily counter if day changed
  if (today !== rateLimits.dailyResetDate) {
    rateLimits.dailyCount = 0;
    rateLimits.dailyResetDate = today;
    rateLimits.accountHourly.clear();
    logger.info('[ContextSummarizer] Daily rate limits reset');
  }
  
  // Check daily total limit
  if (rateLimits.dailyCount >= CONFIG.dailyLimitTotal) {
    return { allowed: false, reason: `Daily limit reached (${CONFIG.dailyLimitTotal})` };
  }
  
  // Check per-account hourly limit
  const accountLimit = rateLimits.accountHourly.get(accountId);
  if (accountLimit) {
    // Reset if hour has passed
    if (now - accountLimit.resetTime > 60 * 60 * 1000) {
      rateLimits.accountHourly.set(accountId, { count: 0, resetTime: now });
    } else if (accountLimit.count >= CONFIG.hourlyLimitPerAccount) {
      return { allowed: false, reason: `Account hourly limit reached (${CONFIG.hourlyLimitPerAccount})` };
    }
  }
  
  return { allowed: true, reason: 'Within limits' };
}

/**
 * Increment rate limit counters
 * @param {string} accountId - Salesforce Account ID
 */
function incrementRateLimits(accountId) {
  rateLimits.dailyCount++;
  
  const accountLimit = rateLimits.accountHourly.get(accountId) || { count: 0, resetTime: Date.now() };
  accountLimit.count++;
  rateLimits.accountHourly.set(accountId, accountLimit);
  
  logger.debug(`[ContextSummarizer] Rate limits: Daily ${rateLimits.dailyCount}/${CONFIG.dailyLimitTotal}, Account ${accountLimit.count}/${CONFIG.hourlyLimitPerAccount}`);
}

/**
 * Get current rate limit status
 * @returns {Object} Current rate limit state
 */
function getRateLimitStatus() {
  return {
    dailyUsed: rateLimits.dailyCount,
    dailyLimit: CONFIG.dailyLimitTotal,
    dailyRemaining: CONFIG.dailyLimitTotal - rateLimits.dailyCount,
    resetDate: rateLimits.dailyResetDate
  };
}

/**
 * Generate MD5 hash of content for change detection
 * @param {string} content - Raw content to hash
 * @returns {string} MD5 hash
 */
function generateContentHash(content) {
  return crypto.createHash('md5').update(content || '').digest('hex');
}

/**
 * Truncate content to fit within token limits
 * @param {string} content - Raw content
 * @returns {string} Truncated content
 */
function truncateContent(content) {
  if (!content || content.length <= CONFIG.maxInputChars) {
    return content;
  }
  
  // Truncate but try to end at a sentence boundary
  let truncated = content.substring(0, CONFIG.maxInputChars);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > CONFIG.maxInputChars * 0.8) {
    truncated = truncated.substring(0, lastPeriod + 1);
  }
  
  return truncated + '\n\n[Content truncated for processing...]';
}

/**
 * Build raw excerpt for fallback display
 * @param {string} content - Raw content
 * @param {number} maxLength - Max chars for excerpt
 * @returns {string} Excerpt
 */
function buildExcerpt(content, maxLength = 500) {
  if (!content) return '';
  
  const cleaned = content
    .replace(/─+/g, '') // Remove separator lines
    .replace(/\n{3,}/g, '\n\n') // Normalize whitespace
    .trim();
  
  if (cleaned.length <= maxLength) return cleaned;
  
  // Try to end at sentence boundary
  let excerpt = cleaned.substring(0, maxLength);
  const lastPeriod = excerpt.lastIndexOf('.');
  if (lastPeriod > maxLength * 0.7) {
    excerpt = excerpt.substring(0, lastPeriod + 1);
  } else {
    excerpt = excerpt.substring(0, excerpt.lastIndexOf(' ')) + '...';
  }
  
  return excerpt;
}

/**
 * Aggregate all context sources into a single string for summarization
 * @param {Object} sources - { customerBrain, obsidianNotes, slackIntel, priorMeetings }
 * @returns {string} Combined content
 */
function aggregateContextSources(sources) {
  const parts = [];
  
  // Customer Brain notes (most important)
  if (sources.customerBrain && sources.customerBrain.trim().length > 0) {
    parts.push('=== MEETING NOTES FROM CRM ===\n' + sources.customerBrain);
  }
  
  // Obsidian notes
  if (sources.obsidianNotes && Array.isArray(sources.obsidianNotes)) {
    const obsidianContent = sources.obsidianNotes
      .map(note => `[${note.date || 'Unknown date'}] ${note.title || 'Note'}\n${note.summary || note.fullSummary || ''}`)
      .join('\n\n');
    
    if (obsidianContent.trim().length > 0) {
      parts.push('=== RECENT OBSIDIAN NOTES ===\n' + obsidianContent);
    }
  }
  
  // Slack intel
  if (sources.slackIntel && Array.isArray(sources.slackIntel)) {
    const slackContent = sources.slackIntel
      .map(intel => `[${intel.category || 'Intel'}] ${intel.summary}`)
      .join('\n');
    
    if (slackContent.trim().length > 0) {
      parts.push('=== SLACK INTELLIGENCE ===\n' + slackContent);
    }
  }
  
  // Prior meeting preps
  if (sources.priorMeetings && Array.isArray(sources.priorMeetings)) {
    const prepContent = sources.priorMeetings
      .map(prep => `[${prep.date || 'Unknown'}] ${prep.title || 'Meeting'}: ${prep.summary || prep.notes || ''}`)
      .join('\n\n');
    
    if (prepContent.trim().length > 0) {
      parts.push('=== PRIOR MEETING PREPS ===\n' + prepContent);
    }
  }
  
  return parts.join('\n\n');
}

/**
 * Call Claude to generate summary
 * @param {string} content - Aggregated raw content
 * @param {string} accountName - Account name for context
 * @returns {Object|null} Parsed summary JSON or null on failure
 */
async function callClaude(content, accountName) {
  const userPrompt = `Account: ${accountName}\n\nPlease summarize the following meeting notes and context:\n\n${content}`;
  
  try {
    let text;
    
    // PRIORITY: Use direct Anthropic API when available (more reliable)
    if (USE_DIRECT_ANTHROPIC) {
      logger.info('[ContextSummarizer] Using direct Anthropic API');
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: CONFIG.maxTokens,
          temperature: CONFIG.temperature,
          system: EUDIA_CONTEXT_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      text = data.content?.[0]?.text || '';
      
    } else {
      // Fallback to Socrates if no direct Anthropic key
      logger.info('[ContextSummarizer] Using Socrates adapter (no ANTHROPIC_API_KEY)');
      const { socratesAdapter } = require('../ai/socratesAdapter');
      
      const response = await socratesAdapter.makeRequest(
        [
          { role: 'system', content: EUDIA_CONTEXT_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        {
          model: CONFIG.model,
          max_tokens: CONFIG.maxTokens,
          temperature: CONFIG.temperature
        }
      );
      
      text = response?.choices?.[0]?.message?.content || 
             response?.content?.[0]?.text ||
             response?.content ||
             response;
    }
    
    if (!text || typeof text !== 'string') {
      logger.error('[ContextSummarizer] Invalid Claude response format');
      return null;
    }
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate required fields
    if (!parsed.executiveSummary) {
      logger.warn('[ContextSummarizer] Claude response missing executiveSummary');
      parsed.executiveSummary = 'Summary generation incomplete. Please review raw notes.';
    }
    
    return parsed;
    
  } catch (error) {
    logger.error('[ContextSummarizer] Claude API error:', error.message);
    return null;
  }
}

/**
 * Generate AI summary for an account's context
 * @param {string} accountId - Salesforce Account ID
 * @param {string} accountName - Account name
 * @param {Object} sources - Context sources { customerBrain, obsidianNotes, slackIntel, priorMeetings }
 * @param {Object} options - { forceRefresh: boolean }
 * @returns {Object} Summary result
 */
async function summarizeContext(accountId, accountName, sources, options = {}) {
  const startTime = Date.now();
  
  // Check if feature is enabled
  if (!CONFIG.enabled) {
    logger.debug('[ContextSummarizer] Feature disabled via env var');
    return {
      success: false,
      cached: false,
      summary: null,
      rawExcerpt: buildExcerpt(aggregateContextSources(sources)),
      reason: 'Feature disabled'
    };
  }
  
  // Aggregate all content
  const rawContent = aggregateContextSources(sources);
  
  // Check minimum content length
  if (rawContent.length < CONFIG.minContentLength) {
    logger.debug(`[ContextSummarizer] Insufficient content for ${accountName} (${rawContent.length} chars)`);
    return {
      success: false,
      cached: false,
      summary: null,
      rawExcerpt: rawContent,
      reason: 'Insufficient content to summarize'
    };
  }
  
  // Generate content hash for cache comparison
  const contentHash = generateContentHash(rawContent);
  
  // PHASE 3: Check in-memory cache (instead of SQLite) unless force refresh
  if (!options.forceRefresh) {
    const cached = getMemoryCachedSummary(accountId, contentHash);
    if (cached) {
      logger.debug(`[ContextSummarizer] Memory cache hit for ${accountName}`);
      return {
        success: true,
        cached: true,
        summary: cached.summary,
        rawExcerpt: cached.rawExcerpt,
        contentHash,
        generatedAt: cached.generatedAt
      };
    }
  }
  
  // Check rate limits
  const rateCheck = checkRateLimits(accountId);
  if (!rateCheck.allowed) {
    logger.warn(`[ContextSummarizer] Rate limited for ${accountName}: ${rateCheck.reason}`);
    
    // Try to return any cached summary (even with different hash)
    const anyCache = summaryCache.get(accountId);
    if (anyCache) {
      return {
        success: true,
        cached: true,
        stale: true,
        summary: anyCache.summary,
        rawExcerpt: anyCache.rawExcerpt,
        reason: rateCheck.reason
      };
    }
    
    return {
      success: false,
      cached: false,
      summary: null,
      rawExcerpt: buildExcerpt(rawContent),
      reason: rateCheck.reason
    };
  }
  
  // Truncate content for Claude
  const truncatedContent = truncateContent(rawContent);
  
  // Call Claude for summarization
  logger.info(`[ContextSummarizer] Generating summary for ${accountName} (${rawContent.length} chars)`);
  const summary = await callClaude(truncatedContent, accountName);
  
  // Increment rate limits
  incrementRateLimits(accountId);
  
  const duration = Date.now() - startTime;
  
  if (!summary) {
    logger.error(`[ContextSummarizer] Failed to generate summary for ${accountName} (${duration}ms)`);
    return {
      success: false,
      cached: false,
      summary: null,
      rawExcerpt: buildExcerpt(rawContent),
      reason: 'Claude API error',
      duration
    };
  }
  
  // PHASE 3: Save to in-memory cache (instead of SQLite)
  // No disk persistence - ephemeral cache only
  const rawExcerpt = buildExcerpt(rawContent);
  setMemoryCachedSummary(accountId, summary, contentHash, rawExcerpt);
  logger.info(`[ContextSummarizer] Cached summary in memory for ${accountName} (${duration}ms)`);
  
  return {
    success: true,
    cached: false,
    summary,
    rawExcerpt,
    contentHash,
    generatedAt: new Date().toISOString(),
    duration
  };
}

/**
 * Get summary for an account (uses cache, generates if needed)
 * @param {string} accountId - Salesforce Account ID
 * @param {string} accountName - Account name
 * @param {Object} sources - Context sources
 * @returns {Object} Summary result
 */
async function getOrGenerateSummary(accountId, accountName, sources) {
  return summarizeContext(accountId, accountName, sources, { forceRefresh: false });
}

/**
 * Force refresh summary for an account
 * @param {string} accountId - Salesforce Account ID
 * @param {string} accountName - Account name
 * @param {Object} sources - Context sources
 * @returns {Object} Summary result
 */
async function refreshSummary(accountId, accountName, sources) {
  return summarizeContext(accountId, accountName, sources, { forceRefresh: true });
}

module.exports = {
  summarizeContext,
  getOrGenerateSummary,
  refreshSummary,
  aggregateContextSources,
  generateContentHash,
  getRateLimitStatus,
  checkRateLimits,
  CONFIG,
  EUDIA_CONTEXT_PROMPT
};

