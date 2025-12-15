/**
 * Comprehensive tests for validators utility module
 * Testing all exported functions with happy path, edge cases, and error conditions
 */

const {
  validateUserMessage,
  validateSlackUserId,
  validateSlackChannelId,
  sanitizeInput,
  validateAmountThreshold,
  validateDateRange,
  validateStages,
  validateRateLimit,
  ValidationError
} = require('../src/utils/validators');

describe('validateUserMessage', () => {
  describe('happy path', () => {
    test('validates normal message', () => {
      const result = validateUserMessage('Who owns Boeing?');
      expect(result).toBe('Who owns Boeing?');
    });

    test('validates long message within limits', () => {
      const message = 'a'.repeat(500);
      expect(validateUserMessage(message)).toBe(message);
    });
  });

  describe('edge cases', () => {
    test('rejects null', () => {
      expect(() => validateUserMessage(null)).toThrow(ValidationError);
    });

    test('rejects undefined', () => {
      expect(() => validateUserMessage(undefined)).toThrow(ValidationError);
    });

    test('rejects empty string', () => {
      expect(() => validateUserMessage('')).toThrow(ValidationError);
    });

    test('rejects message over 1000 chars', () => {
      const longMessage = 'a'.repeat(1001);
      expect(() => validateUserMessage(longMessage)).toThrow(ValidationError);
    });
  });
});

describe('validateSlackUserId', () => {
  describe('happy path', () => {
    test('validates correct Slack user ID', () => {
      expect(validateSlackUserId('U094AQE9V7D')).toBe('U094AQE9V7D');
    });

    test('validates user ID with all caps', () => {
      expect(validateSlackUserId('UABCDEFGHIJ')).toBe('UABCDEFGHIJ');
    });
  });

  describe('edge cases', () => {
    test('rejects null', () => {
      expect(() => validateSlackUserId(null)).toThrow(ValidationError);
    });

    test('rejects undefined', () => {
      expect(() => validateSlackUserId(undefined)).toThrow(ValidationError);
    });

    test('rejects empty string', () => {
      expect(() => validateSlackUserId('')).toThrow(ValidationError);
    });

    test('rejects non-string', () => {
      expect(() => validateSlackUserId(12345)).toThrow(ValidationError);
    });

    test('rejects ID not starting with U', () => {
      expect(() => validateSlackUserId('C094AQE9V7D')).toThrow(ValidationError);
    });

    test('rejects ID too short', () => {
      expect(() => validateSlackUserId('U123')).toThrow(ValidationError);
    });

    test('rejects lowercase IDs', () => {
      expect(() => validateSlackUserId('u094aqe9v7d')).toThrow(ValidationError);
    });
  });
});

describe('validateSlackChannelId', () => {
  describe('happy path', () => {
    test('validates channel ID starting with C', () => {
      expect(validateSlackChannelId('C094AQE9V7D')).toBe('C094AQE9V7D');
    });

    test('validates DM channel ID starting with D', () => {
      expect(validateSlackChannelId('D094AQE9V7D')).toBe('D094AQE9V7D');
    });

    test('validates group channel ID starting with G', () => {
      expect(validateSlackChannelId('G094AQE9V7D')).toBe('G094AQE9V7D');
    });
  });

  describe('edge cases', () => {
    test('rejects null', () => {
      expect(() => validateSlackChannelId(null)).toThrow(ValidationError);
    });

    test('rejects undefined', () => {
      expect(() => validateSlackChannelId(undefined)).toThrow(ValidationError);
    });

    test('rejects empty string', () => {
      expect(() => validateSlackChannelId('')).toThrow(ValidationError);
    });

    test('rejects ID not starting with C/D/G', () => {
      expect(() => validateSlackChannelId('U094AQE9V7D')).toThrow(ValidationError);
    });

    test('rejects ID too short', () => {
      expect(() => validateSlackChannelId('C123')).toThrow(ValidationError);
    });
  });
});

