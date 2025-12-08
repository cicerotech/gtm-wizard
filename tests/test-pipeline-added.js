#!/usr/bin/env node

require('dotenv').config();

async function testPipelineAdded() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  const { parseIntent } = require('./src/ai/intentParser');
  const { queryBuilder } = require('./src/salesforce/queries');
  
  await initializeSalesforce();

  const testQuery = "what deals were added to pipeline this week?";
  console.log(`Testing: "${testQuery}"\n`);

  // Parse
  const parsed = await parseIntent(testQuery, null, 'test');
  console.log('Parsed entities:', JSON.stringify(parsed.entities, null, 2));

  // Build query
  const soql = queryBuilder.buildOpportunityQuery(parsed.entities);
  console.log('\nGenerated SOQL:');
  console.log(soql);

  // Execute
  try {
    const result = await query(soql, false);
    console.log(`\n✅ Query successful: ${result.totalSize} records`);
    
    if (result.records && result.records.length > 0) {
      console.log('\nDeals added this week:');
      result.records.slice(0, 5).forEach(record => {
        console.log(`  - ${record.Name} (${record.Week_Created__c})`);
      });
    }
    
  } catch (error) {
    console.log(`\n❌ Query failed: ${error.message}`);
  }

  process.exit(0);
}

testPipelineAdded();

