# Revenue Reconciliation Data Files

This folder contains Data Loader-ready CSV files for reconciling EUDIA Salesforce opportunities with Johnson Hana CRM data.

## Overview

**Goal**: Align EUDIA opportunity data with JH CRM closed-won values while preserving Active Revenue totals.

**Strategy**: Use dual-field approach:
- `Amount` / `Revenue` = Active Revenue (preserved, trusted)
- `JH_Original_ACV__c` = Original JH closed-won value
- `ACV_Variance_Reason__c` = Documents why values differ

---

## Files and Usage

### 1. `northern-trust-fix.csv`
**Purpose**: Fix missing Revenue value for Northern Trust CDR6 opportunity
**Action**: Update via Data Loader
**Impact**: Adds $113,100 to Active Revenue

| Field | Value |
|-------|-------|
| Id | 006Wj00000NNvht |
| Amount | $113,100 |
| JH_Original_ACV__c | $113,100 |

---

### 2. `tiktok-term-fix.csv`
**Purpose**: Correct term from 12 to 6 months for TikTok DSAR 2026
**Action**: Update via Data Loader (verify first)
**Impact**: No revenue change, corrects term length

---

### 3. `jh-original-acv-updates.csv`
**Purpose**: Populate JH_Original_ACV__c for key discrepant opportunities
**Action**: Update via Data Loader
**Impact**: No revenue change (updates new field only)

Key updates:
- Kingspan: JH ACV = $8,120 (Bundle Allocation)
- Aryza: JH ACV = $226,200 (Multi-Year Annualization)
- Glanbia: JH ACV = $88,044 (Rate Adjustment)
- TikTok: JH ACV = $87,000 (Term Difference)

---

### 4. `complete-jh-acv-updates.csv`
**Purpose**: Comprehensive JH ACV mapping for all matched opportunities
**Action**: Update via Data Loader
**Impact**: No revenue change (updates new fields only)
**Records**: 47 opportunities

---

### 5. `missing-opportunities-with-ids.csv`
**Purpose**: Create missing JH Q4 opportunities not in EUDIA
**Action**: Insert via Data Loader
**Impact**: Adds $425,603 to Active Revenue if created

Missing deals:
| Account | Opportunity | Amount |
|---------|-------------|--------|
| Indeed Ireland | ODL Steph Donald extension #1 | $102,080 |
| Indeed Ireland | ODL (Helen Hewson) | $52,200 |
| Stripe | RFP Privacy ODL Extension | $64,923 |
| Bank of Ireland | FSPO team expansion #2 | $41,760 |
| CommScope | Extension Conor Hassett | $40,601 |
| Consensys | DPO as a Service | $40,403 |
| OpenAI | Himanshu Gaur expansion | $69,600 |
| Kellanova | Julie Collins team Extension | $11,136 |
| Novelis | AI Output Validation | $2,900 |

**Note**: Novelis requires Account creation first.

---

### 6. `november-rr-resolution.csv`
**Purpose**: Document November RR Revenue opps as "Run Rate Capture"
**Action**: Update via Data Loader
**Impact**: No revenue change (documents variance reason only)

These 5 opportunities ($454,164 total) represent existing recurring revenue, not new Q4 bookings:
- Coillte - November RR Revenue
- Airship - November RR Revenue
- Creed McStay - November RR Revenue
- DCEDIY - November RR Revenue
- Coleman Legal - November RR Revenue

**Recommended Approach**: Keep as-is with `ACV_Variance_Reason__c = "Run Rate Capture"`. This preserves Active Revenue while documenting that these are not new Q4 closed-won deals.

---

## Execution Order

1. **Deploy new fields first** (from `force-app/main/default/objects/Opportunity/fields/`)
   - JH_Original_ACV__c
   - ACV_Variance_Reason__c
   - ACV_Variance_Amount__c

2. **Apply safe updates** (no Active Rev impact):
   - `jh-original-acv-updates.csv`
   - `complete-jh-acv-updates.csv`
   - `november-rr-resolution.csv`

3. **Apply revenue-impacting updates** (verify totals after):
   - `northern-trust-fix.csv` (+$113,100)
   - `missing-opportunities-with-ids.csv` (+$425,603 if created)

4. **Verify term corrections**:
   - `tiktok-term-fix.csv`

---

## Validation Checkpoints

After all updates, verify:

| Metric | Expected Value |
|--------|---------------|
| Active Rev Total (before missing opps) | $19,741,429 |
| Active Rev Total (after Northern Trust fix) | $19,854,529 |
| Active Rev Total (after missing opps) | $20,280,132 |
| Run Rate Revenue (Nov) | $17,904,162 |

---

## Field Definitions

### JH_Original_ACV__c (Currency)
Original Annual Contract Value from Johnson Hana CRM for migrated opportunities.

### ACV_Variance_Reason__c (Picklist)
- **Bundle Allocation**: Revenue allocated from larger bundle/contract
- **Multi-Year Annualization**: Multi-year deal spread differently
- **Rate Adjustment**: Minor rate/pricing variance
- **Run Rate Capture**: Existing recurring revenue capture, not new deal
- **Contract Amendment**: Contract modified after initial close
- **Term Difference**: Different term lengths between systems
- **No Variance**: Values match between systems

### ACV_Variance_Amount__c (Formula)
`Amount - JH_Original_ACV__c`
- Positive = EUDIA higher than JH
- Negative = JH higher than EUDIA

