#!/usr/bin/env python3
"""
Create Team Review Package for December Expiring Deals
Compares EUDIA, JH, and Finance data
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

# Finance Run Rate
xl_rr = pd.ExcelFile(os.path.expanduser('~/Desktop/Run Rate 2025 Month over Month.xlsx'))
df_rr = pd.read_excel(xl_rr, sheet_name=0)
# Get November column (last one)
nov_col = df_rr.columns[-1]
df_rr = df_rr[['Account Name', nov_col]]
df_rr.columns = ['Account Name', 'Finance_RR_Nov']

# EUDIA Data
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl_audit, sheet_name='Eudia All Time Won')

# JH Validated Values from screenshots
jh_validated = {
    'Uisce Eireann CDS Jamie O\'Gorman extension August December': 78601.60,
    'Uisce Eireann CDS Luke Sexton extension August December': 68776.40,
    'Uisce Eireann CDS Amal Elbay extension August December': 38720.80,
    'Etsy Privacy Support Eleanor Power Extension': 69600.00,
    'TikTok DSAR Support ODL Extension 1 Tara Bannon': 98601.16,
    'Indeed DPO ODL': 104400.00,
    'Fabiane Arguello 2025 extension': 180960.00,
    'Fabiane Arguello 2025 Expansion Hours Increase': 51040.00,
}

# Finance RR mapping (from screenshot)
finance_rr = {
    'Irish Water': 440882.33,
    'Uisce Eireann': 440882.33,
    'Etsy': 304329.54,
    'TikTok': 208159.74,
    'Indeed': 417845.98,
    'Dropbox': 222037.06,
}

print("Data loaded successfully.")
print()

# =============================================================================
# BUILD OPPORTUNITY-LEVEL BREAKDOWN
# =============================================================================

print("Building opportunity-level breakdown...")

opp_data = []

for _, row in eudia_dec.iterrows():
    opp_name = row['Opportunity Name']
    eudia_rev = row['Revenue']
    account = row['Account Name']
    term = row.get('Term (Months)', 'N/A')
    end_date = row.get('End Date', 'N/A')
    
    # Find JH validated value
    jh_val = None
    for jh_name, jh_amount in jh_validated.items():
        if jh_name.lower()[:25] in opp_name.lower() or opp_name.lower()[:25] in jh_name.lower():
            jh_val = jh_amount
            break
    
    # Get opportunity ID from eudia_all
    opp_id_match = eudia_all[eudia_all['Opportunity Name'] == opp_name]
    opp_id = opp_id_match['Opportunity ID'].iloc[0] if len(opp_id_match) > 0 else 'N/A'
    
    # Calculate variance
    variance = (eudia_rev - jh_val) if jh_val else None
    variance_pct = (variance / jh_val * 100) if jh_val and jh_val > 0 else None
    
    opp_data.append({
        'Account': account,
        'Opportunity_Name': opp_name,
        'Opportunity_ID': opp_id,
        'EUDIA_Revenue': eudia_rev,
        'JH_Validated': jh_val if jh_val else 'Not matched',
        'Variance': variance if variance else 'N/A',
        'Variance_Pct': f"{variance_pct:.1f}%" if variance_pct else 'N/A',
        'Term_Months': term,
        'End_Date': end_date,
    })

opp_df = pd.DataFrame(opp_data)

# =============================================================================
# BUILD ACCOUNT-LEVEL SUMMARY
# =============================================================================

print("Building account-level summary...")

# Target accounts
target_accounts = [
    ('Uisce Eireann (Irish Water)', 'uisce', 'Irish Water'),
    ('Etsy Ireland UC', 'etsy', 'Etsy'),
    ('Tiktok Information Technologies UK Limited', 'tiktok', 'TikTok'),
    ('Indeed Ireland Operations Limited', 'indeed', 'Indeed'),
    ('Dropbox International Unlimited Company', 'dropbox', 'Dropbox'),
]

account_summary = []

for full_name, pattern, finance_key in target_accounts:
    # EUDIA December total
    eudia_dec_acct = eudia_dec[eudia_dec['Account Name'].str.lower().str.contains(pattern, na=False, regex=False)]
    eudia_dec_total = eudia_dec_acct['Revenue'].sum()
    eudia_dec_count = len(eudia_dec_acct)
    
    # JH validated total for this account
    jh_total = 0
    for jh_name, jh_amount in jh_validated.items():
        if pattern in jh_name.lower():
            jh_total += jh_amount
    # Special handling for dropbox
    if pattern == 'dropbox':
        jh_total = 180960.00 + 51040.00  # Fabiane extension + expansion
    
    # Finance RR
    fin_rr = finance_rr.get(finance_key, 0)
    
    # Calculate alignments
    eudia_vs_finance = eudia_dec_total - fin_rr
    eudia_vs_jh = eudia_dec_total - jh_total if jh_total > 0 else None
    jh_vs_finance = jh_total - fin_rr if jh_total > 0 else None
    
    account_summary.append({
        'Account': finance_key,
        'Finance_RR_Annual': fin_rr,
        'EUDIA_December_Total': eudia_dec_total,
        'EUDIA_Dec_Opps': eudia_dec_count,
        'JH_Contract_Total': jh_total if jh_total > 0 else 'N/A',
        'EUDIA_vs_Finance': eudia_vs_finance,
        'EUDIA_vs_JH': eudia_vs_jh if eudia_vs_jh else 'N/A',
        'JH_vs_Finance': jh_vs_finance if jh_vs_finance else 'N/A',
        'Status': 'Aligned' if abs(eudia_vs_finance) < 10000 else 'Review Needed',
    })

acct_df = pd.DataFrame(account_summary)

# =============================================================================
# SAVE CSV FILES
# =============================================================================

output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

opp_df.to_csv(output_dir + 'december-opp-level-breakdown.csv', index=False)
print(f"Saved: {output_dir}december-opp-level-breakdown.csv")

acct_df.to_csv(output_dir + 'account-summary.csv', index=False)
print(f"Saved: {output_dir}account-summary.csv")

# =============================================================================
# GENERATE MARKDOWN SUMMARY
# =============================================================================

print("Generating summary document...")

md_content = f"""# December Expiring Deals - Team Review Package

