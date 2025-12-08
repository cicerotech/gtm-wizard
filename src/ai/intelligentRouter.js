/**
 * Intelligent Intent Router
 * Combines 3 approaches: Pattern matching, Semantic similarity, Neural network
 * Creates ensemble prediction with confidence voting
 * 
 * Addresses criticism: "Basic NLP: String matching is 1990s tech"
 * Now uses: Traditional patterns + Embeddings + Custom ML model
 */

const semanticMatcher = require('./semanticMatcher');
const intentClassifier = require('../ml/intentClassifier');
const logger = require('../observability/logger');
const { tracker } = require('../analytics/usageTracker');
const queryPatterns = require('../config/queryPatterns.json');

class IntelligentRouter {
  constructor() {
    this.approaches = {
      pattern: { weight: 0.3, enabled: true },
      semantic: { weight: 0.35, enabled: true },
      neuralNet: { weight: 0.35, enabled: true }
    };
    
    this.confidenceThreshold = 0.6;
    this.feedbackData = [];
  }

  /**
   * Route query using ensemble of all three approaches
   */
  async route(query, userId, context = {}) {
    const startTime = Date.now();
    const results = {
      pattern: null,
      semantic: null,
      neuralNet: null
    };

    try {
      // Approach 1: Traditional pattern matching (fallback)
      if (this.approaches.pattern.enabled) {
        results.pattern = this.patternMatch(query);
      }

      // Approach 2: Semantic similarity with embeddings
      if (this.approaches.semantic.enabled) {
        results.semantic = await semanticMatcher.matchQuery(query);
      }

      // Approach 3: Neural network classifier
      if (this.approaches.neuralNet.enabled) {
        results.neuralNet = intentClassifier.predict(query);
      }

      // Ensemble prediction with confidence voting
      const ensemble = this.ensemblePredict(results);
      
      const responseTime = Date.now() - startTime;
      
      // Track analytics
      tracker.trackQuery({
        userId,
        query,
        intent: ensemble.intent,
        success: ensemble.intent !== 'unknown',
        responseTime,
        confidence: ensemble.confidence,
        method: ensemble.winningMethod,
        metadata: {
          patternMatch: results.pattern?.confidence,
          semanticMatch: results.semantic?.confidence,
          neuralNetMatch: results.neuralNet?.confidence
        }
      });

      // Structured logging
      logger.logQuery({
        userId,
        intent: ensemble.intent,
        success: ensemble.intent !== 'unknown',
        durationMs: responseTime,
        method: ensemble.winningMethod,
        confidence: ensemble.confidence,
        cacheHit: false,
        salesforceApiCalls: 0
      });

      return {
        ...ensemble,
        responseTime,
        allResults: results,
        query
      };

    } catch (error) {
      logger.error('Intent routing failed', error, { query, userId });
      tracker.trackQuery({
        userId,
        query,
        intent: 'error',
        success: false,
        responseTime: Date.now() - startTime,
        error
      });
      
      throw error;
    }
  }

  /**
   * Traditional pattern matching (existing approach)
   */
  patternMatch(query) {
    const lowerQuery = query.toLowerCase();
    
    // Simple pattern matching logic
    for (const pattern of queryPatterns.patterns) {
      for (const p of pattern.patterns) {
        const regex = this.patternToRegex(p);
        if (regex.test(lowerQuery)) {
          return {
            intent: pattern.intent,
            confidence: 0.95, // High confidence for exact pattern match
            method: 'pattern_matching',
            matchedPattern: p
          };
        }
      }
    }
    
    return {
      intent: 'unknown',
      confidence: 0.0,
      method: 'pattern_matching'
    };
  }

  /**
   * Convert pattern template to regex
   */
  patternToRegex(pattern) {
    // Replace placeholders FIRST (before escaping special chars)
    let processed = pattern
      .replace(/\{company\}/g, '__COMPANY__')
      .replace(/\{product\}/g, '__PRODUCT__')
      .replace(/\{month\}/g, '__MONTH__')
      .replace(/\{name\}/g, '__NAME__')
      .replace(/\{details\}/g, '__DETAILS__');
    
    // Then escape special characters
    processed = processed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Finally replace our placeholders with regex patterns
    processed = processed
      .replace(/__COMPANY__/g, '\\w+')
      .replace(/__PRODUCT__/g, '\\w+')
      .replace(/__MONTH__/g, '\\w+')
      .replace(/__NAME__/g, '\\w+')
      .replace(/__DETAILS__/g, '.+');
    
    return new RegExp(processed, 'i');
  }

