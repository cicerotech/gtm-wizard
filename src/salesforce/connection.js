const jsforce = require('jsforce');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMIT PROTECTION
// Prevents hitting Salesforce's 3600 login attempts/hour limit
// ═══════════════════════════════════════════════════════════════════════════
const AUTH_RATE_LIMIT = {
  maxAttempts: 3,           // Max auth attempts before circuit breaker trips
  attemptCount: 0,          // Current attempt count
  lastAttemptTime: 0,       // Timestamp of last attempt
  cooldownMs: 5 * 60 * 1000, // 5 minute cooldown after max attempts
  circuitOpen: false,       // Circuit breaker state
  circuitOpenTime: 0        // When circuit was opened
};

function canAttemptLogin() {
  const now = Date.now();
  
  // If circuit is open, check if cooldown has passed
  if (AUTH_RATE_LIMIT.circuitOpen) {
    const timeSinceOpen = now - AUTH_RATE_LIMIT.circuitOpenTime;
    if (timeSinceOpen < AUTH_RATE_LIMIT.cooldownMs) {
      const remainingMs = AUTH_RATE_LIMIT.cooldownMs - timeSinceOpen;
      logger.warn(`🛑 Auth circuit breaker OPEN. Waiting ${Math.ceil(remainingMs / 1000)}s before retry...`);
      return false;
    }
    // Cooldown passed, reset circuit
    logger.info('🔄 Auth circuit breaker reset after cooldown');
    AUTH_RATE_LIMIT.circuitOpen = false;
    AUTH_RATE_LIMIT.attemptCount = 0;
  }
  
  return true;
}

function recordAuthAttempt(success) {
  AUTH_RATE_LIMIT.lastAttemptTime = Date.now();
  
  if (success) {
    // Reset on success
    AUTH_RATE_LIMIT.attemptCount = 0;
    AUTH_RATE_LIMIT.circuitOpen = false;
  } else {
    AUTH_RATE_LIMIT.attemptCount++;
    logger.warn(`⚠️ Auth attempt ${AUTH_RATE_LIMIT.attemptCount}/${AUTH_RATE_LIMIT.maxAttempts} failed`);
    
    if (AUTH_RATE_LIMIT.attemptCount >= AUTH_RATE_LIMIT.maxAttempts) {
      AUTH_RATE_LIMIT.circuitOpen = true;
      AUTH_RATE_LIMIT.circuitOpenTime = Date.now();
      logger.error(`🛑 Auth circuit breaker TRIPPED after ${AUTH_RATE_LIMIT.maxAttempts} failures. Cooldown: ${AUTH_RATE_LIMIT.cooldownMs / 1000}s`);
    }
  }
}

class SalesforceConnection {
  constructor() {
    this.conn = null;
    this.isConnected = false;
    this.connectionPool = [];
    this.maxConnections = 5;
    this.tokenRefreshPromise = null;
    this.degradedMode = false; // If true, SF is unavailable but app continues running
  }

  async initialize() {
    try {
      logger.info('🔌 Initializing Salesforce connection...');

      // Check rate limit before attempting
      if (!canAttemptLogin()) {
        logger.error('🛑 Cannot initialize SF - rate limit protection active. App will run in degraded mode.');
        this.degradedMode = true;
        this.isConnected = false;
        return null;
      }

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
      this.degradedMode = false;
      logger.info('✅ Salesforce connection established');

      return this.conn;

    } catch (error) {
      logger.error('❌ Failed to initialize Salesforce connection:', error);
      
      // Check if this is a login rate limit error
      if (error.message?.includes('LOGIN_RATE_EXCEEDED') || error.message?.includes('INVALID_LOGIN')) {
        recordAuthAttempt(false);
        
        // If circuit breaker tripped, run in degraded mode instead of crashing
        if (AUTH_RATE_LIMIT.circuitOpen) {
          logger.error('🛑 Running in DEGRADED MODE - Salesforce unavailable. Slack bot will respond with "SF unavailable" messages.');
          this.degradedMode = true;
          this.isConnected = false;
          // Don't throw - let app continue running
          return null;
        }
      }
      
      throw error;
    }
  }

