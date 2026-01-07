#!/usr/bin/env python3
"""
Filter EU-Only Opportunities from All Closed Won Opportunities
Excludes US Pod deals for JH Revenue Reconciliation
"""

import pandas as pd
import os

# --- Configuration ---
EXCEL_FILE = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
CLOSED_WON_SHEET = 'All Closed Won Opportunities'
NOVEMBER_REVENUE_SHEET = 'EU November Revenue by Client'
OUTPUT_DIR = '/Users/keiganpesenti/Desktop/'

def main():
    print("=" * 80)
    print("FILTERING EU-ONLY OPPORTUNITIES")
    print("Excluding US Pod deals for JH Reconciliation")
    print("=" * 80 + "\n")
    
    # Load the Excel file
    xls = pd.ExcelFile(EXCEL_FILE)
    print(f"Available sheets: {xls.sheet_names}\n")
    
    # Load All Closed Won Opportunities
    df_all = pd.read_excel(xls, sheet_name=CLOSED_WON_SHEET)
    print(f"Total Closed Won Opportunities: {len(df_all)}")
    print(f"Columns: {list(df_all.columns)}\n")
    
    # Show first few rows to understand structure
    print("Sample data (first 5 rows):")
    print(df_all.head().to_string())
    print("\n")
    
    # Find the Pod column
    pod_columns = [col for col in df_all.columns if 'pod' in col.lower()]
    print(f"Pod-related columns found: {pod_columns}")
    
    if pod_columns:
        pod_col = pod_columns[0]
        print(f"\nUsing column: '{pod_col}'")
        print(f"Unique Pod values: {df_all[pod_col].unique()}")
        
        # Count by Pod
        print(f"\nOpportunities by Pod:")
        print(df_all[pod_col].value_counts())
        
        # Filter to exclude US
        df_eu = df_all[df_all[pod_col] != 'US'].copy()
        df_us = df_all[df_all[pod_col] == 'US'].copy()
        
        print(f"\n" + "=" * 80)
        print(f"FILTERED RESULTS:")
        print(f"  EU Opportunities: {len(df_eu)}")
        print(f"  US Opportunities (excluded): {len(df_us)}")
        print("=" * 80 + "\n")
    else:
        # Try to find Pod in other ways
        print("No direct Pod column found. Checking all columns for Pod info...")
        for col in df_all.columns:
            if df_all[col].dtype == 'object':
                unique_vals = df_all[col].dropna().unique()
                if 'US' in unique_vals or 'EU' in unique_vals:
                    print(f"  Found in '{col}': {unique_vals[:10]}")
        
        # Assume all are EU if no Pod column
        print("\nAssuming all opportunities are EU (no Pod column found)")
        df_eu = df_all.copy()
        df_us = pd.DataFrame()
    
    # Load November Revenue for comparison
    df_november = pd.read_excel(xls, sheet_name=NOVEMBER_REVENUE_SHEET)
    print("\n" + "=" * 80)
    print("NOVEMBER RUN RATE BY CLIENT")
    print("=" * 80)
    
    # Find the November RR column
    rr_columns = [col for col in df_november.columns if 'november' in col.lower() or 'run' in col.lower() or 'rr' in col.lower()]
    account_columns = [col for col in df_november.columns if 'account' in col.lower() or 'client' in col.lower() or 'name' in col.lower()]
    
    print(f"Columns in November sheet: {list(df_november.columns)}")
    print(f"RR columns: {rr_columns}")
    print(f"Account columns: {account_columns}")
    
    # Display November RR data
    print("\nNovember Revenue Data:")
    print(df_november.to_string())
    
    # Summarize EU opportunities by Account
    print("\n" + "=" * 80)
    print("EU OPPORTUNITIES SUMMARY BY ACCOUNT")
    print("=" * 80 + "\n")
    
    # Find account name column
    account_col = None
    for col in df_eu.columns:
        if 'account' in col.lower() and 'name' in col.lower():
            account_col = col
            break
    
    if not account_col:
        account_col = df_eu.columns[0]  # Fallback to first column
    
    # Find ACV column
    acv_col = None
    for col in df_eu.columns:
        if 'acv' in col.lower():
            acv_col = col
            break
    
    if account_col and acv_col:
        eu_summary = df_eu.groupby(account_col).agg({
            acv_col: ['sum', 'count']
        }).reset_index()
        eu_summary.columns = ['Account', 'Total_ACV', 'Opp_Count']
        eu_summary = eu_summary.sort_values('Total_ACV', ascending=False)
        
        print("EU Opportunities by Account (sorted by ACV):")
        print(eu_summary.to_string(index=False))
        
        # Save EU summary
        eu_summary.to_excel(os.path.join(OUTPUT_DIR, 'EU_Opportunities_Summary.xlsx'), index=False)
        print(f"\nSaved EU summary to: {os.path.join(OUTPUT_DIR, 'EU_Opportunities_Summary.xlsx')}")
    
    # Save full EU opportunities
    df_eu.to_excel(os.path.join(OUTPUT_DIR, 'EU_Only_Closed_Won.xlsx'), index=False)
    print(f"Saved EU opportunities to: {os.path.join(OUTPUT_DIR, 'EU_Only_Closed_Won.xlsx')}")
    
    # Save US opportunities for reference
    if len(df_us) > 0:
        df_us.to_excel(os.path.join(OUTPUT_DIR, 'US_Excluded_Opportunities.xlsx'), index=False)
        print(f"Saved US opportunities to: {os.path.join(OUTPUT_DIR, 'US_Excluded_Opportunities.xlsx')}")
    
    print("\n" + "=" * 80)
    print("FILTER COMPLETE")
    print("=" * 80)
    
    return df_eu, df_november

if __name__ == "__main__":
    main()



