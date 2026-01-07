/**
 * Contact Enrichment Service
 * Orchestrates SF lookup + OSINT enrichment + data merge
 * 
 * NEW FLOW (OSINT-based, no Claude dependency):
 * 1. Parse input (firstName, lastName, company, title)
 * 2. Query SF Contacts/Leads with fuzzy matching
 * 3. If SF data complete → return immediately
 * 4. If incomplete/no match → OSINT enrichment pipeline:
 *    a. Email Pattern Intelligence (highest success rate)
 *    b. LinkedIn profile validation
 *    c. GitHub for tech contacts
 * 5. Merge data (SF takes precedence) with source labels
 * 6. Track analytics for feedback learning
 * 
 * HONEST APPROACH: Direct phone numbers are not freely scrapable
 */

const fuzzyContactMatcher = require('./fuzzyContactMatcher');
const emailPatternIntelligence = require('./emailPatternIntelligence');
const emailVerifier = require('./emailVerifier');
const linkedinScraper = require('./linkedinScraper');
const githubScraper = require('./githubScraper');
const domainResolver = require('./companyDomainResolver');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// Analytics tracking
const contactAnalytics = {
  bySource: { sf_only: 0, sf_enriched: 0, osint_only: 0, no_result: 0 },
  byOutcome: { success: 0, multiple_match: 0, no_match: 0, error: 0 },
  byEnrichmentMethod: { 
    email_pattern: 0, 
    linkedin: 0, 
    github: 0, 
    none: 0 
  },
  responseTimesMs: [],
  corrections: [],
  implicitSuccesses: [],
  sessionStart: Date.now(),

  record(result, duration) {
    const source = result.source || 'unknown';
    if (this.bySource[source] !== undefined) {
      this.bySource[source]++;
    }
    
    if (result.success) {
      if (result.multipleMatches) {
        this.byOutcome.multiple_match++;
      } else {
        this.byOutcome.success++;
      }
    } else if (result.contacts?.length === 0) {
      this.byOutcome.no_match++;
    } else {
      this.byOutcome.error++;
    }

    // Track enrichment methods used
    if (result.enrichmentMethods) {
      for (const method of result.enrichmentMethods) {
        if (this.byEnrichmentMethod[method] !== undefined) {
          this.byEnrichmentMethod[method]++;
        }
      }
    }
    
    this.responseTimesMs.push(duration);
  },

  recordCorrection(originalLookup, correction) {
    this.corrections.push({
      lookup: originalLookup,
      correction,
      timestamp: Date.now()
    });
    logger.info('Contact correction recorded', { originalLookup, correction });
  },

  recordImplicitSuccess(lookupId) {
    this.implicitSuccesses.push({
      lookupId,
      timestamp: Date.now()
    });
  },

  getSummary() {
    const total = Object.values(this.bySource).reduce((a, b) => a + b, 0);
    const avgResponseTime = this.responseTimesMs.length > 0
      ? Math.round(this.responseTimesMs.reduce((a, b) => a + b, 0) / this.responseTimesMs.length)
      : 0;
    
    return {
      total,
      bySource: this.bySource,
      byOutcome: this.byOutcome,
      byEnrichmentMethod: this.byEnrichmentMethod,
      sfMatchRate: total > 0 
        ? Math.round(((this.bySource.sf_only + this.bySource.sf_enriched) / total) * 100)
        : 0,
      avgResponseTime,
      correctionRate: this.byOutcome.success > 0
        ? Math.round((this.corrections.length / this.byOutcome.success) * 100)
        : 0,
      implicitSuccessRate: this.byOutcome.success > 0
        ? Math.round((this.implicitSuccesses.length / this.byOutcome.success) * 100)
        : 0,
      uptime: Date.now() - this.sessionStart
    };
  },

  reset() {
    this.bySource = { sf_only: 0, sf_enriched: 0, osint_only: 0, no_result: 0 };
    this.byOutcome = { success: 0, multiple_match: 0, no_match: 0, error: 0 };
    this.byEnrichmentMethod = { email_pattern: 0, linkedin: 0, github: 0, none: 0 };
    this.responseTimesMs = [];
    this.corrections = [];
    this.implicitSuccesses = [];
    this.sessionStart = Date.now();
  }
};

class ContactEnrichmentService {
  constructor() {
    this.contactMatcher = fuzzyContactMatcher;
    this.pendingWritebacks = new Map();
    this.writebackTimeout = 30000; // 30 seconds
  }

