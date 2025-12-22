# Johnson Hana to EUDIA Migration - Data Alignment Review

**Generated:** December 21, 2025 at 02:01 PM  
**Prepared by:** Salesforce Admin (EUDIA)  
**Purpose:** Review December expiring deals and align JH data to Finance actuals

---

## Context: The Migration Challenge

As the EUDIA Salesforce admin managing the JH data migration, we faced a key challenge:

1. **Finance Run Rate** tells us the recognized annual revenue per account
2. **JH Salesforce** has historical closed-won data (contract values)
3. **EUDIA Salesforce** needs to reflect accurate revenue that aligns with Finance

The approach was to set EUDIA values to match Finance actuals, which sometimes required bundling multiple JH contracts into single opportunities.

---

## Three-Layer Comparison

| Account | Finance RR (Target) | JH Salesforce Total | EUDIA December | Alignment Status |
|---------|---------------------|---------------------|----------------|------------------|
| Irish Water | $440,882 | $2,969,789 (38 opps) | $434,886 | Aligned |
| Etsy | $304,330 | $940,773 (8 opps) | $259,370 | Gap - Review |
| TikTok | $208,160 | $3,360,843 (31 opps) | $198,880 | Aligned |
| Indeed | $417,846 | $2,311,976 (22 opps) | $163,566 | Gap - Review |
| Dropbox | $222,037 | $319,696 (5 opps) | $222,037 | Aligned |

---

## Detailed Account Analysis

### Irish Water

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | $440,882.33 | Annual recognized revenue target |
| JH Salesforce Total | $2,969,789.13 | 38 closed-won opportunities |
| JH December Expiring | $186,098.80 | Contracts ending Dec 2025 |
| EUDIA December | $434,886.02 | 3 opportunities |

**Gap Analysis:**
- EUDIA vs Finance: $-5,996.31
- EUDIA vs JH December: $+248,787.22

**December Opportunities (JH Validated):**

| Opportunity | JH Contract Value |
|-------------|-------------------|
| Jamie O'Gorman extension Aug-Dec | $78,601.60 |
| Luke Sexton extension Aug-Dec | $68,776.40 |
| Amal Elbay extension Aug-Dec | $38,720.80 |

**Interpretation:** The EUDIA December value ($434,886) is higher than JH contract values ($186,099) by $248,787. This was intentional bundling to align with Finance Run Rate.

---

### Etsy

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | $304,329.54 | Annual recognized revenue target |
| JH Salesforce Total | $940,773.38 | 8 closed-won opportunities |
| JH December Expiring | $69,600.00 | Contracts ending Dec 2025 |
| EUDIA December | $259,369.68 | 1 opportunities |

**Gap Analysis:**
- EUDIA vs Finance: $-44,959.86
- EUDIA vs JH December: $+189,769.68

**December Opportunities (JH Validated):**

| Opportunity | JH Contract Value |
|-------------|-------------------|
| Eleanor Power Extension | $69,600.00 |

**Interpretation:** The EUDIA December value ($259,370) is higher than JH contract values ($69,600) by $189,770. This was intentional bundling to align with Finance Run Rate.

---

### TikTok

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | $208,159.74 | Annual recognized revenue target |
| JH Salesforce Total | $3,360,843.18 | 31 closed-won opportunities |
| JH December Expiring | $98,601.16 | Contracts ending Dec 2025 |
| EUDIA December | $198,879.74 | 1 opportunities |

**Gap Analysis:**
- EUDIA vs Finance: $-9,280.00
- EUDIA vs JH December: $+100,278.58

**December Opportunities (JH Validated):**

| Opportunity | JH Contract Value |
|-------------|-------------------|
| DSAR Support ODL Extension 1 Tara Bannon | $98,601.16 |

**Interpretation:** The EUDIA December value ($198,880) is higher than JH contract values ($98,601) by $100,279. This was intentional bundling to align with Finance Run Rate.

---

### Indeed

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | $417,845.98 | Annual recognized revenue target |
| JH Salesforce Total | $2,311,976.22 | 22 closed-won opportunities |
| JH December Expiring | $104,400.00 | Contracts ending Dec 2025 |
| EUDIA December | $163,565.98 | 1 opportunities |

**Gap Analysis:**
- EUDIA vs Finance: $-254,280.00
- EUDIA vs JH December: $+59,165.98

**December Opportunities (JH Validated):**

| Opportunity | JH Contract Value |
|-------------|-------------------|
| DPO ODL | $104,400.00 |

**Interpretation:** The EUDIA December value ($163,566) is higher than JH contract values ($104,400) by $59,166. This was intentional bundling to align with Finance Run Rate.

---

### Dropbox

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | $222,037.06 | Annual recognized revenue target |
| JH Salesforce Total | $319,696.00 | 5 closed-won opportunities |
| JH December Expiring | $232,000.00 | Contracts ending Dec 2025 |
| EUDIA December | $222,037.06 | 2 opportunities |

**Gap Analysis:**
- EUDIA vs Finance: $+0.00
- EUDIA vs JH December: $-9,962.94

**December Opportunities (JH Validated):**

| Opportunity | JH Contract Value |
|-------------|-------------------|
| Fabiane 2025 extension | $180,960.00 |
| Fabiane Expansion Hours | $51,040.00 |

**Interpretation:** The EUDIA December value is lower than JH. The Dropbox extension in JH is $232,000, EUDIA shows $222,037. Minor adjustment may be needed.

---

## What We Need from the Team

### For Each Account, Please Confirm:

1. **Is the Finance Run Rate accurate?** 
   - This is our target - EUDIA should reflect this

