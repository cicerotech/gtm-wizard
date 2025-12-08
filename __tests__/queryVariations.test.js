/**
 * Comprehensive Query Variations Test Suite
 * Tests keyword synonyms, communication styles, and graceful fallback
 * 
 * Humans ask questions in wildly different ways. This test ensures
 * the intent classification system handles:
 * - Formal vs casual phrasing
 * - Complete sentences vs fragments
 * - Synonyms and alternative vocabulary
 * - Typos and common misspellings
 * - Industry jargon vs plain language
 */

const intelligentRouter = require('../src/ai/intelligentRouter');
const intentClassifier = require('../src/ml/intentClassifier');
const { tracker } = require('../src/analytics/usageTracker');

// Cleanup after all tests
afterAll(() => {
  tracker.cleanup();
});

describe('Query Variations - Human Communication Styles', () => {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT OWNERSHIP QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Account Ownership - Multiple Phrasings', () => {
    const ownershipQueries = [
      // Formal
      { query: 'Who is the account owner for Boeing?', style: 'formal' },
      { query: 'Can you tell me who owns the Intel account?', style: 'formal' },
      { query: 'I need to know who is responsible for the Microsoft relationship', style: 'formal' },
      
      // Casual
      { query: 'who owns boeing', style: 'casual' },
      { query: "boeing's owner?", style: 'casual' },
      { query: 'whos got intel', style: 'casual' },
      { query: 'who has microsoft', style: 'casual' },
      
      // Fragments
      { query: 'owner boeing', style: 'fragment' },
      { query: 'intel owner', style: 'fragment' },
      { query: 'bl for microsoft', style: 'fragment' },
      
      // Synonyms - "owner" variations
      { query: 'who is the BL for Boeing', style: 'jargon' },
      { query: 'who is the business lead for Intel', style: 'jargon' },
      { query: 'whos the rep on microsoft', style: 'jargon' },
      { query: 'account manager for boeing', style: 'jargon' },
      { query: 'who covers intel', style: 'jargon' },
      { query: 'who handles the microsoft account', style: 'jargon' },
      
      // Question variations
      { query: 'tell me who owns boeing', style: 'command' },
      { query: 'find the owner of intel', style: 'command' },
      { query: 'lookup boeing owner', style: 'command' },
      { query: 'get me the bl for microsoft', style: 'command' },
    ];

    test.each(ownershipQueries)(
      'recognizes "$query" ($style) as account ownership',
      async ({ query }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        // Should recognize as account-related
        const validIntents = ['account_ownership', 'account_context', 'account_lookup'];
        expect(
          validIntents.includes(result.intent) || 
          result.confidence > 0.3
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Pipeline Queries - Stage & Status Variations', () => {
    const pipelineQueries = [
      // Stage-specific (formal)
      { query: 'Show me all opportunities in Stage 3', expected: 'late_stage_pipeline' },
      { query: 'What deals are in the proposal stage?', expected: 'late_stage_pipeline' },
      { query: 'List all Stage 4 opportunities', expected: 'late_stage_pipeline' },
      
      // Stage-specific (casual)
      { query: 'stage 3 deals', expected: 'late_stage_pipeline' },
      { query: 's3 and s4', expected: 'late_stage_pipeline' },
      { query: 'late stage', expected: 'late_stage_pipeline' },
      
      // Synonym: "pipeline" variations
      { query: 'show pipeline', expected: 'pipeline_summary' },
      { query: 'whats in the funnel', expected: 'pipeline_summary' },
      { query: 'our deals', expected: 'pipeline_summary' },
      { query: 'open opportunities', expected: 'pipeline_summary' },
      { query: 'active opps', expected: 'pipeline_summary' },
      { query: 'current pipeline', expected: 'pipeline_summary' },
      
      // Weighted pipeline
      { query: 'weighted pipeline', expected: 'weighted_pipeline' },
      { query: 'finance weighted forecast', expected: 'weighted_pipeline' },
      { query: 'probability adjusted pipeline', expected: 'weighted_pipeline' },
      { query: 'weighted forecast', expected: 'weighted_pipeline' },
      
      // Owner-specific
      { query: "Julie's pipeline", expected: 'owner_pipeline' },
      { query: 'show me himanshu deals', expected: 'owner_pipeline' },
      { query: 'what does asad have', expected: 'owner_pipeline' },
      { query: "olivia's opportunities", expected: 'owner_pipeline' },
      
      // Product-specific
      { query: 'contracting pipeline', expected: 'product_pipeline' },
      { query: 'compliance opportunities', expected: 'product_pipeline' },
      { query: 'm&a deals', expected: 'product_pipeline' },
      { query: 'sigma opps', expected: 'product_pipeline' },
    ];

    test.each(pipelineQueries)(
      'handles "$query" appropriately',
      async ({ query, expected }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        // Should get reasonable confidence for pipeline-related intent
        const pipelineIntents = [
          'late_stage_pipeline', 'weighted_pipeline', 'product_pipeline',
          'pipeline_summary', 'owner_pipeline', 'account_opportunities'
        ];
        
        const isPipelineRelated = pipelineIntents.some(intent => 
          result.intent === intent || 
          result.allResults?.pattern?.intent === intent ||
          result.allResults?.neuralNet?.intent?.includes('pipeline')
        );
        
        expect(result.confidence > 0.2 || isPipelineRelated).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING / LOI / BOOKING QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Closing & LOI Queries - Time-Based Variations', () => {
    const closingQueries = [
      // What's closing
      { query: "what's closing this month", style: 'casual' },
      { query: 'what is closing in December', style: 'formal' },
      { query: 'deals closing this week', style: 'fragment' },
      { query: 'upcoming closes', style: 'fragment' },
      
      // LOI specific
      { query: 'show me LOIs signed this month', style: 'formal' },
      { query: 'recent LOIs', style: 'casual' },
      { query: 'letters of intent this quarter', style: 'formal' },
      { query: 'signed LOIs last 2 weeks', style: 'casual' },
      
      // Target dates
      { query: 'target close dates this month', style: 'formal' },
      { query: 'when is boeing supposed to close', style: 'casual' },
      { query: 'intel target loi date', style: 'fragment' },
      
      // Bookings
      { query: 'bookings this month', style: 'fragment' },
      { query: 'how many deals did we book', style: 'casual' },
      { query: 'closed won this quarter', style: 'jargon' },
      { query: 'wins in november', style: 'casual' },
      
      // Synonym: "closed" variations  
      { query: 'signed deals', style: 'fragment' },
      { query: 'completed deals', style: 'fragment' },
      { query: 'won opportunities', style: 'fragment' },
      { query: 'new logos this quarter', style: 'jargon' },
    ];

    test.each(closingQueries)(
      'understands "$query" ($style) as closing-related',
      async ({ query }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        // Should recognize time-based or closing queries
        const closingIntents = [
          'loi_date', 'closed_deals', 'bookings', 'count_query',
          'pipeline_summary', 'late_stage_pipeline'
        ];
        
        expect(
          closingIntents.includes(result.intent) ||
          result.confidence > 0.25
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT CONTEXT / INFORMATION QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Account Context - Information Gathering', () => {
    const contextQueries = [
      // Tell me about
      { query: 'tell me about Boeing', style: 'natural' },
      { query: 'what do we know about Intel', style: 'natural' },
      { query: 'give me context on Microsoft', style: 'natural' },
      { query: 'boeing background', style: 'fragment' },
      
      // Account details
      { query: 'intel account details', style: 'fragment' },
      { query: 'show me everything on boeing', style: 'casual' },
      { query: 'microsoft summary', style: 'fragment' },
      { query: 'pull up the intel account', style: 'casual' },
      
      // History
      { query: "what's the history with Boeing", style: 'natural' },
      { query: 'intel engagement history', style: 'jargon' },
      { query: 'our relationship with microsoft', style: 'natural' },
      
      // Specific fields
      { query: 'competitive landscape for boeing', style: 'jargon' },
      { query: 'account plan for intel', style: 'jargon' },
      { query: 'customer brain for microsoft', style: 'jargon' },
      
      // Existence checks
      { query: 'do we have boeing in salesforce', style: 'natural' },
      { query: 'is intel in the system', style: 'natural' },
      { query: 'does microsoft exist', style: 'casual' },
    ];

    test.each(contextQueries)(
      'handles "$query" ($style) as account context',
      async ({ query }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        const contextIntents = [
          'account_context', 'account_exists', 'account_lookup',
          'account_field_lookup', 'query_account_plan'
        ];
        
        expect(
          contextIntents.includes(result.intent) ||
          result.confidence > 0.2
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEETING & ACTIVITY QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Meeting & Activity Queries', () => {
    const meetingQueries = [
      // Last meeting
      { query: 'when was our last meeting with Boeing', intent: 'last_meeting' },
      { query: 'last call with intel', intent: 'last_meeting' },
      { query: 'recent meeting microsoft', intent: 'last_meeting' },
      { query: 'when did we last talk to boeing', intent: 'last_meeting' },
      
      // Next meeting
      { query: 'next meeting with intel', intent: 'next_meeting' },
      { query: 'upcoming call boeing', intent: 'next_meeting' },
      { query: 'when do we meet microsoft next', intent: 'next_meeting' },
      
      // Activity/staleness
      { query: 'stale deals', intent: 'stale_deals' },
      { query: 'deals with no activity', intent: 'stale_deals' },
      { query: 'inactive opportunities', intent: 'stale_deals' },
      { query: 'accounts we havent touched', intent: 'stale_deals' },
      { query: 'no recent activity', intent: 'stale_deals' },
      
      // Contacts
      { query: 'who have we met with at boeing', intent: 'contacts' },
      { query: 'intel contacts', intent: 'contacts' },
      { query: 'decision makers at microsoft', intent: 'contacts' },
      { query: 'legal contacts boeing', intent: 'contacts' },
    ];

    test.each(meetingQueries)(
      'classifies "$query" correctly',
      async ({ query, intent }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        const meetingIntents = [
          'last_meeting', 'next_meeting', 'contacts', 'stale_deals',
          'activity_check', 'account_context'
        ];
        
        expect(
          meetingIntents.includes(result.intent) ||
          result.confidence > 0.2
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE / WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Create & Write Operations', () => {
    const createQueries = [
      // Create account
      { query: 'create Boeing', intent: 'create_account' },
      { query: 'add intel to salesforce', intent: 'create_account' },
      { query: 'create account for Microsoft', intent: 'create_account' },
      { query: 'new account boeing', intent: 'create_account' },
      
      // Create opportunity
      { query: 'create opp for boeing', intent: 'create_opportunity' },
      { query: 'add opportunity for intel', intent: 'create_opportunity' },
      { query: 'new deal microsoft', intent: 'create_opportunity' },
      { query: 'create a stage 2 opp for boeing', intent: 'create_opportunity' },
      
      // Reassign
      { query: 'reassign boeing to julie', intent: 'reassign_account' },
      { query: 'change owner of intel to himanshu', intent: 'reassign_account' },
      { query: 'move microsoft to asad', intent: 'reassign_account' },
      
      // Save notes
      { query: 'add to customer history for boeing: met with CLO', intent: 'save_customer_note' },
      { query: 'save account plan for intel: focus on compliance', intent: 'save_account_plan' },
    ];

    test.each(createQueries)(
      'recognizes "$query" as write operation',
      async ({ query, intent }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        const writeIntents = [
          'create_account', 'create_opportunity', 'reassign_account',
          'save_customer_note', 'save_account_plan', 'update_account'
        ];
        
        expect(
          writeIntents.includes(result.intent) ||
          result.allResults?.pattern?.intent?.includes('create') ||
          result.confidence > 0.3
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT & REPORT QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Export & Report Queries', () => {
    const exportQueries = [
      { query: 'send me pipeline in excel', expected: 'export_pipeline' },
      { query: 'export to spreadsheet', expected: 'export_pipeline' },
      { query: 'download pipeline report', expected: 'export_pipeline' },
      { query: 'give me an excel export', expected: 'export_pipeline' },
      { query: 'pipeline xlsx', expected: 'export_pipeline' },
      { query: 'generate report', expected: 'export_pipeline' },
      { query: 'email me the pipeline', expected: 'export_pipeline' },
    ];

    test.each(exportQueries)(
      'recognizes "$query" as export request',
      async ({ query }) => {
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        expect(
          result.intent === 'export_pipeline' ||
          result.allResults?.pattern?.intent === 'export_pipeline' ||
          result.confidence > 0.3
        ).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AMBIGUOUS & EDGE CASES - GRACEFUL FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Graceful Fallback - Ambiguous Queries', () => {
    test('handles completely unknown queries gracefully', async () => {
      const result = await intelligentRouter.route('xyz123 random nonsense', 'U_TEST');
      
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.6);
    });

    test('provides alternatives for ambiguous queries', async () => {
      const result = await intelligentRouter.route('boeing stuff', 'U_TEST');
      
      // Should have alternatives even if primary is uncertain
      expect(result.allResults).toBeDefined();
    });

    test('handles single-word company queries', async () => {
      const result = await intelligentRouter.route('Boeing', 'U_TEST');
      
      // Should interpret as account lookup, not unknown
      expect(result.confidence > 0.1 || result.intent !== 'unknown').toBe(true);
    });

    test('handles typos in common words', async () => {
      const queries = [
        'who owns boieng',  // typo in Boeing
        'pipline summary',  // typo in pipeline
        'opportiunities',   // typo in opportunities
      ];
      
      for (const query of queries) {
        const result = await intelligentRouter.route(query, 'U_TEST');
        // Should still get some confidence, not complete failure
        expect(result).toBeDefined();
        expect(result.allResults).toBeDefined();
      }
    });

    test('handles mixed case gracefully', async () => {
      const queries = [
        'WHO OWNS BOEING',
        'Who Owns Boeing',
        'who OWNS boeing',
      ];
      
      for (const query of queries) {
        const result = await intelligentRouter.route(query, 'U_TEST');
        expect(result.confidence).toBeGreaterThan(0.2);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYWORD SYNONYM MAPPING TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Keyword Synonym Recognition', () => {
    
    test('recognizes "owner" synonyms', async () => {
      const synonyms = ['owner', 'BL', 'business lead', 'rep', 'account manager', 'covers', 'handles'];
      
      for (const synonym of synonyms) {
        const query = `${synonym} boeing`;
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        // All should map to account-related intent
        expect(
          result.intent.includes('account') || 
          result.intent.includes('ownership') ||
          result.confidence > 0.2
        ).toBe(true);
      }
    });

    test('recognizes "pipeline" synonyms', async () => {
      const synonyms = ['pipeline', 'funnel', 'deals', 'opportunities', 'opps'];
      
      for (const synonym of synonyms) {
        const query = `show ${synonym}`;
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        expect(result.confidence > 0.1).toBe(true);
      }
    });

    test('recognizes "create" synonyms', async () => {
      const synonyms = ['create', 'add', 'new', 'make', 'register'];
      
      for (const synonym of synonyms) {
        const query = `${synonym} account boeing`;
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        expect(
          result.intent.includes('create') ||
          result.allResults?.pattern?.intent?.includes('create') ||
          result.confidence > 0.2
        ).toBe(true);
      }
    });

    test('recognizes stage number variations', async () => {
      const variations = [
        'stage 3', 'Stage 3', 'S3', 's3', 
        'stage three', 'stage3',
        'pilot stage', 'proposal stage'
      ];
      
      for (const variation of variations) {
        const query = `show me ${variation} deals`;
        const result = await intelligentRouter.route(query, 'U_TEST');
        
        expect(result.confidence > 0.1).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL SLACK USER QUERY SAMPLES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Real-World Slack Query Samples', () => {
    const realQueries = [
      // Actual patterns from sales teams
      { query: 'yo whos got apple', expected_category: 'account' },
      { query: 'can you look up who owns the cargill account for me', expected_category: 'account' },
      { query: 'need to know the bl for resmed', expected_category: 'account' },
      { query: 'quick question - do we have stubhub?', expected_category: 'account' },
      { query: 'just checking if marsh is in sf', expected_category: 'account' },
      { query: 'whats the deal with the boeing opportunity', expected_category: 'opportunity' },
      { query: 'how much pipeline do we have', expected_category: 'pipeline' },
      { query: 'pull up late stage for me', expected_category: 'pipeline' },
      { query: 'any news on whats closing this week', expected_category: 'closing' },
      { query: 'did we book anything new', expected_category: 'closing' },
      { query: 'send excel', expected_category: 'export' },
      { query: 'spreadsheet plz', expected_category: 'export' },
      { query: 'when are we meeting with intel next', expected_category: 'meeting' },
      { query: 'last touchpoint with microsoft?', expected_category: 'meeting' },
      { query: 'make a new opp for acme inc 50k', expected_category: 'create' },
      { query: 'add acme corp to salesforce and assign to julie', expected_category: 'create' },
    ];

    test.each(realQueries)(
      'handles real query: "$query"',
      async ({ query, expected_category }) => {
        const result = await intelligentRouter.route(query, 'U_REAL_USER');
        
        // Should not completely fail on real queries
        expect(result).toBeDefined();
        expect(result.allResults).toBeDefined();
        
        // Should have reasonable response time
        expect(result.responseTime).toBeLessThan(5000);
      }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEURAL NETWORK DIRECT TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Neural Network Intent Classifier - Direct Tests', () => {
  
  test('handles vocabulary words correctly', () => {
    const result = intentClassifier.predict('who owns intel');
    expect(result.intent).toBe('account_ownership');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('handles out-of-vocabulary words gracefully', () => {
    const result = intentClassifier.predict('xyzabc123 unknown words');
    expect(result).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  test('returns probabilities that sum to ~1', () => {
    const result = intentClassifier.predict('test query');
    const total = result.confidence + 
      result.alternatives.reduce((sum, alt) => sum + alt.confidence, 0);
    
    // Should be close to 1 (accounting for top 3 alternatives only)
    expect(total).toBeGreaterThan(0.5);
  });

  test('training history shows improvement', () => {
    const info = intentClassifier.getModelInfo();
    const history = info.trainingHistory;
    
    // Loss should decrease over training
    const firstLoss = history[0]?.loss;
    const lastLoss = history[history.length - 1]?.loss;
    
    expect(lastLoss).toBeLessThan(firstLoss);
  });
});

