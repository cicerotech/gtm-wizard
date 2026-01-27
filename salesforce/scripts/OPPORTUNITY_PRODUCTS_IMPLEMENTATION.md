# Opportunity Products Implementation Guide

## Overview
This guide implements Salesforce Opportunity Products (Line Items) with **Hybrid ACV Integration** to properly capture multi-product deals.

**Key Architecture Decision:**
- Line items roll up to `Amount` (standard Salesforce behavior)
- `ACV__c` remains the **master value field** used throughout the system
- Products **suggest** ACV when user hasn't entered one, but user can always override

---

## ⚠️ CAUTIOUS ROLLOUT APPROACH

### Phase 1: Sandbox Testing (Week 1)
1. Deploy Products & Price Book to **Sandbox only**
2. Deploy ACV sync flows
3. Update "Create Opp Assist v2" flow
4. Run validation tests (see `docs/OPPORTUNITY_PRODUCTS_TESTING.html`)
5. Get BL feedback on UI/UX

### Phase 2: Production Pilot (Week 2)
1. Deploy to Production
2. Enable for 1-2 BLs only (via permission set)
3. Run parallel with existing Product Line field
4. Monitor for issues

### Phase 3: Full Rollout (Week 3+)
1. Train all BLs
2. Migrate existing "Multiple" opportunities
3. Update Delivery trigger for multi-product support
4. Update reporting/dashboards
5. Deprecate single-select Product Line (optional)

---

## Hybrid ACV Integration

```
Opportunity
  ├── ACV__c (Currency) ← MASTER VALUE, user-editable
  │     │
  │     └── Default populated from SUM(OpportunityLineItems.TotalPrice)
  │         BUT user can override anytime
  │
  └── OpportunityLineItems (Products related list)
        ├── Product: AI-Augmented Contracting - In-House Technology
        │   UnitPrice: $100,000
        ├── Product: Sigma
        │   UnitPrice: $20,000
        └── Total: $120,000 → Suggests ACV, doesn't force it
```

**Behavior:**
- If `ACV__c IS NULL` and Products exist → `ACV__c = Amount`
- If user enters `ACV__c` manually → User value preserved, never overwritten
- If Products change and `ACV__c == Amount` → ACV updates with Products
- If Products change but `ACV__c != Amount` → ACV unchanged (user override active)

---

## Products & Default Pricing

**All products default to $120,000 ACV** — users can override per Opportunity.

**Product names match your existing `Product_Line__c` picklist values exactly.**

| Product Name (matches picklist) | Family | Default ACV |
|--------------------------------|--------|-------------|
| AI-Augmented Contracting - In-House Technology | Contracting | $120,000 |
| AI-Augmented Contracting - Managed Services | Contracting | $120,000 |
| Contracting - Secondee | Contracting | $120,000 |
| AI-Augmented Compliance - In-House Technology | Compliance | $120,000 |
| AI-Augmented M&A - In-House Technology | M&A | $120,000 |
| AI-Augmented M&A - Managed Service | M&A | $120,000 |
| Sigma | Platform | $120,000 |
| Custom Agents | Platform | $120,000 |
| Litigation | Litigation | $120,000 |
| Other - Managed Service | Other | $120,000 |
| Other - Secondee | Other | $120,000 |

### Key Design Decisions

1. **Existing `Product_Line__c` field is NOT modified** — flows keep working
2. **Products mirror picklist values** — easy mental mapping, consistent data
3. **Default ACV is $120K** — quick entry, override when needed
4. **Multi-product → use Products related list** — single Product_Line__c can stay "Multiple"
5. **ACV__c remains master** — All existing reports, Stage Snapshots, BL Metrics unchanged

---

## Implementation Files

### 1. Apex Script: Create Products & Price Book
**File:** `salesforce/scripts/apex/createProductsAndPriceBook.apex`

Run in **Developer Console → Debug → Open Execute Anonymous Window**

```bash
# Deploy flow metadata first (optional - can configure flows manually)
sf project deploy start --source-dir salesforce/force-app/main/default/flows --target-org sandbox
```

### 2. ACV Sync Flows

| Flow | File | Purpose |
|------|------|---------|
| Sync Products to ACV | `Sync_Products_to_ACV.flow-meta.xml` | Updates ACV when Products added/changed |
| Sync Products to ACV On Delete | `Sync_Products_to_ACV_On_Delete.flow-meta.xml` | Recalculates ACV when Products removed |

**Logic:**
- Triggers on `OpportunityLineItem` create/update/delete
- Only updates `ACV__c` if it was null or matched `Amount` (meaning it came from Products)
- Never overwrites user-entered ACV

### 3. Update Create Opp Assist v2 Flow
**File:** `salesforce/scripts/UPDATE_CREATE_OPP_ASSIST_FLOW.md`

This is a **manual update** in Flow Builder. The documentation provides step-by-step instructions.

