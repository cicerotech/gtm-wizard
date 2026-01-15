const logger = require('../utils/logger');

class SocratesAdapter {
  constructor() {
    this.fallbackApiKey = process.env.OPENAI_API_KEY; // Fallback API key
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY; // Anthropic Claude fallback
    
    // Okta M2M configuration for Socrates authentication
    this.oktaConfig = {
      issuer: process.env.OKTA_ISSUER,
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET
    };
    
    // Cached Okta access token
    this.oktaToken = null;
    this.oktaTokenExpiry = 0;
    
    // Working Socrates configuration (discovered through testing)
    this.workingConfig = {
      baseURL: process.env.SOCRATES_BASE_URL || 'https://socrates.cicerotech.link',
      endpoint: '/api/chat/completions',
      authMethod: 'Bearer'
    };
    
    // Available models in your Socrates system
    this.availableModels = {
      'gpt-4': 'gpt-4',
      'gpt-4.0': 'gpt-4',
      'gpt-5': 'gpt-5',
      'claude-opus-4': 'eudia-claude-opus-4',
      'claude-opus-4.1': 'eudia-claude-opus-41',
      'claude-sonnet-4.5': 'eudia-claude-sonnet-45',
      'claude-sonnet': 'eudia-claude-sonnet-45',
      'gemini-3.0-pro': 'eudia-gemini-30-pro-preview'
    };
    
    this.model = this.availableModels[process.env.SOCRATES_MODEL] || process.env.SOCRATES_MODEL || 'gpt-4';
    this.workingEndpoint = null; // Cache successful endpoint
  }

  /**
   * Check if Okta M2M auth is configured
   */
  isOktaConfigured() {
    return !!(this.oktaConfig.issuer && this.oktaConfig.clientId && this.oktaConfig.clientSecret);
  }

  /**
   * Get Okta access token using client credentials flow
   */
  async getOktaAccessToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (this.oktaToken && Date.now() < this.oktaTokenExpiry - 300000) {
      return this.oktaToken;
    }

    if (!this.isOktaConfigured()) {
      logger.debug('Okta M2M not configured, falling back to API key auth');
      return null;
    }

    try {
      const tokenUrl = `${this.oktaConfig.issuer}/oauth2/v1/token`;
      const credentials = Buffer.from(
        `${this.oktaConfig.clientId}:${this.oktaConfig.clientSecret}`
      ).toString('base64');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials&scope=openid'
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Okta token request failed:', error);
        return null;
      }

