/**
 * Backfill Products from Product_Lines_Multi__c
 * 
 * This script finds opportunities that have Product_Lines_Multi__c populated
 * but no Products (OpportunityLineItems), and creates the products directly.
 * 
 * Calls ProductLineSyncService directly (doesn't rely on flow trigger).
 */

// Find opportunities with Product Lines selected but no Products
List<Opportunity> oppsToSync = [
    SELECT Id, Name, Product_Lines_Multi__c, 
           (SELECT Id FROM OpportunityLineItems)
    FROM Opportunity
    WHERE IsClosed = false
    AND Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
    AND Product_Lines_Multi__c != 'Undetermined'
    AND Product_Lines_Multi__c != 'Multiple (BL Review)'
    LIMIT 30
];

List<ProductLineSyncService.SyncRequest> requests = new List<ProductLineSyncService.SyncRequest>();

for (Opportunity opp : oppsToSync) {
    // Only process if no products exist
    if (opp.OpportunityLineItems == null || opp.OpportunityLineItems.isEmpty()) {
        ProductLineSyncService.SyncRequest req = new ProductLineSyncService.SyncRequest();
        req.opportunityId = opp.Id;
        req.selectedProductLines = opp.Product_Lines_Multi__c;
        requests.add(req);
        System.debug('Queued for sync: ' + opp.Name + ' (' + opp.Product_Lines_Multi__c + ')');
    }
}

System.debug('Found ' + requests.size() + ' opportunities needing products');

if (!requests.isEmpty()) {
    // Call the sync service directly
    ProductLineSyncService.syncProductLines(requests);
    System.debug('=== PRODUCTS CREATED for ' + requests.size() + ' opportunities ===');
} else {
    System.debug('No opportunities need product sync');
}

// Show remaining count that still need sync
Integer stillNeedSync = 0;
for (Opportunity opp : [
    SELECT Id, (SELECT Id FROM OpportunityLineItems)
    FROM Opportunity 
    WHERE IsClosed = false 
    AND Product_Lines_Multi__c != null 
    AND Product_Lines_Multi__c != ''
    AND Product_Lines_Multi__c != 'Undetermined'
    AND Product_Lines_Multi__c != 'Multiple (BL Review)'
]) {
    if (opp.OpportunityLineItems == null || opp.OpportunityLineItems.isEmpty()) {
        stillNeedSync++;
    }
}
System.debug('Remaining opportunities needing sync: ' + stillNeedSync);
System.debug('Run script again if remaining > 0');
