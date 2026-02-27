/**
 * Create "AI Platform - Government" Product and Standard Pricebook Entry
 * 
 * Run AFTER deploying Product_Line__c and Product_Lines_Multi__c picklist metadata.
 * Execute: sf apex run --file salesforce/scripts/apex/createGovProduct.apex -o eudia-prod
 */

Decimal DEFAULT_ACV = 120000;

Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
System.debug('Standard Price Book: ' + standardPB.Id);

List<Product2> existing = [SELECT Id, Name FROM Product2 WHERE ProductCode = 'AI_Platform_Government'];
if (!existing.isEmpty()) {
    System.debug('Product already exists: ' + existing[0].Name + ' (' + existing[0].Id + ')');

    List<PricebookEntry> existingPBE = [
        SELECT Id FROM PricebookEntry
        WHERE Product2Id = :existing[0].Id AND Pricebook2Id = :standardPB.Id
    ];
    if (existingPBE.isEmpty()) {
        insert new PricebookEntry(
            Pricebook2Id = standardPB.Id,
            Product2Id = existing[0].Id,
            UnitPrice = DEFAULT_ACV,
            IsActive = true
        );
        System.debug('Created missing PricebookEntry for existing product');
    } else {
        System.debug('PricebookEntry already exists');
    }
} else {
    Product2 p = new Product2(
        Name = 'AI Platform - Government',
        ProductCode = 'AI_Platform_Government',
        Family = 'AI Platform',
        Description = 'AI-powered legal technology solutions for government entities. Includes compliance, contracting, and platform capabilities tailored for public sector requirements.',
        IsActive = true
    );
    insert p;
    System.debug('Created Product: ' + p.Name + ' (' + p.Id + ')');

    insert new PricebookEntry(
        Pricebook2Id = standardPB.Id,
        Product2Id = p.Id,
        UnitPrice = DEFAULT_ACV,
        IsActive = true
    );
    System.debug('Created PricebookEntry: $' + DEFAULT_ACV);
}

System.debug('');
System.debug('========================================');
System.debug('AI Platform - Government setup complete');
System.debug('========================================');
