/**
 * Smart Matcher
 * Intelligently matches Obsidian notes to Salesforce accounts
 * Uses multiple signals: calendar events, BL ownership, email domains, keywords
 */

const path = require('path');

/**
 * Match confidence levels
 */
const CONFIDENCE = {
  HIGH: 0.9,      // Auto-link without confirmation
  MEDIUM: 0.6,    // Suggest, may need confirmation
  LOW: 0.3,       // Low confidence, flag for review
  NONE: 0
};

/**
 * Smart match a meeting note to a Salesforce account
 * 
 * @param {Object} meetingInfo - Parsed meeting info from vault-reader
 * @param {Object} context - Context from GTM Brain
 * @param {Array} context.calendarEvents - Recent calendar events for BL
 * @param {Array} context.ownedAccounts - Accounts owned by this BL
 * @param {Map} context.domainToAccount - Map of email domains to account IDs
 * @returns {Object} { accountId, accountName, confidence, matchMethod }
 */
function matchToAccount(meetingInfo, context) {
  const candidates = [];
  
  // Method 1: Frontmatter account name (highest priority - user specified)
  if (meetingInfo.account) {
    const match = findAccountByName(meetingInfo.account, context.ownedAccounts);
    if (match) {
      candidates.push({
        ...match,
        confidence: CONFIDENCE.HIGH,
        matchMethod: 'frontmatter'
      });
    }
  }
  
  // Method 2: Calendar event matching (timestamp proximity)
  if (meetingInfo.date) {
    const calendarMatch = matchByCalendarEvent(meetingInfo, context.calendarEvents);
    if (calendarMatch) {
      candidates.push({
        ...calendarMatch,
        confidence: CONFIDENCE.HIGH,
        matchMethod: 'calendar_event'
      });
    }
  }
  
  // Method 3: Folder structure (e.g., Meetings/AT&T/...)
  const folderMatch = matchByFolderPath(meetingInfo.path, context.ownedAccounts);
  if (folderMatch) {
    candidates.push({
      ...folderMatch,
      confidence: CONFIDENCE.HIGH,
      matchMethod: 'folder_structure'
    });
  }
  
  // Method 4: Email domain extraction from body/attendees
  const domainMatch = matchByEmailDomains(meetingInfo, context.domainToAccount);
  if (domainMatch) {
    candidates.push({
      ...domainMatch,
      confidence: CONFIDENCE.MEDIUM,
      matchMethod: 'email_domain'
    });
  }
  
  // Method 5: Account name mentioned in title or body
  const keywordMatch = matchByKeywords(meetingInfo, context.ownedAccounts);
  if (keywordMatch) {
    candidates.push({
      ...keywordMatch,
      confidence: CONFIDENCE.MEDIUM,
      matchMethod: 'keyword_match'
    });
  }
  
  // Return best match
  if (candidates.length === 0) {
    return { accountId: null, accountName: null, confidence: CONFIDENCE.NONE, matchMethod: null };
  }
  
  // Sort by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  // If multiple high-confidence matches agree, boost confidence
  const topMatch = candidates[0];
  const agreementCount = candidates.filter(c => c.accountId === topMatch.accountId).length;
  
  if (agreementCount >= 2) {
    topMatch.confidence = Math.min(1.0, topMatch.confidence + 0.1);
    topMatch.matchMethod += ` (+${agreementCount - 1} confirming)`;
  }
  
  return topMatch;
}

/**
 * Find account by name (exact or fuzzy match)
 */
function findAccountByName(name, accounts) {
  if (!name || !accounts?.length) return null;
  
  const normalizedName = name.toLowerCase().trim();
  
  // Exact match
  let match = accounts.find(a => a.name.toLowerCase() === normalizedName);
  if (match) {
    return { accountId: match.id, accountName: match.name };
  }
  
  // Contains match
  match = accounts.find(a => a.name.toLowerCase().includes(normalizedName));
  if (match) {
    return { accountId: match.id, accountName: match.name };
  }
  
  // Reverse contains (account name in search term)
  match = accounts.find(a => normalizedName.includes(a.name.toLowerCase()));
  if (match) {
    return { accountId: match.id, accountName: match.name };
  }
  
  return null;
}

/**
 * Match by calendar event (timestamp proximity)
 */
function matchByCalendarEvent(meetingInfo, calendarEvents) {
  if (!meetingInfo.date || !calendarEvents?.length) return null;
  
  // Parse meeting note date
  const noteDate = new Date(meetingInfo.date);
  if (isNaN(noteDate.getTime())) return null;
  
  // Find calendar events within ±3 hours of note date
  const windowMs = 3 * 60 * 60 * 1000; // 3 hours
  
  for (const event of calendarEvents) {
    const eventDate = new Date(event.startDateTime);
    const timeDiff = Math.abs(noteDate.getTime() - eventDate.getTime());
    
    if (timeDiff <= windowMs && event.accountId) {
      return {
        accountId: event.accountId,
        accountName: event.accountName || event.subject,
        calendarEvent: event.subject
      };
    }
  }
  
  return null;
}