  /**
   * Ensemble prediction using weighted voting
   */
  ensemblePredict(results) {
    const votes = new Map();
    let maxConfidence = 0;
    let winningMethod = 'ensemble';

    // Collect weighted votes and track max individual confidence
    if (results.pattern && results.pattern.intent !== 'unknown') {
      const weight = this.approaches.pattern.weight * results.pattern.confidence;
      votes.set(results.pattern.intent, (votes.get(results.pattern.intent) || 0) + weight);
      if (results.pattern.confidence > maxConfidence) {
        maxConfidence = results.pattern.confidence;
        winningMethod = 'pattern_matching';
      }
    }

    if (results.semantic && results.semantic.intent !== 'unknown') {
      const weight = this.approaches.semantic.weight * results.semantic.confidence;
      votes.set(results.semantic.intent, (votes.get(results.semantic.intent) || 0) + weight);
      if (results.semantic.confidence > maxConfidence) {
        maxConfidence = results.semantic.confidence;
        winningMethod = 'semantic';
      }
    }

    if (results.neuralNet && results.neuralNet.intent !== 'unknown') {
      const weight = this.approaches.neuralNet.weight * results.neuralNet.confidence;
      votes.set(results.neuralNet.intent, (votes.get(results.neuralNet.intent) || 0) + weight);
      if (results.neuralNet.confidence > maxConfidence) {
        maxConfidence = results.neuralNet.confidence;
        winningMethod = 'neural_network';
      }
    }

    // No votes = unknown
    if (votes.size === 0) {
      return {
        intent: 'unknown',
        confidence: 0.0,
        winningMethod: 'none',
        alternatives: []
      };
    }

    // Find winner by vote weight
    let topIntent = 'unknown';
    let topScore = 0;
    const alternatives = [];

    for (const [intent, score] of votes.entries()) {
      if (score > topScore) {
        if (topIntent !== 'unknown') {
          alternatives.push({ intent: topIntent, confidence: topScore });
        }
        topIntent = intent;
        topScore = score;
      } else {
        alternatives.push({ intent, confidence: score });
      }
    }

    // Sort alternatives by confidence
    alternatives.sort((a, b) => b.confidence - a.confidence);

    // Use max individual confidence as ensemble confidence (not normalized)
    // This ensures low-confidence unanimous votes still return unknown
    const ensembleConfidence = maxConfidence;

    return {
      intent: ensembleConfidence >= this.confidenceThreshold ? topIntent : 'unknown',
      confidence: ensembleConfidence,
      winningMethod: ensembleConfidence >= this.confidenceThreshold ? winningMethod : 'none',
      alternatives: alternatives.slice(0, 3),
      votingDetails: Object.fromEntries(votes)
    };
  }

  /**
   * Learn from user feedback (data flywheel)
   */
  async learnFromFeedback(query, predictedIntent, actualIntent, wasCorrect) {
    this.feedbackData.push({
      timestamp: new Date(),
      query,
      predictedIntent,
      actualIntent,
      wasCorrect
    });

    // Log for training data collection
    logger.info('User feedback received', {
      type: 'model_feedback',
      query: query.substring(0, 100),
      predicted: predictedIntent,
      actual: actualIntent,
      correct: wasCorrect
    });

    // If we have enough feedback, retrain
    if (this.feedbackData.length >= 50) {
      await this.retrainModels();
    }

    // Update semantic matcher
    await semanticMatcher.learnFromFeedback(query, actualIntent, wasCorrect);
  }

  /**
   * Retrain models with accumulated feedback
   */
  async retrainModels() {
    logger.info('Retraining models with feedback data', {
      feedbackSamples: this.feedbackData.length
    });

    // Prepare training data from feedback
    const trainingData = this.feedbackData
      .filter(f => f.wasCorrect) // Only learn from correct classifications
      .map(f => ({
        query: f.query,
        intent: f.actualIntent
      }));

    // Retrain neural network
    intentClassifier.retrain(trainingData);

    // Clear feedback buffer
    this.feedbackData = [];

    logger.info('Model retraining complete');
  }

  /**
   * Get router statistics
   */
  getStats() {
    const analyticsStats = tracker.getStats();
    const mlModelInfo = intentClassifier.getModelInfo();
    const semanticMetrics = semanticMatcher.getMetrics();

    return {
      analytics: analyticsStats,
      mlModel: mlModelInfo,
      semantic: semanticMetrics,
      router: {
        approaches: this.approaches,
        confidenceThreshold: this.confidenceThreshold,
        feedbackBufferSize: this.feedbackData.length
      }
    };
  }

  /**
   * Health check for all components
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      components: {}
    };

    // Check logger
    health.components.logger = logger.healthCheck();

    // Check analytics
    health.components.analytics = {
      status: tracker.metrics.queryCount > 0 ? 'healthy' : 'no_data',
      totalQueries: tracker.metrics.queryCount
    };

    // Check ML model
    const mlModelInfo = intentClassifier.getModelInfo();
    health.components.mlModel = {
      status: intentClassifier.trainingHistory.length > 0 ? 'trained' : 'not_trained',
      accuracy: mlModelInfo.performance?.finalAccuracy
    };

    // Check semantic matcher
    health.components.semantic = {
      status: 'healthy',
      cacheSize: semanticMatcher.embeddingCache.size
    };

    // Overall status
    const allHealthy = Object.values(health.components).every(c => 
      c.status === 'healthy' || c.status === 'trained' || c.status === 'no_data'
    );
    health.status = allHealthy ? 'healthy' : 'degraded';

    return health;
  }
}

module.exports = new IntelligentRouter();

