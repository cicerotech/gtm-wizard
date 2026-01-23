// Schedule the BL Metrics calculation to run every Monday at 6am
String cronExp = '0 0 6 ? * MON';
BLMetricsScheduler scheduler = new BLMetricsScheduler();
String jobId = System.schedule('BL Metrics Weekly Refresh', cronExp, scheduler);
System.debug('Scheduled job ID: ' + jobId);
System.debug('BL Metrics will now recalculate every Monday at 6am.');

