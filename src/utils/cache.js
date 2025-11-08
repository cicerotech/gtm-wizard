const redis = require('redis');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Skip Redis if URL is not set or is a placeholder
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl || redisUrl === 'redis://disabled' || redisUrl === 'disabled' || redisUrl === '') {
        logger.info('⚠️  Redis disabled - running without cache');
        this.isConnected = false;
        return null;
      }

      this.client = redis.createClient({
        url: redisUrl,
        password: process.env.REDIS_PASSWORD || undefined,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused');
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max attempts exceeded');
            return new Error('Max attempts exceeded');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.info('Redis client connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;

    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  async get(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache get');
      return null;
    }

    try {
      const value = await this.client.get(key);
      logger.cacheOperation('GET', key, !!value);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 3600) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set');
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttlSeconds, serialized);
      logger.cacheOperation('SET', key, false);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.client.del(key);
      logger.cacheOperation('DEL', key, false);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      logger.cacheOperation('EXISTS', key, !!exists);
      return !!exists;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  // Conversation context management
  async getConversationContext(userId, channelId) {
    const key = `conversation:${userId}:${channelId}`;
    return await this.get(key);
  }

  async setConversationContext(userId, channelId, context, ttlSeconds = 1800) {
    const key = `conversation:${userId}:${channelId}`;
    return await this.set(key, {
      ...context,
      timestamp: Date.now(),
      userId,
      channelId
    }, ttlSeconds);
  }

  async clearConversationContext(userId, channelId) {
    const key = `conversation:${userId}:${channelId}`;
    return await this.del(key);
  }

  // Salesforce metadata caching
  async getSalesforceMetadata(objectType) {
    const key = `sf_metadata:${objectType}`;
    return await this.get(key);
  }

  async setSalesforceMetadata(objectType, metadata, ttlSeconds = 86400) {
    const key = `sf_metadata:${objectType}`;
    return await this.set(key, metadata, ttlSeconds);
  }

  // Query result caching
  async getCachedQuery(queryHash) {
    const key = `query_result:${queryHash}`;
    return await this.get(key);
  }

  async setCachedQuery(queryHash, results, ttlSeconds = 300) {
    const key = `query_result:${queryHash}`;
    return await this.set(key, results, ttlSeconds);
  }

  // User preferences
  async getUserPreferences(userId) {
    const key = `user_prefs:${userId}`;
    return await this.get(key);
  }

  async setUserPreferences(userId, preferences) {
    const key = `user_prefs:${userId}`;
    return await this.set(key, preferences, 86400 * 30); // 30 days
  }

  // Rate limiting - More generous for testing and exploration
  async checkRateLimit(userId, action, maxRequests = 50, windowSeconds = 300) {
    const key = `rate_limit:${userId}:${action}`;
    
    try {
      const current = await this.client.incr(key);
      if (current === 1) {
        await this.client.expire(key, windowSeconds);
      }
      
      // More generous limits for different actions
      const actionLimits = {
        'mention': 50,        // 50 mentions per 5 minutes
        'dm': 60,            // 60 DMs per 5 minutes  
        'slash_command': 40,  // 40 slash commands per 5 minutes
        'feedback': 100       // 100 feedback messages per 5 minutes
      };

      const limit = actionLimits[action] || maxRequests;
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime: Date.now() + (windowSeconds * 1000)
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      return { allowed: true, remaining: maxRequests, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }
}

// Singleton instance
const cacheManager = new CacheManager();

// Initialize function
const initializeRedis = async () => {
  // Skip Redis entirely if not properly configured
  if (!process.env.REDIS_URL || process.env.REDIS_URL === 'redis://disabled' || process.env.REDIS_URL === 'disabled') {
    logger.info('⚠️  Redis skipped - not configured');
    return null;
  }
  return await cacheManager.initialize();
};

module.exports = {
  initializeRedis,
  cache: cacheManager
};
