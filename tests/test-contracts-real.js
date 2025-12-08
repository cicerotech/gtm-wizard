#!/usr/bin/env node
require('dotenv').config();

async function testContracts() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  console.log('Testing Contract queries for Cargill, Coherent, Duracell...\n');

  // Test 1: All contracts
  const allQuery = `SELECT Id, ContractNumber, Account.Name, StartDate, EndDate, Status
                    FROM Contract
                    ORDER BY StartDate DESC
                    LIMIT 20`;
  
  console.log('All Contracts:');
  const allResult = await query(allQuery, false);
  console.log(`Found ${allResult.totalSize} total contracts\n`);
  
  const accountSet = new Set();
  allResult.records.forEach(r => {
    accountSet.add(r.Account?.Name);
    console.log(`  - ${r.Account?.Name}: ${r.ContractNumber} (${r.Status})`);
  });
  
  console.log('\n\nAccounts with contracts:', Array.from(accountSet).join(', '));

  // Test 2: Cargill specific
  console.log('\n\nCargill Contracts:');
  const cargillQuery = `SELECT Id, ContractNumber, Account.Name, StartDate, EndDate, Status, ContractTerm
                        FROM Contract
                        WHERE Account.Name LIKE '%Cargill%'`;
  
  const cargillResult = await query(cargillQuery, false);
  console.log(`Found ${cargillResult.totalSize} contracts for Cargill`);
  cargillResult.records.forEach(r => {
    console.log(`  ${r.ContractNumber}: ${r.StartDate} to ${r.EndDate}`);
  });

  // Test 3: Coherent
  console.log('\n\nCoherent Contracts:');
  const coherentQuery = `SELECT Id, ContractNumber, Account.Name, StartDate
                         FROM Contract
                         WHERE Account.Name LIKE '%Coherent%'`;
  
  const coherentResult = await query(coherentQuery, false);
  console.log(`Found ${coherentResult.totalSize} contracts for Coherent`);

  process.exit(0);
}

testContracts();
