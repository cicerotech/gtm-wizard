#!/usr/bin/env node
/**
 * Check Account fields available in Salesforce
 */

require('dotenv').config();
const jsforce = require('jsforce');

async function main() {
  console.log('Connecting to Salesforce...');
  
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
  });
  
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  
  console.log('Connected!\n');
  
  // Describe Account object
  const describe = await conn.describe('Account');
  
  // Get all custom fields
  const customFields = describe.fields
    .filter(f => f.custom)
    .sort((a, b) => a.name.localeCompare(b.name));
  
  console.log('=== ALL CUSTOM ACCOUNT FIELDS ===\n');
  customFields.forEach(f => {
    console.log(`${f.name} (${f.type}) - ${f.label}`);
  });
  
  // Look for pipeline/engagement related fields
  console.log('\n=== PIPELINE/ENGAGEMENT RELATED ===\n');
  const keywords = ['opp', 'acv', 'revenue', 'arr', 'pipeline', 'meeting', 'engagement', 'deal', 'booking', 'loi', 'total', 'open', 'clo', 'first'];
  
  customFields
    .filter(f => keywords.some(k => f.name.toLowerCase().includes(k) || f.label.toLowerCase().includes(k)))
    .forEach(f => {
      console.log(`${f.name} (${f.type}) - ${f.label}`);
    });
  
  // Check Engagement_Summary__c specifically
  const engagementField = describe.fields.find(f => f.name === 'Engagement_Summary__c');
  if (engagementField) {
    console.log('\n=== ENGAGEMENT_SUMMARY__c DETAILS ===');
    console.log('Type:', engagementField.type);
    console.log('Length:', engagementField.length);
    console.log('HTML Formatted:', engagementField.htmlFormatted);
  } else {
    console.log('\n⚠️  Engagement_Summary__c field NOT FOUND');
  }
  
  await conn.logout();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});




