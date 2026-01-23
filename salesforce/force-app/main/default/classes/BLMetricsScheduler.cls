/**
 * BLMetricsScheduler
 * 
 * Schedulable Apex class that runs BL Performance Metrics calculations weekly.
 * 
 * Default Schedule: Every Monday at 6:00 AM
 * 
 * To schedule via Developer Console:
 * System.schedule('BL Metrics Weekly Refresh', '0 0 6 ? * MON', new BLMetricsScheduler());
 * 
 * To run immediately for testing:
 * BLMetricsCalculationService.calculateAllMetrics();
 * 
 * @author GTM Brain
 * @date January 2026
 */
global class BLMetricsScheduler implements Schedulable {
    
    /**
     * Execute the scheduled job
     */
    global void execute(SchedulableContext sc) {
        System.debug('BLMetricsScheduler: Starting weekly metrics calculation...');
        
        try {
            BLMetricsCalculationService.calculateAllMetrics();
            System.debug('BLMetricsScheduler: Completed successfully.');
        } catch (Exception e) {
            System.debug('BLMetricsScheduler ERROR: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            // In production, you might want to send an email alert here
        }
    }
    
    /**
     * Helper method to schedule the job
     * Call from Developer Console: BLMetricsScheduler.scheduleWeekly();
     */
    public static String scheduleWeekly() {
        // Every Monday at 6:00 AM
        String cronExp = '0 0 6 ? * MON';
        String jobName = 'BL Metrics Weekly Refresh';
        
        // Check if already scheduled
        List<CronTrigger> existingJobs = [
            SELECT Id, CronJobDetail.Name 
            FROM CronTrigger 
            WHERE CronJobDetail.Name = :jobName
        ];
        
        if (!existingJobs.isEmpty()) {
            System.debug('Job already scheduled with ID: ' + existingJobs[0].Id);
            return existingJobs[0].Id;
        }
        
        String jobId = System.schedule(jobName, cronExp, new BLMetricsScheduler());
        System.debug('Scheduled job with ID: ' + jobId);
        return jobId;
    }
    
    /**
     * Helper method to unschedule the job
     * Call from Developer Console: BLMetricsScheduler.unschedule();
     */
    public static void unschedule() {
        String jobName = 'BL Metrics Weekly Refresh';
        
        List<CronTrigger> jobs = [
            SELECT Id 
            FROM CronTrigger 
            WHERE CronJobDetail.Name = :jobName
        ];
        
        for (CronTrigger job : jobs) {
            System.abortJob(job.Id);
            System.debug('Aborted job: ' + job.Id);
        }
    }
}

