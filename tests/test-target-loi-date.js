#!/usr/bin/env node
require('dotenv').config();

async function testDates() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  const soql = `SELECT Id, Name, StageName, IsClosed, CloseDate, Target_LOI_Date__c, Target_LOI_Sign_Date__c
                FROM Opportunity 
                WHERE StageName = 'Stage 4 - Proposal' AND IsClosed = false
                LIMIT 5`;

  console.log('Testing date fields...\n');
  const result = await query(soql, false);
  
  result.records.forEach(r => {
    console.log(`${r.Name}:`);
    console.log(`  Target_LOI_Date__c: ${r.Target_LOI_Date__c || 'NULL'}`);
    console.log(`  Target_LOI_Sign_Date__c: ${r.Target_LOI_Sign_Date__c || 'NULL'}`);
    console.log(`  CloseDate: ${r.CloseDate || 'NULL'}`);
    console.log('');
  });

  process.exit(0);
}

testDates();
