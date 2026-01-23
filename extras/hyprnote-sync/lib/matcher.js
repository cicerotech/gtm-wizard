/**
 * Account Matcher
 * 
 * Intelligent matching of Hyprnote meetings to Salesforce Accounts.
 * Uses multiple strategies for reliable matching.
 * 
 * Enhanced with ownership-based prioritization - matches accounts
 * owned by the rep first for higher confidence.
 */

const salesforce = require('./salesforce');

// Cache for rep's owned accounts (refreshed periodically)
let ownedAccountsCache = {
  userId: null,
  accounts: [],
  lastRefresh: null
};

/**
 * Get accounts owned by a specific user
 * @param {string} userId - Salesforce User ID
 */
async function getOwnedAccounts(userId) {
  if (!userId) return [];
  
  // Return cached if recent (15 min)
  const cacheAge = ownedAccountsCache.lastRefresh 
    ? Date.now() - ownedAccountsCache.lastRefresh 
    : Infinity;
    
  if (ownedAccountsCache.userId === userId && cacheAge < 15 * 60 * 1000) {
    return ownedAccountsCache.accounts;
  }
  
  try {
    const conn = salesforce.getConnection();
    const result = await conn.query(`
      SELECT Id, Name, Customer_Brain__c
      FROM Account
      WHERE OwnerId = '${userId}'
      ORDER BY Name
      LIMIT 500
    `);
    
    ownedAccountsCache = {
      userId,
      accounts: result.records || [],
      lastRefresh: Date.now()
    };
    
    return ownedAccountsCache.accounts;
  } catch (err) {
    console.log('Warning: Could not fetch owned accounts: ' + err.message);
    return [];
  }
}

/**
 * Check if a company name matches any owned accounts
 */
function findInOwnedAccounts(companyName, ownedAccounts) {
  if (!companyName || !ownedAccounts.length) return null;
  
  const cleanName = companyName.toLowerCase().trim();
  
  // Exact match
  for (const account of ownedAccounts) {
    if (account.Name.toLowerCase() === cleanName) {
      return account;
    }
  }
  
  // Partial match
  for (const account of ownedAccounts) {
    const accountName = account.Name.toLowerCase();
    if (accountName.includes(cleanName) || cleanName.includes(accountName.split(' ')[0])) {
      return account;
    }
  }
  
  return null;
}

/**
 * Match a meeting to a Salesforce Account
 * 
 * Strategy priority:
 * 0. Check rep's owned accounts first (highest priority)
 * 1. Calendar attendee emails → Contact lookup → Account
 * 2. Participant emails → Contact lookup → Account
 * 3. Company name → Account fuzzy match
 * 4. Meeting title parsing → Account fuzzy match
 * 
 * @param {Object} session - Hyprnote session
 * @param {Array} participants - Session participants
 * @param {Object} calendarEvent - Optional calendar event
 * @param {string} repUserId - Optional: Rep's Salesforce User ID for ownership matching
 */