### 4. Delivery Trigger Update (Phase 3)
**File:** `salesforce/scripts/apex/createDeliveryFromProducts.apex`

Template for updating existing Delivery creation to handle multi-product opportunities.

---

## Deployment Commands

### Sandbox Deployment
```bash
# Deploy flows to Sandbox
sf project deploy start \
  --source-dir salesforce/force-app/main/default/flows/Sync_Products_to_ACV.flow-meta.xml \
  --source-dir salesforce/force-app/main/default/flows/Sync_Products_to_ACV_On_Delete.flow-meta.xml \
  --target-org sandbox

# Then run Apex script in Developer Console
# Developer Console → Debug → Open Execute Anonymous Window
# Paste contents of createProductsAndPriceBook.apex
# Click Execute
```

### Production Deployment (After Sandbox Validation)
```bash
sf project deploy start \
  --source-dir salesforce/force-app/main/default/flows/Sync_Products_to_ACV.flow-meta.xml \
  --source-dir salesforce/force-app/main/default/flows/Sync_Products_to_ACV_On_Delete.flow-meta.xml \
  --target-org production
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
SELECT Id, Name, ACV__c, Amount,
    (SELECT Product2.Name, Quantity, UnitPrice, TotalPrice 
     FROM OpportunityLineItems)
FROM Opportunity
WHERE Id = 'YOUR_TEST_OPP_ID'

-- Verify ACV sync
SELECT Id, Name, ACV__c, Amount, 
       CASE WHEN ACV__c = Amount THEN 'Synced' ELSE 'User Override' END as ACV_Status
FROM Opportunity
WHERE Amount > 0
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
3. Select Price Book (Standard)
4. Choose products and enter quantities/prices
5. Prices default to $120,000 — adjust as needed

---

## Rollback Plan

If issues arise, run this script to deactivate:

```apex
// Deactivate all Eudia products (doesn't delete, just hides)
List<Product2> products = [
    SELECT Id, IsActive 
    FROM Product2 
    WHERE ProductCode LIKE 'AI-Augmented%' 
       OR ProductCode IN ('sigma', 'Custom Agents', 'Litigation', 'Other_Managed Service', 'Other_Secondee', 'Contracting - Secondee')
];

for (Product2 p : products) {
    p.IsActive = false;
}
update products;

System.debug('Deactivated ' + products.size() + ' products');
```

To rollback flows:
1. Deactivate `Sync_Products_to_ACV` flow
2. Deactivate `Sync_Products_to_ACV_On_Delete` flow
3. Revert "Create Opp Assist v2" changes

---

## Testing Checklist

See interactive testing guide: `docs/OPPORTUNITY_PRODUCTS_TESTING.html`

| Test | Expected |
|------|----------|
| Create Opp without Products or ACV | Default ACV applied (via Create Opp Assist) |
| Create Opp with Products, no manual ACV | ACV__c = sum of line items |
| Create Opp with Products, then manually set ACV__c | Manual value preserved, not overwritten |
| Update Products after Opp created | ACV stays user-entered, OR updates if never set |
| Stage change | Stage Snapshot captures current ACV__c |
| Stage 4 with Products | Multiple Delivery records created (Phase 3) |

---

## Impact on Existing Flows

| Flow | Impact | Action Required |
|------|--------|-----------------|
| Align Target Sign and Close Date | None | No changes needed |
| Create Opp Assist v2 | Needs update | Add Products as ACV source |
| Opportunity Stage Snapshot | None | Already captures ACV__c |
| Delivery Creation | Needs update (Phase 3) | Create Delivery per line item |
| Council Code Name Sync | None | No changes needed |
| Next Steps History | None | No changes needed |

---

## Files Reference

```
salesforce/
├── force-app/main/default/flows/
│   ├── Sync_Products_to_ACV.flow-meta.xml          [NEW]
│   └── Sync_Products_to_ACV_On_Delete.flow-meta.xml [NEW]
├── scripts/
│   ├── apex/
│   │   ├── createProductsAndPriceBook.apex         [UPDATED]
│   │   └── createDeliveryFromProducts.apex         [NEW]
│   ├── OPPORTUNITY_PRODUCTS_IMPLEMENTATION.md      [THIS FILE]
│   └── UPDATE_CREATE_OPP_ASSIST_FLOW.md            [NEW]
└── docs/
    └── OPPORTUNITY_PRODUCTS_TESTING.html           [NEW]
```

---

## Next Steps

1. [x] Create Products and Price Book script
2. [x] Create ACV sync flows
3. [x] Document Create Opp Assist update
4. [x] Create testing guide
5. [x] Create Delivery trigger template
6. [ ] Run in Sandbox and validate
7. [ ] Update Create Opp Assist v2 in Flow Builder
8. [ ] Deploy to Production
9. [ ] Update Delivery trigger
10. [ ] Full rollout to BLs

---

*Last Updated: January 27, 2026*
