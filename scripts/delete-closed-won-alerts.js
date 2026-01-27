#!/usr/bin/env node
/**
 * Delete Closed Won Alert messages from GTM Account Planning channel
 * 
 * Run: node scripts/delete-closed-won-alerts.js
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackToken = process.env.SLACK_BOT_TOKEN;
const client = new WebClient(slackToken);

// GTM Account Planning channel ID - try multiple known IDs
const CHANNEL_ID = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || 'C097L4HK3PY';

// How far back to look (in seconds)
const LOOKBACK_SECONDS = 600; // 10 minutes to be safe

async function deleteClosedWonAlerts() {
  console.log('🔍 Fetching recent messages from GTM Account Planning...');
  console.log(`   Channel: ${CHANNEL_ID}`);
  console.log(`   Looking back: ${LOOKBACK_SECONDS} seconds`);
  
  try {
    // Calculate oldest timestamp (10 minutes ago)
    const oldest = (Date.now() / 1000) - LOOKBACK_SECONDS;
    
    // Fetch recent messages
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: oldest.toString(),
      limit: 1000 // Max allowed
    });
    
    if (!result.messages || result.messages.length === 0) {
      console.log('No messages found in the time range.');
      return;
    }
    
    console.log(`\n📬 Found ${result.messages.length} messages in the last ${LOOKBACK_SECONDS/60} minutes`);
    
    // Filter for "A Deal has been Won!" messages (the bulk import spam)
    const alertMessages = result.messages.filter(msg => {
      const text = msg.text || '';
      // Match the specific pattern from the bulk import
      return text.includes('A Deal has been Won!') || 
             text.includes('*A Deal has been Won!*');
    });
    
    console.log(`\n🎯 Found ${alertMessages.length} Closed Won Alert messages to delete`);
    
    if (alertMessages.length === 0) {
      console.log('No Closed Won Alert messages found.');
      return;
    }
    
    // Show what we're about to delete
    console.log('\n--- Messages to delete ---');
    alertMessages.forEach((msg, i) => {
      const preview = (msg.text || '').substring(0, 100).replace(/\n/g, ' ');
      const ts = new Date(parseFloat(msg.ts) * 1000).toLocaleTimeString();
      console.log(`${i + 1}. [${ts}] ${preview}...`);
    });
    
    // Delete each message
    console.log('\n🗑️  Deleting messages...');
    let deleted = 0;
    let failed = 0;
    
    for (const msg of alertMessages) {
      try {
        await client.chat.delete({
          channel: CHANNEL_ID,
          ts: msg.ts
        });
        deleted++;
        process.stdout.write(`\r   Deleted: ${deleted}/${alertMessages.length}`);
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (error) {
        failed++;
        console.log(`\n   ⚠️  Failed to delete message ${msg.ts}: ${error.message}`);
      }
    }
    
    console.log(`\n\n✅ Done! Deleted ${deleted} messages, ${failed} failed.`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.data) {
      console.error('Details:', error.data);
    }
  }
}

// Run it
deleteClosedWonAlerts();

