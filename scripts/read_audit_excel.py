#!/usr/bin/env python3
"""Read and analyze the Closed Won Audit Excel file"""

import pandas as pd
import sys

file_path = '/Users/keiganpesenti/Desktop/Closed Won Audit for BL Attribution.xlsx'

# Get all sheet names
xl = pd.ExcelFile(file_path)
print("=== SHEETS IN FILE ===")
for sheet in xl.sheet_names:
    print(f"  - {sheet}")

print("\n")

# Read each sheet and show summary
for sheet in xl.sheet_names:
    df = pd.read_excel(file_path, sheet_name=sheet)
    print(f"=== {sheet} ===")
    print(f"Rows: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    if len(df) > 0:
        print("\nFirst 5 rows:")
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', None)
        print(df.head(5).to_string())
    print("\n" + "="*80 + "\n")

