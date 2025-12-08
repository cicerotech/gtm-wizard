#!/usr/bin/env node

/**
 * Test account lookup functionality
 */

require('dotenv').config();

async function testAccountLookup() {
  console.log('🏢 Testing account lookup functionality...\n');

  try {
    // Initialize systems
    const { initializeRedis } = require('./src/utils/cache');
    const { initializeSalesforce, query } = require('./src/salesforce/connection');

    console.log('🔌 Initializing systems...');
    await initializeRedis();
    await initializeSalesforce();
    console.log('✅ Systems initialized\n');

    // Test account queries
    const testCompanies = ['Apple', 'Intel', 'IBM', 'Microsoft'];

    for (const company of testCompanies) {
      console.log(`🔍 Testing: "who owns ${company}?"`);
      console.log('─'.repeat(50));

      try {
        // Build the same query the bot would use
        const soql = `SELECT Id, Name, Owner.Name, Owner.Email, Industry 
                      FROM Account 
                      WHERE (Name = '${company}' 
                         OR Name = '${company} Corp' 
                         OR Name = '${company} Inc'
                         OR Name = '${company} LLC'
                         OR Name LIKE '${company}%'
                         OR Name LIKE '%${company}%')
                      ORDER BY Name
                      LIMIT 10`;

        console.log('Query:', soql.replace(/\s+/g, ' ').trim());

        const result = await query(soql);
        console.log(`Results: ${result.totalSize} accounts found`);

        if (result.records && result.records.length > 0) {
          const businessLeads = ['Julie Stefanich', 'Himanshu Agarwal', 'Asad Hussain', 'Ananth Cherukupally', 'David Van Ryk', 'John Cobb', 'Olivia Jung'];
          
          console.log('\nAll matches:');
          result.records.forEach((account, i) => {
            const isBusinessLead = businessLeads.includes(account.Owner?.Name);
            console.log(`  ${i + 1}. ${account.Name} → ${account.Owner?.Name || 'No Owner'} ${isBusinessLead ? '(Business Lead)' : '(Unassigned)'}`);
          });

          // Show what the bot would return
          const searchTerm = company.toLowerCase();
          const exactMatchBusinessLead = result.records.find(r => 
            r.Name.toLowerCase() === searchTerm && businessLeads.includes(r.Owner?.Name)
          );
          const exactMatch = result.records.find(r => r.Name.toLowerCase() === searchTerm);
          const partialMatchBusinessLead = result.records.find(r => 
            r.Name.toLowerCase().includes(searchTerm) && businessLeads.includes(r.Owner?.Name)
          );
          const primaryResult = exactMatchBusinessLead || exactMatch || partialMatchBusinessLead || result.records[0];

          console.log('\nBot would return:');
          console.log(`*${primaryResult.Name}*`);
          
          const isUnassigned = !businessLeads.includes(primaryResult.Owner?.Name);
          if (isUnassigned) {
            console.log(`Status: Unassigned account`);
            console.log(`Current holder: ${primaryResult.Owner?.Name || 'No owner'}`);
          } else {
            console.log(`Owner: ${primaryResult.Owner?.Name}`);
            console.log(`Email: ${primaryResult.Owner?.Email || 'No email available'}`);
          }
          
          if (primaryResult.Industry) console.log(`Industry: ${primaryResult.Industry}`);
        }

        console.log('✅ Success!\n');

      } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
      }
    }

    console.log('🎉 Account lookup tests completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAccountLookup();

