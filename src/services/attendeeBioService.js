/**
 * Attendee Bio Service
 * Generates AI-powered attendee profiles using Claude (via Socrates)
 * Model: claude-sonnet-4-20250514 (Opus 4.5 quality)
 */

const logger = require('../utils/logger');
const { socratesAdapter } = require('../ai/socratesAdapter');
const intelligenceStore = require('./intelligenceStore');

// Seniority ranking for sorting attendees
const SENIORITY_ORDER = {
  'CLO': 1,
  'Chief Legal Officer': 1,
  'General Counsel': 2,
  'GC': 2,
  'Deputy General Counsel': 3,
  'Deputy GC': 3,
  'Associate General Counsel': 4,
  'VP Legal': 5,
  'Vice President': 5,
  'Director': 6,
  'Senior Counsel': 7,
  'Counsel': 8,
  'Legal Operations': 9,
  'Manager': 10,
  'Senior': 11,
  'Associate': 12,
  'Analyst': 13,
  'Unknown': 99
};

// Daily call limits for cost control
const DAILY_LIMIT = 100;
const COST_ALERT_THRESHOLD = 10; // $10/day

class AttendeeBioService {
  constructor() {
    this.model = process.env.CLAUDE_MODEL || 'eudia-claude-sonnet-45';
    this.dailyCallCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.initialized = false;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('✅ Attendee Bio Service initialized');
  }

  /**
   * Check if within daily limits
   */
  checkLimits() {
    // Reset counter at midnight
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyCallCount = 0;
      this.lastResetDate = today;
    }

    if (this.dailyCallCount >= DAILY_LIMIT) {
      logger.warn(`⚠️ Daily Claude limit reached (${DAILY_LIMIT} calls)`);
      return false;
    }

