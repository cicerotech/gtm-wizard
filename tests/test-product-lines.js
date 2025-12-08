#!/usr/bin/env node
require('dotenv').config();

async function testProductLines() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Get all unique product line values
  const soql = `SELECT Product_Line__c, COUNT(Id) cnt
                FROM Opportunity 
                WHERE Product_Line__c != null AND IsClosed = false
                GROUP BY Product_Line__c
                ORDER BY COUNT(Id) DESC`;

  console.log('Product Line values in Salesforce:\n');
  const result = await query(soql, false);
  
  result.records.forEach(r => {
    console.log(`"${r.Product_Line__c}" - ${r.cnt} deals`);
  });

  // Test M&A specifically
  console.log('\n\nTesting M&A query:');
  const maQuery = `SELECT Name, Product_Line__c, StageName 
                   FROM Opportunity 
                   WHERE Product_Line__c = 'M&A' AND StageName = 'Stage 4 - Proposal' AND IsClosed = false
                   LIMIT 5`;
  
  const maResult = await query(maQuery, false);
  console.log(`Found ${maResult.totalSize} M&A deals in Stage 4`);

  process.exit(0);
}

testProductLines();
