#!/usr/bin/env python3
"""
Deeper analysis of jh opps.xlsx
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 80)

# Load the jh opps file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/jh opps.xlsx'))
df = pd.read_excel(xl, sheet_name=0)

rpc_col = 'Recurring, Project, or Commit'

# Split into tagged vs untagged
has_tag = df[df[rpc_col].notna()]
no_tag = df[df[rpc_col].isna()]

print('=' * 120)
print('ALL ACCOUNT NAMES IN FILE')
print('=' * 120)

# Get unique account names
all_accounts = df['Account Name'].unique()
print(f"Total unique accounts: {len(all_accounts)}")
print()

# Check specifically for our target accounts (with variations)
target_variations = [
    'uisce', 'irish water',
    'etsy',
    'tiktok', 'tik tok',
    'indeed',
    'dropbox'
]

print("Looking for target accounts:")
for acct in all_accounts:
    acct_lower = str(acct).lower()
    for target in target_variations:
        if target in acct_lower:
            # Get opps for this account
            acct_opps = df[df['Account Name'] == acct]
            tagged = acct_opps[acct_opps[rpc_col].notna()]
            untagged = acct_opps[acct_opps[rpc_col].isna()]
            
            print(f"\n📋 {acct}")
            print(f"   Total opps: {len(acct_opps)}")
            print(f"   Tagged (in reports): {len(tagged)} = ${tagged['Revenue'].sum():,.2f}")
            print(f"   Untagged (NOT in reports): {len(untagged)} = ${untagged['Revenue'].sum():,.2f}")
            
            if len(untagged) > 0:
                print("   UNTAGGED OPPS:")
                for _, row in untagged.iterrows():
                    print(f"     - {row['Opportunity Name'][:50]}: ${row['Revenue']:,.2f}")
            break

print()
print('=' * 120)
print('UNTAGGED ACCOUNTS SUMMARY')
print('=' * 120)

# Group untagged by account
untagged_by_acct = no_tag.groupby('Account Name').agg({
    'Revenue': ['sum', 'count']
}).round(2)
untagged_by_acct.columns = ['Total_Revenue', 'Opp_Count']
untagged_by_acct = untagged_by_acct.sort_values('Total_Revenue', ascending=False)

print(f"\nTop 20 accounts with UNTAGGED opps (not in reports):")
print(untagged_by_acct.head(20).to_string())

print()
print('=' * 120)
print('TAGGED ACCOUNTS FOR TARGETS')
print('=' * 120)

# For our target accounts, show what IS tagged
for acct_pattern in ['uisce', 'etsy', 'tiktok', 'indeed', 'dropbox']:
    acct_data = has_tag[has_tag['Account Name'].str.lower().str.contains(acct_pattern, na=False, regex=False)]
    if len(acct_data) > 0:
        print(f"\n{acct_pattern.upper()} - TAGGED opps already in reports:")
        print(f"   Count: {len(acct_data)} | Total: ${acct_data['Revenue'].sum():,.2f}")
        print("   Opportunities:")
        for _, row in acct_data.iterrows():
            tag = row[rpc_col]
            print(f"     [{tag}] {row['Opportunity Name'][:50]}: ${row['Revenue']:,.2f}")

