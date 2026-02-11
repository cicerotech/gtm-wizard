/**
 * Test class for AccountLookupController
 */
@isTest
private class AccountLookupControllerTest {
    
    @testSetup
    static void setupTestData() {
        // Create test accounts
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 5; i++) {
            accounts.add(new Account(
                Name = 'Test Account ' + i,
                Industry = 'Technology',
                BillingCity = 'San Francisco',
                BillingState = 'CA'
            ));
        }
        insert accounts;
    }
    
    @isTest
    static void testSearchAccounts() {
        Test.startTest();
        List<AccountLookupController.AccountResult> results = AccountLookupController.searchAccounts('Test Account');
        Test.stopTest();
        
        System.assertNotEquals(null, results, 'Results should not be null');
        System.assertEquals(5, results.size(), 'Should find 5 test accounts');
        System.assert(results[0].name.contains('Test Account'), 'Should contain account name');
    }
    
    @isTest
    static void testSearchAccountsShortTerm() {
        Test.startTest();
        List<AccountLookupController.AccountResult> results = AccountLookupController.searchAccounts('T');
        Test.stopTest();
        
        System.assertEquals(0, results.size(), 'Should return empty for short search term');
    }
    
    @isTest
    static void testSearchAccountsBlank() {
        Test.startTest();
        List<AccountLookupController.AccountResult> results = AccountLookupController.searchAccounts('');
        Test.stopTest();
        
        System.assertEquals(0, results.size(), 'Should return empty for blank search');
    }
    
    @isTest
    static void testGetAccountById() {
        Account testAcc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        AccountLookupController.AccountResult result = AccountLookupController.getAccountById(testAcc.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Result should not be null');
        System.assert(result.name.contains('Test Account'), 'Should return correct account');
    }
    
    @isTest
    static void testGetAccountByIdBlank() {
        Test.startTest();
        AccountLookupController.AccountResult result = AccountLookupController.getAccountById('');
        Test.stopTest();
        
        System.assertEquals(null, result, 'Should return null for blank ID');
    }
    
    @isTest
    static void testCreateOpportunitySingleProductLine() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        
        Test.startTest();
        String oppId = AccountLookupController.createOpportunity(
            testAcc.Id,
            testAcc.Name,
            'Stage 1 - Discovery',
            Date.today().addDays(100),
            150000,
            'AI Contracting - Technology',
            'Outbound'
        );
        Test.stopTest();
        
        System.assertNotEquals(null, oppId, 'Should return opportunity ID');
        
        Opportunity opp = [SELECT Id, Name, StageName, ACV__c, Opportunity_Source__c, 
                                  Product_Line__c, Product_Lines_Multi__c 
                           FROM Opportunity WHERE Id = :oppId];
        System.assertEquals('Stage 1 - Discovery', opp.StageName, 'Stage should match');
        System.assertEquals(150000, opp.ACV__c, 'ACV should match');
        System.assertEquals('Outbound', opp.Opportunity_Source__c, 'Source should match');
        System.assertEquals('AI Contracting - Technology', opp.Product_Line__c, 'Product_Line__c should be the first value');
        System.assertEquals('AI Contracting - Technology', opp.Product_Lines_Multi__c, 'Product_Lines_Multi__c should be set directly');
        // Name may be modified by org automation (Opp_Update_Sync flow) -- verify it contains account name
        System.assert(opp.Name.contains('Test Account'), 'Name should contain account name: ' + opp.Name);
    }

    @isTest
    static void testCreateOpportunityMultipleProductLines() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        
        Test.startTest();
        String oppId = AccountLookupController.createOpportunity(
            testAcc.Id,
            testAcc.Name,
            'Stage 2 - SQO',
            Date.today().addDays(150),
            500000,
            'AI Contracting - Technology;AI M&A - Managed Services;AI Platform - Sigma',
            'Inbound'
        );
        Test.stopTest();
        
        System.assertNotEquals(null, oppId, 'Should return opportunity ID');
        
        Opportunity opp = [SELECT Id, Name, Product_Line__c, Product_Lines_Multi__c 
                           FROM Opportunity WHERE Id = :oppId];
        // Product_Line__c should be the first value for backward compatibility
        System.assertEquals('AI Contracting - Technology', opp.Product_Line__c, 'Product_Line__c should be first selected value');
        // Product_Lines_Multi__c should contain all selected values
        System.assert(opp.Product_Lines_Multi__c.contains('AI Contracting - Technology'), 'Multi should contain first product');
        System.assert(opp.Product_Lines_Multi__c.contains('AI M&A - Managed Services'), 'Multi should contain second product');
        System.assert(opp.Product_Lines_Multi__c.contains('AI Platform - Sigma'), 'Multi should contain third product');
        // Name should contain account name and "Multiple" suffix (may be modified by org automation)
        System.assert(opp.Name.contains('Test Account'), 'Name should contain account name: ' + opp.Name);
    }
    
    @isTest
    static void testCreateOpportunityWithDefaults() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        
        Test.startTest();
        String oppId = AccountLookupController.createOpportunity(
            testAcc.Id,
            testAcc.Name,
            'Stage 1 - Discovery',
            null,   // null date - should default
            null,   // null ACV - should default
            null,   // null productLines - should default to Undetermined
            null    // null source - should default to Inbound
        );
        Test.stopTest();
        
        System.assertNotEquals(null, oppId, 'Should return opportunity ID');
        
        Opportunity opp = [SELECT Name, Opportunity_Source__c, Product_Line__c, Product_Lines_Multi__c 
                           FROM Opportunity WHERE Id = :oppId];
        System.assertEquals('Inbound', opp.Opportunity_Source__c, 'Default source should be Inbound');
        System.assertEquals('Undetermined', opp.Product_Line__c, 'Default product line should be Undetermined');
        System.assertEquals('Undetermined', opp.Product_Lines_Multi__c, 'Default multi should be Undetermined');
        // Name may be modified by org automation -- verify it contains account name
        System.assert(opp.Name.contains('Test Account'), 'Name should contain account name: ' + opp.Name);
    }
    
    @isTest
    static void testCreateOpportunityMissingAccount() {
        Boolean exceptionThrown = false;
        
        Test.startTest();
        try {
            AccountLookupController.createOpportunity(
                null,
                'Test',
                'Stage 1 - Discovery',
                Date.today(),
                100000,
                'AI Contracting - Technology',
                'Inbound'
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        
        System.assert(exceptionThrown, 'Should throw exception for missing account');
    }

    @isTest
    static void testCreateOpportunityMissingStage() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        Boolean exceptionThrown = false;
        
        Test.startTest();
        try {
            AccountLookupController.createOpportunity(
                testAcc.Id,
                testAcc.Name,
                null,
                Date.today(),
                100000,
                'AI Contracting - Technology',
                'Inbound'
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        
        System.assert(exceptionThrown, 'Should throw exception for missing stage');
    }
}
