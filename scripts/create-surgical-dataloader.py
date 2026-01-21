#!/usr/bin/env python3
"""
Create DataLoader file from SURGICAL extraction
Includes source citations for validation
"""

import pandas as pd
from datetime import datetime

# Load the surgical extraction
INPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Contracts_SURGICAL.xlsx'
OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader_VALIDATED.xlsx'
OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader_VALIDATED.csv'

# Folder name to SF Account name mapping
FOLDER_TO_SF = {
    'BOI': 'Bank of Ireland',
    'OpenAI': 'OpenAi',
    'Stripe': 'Stripe Payments Europe Limited',
    'AirBnB': 'Airbnb',
    'ESB': 'ESB NI/Electric Ireland',
    'Irish Water : Uisce Eireann': 'Uisce Eireann (Irish Water)',
    'Indeed': 'Indeed Ireland Operations Limited',
    'Etsy': 'Etsy Ireland UC',
    'TikTok': 'Tiktok Information Technologies UK Limited',
    'Tinder': 'Tinder LLC',
    'Dropbox': 'Dropbox International Unlimited Company',
    'Northern Trust': 'Northern Trust Management Services (Ireland) Limited',
    'Consensys': 'Consensys',
    'Commscope': 'CommScope Technologies LLC',
    'Gilead': 'Gilead Sciences',
    'Glanbia': 'Glanbia Management Services Limited',
    'Taoglas': 'Taoglas Limited',
    'Teamwork': 'Teamwork Crew Limited T/A Teamwork.com',
    'Perrigo': 'Perrigo Pharma',
    'Coillte': 'Coillte',
    'Udemy': 'Udemy Ireland Limited',
    'Kellanova': 'Kellanova (Ireland)',
    'Sisk': 'Sisk Group',
    'Orsted': 'Orsted',
    'Aryza': 'Aryza',
    'Airship': 'Airship Group Inc',
    'Datalex': 'Datalex (Ireland) Limited',
    'Aramark': 'Aramark Ireland',
    'Comisiun na Mean': 'Coimisiun na Mean',
}

# Product line detection
def detect_product_line(contract_name):
    name_lower = contract_name.lower()
    products = []
    
    if any(kw in name_lower for kw in ['privacy', 'gdpr', 'dsar', 'dppo']):
        products.append('Privacy')
    if any(kw in name_lower for kw in ['litigation', 'dispute', 'claims']):
        products.append('Litigation')
    if any(kw in name_lower for kw in ['compliance', 'f&p', 'fitness']):
        products.append('Compliance')
    if any(kw in name_lower for kw in ['contract', 'sow', 'agreement', 'msa']):
        products.append('Contracting')
    
    if not products:
        products = ['Contracting']  # Default
    
    return ';'.join(products)

