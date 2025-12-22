#!/usr/bin/env python3
"""
Analyze jh opps.xlsx to find opportunities that need the Recurring/Project tag
to redistribute ACV from bundled December opportunities
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 80)

# Load the jh opps file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/jh opps.xlsx'))
print(f"Sheets: {xl.sheet_names}")
print()

# Read first sheet
df = pd.read_excel(xl, sheet_name=0)
print(f"Columns: {list(df.columns)}")
print(f"Total rows: {len(df)}")
print()

# Look for the Recurring/Project/Commit column
rpc_cols = [c for c in df.columns if 'recurring' in c.lower() or 'project' in c.lower() or 'commit' in c.lower()]
print(f"Recurring/Project columns found: {rpc_cols}")
print()

# Get the column name
if len(rpc_cols) > 0:
    rpc_col = rpc_cols[0]
else:
    # Try to find it
    print("Looking for classification column...")
    for col in df.columns:
        print(f"  {col}: {df[col].value_counts().to_dict()}")
    rpc_col = None

if rpc_col:
    print(f"Using classification column: '{rpc_col}'")
    print()
    
    # Split into tagged vs untagged
    has_tag = df[df[rpc_col].notna()]
    no_tag = df[df[rpc_col].isna()]
    
    print(f"WITH Recurring/Project tag (IN reports): {len(has_tag)} opps, ${has_tag['Revenue'].sum():,.2f}")
    print(f"WITHOUT tag (NOT in reports): {len(no_tag)} opps, ${no_tag['Revenue'].sum():,.2f}")
    print()
    
    # The accounts we're correcting
    target_accounts = ['uisce', 'etsy', 'tiktok', 'indeed', 'dropbox']
    
    # The amounts we're reducing
    reductions = {
        'uisce': 248787.22,   # Jamie O'Gorman
        'etsy': 189769.68,    # Eleanor Power
        'tiktok': 100278.58,  # DSAR Support ODL
        'indeed': 59165.98,   # DPO ODL
    }
    
    print('=' * 120)
    print('OPPORTUNITIES WITHOUT TAG - CANDIDATES FOR REDISTRIBUTION')
    print('=' * 120)
    print()
    
    for acct in target_accounts:
        acct_no_tag = no_tag[no_tag['Account Name'].str.lower().str.contains(acct, na=False, regex=False)]
        
        if len(acct_no_tag) > 0:
            total = acct_no_tag['Revenue'].sum()
            reduction = reductions.get(acct, 0)
            
            print(f"📋 {acct.upper()}: {len(acct_no_tag)} opps without tag = ${total:,.2f}")
            if reduction > 0:
                print(f"   Reduction needed: ${reduction:,.2f}")
                if total >= reduction:
                    print(f"   ✅ SUFFICIENT - adding tags will offset reduction")
                else:
                    print(f"   ⚠️ PARTIAL - ${total:,.2f} available of ${reduction:,.2f} needed")
            print()
            
            print("   Opportunities to TAG:")
            for _, row in acct_no_tag.iterrows():
                opp_id = row.get('Opportunity ID', 'N/A')
                opp_name = row.get('Opportunity Name', 'N/A')
                rev = row.get('Revenue', 0)
                print(f"   - {opp_name[:50]}")
                print(f"     ID: {opp_id} | Rev: ${rev:,.2f}")
            print()
        else:
            print(f"○ {acct.upper()}: No untagged opportunities found")
            print()
    
    # Create the Data Loader file for adding tags
    print('=' * 120)
    print('DATA LOADER FILE: Add Recurring/Project Tags')
    print('=' * 120)
    print()
    
    # Filter to target accounts
    redistribution_opps = no_tag[no_tag['Account Name'].str.lower().str.contains('|'.join(target_accounts), na=False, regex=True)]
    
    if len(redistribution_opps) > 0:
        # Create output
        output_data = []
        for _, row in redistribution_opps.iterrows():
            output_data.append({
                'Id': row.get('Opportunity ID', ''),
                'Opportunity_Name': row.get('Opportunity Name', ''),
                'Account_Name': row.get('Account Name', ''),
                'Revenue': row.get('Revenue', 0),
                'Recurring_Project_or_Commit__c': 'Recurring'  # Add tag
            })
        
        output_df = pd.DataFrame(output_data)
        
        # Summary
        print(f"Total opps to tag: {len(output_df)}")
        print(f"Total revenue to bring into reports: ${output_df['Revenue'].sum():,.2f}")
        print()
        
        # Save
        output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/DATALOADER-ADD-TAGS.csv'
        output_df[['Id', 'Recurring_Project_or_Commit__c']].to_csv(output_path, index=False)
        print(f"Saved: {output_path}")
        print()
        
        # Detail file
        detail_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/tag-additions-detail.csv'
        output_df.to_csv(detail_path, index=False)
        print(f"Detail saved: {detail_path}")
        print()
        
        print("SUMMARY BY ACCOUNT:")
        for acct in target_accounts:
            acct_opps = output_df[output_df['Account_Name'].str.lower().str.contains(acct, na=False, regex=False)]
            if len(acct_opps) > 0:
                print(f"  {acct.upper()}: {len(acct_opps)} opps, ${acct_opps['Revenue'].sum():,.2f}")
else:
    print("Could not find classification column - printing all data")
    print(df.head(20))