    return true;
  }

  /**
   * Generate a bio for a single attendee
   * @param {Object} attendee - { name, email, title, company, linkedin }
   * @param {Object} meetingContext - { accountName, subject, date }
   * @returns {Object} - { bio, seniority, confidence }
   */
  async generateAttendeeBio(attendee, meetingContext = {}) {
    await this.initialize();

    if (!this.checkLimits()) {
      return {
        bio: 'Bio generation limit reached for today.',
        seniority: this.inferSeniority(attendee.title),
        confidence: 'low',
        error: 'Daily limit reached'
      };
    }

    const { name, email, title, company, linkedin } = attendee;
    const { accountName, subject } = meetingContext;

    // Build context-aware prompt
    const prompt = `You are a professional sales intelligence assistant for Eudia, a legal AI company selling to Fortune 500 legal departments.

Generate a concise 3-5 sentence professional profile for this meeting attendee. Focus on information relevant for a sales conversation.

**Attendee:**
- Name: ${name || 'Unknown'}
- Title: ${title || 'Unknown'}
- Company: ${company || accountName || 'Unknown'}
- Email: ${email || 'Unknown'}
${linkedin ? `- LinkedIn: ${linkedin}` : ''}

**Meeting Context:**
- Account: ${accountName || 'Unknown'}
- Meeting Subject: ${subject || 'Unknown'}

**Instructions:**
1. Write a brief professional bio (3-5 sentences)
2. Highlight their role and likely priorities
3. Note any relevant context for a legal tech sale
4. Infer their seniority level (CLO, GC, Director, Manager, etc.)
5. Be factual - don't fabricate specific details you don't know

Respond in JSON format:
{
  "bio": "3-5 sentence professional profile",
  "seniority": "CLO|GC|Director|Manager|Senior|Associate|Unknown",
  "priorities": ["likely priority 1", "likely priority 2"],
  "talkingPoints": ["suggested talking point 1", "suggested talking point 2"]
}`;

    try {
      const startTime = Date.now();
      
      const response = await socratesAdapter.makeRequest(
        [{ role: 'user', content: prompt }],
        { 
          model: this.model,
          max_tokens: 500,
          temperature: 0.3
        }
      );

      this.dailyCallCount++;
      const duration = Date.now() - startTime;

      if (!response.choices || !response.choices[0]?.message?.content) {
        logger.warn('Empty response from Claude for attendee bio');
        return {
          bio: `${name} - ${title || 'Role unknown'} at ${company || accountName}`,
          seniority: this.inferSeniority(title),
          confidence: 'low'
        };
      }

      const responseText = response.choices[0].message.content;
      const parsed = this.parseResponse(responseText);

      logger.info('✅ Generated attendee bio', {
        name,
        company: company || accountName,
        seniority: parsed.seniority,
        duration,
        dailyCalls: this.dailyCallCount
      });

      return {
        ...parsed,
        confidence: 'high',
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to generate attendee bio:', error.message);
      return {
        bio: `${name} - ${title || 'Role unknown'} at ${company || accountName}`,
        seniority: this.inferSeniority(title),
        confidence: 'low',
        error: error.message
      };
    }
  }

  /**
   * Generate bios for all attendees in a meeting, sorted by seniority
   * @param {Array} attendees - Array of attendee objects
   * @param {Object} meetingContext - Meeting context
   * @returns {Array} Enriched attendees sorted by seniority
   */
  async generateMeetingAttendeeProfiles(attendees, meetingContext) {
    if (!attendees || attendees.length === 0) {
      return [];
    }

    logger.info(`📝 Generating profiles for ${attendees.length} attendees`);

    // Generate bios in parallel (with limit)
    const results = await Promise.allSettled(
      attendees.map(att => this.generateAttendeeBio(att, meetingContext))
    );

    // Merge results with original attendee data
    const enrichedAttendees = attendees.map((att, idx) => {
      const result = results[idx];
      if (result.status === 'fulfilled') {
        return {
          ...att,
          ...result.value,
          seniorityRank: SENIORITY_ORDER[result.value.seniority] || 99
        };
      } else {
        return {
          ...att,
          bio: `${att.name} - ${att.title || 'Role unknown'}`,
          seniority: this.inferSeniority(att.title),
          seniorityRank: 99,
          confidence: 'low',
          error: result.reason?.message
        };
      }
    });

    // Sort by seniority (CLO first)
    enrichedAttendees.sort((a, b) => a.seniorityRank - b.seniorityRank);

    return enrichedAttendees;
  }

  /**
   * Parse Claude's JSON response
   */
  parseResponse(responseText) {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          bio: parsed.bio || 'No bio generated',
          seniority: parsed.seniority || 'Unknown',
          priorities: parsed.priorities || [],
          talkingPoints: parsed.talkingPoints || []
        };
      }
    } catch (error) {
      logger.debug('Failed to parse JSON, extracting text');
    }

    // Fallback: use raw text as bio
    return {
      bio: responseText.substring(0, 500),
      seniority: 'Unknown',
      priorities: [],
      talkingPoints: []
    };
  }

  /**
   * Infer seniority from title string
   */
  inferSeniority(title) {
    if (!title) return 'Unknown';
    
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('chief legal') || titleLower.includes('clo')) return 'CLO';
    if (titleLower.includes('general counsel') || titleLower.includes(' gc')) return 'GC';
    if (titleLower.includes('deputy')) return 'Deputy GC';
    if (titleLower.includes('vp') || titleLower.includes('vice president')) return 'VP Legal';
    if (titleLower.includes('director')) return 'Director';
    if (titleLower.includes('senior counsel')) return 'Senior Counsel';
    if (titleLower.includes('counsel')) return 'Counsel';
    if (titleLower.includes('legal ops') || titleLower.includes('operations')) return 'Legal Operations';
    if (titleLower.includes('manager')) return 'Manager';
    if (titleLower.includes('senior')) return 'Senior';
    if (titleLower.includes('associate')) return 'Associate';
    if (titleLower.includes('analyst')) return 'Analyst';
    
    return 'Unknown';
  }

  /**
   * Get daily usage stats
   */
  getUsageStats() {
    return {
      dailyCalls: this.dailyCallCount,
      dailyLimit: DAILY_LIMIT,
      remainingCalls: Math.max(0, DAILY_LIMIT - this.dailyCallCount),
      lastResetDate: this.lastResetDate
    };
  }
}

// Singleton instance
const attendeeBioService = new AttendeeBioService();

module.exports = {
  attendeeBioService,
  initializeAttendeeBio: () => attendeeBioService.initialize(),
  SENIORITY_ORDER
};

