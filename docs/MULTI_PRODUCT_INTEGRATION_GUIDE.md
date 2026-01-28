# Multi-Product Integration Guide

**Date:** 2026-01-27  
**Status:** Ready for Implementation

---

## Overview

This guide covers the complete multi-product integration strategy for:
1. **Product Selection UX** - New multi-select dropdown field
2. **Delivery Creation** - Multiple deliveries from multiple products
3. **Contract Creation** - Handling multi-product contracts (ERP-sensitive)
4. **Reporting** - Making products visible in reports

---

## 1. PRODUCT SELECTION UX

### Current State
- `Product_Line__c` - Single-select picklist (used by existing flows)
- Products Related List - Native Salesforce, works but requires more clicks

### New Approach: Multi-Select Field + Auto-Sync

**New Field:** `Product_Lines_Multi__c` (Multi-Select Picklist)
- Same values as current `Product_Line__c`
- Users multi-select products in one dropdown
- System auto-creates OpportunityLineItems in the background

**How It Works:**
```
User selects: [Sigma, AI-Augmented Contracting - In-House Technology]
                            ↓
Flow triggers on field change
                            ↓
ProductLineSyncService.syncProductLines()
                            ↓
Creates 2 OpportunityLineItems:
  - Sigma ($120K)
  - AI-Augmented Contracting ($120K)
```

**Benefits:**
- Same simple dropdown UX users are used to
- Full OpportunityLineItem functionality (ACV per product, quantity)
- Products visible in reports
- Flows can create multiple Deliveries/Contracts

### Flow to Create (Sync Multi-Select to Products)

**Name:** `Sync_Product_Lines_Multi`  
**Trigger:** Opportunity, Before Save, when `Product_Lines_Multi__c` IsChanged

1. **Action:** Call Apex `ProductLineSyncService`
2. **Input:** `opportunityId` = `{!$Record.Id}`, `selectedProductLines` = `{!$Record.Product_Lines_Multi__c}`

---

## 2. DELIVERY CREATION

### Current State: "Create Delivery on Opp Close - V8"
- Triggers on Stage = "Stage 4 - Proposal"
- Decision branches for each product type
- Creates single Delivery based on `Product_Line__c`
- Each branch has product-specific templates

### Update Strategy for Multi-Product

**Option A: Apex Action (Recommended)**

Replace product-specific branches with single Apex call:

1. **After Start → Get OpportunityLineItems**
   - Object: `OpportunityLineItem`
   - Filter: `OpportunityId = {!$Record.Id}`
   - Store All Records → `varLineItems`

2. **Decision: Has Products?**
   - Outcome "Has Products": `{!varLineItems} Is Null = False` OR `{!$Record.Amount} > 0`
   - Default: "Legacy Path"

3. **"Has Products" Path:**
   - Add Action → Apex → `DeliveryCreationService`
   - Input: `opportunityId` = `{!$Record.Id}`
   
4. **"Legacy Path":**
   - Keep existing Decision with product branches
   - This handles opportunities without line items

**What DeliveryCreationService Does:**
```
For each OpportunityLineItem:
  Create Delivery__c:
    - Product_Line__c = Product Name
    - Contract_Value__c = Line Item Total Price
    - Account__c = Opportunity Account
    - Eudia_Delivery_Owner__c = Opportunity Owner
    - Delivery_Model__c = 'AI-First (95% AI / 5% Human)'
    - Kickoff_Date__c = Target Sign Date
```

### Product-Specific Templates

If you need product-specific Delivery settings, update `DeliveryCreationService` to include:

```apex
// In the loop that creates Deliveries:
if (oli.Product2.Name.contains('Sigma')) {
    delivery.Delivery_Model__c = 'Hybrid (70% AI / 30% Human)';
    delivery.Template_Type__c = 'Sigma Standard';
} else if (oli.Product2.Name.contains('Compliance')) {
    delivery.Delivery_Model__c = 'AI-First (95% AI / 5% Human)';
    delivery.Template_Type__c = 'Compliance Standard';
}
// etc.
```

---

## 3. CONTRACT CREATION

### Current State: "Create Contract on Opp Close - V2"
- Triggers on Closed Won
- Creates single Contract record
- Fields mapped from Opportunity
- **Syncs to ERP** - ⚠️ SENSITIVE

