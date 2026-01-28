/**
 * Field Population Analysis Script
 * 
 * Purpose: Identify custom fields with low population rates (<5%) on Opportunity and Account objects
 * Output: CSV format for spreadsheet import
 * 
 * Run in: Developer Console > Debug > Open Execute Anonymous Window
 * After running: Check Debug Logs (Debug > Open Execute Anonymous Window results)
 */

// Configuration
Boolean includeStandardFields = false; // Set to true if you want to analyze standard fields too
Integer lowPopulationThreshold = 5; // Percentage threshold for "low population"

// ═══════════════════════════════════════════════════════════════════════════
// OPPORTUNITY FIELD ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('OPPORTUNITY FIELD POPULATION ANALYSIS');
System.debug('═══════════════════════════════════════════════════════════════');

// Get total Opportunity count
Integer totalOpps = [SELECT COUNT() FROM Opportunity];
System.debug('Total Opportunities: ' + totalOpps);
System.debug('');
System.debug('Field API Name,Has Value Count,Population %,Status');

// Get all custom fields on Opportunity
Map<String, Schema.SObjectField> oppFields = Schema.SObjectType.Opportunity.fields.getMap();

List<String> oppCustomFields = new List<String>();
for (String fieldName : oppFields.keySet()) {
    Schema.DescribeFieldResult fieldDesc = oppFields.get(fieldName).getDescribe();
    if (fieldDesc.isCustom() || includeStandardFields) {
        oppCustomFields.add(fieldName);
    }
}

// Query population for each field (batch due to SOQL limits)
for (String fieldName : oppCustomFields) {
    try {
        String countQuery = 'SELECT COUNT() FROM Opportunity WHERE ' + fieldName + ' != null';
        Integer populatedCount = Database.countQuery(countQuery);
        Decimal populationPct = totalOpps > 0 ? (Decimal.valueOf(populatedCount) / totalOpps * 100).setScale(1) : 0;
        
        String status = populationPct < lowPopulationThreshold ? 'LOW' : 'OK';
        System.debug(fieldName + ',' + populatedCount + ',' + populationPct + '%,' + status);
    } catch (Exception e) {
        // Some fields can't be queried directly (formula fields, etc.)
        System.debug(fieldName + ',N/A,N/A,SKIP (formula or compound)');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT FIELD ANALYSIS  
// ═══════════════════════════════════════════════════════════════════════════

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ACCOUNT FIELD POPULATION ANALYSIS');
System.debug('═══════════════════════════════════════════════════════════════');

// Get total Account count
Integer totalAccounts = [SELECT COUNT() FROM Account];
System.debug('Total Accounts: ' + totalAccounts);
System.debug('');
System.debug('Field API Name,Has Value Count,Population %,Status');

// Get all custom fields on Account
Map<String, Schema.SObjectField> acctFields = Schema.SObjectType.Account.fields.getMap();

List<String> acctCustomFields = new List<String>();
for (String fieldName : acctFields.keySet()) {
    Schema.DescribeFieldResult fieldDesc = acctFields.get(fieldName).getDescribe();
    if (fieldDesc.isCustom() || includeStandardFields) {
        acctCustomFields.add(fieldName);
    }
}

// Query population for each field
for (String fieldName : acctCustomFields) {
    try {
        String countQuery = 'SELECT COUNT() FROM Account WHERE ' + fieldName + ' != null';
        Integer populatedCount = Database.countQuery(countQuery);
        Decimal populationPct = totalAccounts > 0 ? (Decimal.valueOf(populatedCount) / totalAccounts * 100).setScale(1) : 0;
        
        String status = populationPct < lowPopulationThreshold ? 'LOW' : 'OK';
        System.debug(fieldName + ',' + populatedCount + ',' + populationPct + '%,' + status);
    } catch (Exception e) {
        // Some fields can't be queried directly (formula fields, etc.)
        System.debug(fieldName + ',N/A,N/A,SKIP (formula or compound)');
    }
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ANALYSIS COMPLETE');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Copy the CSV lines above to a spreadsheet for analysis.');
System.debug('Fields marked "LOW" are candidates for cleanup review.');

