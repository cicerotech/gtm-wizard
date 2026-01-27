#!/usr/bin/env node
/**
 * Find GTM Account Planning channel
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackToken = process.env.SLACK_BOT_TOKEN;
const client = new WebClient(slackToken);

async function findChannel() {
  console.log('🔍 Searching for GTM Account Planning channel...\n');
  
  try {
    // List all channels the bot has access to
    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000
    });
    
    if (!result.channels || result.channels.length === 0) {
      console.log('No channels found.');
      return;
    }
    
    console.log(`Found ${result.channels.length} channels:\n`);
    
    // Filter for GTM-related channels
    const gtmChannels = result.channels.filter(c => 
      c.name.toLowerCase().includes('gtm') || 
      c.name.toLowerCase().includes('account') ||
      c.name.toLowerCase().includes('planning')
    );
    
    console.log('GTM/Account/Planning related channels:');
    gtmChannels.forEach(c => {
      console.log(`  ${c.id} - #${c.name} (is_member: ${c.is_member})`);
    });
    
    console.log('\n\nAll channels:');
    result.channels.forEach(c => {
      console.log(`  ${c.id} - #${c.name}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findChannel();

