#!/usr/bin/env node

require('dotenv').config();

async function debugQueries() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  const { parseIntent } = require('./src/ai/intentParser');
  const { queryBuilder } = require('./src/salesforce/queries');
  
  await initializeSalesforce();

  const tests = [
    "who is the BL for StubHub?",
    "what LOIs have signed last month?"
  ];

  for (const testQuery of tests) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: "${testQuery}"`);
    console.log('─'.repeat(70));

    try {
      const parsed = await parseIntent(testQuery, null, 'test');
      console.log(`Intent: ${parsed.intent}`);
      console.log(`Entities:`, JSON.stringify(parsed.entities, null, 2));

      // Build query based on intent
      let soql = '';
      
      if (parsed.intent === 'account_lookup') {
        const accountName = parsed.entities.accounts?.[0] || 'Test';
        soql = `SELECT Id, Name, Owner.Name, Prior_Account_Owner_Name__c 
                FROM Account 
                WHERE Name LIKE '%${accountName}%' 
                LIMIT 5`;
      } else if (parsed.intent === 'deal_lookup') {
        soql = queryBuilder.buildOpportunityQuery(parsed.entities);
      }

      console.log(`\nGenerated SOQL:`);
      console.log(soql);

      const result = await query(soql, false);
      console.log(`\n✅ Result: ${result.totalSize} records found`);
      
      if (result.totalSize > 0 && result.records[0]) {
        console.log(`Sample:`, result.records[0]);
      }

    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
    }
  }

  process.exit(0);
}

debugQueries();

