/**
 * ML-Enhanced Intent Classification System
 * 
 * Architecture (Hybrid Cascade):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ User Query                                                       │
 * └──────────────────────────┬──────────────────────────────────────┘
 *                            │
 *           ┌────────────────▼────────────────┐
 *           │ Layer 1: Exact Match Cache      │ ← Previously seen queries
 *           │ (Confidence: 0.99)              │   with known good intents
 *           └────────────────┬────────────────┘
 *                            │ Miss
 *           ┌────────────────▼────────────────┐
 *           │ Layer 2: Semantic Similarity    │ ← Embedding search against
 *           │ (Confidence: 0.75-0.95)         │   learned query bank
 *           └────────────────┬────────────────┘
 *                            │ Low confidence
 *           ┌────────────────▼────────────────┐
 *           │ Layer 3: Pattern Matching       │ ← Fast regex patterns
 *           │ (Confidence: 0.70-0.90)         │   for common queries
 *           └────────────────┬────────────────┘
 *                            │ No match or low confidence
 *           ┌────────────────▼────────────────┐
 *           │ Layer 4: LLM Classification     │ ← GPT-4 with structured
 *           │ (Confidence: 0.60-0.95)         │   output for complex queries
 *           └────────────────┬────────────────┘
 *                            │
 *           ┌────────────────▼────────────────┐
 *           │ Learning: Store result for      │ ← Continuous improvement
 *           │ future exact match/similarity   │
 *           └─────────────────────────────────┘
 * 
 * Key Features:
 * - Persistent learning store (JSON file + Redis cache)
 * - Automatic retraining from user feedback
 * - Confidence-based routing
 * - Fallback cascade for reliability
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// Learning data file path
const LEARNING_DATA_PATH = path.join(__dirname, '../../data/intent-learning.json');
const EMBEDDINGS_CACHE_PATH = path.join(__dirname, '../../data/query-embeddings.json');

class MLIntentClassifier {
  constructor() {
    this.learningData = this.loadLearningData();
    this.embeddingsCache = this.loadEmbeddingsCache();
    this.openai = null;
    this.initOpenAI();
    
    // Intent definitions with examples for embedding matching
    this.intentDefinitions = this.buildIntentDefinitions();
    
    // Confidence thresholds
    this.thresholds = {
      exactMatch: 0.99,
      semanticHigh: 0.85,
      semanticMedium: 0.75,
      patternMatch: 0.70,
      llmConfident: 0.80,
      clarificationNeeded: 0.50
    };
    
    // Statistics tracking
    this.stats = {
      totalQueries: 0,
      exactMatches: 0,
      semanticMatches: 0,
      patternMatches: 0,
      llmClassifications: 0,
      feedbackReceived: 0,
      lastSaved: null
    };
  }

  /**
   * Initialize OpenAI client
   */
  initOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        logger.info('✅ MLIntentClassifier: OpenAI initialized');
        
        // Trigger background precomputation of embeddings
        this.precomputeEmbeddings().catch(err => {
          logger.warn('⚠️ Embedding precomputation failed:', err.message);
        });
      } else {
        logger.warn('⚠️ MLIntentClassifier: No OpenAI API key, LLM layer disabled');
      }
    } catch (error) {
      logger.error('❌ MLIntentClassifier: OpenAI init failed:', error.message);
    }
  }

  /**
   * Pre-compute embeddings for all intent examples at startup
   * This speeds up semantic search by having embeddings ready in cache
   */
  async precomputeEmbeddings() {
    if (!this.openai) {
      logger.info('⏭️ Skipping embedding precomputation - OpenAI not available');
      return;
    }

    const startTime = Date.now();
    let computed = 0;
    let cached = 0;
    let failed = 0;

    logger.info('🔄 Pre-computing intent embeddings...');

    // Collect all examples to embed
    const examplesToEmbed = [];
    
    for (const [intent, definition] of Object.entries(this.intentDefinitions)) {
      for (const example of definition.examples) {
        const cacheKey = example.toLowerCase().trim();
        if (!this.embeddingsCache[cacheKey]) {
          examplesToEmbed.push({ intent, example });
        } else {
          cached++;
        }
      }
    }

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < examplesToEmbed.length; i += batchSize) {
      const batch = examplesToEmbed.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async ({ intent, example }) => {
        try {
          await this.getEmbedding(example);
          computed++;
        } catch (err) {
          failed++;
        }
      }));
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < examplesToEmbed.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`✅ Embedding precomputation complete: ${computed} computed, ${cached} cached, ${failed} failed (${elapsed}ms)`);
    
    // Save the cache after precomputation
    if (computed > 0) {
      this.saveEmbeddingsCache();
    }
  }

  /**
   * Load learning data from persistent storage
   */
  loadLearningData() {
    try {
      if (fs.existsSync(LEARNING_DATA_PATH)) {
        const data = JSON.parse(fs.readFileSync(LEARNING_DATA_PATH, 'utf8'));
        logger.info(`📚 Loaded ${Object.keys(data.queries || {}).length} learned queries`);
        return data;
      }
    } catch (error) {
      logger.warn('Could not load learning data:', error.message);
    }
    
    return {
      queries: {},           // queryHash -> { intent, entities, confidence, uses, lastUsed }
      corrections: [],       // { originalIntent, correctedIntent, query, timestamp }
      intentExamples: {},    // intent -> [example queries]
      version: 1,
      created: new Date().toISOString()
    };
  }

  /**
   * Load embeddings cache
   */
  loadEmbeddingsCache() {
    try {
      if (fs.existsSync(EMBEDDINGS_CACHE_PATH)) {
        const data = JSON.parse(fs.readFileSync(EMBEDDINGS_CACHE_PATH, 'utf8'));
        logger.info(`🧠 Loaded ${Object.keys(data).length} cached embeddings`);
        return data;
      }
    } catch (error) {
      logger.warn('Could not load embeddings cache:', error.message);
    }
    return {};
  }

  /**
   * Save learning data to persistent storage
   */
  saveLearningData() {
    try {
      this.learningData.lastSaved = new Date().toISOString();
      fs.writeFileSync(LEARNING_DATA_PATH, JSON.stringify(this.learningData, null, 2));
      this.stats.lastSaved = new Date().toISOString();
    } catch (error) {
      logger.error('Failed to save learning data:', error.message);
    }
  }

  /**
   * Save embeddings cache
   */
  saveEmbeddingsCache() {
    try {
      fs.writeFileSync(EMBEDDINGS_CACHE_PATH, JSON.stringify(this.embeddingsCache, null, 2));
    } catch (error) {
      logger.error('Failed to save embeddings cache:', error.message);
    }
  }

  /**
   * Build intent definitions with examples
   */
  buildIntentDefinitions() {
    return {
      // Dashboard & Overview
      account_status_dashboard: {
        description: 'Show the GTM executive dashboard',
        examples: ['gtm', 'dashboard', 'gtm brain', 'account status dashboard', 'show dashboard'],
        entities: []
      },
      
      // Pipeline Queries
      pipeline_summary: {
        description: 'Show pipeline overview or summary',
        examples: ['show pipeline', 'pipeline overview', 'what\'s in pipeline', 'current pipeline', 'pipeline status'],
        entities: ['timeframe', 'stages', 'productLine']
      },
      pipeline_by_stage: {
        description: 'Show pipeline filtered by specific stage',
        examples: ['what\'s in stage 3', 'stage 4 deals', 'show me stage 2', 'discovery pipeline', 'proposal stage'],
        entities: ['stages']
      },
      pipeline_by_owner: {
        description: 'Show pipeline for a specific person',
        examples: ['julie\'s deals', 'show me nathan pipeline', 'what does justin have', 'asad\'s opportunities'],
        entities: ['owners']
      },
      late_stage_pipeline: {
        description: 'Show late stage (S3-S5) opportunities',
        examples: ['late stage', 'late stage pipeline', 'stage 3 and 4', 'proposal and pilot'],
        entities: []
      },
      weighted_summary: {
        description: 'Show weighted/probability-adjusted pipeline',
        examples: ['weighted pipeline', 'weighted forecast', 'probability adjusted', 'finance weighted'],
        entities: ['timeframe']
      },
      
      // Account Queries
      account_lookup: {
        description: 'Get information about a specific account',
        examples: ['tell me about Pure Storage', 'who owns Dolby', 'what do we know about Ecolab', 'account info for Bayer'],
        entities: ['accounts']
      },
      account_existence_check: {
        description: 'Check if account exists in Salesforce',
        examples: ['does Novelis exist', 'do we have Dolby', 'is Pure Storage in salesforce', 'check if Ecolab exists'],
        entities: ['accounts']
      },
      owner_accounts_list: {
        description: 'List accounts owned by a person',
        examples: ['julie\'s accounts', 'what accounts does nathan own', 'show me justin\'s accounts'],
        entities: ['ownerName']
      },
      
      // Deal/Opportunity Queries
      deal_lookup: {
        description: 'Look up deals, closed deals, or opportunities',
        examples: ['what closed this week', 'recent wins', 'closed deals', 'what did we close'],
        entities: ['timeframe', 'isClosed', 'isWon']
      },
      
      // Account Actions
      create_account: {
        description: 'Create a new account in Salesforce',
        examples: ['create Asana', 'add Novelis to salesforce', 'create account for PetSmart', 'create Western Digital and assign to bl'],
        entities: ['accounts']
      },
      reassign_account: {
        description: 'Reassign account to different owner',
        examples: ['reassign Dolby to julie', 'transfer Ecolab to nathan', 'move Asana to justin'],
        entities: ['accounts', 'targetBL']
      },
      create_opportunity: {
        description: 'Create a new opportunity',
        examples: ['create opp for Dolby', 'add opportunity for Asana', 'new deal for Novelis'],
        entities: ['accounts', 'stage', 'acv']
      },
      
      // Contract Queries
      contract_query: {
        description: 'Query contracts or PDFs',
        examples: ['show contracts', 'contracts for intel', 'loi contracts', 'pdf agreements'],
        entities: ['accounts', 'contractType']
      },
      
      // Reports
      send_excel_report: {
        description: 'Generate and send Excel pipeline report',
        examples: ['send pipeline excel', 'export to excel', 'generate pipeline report', 'spreadsheet export'],
        entities: ['reportType']
      },
      
      // Meeting/Notes
      post_call_summary: {
        description: 'Process post-call meeting summary',
        examples: ['post-call summary', 'meeting notes', 'call summary for intel'],
        entities: ['accounts']
      },
      save_customer_note: {
        description: 'Save note to customer brain',
        examples: ['add to customer history', 'save note for intel', 'log customer note'],
        entities: ['accounts']
      },
      query_account_plan: {
        description: 'Get account plan/strategy',
        examples: ['account plan for Dolby', 'what\'s the strategy for Pure Storage', 'show account plan'],
        entities: ['accounts']
      },
      save_account_plan: {
        description: 'Save account plan/strategy',
        examples: ['add account plan for intel', 'save account plan', 'update account strategy'],
        entities: ['accounts']
      },
      
      // Forecasting
      forecasting: {
        description: 'Forecast and pipeline coverage queries',
        examples: ['are we on track', 'forecast for q4', 'pipeline coverage', 'will we hit target'],
        entities: ['timeframe']
      },
      
      // Activity
      activity_check: {
        description: 'Check deal activity or stale deals',
        examples: ['what\'s stale', 'deals with no activity', 'stuck deals', 'stale opportunities'],
        entities: ['staleDays']
      },
      
      // Count queries
      count_query: {
        description: 'Count customers, contracts, or deals',
        examples: ['how many customers', 'count of arr contracts', 'how many lois'],
        entities: ['countType']
      },
      
      // Conversational
      greeting: {
        description: 'User greeting',
        examples: ['hello', 'hi', 'hey', 'good morning'],
        entities: []
      },
      conversation: {
        description: 'General conversation',
        examples: ['how are you', 'what can you do', 'help me'],
        entities: []
      },
      
      // Unknown
      unknown_query: {
        description: 'Query not understood',
        examples: [],
        entities: []
      }
    };
  }

  /**
   * Main classification method - Optimized for speed
   * Priority: Pattern Match (fast) > Exact Match > Semantic (if fast) > LLM (if needed)
   */
  async classify(query, conversationContext = null, userId = null) {
    const startTime = Date.now();
    this.stats.totalQueries++;
    
    const queryHash = this.hashQuery(query);
    const normalizedQuery = query.toLowerCase().trim();
    
    // Layer 1: Fast pattern matching FIRST (most reliable, no API calls)
    const patternMatch = this.patternMatch(normalizedQuery, conversationContext);
    if (patternMatch && patternMatch.confidence >= this.thresholds.patternMatch) {
      this.stats.patternMatches++;
      // Learn in background, don't await
      this.learnQuery(queryHash, normalizedQuery, patternMatch).catch(() => {});
      logger.info(`🔄 Using fallback pattern matching`);
      return this.buildResult(patternMatch, 'pattern_match', Date.now() - startTime);
    }
    
    // Layer 2: Exact match from learning data (also fast, local lookup)
    const exactMatch = await this.checkExactMatch(queryHash, normalizedQuery);
    if (exactMatch && exactMatch.confidence >= this.thresholds.exactMatch) {
      this.stats.exactMatches++;
      this.updateQueryUsage(queryHash);
      return this.buildResult(exactMatch, 'exact_match', Date.now() - startTime);
    }
    
    // Layer 3: Semantic similarity search (only if embeddings are working)
    // Skip if embeddings are disabled or we've already spent >2s
    if (!this.embeddingsDisabled && (Date.now() - startTime) < 2000) {
      try {
        // Set a hard timeout for semantic search
        const semanticPromise = this.semanticSearch(normalizedQuery);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2000));
        const semanticMatch = await Promise.race([semanticPromise, timeoutPromise]);
        
        if (semanticMatch && semanticMatch.confidence >= this.thresholds.semanticHigh) {
          this.stats.semanticMatches++;
          this.learnQuery(queryHash, normalizedQuery, semanticMatch).catch(() => {});
          return this.buildResult(semanticMatch, 'semantic_match', Date.now() - startTime);
        }
      } catch (error) {
        logger.debug('Semantic search skipped:', error.message);
      }
    }
    
    // Layer 4: LLM classification (only if other methods failed and we have time)
    if (this.openai && (Date.now() - startTime) < 5000) {
      try {
        const llmPromise = this.llmClassify(query, conversationContext);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 5000));
        const llmResult = await Promise.race([llmPromise, timeoutPromise]);
        
        if (llmResult && llmResult.confidence >= this.thresholds.clarificationNeeded) {
          this.stats.llmClassifications++;
          this.learnQuery(queryHash, normalizedQuery, llmResult).catch(() => {});
          return this.buildResult(llmResult, 'llm_classification', Date.now() - startTime);
        }
      } catch (error) {
        logger.debug('LLM classification skipped:', error.message);
      }
    }
    
    // Fallback: Use pattern match if we have one, or return unknown
    const bestResult = patternMatch || {
      intent: 'unknown_query',
      entities: { extractedWords: this.extractKeywords(normalizedQuery) },
      confidence: 0.3,
      explanation: 'Query not understood - needs clarification'
    };
    
    return this.buildResult(bestResult, 'fallback', Date.now() - startTime);
  }

  /**
   * Layer 1: Check exact match in learning data
   */
  async checkExactMatch(queryHash, normalizedQuery) {
    // Check learning data
    const learned = this.learningData.queries[queryHash];
    if (learned && learned.uses > 0) {
      return {
        intent: learned.intent,
        entities: learned.entities,
        confidence: Math.min(0.99, 0.9 + (learned.uses * 0.01)),
        explanation: `Exact match (used ${learned.uses} times)`
      };
    }
    
    // Check Redis cache for recent queries
    const cached = await cache.get(`intent:${queryHash}`);
    if (cached) {
      return {
        intent: cached.intent,
        entities: cached.entities,
        confidence: 0.95,
        explanation: 'Cached recent query'
      };
    }
    
    return null;
  }

  /**
   * Layer 2: Semantic similarity search using embeddings
   */
  async semanticSearch(query) {
    if (!this.openai) return null;
    
    try {
      // Get embedding for query
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) return null;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      // Compare against all intent examples
      for (const [intent, definition] of Object.entries(this.intentDefinitions)) {
        for (const example of definition.examples) {
          const exampleEmbedding = await this.getEmbedding(example);
          if (!exampleEmbedding) continue;
          
          const similarity = this.cosineSimilarity(queryEmbedding, exampleEmbedding);
          
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = {
              intent,
              confidence: similarity,
              matchedExample: example,
              explanation: `Similar to "${example}" (${(similarity * 100).toFixed(1)}%)`
            };
          }
        }
      }
      
      // Also check learned examples
      for (const [intent, examples] of Object.entries(this.learningData.intentExamples || {})) {
        for (const example of examples) {
          const exampleEmbedding = await this.getEmbedding(example);
          if (!exampleEmbedding) continue;
          
          const similarity = this.cosineSimilarity(queryEmbedding, exampleEmbedding);
          
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = {
              intent,
              confidence: similarity,
              matchedExample: example,
              explanation: `Similar to learned query "${example}" (${(similarity * 100).toFixed(1)}%)`
            };
          }
        }
      }
      
      if (bestMatch && bestSimilarity >= this.thresholds.semanticMedium) {
        // Extract entities based on intent
        bestMatch.entities = this.extractEntitiesForIntent(query, bestMatch.intent);
        return bestMatch;
      }
      
      return null;
      
    } catch (error) {
      logger.error('Semantic search failed:', error.message);
      return null;
    }
  }

  /**
   * Get embedding for text (with caching and timeout)
   */
  async getEmbedding(text, timeoutMs = 3000) {
    const cacheKey = text.toLowerCase().trim();
    
    // Check memory cache
    if (this.embeddingsCache[cacheKey]) {
      return this.embeddingsCache[cacheKey];
    }
    
    // If embeddings are disabled due to repeated failures, skip
    if (this.embeddingsDisabled) {
      return null;
    }
    
    try {
      // Add timeout to prevent slow API calls from blocking
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Embedding timeout')), timeoutMs)
      );
      
      const embeddingPromise = this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });
      
      const response = await Promise.race([embeddingPromise, timeoutPromise]);
      
      const embedding = response.data[0].embedding;
      
      // Cache it
      this.embeddingsCache[cacheKey] = embedding;
      
      // Reset failure count on success
      this.embeddingFailures = 0;
      
      // Save periodically (every 100 new embeddings)
      if (Object.keys(this.embeddingsCache).length % 100 === 0) {
        this.saveEmbeddingsCache();
      }
      
      return embedding;
      
    } catch (error) {
      // Track failures and disable embeddings after 3 consecutive failures
      this.embeddingFailures = (this.embeddingFailures || 0) + 1;
      if (this.embeddingFailures >= 3) {
        logger.warn('⚠️ Disabling embeddings after 3 failures - using pattern matching only');
        this.embeddingsDisabled = true;
        // Re-enable after 5 minutes
        setTimeout(() => {
          this.embeddingsDisabled = false;
          this.embeddingFailures = 0;
          logger.info('🔄 Re-enabling embeddings');
        }, 5 * 60 * 1000);
      }
      logger.debug('Embedding generation failed:', error.message);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Layer 3: Fast pattern matching
   * Import the existing pattern matching logic but with confidence scoring
   */
  patternMatch(query, conversationContext) {
    // Import the fallback pattern matching from intentParser
    const { intentParser } = require('./intentParser');
    const result = intentParser.fallbackPatternMatching(query, conversationContext);
    
    // Adjust confidence based on how specific the match was
    let confidence = result.confidence || 0.6;
    
    // Boost confidence for very specific matches
    if (result.intent !== 'pipeline_summary' && result.intent !== 'unknown_query') {
      confidence = Math.min(0.9, confidence + 0.1);
    }
    
    return {
      intent: result.intent,
      entities: result.entities,
      confidence,
      explanation: result.explanation || 'Pattern matched'
    };
  }

  /**
   * Layer 4: LLM classification with structured output
   */
  async llmClassify(query, conversationContext) {
    if (!this.openai) return null;
    
    try {
      const systemPrompt = `You are an intent classifier for a sales operations chatbot. Classify the user's query into one of these intents:

${Object.entries(this.intentDefinitions).map(([intent, def]) => 
  `- ${intent}: ${def.description}`
).join('\n')}

Also extract relevant entities:
- accounts: Company names mentioned
- owners: Person names mentioned (sales reps)
- timeframe: Time periods (this week, this month, q4, etc.)
- stages: Sales stages mentioned (stage 1, stage 2, discovery, proposal, etc.)

Respond with JSON only:
{
  "intent": "intent_name",
  "entities": { "accounts": ["Company"], "owners": ["Name"], "timeframe": "this_week" },
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 300
      });
      
      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      return {
        intent: parsed.intent || 'unknown_query',
        entities: parsed.entities || {},
        confidence: parsed.confidence || 0.7,
        explanation: parsed.reasoning || 'LLM classification'
      };
      
    } catch (error) {
      logger.error('LLM classification failed:', error.message);
      return null;
    }
  }

  /**
   * Extract entities based on intent type
   */
  extractEntitiesForIntent(query, intent) {
    const entities = {};
    const queryLower = query.toLowerCase();
    
    // Extract company names (capitalized words not in stop list)
    const companyPattern = /(?:for|about|at|owns?|does)\s+([A-Z][a-zA-Z\s&]+?)(?:\s+(?:exist|have|pipeline|deals|opportunities|account)|[?.]|$)/i;
    const companyMatch = query.match(companyPattern);
    if (companyMatch) {
      entities.accounts = [companyMatch[1].trim()];
    }
    
    // Extract owner names
    const ownerPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(?:deals|accounts|pipeline|opportunities)/i,
      /(?:assign(?:ed)?\s+to|owned\s+by|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ];
    for (const pattern of ownerPatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.owners = [match[1].trim()];
        break;
      }
    }
    
    // Extract timeframe
    if (queryLower.includes('this week')) entities.timeframe = 'this_week';
    else if (queryLower.includes('this month')) entities.timeframe = 'this_month';
    else if (queryLower.includes('this quarter') || queryLower.includes('q4')) entities.timeframe = 'this_quarter';
    else if (queryLower.includes('last week')) entities.timeframe = 'last_week';
    else if (queryLower.includes('last month')) entities.timeframe = 'last_month';
    
    // Extract stages
    const stageMatch = queryLower.match(/stage\s*(\d)/);
    if (stageMatch) {
      const stageNames = {
        '0': 'Stage 0 - Prospecting',
        '1': 'Stage 1 - Discovery',
        '2': 'Stage 2 - SQO',
        '3': 'Stage 3 - Pilot',
        '4': 'Stage 4 - Proposal',
        '5': 'Stage 5 - Negotiation'
      };
      entities.stages = [stageNames[stageMatch[1]] || `Stage ${stageMatch[1]}`];
    }
    
    return entities;
  }

  /**
   * Extract keywords for unknown queries
   */
  extractKeywords(query) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'what', 'who', 'where', 'when', 'how', 'show', 'me', 'tell', 'get']);
    return query.toLowerCase()
      .replace(/[?!.,]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
  }

  /**
   * Learn from a successful classification
   */
  async learnQuery(queryHash, query, result) {
    // Store in learning data
    this.learningData.queries[queryHash] = {
      intent: result.intent,
      entities: result.entities,
      confidence: result.confidence,
      query: query.substring(0, 200),
      uses: 1,
      firstSeen: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    
    // Add to intent examples for future semantic matching
    if (!this.learningData.intentExamples[result.intent]) {
      this.learningData.intentExamples[result.intent] = [];
    }
    
    // Keep unique examples (max 50 per intent)
    const examples = this.learningData.intentExamples[result.intent];
    if (!examples.includes(query) && examples.length < 50) {
      examples.push(query);
    }
    
    // Cache in Redis for quick access
    await cache.set(`intent:${queryHash}`, {
      intent: result.intent,
      entities: result.entities
    }, 86400 * 7); // 7 days
    
    // Save periodically
    if (Object.keys(this.learningData.queries).length % 10 === 0) {
      this.saveLearningData();
    }
  }

  /**
   * Update usage count for a query
   */
  updateQueryUsage(queryHash) {
    if (this.learningData.queries[queryHash]) {
      this.learningData.queries[queryHash].uses++;
      this.learningData.queries[queryHash].lastUsed = new Date().toISOString();
    }
  }

  /**
   * Process user feedback/correction
   */
  async processFeedback(originalQuery, originalIntent, correctedIntent, userId) {
    this.stats.feedbackReceived++;
    
    const queryHash = this.hashQuery(originalQuery);
    
    // Store correction
    this.learningData.corrections.push({
      query: originalQuery,
      originalIntent,
      correctedIntent,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Update the learned query
    if (this.learningData.queries[queryHash]) {
      this.learningData.queries[queryHash].intent = correctedIntent;
      this.learningData.queries[queryHash].confidence = 0.99; // High confidence after correction
      this.learningData.queries[queryHash].corrected = true;
    } else {
      // Add as new learning
      this.learningData.queries[queryHash] = {
        intent: correctedIntent,
        entities: {},
        confidence: 0.99,
        query: originalQuery,
        uses: 1,
        corrected: true,
        firstSeen: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
    }
    
    // Add to intent examples
    if (!this.learningData.intentExamples[correctedIntent]) {
      this.learningData.intentExamples[correctedIntent] = [];
    }
    this.learningData.intentExamples[correctedIntent].push(originalQuery);
    
    // Update Redis cache
    await cache.set(`intent:${queryHash}`, {
      intent: correctedIntent,
      entities: {},
      corrected: true
    }, 86400 * 30); // 30 days for corrections
    
    this.saveLearningData();
    
    logger.info(`📝 Learned from feedback: "${originalQuery}" → ${correctedIntent}`);
    
    return true;
  }

  /**
   * Build final result object
   */
  buildResult(result, method, duration) {
    return {
      intent: result.intent,
      entities: result.entities || {},
      confidence: result.confidence,
      explanation: result.explanation,
      method,
      duration,
      followUp: result.confidence < this.thresholds.llmConfident,
      originalMessage: null, // Set by caller
      timestamp: Date.now()
    };
  }

  /**
   * Hash query for storage
   */
  hashQuery(query) {
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
  }

  /**
   * Get classifier statistics
   */
  getStats() {
    return {
      ...this.stats,
      learnedQueries: Object.keys(this.learningData.queries).length,
      corrections: this.learningData.corrections.length,
      intentExamples: Object.fromEntries(
        Object.entries(this.learningData.intentExamples).map(([k, v]) => [k, v.length])
      ),
      cachedEmbeddings: Object.keys(this.embeddingsCache).length
    };
  }

  /**
   * Export learning data for analysis
   */
  exportLearningData() {
    return {
      queries: this.learningData.queries,
      corrections: this.learningData.corrections,
      stats: this.getStats()
    };
  }
}

// Singleton instance
const mlIntentClassifier = new MLIntentClassifier();

module.exports = {
  MLIntentClassifier,
  mlIntentClassifier,
  classify: (query, context, userId) => mlIntentClassifier.classify(query, context, userId),
  processFeedback: (query, original, corrected, userId) => mlIntentClassifier.processFeedback(query, original, corrected, userId),
  getStats: () => mlIntentClassifier.getStats()
};

