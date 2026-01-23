#!/usr/bin/env node

/**
 * Test sync of a single meeting to Eudia Testing Account
 */

const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');
const salesforce = require('./lib/salesforce');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// Load parent .env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

async function main() {
  console.log('\n===========================================');
  console.log('  TEST SYNC TO EUDIA TESTING ACCOUNT');
  console.log('===========================================\n');
  
  loadEnv();
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  
  // Connect to Salesforce
  console.log('1. Connecting to Salesforce...');
  await salesforce.connect({
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD,
    securityToken: process.env.SF_SECURITY_TOKEN || '',
    instanceUrl: process.env.SF_INSTANCE_URL
  });
  console.log('   Connected!\n');
  
  // Find Eudia Testing Account
  console.log('2. Finding "Eudia Testing Account"...');
  const testAccount = await salesforce.findAccount('Eudia Testing Account');
  
  if (!testAccount) {
    console.log('   ERROR: Account not found!');
    console.log('   Searching for similar accounts...');
    
    const conn = salesforce.getConnection();
    const result = await conn.query(`
      SELECT Id, Name FROM Account 
      WHERE Name LIKE '%Eudia%' OR Name LIKE '%Testing%' OR Name LIKE '%Test%'
      LIMIT 10
    `);
    
    console.log('   Found accounts:');
    result.records.forEach(a => console.log('     - ' + a.Name + ' (' + a.Id + ')'));
    return;
  }
  
  console.log('   Found: ' + testAccount.Name);
  console.log('   ID: ' + testAccount.Id + '\n');
  
  // Get recent Hyprnote sessions
  console.log('3. Getting Hyprnote sessions...');
  const sessions = await hyprnote.getSessions(168, new Set());
  
  console.log('   Found ' + sessions.length + ' sessions:');
  sessions.forEach((s, i) => {
    console.log('   [' + i + '] ' + (s.title || 'Untitled').substring(0, 50));
  });
  
  // Pick the "Udia Testing Account" session if it exists, or the first one
  let targetSession = sessions.find(s => 
    s.title && s.title.toLowerCase().includes('testing')
  ) || sessions[0];
  
  if (!targetSession) {
    console.log('\n   No sessions to sync!');
    return;
  }
  
  console.log('\n4. Syncing session: "' + targetSession.title + '"');
  
  // Get participants
  const participants = await hyprnote.getSessionParticipants(targetSession.id);
  console.log('   Participants: ' + participants.length);
  participants.forEach(p => {
    console.log('     - ' + p.full_name + (p.email ? ' <' + p.email + '>' : '') + (p.is_user ? ' (you)' : ''));
  });
  
  // Prepare meeting notes
  const notesText = hyprnote.htmlToText(targetSession.enhanced_memo_html || targetSession.raw_memo_html);
  const duration = hyprnote.getDuration(targetSession.record_start, targetSession.record_end);
  
  console.log('\n   Duration: ' + duration);
  console.log('   Notes preview: ' + notesText.substring(0, 200) + '...\n');
  
  const description = [
    '=== MEETING NOTES (Test Sync) ===',
    'Date: ' + new Date(targetSession.record_start).toLocaleString(),
    'Duration: ' + duration,
    'Participants: ' + participants.map(p => p.full_name).join(', '),
    '',
    notesText
  ].join('\n');
  
  // Create Event in Salesforce
  console.log('5. Creating Event in Salesforce...');
  
  try {
    const eventResult = await salesforce.createEvent({
      subject: 'Test Sync: ' + (targetSession.title || 'Meeting'),
      description: description.substring(0, 32000),
      startTime: targetSession.record_start,
      endTime: targetSession.record_end,
      accountId: testAccount.Id,
      ownerId: config.rep.salesforceUserId
    });
    
    if (eventResult.success) {
      console.log('   SUCCESS! Event ID: ' + eventResult.id);
    } else {
      console.log('   FAILED: ' + JSON.stringify(eventResult.errors));
    }
  } catch (err) {
    console.log('   ERROR creating Event: ' + err.message);
    console.log('   Trying Task as fallback...');
    
    try {
      const taskResult = await salesforce.createTask({
        subject: 'Test Sync: ' + (targetSession.title || 'Meeting'),
        description: description,
        activityDate: targetSession.record_start?.split('T')[0] || new Date().toISOString().split('T')[0],
        accountId: testAccount.Id,
        ownerId: config.rep.salesforceUserId
      });
      
      if (taskResult.success) {
        console.log('   SUCCESS! Task ID: ' + taskResult.id);
      } else {
        console.log('   FAILED: ' + JSON.stringify(taskResult.errors));
      }
    } catch (taskErr) {
      console.log('   Task also failed: ' + taskErr.message);
    }
  }
  
  // Update Customer Brain
  console.log('\n6. Updating Customer Brain field...');
  
  try {
    const brainEntry = [
      '--- Test Meeting Sync: ' + new Date().toLocaleString() + ' ---',
      'Rep: ' + config.rep.name,
      'Duration: ' + duration,
      '',
      notesText.substring(0, 3000)
    ].join('\n');
    
    await salesforce.updateCustomerBrain(testAccount.Id, brainEntry);
    console.log('   SUCCESS! Customer Brain updated.\n');
  } catch (err) {
    console.log('   ERROR: ' + err.message + '\n');
  }
  
  console.log('===========================================');
  console.log('  TEST SYNC COMPLETE');
  console.log('===========================================');
  console.log('\nCheck Salesforce:');
  console.log('  Account: Eudia Testing Account');
  console.log('  Look for: New Event or Task');
  console.log('  Check: Customer_Brain__c field\n');
}

main().catch(err => {
  console.log('FATAL ERROR: ' + err.message);
  console.error(err);
  process.exit(1);
});

