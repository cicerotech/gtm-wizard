/**
 * Fix SOCOM opportunity product line: AI Compliance -> AI Platform - Government
 * This deal was missed by the bulk migration because its Account_Type_Classification__c
 * may not be set to 'Government'.
 *
 * Execute: sf apex run --file salesforce/scripts/apex/fixSocomProductLine.apex -o eudia-prod
 */

List<Opportunity> socomOpps = [
    SELECT Id, Name, Owner.Name, Product_Lines_Multi__c, Product_Line__c,
           Account_Type_Classification__c, StageName, ACV__c, Account.Name
    FROM Opportunity
    WHERE Name LIKE '%SOCOM%'
      AND Owner.Name = 'Mike Masiello'
      AND IsClosed = false
];

System.debug('Found ' + socomOpps.size() + ' open SOCOM opportunities');

Integer updated = 0;
List<Opportunity> toUpdate = new List<Opportunity>();

for (Opportunity opp : socomOpps) {
    Boolean changed = false;

    if (opp.Product_Lines_Multi__c != null && opp.Product_Lines_Multi__c != 'AI Platform - Government') {
        opp.Product_Lines_Multi__c = 'AI Platform - Government';
        changed = true;
    }
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
            ' | Classification: ' + opp.Account_Type_Classification__c +
            ' | Was Multi: ' + opp.Product_Lines_Multi__c);
    } else {
        System.debug('OK: ' + opp.Name + ' (already AI Platform - Government)');
    }
}

if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('Updated ' + updated + ' SOCOM opportunities');
} else {
    System.debug('No SOCOM opportunities needed updating');
}
