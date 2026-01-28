# Salesforce Field Dependency Analysis Report

**Generated:** 2026-01-28  
**Purpose:** Document field dependencies to guide safe cleanup decisions

---

## Flow Dependencies

The following fields are actively used in Salesforce Flows and **MUST NOT** be removed:

| Field | Object | Flow(s) | Purpose |
|-------|--------|---------|---------|
| `Product_Line__c` | Opportunity | Sync_ProductLine_To_Multi_On_Create | Auto-syncs to multi-select |
| `Product_Lines_Multi__c` | Opportunity | Multiple (Sync flows) | Multi-product tracking |
| `Next_Steps__c` | Opportunity | Next_Steps_History flows | History tracking |
| `MEDDICC_Qualification__c` | Opportunity | Opportunity_MEDDICC_Template | Auto-populates template |
| `ACV__c` | Opportunity | Opportunity_Stage_Snapshot | Snapshot tracking |
| `BL_Forecast_Category__c` | Opportunity | Opportunity_Stage_Snapshot | Forecast snapshots |
| `Eudia_Council_Op__c` | Opportunity | Council_Code_Name_Sync | Anonymization trigger |
| `Code_Name__c` | Account/Opportunity | Council_Code_Name_Sync | Anonymized names |
| `Eudia_Council_Account__c` | Account | Council_Code_Name_Sync | Council flag |

---

## GTM Brain Code Dependencies

### High-Usage Fields (10+ references) - DO NOT REMOVE

| Field | References | Files | Usage |
|-------|------------|-------|-------|
| `ACV__c` | 179 | 22 | Pipeline reporting, dashboards, alerts |
| `Product_Line__c` | 144 | 28 | Product categorization everywhere |
| `Target_LOI_Date__c` | 80 | 17 | Target dates, sorting, filtering |
| `Product_Lines_Multi__c` | 74 | 12 | Multi-product support |
| `Revenue_Type__c` | 59 | 6 | Revenue classification |
| `Customer_Type__c` | 59 | 8 | Customer segmentation |
| `Sales_Type__c` | 43 | 6 | Sales categorization |
| `Customer_Subtype__c` | 29 | 4 | Customer breakdown |
| `Weighted_ACV__c` | 27 | 9 | Weighted pipeline |
| `Customer_Brain__c` | 26 | 5 | AI-generated notes |
| `Account_Display_Name__c` | 24 | 4 | Display formatting |
| `Products_Breakdown__c` | 20 | 6 | Product display |
| `Account_Plan_s__c` | 15 | 3 | Account planning |
| `Renewal_Net_Change__c` | 15 | 3 | Renewal tracking |

### Medium-Usage Fields (5-9 references) - KEEP

| Field | References | Primary Use |
|-------|------------|-------------|
| `Pod__c` | 15 | Team organization |
| `First_Deal_Closed__c` | 12 | Customer history |
| `Days_in_Stage1__c` | 11 | Velocity metrics |
| `Blended_Forecast_base__c` | 10 | Forecasting |
| `Region__c` | 9 | Geographic segmentation |
| `State__c` | 9 | Geographic data |
| `Nurture__c` | 9 | Account status |
| `Legal_Department_Size__c` | 8 | Qualification data |
| `Is_New_Logo__c` | 7 | New business tracking |
| `Key_Decision_Makers__c` | 7 | Sales intel |
| `Eudia_Tech__c` | 7 | Tech classification |
| `Johnson_Hana_Owner__c` | 6 | JH attribution |
| `Linked_in_URL__c` | 6 | Company profiles |
| `Rev_MN__c` | 6 | Revenue data |
| `Competitive_Landscape__c` | 6 | Competition intel |
| `Days_in_Stage__c` | 5 | Velocity |
| `Pain_Points_Identified__c` | 5 | Qualification |

### Low-Usage Fields (1-4 references) - REVIEW FOR CLEANUP

These fields have minimal code references but may still be important:

