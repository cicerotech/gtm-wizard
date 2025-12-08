#!/usr/bin/env node

/**
 * Debug Slack connection and event handling
 */

require('dotenv').config();
const { App } = require('@slack/bolt');

async function debugSlack() {
  console.log('🔍 Debugging Slack connection...\n');

  try {
    // Create minimal Slack app for testing
    const app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      appToken: process.env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: 'debug'
    });

    // Simple mention handler for testing
    app.event('app_mention', async ({ event, client, say }) => {
      console.log('🎯 Received app mention:', {
        user: event.user,
        channel: event.channel,
        text: event.text,
        ts: event.ts
      });

      try {
        await say({
          text: `✅ I received your message: "${event.text}"\n\nBot is working! 🤖`,
          thread_ts: event.ts
        });
        console.log('✅ Response sent successfully');
      } catch (error) {
        console.error('❌ Failed to send response:', error);
      }
    });

    // Handle direct messages
    app.event('message', async ({ event, client, say }) => {
      // Skip bot messages and only handle DMs
      if (event.subtype === 'bot_message' || event.channel_type !== 'im') {
        return;
      }

      console.log('💬 Received DM:', {
        user: event.user,
        text: event.text,
        channel: event.channel
      });

      try {
        await say(`✅ DM received: "${event.text}"\n\nBot is working! 🤖`);
        console.log('✅ DM response sent successfully');
      } catch (error) {
        console.error('❌ Failed to send DM response:', error);
      }
    });

    // Error handler
    app.error(async (error) => {
      console.error('🚨 Slack app error:', error);
    });

    // Start the app
    await app.start();
    console.log('⚡️ Debug Slack bot is running!');
    console.log('\n📱 Try these tests:');
    console.log('1. Send a DM to your bot');
    console.log('2. Mention @gtmbrain in a channel');
    console.log('3. Check this console for debug messages\n');

    // Keep running
    console.log('🔄 Listening for events... (Press Ctrl+C to stop)');

  } catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Debug session ended');
  process.exit(0);
});

debugSlack();

