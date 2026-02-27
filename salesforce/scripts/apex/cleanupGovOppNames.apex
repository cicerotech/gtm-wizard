/**
 * Clean up legacy opportunity names for Mike Masiello's government deals.
 * Replaces " - AI-Augmented Compliance_In-House Technology" with " - AI Platform - Government"
 * in the Opportunity Name field.
 *
 * Execute: sf apex run --file salesforce/scripts/apex/cleanupGovOppNames.apex -o eudia-prod
 */

List<Opportunity> govOpps = [
    SELECT Id, Name, Owner.Name, Product_Lines_Multi__c, Account.Name
    FROM Opportunity
    WHERE Owner.Name = 'Mike Masiello'
      AND IsClosed = false
      AND Name LIKE '%AI-Augmented Compliance%'
];

System.debug('Found ' + govOpps.size() + ' opportunities with legacy names');

Integer updated = 0;
List<Opportunity> toUpdate = new List<Opportunity>();

for (Opportunity opp : govOpps) {
    String oldName = opp.Name;
    String newName = oldName.replace(' - AI-Augmented Compliance_In-House Technology', ' - AI Platform - Government');
    newName = newName.replace(' - AI-Augmented Compliance - In-House Technology', ' - AI Platform - Government');

    if (newName != oldName) {
        opp.Name = newName;
        toUpdate.add(opp);
        updated++;
        System.debug('RENAME: "' + oldName + '" -> "' + newName + '"');
    } else {
        System.debug('SKIP (no match): ' + oldName);
    }
}

if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('Renamed ' + updated + ' opportunities');
} else {
    System.debug('No opportunities needed renaming');
}
