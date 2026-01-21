/**
 * Attendee Fallback Enrichment Service
 * Uses Claude (via Socrates) to enrich attendees when Clay data is missing/insufficient
 * 
 * IMPORTANT: This is a FALLBACK service - Clay is primary source
 * Only invokes when Clay returns no usable data
 */

const logger = require('../utils/logger');
const { socratesAdapter } = require('../ai/socratesAdapter');
const intelligenceStore = require('./intelligenceStore');

// ============================================================
// CONFIGURATION - Cost Control & Rate Limiting
// ============================================================
const CONFIG = {
  // Feature toggle - can be disabled via env var
  enabled: process.env.CLAUDE_ENRICHMENT_ENABLED !== 'false',
  
  // Rate limits (reasonable for testing, conservative for production)
  hourlyLimit: parseInt(process.env.CLAUDE_HOURLY_LIMIT) || 30,
  dailyLimit: parseInt(process.env.CLAUDE_DAILY_LIMIT) || 200,
  
  // Model selection - use Haiku for cost efficiency
  model: process.env.CLAUDE_ENRICHMENT_MODEL || 'eudia-claude-sonnet-45',
  maxTokens: 300,
  
  // Personal email domains to skip (not worth enriching)
  personalDomains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com'],
  
  // Cache TTL in days
  cacheTTLDays: 90
};

// In-memory rate tracking (resets on restart, but that's fine for cost control)
let rateLimits = {
  hourlyCount: 0,
  dailyCount: 0,
  hourlyResetTime: Date.now(),
  dailyResetDate: new Date().toDateString()
};

/**
 * Check and update rate limits
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkRateLimits() {
  const now = Date.now();
  const today = new Date().toDateString();
  
  // Reset hourly counter if hour has passed
  if (now - rateLimits.hourlyResetTime > 60 * 60 * 1000) {
    rateLimits.hourlyCount = 0;
    rateLimits.hourlyResetTime = now;
    logger.debug('[Fallback Enrich] Hourly rate limit reset');
  }
  
  // Reset daily counter if day has changed
  if (today !== rateLimits.dailyResetDate) {
    rateLimits.dailyCount = 0;
    rateLimits.dailyResetDate = today;
    logger.info('[Fallback Enrich] Daily rate limit reset');
  }
  
  // Check limits
  if (rateLimits.hourlyCount >= CONFIG.hourlyLimit) {
    return { allowed: false, reason: `Hourly limit reached (${CONFIG.hourlyLimit})` };
  }
  
  if (rateLimits.dailyCount >= CONFIG.dailyLimit) {
    return { allowed: false, reason: `Daily limit reached (${CONFIG.dailyLimit})` };
  }
  
  return { allowed: true, reason: 'Within limits' };
}

/**
 * Increment rate limit counters
 */
function incrementRateLimits() {
  rateLimits.hourlyCount++;
  rateLimits.dailyCount++;
  logger.debug(`[Fallback Enrich] Rate limits: ${rateLimits.hourlyCount}/${CONFIG.hourlyLimit} hourly, ${rateLimits.dailyCount}/${CONFIG.dailyLimit} daily`);
}

/**
 * Check if attendee has valid Clay enrichment data
 * @param {Object} attendee - Attendee object from Clay/calendar
 * @returns {boolean} True if Clay data is sufficient
 */
function hasValidClayData(attendee) {
  // CHECKPOINT 1: Check if has title
  const title = attendee.title || '';
  if (title.trim().length > 3) {
    logger.debug(`[Fallback Enrich] GUARD: Clay has title for ${attendee.email}`);
    return true;
  }
  
  // CHECKPOINT 2: Check if has valid summary (not "no data" message)
  const summary = attendee.summary || attendee.attendee_summary || '';
  if (summary.length > 50 && 
      !summary.toLowerCase().includes('no public linkedin') &&
      !summary.toLowerCase().includes('profile information limited')) {
    logger.debug(`[Fallback Enrich] GUARD: Clay has summary for ${attendee.email}`);
    return true;
  }
  
  return false;
}

/**
 * Check if email is personal (not worth enriching)
 * @param {string} email - Email address
 * @returns {boolean} True if personal email
 */
function isPersonalEmail(email) {
  if (!email) return true;
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true;
  
  return CONFIG.personalDomains.includes(domain);
}

/**
 * Format name properly from various input formats
 * @param {string} name - Raw name
 * @param {string} email - Email for fallback
 * @returns {string} Formatted name
 */
