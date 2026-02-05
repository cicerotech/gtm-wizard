/**
 * Token File Store
 * File-based encrypted storage for OAuth tokens
 * 
 * ZERO RENDER STORAGE ARCHITECTURE:
 * - Tokens stored in encrypted JSON file in git repo (data/user-tokens.enc.json)
 * - Encryption key ONLY in Render env vars (never in repo)
 * - Separation of concerns: encrypted data in git, key in runtime
 * - Even if git is compromised: tokens are AES-256-GCM encrypted
 * - Even if Render is compromised: need repo access to get encrypted data
 * 
 * This replaces SQLite storage for tokens.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// File path for encrypted tokens - in git repo data/ folder
const TOKEN_FILE = path.join(__dirname, '../../data/user-tokens.enc.json');

// In-memory cache for fast reads
let tokenCache = null;
let cacheLoadedAt = null;
let pendingSave = null;
const SAVE_DEBOUNCE_MS = 5000; // Debounce saves to avoid excessive writes

// Encryption configuration (same as userTokenService.js)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get encryption key from environment
 */
function getEncryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    logger.warn('[TokenFileStore] TOKEN_ENCRYPTION_KEY not set - using fallback (NOT SECURE)');
    return crypto.createHash('sha256').update('dev-fallback-key-change-me').digest();
  }
  
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 */
function encrypt(text) {
  if (!text) return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
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
    logger.error('[TokenFileStore] Decryption failed:', error.message);
    return null;
  }
}

/**
 * Load token data from file
 */
function loadTokenFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      tokenCache = data;
      cacheLoadedAt = Date.now();
      logger.debug(`[TokenFileStore] Loaded ${Object.keys(data.tokens || {}).length} tokens from file`);
      return data;
    }
  } catch (error) {
    logger.warn(`[TokenFileStore] Failed to load token file: ${error.message}`);
  }
  
  // Return empty structure
  tokenCache = { tokens: {}, lastModified: null };
  cacheLoadedAt = Date.now();
  return tokenCache;
}

/**
 * Save token data to file (atomic write)
 */
function saveTokenFile() {
  try {
    if (!tokenCache) {
      logger.warn('[TokenFileStore] No cache to save');
      return false;
    }
    
    tokenCache.lastModified = new Date().toISOString();
    
    // Ensure directory exists
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write: write to temp file, then rename
    const tempFile = TOKEN_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(tokenCache, null, 2));
    fs.renameSync(tempFile, TOKEN_FILE);
    
    logger.info(`[TokenFileStore] Saved ${Object.keys(tokenCache.tokens).length} tokens to file`);
    return true;
  } catch (error) {
    logger.error(`[TokenFileStore] Failed to save token file: ${error.message}`);
    return false;
  }
}

/**
 * Schedule a debounced save
 */
function scheduleSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
  }
  
  pendingSave = setTimeout(() => {
    saveTokenFile();
    pendingSave = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force immediate save (for critical operations)
 */
function forceSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  return saveTokenFile();
}

/**
 * Get the token cache (load if needed)
 */
function getCache() {
  if (!tokenCache) {
    loadTokenFile();
  }
  return tokenCache;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API - Drop-in replacement for SQLite token storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the token file store
 * No database needed - just load from file
 */
async function init() {
  loadTokenFile();
  logger.info('✅ Token file store initialized (Zero Render Storage)');
}

/**
 * Store OAuth tokens for a user
 */
async function storeTokens(email, tokens) {
  const cache = getCache();
  const emailLower = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (tokens.expires_in || 7200);
  
  cache.tokens[emailLower] = {
    accessTokenEncrypted: encrypt(tokens.access_token),
    refreshTokenEncrypted: encrypt(tokens.refresh_token),
    instanceUrl: tokens.instance_url,
    expiresAt,
    createdAt: cache.tokens[emailLower]?.createdAt || now,
    updatedAt: now,
    lastUsedAt: now
  };
  
  // Immediate save for token storage (critical operation)
  forceSave();
  
  logger.info(`✅ Stored OAuth tokens for ${emailLower} (file store)`);
}

/**
 * Get stored tokens for a user
 */
async function getTokens(email) {
  const cache = getCache();
  const emailLower = email.toLowerCase();
  
  const tokenData = cache.tokens[emailLower];
  if (!tokenData) {
    return null;
  }
  
  // Decrypt tokens
  const accessToken = decrypt(tokenData.accessTokenEncrypted);
  const refreshToken = decrypt(tokenData.refreshTokenEncrypted);
  
  if (!accessToken && !refreshToken) {
    logger.warn(`[TokenFileStore] Failed to decrypt tokens for ${emailLower}`);
    return null;
  }
  
  // Update last_used_at
  tokenData.lastUsedAt = Math.floor(Date.now() / 1000);
  scheduleSave(); // Debounced save for usage tracking
  
  return {
    email: emailLower,
    accessToken,
    refreshToken,
    instanceUrl: tokenData.instanceUrl,
    expiresAt: tokenData.expiresAt,
    isExpired: tokenData.expiresAt < Math.floor(Date.now() / 1000)
  };
}

/**
 * Check if a user has valid stored tokens
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
 */
async function updateAccessToken(email, newAccessToken, expiresIn = 7200) {
  const cache = getCache();
  const emailLower = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  
  if (!cache.tokens[emailLower]) {
    throw new Error(`No tokens found for ${emailLower}`);
  }
  
  cache.tokens[emailLower].accessTokenEncrypted = encrypt(newAccessToken);
  cache.tokens[emailLower].expiresAt = now + expiresIn;
  cache.tokens[emailLower].updatedAt = now;
  
  // Immediate save for token refresh (critical operation)
  forceSave();
  
  logger.info(`✅ Refreshed access token for ${emailLower} (file store)`);
}

/**
 * Revoke/delete tokens for a user
 */
async function revokeTokens(email) {
  const cache = getCache();
  const emailLower = email.toLowerCase();
  
  if (cache.tokens[emailLower]) {
    delete cache.tokens[emailLower];
    forceSave();
    logger.info(`🗑️ Revoked tokens for ${emailLower} (file store)`);
  }
}

/**
 * Get all authenticated users
 */
async function listAuthenticatedUsers() {
  const cache = getCache();
  const now = Math.floor(Date.now() / 1000);
  
  return Object.entries(cache.tokens).map(([email, data]) => ({
    email,
    instanceUrl: data.instanceUrl,
    isExpired: data.expiresAt < now,
    createdAt: new Date(data.createdAt * 1000).toISOString(),
    lastUsedAt: data.lastUsedAt 
      ? new Date(data.lastUsedAt * 1000).toISOString() 
      : null
  }));
}

/**
 * Get file store status (for monitoring)
 */
function getStoreStatus() {
  const cache = getCache();
  return {
    tokenCount: Object.keys(cache.tokens).length,
    lastModified: cache.lastModified,
    filePath: TOKEN_FILE,
    fileExists: fs.existsSync(TOKEN_FILE),
    storageType: 'file-based (Zero Render Storage)'
  };
}

/**
 * Migrate tokens from SQLite to file store
 * Call this once to migrate existing tokens
 */
async function migrateFromSQLite(sqliteTokens) {
  const cache = getCache();
  let migrated = 0;
  
  for (const token of sqliteTokens) {
    if (!cache.tokens[token.email]) {
      // Token data from SQLite is already encrypted
      cache.tokens[token.email] = {
        accessTokenEncrypted: token.access_token_encrypted,
        refreshTokenEncrypted: token.refresh_token_encrypted,
        instanceUrl: token.instance_url,
        expiresAt: token.expires_at,
        createdAt: token.created_at,
        updatedAt: token.updated_at,
        lastUsedAt: token.last_used_at
      };
      migrated++;
    }
  }
  
  if (migrated > 0) {
    forceSave();
    logger.info(`[TokenFileStore] Migrated ${migrated} tokens from SQLite`);
  }
  
  return migrated;
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
  migrateFromSQLite,
  forceSave,
  TOKEN_FILE
};
