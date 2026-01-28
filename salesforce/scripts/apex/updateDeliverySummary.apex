// Backfill Deliveries_Summary__c for existing Opportunities with Deliveries
// Run this once to populate the new field for existing data

List<Opportunity> oppsToUpdate = new List<Opportunity>();

// Get all Opportunities that have Deliveries but no summary
for (AggregateResult ar : [
    SELECT Opportunity__c oppId
    FROM Delivery__c
    WHERE Opportunity__c != null
    GROUP BY Opportunity__c
]) {
    Id oppId = (Id)ar.get('oppId');
    
    // Get all deliveries for this opportunity
    List<Delivery__c> deliveries = [
        SELECT Id, Name, Product_Line__c, Contract_Value__c
        FROM Delivery__c
        WHERE Opportunity__c = :oppId
        ORDER BY Contract_Value__c DESC
    ];
    
    if (deliveries.isEmpty()) continue;
    
    // Build summary
    List<String> lines = new List<String>();
    for (Delivery__c d : deliveries) {
        String line = '• ' + d.Name + ' (' + (d.Product_Line__c != null ? d.Product_Line__c : 'N/A') + ')';
        if (d.Contract_Value__c != null && d.Contract_Value__c > 0) {
            Decimal val = d.Contract_Value__c;
            String formatted;
            if (val >= 1000000) {
                formatted = '$' + String.valueOf((val / 1000000).setScale(1, RoundingMode.HALF_UP)) + 'M';
            } else if (val >= 1000) {
                formatted = '$' + String.valueOf((val / 1000).setScale(0, RoundingMode.HALF_UP)) + 'K';
            } else {
                formatted = '$' + String.valueOf(val.setScale(0, RoundingMode.HALF_UP));
            }
            line += ' - ' + formatted;
        }
        lines.add(line);
    }
    
    Opportunity opp = new Opportunity(
        Id = oppId,
        Deliveries_Summary__c = String.join(lines, '\n'),
        Delivery__c = deliveries[0].Id  // Primary delivery
    );
    oppsToUpdate.add(opp);
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Updated ' + oppsToUpdate.size() + ' opportunities with Delivery summaries');
} else {
    System.debug('No opportunities to update');
}

