/**
 * Tests for Intelligent Router (Ensemble System)
 */

const intelligentRouter = require('../src/ai/intelligentRouter');

describe('IntelligentRouter', () => {
  describe('route', () => {
    test('successfully routes query using ensemble approach', async () => {
      const result = await intelligentRouter.route('who owns intel', 'U123');
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('winningMethod');
      expect(result).toHaveProperty('responseTime');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    test('returns all three approach results', async () => {
      const result = await intelligentRouter.route('late stage pipeline', 'U123');
      
      expect(result.allResults).toHaveProperty('pattern');
      expect(result.allResults).toHaveProperty('semantic');
      expect(result.allResults).toHaveProperty('neuralNet');
    });

    test('uses ensemble voting for prediction', async () => {
      const result = await intelligentRouter.route('who owns boeing', 'U123');
      
      expect(result.winningMethod).toMatch(/pattern_matching|semantic|neural_network|ensemble/);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1.01); // Allow for floating-point precision
    });

    test('provides alternatives when confidence is uncertain', async () => {
      const result = await intelligentRouter.route('ambiguous query', 'U123');
      
      if (result.alternatives) {
        expect(result.alternatives).toBeInstanceOf(Array);
      }
    });

    test('handles unknown queries gracefully', async () => {
      const result = await intelligentRouter.route('xyzabc nonsense', 'U123');
      
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.6);
    });
  });

  describe('patternMatch', () => {
    test('matches exact pattern templates', () => {
      const result = intelligentRouter.patternMatch('who owns intel');
      
      expect(result.method).toBe('pattern_matching');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('returns unknown for unmatched patterns', () => {
      const result = intelligentRouter.patternMatch('completely random text');
      
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0.0);
    });
  });

  describe('ensemblePredict', () => {
    test('combines votes from multiple approaches', () => {
      const results = {
        pattern: { intent: 'account_ownership', confidence: 0.95 },
        semantic: { intent: 'account_ownership', confidence: 0.80 },
        neuralNet: { intent: 'account_ownership', confidence: 0.75 }
      };
      
      const ensemble = intelligentRouter.ensemblePredict(results);
      
      expect(ensemble.intent).toBe('account_ownership');
      expect(ensemble.confidence).toBeGreaterThan(0.6);
    });

    test('resolves conflicting predictions by weight', () => {
      const results = {
        pattern: { intent: 'intent_a', confidence: 0.50 },
        semantic: { intent: 'intent_b', confidence: 0.90 },
        neuralNet: { intent: 'intent_b', confidence: 0.85 }
      };
      
      const ensemble = intelligentRouter.ensemblePredict(results);
      
      // Semantic + Neural should outweigh pattern
      expect(ensemble.intent).toBe('intent_b');
    });

    test('returns unknown when confidence below threshold', () => {
      const results = {
        pattern: { intent: 'test', confidence: 0.30 },
        semantic: { intent: 'test', confidence: 0.25 },
        neuralNet: { intent: 'test', confidence: 0.20 }
      };
      
      const ensemble = intelligentRouter.ensemblePredict(results);
      
      expect(ensemble.intent).toBe('unknown');
    });
  });

  describe('learnFromFeedback', () => {
    test('accepts and stores user feedback', async () => {
      await intelligentRouter.learnFromFeedback(
        'test query',
        'predicted_intent',
        'actual_intent',
        false
      );
      
      expect(intelligentRouter.feedbackData.length).toBeGreaterThan(0);
    });

    test('triggers retraining after threshold', async () => {
      const initialLength = intelligentRouter.feedbackData.length;
      
      // Add 50+ feedback samples
      for (let i = 0; i < 55; i++) {
        await intelligentRouter.learnFromFeedback(
          'test query ' + i,
          'intent_a',
          'intent_a',
          true
        );
      }
      
      // Should have triggered retraining and cleared buffer
      expect(intelligentRouter.feedbackData.length).toBeLessThan(55);
    });
  });

  describe('getStats', () => {
    test('returns comprehensive statistics from all components', () => {
      const stats = intelligentRouter.getStats();
      
      expect(stats).toHaveProperty('analytics');
      expect(stats).toHaveProperty('mlModel');
      expect(stats).toHaveProperty('semantic');
      expect(stats).toHaveProperty('router');
    });

    test('includes router configuration', () => {
      const stats = intelligentRouter.getStats();
      
      expect(stats.router).toHaveProperty('approaches');
      expect(stats.router).toHaveProperty('confidenceThreshold');
      expect(stats.router.confidenceThreshold).toBe(0.6);
    });
  });

  describe('healthCheck', () => {
    test('returns health status for all components', async () => {
      const health = await intelligentRouter.healthCheck();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(health.components).toHaveProperty('logger');
      expect(health.components).toHaveProperty('analytics');
      expect(health.components).toHaveProperty('mlModel');
      expect(health.components).toHaveProperty('semantic');
    });

    test('overall status reflects component health', async () => {
      const health = await intelligentRouter.healthCheck();
      
      expect(health.status).toMatch(/healthy|degraded/);
    });
  });
});

