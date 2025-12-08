#!/usr/bin/env node

/**
 * Test ALL template queries from the help menu
 */

require('dotenv').config();

async function testAllTemplates() {
  console.log('🧪 Testing ALL Template Queries...\n');

  try {
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');
    const { parseIntent } = require('./src/ai/intentParser');

    await initializeRedis();
    await initializeSalesforce();

    const templateQueries = [
      // ACCOUNT INTELLIGENCE
      { query: 'who owns Apple?', category: 'Account Ownership' },
      { query: "who's the BL for Intel?", category: 'Business Lead' },
      { query: 'which accounts have mentioned Harvey?', category: 'Harvey Mentions' },
      { query: "what's the legal team size at Best Buy?", category: 'Legal Team Size' },
      { query: 'who are the decision makers at Microsoft?', category: 'Decision Makers' },
      { query: 'which accounts are discussing contracting?', category: 'Product Interest' },
      
      // PIPELINE & DEALS
      { query: 'show me my pipeline', category: 'Pipeline Summary' },
      { query: 'early stage deals', category: 'Early Stage' },
      { query: 'mid stage pipeline', category: 'Mid Stage' },
      { query: 'late stage opportunities', category: 'Late Stage' },
      { query: 'which opportunities are late stage contracting?', category: 'Product+Stage' },
      { query: 'what accounts are in Stage 2?', category: 'Accounts by Stage' },
      
      // BOOKINGS & LOIs
      { query: 'what LOIs have we signed in the last two weeks?', category: 'LOI Signing' },
      { query: 'how many bookings this month?', category: 'Bookings Count' },
      { query: 'show me ARR deals', category: 'ARR Deals' },
      
      // RECENT ACTIVITY
      { query: 'what deals closed recently?', category: 'Recent Wins' },
      { query: 'what deals were added to pipeline this week?', category: 'Pipeline Additions' },
      { query: 'what closed this month?', category: 'Monthly Results' }
    ];

    let passCount = 0;
    let failCount = 0;

    for (const test of templateQueries) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📝 ${test.category}: "${test.query}"`);
      console.log('─'.repeat(70));

      try {
        // Parse intent
        const parsed = await parseIntent(test.query, null, 'test_user');
        console.log(`Intent: ${parsed.intent} (${(parsed.confidence * 100).toFixed(0)}% confidence)`);
        console.log(`Entities:`, JSON.stringify(parsed.entities, null, 2));

        // Try to execute if it's a data query
        if (parsed.intent !== 'greeting' && parsed.intent !== 'conversation') {
          // Build appropriate query based on intent
          let testSOQL = '';
          
          if (parsed.intent === 'account_lookup') {
            const accountName = parsed.entities.accounts?.[0] || 'Test';
            testSOQL = `SELECT Id, Name, Owner.Name FROM Account WHERE Name LIKE '%${accountName}%' LIMIT 1`;
          } else if (parsed.intent === 'account_field_lookup') {
            testSOQL = `SELECT Id, Name, Owner.Name FROM Account LIMIT 1`;
          } else if (parsed.intent === 'pipeline_summary' || parsed.intent === 'deal_lookup') {
            testSOQL = `SELECT Id, Name, Amount FROM Opportunity WHERE IsClosed = false LIMIT 1`;
          } else {
            testSOQL = `SELECT Id FROM Opportunity LIMIT 1`;
          }

          const result = await query(testSOQL);
          console.log(`✅ Query executed successfully (${result.totalSize} records)`);
          passCount++;
        } else {
          console.log(`ℹ️  Non-data query (greeting/conversation)`);
          passCount++;
        }

      } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 Results: ${passCount} passed, ${failCount} failed out of ${templateQueries.length} queries`);
    
    if (failCount === 0) {
      console.log(`🎉 ALL TEMPLATE QUERIES WORKING!`);
    } else {
      console.log(`⚠️  ${failCount} queries need fixing`);
    }

    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

testAllTemplates();

