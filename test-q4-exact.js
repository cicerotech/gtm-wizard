#!/usr/bin/env node
require('dotenv').config();

async function testQ4() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  console.log('Testing Q4 weighted pipeline...\n');

  // Test different quarter filters
  const queries = [
    {
      name: 'THIS_QUARTER on Target_LOI_Date__c',
      soql: `SELECT StageName, SUM(ACV__c) Gross, SUM(Finance_Weighted_ACV__c) Weighted, COUNT(Id) Deals
             FROM Opportunity
             WHERE IsClosed = false AND Target_LOI_Date__c = THIS_QUARTER
             GROUP BY StageName`
    },
    {
      name: 'THIS_FISCAL_QUARTER on Target_LOI_Date__c',
      soql: `SELECT StageName, SUM(ACV__c) Gross, SUM(Finance_Weighted_ACV__c) Weighted, COUNT(Id) Deals
             FROM Opportunity
             WHERE IsClosed = false AND Target_LOI_Date__c = THIS_FISCAL_QUARTER
             GROUP BY StageName`
    },
    {
      name: 'Explicit Q4 2025 dates',
      soql: `SELECT StageName, SUM(ACV__c) Gross, SUM(Finance_Weighted_ACV__c) Weighted, COUNT(Id) Deals
             FROM Opportunity
             WHERE IsClosed = false 
               AND Target_LOI_Date__c >= 2025-10-01 
               AND Target_LOI_Date__c <= 2025-12-31
             GROUP BY StageName`
    }
  ];

  for (const test of queries) {
    console.log(`\n${test.name}:`);
    console.log('─'.repeat(70));
    
    try {
      const result = await query(test.soql, false);
      let totalDeals = 0;
      let totalGross = 0;
      let totalWeighted = 0;
      
      result.records.forEach(r => {
        totalDeals += r.Deals || 0;
        totalGross += r.Gross || 0;
        totalWeighted += r.Weighted || 0;
        console.log(`  ${r.StageName}: ${r.Deals} deals, $${(r.Gross/1000000).toFixed(1)}M gross, $${(r.Weighted/1000000).toFixed(2)}M weighted`);
      });
      
      console.log(`\nTOTAL: ${totalDeals} deals, $${(totalGross/1000000).toFixed(1)}M gross, $${(totalWeighted/1000000).toFixed(2)}M weighted`);
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message.substring(0, 100)}`);
    }
  }

  process.exit(0);
}

testQ4();
