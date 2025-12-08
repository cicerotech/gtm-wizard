#!/usr/bin/env node
require('dotenv').config();

async function testAllContracts() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Test 1: Current query (with no limit)
  const noLimitQuery = `SELECT Id, ContractNumber, Account.Name
                        FROM Contract
                        WHERE Status = 'Activated'
                        ORDER BY StartDate DESC`;

  console.log('Query WITH no limit:');
  const result1 = await query(noLimitQuery, false);
  console.log(`✅ Found ${result1.totalSize} contracts`);
  console.log(`Records returned: ${result1.records.length}`);

  // Test 2: Check if there's a default limit
  console.log('\n\nFirst 10 accounts:');
  result1.records.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. ${r.Account.Name} - ${r.ContractNumber}`);
  });

  process.exit(0);
}

testAllContracts();
