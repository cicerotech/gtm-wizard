#!/usr/bin/env node

/**
 * Live Sync Test v2 - With Improved Formatting
 * Syncs a different meeting to show formatting improvements
 */

const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');
const salesforce = require('./lib/salesforce');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     LIVE SYNC TEST v2 - IMPROVED FORMATTING               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
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
  console.log('   ✓ Connected\n');
  
  // Find Eudia Testing Account
  console.log('2. Finding Eudia Testing Account...');
  const testAccount = await salesforce.findAccount('Eudia Testing Account');
  if (!testAccount) {
    console.log('   ✗ Account not found!');
    return;
  }
  console.log('   ✓ Found: ' + testAccount.Name + ' (ID: ' + testAccount.Id + ')\n');
  
  // Get a DIFFERENT session (Best Buy one for variety)
  console.log('3. Getting Hyprnote sessions...');
  const sessions = await hyprnote.getSessions(168, new Set());
  
  // Pick the Best Buy session for this test
  const session = sessions.find(s => 
    s.title && s.title.toLowerCase().includes('best buy')
  ) || sessions[1] || sessions[0];
  
  if (!session) {
    console.log('   ✗ No sessions found!');
    return;
  }
  
  console.log('   ✓ Selected: ' + session.title);
  console.log('   Date: ' + formatDate(session.record_start) + '\n');
  
  // Get participants
  const participants = await hyprnote.getSessionParticipants(session.id);
  console.log('4. Participants: ' + participants.length);
  participants.forEach(p => {
    const role = p.is_user ? ' (internal)' : ' (external)';
    console.log('   - ' + p.full_name + role);
  });
  
  // Process notes with IMPROVED formatting
  console.log('\n5. Processing notes (improved formatter)...');
  const notesText = hyprnote.htmlToText(session.enhanced_memo_html || session.raw_memo_html);
  const duration = hyprnote.getDuration(session.record_start, session.record_end);
  
  console.log('   Duration: ' + duration);
  console.log('   Notes length: ' + notesText.length + ' chars');
  console.log('\n   === FORMATTED NOTES PREVIEW ===');
  console.log('   ' + notesText.substring(0, 800).split('\n').join('\n   '));
  console.log('   ...\n');
  
  // Build clean description
  const description = [
    'MEETING NOTES',
    '═══════════════════════════════════════',
    '',
    'Date: ' + formatDate(session.record_start),
    'Duration: ' + duration,
    'Rep: ' + config.rep.name,
    'Participants: ' + participants.map(p => p.full_name).join(', '),
    '',
    '═══════════════════════════════════════',
    '',
    notesText
  ].join('\n');
  
  // Create Event
  console.log('6. Creating Event in Salesforce...');
  try {
    const eventResult = await salesforce.createEvent({
      subject: 'Sync Test v2: ' + (session.title || 'Meeting').substring(0, 200),
      description: description.substring(0, 32000),
      startTime: session.record_start,
      endTime: session.record_end,
      accountId: testAccount.Id,
      ownerId: config.rep.salesforceUserId
    });
    
    if (eventResult.success) {
      console.log('   ✓ Event created: ' + eventResult.id);
    } else {
      console.log('   ✗ Failed: ' + JSON.stringify(eventResult.errors));
      return;
    }
  } catch (err) {
    console.log('   ✗ Error: ' + err.message);
    return;
  }
  
  // Update Customer Brain with cleaner format
  console.log('\n7. Updating Customer Brain...');
  try {
    const brainEntry = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'MEETING: ' + formatDate(session.record_start),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Rep: ' + config.rep.name,
      'Duration: ' + duration,
      'Attendees: ' + participants.filter(p => !p.is_user).map(p => p.full_name).join(', ') || 'Internal only',
      '',
      'SUMMARY:',
      notesText.substring(0, 4000),
      ''
    ].join('\n');
    
    await salesforce.updateCustomerBrain(testAccount.Id, brainEntry);
    console.log('   ✓ Customer Brain updated');
  } catch (err) {
    console.log('   ✗ Error: ' + err.message);
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    SYNC COMPLETE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\nCheck Salesforce → Eudia Testing Account:');
  console.log('  • New Event with cleaner formatting');
  console.log('  • Customer Brain with structured notes\n');
}

main().catch(err => {
  console.log('\nFATAL: ' + err.message);
  process.exit(1);
});

