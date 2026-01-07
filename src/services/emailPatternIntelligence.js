/**
 * Email Pattern Intelligence Service
 * Detects email patterns from known contacts and generates candidate emails
 * 
 * Flow:
 * 1. Get domain for company
 * 2. Query SF for existing emails at that domain
 * 3. Detect pattern(s) used by company
 * 4. Generate candidate emails for target person
 * 5. Verify candidates
 */

const logger = require('../utils/logger');
const { query } = require('../salesforce/connection');
const { cache } = require('../utils/cache');
const domainResolver = require('./companyDomainResolver');

class EmailPatternIntelligence {
  constructor() {
    // Common email patterns with regex matchers
    this.patterns = [
      {
        name: 'first.last',
        regex: /^([a-z]+)\.([a-z]+)@/i,
        generate: (first, last) => `${first.toLowerCase()}.${last.toLowerCase()}`
      },
      {
        name: 'firstlast',
        regex: /^([a-z]+)([a-z]+)@/i,
        generate: (first, last) => `${first.toLowerCase()}${last.toLowerCase()}`,
        minLength: 6 // Avoid false positives
      },
      {
        name: 'first_last',
        regex: /^([a-z]+)_([a-z]+)@/i,
        generate: (first, last) => `${first.toLowerCase()}_${last.toLowerCase()}`
      },
      {
        name: 'flast',
        regex: /^([a-z])([a-z]+)@/i,
        generate: (first, last) => `${first[0].toLowerCase()}${last.toLowerCase()}`,
        validate: (email, first, last) => {
          const local = email.split('@')[0].toLowerCase();
          return local === `${first[0].toLowerCase()}${last.toLowerCase()}`;
        }
      },
      {
        name: 'firstl',
        regex: /^([a-z]+)([a-z])@/i,
        generate: (first, last) => `${first.toLowerCase()}${last[0].toLowerCase()}`,
        validate: (email, first, last) => {
          const local = email.split('@')[0].toLowerCase();
          return local === `${first.toLowerCase()}${last[0].toLowerCase()}`;
        }
      },
      {
        name: 'first',
        regex: /^([a-z]+)@/i,
        generate: (first, last) => first.toLowerCase(),
        minLength: 3
      },
      {
        name: 'last',
        regex: /^([a-z]+)@/i,
        generate: (first, last) => last.toLowerCase(),
        minLength: 3
      },
      {
        name: 'last.first',
        regex: /^([a-z]+)\.([a-z]+)@/i,
        generate: (first, last) => `${last.toLowerCase()}.${first.toLowerCase()}`
      },
      {
        name: 'f.last',
        regex: /^([a-z])\.([a-z]+)@/i,
        generate: (first, last) => `${first[0].toLowerCase()}.${last.toLowerCase()}`
      },
      {
        name: 'first.l',
        regex: /^([a-z]+)\.([a-z])@/i,
        generate: (first, last) => `${first.toLowerCase()}.${last[0].toLowerCase()}`
      }
    ];

    // Cache TTL: 24 hours for patterns
    this.cacheTTL = 86400;
  }

