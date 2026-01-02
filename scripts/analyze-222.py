#!/usr/bin/env python3
"""
Analyze 222.xlsx - likely the Contracts and Won Opps file
"""

import pandas as pd

# Try 222.xlsx first (most recently modified)
file_path = '/Users/keiganpesenti/Desktop/222.xlsx'

try:
    xls = pd.ExcelFile(file_path)
    print("=" * 100)
    print(f"FILE: {file_path}")
    print(f"SHEETS: {xls.sheet_names}")
    print("=" * 100)
    
    for sheet in xls.sheet_names:
        print(f"\n=== {sheet} ===")
        df = pd.read_excel(xls, sheet_name=sheet)
        print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
        print(f"Columns: {df.columns.tolist()[:10]}")
        print(df.head(10).to_string())
        
except Exception as e:
    print(f"Error with 222.xlsx: {e}")
    
# Also try JH new contracts.xlsx
file_path2 = '/Users/keiganpesenti/Desktop/JH new contracts.xlsx'
try:
    xls2 = pd.ExcelFile(file_path2)
    print("\n" + "=" * 100)
    print(f"FILE: {file_path2}")
    print(f"SHEETS: {xls2.sheet_names}")
    print("=" * 100)
    
    for sheet in xls2.sheet_names:
        print(f"\n=== {sheet} ===")
        df = pd.read_excel(xls2, sheet_name=sheet)
        print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
        print(f"Columns: {df.columns.tolist()[:10]}")
        print(df.head(10).to_string())
        
except Exception as e:
    print(f"Error with JH new contracts.xlsx: {e}")


