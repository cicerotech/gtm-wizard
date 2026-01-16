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

// First meeting template defaults
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
 * Get upcoming meetings for a date range (combines manual + Salesforce)
 */
async function getUpcomingMeetings(startDate, endDate) {
  try {
    // Get manual entries from SQLite
    const manualMeetings = await intelligenceStore.getUpcomingMeetingPreps(startDate, endDate);
    
    // Get Salesforce Events
    const sfEvents = await getSalesforceEvents(startDate, endDate);
    
    // Merge and dedupe (Salesforce events take precedence if same ID)
    const meetingsMap = new Map();
    
    // Add manual meetings first
    for (const meeting of manualMeetings) {
      meetingsMap.set(meeting.meeting_id, {
        ...meeting,
        source: 'manual'
      });
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
    
    return allMeetings;
  } catch (error) {
    logger.error('Error getting upcoming meetings:', error);
    return [];
  }
}

/**
 * Get Salesforce Events for date range
 */
async function getSalesforceEvents(startDate, endDate) {
  try {
    const sfQuery = `
      SELECT Id, Subject, StartDateTime, EndDateTime,
             Account.Id, Account.Name, Owner.Name, 
             WhoId, Who.Name, Description
      FROM Event
      WHERE StartDateTime >= ${startDate}
        AND StartDateTime <= ${endDate}
        AND AccountId != null
      ORDER BY StartDateTime ASC
      LIMIT 100
    `;
    
    const result = await query(sfQuery, true);
    
    if (!result?.records) return [];
    
    return result.records.map(event => ({
      meetingId: event.Id,
      accountId: event.Account?.Id,
      accountName: event.Account?.Name,
      meetingTitle: event.Subject,
      meetingDate: event.StartDateTime,
      endDate: event.EndDateTime,
      owner: event.Owner?.Name,
      attendees: event.Who?.Name ? [{ name: event.Who.Name, contactId: event.WhoId, isExternal: false }] : [],
      description: event.Description,
      source: 'salesforce'
    }));
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
    const date = new Date(meeting.meetingDate || meeting.meeting_date);
    const dayName = dayNames[date.getDay()];
    if (days[dayName]) {
      days[dayName].push(meeting);
    }
  }
  
  return days;
}

/**
 * Get week date range (Mon-Fri of current week)
 */
function getCurrentWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  
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
  
  // Utility
  groupMeetingsByDay,
  getCurrentWeekRange,
  
  // Constants
  DEMO_PRODUCTS,
  FIRST_MEETING_TEMPLATES
};

