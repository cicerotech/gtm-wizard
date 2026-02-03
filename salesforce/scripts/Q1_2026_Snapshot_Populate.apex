/**
 * Q1 2026 Forecast Snapshot - One-Time Population Script
 * 
 * Run this in Salesforce Developer Console (Execute Anonymous)
 * This captures current BL commits and forecast data for Q1 2026 accuracy measurement
 * 
 * Updated: Processes in batches of 10 to avoid SOQL limits from flow triggers
 */

// Query all Q1 2026 opportunities (Target LOI Date in Q1: Feb 1 - Apr 30, 2026)
List<Opportunity> q1Opps = [
    SELECT Id, Name, 
           Quarterly_Commit_Net_New__c,
           BL_Forecast_Category__c,
           ACV__c,
           StageName,
           Owner.Name,
           Target_LOI_Date__c,
           Q1_2026_Commit_Snapshot__c,
           Q1_2026_Snapshot_Date__c
    FROM Opportunity
    WHERE Target_LOI_Date__c >= 2026-02-01
      AND Target_LOI_Date__c <= 2026-04-30
      AND IsClosed = false
      AND Q1_2026_Snapshot_Date__c = null
    ORDER BY Owner.Name, Name
    LIMIT 10
];

System.debug('Processing batch of ' + q1Opps.size() + ' Q1 2026 opportunities');

List<Opportunity> toUpdate = new List<Opportunity>();

for (Opportunity opp : q1Opps) {
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
    
    System.debug('Snapshotting: ' + opp.Name + 
                 ' | Owner: ' + opp.Owner.Name +
                 ' | Commit: $' + opp.Quarterly_Commit_Net_New__c +
                 ' | Category: ' + opp.BL_Forecast_Category__c);
}

// Update opportunities
if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('SUCCESS: Updated ' + toUpdate.size() + ' opportunities with Q1 2026 snapshots');
    System.debug('>>> RUN THIS SCRIPT AGAIN to process more records <<<');
} else {
    System.debug('=== ALL DONE! No more records to process ===');
}

// Check how many remain
Integer remaining = [
    SELECT COUNT() 
    FROM Opportunity 
    WHERE Target_LOI_Date__c >= 2026-02-01
      AND Target_LOI_Date__c <= 2026-04-30
      AND IsClosed = false
      AND Q1_2026_Snapshot_Date__c = null
];
System.debug('Remaining to snapshot: ' + remaining);
