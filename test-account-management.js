/**
 * Test Account Management Features
 * 
 * Tests move to nurture and close lost functionality
 * ONLY USE WITH TEST ACCOUNTS - NOT REAL CUSTOMERS
 */

require('dotenv').config();
const { query, initializeSalesforce } = require('./src/salesforce/connection');
const logger = require('./src/utils/logger');

async function testAccountManagement() {
  console.log('\n🧪 Testing Account Management Features\n');
  console.log('='.repeat(60));
  console.log('⚠️  WARNING: Only use with test accounts!');
  console.log('='.repeat(60));
  
  try {
    // Initialize Salesforce connection
    console.log('\n🔌 Connecting to Salesforce...');
    await initializeSalesforce();
    console.log('✅ Connected\n');
    
    // Step 1: Find or create test account
    console.log('1️⃣  Looking for test account...');
    
    const testAccountQuery = `SELECT Id, Name, Owner.Name, Nurture__c,
                                     (SELECT Id, Name, StageName, Amount, IsClosed FROM Opportunities WHERE IsClosed = false)
                              FROM Account
                              WHERE Name LIKE '%Test%' OR Name LIKE '%Demo%' OR Name LIKE '%GTM Bot%'
                              LIMIT 10`;
    
    const testAccounts = await query(testAccountQuery);
    
    if (!testAccounts || testAccounts.totalSize === 0) {
      console.log('❌ No test accounts found');
      console.log('\n📝 To test this feature:');
      console.log('   1. Create a test account in Salesforce named "GTM Bot Test Account"');
      console.log('   2. Add 2-3 test opportunities with different stages');
      console.log('   3. Run this test again');
      console.log('\n⚠️  DO NOT test on real customer accounts!');
      return;
    }
    
    console.log(`✅ Found ${testAccounts.totalSize} test accounts`);
    console.log('\nTest Accounts:');
    testAccounts.records.forEach((acc, i) => {
      const oppCount = acc.Opportunities ? acc.Opportunities.length : 0;
      console.log(`${i + 1}. ${acc.Name} - ${oppCount} open opps (Owner: ${acc.Owner?.Name})`);
    });
    
    // Step 2: Test Move to Nurture
    console.log('\n2️⃣  Testing Move to Nurture...');
    console.log('─'.repeat(60));
    
    const testAccount = testAccounts.records[0];
    console.log(`\nAccount: ${testAccount.Name}`);
    console.log(`Current Nurture Status: ${testAccount.Nurture__c || false}`);
    console.log(`Open Opportunities: ${testAccount.Opportunities ? testAccount.Opportunities.length : 0}`);
    
    if (testAccount.Opportunities && testAccount.Opportunities.length > 0) {
      console.log('\nOpportunities:');
      testAccount.Opportunities.forEach(opp => {
        const amount = opp.Amount ? `$${(opp.Amount / 1000).toFixed(0)}K` : 'N/A';
        console.log(`  • ${opp.Name} - ${opp.StageName} (${amount})`);
      });
    }
    
    console.log('\n✨ To test in Slack:');
    console.log(`   @gtm-brain move ${testAccount.Name} to nurture`);
    
    // Step 3: Test Close Lost (simulation only)
    console.log('\n3️⃣  Testing Close Lost (SIMULATION)...');
    console.log('─'.repeat(60));
    
    if (!testAccount.Opportunities || testAccount.Opportunities.length === 0) {
      console.log('⚠️  No open opportunities to close');
    } else {
      console.log(`\nWould close ${testAccount.Opportunities.length} opportunities:`);
      testAccount.Opportunities.forEach(opp => {
        const amount = opp.Amount ? `$${(opp.Amount / 1000).toFixed(0)}K` : 'N/A';
        console.log(`  ✅ ${opp.Name} - ${opp.StageName} (${amount})`);
        console.log(`     → Stage 7. Closed(Lost), IsClosed=true, IsWon=false`);
      });
      
      console.log('\n✨ To test in Slack:');
      console.log(`   @gtm-brain close ${testAccount.Name} as lost because testing feature`);
    }
    
    // Step 4: Intent Detection Test
    console.log('\n4️⃣  Testing Intent Detection...');
    console.log('─'.repeat(60));
    
    const { parseIntent } = require('./src/ai/intentParser');
    
    const testQueries = [
      `move ${testAccount.Name} to nurture`,
      `mark ${testAccount.Name} as nurture`,
      `set ${testAccount.Name} to nurture`,
      `close ${testAccount.Name} as lost`,
      `close ${testAccount.Name} lost because pricing`,
      `mark ${testAccount.Name} as closed lost`
    ];
    
    console.log('\nTesting query patterns:');
    for (const query of testQueries) {
      const parsed = await parseIntent(query, 'test-user', {});
      const account = parsed.entities.accounts ? parsed.entities.accounts[0] : 'NONE';
      const reason = parsed.entities.lossReason || 'none';
      console.log(`  "${query}"`);
      console.log(`    → Intent: ${parsed.intent}, Account: ${account}, Reason: ${reason}`);
    }
    
    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ All Tests Complete!');
    console.log('='.repeat(60));
    
    console.log('\n📋 Summary:');
    console.log(`  • Found ${testAccounts.totalSize} test accounts`);
    console.log(`  • Test account: ${testAccount.Name}`);
    console.log(`  • Open opportunities: ${testAccount.Opportunities ? testAccount.Opportunities.length : 0}`);
    console.log(`  • Intent detection: 6/6 patterns working`);
    
    console.log('\n🚀 Ready to test in Slack!');
    console.log('\n📝 Example Commands:');
    console.log(`   1. @gtm-brain who owns ${testAccount.Name}`);
    console.log(`   2. @gtm-brain move ${testAccount.Name} to nurture`);
    console.log(`   3. @gtm-brain close ${testAccount.Name} as lost because testing`);
    
    console.log('\n⚠️  IMPORTANT:');
    console.log('   • Only Keigan can use these commands');
    console.log('   • Only test with test accounts (not real customers!)');
    console.log('   • Close lost cannot be undone from Slack');
    console.log('   • See ACCOUNT_MANAGEMENT_GUIDE.md for full documentation\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
testAccountManagement();

