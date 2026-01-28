// Backfill Delivery_Links__c (Rich Text with hyperlinks) for existing Opportunities
// Run this once to populate clickable delivery links

String baseUrl = URL.getOrgDomainUrl().toExternalForm();
List<Opportunity> oppsToUpdate = new List<Opportunity>();

// Get all Opportunities that have Deliveries
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
    
    // Build plain text summary and HTML links
    List<String> textLines = new List<String>();
    List<String> htmlLines = new List<String>();
    
    for (Delivery__c d : deliveries) {
        String productInfo = d.Product_Line__c != null ? d.Product_Line__c : 'N/A';
        String valueFormatted = '';
        
        if (d.Contract_Value__c != null && d.Contract_Value__c > 0) {
            Decimal val = d.Contract_Value__c;
            if (val >= 1000000) {
                valueFormatted = ' - $' + String.valueOf((val / 1000000).setScale(1, RoundingMode.HALF_UP)) + 'M';
            } else if (val >= 1000) {
                valueFormatted = ' - $' + String.valueOf((val / 1000).setScale(0, RoundingMode.HALF_UP)) + 'K';
            } else {
                valueFormatted = ' - $' + String.valueOf(val.setScale(0, RoundingMode.HALF_UP));
            }
        }
        
        // Plain text
        textLines.add('• ' + d.Name + ' (' + productInfo + ')' + valueFormatted);
        
        // HTML with hyperlink
        htmlLines.add('<p>• <a href="' + baseUrl + '/' + d.Id + '" target="_blank">' + d.Name + '</a> (' + productInfo + ')' + valueFormatted + '</p>');
    }
    
    Opportunity opp = new Opportunity(
        Id = oppId,
        All_Delivery_Codes__c = String.join(textLines, '\n'),
        Delivery_Links__c = String.join(htmlLines, ''),
        Delivery__c = deliveries[0].Id  // Primary delivery
    );
    oppsToUpdate.add(opp);
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Updated ' + oppsToUpdate.size() + ' opportunities with Delivery links');
} else {
    System.debug('No opportunities to update');
}

