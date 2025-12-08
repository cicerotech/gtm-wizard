#!/usr/bin/env node

/**
 * Test actual query execution
 */

require('dotenv').config();

async function testExecuteQueries() {
  console.log('🔍 Testing query execution...\n');

  try {
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');

    await initializeRedis();
    await initializeSalesforce();

    // Test the failing queries
    const tests = [
      {
        name: 'Harvey Mentions',
        soql: `SELECT Id, Name, Owner.Name, Use_Cases__c, Pain_Points_Identified__c, Competitive_Landscape__c
               FROM Account 
               WHERE (Use_Cases__c LIKE '%harvey%' 
                  OR Pain_Points_Identified__c LIKE '%harvey%'
                  OR Competitive_Landscape__c LIKE '%harvey%')
               ORDER BY Name LIMIT 15`
      },
      {
        name: 'Accounts in Stage 2',
        soql: `SELECT Account.Name, Account.Owner.Name, Account.Industry, Name, Amount, CloseDate
               FROM Opportunity 
               WHERE StageName = 'Stage 2 - SQO' AND IsClosed = false
               ORDER BY Amount DESC
               LIMIT 20`
      },
      {
        name: 'Legal Team Size - Best Buy',
        soql: `SELECT Id, Name, Owner.Name, Legal_Department_Size__c, Industry
               FROM Account 
               WHERE Legal_Department_Size__c != null
                 AND (Name LIKE '%Best Buy%')
               ORDER BY Legal_Department_Size__c DESC LIMIT 10`
      },
      {
        name: 'Show me my pipeline',
        soql: `SELECT Id, Name, Amount, ACV__c, StageName, CloseDate
               FROM Opportunity 
               WHERE IsClosed = false 
               ORDER BY Amount DESC 
               LIMIT 10`
      }
    ];

    for (const test of tests) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Testing: ${test.name}`);
      console.log('─'.repeat(70));
      console.log(`SOQL: ${test.soql.replace(/\s+/g, ' ').trim()}`);
      
      try {
        const result = await query(test.soql, false); // Don't use cache
        console.log(`✅ SUCCESS - ${result.totalSize} records found`);
        
        if (result.records && result.records.length > 0) {
          console.log(`Sample:`, result.records[0]);
        }
        
      } catch (error) {
        console.log(`❌ QUERY FAILED:`);
        console.log(`Error: ${error.message}`);
        console.log(`\n🔧 Fix needed: Check if this field exists in your Salesforce`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('🎉 Query execution test completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testExecuteQueries();

