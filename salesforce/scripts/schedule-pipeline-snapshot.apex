// Schedule Pipeline Snapshot to run every Sunday at 8:00 AM
// Check if already scheduled first
List<CronTrigger> existing = [SELECT Id, CronJobDetail.Name FROM CronTrigger WHERE CronJobDetail.Name = 'Pipeline Snapshot Weekly'];
if (!existing.isEmpty()) {
    System.debug('Job already scheduled: ' + existing[0].Id);
} else {
    String jobId = System.schedule('Pipeline Snapshot Weekly', '0 0 8 ? * SUN', new PipelineSnapshotService());
    System.debug('Scheduled job with ID: ' + jobId);
}
