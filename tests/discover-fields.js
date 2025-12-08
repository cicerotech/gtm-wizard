#!/usr/bin/env node

/**
 * Discover actual Account and Opportunity fields in Salesforce
 */

require('dotenv').config();

async function discoverFields() {
  console.log('🔍 Discovering actual Salesforce fields...\n');

  try {
    const { initializeSalesforce, describe } = require('./src/salesforce/connection');

    await initializeSalesforce();

    // Describe Account object
    console.log('📋 ACCOUNT FIELDS:');
    console.log('='.repeat(70));
    const accountMeta = await describe('Account');
    
    const accountCustomFields = accountMeta.fields
      .filter(f => f.custom)
      .map(f => ({
        name: f.name,
        label: f.label,
        type: f.type
      }));

    console.log('\nCustom fields found:');
    accountCustomFields.forEach(f => {
      console.log(`  • ${f.name} (${f.label}) - ${f.type}`);
    });

    // Describe Opportunity object
    console.log('\n\n📋 OPPORTUNITY FIELDS:');
    console.log('='.repeat(70));
    const oppMeta = await describe('Opportunity');
    
    const oppCustomFields = oppMeta.fields
      .filter(f => f.custom)
      .map(f => ({
        name: f.name,
        label: f.label,
        type: f.type
      }));

    console.log('\nCustom fields found:');
    oppCustomFields.forEach(f => {
      console.log(`  • ${f.name} (${f.label}) - ${f.type}`);
    });

    console.log('\n\n✅ Discovery complete!');
    console.log('\nUse these actual field names in your queries.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Discovery failed:', error.message);
    process.exit(1);
  }
}

discoverFields();

