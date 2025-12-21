#!/usr/bin/env python3
"""
Analyze 999.xlsx - JH migrated opportunities including blank Recurring/Project values
Focus on finding redistribution targets for December expiring deals
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 70)

# Load the new file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/999.xlsx'))

print('Sheets in 999.xlsx:')
for sheet in xl.sheet_names:
    print(f'   - {sheet}')
print()

# Load the data
df = pd.read_excel(xl, sheet_name=xl.sheet_names[0])

print('=' * 120)
print('999.xlsx ANALYSIS')
print('=' * 120)
print()

print(f'Total rows: {len(df)}')
print(f'Columns: {list(df.columns)}')
print()

# Check for the Recurring/Project/Commit column
rpc_col = None
for col in df.columns:
    if 'recurring' in col.lower() or 'project' in col.lower() or 'commit' in col.lower():
        rpc_col = col
        break

if rpc_col:
    print(f'Found classification column: "{rpc_col}"')
    print()
    
    # Count by classification
    print('DISTRIBUTION BY CLASSIFICATION:')
    print('-' * 60)
    classification_counts = df[rpc_col].fillna('BLANK (Not in reports)').value_counts()
    for val, count in classification_counts.items():
        subset = df[df[rpc_col].fillna('BLANK (Not in reports)') == val]
        if 'Revenue' in df.columns:
            total_rev = subset['Revenue'].sum()
        elif 'ACV' in df.columns:
            total_rev = subset['ACV'].sum()
        else:
            total_rev = 0
        print(f'   {val}: {count} opps, ${total_rev:,.2f}')
    print()
    
    # Focus on BLANK ones - these are redistribution targets
    blank_opps = df[df[rpc_col].isna()]
    non_blank_opps = df[df[rpc_col].notna()]
    
    print(f'BLANK (Not in reports): {len(blank_opps)} opportunities')
    print(f'Has Classification (In reports): {len(non_blank_opps)} opportunities')
    print()
    
    # Show all blank opps - these are available for ACV redistribution
    if len(blank_opps) > 0:
        print('=' * 120)
        print('OPPORTUNITIES AVAILABLE FOR REDISTRIBUTION (Blank classification)')
        print('These are NOT currently in reports - can absorb redistributed ACV')
        print('=' * 120)
        print()
        
        # Find revenue/ACV column
        rev_col = 'Revenue' if 'Revenue' in df.columns else 'ACV' if 'ACV' in df.columns else None
        acct_col = None
        for col in df.columns:
            if 'account' in col.lower() and 'id' not in col.lower():
                acct_col = col
                break
        
        opp_col = None
        for col in df.columns:
            if 'opportunity' in col.lower() and 'name' in col.lower():
                opp_col = col
                break
        
        id_col = None
        for col in df.columns:
            if 'opportunity' in col.lower() and 'id' in col.lower():
                id_col = col
                break
        
        if acct_col and opp_col:
            for acct, group in blank_opps.groupby(acct_col):
                print(f'\n{acct}')
                print('-' * 80)
                for _, row in group.iterrows():
                    opp_name = row[opp_col] if opp_col else 'Unknown'
                    rev = row[rev_col] if rev_col and pd.notna(row[rev_col]) else 0
                    opp_id = row[id_col] if id_col and pd.notna(row[id_col]) else 'N/A'
                    print(f"   {opp_name[:60]}")
                    print(f"      Revenue: ${rev:,.2f} | ID: {opp_id}")
else:
    print('No Recurring/Project/Commit column found. Showing all data:')
    print(df.head(20).to_string())

# =============================================================================
# Focus accounts - match to December expiring
# =============================================================================
print()
print('=' * 120)
print('MATCHING TO DECEMBER EXPIRING ACCOUNTS')
print('=' * 120)
print()

# December expiring accounts from the screenshot
december_accounts = [
    'Datalex',
    'Taoglas',
    'Kellanova',
    'Aramark',
    'Uisce Eireann',
    'Teamwork',
    'Intuit',
    'Indeed',
    'Dropbox',
    'Tiktok',
    'Etsy'
]

acct_col = None
for col in df.columns:
    if 'account' in col.lower() and 'id' not in col.lower():
        acct_col = col
        break

if acct_col:
    for dec_acct in december_accounts:
        # Find matching rows
        matches = df[df[acct_col].str.lower().str.contains(dec_acct.lower(), na=False, regex=False)]
        blank_matches = matches[matches[rpc_col].isna()] if rpc_col else pd.DataFrame()
        
        if len(matches) > 0:
            print(f'\n{dec_acct.upper()}')
            print('-' * 80)
            print(f'Total opps in 999.xlsx: {len(matches)}')
            print(f'BLANK (available for redistribution): {len(blank_matches)}')
            
            if len(blank_matches) > 0:
                rev_col = 'Revenue' if 'Revenue' in df.columns else 'ACV' if 'ACV' in df.columns else None
                print(f'\n   Redistribution targets:')
                for _, row in blank_matches.iterrows():
                    opp_name = row[opp_col] if opp_col else 'Unknown'
                    rev = row[rev_col] if rev_col and pd.notna(row[rev_col]) else 0
                    print(f"      - {opp_name[:55]}: ${rev:,.2f}")

print()
print('=' * 120)
print('ANALYSIS COMPLETE')
print('=' * 120)

