#!/usr/bin/env node

require('dotenv').config();

async function testStubHub() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  const soql = `SELECT Id, Name, Owner.Name, Owner.Email, Prior_Account_Owner_Name__c, Industry 
                FROM Account 
                WHERE Name LIKE '%StubHub%'
                LIMIT 5`;

  console.log('Querying StubHub...\n');
  console.log('SOQL:', soql);

  try {
    const result = await query(soql, false);
    console.log(`\n✅ Found ${result.totalSize} records\n`);
    
    result.records.forEach(record => {
      console.log('─'.repeat(70));
      console.log(`Account: ${record.Name}`);
      console.log(`Current Owner: ${record.Owner?.Name}`);
      console.log(`Prior Owner: ${record.Prior_Account_Owner_Name__c || 'NULL/EMPTY'}`);
      console.log(`Industry: ${record.Industry || 'None'}`);
    });
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  process.exit(0);
}

testStubHub();

