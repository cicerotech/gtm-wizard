@isTest
private class PipelineReviewControllerTest {

    @testSetup
    static void setupTestData() {
        Account acct = new Account(Name = 'Test Corp');
        insert acct;

        List<Opportunity> opps = new List<Opportunity>();
        opps.add(new Opportunity(
            Name = 'Compliance Deal',
            AccountId = acct.Id,
            StageName = 'Stage 2 - SQO',
            CloseDate = Date.today().addDays(60),
            ACV__c = 150000,
            Product_Lines_Multi__c = 'AI Compliance - Technology',
            BL_Forecast_Category__c = 'Pipeline',
            Pod__c = 'US',
            Opportunity_Source__c = 'Inbound'
        ));
        opps.add(new Opportunity(
            Name = 'Contracting Deal',
            AccountId = acct.Id,
            StageName = 'Stage 3 - Pilot',
            CloseDate = Date.today().addDays(30),
            ACV__c = 200000,
            Product_Lines_Multi__c = 'AI Contracting - Technology',
            BL_Forecast_Category__c = 'Commit',
            Pod__c = 'US',
            Opportunity_Source__c = 'Inbound'
        ));
        opps.add(new Opportunity(
            Name = 'No Product Deal',
            AccountId = acct.Id,
            StageName = 'Stage 1 - Discovery',
            CloseDate = Date.today().addDays(90),
            ACV__c = 100000,
            Pod__c = 'EU',
            Opportunity_Source__c = 'Outbound'
        ));
        opps.add(new Opportunity(
            Name = 'Multi-Product Deal',
            AccountId = acct.Id,
            StageName = 'Stage 2 - SQO',
            CloseDate = Date.today().addDays(45),
            ACV__c = 250000,
            Product_Lines_Multi__c = 'AI Compliance - Technology;AI Platform - Sigma',
            BL_Forecast_Category__c = 'Pipeline',
            Pod__c = 'US',
            Opportunity_Source__c = 'Inbound'
        ));
        insert opps;
    }

