/**
 * Calendar Service
 * Reads Outlook calendars via Microsoft Graph API for all BLs
 * Permission: Calendars.Read (Application) - APPROVED
 */

const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');
const logger = require('../utils/logger');

// ============================================================
// CALENDAR CACHE - Prevents repeated API calls on page loads
// ============================================================
const CALENDAR_CACHE = {
  data: null,
  timestamp: 0,
  TTL_MS: 60 * 60 * 1000,  // 60 minutes cache - meeting data changes infrequently (1-2x/week)
  inProgress: false,       // Prevents concurrent fetches
  lastFetchTime: 0         // Track when last fetch started
};

function isCalendarCacheValid() {
  return CALENDAR_CACHE.data && 
         (Date.now() - CALENDAR_CACHE.timestamp) < CALENDAR_CACHE.TTL_MS;
}

function setCalendarCache(data) {
  CALENDAR_CACHE.data = data;
  CALENDAR_CACHE.timestamp = Date.now();
  CALENDAR_CACHE.inProgress = false;
  logger.info(`📦 Calendar cache SET (expires in ${CALENDAR_CACHE.TTL_MS / 1000}s)`);
}

function getCalendarCache() {
  const age = Math.round((Date.now() - CALENDAR_CACHE.timestamp) / 1000);
  logger.info(`📦 Calendar cache HIT (age: ${age}s, expires in ${Math.round(CALENDAR_CACHE.TTL_MS / 1000 - age)}s)`);
  return CALENDAR_CACHE.data;
}

// Business Lead email list - US + EU Pods + All User Groups
const BL_EMAILS_PILOT = [
  // US Pod Business Leads
  'asad.hussain@eudia.com',
  'julie.stefanich@eudia.com',
  'olivia.jung@eudia.com',
  'olivia@eudia.com',
  'ananth.cherukupally@eudia.com',
  'ananth@eudia.com',
  'justin.hills@eudia.com',
  'mike.masiello@eudia.com',
  'mike@eudia.com',
  'sean.boyd@eudia.com',
  'riley.stack@eudia.com',
  'rajeev.patel@eudia.com',
  // EU Pod Business Leads
  'greg.machale@eudia.com',
  'tom.clancy@eudia.com',
  'conor.molloy@eudia.com',
  'alex.fox@eudia.com',
  'emer.flynn@eudia.com',
  'nicola.fratini@eudia.com',
  'nathan.shine@eudia.com',
  // Sales Leaders
  'mitchell.loquaci@eudia.com',
  'stephen.mulholland@eudia.com',
  'riona.mchale@eudia.com',
  // Exec
  'omar@eudia.com',
  'david@eudia.com',
  'ashish@eudia.com',
  // Customer Success
  'nikhita.godiwala@eudia.com',
  'jon.dedych@eudia.com',
  'farah.haddad@eudia.com',
  // Admin
  'keigan.pesenti@eudia.com',
  'michael.ayers@eudia.com',
  'zach@eudia.com',
  // Other
  'michael.flynn@eudia.com',
  'daniel.kim@eudia.com',
  'ben.brosnahan@eudia.com',
  // Product Ops & Partnerships
  'siddharth.saxena@eudia.com'
];

// Full BL list (US + EU Pods) - enable when ready
const BL_EMAILS_FULL = [
  // US Pod
  'asad.hussain@eudia.com',
  'julie.stefanich@eudia.com',
  'olivia.jung@eudia.com',
  'olivia@eudia.com',
  'ananth.cherukupally@eudia.com',
  'justin.hills@eudia.com',
  'mike.masiello@eudia.com',
  'sean.boyd@eudia.com',
  'riley.stack@eudia.com',
  'rajeev.patel@eudia.com',
  // EU Pod
  'greg.machale@eudia.com',
  'nathan.shine@eudia.com',
  'tom.clancy@eudia.com',
  'conor.molloy@eudia.com',
  'alex.fox@eudia.com',
  'nicola.fratini@eudia.com',
  'emer.flynn@eudia.com',
  'riona.mchale@eudia.com'
];

// Use pilot group for now (switch to BL_EMAILS_FULL when ready to scale)
const BL_EMAILS = process.env.USE_FULL_BL_LIST === 'true' ? BL_EMAILS_FULL : BL_EMAILS_PILOT;

