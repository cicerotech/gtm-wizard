# Johnson Hana Revenue Alignment Audit Summary

**Generated:** December 21, 2025

---

## Executive Summary

| Metric | Value |
|--------|-------|
| EUDIA All-Time Won Revenue | $22,288,140.02 |
| JH 2024-2025 Total ACV | $21,127,737.89 |
| Net Variance | $1,160,402.13 |
| EUDIA December Expiring | $1,696,299.62 (17 opps) |

### Key Finding
The run rate drop from $20.4M to $19.8M (~$600K) appears to be primarily from **December-expiring opportunities** that are rolling off based on their end dates.

---

## What Was Completed

### Phase 1: Account-Level Reconciliation ✅
- Matched 37 accounts between EUDIA and JH
- Identified 25 EUDIA-only accounts (US pod deals, etc.)
- Identified 35 JH-only accounts (need investigation)

### Phase 2: Opportunity-Level Matching ✅
- 9 JH December/January expiring opportunities analyzed
- 8 matched to EUDIA, 1 missing (Airship $217K)

### Phase 3: December Variance Analysis ✅
- 17 EUDIA opportunities expiring in December
- 10 matched to JH, 5 not in JH, 2 US pod deals

### Phase 4: Full Term Audit ✅
- 263 JH opportunities audited
- 47 aligned, 38 term mismatches, 163 not in EUDIA

### Phase 5: Data Loader CSV Creation ✅
- 58 opportunities ready for safe JH ACV population
- 8 opportunities flagged for term corrections

### Phase 6: Impact Analysis ✅
- Revenue impact: **$0.00** (safe updates only)
- All changes are documentation, not revenue modification

---

## Data Loader Files Generated

| File | Purpose | Records | Safe to Import |
|------|---------|---------|----------------|
| `dataloader-safe-jh-acv.csv` | Populate JH_Original_ACV__c + Variance Reason | 58 | ✅ Yes |
| `dataloader-term-corrections.csv` | Term field corrections | 8 | ⚠️ Review First |
| `dataloader-final-consolidated.csv` | All updates combined | 58 | ✅ Yes |

---

## Variance Reason Distribution

| Reason | Count | JH ACV |
|--------|-------|--------|
| No Variance | 23 | $1,448,085 |
| Rate Adjustment | 16 | $1,911,553 |
| Bundle Allocation | 9 | $1,373,825 |
| Term Difference | 5 | $769,080 |
| Multi-Year Annualization | 3 | $453,444 |
| Run Rate Capture | 1 | $1,189,000 |

---

## December Expiring - Status Summary

| Status | Count | Revenue |
|--------|-------|---------|
| JH MATCHED | 10 | $986,062 |
| NOT IN JH | 5 | $518,238 |
| US POD (Not in JH) | 2 | $192,000 |
| **Total** | **17** | **$1,696,300** |

---

## Key Accounts Requiring Attention

### Uisce Eireann ($435K December)
- 3 opportunities expiring in December
- **NOT in JH data at all**
- Action: Verify if EUDIA-originated or should be in JH

### Etsy Ireland (Variance +$190K)
- EUDIA shows $259K vs JH $70K for Eleanor Power extension
- Current plan: Document variance, no revenue change

### Datalex (Understatement -$104K)
- EUDIA shows $2,369 vs JH $106,488
- Term correction: 12 mo → 6 mo
- Action: Investigate before revenue change

### TikTok ($199K December)
- Matched in JH but large variance
- EUDIA $199K vs JH $99K
- Current plan: Document variance

---

## Term Corrections (8 Total)

| Account | Current | Correct | Impact |
|---------|---------|---------|--------|
| Datalex | 12 mo | 6 mo | Earlier by 6 mo |
| DCEDIY | 12 mo | 2 mo | Earlier by 10 mo |
| Dropbox | 12 mo | 5 mo | Earlier by 7 mo |
| Hayes Solicitors | 12 mo | 2 mo | Earlier by 10 mo |
| Kingspan | 12 mo | 0 mo | Immediate |
| OpenAI (x2) | 20/15 mo | 3 mo | Earlier by 17/12 mo |
| Orsted | 12 mo | 6 mo | Earlier by 6 mo |

⚠️ **Warning:** Applying term corrections will cause end dates to move earlier, potentially accelerating revenue rolloff.

---

## Questions for Business Decision

1. **Uisce Eireann ($435K)**: Are these EUDIA-originated or should be in JH?

2. **Large Variances (Etsy/Dropbox/TikTok)**: Should EUDIA be reduced to match JH, or is the variance legitimate?

3. **Datalex ($2K vs $106K)**: Should EUDIA revenue be increased?

4. **Term Corrections**: Apply corrections knowing revenue may roll off earlier?

---

## Recommended Execution Order

1. **BACKUP** - Export all opportunities to be modified
2. **DOCUMENT** - Record current Active Revenue total: $19.8M
3. **SAFE UPDATE** - Import `dataloader-safe-jh-acv.csv`
4. **VERIFY** - Confirm Active Revenue unchanged
5. **REVIEW** - Examine term corrections with stakeholders
6. **DECISION** - Get business approval for term changes
7. **TERM UPDATE** - Import corrections if approved
8. **VALIDATE** - Run comparison reports
9. **MONITOR** - Track run rate for 30 days

---

## Files Location

All reconciliation files are located in:
```
/data/reconciliation/
```

| File | Description |
|------|-------------|
| `account-reconciliation.csv` | Account-level comparison |
| `opp-level-matching.csv` | Opportunity matching results |
| `full-term-audit.csv` | Complete term audit (263 rows) |
| `december-variance-detail.csv` | December expiring analysis |
| `december-action-items.csv` | December action items |
| `term-corrections-all.csv` | All term corrections (38 rows) |
| `dataloader-*.csv` | Data Loader ready files |