  /**
   * Generate candidate emails for a person
   * @param {string} firstName 
   * @param {string} lastName 
   * @param {string} company 
   * @returns {Array} - Array of { email, pattern, confidence }
   */
  async generateCandidates(firstName, lastName, company) {
    if (!firstName || !lastName || !company) {
      return [];
    }

    // Get domain for company
    const domainResult = await domainResolver.resolve(company);
    if (!domainResult.domain) {
      logger.info(`No domain found for company: ${company}`);
      return [];
    }

    const domain = domainResult.domain;
    logger.info(`Domain for ${company}: ${domain} (${domainResult.source})`);

    // Check for cached pattern
    const cacheKey = `email_pattern:${domain}`;
    const cachedPattern = await cache.get(cacheKey);
    
    let detectedPatterns = [];
    
    if (cachedPattern) {
      detectedPatterns = cachedPattern;
      logger.debug(`Pattern cache hit for ${domain}: ${detectedPatterns.map(p => p.name).join(', ')}`);
    } else {
      // Detect patterns from Salesforce
      detectedPatterns = await this.detectPatternsFromSF(domain);
      if (detectedPatterns.length > 0) {
        await cache.set(cacheKey, detectedPatterns, this.cacheTTL);
      }
    }

    // Generate candidates
    const candidates = [];
    const first = this.cleanName(firstName);
    const last = this.cleanName(lastName);

    // If we detected patterns, prioritize those
    if (detectedPatterns.length > 0) {
      for (const pattern of detectedPatterns) {
        const patternDef = this.patterns.find(p => p.name === pattern.name);
        if (patternDef) {
          const localPart = patternDef.generate(first, last);
          candidates.push({
            email: `${localPart}@${domain}`,
            pattern: pattern.name,
            confidence: pattern.confidence * domainResult.confidence,
            source: 'pattern_detected'
          });
        }
      }
    }

    // Also add common patterns as fallback (lower confidence)
    const commonPatterns = ['first.last', 'flast', 'firstlast', 'first_last'];
    for (const patternName of commonPatterns) {
      // Skip if already added from detection
      if (candidates.some(c => c.pattern === patternName)) continue;

      const patternDef = this.patterns.find(p => p.name === patternName);
      if (patternDef) {
        const localPart = patternDef.generate(first, last);
        candidates.push({
          email: `${localPart}@${domain}`,
          pattern: patternName,
          confidence: 0.3 * domainResult.confidence,
          source: 'common_pattern'
        });
      }
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    logger.info(`Generated ${candidates.length} email candidates for ${firstName} ${lastName} at ${company}`);
    return candidates;
  }

  /**
   * Detect email patterns from existing Salesforce contacts
   */
  async detectPatternsFromSF(domain) {
    try {
      const soql = `
        SELECT Email, FirstName, LastName 
        FROM Contact 
        WHERE Email LIKE '%@${domain}' 
        AND FirstName != null 
        AND LastName != null 
        LIMIT 20
      `;

      const result = await query(soql);
      
      if (!result.records || result.records.length < 2) {
        logger.debug(`Not enough contacts found for pattern detection at ${domain}`);
        return [];
      }

      // Analyze patterns
      const patternCounts = {};
      
      for (const contact of result.records) {
        const pattern = this.identifyPattern(
          contact.Email,
          contact.FirstName,
          contact.LastName
        );
        
        if (pattern) {
          patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
        }
      }

      // Convert to array with confidence scores
      const total = result.records.length;
      const detected = Object.entries(patternCounts)
        .map(([name, count]) => ({
          name,
          count,
          confidence: count / total
        }))
        .filter(p => p.count >= 2) // At least 2 examples
        .sort((a, b) => b.confidence - a.confidence);

      if (detected.length > 0) {
        logger.info(`Detected patterns at ${domain}:`, detected.map(p => `${p.name}(${p.count})`).join(', '));
      }

      return detected;

    } catch (error) {
      logger.debug(`Pattern detection failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Identify which pattern an email follows
   */
  identifyPattern(email, firstName, lastName) {
    if (!email || !firstName || !lastName) return null;

    const local = email.split('@')[0].toLowerCase();
    const first = this.cleanName(firstName).toLowerCase();
    const last = this.cleanName(lastName).toLowerCase();

    // Check each pattern
    if (local === `${first}.${last}`) return 'first.last';
    if (local === `${first}${last}`) return 'firstlast';
    if (local === `${first}_${last}`) return 'first_last';
    if (local === `${first[0]}${last}`) return 'flast';
    if (local === `${first}${last[0]}`) return 'firstl';
    if (local === first && first.length >= 3) return 'first';
    if (local === last && last.length >= 3) return 'last';
    if (local === `${last}.${first}`) return 'last.first';
    if (local === `${first[0]}.${last}`) return 'f.last';
    if (local === `${first}.${last[0]}`) return 'first.l';

    return null;
  }

  /**
   * Clean name for email generation
   */
  cleanName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z]/g, '') // Remove non-letters
      .trim();
  }

  /**
   * Get all possible email formats for a person (without domain)
   */
  getAllFormats(firstName, lastName) {
    const first = this.cleanName(firstName);
    const last = this.cleanName(lastName);
    
    return [
      { format: `${first}.${last}`, pattern: 'first.last' },
      { format: `${first}${last}`, pattern: 'firstlast' },
      { format: `${first}_${last}`, pattern: 'first_last' },
      { format: `${first[0]}${last}`, pattern: 'flast' },
      { format: `${first}${last[0]}`, pattern: 'firstl' },
      { format: `${last}.${first}`, pattern: 'last.first' },
      { format: `${first[0]}.${last}`, pattern: 'f.last' },
      { format: `${first}.${last[0]}`, pattern: 'first.l' },
      { format: first, pattern: 'first' },
      { format: last, pattern: 'last' }
    ];
  }
}

module.exports = new EmailPatternIntelligence();

