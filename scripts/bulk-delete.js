#!/usr/bin/env node
require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL = 'C097L4HK3PY';

async function deleteAll() {
  console.log('Starting bulk delete...');
  let totalDeleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const result = await client.conversations.history({ 
        channel: CHANNEL, 
        limit: 200 
      });
      
      const msgs = result.messages.filter(m => 
        m.text && m.text.includes('Deal has been Won')
      );
      
      console.log(`Found ${msgs.length} alerts to delete`);
      
      if (msgs.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const msg of msgs) {
        try {
          await client.chat.delete({ channel: CHANNEL, ts: msg.ts });
          totalDeleted++;
          if (totalDeleted % 10 === 0) console.log(`Deleted ${totalDeleted}...`);
        } catch (e) {
          if (e.data?.error === 'ratelimited') {
            console.log('Rate limited, waiting 2s...');
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        await new Promise(r => setTimeout(r, 300)); // 300ms between deletes
      }
      
      hasMore = result.has_more || msgs.length > 0;
      
    } catch (e) {
      console.log('Error:', e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log(`DONE! Total deleted: ${totalDeleted}`);
}

deleteAll();

