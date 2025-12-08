#!/usr/bin/env node

/**
 * Diagnostic tool to figure out Socrates API format
 */

require('dotenv').config();

async function diagnoseSocrates() {
  console.log('🔍 Diagnosing Socrates API at https://socrates.cicerotech.link/\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  console.log(`Using API key: ${apiKey?.substring(0, 10)}...${apiKey?.substring(-5)}\n`);

  // Test different combinations
  const baseURLs = [
    'https://socrates.cicerotech.link',
    'https://socrates.cicerotech.link/api',
    'https://socrates.cicerotech.link/v1',
    'https://api.socrates.cicerotech.link'
  ];

  const endpoints = [
    '',
    '/chat',
    '/completions', 
    '/chat/completions',
    '/v1/chat/completions',
    '/api/chat',
    '/api/completions'
  ];

  const testPayload = {
    model: 'claude-opus-4.1',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 10
  };

  const authMethods = [
    { name: 'Bearer Token', headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: 'X-API-Key', headers: { 'X-API-Key': apiKey } },
    { name: 'Direct Auth', headers: { 'Authorization': apiKey } },
    { name: 'No Auth', headers: {} }
  ];

  for (const baseURL of baseURLs) {
    for (const endpoint of endpoints) {
      const fullURL = `${baseURL}${endpoint}`;
      
      console.log(`\n🧪 Testing: ${fullURL}`);
      
      for (const auth of authMethods) {
        try {
          const response = await fetch(fullURL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'GTM-Brain-Diagnostic/1.0',
              ...auth.headers
            },
            body: JSON.stringify(testPayload)
          });

          console.log(`  ${auth.name}: HTTP ${response.status}`);
          
          if (response.status === 200) {
            const data = await response.json();
            console.log(`  ✅ SUCCESS with ${auth.name}!`);
            console.log(`  Response format:`, JSON.stringify(data, null, 2));
            return;
          } else if (response.status !== 404 && response.status !== 405) {
            const errorText = await response.text();
            console.log(`  📋 Response: ${errorText.substring(0, 200)}`);
          }
          
        } catch (error) {
          if (!error.message.includes('fetch is not defined')) {
            console.log(`  ❌ ${auth.name}: ${error.message}`);
          }
        }
      }
    }
  }

  console.log('\n🔍 No working endpoint found. Possible issues:');
  console.log('1. API key might be incorrect');
  console.log('2. API endpoint might be different');
  console.log('3. Authentication method might be custom');
  console.log('4. API might require specific headers or parameters');
  console.log('\nTry checking your Socrates web interface for API documentation.');
}

// Handle fetch not being available in older Node versions
async function setupFetch() {
  if (typeof fetch === 'undefined') {
    try {
      const { default: fetch } = await import('node-fetch');
      global.fetch = fetch;
    } catch (error) {
      console.log('❌ node-fetch not available. Please run: npm install node-fetch');
      process.exit(1);
    }
  }
}

// Run diagnostic
setupFetch().then(() => {
  diagnoseSocrates().catch(console.error);
});

