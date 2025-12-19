const jsforce = require('jsforce');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

class SalesforceConnection {
  constructor() {
    this.conn = null;
    this.isConnected = false;
    this.connectionPool = [];
    this.maxConnections = 5;
    this.tokenRefreshPromise = null;
  }

  async initialize() {
    try {
      logger.info('🔌 Initializing Salesforce connection...');

      // Create initial connection
      this.conn = new jsforce.Connection({
        instanceUrl: process.env.SF_INSTANCE_URL,
        version: '58.0' // Latest API version
      });

      // Authenticate using OAuth2 refresh token flow
      await this.authenticate();

      // Set up automatic token refresh
      this.setupTokenRefresh();

      this.isConnected = true;
      logger.info('✅ Salesforce connection established');

      return this.conn;

    } catch (error) {
      logger.error('❌ Failed to initialize Salesforce connection:', error);
      throw error;
    }
  }

  async authenticate() {
    try {
      // Try to get cached access token first
      const cachedToken = await cache.get('sf_access_token');
      
      if (cachedToken && cachedToken.expires > Date.now()) {
        this.conn.accessToken = cachedToken.token;
        this.conn.instanceUrl = cachedToken.instanceUrl;
        logger.info('🔑 Using cached Salesforce access token');
        return;
      }

      // If no cached token or expired, authenticate with refresh token
      const refreshToken = await cache.get('sf_refresh_token');
      
      if (refreshToken) {
        await this.refreshAccessToken(refreshToken);
      } else {
        // Initial authentication with username/password
        await this.initialAuthentication();
      }

    } catch (error) {
      logger.error('Authentication failed:', error);
      throw error;
    }
  }

