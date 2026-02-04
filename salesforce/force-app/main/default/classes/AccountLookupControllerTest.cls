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
    static void testCreateOpportunity() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        
        Test.startTest();
        String oppId = AccountLookupController.createOpportunity(
            testAcc.Id,
            testAcc.Name,
            'Stage 1 - Discovery',
            Date.today().addDays(90),
            150000,
            'CLM'
        );
        Test.stopTest();
        
        System.assertNotEquals(null, oppId, 'Should return opportunity ID');
        
        Opportunity opp = [SELECT Id, Name, StageName, ACV__c FROM Opportunity WHERE Id = :oppId];
        System.assertEquals('Stage 1 - Discovery', opp.StageName, 'Stage should match');
        System.assertEquals(150000, opp.ACV__c, 'ACV should match');
    }
    
    @isTest
    static void testCreateOpportunityWithDefaults() {
        Account testAcc = [SELECT Id, Name FROM Account LIMIT 1];
        
        Test.startTest();
        String oppId = AccountLookupController.createOpportunity(
            testAcc.Id,
            testAcc.Name,
            'Stage 1 - Discovery',
            null,  // null date - should default
            null,  // null ACV - should default
            null   // null product line - should default
        );
        Test.stopTest();
        
        System.assertNotEquals(null, oppId, 'Should return opportunity ID');
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
                'CLM'
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        
        System.assert(exceptionThrown, 'Should throw exception for missing account');
    }
}
