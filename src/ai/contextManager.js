const { cache } = require('../utils/cache');
const logger = require('../utils/logger');

class ContextManager {
  constructor() {
    this.contextTTL = 1800; // 30 minutes default
    this.maxContextHistory = 5; // Keep last 5 interactions
  }

  /**
   * Get conversation context for a user in a channel
   */
  async getContext(userId, channelId) {
    try {
      const context = await cache.getConversationContext(userId, channelId);
      
      if (context) {
        logger.info('📋 Retrieved conversation context', {
          userId,
          channelId,
          hasLastQuery: !!context.lastQuery,
          age: Date.now() - context.timestamp
        });
      }

      return context;
    } catch (error) {
      logger.error('Failed to get conversation context:', error);
      return null;
    }
  }

  /**
   * Update conversation context with new query
   */
  async updateContext(userId, channelId, parsedIntent, queryResult = null) {
    try {
      // Get existing context
      const existingContext = await this.getContext(userId, channelId) || {
        userId,
        channelId,
        history: [],
        preferences: {}
      };

      // Create new query entry
      const queryEntry = {
        intent: parsedIntent.intent,
        entities: parsedIntent.entities,
        originalMessage: parsedIntent.originalMessage,
        timestamp: Date.now(),
        confidence: parsedIntent.confidence,
        resultCount: queryResult?.totalSize || 0
      };

      // Update context
      const updatedContext = {
        ...existingContext,
        lastQuery: queryEntry,
        history: this.addToHistory(existingContext.history || [], queryEntry),
        timestamp: Date.now(),
        pendingRefinement: parsedIntent.followUp || false
      };

      // Store full results for pagination (limit to 100 records for memory)
      if (queryResult && queryResult.records && queryResult.records.length > 0) {
        updatedContext.lastResults = {
          records: queryResult.records.slice(0, 100),
          totalSize: queryResult.totalSize,
          currentPage: 0,
          pageSize: 10
        };
      }

      // Save updated context
      await cache.setConversationContext(userId, channelId, updatedContext, this.contextTTL);

      logger.info('💾 Updated conversation context', {
        userId,
        channelId,
        intent: parsedIntent.intent,
        historyLength: updatedContext.history.length,
        hasResults: !!updatedContext.lastResults
      });

      return updatedContext;

    } catch (error) {
      logger.error('Failed to update conversation context:', error);
      return null;
    }
  }

  /**
   * Get next page of results from context
   */
  async getNextPage(userId, channelId) {
    try {
      const context = await this.getContext(userId, channelId);
      if (!context || !context.lastResults || !context.lastResults.records) {
        return null;
      }

      const { records, currentPage, pageSize, totalSize } = context.lastResults;
      const nextPage = currentPage + 1;
      const startIndex = nextPage * pageSize;
      const endIndex = startIndex + pageSize;

      if (startIndex >= records.length) {
        return null; // No more results
      }

      // Update page in context
      context.lastResults.currentPage = nextPage;
      await cache.setConversationContext(userId, channelId, context, this.contextTTL);

      return {
        records: records.slice(startIndex, endIndex),
        pageNumber: nextPage + 1,
        totalPages: Math.ceil(records.length / pageSize),
        totalSize: totalSize,
        hasMore: endIndex < records.length,
        intent: context.lastQuery?.intent
      };
    } catch (error) {
      logger.error('Failed to get next page:', error);
      return null;
    }
  }

  /**
   * Get all remaining results from context
   */
  async getAllResults(userId, channelId) {
    try {
      const context = await this.getContext(userId, channelId);
      if (!context || !context.lastResults || !context.lastResults.records) {
        return null;
      }

      const { records, currentPage, pageSize, totalSize } = context.lastResults;
      const startIndex = (currentPage + 1) * pageSize;

      if (startIndex >= records.length) {
        return null;
      }

      return {
        records: records.slice(startIndex),
        totalSize: totalSize,
        intent: context.lastQuery?.intent
      };
    } catch (error) {
      logger.error('Failed to get all results:', error);
      return null;
    }
  }

