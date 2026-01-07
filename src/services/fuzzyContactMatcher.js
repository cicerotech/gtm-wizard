/**
 * Fuzzy Contact Matcher
 * Extends FuzzyAccountMatcher patterns for person name matching
 * Handles name variations like Bob→Robert, Bill→William, Mike→Michael
 * 
 * Examples:
 * - "Bob Smith at Microsoft" → "Robert Smith" at "Microsoft Corporation"
 * - "Mike O'Brien" → "Michael O'Brien"
 * - "VP of Legal" → "Vice President, Legal"
 */

const { query } = require('../salesforce/connection');
const fuzzyAccountMatcher = require('../utils/fuzzyAccountMatcher');
const logger = require('../utils/logger');

class FuzzyContactMatcher {
  constructor() {
    // Common first name variations (nickname → formal)
    this.nameAliases = {
      'bob': 'robert',
      'rob': 'robert',
      'robbie': 'robert',
      'bill': 'william',
      'will': 'william',
      'billy': 'william',
      'mike': 'michael',
      'mick': 'michael',
      'mickey': 'michael',
      'jim': 'james',
      'jimmy': 'james',
      'jamie': 'james',
      'tom': 'thomas',
      'tommy': 'thomas',
      'dick': 'richard',
      'rick': 'richard',
      'rich': 'richard',
      'ricky': 'richard',
      'joe': 'joseph',
      'joey': 'joseph',
      'dan': 'daniel',
      'danny': 'daniel',
      'dave': 'david',
      'davy': 'david',
      'steve': 'steven',
      'stevie': 'steven',
      'chris': 'christopher',
      'matt': 'matthew',
      'matty': 'matthew',
      'tony': 'anthony',
      'nick': 'nicholas',
      'nicky': 'nicholas',
      'alex': 'alexander',
      'al': 'albert',
      'ed': 'edward',
      'eddie': 'edward',
      'ted': 'edward',
      'teddy': 'edward',
      'charlie': 'charles',
      'chuck': 'charles',
      'jack': 'john',
      'johnny': 'john',
      'jon': 'jonathan',
      'kate': 'katherine',
      'katie': 'katherine',
      'kathy': 'katherine',
      'liz': 'elizabeth',
      'lizzy': 'elizabeth',
      'beth': 'elizabeth',
      'betty': 'elizabeth',
      'jenny': 'jennifer',
      'jen': 'jennifer',
      'sam': 'samuel',
      'sammy': 'samuel',
      'ben': 'benjamin',
      'benny': 'benjamin',
      'andy': 'andrew',
      'drew': 'andrew',
      'pat': 'patrick',
      'paddy': 'patrick',
      'meg': 'margaret',
      'maggie': 'margaret',
      'peggy': 'margaret',
      'sue': 'susan',
      'suzy': 'susan',
      'susie': 'susan',
      'barb': 'barbara',
      'barbie': 'barbara',
      'deb': 'deborah',
      'debbie': 'deborah',
      'vicky': 'victoria',
      'vic': 'victoria',
      'steph': 'stephanie',
      'stephie': 'stephanie',
      'mandy': 'amanda',
      'angie': 'angela',
      'cathy': 'catherine',
      'katy': 'catherine',
      'tina': 'christina',
      // Note: 'chris' already maps to 'christopher' above
      'becky': 'rebecca',
      'becca': 'rebecca',
      'abby': 'abigail',
      'gabby': 'gabrielle',
      'larry': 'lawrence',
      'jerry': 'jerome',
      'terry': 'terrence',
      'greg': 'gregory',
      'phil': 'phillip',
      'ron': 'ronald',
      'don': 'donald',
      'donny': 'donald',
      'ray': 'raymond',
      'tim': 'timothy',
      'timmy': 'timothy',
      'fred': 'frederick',
      'freddy': 'frederick',
      'frank': 'francis',
      'frankie': 'francis',
      'wally': 'walter',
      'walt': 'walter',
      'harry': 'harold',
      'hank': 'henry'
    };

    // Title normalizations (informal → formal)
    this.titleAliases = {
      'vp': 'vice president',
      'svp': 'senior vice president',
      'evp': 'executive vice president',
      'ceo': 'chief executive officer',
      'cfo': 'chief financial officer',
      'cto': 'chief technology officer',
      'coo': 'chief operating officer',
      'cmo': 'chief marketing officer',
      'cio': 'chief information officer',
      'cpo': 'chief product officer',
      'cro': 'chief revenue officer',
      'gc': 'general counsel',
      'dir': 'director',
      'sr': 'senior',
      'jr': 'junior',
      'mgr': 'manager',
      'eng': 'engineer',
      'dev': 'developer',
      'it': 'information technology'
    };

    // Cache for performance
    this.contactCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes

    // Reuse account matcher for company matching
    this.accountMatcher = fuzzyAccountMatcher;
  }

