const Joi = require('joi');

/**
 * Input validation schemas and functions
 */

// Common validation schemas
const schemas = {
  // User input validation
  userMessage: Joi.string().min(1).max(1000).required(),
  
  // Entity validation
  entities: Joi.object({
    timeframe: Joi.string().valid(
      'today', 'yesterday', 'this_week', 'last_week', 
      'this_month', 'last_month', 'this_quarter', 'last_quarter',
      'this_year', 'last_year', 'next_30_days', 'last_30_days', 'custom'
    ),
    customDateRange: Joi.when('timeframe', {
      is: 'custom',
      then: Joi.object({
        start: Joi.date().iso().required(),
        end: Joi.date().iso().min(Joi.ref('start')).required()
      }).required(),
      otherwise: Joi.forbidden()
    }),
    stages: Joi.array().items(Joi.string().valid(
      'Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SOO',
      'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Closed Won', 'Closed Lost'
    )),
    segments: Joi.array().items(Joi.string().valid('enterprise', 'mid-market', 'smb')),
    owners: Joi.array().items(Joi.string().min(1).max(100)),
    accounts: Joi.array().items(Joi.string().min(1).max(100)),
    industry: Joi.string().max(100),
    amountThreshold: Joi.object({
      min: Joi.number().min(0).max(1000000000),
      max: Joi.number().min(0).max(1000000000)
    }),
    type: Joi.string().valid('New Business', 'Existing Business', 'Upsell', 'Renewal'),
    isClosed: Joi.boolean(),
    isWon: Joi.boolean(),
    staleDays: Joi.number().min(1).max(365),
    daysInStage: Joi.number().min(1).max(365),
    probabilityMin: Joi.number().min(0).max(100),
    probabilityMax: Joi.number().min(0).max(100),
    limit: Joi.number().min(1).max(1000).default(100)
  }),

  // SOQL validation
  soql: Joi.string().min(10).max(10000).pattern(/^SELECT\s+/i),

  // User preferences
  userPreferences: Joi.object({
    defaultLimit: Joi.number().min(1).max(200).default(10),
    preferredCurrency: Joi.string().valid('USD', 'EUR', 'GBP').default('USD'),
    timezone: Joi.string().default('America/New_York'),
    dateFormat: Joi.string().valid('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD').default('MM/DD/YYYY'),
    notificationsEnabled: Joi.boolean().default(true),
    favoriteMetrics: Joi.array().items(Joi.string()).default(['Amount', 'StageName', 'CloseDate'])
  })
};

/**
 * Validate user input message
 */
function validateUserMessage(message) {
  const { error, value } = schemas.userMessage.validate(message);
  if (error) {
    throw new ValidationError('Invalid user message', error.details);
  }
  return value;
}

/**
 * Validate parsed entities
 */
function validateEntities(entities) {
  const { error, value } = schemas.entities.validate(entities, { 
    allowUnknown: true,
    stripUnknown: true 
  });
  
  if (error) {
    throw new ValidationError('Invalid entities', error.details);
  }
  
  return value;
}

/**
 * Validate SOQL query
 */
function validateSOQL(soql) {
  const { error, value } = schemas.soql.validate(soql);
  if (error) {
    throw new ValidationError('Invalid SOQL query', error.details);
  }

  // Additional SOQL-specific validations
  if (!soql.toUpperCase().includes('FROM OPPORTUNITY') && !soql.toUpperCase().includes('FROM ACCOUNT')) {
    throw new ValidationError('SOQL must query Opportunity or Account objects');
  }

  // Check for potentially dangerous operations
  const dangerous = ['DELETE', 'UPDATE', 'INSERT', 'UPSERT', 'MERGE'];
  const upperSoql = soql.toUpperCase();
  
  for (const op of dangerous) {
    if (upperSoql.includes(op)) {
      throw new ValidationError(`SOQL cannot contain ${op} operations`);
    }
  }

  return value;
}

/**
 * Validate user preferences
 */
function validateUserPreferences(preferences) {
  const { error, value } = schemas.userPreferences.validate(preferences);
  if (error) {
    throw new ValidationError('Invalid user preferences', error.details);
  }
  return value;
}

/**
 * Validate Slack user ID
 */
function validateSlackUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new ValidationError('Invalid Slack user ID');
  }
  
  if (!userId.match(/^U[A-Z0-9]{8,}$/)) {
    throw new ValidationError('Slack user ID must start with U and contain alphanumeric characters');
  }
  
  return userId;
}

