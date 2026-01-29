/**
 * Create Products and Standard Price Book Entries
 * 
 * ⚠️ RUN IN SANDBOX FIRST
 * 
 * Execute in: Developer Console → Debug → Open Execute Anonymous Window
 * 
 * UPDATED: Simplified naming (removed "Augmented")
 * - AI Contracting – Technology
 * - AI Contracting – Managed Services
 * - AI M&A – Managed Services
 * - etc.
 * 
 * DEFAULT ACV: $120,000 for all products (user can override per Opportunity)
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
// Step 3: Define Products (simplified naming)
// ============================================================

List<Product2> products = new List<Product2>();

// --- Contracting ---
if (!existingCodes.contains('AI_Contracting_Technology')) {
    products.add(new Product2(
        Name = 'AI Contracting – Technology',
        ProductCode = 'AI_Contracting_Technology',
        Family = 'Contracting',
        Description = 'Contract Review Solution with MIND and Word Plugin. AI-powered contract analysis, playbook codification, and redlining.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AI_Contracting_Managed_Services')) {
    products.add(new Product2(
        Name = 'AI Contracting – Managed Services',
        ProductCode = 'AI_Contracting_Managed_Services',
        Family = 'Contracting',
        Description = 'Contracting with AI-powered Legal Consultant. End-to-end review, negotiation, and execution management.',
        IsActive = true
    ));
}

if (!existingCodes.contains('Contracting_Secondee')) {
    products.add(new Product2(
        Name = 'Contracting – Secondee',
        ProductCode = 'Contracting_Secondee',
        Family = 'Contracting',
        Description = 'Embedded legal professional (secondee) for contracting support.',
        IsActive = true
    ));
}

// --- Compliance ---
if (!existingCodes.contains('AI_Compliance_Technology')) {
    products.add(new Product2(
        Name = 'AI Compliance – Technology',
        ProductCode = 'AI_Compliance_Technology',
        Family = 'Compliance',
        Description = 'Compliance monitoring, audit support, and regulatory tracking platform.',
        IsActive = true
    ));
}

// --- M&A ---
if (!existingCodes.contains('AI_MA_Managed_Services')) {
    products.add(new Product2(
        Name = 'AI M&A – Managed Services',
        ProductCode = 'AI_MA_Managed_Services',
        Family = 'M&A',
        Description = 'M&A with managed legal team. Full-service due diligence support.',
        IsActive = true
    ));
}

// --- AI Platform ---
if (!existingCodes.contains('AI_Platform_Sigma')) {
    products.add(new Product2(
        Name = 'AI Platform – Sigma',
        ProductCode = 'AI_Platform_Sigma',
        Family = 'AI Platform',
        Description = 'Self-serve agent suite with Q&A, Summarization, Drafting, Translation, and Insights.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AI_Platform_Insights')) {
    products.add(new Product2(
        Name = 'AI Platform – Insights',
        ProductCode = 'AI_Platform_Insights',
        Family = 'AI Platform',
        Description = 'AI-powered insights and analytics for legal operations.',
        IsActive = true
    ));
}

if (!existingCodes.contains('AI_Platform_Litigation')) {
    products.add(new Product2(
        Name = 'AI Platform – Litigation',
        ProductCode = 'AI_Platform_Litigation',
        Family = 'AI Platform',
        Description = 'Litigation support and e-discovery services with AI-powered document review.',
        IsActive = true
    ));
}

// --- FDE ---
if (!existingCodes.contains('FDE_Custom_AI_Solution')) {
    products.add(new Product2(
        Name = 'FDE – Custom AI Solution',
        ProductCode = 'FDE_Custom_AI_Solution',
        Family = 'FDE',
        Description = 'Custom AI agent development and deployment for specialized workflows.',
        IsActive = true
    ));
}

// --- Other ---
if (!existingCodes.contains('Other_Managed_Service')) {
    products.add(new Product2(
        Name = 'Other – Managed Service',
        ProductCode = 'Other_Managed_Service',
        Family = 'Other',
        Description = 'Other managed service engagements.',
        IsActive = true
    ));
}

if (!existingCodes.contains('Other_Secondee')) {
    products.add(new Product2(
        Name = 'Other – Secondee',
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
    'AI_Contracting_Technology',
    'AI_Contracting_Managed_Services',
    'Contracting_Secondee',
    'AI_Compliance_Technology',
    'AI_MA_Managed_Services',
    'AI_Platform_Sigma',
    'AI_Platform_Insights',
    'AI_Platform_Litigation',
    'FDE_Custom_AI_Solution',
    'Other_Managed_Service',
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
System.debug('Products (simplified naming):');
for (Product2 p : allProducts) {
    System.debug('  ✓ ' + p.Name);
}
System.debug('');
System.debug('========================================');
