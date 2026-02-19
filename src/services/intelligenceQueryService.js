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
  const ws = require('../slack/blWeeklySummary');
  weeklySnapshotBridge = {
    queryPipelineData: ws.queryPipelineData,
    queryAIEnabledForecast: ws.queryAIEnabledForecast,
    queryPipelineBySalesType: ws.queryPipelineBySalesType,
    queryPipelineBySolution: ws.queryPipelineBySolution,
    querySignedRevenueQTD: ws.querySignedRevenueQTD,
    querySignedRevenueLastWeek: ws.querySignedRevenueLastWeek,
    queryTop10TargetingJanuary: ws.queryTop10TargetingJanuary,
    queryTop10TargetingQ1: ws.queryTop10TargetingQ1,
    queryLogosByType: ws.queryLogosByType,
    ACTIVE_STAGES: ws.ACTIVE_STAGES,
  };
  logger.info('[Intelligence] Weekly snapshot data bridge loaded (10 functions)');
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

// ═══════════════════════════════════════════════════════════════════════════
// SALESFORCE CONNECTION HEALTH CHECK
// Ensures the SF connection is alive before any SOQL execution.
// Resets the circuit breaker and attempts re-initialization if degraded.
// ═══════════════════════════════════════════════════════════════════════════
function isValidSalesforceId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
}

