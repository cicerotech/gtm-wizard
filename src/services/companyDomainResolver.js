/**
 * Company Domain Resolver
 * Converts company names to email domains using multiple strategies
 * 
 * Strategies:
 * 1. Known domain mappings (government, military, major companies)
 * 2. Salesforce lookup (domains from existing contacts)
 * 3. Clearbit Logo API (free, validates domain exists)
 * 4. Common pattern inference
 */

const logger = require('../utils/logger');
const { query } = require('../salesforce/connection');
const { cache } = require('../utils/cache');

class CompanyDomainResolver {
  constructor() {
    // Known domain mappings for common organizations
    this.knownDomains = {
      // US Government & Military
      'u.s. air force': 'af.mil',
      'us air force': 'af.mil',
      'air force': 'af.mil',
      'u.s. army': 'army.mil',
      'us army': 'army.mil',
      'army': 'army.mil',
      'u.s. navy': 'navy.mil',
      'us navy': 'navy.mil',
      'navy': 'navy.mil',
      'u.s. marine corps': 'usmc.mil',
      'marines': 'usmc.mil',
      'department of defense': 'dod.mil',
      'dod': 'dod.mil',
      'pentagon': 'dod.mil',
      'nasa': 'nasa.gov',
      'fbi': 'fbi.gov',
      'cia': 'cia.gov',
      'irs': 'irs.gov',
      'fda': 'fda.gov',
      'epa': 'epa.gov',
      'sec': 'sec.gov',
      
      // Major Tech Companies
      'microsoft': 'microsoft.com',
      'microsoft corporation': 'microsoft.com',
      'google': 'google.com',
      'alphabet': 'google.com',
      'amazon': 'amazon.com',
      'amazon web services': 'amazon.com',
      'aws': 'amazon.com',
      'apple': 'apple.com',
      'meta': 'meta.com',
      'facebook': 'fb.com',
      'netflix': 'netflix.com',
      'salesforce': 'salesforce.com',
      'oracle': 'oracle.com',
      'ibm': 'ibm.com',
      'intel': 'intel.com',
      'cisco': 'cisco.com',
      'adobe': 'adobe.com',
      'nvidia': 'nvidia.com',
      'tesla': 'tesla.com',
      'uber': 'uber.com',
      'airbnb': 'airbnb.com',
      'spotify': 'spotify.com',
      'twitter': 'twitter.com',
      'x corp': 'x.com',
      'linkedin': 'linkedin.com',
      'paypal': 'paypal.com',
      'stripe': 'stripe.com',
      'square': 'squareup.com',
      'shopify': 'shopify.com',
      'zoom': 'zoom.us',
      'slack': 'slack.com',
      'atlassian': 'atlassian.com',
      'github': 'github.com',
      'gitlab': 'gitlab.com',
      'dropbox': 'dropbox.com',
      'snowflake': 'snowflake.com',
      'datadog': 'datadoghq.com',
      'splunk': 'splunk.com',
      'servicenow': 'servicenow.com',
      'workday': 'workday.com',
      'twilio': 'twilio.com',
      'okta': 'okta.com',
      'crowdstrike': 'crowdstrike.com',
      'palo alto networks': 'paloaltonetworks.com',
      
      // Finance
      'goldman sachs': 'gs.com',
      'morgan stanley': 'morganstanley.com',
      'jp morgan': 'jpmorgan.com',
      'jpmorgan chase': 'jpmchase.com',
      'bank of america': 'bankofamerica.com',
      'wells fargo': 'wellsfargo.com',
      'citigroup': 'citi.com',
      'citi': 'citi.com',
      'blackrock': 'blackrock.com',
      'fidelity': 'fidelity.com',
      'charles schwab': 'schwab.com',
      'american express': 'aexp.com',
      'amex': 'aexp.com',
      'visa': 'visa.com',
      'mastercard': 'mastercard.com',
      
      // Consulting
      'mckinsey': 'mckinsey.com',
      'bcg': 'bcg.com',
      'boston consulting group': 'bcg.com',
      'bain': 'bain.com',
      'deloitte': 'deloitte.com',
      'pwc': 'pwc.com',
      'pricewaterhousecoopers': 'pwc.com',
      'ey': 'ey.com',
      'ernst & young': 'ey.com',
      'kpmg': 'kpmg.com',
      'accenture': 'accenture.com',
      
      // Healthcare/Pharma
      'pfizer': 'pfizer.com',
      'johnson & johnson': 'jnj.com',
      'j&j': 'jnj.com',
      'merck': 'merck.com',
      'unitedhealth': 'uhg.com',
      'cvs': 'cvs.com',
      'walgreens': 'walgreens.com',
      'anthem': 'anthem.com',
      'cigna': 'cigna.com',
      'aetna': 'aetna.com',
      
      // Retail
      'walmart': 'walmart.com',
      'target': 'target.com',
      'costco': 'costco.com',
      'home depot': 'homedepot.com',
      'lowes': 'lowes.com',
      'best buy': 'bestbuy.com',
      'starbucks': 'starbucks.com',
      'mcdonalds': 'mcdonalds.com',
      'nike': 'nike.com',
      
      // Telecom
      'at&t': 'att.com',
      'verizon': 'verizon.com',
      't-mobile': 't-mobile.com',
      'comcast': 'comcast.com',
      
      // Auto
      'ford': 'ford.com',
      'gm': 'gm.com',
      'general motors': 'gm.com',
      'toyota': 'toyota.com',
      'honda': 'honda.com',
      'bmw': 'bmw.com'
    };

    // Suffixes to strip from company names
    this.suffixesToStrip = [
      ', inc.',
      ', inc',
      ' inc.',
      ' inc',
      ', llc',
      ' llc',
      ', ltd',
      ' ltd',
      ', corp.',
      ', corp',
      ' corp.',
      ' corp',
      ' corporation',
      ', corporation',
      ' company',
      ', company',
      ' co.',
      ', co.',
      ' co',
      ', co',
      ' limited',
      ', limited',
      ' plc',
      ', plc',
      ' group',
      ' holdings',
      ' international',
      ' intl',
      ', intl'
    ];

    // Cache TTL: 24 hours
    this.cacheTTL = 86400;
  }

