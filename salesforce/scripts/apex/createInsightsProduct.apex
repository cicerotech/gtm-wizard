/**
 * Create AI Platform - Insights product and add to Standard Price Book
 * Run this in Anonymous Apex
 */

// Check if product already exists
List<Product2> existingProducts = [
    SELECT Id, Name, ProductCode 
    FROM Product2 
    WHERE Name = 'AI Platform - Insights' OR ProductCode = 'sigma'
    LIMIT 10
];

System.debug('Existing products with sigma code or Insights name: ' + existingProducts);

// Check if AI Platform - Insights specifically exists
Product2 insightsProduct;
List<Product2> insightsList = [
    SELECT Id, Name, ProductCode, Description, IsActive
    FROM Product2 
    WHERE Name = 'AI Platform - Insights'
    LIMIT 1
];

if (insightsList.isEmpty()) {
    // Create the product
    insightsProduct = new Product2(
        Name = 'AI Platform - Insights',
        ProductCode = 'Insights',
        Description = 'AI-powered insights and analytics platform for legal operations. Contract analysis, spend tracking, and performance metrics.',
        IsActive = true,
        Family = 'Platform'
    );
    insert insightsProduct;
    System.debug('Created new product: ' + insightsProduct.Id);
} else {
    insightsProduct = insightsList[0];
    System.debug('Product already exists: ' + insightsProduct.Id);
    
    // Make sure it's active
    if (!insightsProduct.IsActive) {
        insightsProduct.IsActive = true;
        update insightsProduct;
        System.debug('Activated existing product');
    }
}

// Get Standard Price Book
Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
System.debug('Standard Price Book: ' + standardPB.Id);

// Check if price book entry exists
List<PricebookEntry> existingPBE = [
    SELECT Id, UnitPrice, IsActive
    FROM PricebookEntry 
    WHERE Product2Id = :insightsProduct.Id AND Pricebook2Id = :standardPB.Id
    LIMIT 1
];

if (existingPBE.isEmpty()) {
    // Create price book entry (matching other products at $120,000)
    PricebookEntry pbe = new PricebookEntry(
        Product2Id = insightsProduct.Id,
        Pricebook2Id = standardPB.Id,
        UnitPrice = 120000.00,
        IsActive = true
    );
    insert pbe;
    System.debug('Created price book entry: ' + pbe.Id + ' at $120,000');
} else {
    System.debug('Price book entry already exists: ' + existingPBE[0].Id);
    
    // Make sure it's active
    if (!existingPBE[0].IsActive) {
        existingPBE[0].IsActive = true;
        update existingPBE[0];
        System.debug('Activated existing price book entry');
    }
}

System.debug('=== AI Platform - Insights product ready ===');
System.debug('Product ID: ' + insightsProduct.Id);
System.debug('Now available to add to Opportunities');
