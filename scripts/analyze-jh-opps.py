#!/usr/bin/env python3
"""
Analyze jh opps.xlsx
"""

import pandas as pd

file_path = '/Users/keiganpesenti/Desktop/jh opps.xlsx'

try:
    xls = pd.ExcelFile(file_path)
    print("=" * 100)
    print(f"FILE: {file_path}")
    print(f"SHEETS: {xls.sheet_names}")
    print("=" * 100)
    
    for sheet in xls.sheet_names:
        print(f"\n{'='*80}")
        print(f"SHEET: {sheet}")
        print(f"{'='*80}")
        df = pd.read_excel(xls, sheet_name=sheet)
        print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
        print(f"Columns: {df.columns.tolist()}")
        print()
        print(df.head(50).to_string())
        
        # Show revenue totals if available
        for col in df.columns:
            if 'revenue' in str(col).lower():
                total = df[col].sum() if df[col].dtype in ['float64', 'int64'] else 'N/A'
                print(f"\n{col} Total: {total}")
        
except Exception as e:
    print(f"Error: {e}")