| Field | References | Files | Notes |
|-------|------------|-------|-------|
| `Close_Date_Push_Count__c` | 2 | mlOpportunities.js | ML features only |
| `Contact_Name__c` | 1 | mlOpportunities.js | ML features only |
| `Product_Line_s__c` | 1 | mlOpportunities.js | Possible typo/duplicate |
| `Target_LOI_Sign_Date__c` | 1 | queries.js | May be legacy |
| `CLO_Reports_to_CEO__c` | 1 | queries.js | Low priority field |
| `Johnson_Hana_Account_Owner__c` | 1 | johnsonHanaData.js | JH-specific |
| `Industry_Grouping__c` | 1 | events.js | Low usage |

---

## Fields NOT in Codebase - Candidates for Review

The following fields exist in your Salesforce page layouts (from screenshots) but have **ZERO references** in GTM Brain code. These are candidates for cleanup IF they also have low population:

### Opportunity - Potential Cleanup Candidates

| Field (from screenshot) | Notes |
|-------------------------|-------|
| `Substage` | May be legacy - check reports |
| `Meeting_Status` | First Meeting Detail section |
| `CLO_First_Meeting` | First Meeting Detail section |
| `Non_CLO_First_Meeting` | First Meeting Detail section |
| `First_Meeting_Date` | First Meeting Detail section |
| `Source_Subcategory` | Attribution tracking |
| `GCLID` | Google Ads tracking - intentionally sparse |
| `Stage_2_Timestamp` | May be formula/rollup |
| `Days_Meet_to_Close_Date` | May be formula |
| `Closed_Revenue_Snapshot` | May be formula |
| `Weighted_ACV_Snapshot` | May be formula |
| `Quarterly_Commit` | Commit tracking |
| `Quarterly_Commit_Net_New` | Commit tracking |

### Account - Potential Cleanup Candidates

| Field (from screenshot) | Notes |
|-------------------------|-------|
| `Marquee_or_High_Velocity` | Classification field |
| `Total_Annual_Revenue` | May be rollup |
| `Total_Contracted_Revenue` | May be rollup |
| `Total_Commitment_$` | May be rollup |
| `Account_Origin` | Source tracking |
| `CAB` | Advisory board flag |
| `FY_Start` | Fiscal year |
| `10_K` | SEC filing |
| `10_K_Summary` | AI-generated |
| `Timeline_Indicators` | Sales intel |

---

## Where Is This Used? Checklist

Run these checks in Salesforce Setup for each field marked REVIEW:

1. **Object Manager > [Object] > Fields > [Field] > Where Is This Used?**
   - Check for: Reports, Dashboards, Formulas, Validation Rules, Apex

2. **Quick Check via Developer Console:**
   ```sql
   -- Check if field has any data
   SELECT COUNT(Id) FROM Opportunity WHERE [FieldName] != null
   
   -- Check if field is in a formula (query FieldDefinition)
   SELECT QualifiedApiName, CalculatedFormula 
   FROM FieldDefinition 
   WHERE EntityDefinition.QualifiedApiName = 'Opportunity'
   AND CalculatedFormula LIKE '%[FieldName]%'
   ```

3. **Report Builder:** Search for field in any active reports

---

## Recommended Cleanup Priority

### Priority 1: Safe to Remove from Layouts (Low Risk)
- Fields with 0% population
- Not in any flows
- Not in GTM Brain code
- No formula dependencies

### Priority 2: Review Carefully (Medium Risk)
- Fields with <5% population
- May have legacy integrations
- Check with users before removing

### Priority 3: Do Not Touch (High Risk)
- Any field with >5% population
- Any field in active flows
- Any field referenced in GTM Brain code
- Formula fields (removing them breaks the formula)

---

## Next Steps

1. Run `salesforce/scripts/apex/analyzeFieldPopulation.apex` in Developer Console
2. Update `data/field-cleanup-tracker.csv` with population data
3. For each field with <5% population:
   - Run "Where Is This Used?" in Salesforce
   - Update tracker with findings
4. Share list of SAFE fields for approval before removing from layouts

