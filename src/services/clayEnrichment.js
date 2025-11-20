const logger = require('../utils/logger');
const fetch = require('node-fetch');

/**
 * Clay API Integration for Company Enrichment
 * Enriches company data with headquarters, revenue, website, LinkedIn, employee count
 */
class ClayEnrichment {
  constructor() {
    this.apiKey = process.env.CLAY_API_KEY;
    this.baseUrl = 'https://api.clay.com/v1';
    this.enabled = !!this.apiKey;
  }

  /**
   * Enrich company data using Clay API
   */
  async enrichCompanyData(companyName) {
    try {
      if (!this.enabled) {
        logger.warn('⚠️  Clay API key not configured - using mock enrichment');
        
        // Mock enrichment for testing (until real Clay API configured)
        const companyLower = companyName.toLowerCase();
        
        // GTM Test Company - West Coast
        if (companyLower === 'gtm test company' || companyLower === 'gtm test') {
          logger.info('Using mock enrichment for GTM Test Company');
          return {
            companyName: 'GTM Test Company', // Proper casing
            headquarters: {
              city: 'San Francisco',
              state: 'CA',
              country: 'USA'
            },
            revenue: 50000000, // $50M
            website: 'www.gtmtestcompany.com',
            linkedIn: 'https://www.linkedin.com/company/gtm-test-company',
            employeeCount: 250,
            industry: 'Technology',
            success: true,
            source: 'Mock Data'
          };
        }
        
        // IKEA - International (Sweden)
        if (companyLower === 'ikea' || companyLower.includes('ikea')) {
          logger.info('Using mock enrichment for IKEA');
          return {
            companyName: 'IKEA', // Proper all-caps brand name
            headquarters: {
              city: 'Älmhult',
              state: null,
              country: 'Sweden'
            },
            revenue: 44600000000, // $44.6B
            website: 'www.ikea.com',
            linkedIn: 'https://www.linkedin.com/company/ikea',
            employeeCount: 166000,
            industry: 'Retail',
            success: true,
            source: 'Mock Data (Clay API not configured)'
          };
        }
        
        // For other companies: return empty enrichment
        logger.warn(`Clay API key not set - cannot enrich ${companyName}`);
        return this.getEmptyEnrichment(companyName);
      }

      logger.info(`🔍 Enriching company data for: ${companyName}`);

      // Clay enrichment endpoint (adjust based on actual Clay API documentation)
      const response = await fetch(`${this.baseUrl}/enrichment/company`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_name: companyName
        }),
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Clay API error: ${response.status} - ${errorText}`);
        throw new Error(`Clay API error: ${response.status}`);
      }

      const data = await response.json();
      logger.info('Clay API response received:', { hasData: !!data, keys: Object.keys(data || {}) });

      // Parse Clay response
      const enrichment = {
        companyName: data.name || companyName,
        headquarters: this.parseHeadquarters(data),
        revenue: data.revenue || data.annual_revenue || null,
        website: data.website || data.domain || null,
        linkedIn: data.linkedin_url || data.linkedin || null,
        employeeCount: data.employee_count || data.headcount || null,
        industry: data.industry || null,
        foundedYear: data.founded_year || null,
        success: true,
        source: 'Clay API'
      };

      logger.info(`✅ Company enriched successfully:`, {
        company: companyName,
        hq: enrichment.headquarters,
        revenue: enrichment.revenue
      });

      return enrichment;

    } catch (error) {
      logger.error(`Clay enrichment failed for ${companyName}:`, error.message);
      
      // Return empty enrichment on failure (allow manual entry)
      return this.getEmptyEnrichment(companyName, error.message);
    }
  }

  /**
   * Parse headquarters from Clay response
   */
  parseHeadquarters(data) {
    if (data.headquarters) {
      return {
        city: data.headquarters.city || null,
        state: data.headquarters.state || data.headquarters.region || null,
        country: data.headquarters.country || 'USA',
        fullAddress: data.headquarters.full_address || null
      };
    }

    // Try alternate formats
    if (data.hq_city || data.hq_state || data.hq_country) {
      return {
        city: data.hq_city || null,
        state: data.hq_state || null,
        country: data.hq_country || 'USA',
        fullAddress: null
      };
    }

    // Try location field
    if (data.location) {
      const parts = data.location.split(',').map(p => p.trim());
      return {
        city: parts[0] || null,
        state: parts[1] || null,
        country: parts[2] || 'USA',
        fullAddress: data.location
      };
    }

    return {
      city: null,
      state: null,
      country: null,
      fullAddress: null
    };
  }

  /**
   * Get empty enrichment object (fallback when Clay fails)
   */
  getEmptyEnrichment(companyName, errorMessage = null) {
    return {
      companyName,
      headquarters: {
        city: null,
        state: null,
        country: null,
        fullAddress: null
      },
      revenue: null,
      website: null,
      linkedIn: null,
      employeeCount: null,
      industry: null,
      foundedYear: null,
      success: false,
      source: 'Manual entry required',
      error: errorMessage
    };
  }

  /**
   * Validate enrichment has minimum required data
   */
  hasMinimumData(enrichment) {
    return !!(enrichment.headquarters?.state || enrichment.headquarters?.country);
  }
}

// Singleton instance
const clayEnrichment = new ClayEnrichment();

module.exports = {
  ClayEnrichment,
  clayEnrichment,
  enrichCompanyData: (companyName) => clayEnrichment.enrichCompanyData(companyName)
};

