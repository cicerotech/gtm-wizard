#!/usr/bin/env node

require('dotenv').config();

async function testWeekCreated() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  const soql = `SELECT Id, Name, CreatedDate, Week_Created__c, Owner.Name
                FROM Opportunity 
                ORDER BY CreatedDate DESC
                LIMIT 10`;

  console.log('Querying recent opportunities to see Week_Created__c format...\n');

  try {
    const result = await query(soql, false);
    console.log(`Found ${result.totalSize} records\n`);
    
    result.records.forEach((record, i) => {
      console.log(`${i + 1}. ${record.Name}`);
      console.log(`   CreatedDate: ${record.CreatedDate}`);
      console.log(`   Week_Created__c: ${record.Week_Created__c || 'NULL'}`);
      console.log('');
    });

    // Figure out this week's format
    const today = new Date();
    const weekNum = getWeekNumber(today);
    const year = today.getFullYear();
    console.log(`\nCurrent week should be: Week ${weekNum} of ${year} or similar format`);
    console.log(`Check above to see what format Week_Created__c uses.`);
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  process.exit(0);
}

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

testWeekCreated();

