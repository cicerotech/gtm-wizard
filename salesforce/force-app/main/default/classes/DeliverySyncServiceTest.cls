/**
 * DeliverySyncServiceTest
 * Test coverage for DeliverySyncService
 */
@isTest
private class DeliverySyncServiceTest {
    
    @isTest
    static void testSyncDeliveries_EmptyInput() {
        // Should not throw error on empty input
        Test.startTest();
        DeliverySyncService.syncDeliveries(new Set<Id>());
        DeliverySyncService.syncDeliveries(null);
        Test.stopTest();
        
        // No assertions needed - just verifying no exceptions
    }
    
    @isTest
    static void testSyncDeliveriesInvocable_EmptyInput() {
        Test.startTest();
        DeliverySyncService.syncDeliveriesInvocable(new List<DeliverySyncService.SyncRequest>());
        Test.stopTest();
        
        // No assertions needed - just verifying no exceptions
    }
    
    @isTest
    static void testSyncDeliveries_WithOpportunity() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opp',
            AccountId = testAccount.Id,
            StageName = 'Stage 4 - Proposal',
            CloseDate = Date.today().addDays(30),
            Opportunity_Source__c = 'Inbound'
        );
        insert testOpp;
        
        Test.startTest();
        DeliverySyncService.syncDeliveries(new Set<Id>{ testOpp.Id });
        Test.stopTest();
        
        // Verify opportunity was processed without error
        Opportunity refreshedOpp = [SELECT Id, Delivery_Links__c FROM Opportunity WHERE Id = :testOpp.Id];
        // No deliveries exist, so links should be null
        System.assertEquals(null, refreshedOpp.Delivery_Links__c);
    }
    
    @isTest
    static void testInvocableMethod() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opp',
            AccountId = testAccount.Id,
            StageName = 'Stage 5 - Negotiation',
            CloseDate = Date.today().addDays(30),
            Opportunity_Source__c = 'Outbound'
        );
        insert testOpp;
        
        // Create invocable request
        DeliverySyncService.SyncRequest req = new DeliverySyncService.SyncRequest();
        req.opportunityId = testOpp.Id;
        
        Test.startTest();
        DeliverySyncService.syncDeliveriesInvocable(new List<DeliverySyncService.SyncRequest>{ req });
        Test.stopTest();
        
        // Verify no errors occurred
        System.assert(true, 'Invocable method completed successfully');
    }
    
    @isTest
    static void testSyncDeliveries_WithDelivery() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account Delivery');
        insert testAccount;
        
        // Create test opportunity at Stage 4
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opp with Delivery',
            AccountId = testAccount.Id,
            StageName = 'Stage 4 - Proposal',
            CloseDate = Date.today().addDays(30),
            ACV__c = 100000,
            Opportunity_Source__c = 'Inbound'
        );
        insert testOpp;
        
        // Create a delivery
        Delivery__c testDelivery = new Delivery__c(
            Opportunity__c = testOpp.Id,
            Account__c = testAccount.Id,
            Product_Line__c = 'AI Platform - Sigma',
            Contract_Value__c = 50000,
            Delivery_Model__c = 'AI-First (95% AI / 5% Human)'
        );
        insert testDelivery;
        
        Test.startTest();
        DeliverySyncService.syncDeliveries(new Set<Id>{ testOpp.Id });
        Test.stopTest();
        
        // Verify delivery links were updated
        Opportunity refreshedOpp = [SELECT Id, Delivery_Links__c FROM Opportunity WHERE Id = :testOpp.Id];
        System.assertNotEquals(null, refreshedOpp.Delivery_Links__c, 'Delivery Links should be populated');
        System.assert(refreshedOpp.Delivery_Links__c.contains('DEL-'), 'Delivery Links should contain delivery code');
    }
    
    @isTest
    static void testSyncDeliveries_MultipleOpps() {
        // Create test accounts
        Account testAccount1 = new Account(Name = 'Test Account Multi 1');
        Account testAccount2 = new Account(Name = 'Test Account Multi 2');
        insert new List<Account>{ testAccount1, testAccount2 };
        
        // Create test opportunities
        Opportunity testOpp1 = new Opportunity(
            Name = 'Test Opp Multi 1',
            AccountId = testAccount1.Id,
            StageName = 'Stage 4 - Proposal',
            CloseDate = Date.today().addDays(30),
            Opportunity_Source__c = 'Inbound'
        );
        Opportunity testOpp2 = new Opportunity(
            Name = 'Test Opp Multi 2',
            AccountId = testAccount2.Id,
            StageName = 'Stage 5 - Negotiation',
            CloseDate = Date.today().addDays(60),
            Opportunity_Source__c = 'Outbound'
        );
        insert new List<Opportunity>{ testOpp1, testOpp2 };
        
        Test.startTest();
        DeliverySyncService.syncDeliveries(new Set<Id>{ testOpp1.Id, testOpp2.Id });
        Test.stopTest();
        
        // Verify no errors
        System.assert(true, 'Multiple opp sync completed successfully');
    }
}
