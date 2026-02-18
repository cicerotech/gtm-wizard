/**
 * Intelligence Query Service
 * Handles natural language queries about accounts, deals, and pipeline
 * Uses Anthropic Claude directly for reliable AI responses
 * 
 * This service aggregates data from:
 * - Salesforce (Account, Opportunity, Contact, Task, Event)
 * - Customer Brain field (historical meeting notes)
 * - Obsidian notes (local meeting notes from SQLite)
 * - Slack intelligence signals
 */

const Anthropic = require('@anthropic-ai/sdk');
const { query: sfQuery } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');
const meetingContextService = require('./meetingContextService');
const { cache } = require('../utils/cache');
const logger = require('../utils/logger');
const { getIntelForAccount } = require('./slackIntelCache');

// Vector search for semantic context retrieval
// Feature flag: ENABLE_VECTOR_SEARCH (default false until validated)
let vectorSearch = null;
if (process.env.ENABLE_VECTOR_SEARCH === 'true') {
  try {
    vectorSearch = require('./vectorSearchService');
    logger.info('[Intelligence] Vector search integration loaded');
  } catch (err) {
    logger.warn('[Intelligence] Vector search not available:', err.message);
  }
}

// Advanced intent parser (same ML cascade used by Slack bot)
// Feature flag: USE_ADVANCED_INTENTS (default true — falls back to simple on error)
const USE_ADVANCED_INTENTS = process.env.USE_ADVANCED_INTENTS !== 'false';
let advancedIntentParser = null;
if (USE_ADVANCED_INTENTS) {
  try {
    advancedIntentParser = require('../ai/intentParser');
    logger.info('[Intelligence] Advanced intent parser loaded (50+ intents, ML cascade)');
  } catch (err) {
    logger.warn('[Intelligence] Advanced intent parser not available, using simple keywords:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE - Ephemeral, no customer data persisted to disk
// Replaces SQLite storage for compliance - data fetched from Salesforce
// ═══════════════════════════════════════════════════════════════════════════
const accountContextCache = new Map();
const MEMORY_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes — keep short for data accuracy

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION SESSION STORE - Multi-turn conversation support
// Feature flag: ENABLE_MULTI_TURN (default true)
// Sessions expire after 30 minutes of inactivity
// ═══════════════════════════════════════════════════════════════════════════
const ENABLE_MULTI_TURN = process.env.ENABLE_MULTI_TURN !== 'false';
const conversationSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONVERSATION_TURNS = 10; // Keep last 10 turns to stay within token limits
const MAX_SESSIONS = 200; // Prevent unbounded memory growth

function getSession(sessionId) {
  if (!sessionId || !conversationSessions.has(sessionId)) return null;
  const session = conversationSessions.get(sessionId);
  if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
    conversationSessions.delete(sessionId);
    return null;
  }
  session.lastActivity = Date.now();
  return session;
}

function createSession(sessionId) {
  // Evict oldest sessions if at capacity
  if (conversationSessions.size >= MAX_SESSIONS) {
    let oldestKey = null, oldestTime = Infinity;
    for (const [key, sess] of conversationSessions) {
      if (sess.lastActivity < oldestTime) { oldestTime = sess.lastActivity; oldestKey = key; }
    }
    if (oldestKey) conversationSessions.delete(oldestKey);
  }
  const session = {
    id: sessionId,
    turns: [],        // Array of { role: 'user'|'assistant', content: string }
    accountId: null,
    accountName: null,
    gatheredContext: null, // Reuse context across turns
    lastActivity: Date.now(),
    createdAt: Date.now()
  };
  conversationSessions.set(sessionId, session);
  return session;
}

function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
}

function getMemoryCachedContext(accountId) {
  const cached = accountContextCache.get(accountId);
  if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL_MS) {
    logger.debug(`[Intelligence] Memory cache HIT for ${accountId}`);
    return cached.data;
  }
  if (cached) {
    accountContextCache.delete(accountId); // Expired, remove
  }
  return null;
}

function setMemoryCachedContext(accountId, data) {
  // Limit cache size to prevent memory leaks
  if (accountContextCache.size > 200) {
    const firstKey = accountContextCache.keys().next().value;
    accountContextCache.delete(firstKey);
  }
  accountContextCache.set(accountId, {
    data,
    timestamp: Date.now()
  });
  logger.debug(`[Intelligence] Memory cache SET for ${accountId}`);
}

/**
 * Parse Customer_Brain__c field into structured meeting notes
 * This is the primary source of meeting history (from Salesforce, not SQLite)
 */
function parseCustomerBrainNotes(rawBrain) {
  if (!rawBrain || typeof rawBrain !== 'string') return [];
  
  // Split by meeting delimiter
  const entries = rawBrain.split(/---\s*Meeting:/i);
  
  return entries
    .filter(e => e && e.trim().length > 10)
    .slice(0, 10)  // Last 10 meetings for rich context
    .map(entry => {
      const lines = entry.trim().split('\n');
      
      // Parse date from first line
      const dateMatch = lines[0]?.match(/^(.+?)\s*---/);
      const date = dateMatch?.[1]?.trim() || 'Unknown date';
      
      // Parse metadata fields
      const repMatch = entry.match(/Rep:\s*(.+)/i);
      const durationMatch = entry.match(/Duration:\s*(.+)/i);
      const participantsMatch = entry.match(/Participants:\s*(.+)/i);
      
      // Extract notes content
      let summary = '';
      const doubleNewline = entry.indexOf('\n\n');
      if (doubleNewline > -1) {
        const notesContent = entry.substring(doubleNewline + 2).trim();
        summary = notesContent.substring(0, 500);
        if (notesContent.length > 500) summary += '...';
      }
      
      return {
        date,
        rep: repMatch?.[1]?.trim() || 'Unknown',
        duration: durationMatch?.[1]?.trim() || null,
        participants: participantsMatch?.[1]?.trim() || null,
        summary: summary || 'No summary available',
        source: 'salesforce'  // Explicitly mark source as Salesforce
      };
    })
    .filter(note => note.summary && note.summary !== 'No summary available');
}

// Initialize Anthropic client
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  logger.info('✅ Intelligence Query Service: Anthropic Claude initialized');
} else {
  logger.warn('⚠️ Intelligence Query Service: ANTHROPIC_API_KEY not set - queries will fail');
}

// Cache TTLs
const CACHE_TTL = {
  ACCOUNT_CONTEXT: 900,    // 15 minutes for account-specific context
  PIPELINE_DATA: 1800,     // 30 minutes for pipeline aggregates
  USER_ACCOUNTS: 3600      // 1 hour for user's account list
};

// Query intent classification
const QUERY_INTENTS = {
  PRE_MEETING: ['before my', 'next meeting', 'should i know', 'meeting prep', 'prepare for'],
  DEAL_STATUS: ['deal status', 'current status', 'stage', 'pipeline', 'where are we', 'how is the deal'],
  STAKEHOLDERS: ['decision maker', 'stakeholder', 'champion', 'contact', 'who is', 'who are'],
  HISTORY: ['last meeting', 'when did we', 'history', 'previous', 'last time'],
  NEXT_STEPS: ['next step', 'action item', 'todo', 'follow up', 'outstanding'],
  PAIN_POINTS: ['pain point', 'challenge', 'problem', 'issue', 'struggle'],
  COMPETITIVE: ['competitor', 'competitive', 'alternative', 'vs', 'compared to'],
  PIPELINE_OVERVIEW: ['my pipeline', 'my deals', 'my accounts', 'late stage', 'forecast', 'how many customer', 'how many deal', 'how many account', 'total pipeline', 'closing this', 'in our pipeline', 'pipeline summary', 'deals closing', 'new logo', 'won this'],
  ACCOUNT_LOOKUP: ['who owns', 'owner of', 'assigned to']
};

