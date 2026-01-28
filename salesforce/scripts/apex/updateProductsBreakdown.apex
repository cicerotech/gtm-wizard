/**
 * Update Products Breakdown Field
 * 
 * This script populates the Products_Breakdown__c field on Opportunities
 * with a formatted list of products and their amounts.
 * 
 * Run this once to backfill existing opportunities with products.
 * The Flow will maintain this field going forward.
 */

// Query all opportunities that have line items
List<Opportunity> oppsToUpdate = new List<Opportunity>();

// Get opportunities with their line items
Map<Id, Opportunity> oppMap = new Map<Id, Opportunity>([
    SELECT Id, Name, Products_Breakdown__c,
           (SELECT Id, Product2.Name, TotalPrice 
            FROM OpportunityLineItems 
            ORDER BY TotalPrice DESC)
    FROM Opportunity
    WHERE Id IN (SELECT OpportunityId FROM OpportunityLineItem)
    AND IsClosed = false
    LIMIT 200
]);

for (Opportunity opp : oppMap.values()) {
    if (opp.OpportunityLineItems.isEmpty()) {
        continue;
    }
    
    // Build the breakdown string
    List<String> lines = new List<String>();
    Decimal total = 0;
    
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        String productName = oli.Product2.Name;
        Decimal price = oli.TotalPrice != null ? oli.TotalPrice : 0;
        total += price;
        
        // Format: "Product Name: $XXK" or "$XXX,XXX"
        String priceStr;
        if (price >= 1000) {
            priceStr = '$' + String.valueOf(Math.round(price / 1000)) + 'K';
        } else {
            priceStr = '$' + String.valueOf(price.setScale(0));
        }
        
        lines.add('• ' + productName + ': ' + priceStr);
    }
    
    // Add total line
    String totalStr;
    if (total >= 1000) {
        totalStr = '$' + String.valueOf(Math.round(total / 1000)) + 'K';
    } else {
        totalStr = '$' + String.valueOf(total.setScale(0));
    }
    lines.add('');
    lines.add('Total: ' + totalStr);
    
    // Join with newlines
    opp.Products_Breakdown__c = String.join(lines, '\n');
    oppsToUpdate.add(opp);
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Updated ' + oppsToUpdate.size() + ' opportunities with Products Breakdown');
    
    for (Opportunity opp : oppsToUpdate) {
        System.debug('---');
        System.debug(opp.Name);
        System.debug(opp.Products_Breakdown__c);
    }
} else {
    System.debug('No opportunities to update');
}


