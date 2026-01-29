# Update Contract Creation Flow for Line Items

## Overview

The "Create Contract on Opp Close" flow currently creates a single Contract record. This update adds automatic creation of **Contract Line Items** from **Opportunity Products** (OpportunityLineItems).

This enables:
- ✅ Individual product/service breakdown on contracts
- ✅ Accurate dollar amounts per line item for ERP reconciliation
- ✅ Proper invoicing with multiple line items
- ✅ Clear product tracking from Opportunity → Contract → Invoice

---

## What Was Created

### 1. Custom Object: `Contract_Line_Item__c`

A new custom object with these fields:

| Field | API Name | Type | Description |
|-------|----------|------|-------------|
| Contract | `Contract__c` | Master-Detail | Parent contract (required) |
| Product | `Product__c` | Lookup | Reference to Product2 |
| Source Opportunity Product | `Source_Line_Item__c` | Lookup | Original OpportunityLineItem |
| Product Name | `Product_Name__c` | Text | Denormalized for reporting |
| Product Code | `Product_Code__c` | Text | SKU for ERP matching |
| Product Family | `Product_Family__c` | Text | Product category |
| Quantity | `Quantity__c` | Number | Quantity |
| Unit Price | `Unit_Price__c` | Currency | Price per unit |
| Total Price | `Total_Price__c` | Currency | Line total (Unit × Qty) |
| Description | `Description__c` | Long Text | Notes |
| Line Number | `Line_Number__c` | Number | Sequence on contract |
| Service Date | `Service_Date__c` | Date | Service start date |

### 2. Apex Invocable: `ContractLineItemService`

An Apex class with `@InvocableMethod` that:
1. Takes Contract ID + Opportunity ID as inputs
2. Queries all OpportunityLineItems from the Opportunity
3. Creates one Contract_Line_Item__c per product
4. Updates the Contract with total value

---

## Flow Update Instructions

### Step 1: Deploy the Metadata

Run in terminal:
```bash
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain
sf project deploy start --source-dir salesforce/force-app/main/default/objects/Contract_Line_Item__c --target-org YOUR_ORG
sf project deploy start --source-dir salesforce/force-app/main/default/classes/ContractLineItemService.cls --target-org YOUR_ORG
sf project deploy start --source-dir salesforce/force-app/main/default/classes/ContractLineItemService.cls-meta.xml --target-org YOUR_ORG
```

Or deploy all at once:
```bash
sf project deploy start --source-dir salesforce/force-app/main/default --target-org YOUR_ORG
```

### Step 2: Add Related List to Contract Layout

1. Go to **Setup → Object Manager → Contract → Page Layouts**
2. Edit the Contract layout
3. Drag "Contract Line Items" related list onto the layout
4. Configure columns to show: Line Number, Product Name, Quantity, Unit Price, Total Price
5. Save

### Step 3: Update the Flow

1. Go to **Setup → Flows**
2. Find and open **"Create Contract on Opp Close - V3"**
3. Click **Save As** to create a new version

#### Add Apex Action After "Link to Contract" Step:

1. Click **+** after the "Link to Contract" element
2. Add **Action** → **Apex Action**
3. Select **"Create Contract Line Items from Opportunity"**
4. Configure inputs:
   - **Contract ID**: `{!newContractId}` (the variable storing the created Contract ID)
   - **Opportunity ID**: `{!$Record.Id}` (the triggering Opportunity)

#### Updated Flow Structure:

```
Start (Opportunity → Closed Won)
    ↓
Create Contract Record
    ↓
[Store Contract ID in {!newContractId}]
    ↓
Link to Contract (Update Opportunity.ContractId)
    ↓
Create Contract Line Items ← NEW STEP
    ↓
End
```

### Step 4: Save and Activate

1. Save the Flow
2. Activate the new version
3. Deactivate the old version

---

## Testing

### Test Case 1: Opportunity with Multiple Products

1. Create a new Opportunity
2. Add Products:
   - AI Contracting – Managed Services: $120,000
   - AI Platform – Sigma: $120,000
3. Move to Stage 6. Closed(Won)
4. Verify:
   - Contract created
   - 2 Contract Line Items created
   - Each line item has correct Product, Quantity, and Price

### Test Case 2: Opportunity with No Products (Legacy)

1. Create Opportunity with only Product_Line__c set (no Products added)
2. Move to Closed Won
3. Verify:
   - Contract created
   - 1 Contract Line Item created using legacy Product_Line__c and ACV

### Test Script (Developer Console)

```apex
// Test with existing closed Opportunity
Id oppId = '0068a00001XXXXX';  // Replace with actual ID
Id contractId = '8008a00001XXXXX';  // Replace with Contract ID

List<Contract_Line_Item__c> lineItems = ContractLineItemService.createLineItemsForContract(contractId, oppId);

System.debug('Created ' + lineItems.size() + ' line items:');
for (Contract_Line_Item__c li : lineItems) {
    System.debug('  - ' + li.Product_Name__c + ': $' + li.Total_Price__c);
}
```

---

## Backfill Existing Contracts

To create line items for contracts that already exist:

```apex
// Get contracts that don't have line items yet
List<Contract> contractsToProcess = [
    SELECT Id, Opportunity__c 
    FROM Contract 
    WHERE Opportunity__c != null
    AND Id NOT IN (SELECT Contract__c FROM Contract_Line_Item__c)
    LIMIT 50
];

for (Contract c : contractsToProcess) {
    // Get the related Opportunity
    Opportunity opp = [SELECT Id FROM Opportunity WHERE ContractId = :c.Id LIMIT 1];
    if (opp != null) {
        ContractLineItemService.createLineItemsForContract(c.Id, opp.Id);
        System.debug('Processed: ' + c.Id);
    }
}
```

---

## Campfire/ERP Integration Notes

The Contract Line Items now provide:

1. **Individual Product Breakdown** - Each line item maps to one invoice line
2. **Product Codes** - Use `Product_Code__c` for ERP product matching
3. **Source Traceability** - `Source_Line_Item__c` links back to original Opportunity Product
4. **Accurate Pricing** - Quantity, Unit Price, and Total Price match the Opportunity exactly

When syncing to Campfire:
- Create one subscription line per Contract Line Item
- Use `Total_Price__c` for the line amount
- Map `Product_Code__c` to Campfire product ID

---

## Troubleshooting

### Line Items Not Created

1. Check Flow is active
2. Verify Apex action is configured correctly
3. Check debug logs for errors

### Duplicate Line Items

The service checks for existing line items and skips if found:
```apex
List<Contract_Line_Item__c> existingLineItems = [
    SELECT Id FROM Contract_Line_Item__c WHERE Contract__c = :contractId
];
if (!existingLineItems.isEmpty()) {
    return existingLineItems; // Skip creation
}
```

### Missing Products

If Opportunity has no OpportunityLineItems, the service falls back to creating a single line item from the `Product_Line__c` and `ACV__c` fields.

