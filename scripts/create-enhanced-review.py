#!/usr/bin/env python3
"""
Create Enhanced Team Review Package
Adds JH Salesforce historical data layer
Frames from Salesforce Admin migration perspective
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_columns', 20)
pd.set_option('display.width', 300)
pd.set_option('display.max_colwidth', 80)

# =============================================================================
# LOAD ALL DATA SOURCES
# =============================================================================

print("Loading data sources...")

# 1. Finance Run Rate
xl_rr = pd.ExcelFile(os.path.expanduser('~/Desktop/Run Rate 2025 Month over Month.xlsx'))
df_rr = pd.read_excel(xl_rr, sheet_name=0)
nov_col = df_rr.columns[-1]

# 2. JH Salesforce Historical (jh opps.xlsx)
xl_jh = pd.ExcelFile(os.path.expanduser('~/Desktop/jh opps.xlsx'))
df_jh = pd.read_excel(xl_jh, sheet_name=0)
rpc_col = 'Recurring, Project, or Commit'
jh_tagged = df_jh[df_jh[rpc_col].notna()]

# 3. EUDIA Data
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl_audit, sheet_name='Eudia All Time Won')

print("Data loaded successfully.")

# =============================================================================
# BUILD COMPREHENSIVE ACCOUNT VIEW
# =============================================================================

# Finance RR (from screenshot/file)
finance_rr = {
    'Irish Water': 440882.33,
    'Etsy': 304329.54,
    'TikTok': 208159.74,
    'Indeed': 417845.98,
    'Dropbox': 222037.06,
}

# JH validated December opps (from screenshots)
jh_dec_validated = {
    'Irish Water': {
        'opps': [
            ('Jamie O\'Gorman extension Aug-Dec', 78601.60),
            ('Luke Sexton extension Aug-Dec', 68776.40),
            ('Amal Elbay extension Aug-Dec', 38720.80),
        ],
        'total': 186098.80
    },
    'Etsy': {
        'opps': [('Eleanor Power Extension', 69600.00)],
        'total': 69600.00
    },
    'TikTok': {
        'opps': [('DSAR Support ODL Extension 1 Tara Bannon', 98601.16)],
        'total': 98601.16
    },
    'Indeed': {
        'opps': [('DPO ODL', 104400.00)],
        'total': 104400.00
    },
    'Dropbox': {
        'opps': [
            ('Fabiane 2025 extension', 180960.00),
            ('Fabiane Expansion Hours', 51040.00),
        ],
        'total': 232000.00
    },
}

# Target accounts mapping
targets = [
    ('Irish Water', 'uisce', 'Uisce Eireann (Irish Water)'),
    ('Etsy', 'etsy', 'Etsy Ireland UC'),
    ('TikTok', 'tiktok', 'Tiktok Information Technologies UK Limited'),
    ('Indeed', 'indeed', 'Indeed Ireland Operations Limited'),
    ('Dropbox', 'dropbox', 'Dropbox International Unlimited Company'),
]

# Build comprehensive view
comprehensive = []

for finance_name, pattern, eudia_name in targets:
    # Finance RR
    fin_rr = finance_rr.get(finance_name, 0)
    
    # JH Salesforce Total (all tagged opps)
    jh_acct = jh_tagged[jh_tagged['Account Name'].str.lower().str.contains(pattern, na=False)]
    jh_sf_total = jh_acct['Revenue'].sum() if len(jh_acct) > 0 else 0
    jh_sf_count = len(jh_acct)
    
    # JH December specifically
    jh_dec_data = jh_dec_validated.get(finance_name, {'total': 0, 'opps': []})
    jh_dec_total = jh_dec_data['total']
    
    # EUDIA December
    eudia_dec_acct = eudia_dec[eudia_dec['Account Name'].str.lower().str.contains(pattern, na=False)]
    eudia_dec_total = eudia_dec_acct['Revenue'].sum() if len(eudia_dec_acct) > 0 else 0
    eudia_dec_count = len(eudia_dec_acct)
    
    # EUDIA All (total historical)
    eudia_all_acct = eudia_all[eudia_all['Account Name'].str.lower().str.contains(pattern, na=False)]
    eudia_all_total = eudia_all_acct['Revenue'].sum() if len(eudia_all_acct) > 0 else 0
    eudia_all_count = len(eudia_all_acct)
    
    comprehensive.append({
        'Account': finance_name,
        'Finance_RR': fin_rr,
        'JH_SF_Total': jh_sf_total,
        'JH_SF_Count': jh_sf_count,
        'JH_Dec_Expiring': jh_dec_total,
        'EUDIA_Dec': eudia_dec_total,
        'EUDIA_Dec_Count': eudia_dec_count,
        'EUDIA_All_Total': eudia_all_total,
        'EUDIA_All_Count': eudia_all_count,
        'EUDIA_vs_Finance': eudia_dec_total - fin_rr,
        'EUDIA_vs_JH_Dec': eudia_dec_total - jh_dec_total,
    })

comp_df = pd.DataFrame(comprehensive)

# =============================================================================
# GENERATE ENHANCED MARKDOWN
# =============================================================================

output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

md = f"""# Johnson Hana to EUDIA Migration - Data Alignment Review

