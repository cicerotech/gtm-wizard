#!/usr/bin/env node

/**
 * Field Dependency Analysis Script
 * 
 * Purpose: Scan the GTM Brain codebase to identify which Salesforce custom fields
 * are referenced in code, helping determine which fields are safe to deactivate.
 * 
 * Usage: node scripts/analyze-field-dependencies.js
 * 
 * Output: JSON report of field usage across the codebase
 */

const fs = require('fs');
const path = require('path');

// Directories to scan for field references
const SCAN_DIRS = [
  'src',
  'salesforce/force-app/main/default/classes',
  'salesforce/force-app/main/default/flows',
  'salesforce/scripts/apex'
];

// File extensions to scan
const SCAN_EXTENSIONS = ['.js', '.ts', '.cls', '.apex', '.xml', '.json'];

// Known critical fields that should NEVER be removed (from plan analysis)
const CRITICAL_FIELDS = {
  Opportunity: [
    'ACV__c',
    'Weighted_ACV__c', 
    'Target_LOI_Date__c',
    'Product_Line__c',
    'Product_Lines_Multi__c',
    'Sales_Type__c',
    'Revenue_Type__c',
    'Days_in_Stage__c',
    'Days_in_Stage1__c',
    'Johnson_Hana_Owner__c',
    'Blended_Forecast_base__c',
    'Week_Created__c',
    'Eudia_Tech__c',
    'Products_Breakdown__c',
    'MEDDICC_Qualification__c'
  ],
  Account: [
    'Account_Display_Name__c',
    'Customer_Type__c',
    'Customer_Subtype__c',
    'Account_Plan_s__c',
    'Is_New_Logo__c',
    'CLO_Engaged__c',
    'Key_Decision_Makers__c',
    'Region__c',
    'State__c',
    'Customer_Brain__c',
    'Linked_in_URL__c',
    'Rev_MN__c'
  ]
};

// Field pattern to match (ends with __c)
const FIELD_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*__c)\b/g;

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [...content.matchAll(FIELD_PATTERN)];
    return matches.map(m => m[1]);
  } catch (err) {
    return [];
  }
}

function scanDirectory(dir, results = {}) {
  if (!fs.existsSync(dir)) return results;
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (SCAN_EXTENSIONS.includes(ext)) {
        const fields = scanFile(fullPath);
        for (const field of fields) {
          if (!results[field]) {
            results[field] = { count: 0, files: [] };
          }
          results[field].count++;
          if (!results[field].files.includes(fullPath)) {
            results[field].files.push(fullPath);
          }
        }
      }
    }
  }
  
  return results;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SALESFORCE FIELD DEPENDENCY ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Scan all directories
  const fieldUsage = {};
  for (const dir of SCAN_DIRS) {
    console.log(`Scanning: ${dir}...`);
    scanDirectory(dir, fieldUsage);
  }
  
  // Sort fields by usage count
  const sortedFields = Object.entries(fieldUsage)
    .sort((a, b) => b[1].count - a[1].count);
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('FIELDS REFERENCED IN CODEBASE (sorted by reference count)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Field API Name | References | File Count | Status');
  console.log('---------------|------------|------------|--------');
  
  const referencedFields = new Set();
  
  for (const [field, data] of sortedFields) {
    referencedFields.add(field);
    const isCritical = CRITICAL_FIELDS.Opportunity.includes(field) || 
                       CRITICAL_FIELDS.Account.includes(field);
    const status = isCritical ? 'CRITICAL' : 'USED';
    console.log(`${field} | ${data.count} | ${data.files.length} | ${status}`);
  }
  
  // Output critical fields that might not be in codebase but are still important
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CRITICAL FIELDS STATUS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('OPPORTUNITY CRITICAL FIELDS:');
  for (const field of CRITICAL_FIELDS.Opportunity) {
    const status = referencedFields.has(field) ? '✓ Referenced' : '⚠ Not found in code (but marked critical)';
    console.log(`  ${field}: ${status}`);
  }
  
  console.log('');
  console.log('ACCOUNT CRITICAL FIELDS:');
  for (const field of CRITICAL_FIELDS.Account) {
    const status = referencedFields.has(field) ? '✓ Referenced' : '⚠ Not found in code (but marked critical)';
    console.log(`  ${field}: ${status}`);
  }
  
  // Generate JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFieldsFound: sortedFields.length,
      criticalOpportunityFields: CRITICAL_FIELDS.Opportunity.length,
      criticalAccountFields: CRITICAL_FIELDS.Account.length
    },
    fieldUsage: Object.fromEntries(sortedFields),
    criticalFields: CRITICAL_FIELDS
  };
  
  const reportPath = 'data/field-dependency-report.json';
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Report saved to: ${reportPath}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main();