async function ensureSalesforceConnection() {
  const { isSalesforceAvailable, resetCircuitBreaker, initializeSalesforce } = require('../salesforce/connection');
  if (!isSalesforceAvailable()) {
    logger.warn('[Intelligence] SF connection unavailable — resetting circuit breaker and re-initializing');
    resetCircuitBreaker();
    try {
      await Promise.race([
        initializeSalesforce(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SF init timeout after 8s')), 8000))
      ]);
      logger.info('[Intelligence] SF re-initialization succeeded');
    } catch (e) {
      logger.error(`[Intelligence] SF re-init failed: ${e.message}`);
    }
  }
}

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
  /what deals are (late|in|at|closing|early|prospecting)/i,
  /how many (customers|logos|clients) do we/i,
  /accounts.*(being )?prospect/i,
  /currently (being )?prospect/i,
  /early stage (deals|opportunities|accounts)/i,
  /what('s| is) the total pipeline/i,
  /pipeline across all/i,
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

// Eudia fiscal year: Q1 = Feb 1 - Apr 30, Q2 = May 1 - Jul 31, etc.
const FISCAL_Q1_START = '2026-02-01';
const FISCAL_Q1_END = '2026-04-30';

const PRODUCT_DISPLAY_MAP = {
  'AI-Augmented Contracting_Managed Services': 'AI Contracting (Managed)',
  'AI-Augmented Contracting_In-House Technology': 'AI Contracting (In-House)',
  'AI-Augmented Contracting': 'AI Contracting',
  'AI-Augmented M&A_Managed Service': 'AI M&A',
  'AI-Augmented M&A_In-House Technology': 'AI M&A (In-House)',
  'AI-Augmented Compliance_In-House Technology': 'AI Compliance',
  'AI-Augmented Compliance_Managed Services': 'AI Compliance (Managed)',
  'AI Platform - Sigma': 'Sigma',
  'AI Platform - Insights': 'Insights',
  'AI Platform - Litigation': 'Litigation',
  'FDE - Custom AI Solution': 'Custom AI (FDE)',
  'Pure Software': 'Pure Software',
  'AI-Enabled Services': 'AI-Enabled Services',
  'Legacy Services': 'Legacy Services',
  'Multiple': 'Multiple Products',
  'Undetermined': 'Undetermined',
};

function cleanProductLine(raw) {
  if (!raw) return '';
  if (raw.includes(';')) {
    return raw.split(';').map(p => p.trim()).filter(Boolean).map(p => PRODUCT_DISPLAY_MAP[p] || p.replace('AI-Augmented ', 'AI ').replace(/_/g, ' — ')).join(', ');
  }
  return PRODUCT_DISPLAY_MAP[raw] || raw.replace('AI-Augmented ', 'AI ').replace(/_/g, ' — ');
}

const MONTH_PATTERNS = /january|february|march|april|may|june|july|august|september|october|november|december/i;

// Intent keywords ordered by specificity (cross-account intents FIRST to prevent
// generic words like 'stage' or 'pipeline' from hijacking account-specific intents)
const QUERY_INTENTS = {
  // Cross-account intents (highest priority — checked first)
  FORECAST: ['forecast', 'commit', 'weighted pipeline', 'midpoint', 'ai-enabled forecast', 'q1 forecast', 'what is our forecast'],
  DEALS_SIGNED: ['signed this quarter', 'signed this month', 'signed this week', 'signed last week', 'what have we signed', 'closed won', 'deals we signed', 'revenue signed'],
  DEALS_TARGETING: ['targeting this month', 'targeting this quarter', 'targeting q1', 'targeting february', 'deals targeting', 'what is targeting'],
  WEIGHTED_PIPELINE: ['weighted pipeline', 'weighted acv', 'pipeline weighted', 'weighted by stage'],
  PIPELINE_BY_PRODUCT: ['pipeline by product', 'pipeline by solution', 'product breakdown', 'product line breakdown', 'solution breakdown', 'pipeline by solution'],
  PIPELINE_BY_SALES_TYPE: ['pipeline by sales type', 'new business pipeline', 'expansion pipeline', 'renewal pipeline', 'sales type breakdown'],
  LOI_DEALS: ['loi deals', 'loi signed', 'lois signed', 'loi this', 'commitment deals', 'what lois'],
  DEALS_CLOSED: ['deals closed', 'deals have closed', 'what have we closed', 'closed deals', 'deals won', 'what did we close', 'what did we sign', 'what have we signed'],
  SLOW_DEALS: ['stuck deals', 'slow deals', 'stale deals', 'deals stuck', 'stalled deals', 'no movement'],
  PIPELINE_ADDED: ['added to pipeline', 'pipeline added', 'new pipeline this', 'deals added', 'new deals this week'],
  CUSTOMER_COUNT: ['how many customers', 'how many logos', 'customer count', 'number of customers', 'total customers', 'how many clients', 'customer list', 'logo count'],
  CONTACT_SEARCH: ['chief legal officer', 'general counsel', 'clo based in', 'gc based in', 'contacts based in', 'contacts in', 'decision makers in', 'find contacts', 'clos owned by'],
  PIPELINE_OVERVIEW: ['my pipeline', 'my deals', 'late stage', 'early stage', 'mid stage', 'how many deal', 'how many account', 'total pipeline', 'closing this month', 'closing this quarter', 'in our pipeline', 'pipeline summary', 'deals closing', 'new logo', 'won this month', 'won this quarter', 'what deals are', 'what opportunities are', 'which deals', 'which opportunities', 'deals in negotiation', 'deals in proposal', 'deals in pilot', 'negotiation', 'proposal stage', 'late stage contracting', 'late stage compliance', 'late stage m&a', 'contracting deals', 'compliance deals', 'pipeline by stage', 'open opportunities', 'open deals', 'active pipeline', 'prospecting', 'being prospected', 'accounts prospected', 'pipeline across all stages', 'total pipeline across', 'accounts with multiple', 'multiple opportunities', 'multiple deals', 'new business vs', 'new vs existing', 'new business split', 'stage breakdown', 'stage distribution', 'pipeline breakdown', 'q1 pipeline'],
  OWNER_ACCOUNTS: ['what accounts does', "'s accounts", "'s book", "'s pipeline", "'s deals", 'accounts does', 'book for'],
  MEETING_ACTIVITY: ['met with this week', 'meeting with this week', 'meetings this week', 'met with today', 'meeting with today', 'calls this week', 'meetings scheduled', 'accounts did we meet', 'accounts meeting with', 'who are we meeting', 'what meetings do we have'],
  ACCOUNT_LOOKUP: ['who owns', 'owner of', 'assigned to'],
  // Account-specific intents (checked after cross-account)
  PRE_MEETING: ['before my', 'next meeting', 'should i know', 'meeting prep', 'prepare for'],
  DEAL_STATUS: ['deal status', 'current status', 'where are we', 'how is the deal', 'where are they', 'where is the deal', 'deal stage'],
  STAKEHOLDERS: ['decision maker', 'stakeholder', 'champion', 'who is', 'who are', 'key contacts'],
  HISTORY: ['last meeting', 'when did we', 'history', 'previous', 'last time', 'latest activity', 'recent activity', 'latest on', 'what happened with'],
  NEXT_STEPS: ['next step', 'action item', 'todo', 'follow up', 'outstanding'],
  PAIN_POINTS: ['pain point', 'challenge', 'problem', 'issue', 'struggle'],
  COMPETITIVE: ['competitor', 'competitive', 'alternative', 'vs', 'compared to'],
  POSITIONING: ['how should eudia', 'how should we position', 'how should we approach', 'positioning for', 'how to pitch', 'how to sell to', 'how to engage'],
};

const BL_NAME_MAP = {
  'riley': { name: 'Riley Stack', email: 'riley.stack@eudia.com' },
  'olivia': { name: 'Olivia Jung', email: 'olivia@eudia.com' },
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

const BL_OWNERSHIP_REGEX = new RegExp(
  '\\b(' + Object.keys(BL_NAME_MAP).join('|') + ')(?:\'s?|s?)\\s+.*\\b(deals|pipeline|accounts|book|portfolio|opportunities|opps)\\b', 'i'
);

const UNASSIGNED_HOLDERS = ['Keigan Pesenti', 'Emmit Hood', 'Emmitt Hood', 'Mark Runyon', 'Derreck Chu', 'Sarah Rakhine'];

/**
 * Extract a potential account name from free-text queries.
 * Handles patterns like "tell me about Coherent", "deal status at Intuit", "what about CHS?"
 */
function extractAccountFromQuery(query) {
  const patterns = [
    /\bwhen does (?:the )?(.+?)\s+(?:negotiation|deal|opportunity|contract|opp)\s+(?:close|expire|end|renew)/i,
    /\bwhen does (?:the )?(.+?)\s+close/i,
    /\bwhat stage is (?:the )?(.+?)\s+(?:deal|opp|opportunity|in)/i,
    /\btell me about\s+(.+?)(?:\?|$)/i,
    /\bshow me\s+(.+?)(?:'s|'s)\s+(?:deal|opportunity|opp|pipeline|status|details)/i,
    /\b(.+?)(?:'s|'s)\s+(?:deal|opportunity|opp)\s+(?:details|status|closing|targeting)/i,
    /\bwhat(?:'s| is)(?: the)?(?: .*?)?\s+(?:at|for|with|on)\s+(.+?)(?:\?|$)/i,
    /\b(?:overview|status|update|info|details|contacts?|pipeline)\s+(?:for|at|on|of)\s+(.+?)(?:\?|$)/i,
    /\b(?:for|at|about|on)\s+(.+?)(?:\?|\.|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      let candidate = match[1].trim()
        .replace(/^(the|this|my|our)\s+/i, '')
        .replace(/\$[\d,.]+[km]?\s*/gi, '')
        .replace(/\b(deal|opportunity|opp|negotiation|contract)\b\s*/gi, '')
        .replace(/[?.!]+$/, '')
        .replace(/'s\s*$/i, '')
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

function formatAcv(value) {
  if (!value || value === 0) return '$0';
  if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'm';
  if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
  return '$' + Math.round(value);
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
    // ── Step 1: Query analysis (BEFORE session, to avoid state contamination) ──
    const lowerQuery = query.toLowerCase();
    const queryHints = {
      needsContracts: /contract|agreement|renewal|renew|term\b|expir/i.test(query),
      needsProducts: /product|purchased|buying|bought|subscri|license|line item/i.test(query),
      needsCommercial: /pricing|price|cost|commerci|terms|payment|invoice|billing/i.test(query),
    };

    // Cross-account signal detection FIRST — before session can store account state
    const isCrossAccountQuery = CROSS_ACCOUNT_SIGNALS.some(p => p.test(query));
    if (isCrossAccountQuery) {
      if (accountId || accountName) {
        logger.info(`[Intelligence] Cross-account signal detected, clearing account context`);
      }
      accountId = '';
      accountName = '';
    }

    // Classify intent BEFORE session (prevents session from overriding routing)
    const intent = await classifyQueryIntent(query);

    if (intent === 'JOKE') {
      const JOKES = [
        "Our pipeline has more stages than a Broadway musical — and about the same drama.",
        "How many lawyers does it take to close a deal at a Fortune 500? Just one, but they'll need 47 stakeholders to approve the timeline first.",
        "What did the AI say to the legal team? 'I've reviewed 10,000 contracts and I still can't find the fun clause.'",
        "Why do sales reps make great poker players? They're used to dealing with bad hands and still forecasting a win.",
        "What's the difference between a late-stage deal and a mirage? The mirage doesn't require a new SOW.",
        "I asked our CRM for a joke. It returned 'Stage 5 - Negotiation, Expected Close: Last Quarter.'",
        "A General Counsel walks into a bar. Orders a water. Reviews the menu for liability. Leaves.",
        "My forecast is so accurate, even the weatherman asked for tips. Just kidding — I moved the close date again.",
        "Enterprise sales is just sending calendar invites to people who send you to voicemail.",
        "The fastest way to kill a deal? Tell procurement it's 'a quick signature.'",
        "If your pipeline were a stock portfolio, your CFO would have called HR by now.",
        "Legal tech sales: where 'Let me loop in my team' means you won't hear back for six weeks.",
        "They say patience is a virtue. Clearly they've never waited on a Fortune 500 procurement cycle.",
        "I don't always move deals to Stage 5, but when I do, they stay there for three months.",
        "Our AI reviewed your contract in 30 seconds. Your legal team reviewed the AI's review in 30 days.",
      ];
      const shuffled = JOKES.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 5);
      const answer = selected.map((j, i) => `${i + 1}. ${j}`).join('\n');
      return {
        success: true, query,
        answer,
        intent: 'JOKE',
        context: { intent: 'JOKE', dataFreshness: 'n/a' },
        performance: { durationMs: Date.now() - startTime },
        timestamp: new Date().toISOString()
      };
    }

    const isCrossAccountIntent = ['PIPELINE_OVERVIEW', 'OWNER_ACCOUNTS', 'MEETING_ACTIVITY', 'CUSTOMER_COUNT', 'CONTACT_SEARCH', 'WEIGHTED_PIPELINE', 'PIPELINE_BY_STAGE', 'PIPELINE_BY_PRODUCT', 'PIPELINE_BY_SALES_TYPE', 'DEALS_SIGNED', 'DEALS_TARGETING', 'LOI_DEALS', 'DEALS_CLOSED', 'SLOW_DEALS', 'PIPELINE_ADDED', 'FORECAST', 'DELIVERY_STATUS'].includes(intent);

    // ── Step 2: Session management (after cross-account/intent decisions are final) ──
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

      // Clear session context when switching to cross-account query or account changed
      if (isCrossAccountQuery || isCrossAccountIntent) {
        session.accountId = null;
        session.accountName = null;
        session.gatheredContext = null;
      } else if (accountId && session.accountId && session.accountId !== accountId) {
        session.gatheredContext = null;
        logger.info(`[Intelligence] Account changed in session, refreshing context`);
      }
      if (accountId && !isCrossAccountIntent) session.accountId = accountId;
      if (accountName && !isCrossAccountIntent) session.accountName = accountName;
    }

    logger.info(`[Intelligence] Query intent: ${intent}`, { 
      query: query.substring(0, 50), 
      isCrossAccount: isCrossAccountQuery || isCrossAccountIntent,
      forceRefresh: !!forceRefresh,
      sessionId: currentSessionId,
      turn: turnNumber,
      queryHints: Object.keys(queryHints).filter(k => queryHints[k])
    });

    // Free-text account extraction: only for account-specific intents
    if (!accountId && !accountName && !isCrossAccountIntent) {
      const extracted = extractAccountFromQuery(query);
      if (extracted) {
        accountName = extracted;
        logger.info(`[Intelligence] Extracted account name from query: "${extracted}"`);
      }
    }

    // ── Step 3: Gather context ──
    let context;
    const sessionContextAge = session?.gatheredContext?._gatheredAt ? Date.now() - session.gatheredContext._gatheredAt : Infinity;
    const isSessionContextFresh = sessionContextAge < (CACHE_TTL.ACCOUNT_CONTEXT * 1000);
    const intentChanged = session?.lastIntent && session.lastIntent !== intent;
    if (ENABLE_MULTI_TURN && session && session.gatheredContext && !forceRefresh && turnNumber > 1 && isSessionContextFresh && !intentChanged && !isCrossAccountIntent) {
      context = session.gatheredContext;
      context.dataFreshness = 'session-cached';
      logger.info(`[Intelligence] Reusing session context (turn ${turnNumber}, age ${Math.round(sessionContextAge/1000)}s)`);
    } else {
      context = await gatherContext({
        intent,
        query,
        accountId: isCrossAccountIntent ? '' : (accountId || (session?.accountId) || ''),
        accountName: isCrossAccountIntent ? '' : (accountName || (session?.accountName) || ''),
        userEmail,
        forceRefresh: !!forceRefresh
      });
      context._gatheredAt = Date.now();
      if (ENABLE_MULTI_TURN && session) {
        session.gatheredContext = context;
        session.lastIntent = intent;
      }
    }

    // Gracious disambiguation: if no account context and not a cross-account query, guide the user
    if (!context.account && !context.isPipelineQuery && !context.isOwnerQuery && !context.isMeetingQuery && !context.isLookupQuery && !context.isCustomerCountQuery && !context.isContactSearchQuery && !context.isSnapshotQuery) {
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
    const needsFreshContext = isCrossAccountIntent || intentChanged;
    if (ENABLE_MULTI_TURN && session && session.turns.length > 0 && !needsFreshContext) {
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
        { role: 'user', content: followUpContent }
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

    // Log query to PostgreSQL (non-blocking)
    try {
      const { queryLogRepo } = require('../db/repositories');
      queryLogRepo.logQuery({
        query, intent,
        accountId: context.account?.id,
        accountName: context.account?.name || context.ownerName,
        userEmail, sessionId: currentSessionId,
        responseSnippet: answer?.substring(0, 500),
        responseLength: answer?.length || 0,
        contextType: context.isPipelineQuery ? 'pipeline' : context.isSnapshotQuery ? 'snapshot' : context.isMeetingQuery ? 'meeting' : context.isOwnerQuery ? 'owner' : 'account',
        dataFreshness: context.dataFreshness || 'unknown',
        responseTimeMs: duration,
        sfStatus: 'connected'
      }).catch(e => logger.debug('[Intelligence] Query log write failed:', e.message));
    } catch (e) { /* non-critical */ }

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
  if (/tell me a joke|make me laugh|something funny|got a joke/i.test(query)) return 'JOKE';
  if (/what accounts does|'s accounts|'s book|accounts does .+ own|accounts .+ owns/i.test(query)) return 'OWNER_ACCOUNTS';
  if (BL_OWNERSHIP_REGEX.test(query)) return 'OWNER_ACCOUNTS';
  if (/how many (customers|logos|clients)|customer count|number of customers|total customers|customer list|logo count/i.test(query)) return 'CUSTOMER_COUNT';
  if (/chief legal.+based|general counsel.+based|clo.+based|gc.+based|contacts.+based in|find.+contacts|clos owned/i.test(query)) return 'CONTACT_SEARCH';
  if (/forecast|commit.*weighted|midpoint|q1 forecast/i.test(query)) return 'FORECAST';
  if (/weighted pipeline|weighted acv|pipeline weighted/i.test(query)) return 'WEIGHTED_PIPELINE';
  if (/average (deal|acv|deal size)|deal size by stage|avg (acv|deal)|mean (deal|acv)|breakdown by stage/i.test(query)) return 'PIPELINE_OVERVIEW';
  if (/stage (breakdown|distribution|split)|pipeline (breakdown|distribution|split)|q1 pipeline/i.test(query)) return 'PIPELINE_OVERVIEW';
  if (/signed this (quarter|month|week)|what have we signed|revenue signed|closed won this/i.test(query)) return 'DEALS_SIGNED';
  if (/targeting this (month|quarter)|targeting q1|targeting february|deals targeting/i.test(query)) return 'DEALS_TARGETING';
  // Close/closing/sign + month name → date-filtered targeting query (must be BEFORE PIPELINE_OVERVIEW)
  if (/(close|closing|sign|signing).*(january|february|march|april|may|june|july|august|september|october|november|december|this month|this quarter|q1|q2)/i.test(query)) return 'DEALS_TARGETING';
  if (/(january|february|march|april|may|june|july|august|september|october|november|december).*(close|closing|sign|target)/i.test(query)) return 'DEALS_TARGETING';
  if (/deals.*(this month|this quarter|in february|in march|in april)/i.test(query) && !/late|stage|negotiation|proposal|pilot/i.test(query)) return 'DEALS_TARGETING';
  // Meetings must be detected BEFORE pipeline (both can match "accounts")
  if (/meet|met |meeting/i.test(query) && /this week|today|tomorrow|scheduled|upcoming/i.test(query)) return 'MEETING_ACTIVITY';
  if (/accounts.*(meet|met|meeting)|meeting.*(account|with)/i.test(query)) return 'MEETING_ACTIVITY';
  if (/pipeline by (product|solution)|product (breakdown|line breakdown)|solution breakdown/i.test(query)) return 'PIPELINE_BY_PRODUCT';
  if (/pipeline by sales type|new business pipeline|expansion pipeline|renewal pipeline/i.test(query)) return 'PIPELINE_BY_SALES_TYPE';
  if (/loi (deals|signed|this)|lois signed|what lois/i.test(query)) return 'LOI_DEALS';
  if (/what deals have closed|deals (have |that )?(closed|been closed)|closed deals|what (have we|did we) (close|sign|win)|deals won|what have we closed/i.test(query)) return 'DEALS_CLOSED';
  if (/stuck deals|slow deals|stale deals|deals stuck|stalled|no movement/i.test(query)) return 'SLOW_DEALS';
  if (/added to pipeline|pipeline added|new pipeline this|deals added this/i.test(query)) return 'PIPELINE_ADDED';
  if (/which accounts have (multiple|many|several|more than one) .*(opportunit|deal|opp)/i.test(query)) return 'PIPELINE_OVERVIEW';
  if (/what deals are (late|in |at )|which (deals|opportunities) are|deals in (negotiation|proposal|pilot)|late stage (contracting|compliance|m&a)|open (deals|opportunities)|active pipeline|total pipeline/i.test(query)) return 'PIPELINE_OVERVIEW';
  if (/when does .+ (close|expire|end|renew)|what stage is .+ (deal|opp|in\b)/i.test(query)) return 'DEAL_STATUS';
  if (/latest (activity|update|on)|recent activity|what happened (with|at|on)/i.test(query)) return 'HISTORY';
  if (/how should (eudia|we) (position|approach)|position(ing)? for\b|approach to .+ given|how (should|would|could) (we|eudia) .*(pitch|sell|engage|target)/i.test(query)) return 'POSITIONING';

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
          'loi_deals': 'LOI_DEALS',
          'loi_accounts': 'LOI_DEALS',
          'loi_count': 'LOI_DEALS',
          'arr_deals': 'DEALS_CLOSED',
          'arr_contracts': 'DEALS_CLOSED',
          'weighted_summary': 'WEIGHTED_PIPELINE',
          'weighted_pipeline': 'WEIGHTED_PIPELINE',
          'late_stage_pipeline': 'PIPELINE_OVERVIEW',
          'product_pipeline': 'PIPELINE_BY_PRODUCT',
          'slow_deals': 'SLOW_DEALS',
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
  // PIPELINE_OVERVIEW now routes through gatherSnapshotContext (same proven SOQL path
  // as DEALS_TARGETING, WEIGHTED_PIPELINE, etc.) instead of gatherPipelineContext
  // which has a persistent failure mode despite identical SOQL.
  if (intent === 'PIPELINE_OVERVIEW') {
    return await gatherSnapshotContext('PIPELINE_OVERVIEW', query);
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
  // New cross-account intents powered by weekly snapshot bridge
  if (['FORECAST', 'WEIGHTED_PIPELINE', 'DEALS_SIGNED', 'DEALS_TARGETING', 'PIPELINE_BY_PRODUCT', 'PIPELINE_BY_SALES_TYPE', 'LOI_DEALS', 'DEALS_CLOSED', 'SLOW_DEALS', 'PIPELINE_ADDED'].includes(intent)) {
    return await gatherSnapshotContext(intent, query);
  }

  // For account-specific queries, we need an account
  if (!accountId && accountName) {
    logger.info(`[Intelligence] Looking up account by name: "${accountName}"`);
    const lookupResult = await findAccountByName(accountName);
    const account = lookupResult?.account || (lookupResult?.Id ? lookupResult : null);
    if (account) {
      accountId = account.Id;
      const displayName = account.Account_Display_Name__c || account.Name;
      logger.info(`[Intelligence] Found account: ${displayName} (${account.Id})`);
      context.account = {
        id: account.Id,
        name: displayName,
        owner: account.Owner?.Name,
        ownerEmail: account.Owner?.Email,
        type: account.Customer_Type__c,
        industry: account.Industry,
        website: account.Website
      };
    } else {
      const status = lookupResult?.status || 'unknown';
      logger.warn(`[Intelligence] Account lookup result: ${status} for "${accountName}"`);
      if (status === 'lookup_error') {
        context.lookupError = `Salesforce lookup failed for "${accountName}": ${lookupResult.error}`;
      } else if (status === 'not_found') {
        context.lookupNotFound = accountName;
      }
    }
  }

  if (!accountId) {
    logger.warn(`[Intelligence] No accountId available - returning minimal context for query`);
    return context;
  }

  await ensureSalesforceConnection();

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
  context.obsidianNotes = context.meetingNotes || [];
  context.slackIntel = getIntelForAccount(accountId) || [];
  
  if (context.slackIntel?.length > 0) {
    logger.debug(`[Intelligence] Loaded ${context.slackIntel.length} Slack intel items for ${accountId}`);
  }

  context.vectorResults = [];
  if (vectorSearch && vectorSearch.isHealthy() && query) {
    try {
      const vResults = await vectorSearch.search(query, { accountId, limit: 5 });
      context.vectorResults = vResults || [];
      if (vResults?.length > 0) {
        logger.info(`[Intelligence] Vector search returned ${vResults.length} results for "${query.substring(0, 40)}"`);
      }
    } catch (err) {
      logger.warn('[Intelligence] Vector search error:', err.message);
    }
  }
  
  logger.info(`[Intelligence] Context summary for ${context.account?.name || accountId}: ` +
    `${context.opportunities?.length || 0} opps, ${context.contacts?.length || 0} contacts, ` +
    `${context.recentTasks?.length || 0} tasks, ${context.recentEvents?.length || 0} past events, ${context.upcomingEvents?.length || 0} upcoming, ` +
    `${context.meetingNotes?.length || 0} meeting notes, customerBrain: ${context.customerBrain ? 'yes' : 'no'}` +
    `${context.vectorResults?.length > 0 ? `, ${context.vectorResults.length} vector matches` : ''}`);

  if (intent === 'PRE_MEETING' && context.upcomingEvents?.length > 0) {
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
  if (!isValidSalesforceId(accountId)) { logger.warn(`[Intelligence] Invalid accountId for getAccountDetails: "${accountId}"`); return null; }
  try {
    const result = await sfQuery(`
      SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Customer_Subtype__c,
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
      name: acc.Account_Display_Name__c || acc.Name,
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
  if (!isValidSalesforceId(accountId)) { logger.warn(`[Intelligence] Invalid accountId for getOpportunities: "${accountId}"`); return []; }
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
  if (!isValidSalesforceId(accountId)) { logger.warn(`[Intelligence] Invalid accountId for getContacts: "${accountId}"`); return []; }
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
  if (!isValidSalesforceId(accountId)) return [];
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
  if (!isValidSalesforceId(accountId)) return { past: [], upcoming: [] };
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
  if (!isValidSalesforceId(accountId)) return [];
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
  if (!accountName || accountName.trim().length === 0) return { account: null, status: 'empty_input' };
  
  try {
    await ensureSalesforceConnection();
    let cleanName = accountName.trim();
    
    // Abbreviation expansion for short account names
    const ACCOUNT_ABBREVIATIONS = {
      'cvc': 'CVC', 'chs': 'CHS', 'aes': 'AES', 'boi': 'BOI', 'esb': 'ESB',
      'dhl': 'DHL', 'wwt': 'World Wide Technology', 'bny': 'BNY',
      'ge': 'GE Vernova', 'ibm': 'IBM', 'sap': 'SAP', 'ubs': 'UBS',
      'cms': 'CMS Energy', 'cvs': 'CVS', 'hpe': 'HPE',
      'chsinc': 'CHS', 'servicenow': 'ServiceNow',
    };
    const lowerName = cleanName.toLowerCase().replace(/[\s\-_.]+/g, '');
    if (ACCOUNT_ABBREVIATIONS[lowerName]) {
      logger.info(`[Intelligence] Abbreviation expanded: "${cleanName}" -> "${ACCOUNT_ABBREVIATIONS[lowerName]}"`);
      cleanName = ACCOUNT_ABBREVIATIONS[lowerName];
    }
    
    // Pre-process: split concatenated names (Chsinc -> Chs inc, Libertymutual -> Liberty mutual)
    const splitName = cleanName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    if (splitName !== cleanName && splitName.includes(' ')) {
      logger.info(`[Intelligence] Pre-processed name: "${cleanName}" -> "${splitName}"`);
      cleanName = splitName;
    }
    
    // Normalize short names (2-4 chars) to uppercase: "Cvc" -> "CVC", "Chs" -> "CHS"
    if (cleanName.length <= 4 && cleanName.length >= 2) {
      cleanName = cleanName.toUpperCase();
    }
    
    const safeName = cleanName.replace(/'/g, "\\'");
    
    // Strategy 0: Case-insensitive exact match (critical for short names like CVC, CHS)
    let result = await sfQuery(`
      SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account WHERE Name = '${safeName}' OR Account_Display_Name__c = '${safeName}'
        OR Name = '${safeName.toUpperCase()}' OR Name = '${safeName.toLowerCase()}'
      LIMIT 1
    `, true);
    if (result?.records?.[0]) {
      logger.info(`[Intelligence] Account found (case-insensitive exact): ${result.records[0].Account_Display_Name__c || result.records[0].Name}`);
      return result.records[0];
    }
    
    // Strategy 1: Exact match (Name or Display Name for Counsel accounts)
    result = await sfQuery(`
      SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account WHERE Name = '${safeName}' OR Account_Display_Name__c = '${safeName}' LIMIT 1
    `, true);
    if (result?.records?.[0]) {
      logger.info(`[Intelligence] Account found (exact): ${result.records[0].Account_Display_Name__c || result.records[0].Name}`);
      return result.records[0];
    }
    
    // Strategy 2: LIKE match (contains — searches both Name and Display Name)
    result = await sfQuery(`
      SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account WHERE Name LIKE '%${safeName}%' OR Account_Display_Name__c LIKE '%${safeName}%'
      ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
    `, true);
    if (result?.records?.[0]) {
      logger.info(`[Intelligence] Account found (LIKE): ${result.records[0].Account_Display_Name__c || result.records[0].Name}`);
      return result.records[0];
    }
    
    // Strategy 3: Try without common suffixes/prefixes
    const stripped = cleanName
      .replace(/\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Group|Holdings|PLC|S\.A\.?|AG|GmbH|Co\.?)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    if (stripped !== cleanName && stripped.length > 2) {
      const safeStripped = stripped.replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '%${safeStripped}%' OR Account_Display_Name__c LIKE '%${safeStripped}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (stripped suffix): ${result.records[0].Account_Display_Name__c || result.records[0].Name} (searched: "${stripped}")`);
        return result.records[0];
      }
    }
    
    // Strategy 4: First word only (for cases like "T-mobile" → "T-Mobile US")
    const firstWord = cleanName.split(/[\s\-\/]/)[0];
    if (firstWord.length >= 3 && firstWord !== cleanName) {
      const safeFirst = firstWord.replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '${safeFirst}%' OR Account_Display_Name__c LIKE '${safeFirst}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (first-word): ${result.records[0].Account_Display_Name__c || result.records[0].Name} (searched: "${firstWord}")`);
        return result.records[0];
      }
    }
    
    // Strategy 5: Try original (pre-split) name if splitting changed it
    if (splitName !== accountName.trim()) {
      const safeOriginal = accountName.trim().replace(/'/g, "\\'");
      result = await sfQuery(`
        SELECT Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry
        FROM Account WHERE Name LIKE '%${safeOriginal}%'
        ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1
      `, true);
      if (result?.records?.[0]) {
        logger.info(`[Intelligence] Account found (original unsplit): ${result.records[0].Account_Display_Name__c || result.records[0].Name}`);
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
          const soslQuery = `FIND {${soslTerm}} IN NAME FIELDS RETURNING Account(Id, Name, Account_Display_Name__c, Owner.Name, Owner.Email, Customer_Type__c, Industry ORDER BY LastActivityDate DESC NULLS LAST LIMIT 1)`;
          const soslResult = await conn.search(soslQuery);
          if (soslResult?.searchRecords?.[0]) {
            logger.info(`[Intelligence] Account found (SOSL fuzzy): ${soslResult.searchRecords[0].Account_Display_Name__c || soslResult.searchRecords[0].Name} (searched: "${soslTerm}")`);
            return soslResult.searchRecords[0];
          }
        }
      }
    } catch (soslErr) {
      logger.warn('[Intelligence] SOSL strategy failed:', soslErr.message);
    }

    logger.warn(`[Intelligence] No account found after 6 strategies for: "${accountName}"`);
    return { account: null, status: 'not_found', searchedName: accountName };
  } catch (error) {
    logger.error('[Intelligence] Account lookup error:', error.message);
    return { account: null, status: 'lookup_error', error: error.message, searchedName: accountName };
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
    await ensureSalesforceConnection();

    const lower = (queryText || '').toLowerCase();
    let allRecords = [];

    // Determine if this is a closed-deal query (won/lost) vs active pipeline
    const isClosedQuery = lower.includes('won') || lower.includes('signed') || lower.includes('closed') || lower.includes('lost') || lower.includes('logos');

    if (isClosedQuery) {
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

      const soql = `SELECT Id, Name, AccountId, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep, Owner.Name, IsClosed, IsWon, Probability FROM Opportunity WHERE ${conditions.join(' AND ')} ORDER BY ACV__c DESC NULLS LAST LIMIT 200`;
      logger.info(`[Pipeline] Closed-deal SOQL: ${soql.substring(0, 120)}...`);
      const result = await sfQuery(soql, false);
      allRecords = result?.records || [];
      logger.info(`[Pipeline] Closed-deal query returned ${allRecords.length} records`);
    } else {
      const soql = `SELECT Id, Name, AccountId, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep, Owner.Name, IsClosed, IsWon, Probability FROM Opportunity WHERE IsClosed = false AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation') ORDER BY ACV__c DESC NULLS LAST LIMIT 200`;
      logger.info(`[Pipeline] Active pipeline SOQL executing...`);
      const result = await sfQuery(soql, false);
      allRecords = result?.records || [];
      logger.info(`[Pipeline] Active pipeline returned ${allRecords.length} records`);
    }

    // Apply in-memory filters based on query content
    let filtered = allRecords;

    if (!isClosedQuery) {
      // Stage filter — semantic mapping from natural language to Salesforce stage names
      if (lower.includes('late stage')) {
        filtered = filtered.filter(o => ['Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'].includes(o.StageName));
      } else if (lower.includes('negotiation') || lower.includes('stage 5')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 5 - Negotiation');
      } else if (lower.includes('proposal') || lower.includes('stage 4')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 4 - Proposal');
      } else if (lower.includes('pilot') || lower.includes('poc') || lower.includes('stage 3')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 3 - Pilot');
      } else if (lower.includes('sqo') || lower.includes('qualified') || lower.includes('stage 2')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 2 - SQO');
      } else if (lower.includes('discovery') || lower.includes('stage 1')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 1 - Discovery');
      } else if (lower.includes('prospecting') || lower.includes('being prospected') || lower.includes('stage 0')) {
        filtered = filtered.filter(o => o.StageName === 'Stage 0 - Prospecting');
      } else if (lower.includes('early stage')) {
        filtered = filtered.filter(o => ['Stage 0 - Prospecting', 'Stage 1 - Discovery'].includes(o.StageName));
      } else if (lower.includes('mid stage')) {
        filtered = filtered.filter(o => ['Stage 2 - SQO', 'Stage 3 - Pilot'].includes(o.StageName));
      }

      // Product line filter — match keywords to Salesforce Product_Line__c values
      for (const [keyword, pl] of Object.entries(PRODUCT_LINE_MAP)) {
        if (lower.includes(keyword)) {
          filtered = filtered.filter(o => {
            const plValue = (o.Product_Line__c || '');
            if (pl.partial) {
              const prefix = pl.value.split('_')[0];
              return plValue.startsWith(prefix) || plValue.toLowerCase().includes(keyword);
            }
            return plValue === pl.value;
          });
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
        account: opp.Account?.Account_Display_Name__c || opp.Account?.Name,
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
      totalOpportunities: filtered.length,
      totalAcv,
      byStage,
      byOwner,
      customerCount,
      dataFreshness: 'live'
    };
  } catch (error) {
    logger.error(`[Pipeline] CRITICAL: gatherPipelineContext FAILED: ${error.message}`, { stack: error.stack?.split('\n').slice(0, 3).join(' | ') });
    return { isPipelineQuery: true, error: `Pipeline query failed: ${error.message}` };
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

  const lookupResult = await findAccountByName(accountName);
  const account = lookupResult?.account || (lookupResult?.Id ? lookupResult : null);
  
  return {
    isLookupQuery: true,
    searchedName: accountName,
    lookupStatus: lookupResult?.status || (account ? 'found' : 'not_found'),
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
    await ensureSalesforceConnection();
    const userResult = await sfQuery(`SELECT Id, Name FROM User WHERE Email = '${bl.email}' LIMIT 1`, false);
    const userId = userResult?.records?.[0]?.Id;
    if (!userId) {
      return { isOwnerQuery: true, ownerName: bl.name, error: `No Salesforce user found for ${bl.name}`, dataFreshness: 'live' };
    }

    const [acctResult, oppResult, aggResult, commitResult] = await Promise.all([
      sfQuery(`SELECT Id, Name, Account_Display_Name__c, Customer_Type__c, Industry, LastActivityDate FROM Account WHERE OwnerId = '${userId}' ORDER BY LastActivityDate DESC NULLS LAST LIMIT 200`, false),
      sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, Quarterly_Commit__c, Weighted_ACV_AI_Enabled__c, Product_Line__c, CloseDate, Target_LOI_Date__c FROM Opportunity WHERE OwnerId = '${userId}' AND IsClosed = false ORDER BY ACV__c DESC NULLS LAST LIMIT 100`, false),
      sfQuery(`SELECT SUM(ACV__c) totalAcv, COUNT(Id) cnt FROM Opportunity WHERE OwnerId = '${userId}' AND IsClosed = false`, false).catch(() => null),
      sfQuery(`SELECT SUM(Quarterly_Commit__c) totalCommit, SUM(Weighted_ACV_AI_Enabled__c) totalWeighted FROM Opportunity WHERE OwnerId = '${userId}' AND IsClosed = false AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation') AND Target_LOI_Date__c <= ${FISCAL_Q1_END}`, false).catch(() => null)
    ]);

    const accounts = (acctResult?.records || []).map(a => ({
      name: a.Account_Display_Name__c || a.Name, type: a.Customer_Type__c, industry: a.Industry, lastActivity: a.LastActivityDate
    }));
    const opps = (oppResult?.records || []).map(o => ({
      name: o.Name, account: o.Account?.Account_Display_Name__c || o.Account?.Name, stage: o.StageName, acv: o.ACV__c, commitNet: o.Quarterly_Commit__c || 0, weightedAI: o.Weighted_ACV_AI_Enabled__c || 0, product: cleanProductLine(o.Product_Line__c), closeDate: o.CloseDate, targetDate: o.Target_LOI_Date__c
    }));
    const aggTotalAcv = aggResult?.records?.[0]?.totalAcv || opps.reduce((sum, o) => sum + (o.acv || 0), 0);
    const aggOppCount = aggResult?.records?.[0]?.cnt || opps.length;
    const totalCommitNet = commitResult?.records?.[0]?.totalCommit || opps.reduce((sum, o) => sum + (o.commitNet || 0), 0);
    const totalWeightedAI = commitResult?.records?.[0]?.totalWeighted || opps.reduce((sum, o) => sum + (o.weightedAI || 0), 0);

    const lower = (query || '').toLowerCase();
    const wantsActivity = /recent activity|recently active|engaging|engaged|active this week|been active/i.test(lower);
    let recentActivity = null;
    if (wantsActivity) {
      try {
        const { calendarService } = require('../services/calendarService');
        const calResult = await calendarService.getUpcomingMeetingsForAllBLs(7, false);
        if (calResult?.meetings?.length > 0) {
          const now = new Date();
          const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
          const blMeetings = calResult.meetings
            .filter(m => (m.ownerEmail || '').toLowerCase() === bl.email.toLowerCase())
            .filter(m => { const d = new Date(m.startDateTime); return d >= weekStart && d <= weekEnd; })
            .filter(m => m.externalAttendees?.length > 0)
            .map(m => ({
              account: m.accountName || m.externalAttendees?.[0]?.email?.split('@')[1]?.split('.')[0] || 'Unknown',
              subject: m.subject,
              date: m.startDateTime
            }));
          if (blMeetings.length > 0) recentActivity = blMeetings;
        }
      } catch (e) { logger.debug('[Intelligence] Activity enrichment failed:', e.message); }
    }

    const topByCommit = opps.filter(o => o.commitNet > 0).sort((a, b) => b.commitNet - a.commitNet).slice(0, 5);

    return {
      isOwnerQuery: true, ownerName: bl.name, ownerEmail: bl.email,
      accounts, accountCount: accounts.length,
      opportunities: opps, oppCount: aggOppCount,
      totalAcv: aggTotalAcv,
      totalCommitNet, totalWeightedAI,
      topByCommit,
      recentActivity,
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
    const isUpcoming = lower.includes('upcoming') || lower.includes('scheduled') || lower.includes('are we meeting');
    const label = isUpcoming ? 'Upcoming meetings this week' : 'Meetings this week';

    let meetings = [];

    // Strategy 1: Use Outlook calendar data (in-memory cache) — more complete than SF Events
    try {
      const { calendarService } = require('../services/calendarService');
      const calResult = await calendarService.getUpcomingMeetingsForAllBLs(7, false);
      if (calResult?.meetings?.length > 0) {
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);

        meetings = calResult.meetings
          .filter(m => {
            const d = new Date(m.startDateTime);
            return d >= weekStart && d <= weekEnd;
          })
          .filter(m => m.externalAttendees?.length > 0)
          .filter(m => {
            const ownerLower = (m.ownerEmail || m.ownerName || '').toLowerCase();
            const subjectLower = (m.subject || '').toLowerCase();
            if (ownerLower.includes('daniel.kim') || ownerLower.includes('daniel kim')) return false;
            if (subjectLower.includes('campfire')) return false;
            return true;
          })
          .map(m => {
            const emailToName = (email) => {
              if (!email) return 'Unknown';
              const bl = BL_NAME_MAP[email.split('@')[0]?.split('.')[0]?.toLowerCase()];
              if (bl) return bl.name;
              const parts = email.split('@')[0].split('.');
              if (parts.length >= 2) {
                return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
              }
              return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Unknown';
            };
            return {
              account: m.accountName || m.externalAttendees?.[0]?.email?.split('@')[1]?.split('.')[0] || 'Unknown',
              subject: m.subject,
              date: m.startDateTime,
              owner: m.ownerName || emailToName(m.ownerEmail),
              externalCount: m.externalAttendees?.length || 0
            };
          });
        logger.info(`[Intelligence] Calendar meetings this week: ${meetings.length}`);
      }
    } catch (calErr) {
      logger.warn('[Intelligence] Calendar fallback failed, trying SF Events:', calErr.message);
    }

    // Strategy 2: Fallback to SF Events if calendar data is empty
    if (meetings.length === 0) {
      await ensureSalesforceConnection();
      const dateFilter = 'StartDateTime >= THIS_WEEK AND StartDateTime <= NEXT_WEEK';
      const result = await sfQuery(`
        SELECT Account.Name, Account.Account_Display_Name__c, Subject, StartDateTime, Owner.Name
        FROM Event
        WHERE ${dateFilter} AND AccountId != null
        ORDER BY StartDateTime ASC
        LIMIT 50
      `, false);

      meetings = (result?.records || []).map(e => ({
        account: e.Account?.Account_Display_Name__c || e.Account?.Name,
        subject: e.Subject,
        date: e.StartDateTime,
        owner: e.Owner?.Name
      }));
    }

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
      label = 'Revenue Customers';
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
 * Gather context using weekly snapshot bridge functions for specialized pipeline queries.
 * Each intent maps to a specific, battle-tested function from blWeeklySummary.js.
 */
/**
 * Direct SOQL for all cross-account queries. No bridge functions, no cache.
 * Every query uses useCache=false for live data.
 */
async function gatherSnapshotContext(intent, query) {
  try {
    await ensureSalesforceConnection();

    const STAGES = "'Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'";
    let records = [];
    let label = intent;
    let metadata = {};

    switch (intent) {
      case 'PIPELINE_OVERVIEW': {
        const lower = (query || '').toLowerCase();
        let stageFilter = STAGES;
        let labelSuffix = '';
        let dateFilter = '';

        // Stage filtering
        if (lower.includes('late stage')) { stageFilter = "'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'"; labelSuffix = ' (Late Stage)'; }
        else if (lower.includes('negotiation') || lower.includes('stage 5')) { stageFilter = "'Stage 5 - Negotiation'"; labelSuffix = ' (Negotiation)'; }
        else if (lower.includes('proposal') || lower.includes('stage 4')) { stageFilter = "'Stage 4 - Proposal'"; labelSuffix = ' (Proposal)'; }
        else if (lower.includes('pilot') || lower.includes('stage 3')) { stageFilter = "'Stage 3 - Pilot'"; labelSuffix = ' (Pilot)'; }
        else if (lower.includes('early stage') || lower.includes('prospecting')) { stageFilter = "'Stage 0 - Prospecting', 'Stage 1 - Discovery'"; labelSuffix = ' (Early Stage)'; }

        // Date filtering — applies when month/quarter is mentioned
        if (lower.includes('this month') || lower.includes('february')) {
          dateFilter = 'AND Target_LOI_Date__c = THIS_MONTH';
          if (!labelSuffix) labelSuffix = ' (February)';
        } else if (lower.includes('march')) {
          dateFilter = 'AND Target_LOI_Date__c >= 2026-03-01 AND Target_LOI_Date__c <= 2026-03-31';
          if (!labelSuffix) labelSuffix = ' (March)';
        } else if (lower.includes('april')) {
          dateFilter = 'AND Target_LOI_Date__c >= 2026-04-01 AND Target_LOI_Date__c <= 2026-04-30';
          if (!labelSuffix) labelSuffix = ' (April)';
        } else if (lower.includes('this quarter') || lower.includes('q1')) {
          dateFilter = `AND Target_LOI_Date__c >= ${FISCAL_Q1_START} AND Target_LOI_Date__c <= ${FISCAL_Q1_END}`;
          if (!labelSuffix) labelSuffix = ' (Q1 FY26)';
        }

        const [r, aggR] = await Promise.all([
          sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, Target_LOI_Date__c, Product_Line__c, Owner.Name FROM Opportunity WHERE IsClosed = false AND StageName IN (${stageFilter}) ${dateFilter} ORDER BY ACV__c DESC NULLS LAST LIMIT 200`, false),
          sfQuery(`SELECT SUM(ACV__c) totalAcv, COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND StageName IN (${stageFilter}) ${dateFilter}`, false).catch(() => null)
        ]);
        records = r?.records || [];
        const aggTotals = aggR?.records?.[0] || {};

        // Apply product line filter if mentioned
        for (const [kw, pl] of Object.entries(PRODUCT_LINE_MAP)) {
          if (lower.includes(kw)) {
            records = records.filter(o => {
              const pv = (o.Product_Line__c || '').toLowerCase();
              return pl.partial ? pv.includes(kw) || pv.startsWith(pl.value.split('_')[0].toLowerCase()) : pv === pl.value.toLowerCase();
            });
            labelSuffix += ` — ${kw}`;
            break;
          }
        }

        // Average deal size by stage — separate aggregate SOQL when "average" is in the query
        const isAverageQuery = /average|avg |mean |deal size/i.test(lower);
        if (isAverageQuery) {
          const avgR = await sfQuery(`SELECT StageName, COUNT(Id) cnt, SUM(ACV__c) totalAcv, AVG(ACV__c) avgAcv FROM Opportunity WHERE IsClosed = false AND StageName IN (${stageFilter}) ${dateFilter} GROUP BY StageName ORDER BY AVG(ACV__c) DESC`, false);
          const avgByStage = (avgR?.records || []).map(r => ({
            stage: r.StageName, count: r.cnt || 0, totalAcv: r.totalAcv || 0, avgAcv: r.avgAcv || 0
          }));
          let grandTotal = 0, grandCount = 0;
          for (const s of avgByStage) { grandTotal += s.totalAcv; grandCount += s.count; }
          metadata = { isAverageQuery: true, avgByStage, grandTotal, grandCount, grandAvg: grandCount > 0 ? grandTotal / grandCount : 0 };
          label = `Average Deal Size by Stage${labelSuffix}`;
          break;
        }

        // Build summary metadata — use aggregate for accurate totals
        const totalAcv = aggTotals.totalAcv || records.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
        const totalDeals = aggTotals.cnt || records.length;
        const byStage = {};
        for (const o of records) {
          const s = o.StageName || 'Unknown';
          if (!byStage[s]) byStage[s] = 0;
          byStage[s]++;
        }
        metadata = { totalDeals, totalAcv, byStage };
        label = `Active Pipeline${labelSuffix}`;
        break;
      }
      case 'FORECAST': {
        let forecastData = null;
        if (weeklySnapshotBridge?.queryAIEnabledForecast) {
          try { forecastData = await weeklySnapshotBridge.queryAIEnabledForecast(); } catch (e) { logger.warn('[Forecast] Bridge failed, using inline SOQL:', e.message); }
        }
        if (forecastData) {
          metadata = { commitNet: forecastData.commitNet || 0, weightedNet: forecastData.weightedNet || 0, midpoint: forecastData.midpoint || 0, dealCount: forecastData.dealCount || 0 };
          const blCommitsObj = forecastData.blCommits || {};
          metadata.blCommits = Object.entries(blCommitsObj).map(([name, commit]) => ({ name, commit })).filter(bl => bl.commit > 0).sort((a, b) => b.commit - a.commit);
        } else {
          const r = await sfQuery(`SELECT SUM(Quarterly_Commit__c) totalCommit, SUM(Weighted_ACV_AI_Enabled__c) totalWeighted, COUNT(Id) dealCount FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) AND Target_LOI_Date__c <= ${FISCAL_Q1_END}`, false);
          const agg = r?.records?.[0] || {};
          metadata = { commitNet: agg.totalCommit || 0, weightedNet: agg.totalWeighted || 0, midpoint: ((agg.totalCommit || 0) + (agg.totalWeighted || 0)) / 2, dealCount: agg.dealCount || 0 };
          const blR = await sfQuery(`SELECT Owner.Name, SUM(Quarterly_Commit__c) blCommit FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) AND Target_LOI_Date__c <= ${FISCAL_Q1_END} AND Quarterly_Commit__c > 0 GROUP BY Owner.Name`, false).catch(() => ({ records: [] }));
          metadata.blCommits = (blR?.records || []).map(r => ({ name: r.Owner?.Name, commit: r.blCommit })).filter(bl => bl.name && bl.commit > 0).sort((a, b) => b.commit - a.commit);
        }
        const topOppsR = await sfQuery(`SELECT Owner.Name, Account.Name, Account.Account_Display_Name__c, ACV__c, StageName FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) AND Target_LOI_Date__c <= ${FISCAL_Q1_END} ORDER BY ACV__c DESC NULLS LAST LIMIT 100`, false).catch(() => ({ records: [] }));
        const blTopOpps = {};
        for (const o of (topOppsR?.records || [])) {
          const owner = o.Owner?.Name || 'Unknown';
          if (!blTopOpps[owner]) blTopOpps[owner] = [];
          if (blTopOpps[owner].length < 3) {
            blTopOpps[owner].push({ account: o.Account?.Account_Display_Name__c || o.Account?.Name, acv: o.ACV__c, stage: o.StageName });
          }
        }
        metadata.blTopOpps = blTopOpps;
        label = 'Q1 FY26 Forecast';
        break;
      }
      case 'WEIGHTED_PIPELINE': {
        const r = await sfQuery(`SELECT StageName, SUM(ACV__c) grossAcv, SUM(Weighted_ACV__c) weightedAcv, COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) GROUP BY StageName ORDER BY SUM(ACV__c) DESC`, false);
        records = r?.records || [];
        label = 'Weighted Pipeline by Stage';
        break;
      }
      case 'DEALS_SIGNED': {
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, ACV__c, CloseDate, Revenue_Type__c, Owner.Name FROM Opportunity WHERE IsWon = true AND CloseDate = THIS_FISCAL_QUARTER ORDER BY CloseDate DESC LIMIT 30`, false);
        records = r?.records || [];
        label = 'Signed Deals This Quarter';
        break;
      }
      case 'DEALS_TARGETING': {
        const lower = query.toLowerCase();
        // Detect specific month or quarter references
        let dateFilter;
        if (lower.includes('this month') || lower.includes('february')) {
          dateFilter = 'Target_LOI_Date__c = THIS_MONTH';
        } else if (lower.includes('march')) {
          dateFilter = `Target_LOI_Date__c >= 2026-03-01 AND Target_LOI_Date__c <= 2026-03-31`;
        } else if (lower.includes('april')) {
          dateFilter = `Target_LOI_Date__c >= 2026-04-01 AND Target_LOI_Date__c <= 2026-04-30`;
        } else if (lower.includes('this quarter') || lower.includes('q1')) {
          dateFilter = `Target_LOI_Date__c >= ${FISCAL_Q1_START} AND Target_LOI_Date__c <= ${FISCAL_Q1_END}`;
        } else {
          dateFilter = `Target_LOI_Date__c >= ${FISCAL_Q1_START} AND Target_LOI_Date__c <= ${FISCAL_Q1_END}`;
        }
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, ACV__c, Target_LOI_Date__c, StageName, Product_Line__c, Owner.Name FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) AND ${dateFilter} ORDER BY ACV__c DESC LIMIT 30`, false);
        records = r?.records || [];
        label = (lower.includes('this month') || lower.includes('february')) ? 'Targeting This Month' : 'Targeting This Quarter';
        break;
      }
      case 'PIPELINE_BY_PRODUCT': {
        const r = await sfQuery(`SELECT Product_Line__c, SUM(ACV__c) totalAcv, COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) GROUP BY Product_Line__c ORDER BY SUM(ACV__c) DESC`, false);
        records = r?.records || [];
        label = 'Pipeline by Product Line';
        break;
      }
      case 'PIPELINE_BY_SALES_TYPE': {
        const r = await sfQuery(`SELECT Sales_Type__c, SUM(ACV__c) totalAcv, COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) GROUP BY Sales_Type__c ORDER BY SUM(ACV__c) DESC`, false);
        records = r?.records || [];
        label = 'Pipeline by Sales Type';
        break;
      }
      case 'LOI_DEALS': {
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, ACV__c, CloseDate, Owner.Name FROM Opportunity WHERE IsClosed = true AND IsWon = true AND Revenue_Type__c = 'Commitment' ORDER BY CloseDate DESC LIMIT 30`, false);
        records = r?.records || [];
        label = 'LOI Deals Signed';
        break;
      }
      case 'DEALS_CLOSED': {
        const lower = query.toLowerCase();
        let closedDateFilter = 'CloseDate = THIS_FISCAL_QUARTER';
        let closedLabel = 'Closed Deals — Q1 FY26';
        if (lower.includes('last 30') || lower.includes('past 30') || lower.includes('this month')) {
          closedDateFilter = 'CloseDate = LAST_N_DAYS:30';
          closedLabel = 'Closed Deals — Last 30 Days';
        } else if (lower.includes('last month')) {
          closedDateFilter = 'CloseDate = LAST_MONTH';
          closedLabel = 'Closed Deals — Last Month';
        }
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, ACV__c, Weighted_ACV_AI_Enabled__c, CloseDate, Revenue_Type__c, Product_Line__c, Owner.Name FROM Opportunity WHERE IsWon = true AND ${closedDateFilter} ORDER BY CloseDate DESC LIMIT 30`, false);
        records = r?.records || [];
        let totalNetAcv = 0, totalAiEnabled = 0;
        for (const o of records) {
          totalNetAcv += o.ACV__c || 0;
          totalAiEnabled += o.Weighted_ACV_AI_Enabled__c || 0;
        }
        metadata = { totalNetAcv, totalAiEnabled, dealCount: records.length };
        label = closedLabel;
        break;
      }
      case 'SLOW_DEALS': {
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, Days_in_Stage__c, LastModifiedDate, Owner.Name FROM Opportunity WHERE IsClosed = false AND StageName IN (${STAGES}) ORDER BY Days_in_Stage__c DESC NULLS LAST LIMIT 100`, false);
        records = r?.records || [];
        for (const o of records) {
          if (!o.Days_in_Stage__c && o.LastModifiedDate) {
            o.Days_in_Stage__c = Math.floor((Date.now() - new Date(o.LastModifiedDate).getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        records.sort((a, b) => (b.Days_in_Stage__c || 0) - (a.Days_in_Stage__c || 0));
        const buckets = { '0-14 days': 0, '15-30 days': 0, '31-60 days': 0, '60+ days': 0 };
        for (const o of records) {
          const d = o.Days_in_Stage__c || 0;
          if (d > 60) buckets['60+ days']++;
          else if (d > 30) buckets['31-60 days']++;
          else if (d > 14) buckets['15-30 days']++;
          else buckets['0-14 days']++;
        }
        const avgDays = records.length > 0 ? Math.round(records.reduce((s, o) => s + (o.Days_in_Stage__c || 0), 0) / records.length) : 0;
        metadata = { buckets, avgDays, totalDeals: records.length };
        records = records.filter(o => (o.Days_in_Stage__c || 0) > 30);
        label = 'Pipeline Velocity — Days in Current Stage';
        break;
      }
      case 'PIPELINE_ADDED': {
        const r = await sfQuery(`SELECT Id, Name, Account.Name, Account.Account_Display_Name__c, StageName, ACV__c, CreatedDate, Owner.Name, Product_Line__c FROM Opportunity WHERE IsClosed = false AND CreatedDate = THIS_WEEK ORDER BY CreatedDate DESC LIMIT 20`, false);
        records = r?.records || [];
        label = 'New Pipeline This Week';
        break;
      }
      default:
        return { isSnapshotQuery: true, intent, error: `Unknown intent: ${intent}`, dataFreshness: 'error' };
    }

    logger.info(`[Intelligence] Snapshot SOQL for ${intent}: ${records.length} records, metadata: ${JSON.stringify(metadata).substring(0, 100)}`);
    return { isSnapshotQuery: true, intent, label, records, metadata, dataFreshness: 'live' };
  } catch (error) {
    logger.error(`[Intelligence] Snapshot context error (${intent}):`, error.message);
    return { isSnapshotQuery: true, intent, error: error.message, dataFreshness: 'error' };
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
- When discussing deal velocity or stage duration, use neutral factual language like "X days in current stage" — NEVER use "stuck", "stale", "stalled", or "concerning" to describe deal progress
- This is an objective tool — avoid language that could feel judgmental or emotional about a rep's performance

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
  e) Good examples (use ACTUAL names from your answer, not placeholders):
     - "When does the Coherent contract expire?"
     - "What stage is the Intuit opportunity in?"
     - "Which deals close this month?"
     - "What's the pipeline breakdown by product?"
     - "When did we last meet with [actual account from your answer]?"
     - "How should Eudia approach [actual account name]?"
     Every follow-up MUST be directly answerable from Salesforce opportunity, account, contact, event, or task data.
  f) Bad examples (NEVER suggest these patterns):
     - "What's Riley's prospecting strategy?" (strategy = unanswerable)
     - "What are the key negotiation points?" (internal plans = unanswerable)
     - "What feedback has [contact name] given?" (no feedback data)
     - "What is the competitive positioning?" (no competitive intel data)
     - "Who owns the most accounts?" (cross-rep aggregation = unanswerable from single query)
     - "How many customers does each rep manage?" (cross-rep comparison = unanswerable)
     - "Which rep has the largest pipeline?" (cross-rep comparison = unanswerable)
     - "How is [name]'s pipeline performing?" (subjective/judgmental framing)
     - "How is your late stage performing?" (subjective/judgmental)
     - "Which [name] contacts have the most LinkedIn activity?" (no LinkedIn data)
  g) Vary your suggestions — if you discussed contacts, suggest a deal or timeline question. If you discussed deals, suggest a stakeholder or activity question.
  h) If there is genuinely nothing useful to drill into, omit the follow-up section entirely.
  i) Keep each suggestion under 10 words.
  j) NEVER add department or team names — just use the company name.
  k) NEVER suggest cross-rep comparison or org-wide aggregation questions. These require data across all users which is not in your context.
  l) Prefer deal-specific or account-specific follow-ups over broad questions. Use real account names, deal names, and dollar amounts from your answer.`;

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
- If the user asks "what's the latest?" and there is no activity, say "No recorded activity for this account." Do not fabricate engagement history.

FOLLOW-UP SUGGESTIONS FOR COLD ACCOUNTS (STRICT):
- NEVER suggest "[BL name]'s prospecting strategy for [Account]" — you have no access to anyone's strategy.
- NEVER suggest LinkedIn activity questions — you have no LinkedIn data.
- NEVER add department or team names (e.g., "legal innovation team") — just use the company name.
- Keep each suggestion to 8 words max.
- Good cold-account follow-ups (use actual account/contact names):
  "How should Eudia approach [Account]?"
  "Who are the key contacts at [Account]?"
  "What industry peers of [Account] are Eudia customers?"
- These are answerable from the data you have (contacts, industry, Eudia product context).`;
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
      return basePrompt + `\n\nFOCUS: Business Lead account ownership and AI-Enabled pipeline. Present as:
1. Summary: "[Name] owns [X] accounts ([Y] with active pipeline)"
2. AI-Enabled Commit & Weighted totals (if provided): "**AI-Enabled Net ACV — Commit: $X.Xm | Weighted: $X.Xm**"
3. Top deals by commit (if provided): ranked list showing the top deals contributing to commit — "1. **Account** — $ACV commit | Stage | Product"
4. Full active pipeline deals listed by ACV: "1. **Account** — $ACV | Stage | Product"
5. Account list grouped by type (customer, pipeline, prospect)
Always show product line for each deal when available. Use a clean list format.`;

    case 'MEETING_ACTIVITY':
      return basePrompt + `\n\nFOCUS: Meeting activity. Present as a compact timeline:
1. Summary: "[X] meetings with [Y] accounts this week"
2. Timeline list: "- **Mon Feb 17** — Account Name: Meeting Subject [Owner]"
Group by day.

FOLLOW-UP RULES FOR MEETING QUERIES:
- NEVER suggest "What is the agenda for [meeting]?" — you have no access to meeting agendas.
- NEVER suggest "What time is [meeting]?" — you have no access to exact meeting times.
- Good follow-ups: "What's the latest with [Account from meeting list]?" or "What stage is [Account]'s deal in?"
- Suggest follow-ups about specific accounts from the meeting list, not about the meetings themselves.`;

    case 'CUSTOMER_COUNT':
      return basePrompt + `\n\nFOCUS: Customer/logo count. Present as:
1. Total count prominently: "**[X] total customers**"
2. Breakdown by type (Revenue, LOI, Pilot, etc.) with count per category
3. If listing accounts, use compact format: "- Account Name (Owner)"
Be precise with the count.

FOLLOW-UP RULES FOR CUSTOMER QUERIES:
- NEVER suggest "Which customers have the largest contract values?" — you don't have contract value data in this context.
- NEVER suggest "How many customers does each rep manage?" — cross-rep comparison is unanswerable.
- NEVER suggest "Who owns the most accounts?" — cross-rep aggregation is unanswerable.
- Good follow-ups: "What accounts does [BL name] own?" or "Which of these customers have active pipeline?" or "Which customers are in [industry]?"
- Use actual BL names and account names from the data provided.`;

    case 'CONTACT_SEARCH':
      return basePrompt + `\n\nFOCUS: Contact search results. Present as:
1. Summary: "[X] contacts matching criteria"
2. Compact list: "- **Name** — Title | Account (Owner) | City, State"
3. Group by city/region if location was part of the search
Include email when available.`;

    case 'POSITIONING':
      return basePrompt + `\n\nFOCUS: Eudia positioning and approach recommendation for this account.

EUDIA PRODUCT SUITE (use this for recommendations):
- **AI-Augmented Contracting** (Managed Services or In-House Technology): High-volume contract review, clause extraction, risk analysis. Best for legal teams drowning in contract volume. Flagship product.
- **AI-Augmented M&A** (Managed Services): Due diligence acceleration, deal room analysis. Best for companies with active M&A programs.
- **AI-Augmented Compliance** (In-House Technology): Regulatory compliance monitoring, policy analysis. Best for heavily regulated industries (financial services, insurance, pharma).
- **AI Platform - Sigma**: Enterprise AI platform for legal workflows. Custom AI model training on company data.
- **AI Platform - Insights**: Analytics and reporting across legal operations. Best for legal ops leaders who need visibility.
- **AI Platform - Litigation**: Litigation support and case analysis. Best for companies with significant litigation exposure.
- **FDE - Custom AI Solution**: Bespoke AI engineering for unique legal workflows.

INDUSTRY FIT (Tier 1 = highest fit):
- Tier 1: Financial Services, Insurance, Pharma/Life Sciences
- Tier 2: Technology, Healthcare, Energy, Industrial/Manufacturing
- Tier 3: Food & Beverage, Automotive, Retail, Media/Entertainment

POSITIONING RULES:
1. Based on the account's industry, size, and any known contacts, recommend 1-2 Eudia products that best fit
2. Explain WHY in 1-2 sentences referencing the account's likely pain points
3. If contacts are available, identify the most likely champion persona (GC, CLO, VP Legal, Legal Ops Director)
4. Mention similar industry customers if you know them from the data
5. Keep total response under 150 words — this is a quick positioning brief, not a full proposal
6. Do NOT fabricate account-specific details — only use what's in the data provided
7. Do NOT reference specific team or department names (e.g., "legal innovation team") unless explicitly present in the Salesforce contact data. Use just the company name.`;

    case 'FORECAST':
      return basePrompt + `\n\nFOCUS: Q1 FY26 AI-Enabled Forecast. IMPORTANT: These numbers reflect AI-Enabled pipeline only (Eudia_Tech__c = true), Net ACV, with Target Sign Date within Q1.

Start your response with: "**Q1 FY26 AI-Enabled Forecast**" as the header.

Present as:
1. Key metrics on one line: "**Commit (Net): $X.Xm** | **Weighted (Net): $X.Xm** | **Midpoint: $X.Xm**"
2. Below metrics, note: "_AI-Enabled deals only. Net ACV (new business at full ACV, renewals at net change). Target sign date <= Q1 end._"
3. Deal count and targeting window
4. BY BUSINESS LEAD: For each BL, show their commit amount and their top 2-3 deals (account name, ACV, stage). Use actual BL names — never show "Unassigned" for real business leads.
5. Format: "**BL Name** — $Xm commit | Top: Account ($ACV, Stage), Account ($ACV, Stage)"

FOLLOW-UP RULES FOR FORECAST:
- Suggest "Which deals are targeting to close this quarter?" (not "closing this quarter")
- Suggest "What's the stage breakdown for Q1 pipeline?" or "What's [BL name]'s pipeline?"
- NEVER suggest "Which deals close this quarter?" — use "targeting" language instead.`;

    case 'WEIGHTED_PIPELINE':
      return basePrompt + `\n\nFOCUS: Weighted pipeline analysis. Present as:
1. Summary: "**$X.XM gross** | **$X.XM weighted** across X deals"
2. Table by stage: Stage | Deals | Gross ACV | Weighted ACV
3. Highlight the concentration (which stages have the most value)

FOLLOW-UP RULES:
- Suggest "What deals are targeting to close this quarter?" or "What's the forecast?"
- Suggest a stage-specific question like "What deals are in Stage 5?" using actual stages from the data.`;

    case 'DEALS_SIGNED':
      return basePrompt + `\n\nFOCUS: Signed/closed-won deals. Present as:
1. Total signed revenue QTD prominently
2. List of recent deals: "1. **Account** — $ACV | Type | Close Date"
3. If last week data available, call it out separately

FOLLOW-UP RULES:
- Suggest "What deals are targeting to close this quarter?" or "What's the latest with [account from list]?"
- Use actual account names from the signed deals list.`;

    case 'DEALS_TARGETING':
      return basePrompt + `\n\nFOCUS: Deals targeting close. Present as:
1. Count and total ACV prominently
2. Ranked list: "1. **Account** — $ACV | Stage | Target Date | Product"
3. Sorted by ACV descending

FOLLOW-UP RULES:
- Suggest "What's the latest with [top account from list]?" using a real account name
- Or "What's the stage breakdown for Q1 pipeline?"`;

    case 'PIPELINE_BY_PRODUCT':
      return basePrompt + `\n\nFOCUS: Pipeline by product/solution. Present as a table:
Product | ACV | Deals | AI-Enabled
Include Mix % if available. Total row at bottom.

FOLLOW-UP RULES:
- Suggest "What deals are targeting [specific product from table]?" using actual product names.
- Or "What's the forecast?"`;

    case 'PIPELINE_BY_SALES_TYPE':
      return basePrompt + `\n\nFOCUS: Pipeline by sales type. Present as a table:
Sales Type | ACV | Count
Categories: New Business, Expansion, Renewal.

FOLLOW-UP RULES:
- Suggest "What deals are targeting to close this quarter?" or "What's the pipeline by product?"`;

    case 'LOI_DEALS':
      return basePrompt + `\n\nFOCUS: LOI (Commitment) deals. Present as ranked list:
"1. **Account** — $ACV | Owner | Close Date"
Include total count and total ACV.

FOLLOW-UP RULES:
- Suggest "What's the latest with [account from LOI list]?" using a real account name.`;

    case 'DEALS_CLOSED':
      return basePrompt + `\n\nFOCUS: Closed deals. Present as ranked list:
"1. **Account** — $ACV | Owner | Close Date | Product"
Include total count, total net ACV. If Revenue_Type__c is available, show the split between recurring and commitment/project deals.

FOLLOW-UP RULES:
- Suggest "What deals are targeting to close this quarter?" or "What's the latest with [account from list]?"`;

    case 'SLOW_DEALS':
      return basePrompt + `\n\nFOCUS: Deals with extended stage duration. Present as:
1. Count of deals in current stage for 30+ days
2. Ranked by days in stage: "1. **Account** — Stage | XX days in stage | $ACV | Owner"
Note the highest-ACV deals with the longest stage duration first.
LANGUAGE: Use "X days in current stage" — NEVER use "stuck", "stale", "stalled", or "concerning". Keep the tone neutral and factual.

FOLLOW-UP RULES:
- Suggest "What's the latest with [highest-ACV account from the list]?" using a real account name.
- Or "What deals are targeting to close this quarter?"`;

    case 'PIPELINE_ADDED':
      return basePrompt + `\n\nFOCUS: New pipeline this week. Present as:
1. Count and total ACV
2. List: "1. **Account** — $ACV | Stage | Owner | Product"
3. Group by day if dates vary

FOLLOW-UP RULES:
- Suggest "What's the latest with [account from new pipeline]?" using a real account name.
- Or "What's the total active pipeline?"`;

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
    if (context.error) {
      prompt += `SALESFORCE DATA UNAVAILABLE: ${context.error}\n`;
      prompt += `The Salesforce connection may be temporarily unavailable. Inform the user that pipeline data could not be loaded and suggest they try again in a moment.\n`;
      return prompt;
    }
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
          if (opp.productLine) prompt += ` | ${cleanProductLine(opp.productLine)}`;
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
    prompt += `• Open Opportunities: ${context.oppCount} (${formatAcv(context.totalAcv)} ACV)\n`;
    if (context.totalCommitNet > 0 || context.totalWeightedAI > 0) {
      prompt += `• AI-Enabled Net ACV — Commit: ${formatAcv(context.totalCommitNet)} | Weighted: ${formatAcv(context.totalWeightedAI)}\n`;
    }
    prompt += '\n';

    if (context.topByCommit?.length > 0) {
      prompt += `TOP DEALS BY COMMIT (AI-Enabled, Net ACV within Q1):\n`;
      for (const opp of context.topByCommit) {
        prompt += `• ${opp.account || opp.name} — ${formatAcv(opp.commitNet)} commit | ${opp.stage}`;
        if (opp.product) prompt += ` | ${opp.product}`;
        prompt += '\n';
      }
      prompt += '\n';
    }

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
        prompt += `• ${opp.name} (${opp.account}) - ${opp.stage} - ${formatAcv(opp.acv)}`;
        if (opp.product) prompt += ` | ${opp.product}`;
        if (opp.closeDate) prompt += ` - Close: ${opp.closeDate}`;
        prompt += '\n';
      }
    }

    if (context.recentActivity?.length > 0) {
      prompt += `\nTHIS WEEK'S ENGAGEMENT (${context.recentActivity.length} meetings):\n`;
      for (const m of context.recentActivity) {
        const dateStr = m.date ? new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        prompt += `• ${dateStr}: ${m.subject || 'Meeting'} — ${m.account}\n`;
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

  // Handle cross-account snapshot queries — unified prompt from direct SOQL results
  if (context.isSnapshotQuery) {
    if (context.error) {
      prompt += `SALESFORCE DATA UNAVAILABLE: ${context.error}\n`;
      prompt += `The Salesforce connection could not be established. Inform the user that this data could not be loaded right now and suggest they try again in a moment. Do NOT report "$0" or "0 deals" — instead say the data is temporarily unavailable.\n`;
      return prompt;
    }
    prompt += `${(context.label || context.intent).toUpperCase()} (${context.records?.length || 0} records):\n\n`;
    const recs = context.records || [];
    const meta = context.metadata || {};

    if (context.intent === 'FORECAST') {
      prompt += `• Commit (Net): ${formatAcv(meta.commitNet)}\n`;
      prompt += `• Weighted (Net): ${formatAcv(meta.weightedNet)}\n`;
      prompt += `• Midpoint: ${formatAcv(meta.midpoint)}\n`;
      prompt += `• Deal Count: ${meta.dealCount || 0}\n`;
      if (meta.blCommits?.length > 0) {
        prompt += `\nBY BUSINESS LEAD:\n`;
        for (const bl of meta.blCommits) {
          const displayName = maskOwnerIfUnassigned(bl.name);
          prompt += `  • ${displayName}: ${formatAcv(bl.commit)} commit`;
          const topOpps = meta.blTopOpps?.[bl.name];
          if (topOpps?.length > 0) {
            const oppStr = topOpps.map(o => `${o.account} (${formatAcv(o.acv)}, ${(o.stage || '').replace('Stage ', 'S')})`).join(', ');
            prompt += ` | Top: ${oppStr}`;
          }
          prompt += '\n';
        }
      }
    } else if (context.intent === 'WEIGHTED_PIPELINE') {
      let totalGross = 0, totalWeighted = 0, totalDeals = 0;
      for (const row of recs) {
        totalGross += row.grossAcv || 0;
        totalWeighted += row.weightedAcv || 0;
        totalDeals += row.cnt || 0;
        prompt += `  • ${row.StageName}: ${row.cnt} deals | Gross ${formatAcv(row.grossAcv)} | Weighted ${formatAcv(row.weightedAcv)}\n`;
      }
      prompt += `\nTOTAL: ${totalDeals} deals | Gross ${formatAcv(totalGross)} | Weighted ${formatAcv(totalWeighted)}\n`;
    } else if (context.intent === 'PIPELINE_BY_PRODUCT') {
      for (const row of recs) {
        prompt += `  • ${cleanProductLine(row.Product_Line__c) || 'Undetermined'}: ${formatAcv(row.totalAcv)} | ${row.cnt || 0} deals\n`;
      }
    } else if (context.intent === 'PIPELINE_BY_SALES_TYPE') {
      for (const row of recs) {
        prompt += `  • ${row.Sales_Type__c || 'Unknown'}: ${formatAcv(row.totalAcv)} | ${row.cnt || 0} deals\n`;
      }
    } else if (context.intent === 'PIPELINE_OVERVIEW' && meta.isAverageQuery) {
      prompt += `AVERAGE DEAL SIZE BY STAGE:\n`;
      prompt += `• Overall: ${meta.grandCount} deals | ${formatAcv(meta.grandTotal)} total | ${formatAcv(meta.grandAvg)} avg\n\n`;
      for (const s of (meta.avgByStage || [])) {
        prompt += `  • ${s.stage}: ${s.count} deals | ${formatAcv(s.totalAcv)} total | ${formatAcv(s.avgAcv)} avg\n`;
      }
    } else if (context.intent === 'PIPELINE_OVERVIEW') {
      prompt += `• Total: ${meta.totalDeals || recs.length} deals | ${formatAcv(meta.totalAcv)} total ACV\n`;
      if (meta.byStage) {
        prompt += '\nBY STAGE:\n';
        for (const [stage, cnt] of Object.entries(meta.byStage)) { prompt += `  • ${stage}: ${cnt} deals\n`; }
      }
      prompt += '\nDEAL LIST:\n';
      for (const r of recs.slice(0, 30)) {
        const acctName = r.Account?.Account_Display_Name__c || r.Account?.Name || 'Unknown';
        const acv = r.ACV__c ? formatAcv(r.ACV__c) : '';
        const owner = maskOwnerIfUnassigned(r.Owner?.Name);
        const product = r.Product_Line__c ? ` | ${cleanProductLine(r.Product_Line__c)}` : '';
        prompt += `  • ${acctName} — ${acv} | ${r.StageName || ''} | ${owner} | Target: ${r.Target_LOI_Date__c || 'N/A'}${product}\n`;
      }
      if (recs.length > 30) prompt += `  ... and ${recs.length - 30} more\n`;
    } else if (context.intent === 'DEALS_CLOSED') {
      prompt += `• Total Closed: ${meta.dealCount || recs.length} deals\n`;
      prompt += `• Net ACV: ${formatAcv(meta.totalNetAcv)}\n`;
      if (meta.totalAiEnabled > 0) prompt += `• AI-Enabled Weighted: ${formatAcv(meta.totalAiEnabled)}\n`;
      prompt += '\nDEAL LIST:\n';
      for (const r of recs.slice(0, 20)) {
        const acctName = r.Account?.Account_Display_Name__c || r.Account?.Name || r.Name || 'Unknown';
        const acv = r.ACV__c ? formatAcv(r.ACV__c) : '';
        const owner = maskOwnerIfUnassigned(r.Owner?.Name);
        const date = r.CloseDate || '';
        const product = cleanProductLine(r.Product_Line__c);
        const revenue = r.Revenue_Type__c || '';
        const parts = [acctName, acv, owner, date, product, revenue].filter(Boolean);
        prompt += `  • ${parts.join(' | ')}\n`;
      }
      if (recs.length > 20) prompt += `  ... and ${recs.length - 20} more\n`;
    } else if (context.intent === 'SLOW_DEALS') {
      prompt += `PIPELINE VELOCITY SUMMARY:\n`;
      prompt += `• Total active deals: ${meta.totalDeals}\n`;
      prompt += `• Average days in current stage: ${meta.avgDays}\n\n`;
      prompt += `DISTRIBUTION:\n`;
      for (const [bucket, count] of Object.entries(meta.buckets || {})) {
        prompt += `  • ${bucket}: ${count} deals\n`;
      }
      if (recs.length > 0) {
        prompt += `\nDEALS WITH EXTENDED STAGE DURATION (30+ days):\n`;
        for (const r of recs.slice(0, 20)) {
          const acctName = r.Account?.Account_Display_Name__c || r.Account?.Name || 'Unknown';
          const acv = r.ACV__c ? formatAcv(r.ACV__c) : '';
          const owner = maskOwnerIfUnassigned(r.Owner?.Name);
          const days = r.Days_in_Stage__c || 0;
          prompt += `  • ${acctName} — ${acv} | ${r.StageName} | ${days} days in stage | ${owner}\n`;
        }
      }
    } else {
      // Generic deal list format (DEALS_SIGNED, DEALS_TARGETING, LOI_DEALS, PIPELINE_ADDED)
      for (const r of recs.slice(0, 20)) {
        const acctName = r.Account?.Account_Display_Name__c || r.Account?.Name || r.Name || 'Unknown';
        const acv = r.ACV__c ? formatAcv(r.ACV__c) : '';
        const stage = r.StageName || '';
        const owner = maskOwnerIfUnassigned(r.Owner?.Name);
        const date = r.Target_LOI_Date__c || r.CloseDate || r.CreatedDate?.split('T')[0] || '';
        const days = r.Days_in_Stage__c ? `${r.Days_in_Stage__c}d in stage` : '';
        const product = cleanProductLine(r.Product_Line__c);
        const revenue = r.Revenue_Type__c || '';
        const parts = [acctName, acv, stage, owner, date, days, product, revenue].filter(Boolean);
        prompt += `  • ${parts.join(' | ')}\n`;
      }
      if (recs.length > 20) prompt += `  ... and ${recs.length - 20} more\n`;
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
