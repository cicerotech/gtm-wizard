#!/usr/bin/env python3
"""
Generate Cleaned Account Data Loader CSV for Salesforce
Handles naming convention standardization and deduplication
"""

import pandas as pd
import re
from datetime import datetime

# Input/Output paths
INPUT_FILE = '/Users/keiganpesenti/Desktop/create acct audit.xlsx'
OUTPUT_CSV = '/Users/keiganpesenti/Desktop/EU_Accounts_DataLoader_UPLOAD.csv'
OUTPUT_AUDIT = '/Users/keiganpesenti/Desktop/EU_Accounts_Audit_Report.txt'

# EU Business Lead User IDs from team-registry.js
OWNER_IDS = {
    'Nicola Fratini': '005Wj00000XfSYTIA3',
    'Greg MacHale': '005Wj00000XDuuEIAT',
    'Conor Molloy': '005Wj00000XfSYUIA3',
    'Tom Clancy': '005Wj00000XfSYVIA3',
    # Fix the typo variant
    'Greg Machale': '005Wj00000XDuuEIAT',
}

# Accounts to EXCLUDE (duplicates - keeping the cleaner version)
DUPLICATES_TO_REMOVE = [
    'Bcmglobal ASI limited',  # Keep BCMGlobal ASI Ltd
    'Jacobs Engineering',      # Keep Jacobs Engineering Group
]

# Naming convention fixes
NAME_FIXES = {
    # Lowercase fixes
    'takeda': 'Takeda',
    'norbrook-laboratories': 'Norbrook Laboratories',
    
    # Parenthetical cleanup - keep main name, create cleaner version
    'Beauparc Group (Panda Waste etc)': 'Beauparc Group',
    'MSC (Mediterranean Shipping Company)': 'MSC - Mediterranean Shipping Company',
    'P.J.Carroll (BAT Ireland)': 'P.J. Carroll (BAT Ireland)',
    'Laya Healthcare (AIG)': 'Laya Healthcare',
    
    # Case standardization
    'BCMGlobal ASI Ltd': 'BCMGlobal ASI Ltd',
    'BCMGroup': 'BCM Group',
}

def clean_account_name(name):
    """Apply naming convention fixes"""
    if name in NAME_FIXES:
        return NAME_FIXES[name]
    
    # If all lowercase, title case it
    if name == name.lower():
        return name.title()
    
    return name.strip()

def main():
    print("="*80)
    print("EU ACCOUNTS DATA LOADER CSV GENERATOR")
    print("="*80)
    
    # Read the source file
    xlsx = pd.ExcelFile(INPUT_FILE)
    df = pd.read_excel(xlsx, sheet_name=0)
    
    print(f"\nInput: {len(df)} accounts from 'new accounts' sheet")
    
    # Create audit report
    audit_lines = []
    audit_lines.append("="*80)
    audit_lines.append("EU ACCOUNTS DATA LOADER - AUDIT REPORT")
    audit_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    audit_lines.append("="*80)
    
    # Step 1: Remove duplicates
    audit_lines.append("\n\n--- REMOVED DUPLICATES ---")
    removed = []
    for dupe in DUPLICATES_TO_REMOVE:
        if dupe in df['Account Name'].values:
            removed.append(dupe)
            df = df[df['Account Name'] != dupe]
            audit_lines.append(f"  REMOVED: {dupe}")
    
    print(f"Removed {len(removed)} duplicates")
    
    # Step 2: Standardize lead names (Greg Machale → Greg MacHale)
    audit_lines.append("\n\n--- LEAD NAME FIXES ---")
    lead_col = 'New Business Lead '
    original_machale_count = (df[lead_col] == 'Greg Machale').sum()
    df[lead_col] = df[lead_col].replace('Greg Machale', 'Greg MacHale')
    if original_machale_count > 0:
        audit_lines.append(f"  Fixed {original_machale_count} instances of 'Greg Machale' → 'Greg MacHale'")
        print(f"Fixed {original_machale_count} lead name typos")
    
    # Step 3: Clean account names
    audit_lines.append("\n\n--- ACCOUNT NAME STANDARDIZATION ---")
    df['Original Name'] = df['Account Name']
    df['Account Name'] = df['Account Name'].apply(clean_account_name)
    
    # Log name changes
    name_changes = df[df['Original Name'] != df['Account Name']][['Original Name', 'Account Name']]
    for _, row in name_changes.iterrows():
        audit_lines.append(f"  {row['Original Name']:<50} → {row['Account Name']}")
        print(f"  Renamed: {row['Original Name']} → {row['Account Name']}")
    
    # Step 4: Map to Owner IDs
    audit_lines.append("\n\n--- OWNER ID MAPPING ---")
    df['OwnerId'] = df[lead_col].map(OWNER_IDS)
    
    # Check for unmapped owners
    unmapped = df[df['OwnerId'].isna()]
    if len(unmapped) > 0:
        print(f"\n⚠️  WARNING: {len(unmapped)} accounts have unmapped owners:")
        for _, row in unmapped.iterrows():
            print(f"    {row['Account Name']} - {row[lead_col]}")
            audit_lines.append(f"  ⚠️ UNMAPPED: {row['Account Name']} - Owner: {row[lead_col]}")
    
    # Step 5: Prepare Data Loader format
    # Standard Account fields for Salesforce Data Loader
    upload_df = pd.DataFrame({
        'Name': df['Account Name'],
        'OwnerId': df['OwnerId'],
        'Type': 'Prospect',  # Default type for new accounts
        'Industry': '',      # Leave blank for now
        'Description': 'Created via EU Account Migration - ' + datetime.now().strftime('%Y-%m-%d'),
        'BillingCountry': 'Ireland',  # Default for EU accounts
    })
    
    # Remove any with missing OwnerId
    upload_df = upload_df[upload_df['OwnerId'].notna()]
    
    # Final summary
    audit_lines.append("\n\n--- FINAL SUMMARY ---")
    audit_lines.append(f"  Total accounts to create: {len(upload_df)}")
    audit_lines.append(f"  Duplicates removed: {len(removed)}")
    audit_lines.append(f"  Name fixes applied: {len(name_changes)}")
    
    owner_summary = upload_df.groupby('OwnerId').size()
    audit_lines.append("\n  Owner Distribution:")
    for owner_id, count in owner_summary.items():
        owner_name = [k for k, v in OWNER_IDS.items() if v == owner_id][0]
        audit_lines.append(f"    {owner_name}: {count} accounts")
    
    # Write CSV
    upload_df.to_csv(OUTPUT_CSV, index=False)
    print(f"\n✅ Data Loader CSV saved to: {OUTPUT_CSV}")
    print(f"   Total accounts: {len(upload_df)}")
    
    # Write audit report
    with open(OUTPUT_AUDIT, 'w') as f:
        f.write('\n'.join(audit_lines))
    print(f"\n📋 Audit report saved to: {OUTPUT_AUDIT}")
    
    # Print preview
    print("\n" + "="*80)
    print("PREVIEW OF DATA LOADER CSV (first 15 rows):")
    print("="*80)
    print(upload_df.head(15).to_string())
    
    print("\n" + "="*80)
    print("OWNER DISTRIBUTION:")
    print("="*80)
    for lead, count in df[lead_col].value_counts().items():
        print(f"  {lead}: {count} accounts")

if __name__ == '__main__':
    main()




