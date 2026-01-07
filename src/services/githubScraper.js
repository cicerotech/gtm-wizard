/**
 * GitHub Developer Intelligence
 * Extracts public email and profile information from GitHub
 * 
 * Strategies:
 * 1. GitHub API search (unauthenticated: 60 req/hr)
 * 2. Parse public profile for email
 * 3. Check commit history for author emails
 * 
 * Best for: Tech/developer contacts
 */

const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

class GitHubScraper {
  constructor() {
    // GitHub API (unauthenticated: 60 requests/hour)
    this.apiBaseUrl = 'https://api.github.com';
    this.token = process.env.GITHUB_TOKEN; // Optional, increases rate limit to 5000/hr
    
    // Rate limiting
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.maxRequestsPerHour = this.token ? 5000 : 60;
    
    // Cache TTL: 7 days
    this.cacheTTL = 604800;
    
    // User agent required by GitHub API
    this.userAgent = 'GTM-Brain-Bot/1.0';
  }

  /**
   * Find GitHub profile and extract public info
   * @param {string} firstName 
   * @param {string} lastName 
   * @param {string} company 
   * @returns {Object} - { found, username, email, profileUrl, bio, company, location }
   */
  async findDeveloper(firstName, lastName, company) {
    if (!firstName || !lastName) {
      return { found: false, error: 'Name required' };
    }

    const cacheKey = `github:${firstName.toLowerCase()}_${lastName.toLowerCase()}_${(company || '').toLowerCase()}`;
    
    // Check cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`GitHub cache hit: ${firstName} ${lastName}`);
      return cached;
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      return { found: false, error: 'Rate limit exceeded' };
    }

