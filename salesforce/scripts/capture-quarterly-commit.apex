// ============================================================================
// Capture Quarterly Commit Snapshot
// ============================================================================
// Run this at the start of each quarter after BLs have tagged their commits.
// Usage: sf apex run -f scripts/capture-quarterly-commit.apex -o eudia-prod
// ============================================================================

System.debug('=== Starting Quarterly Commit Snapshot ===');
System.debug('Snapshot Date: ' + Date.today());

// Step 1: Sum committed ACV per BL (Owner)
// Only count open opportunities with BL Quarterly Commit = true
Map<Id, Decimal> commitByBL = new Map<Id, Decimal>();
for (AggregateResult ar : [
    SELECT OwnerId, SUM(ACV__c) totalCommit
    FROM Opportunity
    WHERE BL_Quarterly_Commit__c = true
    AND IsClosed = false
    GROUP BY OwnerId
]) {
    Id ownerId = (Id)ar.get('OwnerId');
    Decimal totalCommit = (Decimal)ar.get('totalCommit');
    commitByBL.put(ownerId, totalCommit != null ? totalCommit : 0);
    System.debug('BL ' + ownerId + ' committed: $' + totalCommit);
}

System.debug('Found ' + commitByBL.size() + ' BLs with committed deals');

// Step 2: Update BL_Performance_Metrics__c with frozen snapshot
// Using dynamic field access via put() to avoid FLS compilation issues
List<BL_Performance_Metrics__c> metrics = [
    SELECT Id, Business_Lead__c, Name
    FROM BL_Performance_Metrics__c
    WHERE Business_Lead__c IN :commitByBL.keySet()
];

for (BL_Performance_Metrics__c m : metrics) {
    m.put('Quarterly_Commit_Snapshot__c', commitByBL.get(m.Business_Lead__c));
    m.put('Commit_Snapshot_Date__c', Date.today());
}

if (!metrics.isEmpty()) {
    update metrics;
    System.debug('Updated ' + metrics.size() + ' BL_Performance_Metrics__c records');
}

// Step 3: Stamp the frozen value on all active Opportunities
// This allows the commit amount to appear on Opportunity reports
List<Opportunity> opps = [
    SELECT Id, OwnerId, Name
    FROM Opportunity
    WHERE IsClosed = false
    AND OwnerId IN :commitByBL.keySet()
];

for (Opportunity opp : opps) {
    opp.put('BL_Commit_Snapshot__c', commitByBL.get(opp.OwnerId));
}

if (!opps.isEmpty()) {
    update opps;
    System.debug('Stamped ' + opps.size() + ' Opportunity records');
}

System.debug('=== Quarterly Commit Snapshot Complete ===');
System.debug('Summary:');
System.debug('  - BLs captured: ' + commitByBL.size());
System.debug('  - Metrics updated: ' + metrics.size());
System.debug('  - Opportunities stamped: ' + opps.size());
