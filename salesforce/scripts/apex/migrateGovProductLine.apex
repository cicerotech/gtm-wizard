/**
 * Migrate Mike Masiello's Government Opportunities to AI Platform - Government
 *
 * Handles both current and legacy product line values:
 *   - "AI Compliance - Technology" (current)
 *   - "AI-Augmented Compliance_In-House Technology" (legacy)
 *   - "Undetermined" (untagged)
 *
 * Updates both Product_Line__c (legacy single) and Product_Lines_Multi__c (primary multi).
 * The Sync_MultiSelect_To_Products Flow auto-fires to swap OpportunityLineItems.
 *
 * Execute: sf apex run --file salesforce/scripts/apex/migrateGovProductLine.apex -o eudia-prod
 */

System.debug('========================================');
System.debug('Government Product Line Migration');
System.debug('========================================');

List<Opportunity> govOpps = [
    SELECT Id, Name, Owner.Name, Product_Lines_Multi__c, Product_Line__c,
           Account_Type_Classification__c, StageName, ACV__c, Account.Name
    FROM Opportunity
    WHERE Owner.Name = 'Mike Masiello'
      AND Account_Type_Classification__c = 'Government'
      AND IsClosed = false
];

System.debug('Found ' + govOpps.size() + ' open government opportunities');

Integer updated = 0;
List<Opportunity> toUpdate = new List<Opportunity>();

for (Opportunity opp : govOpps) {
    Boolean changed = false;

    // Fix Product_Lines_Multi__c
    String multi = opp.Product_Lines_Multi__c;
    if (multi == null || !multi.contains('AI Platform - Government')) {
        if (multi != null && multi.contains('AI Compliance - Technology')) {
            opp.Product_Lines_Multi__c = multi.replace('AI Compliance - Technology', 'AI Platform - Government');
        } else if (multi != null && multi.contains('AI-Augmented Compliance')) {
            opp.Product_Lines_Multi__c = 'AI Platform - Government';
        } else {
            opp.Product_Lines_Multi__c = 'AI Platform - Government';
        }
        changed = true;
    }

    // Fix Product_Line__c (legacy single-select)
    if (opp.Product_Line__c != 'AI Platform - Government') {
        opp.Product_Line__c = 'AI Platform - Government';
        changed = true;
    }

    if (changed) {
        updated++;
        toUpdate.add(opp);
        System.debug('MIGRATE: ' + opp.Name +
            ' | Account: ' + opp.Account.Name +
            ' | Stage: ' + opp.StageName +
            ' | ACV: $' + opp.ACV__c +
            ' | Multi: ' + opp.Product_Lines_Multi__c +
            ' | Single: ' + opp.Product_Line__c);
    } else {
        System.debug('OK (already correct): ' + opp.Name);
    }
}

if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('');
    System.debug('Updated ' + updated + ' opportunities');
}

System.debug('========================================');
System.debug('Migration complete: ' + updated + ' updated, ' + (govOpps.size() - updated) + ' already correct');
System.debug('========================================');
