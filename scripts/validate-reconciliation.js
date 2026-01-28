/**
 * Revenue Reconciliation Validation Script
 * 
 * Run this script before and after applying Data Loader updates to validate
 * that Active Revenue totals are preserved correctly.
 * 
 * Usage:
 *   node scripts/validate-reconciliation.js
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('REVENUE RECONCILIATION VALIDATION');
console.log('='.repeat(60));
console.log('');

// Expected values from MASTER FILE analysis
const expectedValues = {
    activeRevTotal: 19741428.70,
    activeRevTCV: 28812594.29,
    runRateNov: 17904162.00,
    qtdClosedWon: 1422877.96,
    jhQ4Total: 1513218.84
};

console.log('BASELINE VALUES (from MASTER FILE.xlsx analysis):');
console.log('-'.repeat(40));
console.log(`  Active Rev + Projects Total:  $${expectedValues.activeRevTotal.toLocaleString()}`);
console.log(`  Active Rev TCV Total:         $${expectedValues.activeRevTCV.toLocaleString()}`);
console.log(`  Run Rate Revenue (Nov):       $${expectedValues.runRateNov.toLocaleString()}`);
console.log(`  QTD Closed Won EUDIA:         $${expectedValues.qtdClosedWon.toLocaleString()}`);
console.log(`  JH Q4 Closed Won:             $${expectedValues.jhQ4Total.toLocaleString()}`);
console.log('');

// Calculate expected values after updates
const updates = {
    northernTrustFix: 113100.00,
    missingOppsTotal: 425602.84
};

console.log('EXPECTED VALUES AFTER UPDATES:');
console.log('-'.repeat(40));
console.log('');

console.log('Phase 1: Safe updates (no Active Rev impact)');
console.log('  - JH Original ACV field population');
console.log('  - ACV Variance Reason documentation');
console.log('  - November RR Revenue categorization');
console.log(`  Expected Active Rev Total: $${expectedValues.activeRevTotal.toLocaleString()} (unchanged)`);
console.log('');

console.log('Phase 2: Northern Trust CDR6 fix');
console.log(`  + Adding Revenue: $${updates.northernTrustFix.toLocaleString()}`);
const afterNT = expectedValues.activeRevTotal + updates.northernTrustFix;
console.log(`  Expected Active Rev Total: $${afterNT.toLocaleString()}`);
console.log('');

console.log('Phase 3: Missing opportunities creation (if approved)');
console.log(`  + Adding 9 opportunities: $${updates.missingOppsTotal.toLocaleString()}`);
const afterMissing = afterNT + updates.missingOppsTotal;
console.log(`  Expected Active Rev Total: $${afterMissing.toLocaleString()}`);
console.log('');

// List reconciliation files
const reconciliationDir = path.join(__dirname, '..', 'data', 'reconciliation');
console.log('RECONCILIATION FILES:');
console.log('-'.repeat(40));

if (fs.existsSync(reconciliationDir)) {
    const files = fs.readdirSync(reconciliationDir);
    files.forEach(file => {
        const filePath = path.join(reconciliationDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
} else {
    console.log('  Reconciliation directory not found. Run jh-revenue-reconciliation.js first.');
}

console.log('');
console.log('VALIDATION CHECKLIST:');
console.log('-'.repeat(40));
console.log('');
console.log('Before applying updates:');
console.log('  [ ] Export current Active Rev + Projects report');
console.log('  [ ] Note total Revenue: should be $19,741,429');
console.log('  [ ] Note total records: should be 96');
console.log('');
console.log('After deploying new fields:');
console.log('  [ ] Verify JH_Original_ACV__c field exists on Opportunity');
console.log('  [ ] Verify ACV_Variance_Reason__c picklist exists');
console.log('  [ ] Verify ACV_Variance_Amount__c formula field exists');
console.log('');
console.log('After applying safe updates:');
console.log('  [ ] Run Active Rev report - should still be $19,741,429');
console.log('  [ ] Verify JH_Original_ACV__c populated on key opportunities');
console.log('  [ ] Verify ACV_Variance_Reason__c set correctly');
console.log('');
console.log('After Northern Trust fix:');
console.log('  [ ] Run Active Rev report - should be $19,854,529');
console.log('  [ ] Verify Northern Trust CDR6 shows $113,100 Revenue');
console.log('');
console.log('After missing opportunities (if created):');
console.log('  [ ] Run Active Rev report - should be $20,280,132');
console.log('  [ ] Verify 9 new opportunities created');
console.log('  [ ] Verify Account roll-ups updated correctly');
console.log('');

console.log('='.repeat(60));
console.log('END VALIDATION REPORT');
console.log('='.repeat(60));





