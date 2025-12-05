#!/usr/bin/env node

/**
 * Hyprnote to Salesforce Sync Setup Wizard
 * Run with: npm run setup
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const SYNCED_FILE = path.join(__dirname, 'data', 'synced-sessions.json');

function log(message) {
  console.log(message);
}

async function question(rl, prompt) {
  return new Promise(resolve => {
    rl.question(prompt + ' ', resolve);
  });
}

async function main() {
  console.log('\n========================================');
  console.log('  HYPRNOTE -> SALESFORCE SYNC SETUP');
  console.log('========================================\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // Step 1: Check Hyprnote
    console.log('[1/5] Checking Hyprnote installation...');
    
    const hyprnoteStatus = await hyprnote.testConnection();
    
    if (!hyprnoteStatus.success) {
      console.log('ERROR: Hyprnote database not found');
      console.log('Please install Hyprnote and record at least one meeting.');
      rl.close();
      process.exit(1);
    }
    
    console.log('  Found Hyprnote (' + hyprnoteStatus.version + ')');
    console.log('  Sessions: ' + hyprnoteStatus.sessionCount);
    
    const hyprnoteUser = await hyprnote.getCurrentUser();
    
    // Step 2: Rep identification
    console.log('\n[2/5] Setting up your profile...');
    
    const defaultName = hyprnoteUser?.full_name || '';
    const defaultEmail = hyprnoteUser?.email || '';
    
    let repName = await question(rl, 'Your name [' + defaultName + ']:');
    repName = repName.trim() || defaultName;
    
    let repEmail = await question(rl, 'Your email [' + defaultEmail + ']:');
    repEmail = repEmail.trim() || defaultEmail;
    
    if (!repName || !repEmail) {
      console.log('ERROR: Name and email are required');
      rl.close();
      process.exit(1);
    }
    
    // Step 3: Salesforce User ID
    console.log('\n[3/5] Linking to Salesforce user...');
    console.log('  Find your User ID: Setup > Users > Your User > ID in URL');
    console.log('  Example: 005Wj00000XXXXX');
    
    const sfUserId = await question(rl, 'Your Salesforce User ID:');
    
    if (!sfUserId || !sfUserId.startsWith('005')) {
      console.log('ERROR: Invalid User ID (should start with 005)');
      rl.close();
      process.exit(1);
    }
    
    // Step 4: Salesforce Credentials
    console.log('\n[4/5] Salesforce API credentials...');
    
    const envPath = path.join(__dirname, '..', '.env');
    let sfConfig = { useEnvFile: false };
    
    if (fs.existsSync(envPath)) {
      const useExisting = await question(rl, 'Found .env file. Use those credentials? (y/n):');
      if (useExisting.toLowerCase() === 'y') {
        sfConfig.useEnvFile = true;
      }
    }
    
    if (!sfConfig.useEnvFile) {
      console.log('  Enter SF credentials (or Enter to skip):');
      sfConfig.username = await question(rl, 'SF Username:');
      sfConfig.password = await question(rl, 'SF Password:');
      sfConfig.securityToken = await question(rl, 'SF Security Token:');
      sfConfig.instanceUrl = await question(rl, 'SF Instance URL:');
    }
    
    // Step 5: Save configuration
    console.log('\n[5/5] Saving configuration...');
    
    const config = {
      rep: {
        name: repName,
        email: repEmail,
        salesforceUserId: sfUserId
      },
      salesforce: sfConfig,
      hyprnote: {
        path: hyprnoteStatus.path,
        version: hyprnoteStatus.version
      },
      settings: {
        lookbackHours: 168,
        updateCustomerBrain: true,
        createContacts: true
      },
      setupDate: new Date().toISOString()
    };
    
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    if (!fs.existsSync(SYNCED_FILE)) {
      fs.writeFileSync(SYNCED_FILE, JSON.stringify({ sessions: [] }, null, 2));
    }
    
    console.log('\n========================================');
    console.log('           SETUP COMPLETE');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('  1. Record a meeting in Hyprnote');
    console.log('  2. Run: npm run sync');
    console.log('  3. Check Salesforce for the Event\n');
    
  } catch (error) {
    console.log('ERROR: ' + error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();

