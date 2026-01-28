/**
 * Test class for DeliveryCreationService
 */
@isTest
private class DeliveryCreationServiceTest {
    
    @testSetup
    static void setupTestData() {
        // Create test Account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test Product
        Product2 testProduct = new Product2(
            Name = 'Test Product',
            ProductCode = 'TEST-PROD',
            IsActive = true
        );
        insert testProduct;
        
        // Get Standard Price Book
        Id standardPBId = Test.getStandardPricebookId();
        
        // Create Price Book Entry
        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = standardPBId,
            Product2Id = testProduct.Id,
            UnitPrice = 120000,
            IsActive = true
        );
        insert pbe;
    }
    
    @isTest
    static void testCreateDeliveryWithProducts() {
        // Get test data
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Pricebook2Id FROM PricebookEntry LIMIT 1];
        
        // Create Opportunity with line items
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Discovery',
            CloseDate = Date.today().addDays(30),
            Pricebook2Id = pbe.Pricebook2Id,
            Opportunity_Source__c = 'Inbound'  // Required by validation rule
        );
        insert testOpp;
        
        // Add line item
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        // Create deliveries
        Test.startTest();
        List<Delivery__c> deliveries = DeliveryCreationService.createDeliveriesForOpportunity(testOpp.Id, 'Planning');
        Test.stopTest();
        
        // Verify
        System.assertEquals(1, deliveries.size(), 'Should create one delivery per product');
        // Name is auto-generated, check Product_Line__c instead
        System.assertEquals('Test Product', deliveries[0].Product_Line__c, 'Delivery should have correct product line');
        System.assertEquals(120000, deliveries[0].Contract_Value__c, 'Delivery value should match line item');
    }
    
    @isTest
    static void testCreateDeliveryWithoutProducts() {
        // Get test data
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        // Create Opportunity without line items
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity No Products',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Discovery',
            CloseDate = Date.today().addDays(30),
            Product_Line__c = 'AI Platform - Sigma',
            ACV__c = 100000,
            Opportunity_Source__c = 'Inbound'  // Required by validation rule
        );
        insert testOpp;
        
        // Create deliveries
        Test.startTest();
        List<Delivery__c> deliveries = DeliveryCreationService.createDeliveriesForOpportunity(testOpp.Id, 'Planning');
        Test.stopTest();
        
        // Verify
        System.assertEquals(1, deliveries.size(), 'Should create one delivery for legacy opp');
        // Name is auto-generated, check Product_Line__c instead (picklist value may be lowercase)
        System.assertNotEquals(null, deliveries[0].Product_Line__c, 'Delivery should have product line set');
        System.assertEquals(100000, deliveries[0].Contract_Value__c, 'Delivery value should match ACV');
    }
    
    @isTest
    static void testInvocableMethod() {
        // Get test data
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        // Create Opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Invocable Opp',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Discovery',
            CloseDate = Date.today().addDays(30),
            Product_Line__c = 'FDE - Custom AI Solution',
            ACV__c = 150000,
            Opportunity_Source__c = 'Inbound'  // Required by validation rule
        );
        insert testOpp;
        
        // Create request
        DeliveryCreationService.DeliveryRequest request = new DeliveryCreationService.DeliveryRequest();
        request.opportunityId = testOpp.Id;
        request.defaultStatus = 'Planning';
        
        // Call invocable
        Test.startTest();
        List<DeliveryCreationService.DeliveryResult> results = 
            DeliveryCreationService.createDeliveriesInvocable(new List<DeliveryCreationService.DeliveryRequest>{ request });
        Test.stopTest();
        
        // Verify
        System.assertEquals(1, results.size(), 'Should return one result');
        System.assertEquals(true, results[0].success, 'Should succeed');
        System.assertEquals(1, results[0].deliveriesCreated, 'Should create one delivery');
    }
    
    @isTest
    static void testSkipExistingDeliveries() {
        // Get test data
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        // Create Opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Existing Delivery',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Discovery',
            CloseDate = Date.today().addDays(30),
            Product_Line__c = 'AI Platform - Litigation',
            ACV__c = 200000,
            Opportunity_Source__c = 'Inbound'  // Required by validation rule
        );
        insert testOpp;
        
        // Create existing Delivery (Name is auto-generated)
        Delivery__c existingDelivery = new Delivery__c(
            Opportunity__c = testOpp.Id,
            Account__c = testAccount.Id,
            Product_Line__c = 'AI Platform - Litigation',
            Delivery_Model__c = 'AI-First (95% AI / 5% Human)'
        );
        insert existingDelivery;
        
        // Try to create deliveries - should skip
        Test.startTest();
        List<Delivery__c> deliveries = DeliveryCreationService.createDeliveriesForOpportunity(testOpp.Id, 'Planning');
        Test.stopTest();
        
        // Verify - should return existing delivery, not create new
        System.assertEquals(1, deliveries.size(), 'Should return existing delivery');
        System.assertEquals(existingDelivery.Id, deliveries[0].Id, 'Should return the existing delivery ID');
    }
}

