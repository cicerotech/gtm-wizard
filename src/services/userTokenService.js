/**
 * User Token Service
 * Manages encrypted OAuth tokens for per-user Salesforce authentication
 * 
 * ZERO RENDER STORAGE ARCHITECTURE:
 * - By default, uses file-based storage (tokenFileStore.js)
 * - Tokens encrypted with AES-256-GCM before storage
 * - Encryption key from environment variable (never in repo)
 * - File store keeps encrypted data in git, key on Render
 * 
 * ROLLBACK: Set USE_SQLITE_TOKENS=true to use legacy SQLite storage
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const tokenFileStore = require('./tokenFileStore');

// Feature flag for rollback - default to file store (Zero Render Storage)
const USE_FILE_STORE = process.env.USE_SQLITE_TOKENS !== 'true';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment (must be 32 bytes / 64 hex chars)
function getEncryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    logger.warn('TOKEN_ENCRYPTION_KEY not set - using fallback (NOT SECURE FOR PRODUCTION)');
    // Fallback for development only - DO NOT use in production
    return crypto.createHash('sha256').update('dev-fallback-key-change-me').digest();
  }
  
  // If hex string, convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // If raw string, hash it to get 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string (iv:authTag:encrypted)
 */
function encrypt(text) {
  if (!text) return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted string (iv:authTag:encrypted)
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Token decryption failed:', error.message);
    return null;
  }
}

// SQLite database reference (will be set by init)
let db = null;

// Promisify helper for sqlite3
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Initialize the token service
 * @param {Database} database - SQLite database instance (optional with file store)
 */
