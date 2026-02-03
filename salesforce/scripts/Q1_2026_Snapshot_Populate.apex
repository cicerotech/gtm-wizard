/**
 * Q1 2026 Forecast Snapshot - One-Time Population Script
 * 
 * Run this in Salesforce Developer Console (Execute Anonymous)
 * This captures current BL commits and forecast data for Q1 2026 accuracy measurement
 * 
 * Prerequisites:
 * - Deploy the Q1_2026 snapshot fields first
 * - Run this ONCE at the start of Q1 (Feb 1, 2026)
 */

// Query all Q1 2026 opportunities (Target Sign Date in Q1: Feb 1 - Apr 30, 2026)
List<Opportunity> q1Opps = [
    SELECT Id, Name, 
           Quarterly_Commit_Net_New__c,
           BL_Forecast_Category__c,
           ACV__c,
           StageName,
           Owner.Name,
           Target_Sign_Date__c,
           Q1_2026_Commit_Snapshot__c,
           Q1_2026_Snapshot_Date__c
    FROM Opportunity
    WHERE Target_Sign_Date__c >= 2026-02-01
      AND Target_Sign_Date__c <= 2026-04-30
      AND IsClosed = false
    ORDER BY Owner.Name, Name
];

System.debug('Found ' + q1Opps.size() + ' Q1 2026 opportunities to snapshot');

List<Opportunity> toUpdate = new List<Opportunity>();
Integer alreadySnapshotted = 0;
Integer newSnapshots = 0;

for (Opportunity opp : q1Opps) {
    // Skip if already snapshotted (don't overwrite)
    if (opp.Q1_2026_Snapshot_Date__c != null) {
        alreadySnapshotted++;
        continue;
    }
    
    // Capture current values
    opp.Q1_2026_Commit_Snapshot__c = opp.Quarterly_Commit_Net_New__c;
    opp.Q1_2026_Forecast_Category_Snapshot__c = opp.BL_Forecast_Category__c != null 
        ? String.valueOf(opp.BL_Forecast_Category__c) 
        : '';
    opp.Q1_2026_ACV_Snapshot__c = opp.ACV__c;
    opp.Q1_2026_Stage_Snapshot__c = opp.StageName;
    opp.Q1_2026_Owner_Snapshot__c = opp.Owner.Name;
    opp.Q1_2026_Snapshot_Date__c = Date.today();
    
    toUpdate.add(opp);
    newSnapshots++;
    
    System.debug('Snapshotting: ' + opp.Name + 
                 ' | Owner: ' + opp.Owner.Name +
                 ' | Commit: $' + opp.Quarterly_Commit_Net_New__c +
                 ' | Category: ' + opp.BL_Forecast_Category__c);
}

// Update all opportunities
if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('SUCCESS: Updated ' + toUpdate.size() + ' opportunities with Q1 2026 snapshots');
}

System.debug('=== SUMMARY ===');
System.debug('Total Q1 Opps: ' + q1Opps.size());
System.debug('Already Snapshotted: ' + alreadySnapshotted);
System.debug('New Snapshots Created: ' + newSnapshots);
System.debug('Snapshot Date: ' + Date.today());
