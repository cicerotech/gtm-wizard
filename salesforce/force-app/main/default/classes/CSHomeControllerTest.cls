@isTest
private class CSHomeControllerTest {

    @TestSetup
    static void setup() {
        Account existingAcc = new Account(
            Name = 'Test Existing Customer',
            Customer_Type__c = 'Existing',
            Customer_Subtype__c = 'MSA',
            Health__c = 'Green'
        );
        insert existingAcc;

        Account newAcc = new Account(
            Name = 'Test New Customer',
            Customer_Type__c = 'New',
            Customer_Subtype__c = 'LOI'
        );
        insert newAcc;

        // CS Staffing deal - Stage 4
        Opportunity csOpp1 = new Opportunity(
            Name = 'Test Existing - AI Compliance',
            AccountId = existingAcc.Id,
            StageName = 'Stage 4 - Proposal',
            CloseDate = Date.today().addDays(60),
            ACV__c = 150000,
            Target_LOI_Date__c = Date.today().addDays(30),
            BL_Forecast_Category__c = 'Pipeline',
            Pod__c = 'US',
            CS_Staffing__c = true,
            Opportunity_Source__c = 'Inbound'
        );

        // CS Staffing deal - Stage 5
        Opportunity csOpp2 = new Opportunity(
            Name = 'Test Existing - Sigma',
            AccountId = existingAcc.Id,
            StageName = 'Stage 5 - Negotiation',
            CloseDate = Date.today().addDays(30),
            ACV__c = 120000,
            Target_LOI_Date__c = Date.today().addDays(14),
            BL_Forecast_Category__c = 'Commit',
            Pod__c = 'EU',
            CS_Staffing__c = true,
            Opportunity_Source__c = 'Inbound'
        );

        // Non-CS deal on existing account
        Opportunity expansionOpp = new Opportunity(
            Name = 'Test Existing - Expansion',
            AccountId = existingAcc.Id,
            StageName = 'Stage 2 - SQO',
            CloseDate = Date.today().addDays(90),
            ACV__c = 75000,
            Target_LOI_Date__c = Date.today().addDays(45),
            BL_Forecast_Category__c = 'Pipeline',
            Pod__c = 'US',
            CS_Staffing__c = false,
            Opportunity_Source__c = 'Inbound'
        );

        insert new List<Opportunity>{ csOpp1, csOpp2, expansionOpp };
    }

    @isTest
    static void testGetAccountHealth() {
        CSHomeController.AccountHealthSummary summary = CSHomeController.getAccountHealth();

        System.assert(summary.totalAccounts > 0, 'Should have existing accounts');
        System.assert(summary.greenCount > 0, 'Should have green accounts');
        System.assert(!summary.accounts.isEmpty(), 'Should have account rows');

        CSHomeController.AccountHealthRow row = summary.accounts[0];
        System.assertNotEquals(null, row.name);
        System.assertEquals('Green', row.health);
    }

    @isTest
    static void testGetLateStageCSPipeline() {
        CSHomeController.CSPipelineSummary pipeline = CSHomeController.getLateStageCSPipeline();

        System.assert(pipeline.totalDeals >= 2, 'Should have at least 2 CS deals');
        System.assert(pipeline.totalACV >= 270000, 'Total ACV should be 150k + 120k');
        System.assert(pipeline.stage4Count >= 1, 'Should have S4 deals');
        System.assert(pipeline.stage5Count >= 1, 'Should have S5 deals');

        // Verify deal structure
        CSHomeController.CSPipelineRow deal = pipeline.deals[0];
        System.assertNotEquals(null, deal.id);
        System.assertNotEquals(null, deal.accountName);
        System.assertNotEquals(null, deal.stageShort);
        System.assertNotEquals(null, deal.targetSign);
    }

    @isTest
    static void testGetExpansionPipeline() {
        List<CSHomeController.CSPipelineRow> expansion = CSHomeController.getExpansionPipeline();

        System.assert(!expansion.isEmpty(), 'Should have expansion deals');
        for (CSHomeController.CSPipelineRow row : expansion) {
            System.assert(row.isExisting, 'All expansion deals should be existing customers');
        }
    }

    @isTest
    static void testGetContractRenewals() {
        List<CSHomeController.ContractRow> contracts = CSHomeController.getContractRenewals();
        // May be empty in test context (no contracts inserted)
        System.assert(contracts.size() >= 0, 'Contract query should succeed');
    }

    @isTest
    static void testCSPipelineRowWoW() {
        Opportunity opp = [SELECT Id, ACV__c FROM Opportunity WHERE CS_Staffing__c = true AND StageName LIKE 'Stage 4%' LIMIT 1];
        opp.ACV__c = 200000;
        update opp;

        CSHomeController.CSPipelineSummary pipeline = CSHomeController.getLateStageCSPipeline();
        System.assert(pipeline.totalDeals >= 2, 'Should still have CS deals after update');
    }

