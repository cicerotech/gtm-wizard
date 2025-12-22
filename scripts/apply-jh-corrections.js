#!/usr/bin/env node
/**
 * Apply Johnson Hana Contract Reconciliation Corrections to Salesforce
 * This script updates Opportunity records with corrected Term, Product Line, and Revenue Type values
 */

require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');
const path = require('path');

// Corrections data extracted from reconciliation
const corrections = [
  // BOI
  {
    Id: '006Wj00000MDige',
    Name: 'BOI Tracker Mortgage #2',
    Term__c: 24,
    Product_Line__c: 'Litigation',
    notes: 'Contract shows 24 months (Mar 2024 - Mar 2026)'
  },
  
  // OpenAI
  {
    Id: '006Wj00000MDilP',
    Name: 'OpenAI - Privacy Team Expansion - Elizabeth Agbaje',
    Product_Line__c: 'Privacy',
    notes: 'Nerea Pérez & Elizabeth Agbaje SOW - Privacy Support'
  },
  {
    Id: '006Wj00000MDjhz',
    Name: 'OpenAI Privacy team expansion - Himanshu Gaur',
    Product_Line__c: 'Privacy',
    notes: 'Himanshu Guar SOW'
  },
  {
    Id: '006Wj00000MDilL',
    Name: 'Open ai Data Privacy Support',
    Term__c: 24,
    Product_Line__c: 'Privacy',
    notes: 'Feb 2024 SOW - 24 months (Feb 2024 - Feb 2026)'
  },
  
  // Stripe
  {
    Id: '006Wj00000MDirh',
    Name: 'Stripe RFP Privacy ODL (Ext 19.12.2025) Victoria Byrne',
    Product_Line__c: 'Privacy',
    notes: 'Victoria Byrne SOW - Privacy'
  },
  
  // Irish Water - Already has Contracting-BAU, skip Product Line update
  {
    Id: '006Wj00000MDisi',
    Name: 'Uisce Eireann CDS Amal Elbay extension August December',
    // Product_Line__c is already 'Contracting-BAU' - correct for CDS work
    notes: 'Amal Elbay CDS Support Jul-Dec 2025'
  },
  {
    Id: '006Wj00000MDisl',
    Name: 'Uisce Eireann CDS Luke Sexton extension August December',
    Term__c: 5,
    // Product_Line__c is already 'Contracting-BAU' - correct for CDS work
    notes: 'Luke Sexton CDS Support Jul-Dec 2025'
  },
  {
    Id: '006Wj00000MDisk',
    Name: 'Uisce Eireann CDS Jamie O\'Gorman extension August December',
    // Product_Line__c is already 'Contracting-BAU' - correct for CDS work
    notes: 'Jamie O\'Gorman CDS Support Jul-Dec 2025'
  },
  
  // Indeed
  {
    Id: '006Wj00000MDjhs',
    Name: 'Indeed ODL (Helen Hewson)',
    Product_Line__c: 'Contracting', // Valid picklist value
    notes: 'Helen Hewson SOW'
  },
  {
    Id: '006Wj00000MDjht',
    Name: 'Indeed ODL Steph Donald extension #1',
    Term__c: 6,
    Product_Line__c: 'Contracting', // Valid picklist value
    notes: 'Stephanie Donald SOW Oct 2025 - Apr 2026'
  },
  
  // ESB
  {
    Id: '006Wj00000MDjim',
    Name: 'ESB NSIC Project No1 Consultant Ext 4 Annabel Caldwell',
    Term__c: 6,
    Product_Line__c: 'Contracting-BAU', // Valid picklist value for ongoing project work
    notes: 'Simon Downey & Annabel Caldwell Oct 2025 - May 2026'
  },
  
  // Tinder
  {
    Id: '006Wj00000MDisO',
    Name: 'Tinder Commercial Contract ODL - Extension 1 - Donall O\'Riordan',
    Product_Line__c: 'Contracting-BAU', // Valid picklist value
    notes: 'Donall O\'Riordan SOW'
  },
  
  // TikTok
  {
    Id: '006Wj00000MDisG',
    Name: 'TikTok DSAR Support ODL Extension 1 Tara Bannon',
    Product_Line__c: 'DSAR',
    notes: 'Tara Bannon DSAR Support Jul-Dec 2025'
  },
  
  // Etsy
  {
    Id: '006Wj00000LbDRi',
    Name: 'Etsy Privacy Support Eleanor Power Extension Jan 2026',
    Product_Line__c: 'Privacy',
    notes: 'Eleanor Power Privacy Support Jan-Jun 2026'
  },
  
  // Airbnb
  {
    Id: '006Wj00000MDigK',
    Name: 'Airbnb Privacy Support - Replacement ODL - Erica Gomes',
    Product_Line__c: 'Privacy',
    notes: 'Erica Gomes Nov 2025 - Mar 2026'
  },
];

