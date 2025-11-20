const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { socratesAdapter } = require('./socratesAdapter');
const sampleQueries = require('../../data/sample-queries.json');
const opportunitySchema = require('../../data/schema-opportunity.json');
const accountSchema = require('../../data/schema-account.json');
const businessLogic = require('../../data/business-logic.json');

class IntentParser {
  constructor() {
    this.aiAdapter = socratesAdapter;
    this.model = process.env.SOCRATES_MODEL || process.env.OPENAI_MODEL || 'claude-opus-4.1';
    this.useOpenAI = process.env.USE_OPENAI === 'true';
    
    // Initialize OpenAI as fallback if specified
    if (this.useOpenAI) {
      const OpenAI = require('openai');
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * Parse user message and extract structured intent and entities
   */
  async parseIntent(userMessage, conversationContext = null, userId = null) {
    const startTime = Date.now();
    
    try {
      logger.info('🤖 Parsing user intent', { 
        message: userMessage.substring(0, 100),
        userId,
        hasContext: !!conversationContext 
      });

      // Build comprehensive prompt with context
      const prompt = this.buildIntentPrompt(userMessage, conversationContext);

      // Skip AI parsing - use fallback pattern matching which works better
      // Socrates/OpenAI was giving wrong intents, fallback is more reliable
      throw new Error('Using fallback pattern matching for reliability');

      // Log AI request
      logger.aiRequest(prompt, response.usage?.total_tokens, duration);

      // Validate and enhance the parsed result
      const validatedResult = this.validateAndEnhanceResult(result, userMessage, conversationContext);

      logger.info('✅ Intent parsed successfully', {
        intent: validatedResult.intent,
        entityCount: Object.keys(validatedResult.entities).length,
        followUp: validatedResult.followUp
      });

      return validatedResult;

    } catch (error) {
      logger.error('❌ Intent parsing failed:', error);
      
      // Fallback to pattern matching
      return this.fallbackPatternMatching(userMessage, conversationContext);
    }
  }

  /**
   * Build the intent parsing prompt with context
   */
  buildIntentPrompt(userMessage, conversationContext) {
    let prompt = `Analyze this GTM/Sales query and extract structured parameters.

User Query: "${userMessage}"`;

    // Add conversation context if available
    if (conversationContext && conversationContext.lastQuery) {
      prompt += `\n\nPrevious Context:
- Last Intent: ${conversationContext.lastQuery.intent}
- Last Filters: ${JSON.stringify(conversationContext.lastQuery.filters)}
- Timestamp: ${new Date(conversationContext.lastQuery.timestamp).toISOString()}`;
    }

    prompt += `\n\nAvailable Fields (Opportunity):
${this.getFieldSynonyms()}

Available Stages:
${opportunitySchema.fields.find(f => f.apiName === 'StageName')?.values?.join(', ')}

Business Segments:
- Enterprise: $100K+ deals
- Mid-Market: $25K-$100K deals  
- SMB: Under $25K deals

Time Periods:
today, yesterday, this_week, last_week, this_month, last_month, this_quarter, last_quarter, next_30_days, last_30_days

Return JSON with this exact structure:
{
  "intent": "pipeline_summary|deal_lookup|forecasting|activity_check|comparison|trend_analysis",
  "entities": {
    "timeframe": "today|this_week|this_month|this_quarter|last_30_days|custom|null",
    "customDateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
    "targetSignDate": "this_week|this_month|null",
    "stages": ["Stage 0 - Qualifying", "Stage 1 - Discovery"] | null,
    "segments": ["enterprise", "mid-market", "smb"] | null,
    "owners": ["Julie Stefanich", "Mike Masiello"] | null,
    "accounts": ["Resmed", "Intuit"] | null,
    "industry": "Healthcare & Pharmaceuticals|Technology|null",
    "amountThreshold": { "min": 100000, "max": null } | null,
    "type": "New Business|Upsell|Renewal|null",
    "isClosed": true|false|null,
    "isWon": true|false|null,
    "staleDays": 30|null,
    "daysInStage": 60|null,
    "dealHealth": "stale|at_risk|hot|stuck|null",
    "probabilityMin": 75|null,
    "probabilityMax": 25|null,
    "forecastCategory": ["Pipeline", "Best Case", "Commit"] | null,
    "isNewLogo": true|false|null,
    "metrics": ["count", "sum_amount", "avg_amount", "sum_weighted"] | null,
    "groupBy": ["StageName", "Owner.Name", "Account.Industry"] | null,
    "sortBy": { "field": "Amount", "direction": "desc" } | null,
    "limit": 50|null
  },
  "followUp": true|false,
  "refinement": { "type": "filter_add|filter_replace|drill_down", "target": "segment|stage|owner" } | null,
  "confidence": 0.95,
  "explanation": "Brief explanation of what the user is asking for"
}`;

    return prompt;
  }

  /**
   * Get system prompt for GPT-4
   */
  getSystemPrompt() {
    return `You are an expert GTM/Sales data analyst assistant. Your job is to parse natural language queries about sales pipeline, opportunities, accounts, and forecasting into structured parameters for Salesforce queries.

Key Guidelines:
1. Be precise with field mappings - use exact API names from the schema
2. Handle conversational follow-ups by merging with previous context
3. Recognize business terminology (pipeline = open deals, closed = won+lost deals)
4. Map common synonyms (rep = Owner.Name, deal = Opportunity, company = Account.Name)
5. Infer reasonable defaults (if asking about "deals" assume open deals unless specified)
6. Handle time periods intelligently (this month, next 30 days, Q4, etc.)
7. Recognize deal health indicators (stale, stuck, at risk, hot)
8. Set followUp=true if this seems like part of an ongoing conversation
9. Always provide confidence score and brief explanation

Business Context:
- This is for a healthcare technology company
- Stages: Qualifying → Discovery → SOO → Pilot → Proposal → Closed Won/Lost
- Enterprise deals are $100K+, Mid-Market $25K-$100K, SMB <$25K
- Stale deals = no activity 30+ days, Stuck = same stage 60+ days`;
  }

  /**
   * Get field synonyms for prompt context
   */
  getFieldSynonyms() {
    const fieldSynonyms = [];
    
    opportunitySchema.fields.forEach(field => {
      if (field.synonyms && field.synonyms.length > 0) {
        fieldSynonyms.push(`${field.apiName}: ${field.synonyms.join(', ')}`);
      }
    });

    return fieldSynonyms.slice(0, 20).join('\n'); // Limit to avoid token overflow
  }

  /**
   * Validate and enhance the parsed result
   */
  validateAndEnhanceResult(result, originalMessage, conversationContext) {
    // Set defaults
    const validated = {
      intent: result.intent || 'pipeline_summary',
      entities: result.entities || {},
      followUp: result.followUp || false,
      refinement: result.refinement || null,
      confidence: result.confidence || 0.8,
      explanation: result.explanation || 'General pipeline query',
      originalMessage,
      timestamp: Date.now()
    };

    // Handle follow-up context merging
    if (validated.followUp && conversationContext && conversationContext.lastQuery) {
      validated.entities = this.mergeContextEntities(
        conversationContext.lastQuery.entities,
        validated.entities,
        validated.refinement
      );
    }

    // Apply business logic defaults
    validated.entities = this.applyBusinessDefaults(validated.entities, validated.intent);

    // Validate field values
    validated.entities = this.validateFieldValues(validated.entities);

    return validated;
  }

  /**
   * Merge entities with conversation context
   */
  mergeContextEntities(previousEntities, newEntities, refinement) {
    const merged = { ...previousEntities };

    // Handle different refinement types
    if (refinement) {
      switch (refinement.type) {
        case 'filter_add':
          // Add new filters to existing ones
          Object.assign(merged, newEntities);
          break;
        
        case 'filter_replace':
          // Replace specific filter type
          if (refinement.target && newEntities[refinement.target]) {
            merged[refinement.target] = newEntities[refinement.target];
          }
          break;
        
        case 'drill_down':
          // Keep context but add more specific filters
          Object.assign(merged, newEntities);
          break;
        
        default:
          Object.assign(merged, newEntities);
      }
    } else {
      // Default merge behavior
      Object.assign(merged, newEntities);
    }

    return merged;
  }

  /**
   * Apply business logic defaults based on intent
   */
  applyBusinessDefaults(entities, intent) {
    const enhanced = { ...entities };

    // Default to open deals for pipeline queries
    if (intent === 'pipeline_summary' && enhanced.isClosed === undefined) {
      enhanced.isClosed = false;
    }

    // Default to won deals for performance queries
    if (intent === 'trend_analysis' && enhanced.isClosed === undefined) {
      enhanced.isClosed = true;
      enhanced.isWon = true;
    }

    // Set reasonable limits
    if (!enhanced.limit) {
      enhanced.limit = intent === 'trend_analysis' ? 50 : 100;
    }

    // Default sorting
    if (!enhanced.sortBy) {
      enhanced.sortBy = { field: 'Amount', direction: 'desc' };
    }

    return enhanced;
  }

  /**
   * Validate field values against schema
   */
  validateFieldValues(entities) {
    const validated = { ...entities };

    // Validate stage names
    if (validated.stages) {
      const validStages = opportunitySchema.fields.find(f => f.apiName === 'StageName')?.values || [];
      validated.stages = validated.stages.filter(stage => validStages.includes(stage));
    }

    // Validate segments
    if (validated.segments) {
      const validSegments = Object.keys(businessLogic.segments);
      validated.segments = validated.segments.filter(segment => validSegments.includes(segment));
    }

    // Validate numeric values
    if (validated.amountThreshold) {
      if (validated.amountThreshold.min && validated.amountThreshold.min < 0) {
        validated.amountThreshold.min = 0;
      }
    }

    // Validate probability ranges
    if (validated.probabilityMin && (validated.probabilityMin < 0 || validated.probabilityMin > 100)) {
      validated.probabilityMin = Math.max(0, Math.min(100, validated.probabilityMin));
    }

    return validated;
  }

  /**
   * Fallback pattern matching if GPT-4 fails
   */
  fallbackPatternMatching(userMessage, conversationContext) {
    logger.info('🔄 Using fallback pattern matching');

    const message = userMessage.toLowerCase();
    const entities = {};
    let intent = 'pipeline_summary';

    // Handle greetings and simple responses
    if (this.isGreeting(message)) {
      return {
        intent: 'greeting',
        entities: {},
        followUp: false,
        confidence: 0.9,
        explanation: 'User greeting',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }

    // Handle conversational queries
    if (this.isConversational(message)) {
      return {
        intent: 'conversation',
        entities: {},
        followUp: false,
        confidence: 0.8,
        explanation: 'Conversational query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }

    // Account existence check (PRIORITY - before regular lookup)
    if (message.includes('does') && message.includes('exist') && !message.includes('not exist')) {
      intent = 'account_existence_check';
      
      // Extract company name
      const existMatch = message.match(/does (.+?) exist/i) ||
                         message.match(/(.+?) exist/i);
      
      if (existMatch && existMatch[1]) {
        entities.accounts = [existMatch[1].trim()];
      }
      
      return {
        intent: 'account_existence_check',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Check if account exists in Salesforce',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Account creation with assignment
    if ((message.includes('create') || message.includes('add')) && 
        (message.includes('and assign to bl') || message.includes('and assign to business lead') || 
         message.includes('assign to bl'))) {
      intent = 'create_account';
      
      // Extract company name - more flexible patterns
      const createMatch = message.match(/create (?:account for |account |)(.+?)(?:\s+and assign|$)/i) ||
                         message.match(/add (?:account for |account |)(.+?)(?:\s+and assign|$)/i) ||
                         message.match(/create (.+?) and assign/i);
      
      if (createMatch && createMatch[1]) {
        entities.accounts = [createMatch[1].trim()];
      }
      
      return {
        intent: 'create_account',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Create account and assign to BL',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Manual account assignment/reassignment
    if ((message.includes('assign') || message.includes('reassign')) && 
        message.includes(' to ') && 
        !message.includes('assign to bl') &&
        !message.includes('create opp') && !message.includes('create opportunity')) {
      intent = 'reassign_account';
      
      // Extract account name and BL name
      const assignMatch = message.match(/(?:assign|reassign) (.+?) to (.+?)(?:\?|$)/i);
      
      if (assignMatch) {
        entities.accounts = [assignMatch[1].trim()];
        entities.targetBL = assignMatch[2].trim();
      }
      
      return {
        intent: 'reassign_account',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Reassign account to specific BL',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Opportunity creation (Keigan only)
    // Match: "create opp for X", "create an opp for X", "create a stage 1 opportunity for X"
    if ((message.includes('create') || message.includes('add')) && 
        (message.includes('opp ') || message.includes('opportunity')) &&
        message.includes(' for ') &&
        !message.includes('account') && !message.includes('assign to bl')) {
      intent = 'create_opportunity';
      
      // Extract account name - handles "create a stage 1 opportunity for GTM Test Company"
      // Pattern: Look for "for [ACCOUNT NAME]" - account name is everything after "for"
      const oppMatch = message.match(/(?:opp|opportunity) for (.+?)(?:\s*\.\s*|$)/i);
      
      if (oppMatch && oppMatch[1]) {
        let extractedName = oppMatch[1].trim();
        
        // Stop before field keywords
        const fieldKeywords = [
          ' and stage',
          ' and acv',
          ' and \\$',
          ' and target',
          ' with ',
          '\\. stage',
          '\\. acv'
        ];
        
        for (const keyword of fieldKeywords) {
          const regex = new RegExp(keyword, 'i');
          const match = extractedName.match(regex);
          if (match) {
            extractedName = extractedName.substring(0, match.index).trim();
            break;
          }
        }
        
        entities.accounts = [extractedName];
      }
      
      // Extract inline fields if mentioned (Stage, ACV, Target Sign, Product Line)
      // Parse inline natural language: "stage 4 and $300k acv and target sign of 11/31/2025"
      
      // Stage detection
      const stageMatch = message.match(/stage\s+(\d+)/i);
      if (stageMatch) {
        entities.stage = stageMatch[1];
      }
      
      // ACV detection (multiple formats)
      const acvMatch = message.match(/\$(\d+)k\s+acv/i) || 
                      message.match(/acv\s+\$?(\d+)k/i) ||
                      message.match(/\$(\d{1,3}(?:,\d{3})*)/);
      if (acvMatch) {
        // Convert to number (handle $300k format)
        let acvValue = acvMatch[1].replace(/,/g, '');
        if (message.match(/\d+k/i)) {
          acvValue = parseInt(acvValue) * 1000; // Convert 300k to 300000
        }
        entities.acv = parseInt(acvValue);
      }
      
      // Target Sign Date detection
      const dateMatch = message.match(/target sign (?:of |date |)(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                       message.match(/sign (?:date |)(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (dateMatch) {
        entities.targetDate = dateMatch[1];
      }
      
      // Product Line detection
      const productMatch = message.match(/product line:?\s+(.+?)(?:\n|and|with|stage|acv|\$|target|revenue|$)/i);
      if (productMatch) {
        entities.productLine = productMatch[1].trim();
      }
      
      // Revenue Type detection (CORRECT picklist values: Recurring, Booking, Project)
      const revenueMatch = message.match(/revenue type:?\s+(recurring|booking|project)/i) ||
                          message.match(/type:?\s+(recurring|booking|project)/i) ||
                          message.match(/\b(recurring|booking|project)\s+opp/i); // Also match "booking opp"
      if (revenueMatch) {
        // Capitalize first letter to match Salesforce picklist
        const typeValue = revenueMatch[1].charAt(0).toUpperCase() + revenueMatch[1].slice(1).toLowerCase();
        entities.revenueType = typeValue; // "Recurring", "Booking", or "Project"
      }
      
      // Mark as simple mode if no inline fields detected
      entities.simpleMode = !stageMatch && !acvMatch && !dateMatch && !productMatch && !revenueMatch;
      entities.createOpp = true;
      
      return {
        intent: 'create_opportunity',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Create opportunity for account',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Handle ownership and business lead questions - PRIORITY INTENT
    if (message.includes('who owns') || message.includes('who is the owner') || 
        message.includes('who\'s the owner') || message.includes('whos the owner') ||
        message.includes('owner of') || message.includes('owns ') ||
        message.includes('who\'s assigned') || message.includes('assigned to') ||
        message.includes('who is the bl') || message.includes('who\'s the bl') ||
        message.includes('business lead') || message.includes('bl for') ||
        message.includes('bl at')) {
      intent = 'account_lookup';
      entities.includeAccount = true;
      
      // Extract company name with better patterns including BL variations
      const companyMatch = message.match(/who owns (.+?)(?:\?|$)/i) || 
                          message.match(/who'?s the owner of (.+?)(?:\?|$)/i) ||
                          message.match(/owner.*?of (.+?)(?:\?|$)/i) ||
                          message.match(/owns (.+?)(?:\?|$)/i) ||
                          message.match(/assigned to (.+?)(?:\?|$)/i) ||
                          message.match(/bl for (.+?)(?:\?|$)/i) ||
                          message.match(/bl at (.+?)(?:\?|$)/i) ||
                          message.match(/business lead.*?(.+?)(?:\?|$)/i) ||
                          message.match(/who.*?the.*?(.+?)(?:\?|$)/i);
      
      if (companyMatch && companyMatch[1]) {
        entities.accounts = [companyMatch[1].trim().replace('@GTM Brain', '').trim()];
      }
      
      return {
        intent: 'account_lookup',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Account ownership query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }

    // Handle comprehensive pipeline and deal queries
    
    // Post-call summary (BLs - uses Socrates to structure notes)
    if ((message.includes('post-call summary') || message.includes('post call summary') || 
         message.includes('meeting summary') || message.includes('call summary')) &&
        (message.length > 100 || message.split('\n').length > 3)) {
      intent = 'post_call_summary';
      
      entities.summaryCapture = true;
      
      return {
        intent: 'post_call_summary',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Structure post-call summary using Socrates AI',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Customer Brain note capture (HIGHEST PRIORITY - Keigan only)
    if (message.includes('add to customer') || message.includes('save note') || 
        message.includes('log note') || message.includes('customer history')) {
      intent = 'save_customer_note';
      
      // The note is the original message (we'll extract it later)
      entities.noteCapture = true;
      
      return {
        intent: 'save_customer_note',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Save note to Customer_Brain',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Account Plan save (ALL USERS can save) - CHECK FIRST (has structured fields)
    if ((message.includes('add account plan') || message.includes('save account plan') || 
         message.includes('update account plan')) &&
        (message.includes('clo engagement') || message.includes('budget holder') || 
         message.includes('champion') || message.includes('use case') || 
         message.includes('why eudia') || message.includes('why now') || message.includes('why at all'))) {
      intent = 'save_account_plan';
      
      return {
        intent: 'save_account_plan',
        entities: { accountPlanCapture: true },
        followUp: false,
        confidence: 0.95,
        explanation: 'Save account plan to Account_Plan_s__c',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Account Plan query (GET account plan) - CHECK AFTER save (no structured fields)
    if ((message.includes('account plan') || message.includes('strategic plan') || 
         message.includes('account strategy')) &&
        !message.includes('add account plan') && !message.includes('save account plan') && 
        !message.includes('update account plan')) {
      intent = 'query_account_plan';
      
      // Extract account name
      const planMatch = message.match(/account plan (?:for |at )?(.+?)(?:\?|$)/i) ||
                       message.match(/(?:what\'?s|show|get)(?: the)? account plan(?: for| at)? (.+?)(?:\?|$)/i) ||
                       message.match(/(.+?)(?:'s| account) (?:plan|strategy)/i);
      
      if (planMatch && planMatch[1]) {
        entities.accounts = [planMatch[1].trim()
          .replace(/the account plan/gi, '')
          .replace(/account plan/gi, '')
          .trim()];
      }
      
      return {
        intent: 'query_account_plan',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Query account plan',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Send Johnson Hana Pipeline Report (specific filtered report)
    if ((message.includes('send') || message.includes('generate') || message.includes('create')) &&
        (message.includes('johnson') || message.includes('hana')) &&
        (message.includes('pipeline') || message.includes('report')) &&
        (message.includes('excel') || message.includes('spreadsheet') || message.includes('xlsx'))) {
      intent = 'send_johnson_hana_excel';
      
      return {
        intent: 'send_johnson_hana_excel',
        entities: { reportType: 'johnson_hana' },
        followUp: false,
        confidence: 0.95,
        explanation: 'Generate Johnson Hana filtered pipeline Excel report',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Send Full Pipeline Report in Excel (all active pipeline)
    if ((message.includes('send') || message.includes('generate') || message.includes('create')) &&
        (message.includes('pipeline') || message.includes('report')) &&
        (message.includes('excel') || message.includes('spreadsheet') || message.includes('xlsx'))) {
      intent = 'send_excel_report';
      
      return {
        intent: 'send_excel_report',
        entities: { reportType: 'full_pipeline' },
        followUp: false,
        confidence: 0.95,
        explanation: 'Generate full active pipeline Excel report',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Account Management - Move to Nurture (Keigan only)
    if (message.includes('move') && message.includes('nurture') ||
        message.includes('mark') && message.includes('nurture') ||
        message.includes('set') && message.includes('nurture')) {
      intent = 'move_to_nurture';
      
      // Extract account name
      const nurtureMatch = message.match(/move (.+?) to nurture/i) ||
                          message.match(/mark (.+?) as nurture/i) ||
                          message.match(/set (.+?) to nurture/i) ||
                          message.match(/nurture (.+?)(?:\?|$)/i);
      
      if (nurtureMatch && nurtureMatch[1]) {
        entities.accounts = [nurtureMatch[1].trim()];
      }
      
      return {
        intent: 'move_to_nurture',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Move account to nurture status',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Account Management - Close Lost (Keigan only)
    if ((message.includes('close') || message.includes('mark')) && 
        (message.includes('lost') || message.includes('closed lost')) ||
        message.includes('close lost')) {
      intent = 'close_account_lost';
      
      // Extract account name
      const lostMatch = message.match(/close (.+?) (?:as )?lost/i) ||
                       message.match(/mark (.+?) (?:as )?(?:closed )?lost/i) ||
                       message.match(/close (.+?)(?:\?|$)/i) ||
                       message.match(/lost (.+?)(?:\?|$)/i);
      
      if (lostMatch && lostMatch[1]) {
        const accountName = lostMatch[1]
          .replace(/as lost/i, '')
          .replace(/as closed lost/i, '')
          .replace(/to lost/i, '')
          .trim();
        entities.accounts = [accountName];
      }
      
      // Extract loss reason if provided
      const reasonMatch = message.match(/(?:because|reason:?|due to) (.+?)(?:\?|$)/i);
      if (reasonMatch && reasonMatch[1]) {
        entities.lossReason = reasonMatch[1].trim();
      }
      
      return {
        intent: 'close_account_lost',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Close account and all opportunities as lost',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Contract/PDF queries (HIGHEST PRIORITY)
    if ((message.includes('contracts') || message.includes('pdfs') || 
         message.includes('loi contract') || message.includes('loi agreement') ||
         message.includes('signed loi detail')) &&
        !message.includes('how many') && !message.includes('arr contracts')) {
      intent = 'contract_query';
      
      // Check if specifically asking for LOIs
      if (message.includes('loi')) {
        entities.contractType = 'LOI'; // Filter to Customer Advisory Board contracts
      }
      
      // Extract account name (but NOT for "all contracts" or "show me contracts")
      if (!message.includes('all contracts') && !message.includes('show me all')) {
        const accountMatch = message.match(/contracts for (.+?)(?:\?|$)/i) ||
                            message.match(/pdfs for (.+?)(?:\?|$)/i) ||
                            message.match(/loi.*?for (.+?)(?:\?|$)/i);
        
        if (accountMatch && accountMatch[1]) {
          const extracted = accountMatch[1].trim();
          // Filter out generic words
          if (!extracted.includes('all') && !extracted.includes('show') && 
              !extracted.includes('me') && extracted.length > 2) {
            entities.accounts = [extracted];
          }
        }
      }
      
      return {
        intent: 'contract_query',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Contract/PDF query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Weighted pipeline/ACV summary queries (HIGHEST PRIORITY)
    if (message.includes('weighted pipeline') || message.includes('weighted acv') ||
        (message.includes('weighted') && message.includes('pipeline'))) {
      intent = 'weighted_summary';
      entities.isClosed = false;
      
      // Handle timeframe
      if (message.includes('this month')) {
        entities.timeframe = 'this_month';
      } else if (message.includes('this quarter')) {
        entities.timeframe = 'this_quarter';
      } else if (message.includes('this year')) {
        entities.timeframe = 'this_year';
      }
      
      return {
        intent: 'weighted_summary',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Weighted pipeline summary query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // "What accounts/companies/customers have signed" queries
    if ((message.includes('what accounts') || message.includes('what companies') || message.includes('what customers') || message.includes('which accounts') || message.includes('which companies')) &&
        (message.includes('signed') || message.includes('have signed'))) {
      intent = 'count_query';
      
      if (message.includes('loi')) {
        entities.countType = 'loi_accounts';
      } else if (message.includes('arr') || message.includes('recurring')) {
        entities.countType = 'arr_customers';
      } else {
        entities.countType = 'total_customers';
      }
      
      return {
        intent: 'count_query',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Accounts that have signed query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Customer/Contract count queries (HIGHEST PRIORITY)
    if (message.includes('how many')) {
      if (message.includes('customers') || message.includes('clients')) {
        intent = 'count_query';
        entities.countType = message.includes('arr') ? 'arr_customers' : 'total_customers';
        return {
          intent: 'count_query',
          entities,
          followUp: false,
          confidence: 0.95,
          explanation: 'Customer count query',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      } else if (message.includes('contracts') && message.includes('arr')) {
        intent = 'count_query';
        entities.countType = 'arr_contracts';
        return {
          intent: 'count_query',
          entities,
          followUp: false,
          confidence: 0.95,
          explanation: 'ARR contract count query',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      } else if (message.includes('loi')) {
        intent = 'count_query';
        entities.countType = 'loi_count';
        return {
          intent: 'count_query',
          entities,
          followUp: false,
          confidence: 0.95,
          explanation: 'LOI count query',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      }
    }
    
    // Average days queries (HIGH PRIORITY)
    if ((message.includes('average') || message.includes('avg')) && 
        (message.includes('days in stage') || message.includes('stage'))) {
      intent = 'average_days_query';
      
      const stageMatch = message.match(/stage (\d+)/i);
      if (stageMatch) {
        const stageMap = {
          '0': 'Stage 0 - Qualifying',
          '1': 'Stage 1 - Discovery',
          '2': 'Stage 2 - SQO',
          '3': 'Stage 3 - Pilot',
          '4': 'Stage 4 - Proposal'
        };
        entities.stages = [stageMap[stageMatch[1]]];
      }
      
      return {
        intent: 'average_days_query',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Average days in stage query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Product line + stage queries (HIGHEST PRIORITY - check before general stage queries)
    if (message.includes('contracting') || message.includes('m&a') || 
        message.includes('compliance') || message.includes('sigma') || 
        message.includes('cortex') || message.includes('litigation')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      
      // Map product line to EXACT Salesforce values
      if (message.includes('contracting')) {
        entities.productLine = 'AI-Augmented Contracting';
      } else if (message.includes('m&a') || message.includes('mna') || message.includes('m and a')) {
        entities.productLine = 'Augmented-M&A'; // Actual value in Salesforce
      } else if (message.includes('compliance')) {
        entities.productLine = 'Compliance';
      } else if (message.includes('sigma')) {
        entities.productLine = 'sigma';
      } else if (message.includes('cortex')) {
        entities.productLine = 'Cortex';
      } else if (message.includes('multiple')) {
        entities.productLine = 'Multiple';
      } else if (message.includes('litigation')) {
        entities.productLine = 'LITIGATION_NOT_EXIST'; // Flag for no results message
      }
      
      // Map stage if specified
      if (message.includes('late stage') || message.includes('late-stage') || message.includes('stage 4')) {
        entities.stages = ['Stage 4 - Proposal'];
      } else if (message.includes('mid stage') || message.includes('mid-stage') || message.includes('stage 2') || message.includes('stage 3')) {
        entities.stages = ['Stage 2 - SQO', 'Stage 3 - Pilot'];
      } else if (message.includes('early stage') || message.includes('early-stage') || message.includes('stage 1')) {
        entities.stages = ['Stage 1 - Discovery'];
      }
      
      return {
        intent: 'pipeline_summary',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Product line and stage query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Stage-specific queries (MUST come after product line queries)
    else if (message.includes('early stage') || message.includes('early-stage')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 1 - Discovery'];
    } else if (message.includes('mid stage') || message.includes('mid-stage')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 2 - SQO', 'Stage 3 - Pilot'];
    } else if (message.includes('late stage') || message.includes('late-stage')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 4 - Proposal'];
    }
    
    // Specific stage queries
    else if (message.includes('stage 0') || message.includes('qualifying')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 0 - Qualifying'];
    } else if (message.includes('stage 1') || message.includes('discovery')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 1 - Discovery'];
    } else if (message.includes('stage 2') || message.includes('sqo')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 2 - SQO'];
    } else if (message.includes('stage 3') || message.includes('pilot')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 3 - Pilot'];
    } else if (message.includes('stage 4') || message.includes('proposal')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
      entities.stages = ['Stage 4 - Proposal'];
    }
    
    // Closed deal queries with recency
    else if (message.includes('deals we closed') || message.includes('what closed') || 
             message.includes('deals closed') || message.includes('recent wins')) {
      intent = 'deal_lookup';
      entities.isClosed = true;
      entities.isWon = true;
      
      // Handle recency
      if (message.includes('recently') || message.includes('this week')) {
        entities.timeframe = 'this_week';
      } else if (message.includes('today')) {
        entities.timeframe = 'today';
      } else if (message.includes('this month')) {
        entities.timeframe = 'this_month';
      }
    }
    
    // LOI signing queries (uses Target LOI Date) - MUST be checked early
    else if (message.includes('loi') || message.includes('lois')) {
      intent = 'deal_lookup';
      entities.isClosed = true;
      entities.isWon = true;
      entities.bookingType = 'Booking'; // Only booking opportunities
      
      if (message.includes('last two weeks') || message.includes('past two weeks') || message.includes('last 2 weeks')) {
        entities.loiDate = 'last_14_days';
      } else if (message.includes('last week')) {
        entities.loiDate = 'last_week';
      } else if (message.includes('this week')) {
        entities.loiDate = 'this_week';
      } else if (message.includes('last month')) {
        entities.loiDate = 'last_month';
      } else if (message.includes('this month')) {
        entities.loiDate = 'this_month';
      }
      
      return {
        intent: 'deal_lookup',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'LOI signing query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Bookings queries
    else if (message.includes('bookings') || message.includes('how many bookings')) {
      intent = 'deal_lookup';
      entities.isClosed = true;
      entities.isWon = true;
      entities.dealType = 'bookings';
      
      if (message.includes('signed') || message.includes('this week')) {
        entities.timeframe = 'this_week';
      } else if (message.includes('this month')) {
        entities.timeframe = 'this_month';
      }
    }
    
    // ARR/Recurring queries
    else if (message.includes('arr') || message.includes('recurring') || message.includes('renewals')) {
      intent = 'deal_lookup';
      
      // Check if asking about closed/signed deals or pipeline
      if (message.includes('signed') || message.includes('closed') || message.includes('have signed') || message.includes('signed in')) {
        entities.isClosed = true;
        entities.isWon = true;
        entities.dealType = 'arr'; // Use Revenue_Type__c = 'Recurring'
        
        // Handle timeframe
        if (message.includes('last week')) {
          entities.timeframe = 'last_week';
        } else if (message.includes('this week')) {
          entities.timeframe = 'this_week';
        } else if (message.includes('last month')) {
          entities.timeframe = 'last_month';
        } else if (message.includes('this month')) {
          entities.timeframe = 'this_month';
        }
      } else {
        // Pipeline ARR deals
        entities.isClosed = false;
        entities.dealType = 'arr';
      }
      
      return {
        intent: 'deal_lookup',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'ARR/Recurring deals query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Pipeline addition queries
    else if (message.includes('added to pipeline') || message.includes('new deals') || 
             message.includes('deals created')) {
      intent = 'deal_lookup';
      entities.isClosed = false;
      entities.createdTimeframe = 'this_week'; // Special handling for creation date
      // Don't set timeframe - we only want to filter by creation date
      
      return {
        intent: 'deal_lookup',
        entities,
        followUp: false,
        confidence: 0.9,
        explanation: 'Pipeline additions query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Advanced account field queries - Legal team/members
    else if (message.includes('legal team') || message.includes('legal department') ||
             message.includes('legal members') || message.includes('number of legal')) {
      intent = 'account_field_lookup';
      entities.fieldType = 'legal_team_size';
      entities.includeAccount = true;
      
      // Extract company name if specified
      const companyMatch = message.match(/legal.*?(?:at|for) (.+?)(?:\?|$)/i) ||
                          message.match(/(?:at|for) (.+?)(?:\?|$)/i) ||
                          message.match(/legal.*?members.*?at (.+?)(?:\?|$)/i);
      
      if (companyMatch && companyMatch[1]) {
        const extracted = companyMatch[1].trim();
        // Filter out noise words
        if (!extracted.includes('how many') && !extracted.includes('number')) {
          entities.accounts = [extracted];
        }
      }
      
      return {
        intent: 'account_field_lookup',
        entities,
        followUp: false,
        confidence: 0.95,
        explanation: 'Legal team size query',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }
    
    // Harvey/competitor mentions
    else if (message.includes('harvey') || message.includes('mentioned harvey')) {
      intent = 'account_field_lookup';
      entities.fieldType = 'harvey_mentions';
      entities.includeAccount = true;
      entities.searchTerm = 'harvey';
    }
    
    // Pain points queries
    else if (message.includes('pain points') || message.includes('challenges identified')) {
      intent = 'account_field_lookup';
      entities.fieldType = 'pain_points';
      entities.includeAccount = true;
    }
    
    // Use cases queries - Check if asking about SPECIFIC account or general list
    else if (message.includes('use cases') || message.includes('discussing')) {
      intent = 'account_field_lookup';
      entities.fieldType = 'use_cases';
      entities.includeAccount = true;
      
      // Extract specific account name if mentioned
      const accountMatch = message.match(/use cases is (.+?) discussing/i) ||
                          message.match(/(.+?) discussing/i) ||
                          message.match(/use cases.*?at (.+?)(?:\?|$)/i);
      
      if (accountMatch && accountMatch[1]) {
        const extracted = accountMatch[1].trim();
        // Only set as account if it doesn't contain generic words
        if (!extracted.includes('accounts') && !extracted.includes('which') && !extracted.includes('what') && extracted.length > 2) {
          entities.accounts = [extracted];
        }
      }
      
      // Extract product line search term
      if (message.includes('contracting')) {
        entities.searchTerm = 'contracting';
      } else if (message.includes('m&a')) {
        entities.searchTerm = 'm&a';
      } else if (message.includes('compliance')) {
        entities.searchTerm = 'compliance';
      } else if (message.includes('litigation')) {
        entities.searchTerm = 'litigation';
      }
    }
    
    // Decision makers queries
    else if (message.includes('key decision makers') || message.includes('decision makers') ||
             message.includes('stakeholders') || message.includes('who are the decision makers')) {
      intent = 'account_field_lookup';
      entities.fieldType = 'decision_makers';
      entities.includeAccount = true;
      
      // Extract company name
      const companyMatch = message.match(/decision makers.*?at (.+?)(?:\?|$)/i) ||
                          message.match(/(.+?).*?decision makers/i);
      if (companyMatch && companyMatch[1]) {
        entities.accounts = [companyMatch[1].trim()];
      }
    }
    
    // Cross queries (accounts interested in contracting + in stage)
    else if (message.includes('interested in contracting') && message.includes('stage')) {
      intent = 'cross_query';
      entities.includeAccount = true;
      entities.crossType = 'contracting_stage';
      
      const stageMatch = message.match(/stage (\d+)/i);
      if (stageMatch) {
        entities.stages = [`Stage ${stageMatch[1]} - ${this.getStageNameFromNumber(stageMatch[1])}`];
      }
    }
    
    // Account-in-stage queries (e.g., "What accounts are in Stage 2?")
    else if (message.includes('accounts') && (message.includes('stage') || message.includes('in '))) {
      intent = 'account_stage_lookup';
      entities.includeAccount = true;
      
      // Extract stage
      const stageMatch = message.match(/stage (\d+)/i) || message.match(/(qualifying|discovery|sqo|pilot|proposal)/i);
      if (stageMatch) {
        const stageMap = {
          '0': 'Stage 0 - Qualifying',
          '1': 'Stage 1 - Discovery',
          '2': 'Stage 2 - SQO',
          '3': 'Stage 3 - Pilot', 
          '4': 'Stage 4 - Proposal',
          'qualifying': 'Stage 0 - Qualifying',
          'discovery': 'Stage 1 - Discovery',
          'sqo': 'Stage 2 - SQO',
          'pilot': 'Stage 3 - Pilot',
          'proposal': 'Stage 4 - Proposal'
        };
        entities.stages = [stageMap[stageMatch[1].toLowerCase()]];
      }
    }
    
    // General pipeline queries
    else if (message.includes('pipeline') || message.includes('deals')) {
      intent = 'pipeline_summary';
      entities.isClosed = false;
    }

    // "Target" keyword = active pipeline ONLY (CRITICAL: exclude closed deals)
    if (message.includes('target')) {
      entities.isClosed = false; // Force active only
      intent = 'pipeline_summary'; // Ensure it's pipeline, not deal_lookup
    }
    
    // Basic intent detection
    if (message.includes('closed') || message.includes('won')) {
      intent = 'deal_lookup';
      entities.isClosed = true;
      entities.isWon = true;
    } else if (message.includes('stale') || message.includes('stuck')) {
      intent = 'activity_check';
      entities.staleDays = 30;
    } else if (message.includes('forecast')) {
      intent = 'forecasting';
    }

    // Basic time detection
    if (message.includes('today')) entities.timeframe = 'today';
    else if (message.includes('this week')) entities.timeframe = 'this_week';
    else if (message.includes('this month')) entities.timeframe = 'this_month';
    else if (message.includes('this quarter')) entities.timeframe = 'this_quarter';

    // Basic stage detection
    const stages = opportunitySchema.fields.find(f => f.apiName === 'StageName')?.values || [];
    stages.forEach(stage => {
      if (message.includes(stage.toLowerCase())) {
        entities.stages = entities.stages || [];
        entities.stages.push(stage);
      }
    });

    // IMPROVED: Detect truly unknown queries
    // If intent is still pipeline_summary (default) and message doesn't contain expected keywords,
    // mark as unknown for better handling
    const pipelineKeywords = ['pipeline', 'deals', 'opportunities', 'opps', 'stage', 'closed', 'won', 'lost', 'forecast', 'target'];
    const accountKeywords = ['account', 'company', 'owner', 'owns', 'who'];
    const contractKeywords = ['contract', 'pdf', 'loi', 'agreement'];
    const allKnownKeywords = [...pipelineKeywords, ...accountKeywords, ...contractKeywords];
    
    const hasKnownKeyword = allKnownKeywords.some(keyword => message.includes(keyword));
    const hasQuestionWord = /what|who|when|where|how|show|tell|get|give|find/i.test(message);
    
    // If it's a question without known keywords and intent is default pipeline_summary, mark as unknown
    if (intent === 'pipeline_summary' && hasQuestionWord && !hasKnownKeyword && Object.keys(entities).length <= 1) {
      // Extract key nouns/words for clarification
      const words = message.toLowerCase()
        .replace(/[?!.,]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['what', 'when', 'where', 'show', 'tell', 'give', 'with', 'this', 'that', 'from', 'have', 'about', 'could', 'would', 'should'].includes(w));
      
      return {
        intent: 'unknown_query',
        entities: { 
          extractedWords: words.slice(0, 5), // Keep top 5 words
          originalIntent: intent
        },
        followUp: false,
        confidence: 0.3,
        explanation: 'Query not understood - needs clarification',
        originalMessage: userMessage,
        timestamp: Date.now()
      };
    }

    return {
      intent,
      entities,
      followUp: false,
      confidence: 0.6,
      explanation: 'Parsed using fallback pattern matching',
      originalMessage: userMessage,
      timestamp: Date.now()
    };
  }

  /**
   * Get cached intent for similar queries
   */
  async getCachedIntent(userMessage) {
    const messageHash = require('crypto')
      .createHash('md5')
      .update(userMessage.toLowerCase())
      .digest('hex');
    
    return await cache.get(`intent_cache:${messageHash}`);
  }

  /**
   * Cache parsed intent for future use
   */
  async cacheIntent(userMessage, result) {
    const messageHash = require('crypto')
      .createHash('md5')
      .update(userMessage.toLowerCase())
      .digest('hex');
    
    await cache.set(`intent_cache:${messageHash}`, result, 3600); // 1 hour
  }

  /**
   * Check if message is a greeting
   */
  isGreeting(message) {
    // Only trigger on EXACT greetings, not phrases containing these words
    const exactGreetings = ['hello', 'hi', 'hey', 'howdy', 'good morning', 'good afternoon', 'good evening'];
    
    // Must be short and match exactly (not part of a longer query)
    const words = message.toLowerCase().trim().split(/\s+/);
    
    return words.length <= 3 && exactGreetings.some(greeting => words.includes(greeting));
  }

  /**
   * Get stage name from number
   */
  getStageNameFromNumber(stageNum) {
    const stageNames = {
      '0': 'Qualifying',
      '1': 'Discovery', 
      '2': 'SQO',
      '3': 'Pilot',
      '4': 'Proposal'
    };
    return stageNames[stageNum] || 'Unknown';
  }

  /**
   * Check if message is conversational (not a business query)
   */
  isConversational(message) {
    const conversationalPhrases = [
      'how are you', 'what can you do', 'tell me about yourself', 'can you help me understand',
      'what do you know about yourself', 'chat with me', 'talk to me', 'can we chat',
      'what are your capabilities'
    ];
    
    // Must be exact phrase match, not just containing the words
    return conversationalPhrases.some(phrase => message.includes(phrase)) && !message.includes('deals') && !message.includes('accounts');
  }
}

// Export singleton instance
const intentParser = new IntentParser();

module.exports = {
  IntentParser,
  intentParser,
  parseIntent: (message, context, userId) => intentParser.parseIntent(message, context, userId)
};
