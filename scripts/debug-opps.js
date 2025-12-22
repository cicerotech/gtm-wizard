require('dotenv').config();
const jsforce = require('jsforce');

async function main() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
  });
  
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  
  console.log('Connected to Salesforce');
  
  // Query for specific IDs we want to update
  const testIds = [
    '006Wj00000MDige',
    '006Wj00000MDilP',
    '006Wj00000MDjhz',
    '006Wj00000MDilL',
  ];
  
  const query = `SELECT Id, Name, Term__c, Product_Line__c FROM Opportunity WHERE Id IN ('${testIds.join("','")}')`;
  console.log('\nQuery:', query);
  
  const result = await conn.query(query);
  console.log('\nFound records:', result.totalSize);
  result.records.forEach(r => {
    console.log(`  ID: ${r.Id}`);
    console.log(`  Name: ${r.Name}`);
    console.log(`  Term: ${r.Term__c}`);
    console.log(`  Product Line: ${r.Product_Line__c}`);
    console.log('---');
  });
  
  // Now query by name pattern to find the actual records
  console.log('\nSearching by name patterns...');
  const nameQuery = `SELECT Id, Name, Term__c, Product_Line__c, Account.Name 
    FROM Opportunity 
    WHERE Name LIKE '%BOI Tracker%' 
       OR Name LIKE '%Elizabeth Agbaje%'
       OR Name LIKE '%Himanshu%'
       OR Name LIKE '%Privacy Support%'
    LIMIT 20`;
  
  const nameResult = await conn.query(nameQuery);
  console.log(`Found ${nameResult.totalSize} by name pattern:`);
  nameResult.records.forEach(r => {
    console.log(`  ${r.Id} | ${r.Account?.Name} | ${r.Name?.substring(0, 60)}`);
  });
  
  await conn.logout();
}

main().catch(err => console.error('Error:', err.message));