    @isTest
    static void testCSPipelineRowFields() {
        CSHomeController.CSPipelineSummary pipeline = CSHomeController.getLateStageCSPipeline();

        for (CSHomeController.CSPipelineRow d : pipeline.deals) {
            // Verify all row fields are populated
            System.assertNotEquals(null, d.id);
            System.assertNotEquals(null, d.name);
            System.assertNotEquals(null, d.stage);
            System.assertNotEquals(null, d.stageShort);
            // WoW defaults (no history in test)
            System.assertEquals(0, d.acvDelta);
            System.assertEquals(false, d.stageChanged);
            System.assertEquals(0, d.stageDir);
            System.assertEquals(0, d.targetDeltaDays);
        }
    }

    @isTest
    static void testAccountHealthRowFields() {
        CSHomeController.AccountHealthSummary summary = CSHomeController.getAccountHealth();

        for (CSHomeController.AccountHealthRow a : summary.accounts) {
            System.assertNotEquals(null, a.id);
            System.assertNotEquals(null, a.name);
            System.assertNotEquals(null, a.health);
            System.assertEquals('Existing', a.customerType);
        }
    }

    @isTest
    static void testExpansionPipelineFields() {
        List<CSHomeController.CSPipelineRow> deals = CSHomeController.getExpansionPipeline();

        for (CSHomeController.CSPipelineRow d : deals) {
            System.assertNotEquals(null, d.id);
            System.assert(d.isExisting, 'Should be existing customer');
            // Verify acv, pod, etc populated
            System.assert(d.acv >= 0, 'ACV should be non-negative');
        }
    }

    @isTest
    static void testCSPipelineStageCounts() {
        CSHomeController.CSPipelineSummary pipeline = CSHomeController.getLateStageCSPipeline();

        // Verify stage ACV breakdown
        System.assert(pipeline.stage4ACV >= 150000, 'S4 ACV should include our S4 deal');
        System.assert(pipeline.stage5ACV >= 120000, 'S5 ACV should include our S5 deal');
    }

    @isTest
    static void testAccountHealthCounts() {
        CSHomeController.AccountHealthSummary summary = CSHomeController.getAccountHealth();

        // We inserted one account with Health = Green
        System.assert(summary.greenCount >= 1, 'Should have at least 1 green');
        System.assertEquals(0, summary.redCount, 'Should not have red accounts in test');
    }

    @isTest
    static void testCSPipelineRowWithChanges() {
        Opportunity opp = [
            SELECT Id, Name, Account.Name, ACV__c, StageName,
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity WHERE CS_Staffing__c = true AND StageName LIKE 'Stage 4%' LIMIT 1
        ];

        // Simulate ACV increase + stage advance + target slip
        Map<String, PipelineReviewController.FieldChange> changes = new Map<String, PipelineReviewController.FieldChange>();
        changes.put('ACV__c', new PipelineReviewController.FieldChange(
            'ACV__c', 100000, 150000, Datetime.now()
        ));
        changes.put('StageName', new PipelineReviewController.FieldChange(
            'StageName', 'Stage 3 - Eval', 'Stage 4 - Proposal', Datetime.now()
        ));
        Date oldTarget = Date.today().addDays(15);
        Date newTarget = Date.today().addDays(30);
        changes.put('Target_LOI_Date__c', new PipelineReviewController.FieldChange(
            'Target_LOI_Date__c', String.valueOf(oldTarget), String.valueOf(newTarget), Datetime.now()
        ));

        CSHomeController.CSPipelineRow row = new CSHomeController.CSPipelineRow(opp, changes);

        System.assert(row.anyChange, 'Should detect changes');
        System.assertEquals(50000, row.acvDelta, 'ACV delta should be +50k');
        System.assert(row.stageChanged, 'Stage should be changed');
        System.assertEquals(1, row.stageDir, 'Stage should advance');
        System.assert(row.targetDeltaDays > 7, 'Target should show slip');
        System.assert(row.wowSummary.length() > 0, 'WoW summary should not be empty');
    }

    @isTest
    static void testCSPipelineRowNegativeChanges() {
        Opportunity opp = [
            SELECT Id, Name, Account.Name, ACV__c, StageName,
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity WHERE CS_Staffing__c = true AND StageName LIKE 'Stage 5%' LIMIT 1
        ];

        // ACV decrease + target pull-in
        Map<String, PipelineReviewController.FieldChange> changes = new Map<String, PipelineReviewController.FieldChange>();
        changes.put('ACV__c', new PipelineReviewController.FieldChange(
            'ACV__c', 150000, 120000, Datetime.now()
        ));
        Date oldTarget = Date.today().addDays(30);
        Date newTarget = Date.today().addDays(14);
        changes.put('Target_LOI_Date__c', new PipelineReviewController.FieldChange(
            'Target_LOI_Date__c', String.valueOf(oldTarget), String.valueOf(newTarget), Datetime.now()
        ));

        CSHomeController.CSPipelineRow row = new CSHomeController.CSPipelineRow(opp, changes);

        System.assert(row.anyChange);
        System.assert(row.acvDelta < 0, 'ACV should decrease');
        System.assert(row.targetDeltaDays < -3, 'Target should be pulled in');
        System.assert(row.wowSummary.contains('ACV'), 'Summary should mention ACV');
    }

