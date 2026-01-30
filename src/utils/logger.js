const winston = require('winston');

// ═══════════════════════════════════════════════════════════════════════════
// CORRELATION ID GENERATION - For cross-system traceability
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique correlation ID for request tracing
 * Format: timestamp-randomString (e.g., "1706547200000-abc123xyz")
 */
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Store current correlation ID in async context (simple version)
let currentCorrelationId = null;

/**
 * Set the current correlation ID for the request context
 */
function setCorrelationId(id) {
  currentCorrelationId = id;
}

/**
 * Get the current correlation ID, or generate a new one
 */
function getCorrelationId() {
  return currentCorrelationId || generateCorrelationId();
}

// Verbose logging mode - enabled via VERBOSE_LOGGING=true
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'gtm-brain-bot'
  },
  transports: [
    // Write all logs to console in development
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// Add custom methods for structured logging
logger.salesforceQuery = (query, results, duration) => {
  logger.info('Salesforce query executed', {
    query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
    resultCount: results?.totalSize || 0,
    duration: `${duration}ms`,
    type: 'salesforce_query'
  });
};

logger.slackInteraction = (type, userId, channelId, command) => {
  logger.info('Slack interaction', {
    type,
    userId,
    channelId,
    command,
    type: 'slack_interaction'
  });
};

logger.aiRequest = (prompt, tokens, duration) => {
  logger.info('AI request processed', {
    promptLength: prompt.length,
    tokens,
    duration: `${duration}ms`,
    type: 'ai_request'
  });
};

logger.cacheOperation = (operation, key, hit) => {
  logger.debug('Cache operation', {
    operation,
    key,
    hit,
    type: 'cache_operation'
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING WITH CONTEXT - For Q1 FY26 Priorities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log with full context including correlation ID
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {object} context - Additional context (service, operation, etc.)
 * @returns {string} The correlation ID used
 */
function logWithContext(level, message, context = {}) {
  const correlationId = context.correlationId || getCorrelationId();
  
  const entry = {
    timestamp: new Date().toISOString(),
    correlationId,
    service: context.service || 'gtm-brain',
    operation: context.operation || 'unknown',
    ...context
  };
  
  // Remove duplicates
  delete entry.correlationId;
  
  logger[level](message, { correlationId, ...entry });
  
  return correlationId;
}

/**
 * Log operation start with context
 */
logger.operationStart = (operation, context = {}) => {
  const correlationId = context.correlationId || generateCorrelationId();
  setCorrelationId(correlationId);
  
  logger.info(`[START] ${operation}`, {
    correlationId,
    operation,
    service: context.service || 'gtm-brain',
    ...context
  });
  
  return correlationId;
};

/**
 * Log operation success
 */
logger.operationSuccess = (operation, context = {}) => {
  const correlationId = getCorrelationId();
  
  logger.info(`[SUCCESS] ${operation}`, {
    correlationId,
    operation,
    result: 'success',
    ...context
  });
};

/**
 * Log operation failure with full error context
 */
logger.operationError = (operation, error, context = {}) => {
  const correlationId = getCorrelationId();
  
  logger.error(`[ERROR] ${operation}`, {
    correlationId,
    operation,
    error: error.message,
    stack: error.stack,
    errorCode: error.code || 'UNKNOWN',
    ...context
  });
};

/**
 * Verbose debug logging - only outputs if VERBOSE_LOGGING=true
 */
logger.verbose = (message, context = {}) => {
  if (VERBOSE_LOGGING) {
    const correlationId = getCorrelationId();
    logger.debug(`[VERBOSE] ${message}`, {
      correlationId,
      ...context
    });
  }
};

/**
 * Log for specific priority areas (P1-P7)
 */
logger.priority = (priorityId, operation, message, context = {}) => {
  const correlationId = getCorrelationId();
  
  logger.info(`[${priorityId}] ${operation}: ${message}`, {
    correlationId,
    priority: priorityId,
    operation,
    ...context
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = logger;
module.exports.generateCorrelationId = generateCorrelationId;
module.exports.setCorrelationId = setCorrelationId;
module.exports.getCorrelationId = getCorrelationId;
module.exports.logWithContext = logWithContext;
module.exports.VERBOSE_LOGGING = VERBOSE_LOGGING;