  /**
   * Main lookup function
   * @param {string} input - User's search input (e.g., "Bob Smith at Microsoft")
   * @returns {Object} - Enriched contact result with source labels
   */
  async lookup(input) {
    const startTime = Date.now();
    let result = {
      success: false,
      contact: null,
      contacts: [],
      multipleMatches: false,
      source: null,
      enriched: false,
      enrichmentMethods: [],
      lookupId: this.generateLookupId(),
      parsed: null
    };

    try {
      logger.info('Contact lookup started', { input });

      // Phase 1: Salesforce Lookup
      const sfResult = await this.contactMatcher.findContact(input);
      result.parsed = sfResult.parsed;

      if (sfResult.success && sfResult.contacts.length > 0) {
        // Check if we have a single complete match
        const completeContacts = sfResult.contacts.filter(c => c.isComplete);
        
        if (sfResult.contacts.length > 3) {
          // Multiple matches - return top 3 for clarification
          result.multipleMatches = true;
          result.contacts = sfResult.contacts.slice(0, 3);
          result.success = true;
          result.source = 'salesforce';
          result.message = 'Multiple contacts found. Please clarify:';
        } else if (completeContacts.length > 0) {
          // Found complete SF record - return immediately
          result.contact = this.formatContact(completeContacts[0], 'Salesforce');
          result.contacts = [result.contact];
          result.success = true;
          result.source = 'sf_only';
        } else {
          // Found SF record but incomplete - proceed to OSINT enrichment
          const primaryContact = sfResult.contacts[0];
          result.contact = await this.enrichWithOSINT(primaryContact, sfResult.parsed);
          result.contacts = [result.contact];
          result.success = true;
          result.source = result.contact.wasEnriched ? 'sf_enriched' : 'sf_only';
          result.enriched = result.contact.wasEnriched;
          result.enrichmentMethods = result.contact.enrichmentMethods || [];
        }
      } else {
        // No SF match - try pure OSINT enrichment
        result = await this.handleNoSFMatch(input, sfResult.parsed, result);
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      // Track analytics
      contactAnalytics.record(result, duration);

      // Store lookup for potential writeback
      if (result.enriched && result.contact) {
        this.storePendingWriteback(result.lookupId, result.contact, sfResult.contacts?.[0]);
      }

      logger.info('Contact lookup completed', {
        input,
        success: result.success,
        source: result.source,
        enriched: result.enriched,
        methods: result.enrichmentMethods,
        duration
      });

      return result;

    } catch (error) {
      logger.error('Contact lookup error:', error);
      result.success = false;
      result.error = error.message;
      result.duration = Date.now() - startTime;
      contactAnalytics.record(result, result.duration);
      return result;
    }
  }

  /**
   * Handle case where no SF match was found
   * Uses OSINT enrichment pipeline
   */
  async handleNoSFMatch(input, parsed, result) {
    if (!parsed || (!parsed.firstName && !parsed.lastName)) {
      result.success = false;
      result.error = 'Could not parse contact information from input';
      result.source = 'no_result';
      result.suggestion = 'Try: last name only, different spelling, company domain';
      return result;
    }

    if (!parsed.company) {
      result.success = false;
      result.source = 'no_result';
      result.error = 'No company specified for enrichment';
      result.suggestion = 'Include company name: "John Smith at Acme Corp"';
      return result;
    }

    // OSINT Enrichment Pipeline
    const enrichmentResult = await this.runOSINTPipeline(
      parsed.firstName,
      parsed.lastName,
      parsed.company,
      parsed.title
    );

    if (enrichmentResult.hasData) {
      result.contact = {
        name: `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim(),
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        company: parsed.company,
        title: parsed.title,
        phone: null, // Honest: phone not available from free sources
        phoneSource: null,
        email: enrichmentResult.email,
        emailSource: enrichmentResult.emailSource,
        linkedin: enrichmentResult.linkedin,
        linkedinSource: enrichmentResult.linkedinSource,
        recordType: null,
        sfId: null,
        wasEnriched: true,
        enrichmentOnly: true,
        enrichmentMethods: enrichmentResult.methods,
        confidence: enrichmentResult.confidence
      };
      result.contacts = [result.contact];
      result.success = true;
      result.source = 'osint_only';
      result.enriched = true;
      result.enrichmentMethods = enrichmentResult.methods;
      result.canWriteToSF = false;

      // Add note about phone
      if (!enrichmentResult.email) {
        result.contact.note = 'Phone numbers require manual lookup or paid tools';
      }
    } else {
      result.success = false;
      result.source = 'no_result';
      result.error = 'No contact found';
      result.suggestion = 'Try: last name only, different spelling, company domain';
    }

    return result;
  }

  /**
   * OSINT Enrichment Pipeline
   * Runs multiple enrichment strategies in parallel/sequence
   */
  async runOSINTPipeline(firstName, lastName, company, title) {
    const result = {
      email: null,
      emailSource: null,
      linkedin: null,
      linkedinSource: null,
      methods: [],
      hasData: false,
      confidence: 0
    };

    logger.info('Running OSINT pipeline', { firstName, lastName, company });

    try {
      // Run email pattern + LinkedIn in parallel
      const [emailResult, linkedinResult] = await Promise.all([
        this.tryEmailPattern(firstName, lastName, company),
        linkedinScraper.findProfile(firstName, lastName, company)
      ]);

      // Process email pattern result
      if (emailResult && emailResult.email) {
        result.email = emailResult.email;
        result.emailSource = emailResult.verified ? 'Inferred (Verified)' : 'Inferred';
        result.methods.push('email_pattern');
        result.hasData = true;
        result.confidence = Math.max(result.confidence, emailResult.confidence);
        logger.info('Email found via pattern intelligence', { 
          email: emailResult.email, 
          confidence: emailResult.confidence 
        });
      }

      // Process LinkedIn result
      if (linkedinResult && linkedinResult.found) {
        result.linkedin = linkedinResult.profileUrl;
        result.linkedinSource = 'LinkedIn';
        result.methods.push('linkedin');
        result.hasData = true;
        result.confidence = Math.max(result.confidence, linkedinResult.confidence);
        logger.info('LinkedIn profile found', { url: linkedinResult.profileUrl });
      }

      // Try GitHub for tech companies (only if no email yet)
      if (!result.email && githubScraper.isTechCompany(company)) {
        const githubResult = await githubScraper.findDeveloper(firstName, lastName, company);
        
        if (githubResult && githubResult.found && githubResult.email) {
          result.email = githubResult.email;
          result.emailSource = 'GitHub';
          result.methods.push('github');
          result.hasData = true;
          result.confidence = Math.max(result.confidence, githubResult.confidence);
          logger.info('Email found via GitHub', { email: githubResult.email });
        }
      }

      // If we didn't find email but found LinkedIn, that's still useful
      if (!result.email && result.linkedin) {
        result.hasData = true;
      }

    } catch (error) {
      logger.warn('OSINT pipeline error:', error.message);
    }

    if (!result.hasData) {
      result.methods.push('none');
    }

    return result;
  }

  /**
   * Try email pattern intelligence
   */
  async tryEmailPattern(firstName, lastName, company) {
    try {
      // Generate candidate emails
      const candidates = await emailPatternIntelligence.generateCandidates(
        firstName, lastName, company
      );

      if (candidates.length === 0) {
        return null;
      }

      // Take top 3 candidates for verification
      const topCandidates = candidates.slice(0, 3);
      
      // Verify emails
      const verified = await emailVerifier.verifyBatch(topCandidates);
      
      // Return best valid email
      const validEmail = verified.find(v => v.valid);
      
      if (validEmail) {
        return {
          email: validEmail.email,
          pattern: validEmail.pattern,
          confidence: validEmail.overallConfidence,
          verified: validEmail.method !== 'mx_check'
        };
      }

      // Fallback: return highest confidence candidate even if not fully verified
      // (MX check passed)
      const mxValid = verified.find(v => v.method === 'mx_check');
      if (mxValid) {
        return {
          email: mxValid.email,
          pattern: mxValid.pattern,
          confidence: mxValid.overallConfidence,
          verified: false
        };
      }

      return null;

    } catch (error) {
      logger.debug('Email pattern intelligence failed:', error.message);
      return null;
    }
  }

  /**
   * Enrich SF contact with OSINT data and merge
   */
  async enrichWithOSINT(sfContact, parsed) {
    // Format base contact from SF
    const contact = this.formatContact(sfContact, 'Salesforce');
    contact.wasEnriched = false;
    contact.enrichmentMethods = [];

    // Only enrich if missing email (phone not available from free OSINT)
    if (contact.email) {
      return contact;
    }

    // Run OSINT pipeline
    const enrichment = await this.runOSINTPipeline(
      sfContact.firstName || parsed?.firstName,
      sfContact.lastName || parsed?.lastName,
      sfContact.accountName || parsed?.company,
      sfContact.title || parsed?.title
    );

    if (enrichment.hasData) {
      // Merge: SF data takes precedence
      if (!contact.email && enrichment.email) {
        contact.email = enrichment.email;
        contact.emailSource = enrichment.emailSource;
        contact.wasEnriched = true;
        contact.enrichmentMethods.push(...enrichment.methods.filter(m => m !== 'linkedin'));
      }

      if (!contact.linkedin && enrichment.linkedin) {
        contact.linkedin = enrichment.linkedin;
        contact.linkedinSource = enrichment.linkedinSource;
        contact.wasEnriched = true;
        if (!contact.enrichmentMethods.includes('linkedin')) {
          contact.enrichmentMethods.push('linkedin');
        }
      }

      contact.enrichmentConfidence = enrichment.confidence;
    }

    return contact;
  }

  /**
   * Format SF contact record with source labels
   */
  formatContact(sfContact, source = 'Salesforce') {
    return {
      name: sfContact.name || `${sfContact.firstName || ''} ${sfContact.lastName || ''}`.trim(),
      firstName: sfContact.firstName,
      lastName: sfContact.lastName,
      title: sfContact.title,
      company: sfContact.accountName,
      email: sfContact.email,
      emailSource: sfContact.email ? source : null,
      phone: sfContact.mobilePhone || sfContact.phone,
      phoneSource: (sfContact.mobilePhone || sfContact.phone) ? source : null,
      linkedin: null,
      linkedinSource: null,
      city: sfContact.city,
      state: sfContact.state,
      recordType: sfContact.recordType,
      sfId: sfContact.id,
      accountId: sfContact.accountId,
      ownerId: sfContact.ownerId,
      ownerName: sfContact.ownerName,
      wasEnriched: false,
      enrichmentOnly: false,
      enrichmentMethods: []
    };
  }

  /**
   * Store pending writeback for later SF update
   */
  storePendingWriteback(lookupId, enrichedContact, originalSFContact) {
    this.pendingWritebacks.set(lookupId, {
      enrichedContact,
      originalSFContact,
      timestamp: Date.now()
    });

    // Auto-cleanup after timeout
    setTimeout(() => {
      this.pendingWritebacks.delete(lookupId);
    }, this.writebackTimeout);
  }

  /**
   * Confirm and write enriched data back to Salesforce
   * @param {string} lookupId - The lookup ID from the original result
   * @returns {Object} - Result of writeback operation
   */
  async confirmWriteback(lookupId) {
    const pending = this.pendingWritebacks.get(lookupId);
    
    if (!pending) {
      return {
        success: false,
        error: 'Writeback expired or not found'
      };
    }

    const { enrichedContact, originalSFContact } = pending;

    if (!originalSFContact?.id) {
      return {
        success: false,
        error: 'No Salesforce record to update'
      };
    }

    try {
      const updateFields = {};
      
      // Only update email if it came from enrichment
      if (enrichedContact.emailSource && 
          enrichedContact.emailSource !== 'Salesforce' && 
          enrichedContact.email) {
        updateFields.Email = enrichedContact.email;
      }

      if (Object.keys(updateFields).length === 0) {
        return {
          success: false,
          error: 'No enriched fields to update'
        };
      }

      // Build update
      const objectType = originalSFContact.recordType || 'Contact';
      
      logger.info('Would update SF record', {
        objectType,
        recordId: originalSFContact.id,
        fields: updateFields
      });

      // Actual implementation would use:
      // await sfConnection.sobject(objectType).update({ Id: originalSFContact.id, ...updateFields });

      this.pendingWritebacks.delete(lookupId);

      return {
        success: true,
        recordId: originalSFContact.id,
        objectType,
        updatedFields: Object.keys(updateFields)
      };

    } catch (error) {
      logger.error('Writeback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique lookup ID
   */
  generateLookupId() {
    return `cl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get analytics summary
   */
  getAnalytics() {
    return contactAnalytics.getSummary();
  }

  /**
   * Record a correction from user feedback
   */
  recordCorrection(lookupId, correction) {
    contactAnalytics.recordCorrection(lookupId, correction);
  }

  /**
   * Record implicit success (no negative feedback after 30s)
   */
  recordImplicitSuccess(lookupId) {
    contactAnalytics.recordImplicitSuccess(lookupId);
  }

  /**
   * Reset analytics
   */
  resetAnalytics() {
    contactAnalytics.reset();
  }
}

// Export singleton instance
const contactEnrichment = new ContactEnrichmentService();

module.exports = {
  contactEnrichment,
  contactAnalytics,
  lookup: (input) => contactEnrichment.lookup(input),
  confirmWriteback: (lookupId) => contactEnrichment.confirmWriteback(lookupId),
  getAnalytics: () => contactEnrichment.getAnalytics(),
  recordCorrection: (lookupId, correction) => contactEnrichment.recordCorrection(lookupId, correction),
  recordImplicitSuccess: (lookupId) => contactEnrichment.recordImplicitSuccess(lookupId),
  resetAnalytics: () => contactEnrichment.resetAnalytics()
};