/**
 * Match by folder path structure
 * Handles patterns like:
 * - Meetings/AT&T/...
 * - Accounts/Coherent/Meetings/...
 * - AT&T - Discovery Call.md
 */
function matchByFolderPath(filePath, accounts) {
  if (!filePath || !accounts?.length) return null;
  
  const pathParts = filePath.split(path.sep);
  const fileName = path.basename(filePath, '.md');
  
  // Check each path segment for account name
  for (const part of pathParts) {
    const match = findAccountByName(part, accounts);
    if (match) return match;
  }
  
  // Check filename for "AccountName - Title" pattern
  const titleMatch = fileName.match(/^(.+?)\s*[-–—]\s*.+$/);
  if (titleMatch) {
    const match = findAccountByName(titleMatch[1], accounts);
    if (match) return match;
  }
  
  return null;
}

/**
 * Match by email domains found in note
 */
function matchByEmailDomains(meetingInfo, domainToAccount) {
  if (!domainToAccount || domainToAccount.size === 0) return null;
  
  // Collect all text to search
  const searchText = [
    meetingInfo.rawBody || '',
    (meetingInfo.attendees || []).join(' '),
    JSON.stringify(meetingInfo.frontmatter || {})
  ].join(' ');
  
  // Extract email addresses
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/gi;
  const emails = searchText.match(emailRegex) || [];
  
  // Extract domains
  const domains = emails.map(e => e.split('@')[1]?.toLowerCase()).filter(Boolean);
  
  // Find matching account
  for (const domain of domains) {
    const accountId = domainToAccount.get(domain);
    if (accountId) {
      return { accountId, accountName: domain, matchedDomain: domain };
    }
  }
  
  return null;
}

/**
 * Match by keywords in title/body
 */
function matchByKeywords(meetingInfo, accounts) {
  if (!accounts?.length) return null;
  
  const searchText = [
    meetingInfo.title || '',
    meetingInfo.rawBody?.substring(0, 2000) || ''
  ].join(' ').toLowerCase();
  
  // Score each account by keyword presence
  const scored = accounts.map(account => {
    const keywords = extractKeywords(account.name);
    let score = 0;
    
    for (const keyword of keywords) {
      if (keyword.length >= 3 && searchText.includes(keyword.toLowerCase())) {
        score += keyword.length; // Longer keywords = higher score
      }
    }
    
    return { ...account, score };
  }).filter(a => a.score > 0);
  
  if (scored.length === 0) return null;
  
  // Return highest scoring
  scored.sort((a, b) => b.score - a.score);
  return { accountId: scored[0].id, accountName: scored[0].name };
}

/**
 * Extract searchable keywords from account name
 */
function extractKeywords(name) {
  if (!name) return [];
  
  // Split by common delimiters
  const words = name.split(/[\s,&-]+/);
  
  // Filter out common words
  const stopWords = ['inc', 'llc', 'ltd', 'corp', 'company', 'the', 'and', 'of'];
  
  return words.filter(w => 
    w.length >= 2 && !stopWords.includes(w.toLowerCase())
  );
}

/**
 * Check if note should be skipped (privacy filter)
 */
function shouldSkipNote(meetingInfo, filePath) {
  // Check frontmatter for explicit skip
  if (meetingInfo.frontmatter?.sync === false) {
    return { skip: true, reason: 'sync:false in frontmatter' };
  }
  
  if (meetingInfo.frontmatter?.private === true) {
    return { skip: true, reason: 'private:true in frontmatter' };
  }
  
  // Check folder path for _Private
  if (filePath.includes('_Private') || filePath.includes('_private')) {
    return { skip: true, reason: 'in _Private folder' };
  }
  
  // Check for internal meeting keywords in title
  const internalKeywords = [
    '1:1', 'one-on-one', 'standup', 'stand-up', 'internal',
    'team sync', 'all hands', 'retrospective', 'retro',
    'interview', 'greenhouse'
  ];
  
  const titleLower = (meetingInfo.title || '').toLowerCase();
  for (const keyword of internalKeywords) {
    if (titleLower.includes(keyword)) {
      return { skip: true, reason: `internal meeting keyword: ${keyword}` };
    }
  }
  
  return { skip: false };
}

module.exports = {
  matchToAccount,
  findAccountByName,
  shouldSkipNote,
  CONFIDENCE
};

