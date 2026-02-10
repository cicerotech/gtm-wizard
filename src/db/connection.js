/**
 * PostgreSQL Connection Pool
 * 
 * Manages the connection to the Render PostgreSQL database.
 * Falls back gracefully to file-based storage if DATABASE_URL is not set,
 * enabling gradual migration without breaking the existing system.
 * 
 * Usage:
 *   const { pool, query, isAvailable } = require('./db/connection');
 *   
 *   if (isAvailable()) {
 *     const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
 *   }
 */

const { Pool } = require('pg');
const logger = require('../observability/logger');

let pool = null;
let _isAvailable = false;

/**
 * Initialize the PostgreSQL connection pool
 */
function initialize() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    logger.warn('[DB] No DATABASE_URL set — PostgreSQL disabled, using file-based storage fallback');
    return;
  }

  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,                    // Max connections in pool
      idleTimeoutMillis: 30000,   // Close idle connections after 30s
      connectionTimeoutMillis: 10000, // Fail fast if can't connect in 10s
    });

    // Test the connection
    pool.on('connect', () => {
      if (!_isAvailable) {
        logger.info('[DB] PostgreSQL connection pool established');
        _isAvailable = true;
      }
    });

    pool.on('error', (err) => {
      logger.error('[DB] Unexpected pool error:', err.message);
      // Don't crash — fall back to file storage
    });

    // Verify connection immediately
    pool.query('SELECT NOW()')
      .then((res) => {
        _isAvailable = true;
        logger.info(`[DB] PostgreSQL connected: ${res.rows[0].now}`);
      })
      .catch((err) => {
        logger.error(`[DB] PostgreSQL connection failed: ${err.message}`);
        logger.warn('[DB] Falling back to file-based storage');
        _isAvailable = false;
      });

  } catch (err) {
    logger.error(`[DB] Failed to create pool: ${err.message}`);
    _isAvailable = false;
  }
}

/**
 * Execute a parameterized query
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<object>} Query result
 */
async function query(text, params = []) {
  if (!pool || !_isAvailable) {
    throw new Error('PostgreSQL is not available');
  }
  
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`[DB] Slow query (${duration}ms): ${text.substring(0, 100)}`);
    }
    
    return result;
  } catch (err) {
    logger.error(`[DB] Query error: ${err.message} — Query: ${text.substring(0, 100)}`);
    throw err;
  }
}

/**
 * Execute a query within a transaction
 * @param {Function} fn - async function that receives a client
 */
async function transaction(fn) {
  if (!pool || !_isAvailable) {
    throw new Error('PostgreSQL is not available');
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check if PostgreSQL is available
 */
function isAvailable() {
  return _isAvailable;
}

/**
 * Get the raw pool (for advanced usage)
 */
function getPool() {
  return pool;
}

/**
 * Gracefully shut down the pool
 */
async function shutdown() {
  if (pool) {
    logger.info('[DB] Shutting down PostgreSQL connection pool');
    await pool.end();
    _isAvailable = false;
  }
}

// Initialize on module load
initialize();

module.exports = {
  pool,
  query,
  transaction,
  isAvailable,
  getPool,
  shutdown,
  initialize
};