  /**
   * Parse user input into structured contact search
   * @param {string} input - e.g., "Bob Smith at Microsoft"
   * @returns {Object} - { firstName, lastName, company, title }
   */
  parseInput(input) {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const cleanInput = input.trim();
    
    // Patterns to extract name and company
    const patterns = [
      // "FirstName LastName at Company"
      /^(.+?)\s+(?:at|from|with|@)\s+(.+)$/i,
      // "FirstName LastName, Title at Company"
      /^(.+?),\s*(.+?)\s+(?:at|from|with|@)\s+(.+)$/i,
      // "FirstName LastName (Company)"
      /^(.+?)\s*\((.+?)\)$/i,
      // Just a name
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)$/i
    ];

    let firstName = null;
    let lastName = null;
    let company = null;
    let title = null;

    // Try pattern with title
    const titleMatch = cleanInput.match(/^(.+?),\s*(.+?)\s+(?:at|from|with|@)\s+(.+)$/i);
    if (titleMatch) {
      const nameParts = this.parseNameParts(titleMatch[1]);
      firstName = nameParts.firstName;
      lastName = nameParts.lastName;
      title = titleMatch[2].trim();
      company = titleMatch[3].trim();
    } else {
      // Try pattern with "at/from" company
      const companyMatch = cleanInput.match(/^(.+?)\s+(?:at|from|with|@)\s+(.+)$/i);
      if (companyMatch) {
        const nameParts = this.parseNameParts(companyMatch[1]);
        firstName = nameParts.firstName;
        lastName = nameParts.lastName;
        company = companyMatch[2].trim();
      } else {
        // Try pattern with parentheses
        const parenMatch = cleanInput.match(/^(.+?)\s*\((.+?)\)$/i);
        if (parenMatch) {
          const nameParts = this.parseNameParts(parenMatch[1]);
          firstName = nameParts.firstName;
          lastName = nameParts.lastName;
          company = parenMatch[2].trim();
        } else {
          // Just a name
          const nameParts = this.parseNameParts(cleanInput);
          firstName = nameParts.firstName;
          lastName = nameParts.lastName;
        }
      }
    }

