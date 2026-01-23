// Quick Setup - Creates BL records and runs calculation
// Simplified version without Pod field

// Find active BLs
List<String> blNames = new List<String>{
    'Julie Stefanich', 'Ananth Cherukapally', 'Asad Hussain', 
    'Olivia Jung', 'Alex Fox', 'Nathan Shine', 'Conor Molloy'
};

Map<String, User> usersByName = new Map<String, User>();
for (User u : [SELECT Id, Name FROM User WHERE Name IN :blNames AND IsActive = true]) {
    usersByName.put(u.Name, u);
    System.debug('Found user: ' + u.Name);
}

System.debug('Found ' + usersByName.size() + ' users out of ' + blNames.size() + ' expected');

// Check existing records
Set<Id> existingBLIds = new Set<Id>();
for (BL_Performance_Metrics__c m : [SELECT Business_Lead__c FROM BL_Performance_Metrics__c]) {
    existingBLIds.add(m.Business_Lead__c);
}
System.debug('Existing records: ' + existingBLIds.size());

// Create records for BLs that don't have one
List<BL_Performance_Metrics__c> toInsert = new List<BL_Performance_Metrics__c>();
for (String name : usersByName.keySet()) {
    User u = usersByName.get(name);
    if (!existingBLIds.contains(u.Id)) {
        BL_Performance_Metrics__c m = new BL_Performance_Metrics__c(
            Business_Lead__c = u.Id,
            Start_Date__c = Date.newInstance(2024, 6, 1),
            Ramp_Milestone__c = 2000000,
            Active__c = true
        );
        toInsert.add(m);
        System.debug('Creating record for: ' + name);
    } else {
        System.debug('Record already exists for: ' + name);
    }
}

if (!toInsert.isEmpty()) {
    insert toInsert;
    System.debug('Successfully inserted ' + toInsert.size() + ' new records');
} else {
    System.debug('No new records to insert');
}

// Run the calculation service
System.debug('Running metrics calculation...');
BLMetricsCalculationService.calculateAllMetrics();
System.debug('Done! Check the records for updated values.');

