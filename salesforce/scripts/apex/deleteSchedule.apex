// Delete the scheduled job so we can deploy updates
List<CronTrigger> jobs = [SELECT Id, CronJobDetail.Name FROM CronTrigger WHERE CronJobDetail.Name LIKE '%BL Metrics%'];
for (CronTrigger job : jobs) {
    System.abortJob(job.Id);
    System.debug('Deleted job: ' + job.CronJobDetail.Name);
}
System.debug('Deleted ' + jobs.size() + ' scheduled jobs');

