#!/usr/bin/env node
/**
 * Delete a specific Closed Won Alert message that was posted in error
 * (Deal was briefly Closed Won, then changed to Closed Lost)
 * 
 * Run: node scripts/delete-specific-closed-won.js
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackToken = process.env.SLACK_BOT_TOKEN;
const client = new WebClient(slackToken);

// GTM Account Planning channel ID
const CHANNEL_ID = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || 'C097L4HK3PY';

// Message posted at approximately 5:16 AM Pacific on Jan 29, 2026
// Convert to Unix timestamp - look in a window around that time
// 5:16 AM Pacific = 13:16 UTC (PST is UTC-8)
// We'll search for messages containing "Electricity Supply Board" posted around that time

async function deleteSpecificMessage() {
  console.log('🔍 Searching for the erroneous Closed Won alert...');
  console.log(`   Channel: ${CHANNEL_ID}`);
  console.log(`   Looking for: Electricity Supply Board deal alert\n`);
  
  try {
    // Look back 24 hours to find the message
    const oneDayAgo = (Date.now() / 1000) - (24 * 60 * 60);
    
    // Fetch recent messages
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: oneDayAgo.toString(),
      limit: 200
    });
    
    if (!result.messages || result.messages.length === 0) {
      console.log('No messages found in the time range.');
      return;
    }
    
    console.log(`📬 Found ${result.messages.length} messages in the last 24 hours\n`);
    
    // Find the specific message about Electricity Supply Board
    const targetMessages = result.messages.filter(msg => {
      const text = msg.text || '';
      // Match the Closed Won alert for Electricity Supply Board
      return text.includes('A Deal has been Won') && 
             text.includes('Electricity Supply Board');
    });
    
    if (targetMessages.length === 0) {
      console.log('❌ Could not find the Electricity Supply Board Closed Won alert.');
      console.log('   The message may have already been deleted or is older than 24 hours.');
      
      // Show all Closed Won alerts for reference
      const allAlerts = result.messages.filter(msg => 
        (msg.text || '').includes('A Deal has been Won')
      );
      if (allAlerts.length > 0) {
        console.log('\n   Found these Closed Won alerts instead:');
        allAlerts.forEach((msg, i) => {
          const ts = new Date(parseFloat(msg.ts) * 1000);
          const preview = (msg.text || '').substring(0, 100).replace(/\n/g, ' ');
          console.log(`   ${i + 1}. [${ts.toLocaleTimeString()}] ${preview}...`);
        });
      }
      return;
    }
    
    console.log(`🎯 Found ${targetMessages.length} matching message(s):\n`);
    
    // Show the messages we found
    targetMessages.forEach((msg, i) => {
      const ts = new Date(parseFloat(msg.ts) * 1000);
      console.log(`--- Message ${i + 1} ---`);
      console.log(`Time: ${ts.toLocaleString()}`);
      console.log(`Timestamp (for Slack): ${msg.ts}`);
      console.log(`Preview: ${(msg.text || '').substring(0, 200).replace(/\n/g, ' ')}...`);
      console.log('');
    });
    
    // Delete the message(s)
    console.log('🗑️  Deleting message(s)...\n');
    
    for (const msg of targetMessages) {
      try {
        await client.chat.delete({
          channel: CHANNEL_ID,
          ts: msg.ts
        });
        const ts = new Date(parseFloat(msg.ts) * 1000);
        console.log(`   ✅ Deleted message from ${ts.toLocaleString()}`);
      } catch (error) {
        console.log(`   ⚠️  Failed to delete: ${error.message}`);
        if (error.data?.error === 'message_not_found') {
          console.log('      (Message may have already been deleted)');
        } else if (error.data?.error === 'cant_delete_message') {
          console.log('      (Bot may not have permission to delete this message)');
        }
      }
    }
    
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.data) {
      console.error('Details:', error.data);
    }
  }
}

// Run it
deleteSpecificMessage();


