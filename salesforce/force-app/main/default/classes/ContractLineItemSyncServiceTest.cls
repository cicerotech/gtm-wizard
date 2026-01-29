/**
 * Test class for ContractLineItemSyncService
 * 
 * @author GTM Brain
 * @date January 2026
 */
@isTest
private class ContractLineItemSyncServiceTest {
    
    @testSetup
    static void setupTestData() {
        // Create test Account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Get or create Standard Pricebook
        Id stdPricebookId = Test.getStandardPricebookId();
        
        // Create test Product
        Product2 testProduct = new Product2(
            Name = 'Test Product Line',
            ProductCode = 'TEST-001',
            IsActive = true
        );
        insert testProduct;
        
        // Create Pricebook Entry
        PricebookEntry testPBE = new PricebookEntry(
            Pricebook2Id = stdPricebookId,
            Product2Id = testProduct.Id,
            UnitPrice = 50000,
            IsActive = true
        );
        insert testPBE;
        
        // Create test Opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Closed Won',
            CloseDate = Date.today(),
            Pricebook2Id = stdPricebookId,
            ACV__c = 100000,
            Opportunity_Source__c = 'Inbound'
        );
        insert testOpp;
        
        // Create OpportunityLineItem
        OpportunityLineItem testOLI = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = testPBE.Id,
            Quantity = 1,
            UnitPrice = 100000
        );
        insert testOLI;
        
        // Create test Contract
        Contract testContract = new Contract(
            AccountId = testAccount.Id,
            StartDate = Date.today(),
            ContractTerm = 12,
            Status = 'Draft',
            Source_Opportunity__c = testOpp.Id
        );
        insert testContract;
    }
    
    @isTest
    static void testSyncLineItems_WithSourceOpportunity() {
        Contract testContract = [SELECT Id, Source_Opportunity__c FROM Contract LIMIT 1];
        
        Test.startTest();
        
        ContractLineItemSyncService.SyncRequest req = new ContractLineItemSyncService.SyncRequest();
        req.contractId = testContract.Id;
        
        List<ContractLineItemSyncService.SyncResult> results = 
            ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>{req});
        
        Test.stopTest();
        
        System.assertEquals(1, results.size(), 'Should return one result');
        System.assertEquals(true, results[0].success, 'Sync should succeed');
        System.assertEquals(1, results[0].lineItemsCreated, 'Should create 1 line item');
        
        // Verify line item was created with all fields
        List<Contract_Line_Item__c> lineItems = [
            SELECT Id, Name, Product_Name_Campfire__c, Amount_Campfire__c, 
                   Product_Id__c, Product_Code__c, Duration_Months__c
            FROM Contract_Line_Item__c 
            WHERE Contract__c = :testContract.Id
        ];
        System.assertEquals(1, lineItems.size(), 'Should have 1 contract line item');
        System.assertEquals('Test Product Line', lineItems[0].Product_Name_Campfire__c);
        System.assertNotEquals(null, lineItems[0].Product_Id__c, 'Product ID should be populated');
    }
    
    @isTest
    static void testSyncLineItems_WithProvidedOpportunityId() {
        Contract testContract = [SELECT Id FROM Contract LIMIT 1];
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        
        // Clear the Source_Opportunity__c to test providing it explicitly
        testContract.Source_Opportunity__c = null;
        update testContract;
        
        Test.startTest();
        
        ContractLineItemSyncService.SyncRequest req = new ContractLineItemSyncService.SyncRequest();
        req.contractId = testContract.Id;
        req.opportunityId = testOpp.Id;
        
        List<ContractLineItemSyncService.SyncResult> results = 
            ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>{req});
        
        Test.stopTest();
        
        System.assertEquals(true, results[0].success, 'Sync should succeed');
    }
    
    @isTest
    static void testSyncLineItems_DuplicatePrevention() {
        Contract testContract = [SELECT Id FROM Contract LIMIT 1];
        
        // First sync
        ContractLineItemSyncService.SyncRequest req = new ContractLineItemSyncService.SyncRequest();
        req.contractId = testContract.Id;
        ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>{req});
        
        Test.startTest();
        
        // Second sync - should not create duplicates
        List<ContractLineItemSyncService.SyncResult> results = 
            ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>{req});
        
        Test.stopTest();
        
        System.assertEquals(true, results[0].success, 'Sync should succeed');
        System.assertEquals(0, results[0].lineItemsCreated, 'Should not create duplicates');
    }
    
    @isTest
    static void testSyncLineItems_NoContractId() {
        Test.startTest();
        
        ContractLineItemSyncService.SyncRequest req = new ContractLineItemSyncService.SyncRequest();
        // Don't set contractId
        
        List<ContractLineItemSyncService.SyncResult> results = 
            ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>{req});
        
        Test.stopTest();
        
        System.assertEquals(false, results[0].success, 'Should fail without Contract ID');
    }
    
    @isTest
    static void testSyncLineItems_EmptyRequest() {
        Test.startTest();
        
        List<ContractLineItemSyncService.SyncResult> results = 
            ContractLineItemSyncService.syncLineItems(new List<ContractLineItemSyncService.SyncRequest>());
        
        Test.stopTest();
        
        System.assertEquals(1, results.size(), 'Should return one result');
        System.assertEquals(false, results[0].success, 'Should fail for empty request');
    }
    
    @isTest
    static void testSyncForContract_UtilityMethod() {
        Contract testContract = [SELECT Id FROM Contract LIMIT 1];
        Opportunity testOpp = [SELECT Id FROM Opportunity LIMIT 1];
        
        Test.startTest();
        
        ContractLineItemSyncService.SyncResult result = 
            ContractLineItemSyncService.syncForContract(testContract.Id, testOpp.Id);
        
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return a result');
        System.assertEquals(true, result.success, 'Should succeed');
    }
}

