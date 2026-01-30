#!/usr/bin/env python3
import pandas as pd
import os

excel_path = os.path.expanduser("~/Desktop/MARKETING DATA REFERENCE.xlsx")

# Read all sheets
xl = pd.ExcelFile(excel_path)
print("Sheet names:", xl.sheet_names)

for sheet in xl.sheet_names:
    df = pd.read_excel(excel_path, sheet_name=sheet)
    print(f"\n{'='*60}")
    print(f"SHEET: {sheet}")
    print(f"Columns: {list(df.columns)}")
    print(f"Rows: {len(df)}")
    print("Sample data:")
    print(df.head(3).to_string())
