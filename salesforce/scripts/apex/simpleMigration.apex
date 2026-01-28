// Simple migration: Copy single Product_Line__c values to Product_Lines_Multi__c
// Skip "Multiple" and "Undetermined" - those will be filled in manually
// Flow is deactivated so we can process more at once

List<Opportunity> oppsToMigrate = [
    SELECT Id, Name, Product_Line__c, Product_Lines_Multi__c
    FROM Opportunity
    WHERE IsClosed = false
    AND Product_Line__c != null
    AND Product_Line__c != 'Multiple'
    AND Product_Line__c != 'Undetermined'
    AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')
    LIMIT 200
];

System.debug('Found ' + oppsToMigrate.size() + ' opportunities to migrate');

if (oppsToMigrate.isEmpty()) {
    System.debug('=== ALL DONE! No more opportunities to migrate ===');
} else {
    for (Opportunity opp : oppsToMigrate) {
        opp.Product_Lines_Multi__c = opp.Product_Line__c;
    }
    
    update oppsToMigrate;
    System.debug('=== MIGRATED: ' + oppsToMigrate.size() + ' opportunities ===');
}

// Show remaining counts
Integer remainingSingle = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND Product_Line__c != null AND Product_Line__c != 'Multiple' AND Product_Line__c != 'Undetermined' AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')];
Integer multipleCount = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND Product_Line__c = 'Multiple'];
Integer undeterminedCount = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND Product_Line__c = 'Undetermined'];

System.debug('Remaining single-product to migrate: ' + remainingSingle);
System.debug('Skipped "Multiple" (manual): ' + multipleCount);
System.debug('Skipped "Undetermined" (manual): ' + undeterminedCount);
