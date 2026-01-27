# Opportunity Products Implementation Guide

## Overview
This guide implements Salesforce Opportunity Products (Line Items) to properly capture multi-product deals like Plusgrade.

## ⚠️ CAUTIOUS ROLLOUT APPROACH

### Phase 1: Sandbox Testing (Week 1)
1. Deploy Products & Price Book to **Sandbox only**
2. Test with 3-5 sample opportunities
3. Validate Delivery automation works correctly
4. Get BL feedback on UI/UX

### Phase 2: Pilot (Week 2)
1. Deploy to Production
2. Enable for 1-2 BLs only (via permission set)
3. Run parallel with existing Product Line field
4. Monitor for issues

### Phase 3: Full Rollout (Week 3+)
1. Train all BLs
2. Migrate existing "Multiple" opportunities
3. Update reporting/dashboards
4. Deprecate single-select Product Line (optional)

---

## Products & Default Pricing

| Product Name | Family | Default ACV | Description |
|--------------|--------|-------------|-------------|
| AI-Augmented Contracting - In-House | Contracting | $100,000 | Contract Review Solution, MIND, Word Plugin |
| AI-Augmented Contracting - Managed Service | Contracting | $100,000 | Augmented Contracting with Legal Consultant |
| Sigma & Insights | Platform | $100,000 | Q&A, Summarization, Drafting, Translation |
| AI-Augmented M&A - In-House | M&A | $250,000 | M&A platform license |
| AI-Augmented M&A - Managed Service | M&A | $250,000 | M&A with managed team |
| AI-Augmented Compliance - In-House | Compliance | $100,000 | Compliance platform |
| Litigation Support | Litigation | $100,000 | Litigation support services |
| Custom Agents | Platform | $100,000 | Custom AI agent development |
| Configuration & Implementation | Services | $50,000 | Setup, training, integration |

---

## Implementation Files

### 1. Apex Script: Create Products & Price Book
Run in **Developer Console → Execute Anonymous**

```apex
// FILE: createProductsAndPriceBook.apex
// Run this in SANDBOX FIRST

// Step 1: Get or Create Standard Price Book
Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];

// Step 2: Create Products
List<Product2> products = new List<Product2>();

products.add(new Product2(
    Name = 'AI-Augmented Contracting - In-House',
    ProductCode = 'CONT-INH',
    Family = 'Contracting',
    Description = 'Contract Review Solution with MIND and Word Plugin',
    IsActive = true
));

products.add(new Product2(
    Name = 'AI-Augmented Contracting - Managed Service',
    ProductCode = 'CONT-MS',
    Family = 'Contracting',
    Description = 'Augmented Contracting with AI-Augmented Legal Consultant',
    IsActive = true
));

products.add(new Product2(
    Name = 'Sigma & Insights',
    ProductCode = 'SIGMA',
    Family = 'Platform',
    Description = 'Q&A, Summarization, Drafting, Translation, Document Intelligence',
    IsActive = true
));

products.add(new Product2(
    Name = 'AI-Augmented M&A - In-House',
    ProductCode = 'MA-INH',
    Family = 'M&A',
    Description = 'M&A due diligence platform license',
    IsActive = true
));

products.add(new Product2(
    Name = 'AI-Augmented M&A - Managed Service',
    ProductCode = 'MA-MS',
    Family = 'M&A',
    Description = 'M&A with managed legal team',
    IsActive = true
));

products.add(new Product2(
    Name = 'AI-Augmented Compliance - In-House',
    ProductCode = 'COMP-INH',
    Family = 'Compliance',
    Description = 'Compliance monitoring and audit platform',
    IsActive = true
));

products.add(new Product2(
    Name = 'Litigation Support',
    ProductCode = 'LIT',
    Family = 'Litigation',
    Description = 'Litigation support and e-discovery services',
    IsActive = true
));

products.add(new Product2(
    Name = 'Custom Agents',
    ProductCode = 'AGENTS',
    Family = 'Platform',
    Description = 'Custom AI agent development and deployment',
    IsActive = true
));

products.add(new Product2(
    Name = 'Configuration & Implementation',
    ProductCode = 'CONFIG',
    Family = 'Services',
    Description = 'Setup, training, and integration services',
    IsActive = true
));

insert products;
System.debug('Created ' + products.size() + ' products');

// Step 3: Create Standard Price Book Entries
List<PricebookEntry> standardEntries = new List<PricebookEntry>();

Map<String, Decimal> defaultPrices = new Map<String, Decimal>{
    'CONT-INH' => 100000,
    'CONT-MS' => 100000,
    'SIGMA' => 100000,
    'MA-INH' => 250000,
    'MA-MS' => 250000,
    'COMP-INH' => 100000,
    'LIT' => 100000,
    'AGENTS' => 100000,
    'CONFIG' => 50000
};

for (Product2 p : products) {
    standardEntries.add(new PricebookEntry(
        Pricebook2Id = standardPB.Id,
        Product2Id = p.Id,
        UnitPrice = defaultPrices.get(p.ProductCode),
        IsActive = true
    ));
}

insert standardEntries;
System.debug('Created ' + standardEntries.size() + ' standard price book entries');

System.debug('✅ Products and Price Book setup complete!');
```

