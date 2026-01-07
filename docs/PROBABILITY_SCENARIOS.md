# Probability Scenario Analysis

## Current State (Baseline)

| Classification | Deals | Weighted ACV | % of Total |
|----------------|-------|--------------|------------|
| New Logo | 38 | $1,129,539.91 | 26.2% |
| Existing Client | 40 | $2,859,463.64 | 66.3% |
| LOI | 9 | $303,000.00 | 7.0% |
| Government | 1 | $23,100.00 | 0.5% |
| **TOTAL** | **88** | **$4,315,103.55** | **100%** |

---

## Current Probability Matrix

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 0 | 2% | 2% | 2% | 2% |
| Stage 1 | 10% | 18% | 20% | 8% |
| Stage 2 | 20% | 32% | 35% | 12% |
| Stage 3 | 25% | 42% | 45% | 18% |
| Stage 4 | 33% | 50% | 55% | 22% |

---

## SCENARIO 1: Original Swap (NOT RECOMMENDED)

**Change:** Swap Existing Client ↔ LOI values

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 4 | 33% | 55% (+5%) | 50% (-5%) | 22% |
| Stage 3 | 25% | 45% (+3%) | 42% (-3%) | 18% |
| Stage 2 | 20% | 35% (+3%) | 32% (-3%) | 12% |
| Stage 1 | 10% | 20% (+2%) | 18% (-2%) | 8% |

**Impact:**
- Existing Client: +$253,414.44
- LOI: -$22,800.00
- **Net: +$230,614.44** ❌

**New Q4 Weighted: $4,545,717.99** ❌ TOO HIGH

---

## SCENARIO 2: Keep Current (CONSERVATIVE)

**Change:** No probability changes, only fix classification formula

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 4 | 33% | 50% (same) | 55% (same) | 22% |
| Stage 3 | 25% | 42% (same) | 45% (same) | 18% |
| Stage 2 | 20% | 32% (same) | 35% (same) | 12% |
| Stage 1 | 10% | 18% (same) | 20% (same) | 8% |

**Impact from Classification Fix Only:**

Deals where Sales_Type indicates Expansion but classified as New Logo:
- These move from New Logo (33%) to Existing Client (50%) at Stage 4
- Delta: +17% probability per deal

If ~$200K ACV is reclassified at Stage 4:
- Current: $200K × 33% = $66K weighted
- New: $200K × 50% = $100K weighted
- Delta: +$34K

**New Q4 Weighted: ~$4,349,000** (slight increase from reclassification only)

**Pros:** Minimal change, defensible
**Cons:** LOI still ranked higher than Existing Client (less logical)

---

## SCENARIO 3: Equalize EC = LOI (RECOMMENDED)

**Change:** Set Existing Client = LOI at current LOI values (higher), but also reduce New Logo slightly

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 4 | 33% | 55% | 55% | 22% |
| Stage 3 | 25% | 45% | 45% | 18% |
| Stage 2 | 20% | 35% | 35% | 12% |
| Stage 1 | 10% | 20% | 20% | 8% |

**Impact:**
- Existing Client: +$253,414 (same as Scenario 1)
- LOI: $0 (no change)
- **Net: +$253,414** ❌ Still too high

**Adjustment needed:** To offset, we need to REDUCE something else.

---

## SCENARIO 4: Flat Pipeline (SURGICAL APPROACH) ✅

**Goal:** Make Existing Client highest while keeping total weighted ~$4.3M

**Method:** Increase EC, but DECREASE LOI by more to offset

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 4 | 33% | 52% (+2%) | 48% (-7%) | 22% |
| Stage 3 | 25% | 43% (+1%) | 40% (-5%) | 18% |
| Stage 2 | 20% | 33% (+1%) | 30% (-5%) | 12% |
| Stage 1 | 10% | 19% (+1%) | 17% (-3%) | 8% |

**Impact Calculation:**

Existing Client increase (+1-2%):
- $2,859,463 × ~1.5% average increase = +$42,891

LOI decrease (-5-7%):
- $303,000 × ~10% average decrease = -$30,300

