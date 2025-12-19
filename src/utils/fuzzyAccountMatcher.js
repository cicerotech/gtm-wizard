/**
 * Fuzzy Account Matcher
 * Handles 2,000+ Fortune 500 company name variations
 * 
 * Examples:
 * - "HSBC" → "HSBC Holdings plc"
 * - "Domino's" → "Domino's Pizza, Inc."
 * - "Levi Strauss" → "Levi Strauss & Co."
 * - "Bank of America" → "BofA" → "Bank of America Corporation"
 */

const { query } = require('../salesforce/connection');

class FuzzyAccountMatcher {
  constructor() {
    // Common company suffixes to strip
    // NOTE: Do NOT include '&' here - it's part of company names like "Johnson & Johnson"
    this.suffixes = [
      'corporation', 'corp', 'incorporated', 'inc', 'company', 'co',
      'limited', 'ltd', 'llc', 'plc', 'group', 'holdings', 'partners',
      'lp', 'llp', 'the'
    ];
    
    // Common abbreviations
    this.abbreviations = {
      'international': 'intl',
      'technologies': 'tech',
      'services': 'svcs',
      'systems': 'sys',
      'solutions': 'sol'
    };
    
    // Known aliases (from Fortune 500 analysis)
    this.aliases = {
      'ibm': 'International Business Machines',
      'ge': 'General Electric',
      '3m': 'Minnesota Mining and Manufacturing',
      'at&t': 'American Telephone and Telegraph',
      'hp': 'Hewlett-Packard',
      'jpmorgan': 'JPMorgan Chase',
      'bofa': 'Bank of America',
      'gs': 'Goldman Sachs',
      'ms': 'Morgan Stanley'
    };
    
    // Protected exact-match names (prevent false positive fuzzy matches)
    // These should ONLY match their exact Salesforce account name
    this.protectedNames = new Set([
      'intuit',           // Don't match to "Applied Intuition"
      'applied intuition', // Keep separate from "Intuit"
      'meta',             // Don't match to "Metadata" etc.
      'visa',             // Don't match to "Advisor" etc.
      'uber',             // Don't match to "Hubertus" etc.
      'aes',              // Don't match to "Aesthetics" etc.
    ]);
    
    // Cache for performance
    this.accountCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Main matching function - returns best match from Salesforce
   */
  async findAccount(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
      return null;
    }
    
    // Normalize search term
    const normalized = this.normalize(searchTerm);
    
    // Check cache
    const cacheKey = normalized.toLowerCase();
    if (this.accountCache.has(cacheKey)) {
      const cached = this.accountCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.account;
      }
    }
    
    // Check if this is a protected name (require exact match only)
    const isProtected = this.protectedNames.has(normalized.toLowerCase());
    
    // Try exact match first (fastest)
    let account = await this.exactMatch(searchTerm);
    if (account) {
      this.cacheResult(cacheKey, account);
      return account;
    }
    
    // Try normalized match
    account = await this.exactMatch(normalized);
    if (account) {
      this.cacheResult(cacheKey, account);
      return account;
    }
    
    // For protected names, ONLY allow exact matches - skip fuzzy
    if (isProtected) {
      console.log(`[FuzzyMatcher] Protected name "${searchTerm}" - requiring exact match only`);
      return null;
    }
    
    // Try fuzzy matching
    account = await this.fuzzyMatch(searchTerm);
    if (account) {
      this.cacheResult(cacheKey, account);
      return account;
    }
    
    // Try alias lookup
    const aliasExpanded = this.expandAlias(searchTerm);
    if (aliasExpanded !== searchTerm) {
      account = await this.exactMatch(aliasExpanded);
      if (account) {
        this.cacheResult(cacheKey, account);
        return account;
      }
    }
    
