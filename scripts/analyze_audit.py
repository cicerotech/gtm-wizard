#!/usr/bin/env python3
"""Deep analysis of Closed Won Audit for BL Attribution"""

import pandas as pd
from datetime import datetime

file_path = '/Users/keiganpesenti/Desktop/Closed Won Audit for BL Attribution.xlsx'

# Load both sheets
true_won = pd.read_excel(file_path, sheet_name='TRUE WON THIS QUARTER')
potential_dups = pd.read_excel(file_path, sheet_name='POTENTIAL DUPS FOR AUDIT')

print("="*80)
print("ANALYSIS SUMMARY")
print("="*80)

print(f"\n=== TRUE WON THIS QUARTER: {len(true_won)} records ===")
print(f"Owners in TRUE WON:")
print(true_won['Opportunity Owner: Full Name'].value_counts())
print(f"\nTotal ACV: ${true_won['ACV'].sum():,.0f}")

print(f"\n=== POTENTIAL DUPS FOR AUDIT: {len(potential_dups)} records ===")
print(f"Owners in POTENTIAL DUPS:")
print(potential_dups['Opportunity Owner: Full Name'].value_counts())
print(f"\nTotal ACV: ${potential_dups['ACV'].sum():,.0f}")

# Convert Close Date to datetime
potential_dups['Close Date'] = pd.to_datetime(potential_dups['Close Date'], errors='coerce')

print("\n" + "="*80)
print("DATE DISTRIBUTION - POTENTIAL DUPS")
print("="*80)
potential_dups['Year'] = potential_dups['Close Date'].dt.year
print(potential_dups.groupby('Year')['ACV'].agg(['count', 'sum']))

print("\n" + "="*80)
print("FOCUS: 2025+ RECORDS (CRITICAL)")
print("="*80)
recent = potential_dups[potential_dups['Year'] >= 2025]
print(f"Records from 2025 or later: {len(recent)}")
if len(recent) > 0:
    print(recent[['Account Name: Account Name', 'Opportunity Name', 'Close Date', 'ACV', 'Opportunity Owner: Full Name']].to_string())

print("\n" + "="*80)
print("IDENTIFYING DUPLICATES BY ACCOUNT")
print("="*80)

# Find accounts that appear in BOTH sheets
true_accounts = set(true_won['Account Name: Account Name'].dropna())
dup_accounts = set(potential_dups['Account Name: Account Name'].dropna())
overlap = true_accounts.intersection(dup_accounts)

print(f"Accounts in TRUE WON: {len(true_accounts)}")
print(f"Accounts in POTENTIAL DUPS: {len(dup_accounts)}")
print(f"Accounts in BOTH (potential conflicts): {len(overlap)}")

if overlap:
    print("\n=== OVERLAPPING ACCOUNTS (NEEDS REVIEW) ===")
    for acct in sorted(overlap)[:20]:  # Show first 20
        print(f"\n--- {acct} ---")
        print("TRUE WON records:")
        tw = true_won[true_won['Account Name: Account Name'] == acct][['Opportunity Name', 'Close Date', 'ACV']]
        print(tw.to_string())
        print("POTENTIAL DUPS records:")
        pd_recs = potential_dups[potential_dups['Account Name: Account Name'] == acct][['Opportunity Name', 'Close Date', 'ACV']]
        print(pd_recs.to_string())

print("\n" + "="*80)
print("$100K RECORDS (LIKELY TEST/PLACEHOLDER)")
print("="*80)
placeholder_100k = potential_dups[potential_dups['ACV'] == 100000]
print(f"Records with exactly $100K ACV: {len(placeholder_100k)}")
if len(placeholder_100k) > 0:
    print(placeholder_100k[['Account Name: Account Name', 'Opportunity Name', 'Close Date']].to_string())

print("\n" + "="*80)
print("ACCOUNT OWNER MAPPING (for re-attribution)")
print("="*80)
# From TRUE WON, extract account -> owner mapping
true_won_mapping = true_won.groupby('Account Name: Account Name')['Opportunity Owner: Full Name'].first().to_dict()

# Check potential dups owned by Keigan and suggest proper owner
keigan_dups = potential_dups[potential_dups['Opportunity Owner: Full Name'] == 'Keigan Pesenti']
print(f"\nRecords owned by Keigan Pesenti: {len(keigan_dups)}")

# For each, check if we have a known owner from TRUE WON
print("\n=== SUGGESTED RE-ATTRIBUTION ===")
reattrib_suggestions = []
for idx, row in keigan_dups.iterrows():
    acct = row['Account Name: Account Name']
    if acct in true_won_mapping:
        suggested = true_won_mapping[acct]
        reattrib_suggestions.append({
            'Opportunity ID': row['ID_Oppt_18'],
            'Account': acct,
            'Opportunity': row['Opportunity Name'],
            'ACV': row['ACV'],
            'Close Date': row['Close Date'],
            'Current Owner': 'Keigan Pesenti',
            'Suggested Owner': suggested
        })

if reattrib_suggestions:
    reattrib_df = pd.DataFrame(reattrib_suggestions)
    print(f"\nFound {len(reattrib_df)} opportunities that can be re-attributed:")
    print(reattrib_df.to_string())
    
    # Save to Excel for action
    output_path = '/Users/keiganpesenti/Desktop/BL_Attribution_Recommendations.xlsx'
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        reattrib_df.to_excel(writer, sheet_name='Re-Attribution Suggestions', index=False)
        
        # Also export 100K placeholders
        if len(placeholder_100k) > 0:
            placeholder_100k.to_excel(writer, sheet_name='$100K Placeholders to Delete', index=False)
        
        # Export 2025+ records
        if len(recent) > 0:
            recent.to_excel(writer, sheet_name='2025+ Records (Critical)', index=False)
    
    print(f"\n*** Recommendations saved to: {output_path} ***")
else:
    print("No re-attribution suggestions found (no overlap with TRUE WON accounts)")

