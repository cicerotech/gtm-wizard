// Test Clay API with actual key from Render
const fetch = require('node-fetch');

const CLAY_API_KEY = '994eefbafaf68d2b47b4';

async function testClayEndpoints() {
  console.log('Testing Clay API endpoints...\n');
  
  const endpoints = [
    { url: 'https://api.clay.com/v1/companies/enrich', body: { name: 'IKEA' }},
    { url: 'https://api.clay.com/v1/companies/enrich', body: { domain: 'ikea.com' }},
    { url: 'https://api.clay.com/v1/enrichment', body: { company: 'IKEA' }},
    { url: 'https://api.clay.com/v1/enrich/company', body: { name: 'IKEA' }}
  ];
  
  for (const test of endpoints) {
    console.log(`Testing: ${test.url}`);
    console.log(`Body: ${JSON.stringify(test.body)}`);
    
    try {
      const response = await fetch(test.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLAY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.body)
      });
      
      const text = await response.text();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${text.substring(0, 200)}\n`);
      
      if (response.ok) {
        console.log('✅ THIS ENDPOINT WORKS!\n');
        const data = JSON.parse(text);
        console.log('Full response:', JSON.stringify(data, null, 2));
        break;
      }
    } catch (error) {
      console.log(`Error: ${error.message}\n`);
    }
  }
}

testClayEndpoints();
