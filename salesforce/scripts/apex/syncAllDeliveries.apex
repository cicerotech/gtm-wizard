/**
 * Sync all Stage 4+ Opportunities to fix stale Delivery values and links
 * Run this once to fix existing data, then triggers will keep it in sync
 */

// Find all Stage 4+ Opps with deliveries that might need sync
List<Opportunity> oppsToSync = [
    SELECT Id, Name, StageName
    FROM Opportunity
    WHERE StageName IN (
        'Stage 4 - Proposal',
        'Stage 5 - Negotiation',
        'Stage 6. Closed(Won)'
    )
    AND Id IN (SELECT Opportunity__c FROM Delivery__c)
    ORDER BY LastModifiedDate DESC
    LIMIT 50
];

System.debug('Found ' + oppsToSync.size() + ' Stage 4+ Opps with deliveries to sync');

Set<Id> oppIds = new Set<Id>();
for (Opportunity opp : oppsToSync) {
    oppIds.add(opp.Id);
    System.debug('  → ' + opp.Name + ' (' + opp.StageName + ')');
}

if (!oppIds.isEmpty()) {
    DeliverySyncService.syncDeliveries(oppIds);
    System.debug('=== SYNC COMPLETE: ' + oppIds.size() + ' opportunities synced ===');
}
