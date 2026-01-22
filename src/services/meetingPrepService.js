/**
 * Meeting Prep Service
 * Handles meeting preparation, combining manual entries with Salesforce Events
 */

const { v4: uuidv4 } = require('uuid');
const intelligenceStore = require('./intelligenceStore');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');

// Demo product options
const DEMO_PRODUCTS = [
  { id: 'contracts', label: 'Contracts' },
  { id: 'sigma', label: 'Sigma' },
  { id: 'insights', label: 'Insights' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'litigation', label: 'Litigation' },
  { id: 'other', label: 'Other' }
];

// First meeting template defaults (original)
const FIRST_MEETING_TEMPLATES = {
  agenda: [
    'Introductions and company overview',
    'Discovery: Current challenges and priorities',
    'Next steps and follow-up'
  ],
  goals: [
    'Understand key pain points and use cases',
    'Identify decision-makers and timeline',
    'Determine fit for pilot or engagement'
  ]
};

// First meeting template for BLs (updated per team standards)
const FIRST_MEETING_BL_TEMPLATE = {
  agenda: [
    'Discovery around current state of AI at the customer (qualification opportunity)',
    'Give the pitch',
    'Introduce the CAB'
  ],
  goals: [
    'Qualify customer',
    'Identify stakeholder for priority use case, CLO agrees to connect us',
    'CLO agrees to learn more about CAB and/or sign a memorandum'
  ]
};

// Accounts/subjects to exclude from meeting prep
const EXCLUDED_ACCOUNTS = [
  'Event Triage',
  'Sample',
  'Test',
  'Acme',
  'Sandbox'
];

// Ghost attendee patterns - conference rooms, dial-ins, etc.
const GHOST_ATTENDEE_PATTERNS = {
  namePatterns: ['conference', 'meeting room', 'video enabled', 'dial-in', 'bridge', 'huddle', 'board room', 'training room', 'zoom room', 'teams room', 'webex', 'polycom'],
  emailPrefixes: ['corp', 'conf', 'room', 'mtg', 'bridge', 'dial', 'noreply', 'calendar', 'booking']
};

/**
 * Check if an attendee is a ghost (conference room, dial-in, etc.)
 */
function isGhostAttendee(attendee) {
  const email = (attendee.email || '').toLowerCase();
  const name = (attendee.name || '').toLowerCase();
  
  // Check name patterns
  if (GHOST_ATTENDEE_PATTERNS.namePatterns.some(p => name.includes(p))) return true;
  
  // Check email prefixes
  const localPart = email.split('@')[0];
  if (GHOST_ATTENDEE_PATTERNS.emailPrefixes.some(p => localPart.startsWith(p) && /\d/.test(localPart))) return true;
  
  // Check for room codes (e.g., "State Street Salem 2320 (11)")
  if (/\(\d+\)/.test(attendee.name || '') && /\d{3,}/.test(attendee.name || '')) return true;
  
  // Check for system emails (all caps with numbers)
  if (/^[A-Z]{4,}[A-Z0-9]*\d{2,}[A-Z]?@/i.test(email)) return true;
  
  return false;
}

/**
 * Check if a meeting should be excluded from the meeting prep view
 * Filters out: internal-only, calendar holds, canceled, ghost-only meetings
 */
function shouldExcludeMeeting(meeting) {
  const title = (meeting.meetingTitle || meeting.meeting_title || '').toLowerCase();
  
  // Canceled meetings
  if (title.startsWith('canceled:') || title.startsWith('cancelled:')) {
    return true;
  }
  
  // Get attendees
  const external = meeting.externalAttendees || [];
  const internal = meeting.internalAttendees || [];
  
  // No external attendees = internal only or calendar hold
  if (external.length === 0) {
    return true;
  }
  
  // Filter out ghost attendees
  const realExternal = external.filter(a => !isGhostAttendee(a));
  
  // Only ghost attendees after filtering
  if (realExternal.length === 0) {
    return true;
  }
  
  // Excluded accounts
  const accountName = (meeting.accountName || meeting.account_name || '').toLowerCase();
  if (EXCLUDED_ACCOUNTS.some(ea => accountName.includes(ea.toLowerCase()))) {
    return true;
  }
  
  return false;
}

