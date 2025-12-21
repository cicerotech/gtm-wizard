#!/usr/bin/env python3
"""
Phase 6: Revenue Impact Analysis
Comprehensive analysis of proposed changes and their impact on run rate
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 200)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

# Load generated corrections
output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'
term_corrections = pd.read_csv(output_dir + 'dataloader-term-corrections.csv')
safe_updates = pd.read_csv(output_dir + 'dataloader-safe-jh-acv.csv')

print('=' * 120)
print('JOHNSON HANA REVENUE ALIGNMENT - IMPACT ANALYSIS REPORT')
print('=' * 120)
print(f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
print()

# =============================================================================
# EXECUTIVE SUMMARY
# =============================================================================
print('EXECUTIVE SUMMARY')
print('=' * 120)
print()

print('CURRENT STATE (Before Updates):')
print('-' * 60)
eudia_total = eudia_all['Revenue'].sum()
print(f'   EUDIA All-Time Won Revenue: ${eudia_total:,.2f}')
print(f'   EUDIA December Expiring: ${eudia_dec["Revenue"].sum():,.2f} ({len(eudia_dec)} opps)')
print(f'   JH 2024-2025 Total ACV: ${jh_full["ACV (USD)"].sum():,.2f} ({len(jh_full)} opps)')
print()

print('PROPOSED CHANGES:')
print('-' * 60)
print(f'   1. Populate JH_Original_ACV__c field: {len(safe_updates)} opportunities')
print(f'   2. Set ACV_Variance_Reason__c field: {len(safe_updates)} opportunities')
print(f'   3. Correct Term_Months__c field: {len(term_corrections)} opportunities')
print()

print('REVENUE IMPACT: $0.00')
print('-' * 60)
print('   These updates do NOT modify Amount or Revenue fields.')
print('   Active Revenue and Run Rate totals will remain unchanged.')
print('   All changes are for documentation and reconciliation only.')
print()

# =============================================================================
# DETAILED VARIANCE ANALYSIS
# =============================================================================
print()
print('VARIANCE ANALYSIS BY CATEGORY')
print('=' * 120)
print()

variance_summary = safe_updates.groupby('ACV_Variance_Reason__c').agg({
    'Id': 'count',
    'JH_Original_ACV__c': 'sum'
}).reset_index()
variance_summary.columns = ['Reason', 'Opp_Count', 'JH_ACV']

print('Variance Reason Distribution:')
print('-' * 80)
for _, row in variance_summary.iterrows():
    print(f"   {row['Reason']}: {row['Opp_Count']} opps, JH ACV: ${row['JH_ACV']:,.2f}")
print()

# =============================================================================
# TERM CORRECTIONS ANALYSIS
# =============================================================================
print()
print('TERM CORRECTIONS DETAIL')
print('=' * 120)
print()

print(f'Opportunities with term corrections: {len(term_corrections)}')
print()

for _, row in term_corrections.iterrows():
    print(f"   {row['Account']}")
    print(f"      Opp: {row['Opportunity']}")
    print(f"      Current Term: {row['Current_Term']} mo → Corrected: {row['Term_Correction']} mo")
    print(f"      Current Revenue: ${row['Current_Revenue']:,.2f}")
    print(f"      JH ACV: ${row['JH_Original_ACV__c']:,.2f}")
    term_delta = row['Term_Correction'] - row['Current_Term']
    if term_delta < 0:
        print(f"      Impact: End date moves EARLIER by {abs(term_delta):.0f} months")
    else:
        print(f"      Impact: End date moves LATER by {term_delta:.0f} months")
    print()

# =============================================================================
# DECEMBER EXPIRING - RECONCILIATION STATUS
# =============================================================================
print()
print('DECEMBER EXPIRING DEALS - RECONCILIATION STATUS')
print('=' * 120)
print()

print(f'EUDIA December Expiring: {len(eudia_dec)} opportunities')
print(f'Total December Revenue: ${eudia_dec["Revenue"].sum():,.2f}')
print()

# Match each December deal
print('Status by Deal:')
print('-' * 100)

for _, e in eudia_dec.iterrows():
    e_acct = e['Account Name']
    e_opp = e['Opportunity Name']
    e_rev = e['Revenue']
    e_term = e['Term (Months)']
    e_end = e['End Date']
    
    # Check if in corrections
    pod = e.get('Pod', 'Unknown')
    
    # Find JH match
    jh_match = jh_full[jh_full['Account Name'].str.lower().str.contains(str(e_acct).lower()[:15], na=False, regex=False)]
    
    if len(jh_match) > 0:
        status = 'JH MATCHED'
        jh_acv = jh_match['ACV (USD)'].sum()
        variance = e_rev - jh_acv / len(jh_match) if len(jh_match) > 0 else 0
    else:
        if str(pod).lower() in ['us', 'usa', 'united states']:
            status = 'US POD (Not in JH)'
        else:
            status = 'NOT IN JH'
        variance = None
    
    print(f"   {e_acct[:35]}")
    print(f"      {e_opp[:50]}")
    print(f"      Revenue: ${e_rev:,.2f} | Term: {e_term} mo | End: {e_end}")
    print(f"      Status: {status}")
    if variance is not None:
        print(f"      Avg Variance vs JH: ${variance:,.2f}")
    print()

# =============================================================================
# KEY ACCOUNTS - FLAGGED IN PLAN
# =============================================================================
print()
print('KEY ACCOUNTS FLAGGED IN PLAN')
print('=' * 120)
print()

flagged_accounts = {
    'Uisce Eireann': 'Large variance ($249K higher than JH) - Dec expiring',
    'Etsy Ireland': 'Large variance ($190K higher than JH)',
    'Dropbox': 'Term variance (12 vs 7 months)',
    'Datalex': 'EUDIA too low ($2K vs $106K in JH)',
    'TikTok': 'December expiring, should verify in JH',
    'Cargill': 'US pod - not in JH (expected)',
    'Intuit': 'Verify source - US deal',
    'Northern Trust': 'Term correction needed (6 → 11 months)'
}

for acct, concern in flagged_accounts.items():
    eudia_match = eudia_all[eudia_all['Account Name: Account Name'].str.lower().str.contains(acct.lower(), na=False, regex=False)]
    jh_match = jh_full[jh_full['Account Name'].str.lower().str.contains(acct.lower(), na=False, regex=False)]
    
    print(f"{acct.upper()}")
    print(f"   Concern: {concern}")
    print(f"   EUDIA: {len(eudia_match)} opps, ${eudia_match['Revenue'].sum():,.2f}")
    print(f"   JH: {len(jh_match)} opps, ${jh_match['ACV (USD)'].sum():,.2f}")
    
    # Check if in corrections
    in_corrections = safe_updates[safe_updates['Id'].isin(eudia_match['Opportunity ID'].tolist())]
    print(f"   In Corrections: {len(in_corrections)} opps")
    print()

# =============================================================================
# QUESTIONS REQUIRING BUSINESS DECISION
# =============================================================================
print()
print('QUESTIONS REQUIRING BUSINESS DECISION')
print('=' * 120)
print()

questions = [
    {
        'question': 'Uisce Eireann December Deals ($435K)',
        'detail': '3 opportunities expiring in December are NOT in JH data.',
        'options': ['A: These are EUDIA-originated (correct as-is)', 'B: Should be in JH - investigate source'],
        'recommendation': 'Verify with operations if these are JH or EUDIA deals'
    },
    {
        'question': 'Etsy/Dropbox/TikTok Large Variances',
        'detail': 'EUDIA shows 2-4x higher than JH ACV for these accounts.',
        'options': ['A: EUDIA is correct (annualized/bundle)', 'B: JH is source of truth - reduce EUDIA'],
        'recommendation': 'Current plan: Document variance, do not change revenue'
    },
    {
        'question': 'Datalex Understatement ($2K vs $106K)',
        'detail': 'EUDIA shows only $2,368 for a deal JH shows as $106,488.',
        'options': ['A: Increase EUDIA revenue', 'B: JH is multi-period - leave as-is'],
        'recommendation': 'Investigate contract terms before any change'
    },
    {
        'question': 'Term Corrections Impact on Expiration',
        'detail': '8 opportunities have term corrections that will affect end dates.',
        'options': ['A: Apply corrections (revenue may roll off earlier)', 'B: Keep current terms'],
        'recommendation': 'Apply corrections but monitor run rate impact'
    }
]

for i, q in enumerate(questions, 1):
    print(f"{i}. {q['question']}")
    print(f"   Detail: {q['detail']}")
    for opt in q['options']:
        print(f"      {opt}")
    print(f"   Recommendation: {q['recommendation']}")
    print()

# =============================================================================
# FILES GENERATED
# =============================================================================
print()
print('FILES GENERATED')
print('=' * 120)
print()

files = [
    ('account-reconciliation.csv', 'Account-level comparison EUDIA vs JH'),
    ('opp-level-matching.csv', 'Opportunity matching results'),
    ('full-term-audit.csv', 'Complete term audit all JH deals'),
    ('december-variance-detail.csv', 'December expiring deals analysis'),
    ('december-action-items.csv', 'December deals needing action'),
    ('term-corrections-all.csv', 'All term corrections identified'),
    ('dataloader-safe-jh-acv.csv', 'DATA LOADER: JH ACV + Variance Reason (SAFE)'),
    ('dataloader-term-corrections.csv', 'DATA LOADER: Term corrections (REVIEW FIRST)'),
    ('dataloader-final-consolidated.csv', 'DATA LOADER: All updates consolidated')
]

for fname, desc in files:
    fpath = output_dir + fname
    if os.path.exists(fpath):
        df = pd.read_csv(fpath)
        print(f"   {fname}")
        print(f"      {desc}")
        print(f"      Records: {len(df)}")
    print()

# =============================================================================
# RECOMMENDED EXECUTION ORDER
# =============================================================================
print()
print('RECOMMENDED EXECUTION ORDER')
print('=' * 120)
print()

steps = [
    '1. BACKUP: Export all opportunities to be modified',
    '2. DOCUMENT: Record current Active Revenue total before changes',
    '3. SAFE UPDATE: Import dataloader-safe-jh-acv.csv (JH_Original_ACV__c + ACV_Variance_Reason__c)',
    '4. VERIFY: Confirm Active Revenue total unchanged',
    '5. REVIEW: Examine dataloader-term-corrections.csv for term updates',
    '6. DECISION: Get business approval for term corrections',
    '7. TERM UPDATE: Import term corrections if approved',
    '8. VALIDATE: Run reports comparing EUDIA vs JH totals',
    '9. MONITOR: Track run rate for next 30 days for any unexpected changes'
]

for step in steps:
    print(f"   {step}")
print()

print('=' * 120)
print('IMPACT ANALYSIS COMPLETE')
print('=' * 120)

