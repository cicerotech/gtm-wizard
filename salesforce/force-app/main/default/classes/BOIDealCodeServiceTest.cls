@isTest
private class BOIDealCodeServiceTest {
    
    @TestSetup
    static void setup() {
        // Create counter
        BOI_Counter__c counter = BOI_Counter__c.getOrgDefaults();
        counter.Next_Number__c = 1;
        upsert counter;
        
        // Create test account
        Account acct = new Account(Name = 'Test Corp');
        insert acct;
    }
    
    @isTest
    static void testNewDealGetsCode() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        Opportunity opp = new Opportunity(
            Name = 'Test Deal',
            AccountId = acct.Id,
            StageName = 'Stage 1 - Discovery',
            CloseDate = Date.today().addDays(30),
            ACV__c = 100000,
            Opportunity_Source__c = 'Inbound'
        );
        insert opp;
        
        Test.startTest();
        opp.StageName = 'Stage 6. Closed(Won)';
        update opp;
        Test.stopTest();
        
        Opportunity result = [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id = :opp.Id];
        System.assert(result.BOI_Deal_Code__c.startsWith('TES-'), 'Code should start with client prefix TES-: ' + result.BOI_Deal_Code__c);
    }
    
    @isTest
    static void testRenewalGetsParentCode() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        
        // Create parent opp (already Won with BOI code)
        Opportunity parent = new Opportunity(
            Name = 'Parent Deal',
            AccountId = acct.Id,
            StageName = 'Stage 6. Closed(Won)',
            CloseDate = Date.today().addDays(-30),
            ACV__c = 50000,
            BOI_Deal_Code__c = 'TES-100',
            Opportunity_Source__c = 'Inbound'
        );
        insert parent;
        
        Opportunity renewal = new Opportunity(
            Name = 'Renewal Deal',
            AccountId = acct.Id,
            StageName = 'Stage 1 - Discovery',
            CloseDate = Date.today().addDays(30),
            ACV__c = 55000,
            Renewal_Of_c__c = parent.Id,
            Opportunity_Source__c = 'Existing Customer'
        );
        insert renewal;
        
        Test.startTest();
        renewal.StageName = 'Stage 6. Closed(Won)';
        update renewal;
        Test.stopTest();
        
        Opportunity result = [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id = :renewal.Id];
        System.assertEquals('TES-100-01', result.BOI_Deal_Code__c, 'Renewal should get parent code + -01');
    }
    
    @isTest
    static void testIdempotent() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        Opportunity opp = new Opportunity(
            Name = 'Already Coded',
            AccountId = acct.Id,
            StageName = 'Stage 6. Closed(Won)',
            CloseDate = Date.today(),
            ACV__c = 100000,
            BOI_Deal_Code__c = 'BOI-999',
            Opportunity_Source__c = 'Inbound'
        );
        insert opp;
        
        Test.startTest();
        opp.ACV__c = 120000; // Re-save with different field
        update opp;
        Test.stopTest();
        
        Opportunity result = [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id = :opp.Id];
        System.assertEquals('BOI-999', result.BOI_Deal_Code__c, 'Existing code should not change on re-save');
    }
    
    @isTest
    static void testBulkClose() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 5; i++) {
            opps.add(new Opportunity(
                Name = 'Bulk Deal ' + i,
                AccountId = acct.Id,
                StageName = 'Stage 4 - Proposal',
                CloseDate = Date.today().addDays(30),
                ACV__c = 10000 * (i + 1),
                Opportunity_Source__c = 'Outbound'
            ));
        }
        insert opps;
        
        Test.startTest();
        for (Opportunity opp : opps) {
            opp.StageName = 'Stage 6. Closed(Won)';
        }
        update opps;
        Test.stopTest();
        
        Set<String> codes = new Set<String>();
        for (Opportunity opp : [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id IN :opps]) {
            System.assertNotEquals(null, opp.BOI_Deal_Code__c, 'Each opp should have a code');
            codes.add(opp.BOI_Deal_Code__c);
        }
        System.assertEquals(5, codes.size(), 'All 5 codes should be unique');
    }
    
    @isTest
    static void testBackfill() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        
        // Create Won opps -- the trigger will fire but we'll clear the codes to simulate legacy data
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 3; i++) {
            opps.add(new Opportunity(
                Name = 'Legacy Deal ' + i,
                AccountId = acct.Id,
                StageName = 'Stage 6. Closed(Won)',
                CloseDate = Date.today().addDays(-90 + i),
                ACV__c = 50000,
                Opportunity_Source__c = 'Inbound'
            ));
        }
        insert opps;
        
        // Clear codes to simulate pre-existing opps without BOI codes
        List<Opportunity> clearCodes = new List<Opportunity>();
        for (Opportunity opp : opps) {
            clearCodes.add(new Opportunity(Id = opp.Id, BOI_Deal_Code__c = null));
        }
        update clearCodes;
        
        Test.startTest();
        BOIDealCodeService.backfillExistingWonOpps();
        Test.stopTest();
        
        Integer coded = [SELECT COUNT() FROM Opportunity WHERE Id IN :opps AND BOI_Deal_Code__c != null];
        System.assertEquals(3, coded, 'All 3 legacy opps should be backfilled');
    }
    
    @isTest
    static void testBackfillWithRenewal() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Corp'];
        
        // Create parent Won opp
        Opportunity parent = new Opportunity(
            Name = 'Legacy Parent',
            AccountId = acct.Id,
            StageName = 'Stage 6. Closed(Won)',
            CloseDate = Date.today().addDays(-90),
            ACV__c = 50000,
            Opportunity_Source__c = 'Inbound'
        );
        insert parent;
        
        // Create renewal (Won)
        Opportunity renewal = new Opportunity(
            Name = 'Legacy Renewal',
            AccountId = acct.Id,
            StageName = 'Stage 6. Closed(Won)',
            CloseDate = Date.today().addDays(-30),
            ACV__c = 55000,
            Renewal_Of_c__c = parent.Id,
            Opportunity_Source__c = 'Existing Customer'
        );
        insert renewal;
        
        // Clear all codes
        update new List<Opportunity>{
            new Opportunity(Id = parent.Id, BOI_Deal_Code__c = null),
            new Opportunity(Id = renewal.Id, BOI_Deal_Code__c = null)
        };
        
        Test.startTest();
        BOIDealCodeService.backfillExistingWonOpps();
        Test.stopTest();
        
        Opportunity parentResult = [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id = :parent.Id];
        Opportunity renewalResult = [SELECT BOI_Deal_Code__c FROM Opportunity WHERE Id = :renewal.Id];
        System.assertNotEquals(null, parentResult.BOI_Deal_Code__c, 'Parent should have a code');
        System.assert(renewalResult.BOI_Deal_Code__c.contains('-01'), 'Renewal should have -01 suffix');
    }
}
