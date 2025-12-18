const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { parseIntent } = require('../ai/intentParser');
const { getContext, updateContext, generateSuggestions } = require('../ai/contextManager');
const { queryBuilder } = require('../salesforce/queries');
const { query } = require('../salesforce/connection');
const { formatResponse } = require('./responseFormatter');
const { optimizeQuery, trackQueryPerformance } = require('../ai/queryOptimizer');
const { processFeedback, isFeedbackMessage } = require('../ai/feedbackLearning');
const { cleanStageName } = require('../utils/formatters');
const { processContractUpload, handleContractCreationConfirmation, handleContractActivation, handleAccountCorrection } = require('../services/contractCreation');

/**
 * Register Slack event handlers
 */
function registerEventHandlers(app) {
  
  // Handle direct mentions (@gtmbrain)
  app.event('app_mention', async ({ event, client, context }) => {
    try {
      await handleMention(event, client, context);
    } catch (error) {
      logger.error('Error handling app mention:', error);
      await client.chat.postMessage({
        channel: event.channel,
        text: '🤖 Sorry, I encountered an error processing your request. Please try again or contact support.',
        thread_ts: event.ts
      });
    }
  });

  // Handle direct messages
  app.event('message', async ({ event, client, context }) => {
    // Skip bot messages and messages in channels (handled by app_mention)
    if (event.subtype === 'bot_message' || event.channel_type !== 'im') {
      return;
    }

    try {
      await handleDirectMessage(event, client, context);
    } catch (error) {
      logger.error('Error handling direct message:', error);
      await client.chat.postMessage({
        channel: event.channel,
        text: '🤖 Sorry, I encountered an error. Please try again or use `/pipeline help` for assistance.'
      });
    }
  });

  // Handle message reactions for feedback
  app.event('reaction_added', async ({ event, client }) => {
    try {
      await handleReactionFeedback(event, client);
    } catch (error) {
      logger.error('Error handling reaction:', error);
    }
  });

  logger.info('✅ Event handlers registered');
}

/**
 * Handle app mentions in channels
 */
