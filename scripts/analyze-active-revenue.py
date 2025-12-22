#!/usr/bin/env python3
"""
Analyze current Active Revenue + Projects from Salesforce
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 200)
pd.set_option('display.width', 300)
pd.set_option('display.max_colwidth', 60)

# Load Active Revenue + Projects
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/Active Revenue + Projects.xls'))
print(f"Sheets: {xl.sheet_names}")
print()

df = pd.read_excel(xl, sheet_name=0)
print(f"Columns: {list(df.columns)}")
print(f"Total rows: {len(df)}")
print()

# Find revenue column
rev_cols = [c for c in df.columns if 'rev' in str(c).lower() or 'amount' in str(c).lower() or 'acv' in str(c).lower()]
print(f"Revenue-related columns: {rev_cols}")
print()

# Print first few rows to understand structure
print("First 5 rows:")
print(df.head())
print()

# Get total revenue
if 'Revenue' in df.columns:
    total_rev = df['Revenue'].sum()
    print(f"TOTAL REVENUE: ${total_rev:,.2f}")
elif len(rev_cols) > 0:
    for col in rev_cols:
        try:
            total = df[col].sum()
            print(f"Total {col}: ${total:,.2f}")
        except:
            pass

print()
print("=" * 80)
print("BREAKDOWN BY POD (if available)")
print("=" * 80)

if 'Pod' in df.columns:
    pod_summary = df.groupby('Pod')['Revenue'].agg(['sum', 'count'])
    pod_summary.columns = ['Total_Revenue', 'Opp_Count']
    pod_summary = pod_summary.sort_values('Total_Revenue', ascending=False)
    print(pod_summary)
    print()
    print(f"GRAND TOTAL: ${pod_summary['Total_Revenue'].sum():,.2f}")

print()
print("=" * 80)
print("TARGET ACCOUNTS - CURRENT STATE")
print("=" * 80)

targets = ['uisce', 'irish water', 'etsy', 'tiktok', 'indeed', 'dropbox']
acct_col = None
for c in df.columns:
    if 'account' in str(c).lower():
        acct_col = c
        break

if acct_col:
    print(f"Using account column: {acct_col}")
    print()
    for t in targets:
        match = df[df[acct_col].str.lower().str.contains(t, na=False, regex=False)]
        if len(match) > 0:
            total = match['Revenue'].sum() if 'Revenue' in match.columns else 0
            print(f"{t.upper()}: {len(match)} opps = ${total:,.2f}")
            for _, row in match.iterrows():
                opp_name = row.get('Opportunity Name', row.get('Opportunity', 'N/A'))
                rev = row.get('Revenue', 0)
                end = row.get('End Date', row.get('Scheduled End Date', 'N/A'))
                print(f"   - {str(opp_name)[:50]}: ${rev:,.2f} | End: {end}")
            print()

