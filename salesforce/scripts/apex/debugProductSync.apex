// Debug: Check if Product Line sync is working
// Get a recent opportunity with Product_Lines_Multi__c set
List<Opportunity> opps = [
    SELECT Id, Name, Product_Lines_Multi__c, IsClosed, Pricebook2Id,
           (SELECT Id, Product2.Name, UnitPrice FROM OpportunityLineItems)
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null AND IsClosed = false
    ORDER BY CreatedDate DESC
    LIMIT 3
];

System.debug('=== PRODUCT SYNC DIAGNOSTIC ===');
System.debug('Found ' + opps.size() + ' open opportunities with Product_Lines_Multi__c');

for (Opportunity opp : opps) {
    System.debug('\n--- ' + opp.Name + ' ---');
    System.debug('  Product_Lines_Multi__c: ' + opp.Product_Lines_Multi__c);
    System.debug('  Pricebook2Id: ' + opp.Pricebook2Id);
    System.debug('  IsClosed: ' + opp.IsClosed);
    System.debug('  OpportunityLineItems: ' + opp.OpportunityLineItems.size());
    
    if (opp.OpportunityLineItems.isEmpty()) {
        System.debug('  *** NO LINE ITEMS - SYNC NOT WORKING ***');
    } else {
        for (OpportunityLineItem oli : opp.OpportunityLineItems) {
            System.debug('    - ' + oli.Product2.Name + ' ($' + oli.UnitPrice + ')');
        }
    }
}

// Check Pricebook setup
List<Pricebook2> pbs = [SELECT Id, Name, IsStandard, IsActive FROM Pricebook2 WHERE IsStandard = true];
System.debug('\n=== PRICEBOOK CHECK ===');
for (Pricebook2 pb : pbs) {
    System.debug('Standard Pricebook: ' + pb.Name + ' (Active: ' + pb.IsActive + ')');
}

// Check if products exist in pricebook
List<PricebookEntry> pbes = [SELECT Id, Product2.Name, IsActive FROM PricebookEntry WHERE Pricebook2.IsStandard = true LIMIT 10];
System.debug('\n=== PRICEBOOK ENTRIES ===');
for (PricebookEntry pbe : pbes) {
    System.debug('  ' + pbe.Product2.Name + ' (Active: ' + pbe.IsActive + ')');
}
