#!/usr/bin/env node

/**
 * Quick connection test for Hyprnote and Salesforce
 * Run with: node test-connection.js
 */

const hyprnote = require('./lib/hyprnote');
const salesforce = require('./lib/salesforce');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('\n=== HYPRNOTE CONNECTION TEST ===\n');
  
  // Test Hyprnote
  console.log('Testing Hyprnote...');
  const hResult = await hyprnote.testConnection();
  
  if (hResult.success) {
    console.log('  Status: CONNECTED');
    console.log('  Version: ' + hResult.version);
    console.log('  Path: ' + hResult.path);
    console.log('  Sessions: ' + hResult.sessionCount);
    
    // Show recent sessions
    const sessions = await hyprnote.getSessions(168, new Set());
    console.log('\n  Recent meetings:');
    for (const s of sessions.slice(0, 5)) {
      const date = new Date(s.created_at).toLocaleDateString();
      console.log('    - ' + (s.title || 'Untitled') + ' (' + date + ')');
    }
  } else {
    console.log('  Status: NOT FOUND');
    console.log('  Error: ' + hResult.error);
  }
  
  // Test Salesforce (if .env exists)
  console.log('\n=== SALESFORCE CONNECTION TEST ===\n');
  
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.log('  Status: NO CREDENTIALS');
    console.log('  (.env file not found in parent directory)');
    return;
  }
  
  // Load env
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  });
  
  console.log('Testing Salesforce...');
  console.log('  Instance: ' + process.env.SF_INSTANCE_URL);
  console.log('  Username: ' + process.env.SF_USERNAME);
  
  try {
    await salesforce.connect({
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN || '',
      instanceUrl: process.env.SF_INSTANCE_URL
    });
    
    const result = await salesforce.testConnection();
    console.log('  Status: CONNECTED');
    console.log('  Test query: ' + result.sampleAccount);
    
    // Test account search
    console.log('\n  Testing account search...');
    const testAccounts = ['DHL', 'Amazon', 'Chevron'];
    for (const name of testAccounts) {
      const account = await salesforce.findAccount(name);
      console.log('    ' + name + ': ' + (account ? account.Name : 'NOT FOUND'));
    }
  } catch (err) {
    console.log('  Status: FAILED');
    console.log('  Error: ' + err.message);
  }
  
  console.log('\n');
}

main().catch(err => {
  console.log('Error: ' + err.message);
  process.exit(1);
});