/**
 * Main entry point for intelligence queries
 * @param {Object} params - Query parameters
 * @param {string} params.query - Natural language query
 * @param {string} params.accountId - Optional account ID for context
 * @param {string} params.accountName - Optional account name for context
 * @param {string} params.userEmail - User making the query
 * @returns {Object} - Query response with answer and metadata
 */
async function processQuery({ query, accountId, accountName, userEmail, forceRefresh, sessionId }) {
  const startTime = Date.now();
  
  if (!anthropic) {
    return {
      success: false,
      error: 'AI service not configured. Please check ANTHROPIC_API_KEY.',
      query
    };
  }

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: 'Query is required',
      query
    };
  }

  try {
    // ── Multi-turn session management ──
    let session = null;
    let currentSessionId = sessionId || null;
    let turnNumber = 1;

    if (ENABLE_MULTI_TURN) {
      if (currentSessionId) {
        session = getSession(currentSessionId);
      }
      if (!session) {
        currentSessionId = currentSessionId || generateSessionId();
        session = createSession(currentSessionId);
      }
      turnNumber = Math.floor(session.turns.length / 2) + 1;

      // If account changed mid-conversation, refresh context
      if (accountId && session.accountId && session.accountId !== accountId) {
        session.gatheredContext = null;
        logger.info(`[Intelligence] Account changed in session, refreshing context`);
      }
      if (accountId) session.accountId = accountId;
      if (accountName) session.accountName = accountName;
    }

    // Query expansion: detect keywords that require additional data sources
    const lowerQuery = query.toLowerCase();
    const queryHints = {
      needsContracts: /contract|agreement|renewal|renew|term\b|expir/i.test(query),
      needsProducts: /product|purchased|buying|bought|subscri|license|line item/i.test(query),
      needsCommercial: /pricing|price|cost|commerci|terms|payment|invoice|billing/i.test(query),
    };

    // Classify the query intent (async — uses ML cascade when available)
    const intent = await classifyQueryIntent(query);
    logger.info(`[Intelligence] Query intent: ${intent}`, { 
      query: query.substring(0, 50), 
      forceRefresh: !!forceRefresh,
      sessionId: currentSessionId,
      turn: turnNumber,
      queryHints: Object.keys(queryHints).filter(k => queryHints[k])
    });

    // Gather context — reuse from session if available and not forcing refresh
    let context;
    if (ENABLE_MULTI_TURN && session && session.gatheredContext && !forceRefresh && turnNumber > 1) {
      context = session.gatheredContext;
      context.dataFreshness = 'session-cached';
      logger.info(`[Intelligence] Reusing session context (turn ${turnNumber})`);
    } else {
      context = await gatherContext({
        intent,
        query,
        accountId: accountId || (session?.accountId),
        accountName: accountName || (session?.accountName),
        userEmail,
        forceRefresh: !!forceRefresh
      });
      if (ENABLE_MULTI_TURN && session) {
        session.gatheredContext = context;
      }
    }

    // Context quality scoring — let Claude know when data is sparse
    const contextQuality = [];
    if (!context.account) contextQuality.push('no account record found');
    if ((context.opportunities?.length || 0) === 0) contextQuality.push('no opportunities');
    if ((context.contacts?.length || 0) === 0) contextQuality.push('no contacts');
    if (!context.customerBrain) contextQuality.push('no meeting history');
    if ((context.contracts?.length || 0) === 0 && queryHints.needsContracts) contextQuality.push('no contract records accessible');
    if (contextQuality.length >= 3) {
      context.qualityNote = `LIMITED DATA: Only ${4 - contextQuality.length} of 4 core data sources available. Missing: ${contextQuality.join(', ')}.`;
    }

    // Build the optimized prompt
    const { systemPrompt, userPrompt } = buildPrompt({
      intent,
      query,
      context
    });

    // ── Build messages array (multi-turn or single-turn) ──
    let messages;
    if (ENABLE_MULTI_TURN && session && session.turns.length > 0) {
      // Multi-turn: include conversation history + new query
      // First turn included the full context in userPrompt; follow-ups are plain queries
      messages = [
        ...session.turns.slice(-MAX_CONVERSATION_TURNS * 2), // Keep recent turns within token limit
        { role: 'user', content: turnNumber === 1 ? userPrompt : `Follow-up question (same account context as above):\n${query}` }
      ];
    } else {
      // Single-turn or first turn
      messages = [{ role: 'user', content: userPrompt }];
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages
    });

    const answer = response.content[0]?.text || 'Unable to generate response.';
    const duration = Date.now() - startTime;

    // ── Store turn in session ──
    if (ENABLE_MULTI_TURN && session) {
      // For first turn, store the full context prompt; for follow-ups, store the plain query
      session.turns.push({ role: 'user', content: turnNumber === 1 ? userPrompt : query });
      session.turns.push({ role: 'assistant', content: answer });
      // Trim if too many turns
      if (session.turns.length > MAX_CONVERSATION_TURNS * 2) {
        session.turns = session.turns.slice(-MAX_CONVERSATION_TURNS * 2);
      }
    }

    logger.info(`[Intelligence] Query completed in ${duration}ms`, {
      intent,
      accountName: context.account?.name,
      tokensUsed: response.usage?.output_tokens,
      turn: turnNumber
    });

    return {
      success: true,
      query,
      answer,
      intent,
      sessionId: currentSessionId || undefined,
      turnNumber,
      context: {
        accountName: context.account?.name,
        accountId: context.account?.id,
        owner: context.account?.owner || null,
        ownerEmail: context.account?.ownerEmail || null,
        accountType: context._accountType || 'unknown',
        opportunityCount: context.opportunities?.length || 0,
        topOpportunity: context.opportunities?.[0] ? {
          name: context.opportunities[0].name,
          stage: context.opportunities[0].stage,
          acv: context.opportunities[0].acv
        } : null,
        contactCount: context.contacts?.length || 0,
        hasCustomerBrain: !!context.customerBrain,
        hasNotes: (context.obsidianNotes?.length || 0) > 0,
        dataFreshness: context.dataFreshness
      },
      performance: {
        durationMs: duration,
        tokensUsed: response.usage?.output_tokens
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[Intelligence] Query error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process query',
      query,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Classify the query intent to determine what data to fetch.
 * Uses advanced ML cascade (50+ intents) when available, falls back to simple keywords.
 */
async function classifyQueryIntent(query, conversationContext) {
  // Try advanced intent parser first (same system as Slack bot)
  if (advancedIntentParser) {
    try {
      const parsed = await advancedIntentParser.parseIntent(query, conversationContext || null, null);
      if (parsed && parsed.intent) {
        // Map advanced intent names to our context-gathering categories
        const intentMap = {
          'pipeline_summary': 'PIPELINE_OVERVIEW',
          'deal_lookup': 'DEAL_STATUS',
          'account_lookup': 'ACCOUNT_LOOKUP',
          'forecasting': 'PIPELINE_OVERVIEW',
          'stage_change': 'DEAL_STATUS',
          'post_call_summary': 'HISTORY',
          'query_account_plan': 'PRE_MEETING',
          'save_customer_note': 'GENERAL',
          'stakeholder_query': 'STAKEHOLDERS',
          'competitive_intel': 'COMPETITIVE',
          'pain_points': 'PAIN_POINTS',
          'next_steps': 'NEXT_STEPS',
          'meeting_prep': 'PRE_MEETING',
          'history': 'HISTORY',
        };
        const mappedIntent = intentMap[parsed.intent] || null;
        if (mappedIntent) {
          logger.info(`[Intelligence] Advanced intent: ${parsed.intent} -> ${mappedIntent} (confidence: ${parsed.confidence || 'n/a'})`);
          return mappedIntent;
        }
        // If no mapping, still log and fall through to simple classifier
        logger.info(`[Intelligence] Advanced intent unmapped: ${parsed.intent}, falling back to simple`);
      }
    } catch (err) {
      logger.warn('[Intelligence] Advanced intent parser error, falling back to simple:', err.message);
    }
  }

  // Fallback: simple keyword matching
  const lowerQuery = query.toLowerCase();
  for (const [intent, keywords] of Object.entries(QUERY_INTENTS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      return intent;
    }
  }
  
  return 'GENERAL';
}

/**
 * Gather context from all data sources based on query intent
 */
async function gatherContext({ intent, query, accountId, accountName, userEmail, forceRefresh }) {
  const context = {
    account: null,
    opportunities: [],
    contacts: [],
    contracts: [],
    recentTasks: [],
    recentEvents: [],
    customerBrain: null,
    obsidianNotes: [],
    slackIntel: [],
    vectorResults: [],
    upcomingMeeting: null,
    dataFreshness: 'live'
  };

  // Check IN-MEMORY cache first (ephemeral, no disk persistence)
  // Skip cache when forceRefresh is set — guarantees live Salesforce data
  if (accountId && !forceRefresh) {
    const memoryCached = getMemoryCachedContext(accountId);
    if (memoryCached) {
      return { ...memoryCached, dataFreshness: 'cached' };
    }
  } else if (accountId && forceRefresh) {
    // Evict stale entry so the fresh data replaces it after gathering
    accountContextCache.delete(accountId);
    logger.info(`[Intelligence] forceRefresh — evicted in-memory cache for ${accountId}`);
  }

  // Handle pipeline/cross-account queries (works with or without userEmail)
  if (intent === 'PIPELINE_OVERVIEW') {
    return await gatherPipelineContext(userEmail || null);
  }

  // Handle account lookup queries
  if (intent === 'ACCOUNT_LOOKUP') {
    return await gatherAccountLookupContext(query);
  }

  // For account-specific queries, we need an account
  if (!accountId && accountName) {
    logger.info(`[Intelligence] Looking up account by name: "${accountName}"`);
    const account = await findAccountByName(accountName);
    if (account) {
      accountId = account.Id;
      logger.info(`[Intelligence] Found account: ${account.Name} (${account.Id})`);
      context.account = {
        id: account.Id,
        name: account.Name,
        owner: account.Owner?.Name,
        ownerEmail: account.Owner?.Email,
        type: account.Customer_Type__c,
        industry: account.Industry,
        website: account.Website
      };
    } else {
      logger.warn(`[Intelligence] No account found matching: "${accountName}"`);
    }
  }

  if (!accountId) {
    logger.warn(`[Intelligence] No accountId available - returning minimal context for query`);
    return context;
  }

  // Verify SF connection is alive before parallel data fetch
  const { isSalesforceAvailable } = require('../salesforce/connection');
  if (!isSalesforceAvailable()) {
    logger.error(`[Intelligence] Salesforce connection unavailable — resetting circuit breaker and retrying`);
    const { resetCircuitBreaker, initializeSalesforce } = require('../salesforce/connection');
    resetCircuitBreaker();
    try { await initializeSalesforce(); } catch (e) { logger.error(`[Intelligence] SF re-init failed: ${e.message}`); }
  }

  // Fetch all data in parallel from SALESFORCE ONLY
  logger.info(`[Intelligence] Fetching SF data for accountId: ${accountId}`);
  const [
    accountData,
    opportunities,
    contacts,
    tasks,
    events,
    contracts
  ] = await Promise.all([
    getAccountDetails(accountId).catch(e => { logger.error(`[Intelligence] getAccountDetails failed: ${e.message}`); return null; }),
    getOpportunities(accountId).catch(e => { logger.error(`[Intelligence] getOpportunities failed: ${e.message}`); return []; }),
    getContacts(accountId).catch(e => { logger.error(`[Intelligence] getContacts failed: ${e.message}`); return []; }),
    getRecentTasks(accountId).catch(e => { logger.error(`[Intelligence] getRecentTasks failed: ${e.message}`); return []; }),
    getRecentEvents(accountId).catch(e => { logger.error(`[Intelligence] getRecentEvents failed: ${e.message}`); return []; }),
    getContracts(accountId).catch(e => { logger.error(`[Intelligence] getContracts failed: ${e.message}`); return []; })
  ]);

  // Populate context and log data availability
  if (accountData) {
    context.account = accountData;
    context.customerBrain = accountData.customerBrain;
    logger.info(`[Intelligence] Account data loaded: ${accountData.name}`);
    
    // PHASE 1 MIGRATION: Parse meeting notes directly from Customer_Brain__c (Salesforce)
    // instead of using SQLite-based intelligenceStore
    context.meetingNotes = parseCustomerBrainNotes(accountData.customerBrain);
    logger.info(`[Intelligence] Parsed ${context.meetingNotes.length} meeting notes from Customer_Brain__c`);
  } else {
    logger.warn(`[Intelligence] No account data returned for ID: ${accountId}`);
    context.meetingNotes = [];
  }
  
  context.opportunities = opportunities || [];
  context.contracts = contracts || [];
  context.contacts = contacts || [];
  context.recentTasks = tasks || [];
  context.recentEvents = events || [];
  
  // Note: obsidianNotes now come from Customer_Brain__c (Salesforce)
  // slackIntel comes from file-based cache (data/slack-intel-cache.json)
  context.obsidianNotes = context.meetingNotes; // Alias for backward compatibility
  context.slackIntel = getIntelForAccount(accountId); // Load from file cache
  
  if (context.slackIntel.length > 0) {
    logger.debug(`[Intelligence] Loaded ${context.slackIntel.length} Slack intel items for ${accountId}`);
  }

  // Vector search: find semantically relevant context for the query
  context.vectorResults = [];
  if (vectorSearch && vectorSearch.isHealthy() && query) {
    try {
      const vResults = await vectorSearch.search(query, { accountId, limit: 5 });
      context.vectorResults = vResults;
      if (vResults.length > 0) {
        logger.info(`[Intelligence] Vector search returned ${vResults.length} results for "${query.substring(0, 40)}"`);
      }
    } catch (err) {
      logger.warn('[Intelligence] Vector search error:', err.message);
    }
  }
  
  // Log data summary for debugging
  logger.info(`[Intelligence] Context summary for ${context.account?.name || accountId}: ` +
    `${context.opportunities.length} opps, ${context.contacts.length} contacts, ` +
    `${context.recentTasks.length} tasks, ${context.recentEvents.length} events, ` +
    `${context.meetingNotes.length} meeting notes, customerBrain: ${context.customerBrain ? 'yes' : 'no'}` +
    `${context.vectorResults.length > 0 ? `, ${context.vectorResults.length} vector matches` : ''}`);

  // Get upcoming meeting if relevant
  if (intent === 'PRE_MEETING') {
    context.upcomingMeeting = await getUpcomingMeeting(accountId);
  }

  // Cache in memory only (ephemeral, no disk persistence)
  // This replaces Redis cache for compliance
  setMemoryCachedContext(accountId, context);

  return context;
}

/**
 * Get detailed account information including enriched fields
 */
async function getAccountDetails(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Customer_Subtype__c,
             Industry, Website, Description, BillingCity, BillingState, BillingCountry,
             Customer_Brain__c, Pain_Points_Identified__c, Competitive_Landscape__c,
             Key_Decision_Makers__c, Account_Plan_s__c, Target_LOI_Sign_Date__c,
             CLO_Engaged__c, Legal_Department_Size__c, First_Deal_Closed__c,
             LastActivityDate
      FROM Account
      WHERE Id = '${accountId}'
      LIMIT 1
    `, true);

    const acc = result?.records?.[0];
    if (!acc) return null;

    return {
      id: acc.Id,
      name: acc.Name,
      owner: acc.Owner?.Name,
      ownerEmail: acc.Owner?.Email,
      type: acc.Customer_Type__c,
      subtype: acc.Customer_Subtype__c,
      industry: acc.Industry,
      website: acc.Website,
      description: acc.Description,
      location: [acc.BillingCity, acc.BillingState, acc.BillingCountry].filter(Boolean).join(', '),
      customerBrain: acc.Customer_Brain__c,
      painPoints: acc.Pain_Points_Identified__c,
      competitiveLandscape: acc.Competitive_Landscape__c,
      keyDecisionMakers: acc.Key_Decision_Makers__c,
      accountPlan: acc.Account_Plan_s__c,
      targetLOIDate: acc.Target_LOI_Sign_Date__c,
      cloEngaged: acc.CLO_Engaged__c,
      legalDeptSize: acc.Legal_Department_Size__c,
      firstDealClosed: acc.First_Deal_Closed__c,
      lastActivityDate: acc.LastActivityDate
    };
  } catch (error) {
    logger.error('[Intelligence] Account query error:', error.message);
    return null;
  }
}

/**
 * Get opportunities for an account
 */
async function getOpportunities(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Name, StageName, ACV__c, Weighted_ACV__c, CloseDate, Target_LOI_Date__c,
             Product_Line__c, Product_Lines_Multi__c, Products_Breakdown__c,
             Owner.Name, NextStep, Probability, Days_in_Stage__c,
             Revenue_Type__c, Type, IsClosed, IsWon, LastActivityDate,
             TCV__c, TCV_Calculated__c, Term__c,
             CS_Products_Purchased__c, CS_Commercial_Terms__c, CS_Commercial_Notes__c,
             CS_Customer_Goals__c, CS_Key_Stakeholders__c, CS_Auto_Renew__c,
             CS_Contract_Term__c
      FROM Opportunity
      WHERE AccountId = '${accountId}'
      ORDER BY IsClosed ASC, CloseDate ASC
      LIMIT 20
    `, true);

    return (result?.records || []).map(opp => ({
      id: opp.Id,
      name: opp.Name,
      stage: opp.StageName,
      acv: opp.ACV__c,
      weightedAcv: opp.Weighted_ACV__c,
      closeDate: opp.CloseDate,
      targetLOIDate: opp.Target_LOI_Date__c,
      productLine: opp.Product_Line__c,
      productLinesMulti: opp.Product_Lines_Multi__c,
      productsBreakdown: opp.Products_Breakdown__c,
      owner: opp.Owner?.Name,
      nextStep: opp.NextStep,
      probability: opp.Probability,
      daysInStage: opp.Days_in_Stage__c,
      revenueType: opp.Revenue_Type__c,
      type: opp.Type,
      isClosed: opp.IsClosed,
      isWon: opp.IsWon,
      lastActivity: opp.LastActivityDate,
      tcv: opp.TCV__c,
      tcvCalculated: opp.TCV_Calculated__c,
      term: opp.Term__c,
      productsPurchased: opp.CS_Products_Purchased__c,
      commercialTerms: opp.CS_Commercial_Terms__c,
      commercialNotes: opp.CS_Commercial_Notes__c,
      customerGoals: opp.CS_Customer_Goals__c,
      keyStakeholders: opp.CS_Key_Stakeholders__c,
      autoRenew: opp.CS_Auto_Renew__c,
      contractTerm: opp.CS_Contract_Term__c
    }));
  } catch (error) {
    logger.error('[Intelligence] Opportunities query error:', error.message);
    return [];
  }
}

