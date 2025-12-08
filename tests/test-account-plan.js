require('dotenv').config();
const { intentParser } = require('./src/ai/intentParser');

/**
 * Test Account Plan functionality
 * Tests both SAVE and QUERY intents
 */

async function testAccountPlanIntents() {
  console.log('🧪 Testing Account Plan Intent Detection\n');
  console.log('=' .repeat(60));

  const testCases = [
    {
      name: 'Save Account Plan - Full Format',
      query: `add account plan for Intel:
CLO engagement: Monthly meetings with General Counsel
Budget holder: CFO Jane Smith
Champion(s): Legal Director John Doe, VP Operations Sarah Johnson
Use case(s): Contract review automation, M&A due diligence
Why Eudia: AI-powered contract analysis saves 60% review time
Why now: Q4 compliance audit requires faster turnaround
Why at all: Manual review not scalable for growth plans`,
      expectedIntent: 'save_account_plan'
    },
    {
      name: 'Save Account Plan - Alternative Phrasing',
      query: `save account plan for Apple
CLO engagement: Quarterly strategic reviews
Budget holder: General Counsel
Champion(s): Senior Legal Counsel
Use case(s): Contracting automation
Why Eudia: Best in class AI
Why now: Budget approved
Why at all: Scale legal operations`,
      expectedIntent: 'save_account_plan'
    },
    {
      name: 'Update Account Plan',
      query: `update account plan for Microsoft:
CLO engagement: Engaged weekly
Budget holder: VP Legal
Champion(s): Associate GC
Use case(s): Contract intelligence
Why Eudia: ROI proven
Why now: Current solution EOL
Why at all: Strategic priority`,
      expectedIntent: 'save_account_plan'
    },
    {
      name: 'Query Account Plan - What is',
      query: 'what is the account plan for Intel?',
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Account Plan - Show me',
      query: 'show me the account plan for Apple',
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Account Plan - Get',
      query: 'get account plan for Microsoft',
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Account Plan - What\'s',
      query: "what's Intel's account plan?",
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Account Plan - Tell me',
      query: 'tell me about the account plan for Best Buy',
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Account Plan - Alternative phrasing',
      query: 'account plan for Cargill',
      expectedIntent: 'query_account_plan'
    },
    {
      name: 'Query Strategic Plan',
      query: 'show me the strategic plan for Intel',
      expectedIntent: 'query_account_plan'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Query: "${test.query.substring(0, 80)}${test.query.length > 80 ? '...' : ''}"`);
    
    try {
      const result = await intentParser.parseIntent(test.query);
      
      const success = result.intent === test.expectedIntent;
      
      if (success) {
        console.log(`✅ PASS - Intent: ${result.intent}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        if (result.entities.accounts) {
          console.log(`   Account extracted: ${result.entities.accounts[0]}`);
        }
        passed++;
      } else {
        console.log(`❌ FAIL - Expected: ${test.expectedIntent}, Got: ${result.intent}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed`);
  
  if (failed === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.log(`❌ ${failed} test(s) failed`);
  }
  
  return failed === 0;
}

async function testUnknownQueryHandling() {
  console.log('\n\n🧪 Testing Unknown Query Handling\n');
  console.log('=' .repeat(60));

  const unknownQueries = [
    'what color is the sky?',
    'how many employees does Google have?',
    'what is the weather today?',
    'tell me a joke',
    'what time is it?'
  ];

  let detectedAsUnknown = 0;

  for (const query of unknownQueries) {
    console.log(`\n📝 Query: "${query}"`);
    
    try {
      const result = await intentParser.parseIntent(query);
      
      if (result.intent === 'unknown_query') {
        console.log(`✅ Correctly detected as unknown`);
        console.log(`   Extracted words: ${result.entities.extractedWords?.join(', ') || 'none'}`);
        detectedAsUnknown++;
      } else {
        console.log(`⚠️  Detected as: ${result.intent} (may still be valid)`);
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Unknown Query Detection: ${detectedAsUnknown}/${unknownQueries.length} queries correctly identified as unknown`);
  
  return true;
}

// Run tests
(async () => {
  try {
    const accountPlanPassed = await testAccountPlanIntents();
    await testUnknownQueryHandling();
    
    if (accountPlanPassed) {
      console.log('\n✅ Account Plan feature is ready for testing in Slack!');
      console.log('\n📝 Example Slack commands to test:');
      console.log('   @gtm-brain add account plan for Test Company:');
      console.log('   CLO engagement: Weekly meetings');
      console.log('   Budget holder: CFO');
      console.log('   Champion(s): Legal Director');
      console.log('   Use case(s): Contract automation');
      console.log('   Why Eudia: Best AI platform');
      console.log('   Why now: Q4 initiative');
      console.log('   Why at all: Competitive advantage');
      console.log('\n   @gtm-brain what\'s the account plan for Test Company?');
    }
    
    process.exit(accountPlanPassed ? 0 : 1);
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
})();