/**
 * Create a new meeting entry (manual)
 */
async function createMeeting(data) {
  const meetingId = data.meetingId || uuidv4();
  const isFirst = await isFirstMeeting(data.accountId);
  
  const meetingData = {
    meetingId,
    accountId: data.accountId,
    accountName: data.accountName,
    meetingTitle: data.meetingTitle,
    meetingDate: data.meetingDate,
    attendees: data.attendees || [],
    agenda: isFirst ? FIRST_MEETING_TEMPLATES.agenda : ['', '', ''],
    goals: isFirst ? FIRST_MEETING_TEMPLATES.goals : ['', '', ''],
    demoRequired: false,
    demoSelections: [],
    contextSnapshot: {},
    isFirstMeeting: isFirst,
    authorId: data.authorId,
    source: 'manual'
  };
  
  await intelligenceStore.saveMeetingPrep(meetingData);
  return { ...meetingData, meetingId };
}

/**
 * Save meeting prep (update existing)
 */
async function saveMeetingPrep(data) {
  return intelligenceStore.saveMeetingPrep(data);
}

/**
 * Get meeting prep by ID
 */
async function getMeetingPrep(meetingId) {
  return intelligenceStore.getMeetingPrep(meetingId);
}

/**
 * Get meeting preps by account (for context)
 */
async function getMeetingPrepsByAccount(accountId) {
  return intelligenceStore.getMeetingPrepsByAccount(accountId);
}

/**
 * Delete a meeting prep
 */
async function deleteMeetingPrep(meetingId) {
  return intelligenceStore.deleteMeetingPrep(meetingId);
}

/**
 * Check if this is the first meeting with an account
 * Checks: prior meeting preps + Salesforce closed-won deals
 */
