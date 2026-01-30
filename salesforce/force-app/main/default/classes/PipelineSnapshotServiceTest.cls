/**
 * PipelineSnapshotServiceTest
 * Test class for PipelineSnapshotService
 */
@isTest
private class PipelineSnapshotServiceTest {
    
    @TestSetup
    static void setupTestData() {
        // Create test user (use existing running user to avoid mixed DML)
        User testUser = [SELECT Id FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        
        // Create test account
        Account testAccount = new Account(
            Name = 'Test Account for Pipeline Snapshot'
        );
        insert testAccount;
        
        // Create test opportunities in different stages
        List<Opportunity> opps = new List<Opportunity>();
        
        // Stage 1 opportunity
        opps.add(new Opportunity(
            Name = 'Test Opp Stage 1',
            AccountId = testAccount.Id,
            StageName = 'Stage 1. Prospect',
            CloseDate = Date.today().addDays(30),
            ACV__c = 50000,
            OwnerId = testUser.Id,
            Opportunity_Source__c = 'Inbound'
        ));
        
        // Stage 3 opportunity
        opps.add(new Opportunity(
            Name = 'Test Opp Stage 3',
            AccountId = testAccount.Id,
            StageName = 'Stage 3. Discovery',
            CloseDate = Date.today().addDays(60),
            ACV__c = 100000,
            OwnerId = testUser.Id,
            Opportunity_Source__c = 'Inbound'
        ));
        
        // Stage 5 opportunity
        opps.add(new Opportunity(
            Name = 'Test Opp Stage 5',
            AccountId = testAccount.Id,
            StageName = 'Stage 5. Contract',
            CloseDate = Date.today().addDays(14),
            ACV__c = 200000,
            OwnerId = testUser.Id,
            Opportunity_Source__c = 'Inbound'
        ));
        
        insert opps;
    }
    
    @isTest
    static void testCreateSnapshots() {
        Test.startTest();
        PipelineSnapshotService.createSnapshots();
        Test.stopTest();
        
        // Verify snapshots were created
        List<Pipeline_Snapshot__c> snapshots = [
            SELECT Id, Business_Lead__c, Total_Pipeline_ACV__c, 
                   Opp_Count_Stage_1_2__c, Opp_Count_Stage_3_4__c, Opp_Count_Stage_5_Plus__c,
                   Total_Opp_Count__c, Weighted_Pipeline__c
            FROM Pipeline_Snapshot__c
        ];
        
        System.assert(snapshots.size() > 0, 'Should have created at least one snapshot');
        
        Pipeline_Snapshot__c snapshot = snapshots[0];
        System.assertEquals(350000, snapshot.Total_Pipeline_ACV__c, 'Total ACV should be 350000');
        System.assertEquals(3, snapshot.Total_Opp_Count__c, 'Should have 3 opportunities');
        System.assertEquals(1, snapshot.Opp_Count_Stage_1_2__c, 'Should have 1 early stage opp');
        System.assertEquals(1, snapshot.Opp_Count_Stage_3_4__c, 'Should have 1 mid stage opp');
        System.assertEquals(1, snapshot.Opp_Count_Stage_5_Plus__c, 'Should have 1 late stage opp');
    }
    
    @isTest
    static void testDuplicatePrevention() {
        // Create first set of snapshots
        PipelineSnapshotService.createSnapshots();
        
        Integer initialCount = [SELECT COUNT() FROM Pipeline_Snapshot__c];
        
        Test.startTest();
        // Try to create again - should be skipped
        PipelineSnapshotService.createSnapshots();
        Test.stopTest();
        
        Integer finalCount = [SELECT COUNT() FROM Pipeline_Snapshot__c];
        System.assertEquals(initialCount, finalCount, 'Should not create duplicate snapshots');
    }
    
    @isTest
    static void testSchedulableExecution() {
        Test.startTest();
        
        String jobId = System.schedule(
            'Test Pipeline Snapshot', 
            '0 0 8 ? * SUN', 
            new PipelineSnapshotService()
        );
        
        Test.stopTest();
        
        System.assertNotEquals(null, jobId, 'Job should be scheduled');
    }
    
    @isTest
    static void testPurgeOldSnapshots() {
        // Create an old snapshot
        Pipeline_Snapshot__c oldSnapshot = new Pipeline_Snapshot__c(
            Snapshot_Date__c = Date.today().addMonths(-20),
            Business_Lead__c = UserInfo.getUserId(),
            Total_Pipeline_ACV__c = 100000
        );
        insert oldSnapshot;
        
        // Create a recent snapshot
        Pipeline_Snapshot__c recentSnapshot = new Pipeline_Snapshot__c(
            Snapshot_Date__c = Date.today().addDays(-7),
            Business_Lead__c = UserInfo.getUserId(),
            Total_Pipeline_ACV__c = 200000
        );
        insert recentSnapshot;
        
        Test.startTest();
        PipelineSnapshotService.purgeOldSnapshots();
        Test.stopTest();
        
        // Verify old snapshot was deleted, recent was kept
        List<Pipeline_Snapshot__c> remaining = [SELECT Id, Snapshot_Date__c FROM Pipeline_Snapshot__c];
        System.assertEquals(1, remaining.size(), 'Should have 1 remaining snapshot');
        System.assertEquals(Date.today().addDays(-7), remaining[0].Snapshot_Date__c, 
            'Recent snapshot should remain');
    }
    
    @isTest
    static void testWeightedPipeline() {
        Test.startTest();
        PipelineSnapshotService.createSnapshots();
        Test.stopTest();
        
        Pipeline_Snapshot__c snapshot = [
            SELECT Weighted_Pipeline__c FROM Pipeline_Snapshot__c LIMIT 1
        ];
        
        // Expected: (50000 * 0.10) + (100000 * 0.40) + (200000 * 0.80) = 5000 + 40000 + 160000 = 205000
        System.assertEquals(205000, snapshot.Weighted_Pipeline__c, 'Weighted pipeline should be 205000');
    }
}
