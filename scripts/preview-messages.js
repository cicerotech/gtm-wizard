#!/usr/bin/env node
/**
 * Preview recent messages to identify Closed Won Alert pattern
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackToken = process.env.SLACK_BOT_TOKEN;
const client = new WebClient(slackToken);

const CHANNEL_ID = 'C097L4HK3PY';
const LOOKBACK_SECONDS = 600;

async function previewMessages() {
  console.log('🔍 Previewing recent messages...\n');
  
  try {
    const oldest = (Date.now() / 1000) - LOOKBACK_SECONDS;
    
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: oldest.toString(),
      limit: 50
    });
    
    if (!result.messages || result.messages.length === 0) {
      console.log('No messages found.');
      return;
    }
    
    console.log(`Found ${result.messages.length} messages:\n`);
    
    result.messages.forEach((msg, i) => {
      const ts = new Date(parseFloat(msg.ts) * 1000).toLocaleTimeString();
      const text = (msg.text || '[no text]').substring(0, 150).replace(/\n/g, '\\n');
      console.log(`\n--- Message ${i + 1} [${ts}] ---`);
      console.log(`Bot: ${msg.bot_id ? 'YES' : 'NO'}, User: ${msg.user || msg.bot_id}`);
      console.log(`Text: ${text}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

previewMessages();

