/**
 * Backfill missing Deliveries for Opps in Stage 4+ that have products without Deliveries
 * Processes in batches to avoid governor limits
 */

// Find first 10 Stage 4+ Opps with products that might need backfill
List<Opportunity> oppsWithProducts = [
    SELECT Id, Name, StageName,
           (SELECT Id, Product2Id, Product2.Name FROM OpportunityLineItems),
           (SELECT Id, Product_Line__c FROM Deliveries__r)
    FROM Opportunity
    WHERE StageName IN (
        'Stage 4 - Proposal',
        'Stage 5 - Negotiation',
        'Stage 6. Closed(Won)'
    )
    AND Id IN (SELECT OpportunityId FROM OpportunityLineItem)
    ORDER BY LastModifiedDate DESC
    LIMIT 3
];

System.debug('Checking ' + oppsWithProducts.size() + ' Opps in Stage 4+ with products');

Integer oppsNeedingBackfill = 0;

for (Opportunity opp : oppsWithProducts) {
    // Build set of products with deliveries
    Set<String> productsWithDeliveries = new Set<String>();
    for (Delivery__c d : opp.Deliveries__r) {
        if (d.Product_Line__c != null) {
            productsWithDeliveries.add(d.Product_Line__c.toLowerCase());
        }
    }
    
    // Count products missing deliveries
    Integer missingCount = 0;
    List<String> missingProducts = new List<String>();
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        if (!productsWithDeliveries.contains(oli.Product2.Name.toLowerCase())) {
            missingCount++;
            missingProducts.add(oli.Product2.Name);
        }
    }
    
    if (missingCount > 0) {
        oppsNeedingBackfill++;
        System.debug(opp.Name + ': ' + opp.OpportunityLineItems.size() + ' products, ' + opp.Deliveries__r.size() + ' deliveries, MISSING: ' + missingProducts);
        
        try {
            List<Delivery__c> all = DeliveryCreationService.createDeliveriesForOpportunity(opp.Id, 'Planning');
            System.debug('  ✓ Now has ' + all.size() + ' deliveries');
        } catch (Exception e) {
            System.debug('  ERROR: ' + e.getMessage());
        }
    } else {
        System.debug(opp.Name + ': OK (' + opp.OpportunityLineItems.size() + ' products, ' + opp.Deliveries__r.size() + ' deliveries)');
    }
}

System.debug('=== BATCH COMPLETE: ' + oppsNeedingBackfill + ' opps backfilled ===');
System.debug('Run again if more remain.');
