#!/usr/bin/env python3
"""
JH Revenue Alignment Audit
Phase 1: Account-Level Reconciliation
Phase 2: Opportunity-Level Validation
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
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')
jh_dec = pd.read_excel(xl, sheet_name='Johnson Hana')

print('=' * 100)
print('JH REVENUE ALIGNMENT AUDIT')
print('=' * 100)
print()

# =============================================================================
# PHASE 1: ACCOUNT-LEVEL RECONCILIATION
# =============================================================================
print('PHASE 1: ACCOUNT-LEVEL RECONCILIATION')
print('=' * 100)
print()

# Normalize account names
eudia_all['Account_Clean'] = eudia_all['Account Name: Account Name'].str.lower().str.strip()
jh_full['Account_Clean'] = jh_full['Account Name'].str.lower().str.strip()

# Group by account
eudia_by_acct = eudia_all.groupby('Account Name: Account Name').agg({
    'Revenue': 'sum',
    'Opportunity ID': 'count'
}).reset_index()
eudia_by_acct.columns = ['Account', 'EUDIA_Total_Rev', 'EUDIA_Opp_Count']

jh_by_acct = jh_full.groupby('Account Name').agg({
    'ACV (USD)': 'sum',
    'Opportunity ID': 'count'
}).reset_index()
jh_by_acct.columns = ['Account', 'JH_Total_ACV', 'JH_Opp_Count']

# Merge on account name (fuzzy matching)
comparisons = []
for _, e_row in eudia_by_acct.iterrows():
    e_acct = e_row['Account']
    e_acct_clean = str(e_acct).lower()[:20]
    e_rev = e_row['EUDIA_Total_Rev']
    e_count = e_row['EUDIA_Opp_Count']
    
    # Find JH match
    jh_match = jh_by_acct[jh_by_acct['Account'].str.lower().str.contains(e_acct_clean[:15], na=False, regex=False)]
    
    if len(jh_match) > 0:
        j_acv = jh_match.iloc[0]['JH_Total_ACV']
        j_count = jh_match.iloc[0]['JH_Opp_Count']
        variance = e_rev - j_acv
        comparisons.append({
            'Account': e_acct[:40],
            'EUDIA_Rev': e_rev,
            'JH_ACV': j_acv,
            'Variance': variance,
            'EUDIA_Opps': e_count,
            'JH_Opps': j_count,
            'Status': 'MATCHED'
        })
    else:
        comparisons.append({
            'Account': e_acct[:40],
            'EUDIA_Rev': e_rev,
            'JH_ACV': 0,
            'Variance': e_rev,
            'EUDIA_Opps': e_count,
            'JH_Opps': 0,
            'Status': 'EUDIA ONLY'
        })

# Find JH accounts not in EUDIA
for _, j_row in jh_by_acct.iterrows():
    j_acct = j_row['Account']
    j_acct_clean = str(j_acct).lower()[:15]
    
    # Check if already matched
    matched = any(j_acct_clean in str(c['Account']).lower() for c in comparisons if c['Status'] == 'MATCHED')
    if not matched:
        # Check if in EUDIA
        eudia_match = eudia_by_acct[eudia_by_acct['Account'].str.lower().str.contains(j_acct_clean, na=False, regex=False)]
        if len(eudia_match) == 0:
            comparisons.append({
                'Account': j_acct[:40],
                'EUDIA_Rev': 0,
                'JH_ACV': j_row['JH_Total_ACV'],
                'Variance': -j_row['JH_Total_ACV'],
                'EUDIA_Opps': 0,
                'JH_Opps': j_row['JH_Opp_Count'],
                'Status': 'JH ONLY'
            })

comp_df = pd.DataFrame(comparisons)

# Summary
print('ACCOUNT RECONCILIATION SUMMARY:')
print('-' * 60)
matched = comp_df[comp_df['Status'] == 'MATCHED']
eudia_only = comp_df[comp_df['Status'] == 'EUDIA ONLY']
jh_only = comp_df[comp_df['Status'] == 'JH ONLY']

print(f"Matched accounts: {len(matched)}")
print(f"EUDIA only accounts: {len(eudia_only)}")
print(f"JH only accounts: {len(jh_only)}")
print()

print(f"Total EUDIA Revenue: ${comp_df['EUDIA_Rev'].sum():,.2f}")
print(f"Total JH ACV: ${comp_df['JH_ACV'].sum():,.2f}")
print(f"Net Variance: ${comp_df['Variance'].sum():,.2f}")
print()

# Show significant variances (>$10K)
significant = comp_df[abs(comp_df['Variance']) > 10000].sort_values('Variance', key=abs, ascending=False)
print('ACCOUNTS WITH SIGNIFICANT VARIANCE (>$10K):')
print('-' * 60)
print(significant[['Account', 'EUDIA_Rev', 'JH_ACV', 'Variance', 'Status']].head(20).to_string())
print()

# =============================================================================
# PHASE 2: OPPORTUNITY-LEVEL MATCHING (for December/January expiring)
# =============================================================================
print()
print('PHASE 2: OPPORTUNITY-LEVEL MATCHING (December/January Expiring)')
print('=' * 100)
print()

# Parse dates in JH
jh_full['Scheduled End Date'] = pd.to_datetime(jh_full['Scheduled End Date'], errors='coerce')

# Filter JH for December 2025 and January 2026 expiring
jh_dec_jan = jh_full[
    ((jh_full['Scheduled End Date'].dt.month == 12) & (jh_full['Scheduled End Date'].dt.year == 2025)) |
    ((jh_full['Scheduled End Date'].dt.month == 1) & (jh_full['Scheduled End Date'].dt.year == 2026))
].copy()

print(f"JH opportunities expiring Dec 2025/Jan 2026: {len(jh_dec_jan)}")
print(f"Total ACV: ${jh_dec_jan['ACV (USD)'].sum():,.2f}")
print()

# Match each JH Dec/Jan opp to EUDIA
opp_matches = []
for _, j in jh_dec_jan.iterrows():
    j_acct = j['Account Name']
    j_opp = j['Opportunity Name']
    j_acv = j['ACV (USD)']
    j_term = j['Term']
    j_end = j['Scheduled End Date']
    j_id = j['Opportunity ID']
    
    # Find EUDIA matches by account
    eudia_acct_match = eudia_all[eudia_all['Account Name: Account Name'].str.lower().str.contains(str(j_acct).lower()[:15], na=False, regex=False)]
    
    best_match = None
    best_score = 0
    
    for _, e in eudia_acct_match.iterrows():
        e_opp = str(e['Opportunity Name'])
        
        # Calculate similarity
        j_words = set(str(j_opp).lower().split())
        e_words = set(e_opp.lower().split())
        overlap = len(j_words & e_words)
        
        if overlap > best_score:
            best_score = overlap
            best_match = e
    
    if best_match is not None and best_score >= 2:
        e_rev = best_match['Revenue']
        e_term = best_match['Term (Months)']
        e_end = best_match['End Date']
        e_id = best_match['Opportunity ID']
        
        rev_variance = e_rev - j_acv if pd.notna(e_rev) else None
        term_match = 'YES' if e_term == j_term else 'NO' if pd.notna(e_term) and pd.notna(j_term) else 'N/A'
        
        opp_matches.append({
            'JH_Account': j_acct[:35],
            'JH_Opp': j_opp[:45],
            'JH_ACV': j_acv,
            'JH_Term': j_term,
            'JH_End': j_end,
            'JH_ID': j_id,
            'EUDIA_Opp': best_match['Opportunity Name'][:45],
            'EUDIA_Rev': e_rev,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'EUDIA_ID': e_id,
            'Rev_Variance': rev_variance,
            'Term_Match': term_match,
            'Match_Score': best_score,
            'Status': 'MATCHED'
        })
    else:
        opp_matches.append({
            'JH_Account': j_acct[:35],
            'JH_Opp': j_opp[:45],
            'JH_ACV': j_acv,
            'JH_Term': j_term,
            'JH_End': j_end,
            'JH_ID': j_id,
            'EUDIA_Opp': 'NOT FOUND',
            'EUDIA_Rev': None,
            'EUDIA_Term': None,
            'EUDIA_End': None,
            'EUDIA_ID': None,
            'Rev_Variance': None,
            'Term_Match': 'N/A',
            'Match_Score': 0,
            'Status': 'MISSING IN EUDIA'
        })

opp_df = pd.DataFrame(opp_matches)

# Show results
matched_opps = opp_df[opp_df['Status'] == 'MATCHED']
missing_opps = opp_df[opp_df['Status'] == 'MISSING IN EUDIA']

print(f"Matched opportunities: {len(matched_opps)}")
print(f"Missing in EUDIA: {len(missing_opps)}")
print()

print('MATCHED OPPORTUNITIES (Dec/Jan Expiring):')
print('-' * 100)
if len(matched_opps) > 0:
    print(matched_opps[['JH_Account', 'JH_ACV', 'EUDIA_Rev', 'Rev_Variance', 'JH_Term', 'EUDIA_Term', 'Term_Match']].to_string())
print()

print('MISSING IN EUDIA (Need to create or locate):')
print('-' * 100)
if len(missing_opps) > 0:
    print(missing_opps[['JH_Account', 'JH_Opp', 'JH_ACV', 'JH_Term', 'JH_End']].to_string())
    print(f"\nTotal missing ACV: ${missing_opps['JH_ACV'].sum():,.2f}")
print()

# =============================================================================
# PHASE 3: DISCREPANCY ANALYSIS
# =============================================================================
print()
print('PHASE 3: DISCREPANCY ANALYSIS')
print('=' * 100)
print()

# Revenue discrepancies
rev_issues = matched_opps[matched_opps['Rev_Variance'].notna() & (abs(matched_opps['Rev_Variance']) > 1000)]
print(f'1. REVENUE DISCREPANCIES (>{" $1,000"}): {len(rev_issues)}')
print('-' * 60)
if len(rev_issues) > 0:
    for _, row in rev_issues.sort_values('Rev_Variance', key=abs, ascending=False).iterrows():
        action = 'DECREASE' if row['Rev_Variance'] > 0 else 'INCREASE'
        print(f"   {row['JH_Account'][:30]}")
        print(f"      EUDIA: ${row['EUDIA_Rev']:,.2f} | JH: ${row['JH_ACV']:,.2f}")
        print(f"      Action: {action} EUDIA by ${abs(row['Rev_Variance']):,.2f}")
        print()

# Term discrepancies
term_issues = matched_opps[matched_opps['Term_Match'] == 'NO']
print(f'2. TERM DISCREPANCIES: {len(term_issues)}')
print('-' * 60)
if len(term_issues) > 0:
    for _, row in term_issues.iterrows():
        print(f"   {row['JH_Account'][:30]}: EUDIA {row['EUDIA_Term']} mo → JH {row['JH_Term']} mo")
        print(f"      EUDIA ID: {row['EUDIA_ID']}")
print()

# =============================================================================
# SAVE RESULTS
# =============================================================================
output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

# Save account reconciliation
comp_df.to_csv(output_dir + 'account-reconciliation.csv', index=False)
print(f"Account reconciliation saved to: {output_dir}account-reconciliation.csv")

# Save opportunity matching
opp_df.to_csv(output_dir + 'opp-level-matching.csv', index=False)
print(f"Opportunity matching saved to: {output_dir}opp-level-matching.csv")

# Create term corrections file
if len(term_issues) > 0:
    term_fixes = term_issues[['EUDIA_ID', 'JH_Account', 'EUDIA_Term', 'JH_Term']].copy()
    term_fixes.columns = ['Id', 'Account', 'Current_Term', 'Correct_Term']
    term_fixes.to_csv(output_dir + 'term-corrections-dec-jan.csv', index=False)
    print(f"Term corrections saved to: {output_dir}term-corrections-dec-jan.csv")

print()
print('=' * 100)
print('AUDIT COMPLETE')
print('=' * 100)

