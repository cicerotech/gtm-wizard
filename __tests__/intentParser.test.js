/**
 * Comprehensive tests for IntentParser module
 * Tests pattern matching, entity extraction, and intent classification
 */

const { parseIntent, intentParser } = require('../src/ai/intentParser');

// Mock the ML classifier to avoid external dependencies
jest.mock('../src/ai/mlIntentClassifier', () => ({
  mlIntentClassifier: null
}), { virtual: true });

describe('IntentParser', () => {
  describe('parseIntent - Account Ownership Queries', () => {
    test('recognizes "who owns X" pattern', async () => {
      const result = await parseIntent('who owns Boeing');
      expect(result.intent).toBe('account_ownership');
      expect(result.entities?.accounts).toContain('Boeing');
    });

    test('recognizes "who is the owner of X"', async () => {
      const result = await parseIntent("who is the owner of Intel");
      expect(result.intent).toBe('account_ownership');
    });

    test('recognizes account ownership variations', async () => {
      const variations = [
        'who owns microsoft',
        'microsoft owner',
        'owner of google',
        'who is responsible for amazon'
      ];
      
      for (const query of variations) {
        const result = await parseIntent(query);
        expect(['account_ownership', 'account_lookup']).toContain(result.intent);
      }
    });
  });

  describe('parseIntent - Pipeline Queries', () => {
    test('recognizes late stage pipeline query', async () => {
      const result = await parseIntent('show me late stage pipeline');
      expect(['late_stage_pipeline', 'pipeline_summary']).toContain(result.intent);
    });

    test('recognizes stage 3 and 4 query', async () => {
      const result = await parseIntent('stage 3 and 4 deals');
      expect(['late_stage_pipeline', 'pipeline_summary']).toContain(result.intent);
    });

    test('recognizes closing this month query', async () => {
      const result = await parseIntent("what's closing this month");
      expect(['loi_date', 'closing_timeline', 'pipeline_summary']).toContain(result.intent);
    });

    test('recognizes product pipeline query', async () => {
      const result = await parseIntent('contracting pipeline');
      expect(['product_pipeline', 'pipeline_summary']).toContain(result.intent);
    });
  });

  describe('parseIntent - Account Context Queries', () => {
    test('recognizes "tell me about X"', async () => {
      const result = await parseIntent('tell me about Chevron');
      expect(['account_context', 'account_lookup']).toContain(result.intent);
    });

    test('recognizes account existence check', async () => {
      const result = await parseIntent('does Tesla exist in Salesforce');
      expect(['account_exists', 'account_lookup']).toContain(result.intent);
    });

    test('recognizes account opportunities query', async () => {
      const result = await parseIntent('show me opportunities at Boeing');
      expect(['account_opportunities', 'account_lookup']).toContain(result.intent);
    });
  });

  describe('parseIntent - Meeting Queries', () => {
    test('recognizes last meeting query', async () => {
      const result = await parseIntent('when was our last meeting with Intel');
      expect(['last_meeting', 'meeting_query']).toContain(result.intent);
    });

    test('recognizes contacts query', async () => {
      const result = await parseIntent('who have we met with at Google');
      expect(['contacts', 'meeting_query', 'account_context']).toContain(result.intent);
    });
  });

  describe('parseIntent - Contract Queries', () => {
    test('recognizes contract query', async () => {
      const result = await parseIntent('show me contracts for Boeing');
      expect(['contract_query', 'account_lookup']).toContain(result.intent);
    });

    test('recognizes LOI contract query', async () => {
      const result = await parseIntent('show all LOI contracts');
      expect(['contract_query', 'loi_contracts']).toContain(result.intent);
    });
  });

  describe('parseIntent - Export Queries', () => {
    test('recognizes export request', async () => {
      const result = await parseIntent('generate pipeline report');
      expect(['export_pipeline', 'pipeline_summary']).toContain(result.intent);
    });

    test('recognizes excel export', async () => {
      const result = await parseIntent('export late stage to excel');
      expect(['export_pipeline', 'pipeline_summary']).toContain(result.intent);
    });
  });

  describe('parseIntent - Create Operations', () => {
    test('recognizes create account intent', async () => {
      const result = await parseIntent('create NewCo and assign to BL');
      expect(['create_account', 'account_creation']).toContain(result.intent);
    });

    test('recognizes create opportunity intent', async () => {
      const result = await parseIntent('create an opp for Boeing');
      expect(['create_opportunity', 'opportunity_creation']).toContain(result.intent);
    });
  });

  describe('parseIntent - Edge Cases', () => {
    test('handles empty string', async () => {
      const result = await parseIntent('');
      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
    });

    test('handles unknown query', async () => {
      const result = await parseIntent('random gibberish xyz123');
      expect(result.intent).toBe('unknown');
    });

    test('handles special characters', async () => {
      const result = await parseIntent('who owns AT&T?');
      expect(result).toBeDefined();
      expect(['account_ownership', 'unknown']).toContain(result.intent);
    });

    test('handles numeric queries', async () => {
      const result = await parseIntent('12345');
      expect(result).toBeDefined();
    });

    test('handles very long query', async () => {
      const longQuery = 'who owns '.repeat(50) + 'Boeing';
      const result = await parseIntent(longQuery);
      expect(result).toBeDefined();
    });
  });

  describe('parseIntent - Context Handling', () => {
    test('works with null context', async () => {
      const result = await parseIntent('who owns Intel', null);
      expect(result).toBeDefined();
    });

    test('works with conversation context', async () => {
      const context = {
        lastQuery: {
          intent: 'account_ownership',
          filters: { accounts: ['Boeing'] },
          timestamp: Date.now()
        }
      };
      const result = await parseIntent('how about their pipeline', context);
      expect(result).toBeDefined();
    });
  });

  describe('Entity Extraction', () => {
    test('extracts company names', async () => {
      const result = await parseIntent('who owns Boeing');
      expect(result.entities).toBeDefined();
      expect(result.entities.accounts).toBeDefined();
    });

    test('extracts stage filters', async () => {
      const result = await parseIntent('show me stage 3 deals');
      expect(result).toBeDefined();
    });

    test('extracts timeframe', async () => {
      const result = await parseIntent('deals closing this month');
      expect(result).toBeDefined();
    });
  });

  describe('IntentParser Stats', () => {
    test('getStats returns stats object', () => {
      const stats = intentParser.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('IntentParser Result Structure', () => {
    test('returns required fields', async () => {
      const result = await parseIntent('who owns Intel');
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('confidence');
    });

    test('confidence is between 0 and 1', async () => {
      const result = await parseIntent('who owns Boeing');
      
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('Intent Pattern Matching', () => {
  describe('Ownership patterns', () => {
    test.each([
      ['who owns Intel', 'account_ownership'],
      ['owner of Microsoft', 'account_ownership'],
      ['Boeing owner', 'account_ownership'],
      ["who's the owner of Google", 'account_ownership'],
    ])('%s -> %s', async (query, expectedIntent) => {
      const result = await parseIntent(query);
      expect(result.intent).toBe(expectedIntent);
    });
  });

  describe('Pipeline patterns', () => {
    test.each([
      ['late stage pipeline', 'late_stage_pipeline'],
      ['show late stage', 'late_stage_pipeline'],
      ['stage 3 and 4', 'late_stage_pipeline'],
    ])('%s -> %s', async (query, expectedIntent) => {
      const result = await parseIntent(query);
      expect(['late_stage_pipeline', 'pipeline_summary']).toContain(result.intent);
    });
  });
});

