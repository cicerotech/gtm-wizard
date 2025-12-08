#!/usr/bin/env node

/**
 * Test different model names in Socrates
 */

require('dotenv').config();

async function testModels() {
  console.log('🤖 Testing different model names in Socrates...\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  const url = 'https://socrates.cicerotech.link/api/chat/completions';
  
  // Common model name variations
  const modelNames = [
    'claude-opus-4.1',
    'claude-opus',
    'claude-3-opus',
    'claude-3.5-sonnet',
    'claude-sonnet',
    'claude',
    'gpt-4',
    'gpt-4.0',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-5',
    'gpt-3.5-turbo',
    'anthropic/claude-3-opus',
    'openai/gpt-4',
    'default'
  ];

  for (const model of modelNames) {
    const testPayload = {
      model: model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5
    };

    try {
      console.log(`Testing model: ${model}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'GTM-Brain-Test/1.0'
        },
        body: JSON.stringify(testPayload)
      });

      if (response.status === 200) {
        const data = await response.json();
        console.log(`✅ SUCCESS with model: ${model}`);
        console.log(`Response:`, JSON.stringify(data, null, 2));
        return model; // Return the working model
      } else {
        const errorText = await response.text();
        console.log(`❌ ${model}: HTTP ${response.status} - ${errorText}`);
      }
      
    } catch (error) {
      console.log(`❌ ${model}: ${error.message}`);
    }
  }

  console.log('\n🔍 No working model found. The API might use different model names.');
  return null;
}

// Handle fetch
async function setupFetch() {
  if (typeof fetch === 'undefined') {
    try {
      const { default: fetch } = await import('node-fetch');
      global.fetch = fetch;
    } catch (error) {
      console.log('Installing node-fetch...');
      const { execSync } = require('child_process');
      execSync('npm install node-fetch', { stdio: 'inherit' });
      const { default: fetch } = await import('node-fetch');
      global.fetch = fetch;
    }
  }
}

// Run test
setupFetch().then(() => {
  testModels().catch(console.error);
});

