/**
 * Diagnostic script to test stage-based queries
 * Run with: node test-stage-query.js
 */

require('dotenv').config();
const { query } = require('./src/salesforce/connection');
const { queryBuilder } = require('./src/salesforce/queries');

async function testStageQueries() {
  console.log('🔍 Testing Stage-Based Queries\n');

  // Test 1: Check all open opportunities
  console.log('TEST 1: All open opportunities');
  const allOpenQuery = `SELECT COUNT(Id), StageName FROM Opportunity WHERE IsClosed = false GROUP BY StageName`;
  try {
    const result = await query(allOpenQuery, false);
    console.log('Result:', JSON.stringify(result.records, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n---\n');

  // Test 2: Late stage pipeline with exact stage names
  console.log('TEST 2: Late stage with exact names');
  const lateStageQuery = `SELECT Id, Name, StageName, ACV__c FROM Opportunity WHERE IsClosed = false AND StageName IN ('Stage 3 - Pilot', 'Stage 4 - Proposal') LIMIT 10`;
  try {
    const result = await query(lateStageQuery, false);
    console.log(`Found ${result.totalSize} opportunities`);
    if (result.records.length > 0) {
      console.log('Sample:', result.records[0]);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n---\n');

  // Test 3: Use query builder
  console.log('TEST 3: Late stage using query builder');
  const entities = {
    isClosed: false,
    stages: ['Stage 3 - Pilot', 'Stage 4 - Proposal']
  };
  const builtQuery = queryBuilder.buildOpportunityQuery(entities);
  console.log('Generated SOQL:', builtQuery.substring(0, 200) + '...');
  try {
    const result = await query(builtQuery, false);
    console.log(`Found ${result.totalSize} opportunities`);
    if (result.records.length > 0) {
      console.log('Sample:', result.records[0].Name, '-', result.records[0].StageName, '-', result.records[0].ACV__c);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n---\n');

  // Test 4: Contracting pipeline
  console.log('TEST 4: Contracting pipeline');
  const contractingEntities = {
    isClosed: false,
    productLine: 'AI-Augmented Contracting'
  };
  const contractingQuery = queryBuilder.buildOpportunityQuery(contractingEntities);
  console.log('Generated SOQL:', contractingQuery.substring(0, 200) + '...');
  try {
    const result = await query(contractingQuery, false);
    console.log(`Found ${result.totalSize} opportunities`);
    if (result.records.length > 0) {
      console.log('Sample:', result.records[0].Name, '-', result.records[0].StageName, '-', result.records[0].Product_Line__c);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n---\n');

  // Test 5: Stage 2 pipeline
  console.log('TEST 5: Stage 2 pipeline');
  const stage2Entities = {
    isClosed: false,
    stages: ['Stage 2 - SQO']
  };
  const stage2Query = queryBuilder.buildOpportunityQuery(stage2Entities);
  console.log('Generated SOQL:', stage2Query.substring(0, 200) + '...');
  try {
    const result = await query(stage2Query, false);
    console.log(`Found ${result.totalSize} opportunities`);
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n✅ Diagnostic complete');
  process.exit(0);
}

testStageQueries().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

