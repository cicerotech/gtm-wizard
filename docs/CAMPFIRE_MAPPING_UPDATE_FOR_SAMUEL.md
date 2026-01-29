# Campfire Mapping Update

**Date:** January 29, 2026 | **Priority:** High | **From:** Eudia RevOps

---

## Critical Change: Trigger

| Current | Required |
|---------|----------|
| Syncs all Contracts (including Draft) | **ONLY sync when `Contract.Status = 'Activated'`** |

Draft contracts are under review and should not sync to Campfire.

---

## Data Model Change

**Previous:** Single `Parent_Product__c` and `Product_Line__c` fields on Contract (1 value per contract)

**New:** `Contract_Line_Item__c` child records (MANY per contract)

### Relationship
```
Contract (1)  →  Contract_Line_Item__c (N)
   │                    │
   └── Id               └── Contract__c (links to parent)
```

---

## Remove These Contract Fields

| API Name | Reason |
|----------|--------|
| `Parent_Product__c` | Replaced by line items |
| `Product_Line__c` | Replaced by line items |

---

## Add: Contract_Line_Item__c Object

**Sync Trigger:** When parent Contract status changes to `Activated`, sync all child line items.

| API Name | Label | Type | Description |
|----------|-------|------|-------------|
| `Id` | Record ID | Text(18) | Salesforce unique ID |
| `Campfire_Line_Item_ID__c` | Campfire Line Item ID | Text | **EXTERNAL ID - Use for upsert** |
| `Contract__c` | Parent Contract | Lookup | Join key to Contract |
| `Product_Name_Campfire__c` | Product Name | Text | e.g., "AI Contracting - Managed Services" |
| `Parent_Product__c` | Parent Category | Picklist | e.g., "AI Contracting" |
| `Amount_Campfire__c` | Amount | Currency | ACV for this line item |
| `Start_Date_Campfire__c` | Start Date | Date | Product start (or Contract start) |
| `End_Date_Campfire__c` | End Date | Date | Product end (or Contract end) |
| `Duration__c` | Duration | Number | Months between dates |
| `Billing_Frequency__c` | Billing Frequency | Text | Monthly/Quarterly/Annual |
| `Currency__c` | Currency | Picklist | USD/GBP/EUR |
| `Legal_Entity__c` | Legal Entity | Text | Billing entity |

---

## Customer Signed Fields (Verify Mapping)

| API Name | Label | Type | Notes |
|----------|-------|------|-------|
| `CustomerSignedId` | Customer Signed By ID | Reference | Standard Contract field - Contact ID |
| `CustomerSignedTitle` | Customer Signed Title | Text | Standard Contract field |
| `Contact_Signed__c` | Contact Signed | Lookup | Custom lookup to Contact |

**Note:** `CustomerSignedId` is the standard Salesforce field. `Contact_Signed__c` is a custom lookup. Verify which one Campfire should use.

---

## Example: Contract with 2 Line Items

**Contract:**
```json
{
  "Id": "800xx0000001234",
  "Contract_Name_Campfire__c": "Acme Corp - AI Services Agreement",
  "Status": "Activated",
  "Contract_Value__c": 120000,
  "StartDate": "2026-02-01",
  "EndDate": "2027-01-31"
}
```

**Line Items:**
```json
[
  {
    "Id": "a0Jxx0000001AAA",
    "Campfire_Line_Item_ID__c": "CLI-001",
    "Contract__c": "800xx0000001234",
    "Product_Name_Campfire__c": "AI Contracting - Managed Services",
    "Amount_Campfire__c": 60000,
    "Start_Date_Campfire__c": "2026-02-01",
    "End_Date_Campfire__c": "2027-01-31",
    "Duration__c": 12
  },
  {
    "Id": "a0Jxx0000001AAB",
    "Campfire_Line_Item_ID__c": "CLI-002",
    "Contract__c": "800xx0000001234",
    "Product_Name_Campfire__c": "AI Contracting - Technology",
    "Amount_Campfire__c": 60000,
    "Start_Date_Campfire__c": "2026-02-01",
    "End_Date_Campfire__c": "2027-01-31",
    "Duration__c": 12
  }
]
```

---

## Query to Get Contract + Line Items

```sql
-- Get activated contracts
SELECT Id, Contract_Name_Campfire__c, AccountId, Contract_Value__c, 
       StartDate, EndDate, Status
FROM Contract
WHERE Status = 'Activated'
  AND LastModifiedDate > {last_sync_timestamp}

-- Get line items for each contract
SELECT Id, Campfire_Line_Item_ID__c, Contract__c, Product_Name_Campfire__c,
       Amount_Campfire__c, Start_Date_Campfire__c, End_Date_Campfire__c, Duration__c
FROM Contract_Line_Item__c
WHERE Contract__c IN ({contract_ids})
```

---

## Summary

1. **Trigger:** Only sync `Status = 'Activated'`
2. **Remove:** `Parent_Product__c`, `Product_Line__c` from Contract
3. **Add:** `Contract_Line_Item__c` as child object
4. **Key Field:** Use `Campfire_Line_Item_ID__c` as external ID for line items
5. **Verify:** Customer Signed fields (`CustomerSignedId` vs `Contact_Signed__c`)

---

**Attached:** `CAMPFIRE_MAPPING_FINAL.csv` - Full field list with all details