    // Extract email domain if present for company hint
    const emailMatch = cleanInput.match(/([a-zA-Z0-9.-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/);
    let emailDomain = null;
    if (emailMatch) {
      emailDomain = emailMatch[2];
      // Use domain as company hint if no company specified
      if (!company) {
        company = emailDomain.split('.')[0]; // e.g., "microsoft.com" → "microsoft"
      }
    }

    return {
      firstName,
      lastName,
      company,
      title,
      emailDomain,
      originalInput: cleanInput
    };
  }

  /**
   * Parse name into first/last components
   */
  parseNameParts(nameString) {
    const parts = nameString.trim().split(/\s+/);
    
    if (parts.length === 0) {
      return { firstName: null, lastName: null };
    }
    
    if (parts.length === 1) {
      // Could be first or last name - we'll search both
      return { firstName: parts[0], lastName: parts[0] };
    }

    // Handle suffixes like Jr., Sr., III, etc.
    const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'phd', 'md', 'esq'];
    const lastPart = parts[parts.length - 1].toLowerCase();
    
    if (suffixes.includes(lastPart)) {
      // Exclude suffix from name parsing
      parts.pop();
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  /**
   * Get all name variations to search for
   */
  getNameVariations(firstName) {
    if (!firstName) return [];
    
    const lower = firstName.toLowerCase();
    const variations = new Set([firstName, lower]);
    
    // Add formal name if this is a nickname
    if (this.nameAliases[lower]) {
      variations.add(this.nameAliases[lower]);
      // Also add capitalized version
      variations.add(this.nameAliases[lower].charAt(0).toUpperCase() + this.nameAliases[lower].slice(1));
    }
    
    // Reverse lookup - if formal name, add common nicknames
    for (const [nickname, formal] of Object.entries(this.nameAliases)) {
      if (formal === lower) {
        variations.add(nickname);
        variations.add(nickname.charAt(0).toUpperCase() + nickname.slice(1));
      }
    }
    
    return Array.from(variations);
  }

  /**
   * Main contact search function
   * @param {string} input - User's search input
   * @returns {Object} - { contacts: [], multipleMatches: boolean, sfSource: boolean }
   */
  async findContact(input) {
    const startTime = Date.now();
    
    try {
      // Parse input
      const parsed = this.parseInput(input);
      
      if (!parsed || (!parsed.firstName && !parsed.lastName)) {
        return {
          success: false,
          error: 'Could not parse contact name from input',
          contacts: [],
          parsed
        };
      }

      // Check cache
      const cacheKey = `contact:${input.toLowerCase()}`;
      if (this.contactCache.has(cacheKey)) {
        const cached = this.contactCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          logger.info('📋 Contact cache hit', { input });
          return cached.result;
        }
      }

      // Find account if company specified
      let accountId = null;
      let accountName = null;
      
      if (parsed.company) {
        const account = await this.accountMatcher.findAccount(parsed.company);
        if (account) {
          accountId = account.id;
          accountName = account.name;
        }
      }

      // Build name variations for fuzzy search
      const firstNameVariations = this.getNameVariations(parsed.firstName);
      const lastNameVariations = parsed.lastName ? [parsed.lastName] : [];

      // Search Contacts first
      let contacts = await this.searchContacts(
        firstNameVariations, 
        lastNameVariations, 
        accountId,
        parsed.emailDomain
      );

      // If no contacts found, search Leads
      if (contacts.length === 0) {
        contacts = await this.searchLeads(
          firstNameVariations,
          lastNameVariations,
          accountId ? null : parsed.company, // Use company name for Lead search if no account matched
          parsed.emailDomain
        );
      }

      const duration = Date.now() - startTime;
      
      const result = {
        success: contacts.length > 0,
        contacts: contacts.slice(0, 10), // Limit to 10
        multipleMatches: contacts.length > 1,
        accountId,
        accountName,
        parsed,
        duration,
        source: 'salesforce'
      };

      // Cache result
      this.contactCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      logger.info('🔍 Contact search completed', {
        input,
        found: contacts.length,
        duration,
        accountMatched: !!accountId
      });

      return result;

    } catch (error) {
      logger.error('Error in findContact:', error);
      return {
        success: false,
        error: error.message,
        contacts: [],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Search Salesforce Contacts
   */
  async searchContacts(firstNameVariations, lastNameVariations, accountId, emailDomain) {
    try {
      const conditions = [];

      // Build name conditions
      if (firstNameVariations.length > 0) {
        const firstNameConditions = firstNameVariations.map(name => 
          `FirstName LIKE '${this.escapeSOQL(name)}%'`
        ).join(' OR ');
        conditions.push(`(${firstNameConditions})`);
      }

      if (lastNameVariations.length > 0 && lastNameVariations[0]) {
        const lastNameConditions = lastNameVariations.map(name =>
          `LastName LIKE '${this.escapeSOQL(name)}%'`
        ).join(' OR ');
        conditions.push(`(${lastNameConditions})`);
      }

      // Add account filter
      if (accountId) {
        conditions.push(`AccountId = '${accountId}'`);
      }

      // Add email domain filter
      if (emailDomain) {
        conditions.push(`Email LIKE '%@${this.escapeSOQL(emailDomain)}'`);
      }

      if (conditions.length === 0) {
        return [];
      }

      const soql = `
        SELECT Id, FirstName, LastName, Name, Title, Email, MobilePhone, Phone,
               Account.Id, Account.Name, Owner.Name, OwnerId,
               MailingCity, MailingState
        FROM Contact
        WHERE ${conditions.join(' AND ')}
        ORDER BY LastModifiedDate DESC
        LIMIT 20
      `;

      const result = await query(soql);
      
      if (!result.records) {
        return [];
      }

      // Score and rank matches
      return result.records.map(contact => ({
        id: contact.Id,
        firstName: contact.FirstName,
        lastName: contact.LastName,
        name: contact.Name,
        title: contact.Title,
        email: contact.Email,
        mobilePhone: contact.MobilePhone,
        phone: contact.Phone,
        accountId: contact.Account?.Id,
        accountName: contact.Account?.Name,
        ownerId: contact.OwnerId,
        ownerName: contact.Owner?.Name,
        city: contact.MailingCity,
        state: contact.MailingState,
        recordType: 'Contact',
        isComplete: !!(contact.Email && contact.MobilePhone),
        score: this.scoreMatch(contact, firstNameVariations, lastNameVariations)
      })).sort((a, b) => b.score - a.score);

    } catch (error) {
      logger.error('Error searching contacts:', error);
      return [];
    }
  }

  /**
   * Search Salesforce Leads
   */
  async searchLeads(firstNameVariations, lastNameVariations, company, emailDomain) {
    try {
      const conditions = [];

      // Build name conditions
      if (firstNameVariations.length > 0) {
        const firstNameConditions = firstNameVariations.map(name =>
          `FirstName LIKE '${this.escapeSOQL(name)}%'`
        ).join(' OR ');
        conditions.push(`(${firstNameConditions})`);
      }

      if (lastNameVariations.length > 0 && lastNameVariations[0]) {
        const lastNameConditions = lastNameVariations.map(name =>
          `LastName LIKE '${this.escapeSOQL(name)}%'`
        ).join(' OR ');
        conditions.push(`(${lastNameConditions})`);
      }

      // Add company filter for Leads
      if (company) {
        conditions.push(`Company LIKE '%${this.escapeSOQL(company)}%'`);
      }

      // Add email domain filter
      if (emailDomain) {
        conditions.push(`Email LIKE '%@${this.escapeSOQL(emailDomain)}'`);
      }

      // Only search unconverted leads
      conditions.push('IsConverted = false');

      if (conditions.length < 2) { // Need at least name + unconverted condition
        return [];
      }

      const soql = `
        SELECT Id, FirstName, LastName, Name, Title, Email, MobilePhone, Phone,
               Company, Owner.Name, OwnerId, City, State, Status
        FROM Lead
        WHERE ${conditions.join(' AND ')}
        ORDER BY LastModifiedDate DESC
        LIMIT 20
      `;

      const result = await query(soql);

      if (!result.records) {
        return [];
      }

      return result.records.map(lead => ({
        id: lead.Id,
        firstName: lead.FirstName,
        lastName: lead.LastName,
        name: lead.Name,
        title: lead.Title,
        email: lead.Email,
        mobilePhone: lead.MobilePhone,
        phone: lead.Phone,
        accountId: null,
        accountName: lead.Company,
        ownerId: lead.OwnerId,
        ownerName: lead.Owner?.Name,
        city: lead.City,
        state: lead.State,
        recordType: 'Lead',
        status: lead.Status,
        isComplete: !!(lead.Email && lead.MobilePhone),
        score: this.scoreMatch(lead, firstNameVariations, lastNameVariations)
      })).sort((a, b) => b.score - a.score);

    } catch (error) {
      logger.error('Error searching leads:', error);
      return [];
    }
  }

  /**
   * Score a match based on name similarity
   */
  scoreMatch(record, firstNameVariations, lastNameVariations) {
    let score = 0;
    
    const firstName = (record.FirstName || '').toLowerCase();
    const lastName = (record.LastName || '').toLowerCase();

    // Exact first name match
    if (firstNameVariations.some(v => v.toLowerCase() === firstName)) {
      score += 0.5;
    } else if (firstNameVariations.some(v => firstName.includes(v.toLowerCase()))) {
      score += 0.3;
    }

    // Exact last name match
    if (lastNameVariations.some(v => v.toLowerCase() === lastName)) {
      score += 0.5;
    } else if (lastNameVariations.some(v => lastName.includes(v.toLowerCase()))) {
      score += 0.3;
    }

    // Bonus for complete records
    if (record.Email && record.MobilePhone) {
      score += 0.1;
    }

    // Bonus for having an account (for Contacts)
    if (record.Account?.Id) {
      score += 0.05;
    }

    return score;
  }

  /**
   * Check if a contact record is complete (has both email and phone)
   */
  isComplete(contact) {
    return !!(contact.email && contact.mobilePhone);
  }

  /**
   * Normalize title for matching
   */
  normalizeTitle(title) {
    if (!title) return '';
    
    let normalized = title.toLowerCase();
    
    // Expand abbreviations
    for (const [abbr, full] of Object.entries(this.titleAliases)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      normalized = normalized.replace(regex, full);
    }
    
    // Remove common noise words
    normalized = normalized.replace(/\b(of|the|and|&)\b/gi, ' ');
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  /**
   * Escape string for SOQL
   */
  escapeSOQL(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/&/g, '%');
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.contactCache.clear();
  }
}

module.exports = new FuzzyContactMatcher();

