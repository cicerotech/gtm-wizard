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

// Weekly snapshot data bridge — reuses the proven SOQL from the weekly PDF
let weeklySnapshotBridge = null;
try {
  const { queryPipelineData, queryAIEnabledForecast, ACTIVE_STAGES } = require('../slack/blWeeklySummary');
  weeklySnapshotBridge = { queryPipelineData, queryAIEnabledForecast, ACTIVE_STAGES };
  logger.info('[Intelligence] Weekly snapshot data bridge loaded');
} catch (err) {
  logger.warn('[Intelligence] Weekly snapshot bridge not available:', err.message);
}

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
// Cross-account signals: queries that should ALWAYS route to pipeline context
// regardless of whether an account is selected
const CROSS_ACCOUNT_SIGNALS = [
  /how many (accounts|deals|opportunities|logos|customers|clients)/i,
  /what (accounts|deals|opportunities) are/i,
  /which (accounts|deals|opportunities|contacts) /i,
  /across (the|our|all) /i,
  /in (the|our) pipeline/i,
  /total pipeline/i,
  /pipeline (summary|overview|status)/i,
  /deals (in|at) (negotiation|proposal|pilot|late stage|stage)/i,
  /opportunities (in|at) (negotiation|proposal|pilot|late stage|stage)/i,
  /what deals are (late|in|at|closing)/i,
  /how many (customers|logos|clients) do we/i,
];

const PRODUCT_LINE_MAP = {
  'contracting': { value: 'AI-Augmented Contracting', partial: true },
  'managed contracting': { value: 'AI-Augmented Contracting_Managed Services', partial: false },
  'in-house contracting': { value: 'AI-Augmented Contracting_In-House Technology', partial: false },
  'm&a': { value: 'AI-Augmented M&A_Managed Service', partial: false },
  'mna': { value: 'AI-Augmented M&A_Managed Service', partial: false },
  'm and a': { value: 'AI-Augmented M&A_Managed Service', partial: false },
  'compliance': { value: 'AI-Augmented Compliance_In-House Technology', partial: false },
  'sigma': { value: 'AI Platform - Sigma', partial: false },
  'insights': { value: 'AI Platform - Insights', partial: false },
  'litigation': { value: 'AI Platform - Litigation', partial: false },
  'custom agents': { value: 'FDE - Custom AI Solution', partial: false },
  'fde': { value: 'FDE - Custom AI Solution', partial: false },
};

// Intent keywords ordered by specificity (cross-account intents FIRST to prevent
// generic words like 'stage' or 'pipeline' from hijacking account-specific intents)
const QUERY_INTENTS = {
  CUSTOMER_COUNT: ['how many customers', 'how many logos', 'customer count', 'number of customers', 'total customers', 'how many clients', 'customer list', 'logo count', 'how many customer', 'how many logos'],
  CONTACT_SEARCH: ['chief legal officer', 'general counsel', 'clo based in', 'gc based in', 'contacts based in', 'contacts in', 'decision makers in', 'find contacts', 'clos owned by'],
  PIPELINE_OVERVIEW: ['my pipeline', 'my deals', 'late stage', 'forecast', 'how many deal', 'how many account', 'total pipeline', 'closing this month', 'closing this quarter', 'in our pipeline', 'pipeline summary', 'deals closing', 'new logo', 'won this month', 'won this quarter', 'signed this month', 'signed this quarter', 'lost this', 'what deals are', 'what opportunities are', 'which deals', 'which opportunities', 'deals in negotiation', 'deals in proposal', 'deals in pilot', 'negotiation', 'proposal stage', 'late stage contracting', 'late stage compliance', 'late stage m&a', 'contracting deals', 'compliance deals', 'pipeline by'],
  OWNER_ACCOUNTS: ['what accounts does', "'s accounts", "'s book", "'s pipeline", "'s deals", 'accounts does', 'book for'],
  MEETING_ACTIVITY: ['met with this week', 'meeting with this week', 'meetings this week', 'met with today', 'meeting with today', 'calls this week', 'meetings scheduled'],
  ACCOUNT_LOOKUP: ['who owns', 'owner of', 'assigned to'],
  PRE_MEETING: ['before my', 'next meeting', 'should i know', 'meeting prep', 'prepare for'],
  DEAL_STATUS: ['deal status', 'current status', 'where are we', 'how is the deal', 'where are they', 'where is the deal', 'deal stage'],
  STAKEHOLDERS: ['decision maker', 'stakeholder', 'champion', 'who is', 'who are', 'key contacts'],
  HISTORY: ['last meeting', 'when did we', 'history', 'previous', 'last time'],
  NEXT_STEPS: ['next step', 'action item', 'todo', 'follow up', 'outstanding'],
  PAIN_POINTS: ['pain point', 'challenge', 'problem', 'issue', 'struggle'],
  COMPETITIVE: ['competitor', 'competitive', 'alternative', 'vs', 'compared to'],
};

const BL_NAME_MAP = {
  'riley': { name: 'Riley Stack', email: 'riley.stack@eudia.com' },
  'olivia': { name: 'Olivia Jung', email: 'olivia.jung@eudia.com' },
  'julie': { name: 'Julie Stefanich', email: 'julie.stefanich@eudia.com' },
  'asad': { name: 'Asad Hussain', email: 'asad.hussain@eudia.com' },
  'ananth': { name: 'Ananth Cherukupally', email: 'ananth.cherukupally@eudia.com' },
  'nathan': { name: 'Nathan Shine', email: 'nathan.shine@eudia.com' },
  'justin': { name: 'Justin Hills', email: 'justin.hills@eudia.com' },
  'sean': { name: 'Sean Boyd', email: 'sean.boyd@eudia.com' },
  'mike': { name: 'Mike Masiello', email: 'mike.masiello@eudia.com' },
  'greg': { name: 'Greg MacHale', email: 'greg.machale@eudia.com' },
  'tom': { name: 'Tom Clancy', email: 'tom.clancy@eudia.com' },
  'nicola': { name: 'Nicola Fratini', email: 'nicola.fratini@eudia.com' },
  'conor': { name: 'Conor Molloy', email: 'conor.molloy@eudia.com' },
  'alex': { name: 'Alex Fox', email: 'alex.fox@eudia.com' },
  'emer': { name: 'Emer Flynn', email: 'emer.flynn@eudia.com' },
  'riona': { name: 'Riona McHale', email: 'riona.mchale@eudia.com' },
  'himanshu': { name: 'Himanshu Agarwal', email: 'himanshu.agarwal@eudia.com' },
  'david': { name: 'David Van Ryk', email: 'david.vanryk@eudia.com' },
  'stephen': { name: 'Stephen Mulholland', email: 'stephen.mulholland@eudia.com' },
  'mitchell': { name: 'Mitchell Loquaci', email: 'mitchell.loquaci@eudia.com' },
};

function extractBLName(query) {
  const lower = query.toLowerCase();
  for (const [key, bl] of Object.entries(BL_NAME_MAP)) {
    const keyPattern = new RegExp('\\b' + key + '\\b', 'i');
    if (keyPattern.test(lower) || lower.includes(bl.name.toLowerCase())) return bl;
  }
  return null;
}

const UNASSIGNED_HOLDERS = ['Keigan Pesenti', 'Emmit Hood', 'Emmitt Hood', 'Mark Runyon', 'Derreck Chu', 'Sarah Rakhine'];

