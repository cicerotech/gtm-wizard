#!/usr/bin/env python3
"""
Create Final Contracts Upload with Account IDs from screenshot
Also prepares ContentVersion upload for attaching PDFs
"""

import pandas as pd
import os
from datetime import datetime

SURGICAL_FILE = '/Users/keiganpesenti/Desktop/JH_Contracts_SURGICAL.xlsx'
CONTRACTS_DIR = '/Users/keiganpesenti/Desktop/Client Contracts/'
OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_FINAL_UPLOAD.csv'
OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_FINAL_UPLOAD.xlsx'
OUTPUT_CONTENT_CSV = '/Users/keiganpesenti/Desktop/JH_ContentVersion_UPLOAD.csv'

# Default Owner ID
DEFAULT_OWNER_ID = '005Wj000002YqYQIA0'

# Account IDs from Salesforce screenshot
ACCOUNT_IDS = {
    'Uisce Eireann (Irish Water)': '001Wj00000mCFtOIAW',
    'Irish Water : Uisce Eireann': '001Wj00000mCFtOIAW',
    'Udemy Ireland Limited': '001Wj00000bWBIEIAW',
    'Tinder LLC': '001Wj00000ZDXTRIA5',
    'Tinder': '001Wj00000ZDXTRIA5',
    'Tiktok Information Technologies UK Limited': '001Wj00000SFiOvIAL',
    'TikTok': '001Wj00000SFiOvIAL',
    'Teamwork Crew Limited T/A Teamwork.com': '001Wj00000mCFtPIAW',
    'Teamwork': '001Wj00000mCFtPIAW',
    'Taoglas Limited': '001Wj00000mCFs0IAG',
    'Taoglas': '001Wj00000mCFs0IAG',
    'Stripe Payments Europe Limited': '001Wj00000c9oD6IAI',
    'Stripe': '001Wj00000c9oD6IAI',
    'Sisk Group': '001Wj00000mCFrMIAW',
    'Sisk': '001Wj00000mCFrMIAW',
    'Perrigo Pharma': '001Wj00000ZDPUIIA5',
    'Perrigo': '001Wj00000ZDPUIIA5',
    'Orsted': '001Wj00000mCFrIIAW',
    'NTMA': '001Wj00000mCFr6IAG',
    'Northern Trust Management Services (Ireland) Limited': '001Hp00003klrKmIAK',
    'Northern Trust': '001Hp00003klrKmIAK',
    'Kingspan': '001Wj00000hkk0zIAA',
    'Kellanova (Ireland)': '001Wj00000mCFtMIAW',
    'Kellanova': '001Wj00000mCFtMIAW',
    'Indeed Ireland Operations Limited': '001Wj00000mCFs5IAG',
    'Indeed': '001Wj00000mCFs5IAG',
    'Glanbia Management Services Limited': '001Wj00000mCFrcIAG',
    'Glanbia': '001Wj00000mCFrcIAG',
    'ESB NI/Electric Ireland': '001Wj00000mCFsUIAW',
    'ESB': '001Wj00000mCFsUIAW',
    'Dropbox International Unlimited Company': '001Hp00003klrDMIA0',
    'Dropbox': '001Hp00003klrDMIA0',
    'Datalex (Ireland) Limited': '001Wj00000mCFsBIAW',
    'Datalex': '001Wj00000mCFsBIAW',
    'Consensys': '001Wj00000mCFsHIAW',
    'CommScope Technologies LLC': '001Wj00000mCFqtIAG',
    'Commscope': '001Wj00000mCFqtIAG',
    'Coimisiun na Mean': '001Wj00000mHDBoIAO',
    'Comisiun na Mean': '001Wj00000mHDBoIAO',
    'Coillte': '001Wj00000mCFrkIAG',
    'Bank of Ireland': '001Wj00000fFuFMIA0',
    'BOI': '001Wj00000fFuFMIA0',
    'Aryza': '001Wj00000mCFrgIAG',
    'Aramark Ireland': '001Hp00003klrEyIAK',
    'Aramark': '001Hp00003klrEyIAK',
    # Additional accounts not in screenshot - need to look up
    'Airbnb': '',  # Not in screenshot
    'AirBnB': '',
    'Airship': '',  # Not in screenshot
    'Airship Group Inc': '',
    'Etsy': '',  # Not in screenshot
    'Etsy Ireland UC': '',
    'Gilead': '',  # Not in screenshot
    'Gilead Sciences': '',
    'OpenAI': '',  # Not in screenshot
    'OpenAi': '',
}

