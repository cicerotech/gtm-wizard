#!/usr/bin/env python3
"""
Analyze Contracts and Won Opps to Find Missing Rev
"""

import pandas as pd

file_path = '/Users/keiganpesenti/Desktop/Contracts and Won Opps to Find Missing Rev.xlsx'

# Get sheet names
xls = pd.ExcelFile(file_path)
print("=" * 100)
print("ANALYZING: Contracts and Won Opps to Find Missing Rev.xlsx")
print("=" * 100)
print(f"\nSheet names: {xls.sheet_names}\n")

# Read each sheet
for sheet in xls.sheet_names:
    print("=" * 100)
    print(f"SHEET: {sheet.upper()}")
    print("=" * 100)
    df = pd.read_excel(xls, sheet_name=sheet)
    print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
    print(f"Columns: {df.columns.tolist()}")
    print()
    
    # Show first 30 rows
    print(df.head(30).to_string())
    
    # If there's a Revenue column, show summary
    for col in df.columns:
        if 'revenue' in col.lower() or 'acv' in col.lower() or 'amount' in col.lower():
            print(f"\n{col} Total: ${df[col].sum():,.2f}")
    
    # Show unique accounts if there's an account column
    for col in df.columns:
        if 'account' in col.lower():
            print(f"\nUnique {col}: {df[col].nunique()}")
            print(df[col].value_counts().head(20))
    
    print("\n")

# Now let's do a specific analysis
print("=" * 100)
print("ANALYSIS: Finding Missing Revenue")
print("=" * 100)

# Load both sheets
df_contracts = pd.read_excel(xls, sheet_name='EU Uploaded Contracts')
df_opps = pd.read_excel(xls, sheet_name='Won Opps_To Find Missing Rev')

print(f"\nContracts uploaded: {len(df_contracts)}")
print(f"Won Opps to review: {len(df_opps)}")

# Check for Account in Upload column
if 'Account in Upload?' in df_opps.columns:
    in_upload = df_opps[df_opps['Account in Upload?'] > 0]
    not_in_upload = df_opps[df_opps['Account in Upload?'] == 0]
    
    print(f"\nOpps with Account in Upload: {len(in_upload)}")
    print(f"Opps with Account NOT in Upload: {len(not_in_upload)}")
    
    # Revenue in each category
    rev_col = 'Revenue' if 'Revenue' in df_opps.columns else df_opps.columns[4]
    
    in_upload_rev = in_upload[rev_col].sum()
    not_in_upload_rev = not_in_upload[rev_col].sum()
    
    print(f"\nRevenue in uploaded accounts: ${in_upload_rev:,.2f}")
    print(f"Revenue NOT in uploaded accounts: ${not_in_upload_rev:,.2f}")
    
    print("\n" + "-" * 80)
    print("ACCOUNTS NOT IN CONTRACT UPLOAD (Potential Missing Revenue)")
    print("-" * 80)
    
    # Group by account
    account_col = 'Account Name' if 'Account Name' in not_in_upload.columns else not_in_upload.columns[2]
    
    missing_by_account = not_in_upload.groupby(account_col)[rev_col].agg(['sum', 'count']).sort_values('sum', ascending=False)
    missing_by_account.columns = ['Revenue', 'Opp Count']
    
    print(missing_by_account.head(30).to_string())
    print(f"\nTotal missing revenue: ${missing_by_account['Revenue'].sum():,.2f}")






