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

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE - Ephemeral, no customer data persisted to disk
// Replaces SQLite storage for compliance - data fetched from Salesforce
// ═══════════════════════════════════════════════════════════════════════════
const accountContextCache = new Map();
const MEMORY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  PIPELINE_OVERVIEW: ['my pipeline', 'my deals', 'my accounts', 'late stage', 'forecast'],
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
async function processQuery({ query, accountId, accountName, userEmail }) {
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
    // Classify the query intent
    const intent = classifyQueryIntent(query);
    logger.info(`[Intelligence] Query intent: ${intent}`, { query: query.substring(0, 50) });

    // Gather context based on intent
    const context = await gatherContext({
      intent,
      query,
      accountId,
      accountName,
      userEmail
    });

    // Build the optimized prompt
    const { systemPrompt, userPrompt } = buildPrompt({
      intent,
      query,
      context
    });

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const answer = response.content[0]?.text || 'Unable to generate response.';
    const duration = Date.now() - startTime;

    logger.info(`[Intelligence] Query completed in ${duration}ms`, {
      intent,
      accountName: context.account?.name,
      tokensUsed: response.usage?.output_tokens
    });

    return {
      success: true,
      query,
      answer,
      intent,
      context: {
        accountName: context.account?.name,
        accountId: context.account?.id,
        opportunityCount: context.opportunities?.length || 0,
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
 * Classify the query intent to determine what data to fetch
 */
function classifyQueryIntent(query) {
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
async function gatherContext({ intent, query, accountId, accountName, userEmail }) {
  const context = {
    account: null,
    opportunities: [],
    contacts: [],
    recentTasks: [],
    recentEvents: [],
    customerBrain: null,
    obsidianNotes: [],
    slackIntel: [],
    upcomingMeeting: null,
    dataFreshness: 'live'
  };

  // Check IN-MEMORY cache first (ephemeral, no disk persistence)
  // This replaces Redis/SQLite cache for compliance
  if (accountId) {
    const memoryCached = getMemoryCachedContext(accountId);
    if (memoryCached) {
      return { ...memoryCached, dataFreshness: 'cached' };
    }
  }

  // Handle pipeline/cross-account queries
  if (intent === 'PIPELINE_OVERVIEW' && userEmail) {
    return await gatherPipelineContext(userEmail);
  }

  // Handle account lookup queries
  if (intent === 'ACCOUNT_LOOKUP') {
    return await gatherAccountLookupContext(query);
  }

  // For account-specific queries, we need an account
  if (!accountId && accountName) {
    // Try to find account by name
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
    // No account context - return minimal context
    logger.warn(`[Intelligence] No accountId available - returning minimal context for query`);
    return context;
  }

  // Fetch all data in parallel from SALESFORCE ONLY (no SQLite)
  // This ensures customer data resides only in Salesforce per compliance requirements
  const [
    accountData,
    opportunities,
    contacts,
    tasks,
    events
  ] = await Promise.all([
    getAccountDetails(accountId),
    getOpportunities(accountId),
    getContacts(accountId),
    getRecentTasks(accountId),
    getRecentEvents(accountId)
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
  
  // Log data summary for debugging
  logger.info(`[Intelligence] Context summary for ${context.account?.name || accountId}: ` +
    `${context.opportunities.length} opps, ${context.contacts.length} contacts, ` +
    `${context.recentTasks.length} tasks, ${context.recentEvents.length} events, ` +
    `${context.meetingNotes.length} meeting notes, customerBrain: ${context.customerBrain ? 'yes' : 'no'}`);

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
             Product_Line__c, Owner.Name, NextStep, Probability, Days_in_Stage__c,
             Revenue_Type__c, Type, IsClosed, IsWon, LastActivityDate
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
      owner: opp.Owner?.Name,
      nextStep: opp.NextStep,
      probability: opp.Probability,
      daysInStage: opp.Days_in_Stage__c,
      revenueType: opp.Revenue_Type__c,
      type: opp.Type,
      isClosed: opp.IsClosed,
      isWon: opp.IsWon,
      lastActivity: opp.LastActivityDate
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
 * Find account by name (for account lookup queries)
 */
async function findAccountByName(accountName) {
  try {
    const safeName = accountName.replace(/'/g, "\\'");
    const result = await sfQuery(`
      SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, Industry
      FROM Account
      WHERE Name LIKE '%${safeName}%'
      ORDER BY LastActivityDate DESC
      LIMIT 1
    `, true);

    return result?.records?.[0] || null;
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
    // Get user's opportunities
    const result = await sfQuery(`
      SELECT Id, Name, AccountId, Account.Name, StageName, ACV__c, 
             CloseDate, Target_LOI_Date__c, Product_Line__c, NextStep
      FROM Opportunity
      WHERE Owner.Email = '${userEmail}'
        AND IsClosed = false
      ORDER BY CloseDate ASC
    `, true);

    const opportunities = result?.records || [];
    
    // Group by stage
    const byStage = {};
    let totalAcv = 0;
    
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
        nextStep: opp.NextStep
      });
      totalAcv += opp.ACV__c || 0;
    }

    return {
      isPipelineQuery: true,
      userEmail,
      totalOpportunities: opportunities.length,
      totalAcv,
      byStage,
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
 * Build optimized prompts based on query intent and context
 */
function buildPrompt({ intent, query, context }) {
  const systemPrompt = buildSystemPrompt(intent, context);
  const userPrompt = buildUserPrompt(intent, query, context);
  
  return { systemPrompt, userPrompt };
}

/**
 * Build the system prompt for Claude
 */
function buildSystemPrompt(intent, context) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const basePrompt = `TODAY'S DATE: ${today}

You are gtm-brain, an AI sales intelligence assistant for Eudia, a legal AI company.
Your role is to help Business Leads prepare for meetings, track deals, and understand their accounts.

RESPONSE GUIDELINES:
- Be concise and actionable - sales reps are busy
- Lead with the most important insight
- Use bullet points for scanability
- Include specific names, dates, and dollar amounts when available
- End with a clear recommended next step when applicable
- If data is missing, acknowledge it briefly and work with what's available
- Never fabricate information - only use the data provided

DATE ACCURACY (CRITICAL):
- Today is ${today}. All relative date references MUST be calculated from this date.
- Use absolute dates (e.g., "Feb 25") instead of relative terms like "yesterday" or "recently"
- NEVER say "yesterday" unless the event literally occurred the calendar day before today
- NEVER say "just met" or "recent meeting" if the meeting was more than 7 days ago
- Calculate time gaps accurately: if a meeting was on Jan 15 and today is Feb 6, that is 22 days ago, not "recent"

OBJECTIVITY (CRITICAL):
- Be factual and objective. Report what the data shows, not what you infer.
- Do NOT editorialize deal health or sentiment unless directly supported by explicit quotes or data
- Avoid phrases like "progressing well", "strong momentum", "healthy engagement" unless directly stated in source data
- Do NOT add "Recommended Next Steps" unless the user specifically asks for recommendations
- Summarize what happened, who was involved, and what was discussed - let the reader draw conclusions

FORMATTING RULES:
- NEVER use emojis - use text labels only (no icons, symbols, or emoji characters)
- Use **bold** for key metrics and names
- Use single bullet points for lists (no double-spacing between items)
- Use only ## for section headers (two hashes, not three)
- Keep each section compact with no extra blank lines between bullets
- Keep responses under 300 words unless the query requires more detail
- NEVER repeat the same information in multiple sections. Each fact appears exactly once.
- Do NOT create empty sections. If no data exists for a section, omit it entirely.

STALE DEAL DEFINITIONS:
- A deal is "stale" only if there has been NO activity for 30+ days
- A deal is "stuck" only if it has been in the same stage for 60+ days
- Do NOT flag deals as stale or stuck if they do not meet these thresholds
- 2-14 days since last activity is NORMAL and should not be flagged as concerning

ACTIVITY HEALTH & URGENCY FRAMING (CRITICAL):
- NEVER describe a deal as "critical", "urgent", or "needs immediate action" if there was recent activity (within 7 days)
- If a meeting occurred within the last 7 days, the deal is HEALTHY - frame positively
- If a meeting occurred within the last 14 days, frame as "recently engaged" - not urgent
- Only use urgent/critical language if: (a) deal has been stale 30+ days, OR (b) close date is within 14 days and there are clear blockers
- When asked "what should I know going into a meeting", do NOT manufacture urgency - summarize factually
- Avoid contradictory framing like "critical deal" immediately after mentioning a recent meeting
- Frame objectively based on actual data, not dramatic language that doesn't match reality`;

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

  // Handle pipeline queries
  if (context.isPipelineQuery) {
    prompt += `PIPELINE DATA:\n`;
    prompt += `• Total Open Opportunities: ${context.totalOpportunities}\n`;
    prompt += `• Total Pipeline ACV: $${(context.totalAcv || 0).toLocaleString()}\n\n`;
    
    if (context.byStage) {
      prompt += `BY STAGE:\n`;
      for (const [stage, data] of Object.entries(context.byStage)) {
        prompt += `\n${stage} (${data.count} opps, $${data.totalAcv.toLocaleString()}):\n`;
        for (const opp of data.opps.slice(0, 5)) {
          prompt += `  • ${opp.name} (${opp.account}) - $${(opp.acv || 0).toLocaleString()}`;
          if (opp.closeDate) prompt += ` - Close: ${opp.closeDate}`;
          prompt += '\n';
        }
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
    await cache.del(`intel_context:${accountId}`);
    logger.debug(`[Intelligence] Cache invalidated for account ${accountId}`);
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
  // Expose for testing
  gatherContext,
  buildPrompt
};
