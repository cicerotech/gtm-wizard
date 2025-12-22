#!/usr/bin/env node

/**
 * Quick test to verify Salesforce authentication with new security token
 */

const jsforce = require('jsforce');

// Direct credentials - testing the new security token
const SF_USERNAME = process.env.SF_USERNAME;
const SF_PASSWORD = process.env.SF_PASSWORD;
const SF_SECURITY_TOKEN = 'pr2hOgsvl1R9khNlVGtHrOmrg';  // NEW TOKEN
const SF_INSTANCE_URL = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';

async function testSalesforceAuth() {
  console.log('🔐 Testing Salesforce Authentication with NEW security token...\n');
  
  // Show what we're using (masked)
  console.log('Configuration:');
  console.log(`  Instance URL: ${SF_INSTANCE_URL}`);
  console.log(`  Username: ${SF_USERNAME || 'NOT SET - need SF_USERNAME env var'}`);
  console.log(`  Password: ${SF_PASSWORD ? SF_PASSWORD.length + ' chars' : 'NOT SET - need SF_PASSWORD env var'}`);
  console.log(`  Security Token: ${SF_SECURITY_TOKEN.substring(0, 5)}...${SF_SECURITY_TOKEN.substring(SF_SECURITY_TOKEN.length - 5)}`);
  console.log('');
  
  if (!SF_USERNAME || !SF_PASSWORD) {
    console.log('❌ Missing SF_USERNAME or SF_PASSWORD environment variables');
    console.log('');
    console.log('Run with:');
    console.log('  SF_USERNAME="your-username" SF_PASSWORD="your-password" node test-sf-auth.js');
    process.exit(1);
  }

  try {
    const conn = new jsforce.Connection({
      instanceUrl: SF_INSTANCE_URL,
      version: '58.0'
    });

    console.log('📡 Attempting login...');
    const loginResult = await conn.login(
      SF_USERNAME,
      SF_PASSWORD + SF_SECURITY_TOKEN
    );

    console.log('✅ LOGIN SUCCESSFUL!');
    console.log(`  User ID: ${loginResult.id}`);
    console.log(`  Org ID: ${loginResult.organizationId}`);
    console.log(`  Instance URL: ${conn.instanceUrl}`);
    console.log('');

    // Test a simple query
    console.log('📊 Testing query (fetching Cargill account)...');
    const result = await conn.query(`
      SELECT Id, Name, Owner.Name 
      FROM Account 
      WHERE Name LIKE '%Cargill%' 
      LIMIT 5
    `);

    if (result.totalSize > 0) {
      console.log(`✅ Query successful! Found ${result.totalSize} Cargill account(s):`);
      result.records.forEach(acc => {
        console.log(`  - ${acc.Name} (Owner: ${acc.Owner?.Name || 'N/A'})`);
      });
    } else {
      console.log('⚠️  Query worked but no Cargill accounts found');
    }

    console.log('\n🎉 All tests passed! The security token is CORRECT.');
    console.log('\n⚠️  If Render is still failing, the issue is with how the token is stored in Render.');

  } catch (error) {
    console.log('❌ LOGIN FAILED:', error.message);
    console.log('');
    
    if (error.message.includes('INVALID_LOGIN')) {
      console.log('Possible causes:');
      console.log('  1. Security token is incorrect');
      console.log('  2. Password is incorrect');
      console.log('  3. Username is incorrect');
      console.log('  4. User account is locked');
      console.log('');
      console.log('Try resetting your security token again in Salesforce:');
      console.log('  Setup → My Personal Information → Reset My Security Token');
    }
    
    process.exit(1);
  }
}

testSalesforceAuth();