/**
 * Get contacts for an account
 */
async function getContacts(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Name, Title, Email, Phone, MobilePhone, 
             Owner.Name, CreatedDate, LastModifiedDate
      FROM Contact
      WHERE AccountId = '${accountId}'
      ORDER BY LastModifiedDate DESC
      LIMIT 10
    `, true);

    return (result?.records || []).map(c => ({
      id: c.Id,
      name: c.Name,
      title: c.Title,
      email: c.Email,
      phone: c.Phone || c.MobilePhone,
      lastModified: c.LastModifiedDate
    }));
  } catch (error) {
    logger.error('[Intelligence] Contacts query error:', error.message);
    return [];
  }
}

/**
 * Get recent tasks for an account
 */
async function getRecentTasks(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Subject, Status, ActivityDate, Description, Owner.Name, Priority
      FROM Task
      WHERE AccountId = '${accountId}'
        AND ActivityDate >= LAST_N_DAYS:90
      ORDER BY ActivityDate DESC
      LIMIT 10
    `, true);

    return (result?.records || []).map(t => ({
      id: t.Id,
      subject: t.Subject,
      status: t.Status,
      date: t.ActivityDate,
      description: t.Description?.substring(0, 200),
      owner: t.Owner?.Name,
      priority: t.Priority
    }));
  } catch (error) {
    logger.error('[Intelligence] Tasks query error:', error.message);
    return [];
  }
}

