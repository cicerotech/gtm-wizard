const jsforce = require('jsforce');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMIT PROTECTION v3.0
// Prevents hitting Salesforce's 3600 login attempts/hour limit
// Fixed: Double-counting bug, better error logging, startup protection
// ═══════════════════════════════════════════════════════════════════════════
const AUTH_RATE_LIMIT = {
  maxAttempts: 3,           // Reduced: Max auth attempts before circuit breaker trips
  attemptCount: 0,          // Current attempt count
  lastAttemptTime: 0,       // Timestamp of last attempt
  cooldownMs: 15 * 60 * 1000, // 15 minute cooldown to prevent drip attacks on SF limits
  circuitOpen: false,       // Circuit breaker state
  circuitOpenTime: 0,       // When circuit was opened
  lastError: null,          // Store last error for debugging
  invalidCredentialsCooldown: 60 * 60 * 1000, // 1 hour if INVALID_LOGIN detected
  authInProgress: false,    // MUTEX: Prevents parallel auth attempts
  authPromise: null         // Shared promise for parallel queries to wait on
};

// Track if initial startup auth completed
let startupAuthComplete = false;
let startupAuthSuccess = false;

function canAttemptLogin() {
  const now = Date.now();
  
  // If circuit is open, check if cooldown has passed
  if (AUTH_RATE_LIMIT.circuitOpen) {
    const timeSinceOpen = now - AUTH_RATE_LIMIT.circuitOpenTime;
    if (timeSinceOpen < AUTH_RATE_LIMIT.cooldownMs) {
      const remainingMs = AUTH_RATE_LIMIT.cooldownMs - timeSinceOpen;
      logger.warn(`🛑 Auth circuit breaker OPEN. Waiting ${Math.ceil(remainingMs / 1000)}s before retry. Last error: ${AUTH_RATE_LIMIT.lastError || 'unknown'}`);
      return false;
    }
    // Cooldown passed, reset circuit
    logger.info('🔄 Auth circuit breaker reset after cooldown - will retry authentication');
    AUTH_RATE_LIMIT.circuitOpen = false;
    AUTH_RATE_LIMIT.attemptCount = 0;
    AUTH_RATE_LIMIT.lastError = null;
  }
  
  return true;
}

function recordAuthAttempt(success, errorMessage = null) {
  AUTH_RATE_LIMIT.lastAttemptTime = Date.now();
  
  if (success) {
    // Reset on success
    AUTH_RATE_LIMIT.attemptCount = 0;
    AUTH_RATE_LIMIT.circuitOpen = false;
    AUTH_RATE_LIMIT.lastError = null;
    logger.info('✅ Auth attempt successful - circuit breaker reset');
  } else {
    AUTH_RATE_LIMIT.attemptCount++;
    AUTH_RATE_LIMIT.lastError = errorMessage;
    logger.warn(`⚠️ Auth attempt ${AUTH_RATE_LIMIT.attemptCount}/${AUTH_RATE_LIMIT.maxAttempts} failed: ${errorMessage || 'unknown error'}`);
    
    // Check if this is an INVALID_LOGIN error - use longer cooldown
    const isInvalidCredentials = errorMessage && 
      (errorMessage.includes('INVALID_LOGIN') || 
       errorMessage.includes('Invalid username') ||
       errorMessage.includes('user locked out'));
    
    if (AUTH_RATE_LIMIT.attemptCount >= AUTH_RATE_LIMIT.maxAttempts) {
      AUTH_RATE_LIMIT.circuitOpen = true;
      AUTH_RATE_LIMIT.circuitOpenTime = Date.now();
      
      // Use 1-hour cooldown for credential errors, 15-min for other errors
      const cooldown = isInvalidCredentials 
        ? AUTH_RATE_LIMIT.invalidCredentialsCooldown 
        : AUTH_RATE_LIMIT.cooldownMs;
      
      if (isInvalidCredentials) {
        logger.error(`🚨 INVALID CREDENTIALS DETECTED - Circuit breaker LOCKED for 1 HOUR.`);
        logger.error(`🚨 Please update SF_PASSWORD and SF_SECURITY_TOKEN in environment variables.`);
        // Override cooldown for this session
        AUTH_RATE_LIMIT.cooldownMs = AUTH_RATE_LIMIT.invalidCredentialsCooldown;
      }
      
      logger.error(`🛑 Auth circuit breaker TRIPPED after ${AUTH_RATE_LIMIT.maxAttempts} failures. Cooldown: ${cooldown / 60000} minutes. Last error: ${errorMessage}`);
    }
  }
}

