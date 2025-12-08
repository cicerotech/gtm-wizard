#!/usr/bin/env node

/**
 * Test if the bot is receiving Slack events
 */

require('dotenv').config();
const { App } = require('@slack/bolt');

async function testLiveEvents() {
  console.log('👂 Testing live Slack event reception...\n');

  try {
    const app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      appToken: process.env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: 'info'
    });

    // Log ALL events received
    app.event('app_mention', async ({ event, client }) => {
      console.log('🎯 APP MENTION RECEIVED!', {
        user: event.user,
        channel: event.channel,
        text: event.text,
        ts: event.ts
      });

      // Try to respond
      try {
        await client.chat.postMessage({
          channel: event.channel,
          text: `🤖 I heard you! You said: "${event.text}"\n\nI'm alive and working! 🎉`,
          thread_ts: event.ts
        });
        console.log('✅ Response sent successfully!');
      } catch (error) {
        console.error('❌ Failed to respond:', error);
      }
    });

    app.event('message', async ({ event, client }) => {
      // Only handle DMs
      if (event.channel_type === 'im' && event.subtype !== 'bot_message') {
        console.log('💬 DIRECT MESSAGE RECEIVED!', {
          user: event.user,
          text: event.text,
          channel: event.channel
        });

        try {
          await client.chat.postMessage({
            channel: event.channel,
            text: `🤖 DM received: "${event.text}"\n\nI'm working! 🎉`
          });
          console.log('✅ DM response sent!');
        } catch (error) {
          console.error('❌ Failed to respond to DM:', error);
        }
      }
    });

    // Log any other events
    app.event(/.*/, async ({ event }) => {
      if (event.type !== 'app_mention' && event.type !== 'message') {
        console.log(`📡 Other event: ${event.type}`);
      }
    });

    app.error(async (error) => {
      console.error('🚨 Slack error:', error);
    });

    await app.start();
    console.log('⚡️ Live event tester is running!');
    console.log('\n📱 Now try in Slack:');
    console.log('1. Send @gtmbrain hello in your channel');
    console.log('2. Send a DM to the bot');
    console.log('3. Watch this console for events\n');
    console.log('🔄 Listening... (Press Ctrl+C to stop)');

    // Keep running
    await new Promise(() => {}); // Run forever

  } catch (error) {
    console.error('❌ Event tester failed:', error);
  }
}

testLiveEvents();

