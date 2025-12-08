#!/usr/bin/env node
require('dotenv').config();

async function testARR() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Find actual closed won deals
  console.log('Finding closed won deals...\n');
  const closedQuery = `SELECT Id, Name, StageName, CloseDate, Revenue_Type__c 
                       FROM Opportunity 
                       WHERE IsClosed = true AND IsWon = true
                       ORDER BY CloseDate DESC
                       LIMIT 10`;
  
  const result = await query(closedQuery, false);
  console.log(`Found ${result.totalSize} closed won deals\n`);
  
  console.log('Sample stages:');
  const stageSet = new Set();
  result.records.forEach(r => stageSet.add(r.StageName));
  stageSet.forEach(stage => console.log(`  - "${stage}"`));
  
  console.log('\nRevenue Types:');
  const revenueSet = new Set();
  result.records.forEach(r => revenueSet.add(r.Revenue_Type__c || 'null'));
  revenueSet.forEach(rev => console.log(`  - "${rev}"`));
  
  console.log('\nSample records:');
  result.records.slice(0, 3).forEach(r => {
    console.log(`  ${r.Name}: Stage="${r.StageName}", Revenue="${r.Revenue_Type__c}", Date=${r.CloseDate}`);
  });

  process.exit(0);
}

testARR();
