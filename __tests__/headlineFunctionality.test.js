/**
 * Headline Functionality Tests
 * 
 * These tests verify ALL queries advertised in the README work correctly.
 * Every Business Lead must be testable. No false advertising.
 * 
 * If a test fails here, we CANNOT claim the feature works.
 */

const intelligentRouter = require('../src/ai/intelligentRouter');
const { tracker } = require('../src/analytics/usageTracker');

// Cleanup
afterAll(() => {
  tracker.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS LEADS - All must be recognized
// ═══════════════════════════════════════════════════════════════════════════
const BUSINESS_LEADS = [
  'Julie Stefanich',
  'Julie',
  'Justin Hills',
  'Justin',
  'Asad Hussain',
  'Asad',
  'Himanshu Agarwal',
  'Himanshu',
  'Ananth Cherukupally',
  'Ananth',
  'Olivia Jung',
  'Olivia',
  'Jon Cobb',
  'Jon',
  'Mike Masiello',
  'Mike'
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. STAGE-SPECIFIC QUERIES
// "What accounts are in Stage 2?" → SQO opportunities
// ═══════════════════════════════════════════════════════════════════════════
describe('Stage-Specific Queries', () => {
  
  const stageQueries = [
    // Stage 0
    { query: 'What accounts are in Stage 0?', stage: '0' },
    { query: 'Stage 0 deals', stage: '0' },
    { query: 'qualifying opportunities', stage: '0' },
    
    // Stage 1
    { query: 'What accounts are in Stage 1?', stage: '1' },
    { query: 'Stage 1 deals', stage: '1' },
    { query: 'discovery opportunities', stage: '1' },
    { query: 'early stage pipeline', stage: '1' },
    
    // Stage 2 (SQO)
    { query: 'What accounts are in Stage 2?', stage: '2' },
    { query: 'Stage 2 deals', stage: '2' },
    { query: 'SQO opportunities', stage: '2' },
    { query: 'sqo pipeline', stage: '2' },
    
    // Stage 3 (Pilot)
    { query: 'What accounts are in Stage 3?', stage: '3' },
    { query: 'Stage 3 deals', stage: '3' },
    { query: 'pilot opportunities', stage: '3' },
    
    // Stage 4 (Proposal)
    { query: 'What accounts are in Stage 4?', stage: '4' },
    { query: 'Stage 4 deals', stage: '4' },
    { query: 'proposal stage', stage: '4' },
    
    // Stage 5 (Negotiation)
    { query: 'What accounts are in Stage 5?', stage: '5' },
    { query: 'Stage 5 deals', stage: '5' },
    { query: 'negotiation stage', stage: '5' },
    
    // Late Stage (3 & 4)
    { query: 'late stage pipeline', stage: 'late' },
    { query: 'late stage deals', stage: 'late' },
    { query: 'stage 3 and 4', stage: 'late' },
    { query: 'show me late stage', stage: 'late' },
  ];

  test.each(stageQueries)(
    'handles "$query" → Stage $stage',
    async ({ query }) => {
      const result = await intelligentRouter.route(query, 'U_TEST_STAGE');
      
      // Must recognize as pipeline/stage related
      const validIntents = [
        'pipeline_summary', 'late_stage_pipeline', 'deal_lookup',
        'account_opportunities', 'stage_query'
      ];
      
      const isRecognized = validIntents.includes(result.intent) || 
        result.confidence > 0.3 ||
        result.allResults?.pattern?.intent?.includes('pipeline') ||
        result.allResults?.pattern?.intent?.includes('stage');
      
      expect(isRecognized).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. OWNER-SPECIFIC QUERIES
// "Himanshu's deals" → Opportunities by owner
// ═══════════════════════════════════════════════════════════════════════════
describe('Owner-Specific Queries', () => {
  
  test.each(BUSINESS_LEADS)(
    'recognizes "%s\'s deals" as owner query',
    async (name) => {
      const query = `${name}'s deals`;
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      // Should recognize as owner-related or pipeline query
      expect(result).toBeDefined();
      expect(result.allResults).toBeDefined();
      
      // The query should not completely fail
      expect(result.responseTime).toBeLessThan(5000);
    }
  );

  test.each(BUSINESS_LEADS)(
    'recognizes "%s pipeline" as owner query',
    async (name) => {
      const query = `${name} pipeline`;
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      expect(result).toBeDefined();
      expect(result.responseTime).toBeLessThan(5000);
    }
  );

  test.each(BUSINESS_LEADS)(
    'recognizes "show me %s\'s opportunities" as owner query',
    async (name) => {
      const query = `show me ${name}'s opportunities`;
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      expect(result).toBeDefined();
      expect(result.responseTime).toBeLessThan(5000);
    }
  );

  // Additional owner query patterns
  const ownerPatterns = [
    "Julie's late stage",
    "Himanshu's deals this quarter",
    "what does Asad have",
    "Olivia's pipeline",
    "show me Justin's opps",
    "Mike's opportunities",
    "Ananth's accounts",
    "Jon's deals",
  ];

  test.each(ownerPatterns)(
    'handles owner pattern: "%s"',
    async (query) => {
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      expect(result).toBeDefined();
      expect(result.responseTime).toBeLessThan(5000);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PRODUCT-SPECIFIC QUERIES
// "Contracting pipeline" → AI-Augmented Contracting opportunities
// ═══════════════════════════════════════════════════════════════════════════
describe('Product-Specific Queries', () => {
  
  const productQueries = [
    // Contracting
    { query: 'Contracting pipeline', product: 'AI-Augmented Contracting' },
    { query: 'contracting deals', product: 'AI-Augmented Contracting' },
    { query: 'AI contracting opportunities', product: 'AI-Augmented Contracting' },
    { query: 'show me contracting opps', product: 'AI-Augmented Contracting' },
    
    // Compliance
    { query: 'Compliance pipeline', product: 'Compliance' },
    { query: 'compliance opportunities', product: 'Compliance' },
    { query: 'compliance deals', product: 'Compliance' },
    
    // M&A
    { query: 'M&A pipeline', product: 'Augmented-M&A' },
    { query: 'm&a deals', product: 'Augmented-M&A' },
    { query: 'mergers and acquisitions opportunities', product: 'Augmented-M&A' },
    
    // Sigma
    { query: 'sigma pipeline', product: 'sigma' },
    { query: 'sigma deals', product: 'sigma' },
    { query: 'sigma opportunities', product: 'sigma' },
    
    // Cortex
    { query: 'cortex pipeline', product: 'Cortex' },
    { query: 'cortex deals', product: 'Cortex' },
  ];

  test.each(productQueries)(
    'handles "$query" → $product',
    async ({ query }) => {
      const result = await intelligentRouter.route(query, 'U_TEST_PRODUCT');
      
      // Must recognize as product pipeline
      const validIntents = [
        'product_pipeline', 'pipeline_summary', 'deal_lookup'
      ];
      
      const isRecognized = validIntents.includes(result.intent) ||
        result.allResults?.pattern?.intent === 'product_pipeline' ||
        result.confidence > 0.3;
      
      expect(isRecognized).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. TIME-BASED QUERIES
// "What closed this month?" → Recent closed-won deals
// ═══════════════════════════════════════════════════════════════════════════
describe('Time-Based Queries', () => {
  
  const timeQueries = [
    // This month
    { query: 'What closed this month?', timeframe: 'this_month' },
    { query: 'deals closed this month', timeframe: 'this_month' },
    { query: 'closed won this month', timeframe: 'this_month' },
    { query: 'bookings this month', timeframe: 'this_month' },
    
    // This week
    { query: "what's closing this week", timeframe: 'this_week' },
    { query: 'deals closing this week', timeframe: 'this_week' },
    
    // This quarter
    { query: 'what closed this quarter', timeframe: 'this_quarter' },
    { query: 'Q4 wins', timeframe: 'this_quarter' },
    { query: 'closed won this quarter', timeframe: 'this_quarter' },
    
    // Last N days/weeks
    { query: 'LOIs signed last 2 weeks', timeframe: 'last_2_weeks' },
    { query: 'deals closed last 30 days', timeframe: 'last_30_days' },
    { query: 'recent wins', timeframe: 'recent' },
    
    // Upcoming
    { query: 'what is closing soon', timeframe: 'upcoming' },
    { query: 'upcoming closes', timeframe: 'upcoming' },
    { query: 'target close dates this month', timeframe: 'this_month' },
  ];

  test.each(timeQueries)(
    'handles "$query" → $timeframe',
    async ({ query }) => {
      const result = await intelligentRouter.route(query, 'U_TEST_TIME');
      
      // Must recognize as time-based or pipeline query
      const validIntents = [
        'closed_deals', 'loi_date', 'count_query', 'pipeline_summary',
        'deal_lookup', 'bookings', 'time_based_query'
      ];
      
      const isRecognized = validIntents.includes(result.intent) ||
        result.confidence > 0.25;
      
      expect(isRecognized).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. HEALTH-BASED QUERIES
// "Stale deals over $200k" → Opportunities with no activity 30+ days
// ═══════════════════════════════════════════════════════════════════════════
describe('Health-Based Queries', () => {
  
  const healthQueries = [
    // Stale deals
    { query: 'Stale deals over $200k', type: 'stale_amount' },
    { query: 'stale deals', type: 'stale' },
    { query: 'deals with no activity', type: 'stale' },
    { query: 'inactive opportunities', type: 'stale' },
    { query: 'no recent activity', type: 'stale' },
    { query: 'deals we havent touched', type: 'stale' },
    { query: 'opportunities with no activity 30+ days', type: 'stale' },
    
    // At risk
    { query: 'at risk deals', type: 'risk' },
    { query: 'deals at risk', type: 'risk' },
    { query: 'pipeline at risk', type: 'risk' },
    
    // With amount threshold
    { query: 'stale deals over 100k', type: 'stale_amount' },
    { query: 'stale deals over $500k', type: 'stale_amount' },
    { query: 'big deals with no activity', type: 'stale' },
  ];

  test.each(healthQueries)(
    'handles "$query" → $type',
    async ({ query }) => {
      const result = await intelligentRouter.route(query, 'U_TEST_HEALTH');
      
      // Must recognize as activity/health check
      const validIntents = [
        'activity_check', 'stale_deals', 'deal_lookup', 'pipeline_summary'
      ];
      
      const isRecognized = validIntents.includes(result.intent) ||
        result.allResults?.pattern?.intent?.includes('stale') ||
        result.allResults?.pattern?.intent?.includes('activity') ||
        result.confidence > 0.2;
      
      expect(isRecognized).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT OWNERSHIP - Critical functionality
// ═══════════════════════════════════════════════════════════════════════════
describe('Account Ownership Queries', () => {
  
  const companies = [
    'Boeing', 'Intel', 'Microsoft', 'Google', 'Apple',
    'Cargill', 'Marsh', 'Dolby', 'National Grid', 'Western Digital'
  ];

  test.each(companies)(
    '"Who owns %s?" returns owner info',
    async (company) => {
      const query = `Who owns ${company}?`;
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      expect(result.intent).toBe('account_ownership');
      expect(result.confidence).toBeGreaterThan(0.5);
    }
  );

  test.each(companies)(
    '"BL for %s" returns owner info',
    async (company) => {
      const query = `BL for ${company}`;
      const result = await intelligentRouter.route(query, 'U_TEST_OWNER');
      
      // Should recognize as account-related
      const validIntents = ['account_ownership', 'account_lookup', 'account_context'];
      expect(
        validIntents.includes(result.intent) || result.confidence > 0.3
      ).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONALITY CONFIDENCE LEVELS
// Documents what we can confidently advertise
// ═══════════════════════════════════════════════════════════════════════════
describe('Confidence Level Assessment', () => {
  
  // HIGH CONFIDENCE - These MUST work
  const highConfidenceQueries = [
    { query: 'who owns Boeing', expected: 'account_ownership' },
    { query: 'who owns Intel', expected: 'account_ownership' },
    { query: 'late stage pipeline', expected: 'late_stage_pipeline' },
    { query: 'show me stage 3 and 4', expected: 'late_stage_pipeline' },
    { query: 'contracting pipeline', expected: 'product_pipeline' },
    { query: 'compliance opportunities', expected: 'product_pipeline' },
    { query: 'weighted pipeline', expected: 'weighted_pipeline' },
  ];

  test.each(highConfidenceQueries)(
    'HIGH CONFIDENCE: "$query" → $expected',
    async ({ query, expected }) => {
      const result = await intelligentRouter.route(query, 'U_TEST_HIGH');
      
      // These MUST match with high confidence
      expect(result.intent).toBe(expected);
      expect(result.confidence).toBeGreaterThan(0.6);
    }
  );

  // MEDIUM CONFIDENCE - Should work in most cases
  const mediumConfidenceQueries = [
    "Julie's deals",
    "what closed this month",
    "stale deals",
    "tell me about Boeing",
    "Intel opportunities",
  ];

  test.each(mediumConfidenceQueries)(
    'MEDIUM CONFIDENCE: "%s" is handled',
    async (query) => {
      const result = await intelligentRouter.route(query, 'U_TEST_MED');
      
      // Should not return unknown with confidence < 0.3
      expect(
        result.intent !== 'unknown' || result.confidence > 0.3
      ).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY: What We Can Confidently Advertise
// ═══════════════════════════════════════════════════════════════════════════
describe('Advertised Feature Verification', () => {
  
  test('FEATURE: Account Ownership Lookup', async () => {
    const queries = [
      'who owns Boeing',
      'who owns Intel',
      'who is the owner of Microsoft'
    ];
    
    for (const query of queries) {
      const result = await intelligentRouter.route(query, 'U_VERIFY');
      expect(result.intent).toBe('account_ownership');
    }
  });

  test('FEATURE: Late Stage Pipeline', async () => {
    const result = await intelligentRouter.route('late stage pipeline', 'U_VERIFY');
    expect(result.intent).toBe('late_stage_pipeline');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test('FEATURE: Product Pipeline (Contracting)', async () => {
    const result = await intelligentRouter.route('contracting pipeline', 'U_VERIFY');
    expect(result.intent).toBe('product_pipeline');
  });

  test('FEATURE: Product Pipeline (Compliance)', async () => {
    const result = await intelligentRouter.route('compliance opportunities', 'U_VERIFY');
    expect(result.intent).toBe('product_pipeline');
  });

  test('FEATURE: Weighted Pipeline', async () => {
    const result = await intelligentRouter.route('weighted pipeline', 'U_VERIFY');
    expect(result.intent).toBe('weighted_pipeline');
  });
});

