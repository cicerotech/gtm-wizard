/**
 * Create Products and Standard Price Book Entries
 * 
 * ⚠️ RUN IN SANDBOX FIRST
 * 
 * Execute in: Developer Console → Debug → Open Execute Anonymous Window
 * 
 * This script creates Products that MATCH your existing Product_Line__c picklist values.
 * This ensures 1:1 alignment between picklist values and Products.
 * 
 * DEFAULT ACV: $120,000 for all products (user can override per Opportunity)
 * 
 * NOTE: Your existing Product_Line__c field is NOT modified.
 *       Flows and automations continue to work unchanged.
 */

// ============================================================
// CONFIGURATION
// ============================================================
Decimal DEFAULT_ACV = 120000;  // $120K default for all products

// ============================================================
// Step 1: Get Standard Price Book
// ============================================================
Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
System.debug('Found Standard Price Book: ' + standardPB.Id);

// ============================================================
// Step 2: Check existing products (prevent duplicates)
// ============================================================
Set<String> existingCodes = new Set<String>();
for (Product2 p : [SELECT ProductCode FROM Product2 WHERE ProductCode != null]) {
    existingCodes.add(p.ProductCode);
}

// ============================================================
// Step 3: Define Products (matching existing picklist values)
// ============================================================
// Product names EXACTLY match your Product_Line__c picklist values
// This ensures consistency and easy mapping

List<Product2> products = new List<Product2>();

