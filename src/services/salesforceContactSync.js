/**
 * Salesforce Contact Sync Service
 * 
 * Handles:
 * - Finding existing contacts by email
 * - Creating new contacts when they don't exist (linked to Account)
 * - Creating Salesforce Events with meeting notes
 * - Linking events to Contacts and Accounts for Einstein Activity Capture
 * 
 * Safety measures:
 * - Never creates orphan contacts (AccountId required)
 * - Dedupes by email before creating
 * - Rate limits contact creation (max 10 per batch)
 * - Full audit logging
 */

const logger = require('../utils/logger');
const { query, sfConnection, isSalesforceAvailable } = require('../salesforce/connection');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MAX_CONTACTS_PER_BATCH: 10,
  INTERNAL_DOMAINS: ['eudia.com', 'eudia.io'],
  LOG_PREFIX: '[ContactSync]'
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if email is internal (Eudia employee)
 */
function isInternalEmail(email) {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return CONFIG.INTERNAL_DOMAINS.some(d => domain === d || domain?.endsWith('.' + d));
}

/**
 * Parse name from email address (fallback when name not provided)
 * e.g., "john.doe@company.com" → { firstName: "John", lastName: "Doe" }
 */
function parseNameFromEmail(email) {
  if (!email) return { firstName: 'Unknown', lastName: 'Contact' };
  
  const localPart = email.split('@')[0];
  
  // Try common patterns: first.last, first_last, firstlast
  const patterns = [
    /^([a-z]+)\.([a-z]+)$/i,      // first.last
    /^([a-z]+)_([a-z]+)$/i,       // first_last
    /^([a-z]+)-([a-z]+)$/i,       // first-last
  ];
  
  for (const pattern of patterns) {
    const match = localPart.match(pattern);
    if (match) {
      return {
        firstName: capitalize(match[1]),
        lastName: capitalize(match[2])
      };
    }
  }
  
  // Fallback: use whole local part as last name
  return {
    firstName: capitalize(localPart),
    lastName: 'Unknown'
  };
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Parse full name into first and last name
 */
function parseFullName(fullName) {
  if (!fullName || fullName === 'Unknown') {
    return { firstName: 'Unknown', lastName: 'Contact' };
  }
  
  // Handle "Last, First" format
  if (fullName.includes(',')) {
    const parts = fullName.split(',').map(p => p.trim());
    return {
      firstName: parts[1] || 'Unknown',
      lastName: parts[0] || 'Contact'
    };
  }
  
  // Standard "First Last" format
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return {
      firstName: nameParts[0],
      lastName: 'Unknown'
    };
  }
  
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ')
  };
}

/**
 * Escape string for SOQL query
 */
