const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { learnFromFeedback } = require('./queryOptimizer');

class FeedbackLearningSystem {
  constructor() {
    this.feedbackEmojis = {
      positive: ['👍', '💯', '📈', '🎯', '✅'],
      negative: ['👎', '❌', '⚠️', '🔄'],
      thankyou: ['🙏', '💖', '🤝', '🌟'],
      learning: ['🧠', '📚', '💡', '🔍']
    };
    
    this.correctionPatterns = [
      /actually.*is/i,
      /should be/i,
      /incorrect.*correct is/i,
      /wrong.*right is/i,
      /not.*but/i,
      /fix.*to/i
    ];

    // Contact-specific feedback patterns for contact enrichment
    this.contactCorrectionPatterns = [
      /that'?s not (?:the right|correct) person/i,
      /wrong contact/i,
      /different (?:person|contact)/i,
      /actually.*?is (.+?) at/i,
      /not (?:him|her|them)/i,
      /wrong (?:number|email|phone)/i,
      /that'?s (?:someone else|the wrong person)/i
    ];

    // Contact-specific positive indicators
    this.contactPositivePatterns = [
      /that'?s (?:the one|correct|right|them|him|her)/i,
      /found (?:them|him|her)/i,
      /perfect,? that'?s/i,
      /yes,? that'?s/i,
      /got it/i
    ];
  }

  /**
   * Process user feedback and learn from it
   */
  async processFeedback(message, originalQuery, queryResult, userId, client, channelId, messageTs) {
    try {
      const feedback = this.analyzeFeedback(message);
      const queryHash = this.generateQueryHash(originalQuery);

      // Learn from the feedback
      await learnFromFeedback(queryHash, feedback, userId);

      // Store feedback context
      await this.storeFeedbackContext(queryHash, feedback, originalQuery, queryResult, userId);

      // Respond with appropriate emoji
      await this.respondWithEmoji(feedback, client, channelId, messageTs);

      // If it's a correction, try to learn the pattern
      if (feedback.type === 'correction') {
        await this.learnFromCorrection(feedback, originalQuery, userId);
      }

      logger.info('🎓 Processed user feedback', {
        userId,
        feedbackType: feedback.type,
        hasCorrection: !!feedback.correction,
        queryHash
      });

      return feedback;

    } catch (error) {
      logger.error('Error processing feedback:', error);
      return null;
    }
  }

  /**
   * Analyze user message to determine feedback type
   */
  analyzeFeedback(message) {
    const lowerMessage = message.toLowerCase();
    
    // Positive feedback indicators
    const positiveIndicators = [
      'thank', 'thanks', 'perfect', 'great', 'awesome', 'excellent',
      'correct', 'right', 'good', 'helpful', 'exactly', 'spot on'
    ];

    // Negative feedback indicators
    const negativeIndicators = [
      'wrong', 'incorrect', 'not right', 'mistake', 'error', 'bad',
      'unhelpful', 'useless', 'broken', 'doesn\'t work'
    ];

    // Correction indicators
    const correctionIndicators = [
      'actually', 'should be', 'meant to', 'supposed to be',
      'correct answer is', 'right answer is'
    ];

    const feedback = {
      type: 'neutral',
      confidence: 0,
      correction: null,
      originalMessage: message
    };

    // Check for corrections first
    for (const pattern of this.correctionPatterns) {
      if (pattern.test(message)) {
        feedback.type = 'correction';
        feedback.confidence = 0.9;
        feedback.correction = this.extractCorrection(message);
        return feedback;
      }
    }

    // Check for positive feedback
    const positiveMatches = positiveIndicators.filter(indicator => 
      lowerMessage.includes(indicator)
    );

    // Check for negative feedback
    const negativeMatches = negativeIndicators.filter(indicator => 
      lowerMessage.includes(indicator)
    );

    if (positiveMatches.length > negativeMatches.length) {
      feedback.type = 'positive';
      feedback.confidence = Math.min(0.9, positiveMatches.length * 0.3);
    } else if (negativeMatches.length > positiveMatches.length) {
      feedback.type = 'negative';
      feedback.confidence = Math.min(0.9, negativeMatches.length * 0.3);
    }

    return feedback;
  }

