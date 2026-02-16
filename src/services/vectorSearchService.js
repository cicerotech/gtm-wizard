/**
 * Vector Search Service
 * Semantic search across meeting notes, account context, and intelligence data.
 * Uses OpenAI text-embedding-3-small for embeddings, in-memory store with JSON file persistence.
 * 
 * Feature flag: ENABLE_VECTOR_SEARCH (default false until validated)
 * 
 * Data sources indexed:
 * - Customer_Brain__c entries (meeting notes)
 * - Account context (company overview, pain points, competitive landscape)
 * - Slack intelligence extractions
 * - Obsidian synced notes
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const VECTOR_STORE_PATH = path.join(__dirname, '../../data/vector-store.json');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_VECTORS = 10000;
const SIMILARITY_THRESHOLD = 0.65;

class VectorSearchService {
  constructor() {
    this.vectors = [];      // Array of { id, embedding, metadata, text }
    this.openai = null;
    this.enabled = process.env.ENABLE_VECTOR_SEARCH === 'true';
    this.initialized = false;
    
    if (this.enabled) {
      this.init();
    } else {
      logger.info('[VectorSearch] Disabled (set ENABLE_VECTOR_SEARCH=true to enable)');
    }
  }

  init() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.loadStore();
        this.initialized = true;
        logger.info(`[VectorSearch] Initialized with ${this.vectors.length} vectors`);
      } else {
        logger.warn('[VectorSearch] No OPENAI_API_KEY, vector search disabled');
        this.enabled = false;
      }
    } catch (err) {
      logger.error('[VectorSearch] Init failed:', err.message);
      this.enabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════

  loadStore() {
    try {
      if (fs.existsSync(VECTOR_STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(VECTOR_STORE_PATH, 'utf8'));
        this.vectors = data.vectors || [];
        logger.info(`[VectorSearch] Loaded ${this.vectors.length} vectors from disk`);
      }
    } catch (err) {
      logger.warn('[VectorSearch] Could not load store:', err.message);
      this.vectors = [];
    }
  }

  saveStore() {
    try {
      const tmpPath = VECTOR_STORE_PATH + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        count: this.vectors.length,
        vectors: this.vectors
      }), 'utf8');
      fs.renameSync(tmpPath, VECTOR_STORE_PATH);
      logger.info(`[VectorSearch] Saved ${this.vectors.length} vectors to disk`);
    } catch (err) {
      logger.error('[VectorSearch] Save failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EMBEDDING
  // ═══════════════════════════════════════════════════════════════

  async getEmbedding(text) {
    if (!this.openai || !text) return null;
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.substring(0, 8000) // Token limit safety
      });
      return response.data[0]?.embedding || null;
    } catch (err) {
      logger.error('[VectorSearch] Embedding error:', err.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEXING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Index a document for semantic search
   * @param {object} doc - { id, text, metadata: { accountId, accountName, sourceType, date, ownerEmail } }
   */
  async indexDocument(doc) {
    if (!this.enabled || !this.initialized) return false;
    if (!doc.text || doc.text.trim().length < 20) return false;

    // Check for duplicate by ID
    const existingIdx = this.vectors.findIndex(v => v.id === doc.id);
    
    const embedding = await this.getEmbedding(doc.text);
    if (!embedding) return false;

    const entry = {
      id: doc.id,
      embedding,
      text: doc.text.substring(0, 2000), // Store truncated text for retrieval
      metadata: {
        accountId: doc.metadata?.accountId || null,
        accountName: doc.metadata?.accountName || null,
        sourceType: doc.metadata?.sourceType || 'unknown',
        date: doc.metadata?.date || new Date().toISOString(),
        ownerEmail: doc.metadata?.ownerEmail || null
      },
      indexedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      this.vectors[existingIdx] = entry;
    } else {
      if (this.vectors.length >= MAX_VECTORS) {
        // Evict oldest
        this.vectors.sort((a, b) => new Date(a.indexedAt) - new Date(b.indexedAt));
        this.vectors.shift();
      }
      this.vectors.push(entry);
    }

    return true;
  }

  /**
   * Index multiple documents (batch)
   */
  async indexBatch(docs) {
    if (!this.enabled || !this.initialized) return { indexed: 0, errors: 0 };
    
    let indexed = 0, errors = 0;
    for (const doc of docs) {
      try {
        const success = await this.indexDocument(doc);
        if (success) indexed++;
      } catch (err) {
        errors++;
        logger.warn(`[VectorSearch] Batch index error for ${doc.id}:`, err.message);
      }
    }
    
    if (indexed > 0) this.saveStore();
    logger.info(`[VectorSearch] Batch indexed: ${indexed} success, ${errors} errors`);
    return { indexed, errors };
  }

  /**
   * Index meeting notes from Customer_Brain__c
   */
  async indexMeetingNotes(accountId, accountName, brainText) {
    if (!brainText || brainText.trim().length < 20) return 0;
    
    // Split by date entries if possible
    const entries = brainText.split(/\n(?=\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|#{1,3}\s)/).filter(e => e.trim().length > 20);
    
    const docs = entries.map((entry, i) => ({
      id: `brain_${accountId}_${i}`,
      text: entry.trim(),
      metadata: {
        accountId,
        accountName,
        sourceType: 'meeting_note',
        date: new Date().toISOString()
      }
    }));
    
    const result = await this.indexBatch(docs);
    return result.indexed;
  }

  /**
   * Index account context
   */
  async indexAccountContext(accountId, accountName, contextData) {
    const parts = [];
    if (contextData.painPoints) parts.push(`Pain Points: ${contextData.painPoints}`);
    if (contextData.competitiveLandscape) parts.push(`Competitive: ${contextData.competitiveLandscape}`);
    if (contextData.keyDecisionMakers) parts.push(`Decision Makers: ${contextData.keyDecisionMakers}`);
    if (contextData.companyContext) parts.push(`Company: ${contextData.companyContext}`);
    
    if (parts.length === 0) return false;
    
    return this.indexDocument({
      id: `account_${accountId}`,
      text: `${accountName}\n${parts.join('\n')}`,
      metadata: {
        accountId,
        accountName,
        sourceType: 'account_context',
        date: new Date().toISOString()
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════

  /**
   * Semantic search across indexed documents
   * @param {string} query - Natural language query
   * @param {object} options - { accountId?, limit?, sourceType? }
   * @returns {Array} - [{ id, text, score, metadata }]
   */
  async search(query, options = {}) {
    if (!this.enabled || !this.initialized || this.vectors.length === 0) {
      return [];
    }

    const { accountId, limit = 5, sourceType } = options;
    
    const queryEmbedding = await this.getEmbedding(query);
    if (!queryEmbedding) return [];

    // Filter candidates
    let candidates = this.vectors;
    if (accountId) {
      candidates = candidates.filter(v => v.metadata.accountId === accountId);
    }
    if (sourceType) {
      candidates = candidates.filter(v => v.metadata.sourceType === sourceType);
    }

    // Compute cosine similarity
    const results = candidates.map(v => ({
      id: v.id,
      text: v.text,
      metadata: v.metadata,
      score: this.cosineSimilarity(queryEmbedding, v.embedding)
    }));

    // Sort by score, filter by threshold, limit
    return results
      .filter(r => r.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // ═══════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════

  getStats() {
    const bySource = {};
    const byAccount = {};
    for (const v of this.vectors) {
      bySource[v.metadata.sourceType] = (bySource[v.metadata.sourceType] || 0) + 1;
      if (v.metadata.accountName) {
        byAccount[v.metadata.accountName] = (byAccount[v.metadata.accountName] || 0) + 1;
      }
    }
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      totalVectors: this.vectors.length,
      bySourceType: bySource,
      uniqueAccounts: Object.keys(byAccount).length,
      storePath: VECTOR_STORE_PATH
    };
  }

  isHealthy() {
    return this.enabled && this.initialized && !!this.openai;
  }
}

// Singleton
const vectorSearchService = new VectorSearchService();

module.exports = {
  VectorSearchService,
  vectorSearchService,
  search: (query, options) => vectorSearchService.search(query, options),
  indexDocument: (doc) => vectorSearchService.indexDocument(doc),
  indexBatch: (docs) => vectorSearchService.indexBatch(docs),
  indexMeetingNotes: (accountId, accountName, brainText) => 
    vectorSearchService.indexMeetingNotes(accountId, accountName, brainText),
  indexAccountContext: (accountId, accountName, contextData) =>
    vectorSearchService.indexAccountContext(accountId, accountName, contextData),
  getStats: () => vectorSearchService.getStats(),
  isHealthy: () => vectorSearchService.isHealthy()
};
