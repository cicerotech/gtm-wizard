require('dotenv').config();
const { intentParser } = require('./src/ai/intentParser');
const { determineRegion, assessWorkload, selectBusinessLead, validateBusinessLead } = require('./src/services/accountAssignment');

/**
 * Test Account Assignment & Creation Features
 */

async function testIntentDetection() {
  console.log('🧪 Testing Account Assignment Intent Detection\n');
  console.log('='.repeat(60));

  const testCases = [
    {
      name: 'Account Existence Check',
      query: 'does Intel exist?',
      expectedIntent: 'account_existence_check'
    },
    {
      name: 'Account Existence - Alternative',
      query: 'does Microsoft exist in Salesforce?',
      expectedIntent: 'account_existence_check'
    },
    {
      name: 'Create Account',
      query: 'create Acme Corp and assign to BL',
      expectedIntent: 'create_account'
    },
    {
      name: 'Create Account - Alternative',
      query: 'add account for Test Company and assign to business lead',
      expectedIntent: 'create_account'
    },
    {
      name: 'Reassign Account',
      query: 'assign Intel to Julie Stefanich',
      expectedIntent: 'reassign_account'
    },
    {
      name: 'Reassign Account - Alternative',
      query: 'reassign Apple to Himanshu Agarwal',
      expectedIntent: 'reassign_account'
    },
    {
      name: 'Existing Query - Who Owns (should still work)',
      query: 'who owns Intel?',
      expectedIntent: 'account_lookup'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Query: "${test.query}"`);
    
    try {
      const result = await intentParser.parseIntent(test.query);
      
      const success = result.intent === test.expectedIntent;
      
      if (success) {
        console.log(`✅ PASS - Intent: ${result.intent}`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        if (result.entities.accounts) {
          console.log(`   Account extracted: ${result.entities.accounts[0]}`);
        }
        if (result.entities.targetBL) {
          console.log(`   Target BL: ${result.entities.targetBL}`);
        }
        passed++;
      } else {
        console.log(`❌ FAIL - Expected: ${test.expectedIntent}, Got: ${result.intent}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Intent Detection: ${passed}/${testCases.length} passed`);
  
  return failed === 0;
}

async function testGeographicLogic() {
  console.log('\n\n🧪 Testing Geographic Assignment Logic\n');
  console.log('='.repeat(60));

  const testCases = [
    {
      name: 'West Coast - California',
      hq: { city: 'San Francisco', state: 'CA', country: 'USA' },
      expectedRegion: 'westCoast'
    },
    {
      name: 'East Coast - New York',
      hq: { city: 'New York', state: 'NY', country: 'USA' },
      expectedRegion: 'eastCoast'
    },
    {
      name: 'International - UK',
      hq: { city: 'London', state: null, country: 'UK' },
      expectedRegion: 'international'
    },
    {
      name: 'Central - Illinois (default to West)',
      hq: { city: 'Chicago', state: 'IL', country: 'USA' },
      expectedRegion: 'westCoast'
    }
  ];

  let passed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`   HQ: ${test.hq.city}, ${test.hq.state || test.hq.country}`);
    
    const region = determineRegion(test.hq);
    
    if (region === test.expectedRegion) {
      console.log(`✅ PASS - Region: ${region}`);
      passed++;
    } else {
      console.log(`❌ FAIL - Expected: ${test.expectedRegion}, Got: ${region}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Geographic Logic: ${passed}/${testCases.length} passed`);
  
  return passed === testCases.length;
}

async function testWorkloadAssessment() {
  console.log('\n\n🧪 Testing Workload Assessment\n');
  console.log('='.repeat(60));

  try {
    const testBLs = ['Julie Stefanich', 'Himanshu Agarwal', 'Olivia Jung'];
    
    console.log(`\n📊 Assessing workload for: ${testBLs.join(', ')}`);
    
    const workload = await assessWorkload(testBLs);
    
    console.log('\n*Workload Results:*');
    Object.values(workload).forEach(bl => {
      console.log(`\n${bl.name}:`);
      console.log(`  Active Opps (Stage 1+): ${bl.activeOpportunities}`);
      console.log(`  Closing This Month: ${bl.closingThisMonth}`);
      console.log(`  Total Score: ${bl.totalScore}`);
    });
    
    const selected = selectBusinessLead(workload);
    
    console.log(`\n✅ Selected BL: ${selected.name}`);
    console.log(`   Reasoning: Lowest workload (${selected.activeOpportunities} active, ${selected.closingThisMonth} closing)`);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Workload assessment working!');
    
    return true;
    
  } catch (error) {
    console.error(`\n❌ Workload assessment failed: ${error.message}`);
    console.error('\nNote: This requires Salesforce connection. Run locally with .env configured.');
    return false;
  }
}

function testBLValidation() {
  console.log('\n\n🧪 Testing BL Name Validation\n');
  console.log('='.repeat(60));

  const testCases = [
    { input: 'Julie', expected: 'Julie Stefanich' },
    { input: 'julie stefanich', expected: 'Julie Stefanich' },
    { input: 'Himanshu', expected: 'Himanshu Agarwal' },
    { input: 'Olivia', expected: 'Olivia Jung' },
    { input: 'Invalid Name', expected: null }
  ];

  let passed = 0;

  testCases.forEach(test => {
    console.log(`\n📝 Input: "${test.input}"`);
    const result = validateBusinessLead(test.input);
    
    if (result === test.expected) {
      console.log(`✅ PASS - Matched: ${result || 'null'}`);
      passed++;
    } else {
      console.log(`❌ FAIL - Expected: ${test.expected}, Got: ${result}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 BL Validation: ${passed}/${testCases.length} passed`);
  
  return passed === testCases.length;
}

// Run all tests
(async () => {
  try {
    console.log('🚀 GTM-Wizard Account Assignment Tests\n\n');
    
    const intentPass = await testIntentDetection();
    const geoPass = await testGeographicLogic();
    const blValidPass = testBLValidation();
    
    // Workload requires Salesforce connection
    console.log('\n\n⚠️  Workload assessment test requires Salesforce connection');
    console.log('Run locally with .env file to test workload assessment');
    
    const allPass = intentPass && geoPass && blValidPass;
    
    console.log('\n\n' + '='.repeat(60));
    console.log('\n📊 OVERALL RESULTS:');
    console.log(`   Intent Detection: ${intentPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Geographic Logic: ${geoPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   BL Validation: ${blValidPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Workload Assessment: ⏭️  SKIPPED (needs Salesforce)`);
    
    if (allPass) {
      console.log('\n✅ Account assignment feature ready for Salesforce testing!');
      console.log('\n📝 Next steps:');
      console.log('   1. Add CLAY_API_KEY to .env');
      console.log('   2. Test "does Intel exist?" in Slack');
      console.log('   3. Test "create Test Company and assign to BL"');
      console.log('   4. Test "assign Test Company to Julie Stefanich"');
    }
    
    process.exit(allPass ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
})();

