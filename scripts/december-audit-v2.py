#!/usr/bin/env python3
"""
December Revenue Audit V2: Improved matching logic
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 400)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

eudia = pd.read_excel(xl, sheet_name='Eudia SF')
jh = pd.read_excel(xl, sheet_name='Johnson Hana')

print('=' * 100)
print('DECEMBER REVENUE AUDIT: EUDIA SF vs JOHNSON HANA')
print('=' * 100)
print()

# =============================================================================
# SUMMARY TOTALS
# =============================================================================
print('TOTALS:')
print(f"  EUDIA December Expiring:  ${eudia['Revenue'].sum():,.2f} ({len(eudia)} opportunities)")
print(f"  JH December Expiring:     ${jh['ACV (USD)'].sum():,.2f} ({len(jh)} opportunities)")
print(f"  Variance:                 ${eudia['Revenue'].sum() - jh['ACV (USD)'].sum():,.2f}")
print()

# =============================================================================
# DETAILED MATCHING BY OPPORTUNITY NAME
# =============================================================================
print('=' * 100)
print('OPPORTUNITY-LEVEL MATCHING')
print('=' * 100)
print()

results = []

for _, e in eudia.iterrows():
    e_acct = e['Account Name']
    e_opp = e['Opportunity Name']
    e_rev = e['Revenue']
    e_term = e['Term (Months)']
    e_end = e['End Date']
    
    # Find JH match by opportunity name similarity
    best_match = None
    best_score = 0
    
    for _, j in jh.iterrows():
        j_opp = j['Opportunity Name']
        j_acv = j['ACV (USD)']
        j_term = j['Term']
        j_end = j['Scheduled End Date']
        
        # Calculate similarity score
        e_words = set(str(e_opp).lower().split())
        j_words = set(str(j_opp).lower().split())
        
        # Remove common words
        common_ignore = {'the', 'and', 'or', 'a', 'an', 'for', '-', '(', ')', 'odl', 'extension'}
        e_words = e_words - common_ignore
        j_words = j_words - common_ignore
        
        overlap = len(e_words & j_words)
        
        if overlap > best_score:
            best_score = overlap
            best_match = {
                'JH_Opp': j_opp,
                'JH_ACV': j_acv,
                'JH_Term': j_term,
                'JH_End': j_end,
                'Score': overlap
            }
    
    if best_match and best_score >= 2:
        variance = e_rev - best_match['JH_ACV']
        term_match = 'YES' if e_term == best_match['JH_Term'] else 'NO'
        
        results.append({
            'Account': e_acct[:40],
            'EUDIA_Opp': e_opp[:45],
            'EUDIA_Rev': e_rev,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'JH_Opp': best_match['JH_Opp'][:45],
            'JH_ACV': best_match['JH_ACV'],
            'JH_Term': best_match['JH_Term'],
            'JH_End': best_match['JH_End'],
            'Rev_Variance': variance,
            'Term_Match': term_match,
            'Status': 'MATCHED'
        })
    else:
        results.append({
            'Account': e_acct[:40],
            'EUDIA_Opp': e_opp[:45],
            'EUDIA_Rev': e_rev,
            'EUDIA_Term': e_term,
            'EUDIA_End': e_end,
            'JH_Opp': 'NO MATCH',
            'JH_ACV': None,
            'JH_Term': None,
            'JH_End': None,
            'Rev_Variance': None,
            'Term_Match': 'N/A',
            'Status': 'NOT IN JH'
        })

results_df = pd.DataFrame(results)

# Show matched vs unmatched
matched = results_df[results_df['Status'] == 'MATCHED']
unmatched = results_df[results_df['Status'] == 'NOT IN JH']

print('MATCHED OPPORTUNITIES:')
print('-' * 100)
if len(matched) > 0:
    print(matched[['Account', 'EUDIA_Rev', 'JH_ACV', 'Rev_Variance', 'EUDIA_Term', 'JH_Term', 'Term_Match']].to_string())
    print()
    matched_eudia = matched['EUDIA_Rev'].sum()
    matched_jh = matched['JH_ACV'].sum()
    print(f"Matched EUDIA Total: ${matched_eudia:,.2f}")
    print(f"Matched JH Total:    ${matched_jh:,.2f}")
    print(f"Matched Variance:    ${matched_eudia - matched_jh:,.2f}")
else:
    print('  No matches found')
print()

print('NOT MATCHED (EUDIA only - not in JH data):')
print('-' * 100)
if len(unmatched) > 0:
    print(unmatched[['Account', 'EUDIA_Opp', 'EUDIA_Rev', 'EUDIA_Term', 'EUDIA_End']].to_string())
    print()
    print(f"Unmatched EUDIA Total: ${unmatched['EUDIA_Rev'].sum():,.2f}")
else:
    print('  All opportunities matched')
print()

# =============================================================================
# DISCREPANCIES REQUIRING ACTION
# =============================================================================
print('=' * 100)
print('DISCREPANCIES REQUIRING ACTION')
print('=' * 100)
print()

# Revenue discrepancies
rev_issues = matched[abs(matched['Rev_Variance']) > 100]
if len(rev_issues) > 0:
    print('1. REVENUE DISCREPANCIES (EUDIA vs JH):')
    for _, row in rev_issues.iterrows():
        action = 'DECREASE' if row['Rev_Variance'] > 0 else 'INCREASE'
        print(f"   {row['Account'][:30]}")
        print(f"      EUDIA: ${row['EUDIA_Rev']:,.2f} | JH: ${row['JH_ACV']:,.2f} | {action} by ${abs(row['Rev_Variance']):,.2f}")
    print()

# Term discrepancies
term_issues = matched[matched['Term_Match'] == 'NO']
if len(term_issues) > 0:
    print('2. TERM DISCREPANCIES:')
    for _, row in term_issues.iterrows():
        print(f"   {row['Account'][:30]}: EUDIA {row['EUDIA_Term']} mo → JH {row['JH_Term']} mo")
    print()

# Unmatched requiring investigation
if len(unmatched) > 0:
    print('3. REQUIRES INVESTIGATION (Not in JH - may not expire in December):')
    for _, row in unmatched.iterrows():
        print(f"   {row['Account'][:30]}: ${row['EUDIA_Rev']:,.2f} (End: {row['EUDIA_End']})")
    print()

# =============================================================================
# FINAL SUMMARY
# =============================================================================
print('=' * 100)
print('FINAL SUMMARY')
print('=' * 100)
print()
print(f"Opportunities with revenue discrepancies:  {len(rev_issues)}")
print(f"Opportunities with term discrepancies:     {len(term_issues)}")
print(f"Opportunities not found in JH:             {len(unmatched)}")
print()
print(f"Total December expiring if all accurate:   ${matched['JH_ACV'].sum() + unmatched['EUDIA_Rev'].sum():,.2f}")

# Save results
output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/december-revenue-audit-v2.csv'
results_df.to_csv(output_path, index=False)
print(f"\nFull results saved to: {output_path}")