    try {
      // Step 1: Search for user
      const users = await this.searchUsers(firstName, lastName, company);
      
      if (users.length === 0) {
        const result = { found: false, error: 'No GitHub profile found' };
        await cache.set(cacheKey, result, 86400); // Cache failures for 1 day
        return result;
      }

      // Step 2: Get detailed info for best match
      const bestMatch = users[0];
      const profile = await this.getUserProfile(bestMatch.login);
      
      if (!profile) {
        return { found: false, error: 'Could not fetch profile' };
      }

      // Step 3: Try to get email from commits if not in profile
      let email = profile.email;
      if (!email && profile.public_repos > 0) {
        email = await this.getEmailFromCommits(bestMatch.login);
      }

      const result = {
        found: true,
        username: profile.login,
        email: email,
        profileUrl: profile.html_url,
        bio: profile.bio,
        company: profile.company,
        location: profile.location,
        blog: profile.blog,
        twitter: profile.twitter_username,
        publicRepos: profile.public_repos,
        followers: profile.followers,
        confidence: this.calculateConfidence(profile, firstName, lastName, company)
      };

      await cache.set(cacheKey, result, this.cacheTTL);
      
      if (email) {
        logger.info(`GitHub email found: ${email} for ${firstName} ${lastName}`);
      } else {
        logger.info(`GitHub profile found (no email): ${profile.html_url}`);
      }
      
      return result;

    } catch (error) {
      logger.warn(`GitHub scrape failed for ${firstName} ${lastName}: ${error.message}`);
      return { found: false, error: error.message };
    }
  }

  /**
   * Search for GitHub users
   */
  async searchUsers(firstName, lastName, company) {
    // Build search query
    let query = `${firstName} ${lastName} in:name`;
    
    if (company) {
      // Try with company in bio/company field
      query = `${firstName} ${lastName} in:name ${company} in:bio`;
    }

    try {
      const response = await this.apiRequest(`/search/users?q=${encodeURIComponent(query)}&per_page=5`);
      
      if (!response || !response.items) {
        return [];
      }

      // Filter and score results
      return response.items.map(user => ({
        login: user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        score: user.score
      }));

    } catch (error) {
      logger.debug(`GitHub user search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get detailed user profile
   */
  async getUserProfile(username) {
    try {
      return await this.apiRequest(`/users/${username}`);
    } catch (error) {
      logger.debug(`GitHub profile fetch failed for ${username}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract email from user's commits
   */
  async getEmailFromCommits(username) {
    try {
      // Get user's recent events (pushes contain commit data)
      const events = await this.apiRequest(`/users/${username}/events/public?per_page=30`);
      
      if (!events || !Array.isArray(events)) {
        return null;
      }

      // Look for push events with commits
      for (const event of events) {
        if (event.type === 'PushEvent' && event.payload?.commits) {
          for (const commit of event.payload.commits) {
            const email = commit.author?.email;
            if (email && this.isValidEmail(email)) {
              return email;
            }
          }
        }
      }

      // Alternative: Check repos and get commits directly
      const repos = await this.apiRequest(`/users/${username}/repos?sort=updated&per_page=5`);
      
      if (repos && Array.isArray(repos)) {
        for (const repo of repos) {
          if (repo.fork) continue; // Skip forks
          
          const commits = await this.apiRequest(
            `/repos/${username}/${repo.name}/commits?author=${username}&per_page=5`
          );
          
          if (commits && Array.isArray(commits)) {
            for (const commit of commits) {
              const email = commit.commit?.author?.email;
              if (email && this.isValidEmail(email)) {
                return email;
              }
            }
          }
        }
      }

      return null;

    } catch (error) {
      logger.debug(`Email extraction from commits failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if email is valid (not a GitHub noreply)
   */
  isValidEmail(email) {
    if (!email) return false;
    
    // Filter out GitHub noreply emails
    if (email.endsWith('@users.noreply.github.com')) return false;
    if (email.includes('noreply')) return false;
    
    // Basic email validation
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
  }

  /**
   * Make API request with rate limiting
   */
  async apiRequest(endpoint) {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    this.requestCount++;
    
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'application/vnd.github.v3+json'
    };
    
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      headers,
      timeout: 10000
    });

    if (response.status === 403) {
      // Rate limited
      const resetTime = response.headers.get('X-RateLimit-Reset');
      if (resetTime) {
        this.windowStart = parseInt(resetTime) * 1000;
        this.requestCount = this.maxRequestsPerHour;
      }
      throw new Error('GitHub API rate limit exceeded');
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check and manage rate limiting
   */
  checkRateLimit() {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    
    // Reset counter if window has passed
    if (now - this.windowStart > hourMs) {
      this.windowStart = now;
      this.requestCount = 0;
    }
    
    return this.requestCount < this.maxRequestsPerHour;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(profile, firstName, lastName, company) {
    let confidence = 0.5; // Base confidence for finding a profile

    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    // Check name match
    if (profile.name) {
      const profileName = profile.name.toLowerCase();
      if (profileName.includes(firstName.toLowerCase()) && profileName.includes(lastName.toLowerCase())) {
        confidence += 0.2;
      } else if (profileName.includes(lastName.toLowerCase())) {
        confidence += 0.1;
      }
    }

    // Check company match
    if (company && profile.company) {
      const searchCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const profileCompany = profile.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (profileCompany.includes(searchCompany) || searchCompany.includes(profileCompany)) {
        confidence += 0.2;
      }
    }

    // Presence of public email increases confidence
    if (profile.email) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if company is tech-related (good candidate for GitHub)
   */
  isTechCompany(company) {
    if (!company) return false;
    
    const techKeywords = [
      'software', 'tech', 'technology', 'engineering', 'developer',
      'labs', 'digital', 'cloud', 'ai', 'data', 'systems', 'solutions',
      'startup', 'fintech', 'biotech', 'healthtech', 'edtech',
      'microsoft', 'google', 'amazon', 'meta', 'apple', 'netflix',
      'github', 'gitlab', 'atlassian', 'salesforce', 'oracle', 'ibm'
    ];
    
    const lowerCompany = company.toLowerCase();
    return techKeywords.some(keyword => lowerCompany.includes(keyword));
  }

  /**
   * Get remaining rate limit
   */
  getRemainingRequests() {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    
    if (now - this.windowStart > hourMs) {
      return this.maxRequestsPerHour;
    }
    
    return Math.max(0, this.maxRequestsPerHour - this.requestCount);
  }
}

module.exports = new GitHubScraper();

