#!/usr/bin/env python3
"""
Create Full Contracts DataLoader Upload (Offline Mode)
Uses Account IDs from EU Opportunities file
"""

import pandas as pd
import os
from datetime import datetime

SURGICAL_FILE = '/Users/keiganpesenti/Desktop/JH_Contracts_SURGICAL.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_FULL_UPLOAD.csv'
OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_FULL_UPLOAD.xlsx'

# Default Owner ID (placeholder - user should verify)
DEFAULT_OWNER_ID = '005Wj000002YqYQIA0'

# Mapping folder names to likely SF account name patterns
FOLDER_TO_SF_PATTERN = {
    'BOI': 'Bank of Ireland',
    'OpenAI': 'OpenAi',
    'Stripe': 'Stripe',
    'AirBnB': 'Airbnb',
    'ESB': 'ESB',
    'Irish Water : Uisce Eireann': 'Uisce Eireann',
    'Indeed': 'Indeed',
    'Etsy': 'Etsy',
    'TikTok': 'Tiktok',
    'Tinder': 'Tinder',
    'Dropbox': 'Dropbox',
    'Northern Trust': 'Northern Trust',
    'Consensys': 'Consensys',
    'Commscope': 'CommScope',
    'Gilead': 'Gilead',
    'Glanbia': 'Glanbia',
    'Taoglas': 'Taoglas',
    'Teamwork': 'Teamwork',
    'Perrigo': 'Perrigo',
    'Coillte': 'Coillte',
    'Udemy': 'Udemy',
    'Kellanova': 'Kellanova',
    'Sisk': 'Sisk',
    'Orsted': 'Orsted',
    'Aryza': 'Aryza',
    'Airship': 'Airship',
    'Datalex': 'Datalex',
    'Aramark': 'Aramark',
    'Comisiun na Mean': 'Coimisiun',
}

def load_account_ids():
    """Load Account IDs from EU Opportunities file"""
    account_map = {}
    
    try:
        df = pd.read_excel(EU_OPPS_FILE)
        print(f"Loaded {len(df)} opportunities from EU file")
        print(f"Columns: {df.columns.tolist()}")
        
        # Find Account ID and Account Name columns
        id_col = None
        name_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if 'account' in col_lower and 'id' in col_lower:
                id_col = col
            elif 'account' in col_lower and 'name' in col_lower:
                name_col = col
        
        if not id_col:
            # Try common patterns
            for col in df.columns:
                if 'AccountId' in col or 'Account ID' in col:
                    id_col = col
                    break
        
        if not name_col:
            for col in df.columns:
                if 'Account Name' in col:
                    name_col = col
                    break
        
        print(f"Using ID column: {id_col}")
        print(f"Using Name column: {name_col}")
        
        if id_col and name_col:
            # Get unique account ID/name pairs
            accounts = df[[name_col, id_col]].drop_duplicates()
            for _, row in accounts.iterrows():
                name = str(row[name_col]).strip() if pd.notna(row[name_col]) else ''
                acc_id = str(row[id_col]).strip() if pd.notna(row[id_col]) else ''
                if name and acc_id and acc_id != 'nan':
                    account_map[name] = acc_id
            
            print(f"Found {len(account_map)} unique accounts")
    except Exception as e:
        print(f"Error loading EU file: {e}")
    
    return account_map

def find_account_id(folder_name, account_map):
    """Find Account ID for a folder name using fuzzy matching"""
    search_name = FOLDER_TO_SF_PATTERN.get(folder_name, folder_name)
    
    # Exact match
    if search_name in account_map:
        return account_map[search_name], search_name
    
    # Partial match
    for sf_name, acc_id in account_map.items():
        if search_name.lower() in sf_name.lower() or sf_name.lower() in search_name.lower():
            return acc_id, sf_name
    
    # Try folder name directly
    for sf_name, acc_id in account_map.items():
        if folder_name.lower() in sf_name.lower() or sf_name.lower() in folder_name.lower():
            return acc_id, sf_name
    
    return '', 'NOT FOUND'

def detect_product_line(contract_name):
    """Detect product line from contract name"""
    name_lower = contract_name.lower()
    
    if any(kw in name_lower for kw in ['privacy', 'gdpr', 'dsar', 'dppo', 'data protection']):
        return 'Privacy'
    elif any(kw in name_lower for kw in ['litigation', 'dispute', 'claims']):
        return 'Litigation'
    elif any(kw in name_lower for kw in ['compliance', 'f&p', 'fitness', 'probity']):
        return 'Compliance'
    elif any(kw in name_lower for kw in ['m&a', 'merger', 'acquisition']):
        return 'Augmented-M&A'
    else:
        return 'Contracting'

