# Deep Analysis: EUDIA vs Johnson Hana CRM Reconciliation

## Executive Summary

**Goal**: Align EUDIA Salesforce opportunity data with Johnson Hana CRM while **maintaining the current Active Revenue total of $19,741,428.70**.

**Key Constraint**: The net change to Active Revenue must be **zero**. Any new opportunities created must offset reductions elsewhere (breakouts, not additions).

---

## Section 1: Baseline Totals (Source of Truth)

| Metric | Value | Notes |
|--------|-------|-------|
| Active Rev + Projects | **$19,741,428.70** | MUST NOT CHANGE |
| QTD Closed Won (EUDIA) | $1,422,877.96 | 20 deals |
| JH Q4 Closed Won | $1,513,218.84 | 25 deals |
| JH YTD Total | $10,328,539.98 | 137 deals |

---

## Section 2: QTD Closed Won Breakdown

### The $1.42M QTD is composed of TWO types of deals:

| Category | Amount | Deals | Description |
|----------|--------|-------|-------------|
| **"November RR Revenue"** | $259,137.92 | 4 | Run rate captures for existing accounts |
| **Actual Q4 Closed Deals** | $1,163,740.04 | 16 | New deals closed in Q4 |

### "November RR Revenue" Deals (NOT new Q4 bookings):

| Account | Revenue | Explanation |
|---------|---------|-------------|
| Airship Group Inc | $166,527.79 | Existing recurring - no JH Q4 deal |
| Creed McStay | $38,804.44 | Existing recurring - no JH Q4 deal |
| DCEDIY | $37,152.91 | Run rate from historical $1.18M deal |
| Coleman Legal | $16,652.78 | Existing recurring - no JH Q4 deal |

**Implication**: These deals inflate QTD closed-won metrics but correctly represent Active Revenue run rate. They are NOT new bookings.

---

## Section 3: Key Discrepancies Identified

### A. Term Mismatches (5 deals)

| Account | EUDIA Term | JH Term | EUDIA Rev | JH ACV |
|---------|-----------|---------|-----------|--------|
| Kingspan | 12 mo | 0 mo | $97,086 | $8,120 |
| TikTok DSAR 2026 | 12 mo | 6 mo | $88,116 | $87,000 |
| OpenAI (additional consultant) | 3 mo | 4 mo | $52,200 | $69,600 |
| OpenAI (Elizabeth Agbaje) | 3 mo | 4 mo | $41,412 | $69,600 |
| OpenAI (Nerea Perez) | 3 mo | 4 mo | $41,412 | $69,600 |

### B. Revenue Variances (Why EUDIA ≠ JH)

| Account | EUDIA Rev | JH ACV | Variance | Reason |
|---------|-----------|--------|----------|--------|
| **Kingspan** | $97,086 | $8,120 | +$88,966 | **Bundle Allocation** - EUDIA shows allocated run rate, JH shows actual deal |
| **Aryza** | $104,080 | $226,200 | -$122,120 | **Multi-Year Annualization** - JH shows full 2-year value, EUDIA shows annual |
| OpenAI deals | Various | $69,600 | Various | **Multiple consultants** - JH may bundle differently |
| Glanbia | $90,341 | $88,044 | +$2,297 | Minor rate variance |
| TikTok | $88,116 | $87,000 | +$1,116 | Minor variance + term difference |

**Net Variance**: -$103,517.48 (JH shows more than EUDIA for matched deals)

---

## Section 4: Understanding the Discrepancy Patterns

### Pattern 1: Bundle Allocation (Kingspan Example)

**EUDIA**: $97,086 (represents allocated run rate from larger contract bundle)
**JH**: $8,120 (represents specific closed-won deal for this service)

**Explanation**: The $97,086 in EUDIA is the **run rate allocation** for this account, not the specific deal value. The JH deal of $8,120 is an incremental contract that's part of the larger relationship.

