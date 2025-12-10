/**
 * Create Engagement Summary Field on Account Object
 * 
 * This script creates the Engagement_Summary__c field on Account
 * using Salesforce Metadata API via GTM Brain's connection.
 * 
 * Usage: node scripts/create-engagement-summary-field.js
 */

require('dotenv').config();
const { sfConnection, initializeSalesforce } = require('../src/salesforce/connection');
const logger = require('../src/utils/logger');

async function checkFieldExists() {
  try {
    const accountMetadata = await sfConnection.describe('Account');
    const fieldExists = accountMetadata.fields.find(f => f.name === 'Engagement_Summary__c');
    
    if (fieldExists) {
      logger.info('✅ Field Engagement_Summary__c already exists');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error checking field existence:', error);
    return false;
  }
}

async function createEngagementSummaryField() {
  try {
    logger.info('🚀 Creating Engagement Summary field on Account...');
    
    // Check if field already exists
    const exists = await checkFieldExists();
    if (exists) {
      logger.info('⚠️  Field already exists - skipping creation');
      return { success: true, skipped: true };
    }
    
    // Get connection
    const conn = sfConnection.getConnection();
    
    // Define custom field metadata
    const fieldMetadata = {
      fullName: 'Account.Engagement_Summary__c',
      label: 'Engagement Summary',
      type: 'LongTextArea',
      length: 32000,
      visibleLines: 10,
      required: false,
      trackHistory: false,
      trackFeedHistory: false,
      trackTrending: false,
      externalId: false,
      description: 'Auto-updated summary of recent account engagement including meetings, tasks, and key contacts. Updated via Flow.',
      inlineHelpText: 'Auto-updated summary of recent account engagement. Shows recent meetings, upcoming meetings, key contacts, and open opportunities.'
    };
    
    logger.info('📤 Deploying field via Metadata API...');
    
    // Create field using Metadata API
    const result = await conn.metadata.create('CustomField', fieldMetadata);
    
    if (result.success) {
      logger.info('✅ Field created successfully!');
      logger.info(`   Field API Name: Engagement_Summary__c`);
      logger.info(`   Field Label: Engagement Summary`);
      logger.info(`   Type: Long Text Area (32,000 characters)`);
      
      return { 
        success: true, 
        fieldId: result.id,
        fullName: fieldMetadata.fullName
      };
    } else {
      logger.error('❌ Field creation failed:', result.errors);
      return { 
        success: false, 
        errors: result.errors 
      };
    }
    
  } catch (error) {
    logger.error('❌ Error creating field:', error);
    
    // Check if it's a duplicate error (field was created between check and create)
    if (error.message && error.message.includes('duplicate')) {
      logger.info('⚠️  Field may have been created by another process');
      return { success: true, skipped: true, reason: 'duplicate' };
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function main() {
  try {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('ENGAGEMENT SUMMARY FIELD CREATION');
    logger.info('═══════════════════════════════════════════════════════════\n');
    
    // Initialize Salesforce connection
    await initializeSalesforce();
    
    // Create the field
    const result = await createEngagementSummaryField();
    
    if (result.success) {
      if (result.skipped) {
        logger.info('\n✅ Field already exists - no action needed');
      } else {
        logger.info('\n✅ SUCCESS! Field created successfully');
        logger.info('\n📋 Next Steps:');
        logger.info('   1. Add field to Account page layout');
        logger.info('   2. Create Flow to populate the field (see guide)');
        logger.info('   3. Test on sample account');
      }
    } else {
      logger.error('\n❌ FAILED to create field');
      if (result.errors) {
        logger.error('   Errors:', result.errors);
      }
      if (result.error) {
        logger.error('   Error:', result.error);
      }
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  } finally {
    // Don't disconnect - connection is singleton
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { createEngagementSummaryField, checkFieldExists };

