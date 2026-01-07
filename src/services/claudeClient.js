/**
 * Claude API Client via Socrates
 * Routes Claude API calls through Socrates (internal LLM gateway)
 * Uses eudia-claude-sonnet-45 model for contact enrichment
 */

const logger = require('../utils/logger');
const { socratesAdapter } = require('../ai/socratesAdapter');

class ClaudeClient {
  constructor() {
    // Model to use for enrichment via Socrates
    this.model = process.env.CLAUDE_MODEL || 'eudia-claude-sonnet-45';
    this.timeout = 15000; // 15 seconds timeout
    this.initialized = false;
  }

  /**
   * Initialize the client
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('✅ Claude client initialized (via Socrates)');
  }

  /**
   * Check if client is configured (Socrates handles auth)
   */
  isConfigured() {
    // Socrates handles authentication via Okta
    // Check if Socrates adapter has credentials
    return socratesAdapter.isOktaConfigured() || !!process.env.OPENAI_API_KEY;
  }

  /**
   * Enrich contact information using Claude via Socrates
   * @param {Object} contact - { firstName, lastName, company, title }
   * @returns {Object} - { phone, email, linkedin, source }
   */
  async enrichContact(contact) {
    await this.initialize();

    const startTime = Date.now();
    const { firstName, lastName, company, title } = contact;

    // Build the prompt for contact enrichment
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const titlePart = title ? ` with title ${title}` : '';
    
    const prompt = `You are a professional contact researcher. Find verified professional contact information for ${fullName} at ${company}${titlePart}.

Search for:
1. Direct phone number (mobile preferred, work acceptable)
2. Work email address (corporate domain preferred)
3. LinkedIn profile URL

Use your knowledge of common corporate email patterns, LinkedIn profile conventions, and publicly available business directories.

Respond ONLY with valid JSON in this exact format:
{
  "phone": "phone number or null if not found",
  "email": "email address or null if not found", 
  "linkedin": "LinkedIn URL or null if not found",
  "confidence": "high/medium/low",
  "notes": "brief explanation of sources or reasoning"
}`;

    try {
      // Make request through Socrates
      const response = await socratesAdapter.makeRequest(
        [{ role: 'user', content: prompt }],
        { 
          model: this.model,
          max_tokens: 500,
          temperature: 0.1
        }
      );

      const duration = Date.now() - startTime;

      if (!response.choices || !response.choices[0]?.message?.content) {
        logger.warn('Claude enrichment: Empty response from Socrates');
        return {
          success: false,
          error: 'Empty response from Claude',
          data: null,
          duration
        };
      }

      const responseText = response.choices[0].message.content;
      
      // Extract the response content
      const enrichedData = this.parseEnrichmentResponse(responseText);

      logger.info('✅ Claude enrichment completed (via Socrates)', {
        contact: fullName,
        company,
        duration,
        model: this.model,
        hasPhone: !!enrichedData.phone,
        hasEmail: !!enrichedData.email,
        hasLinkedIn: !!enrichedData.linkedin
      });

      return {
        success: true,
        data: enrichedData,
        duration,
        source: 'socrates_claude'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Claude enrichment error (via Socrates):', error.message);
      return {
        success: false,
        error: error.message,
        data: null,
        duration
      };
    }
  }

  /**
   * Parse Claude's response to extract contact data
   * @param {string|Object} response - Response text or content blocks
   */
  parseEnrichmentResponse(response) {
    const result = {
      phone: null,
      email: null,
      linkedin: null
    };

    try {
      // Handle string response (from Socrates OpenAI-compatible format)
      let text = '';
      if (typeof response === 'string') {
        text = response;
      } else if (response.content) {
        // Handle Claude-style response with content blocks
        const blocks = Array.isArray(response.content) ? response.content : [response.content];
        for (const block of blocks) {
          if (typeof block === 'string') {
            text += block;
          } else if (block.text) {
            text += block.text;
          }
        }
      }

      if (!text) {
        return result;
      }

      // Try to extract JSON from the text
      const jsonMatch = text.match(/\{[\s\S]*?"phone"[\s\S]*?\}/);
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          result.phone = parsed.phone && parsed.phone !== 'null' ? parsed.phone : null;
          result.email = parsed.email && parsed.email !== 'null' ? parsed.email : null;
          result.linkedin = parsed.linkedin && parsed.linkedin !== 'null' ? parsed.linkedin : null;
        } catch (parseError) {
          logger.debug('JSON parse failed, falling back to pattern extraction');
        }
      }

      // If JSON parsing didn't work, use pattern extraction
      if (!result.phone && !result.email && !result.linkedin) {
        result.phone = this.extractPhone(text);
        result.email = this.extractEmail(text);
        result.linkedin = this.extractLinkedIn(text);
      }

      // Validate extracted data
      result.phone = this.validatePhone(result.phone);
      result.email = this.validateEmail(result.email);
      result.linkedin = this.validateLinkedIn(result.linkedin);

    } catch (error) {
      logger.error('Error parsing enrichment response:', error);
    }

    return result;
  }

  /**
   * Extract phone number from text
   */
  extractPhone(text) {
    // Match various phone formats
    const patterns = [
      /\+1[\s.-]?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/,
      /\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/,
      /\+[0-9]{1,3}[\s.-]?[0-9]{2,4}[\s.-]?[0-9]{2,4}[\s.-]?[0-9]{2,4}/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Extract email from text
   */
  extractEmail(text) {
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
  }

  /**
   * Extract LinkedIn URL from text
   */
  extractLinkedIn(text) {
    const match = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i);
    return match ? match[0] : null;
  }

  /**
   * Validate phone number
   */
  validatePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digits except + at start
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Must have at least 10 digits
    if (cleaned.replace(/\+/g, '').length < 10) {
      return null;
    }
    
    return phone;
  }

  /**
   * Validate email
   */
  validateEmail(email) {
    if (!email) return null;
    
    // Basic email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) ? email.toLowerCase() : null;
  }

  /**
   * Validate LinkedIn URL
   */
  validateLinkedIn(url) {
    if (!url) return null;
    
    // Ensure it's a valid LinkedIn profile URL
    if (url.includes('linkedin.com/in/')) {
      return url;
    }
    return null;
  }

  /**
   * Test the client connection via Socrates
   */
  async testConnection() {
    try {
      await this.initialize();
      
      const response = await socratesAdapter.makeRequest(
        [{ role: 'user', content: 'Respond with just: OK' }],
        { model: this.model, max_tokens: 10 }
      );

      if (response.choices && response.choices[0]?.message?.content) {
        return { 
          success: true, 
          model: this.model,
          response: response.choices[0].message.content,
          via: 'socrates'
        };
      } else {
        return { success: false, error: 'Invalid response format' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ClaudeClient();