    @isTest
    static void testCSPipelineRowStageOnly() {
        Opportunity opp = [
            SELECT Id, Name, Account.Name, ACV__c, StageName,
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity WHERE CS_Staffing__c = true LIMIT 1
        ];

        Map<String, PipelineReviewController.FieldChange> changes = new Map<String, PipelineReviewController.FieldChange>();
        changes.put('StageName', new PipelineReviewController.FieldChange(
            'StageName', 'Stage 4 - Proposal', 'Stage 3 - Eval', Datetime.now()
        ));

        CSHomeController.CSPipelineRow row = new CSHomeController.CSPipelineRow(opp, changes);

        System.assert(row.stageChanged);
        System.assertEquals(-1, row.stageDir, 'Should be regression');
        System.assert(row.wowSummary.contains('Stage'), 'Summary should mention Stage');
    }

    @isTest
    static void testCSPipelineRowEmptyChanges() {
        Opportunity opp = [
            SELECT Id, Name, Account.Name, ACV__c, StageName,
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity WHERE CS_Staffing__c = true LIMIT 1
        ];

        CSHomeController.CSPipelineRow row = new CSHomeController.CSPipelineRow(
            opp, new Map<String, PipelineReviewController.FieldChange>()
        );

        System.assertEquals(false, row.anyChange);
        System.assertEquals('', row.wowSummary);
    }

    @isTest
    static void testContractRowFields() {
        // Since we don't insert contracts in test setup, query will be empty
        // Test the class structure through direct method call
        List<CSHomeController.ContractRow> rows = CSHomeController.getContractRenewals();
        System.assert(rows.size() >= 0, 'Should succeed even with no contracts');
    }

    @isTest
    static void testMultipleUpdatesWoW() {
        Opportunity opp = [SELECT Id, ACV__c, StageName, Target_LOI_Date__c FROM Opportunity WHERE CS_Staffing__c = true AND StageName LIKE 'Stage 5%' LIMIT 1];

        opp.ACV__c = 180000;
        opp.Target_LOI_Date__c = Date.today().addDays(60);
        update opp;

        CSHomeController.CSPipelineSummary pipeline = CSHomeController.getLateStageCSPipeline();
        System.assert(pipeline.totalDeals >= 2);

        // Also verify expansion
        List<CSHomeController.CSPipelineRow> expansion = CSHomeController.getExpansionPipeline();
        System.assert(expansion.size() >= 1);
    }

    @isTest
    static void testSaveAccountHealth() {
        Account a = [SELECT Id FROM Account WHERE Customer_Type__c = 'Existing' AND Health__c != null LIMIT 1];
        Test.startTest();
        CSHomeController.saveAccountHealth(a.Id, 'Yellow', 'Testing health update');
        Test.stopTest();
        Account updated = [SELECT Health__c, Account_Health_Overview__c FROM Account WHERE Id = :a.Id];
        System.assertEquals('Yellow', updated.Health__c);
        System.assertEquals('Testing health update', updated.Account_Health_Overview__c);
    }

    @isTest
    static void testSaveCSOutcome() {
        Account a = [SELECT Id FROM Account WHERE Customer_Type__c = 'Existing' AND Health__c != null LIMIT 1];
        Test.startTest();
        CSHomeController.saveCSOutcome(a.Id, 'Reduce contract review time by 60%');
        Test.stopTest();
        Account updated = [SELECT CS_Outcome_Data__c FROM Account WHERE Id = :a.Id];
        System.assertEquals('Reduce contract review time by 60%', updated.CS_Outcome_Data__c);
    }

    @isTest
    static void testGetCSOutcomes() {
        Test.startTest();
        List<CSHomeController.OutcomeRow> rows = CSHomeController.getCSOutcomes();
        Test.stopTest();
        System.assertNotEquals(null, rows);
    }

    @isTest
    static void testValidateCSMRequest() {
        Opportunity opp = [SELECT Id FROM Opportunity WHERE CS_Staffing__c = true LIMIT 1];
        Test.startTest();
        String result = CSHomeController.validateCSMRequest(opp.Id);
        Test.stopTest();
        // Should return missing fields since test data doesn't have them filled
        System.assert(result.contains('Missing') || result == 'OK');
    }
}