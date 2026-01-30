/**
 * Add AI Platform - Insights as OpportunityLineItem to active Opps
 * that have it in Product_Lines__c but not as an actual attached product
 */

// Get the Insights product
Product2 insightsProduct = [
    SELECT Id, Name 
    FROM Product2 
    WHERE Name = 'AI Platform - Insights' 
    LIMIT 1
];
System.debug('Insights Product ID: ' + insightsProduct.Id);

// Get standard price book entry for Insights
PricebookEntry insightsPBE = [
    SELECT Id, UnitPrice, Pricebook2Id
    FROM PricebookEntry 
    WHERE Product2Id = :insightsProduct.Id 
    AND Pricebook2.IsStandard = true
    LIMIT 1
];
System.debug('Insights PBE ID: ' + insightsPBE.Id + ' @ $' + insightsPBE.UnitPrice);

// Find active stage Opportunities with Insights in Product_Lines_Multi__c
// Active stages: 1-5 (not Closed Won/Lost/Nurture/Disqualified)
List<Opportunity> oppsWithInsights = [
    SELECT Id, Name, StageName, Product_Lines_Multi__c, Pricebook2Id,
           (SELECT Id, Product2Id, Product2.Name FROM OpportunityLineItems)
    FROM Opportunity
    WHERE Product_Lines_Multi__c INCLUDES ('AI Platform - Insights')
    AND StageName IN (
        'Stage 1 - Discovery',
        'Stage 2 - SQO', 
        'Stage 3 - Pilot',
        'Stage 4 - Proposal',
        'Stage 5 - Negotiation'
    )
];

System.debug('Found ' + oppsWithInsights.size() + ' active opps with Insights in Product Lines');

List<OpportunityLineItem> lineItemsToCreate = new List<OpportunityLineItem>();
List<Opportunity> oppsToUpdatePricebook = new List<Opportunity>();
List<String> oppsAlreadyHaveIt = new List<String>();
List<String> oppsNeedIt = new List<String>();

for (Opportunity opp : oppsWithInsights) {
    // Check if Insights is already attached as a line item
    Boolean hasInsights = false;
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        if (oli.Product2Id == insightsProduct.Id) {
            hasInsights = true;
            break;
        }
    }
    
    if (hasInsights) {
        oppsAlreadyHaveIt.add(opp.Name);
        continue;
    }
    
    oppsNeedIt.add(opp.Name);
    
    // If Opp doesn't have a price book, assign standard
    if (opp.Pricebook2Id == null) {
        opp.Pricebook2Id = insightsPBE.Pricebook2Id;
        oppsToUpdatePricebook.add(opp);
    }
    
    // Calculate price: ACV / (existing products + 1 for the new Insights)
    Integer newProductCount = opp.OpportunityLineItems.size() + 1;
    Decimal unitPrice = insightsPBE.UnitPrice; // default fallback
    
    // Query ACV for equal distribution
    Opportunity oppWithACV = [SELECT ACV__c FROM Opportunity WHERE Id = :opp.Id LIMIT 1];
    if (oppWithACV.ACV__c != null && oppWithACV.ACV__c > 0) {
        unitPrice = (oppWithACV.ACV__c / newProductCount).setScale(2, RoundingMode.HALF_UP);
        System.debug('  → Equal distribution: $' + oppWithACV.ACV__c + ' / ' + newProductCount + ' = $' + unitPrice);
    }
    
    OpportunityLineItem newOLI = new OpportunityLineItem(
        OpportunityId = opp.Id,
        Product2Id = insightsProduct.Id,
        PricebookEntryId = insightsPBE.Id,
        Quantity = 1,
        UnitPrice = unitPrice
    );
    lineItemsToCreate.add(newOLI);
}

System.debug('Opps already have Insights attached: ' + oppsAlreadyHaveIt);
System.debug('Opps that need Insights added: ' + oppsNeedIt);

// Update price books first if needed
if (!oppsToUpdatePricebook.isEmpty()) {
    update oppsToUpdatePricebook;
    System.debug('Updated ' + oppsToUpdatePricebook.size() + ' opps with price book');
}

// Create the line items
if (!lineItemsToCreate.isEmpty()) {
    insert lineItemsToCreate;
    System.debug('=== CREATED ' + lineItemsToCreate.size() + ' Insights line items ===');
    
    for (Integer i = 0; i < oppsNeedIt.size(); i++) {
        System.debug('  ✓ ' + oppsNeedIt[i]);
    }
} else {
    System.debug('=== No line items needed - all opps already have Insights attached ===');
}
