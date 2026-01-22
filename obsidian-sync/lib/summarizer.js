/**
 * Meeting Note Summarizer
 * Uses Claude API (via Socrates) to generate structured meeting summaries
 * Includes aggressive rate limiting and cost controls
 */

const https = require('https');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Cautious API usage
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
  // Rate limits
  MAX_SUMMARIES_PER_DAY: 25,        // Max API calls per day
  MIN_NOTE_LENGTH: 500,              // Skip notes shorter than this (chars)
  MAX_INPUT_LENGTH: 8000,            // Truncate input to this length
  
  // API settings
  API_BASE_URL: process.env.SOCRATES_API_URL || 'https://api.anthropic.com',
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 500,
  
  // Cache settings
  CACHE_DURATION_DAYS: 30            // Don't re-summarize for 30 days
};

// In-memory rate limit tracking (reset daily)
let dailyUsage = {
  date: new Date().toDateString(),
  count: 0
};

/**
 * Check if we can make another API call today
 */
function checkRateLimit() {
  const today = new Date().toDateString();
  
  // Reset counter at midnight
  if (dailyUsage.date !== today) {
    dailyUsage = { date: today, count: 0 };
  }
  
  return {
    allowed: dailyUsage.count < CONFIG.MAX_SUMMARIES_PER_DAY,
    remaining: CONFIG.MAX_SUMMARIES_PER_DAY - dailyUsage.count,
    limit: CONFIG.MAX_SUMMARIES_PER_DAY
  };
}

/**
 * Record an API call
 */
function recordUsage() {
  const today = new Date().toDateString();
  if (dailyUsage.date !== today) {
    dailyUsage = { date: today, count: 0 };
  }
  dailyUsage.count++;
}

/**
 * Summarize a meeting transcript using Claude
 * 
 * @param {string} transcript - Raw meeting transcript/notes
 * @param {Object} context - Additional context
 * @param {string} context.accountName - Account name
 * @param {Array} context.attendees - List of attendees
 * @param {string} context.title - Meeting title
 * @returns {Object} Structured summary
 */
async function summarizeMeeting(transcript, context = {}) {
  // Guard: Check rate limit
  const rateStatus = checkRateLimit();
  if (!rateStatus.allowed) {
    console.log(`⚠️ Rate limit reached (${CONFIG.MAX_SUMMARIES_PER_DAY}/day). Skipping summary.`);
    return {
      success: false,
      error: 'rate_limit_exceeded',
      message: `Daily limit of ${CONFIG.MAX_SUMMARIES_PER_DAY} summaries reached`
    };
  }
  
  // Guard: Check minimum length
  if (!transcript || transcript.length < CONFIG.MIN_NOTE_LENGTH) {
    console.log(`⚠️ Note too short (${transcript?.length || 0} chars). Skipping.`);
    return {
      success: false,
      error: 'note_too_short',
      message: `Note must be at least ${CONFIG.MIN_NOTE_LENGTH} characters`
    };
  }
  
  // Truncate if too long
  const truncatedTranscript = transcript.length > CONFIG.MAX_INPUT_LENGTH
    ? transcript.substring(0, CONFIG.MAX_INPUT_LENGTH) + '\n\n[Transcript truncated...]'
    : transcript;
  
  // Build the prompt
  const prompt = buildPrompt(truncatedTranscript, context);
  
  try {
    // Get API key
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'no_api_key',
        message: 'CLAUDE_API_KEY not configured'
      };
    }
    
    // Call Claude API
    const response = await callClaudeAPI(prompt, apiKey);
    
    // Record successful usage
    recordUsage();
    
    // Parse the response
    const summary = parseClaudeResponse(response);
    
    return {
      success: true,
      summary,
      usage: {
        remaining: CONFIG.MAX_SUMMARIES_PER_DAY - dailyUsage.count,
        inputLength: truncatedTranscript.length
      }
    };
    
  } catch (error) {
    console.error('❌ Claude API error:', error.message);
    return {
      success: false,
      error: 'api_error',
      message: error.message
    };
  }
}

/**
 * Build the summarization prompt
 */
function buildPrompt(transcript, context) {
  const accountInfo = context.accountName 
    ? `Account: ${context.accountName}` 
    : 'Account: Unknown';
    
  const attendeeInfo = context.attendees?.length
    ? `Attendees: ${context.attendees.join(', ')}`
    : '';
    
  const titleInfo = context.title
    ? `Meeting: ${context.title}`
    : '';

  return `You are summarizing a sales meeting transcript for a B2B enterprise software company.

${[accountInfo, attendeeInfo, titleInfo].filter(Boolean).join('\n')}

TRANSCRIPT:
${transcript}

---

Provide a structured summary in the following format. Be concise and sales-focused.

KEY DISCUSSION POINTS:
• [3-5 bullet points of what was discussed]

ACTION ITEMS:
• [Any follow-ups or tasks mentioned, with owner if clear]

BUYING SIGNALS:
• [Any positive indicators: interest, timeline, budget discussions]

OBJECTIONS/CONCERNS:
• [Any pushback, hesitations, or blockers mentioned]

NEXT STEPS:
• [Agreed next actions and timeline]

SENTIMENT:
[One word: Positive/Neutral/Cautious/Negative]

Keep the summary under 400 words. Focus on actionable intelligence for the sales team.`;
}

/**
 * Call Claude API
 */
async function callClaudeAPI(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    const url = new URL('/v1/messages', CONFIG.API_BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse API response'));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited by API'));
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Parse Claude's response into structured format
 */
function parseClaudeResponse(response) {
  const content = response.content?.[0]?.text || '';
  
  // Extract sections using regex
  const sections = {
    keyPoints: extractSection(content, 'KEY DISCUSSION POINTS'),
    actionItems: extractSection(content, 'ACTION ITEMS'),
    buyingSignals: extractSection(content, 'BUYING SIGNALS'),
    objections: extractSection(content, 'OBJECTIONS', 'CONCERNS'),
    nextSteps: extractSection(content, 'NEXT STEPS'),
    sentiment: extractSentiment(content)
  };
  
  // Generate compact summary for Customer_Brain__c
  const compactSummary = generateCompactSummary(sections);
  
  return {
    ...sections,
    fullText: content,
    compactSummary
  };
}

/**
 * Extract a section from the response
 */
function extractSection(content, ...sectionNames) {
  for (const name of sectionNames) {
    const pattern = new RegExp(`${name}[:\\s]*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i');
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract sentiment
 */
function extractSentiment(content) {
  const pattern = /SENTIMENT[:\s]*(\w+)/i;
  const match = content.match(pattern);
  return match ? match[1] : 'Unknown';
}

/**
 * Generate compact summary for Salesforce
 */
function generateCompactSummary(sections) {
  const parts = [];
  
  if (sections.keyPoints) {
    parts.push('Key Points: ' + sections.keyPoints.split('\n').slice(0, 3).join('; '));
  }
  
  if (sections.nextSteps) {
    parts.push('Next Steps: ' + sections.nextSteps.split('\n').slice(0, 2).join('; '));
  }
  
  if (sections.sentiment) {
    parts.push(`Sentiment: ${sections.sentiment}`);
  }
  
  return parts.join('\n');
}

/**
 * Get current rate limit status
 */
function getRateLimitStatus() {
  return checkRateLimit();
}

module.exports = {
  summarizeMeeting,
  getRateLimitStatus,
  checkRateLimit,
  CONFIG
};

