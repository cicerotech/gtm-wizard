// Manually trigger product sync for "Eudia Testing Account" opportunity
// This will help diagnose why the flow isn't working

// Find the opportunity
Opportunity opp = [
    SELECT Id, Name, Product_Lines_Multi__c, Pricebook2Id, ACV__c
    FROM Opportunity 
    WHERE Name LIKE '%Eudia Testing Account%' 
    AND IsClosed = false
    ORDER BY CreatedDate DESC
    LIMIT 1
];

System.debug('=== MANUAL PRODUCT SYNC ===');
System.debug('Opportunity: ' + opp.Name);
System.debug('Product_Lines_Multi__c: ' + opp.Product_Lines_Multi__c);
System.debug('Pricebook2Id: ' + opp.Pricebook2Id);
System.debug('ACV__c: ' + opp.ACV__c);

// Create sync request
ProductLineSyncService.SyncRequest req = new ProductLineSyncService.SyncRequest();
req.opportunityId = opp.Id;
req.selectedProductLines = opp.Product_Lines_Multi__c;

// Reset recursion flag (in case it's stuck)
ProductLineSyncService.isRunning = false;

System.debug('Calling ProductLineSyncService.syncProductLines()...');

try {
    ProductLineSyncService.syncProductLines(new List<ProductLineSyncService.SyncRequest>{req});
    System.debug('Sync completed successfully!');
} catch (Exception e) {
    System.debug('ERROR: ' + e.getMessage());
    System.debug('Stack: ' + e.getStackTraceString());
}

// Check results
Opportunity oppAfter = [
    SELECT Id, Name, Pricebook2Id,
           (SELECT Id, Product2.Name, UnitPrice FROM OpportunityLineItems)
    FROM Opportunity 
    WHERE Id = :opp.Id
];

System.debug('\n=== AFTER SYNC ===');
System.debug('Pricebook2Id: ' + oppAfter.Pricebook2Id);
System.debug('OpportunityLineItems: ' + oppAfter.OpportunityLineItems.size());
for (OpportunityLineItem oli : oppAfter.OpportunityLineItems) {
    System.debug('  - ' + oli.Product2.Name + ' ($' + oli.UnitPrice + ')');
}
