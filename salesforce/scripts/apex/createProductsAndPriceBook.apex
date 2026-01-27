/**
 * Create Products and Standard Price Book Entries
 * 
 * ⚠️ RUN IN SANDBOX FIRST
 * 
 * Execute in: Developer Console → Debug → Open Execute Anonymous Window
 * 
 * This script creates:
 * - 9 Products representing Eudia's product lines
 * - Standard Price Book entries with default ACV pricing
 */

// Step 1: Get Standard Price Book (always exists in Salesforce)
Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
System.debug('Found Standard Price Book: ' + standardPB.Id);

// Step 2: Check if products already exist (prevent duplicates)
Set<String> existingCodes = new Set<String>();
for (Product2 p : [SELECT ProductCode FROM Product2 WHERE ProductCode != null]) {
    existingCodes.add(p.ProductCode);
}

// Step 3: Define Products
List<Product2> products = new List<Product2>();

// Contracting Products
if (!existingCodes.contains('CONT-INH')) {
    products.add(new Product2(
        Name = 'AI-Augmented Contracting - In-House',
        ProductCode = 'CONT-INH',
        Family = 'Contracting',
        Description = 'Contract Review Solution with MIND and Word Plugin. Includes AI-powered contract analysis, playbook codification, and redlining assistance.',
        IsActive = true
    ));
}

if (!existingCodes.contains('CONT-MS')) {
    products.add(new Product2(
        Name = 'AI-Augmented Contracting - Managed Service',
        ProductCode = 'CONT-MS',
        Family = 'Contracting',
        Description = 'Augmented Contracting with AI-Augmented Legal Consultant. End-to-end review, redlining, negotiation support, and execution management.',
        IsActive = true
    ));
}

// Platform Products
if (!existingCodes.contains('SIGMA')) {
    products.add(new Product2(
        Name = 'Sigma & Insights',
        ProductCode = 'SIGMA',
        Family = 'Platform',
        Description = 'Self-serve agent suite with Q&A, Summarization, Drafting, Translation. Insights transforms contracts into a living source of truth.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AGENTS')) {
    products.add(new Product2(
        Name = 'Custom Agents',
        ProductCode = 'AGENTS',
        Family = 'Platform',
        Description = 'Custom AI agent development and deployment for specialized workflows.',
        IsActive = true
    ));
}

// M&A Products
if (!existingCodes.contains('MA-INH')) {
    products.add(new Product2(
        Name = 'AI-Augmented M&A - In-House',
        ProductCode = 'MA-INH',
        Family = 'M&A',
        Description = 'M&A due diligence platform license. AI-powered document review and risk analysis for transactions.',
        IsActive = true
    ));
}

if (!existingCodes.contains('MA-MS')) {
    products.add(new Product2(
        Name = 'AI-Augmented M&A - Managed Service',
        ProductCode = 'MA-MS',
        Family = 'M&A',
        Description = 'M&A with managed legal team. Full-service due diligence support with embedded professionals.',
        IsActive = true
    ));
}

// Compliance Products
if (!existingCodes.contains('COMP-INH')) {
    products.add(new Product2(
        Name = 'AI-Augmented Compliance - In-House',
        ProductCode = 'COMP-INH',
        Family = 'Compliance',
        Description = 'Compliance monitoring, audit support, and regulatory tracking platform.',
        IsActive = true
    ));
}

// Litigation Products
if (!existingCodes.contains('LIT')) {
    products.add(new Product2(
        Name = 'Litigation Support',
        ProductCode = 'LIT',
        Family = 'Litigation',
        Description = 'Litigation support and e-discovery services with AI-powered document review.',
        IsActive = true
    ));
}

// Services
if (!existingCodes.contains('CONFIG')) {
    products.add(new Product2(
        Name = 'Configuration & Implementation',
        ProductCode = 'CONFIG',
        Family = 'Services',
        Description = 'Setup, training, integration services, and ongoing configuration support.',
        IsActive = true
    ));
}

// Step 4: Insert Products
if (!products.isEmpty()) {
    insert products;
    System.debug('✅ Created ' + products.size() + ' new products');
} else {
    System.debug('ℹ️ All products already exist');
    // Get existing products for price book entries
    products = [SELECT Id, ProductCode FROM Product2 WHERE ProductCode IN 
        ('CONT-INH','CONT-MS','SIGMA','AGENTS','MA-INH','MA-MS','COMP-INH','LIT','CONFIG')];
}

// Step 5: Define Default Pricing (ACV)
Map<String, Decimal> defaultPrices = new Map<String, Decimal>{
    'CONT-INH' => 100000,   // $100K - AI-Augmented Contracting In-House
    'CONT-MS' => 100000,    // $100K - AI-Augmented Contracting Managed
    'SIGMA' => 100000,      // $100K - Sigma & Insights
    'AGENTS' => 100000,     // $100K - Custom Agents
    'MA-INH' => 250000,     // $250K - M&A In-House
    'MA-MS' => 250000,      // $250K - M&A Managed Service
    'COMP-INH' => 100000,   // $100K - Compliance In-House
    'LIT' => 100000,        // $100K - Litigation
    'CONFIG' => 50000       // $50K - Configuration & Implementation
};

// Step 6: Check existing Price Book Entries
Set<Id> existingPBEProductIds = new Set<Id>();
for (PricebookEntry pbe : [SELECT Product2Id FROM PricebookEntry WHERE Pricebook2Id = :standardPB.Id]) {
    existingPBEProductIds.add(pbe.Product2Id);
}

// Step 7: Create Standard Price Book Entries
List<PricebookEntry> standardEntries = new List<PricebookEntry>();

for (Product2 p : products) {
    if (!existingPBEProductIds.contains(p.Id) && defaultPrices.containsKey(p.ProductCode)) {
        standardEntries.add(new PricebookEntry(
            Pricebook2Id = standardPB.Id,
            Product2Id = p.Id,
            UnitPrice = defaultPrices.get(p.ProductCode),
            IsActive = true
        ));
    }
}

if (!standardEntries.isEmpty()) {
    insert standardEntries;
    System.debug('✅ Created ' + standardEntries.size() + ' standard price book entries');
} else {
    System.debug('ℹ️ All price book entries already exist');
}

// Step 8: Summary Output
System.debug('========================================');
System.debug('PRODUCT SETUP COMPLETE');
System.debug('========================================');
System.debug('Products created: ' + products.size());
System.debug('Price Book entries created: ' + standardEntries.size());
System.debug('');
System.debug('Default Pricing:');
System.debug('  Contracting In-House:  $100,000');
System.debug('  Contracting Managed:   $100,000');
System.debug('  Sigma & Insights:      $100,000');
System.debug('  Custom Agents:         $100,000');
System.debug('  M&A In-House:          $250,000');
System.debug('  M&A Managed:           $250,000');
System.debug('  Compliance In-House:   $100,000');
System.debug('  Litigation:            $100,000');
System.debug('  Config/Implementation: $50,000');
System.debug('========================================');

