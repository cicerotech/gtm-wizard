#!/usr/bin/env node

require('dotenv').config();

async function test() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Test minimal query first
  console.log('Testing minimal late stage query...\n');
  
  const minimalSOQL = `SELECT Id, Name, Amount, StageName, Owner.Name, Account.Name 
                       FROM Opportunity 
                       WHERE StageName = 'Stage 4 - Proposal' AND IsClosed = false 
                       LIMIT 5`;
  
  console.log('SOQL:', minimalSOQL);
  
  try {
    const result = await query(minimalSOQL, false);
    console.log(`✅ SUCCESS: ${result.totalSize} records`);
    
    // Now test with all fields
    console.log('\n\nTesting with all base fields...\n');
    
    const fullSOQL = `SELECT Id, Name, Amount, ACV__c, Finance_Weighted_ACV__c, StageName, 
                             CloseDate, Target_LOI_Date__c, Type, Revenue_Type__c, 
                             IsClosed, IsWon, Owner.Name, Account.Name 
                      FROM Opportunity 
                      WHERE StageName = 'Stage 4 - Proposal' AND IsClosed = false 
                      LIMIT 5`;
    
    console.log('SOQL:', fullSOQL.replace(/\s+/g, ' '));
    
    const result2 = await query(fullSOQL, false);
    console.log(`✅ SUCCESS: ${result2.totalSize} records`);
    
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
  }
  
  process.exit(0);
}

test();