async function main() {
  console.log('=' .repeat(80));
  console.log('JOHNSON HANA CONTRACT CORRECTIONS - SALESFORCE UPDATE');
  console.log('=' .repeat(80));
  
  // Connect to Salesforce
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
  });
  
  console.log('\n📡 Connecting to Salesforce...');
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  console.log('✅ Connected to Salesforce');
  console.log(`   Instance: ${conn.instanceUrl}`);
  
  // First, verify the opportunities exist
  console.log('\n🔍 Verifying opportunities...');
  const oppIds = corrections.map(c => c.Id);
  const query = `SELECT Id, Name, Term__c, Product_Line__c, Revenue_Type__c FROM Opportunity WHERE Id IN ('${oppIds.join("','")}')`;
  
  const result = await conn.query(query);
  console.log(`   Found ${result.records.length} of ${corrections.length} opportunities`);
  
  // Create map of existing records - use 15-char ID for matching
  const existingMap = {};
  result.records.forEach(r => {
    // Store by both 15 and 18 char IDs for matching
    existingMap[r.Id] = r;
    existingMap[r.Id.substring(0, 15)] = r;
  });
  
  // Show what will be updated
  console.log('\n📋 UPDATES TO APPLY:');
  console.log('-'.repeat(80));
  
  const updates = [];
  for (const correction of corrections) {
    const existing = existingMap[correction.Id];
    if (!existing) {
      console.log(`⚠️  ${correction.Id} (${correction.Name}) - NOT FOUND IN SALESFORCE`);
      continue;
    }
    
    console.log(`\n✓ Found: ${existing.Name}`);
    console.log(`   ID: ${correction.Id}`);
    
    const update = { Id: correction.Id };
    const changes = [];
    
    if (correction.Term__c && existing.Term__c !== correction.Term__c) {
      update.Term__c = correction.Term__c;
      changes.push(`Term: ${existing.Term__c} → ${correction.Term__c}`);
    }
    
    if (correction.Product_Line__c && existing.Product_Line__c !== correction.Product_Line__c) {
      update.Product_Line__c = correction.Product_Line__c;
      changes.push(`Product Line: ${existing.Product_Line__c || 'null'} → ${correction.Product_Line__c}`);
    }
    
    if (changes.length > 0) {
      updates.push(update);
      changes.forEach(c => console.log(`   → ${c}`));
    } else {
      console.log(`   ✓ Already correct`);
    }
  }
  
  if (updates.length === 0) {
    console.log('\n✅ No updates needed - all records are already correct!');
    return;
  }
  
  // Apply updates
  console.log('\n' + '='.repeat(80));
  console.log(`🔄 APPLYING ${updates.length} UPDATES...`);
  console.log('='.repeat(80));
  
  // Process in batches of 10
  const batchSize = 10;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    try {
      const results = await conn.sobject('Opportunity').update(batch);
      
      results.forEach((res, idx) => {
        const update = batch[idx];
        if (res.success) {
          console.log(`✅ Updated: ${update.Id}`);
          successCount++;
        } else {
          console.log(`❌ Failed: ${update.Id} - ${res.errors.join(', ')}`);
          errorCount++;
        }
      });
    } catch (err) {
      console.error(`❌ Batch error: ${err.message}`);
      errorCount += batch.length;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successful updates: ${successCount}`);
  console.log(`❌ Failed updates: ${errorCount}`);
  console.log(`📊 Total processed: ${updates.length}`);
  
  // Log to file
  const logPath = '/Users/keiganpesenti/Desktop/JH_SF_Update_Log.json';
  const logData = {
    timestamp: new Date().toISOString(),
    successCount,
    errorCount,
    updates: updates.map(u => ({ Id: u.Id, changes: u }))
  };
  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  console.log(`\n📁 Log saved to: ${logPath}`);
  
  await conn.logout();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

