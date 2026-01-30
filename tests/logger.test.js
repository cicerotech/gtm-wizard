/**
 * logger.test.js
 * Tests for structured logging utilities
 */

const {
  generateCorrelationId,
  setCorrelationId,
  getCorrelationId
} = require('../src/utils/logger');

describe('Logger Utilities', () => {
  describe('generateCorrelationId', () => {
    test('generates unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });

    test('correlation ID has expected format', () => {
      const id = generateCorrelationId();

      // Format: timestamp-randomString
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    test('correlation ID contains timestamp', () => {
      const before = Date.now();
      const id = generateCorrelationId();
      const after = Date.now();

      const timestamp = parseInt(id.split('-')[0]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('setCorrelationId and getCorrelationId', () => {
    test('can set and retrieve correlation ID', () => {
      const testId = 'test-correlation-123';
      setCorrelationId(testId);

      expect(getCorrelationId()).toBe(testId);
    });

    test('getCorrelationId generates new ID if none set', () => {
      setCorrelationId(null);
      const id = getCorrelationId();

      expect(id).toBeTruthy();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });
});