async function init(database) {
  if (USE_FILE_STORE) {
    // Zero Render Storage: Use file-based token store
    await tokenFileStore.init();
    
    // If SQLite database provided, migrate existing tokens
    if (database) {
      db = database;
      try {
        // Check if user_tokens table exists and has data
        const rows = await dbAll('SELECT * FROM user_tokens');
        if (rows && rows.length > 0) {
          const migrated = await tokenFileStore.migrateFromSQLite(rows);
          if (migrated > 0) {
            logger.info(`✅ Migrated ${migrated} tokens from SQLite to file store`);
          }
        }
      } catch (error) {
        // Table might not exist, that's fine
        logger.debug('[TokenService] No SQLite tokens to migrate');
      }
    }
    
    logger.info('✅ User token service initialized (Zero Render Storage - file store)');
    return;
  }
  
  // Legacy SQLite mode
  db = database;
  
  // Create user_tokens table if it doesn't exist
  await dbExec(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      email TEXT PRIMARY KEY,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      instance_url TEXT,
      token_type TEXT DEFAULT 'Bearer',
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_used_at INTEGER
    )
  `);
  
  logger.info('✅ User token service initialized (legacy SQLite mode)');
}

/**
 * Store OAuth tokens for a user
 * @param {string} email - User's email
 * @param {Object} tokens - Token data from Salesforce
 * @param {string} tokens.access_token - Access token
 * @param {string} tokens.refresh_token - Refresh token
 * @param {string} tokens.instance_url - SF instance URL
 * @param {number} tokens.expires_in - Token lifetime in seconds
 */
async function storeTokens(email, tokens) {
  if (USE_FILE_STORE) {
    return tokenFileStore.storeTokens(email, tokens);
  }
  
  // Legacy SQLite mode
  if (!db) {
    throw new Error('Token service not initialized');
  }
  
  const emailLower = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (tokens.expires_in || 7200); // Default 2 hours
  
  // Encrypt tokens before storage
  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = encrypt(tokens.refresh_token);
  
  await dbRun(`
    INSERT INTO user_tokens (
      email, access_token_encrypted, refresh_token_encrypted, 
      instance_url, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      instance_url = excluded.instance_url,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `, [
    emailLower,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokens.instance_url,
    expiresAt,
    now
  ]);
  
  logger.info(`✅ Stored OAuth tokens for ${emailLower}`);
}

/**
 * Get stored tokens for a user
 * @param {string} email - User's email
 * @returns {Object|null} - Decrypted token data or null if not found
 */
async function getTokens(email) {
  if (USE_FILE_STORE) {
    return tokenFileStore.getTokens(email);
  }
  
  // Legacy SQLite mode
  if (!db) {
    throw new Error('Token service not initialized');
  }
  
  const emailLower = email.toLowerCase();
  
  const row = await dbGet(
    'SELECT * FROM user_tokens WHERE email = ?',
    [emailLower]
  );
  
  if (!row) {
    return null;
  }
  
  // Decrypt tokens
  const accessToken = decrypt(row.access_token_encrypted);
  const refreshToken = decrypt(row.refresh_token_encrypted);
  
  if (!accessToken && !refreshToken) {
    logger.warn(`Failed to decrypt tokens for ${emailLower}`);
    return null;
  }
  
  // Update last_used_at
  await dbRun(
    'UPDATE user_tokens SET last_used_at = ? WHERE email = ?',
    [Math.floor(Date.now() / 1000), emailLower]
  );
  
  return {
    email: row.email,
    accessToken,
    refreshToken,
    instanceUrl: row.instance_url,
    expiresAt: row.expires_at,
    isExpired: row.expires_at < Math.floor(Date.now() / 1000)
  };
}

/**
 * Check if a user has valid stored tokens
 * @param {string} email - User's email
 * @returns {Object} - Status info
 */
async function checkAuthStatus(email) {
  const tokens = await getTokens(email);
  
  if (!tokens) {
    return {
      authenticated: false,
      hasTokens: false,
      message: 'No tokens found. User needs to authenticate.'
    };
  }
  
  if (tokens.isExpired && !tokens.refreshToken) {
    return {
      authenticated: false,
      hasTokens: true,
      expired: true,
      message: 'Tokens expired and no refresh token available.'
    };
  }
  
  return {
    authenticated: true,
    hasTokens: true,
    expired: tokens.isExpired,
    hasRefreshToken: !!tokens.refreshToken,
    instanceUrl: tokens.instanceUrl,
    message: tokens.isExpired 
      ? 'Access token expired but refresh token available.'
      : 'Valid tokens available.'
  };
}

/**
 * Update access token after refresh
 * @param {string} email - User's email
 * @param {string} newAccessToken - New access token
 * @param {number} expiresIn - Token lifetime in seconds
 */
async function updateAccessToken(email, newAccessToken, expiresIn = 7200) {
  if (USE_FILE_STORE) {
    return tokenFileStore.updateAccessToken(email, newAccessToken, expiresIn);
  }
  
  // Legacy SQLite mode
  if (!db) {
    throw new Error('Token service not initialized');
  }
  
  const emailLower = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expiresIn;
  
  const accessTokenEncrypted = encrypt(newAccessToken);
  
  await dbRun(`
    UPDATE user_tokens 
    SET access_token_encrypted = ?, expires_at = ?, updated_at = ?
    WHERE email = ?
  `, [accessTokenEncrypted, expiresAt, now, emailLower]);
  
  logger.info(`✅ Refreshed access token for ${emailLower}`);
}

/**
 * Revoke/delete tokens for a user
 * @param {string} email - User's email
 */
async function revokeTokens(email) {
  if (USE_FILE_STORE) {
    return tokenFileStore.revokeTokens(email);
  }
  
  // Legacy SQLite mode
  if (!db) {
    throw new Error('Token service not initialized');
  }
  
  const emailLower = email.toLowerCase();
  
  await dbRun('DELETE FROM user_tokens WHERE email = ?', [emailLower]);
  
  logger.info(`🗑️ Revoked tokens for ${emailLower}`);
}

/**
 * Get all authenticated users (admin function)
 * @returns {Array} - List of authenticated user emails
 */
async function listAuthenticatedUsers() {
  if (USE_FILE_STORE) {
    return tokenFileStore.listAuthenticatedUsers();
  }
  
  // Legacy SQLite mode
  if (!db) {
    throw new Error('Token service not initialized');
  }
  
  const rows = await dbAll(`
    SELECT email, instance_url, expires_at, created_at, last_used_at
    FROM user_tokens
    ORDER BY last_used_at DESC
  `);
  
  return rows.map(row => ({
    email: row.email,
    instanceUrl: row.instance_url,
    isExpired: row.expires_at < Math.floor(Date.now() / 1000),
    createdAt: new Date(row.created_at * 1000).toISOString(),
    lastUsedAt: row.last_used_at 
      ? new Date(row.last_used_at * 1000).toISOString() 
      : null
  }));
}

/**
 * Get storage status (for diagnostics)
 * @returns {Object} - Status info about storage backend
 */
async function getStoreStatus() {
  if (USE_FILE_STORE) {
    return tokenFileStore.getStoreStatus();
  }
  
  // Legacy SQLite mode
  const userCount = await dbGet('SELECT COUNT(*) as count FROM user_tokens');
  return {
    type: 'sqlite',
    userCount: userCount?.count || 0,
    message: 'Using legacy SQLite storage'
  };
}

/**
 * Force save pending changes (for graceful shutdown or git commit job)
 */
async function forceSave() {
  if (USE_FILE_STORE) {
    return tokenFileStore.forceSave();
  }
  // SQLite saves are synchronous, no-op
}

module.exports = {
  init,
  encrypt,
  decrypt,
  storeTokens,
  getTokens,
  checkAuthStatus,
  updateAccessToken,
  revokeTokens,
  listAuthenticatedUsers,
  getStoreStatus,
  forceSave,
  USE_FILE_STORE
};