// Internal/affiliate domains - attendees from these domains are treated as internal
const INTERNAL_DOMAINS = [
  'eudia.com',
  'johnsonhana.com',    // Internal client account
  'johnsonhana.ie',     // Ireland domain variant
  'johnson-hana.com'    // Hyphenated variant
];

// Personal email domains - if ALL external attendees have these, treat meeting as internal
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'protonmail.com'
];

// Helper: Check if email is from an internal/affiliate domain
function isInternalEmail(email) {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  return INTERNAL_DOMAINS.some(domain => emailLower.endsWith('@' + domain));
}

// Helper: Check if email is a personal email domain
function isPersonalEmail(email) {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  return PERSONAL_EMAIL_DOMAINS.some(domain => emailLower.endsWith('@' + domain));
}

// Internal meeting keywords to exclude (case-insensitive)
const INTERNAL_MEETING_KEYWORDS = [
  'jhi',           // Jump-in-here internal syncs
  '1:1',           // One-on-ones
  'all hands',
  'team sync',
  'standup',
  'stand-up',
  'internal',
  'sync with',
  'weekly sync',
  'eudia team',
  'eudia meeting',
  'office hours',
  'training',
  'onboarding',
  'planning',
  'retrospective',
  'retro',
  'sprint',
  'johnson hana',   // Internal account meetings
  'johnsonhana',    // Alternate spelling
  'interview',      // Candidate interviews
  'greenhouse'      // Greenhouse ATS meetings
];

// ============================================================
// MEETING TYPE CLASSIFICATION - AI Sales Velocity Tracking
// ============================================================
// High-confidence patterns that can skip LLM classification
const MEETING_TYPE_PATTERNS = {
  cab: /\bcab\b|customer advisory|advisory board|memorandum|strategic partnership/i,
  demo: /\bdemo\b|demonstration|product (walk|over|show)|platform (walk|over|show)|sigma (demo|overview)|contracts (demo|overview)/i,
  intro: /\bintro\b|introduction|first (meeting|call)|meet.*eudia|eudia.*intro|initial (call|meeting)/i,
  compliance: /\binfosec\b|security (review|questionnaire)|compliance|legal review|\bdpa\b|data (processing|privacy)|soc.?2/i,
  proposal: /\bproposal\b|contract (review|walkthrough)|msa|sow|\bredlin/i,
  negotiation: /\bnegotiat/i,
  scoping: /\bscoping\b|pricing (review|discussion)|pilot (plan|scope)|assessment/i,
  discovery: /\bdiscovery\b|use case|deep dive|requirements|pain points/i,
  followup: /\bfollow.?up\b|check.?in|\bsync\b|touchpoint|office hours|status (update|call)/i
};

// Meeting type definitions for reference
const MEETING_TYPES = {
  intro: { label: 'Intro', stage: 'Stage 0/1', description: 'First substantive meeting, CLO engagement' },
  cab: { label: 'CAB', stage: 'Stage 1', description: 'Customer Advisory Board discussion, memorandum' },
  demo: { label: 'Demo', stage: 'Stage 1/2', description: 'Product demonstration, platform walkthrough' },
  discovery: { label: 'Discovery', stage: 'Stage 1', description: 'Deep dive on requirements, use cases' },
  scoping: { label: 'Scoping', stage: 'Stage 2/3', description: 'Pricing discussion, pilot planning' },
  compliance: { label: 'Compliance', stage: 'Stage 3/4', description: 'InfoSec, legal review, DPA' },
  proposal: { label: 'Proposal', stage: 'Stage 4', description: 'Contract review, MSA/SOW walkthrough' },
  negotiation: { label: 'Negotiation', stage: 'Stage 5', description: 'Final terms, pricing negotiation' },
  followup: { label: 'Follow-up', stage: 'Any', description: 'General sync, check-in, status update' },
  unknown: { label: 'Unknown', stage: 'Unknown', description: 'Could not classify' }
};

/**
 * Classify meeting type using high-confidence pattern matching
 * Returns { type, confidence, method } or null if LLM needed
 */
