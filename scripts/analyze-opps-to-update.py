#!/usr/bin/env python3
"""
Analyze JH opps to update.xlsx
"""

import pandas as pd

file_path = '/Users/keiganpesenti/Desktop/JH opps to update.xlsx'

try:
    xls = pd.ExcelFile(file_path)
    print("="*120)
    print(f"FILE: {file_path}")
    print(f"SHEETS: {xls.sheet_names}")
    print("="*120)
    
    for sheet in xls.sheet_names:
        print(f"\n{'='*100}")
        print(f"SHEET: {sheet}")
        print(f"{'='*100}")
        df = pd.read_excel(xls, sheet_name=sheet)
        print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
        print(f"Columns: {df.columns.tolist()}")
        print()
        print(df.to_string())
        
except Exception as e:
    print(f"Error: {e}")



