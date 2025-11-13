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
  const text = event.text;

  // Check rate limiting - More generous for exploration
  const rateLimit = await cache.checkRateLimit(userId, 'dm');
  if (!rateLimit.allowed) {
    await client.chat.postMessage({
      channel: channelId,
      text: `⏱️ You're really putting me to work! Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds before your next query. 🤖`
    });
    return;
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

    // Parse intent using AI first
    const parsedIntent = await parseIntent(text, conversationContext, userId);

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
• "which accounts have mentioned Harvey?" - Competitor intelligence
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

*BOOKINGS & LOIs*
• "what LOIs have we signed in the last two weeks?" - Recent bookings
• "how many bookings this month?" - Booking count
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
        
        // Smart query with fuzzy matching
        soql = `SELECT Id, Name, Owner.Name, Owner.Email, Industry, Prior_Account_Owner_Name__c
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
    } else if (parsedIntent.intent === 'account_stage_lookup') {
      // Handle "What accounts are in Stage 2?" type queries
      if (parsedIntent.entities.stages && parsedIntent.entities.stages.length > 0) {
        const stageName = parsedIntent.entities.stages[0];
        soql = `SELECT Account.Name, Account.Owner.Name, Account.Industry, Name, Amount, CloseDate
                FROM Opportunity 
                WHERE StageName = '${stageName}' AND IsClosed = false
                ORDER BY Amount DESC
                LIMIT 20`;
      }
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
    } else if (parsedIntent.intent === 'move_to_nurture') {
      // Handle move to nurture (Keigan only)
      await handleMoveToNurture(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'close_account_lost') {
      // Handle close account lost (Keigan only)
      await handleCloseAccountLost(parsedIntent.entities, userId, channelId, client, threadTs);
      return; // Exit early
    } else if (parsedIntent.intent === 'pipeline_summary' || parsedIntent.intent === 'deal_lookup') {
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

    // Execute query directly (skip optimization for now to avoid errors)
    const queryStartTime = Date.now();
    let queryResult = await query(soql, true); // Enable caching
    const queryExecutionTime = Date.now() - queryStartTime;

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
      formattedResponse = formatAccountLookup(queryResult, parsedIntent);
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

      // Only add blocks for pipeline/opportunity queries, NOT account/count/average/summary/contract queries
      if (parsedIntent.intent !== 'account_lookup' && 
          parsedIntent.intent !== 'account_field_lookup' &&
          parsedIntent.intent !== 'account_stage_lookup' &&
          parsedIntent.intent !== 'count_query' &&
          parsedIntent.intent !== 'average_days_query' &&
          parsedIntent.intent !== 'weighted_summary' &&
          parsedIntent.intent !== 'contract_query' &&
          parsedIntent.intent !== 'greeting') {
        messageOptions.blocks = buildResponseBlocks(queryResult, parsedIntent);
      }

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
    // Clean message to get just the note content
    let noteContent = message
      .replace(/@gtm-brain/gi, '')
      .replace(/add to customer history\s*:?\s*/gi, '')
      .replace(/save note\s*:?\s*/gi, '')
      .replace(/log note\s*:?\s*/gi, '')
      .replace(/customer history\s*:?\s*/gi, '')
      .trim();
    
    if (noteContent.length < 5) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please include the note content:\n\n*Format:*\n@gtm-brain add to customer history: Nielsen - Discussion...\n\nOR\n@gtm-brain add to customer history Nielsen - Discussion...`,
        thread_ts: threadTs
      });
      return;
    }

    // Extract account name from note content
    // First, clean Slack formatting and get first line
    const cleanContent = noteContent
      .replace(/\*/g, '') // Remove all asterisks
      .replace(/_/g, '')  // Remove underscores
      .replace(/```[^```]*```/g, '')
      .trim();
    
    // Get first line or first words before dash/hyphen
    const firstLine = cleanContent.split('\n')[0].trim();
    
    // Try to extract account name
    let accountName = null;
    
    // Pattern 1: "Nielsen - Discussion" → extract "Nielsen"
    if (firstLine.includes(' - ') || firstLine.includes(' – ')) {
      const parts = firstLine.split(/\s+[-–—]\s+/);
      if (parts[0] && parts[0].length > 2) {
        accountName = parts[0].trim();
      }
    }
    
    // Pattern 2: First line is just the account name (e.g., "Nielsen")
    if (!accountName && firstLine.length < 50 && firstLine.length > 2) {
      const words = firstLine.split(/\s+/);
      if (words.length <= 4) { // Account name usually 1-4 words
        accountName = firstLine;
      }
    }
    
    // Pattern 3: "from Nielsen" or "with Best Buy"
    if (!accountName) {
      const fromMatch = cleanContent.match(/(?:from|with|at)\s+([A-Z][A-Za-z\s&'-]+?)(?:\s|\.|\n)/);
      if (fromMatch && fromMatch[1]) {
        accountName = fromMatch[1].trim();
      }
    }
    
    if (!accountName) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Could not detect account name.\n\nYour note should start with the account name:\n"Nielsen - [note content]"\n\nFirst line was: "${firstLine}"`,
        thread_ts: threadTs
      });
      return;
    }

    // Query and validate account using existing fuzzy matching
    const accountQuery = `SELECT Id, Name, Owner.Name, Customer_Brain__c
                          FROM Account
                          WHERE Name LIKE '%${accountName}%'
                          LIMIT 5`;
    
    const accountResult = await query(accountQuery);
    
    if (!accountResult || accountResult.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Account "${accountName}" not found. Please check spelling or try: "contracts for ${accountName}" to see if it exists.`,
        thread_ts: threadTs
      });
      return;
    }

    // Find best match (prefer business lead)
    const businessLeads = ['Julie Stefanich', 'Himanshu Agarwal', 'Asad Hussain', 'Ananth Cherukupally', 'David Van Ryk', 'John Cobb', 'Jon Cobb', 'Olivia Jung'];
    const blMatch = accountResult.records.find(r => businessLeads.includes(r.Owner?.Name));
    const account = blMatch || accountResult.records[0];

    // Clean the note content
    const cleanNote = noteContent
      .replace(/@gtm-brain/gi, '')
      .replace(/add to customer history:?/gi, '')
      .replace(/save note:?/gi, '')
      .replace(/log note:?/gi, '')
      .trim();

    // Format the note with date and user
    const date = new Date();
    const dateShort = `${date.getMonth() + 1}/${date.getDate()}`;
    const formattedNote = `${dateShort} - Keigan: ${cleanNote}`;

    // Get existing notes
    const existingNotes = account.Customer_Brain__c || '';

    // Prepend new note
    const updatedNotes = formattedNote + (existingNotes ? '\n\n' + existingNotes : '');

    // Update Salesforce
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    await conn.sobject('Account').update({
      Id: account.Id,
      Customer_Brain__c: updatedNotes
    });

    // Confirm to user
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const accountUrl = `${sfBaseUrl}/lightning/r/Account/${account.Id}/view`;
    
    let confirmMessage = `✅ Note saved to ${account.Name}\n\n`;
    confirmMessage += `*Added to Customer_Brain:*\n${formattedNote}\n\n`;
    confirmMessage += `*Account Details:*\n`;
    confirmMessage += `Owner: ${account.Owner?.Name}\n`;
    confirmMessage += `<${accountUrl}|View Account in Salesforce>\n`;

    await client.chat.postMessage({
      channel: channelId,
      text: confirmMessage,
      thread_ts: threadTs
    });

  } catch (error) {
    logger.error('Failed to save Customer_Brain note:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error saving note: ${error.message}\n\nPlease try again or contact support.`,
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
 * Format account lookup results
 */
function formatAccountLookup(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const accountName = parsedIntent.entities.accounts?.[0] || 'that company';
    return `No account found for "${accountName}". The company might not be in your Salesforce or might be spelled differently.`;
  }

  const records = queryResult.records;
  const businessLeads = ['Julie Stefanich', 'Himanshu Agarwal', 'Asad Hussain', 'Ananth Cherukupally', 'David Van Ryk', 'John Cobb', 'Jon Cobb', 'Olivia Jung'];
  const unassignedHolders = ['Keigan Pesenti', 'Emmit Hood', 'Emmitt Hood', 'Mark Runyon', 'Derreck Chu', 'Sarah Rakhine'];
  
  const searchTerm = parsedIntent.entities.accounts[0].toLowerCase();
  
  // Find best match with priority: 1) Exact match with business lead, 2) Exact match, 3) Business lead, 4) Any match
  const exactMatchBusinessLead = records.find(r => 
    r.Name.toLowerCase() === searchTerm && businessLeads.includes(r.Owner?.Name)
  );
  
  const exactMatch = records.find(r => r.Name.toLowerCase() === searchTerm);
  
  // ANY business lead match (not just partial)
  const anyBusinessLeadMatch = records.find(r => businessLeads.includes(r.Owner?.Name));
  
  const partialMatch = records.find(r => r.Name.toLowerCase().includes(searchTerm));
  
  const primaryResult = exactMatchBusinessLead || exactMatch || anyBusinessLeadMatch || partialMatch || records[0];

  // Check if account is held by Keigan or other unassigned holders
  const currentOwner = primaryResult.Owner?.Name;
  const isHeldByKeigan = unassignedHolders.includes(currentOwner);
  const isBusinessLead = businessLeads.includes(currentOwner);

  let response = '';

  if (isHeldByKeigan && primaryResult.Prior_Account_Owner_Name__c) {
    // Secondary check: Show prior owner
    const priorOwner = primaryResult.Prior_Account_Owner_Name__c;
    
    if (businessLeads.some(bl => priorOwner && priorOwner.includes(bl))) {
      response = `*${primaryResult.Name}*\n`;
      response += `Prior Owner: ${priorOwner}\n`;
      response += `Current holder: ${currentOwner} (unassigned)\n`;
      if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
      response += `\nNote: This account was previously owned by a business lead but is currently unassigned.`;
    } else {
      response = `*${primaryResult.Name}*\n`;
      response += `Status: Unassigned account\n`;
      response += `Current holder: ${currentOwner}\n`;
      if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
      response += `\nThis account is not currently assigned to a business lead.`;
    }
  } else if (!isBusinessLead) {
    response = `*${primaryResult.Name}*\n`;
    response += `Status: Unassigned account\n`;
    response += `Current holder: ${currentOwner || 'No owner'}\n`;
    if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}\n`;
    response += `\nThis account is not currently assigned to a business lead.`;
  } else {
    response = `*${primaryResult.Name}*\n`;
    response += `Owner: ${currentOwner}\n`;
    response += `Email: ${primaryResult.Owner?.Email || 'No email available'}\n`;
    if (primaryResult.Industry) response += `Industry: ${primaryResult.Industry}`;
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
  
  let response = `*Accounts in ${stageName}*\n\n`;
  
  accounts.slice(0, 15).forEach(account => {
    response += `*${account.name}*\n`;
    response += `Owner: ${account.owner || 'Unassigned'}\n`;
    if (account.industry) response += `Industry: ${account.industry}\n`;
    if (account.dealCount > 1) response += `Deals: ${account.dealCount} (${formatCurrency(account.totalAmount)})\n`;
    response += '\n';
  });

  if (accounts.length > 15) {
    response += `_Showing 15 of ${accounts.length} accounts_`;
  }

  return response;
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
              WHERE Revenue_Type__c = 'ARR' AND IsClosed = true AND IsWon = true`;
    
    case 'loi_count':
      return `SELECT COUNT(Id) LOICount 
              FROM Opportunity 
              WHERE Revenue_Type__c = 'Booking' AND IsClosed = true AND IsWon = true`;
    
    case 'loi_accounts':
      // What accounts/companies have signed LOIs
      return `SELECT DISTINCT Account.Name, Account.Owner.Name
              FROM Opportunity 
              WHERE Revenue_Type__c = 'Booking' AND IsClosed = true AND IsWon = true
              ORDER BY Account.Name`;
    
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
  
  // Use correct fields: ACV__c for gross, Finance_Weighted_ACV__c for weighted
  return `SELECT StageName,
                 SUM(ACV__c) GrossAmount,
                 SUM(Finance_Weighted_ACV__c) WeightedAmount,
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
 * Format contract query results
 */
function formatContractResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const accountName = parsedIntent.entities.accounts?.[0];
    return accountName 
      ? `No contracts found for ${accountName}.`
      : `No contracts found in the system.`;
  }

  const records = queryResult.records;
  const accountName = parsedIntent.entities.accounts?.[0];
  
  let response = accountName 
    ? `*Contracts for ${accountName}*\n\n`
    : `*All Contracts* (${records.length} total)\n\n`;

  // Compact format for "all contracts", detailed for specific account
  const isCompactMode = !accountName || records.length > 10;

  records.forEach((contract, i) => {
    const contractName = contract.Contract_Name_Campfire__c || contract.ContractNumber || contract.Id;
    const accountNameDisplay = contract.Account?.Name || accountName;
    
    // Detect if it's an LOI (Customer Advisory Board, LOI, or CAB in name)
    const isLOI = contractName && (contractName.includes('Customer Advisory Board') || 
                                   contractName.includes('LOI') || 
                                   contractName.includes('CAB'));
    const typeLabel = isLOI ? ' [LOI]' : '';
    
    if (isCompactMode) {
      // Compact: Account - Download link only
      response += `${i + 1}. ${accountNameDisplay}${typeLabel}`;
      if (contract._pdfs && contract._pdfs.length > 0) {
        const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
        const downloadUrl = `${sfBaseUrl}/sfc/servlet.shepherd/version/download/${contract._pdfs[0].versionId}`;
        response += ` - <${downloadUrl}|Download PDF>`;
      }
      response += `\n`;
    } else {
      // Detailed format for specific accounts
      response += `${i + 1}. *${contractName}*${typeLabel}\n`;
      
      if (accountNameDisplay && !accountName) {
        response += `   Account: ${accountNameDisplay}\n`;
      }
      
      if (contract.StartDate) {
        response += `   Start: ${formatDate(contract.StartDate)}`;
        if (contract.EndDate) {
          response += ` → End: ${formatDate(contract.EndDate)}`;
        }
        response += '\n';
      }
      
      if (contract.ContractTerm) {
        response += `   Term: ${contract.ContractTerm} months\n`;
      }
      
      if (contract.Status) {
        response += `   Status: ${contract.Status}\n`;
      }
      
      // Add PDF download links
      if (contract._pdfs && contract._pdfs.length > 0) {
        const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
        contract._pdfs.forEach(pdf => {
          const downloadUrl = `${sfBaseUrl}/sfc/servlet.shepherd/version/download/${pdf.versionId}`;
          const fileName = pdf.title.length > 40 ? pdf.title.substring(0, 37) + '...' : pdf.title;
          response += `   <${downloadUrl}|Download: ${fileName}>\n`;
        });
      } else {
        // Fallback to Salesforce link
        const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
        const contractUrl = `${sfBaseUrl}/lightning/r/Contract/${contract.Id}/view`;
        response += `   <${contractUrl}|View in Salesforce>\n`;
      }
      
      response += '\n';
    }
  });

  response += `\n*Total: ${records.length} contract${records.length !== 1 ? 's' : ''}*`;
  if (accountName) {
    response += ` for ${accountName}`;
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
      const loiAcctNames = records.map(r => r.Account?.Name || r.Name).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      return `*Accounts with Signed LOIs: ${loiAcctCount}*\n\n${loiAcctNames}`;
    
    case 'arr_contracts':
      const contractCount = records[0].ARRContractCount || 0;
      return `*ARR Contracts: ${contractCount}*\n\nClosed won opportunities with Revenue_Type = ARR`;
    
    case 'loi_count':
      const loiCount = records[0].LOICount || 0;
      return `*Total LOIs Signed: ${loiCount}*\n\nClosed won opportunities with Revenue_Type = Booking`;
    
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
        text: `❌ Account "${accountName}" not found.\n\nTry: "who owns ${accountName}" to verify the account exists.`,
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    const openOpps = account.Opportunities || [];
    
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
      const updates = openOpps.map(opp => ({
        Id: opp.Id,
        StageName: 'Stage 7. Closed Lost',
        IsClosed: true,
        IsWon: false
      }));
      
      results = await conn.sobject('Opportunity').update(updates);
      
      // Handle both single result and array of results
      const resultsArray = Array.isArray(results) ? results : [results];
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
        confirmMessage += `${success} ${opp.Name} (${amount}) → Stage 7. Closed Lost\n`;
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
        text: `❌ Account "${accountName}" not found.\n\nTry: "who owns ${accountName}" to verify the account exists.`,
        thread_ts: threadTs
      });
      return;
    }
    
    const account = accountResult.records[0];
    const openOpps = account.Opportunities || [];
    
    if (openOpps.length === 0) {
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
    
    const updates = openOpps.map(opp => ({
      Id: opp.Id,
      StageName: 'Stage 7. Closed Lost',
      IsClosed: true,
      IsWon: false
    }));
    
    const results = await conn.sobject('Opportunity').update(updates);
    
    // Handle both single result and array of results
    const resultsArray = Array.isArray(results) ? results : [results];
    
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
      confirmMessage += `${success} ${opp.Name} (${amount}) → Stage 7. Closed Lost\n`;
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

module.exports = {
  registerEventHandlers
};
