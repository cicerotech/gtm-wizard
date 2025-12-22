# Final December Expiring Deals Correction Summary

**Generated:** December 21, 2025  
**Purpose:** Align EUDIA December expiring opportunities with Johnson Hana validated data

---

## Executive Summary

| Account | December Opp | EUDIA Current | JH Amount | Action | Change |
|---------|--------------|---------------|-----------|--------|--------|
| Uisce Éireann | Jamie O'Gorman Aug-Dec | $327,389 | $78,602 | REDUCE | -$248,787 |
| Etsy | Eleanor Power Extension | $259,370 | $69,600 | REDUCE | -$189,770 |
| TikTok | DSAR Support ODL Ext 1 | $198,880 | $98,601 | REDUCE | -$100,279 |
| Indeed | DPO ODL | $163,566 | $104,400 | REDUCE | -$59,166 |
| Dropbox | Fabiane 2025 extension | $170,997 | $180,960 | INCREASE | +$9,963 |
| Dropbox | Fabiane Expansion Hours | $51,040 | $51,040 | NO CHANGE | $0 |
| Uisce Éireann | Luke Sexton Aug-Dec | $68,776 | $68,776 | NO CHANGE | $0 |
| Uisce Éireann | Amal Elbay Aug-Dec | $38,721 | $38,721 | NO CHANGE | $0 |

**Total Net Change: -$588,039**

---

## Why This Won't Break Account Totals

The bundled amounts were added to December opps during bulk import for speed, but the underlying historical revenue is already captured in other opportunities for each account.

### JH Account Totals (from screenshots):

| Account | JH Total ACV | JH Records |
|---------|--------------|------------|
| TikTok | $2,809,960 | 32 |
| Indeed | $1,312,111 | 13 |
| Uisce Éireann | $956,496 | 19 |
| Etsy | $657,231 | 7 |
| Dropbox | $396,488 | 5 |

These totals should approximately match what's in EUDIA at the account level once corrections are made.

---

## Detailed Corrections

### 1. Uisce Éireann - Jamie O'Gorman (REDUCE by $248,787)

**Current EUDIA:** $327,388.82  
**JH Validated:** $78,601.60  
**Term:** 5 months | **End Date:** 12/28/2025

**Bundled from (already in EUDIA reports):**
- CDS Team 3 Consultant Team: $205,436
- CDS team extension - 3 months: $81,201
- Other historical CDS opps

**Action:** Update Revenue from $327,388.82 → $78,601.60

---

### 2. Etsy - Eleanor Power Extension (REDUCE by $189,770)

**Current EUDIA:** $259,369.68  
**JH Validated:** $69,600.00  
**Term:** 6 months | **End Date:** 12/31/2025

**Note:** JH shows 7 Etsy opps totaling $657,231. The $189,770 difference is likely from:
- H2 2024 Support (AT): $121,730 (already in EUDIA)
- Privacy Support H2 2024 Ext: $243,461 (already in EUDIA)

**Action:** Update Revenue from $259,369.68 → $69,600.00

---

### 3. TikTok - DSAR Support ODL Extension 1 (REDUCE by $100,279)

**Current EUDIA:** $198,879.74  
**JH Validated:** $98,601.16  
**Term:** 6 months | **End Date:** 12/31/2025

**Bundled from (already in EUDIA reports):**
- TikTok DSAR Management: $121,800
- Various other DSAR projects

**Action:** Update Revenue from $198,879.74 → $98,601.16

---

### 4. Indeed - DPO ODL (REDUCE by $59,166)

**Current EUDIA:** $163,565.98  
**JH Validated:** $104,400.00  
**Term:** 9 months | **End Date:** 12/24/2025

**Note:** JH shows 13 Indeed opps totaling $1,312,111. The $59,166 difference is likely from:
- Indeed DSAR Support 2024: $184,440 (already in EUDIA)
- Other ODL opps

**Action:** Update Revenue from $163,565.98 → $104,400.00

---

### 5. Dropbox - Fabiane 2025 extension (INCREASE by $9,963)

**Current EUDIA:** $170,997.06  
**JH Validated:** $180,960.00  
**Term:** 12 months | **End Date:** 12/31/2025

**Note:** This is UNDERSTATED, not overstated.

**Action:** Update Revenue from $170,997.06 → $180,960.00

---

### 6. Dropbox - Fabiane Expansion Hours (NO CHANGE)

**Current EUDIA:** $51,040.00  
**JH Validated:** $51,040.00  

**Action:** No change needed - already aligned

---

### 7-8. Uisce Éireann - Luke Sexton & Amal Elbay (NO CHANGE)

Both already aligned with JH:
- Luke Sexton: $68,776.40 ✓
- Amal Elbay: $38,720.80 ✓

---

## Data Loader Update File

**File:** `DATALOADER-FINAL-DECEMBER.csv`

| Opportunity ID | Opportunity Name | Current | New | Term | Change |
|----------------|------------------|---------|-----|------|--------|
| `006Wj00000MDisk` | Uisce Eireann Jamie O'Gorman Aug-Dec | $327,389 | $78,602 | 5 mo | -$248,787 |
| `006Wj00000MDihu` | Etsy Eleanor Power Extension | $259,370 | $69,600 | 6 mo | -$189,770 |
| `006Wj00000MDisG` | TikTok DSAR Support ODL Ext 1 | $198,880 | $98,601 | 6 mo | -$100,279 |
| `006Wj00000MDijz` | Indeed DPO ODL | $163,566 | $104,400 | 9 mo | -$59,166 |
| `006Wj00000MDihy` | Dropbox Fabiane 2025 extension | $170,997 | $180,960 | 12 mo | +$9,963 |

---

## Validation Checklist

Before import:
- [ ] Export backup of all opportunities to be modified
- [ ] Document current Active Revenue total
- [ ] Verify account-level totals match JH

After import:
- [ ] Confirm individual opportunity amounts match this document
- [ ] Verify account-level totals still align with JH
- [ ] Confirm December expiring total is now lower (properly reflects actual contracts)
- [ ] Run rate should NOT significantly change (bundled amounts already counted elsewhere)

---

## Key Message for Team

> "We discovered that during the JH data migration, some December-expiring opportunities had bundled ACV from multiple contracts. This made the December rolloff appear larger than it should be. The corrections align individual opportunities with JH source data while preserving account-level totals, since the bundled amounts were already captured in other historical opportunities."