/**
 * Get recent events/meetings for an account
 */
async function getRecentEvents(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Subject, StartDateTime, EndDateTime, Description, Owner.Name
      FROM Event
      WHERE AccountId = '${accountId}'
        AND StartDateTime >= LAST_N_DAYS:90
      ORDER BY StartDateTime DESC
      LIMIT 10
    `, true);

    return (result?.records || []).map(e => ({
      id: e.Id,
      subject: e.Subject,
      startTime: e.StartDateTime,
      endTime: e.EndDateTime,
      description: e.Description?.substring(0, 200),
      owner: e.Owner?.Name
    }));
  } catch (error) {
    logger.error('[Intelligence] Events query error:', error.message);
    return [];
  }
}

/**
 * Get upcoming meeting for an account
 */
async function getUpcomingMeeting(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Subject, StartDateTime, Description, Owner.Name
      FROM Event
      WHERE AccountId = '${accountId}'
        AND StartDateTime >= TODAY
      ORDER BY StartDateTime ASC
      LIMIT 1
    `, true);

    const event = result?.records?.[0];
    if (!event) return null;

    return {
      subject: event.Subject,
      startTime: event.StartDateTime,
      description: event.Description,
      owner: event.Owner?.Name
    };
  } catch (error) {
    logger.error('[Intelligence] Upcoming meeting query error:', error.message);
    return null;
  }
}

/**
 * Get contracts for an account
 */