  async initialAuthentication() {
    try {
      logger.info('🔐 Performing initial Salesforce authentication...');

      const result = await this.conn.login(
        process.env.SF_USERNAME,
        process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
      );

      // Cache the access token
      await cache.set('sf_access_token', {
        token: this.conn.accessToken,
        instanceUrl: this.conn.instanceUrl,
        expires: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
      }, 7200);

      // Cache refresh token if available
      if (result.refreshToken) {
        await cache.set('sf_refresh_token', result.refreshToken, 86400 * 30); // 30 days
      }

      logger.info('✅ Initial Salesforce authentication successful');

    } catch (error) {
      logger.error('Initial authentication failed:', error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      logger.info('🔄 Refreshing Salesforce access token...');

      const oauth2 = new jsforce.OAuth2({
        clientId: process.env.SF_CLIENT_ID,
        clientSecret: process.env.SF_CLIENT_SECRET,
        redirectUri: process.env.SF_REDIRECT_URI || 'http://localhost:3000/oauth/callback'
      });

      const result = await this.conn.oauth2.refreshToken(refreshToken);

      // Update connection with new token
      this.conn.accessToken = result.access_token;
      this.conn.instanceUrl = result.instance_url;

      // Cache the new access token
      await cache.set('sf_access_token', {
        token: result.access_token,
        instanceUrl: result.instance_url,
        expires: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
      }, 7200);

      logger.info('✅ Salesforce access token refreshed');

    } catch (error) {
      logger.error('Token refresh failed, falling back to username/password:', error);
      await this.initialAuthentication();
    }
  }

  setupTokenRefresh() {
    // Refresh token every 90 minutes (tokens expire after 2 hours)
    setInterval(async () => {
      try {
        const refreshToken = await cache.get('sf_refresh_token');
        if (refreshToken) {
          await this.refreshAccessToken(refreshToken);
        } else {
          await this.initialAuthentication();
        }
      } catch (error) {
        logger.error('Scheduled token refresh failed:', error);
      }
    }, 90 * 60 * 1000); // 90 minutes
  }

  async query(soql, useCache = true, maxRetries = 3) {
    if (!this.isConnected) {
      throw new Error('Salesforce connection not established');
    }

    const startTime = Date.now();
      const queryHash = this.generateQueryHash(soql);
      
      // Check cache first if enabled
      if (useCache) {
        const cachedResult = await cache.getCachedQuery(queryHash);
        if (cachedResult) {
          logger.info('📦 Using cached query result', { queryHash });
          return cachedResult;
        }
      }

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
      // Execute query
      const result = await this.conn.query(soql);
      const duration = Date.now() - startTime;

      // Log query execution
      logger.salesforceQuery(soql, result, duration);

      // Cache result if successful and cacheable
        if (useCache && result.totalSize < 1000) {
        await cache.setCachedQuery(queryHash, result, 300); // 5 minutes
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
        
        // Check if error is retryable
        const isRetryable = 
          error.errorCode === 'REQUEST_LIMIT_EXCEEDED' ||
          error.errorCode === 'UNABLE_TO_LOCK_ROW' ||
          error.errorCode === 'SERVER_UNAVAILABLE' ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('ETIMEDOUT') ||
          error.message?.includes('socket hang up');

        // Handle token expiration (always retry once after refresh)
      if (error.name === 'INVALID_SESSION_ID' || error.errorCode === 'INVALID_SESSION_ID') {
        logger.info('🔄 Session expired, refreshing token...');
        await this.authenticate();
          continue; // Retry with new token
        }

        // Retry on transient errors
        if (isRetryable && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.warn(`⚠️ SF query failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`, {
            error: error.message,
            errorCode: error.errorCode
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Final failure - log and throw
        logger.error('❌ Salesforce query failed:', { 
          error: error.message, 
          errorCode: error.errorCode,
          soql: soql.substring(0, 200),
          duration,
          attempts: attempt
        });

      throw error;
      }
    }
  }

  async queryMore(locator) {
    if (!this.isConnected) {
      throw new Error('Salesforce connection not established');
    }

    try {
      const result = await this.conn.queryMore(locator);
      logger.info('📄 Query more executed', { recordCount: result.records.length });
      return result;
    } catch (error) {
      logger.error('Query more failed:', error);
      throw error;
    }
  }

  async describe(objectType) {
    if (!this.isConnected) {
      throw new Error('Salesforce connection not established');
    }

    try {
      // Check cache first
      const cached = await cache.getSalesforceMetadata(objectType);
      if (cached) {
        logger.info('📦 Using cached metadata', { objectType });
        return cached;
      }

      // Describe object
      const metadata = await this.conn.sobject(objectType).describe();
      
      // Cache metadata for 24 hours
      await cache.setSalesforceMetadata(objectType, metadata, 86400);
      
      logger.info('📋 Object described', { objectType, fieldCount: metadata.fields.length });
      return metadata;

    } catch (error) {
      logger.error('Object describe failed:', error);
      throw error;
    }
  }

  async getPicklistValues(objectType, fieldName) {
    try {
      const metadata = await this.describe(objectType);
      const field = metadata.fields.find(f => f.name === fieldName);
      
      if (!field || !field.picklistValues) {
        return [];
      }

      return field.picklistValues
        .filter(pv => pv.active)
        .map(pv => pv.value);

    } catch (error) {
      logger.error('Failed to get picklist values:', error);
      return [];
    }
  }

  generateQueryHash(soql) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(soql).digest('hex');
  }

  async testConnection() {
    try {
      const result = await this.query('SELECT Id FROM User LIMIT 1');
      return result.totalSize >= 0;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }

  async disconnect() {
    if (this.conn) {
      try {
        await this.conn.logout();
        this.isConnected = false;
        logger.info('👋 Salesforce connection closed');
      } catch (error) {
        logger.error('Error closing Salesforce connection:', error);
      }
    }
  }

  // Get connection instance
  getConnection() {
    if (!this.isConnected) {
      throw new Error('Salesforce connection not established');
    }
    return this.conn;
  }
}

// Singleton instance
const sfConnection = new SalesforceConnection();

// Initialize function
const initializeSalesforce = async () => {
  return await sfConnection.initialize();
};

// Export connection instance and methods
module.exports = {
  initializeSalesforce,
  sfConnection,
  query: (soql, useCache = true) => sfConnection.query(soql, useCache),
  describe: (objectType) => sfConnection.describe(objectType),
  getPicklistValues: (objectType, fieldName) => sfConnection.getPicklistValues(objectType, fieldName),
  testConnection: () => sfConnection.testConnection()
};

