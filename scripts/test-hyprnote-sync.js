#!/usr/bin/env node
/**
 * Local Test Script for Hyprnote → Salesforce Sync
 * 
 * Run with: node scripts/test-hyprnote-sync.js
 * 
 * Tests:
 * 1. Hyprnote database connection
 * 2. Read recent sessions
 * 3. Salesforce connection
 * 4. Full sync (optional, with --sync flag)
 */

require('dotenv').config();

const {
  testConnection,
  getRecentSessions,
  getSessionParticipants,
  checkForNewMeetings,
  syncSessionToSalesforce,
  HYPRNOTE_DB_PATH
} = require('../src/services/hyprnoteSyncService');

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  HYPRNOTE → SALESFORCE SYNC TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: Hyprnote Database Connection
  // ═══════════════════════════════════════════════════════════════════════
  console.log('📂 TEST 1: Hyprnote Database Connection');
  console.log(`   Path: ${HYPRNOTE_DB_PATH}`);
  
  const dbTest = await testConnection();
  
  if (dbTest.success) {
    console.log(`   ✅ Connected! Found ${dbTest.sessionCount} sessions\n`);
  } else {
    console.log(`   ❌ Failed: ${dbTest.error}`);
    console.log('   Make sure Hyprnote is installed and has recorded meetings.\n');
    return;
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: Read Recent Sessions
  // ═══════════════════════════════════════════════════════════════════════
  console.log('📋 TEST 2: Recent Sessions (last 7 days)');
  
  try {
    const sessions = await getRecentSessions(168); // 7 days
    console.log(`   Found ${sessions.length} session(s)\n`);
    
    if (sessions.length > 0) {
      console.log('   Recent meetings:');
      for (const session of sessions.slice(0, 5)) {
        const date = new Date(session.created_at).toLocaleString();
        console.log(`   • ${session.title}`);
        console.log(`     Date: ${date}`);
        
        // Get participants
        const participants = await getSessionParticipants(session.id);
        if (participants.length > 0) {
          console.log(`     Participants: ${participants.map(p => p.full_name).join(', ')}`);
        }
        console.log('');
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: Salesforce Connection
  // ═══════════════════════════════════════════════════════════════════════
  console.log('☁️  TEST 3: Salesforce Connection');
  
  let sfConn = null;
  
  try {
    const { initializeSalesforce, sfConnection } = require('../src/salesforce/connection');
    
    // Check for required env vars
    const requiredVars = ['SF_USERNAME', 'SF_PASSWORD', 'SF_SECURITY_TOKEN'];
    const hasInstanceUrl = process.env.SF_INSTANCE_URL || process.env.SF_LOGIN_URL;
    const missing = requiredVars.filter(v => !process.env[v]);
    if (!hasInstanceUrl) missing.push('SF_INSTANCE_URL');
    
    if (missing.length > 0) {
      console.log(`   ❌ Missing environment variables: ${missing.join(', ')}`);
      console.log('   Please ensure .env file has Salesforce credentials.\n');
    } else {
      await initializeSalesforce();
      sfConn = sfConnection.getConnection();
      
      // Test query
      const result = await sfConn.query('SELECT Id, Name FROM Account LIMIT 1');
      console.log(`   ✅ Connected to Salesforce!`);
      console.log(`   Sample account: ${result.records[0]?.Name || 'N/A'}\n`);
    }
  } catch (error) {
    console.log(`   ❌ Salesforce connection failed: ${error.message}\n`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: Check for Unsync'd Meetings
  // ═══════════════════════════════════════════════════════════════════════
  console.log('🔍 TEST 4: Unsync\'d Meetings');
  
  try {
    const newMeetings = await checkForNewMeetings();
    console.log(`   Found ${newMeetings.length} meeting(s) not yet synced to Salesforce\n`);
    
    if (newMeetings.length > 0) {
      console.log('   Ready to sync:');
      newMeetings.forEach(m => {
        console.log(`   • ${m.title}`);
      });
      console.log('');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: Full Sync (only if --sync flag provided)
  // ═══════════════════════════════════════════════════════════════════════
  if (process.argv.includes('--sync')) {
    console.log('🚀 TEST 5: Full Sync to Salesforce');
    console.log('   (Running because --sync flag was provided)\n');
    
    try {
      // Use existing connection or initialize
      if (!sfConn) {
        const { initializeSalesforce, sfConnection } = require('../src/salesforce/connection');
        await initializeSalesforce();
        sfConn = sfConnection.getConnection();
      }
      
      const newMeetings = await checkForNewMeetings();
      
      if (newMeetings.length === 0) {
        console.log('   No new meetings to sync.\n');
      } else {
        console.log(`   Syncing ${newMeetings.length} meeting(s)...\n`);
        
        for (const session of newMeetings) {
          console.log(`   Syncing: ${session.title}`);
          const result = await syncSessionToSalesforce(session, sfConn);
          
          if (result.success) {
            console.log(`   ✅ Synced!`);
            if (result.contacts?.length > 0) {
              const created = result.contacts.filter(c => c.created).length;
              console.log(`      Contacts: ${result.contacts.length} (${created} new)`);
            }
            if (result.account) {
              console.log(`      Account: ${result.account.name}`);
            }
            if (result.event) {
              console.log(`      Event: ${result.event.id}`);
            }
            if (result.customerBrainUpdated) {
              console.log(`      Customer Brain: Updated`);
            }
          } else {
            console.log(`   ❌ Failed: ${result.error}`);
          }
          console.log('');
        }
      }
    } catch (error) {
      console.log(`   ❌ Sync failed: ${error.message}\n`);
    }
  } else {
    console.log('💡 TIP: Run with --sync flag to actually sync to Salesforce:');
    console.log('   node scripts/test-hyprnote-sync.js --sync\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Run tests
runTests().catch(console.error);