### Multi-Product Considerations

**Option A: Single Contract with Product Breakdown (Recommended)**

Keep single Contract but include product details:

1. Add field to Contract: `Products_Detail__c` (Long Text Area)
2. Populate from `Opportunity.Products_Breakdown__c`
3. ERP integration unchanged

**In the Flow:**
- Add field mapping: `Products_Detail__c` ← `{!$Record.Products_Breakdown__c}`

**Option B: Multiple Contracts per Product**

Only if ERP requires separate contracts:

1. Use Apex similar to DeliveryCreationService
2. Create one Contract per OpportunityLineItem
3. Each Contract has individual ACV
4. ⚠️ Requires ERP integration review

### Recommended Approach

For now, use **Option A**:
1. Don't change existing Contract creation logic
2. Add `Products_Breakdown__c` to Contract record
3. ERP sees one contract with product detail text
4. Revisit if ERP needs separation

**Flow Update:**
1. Open "Create Contract on Opp Close - V2"
2. In "Create Contract Record" element
3. Add Field: `Products_Detail__c` = `{!$Record.Products_Breakdown__c}`
4. Save as V3

---

## 4. REPORTING

### Making Products Available in Reports

**Problem:** Products are in OpportunityLineItem object, not easily accessible in Opportunity reports.

**Solutions:**

**A. Use `Products_Breakdown__c` Field**
- Already created and populated
- Text field, searchable
- Add to reports/list views

**B. Create Roll-Up Summary Fields (Formula)**

Already created:
- `Products_Summary__c` - Quick count/total (e.g., "Products: $288K")
- `ACV_Products_Mismatch__c` - Warning if mismatch

**C. Use OpportunityLineItem Reports**
- Report Type: "Opportunities with Products"
- Shows one row per product per opportunity
- Can filter, group, summarize by product

**D. Create Report Type (Custom)**
1. Setup → Report Types → New
2. Primary: Opportunity
3. Related: Opportunity Products (OpportunityLineItem)
4. Save as "Opportunity with Product Details"

---

## 5. IMPLEMENTATION ORDER

### Phase 1: Multi-Select Field (Low Risk)

1. Deploy `Product_Lines_Multi__c` field
2. Deploy `ProductLineSyncService` Apex
3. Create Flow to call sync on field change
4. Add field to Opportunity page layout
5. Test: Multi-select → Products created

### Phase 2: Delivery Integration (Medium Risk)

1. Update "Create Delivery on Opp Close" flow:
   - Add Get Records for line items
   - Add Decision for products check
   - Add Apex Action call
2. Test with multi-product opportunity
3. Verify correct Deliveries created

### Phase 3: Contract Enhancement (Low Risk)

1. Add `Products_Detail__c` to Contract object (if not exists)
2. Update "Create Contract on Opp Close" flow
3. Add field mapping for products breakdown
4. Test: Closed Won → Contract has product details

### Phase 4: Reporting (No Risk)

1. Add `Products_Breakdown__c` to list views
2. Create custom report type (optional)
3. Train users on product reports

---

## 6. FIELD REFERENCE

| Field | Object | Type | Purpose |
|-------|--------|------|---------|
| `Product_Line__c` | Opportunity | Picklist (Single) | Legacy, keep for existing flows |
| `Product_Lines_Multi__c` | Opportunity | Picklist (Multi) | New multi-select entry |
| `Products_Breakdown__c` | Opportunity | Long Text | Formatted product list |
| `Products_Summary__c` | Opportunity | Formula | Quick product count/total |
| `ACV_Products_Mismatch__c` | Opportunity | Formula | Warning if mismatch |

---

## 7. WHAT TO DO NOW

**You (Manual Steps):**

1. **Verify Apex script ran:** Check debug logs in Dev Console for "Cleaned X opportunities"

2. **Activate flow version:** If not done, activate newest "Next Steps History On Update"

3. **Wait for deployment:** I'll deploy the new multi-select field and Apex service

**After Deployment:**

4. **Add field to page layout:** Setup → Object Manager → Opportunity → Page Layouts → Add `Product_Lines_Multi__c`

5. **Update Delivery flow:** Add the decision + Apex action as described above

6. **Update Contract flow:** Add `Products_Breakdown__c` mapping

---

*Document maintained by GTM Brain*