async function getContracts(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, ContractNumber, Status, StartDate, EndDate,
             Description, Owner.Name
      FROM Contract
      WHERE AccountId = '${accountId}'
      ORDER BY StartDate DESC
      LIMIT 10
    `, true);

    return (result?.records || []).map(c => ({
      id: c.Id,
      contractNumber: c.ContractNumber,
      status: c.Status,
      startDate: c.StartDate,
      endDate: c.EndDate,
      description: c.Description?.substring(0, 300),
      owner: c.Owner?.Name
    }));
  } catch (error) {
    // Contract object may not be accessible in all orgs — fail gracefully
    logger.warn('[Intelligence] Contracts query error (may not exist):', error.message);
    return [];
  }
}

/**
 * Find account by name (for account lookup queries)
 */
async function findAccountByName(accountName) {
  if (!accountName || accountName.trim().length === 0) return null;
  
  try {
    let cleanName = accountName.trim();
    
    // Pre-process: split concatenated names (Chsinc -> Chs inc, Libertymutual -> Liberty mutual)
    // Detect camelCase or concatenated words and insert spaces
    const splitName = cleanName
      .replace(/([a-z])([A-Z])/g, '$1 $2')           // camelCase: "LibertyMutual" -> "Liberty Mutual"
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');    // "CHSInc" -> "CHS Inc"
    if (splitName !== cleanName && splitName.includes(' ')) {
      logger.info(`[Intelligence] Pre-processed name: "${cleanName}" -> "${splitName}"`);
      cleanName = splitName;
    }
    
    const safeName = cleanName.replace(/'/g, "\\'");
    
    // Strategy 1: Exact match
    let result = await sfQuery(`
      SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account WHERE Name = '${safeName}' LIMIT 1
    `, true);
    if (result?.records?.[0]) {
      logger.info(`[Intelligence] Account found (exact): ${result.records[0].Name}`);
      return result.records[0];
    }
    
    // Strategy 2: LIKE match (contains)
    result = await sfQuery(`
      SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account WHERE Name LIKE '%${safeName}%'
      ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
    `, true);
    if (result?.records?.[0]) {
      logger.info(`[Intelligence] Account found (LIKE): ${result.records[0].Name}`);
      return result.records[0];
    }
    
    // Strategy 3: Try without common suffixes/prefixes
    const stripped = cleanName
      .replace(/\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Group|Holdings|PLC|S\.A\.?|AG|GmbH|Co\.?)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    if (stripped !== cleanName && stripped.length > 2) {
      const safeStripped = stripped.replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '%${safeStripped}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (stripped suffix): ${result.records[0].Name} (searched: "${stripped}")`);
        return result.records[0];
      }
    }
    
    // Strategy 4: First word only (for cases like "T-mobile" → "T-Mobile US")
    const firstWord = cleanName.split(/[\s\-\/]/)[0];
    if (firstWord.length >= 3 && firstWord !== cleanName) {
      const safeFirst = firstWord.replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '${safeFirst}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (first-word): ${result.records[0].Name} (searched: "${firstWord}")`);
        return result.records[0];
      }
    }
    
    // Strategy 5: Try original (pre-split) name if splitting changed it
    if (splitName !== accountName.trim()) {
      const safeOriginal = accountName.trim().replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '%${safeOriginal}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (original unsplit): ${result.records[0].Name}`);
        return result.records[0];
      }
    }
    
    logger.warn(`[Intelligence] No account found after 5 strategies for: "${accountName}"`);
    return null;
  } catch (error) {
    logger.error('[Intelligence] Account lookup error:', error.message);
    return null;
  }
}

/**
 * Gather context for pipeline overview queries
 */
async function gatherPipelineContext(userEmail) {
  try {
    // Fetch org-wide pipeline (not just user's deals) for broader visibility
    const ownerFilter = userEmail 
      ? `Owner.Email = '${userEmail}'` 
      : `IsClosed = false`;
    const result = await sfQuery(`
      SELECT Id, Name, AccountId, Account.Name, StageName, ACV__c, 
             CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep, Owner.Name
      FROM Opportunity
      WHERE IsClosed = false
      ORDER BY CloseDate ASC
      LIMIT 200
    `, true);

    const opportunities = result?.records || [];
    
    // Group by stage
    const byStage = {};
    let totalAcv = 0;
    
    const byOwner = {};
    for (const opp of opportunities) {
      const stage = opp.StageName || 'Unknown';
      if (!byStage[stage]) {
        byStage[stage] = { count: 0, totalAcv: 0, opps: [] };
      }
      byStage[stage].count++;
      byStage[stage].totalAcv += opp.ACV__c || 0;
      byStage[stage].opps.push({
        name: opp.Name,
        account: opp.Account?.Name,
        acv: opp.ACV__c,
        closeDate: opp.CloseDate,
        nextStep: opp.NextStep,
        owner: opp.Owner?.Name
      });
      totalAcv += opp.ACV__c || 0;
      
      const owner = opp.Owner?.Name || 'Unknown';
      if (!byOwner[owner]) byOwner[owner] = { count: 0, totalAcv: 0 };
      byOwner[owner].count++;
      byOwner[owner].totalAcv += opp.ACV__c || 0;
    }

    // Also count existing customers for "how many customers" queries
    let customerCount = 0;
    try {
      const custResult = await sfQuery(`
        SELECT COUNT() FROM Account WHERE Customer_Type__c IN ('Existing', 'Existing Customer', 'Existing / LOI', 'MSA')
      `, true);
      customerCount = custResult?.totalSize || 0;
    } catch (e) {
      logger.warn('[Intelligence] Customer count query failed:', e.message);
    }

    return {
      isPipelineQuery: true,
      userEmail,
      totalOpportunities: opportunities.length,
      totalAcv,
      byStage,
      byOwner,
      customerCount,
      dataFreshness: 'live'
    };
  } catch (error) {
    logger.error('[Intelligence] Pipeline context error:', error.message);
    return { isPipelineQuery: true, error: error.message };
  }
}

/**
 * Gather context for account lookup queries
 */
async function gatherAccountLookupContext(query) {
  // Extract potential account name from query
  const patterns = [
    /who owns (.+?)\??$/i,
    /owner of (.+?)\??$/i,
    /(.+?) owner/i
  ];

  let accountName = null;
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      accountName = match[1].trim();
      break;
    }
  }

  if (!accountName) {
    return { isLookupQuery: true, error: 'Could not extract account name from query' };
  }

  const account = await findAccountByName(accountName);
  
  return {
    isLookupQuery: true,
    searchedName: accountName,
    account: account ? {
      id: account.Id,
      name: account.Name,
      owner: account.Owner?.Name,
      ownerEmail: account.Owner?.Email,
      type: account.Customer_Type__c,
      industry: account.Industry
    } : null,
    dataFreshness: 'live'
  };
}

/**
 * Classify the account engagement type to tailor response framing and follow-up suggestions.
 * Returns: 'existing_customer' | 'active_pipeline' | 'historical' | 'cold' | 'unknown'
 */
function classifyAccountType(context) {
  if (!context || !context.account) return 'unknown';

  const type = (context.account.type || '').toLowerCase();
  const opps = context.opportunities || [];
  const openOpps = opps.filter(o => !o.isClosed);
  const wonOpps = opps.filter(o => o.isWon);
  const lostOpps = opps.filter(o => o.isClosed && !o.isWon);
  const contracts = context.contracts || [];
  const activeContracts = contracts.filter(c => (c.status || '').toLowerCase() === 'activated' || (c.status || '').toLowerCase() === 'active');

  // Existing customer: has won deals or active contracts or type explicitly says so
  if (wonOpps.length > 0 || activeContracts.length > 0 ||
      type.includes('existing') || type.includes('customer') || type.includes('client')) {
    return 'existing_customer';
  }

  // Active pipeline: has open (non-closed) opportunities
  if (openOpps.length > 0) {
    return 'active_pipeline';
  }

  // Historical: has closed/lost opportunities but nothing active
  if (lostOpps.length > 0 || opps.length > 0) {
    return 'historical';
  }

  return 'cold';
}

