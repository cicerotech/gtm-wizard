#!/usr/bin/env python3
"""
December Revenue Audit: EUDIA vs Johnson Hana
Compares December expiring revenue between systems
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 400)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
print('Sheet names:', xl.sheet_names)
print()

# Load both tabs
eudia = pd.read_excel(xl, sheet_name='Eudia SF')
jh = pd.read_excel(xl, sheet_name='Johnson Hana')

print('=' * 80)
print('DECEMBER REVENUE AUDIT: EUDIA SF vs JOHNSON HANA')
print('=' * 80)
print()

# =============================================================================
# EUDIA SF DATA
# =============================================================================
print('=== EUDIA SF (December Expiring Revenue) ===')
print(f'Columns: {eudia.columns.tolist()}')
print(f'Total Records: {len(eudia)}')
print()
print(eudia.to_string())
print()
eudia_total = eudia['Revenue'].sum()
print(f'Total EUDIA December Expiring Revenue: ${eudia_total:,.2f}')
print()

# =============================================================================
# JOHNSON HANA DATA
# =============================================================================
print('=== JOHNSON HANA (Opportunities ending after Nov) ===')
print(f'Columns: {jh.columns.tolist()}')
print(f'Total Records: {len(jh)}')
print()
print(jh.to_string())
print()

# Get TCV column name (might vary)
tcv_col = [c for c in jh.columns if 'TCV' in str(c).upper() or 'ACV' in str(c).upper() or 'Revenue' in str(c)]
if tcv_col:
    jh_total = jh[tcv_col[0]].sum()
    print(f'Total JH Value ({tcv_col[0]}): ${jh_total:,.2f}')
print()

# =============================================================================
# COMPARISON BY ACCOUNT
# =============================================================================
print('=' * 80)
print('COMPARISON BY ACCOUNT')
print('=' * 80)
print()

# Normalize account names for matching
eudia['Account_Clean'] = eudia['Account Name'].str.lower().str.strip()

# Get account column from JH
jh_acct_col = [c for c in jh.columns if 'Account' in str(c)][0] if any('Account' in str(c) for c in jh.columns) else jh.columns[0]
jh['Account_Clean'] = jh[jh_acct_col].str.lower().str.strip()

# Get term column name
term_col = [c for c in eudia.columns if 'Term' in c][0] if any('Term' in c for c in eudia.columns) else None

# Group EUDIA by account  
eudia_by_acct = eudia.groupby('Account Name').agg({
    'Revenue': 'sum',
    'TCV': 'sum'
}).reset_index()

# For each EUDIA account, find JH matches
comparisons = []
for _, e_row in eudia.iterrows():
    e_acct = e_row['Account Name']
    e_acct_clean = str(e_acct).lower()[:20]
    e_rev = e_row['Revenue']
    e_tcv = e_row['TCV']
    e_term = e_row.get('Term (Months)', e_row.get('Term', None))
    e_end = e_row.get('End Date')
    e_opp = e_row.get('Opportunity N', e_row.get('Opportunity Name', ''))
    
    # Find JH matches
    jh_matches = jh[jh['Account_Clean'].str.contains(e_acct_clean[:15], na=False, regex=False)]
    
    if len(jh_matches) > 0:
        for _, j_row in jh_matches.iterrows():
            j_opp = j_row.get('Opportunity Name', j_row.get(jh.columns[1], ''))
            j_tcv = j_row.get('TCV', j_row.get('ACV', j_row.get('Revenue', 0)))
            j_term = j_row.get('Term', j_row.get('Term (Months)', None))
            j_end = j_row.get('End Date', j_row.get('Schedule End Date', None))
            
            # Check if this is a potential match
            e_words = set(str(e_opp).lower().split()) if e_opp else set()
            j_words = set(str(j_opp).lower().split()) if j_opp else set()
            overlap = len(e_words & j_words)
            
            if overlap >= 1 or len(jh_matches) == 1:
                comparisons.append({
                    'Account': e_acct[:35],
                    'EUDIA_Opp': str(e_opp)[:40] if e_opp else '',
                    'EUDIA_Rev': e_rev,
                    'EUDIA_TCV': e_tcv,
                    'EUDIA_Term': e_term,
                    'EUDIA_End': e_end,
                    'JH_Opp': str(j_opp)[:40] if j_opp else '',
                    'JH_TCV': j_tcv,
                    'JH_Term': j_term,
                    'JH_End': j_end,
                    'Rev_Variance': e_rev - j_tcv if pd.notna(e_rev) and pd.notna(j_tcv) else None,
                    'Term_Match': 'YES' if e_term == j_term else 'NO' if pd.notna(e_term) and pd.notna(j_term) else 'N/A'
                })
                break
        else:
            comparisons.append({
                'Account': e_acct[:35],
                'EUDIA_Opp': str(e_opp)[:40] if e_opp else '',
                'EUDIA_Rev': e_rev,
                'EUDIA_TCV': e_tcv,
                'EUDIA_Term': e_term,
                'EUDIA_End': e_end,
                'JH_Opp': 'NO MATCH FOUND',
                'JH_TCV': None,
                'JH_Term': None,
                'JH_End': None,
                'Rev_Variance': None,
                'Term_Match': 'N/A'
            })
    else:
        comparisons.append({
            'Account': e_acct[:35],
            'EUDIA_Opp': str(e_opp)[:40] if e_opp else '',
            'EUDIA_Rev': e_rev,
            'EUDIA_TCV': e_tcv,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'JH_Opp': 'ACCOUNT NOT IN JH',
            'JH_TCV': None,
            'JH_Term': None,
            'JH_End': None,
            'Rev_Variance': None,
            'Term_Match': 'N/A'
        })

comp_df = pd.DataFrame(comparisons)

print('DETAILED COMPARISON:')
print()
print(comp_df[['Account', 'EUDIA_Rev', 'JH_TCV', 'Rev_Variance', 'EUDIA_Term', 'JH_Term', 'Term_Match']].to_string())
print()

# =============================================================================
# SUMMARY OF DISCREPANCIES
# =============================================================================
print('=' * 80)
print('SUMMARY OF DISCREPANCIES')
print('=' * 80)
print()

# Revenue variances
rev_issues = comp_df[comp_df['Rev_Variance'].notna() & (abs(comp_df['Rev_Variance']) > 100)]
print(f'Revenue Variances (>$100): {len(rev_issues)}')
if len(rev_issues) > 0:
    for _, row in rev_issues.iterrows():
        print(f"  {row['Account']}: EUDIA ${row['EUDIA_Rev']:,.2f} vs JH ${row['JH_TCV']:,.2f} (diff: ${row['Rev_Variance']:,.2f})")
print()

# Term mismatches
term_issues = comp_df[comp_df['Term_Match'] == 'NO']
print(f'Term Mismatches: {len(term_issues)}')
if len(term_issues) > 0:
    for _, row in term_issues.iterrows():
        print(f"  {row['Account']}: EUDIA {row['EUDIA_Term']} mo vs JH {row['JH_Term']} mo")
print()

# Not found in JH
not_found = comp_df[comp_df['JH_Opp'].isin(['NO MATCH FOUND', 'ACCOUNT NOT IN JH'])]
print(f'EUDIA accounts NOT in JH data: {len(not_found)}')
if len(not_found) > 0:
    for _, row in not_found.iterrows():
        print(f"  {row['Account']}: ${row['EUDIA_Rev']:,.2f}")
print()

# =============================================================================
# RECOMMENDATIONS
# =============================================================================
print('=' * 80)
print('RECOMMENDATIONS')
print('=' * 80)
print()

print('1. REVENUE UPDATES NEEDED:')
for _, row in rev_issues.iterrows():
    if row['Rev_Variance'] and abs(row['Rev_Variance']) > 100:
        action = 'Increase' if row['Rev_Variance'] < 0 else 'Decrease'
        print(f"   - {row['Account']}: {action} by ${abs(row['Rev_Variance']):,.2f} to match JH")
print()

print('2. TERM UPDATES NEEDED:')
for _, row in term_issues.iterrows():
    print(f"   - {row['Account']}: Update term from {row['EUDIA_Term']} to {row['JH_Term']} months")
print()

print('3. NEEDS INVESTIGATION:')
for _, row in not_found.iterrows():
    print(f"   - {row['Account']}: Not found in JH data - verify if December expiry is correct")
print()

# Save comparison to CSV
output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/december-revenue-audit.csv'
comp_df.to_csv(output_path, index=False)
print(f'Full comparison saved to: {output_path}')