### 2. Apex Script: Create Custom Price Book (Optional)
If you want a separate "Eudia Price Book" for custom pricing:

```apex
// FILE: createEudiaPriceBook.apex
// Run AFTER createProductsAndPriceBook.apex

// Get Standard Price Book
Pricebook2 standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];

// Create Eudia Price Book
Pricebook2 eudiaPB = new Pricebook2(
    Name = 'Eudia Standard Pricing',
    Description = 'Default pricing for Eudia products',
    IsActive = true
);
insert eudiaPB;

// Get all products
List<Product2> products = [SELECT Id, ProductCode FROM Product2 WHERE IsActive = true];

// Create entries in Eudia Price Book
Map<String, Decimal> defaultPrices = new Map<String, Decimal>{
    'CONT-INH' => 100000,
    'CONT-MS' => 100000,
    'SIGMA' => 100000,
    'MA-INH' => 250000,
    'MA-MS' => 250000,
    'COMP-INH' => 100000,
    'LIT' => 100000,
    'AGENTS' => 100000,
    'CONFIG' => 50000
};

List<PricebookEntry> entries = new List<PricebookEntry>();
for (Product2 p : products) {
    if (defaultPrices.containsKey(p.ProductCode)) {
        entries.add(new PricebookEntry(
            Pricebook2Id = eudiaPB.Id,
            Product2Id = p.Id,
            UnitPrice = defaultPrices.get(p.ProductCode),
            IsActive = true
        ));
    }
}

insert entries;
System.debug('✅ Created Eudia Price Book with ' + entries.size() + ' entries');
```

---

## Validation Queries

After running the scripts, verify with these queries:

```sql
-- Check Products
SELECT Id, Name, ProductCode, Family, IsActive 
FROM Product2 
WHERE IsActive = true
ORDER BY Family, Name

-- Check Price Book Entries
SELECT Product2.Name, Pricebook2.Name, UnitPrice, IsActive
FROM PricebookEntry
WHERE IsActive = true
ORDER BY Product2.Family, Product2.Name

-- Check a sample Opportunity with Products
SELECT Id, Name, 
    (SELECT Product2.Name, Quantity, UnitPrice, TotalPrice 
     FROM OpportunityLineItems)
FROM Opportunity
WHERE Id = 'YOUR_TEST_OPP_ID'
```

---

## UI Configuration

### Step 1: Add Products Related List to Opportunity Layout
1. Go to **Setup → Object Manager → Opportunity → Page Layouts**
2. Edit the appropriate layout
3. Drag "Products" related list to the layout
4. Save

### Step 2: Enable Product Selection on Opportunities
1. Create a new Opportunity
2. Click "Add Products" button
3. Select Price Book (if prompted)
4. Choose products and enter quantities/prices

---

## Delivery Automation Update

Your existing Delivery trigger needs to be updated to create Deliveries from Line Items instead of the single Product Line field.

See: `updateDeliveryTrigger.apex` (separate file)

---

## Rollback Plan

If issues arise, run this script to deactivate:

```apex
// Deactivate all Eudia products (doesn't delete, just hides)
List<Product2> products = [
    SELECT Id, IsActive 
    FROM Product2 
    WHERE ProductCode IN ('CONT-INH','CONT-MS','SIGMA','MA-INH','MA-MS','COMP-INH','LIT','AGENTS','CONFIG')
];

for (Product2 p : products) {
    p.IsActive = false;
}
update products;

System.debug('Deactivated ' + products.size() + ' products');
```

---

## Next Steps

1. [ ] Review product list with leadership
2. [ ] Run scripts in Sandbox
3. [ ] Test with sample opportunities
4. [ ] Update Delivery trigger
5. [ ] Configure Opportunity page layout
6. [ ] Pilot with 1-2 BLs
7. [ ] Full rollout

