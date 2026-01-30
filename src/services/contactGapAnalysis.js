/**
 * Contact Gap Analysis Service
 * 
 * Analyzes BL calendar attendees to identify contacts that should exist in Salesforce
 * but don't. Focuses on external contacts whose email domain matches a BL-owned account.
 * 
 * FLOW:
 * 1. Extract unique external attendees from calendar events (last 90 days)
 * 2. Match attendee domains to BL-owned Salesforce accounts
 * 3. Check if contacts already exist in Salesforce
 * 4. Enrich missing contacts with Clay data
 * 5. Provide review dashboard for safe creation
 * 
 * SAFETY:
 * - Only processes accounts owned by target BLs
 * - No orphan contacts (AccountId always required)
 * - Personal email domains excluded (gmail, yahoo, etc.)
 * - Batch limits enforced
 * - Review before creation
 * 
 * @author GTM Brain
 * @date January 2026
 */

const logger = require('../utils/logger');
const { query, isSalesforceAvailable } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  LOG_PREFIX: '[ContactGap]',
  DEFAULT_DAYS_BACK: 90,
  MAX_CONTACTS_PER_BATCH: 10,
  MIN_MEETING_COUNT: 1,  // Minimum meetings to consider a contact worth creating
  
  // Personal email domains to exclude
  PERSONAL_EMAIL_DOMAINS: [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
    'icloud.com', 'aol.com', 'protonmail.com', 'live.com',
    'msn.com', 'me.com', 'mail.com', 'ymail.com'
  ],
  
  // Internal domains to exclude
  INTERNAL_DOMAINS: ['eudia.com', 'eudia.io', 'johnsonhana.com', 'johnsonhana.ie']
};

// US Pod Business Lead emails (starting scope)
const US_BL_EMAILS = [
  'asad.hussain@eudia.com',
  'nathan.shine@eudia.com',
  'julie.stefanich@eudia.com',
  'olivia.jung@eudia.com',
  'olivia@eudia.com',  // Alias
  'ananth.cherukupally@eudia.com',
  'justin.hills@eudia.com',
  'mike.masiello@eudia.com'
];