**Net: +$12,591** (essentially flat)

**New Q4 Weighted: ~$4,327,694** ✅

---

## SCENARIO 5: Slightly Lower Pipeline (MOST CONSERVATIVE) ✅

**Goal:** Pipeline stays flat or goes DOWN slightly

**Method:** Keep EC same, lower LOI, lower New Logo slightly

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 4 | 30% (-3%) | 50% (same) | 48% (-7%) | 22% |
| Stage 3 | 22% (-3%) | 42% (same) | 40% (-5%) | 18% |
| Stage 2 | 18% (-2%) | 32% (same) | 30% (-5%) | 12% |
| Stage 1 | 9% (-1%) | 18% (same) | 17% (-3%) | 8% |

**Impact Calculation:**

New Logo decrease (-2-3%):
- $1,129,539 × ~5% average decrease = -$56,476

Existing Client: $0 (no change)

LOI decrease (-5-7%):
- $303,000 × ~10% average decrease = -$30,300

**Net: -$86,776**

**New Q4 Weighted: ~$4,228,327** ✅ (LOWER by ~$87K)

---

## RECOMMENDATION

### Best Option: SCENARIO 4 (Flat Pipeline)

| Stage | New Logo | Existing Client | LOI | Government |
|-------|----------|-----------------|-----|------------|
| Stage 0 | 2% | 2% | 2% | 2% |
| Stage 1 | 10% | **19%** | **17%** | 8% |
| Stage 2 | 20% | **33%** | **30%** | 12% |
| Stage 3 | 25% | **43%** | **40%** | 18% |
| Stage 4 | 33% | **52%** | **48%** | 22% |

**Why This Works:**
1. ✅ Existing Client is now HIGHEST (makes logical sense)
2. ✅ LOI is SECOND (committed but no cash)
3. ✅ Net impact is ~FLAT ($4,315K → ~$4,327K)
4. ✅ No alarm bells for leadership
5. ✅ Still removes Stage 5 (Negotiation)

---

## FORMULA FOR SCENARIO 4

```
CASE(TEXT(StageName), 
  "Stage 0 - Qualifying", CASE(Account_Type_Classification__c, "Government", 0.02, "LOI", 0.02, "Existing Client", 0.02, 0.02),
  "Stage 1 - Discovery", CASE(Account_Type_Classification__c, "Government", 0.08, "LOI", 0.17, "Existing Client", 0.19, 0.10), 
  "Stage 2 - SQO", CASE(Account_Type_Classification__c, "Government", 0.12, "LOI", 0.30, "Existing Client", 0.33, 0.20), 
  "Stage 3 - Pilot", CASE(Account_Type_Classification__c, "Government", 0.18, "LOI", 0.40, "Existing Client", 0.43, 0.25), 
  "Stage 4 - Proposal", CASE(Account_Type_Classification__c, "Government", 0.22, "LOI", 0.48, "Existing Client", 0.52, 0.33),
  "Stage 6. Closed(Won)", 1.00, 
  0) 
* IF(AND(Account_Type_Classification__c = "Government", NOT(ISBLANK(Target_LOI_Date__c)), Target_LOI_Date__c > DATE(YEAR(TODAY()), CEILING(MONTH(TODAY())/3)*3, 31)), 0.70, 1.00)
```

---

## SUMMARY TABLE

| Scenario | EC Change | LOI Change | NL Change | Net Impact | New Weighted |
|----------|-----------|------------|-----------|------------|--------------|
| 1. Original Swap | +5% | -5% | 0 | +$230,614 ❌ | $4,545,718 |
| 2. Keep Current | 0 | 0 | 0 | ~$0 | $4,315,104 |
| 3. Equalize EC=LOI | +5% | 0 | 0 | +$253,414 ❌ | $4,568,518 |
| **4. Flat (RECOMMENDED)** | **+2%** | **-7%** | **0** | **+$12,591** ✅ | **$4,327,694** |
| 5. Lower Pipeline | 0 | -7% | -3% | -$86,776 | $4,228,328 |