/**
 * Build optimized prompts based on query intent and context
 */
function buildPrompt({ intent, query, context }) {
  const accountType = classifyAccountType(context);
  context._accountType = accountType; // Expose to response builder
  const systemPrompt = buildSystemPrompt(intent, context, accountType);
  const userPrompt = buildUserPrompt(intent, query, context);
  
  return { systemPrompt, userPrompt };
}

/**
 * Build the system prompt for Claude
 */
function buildSystemPrompt(intent, context, accountType) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let basePrompt = `TODAY'S DATE: ${today}

You are gtm-brain, an AI sales intelligence assistant for Eudia, a legal AI company.
Your role is to help Business Leads prepare for meetings, track deals, and understand their accounts.

RESPONSE GUIDELINES:
- Be concise and actionable — sales reps are busy, every sentence must earn its place
- Lead with a 2-sentence executive summary before any details
- Use bullet points for all factual information — no long paragraphs
- Include specific names, dates, and dollar amounts when available
- If data is missing for a topic, OMIT that topic entirely — do not create a section saying "No data available" or "Not enough information"
- Never fabricate information — only use the data provided
- End with a specific, time-bound next step when applicable (not generic advice)
- Do NOT repeat information across sections — each fact appears exactly once
- Keep total response under 250 words unless the query explicitly asks for comprehensive detail

DATE HANDLING (CRITICAL — follow exactly):
- Today is ${today}. This is the ONLY source of truth for "now."
- Any date AFTER today is a data error — do NOT include it in the response. Silently skip any event, meeting, or activity with a future date.
- When listing engagement history, recent activity, or meetings, ONLY include dates that are ON or BEFORE today's date.
- Use absolute dates with relative context: e.g., "Feb 3 (~2 weeks ago)" — always frame as past tense for past events.
- NEVER describe past events as "upcoming", "planned", or "scheduled" if their date is before today. Past events already happened — use past tense.
- NEVER describe future-dated events at all — they are data errors.
- If CRM dates appear inconsistent, simply IGNORE them and work with the other available data.
- NEVER surface data quality warnings, date discrepancies, or "CRITICAL DATA ISSUE" messages to the user.
- NEVER tell the user to "verify" CRM data — just present what is available.

OBJECTIVITY:
- Be factual and objective. Report what the data shows, not what you infer.
- Do NOT editorialize deal health or sentiment unless directly supported by explicit quotes or data
- Avoid phrases like "progressing well", "strong momentum", "healthy engagement" unless directly stated in source data
- Do NOT add "Recommended Next Steps" unless the user specifically asks for recommendations
- Summarize what happened, who was involved, and what was discussed — let the reader draw conclusions

FORMATTING RULES (STRICT — follow exactly):
- NEVER use emojis — use text labels only (no icons, symbols, or emoji characters)
- Use **bold** for key metrics, names, and dollar amounts
- Use single bullet points (- ) for lists. CRITICAL: No blank lines between consecutive bullets — they must be on adjacent lines
- Use ## for section headers — but ONLY create a section if you have substantive content for it
- NEVER create a section header followed by "No data", "Not available", "None found", or similar — just skip that section entirely
- Section headers: place on their own line with the very first bullet IMMEDIATELY on the next line — no blank line gap after a header
- Between sections: exactly ONE blank line before each ## header (not two, not zero)
- NO blank lines between consecutive bullet points — ever
- NO blank lines after section headers before the first bullet — ever
- Keep the response tight — no padding, no filler sentences, no "Let me summarize" preamble
- NEVER repeat the same information in multiple sections
- When listing opportunities, contacts, or activities, use a compact inline format: "**Name** — detail, detail" on one line
- Format examples of correct structure:
  ## Active Contracts
  - **Contract 00133** — Active through Jan 30, 2029
  - **Contract 00108** — CAB participation, expires Sep 28, 2026

  ## Key Stakeholders
  - **Jeremy Jessen (GC)** — Primary champion, views Eudia as business-critical
  - **Mariel Gesualdo (Sr. Asst GC)** — Litigation lead, promotional review

ACTIVITY GAPS & ENGAGEMENT FRAMING:
- If there is a gap in activity, simply note the gap factually (e.g., "Last recorded activity was Dec 2") without alarm
- NEVER use words like "critical", "urgent", "concerning", "warning", or "issue" about activity gaps — just state the facts
- If data is sparse, work with what exists and note that limited context is available — do not speculate about why
- Frame gaps neutrally: "No recorded activity since [date]" is sufficient
- 2-14 days since last activity is normal and should not be mentioned at all
- Do NOT manufacture urgency — summarize factually and let the reader draw conclusions
- Frame objectively based on actual data, not dramatic language

DATA LIMITATIONS:
- If the user asks about data you don't have (billing details, internal wikis, email threads), acknowledge what data you DO have access to and suggest where they might find what they need
- Never fabricate details about contracts, pricing, or terms. If the data isn't in the context provided, say so directly: "I don't have [X] in the account data. Check [specific place]."
- If a question is ambiguous, interpret it in the most useful way rather than asking for clarification. If "products" could mean product lines or specific SKUs, answer with what you have (product lines) and note if more detail is available elsewhere
- When data is sparse, work with what exists and note limitations briefly — do not fill gaps with speculation

FOLLOW-UP SUGGESTIONS:
- At the very end of every response, after a "---" separator, include exactly 2 brief follow-up questions
- Format as: "---\\nYou might also ask:\\n1. [question]\\n2. [question]"
- CRITICAL: Use REAL names, accounts, and specifics from your answer -- NEVER use brackets or placeholders like [account name] or [specific opportunity]. If you mentioned Jeremy Jessen, suggest "What's Jeremy Jessen's engagement history?" not "Who is the [champion]?"
- ONLY suggest questions that drill deeper into data you just referenced
- Do NOT suggest questions about data you don't have
- If there is genuinely nothing useful to suggest, omit the follow-up section entirely
- Keep each suggestion under 10 words`;

  // ── Account-type-specific framing ──
  if (accountType === 'existing_customer') {
    basePrompt += `

ACCOUNT TYPE: EXISTING CUSTOMER
This is an active paying customer. Your response framing must reflect this relationship:
- Lead with the existing relationship context: products in use, contract status, renewal timeline
- Emphasize customer health, satisfaction signals, and expansion potential
- Frame around retention and growth, NOT acquisition
- Highlight any CS handover notes, customer goals, or auto-renewal status
- When suggesting follow-ups, focus on: renewal risk, expansion opportunities, product adoption, NPS/satisfaction, stakeholder changes
- NEVER frame an existing customer as a "prospect" or suggest "discovery" activities`;
  } else if (accountType === 'active_pipeline') {
    basePrompt += `

ACCOUNT TYPE: ACTIVE PIPELINE
This account has open opportunities being actively worked. Your response framing must reflect deal progression:
- Lead with deal mechanics: current stage, ACV, timeline, probability
- Highlight next steps, blockers, and MEDDICC gaps
- Frame around deal velocity and close probability
- Surface any competitive threats or stakeholder concerns
- When suggesting follow-ups, focus on: next steps, stakeholder mapping, competitive positioning, deal risks, timeline to close`;
  } else if (accountType === 'historical') {
    basePrompt += `

ACCOUNT TYPE: HISTORICAL ENGAGEMENT
This account has prior opportunity history but nothing currently active. Your response framing must reflect re-engagement:
- Lead with what happened previously: last opportunity, why it closed (won/lost), when
- Note the time gap since last engagement
- Frame around re-engagement potential and what has changed since last interaction
- When suggesting follow-ups, focus on: why it was lost, who the contacts were, what has changed at the company, re-engagement strategy`;
  } else if (accountType === 'cold') {
    basePrompt += `

ACCOUNT TYPE: COLD / NET NEW
This account has no opportunity history. Your response framing must reflect prospecting:
- Lead with what is known: industry, company size, any available context
- Be transparent about limited data — do not speculate beyond what exists
- Frame around initial outreach and positioning
- When suggesting follow-ups, focus on: identifying decision makers, understanding pain points, determining ICP fit, crafting outreach messaging`;
  }

  // Add intent-specific instructions
  switch (intent) {
    case 'PRE_MEETING':
      return basePrompt + `\n\nFOCUS: Pre-meeting preparation. Prioritize:
1. Deal status and recent developments
2. Key stakeholders and their roles
3. Outstanding action items
4. Any risks or concerns to address`;

    case 'DEAL_STATUS':
      return basePrompt + `\n\nFOCUS: Deal status update. Prioritize:
1. Current stage and timeline
2. ACV and probability
3. Next steps and blockers
4. Days in current stage`;

    case 'STAKEHOLDERS':
      return basePrompt + `\n\nFOCUS: Stakeholder mapping. Prioritize:
1. Key decision makers with titles
2. Champions and coaches
3. Economic buyers
4. Recent interactions with each`;

    case 'NEXT_STEPS':
      return basePrompt + `\n\nFOCUS: Action items. Prioritize:
1. Outstanding next steps from opportunities
2. Open tasks
3. Follow-ups mentioned in recent notes
4. Overdue items`;

    case 'PIPELINE_OVERVIEW':
      return basePrompt + `\n\nFOCUS: Pipeline summary. Prioritize:
1. Total pipeline value by stage
2. Late-stage opportunities
3. Deals needing attention
4. Upcoming close dates`;

    default:
      return basePrompt;
  }
}

