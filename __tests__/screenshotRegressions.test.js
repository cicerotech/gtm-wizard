/**
 * Screenshot Regression Tests
 * 
 * These tests validate fixes for specific failures captured in screenshots.
 * Each test corresponds to a real user failure that was observed in production.
 * 
 * CRITICAL: These tests must NEVER fail. Any failure indicates a regression
 * that will impact real users.
 */

const { IntentParser } = require('../src/ai/intentParser');

describe('SCREENSHOT REGRESSION TESTS', () => {
  let parser;
  
  beforeEach(() => {
    parser = new IntentParser();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUE 1: "create opportunity for Eudia Testing Account" - FAILED
  // Root Cause: `!message.includes('account')` excluded any company with "Account" in name
  // Fix: Changed to `!message.includes('create account')` 
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Issue 1: Create Opportunity with "Account" in company name', () => {
    
    test('REGRESSION: "create opportunity for Eudia Testing Account" -> create_opportunity', async () => {
      const result = await parser.parseIntent('create opportunity for Eudia Testing Account');
      expect(result.intent).toBe('create_opportunity');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0]).toContain('Eudia Testing Account');
    });
    
    test('REGRESSION: "create opp for Test Account Inc" -> create_opportunity', async () => {
      const result = await parser.parseIntent('create opp for Test Account Inc');
      expect(result.intent).toBe('create_opportunity');
    });
    
    test('STILL WORKS: "create account for Boeing" -> create_account (should NOT match opp)', async () => {
      const result = await parser.parseIntent('create account for Boeing and assign to bl');
      expect(result.intent).toBe('create_account');
    });
    
    test('STILL WORKS: "add account for Intel" -> create_account', async () => {
      const result = await parser.parseIntent('add account for Intel and assign to bl');
      expect(result.intent).toBe('create_account');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUE 2: "create a stage 1 opportunity for Eudia Testing Account" - Returns Stage 1 Pipeline
  // Root Cause: Same as Issue 1 - falls through to stage 1 pipeline detection
  // Fix: Same fix as Issue 1
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Issue 2: Create Opportunity with Stage AND "Account" in company name', () => {
    
    test('REGRESSION: "create a stage 1 opportunity for Eudia Testing Account" -> create_opportunity', async () => {
      const result = await parser.parseIntent('create a stage 1 opportunity for Eudia Testing Account');
      expect(result.intent).toBe('create_opportunity');
      expect(result.entities?.stage).toBe('1');
      expect(result.entities?.accounts).toBeDefined();
    });
    
    test('REGRESSION: "create a stage 2 opp for Account Services LLC" -> create_opportunity', async () => {
      const result = await parser.parseIntent('create a stage 2 opp for Account Services LLC');
      expect(result.intent).toBe('create_opportunity');
      expect(result.entities?.stage).toBe('2');
    });
    
    test('REGRESSION: "create a stage 4 opportunity for Accounting Firm Inc" -> create_opportunity', async () => {
      const result = await parser.parseIntent('create a stage 4 opportunity for Accounting Firm Inc');
      expect(result.intent).toBe('create_opportunity');
      expect(result.entities?.stage).toBe('4');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUE 3: "who is the BL on Toshiba" - Extracts "bl on toshiba" as company name
  // Root Cause: Fallback regex captures everything after "the" 
  // Fix: Added specific pattern for "who is the BL on [company]"
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Issue 3: BL on [Company] pattern', () => {
    
    test('REGRESSION: "who is the BL on Toshiba" -> account_lookup with Toshiba', async () => {
      const result = await parser.parseIntent('who is the BL on Toshiba');
      expect(result.intent).toBe('account_lookup');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0].toLowerCase()).toBe('toshiba');
    });
    
    test('REGRESSION: "who is the BL on Best Buy" -> account_lookup with Best Buy', async () => {
      const result = await parser.parseIntent('who is the BL on Best Buy');
      expect(result.intent).toBe('account_lookup');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0].toLowerCase()).toContain('best buy');
    });
    
    test('STILL WORKS: "who is the BL for Intel" -> account_lookup with Intel', async () => {
      const result = await parser.parseIntent('who is the BL for Intel');
      expect(result.intent).toBe('account_lookup');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0].toLowerCase()).toBe('intel');
    });
    
    test('STILL WORKS: "BL for Amazon" -> account_lookup with Amazon', async () => {
      const result = await parser.parseIntent('BL for Amazon');
      expect(result.intent).toBe('account_lookup');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0].toLowerCase()).toBe('amazon');
    });
    
    test('STILL WORKS: "BL at Cargill" -> account_lookup with Cargill', async () => {
      const result = await parser.parseIntent('BL at Cargill');
      expect(result.intent).toBe('account_lookup');
      expect(result.entities?.accounts).toBeDefined();
      expect(result.entities.accounts[0].toLowerCase()).toBe('cargill');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUE 4: "add to customer histroy: White Cap" - Shows format instructions
  // Root Cause: Typo "histroy" doesn't match regex
  // Fix: Added typo tolerance patterns
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Issue 4: Customer History Typo Tolerance', () => {
    
    test('REGRESSION: "add to customer histroy: White Cap test" -> save_customer_note', async () => {
      const result = await parser.parseIntent('add to customer histroy: White Cap test');
      expect(result.intent).toBe('save_customer_note');
    });
    
    test('REGRESSION: "add to custome history: Test Company" -> save_customer_note', async () => {
      const result = await parser.parseIntent('add to custome history: Test Company');
      expect(result.intent).toBe('save_customer_note');
    });
    
    test('REGRESSION: "add to customer histor: Another test" -> save_customer_note', async () => {
      const result = await parser.parseIntent('add to customer histor: Another test');
      expect(result.intent).toBe('save_customer_note');
    });
    
    test('REGRESSION: "customer brain: Cargill discussed AI" -> save_customer_note', async () => {
      const result = await parser.parseIntent('customer brain: Cargill discussed AI');
      expect(result.intent).toBe('save_customer_note');
    });
    
    test('STILL WORKS: "add to customer history: Boeing met with CLO" -> save_customer_note', async () => {
      const result = await parser.parseIntent('add to customer history: Boeing met with CLO');
      expect(result.intent).toBe('save_customer_note');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL EDGE CASES: Company names with reserved words
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Edge Cases: Company Names with Reserved Words', () => {
    
    test('Company name contains "stage": "create opp for Stage Coach Inc"', async () => {
      const result = await parser.parseIntent('create opp for Stage Coach Inc');
      expect(result.intent).toBe('create_opportunity');
    });
    
    test('Company name contains "pipeline": "who owns Pipeline Construction"', async () => {
      const result = await parser.parseIntent('who owns Pipeline Construction');
      expect(result.intent).toBe('account_lookup');
    });
    
    test('Company name contains "deals": "create opp for Best Deals LLC"', async () => {
      const result = await parser.parseIntent('create opp for Best Deals LLC');
      expect(result.intent).toBe('create_opportunity');
    });
    
    test('Company name contains "nurture": "who owns Nurture Health"', async () => {
      const result = await parser.parseIntent('who owns Nurture Health');
      expect(result.intent).toBe('account_lookup');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SANITY CHECKS: Ensure core functionality still works
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Sanity Checks: Core Functionality', () => {
    
    test('Pipeline query: "show me pipeline"', async () => {
      const result = await parser.parseIntent('show me pipeline');
      expect(result.intent).toBe('pipeline_summary');
    });
    
    test('Owner pipeline: "Julie\'s deals"', async () => {
      const result = await parser.parseIntent("Julie's deals");
      expect(result.intent).toBe('owner_pipeline');
    });
    
    test('Late stage: "late stage pipeline"', async () => {
      const result = await parser.parseIntent('late stage pipeline');
      expect(result.intent).toBe('pipeline_summary');
    });
    
    test('Reassign: "reassign Boeing to Julie"', async () => {
      const result = await parser.parseIntent('reassign Boeing to Julie');
      expect(result.intent).toBe('reassign_account');
    });
    
    test('Batch reassign: "batch reassign: A, B, C to Julie"', async () => {
      const result = await parser.parseIntent('batch reassign: Boeing, Intel, Microsoft to Julie');
      expect(result.intent).toBe('batch_reassign_accounts');
    });
    
    test('Nurture: "move Boeing to nurture"', async () => {
      const result = await parser.parseIntent('move Boeing to nurture');
      expect(result.intent).toBe('move_to_nurture');
    });
    
    test('Close lost: "close Boeing lost"', async () => {
      const result = await parser.parseIntent('close Boeing lost');
      expect(result.intent).toBe('close_account_lost');
    });
    
    test('Pagination: "show next 10"', async () => {
      const result = await parser.parseIntent('show next 10');
      expect(result.intent).toBe('pagination_next');
    });
  });
});