// Manual reset function for deployment scenarios
function resetCircuitBreaker() {
  AUTH_RATE_LIMIT.attemptCount = 0;
  AUTH_RATE_LIMIT.circuitOpen = false;
  AUTH_RATE_LIMIT.lastError = null;
  logger.info('🔄 Circuit breaker manually reset');
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
      logger.info('🔌 ====== SALESFORCE STARTUP INITIALIZATION [v3.0] ======');
      logger.info(`🔌 Instance URL: ${process.env.SF_INSTANCE_URL}`);
      logger.info(`🔌 Username: ${process.env.SF_USERNAME}`);
      logger.info(`🔌 Password length: ${process.env.SF_PASSWORD?.length || 0}`);
      logger.info(`🔌 Token length: ${process.env.SF_SECURITY_TOKEN?.length || 0}`);
      logger.info(`🔌 Token preview: ${process.env.SF_SECURITY_TOKEN?.substring(0, 5) || 'MISSING'}...`);

      // Check rate limit before attempting
      if (!canAttemptLogin()) {
        logger.error('🛑 Cannot initialize SF - rate limit protection active. App will run in degraded mode.');
        logger.error('🔴 [DEGRADED_MODE_SET] Setting degradedMode=true at INITIALIZATION (rate limit)', { 
          stack: new Error().stack,
          location: 'initialize() - rate limit check'
        });
        this.degradedMode = true;
        this.isConnected = false;
        startupAuthComplete = true;
        startupAuthSuccess = false;
        return null;
      }

      // Create initial connection
      this.conn = new jsforce.Connection({
        instanceUrl: process.env.SF_INSTANCE_URL,
        version: '58.0' // Latest API version
      });

      // Single authentication attempt during startup
      logger.info('🔐 Attempting single startup authentication...');
      await this.initialAuthentication();

      // Set up automatic token refresh (only if auth succeeded)
      this.setupTokenRefresh();

      this.isConnected = true;
      this.degradedMode = false;
      startupAuthComplete = true;
      startupAuthSuccess = true;
      logger.info('✅ ====== SALESFORCE STARTUP COMPLETE - CONNECTED ======');

      return this.conn;

    } catch (error) {
      logger.error('❌ ====== SALESFORCE STARTUP FAILED ======');
      logger.error(`❌ Error type: ${error.name}`);
      logger.error(`❌ Error message: ${error.message}`);
      logger.error(`❌ Error code: ${error.errorCode || 'N/A'}`);
      
      startupAuthComplete = true;
      startupAuthSuccess = false;
      
      // Enter degraded mode - don't crash the app
      logger.error('🛑 Running in DEGRADED MODE - Salesforce unavailable. Slack bot will respond with "SF unavailable" messages.');
      logger.error('🔴 [DEGRADED_MODE_SET] Setting degradedMode=true at INITIALIZATION (auth failed)', { 
        stack: new Error().stack,
        location: 'initialize() - auth failed',
        errorMessage: error.message
      });
      this.degradedMode = true;
      this.isConnected = false;
      
      // Don't throw - let app continue running
      return null;
    }
  }

  async authenticate() {
    try {
      // Check if we have a valid cached token first
      const cachedToken = await cache.get('sf_access_token');
      if (cachedToken && cachedToken.token && cachedToken.expires > Date.now()) {
        logger.info('🔐 Using cached Salesforce token (not expired)');
        this.conn.accessToken = cachedToken.token;
        this.conn.instanceUrl = cachedToken.instanceUrl;
        this.isConnected = true;
        return;
      }
      
      // No valid cache - do fresh authentication
      logger.info('🔐 No valid cached token - performing fresh authentication...');
      await this.initialAuthentication();

    } catch (error) {
      logger.error('Authentication failed:', error.message);
      throw error;
    }
  }

  async initialAuthentication() {
    logger.info('🔐 Performing Salesforce login... [v3.0 - Dec 22 with improved error handling]');
    
    // Check rate limit before attempting
    if (!canAttemptLogin()) {
      throw new Error('AUTH_RATE_LIMITED: Too many failed attempts. Waiting for cooldown.');
    }
    
    const username = process.env.SF_USERNAME;
    const password = process.env.SF_PASSWORD;
    const token = process.env.SF_SECURITY_TOKEN;
    
    // Detailed credential logging for debugging
    logger.info(`🔑 Credentials check:`);
    logger.info(`   Username: ${username || 'MISSING'}`);
    logger.info(`   Password: ${password ? password.length + ' chars' : 'MISSING'}`);
    logger.info(`   Token: ${token ? token.length + ' chars' : 'MISSING'}`);
    logger.info(`   Token value: ${token ? token.substring(0, 4) + '...' + token.substring(token.length - 4) : 'N/A'}`);
    
    if (!username || !password || !token) {
      const errMsg = `Missing credentials - Username: ${!!username}, Password: ${!!password}, Token: ${!!token}`;
      recordAuthAttempt(false, errMsg);
      throw new Error(errMsg);
    }

    try {
      const result = await this.conn.login(
        username,
        password + token
      );

      // SUCCESS - record it
      recordAuthAttempt(true);

      logger.info(`✅ Salesforce login successful!`);
      logger.info(`   Org ID: ${result.organizationId}`);
      logger.info(`   User ID: ${result.id}`);
      logger.info(`   Access Token: ${this.conn.accessToken ? 'Present' : 'Missing'}`);

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

    } catch (error) {
      // Extract useful error info
      const errorInfo = `${error.errorCode || error.name}: ${error.message}`;
      logger.error(`❌ Salesforce login FAILED: ${errorInfo}`);
      
      // Record failed attempt with error details
      recordAuthAttempt(false, errorInfo);
      
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
    // Only attempt if we're connected and circuit breaker is closed
    setInterval(async () => {
      try {
        // Skip refresh if not connected or in degraded mode
        if (!this.isConnected || this.degradedMode) {
          logger.info('⏭️ Skipping token refresh - not connected or in degraded mode');
          return;
        }
        
        // Skip if circuit breaker is open
        if (!canAttemptLogin()) {
          logger.info('⏭️ Skipping token refresh - circuit breaker active');
          return;
        }
        
        const refreshToken = await cache.get('sf_refresh_token');
        if (refreshToken) {
          await this.refreshAccessToken(refreshToken);
        } else {
          // Only re-auth if we had a valid connection
          logger.info('🔄 No refresh token cached, attempting re-authentication...');
          await this.initialAuthentication();
        }
      } catch (error) {
        logger.error('Scheduled token refresh failed:', error.message);
        // Don't crash - just log and continue
      }
    }, 90 * 60 * 1000); // 90 minutes
  }

  async query(soql, useCache = true, maxRetries = 3) {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENHANCED DEBUG LOGGING - Full state snapshot at query entry
    // ═══════════════════════════════════════════════════════════════════════════
    const stateSnapshot = {
      isConnected: this.isConnected,
      degradedMode: this.degradedMode,
      hasConn: !!this.conn,
      hasAccessToken: !!this.conn?.accessToken,
      circuitOpen: AUTH_RATE_LIMIT.circuitOpen,
      attemptCount: AUTH_RATE_LIMIT.attemptCount,
      authInProgress: AUTH_RATE_LIMIT.authInProgress,
      lastError: AUTH_RATE_LIMIT.lastError
    };
    logger.info(`🔍 [QUERY_ENTRY] SF Query called`, stateSnapshot);
    logger.info(`🔍 [QUERY_ENTRY] SOQL preview: ${soql.substring(0, 100)}...`);
    
    const queryHash = this.generateQueryHash(soql);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CACHE-FIRST: Check cache BEFORE circuit breaker check
    // This allows us to return cached data when SF is temporarily unavailable
    // ═══════════════════════════════════════════════════════════════════════════
    if (useCache) {
      const cachedResult = await cache.getCachedQuery(queryHash);
      if (cachedResult) {
        logger.info('📦 [CACHE_HIT] Using cached query result (before SF check)', { queryHash });
        return cachedResult;
      }
      logger.info('📦 [CACHE_MISS] No cached result, will query Salesforce', { queryHash });
    }
    
    // If in degraded mode OR not connected, attempt to reconnect (with rate limit protection)
    if (this.degradedMode || !this.isConnected) {
      logger.info(`🔄 [RECONNECT_NEEDED] Not connected - degradedMode=${this.degradedMode}, isConnected=${this.isConnected}`);
      
      // Check if circuit breaker allows a login attempt
      if (!canAttemptLogin()) {
        const status = getAuthRateLimitStatus();
        logger.error(`🛑 [CIRCUIT_BREAKER_BLOCKED] Circuit is OPEN - cooldown ${Math.ceil(status.cooldownRemaining / 1000)}s remaining`, status);
        throw new Error('Salesforce is temporarily unavailable. Please try again in a few minutes.');
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // MUTEX: Prevent parallel authentication attempts
      // If another query is already authenticating, wait for that result instead
      // ═══════════════════════════════════════════════════════════════════════════
      if (AUTH_RATE_LIMIT.authInProgress && AUTH_RATE_LIMIT.authPromise) {
        logger.info('⏳ Another authentication in progress - waiting for result...');
        try {
          await AUTH_RATE_LIMIT.authPromise;
          if (this.isConnected && !this.degradedMode) {
            logger.info('✅ Shared authentication succeeded - proceeding with query');
          } else {
            throw new Error('Salesforce is temporarily unavailable. Please try again in a few minutes.');
          }
        } catch (waitError) {
          logger.error('❌ Shared authentication failed:', waitError.message);
          throw new Error('Salesforce is temporarily unavailable. Please try again in a few minutes.');
        }
      } else {
        // This is the first query to try - set the mutex and authenticate
        AUTH_RATE_LIMIT.authInProgress = true;
        
        // Create a promise that other parallel queries can wait on
        AUTH_RATE_LIMIT.authPromise = (async () => {
          logger.info('🔐 Attempting Salesforce reconnection (first query)...');
          try {
            await this.initialAuthentication();
            this.isConnected = true;
            this.degradedMode = false;
            logger.info('✅ Reconnection successful - exited degraded mode');
          } catch (authError) {
            logger.error('❌ Reconnection failed:', authError.message);
            logger.error('🔴 [DEGRADED_MODE_SET] Setting degradedMode=true during QUERY RECONNECTION', { 
              stack: new Error().stack,
              location: 'query() - reconnection failed',
              errorMessage: authError.message
            });
            this.degradedMode = true;
            this.isConnected = false;
            throw authError;
          } finally {
            // Release the mutex after a short delay to catch stragglers
            setTimeout(() => {
              AUTH_RATE_LIMIT.authInProgress = false;
              AUTH_RATE_LIMIT.authPromise = null;
            }, 1000);
          }
        })();
        
        try {
          await AUTH_RATE_LIMIT.authPromise;
        } catch (authError) {
          throw new Error('Salesforce is temporarily unavailable. Please try again in a few minutes.');
        }
      }
    }

    const startTime = Date.now();
      
    // Note: Cache already checked at top of function (cache-first pattern)

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

        // Handle token expiration (force re-auth and retry)
        // NOTE: QUERY_TIMEOUT is NOT a session issue - just retry without re-auth
      if (error.name === 'INVALID_SESSION_ID' || error.errorCode === 'INVALID_SESSION_ID') {
        logger.info('🔄 Session expired, forcing fresh authentication...');
        await this.authenticate();
          continue; // Retry with new token
        }
        
        // Handle query timeout - just retry without re-auth (session is still valid)
        if (error.message?.includes('QUERY_TIMEOUT')) {
          if (attempt < maxRetries) {
            logger.warn(`⚠️ Query timed out (attempt ${attempt}/${maxRetries}), retrying...`);
            continue; // Retry without re-auth
          }
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

// Get full connection state for debugging
const getConnectionState = () => {
  return {
    isConnected: sfConnection.isConnected,
    degradedMode: sfConnection.degradedMode,
    circuitOpen: AUTH_RATE_LIMIT.circuitOpen,
    attemptCount: AUTH_RATE_LIMIT.attemptCount,
    authInProgress: AUTH_RATE_LIMIT.authInProgress,
    hasAccessToken: !!sfConnection.conn?.accessToken,
    lastError: AUTH_RATE_LIMIT.lastError
  };
};

// Get rate limit status
const getAuthRateLimitStatus = () => {
  const now = Date.now();
  const timeSinceOpen = AUTH_RATE_LIMIT.circuitOpen ? (now - AUTH_RATE_LIMIT.circuitOpenTime) : 0;
  const cooldownRemaining = AUTH_RATE_LIMIT.circuitOpen 
    ? Math.max(0, AUTH_RATE_LIMIT.cooldownMs - timeSinceOpen)
    : 0;
  
  return {
    circuitOpen: AUTH_RATE_LIMIT.circuitOpen,
    attemptCount: AUTH_RATE_LIMIT.attemptCount,
    maxAttempts: AUTH_RATE_LIMIT.maxAttempts,
    cooldownMs: AUTH_RATE_LIMIT.cooldownMs,
    cooldownRemaining: cooldownRemaining,  // FIX: Now properly calculated
    lastAttemptTime: AUTH_RATE_LIMIT.lastAttemptTime,
    lastError: AUTH_RATE_LIMIT.lastError,
    authInProgress: AUTH_RATE_LIMIT.authInProgress
  };
};

// Export connection instance and methods
module.exports = {
  initializeSalesforce,
  sfConnection,
  query: (soql, useCache = true) => sfConnection.query(soql, useCache),
  describe: (objectType) => sfConnection.describe(objectType),
  getPicklistValues: (objectType, fieldName) => sfConnection.getPicklistValues(objectType, fieldName),
  testConnection: () => sfConnection.testConnection(),
  isSalesforceAvailable,
  getAuthRateLimitStatus,
  getConnectionState,  // New: full state snapshot for debugging
  resetCircuitBreaker  // New: manual reset for deployment scenarios
};