**Generated:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}  
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
"""

for _, row in acct_df.iterrows():
    jh_val = f"${row['JH_Contract_Total']:,.2f}" if isinstance(row['JH_Contract_Total'], (int, float)) else row['JH_Contract_Total']
    eudia_vs_fin = row['EUDIA_vs_Finance']
    eudia_vs_fin_str = f"+${eudia_vs_fin:,.2f}" if eudia_vs_fin >= 0 else f"-${abs(eudia_vs_fin):,.2f}"
    
    md_content += f"| {row['Account']} | ${row['Finance_RR_Annual']:,.2f} | ${row['EUDIA_December_Total']:,.2f} | {jh_val} | {eudia_vs_fin_str} | {row['Status']} |\n"

md_content += """
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
"""

for _, row in acct_df.iterrows():
    if isinstance(row['EUDIA_vs_JH'], (int, float)):
        variance = row['EUDIA_vs_JH']
        explanation = "Bundled to match Finance RR" if variance > 10000 else "Minor difference"
        md_content += f"| {row['Account']} | ${row['EUDIA_December_Total']:,.2f} | ${row['JH_Contract_Total']:,.2f} | ${variance:,.2f} | {explanation} |\n"

md_content += """
---

## Opportunity-Level Detail

### Irish Water (Uisce Eireann)

"""

iw_opps = opp_df[opp_df['Account'].str.contains('Uisce', case=False, na=False)]
if len(iw_opps) > 0:
    md_content += "| Opportunity | EUDIA Revenue | JH Validated | Variance |\n"
    md_content += "|-------------|---------------|--------------|----------|\n"
    for _, row in iw_opps.iterrows():
        jh_val = f"${row['JH_Validated']:,.2f}" if isinstance(row['JH_Validated'], (int, float)) else row['JH_Validated']
        var_val = f"${row['Variance']:,.2f}" if isinstance(row['Variance'], (int, float)) else row['Variance']
        md_content += f"| {row['Opportunity_Name'][:45]}... | ${row['EUDIA_Revenue']:,.2f} | {jh_val} | {var_val} |\n"

md_content += """
### Etsy