// US Pod BL names for account ownership filtering
const US_BL_NAMES = [
  'Asad Hussain',
  'Nathan Shine',
  'Julie Stefanich',
  'Olivia Jung',
  'Ananth Cherukupally',
  'Justin Hills',
  'Mike Masiello'
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if email is from a personal email domain
 */
function isPersonalEmail(email) {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return CONFIG.PERSONAL_EMAIL_DOMAINS.some(d => domain === d);
}

/**
 * Check if email is internal (Eudia or affiliate)
 */
function isInternalEmail(email) {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return CONFIG.INTERNAL_DOMAINS.some(d => domain === d || domain?.endsWith('.' + d));
}

/**
 * Extract domain from email
 */
function getDomain(email) {
  if (!email) return null;
  return email.split('@')[1]?.toLowerCase();
}

/**
 * Parse name from email address (fallback)
 * Handles: first.last, first_last, first-last, firstlast, first.m.last, first.last1
 */
function parseNameFromEmail(email) {
  if (!email) return { firstName: 'Unknown', lastName: 'Contact' };
  
  // Get local part and strip numbers
  let localPart = email.split('@')[0];
  localPart = localPart.replace(/[0-9]/g, ''); // Remove numbers like "hernandez1"
  
  const patterns = [
    /^([a-z]+)\.([a-z]+)$/i,      // first.last
    /^([a-z]+)_([a-z]+)$/i,       // first_last
    /^([a-z]+)-([a-z]+)$/i,       // first-last
    /^([a-z]+)\.([a-z])\.([a-z]+)$/i,  // first.m.last
  ];
  
  for (const pattern of patterns) {
    const match = localPart.match(pattern);
    if (match) {
      // Handle first.m.last pattern
      if (match.length === 4) {
        return {
          firstName: capitalize(match[1]),
          lastName: capitalize(match[3])
        };
      }
      return {
        firstName: capitalize(match[1]),
        lastName: capitalize(match[2])
      };
    }
  }
  
  // Try camelCase detection (e.g., "chrisRoberts" or "ChrisRoberts")
  const camelMatch = localPart.match(/^([a-z]+)([A-Z][a-z]+)$/);
  if (camelMatch) {
    return {
      firstName: capitalize(camelMatch[1]),
      lastName: capitalize(camelMatch[2])
    };
  }
  
  // Try to split long names heuristically (common first names)
  const commonFirstNames = ['chris', 'michael', 'john', 'james', 'robert', 'david', 'william', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle', 'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn', 'judith', 'megan', 'andrea', 'cheryl', 'hannah', 'jacqueline', 'martha', 'gloria', 'teresa', 'ann', 'sara', 'madison', 'frances', 'kathryn', 'janice', 'jean', 'abigail', 'alice', 'judy', 'sophia', 'grace', 'denise', 'amber', 'doris', 'marilyn', 'danielle', 'beverly', 'isabella', 'theresa', 'diana', 'natalie', 'brittany', 'charlotte', 'marie', 'kayla', 'alexis', 'lori'];
  
  const lowerLocal = localPart.toLowerCase();
  for (const firstName of commonFirstNames) {
    if (lowerLocal.startsWith(firstName) && lowerLocal.length > firstName.length + 2) {
      const lastName = lowerLocal.substring(firstName.length);
      return {
        firstName: capitalize(firstName),
        lastName: capitalize(lastName)
      };
    }
  }
  
  // Last resort: just capitalize the whole thing as first name
  if (localPart.length > 1) {
    return {
      firstName: capitalize(localPart),
      lastName: 'Unknown'
    };
  }
  
  return {
    firstName: 'Unknown',
    lastName: 'Contact'
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Clean and normalize a name from various formats
 * Handles: "LastName, FirstName", "email@domain.com", "FirstName LastName"
 */
function cleanName(rawName, email) {
  if (!rawName || rawName === 'Unknown' || rawName.includes('@')) {
    // Name is email or unknown - parse from email
    return parseNameFromEmail(email);
  }
  
  const trimmed = rawName.trim();
  
  // Check for "LastName, FirstName" format (comma indicates reversed order)
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return {
        firstName: capitalize(parts[1].split(' ')[0]), // Take first word after comma
        lastName: capitalize(parts[0])
      };
    }
  }
  
  // Check for parenthetical suffixes like "(CMG-Atlanta)" and remove
  const cleanedName = trimmed.replace(/\s*\([^)]*\)\s*/g, '').trim();
  
  // Standard "FirstName LastName" format
  const nameParts = cleanedName.split(/\s+/).filter(p => p.length > 0);
  
  if (nameParts.length === 0) {
    return parseNameFromEmail(email);
  }
  
  if (nameParts.length === 1) {
    // Single name - check if it looks like an email local part
    if (nameParts[0].includes('.') || nameParts[0].includes('_')) {
      return parseNameFromEmail(nameParts[0] + '@fake.com');
    }
    return {
      firstName: capitalize(nameParts[0]),
      lastName: 'Unknown'
    };
  }
  
  return {
    firstName: capitalize(nameParts[0]),
    lastName: nameParts.slice(1).map(p => capitalize(p)).join(' ')
  };
}

function escapeSOQL(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get unique external attendees from calendar events
 * @param {Object} options - { blEmails, daysBack }
 * @returns {Array} Array of attendee objects with meeting counts
 */
async function getUniqueExternalAttendees(options = {}) {
  const { 
    blEmails = US_BL_EMAILS, 
    daysBack = CONFIG.DEFAULT_DAYS_BACK 
  } = options;
  
  logger.info(`${CONFIG.LOG_PREFIX} Extracting external attendees from last ${daysBack} days...`);
  
  try {
    // Get calendar events from SQLite
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffISO = cutoffDate.toISOString();
    
    const events = await intelligenceStore.getCalendarEventsAfter(cutoffISO, blEmails);
    
    logger.info(`${CONFIG.LOG_PREFIX} Found ${events.length} calendar events to analyze`);
    
    // Aggregate unique external attendees
    const attendeeMap = new Map(); // email -> { email, name, meetingCount, lastMeeting, ownerEmails }
    
    for (const event of events) {
      // Parse external attendees (stored as JSON string)
      let externalAttendees = [];
      try {
        externalAttendees = JSON.parse(event.external_attendees || '[]');
      } catch (e) {
        continue;
      }
      
      for (const att of externalAttendees) {
        const email = att.email?.toLowerCase();
        if (!email) continue;
        
        // Skip personal and internal emails
        if (isPersonalEmail(email) || isInternalEmail(email)) continue;
        
        if (attendeeMap.has(email)) {
          const existing = attendeeMap.get(email);
          existing.meetingCount++;
          if (event.start_datetime > existing.lastMeeting) {
            existing.lastMeeting = event.start_datetime;
          }
          if (!existing.ownerEmails.includes(event.owner_email)) {
            existing.ownerEmails.push(event.owner_email);
          }
        } else {
          attendeeMap.set(email, {
            email,
            name: att.name || null,
            domain: getDomain(email),
            meetingCount: 1,
            lastMeeting: event.start_datetime,
            ownerEmails: [event.owner_email]
          });
        }
      }
    }
    
    const attendees = Array.from(attendeeMap.values());
    logger.info(`${CONFIG.LOG_PREFIX} Found ${attendees.length} unique external attendees`);
    
    return attendees;
    
  } catch (error) {
    logger.error(`${CONFIG.LOG_PREFIX} Error extracting attendees:`, error);
    throw error;
  }
}

/**
 * Get BL-owned accounts with their domains
 * @returns {Map} domain -> { accountId, accountName, ownerName, website }
 */
async function getBLOwnedAccountDomains() {
  if (!isSalesforceAvailable()) {
    throw new Error('Salesforce not available');
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Fetching BL-owned accounts...`);
  
  // Build owner name filter
  const ownerFilter = US_BL_NAMES.map(n => `'${escapeSOQL(n)}'`).join(',');
  
  const result = await query(`
    SELECT Id, Name, Website, Owner.Name
    FROM Account 
    WHERE Owner.Name IN (${ownerFilter})
    AND Website != null
    ORDER BY Name
  `);
  
  const domainMap = new Map();
  
  for (const account of (result?.records || [])) {
    // Extract domain from website
    let domain = account.Website?.toLowerCase();
    if (domain) {
      // Clean up website to get domain
      domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      
      domainMap.set(domain, {
        accountId: account.Id,
        accountName: account.Name,
        ownerName: account.Owner?.Name,
        website: account.Website
      });
    }
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Found ${domainMap.size} BL-owned accounts with domains`);
  
  return domainMap;
}

/**
 * Match attendees to BL-owned accounts by domain
 * @param {Array} attendees - Array of attendee objects
 * @param {Map} accountDomains - Map of domain -> account info
 * @returns {Array} Matched attendees with account info
 */
function matchAttendeesToAccounts(attendees, accountDomains) {
  const matched = [];
  
  for (const attendee of attendees) {
    const domain = attendee.domain;
    
    // Try exact domain match
    if (accountDomains.has(domain)) {
      matched.push({
        ...attendee,
        account: accountDomains.get(domain),
        matchMethod: 'exact_domain'
      });
      continue;
    }
    
    // Try subdomain match (e.g., mail.company.com -> company.com)
    const parts = domain?.split('.') || [];
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join('.');
      if (accountDomains.has(parentDomain)) {
        matched.push({
          ...attendee,
          account: accountDomains.get(parentDomain),
          matchMethod: 'parent_domain'
        });
      }
    }
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Matched ${matched.length} attendees to BL-owned accounts`);
  
  return matched;
}

/**
 * Check which contacts already exist in Salesforce
 * @param {Array} attendees - Array of matched attendee objects
 * @returns {Object} { existing: [], missing: [] }
 */
async function checkExistingContacts(attendees) {
  if (!isSalesforceAvailable() || attendees.length === 0) {
    return { existing: [], missing: attendees };
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Checking ${attendees.length} attendees against Salesforce contacts...`);
  
  // Batch emails for SOQL query (max ~100 at a time for SOQL limits)
  const batchSize = 100;
  const allEmails = attendees.map(a => a.email.toLowerCase());
  const existingEmails = new Set();
  
  for (let i = 0; i < allEmails.length; i += batchSize) {
    const batch = allEmails.slice(i, i + batchSize);
    const emailFilter = batch.map(e => `'${escapeSOQL(e)}'`).join(',');
    
    try {
      const result = await query(`
        SELECT Email
        FROM Contact 
        WHERE Email IN (${emailFilter})
      `);
      
      for (const contact of (result?.records || [])) {
        existingEmails.add(contact.Email?.toLowerCase());
      }
    } catch (error) {
      logger.error(`${CONFIG.LOG_PREFIX} Error checking contacts batch:`, error);
    }
  }
  
  const existing = attendees.filter(a => existingEmails.has(a.email.toLowerCase()));
  const missing = attendees.filter(a => !existingEmails.has(a.email.toLowerCase()));
  
  logger.info(`${CONFIG.LOG_PREFIX} Found ${existing.length} existing, ${missing.length} missing contacts`);
  
  return { existing, missing };
}

/**
 * Enrich missing contacts with Clay data and email parsing
 * Applies clean name parsing to handle "LastName, FirstName" and email-as-name cases
 * @param {Array} missingContacts - Array of missing contact objects
 * @returns {Array} Enriched contact objects
 */
async function enrichMissingContacts(missingContacts) {
  logger.info(`${CONFIG.LOG_PREFIX} Enriching ${missingContacts.length} missing contacts...`);
  
  const enriched = [];
  
  for (const contact of missingContacts) {
    // Try Clay enrichment first
    const clayData = await intelligenceStore.getAttendeeEnrichment(contact.email);
    
    let enrichedContact = { ...contact };
    
    // Determine raw name source (prefer Clay, then calendar attendee name)
    const rawName = clayData?.name || contact.name;
    
    // Clean and parse the name properly
    const cleanedName = cleanName(rawName, contact.email);
    enrichedContact.firstName = cleanedName.firstName;
    enrichedContact.lastName = cleanedName.lastName;
    
    if (clayData && clayData.title) {
      // Use Clay data for title and other fields
      enrichedContact.title = clayData.title;
      enrichedContact.linkedinUrl = clayData.linkedin_url;
      enrichedContact.company = clayData.company;
      enrichedContact.enrichmentSource = 'clay';
    } else {
      enrichedContact.enrichmentSource = 'email_parse';
    }
    
    // Format the display name cleanly
    enrichedContact.name = `${enrichedContact.firstName} ${enrichedContact.lastName}`.trim();
    
    // Add first meeting date for reference
    enrichedContact.firstMeetingDate = contact.lastMeeting; // We track last, could add first too
    
    enriched.push(enrichedContact);
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Enrichment complete`);
  
  return enriched;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run full contact gap analysis
 * @param {Object} options - { blEmails, daysBack, minMeetingCount }
 * @returns {Object} Gap analysis report
 */
async function analyzeContactGaps(options = {}) {
  const {
    blEmails = US_BL_EMAILS,
    daysBack = CONFIG.DEFAULT_DAYS_BACK,
    minMeetingCount = CONFIG.MIN_MEETING_COUNT
  } = options;
  
  logger.info(`${CONFIG.LOG_PREFIX} Starting contact gap analysis...`);
  logger.info(`${CONFIG.LOG_PREFIX} Scope: ${blEmails.length} BLs, ${daysBack} days back`);
  
  const startTime = Date.now();
  
  try {
    // Step 1: Get unique external attendees from calendar
    const allAttendees = await getUniqueExternalAttendees({ blEmails, daysBack });
    
    // Step 2: Get BL-owned account domains
    const accountDomains = await getBLOwnedAccountDomains();
    
    // Step 3: Match attendees to accounts
    const matchedAttendees = matchAttendeesToAccounts(allAttendees, accountDomains);
    
    // Filter by minimum meeting count
    const qualifiedAttendees = matchedAttendees.filter(a => a.meetingCount >= minMeetingCount);
    
    // Step 4: Check which contacts already exist
    const { existing, missing } = await checkExistingContacts(qualifiedAttendees);
    
    // Step 5: Enrich missing contacts
    const enrichedMissing = await enrichMissingContacts(missing);
    
    // Sort by meeting count (most meetings first)
    enrichedMissing.sort((a, b) => b.meetingCount - a.meetingCount);
    
    const duration = Date.now() - startTime;
    
    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: duration,
      options: { blEmails: blEmails.length, daysBack, minMeetingCount },
      summary: {
        totalExternalAttendees: allAttendees.length,
        blOwnedAccounts: accountDomains.size,
        matchedToAccounts: matchedAttendees.length,
        qualifiedByMeetingCount: qualifiedAttendees.length,
        alreadyInSalesforce: existing.length,
        missingContacts: enrichedMissing.length
      },
      missingContacts: enrichedMissing.map(c => ({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        name: c.name || `${c.firstName} ${c.lastName}`,
        title: c.title || null,
        linkedinUrl: c.linkedinUrl || null,
        account: {
          id: c.account.accountId,
          name: c.account.accountName,
          owner: c.account.ownerName
        },
        meetingCount: c.meetingCount,
        lastMeeting: c.lastMeeting,
        enrichmentSource: c.enrichmentSource,
        matchMethod: c.matchMethod
      }))
    };
    
    logger.info(`${CONFIG.LOG_PREFIX} Analysis complete in ${duration}ms`);
    logger.info(`${CONFIG.LOG_PREFIX} Summary: ${report.summary.missingContacts} missing contacts found`);
    
    return report;
    
  } catch (error) {
    logger.error(`${CONFIG.LOG_PREFIX} Analysis failed:`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create contacts in Salesforce (batch, with safety limits)
 * Ensures clean data and prevents duplicates
 * @param {Array} contacts - Array of contact objects to create
 * @param {Object} options - { dryRun, approver }
 * @returns {Object} Creation results
 */
async function createContactsBatch(contacts, options = {}) {
  const { dryRun = true, approver = 'system' } = options;
  
  // Enforce batch limit
  if (contacts.length > CONFIG.MAX_CONTACTS_PER_BATCH) {
    throw new Error(`Batch size ${contacts.length} exceeds limit of ${CONFIG.MAX_CONTACTS_PER_BATCH}`);
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Creating ${contacts.length} contacts (dryRun: ${dryRun})`);
  
  const results = {
    dryRun,
    approver,
    timestamp: new Date().toISOString(),
    requested: contacts.length,
    created: [],
    skipped: [],
    errors: []
  };
  
  // Import contact sync for actual creation
  const contactSync = require('./salesforceContactSync');
  
  for (const contact of contacts) {
    try {
      // Clean the name one more time before creation
      const cleanedName = cleanName(contact.name || `${contact.firstName} ${contact.lastName}`, contact.email);
      const finalFirstName = cleanedName.firstName;
      const finalLastName = cleanedName.lastName;
      
      // Validate we have a real name
      if (finalFirstName === 'Unknown' && finalLastName === 'Unknown') {
        results.skipped.push({
          email: contact.email,
          reason: 'Could not determine name'
        });
        continue;
      }
      
      // Final deduplication check
      const existing = await contactSync.findContactByEmail(contact.email);
      if (existing) {
        results.skipped.push({
          email: contact.email,
          reason: 'Already exists in Salesforce',
          existingId: existing.id,
          existingName: `${existing.firstName} ${existing.lastName}`
        });
        continue;
      }
      
      // Prepare clean contact data
      const cleanContact = {
        email: contact.email.toLowerCase().trim(),
        firstName: finalFirstName,
        lastName: finalLastName,
        title: contact.title || null,
        accountId: contact.account?.id,
        accountName: contact.account?.name,
        meetingCount: contact.meetingCount,
        lastMeetingDate: contact.lastMeeting ? contact.lastMeeting.split('T')[0] : null
      };
      
      if (dryRun) {
        results.created.push({
          ...cleanContact,
          status: 'would_create'
        });
      } else {
        // Actually create the contact
        const createResult = await contactSync.createContact({
          email: cleanContact.email,
          firstName: cleanContact.firstName,
          lastName: cleanContact.lastName,
          title: cleanContact.title,
          accountId: cleanContact.accountId
        });
        
        if (createResult.success) {
          results.created.push({
            ...cleanContact,
            contactId: createResult.contactId,
            status: 'created'
          });
          
          // Log to gap tracking
          await intelligenceStore.logContactGapCreation({
            email: cleanContact.email,
            contactId: createResult.contactId,
            accountId: cleanContact.accountId,
            accountName: cleanContact.accountName,
            approver,
            source: 'calendar_gap_analysis'
          });
          
          logger.info(`${CONFIG.LOG_PREFIX} ✅ Created: ${cleanContact.firstName} ${cleanContact.lastName} (${cleanContact.email})`);
        } else {
          results.errors.push({
            email: cleanContact.email,
            error: createResult.error
          });
        }
      }
      
    } catch (error) {
      results.errors.push({
        email: contact.email,
        error: error.message
      });
    }
  }
  
  logger.info(`${CONFIG.LOG_PREFIX} Batch complete: ${results.created.length} created, ${results.skipped.length} skipped, ${results.errors.length} errors`);
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Main analysis
  analyzeContactGaps,
  
  // Individual steps (for testing/debugging)
  getUniqueExternalAttendees,
  getBLOwnedAccountDomains,
  matchAttendeesToAccounts,
  checkExistingContacts,
  enrichMissingContacts,
  
  // Contact creation
  createContactsBatch,
  
  // Configuration
  US_BL_EMAILS,
  US_BL_NAMES,
  CONFIG
};

