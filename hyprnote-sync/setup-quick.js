#!/usr/bin/env node

/**
 * Quick Setup - Streamlined for Eudia Team
 * 
 * Auto-detects user from Hyprnote profile, looks up their SF User ID,
 * and configures everything with minimal input.
 * 
 * Run with: npm run setup
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');
const teamRegistry = require('./lib/team-registry');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const SYNCED_FILE = path.join(__dirname, 'data', 'synced-sessions.json');

async function question(rl, prompt) {
  return new Promise(resolve => {
    rl.question(prompt + ' ', resolve);
  });
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         HYPRNOTE → SALESFORCE SYNC SETUP                  ║');
  console.log('║                   Quick Setup for Eudia Team              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // Step 1: Check Hyprnote
    console.log('[1/3] Checking Hyprnote...');
    
    const hyprnoteStatus = await hyprnote.testConnection();
    
    if (!hyprnoteStatus.success) {
      console.log('\n❌ Hyprnote not found!');
      console.log('   Please install Hyprnote from https://hyprnote.com/');
      console.log('   Then record at least one test meeting.\n');
      rl.close();
      process.exit(1);
    }
    
    console.log('   ✓ Hyprnote connected (' + hyprnoteStatus.sessionCount + ' sessions)\n');
    
    // Step 2: Auto-detect user from Hyprnote
    console.log('[2/3] Detecting your profile...');
    
    const hyprnoteUser = await hyprnote.getCurrentUser();
    let detectedMember = null;
    
    if (hyprnoteUser?.email) {
      detectedMember = teamRegistry.findByEmail(hyprnoteUser.email);
    }
    if (!detectedMember && hyprnoteUser?.full_name) {
      detectedMember = teamRegistry.findByName(hyprnoteUser.full_name);
    }
    
    let finalMember = null;
    
    if (detectedMember) {
      console.log('   ✓ Detected: ' + detectedMember.name + ' (' + detectedMember.role + ')');
      console.log('   Salesforce ID: ' + detectedMember.salesforceUserId);
      
      const confirm = await question(rl, '\n   Is this correct? (Y/n):');
      
      if (confirm.toLowerCase() !== 'n') {
        finalMember = detectedMember;
      }
    } else {
      console.log('   ⚠ Could not auto-detect your profile');
    }
    
    // Manual selection if auto-detect failed
    if (!finalMember) {
      console.log('\n   Select your name from the team list:\n');
      
      const allMembers = teamRegistry.getAllMembers();
      allMembers.forEach((member, index) => {
        console.log('   [' + (index + 1) + '] ' + member.name + ' (' + member.role + ')');
      });
      console.log('   [0] I\'m not on this list (internal use only)');
      
      const selection = await question(rl, '\n   Enter number (0-' + allMembers.length + '):');
      const selectedIndex = parseInt(selection);
      
      if (selectedIndex === 0) {
        // Internal use only - no Salesforce sync
        console.log('\n   Setting up for internal use (notes will NOT sync to Salesforce)');
        const name = await question(rl, '   Your name:');
        
        finalMember = {
          name: name || 'Team Member',
          email: '',
          salesforceUserId: null,
          role: 'Internal',
          team: 'Internal',
          syncEnabled: false
        };
      } else if (selectedIndex > 0 && selectedIndex <= allMembers.length) {
        finalMember = allMembers[selectedIndex - 1];
      } else {
        console.log('\n   Invalid selection. Setting up for internal use.');
        finalMember = {
          name: 'Team Member',
          email: '',
          salesforceUserId: null,
          role: 'Internal',
          team: 'Internal',
          syncEnabled: false
        };
      }
    }
    
    if (!finalMember) {
      console.log('\n❌ Setup cancelled.\n');
      rl.close();
      process.exit(1);
    }
    
    // Step 3: Save configuration
    console.log('\n[3/3] Saving configuration...');
    
    // Determine if sync is enabled (only for known team members with SF User ID)
    const syncEnabled = finalMember.syncEnabled !== false && !!finalMember.salesforceUserId;
    
    const config = {
      rep: {
        name: finalMember.name,
        email: finalMember.email || '',
        salesforceUserId: finalMember.salesforceUserId || null,
        role: finalMember.role,
        team: finalMember.team
      },
      salesforce: {
        useEnvFile: true,
        syncEnabled: syncEnabled
      },
      hyprnote: {
        path: hyprnoteStatus.path,
        version: hyprnoteStatus.version
      },
      settings: {
        lookbackHours: 168,
        updateCustomerBrain: syncEnabled,
        createContacts: syncEnabled,
        syncOwnedAccountsFirst: syncEnabled
      },
      setupDate: new Date().toISOString()
    };
    
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    // Initialize synced sessions file
    if (!fs.existsSync(SYNCED_FILE)) {
      fs.writeFileSync(SYNCED_FILE, JSON.stringify({ sessions: [] }, null, 2));
    }
    
    console.log('   ✓ Configuration saved!\n');
    
    // Success message
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                   SETUP COMPLETE!                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('\n');
    console.log('   Welcome, ' + finalMember.name + '!');
    console.log('\n');
    
    if (syncEnabled) {
      console.log('   ┌─────────────────────────────────────────────────────┐');
      console.log('   │  HOW TO USE                                         │');
      console.log('   ├─────────────────────────────────────────────────────┤');
      console.log('   │                                                     │');
      console.log('   │  1. RECORD: Open hyprnote → New Note → Record      │');
      console.log('   │                                                     │');
      console.log('   │  2. SYNC:   Double-click sync-meetings.command     │');
      console.log('   │                                                     │');
      console.log('   └─────────────────────────────────────────────────────┘');
      console.log('\n');
      console.log('   Your meeting notes will sync to Salesforce:');
      console.log('   • Events created on matched Accounts');
      console.log('   • Customer Brain updated with insights');
      console.log('   • All activity attributed to you\n');
    } else {
      console.log('   ┌─────────────────────────────────────────────────────┐');
      console.log('   │  INTERNAL USE MODE                                  │');
      console.log('   ├─────────────────────────────────────────────────────┤');
      console.log('   │                                                     │');
      console.log('   │  Open hyprnote → New Note → Record                 │');
      console.log('   │                                                     │');
      console.log('   │  Your notes stay local on your computer.           │');
      console.log('   │  Nothing syncs to Salesforce.                      │');
      console.log('   │                                                     │');
      console.log('   └─────────────────────────────────────────────────────┘');
      console.log('\n');
    }
    
  } catch (error) {
    console.log('\n❌ Setup failed: ' + error.message);
    console.error(error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();

