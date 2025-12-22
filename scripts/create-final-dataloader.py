#!/usr/bin/env python3
"""
Create final Data Loader CSV for December expiring corrections
Based on validated JH data from screenshots
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 80)

# Load data
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')

print('=' * 100)
print('FINAL DATA LOADER CREATION')
print('=' * 100)
print()

# JH Validated values from screenshots
jh_validated = {
    # Uisce Éireann
    'uisce eireann cds jamie o\'gorman extension august december': {
        'new_revenue': 78601.60,
        'term': 5,
        'end_date': '12/28/2025',
        'jh_original_acv': 78601.60,
        'variance_reason': 'Bundle Allocation'
    },
    # Already correct - no change
    'uisce eireann cds luke sexton extension august december': None,
    'uisce eireann cds amal elbay extension august december': None,
    
    # Etsy
    'etsy privacy support eleanor power extension': {
        'new_revenue': 69600.00,
        'term': 6,
        'end_date': '12/31/2025',
        'jh_original_acv': 69600.00,
        'variance_reason': 'Bundle Allocation'
    },
    
    # TikTok
    'tiktok dsar support odl extension 1 tara bannon': {
        'new_revenue': 98601.16,
        'term': 6,
        'end_date': '12/31/2025',
        'jh_original_acv': 98601.16,
        'variance_reason': 'Bundle Allocation'
    },
    
    # Indeed
    'indeed dpo odl': {
        'new_revenue': 104400.00,
        'term': 9,
        'end_date': '12/24/2025',
        'jh_original_acv': 104400.00,
        'variance_reason': 'Bundle Allocation'
    },
    
    # Dropbox - INCREASE
    'fabiane arguello 2025 extension': {
        'new_revenue': 180960.00,
        'term': 12,
        'end_date': '12/31/2025',
        'jh_original_acv': 180960.00,
        'variance_reason': 'No Variance'
    },
    # Dropbox - already correct
    'fabiane arguello 2025 expansion hours increase': None
}

# Build corrections list
corrections = []

for _, row in eudia_dec.iterrows():
    opp_name = row['Opportunity Name']
    opp_name_lower = opp_name.lower()
    
    # Check if this opportunity needs correction
    for pattern, correction in jh_validated.items():
        if pattern in opp_name_lower or opp_name_lower in pattern:
            if correction is not None:
                current_rev = row['Revenue']
                opp_id = row.get('Opportunity ID', row.get('Opp ID', ''))
                
                corrections.append({
                    'Opportunity_ID': opp_id,
                    'Opportunity_Name': opp_name,
                    'Account_Name': row['Account Name'],
                    'Current_Revenue': current_rev,
                    'New_Revenue': correction['new_revenue'],
                    'Change': correction['new_revenue'] - current_rev,
                    'Term_Months': correction['term'],
                    'End_Date': correction['end_date'],
                    'JH_Original_ACV__c': correction['jh_original_acv'],
                    'ACV_Variance_Reason__c': correction['variance_reason']
                })
                print(f"✓ {opp_name[:50]}")
                print(f"   ${current_rev:,.2f} → ${correction['new_revenue']:,.2f} ({correction['new_revenue'] - current_rev:+,.2f})")
            else:
                print(f"○ {opp_name[:50]} - Already aligned, skipping")
            break

print()
print('=' * 100)
print('SUMMARY')
print('=' * 100)

df = pd.DataFrame(corrections)

if len(df) > 0:
    total_change = df['Change'].sum()
    reductions = df[df['Change'] < 0]['Change'].sum()
    increases = df[df['Change'] > 0]['Change'].sum()
    
    print(f"Total corrections: {len(df)}")
    print(f"Total reductions: ${reductions:,.2f}")
    print(f"Total increases: ${increases:,.2f}")
    print(f"Net change: ${total_change:,.2f}")
    print()
    
    # Display the corrections
    print('CORRECTIONS:')
    print('-' * 100)
    for _, row in df.iterrows():
        print(f"{row['Account_Name'][:30]}: {row['Opportunity_Name'][:40]}")
        print(f"   ${row['Current_Revenue']:,.2f} → ${row['New_Revenue']:,.2f} ({row['Change']:+,.2f})")
        print(f"   ID: {row['Opportunity_ID']}")
        print()
    
    # Create Data Loader CSV
    output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'
    
    # Full details CSV for reference
    df.to_csv(output_dir + 'december-corrections-detail.csv', index=False)
    print(f"Saved detail: {output_dir}december-corrections-detail.csv")
    
    # Data Loader format - if we have IDs
    has_ids = df['Opportunity_ID'].notna().all() and (df['Opportunity_ID'] != '').all()
    
    if has_ids:
        # Create proper Data Loader format
        dataloader_df = df[['Opportunity_ID', 'New_Revenue', 'Term_Months', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']].copy()
        dataloader_df.columns = ['Id', 'Revenue', 'Term_Months__c', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']
        dataloader_df.to_csv(output_dir + 'DATALOADER-DECEMBER-FIXES.csv', index=False)
        print(f"Saved Data Loader file: {output_dir}DATALOADER-DECEMBER-FIXES.csv")
    else:
        print()
        print("⚠️ Opportunity IDs not found in source data.")
        print("   You'll need to export the IDs from Salesforce and match them.")
        print("   The detail CSV has opportunity names to match on.")
        
        # Create a lookup-ready file
        lookup_df = df[['Opportunity_Name', 'Account_Name', 'New_Revenue', 'Term_Months', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']].copy()
        lookup_df.columns = ['Opportunity Name (MATCH KEY)', 'Account Name', 'Revenue (NEW VALUE)', 'Term_Months__c', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']
        lookup_df.to_csv(output_dir + 'DATALOADER-LOOKUP-BY-NAME.csv', index=False)
        print(f"Saved lookup file: {output_dir}DATALOADER-LOOKUP-BY-NAME.csv")
        print()
        print("To create final Data Loader file:")
        print("1. Export Opportunity ID + Opportunity Name from Salesforce")
        print("2. VLOOKUP to add IDs to this file")
        print("3. Import with Revenue, Term_Months__c updates")
else:
    print("No corrections needed!")

print()
print('=' * 100)
print('DONE')
print('=' * 100)
