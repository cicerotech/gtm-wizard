// End-to-end test of Delivery creation flow
// Query a Stage 4+ opportunity with products

List<Opportunity> testOpps = [
    SELECT Id, Name, StageName, Probability, AccountId, Account.Name, Pod__c,
           (SELECT Id, Product2.Name, Product2.ProductCode, TotalPrice 
            FROM OpportunityLineItems LIMIT 3)
    FROM Opportunity
    WHERE StageName IN ('Stage 4 - Proposal', 'Stage 5 - Negotiation')
    AND Id IN (SELECT OpportunityId FROM OpportunityLineItem)
    LIMIT 1
];

if (testOpps.isEmpty()) {
    System.debug('No Stage 4/5 opportunities with products found');
} else {
    Opportunity opp = testOpps[0];
    System.debug('=== Testing Delivery Creation ===');
    System.debug('Opportunity: ' + opp.Name);
    System.debug('Account: ' + opp.Account.Name);
    System.debug('Stage: ' + opp.StageName);
    System.debug('Probability: ' + opp.Probability + '%');
    System.debug('Pod: ' + opp.Pod__c);
    System.debug('Products: ' + opp.OpportunityLineItems.size());
    
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        System.debug('  - ' + oli.Product2.Name + ' (Code: ' + oli.Product2.ProductCode + ') $' + oli.TotalPrice);
    }
    
    // Check existing deliveries (using only existing fields)
    List<Delivery__c> existingDeliveries = [
        SELECT Id, Name, Product_Line__c, Contract_Value__c, Status__c
        FROM Delivery__c 
        WHERE Opportunity__c = :opp.Id
    ];
    
    System.debug('\n=== Existing Deliveries (' + existingDeliveries.size() + ') ===');
    for (Delivery__c d : existingDeliveries) {
        System.debug('  - ' + d.Name);
        System.debug('    Product: ' + d.Product_Line__c);
        System.debug('    Status: ' + d.Status__c);
        System.debug('    Value: $' + d.Contract_Value__c);
    }
    
    // Test the forecast status calculation
    System.debug('\n=== Testing Forecast Status Calculation ===');
    System.debug('calculateForecastStatus(80, Stage 4): ' + DeliveryCreationService.calculateForecastStatus(80, 'Stage 4 - Proposal'));
    System.debug('calculateForecastStatus(50, Stage 4): ' + DeliveryCreationService.calculateForecastStatus(50, 'Stage 4 - Proposal'));
    System.debug('calculateForecastStatus(30, Stage 4): ' + DeliveryCreationService.calculateForecastStatus(30, 'Stage 4 - Proposal'));
    System.debug('calculateForecastStatus(100, Closed Won): ' + DeliveryCreationService.calculateForecastStatus(100, 'Stage 6. Closed(Won)'));
    System.debug('calculateForecastStatus(0, Closed Lost): ' + DeliveryCreationService.calculateForecastStatus(0, 'Stage 7. Closed Lost'));
    
    System.debug('\n=== TEST COMPLETE ===');
}
