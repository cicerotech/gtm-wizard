#!/usr/bin/env python3
"""
Get Opportunity IDs from EUDIA All Time Won data
"""

import pandas as pd
import os

pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 100)

# Load revenue audit file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

print('Checking sheets for Opportunity IDs...')
print()

# Check Eudia All Time Won
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
print(f"Eudia All Time Won columns: {list(eudia_all.columns)}")
print()

# Check if Opportunity ID exists
id_cols = [c for c in eudia_all.columns if 'id' in c.lower() or 'Id' in c]
print(f"Columns with 'ID': {id_cols}")
print()

# The opportunities we need to correct
corrections = [
    'Etsy Privacy Support Eleanor Power Extension',
    'Fabiane Arguello 2025 extension',
    'Indeed DPO ODL',
    'TikTok DSAR Support ODL Extension 1 Tara Bannon',
    'Uisce Eireann CDS Jamie O\'Gorman extension August December',
]

print('Searching for opportunities...')
print('=' * 100)

for opp_name in corrections:
    match = eudia_all[eudia_all['Opportunity Name'].str.contains(opp_name[:30], case=False, na=False, regex=False)]
    
    if len(match) > 0:
        print(f"Found: {opp_name[:50]}")
        for _, row in match.iterrows():
            print(f"  Name: {row['Opportunity Name'][:60]}")
            # Print any ID column we found
            for col in id_cols:
                print(f"  {col}: {row[col]}")
            print(f"  Revenue: ${row.get('Revenue', row.get('Amount', 'N/A'))}")
            print()
    else:
        print(f"NOT FOUND in All Time Won: {opp_name[:50]}")
        print()

# Also check the Eudia SF tab
print('=' * 100)
print('Checking Eudia SF tab...')
eudia_sf = pd.read_excel(xl, sheet_name='Eudia SF')
print(f"Eudia SF columns: {list(eudia_sf.columns)}")

