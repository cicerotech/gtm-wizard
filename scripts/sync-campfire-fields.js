/**
 * Sync Campfire Fields from Salesforce
 * 
 * Updates Campfire contracts with:
 * - consultant: from SF Contract_Owner__c (BL picklist)
 * - Note: department/Pod requires further investigation (may need ID not string)
 * 
 * Usage: node scripts/sync-campfire-fields.js [--dry-run]
 */

require('dotenv').config();
const { query } = require('../src/salesforce/connection');

const CAMPFIRE_API_KEY = process.env.CAMPFIRE_API_KEY || '91d539b2946b6959458348fb320ce842206d78a580c0a58680af2c22fec1397b';
const CAMPFIRE_BASE_URL = 'https://api.meetcampfire.com';

const DRY_RUN = process.argv.includes('--dry-run');

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
    nextUrl = data.next; // Handle pagination
  }
  
  console.log(`   Found ${allContracts.length} Campfire contracts`);
  return allContracts;
}

async function fetchSalesforceContracts() {
  console.log('📥 Fetching Salesforce contracts...');
  
  const soql = `
    SELECT Id, Contract_Name_Campfire__c, Contract_Owner__c, Pod__c, Account.Name
    FROM Contract
    WHERE Status = 'Activated'
  `;
  
  const result = await query(soql);
  console.log(`   Found ${result.records.length} SF contracts`);
  return result.records;
}

async function updateCampfireContract(contractId, updates) {
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would update contract ${contractId}:`, updates);
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
    return { success: false, error: `${response.status}: ${errorText.slice(0, 200)}` };
  }
  
  return { success: true, data: await response.json() };
}

async function main() {
  console.log('=' .repeat(60));
  console.log('Campfire Field Sync from Salesforce');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '⚡ LIVE MODE');
  console.log('=' .repeat(60));
  
  try {
    // Fetch data from both systems
    const campfireContracts = await fetchCampfireContracts();
    const sfContracts = await fetchSalesforceContracts();
    
    // Create lookup map: SF Contract Id -> SF Contract data
    const sfMap = new Map();
    for (const sf of sfContracts) {
      sfMap.set(sf.Id, sf);
    }
    
    // Process each Campfire contract
    const results = {
      updated: [],
      skipped: [],
      errors: [],
      noMatch: []
    };
    
    console.log('\n🔄 Processing contracts...\n');
    
    for (const cf of campfireContracts) {
      const dealId = cf.deal_id; // SF Contract Id
      const sfContract = sfMap.get(dealId);
      
      if (!sfContract) {
        results.noMatch.push({ campfireId: cf.id, dealId, dealName: cf.deal_name });
        continue;
      }
      
      // Determine what needs updating
      const updates = {};
      const consultantValue = sfContract.Contract_Owner__c;
      
      // Only update if SF has a value and Campfire is empty or different
      if (consultantValue && cf.consultant !== consultantValue) {
        updates.consultant = consultantValue;
      }
      
      // Skip if nothing to update
      if (Object.keys(updates).length === 0) {
        results.skipped.push({ 
          campfireId: cf.id, 
          dealName: cf.deal_name,
          reason: 'Already synced or no SF value'
        });
        continue;
      }
      
      // Perform update
      console.log(`📝 Updating: ${cf.deal_name}`);
      console.log(`   Campfire ID: ${cf.id}, SF ID: ${dealId}`);
      console.log(`   Changes: consultant = "${updates.consultant}"`);
      
      const result = await updateCampfireContract(cf.id, updates);
      
      if (result.success) {
        results.updated.push({
          campfireId: cf.id,
          dealName: cf.deal_name,
          updates
        });
        console.log(`   ✅ Success`);
      } else {
        results.errors.push({
          campfireId: cf.id,
          dealName: cf.deal_name,
          error: result.error
        });
        console.log(`   ❌ Error: ${result.error}`);
      }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ Updated: ${results.updated.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Errors:  ${results.errors.length}`);
    console.log(`❓ No SF Match: ${results.noMatch.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      results.errors.forEach(e => console.log(`   - ${e.dealName}: ${e.error}`));
    }
    
    if (results.noMatch.length > 0 && results.noMatch.length <= 10) {
      console.log('\n❓ NO SF MATCH (first 10):');
      results.noMatch.slice(0, 10).forEach(e => console.log(`   - ${e.dealName} (${e.dealId})`));
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();



