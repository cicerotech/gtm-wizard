#!/usr/bin/env node
/**
 * Set all Delivery__c fields to Visible for ALL profiles
 * 
 * Usage: node scripts/setDeliveryFieldsVisible.js
 */

require('dotenv').config();
const jsforce = require('jsforce');

// Salesforce connection
const conn = new jsforce.Connection({
  loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
});

async function run() {
  console.log('🔐 Connecting to Salesforce...');
  
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  
  console.log('✅ Connected to Salesforce');
  console.log(`   Instance: ${conn.instanceUrl}`);
  
  // Step 1: Get all Delivery__c fields (excluding required fields - they're already visible)
  console.log('\n📋 Fetching Delivery__c fields...');
  const deliveryDesc = await conn.describe('Delivery__c');
  
  // Get required fields to skip (they can't be modified via API)
  const requiredFields = deliveryDesc.fields
    .filter(f => f.custom && f.name.endsWith('__c') && !f.nillable && f.createable)
    .map(f => f.name);
  
  console.log(`   Required fields (skipping - already visible): ${requiredFields.join(', ') || 'none'}`);
  
  const customFields = deliveryDesc.fields
    .filter(f => f.custom && f.name.endsWith('__c') && !requiredFields.includes(f.name))
    .map(f => f.name);
  
  console.log(`   Found ${customFields.length} custom fields to update:`);
  customFields.forEach(f => console.log(`   - ${f}`));
  
  // Step 2: Get all profiles
  console.log('\n👥 Fetching all profiles...');
  const profiles = await conn.query("SELECT Id, Name FROM Profile ORDER BY Name");
  console.log(`   Found ${profiles.records.length} profiles`);
  
  // Step 3: Build metadata for field permissions
  console.log('\n🔧 Building field permission updates...');
  
  // We need to use Metadata API to update Profile field permissions
  // Each profile needs fieldPermissions for each field
  
  const updates = [];
  
  for (const profile of profiles.records) {
    const profileName = profile.Name;
    
    // Build field permissions array for this profile
    const fieldPermissions = customFields.map(fieldName => ({
      field: `Delivery__c.${fieldName}`,
      readable: true,
      editable: true  // Also make editable
    }));
    
    updates.push({
      profileName,
      fieldPermissions
    });
  }
  
  console.log(`   Prepared updates for ${updates.length} profiles`);
  
  // Step 4: Apply updates using Metadata API
  console.log('\n⬆️  Applying field visibility updates...');
  
  // Use bulk approach - read each profile metadata, update, and deploy
  const metadata = conn.metadata;
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const update of updates) {
    try {
      // Read current profile metadata
      const profileApiName = update.profileName.replace(/ /g, '%20');
      
      // For standard profiles, we need to use their API names
      let apiName = update.profileName;
      
      // Common mappings for standard profiles
      const profileMappings = {
        'System Administrator': 'Admin',
        'Standard User': 'Standard',
        'Standard Platform User': 'StandardAul',
        'Solution Manager': 'SolutionManager',
        'Marketing User': 'MarketingProfile',
        'Contract Manager': 'ContractManager',
        'Read Only': 'ReadOnly',
        'Chatter Free User': 'ChatterFreeUser',
        'Chatter Moderator User': 'ChatterModeratorUser',
        'Chatter External User': 'ChatterExternalUser'
      };
      
      if (profileMappings[update.profileName]) {
        apiName = profileMappings[update.profileName];
      }
      
      console.log(`   Updating: ${update.profileName}...`);
      
      // Read the profile
      const profileMeta = await metadata.read('Profile', apiName);
      
      if (!profileMeta || !profileMeta.fullName) {
        console.log(`   ⚠️  Could not read profile: ${update.profileName} (API: ${apiName})`);
        errorCount++;
        continue;
      }
      
      // Ensure fieldPermissions is an array
      let existingPerms = profileMeta.fieldPermissions || [];
      if (!Array.isArray(existingPerms)) {
        existingPerms = [existingPerms];
      }
      
      // Update or add Delivery__c field permissions
      for (const newPerm of update.fieldPermissions) {
        const existingIndex = existingPerms.findIndex(p => p.field === newPerm.field);
        if (existingIndex >= 0) {
          existingPerms[existingIndex].readable = true;
          existingPerms[existingIndex].editable = true;
        } else {
          existingPerms.push(newPerm);
        }
      }
      
      profileMeta.fieldPermissions = existingPerms;
      
      // Update the profile
      const result = await metadata.update('Profile', profileMeta);
      
      if (result.success) {
        console.log(`   ✅ ${update.profileName}`);
        successCount++;
      } else {
        console.log(`   ❌ ${update.profileName}: ${JSON.stringify(result.errors)}`);
        errorCount++;
      }
      
    } catch (err) {
      console.log(`   ❌ ${update.profileName}: ${err.message}`);
      errorCount++;
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(50));
  console.log(`   Fields updated: ${customFields.length}`);
  console.log(`   Profiles successful: ${successCount}`);
  console.log(`   Profiles failed: ${errorCount}`);
  console.log('═'.repeat(50));
  
  if (successCount > 0) {
    console.log('\n✅ Delivery__c fields are now visible for updated profiles!');
  }
  
  if (errorCount > 0) {
    console.log('\n⚠️  Some profiles could not be updated. You may need to update them manually in Salesforce Setup.');
  }
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

