#!/usr/bin/env node

/**
 * Test the GTM Brain query processing without Slack
 */

require('dotenv').config();

async function testQuery() {
  console.log('🧠 Testing GTM Brain query processing...\n');

  try {
    // Initialize core systems
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce } = require('./src/salesforce/connection');
    const { parseIntent } = require('./src/ai/intentParser');
    const { queryBuilder } = require('./src/salesforce/queries');
    const { query } = require('./src/salesforce/connection');
    const { formatResponse } = require('./src/slack/responseFormatter');

    console.log('🔌 Initializing systems...');
    await initializeRedis();
    await initializeSalesforce();
    console.log('✅ Systems initialized\n');

    // Test queries
    const testQueries = [
      'show me my pipeline',
      'what closed this week?',
      'deals over $100k in proposal',
      'what needs attention?'
    ];

    for (const testQuery of testQueries) {
      console.log(`🤖 Query: "${testQuery}"`);
      console.log('─'.repeat(50));

      try {
        // Parse intent
        const parsedIntent = await parseIntent(testQuery, null, 'test_user');
        console.log(`Intent: ${parsedIntent.intent}`);
        console.log(`Confidence: ${(parsedIntent.confidence * 100).toFixed(0)}%`);

        // Build query
        const soql = queryBuilder.buildOpportunityQuery(parsedIntent.entities);
        console.log(`SOQL: ${soql.substring(0, 100)}...`);

        // Execute query
        const result = await query(soql);
        console.log(`Results: ${result.totalSize} records`);

        // Format response
        const response = formatResponse(result, parsedIntent);
        console.log(`Response: ${response.substring(0, 200)}...`);

        console.log('✅ Success!\n');

      } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
      }
    }

    console.log('🎉 All tests completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testQuery();

