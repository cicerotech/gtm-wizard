/**
 * Test class for ContractLineItemService
 * Covers creation of Contract Line Items from Opportunity Products
 */
@isTest
private class ContractLineItemServiceTest {
    
    @testSetup
    static void setupTestData() {
        // Create Account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create Product
        Product2 testProduct = new Product2(
            Name = 'AI Platform - Sigma',
            IsActive = true,
            ProductCode = 'AI-SIG-001'
        );
        insert testProduct;
        
        // Get Standard Pricebook
        Id pricebookId = Test.getStandardPricebookId();
        
        // Create Pricebook Entry
        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = pricebookId,
            Product2Id = testProduct.Id,
            UnitPrice = 120000,
            IsActive = true
        );
        insert pbe;
        
        // Create Opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Prospecting',
            CloseDate = Date.today().addDays(30),
            Pricebook2Id = pricebookId
        );
        insert testOpp;
        
        // Create OpportunityLineItem
        OpportunityLineItem oli = new OpportunityLineItem(
            OpportunityId = testOpp.Id,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 120000
        );
        insert oli;
        
        // Create Contract
        Contract testContract = new Contract(
            AccountId = testAccount.Id,
            Status = 'Draft',
            StartDate = Date.today(),
            ContractTerm = 12
        );
        insert testContract;
    }
    
    @isTest
    static void testCreateLineItemsWithProducts() {
        // Get test data
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        Contract con = [SELECT Id FROM Contract LIMIT 1];
        
        Test.startTest();
        List<Contract_Line_Item__c> lineItems = ContractLineItemService.createLineItemsForContract(con.Id, opp.Id);
        Test.stopTest();
        
        // Verify
        System.assertEquals(1, lineItems.size(), 'Should create 1 line item');
        
        Contract_Line_Item__c cli = lineItems[0];
        System.assertEquals('AI Platform - Sigma', cli.Product_Name__c, 'Product name should match');
        System.assertEquals(120000, cli.Total_Price__c, 'Total price should match');
        System.assertEquals(1, cli.Quantity__c, 'Quantity should match');
    }
    
    @isTest
    static void testCreateLineItemsInvocable() {
        // Get test data
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        Contract con = [SELECT Id FROM Contract LIMIT 1];
        
        // Create request
        ContractLineItemService.ContractLineItemRequest request = new ContractLineItemService.ContractLineItemRequest();
        request.contractId = con.Id;
        request.opportunityId = opp.Id;
        
        Test.startTest();
        List<ContractLineItemService.ContractLineItemResult> results = ContractLineItemService.createLineItemsInvocable(new List<ContractLineItemService.ContractLineItemRequest>{request});
        Test.stopTest();
        
        // Verify
        System.assertEquals(1, results.size(), 'Should return 1 result');
        System.assertEquals(true, results[0].success, 'Should be successful');
        System.assertEquals(1, results[0].lineItemsCreated, 'Should create 1 line item');
    }
    
    @isTest
    static void testPreventDuplicates() {
        // Get test data
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        Contract con = [SELECT Id FROM Contract LIMIT 1];
        
        // Create line items first time
        ContractLineItemService.createLineItemsForContract(con.Id, opp.Id);
        
        Test.startTest();
        // Try to create again - should return existing
        List<Contract_Line_Item__c> lineItems = ContractLineItemService.createLineItemsForContract(con.Id, opp.Id);
        Test.stopTest();
        
        // Verify still only 1 line item exists
        Integer count = [SELECT COUNT() FROM Contract_Line_Item__c WHERE Contract__c = :con.Id];
        System.assertEquals(1, count, 'Should still only have 1 line item (no duplicates)');
    }
}

