#!/usr/bin/env node
/**
 * Fix/Delete a Slack message sent by GTM Brain
 * 
 * Usage:
 *   node scripts/fix-message.js delete    # Delete the message
 *   node scripts/fix-message.js update    # Update with corrected content
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = 'C097L4HK3PY'; // #gtm-account-planning

const client = new WebClient(SLACK_TOKEN);

async function findClosedWonMessage() {
  console.log('🔍 Searching for Closed Won messages in channel...');
  
  try {
    // Get recent messages from the channel
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      limit: 50 // Look at last 50 messages
    });
    
    // Find messages from our bot containing "Pluto (EC)" and "Deal has been Won"
    const targetMessages = result.messages.filter(msg => 
      msg.bot_id && // Sent by a bot
      msg.text && 
      msg.text.includes('A Deal has been Won') &&
      msg.text.includes('Pluto (EC)')
    );
    
    if (targetMessages.length === 0) {
      console.log('❌ No matching messages found');
      return null;
    }
    
    console.log(`✅ Found ${targetMessages.length} matching message(s)`);
    targetMessages.forEach((msg, i) => {
      const date = new Date(parseFloat(msg.ts) * 1000);
      console.log(`   ${i + 1}. ts: ${msg.ts} | time: ${date.toLocaleTimeString()}`);
      console.log(`      Preview: ${msg.text.substring(0, 100)}...`);
    });
    
    return targetMessages[0]; // Return most recent
  } catch (error) {
    console.error('Error fetching messages:', error.message);
    return null;
  }
}

async function deleteMessage(ts) {
  console.log(`🗑️  Deleting message ${ts}...`);
  
  try {
    await client.chat.delete({
      channel: CHANNEL_ID,
      ts: ts
    });
    console.log('✅ Message deleted successfully!');
    return true;
  } catch (error) {
    console.error('❌ Failed to delete:', error.message);
    return false;
  }
}

async function updateMessage(ts) {
  console.log(`✏️  Updating message ${ts}...`);
  
  // Corrected message with codename instead of real client
  const correctedMessage = `🎉 *A Deal has been Won!*

*Client:* Pluto (EC)
*ACV:* $40,000
*Type:* Recurring
*Product Line:* AI-Augmented Contracting_Managed Services
*Close Date:* January 13, 2026
*Deal Owner:* Julie Stefanich

_This client has a confidentiality agreement._`;

  try {
    await client.chat.update({
      channel: CHANNEL_ID,
      ts: ts,
      text: correctedMessage
    });
    console.log('✅ Message updated successfully!');
    return true;
  } catch (error) {
    console.error('❌ Failed to update:', error.message);
    return false;
  }
}

async function main() {
  const action = process.argv[2] || 'find';
  
  console.log('='.repeat(50));
  console.log('GTM Brain Message Fixer');
  console.log('='.repeat(50));
  
  // Find the message first
  const message = await findClosedWonMessage();
  
  if (!message) {
    console.log('\nNo message to fix. Exiting.');
    return;
  }
  
  if (action === 'delete') {
    await deleteMessage(message.ts);
  } else if (action === 'update') {
    await updateMessage(message.ts);
  } else {
    console.log('\nTo fix this message, run:');
    console.log('  node scripts/fix-message.js delete   # Remove entirely');
    console.log('  node scripts/fix-message.js update   # Replace with corrected version');
  }
}

main().catch(console.error);

