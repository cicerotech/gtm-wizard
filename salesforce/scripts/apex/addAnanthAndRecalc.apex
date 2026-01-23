// Add Ananth Cherukupally and recalculate all metrics

// Find Ananth
User ananth = [SELECT Id, Name FROM User WHERE Name = 'Ananth Cherukupally' AND IsActive = true LIMIT 1];
System.debug('Found: ' + ananth.Name + ' (' + ananth.Id + ')');

// Check if record exists
List<BL_Performance_Metrics__c> existing = [SELECT Id FROM BL_Performance_Metrics__c WHERE Business_Lead__c = :ananth.Id];

if (existing.isEmpty()) {
    BL_Performance_Metrics__c m = new BL_Performance_Metrics__c(
        Business_Lead__c = ananth.Id,
        Start_Date__c = Date.newInstance(2024, 9, 1),
        Ramp_Milestone__c = 2000000,
        Active__c = true
    );
    insert m;
    System.debug('Created metrics record for Ananth');
} else {
    System.debug('Record already exists for Ananth');
}

// Recalculate all metrics (now includes legacy stage)
BLMetricsCalculationService.calculateAllMetrics();
System.debug('Recalculation complete!');

// Reschedule weekly job
String cronExp = '0 0 6 ? * MON';
String jobId = System.schedule('BL Metrics Weekly Refresh', cronExp, new BLMetricsScheduler());
System.debug('Rescheduled weekly job: ' + jobId);