function classifyMeetingByPattern(subject) {
  if (!subject) return null;
  
  const subjectLower = subject.toLowerCase();
  
  for (const [type, pattern] of Object.entries(MEETING_TYPE_PATTERNS)) {
    if (pattern.test(subjectLower)) {
      // Determine confidence based on type
      let confidence = 0.85;
      
      // CAB is almost always explicit
      if (type === 'cab') confidence = 0.95;
      // Demo is usually explicit
      if (type === 'demo') confidence = 0.90;
      // Intro can be ambiguous
      if (type === 'intro') confidence = 0.80;
      // Followup is a catch-all, lower confidence
      if (type === 'followup') confidence = 0.70;
      
      return {
        type,
        confidence,
        method: 'pattern',
        matchedPattern: pattern.toString()
      };
    }
  }
  
  return null; // No pattern match - needs LLM or contextual classification
}

/**
 * Classify meeting with full context (includes sequence, stage, attendees)
 * This is the main classification function that combines pattern + context
 */
function classifyMeeting(subject, context = {}) {
  const { sequenceNumber, opportunityStage, attendeeTitles } = context;
  
  // Try pattern matching first (fast, no API call)
  const patternMatch = classifyMeetingByPattern(subject);
  
  if (patternMatch) {
    // Boost confidence if sequence aligns with type
    if (patternMatch.type === 'intro' && sequenceNumber === 1) {
      patternMatch.confidence = 0.95;
    }
    return patternMatch;
  }
  
  // Contextual classification fallback
  // If first meeting and no other pattern, likely intro
  if (sequenceNumber === 1) {
    return {
      type: 'intro',
      confidence: 0.75,
      method: 'sequence',
      reasoning: 'First meeting with account'
    };
  }
  
  // Check attendee titles for hints
  if (attendeeTitles) {
    const titlesLower = attendeeTitles.join(' ').toLowerCase();
    if (titlesLower.includes('legal') || titlesLower.includes('compliance') || titlesLower.includes('security')) {
      return {
        type: 'compliance',
        confidence: 0.70,
        method: 'attendee_titles',
        reasoning: 'Legal/compliance attendees detected'
      };
    }
  }
  
  // Check opportunity stage for hints
  if (opportunityStage) {
    const stageLower = opportunityStage.toLowerCase();
    if (stageLower.includes('stage 4') || stageLower.includes('proposal')) {
      return {
        type: 'proposal',
        confidence: 0.65,
        method: 'stage_context',
        reasoning: 'Opportunity in Stage 4 - Proposal'
      };
    }
    if (stageLower.includes('stage 5') || stageLower.includes('negotiation')) {
      return {
        type: 'negotiation',
        confidence: 0.65,
        method: 'stage_context',
        reasoning: 'Opportunity in Stage 5 - Negotiation'
      };
    }
  }
  
  // Default to followup if no other signal
  return {
    type: 'followup',
    confidence: 0.50,
    method: 'default',
    reasoning: 'No specific signals detected - defaulting to followup'
  };
}

class CalendarService {
  constructor() {
    this.graphClient = null;
    this.initialized = false;
  }

