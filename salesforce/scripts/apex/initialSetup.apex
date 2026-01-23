/**
 * Initial Setup Script for BL Performance Metrics
 * 
 * Run this ONCE in Developer Console (Anonymous Apex) after deploying the object and Apex classes.
 * 
 * This script:
 * 1. Creates BL_Performance_Metrics__c records for each Business Lead
 * 2. Sets their Pod (US/EU), Start Date, and Ramp Status
 * 3. Runs the initial calculation to populate metrics
 * 
 * BL ROSTER (from BL Productivity Report Dec 2025):
 * - Mature BLs (6): Julie Stefanich, Ananth Cherukapally, Asad Hussain, Olivia Jung, Alex Fox, Nathan Shine
 * - Ramping BLs (1): Conor Molloy (started ~Jun 2025, ramping through Dec 2025)
 * 
 * RAMP ASSUMPTIONS:
 * - 6-month ramp period to reach full productivity
 * - $2M ACV milestone = "fully ramped"
 * - Avg BL Productivity benchmark: ~$350K/month (mature BLs)
 */

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Define BL roster with Pod, Start Dates, and Ramp Status
// ═══════════════════════════════════════════════════════════════════════════
// Start dates estimated based on "Mature" status as of Jun-25 (6+ months tenure)
Map<String, Map<String, Object>> blRoster = new Map<String, Map<String, Object>>{
    
    // ═══════════════════════════════════════════════════════════════════════
    // MATURE BLs (6) - Fully ramped, 6+ months tenure
    // ═══════════════════════════════════════════════════════════════════════
    
    'Julie Stefanich' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 6, 1),   // Mature by Jun-25 = started before Dec-24
        'isRamping' => false
    },
    'Ananth Cherukapally' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 9, 1),   // Mature by Jun-25
        'isRamping' => false
    },
    'Asad Hussain' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 10, 1),  // Mature by Jun-25
        'isRamping' => false
    },
    'Olivia Jung' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2024, 11, 1),  // Mature by Jun-25
        'isRamping' => false
    },
    
    // EU Pod - Mature
    'Alex Fox' => new Map<String, Object>{
        'pod' => 'EU',
        'startDate' => Date.newInstance(2024, 8, 1),   // Mature by Jun-25
        'isRamping' => false
    },
    'Nathan Shine' => new Map<String, Object>{
        'pod' => 'EU',
        'startDate' => Date.newInstance(2024, 7, 1),   // Mature by Jun-25
        'isRamping' => false
    },
    
    // ═══════════════════════════════════════════════════════════════════════
    // RAMPING BLs (1) - In 6-month ramp period
    // ═══════════════════════════════════════════════════════════════════════
    
    'Conor Molloy' => new Map<String, Object>{
        'pod' => 'US',
        'startDate' => Date.newInstance(2025, 6, 1),   // First revenue Oct-25 = ~4 months in
        'isRamping' => true
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