/**
 * Extract a potential account name from free-text queries.
 * Handles patterns like "tell me about Coherent", "deal status at Intuit", "what about CHS?"
 */
function extractAccountFromQuery(query) {
  const patterns = [
    /\btell me about\s+(.+?)(?:\?|$)/i,
    /\bwhat(?:'s| is)(?: the)?(?: .*?)?\s+(?:at|for|with|on)\s+(.+?)(?:\?|$)/i,
    /\b(?:overview|status|update|info|details|contacts?|pipeline)\s+(?:for|at|on|of)\s+(.+?)(?:\?|$)/i,
    /\b(?:for|at|about|on)\s+(.+?)(?:\?|\.|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      let candidate = match[1].trim()
        .replace(/^(the|this|my|our)\s+/i, '')
        .replace(/[?.!]+$/, '')
        .trim();
      if (candidate.length >= 3 && candidate.length <= 60 && !/^(pipeline|deal|account|meeting|contact|team|stage|product|quarter|month|year|week|today|tomorrow|upcoming|recent|next|steps|strategy|status|update|latest|history|overview|summary|report|forecast|owner|revenue|customer|prospect|lead)s?$/i.test(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function maskOwnerIfUnassigned(ownerName) {
  if (!ownerName) return 'Unassigned';
  return UNASSIGNED_HOLDERS.includes(ownerName) ? 'Unassigned' : ownerName;
}

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

    // Cross-account signal detection: if the query is clearly about the whole pipeline,
    // override any selected account so it routes to pipeline context
    if (CROSS_ACCOUNT_SIGNALS.some(p => p.test(query))) {
      if (accountId || accountName) {
        logger.info(`[Intelligence] Cross-account signal detected, clearing account context for pipeline query`);
      }
      accountId = '';
      accountName = '';
    }

    // Classify the query intent (async — uses ML cascade when available)
    const intent = await classifyQueryIntent(query);
    logger.info(`[Intelligence] Query intent: ${intent}`, { 
      query: query.substring(0, 50), 
      forceRefresh: !!forceRefresh,
      sessionId: currentSessionId,
      turn: turnNumber,
      queryHints: Object.keys(queryHints).filter(k => queryHints[k])
    });

    // Free-text account extraction: if no account selected, try to extract from query
    if (!accountId && !accountName && !['PIPELINE_OVERVIEW', 'OWNER_ACCOUNTS', 'MEETING_ACTIVITY', 'CUSTOMER_COUNT', 'CONTACT_SEARCH'].includes(intent)) {
      const extracted = extractAccountFromQuery(query);
      if (extracted) {
        accountName = extracted;
        logger.info(`[Intelligence] Extracted account name from query: "${extracted}"`);
      }
    }

    // Gather context — reuse from session if fresh enough and not forcing refresh
    let context;
    const sessionContextAge = session?.gatheredContext?._gatheredAt ? Date.now() - session.gatheredContext._gatheredAt : Infinity;
    const isSessionContextFresh = sessionContextAge < (CACHE_TTL.ACCOUNT_CONTEXT * 1000);
    if (ENABLE_MULTI_TURN && session && session.gatheredContext && !forceRefresh && turnNumber > 1 && isSessionContextFresh) {
      context = session.gatheredContext;
      context.dataFreshness = 'session-cached';
      logger.info(`[Intelligence] Reusing session context (turn ${turnNumber}, age ${Math.round(sessionContextAge/1000)}s)`);
    } else {
      context = await gatherContext({
        intent,
        query,
        accountId: accountId || (session?.accountId),
        accountName: accountName || (session?.accountName),
        userEmail,
        forceRefresh: !!forceRefresh
      });
      context._gatheredAt = Date.now();
      if (ENABLE_MULTI_TURN && session) {
        session.gatheredContext = context;
      }
    }

    // Gracious disambiguation: if no account context and not a cross-account query, guide the user
    if (!context.account && !context.isPipelineQuery && !context.isOwnerQuery && !context.isMeetingQuery && !context.isLookupQuery && !context.isCustomerCountQuery && !context.isContactSearchQuery) {
      const duration = Date.now() - startTime;
      return {
        success: true,
        query,
        answer: "I'd like to help, but I need a bit more context to give you an accurate answer.\n\n" +
          "## Try one of these\n" +
          "- **Select an account** from the search bar above for account-specific questions\n" +
          "- **Ask about the pipeline** — \"What deals are late stage?\" or \"What's the total pipeline?\"\n" +
          "- **Ask about a BL's book** — \"What accounts does Riley own?\"\n" +
          "- **Ask about meetings** — \"What accounts did we meet with this week?\"\n" +
          "- **Mention a company name** — \"Tell me about Coherent\" or \"Deal status at Intuit\"\n\n" +
          "Selecting an account first gives you the most detailed answers.",
        intent: 'DISAMBIGUATION',
        sessionId: currentSessionId || undefined,
        turnNumber,
        context: { intent: 'DISAMBIGUATION', dataFreshness: 'n/a' },
        performance: { durationMs: duration },
        timestamp: new Date().toISOString()
      };
    }

    // Context quality scoring — let Claude know when data is sparse
    const contextQuality = [];
    if (!context.account) contextQuality.push('no account record found');
    if ((context.opportunities?.length || 0) === 0) contextQuality.push('no opportunities');
    if ((context.contacts?.length || 0) === 0) contextQuality.push('no contacts');
    if (!context.customerBrain) contextQuality.push('no meeting history');
    if ((context.contracts?.length || 0) === 0 && queryHints.needsContracts) contextQuality.push('no contract records accessible');
    if (contextQuality.length >= 3) {
      context.qualityNote = `LIMITED DATA: Missing ${contextQuality.length} data sources: ${contextQuality.join(', ')}.`;
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
      const contextTrimmed = session.turns.length >= MAX_CONVERSATION_TURNS * 2;
      let followUpContent;
      if (contextTrimmed && context.account) {
        followUpContent = `Context refresh (account: ${context.account.name}, owner: ${context.account.owner || 'Unknown'}, type: ${context.account.type || 'Unknown'}, ` +
          `opps: ${(context.opportunities || []).length}, contacts: ${(context.contacts || []).length}):\n\nFollow-up: ${query}`;
      } else {
        followUpContent = `Follow-up question (same account context as above):\n${query}`;
      }
      messages = [
        ...session.turns.slice(-MAX_CONVERSATION_TURNS * 2),
        { role: 'user', content: turnNumber === 1 ? userPrompt : followUpContent }
      ];
    } else {
      messages = [{ role: 'user', content: userPrompt }];
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: process.env.INTELLIGENCE_MODEL || 'claude-sonnet-4-20250514',
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
        accountName: context.account?.name || context.ownerName || null,
        accountId: context.account?.id || null,
        owner: maskOwnerIfUnassigned(context.account?.owner) || null,
        ownerEmail: (context.account?.owner && !UNASSIGNED_HOLDERS.includes(context.account.owner)) ? context.account.ownerEmail : null,
        accountType: context._accountType || 'unknown',
        intent,
        opportunityCount: context.opportunities?.length || context.oppCount || 0,
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
  // Priority overrides — unambiguous patterns that must bypass ML to prevent misclassification
  if (/what accounts does|'s accounts|'s book|accounts does .+ own|accounts .+ owns/i.test(query)) return 'OWNER_ACCOUNTS';
  if (/how many (customers|logos|clients)|customer count|number of customers|total customers|customer list|logo count/i.test(query)) return 'CUSTOMER_COUNT';
  if (/chief legal.+based|general counsel.+based|clo.+based|gc.+based|contacts.+based in|find.+contacts|clos owned/i.test(query)) return 'CONTACT_SEARCH';
  if (/what deals are (late|in |at )|which (deals|opportunities) are|deals in (negotiation|proposal|pilot)|late stage (contracting|compliance|m&a)/i.test(query)) return 'PIPELINE_OVERVIEW';
  if (/met with this week|meeting with this week|meetings this week|accounts.+met.+this week|accounts.+meeting.+this week/i.test(query)) return 'MEETING_ACTIVITY';

  // Try advanced intent parser (same system as Slack bot)
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
          'owner_pipeline': 'OWNER_ACCOUNTS',
          'accounts_by_owner': 'OWNER_ACCOUNTS',
          'accounts_by_stage': 'PIPELINE_OVERVIEW',
          'owner_accounts_list': 'OWNER_ACCOUNTS',
          'customer_list': 'CUSTOMER_COUNT',
          'count_query': 'CUSTOMER_COUNT',
          'loi_deals': 'PIPELINE_OVERVIEW',
          'arr_deals': 'PIPELINE_OVERVIEW',
          'weighted_summary': 'PIPELINE_OVERVIEW',
          'weighted_pipeline': 'PIPELINE_OVERVIEW',
          'late_stage_pipeline': 'PIPELINE_OVERVIEW',
          'product_pipeline': 'PIPELINE_OVERVIEW',
          'generate_late_stage_report': 'PIPELINE_OVERVIEW',
          'pipeline_added': 'PIPELINE_OVERVIEW',
          'activity_check': 'HISTORY',
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
    upcomingEvents: [],
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

  // Handle cross-account queries — these don't need a specific account
  if (intent === 'PIPELINE_OVERVIEW') {
    return await gatherPipelineContext(userEmail || null, query);
  }
  if (intent === 'OWNER_ACCOUNTS') {
    return await gatherOwnerAccountsContext(query);
  }
  if (intent === 'MEETING_ACTIVITY') {
    return await gatherMeetingActivityContext(query);
  }
  if (intent === 'ACCOUNT_LOOKUP') {
    return await gatherAccountLookupContext(query);
  }
  if (intent === 'CUSTOMER_COUNT') {
    return await gatherCustomerCountContext(query);
  }
  if (intent === 'CONTACT_SEARCH') {
    return await gatherContactSearchContext(query);
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

  // Verify SF connection is alive before parallel data fetch (with timeout guard)
  const { isSalesforceAvailable } = require('../salesforce/connection');
  if (!isSalesforceAvailable()) {
    logger.error(`[Intelligence] Salesforce connection unavailable — resetting circuit breaker and retrying`);
    const { resetCircuitBreaker, initializeSalesforce } = require('../salesforce/connection');
    resetCircuitBreaker();
    try {
      await Promise.race([
        initializeSalesforce(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SF init timeout after 5s')), 5000))
      ]);
    } catch (e) { logger.error(`[Intelligence] SF re-init failed: ${e.message}`); }
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
  context.recentEvents = events?.past || events || [];
  context.upcomingEvents = events?.upcoming || [];
  
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
    `${context.recentTasks.length} tasks, ${context.recentEvents.length} past events, ${context.upcomingEvents.length} upcoming, ` +
    `${context.meetingNotes.length} meeting notes, customerBrain: ${context.customerBrain ? 'yes' : 'no'}` +
    `${context.vectorResults.length > 0 ? `, ${context.vectorResults.length} vector matches` : ''}`);

  // Set upcoming meeting from already-fetched upcoming events (no separate query needed)
  if (intent === 'PRE_MEETING' && context.upcomingEvents.length > 0) {
    context.upcomingMeeting = context.upcomingEvents[0];
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
function rankContactTitle(title) {
  if (!title) return 99;
  const t = title.toLowerCase();
  if (/\b(chief legal|clo|general counsel)\b/.test(t)) return 1;
  if (/\b(deputy gc|deputy general counsel|associate gc|associate general counsel|agc)\b/.test(t)) return 2;
  if (/\b(svp|evp|senior vice president|executive vice president)\b/.test(t)) return 3;
  if (/\b(vp|vice president|head of)\b/.test(t)) return 4;
  if (/\b(director)\b/.test(t)) return 5;
  if (/\b(senior counsel|senior manager|manager|counsel)\b/.test(t)) return 6;
  return 10;
}

async function getContacts(accountId) {
  try {
    const result = await sfQuery(`
      SELECT Id, Name, Title, Email, Phone, MobilePhone, 
             Owner.Name, CreatedDate, LastModifiedDate
      FROM Contact
      WHERE AccountId = '${accountId}'
      ORDER BY LastModifiedDate DESC
      LIMIT 20
    `, true);

    const contacts = (result?.records || []).map(c => ({
      id: c.Id,
      name: c.Name,
      title: c.Title,
      email: c.Email,
      phone: c.Phone || c.MobilePhone,
      lastModified: c.LastModifiedDate,
      titleRank: rankContactTitle(c.Title),
      isDecisionMaker: rankContactTitle(c.Title) <= 4
    }));

    contacts.sort((a, b) => a.titleRank - b.titleRank || new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
    return contacts.slice(0, 15);
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
 * Get recent (past) and upcoming (future) events/meetings for an account.
 * Returns { past: [...], upcoming: [...] } to enforce clean temporal separation.
 */
async function getRecentEvents(accountId) {
  try {
    const [pastResult, upcomingResult] = await Promise.all([
      sfQuery(`
        SELECT Id, Subject, StartDateTime, EndDateTime, Description, Owner.Name
        FROM Event
        WHERE AccountId = '${accountId}'
          AND StartDateTime >= LAST_N_DAYS:90 AND StartDateTime < TODAY
        ORDER BY StartDateTime DESC
        LIMIT 10
      `, true),
      sfQuery(`
        SELECT Id, Subject, StartDateTime, EndDateTime, Description, Owner.Name
        FROM Event
        WHERE AccountId = '${accountId}'
          AND StartDateTime >= TODAY AND StartDateTime <= NEXT_N_DAYS:30
        ORDER BY StartDateTime ASC
        LIMIT 5
      `, true)
    ]);

    const mapEvent = e => ({
      id: e.Id,
      subject: e.Subject,
      startTime: e.StartDateTime,
      endTime: e.EndDateTime,
      description: e.Description?.substring(0, 200),
      owner: e.Owner?.Name
    });

    return {
      past: (pastResult?.records || []).map(mapEvent),
      upcoming: (upcomingResult?.records || []).map(mapEvent)
    };
  } catch (error) {
    logger.error('[Intelligence] Events query error:', error.message);
    return { past: [], upcoming: [] };
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
    
    // Strategy 6: SOSL fuzzy search (handles typos and phonetic matching)
    try {
      const soslTerm = cleanName.replace(/['"\\{}()\[\]]/g, '');
      if (soslTerm.length >= 3) {
        const { sfConnection: sfConn } = require('../salesforce/connection');
        const conn = sfConn.getConnection ? sfConn.getConnection() : null;
        if (conn && conn.search) {
          const soslQuery = `FIND {${soslTerm}} IN NAME FIELDS RETURNING Account(Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1)`;
          const soslResult = await conn.search(soslQuery);
          if (soslResult?.searchRecords?.[0]) {
            logger.info(`[Intelligence] Account found (SOSL fuzzy): ${soslResult.searchRecords[0].Name} (searched: "${soslTerm}")`);
            return soslResult.searchRecords[0];
          }
        }
      }
    } catch (soslErr) {
      logger.warn('[Intelligence] SOSL strategy failed:', soslErr.message);
    }

    logger.warn(`[Intelligence] No account found after 6 strategies for: "${accountName}"`);
    return null;
  } catch (error) {
    logger.error('[Intelligence] Account lookup error:', error.message);
    return null;
  }
}

/**
 * Gather context for pipeline overview queries.
 * Strategy: Use the weekly snapshot's battle-tested queryPipelineData() first (same SOQL that
 * produces the weekly PDF), then apply in-memory filters for stage/product/owner/time.
 * Falls back to direct SOQL if the bridge is unavailable.
 */
async function gatherPipelineContext(userEmail, queryText) {
  try {
    const lower = (queryText || '').toLowerCase();
    let allRecords = [];

    // Determine if this is a closed-deal query (won/lost) vs active pipeline
    const isClosedQuery = lower.includes('won') || lower.includes('signed') || lower.includes('closed') || lower.includes('lost') || lower.includes('logos');

    if (isClosedQuery) {
      // Closed-deal queries need specific SOQL (the weekly snapshot only covers active pipeline)
      const conditions = [];
      if (lower.includes('lost')) {
        conditions.push('IsClosed = true', 'IsWon = false');
      } else {
        conditions.push('IsWon = true');
      }
      if (lower.includes('this month')) conditions.push('CloseDate = THIS_MONTH');
      else if (lower.includes('this quarter')) conditions.push('CloseDate = THIS_FISCAL_QUARTER');
      else if (lower.includes('this week')) conditions.push('CloseDate = THIS_WEEK');
      else if (lower.includes('last month')) conditions.push('CloseDate = LAST_MONTH');
      else conditions.push('CloseDate = THIS_FISCAL_QUARTER');

      const result = await sfQuery(`
        SELECT Id, Name, AccountId, Account.Name, StageName, ACV__c, 
               CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep, Owner.Name,
               IsClosed, IsWon, Probability
        FROM Opportunity WHERE ${conditions.join(' AND ')}
        ORDER BY ACV__c DESC NULLS LAST LIMIT 200
      `, false);
      allRecords = result?.records || [];
    } else {
      // Active pipeline: use weekly snapshot bridge (proven reliable), fall back to direct SOQL
      if (weeklySnapshotBridge) {
        try {
          allRecords = await weeklySnapshotBridge.queryPipelineData();
          logger.info(`[Intelligence] Pipeline bridge returned ${allRecords.length} records`);
        } catch (bridgeErr) {
          logger.warn(`[Intelligence] Pipeline bridge failed, falling back to direct SOQL: ${bridgeErr.message}`);
        }
      }

      if (allRecords.length === 0) {
        const result = await sfQuery(`
          SELECT Id, Name, AccountId, Account.Name, StageName, ACV__c, 
                 CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep, Owner.Name,
                 IsClosed, IsWon, Probability
          FROM Opportunity
          WHERE IsClosed = false
            AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
          ORDER BY ACV__c DESC NULLS LAST
          LIMIT 200
        `, false);
        allRecords = result?.records || [];
      }
    }

    // Apply in-memory filters based on query content
    let filtered = allRecords;

    if (!isClosedQuery) {
      // Stage filter
      if (lower.includes('late stage')) {
        filtered = filtered.filter(o => ['Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'].includes(o.StageName));
      } else if (lower.includes('negotiation') || lower.includes('stage 5')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 5 - Negotiation');
      } else if (lower.includes('proposal') || lower.includes('stage 4')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 4 - Proposal');
      } else if (lower.includes('pilot') || lower.includes('stage 3')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 3 - Pilot');
      } else if (lower.includes('sqo') || lower.includes('stage 2')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 2 - SQO');
      } else if (lower.includes('discovery') || lower.includes('stage 1')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 1 - Discovery');
      } else if (lower.includes('early stage')) {
        filtered = filtered.filter(o => ['Stage 0 - Prospecting', 'Stage 1 - Discovery'].includes(o.StageName));
      } else if (lower.includes('mid stage')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 2 - SQO');
      }

      // Product line filter
      for (const [keyword, pl] of Object.entries(PRODUCT_LINE_MAP)) {
        if (lower.includes(keyword)) {
          filtered = filtered.filter(o => pl.partial
            ? (o.Product_Line__c || '').startsWith(pl.value)
            : o.Product_Line__c === pl.value);
          break;
        }
      }

      // Time filter on Target_LOI_Date__c
      if (lower.includes('this month') || lower.includes('targeting this month')) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        filtered = filtered.filter(o => o.Target_LOI_Date__c >= monthStart && o.Target_LOI_Date__c <= monthEnd);
      } else if (lower.includes('this quarter') || lower.includes('targeting q1')) {
        const now = new Date();
        const qStart = `${now.getFullYear()}-02-01`;
        const qEnd = `${now.getFullYear()}-04-30`;
        filtered = filtered.filter(o => o.Target_LOI_Date__c >= qStart && o.Target_LOI_Date__c <= qEnd);
      }
    }

    // Owner filter
    const bl = extractBLName(queryText || '');
    if (bl) {
      filtered = filtered.filter(o => (o.Owner?.Name || '').toLowerCase().includes(bl.name.split(' ')[0].toLowerCase()));
    }

    // Sort by ACV descending
    filtered.sort((a, b) => (b.ACV__c || 0) - (a.ACV__c || 0));

    // Group by stage
    const byStage = {};
    let totalAcv = 0;
    const byOwner = {};
    for (const opp of filtered) {
      const stage = opp.StageName || 'Unknown';
      if (!byStage[stage]) byStage[stage] = { count: 0, totalAcv: 0, opps: [] };
      byStage[stage].count++;
      byStage[stage].totalAcv += opp.ACV__c || 0;
      byStage[stage].opps.push({
        name: opp.Name,
        account: opp.Account?.Name || opp.Account?.Account_Display_Name__c,
        acv: opp.ACV__c,
        closeDate: opp.CloseDate,
        targetDate: opp.Target_LOI_Date__c,
        nextStep: opp.NextStep,
        owner: maskOwnerIfUnassigned(opp.Owner?.Name),
        productLine: opp.Product_Line__c,
        probability: opp.Probability
      });
      totalAcv += opp.ACV__c || 0;

      const owner = maskOwnerIfUnassigned(opp.Owner?.Name);
      if (!byOwner[owner]) byOwner[owner] = { count: 0, totalAcv: 0 };
      byOwner[owner].count++;
      byOwner[owner].totalAcv += opp.ACV__c || 0;
    }

    // Customer count
    let customerCount = 0;
    try {
      const custResult = await sfQuery(`
        SELECT COUNT() FROM Account WHERE Customer_Type__c IN ('Existing', 'Existing Customer', 'Existing / LOI', 'MSA')
      `, false);
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
 * Gather context for owner-specific queries ("what accounts does Riley own?")
 */
async function gatherOwnerAccountsContext(query) {
  const bl = extractBLName(query);
  if (!bl) {
    return { isOwnerQuery: true, error: 'Could not identify a Business Lead name in the query. Try using their first name (e.g., "Riley", "Olivia", "Julie").', dataFreshness: 'live' };
  }

  try {
    const userResult = await sfQuery(`SELECT Id, Name FROM User WHERE Email = '${bl.email}' LIMIT 1`, false);
    const userId = userResult?.records?.[0]?.Id;
    if (!userId) {
      return { isOwnerQuery: true, ownerName: bl.name, error: `No Salesforce user found for ${bl.name}`, dataFreshness: 'live' };
    }

    const [acctResult, oppResult] = await Promise.all([
      sfQuery(`SELECT Id, Name, Customer_Type__c, Industry, LastActivityDate FROM Account WHERE OwnerId = '${userId}' ORDER BY LastActivityDate DESC NULLS LAST LIMIT 50`, false),
      sfQuery(`SELECT Id, Name, Account.Name, StageName, ACV__c, CloseDate FROM Opportunity WHERE OwnerId = '${userId}' AND IsClosed = false ORDER BY CloseDate ASC LIMIT 20`, false)
    ]);

    const accounts = (acctResult?.records || []).map(a => ({
      name: a.Name, type: a.Customer_Type__c, industry: a.Industry, lastActivity: a.LastActivityDate
    }));
    const opps = (oppResult?.records || []).map(o => ({
      name: o.Name, account: o.Account?.Name, stage: o.StageName, acv: o.ACV__c, closeDate: o.CloseDate
    }));

    return {
      isOwnerQuery: true, ownerName: bl.name, ownerEmail: bl.email,
      accounts, accountCount: accounts.length,
      opportunities: opps, oppCount: opps.length,
      totalAcv: opps.reduce((sum, o) => sum + (o.acv || 0), 0),
      dataFreshness: 'live'
    };
  } catch (error) {
    logger.error('[Intelligence] Owner accounts context error:', error.message);
    return { isOwnerQuery: true, ownerName: bl.name, error: error.message, dataFreshness: 'live' };
  }
}

/**
 * Gather context for meeting activity queries ("what accounts did we meet with this week?")
 */
async function gatherMeetingActivityContext(query) {
  try {
    const lower = query.toLowerCase();
    const isUpcoming = lower.includes('meeting with') || lower.includes('scheduled') || lower.includes('are we meeting');
    const dateFilter = isUpcoming
      ? 'StartDateTime >= TODAY AND StartDateTime <= NEXT_WEEK'
      : 'StartDateTime >= THIS_WEEK AND StartDateTime <= TODAY';
    const label = isUpcoming ? 'Upcoming meetings' : 'Meetings held this week';

    const result = await sfQuery(`
      SELECT Account.Name, Subject, StartDateTime, Owner.Name
      FROM Event
      WHERE ${dateFilter} AND AccountId != null
      ORDER BY StartDateTime ${isUpcoming ? 'ASC' : 'DESC'}
      LIMIT 30
    `, false);

    const meetings = (result?.records || []).map(e => ({
      account: e.Account?.Name, subject: e.Subject,
      date: e.StartDateTime, owner: e.Owner?.Name
    }));

    const uniqueAccounts = [...new Set(meetings.map(m => m.account).filter(Boolean))];

    return {
      isMeetingQuery: true, label, isUpcoming,
      meetings, meetingCount: meetings.length,
      uniqueAccounts, accountCount: uniqueAccounts.length,
      dataFreshness: 'live'
    };
  } catch (error) {
    logger.error('[Intelligence] Meeting activity context error:', error.message);
    return { isMeetingQuery: true, error: error.message, dataFreshness: 'live' };
  }
}

/**
 * Gather context for customer/logo count queries
 */
async function gatherCustomerCountContext(query) {
  try {
    const lower = query.toLowerCase();
    let soql, label;

    if (lower.includes('arr') || lower.includes('revenue')) {
      soql = `SELECT Name, Owner.Name, Customer_Type__c FROM Account WHERE Customer_Type__c = 'Revenue' ORDER BY Name LIMIT 100`;
      label = 'ARR Customers';
    } else if (lower.includes('loi')) {
      soql = `SELECT Name, Owner.Name, Customer_Type__c FROM Account WHERE Customer_Type__c = 'LOI, with $ attached' ORDER BY Name LIMIT 100`;
      label = 'LOI Customers';
    } else if (lower.includes('pilot')) {
      soql = `SELECT Name, Owner.Name, Customer_Type__c FROM Account WHERE Customer_Type__c LIKE '%Pilot%' ORDER BY Name LIMIT 100`;
      label = 'Pilot Customers';
    } else {
      soql = `SELECT Name, Owner.Name, Customer_Type__c FROM Account WHERE Customer_Type__c IN ('Revenue', 'LOI, with $ attached', 'Pilot', 'Existing Customer', 'Existing', 'Existing / LOI', 'MSA') ORDER BY Customer_Type__c, Name LIMIT 200`;
      label = 'All Customers';
    }

    const result = await sfQuery(soql, false);
    const accounts = result?.records || [];
    const byType = {};
    accounts.forEach(a => {
      const t = a.Customer_Type__c || 'Other';
      if (!byType[t]) byType[t] = [];
      byType[t].push({ name: a.Name, owner: maskOwnerIfUnassigned(a.Owner?.Name) });
    });

    return { isCustomerCountQuery: true, label, totalCount: accounts.length, byType, dataFreshness: 'live' };
  } catch (error) {
    logger.error('[Intelligence] Customer count context error:', error.message);
    return { isCustomerCountQuery: true, error: error.message, dataFreshness: 'live' };
  }
}

/**
 * Gather context for cross-account contact search (marketing use case)
 */
async function gatherContactSearchContext(query) {
  try {
    const lower = query.toLowerCase();
    const titleConditions = [];
    if (lower.includes('clo') || lower.includes('chief legal')) titleConditions.push("Title LIKE '%Chief Legal%'");
    if (lower.includes('general counsel') || lower.includes(' gc')) titleConditions.push("Title LIKE '%General Counsel%'");
    if (lower.includes('vp legal') || lower.includes('vice president legal')) titleConditions.push("Title LIKE '%VP%Legal%'");
    if (lower.includes('head of legal')) titleConditions.push("Title LIKE '%Head of Legal%'");
    if (titleConditions.length === 0) {
      titleConditions.push("(Title LIKE '%Chief Legal%' OR Title LIKE '%General Counsel%' OR Title LIKE '%CLO%')");
    }

    const locationConditions = [];
    const cities = [
      { keywords: ['los angeles', 'la'], filter: "MailingCity LIKE '%Los Angeles%'" },
      { keywords: ['new york', 'nyc'], filter: "MailingState LIKE '%New York%'" },
      { keywords: ['san francisco', 'sf', 'bay area'], filter: "(MailingCity LIKE '%San Francisco%' OR MailingCity LIKE '%Palo Alto%' OR MailingCity LIKE '%San Jose%')" },
      { keywords: ['chicago'], filter: "MailingCity LIKE '%Chicago%'" },
      { keywords: ['london'], filter: "MailingCity LIKE '%London%'" },
      { keywords: ['dublin'], filter: "MailingCity LIKE '%Dublin%'" },
      { keywords: ['boston'], filter: "MailingCity LIKE '%Boston%'" },
      { keywords: ['seattle'], filter: "MailingCity LIKE '%Seattle%'" },
      { keywords: ['dallas', 'houston', 'texas'], filter: "MailingState LIKE '%Texas%'" },
    ];
    for (const city of cities) {
      if (city.keywords.some(k => lower.includes(k))) {
        locationConditions.push(city.filter);
        break;
      }
    }

    let whereClause = `(${titleConditions.join(' OR ')})`;
    if (locationConditions.length > 0) whereClause += ` AND ${locationConditions.join(' AND ')}`;
    whereClause += ` AND Account.Owner.Name != null`;

    const soql = `
      SELECT Name, Title, Email, Account.Name, Account.Owner.Name, MailingCity, MailingState, MailingCountry
      FROM Contact
      WHERE ${whereClause}
      ORDER BY Account.Name
      LIMIT 50
    `;

    const result = await sfQuery(soql, false);
    const contacts = (result?.records || []).map(c => ({
      name: c.Name,
      title: c.Title,
      email: c.Email,
      account: c.Account?.Name,
      accountOwner: maskOwnerIfUnassigned(c.Account?.Owner?.Name),
      city: c.MailingCity,
      state: c.MailingState,
      country: c.MailingCountry
    }));

    return {
      isContactSearchQuery: true,
      contacts,
      contactCount: contacts.length,
      searchCriteria: { titles: titleConditions, locations: locationConditions },
      dataFreshness: 'live'
    };
  } catch (error) {
    logger.error('[Intelligence] Contact search context error:', error.message);
    return { isContactSearchQuery: true, error: error.message, dataFreshness: 'live' };
  }
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
- RECENT ACTIVITY: Data labeled "PAST MEETINGS" contains events that already happened. Frame in past tense: "Met with [person] on Feb 3 (~2 weeks ago)." These are look-back data.
- UPCOMING ACTIVITY: Data labeled "SCHEDULED MEETINGS" contains events in the future. Frame as planned: "Meeting scheduled for Feb 25 (in 1 week)." These are forward-looking.
- NEVER confuse past and future: past events happened (past tense), future events are planned (future tense).
- NEVER list upcoming meetings under "Recent Activity" or vice versa.
- Use absolute dates with relative context: "Feb 3 (~2 weeks ago)" for past, "Feb 25 (in 1 week)" for upcoming.
- If CRM dates appear inconsistent, simply work with the available data without surfacing warnings.
- NEVER surface data quality warnings, date discrepancies, or "CRITICAL DATA ISSUE" messages to the user.
- NEVER tell the user to "verify" CRM data — just present what is available.

STAGE DEFINITIONS (use these exact mappings):
- Stage 0 - Prospecting (early stage)
- Stage 1 - Discovery (early stage)
- Stage 2 - SQO (mid stage)
- Stage 3 - Pilot (late stage)
- Stage 4 - Proposal (late stage)
- Stage 5 - Negotiation (late stage)
- "Late stage" = Stage 3 + Stage 4 + Stage 5
- Stage 6. Closed(Won) and Stage 7. Closed(Lost) are closed stages

PRODUCT LINES: AI-Augmented Contracting, AI-Augmented M&A, AI-Augmented Compliance, AI Platform - Sigma, AI Platform - Insights, AI Platform - Litigation, FDE - Custom AI Solution

UNASSIGNED ACCOUNTS:
- If the owner is listed as "Unassigned", state that the account is currently unassigned. Do NOT reference any holder's actual name — simply say "Unassigned" or "Currently unassigned."

PRONOUN HANDLING:
- If the query uses "they", "their", "this account", "them", or "it" and account context is provided above, assume it refers to the current account.
- If NO account context is provided and the query uses pronouns, respond: "Which account are you asking about? Select one from the search bar or mention the company name."
- In multi-turn conversations, pronouns always refer to the current account context. If the account changed, a new context block will be provided.

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
- After a "---" separator, include up to 2 brief follow-up questions
- Format: "---\\nYou might also ask:\\n1. [question]\\n2. [question]"
- RULES:
  a) Each suggestion MUST be answerable using ONLY the data provided to you (Salesforce account data, opportunities, contacts, events, tasks, Customer Brain meeting notes). If you cannot answer it with the data above, do not suggest it.
  b) NEVER suggest questions about strategy, intent, plans, motivations, or thinking — you have no access to a person's strategy or internal plans.
  c) NEVER suggest questions about data you don't have: email threads, call recordings, Slack DMs, pricing negotiations, internal wikis, feedback, or NPS scores.
  d) NEVER use brackets like [account name] or [specific opportunity]. Use ACTUAL names, companies, and specifics from your answer.
  e) Good examples: "What are Tom Burton's most recent interactions?" / "When does the Coherent contract expire?" / "What stage is the Intuit opportunity in?"
  f) Bad examples: "What's Riley's prospecting strategy?" / "What are the key negotiation points?" / "What feedback has [contact name] given?" / "What is the competitive positioning?"
  g) Vary your suggestions — don't always suggest the same follow-up patterns. If you discussed contacts, suggest a deal or timeline question. If you discussed deals, suggest a stakeholder or activity question.
  h) If there is genuinely nothing useful to drill into, omit the follow-up section entirely.
  i) Keep each suggestion under 10 words`;

  // ── Account-type-specific framing ──
  if (accountType === 'existing_customer') {
    basePrompt += `

ACCOUNT TYPE: EXISTING CUSTOMER
This is an active paying customer. Your response framing must reflect this relationship:
- Lead with the existing relationship context: products in use, contract status, renewal timeline
- Emphasize customer health, satisfaction signals, and expansion potential
- Frame around retention and growth, NOT acquisition
- Highlight any CS handover notes, customer goals, or auto-renewal status
- When suggesting follow-ups, focus on: renewal risk, expansion opportunities, product adoption, stakeholder changes
- NEVER frame an existing customer as a "prospect" or suggest "discovery" activities
- When asked "when were they signed?", reference the Customer Since date, First Deal Closed field, or earliest won opportunity CloseDate
- When asked about "products", use CS_Products_Purchased and Products_Breakdown data — do NOT speculate about products not listed
- When asked "what's the latest?", lead with the most recent past event/task/meeting note, then deal status. Include upcoming meetings separately if scheduled.
- When asked about contracts, reference the ACTIVE CONTRACTS data provided. Include start/end dates and status.`;
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
- Be transparent about limited data — do not speculate beyond what exists. Clearly state what data IS available and what is NOT.
- Frame around initial outreach and positioning
- When suggesting follow-ups, focus on: identifying decision makers, understanding pain points, determining ICP fit
- If the user asks "what's the latest?" and there is no activity, say "No recorded activity for this account." Do not fabricate engagement history.`;
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
      return basePrompt + `\n\nFOCUS: Pipeline data. Present as:
1. Summary line: "[X] deals | $[Y] total ACV | [Z] late stage"
2. Ranked list sorted by ACV descending: "1. **Account** — $ACV | Stage | Owner | Target: Date"
3. Stage breakdown at the bottom
Do NOT write paragraphs. Use the compact ranked list format. Include product line if available.
STAGE DEFINITIONS: Late stage = Stage 3 (Pilot) + Stage 4 (Proposal) + Stage 5 (Negotiation). Mid = Stage 2 (SQO). Early = Stage 0 (Prospecting) + Stage 1 (Discovery).`;

    case 'OWNER_ACCOUNTS':
      return basePrompt + `\n\nFOCUS: Business Lead account ownership. Present as:
1. Summary: "[Name] owns [X] accounts ([Y] with active pipeline)"
2. Active pipeline deals listed by ACV: "1. **Account** — $ACV | Stage"
3. Account list grouped by type (customer, pipeline, prospect)
Use a clean list format.`;

    case 'MEETING_ACTIVITY':
      return basePrompt + `\n\nFOCUS: Meeting activity. Present as a compact timeline:
1. Summary: "[X] meetings with [Y] accounts this week"
2. Timeline list: "- **Mon Feb 17** — Account Name: Meeting Subject [Owner]"
Group by day.`;

    case 'CUSTOMER_COUNT':
      return basePrompt + `\n\nFOCUS: Customer/logo count. Present as:
1. Total count prominently: "**[X] total customers**"
2. Breakdown by type (Revenue/ARR, LOI, Pilot, etc.) with count per category
3. If listing accounts, use compact format: "- Account Name (Owner)"
Be precise with the count.`;

    case 'CONTACT_SEARCH':
      return basePrompt + `\n\nFOCUS: Contact search results. Present as:
1. Summary: "[X] contacts matching criteria"
2. Compact list: "- **Name** — Title | Account (Owner) | City, State"
3. Group by city/region if location was part of the search
Include email when available.`;

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
        for (const opp of data.opps.slice(0, 15)) {
          prompt += `  • ${opp.account || opp.name} — $${(opp.acv || 0).toLocaleString()}`;
          if (opp.owner) prompt += ` | ${opp.owner}`;
          if (opp.targetDate) prompt += ` | Target: ${opp.targetDate}`;
          if (opp.productLine) prompt += ` | ${opp.productLine}`;
          prompt += '\n';
        }
        if (data.opps.length > 15) prompt += `  ... and ${data.opps.length - 15} more\n`;
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

  // Handle owner accounts queries
  if (context.isOwnerQuery) {
    if (context.error) {
      prompt += `${context.error}\n`;
      return prompt;
    }
    prompt += `ACCOUNTS OWNED BY ${(context.ownerName || 'Unknown').toUpperCase()}:\n`;
    prompt += `• Total Accounts: ${context.accountCount}\n`;
    prompt += `• Open Opportunities: ${context.oppCount} ($${(context.totalAcv || 0).toLocaleString()} ACV)\n\n`;

    if (context.accounts?.length > 0) {
      prompt += `ACCOUNT LIST:\n`;
      for (const acct of context.accounts.slice(0, 30)) {
        prompt += `• ${acct.name}`;
        if (acct.type) prompt += ` [${acct.type}]`;
        if (acct.industry) prompt += ` - ${acct.industry}`;
        prompt += '\n';
      }
      if (context.accountCount > 30) prompt += `  ... and ${context.accountCount - 30} more\n`;
      prompt += '\n';
    }

    if (context.opportunities?.length > 0) {
      prompt += `OPEN PIPELINE:\n`;
      for (const opp of context.opportunities) {
        prompt += `• ${opp.name} (${opp.account}) - ${opp.stage} - $${(opp.acv || 0).toLocaleString()}`;
        if (opp.closeDate) prompt += ` - Close: ${opp.closeDate}`;
        prompt += '\n';
      }
    }
    return prompt;
  }

  // Handle meeting activity queries
  if (context.isMeetingQuery) {
    if (context.error) {
      prompt += `${context.error}\n`;
      return prompt;
    }
    prompt += `${context.label?.toUpperCase() || 'MEETING ACTIVITY'}:\n`;
    prompt += `• Total Meetings: ${context.meetingCount}\n`;
    prompt += `• Unique Accounts: ${context.accountCount}\n\n`;

    if (context.meetings?.length > 0) {
      prompt += `MEETINGS:\n`;
      for (const m of context.meetings) {
        const dateStr = m.date ? new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        prompt += `• ${dateStr}: ${m.subject || 'Meeting'} — ${m.account || 'Unknown account'}`;
        if (m.owner) prompt += ` [${m.owner}]`;
        prompt += '\n';
      }
    }
    return prompt;
  }

  // Handle customer count queries
  if (context.isCustomerCountQuery) {
    if (context.error) {
      prompt += `${context.error}\n`;
      return prompt;
    }
    prompt += `${context.label?.toUpperCase() || 'CUSTOMER COUNT'}:\n`;
    prompt += `• Total: ${context.totalCount}\n\n`;

    if (context.byType && Object.keys(context.byType).length > 0) {
      prompt += `BY TYPE:\n`;
      for (const [type, accounts] of Object.entries(context.byType)) {
        prompt += `\n${type} (${accounts.length}):\n`;
        for (const a of accounts.slice(0, 15)) {
          prompt += `  • ${a.name} — ${a.owner}\n`;
        }
        if (accounts.length > 15) prompt += `  ... and ${accounts.length - 15} more\n`;
      }
    }
    return prompt;
  }

  // Handle cross-account contact search queries
  if (context.isContactSearchQuery) {
    if (context.error) {
      prompt += `${context.error}\n`;
      return prompt;
    }
    prompt += `CONTACT SEARCH RESULTS (${context.contactCount} found):\n\n`;
    if (context.contacts?.length > 0) {
      for (const c of context.contacts) {
        prompt += `• ${c.name} — ${c.title || 'No title'}`;
        prompt += ` | ${c.account} (${c.accountOwner})`;
        if (c.city || c.state) prompt += ` | ${[c.city, c.state].filter(Boolean).join(', ')}`;
        if (c.email) prompt += ` | ${c.email}`;
        prompt += '\n';
      }
    } else {
      prompt += `No contacts found matching the search criteria.\n`;
    }
    return prompt;
  }

  // Handle account lookup queries
  if (context.isLookupQuery) {
    if (context.account) {
      prompt += `ACCOUNT FOUND:\n`;
      prompt += `• Name: ${context.account.name}\n`;
      prompt += `• Owner: ${maskOwnerIfUnassigned(context.account.owner)}\n`;
      if (context.account.ownerEmail && !UNASSIGNED_HOLDERS.includes(context.account.owner)) prompt += `• Owner Email: ${context.account.ownerEmail}\n`;
      if (context.account.type) prompt += `• Type: ${context.account.type}\n`;
      if (context.account.industry) prompt += `• Industry: ${context.account.industry}\n`;
    } else {
      prompt += `No account found matching "${context.searchedName}".\n`;
    }
    return prompt;
  }

  // Account-specific context
  const acctType = context._accountType || 'unknown';
  if (context.account) {
    prompt += `ACCOUNT: ${context.account.name}\n`;
    prompt += `• Owner: ${maskOwnerIfUnassigned(context.account.owner)}\n`;
    prompt += `• Type: ${context.account.type || 'Unknown'}\n`;
    if (context.account.industry) prompt += `• Industry: ${context.account.industry}\n`;
    if (context.account.location) prompt += `• Location: ${context.account.location}\n`;
    if (context.account.lastActivityDate) {
      prompt += `• Last Activity: ${context.account.lastActivityDate}\n`;
      const lastActivityDate = new Date(context.account.lastActivityDate);
      const daysSinceActivity = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
      prompt += `• Days Since Last Activity: ${daysSinceActivity}\n`;
    }

    // Account-type-specific header data (prominent, placed early)
    if (acctType === 'existing_customer') {
      prompt += `• ACCOUNT PROFILE: EXISTING CUSTOMER\n`;
      if (context.account.firstDealClosed) prompt += `• Customer Since: ${context.account.firstDealClosed}\n`;
      const wonOpps = (context.opportunities || []).filter(o => o.isWon);
      if (wonOpps.length > 0) {
        const earliest = wonOpps.reduce((a, b) => (a.closeDate < b.closeDate ? a : b));
        prompt += `• First Won Deal: ${earliest.name} (${earliest.closeDate})\n`;
      }
    } else if (acctType === 'active_pipeline') {
      prompt += `• ACCOUNT PROFILE: ACTIVE PIPELINE\n`;
    } else if (acctType === 'historical') {
      prompt += `• ACCOUNT PROFILE: HISTORICAL (no active pipeline)\n`;
      const closedOpps = (context.opportunities || []).filter(o => o.isClosed);
      if (closedOpps.length > 0) {
        const latest = closedOpps[0];
        prompt += `• Last Opportunity: ${latest.name} — ${latest.isWon ? 'Won' : 'Lost'} (${latest.closeDate || 'unknown date'})\n`;
      }
    } else if (acctType === 'cold') {
      prompt += `• ACCOUNT PROFILE: COLD / NET NEW — Limited data available\n`;
    }
    prompt += '\n';
  }

  // For existing customers, surface CS/contract data early (most relevant to this profile)
  if (acctType === 'existing_customer') {
    const csOpps = (context.opportunities || []).filter(o => o.customerGoals || o.productsPurchased || o.autoRenew);
    if (csOpps.length > 0) {
      prompt += `CUSTOMER RELATIONSHIP SUMMARY:\n`;
      for (const opp of csOpps) {
        if (opp.productsPurchased) prompt += `• Products: ${opp.productsPurchased}\n`;
        if (opp.customerGoals) prompt += `• Customer Goals: ${opp.customerGoals}\n`;
        if (opp.autoRenew) prompt += `• Auto-Renew: Yes\n`;
        if (opp.contractTerm) prompt += `• Contract Term: ${opp.contractTerm}\n`;
        if (opp.commercialTerms) prompt += `• Commercial Terms: ${opp.commercialTerms}\n`;
      }
      prompt += '\n';
    }
    if (context.contracts?.length > 0) {
      prompt += `ACTIVE CONTRACTS (${context.contracts.length}):\n`;
      for (const c of context.contracts.slice(0, 5)) {
        prompt += `• ${c.contractNumber || 'Contract'} — ${c.status || 'Unknown'}`;
        if (c.startDate) prompt += ` | Start: ${c.startDate}`;
        if (c.endDate) prompt += ` | End: ${c.endDate}`;
        prompt += '\n';
      }
      prompt += '\n';
    }
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
        if (opp.probability) prompt += ` | Prob: ${opp.probability}%`;
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

  // Customer goals (skip for existing_customer — already in CS summary above)
  if (acctType !== 'existing_customer') {
    const customerGoals = allOpps.filter(o => o.customerGoals).map(o => `${o.name}: ${o.customerGoals}`);
    if (customerGoals.length > 0) {
      prompt += `CUSTOMER GOALS:\n`;
      for (const cg of customerGoals) {
        prompt += `• ${cg}\n`;
      }
      prompt += '\n';
    }
  }

  // Contracts (skip for existing_customer — already in ACTIVE CONTRACTS above)
  if (acctType !== 'existing_customer' && context.contracts?.length > 0) {
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

  // Contacts + Decision Makers (unified, deduplicated)
  if (context.contacts?.length > 0 || context.account?.keyDecisionMakers) {
    prompt += `KEY CONTACTS & DECISION MAKERS:\n`;
    const listedNames = new Set();

    // Decision-maker contacts first (ranked by title seniority)
    const dmContacts = (context.contacts || []).filter(c => c.isDecisionMaker);
    for (const contact of dmContacts) {
      const tag = ' [DECISION MAKER]';
      prompt += `• ${contact.name}`;
      if (contact.title) prompt += ` - ${contact.title}`;
      prompt += tag;
      if (contact.email) prompt += ` (${contact.email})`;
      prompt += '\n';
      listedNames.add(contact.name?.toLowerCase());
    }

    // Remaining contacts
    for (const contact of (context.contacts || []).filter(c => !c.isDecisionMaker)) {
      if (listedNames.has(contact.name?.toLowerCase())) continue;
      prompt += `• ${contact.name}`;
      if (contact.title) prompt += ` - ${contact.title}`;
      if (contact.email) prompt += ` (${contact.email})`;
      prompt += '\n';
      listedNames.add(contact.name?.toLowerCase());
      if (listedNames.size >= 10) break;
    }

    // Supplement from Key_Decision_Makers__c account field (may have names not in Contacts)
    if (context.account?.keyDecisionMakers) {
      const kdmText = context.account.keyDecisionMakers;
      const overlapCount = Array.from(listedNames).filter(n => kdmText.toLowerCase().includes(n)).length;
      if (overlapCount < listedNames.size / 2 || listedNames.size < 3) {
        prompt += `\nAdditional decision maker notes (from Account record):\n${kdmText}\n`;
      }
    }
    prompt += '\n';
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

  // Recent (past) events/meetings with recency context
  const now = new Date();
  if (context.recentEvents?.length > 0) {
    prompt += `RECENT ACTIVITY — PAST MEETINGS (${context.recentEvents.length}):\n`;
    for (const event of context.recentEvents.slice(0, 5)) {
      const eventDate = event.startTime?.split('T')[0];
      prompt += `• ${eventDate}: ${event.subject}`;
      if (event.startTime) {
        const daysAgo = Math.floor((now.getTime() - new Date(event.startTime).getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo === 0) prompt += ' [TODAY]';
        else if (daysAgo === 1) prompt += ' [YESTERDAY]';
        else if (daysAgo <= 7) prompt += ` [${daysAgo} days ago - RECENT]`;
        else if (daysAgo <= 30) prompt += ` [${daysAgo} days ago]`;
        else prompt += ` [${daysAgo} days ago - older]`;
      }
      if (event.owner) prompt += ` [${event.owner}]`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  // Upcoming (future) events/meetings
  if (context.upcomingEvents?.length > 0) {
    prompt += `UPCOMING — SCHEDULED MEETINGS (${context.upcomingEvents.length}):\n`;
    for (const event of context.upcomingEvents.slice(0, 5)) {
      const eventDate = event.startTime?.split('T')[0];
      prompt += `• ${eventDate}: ${event.subject}`;
      if (event.startTime) {
        const daysUntil = Math.floor((new Date(event.startTime).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil === 0) prompt += ' [TODAY]';
        else if (daysUntil === 1) prompt += ' [TOMORROW]';
        else prompt += ` [in ${daysUntil} days]`;
      }
      if (event.owner) prompt += ` [${event.owner}]`;
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