  /**
   * Extract correction from user message
   */
  extractCorrection(message) {
    try {
      // Look for patterns like "should be X" or "actually it's Y"
      const patterns = [
        /should be (.+)/i,
        /actually (.+)/i,
        /correct answer is (.+)/i,
        /right answer is (.+)/i,
        /it's (.+)/i,
        /not .+ but (.+)/i
      ];

      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }

      return null;
    } catch (error) {
      logger.error('Error extracting correction:', error);
      return null;
    }
  }

  /**
   * Analyze contact-specific feedback
   * Used by contact enrichment to learn from user reactions
   * @param {string} message - User's feedback message
   * @param {Object} lookupContext - Original lookup context
   * @returns {Object} - { type: 'positive'|'negative'|'correction', isContactFeedback: boolean }
   */
  analyzeContactFeedback(message, lookupContext = null) {
    const lowerMessage = message.toLowerCase();
    
    const feedback = {
      type: 'neutral',
      isContactFeedback: false,
      confidence: 0,
      correction: null
    };

    // Check for contact-specific corrections first (highest priority)
    for (const pattern of this.contactCorrectionPatterns) {
      if (pattern.test(message)) {
        feedback.type = 'negative';
        feedback.isContactFeedback = true;
        feedback.confidence = 0.9;
        
        // Try to extract what they're correcting to
        const correctionMatch = message.match(/actually.*?is (.+?) at/i);
        if (correctionMatch) {
          feedback.correction = correctionMatch[1].trim();
        }
        
        return feedback;
      }
    }

    // Check for contact-specific positive patterns
    for (const pattern of this.contactPositivePatterns) {
      if (pattern.test(message)) {
        feedback.type = 'positive';
        feedback.isContactFeedback = true;
        feedback.confidence = 0.85;
        return feedback;
      }
    }

    // Fall back to generic feedback analysis
    return this.analyzeFeedback(message);
  }

  /**
   * Check if a message is contact-related feedback
   * @param {string} message - User message
   * @param {Object} conversationContext - Context with lastQuery info
   * @returns {boolean}
   */
  isContactFeedbackMessage(message, conversationContext) {
    if (!conversationContext) return false;

    // Check if last interaction was a contact lookup
    const lastQuery = conversationContext.lastQuery;
    if (!lastQuery || lastQuery.type !== 'contact_lookup') {
      return false;
    }

    // Check time window (feedback within 2 minutes of lookup)
    const timeSinceQuery = Date.now() - (lastQuery.timestamp || 0);
    if (timeSinceQuery > 2 * 60 * 1000) {
      return false;
    }

    // Check for contact-specific patterns
    const lowerMessage = message.toLowerCase();
    
    const contactKeywords = [
      'person', 'contact', 'them', 'him', 'her', 'number', 'phone', 'email',
      'correct', 'wrong', 'right', 'different', 'that\'s'
    ];

    return contactKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Respond with appropriate emoji based on feedback
   */
  async respondWithEmoji(feedback, client, channelId, messageTs) {
    try {
      let emoji;
      
      switch (feedback.type) {
        case 'positive':
          emoji = this.getRandomEmoji('positive');
          break;
        case 'negative':
          emoji = this.getRandomEmoji('negative');
          break;
        case 'correction':
          emoji = this.getRandomEmoji('learning');
          break;
        default:
          return; // No emoji for neutral feedback
      }

      // Add emoji reaction to the user's message
      await client.reactions.add({
        channel: channelId,
        timestamp: messageTs,
        name: emoji.replace(/:/g, '') // Remove colons if present
      });

      // For corrections, also send a thank you emoji
      if (feedback.type === 'correction') {
        setTimeout(async () => {
          const thankYouEmoji = this.getRandomEmoji('thankyou');
          await client.reactions.add({
            channel: channelId,
            timestamp: messageTs,
            name: thankYouEmoji.replace(/:/g, '')
          });
        }, 1000);
      }

    } catch (error) {
      logger.error('Error responding with emoji:', error);
      // Try with a simple thumbs up if the specific emoji fails
      try {
        await client.reactions.add({
          channel: channelId,
          timestamp: messageTs,
          name: '+1'
        });
      } catch (fallbackError) {
        logger.error('Fallback emoji also failed:', fallbackError);
      }
    }
  }

  /**
   * Get random emoji from category
   */
  getRandomEmoji(category) {
    const emojis = this.feedbackEmojis[category] || this.feedbackEmojis.positive;
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  /**
   * Store feedback context for learning
   */
  async storeFeedbackContext(queryHash, feedback, originalQuery, queryResult, userId) {
    try {
      const contextKey = `feedback_context:${queryHash}:${Date.now()}`;
      
      const context = {
        queryHash,
        feedback,
        originalQuery,
        resultCount: queryResult?.totalSize || 0,
        userId,
        timestamp: Date.now()
      };

      await cache.set(contextKey, context, 86400 * 7); // Store for 7 days

    } catch (error) {
      logger.error('Error storing feedback context:', error);
    }
  }

  /**
   * Learn from user corrections
   */
  async learnFromCorrection(feedback, originalQuery, userId) {
    try {
      if (!feedback.correction) return;

      const correctionKey = `correction:${this.generateQueryHash(originalQuery)}`;
      const existingCorrections = await cache.get(correctionKey) || [];

      const newCorrection = {
        correction: feedback.correction,
        userId,
        timestamp: Date.now(),
        originalQuery
      };

      existingCorrections.push(newCorrection);

      // Keep only the last 10 corrections per query
      const recentCorrections = existingCorrections.slice(-10);

      await cache.set(correctionKey, recentCorrections, 86400 * 30); // 30 days

      // Look for patterns in corrections
      await this.identifyCorrectionPatterns(recentCorrections);

      logger.info('📝 Learned from correction', {
        correction: feedback.correction,
        userId,
        totalCorrections: recentCorrections.length
      });

    } catch (error) {
      logger.error('Error learning from correction:', error);
    }
  }

  /**
   * Identify patterns in corrections for future improvements
   */
  async identifyCorrectionPatterns(corrections) {
    try {
      if (corrections.length < 3) return;

      // Group corrections by similarity
      const patterns = {};
      
      corrections.forEach(correction => {
        const key = this.normalizeCorrection(correction.correction);
        if (!patterns[key]) {
          patterns[key] = [];
        }
        patterns[key].push(correction);
      });

      // Find common correction patterns
      const commonPatterns = Object.entries(patterns)
        .filter(([key, corrections]) => corrections.length >= 2)
        .map(([key, corrections]) => ({
          pattern: key,
          frequency: corrections.length,
          corrections
        }));

      if (commonPatterns.length > 0) {
        await cache.set('correction_patterns', commonPatterns, 86400 * 30);
        
        logger.info('🔍 Identified correction patterns', {
          patternCount: commonPatterns.length,
          totalCorrections: corrections.length
        });
      }

    } catch (error) {
      logger.error('Error identifying correction patterns:', error);
    }
  }

  /**
   * Normalize correction for pattern matching
   */
  normalizeCorrection(correction) {
    return correction
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate hash for query identification
   */
  generateQueryHash(query) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query).digest('hex');
  }

  /**
   * Check if message is likely feedback
   */
  isFeedbackMessage(message, conversationContext) {
    // Check if this is a follow-up to a bot response
    if (!conversationContext || !conversationContext.lastQuery) {
      return false;
    }

    // Check time since last query (feedback usually comes within 5 minutes)
    const timeSinceLastQuery = Date.now() - conversationContext.lastQuery.timestamp;
    if (timeSinceLastQuery > 5 * 60 * 1000) { // 5 minutes
      return false;
    }

    const lowerMessage = message.toLowerCase();
    
    // Don't treat as feedback if it looks like a new query (contains question words + query terms)
    const queryIndicators = ['what', 'which', 'who', 'how', 'show', 'list', 'get', 'find'];
    const containsQueryIndicator = queryIndicators.some(q => lowerMessage.startsWith(q) || lowerMessage.includes(q + ' '));
    if (containsQueryIndicator) {
      return false;
    }
    
    // Feedback indicators - use word boundaries to avoid false positives
    // e.g. "rights" should not match "right"
    const feedbackPatterns = [
      /\bthank(s|you)?\b/,
      /\bwrong\b/,
      /\bcorrect\b/,
      /\bthat'?s right\b/,
      /\bgood job\b/,
      /\bhelpful\b/,
      /\bnot helpful\b/,
      /\bperfect\b/,
      /\bexactly\b/,
      /\bactually\b/,
      /\bshould be\b/,
      /\bsupposed to\b/,
      /\bmeant to\b/,
      /\berror\b/,
      /\bmistake\b/,
      /^(yes|no|yep|nope|yeah|nah)$/i,  // Single word affirmations
      /^great$/i,
      /^awesome$/i,
      /^nice$/i
    ];

    return feedbackPatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStats(timeRange = 86400000) { // 24 hours default
    try {
      // This would typically aggregate from your cache/database
      return {
        totalFeedback: 0,
        positiveFeedback: 0,
        negativeFeedback: 0,
        corrections: 0,
        learningRate: 0,
        topCorrections: []
      };
    } catch (error) {
      logger.error('Error getting feedback stats:', error);
      return {};
    }
  }

  /**
   * Apply learned corrections to new queries
   */
  async applyCorrectionLearning(query, entities, intent) {
    try {
      const correctionPatterns = await cache.get('correction_patterns') || [];
      
      // Look for applicable corrections
      const applicableCorrections = correctionPatterns.filter(pattern => {
        // Simple matching - in a real system you'd use more sophisticated NLP
        return query.toLowerCase().includes(pattern.pattern);
      });

      if (applicableCorrections.length > 0) {
        logger.info('🎯 Applying learned corrections', {
          query,
          corrections: applicableCorrections.length
        });

        // Return suggestions for query improvement
        return {
          hasSuggestions: true,
          suggestions: applicableCorrections.map(correction => ({
            pattern: correction.pattern,
            frequency: correction.frequency,
            suggestion: `Based on previous feedback, you might want to consider: ${correction.pattern}`
          }))
        };
      }

      return { hasSuggestions: false };

    } catch (error) {
      logger.error('Error applying correction learning:', error);
      return { hasSuggestions: false };
    }
  }
}

// Export singleton instance
const feedbackLearning = new FeedbackLearningSystem();

module.exports = {
  FeedbackLearningSystem,
  feedbackLearning,
  
  // Convenience methods
  processFeedback: (message, originalQuery, queryResult, userId, client, channelId, messageTs) =>
    feedbackLearning.processFeedback(message, originalQuery, queryResult, userId, client, channelId, messageTs),
  isFeedbackMessage: (message, conversationContext) =>
    feedbackLearning.isFeedbackMessage(message, conversationContext),
  applyCorrectionLearning: (query, entities, intent) =>
    feedbackLearning.applyCorrectionLearning(query, entities, intent),
  
  // Contact-specific feedback methods
  analyzeContactFeedback: (message, lookupContext) =>
    feedbackLearning.analyzeContactFeedback(message, lookupContext),
  isContactFeedbackMessage: (message, conversationContext) =>
    feedbackLearning.isContactFeedbackMessage(message, conversationContext)
};