// --- Contracting ---
if (!existingCodes.contains('AI-Augmented Contracting_In-House Technology')) {
    products.add(new Product2(
        Name = 'AI-Augmented Contracting - In-House Technology',
        ProductCode = 'AI-Augmented Contracting_In-House Technology',
        Family = 'Contracting',
        Description = 'Contract Review Solution with MIND and Word Plugin. AI-powered contract analysis, playbook codification, and redlining.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AI-Augmented Contracting_Managed Services')) {
    products.add(new Product2(
        Name = 'AI-Augmented Contracting - Managed Services',
        ProductCode = 'AI-Augmented Contracting_Managed Services',
        Family = 'Contracting',
        Description = 'Augmented Contracting with AI-Augmented Legal Consultant. End-to-end review, negotiation, and execution management.',
        IsActive = true
    ));
}

if (!existingCodes.contains('Contracting - Secondee')) {
    products.add(new Product2(
        Name = 'Contracting - Secondee',
        ProductCode = 'Contracting - Secondee',
        Family = 'Contracting',
        Description = 'Embedded legal professional (secondee) for contracting support.',
        IsActive = true
    ));
}

// --- Compliance ---
if (!existingCodes.contains('AI-Augmented Compliance_In-House Technology')) {
    products.add(new Product2(
        Name = 'AI-Augmented Compliance - In-House Technology',
        ProductCode = 'AI-Augmented Compliance_In-House Technology',
        Family = 'Compliance',
        Description = 'Compliance monitoring, audit support, and regulatory tracking platform.',
        IsActive = true
    ));
}

// --- M&A ---
if (!existingCodes.contains('Augmented-M&A')) {
    products.add(new Product2(
        Name = 'AI-Augmented M&A - In-House Technology',
        ProductCode = 'Augmented-M&A',
        Family = 'M&A',
        Description = 'M&A due diligence platform. AI-powered document review and risk analysis.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AI-Augmented M&A_Managed Service')) {
    products.add(new Product2(
        Name = 'AI-Augmented M&A - Managed Service',
        ProductCode = 'AI-Augmented M&A_Managed Service',
        Family = 'M&A',
        Description = 'M&A with managed legal team. Full-service due diligence support.',
        IsActive = true
    ));
}

// --- Platform ---
if (!existingCodes.contains('sigma')) {
    products.add(new Product2(
        Name = 'Sigma',
        ProductCode = 'sigma',
        Family = 'Platform',
        Description = 'Self-serve agent suite with Q&A, Summarization, Drafting, Translation, and Insights.',
        IsActive = true
    ));
}

if (!existingCodes.contains('Custom Agents')) {
    products.add(new Product2(
        Name = 'Custom Agents',
        ProductCode = 'Custom Agents',
        Family = 'Platform',
        Description = 'Custom AI agent development and deployment for specialized workflows.',
        IsActive = true
    ));
}

// --- Litigation ---
if (!existingCodes.contains('Litigation')) {
    products.add(new Product2(
        Name = 'Litigation',
        ProductCode = 'Litigation',
        Family = 'Litigation',
        Description = 'Litigation support and e-discovery services with AI-powered document review.',
        IsActive = true
    ));
}

// --- Other ---
if (!existingCodes.contains('Other_Managed Service')) {
    products.add(new Product2(
        Name = 'Other - Managed Service',
        ProductCode = 'Other_Managed Service',
        Family = 'Other',
        Description = 'Other managed service engagements.',
        IsActive = true
    ));
}

if (!existingCodes.contains('Other_Secondee')) {
    products.add(new Product2(
        Name = 'Other - Secondee',
        ProductCode = 'Other_Secondee',
        Family = 'Other',
        Description = 'Other secondee/embedded professional engagements.',
        IsActive = true
    ));
}

// ============================================================
// Step 4: Insert Products
// ============================================================
List<String> allProductCodes = new List<String>{
    'AI-Augmented Contracting_In-House Technology',
    'AI-Augmented Contracting_Managed Services',
    'Contracting - Secondee',
    'AI-Augmented Compliance_In-House Technology',
    'Augmented-M&A',
    'AI-Augmented M&A_Managed Service',
    'sigma',
    'Custom Agents',
    'Litigation',
    'Other_Managed Service',
    'Other_Secondee'
};

if (!products.isEmpty()) {
    insert products;
    System.debug('✅ Created ' + products.size() + ' new products');
}

// Get all products (including existing) for price book entries
List<Product2> allProducts = [
    SELECT Id, Name, ProductCode 
    FROM Product2 
    WHERE ProductCode IN :allProductCodes
];

// ============================================================
// Step 5: Check existing Price Book Entries
// ============================================================
Set<Id> existingPBEProductIds = new Set<Id>();
for (PricebookEntry pbe : [SELECT Product2Id FROM PricebookEntry WHERE Pricebook2Id = :standardPB.Id]) {
    existingPBEProductIds.add(pbe.Product2Id);
}

// ============================================================
// Step 6: Create Standard Price Book Entries (all at $120K default)
// ============================================================
List<PricebookEntry> standardEntries = new List<PricebookEntry>();

for (Product2 p : allProducts) {
    if (!existingPBEProductIds.contains(p.Id)) {
        standardEntries.add(new PricebookEntry(
            Pricebook2Id = standardPB.Id,
            Product2Id = p.Id,
            UnitPrice = DEFAULT_ACV,  // $120,000 default - users can override per Opp
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

// ============================================================
// Step 7: Summary Output
// ============================================================
System.debug('');
System.debug('========================================');
System.debug('PRODUCT SETUP COMPLETE');
System.debug('========================================');
System.debug('');
System.debug('Products in system: ' + allProducts.size());
System.debug('New products created: ' + products.size());
System.debug('Price book entries created: ' + standardEntries.size());
System.debug('');
System.debug('DEFAULT ACV: $' + DEFAULT_ACV + ' (user can override per Opportunity)');
System.debug('');
System.debug('Products (matching Product_Line__c picklist):');
for (Product2 p : allProducts) {
    System.debug('  ✓ ' + p.Name);
}
System.debug('');
System.debug('========================================');
System.debug('NEXT STEPS:');
System.debug('1. Add "Products" related list to Opportunity page layout');
System.debug('2. Test with a sample Opportunity');
System.debug('3. Existing Product_Line__c field unchanged');
System.debug('========================================');

