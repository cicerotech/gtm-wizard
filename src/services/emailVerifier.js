/**
 * Email Verifier Service
 * Validates email deliverability using multiple methods:
 * 
 * 1. Syntax validation
 * 2. Domain MX record check (free, no API)
 * 3. Hunter.io email verification (25/month free)
 * 4. Abstract API validation (100/month free)
 */

const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const dns = require('dns').promises;

class EmailVerifier {
  constructor() {
    // Hunter.io API (25 verifications/month free)
    this.hunterApiKey = process.env.HUNTER_API_KEY;
    this.hunterBaseUrl = 'https://api.hunter.io/v2';
    
    // Abstract API (100/month free)
    this.abstractApiKey = process.env.ABSTRACT_API_KEY;
    this.abstractBaseUrl = 'https://emailvalidation.abstractapi.com/v1';

    // Rate limit tracking
    this.hunterUsedThisMonth = 0;
    this.abstractUsedThisMonth = 0;
    this.monthlyResetDay = new Date().getDate();

    // Cache TTL: 7 days for verified emails
    this.cacheTTL = 604800;
  }

  /**
   * Verify email with multiple strategies
   * @param {string} email 
   * @returns {Object} - { valid, confidence, method, details }
   */
  async verify(email) {
    if (!email) {
      return { valid: false, confidence: 0, method: 'none', details: 'No email provided' };
    }

    // Check cache
    const cacheKey = `email_verify:${email.toLowerCase()}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Email verification cache hit: ${email}`);
      return cached;
    }

    let result = null;

    // Step 1: Syntax validation
    if (!this.isValidSyntax(email)) {
      result = { valid: false, confidence: 1.0, method: 'syntax', details: 'Invalid email syntax' };
      await cache.set(cacheKey, result, this.cacheTTL);
      return result;
    }

    // Step 2: Domain MX check (free)
    const domain = email.split('@')[1];
    const hasMX = await this.checkMXRecord(domain);
    if (!hasMX) {
      result = { valid: false, confidence: 0.95, method: 'mx_check', details: 'Domain has no mail server' };
      await cache.set(cacheKey, result, this.cacheTTL);
      return result;
    }

    // Step 3: Try Hunter.io if available and under limit
    if (this.hunterApiKey && this.hunterUsedThisMonth < 25) {
      result = await this.verifyWithHunter(email);
      if (result) {
        await cache.set(cacheKey, result, this.cacheTTL);
        return result;
      }
    }

    // Step 4: Try Abstract API if available and under limit
    if (this.abstractApiKey && this.abstractUsedThisMonth < 100) {
      result = await this.verifyWithAbstract(email);
      if (result) {
        await cache.set(cacheKey, result, this.cacheTTL);
        return result;
      }
    }

    // Fallback: MX check passed, assume likely valid
    result = {
      valid: true,
      confidence: 0.6,
      method: 'mx_check',
      details: 'Domain accepts mail (unverified mailbox)'
    };
    await cache.set(cacheKey, result, this.cacheTTL);
    return result;
  }

  /**
   * Validate email syntax
   */
  isValidSyntax(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
  }

  /**
   * Check if domain has MX records
   */
  async checkMXRecord(domain) {
    try {
      const mxRecords = await dns.resolveMx(domain);
      return mxRecords && mxRecords.length > 0;
    } catch (error) {
      logger.debug(`MX lookup failed for ${domain}: ${error.code}`);
      return false;
    }
  }

  /**
   * Get MX records for domain
   */
  async getMXRecords(domain) {
    try {
      const records = await dns.resolveMx(domain);
      return records.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      return [];
    }
  }

  /**
   * Verify with Hunter.io API
   */
  async verifyWithHunter(email) {
    try {
      const response = await fetch(
        `${this.hunterBaseUrl}/email-verifier?email=${encodeURIComponent(email)}&api_key=${this.hunterApiKey}`,
        { method: 'GET', timeout: 10000 }
      );

      this.hunterUsedThisMonth++;

      if (!response.ok) {
        logger.warn(`Hunter.io API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const result = data.data;

      if (!result) return null;

      // Map Hunter.io status to our format
      const statusMap = {
        'valid': { valid: true, confidence: 0.95 },
        'invalid': { valid: false, confidence: 0.95 },
        'accept_all': { valid: true, confidence: 0.7 },
        'unknown': { valid: true, confidence: 0.5 },
        'webmail': { valid: true, confidence: 0.9 },
        'disposable': { valid: false, confidence: 0.95 }
      };

      const status = statusMap[result.status] || { valid: true, confidence: 0.5 };

      return {
        valid: status.valid,
        confidence: status.confidence,
        method: 'hunter.io',
        details: `Status: ${result.status}, Score: ${result.score || 'N/A'}`,
        hunterData: {
          status: result.status,
          score: result.score,
          regexp: result.regexp,
          gibberish: result.gibberish,
          disposable: result.disposable,
          webmail: result.webmail,
          mx_records: result.mx_records,
          smtp_server: result.smtp_server,
          smtp_check: result.smtp_check
        }
      };

    } catch (error) {
      logger.warn(`Hunter.io verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify with Abstract API
   */
  async verifyWithAbstract(email) {
    try {
      const response = await fetch(
        `${this.abstractBaseUrl}/?api_key=${this.abstractApiKey}&email=${encodeURIComponent(email)}`,
        { method: 'GET', timeout: 10000 }
      );

      this.abstractUsedThisMonth++;

      if (!response.ok) {
        logger.warn(`Abstract API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Map Abstract deliverability to our format
      const deliverabilityMap = {
        'DELIVERABLE': { valid: true, confidence: 0.95 },
        'UNDELIVERABLE': { valid: false, confidence: 0.95 },
        'RISKY': { valid: true, confidence: 0.6 },
        'UNKNOWN': { valid: true, confidence: 0.5 }
      };

      const status = deliverabilityMap[data.deliverability] || { valid: true, confidence: 0.5 };

      return {
        valid: status.valid,
        confidence: status.confidence,
        method: 'abstract_api',
        details: `Deliverability: ${data.deliverability}, Quality: ${data.quality_score}`,
        abstractData: {
          deliverability: data.deliverability,
          quality_score: data.quality_score,
          is_valid_format: data.is_valid_format?.value,
          is_disposable_email: data.is_disposable_email?.value,
          is_free_email: data.is_free_email?.value,
          is_role_email: data.is_role_email?.value,
          is_catchall_email: data.is_catchall_email?.value,
          is_mx_found: data.is_mx_found?.value,
          is_smtp_valid: data.is_smtp_valid?.value
        }
      };

    } catch (error) {
      logger.warn(`Abstract API verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify multiple emails and return best candidates
   * @param {Array} emails - Array of { email, pattern, confidence }
   * @returns {Array} - Verified emails sorted by overall confidence
   */
  async verifyBatch(emails) {
    const results = [];

    for (const candidate of emails) {
      const verification = await this.verify(candidate.email);
      
      // Combine candidate confidence with verification confidence
      const overallConfidence = candidate.confidence * verification.confidence;
      
      results.push({
        email: candidate.email,
        pattern: candidate.pattern,
        patternConfidence: candidate.confidence,
        valid: verification.valid,
        verificationConfidence: verification.confidence,
        overallConfidence,
        method: verification.method,
        details: verification.details
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Sort by overall confidence and validity
    return results
      .sort((a, b) => {
        if (a.valid !== b.valid) return b.valid ? 1 : -1;
        return b.overallConfidence - a.overallConfidence;
      });
  }

  /**
   * Get remaining API credits
   */
  getRemainingCredits() {
    return {
      hunter: this.hunterApiKey ? Math.max(0, 25 - this.hunterUsedThisMonth) : 0,
      abstract: this.abstractApiKey ? Math.max(0, 100 - this.abstractUsedThisMonth) : 0
    };
  }

  /**
   * Check if we're in free tier
   */
  isConfigured() {
    return !!(this.hunterApiKey || this.abstractApiKey);
  }
}

module.exports = new EmailVerifier();