async function handleMention(event, client, context) {
  const userId = event.user;
  const channelId = event.channel;
  const text = event.text;
  
  // Log interaction
  logger.slackInteraction('mention', userId, channelId, text);

  // Check rate limiting - More generous for exploration
  const rateLimit = await cache.checkRateLimit(userId, 'mention');
  if (!rateLimit.allowed) {
    await client.chat.postMessage({
      channel: channelId,
      text: `⏱️ Hold on! You've been exploring a lot. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds before your next query. 🧠`,
      thread_ts: event.ts
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT PDF FILE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════
  if (event.files && event.files.length > 0) {
    const pdfFiles = event.files.filter(f => 
      f.mimetype?.includes('pdf') || f.name?.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length > 0) {
      logger.info(`📄 Contract PDF uploaded by ${userId}: ${pdfFiles[0].name}`);
      await processContractUpload(pdfFiles[0], client, userId, channelId, event.ts);
      return;
    }
  }

  // Remove the bot mention from the text
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();
  
  if (!cleanText) {
    await client.chat.postMessage({
      channel: channelId,
      text: `👋 Hi! I'm your GTM Intelligence Assistant. Ask me about your pipeline, deals, forecasts, or anything sales-related!\n\nTry: "show me my pipeline" or "what closed this week?"`,
      thread_ts: event.ts
    });
    return;
  }

  await processQuery(cleanText, userId, channelId, client, event.ts);
}

/**
 * Handle direct messages
 */
async function handleDirectMessage(event, client, context) {
  const userId = event.user;
  const channelId = event.channel;
  const text = event.text || '';

  // Check rate limiting - More generous for exploration
  const rateLimit = await cache.checkRateLimit(userId, 'dm');
  if (!rateLimit.allowed) {
    await client.chat.postMessage({
      channel: channelId,
      text: `⏱️ You're really putting me to work! Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds before your next query. 🤖`
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT PDF FILE HANDLING (Direct Messages)
  // ═══════════════════════════════════════════════════════════════════════════
  if (event.files && event.files.length > 0) {
    const pdfFiles = event.files.filter(f => 
      f.mimetype?.includes('pdf') || f.name?.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length > 0) {
      logger.info(`📄 Contract PDF uploaded via DM by ${userId}: ${pdfFiles[0].name}`);
      await processContractUpload(pdfFiles[0], client, userId, channelId, event.ts);
      return;
    }
  }

  // Handle help commands
  if (text.toLowerCase().includes('help')) {
    await sendHelpMessage(client, channelId);
    return;
  }

  await processQuery(text, userId, channelId, client);
}

/**
 * Process a user query
 */
async function processQuery(text, userId, channelId, client, threadTs = null) {
  const startTime = Date.now();
  
  try {
    // Get conversation context
    const conversationContext = await getContext(userId, channelId);

    // Check if this is feedback on a previous query
    if (conversationContext && isFeedbackMessage(text, conversationContext)) {
      await processFeedback(
        text, 
        conversationContext.lastQuery?.originalMessage,
        conversationContext.lastQuery?.resultCount,
        userId, 
        client, 
        channelId, 
        threadTs
      );
      return; // Don't process as a new query
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCOUNT CORRECTION FOR CONTRACT ANALYSIS
    // Handles: "account: [Name]" to update missing account before contract creation
    // ═══════════════════════════════════════════════════════════════════════════
    const textLower = text.toLowerCase().trim();
    const accountCorrectionMatch = text.match(/^account\s*:\s*(.+)$/i);
    
    if (accountCorrectionMatch && accountCorrectionMatch[1]) {
      const accountName = accountCorrectionMatch[1].trim();
      const pendingAnalysis = await cache.get(`contract_analysis_${userId}_${channelId}`);
      
      if (pendingAnalysis) {
        logger.info(`📍 Processing account correction: "${accountName}" from ${userId}`);
        await handleAccountCorrection(accountName, userId, channelId, client, threadTs);
        return;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT CREATION CONFIRMATION HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    if (textLower.startsWith('create contract') || textLower === 'create' || 
        textLower.includes('create contract assign to')) {
      // Check if there's a pending contract analysis
      logger.info(`📝 Checking for pending contract analysis: contract_analysis_${userId}_${channelId}`);
      const pendingAnalysis = await cache.get(`contract_analysis_${userId}_${channelId}`);
      
      if (pendingAnalysis) {
        logger.info(`📝 Found pending analysis, processing contract creation from ${userId}`);
        // ALWAYS return after handling contract creation - even if it fails
        // This prevents fall-through to intent parsing
        await handleContractCreationConfirmation(text, userId, channelId, client, threadTs);
        return;
      } else {
        // No pending analysis - tell user to upload a contract first
        logger.info(`📝 No pending analysis found for ${userId}`);
        await client.chat.postMessage({
          channel: channelId,
          text: `❌ No pending contract analysis found.\n\nPlease upload a contract PDF first, then reply with \`create contract\` or \`create contract assign to [Name]\`.`,
          thread_ts: threadTs
        });
        return;
      }
    }
    
    // CONTRACT ACTIVATION HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    if (textLower === 'activate contract' || textLower === 'activate' || 
        textLower.includes('move to activated') || textLower.includes('set to activated')) {
      logger.info(`🔄 Processing contract activation request from ${userId}`);
      // ALWAYS return after handling - even if activation fails
      await handleContractActivation(userId, channelId, client, threadTs);
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HYPRNOTE SYNC COMMANDS
    // ═══════════════════════════════════════════════════════════════════════════
    if (textLower.startsWith('sync hyprnote') || textLower === 'sync meetings' || 
        textLower.includes('hyprnote sync')) {
      await handleHyprnoteSync(client, channelId, userId, threadTs);
      return;
    }
    
    if (textLower.startsWith('hyprnote status') || textLower === 'meeting sync status') {
      await handleHyprnoteSyncStatus(client, channelId, threadTs);
      return;
    }
    
    // Handle cancel for pending contract
    if (textLower === 'cancel' || textLower === 'no' || textLower === 'nevermind') {
      const pendingAnalysis = await cache.get(`contract_analysis_${userId}_${channelId}`);
      if (pendingAnalysis) {
        await cache.del(`contract_analysis_${userId}_${channelId}`);
        await client.chat.postMessage({
          channel: channelId,
          text: '✅ Contract creation cancelled.',
          thread_ts: threadTs
        });
        return;
      }
    }

    // Parse intent using AI first
    const parsedIntent = await parseIntent(text, conversationContext, userId);
    
    // Debug logging for intent and entities
    logger.info(`📊 Parsed Intent: ${parsedIntent.intent}`, {
      entities: parsedIntent.entities,
      confidence: parsedIntent.confidence,
      hasStages: !!parsedIntent.entities?.stages,
      stages: parsedIntent.entities?.stages
    });

    // Show typing indicator (only for complex queries)
    if (parsedIntent.intent !== 'greeting') {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Looking up your data...',
        thread_ts: threadTs
      });
    }

    // Handle different intent types
    if (parsedIntent.intent === 'greeting') {
      // Comprehensive instructive greeting
      const helpText = `Hello! I'm GTM-Wizard, your AI sales intelligence assistant with direct access to your Salesforce data.

*ACCOUNT INTELLIGENCE*
• "who owns Apple?" - Find account owner (business leads only)
• "who's the BL for Intel?" - Business lead lookup
• "which accounts have Ironclad?" - Competitive landscape search
• "who has Harvey in competitive landscape?" - Competitor intelligence
• "what's the legal team size at Best Buy?" - Legal department info
• "who are the decision makers at Microsoft?" - Key stakeholders
• "which accounts are discussing contracting?" - Use case analysis

*PIPELINE & DEALS*
• "show me my pipeline" - All active opportunities
• "early stage deals" - Stage 1 (Discovery)
• "mid stage pipeline" - Stage 2 (SQO) + Stage 3 (Pilot)
• "late stage opportunities" - Stage 4 (Proposal)
• "which opportunities are late stage contracting?" - Product line + stage
• "what accounts are in Stage 2?" - Account list by stage

*LOIs & ARR DEALS*
• "what LOIs have we signed in the last two weeks?" - Recent LOIs (Revenue_Type = Commitment)
• "how many LOIs this month?" - LOI count
• "show ARR deals" - Recurring revenue contracts (Revenue_Type = Recurring)
• "show me ARR deals" - Recurring revenue opportunities

*RECENT ACTIVITY*
• "what deals closed recently?" - Recent wins
• "what deals were added to pipeline this week?" - New opportunities
• "what closed this month?" - Monthly results

*PRODUCT LINES*
I can filter by: AI-Augmented Contracting, M&A, Compliance, Litigation

Ask me anything about your pipeline, accounts, or deals!`;
      
      await client.chat.postMessage({
        channel: channelId,
        text: helpText,
        thread_ts: threadTs,
        replace_original: true
      });
      return;
    }

    // Handle conversational queries
    if (parsedIntent.intent === 'conversation') {
      const conversationalResponse = await generateConversationalResponse(text, conversationContext);
      await client.chat.postMessage({
        channel: channelId,
        text: conversationalResponse,
        thread_ts: threadTs,
        replace_original: true
      });
      return;
    }

    // Check for non-existent product line before building query
    if (parsedIntent.entities.productLine === 'LITIGATION_NOT_EXIST') {
      const stageName = parsedIntent.entities.stages?.[0] || 'the pipeline';
      await client.chat.postMessage({
        channel: channelId,
        text: `No Litigation deals currently in ${stageName}.`,
        thread_ts: threadTs,
        replace_original: true
      });
      return;
    }

    // Build initial query
    let soql = null;
    if (parsedIntent.intent === 'account_lookup') {
      // Handle "who owns X" questions with smart matching
      if (parsedIntent.entities.accounts && parsedIntent.entities.accounts.length > 0) {
        let accountName = parsedIntent.entities.accounts[0];
        
        // Smart normalization for matching
        const normalizedSearch = accountName.trim();
        const withoutThe = normalizedSearch.replace(/^the\s+/i, '');
        
        // Escape single quotes for SOQL
        const escapeQuotes = (str) => str.replace(/'/g, "\\'");
        
        // Create variations for fuzzy matching
        const withHyphen = normalizedSearch.replace(/\s/g, '-'); // "T Mobile" → "T-Mobile"
        const withoutHyphen = normalizedSearch.replace(/-/g, ' '); // "T-Mobile" → "T Mobile"
        const withoutHyphenNoSpace = normalizedSearch.replace(/-/g, ''); // "T-Mobile" → "TMobile"
        const withAmpersand = normalizedSearch.replace(/\sand\s/gi, ' & '); // "Brown and Brown" → "Brown & Brown"
        const withoutAmpersand = normalizedSearch.replace(/\s&\s/g, ' and '); // "Brown & Brown" → "Brown and Brown"
        const withApostrophe = normalizedSearch.includes("'") ? normalizedSearch : normalizedSearch.replace(/([a-z])([A-Z])/g, "$1'$2"); // "OReilly" → "O'Reilly"
        const withoutApostrophe = normalizedSearch.replace(/'/g, ''); // "O'Reilly" → "OReilly"
        
        // Build comprehensive WHERE clause with escaped quotes
        const searchConditions = [
          `Name = '${escapeQuotes(normalizedSearch)}'`, // Exact match
          `Name = '${escapeQuotes(withoutThe)}'`, // Without "The"
          `Name = 'The ${escapeQuotes(withoutThe)}'`, // With "The"
          `Name = '${escapeQuotes(withHyphen)}'`, // With hyphen
          `Name = '${escapeQuotes(withoutHyphen)}'`, // Without hyphen
          `Name = '${escapeQuotes(withoutHyphenNoSpace)}'`, // No hyphen no space
          `Name = '${escapeQuotes(withAmpersand)}'`, // With &
          `Name = '${escapeQuotes(withoutAmpersand)}'`, // With "and"
          `Name = '${escapeQuotes(withApostrophe)}'`, // With apostrophe
          `Name = '${escapeQuotes(withoutApostrophe)}'`, // Without apostrophe
          `Name = '${escapeQuotes(normalizedSearch)} Corp'`,
          `Name = '${escapeQuotes(normalizedSearch)} Inc'`,
          `Name = '${escapeQuotes(normalizedSearch)} LLC'`,
          `Name = '${escapeQuotes(normalizedSearch)} Group'`,
          `Name LIKE '${escapeQuotes(normalizedSearch)}%'`, // Starts with
          `Name LIKE '%${escapeQuotes(normalizedSearch)}%'` // Contains
        ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
        
        // Smart query with fuzzy matching - include Account Plan and Customer Brain
        soql = `SELECT Id, Name, Owner.Name, Owner.Email, Industry, Prior_Account_Owner_Name__c, 
                       Account_Plan_s__c, Customer_Brain__c
                FROM Account 
                WHERE (${searchConditions.join(' OR ')})
                ORDER BY Name
                LIMIT 10`;
      } else {
        await client.chat.postMessage({
          channel: channelId,
          text: `Please specify which company you're asking about. For example: "who owns IBM?" or "who owns Microsoft?"`,
          thread_ts: threadTs,
          replace_original: true
        });
        return;
      }
    } else if (parsedIntent.intent === 'owner_accounts_list') {
      // Handle "[Name]'s accounts" type queries
      await handleOwnerAccountsList(parsedIntent.entities, userId, channelId, client, threadTs);
      return;
    } else if (parsedIntent.intent === 'account_stage_lookup') {
      // Handle "What accounts are in Stage 2?" - redirect to accounts handler (returns unique accounts)
      await handleAccountsByStage(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early - handled by dedicated function
    } else if (parsedIntent.intent === 'account_field_lookup') {
      // Handle advanced account field queries
      soql = buildAccountFieldQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'cross_query') {
      // Handle complex cross-object queries
      soql = buildCrossQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'count_query') {
      // Handle customer/contract counts
      soql = buildCountQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'average_days_query') {
      // Handle average days in stage
      soql = buildAverageDaysQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'weighted_summary') {
      // Handle weighted pipeline summary
      soql = buildWeightedSummaryQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'contract_query') {
      // Handle contract/PDF queries
      soql = buildContractQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'save_customer_note') {
      // Handle Customer_Brain note saving - pass full event context
      await handleCustomerBrainNote(text, userId, channelId, client, threadTs, conversationContext);
      return; // Exit early
    } else if (parsedIntent.intent === 'save_account_plan') {
      // Handle Account Plan saving - available to all users
      await handleAccountPlanSave(text, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'query_account_plan') {
      // Handle Account Plan query
      await handleAccountPlanQuery(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'unknown_query') {
      // Handle unknown queries with clarification
      await handleUnknownQuery(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'send_johnson_hana_excel') {
      // Handle Johnson Hana specific Excel report
      await handleJohnsonHanaExcelReport(userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'send_excel_report') {
      // Handle full active pipeline Excel report
      await handleFullPipelineExcelReport(userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'batch_move_to_nurture') {
      // Handle batch move to nurture (Keigan only)
      await handleBatchMoveToNurture(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'batch_reassign_accounts') {
      // Handle batch account reassignment (Keigan only)
      await handleBatchReassignAccounts(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'multi_batch_reassign_accounts') {
      // Handle multi-line batch reassignment (Keigan only)
      // Format: "Asad - Southwest, DHL, HSBC\nJustin - Home Depot, AES"
      await handleMultiBatchReassign(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'move_to_nurture') {
      // Handle move to nurture (Keigan only)
      await handleMoveToNurture(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'close_account_lost') {
      // Handle close account lost (Keigan only)
      await handleCloseAccountLost(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'account_existence_check') {
      // Handle account existence check
      await handleAccountExistenceCheck(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'create_account') {
      // Handle account creation with auto-assignment (Keigan only)
      await handleCreateAccount(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'reassign_account') {
      // Handle manual account reassignment (Keigan only)
      await handleReassignAccount(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'create_opportunity') {
      // Handle opportunity creation (Keigan only)
      await handleCreateOpportunity(text, parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'post_call_summary') {
      // Handle post-call summary structuring (BLs)
      await handlePostCallSummary(text, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'account_status_dashboard') {
      // Handle executive account status dashboard
      await handleAccountStatusDashboard(userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'pagination_next') {
      // Handle "show next 10" / "show more" follow-ups
      await handlePaginationNext(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'accounts_by_stage') {
      // Handle "what accounts are in Stage 2" - return unique accounts, not opps
      await handleAccountsByStage(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'accounts_by_owner') {
      // Handle "what accounts does Julie own" - return accounts, not deals
      await handleAccountsByOwner(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'customer_list') {
      // Handle "who are our current customers" query
      await handleCustomerListQuery(userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'logo_rights_list') {
      // Handle "which accounts have logo rights" query
      await handleLogoRightsQuery(userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'owner_pipeline') {
      // Handle owner-specific pipeline queries
      // If "my pipeline" (ownerIsSelf), get owner from Slack user
      // If "[Name]'s pipeline", use the parsed owner name
      if (parsedIntent.entities.ownerIsSelf) {
        const ownerName = await getOwnerNameFromSlackUser(userId, client);
        if (ownerName) {
          parsedIntent.entities.owners = [ownerName];
        }
      }
      // entities.owners should already be set from intentParser for "[Name]'s deals"
      soql = queryBuilder.buildOpportunityQuery({ ...parsedIntent.entities, isClosed: false });
    } else if (parsedIntent.intent === 'pipeline_added') {
      // Handle "what deals were added to pipeline this week"
      await handlePipelineAddedQuery(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early - handled by dedicated function
    } else if (parsedIntent.intent === 'weighted_pipeline' || parsedIntent.intent === 'weighted_summary') {
      // Handle "weighted pipeline" query
      await handleWeightedPipelineQuery(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'loi_deals' || parsedIntent.intent === 'loi_accounts' || parsedIntent.intent === 'loi_count') {
      // Handle "what LOIs have we signed" / "how many LOIs"
      await handleLOIQuery(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'arr_deals' || parsedIntent.intent === 'arr_contracts') {
      // Handle "show ARR deals" / "how many ARR contracts"
      await handleARRQuery(parsedIntent, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'pipeline_summary' || parsedIntent.intent === 'deal_lookup') {
      // All pipeline queries including stage-based (early/mid/late) use pipeline_summary intent
      // Stage filtering happens via entities.stages array
      soql = queryBuilder.buildOpportunityQuery(parsedIntent.entities);
    } else if (parsedIntent.intent === 'activity_check') {
      soql = queryBuilder.buildOpportunityQuery({
        ...parsedIntent.entities,
        isClosed: false
      });
    } else if (parsedIntent.intent === 'forecasting') {
      soql = queryBuilder.buildOpportunityQuery({
        ...parsedIntent.entities,
        isClosed: false,
        forecastCategory: parsedIntent.entities.forecastCategory || ['Best Case', 'Commit']
      });
    } else if (parsedIntent.intent === 'trend_analysis') {
      // Handle aggregation queries
      const entities = { ...parsedIntent.entities };
      if (!entities.metrics) {
        entities.metrics = ['count', 'sum_amount'];
      }
      soql = queryBuilder.buildOpportunityQuery(entities);
    }

    // Debug logging for SOQL generation
    if (soql) {
      logger.info(`🔍 FULL SOQL Query:`, { 
        intent: parsedIntent.intent,
        fullSOQL: soql, // Log ENTIRE query
        hasStageFilter: soql.includes('StageName IN'),
        hasIsClosed: soql.includes('IsClosed'),
        entities: JSON.stringify(parsedIntent.entities)
      });
    } else {
      logger.warn(`⚠️ No SOQL generated for intent: ${parsedIntent.intent}`, {
        entities: parsedIntent.entities
      });
    }

    // Execute query directly (skip optimization for now to avoid errors)
    const queryStartTime = Date.now();
    let queryResult = await query(soql, true); // Enable caching
    const queryExecutionTime = Date.now() - queryStartTime;
    
    // Log query results
    logger.info(`📈 Query Results:`, {
      intent: parsedIntent.intent,
      totalSize: queryResult?.totalSize || 0,
      recordsReturned: queryResult?.records?.length || 0,
      executionTime: `${queryExecutionTime}ms`
    });

    // For contract queries, fetch PDF links
    if (parsedIntent.intent === 'contract_query' && queryResult && queryResult.records && queryResult.records.length > 0) {
      try {
        const contractIds = queryResult.records.map(r => r.Id);
        const pdfQuery = buildPDFQuery(contractIds);
        const pdfResult = await query(pdfQuery, true);
        
        // Map PDFs to contracts
        const pdfMap = new Map();
        if (pdfResult && pdfResult.records) {
          pdfResult.records.forEach(pdf => {
            const contractId = pdf.LinkedEntityId;
            if (!pdfMap.has(contractId)) {
              pdfMap.set(contractId, []);
            }
            pdfMap.get(contractId).push({
              title: pdf.ContentDocument.Title,
              versionId: pdf.ContentDocument.LatestPublishedVersionId
            });
          });
        }
        
        // Attach PDF info to contracts
        queryResult.records.forEach(contract => {
          contract._pdfs = pdfMap.get(contract.Id) || [];
        });
      } catch (pdfError) {
        logger.error('Failed to fetch PDFs:', pdfError);
        // Continue without PDFs
      }
    }

    // Track query performance for learning
    await trackQueryPerformance(soql, queryExecutionTime, queryResult?.totalSize || 0, userId);
    
    // Set optimization result for debug display
    const optimizationResult = { optimized: false, appliedOptimizations: [] };

    const processingTime = Date.now() - startTime;

    // Update conversation context
    await updateContext(userId, channelId, parsedIntent, queryResult);

    // Format response based on intent
    let formattedResponse;
    if (parsedIntent.intent === 'account_lookup') {
      formattedResponse = await formatAccountLookup(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'account_stage_lookup') {
      formattedResponse = formatAccountStageResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'account_field_lookup') {
      formattedResponse = formatAccountFieldResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'cross_query') {
      formattedResponse = formatCrossQueryResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'count_query') {
      formattedResponse = formatCountResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'average_days_query') {
      formattedResponse = formatAverageDaysResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'weighted_summary') {
      formattedResponse = formatWeightedSummary(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'contract_query') {
      formattedResponse = formatContractResults(queryResult, parsedIntent);
    } else if (parsedIntent.intent === 'pipeline_summary' || 
               parsedIntent.intent === 'deal_lookup' || 
               parsedIntent.intent === 'owner_pipeline' ||
               parsedIntent.intent === 'late_stage_pipeline' ||
               parsedIntent.intent === 'product_pipeline') {
      // ALL pipeline queries use compact mobile-friendly format
      formattedResponse = formatPipelineAccountList(queryResult, parsedIntent);
    } else {
      formattedResponse = formatResponse(queryResult, parsedIntent, conversationContext);
    }
    
    const suggestions = generateSuggestions(conversationContext, parsedIntent.intent);

    // Build response message
    let responseText = formattedResponse;
    
    if (suggestions && suggestions.length > 0) {
      responseText += '\n\n*What\'s next?*\n' + suggestions.join('\n').replace(/[📊🔍⚠️📈📉💡🎯]/g, '');
    }

    // Add optimization info for debugging (only in dev)
    if (process.env.NODE_ENV === 'development') {
      responseText += `\n\n_Debug: ${processingTime}ms | Confidence: ${(parsedIntent.confidence * 100).toFixed(0)}% | Query: ${queryExecutionTime}ms`;
      if (optimizationResult.optimized) {
        responseText += ` | Optimized: ${optimizationResult.appliedOptimizations.join(', ')}`;
      }
      responseText += '_';
    }

    // Send final response
    if (false) { // Disabled multi-message for now - use single response
      await sendContractMessages(client, channelId, threadTs, queryResult, parsedIntent);
    } else {
      // Single message response
      const messageOptions = {
        channel: channelId,
        text: responseText,
        thread_ts: threadTs,
        replace_original: true
      };

      // DISABLED: Slack blocks create ugly multi-line format
      // Use compact text format for ALL queries (mobile-friendly)
      // Blocks are only used for very specific rich formatting needs
      // messageOptions.blocks = buildResponseBlocks(queryResult, parsedIntent);

      await client.chat.postMessage(messageOptions);
    }

    // Log successful query
    logger.info('✅ Query processed successfully', {
      userId,
      channelId,
      intent: parsedIntent.intent,
      resultCount: queryResult?.totalSize || 0,
      processingTime,
      confidence: parsedIntent.confidence
    });

  } catch (error) {
    logger.error('❌ Query processing failed:', error);
    
    // More helpful error message with details
    let errorMessage = `I encountered an error processing your request: "${text}"`;
    
    if (error.message && error.message.includes('No such column')) {
      errorMessage += `\n\nThis field doesn't exist in your Salesforce. Please contact support to add this capability.`;
    } else if (error.message) {
      errorMessage += `\n\nError: ${error.message.substring(0, 200)}`;
    }
    
    errorMessage += `\n\nTry: "show me my pipeline" or "who owns [company]?"`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: errorMessage,
      thread_ts: threadTs
    });
  }
}

/**
 * Build Slack blocks for rich formatting
 */
function buildResponseBlocks(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.records.length === 0) {
    return null;
  }

  const blocks = [];
  const records = queryResult.records.slice(0, 10); // Limit to 10 for display

  // Add header block without emojis
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: getHeaderText(parsedIntent.intent, queryResult.totalSize).replace(/[📊🔍⚠️📈📉📋]/g, '')
    }
  });

  // Add divider
  blocks.push({ type: 'divider' });

  // Add deal records
  records.forEach((record, index) => {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*${record.Name || 'Untitled Deal'}*\n${record.Account?.Name || 'No Account'}`
        },
        {
          type: 'mrkdwn',
          text: `*$${formatCurrency(record.Amount || 0)}*\n${cleanStageName(record.StageName) || 'No Stage'}`
        },
        {
          type: 'mrkdwn',
          text: `*${record.Owner?.Name || 'Unassigned'}*\n${formatDate(record.IsClosed ? record.CloseDate : record.Target_LOI_Date__c)}`
        }
      ]
    });

    // Add divider between records (except last)
    if (index < records.length - 1) {
      blocks.push({ type: 'divider' });
    }
  });

  // Add footer if there are more records
  if (queryResult.totalSize > 10) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Showing top 10 of ${queryResult.totalSize} results_`
        }
      ]
    });
  }

  return blocks.slice(0, 50); // Slack limit
}

/**
 * Get header text based on intent
 */
function getHeaderText(intent, totalSize) {
  const headers = {
    pipeline_summary: `Pipeline Summary (${totalSize} deals)`,
    deal_lookup: `Deal Results (${totalSize} found)`,
    activity_check: `Activity Check (${totalSize} deals need attention)`,
    forecasting: `Forecast View (${totalSize} deals)`,
    trend_analysis: `Trend Analysis (${totalSize} records)`,
    account_lookup: `Account Results (${totalSize} found)`
  };

  return headers[intent] || `Results (${totalSize})`;
}

/**
 * Handle reaction feedback
 */
async function handleReactionFeedback(event, client) {
  if (event.reaction === 'thumbsup' || event.reaction === '+1') {
    logger.info('👍 Positive feedback received', {
      userId: event.user,
      messageTs: event.item.ts
    });
  } else if (event.reaction === 'thumbsdown' || event.reaction === '-1') {
    logger.info('👎 Negative feedback received', {
      userId: event.user,
      messageTs: event.item.ts
    });
  }
}

/**
 * Handle Customer_Brain note saving
 */
async function handleCustomerBrainNote(message, userId, channelId, client, threadTs, context) {
  // Security: Only Keigan can save notes
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  if (userId !== KEIGAN_USER_ID) {
    await client.chat.postMessage({
      channel: channelId,
      text: 'Note saving is restricted to Keigan. Contact him for access.',
      thread_ts: threadTs
    });
    return;
  }

  try {
    // STEP 1: Extract account name - ONLY text immediately after colon, before first newline
    // Includes typo tolerance for common misspellings (histroy, custome, etc.)
    const triggerMatch = message.match(/add to cust[oe]m[ea]r\s*hist[orya]{3,6}\s*:\s*([^\n]+)/i) ||
                        message.match(/add to customer history\s*:\s*([^\n]+)/i) ||
                        message.match(/customer brain\s*(?:for\s*)?:\s*([^\n]+)/i);
    
    if (!triggerMatch) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Format: add to customer history: [Account Name]\n[Your notes]`,
        thread_ts: threadTs
      });
      return;
    }

    // This is the ONLY place we get account name - nowhere else!
    const accountName = triggerMatch[1].trim();
    
    // STEP 2: Get full note content (the entire message is the note)
    const fullNote = message
      .replace(/@gtm-brain/gi, '')
      .trim();
    
    // STEP 3: Query Salesforce for THIS account name ONLY
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, Customer_Brain__c
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    logger.info(`Customer Brain: Looking for account "${accountName}"`);
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      const errorMessage = await formatAccountNotFoundError(accountName);
      await client.chat.postMessage({
        channel: channelId,
        text: errorMessage,
        thread_ts: threadTs
      });
      return;
    }

    // Find best match (prefer business lead)
    const businessLeads = [
      // US Pod
      'Asad Hussain', 'Himanshu Agarwal', 'Julie Stefanich', 'Olivia Jung', 'Ananth Cherukupally', 'Justin Hills',
      // EU Pod
      'Greg MacHale', 'Nathan Shine', 'Tom Clancy', 'Conor Molloy', 'Alex Fox', 'Nicola Fratini', 'Emer Flynn', 'Riona McHale'
    ];
    const blMatch = accountResult.records.find(r => businessLeads.includes(r.Owner?.Name));
    const account = blMatch || accountResult.records[0];

    logger.info(`Customer Brain: Found account ${account.Name} (searched for: ${accountName})`);

    // STEP 4: Format the note with date and user
    const date = new Date();
    const dateShort = `${date.getMonth() + 1}/${date.getDate()}`;
    const formattedNote = `${dateShort} - Keigan: ${fullNote}`;

    // STEP 5: Update Salesforce
    const existingNotes = account.Customer_Brain__c || '';
    const updatedNotes = formattedNote + (existingNotes ? '\n\n' + existingNotes : '');

    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    await conn.sobject('Account').update({
      Id: account.Id,
      Customer_Brain__c: updatedNotes
    });

    // STEP 6: Confirm - concise
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    const confirmMessage = `Note saved to ${account.Name}\n\n${dateShort} - Added to Customer_Brain\nOwner: ${account.Owner?.Name}\n\n<${accountUrl}|View in Salesforce>`;

    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Customer Brain note saved to ${account.Name} (searched for: ${accountName})`);

  } catch (error) {
    logger.error('Failed to save Customer_Brain note:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error saving note: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Generate conversational response using Socrates
 */
async function generateConversationalResponse(message, context) {
  try {
    const { socratesAdapter } = require('../ai/socratesAdapter');
    
    const systemPrompt = `You are GTM-Wizard, a helpful sales intelligence assistant. You can chat naturally but your specialty is Salesforce data analysis. Keep responses brief and friendly. If asked about capabilities, mention you can help with pipeline analysis, deal lookups, account ownership, forecasting, and more.`;
    
    const response = await socratesAdapter.createChatCompletion({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error('Conversational response failed:', error);
    return `I'm here to help with your sales data! Ask me about pipeline, deals, account ownership, or forecasting. What would you like to know?`;
  }
}

/**
 * Send contract messages (split into multiple if needed)
 */
async function sendContractMessages(client, channelId, threadTs, queryResult, parsedIntent) {
  const contracts = queryResult.records;
  const accountName = parsedIntent.entities.accounts?.[0];
  const contractType = parsedIntent.entities.contractType;
  
  // Build complete response with all contracts
  let fullResponse = '';
  
  const title = contractType === 'LOI' 
    ? `*All LOI Contracts* (${contracts.length} total)\n\n`
    : accountName
      ? `*Contracts for ${accountName}* (${contracts.length} total)\n\n`
      : `*All Contracts* (${contracts.length} total)\n\n`;
  
  fullResponse += title;

  // Add all contracts in compact format
  contracts.forEach((contract, i) => {
    const contractName = contract.Contract_Name_Campfire__c || contract.ContractNumber;
    const accountNameDisplay = contract.Account?.Name;
    
    // Detect LOI
    const isLOI = contractName && (contractName.includes('Customer Advisory Board') || 
                                   contractName.includes('LOI') || 
                                   contractName.includes('CAB'));
    const typeLabel = isLOI ? ' [LOI]' : '';
    
    fullResponse += `${i + 1}. ${accountNameDisplay}${typeLabel}\n`;
    
    // Add PDF link
    if (contract._pdfs && contract._pdfs.length > 0) {
      const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
      const downloadUrl = `${sfBaseUrl}/sfc/servlet.shepherd/version/download/${contract._pdfs[0].versionId}`;
      fullResponse += `   <${downloadUrl}|Download PDF>\n`;
    }
    
    if (contract.StartDate && contract.EndDate) {
      fullResponse += `   ${formatDate(contract.StartDate)} → ${formatDate(contract.EndDate)}\n`;
    }
    
    fullResponse += '\n';
  });

  // If more than 10 contracts OR response too long, split it
  if (contracts.length > 10 || fullResponse.length > 3500) {
    // Send title first (in thread, not replacing)
    const titleMsg = await client.chat.postMessage({
      channel: channelId,
      text: title,
      thread_ts: threadTs
    });
    
    // Use this as the thread for subsequent messages
    const contractThreadTs = titleMsg.ts;

    // Send contracts in chunks
    const chunkSize = 10;
    for (let i = 0; i < contracts.length; i += chunkSize) {
      const chunk = contracts.slice(i, i + chunkSize);
      let chunkResponse = '';
      
      chunk.forEach((contract, idx) => {
        const globalIndex = i + idx + 1;
        const accountNameDisplay = contract.Account?.Name;
        const isLOI = (contract.Contract_Name_Campfire__c || '').includes('LOI') || 
                      (contract.Contract_Name_Campfire__c || '').includes('CAB') ||
                      (contract.Contract_Name_Campfire__c || '').includes('Customer Advisory Board');
        const typeLabel = isLOI ? ' [LOI]' : '';
        
        chunkResponse += `${globalIndex}. ${accountNameDisplay}${typeLabel}\n`;
        
        if (contract._pdfs && contract._pdfs.length > 0) {
          const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
          const downloadUrl = `${sfBaseUrl}/sfc/servlet.shepherd/version/download/${contract._pdfs[0].versionId}`;
          chunkResponse += `   <${downloadUrl}|Download PDF>\n\n`;
        }
      });
      
      // Send each chunk in the contract thread
      await client.chat.postMessage({
        channel: channelId,
        text: chunkResponse,
        thread_ts: contractThreadTs || threadTs
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } else {
    // Short enough for single message
    await client.chat.postMessage({
      channel: channelId,
      text: fullResponse,
      thread_ts: threadTs,
      replace_original: true
    });
  }
}

/**
 * Send help message
 */
async function sendHelpMessage(client, channelId) {
  const helpText = `🤖 *GTM Brain - Your Sales Intelligence Assistant*

I can help you with:

*📊 Pipeline Queries*
• "show me my pipeline"
• "what's in proposal stage?"
• "deals over $100k"

*🔍 Deal Lookups*
• "what closed today?"
• "deals closing this month"
• "show me Julie's deals"

*⚠️ Activity Checks*
• "what's stale?"
• "deals stuck in discovery"
• "what needs attention?"

*📈 Forecasting*
• "what am I forecasting?"
• "best case vs commit"
• "pipeline coverage"

*📉 Analytics*
• "win rate by stage"
• "average deal size"
• "conversion rates"

*💡 Tips*
• Be conversational - I understand natural language
• Follow up with refinements like "now just enterprise"
• Ask for specific time periods, stages, or reps
• I remember context within our conversation

*🆘 Need Help?*
Use \`/pipeline help\` for slash commands or just ask me anything!`;

  await client.chat.postMessage({
    channel: channelId,
    text: helpText
  });
}

/**
 * Format currency for display
 */
function formatCurrency(amount) {
  if (!amount) return '0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount).replace('$', '');
}

/**
 * Levenshtein distance calculation for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Find closest matching command pattern using fuzzy matching
 * Returns { pattern, score } or null if no good match found
 */
function findClosestMatch(userQuery, patterns) {
  if (!userQuery || !patterns || patterns.length === 0) return null;
  
  const query = userQuery.toLowerCase().trim();
  let bestMatch = null;
  let bestScore = 0;
  
  for (const pattern of patterns) {
    const patternLower = pattern.toLowerCase();
    
    // Calculate similarity score
    const maxLen = Math.max(query.length, patternLower.length);
    const distance = levenshteinDistance(query, patternLower);
    const similarity = 1 - (distance / maxLen);
    
    // Also check if query contains most of the pattern words
    const patternWords = patternLower.split(/\s+/);
    const queryWords = query.split(/\s+/);
    const matchingWords = patternWords.filter(pw => 
      queryWords.some(qw => qw.includes(pw) || pw.includes(qw))
    );
    const wordMatchRatio = matchingWords.length / patternWords.length;
    
    // Combined score: weight word matching higher
    const combinedScore = (similarity * 0.4) + (wordMatchRatio * 0.6);
    
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = pattern;
    }
  }
  
  return bestScore >= 0.3 ? { pattern: bestMatch, score: bestScore } : null;
}

/**
 * Find similar account names for "Did you mean?" suggestions
 */
async function findSimilarAccounts(searchTerm, limit = 3) {
  if (!searchTerm || searchTerm.length < 2) return [];
  
  try {
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    
    // Search for accounts starting with or containing the term
    const searchQuery = `
      SELECT Id, Name, Owner.Name 
      FROM Account 
      WHERE Name LIKE '%${escapedTerm}%'
         OR Name LIKE '${escapedTerm.charAt(0)}%'
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 10
    `;
    
    const result = await query(searchQuery);
    
    if (!result || !result.records || result.records.length === 0) {
      return [];
    }
    
    // Score matches by similarity
    const scoredMatches = result.records.map(acc => {
      const name = acc.Name.toLowerCase();
      const search = searchTerm.toLowerCase();
      
      // Calculate simple similarity score
      let score = 0;
      if (name.includes(search)) score += 0.5;
      if (name.startsWith(search)) score += 0.3;
      
      // Levenshtein-based scoring
      const maxLen = Math.max(name.length, search.length);
      const distance = levenshteinDistance(name, search);
      score += (1 - distance / maxLen) * 0.5;
      
      return { name: acc.Name, owner: acc.Owner?.Name, score };
    });
    
    // Sort by score and return top matches
    scoredMatches.sort((a, b) => b.score - a.score);
    return scoredMatches.slice(0, limit);
    
  } catch (error) {
    logger.error('Error finding similar accounts:', error);
    return [];
  }
}

/**
 * Format "Account not found" error with suggestions
 */
async function formatAccountNotFoundError(accountName, actionHint = null) {
  let message = `❌ Account "${accountName}" not found.\n\n`;
  
  // Try to find similar accounts
  const similar = await findSimilarAccounts(accountName);
  
  if (similar.length > 0) {
    message += `🔍 *Did you mean:*\n`;
    similar.forEach(acc => {
      message += `• ${acc.name}${acc.owner ? ` (Owner: ${acc.owner})` : ''}\n`;
    });
    message += '\n';
  }
  
  // Add action-specific hints
  if (actionHint === 'nurture') {
    message += `_Try: "move [correct name] to nurture"_`;
  } else if (actionHint === 'create') {
    message += `_Create it: "create ${accountName} and assign to BL"_`;
  } else {
    message += `_Verify: "who owns ${accountName}" or "does ${accountName} exist?"_`;
  }
  
  return message;
}

/**
 * Format account lookup results
 */
async function formatAccountLookup(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const accountName = parsedIntent.entities.accounts?.[0] || 'that company';
    return await formatAccountNotFoundError(accountName);
  }

  const records = queryResult.records;
  const businessLeads = [
    // US Pod
    'Asad Hussain', 'Himanshu Agarwal', 'Julie Stefanich', 'Olivia Jung', 'Ananth Cherukupally', 'Justin Hills',
    // EU Pod
    'Greg MacHale', 'Nathan Shine', 'Tom Clancy', 'Conor Molloy', 'Alex Fox', 'Nicola Fratini', 'Emer Flynn', 'Riona McHale'
  ];
  const unassignedHolders = ['Keigan Pesenti', 'Emmit Hood', 'Emmitt Hood', 'Mark Runyon', 'Derreck Chu', 'Sarah Rakhine'];
  
  const searchTerm = parsedIntent.entities.accounts[0].toLowerCase();
  
  // Find best match
  const exactMatchBusinessLead = records.find(r => 
    r.Name.toLowerCase() === searchTerm && businessLeads.includes(r.Owner?.Name)
  );
  
  const exactMatch = records.find(r => r.Name.toLowerCase() === searchTerm);
  const anyBusinessLeadMatch = records.find(r => businessLeads.includes(r.Owner?.Name));
  const partialMatch = records.find(r => r.Name.toLowerCase().includes(searchTerm));
  
  const primaryResult = exactMatchBusinessLead || exactMatch || anyBusinessLeadMatch || partialMatch || records[0];

  const currentOwner = primaryResult.Owner?.Name;
  const isHeldByKeigan = unassignedHolders.includes(currentOwner);
  const isBusinessLead = businessLeads.includes(currentOwner);

  let response = '';

  if (isHeldByKeigan && primaryResult.Prior_Account_Owner_Name__c) {
    const priorOwner = primaryResult.Prior_Account_Owner_Name__c;
    
    if (businessLeads.some(bl => priorOwner && priorOwner.includes(bl))) {
      response = `*${primaryResult.Name}*\n`;
      response += `Prior Owner: ${priorOwner}\n`;
      response += `Current holder: ${currentOwner} _(needs reassignment)_\n`;
      if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
      response += `\n⚠️ *This account needs to be reassigned to a BL.*\n`;
      response += `Say \`reassign ${primaryResult.Name} to BL\` for smart suggestions.`;
    } else {
      response = `*${primaryResult.Name}*\n`;
      response += `Status: Unassigned _(held by ${currentOwner})_\n`;
      if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
      response += `\n⚠️ *This account needs to be reassigned to a BL.*\n`;
      response += `Say \`reassign ${primaryResult.Name} to BL\` for smart suggestions.`;
    }
  } else if (!isBusinessLead) {
    response = `*${primaryResult.Name}*\n`;
    response += `Status: Unassigned _(held by ${currentOwner || 'No owner'})_\n`;
    if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
    response += `\n⚠️ *This account needs to be reassigned to a BL.*\n`;
    response += `Say \`reassign ${primaryResult.Name} to BL\` for smart suggestions.`;
  } else {
    response = `*${primaryResult.Name}*\n`;
    response += `Owner: ${currentOwner}\n`;
    response += `Email: ${primaryResult.Owner?.Email || 'No email available'}\n`;
    if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}`;
  }

  // NEW: If showOpportunities flag is set, fetch and display comprehensive context
  if (parsedIntent.entities.showOpportunities && primaryResult.Id) {
    try {
      // Fetch opportunities
      const oppQuery = `SELECT Name, StageName, ACV__c, Product_Line__c, Target_LOI_Date__c
                        FROM Opportunity
                        WHERE AccountId = '${primaryResult.Id}' AND IsClosed = false
                        ORDER BY StageName DESC, ACV__c DESC`;
      
      const oppResult = await query(oppQuery);
      
      if (oppResult && oppResult.records && oppResult.records.length > 0) {
        response += `\n\n*Active Opportunities (${oppResult.records.length}):*\n`;
        oppResult.records.forEach(opp => {
          const acv = opp.ACV__c ? `$${(opp.ACV__c / 1000).toFixed(0)}K` : 'TBD';
          const loi = opp.Target_LOI_Date__c ? new Date(opp.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : 'TBD';
          response += `• ${opp.Name}\n  ${cleanStageName(opp.StageName)} | ${opp.Product_Line__c || 'TBD'} | ${acv} | LOI: ${loi}\n`;
        });
      } else {
        response += `\n\n_No active opportunities found._`;
      }
      
      // Fetch meeting history from Events
      const meetingQuery = `SELECT ActivityDate, Subject, Type
                            FROM Event
                            WHERE AccountId = '${primaryResult.Id}'
                            ORDER BY ActivityDate DESC
                            LIMIT 5`;
      
      try {
        const meetingResult = await query(meetingQuery);
        
        if (meetingResult && meetingResult.records && meetingResult.records.length > 0) {
          // Get last and next meeting
          const now = new Date();
          now.setHours(0, 0, 0, 0); // Set to start of today for proper date comparison
          
          // Filter meetings - past meetings are before today
          const pastMeetings = meetingResult.records.filter(m => {
            const meetingDate = new Date(m.ActivityDate);
            meetingDate.setHours(0, 0, 0, 0);
            return meetingDate < now;
          });
          
          // Filter meetings - future meetings are after today (not including today)
          const futureMeetings = meetingResult.records.filter(m => {
            const meetingDate = new Date(m.ActivityDate);
            meetingDate.setHours(0, 0, 0, 0);
            return meetingDate > now;
          });
          
          response += `\n\n*Meeting History:*\n`;
          
          if (pastMeetings.length > 0) {
            const lastMeeting = pastMeetings[0];
            const lastDate = new Date(lastMeeting.ActivityDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
            response += `• Prior Meeting: ${lastDate}`;
            if (lastMeeting.Subject) response += ` - ${lastMeeting.Subject}`;
            response += `\n`;
          }
          
          if (futureMeetings.length > 0) {
            // Sort future meetings ascending to get the next (closest) meeting
            const sortedFuture = futureMeetings.sort((a, b) => new Date(a.ActivityDate) - new Date(b.ActivityDate));
            const nextMeeting = sortedFuture[0];
            const nextDate = new Date(nextMeeting.ActivityDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
            response += `• Next Meeting: ${nextDate}`;
            if (nextMeeting.Subject) response += ` - ${nextMeeting.Subject}`;
            response += `\n`;
          } else {
            // Only show "No next meeting" if there are past meetings but no future meetings
            if (pastMeetings.length > 0) {
              response += `• No next meeting scheduled\n`;
            } else {
              response += `• No meetings scheduled\n`;
            }
          }
        }
      } catch (meetingError) {
        console.log('Meeting fetch failed (may not have permissions):', meetingError.message);
      }
      
      // Show Account Plan if exists
      if (primaryResult.Account_Plan_s__c && primaryResult.Account_Plan_s__c.trim().length > 0) {
        const planPreview = primaryResult.Account_Plan_s__c.substring(0, 300);
        response += `\n\n*Account Plan:*\n${planPreview}${primaryResult.Account_Plan_s__c.length > 300 ? '...' : ''}`;
      }
      
      // Show Customer Brain notes if exist
      if (primaryResult.Customer_Brain__c && primaryResult.Customer_Brain__c.trim().length > 0) {
        const brainPreview = primaryResult.Customer_Brain__c.substring(0, 300);
        response += `\n\n*Customer Brain Notes:*\n${brainPreview}${primaryResult.Customer_Brain__c.length > 300 ? '...' : ''}`;
      }
      
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      response += `\n\n_Unable to fetch opportunities._`;
    }
  }

  return response;
}

/**
 * Format account stage lookup results
 */
function formatAccountStageResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const stageName = parsedIntent.entities.stages?.[0] || 'that stage';
    return `No accounts found in ${stageName}. There might not be any active opportunities in this stage.`;
  }

  const records = queryResult.records;
  const stageName = parsedIntent.entities.stages[0];
  
  // Group by account to avoid duplicates
  const accountMap = new Map();
  records.forEach(record => {
    const accountName = record.Account?.Name;
    if (accountName && !accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        owner: record.Account?.Owner?.Name,
        industry: record.Account?.Industry,
        dealCount: 1,
        totalAmount: record.Amount || 0
      });
    } else if (accountName) {
      const existing = accountMap.get(accountName);
      existing.dealCount++;
      existing.totalAmount += record.Amount || 0;
    }
  });

  const accounts = Array.from(accountMap.values());
  
  // IMPROVED: Simple list format like customer queries
  const accountNames = accounts.map(a => a.name).join(', ');
  
  let response = `*Accounts in ${cleanStageName(stageName)}* (${accounts.length} total)\n\n`;
  response += `${accountNames}`;
  
  return response;
}

/**
 * Format pipeline queries - COMPACT MOBILE-FRIENDLY VIEW
 * Shows summary + top 10 deals as bullet list
 */
function formatPipelineAccountList(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const stageDesc = parsedIntent.entities.stages?.[0];
    const productLine = parsedIntent.entities.productLine;
    
    // DEBUG: Show query details in Slack to help diagnose
    const debugInfo = `\n\n*🔍 Debug Info:*\n` +
      `• Intent: \`${parsedIntent.intent}\`\n` +
      `• Stages: ${JSON.stringify(parsedIntent.entities.stages || [])}\n` +
      `• isClosed: \`${parsedIntent.entities.isClosed}\`\n` +
      `• ProductLine: \`${productLine || 'none'}\`\n` +
      `_Full SOQL query logged on server_`;
    
    if (productLine && stageDesc) {
      return `No ${productLine} opportunities found in ${cleanStageName(stageDesc)}.${debugInfo}`;
    } else if (productLine) {
      return `No ${productLine} opportunities found.${debugInfo}`;
    } else if (stageDesc) {
      return `No opportunities found in ${cleanStageName(stageDesc)}.${debugInfo}`;
    }
    return `No opportunities found.\n\nTry: "late stage pipeline" or "contracting pipeline"${debugInfo}`;
  }

  const records = queryResult.records;
  let totalAmount = 0;
  
  records.forEach(record => {
    totalAmount += record.Amount || 0;
  });
  
  // Build smart header based on query type
  const stageDesc = parsedIntent.entities.stages?.map(s => cleanStageName(s)).join(', ');
  const productLine = parsedIntent.entities.productLine;
  const ownerName = parsedIntent.entities.owners?.[0];
  
  let response = '';
  if (ownerName) {
    response += `*${ownerName}'s Pipeline*\n`;
  } else if (productLine && stageDesc) {
    response += `*${productLine} - ${stageDesc}*\n`;
  } else if (productLine) {
    response += `*${productLine} Pipeline*\n`;
  } else if (stageDesc) {
    response += `*${stageDesc}*\n`;
  } else {
    response += `*Pipeline Summary*\n`;
  }
  
  // One-line summary
  response += `${records.length} deals • *${formatCurrency(totalAmount)}* total\n\n`;
  
  // Sort by amount descending and show top 10
  const sortedRecords = [...records].sort((a, b) => (b.Amount || 0) - (a.Amount || 0));
  const maxToShow = 10;
  
  // Top deals as compact single-line list
  sortedRecords.slice(0, maxToShow).forEach((record, i) => {
    const account = record.Account?.Name || 'Unknown';
    const amount = formatCurrency(record.Amount || 0);
    const stage = shortStage(record.StageName);
    const owner = shortName(record.Owner?.Name);
    const date = formatTargetDate(record.Target_LOI_Date__c);
    
    response += `${i + 1}. *${account}* - ${amount} • ${stage} • ${owner} • ${date}\n`;
  });
  
  // Show prompt to see more if there are additional deals
  if (records.length > maxToShow) {
    response += `\n_Showing top 10 of ${records.length} deals by ACV_`;
    response += `\n_Say "show next 10" or "show all" for more_`;
  }

  return response;
}

/**
 * Helper: Shorten stage name "Stage 2 - SQO" → "S2"
 */
function shortStage(stageName) {
  if (!stageName) return 'N/A';
  const match = stageName.match(/Stage (\d)/);
  if (match) return `S${match[1]}`;
  if (stageName.includes('Won')) return 'Won';
  if (stageName.includes('Lost')) return 'Lost';
  return stageName.substring(0, 6);
}

/**
 * Helper: Shorten name "Julie Stefanich" → "Julie S."
 */
function shortName(fullName) {
  if (!fullName) return 'Unassigned';
  const parts = fullName.split(' ');
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return fullName;
}

/**
 * Helper: Format date "2026-01-31" → "Jan 31"
 */
function formatTargetDate(dateString) {
  if (!dateString) return 'No date';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Build account field queries for advanced searches
 */
function buildAccountFieldQuery(entities) {
  const fieldType = entities.fieldType;
  let soql = '';

  switch (fieldType) {
    case 'legal_team_size':
      soql = `SELECT Id, Name, Owner.Name, Legal_Department_Size__c, Industry
              FROM Account 
              WHERE Legal_Department_Size__c != null`;
      
      if (entities.accounts && entities.accounts.length > 0) {
        const accountName = entities.accounts[0];
        soql += ` AND (Name LIKE '%${accountName}%')`;
      }
      soql += ` ORDER BY Legal_Department_Size__c DESC LIMIT 10`;
      break;

    case 'harvey_mentions':
      soql = `SELECT Id, Name, Owner.Name, Pain_Points_Identified__c
              FROM Account 
              WHERE Pain_Points_Identified__c LIKE '%harvey%'
              ORDER BY Name LIMIT 15`;
      break;
    
    case 'competitive_landscape':
      // Search Competitive_Landscape__c field for competitor mentions
      const competitor = entities.searchTerm ? entities.searchTerm.replace(/'/g, "\\'") : '';
      if (competitor) {
        soql = `SELECT Id, Name, Owner.Name, Competitive_Landscape__c, Industry
                FROM Account 
                WHERE Competitive_Landscape__c LIKE '%${competitor}%'
                ORDER BY Name LIMIT 30`;
      } else {
        // No specific competitor - show all accounts with competitive info
        soql = `SELECT Id, Name, Owner.Name, Competitive_Landscape__c, Industry
                FROM Account 
                WHERE Competitive_Landscape__c != null
                ORDER BY Name LIMIT 20`;
      }
      break;

    case 'pain_points':
      soql = `SELECT Id, Name, Owner.Name, Pain_Points_Identified__c, Industry
              FROM Account 
              WHERE Pain_Points_Identified__c != null
              ORDER BY Name LIMIT 15`;
      break;

    case 'use_cases':
      // Check if asking about SPECIFIC account or general list
      if (entities.accounts && entities.accounts.length > 0) {
        // Specific account - query opportunities for that account to see what they're discussing
        const accountName = entities.accounts[0];
        soql = `SELECT Account.Name, Account.Owner.Name, Name, Product_Line__c, StageName, Amount
                FROM Opportunity 
                WHERE Account.Name LIKE '%${accountName}%' AND IsClosed = false
                ORDER BY Amount DESC
                LIMIT 20`;
      } else if (entities.searchTerm) {
        // Product line search - query opportunities then group by account
        const productLineMap = {
          'contracting': 'AI-Augmented Contracting',
          'm&a': 'Augmented-M&A', // Actual Salesforce value
          'mna': 'Augmented-M&A',
          'compliance': 'Compliance',
          'sigma': 'sigma',
          'cortex': 'Cortex'
        };
        
        const productLine = productLineMap[entities.searchTerm.toLowerCase()] || entities.searchTerm;
        
        soql = `SELECT Account.Name, Account.Owner.Name, Name, Amount, StageName
                FROM Opportunity 
                WHERE Product_Line__c = '${productLine}' AND IsClosed = false
                ORDER BY Account.Name, Amount DESC
                LIMIT 50`;
      } else {
        // Generic query - return accounts with any opportunities
        soql = `SELECT Id, Name, Owner.Name, Industry
                FROM Account 
                WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsClosed = false)
                ORDER BY Name LIMIT 20`;
      }
      break;

    case 'decision_makers':
      soql = `SELECT Id, Name, Owner.Name, Key_Decision_Makers__c, Industry
              FROM Account 
              WHERE Key_Decision_Makers__c != null`;
      
      if (entities.accounts && entities.accounts.length > 0) {
        const accountName = entities.accounts[0];
        soql += ` AND (Name LIKE '%${accountName}%')`;
      }
      soql += ` ORDER BY Name LIMIT 10`;
      break;

    default:
      soql = `SELECT Id, Name, Owner.Name FROM Account LIMIT 1`;
  }

  return soql;
}

/**
 * Build count queries for customers/contracts
 */
function buildCountQuery(entities) {
  const countType = entities.countType;
  
  switch (countType) {
    case 'total_customers':
      // Return account names for listing
      return `SELECT Name, Owner.Name, Customer_Type__c
              FROM Account 
              WHERE Customer_Type__c != null
              ORDER BY Name`;
    
    case 'arr_customers':
      return `SELECT Name, Owner.Name
              FROM Account 
              WHERE Customer_Type__c = 'ARR'
              ORDER BY Name`;
    
    case 'loi_customers':
      return `SELECT Name, Owner.Name
              FROM Account 
              WHERE Customer_Type__c = 'LOI, with $ attached'
              ORDER BY Name`;
    
    case 'arr_contracts':
      return `SELECT COUNT(Id) ARRContractCount 
              FROM Opportunity 
              WHERE Revenue_Type__c = 'Recurring' AND IsClosed = true AND IsWon = true`;
    
    case 'loi_count':
      return `SELECT COUNT(Id) LOICount 
              FROM Opportunity 
              WHERE Revenue_Type__c = 'Commitment' AND IsClosed = true AND IsWon = true`;
    
    case 'loi_accounts':
      // What accounts/companies have signed LOIs
      return `SELECT DISTINCT Account.Name, Account.Owner.Name, CloseDate, Amount, ACV__c
              FROM Opportunity 
              WHERE Revenue_Type__c = 'Commitment' AND IsClosed = true AND IsWon = true
              ORDER BY CloseDate DESC`;
    
    default:
      return `SELECT COUNT(Id) Total FROM Account LIMIT 1`;
  }
}

/**
 * Build PDF files query for contracts
 */
function buildPDFQuery(contractIds) {
  const idList = contractIds.map(id => `'${id}'`).join(',');
  return `SELECT LinkedEntityId,
                 ContentDocument.Id,
                 ContentDocument.Title,
                 ContentDocument.LatestPublishedVersionId
          FROM ContentDocumentLink
          WHERE LinkedEntityId IN (${idList})
          ORDER BY ContentDocument.Title`;
}

/**
 * Build contract query
 */
function buildContractQuery(entities) {
  let whereConditions = [];
  
  // Account filter
  if (entities.accounts && entities.accounts.length > 0) {
    const accountName = entities.accounts[0];
    whereConditions.push(`Account.Name LIKE '%${accountName}%'`);
  } else {
    whereConditions.push(`Status = 'Activated'`);
  }
  
  // LOI filter - Multiple patterns (very flexible)
  if (entities.contractType === 'LOI') {
    whereConditions.push(`(Contract_Name_Campfire__c LIKE '%Customer Advisory Board%' 
                           OR Contract_Name_Campfire__c LIKE '% LOI%'
                           OR Contract_Name_Campfire__c LIKE '%LOI %'
                           OR Contract_Name_Campfire__c LIKE '%-LOI%'
                           OR Contract_Name_Campfire__c LIKE '%LOI-%'
                           OR Contract_Name_Campfire__c LIKE '% CAB%'
                           OR Contract_Name_Campfire__c LIKE '%CAB %'
                           OR Contract_Name_Campfire__c LIKE '%signed%')`);
  }
  
  const whereClause = whereConditions.join(' AND ');
  // Remove LIMIT entirely for "all contracts" - get everything
  const limitClause = entities.accounts ? 'LIMIT 50' : ''; // No limit for all contracts
  
  return `SELECT Id, ContractNumber, Account.Name, StartDate, EndDate, 
                 Status, ContractTerm, Contract_Name_Campfire__c
          FROM Contract
          WHERE ${whereClause}
          ORDER BY StartDate DESC
          ${limitClause}`;
}

/**
 * Build weighted pipeline summary query
 */
function buildWeightedSummaryQuery(entities) {
  // Only include active stages (0-4)
  const activeStages = [
    'Stage 0 - Qualifying',
    'Stage 1 - Discovery',
    'Stage 2 - SQO',
    'Stage 3 - Pilot',
    'Stage 4 - Proposal'
  ];
  
  const stageFilter = activeStages.map(s => `'${s}'`).join(',');
  let whereClause = `WHERE IsClosed = false AND StageName IN (${stageFilter})`;
  
  // Add timeframe if specified (filter by Target_LOI_Date__c)
  if (entities.timeframe) {
    const timeMap = {
      'this_month': 'Target_LOI_Date__c = THIS_MONTH',
      'this_quarter': 'Target_LOI_Date__c = THIS_FISCAL_QUARTER', // Use FISCAL quarter
      'this_year': 'Target_LOI_Date__c = THIS_FISCAL_YEAR'
    };
    
    if (timeMap[entities.timeframe]) {
      whereClause += ' AND ' + timeMap[entities.timeframe];
    }
  }
  
  // Use correct fields: ACV__c for gross, Weighted_ACV__c for weighted
  return `SELECT StageName,
                 SUM(ACV__c) GrossAmount,
                 SUM(Weighted_ACV__c) WeightedAmount,
                 COUNT(Id) DealCount
          FROM Opportunity
          ${whereClause}
          GROUP BY StageName
          ORDER BY SUM(ACV__c) DESC`;
}

/**
 * Build average days in stage query
 */
function buildAverageDaysQuery(entities) {
  if (entities.stages && entities.stages.length > 0) {
    const stageName = entities.stages[0];
    return `SELECT AVG(Days_in_Stage1__c) AvgDays, COUNT(Id) DealCount
            FROM Opportunity 
            WHERE StageName = '${stageName}' AND IsClosed = false AND Days_in_Stage1__c != null`;
  }
  
  return `SELECT AVG(Days_in_Stage1__c) AvgDays FROM Opportunity WHERE IsClosed = false LIMIT 1`;
}

/**
 * Build cross-object queries
 */
function buildCrossQuery(entities) {
  if (entities.crossType === 'contracting_stage') {
    return `SELECT Account.Name, Account.Owner.Name, Account.Use_Cases_Interested__c, Name, Amount, StageName
            FROM Opportunity 
            WHERE StageName IN (${entities.stages.map(s => `'${s}'`).join(',')})
              AND IsClosed = false
              AND (Account.Use_Cases_Interested__c LIKE '%contracting%' 
                   OR Account.Use_Cases_Discussed__c LIKE '%contracting%')
            ORDER BY Amount DESC
            LIMIT 20`;
  }
  
  return `SELECT Id, Name FROM Opportunity LIMIT 1`;
}

/**
 * Format account field lookup results
 */
function formatAccountFieldResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    return `No results found for that query. The information might not be available in Salesforce.`;
  }

  const records = queryResult.records;
  const fieldType = parsedIntent.entities.fieldType;
  
  let response = '';

  switch (fieldType) {
    case 'legal_team_size':
      if (records.length === 1 && parsedIntent.entities.accounts) {
        // Single account query - show just the answer
        const account = records[0];
        response = `*${account.Name}*\n`;
        if (account.Legal_Department_Size__c) {
          response += `Legal team size: ${account.Legal_Department_Size__c}\n`;
        } else {
          response += `No legal team size information available\n`;
        }
        response += `Owner: ${account.Owner?.Name || 'Unassigned'}`;
      } else {
        // Multiple accounts
        response = `*Legal Team Sizes*\n\n`;
        records.forEach(account => {
          if (account.Legal_Department_Size__c) {
            response += `*${account.Name}*\n`;
            response += `Legal team: ${account.Legal_Department_Size__c}\n`;
            response += `Owner: ${account.Owner?.Name || 'Unassigned'}\n\n`;
          }
        });
      }
      break;

    case 'harvey_mentions':
      const harveAccountNames = records.map(r => r.Name).join(', ');
      response = `*Accounts that have mentioned Harvey:*\n${harveAccountNames}`;
      break;
    
    case 'competitive_landscape':
      const competitorSearchTerm = parsedIntent.entities.searchTerm || 'competitors';
      const nonBLHolders = ['Keigan Pesenti', 'Emmit Hood', 'Emmitt Hood', 'Mark Runyon', 'Derreck Chu', 'Sarah Rakhine'];
      const validBLs = [
        // US Pod
        'Asad Hussain', 'Himanshu Agarwal', 'Julie Stefanich', 'Olivia Jung', 'Ananth Cherukupally', 'Justin Hills',
        // EU Pod
        'Greg MacHale', 'Nathan Shine', 'Tom Clancy', 'Conor Molloy', 'Alex Fox', 'Nicola Fratini', 'Emer Flynn', 'Riona McHale'
      ];
      
      if (records.length === 0) {
        response = `No accounts found with "${competitorSearchTerm}" in their competitive landscape.`;
      } else {
        response = `*Accounts with ${competitorSearchTerm.charAt(0).toUpperCase() + competitorSearchTerm.slice(1)} in Competitive Landscape (${records.length}):*\n\n`;
        records.forEach(account => {
          const competitiveInfo = account.Competitive_Landscape__c || '';
          const preview = competitiveInfo.length > 100 ? competitiveInfo.substring(0, 100) + '...' : competitiveInfo;
          const ownerName = account.Owner?.Name || 'Unassigned';
          const needsReassignment = nonBLHolders.includes(ownerName);
          
          response += `• *${account.Name}*\n`;
          response += `  Owner: ${ownerName}${needsReassignment ? ' _(needs reassignment)_' : ''}\n`;
          if (preview) {
            response += `  _${preview}_\n`;
          }
          response += `\n`;
        });
        
        // Add summary at bottom - only include actual BLs
        const blOwners = [...new Set(records.map(r => r.Owner?.Name).filter(name => name && validBLs.includes(name)))];
        const needsReassignmentCount = records.filter(r => nonBLHolders.includes(r.Owner?.Name)).length;
        
        if (blOwners.length > 0) {
          response += `\n*BLs to reach out to:* ${blOwners.join(', ')}`;
        }
        if (needsReassignmentCount > 0) {
          response += `\n_${needsReassignmentCount} account${needsReassignmentCount > 1 ? 's need' : ' needs'} reassignment_`;
        }
      }
      break;

    case 'use_cases':
      // Check if it's a specific account query or product search
      if (parsedIntent.entities.accounts && parsedIntent.entities.accounts.length > 0) {
        // Specific account - show their product lines
        const accountName = records[0]?.Account?.Name || parsedIntent.entities.accounts[0];
        response = `*${accountName}*\n`;
        response += `Owner: ${records[0]?.Account?.Owner?.Name || 'Unknown'}\n\n`;
        response += `*Active Opportunities:*\n`;
        
        records.forEach(opp => {
          if (opp.Product_Line__c) {
            response += `${opp.Product_Line__c} - ${opp.StageName} (${formatCurrency(opp.Amount || 0)})\n`;
          } else {
            response += `${opp.Name} - ${opp.StageName}\n`;
          }
        });
        
        if (records.length === 0) {
          response += `No active opportunities found for ${accountName}`;
        }
      } else if (parsedIntent.entities.searchTerm) {
        // Product search - show account list
        const searchTerm = parsedIntent.entities.searchTerm;
        const accountMap = new Map();
        records.forEach(r => {
          const accountName = r.Account?.Name;
          if (accountName && !accountMap.has(accountName)) {
            accountMap.set(accountName, true);
          }
        });
        
        const accountNames = Array.from(accountMap.keys()).join(', ');
        response = `*Accounts with ${searchTerm} opportunities:*\n${accountNames}`;
      } else {
        // Generic response
        response = `*Accounts with Active Opportunities:*\n\n`;
        records.slice(0, 15).forEach(account => {
          response += `${account.Name} - ${account.Owner?.Name || 'Unassigned'}\n`;
        });
      }
      break;

    case 'decision_makers':
      if (records.length === 1 && parsedIntent.entities.accounts) {
        // Single account query - show just the answer
        const account = records[0];
        response = `*${account.Name}*\n`;
        if (account.Key_Decision_Makers__c) {
          response += `${account.Key_Decision_Makers__c}\n`;
        } else {
          response += `No decision makers information available\n`;
        }
        response += `Owner: ${account.Owner?.Name || 'Unassigned'}`;
      } else {
        // Multiple accounts
        response = `*Key Decision Makers*\n\n`;
        records.forEach(account => {
          if (account.Key_Decision_Makers__c) {
            response += `*${account.Name}*\n`;
            response += `${account.Key_Decision_Makers__c}\n`;
            response += `Owner: ${account.Owner?.Name || 'Unassigned'}\n\n`;
          }
        });
      }
      break;

    default:
      response = `*Results*\n\n`;
      records.forEach(account => {
        response += `${account.Name} - ${account.Owner?.Name || 'Unassigned'}\n`;
      });
  }

  return response;
}

/**
 * Format contract query results - organized by company, most recent first
 */
function formatContractResults(queryResult, parsedIntent) {
  // Companies with logo rights
  const LOGO_RIGHTS_COMPANIES = [
    'Pure Storage', 'Bayer', 'Dolby', 'Best Buy', 'The Weir Group',
    'The Wonderful Company', 'AES', 'Cox Media', 'CHS', 'Western Digital',
    'Fresh Del Monte', 'GE Vernova', 'Novelis', 'Asana', 'Tailored Brands',
    'PetSmart', 'Ecolab', 'Wealth Partners Capital Group', 'Delinea', 'BNY', 'Udemy'
  ];

  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const accountName = parsedIntent.entities.accounts?.[0];
    return accountName 
      ? `No contracts found for ${accountName}.`
      : `No contracts found in the system.`;
  }

  const records = queryResult.records;
  const accountName = parsedIntent.entities.accounts?.[0];
  const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
  
  // Group contracts by company
  const byCompany = {};
  records.forEach(contract => {
    const company = contract.Account?.Name || 'Unknown';
    if (!byCompany[company]) {
      byCompany[company] = [];
    }
    byCompany[company].push(contract);
  });
  
  // Sort each company's contracts by date (most recent first)
  Object.keys(byCompany).forEach(company => {
    byCompany[company].sort((a, b) => {
      const dateA = new Date(a.StartDate || a.CreatedDate || 0);
      const dateB = new Date(b.StartDate || b.CreatedDate || 0);
      return dateB - dateA; // Most recent first
    });
  });
  
  // Sort companies alphabetically
  const sortedCompanies = Object.keys(byCompany).sort();
  
  let response = accountName 
    ? `*Contracts for ${accountName}*\n`
    : `*Contracts by Company* (${records.length} total)\n`;
  
  // Build response grouped by company
  sortedCompanies.forEach(company => {
    const contracts = byCompany[company];
    const hasLogoRights = LOGO_RIGHTS_COMPANIES.some(c => 
      company.toLowerCase().includes(c.toLowerCase())
    );
    
    response += `\n*${company}*`;
    if (hasLogoRights) {
      response += ` [Logo Rights]`;
    }
    response += ` (${contracts.length})\n`;
    
    contracts.forEach((contract, i) => {
      const contractName = contract.Contract_Name_Campfire__c || contract.ContractNumber || `Contract ${i + 1}`;
      const contractType = contract.Contract_Type__c || '';
      const status = contract.Status || '';
      
      // Date range (compact format)
      let dateRange = '';
      if (contract.StartDate) {
        dateRange = formatDate(contract.StartDate);
        if (contract.EndDate) {
          dateRange += ` - ${formatDate(contract.EndDate)}`;
        }
      } else if (contract.ContractTerm) {
        dateRange = `${contract.ContractTerm}mo`;
      }
      
      // Build clean single line: "1. Name • Status • Dates PDF"
      response += `  ${i + 1}. ${contractName}`;
      if (status === 'Activated') response += ` • ${status}`;
      else if (status) response += ` • _${status}_`;
      if (dateRange) response += ` • ${dateRange}`;
      
      // PDF link (inline)
      if (contract._pdfs && contract._pdfs.length > 0) {
        const downloadUrl = `${sfBaseUrl}/sfc/servlet.shepherd/version/download/${contract._pdfs[0].versionId}`;
        response += ` <${downloadUrl}|PDF>`;
      }
      
      response += '\n';
    });
  });
  
  // Summary
  response += `\n---\n*${records.length} contracts* across *${sortedCompanies.length} companies*`;
  
  // Logo rights summary
  const companiesWithLogoRights = sortedCompanies.filter(company => 
    LOGO_RIGHTS_COMPANIES.some(c => company.toLowerCase().includes(c.toLowerCase()))
  );
  
  if (companiesWithLogoRights.length > 0) {
    response += `\n\n*Companies with Logo Rights:* ${companiesWithLogoRights.join(', ')}`;
  }

  return response;
}

/**
 * Format count query results
 */
function formatCountResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.records.length === 0) {
    return `Unable to calculate count. Please check your query.`;
  }

  const records = queryResult.records;
  const countType = parsedIntent.entities.countType;
  
  switch (countType) {
    case 'total_customers':
      const totalCount = records.length;
      const accountNames = records.map(r => r.Name).join(', ');
      return `*Total Customers: ${totalCount}*\n\n_Customers are accounts that have signed LOIs, ARR deals, or project agreements_\n\n*Accounts:*\n${accountNames}`;
    
    case 'arr_customers':
      const arrCount = records.length;
      const arrNames = records.map(r => r.Name).join(', ');
      return `*ARR Customers: ${arrCount}*\n\n_Accounts with recurring revenue contracts_\n\n*Accounts:*\n${arrNames}`;
    
    case 'loi_customers':
      const loiCustCount = records.length;
      const loiCustNames = records.map(r => r.Name).join(', ');
      return `*LOI Customers: ${loiCustCount}*\n\n_Accounts with signed LOIs_\n\n*Accounts:*\n${loiCustNames}`;
    
    case 'loi_accounts':
      const loiAcctCount = records.length;
      let loiResponse = `*LOIs Signed: ${loiAcctCount}*\n\n`;
      loiResponse += `_Accounts with signed letters of intent (Revenue_Type = Commitment)_\n\n`;
      records.forEach((r, i) => {
        const accountName = r.Account?.Name || 'Unknown';
        const owner = r.Account?.Owner?.Name || 'Unassigned';
        const acv = r.ACV__c ? `$${(r.ACV__c/1000).toFixed(0)}k` : 'N/A';
        const closeDate = r.CloseDate ? new Date(r.CloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        loiResponse += `${i+1}. *${accountName}* (${acv})\n   Signed: ${closeDate} | Owner: ${owner}\n\n`;
      });
      return loiResponse;
    
    case 'arr_contracts':
      const contractCount = records[0].ARRContractCount || 0;
      return `*ARR Contracts: ${contractCount}*\n\nClosed won opportunities with Revenue_Type = Recurring`;
    
    case 'loi_count':
      const loiCount = records[0].LOICount || 0;
      return `*Total LOIs Signed: ${loiCount}*\n\nClosed won opportunities with Revenue_Type = Commitment`;
    
    default:
      return `Count: ${records[0].Total || records[0].expr0 || 0}`;
  }
}

/**
 * Format weighted pipeline summary
 */
function formatWeightedSummary(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.records.length === 0) {
    return `No pipeline data available.`;
  }

  const records = queryResult.records;
  
  // Calculate totals
  let totalGross = 0;
  let totalWeighted = 0;
  let totalDeals = 0;
  
  records.forEach(r => {
    totalGross += r.GrossAmount || 0;
    totalWeighted += r.WeightedAmount || 0;
    totalDeals += r.DealCount || 0;
  });

  const avgDealSize = totalDeals > 0 ? totalGross / totalDeals : 0;

  const timeframe = parsedIntent.entities.timeframe;
  const title = timeframe ? `Weighted Pipeline (${timeframe.replace('_', ' ')})` : 'Weighted Pipeline Summary';

  let response = `*${title}*\n\n`;
  response += `Total Active Opportunities: ${totalDeals} deals\n`;
  response += `Gross Pipeline: ${formatCurrency(totalGross)}\n`;
  response += `Weighted Pipeline: ${formatCurrency(totalWeighted)}\n`;
  response += `Average Deal Size: ${formatCurrency(avgDealSize)}\n\n`;

  response += `*By Stage:*\n`;
  
  // Filter to active stages only and sort by stage order (4→3→2→1→0)
  const stageOrder = {
    'Stage 4 - Proposal': 1,
    'Stage 3 - Pilot': 2,
    'Stage 2 - SQO': 3,
    'Stage 1 - Discovery': 4,
    'Stage 0 - Qualifying': 5
  };
  
  const activeStages = records
    .filter(r => !r.StageName.includes('Closed'))
    .sort((a, b) => (stageOrder[a.StageName] || 999) - (stageOrder[b.StageName] || 999));

  activeStages.forEach(stage => {
    const stageName = cleanStageName(stage.StageName);
    const gross = stage.GrossAmount || 0;
    const weighted = stage.WeightedAmount || 0;
    const count = stage.DealCount || 0;
    
    response += `${stageName}: ${formatCurrency(weighted)} weighted (${formatCurrency(gross)} gross, ${count} deals)\n`;
  });

  return response;
}

/**
 * Format average days in stage results
 */
function formatAverageDaysResults(queryResult, parsedIntent) {
  // Default values from Days in Stage report
  const defaultAverages = {
    'Stage 0 - Qualifying': 46,
    'Stage 1 - Discovery': 34,
    'Stage 2 - SQO': 43,
    'Stage 3 - Pilot': 84,
    'Stage 4 - Proposal': 41
  };

  const stageName = parsedIntent.entities.stages?.[0] || 'that stage';
  
  if (!queryResult || !queryResult.records || queryResult.records.length === 0) {
    // Use default from report if calculation fails
    const defaultAvg = defaultAverages[stageName];
    if (defaultAvg) {
      return `*Average Days in ${stageName}*\n\n${defaultAvg} days (from reporting data)`;
    }
    return `Unable to calculate average. No deals found in that stage.`;
  }

  const record = queryResult.records[0];
  const avgDays = Math.round(record.AvgDays || record.expr0 || 0);
  const dealCount = record.DealCount || record.expr1 || 0;
  
  // If calculation returns 0, use default
  if (avgDays === 0 && defaultAverages[stageName]) {
    return `*Average Days in ${stageName}*\n\n${defaultAverages[stageName]} days (from reporting data)`;
  }
  
  return `*Average Days in ${stageName}*\n\n${avgDays} days (across ${dealCount} active deals)`;
}

/**
 * Format cross query results
 */
function formatCrossQueryResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    return `No results found for that cross-query. Try adjusting your criteria.`;
  }

  const records = queryResult.records;
  let response = `*Cross Query Results*\n\n`;

  records.forEach(record => {
    response += `*${record.Account?.Name || record.Name}*\n`;
    response += `Owner: ${record.Account?.Owner?.Name || record.Owner?.Name || 'Unassigned'}\n`;
    if (record.Amount) response += `Deal: ${record.Name} (${formatCurrency(record.Amount)})\n`;
    if (record.StageName) response += `Stage: ${record.StageName}\n`;
    response += '\n';
  });

  return response;
}

/**
 * Format currency for display
 */
function formatCurrency(amount) {
  if (!amount) return '0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount).replace('$', '');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'No date';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Handle Johnson Hana Excel Report Generation
 * Available to: Everyone (read-only operation, no Salesforce writes)
 * Allows: Users, workflows, scheduled messages
 */
async function handleJohnsonHanaExcelReport(userId, channelId, client, threadTs) {
  try {
    // Show loading message
    await client.chat.postMessage({
      channel: channelId,
      text: 'Generating Johnson Hana pipeline report... This will take a moment.',
      thread_ts: threadTs
    });
    
    // Import the report module
    const { sendPipelineReportToSlack } = require('./reportToSlack');
    
    // Generate and upload Johnson Hana specific Excel
    await sendPipelineReportToSlack(client, channelId, userId);
    
    logger.info(`✅ Johnson Hana Excel report sent to Slack by ${userId}`);
    
  } catch (error) {
    logger.error('Failed to send Johnson Hana Excel report:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error generating Johnson Hana report: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Full Pipeline Excel Report Generation
 * Available to: Everyone (read-only operation, no Salesforce writes)
 * Allows: Users, workflows, scheduled messages
 */
async function handleFullPipelineExcelReport(userId, channelId, client, threadTs) {
  try {
    // Show loading message
    await client.chat.postMessage({
      channel: channelId,
      text: 'Generating full active pipeline report... This will take a moment.',
      thread_ts: threadTs
    });
    
    // Import the full pipeline report module
    const { sendFullPipelineToSlack } = require('./fullPipelineReport');
    
    // Generate and upload full pipeline Excel
    await sendFullPipelineToSlack(client, channelId, userId);
    
    logger.info(`✅ Full pipeline Excel report sent to Slack by ${userId}`);
    
  } catch (error) {
    logger.error('Failed to send full pipeline Excel report:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error generating full pipeline report: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle BATCH Move to Nurture (Keigan only)
 * Moves multiple accounts to nurture and closes their opportunities
 */
async function handleBatchMoveToNurture(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Batch account management is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Please specify account names.\n\nExample: "batch nurture: Account1, Account2, Account3"',
        thread_ts: threadTs
      });
      return;
    }
    
    const accountNames = entities.accounts;
    
    // Send initial processing message
    await client.chat.postMessage({
      channel: channelId,
      text: `🔄 Processing batch nurture for ${accountNames.length} accounts...\n\n_${accountNames.join(', ')}_`,
      thread_ts: threadTs
    });
    
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    const results = [];
    
    for (const accountName of accountNames) {
      try {
        // Find account
        const escapeQuotes = (str) => str.replace(/'/g, "\\'");
        const accountQuery = `SELECT Id, Name, Owner.Name, Nurture__c, 
                                     (SELECT Id, Name, StageName, Amount FROM Opportunities WHERE IsClosed = false)
                              FROM Account
                              WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                              LIMIT 1`;
        
        const accountResult = await query(accountQuery);
        
        if (!accountResult || accountResult.totalSize === 0) {
          results.push({ account: accountName, status: 'not_found', message: 'Account not found' });
          continue;
        }
        
        const account = accountResult.records[0];
        const openOpps = account.Opportunities?.records || account.Opportunities || [];
        
        // Update account to nurture
        await conn.sobject('Account').update({
          Id: account.Id,
          Nurture__c: true
        });
        
        // Close all open opportunities
        let oppsClosed = 0;
        if (Array.isArray(openOpps) && openOpps.length > 0) {
          // NOTE: Only set StageName - IsClosed/IsWon are read-only fields auto-calculated by Salesforce
          const updates = openOpps.map(opp => ({
            Id: opp.Id,
            StageName: 'Closed Lost'
          }));
          
          const oppResults = await conn.sobject('Opportunity').update(updates);
          const oppResultsArray = Array.isArray(oppResults) ? oppResults : [oppResults];
          
          // Log any failures with details for debugging
          oppResultsArray.forEach((result, idx) => {
            if (!result.success) {
              logger.error('Opportunity update failed during batch nurture:', {
                account: account.Name,
                oppId: updates[idx]?.Id,
                errors: result.errors,
                errorMessages: result.errors?.map(e => e.message).join(', ')
              });
            }
          });
          
          oppsClosed = oppResultsArray.filter(r => r.success).length;
          const oppsFailed = oppResultsArray.length - oppsClosed;
          
          if (oppsFailed > 0) {
            logger.warn(`Batch nurture: ${oppsFailed}/${openOpps.length} opp updates failed for ${account.Name}`);
          }
        }
        
        results.push({ 
          account: account.Name, 
          status: 'success', 
          oppsClosed,
          oppsTotal: openOpps.length,
          message: `Moved to nurture, ${oppsClosed} opp(s) closed`
        });
        
      } catch (error) {
        results.push({ account: accountName, status: 'error', message: error.message });
      }
    }
    
    // Format summary
    const successCount = results.filter(r => r.status === 'success').length;
    const totalOppsClosed = results.reduce((sum, r) => sum + (r.oppsClosed || 0), 0);
    
    let summary = `✅ *Batch Nurture Complete*\n\n`;
    summary += `*Summary:* ${successCount}/${accountNames.length} accounts processed\n`;
    summary += `*Opportunities Closed:* ${totalOppsClosed}\n\n`;
    summary += `*Details:*\n`;
    
    results.forEach(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'not_found' ? '❓' : '❌';
      summary += `${icon} *${r.account}* - ${r.message}\n`;
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: summary,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Batch nurture: ${successCount}/${accountNames.length} accounts, ${totalOppsClosed} opps closed by ${userId}`);
    
  } catch (error) {
    logger.error('Batch nurture failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Batch nurture failed: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle BATCH Account Reassignment (Keigan only)
 * Reassigns multiple accounts to a specific BL
 */
async function handleBatchReassignAccounts(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Batch account management is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Please specify account names.\n\nExample: "batch reassign: Account1, Account2, Account3 to Julie"',
        thread_ts: threadTs
      });
      return;
    }
    
    if (!entities.targetBL) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Please specify a target BL.\n\nExample: "batch reassign: Account1, Account2 to Julie"',
        thread_ts: threadTs
      });
      return;
    }
    
    const accountNames = entities.accounts;
    const targetBLInput = entities.targetBL;
    
    // Validate target BL - US and EU Pods
    const businessLeads = [
      // US Pod
      'Asad Hussain', 'Himanshu Agarwal', 'Julie Stefanich', 'Olivia Jung', 'Ananth Cherukupally', 'Justin Hills',
      // EU Pod
      'Greg MacHale', 'Nathan Shine', 'Tom Clancy', 'Conor Molloy', 'Alex Fox', 'Nicola Fratini', 'Emer Flynn', 'Riona McHale'
    ];
    const blNameMap = {
      // US Pod
      'julie': 'Julie Stefanich',
      'himanshu': 'Himanshu Agarwal',
      'asad': 'Asad Hussain',
      'ananth': 'Ananth Cherukupally',
      'olivia': 'Olivia Jung',
      'justin': 'Justin Hills',
      // EU Pod
      'greg': 'Greg MacHale',
      'nathan': 'Nathan Shine',
      'tom': 'Tom Clancy',
      'conor': 'Conor Molloy',
      'alex': 'Alex Fox',
      'nicola': 'Nicola Fratini',
      'emer': 'Emer Flynn',
      'riona': 'Riona McHale'
    };
    
    const validBL = blNameMap[targetBLInput.toLowerCase()] || 
                   businessLeads.find(bl => bl.toLowerCase().includes(targetBLInput.toLowerCase()));
    
    if (!validBL) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ "${targetBLInput}" is not a valid BL.\n\n*Valid BLs:* ${businessLeads.join(', ')}`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Find target BL's Salesforce User ID
    const userQuery = `SELECT Id, Name FROM User WHERE Name LIKE '%${validBL.split(' ')[0]}%' AND IsActive = true LIMIT 1`;
    const userResult = await query(userQuery);
    
    if (!userResult || userResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Could not find Salesforce user for "${validBL}"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const targetUserId = userResult.records[0].Id;
    
    // Send initial processing message
    await client.chat.postMessage({
      channel: channelId,
      text: `🔄 Processing batch reassignment of ${accountNames.length} accounts to *${validBL}*...\n\n_${accountNames.join(', ')}_`,
      thread_ts: threadTs
    });
    
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    const results = [];
    
    for (const accountName of accountNames) {
      try {
        // Find account
        const escapeQuotes = (str) => str.replace(/'/g, "\\'");
        const accountQuery = `SELECT Id, Name, OwnerId, Owner.Name,
                                     (SELECT Id, OwnerId FROM Opportunities WHERE IsClosed = false)
                              FROM Account
                              WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                              LIMIT 1`;
        
        const accountResult = await query(accountQuery);
        
        if (!accountResult || accountResult.totalSize === 0) {
          results.push({ account: accountName, status: 'not_found', message: 'Account not found' });
          continue;
        }
        
        const account = accountResult.records[0];
        const oldOwner = account.Owner?.Name || 'Unknown';
        const openOpps = account.Opportunities?.records || account.Opportunities || [];
        
        // Update account owner
        await conn.sobject('Account').update({
          Id: account.Id,
          OwnerId: targetUserId
        });
        
        // Update all open opportunities' owner
        let oppsUpdated = 0;
        if (Array.isArray(openOpps) && openOpps.length > 0) {
          const updates = openOpps.map(opp => ({
            Id: opp.Id,
            OwnerId: targetUserId
          }));
          
          const oppResults = await conn.sobject('Opportunity').update(updates);
          const oppResultsArray = Array.isArray(oppResults) ? oppResults : [oppResults];
          oppsUpdated = oppResultsArray.filter(r => r.success).length;
        }
        
        results.push({ 
          account: account.Name, 
          status: 'success', 
          oldOwner,
          oppsUpdated,
          message: `${oldOwner} → ${validBL}, ${oppsUpdated} opp(s)`
        });
        
      } catch (error) {
        results.push({ account: accountName, status: 'error', message: error.message });
      }
    }
    
    // Format summary
    const successCount = results.filter(r => r.status === 'success').length;
    const totalOppsUpdated = results.reduce((sum, r) => sum + (r.oppsUpdated || 0), 0);
    
    let summary = `✅ *Batch Reassignment Complete*\n\n`;
    summary += `*Target:* ${validBL}\n`;
    summary += `*Accounts Processed:* ${successCount}/${accountNames.length}\n`;
    summary += `*Opportunities Transferred:* ${totalOppsUpdated}\n\n`;
    summary += `*Details:*\n`;
    
    results.forEach(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'not_found' ? '❓' : '❌';
      summary += `${icon} *${r.account}* - ${r.message}\n`;
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: summary,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Batch reassign: ${successCount}/${accountNames.length} accounts to ${validBL}, ${totalOppsUpdated} opps transferred by ${userId}`);
    
  } catch (error) {
    logger.error('Batch reassignment failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Batch reassignment failed: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle MULTI-LINE BATCH Account Reassignment (Keigan only)
 * Processes format: "Asad - Southwest, DHL, HSBC\nJustin - Home Depot, AES"
 * Reassigns both account owners AND open opportunity owners
 */
async function handleMultiBatchReassign(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  // Valid BL names (first names) - US and EU Pods
  const VALID_BLS = {
    // US Pod
    'asad': 'Asad Hussain',
    'justin': 'Justin Hills',
    'olivia': 'Olivia Jung',
    'ananth': 'Ananth Cherukupally',
    'himanshu': 'Himanshu Agarwal',
    'julie': 'Julie Stefanich',
    // EU Pod
    'greg': 'Greg MacHale',
    'nathan': 'Nathan Shine',
    'tom': 'Tom Clancy',
    'conor': 'Conor Molloy',
    'alex': 'Alex Fox',
    'nicola': 'Nicola Fratini',
    'emer': 'Emer Flynn',
    'riona': 'Riona McHale',
    // Other
    'zoila': 'Zoila Mena Harpin'
  };
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Bulk account reassignment is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    const { batchAssignments } = entities;
    
    if (!batchAssignments || batchAssignments.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'No valid assignments found.\n\nExpected format:\n```Asad - Southwest, DHL, HSBC\nJustin - Home Depot, AES, Nielsen```',
        thread_ts: threadTs
      });
      return;
    }
    
    // Send initial processing message
    const totalAccounts = batchAssignments.reduce((sum, b) => sum + b.accounts.length, 0);
    await client.chat.postMessage({
      channel: channelId,
      text: `🔄 Processing multi-batch reassignment:\n\n${batchAssignments.map(b => `• *${b.targetBL}*: ${b.accounts.join(', ')}`).join('\n')}\n\n_${totalAccounts} total accounts across ${batchAssignments.length} BLs..._`,
      thread_ts: threadTs
    });
    
    const { getConnection } = require('../salesforce/connection');
    const conn = await getConnection();
    
    // Get all user IDs upfront
    const userQuery = "SELECT Id, Name FROM User WHERE IsActive = true AND Name LIKE '%'";
    const usersResult = await conn.query(userQuery);
    const userMap = {};
    usersResult.records.forEach(u => {
      userMap[u.Name.toLowerCase()] = u.Id;
      // Also map by first name
      const firstName = u.Name.split(' ')[0].toLowerCase();
      if (!userMap[firstName]) userMap[firstName] = u.Id;
    });
    
    let overallResults = [];
    
    for (const assignment of batchAssignments) {
      const targetBLName = assignment.targetBL;
      const accountNames = assignment.accounts;
      
      // Validate BL name
      const blKey = targetBLName.toLowerCase();
      const fullBLName = VALID_BLS[blKey] || targetBLName;
      const targetUserId = userMap[fullBLName.toLowerCase()] || userMap[blKey];
      
      if (!targetUserId) {
        overallResults.push({
          bl: targetBLName,
          status: 'error',
          message: `Unknown BL: ${targetBLName}`,
          accounts: accountNames
        });
        continue;
      }
      
      let successCount = 0;
      let oppsUpdated = 0;
      let errors = [];
      
      for (const accountName of accountNames) {
        try {
          // Find account with fuzzy match
          const searchQuery = `SELECT Id, Name, OwnerId, Owner.Name,
                               (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false)
                               FROM Account 
                               WHERE Name LIKE '%${accountName.replace(/'/g, "\\'")}%'
                               LIMIT 5`;
          
          const searchResult = await conn.query(searchQuery);
          
          if (!searchResult.records || searchResult.records.length === 0) {
            errors.push(`${accountName}: not found`);
            continue;
          }
          
          // Find best match
          const account = searchResult.records.find(a => 
            a.Name.toLowerCase().includes(accountName.toLowerCase()) ||
            accountName.toLowerCase().includes(a.Name.toLowerCase().split(' ')[0])
          ) || searchResult.records[0];
          
          // Update account owner
          await conn.sobject('Account').update({
            Id: account.Id,
            OwnerId: targetUserId
          });
          
          // Update all open opportunities
          const openOpps = account.Opportunities?.records || [];
          if (openOpps.length > 0) {
            const oppUpdates = openOpps.map(opp => ({
              Id: opp.Id,
              OwnerId: targetUserId
            }));
            await conn.sobject('Opportunity').update(oppUpdates);
            oppsUpdated += openOpps.length;
          }
          
          successCount++;
        } catch (err) {
          errors.push(`${accountName}: ${err.message}`);
        }
      }
      
      overallResults.push({
        bl: fullBLName,
        status: 'complete',
        successCount,
        totalAccounts: accountNames.length,
        oppsUpdated,
        errors
      });
    }
    
    // Build summary message
    let summary = `✅ *Multi-Batch Reassignment Complete*\n\n`;
    
    for (const result of overallResults) {
      if (result.status === 'error') {
        summary += `❌ *${result.bl}*: ${result.message}\n`;
      } else {
        summary += `✓ *${result.bl}*: ${result.successCount}/${result.totalAccounts} accounts, ${result.oppsUpdated} opps\n`;
        if (result.errors.length > 0) {
          summary += `  _Errors: ${result.errors.slice(0, 3).join(', ')}${result.errors.length > 3 ? '...' : ''}_\n`;
        }
      }
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: summary,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Multi-batch reassign completed by ${userId}`);
    
  } catch (error) {
    logger.error('Multi-batch reassignment failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Multi-batch reassignment failed: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Move to Nurture (Keigan only)
 */
async function handleMoveToNurture(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Account management is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    // Extract account name
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Please specify an account name.\n\nExample: "move Test Company to nurture"',
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    
    // Query account with fuzzy matching
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, Nurture__c, 
                                 (SELECT Id, Name, StageName, Amount, IsClosed FROM Opportunities WHERE IsClosed = false)
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'nurture'),
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    // Salesforce subqueries return { records: [...] } or null - extract properly
    const openOpps = account.Opportunities?.records || account.Opportunities || [];
    
    logger.info(`📋 Nurture move: Found ${Array.isArray(openOpps) ? openOpps.length : 0} open opportunities for ${account.Name}`);
    
    // Update account to nurture AND close all opportunities as lost
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    // Step 1: Update account nurture flag
    await conn.sobject('Account').update({
      Id: account.Id,
      Nurture__c: true
    });
    
    // Step 2: Close all open opportunities as lost
    let successCount = 0;
    let failCount = 0;
    let results = null;
    
    if (openOpps.length > 0) {
      // NOTE: Only set StageName - IsClosed/IsWon are read-only fields auto-calculated by Salesforce
      const updates = openOpps.map(opp => ({
        Id: opp.Id,
        StageName: 'Closed Lost'
      }));
      
      results = await conn.sobject('Opportunity').update(updates);
      
      // Handle both single result and array of results
      const resultsArray = Array.isArray(results) ? results : [results];
      
      // Log any failures with details for debugging
      resultsArray.forEach((result, idx) => {
        if (!result.success) {
          logger.error('Opportunity update failed during move to nurture:', {
            account: account.Name,
            oppId: updates[idx]?.Id,
            errors: result.errors,
            errorMessages: result.errors?.map(e => e.message).join(', ')
          });
        }
      });
      
      successCount = resultsArray.filter(r => r.success).length;
      failCount = resultsArray.length - successCount;
    }
    
    // Format confirmation
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    let confirmMessage = `✅ *${account.Name}* moved to Nurture\n\n`;
    confirmMessage += `*Account Details:*\n`;
    confirmMessage += `Owner: ${account.Owner?.Name}\n`;
    confirmMessage += `Nurture: Yes\n`;
    
    if (openOpps.length > 0) {
      confirmMessage += `\n*Opportunities Closed as Lost:* ${successCount}/${openOpps.length}\n`;
      if (failCount > 0) {
        confirmMessage += `⚠️  ${failCount} failed to close (check Salesforce)\n`;
      }
      confirmMessage += `\n*Closed Opportunities:*\n`;
      openOpps.forEach((opp, i) => {
        const resultsArray = Array.isArray(results) ? results : [results];
        const success = resultsArray[i]?.success ? '✅' : '❌';
        const amount = opp.Amount ? `$${(opp.Amount / 1000).toFixed(0)}K` : 'N/A';
        confirmMessage += `${success} ${opp.Name} (${amount}) → Closed Lost\n`;
      });
    } else {
      confirmMessage += `\n*No open opportunities to close*\n`;
    }
    
    confirmMessage += `\n<${accountUrl}|View Account in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account moved to nurture: ${account.Name}, ${successCount} opps closed by ${userId}`);
    
  } catch (error) {
    logger.error('Failed to move account to nurture:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error moving account to nurture: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Close Account Lost (Keigan only)
 */
async function handleCloseAccountLost(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Account management is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    // Extract account name
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: 'Please specify an account name.\n\nExample: "close Test Company as lost because pricing too high"',
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    const lossReason = entities.lossReason || 'No longer pursuing';
    
    // Query account with open opportunities
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name,
                                 (SELECT Id, Name, StageName, Amount, ACV__c, IsClosed, IsWon FROM Opportunities WHERE IsClosed = false)
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'nurture'),
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    // Salesforce subqueries return { records: [...] } or null - extract properly
    const openOpps = account.Opportunities?.records || account.Opportunities || [];
    
    logger.info(`📋 Close Lost: Found ${Array.isArray(openOpps) ? openOpps.length : 0} open opportunities for ${account.Name}`);
    
    if (!Array.isArray(openOpps) || openOpps.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `⚠️  *${account.Name}* has no open opportunities to close.\n\nAccount Owner: ${account.Owner?.Name}\n\nNo action taken.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Close all open opportunities as lost
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    // NOTE: Only set StageName - IsClosed/IsWon are read-only fields auto-calculated by Salesforce
    const updates = openOpps.map(opp => ({
      Id: opp.Id,
      StageName: 'Closed Lost'
    }));
    
    const results = await conn.sobject('Opportunity').update(updates);
    
    // Handle both single result and array of results
    const resultsArray = Array.isArray(results) ? results : [results];
    
    // Log any failures with details for debugging
    resultsArray.forEach((result, idx) => {
      if (!result.success) {
        logger.error('Opportunity update failed during close lost:', {
          account: account.Name,
          oppId: updates[idx]?.Id,
          errors: result.errors,
          errorMessages: result.errors?.map(e => e.message).join(', ')
        });
      }
    });
    
    // Count successes
    const successCount = resultsArray.filter(r => r.success).length;
    const failCount = resultsArray.length - successCount;
    
    // Format confirmation
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    let confirmMessage = `✅ *Closed Lost: ${account.Name}*\n\n`;
    confirmMessage += `*Results:*\n`;
    confirmMessage += `• ${successCount} opportunities closed as lost\n`;
    if (failCount > 0) {
      confirmMessage += `• ${failCount} failed (check Salesforce)\n`;
    }
    confirmMessage += `\n*Loss Reason:* ${lossReason}\n`;
    confirmMessage += `\n*Closed Opportunities:*\n`;
    
    openOpps.forEach((opp, i) => {
      const resultsArray = Array.isArray(results) ? results : [results];
      const success = resultsArray[i]?.success ? '✅' : '❌';
      const amount = opp.Amount ? `$${(opp.Amount / 1000).toFixed(0)}K` : 'N/A';
      confirmMessage += `${success} ${opp.Name} (${amount}) → Closed Lost\n`;
    });
    
    confirmMessage += `\n<${accountUrl}|View Account in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account closed lost: ${account.Name}, ${successCount} opps closed by ${userId}`);
    
  } catch (error) {
    logger.error('Failed to close account lost:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error closing opportunities: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Plan Save (All users can save)
 */
async function handleAccountPlanSave(message, userId, channelId, client, threadTs) {
  try {
    // Parse the structured account plan
    // Expected format:
    // add account plan for [Company]:
    // CLO engagement: [text]
    // Budget holder: [text]
    // Champion(s): [text]
    // Use case(s): [text]
    // Why Eudia: [text]
    // Why now: [text]
    // Why at all: [text]
    
    // Clean message
    let content = message
      .replace(/@gtm-brain/gi, '')
      .replace(/add account plan/gi, '')
      .replace(/save account plan/gi, '')
      .replace(/update account plan/gi, '')
      .trim();
    
    // Extract account name (first line or before colon)
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length < 2) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please use the account plan template:\n\n*Format:*\n\`\`\`\nadd account plan for [Company Name]:\nCLO engagement: [details]\nBudget holder: [name]\nChampion(s): [names]\nUse case(s): [details]\nWhy Eudia: [reason]\nWhy now: [timing]\nWhy at all: [value prop]\n\`\`\`\n\n_Will be saved with numbered sections in Salesforce_`,
        thread_ts: threadTs
      });
      return;
    }
    
    // First line should contain account name
    let accountName = lines[0]
      .replace(/for/gi, '')
      .replace(/:/g, '')
      .trim();
    
    // Parse structured fields
    const planData = {};
    lines.slice(1).forEach(line => {
      if (line.toLowerCase().includes('clo engagement:')) {
        planData.clo = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('budget holder:')) {
        planData.budget = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('champion')) {
        planData.champions = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('use case')) {
        planData.useCases = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('why eudia:')) {
        planData.whyEudia = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('why now:')) {
        planData.whyNow = line.split(':').slice(1).join(':').trim();
      } else if (line.toLowerCase().includes('why at all:')) {
        planData.whyAtAll = line.split(':').slice(1).join(':').trim();
      }
    });
    
    // Validate we have at least some data
    const fieldCount = Object.keys(planData).length;
    if (fieldCount < 3) {
      await client.chat.postMessage({
        channel: channelId,
        text: `⚠️  Account plan incomplete. Please include at least 3 fields:\n• CLO engagement\n• Budget holder\n• Champion(s)\n• Use case(s)\n• Why Eudia\n• Why now\n• Why at all\n\n_Fields will be numbered automatically (1, 2, 3...)_`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Find account in Salesforce
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, Account_Plan_s__c
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'nurture'),
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    
    // Format the account plan (plain text for Salesforce - no markdown)
    const date = new Date();
    const dateFormatted = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    
    // Get user info for attribution
    let userName = 'User';
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (e) {
      logger.warn('Could not fetch user info for account plan');
    }
    
    // Clean function to remove trailing underscores and extra whitespace
    const cleanText = (text) => {
      return text
        .replace(/_+$/gm, '')  // Remove trailing underscores
        .replace(/\s+_/g, '')   // Remove space+underscore
        .trim();
    };
    
    // Plain text formatting (Salesforce doesn't render markdown)
    // Clean, numbered format with sentence case
    let formattedPlan = `Account Plan - Last updated: ${dateFormatted} by ${userName}\n\n`;
    
    let sectionNum = 1;
    if (planData.clo) {
      formattedPlan += `${sectionNum}. CLO engagement:\n${cleanText(planData.clo)}\n\n`;
      sectionNum++;
    }
    if (planData.budget) {
      formattedPlan += `${sectionNum}. Budget holder:\n${cleanText(planData.budget)}\n\n`;
      sectionNum++;
    }
    if (planData.champions) {
      formattedPlan += `${sectionNum}. Champion(s):\n${cleanText(planData.champions)}\n\n`;
      sectionNum++;
    }
    if (planData.useCases) {
      formattedPlan += `${sectionNum}. Use case(s):\n${cleanText(planData.useCases)}\n\n`;
      sectionNum++;
    }
    if (planData.whyEudia) {
      formattedPlan += `${sectionNum}. Why Eudia:\n${cleanText(planData.whyEudia)}\n\n`;
      sectionNum++;
    }
    if (planData.whyNow) {
      formattedPlan += `${sectionNum}. Why now:\n${cleanText(planData.whyNow)}\n\n`;
      sectionNum++;
    }
    if (planData.whyAtAll) {
      formattedPlan += `${sectionNum}. Why at all:\n${cleanText(planData.whyAtAll)}`;
    }
    
    // Update Salesforce
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    await conn.sobject('Account').update({
      Id: account.Id,
      Account_Plan_s__c: formattedPlan
    });
    
    // Confirm to user - CONCISE (no text repetition)
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    // Reuse fieldCount from validation above
    let confirmMessage = `✅ *Account Plan saved for ${account.Name}*\n\n`;
    confirmMessage += `${fieldCount} sections saved • Last updated: ${dateFormatted} by ${userName}\n\n`;
    confirmMessage += `<${accountUrl}|View in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account plan saved for ${account.Name} by ${userName}`);
    
  } catch (error) {
    logger.error('Failed to save account plan:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error saving account plan: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Plan Query
 */
async function handleAccountPlanQuery(entities, userId, channelId, client, threadTs) {
  try {
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an account name.\n\n*Examples:*\n• "What's the account plan for Intel?"\n• "Show me Apple's account plan"\n• "Get account plan for Microsoft"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    
    // Query Salesforce
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, Account_Plan_s__c
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'nurture'),
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    
    // Check if account plan exists
    if (!account.Account_Plan_s__c || account.Account_Plan_s__c.trim().length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `*${account.Name}*\n\n⚠️  No account plan found.\n\nOwner: ${account.Owner?.Name}\n\nCreate one with:\n\`\`\`\nadd account plan for ${account.Name}:\nCLO engagement: [details]\nBudget holder: [name]\nChampion(s): [names]\nUse case(s): [details]\nWhy Eudia: [reason]\nWhy now: [timing]\nWhy at all: [value prop]\n\`\`\`\n\n_Note: Format will be numbered automatically in Salesforce_`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Return the account plan (format for Slack display)
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    // Format plan text for Slack display (add bold to numbered sections)
    let planText = account.Account_Plan_s__c;
    
    // Bold the numbered headers (1. CLO engagement: → *1. CLO engagement:*)
    planText = planText
      .replace(/^(\d+\. (?:CLO engagement|Budget holder|Champion\(s\)|Use case\(s\)|Why Eudia|Why now|Why at all):)/gm, '*$1*')
      .replace(/^(Account Plan - Last updated:.*?)$/m, '_$1_');
    
    let response = `*Account Plan: ${account.Name}*\n\n`;
    response += planText;
    response += `\n\n*Account Owner:* ${account.Owner?.Name}`;
    response += `\n<${accountUrl}|View in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account plan retrieved for ${account.Name} by user ${userId}`);
    
  } catch (error) {
    logger.error('Failed to retrieve account plan:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error retrieving account plan: ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Existence Check
 */
async function handleAccountExistenceCheck(entities, userId, channelId, client, threadTs) {
  try {
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an account name.\n\n*Example:* "does Intel exist?"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    
    // COMPREHENSIVE fuzzy matching (same as "who owns" query)
    const normalizedSearch = accountName.trim();
    const withoutThe = normalizedSearch.replace(/^the\s+/i, '');
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    
    const withHyphen = normalizedSearch.replace(/\s/g, '-');
    const withoutHyphen = normalizedSearch.replace(/-/g, ' ');
    const withAmpersand = normalizedSearch.replace(/\sand\s/gi, ' & ');
    const withoutAmpersand = normalizedSearch.replace(/\s&\s/g, ' and ');
    
    const searchConditions = [
      `Name = '${escapeQuotes(normalizedSearch)}'`,
      `Name = '${escapeQuotes(withoutThe)}'`,
      `Name = 'The ${escapeQuotes(withoutThe)}'`,
      `Name = '${escapeQuotes(withHyphen)}'`,
      `Name = '${escapeQuotes(withoutHyphen)}'`,
      `Name = '${escapeQuotes(withAmpersand)}'`,
      `Name = '${escapeQuotes(withoutAmpersand)}'`,
      `Name LIKE '%${escapeQuotes(normalizedSearch)}%'`
    ].filter((v, i, a) => a.indexOf(v) === i);
    
    const accountQuery = `SELECT Id, Name, Owner.Name, Owner.Email
                          FROM Account
                          WHERE (${searchConditions.join(' OR ')})
                          ORDER BY Name
                          LIMIT 5`;
    
    const result = await query(accountQuery);
    
    if (!result || result.totalSize === 0) {
      // Account does NOT exist - CLEAN response (no X emoji)
      await client.chat.postMessage({
        channel: channelId,
        text: `Account "${accountName}" does not exist in Salesforce.\n\nSearched with fuzzy matching (hyphens, apostrophes, "The" prefix, etc.) - no matches found.\n\nReply "create ${accountName} and assign to BL" to create it with auto-assignment.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Account EXISTS
    const businessLeads = [
      // US Pod
      'Asad Hussain', 'Himanshu Agarwal', 'Julie Stefanich', 'Olivia Jung', 'Ananth Cherukupally', 'Justin Hills',
      // EU Pod
      'Greg MacHale', 'Nathan Shine', 'Tom Clancy', 'Conor Molloy', 'Alex Fox', 'Nicola Fratini', 'Emer Flynn', 'Riona McHale'
    ];
    const account = result.records[0];
    const isBL = businessLeads.includes(account.Owner?.Name);
    
    let response = `Account "${account.Name}" exists in Salesforce.\n\n`;
    response += `Current owner: ${account.Owner?.Name || 'Unassigned'}`;
    
    if (isBL) {
      response += ` (Business Lead)`;
    } else {
      response += ` (Not a Business Lead)`;
    }
    
    response += `\nEmail: ${account.Owner?.Email || 'No email'}`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`Account existence check: ${account.Name} - exists (owner: ${account.Owner?.Name})`);
    
  } catch (error) {
    logger.error('Account existence check failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error checking account: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Creation with Auto-Assignment (Keigan only)
 */
async function handleCreateAccount(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Account creation is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an account name.\n\n*Example:* "create Intel and assign to BL"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const companyName = entities.accounts[0];
    
    // Show loading message
    await client.chat.postMessage({
      channel: channelId,
      text: `🔍 Creating account for ${companyName}...\n\n_Checking for duplicates, enriching data, assigning to BL_`,
      thread_ts: threadTs
    });
    
    // Use comprehensive account creation service with full logging
    const { createAccountWithEnrichment } = require('../services/accountCreation');
    const result = await createAccountWithEnrichment(companyName, userId);
    
    // Handle duplicate
    if (result.duplicate) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Account already exists: "${result.existingAccount.Name}"\n\nOwner: ${result.existingAccount.Owner?.Name}\n\nNo duplicate created.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Build confirmation from comprehensive result
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${result.accountId}/view`;
    
    // Show what was enriched
    const enrichedFields = [];
    if (result.verifiedAccount.Website) enrichedFields.push(`Website: ${result.verifiedAccount.Website}`);
    if (result.verifiedAccount.Linked_in_URL__c) enrichedFields.push(`LinkedIn: ${result.verifiedAccount.Linked_in_URL__c}`);
    if (result.verifiedAccount.Rev_MN__c) enrichedFields.push(`Revenue: $${result.verifiedAccount.Rev_MN__c}M`);
    if (result.verifiedAccount.State__c) enrichedFields.push(`State: ${result.verifiedAccount.State__c}`);
    if (result.verifiedAccount.Region__c) enrichedFields.push(`Region: ${result.verifiedAccount.Region__c}`);
    
    let confirmMessage = `Account created: ${result.verifiedAccount.Name}\n\n`;
    confirmMessage += `Assigned to: ${result.assignment.assignedTo}\n\n`;
    
    if (enrichedFields.length > 0) {
      confirmMessage += `Enriched data:\n${enrichedFields.map(f => '• ' + f).join('\n')}\n\n`;
    } else {
      confirmMessage += `Note: No enrichment data available\n\n`;
    }
    
    confirmMessage += `HQ: ${result.assignment.reasoning.hqLocation}\n`;
    confirmMessage += `Salesforce Region: ${result.assignment.sfRegion}\n`;
    confirmMessage += `Current coverage: ${result.assignment.assignedTo} has ${result.assignment.reasoning.activeOpportunities} active opps, ${result.assignment.reasoning.closingThisMonth} closing this month\n\n`;
    confirmMessage += `<${accountUrl}|View in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account creation complete: ${result.verifiedAccount.Name}`);
    
  } catch (error) {
    logger.error('❌ Account creation failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error creating account: ${error.message}\n\nCheck Render logs for details.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Reassignment (Keigan only)
 */
async function handleReassignAccountNEW(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // STEP 0: Check if account already exists (DUPLICATE DETECTION)
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    
    // Use same fuzzy matching as "who owns" query
    const normalizedSearch = companyName.trim();
    const withoutThe = normalizedSearch.replace(/^the\s+/i, '');
    const withHyphen = normalizedSearch.replace(/\s/g, '-');
    const withoutHyphen = normalizedSearch.replace(/-/g, ' ');
    const withAmpersand = normalizedSearch.replace(/\sand\s/gi, ' & ');
    
    const duplicateCheckConditions = [
      `Name = '${escapeQuotes(normalizedSearch)}'`,
      `Name = '${escapeQuotes(withoutThe)}'`,
      `Name = 'The ${escapeQuotes(withoutThe)}'`,
      `Name = '${escapeQuotes(withHyphen)}'`,
      `Name = '${escapeQuotes(withoutHyphen)}'`,
      `Name = '${escapeQuotes(withAmpersand)}'`,
      `Name LIKE '%${escapeQuotes(normalizedSearch)}%'`
    ].filter((v, i, a) => a.indexOf(v) === i);
    
    const duplicateQuery = `SELECT Id, Name, Owner.Name FROM Account WHERE (${duplicateCheckConditions.join(' OR ')}) LIMIT 1`;
    const duplicateResult = await query(duplicateQuery);
    
    if (duplicateResult && duplicateResult.totalSize > 0) {
      const existing = duplicateResult.records[0];
      await client.chat.postMessage({
        channel: channelId,
        text: `Account already exists: "${existing.Name}"\n\nOwner: ${existing.Owner?.Name}\n\nNo duplicate created. Use existing account.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Show loading message
    await client.chat.postMessage({
      channel: channelId,
      text: `🔍 Enriching company data for ${companyName}...\n\n_This may take a few seconds_`,
      thread_ts: threadTs
    });
    
    // Step 1: Enrich company data via Clay
    const { enrichCompanyData } = require('../services/clayEnrichment');
    const enrichment = await enrichCompanyData(companyName);
    
    // DEBUG: Log enrichment result
    logger.info('Enrichment result:', {
      companyName: enrichment.companyName,
      hasWebsite: !!enrichment.website,
      hasLinkedIn: !!enrichment.linkedIn,
      hasRevenue: !!enrichment.revenue,
      hasHQ: !!enrichment.headquarters?.state || !!enrichment.headquarters?.country,
      source: enrichment.source
    });
    
    // Step 2: Determine BL assignment
    const { determineAccountAssignment } = require('../services/accountAssignment');
    const assignment = await determineAccountAssignment(enrichment.headquarters);
    
    // Handle assignment notes for international accounts
    let assignmentNote = '';
    if (assignment.sfRegion === 'International' && assignment.assignedTo === 'Keigan Pesenti') {
      assignmentNote = '\n\nNote: Account ready for assignment to Johnson Hana Business Lead (not yet in system).\n';
    }
    
    // SPECIAL CASE: GTM Test Company  
    if (companyName.toLowerCase().includes('gtm test') || companyName.toLowerCase().includes('test company')) {
      assignment.region = 'West Coast (Test)';
      assignment.sfRegion = 'West';
      assignment.reasoning.hqLocation = 'San Francisco, CA';
    }
    
    // Step 3: Create account in Salesforce with CORRECT field mappings
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    // Map industry to Industry_Grouping__c picklist values
    const industryMapping = {
      'financial services': 'Financial Services & Insurance',
      'insurance': 'Financial Services & Insurance',
      'healthcare': 'Healthcare & Pharmaceuticals',
      'pharmaceutical': 'Healthcare & Pharmaceuticals',
      'technology': 'Technology & Software',
      'software': 'Technology & Software',
      'retail': 'Retail & Consumer Goods',
      'consumer': 'Retail & Consumer Goods',
      'manufacturing': 'Industrial & Manufacturing',
      'industrial': 'Industrial & Manufacturing',
      'energy': 'Energy & Utilities',
      'utilities': 'Energy & Utilities',
      'telecommunications': 'Telecommunications & Media',
      'media': 'Telecommunications & Media',
      'transportation': 'Transportation & Logistics',
      'logistics': 'Transportation & Logistics'
    };
    
    let industryGrouping = null;
    if (enrichment.industry) {
      const industryLower = enrichment.industry.toLowerCase();
      for (const [key, value] of Object.entries(industryMapping)) {
        if (industryLower.includes(key)) {
          industryGrouping = value;
          break;
        }
      }
    }
    
    // ONLY THESE 5 ENRICHMENT FIELDS (as specified):
    // 1. Website
    // 2. Linked_in_URL__c
    // 3. State__c
    // 4. Region__c
    // 5. Rev_MN__c
    
    // Map State to State__c picklist
    // From screenshots, picklist includes: US state codes + specific international countries
    // ONLY use values that are confirmed in the picklist
    let statePicklistValue = null;
    
    if (enrichment.headquarters.state && !enrichment.headquarters.country || 
        enrichment.headquarters.country === 'USA' || enrichment.headquarters.country === 'US') {
      // USA: Use state code (CA, NY, MA, etc.)
      statePicklistValue = enrichment.headquarters.state.toUpperCase();
    } else if (enrichment.headquarters.country) {
      // International: ONLY use countries confirmed in picklist from screenshots
      const validInternationalStates = {
        'VIETNAM': 'Vietnam',
        'NETHERLANDS': 'Netherlands',
        'SPAIN': 'Spain',
        'UNITED KINGDOM': 'United Kingdom',
        'UK': 'United Kingdom',
        'JAPAN': 'Japan',
        'HONG KONG': 'Hong Kong',
        'IRELAND': 'Ireland',
        'AUSTRALIA': 'Australia',
        'CHINA': 'China',
        'BRITISH VIRGIN ISLANDS': 'British Virgin Islands'
        // Sweden NOT in list - leave blank if Sweden
      };
      const countryUpper = enrichment.headquarters.country.toUpperCase();
      statePicklistValue = validInternationalStates[countryUpper] || null; // null if not in list
    }
    
    // Build account data - Use ORIGINAL input name to preserve EXACT casing
    const accountData = {
      Name: companyName, // ORIGINAL input - preserves "IKEA" not "ikea"
      OwnerId: null // Will query below
    };
    
    // Add 5 enrichment fields - these MUST be added if enrichment succeeded
    logger.info(`📊 Enrichment data available:`, {
      website: enrichment.website,
      linkedIn: enrichment.linkedIn,
      revenue: enrichment.revenue,
      state: statePicklistValue,
      region: assignment.sfRegion
    });
    
    // Add each field explicitly
    if (enrichment.website) {
      accountData.Website = enrichment.website;
    }
    if (enrichment.linkedIn) {
      accountData.Linked_in_URL__c = enrichment.linkedIn;
    }
    if (statePicklistValue) {
      accountData.State__c = statePicklistValue;
    }
    if (assignment.sfRegion) {
      accountData.Region__c = assignment.sfRegion;
    }
    if (enrichment.revenue && !isNaN(enrichment.revenue)) {
      accountData.Rev_MN__c = Number((enrichment.revenue / 1000000).toFixed(1));
    }
    
    logger.info(`🚀 Creating account with data:`, JSON.stringify(accountData, null, 2));
    
    // Query to get BL's Salesforce User ID
    const userQuery = `SELECT Id FROM User WHERE Name = '${assignment.assignedTo}' AND IsActive = true LIMIT 1`;
    const userResult = await query(userQuery);
    
    if (!userResult || userResult.totalSize === 0) {
      throw new Error(`Could not find active user: ${assignment.assignedTo}`);
    }
    
    accountData.OwnerId = userResult.records[0].Id;
    
    // Create the account
    const createResult = await conn.sobject('Account').create(accountData);
    
    if (!createResult.success) {
      throw new Error(`Salesforce account creation failed: ${createResult.errors?.join(', ')}`);
    }
    
    // Build confirmation message
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${createResult.id}/view`;
    
    let confirmMessage = `Account created: ${companyName}\n\n`; // Use ORIGINAL name for display
    confirmMessage += `Assigned to: ${assignment.assignedTo}\n`;
    if (assignmentNote) confirmMessage += assignmentNote;
    confirmMessage += `\nReasoning:\n`;
    confirmMessage += `• Company HQ: ${assignment.reasoning.hqLocation}\n`;
    confirmMessage += `• Salesforce Region: ${assignment.sfRegion}\n`;
    
    // Show enriched fields (only if actually populated)
    const enrichedFields = [];
    if (enrichment.website) enrichedFields.push(`Website: ${enrichment.website}`);
    if (enrichment.linkedIn) enrichedFields.push(`Linked_in_URL: ${enrichment.linkedIn}`);
    if (enrichment.revenue) enrichedFields.push(`Rev_MN: $${(enrichment.revenue / 1000000).toFixed(1)}M`);
    if (enrichment.employeeCount) enrichedFields.push(`Employees: ${enrichment.employeeCount.toLocaleString()}`);
    if (industryGrouping) enrichedFields.push(`Industry_Grouping: ${industryGrouping}`);
    
    if (enrichedFields.length > 0) {
      confirmMessage += `\nEnriched data:\n${enrichedFields.map(f => '• ' + f).join('\n')}\n`;
    }
    
    confirmMessage += `\nCurrent coverage: ${assignment.assignedTo} has ${assignment.reasoning.activeOpportunities} active opps (Stage 1+) and ${assignment.reasoning.closingThisMonth} closing this month\n\n`;
    
    if (!enrichment.success && enrichment.error) {
      confirmMessage += `Note: Clay enrichment unavailable - some fields may need manual entry.\n\n`;
    }
    
    confirmMessage += `<${accountUrl}|View Account in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account created: ${companyName}, assigned to ${assignment.assignedTo}, enriched: ${enrichedFields.length} fields by ${userId}`);
    
  } catch (error) {
    logger.error('Account creation failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error creating account: ${error.message}\n\nPlease try again or create manually in Salesforce.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Reassignment (Keigan only)
 * SMART MODE: If no specific BL provided, suggests based on workload/region
 */
async function handleReassignAccount(entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  const KEIGAN_NAMES = ['Keigan Pesenti', 'Keigan'];
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Account assignment is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an account name.\n\n*Example:* "assign Intel to Julie Stefanich"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    const targetBLName = entities.targetBL;
    
    // Import assignment helpers
    const { validateBusinessLead, ALL_BUSINESS_LEADS, assessWorkload, selectBusinessLead, determineRegion, getBusinessLeadsForRegion } = require('../services/accountAssignment');
    
    // Find account first (we need it for smart suggestions)
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, BillingState, BillingCountry,
                                 (SELECT Id, Name, Owner.Name FROM Opportunities WHERE IsClosed = false)
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Account "${accountName}" not found.\n\nTry: "does ${accountName} exist?" to check if it exists.`,
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    const oldOwner = account.Owner?.Name;
    const opportunities = account.Opportunities || [];
    const isOwnedByKeigan = KEIGAN_NAMES.some(name => oldOwner?.toLowerCase().includes(name.toLowerCase()));
    
    // Check if targetBL is missing or invalid (e.g., "BL", "a BL", "business lead")
    const invalidBLPatterns = ['bl', 'a bl', 'business lead', 'a business lead'];
    const needsSmartSuggestion = !targetBLName || 
      invalidBLPatterns.includes(targetBLName.toLowerCase().trim()) ||
      !validateBusinessLead(targetBLName);
    
    if (needsSmartSuggestion) {
      // SMART MODE: Suggest BL based on workload and region
      logger.info(`🧠 Smart BL suggestion mode for ${account.Name}`);
      
      // Determine region from account billing address
      const headquarters = {
        state: account.BillingState,
        country: account.BillingCountry
      };
      const regionData = determineRegion(headquarters);
      const businessLeads = getBusinessLeadsForRegion(regionData.blRegion);
      
      // Get workload assessment
      const workloadMap = await assessWorkload(businessLeads);
      const recommended = selectBusinessLead(workloadMap);
      
      // Build suggestion message
      let suggestionMsg = `📊 *Smart BL Suggestion for ${account.Name}*\n\n`;
      suggestionMsg += `• Current owner: ${oldOwner || 'Unassigned'}${isOwnedByKeigan ? ' _(needs reassignment)_' : ''}\n`;
      suggestionMsg += `• Region: ${regionData.sfRegion || 'Unknown'} (${account.BillingState || 'No state'}, ${account.BillingCountry || 'US'})\n`;
      suggestionMsg += `• Open opportunities: ${opportunities.length}\n\n`;
      
      suggestionMsg += `*Recommended:* \`${recommended.name}\`\n`;
      suggestionMsg += `_(${recommended.activeOpportunities} active opps, ${recommended.closingThisMonth} closing this month)_\n\n`;
      
      suggestionMsg += `*All options by workload:*\n`;
      const sortedBLs = Object.values(workloadMap).sort((a, b) => a.totalScore - b.totalScore);
      sortedBLs.forEach((bl, idx) => {
        const marker = idx === 0 ? '→ ' : '   ';
        suggestionMsg += `${marker}${bl.name}: ${bl.activeOpportunities} active, ${bl.closingThisMonth} closing\n`;
      });
      
      suggestionMsg += `\n*To reassign, say:*\n\`reassign ${account.Name} to ${recommended.name}\``;
      
      await client.chat.postMessage({
        channel: channelId,
        text: suggestionMsg,
        thread_ts: threadTs
      });
      return;
    }
    
    // EXPLICIT MODE: Validate and assign to specific BL
    const validBL = validateBusinessLead(targetBLName);
    
    if (!validBL) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ "${targetBLName}" is not a valid Business Lead.\n\n*Valid BLs:*\n${ALL_BUSINESS_LEADS.join(', ')}`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Get target BL's Salesforce User ID
    const userQuery = `SELECT Id FROM User WHERE Name = '${validBL}' AND IsActive = true LIMIT 1`;
    const userResult = await query(userQuery);
    
    if (!userResult || userResult.totalSize === 0) {
      throw new Error(`Could not find active user: ${validBL}`);
    }
    
    const newOwnerId = userResult.records[0].Id;
    
    // Update account owner
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    await conn.sobject('Account').update({
      Id: account.Id,
      OwnerId: newOwnerId
    });
    
    // Update all open opportunities
    let oppUpdateCount = 0;
    if (opportunities.length > 0) {
      const oppUpdates = opportunities.map(opp => ({
        Id: opp.Id,
        OwnerId: newOwnerId
      }));
      
      const oppResults = await conn.sobject('Opportunity').update(oppUpdates);
      const resultsArray = Array.isArray(oppResults) ? oppResults : [oppResults];
      oppUpdateCount = resultsArray.filter(r => r.success).length;
    }
    
    // Confirmation
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    let confirmMessage = `✅ *${account.Name} reassigned to ${validBL}*\n\n`;
    confirmMessage += `• Previous owner: ${oldOwner || 'Unassigned'}\n`;
    confirmMessage += `• New owner: ${validBL}\n`;
    confirmMessage += `• ${oppUpdateCount} opportunities transferred\n\n`;
    confirmMessage += `<${accountUrl}|View in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account reassigned: ${account.Name} from ${oldOwner} to ${validBL}, ${oppUpdateCount} opps transferred by ${userId}`);
    
  } catch (error) {
    logger.error('Account reassignment failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error reassigning account: ${error.message}\n\nPlease try again or update manually in Salesforce.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Opportunity Creation (Keigan only)
 * SMART MODE: Use defaults for everything, only override mentioned fields
 */
async function handleCreateOpportunity(message, entities, userId, channelId, client, threadTs) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  try {
    // Security check - Keigan only
    if (userId !== KEIGAN_USER_ID) {
      await client.chat.postMessage({
        channel: channelId,
        text: '🔒 Opportunity creation is restricted to Keigan. Contact him for assistance.',
        thread_ts: threadTs
      });
      return;
    }
    
    // Extract account name from entities (already parsed)
    if (!entities.accounts || entities.accounts.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an account name.\n\n*Examples:*\n• Simple: "create an opp for Intel"\n• Detailed: "create an opp for Intel. stage 4 and $300k acv and target sign of 12/31/2025"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const accountName = entities.accounts[0];
    
    // CRITICAL: Find account with EXACT matching to prevent wrong attachments
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, OwnerId
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'create'),
        thread_ts: threadTs
      });
      return;
    }
    
    // ANTI-HALLUCINATION: If multiple matches, confirm with user
    if (accountResult.totalSize > 1) {
      const accountNames = accountResult.records.map(r => r.Name).join(', ');
      await client.chat.postMessage({
        channel: channelId,
        text: `⚠️  Multiple accounts match "${accountName}":\n\n${accountNames}\n\nPlease be more specific (use exact account name).`,
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    
    // SMART DEFAULTS (Salesforce flow defaults)
    const DEFAULTS = {
      acv: 300000, // $300k default
      tcv: 300000, // Same as ACV by default
      term: 36, // 36 months always
      stage: '1', // Stage 1 - Discovery default
      targetDate: null, // Will calculate: TODAY + 150 days
      revenueType: 'ARR', // CORRECT API NAME for Recurring (12+ month contracts)
      opportunitySource: 'Inbound', // Always Inbound for now
      productLine: 'AI-Augmented Contracting' // Default product (can override)
    };
    
    // Calculate default target date (TODAY + 150 days, matching Salesforce formula)
    const defaultTargetDate = new Date();
    defaultTargetDate.setDate(defaultTargetDate.getDate() + 150);
    DEFAULTS.targetDate = defaultTargetDate;
    
    // Build opportunity data: Start with defaults, override ONLY mentioned fields
    const oppData = {
      acv: entities.acv || DEFAULTS.acv,
      stage: entities.stage || DEFAULTS.stage,
      targetDate: entities.targetDate || DEFAULTS.targetDate,
      productLine: entities.productLine || DEFAULTS.productLine,
      revenueType: entities.revenueType || DEFAULTS.revenueType,
      term: DEFAULTS.term, // Always 36 months
      opportunitySource: DEFAULTS.opportunitySource // Always Inbound
    };
    
    // Calculate TCV from ACV and term
    oppData.tcv = oppData.acv; // For now, TCV = ACV (can adjust if term-based calculation needed)
    
    // Map stage number to full stage name
    const stageMap = {
      '0': 'Stage 0 - Qualifying',
      '1': 'Stage 1 - Discovery',
      '2': 'Stage 2 - SQO',
      '3': 'Stage 3 - Pilot',
      '4': 'Stage 4 - Proposal'
    };
    
    const stageName = stageMap[oppData.stage] || oppData.stage;
    
    // Map stage to probability
    const probabilityMap = {
      '0': 5,
      '1': 10,
      '2': 25,
      '3': 50,
      '4': 75
    };
    const probability = probabilityMap[oppData.stage] || 10;
    
    // Format target date for Salesforce
    let targetDateFormatted;
    if (typeof oppData.targetDate === 'string') {
      // Parse MM/DD/YYYY format
      const dateParts = oppData.targetDate.split('/');
      const targetDate = new Date(dateParts[2], dateParts[0] - 1, dateParts[1]);
      targetDateFormatted = targetDate.toISOString().split('T')[0];
    } else {
      // It's a Date object (default)
      targetDateFormatted = oppData.targetDate.toISOString().split('T')[0];
    }
    
    // Auto-generate opportunity name
    const oppName = `${account.Name} - ${oppData.productLine}`;
    
    // Create opportunity in Salesforce
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    const opportunityData = {
      Name: oppName,
      AccountId: account.Id,
      OwnerId: account.OwnerId,
      StageName: stageName,
      ACV__c: oppData.acv,
      Amount: oppData.acv,
      TCV__c: oppData.tcv,
      Product_Line__c: oppData.productLine,
      Target_LOI_Date__c: targetDateFormatted,
      CloseDate: targetDateFormatted,
      Revenue_Type__c: oppData.revenueType, // Recurring, Commitment, or Project
      LeadSource: oppData.opportunitySource,
      Probability: probability
      // IsClosed: REMOVED - read-only field, set automatically by Salesforce based on StageName
    };
    
    const createResult = await conn.sobject('Opportunity').create(opportunityData);
    
    if (!createResult.success) {
      throw new Error(`Salesforce opportunity creation failed: ${createResult.errors?.join(', ')}`);
    }
    
    // Build concise confirmation
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const oppUrl = `${sfBaseUrl}/lightning/r/Opportunity/${createResult.id}/view`;
    
    // Show which fields were custom vs default
    const customFields = [];
    const defaultFields = [];
    
    if (entities.acv) customFields.push(`ACV: $${oppData.acv.toLocaleString()}`);
    else defaultFields.push(`ACV: $${oppData.acv.toLocaleString()} (default)`);
    
    if (entities.stage) customFields.push(`Stage: ${stageName}`);
    else defaultFields.push(`Stage: ${stageName} (default)`);
    
    if (entities.targetDate) customFields.push(`Target Sign: ${oppData.targetDate}`);
    else defaultFields.push(`Target Sign: ${targetDateFormatted} (default: +150 days)`);
    
    if (entities.productLine) customFields.push(`Product Line: ${oppData.productLine}`);
    else defaultFields.push(`Product Line: ${oppData.productLine} (default)`);
    
    // Display revenue type (ARR shows as "Recurring" for users)
    const displayType = oppData.revenueType === 'ARR' ? 'Recurring (ARR)' : oppData.revenueType;
    if (entities.revenueType) customFields.push(`Revenue Type: ${displayType}`);
    else defaultFields.push(`Revenue Type: ${displayType} (default: 12+ mo contracts)`);
    
    let confirmMessage = `✅ *Opportunity created for ${account.Name}*\n\n`;
    
    if (customFields.length > 0) {
      confirmMessage += `*Your values:*\n${customFields.map(f => '• ' + f).join('\n')}\n\n`;
    }
    
    if (defaultFields.length > 0) {
      confirmMessage += `*Defaults applied:*\n${defaultFields.map(f => '• ' + f).join('\n')}\n\n`;
    }
    
    confirmMessage += `Owner: ${account.Owner?.Name}\n`;
    confirmMessage += `Term: 36 months\n\n`;
    confirmMessage += `<${oppUrl}|View Opportunity in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Opportunity created for ${account.Name}, ACV: $${oppData.acv}, Stage: ${stageName}, CustomFields: ${customFields.length}, Defaults: ${defaultFields.length} by ${userId}`);
    
  } catch (error) {
    logger.error('Opportunity creation failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error creating opportunity: ${error.message}\n\nPlease try again or create manually in Salesforce.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Post-Call Summary (Business Leads)
 */
async function handlePostCallSummary(message, userId, channelId, client, threadTs) {
  try {
    // Extract company name and notes
    let content = message
      .replace(/@gtm-brain/gi, '')
      .replace(/post-call summary/gi, '')
      .replace(/post call summary/gi, '')
      .replace(/meeting summary/gi, '')
      .replace(/call summary/gi, '')
      .trim();
    
    const lines = content.split('\n');
    
    // First line should be company name or "Company: X"
    let accountName = lines[0]
      .replace(/company:/gi, '')
      .replace(/for:/gi, '')
      .trim();
    
    // Rest is the meeting notes/transcript
    const meetingNotes = lines.slice(1).join('\n').trim();
    
    if (meetingNotes.length < 50) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please provide more meeting notes.\n\n*Format:*\n\`\`\`\npost-call summary\nCompany: [Name]\n[Your meeting notes or audio transcript here]\n\`\`\`\n\nThe AI will structure it into the standard format automatically.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Show processing message
    await client.chat.postMessage({
      channel: channelId,
      text: `🤖 Structuring post-call summary for ${accountName}...\n\n_This may take 10-15 seconds_`,
      thread_ts: threadTs
    });
    
    // Use Socrates AI to structure the summary
    const { socratesAdapter } = require('../ai/socratesAdapter');
    
    const structuringPrompt = `Structure the following meeting notes exactly as provided. Write "Not discussed" for empty sections. Use exact quotes and numbers.

1. MEETING BASICS
• Company: | Attendee(s): [Name - Role] | Meeting #: [First/Follow-up] | Type: [If follow-up: Demo/Technical/Business Case/etc.] | New Stakeholders: [Name - Role]

2. DISCOVERY & CURRENT STATE
• Use Case(s): Contracting/M&A/Compliance/Litigation/Sigma/Insights
• Pain Points: | Volumes: | Outside Counsel Spend: | Current Tools: | Evaluated Tools: | Timeline/Urgency:

3. SOLUTION DISCUSSION
• Features Resonated: | Concerns/Objections: | Technical Questions: | Success Criteria:

4. KEY INSIGHTS BY OFFERING (Only if explicitly discussed)
• Contracting: | M&A: | Compliance: | Litigation: | Sigma: | Insights: | Pricing Feedback:

5. COMPETITIVE & DECISION
• Other Vendors: | Evaluation Criteria: | Decision Timeline: | Budget: | Blockers:

6. STAKEHOLDER DYNAMICS
• Champion: [Name - Role - Why] | Decision Maker: [Name - Involvement] | Skeptics: [Who - Concerns]
• Key Quotes: ["Exact words" - Speaker] | Strong Reactions:

7. NEXT STEPS (Include exact dates/times)
• [Action + Date/Timeframe]

8. OUTCOME & STAGE
• Result: Demo Scheduled/Follow-up Confirmed/Moving to Evaluation/Building Business Case/Info Requested/Technical Validation/Not Right Now [+ reason]
• Current Stage: [2/3/4] | Risk Factors:

RULES: Preserve exact wording for compliance/regulatory/risk. Attribute all comments to speakers. Keep competitor names exact.

MEETING NOTES:
${meetingNotes}`;
    
    const response = await socratesAdapter.createChatCompletion({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a sales operations assistant. Structure meeting notes exactly as requested, preserving all details and quotes.' },
        { role: 'user', content: structuringPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.3 // Low temperature for accuracy
    });
    
    const structuredSummary = response.choices[0].message.content;
    
    // Find the account in Salesforce
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const accountQuery = `SELECT Id, Name, Owner.Name, Customer_Brain__c
                          FROM Account
                          WHERE Name LIKE '%${escapeQuotes(accountName)}%'
                          LIMIT 1`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: await formatAccountNotFoundError(accountName, 'create'),
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    
    // Save to Customer_Brain field with formatted summary
    const date = new Date();
    const dateFormatted = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    
    // Get user info
    let userName = 'User';
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (e) {
      logger.warn('Could not fetch user info');
    }
    
    const formattedSummary = `POST-CALL SUMMARY - ${dateFormatted} by ${userName}\n${'='.repeat(60)}\n\n${structuredSummary}`;
    
    // Get existing notes
    const existingNotes = account.Customer_Brain__c || '';
    const updatedNotes = formattedSummary + (existingNotes ? '\n\n' + existingNotes : '');
    
    // Update Salesforce
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    await conn.sobject('Account').update({
      Id: account.Id,
      Customer_Brain__c: updatedNotes
    });
    
    // Build response with preview
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    // Show summary preview (first 1000 chars)
    const preview = structuredSummary.length > 1000 
      ? structuredSummary.substring(0, 1000) + '...' 
      : structuredSummary;
    
    let confirmMessage = `✅ *Post-call summary saved for ${account.Name}*\n\n`;
    confirmMessage += `Structured and saved to Customer_Brain\n`;
    confirmMessage += `Date: ${dateFormatted} | By: ${userName}\n\n`;
    confirmMessage += `*Preview:*\n\`\`\`\n${preview}\n\`\`\`\n\n`;
    confirmMessage += `<${accountUrl}|View Full Summary in Salesforce>`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Post-call summary saved for ${account.Name} by ${userName}`);
    
  } catch (error) {
    logger.error('Post-call summary failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error structuring summary: ${error.message}\n\nPlease try again or save notes manually.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Account Status Dashboard (Executive View)
 * Returns link to clean web dashboard instead of Slack mess
 */
async function handleAccountStatusDashboard(userId, channelId, client, threadTs) {
  try {
    // Get base URL for dashboard link
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'https://gtm-wizard.onrender.com';
    const dashboardUrl = `${baseUrl}/dashboard`;
    
    const message = `<${dashboardUrl}|Here's the Eudia Account Status Dashboard>\n\n_Live view of all active accounts organized by stage. Mobile-friendly, refreshes on reload._`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: message,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Account dashboard link sent to ${userId}`);
    
  } catch (error) {
    logger.error('Dashboard link failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "show next 10" / "show more" pagination follow-ups
 */
async function handlePaginationNext(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const { getNextPage, getAllResults } = require('../ai/contextManager');
    const action = parsedIntent.entities.action || 'next_page';
    
    let pageData;
    if (action === 'show_all') {
      pageData = await getAllResults(userId, channelId);
    } else {
      pageData = await getNextPage(userId, channelId);
    }
    
    if (!pageData || !pageData.records || pageData.records.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No more results to show.\n\nTry a new query like "show me pipeline" or "what closed this month?"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const records = pageData.records;
    let response = '';
    
    if (action === 'show_all') {
      response = `*Remaining Deals (${records.length})*\n\n`;
    } else {
      response = `*Page ${pageData.pageNumber} of ${pageData.totalPages}*\n\n`;
    }
    
    records.forEach((record, i) => {
      const account = record.Account?.Name || record.Name || 'Unknown';
      const amount = formatCurrency(record.Amount || record.ACV__c || 0);
      const stage = shortStage(record.StageName);
      const owner = shortName(record.Owner?.Name);
      const date = record.Target_LOI_Date__c ? 
        new Date(record.Target_LOI_Date__c).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
        '';
      
      const num = action === 'show_all' ? i + 1 : ((pageData.pageNumber - 1) * 10) + i + 1;
      response += `${num}. *${account}* - ${amount} • ${stage} • ${owner}${date ? ' • ' + date : ''}\n`;
    });
    
    if (pageData.hasMore) {
      response += `\n_Say "show next 10" or "show all" for more_`;
    } else {
      response += `\n_End of results_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Pagination: showed ${records.length} more results`);
    
  } catch (error) {
    logger.error('Pagination handler failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `I couldn't find any previous results to paginate. Try a new query first.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "what ACCOUNTS are in Stage X" - returns unique account names, not opportunities
 */
async function handleAccountsByStage(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const stages = parsedIntent.entities.stages || [];
    let stageFilter = '';
    
    if (stages.length > 0) {
      const stageList = stages.map(s => `'${s}'`).join(',');
      stageFilter = `AND StageName IN (${stageList})`;
    }
    
    // Query opportunities but GROUP BY Account to get unique accounts
    const soql = `
      SELECT Account.Name, Account.Id, Account.Owner.Name, COUNT(Id) oppCount, SUM(Amount) totalAmount
      FROM Opportunity 
      WHERE IsClosed = false 
        AND Account.Name != null
        ${stageFilter}
        AND (NOT Account.Name LIKE '%Sample%')
        AND (NOT Account.Name LIKE '%Test%')
      GROUP BY Account.Name, Account.Id, Account.Owner.Name
      ORDER BY SUM(Amount) DESC NULLS LAST
      LIMIT 50
    `;
    
    const result = await query(soql);
    
    if (!result || result.totalSize === 0) {
      const stageText = stages.length > 0 ? stages[0] : 'that stage';
      await client.chat.postMessage({
        channel: channelId,
        text: `No accounts found in ${stageText}.\n\nTry: "show me pipeline" or "what accounts are in Stage 3?"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const records = result.records;
    const stageText = stages.length > 0 ? stages[0].replace('Stage ', 'S') : 'Active Stages';
    
    let response = `*Accounts in ${stageText}*\n`;
    response += `${records.length} unique accounts\n\n`;
    
    records.forEach((record, i) => {
      const account = record.Account?.Name || 'Unknown';
      const owner = shortName(record.Account?.Owner?.Name);
      const totalAmount = formatCurrency(record.totalAmount || 0);
      const oppCount = record.oppCount || 0;
      
      response += `${i + 1}. *${account}* - ${owner} • ${totalAmount} (${oppCount} opp${oppCount !== 1 ? 's' : ''})\n`;
    });
    
    if (records.length > 10) {
      response += `\n_Showing ${records.length} accounts_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Accounts by stage: ${records.length} accounts found`);
    
  } catch (error) {
    logger.error('Accounts by stage query failed:', error);
    // Fallback: query without GROUP BY if SOQL grouping fails
    await handleAccountsByStageSimple(parsedIntent, userId, channelId, client, threadTs);
  }
}

/**
 * Fallback for accounts by stage - simple approach without GROUP BY
 */
async function handleAccountsByStageSimple(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const stages = parsedIntent.entities.stages || [];
    let stageFilter = '';
    
    if (stages.length > 0) {
      const stageList = stages.map(s => `'${s}'`).join(',');
      stageFilter = `AND StageName IN (${stageList})`;
    }
    
    const soql = `
      SELECT Id, Name, Account.Name, Account.Owner.Name, Amount, StageName
      FROM Opportunity 
      WHERE IsClosed = false 
        AND Account.Name != null
        ${stageFilter}
        AND (NOT Account.Name LIKE '%Sample%')
        AND (NOT Account.Name LIKE '%Test%')
      ORDER BY Amount DESC NULLS LAST
      LIMIT 100
    `;
    
    const result = await query(soql);
    
    if (!result || result.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No accounts found in that stage.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Deduplicate by account name
    const accountMap = new Map();
    result.records.forEach(opp => {
      const accountName = opp.Account?.Name;
      if (accountName && !accountMap.has(accountName)) {
        accountMap.set(accountName, {
          name: accountName,
          owner: opp.Account?.Owner?.Name,
          totalAmount: 0,
          oppCount: 0
        });
      }
      if (accountName) {
        const acc = accountMap.get(accountName);
        acc.totalAmount += (opp.Amount || 0);
        acc.oppCount += 1;
      }
    });
    
    const accounts = Array.from(accountMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);
    
    const stageText = stages.length > 0 ? stages[0].replace('Stage ', 'S') : 'Active Stages';
    
    let response = `*Accounts in ${stageText}*\n`;
    response += `${accounts.length} unique accounts\n\n`;
    
    accounts.slice(0, 20).forEach((acc, i) => {
      const owner = shortName(acc.owner);
      const totalAmount = formatCurrency(acc.totalAmount);
      
      response += `${i + 1}. *${acc.name}* - ${owner} • ${totalAmount} (${acc.oppCount} opp${acc.oppCount !== 1 ? 's' : ''})\n`;
    });
    
    if (accounts.length > 20) {
      response += `\n_Showing top 20 of ${accounts.length} accounts_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
  } catch (error) {
    logger.error('Accounts by stage simple query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching accounts: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "what accounts does [Owner] own" - returns accounts, not deals
 */
async function handleAccountsByOwner(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const ownerName = parsedIntent.entities.ownerName;
    
    if (!ownerName) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify an owner name. Try: "what accounts does Julie own?"`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Query accounts directly
    const soql = `
      SELECT Id, Name, Owner.Name, Customer_Type__c, 
             (SELECT Id, Amount, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
      FROM Account 
      WHERE Owner.Name LIKE '%${ownerName}%'
        AND (NOT Name LIKE '%Sample%')
        AND (NOT Name LIKE '%Test%')
      ORDER BY Name
      LIMIT 30
    `;
    
    const result = await query(soql);
    
    if (!result || result.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No accounts found for owner "${ownerName}".\n\nTry checking the spelling or use: "who owns [Company]?"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const accounts = result.records;
    const owner = accounts[0]?.Owner?.Name || ownerName;
    
    let response = `*Accounts owned by ${owner}*\n`;
    response += `${accounts.length} accounts\n\n`;
    
    accounts.forEach((acc, i) => {
      const customerType = acc.Customer_Type__c ? ` (${acc.Customer_Type__c})` : '';
      const oppCount = acc.Opportunities?.totalSize || 0;
      const oppText = oppCount > 0 ? ` • ${oppCount} active opp${oppCount !== 1 ? 's' : ''}` : '';
      
      response += `${i + 1}. *${acc.Name}*${customerType}${oppText}\n`;
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Accounts by owner: ${accounts.length} accounts found for ${ownerName}`);
    
  } catch (error) {
    logger.error('Accounts by owner query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching accounts: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "what deals were added to pipeline this week" query
 */
async function handlePipelineAddedQuery(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const timeframe = parsedIntent.entities.createdTimeframe || 'this_week';
    
    // Build date filter based on timeframe
    let dateFilter = '';
    const today = new Date();
    
    if (timeframe === 'today') {
      dateFilter = 'CreatedDate = TODAY';
    } else if (timeframe === 'yesterday') {
      dateFilter = 'CreatedDate = YESTERDAY';
    } else if (timeframe === 'this_week') {
      dateFilter = 'CreatedDate = THIS_WEEK';
    } else if (timeframe === 'last_week') {
      dateFilter = 'CreatedDate = LAST_WEEK';
    } else if (timeframe === 'this_month') {
      dateFilter = 'CreatedDate = THIS_MONTH';
    } else if (timeframe === 'last_month') {
      dateFilter = 'CreatedDate = LAST_MONTH';
    } else {
      dateFilter = 'CreatedDate = THIS_WEEK';
    }
    
    const soql = `
      SELECT Id, Name, Account.Name, Amount, StageName, Owner.Name, 
             CreatedDate, Target_LOI_Date__c, Product_Line__c
      FROM Opportunity 
      WHERE IsClosed = false 
        AND ${dateFilter}
        AND (NOT Account.Name LIKE '%Sample%')
        AND (NOT Account.Name LIKE '%Test%')
      ORDER BY CreatedDate DESC, Amount DESC
      LIMIT 50
    `;
    
    const result = await query(soql);
    
    if (!result || result.totalSize === 0) {
      const timeframeText = timeframe.replace('_', ' ');
      await client.chat.postMessage({
        channel: channelId,
        text: `No new deals added to pipeline ${timeframeText}.\n\nTry: "deals added last month" or "new pipeline this month"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const records = result.records;
    let totalAmount = 0;
    records.forEach(r => { totalAmount += r.Amount || 0; });
    
    const timeframeText = timeframe.replace('_', ' ');
    let response = `*New Pipeline Added (${timeframeText})*\n`;
    response += `${records.length} deals • *${formatCurrency(totalAmount)}* added\n\n`;
    
    // Sort by amount and show top 10
    const sorted = [...records].sort((a, b) => (b.Amount || 0) - (a.Amount || 0));
    sorted.slice(0, 10).forEach((record, i) => {
      const account = record.Account?.Name || 'Unknown';
      const amount = formatCurrency(record.Amount || 0);
      const stage = shortStage(record.StageName);
      const owner = shortName(record.Owner?.Name);
      const created = new Date(record.CreatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      response += `${i + 1}. *${account}* - ${amount} • ${stage} • ${owner} • Created ${created}\n`;
    });
    
    if (records.length > 10) {
      response += `\n_Showing top 10 of ${records.length} new deals_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Pipeline added query: ${records.length} deals found for ${timeframe}`);
    
  } catch (error) {
    logger.error('Pipeline added query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching new pipeline: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "weighted pipeline" query
 */
async function handleWeightedPipelineQuery(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const soql = buildWeightedSummaryQuery(parsedIntent.entities || {});
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No active pipeline found.\n\nTry: "show me pipeline" or "late stage pipeline"`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Format weighted pipeline summary
    const records = result.records;
    let totalGross = 0;
    let totalWeighted = 0;
    let totalDeals = 0;
    
    records.forEach(r => {
      totalGross += r.GrossAmount || 0;
      totalWeighted += r.WeightedAmount || 0;
      totalDeals += r.DealCount || 0;
    });
    
    let response = `*Weighted Pipeline Summary*\n\n`;
    response += `*Total Weighted ACV:* ${formatCurrency(totalWeighted)}\n`;
    response += `*Total Gross ACV:* ${formatCurrency(totalGross)}\n`;
    response += `*Total Deals:* ${totalDeals}\n\n`;
    response += `*By Stage:*\n`;
    
    // Sort by stage
    const stageOrder = {
      'Stage 4 - Proposal': 1,
      'Stage 3 - Pilot': 2,
      'Stage 2 - SQO': 3,
      'Stage 1 - Discovery': 4,
      'Stage 0 - Qualifying': 5
    };
    
    const sorted = records.sort((a, b) => (stageOrder[a.StageName] || 99) - (stageOrder[b.StageName] || 99));
    
    sorted.forEach(r => {
      const stage = shortStage(r.StageName);
      const weighted = formatCurrency(r.WeightedAmount || 0);
      const gross = formatCurrency(r.GrossAmount || 0);
      const count = r.DealCount || 0;
      response += `• ${stage}: ${weighted} weighted (${gross} gross, ${count} deals)\n`;
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Weighted pipeline query: ${formatCurrency(totalWeighted)} total`);
    
  } catch (error) {
    logger.error('Weighted pipeline query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching weighted pipeline: ${error.message}\n\nTry: "show me pipeline"`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "what LOIs have we signed" / "how many LOIs" query
 */
async function handleLOIQuery(parsedIntent, userId, channelId, client, threadTs) {
  try {
    // Build query for LOIs (Revenue_Type__c = 'Commitment')
    let soql = `SELECT Id, Name, Account.Name, Account.Owner.Name, ACV__c, CloseDate 
                FROM Opportunity 
                WHERE IsClosed = true AND IsWon = true AND Revenue_Type__c = 'Commitment'`;
    
    // Add timeframe filter if specified
    if (parsedIntent.entities.timeframe) {
      const timeframeMap = {
        'this_week': 'THIS_WEEK',
        'last_week': 'LAST_WEEK',
        'this_month': 'THIS_MONTH',
        'last_month': 'LAST_MONTH'
      };
      const sfTimeframe = timeframeMap[parsedIntent.entities.timeframe];
      if (sfTimeframe) {
        soql += ` AND CloseDate = ${sfTimeframe}`;
      }
    }
    
    soql += ' ORDER BY CloseDate DESC LIMIT 200';
    
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No LOIs found.\n\n_LOIs are opportunities with Revenue_Type = 'Commitment'_\n\nTry: "what closed this month" or "show ARR deals"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const records = result.records;
    let totalACV = 0;
    records.forEach(r => { totalACV += r.ACV__c || 0; });
    
    let response = `*LOIs Signed: ${records.length}*\n\n`;
    response += `_Letters of Intent (Revenue_Type = 'Commitment')_\n`;
    response += `*Total ACV:* ${formatCurrency(totalACV)}\n\n`;
    
    records.slice(0, 20).forEach((r, i) => {
      const accountName = r.Account?.Name || 'Unknown';
      const owner = shortName(r.Account?.Owner?.Name) || 'Unassigned';
      const acv = formatCurrency(r.ACV__c || 0);
      const closeDate = r.CloseDate ? new Date(r.CloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      response += `${i+1}. *${accountName}* - ${acv}\n   Signed: ${closeDate} | Owner: ${owner}\n\n`;
    });
    
    if (records.length > 20) {
      response += `\n_Showing first 20 of ${records.length} LOIs_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ LOI query: ${records.length} LOIs found`);
    
  } catch (error) {
    logger.error('LOI query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching LOIs: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "show ARR deals" / "how many ARR contracts" query
 */
async function handleARRQuery(parsedIntent, userId, channelId, client, threadTs) {
  try {
    // Query for recurring revenue deals
    const soql = `SELECT Account.Name, Account.Owner.Name, Name, Amount, ACV__c, CloseDate, Owner.Name
                  FROM Opportunity 
                  WHERE Revenue_Type__c = 'Recurring' AND IsClosed = true AND IsWon = true
                  ORDER BY CloseDate DESC
                  LIMIT 100`;
    
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No ARR contracts found.\n\n_ARR = Revenue_Type 'Recurring'_\n\nTry: "what LOIs have we signed" or "what closed this month"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const records = result.records;
    let totalACV = 0;
    records.forEach(r => { totalACV += r.ACV__c || 0; });
    
    let response = `*ARR Contracts: ${records.length}*\n\n`;
    response += `_Annual Recurring Revenue (Revenue_Type = 'Recurring')_\n`;
    response += `*Total ACV:* ${formatCurrency(totalACV)}\n\n`;
    
    records.slice(0, 20).forEach((r, i) => {
      const accountName = r.Account?.Name || 'Unknown';
      const owner = shortName(r.Account?.Owner?.Name || r.Owner?.Name) || 'Unassigned';
      const acv = formatCurrency(r.ACV__c || 0);
      const closeDate = r.CloseDate ? new Date(r.CloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      response += `${i+1}. *${accountName}* - ${acv}\n   Closed: ${closeDate} | Owner: ${owner}\n\n`;
    });
    
    if (records.length > 20) {
      response += `\n_Showing first 20 of ${records.length} ARR contracts_`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ ARR query: ${records.length} contracts found`);
    
  } catch (error) {
    logger.error('ARR query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching ARR contracts: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "which accounts have logo rights" query
 */
async function handleLogoRightsQuery(userId, channelId, client, threadTs) {
  // Companies with logo rights (manually maintained list)
  const LOGO_RIGHTS_COMPANIES = [
    'Pure Storage', 'Bayer', 'Dolby', 'Best Buy', 'The Weir Group',
    'The Wonderful Company', 'AES', 'Cox Media', 'CHS', 'Western Digital',
    'Fresh Del Monte', 'GE Vernova', 'Novelis', 'Asana', 'Tailored Brands',
    'PetSmart', 'Ecolab', 'Wealth Partners Capital Group', 'Delinea', 'BNY', 'Udemy'
  ];
  
  let response = `*Companies with Logo Rights*\n`;
  response += `_${LOGO_RIGHTS_COMPANIES.length} companies authorized for logo usage_\n\n`;
  
  LOGO_RIGHTS_COMPANIES.forEach((company, i) => {
    response += `${i + 1}. ${company}\n`;
  });
  
  response += `\n---\n_This list is manually maintained. Contact the team to add new companies with logo rights._`;
  
  await client.chat.postMessage({
    channel: channelId,
    text: response,
    thread_ts: threadTs
  });
  
  logger.info(`Logo rights query - returned ${LOGO_RIGHTS_COMPANIES.length} companies`);
}

/**
 * Handle "who are our current customers?" query
 */
async function handleCustomerListQuery(userId, channelId, client, threadTs) {
  try {
    // Query accounts with Customer_Type__c set (these are customers)
    const soql = `
      SELECT Id, Name, Customer_Type__c, Owner.Name, 
             (SELECT Name, Amount FROM Opportunities WHERE IsClosed = false LIMIT 1)
      FROM Account 
      WHERE Customer_Type__c != null 
      ORDER BY Customer_Type__c, Name 
      LIMIT 50
    `;
    
    const result = await query(soql);
    
    if (!result || result.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No customers found with Customer_Type__c set.\n\nCustomers are accounts with a defined Customer Type (Revenue, Pilot, LOI).`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Group by customer type
    const byType = { Revenue: [], Pilot: [], LOI: [], Other: [] };
    result.records.forEach(account => {
      const type = account.Customer_Type__c || 'Other';
      if (type.includes('Revenue') || type.includes('ARR')) {
        byType.Revenue.push(account);
      } else if (type.includes('Pilot')) {
        byType.Pilot.push(account);
      } else if (type.includes('LOI')) {
        byType.LOI.push(account);
      } else {
        byType.Other.push(account);
      }
    });
    
    let response = `*Current Customers* (${result.totalSize} accounts)\n\n`;
    
    if (byType.Revenue.length > 0) {
      response += `*Revenue* (${byType.Revenue.length}):\n`;
      byType.Revenue.slice(0, 10).forEach(a => {
        response += `• ${a.Name} - ${a.Owner?.Name || 'Unassigned'}\n`;
      });
      if (byType.Revenue.length > 10) response += `  _+${byType.Revenue.length - 10} more_\n`;
      response += '\n';
    }
    
    if (byType.Pilot.length > 0) {
      response += `*Pilot* (${byType.Pilot.length}):\n`;
      byType.Pilot.slice(0, 5).forEach(a => {
        response += `• ${a.Name} - ${a.Owner?.Name || 'Unassigned'}\n`;
      });
      if (byType.Pilot.length > 5) response += `  _+${byType.Pilot.length - 5} more_\n`;
      response += '\n';
    }
    
    if (byType.LOI.length > 0) {
      response += `*LOI* (${byType.LOI.length}):\n`;
      byType.LOI.slice(0, 5).forEach(a => {
        response += `• ${a.Name} - ${a.Owner?.Name || 'Unassigned'}\n`;
      });
      if (byType.LOI.length > 5) response += `  _+${byType.LOI.length - 5} more_\n`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`✅ Customer list sent (${result.totalSize} accounts)`);
    
  } catch (error) {
    logger.error('Customer list query failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error fetching customers: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

/**
 * Get owner name from Slack user ID by matching to Salesforce
 */
async function getOwnerNameFromSlackUser(slackUserId, client) {
  try {
    // Get Slack user info
    const userInfo = await client.users.info({ user: slackUserId });
    const realName = userInfo.user?.real_name;
    const displayName = userInfo.user?.profile?.display_name;
    const email = userInfo.user?.profile?.email;
    
    // Map common Slack names to Salesforce owner names - US and EU Pods
    const nameMap = {
      'keigan pesenti': 'Keigan Pesenti',
      // US Pod
      'julie stefanich': 'Julie Stefanich',
      'justin hills': 'Justin Hills',
      'asad hussain': 'Asad Hussain',
      'himanshu agarwal': 'Himanshu Agarwal',
      'ananth cherukupally': 'Ananth Cherukupally',
      'olivia jung': 'Olivia Jung',
      // EU Pod
      'greg machale': 'Greg MacHale',
      'nathan shine': 'Nathan Shine',
      'tom clancy': 'Tom Clancy',
      'conor molloy': 'Conor Molloy',
      'alex fox': 'Alex Fox',
      'nicola fratini': 'Nicola Fratini',
      'emer flynn': 'Emer Flynn',
      'riona mchale': 'Riona McHale',
      // Other
      'jon cobb': 'Jon Cobb',
      'mike masiello': 'Mike Masiello',
      'david van reyk': 'David Van Reyk'
    };
    
    // Try to match by real name
    const nameLower = (realName || displayName || '').toLowerCase();
    for (const [slackName, sfName] of Object.entries(nameMap)) {
      if (nameLower.includes(slackName) || slackName.includes(nameLower.split(' ')[0])) {
        return sfName;
      }
    }
    
    // Return the real name as-is if no match
    return realName || displayName || null;
    
  } catch (error) {
    logger.warn('Could not get Slack user info:', error.message);
    return null;
  }
}

/**
 * Handle Unknown Queries - Smart keyword matching with context-aware suggestions
 * Enhanced with "Did you mean?" fuzzy matching
 */
async function handleUnknownQuery(parsedIntent, userId, channelId, client, threadTs) {
  try {
    const originalMessage = parsedIntent.originalMessage?.toLowerCase() || '';
    const extractedWords = parsedIntent.entities.extractedWords || [];
    
    // Known command patterns for fuzzy matching
    const commandPatterns = [
      'show me pipeline',
      'my pipeline',
      'late stage pipeline',
      'early stage pipeline',
      'who owns',
      "who's the BL on",
      'what do we know about',
      "Julie's deals",
      "Himanshu's deals",
      'what closed this month',
      'what closed this week',
      'what closed today',
      'move to nurture',
      'batch nurture',
      'reassign to',
      'batch reassign',
      'create opportunity for',
      'send pipeline excel',
      'logo rights',
      'what accounts are in stage',
      'how many customers',
      'how many deals',
      'add to customer history',
      'stale deals',
      'stuck deals',
      'hot deals'
    ];
    
    // Find closest matching command using Levenshtein distance
    const didYouMeanSuggestion = findClosestMatch(originalMessage, commandPatterns);
    
    // Keyword to suggestion mapping - provide relevant suggestions based on words in query
    const keywordSuggestions = {
      'logo': { 
        suggestion: 'logo rights', 
        examples: ['logo rights', 'which accounts have logo rights'] 
      },
      'contract': { 
        suggestion: 'contracts', 
        examples: ['show contracts', 'contracts for Boeing'] 
      },
      'excel': { 
        suggestion: 'excel export', 
        examples: ['send pipeline excel', 'export to excel'] 
      },
      'report': { 
        suggestion: 'reports', 
        examples: ['send pipeline excel', 'pipeline report'] 
      },
      'customer': { 
        suggestion: 'customers', 
        examples: ['who are our customers', 'how many customers'] 
      },
      'owner': { 
        suggestion: 'account owner', 
        examples: ['who owns Boeing', 'BL for Intel'] 
      },
      'pipeline': { 
        suggestion: 'pipeline queries', 
        examples: ['show me pipeline', 'late stage pipeline', 'my pipeline'] 
      },
      'stage': { 
        suggestion: 'stage queries', 
        examples: ['what accounts are in Stage 2', 'late stage deals'] 
      },
      'deal': { 
        suggestion: 'deals/opportunities', 
        examples: ['Julie\'s deals', 'late stage deals', 'stale deals'] 
      },
      'account': { 
        suggestion: 'account queries', 
        examples: ['who owns Boeing', 'what accounts does Julie own', 'accounts in Stage 2'] 
      },
      'reassign': { 
        suggestion: 'reassign accounts', 
        examples: ['reassign Boeing to Julie', 'batch reassign: A, B to Owner'] 
      },
      'nurture': { 
        suggestion: 'nurture accounts', 
        examples: ['move Boeing to nurture', 'batch nurture: A, B, C'] 
      },
      'closed': { 
        suggestion: 'closed deals', 
        examples: ['what closed this month', 'what closed this week'] 
      },
      'loi': { 
        suggestion: 'LOIs/bookings', 
        examples: ['what LOIs have we signed', 'how many LOIs this month'] 
      }
    };
    
    // Find relevant suggestions based on keywords in the query
    let matchedSuggestions = [];
    Object.entries(keywordSuggestions).forEach(([keyword, data]) => {
      if (originalMessage.includes(keyword)) {
        matchedSuggestions.push(data);
      }
    });
    
    let response = '';
    
    // Check for "Did you mean?" suggestion first
    if (didYouMeanSuggestion && didYouMeanSuggestion.score >= 0.5) {
      response = `🤔 *Did you mean:* "${didYouMeanSuggestion.pattern}"?\n\n`;
      response += `_Try typing that exact phrase, or see suggestions below._\n\n`;
    }
    
    if (matchedSuggestions.length > 0) {
      // We found relevant keywords - give targeted suggestions
      if (!response) {
        response = `I think you're asking about *${matchedSuggestions[0].suggestion}*. Try:\n\n`;
      } else {
        response += `*Related commands:*\n`;
      }
      matchedSuggestions.forEach(match => {
        match.examples.forEach(ex => {
          response += `• "${ex}"\n`;
        });
      });
      response += `\n_Tip: I work best with direct questions. Rephrase if needed!_`;
    } else if (!didYouMeanSuggestion || didYouMeanSuggestion.score < 0.5) {
      // No keywords matched AND no fuzzy match - give general help
      response = `I'm not sure what you're looking for. Here are some things I can do:\n\n`;
      response += `*Quick Examples:*\n`;
      response += `• "show me pipeline" - Active opportunities\n`;
      response += `• "who owns Boeing" - Account ownership\n`;
      response += `• "Julie's deals" - Owner-specific pipeline\n`;
      response += `• "what closed this month" - Recent wins\n`;
      response += `• "send pipeline excel" - Export to spreadsheet\n`;
      response += `• "logo rights" - Companies with logo authorization\n\n`;
      response += `_Visit gtm-wizard.onrender.com/cheat-sheet for full command reference._`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
    logger.info(`Unknown query from ${userId}: "${parsedIntent.originalMessage}" - matched keywords: ${matchedSuggestions.map(m => m.suggestion).join(', ') || 'none'}`);
    
  } catch (error) {
    logger.error('Failed to handle unknown query:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `I'm not sure how to help. Visit gtm-wizard.onrender.com/cheat-sheet for examples!`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle "[Name]'s accounts" queries
 */
async function handleOwnerAccountsList(entities, userId, channelId, client, threadTs) {
  try {
    if (!entities.ownerName) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify whose accounts you want to see.\n\n*Examples:*\n• "Julie's accounts"\n• "What accounts does Himanshu own?"\n• "Show me Asad's accounts"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const ownerName = entities.ownerName;
    
    // Map first names to full names - US and EU Pods
    const ownerMap = {
      // US Pod
      'julie': 'Julie Stefanich',
      'himanshu': 'Himanshu Agarwal',
      'asad': 'Asad Hussain',
      'ananth': 'Ananth Cherukupally',
      'olivia': 'Olivia Jung',
      'justin': 'Justin Hills',
      // EU Pod
      'greg': 'Greg MacHale',
      'nathan': 'Nathan Shine',
      'tom': 'Tom Clancy',
      'conor': 'Conor Molloy',
      'alex': 'Alex Fox',
      'nicola': 'Nicola Fratini',
      'emer': 'Emer Flynn',
      'riona': 'Riona McHale',
      // Other
      'david': 'David Van Ryk',
      'john': 'John Cobb',
      'jon': 'Jon Cobb',
      'olivia': 'Olivia Jung',
      'justin': 'Justin Hills'
    };
    
    const fullName = ownerMap[ownerName.toLowerCase()] || ownerName;
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    
    const accountQuery = `SELECT Id, Name, 
                                 (SELECT Id, StageName, ACV__c FROM Opportunities WHERE IsClosed = false ORDER BY ACV__c DESC)
                          FROM Account
                          WHERE Owner.Name LIKE '%${escapeQuotes(fullName)}%'
                          ORDER BY Name`;
    
    const result = await query(accountQuery);
    
    if (!result || result.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No accounts found for "${fullName}".\n\nTry:\n• "Julie's accounts"\n• "Justin's accounts"\n• "Asad's accounts"`,
        thread_ts: threadTs
      });
      return;
    }
    
    let totalPipeline = 0;
    let totalOpps = 0;
    
    result.records.forEach(acc => {
      if (acc.Opportunities && acc.Opportunities.records) {
        acc.Opportunities.records.forEach(opp => {
          totalPipeline += (opp.ACV__c || 0);
          totalOpps++;
        });
      }
    });
    
    let response = `*${fullName}'s Accounts (${result.totalSize})*\n\n`;
    response += `Total Pipeline: $${(totalPipeline / 1000000).toFixed(2)}M across ${totalOpps} opportunities\n\n`;
    
    result.records.forEach(acc => {
      const opps = acc.Opportunities?.records || [];
      if (opps.length > 0) {
        const accPipeline = opps.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
        const highestStage = Math.max(...opps.map(o => parseInt(o.StageName.match(/\d/)?.[0] || 0)));
        response += `• *${acc.Name}* - ${opps.length} opp${opps.length > 1 ? 's' : ''}, $${(accPipeline / 1000).toFixed(0)}K, Stage ${highestStage}\n`;
      } else {
        response += `• ${acc.Name} - No active opportunities\n`;
      }
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
  } catch (error) {
    console.error('[handleOwnerAccountsList] Error:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error retrieving accounts. Please try again.`,
      thread_ts: threadTs
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HYPRNOTE SYNC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle Hyprnote sync command
 */
async function handleHyprnoteSync(client, channelId, userId, threadTs) {
  try {
    await client.chat.postMessage({
      channel: channelId,
      text: '🎙️ Checking for new Hyprnote meetings to sync...',
      thread_ts: threadTs
    });
    
    const { checkForNewMeetings, syncSessionToSalesforce, getRecentSessions } = require('../services/hyprnoteSyncService');
    
    const newSessions = await checkForNewMeetings();
    
    if (newSessions.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '✅ No new meetings to sync. All Hyprnote sessions are up to date with Salesforce.',
        thread_ts: threadTs
      });
      return;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: `Found ${newSessions.length} new meeting(s). Syncing to Salesforce...`,
      thread_ts: threadTs
    });
    
    const results = [];
    for (const session of newSessions) {
      const result = await syncSessionToSalesforce(session);
      results.push({ session, result });
    }
    
    const successful = results.filter(r => r.result.success);
    const failed = results.filter(r => !r.result.success);
    
    let response = `🎙️ *Hyprnote Sync Complete*\n\n`;
    response += `✅ *Synced:* ${successful.length} meeting(s)\n`;
    
    if (successful.length > 0) {
      response += `\n*Successfully synced:*\n`;
      successful.forEach(({ session }) => {
        response += `• ${session.title}\n`;
      });
    }
    
    if (failed.length > 0) {
      response += `\n⚠️ *Failed:* ${failed.length}\n`;
      failed.forEach(({ session, result }) => {
        response += `• ${session.title}: ${result.error}\n`;
      });
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
  } catch (error) {
    console.error('[handleHyprnoteSync] Error:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error syncing Hyprnote meetings: ${error.message}\n\nMake sure Hyprnote is installed and has recorded meetings.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle Hyprnote status command
 */
async function handleHyprnoteSyncStatus(client, channelId, threadTs) {
  try {
    const { getRecentSessions, HYPRNOTE_DB_PATH } = require('../services/hyprnoteSyncService');
    const fs = require('fs');
    
    let response = `🎙️ *Hyprnote Sync Status*\n\n`;
    
    // Check if database exists
    if (!fs.existsSync(HYPRNOTE_DB_PATH)) {
      response += `❌ Hyprnote database not found\n`;
      response += `Expected path: \`${HYPRNOTE_DB_PATH}\`\n\n`;
      response += `Make sure Hyprnote is installed and has been used at least once.`;
    } else {
      response += `✅ Hyprnote database found\n\n`;
      
      const sessions = await getRecentSessions(168); // Last 7 days
      response += `*Recent Sessions (last 7 days):* ${sessions.length}\n\n`;
      
      if (sessions.length > 0) {
        response += `*Most recent meetings:*\n`;
        sessions.slice(0, 5).forEach(session => {
          const date = new Date(session.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          response += `• ${session.title} (${date})\n`;
        });
        
        if (sessions.length > 5) {
          response += `  _...and ${sessions.length - 5} more_\n`;
        }
      }
      
      response += `\n*Commands:*\n`;
      response += `• \`sync hyprnote\` - Sync new meetings to Salesforce\n`;
      response += `• \`hyprnote status\` - Show this status`;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
  } catch (error) {
    console.error('[handleHyprnoteSyncStatus] Error:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error checking Hyprnote status: ${error.message}`,
      thread_ts: threadTs
    });
  }
}

module.exports = {
  registerEventHandlers
};
