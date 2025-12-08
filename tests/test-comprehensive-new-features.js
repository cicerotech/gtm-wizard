require('dotenv').config();
const { intentParser } = require('./src/ai/intentParser');

/**
 * Comprehensive Test Suite for New Features
 * Tests: Account assignment, opportunity creation, post-call summaries
 */

async function testAllNewIntents() {
  console.log('🧪 Testing ALL New Feature Intents\n');
  console.log('='.repeat(70));

  const testCases = [
    // Account existence & creation
    {
      name: 'Account Existence Check',
      query: 'does Intel exist?',
      expectedIntent: 'account_existence_check',
      expectedAccount: 'Intel'
    },
    {
      name: 'Create Account with Assignment',
      query: 'create Acme Corp and assign to BL',
      expectedIntent: 'create_account',
      expectedAccount: 'Acme Corp'
    },
    {
      name: 'Reassign Account',
      query: 'assign Intel to Julie Stefanich',
      expectedIntent: 'reassign_account',
      expectedAccount: 'Intel'
    },
    
    // Opportunity creation
    {
      name: 'Create Opportunity',
      query: `create opp for Intel:
ACV: 500000
Stage: 1
Product Line: AI-Augmented Contracting
Target Sign Date: 12/31/2025
Revenue Type: Revenue`,
      expectedIntent: 'create_opportunity',
      expectedAccount: 'Intel'
    },
    
    // Post-call summary
    {
      name: 'Post-Call Summary',
      query: `post-call summary
Company: Microsoft
Met with Sarah (VP Legal). First meeting. Interested in contracting.
Budget $400K. Demo next week.`,
      expectedIntent: 'post_call_summary'
    },
    
    // Existing features (regression test)
    {
      name: 'Account Plan Save (existing)',
      query: `add account plan for Test:
CLO engagement: Testing
Budget holder: CFO
Champion(s): Legal Director
Use case(s): Automation
Why Eudia: Best
Why now: Q4
Why at all: Scale`,
      expectedIntent: 'save_account_plan'
    },
    {
      name: 'Account Plan Query (existing)',
      query: 'what is the account plan for Intel?',
      expectedIntent: 'query_account_plan',
      expectedAccount: 'Intel'
    },
    {
      name: 'Late Stage Pipeline (existing)',
      query: 'late stage contracting',
      expectedIntent: 'pipeline_summary'
    },
    {
      name: 'Who Owns (existing)',
      query: 'who owns Intel?',
      expectedIntent: 'account_lookup',
      expectedAccount: 'Intel'
    },
    {
      name: 'Contracts (existing)',
      query: 'contracts for Cargill',
      expectedIntent: 'contract_query',
      expectedAccount: 'Cargill'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Query: "${test.query.substring(0, 60)}${test.query.length > 60 ? '...' : ''}"`);
    
    try {
      const result = await intentParser.parseIntent(test.query);
      
      const intentMatch = result.intent === test.expectedIntent;
      const accountMatch = !test.expectedAccount || 
                          (result.entities.accounts && 
                           result.entities.accounts[0]?.toLowerCase().includes(test.expectedAccount.toLowerCase()));
      
      if (intentMatch && accountMatch) {
        console.log(`✅ PASS - Intent: ${result.intent}`);
        if (result.entities.accounts) {
          console.log(`   Account: ${result.entities.accounts[0]}`);
        }
        if (result.entities.targetBL) {
          console.log(`   Target BL: ${result.entities.targetBL}`);
        }
        passed++;
      } else {
        console.log(`❌ FAIL - Expected: ${test.expectedIntent}, Got: ${result.intent}`);
        if (!accountMatch) {
          console.log(`   Account mismatch: Expected "${test.expectedAccount}", Got "${result.entities.accounts?.[0]}"`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed`);
  
  if (failed === 0) {
    console.log('\n✅ All intent detection tests passed!');
    console.log('\n🎉 Ready for production testing in Slack!');
  } else {
    console.log(`\n❌ ${failed} test(s) failed - review before deploying`);
  }
  
  return failed === 0;
}

function displayTestingGuide() {
  console.log('\n\n' + '='.repeat(70));
  console.log('\n📋 SLACK TESTING GUIDE\n');
  console.log('='.repeat(70));
  
  console.log('\n🔍 Test 1: Account Existence (Existing)');
  console.log('Command: does Intel exist?');
  console.log('Expected: ✅ Account exists, shows owner\n');
  
  console.log('🔍 Test 2: Account Existence (Not Found)');
  console.log('Command: does Fake Test Company XYZ exist?');
  console.log('Expected: ❌ Not found, suggests creation\n');
  
  console.log('🏗️  Test 3: Create Account with Auto-Assignment');
  console.log('Command: create GTM Test Account and assign to BL');
  console.log('Expected: ✅ Account created with enrichment + assignment reasoning');
  console.log('Note: Check Salesforce for HQ, revenue, website fields\n');
  
  console.log('📊 Test 4: Create Opportunity');
  console.log('Command: create opp for GTM Test Account:');
  console.log('         ACV: 250000');
  console.log('         Stage: 1');
  console.log('         Product Line: AI-Augmented Contracting');
  console.log('         Target Sign Date: 12/31/2025');
  console.log('         Revenue Type: Revenue');
  console.log('Expected: ✅ Opportunity created with all fields\n');
  
  console.log('🔄 Test 5: Reassign Account');
  console.log('Command: assign GTM Test Account to Julie Stefanich');
  console.log('Expected: ✅ Account + opportunities reassigned\n');
  
  console.log('📝 Test 6: Post-Call Summary');
  console.log('Command: post-call summary');
  console.log('         Company: GTM Test Account');
  console.log('         Met with John (CEO). Interested in contracting.');
  console.log('         Budget $300K. Demo next week.');
  console.log('Expected: ✅ Summary structured and saved to Customer_Brain\n');
  
  console.log('🔙 Test 7: Existing Features (Regression)');
  console.log('Command: late stage contracting');
  console.log('Expected: ✅ Shows list of all companies in Stage 4\n');
  
  console.log('Command: who owns Intel?');
  console.log('Expected: ✅ Shows owner info\n');
  
  console.log('='.repeat(70));
  console.log('\n💡 Tips:');
  console.log('   - Use "GTM Test Account" for testing (easy to find/delete)');
  console.log('   - Check Salesforce after each test to verify data');
  console.log('   - Clay enrichment requires CLAY_API_KEY in Render');
  console.log('   - All creation/assignment features are Keigan-only');
  console.log('\n='.repeat(70));
}

// Run tests
(async () => {
  try {
    const allPass = await testAllNewIntents();
    displayTestingGuide();
    
    process.exit(allPass ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
})();

