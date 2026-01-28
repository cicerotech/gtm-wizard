/**
 * Sync Products for Active Pipeline opportunities - SMALL BATCH
 */

Set<String> validProductLines = new Set<String>{
    'AI-Augmented Contracting - In-House Technology',
    'AI-Augmented Contracting - Managed Services',
    'Contracting - Secondee',
    'AI-Augmented Compliance - In-House Technology',
    'AI-Augmented M&A - In-House Technology',
    'AI-Augmented M&A - Managed Service',
    'AI Platform - Sigma',
    'AI Platform - Insights',
    'AI Platform - Litigation',
    'FDE - Custom AI Solution',
    'Other - Managed Service',
    'Other - Secondee'
};

Set<String> activeStages = new Set<String>{
    'Stage 0 - Prospecting',
    'Stage 1 - Discovery',
    'Stage 2 - SQO',
    'Stage 3 - Pilot',
    'Stage 4 - Proposal',
    'Stage 5 - Negotiation'
};

// Find active pipeline opportunities without products - SMALL BATCH
List<Opportunity> opps = [
    SELECT Id, Name, Product_Lines_Multi__c, StageName,
           (SELECT Id FROM OpportunityLineItems)
    FROM Opportunity
    WHERE StageName IN :activeStages
    AND Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
    AND Product_Lines_Multi__c != 'Undetermined'
    AND Product_Lines_Multi__c != 'Multiple (BL Review)'
    LIMIT 200
];

List<ProductLineSyncService.SyncRequest> requests = new List<ProductLineSyncService.SyncRequest>();

for (Opportunity opp : opps) {
    // Check if has no products
    if (opp.OpportunityLineItems == null || opp.OpportunityLineItems.isEmpty()) {
        // Check if product line is valid
        Boolean hasValidProductLine = false;
        for (String pl : opp.Product_Lines_Multi__c.split(';')) {
            if (validProductLines.contains(pl.trim())) {
                hasValidProductLine = true;
                break;
            }
        }
        
        if (hasValidProductLine && requests.size() < 10) { // Only 10 at a time
            ProductLineSyncService.SyncRequest req = new ProductLineSyncService.SyncRequest();
            req.opportunityId = opp.Id;
            req.selectedProductLines = opp.Product_Lines_Multi__c;
            requests.add(req);
            System.debug('Syncing: ' + opp.Name + ' (' + opp.Product_Lines_Multi__c + ')');
        }
    }
}

System.debug('Batch size: ' + requests.size());

if (!requests.isEmpty()) {
    ProductLineSyncService.syncProductLines(requests);
    System.debug('=== BATCH COMPLETE ===');
}

// Count remaining
Integer remaining = 0;
for (Opportunity opp : [
    SELECT Id, (SELECT Id FROM OpportunityLineItems)
    FROM Opportunity
    WHERE StageName IN :activeStages
    AND Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
    AND Product_Lines_Multi__c != 'Undetermined'
    AND Product_Lines_Multi__c != 'Multiple (BL Review)'
]) {
    if (opp.OpportunityLineItems == null || opp.OpportunityLineItems.isEmpty()) {
        remaining++;
    }
}
System.debug('Remaining without products: ' + remaining);
