#!/usr/bin/env node

/**
 * Field Categorization Script
 * 
 * Purpose: Process the field cleanup tracker and categorize fields based on 
 * population rates and code dependencies.
 * 
 * Usage: 
 *   1. First, update data/field-cleanup-tracker.csv with population data from Salesforce
 *   2. Run: node scripts/categorize-fields.js
 * 
 * Output: Categorized list of fields with cleanup recommendations
 */

const fs = require('fs');
const path = require('path');

// Configuration
const POPULATION_THRESHOLD = 5; // Percentage below which a field is considered "low population"
const TRACKER_FILE = 'data/field-cleanup-tracker.csv';
const DEPENDENCY_FILE = 'data/field-dependency-report.json';
const OUTPUT_FILE = 'data/field-cleanup-recommendations.json';

// Fields that should NEVER be removed regardless of population
const PROTECTED_FIELDS = new Set([
  // Core business fields
  'ACV__c', 'Weighted_ACV__c', 'Target_LOI_Date__c', 'Product_Line__c',
  'Product_Lines_Multi__c', 'Sales_Type__c', 'Revenue_Type__c',
  'Days_in_Stage__c', 'Days_in_Stage1__c', 'Johnson_Hana_Owner__c',
  'Blended_Forecast_base__c', 'Week_Created__c', 'Eudia_Tech__c',
  'Products_Breakdown__c', 'MEDDICC_Qualification__c',
  // Account critical fields
  'Account_Display_Name__c', 'Customer_Type__c', 'Customer_Subtype__c',
  'Account_Plan_s__c', 'Is_New_Logo__c', 'CLO_Engaged__c',
  'Key_Decision_Makers__c', 'Region__c', 'State__c', 'Customer_Brain__c',
  'Linked_in_URL__c', 'Rev_MN__c',
  // Flow-dependent fields
  'Next_Steps__c', 'Code_Name__c', 'Eudia_Council_Op__c', 
  'Eudia_Council_Account__c', 'BL_Forecast_Category__c'
]);

// Fields used in flows (from dependency analysis)
const FLOW_FIELDS = new Set([
  'Product_Line__c', 'Product_Lines_Multi__c', 'Next_Steps__c',
  'MEDDICC_Qualification__c', 'ACV__c', 'BL_Forecast_Category__c',
  'Eudia_Council_Op__c', 'Code_Name__c', 'Modified_By__c',
  'Opportunity__c', 'Snapshot_Date__c', 'Stage__c', 'Target_Sign_Date__c'
]);

function parseCSV(content) {
  const lines = content.split('\n').filter(l => {
    const trimmed = l.trim();
    // Skip empty lines, instruction lines, and lines that don't look like field data
    return trimmed && 
           !trimmed.startsWith('INSTRUCTIONS') && 
           !trimmed.match(/^\d+\./) &&  // Skip numbered instructions
           trimmed.includes(',');       // Must have comma (CSV format)
  });
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    // Handle quoted values with commas
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i] || '';
    });
    return obj;
  });
}