async function isFirstMeeting(accountId) {
  try {
    // Check for prior meeting preps
    const priorPreps = await intelligenceStore.getMeetingPrepsByAccount(accountId);
    if (priorPreps && priorPreps.length > 0) {
      return false;
    }
    
    // Check Salesforce for closed-won deals on this account
    const sfQuery = `
      SELECT COUNT() 
      FROM Opportunity 
      WHERE AccountId = '${accountId}' 
        AND IsClosed = true 
        AND IsWon = true
    `;
    
    const result = await query(sfQuery, true);
    if (result?.totalSize > 0) {
      return false;
    }
    
    // Check for prior Salesforce Events
    const eventsQuery = `
      SELECT COUNT() 
      FROM Event 
      WHERE AccountId = '${accountId}' 
        AND StartDateTime < TODAY
    `;
    
    const eventsResult = await query(eventsQuery, true);
    if (eventsResult?.totalSize > 0) {
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error checking first meeting status:', error);
    return true; // Default to first meeting if check fails
  }
}

/**
 * Get upcoming meetings for a date range
 * 
 * SOURCE PRIORITY:
 * 1. Outlook Calendar - PRIMARY source (has attendees, Clay enrichment works)
 * 2. Manual entries - User-created preps
 * 
 * NOTE: Salesforce Events are NO LONGER included as meeting sources.
 * They don't have attendee lists, causing "Attendees not specified" issues.
 * SF is still used for account ID lookups to enrich Outlook events with context.
 */
async function getUpcomingMeetings(startDate, endDate) {
  try {
    // Get manual entries from SQLite
    const manualMeetings = await intelligenceStore.getUpcomingMeetingPreps(startDate, endDate);
    
    // Get Outlook Calendar events (PRIMARY source - has attendees!)
    let outlookEvents = [];
    try {
      const { calendarService } = require('./calendarService');
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysAhead = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
      const result = await calendarService.getUpcomingMeetingsForAllBLs(daysAhead);
      outlookEvents = result.meetings || [];
      logger.info(`[MeetingPrep] Fetched ${outlookEvents.length} Outlook meetings`);
    } catch (outlookError) {
      logger.error('[MeetingPrep] Outlook calendar fetch failed:', outlookError.message);
      // Continue with manual meetings only - no SF fallback
    }
    
    // Build SF account lookup for matching Outlook events to SF account IDs
    // This allows us to get account context without using SF as a meeting source
    const sfAccountLookup = await buildSfAccountLookup();
    logger.debug(`[MeetingPrep] SF Account lookup: ${sfAccountLookup.size} accounts for context matching`);
    
    const meetingsMap = new Map();
    
    // Step 1: Add manual meetings (normalize attendees structure)
    for (const meeting of manualMeetings) {
      // Parse attendees and split into external/internal arrays
      const allAttendees = meeting.attendees || [];
      const externalAttendees = allAttendees.filter(a => a.isExternal !== false);
      const internalAttendees = allAttendees.filter(a => a.isExternal === false);
      
      meetingsMap.set(meeting.meeting_id, {
        ...meeting,
        meetingId: meeting.meeting_id,
        accountId: meeting.account_id,
        accountName: meeting.account_name,
        meetingTitle: meeting.meeting_title,
        meetingDate: meeting.meeting_date,
        externalAttendees,
        internalAttendees,
        source: meeting.source === 'manual_test' ? 'manual' : (meeting.source || 'manual')
      });
    }
    
    // Step 2: Add Outlook events (PRIMARY source - has attendees!)
    for (const event of outlookEvents) {
      const extractedAccountName = extractAccountFromAttendees(event.externalAttendees);
      
      // Try to match to SF account for context enrichment
      const accountNameLower = extractedAccountName.toLowerCase().trim();
      const sfMatch = findBestAccountMatch(accountNameLower, sfAccountLookup);
      
      // Normalize Outlook event with SF account ID if matched
      const normalizedEvent = {
        meetingId: event.eventId,
        accountId: sfMatch?.accountId || null,
        accountName: sfMatch?.accountName || extractedAccountName,
        meetingTitle: event.subject,
        meetingDate: event.startDateTime,
        endDate: event.endDateTime,
        owner: event.ownerEmail,
        ownerEmail: event.ownerEmail,
        attendees: event.allAttendees,
        externalAttendees: event.externalAttendees,
        internalAttendees: event.internalAttendees,
        source: 'outlook'
      };
      
      // Check if similar meeting already exists in manual entries
      const isDupe = Array.from(meetingsMap.values()).some(m => {
        const mDate = new Date(m.meetingDate || m.meeting_date);
        const eDate = new Date(normalizedEvent.meetingDate);
        return Math.abs(mDate - eDate) < 3600000 && // Within 1 hour
               (m.meetingTitle || m.meeting_title || '').toLowerCase().includes(normalizedEvent.meetingTitle?.toLowerCase()?.substring(0, 20) || '');
      });
      
      if (!isDupe) {
        meetingsMap.set(normalizedEvent.meetingId, normalizedEvent);
      }
    }
    
    // NOTE: Salesforce events are intentionally NOT added as meeting sources
    // They lack attendee data and cause "Attendees not specified" issues
    logger.info(`[MeetingPrep] Using Outlook Calendar only - SF events excluded (no attendees)`)
    
    // Convert to array and sort by date
    const allMeetings = Array.from(meetingsMap.values());
    allMeetings.sort((a, b) => new Date(a.meetingDate || a.meeting_date) - new Date(b.meetingDate || b.meeting_date));
    
    // Filter out internal-only, calendar holds, canceled meetings, and ghost-only meetings
    const filteredMeetings = allMeetings.filter(m => !shouldExcludeMeeting(m));
    
    const excludedCount = allMeetings.length - filteredMeetings.length;
    logger.info(`[MeetingPrep] Total meetings: ${filteredMeetings.length} (Excluded ${excludedCount} internal/hold/canceled)`);
    logger.debug(`[MeetingPrep] Sources - Manual: ${manualMeetings.length}, Outlook: ${outlookEvents.length}`);
    
    return filteredMeetings;
  } catch (error) {
    logger.error('Error getting upcoming meetings:', error);
    return [];
  }
}

/**
 * Build a lookup map of SF account names to account IDs
 * Used to enrich Outlook events with SF account context
 */
async function buildSfAccountLookup() {
  const lookup = new Map();
  
  try {
    // Query accounts that have active opportunities or are customers
    const accountQuery = `
      SELECT Id, Name, Website
      FROM Account
      WHERE (
        Customer_Type__c IN ('Revenue', 'Pilot', 'LOI, with $ attached', 'LOI, no $ attached')
        OR Id IN (SELECT AccountId FROM Opportunity WHERE IsClosed = false)
      )
      AND Name != null
      ORDER BY Name ASC
      LIMIT 500
    `;
    
    const result = await query(accountQuery, true);
    
    if (result?.records) {
      for (const account of result.records) {
        const nameKey = (account.Name || '').toLowerCase().trim();
        if (nameKey) {
          lookup.set(nameKey, {
            accountId: account.Id,
            accountName: account.Name,
            website: account.Website
          });
          
          // Also add domain-based keys from website
          if (account.Website) {
            try {
              const url = new URL(account.Website.startsWith('http') ? account.Website : 'https://' + account.Website);
              const domain = url.hostname.replace('www.', '').split('.')[0];
              if (domain && domain.length > 2) {
                lookup.set(domain.toLowerCase(), {
                  accountId: account.Id,
                  accountName: account.Name,
                  website: account.Website
                });
              }
            } catch (e) {
              // Ignore invalid URLs
            }
          }
        }
      }
    }
    
    logger.debug(`[MeetingPrep] Built SF account lookup with ${lookup.size} entries`);
  } catch (error) {
    logger.warn('[MeetingPrep] Failed to build SF account lookup:', error.message);
  }
  
  return lookup;
}

/**
 * Find best matching SF account for a given account name
 * Supports exact match, partial match, and fuzzy matching
 */
function findBestAccountMatch(accountNameLower, sfAccountLookup) {
  // Exact match
  if (sfAccountLookup.has(accountNameLower)) {
    return sfAccountLookup.get(accountNameLower);
  }
  
  // Try without common suffixes
  const cleanedName = accountNameLower
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?)$/i, '')
    .trim();
  
  if (sfAccountLookup.has(cleanedName)) {
    return sfAccountLookup.get(cleanedName);
  }
  
  // Try partial match (account name contains or is contained by)
  for (const [key, value] of sfAccountLookup.entries()) {
    if (key.includes(cleanedName) || cleanedName.includes(key)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Extract account name from external attendees (best guess from email domains)
 */
function extractAccountFromAttendees(attendees) {
  if (!attendees || attendees.length === 0) return 'Unknown';
  
  // Get most common external domain
  const domains = attendees.map(a => {
    const email = a.email || '';
    return email.split('@')[1];
  }).filter(Boolean);
  
  if (domains.length === 0) return 'Unknown';
  
  const domainCounts = {};
  domains.forEach(d => { domainCounts[d] = (domainCounts[d] || 0) + 1; });
  const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  
  if (topDomain) {
    // Convert domain to company name (e.g., stripe.com → Stripe)
    const name = topDomain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return 'Unknown';
}

/**
 * Get Salesforce Events for date range
 * Filters out: Event Triage, internal-only meetings, excluded accounts
 */
async function getSalesforceEvents(startDate, endDate) {
  try {
    // Format dates for SOQL (remove milliseconds, ensure proper format)
    const formatDateForSOQL = (dateStr) => {
      const d = new Date(dateStr);
      return d.toISOString().replace('.000Z', 'Z');
    };
    
    const startFormatted = formatDateForSOQL(startDate);
    const endFormatted = formatDateForSOQL(endDate);
    
    logger.info(`[MeetingPrep] Querying SF Events from ${startFormatted} to ${endFormatted}`);
    
    // Query events with EventRelations for all attendees
    const sfQuery = `
      SELECT Id, Subject, StartDateTime, EndDateTime,
             Account.Id, Account.Name, Owner.Name, Owner.Email,
             WhoId, Who.Name, Who.Email, Description,
             (SELECT RelationId, Relation.Name, Relation.Email FROM EventRelations)
      FROM Event
      WHERE StartDateTime >= ${startFormatted}
        AND StartDateTime <= ${endFormatted}
        AND AccountId != null
        AND (NOT Account.Name LIKE '%Event Triage%')
        AND (NOT Account.Name LIKE '%Sample%')
        AND (NOT Account.Name LIKE '%Test%')
        AND (NOT Account.Name LIKE '%Acme%')
        AND (NOT Subject LIKE '%Event Triage%')
      ORDER BY StartDateTime ASC
      LIMIT 100
    `;
    
    const result = await query(sfQuery, true);
    
    logger.info(`[MeetingPrep] SF Events query returned ${result?.records?.length || 0} records`);
    
    if (!result?.records) return [];
    
    // Process events and filter out internal-only meetings
    const processedEvents = [];
    
    for (const event of result.records) {
      // Parse all attendees from EventRelations
      const allAttendees = [];
      let hasExternalAttendee = false;
      
      // Add primary contact (Who)
      if (event.Who?.Name) {
        const email = event.Who.Email || '';
        const isExternal = !email.toLowerCase().endsWith('@eudia.com');
        if (isExternal) hasExternalAttendee = true;
        allAttendees.push({
          name: event.Who.Name,
          email: email,
          contactId: event.WhoId,
          isExternal
        });
      }
      
      // Add EventRelations (other attendees)
      if (event.EventRelations?.records) {
        for (const rel of event.EventRelations.records) {
          if (rel.Relation) {
            const email = rel.Relation.Email || '';
            const isExternal = !email.toLowerCase().endsWith('@eudia.com');
            if (isExternal) hasExternalAttendee = true;
            
            // Avoid duplicates
            if (!allAttendees.find(a => a.name === rel.Relation.Name)) {
              allAttendees.push({
                name: rel.Relation.Name,
                email: email,
                contactId: rel.RelationId,
                isExternal
              });
            }
          }
        }
      }
      
      // Check account name - if it looks like an external company, consider it external
      const accountName = event.Account?.Name || '';
      if (accountName && !accountName.toLowerCase().includes('eudia')) {
        hasExternalAttendee = true;
      }
      
      // Skip internal-only meetings (no external attendees and no real account)
      // But keep meetings that have a valid external account
      if (!hasExternalAttendee && allAttendees.length > 0) {
        // All attendees are internal - skip unless it has a real customer account
        const isRealAccount = accountName && 
          !EXCLUDED_ACCOUNTS.some(ex => accountName.toLowerCase().includes(ex.toLowerCase()));
        
        if (!isRealAccount) {
          logger.debug(`[MeetingPrep] Skipping internal-only meeting: ${event.Subject}`);
          continue;
        }
      }
      
      // Separate into external and internal attendees
      const externalAttendees = allAttendees.filter(a => a.isExternal);
      const internalAttendees = allAttendees.filter(a => !a.isExternal);
      
      // Add owner as internal if not already in list
      if (event.Owner?.Name && !internalAttendees.find(a => a.name === event.Owner.Name)) {
        internalAttendees.push({
          name: event.Owner.Name,
          email: event.Owner.Email || '',
          isExternal: false
        });
      }
      
      processedEvents.push({
        meetingId: event.Id,
        accountId: event.Account?.Id,
        accountName: event.Account?.Name,
        meetingTitle: event.Subject,
        meetingDate: event.StartDateTime,
        endDate: event.EndDateTime,
        owner: event.Owner?.Name,
        ownerId: event.OwnerId,
        attendees: allAttendees,
        externalAttendees,
        internalAttendees,
        description: event.Description,
        source: 'salesforce'
      });
    }
    
    logger.info(`[MeetingPrep] After filtering: ${processedEvents.length} meetings (excluded ${result.records.length - processedEvents.length} internal-only)`);
    
    return processedEvents;
  } catch (error) {
    logger.error('Error fetching Salesforce events:', error);
    return [];
  }
}

/**
 * Get meetings for tomorrow (for notification digest)
 */
async function getTomorrowsMeetings() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  
  const startDate = tomorrow.toISOString();
  const endDate = dayAfter.toISOString();
  
  const meetings = await getUpcomingMeetings(startDate, endDate);
  
  return meetings.map(m => ({
    accountName: m.accountName || m.account_name,
    meetingTitle: m.meetingTitle || m.meeting_title,
    meetingDate: m.meetingDate || m.meeting_date,
    prepUrl: `https://gtm-wizard.onrender.com/gtm/meeting-prep/${m.meetingId || m.meeting_id}`,
    hasPrep: !!(m.agenda && m.agenda.some(a => a && a.trim()))
  }));
}

/**
 * Get contacts for an account (for attendee dropdown)
 */
async function getAccountContacts(accountId) {
  try {
    const sfQuery = `
      SELECT Id, Name, Email, Title
      FROM Contact
      WHERE AccountId = '${accountId}'
        AND IsDeleted = false
      ORDER BY Name ASC
      LIMIT 50
    `;
    
    const result = await query(sfQuery, true);
    
    if (!result?.records) return [];
    
    return result.records.map(contact => ({
      contactId: contact.Id,
      name: contact.Name,
      email: contact.Email,
      title: contact.Title,
      isExternal: false
    }));
  } catch (error) {
    logger.error('Error fetching account contacts:', error);
    return [];
  }
}

/**
 * Get all accounts (for meeting creation dropdown)
 */
async function getAccounts() {
  try {
    const sfQuery = `
      SELECT Id, Name, Customer_Type__c, Owner.Name
      FROM Account
      WHERE Customer_Type__c IN ('Existing', 'New')
        AND (NOT Name LIKE '%Sample%')
        AND (NOT Name LIKE '%Test%')
      ORDER BY Name ASC
      LIMIT 500
    `;
    
    const result = await query(sfQuery, true);
    
    if (!result?.records) return [];
    
    return result.records.map(acc => ({
      accountId: acc.Id,
      accountName: acc.Name,
      customerType: acc.Customer_Type__c,
      owner: acc.Owner?.Name
    }));
  } catch (error) {
    logger.error('Error fetching accounts:', error);
    return [];
  }
}

/**
 * Group meetings by day of week
 * Uses LOCAL day for display (user sees meetings in their timezone)
 */
function groupMeetingsByDay(meetings) {
  const days = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: []
  };
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  for (const meeting of meetings) {
    const dateStr = meeting.meetingDate || meeting.meeting_date;
    if (!dateStr) continue;
    
    const date = new Date(dateStr);
    // Use LOCAL day for display (user sees in their timezone)
    const localDay = date.getDay();
    const dayName = dayNames[localDay];
    
    logger.debug(`[MeetingPrep] Meeting "${meeting.meetingTitle || meeting.meeting_title}" on ${dateStr} -> Local day ${localDay} (${dayName})`);
    
    if (days[dayName]) {
      days[dayName].push(meeting);
    }
  }
  
  // Log summary
  logger.info(`[MeetingPrep] Grouped meetings: Mon=${days.monday.length}, Tue=${days.tuesday.length}, Wed=${days.wednesday.length}, Thu=${days.thursday.length}, Fri=${days.friday.length}`);
  
  return days;
}

/**
 * Get BL users for filter dropdown
 * Uses hardcoded list of actual Business Leads (US and EU Pods)
 */
async function getBLUsers() {
  // Actual Business Leads - US and EU Pods
  const BUSINESS_LEAD_NAMES = [
    // US Pod
    'Asad Hussain',
    'Himanshu Agarwal',
    'Julie Stefanich',
    'Olivia Jung',
    'Ananth Cherukupally',
    'Justin Hills',
    'Mike Masiello',
    // EU Pod
    'Greg MacHale',
    'Nathan Shine',
    'Tom Clancy',
    'Conor Molloy',
    'Alex Fox',
    'Nicola Fratini',
    'Emer Flynn',
    'Riona McHale'
  ];
  
  try {
    // Build SOQL to find these specific users
    const nameConditions = BUSINESS_LEAD_NAMES.map(name => `Name = '${name}'`).join(' OR ');
    const sfQuery = `
      SELECT Id, Name, Email
      FROM User
      WHERE IsActive = true
        AND (${nameConditions})
      ORDER BY Name ASC
    `;
    
    const result = await query(sfQuery, true);
    
    if (!result?.records) return [];
    
    return result.records.map(user => ({
      userId: user.Id,
      name: user.Name,
      email: user.Email
    }));
  } catch (error) {
    logger.error('Error fetching BL users:', error);
    return [];
  }
}

/**
 * Filter meetings by user (owner or attendee)
 * Matches by userId (Salesforce) or email (Outlook)
 */
function filterMeetingsByUser(meetings, userId, userEmail = null) {
  if (!userId) return meetings;
  
  const userEmailLower = userEmail?.toLowerCase();
  
  logger.debug(`[Filter] Filtering ${meetings.length} meetings for userId=${userId}, email=${userEmail}`);
  
  return meetings.filter(meeting => {
    const meetingTitle = meeting.meeting_title || meeting.meetingTitle || 'Untitled';
    
    // Check if user is owner (SF events use ownerId)
    if (meeting.ownerId === userId) {
      logger.debug(`[Filter] MATCH (ownerId): ${meetingTitle}`);
      return true;
    }
    
    // Check if user is owner by email (Outlook events use ownerEmail or owner field)
    if (userEmailLower) {
      // Check ownerEmail field directly
      if (meeting.ownerEmail && meeting.ownerEmail.toLowerCase() === userEmailLower) {
        logger.debug(`[Filter] MATCH (ownerEmail): ${meetingTitle}`);
        return true;
      }
      
      // Check owner field (can be string or object)
      if (meeting.owner) {
        const ownerEmail = typeof meeting.owner === 'string' ? meeting.owner : meeting.owner.email;
        if (ownerEmail && ownerEmail.toLowerCase() === userEmailLower) {
          logger.debug(`[Filter] MATCH (owner): ${meetingTitle}`);
          return true;
        }
      }
    }
    
    // Check if user is in any attendee list (internal, external, or all)
    const allAttendees = [
      ...(meeting.attendees || []),
      ...(meeting.internalAttendees || []),
      ...(meeting.allAttendees || [])
    ];
    
    const isAttendee = allAttendees.some(a => {
      if (a.userId === userId || a.contactId === userId) return true;
      if (userEmailLower && a.email && a.email.toLowerCase() === userEmailLower) return true;
      return false;
    });
    
    if (isAttendee) {
      logger.debug(`[Filter] MATCH (attendee): ${meetingTitle}`);
      return true;
    }
    
    // Check organizer field (Outlook meetings)
    if (userEmailLower && meeting.organizer?.email) {
      if (meeting.organizer.email.toLowerCase() === userEmailLower) {
        logger.debug(`[Filter] MATCH (organizer): ${meetingTitle}`);
        return true;
      }
    }
    
    logger.debug(`[Filter] NO MATCH: ${meetingTitle} | ownerEmail=${meeting.ownerEmail}, source=${meeting.source}`);
    return false;
  });
}

/**
 * Get week date range (This week Mon through next week Fri - 2 week view)
 * Uses UTC to avoid timezone issues with Salesforce
 */
function getCurrentWeekRange() {
  const now = new Date();
  
  // Get current day in UTC (0=Sunday, 1=Monday, etc.)
  const dayOfWeek = now.getUTCDay();
  
  // Calculate Monday of this week (in UTC)
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
    0, 0, 0, 0
  ));
  
  // Calculate NEXT Friday end of day (11 days from Monday = next week Friday)
  const nextFriday = new Date(Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate() + 11,  // 11 days = next week Friday
    23, 59, 59, 999
  ));
  
  logger.info(`[MeetingPrep] Week range: ${monday.toISOString()} to ${nextFriday.toISOString()} (2-week view)`);
  
  return {
    start: monday.toISOString(),
    end: nextFriday.toISOString(),
    mondayDate: monday
  };
}

module.exports = {
  // Core CRUD
  createMeeting,
  saveMeetingPrep,
  getMeetingPrep,
  getMeetingPrepsByAccount,
  deleteMeetingPrep,
  
  // Meeting retrieval
  getUpcomingMeetings,
  getSalesforceEvents,
  getTomorrowsMeetings,
  
  // Account/Contact helpers
  getAccountContacts,
  getAccounts,
  isFirstMeeting,
  getBLUsers,
  
  // Utility
  groupMeetingsByDay,
  getCurrentWeekRange,
  filterMeetingsByUser,
  
  // Constants
  DEMO_PRODUCTS,
  FIRST_MEETING_TEMPLATES,
  FIRST_MEETING_BL_TEMPLATE,
  EXCLUDED_ACCOUNTS
};