/**
 * Build the user prompt with context
 */
function buildUserPrompt(intent, query, context) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let prompt = `TODAY'S DATE: ${today}\nUSER QUERY: ${query}\n\n`;

  // Context quality note (when data is sparse)
  if (context.qualityNote) {
    prompt += `${context.qualityNote}\n\n`;
  }

  // Handle pipeline queries
  if (context.isPipelineQuery) {
    prompt += `PIPELINE DATA (ORG-WIDE):\n`;
    prompt += `• Total Open Opportunities: ${context.totalOpportunities}\n`;
    prompt += `• Total Pipeline ACV: $${(context.totalAcv || 0).toLocaleString()}\n`;
    if (context.customerCount) {
      prompt += `• Existing Customers (active accounts): ${context.customerCount}\n`;
    }
    prompt += '\n';
    
    if (context.byStage) {
      prompt += `BY STAGE:\n`;
      for (const [stage, data] of Object.entries(context.byStage)) {
        prompt += `\n${stage} (${data.count} opps, $${data.totalAcv.toLocaleString()}):\n`;
        for (const opp of data.opps.slice(0, 8)) {
          prompt += `  • ${opp.name} (${opp.account})`;
          if (opp.owner) prompt += ` [${opp.owner}]`;
          prompt += ` - $${(opp.acv || 0).toLocaleString()}`;
          if (opp.closeDate) prompt += ` - Close: ${opp.closeDate}`;
          prompt += '\n';
        }
      }
    }
    
    if (context.byOwner && Object.keys(context.byOwner).length > 0) {
      prompt += `\nBY OWNER:\n`;
      for (const [owner, data] of Object.entries(context.byOwner)) {
        prompt += `  • ${owner}: ${data.count} deals, $${data.totalAcv.toLocaleString()} ACV\n`;
      }
    }
    return prompt;
  }

  // Handle account lookup queries
  if (context.isLookupQuery) {
    if (context.account) {
      prompt += `ACCOUNT FOUND:\n`;
      prompt += `• Name: ${context.account.name}\n`;
      prompt += `• Owner: ${context.account.owner}\n`;
      if (context.account.ownerEmail) prompt += `• Owner Email: ${context.account.ownerEmail}\n`;
      if (context.account.type) prompt += `• Type: ${context.account.type}\n`;
      if (context.account.industry) prompt += `• Industry: ${context.account.industry}\n`;
    } else {
      prompt += `No account found matching "${context.searchedName}".\n`;
    }
    return prompt;
  }

  // Account-specific context
  if (context.account) {
    prompt += `ACCOUNT: ${context.account.name}\n`;
    prompt += `• Owner: ${context.account.owner || 'Unknown'}\n`;
    prompt += `• Type: ${context.account.type || 'Unknown'}\n`;
    if (context.account.industry) prompt += `• Industry: ${context.account.industry}\n`;
    if (context.account.location) prompt += `• Location: ${context.account.location}\n`;
    if (context.account.lastActivityDate) {
      prompt += `• Last Activity: ${context.account.lastActivityDate}\n`;
      // Calculate activity health for AI context
      const lastActivityDate = new Date(context.account.lastActivityDate);
      const daysSinceActivity = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
      let activityHealth;
      if (daysSinceActivity <= 7) {
        activityHealth = 'HEALTHY - very recent engagement';
      } else if (daysSinceActivity <= 14) {
        activityHealth = 'HEALTHY - recently engaged';
      } else if (daysSinceActivity <= 30) {
        activityHealth = 'MODERATE - may need follow-up soon';
      } else {
        activityHealth = 'STALE - requires attention';
      }
      prompt += `• Activity Health: ${activityHealth} (${daysSinceActivity} days since last activity)\n`;
    }
    prompt += '\n';
  }

  // Opportunities
  if (context.opportunities?.length > 0) {
    const openOpps = context.opportunities.filter(o => !o.isClosed);
    const closedOpps = context.opportunities.filter(o => o.isClosed);
    
    if (openOpps.length > 0) {
      prompt += `OPEN OPPORTUNITIES (${openOpps.length}):\n`;
      for (const opp of openOpps) {
        prompt += `• ${opp.name}\n`;
        prompt += `  Stage: ${opp.stage} | ACV: $${(opp.acv || 0).toLocaleString()}`;
        if (opp.daysInStage) prompt += ` | ${opp.daysInStage} days in stage`;
        prompt += '\n';
        if (opp.nextStep) prompt += `  Next Step: ${opp.nextStep}\n`;
        if (opp.targetLOIDate) prompt += `  Target LOI: ${opp.targetLOIDate}\n`;
      }
      prompt += '\n';
    }
  }

  // Products & Commercial Terms (from Opportunity fields)
  const allOpps = context.opportunities || [];
  const productsData = [];
  const commercialData = [];
  for (const opp of allOpps) {
    if (opp.productsBreakdown) productsData.push(`${opp.name}: ${opp.productsBreakdown}`);
    if (opp.productsPurchased) productsData.push(`${opp.name} purchased: ${opp.productsPurchased}`);
    if (opp.productLinesMulti) productsData.push(`${opp.name} product lines: ${opp.productLinesMulti}`);
    if (opp.commercialTerms) commercialData.push(`${opp.name}: ${opp.commercialTerms}`);
    if (opp.commercialNotes) commercialData.push(`${opp.name} notes: ${opp.commercialNotes}`);
  }
  if (productsData.length > 0) {
    prompt += `PRODUCTS & PRODUCT LINES:\n`;
    for (const pd of productsData) {
      prompt += `• ${pd}\n`;
    }
    // Add TCV/term info for won or active opps
    for (const opp of allOpps.filter(o => o.tcv || o.tcvCalculated || o.term)) {
      const tcvVal = opp.tcv || opp.tcvCalculated;
      const parts = [opp.name];
      if (tcvVal) parts.push(`TCV: $${tcvVal.toLocaleString()}`);
      if (opp.term) parts.push(`Term: ${opp.term} months`);
      if (opp.autoRenew) parts.push('Auto-Renew: Yes');
      if (opp.contractTerm) parts.push(`Contract Term: ${opp.contractTerm}`);
      prompt += `• ${parts.join(' | ')}\n`;
    }
    prompt += '\n';
  }
  if (commercialData.length > 0) {
    prompt += `COMMERCIAL TERMS:\n`;
    for (const cd of commercialData) {
      prompt += `• ${cd}\n`;
    }
    prompt += '\n';
  }

  // Customer goals (from CS handover fields)
  const customerGoals = allOpps.filter(o => o.customerGoals).map(o => `${o.name}: ${o.customerGoals}`);
  if (customerGoals.length > 0) {
    prompt += `CUSTOMER GOALS:\n`;
    for (const cg of customerGoals) {
      prompt += `• ${cg}\n`;
    }
    prompt += '\n';
  }

  // Contracts
  if (context.contracts?.length > 0) {
    prompt += `CONTRACTS (${context.contracts.length}):\n`;
    for (const contract of context.contracts) {
      prompt += `• ${contract.contractNumber || 'Contract'} — Status: ${contract.status || 'Unknown'}`;
      if (contract.startDate) prompt += ` | Start: ${contract.startDate}`;
      if (contract.endDate) prompt += ` | End: ${contract.endDate}`;
      if (contract.description) prompt += `\n  ${contract.description}`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  // Contacts
  if (context.contacts?.length > 0) {
    prompt += `KEY CONTACTS (${context.contacts.length}):\n`;
    for (const contact of context.contacts.slice(0, 5)) {
      prompt += `• ${contact.name}`;
      if (contact.title) prompt += ` - ${contact.title}`;
      if (contact.email) prompt += ` (${contact.email})`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  // Key decision makers (from Account field)
  if (context.account?.keyDecisionMakers) {
    prompt += `KEY DECISION MAKERS:\n${context.account.keyDecisionMakers}\n\n`;
  }

  // Pain points
  if (context.account?.painPoints) {
    prompt += `PAIN POINTS IDENTIFIED:\n${context.account.painPoints}\n\n`;
  }

  // Competitive landscape
  if (context.account?.competitiveLandscape) {
    prompt += `COMPETITIVE LANDSCAPE:\n${context.account.competitiveLandscape}\n\n`;
  }

  // Recent tasks
  if (context.recentTasks?.length > 0) {
    const openTasks = context.recentTasks.filter(t => t.status !== 'Completed');
    if (openTasks.length > 0) {
      prompt += `OPEN TASKS (${openTasks.length}):\n`;
      for (const task of openTasks.slice(0, 5)) {
        prompt += `• ${task.subject}`;
        if (task.date) prompt += ` (Due: ${task.date})`;
        prompt += '\n';
      }
      prompt += '\n';
    }
  }

  // Recent events/meetings with recency context
  if (context.recentEvents?.length > 0) {
    prompt += `RECENT MEETINGS (${context.recentEvents.length}):\n`;
    const now = new Date();
    for (const event of context.recentEvents.slice(0, 5)) {
      const eventDate = event.startTime?.split('T')[0];
      prompt += `• ${eventDate}: ${event.subject}`;
      
      // Add days-ago context for AI to understand recency
      if (event.startTime) {
        const daysAgo = Math.floor((now.getTime() - new Date(event.startTime).getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo === 0) {
          prompt += ' [TODAY]';
        } else if (daysAgo === 1) {
          prompt += ' [YESTERDAY]';
        } else if (daysAgo <= 7) {
          prompt += ` [${daysAgo} days ago - RECENT]`;
        } else if (daysAgo <= 14) {
          prompt += ` [${daysAgo} days ago]`;
        }
      }
      prompt += '\n';
    }
    prompt += '\n';
  }

  // Customer Brain (meeting history) - summarize if long
  if (context.customerBrain) {
    const brainContent = context.customerBrain.length > 3000 
      ? context.customerBrain.substring(0, 3000) + '... [truncated]'
      : context.customerBrain;
    prompt += `MEETING HISTORY (Customer Brain):\n${brainContent}\n\n`;
  }

  // Obsidian notes
  if (context.obsidianNotes?.length > 0) {
    prompt += `RECENT NOTES FROM VAULT (${context.obsidianNotes.length}):\n`;
    for (const note of context.obsidianNotes.slice(0, 3)) {
      prompt += `• ${note.title || 'Untitled'} (${note.date || 'Unknown date'})\n`;
      if (note.summary) prompt += `  Summary: ${note.summary.substring(0, 200)}\n`;
    }
    prompt += '\n';
  }

  // Slack intelligence
  if (context.slackIntel?.length > 0) {
    prompt += `SLACK INTELLIGENCE (${context.slackIntel.length} signals):\n`;
    for (const signal of context.slackIntel.slice(0, 3)) {
      prompt += `• ${signal.category}: ${signal.summary}\n`;
    }
    prompt += '\n';
  }

  // Semantic search results (if vector search enabled)
  if (context.vectorResults?.length > 0) {
    prompt += `RELATED CONTEXT (semantic match):\n`;
    for (const result of context.vectorResults.slice(0, 3)) {
      const source = result.metadata?.sourceType || 'note';
      prompt += `• [${source}] ${result.text.substring(0, 300)}\n`;
    }
    prompt += '\n';
  }

  // Upcoming meeting context
  if (context.upcomingMeeting) {
    prompt += `UPCOMING MEETING:\n`;
    prompt += `• ${context.upcomingMeeting.subject}\n`;
    prompt += `• Time: ${context.upcomingMeeting.startTime}\n`;
    if (context.upcomingMeeting.description) {
      prompt += `• Agenda: ${context.upcomingMeeting.description.substring(0, 200)}\n`;
    }
    prompt += '\n';
  }

  // If no context available
  if (!context.account && !context.isPipelineQuery && !context.isLookupQuery) {
    prompt += `NOTE: No specific account context available. Provide a general response based on the query.\n`;
  }

  return prompt;
}

/**
 * Invalidate cache for an account (call when data changes)
 */
async function invalidateCache(accountId) {
  if (accountId) {
    // Clear both Redis and in-memory caches so the next query fetches live data
    await cache.del(`intel_context:${accountId}`);
    accountContextCache.delete(accountId);
    logger.debug(`[Intelligence] Cache invalidated (Redis + memory) for account ${accountId}`);
  }
}

/**
 * Health check for the service
 */
function isHealthy() {
  return !!anthropic;
}

module.exports = {
  processQuery,
  invalidateCache,
  isHealthy,
  classifyQueryIntent,
  parseCustomerBrainNotes,
  // Expose for testing
  gatherContext,
  buildPrompt,
  // Expose data-gathering functions for account enrichment
  getAccountDetails,
  getContacts,
  getContracts,
  getOpportunities,
  getRecentTasks,
  getRecentEvents
};