      const data = await response.json();
      this.oktaToken = data.access_token;
      // Okta tokens typically expire in 1 hour (3600 seconds)
      this.oktaTokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000);
      
      logger.info('✅ Okta M2M access token obtained for Socrates');
      return this.oktaToken;

    } catch (error) {
      logger.error('Failed to get Okta access token:', error.message);
      return null;
    }
  }

  /**
   * Get the best available auth token (Okta preferred, fallback to API key)
   */
  async getAuthToken() {
    const oktaToken = await this.getOktaAccessToken();
    if (oktaToken) {
      return oktaToken;
    }
    return this.fallbackApiKey;
  }

  /**
   * Make a request to Socrates API
   */
  async makeRequest(messages, options = {}) {
    const startTime = Date.now();
    
    try {
      // Try different possible API formats for your internal system
      const requestBody = {
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.max_tokens || 2000,
        ...options
      };

      // Use the confirmed working configuration first
      try {
        const response = await this.tryWorkingConfig(requestBody);
        if (response) {
          const duration = Date.now() - startTime;
          logger.aiRequest(JSON.stringify(messages), response.usage?.total_tokens || 0, duration);
          return response;
        }
      } catch (error) {
        logger.debug('Working config failed, trying alternatives:', error.message);
      }

      // Fallback to trying alternative endpoints (shouldn't be needed)
      const possibleBaseURLs = ['https://socrates.cicerotech.link'];
      const possibleEndpoints = ['/api/chat/completions'];

      let lastError = null;

      // Try all combinations of base URLs and endpoints
      for (const baseURL of possibleBaseURLs) {
        for (const endpoint of possibleEndpoints) {
          try {
            const response = await this.tryEndpoint(baseURL, endpoint, requestBody);
            if (response) {
              // Cache the working endpoint for future requests
              this.workingEndpoint = { baseURL, endpoint };
              const duration = Date.now() - startTime;
              logger.aiRequest(JSON.stringify(messages), response.usage?.total_tokens || 0, duration);
              logger.info(`✅ Socrates API working at ${baseURL}${endpoint}`);
              return response;
            }
          } catch (error) {
            lastError = error;
            logger.debug(`Endpoint ${baseURL}${endpoint} failed:`, error.message);
          }
        }
      }

      // If all Socrates endpoints fail, try Anthropic fallback
      if (this.anthropicApiKey) {
        logger.info('🔄 Socrates failed, trying Anthropic Claude fallback...');
        try {
          const anthropicResponse = await this.tryAnthropicFallback(messages, options);
          if (anthropicResponse) {
            const duration = Date.now() - startTime;
            logger.aiRequest(JSON.stringify(messages), anthropicResponse.usage?.total_tokens || 0, duration);
            logger.info('✅ Anthropic Claude fallback successful');
            return anthropicResponse;
          }
        } catch (anthropicError) {
          logger.error('Anthropic fallback also failed:', anthropicError.message);
        }
      }

      // If all endpoints fail, throw the last error
      throw lastError || new Error('All Socrates endpoints failed');

    } catch (error) {
      logger.error('Socrates API request failed:', error);
      throw error;
    }
  }

  /**
   * Try the confirmed working configuration
   */
  async tryWorkingConfig(requestBody) {
    const url = `${this.workingConfig.baseURL}${this.workingConfig.endpoint}`;
    const authToken = await this.getAuthToken();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'GTM-Brain-Bot/1.0'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        return this.normalizeResponse(data);
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Try a specific endpoint with the request
   */
  async tryEndpoint(baseURL, endpoint, requestBody) {
    const url = `${baseURL}${endpoint}`;
    const authToken = await this.getAuthToken();
    
    // Try different authentication methods
    const authMethods = [
      // Method 1: Bearer token (preferred - Okta or API key)
      {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'GTM-Brain-Bot/1.0'
      },
      // Method 2: API Key header
      {
        'Content-Type': 'application/json',
        'X-API-Key': authToken,
        'User-Agent': 'GTM-Brain-Bot/1.0'
      },
      // Method 3: No authentication (for internal networks)
      {
        'Content-Type': 'application/json',
        'User-Agent': 'GTM-Brain-Bot/1.0'
      }
    ];

    let lastError = null;

    for (const headers of authMethods) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (response.ok) {
          const data = await response.json();
          return this.normalizeResponse(data);
        } else {
          // Log non-200 responses for debugging
          const errorText = await response.text();
          logger.debug(`HTTP ${response.status} from ${url}: ${errorText}`);
        }
      } catch (error) {
        lastError = error;
      }
    }

    // If all auth methods fail, throw the last error
    throw lastError || new Error(`All authentication methods failed for ${url}`);
  }

  /**
   * Try Anthropic Claude API as fallback when Socrates fails
   */
  async tryAnthropicFallback(messages, options = {}) {
    if (!this.anthropicApiKey) {
      return null;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: options.max_tokens || 500,
          messages: messages.map(m => ({
            role: m.role === 'system' ? 'user' : m.role, // Anthropic handles system differently
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return this.normalizeResponse(data);

    } catch (error) {
      logger.error('Anthropic API request failed:', error.message);
      throw error;
    }
  }

  /**
   * Normalize different response formats to OpenAI-compatible format
   */
  normalizeResponse(data) {
    // Handle OpenAI-compatible format
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data;
    }

    // Handle Claude-style format
    if (data.content) {
      return {
        choices: [{
          message: {
            content: typeof data.content === 'string' ? data.content : data.content[0]?.text || ''
          }
        }],
        usage: data.usage || { total_tokens: 0 }
      };
    }

    // Handle simple text response
    if (typeof data === 'string') {
      return {
        choices: [{
          message: {
            content: data
          }
        }],
        usage: { total_tokens: 0 }
      };
    }

    // Handle response with 'text' field
    if (data.text) {
      return {
        choices: [{
          message: {
            content: data.text
          }
        }],
        usage: data.usage || { total_tokens: 0 }
      };
    }

    // Handle response with 'response' field
    if (data.response) {
      return {
        choices: [{
          message: {
            content: data.response
          }
        }],
        usage: data.usage || { total_tokens: 0 }
      };
    }

    logger.warn('Unknown Socrates response format:', data);
    throw new Error('Unable to parse Socrates response format');
  }

  /**
   * Create chat completion (OpenAI-compatible interface)
   */
  async createChatCompletion(options) {
    const { messages, ...otherOptions } = options;
    return await this.makeRequest(messages, otherOptions);
  }

  /**
   * Test connection to Socrates
   */
  async testConnection() {
    try {
      const response = await this.createChatCompletion({
        messages: [{ role: 'user', content: 'Hello, this is a connection test.' }],
        max_tokens: 10
      });

      return response.choices && response.choices[0] && response.choices[0].message;
    } catch (error) {
      logger.error('Socrates connection test failed:', error);
      return false;
    }
  }
}

/**
 * Fallback to simple HTTP requests if fetch isn't available
 */
async function makeHttpRequest(url, options) {
  if (typeof fetch !== 'undefined') {
    return fetch(url, options);
  }

  // Fallback to node-fetch or axios if needed
  try {
    const fetch = require('node-fetch');
    return fetch(url, options);
  } catch {
    const axios = require('axios');
    const response = await axios({
      url,
      method: options.method,
      headers: options.headers,
      data: options.body
    });
    
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(response.data),
      text: () => Promise.resolve(JSON.stringify(response.data))
    };
  }
}

// Export singleton instance
const socratesAdapter = new SocratesAdapter();

module.exports = {
  SocratesAdapter,
  socratesAdapter
};
