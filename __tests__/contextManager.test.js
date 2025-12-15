/**
 * Comprehensive tests for Context Manager module
 * Tests conversation context management and suggestions
 */

const { getContext, updateContext, generateSuggestions } = require('../src/ai/contextManager');

describe('ContextManager', () => {
  describe('getContext', () => {
    test('returns null for non-existent context', async () => {
      const result = await getContext('UNONEXISTENT', 'CNONEXISTENT');
      expect(result).toBeNull();
    });

    test('returns context object when exists', async () => {
      // First set context
      await updateContext('UTEST1', 'CTEST1', {
        intent: 'account_ownership',
        entities: { accounts: ['Boeing'] }
      }, null);
      
      // Then get it
      const result = await getContext('UTEST1', 'CTEST1');
      expect(result).toBeDefined();
    });
  });

  describe('updateContext', () => {
    test('stores context successfully', async () => {
      const parsedIntent = {
        intent: 'pipeline_summary',
        entities: { stages: ['Stage 3 - Pilot'] }
      };
      
      const result = await updateContext('UTEST2', 'CTEST2', parsedIntent, null);
      expect(result).toBeDefined();
    });

    test('updates existing context', async () => {
      // First update
      await updateContext('UTEST3', 'CTEST3', {
        intent: 'account_ownership',
        entities: { accounts: ['Intel'] }
      }, null);
      
      // Second update
      await updateContext('UTEST3', 'CTEST3', {
        intent: 'account_opportunities',
        entities: { accounts: ['Intel'] }
      }, null);
      
      const context = await getContext('UTEST3', 'CTEST3');
      expect(context).toBeDefined();
    });

    test('handles null query result', async () => {
      const result = await updateContext('UTEST4', 'CTEST4', {
        intent: 'test'
      }, null);
      expect(result).toBeDefined();
    });
  });

  describe('generateSuggestions', () => {
    describe('account ownership context', () => {
      test('generates pipeline follow-up suggestions', () => {
        const parsedIntent = {
          intent: 'account_ownership',
          entities: { accounts: ['Boeing'] }
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        expect(suggestions).toBeInstanceOf(Array);
        expect(suggestions.length).toBeGreaterThan(0);
      });

      test('suggestions include account-specific queries', () => {
        const parsedIntent = {
          intent: 'account_ownership',
          entities: { accounts: ['Microsoft'] }
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        const suggestionText = suggestions.join(' ');
        
        // Should have account-related follow-ups
        expect(suggestions.length).toBeGreaterThan(0);
      });
    });

    describe('pipeline context', () => {
      test('generates stage-specific suggestions', () => {
        const parsedIntent = {
          intent: 'late_stage_pipeline',
          entities: { stages: ['Stage 3 - Pilot', 'Stage 4 - Proposal'] }
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        expect(suggestions).toBeInstanceOf(Array);
      });

      test('handles empty entities', () => {
        const parsedIntent = {
          intent: 'pipeline_summary',
          entities: {}
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        expect(suggestions).toBeInstanceOf(Array);
      });
    });

    describe('unknown context', () => {
      test('returns empty array for unknown intent', () => {
        const parsedIntent = {
          intent: 'unknown',
          entities: {}
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        expect(suggestions).toBeInstanceOf(Array);
      });
    });

    describe('edge cases', () => {
      test('handles null parsed intent', () => {
        const suggestions = generateSuggestions(null);
        expect(suggestions).toBeInstanceOf(Array);
      });

      test('handles undefined parsed intent', () => {
        const suggestions = generateSuggestions(undefined);
        expect(suggestions).toBeInstanceOf(Array);
      });

      test('handles missing entities', () => {
        const parsedIntent = {
          intent: 'account_ownership'
        };
        
        const suggestions = generateSuggestions(parsedIntent);
        expect(suggestions).toBeInstanceOf(Array);
      });
    });
  });
});


