#!/usr/bin/env node

/**
 * Test Slack authentication specifically
 */

require('dotenv').config();

async function testSlackAuth() {
  console.log('🔐 Testing Slack authentication...\n');

  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  console.log('Tokens:');
  console.log(`Bot Token: ${botToken?.substring(0, 15)}...${botToken?.substring(-10)}`);
  console.log(`App Token: ${appToken?.substring(0, 15)}...${appToken?.substring(-10)}`);
  console.log(`Signing Secret: ${signingSecret?.substring(0, 10)}...${signingSecret?.substring(-5)}\n`);

  // Test 1: Bot Token validity
  console.log('1️⃣ Testing Bot Token...');
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Bot Token is valid');
      console.log(`   Bot User: ${data.user} (${data.user_id})`);
      console.log(`   Team: ${data.team} (${data.team_id})`);
      console.log(`   URL: ${data.url}`);
    } else {
      console.log('❌ Bot Token is invalid:', data.error);
      return;
    }
  } catch (error) {
    console.log('❌ Bot Token test failed:', error.message);
    return;
  }

  // Test 2: App Token validity
  console.log('\n2️⃣ Testing App Token...');
  try {
    const response = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ App Token is valid');
      console.log(`   WebSocket URL available: ${!!data.url}`);
    } else {
      console.log('❌ App Token is invalid:', data.error);
      
      if (data.error === 'invalid_auth') {
        console.log('\n🔧 Possible fixes:');
        console.log('1. Check that Socket Mode is enabled in your Slack app');
        console.log('2. Regenerate the App-Level Token');
        console.log('3. Make sure the token has "connections:write" scope');
      }
      return;
    }
  } catch (error) {
    console.log('❌ App Token test failed:', error.message);
    return;
  }

  console.log('\n✅ All Slack tokens are valid!');
  console.log('\n🚀 Try starting the bot again with: npm start');
}

// Setup fetch for Node.js
async function setupFetch() {
  if (typeof fetch === 'undefined') {
    try {
      const { default: fetch } = await import('node-fetch');
      global.fetch = fetch;
    } catch (error) {
      console.log('❌ node-fetch not available');
      process.exit(1);
    }
  }
}

setupFetch().then(() => {
  testSlackAuth().catch(console.error);
});