  /**
   * Resolve company name to email domain
   * @param {string} companyName - Company name
   * @returns {Object} - { domain, source, confidence }
   */
  async resolve(companyName) {
    if (!companyName) {
      return { domain: null, source: null, confidence: 0 };
    }

    const normalizedName = this.normalizeCompanyName(companyName);
    const cacheKey = `domain:${normalizedName}`;

    // Check cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Domain cache hit: ${companyName} -> ${cached.domain}`);
      return cached;
    }

    let result = null;

    // Strategy 1: Known domain mappings
    result = this.checkKnownDomains(normalizedName);
    if (result) {
      await cache.set(cacheKey, result, this.cacheTTL);
      return result;
    }

    // Strategy 2: Salesforce lookup
    result = await this.lookupFromSalesforce(companyName);
    if (result) {
      await cache.set(cacheKey, result, this.cacheTTL);
      return result;
    }

    // Strategy 3: Infer from company name
    result = this.inferDomain(normalizedName);
    if (result) {
      // Validate domain exists using DNS
      const validated = await this.validateDomain(result.domain);
      if (validated) {
        result.confidence = 0.7;
        await cache.set(cacheKey, result, this.cacheTTL);
        return result;
      }
    }

    // No domain found
    return { domain: null, source: 'not_found', confidence: 0 };
  }

  /**
   * Normalize company name for lookup
   */
  normalizeCompanyName(name) {
    let normalized = name.toLowerCase().trim();
    
    // Strip common suffixes
    for (const suffix of this.suffixesToStrip) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length).trim();
      }
    }
    
    // Handle "The" prefix
    if (normalized.startsWith('the ')) {
      normalized = normalized.slice(4);
    }
    
    return normalized;
  }

  /**
   * Check known domain mappings
   */
  checkKnownDomains(normalizedName) {
    // Direct match
    if (this.knownDomains[normalizedName]) {
      return {
        domain: this.knownDomains[normalizedName],
        source: 'known_mapping',
        confidence: 1.0
      };
    }

    // Partial match (company name contains known key)
    for (const [key, domain] of Object.entries(this.knownDomains)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return {
          domain,
          source: 'known_mapping',
          confidence: 0.9
        };
      }
    }

    return null;
  }

  /**
   * Lookup domain from existing Salesforce contacts
   */
  async lookupFromSalesforce(companyName) {
    try {
      // Escape for SOQL
      const escaped = companyName.replace(/'/g, "\\'").replace(/&/g, '%');
      
      const soql = `
        SELECT Email FROM Contact 
        WHERE Account.Name LIKE '%${escaped}%' 
        AND Email != null 
        LIMIT 5
      `;
      
      const result = await query(soql);
      
      if (result.records && result.records.length > 0) {
        // Extract domains from emails
        const domains = result.records
          .map(r => r.Email.split('@')[1])
          .filter(Boolean);
        
        if (domains.length > 0) {
          // Return most common domain
          const domainCounts = {};
          for (const d of domains) {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
          }
          
          const topDomain = Object.entries(domainCounts)
            .sort((a, b) => b[1] - a[1])[0][0];
          
          logger.info(`Domain from SF: ${companyName} -> ${topDomain}`);
          
          return {
            domain: topDomain,
            source: 'salesforce',
            confidence: 0.95
          };
        }
      }
    } catch (error) {
      logger.debug(`SF domain lookup failed for ${companyName}:`, error.message);
    }
    
    return null;
  }

  /**
   * Infer domain from company name
   */
  inferDomain(normalizedName) {
    // Remove spaces and special characters
    let domain = normalizedName
      .replace(/[^a-z0-9]/g, '')
      .trim();
    
    if (!domain || domain.length < 2) {
      return null;
    }

    // Common TLD
    domain = `${domain}.com`;
    
    return {
      domain,
      source: 'inferred',
      confidence: 0.5
    };
  }

  /**
   * Validate domain exists using DNS MX lookup
   */
  async validateDomain(domain) {
    try {
      const dns = require('dns').promises;
      
      // Check if domain has MX records (can receive email)
      const mxRecords = await dns.resolveMx(domain);
      
      if (mxRecords && mxRecords.length > 0) {
        logger.debug(`Domain validated: ${domain} has ${mxRecords.length} MX records`);
        return true;
      }
    } catch (error) {
      // Try A record fallback
      try {
        const dns = require('dns').promises;
        const aRecords = await dns.resolve4(domain);
        if (aRecords && aRecords.length > 0) {
          return true;
        }
      } catch (e) {
        // Domain doesn't exist
      }
    }
    
    return false;
  }

  /**
   * Get domain for common email providers (to filter out personal emails)
   */
  isPersonalEmailDomain(domain) {
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'me.com', 'mac.com',
      'live.com', 'msn.com', 'comcast.net', 'verizon.net',
      'att.net', 'sbcglobal.net', 'protonmail.com', 'pm.me'
    ];
    
    return personalDomains.includes(domain.toLowerCase());
  }
}

module.exports = new CompanyDomainResolver();

