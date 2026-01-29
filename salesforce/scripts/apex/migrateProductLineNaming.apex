/**
 * Product Line Migration Script - January 2026
 * 
 * Purpose: Migrate opportunities from deactivated product line values
 * 
 * Changes:
 * - "AI-Augmented M&A - In-House Technology" → "AI-Augmented M&A - Managed Service"
 * - "Multiple (BL Review)" → Remove (BL must re-tag with specific products)
 * 
 * Run this AFTER deploying the updated Product_Lines_Multi__c field metadata.
 * 
 * @author RevOps
 * @date January 2026
 */

// Values being deactivated
String MA_INHOUSE_OLD = 'AI-Augmented M&A - In-House Technology';
String MA_MANAGED_NEW = 'AI-Augmented M&A - Managed Service';
String MULTIPLE_OLD = 'Multiple (BL Review)';

// Find all opportunities with deactivated values
List<Opportunity> oppsToUpdate = new List<Opportunity>();

List<Opportunity> oppsWithDeactivatedValues = [
    SELECT Id, Name, Product_Lines_Multi__c, OwnerId, Owner.Name
    FROM Opportunity 
    WHERE Product_Lines_Multi__c INCLUDES (:MA_INHOUSE_OLD) 
       OR Product_Lines_Multi__c INCLUDES (:MULTIPLE_OLD)
];

System.debug('Found ' + oppsWithDeactivatedValues.size() + ' opportunities with deactivated product line values');

for (Opportunity opp : oppsWithDeactivatedValues) {
    String originalValue = opp.Product_Lines_Multi__c;
    String newValue = originalValue;
    Boolean changed = false;
    
    // Replace M&A In-House with M&A Managed
    if (originalValue.contains(MA_INHOUSE_OLD)) {
        // Check if they already have M&A Managed - avoid duplicates
        if (!originalValue.contains(MA_MANAGED_NEW)) {
            newValue = newValue.replace(MA_INHOUSE_OLD, MA_MANAGED_NEW);
        } else {
            // Already has managed, just remove the in-house
            newValue = newValue.replace(MA_INHOUSE_OLD + ';', '');
            newValue = newValue.replace(';' + MA_INHOUSE_OLD, '');
            newValue = newValue.replace(MA_INHOUSE_OLD, '');
        }
        changed = true;
    }
    
    // Remove "Multiple (BL Review)" - BL needs to re-tag
    if (originalValue.contains(MULTIPLE_OLD)) {
        newValue = newValue.replace(MULTIPLE_OLD + ';', '');
        newValue = newValue.replace(';' + MULTIPLE_OLD, '');
        newValue = newValue.replace(MULTIPLE_OLD, '');
        changed = true;
        
        System.debug('ATTENTION: Opp "' + opp.Name + '" (Owner: ' + opp.Owner.Name + ') had "Multiple" - BL should re-tag with specific products');
    }
    
    // Clean up any double semicolons from removals
    while (newValue.contains(';;')) {
        newValue = newValue.replace(';;', ';');
    }
    // Remove leading/trailing semicolons
    newValue = newValue.removeStart(';').removeEnd(';');
    
    if (changed) {
        opp.Product_Lines_Multi__c = newValue;
        oppsToUpdate.add(opp);
        System.debug('Updating: ' + opp.Name + ' | From: ' + originalValue + ' | To: ' + newValue);
    }
}

// Summary before update
System.debug('=== MIGRATION SUMMARY ===');
System.debug('Total opportunities to update: ' + oppsToUpdate.size());

// Uncomment to execute
if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Successfully updated ' + oppsToUpdate.size() + ' opportunities');
}

// Log any that now have empty product lines (need BL attention)
List<Opportunity> emptyProducts = [
    SELECT Id, Name, OwnerId, Owner.Name
    FROM Opportunity 
    WHERE Product_Lines_Multi__c = '' OR Product_Lines_Multi__c = null
    AND StageName NOT IN ('Closed Won', 'Closed Lost')
    AND IsClosed = false
];

if (!emptyProducts.isEmpty()) {
    System.debug('=== OPPS NEEDING PRODUCT LINE TAGGING ===');
    for (Opportunity opp : emptyProducts) {
        System.debug('Needs tagging: ' + opp.Name + ' (Owner: ' + opp.Owner.Name + ')');
    }
}

