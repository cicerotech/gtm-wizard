#!/usr/bin/env node

require('dotenv').config();

async function testLateStage() {
  try {
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');
    const { parseIntent } = require('./src/ai/intentParser');
    const { queryBuilder } = require('./src/salesforce/queries');

    await initializeRedis();
    await initializeSalesforce();

    const testQuery = 'what deals are late stage?';
    console.log(`Testing: "${testQuery}"\n`);

    // Parse
    const parsed = await parseIntent(testQuery, null, 'test_user');
    console.log('Parsed intent:', parsed.intent);
    console.log('Entities:', JSON.stringify(parsed.entities, null, 2));

    // Build query
    try {
      const soql = queryBuilder.buildOpportunityQuery(parsed.entities);
      console.log('\nGenerated SOQL:');
      console.log(soql);

      // Execute
      const result = await query(soql, false);
      console.log(`\n✅ Query successful: ${result.totalSize} records`);
      
    } catch (error) {
      console.log(`\n❌ Query failed: ${error.message}`);
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testLateStage();

