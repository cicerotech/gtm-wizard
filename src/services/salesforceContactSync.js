/**
 * Salesforce Contact Sync Service (ENHANCED)
 * 
 * Handles:
 * - Finding existing contacts by email
 * - Creating new contacts when they don't exist (linked to Account)
 * - LEVERAGING CLAY ENRICHMENT DATA for accurate contact creation
 * - DOMAIN → ACCOUNT FALLBACK when accountId not provided
 * - Creating Salesforce Events with meeting notes
 * - EVENT DEDUPLICATION to prevent duplicates
 * - Linking events to Contacts and Accounts for Einstein Activity Capture
 * 
 * Safety measures:
 * - Never creates orphan contacts (AccountId required or resolved via domain)
 * - Dedupes by email before creating
 * - Dedupes events by date + account + subject
 * - Rate limits contact creation (max 10 per batch)
 * - Full audit logging
 * 
 * Data Resolution Cascade:
 * 1. Clay enrichment data (attendee_enrichment table) - BEST
 * 2. Provided attendee data (from Obsidian/calendar)
 * 3. Email parsing (fallback)
 */

const logger = require('../utils/logger');
const { query, sfConnection, isSalesforceAvailable } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MAX_CONTACTS_PER_BATCH: 10,
  INTERNAL_DOMAINS: ['eudia.com', 'eudia.io'],
  LOG_PREFIX: '[ContactSync]',
  EVENT_DEDUPE_WINDOW_HOURS: 24,  // Events within 24h are considered duplicates
  ENABLE_CLAY_LOOKUP: true,       // Use Clay enrichment data
  ENABLE_DOMAIN_FALLBACK: true    // Try domain → account lookup if no accountId
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
 */
function parseNameFromEmail(email) {
  if (!email) return { firstName: 'Unknown', lastName: 'Contact' };
  
  const localPart = email.split('@')[0];
  
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
  
  return {
    firstName: capitalize(localPart),
    lastName: 'Unknown'
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function parseFullName(fullName) {
  if (!fullName || fullName === 'Unknown') {
    return { firstName: 'Unknown', lastName: 'Contact' };
  }
  
  if (fullName.includes(',')) {
    const parts = fullName.split(',').map(p => p.trim());
    return {
      firstName: parts[1] || 'Unknown',
      lastName: parts[0] || 'Contact'
    };
  }
  
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: 'Unknown' };
  }
  
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ')
  };
}

