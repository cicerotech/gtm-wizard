#!/usr/bin/env node
require('dotenv').config();

async function testFields() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Test with minimal fields first
  console.log('Test 1: Minimal fields...');
  const minimal = `SELECT Id, ContractNumber, Account.Name 
                   FROM Contract 
                   WHERE Account.Name LIKE '%Duracell%'`;
  
  try {
    const r1 = await query(minimal, false);
    console.log(`✅ Minimal works: ${r1.totalSize} contracts`);
  } catch (e) {
    console.log(`❌ Minimal failed: ${e.message}`);
  }

  // Test adding fields one by one
  console.log('\nTest 2: Add StartDate...');
  try {
    const r2 = await query(minimal.replace('Account.Name', 'Account.Name, StartDate'), false);
    console.log(`✅ StartDate works`);
  } catch (e) {
    console.log(`❌ StartDate failed: ${e.message}`);
  }

  console.log('\nTest 3: Add EndDate...');
  try {
    const r3 = await query(minimal.replace('Account.Name', 'Account.Name, StartDate, EndDate'), false);
    console.log(`✅ EndDate works`);
  } catch (e) {
    console.log(`❌ EndDate failed: ${e.message}`);
  }

  console.log('\nTest 4: Add ContractTerm...');
  try {
    const r4 = await query(minimal.replace('Account.Name', 'Account.Name, StartDate, ContractTerm'), false);
    console.log(`✅ ContractTerm works`);
  } catch (e) {
    console.log(`❌ ContractTerm failed: ${e.message}`);
  }

  console.log('\nTest 5: Add OwnerExpiration...');
  try {
    const r5 = await query(minimal.replace('Account.Name', 'Account.Name, OwnerExpiration'), false);
    console.log(`✅ OwnerExpiration works`);
  } catch (e) {
    console.log(`❌ OwnerExpiration failed: ${e.message}`);
  }

  console.log('\nTest 6: Add Contract_Name_Campfire__c...');
  try {
    const r6 = await query(minimal.replace('Account.Name', 'Account.Name, Contract_Name_Campfire__c'), false);
    console.log(`✅ Contract_Name_Campfire__c works`);
  } catch (e) {
    console.log(`❌ Contract_Name_Campfire__c failed: ${e.message}`);
  }

  process.exit(0);
}

testFields();
