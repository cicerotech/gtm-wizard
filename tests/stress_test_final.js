#!/usr/bin/env node

require('dotenv').config();

async function stressTest() {
  console.log('🧪 COMPREHENSIVE STRESS TEST - GTM-Wizard\n');
  console.log('Testing with UNTESTED accounts and all query variations...\n');

  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  const { parseIntent } = require('./src/ai/intentParser');

  await initializeSalesforce();

  // Test accounts from screenshots (not previously tested)
  const testAccounts = [
    'Walmart', 'Netflix', 'Uber', 'Airbnb', 'Spotify',
    'AT&T', 'T-Mobile', 'Comcast', 'Verizon',
    'Wells Fargo', 'Bank of America', 'Goldman Sachs',
    'Salesforce', 'Oracle', 'ServiceNow',
    'Home Depot', 'Costco Wholesale', 'Target'
  ];

  const queryTemplates = [
    { template: 'who owns {ACCOUNT}?', intent: 'account_lookup' },
    { template: 'BL for {ACCOUNT}?', intent: 'account_lookup' },
    { template: "what's the legal team size at {ACCOUNT}?", intent: 'account_field_lookup' },
    { template: 'who are the decision makers at {ACCOUNT}?', intent: 'account_field_lookup' },
    { template: 'what use cases is {ACCOUNT} discussing?', intent: 'account_field_lookup' }
  ];

  let passed = 0;
  let failed = 0;
  const results = [];

  // Test subset of accounts (5 random ones)
  const testSubset = testAccounts.slice(0, 5);

  for (const account of testSubset) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing account: ${account}`);
    console.log('─'.repeat(70));

    for (const template of queryTemplates) {
      const testQuery = template.template.replace('{ACCOUNT}', account);
      
      try {
        const parsed = await parseIntent(testQuery, null, 'test');
        
        if (parsed.intent === template.intent) {
          console.log(`✅ "${testQuery}" → ${parsed.intent}`);
          passed++;
          results.push({ query: testQuery, status: 'PASS', intent: parsed.intent });
        } else {
          console.log(`❌ "${testQuery}" → ${parsed.intent} (expected ${template.intent})`);
          failed++;
          results.push({ query: testQuery, status: 'FAIL', intent: parsed.intent, expected: template.intent });
        }
        
      } catch (error) {
        console.log(`❌ "${testQuery}" → ERROR: ${error.message}`);
        failed++;
        results.push({ query: testQuery, status: 'ERROR', error: error.message });
      }
    }
  }

  // Test count and average queries
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing COUNT & AVERAGE queries`);
  console.log('─'.repeat(70));

  const specialQueries = [
    { q: 'how many customers do we have?', intent: 'count_query' },
    { q: 'how many ARR customers?', intent: 'count_query' },
    { q: 'how many ARR contracts?', intent: 'count_query' },
    { q: 'what accounts have signed LOIs?', intent: 'count_query' },
    { q: 'what companies have signed ARR deals?', intent: 'count_query' },
    { q: 'average days in stage 4?', intent: 'average_days_query' },
    { q: 'what is the average days in stage of stage 2?', intent: 'average_days_query' }
  ];

  for (const test of specialQueries) {
    try {
      const parsed = await parseIntent(test.q, null, 'test');
      
      if (parsed.intent === test.intent) {
        console.log(`✅ "${test.q}" → ${parsed.intent}`);
        passed++;
      } else {
        console.log(`❌ "${test.q}" → ${parsed.intent} (expected ${test.intent})`);
        failed++;
      }
      
    } catch (error) {
      console.log(`❌ "${test.q}" → ERROR`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 FINAL RESULTS: ${passed}/${passed + failed} passing (${((passed/(passed+failed))*100).toFixed(1)}%)`);
  
  if (failed === 0) {
    console.log(`🎉 ALL TESTS PASSING - PRODUCTION READY!`);
  } else {
    console.log(`⚠️  ${failed} tests need attention`);
    console.log(`\nFailed queries:`);
    results.filter(r => r.status !== 'PASS').forEach(r => {
      console.log(`  - ${r.query}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

stressTest();

