/**
 * Query details on opportunities with unknown product line values
 */

Set<String> unknownValues = new Set<String>{
    'AI-Augmented Contracting',
    'Privacy',
    'Compliance-Complaints',
    'Contracting-BAU',
    'DSAR',
    'Other',
    'Contracting',
    'Contracting-Technology',
    'Discovery',
    'Privacy-General Support'
};

List<Opportunity> opps = [
    SELECT Id, Name, Product_Lines_Multi__c, StageName, CreatedDate, 
           Owner.Name, Account.Name, IsClosed, Amount
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
    ORDER BY CreatedDate ASC
];

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('DETAILED VIEW: OPPORTUNITIES WITH UNKNOWN PRODUCT VALUES');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('');

for (Opportunity opp : opps) {
    // Check if this opp has any unknown values
    Boolean hasUnknown = false;
    List<String> foundUnknowns = new List<String>();
    
    for (String val : opp.Product_Lines_Multi__c.split(';')) {
        String trimmed = val.trim();
        if (unknownValues.contains(trimmed)) {
            hasUnknown = true;
            foundUnknowns.add(trimmed);
        }
    }
    
    if (hasUnknown) {
        Integer daysSinceCreated = Date.valueOf(opp.CreatedDate).daysBetween(Date.today());
        String ageLabel = daysSinceCreated + ' days ago';
        if (daysSinceCreated > 365) {
            ageLabel = (daysSinceCreated / 365) + '+ years ago';
        } else if (daysSinceCreated > 30) {
            ageLabel = (daysSinceCreated / 30) + ' months ago';
        }
        
        String status = opp.IsClosed ? '(CLOSED)' : '(OPEN)';
        
        System.debug('───────────────────────────────────────────────────────────────');
        System.debug('OPP: ' + opp.Name);
        System.debug('   Account: ' + opp.Account.Name);
        System.debug('   Owner: ' + opp.Owner.Name);
        System.debug('   Stage: ' + opp.StageName + ' ' + status);
        System.debug('   Created: ' + opp.CreatedDate.format() + ' (' + ageLabel + ')');
        System.debug('   Product Value(s): ' + String.join(foundUnknowns, ', '));
        System.debug('   Full Product Lines: ' + opp.Product_Lines_Multi__c);
    }
}

