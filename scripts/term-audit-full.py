#!/usr/bin/env python3
"""
Phase 4: Full Term Audit for All JH-Originated Deals
Cross-validates Term fields between EUDIA and JH for ALL opportunities
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 300)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

# Load tabs
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 100)
print('FULL TERM AUDIT: JH-Originated Deals')
print('=' * 100)
print()

# Convert dates
jh_full['Close Date'] = pd.to_datetime(jh_full['Close Date'], errors='coerce')
jh_full['Scheduled End Date'] = pd.to_datetime(jh_full['Scheduled End Date'], errors='coerce')
eudia_all['Close Date'] = pd.to_datetime(eudia_all['Close Date'], errors='coerce')
eudia_all['End Date'] = pd.to_datetime(eudia_all['End Date'], errors='coerce')

# Match all JH opportunities to EUDIA
print(f"JH Total Opportunities: {len(jh_full)}")
print(f"EUDIA Total Opportunities: {len(eudia_all)}")
print()

term_audit_results = []

for _, j in jh_full.iterrows():
    j_acct = j['Account Name']
    j_opp = j['Opportunity Name']
    j_acv = j['ACV (USD)']
    j_term = j['Term']
    j_end = j['Scheduled End Date']
    j_close = j['Close Date']
    j_id = j['Opportunity ID']
    
    # Find EUDIA match by account
    eudia_acct = eudia_all[eudia_all['Account Name: Account Name'].str.lower().str.contains(str(j_acct).lower()[:15], na=False, regex=False)]
    
    best_match = None
    best_score = 0
    
    for _, e in eudia_acct.iterrows():
        e_opp = str(e['Opportunity Name'])
        j_words = set(str(j_opp).lower().split())
        e_words = set(e_opp.lower().split())
        overlap = len(j_words & e_words)
        
        if overlap > best_score:
            best_score = overlap
            best_match = e
    
    if best_match is not None and best_score >= 2:
        e_term = best_match['Term (Months)']
        e_end = best_match['End Date']
        e_rev = best_match['Revenue']
        e_id = best_match['Opportunity ID']
        e_opp_name = best_match['Opportunity Name']
        
        term_diff = None
        if pd.notna(j_term) and pd.notna(e_term):
            term_diff = e_term - j_term
        
        # Determine status
        if pd.isna(j_term) or j_term == 0:
            status = 'JH TERM MISSING'
            action = 'Skip - JH data incomplete'
        elif pd.isna(e_term):
            status = 'EUDIA TERM MISSING'
            action = f'Add term: {j_term} months'
        elif term_diff == 0:
            status = 'ALIGNED'
            action = 'No action'
        else:
            status = 'TERM MISMATCH'
            action = f'Update EUDIA term: {e_term} → {j_term}'
        
        term_audit_results.append({
            'JH_Account': j_acct,
            'JH_Opp': j_opp,
            'JH_Term': j_term,
            'JH_End': j_end,
            'JH_ACV': j_acv,
            'EUDIA_Opp': e_opp_name,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'EUDIA_Rev': e_rev,
            'EUDIA_ID': e_id,
            'Term_Diff': term_diff,
            'Status': status,
            'Action': action,
            'Match_Score': best_score
        })
    else:
        term_audit_results.append({
            'JH_Account': j_acct,
            'JH_Opp': j_opp,
            'JH_Term': j_term,
            'JH_End': j_end,
            'JH_ACV': j_acv,
            'EUDIA_Opp': 'NOT FOUND',
            'EUDIA_Term': None,
            'EUDIA_End': None,
            'EUDIA_Rev': None,
            'EUDIA_ID': None,
            'Term_Diff': None,
            'Status': 'NOT IN EUDIA',
            'Action': 'Create opportunity or find correct match',
            'Match_Score': 0
        })

audit_df = pd.DataFrame(term_audit_results)

# Summary
print('TERM AUDIT SUMMARY:')
print('=' * 100)
for status, group in audit_df.groupby('Status'):
    print(f"{status}: {len(group)} opportunities, JH ACV: ${group['JH_ACV'].sum():,.2f}")
print()

# =============================================================================
# TERM MISMATCHES - Need correction
# =============================================================================
print('TERM MISMATCHES (Need Correction):')
print('-' * 100)
mismatches = audit_df[audit_df['Status'] == 'TERM MISMATCH'].sort_values('JH_ACV', ascending=False)
print(f"Total mismatches: {len(mismatches)}")
print()

for _, row in mismatches.iterrows():
    print(f"   {row['JH_Account'][:35]}")
    print(f"      Opp: {row['EUDIA_Opp'][:50]}")
    print(f"      EUDIA Term: {row['EUDIA_Term']} mo | JH Term: {row['JH_Term']} mo")
    print(f"      ACV: ${row['JH_ACV']:,.2f}")
    print(f"      EUDIA ID: {row['EUDIA_ID']}")
    print(f"      Action: {row['Action']}")
    print()

# =============================================================================
# NOT IN EUDIA - Need to create or locate
# =============================================================================
print()
print('NOT IN EUDIA (Missing Opportunities):')
print('-' * 100)
missing = audit_df[audit_df['Status'] == 'NOT IN EUDIA'].sort_values('JH_ACV', ascending=False)
print(f"Total missing: {len(missing)}")
print(f"Total ACV missing: ${missing['JH_ACV'].sum():,.2f}")
print()

# Show top 20 by ACV
for _, row in missing.head(20).iterrows():
    print(f"   {row['JH_Account'][:35]}")
    print(f"      JH Opp: {row['JH_Opp'][:50]}")
    print(f"      ACV: ${row['JH_ACV']:,.2f}, Term: {row['JH_Term']} mo, End: {row['JH_End']}")
    print()

# =============================================================================
# SAVE RESULTS
# =============================================================================
print('=' * 100)
print('SAVING RESULTS')
print('=' * 100)

output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

# Full audit
audit_df.to_csv(output_dir + 'full-term-audit.csv', index=False)
print(f"Full audit saved to: {output_dir}full-term-audit.csv")

# Term corrections (Data Loader ready)
if len(mismatches) > 0:
    term_fixes = mismatches[['EUDIA_ID', 'JH_Account', 'EUDIA_Term', 'JH_Term', 'JH_ACV']].copy()
    term_fixes.columns = ['Id', 'Account', 'Current_Term', 'Correct_Term', 'ACV']
    term_fixes = term_fixes[term_fixes['Id'].notna()]
    term_fixes.to_csv(output_dir + 'term-corrections-all.csv', index=False)
    print(f"Term corrections saved to: {output_dir}term-corrections-all.csv")

# Missing opportunities
if len(missing) > 0:
    missing_opps = missing[['JH_Account', 'JH_Opp', 'JH_ACV', 'JH_Term', 'JH_End']].copy()
    missing_opps.to_csv(output_dir + 'missing-opportunities.csv', index=False)
    print(f"Missing opportunities saved to: {output_dir}missing-opportunities.csv")

print()
print('Term audit complete.')