describe('sanitizeInput', () => {
  describe('happy path', () => {
    test('returns clean string unchanged', () => {
      expect(sanitizeInput('Hello world')).toBe('Hello world');
    });

    test('trims whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });
  });

  describe('security - removes dangerous characters', () => {
    test('removes HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
    });

    test('removes SQL quotes', () => {
      expect(sanitizeInput("test' OR '1'='1")).toBe('test OR 1=1');
    });

    test('removes semicolons', () => {
      expect(sanitizeInput('SELECT * FROM users; DROP TABLE users;')).toBe('SELECT * FROM users DROP TABLE users');
    });

    test('removes SQL comments', () => {
      expect(sanitizeInput('query --comment')).toBe('query comment');
    });

    test('removes block comments', () => {
      expect(sanitizeInput('query /* comment */ more')).toBe('query  comment  more');
    });
  });

  describe('edge cases', () => {
    test('handles non-string input', () => {
      expect(sanitizeInput(12345)).toBe(12345);
    });

    test('handles null', () => {
      expect(sanitizeInput(null)).toBe(null);
    });

    test('handles undefined', () => {
      expect(sanitizeInput(undefined)).toBe(undefined);
    });
  });
});

describe('validateAmountThreshold', () => {
  describe('happy path', () => {
    test('validates valid threshold', () => {
      const threshold = { min: 10000, max: 1000000 };
      expect(validateAmountThreshold(threshold)).toEqual(threshold);
    });

    test('validates with only min', () => {
      const threshold = { min: 10000 };
      expect(validateAmountThreshold(threshold)).toEqual(threshold);
    });

    test('validates with only max', () => {
      const threshold = { max: 1000000 };
      expect(validateAmountThreshold(threshold)).toEqual(threshold);
    });
  });

  describe('edge cases', () => {
    test('returns null/undefined as-is', () => {
      expect(validateAmountThreshold(null)).toBe(null);
      expect(validateAmountThreshold(undefined)).toBe(undefined);
    });

    test('rejects non-object', () => {
      expect(() => validateAmountThreshold('not-object')).toThrow(ValidationError);
    });

    test('rejects negative min', () => {
      expect(() => validateAmountThreshold({ min: -100 })).toThrow(ValidationError);
    });

    test('rejects min over 1 billion', () => {
      expect(() => validateAmountThreshold({ min: 1000000001 })).toThrow(ValidationError);
    });

    test('rejects negative max', () => {
      expect(() => validateAmountThreshold({ max: -100 })).toThrow(ValidationError);
    });

    test('rejects min greater than max', () => {
      expect(() => validateAmountThreshold({ min: 1000000, max: 100 })).toThrow(ValidationError);
    });
  });

  describe('boundary values', () => {
    test('accepts zero min', () => {
      expect(validateAmountThreshold({ min: 0 })).toEqual({ min: 0 });
    });

    test('accepts max at 1 billion', () => {
      expect(validateAmountThreshold({ max: 1000000000 })).toEqual({ max: 1000000000 });
    });

    test('accepts equal min and max', () => {
      const threshold = { min: 100000, max: 100000 };
      expect(validateAmountThreshold(threshold)).toEqual(threshold);
    });
  });
});

describe('validateDateRange', () => {
  describe('happy path', () => {
    test('validates valid date range', () => {
      const range = { start: '2025-01-01', end: '2025-12-31' };
      expect(validateDateRange(range)).toEqual(range);
    });

    test('validates same start and end date', () => {
      const range = { start: '2025-06-15', end: '2025-06-15' };
      expect(validateDateRange(range)).toEqual(range);
    });
  });

  describe('edge cases', () => {
    test('returns null/undefined as-is', () => {
      expect(validateDateRange(null)).toBe(null);
      expect(validateDateRange(undefined)).toBe(undefined);
    });

    test('rejects missing start date', () => {
      expect(() => validateDateRange({ end: '2025-12-31' })).toThrow(ValidationError);
    });

    test('rejects missing end date', () => {
      expect(() => validateDateRange({ start: '2025-01-01' })).toThrow(ValidationError);
    });

    test('rejects start after end', () => {
      expect(() => validateDateRange({ start: '2025-12-31', end: '2025-01-01' })).toThrow(ValidationError);
    });

    test('rejects invalid date format', () => {
      expect(() => validateDateRange({ start: 'not-a-date', end: '2025-12-31' })).toThrow(ValidationError);
    });

    test('rejects range over 2 years', () => {
      expect(() => validateDateRange({ start: '2020-01-01', end: '2025-01-02' })).toThrow(ValidationError);
    });
  });
});