def get_account_id(folder_name):
    """Get Account ID for a folder name"""
    # Direct match
    if folder_name in ACCOUNT_IDS and ACCOUNT_IDS[folder_name]:
        return ACCOUNT_IDS[folder_name]
    
    # Try variations
    for name, acc_id in ACCOUNT_IDS.items():
        if acc_id and (folder_name.lower() in name.lower() or name.lower() in folder_name.lower()):
            return acc_id
    
    return ''

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
    print("CREATING FINAL CONTRACTS UPLOAD WITH ACCOUNT IDs")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100 + "\n")
    
    # Load surgical extraction
    print("Loading surgical extraction data...")
    df = pd.read_excel(SURGICAL_FILE)
    print(f"Loaded {len(df)} contracts\n")
    
    # Create upload records
    upload_records = []
    content_records = []
    
    for _, row in df.iterrows():
        client = row['Client']
        contract = row['Contract']
        
        # Get Account ID
        account_id = get_account_id(client)
        
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
        
        # PDF file path
        pdf_filename = contract + '.pdf'
        pdf_path = os.path.join(CONTRACTS_DIR, client, pdf_filename)
        if not os.path.exists(pdf_path):
            # Try to find matching PDF
            client_folder = os.path.join(CONTRACTS_DIR, client)
            if os.path.exists(client_folder):
                pdfs = [f for f in os.listdir(client_folder) if f.lower().endswith('.pdf')]
                for pdf in pdfs:
                    if contract[:30].lower() in pdf.lower():
                        pdf_path = os.path.join(client_folder, pdf)
                        pdf_filename = pdf
                        break
        
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
            
            # Reference columns
            '_Client_Folder': client,
            '_Has_ACV': 'YES' if has_acv else 'NO',
            '_PDF_Path': pdf_path if os.path.exists(pdf_path) else '',
            '_PDF_Filename': pdf_filename,
        }
        
        upload_records.append(record)
        
        # Content record for PDF attachment
        if os.path.exists(pdf_path):
            content_records.append({
                'Title': contract_name[:80],
                'PathOnClient': pdf_path,
                'Description': f"Contract document for {client}",
                '_Contract_Name': contract_name,  # For matching after upload
            })
    
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
    with_pdf = len(df_upload[df_upload['_PDF_Path'] != ''])
    
    print(f"Total contracts: {total}")
    print(f"With ACV: {with_acv}")
    print(f"Without ACV (marked 'Review ACV'): {without_acv}")
    print(f"With Account ID: {with_account}")
    print(f"Missing Account ID: {without_account}")
    print(f"With PDF attachment: {with_pdf}")
    
    total_acv = df_upload['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
    print(f"\nTotal ACV: ${total_acv:,.2f}")
    
    # By client
    print("\n" + "-" * 100)
    print(f"{'Client':<35} {'Contracts':>10} {'ACV':>15} {'Account ID':>25} {'PDF':>5}")
    print("-" * 100)
    
    for client in sorted(df_upload['_Client_Folder'].unique()):
        client_df = df_upload[df_upload['_Client_Folder'] == client]
        count = len(client_df)
        acv = client_df['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
        acc_id = client_df['AccountId'].iloc[0]
        has_pdf = len(client_df[client_df['_PDF_Path'] != ''])
        
        acc_display = acc_id[:20] + '...' if acc_id else '⚠️ MISSING'
        pdf_status = f"{has_pdf}/{count}"
        
        print(f"{client:<35} {count:>10} ${acv:>13,.0f} {acc_display:>25} {pdf_status:>5}")
    
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
    print(f"✓ Contract Upload CSV: {OUTPUT_CSV}")
    
    # Full Excel with all columns
    with pd.ExcelWriter(OUTPUT_XLSX) as writer:
        df_upload.to_excel(writer, sheet_name='All Contracts', index=False)
        df_upload[df_upload['_Has_ACV'] == 'NO'].to_excel(writer, sheet_name='Review ACV', index=False)
        if without_account > 0:
            df_upload[df_upload['AccountId'] == ''].to_excel(writer, sheet_name='Missing Account ID', index=False)
    
    print(f"✓ Full Excel: {OUTPUT_XLSX}")
    
    # ContentVersion upload for PDFs
    if content_records:
        df_content = pd.DataFrame(content_records)
        df_content.to_csv(OUTPUT_CONTENT_CSV, index=False)
        print(f"✓ PDF Attachment CSV: {OUTPUT_CONTENT_CSV}")
    
    # Missing Account IDs
    if without_account > 0:
        print("\n" + "=" * 100)
        print("⚠️  MISSING ACCOUNT IDs - NEED LOOKUP")
        print("=" * 100)
        missing = df_upload[df_upload['AccountId'] == '']['_Client_Folder'].unique()
        for client in sorted(missing):
            print(f"  - {client}")
    
    print("\n" + "=" * 100)
    print("UPLOAD INSTRUCTIONS")
    print("=" * 100)
    print(f"""
STEP 1: Upload Contracts
------------------------
File: {OUTPUT_CSV}
Object: Contract
Operation: Insert

STEP 2: Attach PDFs (after contracts created)
---------------------------------------------
File: {OUTPUT_CONTENT_CSV}
Object: ContentVersion
Operation: Insert
- First upload contracts and note the Contract IDs
- Then link PDFs via ContentDocumentLink

IMPORTANT:
1. Contracts marked "[Review ACV]" need manual value entry
2. Fill in missing Account IDs before upload
3. Verify OwnerId: {DEFAULT_OWNER_ID}
""")

if __name__ == "__main__":
    main()