async function matchAccount(session, participants, calendarEvent = null, repUserId = null) {
  const results = {
    account: null,
    contact: null,
    matchMethod: null,
    confidence: 0,
    candidates: []
  };
  
  // Strategy 0: Check rep's owned accounts first
  // This provides highest confidence - if they own the account, it's likely correct
  if (repUserId) {
    const ownedAccounts = await getOwnedAccounts(repUserId);
    
    // Check participant companies against owned accounts
    const externalParticipants = participants.filter(p => !p.is_user);
    for (const participant of externalParticipants) {
      if (participant.company) {
        const ownedMatch = findInOwnedAccounts(participant.company, ownedAccounts);
        if (ownedMatch) {
          results.account = ownedMatch;
          results.matchMethod = 'owned_account_company';
          results.confidence = 98;
          return results;
        }
      }
    }
    
    // Check meeting title against owned accounts
    const titleCompany = extractCompanyFromTitle(session.title);
    if (titleCompany) {
      const ownedMatch = findInOwnedAccounts(titleCompany, ownedAccounts);
      if (ownedMatch) {
        results.account = ownedMatch;
        results.matchMethod = 'owned_account_title';
        results.confidence = 92;
        return results;
      }
    }
  }
  
  // Strategy 1: Calendar attendee emails
  if (calendarEvent && calendarEvent.participants) {
    try {
      const attendees = JSON.parse(calendarEvent.participants);
      for (const attendee of attendees) {
        if (attendee.email && !isInternalEmail(attendee.email)) {
          const contact = await salesforce.findContactByEmail(attendee.email);
          if (contact && contact.AccountId) {
            results.account = {
              Id: contact.AccountId,
              Name: contact.Account?.Name
            };
            results.contact = contact;
            results.matchMethod = 'calendar_attendee_email';
            results.confidence = 95;
            return results;
          }
        }
      }
    } catch (e) {
      // Calendar participants might not be valid JSON
    }
  }
  
  // Strategy 2: Participant emails from Hyprnote
  const externalParticipants = participants.filter(p => 
    p.email && !p.is_user && !isInternalEmail(p.email)
  );
  
  for (const participant of externalParticipants) {
    const contact = await salesforce.findContactByEmail(participant.email);
    if (contact && contact.AccountId) {
      results.account = {
        Id: contact.AccountId,
        Name: contact.Account?.Name
      };
      results.contact = contact;
      results.matchMethod = 'participant_email';
      results.confidence = 90;
      return results;
    }
  }
  
  // Strategy 3: Company name from participants
  const companies = [...new Set(
    externalParticipants
      .map(p => p.company)
      .filter(c => c && c.length > 1)
  )];
  
  for (const company of companies) {
    const account = await salesforce.findAccount(company);
    if (account) {
      results.account = account;
      results.matchMethod = 'participant_company';
      results.confidence = 75;
      results.candidates.push({ name: company, account });
      
      // Return first match but keep looking for better ones
      if (!results.account) {
        results.account = account;
      }
    }
  }
  
  if (results.account && results.matchMethod === 'participant_company') {
    return results;
  }
  
  // Strategy 4: Parse meeting title for company name
  const titleCompany = extractCompanyFromTitle(session.title);
  if (titleCompany) {
    const account = await salesforce.findAccount(titleCompany);
    if (account) {
      results.account = account;
      results.matchMethod = 'meeting_title';
      results.confidence = 60;
      return results;
    }
  }
  
  // No match found
  results.matchMethod = 'none';
  results.confidence = 0;
  return results;
}

/**
 * Check if email is internal (Eudia/company domain)
 */
function isInternalEmail(email) {
  if (!email) return true;
  
  const internalDomains = [
    'eudia.com',
    'cicerotech.com',
    'cicerotech.link',
    'hyprnote.com'
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  return internalDomains.some(d => domain === d || domain?.endsWith('.' + d));
}

/**
 * Extract company name from meeting title
 * Common patterns:
 * - "Best Buy Legal Strategy Meeting"
 * - "Call with Acme Corp"
 * - "Demo - Microsoft"
 * - "Chevron Follow-up"
 */
function extractCompanyFromTitle(title) {
  if (!title) return null;
  
  // Remove common meeting words
  const cleanTitle = title
    .replace(/\b(meeting|call|demo|sync|follow[- ]?up|check[- ]?in|discussion|review|intro|introduction|strategy|legal|sales|discovery|proposal)\b/gi, '')
    .replace(/\b(with|for|re:|regarding)\b/gi, '')
    .replace(/[-–—:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If something meaningful remains, it might be a company name
  if (cleanTitle.length > 2 && cleanTitle.length < 50) {
    // Capitalize first letter of each word
    return cleanTitle
      .split(' ')
      .filter(w => w.length > 1)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  
  return null;
}

/**
 * Get primary company from participants
 */
function getPrimaryCompany(participants) {
  const external = participants.filter(p => !p.is_user && p.company);
  
  if (external.length === 0) return null;
  
  // Count company occurrences
  const companyCounts = {};
  external.forEach(p => {
    companyCounts[p.company] = (companyCounts[p.company] || 0) + 1;
  });
  
  // Return most common company
  const sorted = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1]);
  
  return sorted[0]?.[0] || null;
}

/**
 * Get primary contact from participants
 */
function getPrimaryContact(participants) {
  const external = participants.filter(p => 
    !p.is_user && p.email && !isInternalEmail(p.email)
  );
  
  if (external.length === 0) return null;
  
  // Prefer participants with job titles (likely decision makers)
  const withTitle = external.filter(p => p.job_title);
  if (withTitle.length > 0) {
    return withTitle[0];
  }
  
  return external[0];
}

module.exports = {
  matchAccount,
  isInternalEmail,
  extractCompanyFromTitle,
  getPrimaryCompany,
  getPrimaryContact,
  getOwnedAccounts,
  findInOwnedAccounts
};

