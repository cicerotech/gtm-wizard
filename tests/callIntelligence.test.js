/**
 * callIntelligence.test.js
 * Integration tests for call intelligence service
 */

const { calculateTalkTimeMetrics } = require('../src/services/callIntelligence');

describe('Call Intelligence Service', () => {
  describe('calculateTalkTimeMetrics', () => {
    test('calculates healthy talk ratio', () => {
      const transcript = {
        segments: [
          { speaker: 'rep', startTime: 0, endTime: 30 },
          { speaker: 'customer', startTime: 30, endTime: 70 }
        ]
      };

      const metrics = calculateTalkTimeMetrics(transcript);

      expect(metrics.repTime).toBe(30);
      expect(metrics.customerTime).toBe(40);
      expect(metrics.totalTime).toBe(70);
      expect(metrics.repRatio).toBeCloseTo(0.43, 1);
      expect(metrics.isHealthyRatio).toBe(true);
    });

    test('identifies unhealthy ratio when rep talks too much', () => {
      const transcript = {
        segments: [
          { speaker: 'rep', startTime: 0, endTime: 70 },
          { speaker: 'customer', startTime: 70, endTime: 100 }
        ]
      };

      const metrics = calculateTalkTimeMetrics(transcript);

      expect(metrics.repRatio).toBe(0.7);
      expect(metrics.isHealthyRatio).toBe(false);
    });

    test('identifies unhealthy ratio when rep talks too little', () => {
      const transcript = {
        segments: [
          { speaker: 'rep', startTime: 0, endTime: 20 },
          { speaker: 'customer', startTime: 20, endTime: 100 }
        ]
      };

      const metrics = calculateTalkTimeMetrics(transcript);

      expect(metrics.repRatio).toBe(0.2);
      expect(metrics.isHealthyRatio).toBe(false);
    });

    test('handles empty transcript', () => {
      const transcript = { segments: [] };

      const metrics = calculateTalkTimeMetrics(transcript);

      expect(metrics.totalTime).toBe(1); // Minimum to avoid division by zero
      expect(metrics.repRatio).toBe(0);
    });

    test('handles unknown speaker', () => {
      const transcript = {
        segments: [
          { speaker: 'unknown', startTime: 0, endTime: 60 }
        ]
      };

      const metrics = calculateTalkTimeMetrics(transcript);

      // Unknown speakers don't count toward either ratio
      expect(metrics.repTime).toBe(0);
      expect(metrics.customerTime).toBe(0);
    });
  });
});
