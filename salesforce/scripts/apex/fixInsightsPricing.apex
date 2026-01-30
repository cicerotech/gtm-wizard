/**
 * Fix AI Platform - Insights pricing to be equally distributed from ACV
 * 
 * Logic: For each Opp, recalculate all product prices as ACV / number of products
 */

// Get the Insights product
Product2 insightsProduct = [
    SELECT Id, Name 
    FROM Product2 
    WHERE Name = 'AI Platform - Insights' 
    LIMIT 1
];

// Find all Opps that have Insights line items (ones we just created)
List<Opportunity> oppsWithInsights = [
    SELECT Id, Name, ACV__c,
           (SELECT Id, Product2Id, Product2.Name, UnitPrice, TotalPrice, Quantity 
            FROM OpportunityLineItems
            ORDER BY Product2.Name)
    FROM Opportunity
    WHERE Id IN (
        SELECT OpportunityId 
        FROM OpportunityLineItem 
        WHERE Product2Id = :insightsProduct.Id
    )
    AND StageName IN (
        'Stage 1 - Discovery',
        'Stage 2 - SQO', 
        'Stage 3 - Pilot',
        'Stage 4 - Proposal',
        'Stage 5 - Negotiation'
    )
];

System.debug('Found ' + oppsWithInsights.size() + ' opps with Insights products to fix');

List<OpportunityLineItem> lineItemsToUpdate = new List<OpportunityLineItem>();
Integer oppsFixed = 0;

for (Opportunity opp : oppsWithInsights) {
    if (opp.ACV__c == null || opp.ACV__c == 0) {
        System.debug('Skipping ' + opp.Name + ' - no ACV');
        continue;
    }
    
    Integer productCount = opp.OpportunityLineItems.size();
    if (productCount == 0) continue;
    
    // Calculate equal distribution
    Decimal equalPrice = (opp.ACV__c / productCount).setScale(2, RoundingMode.HALF_UP);
    
    System.debug(opp.Name + ': ACV=$' + opp.ACV__c + ' / ' + productCount + ' products = $' + equalPrice + ' each');
    
    Boolean needsUpdate = false;
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        // Check if price needs adjustment (allow small variance for rounding)
        if (Math.abs(oli.UnitPrice - equalPrice) > 1) {
            System.debug('  → ' + oli.Product2.Name + ': $' + oli.UnitPrice + ' → $' + equalPrice);
            oli.UnitPrice = equalPrice;
            lineItemsToUpdate.add(oli);
            needsUpdate = true;
        }
    }
    
    if (needsUpdate) {
        oppsFixed++;
    }
}

if (!lineItemsToUpdate.isEmpty()) {
    update lineItemsToUpdate;
    System.debug('=== Updated ' + lineItemsToUpdate.size() + ' line items across ' + oppsFixed + ' opportunities ===');
} else {
    System.debug('=== No pricing updates needed ===');
}