2. **Are the JH contract values the source of truth for individual deals?**
   - If yes, we need to understand how they map to the run rate

3. **For December expiring deals specifically:**
   - Should we keep the current EUDIA values (aligned to Finance)?
   - Or update to match JH contract values (would change totals)?

---

## Specific Opportunities Requiring Review

### High-Variance December Opportunities

These opportunities have the largest gap between EUDIA and JH:

| Account | Opportunity | EUDIA Value | JH Value | Variance | Action? |
|---------|-------------|-------------|----------|----------|---------|
| Irish Water | Jamie O'Gorman Aug-Dec | $327,389 | $78,602 | +$248,787 | Review - bundled? |
| Etsy | Eleanor Power Extension | $259,370 | $69,600 | +$189,770 | Review - bundled? |
| TikTok | DSAR Support ODL Ext 1 | $198,880 | $98,601 | +$100,279 | Review - bundled? |
| Indeed | DPO ODL | $163,566 | $104,400 | +$59,166 | Review - bundled? |
| Dropbox | Fabiane 2025 extension | $170,997 | $180,960 | -$9,963 | Minor - increase? |

---

## Recommended Next Steps

1. **Validate Finance RR** - Confirm these are the correct targets
2. **Review JH History** - Understand what makes up the JH totals
3. **Decide on Approach:**
   - **Option A:** Keep EUDIA as-is (aligned to Finance)
   - **Option B:** Update individual opps to JH values (may misalign with Finance)
   - **Option C:** Store JH values in separate field for reference

4. **If Option B or C:** Use Data Loader to update opportunities

---

## Appendix: Full JH Salesforce Data

The JH Salesforce contains the following for each account (all tagged opps):

### Irish Water - JH Salesforce (38 opportunities)

| Opportunity | Revenue | Type |
|-------------|---------|------|
| Uisce Eireann Luke Sexton CDS extension June  | $11,368.00 | Project |
| Uisce Eireann ODL CDS Jamie O'Gorman June 25 | $12,992.00 | Project |
| Uisce Eireann ODL CDS Jamie O'Gorman April 25 | $32,480.00 | Project |
| Uisce Eireann - ODL CDS Luke Sexton April 25 | $29,000.00 | Project |
| Uisce Eireann Amal CDS extension | $17,864.00 | Project |
| Uisce Eireann - CPO - Extension | $127,600.00 | Project |
| Uisce Eirean DPO ODL | $25,520.00 | Project |
| Uisce Eireann ODL, dispute resolution expansi | $46,400.00 | Project |
| CDS Amal | $14,616.00 | Project |
| Uisce Eireann - CDS team extension - 3 months | $81,201.16 | Project |
| ... and 28 more | | |

### Etsy - JH Salesforce (8 opportunities)

| Opportunity | Revenue | Type |
|-------------|---------|------|
| Etsy Privacy Support Ethan Lee extension June | $29,000.00 | Project |
| Etsy Privacy Support ( TV Backfill, Jan - Jun | $84,680.00 | Project |
| Etsy - Privacy Support H2 2024 Ext | $243,460.80 | Recurring |
| Etsy Privacy Support H2 2024 Support (AT) | $121,730.40 | Recurring |
| ETSY Data Protection Support | $0.00 | Project |
| Etsy Privacy Support (RFP) | $327,398.40 | Recurring |
| Etsy Data Protection Support (Extension) | $56,354.58 | Recurring |
| Etsy Data Protection Support | $78,149.20 | Project |

### TikTok - JH Salesforce (31 opportunities)

| Opportunity | Revenue | Type |
|-------------|---------|------|
| TikTok DSAR 38, 39, 40 | $23,200.00 | Project |
| TikTok DSAR 34, 35, 36, 37 | $35,316.90 | Project |
| TikTok DSAR 31 32 33 | $29,000.00 | Project |
| TikTok TDR Project Q3 2025 | $295,800.00 | Project |
| TikTok 30 | $11,600.00 | Project |
| TikTok DSAR 28 and 29 | $23,200.00 | Project |
| TikTok DSAR 27 | $20,300.00 | Project |
| TikTok DSAR 26 | $6,960.00 | Project |
| TikTok DSAR 25 | $34,801.16 | Project |
| TikTok DSAR 24 | $11,601.16 | Project |
| ... and 21 more | | |

### Indeed - JH Salesforce (22 opportunities)

| Opportunity | Revenue | Type |
|-------------|---------|------|
| Indeed DSAR 2 | $4,640.00 | Project |
| Indeed DSAR 1 | $3,804.80 | Project |
| Indeed ODL Corp Gov Sarabeth Hartle | $111,360.00 | Project |
| Indeed - Julie Harrington - Extension - 12 mo | $174,000.00 | Project |
| Indeed - CC expansion | $17,864.00 | Project |
| Indeed Revenue Contracts Lawyer | $175,218.00 | Recurring |
| Indeed DSAR Support 2024 | $184,440.00 | Recurring |
| Corporate Paralegal support x2 | $358,440.00 | Project |
| Mini Project Naomi | $23,664.00 | Project |
| Indeed_DSAR_0008 | $29,650.34 | Project |
| ... and 12 more | | |

### Dropbox - JH Salesforce (5 opportunities)

| Opportunity | Revenue | Type |
|-------------|---------|------|
| Dropbox 2nd consultant | $75,400.00 | Project |
| CC additional hours | $12,528.00 | Project |
| Extension Fabiane Arguello 2024 | $76,560.00 | Project |
| Dropbox Commercial Contracts ODL Extension/Ma | $116,232.00 | Project |
| Dropbox Commercial Contracts ODL | $38,976.00 | Project |

