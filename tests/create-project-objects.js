require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');

/**
 * SAFE Project Object Creation
 * - READ-ONLY from Source SF
 * - CREATE-ONLY in Target SF
 * - NO modifications to existing data
 * - Creates ONLY specified Project objects
 */

// Core Project objects to create (starting small)
const OBJECTS_TO_CREATE = [
  'pse__Proj__c',                           // Main Project object
  'pse__Project_Task__c',                   // Project tasks
  'pse__Project_Phase__c',                  // Project phases
  'pse__Project_Methodology__c',            // Project methodology
  'pse__Project_Location__c',               // Project locations
  'pse__Project_Source__c',                 // Project source
  'pse__Project_Task_Assignment__c',        // Task assignments
  'pse__Project_Task_Dependency__c',        // Task dependencies
  'pse__Project_Task_Points_History__c',    // Task points history
  'pse__Project_Task_Points_Complete_History__c', // Task points complete
  'pse__ProjectVarianceBatch__c',           // Variance batch
  'pse__ProjectVarianceBatchLog__c'         // Variance logs
];

async function connectToTarget() {
  console.log('\n🔌 Connecting to Target SF (Eudia)...');
  
  const { sfConnection } = require('./src/salesforce/connection');
  await sfConnection.initialize();
  const conn = sfConnection.getConnection();
  
  console.log('✅ Connected to Target SF');
  return conn;
}

async function loadMetadata() {
  console.log('\n📂 Loading extracted metadata...');
  
  const metadata = JSON.parse(fs.readFileSync('source-metadata.json', 'utf8'));
  
  console.log(`✅ Loaded metadata for ${metadata.length} objects`);
  
  return metadata;
}

async function createCustomObject(targetConn, objectMetadata) {
  console.log(`\n🏗️  Creating object: ${objectMetadata.label} (${objectMetadata.apiName})`);
  
  try {
    // SAFETY CHECK: Verify object doesn't already exist in Target
    try {
      await targetConn.sobject(objectMetadata.apiName).describe();
      console.log(`   ⚠️  Object already exists - SKIPPING (no modifications)`);
      return { success: true, skipped: true };
    } catch (e) {
      // Object doesn't exist - safe to create
      console.log(`   ✅ Object doesn't exist - safe to create`);
    }
    
    // Build custom object metadata
    const objectDef = {
      fullName: objectMetadata.apiName,
      label: objectMetadata.label,
      pluralLabel: objectMetadata.pluralLabel,
      nameField: {
        type: 'AutoNumber',
        label: `${objectMetadata.label} Name`
      },
      deploymentStatus: 'Deployed',
      sharingModel: 'ReadWrite'
    };
    
    // Create the object using Metadata API
    console.log(`   📤 Deploying custom object...`);
    
    const createResult = await targetConn.metadata.create('CustomObject', objectDef);
    
    if (createResult.success) {
      console.log(`   ✅ Object created successfully!`);
      console.log(`   📋 ${objectMetadata.fields.length} fields to add next`);
      return { success: true, objectMetadata };
    } else {
      console.log(`   ❌ Object creation failed:`, createResult.errors);
      return { success: false, errors: createResult.errors };
    }
    
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    console.log('🚀 Project Objects Creation - SAFE MODE');
    console.log('========================================');
    console.log('⚠️  READ-ONLY from Source SF');
    console.log('⚠️  CREATE-ONLY in Target SF');
    console.log('⚠️  NO modifications to existing data');
    console.log('========================================\n');
    
    // Load metadata
    const allMetadata = await loadMetadata();
    
    // Filter to only objects we want to create
    const objectsToCreate = allMetadata.filter(obj => 
      OBJECTS_TO_CREATE.includes(obj.apiName)
    );
    
    console.log(`\n📋 Objects to create: ${objectsToCreate.length}`);
    objectsToCreate.forEach((obj, i) => {
      console.log(`   ${i + 1}. ${obj.label} (${obj.apiName}) - ${obj.fields.length} fields`);
    });
    
    console.log(`\n⚠️  SAFETY CHECK: This will ONLY create new objects`);
    console.log(`⚠️  Existing objects will be SKIPPED (no modifications)`);
    console.log(`\n⏳ Starting creation in 5 seconds... (Ctrl+C to cancel)`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Connect to Target
    const targetConn = await connectToTarget();
    
    // Create each object
    const results = [];
    for (const objMeta of objectsToCreate) {
      const result = await createCustomObject(targetConn, objMeta);
      results.push({ object: objMeta.apiName, ...result });
      
      // Pause between creations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    console.log('\n========================================');
    console.log('✅ Creation Process Complete!');
    console.log('========================================\n');
    
    const created = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exist): ${skipped}`);
    console.log(`Failed: ${failed}`);
    
    // Save results
    fs.writeFileSync('creation-results.json', JSON.stringify(results, null, 2));
    console.log(`\nResults saved: creation-results.json`);
    
    if (created > 0) {
      console.log(`\n📝 Next: Create custom fields for each object`);
      console.log(`   (Fields will be added in next phase)`);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run with safety confirmation
console.log('\n⚠️⚠️⚠️  SAFETY CONFIRMATION REQUIRED ⚠️⚠️⚠️');
console.log('This will create custom objects in Target Salesforce');
console.log('Source SF: READ-ONLY (no changes)');
console.log('Target SF: CREATE-ONLY (no modifications to existing)');
console.log('\nPress Ctrl+C now if you want to stop');
console.log('Or wait 3 seconds to proceed...\n');

setTimeout(() => {
  main();
}, 3000);

