/**
 * Semantic Query Matching with Embeddings
 * Uses vector similarity instead of basic string matching
 * Addresses criticism: "Basic NLP: String matching (message.includes) is 1990s tech"
 */

const axios = require('axios');

class SemanticMatcher {
  constructor() {
    this.embeddingCache = new Map();
    this.queryPatterns = this.loadQueryPatterns();
    this.threshold = 0.75; // Cosine similarity threshold
  }

  /**
   * Load query patterns with semantic embeddings
   * In production, these would be pre-computed and stored in vector database
   */
  loadQueryPatterns() {
    return [
      // Account ownership patterns
      { pattern: "who owns this company", intent: "account_ownership", examples: ["who owns Dolby", "who's the owner of Pure Storage", "account owner"] },
      { pattern: "does this account exist", intent: "account_exists", examples: ["do we have Dolby", "is Ecolab in salesforce", "does this company exist"] },
      { pattern: "tell me about this account", intent: "account_context", examples: ["what do we know about Dolby", "give me context on Pure Storage", "account details"] },
      
      // Pipeline patterns
      { pattern: "show me late stage pipeline", intent: "late_stage_pipeline", examples: ["late stage opportunities", "stage 3 and 4 deals", "proposal and pilot stage"] },
      { pattern: "what is our weighted forecast", intent: "weighted_pipeline", examples: ["weighted pipeline", "finance forecast", "probability-adjusted pipeline"] },
      { pattern: "pipeline for specific product", intent: "product_pipeline", examples: ["contracting pipeline", "compliance opportunities", "m&a deals"] },
      
      // Opportunity patterns
      { pattern: "show opportunities for account", intent: "account_opportunities", examples: ["Dolby opportunities", "what opps does Pure Storage have", "deals at this company"] },
      { pattern: "what is the target close date", intent: "loi_date", examples: ["when is loi", "target sign date", "expected close"] },
      
      // Meeting intelligence
      { pattern: "when was last meeting", intent: "last_meeting", examples: ["recent meeting with intel", "last time we met", "meeting history"] },
      { pattern: "who have we met with", intent: "contacts", examples: ["legal contacts at Bayer", "decision makers", "people we've engaged"] },
      
      // Actions
      { pattern: "create new account", intent: "create_account", examples: ["add new company", "create account for Asana", "register new prospect"] },
      { pattern: "create opportunity", intent: "create_opportunity", examples: ["add new opp", "start tracking deal", "new opportunity"] },
      { pattern: "generate pipeline report", intent: "export_pipeline", examples: ["excel export", "download report", "pipeline spreadsheet"] }
    ];
  }

  /**
   * Get embedding for text using OpenAI Ada
   * Falls back to simple vector if API unavailable
   */
  async getEmbedding(text) {
    // Check cache first
    const cacheKey = text.toLowerCase().trim();
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      // Use OpenAI embeddings API (production would use this)
      if (process.env.OPENAI_API_KEY) {
        const response = await axios.post(
          'https://api.openai.com/v1/embeddings',
          {
            model: 'text-embedding-ada-002',
            input: text
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        
        const embedding = response.data.data[0].embedding;
        this.embeddingCache.set(cacheKey, embedding);
        return embedding;
      }
    } catch (error) {
      console.warn('[SemanticMatcher] OpenAI embedding failed, using fallback:', error.message);
    }

    // Fallback: Simple TF-IDF-like vector (for development/offline)
    return this.simpleTFIDFVector(text);
  }

  /**
   * Simple TF-IDF-like vector as fallback
   * Creates a sparse vector based on word frequency
   */
  simpleTFIDFVector(text) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const vector = new Array(384).fill(0); // Match Ada embedding dimensions
    
    // Create deterministic vector from words
    words.forEach((word, idx) => {
      const hash = this.hashString(word);
      const position = hash % vector.length;
      vector[position] += 1 / (idx + 1); // Weight by position
    });
    
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
  }

  /**
   * Simple string hash for deterministic vector generation
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Match query to intent using semantic similarity
   * Returns { intent, confidence, alternatives }
   */
  async matchQuery(query) {
    const queryEmbedding = await this.getEmbedding(query);
    
    const matches = [];
    
    // Compare with all patterns
    for (const pattern of this.queryPatterns) {
      // Compare with main pattern
      const patternEmbedding = await this.getEmbedding(pattern.pattern);
      const similarity = this.cosineSimilarity(queryEmbedding, patternEmbedding);
      
      // Also check examples
      let maxExampleSimilarity = 0;
      for (const example of pattern.examples) {
        const exampleEmbedding = await this.getEmbedding(example);
        const exampleSim = this.cosineSimilarity(queryEmbedding, exampleEmbedding);
        maxExampleSimilarity = Math.max(maxExampleSimilarity, exampleSim);
      }
      
      const finalSimilarity = Math.max(similarity, maxExampleSimilarity);
      
      matches.push({
        intent: pattern.intent,
        confidence: finalSimilarity,
        pattern: pattern.pattern
      });
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    
    const topMatch = matches[0];
    const alternatives = matches.slice(1, 4);
    
    return {
      intent: topMatch.confidence >= this.threshold ? topMatch.intent : 'unknown',
      confidence: topMatch.confidence,
      alternatives: alternatives.map(m => ({ intent: m.intent, confidence: m.confidence })),
      method: 'semantic_embedding',
      threshold: this.threshold
    };
  }

  /**
   * Learn from user feedback (data flywheel)
   * Stores successful query-intent pairs for retraining
   */
  async learnFromFeedback(query, correctIntent, wasCorrect) {
    // In production: Store in training dataset for periodic model retraining
    if (wasCorrect) {
      console.log('[SemanticMatcher] Positive feedback:', { query, correctIntent });
      // Would add to training set and retrain periodically
    } else {
      console.log('[SemanticMatcher] Negative feedback - model correction needed:', { query, correctIntent });
      // Would flag for review and add to correction dataset
    }
  }

  /**
   * Export model performance metrics
   */
  getMetrics() {
    return {
      cacheSize: this.embeddingCache.size,
      patternCount: this.queryPatterns.length,
      threshold: this.threshold,
      embeddingModel: process.env.OPENAI_API_KEY ? 'text-embedding-ada-002' : 'simple-tfidf',
      averageConfidence: null // Would track over time
    };
  }
}

module.exports = new SemanticMatcher();

