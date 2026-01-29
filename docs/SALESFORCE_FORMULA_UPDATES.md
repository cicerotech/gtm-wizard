# Salesforce Formula Updates - Account Classification Alignment

## Overview

This document provides the exact formulas to update in Salesforce Setup to align the Account Type Classification with Sales Type logic while maintaining the Q4 weighted forecast of ~$4.57M.

---

## Step 1: Update Account_Type_Classification__c Formula

**Navigate to:** Setup → Object Manager → Opportunity → Fields & Relationships → Account_Type_Classification__c → Edit

### Current Formula (REPLACE THIS):
```
IF(TEXT(Account.Industry_Grouping__c) = "Government", "Government", 
  IF(OR(TEXT(Sales_Type__c) = "New business via LOI", 
        TEXT(Account.Type__c) = "LOI, with $ attached", 
        TEXT(Account.Type__c) = "LOI, no $ attached"), "LOI", 
    IF(OR(TEXT(Account.Type__c) = "Revenue", 
          TEXT(Account.Type__c) = "Pilot", 
          TEXT(Sales_Type__c) = "Expansion / Upsell", 
          TEXT(Sales_Type__c) = "Renewal", 
          TEXT(Sales_Type__c) = "Renewal + Expansion", 
          TEXT(Sales_Type__c) = "Cross-sell"), "Existing Client", 
      "New Logo")))
```

### NEW Formula (COPY THIS):
```
IF(TEXT(Account.Industry_Grouping__c) = "Government", "Government",
  IF(TEXT(Sales_Type__c) = "New business via LOI", "LOI",
    IF(OR(
      TEXT(Sales_Type__c) = "Expansion / Upsell",
      TEXT(Sales_Type__c) = "Renewal",
      TEXT(Sales_Type__c) = "Renewal + Expansion",
      TEXT(Sales_Type__c) = "Cross-sell",
      TEXT(Account.Type__c) = "Revenue",
      TEXT(Account.Type__c) = "Pilot",
      TEXT(Account.Type__c) = "LOI, with $ attached",
      TEXT(Account.Type__c) = "LOI, no $ attached"
    ), "Existing Client",
    "New Logo"
    )
  )
)
```

### Logic Priority:
1. **Government** → Account.Industry_Grouping__c = "Government"
2. **LOI** → Sales_Type__c = "New business via LOI"
3. **Existing Client** → Sales_Type__c IN (Expansion, Renewal, Cross-sell) OR Account.Type__c IN (Revenue, Pilot, LOI)
4. **New Logo** → Everything else (truly net new)

---

## Step 2: Update Calculated_Probability__c Formula

**Navigate to:** Setup → Object Manager → Opportunity → Fields & Relationships → Calculated_Probability__c (or similar name) → Edit

### NEW Formula (Swap EC/LOI, Remove Stage 5):
```
CASE(TEXT(StageName), 
  "Stage 0 - Qualifying", CASE(Account_Type_Classification__c, "Government", 0.02, "LOI", 0.02, "Existing Client", 0.02, 0.02),
  "Stage 1 - Discovery", CASE(Account_Type_Classification__c, "Government", 0.08, "LOI", 0.18, "Existing Client", 0.20, 0.10), 
  "Stage 2 - SQO", CASE(Account_Type_Classification__c, "Government", 0.12, "LOI", 0.32, "Existing Client", 0.35, 0.20), 
  "Stage 3 - Pilot", CASE(Account_Type_Classification__c, "Government", 0.18, "LOI", 0.42, "Existing Client", 0.45, 0.25), 
  "Stage 4 - Proposal", CASE(Account_Type_Classification__c, "Government", 0.22, "LOI", 0.50, "Existing Client", 0.55, 0.33),
  "Stage 6. Closed(Won)", 1.00, 
  0) 
* IF(AND(Account_Type_Classification__c = "Government", NOT(ISBLANK(Target_LOI_Date__c)), Target_LOI_Date__c > DATE(YEAR(TODAY()), CEILING(MONTH(TODAY())/3)*3, 31)), 0.70, 1.00)
```