function escapeSOQL(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAY ENRICHMENT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Clay enrichment data for an email
 * Returns title, company, name from Clay if available
 */
async function getClayEnrichmentData(email) {
  if (!CONFIG.ENABLE_CLAY_LOOKUP || !email) return null;
  
  try {
    const enrichment = await intelligenceStore.getAttendeeEnrichment(email.toLowerCase());
    
    if (enrichment && enrichment.title) {
      logger.debug(`${CONFIG.LOG_PREFIX} ✨ Found Clay data for ${email}: ${enrichment.title} @ ${enrichment.company}`);
      return {
        name: enrichment.name,
        title: enrichment.title,
        company: enrichment.company,
        linkedinUrl: enrichment.linkedinUrl,
        summary: enrichment.summary,
        source: 'clay'
      };
    }
  } catch (error) {
    logger.debug(`${CONFIG.LOG_PREFIX} No Clay data for ${email}:`, error.message);
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN → ACCOUNT FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find Account by email domain
 * Used when accountId is not provided
 */
async function findAccountByDomain(email) {
  if (!CONFIG.ENABLE_DOMAIN_FALLBACK || !email || !isSalesforceAvailable()) return null;
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || isInternalEmail(email)) return null;
  
  try {
    // First try: exact website match
    const exactResult = await query(`
      SELECT Id, Name, Website
      FROM Account 
      WHERE Website LIKE '%${escapeSOQL(domain)}%'
      LIMIT 1
    `);
    
    if (exactResult?.records?.length > 0) {
      const account = exactResult.records[0];
      logger.info(`${CONFIG.LOG_PREFIX} 🎯 Found account by domain: ${domain} → ${account.Name}`);
      return {
        accountId: account.Id,
        accountName: account.Name,
        matchMethod: 'website_domain'
      };
    }
    
    // Second try: look for contacts with same domain → get their account
    const contactResult = await query(`
      SELECT AccountId, Account.Name
      FROM Contact 
      WHERE Email LIKE '%@${escapeSOQL(domain)}'
      AND AccountId != null
      LIMIT 1
    `);
    
    if (contactResult?.records?.length > 0) {
      const contact = contactResult.records[0];
      logger.info(`${CONFIG.LOG_PREFIX} 🎯 Found account via existing contact: ${domain} → ${contact.Account?.Name}`);
      return {
        accountId: contact.AccountId,
        accountName: contact.Account?.Name,
        matchMethod: 'contact_domain'
      };
    }
    
  } catch (error) {
    logger.debug(`${CONFIG.LOG_PREFIX} Domain lookup failed for ${domain}:`, error.message);
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT OPERATIONS (ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find contact by email address
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
 * Create a new contact in Salesforce (ENHANCED with Clay data)
 */
async function createContact({ email, firstName, lastName, title, accountId }) {
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
  
  // ENHANCED: Check Clay enrichment first for better data
  const clayData = await getClayEnrichmentData(email);
  
  // NAME RESOLUTION CASCADE:
  // 1. Clay enrichment name (most accurate)
  // 2. Provided firstName/lastName
  // 3. Parse from email
  let finalFirst = firstName;
  let finalLast = lastName;
  let finalTitle = title;
  
  if (clayData?.name) {
    const clayParsed = parseFullName(clayData.name);
    finalFirst = finalFirst || clayParsed.firstName;
    finalLast = finalLast || clayParsed.lastName;
    finalTitle = finalTitle || clayData.title;
    logger.info(`${CONFIG.LOG_PREFIX} ✨ Using Clay data: ${clayData.name} - ${clayData.title}`);
  }
  
  if (!finalFirst || finalFirst === 'Unknown') {
    const emailParsed = parseNameFromEmail(email);
    finalFirst = finalFirst || emailParsed.firstName;
    finalLast = finalLast || emailParsed.lastName;
  }
  
  try {
    const conn = sfConnection.conn;
    if (!conn) {
      return { success: false, error: 'No Salesforce connection' };
    }
    
    const contactData = {
      FirstName: finalFirst,
      LastName: finalLast || 'Unknown',
      Email: email.toLowerCase(),
      AccountId: accountId
    };
    
    if (finalTitle) {
      contactData.Title = finalTitle;
    }
    
    const result = await conn.sobject('Contact').create(contactData);
    
    if (result.success) {
      logger.info(`${CONFIG.LOG_PREFIX} ✅ Created contact: ${finalFirst} ${finalLast}${finalTitle ? ` (${finalTitle})` : ''} → ${accountId}`);
      return {
        success: true,
        contactId: result.id,
        firstName: finalFirst,
        lastName: finalLast,
        title: finalTitle,
        email: email.toLowerCase(),
        accountId,
        created: true,
        usedClayData: !!clayData
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
 * Find or create a contact (ENHANCED with domain fallback)
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
  
  // ENHANCED: If no accountId, try domain fallback
  let resolvedAccountId = accountId;
  let accountMatchMethod = 'provided';
  
  if (!resolvedAccountId) {
    const domainMatch = await findAccountByDomain(email);
    if (domainMatch) {
      resolvedAccountId = domainMatch.accountId;
      accountMatchMethod = domainMatch.matchMethod;
      logger.info(`${CONFIG.LOG_PREFIX} 🎯 Resolved account via ${accountMatchMethod}: ${domainMatch.accountName}`);
    }
  }
  
  if (!resolvedAccountId) {
    logger.debug(`${CONFIG.LOG_PREFIX} Contact not found and no AccountId resolved: ${email}`);
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
    accountId: resolvedAccountId
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT OPERATIONS (ENHANCED with deduplication)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an event already exists (deduplication)
 */
async function findExistingEvent({ accountId, contactId, subject, startDateTime }) {
  if (!isSalesforceAvailable()) return null;
  
  try {
    const startDate = new Date(startDateTime);
    const windowStart = new Date(startDate.getTime() - CONFIG.EVENT_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);
    const windowEnd = new Date(startDate.getTime() + CONFIG.EVENT_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);
    
    // Build query based on available identifiers
    // SOQL datetime format requires the literal datetime value directly (not quoted)
    let whereClause = `StartDateTime >= ${windowStart.toISOString()} AND StartDateTime <= ${windowEnd.toISOString()}`;
    
    // Try contactId first (WhoId), then accountId (WhatId)
    // Note: When event has WhoId, WhatId may be null
    if (contactId) {
      whereClause += ` AND WhoId = '${contactId}'`;
    }
    if (accountId) {
      whereClause += ` AND WhatId = '${accountId}'`;
    }
    
    // If neither specified, can't dedupe meaningfully
    if (!contactId && !accountId) {
      logger.debug(`${CONFIG.LOG_PREFIX} Event dedupe skipped - no contactId or accountId`);
      return null;
    }
    
    // Check for subject similarity (first 3 words)
    if (subject) {
      const subjectWords = subject.split(/\s+/).slice(0, 3).join('%');
      whereClause += ` AND Subject LIKE '%${escapeSOQL(subjectWords)}%'`;
    }
    
    logger.debug(`${CONFIG.LOG_PREFIX} Event dedupe query: ${whereClause}`);
    
    const result = await query(`
      SELECT Id, Subject, StartDateTime
      FROM Event
      WHERE ${whereClause}
      LIMIT 1
    `);
    
    if (result?.records?.length > 0) {
      logger.info(`${CONFIG.LOG_PREFIX} ⚠️ Found existing event: ${result.records[0].Subject}`);
      return result.records[0];
    }
    
    return null;
  } catch (error) {
    logger.debug(`${CONFIG.LOG_PREFIX} Event dedupe check failed:`, error.message);
    return null;
  }
}

/**
 * Create a Salesforce Event with meeting notes (ENHANCED with deduplication)
 */
async function createSalesforceEvent({
  subject,
  description,
  startDateTime,
  endDateTime,
  contactId,
  accountId,
  ownerId,
  skipDupeCheck = false
}) {
  if (!isSalesforceAvailable()) {
    return { success: false, error: 'Salesforce not available' };
  }
  
  // ENHANCED: Check for duplicate events
  if (!skipDupeCheck) {
    const existingEvent = await findExistingEvent({ accountId, contactId, subject, startDateTime });
    if (existingEvent) {
      logger.info(`${CONFIG.LOG_PREFIX} ⚠️ Skipping duplicate event: ${existingEvent.Subject} (${existingEvent.Id})`);
      return {
        success: true,
        eventId: existingEvent.Id,
        subject: existingEvent.Subject,
        skipped: true,
        reason: 'duplicate_event'
      };
    }
  }
  
  try {
    const conn = sfConnection.conn;
    if (!conn) {
      return { success: false, error: 'No Salesforce connection' };
    }
    
    const eventData = {
      Subject: (subject || 'Meeting').substring(0, 255),
      Description: (description || '').substring(0, 32000),
      StartDateTime: new Date(startDateTime).toISOString(),
      EndDateTime: new Date(endDateTime || startDateTime).toISOString(),
      Type: 'Meeting',
      IsAllDayEvent: false
    };
    
    if (contactId) {
      eventData.WhoId = contactId;
    }
    
    if (accountId && !contactId) {
      eventData.WhatId = accountId;
    }
    
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
        accountId,
        created: true
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
// BATCH SYNC OPERATIONS (ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync a meeting to Salesforce with contacts and event (ENHANCED)
 * - Uses Clay enrichment data for contact creation
 * - Falls back to domain lookup if no accountId
 * - Deduplicates events
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
    accountResolved: false,
    contactsProcessed: 0,
    contactsCreated: [],
    contactsFound: [],
    contactsSkipped: [],
    event: null,
    errors: [],
    clayDataUsed: 0
  };
  
  // ENHANCED: Try domain fallback if no accountId
  let resolvedAccountId = accountId;
  
  if (!resolvedAccountId && attendees.length > 0) {
    const firstExternalEmail = attendees.find(a => a.email && !isInternalEmail(a.email))?.email;
    if (firstExternalEmail) {
      const domainMatch = await findAccountByDomain(firstExternalEmail);
      if (domainMatch) {
        resolvedAccountId = domainMatch.accountId;
        results.accountId = domainMatch.accountId;
        results.accountName = domainMatch.accountName;
        results.accountResolved = true;
        logger.info(`${CONFIG.LOG_PREFIX} 🎯 Auto-resolved account: ${domainMatch.accountName}`);
      }
    }
  }
  
  if (!resolvedAccountId) {
    results.success = false;
    results.errors.push('AccountId required and could not be resolved from attendee domains');
    return results;
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} 🔄 Syncing meeting: "${subject}" → ${results.accountName || resolvedAccountId} (${attendees.length} attendees)`);
  
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
      accountId: resolvedAccountId
    });
    
    if (contactResult.success) {
      if (contactResult.created) {
        results.contactsCreated.push({
          id: contactResult.contactId,
          email: attendee.email,
          name: `${contactResult.firstName} ${contactResult.lastName}`,
          title: contactResult.title,
          usedClayData: contactResult.usedClayData
        });
        if (contactResult.usedClayData) results.clayDataUsed++;
      } else {
        results.contactsFound.push({
          id: contactResult.contactId,
          email: attendee.email,
          name: `${contactResult.firstName} ${contactResult.lastName}`
        });
      }
      
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
  
  // Create Salesforce Event with notes (with deduplication)
  if (!dryRun && (notes || subject)) {
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    
    const eventDescription = formatEventDescription({
      subject,
      dateTime: startTime.toISOString(),
      attendees: externalAttendees,
      notes
    });
    
    const eventResult = await createSalesforceEvent({
      subject: `Meeting: ${subject || results.accountName}`,
      description: eventDescription,
      startDateTime: startTime,
      endDateTime: endTime,
      contactId: primaryContactId,
      accountId: resolvedAccountId  // Always pass for deduplication, even if contactId exists
    });
    
    if (eventResult.success) {
      results.event = {
        id: eventResult.eventId,
        subject: eventResult.subject,
        skipped: eventResult.skipped,
        created: eventResult.created
      };
    } else {
      results.errors.push(`Event error: ${eventResult.error}`);
    }
  }
  
  // Summary logging
  logger.info(`${CONFIG.LOG_PREFIX} ✅ Sync complete: ${results.contactsCreated.length} created (${results.clayDataUsed} with Clay data), ${results.contactsFound.length} found, event: ${results.event?.created ? 'created' : results.event?.skipped ? 'skipped (dupe)' : 'none'}`);
  
  if (results.errors.length > 0) {
    results.success = false;
    logger.warn(`${CONFIG.LOG_PREFIX} Sync had errors:`, results.errors);
  }
  
  return results;
}

/**
 * Process calendar attendees for contact sync (for calendar sync job integration)
 * Lightweight version that only creates contacts, doesn't create events
 */
async function syncCalendarAttendees(meetings) {
  const results = {
    meetingsProcessed: 0,
    contactsCreated: 0,
    contactsFound: 0,
    contactsSkipped: 0,
    errors: []
  };
  
  for (const meeting of meetings) {
    if (!meeting.externalAttendees?.length) continue;
    
    results.meetingsProcessed++;
    
    // Get accountId from meeting or try domain fallback
    let accountId = meeting.accountId;
    
    if (!accountId && meeting.externalAttendees.length > 0) {
      const firstEmail = meeting.externalAttendees[0].email;
      const domainMatch = await findAccountByDomain(firstEmail);
      if (domainMatch) {
        accountId = domainMatch.accountId;
      }
    }
    
    if (!accountId) {
      results.contactsSkipped += meeting.externalAttendees.length;
      continue;
    }
    
    for (const attendee of meeting.externalAttendees) {
      const result = await findOrCreateContact({
        email: attendee.email,
        name: attendee.name,
        accountId
      });
      
      if (result.success) {
        if (result.created) {
          results.contactsCreated++;
        } else {
          results.contactsFound++;
        }
      } else if (result.skipped) {
        results.contactsSkipped++;
      } else {
        results.errors.push(`${attendee.email}: ${result.error}`);
      }
    }
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Calendar attendee sync: ${results.contactsCreated} created, ${results.contactsFound} found, ${results.contactsSkipped} skipped`);
  
  return results;
}

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
  
  // Account resolution
  findAccountByDomain,
  
  // Clay integration
  getClayEnrichmentData,
  
  // Event operations
  createSalesforceEvent,
  findExistingEvent,
  
  // Batch sync
  syncMeetingToSalesforce,
  syncCalendarAttendees,
  
  // Utilities
  parseNameFromEmail,
  parseFullName,
  isInternalEmail,
  
  // Config
  CONFIG
};