def main():
    print("=" * 80)
    print("CREATING VALIDATED DATALOADER FROM SURGICAL EXTRACTION")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80 + "\n")
    
    # Load surgical extraction
    df = pd.read_excel(INPUT_FILE)
    print(f"Loaded {len(df)} contracts\n")
    
    # Prepare DataLoader format
    records = []
    
    for _, row in df.iterrows():
        # Calculate term if not present
        term_months = row.get('Term_Months')
        if pd.isna(term_months):
            term_months = 12  # Default
        
        # Build contract name
        contract_name = f"{row['Client']} - {row['Contract'][:80]}"
        
        # Get product line
        product_line = detect_product_line(row['Contract'])
        
        record = {
            # Salesforce Contract Fields
            'Contract_Name_Campfire__c': contract_name,
            'SF_Account_Name': FOLDER_TO_SF.get(row['Client'], row['Client']),
            'AccountId': '',  # To be filled from SF lookup
            'StartDate': row.get('Start_Date') or datetime.now().strftime('%Y-%m-%d'),
            'ContractTerm': int(term_months),
            'Contract_Type__c': 'Recurring',
            'Status': 'Draft',
            'OwnerId': '',  # To be filled from SF lookup
            'AI_Enabled__c': 'TRUE',
            'Currency__c': 'USD',
            
            # Monetary fields
            'Contract_Value__c': row.get('ACV_USD', 0) * (term_months / 12) if pd.notna(row.get('ACV_USD')) else '',
            'Annualized_Revenue__c': row.get('ACV_USD', '') if pd.notna(row.get('ACV_USD')) else '',
            'Amount__c': row.get('ACV_USD', 0) / 12 if pd.notna(row.get('ACV_USD')) else '',
            
            # Product fields
            'Product_Line__c': product_line,
            'Parent_Product__c': product_line.split(';')[0],
            
            # Source citations for validation
            'Source_Start_Date': row.get('Start_Date_Source', ''),
            'Source_End_Date': row.get('End_Date_Source', ''),
            'Source_Term': row.get('Term_Source', ''),
            'Source_ACV': row.get('ACV_Calculation', ''),
            'Source_Rate': row.get('Hourly_Rate_Source', ''),
            'Source_Hours': row.get('Weekly_Hours_Source', ''),
            
            # Validation flags
            'Has_ACV': 'YES' if pd.notna(row.get('ACV_USD')) else 'NO',
            'Has_Start_Date': 'YES' if pd.notna(row.get('Start_Date')) else 'NO',
            'Needs_Manual_Review': 'YES' if pd.isna(row.get('ACV_USD')) or pd.isna(row.get('Start_Date')) else 'NO',
        }
        
        records.append(record)
    
    df_output = pd.DataFrame(records)
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    total = len(df_output)
    ready = len(df_output[df_output['Needs_Manual_Review'] == 'NO'])
    needs_review = len(df_output[df_output['Needs_Manual_Review'] == 'YES'])
    
    print(f"Total contracts: {total}")
    print(f"Ready for upload: {ready}")
    print(f"Needs manual review: {needs_review}")
    
    total_acv = df_output['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
    print(f"\nTotal ACV: ${total_acv:,.2f}")
    
    print("\nBy Client:")
    for client in df_output['SF_Account_Name'].unique():
        client_df = df_output[df_output['SF_Account_Name'] == client]
        client_acv = client_df['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
        ready_count = len(client_df[client_df['Needs_Manual_Review'] == 'NO'])
        total_count = len(client_df)
        status = "✓" if ready_count == total_count else f"⚠️  {needs_review} need review"
        print(f"  {client}: {total_count} contracts, ${client_acv:,.0f} {status if ready_count < total_count else ''}")
    
    # Save files
    print("\n" + "=" * 80)
    print("SAVING FILES")
    print("=" * 80)
    
    # Create Excel with multiple sheets
    with pd.ExcelWriter(OUTPUT_XLSX) as writer:
        # All contracts
        df_output.to_excel(writer, sheet_name='All Contracts', index=False)
        
        # Ready for upload (no manual review needed)
        df_ready = df_output[df_output['Needs_Manual_Review'] == 'NO']
        df_ready.to_excel(writer, sheet_name='Ready for Upload', index=False)
        
        # Needs manual review
        df_review = df_output[df_output['Needs_Manual_Review'] == 'YES']
        df_review.to_excel(writer, sheet_name='Needs Manual Review', index=False)
    
    print(f"Excel: {OUTPUT_XLSX}")
    
    # Save CSV (DataLoader format - only required fields)
    dataloader_columns = [
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
    
    df_csv = df_output[df_output['Needs_Manual_Review'] == 'NO'][dataloader_columns]
    df_csv.to_csv(OUTPUT_CSV, index=False)
    print(f"CSV (ready only): {OUTPUT_CSV}")
    
    print("\n" + "=" * 80)
    print("NEXT STEPS")
    print("=" * 80)
    print("""
1. VALIDATE SOURCE CITATIONS:
   - Review 'Source_*' columns in Excel to confirm extracted values
   - Each value has the exact text from the contract

2. MANUAL REVIEW:
   - Check 'Needs Manual Review' sheet for contracts missing data
   - Open original PDFs and extract values manually

3. ADD ACCOUNT IDs:
   - Query Salesforce for Account IDs
   - Fill 'AccountId' column with 18-character SF IDs

4. ADD OWNER ID:
   - Get the default Contract Owner User ID from Salesforce
   - Fill 'OwnerId' column

5. UPLOAD:
   - Use 'Ready for Upload' sheet or CSV
   - SF Data Loader → Contract → Insert
""")

if __name__ == "__main__":
    main()




