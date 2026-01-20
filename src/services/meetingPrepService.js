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
 * Get upcoming meetings for a date range (combines manual + Salesforce + Outlook)
 */
async function getUpcomingMeetings(startDate, endDate) {
  try {
    // Get manual entries from SQLite
    const manualMeetings = await intelligenceStore.getUpcomingMeetingPreps(startDate, endDate);
    
    // Get Salesforce Events
    const sfEvents = await getSalesforceEvents(startDate, endDate);
    
    // Get Outlook Calendar events (if available)
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
      logger.warn('[MeetingPrep] Outlook calendar fetch failed, using SF only:', outlookError.message);
    }
    
    // Merge and dedupe (Salesforce events take precedence if same ID)
    const meetingsMap = new Map();
    
    // Add manual meetings first
    for (const meeting of manualMeetings) {
      meetingsMap.set(meeting.meeting_id, {
        ...meeting,
        source: 'manual'
      });
    }
    
    // Add Outlook events
    for (const event of outlookEvents) {
      // Normalize Outlook event to match our format
      const normalizedEvent = {
        meetingId: event.eventId,
        accountId: null, // Outlook doesn't have SF account ID
        accountName: extractAccountFromAttendees(event.externalAttendees),
        meetingTitle: event.subject,
        meetingDate: event.startDateTime,
        endDate: event.endDateTime,
        owner: event.ownerEmail,
        attendees: event.allAttendees,
        externalAttendees: event.externalAttendees,
        internalAttendees: event.internalAttendees,
        source: 'outlook'
      };
      
      // Check if similar meeting already exists (same time, same subject)
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
    
    // Add/override with Salesforce events
    for (const event of sfEvents) {
      const existingManual = manualMeetings.find(m => 
        m.account_id === event.accountId && 
        Math.abs(new Date(m.meeting_date) - new Date(event.meetingDate)) < 3600000 // Within 1 hour
      );
      
      if (existingManual) {
        // Update manual entry with SF event ID
        meetingsMap.set(existingManual.meeting_id, {
          ...existingManual,
          salesforceEventId: event.meetingId,
          source: 'synced'
        });
      } else {
        meetingsMap.set(event.meetingId, {
          ...event,
          source: 'salesforce'
        });
      }
    }
    
    // Convert to array and sort by date
    const allMeetings = Array.from(meetingsMap.values());
    allMeetings.sort((a, b) => new Date(a.meetingDate || a.meeting_date) - new Date(b.meetingDate || b.meeting_date));
    
    logger.info(`[MeetingPrep] Total meetings: ${allMeetings.length} (Manual: ${manualMeetings.length}, SF: ${sfEvents.length}, Outlook: ${outlookEvents.length})`);
    
    return allMeetings;
  } catch (error) {
    logger.error('Error getting upcoming meetings:', error);
    return [];
  }
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
 */
function filterMeetingsByUser(meetings, userId) {
  if (!userId) return meetings;
  
  return meetings.filter(meeting => {
    // Check if user is owner
    if (meeting.ownerId === userId) return true;
    
    // Check if user is in attendees
    const attendees = meeting.attendees || meeting.internalAttendees || [];
    return attendees.some(a => a.userId === userId || a.contactId === userId);
  });
}

/**
 * Get week date range (Mon-Fri of current week)
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
  
  // Calculate Friday end of day (in UTC)
  const friday = new Date(Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate() + 4,
    23, 59, 59, 999
  ));
  
  logger.info(`[MeetingPrep] Week range: ${monday.toISOString()} to ${friday.toISOString()}`);
  
  return {
    start: monday.toISOString(),
    end: friday.toISOString(),
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

