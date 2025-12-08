#!/usr/bin/env node

require('dotenv').config();

async function testLOIComplete() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  const { parseIntent } = require('./src/ai/intentParser');
  const { queryBuilder } = require('./src/salesforce/queries');
  
  await initializeSalesforce();

  const testQuery = "what LOIs have we signed in the last two weeks?";
  console.log(`Testing: "${testQuery}"\n`);

  // Parse
  const parsed = await parseIntent(testQuery, null, 'test');
  console.log('Parsed:', JSON.stringify(parsed, null, 2));

  // Build query
  const soql = queryBuilder.buildOpportunityQuery(parsed.entities);
  console.log('\nGenerated SOQL:');
  console.log(soql);

  // Execute
  try {
    const result = await query(soql, false);
    console.log(`\n✅ Query successful: ${result.totalSize} records`);
    
    if (result.records && result.records.length > 0) {
      console.log('\nSample record:');
      const sample = result.records[0];
      console.log(`  Name: ${sample.Name}`);
      console.log(`  Amount: ${sample.Amount}`);
      console.log(`  Revenue_Type__c: ${sample.Revenue_Type__c}`);
      console.log(`  Target_LOI_Date__c: ${sample.Target_LOI_Date__c}`);
      console.log(`  IsClosed: ${sample.IsClosed}`);
      console.log(`  IsWon: ${sample.IsWon}`);
    }
    
  } catch (error) {
    console.log(`\n❌ Query failed: ${error.message}`);
  }

  process.exit(0);
}

testLOIComplete();