  /**
   * Add query to history with size limit
   */
  addToHistory(history, newQuery) {
    const updated = [...history, newQuery];
    
    // Keep only the most recent entries
    if (updated.length > this.maxContextHistory) {
      return updated.slice(-this.maxContextHistory);
    }
    
    return updated;
  }

  /**
   * Clear conversation context
   */
  async clearContext(userId, channelId) {
    try {
      await cache.clearConversationContext(userId, channelId);
      
      logger.info('🗑️ Cleared conversation context', {
        userId,
        channelId
      });

      return true;
    } catch (error) {
      logger.error('Failed to clear conversation context:', error);
      return false;
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId) {
    try {
      const preferences = await cache.getUserPreferences(userId);
      
      return preferences || {
        defaultLimit: 10,
        preferredCurrency: 'USD',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        notificationsEnabled: true,
        favoriteMetrics: ['Amount', 'StageName', 'CloseDate']
      };
    } catch (error) {
      logger.error('Failed to get user preferences:', error);
      return {};
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const existing = await this.getUserPreferences(userId);
      const updated = { ...existing, ...preferences };
      
      await cache.setUserPreferences(userId, updated);
      
      logger.info('⚙️ Updated user preferences', {
        userId,
        updatedKeys: Object.keys(preferences)
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update user preferences:', error);
      return null;
    }
  }

  /**
   * Analyze conversation patterns for insights
   */
  analyzeConversationPatterns(context) {
    if (!context || !context.history || context.history.length < 2) {
      return null;
    }

    const history = context.history;
    const patterns = {
      commonIntents: {},
      frequentFilters: {},
      timePatterns: {},
      refinementFlow: []
    };

    // Analyze intent patterns
    history.forEach(query => {
      patterns.commonIntents[query.intent] = (patterns.commonIntents[query.intent] || 0) + 1;
      
      // Analyze entity patterns
      if (query.entities) {
        Object.keys(query.entities).forEach(key => {
          if (query.entities[key] !== null && query.entities[key] !== undefined) {
            patterns.frequentFilters[key] = (patterns.frequentFilters[key] || 0) + 1;
          }
        });
      }

      // Analyze time patterns
      const hour = new Date(query.timestamp).getHours();
      const timeSlot = this.getTimeSlot(hour);
      patterns.timePatterns[timeSlot] = (patterns.timePatterns[timeSlot] || 0) + 1;
    });

    // Analyze refinement flow
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      
      if (curr.entities && prev.entities) {
        const refinement = this.detectRefinement(prev.entities, curr.entities);
        if (refinement) {
          patterns.refinementFlow.push(refinement);
        }
      }
    }

    return patterns;
  }

  /**
   * Get time slot for pattern analysis
   */
  getTimeSlot(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Detect refinement type between queries
   */
  detectRefinement(prevEntities, currEntities) {
    const prevKeys = Object.keys(prevEntities);
    const currKeys = Object.keys(currEntities);

    // Check for added filters
    const addedKeys = currKeys.filter(key => !prevKeys.includes(key));
    if (addedKeys.length > 0) {
      return { type: 'filter_add', keys: addedKeys };
    }

    // Check for changed filters
    const changedKeys = currKeys.filter(key => 
      prevKeys.includes(key) && 
      JSON.stringify(prevEntities[key]) !== JSON.stringify(currEntities[key])
    );
    
    if (changedKeys.length > 0) {
      return { type: 'filter_change', keys: changedKeys };
    }

    // Check for removed filters
    const removedKeys = prevKeys.filter(key => !currKeys.includes(key));
    if (removedKeys.length > 0) {
      return { type: 'filter_remove', keys: removedKeys };
    }

    return null;
  }

  /**
   * Generate context-aware suggestions
   */
  generateSuggestions(context, currentIntent) {
    if (!context || !context.history) {
      return this.getDefaultSuggestions(currentIntent);
    }

    const patterns = this.analyzeConversationPatterns(context);
    const suggestions = [];

    // Suggest common refinements
    if (currentIntent === 'pipeline_summary') {
      suggestions.push(
        '• "what accounts are in Stage 2?" - See accounts by stage',
        '• "which opportunities are late stage contracting?" - Filter by product line',
        '• "what deals were added to pipeline this week?" - Recent activity'
      );
    }

    if (currentIntent === 'account_lookup') {
      suggestions.push(
        '• "what use cases is [account] discussing?" - See their product interests',
        '• "what\'s the legal team size at [account]?" - Legal department info',
        '• "who are the decision makers at [account]?" - Key stakeholders'
      );
    }

    if (currentIntent === 'deal_lookup') {
      suggestions.push(
        '• "what closed this month?" - See monthly results',
        '• "how many LOIs have we signed?" - Get booking count',
        '• "what ARR deals have signed last week?" - Recent ARR activity'
      );
    }

    if (currentIntent === 'count_query') {
      suggestions.push(
        '• "what accounts have signed LOIs?" - See customer list',
        '• "how many ARR contracts?" - Contract count',
        '• "average days in Stage 4?" - Pipeline metrics'
      );
    }

    // Add pattern-based suggestions
    if (patterns && patterns.frequentFilters.timeframe) {
      suggestions.push('• "this quarter" - Focus on current quarter');
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Get default suggestions for intent
   */
  getDefaultSuggestions(intent) {
    const suggestions = {
      pipeline_summary: [
        '• "what accounts are in Stage 2?" - See accounts by stage',
        '• "which opportunities are late stage contracting?" - Filter by product',
        '• "what deals were added to pipeline this week?" - Recent additions'
      ],
      account_lookup: [
        '• "what use cases is [this account] discussing?" - Product interests',
        '• "what\'s the legal team size at [this account]?" - Team info',
        '• "who are the decision makers?" - Key stakeholders'
      ],
      deal_lookup: [
        '• "what closed this month?" - Monthly results',
        '• "how many LOIs have we signed?" - Booking count',
        '• "what ARR deals have signed last week?" - ARR activity'
      ],
      count_query: [
        '• "what accounts have signed LOIs?" - Customer list',
        '• "how many ARR contracts?" - Contract count',
        '• "average days in Stage 4?" - Stage metrics'
      ],
      activity_check: [
        '• "what deals were added to pipeline this week?" - New deals',
        '• "what closed this month?" - Recent wins',
        '• "average days in Stage 2?" - Stage duration'
      ]
    };

    return suggestions[intent] || suggestions.pipeline_summary;
  }

  /**
   * Check if context is still valid
   */
  isContextValid(context) {
    if (!context || !context.timestamp) return false;
    
    const age = Date.now() - context.timestamp;
    const maxAge = this.contextTTL * 1000; // Convert to milliseconds
    
    return age < maxAge;
  }

  /**
   * Get context summary for debugging
   */
  getContextSummary(context) {
    if (!context) return 'No context available';

    const summary = {
      age: Math.round((Date.now() - context.timestamp) / 1000 / 60), // minutes
      lastIntent: context.lastQuery?.intent,
      historyCount: context.history?.length || 0,
      pendingRefinement: context.pendingRefinement
    };

    return `Context: ${summary.age}min old, last: ${summary.lastIntent}, history: ${summary.historyCount}, pending: ${summary.pendingRefinement}`;
  }
}

// Export singleton instance
const contextManager = new ContextManager();

module.exports = {
  ContextManager,
  contextManager,
  
  // Convenience methods
  getContext: (userId, channelId) => contextManager.getContext(userId, channelId),
  updateContext: (userId, channelId, parsedIntent, queryResult) => 
    contextManager.updateContext(userId, channelId, parsedIntent, queryResult),
  clearContext: (userId, channelId) => contextManager.clearContext(userId, channelId),
  getUserPreferences: (userId) => contextManager.getUserPreferences(userId),
  updateUserPreferences: (userId, preferences) => 
    contextManager.updateUserPreferences(userId, preferences),
  generateSuggestions: (context, intent) => contextManager.generateSuggestions(context, intent),
  getNextPage: (userId, channelId) => contextManager.getNextPage(userId, channelId),
  getAllResults: (userId, channelId) => contextManager.getAllResults(userId, channelId)
};

