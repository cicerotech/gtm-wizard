/**
 * Standalone Campfire Field Sync
 * 
 * Uses jsforce directly to query SF, bypassing gtm-brain connection issues.
 * 
 * Usage: node scripts/sync-campfire-standalone.js [--dry-run] [--limit=N]
 */

require('dotenv').config();
const jsforce = require('jsforce');

const CAMPFIRE_API_KEY = process.env.CAMPFIRE_API_KEY;
const CAMPFIRE_BASE_URL = 'https://api.meetcampfire.com';

const SF_USERNAME = process.env.SF_USERNAME;
const SF_PASSWORD = process.env.SF_PASSWORD;
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN;
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;

async function connectToSalesforce() {
  console.log('🔐 Connecting to Salesforce...');
  
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
  
  await conn.login(SF_USERNAME, SF_PASSWORD + SF_SECURITY_TOKEN);
  console.log('   ✅ Connected to Salesforce');
  
  return conn;
}

async function fetchCampfireContracts() {
  console.log('📥 Fetching Campfire contracts...');
  
  let allContracts = [];
  let nextUrl = `${CAMPFIRE_BASE_URL}/rr/api/v1/contracts`;
  
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        'Authorization': `Token ${CAMPFIRE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Campfire API error: ${response.status}`);
    }
    
    const data = await response.json();
    allContracts = allContracts.concat(data.results || []);
    nextUrl = data.next;
  }
  
  console.log(`   Found ${allContracts.length} Campfire contracts`);
  return allContracts;
}

async function fetchSalesforceContracts(conn) {
  console.log('📥 Fetching Salesforce contracts...');
  
  const soql = `
    SELECT Id, Contract_Name_Campfire__c, Contract_Owner__c, Pod__c, Account.Name
    FROM Contract
    WHERE Id != null
  `;
  
  const result = await conn.query(soql);
  console.log(`   Found ${result.records.length} SF contracts`);
  return result.records;
}

async function updateCampfireContract(contractId, updates) {
  if (DRY_RUN) {
    return { success: true, dryRun: true };
  }
  
  const response = await fetch(`${CAMPFIRE_BASE_URL}/rr/api/v1/contracts/${contractId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Token ${CAMPFIRE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `${response.status}: ${errorText.slice(0, 100)}` };
  }
  
  return { success: true };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Campfire Field Sync (Standalone)');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE' : '⚡ LIVE MODE');
  if (LIMIT) console.log(`📊 Limiting to ${LIMIT} updates`);
  console.log('='.repeat(60));
  
  try {
    const sfConn = await connectToSalesforce();
    const campfireContracts = await fetchCampfireContracts();
    const sfContracts = await fetchSalesforceContracts(sfConn);
    
    // Create lookup: SF Contract Id -> SF data
    const sfMap = new Map();
    for (const sf of sfContracts) {
      sfMap.set(sf.Id, sf);
    }
    
    const results = { updated: 0, skipped: 0, errors: 0, noMatch: 0 };
    let updateCount = 0;
    
    console.log('\n🔄 Processing contracts...\n');
    
    for (const cf of campfireContracts) {
      if (LIMIT && updateCount >= LIMIT) break;
      
      const sfContract = sfMap.get(cf.deal_id);
      
      if (!sfContract) {
        results.noMatch++;
        continue;
      }
      
      const consultantValue = sfContract.Contract_Owner__c;
      
      // Skip if no update needed
      if (!consultantValue || cf.consultant === consultantValue) {
        results.skipped++;
        continue;
      }
      
      console.log(`📝 ${cf.deal_name}`);
      console.log(`   Setting consultant: "${consultantValue}"`);
      
      const result = await updateCampfireContract(cf.id, { consultant: consultantValue });
      
      if (result.success) {
        results.updated++;
        updateCount++;
        console.log(`   ✅ ${result.dryRun ? '(dry run)' : 'Updated'}`);
      } else {
        results.errors++;
        console.log(`   ❌ ${result.error}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Updated: ${results.updated}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);
    console.log(`❌ Errors:  ${results.errors}`);
    console.log(`❓ No Match: ${results.noMatch}`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();




