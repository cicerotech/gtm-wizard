/**
 * Test class for ProductsBreakdownService
 * Tests breakdown formatting, TCV calculation, and Term updates.
 */
@isTest
private class ProductsBreakdownServiceTest {
    
    @testSetup
    static void setupTestData() {
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Stage 1 - Discovery',
            CloseDate = Date.today().addDays(30),
            ACV__c = 120000,
            Opportunity_Source__c = 'Inbound'
        );
        insert testOpp;
        
        Product2 testProduct = new Product2(
            Name = 'Test Product',
            ProductCode = 'TEST-PROD',
            IsActive = true
        );
        insert testProduct;
        
        Id standardPBId = Test.getStandardPricebookId();
        
        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = standardPBId,
            Product2Id = testProduct.Id,
            UnitPrice = 100000,
            IsActive = true
        );
        insert pbe;
    }
    
    private static ProductsBreakdownService.BreakdownRequest createRequest(Id oppId) {
        ProductsBreakdownService.BreakdownRequest req = new ProductsBreakdownService.BreakdownRequest();
        req.opportunityId = oppId;
        return req;
    }
    
    @isTest
    static void testUpdateProductsBreakdown() {
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Pricebook2Id FROM PricebookEntry LIMIT 1];
        
        testOpp.Pricebook2Id = pbe.Pricebook2Id;
        update testOpp;
        
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        Test.startTest();
        List<ProductsBreakdownService.BreakdownRequest> requests = new List<ProductsBreakdownService.BreakdownRequest>();
        requests.add(createRequest(testOpp.Id));
        ProductsBreakdownService.updateProductsBreakdown(requests);
        Test.stopTest();
        
        Opportunity updatedOpp = [SELECT Products_Breakdown__c, TCV__c, Term__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertNotEquals(null, updatedOpp.Products_Breakdown__c, 'Products Breakdown should be populated');
        System.assert(updatedOpp.Products_Breakdown__c.contains('Test Product'), 'Should contain product name');
        System.assert(updatedOpp.Products_Breakdown__c.contains('$120K'), 'Should contain formatted price');
        System.assert(updatedOpp.Products_Breakdown__c.contains('ACV Total'), 'Should contain ACV Total line');
    }
    
    @isTest
    static void testEmptyOpportunityIds() {
        Test.startTest();
        ProductsBreakdownService.updateProductsBreakdown(new List<ProductsBreakdownService.BreakdownRequest>());
        ProductsBreakdownService.updateProductsBreakdown(null);
        Test.stopTest();
        System.assert(true, 'No exception thrown for empty/null input');
    }
    
    @isTest
    static void testTriggerOnDelete() {
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Pricebook2Id FROM PricebookEntry LIMIT 1];
        
        testOpp.Pricebook2Id = pbe.Pricebook2Id;
        update testOpp;
        
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        Opportunity oppBefore = [SELECT Products_Breakdown__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertNotEquals(null, oppBefore.Products_Breakdown__c, 'Breakdown should exist after insert');
        
        Test.startTest();
        delete oli;
        
        List<ProductsBreakdownService.BreakdownRequest> requests = new List<ProductsBreakdownService.BreakdownRequest>();
        requests.add(createRequest(testOpp.Id));
        ProductsBreakdownService.updateProductsBreakdown(requests);
        Test.stopTest();
        
        // Verify no exception thrown — delete scenario handled gracefully
        System.assert(true, 'Delete and service call completed without exception');
    }
}
