# Next Steps History & Delivery Integration Fix

**Date:** 2026-01-27  
**Status:** Action Required

---

## ISSUE 1: Next Steps History Showing `<br>` Tags

### Root Cause Analysis

The problem has **three layers**:

1. **OLD data contains `<br>` text** - Previous flow version used `BR()` function which outputs literal `<br>` text
2. **Each save escapes existing content** - When the field is read and written back, special characters get HTML-encoded:
   - `<br>` → `&lt;br&gt;` → `&amp;lt;br&amp;gt;`
3. **New flow version is in Draft** - The corrected flow with Text Templates deployed as Draft, not Active

### Fix Steps

#### Step 1: Activate the Correct Flow Version

1. Go to **Setup → Flows**
2. Find **"Next Steps History On Update"**
3. Click on it to open
4. You'll see version list - look for the newest version with Text Template
5. Click **"Activate"** on that version
6. Confirm deactivation of the old version

#### Step 2: Clean Existing Data (Run Once)

In Developer Console → **Debug → Open Execute Anonymous Window**, run:

```apex
// Clean up Next Steps History field - removes HTML entities
List<Opportunity> oppsToUpdate = new List<Opportunity>();

List<Opportunity> opps = [
    SELECT Id, Name, Next_Step_Eudia__c
    FROM Opportunity
    WHERE IsClosed = false
    LIMIT 200
];

System.debug('Checking ' + opps.size() + ' opportunities');

for (Opportunity opp : opps) {
    String original = opp.Next_Step_Eudia__c;
    
    if (String.isBlank(original)) continue;
    
    // Skip if clean
    if (!original.contains('<br>') && 
        !original.contains('&lt;') && 
        !original.contains('&amp;') &&
        !original.contains('&gt;')) {
        continue;
    }
    
    String cleaned = original;
    
    // Clean in order: most-escaped first
    cleaned = cleaned.replace('&amp;amp;lt;br&amp;amp;gt;', '\n');
    cleaned = cleaned.replace('&amp;lt;br&amp;gt;', '\n');
    cleaned = cleaned.replace('&lt;br&gt;', '\n');
    cleaned = cleaned.replace('<br>', '\n');
    cleaned = cleaned.replace('<BR>', '\n');
    cleaned = cleaned.replace('<br/>', '\n');
    
    // Clean leftover entities
    cleaned = cleaned.replace('&amp;amp;', '&');
    cleaned = cleaned.replace('&amp;lt;', '<');
    cleaned = cleaned.replace('&amp;gt;', '>');
    cleaned = cleaned.replace('&lt;', '');
    cleaned = cleaned.replace('&gt;', '');
    cleaned = cleaned.replace('&amp;', '&');
    
    // Remove excessive newlines
    while (cleaned.contains('\n\n\n\n')) {
        cleaned = cleaned.replace('\n\n\n\n', '\n\n');
    }
    
    if (cleaned != original) {
        opp.Next_Step_Eudia__c = cleaned;
        oppsToUpdate.add(opp);
        System.debug('Cleaning: ' + opp.Name);
    }
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Updated ' + oppsToUpdate.size() + ' opportunities');
}
```

#### Step 3: Verify

1. Go to any test Opportunity
2. Change the Next Steps field
3. Save
4. Check "Customer history + Next steps" - should show clean text with line breaks

---

## ISSUE 2: Delivery Creation for Multi-Product

### Your Current Flow: "Create Delivery on Opp Close - V8"

Based on your screenshot, the flow:
- **Triggers:** Stage changes AND Stage = "Stage 4 - Proposal"
- **Conditions:** Skip Delivery Creation = False, Delivery Is Null, Stage = Stage 4
- **Logic:** Routes to different paths based on `Product_Line__c` value

### What Happens Now with Multi-Product Deals

**Current behavior (single product):**
- Flow checks `Product_Line__c` → Creates 1 Delivery based on that product type

**Problem with multi-product:**
- `Product_Line__c` field holds one value (e.g., "Undetermined" or "Multiple")
- Products are stored in `OpportunityLineItems` (Products related list)
- Current flow doesn't loop through products

### Integration Options

#### Option A: Add Apex Action to Your Existing Flow (Recommended)

Add a **Decision** at the start of your flow:

```
Decision: "Has OpportunityLineItems?"
├── YES (Amount > 0) → Call Apex Action → End
└── NO → Continue with existing logic (Product_Line__c routing)
```

**Steps:**
1. Open "Create Delivery on Opp Close - V8"
2. Add a **Get Records** element right after Start:
   - Object: `OpportunityLineItem`
   - Filter: `OpportunityId Equals {!$Record.Id}`
   - Store: First record → `varLineItem`
3. Add a **Decision** element:
   - Outcome "Has Products": `varLineItem Is Null = False`
   - Default: "No Products"
4. In "Has Products" path:
   - Add **Action** → Apex Action → **"Create Deliveries from Opportunity"**
   - Input: `opportunityId` = `{!$Record.Id}`
   - Connect to your Link_Delivery_to_Opportunity assignment
5. In "No Products" path:
   - Connect to your existing "Exit Commitment Decision"
6. Save as Version 9

#### Option B: Replace Entire Create Records Section

If you want to simplify:

1. Delete all the product-specific branches (Sigma, Compliance, M&A, etc.)
2. Replace with single Apex Action call
3. The Apex handles all product types automatically

### What the DeliveryCreationService Does

```
DeliveryCreationService.createDeliveriesInvocable(opportunityId)
├── Queries Opportunity with OpportunityLineItems
├── If HAS products:
│   └── For each product → Create Delivery
│       - Product_Line__c = Product Name
│       - Contract_Value__c = Product Price
│       - Account__c, Owner__c, etc. from Opportunity
├── If NO products:
│   └── Create single Delivery using Product_Line__c field
└── Returns: List of created Delivery IDs
```

---

## SUMMARY: What Needs to Happen

### Next Steps History (Fix Now)

| Step | Action | Who |
|------|--------|-----|
| 1 | Activate newest "Next Steps History On Update" flow version | You (Setup UI) |
| 2 | Run cleanup Apex script | You (Dev Console) |
| 3 | Test on one Opportunity | You |

### Delivery Integration (Plan)

| Step | Action | Who |
|------|--------|-----|
| 1 | Review Option A vs B above | You |
| 2 | Open "Create Delivery on Opp Close - V8" | You |
| 3 | Add Decision + Apex Action for products | You (Flow Builder) |
| 4 | Save as V9, test on one Opp | You |

---

## Flow Status Check

Run this to see current flow status:
```
Setup → Flows → Search "Next Steps" → Check which version is Active
```

Expected state after fix:
- `Next Steps History On Update` → Active (Text Template version)
- `Next Steps History On Create` → Active (for new Opps)
- `Opportunity Next Steps History` → Inactive (old BR() version)

---

*Document maintained by GTM Brain*