function escapeSOQL(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find contact by email address
 * @param {string} email - Email address to search
 * @returns {Object|null} Contact record or null if not found
 */
async function findContactByEmail(email) {
  if (!email || !isSalesforceAvailable()) return null;
  
  try {
    const escapedEmail = escapeSOQL(email.toLowerCase());
    const result = await query(`
      SELECT Id, FirstName, LastName, Email, Title, AccountId, Account.Name
      FROM Contact 
      WHERE Email = '${escapedEmail}'
      LIMIT 1
    `);
    
    if (result?.records?.length > 0) {
      const contact = result.records[0];
      logger.debug(`${CONFIG.LOG_PREFIX} Found contact: ${contact.FirstName} ${contact.LastName} (${email})`);
      return {
        id: contact.Id,
        firstName: contact.FirstName,
        lastName: contact.LastName,
        email: contact.Email,
        title: contact.Title,
        accountId: contact.AccountId,
        accountName: contact.Account?.Name
      };
    }
    
    return null;
  } catch (error) {
    logger.error(`${CONFIG.LOG_PREFIX} Error finding contact by email:`, error.message);
    return null;
  }
}

/**
 * Create a new contact in Salesforce
 * @param {Object} contactData - Contact details
 * @param {string} contactData.email - Email (required)
 * @param {string} contactData.firstName - First name
 * @param {string} contactData.lastName - Last name  
 * @param {string} contactData.title - Job title
 * @param {string} contactData.accountId - Account to link to (required - no orphan contacts!)
 * @returns {Object} Result with created contact ID
 */
async function createContact({ email, firstName, lastName, title, accountId }) {
  // SAFETY: Never create orphan contacts
  if (!accountId) {
    logger.warn(`${CONFIG.LOG_PREFIX} Refusing to create orphan contact (no AccountId): ${email}`);
    return { success: false, error: 'AccountId required - no orphan contacts allowed' };
  }
  
  if (!email) {
    return { success: false, error: 'Email required' };
  }
  
  if (!isSalesforceAvailable()) {
    return { success: false, error: 'Salesforce not available' };
  }
  
  // Parse name from email if not provided
  let parsedFirst = firstName;
  let parsedLast = lastName;
  
  if (!parsedFirst || !parsedLast || parsedFirst === 'Unknown') {
    const parsed = parseNameFromEmail(email);
    parsedFirst = parsedFirst || parsed.firstName;
    parsedLast = parsedLast || parsed.lastName;
  }
  
  try {
    const conn = sfConnection.conn;
    if (!conn) {
      return { success: false, error: 'No Salesforce connection' };
    }
    
    const contactData = {
      FirstName: parsedFirst,
      LastName: parsedLast || 'Unknown',
      Email: email.toLowerCase(),
      AccountId: accountId
    };
    
    if (title) {
      contactData.Title = title;
    }
    
    const result = await conn.sobject('Contact').create(contactData);
    
    if (result.success) {
      logger.info(`${CONFIG.LOG_PREFIX} ✅ Created contact: ${parsedFirst} ${parsedLast} (${email}) → Account: ${accountId}`);
      return {
        success: true,
        contactId: result.id,
        firstName: parsedFirst,
        lastName: parsedLast,
        email: email.toLowerCase(),
        accountId,
        created: true
      };
    } else {
      logger.error(`${CONFIG.LOG_PREFIX} Failed to create contact:`, result.errors);
      return { success: false, error: result.errors?.[0]?.message || 'Unknown error' };
    }
  } catch (error) {
    logger.error(`${CONFIG.LOG_PREFIX} Error creating contact:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Find or create a contact
 * @param {Object} params - Contact parameters
 * @returns {Object} Contact result with ID and created flag
 */
async function findOrCreateContact({ email, name, firstName, lastName, title, accountId }) {
  if (!email || isInternalEmail(email)) {
    return { success: false, skipped: true, reason: 'Internal or missing email' };
  }
  
  // First, try to find existing contact
  const existing = await findContactByEmail(email);
  
  if (existing) {
    return {
      success: true,
      contactId: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      accountId: existing.accountId,
      created: false
    };
  }
  
  // No existing contact - create new one if we have an AccountId
  if (!accountId) {
    logger.debug(`${CONFIG.LOG_PREFIX} Contact not found and no AccountId to create: ${email}`);
    return { success: false, skipped: true, reason: 'No AccountId - cannot create orphan contact' };
  }
  
  // Parse name if provided as full name
  let parsedFirst = firstName;
  let parsedLast = lastName;
  
  if (name && (!firstName || !lastName)) {
    const parsed = parseFullName(name);
    parsedFirst = parsedFirst || parsed.firstName;
    parsedLast = parsedLast || parsed.lastName;
  }
  
  return await createContact({
    email,
    firstName: parsedFirst,
    lastName: parsedLast,
    title,
    accountId
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Salesforce Event with meeting notes
 * @param {Object} params - Event parameters
 * @returns {Object} Result with event ID
 */
async function createSalesforceEvent({
  subject,
  description,
  startDateTime,
  endDateTime,
  contactId,
  accountId,
  ownerId
}) {
  if (!isSalesforceAvailable()) {
    return { success: false, error: 'Salesforce not available' };
  }
  
  try {
    const conn = sfConnection.conn;
    if (!conn) {
      return { success: false, error: 'No Salesforce connection' };
    }
    
    // Build event data
    const eventData = {
      Subject: (subject || 'Meeting').substring(0, 255),
      Description: (description || '').substring(0, 32000),
      StartDateTime: new Date(startDateTime).toISOString(),
      EndDateTime: new Date(endDateTime || startDateTime).toISOString(),
      Type: 'Meeting',
      IsAllDayEvent: false
    };
    
    // Link to Contact (WhoId) - for activity history
    if (contactId) {
      eventData.WhoId = contactId;
    }
    
    // Link to Account (WhatId) - only if no Contact linked
    // (Salesforce limitation: can't always have both)
    if (accountId && !contactId) {
      eventData.WhatId = accountId;
    }
    
    // Set owner if provided
    if (ownerId) {
      eventData.OwnerId = ownerId;
    }
    
    const result = await conn.sobject('Event').create(eventData);
    
    if (result.success) {
      logger.info(`${CONFIG.LOG_PREFIX} ✅ Created Event: ${subject} → ${result.id}`);
      return {
        success: true,
        eventId: result.id,
        subject,
        contactId,
        accountId
      };
    } else {
      logger.error(`${CONFIG.LOG_PREFIX} Failed to create event:`, result.errors);
      return { success: false, error: result.errors?.[0]?.message || 'Unknown error' };
    }
  } catch (error) {
    logger.error(`${CONFIG.LOG_PREFIX} Error creating event:`, error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync a meeting to Salesforce with contacts and event
 * Main entry point for Obsidian note sync
 * 
 * @param {Object} params - Meeting parameters
 * @param {string} params.accountId - Salesforce Account ID
 * @param {string} params.accountName - Account name (for logging)
 * @param {Array} params.attendees - List of attendees [{email, name, title}]
 * @param {string} params.subject - Meeting subject
 * @param {string} params.dateTime - Meeting date/time
 * @param {string} params.notes - Meeting notes (for event description)
 * @param {number} params.durationMinutes - Meeting duration
 * @param {boolean} params.dryRun - If true, don't actually create records
 * @returns {Object} Sync results
 */
async function syncMeetingToSalesforce({
  accountId,
  accountName,
  attendees = [],
  subject,
  dateTime,
  notes,
  durationMinutes = 60,
  dryRun = false
}) {
  const results = {
    success: true,
    accountId,
    accountName,
    contactsProcessed: 0,
    contactsCreated: [],
    contactsFound: [],
    contactsSkipped: [],
    event: null,
    errors: []
  };
  
  if (!accountId) {
    results.success = false;
    results.errors.push('AccountId required');
    return results;
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} 🔄 Syncing meeting: "${subject}" → ${accountName} (${attendees.length} attendees)`);
  
  // Process attendees - find or create contacts
  const externalAttendees = attendees.filter(a => a.email && !isInternalEmail(a.email));
  let primaryContactId = null;
  
  for (const attendee of externalAttendees.slice(0, CONFIG.MAX_CONTACTS_PER_BATCH)) {
    results.contactsProcessed++;
    
    if (dryRun) {
      logger.info(`${CONFIG.LOG_PREFIX} [DRY RUN] Would process: ${attendee.email}`);
      continue;
    }
    
    const contactResult = await findOrCreateContact({
      email: attendee.email,
      name: attendee.name,
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      title: attendee.title,
      accountId
    });
    
    if (contactResult.success) {
      if (contactResult.created) {
        results.contactsCreated.push({
          id: contactResult.contactId,
          email: attendee.email,
          name: `${contactResult.firstName} ${contactResult.lastName}`
        });
      } else {
        results.contactsFound.push({
          id: contactResult.contactId,
          email: attendee.email,
          name: `${contactResult.firstName} ${contactResult.lastName}`
        });
      }
      
      // Track primary contact (first external)
      if (!primaryContactId) {
        primaryContactId = contactResult.contactId;
      }
    } else if (contactResult.skipped) {
      results.contactsSkipped.push({
        email: attendee.email,
        reason: contactResult.reason
      });
    } else {
      results.errors.push(`Contact error for ${attendee.email}: ${contactResult.error}`);
    }
  }
  
  // Create Salesforce Event with notes
  if (!dryRun && (notes || subject)) {
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    
    // Format event description with meeting notes
    const eventDescription = formatEventDescription({
      subject,
      dateTime: startTime.toISOString(),
      attendees: externalAttendees,
      notes
    });
    
    const eventResult = await createSalesforceEvent({
      subject: `Meeting: ${subject || accountName}`,
      description: eventDescription,
      startDateTime: startTime,
      endDateTime: endTime,
      contactId: primaryContactId,
      accountId: primaryContactId ? null : accountId // Only set if no contact
    });
    
    if (eventResult.success) {
      results.event = {
        id: eventResult.eventId,
        subject: eventResult.subject
      };
    } else {
      results.errors.push(`Event error: ${eventResult.error}`);
    }
  }
  
  // Summary logging
  logger.info(`${CONFIG.LOG_PREFIX} ✅ Sync complete: ${results.contactsCreated.length} created, ${results.contactsFound.length} found, ${results.event ? '1 event' : 'no event'}`);
  
  if (results.errors.length > 0) {
    results.success = false;
    logger.warn(`${CONFIG.LOG_PREFIX} Sync had errors:`, results.errors);
  }
  
  return results;
}

/**
 * Format meeting notes into structured event description
 */
function formatEventDescription({ subject, dateTime, attendees, notes }) {
  const dateStr = new Date(dateTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  let description = `
MEETING NOTES
═══════════════════════════════════════

Subject: ${subject || 'Meeting'}
Date: ${dateStr}

`;

  if (attendees?.length > 0) {
    description += `ATTENDEES:\n`;
    attendees.forEach(a => {
      description += `• ${a.name || a.email}${a.title ? ` (${a.title})` : ''}\n`;
    });
    description += '\n';
  }

  if (notes) {
    description += `NOTES:\n${notes}\n\n`;
  }

  description += `───────────────────────────────────────
Synced from Obsidian via GTM Brain`;

  return description.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Contact operations
  findContactByEmail,
  createContact,
  findOrCreateContact,
  
  // Event operations
  createSalesforceEvent,
  
  // Batch sync
  syncMeetingToSalesforce,
  
  // Utilities
  parseNameFromEmail,
  parseFullName,
  isInternalEmail,
  
  // Config
  CONFIG
};

