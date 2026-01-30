// Check the status of product sync flows
// Query FlowDefinition to see active versions

// Note: FlowDefinition is a setup object, but we can check via metadata
// Let's just verify by creating a test opportunity

System.debug('=== FLOW STATUS CHECK ===');

// Create a test opportunity to trigger the flows
Account testAcc = [SELECT Id FROM Account WHERE Name LIKE '%Test%' LIMIT 1];

System.debug('Creating test opportunity with Product_Lines_Multi__c...');

Opportunity testOpp = new Opportunity(
    Name = 'FLOW TEST - DELETE ME',
    AccountId = testAcc.Id,
    StageName = 'Stage 1 - Discovery',
    CloseDate = Date.today().addDays(30),
    Product_Lines_Multi__c = 'AI Platform - Sigma',
    ACV__c = 50000,
    Opportunity_Source__c = 'Inbound'
);

insert testOpp;
System.debug('Created Opportunity: ' + testOpp.Id);

// Wait for async processes (not possible in Apex, but flows are synchronous)

// Check if products were created
Opportunity result = [
    SELECT Id, Name, Product_Lines_Multi__c, Pricebook2Id,
           (SELECT Id, Product2.Name, UnitPrice FROM OpportunityLineItems)
    FROM Opportunity 
    WHERE Id = :testOpp.Id
];

System.debug('\n=== RESULT ===');
System.debug('Product_Lines_Multi__c: ' + result.Product_Lines_Multi__c);
System.debug('Pricebook2Id: ' + result.Pricebook2Id);
System.debug('OpportunityLineItems: ' + result.OpportunityLineItems.size());

if (result.OpportunityLineItems.isEmpty()) {
    System.debug('*** FLOW DID NOT CREATE PRODUCTS ***');
} else {
    System.debug('*** FLOW WORKED! Products created:');
    for (OpportunityLineItem oli : result.OpportunityLineItems) {
        System.debug('  - ' + oli.Product2.Name + ' ($' + oli.UnitPrice + ')');
    }
}

// Clean up
delete testOpp;
System.debug('\nTest opportunity deleted.');
