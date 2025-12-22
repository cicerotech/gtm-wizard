#!/usr/bin/env python3
"""
Analyze Run Rate 2025 file to understand finance actuals
"""

import pandas as pd
import os

pd.set_option('display.max_columns', 20)
pd.set_option('display.width', 300)

xl = pd.ExcelFile(os.path.expanduser('~/Desktop/Run Rate 2025 Month over Month.xlsx'))
df = pd.read_excel(xl, sheet_name=0)

# Rename columns to simpler names
cols = list(df.columns)
new_cols = ['Entity', 'Account Name']
for i, c in enumerate(cols[2:]):
    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
    new_cols.append(month_names[i])
df.columns = new_cols

# Find target accounts
targets = ['irish water', 'uisce', 'etsy', 'tiktok', 'indeed', 'dropbox']

print('TARGET ACCOUNTS - FINANCE RUN RATE (Annual):')
print('=' * 120)

for target in targets:
    match = df[df['Account Name'].str.lower().str.contains(target, na=False, regex=False)]
    if len(match) > 0:
        print()
        print(f'{target.upper()}:')
        print(match.to_string(index=False))

print()
print('=' * 120)
print('SUMMARY - November Run Rate for Target Accounts:')
print('=' * 120)

total = 0
for target in targets:
    match = df[df['Account Name'].str.lower().str.contains(target, na=False, regex=False)]
    if len(match) > 0:
        nov_val = match['Nov'].sum()
        print(f'{target.upper()}: ${nov_val:,.2f} annual run rate')
        total += nov_val

print()
print(f'TOTAL TARGET ACCOUNTS: ${total:,.2f}')

# Now compare to what's in EUDIA Salesforce
print()
print('=' * 120)
print('COMPARISON: Finance Run Rate vs EUDIA Salesforce')
print('=' * 120)

# Load EUDIA data
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_all = pd.read_excel(xl_audit, sheet_name='Eudia All Time Won')

# Filter to active opps (rough approximation - would need end date)
account_mapping = {
    'irish water': 'uisce',
    'etsy': 'etsy',
    'tiktok': 'tiktok',
    'indeed': 'indeed',
    'dropbox': 'dropbox'
}

print()
print('EUDIA Total Revenue by Account (All Time Won):')
for target in ['uisce', 'etsy', 'tiktok', 'indeed', 'dropbox']:
    match = eudia_all[eudia_all['Account Name'].str.lower().str.contains(target, na=False, regex=False)]
    if len(match) > 0:
        total_rev = match['Revenue'].sum()
        opp_count = len(match)
        print(f'{target.upper()}: ${total_rev:,.2f} ({opp_count} opps)')

# Now let's look at what we're changing
print()
print('=' * 120)
print('KEY INSIGHT: December Opps vs Finance Run Rate')
print('=' * 120)

# Load December expiring
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')

print()
print('For IRISH WATER specifically:')
print()

# Irish Water in run rate
iw_rr = df[df['Account Name'].str.lower().str.contains('irish water', na=False, regex=False)]
if len(iw_rr) > 0:
    iw_nov = iw_rr['Nov'].iloc[0]
    print(f'Finance Run Rate (Nov 2025): ${iw_nov:,.2f} annual')
    print(f'Monthly run rate: ${iw_nov/12:,.2f}')

# Irish Water in EUDIA SF (December expiring)
iw_dec = eudia_dec[eudia_dec['Account Name'].str.lower().str.contains('uisce', na=False, regex=False)]
if len(iw_dec) > 0:
    print()
    print('December Expiring Opps in EUDIA:')
    for _, row in iw_dec.iterrows():
        print(f"  {row['Opportunity Name'][:50]}: ${row['Revenue']:,.2f}")
    print(f"  TOTAL December: ${iw_dec['Revenue'].sum():,.2f}")

