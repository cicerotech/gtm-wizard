#!/usr/bin/env node
/**
 * Salesforce Authentication Diagnostic Script
 * 
 * This script tests the Salesforce connection and provides detailed
 * error information to help diagnose authentication issues.
 */

require('dotenv').config();
const jsforce = require('jsforce');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SALESFORCE AUTHENTICATION DIAGNOSTIC');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Step 1: Check environment variables
console.log('📋 STEP 1: Checking Environment Variables');
console.log('─────────────────────────────────────────────────────────────────');

const username = process.env.SF_USERNAME;
const password = process.env.SF_PASSWORD;
const securityToken = process.env.SF_SECURITY_TOKEN;
const instanceUrl = process.env.SF_INSTANCE_URL;

console.log(`  SF_USERNAME:       ${username ? username : '❌ MISSING'}`);
console.log(`  SF_PASSWORD:       ${password ? `Set (${password.length} chars)` : '❌ MISSING'}`);
console.log(`  SF_SECURITY_TOKEN: ${securityToken ? `Set (${securityToken.length} chars, starts with: ${securityToken.substring(0,4)}...)` : '❌ MISSING'}`);
console.log(`  SF_INSTANCE_URL:   ${instanceUrl || '❌ MISSING'}`);
console.log('');

if (!username || !password || !securityToken) {
  console.log('❌ Missing required environment variables. Cannot proceed.');
  process.exit(1);
}

// Step 2: Check if using SSO/Okta username vs direct SF username
console.log('📋 STEP 2: Username Analysis');
console.log('─────────────────────────────────────────────────────────────────');

if (username.includes('@')) {
  console.log(`  Email format: ✅ ${username}`);
  
  // Check if this might be a federated/SSO user
  if (username.includes('eudia.com')) {
    console.log('  ⚠️  NOTE: If your org uses Okta SSO, this username may not work');
    console.log('     for API access. You may need a dedicated API user or');
    console.log('     a Connected App with OAuth flow.');
  }
} else {
  console.log(`  ⚠️  Username doesn't look like an email: ${username}`);
}
console.log('');

// Step 3: Attempt login with detailed error capture
console.log('📋 STEP 3: Attempting Salesforce Login');
console.log('─────────────────────────────────────────────────────────────────');

async function testLogin() {
  const conn = new jsforce.Connection({
    loginUrl: instanceUrl || 'https://login.salesforce.com'
  });

  console.log(`  Login URL: ${conn.loginUrl}`);
  console.log(`  Attempting login as: ${username}`);
  console.log('');

  try {
    const userInfo = await conn.login(username, password + securityToken);
    
    console.log('  ✅ LOGIN SUCCESSFUL!');
    console.log('  ─────────────────────────────────────────────────────────────');
    console.log(`  User ID:      ${userInfo.id}`);
    console.log(`  Org ID:       ${userInfo.organizationId}`);
    console.log(`  Instance URL: ${conn.instanceUrl}`);
    console.log(`  Access Token: ${conn.accessToken ? 'Present (' + conn.accessToken.substring(0,20) + '...)' : 'Missing'}`);
    console.log('');

    // Test a simple query
    console.log('📋 STEP 4: Testing API Query');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const result = await conn.query('SELECT Id, Name FROM Account LIMIT 1');
    console.log(`  ✅ Query successful! Retrieved ${result.totalSize} record(s)`);
    if (result.records.length > 0) {
      console.log(`  Sample: ${result.records[0].Name}`);
    }

    // Check API limits
    console.log('');
    console.log('📋 STEP 5: Checking API Limits');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const limits = await conn.limits();
    console.log(`  Daily API Requests: ${limits.DailyApiRequests?.Remaining || 'N/A'} / ${limits.DailyApiRequests?.Max || 'N/A'}`);
    console.log(`  Daily Bulk API:     ${limits.DailyBulkApiBatches?.Remaining || 'N/A'} / ${limits.DailyBulkApiBatches?.Max || 'N/A'}`);
    
    // Check login history
    console.log('');
    console.log('📋 STEP 6: Recent Login Attempts');
    console.log('─────────────────────────────────────────────────────────────────');
    
    try {
      const loginHistory = await conn.query(`
        SELECT LoginTime, Status, SourceIp, LoginType, Application
        FROM LoginHistory 
        WHERE UserId = '${userInfo.id}'
        ORDER BY LoginTime DESC 
        LIMIT 10
      `);
      
      console.log('  Recent logins for this user:');
      loginHistory.records.forEach((record, i) => {
        const time = new Date(record.LoginTime).toLocaleString();
        const status = record.Status === 'Success' ? '✅' : '❌';
        console.log(`    ${i+1}. ${status} ${time} - ${record.Status} (${record.LoginType || 'API'})`);
      });
    } catch (histErr) {
      console.log('  Could not retrieve login history (may require additional permissions)');
    }

  } catch (error) {
    console.log('  ❌ LOGIN FAILED');
    console.log('  ─────────────────────────────────────────────────────────────');
    console.log(`  Error Name:    ${error.name}`);
    console.log(`  Error Code:    ${error.errorCode || 'N/A'}`);
    console.log(`  Error Message: ${error.message}`);
    console.log('');
    
    // Analyze the error
    console.log('📋 ERROR ANALYSIS');
    console.log('─────────────────────────────────────────────────────────────────');
    
    if (error.message.includes('INVALID_LOGIN')) {
      console.log('  🔍 INVALID_LOGIN error detected. Possible causes:');
      console.log('');
      console.log('  1. ❓ WRONG PASSWORD');
      console.log('     The SF_PASSWORD in .env might be incorrect.');
      console.log('     Note: This is your SALESFORCE password, not your Okta password.');
      console.log('');
      console.log('  2. ❓ SECURITY TOKEN EXPIRED/WRONG');
      console.log('     Go to SF → Setup → My Personal Information → Reset Security Token');
      console.log('     A new token will be emailed to you.');
      console.log('');
      console.log('  3. ❓ USER LOCKED OUT');
      console.log('     Check SF → Setup → Users → find your user → check if locked');
      console.log('');
      console.log('  4. ❓ IP RESTRICTIONS');
      console.log('     Your profile may have IP restrictions that block API access.');
      console.log('');
      console.log('  5. ❓ SSO-ONLY USER');
      console.log('     If your user is configured for SSO-only, direct API login won\'t work.');
      console.log('     You may need to enable "Is Single Sign-On Enabled" = false');
      console.log('     or create a dedicated API user.');
    } else if (error.message.includes('UNABLE_TO_LOCK_ROW')) {
      console.log('  🔍 Database lock error - transient issue, try again.');
    } else if (error.message.includes('API_DISABLED_FOR_ORG')) {
      console.log('  🔍 API access is disabled for this Salesforce org.');
    } else {
      console.log(`  🔍 Unrecognized error: ${error.message}`);
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

testLogin().then(() => process.exit(0)).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