function categorizeField(field, dependencies) {
  const name = field['Field API Name'];
  const codeRefs = parseInt(field['Code References']) || 0;
  const populationPct = parseFloat(field['Population %']) || 0;
  const inFlows = field['In Flows']?.toLowerCase() === 'yes';
  const inReports = field['In Reports']?.toLowerCase() === 'yes';
  const inFormulas = field['In Formulas']?.toLowerCase() === 'yes';
  
  // Check if population data is pending
  const isPending = field['Population %'] === 'PENDING' || field['Population Count'] === 'PENDING';
  
  // Protected fields
  if (PROTECTED_FIELDS.has(name)) {
    return { category: 'KEEP', reason: 'Protected critical field', riskLevel: 'NONE' };
  }
  
  // Flow dependencies
  if (FLOW_FIELDS.has(name) || inFlows) {
    return { category: 'KEEP', reason: 'Used in Salesforce Flow', riskLevel: 'HIGH' };
  }
  
  // Formula dependencies
  if (inFormulas) {
    return { category: 'KEEP', reason: 'Used in formula field', riskLevel: 'HIGH' };
  }
  
  // Report dependencies
  if (inReports) {
    return { category: 'RISKY', reason: 'Used in reports - verify before removal', riskLevel: 'MEDIUM' };
  }
  
  // Code references
  if (codeRefs > 0) {
    return { category: 'KEEP', reason: `Referenced in ${codeRefs} places in codebase`, riskLevel: 'MEDIUM' };
  }
  
  // If population data is pending, mark for review
  if (isPending) {
    return { category: 'PENDING', reason: 'Awaiting population data from Salesforce', riskLevel: 'UNKNOWN' };
  }
  
  // Low population with no code references
  if (populationPct < POPULATION_THRESHOLD && codeRefs === 0 && !inFlows && !inReports && !inFormulas) {
    return { 
      category: 'SAFE', 
      reason: `Low population (${populationPct}%) and no code dependencies`,
      riskLevel: 'LOW'
    };
  }
  
  // High population
  if (populationPct >= POPULATION_THRESHOLD) {
    return { 
      category: 'KEEP', 
      reason: `Population ${populationPct}% exceeds threshold`,
      riskLevel: 'LOW'
    };
  }
  
  return { category: 'REVIEW', reason: 'Manual review needed', riskLevel: 'UNKNOWN' };
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SALESFORCE FIELD CATEGORIZATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Load tracker CSV
  if (!fs.existsSync(TRACKER_FILE)) {
    console.error(`Error: ${TRACKER_FILE} not found. Please create it first.`);
    process.exit(1);
  }
  
  const trackerContent = fs.readFileSync(TRACKER_FILE, 'utf8');
  const fields = parseCSV(trackerContent);
  
  // Load dependency report
  let dependencies = {};
  if (fs.existsSync(DEPENDENCY_FILE)) {
    dependencies = JSON.parse(fs.readFileSync(DEPENDENCY_FILE, 'utf8'));
  }
  
  // Categorize each field
  const results = {
    KEEP: [],
    RISKY: [],
    SAFE: [],
    PENDING: [],
    REVIEW: []
  };
  
  for (const field of fields) {
    const name = field['Field API Name'];
    if (!name) continue;
    
    const categorization = categorizeField(field, dependencies);
    const result = {
      field: name,
      object: field['Object'],
      ...categorization,
      currentRecommendation: field['Recommendation'] || 'UNKNOWN',
      notes: field['Notes'] || ''
    };
    
    results[categorization.category].push(result);
  }
  
  // Output summary
  console.log('CATEGORIZATION SUMMARY');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  KEEP:    ${results.KEEP.length} fields (do not touch)`);
  console.log(`  RISKY:   ${results.RISKY.length} fields (verify dependencies)`);
  console.log(`  SAFE:    ${results.SAFE.length} fields (candidates for removal)`);
  console.log(`  PENDING: ${results.PENDING.length} fields (need population data)`);
  console.log(`  REVIEW:  ${results.REVIEW.length} fields (manual check needed)`);
  console.log('');
  
  // Show SAFE fields
  if (results.SAFE.length > 0) {
    console.log('SAFE TO REMOVE FROM LAYOUTS:');
    console.log('─────────────────────────────────────────────────────────────');
    results.SAFE.forEach(f => {
      console.log(`  ✓ ${f.field} (${f.object}): ${f.reason}`);
    });
    console.log('');
  }
  
  // Show PENDING fields
  if (results.PENDING.length > 0) {
    console.log('AWAITING POPULATION DATA:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  Run analyzeFieldPopulation.apex in Salesforce to get this data.');
    results.PENDING.slice(0, 10).forEach(f => {
      console.log(`  ? ${f.field} (${f.object})`);
    });
    if (results.PENDING.length > 10) {
      console.log(`  ... and ${results.PENDING.length - 10} more`);
    }
    console.log('');
  }
  
  // Save full results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Full results saved to: ${OUTPUT_FILE}`);
  console.log('');
  
  // Warnings
  console.log('⚠️  IMPORTANT REMINDERS:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  1. Run "Where Is This Used?" in Salesforce for SAFE fields');
  console.log('  2. Remove from page layouts FIRST, wait 30 days, then deactivate');
  console.log('  3. Keep a changelog of all changes');
  console.log('  4. Never DELETE fields - only deactivate them');
}

main();