  async authenticate() {
    try {
      // ALWAYS do fresh authentication - don't trust cached tokens
      // This fixes issues where cached tokens become invalid
      logger.info('🔐 Forcing fresh Salesforce authentication (ignoring cache)...');
      await this.initialAuthentication();

    } catch (error) {
      logger.error('Authentication failed:', error);
      throw error;
    }
  }

  async initialAuthentication() {
    try {
      logger.info('🔐 Performing initial Salesforce authentication... [v2.2 - Dec 22 with rate limit protection]');
      
      // Check rate limit before attempting
      if (!canAttemptLogin()) {
        throw new Error('AUTH_RATE_LIMITED: Too many failed attempts. Waiting for cooldown.');
      }
      
      // Debug: Log credential info (masked for security)
      const username = process.env.SF_USERNAME;
      const password = process.env.SF_PASSWORD;
      const token = process.env.SF_SECURITY_TOKEN;
      
      // Enhanced debug logging to verify token is correct (25 chars expected for new token)
      logger.info(`🔑 Auth attempt - Username: ${username ? username.substring(0, 5) + '***' : 'MISSING'}, Password: ${password ? password.length + ' chars' : 'MISSING'}, Token: ${token ? token.length + ' chars, starts with ' + token.substring(0, 3) : 'MISSING'}`);
      
      if (!username || !password || !token) {
        throw new Error(`Missing credentials - Username: ${!!username}, Password: ${!!password}, Token: ${!!token}`);
      }

      const result = await this.conn.login(
        username,
        password + token
      );

      // SUCCESS - record it
      recordAuthAttempt(true);

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
      
      // Record failed attempt (unless it's our own rate limit)
      if (!error.message?.includes('AUTH_RATE_LIMITED')) {
        recordAuthAttempt(false);
      }
      
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
    logger.info(`🔍 SF Query called - isConnected: ${this.isConnected}, hasConn: ${!!this.conn}, hasAccessToken: ${!!this.conn?.accessToken}`);
    
    if (!this.isConnected) {
      logger.error('❌ Salesforce not connected - attempting to reconnect...');
      try {
        await this.authenticate();
        this.isConnected = true;
        logger.info('✅ Reconnection successful');
      } catch (authError) {
        logger.error('❌ Reconnection failed:', authError);
        throw new Error('Salesforce connection not established and reconnection failed');
      }
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
      // Execute query with timeout
      logger.info(`🚀 Executing SF query (attempt ${attempt}/${maxRetries})...`);
      
      // Add 30 second timeout to prevent hanging forever
      const queryPromise = this.conn.query(soql);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('QUERY_TIMEOUT: Salesforce query timed out after 30 seconds')), 30000)
      );
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      logger.info(`✅ SF query completed - ${result?.totalSize || 0} records`);
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

        // Handle token expiration or timeout (force re-auth and retry)
      if (error.name === 'INVALID_SESSION_ID' || error.errorCode === 'INVALID_SESSION_ID' || 
          error.message?.includes('QUERY_TIMEOUT')) {
        logger.info('🔄 Session expired or timed out, forcing fresh authentication...');
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

// Check if Salesforce is available
const isSalesforceAvailable = () => {
  return sfConnection.isConnected && !sfConnection.degradedMode;
};

// Get rate limit status
const getAuthRateLimitStatus = () => ({
  circuitOpen: AUTH_RATE_LIMIT.circuitOpen,
  attemptCount: AUTH_RATE_LIMIT.attemptCount,
  maxAttempts: AUTH_RATE_LIMIT.maxAttempts,
  cooldownMs: AUTH_RATE_LIMIT.cooldownMs,
  lastAttemptTime: AUTH_RATE_LIMIT.lastAttemptTime
});

// Export connection instance and methods
module.exports = {
  initializeSalesforce,
  sfConnection,
  query: (soql, useCache = true) => sfConnection.query(soql, useCache),
  describe: (objectType) => sfConnection.describe(objectType),
  getPicklistValues: (objectType, fieldName) => sfConnection.getPicklistValues(objectType, fieldName),
  testConnection: () => sfConnection.testConnection(),
  isSalesforceAvailable,
  getAuthRateLimitStatus
};

