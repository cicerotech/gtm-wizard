/**
 * Initial Setup Script for BL Performance Metrics
 * 
 * Run this ONCE in Developer Console (Anonymous Apex) after deploying the object and Apex classes.
 * 
 * This script:
 * 1. Creates BL_Performance_Metrics__c records for each Business Lead
 * 2. Sets their Pod (US/EU) and Start Date
 * 3. Runs the initial calculation to populate metrics
 * 
 * IMPORTANT: Update the start dates below with actual BL hire/start dates!
 */

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Define BL roster with Pod and Start Dates
// ═══════════════════════════════════════════════════════════════════════════
// UPDATE THESE WITH ACTUAL START DATES!
Map<String, Map<String, Object>> blRoster = new Map<String, Map<String, Object>>{
    // US Pod
    'Asad Hussain' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 6, 1)  // REPLACE with actual start date
    },
    'Julie Stefanich' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 3, 1)  // REPLACE with actual start date
    },
    'Justin Hills' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 8, 1)  // REPLACE with actual start date
    },
    'Mike Masiello' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 9, 1)  // REPLACE with actual start date
    },
    'Olivia Jung' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 7, 1)  // REPLACE with actual start date
    },
    
    // EU Pod
    'Alex Fox' => new Map<String, Object>{
        'pod' => 'EU',
        'startDate' => Date.newInstance(2024, 4, 1)  // REPLACE with actual start date
    },
    'Nathan Shine' => new Map<String, Object>{
        'pod' => 'EU',
        'startDate' => Date.newInstance(2024, 5, 1)  // REPLACE with actual start date
    },
    'Tom Clancy' => new Map<String, Object>{
        'pod' => 'EU',
        'startDate' => Date.newInstance(2024, 6, 1)  // REPLACE with actual start date
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: Find User records for these BLs
// ═══════════════════════════════════════════════════════════════════════════
Set<String> blNames = blRoster.keySet();
Map<String, User> usersByName = new Map<String, User>();

for (User u : [SELECT Id, Name, Email FROM User WHERE Name IN :blNames AND IsActive = true]) {
    usersByName.put(u.Name, u);
    System.debug('Found user: ' + u.Name + ' (' + u.Id + ')');
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: Check for existing metrics records (avoid duplicates)
// ═══════════════════════════════════════════════════════════════════════════
Set<Id> existingBLIds = new Set<Id>();
for (BL_Performance_Metrics__c existing : [SELECT Business_Lead__c FROM BL_Performance_Metrics__c]) {
    existingBLIds.add(existing.Business_Lead__c);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: Create metrics records for each BL
// ═══════════════════════════════════════════════════════════════════════════
List<BL_Performance_Metrics__c> toInsert = new List<BL_Performance_Metrics__c>();

for (String blName : blRoster.keySet()) {
    User u = usersByName.get(blName);
    
    if (u == null) {
        System.debug('WARNING: User not found for ' + blName);
        continue;
    }
    
    if (existingBLIds.contains(u.Id)) {
        System.debug('SKIP: Metrics record already exists for ' + blName);
        continue;
    }
    
    Map<String, Object> data = blRoster.get(blName);
    
    BL_Performance_Metrics__c metrics = new BL_Performance_Metrics__c(
        Business_Lead__c = u.Id,
        Pod__c = (String)data.get('pod'),
        Start_Date__c = (Date)data.get('startDate'),
        Ramp_Milestone__c = 2000000,  // $2M default milestone
        Active__c = true
    );
    
    toInsert.add(metrics);
    System.debug('Created metrics record for ' + blName + ' (Pod: ' + data.get('pod') + ')');
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: Insert records
// ═══════════════════════════════════════════════════════════════════════════
if (!toInsert.isEmpty()) {
    insert toInsert;
    System.debug('Successfully inserted ' + toInsert.size() + ' BL metrics records.');
} else {
    System.debug('No new records to insert.');
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: Run initial calculation
// ═══════════════════════════════════════════════════════════════════════════
System.debug('Running initial metrics calculation...');
BLMetricsCalculationService.calculateAllMetrics();
System.debug('Initial setup complete!');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: Verify results
// ═══════════════════════════════════════════════════════════════════════════
System.debug('=== VERIFICATION ===');
for (BL_Performance_Metrics__c m : [
    SELECT Name, Business_Lead__r.Name, Pod__c, Start_Date__c, 
           Total_Closed_Won_ACV__c, Fiscal_YTD_ACV__c, Is_Ramped__c,
           Ramp_Achieved_Date__c, Days_to_Ramp__c
    FROM BL_Performance_Metrics__c
    WHERE Active__c = true
    ORDER BY Pod__c, Business_Lead__r.Name
]) {
    System.debug(m.Business_Lead__r.Name + ' (' + m.Pod__c + '): ' +
                 'Total ACV: $' + m.Total_Closed_Won_ACV__c + ', ' +
                 'YTD: $' + m.Fiscal_YTD_ACV__c + ', ' +
                 'Ramped: ' + m.Is_Ramped__c + 
                 (m.Days_to_Ramp__c != null ? ', Days to Ramp: ' + m.Days_to_Ramp__c : ''));
}

