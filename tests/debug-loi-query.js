#!/usr/bin/env node

require('dotenv').config();

async function debugLOI() {
  const { parseIntent } = require('./src/ai/intentParser');
  
  const queries = [
    "what LOIs have we signed in the last two weeks?",
    "what LOIs we're signed in the last two weeks?",
    "what LOIs have signed last month?"
  ];

  for (const q of queries) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Query: "${q}"`);
    console.log('─'.repeat(70));
    
    try {
      const parsed = await parseIntent(q, null, 'test');
      console.log('Intent:', parsed.intent);
      console.log('Entities:', JSON.stringify(parsed.entities, null, 2));
      
      // Check what we expect
      console.log('\nExpected:');
      console.log('  - isClosed: true');
      console.log('  - isWon: true');
      console.log('  - bookingType: "Booking"');
      console.log('  - loiDate: "last_14_days" or timeframe: "last_month"');
      
    } catch (error) {
      console.log('Error:', error.message);
    }
  }
  
  process.exit(0);
}

debugLOI();

