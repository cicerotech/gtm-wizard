# BL Forecasting Architecture

## Overview

Two parallel forecasting views that combine to create a **Blended Forecast**:

| View | Purpose | Basis | Updates |
|------|---------|-------|---------|
| **BL Forecast** | Subjective BL input | Commit/Gut/Pipeline categories | Weekly by BLs |
| **Weighted ACV** | Conservative stage-based | Stage probabilities | Auto-calculated |
| **Blended Forecast** | Midpoint for planning | Average of both | Real-time |

---

## Field Architecture

### Existing Fields (Verified)

| Field | API Name | Formula | Purpose |
|-------|----------|---------|---------|
| **ACV** | `ACV__c` | Manual input | Full annual contract value |
| **Prior Opp ACV** | `Prior_Opp_ACV__c` | Manual input | Renewal base (prior contract) |
| **Renewal Net Change** | `Renewal_Net_Change__c` | `ACV__c - Prior_Opp_ACV__c` | Net new on renewals |
| **Weighted ACV** | `Weighted_ACV__c` | `BLANKVALUE(Renewal_Net_Change__c, ACV__c) * Probability` | Stage-weighted net new |
| **BL Forecast Category** | `BL_Forecast_Category__c` | Picklist | Pipeline/Gut/Commit/Closed |
| **BL Quarterly Forecast** | `BL_Quarterly_Forecast__c` | `ACV * CASE(Category...)` | BL forecast (full ACV) |
| **BL Quarterly Forecast NN** | `BL_Quarterly_Forecast_NN__c` | `BLANKVALUE(Renewal_Net_Change, ACV) * CASE(...)` | BL forecast (net new) |

### New Fields Required

| Field | API Name | Type | Formula/Purpose |
|-------|----------|------|-----------------|
| **Blended Forecast** | `Blended_Forecast__c` | Currency (Formula) | `(Weighted_ACV__c + BL_Quarterly_Forecast_NN__c) / 2` |
| **Quarterly Commit Amount** | `Quarterly_Commit_Amount__c` | Currency | Snapshot of ACV at commit time |
| **Quarterly Commit NN** | `Quarterly_Commit_NN__c` | Currency | Snapshot of net new at commit time |
| **Commit Quarter** | `Commit_Quarter__c` | Text | e.g., "Q1 FY26" |
| **Commit Date** | `Commit_Date__c` | Date | When BL committed |

---

## Formula Definitions

### Blended Forecast (NEW)
```
(Weighted_ACV__c + BL_Quarterly_Forecast_NN__c) / 2
```
- Averages the conservative (Weighted) and subjective (BL) views
- Both use net new amounts
- Provides realistic midpoint for planning

### Weighted ACV (EXISTING - Verified Correct)
```
BLANKVALUE(Renewal_Net_Change__c, ACV__c) * 
IF(Probability_Override__c = TRUE, 
   Custom_Probability_Value__c, 
   Calculated_Probability__c)
```
- Uses `Renewal_Net_Change__c` for renewals/expansions (net new only)
- Falls back to `ACV__c` for new business
- Multiplied by stage probability

### BL Quarterly Forecast NN (EXISTING - Verified Correct)
```
BLANKVALUE(Renewal_Net_Change__c, ACV__c) * 
CASE(BL_Forecast_Category__c,
  "Commit", 1.00,
  "Closed", 1.00,
  "Gut", 0.60,
  "Pipeline", 0.20,
  0
)
```

### BL Quarterly Forecast (EXISTING - Full ACV for Attainment)
```
CASE(BL_Forecast_Category__c,
  "Commit", ACV__c * 1.00,
  "Closed", ACV__c * 1.00,
  "Gut", ACV__c * 0.60,
  "Pipeline", ACV__c * 0.20,
  0
)
```

---

## Report Structure

### Report 1: BL Pipeline & Attainment (Weekly Review)

**Purpose:** Active view for weekly BL pipeline calls
**Excludes:** Closed Lost opportunities