def main():
    print("=" * 100)
    print("CREATING FULL CONTRACTS DATALOADER UPLOAD")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100 + "\n")
    
    # Load Account IDs
    print("Loading Account IDs from EU Opportunities file...")
    account_map = load_account_ids()
    print()
    
    # Load surgical extraction
    print("Loading surgical extraction data...")
    df = pd.read_excel(SURGICAL_FILE)
    print(f"Loaded {len(df)} contracts\n")
    
    # Create upload records
    upload_records = []
    
    for _, row in df.iterrows():
        client = row['Client']
        contract = row['Contract']
        
        # Find Account ID
        account_id, sf_name = find_account_id(client, account_map)
        
        # Check if we have ACV
        has_acv = pd.notna(row.get('ACV_USD')) and row['ACV_USD'] > 0
        
        # Build contract name
        contract_name = f"{client} - {contract}"
        if len(contract_name) > 80:
            contract_name = contract_name[:77] + '...'
        
        # Add [Review ACV] if no value
        if not has_acv:
            contract_name = f"[Review ACV] {contract_name}"
            if len(contract_name) > 80:
                contract_name = contract_name[:77] + '...'
        
        # Determine term
        term_months = row.get('Term_Months')
        if pd.isna(term_months) or term_months <= 0:
            term_months = 12
        else:
            term_months = int(term_months)
        
        # Calculate values
        acv_usd = float(row['ACV_USD']) if has_acv else 0
        monthly_amount = acv_usd / 12 if acv_usd > 0 else 0
        total_value = acv_usd * (term_months / 12) if acv_usd > 0 else 0
        
        # Start date
        start_date = row.get('Start_Date')
        if pd.isna(start_date) or not start_date:
            start_date = datetime.now().strftime('%Y-%m-%d')
        
        # Product line
        product_line = detect_product_line(contract)
        
        record = {
            # Required SF Fields
            'Contract_Name_Campfire__c': contract_name,
            'AccountId': account_id,
            'StartDate': start_date,
            'ContractTerm': term_months,
            'Contract_Type__c': 'Recurring',
            'Status': 'Draft',
            'OwnerId': DEFAULT_OWNER_ID,
            'AI_Enabled__c': 'TRUE',
            'Currency__c': 'USD',
            
            # Monetary Fields
            'Contract_Value__c': round(total_value, 2) if total_value > 0 else '',
            'Annualized_Revenue__c': round(acv_usd, 2) if acv_usd > 0 else '',
            'Amount__c': round(monthly_amount, 2) if monthly_amount > 0 else '',
            
            # Product Fields
            'Product_Line__c': product_line,
            'Parent_Product__c': product_line,
            
            # Reference columns (remove before upload)
            '_Client_Folder': client,
            '_SF_Account_Name': sf_name,
            '_Has_ACV': 'YES' if has_acv else 'NO',
            '_Source': row.get('ACV_Calculation', ''),
        }
        
        upload_records.append(record)
    
    df_upload = pd.DataFrame(upload_records)
    
    # Summary
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    
    total = len(df_upload)
    with_acv = len(df_upload[df_upload['_Has_ACV'] == 'YES'])
    without_acv = len(df_upload[df_upload['_Has_ACV'] == 'NO'])
    with_account = len(df_upload[df_upload['AccountId'] != ''])
    without_account = len(df_upload[df_upload['AccountId'] == ''])
    
    print(f"Total contracts: {total}")
    print(f"With ACV: {with_acv}")
    print(f"Without ACV (marked 'Review ACV'): {without_acv}")
    print(f"With Account ID: {with_account}")
    print(f"Missing Account ID: {without_account}")
    
    total_acv = df_upload['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
    print(f"\nTotal ACV: ${total_acv:,.2f}")
    
    # By client
    print("\n" + "-" * 80)
    print("CONTRACTS BY CLIENT")
    print("-" * 80)
    
    for client in df_upload['_Client_Folder'].unique():
        client_df = df_upload[df_upload['_Client_Folder'] == client]
        count = len(client_df)
        with_val = len(client_df[client_df['_Has_ACV'] == 'YES'])
        acv = client_df['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
        acc_id = client_df['AccountId'].iloc[0]
        
        status = "✓" if with_val == count else f"⚠️ {count - with_val} need review"
        acc_status = "✓" if acc_id else "✗ Missing ID"
        
        print(f"{client}: {count} contracts, ${acv:,.0f} ACV {status} {acc_status}")
    
    # Save files
    print("\n" + "=" * 100)
    print("SAVING FILES")
    print("=" * 100)
    
    # DataLoader columns only
    dl_columns = [
        'Contract_Name_Campfire__c',
        'AccountId',
        'StartDate',
        'ContractTerm',
        'Contract_Type__c',
        'Status',
        'OwnerId',
        'AI_Enabled__c',
        'Currency__c',
        'Contract_Value__c',
        'Annualized_Revenue__c',
        'Amount__c',
        'Product_Line__c',
        'Parent_Product__c',
    ]
    
    df_csv = df_upload[dl_columns].copy()
    df_csv.to_csv(OUTPUT_CSV, index=False)
    print(f"CSV: {OUTPUT_CSV}")
    
    # Full Excel with tracking columns
    with pd.ExcelWriter(OUTPUT_XLSX) as writer:
        df_upload.to_excel(writer, sheet_name='All Contracts', index=False)
        df_upload[df_upload['_Has_ACV'] == 'NO'].to_excel(writer, sheet_name='Review ACV', index=False)
        if without_account > 0:
            df_upload[df_upload['AccountId'] == ''].to_excel(writer, sheet_name='Missing Account ID', index=False)
    
    print(f"Excel: {OUTPUT_XLSX}")
    
    # Missing Account IDs
    if without_account > 0:
        print("\n" + "=" * 100)
        print("⚠️  MISSING ACCOUNT IDs - MANUAL LOOKUP REQUIRED")
        print("=" * 100)
        missing = df_upload[df_upload['AccountId'] == '']['_Client_Folder'].unique()
        for client in missing:
            print(f"  - {client}")
        print("\nQuery Salesforce: SELECT Id, Name FROM Account WHERE Name LIKE '%[name]%'")
    
    print("\n" + "=" * 100)
    print("READY FOR UPLOAD")
    print("=" * 100)
    print(f"""
Use: {OUTPUT_CSV}

Salesforce Data Loader:
- Object: Contract
- Operation: Insert
- Map columns to API field names

IMPORTANT:
1. Verify OwnerId is correct (current: {DEFAULT_OWNER_ID})
2. Fill in any missing AccountId values
3. Contracts marked "[Review ACV]" need manual value entry after upload
""")

if __name__ == "__main__":
    main()




