/**
 * intelligence.js
 * 
 * API routes for GTM Brain intelligence queries.
 * Handles natural language queries, vector search, and intelligence stats.
 * 
 * Extracted from app.js as part of modular monolith refactoring.
 * These routes can be mounted at /api/intelligence in app.js.
 * 
 * @author GTM Brain
 * @date February 2026
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE QUERY
// Natural language queries about accounts, deals, and pipeline.
// Backend: intelligenceQueryService.js (Claude AI + Salesforce context)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/query', async (req, res) => {
  try {
    const { 
      query,          // The user's natural language question
      accountId,      // Optional: Focus on a specific account
      accountName,    // Optional: Account name for context
      userEmail,      // User's email for context
      forceRefresh,   // Optional: Skip in-memory cache for fresh data
      sessionId       // Optional: Conversation session ID for multi-turn
    } = req.body;
    
    const intelligenceQueryService = require('../services/intelligenceQueryService');
    
    const result = await intelligenceQueryService.processQuery({
      query,
      accountId,
      accountName,
      userEmail,
      forceRefresh: !!forceRefresh,
      sessionId: sessionId || undefined
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error === 'Query is required' ? 400 : 500).json(result);
    }
    
  } catch (error) {
    logger.error('Intelligence query error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process intelligence query',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VECTOR SEARCH
// Semantic search across meeting notes, account context, and intelligence.
// Requires ENABLE_VECTOR_SEARCH=true
// ═══════════════════════════════════════════════════════════════════════════
router.post('/vector-search', async (req, res) => {
  try {
    const vectorSearchService = require('../services/vectorSearchService');
    if (!vectorSearchService.isHealthy()) {
      return res.status(503).json({ success: false, error: 'Vector search not enabled or not healthy' });
    }
    const { query, accountId, limit, sourceType } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
    
    const results = await vectorSearchService.search(query, { accountId, limit: limit || 5, sourceType });
    res.json({ success: true, results, count: results.length });
  } catch (error) {
    logger.error('Vector search error:', error);
    res.status(500).json({ success: false, error: 'Vector search failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VECTOR STATS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/vector-stats', async (req, res) => {
  try {
    const vectorSearchService = require('../services/vectorSearchService');
    res.json({ success: true, stats: vectorSearchService.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Stats not available' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
router.get('/health', async (req, res) => {
  try {
    const intelligenceQueryService = require('../services/intelligenceQueryService');
    const vectorSearchService = require('../services/vectorSearchService');
    
    res.json({
      success: true,
      intelligence: {
        healthy: intelligenceQueryService.isHealthy(),
      },
      vectorSearch: vectorSearchService.getStats(),
      features: {
        multiTurn: process.env.ENABLE_MULTI_TURN !== 'false',
        advancedIntents: process.env.USE_ADVANCED_INTENTS !== 'false',
        vectorSearch: process.env.ENABLE_VECTOR_SEARCH === 'true'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Health check failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER FEEDBACK
// Collect thumbs up/down ratings on responses to identify failure patterns
// ═══════════════════════════════════════════════════════════════════════════
router.post('/feedback', async (req, res) => {
  try {
    const feedbackService = require('../services/feedbackService');
    const { query, answerSnippet, accountName, accountId, userEmail, sessionId, rating, comment } = req.body;
    
    if (!rating || !['helpful', 'not_helpful'].includes(rating)) {
      return res.status(400).json({ success: false, error: 'Rating must be "helpful" or "not_helpful"' });
    }

    const id = feedbackService.submitFeedback({
      query, answerSnippet, accountName, accountId, userEmail, sessionId, rating, comment
    });

    res.json({ success: true, feedbackId: id });
  } catch (error) {
    logger.error('Feedback submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

router.get('/feedback/summary', async (req, res) => {
  try {
    const feedbackService = require('../services/feedbackService');
    res.json({ success: true, summary: feedbackService.getSummary() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get feedback summary' });
  }
});

module.exports = router;
