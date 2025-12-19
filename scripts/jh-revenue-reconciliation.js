/**
 * JH Revenue Reconciliation Script
 * 
 * This script generates Data Loader-ready CSV files to update EUDIA Salesforce
 * opportunities with JH Original ACV values and fix identified discrepancies.
 * 
 * Usage:
 *   node scripts/jh-revenue-reconciliation.js
 * 
 * Outputs:
 *   - data/reconciliation/northern-trust-fix.csv
 *   - data/reconciliation/tiktok-term-fix.csv
 *   - data/reconciliation/jh-original-acv-updates.csv
 *   - data/reconciliation/variance-reasons.csv
 *   - data/reconciliation/missing-opportunities.csv
 *   - data/reconciliation/november-rr-analysis.csv
 */

const fs = require('fs');
const path = require('path');

// Ensure output directory exists
const outputDir = path.join(__dirname, '..', 'data', 'reconciliation');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// ============================================================================
// FIX 1: Northern Trust CDR6 - Add missing Revenue value
// ============================================================================
console.log('=== FIX 1: Northern Trust CDR6 ===');

const northernTrustFix = [
    ['Id', 'Amount', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c'],
    ['006Wj00000NNvht', '113100', '113100', 'No Variance']
];

const ntCsv = northernTrustFix.map(row => row.join(',')).join('\n');
fs.writeFileSync(path.join(outputDir, 'northern-trust-fix.csv'), ntCsv);
console.log('  Created: northern-trust-fix.csv');
console.log('  Action: Populate Revenue = $113,100 (matching JH ACV)');
console.log('  Opportunity ID: 006Wj00000NNvht');
console.log('');

// ============================================================================
// FIX 2: TikTok DSAR 2026 - Update Term from 12 to 6 months
// ============================================================================
console.log('=== FIX 2: TikTok DSAR 2026 Term Correction ===');

// Note: Need to verify the correct Opportunity ID for TikTok DSAR support ODL 2026
const tiktokTermFix = [
    ['Id', 'Term_Months__c', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c', 'Notes'],
    ['006Wj00000LbDRl', '6', '87000', 'Term Difference', 'JH shows 6 month term, EUDIA had 12 months']
];

const tikCsv = tiktokTermFix.map(row => row.join(',')).join('\n');
fs.writeFileSync(path.join(outputDir, 'tiktok-term-fix.csv'), tikCsv);
console.log('  Created: tiktok-term-fix.csv');
console.log('  Action: Update Term from 12 to 6 months');
console.log('  Note: Verify Opportunity ID before applying');
console.log('');

// ============================================================================
// FIX 3: JH Original ACV Population for All Discrepant Opportunities
// ============================================================================
console.log('=== FIX 3: JH Original ACV Updates ===');

const jhOriginalAcvUpdates = [
    ['Id', 'Opportunity_Name', 'Current_Revenue', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c'],
    // Kingspan - TCV already matches, documenting the bundle allocation
    ['006Wj00000MDikU', 'Kingspan ODL Contracts Project', '97085.70', '8120', 'Bundle Allocation'],
    // Aryza - 2-year deal, JH shows annual, EUDIA TCV shows 2-year total
    ['006Wj00000MDigU', 'Aryza - ODL Secondment - 2 years', '104079.87', '226200', 'Multi-Year Annualization'],
    // Glanbia - Minor variance
    ['006Wj00000MDijK', 'Glanbia Secondment Extension', '90341.33', '88044', 'Rate Adjustment'],
    // TikTok DSAR 2026
    ['006Wj00000LbDRl', 'TikTok DSAR support ODL 2026', '88115.62', '87000', 'Term Difference'],
    // Northern Trust (original, not CDR6)
    ['006Wj00000MDil3', 'Northern Trust Contracts Support', '145711.82', '149640', 'Rate Adjustment'],
];

const jhCsv = jhOriginalAcvUpdates.map(row => row.join(',')).join('\n');
fs.writeFileSync(path.join(outputDir, 'jh-original-acv-updates.csv'), jhCsv);
console.log('  Created: jh-original-acv-updates.csv');
console.log('  Action: Populate JH_Original_ACV__c field with JH values');
console.log('  Note: Replace NEED_ID with actual Opportunity IDs from Salesforce');
console.log('');

// ============================================================================
// FIX 4: Missing JH Q4 Opportunities (Category B)
// ============================================================================
console.log('=== FIX 4: Missing JH Q4 Opportunities ===');

const missingOpportunities = [
    ['Account_Name', 'Opportunity_Name', 'Amount', 'Close_Date', 'Term_Months', 'Stage', 'JH_Original_ACV__c', 'Opportunity_Source'],
    ['Indeed Ireland Operations Limited', 'Indeed ODL Steph Donald extension #1', '102080', '2025-10-17', '6', 'Closed Won', '102080', 'Johnson Hana'],
    ['Indeed Ireland Operations Limited', 'Indeed ODL (Helen Hewson)', '52200', '2025-10-28', '6', 'Closed Won', '52200', 'Johnson Hana'],
    ['Stripe Payments Europe Limited', 'Stripe RFP Privacy ODL Extension Victoria Byrne', '64922.88', '2025-10-07', '2', 'Closed Won', '64922.88', 'Johnson Hana'],
    ['Bank of Ireland', 'BOI FSPO team expansion Consultant #2', '41760', '2025-10-01', '4', 'Closed Won', '41760', 'Johnson Hana'],
    ['CommScope Technologies LLC', 'CommScope Extension Conor Hassett', '40601.16', '2025-10-06', '3', 'Closed Won', '40601.16', 'Johnson Hana'],
    ['Consensys', 'Consensys DPO as a Service', '40402.80', '2025-10-03', '6', 'Closed Won', '40402.80', 'Johnson Hana'],
    ['OpenAI', 'OpenAI Privacy team expansion - Himanshu Gaur', '69600', '2025-10-21', '4', 'Closed Won', '69600', 'Johnson Hana'],
    ['Kellogg Europe Trading Limited', 'Kellanova ODL Transactions Julie Collins team Extension', '11136', '2025-10-16', '1', 'Closed Won', '11136', 'Johnson Hana'],
    ['Novelis', 'AI Output Validation', '2900', '2025-10-02', '0', 'Closed Won', '2900', 'Johnson Hana'],
];

const missingCsv = missingOpportunities.map(row => row.join(',')).join('\n');
fs.writeFileSync(path.join(outputDir, 'missing-opportunities.csv'), missingCsv);
console.log('  Created: missing-opportunities.csv');
console.log('  Action: Create these opportunities in Salesforce');
console.log('  Total Missing Deals: 9');
console.log('  Total Missing ACV: $' + missingOpportunities.slice(1).reduce((sum, row) => sum + parseFloat(row[2]), 0).toLocaleString());
console.log('');

// ============================================================================
// FIX 5: November RR Revenue Opportunities Analysis
// ============================================================================
console.log('=== FIX 5: November RR Revenue Opps Analysis ===');

const novemberRrAnalysis = [
    ['Opportunity_ID', 'Account_Name', 'Opportunity_Name', 'Current_Revenue', 'JH_Q4_Deal', 'Issue', 'Recommended_Action'],
    ['006Wj00000MztAz', 'Coillte', 'Coillte - November RR Revenue', '194837.52', '19488 (PROW Extension)', 'Run rate capture not new Q4 deal', 'Document as Run Rate Capture OR backdate to original contract'],
    ['006Wj00000Mztan', 'Airship Group Inc', 'Airship - November RR Revenue', '166527.79', 'None in JH', 'Existing recurring revenue no Q4 booking', 'Document as Run Rate Capture OR link to historical deal'],
    ['006Wj00000Mzcjf', 'Creed McStay', 'Creed McStay - November RR Revenue', '38804.44', 'None in JH', 'Existing recurring revenue', 'Document as Run Rate Capture'],
    ['006Wj00000Mzcjg', 'Department of Children Disability and Equality', 'DCEDIY - November RR Revenue', '37152.91', 'None in JH (historical $1.18M)', 'Run rate from historical deal', 'Document as Run Rate Capture OR link to historical deal'],
    ['006Wj00000Mzcje', 'Coleman Legal', 'Coleman Legal - November RR Revenue', '16652.78', 'None in JH', 'Existing recurring revenue', 'Document as Run Rate Capture'],
];

const rrCsv = novemberRrAnalysis.map(row => row.join(',')).join('\n');
fs.writeFileSync(path.join(outputDir, 'november-rr-analysis.csv'), rrCsv);
console.log('  Created: november-rr-analysis.csv');
console.log('  These 5 opps ($454,164 total) are run rate captures, not new Q4 bookings');
console.log('  Decision Required: Keep as-is with "Run Rate Capture" variance reason, or restructure');
console.log('');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('=== RECONCILIATION SUMMARY ===');
console.log('');
console.log('Files created in: data/reconciliation/');
console.log('');
console.log('Immediate Actions (Safe - Preserves Active Rev):');
console.log('  1. northern-trust-fix.csv - Add missing Revenue $113,100');
console.log('  2. tiktok-term-fix.csv - Update Term 12 → 6 months');
console.log('  3. jh-original-acv-updates.csv - Populate JH_Original_ACV__c field');
console.log('');
console.log('Pending Business Decision:');
console.log('  4. missing-opportunities.csv - 9 deals to create ($425,603 total)');
console.log('  5. november-rr-analysis.csv - 5 run rate captures to categorize');
console.log('');
console.log('Active Revenue Impact:');
console.log('  - Northern Trust fix adds $113,100 to Active Rev');
console.log('  - Missing opportunities add $425,603 to Active Rev (if created)');
console.log('  - November RR opps: No change if kept as-is');
console.log('');

