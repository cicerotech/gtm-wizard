// Populate blank Product_Lines_Multi__c with placeholder values for BL review
// Run with sync flow DEACTIVATED

// Tag Undetermined opps
List<Opportunity> undetermined = [
    SELECT Id, Name, Product_Line__c, Product_Lines_Multi__c
    FROM Opportunity
    WHERE IsClosed = false
    AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')
    AND Product_Line__c = 'Undetermined'
    LIMIT 200
];

System.debug('Found ' + undetermined.size() + ' Undetermined opps to tag');

for (Opportunity opp : undetermined) {
    opp.Product_Lines_Multi__c = 'Undetermined';
}

if (!undetermined.isEmpty()) {
    update undetermined;
    System.debug('Tagged ' + undetermined.size() + ' with Undetermined');
}

// Tag Multiple opps
List<Opportunity> multiples = [
    SELECT Id, Name, Product_Line__c, Product_Lines_Multi__c
    FROM Opportunity
    WHERE IsClosed = false
    AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')
    AND Product_Line__c = 'Multiple'
    LIMIT 200
];

System.debug('Found ' + multiples.size() + ' Multiple opps to tag');

for (Opportunity opp : multiples) {
    opp.Product_Lines_Multi__c = 'Multiple (BL Review)';
}

if (!multiples.isEmpty()) {
    update multiples;
    System.debug('Tagged ' + multiples.size() + ' with Multiple (BL Review)');
}

// Show remaining
Integer remainingBlank = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND (Product_Lines_Multi__c = null OR Product_Lines_Multi__c = '')];
System.debug('Remaining blank: ' + remainingBlank);