**Generated:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}  
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
"""

for _, row in comp_df.iterrows():
    status = "Aligned" if abs(row['EUDIA_vs_Finance']) < 15000 else "Gap - Review"
    md += f"| {row['Account']} | ${row['Finance_RR']:,.0f} | ${row['JH_SF_Total']:,.0f} ({row['JH_SF_Count']} opps) | ${row['EUDIA_Dec']:,.0f} | {status} |\n"

md += """
---

## Detailed Account Analysis

"""

for _, row in comp_df.iterrows():
    finance_name = row['Account']
    jh_dec_data = jh_dec_validated.get(finance_name, {'total': 0, 'opps': []})
    
    md += f"""### {finance_name}

**The Numbers:**

| Source | Amount | Notes |
|--------|--------|-------|
| Finance Run Rate | ${row['Finance_RR']:,.2f} | Annual recognized revenue target |
| JH Salesforce Total | ${row['JH_SF_Total']:,.2f} | {row['JH_SF_Count']} closed-won opportunities |
| JH December Expiring | ${jh_dec_data['total']:,.2f} | Contracts ending Dec 2025 |
| EUDIA December | ${row['EUDIA_Dec']:,.2f} | {row['EUDIA_Dec_Count']} opportunities |

**Gap Analysis:**
- EUDIA vs Finance: ${row['EUDIA_vs_Finance']:+,.2f}
- EUDIA vs JH December: ${row['EUDIA_vs_JH_Dec']:+,.2f}

"""
    
    # Add specific December opps
    if jh_dec_data['opps']:
        md += "**December Opportunities (JH Validated):**\n\n"
        md += "| Opportunity | JH Contract Value |\n"
        md += "|-------------|-------------------|\n"
        for opp_name, opp_val in jh_dec_data['opps']:
            md += f"| {opp_name} | ${opp_val:,.2f} |\n"
        md += "\n"
    
    # Add interpretation
    if row['EUDIA_vs_JH_Dec'] > 10000:
        md += f"""**Interpretation:** The EUDIA December value (${row['EUDIA_Dec']:,.0f}) is higher than JH contract values (${jh_dec_data['total']:,.0f}) by ${row['EUDIA_vs_JH_Dec']:,.0f}. This was intentional bundling to align with Finance Run Rate.

"""
    elif row['EUDIA_vs_JH_Dec'] < -5000:
        md += f"""**Interpretation:** The EUDIA December value is lower than JH. The Dropbox extension in JH is ${jh_dec_data['total']:,.0f}, EUDIA shows ${row['EUDIA_Dec']:,.0f}. Minor adjustment may be needed.

"""
    else:
        md += "**Interpretation:** EUDIA aligns well with JH contract values.\n\n"
    
    md += "---\n\n"

md += """## What We Need from the Team

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

"""

for _, row in comp_df.iterrows():
    finance_name = row['Account']
    pattern = [t[1] for t in targets if t[0] == finance_name][0]
    jh_acct = jh_tagged[jh_tagged['Account Name'].str.lower().str.contains(pattern, na=False)]
    
    if len(jh_acct) > 0:
        md += f"### {finance_name} - JH Salesforce ({len(jh_acct)} opportunities)\n\n"
        md += "| Opportunity | Revenue | Type |\n"
        md += "|-------------|---------|------|\n"
        for _, opp in jh_acct.head(10).iterrows():
            opp_type = opp[rpc_col]
            rev = opp['Revenue']
            if pd.isna(rev):
                rev = 0
            md += f"| {opp['Opportunity Name'][:45]} | ${rev:,.2f} | {opp_type} |\n"
        if len(jh_acct) > 10:
            md += f"| ... and {len(jh_acct) - 10} more | | |\n"
        md += "\n"

# Save
with open(output_dir + 'MIGRATION_ALIGNMENT_REVIEW.md', 'w') as f:
    f.write(md)

print(f"Saved: {output_dir}MIGRATION_ALIGNMENT_REVIEW.md")

# Also save comprehensive CSV
comp_df.to_csv(output_dir + 'comprehensive-account-comparison.csv', index=False)
print(f"Saved: {output_dir}comprehensive-account-comparison.csv")

print()
print("=" * 80)
print("ENHANCED REVIEW PACKAGE COMPLETE")
print("=" * 80)
print()
print("KEY SUMMARY:")
print()
for _, row in comp_df.iterrows():
    status = "OK" if abs(row['EUDIA_vs_Finance']) < 15000 else "REVIEW"
    print(f"  {row['Account']}: Finance=${row['Finance_RR']:,.0f} | JH SF=${row['JH_SF_Total']:,.0f} | EUDIA Dec=${row['EUDIA_Dec']:,.0f} [{status}]")