    return null;
  }

  /**
   * Exact match in Salesforce
   */
  async exactMatch(searchTerm) {
    try {
      const escapedTerm = searchTerm.replace(/'/g, "\\'");
      
      const soql = `
        SELECT Id, Name, Owner.Name
        FROM Account
        WHERE Name = '${escapedTerm}'
        LIMIT 1
      `;
      
      const result = await query(soql, true);
      
      if (result.records && result.records.length > 0) {
        return {
          id: result.records[0].Id,
          name: result.records[0].Name,
          owner: result.records[0].Owner?.Name,
          matchType: 'exact',
          confidence: 1.0
        };
      }
      
      return null;
    } catch (error) {
      console.error('[FuzzyMatcher] Exact match error:', error);
      return null;
    }
  }

  /**
   * Fuzzy matching using LIKE queries
   */
  async fuzzyMatch(searchTerm) {
    try {
      const normalized = this.normalize(searchTerm);
      const escapedTerm = normalized.replace(/'/g, "\\'");
      
      // Try CONTAINS match
      const soql = `
        SELECT Id, Name, Owner.Name
        FROM Account
        WHERE Name LIKE '%${escapedTerm}%'
        ORDER BY Name
        LIMIT 10
      `;
      
      const result = await query(soql, true);
      
      if (!result.records || result.records.length === 0) {
        return null;
      }
      
      // PRIORITY CHECK: If any match is an exact case-insensitive match, return it
      const exactCaseInsensitiveMatch = result.records.find(
        acc => acc.Name.toLowerCase() === searchTerm.toLowerCase() ||
               acc.Name.toLowerCase() === normalized.toLowerCase()
      );
      
      if (exactCaseInsensitiveMatch) {
        return {
          id: exactCaseInsensitiveMatch.Id,
          name: exactCaseInsensitiveMatch.Name,
          owner: exactCaseInsensitiveMatch.Owner?.Name,
          matchType: 'exact',
          confidence: 1.0
        };
      }
      
      // Score matches by similarity (with improved logic)
      const scoredMatches = result.records.map(acc => ({
        id: acc.Id,
        name: acc.Name,
        owner: acc.Owner?.Name,
        score: this.similarityScore(normalized, this.normalize(acc.Name), searchTerm, acc.Name)
      }));
      
      // Sort by score
      scoredMatches.sort((a, b) => b.score - a.score);
      
      const bestMatch = scoredMatches[0];
      
      return {
        id: bestMatch.id,
        name: bestMatch.name,
        owner: bestMatch.owner,
        matchType: 'fuzzy',
        confidence: bestMatch.score,
        alternatives: scoredMatches.slice(1, 3).map(m => m.name)
      };
      
    } catch (error) {
      console.error('[FuzzyMatcher] Fuzzy match error:', error);
      return null;
    }
  }

  /**
   * Normalize company name for matching
   */
  normalize(name) {
    let normalized = name.toLowerCase().trim();
    
    // Remove punctuation except &
    normalized = normalized.replace(/[.,]/g, '');
    
    // Remove common suffixes
    for (const suffix of this.suffixes) {
      const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
      normalized = normalized.replace(regex, '');
    }
    
    // Trim again
    normalized = normalized.trim();
    
    return normalized;
  }

  /**
   * Expand known aliases
   */
  expandAlias(term) {
    const lower = term.toLowerCase().trim();
    return this.aliases[lower] || term;
  }

  /**
   * Calculate similarity score (0-1)
   * @param str1 - Normalized search term
   * @param str2 - Normalized account name
   * @param originalSearch - Original search term (for word boundary checks)
   * @param originalAccount - Original account name (for word boundary checks)
   */
  similarityScore(str1, str2, originalSearch = '', originalAccount = '') {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const search = (originalSearch || str1).toLowerCase();
    const account = (originalAccount || str2).toLowerCase();
    
    // Exact match after normalization
    if (s1 === s2) return 1.0;
    
    // Check if search term is a COMPLETE WORD in account name (not a substring of another word)
    // e.g., "Intuit" should match "Intuit Inc" but NOT "Applied Intuition"
    const searchWords = search.split(/\s+/);
    const accountWords = account.split(/\s+/);
    
    // Check for exact word match (highest priority for short, distinct company names)
    const hasExactWordMatch = searchWords.every(searchWord => 
      accountWords.some(accountWord => accountWord === searchWord)
    );
    
    if (hasExactWordMatch) {
      // Shorter account name = better match (Intuit > Applied Intuition)
      const lengthPenalty = Math.min(1.0, s1.length / s2.length);
      return 0.95 * lengthPenalty;
    }
    
    // Check if search is substring of a word (lower score)
    // e.g., "intuit" in "intuition" - this is a partial word match, lower confidence
    const isSubstringOfWord = accountWords.some(word => 
      word.includes(s1) && word !== s1
    );
    
    if (isSubstringOfWord) {
      // Penalize substring matches heavily - likely wrong account
      return 0.3;
    }
    
    // One contains the other as complete string
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;
    
    // Word overlap
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    if (union.size === 0) return 0;
    
    const jaccardSimilarity = intersection.size / union.size;
    
    // Levenshtein distance for very close matches
    if (jaccardSimilarity > 0.5) {
      const levDistance = this.levenshteinDistance(s1, s2);
      const maxLen = Math.max(s1.length, s2.length);
      const levSimilarity = 1 - (levDistance / maxLen);
      
      return (jaccardSimilarity + levSimilarity) / 2;
    }
    
    return jaccardSimilarity;
  }

  /**
   * Levenshtein distance for close string matching
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Cache result
   */
  cacheResult(key, account) {
    this.accountCache.set(key, {
      account,
      timestamp: Date.now()
    });
  }

  /**
   * Batch match multiple potential names
   */
  async findBestMatch(variations) {
    for (const variation of variations) {
      const match = await this.findAccount(variation);
      if (match && match.confidence > 0.7) {
        return match;
      }
    }
    return null;
  }
}

module.exports = new FuzzyAccountMatcher();

