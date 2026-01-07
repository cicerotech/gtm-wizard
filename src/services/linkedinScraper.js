/**
 * LinkedIn Public Profile Scraper
 * Finds and extracts public LinkedIn profile information without authentication
 * 
 * Strategy:
 * 1. Google search for LinkedIn profile
 * 2. Extract profile URL from search results
 * 3. Fetch public profile HTML
 * 4. Parse title, location, company confirmation
 * 
 * Note: Email/phone are NOT available on public profiles
 */

const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

class LinkedInScraper {
  constructor() {
    // Cache TTL: 7 days for LinkedIn profiles
    this.cacheTTL = 604800;
    
    // User agent to avoid blocks
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 2000; // 2 seconds between requests
  }

  /**
   * Find LinkedIn profile for a person
   * @param {string} firstName 
   * @param {string} lastName 
   * @param {string} company 
   * @returns {Object} - { found, profileUrl, title, location, headline, confidence }
   */
  async findProfile(firstName, lastName, company) {
    if (!firstName || !lastName) {
      return { found: false, error: 'Name required' };
    }

    const cacheKey = `linkedin:${firstName.toLowerCase()}_${lastName.toLowerCase()}_${(company || '').toLowerCase()}`;
    
    // Check cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`LinkedIn cache hit: ${firstName} ${lastName}`);
      return cached;
    }

    try {
      // Step 1: Search for LinkedIn profile
      const profileUrl = await this.searchForProfile(firstName, lastName, company);
      
      if (!profileUrl) {
        const result = { found: false, error: 'No LinkedIn profile found' };
        await cache.set(cacheKey, result, 86400); // Cache failures for 1 day
        return result;
      }

      // Step 2: Fetch and parse public profile
      const profileData = await this.fetchPublicProfile(profileUrl);
      
      const result = {
        found: true,
        profileUrl,
        ...profileData,
        confidence: this.calculateConfidence(profileData, firstName, lastName, company)
      };

      await cache.set(cacheKey, result, this.cacheTTL);
      logger.info(`LinkedIn profile found: ${profileUrl}`);
      
      return result;

    } catch (error) {
      logger.warn(`LinkedIn scrape failed for ${firstName} ${lastName}: ${error.message}`);
      return { found: false, error: error.message };
    }
  }

  /**
   * Search Google for LinkedIn profile
   */
  async searchForProfile(firstName, lastName, company) {
    await this.rateLimit();

    try {
      // Build search query
      const query = company 
        ? `"${firstName}" "${lastName}" "${company}" site:linkedin.com/in`
        : `"${firstName}" "${lastName}" site:linkedin.com/in`;

      // Use a simple approach - try DuckDuckGo HTML search (more scrape-friendly)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html'
        },
        timeout: 10000
      });

      if (!response.ok) {
        logger.debug(`Search returned ${response.status}`);
        return null;
      }

      const html = await response.text();
      
      // Extract LinkedIn URLs from search results
      const linkedinUrls = this.extractLinkedInUrls(html);
      
      if (linkedinUrls.length === 0) {
        return null;
      }

      // Return the first (most relevant) profile
      return linkedinUrls[0];

    } catch (error) {
      logger.debug(`LinkedIn search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract LinkedIn profile URLs from HTML
   */
  extractLinkedInUrls(html) {
    const urls = [];
    
    // Match LinkedIn profile URLs
    const regex = /https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-]+\/?/g;
    const matches = html.match(regex) || [];
    
    // Deduplicate and clean
    const seen = new Set();
    for (const url of matches) {
      const clean = url.replace(/\/$/, '').toLowerCase();
      if (!seen.has(clean)) {
        seen.add(clean);
        urls.push(url.replace(/\/$/, ''));
      }
    }

    return urls;
  }

  /**
   * Fetch public LinkedIn profile data
   */
  async fetchPublicProfile(profileUrl) {
    await this.rateLimit();

    try {
      // LinkedIn public profiles have limited data without auth
      // We'll extract what we can from the URL and any public metadata
      
      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html'
        },
        redirect: 'follow',
        timeout: 10000
      });

      if (!response.ok) {
        logger.debug(`Profile fetch returned ${response.status}`);
        return { title: null, location: null, headline: null };
      }

      const html = await response.text();
      
      return {
        title: this.extractTitle(html),
        location: this.extractLocation(html),
        headline: this.extractHeadline(html),
        company: this.extractCompany(html)
      };

    } catch (error) {
      logger.debug(`Profile fetch failed: ${error.message}`);
      return { title: null, location: null, headline: null };
    }
  }

  /**
   * Extract job title from profile HTML
   */
  extractTitle(html) {
    // Look for common patterns in LinkedIn HTML
    const patterns = [
      /<title[^>]*>([^|<]+)/i,
      /data-section="headline"[^>]*>([^<]+)/i,
      /"headline":"([^"]+)"/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const title = match[1].trim();
        // Filter out generic LinkedIn titles
        if (!title.includes('LinkedIn') && title.length < 200) {
          return title;
        }
      }
    }

    return null;
  }

  /**
   * Extract location from profile HTML
   */
  extractLocation(html) {
    const patterns = [
      /"locationName":"([^"]+)"/i,
      /data-section="location"[^>]*>([^<]+)/i,
      /"location":\s*"([^"]+)"/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract headline from profile HTML
   */
  extractHeadline(html) {
    const patterns = [
      /"headline":"([^"]+)"/i,
      /class="top-card-layout__headline[^"]*"[^>]*>([^<]+)/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract company from profile HTML
   */
  extractCompany(html) {
    const patterns = [
      /"companyName":"([^"]+)"/i,
      /data-section="current-company"[^>]*>([^<]+)/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Calculate confidence score for profile match
   */
  calculateConfidence(profileData, firstName, lastName, company) {
    let confidence = 0.5; // Base confidence for finding a profile

    // Check if headline/title contains the name
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    if (profileData.headline) {
      const headline = profileData.headline.toLowerCase();
      if (headline.includes(firstName.toLowerCase()) || headline.includes(lastName.toLowerCase())) {
        confidence += 0.1;
      }
    }

    // Check if company matches
    if (company && profileData.company) {
      const searchCompany = company.toLowerCase();
      const profileCompany = profileData.company.toLowerCase();
      
      if (profileCompany.includes(searchCompany) || searchCompany.includes(profileCompany)) {
        confidence += 0.3;
      }
    }

    // Having a title/headline increases confidence
    if (profileData.title || profileData.headline) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Rate limiting
   */
  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    
    this.lastRequestTime = Date.now();
  }
}

module.exports = new LinkedInScraper();

