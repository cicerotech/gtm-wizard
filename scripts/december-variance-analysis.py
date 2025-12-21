#!/usr/bin/env python3
"""
Phase 3: December Expiring Deals - Comprehensive Variance Analysis
Cross-validates EUDIA December expiring revenue against JH data
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 200)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

# Load all tabs
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')  # December expiring
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')
jh_dec = pd.read_excel(xl, sheet_name='Johnson Hana')

print('=' * 100)
print('DECEMBER EXPIRING DEALS - VARIANCE ANALYSIS')
print('=' * 100)
print()

# =============================================================================
# EUDIA SF (December Expiring) - Deep Analysis
# =============================================================================
print('EUDIA DECEMBER EXPIRING DEALS:')
print('-' * 100)
print(f"Total opportunities: {len(eudia_dec)}")
print(f"Total Revenue: ${eudia_dec['Revenue'].sum():,.2f}")
print()

print('All December Expiring Opportunities:')
print(eudia_dec[['Account Name', 'Opportunity Name', 'Revenue', 'Term (Months)', 'End Date']].to_string())
print()

# =============================================================================
# Cross-validate each EUDIA December deal against JH
# =============================================================================
print('=' * 100)
print('CROSS-VALIDATION: EUDIA December vs JH Full Dataset')
print('=' * 100)
print()

validation_results = []

for _, e in eudia_dec.iterrows():
    e_acct = e['Account Name']
    e_opp = e['Opportunity Name']
    e_rev = e['Revenue']
    e_term = e['Term (Months)']
    e_end = e['End Date']
    
    # Search for match in JH
    jh_acct_match = jh_full[jh_full['Account Name'].str.lower().str.contains(str(e_acct).lower()[:15], na=False, regex=False)]
    
    best_match = None
    best_score = 0
    
    for _, j in jh_acct_match.iterrows():
        j_opp = str(j['Opportunity Name'])
        e_words = set(str(e_opp).lower().split())
        j_words = set(j_opp.lower().split())
        overlap = len(e_words & j_words)
        
        if overlap > best_score:
            best_score = overlap
            best_match = j
    
    if best_match is not None and best_score >= 2:
        j_acv = best_match['ACV (USD)']
        j_term = best_match['Term']
        j_end = best_match['Scheduled End Date']
        
        rev_variance = e_rev - j_acv if pd.notna(e_rev) and pd.notna(j_acv) else None
        term_diff = e_term - j_term if pd.notna(e_term) and pd.notna(j_term) else None
        
        # Determine action
        if abs(rev_variance) < 100 and term_diff == 0:
            action = 'NO ACTION - Aligned'
        elif abs(rev_variance) < 100:
            action = f'UPDATE TERM: {e_term} → {j_term}'
        elif term_diff == 0:
            action = f'VARIANCE OK - Different ACV calculation'
        else:
            action = f'INVESTIGATE - Rev Δ${rev_variance:,.0f}, Term Δ{term_diff}'
        
        validation_results.append({
            'EUDIA_Account': e_acct,
            'EUDIA_Opp': e_opp,
            'EUDIA_Rev': e_rev,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'JH_ACV': j_acv,
            'JH_Term': j_term,
            'JH_End': j_end,
            'Rev_Variance': rev_variance,
            'Term_Diff': term_diff,
            'Match_Score': best_score,
            'Status': 'MATCHED',
            'Action': action
        })
    else:
        # Check if it's a US pod deal (not expected in JH)
        pod = e['Pod'] if 'Pod' in e else 'Unknown'
        if str(pod).lower() in ['us', 'usa', 'united states']:
            status = 'US POD - Not in JH'
            action = 'NO ACTION - US deal'
        else:
            status = 'NOT FOUND IN JH'
            action = 'INVESTIGATE - Missing from JH'
        
        validation_results.append({
            'EUDIA_Account': e_acct,
            'EUDIA_Opp': e_opp,
            'EUDIA_Rev': e_rev,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'JH_ACV': None,
            'JH_Term': None,
            'JH_End': None,
            'Rev_Variance': None,
            'Term_Diff': None,
            'Match_Score': 0,
            'Status': status,
            'Action': action
        })

val_df = pd.DataFrame(validation_results)

# Summary by status
print('VALIDATION SUMMARY:')
print('-' * 60)
for status, group in val_df.groupby('Status'):
    print(f"{status}: {len(group)} deals, ${group['EUDIA_Rev'].sum():,.2f}")
print()

# =============================================================================
# DETAILED FINDINGS
# =============================================================================
print('=' * 100)
print('DETAILED FINDINGS BY CATEGORY')
print('=' * 100)
print()

# 1. Deals with revenue variance
print('1. REVENUE VARIANCES (EUDIA vs JH):')
print('-' * 100)
rev_vars = val_df[(val_df['Status'] == 'MATCHED') & (val_df['Rev_Variance'].notna()) & (abs(val_df['Rev_Variance']) > 500)]
for _, row in rev_vars.sort_values('Rev_Variance', key=abs, ascending=False).iterrows():
    variance_pct = (row['Rev_Variance'] / row['JH_ACV'] * 100) if row['JH_ACV'] else 0
    print(f"   {row['EUDIA_Account'][:35]}")
    print(f"      Opportunity: {row['EUDIA_Opp'][:50]}")
    print(f"      EUDIA Revenue: ${row['EUDIA_Rev']:,.2f}")
    print(f"      JH ACV: ${row['JH_ACV']:,.2f}")
    print(f"      Variance: ${row['Rev_Variance']:,.2f} ({variance_pct:+.1f}%)")
    print(f"      End Date: EUDIA {row['EUDIA_End']} | JH {row['JH_End']}")
    print()

# 2. Term mismatches
print('2. TERM MISMATCHES:')
print('-' * 100)
term_vars = val_df[(val_df['Status'] == 'MATCHED') & (val_df['Term_Diff'].notna()) & (val_df['Term_Diff'] != 0)]
if len(term_vars) > 0:
    for _, row in term_vars.iterrows():
        print(f"   {row['EUDIA_Account'][:35]}")
        print(f"      EUDIA Term: {row['EUDIA_Term']} months | JH Term: {row['JH_Term']} months")
        print(f"      Action: Update EUDIA term to {row['JH_Term']} months")
        print()
else:
    print("   No term mismatches found in December expiring deals.")
print()

# 3. Not in JH (need investigation)
print('3. EUDIA DECEMBER DEALS NOT IN JH DATA:')
print('-' * 100)
not_in_jh = val_df[val_df['Status'] == 'NOT FOUND IN JH']
for _, row in not_in_jh.iterrows():
    print(f"   {row['EUDIA_Account'][:35]}")
    print(f"      Opportunity: {row['EUDIA_Opp'][:50]}")
    print(f"      Revenue: ${row['EUDIA_Rev']:,.2f}")
    print(f"      End Date: {row['EUDIA_End']}")
    print(f"      Action: Verify if this should be in JH or is correctly US/EUDIA only")
    print()

# 4. US Pod deals (not expected in JH)
print('4. US POD DEALS (Not in JH - Expected):')
print('-' * 100)
us_deals = val_df[val_df['Status'] == 'US POD - Not in JH']
if len(us_deals) > 0:
    for _, row in us_deals.iterrows():
        print(f"   {row['EUDIA_Account'][:35]}: ${row['EUDIA_Rev']:,.2f}")
else:
    print("   None identified as US pod.")
print()

# =============================================================================
# SPECIFIC DEAL ANALYSIS (from plan Phase 3)
# =============================================================================
print('=' * 100)
print('SPECIFIC DEALS FLAGGED IN PLAN')
print('=' * 100)
print()

# Check specific deals mentioned in the plan
flagged_accounts = [
    'Uisce Eireann',
    'Etsy Ireland',
    'Dropbox',
    'Datalex',
    'TikTok',
    'Cargill',
    'Intuit',
    'Northern Trust'
]

print('Searching for flagged accounts in JH dataset...')
print('-' * 100)

for acct in flagged_accounts:
    jh_matches = jh_full[jh_full['Account Name'].str.lower().str.contains(acct.lower(), na=False, regex=False)]
    eudia_matches = eudia_all[eudia_all['Account Name: Account Name'].str.lower().str.contains(acct.lower(), na=False, regex=False)]
    eudia_dec_matches = eudia_dec[eudia_dec['Account Name'].str.lower().str.contains(acct.lower(), na=False, regex=False)]
    
    print(f"\n{acct.upper()}:")
    print(f"   JH Opportunities: {len(jh_matches)}")
    if len(jh_matches) > 0:
        print(f"   JH Total ACV: ${jh_matches['ACV (USD)'].sum():,.2f}")
        for _, j in jh_matches.head(3).iterrows():
            print(f"      - {j['Opportunity Name'][:50]}: ${j['ACV (USD)']:,.2f} (Term: {j['Term']}, End: {j['Scheduled End Date']})")
    
    print(f"   EUDIA Total Opps: {len(eudia_matches)}")
    if len(eudia_matches) > 0:
        print(f"   EUDIA Total Rev: ${eudia_matches['Revenue'].sum():,.2f}")
    
    print(f"   EUDIA Dec Expiring: {len(eudia_dec_matches)}")
    if len(eudia_dec_matches) > 0:
        print(f"   EUDIA Dec Rev: ${eudia_dec_matches['Revenue'].sum():,.2f}")

# =============================================================================
# SAVE DETAILED REPORT
# =============================================================================
print()
print('=' * 100)
print('SAVING REPORTS')
print('=' * 100)

output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

val_df.to_csv(output_dir + 'december-variance-detail.csv', index=False)
print(f"Detailed variance report saved to: {output_dir}december-variance-detail.csv")

# Create action items summary
action_items = val_df[val_df['Action'].str.contains('UPDATE|INVESTIGATE', na=False)]
if len(action_items) > 0:
    action_items.to_csv(output_dir + 'december-action-items.csv', index=False)
    print(f"Action items saved to: {output_dir}december-action-items.csv")

print()
print('Analysis complete.')

