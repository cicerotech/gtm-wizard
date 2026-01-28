# Update Delivery Flow for Multi-Product Support

## Overview

The existing "Create Delivery on Opp Close" flow creates a single Delivery record using `Product_Line__c`. For multi-product deals (opportunities with OpportunityLineItems), we need to create one Delivery per product.

## Solution: DeliveryCreationService

A new Invocable Apex class `DeliveryCreationService` has been created that:
1. Checks if the Opportunity has OpportunityLineItems
2. If YES: Creates one Delivery per line item with individual product/value
3. If NO: Falls back to single Delivery using `Product_Line__c` (legacy behavior)
4. Skips creation if Deliveries already exist for the Opportunity

---

## Option 1: Replace Flow Element with Apex Action (Recommended)

### Step 1: Open the Flow
1. Go to **Setup → Flows**
2. Find and open **"Create Delivery on Opp Close"**

### Step 2: Delete the Existing Create Records Element
1. Locate the **"Create Delivery Record"** element
2. Delete it (we'll replace with Apex action)

### Step 3: Add Apex Action
1. Add a new **"Action"** element
2. Select **"Apex Action"** → **"Create Deliveries from Opportunity"**
3. Configure inputs:
   - **Opportunity ID**: `{!$Record.Id}`
   - **Default Status**: `Planning`
4. (Optional) Store output in variables for the Update step

### Step 4: Update the Opportunity Link
If your flow updates the Opportunity with a Delivery lookup:
1. The Apex action returns `Delivery IDs` as a collection
2. Use the first ID: `{!deliveryIds[0]}` (for legacy single-delivery field)

### Step 5: Save and Test
1. Save as new version
2. Test with:
   - Opportunity with **no products** → Should create 1 Delivery
   - Opportunity with **3 products** → Should create 3 Deliveries

---

## Option 2: Keep Flow, Add Decision Branch

If you prefer to keep more logic in the Flow:

### Step 1: Add Get Records Element
After Start, add **Get Records** to query OpportunityLineItems:
- Object: `OpportunityLineItem`
- Filter: `OpportunityId Equals {!$Record.Id}`
- Store: `varLineItems` (collection)

### Step 2: Add Decision
**Decision Name**: Has_Products?

**Outcome 1**: Has Products
- Condition: `{!varLineItems}` Collection Size Greater Than 0
- Route to: Apex Action (create multiple deliveries)

**Outcome 2**: No Products (default)
- Route to: Existing Create Records element (single delivery)

### Step 3: Configure Apex Action (for Has Products path)
Same as Option 1 - use the `DeliveryCreationService` Invocable method.

---

## Testing Checklist

### Test Case 1: Legacy Opportunity (No Products)
- [ ] Create Opp with Product_Line__c = "Sigma", ACV = $100K
- [ ] Move to Closed Won stage
- [ ] Verify: 1 Delivery created with $100K value

### Test Case 2: Single Product Opportunity
- [ ] Create Opp with 1 OpportunityLineItem ($120K)
- [ ] Move to Closed Won stage
- [ ] Verify: 1 Delivery created with $120K value

### Test Case 3: Multi-Product Opportunity
- [ ] Create Opp with 3 OpportunityLineItems ($120K, $120K, $48K)
- [ ] Move to Closed Won stage
- [ ] Verify: 3 Deliveries created, one per product
- [ ] Verify: Each Delivery has correct Product_Line__c and Contract_Value__c

### Test Case 4: Re-run Protection
- [ ] Take an Opp that already has Deliveries
- [ ] Try to trigger flow again
- [ ] Verify: No duplicate Deliveries created

---

## Deployment

To deploy the Apex classes:

```bash
cd salesforce
sf project deploy start \
  --source-dir force-app/main/default/classes/DeliveryCreationService.cls \
  --source-dir force-app/main/default/classes/DeliveryCreationService.cls-meta.xml \
  --source-dir force-app/main/default/classes/DeliveryCreationServiceTest.cls \
  --source-dir force-app/main/default/classes/DeliveryCreationServiceTest.cls-meta.xml \
  --target-org eudia-prod \
  --wait 10
```

---

## Rollback

If issues occur:
1. Deactivate the new flow version
2. Reactivate the previous flow version
3. The Apex classes can remain deployed (they won't run if not called)

