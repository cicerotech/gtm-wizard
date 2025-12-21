#!/usr/bin/env python3
"""
Analyze revenue audit file - all tabs
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 400)
pd.set_option('display.max_colwidth', 50)

xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
print('Sheet names:', xl.sheet_names)
print()

for sheet in xl.sheet_names:
    df = pd.read_excel(xl, sheet_name=sheet)
    print('=' * 80)
    print(f'=== {sheet} ===')
    print('=' * 80)
    print(f'Rows: {len(df)}, Columns: {len(df.columns)}')
    print(f'Columns: {df.columns.tolist()}')
    
    # Get totals for revenue columns
    for col in df.columns:
        col_lower = str(col).lower()
        if 'rev' in col_lower or 'acv' in col_lower or 'tcv' in col_lower:
            try:
                total = pd.to_numeric(df[col], errors='coerce').sum()
                print(f'  Total {col}: ${total:,.2f}')
            except:
                pass
    print()
    print('First 10 rows:')
    print(df.head(10).to_string())
    print()

