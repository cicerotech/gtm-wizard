#!/usr/bin/env node

require('dotenv').config();

async function comprehensiveTest() {
  console.log('🧪 COMPREHENSIVE FINAL TEST - GTM-Wizard\n');

  const { initializeRedis } = require('./src/utils/cache');
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  const { parseIntent } = require('./src/ai/intentParser');

  await initializeRedis();
  await initializeSalesforce();

  const criticalTests = [
    { q: 'who owns Intel?', expected: 'account_lookup', account: 'Intel', owner: 'Himanshu' },
    { q: 'who is the BL for Apple?', expected: 'account_lookup', account: 'Apple', owner: 'Julie' },
    { q: "what's the legal team size at Best Buy?", expected: 'account_field_lookup', account: 'Best Buy' },
    { q: 'what LOIs have signed last month?', expected: 'deal_lookup', filter: 'Revenue_Type=Booking' },
    { q: 'what ARR deals have signed in the last week?', expected: 'deal_lookup', filter: 'Revenue_Type=ARR' },
    { q: 'how many ARR customers?', expected: 'count_query', countType: 'arr_customers' },
    { q: 'how many ARR contracts?', expected: 'count_query', countType: 'arr_contracts' },
    { q: 'average days in stage 4?', expected: 'average_days_query', stage: 'Stage 4' },
    { q: 'what deals were added to pipeline this week?', expected: 'deal_lookup', filter: 'Week_Created' },
    { q: 'late stage opportunities', expected: 'pipeline_summary', stage: 'Stage 4' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of criticalTests) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 "${test.q}"`);
    console.log('─'.repeat(70));

    try {
      const parsed = await parseIntent(test.q, null, 'test');
      
      if (parsed.intent === test.expected) {
        console.log(`✅ Intent: ${parsed.intent} (CORRECT)`);
        passed++;
      } else {
        console.log(`❌ Intent: ${parsed.intent} (Expected: ${test.expected})`);
        failed++;
      }
      
      console.log(`Entities:`, JSON.stringify(parsed.entities, null, 2).substring(0, 200));
      
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESULTS: ${passed}/${criticalTests.length} passing`);
  
  if (failed === 0) {
    console.log(`🎉 ALL CRITICAL TESTS PASSING!`);
  } else {
    console.log(`⚠️  ${failed} tests need attention`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

comprehensiveTest();