/**
 * Validate Slack channel ID
 */
function validateSlackChannelId(channelId) {
  if (!channelId || typeof channelId !== 'string') {
    throw new ValidationError('Invalid Slack channel ID');
  }
  
  if (!channelId.match(/^[CDG][A-Z0-9]{8,}$/)) {
    throw new ValidationError('Slack channel ID must start with C, D, or G and contain alphanumeric characters');
  }
  
  return channelId;
}

/**
 * Sanitize user input to prevent injection attacks
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '') // Remove quotes that could break SOQL
    .replace(/;/g, '') // Remove semicolons
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove block comment starts
    .replace(/\*\//g, '') // Remove block comment ends
    .trim();
}

/**
 * Validate amount threshold
 */
function validateAmountThreshold(threshold) {
  if (!threshold) return threshold;
  
  if (typeof threshold !== 'object') {
    throw new ValidationError('Amount threshold must be an object');
  }
  
  if (threshold.min !== undefined && (threshold.min < 0 || threshold.min > 1000000000)) {
    throw new ValidationError('Minimum amount must be between 0 and 1 billion');
  }
  
  if (threshold.max !== undefined && (threshold.max < 0 || threshold.max > 1000000000)) {
    throw new ValidationError('Maximum amount must be between 0 and 1 billion');
  }
  
  if (threshold.min !== undefined && threshold.max !== undefined && threshold.min > threshold.max) {
    throw new ValidationError('Minimum amount cannot be greater than maximum amount');
  }
  
  return threshold;
}

/**
 * Validate date range
 */
function validateDateRange(dateRange) {
  if (!dateRange) return dateRange;
  
  const { start, end } = dateRange;
  
  if (!start || !end) {
    throw new ValidationError('Date range must include both start and end dates');
  }
  
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ValidationError('Invalid date format in date range');
  }
  
  if (startDate > endDate) {
    throw new ValidationError('Start date cannot be after end date');
  }
  
  // Don't allow date ranges more than 2 years
  const maxRange = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds
  if (endDate - startDate > maxRange) {
    throw new ValidationError('Date range cannot exceed 2 years');
  }
  
  return dateRange;
}

/**
 * Validate array of stage names
 */
function validateStages(stages) {
  if (!stages) return stages;
  
  if (!Array.isArray(stages)) {
    throw new ValidationError('Stages must be an array');
  }
  
  const validStages = [
    'Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SOO',
    'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Closed Won', 'Closed Lost'
  ];
  
  const invalidStages = stages.filter(stage => !validStages.includes(stage));
  if (invalidStages.length > 0) {
    throw new ValidationError(`Invalid stages: ${invalidStages.join(', ')}`);
  }
  
  return stages;
}

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Rate limiting validation
 */
function validateRateLimit(limit, window, action = 'request') {
  if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
    throw new ValidationError('Rate limit must be a number between 1 and 1000');
  }
  
  if (typeof window !== 'number' || window < 60 || window > 3600) {
    throw new ValidationError('Rate limit window must be between 60 and 3600 seconds');
  }
  
  return { limit, window, action };
}

/**
 * Comprehensive input validation for query processing
 */
function validateQueryInput(input) {
  const {
    message,
    userId,
    channelId,
    entities = {},
    context = null
  } = input;

  // Validate required fields
  validateUserMessage(message);
  validateSlackUserId(userId);
  validateSlackChannelId(channelId);
  
  // Validate entities
  const validatedEntities = validateEntities(entities);
  
  // Additional entity validations
  if (validatedEntities.amountThreshold) {
    validateAmountThreshold(validatedEntities.amountThreshold);
  }
  
  if (validatedEntities.customDateRange) {
    validateDateRange(validatedEntities.customDateRange);
  }
  
  if (validatedEntities.stages) {
    validateStages(validatedEntities.stages);
  }

  return {
    message: sanitizeInput(message),
    userId,
    channelId,
    entities: validatedEntities,
    context
  };
}

module.exports = {
  validateUserMessage,
  validateEntities,
  validateSOQL,
  validateUserPreferences,
  validateSlackUserId,
  validateSlackChannelId,
  sanitizeInput,
  validateAmountThreshold,
  validateDateRange,
  validateStages,
  validateRateLimit,
  validateQueryInput,
  ValidationError,
  schemas
};

