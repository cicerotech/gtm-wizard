/**
 * Migrate Product_Line__c (single-select) to Product_Lines_Multi__c (multi-select)
 * 
 * Logic:
 * 1. If Product_Line__c is a single value (not "Multiple") → Copy to Product_Lines_Multi__c
 * 2. If Product_Line__c = "Multiple" → Query OpportunityLineItems and build multi-select from product names
 * 3. If Product_Line__c is blank → Skip
 * 
 * Run this in Developer Console → Execute Anonymous
 * 
 * SAFE: Only updates Product_Lines_Multi__c, does not touch Product_Line__c or Products
 */

// Query all open opportunities that need migration
// (Product_Lines_Multi__c is blank but Product_Line__c has a value)
List<Opportunity> oppsToMigrate = [
    SELECT Id, Name, Product_Line__c, Product_Lines_Multi__c,
           (SELECT Product2.Name FROM OpportunityLineItems)
    FROM Opportunity
    WHERE IsClosed = false
    AND Product_Line__c != null
    AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')
    LIMIT 500
];

System.debug('Found ' + oppsToMigrate.size() + ' opportunities to migrate');

List<Opportunity> oppsToUpdate = new List<Opportunity>();
Integer singleProductCount = 0;
Integer multiProductCount = 0;
Integer skippedCount = 0;

for (Opportunity opp : oppsToMigrate) {
    String productLine = opp.Product_Line__c;
    
    if (productLine == 'Multiple' || productLine == 'Undetermined') {
        // Check if there are actual products in the related list
        if (opp.OpportunityLineItems != null && !opp.OpportunityLineItems.isEmpty()) {
            // Build multi-select from product names
            List<String> productNames = new List<String>();
            for (OpportunityLineItem oli : opp.OpportunityLineItems) {
                if (oli.Product2 != null && oli.Product2.Name != null) {
                    productNames.add(oli.Product2.Name);
                }
            }
            
            if (!productNames.isEmpty()) {
                opp.Product_Lines_Multi__c = String.join(productNames, ';');
                oppsToUpdate.add(opp);
                multiProductCount++;
                System.debug('Multi-product: ' + opp.Name + ' → ' + opp.Product_Lines_Multi__c);
            } else {
                skippedCount++;
                System.debug('Skipped (no products): ' + opp.Name);
            }
        } else {
            skippedCount++;
            System.debug('Skipped (Multiple but no line items): ' + opp.Name);
        }
    } else if (String.isNotBlank(productLine)) {
        // Single product - copy directly
        opp.Product_Lines_Multi__c = productLine;
        oppsToUpdate.add(opp);
        singleProductCount++;
        System.debug('Single product: ' + opp.Name + ' → ' + productLine);
    }
}

// Perform update
if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('=== MIGRATION COMPLETE ===');
    System.debug('Single product migrations: ' + singleProductCount);
    System.debug('Multi-product migrations: ' + multiProductCount);
    System.debug('Skipped: ' + skippedCount);
    System.debug('Total updated: ' + oppsToUpdate.size());
} else {
    System.debug('No opportunities needed migration');
}