  /**
   * Initialize the Microsoft Graph client
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        logger.warn('⚠️ Calendar service: Azure credentials not configured');
        return false;
      }

      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          }
        }
      });

      this.initialized = true;
      logger.info('✅ Calendar service initialized (Microsoft Graph API)');
      return true;
    } catch (error) {
      logger.error('Calendar service initialization failed:', error);
      return false;
    }
  }

  /**
   * Get calendar events for a specific user within a date range
   * @param {string} userEmail - User's email address
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @returns {Array} Array of calendar events
   */
  async getCalendarEvents(userEmail, startDate, endDate) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.graphClient) {
      logger.error('Calendar service not initialized');
      return [];
    }

    try {
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      logger.info(`📅 Fetching calendar for ${userEmail}: ${startISO} to ${endISO}`);

      // Query user's calendar events
      // CRITICAL: Request UTC times so naive datetime strings can be correctly
      // parsed on any client regardless of local timezone
      const response = await this.graphClient
        .api(`/users/${userEmail}/calendar/calendarView`)
        .header('Prefer', 'outlook.timezone="UTC"')
        .query({
          startDateTime: startISO,
          endDateTime: endISO,
          $top: 100,
          $orderby: 'start/dateTime',
          $select: 'id,subject,start,end,attendees,organizer,location,body,bodyPreview,isOnlineMeeting,onlineMeetingUrl,webLink'
        })
        .get();

      const events = response.value || [];
      logger.info(`📅 Found ${events.length} calendar events for ${userEmail}`);

      return events.map(event => this.normalizeEvent(event, userEmail));

    } catch (error) {
      // Handle specific Graph API errors
      if (error.statusCode === 404) {
        logger.warn(`Calendar not found for ${userEmail} - user may not exist or no calendar access`);
      } else if (error.statusCode === 403) {
        logger.warn(`Access denied to calendar for ${userEmail} - check permissions`);
      } else {
        logger.error(`Failed to fetch calendar for ${userEmail}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Check if meeting subject matches internal meeting keywords
   */
  isInternalMeetingBySubject(subject) {
    if (!subject) return false;
    const subjectLower = subject.toLowerCase();
    return INTERNAL_MEETING_KEYWORDS.some(keyword => subjectLower.includes(keyword));
  }

  /**
   * Normalize Graph API event to internal format
   */
  normalizeEvent(event, ownerEmail) {
    // Parse attendees - use INTERNAL_DOMAINS to classify
    const allAttendees = (event.attendees || []).map(att => ({
      name: att.emailAddress?.name || '',
      email: att.emailAddress?.address || '',
      responseStatus: att.status?.response || 'none',
      isExternal: !isInternalEmail(att.emailAddress?.address),
      isPersonalEmail: isPersonalEmail(att.emailAddress?.address)
    }));

    const externalAttendees = allAttendees.filter(a => a.isExternal);
    const internalAttendees = allAttendees.filter(a => !a.isExternal);
    
    // Filter out personal email attendees for customer meeting determination
    // If ALL external attendees are personal emails (gmail, etc.), treat as internal meeting
    const realExternalAttendees = externalAttendees.filter(a => !a.isPersonalEmail);

    // Check if subject matches internal meeting keywords
    const hasInternalKeyword = this.isInternalMeetingBySubject(event.subject);

    // Determine if this is a customer meeting:
    // - Must have at least one REAL external attendee (not personal email)
    // - Must NOT match internal meeting keywords
    const isCustomerMeeting = realExternalAttendees.length > 0 && !hasInternalKeyword;

    // Classify meeting type using pattern matching
    // Context will be enriched later with sequence/stage data
    const classification = classifyMeeting(event.subject, {});
    
    // Ensure datetime strings are proper ISO 8601 with Z suffix.
    // Graph API returns naive strings (no offset) even when timezone is UTC.
    // Without 'Z', JS Date() treats them as local time → wrong on every client.
    const startDT = this._ensureUtcSuffix(event.start?.dateTime);
    const endDT = this._ensureUtcSuffix(event.end?.dateTime);
    
    return {
      eventId: event.id,
      subject: event.subject || 'No Subject',
      startDateTime: startDT,
      endDateTime: endDT,
      timezone: 'UTC',
      location: event.location?.displayName || '',
      body: event.body?.content || '',           // Full HTML body
      bodyPreview: event.bodyPreview || '',      // Short preview
      isOnlineMeeting: event.isOnlineMeeting || false,
      meetingUrl: event.onlineMeetingUrl || '',
      webLink: event.webLink || '',              // Link to open in Outlook
      organizer: {
        name: event.organizer?.emailAddress?.name || '',
        email: event.organizer?.emailAddress?.address || ''
      },
      ownerEmail,
      allAttendees,
      externalAttendees,
      internalAttendees,
      isCustomerMeeting,
      hasInternalKeyword, // For debugging
      // Meeting classification for velocity tracking
      meetingType: classification.type,
      meetingTypeConfidence: classification.confidence,
      meetingTypeMethod: classification.method,
      source: 'outlook'
    };
  }

  /**
   * Ensure a datetime string ends with 'Z' (UTC marker).
   * Microsoft Graph returns naive strings like "2026-02-10T17:00:00.0000000"
   * without any timezone indicator. Without 'Z', JavaScript Date() parses
   * them as LOCAL time, causing wrong times on every client.
   */
  _ensureUtcSuffix(dateTimeStr) {
    if (!dateTimeStr) return dateTimeStr;
    // Already has Z or offset (+/-HH:MM) → leave it alone
    if (dateTimeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTimeStr)) {
      return dateTimeStr;
    }
    return dateTimeStr + 'Z';
  }

  /**
   * Get upcoming meetings for all BLs
   * @param {number} daysAhead - How many days ahead to fetch (default 7)
   * @returns {Array} All meetings across all BLs
   */
  async getUpcomingMeetingsForAllBLs(daysAhead = 7, forceRefresh = false) {
    // CHECK CACHE FIRST - prevents repeated Graph API calls on every page load
    if (!forceRefresh && isCalendarCacheValid()) {
      const cached = getCalendarCache();
      logger.info(`📦 Returning cached calendar data (${cached.meetings.length} meetings)`);
      return cached;
    }

    // Prevent concurrent fetches (multiple page loads at once)
    if (CALENDAR_CACHE.inProgress) {
      logger.info(`📅 Calendar fetch already in progress, waiting...`);
      // Wait up to 15 seconds for the in-progress fetch (reduced from 30)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (isCalendarCacheValid()) {
          return getCalendarCache();
        }
        if (!CALENDAR_CACHE.inProgress) break;
      }
      // If still in progress after 15s, return empty result to prevent pile-up
      if (CALENDAR_CACHE.inProgress) {
        logger.warn(`📅 Calendar fetch timeout - returning empty to prevent pile-up`);
        return { meetings: [], stats: { totalEvents: 0, customerMeetings: 0, uniqueMeetings: 0, errors: 0, timedOut: true } };
      }
    }

    CALENDAR_CACHE.inProgress = true;

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysAhead);

      logger.info(`📅 Fetching calendars for ${BL_EMAILS.length} BLs (next ${daysAhead} days) - FRESH FETCH`);
      logger.info(`📅 BL emails: ${BL_EMAILS.join(', ')}`);

      const allMeetings = [];
      const errors = [];
      const blEventCounts = {}; // Track events per BL for diagnostics

      // Fetch calendars in parallel (but limit concurrency to avoid rate limits)
      const batchSize = 3; // Reduced from 5 to prevent Graph API rate limits
      for (let i = 0; i < BL_EMAILS.length; i += batchSize) {
        const batch = BL_EMAILS.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(email => this.getCalendarEvents(email, startDate, endDate))
        );

        batchResults.forEach((result, idx) => {
          const email = batch[idx];
          if (result.status === 'fulfilled') {
            const events = result.value;
            blEventCounts[email] = events.length;
            allMeetings.push(...events);
          } else {
            blEventCounts[email] = 'ERROR';
            errors.push({ email, error: result.reason?.message });
          }
        });
        
        // Small delay between batches to prevent rate limiting
        if (i + batchSize < BL_EMAILS.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Log per-BL breakdown for diagnostics
      logger.info(`📅 Per-BL event counts: ${JSON.stringify(blEventCounts)}`);

      // Filter to only customer meetings (with external attendees)
      const customerMeetings = allMeetings.filter(m => m.isCustomerMeeting);

      // Dedupe by eventId (same meeting might appear for multiple attendees)
      const uniqueMeetings = this.deduplicateMeetings(customerMeetings);

      logger.info(`📅 Total: ${allMeetings.length} events, ${customerMeetings.length} customer meetings, ${uniqueMeetings.length} unique`);

      if (errors.length > 0) {
        logger.warn(`📅 Calendar errors for ${errors.length} BLs:`, JSON.stringify(errors));
      }

      // Proactively enrich external attendees via Clay webhook (fire and forget)
      this.enrichExternalAttendeesAsync(uniqueMeetings);

      const result = {
        meetings: uniqueMeetings,
        stats: {
          totalEvents: allMeetings.length,
          customerMeetings: customerMeetings.length,
          uniqueMeetings: uniqueMeetings.length,
          errors: errors.length
        }
      };

      // Cache the result (even if some calendars failed - we have partial data)
      setCalendarCache(result);

      return result;
      
    } catch (error) {
      logger.error(`📅 Calendar fetch failed critically:`, error.message);
      CALENDAR_CACHE.inProgress = false; // Always reset on error
      // Return empty result instead of throwing
      return { meetings: [], stats: { totalEvents: 0, customerMeetings: 0, uniqueMeetings: 0, errors: 1, criticalError: error.message } };
    }
  }

  /**
   * Proactively enrich external attendees via Clay webhook
   * Runs asynchronously - doesn't block calendar fetch
   */
  async enrichExternalAttendeesAsync(meetings) {
    try {
      // Collect all unique external attendees
      const attendeeMap = new Map();
      
      for (const meeting of meetings) {
        for (const att of (meeting.externalAttendees || [])) {
          if (att.email && !attendeeMap.has(att.email.toLowerCase())) {
            attendeeMap.set(att.email.toLowerCase(), {
              name: att.name || '',
              email: att.email
            });
          }
        }
      }

      const uniqueAttendees = Array.from(attendeeMap.values());
      
      if (uniqueAttendees.length === 0) {
        logger.debug('📤 No external attendees to enrich');
        return;
      }

      logger.info(`📤 Proactively enriching ${uniqueAttendees.length} external attendees via Clay`);

      // Import Clay enrichment service
      const { enrichAttendeesViaWebhook } = require('./clayEnrichment');
      
      // Fire and forget - don't await
      enrichAttendeesViaWebhook(uniqueAttendees)
        .then(result => {
          logger.info(`📤 Clay enrichment complete: ${result.submitted} submitted, ${result.errors} errors`);
        })
        .catch(err => {
          logger.warn(`📤 Clay enrichment failed: ${err.message}`);
        });

    } catch (error) {
      logger.warn(`📤 Failed to trigger Clay enrichment: ${error.message}`);
    }
  }

  /**
   * Deduplicate meetings (same meeting may appear on multiple BL calendars)
   */
  deduplicateMeetings(meetings) {
    const seen = new Map();

    for (const meeting of meetings) {
      // Create a key based on subject + start time
      const key = `${meeting.subject}_${meeting.startDateTime}`;
      
      if (!seen.has(key)) {
        seen.set(key, meeting);
      } else {
        // Merge attendees from duplicate
        const existing = seen.get(key);
        const existingEmails = new Set(existing.allAttendees.map(a => a.email.toLowerCase()));
        
        for (const att of meeting.allAttendees) {
          if (!existingEmails.has(att.email.toLowerCase())) {
            existing.allAttendees.push(att);
            if (att.isExternal) {
              existing.externalAttendees.push(att);
            } else {
              existing.internalAttendees.push(att);
            }
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Get customer meetings for a specific date (for daily enrichment job)
   * @param {Date} targetDate - The date to fetch meetings for
   * @returns {Array} Customer meetings for that date
   */
  async getCustomerMeetingsForDate(targetDate) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.getUpcomingMeetingsForAllBLs();
    
    // Filter to target date
    return result.meetings.filter(m => {
      const meetingDate = new Date(m.startDateTime);
      return meetingDate >= startOfDay && meetingDate <= endOfDay;
    });
  }

  /**
   * Get meetings for tomorrow (for daily enrichment job)
   */
  async getTomorrowsMeetings() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.getCustomerMeetingsForDate(tomorrow);
  }

  /**
   * Test connection to Graph API using Calendars.Read permission
   */
  async testConnection() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.graphClient) {
      return { success: false, error: 'Graph client not initialized' };
    }

    try {
      // Test with a real BL calendar (uses Calendars.Read permission)
      const testEmail = 'asad.hussain@eudia.com';
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const response = await this.graphClient
        .api(`/users/${testEmail}/calendar/calendarView`)
        .query({
          startDateTime: now.toISOString(),
          endDateTime: nextWeek.toISOString(),
          $top: 5,
          $select: 'id,subject,start'
        })
        .get();
      
      return { 
        success: true, 
        testUser: testEmail,
        eventsFound: response.value?.length || 0,
        message: 'Calendar API connection successful - Calendars.Read permission working'
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        hint: error.code === 'Authorization_RequestDenied' 
          ? 'Calendars.Read permission may not be granted yet. Check Azure AD app permissions.'
          : null
      };
    }
  }

  /**
   * Get BL email list
   */
  getBLEmails() {
    return [...BL_EMAILS];
  }

  // ============================================================
  // DEPRECATED: DATABASE-BACKED CALENDAR METHODS
  // ============================================================
  // As of Phase 2 Data Residency Migration, calendar data uses
  // ephemeral in-memory cache (CALENDAR_CACHE above) instead of SQLite.
  // These methods are kept for backward compatibility but should not
  // be called from new code paths. All customer meeting data now stays
  // in memory and is fetched fresh from Microsoft Graph API.
  // ============================================================

  /**
   * @deprecated Use getUpcomingMeetingsForAllBLs() instead - uses in-memory cache
   * Sync all BL calendars to SQLite database
   * This method is deprecated per Phase 2 Data Residency Migration
   * @param {number} daysAhead - How many days ahead to fetch (default 14)
   * @returns {Object} Sync results
   */
  async syncCalendarsToDatabase(daysAhead = 14) {
    logger.warn('⚠️ [CalendarSync] syncCalendarsToDatabase is DEPRECATED - use in-memory cache instead');
    const intelligenceStore = require('./intelligenceStore');
    
    logger.info(`📅 [CalendarSync] Starting background sync for ${BL_EMAILS.length} BLs...`);
    
    // Mark sync as in progress
    await intelligenceStore.updateCalendarSyncStatus({
      status: 'syncing',
      lastSyncAt: new Date().toISOString()
    });
    
    if (!this.initialized) {
      await this.initialize();
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    const allEvents = [];
    const errors = [];
    const blEventCounts = {};

    // Fetch calendars sequentially to avoid rate limits
    for (const email of BL_EMAILS) {
      try {
        logger.info(`📅 [CalendarSync] Fetching calendar for ${email}...`);
        const events = await this.getCalendarEvents(email, startDate, endDate);
        blEventCounts[email] = events.length;
        
        // Only add customer meetings (with external attendees)
        const customerMeetings = events.filter(e => e.isCustomerMeeting);
        allEvents.push(...customerMeetings);
        
        // Small delay between users to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
        
      } catch (error) {
        blEventCounts[email] = 'ERROR';
        errors.push({ email, error: error.message });
        logger.warn(`📅 [CalendarSync] Failed to fetch calendar for ${email}: ${error.message}`);
      }
    }

    // Deduplicate before saving
    const uniqueEvents = this.deduplicateMeetings(allEvents);
    
    logger.info(`📅 [CalendarSync] Fetched ${allEvents.length} customer meetings, ${uniqueEvents.length} unique`);

    // Save to database
    const saveResult = await intelligenceStore.saveCalendarEvents(uniqueEvents);
    
    // Clear old events
    await intelligenceStore.clearOldCalendarEvents(30);
    
    // Calculate next sync time (6 hours from now)
    const nextSync = new Date();
    nextSync.setHours(nextSync.getHours() + 6);
    
    // Update sync status
    await intelligenceStore.updateCalendarSyncStatus({
      status: 'idle',
      lastSyncAt: new Date().toISOString(),
      nextSyncAt: nextSync.toISOString(),
      eventsFetched: uniqueEvents.length,
      errors: errors
    });

    // Proactively enrich attendees via Clay (fire and forget)
    this.enrichExternalAttendeesAsync(uniqueEvents);

    return {
      success: true,
      eventsFetched: uniqueEvents.length,
      eventsSaved: saveResult.saved,
      errors: errors,
      blEventCounts,
      nextSync: nextSync.toISOString()
    };
  }

  /**
   * @deprecated Use getUpcomingMeetingsForAllBLs() instead - uses in-memory cache
   * Get calendar events from SQLite - DEPRECATED per Phase 2 Data Residency Migration
   * Falls back to empty if no data, triggers background sync
   * @param {number} daysAhead - How many days ahead (default 14)
   * @returns {Object} { meetings, stats, syncStatus }
   */
  async getCalendarEventsFromDatabase(daysAhead = 14) {
    logger.warn('⚠️ getCalendarEventsFromDatabase is DEPRECATED - use getUpcomingMeetingsForAllBLs() for in-memory cache');
    const intelligenceStore = require('./intelligenceStore');
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);
    
    try {
      // Get sync status
      const syncStatus = await intelligenceStore.getCalendarSyncStatus();
      
      // Get stored events (FAST - SQLite query)
      const events = await intelligenceStore.getStoredCalendarEvents(
        startDate, 
        endDate, 
        { customerMeetingsOnly: true }
      );
      
      // Convert stored format back to normalized meeting format
      const meetings = events.map(e => ({
        eventId: e.event_id,
        subject: e.subject,
        startDateTime: e.start_datetime,
        endDateTime: e.end_datetime,
        ownerEmail: e.owner_email,
        externalAttendees: e.externalAttendees,
        internalAttendees: e.internalAttendees,
        allAttendees: e.allAttendees,
        accountId: e.account_id,
        accountName: e.account_name,
        isCustomerMeeting: e.isCustomerMeeting,
        location: e.location,
        bodyPreview: e.body_preview,
        webLink: e.web_link
      }));
      
      const stats = await intelligenceStore.getCalendarStats();
      
      // Check if we need a background sync
      let needsSync = false;
      if (!syncStatus || !syncStatus.last_sync_at) {
        needsSync = true;
      } else {
        const lastSync = new Date(syncStatus.last_sync_at);
        const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync > 6) {
          needsSync = true;
        }
      }
      
      return {
        meetings,
        stats: {
          totalEvents: stats.totalEvents,
          customerMeetings: stats.customerMeetings,
          uniqueMeetings: meetings.length,
          lastSync: syncStatus?.last_sync_at || null,
          nextSync: syncStatus?.next_sync_at || null,
          syncStatus: syncStatus?.status || 'unknown'
        },
        needsSync
      };
      
    } catch (error) {
      logger.error(`📅 [CalendarDB] Failed to read from database:`, error.message);
      return {
        meetings: [],
        stats: { totalEvents: 0, customerMeetings: 0, uniqueMeetings: 0, error: error.message },
        needsSync: true
      };
    }
  }

  /**
   * @deprecated No longer needed - in-memory cache handles freshness automatically
   * Check if calendar data is stale (>6 hours old) or missing
   * This method is deprecated per Phase 2 Data Residency Migration
   * @returns {boolean} True if sync is needed
   */
  async isCalendarSyncNeeded() {
    logger.warn('⚠️ isCalendarSyncNeeded is DEPRECATED - in-memory cache handles freshness');
    const intelligenceStore = require('./intelligenceStore');
    
    try {
      const syncStatus = await intelligenceStore.getCalendarSyncStatus();
      
      if (!syncStatus || !syncStatus.last_sync_at) {
        return true;
      }
      
      const lastSync = new Date(syncStatus.last_sync_at);
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      
      return hoursSinceSync > 6;
    } catch (error) {
      return true;
    }
  }
}

/**
 * Get live calendar cache status for UI display
 * Replaces deprecated calendarSyncJob.getSyncStatus()
 */
function getCalendarCacheStatus() {
  const hasData = CALENDAR_CACHE.data && CALENDAR_CACHE.data.meetings;
  const meetingCount = hasData ? CALENDAR_CACHE.data.meetings.length : 0;
  const cacheAge = CALENDAR_CACHE.timestamp ? Math.round((Date.now() - CALENDAR_CACHE.timestamp) / 1000) : null;
  const isValid = isCalendarCacheValid();

  return {
    syncInProgress: CALENDAR_CACHE.inProgress,
    databaseStats: {
      totalEvents: meetingCount,
      customerMeetings: meetingCount
    },
    lastSync: CALENDAR_CACHE.timestamp ? new Date(CALENDAR_CACHE.timestamp).toISOString() : null,
    cacheAgeSeconds: cacheAge,
    cacheValid: isValid
  };
}

// Singleton instance
const calendarService = new CalendarService();

module.exports = {
  calendarService,
  initializeCalendar: () => calendarService.initialize(),
  getCalendarCacheStatus,
  BL_EMAILS,
  // Meeting classification exports
  classifyMeeting,
  classifyMeetingByPattern,
  MEETING_TYPES,
  MEETING_TYPE_PATTERNS
};