function formatName(name, email) {
  let formattedName = name || '';
  
  // If no name, extract from email
  if (!formattedName || formattedName.includes('@')) {
    if (email) {
      const localPart = email.split('@')[0];
      formattedName = localPart
        .replace(/\d+$/g, '')
        .replace(/[._-]/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }
  
  // Handle "Last, First" format
  if (formattedName.includes(',')) {
    const parts = formattedName.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      formattedName = parts[1] + ' ' + parts[0];
    }
  }
  
  // Normalize case
  if (formattedName === formattedName.toUpperCase() && formattedName.length > 3) {
    formattedName = formattedName.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  
  return formattedName || 'Unknown';
}

/**
 * Enrich a single attendee using Claude fallback
 * @param {Object} attendee - { name, email, company }
 * @returns {Object} Enriched attendee data
 */
async function enrichAttendeeWithClaude(attendee) {
  const email = attendee.email || '';
  const formattedName = formatName(attendee.name, email);
  const company = attendee.company || (email ? email.split('@')[1]?.split('.')[0] : 'Unknown');
  
  logger.info(`[Fallback Enrich] CHECKPOINT: Starting Claude enrichment for ${formattedName} (${email})`);
  
  // Build focused prompt - minimal tokens, structured output
  const prompt = `Based on publicly available professional information, provide a brief profile.

Name: ${formattedName}
Email Domain: ${email.split('@')[1] || 'unknown'}
Company: ${company}

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "Current job title or null",
  "summary": "1-2 sentence professional summary (max 150 chars). Format: '[Name] – [Title] at [Company]. [Key detail].'",
  "confidence": "high|medium|low"
}

If insufficient information, use: {"title": null, "summary": "${formattedName} – Profile information limited.", "confidence": "low"}`;

  try {
    const startTime = Date.now();
    
    // Make request through Socrates
    const response = await socratesAdapter.makeRequest(
      [{ role: 'user', content: prompt }],
      {
        model: CONFIG.model,
        max_tokens: CONFIG.maxTokens,
        temperature: 0.1
      }
    );
    
    const duration = Date.now() - startTime;
    
    // Increment rate limits
    incrementRateLimits();
    
    // Parse response
    if (!response.choices || !response.choices[0]?.message?.content) {
      logger.warn(`[Fallback Enrich] ERROR: Empty response from Claude for ${email}`);
      return {
        success: false,
        error: 'Empty response',
        title: null,
        summary: `${formattedName} – Profile information limited.`,
        confidence: 'low',
        source: 'claude_fallback',
        duration
      };
    }
    
    const responseText = response.choices[0].message.content;
    logger.debug(`[Fallback Enrich] Raw response: ${responseText.substring(0, 200)}`);
    
    // Parse JSON from response
    let parsed;
    try {
      // Try to extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      logger.warn(`[Fallback Enrich] ERROR: Failed to parse JSON from Claude: ${parseError.message}`);
      return {
        success: false,
        error: `Parse error: ${parseError.message}`,
        title: null,
        summary: `${formattedName} – Profile information limited.`,
        confidence: 'low',
        source: 'claude_fallback',
        duration
      };
    }
    
    logger.info(`[Fallback Enrich] SUCCESS: Enriched ${formattedName} via Claude`, {
      title: parsed.title,
      confidence: parsed.confidence,
      duration,
      summaryLength: parsed.summary?.length || 0
    });
    
    return {
      success: true,
      title: parsed.title || null,
      summary: parsed.summary || `${formattedName} – Profile information limited.`,
      confidence: parsed.confidence || 'medium',
      source: 'claude_fallback',
      duration,
      enrichedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error(`[Fallback Enrich] ERROR: Claude request failed for ${email}:`, error.message);
    return {
      success: false,
      error: error.message,
      title: null,
      summary: `${formattedName} – Profile information limited.`,
      confidence: 'low',
      source: 'claude_fallback_error'
    };
  }
}

/**
 * Main entry point: Enrich attendee with fallback to Claude if needed
 * @param {Object} attendee - Attendee object from calendar/Clay
 * @returns {Object} Enriched attendee data
 */
async function enrichAttendeeFallback(attendee) {
  const email = attendee.email || '';
  
  // ============================================================
  // GUARD CONDITIONS - All must pass before calling Claude
  // ============================================================
  
  // GUARD 1: Feature enabled?
  if (!CONFIG.enabled) {
    logger.debug(`[Fallback Enrich] GUARD 1 FAILED: Feature disabled`);
    return { ...attendee, fallbackSkipped: 'disabled' };
  }
  
  // GUARD 2: Already has good Clay data?
  if (hasValidClayData(attendee)) {
    logger.debug(`[Fallback Enrich] GUARD 2 PASSED: Clay data sufficient for ${email}`);
    return { ...attendee, fallbackSkipped: 'clay_data_valid' };
  }
  
  // GUARD 3: Is personal email?
  if (isPersonalEmail(email)) {
    logger.debug(`[Fallback Enrich] GUARD 3 FAILED: Personal email ${email}`);
    return { ...attendee, fallbackSkipped: 'personal_email' };
  }
  
  // GUARD 4: Rate limits
  const rateCheck = checkRateLimits();
  if (!rateCheck.allowed) {
    logger.warn(`[Fallback Enrich] GUARD 4 FAILED: ${rateCheck.reason}`);
    return { ...attendee, fallbackSkipped: rateCheck.reason };
  }
  
  // GUARD 5: Check cache first
  try {
    const cached = await getCachedEnrichment(email);
    if (cached) {
      logger.info(`[Fallback Enrich] CACHE HIT for ${email}`);
      return {
        ...attendee,
        title: cached.title || attendee.title,
        summary: cached.summary || attendee.summary,
        source: 'claude_cache',
        cachedAt: cached.enriched_at
      };
    }
  } catch (cacheError) {
    logger.warn(`[Fallback Enrich] Cache check failed: ${cacheError.message}`);
  }
  
  // ============================================================
  // All guards passed - Call Claude
  // ============================================================
  logger.info(`[Fallback Enrich] All guards passed for ${email}, calling Claude...`);
  
  const enrichment = await enrichAttendeeWithClaude(attendee);
  
  // Cache the result (even failures, to avoid repeated calls)
  if (enrichment.success) {
    try {
      await cacheEnrichment(email, enrichment);
      logger.debug(`[Fallback Enrich] Cached enrichment for ${email}`);
    } catch (cacheError) {
      logger.warn(`[Fallback Enrich] Failed to cache: ${cacheError.message}`);
    }
  }
  
  return {
    ...attendee,
    title: enrichment.title || attendee.title,
    summary: enrichment.summary || attendee.summary,
    source: enrichment.source,
    confidence: enrichment.confidence,
    enrichedAt: enrichment.enrichedAt
  };
}

/**
 * Batch enrich multiple attendees
 * @param {Array} attendees - Array of attendee objects
 * @returns {Array} Enriched attendees
 */
async function enrichAttendeesBatch(attendees) {
  if (!attendees || attendees.length === 0) {
    return [];
  }
  
  logger.info(`[Fallback Enrich] Processing batch of ${attendees.length} attendees`);
  
  const results = [];
  for (const attendee of attendees) {
    const enriched = await enrichAttendeeFallback(attendee);
    results.push(enriched);
    
    // Small delay between calls to be nice to the API
    if (!enriched.fallbackSkipped) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const enrichedCount = results.filter(r => r.source?.includes('claude')).length;
  const skippedCount = results.filter(r => r.fallbackSkipped).length;
  
  logger.info(`[Fallback Enrich] Batch complete: ${enrichedCount} enriched via Claude, ${skippedCount} skipped`);
  
  return results;
}

// ============================================================
// CACHING FUNCTIONS
// ============================================================

/**
 * Get cached enrichment from SQLite
 */
async function getCachedEnrichment(email) {
  return new Promise((resolve, reject) => {
    const db = intelligenceStore.getDb();
    if (!db) {
      resolve(null);
      return;
    }
    
    // Check cache TTL
    const ttlDays = CONFIG.cacheTTLDays;
    
    db.get(
      `SELECT * FROM attendee_enrichment_cache 
       WHERE email = ? 
       AND datetime(enriched_at) > datetime('now', '-${ttlDays} days')`,
      [email.toLowerCase()],
      (err, row) => {
        if (err) {
          logger.debug(`[Fallback Enrich] Cache query error: ${err.message}`);
          resolve(null);
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Save enrichment to cache
 */
async function cacheEnrichment(email, enrichment) {
  return new Promise((resolve, reject) => {
    const db = intelligenceStore.getDb();
    if (!db) {
      resolve();
      return;
    }
    
    db.run(
      `INSERT OR REPLACE INTO attendee_enrichment_cache 
       (email, title, summary, confidence, source, enriched_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        email.toLowerCase(),
        enrichment.title,
        enrichment.summary,
        enrichment.confidence,
        enrichment.source
      ],
      (err) => {
        if (err) {
          logger.warn(`[Fallback Enrich] Cache write error: ${err.message}`);
        }
        resolve();
      }
    );
  });
}

/**
 * Get current rate limit status
 */
function getRateLimitStatus() {
  return {
    enabled: CONFIG.enabled,
    hourly: {
      current: rateLimits.hourlyCount,
      limit: CONFIG.hourlyLimit,
      remaining: Math.max(0, CONFIG.hourlyLimit - rateLimits.hourlyCount)
    },
    daily: {
      current: rateLimits.dailyCount,
      limit: CONFIG.dailyLimit,
      remaining: Math.max(0, CONFIG.dailyLimit - rateLimits.dailyCount)
    }
  };
}

module.exports = {
  enrichAttendeeFallback,
  enrichAttendeesBatch,
  hasValidClayData,
  getRateLimitStatus,
  CONFIG
};

