# Johnson Hana Revenue Reconciliation - Project Handoff

**Date:** December 22, 2025  
**Project:** JH Contract-to-Salesforce Revenue Alignment  
**Status:** Phase 1 Complete - Manual Steps Required

---

## Executive Summary

This project reconciles Johnson Hana (JH) EU contracts against the November Run Rate (RR) benchmark to identify gaps, extract contract values, and prepare data for Salesforce upload.

### Key Metrics

| Metric | Value |
|--------|-------|
| **November RR Target** | $10,243,062 (annual USD) |
| **Contract Values Extracted** | $4,089,101 (40%) |
| **SF Proxy Values Added** | $1,230,594 (12%) |
| **Total Reconciled** | $5,319,695 (52%) |
| **Remaining Gap** | $4,923,367 (48%) |

---

## Files Created

### Output Files (Desktop)

| File | Description |
|------|-------------|
| `JH_FINAL_Reconciliation.xlsx` | Master reconciliation with all accounts, gaps, and actions |
| `JH_Deep_Mining_Results.xlsx` | Detailed contract extraction results |
| `JH_Contracts_DataLoader.xlsx` | Contracts formatted for SF DataLoader |
| `JH_Contracts_DataLoader.csv` | CSV version for DataLoader upload |
| `EU_Only_Closed_Won.xlsx` | Filtered EU opportunities (US excluded) |
| `EU_Opportunities_Summary.xlsx` | Summary by account |
| `Contract_Value_Summary.xlsx` | Extracted values by contract |
| `Contract_Client_Totals.xlsx` | Totals by client |

### Scripts Created

| Script | Purpose |
|--------|---------|
| `scripts/filter-eu-opportunities.py` | Filters US pod from opportunities |
| `scripts/deep-contract-mining.py` | Enhanced contract value extraction |
| `scripts/jh-audit-reconciliation.py` | Full audit with gap analysis |
| `scripts/final-jh-reconciliation.py` | Final summary and recommendations |
| `scripts/create-contracts-dataloader.py` | Creates SF Contract object records |
| `scripts/add-account-ids-to-contracts.js` | Adds SF Account IDs (needs SF auth) |

---

## Account Status Summary

### ✓ Aligned Accounts (11) - Ready for Upload
| Account | Target | Have | Coverage |
|---------|--------|------|----------|
| ESB | $473K | $473K | 100% |
| Irish Water | $441K | $449K | 102% |
| Indeed | $418K | $354K | 85% |
| Tinder | $229K | $249K | 109% |
| Airbnb | $212K | $279K | 132% |
| Gilead | $187K | $191K | 102% |
| Airship | $167K | $167K | 100% |
| CommScope | $158K | $468K | 296% |
| TaoglaS | $61K | $368K | 604% |
| Northern Trust | $146K | $60K | 41% |
| Sisk | $69K | $14K | 20% |

### ~ Partial Accounts (4) - Need Additional Review
| Account | Target | Have | Gap |
|---------|--------|------|-----|
| OpenAI | $1.54M | $913K | $624K |
| TikTok | $208K | $157K | $51K |
| Kellanova | $150K | $86K | $64K |
| Perrigo | $127K | $295K | -$168K |

### ✗ Critical Accounts (20) - Missing Contracts
| Account | Target | Gap | Action |
|---------|--------|-----|--------|
| **BOI** | $1.65M | $1.04M | Need additional contracts |
| **Stripe** | $1.22M | $1.16M | SFA has no extractable rates |
| **Udemy** | $534K | $534K | No contracts in folder |
| **Coimisiún na Meán** | $390K | $390K | No matching account |
| **Etsy** | $304K | $275K | SOW has no extractable value |
| **Dropbox** | $222K | $222K | Amendments only |
| **Coillte** | $195K | $195K | No contracts in folder |
| **NTMA** | $171K | $171K | No contracts in folder |
| + 12 more... | | | |

---

## Contracts Requiring Manual Review

29 contracts have fee sections but no extractable values:

1. **BOI - Supplier Agreement (48 pages)** - Fee schedule exists but in non-standard format
2. **Stripe - SFA SOW (30 pages)** - Framework rates in appendix
3. **Airbnb - 4 contracts** - Need manual value extraction
4. **Dropbox - 3 contracts** - Amendment structure
5. **ESB - Framework Agreements** - No specific rates
6. **Etsy - Client SOW** - Monthly retainer format
7. **Glanbia - Secondment SOW** - Need rate extraction
8. ... and 22 more (see `Manual Review Queue` sheet)

---

## Data Flow Architecture

```
Client Contracts Folder (Desktop)
         │
         ▼
   deep-contract-mining.py
   (Extract values, rates, hours)
         │
         ▼
   jh-audit-reconciliation.py
   (Match to SF, calculate gaps)
         │
         ▼
   final-jh-reconciliation.py
   (Classify status, recommend actions)
         │
         ▼
   create-contracts-dataloader.py
   (Format for SF Contract object)
         │
         ▼
   JH_Contracts_DataLoader.csv
   (Ready for SF Data Loader)
```

---

## Salesforce Contract Object Fields

### Required Fields (Campfire ERP Sync)

| API Name | Description | Source |
|----------|-------------|--------|
| `Contract_Name_Campfire__c` | Contract name | PDF filename + client |
| `AccountId` | SF Account lookup | Query from SF |
| `StartDate` | Contract start date | Extracted from PDF |
| `ContractTerm` | Term in months | Extracted or default 12 |
| `Contract_Type__c` | Type picklist | Recurring/LOI/Amendment |
| `Status` | Status | Draft (for new) |
| `OwnerId` | Contract owner | Default user ID |

### Monetary Fields

| API Name | Description | Source |
|----------|-------------|--------|
| `Contract_Value__c` | Total contract value | ACV × (Term/12) |
| `Annualized_Revenue__c` | Annual value (ACV) | Extracted × 1.18 (EUR→USD) |
| `Amount__c` | Monthly amount | ACV / 12 |

### Product Fields

| API Name | Description | Values |
|----------|-------------|--------|
| `Product_Line__c` | Multi-select | Privacy;Contracting;Litigation;Compliance |
| `Parent_Product__c` | Single select | First product line |

---

## Next Steps (Manual Actions Required)

### Immediate Actions

1. **Add Account IDs to DataLoader**
   - Open `JH_Contracts_DataLoader.xlsx`
   - Query SF for Account IDs matching `SF_Account_Name` column
   - Populate `AccountId` column with 18-character SF IDs

2. **Verify Owner ID**
   - Current placeholder: `005Wj000002YqYQIA0`
   - Replace with actual SF User ID for contract owner

3. **Upload 48 Contracts**
   - Use SF Data Loader with CSV
   - Object: Contract
   - Operation: Insert

### Follow-up Actions

4. **Request Missing Contracts from JH**
   - Udemy, Coillte, NTMA, ACS, Kingspan (no contracts in folder)
   - BOI additional contracts (~$1M gap)
   - Stripe rate cards/SOWs (~$1.2M gap)

5. **Manual Review Queue**
   - Review 29 contracts with fee sections but no extracted values
   - Extract values manually and add to upload

6. **Attach PDFs to Contracts**
   - After contract records created
   - Upload PDFs as ContentVersion
   - Link via ContentDocumentLink

---

## Currency Conversion Reference

All contract values in EUR were converted to USD:

| EUR Rate | × 1.18 | = USD |
|----------|--------|-------|
| €77/hr | | $90.86/hr |
| €80/hr | | $94.40/hr |
| €85/hr | | $100.30/hr |
| €100,000 | | $118,000 |
| €520,000 | | $613,600 |

---

## Key Insights

1. **Contract folder is incomplete** - Only covers ~52% of November RR
2. **Framework agreements lack rates** - Stripe SFA, ESB frameworks have no per-engagement values
3. **High concentration in top accounts** - BOI, OpenAI, Stripe = 44% of target RR
4. **29 contracts need manual extraction** - Fee sections exist but in non-standard formats
5. **US opportunities excluded** - 29 US pod opps filtered out for EU reconciliation

---

## Support

For questions about this reconciliation:
- Review the Excel files on Desktop
- Scripts are in `gtm-brain/scripts/`
- Documentation in `gtm-brain/docs/`

---

*Generated by GTM-Brain Audit Reconciliation System*