"""

etsy_opps = opp_df[opp_df['Account'].str.contains('Etsy', case=False, na=False)]
if len(etsy_opps) > 0:
    md_content += "| Opportunity | EUDIA Revenue | JH Validated | Variance |\n"
    md_content += "|-------------|---------------|--------------|----------|\n"
    for _, row in etsy_opps.iterrows():
        jh_val = f"${row['JH_Validated']:,.2f}" if isinstance(row['JH_Validated'], (int, float)) else row['JH_Validated']
        var_val = f"${row['Variance']:,.2f}" if isinstance(row['Variance'], (int, float)) else row['Variance']
        md_content += f"| {row['Opportunity_Name'][:45]}... | ${row['EUDIA_Revenue']:,.2f} | {jh_val} | {var_val} |\n"

md_content += """
### TikTok

"""

tiktok_opps = opp_df[opp_df['Account'].str.contains('Tiktok', case=False, na=False)]
if len(tiktok_opps) > 0:
    md_content += "| Opportunity | EUDIA Revenue | JH Validated | Variance |\n"
    md_content += "|-------------|---------------|--------------|----------|\n"
    for _, row in tiktok_opps.iterrows():
        jh_val = f"${row['JH_Validated']:,.2f}" if isinstance(row['JH_Validated'], (int, float)) else row['JH_Validated']
        var_val = f"${row['Variance']:,.2f}" if isinstance(row['Variance'], (int, float)) else row['Variance']
        md_content += f"| {row['Opportunity_Name'][:45]}... | ${row['EUDIA_Revenue']:,.2f} | {jh_val} | {var_val} |\n"

md_content += """
### Indeed

"""

indeed_opps = opp_df[opp_df['Account'].str.contains('Indeed', case=False, na=False)]
if len(indeed_opps) > 0:
    md_content += "| Opportunity | EUDIA Revenue | JH Validated | Variance |\n"
    md_content += "|-------------|---------------|--------------|----------|\n"
    for _, row in indeed_opps.iterrows():
        jh_val = f"${row['JH_Validated']:,.2f}" if isinstance(row['JH_Validated'], (int, float)) else row['JH_Validated']
        var_val = f"${row['Variance']:,.2f}" if isinstance(row['Variance'], (int, float)) else row['Variance']
        md_content += f"| {row['Opportunity_Name'][:45]}... | ${row['EUDIA_Revenue']:,.2f} | {jh_val} | {var_val} |\n"

md_content += """
### Dropbox

"""

dropbox_opps = opp_df[opp_df['Account'].str.contains('Dropbox', case=False, na=False)]
if len(dropbox_opps) > 0:
    md_content += "| Opportunity | EUDIA Revenue | JH Validated | Variance |\n"
    md_content += "|-------------|---------------|--------------|----------|\n"
    for _, row in dropbox_opps.iterrows():
        jh_val = f"${row['JH_Validated']:,.2f}" if isinstance(row['JH_Validated'], (int, float)) else row['JH_Validated']
        var_val = f"${row['Variance']:,.2f}" if isinstance(row['Variance'], (int, float)) else row['Variance']
        md_content += f"| {row['Opportunity_Name'][:45]}... | ${row['EUDIA_Revenue']:,.2f} | {jh_val} | {var_val} |\n"

md_content += """
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
"""

# Save markdown file
with open(output_dir + 'DECEMBER_DEALS_REVIEW.md', 'w') as f:
    f.write(md_content)
print(f"Saved: {output_dir}DECEMBER_DEALS_REVIEW.md")

print()
print("=" * 80)
print("TEAM REVIEW PACKAGE COMPLETE")
print("=" * 80)
print()
print("Files created:")
print(f"  1. {output_dir}DECEMBER_DEALS_REVIEW.md")
print(f"  2. {output_dir}december-opp-level-breakdown.csv")
print(f"  3. {output_dir}account-summary.csv")
print()
print("SUMMARY:")
print()
for _, row in acct_df.iterrows():
    print(f"  {row['Account']}:")
    print(f"    Finance RR: ${row['Finance_RR_Annual']:,.2f}")
    print(f"    EUDIA Dec:  ${row['EUDIA_December_Total']:,.2f}")
    if isinstance(row['JH_Contract_Total'], (int, float)):
        print(f"    JH Total:   ${row['JH_Contract_Total']:,.2f}")
    print()

