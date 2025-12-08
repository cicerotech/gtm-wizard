require('dotenv').config();
const { intentParser } = require('./src/ai/intentParser');

/**
 * Test Opportunity Creation - Both Simple and Detailed Modes
 */

async function testOpportunityCreation() {
  console.log('🧪 Testing Opportunity Creation Modes\n');
  console.log('='.repeat(70));

  const testCases = [
    {
      name: 'Simple Mode - All Defaults',
      query: 'create an opp for GTM Test Company',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'GTM Test Company',
      expectedSimpleMode: true,
      expectedDefaults: 'All defaults should be used'
    },
    {
      name: 'Detailed Mode - Stage and ACV Only',
      query: 'create an opp for GTM Test Company. stage 4 and $300k acv',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'GTM Test Company',
      expectedSimpleMode: false,
      expectedCustom: ['stage: 4', 'acv: 300000'],
      expectedDefaults: ['targetDate', 'productLine', 'revenueType']
    },
    {
      name: 'Detailed Mode - All Custom Fields',
      query: 'create an opp for GTM Test Company. stage 4 and $300k acv and target sign of 11/30/2025',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'GTM Test Company',
      expectedSimpleMode: false,
      expectedCustom: ['stage: 4', 'acv: 300000', 'targetDate: 11/30/2025']
    },
    {
      name: 'Detailed Mode - Partial Fields',
      query: 'create an opp for Intel. $500k acv',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'Intel',
      expectedSimpleMode: false,
      expectedCustom: ['acv: 500000'],
      expectedDefaults: ['stage', 'targetDate', 'productLine']
    },
    {
      name: 'Account Name Extraction - Complex Name',
      query: 'create an opp for The Weir Group PLC',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'The Weir Group PLC',
      expectedSimpleMode: true
    },
    {
      name: 'Account Name with Special Chars',
      query: 'create an opp for O\'Reilly Auto Parts. stage 2',
      expectedIntent: 'create_opportunity',
      expectedAccount: 'O\'Reilly Auto Parts',
      expectedSimpleMode: false
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Query: "${test.query}"`);
    
    try {
      const result = await intentParser.parseIntent(test.query);
      
      const intentMatch = result.intent === test.expectedIntent;
      const accountMatch = result.entities.accounts && 
                          result.entities.accounts[0]?.toLowerCase().includes(test.expectedAccount.toLowerCase());
      const modeMatch = result.entities.simpleMode === test.expectedSimpleMode;
      
      if (intentMatch && accountMatch && modeMatch) {
        console.log(`✅ PASS`);
        console.log(`   Intent: ${result.intent}`);
        console.log(`   Account: ${result.entities.accounts[0]}`);
        console.log(`   Mode: ${result.entities.simpleMode ? 'Simple (defaults)' : 'Detailed (custom)'}`);
        
        if (!result.entities.simpleMode) {
          console.log(`   Custom fields detected:`);
          if (result.entities.stage) console.log(`     - Stage: ${result.entities.stage}`);
          if (result.entities.acv) console.log(`     - ACV: $${result.entities.acv.toLocaleString()}`);
          if (result.entities.targetDate) console.log(`     - Target Date: ${result.entities.targetDate}`);
          if (result.entities.productLine) console.log(`     - Product Line: ${result.entities.productLine}`);
          if (result.entities.revenueType) console.log(`     - Revenue Type: ${result.entities.revenueType}`);
        }
        
        passed++;
      } else {
        console.log(`❌ FAIL`);
        if (!intentMatch) console.log(`   Intent: Expected ${test.expectedIntent}, Got ${result.intent}`);
        if (!accountMatch) console.log(`   Account: Expected "${test.expectedAccount}", Got "${result.entities.accounts?.[0]}"`);
        if (!modeMatch) console.log(`   Mode: Expected ${test.expectedSimpleMode}, Got ${result.entities.simpleMode}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed\n`);
  
  if (failed === 0) {
    console.log('✅ All opportunity creation tests passed!');
    console.log('\n📋 Expected Defaults:');
    console.log('   • ACV: $300,000');
    console.log('   • Stage: 1 (Discovery)');
    console.log('   • Target Sign: TODAY + 150 days');
    console.log('   • Revenue Type: Revenue');
    console.log('   • Product Line: AI-Augmented Contracting');
    console.log('   • Term: 36 months');
    console.log('   • Opportunity Source: Inbound');
    console.log('\n📋 Override behavior:');
    console.log('   • Only mentioned fields are overridden');
    console.log('   • Everything else uses defaults');
    console.log('   • Account name carefully validated (prevents wrong attachments)');
    console.log('\n🎉 Ready for Slack testing!');
  }
  
  return failed === 0;
}

// Run tests
(async () => {
  try {
    const allPass = await testOpportunityCreation();
    
    if (allPass) {
      console.log('\n\n' + '='.repeat(70));
      console.log('\n🚀 SLACK TESTING GUIDE\n');
      console.log('='.repeat(70));
      console.log('\nTest in Slack after deployment:\n');
      
      console.log('1️⃣  Simple mode (all defaults):');
      console.log('   @gtm-brain create an opp for GTM Test Account');
      console.log('   Expected: Creates with $300k, Stage 1, +150 days, Revenue type\n');
      
      console.log('2️⃣  Partial custom (stage and ACV only):');
      console.log('   @gtm-brain create an opp for GTM Test Account. stage 4 and $500k acv');
      console.log('   Expected: Stage 4, $500k ACV, other fields use defaults\n');
      
      console.log('3️⃣  Full custom (all fields mentioned):');
      console.log('   @gtm-brain create an opp for GTM Test Account. stage 2 and $400k acv and target sign of 12/31/2025');
      console.log('   Expected: Uses all your values, no defaults\n');
      
      console.log('4️⃣  Check Salesforce after EACH test:');
      console.log('   • Verify correct account attached');
      console.log('   • Check ACV__c field');
      console.log('   • Check Amount field (should match ACV)');
      console.log('   • Check TCV__c = 300000');
      console.log('   • Check Target_LOI_Date__c');
      console.log('   • Check CloseDate (should match Target Sign)');
      console.log('   • Check LeadSource = Inbound');
      console.log('   • Check Probability matches stage');
      console.log('\n' + '='.repeat(70));
    }
    
    process.exit(allPass ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
})();

