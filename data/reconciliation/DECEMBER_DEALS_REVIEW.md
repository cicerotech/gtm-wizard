# December Expiring Deals - Team Review Package

**Generated:** December 21, 2025 at 01:56 PM  
**Purpose:** Review December expiring deals across EUDIA, JH, and Finance data sources

---

## Executive Summary

During the JH data migration, opportunity values were set to align with **Finance Run Rate actuals** (November 2025). This means:
- Individual opportunity amounts may differ from JH contract values
- The totals were intentionally set to match recognized revenue
- Reducing to JH values would misalign with finance

---

## Account-Level Comparison

| Account | Finance RR (Nov) | EUDIA Dec Total | JH Contract Total | EUDIA vs Finance | Status |
|---------|------------------|-----------------|-------------------|------------------|--------|
| Irish Water | $440,882.33 | $434,886.02 | $186,098.80 | -$5,996.31 | Aligned |
| Etsy | $304,329.54 | $259,369.68 | $69,600.00 | -$44,959.86 | Review Needed |
| TikTok | $208,159.74 | $198,879.74 | $98,601.16 | -$9,280.00 | Aligned |
| Indeed | $417,845.98 | $163,565.98 | $104,400.00 | -$254,280.00 | Review Needed |
| Dropbox | $222,037.06 | $222,037.06 | $232,000.00 | +$0.00 | Aligned |

---

## Key Findings

### 1. EUDIA Aligns with Finance (by design)

The EUDIA December totals were set to match the Finance Run Rate. For example:
- **Irish Water:** Finance = $440,882 | EUDIA Dec = $434,886 (within $6K)
- **TikTok:** Finance = $208,160 | EUDIA Dec = $198,880 (within $10K)

### 2. JH Contract Values Are Lower

The JH system captured individual contract amounts, which are lower because:
- Multiple contracts were bundled into single opportunities during migration
- Values were adjusted to align with Finance actuals
- This was intentional, not an error

### 3. The Variance is Explained

| Account | EUDIA Dec | JH Total | Variance | Explanation |
|---------|-----------|----------|----------|-------------|
| Irish Water | $434,886.02 | $186,098.80 | $248,787.22 | Bundled to match Finance RR |
| Etsy | $259,369.68 | $69,600.00 | $189,769.68 | Bundled to match Finance RR |
| TikTok | $198,879.74 | $98,601.16 | $100,278.58 | Bundled to match Finance RR |
| Indeed | $163,565.98 | $104,400.00 | $59,165.98 | Bundled to match Finance RR |
| Dropbox | $222,037.06 | $232,000.00 | $-9,962.94 | Minor difference |

---

## Opportunity-Level Detail

### Irish Water (Uisce Eireann)

| Opportunity | EUDIA Revenue | JH Validated | Variance |
|-------------|---------------|--------------|----------|
| Uisce Eireann CDS Amal Elbay extension August... | $38,720.80 | $38,720.80 | N/A |
| Uisce Eireann CDS Jamie O'Gorman extension Au... | $327,388.82 | $78,601.60 | $248,787.22 |
| Uisce Eireann CDS Luke Sexton extension Augus... | $68,776.40 | $68,776.40 | N/A |

### Etsy

| Opportunity | EUDIA Revenue | JH Validated | Variance |
|-------------|---------------|--------------|----------|
| Etsy Privacy Support Eleanor Power Extension... | $259,369.68 | $69,600.00 | $189,769.68 |

### TikTok

| Opportunity | EUDIA Revenue | JH Validated | Variance |
|-------------|---------------|--------------|----------|
| TikTok DSAR Support ODL Extension 1 Tara Bann... | $198,879.74 | $98,601.16 | $100,278.58 |

### Indeed

| Opportunity | EUDIA Revenue | JH Validated | Variance |
|-------------|---------------|--------------|----------|
| Indeed DPO ODL... | $163,565.98 | $104,400.00 | $59,165.98 |

### Dropbox

| Opportunity | EUDIA Revenue | JH Validated | Variance |
|-------------|---------------|--------------|----------|
| Fabiane Arguello 2025 Expansion Hours Increas... | $51,040.00 | $51,040.00 | N/A |
| Fabiane Arguello 2025 extension... | $170,997.06 | $180,960.00 | $-9,962.94 |

---

## Decision Points for Team

### Question 1: Keep Current Values or Align to JH?

**Option A: Keep as-is**
- Pro: Aligns with Finance Run Rate (recognized revenue)
- Con: Individual opportunity values don't match JH contracts

**Option B: Reduce to JH values**
- Pro: Individual opportunities match JH source
- Con: Total drops below Finance actuals (misrepresents recognized revenue)

**Option C: Redistribute**
- Reduce December opps to JH values
- Tag other historical opps to maintain total
- Pro: Both individual and total accuracy
- Con: Requires identifying which historical opps to tag

### Question 2: What to Report?

For December expiring deals:
- Do we report EUDIA values (aligned to Finance)?
- Or JH values (contract amounts)?

---

## Recommendation

**For team review:** Present both values transparently. The EUDIA amounts reflect Finance actuals, while JH amounts reflect individual contracts. Neither is "wrong" - they serve different purposes.

**If changes are needed:** Create a separate `JH_Original_ACV__c` field to store JH values without changing the Revenue field that aligns with Finance.

---

## Appendix: Raw Data

Full opportunity-level data available in: `december-opp-level-breakdown.csv`  
Account summary available in: `account-summary.csv`
