#!/usr/bin/env python3
"""
Analyze Loaded Contracts and create DataLoader update file
"""

import pandas as pd
import numpy as np

# Load current contracts
contracts = pd.read_excel('/Users/keiganpesenti/Desktop/Loaded Contracts.xlsx')

print("="*100)
print("CURRENT LOADED CONTRACTS")
print("="*100)
print(f"Rows: {len(contracts)}")
print(f"Columns: {contracts.columns.tolist()}")
print()
print(contracts.head(30).to_string())
print()

# Show all unique accounts
if 'Account' in contracts.columns or 'AccountId' in contracts.columns:
    acct_col = 'Account' if 'Account' in contracts.columns else 'AccountId'
    print(f"\nUnique Accounts: {contracts[acct_col].nunique()}")

# Show sum of monetary columns
for col in contracts.columns:
    if 'value' in col.lower() or 'revenue' in col.lower() or 'amount' in col.lower() or 'acv' in col.lower():
        try:
            total = pd.to_numeric(contracts[col], errors='coerce').sum()
            print(f"{col}: ${total:,.2f}")
        except:
            pass

print("\n\nFull data:")
print(contracts.to_string())




