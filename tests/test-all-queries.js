#!/usr/bin/env node

/**
 * Comprehensive test of all query types
 */

require('dotenv').config();

async function testAllQueries() {
  console.log('🧪 Testing ALL GTM-Wizard query types...\n');

  try {
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');
    const { parseIntent } = require('./src/ai/intentParser');

    console.log('🔌 Initializing systems...');
    await initializeRedis();
    await initializeSalesforce();
    console.log('✅ Systems initialized\n');

    // Test queries with expected outcomes
    const testQueries = [
      {
        query: 'BL for Asana',
        expectedIntent: 'account_lookup',
        description: 'Business lead lookup'
      },
      {
        query: 'which accounts have mentioned Harvey?',
        expectedIntent: 'account_field_lookup',
        description: 'Harvey mentions search'
      },
      {
        query: 'show me my pipeline',
        expectedIntent: 'pipeline_summary',
        description: 'General pipeline'
      },
      {
        query: 'what accounts are in Stage 2?',
        expectedIntent: 'account_stage_lookup',
        description: 'Accounts by stage'
      },
      {
        query: 'which opportunities are late stage contracting?',
        expectedIntent: 'pipeline_summary',
        description: 'Product line + stage'
      },
      {
        query: 'what deals were added to pipeline this week?',
        expectedIntent: 'deal_lookup',
        description: 'Pipeline additions'
      },
      {
        query: "what's the legal team size at Best Buy?",
        expectedIntent: 'account_field_lookup',
        description: 'Legal team size'
      },
      {
        query: 'early stage deals',
        expectedIntent: 'pipeline_summary',
        description: 'Early stage filter'
      }
    ];

    for (const test of testQueries) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🔍 Testing: "${test.query}"`);
      console.log(`Expected: ${test.expectedIntent} (${test.description})`);
      console.log('─'.repeat(70));

      try {
        // Parse intent
        const parsedIntent = await parseIntent(test.query, null, 'test_user');
        
        const matchIcon = parsedIntent.intent === test.expectedIntent ? '✅' : '❌';
        console.log(`${matchIcon} Intent: ${parsedIntent.intent} (confidence: ${(parsedIntent.confidence * 100).toFixed(0)}%)`);
        console.log(`Entities:`, JSON.stringify(parsedIntent.entities, null, 2));

        if (parsedIntent.intent !== test.expectedIntent) {
          console.log(`⚠️  MISMATCH! Expected ${test.expectedIntent}, got ${parsedIntent.intent}`);
        }

      } catch (error) {
        console.log(`❌ Parse error: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('🎉 Intent parsing test completed!');
    console.log('Review mismatches above and fix intent detection logic.');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAllQueries();

