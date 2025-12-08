#!/usr/bin/env node
require('dotenv').config();

async function testARR() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Test 1: What are the actual stage names for closed won?
  console.log('1. Finding actual closed won stage names...\n');
  const stageQuery = `SELECT DISTINCT StageName FROM Opportunity WHERE IsClosed = true AND IsWon = true LIMIT 10`;
  const stages = await query(stageQuery, false);
  console.log('Closed Won Stages Found:');
  stages.records.forEach(r => console.log(`  - "${r.StageName}"`));

  // Test 2: Find ARR deals
  console.log('\n2. Testing ARR query...\n');
  const arrQuery = `SELECT Id, Name, StageName, CloseDate, Revenue_Type__c, Amount
                    FROM Opportunity 
                    WHERE IsClosed = true 
                      AND IsWon = true
                      AND Revenue_Type__c = 'Recurring'
                      AND CloseDate = LAST_WEEK
                    LIMIT 10`;
  
  console.log('Query:', arrQuery.replace(/\s+/g, ' '));
  
  try {
    const result = await query(arrQuery, false);
    console.log(`\n✅ Found ${result.totalSize} ARR deals from last week`);
    
    if (result.records.length > 0) {
      result.records.forEach(r => {
        console.log(`  - ${r.Name}: ${r.Revenue_Type__c}, ${r.StageName}, ${r.CloseDate}`);
      });
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  process.exit(0);
}

testARR();
