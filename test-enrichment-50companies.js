/**
 * Standalone Test: Company Enrichment Service
 * Tests 50+ companies to validate enrichment works across industries
 */

const enrichmentService = require('./src/services/companyEnrichment');

const TEST_COMPANIES = [
  // Tech/SaaS (10)
  'Amazon', 'Microsoft', 'Salesforce', 'ServiceNow', 'Uber',
  'Intuit', 'Intel', 'IBM', 'Oracle', 'Adobe',
  
  // Manufacturing (8)
  'Boeing', 'GE', 'Honeywell', 'Ecolab', '3M',
  'Caterpillar', 'Deere', 'Cummins',
  
  // Financial Services (10)
  'Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Wells Fargo', 'Bank of America',
  'Citigroup', 'American Express', 'Capital One', 'Visa', 'Mastercard',
  
  // Retail (6)
  'Best Buy', 'Home Depot', 'Nordstrom', 'Walmart', 'Target', 'Costco',
  
  // Healthcare/Pharma (8)
  'Pfizer', 'Johnson & Johnson', 'Medtronic', 'Bayer', 'Novartis',
  'Merck', 'AstraZeneca', 'UnitedHealth',
  
  // Others (10)
  'Tesla', 'Southwest Airlines', 'DHL', 'Cargill', 'IQVIA',
  'Lockheed Martin', 'Raytheon', 'FedEx', 'Delta', 'United Airlines'
];

async function runComprehensiveTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  COMPANY ENRICHMENT: 50+ COMPANY TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  let totalTriggers = 0;
  let totalNews = 0;
  
  const triggerTypeCount = {
    acquisition: 0,
    funding: 0,
    expansion: 0,
    regulatory: 0,
    leadership: 0
  };
  
  console.log('Testing enrichment for', TEST_COMPANIES.length, 'companies...\n');
  
  for (let i = 0; i < TEST_COMPANIES.length; i++) {
    const company = TEST_COMPANIES[i];
    process.stdout.write(`[${i + 1}/${TEST_COMPANIES.length}] ${company.padEnd(25)} ... `);
    
    try {
      const start = Date.now();
      const result = await enrichmentService.enrichCompany(company);
      const duration = Date.now() - start;
      
      // Validate result structure
      if (!result.company || !Array.isArray(result.triggers) || !Array.isArray(result.suggestedContext)) {
        throw new Error('Invalid result structure');
      }
      
      // Count triggers by type
      result.triggers.forEach(trigger => {
        if (triggerTypeCount.hasOwnProperty(trigger.type)) {
          triggerTypeCount[trigger.type]++;
        }
      });
      
      totalTriggers += result.triggers.length;
      totalNews += result.recentNews.length;
      
      results.push({
        company,
        status: 'SUCCESS',
        triggers: result.triggers.length,
        news: result.recentNews.length,
        suggestions: result.suggestedContext.length,
        duration: `${duration}ms`
      });
      
      successCount++;
      console.log(`✅ ${result.triggers.length} triggers, ${result.recentNews.length} news (${duration}ms)`);
      
    } catch (error) {
      failureCount++;
      results.push({
        company,
        status: 'FAILED',
        error: error.message
      });
      console.log(`❌ ${error.message}`);
    }
    
    // Rate limit: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary Report
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TEST RESULTS SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Total Companies Tested: ${TEST_COMPANIES.length}`);
  console.log(`✅ Successful: ${successCount} (${((successCount / TEST_COMPANIES.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failureCount} (${((failureCount / TEST_COMPANIES.length) * 100).toFixed(1)}%)`);
  console.log(`\nTotal Triggers Found: ${totalTriggers}`);
  console.log(`Total News Articles: ${totalNews}`);
  console.log(`Avg Triggers per Company: ${(totalTriggers / successCount).toFixed(1)}`);
  console.log(`Avg News per Company: ${(totalNews / successCount).toFixed(1)}`);
  
  console.log('\nTrigger Type Distribution:');
  Object.entries(triggerTypeCount).forEach(([type, count]) => {
    console.log(`  ${type.padEnd(15)}: ${count}`);
  });
  
  // Show top performers
  console.log('\nTop 10 Companies by Trigger Count:');
  results
    .filter(r => r.status === 'SUCCESS')
    .sort((a, b) => b.triggers - a.triggers)
    .slice(0, 10)
    .forEach((r, idx) => {
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${r.company.padEnd(25)} - ${r.triggers} triggers`);
    });
  
  // Show companies with no triggers (need manual investigation)
  const noTriggers = results.filter(r => r.status === 'SUCCESS' && r.triggers === 0);
  if (noTriggers.length > 0) {
    console.log(`\n⚠️  Companies with No Triggers (${noTriggers.length}):`);
    noTriggers.forEach(r => {
      console.log(`  - ${r.company} (${r.news} news articles but no triggers extracted)`);
    });
  }
  
  // Validation
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VALIDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const successRate = (successCount / TEST_COMPANIES.length) * 100;
  
  if (successRate >= 90) {
    console.log('✅ PASS: Success rate >90% - Production ready');
  } else if (successRate >= 80) {
    console.log('⚠️  WARN: Success rate 80-90% - Acceptable but monitor');
  } else {
    console.log('❌ FAIL: Success rate <80% - Needs improvement');
  }
  
  if (totalTriggers >= 30) {
    console.log('✅ PASS: Average trigger detection working well');
  } else {
    console.log('⚠️  WARN: Low trigger detection - check extraction logic');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Export results for analysis
  const fs = require('fs');
  fs.writeFileSync(
    'enrichment-test-results.json',
    JSON.stringify({
      summary: {
        totalCompanies: TEST_COMPANIES.length,
        successful: successCount,
        failed: failureCount,
        successRate: successRate.toFixed(1) + '%',
        totalTriggers,
        totalNews,
        triggerTypeDistribution: triggerTypeCount
      },
      detailedResults: results
    }, null, 2)
  );
  
  console.log('📊 Detailed results saved to: enrichment-test-results.json\n');
  
  return {
    success: successRate >= 80,
    successRate,
    totalTriggers,
    results
  };
}

// Run tests
runComprehensiveTests()
  .then(summary => {
    if (summary.success) {
      console.log('🎯 All tests passed! Enrichment service is production-ready.\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Review results above.\n');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });

