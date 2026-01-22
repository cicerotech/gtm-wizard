#!/usr/bin/env node
/**
 * Obsidian → Salesforce Sync
 * 
 * Reads meeting notes from Obsidian vault, matches to Salesforce accounts,
 * and updates Customer_Brain__c field.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jsforce = require('jsforce');
const vaultReader = require('./lib/vault-reader');

// Config file location
const CONFIG_FILE = path.join(__dirname, 'config.json');

/**
 * Load configuration
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ Config not found. Run: npm run setup');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

/**
 * Connect to Salesforce
 */
async function connectToSalesforce() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_INSTANCE_URL || 'https://login.salesforce.com'
  });
  
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  
  console.log('✓ Connected to Salesforce');
  return conn;
}

/**
 * Find Salesforce account by name
 */
async function findAccount(conn, accountName) {
  if (!accountName) return null;
  
  // Normalize account name for search
  const searchName = accountName.replace(/['"]/g, '');
  
  // Try exact match first
  let result = await conn.query(`
    SELECT Id, Name, Customer_Brain__c 
    FROM Account 
    WHERE Name = '${searchName}'
    LIMIT 1
  `);
  
  if (result.records.length > 0) {
    return result.records[0];
  }
  
  // Try LIKE match
  result = await conn.query(`
    SELECT Id, Name, Customer_Brain__c 
    FROM Account 
    WHERE Name LIKE '%${searchName}%'
    LIMIT 1
  `);
  
  return result.records[0] || null;
}

/**
 * Update Customer Brain field
 */
async function updateCustomerBrain(conn, accountId, existingBrain, newEntry) {
  // Format the new entry
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  
  const formattedEntry = `--- Meeting: ${newEntry.date || timestamp} ---
Rep: ${newEntry.rep || 'Unknown'}
Duration: ${newEntry.duration || 'Unknown'}
Participants: ${newEntry.attendees?.join(', ') || 'Not specified'}

${newEntry.summary}

`;

  // Prepend to existing content
  const updatedBrain = formattedEntry + (existingBrain || '');
  
  // Truncate if too long (Salesforce text area limit)
  const maxLength = 131072; // 128KB
  const finalContent = updatedBrain.length > maxLength 
    ? updatedBrain.substring(0, maxLength - 100) + '\n\n[Truncated - see Obsidian for full history]'
    : updatedBrain;
  
  await conn.sobject('Account').update({
    Id: accountId,
    Customer_Brain__c: finalContent
  });
  
  return true;
}

/**
 * Main sync function
 */
async function sync() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         OBSIDIAN → SALESFORCE SYNC                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Load config
  const config = loadConfig();
  console.log(`📁 Vault: ${config.vaultPath}`);
  console.log(`📂 Meetings folder: ${config.meetingsFolder || 'Meetings'}`);
  console.log('');
  
  // Verify vault exists
  if (!fs.existsSync(config.vaultPath)) {
    console.error('❌ Vault not found at:', config.vaultPath);
    process.exit(1);
  }
  
  // Connect to Salesforce
  const conn = await connectToSalesforce();
  
  // Scan for meeting notes
  console.log('\n📋 Scanning for meeting notes...');
  const files = vaultReader.scanVault(config.vaultPath, {
    folder: config.meetingsFolder || 'Meetings',
    maxAge: config.syncDays || 30,
    recursive: true
  });
  
  console.log(`   Found ${files.length} notes in last ${config.syncDays || 30} days`);
  
  // Process each note
  let synced = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const file of files) {
    const note = vaultReader.parseNote(file.path);
    if (!note) {
      errors++;
      continue;
    }
    
    const meetingInfo = vaultReader.extractMeetingInfo(note);
    
    // Skip if already synced
    if (meetingInfo.syncedToSf) {
      console.log(`   ⏭️  ${file.name} (already synced)`);
      skipped++;
      continue;
    }
    
    // Skip if no account identified
    if (!meetingInfo.account) {
      console.log(`   ⚠️  ${file.name} (no account identified)`);
      skipped++;
      continue;
    }
    
    // Find Salesforce account
    const sfAccount = await findAccount(conn, meetingInfo.account);
    if (!sfAccount) {
      console.log(`   ⚠️  ${file.name} (account not found in SF: ${meetingInfo.account})`);
      skipped++;
      continue;
    }
    
    // Generate summary and update
    const summary = vaultReader.generateSummary(meetingInfo);
    
    try {
      await updateCustomerBrain(conn, sfAccount.Id, sfAccount.Customer_Brain__c, {
        date: meetingInfo.date,
        rep: config.repName,
        attendees: meetingInfo.attendees,
        summary
      });
      
      // Mark as synced in Obsidian
      vaultReader.markAsSynced(file.path);
      
      console.log(`   ✅ ${file.name} → ${sfAccount.Name}`);
      synced++;
    } catch (err) {
      console.error(`   ❌ ${file.name}: ${err.message}`);
      errors++;
    }
  }
  
  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Synced: ${synced} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n');
}

// Run
sync().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

