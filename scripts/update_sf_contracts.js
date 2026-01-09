/**
 * Update Salesforce Contracts:
 * 1. Expired contracts (end date in past) → Status = 'Terminated'
 * 2. Draft contracts → Status = 'Activated'
 */

require('dotenv').config({ path: '/Users/keiganpesenti/revops_weekly_update/gtm-brain/.env' });
const jsforce = require('jsforce');

const SF_USERNAME = process.env.SF_USERNAME;
const SF_PASSWORD = process.env.SF_PASSWORD;
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN;
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

async function main() {
  console.log('Connecting to Salesforce...');
  
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
  
  try {
    await conn.login(SF_USERNAME, SF_PASSWORD + SF_SECURITY_TOKEN);
    console.log('✅ Connected to Salesforce\n');
  } catch (err) {
    console.error('❌ SF Connection failed:', err.message);
    console.log('\nGenerating CSV for Data Loader instead...');
    await generateCSV();
    return;
  }
  
  // Query all contracts
  const result = await conn.query(`
    SELECT Id, Contract_Name_Campfire__c, Status, EndDate, StartDate
    FROM Contract
    WHERE Status = 'Draft'
  `);
  
  console.log(`Found ${result.records.length} Draft contracts\n`);
  
  const today = new Date().toISOString().split('T')[0];
  const updates = [];
  
  for (const c of result.records) {
    const endDate = c.EndDate;
    let newStatus;
    
    if (endDate && endDate < today) {
      newStatus = 'Terminated'; // Expired
    } else {
      newStatus = 'Activated'; // Active
    }
    
    updates.push({
      Id: c.Id,
      Status: newStatus
    });
    
    console.log(`${c.Contract_Name_Campfire__c?.substring(0, 40) || c.Id}`);
    console.log(`  ${c.Status} → ${newStatus} (End: ${endDate || 'N/A'})`);
  }
  
  console.log(`\nUpdating ${updates.length} contracts...`);
  
  // Batch update
  const updateResult = await conn.sobject('Contract').update(updates);
  
  let success = 0, errors = 0;
  for (const r of updateResult) {
    if (r.success) success++;
    else {
      errors++;
      console.error('Error:', r.errors);
    }
  }
  
  console.log(`\n✅ Updated: ${success}, ❌ Errors: ${errors}`);
}

async function generateCSV() {
  // Fallback: generate CSV for manual Data Loader upload
  const fs = require('fs');
  
  console.log('Creating CSV template for Data Loader...');
  
  const csv = `Id,Status
"PASTE_CONTRACT_ID_1","Activated"
"PASTE_CONTRACT_ID_2","Terminated"
`;
  
  fs.writeFileSync('/Users/keiganpesenti/Desktop/Contract_Status_Update.csv', csv);
  console.log('✅ CSV template saved to Desktop/Contract_Status_Update.csv');
  console.log('\nYou need to:');
  console.log('1. Query contracts in SF to get IDs');
  console.log('2. Add IDs to the CSV with correct Status');
  console.log('3. Use Data Loader to update');
}

main().catch(console.error);