describe('validateStages', () => {
  describe('happy path', () => {
    test('validates valid stages', () => {
      const stages = ['Stage 3 - Pilot', 'Stage 4 - Proposal'];
      expect(validateStages(stages)).toEqual(stages);
    });

    test('validates single stage', () => {
      expect(validateStages(['Closed Won'])).toEqual(['Closed Won']);
    });

    test('validates all valid stages', () => {
      const allStages = [
        'Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SOO',
        'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Closed Won', 'Closed Lost'
      ];
      expect(validateStages(allStages)).toEqual(allStages);
    });
  });

  describe('edge cases', () => {
    test('returns null/undefined as-is', () => {
      expect(validateStages(null)).toBe(null);
      expect(validateStages(undefined)).toBe(undefined);
    });

    test('rejects non-array', () => {
      expect(() => validateStages('Stage 3 - Pilot')).toThrow(ValidationError);
    });

    test('rejects invalid stage name', () => {
      expect(() => validateStages(['Invalid Stage'])).toThrow(ValidationError);
    });

    test('rejects mix of valid and invalid', () => {
      expect(() => validateStages(['Stage 3 - Pilot', 'Bad Stage'])).toThrow(ValidationError);
    });
  });
});

describe('validateRateLimit', () => {
  describe('happy path', () => {
    test('validates valid rate limit', () => {
      expect(validateRateLimit(100, 300)).toEqual({
        limit: 100,
        window: 300,
        action: 'request'
      });
    });

    test('validates with custom action', () => {
      expect(validateRateLimit(50, 120, 'query')).toEqual({
        limit: 50,
        window: 120,
        action: 'query'
      });
    });
  });

  describe('edge cases', () => {
    test('rejects limit less than 1', () => {
      expect(() => validateRateLimit(0, 300)).toThrow(ValidationError);
    });

    test('rejects limit greater than 1000', () => {
      expect(() => validateRateLimit(1001, 300)).toThrow(ValidationError);
    });

    test('rejects window less than 60', () => {
      expect(() => validateRateLimit(100, 30)).toThrow(ValidationError);
    });

    test('rejects window greater than 3600', () => {
      expect(() => validateRateLimit(100, 4000)).toThrow(ValidationError);
    });

    test('rejects non-number limit', () => {
      expect(() => validateRateLimit('100', 300)).toThrow(ValidationError);
    });

    test('rejects non-number window', () => {
      expect(() => validateRateLimit(100, '300')).toThrow(ValidationError);
    });
  });

  describe('boundary values', () => {
    test('accepts limit of 1', () => {
      expect(validateRateLimit(1, 60)).toEqual({ limit: 1, window: 60, action: 'request' });
    });

    test('accepts limit of 1000', () => {
      expect(validateRateLimit(1000, 60)).toEqual({ limit: 1000, window: 60, action: 'request' });
    });

    test('accepts window of 60', () => {
      expect(validateRateLimit(100, 60)).toEqual({ limit: 100, window: 60, action: 'request' });
    });

    test('accepts window of 3600', () => {
      expect(validateRateLimit(100, 3600)).toEqual({ limit: 100, window: 3600, action: 'request' });
    });
  });
});

describe('ValidationError', () => {
  test('creates error with message', () => {
    const error = new ValidationError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ValidationError');
  });

  test('creates error with details', () => {
    const details = [{ field: 'test', message: 'invalid' }];
    const error = new ValidationError('Test error', details);
    expect(error.details).toEqual(details);
  });

  test('is instance of Error', () => {
    const error = new ValidationError('Test');
    expect(error).toBeInstanceOf(Error);
  });
});