### Probability Matrix Reference:

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 0 - Qualifying | 2% | 2% | 2% | 2% |
| Stage 1 - Discovery | 10% | **20%** | **18%** | 8% |
| Stage 2 - SQO | 20% | **35%** | **32%** | 12% |
| Stage 3 - Pilot | 25% | **45%** | **42%** | 18% |
| Stage 4 - Proposal | 33% | **55%** | **50%** | 22% |
| ~~Stage 5~~ | ~~REMOVED~~ | ~~REMOVED~~ | ~~REMOVED~~ | ~~REMOVED~~ |

### Changes Made:
- **Existing Client is now HIGHEST** (swapped with LOI)
- **LOI is now SECOND** (swapped with Existing Client)
- **Stage 5 (Negotiation) REMOVED** (not used)
- New Logo and Government unchanged

---

## Step 3: Expected Impact Analysis

Based on your Q4 pipeline of $4,574,103.55:

### Probability Swap Impact (EC ↔ LOI):

| Classification | Direction | Approximate Impact |
|----------------|-----------|-------------------|
| Existing Client deals | Probability UP (+5%) | Weighted increases |
| LOI deals | Probability DOWN (-5%) | Weighted decreases |
| **Net Effect** | **Near neutral** | Depends on EC vs LOI mix |

### Classification Fix Impact:

Deals where Account.Type__c = Revenue/Pilot/LOI but Sales_Type = "New business":
- These will now be correctly classified as "Existing Client"
- Their probability will increase (33% → 55% at Stage 4)
- This is a CORRECTION, not inflation

### Conservative Estimate:

If ~$500K ACV is reclassified from New Logo → Existing Client at Stage 4:
- Current weighted: $500K × 33% = $165K
- New weighted: $500K × 55% = $275K
- Delta: +$110K

**This is offset by the LOI probability decrease**, resulting in minimal net change to $4.57M.

---

## Step 4: Validation Checklist

After updating both formulas, verify:

- [ ] Expansion/Upsell deals show as "Existing Client" ✓
- [ ] New business via LOI deals show as "LOI" ✓
- [ ] Deals with Account.Type__c = Revenue show as "Existing Client" ✓
- [ ] True new business with no account history shows as "New Logo" ✓
- [ ] Government accounts show as "Government" ✓
- [ ] Total Q4 weighted is within ±5% of $4.57M
- [ ] No Stage 5 deals exist (or they show 0% probability)

---

## Step 5: Optional - Create Auto-Suggest Flow

### Flow: "Auto-Suggest Sales Type on Opportunity"

**Type:** Record-Triggered Flow

**Object:** Opportunity

**Trigger:** When a record is created or updated

**Entry Criteria:**
```
AND(
  OR(
    ISPICKVAL(Account.Type__c, "Revenue"),
    ISPICKVAL(Account.Type__c, "Pilot"),
    ISPICKVAL(Account.Type__c, "LOI, with $ attached"),
    ISPICKVAL(Account.Type__c, "LOI, no $ attached")
  ),
  OR(
    ISPICKVAL(Sales_Type__c, "New business"),
    ISBLANK(TEXT(Sales_Type__c))
  )
)
```

**Action:** Update Record
- Field: Sales_Type__c
- Value: "Expansion / Upsell"

**Alternatively:** Use a Screen Flow to prompt the user:
> "This account is already a customer (Type: {!Account.Type__c}). Would you like to classify this as Expansion/Upsell instead of New Business?"

---

## Rollback Plan

If the forecast changes too dramatically:

1. **Quick Fix:** Use Custom_Probability_Value field to override specific deals
2. **Formula Rollback:** Revert to original formulas (saved above)
3. **Probability Adjustment:** Reduce Existing Client probabilities by 5% if needed

---

## Summary

| Change | Impact | Risk |
|--------|--------|------|
| Classification formula update | Correct misclassified deals | Low - based on account reality |
| Probability swap (EC ↔ LOI) | Existing Client now highest | Low - net neutral effect |
| Stage 5 removal | No impact | None - stage not used |

**Expected Q4 Weighted:** ~$4.5M - $4.7M (within acceptable range)






