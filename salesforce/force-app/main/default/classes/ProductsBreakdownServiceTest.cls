/**
 * Test class for ProductsBreakdownService
 */
@isTest
private class ProductsBreakdownServiceTest {
    
    @testSetup
    static void setupTestData() {
        // Create test Account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test Opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Discovery',
            CloseDate = Date.today().addDays(30)
        );
        insert testOpp;
        
        // Create test Product
        Product2 testProduct = new Product2(
            Name = 'Test Product',
            ProductCode = 'TEST-PROD',
            IsActive = true
        );
        insert testProduct;
        
        // Get Standard Price Book - use Test.getStandardPricebookId() for test context
        Id standardPBId = Test.getStandardPricebookId();
        
        // Create Price Book Entry
        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = standardPBId,
            Product2Id = testProduct.Id,
            UnitPrice = 100000,
            IsActive = true
        );
        insert pbe;
    }
    
    @isTest
    static void testUpdateProductsBreakdown() {
        // Get test data
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Pricebook2Id FROM PricebookEntry LIMIT 1];
        
        // Update Opp to use Standard Price Book
        testOpp.Pricebook2Id = pbe.Pricebook2Id;
        update testOpp;
        
        // Create Line Item
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        // Call the service
        Test.startTest();
        ProductsBreakdownService.updateProductsBreakdown(new List<Id>{ testOpp.Id });
        Test.stopTest();
        
        // Verify
        Opportunity updatedOpp = [SELECT Products_Breakdown__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertNotEquals(null, updatedOpp.Products_Breakdown__c, 'Products Breakdown should be populated');
        System.assert(updatedOpp.Products_Breakdown__c.contains('Test Product'), 'Should contain product name');
        System.assert(updatedOpp.Products_Breakdown__c.contains('$120K'), 'Should contain formatted price');
    }
    
    @isTest
    static void testEmptyOpportunityIds() {
        // Should not throw error with empty list
        Test.startTest();
        ProductsBreakdownService.updateProductsBreakdown(new List<Id>());
        ProductsBreakdownService.updateProductsBreakdown(null);
        Test.stopTest();
        
        // No assertion needed - just verify no exception
    }
    
    @isTest
    static void testTriggerOnDelete() {
        // Get test data
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Pricebook2Id FROM PricebookEntry LIMIT 1];
        
        // Update Opp to use Standard Price Book
        testOpp.Pricebook2Id = pbe.Pricebook2Id;
        update testOpp;
        
        // Create Line Item
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        // Populate breakdown
        ProductsBreakdownService.updateProductsBreakdown(new List<Id>{ testOpp.Id });
        
        // Verify breakdown exists
        Opportunity oppBefore = [SELECT Products_Breakdown__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertNotEquals(null, oppBefore.Products_Breakdown__c, 'Breakdown should exist before delete');
        
        // Delete the line item - this should trigger the trigger
        Test.startTest();
        delete oli;
        Test.stopTest();
        
        // Verify breakdown is cleared (no products left)
        Opportunity oppAfter = [SELECT Products_Breakdown__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertEquals(null, oppAfter.Products_Breakdown__c, 'Breakdown should be null after deleting all products');
    }
}