    @isTest
    static void testGetPipelineData_AllFilters() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        List<PipelineReviewController.PipelineRow> rows =
            PipelineReviewController.getPipelineData('All', '', false, 'All');
        Test.stopTest();
        System.assert(rows.size() >= 3, 'Should return at least 3 test opps');
    }

    @isTest
    static void testGetPipelineData_PodFilter() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        List<PipelineReviewController.PipelineRow> rows =
            PipelineReviewController.getPipelineData('EU', '', false, 'All');
        Test.stopTest();
        Boolean hasEU = false;
        for (PipelineReviewController.PipelineRow r : rows) {
            if (r.pod == 'EU') hasEU = true;
        }
        System.assert(hasEU, 'Should find EU deals');
    }

    @isTest
    static void testGetPipelineData_ProductFilter() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        List<PipelineReviewController.PipelineRow> rows =
            PipelineReviewController.getPipelineData('All', '', false, 'AI Compliance - Technology');
        Test.stopTest();
        // Should find the explicit compliance deal + the multi-product deal (Compliance;Sigma)
        System.assert(rows.size() >= 2, 'Should find compliance deals including multi-select. Found: ' + rows.size());
    }

    @isTest
    static void testGetPipelineData_StageFilter() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        List<PipelineReviewController.PipelineRow> rows =
            PipelineReviewController.getPipelineData('All', 'Stage 2', false, 'All');
        Test.stopTest();
        System.assertNotEquals(null, rows);
    }

    @isTest
    static void testGetPipelineData_ChangesOnly() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        List<PipelineReviewController.PipelineRow> rows =
            PipelineReviewController.getPipelineData('All', '', true, 'All');
        Test.stopTest();
        System.assertNotEquals(null, rows);
    }

    @isTest
    static void testGetProductLineOptions() {
        Test.startTest();
        List<String> options = PipelineReviewController.getProductLineOptions();
        Test.stopTest();
        System.assert(options.size() >= 2, 'Should have at least 2 product options');
        System.assert(options.contains('AI Compliance - Technology'), 'Should include AI Compliance - Technology');
        System.assert(options.contains('AI Contracting - Technology'), 'Should include AI Contracting - Technology');
    }

    @isTest
    static void testGetOppChangeData() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        PipelineReviewController.PipelineRow row =
            PipelineReviewController.getOppChangeData(opp.Id);
        Test.stopTest();
        System.assertEquals('Test Corp', row.accountName);
        System.assertEquals(150000, row.acv);
    }

    @isTest
    static void testGetOppHistory() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        List<PipelineReviewController.HistoryRow> history =
            PipelineReviewController.getOppHistory(opp.Id);
        Test.stopTest();
        System.assertNotEquals(null, history);
    }

    @isTest
    static void testGetPipelineSummary() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        PipelineReviewController.PipelineSummary summary =
            PipelineReviewController.getPipelineSummary();
        Test.stopTest();
        System.assert(summary.totalDeals >= 4, 'Should count at least 4 deals');
        System.assert(summary.totalACV >= 700000, 'Should sum ACV');
    }

    @isTest
    static void testUpdateOpportunityField_ACV() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        String result = PipelineReviewController.updateOpportunityField(opp.Id, 'ACV__c', '175000');
        Test.stopTest();
        System.assertEquals('OK', result);
        Opportunity updated = [SELECT ACV__c FROM Opportunity WHERE Id = :opp.Id];
        System.assertEquals(175000, updated.ACV__c);
    }

    @isTest
    static void testUpdateOpportunityField_Stage() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        String result = PipelineReviewController.updateOpportunityField(opp.Id, 'StageName', 'Stage 3 - Pilot');
        Test.stopTest();
        System.assertEquals('OK', result);
    }

    @isTest
    static void testUpdateOpportunityField_NextSteps() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        String result = PipelineReviewController.updateOpportunityField(opp.Id, 'Next_Steps__c', 'Follow up next week');
        Test.stopTest();
        System.assertEquals('OK', result);
    }

    @isTest
    static void testUpdateOpportunityField_UnknownField() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE ACV__c = 150000 LIMIT 1];
        Test.startTest();
        String result = PipelineReviewController.updateOpportunityField(opp.Id, 'Bogus__c', 'value');
        Test.stopTest();
        System.assert(result.startsWith('Unknown field'), 'Should reject unknown field');
    }

    @isTest
    static void testGetPipelineData_MultiSelectIncludes() {
        PipelineReviewController.testForceNotNew = true;
        Test.startTest();
        // Filter by AI Platform - Sigma — should find the multi-product deal
        // (it has 'AI Compliance - Technology;AI Platform - Sigma')
        List<PipelineReviewController.PipelineRow> sigmaRows =
            PipelineReviewController.getPipelineData('All', '', false, 'AI Platform - Sigma');
        Test.stopTest();
        System.assert(sigmaRows.size() >= 1, 'Should find multi-select deal containing Sigma');
    }

    @isTest
    static void testNormalizeProductCategory() {
        System.assertEquals('Multiple', PipelineReviewController.normalizeProductCategory('Multiple'));
        System.assertEquals('AI Compliance', PipelineReviewController.normalizeProductCategory('AI Compliance - Technology'));
        System.assertEquals('AI Compliance', PipelineReviewController.normalizeProductCategory('AI-Augmented Compliance_In-House Technology'));
        System.assertEquals('AI Contracting', PipelineReviewController.normalizeProductCategory('AI Contracting - Technology'));
        System.assertEquals('AI Contracting MS', PipelineReviewController.normalizeProductCategory('AI Contracting - Managed Services'));
        System.assertEquals('Contracting BAU', PipelineReviewController.normalizeProductCategory('Contracting-BAU'));
        System.assertEquals('Secondee', PipelineReviewController.normalizeProductCategory('Contracting - Secondee'));
        System.assertEquals('Secondee', PipelineReviewController.normalizeProductCategory('Other - Secondee'));
        System.assertEquals('AI M&A', PipelineReviewController.normalizeProductCategory('AI M&A - Managed Services'));
        System.assertEquals('Sigma', PipelineReviewController.normalizeProductCategory('AI Platform - Sigma'));
        System.assertEquals('Insights', PipelineReviewController.normalizeProductCategory('AI Platform - Insights'));
        System.assertEquals('Litigation', PipelineReviewController.normalizeProductCategory('AI Platform - Litigation'));
        System.assertEquals('FDE', PipelineReviewController.normalizeProductCategory('FDE - Custom AI Solution'));
        System.assertEquals('DSAR', PipelineReviewController.normalizeProductCategory('DSAR'));
        System.assertEquals('Undetermined', PipelineReviewController.normalizeProductCategory('Undetermined'));
        System.assertEquals('Other', PipelineReviewController.normalizeProductCategory('Other'));
        System.assertEquals('Other', PipelineReviewController.normalizeProductCategory('Other - Managed Service'));
        System.assertEquals(null, PipelineReviewController.normalizeProductCategory(null));
        System.assertEquals(null, PipelineReviewController.normalizeProductCategory(''));
    }

    @isTest
    static void testCategoryToLikePattern() {
        System.assertEquals('%Compliance%', PipelineReviewController.categoryToLikePattern('AI Compliance'));
        System.assertEquals('%Contract%', PipelineReviewController.categoryToLikePattern('AI Contracting'));
        System.assertEquals('%M&A%', PipelineReviewController.categoryToLikePattern('AI M&A'));
        System.assertEquals('%Sigma%', PipelineReviewController.categoryToLikePattern('Sigma'));
        System.assertEquals('%Unknown Product%', PipelineReviewController.categoryToLikePattern('Unknown Product'));
    }

    @isTest
    static void testStageDirection() {
        System.assertEquals(1, PipelineReviewController.stageDirection('Stage 1 - Discovery', 'Stage 2 - SQO'));
        System.assertEquals(-1, PipelineReviewController.stageDirection('Stage 3 - Pilot', 'Stage 1 - Discovery'));
        System.assertEquals(0, PipelineReviewController.stageDirection('Stage 2 - SQO', 'Stage 2 - SQO'));
        System.assertEquals(0, PipelineReviewController.stageDirection(null, 'Stage 2 - SQO'));
    }

    @isTest
    static void testAbbreviateStage() {
        System.assertEquals('S0', PipelineReviewController.abbreviateStage('Stage 0 - Prospecting'));
        System.assertEquals('S2', PipelineReviewController.abbreviateStage('Stage 2 - SQO'));
        System.assertEquals('S5', PipelineReviewController.abbreviateStage('Stage 5 - Negotiation'));
        System.assertEquals('Won', PipelineReviewController.abbreviateStage('Closed Won'));
        System.assertEquals('Lost', PipelineReviewController.abbreviateStage('Closed Lost'));
        System.assertEquals('', PipelineReviewController.abbreviateStage(null));
    }

    @isTest
    static void testPipelineRowWithChanges() {
        PipelineReviewController.testForceNotNew = true;
        Opportunity opp = [
            SELECT Id, Name, AccountId, Account.Name, Account.Customer_Type__c,
                Account.Customer_Subtype__c, ACV__c, StageName, Target_LOI_Date__c,
                BL_Forecast_Category__c, Owner.Name, OwnerId, Pod__c, Eudia_Tech__c,
                Product_Lines_Multi__c, Next_Steps__c, CreatedDate, Probability,
                Quarterly_Commit__c, Weighted_ACV_AI_Enabled__c, Blended_Forecast_base__c,
                BL_Quarterly_Forecast__c, AI_Enabled_Quarterly_Forecast_Net__c,
                Renewal_Net_Change__c, Prior_Opp_ACV__c,
                Q1_2026_Commit_Snapshot__c, Q1_2026_ACV_Snapshot__c,
                Q1_2026_Forecast_Category_Snapshot__c
            FROM Opportunity WHERE ACV__c = 200000 LIMIT 1
        ];

        Map<String, PipelineReviewController.FieldChange> changes = new Map<String, PipelineReviewController.FieldChange>();
        changes.put('ACV__c', new PipelineReviewController.FieldChange('ACV__c', 180000, 200000, Datetime.now()));
        changes.put('StageName', new PipelineReviewController.FieldChange('StageName', 'Stage 2 - SQO', 'Stage 3 - Pilot', Datetime.now()));

        Test.startTest();
        PipelineReviewController.PipelineRow row = new PipelineReviewController.PipelineRow(opp, changes);
        Test.stopTest();

        System.assertEquals(true, row.anyChange);
        System.assertEquals(true, row.stageChanged);
        System.assertEquals(1, row.stageDir);
        System.assertEquals('Commit', row.forecastCategory);
        System.assertNotEquals(null, row.blendedForecast);
    }

    @isTest
    static void testGetClosedWonQTD() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Opportunity wonOpp = new Opportunity(
            Name = 'Won Deal',
            AccountId = acct.Id,
            StageName = 'Closed Won',
            CloseDate = Date.today(),
            ACV__c = 300000,
            Revenue_Type__c = 'Recurring',
            Pod__c = 'US',
            Opportunity_Source__c = 'Inbound'
        );
        insert wonOpp;

        Test.startTest();
        List<PipelineReviewController.ClosedWonRow> rows =
            PipelineReviewController.getClosedWonQTD();
        Test.stopTest();

        System.assert(rows.size() >= 1, 'Should return at least 1 closed won deal');
        Boolean found = false;
        for (PipelineReviewController.ClosedWonRow r : rows) {
            if (r.acv == 300000 && r.revenueType == 'Recurring') {
                found = true;
                System.assertEquals('Test Corp', r.accountName);
            }
        }
        System.assert(found, 'Should find the test won deal');
    }
}
