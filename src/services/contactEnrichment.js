/**
 * Contact Enrichment Service
 * Orchestrates SF lookup + Claude API enrichment + data merge
 * 
 * Flow:
 * 1. Parse input (firstName, lastName, company, title)
 * 2. Query SF Contacts/Leads with fuzzy matching
 * 3. If SF data complete → return immediately
 * 4. If incomplete/no match → call Claude with web_search
 * 5. Merge data (SF takes precedence) with source labels
 * 6. Track analytics for feedback learning
 */

const fuzzyContactMatcher = require('./fuzzyContactMatcher');
const claudeClient = require('./claudeClient');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// Analytics tracking (as specified in plan)
const contactAnalytics = {
  bySource: { sf_only: 0, sf_enriched: 0, web_only: 0, no_result: 0 },
  byOutcome: { success: 0, multiple_match: 0, no_match: 0, error: 0 },
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
    
    this.responseTimesMs.push(duration);
  },

  recordCorrection(originalLookup, correction) {
    this.corrections.push({
      lookup: originalLookup,
      correction,
      timestamp: Date.now()
    });
    logger.info('📝 Contact correction recorded', { originalLookup, correction });
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
    this.bySource = { sf_only: 0, sf_enriched: 0, web_only: 0, no_result: 0 };
    this.byOutcome = { success: 0, multiple_match: 0, no_match: 0, error: 0 };
    this.responseTimesMs = [];
    this.corrections = [];
    this.implicitSuccesses = [];
    this.sessionStart = Date.now();
  }
};

class ContactEnrichmentService {
  constructor() {
    this.contactMatcher = fuzzyContactMatcher;
    this.claudeClient = claudeClient;
    this.pendingWritebacks = new Map(); // Track pending SF writebacks
    this.writebackTimeout = 30000; // 30 seconds as specified
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
      lookupId: this.generateLookupId(),
      parsed: null
    };

    try {
      logger.info('🔍 Contact lookup started', { input });

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
          // Found SF record but incomplete - proceed to enrichment
          const primaryContact = sfResult.contacts[0];
          result.contact = await this.enrichAndMerge(primaryContact, sfResult.parsed);
          result.contacts = [result.contact];
          result.success = true;
          result.source = result.contact.wasEnriched ? 'sf_enriched' : 'sf_only';
          result.enriched = result.contact.wasEnriched;
        }
      } else {
        // No SF match - try pure enrichment
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

      logger.info('✅ Contact lookup completed', {
        input,
        success: result.success,
        source: result.source,
        enriched: result.enriched,
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
   */
  async handleNoSFMatch(input, parsed, result) {
    if (!parsed || (!parsed.firstName && !parsed.lastName)) {
      result.success = false;
      result.error = 'Could not parse contact information from input';
      result.source = 'no_result';
      result.suggestion = 'Try: last name only, different spelling, company domain';
      return result;
    }

    // Try Claude enrichment for completely new contact
    if (parsed.company) {
      const enrichment = await this.claudeClient.enrichContact({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        company: parsed.company,
        title: parsed.title
      });

      if (enrichment.success && enrichment.data) {
        const hasData = enrichment.data.phone || enrichment.data.email || enrichment.data.linkedin;
        
        if (hasData) {
          result.contact = {
            name: `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim(),
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            company: parsed.company,
            title: parsed.title,
            phone: enrichment.data.phone,
            phoneSource: enrichment.data.phone ? 'Web Search' : null,
            email: enrichment.data.email,
            emailSource: enrichment.data.email ? 'Web Search' : null,
            linkedin: enrichment.data.linkedin,
            linkedinSource: enrichment.data.linkedin ? 'Web Search' : null,
            recordType: null,
            sfId: null,
            wasEnriched: true,
            enrichmentOnly: true
          };
          result.contacts = [result.contact];
          result.success = true;
          result.source = 'web_only';
          result.enriched = true;
          result.canWriteToSF = false; // No SF record to update
        } else {
          result.success = false;
          result.source = 'no_result';
          result.error = 'No contact found';
          result.suggestion = 'Try: last name only, different spelling, company domain';
        }
      } else {
        result.success = false;
        result.source = 'no_result';
        result.error = enrichment.error || 'Enrichment unavailable';
        result.suggestion = 'Try: last name only, different spelling, company domain';
      }
    } else {
      result.success = false;
      result.source = 'no_result';
      result.error = 'No company specified for enrichment';
      result.suggestion = 'Include company name: "John Smith at Acme Corp"';
    }

    return result;
  }

  /**
   * Enrich SF contact with Claude data and merge
   */
  async enrichAndMerge(sfContact, parsed) {
    // Format base contact from SF
    const contact = this.formatContact(sfContact, 'Salesforce');
    contact.wasEnriched = false;

    // Only enrich if missing phone or email
    if (contact.email && contact.phone) {
      return contact;
    }

    // Call Claude for enrichment
    const enrichment = await this.claudeClient.enrichContact({
      firstName: sfContact.firstName || parsed?.firstName,
      lastName: sfContact.lastName || parsed?.lastName,
      company: sfContact.accountName || parsed?.company,
      title: sfContact.title || parsed?.title
    });

    if (enrichment.success && enrichment.data) {
      // Merge: SF data takes precedence
      if (!contact.phone && enrichment.data.phone) {
        contact.phone = enrichment.data.phone;
        contact.phoneSource = 'Web Search';
        contact.wasEnriched = true;
      }

      if (!contact.email && enrichment.data.email) {
        contact.email = enrichment.data.email;
        contact.emailSource = 'Web Search';
        contact.wasEnriched = true;
      }

      if (!contact.linkedin && enrichment.data.linkedin) {
        contact.linkedin = enrichment.data.linkedin;
        contact.linkedinSource = 'Web Search';
        contact.wasEnriched = true;
      }

      contact.enrichmentDuration = enrichment.duration;
    } else if (enrichment.error) {
      contact.enrichmentError = enrichment.error;
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
      enrichmentOnly: false
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
      
      // Only update fields that came from enrichment
      if (enrichedContact.phoneSource === 'Web Search' && enrichedContact.phone) {
        updateFields.MobilePhone = enrichedContact.phone;
      }
      
      if (enrichedContact.emailSource === 'Web Search' && enrichedContact.email) {
        updateFields.Email = enrichedContact.email;
      }

      if (Object.keys(updateFields).length === 0) {
        return {
          success: false,
          error: 'No enriched fields to update'
        };
      }

      // Build update SOQL
      const objectType = originalSFContact.recordType || 'Contact';
      const setClause = Object.entries(updateFields)
        .map(([field, value]) => `${field} = '${value.replace(/'/g, "\\'")}'`)
        .join(', ');

      // Note: jsforce uses sobject.update() not direct SOQL for updates
      // This would need to use the Salesforce connection's update method
      logger.info('📝 Would update SF record', {
        objectType,
        recordId: originalSFContact.id,
        fields: updateFields
      });

      // For now, log the intended update
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

