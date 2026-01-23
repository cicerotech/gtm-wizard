/**
 * Test class for BLMetricsScheduler
 * 
 * @author GTM Brain
 * @date January 2026
 */
@isTest
private class BLMetricsSchedulerTest {
    
    @testSetup
    static void setupTestData() {
        // Create a test user
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        
        User testUser = new User(
            FirstName = 'Test',
            LastName = 'BL2',
            Email = 'testbl2@eudia.test',
            Username = 'testbl2@eudia.test.' + System.currentTimeMillis(),
            Alias = 'tbl2',
            TimeZoneSidKey = 'America/New_York',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            ProfileId = p.Id,
            LanguageLocaleKey = 'en_US'
        );
        insert testUser;
        
        // Create a BL Performance Metrics record
        BL_Performance_Metrics__c metrics = new BL_Performance_Metrics__c(
            Business_Lead__c = testUser.Id,
            Pod__c = 'EU',
            Start_Date__c = Date.newInstance(2024, 3, 1),
            Ramp_Milestone__c = 2000000,
            Active__c = true
        );
        insert metrics;
    }
    
    @isTest
    static void testSchedulerExecute() {
        Test.startTest();
        
        BLMetricsScheduler scheduler = new BLMetricsScheduler();
        String cronExp = '0 0 6 ? * MON';
        String jobId = System.schedule('Test BL Metrics', cronExp, scheduler);
        
        Test.stopTest();
        
        // Verify job was scheduled
        CronTrigger ct = [
            SELECT Id, CronExpression, TimesTriggered 
            FROM CronTrigger 
            WHERE Id = :jobId
        ];
        
        System.assertEquals(cronExp, ct.CronExpression, 'Cron expression should match');
    }
    
    @isTest
    static void testScheduleWeekly() {
        Test.startTest();
        String jobId = BLMetricsScheduler.scheduleWeekly();
        Test.stopTest();
        
        System.assertNotEquals(null, jobId, 'Job ID should be returned');
        
        // Verify job exists
        List<CronTrigger> jobs = [
            SELECT Id FROM CronTrigger 
            WHERE CronJobDetail.Name = 'BL Metrics Weekly Refresh'
        ];
        System.assertEquals(1, jobs.size(), 'Job should be scheduled');
    }
    
    @isTest
    static void testUnschedule() {
        // First schedule
        BLMetricsScheduler.scheduleWeekly();
        
        Test.startTest();
        BLMetricsScheduler.unschedule();
        Test.stopTest();
        
        // Verify job was removed
        List<CronTrigger> jobs = [
            SELECT Id FROM CronTrigger 
            WHERE CronJobDetail.Name = 'BL Metrics Weekly Refresh'
        ];
        System.assertEquals(0, jobs.size(), 'Job should be unscheduled');
    }
}

