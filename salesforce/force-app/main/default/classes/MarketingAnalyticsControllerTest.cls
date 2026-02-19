@isTest
private class MarketingAnalyticsControllerTest {

    @TestSetup
    static void setup() {
        Account acc = new Account(Name = 'Test Company');
        insert acc;

        Campaign c = new Campaign(
            Name = 'Events | Test Dinner | NYC | 2026-02-01',
            Type = 'Event',
            Event_Type__c = 'Field Event',
            Fiscal_Year__c = 'FY2026',
            Projected_Spend__c = 6000,
            Status = 'In Progress',
            StartDate = Date.today().addDays(-7),
            EndDate = Date.today(),
            BudgetedCost = 5000,
            ActualCost = 4500,
            IsActive = true
        );
        insert c;

        Contact con = new Contact(FirstName = 'Test', LastName = 'Contact', AccountId = acc.Id, Email = 'test@test.com');
        insert con;

        Lead l = new Lead(FirstName = 'Test', LastName = 'Lead', Company = 'Test Company', LeadSource = 'Web');
        insert l;

        CampaignMember cm = new CampaignMember(CampaignId = c.Id, LeadId = l.Id, Status = 'Sent');
        insert cm;

        CampaignMember cmContact = new CampaignMember(CampaignId = c.Id, ContactId = con.Id, Status = 'Responded');
        insert cmContact;
    }

    @isTest
    static void testGetCampaignOverview() {
        Test.startTest();
        MarketingAnalyticsController.CampaignOverview ov = MarketingAnalyticsController.getCampaignOverview();
        Test.stopTest();
        System.assertNotEquals(null, ov);
        System.assert(ov.totalCampaigns > 0);
    }

    @isTest
    static void testGetEventPerformance() {
        Test.startTest();
        MarketingAnalyticsController.EventPerformance ep = MarketingAnalyticsController.getEventPerformance();
        Test.stopTest();
        System.assertNotEquals(null, ep);
    }

    @isTest
    static void testGetPipelineAttribution() {
        Test.startTest();
        MarketingAnalyticsController.AttributionData ad = MarketingAnalyticsController.getPipelineAttribution();
        Test.stopTest();
        System.assertNotEquals(null, ad);
    }

    @isTest
    static void testGetLeadFlow() {
        Test.startTest();
        MarketingAnalyticsController.LeadFlowData lf = MarketingAnalyticsController.getLeadFlow();
        Test.stopTest();
        System.assertNotEquals(null, lf);
    }

    @isTest
    static void testGetInsights() {
        Test.startTest();
        List<MarketingAnalyticsController.InsightCard> insights = MarketingAnalyticsController.getInsights();
        Test.stopTest();
        System.assertNotEquals(null, insights);
    }

    @isTest
    static void testGetCampaignsForEditor() {
        Test.startTest();
        List<MarketingAnalyticsController.CampaignRow> rows = MarketingAnalyticsController.getCampaignsForEditor();
        Test.stopTest();
        System.assert(rows.size() > 0);
    }

    @isTest
    static void testSaveCampaigns() {
        Campaign c = [SELECT Id FROM Campaign LIMIT 1];
        String json = '[{"id":"' + c.Id + '","Status":"Completed","ActualCost":9999}]';
        Test.startTest();
        MarketingAnalyticsController.saveCampaigns(json);
        Test.stopTest();
        Campaign updated = [SELECT Status, ActualCost FROM Campaign WHERE Id = :c.Id];
        System.assertEquals('Completed', updated.Status);
        System.assertEquals(9999, updated.ActualCost);
    }

    @isTest
    static void testGetCampaignMembers() {
        Campaign c = [SELECT Id FROM Campaign LIMIT 1];
        Test.startTest();
        List<MarketingAnalyticsController.MemberRow> members = MarketingAnalyticsController.getCampaignMembers(c.Id);
        Test.stopTest();
        System.assert(members.size() > 0);
    }

    @isTest
    static void testAddCampaignMember() {
        Campaign c = [SELECT Id FROM Campaign LIMIT 1];
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Contact con2 = new Contact(FirstName = 'New', LastName = 'Person', AccountId = acc.Id);
        insert con2;

        Test.startTest();
        Id memberId = MarketingAnalyticsController.addCampaignMember(c.Id, con2.Id, 'Sent');
        Test.stopTest();
        System.assertNotEquals(null, memberId);
    }

    @isTest
    static void testSearchContactsAndLeads() {
        Test.startTest();
        List<MarketingAnalyticsController.SearchResult> results = MarketingAnalyticsController.searchContactsAndLeads('Test');
        Test.stopTest();
        System.assert(results.size() > 0);
    }

    @isTest
    static void testGetEventBudgetSummary() {
        Test.startTest();
        MarketingAnalyticsController.EventBudgetSummary summary = MarketingAnalyticsController.getEventBudgetSummary();
        Test.stopTest();
        System.assertNotEquals(null, summary);
        System.assert(summary.rows.size() > 0, 'Should have at least one budget row from test data');
        MarketingAnalyticsController.BudgetRow row = summary.rows[0];
        System.assertEquals('Field Event', row.eventType);
        System.assertEquals('FY2026', row.fiscalYear);
        System.assertEquals(5000, row.budgeted);
        System.assertEquals(4500, row.actual);
    }

    @isTest
    static void testSaveCampaignsWithNewFields() {
        Campaign c = [SELECT Id FROM Campaign LIMIT 1];
        String json = '[{"id":"' + c.Id + '","Event_Type__c":"Corporate Event","Fiscal_Year__c":"FY2025","Projected_Spend__c":15000}]';
        Test.startTest();
        MarketingAnalyticsController.saveCampaigns(json);
        Test.stopTest();
        Campaign updated = [SELECT Event_Type__c, Fiscal_Year__c, Projected_Spend__c FROM Campaign WHERE Id = :c.Id];
        System.assertEquals('Corporate Event', updated.Event_Type__c);
        System.assertEquals('FY2025', updated.Fiscal_Year__c);
        System.assertEquals(15000, updated.Projected_Spend__c);
    }

    @isTest
    static void testUpdateCampaignMembers() {
        CampaignMember cm = [SELECT Id FROM CampaignMember LIMIT 1];
        String json = '[{"id":"' + cm.Id + '","Status":"Responded"}]';
        Test.startTest();
        MarketingAnalyticsController.updateCampaignMembers(json);
        Test.stopTest();
        CampaignMember updated = [SELECT Status FROM CampaignMember WHERE Id = :cm.Id];
        System.assertEquals('Responded', updated.Status);
    }
}