**Action**: Keep EUDIA revenue as-is (it's correct for Active Rev), but document JH Original ACV = $8,120 with reason "Bundle Allocation"

### Pattern 2: Multi-Year Annualization (Aryza Example)

**EUDIA**: $104,080 (annual revenue recognition)
**JH**: $226,200 (2-year total contract value)

**Explanation**: Both are correct - EUDIA shows annual run rate, JH shows full contract value.

**Action**: Keep EUDIA revenue as-is, document JH Original ACV = $226,200 with reason "Multi-Year Annualization"

### Pattern 3: Term Differences (TikTok Example)

**EUDIA**: $88,116 for 12 months
**JH**: $87,000 for 6 months

**Explanation**: Term is incorrectly stated in EUDIA. Revenue may be correct (annualized rate) but term should match JH.

**Action**: Update Term to 6 months to align with JH contract

---

## Section 5: Ramifications Analysis

### If We Update Terms:
- **Impact**: None to Active Revenue
- **Risk**: Low - term changes don't affect revenue rollups
- **Benefit**: Aligns contract data with JH source

### If We Update Revenue to Match JH:
- **Impact**: **BREAKS Active Revenue totals**
- **Risk**: HIGH - would require offsetting changes
- **Recommendation**: DO NOT change Revenue values

### If We Create Missing JH Q4 Deals:
- **Impact**: +$425,603 to Active Revenue (WRONG)
- **Risk**: HIGH - inflates revenue
- **Recommendation**: Only create if breaking out from existing opps (net zero)

### If We Keep November RR Revenue Deals:
- **Impact**: QTD inflated by $259,138
- **Risk**: Misleading QTD bookings metrics
- **Recommendation**: Document as "Run Rate Capture" type, consider separate reporting

---

## Section 6: Recommended Actions (Revenue-Neutral)

### SAFE: Term Corrections Only

Update these opportunities with correct terms:

| Opportunity ID | Current Term | New Term |
|----------------|-------------|----------|
| 006Wj00000MDikU | 12 | 0 (Kingspan) |
| 006Wj00000LbDRl | 12 | 6 (TikTok) |

### SAFE: Documentation Fields

Populate new fields for audit trail:
- `JH_Original_ACV__c` = JH deal value
- `ACV_Variance_Reason__c` = Reason for difference

### REQUIRES DECISION: Opportunity Breakouts

If you want to align opportunity count with JH, you would need to:
1. **Reduce** revenue on existing bundled opps
2. **Create** new opps for the specific JH deals
3. **Net result**: Zero change to Active Revenue

Example for Kingspan:
- Current: 1 opp at $97,086
- After breakout: Original opp reduced to $88,966 + New opp at $8,120
- Total unchanged: $97,086

---

## Section 7: Final Data Loader File

The file `final-dataloader-updates.csv` contains:
1. Term corrections (safe, no revenue impact)
2. JH_Original_ACV__c values (documentation only)
3. ACV_Variance_Reason__c values (documentation only)

**This file does NOT change any Revenue/Amount values.**

---

## Validation Checklist

Before applying updates:
- [ ] Confirm Active Rev Total = $19,741,428.70

After applying updates:
- [ ] Confirm Active Rev Total = $19,741,428.70 (unchanged)
- [ ] Confirm Term fields updated correctly
- [ ] Confirm JH_Original_ACV__c populated
- [ ] Confirm ACV_Variance_Reason__c set

---

## Appendix: Why The Totals Don't Match

| Source | Total | Notes |
|--------|-------|-------|
| EUDIA Active Rev | $19,741,429 | Includes US + EU, all active contracts |
| JH YTD Closed Won | $10,328,540 | EU only, YTD new bookings |
| Gap | $9,412,889 | US deals, historical deals, run rate captures |

The gap is expected because:
1. EUDIA includes **US deals** not in JH
2. EUDIA includes **historical deals** from before YTD
3. EUDIA includes **run rate captures** (synthetic opps for existing revenue)
4. JH only tracks **new bookings**, not total active revenue