| Column | Source | Description |
|--------|--------|-------------|
| **Q1 Commit (Locked)** | `Quarterly_Commit_Amount__c` | Original commitment at quarter start |
| **Closed Won QTD** | SUM where `IsWon = TRUE` AND `CloseDate = THIS_FQ` | Actual wins |
| **Open Pipeline** | SUM of `ACV__c` where `IsClosed = FALSE` | Active deals |
| **Current Forecast** | SUM of `BL_Quarterly_Forecast__c` | Expected based on categories |
| **Gap to Commit** | Commit - (Won + Forecast) | Remaining to hit goal |
| **Attainment %** | Closed Won / Commit | Progress toward goal |

**Filters:**
- `CloseDate = THIS_FISCAL_QUARTER`
- `IsClosed = FALSE` OR `IsWon = TRUE` (excludes Lost)
- `BL_Forecast_Category__c != NULL`

### Report 2: Finance Blended Forecast (Background)

**Purpose:** Conservative forecast for financial planning
**Includes:** All active opportunities

| Column | Source | Description |
|--------|--------|-------------|
| **BL Forecast NN** | `BL_Quarterly_Forecast_NN__c` | BL subjective (net new) |
| **Weighted ACV** | `Weighted_ACV__c` | Stage-based (net new) |
| **Blended Forecast** | `Blended_Forecast__c` | Midpoint of both |
| **Full ACV** | `ACV__c` | Total deal value |
| **Net New** | `BLANKVALUE(Renewal_Net_Change__c, ACV__c)` | Net new portion |

**Filters:**
- `CloseDate = THIS_FISCAL_QUARTER`
- `IsClosed = FALSE`

---

## Quarterly Commit Flow

### Trigger
When `BL_Forecast_Category__c` is changed to "Commit"

### Conditions
- `Quarterly_Commit_Amount__c` IS BLANK
- OR `Commit_Quarter__c` != Current Fiscal Quarter

### Actions
1. Set `Quarterly_Commit_Amount__c` = `ACV__c`
2. Set `Quarterly_Commit_NN__c` = `BLANKVALUE(Renewal_Net_Change__c, ACV__c)`
3. Set `Commit_Quarter__c` = Current Quarter (e.g., "Q1 FY26")
4. Set `Commit_Date__c` = TODAY()

### Result
Commit amounts are **locked** for the quarter. Even if deal moves to Lost, original commitment is preserved for attainment tracking.

---

## Weekly BL Process

### Start of Quarter (Feb 1 for Q1)
1. BL reviews all opps with close date in current quarter
2. Marks `BL_Forecast_Category__c` = "Commit" on deals they're focused on
3. Flow snapshots the commitment amounts
4. **Quarterly Commit ($)** is now locked

### Each Week
1. BL updates `BL_Forecast_Category__c` as deals progress:
   - **Commit** (100%) = High confidence, focused
   - **Gut** (60%) = Medium confidence, possible
   - **Pipeline** (20%) = Low confidence, early stage
   - **Closed** (100%) = Deal is won
2. **BL Quarterly Forecast** auto-recalculates
3. Leadership reviews progress vs original commit

### Quarter End
- Compare **Closed Won** vs **Original Commit**
- Calculate **Attainment %**
- Analyze forecast accuracy

---

## Key Metrics

### For BLs (Full ACV View)
| Metric | Formula |
|--------|---------|
| **Commit Coverage** | Open Commit / Quota |
| **Forecast Coverage** | BL Quarterly Forecast / Quota |
| **Win Rate** | Won / (Won + Lost) |
| **Attainment** | Closed Won / Quarterly Commit |

### For Finance (Net New View)
| Metric | Formula |
|--------|---------|
| **Blended Forecast** | (Weighted + BL Forecast NN) / 2 |
| **Conservative Floor** | Weighted ACV only |
| **Optimistic Ceiling** | BL Forecast NN |
| **Net New Revenue** | Sum of Blended Forecast |

---

## Implementation Checklist

- [ ] Create `Blended_Forecast__c` formula field
- [ ] Create `Quarterly_Commit_Amount__c` currency field
- [ ] Create `Quarterly_Commit_NN__c` currency field
- [ ] Create `Commit_Quarter__c` text field
- [ ] Create `Commit_Date__c` date field
- [ ] Build Flow for commit snapshot
- [ ] Update `BL_Quarterly_Forecast__c` to include "Closed" at 100%
- [ ] Build Report 1: BL Pipeline & Attainment
- [ ] Build Report 2: Finance Blended Forecast
- [ ] Test with sample data

