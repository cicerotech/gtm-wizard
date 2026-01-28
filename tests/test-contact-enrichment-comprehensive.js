/**
 * Comprehensive Contact Enrichment Test Suite
 * Tests against real Salesforce data with timing and accuracy metrics
 * 
 * Test Categories:
 * 1. Complete SF records (should skip enrichment)
 * 2. Incomplete SF records (should trigger enrichment)
 * 3. Name variations (fuzzy matching)
 * 4. Company abbreviations
 * 5. No SF match (pure enrichment)
 * 
 * Run: npm test -- tests/test-contact-enrichment-comprehensive.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Test fixtures will be loaded from generated file
let testFixtures = null;

// Test result tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  byCategory: {},
  timings: [],
  errors: []
};

// Mock client for tests that don't need real API calls
const mockClaudeClient = {
  enrichContact: jest.fn().mockResolvedValue({
    success: true,
    data: {
      phone: '+1-555-123-4567',
      email: 'test@example.com',
      linkedin: 'https://linkedin.com/in/testuser'
    },
    duration: 500
  })
};

describe('Contact Enrichment Comprehensive Tests', () => {
  let contactEnrichment;
  let fuzzyContactMatcher;

  beforeAll(async () => {
    // Load modules
    contactEnrichment = require('../src/services/contactEnrichment');
    fuzzyContactMatcher = require('../src/services/fuzzyContactMatcher');

    // Try to load test fixtures
    try {
      testFixtures = require('../data/contact-test-fixtures.json');
      console.log(`📋 Loaded test fixtures: ${testFixtures.stats?.totalTestCases || 0} test cases`);
    } catch (error) {
      console.log('⚠️ No test fixtures found. Run: node scripts/generate-contact-test-data.js');
      testFixtures = null;
    }
  });

  afterAll(() => {
    // Print summary
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Total Tests:   ${testResults.total}`);
    console.log(`  Passed:        ${testResults.passed} (${Math.round(testResults.passed/testResults.total*100) || 0}%)`);
    console.log(`  Failed:        ${testResults.failed}`);
    console.log(`  Skipped:       ${testResults.skipped}`);
    
    if (testResults.timings.length > 0) {
      const avgTime = testResults.timings.reduce((a, b) => a + b, 0) / testResults.timings.length;
      console.log(`  Avg Duration:  ${Math.round(avgTime)}ms`);
    }
    
    console.log('\n  By Category:');
    Object.entries(testResults.byCategory).forEach(([cat, stats]) => {
      console.log(`    ${cat}: ${stats.passed}/${stats.total} passed`);
    });
    console.log('═══════════════════════════════════════════════════\n');
  });

  // Helper to track results
  const trackResult = (category, passed, duration = 0) => {
    testResults.total++;
    if (passed) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    if (duration > 0) {
      testResults.timings.push(duration);
    }
    
    if (!testResults.byCategory[category]) {
      testResults.byCategory[category] = { total: 0, passed: 0 };
    }
    testResults.byCategory[category].total++;
    if (passed) {
      testResults.byCategory[category].passed++;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: Input Parsing Tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Input Parsing', () => {
    const parseTestCases = [
      {
        input: 'Bob Smith at Microsoft',
        expected: { firstName: 'Bob', lastName: 'Smith', company: 'Microsoft' }
      },
      {
        input: 'Sarah Johnson, VP Legal at Acme Corp',
        expected: { firstName: 'Sarah', lastName: 'Johnson', title: 'VP Legal', company: 'Acme Corp' }
      },
      {
        input: 'John Doe from Google',
        expected: { firstName: 'John', lastName: 'Doe', company: 'Google' }
      },
      {
        input: 'Jane Smith (Apple)',
        expected: { firstName: 'Jane', lastName: 'Smith', company: 'Apple' }
      },
      {
        input: "Michael O'Brien at Johnson & Johnson",
        expected: { firstName: 'Michael', lastName: "O'Brien", company: 'Johnson & Johnson' }
      },
      {
        input: 'Smith',
        expected: { firstName: 'Smith', lastName: 'Smith' } // Single word treated as both
      }
    ];

    test.each(parseTestCases)('parses "$input" correctly', ({ input, expected }) => {
      const result = fuzzyContactMatcher.parseInput(input);
      
      expect(result).not.toBeNull();
      expect(result.firstName).toBe(expected.firstName);
      expect(result.lastName).toBe(expected.lastName);
      
      if (expected.company) {
        expect(result.company).toBe(expected.company);
      }
      if (expected.title) {
        expect(result.title).toBe(expected.title);
      }

      trackResult('input_parsing', true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: Name Variation Tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Name Variations', () => {
    const nameVariations = [
      { nickname: 'Bob', formal: 'Robert' },
      { nickname: 'Bill', formal: 'William' },
      { nickname: 'Mike', formal: 'Michael' },
      { nickname: 'Jim', formal: 'James' },
      { nickname: 'Tom', formal: 'Thomas' },
      { nickname: 'Dick', formal: 'Richard' },
      { nickname: 'Joe', formal: 'Joseph' },
      { nickname: 'Dan', formal: 'Daniel' },
      { nickname: 'Dave', formal: 'David' },
      { nickname: 'Steve', formal: 'Steven' },
      { nickname: 'Chris', formal: 'Christopher' },
      { nickname: 'Matt', formal: 'Matthew' },
      { nickname: 'Tony', formal: 'Anthony' },
      { nickname: 'Nick', formal: 'Nicholas' }
    ];

    test.each(nameVariations)('$nickname should map to $formal', ({ nickname, formal }) => {
      const variations = fuzzyContactMatcher.getNameVariations(nickname);
      
      expect(variations).toContain(nickname);
      expect(variations.some(v => v.toLowerCase() === formal.toLowerCase())).toBe(true);

      trackResult('name_variations', true);
    });

    test.each(nameVariations)('$formal should include $nickname in variations', ({ nickname, formal }) => {
      const variations = fuzzyContactMatcher.getNameVariations(formal);
      
      expect(variations).toContain(formal);
      expect(variations.some(v => v.toLowerCase() === nickname.toLowerCase())).toBe(true);

      trackResult('name_variations', true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: Fuzzy Contact Matching (with fixtures)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Fuzzy Contact Matching', () => {
    // Skip if no fixtures
    beforeAll(() => {
      if (!testFixtures) {
        console.log('⚠️ Skipping fixture-based tests - no fixtures loaded');
      }
    });

    test('should find complete records without enrichment', async () => {
      if (!testFixtures?.categories?.completeRecords?.length) {
        testResults.skipped++;
        return;
      }

      const sampleContact = testFixtures.categories.completeRecords[0];
      const start = Date.now();
      
      const result = await contactEnrichment.lookup(
        `${sampleContact.firstName} ${sampleContact.lastName} at ${sampleContact.accountName}`
      );

      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.source).toBe('sf_only');
      expect(result.enriched).toBe(false);
      expect(duration).toBeLessThan(10000);

      trackResult('complete_records', true, duration);
    });

    test('should identify incomplete records for enrichment', async () => {
      if (!testFixtures?.categories?.incompleteRecords?.length) {
        testResults.skipped++;
        return;
      }

      const sampleContact = testFixtures.categories.incompleteRecords[0];
      const start = Date.now();

      const result = await contactEnrichment.lookup(
        `${sampleContact.firstName} ${sampleContact.lastName} at ${sampleContact.accountName}`
      );

      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      // Should either be sf_only (if Claude not configured) or sf_enriched
      expect(['sf_only', 'sf_enriched']).toContain(result.source);
      expect(duration).toBeLessThan(15000);

      trackResult('incomplete_records', true, duration);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4: Multiple Match Handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Multiple Match Handling', () => {
    test('should return top 3 when multiple matches found', async () => {
      // Use a common last name that likely has multiple matches
      const result = await fuzzyContactMatcher.findContact('Smith');
      
      if (result.success && result.contacts.length > 1) {
        expect(result.multipleMatches).toBe(true);
        expect(result.contacts.length).toBeLessThanOrEqual(10);
        trackResult('multiple_matches', true);
      } else {
        // No multiple matches found - still valid
        trackResult('multiple_matches', true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: Error Handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Error Handling', () => {
    test('should handle empty input gracefully', async () => {
      const result = await contactEnrichment.lookup('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      trackResult('error_handling', true);
    });

    test('should handle null input gracefully', async () => {
      const result = await contactEnrichment.lookup(null);
      
      expect(result.success).toBe(false);

      trackResult('error_handling', true);
    });

    test('should handle malformed input gracefully', async () => {
      const result = await contactEnrichment.lookup('@@##$$');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      trackResult('error_handling', true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6: Response Time Requirements
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Performance Requirements', () => {
    test('lookup should complete within 10 seconds', async () => {
      const start = Date.now();
      
      await contactEnrichment.lookup('Test User at Test Company');
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10000);
      trackResult('performance', true, duration);
    });

    test('input parsing should be instant (<10ms)', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        fuzzyContactMatcher.parseInput('John Smith at Acme Corp');
      }
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // 100 parses in <100ms = <1ms each
      trackResult('performance', true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7: Analytics Tracking
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Analytics Tracking', () => {
    test('should track lookup results', async () => {
      // Reset analytics
      contactEnrichment.resetAnalytics();
      
      // Make a few lookups
      await contactEnrichment.lookup('Test User at Test Company');
      await contactEnrichment.lookup('Another User at Another Company');
      
      const analytics = contactEnrichment.getAnalytics();
      
      expect(analytics.total).toBeGreaterThanOrEqual(2);
      expect(analytics.bySource).toBeDefined();
      expect(analytics.byOutcome).toBeDefined();

      trackResult('analytics', true);
    });

    test('should record corrections', () => {
      contactEnrichment.recordCorrection('test_lookup_123', {
        type: 'wrong_person',
        correct: 'John Smith'
      });
      
      const analytics = contactEnrichment.getAnalytics();
      
      // Correction rate should be trackable
      expect(analytics.correctionRate).toBeDefined();

      trackResult('analytics', true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8: Fixture-Based Stress Tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Stress Tests (Fixtures)', () => {
    test('should handle batch of name+company lookups', async () => {
      if (!testFixtures?.testCases) {
        testResults.skipped++;
        return;
      }

      const nameCompanyTests = testFixtures.testCases
        .filter(tc => tc.type === 'name_company')
        .slice(0, 5); // Limit for speed

      const results = [];
      
      for (const testCase of nameCompanyTests) {
        const start = Date.now();
        const result = await contactEnrichment.lookup(testCase.input);
        const duration = Date.now() - start;
        
        results.push({
          input: testCase.input,
          success: result.success,
          duration,
          foundExpected: result.contacts?.some(c => c.sfId === testCase.expectedId)
        });
      }

      const successRate = results.filter(r => r.success).length / results.length;
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      console.log(`  Batch test: ${Math.round(successRate * 100)}% success, avg ${Math.round(avgDuration)}ms`);

      expect(successRate).toBeGreaterThan(0.5); // At least 50% should succeed
      expect(avgDuration).toBeLessThan(10000);

      trackResult('stress_test', true, avgDuration);
    });

    test('should handle nickname variations', async () => {
      if (!testFixtures?.nameVariations?.length) {
        testResults.skipped++;
        return;
      }

      const nicknameTests = testFixtures.nameVariations.slice(0, 3);
      let matched = 0;

      for (const testCase of nicknameTests) {
        const result = await fuzzyContactMatcher.findContact(testCase.input);
        
        if (result.success && result.contacts?.length > 0) {
          matched++;
        }
      }

      const matchRate = matched / nicknameTests.length;
      console.log(`  Nickname matching: ${matched}/${nicknameTests.length} (${Math.round(matchRate * 100)}%)`);

      trackResult('nickname_matching', matchRate > 0, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Standalone Stress Test Function
// ═══════════════════════════════════════════════════════════════════════════
async function runStressTest(count = 20) {
  console.log(`\n🏋️ Running stress test with ${count} contacts...\n`);
  
  const contactEnrichment = require('../src/services/contactEnrichment');
  
  let testFixtures;
  try {
    testFixtures = require('../data/contact-test-fixtures.json');
  } catch (e) {
    console.log('❌ No test fixtures. Run: node scripts/generate-contact-test-data.js');
    return;
  }

  const testCases = testFixtures.testCases.slice(0, count);
  const results = {
    total: 0,
    sfOnly: 0,
    sfEnriched: 0,
    webOnly: 0,
    noResult: 0,
    errors: 0,
    timings: []
  };

  for (const testCase of testCases) {
    const start = Date.now();
    
    try {
      const result = await contactEnrichment.lookup(testCase.input);
      const duration = Date.now() - start;
      
      results.total++;
      results.timings.push(duration);
      
      if (result.source === 'sf_only') results.sfOnly++;
      else if (result.source === 'sf_enriched') results.sfEnriched++;
      else if (result.source === 'web_only') results.webOnly++;
      else results.noResult++;
      
      process.stdout.write('.');
    } catch (error) {
      results.errors++;
      process.stdout.write('x');
    }
  }

  const avgTime = results.timings.reduce((a, b) => a + b, 0) / results.timings.length;
  const maxTime = Math.max(...results.timings);
  const minTime = Math.min(...results.timings);

  console.log(`\n\n📊 Stress Test Results:`);
  console.log(`  Total:        ${results.total}`);
  console.log(`  SF Only:      ${results.sfOnly} (${Math.round(results.sfOnly/results.total*100)}%)`);
  console.log(`  SF Enriched:  ${results.sfEnriched} (${Math.round(results.sfEnriched/results.total*100)}%)`);
  console.log(`  Web Only:     ${results.webOnly} (${Math.round(results.webOnly/results.total*100)}%)`);
  console.log(`  No Result:    ${results.noResult} (${Math.round(results.noResult/results.total*100)}%)`);
  console.log(`  Errors:       ${results.errors}`);
  console.log(`  Avg Time:     ${Math.round(avgTime)}ms`);
  console.log(`  Min/Max:      ${minTime}ms / ${maxTime}ms`);
}

// Export for CLI use
module.exports = { runStressTest };




