#!/usr/bin/env python3
"""
Get Opportunity IDs for the December corrections from 999.xlsx
"""

import pandas as pd
import os

pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 100)

# Load 999.xlsx which has Opportunity IDs
xl_999 = pd.ExcelFile(os.path.expanduser('~/Desktop/999.xlsx'))
df_999 = pd.read_excel(xl_999, sheet_name='Additional JH Closed Won')

print('Looking for Opportunity IDs...')
print()

# The opportunities we need to correct
corrections = [
    ('Etsy Privacy Support Eleanor Power Extension', 69600.00, 6, 'Bundle Allocation'),
    ('Fabiane Arguello 2025 extension', 180960.00, 12, 'No Variance'),
    ('Indeed DPO ODL', 104400.00, 9, 'Bundle Allocation'),
    ('TikTok DSAR Support ODL Extension 1 Tara Bannon', 98601.16, 6, 'Bundle Allocation'),
    ('Uisce Eireann CDS Jamie O\'Gorman extension August December', 78601.60, 5, 'Bundle Allocation'),
]

results = []

for opp_name, new_rev, term, variance_reason in corrections:
    # Search for matching opportunity
    match = df_999[df_999['Opportunity Name'].str.contains(opp_name[:30], case=False, na=False, regex=False)]
    
    if len(match) > 0:
        row = match.iloc[0]
        opp_id = row['Opportunity ID']
        print(f"✓ Found: {opp_name[:50]}")
        print(f"  ID: {opp_id}")
        print(f"  Current Rev in 999: ${row['Revenue']:,.2f}")
        print(f"  New Rev: ${new_rev:,.2f}")
        print()
        
        results.append({
            'Id': opp_id,
            'Revenue': new_rev,
            'Term_Months__c': term,
            'JH_Original_ACV__c': new_rev,
            'ACV_Variance_Reason__c': variance_reason
        })
    else:
        print(f"✗ NOT FOUND: {opp_name[:50]}")
        print(f"  Searching partial...")
        # Try shorter match
        partial = df_999[df_999['Opportunity Name'].str.contains(opp_name[:20], case=False, na=False, regex=False)]
        if len(partial) > 0:
            for _, row in partial.iterrows():
                print(f"  Possible: {row['Opportunity Name'][:60]} - {row['Opportunity ID']}")
        print()

# Create Data Loader file
if len(results) > 0:
    df = pd.DataFrame(results)
    output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/DATALOADER-FINAL-DECEMBER.csv'
    df.to_csv(output_path, index=False)
    print('=' * 80)
    print(f'DATA LOADER FILE CREATED: {output_path}')
    print('=' * 80)
    print()
    print('Contents:')
    print(df.to_string(index=False))
    print()
    print(f'Total records: {len(df)}')
    print()
    print('NEXT STEPS:')
    print('1. Review the file')
    print('2. In Data Loader, select UPDATE operation')
    print('3. Select Opportunity object')
    print('4. Map fields:')
    print('   - Id → Id')
    print('   - Revenue → Revenue')
    print('   - Term_Months__c → Term_Months__c')
    print('   - JH_Original_ACV__c → JH_Original_ACV__c')
    print('   - ACV_Variance_Reason__c → ACV_Variance_Reason__c')
    print('5. Execute update')
else:
    print('No IDs found - manual export from Salesforce needed')

