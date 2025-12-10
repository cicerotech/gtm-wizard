/**
 * Comprehensive tests for Response Formatter module
 * Tests Slack message formatting functions
 */

const { formatResponse } = require('../src/slack/responseFormatter');

describe('ResponseFormatter', () => {
  describe('formatResponse', () => {
    describe('account ownership responses', () => {
      test('formats single account ownership result', () => {
        const queryResult = {
          records: [
            { 
              Id: '001',
              Name: 'Boeing',
              Owner: { Name: 'John Smith' },
              Industry: 'Aerospace'
            }
          ],
          totalSize: 1
        };
        
        const parsedIntent = {
          intent: 'account_ownership',
          entities: { accounts: ['Boeing'] }
        };
        
        const result = formatResponse(queryResult, parsedIntent);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      test('formats no results message', () => {
        const queryResult = {
          records: [],
          totalSize: 0
        };
        
        const parsedIntent = {
          intent: 'account_ownership',
          entities: { accounts: ['NonExistentCorp'] }
        };
        
        const result = formatResponse(queryResult, parsedIntent);
        expect(result).toBeDefined();
      });
    });

    describe('pipeline responses', () => {
      test('formats pipeline summary', () => {
        const queryResult = {
          records: [
            {
              Id: '006',
              Name: 'Big Deal',
              Amount: 500000,
              StageName: 'Stage 3 - Pilot',
              Account: { Name: 'Boeing' },
              Owner: { Name: 'Jane Doe' }
            }
          ],
          totalSize: 1
        };
        
        const parsedIntent = {
          intent: 'pipeline_summary',
          entities: {}
        };
        
        const result = formatResponse(queryResult, parsedIntent);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      test('formats late stage pipeline', () => {
        const queryResult = {
          records: [
            {
              Id: '006',
              Name: 'Enterprise Deal',
              Amount: 1000000,
              StageName: 'Stage 4 - Proposal',
              Account: { Name: 'Intel' },
              Owner: { Name: 'Sales Rep' }
            }
          ],
          totalSize: 1
        };
        
        const parsedIntent = {
          intent: 'late_stage_pipeline',
          entities: { stages: ['Stage 3 - Pilot', 'Stage 4 - Proposal'] }
        };
        
        const result = formatResponse(queryResult, parsedIntent);
        expect(result).toBeDefined();
      });
    });

    describe('empty results handling', () => {
      test('handles null query result', () => {
        const result = formatResponse(null, { intent: 'pipeline_summary', entities: {} });
        expect(result).toBeDefined();
      });

      test('handles undefined query result', () => {
        const result = formatResponse(undefined, { intent: 'account_lookup', entities: {} });
        expect(result).toBeDefined();
      });

      test('handles missing records property', () => {
        const result = formatResponse({}, { intent: 'deal_lookup', entities: {} });
        expect(result).toBeDefined();
      });
    });

    describe('multiple results', () => {
      test('formats multiple opportunities', () => {
        const queryResult = {
          records: [
            { Id: '001', Name: 'Deal 1', Amount: 100000, StageName: 'Stage 2 - SOO' },
            { Id: '002', Name: 'Deal 2', Amount: 200000, StageName: 'Stage 3 - Pilot' },
            { Id: '003', Name: 'Deal 3', Amount: 300000, StageName: 'Stage 4 - Proposal' }
          ],
          totalSize: 3
        };
        
        const result = formatResponse(queryResult, { intent: 'pipeline_summary', entities: {} });
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(50);
      });

      test('handles more than 10 results', () => {
        const records = Array.from({ length: 15 }, (_, i) => ({
          Id: `00${i}`,
          Name: `Deal ${i}`,
          Amount: 100000 * (i + 1),
          StageName: 'Stage 3 - Pilot'
        }));
        
        const queryResult = { records, totalSize: 15 };
        const result = formatResponse(queryResult, { intent: 'pipeline_summary', entities: {} });
        expect(result).toBeDefined();
      });
    });

    describe('error responses', () => {
      test('handles query result with error', () => {
        const queryResult = {
          error: 'Salesforce connection failed',
          success: false
        };
        
        const result = formatResponse(queryResult, { intent: 'account_lookup', entities: {} });
        expect(result).toBeDefined();
      });
    });

    describe('intent-specific formatting', () => {
      test.each([
        ['account_ownership', { accounts: ['Test'] }],
        ['account_lookup', { accounts: ['Test'] }],
        ['account_context', { accounts: ['Test'] }],
        ['pipeline_summary', {}],
        ['late_stage_pipeline', { stages: ['Stage 3'] }],
        ['loi_date', {}],
        ['export_pipeline', {}],
      ])('formats %s intent', (intent, entities) => {
        const queryResult = {
          records: [
            { Id: '001', Name: 'Test', Amount: 100000 }
          ],
          totalSize: 1
        };
        
        const result = formatResponse(queryResult, { intent, entities });
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    describe('formatting edge cases', () => {
      test('handles records with missing fields', () => {
        const queryResult = {
          records: [
            { Id: '001' } // Minimal record
          ],
          totalSize: 1
        };
        
        const result = formatResponse(queryResult, { intent: 'pipeline_summary', entities: {} });
        expect(result).toBeDefined();
      });

      test('handles null Amount', () => {
        const queryResult = {
          records: [
            { Id: '001', Name: 'Test', Amount: null }
          ],
          totalSize: 1
        };
        
        const result = formatResponse(queryResult, { intent: 'pipeline_summary', entities: {} });
        expect(result).toBeDefined();
      });

      test('handles undefined fields', () => {
        const queryResult = {
          records: [
            { Id: '001', Name: undefined, Amount: undefined }
          ],
          totalSize: 1
        };
        
        const result = formatResponse(queryResult, { intent: 'deal_lookup', entities: {} });
        expect(result).toBeDefined();
      });
    });
  });
});

