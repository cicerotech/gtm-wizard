#!/usr/bin/env node
require('dotenv').config();

async function testMarsh() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Find accounts with "Marsh" in the name
  const searchQuery = `SELECT Id, Name, Owner.Name 
                       FROM Account 
                       WHERE Name LIKE '%Marsh%'
                       LIMIT 10`;

  console.log('Searching for accounts with "Marsh"...\n');
  const result = await query(searchQuery, false);
  
  console.log(`Found ${result.totalSize} accounts:\n`);
  result.records.forEach(r => {
    console.log(`"${r.Name}" - Owner: ${r.Owner.Name}`);
  });

  process.exit(0);
}

testMarsh();
