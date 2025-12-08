#!/usr/bin/env node

/**
 * Test just Salesforce functionality with simple queries
 */

require('dotenv').config();

async function testSalesforceOnly() {
  console.log('🏢 Testing Salesforce functionality...\n');

  try {
    // Initialize systems
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');
    const { queryBuilder } = require('./src/salesforce/queries');
    const { formatResponse } = require('./src/slack/responseFormatter');

    console.log('🔌 Initializing systems...');
    await initializeRedis();
    await initializeSalesforce();
    console.log('✅ Systems initialized\n');

    // Simple test queries without AI parsing
    const testQueries = [
      {
        name: 'All Open Opportunities',
        entities: { isClosed: false, limit: 5 }
      },
      {
        name: 'Closed Won This Week',
        entities: { isClosed: true, isWon: true, timeframe: 'this_week', limit: 5 }
      },
      {
        name: 'Large Deals ($100k+)',
        entities: { isClosed: false, amountThreshold: { min: 100000 }, limit: 5 }
      },
      {
        name: 'Pipeline by Stage (Aggregated)',
        entities: { isClosed: false, groupBy: ['StageName'], metrics: ['count', 'sum_amount'] }
      }
    ];

    for (const testQuery of testQueries) {
      console.log(`🔍 ${testQuery.name}`);
      console.log('─'.repeat(50));

      try {
        // Build query
        const soql = queryBuilder.buildOpportunityQuery(testQuery.entities);
        console.log(`SOQL: ${soql}`);

        // Execute query
        const result = await query(soql);
        console.log(`✅ Results: ${result.totalSize} records`);

        // Show sample data
        if (result.records && result.records.length > 0) {
          const sample = result.records[0];
          console.log('Sample record:', {
            Name: sample.Name,
            Amount: sample.Amount,
            StageName: sample.StageName,
            Owner: sample.Owner?.Name
          });
        }

        // Format response
        const mockIntent = { intent: 'pipeline_summary', entities: testQuery.entities };
        const response = formatResponse(result, mockIntent);
        console.log(`Formatted response: ${response.substring(0, 200)}...`);

        console.log('✅ Success!\n');

      } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
      }
    }

    console.log('🎉 Salesforce tests completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testSalesforceOnly();

