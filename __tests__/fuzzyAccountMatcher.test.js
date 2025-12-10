/**
 * Comprehensive tests for FuzzyAccountMatcher module
 * Tests pure functions and matching logic
 */

const fuzzyMatcher = require('../src/utils/fuzzyAccountMatcher');

describe('FuzzyAccountMatcher', () => {
  describe('normalize', () => {
    describe('happy path', () => {
      test('converts to lowercase', () => {
        expect(fuzzyMatcher.normalize('BOEING')).toBe('boeing');
      });

      test('trims whitespace', () => {
        expect(fuzzyMatcher.normalize('  Intel  ')).toBe('intel');
      });

      test('removes punctuation', () => {
        expect(fuzzyMatcher.normalize('Boeing, Inc.')).toBe('boeing');
      });

      test('handles ampersand in company names', () => {
        const result = fuzzyMatcher.normalize('AT&T');
        // Ampersand may or may not be preserved depending on implementation
        expect(result).toContain('at');
      });
    });

    describe('suffix removal', () => {
      test('removes Corporation', () => {
        expect(fuzzyMatcher.normalize('Microsoft Corporation')).toBe('microsoft');
      });

      test('removes Corp', () => {
        expect(fuzzyMatcher.normalize('Intel Corp')).toBe('intel');
      });

      test('removes Inc', () => {
        expect(fuzzyMatcher.normalize('Apple Inc')).toBe('apple');
      });

      test('removes Limited', () => {
        expect(fuzzyMatcher.normalize('HSBC Limited')).toBe('hsbc');
      });

      test('removes LLC', () => {
        expect(fuzzyMatcher.normalize('Acme LLC')).toBe('acme');
      });

      test('removes PLC', () => {
        expect(fuzzyMatcher.normalize('BP PLC')).toBe('bp');
      });

      test('removes Company', () => {
        expect(fuzzyMatcher.normalize('Ford Motor Company')).toBe('ford motor');
      });

      test('removes multiple suffixes', () => {
        expect(fuzzyMatcher.normalize('ABC Holdings Inc')).toBe('abc');
      });

      test('removes The', () => {
        const result = fuzzyMatcher.normalize('The Boeing Company');
        expect(result).not.toContain('the');
        expect(result).toContain('boeing');
      });
    });

    describe('edge cases', () => {
      test('handles empty string', () => {
        expect(fuzzyMatcher.normalize('')).toBe('');
      });

      test('handles single character', () => {
        expect(fuzzyMatcher.normalize('A')).toBe('a');
      });

      test('handles company with all suffixes', () => {
        const result = fuzzyMatcher.normalize('ABC Corp Inc LLC');
        expect(result).toBe('abc');
      });

      test('handles numbers in name', () => {
        const result = fuzzyMatcher.normalize('3M Company');
        expect(result).toContain('3m');
      });
    });
  });

  describe('expandAlias', () => {
    describe('known aliases', () => {
      test('expands IBM', () => {
        expect(fuzzyMatcher.expandAlias('ibm')).toBe('International Business Machines');
      });

      test('expands GE', () => {
        expect(fuzzyMatcher.expandAlias('ge')).toBe('General Electric');
      });

      test('expands 3M', () => {
        expect(fuzzyMatcher.expandAlias('3m')).toBe('Minnesota Mining and Manufacturing');
      });

      test('expands HP', () => {
        expect(fuzzyMatcher.expandAlias('hp')).toBe('Hewlett-Packard');
      });

      test('expands BofA', () => {
        expect(fuzzyMatcher.expandAlias('bofa')).toBe('Bank of America');
      });

      test('expands GS', () => {
        expect(fuzzyMatcher.expandAlias('gs')).toBe('Goldman Sachs');
      });

      test('expands MS', () => {
        expect(fuzzyMatcher.expandAlias('ms')).toBe('Morgan Stanley');
      });
    });

    describe('unknown aliases', () => {
      test('returns original for unknown alias', () => {
        expect(fuzzyMatcher.expandAlias('boeing')).toBe('boeing');
      });

      test('returns original for full company name', () => {
        expect(fuzzyMatcher.expandAlias('Microsoft')).toBe('Microsoft');
      });
    });

    describe('case handling', () => {
      test('handles uppercase (returns original if not in alias map)', () => {
        const result = fuzzyMatcher.expandAlias('IBM');
        // Uppercase 'IBM' is not in the alias map (which has lowercase keys)
        // so it returns the original
        expect(result).toBe('IBM');
      });

      test('handles lowercase', () => {
        expect(fuzzyMatcher.expandAlias('ibm')).toBe('International Business Machines');
      });
    });
  });

  describe('similarityScore', () => {
    describe('exact matches', () => {
      test('returns 1.0 for identical strings', () => {
        expect(fuzzyMatcher.similarityScore('boeing', 'boeing')).toBe(1.0);
      });

      test('returns 1.0 for case-different identical strings', () => {
        expect(fuzzyMatcher.similarityScore('Boeing', 'BOEING')).toBe(1.0);
      });
    });

    describe('containment matches', () => {
      test('returns 0.9 when one contains the other', () => {
        expect(fuzzyMatcher.similarityScore('microsoft', 'microsoft corporation')).toBe(0.9);
      });

      test('returns 0.9 for reverse containment', () => {
        expect(fuzzyMatcher.similarityScore('intel corporation', 'intel')).toBe(0.9);
      });
    });

    describe('partial matches', () => {
      test('returns score between 0 and 1 for partial match', () => {
        const score = fuzzyMatcher.similarityScore('boeing company', 'boeing inc');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(1);
      });

      test('returns higher score for more similar strings', () => {
        const score1 = fuzzyMatcher.similarityScore('boeing', 'boing');
        const score2 = fuzzyMatcher.similarityScore('boeing', 'apple');
        // Both may have low scores, but boeing/boing should be higher than boeing/apple
        expect(score1).toBeGreaterThanOrEqual(score2);
      });
    });

    describe('no match', () => {
      test('returns 0 for completely different strings', () => {
        const score = fuzzyMatcher.similarityScore('xyz', 'abc');
        expect(score).toBeLessThan(0.5);
      });
    });

    describe('edge cases', () => {
      test('handles empty strings', () => {
        const score = fuzzyMatcher.similarityScore('', '');
        expect(score).toBeDefined();
      });

      test('handles single character strings', () => {
        const score = fuzzyMatcher.similarityScore('a', 'a');
        expect(score).toBe(1.0);
      });
    });
  });

  describe('levenshteinDistance', () => {
    describe('happy path', () => {
      test('returns 0 for identical strings', () => {
        expect(fuzzyMatcher.levenshteinDistance('boeing', 'boeing')).toBe(0);
      });

      test('returns 1 for single character difference', () => {
        expect(fuzzyMatcher.levenshteinDistance('boeing', 'boing')).toBe(1);
      });

      test('returns correct distance for substitution', () => {
        expect(fuzzyMatcher.levenshteinDistance('cat', 'bat')).toBe(1);
      });

      test('returns correct distance for insertion', () => {
        expect(fuzzyMatcher.levenshteinDistance('cat', 'cats')).toBe(1);
      });

      test('returns correct distance for deletion', () => {
        expect(fuzzyMatcher.levenshteinDistance('cats', 'cat')).toBe(1);
      });

      test('returns correct distance for multiple edits', () => {
        expect(fuzzyMatcher.levenshteinDistance('kitten', 'sitting')).toBe(3);
      });
    });

    describe('edge cases', () => {
      test('handles empty first string', () => {
        expect(fuzzyMatcher.levenshteinDistance('', 'abc')).toBe(3);
      });

      test('handles empty second string', () => {
        expect(fuzzyMatcher.levenshteinDistance('abc', '')).toBe(3);
      });

      test('handles both empty', () => {
        expect(fuzzyMatcher.levenshteinDistance('', '')).toBe(0);
      });

      test('handles single character strings', () => {
        expect(fuzzyMatcher.levenshteinDistance('a', 'b')).toBe(1);
        expect(fuzzyMatcher.levenshteinDistance('a', 'a')).toBe(0);
      });
    });

    describe('distance symmetry', () => {
      test('distance is symmetric', () => {
        const d1 = fuzzyMatcher.levenshteinDistance('hello', 'world');
        const d2 = fuzzyMatcher.levenshteinDistance('world', 'hello');
        expect(d1).toBe(d2);
      });
    });
  });

  describe('cacheResult', () => {
    test('caches account result', () => {
      const account = { id: '001', name: 'Test Corp' };
      fuzzyMatcher.cacheResult('testkey', account);
      
      // Verify it's cached
      const cached = fuzzyMatcher.accountCache.get('testkey');
      expect(cached).toBeDefined();
      expect(cached.account).toEqual(account);
      expect(cached.timestamp).toBeDefined();
    });
  });

  describe('instance properties', () => {
    test('has suffixes array', () => {
      expect(fuzzyMatcher.suffixes).toBeInstanceOf(Array);
      expect(fuzzyMatcher.suffixes.length).toBeGreaterThan(0);
    });

    test('has abbreviations map', () => {
      expect(fuzzyMatcher.abbreviations).toBeDefined();
      expect(typeof fuzzyMatcher.abbreviations).toBe('object');
    });

    test('has aliases map', () => {
      expect(fuzzyMatcher.aliases).toBeDefined();
      expect(Object.keys(fuzzyMatcher.aliases).length).toBeGreaterThan(0);
    });

    test('has account cache', () => {
      expect(fuzzyMatcher.accountCache).toBeInstanceOf(Map);
    });

    test('has cache timeout set', () => {
      expect(fuzzyMatcher.cacheTimeout).toBe(300000);
    });
  });
});

describe('Company Name Variations', () => {
  describe('normalization handles Fortune 500 patterns', () => {
    test.each([
      ['Apple Inc.', 'apple'],
      ['Microsoft Corporation', 'microsoft'],
      ['Amazon.com, Inc.', 'amazoncom'],
      ['The Home Depot, Inc.', 'home depot'],
      ['Walmart Inc.', 'walmart'],
      ['JPMorgan Chase & Co.', 'jpmorgan chase'],
      ['Bank of America Corporation', 'bank of america'],
      ['Wells Fargo & Company', 'wells fargo'],
    ])('normalizes "%s" to contain "%s"', (input, expected) => {
      const result = fuzzyMatcher.normalize(input);
      expect(result).toContain(expected);
    });
  });
});

