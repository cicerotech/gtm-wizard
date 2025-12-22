#!/usr/bin/env python3
"""
Create Contracts DataLoader Upload File
Maps contracts from Client Contracts folder to Salesforce Contract object format
Includes all fields required for Campfire ERP sync
"""

import os
import re
import json
import pandas as pd
from PyPDF2 import PdfReader
from datetime import datetime, timedelta

# --- Configuration ---
CONTRACTS_DIR = '/Users/keiganpesenti/Desktop/Client Contracts/'
DEEP_MINING_FILE = '/Users/keiganpesenti/Desktop/JH_Deep_Mining_Results.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader.csv'
OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader.xlsx'

EUR_TO_USD = 1.18

# Account name to Salesforce Account ID mapping
# Will be populated from SF opportunities file
ACCOUNT_ID_MAP = {}

# Default Owner ID (will need to be updated with actual SF User ID)
DEFAULT_OWNER_ID = '005Wj000002YqYQIA0'  # Placeholder - update with actual

# Product line keyword mapping
PRODUCT_LINE_KEYWORDS = {
    'Privacy': ['privacy', 'gdpr', 'dsar', 'data protection', 'dppo'],
    'Contracting': ['contract', 'commercial', 'sow', 'agreement', 'msa'],
    'Litigation': ['litigation', 'dispute', 'claims'],
    'Compliance': ['compliance', 'regulatory', 'fitness and probity', 'f&p'],
    'Legal Ops': ['legal ops', 'legal operations'],
    'M&A': ['m&a', 'merger', 'acquisition'],
    'DSAR': ['dsar', 'subject access'],
}

def load_account_ids():
    """Load Account IDs from SF opportunities"""
    global ACCOUNT_ID_MAP
    
    # We need to query Salesforce to get Account IDs
    # For now, we'll create a placeholder that needs the actual IDs
    
    # Map folder names to SF account names for lookup
    folder_to_sf = {
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
    
    return folder_to_sf

def detect_contract_type(filename, text):
    """Detect contract type from filename and text"""
    filename_lower = filename.lower()
    text_lower = text.lower() if text else ''
    
    if 'amendment' in filename_lower or 'extension' in filename_lower:
        return 'Amendment'
    elif 'loi' in filename_lower or 'letter of intent' in text_lower:
        return 'LOI'
    elif 'msa' in filename_lower or 'master service' in text_lower:
        return 'Recurring'
    elif 'sow' in filename_lower or 'statement of work' in text_lower:
        return 'Recurring'
    elif 'framework' in filename_lower:
        return 'Recurring'
    else:
        return 'Recurring'  # Default for JH contracts

def detect_product_line(filename, text):
    """Detect product lines from filename and content"""
    combined = (filename + ' ' + (text or '')).lower()
    
    found_products = []
    for product, keywords in PRODUCT_LINE_KEYWORDS.items():
        for kw in keywords:
            if kw in combined:
                found_products.append(product)
                break
    
    if not found_products:
        found_products = ['Contracting']  # Default for JH
    
    return ';'.join(list(set(found_products)))

def extract_dates_from_text(text):
    """Extract start and end dates from contract text"""
    start_date = None
    end_date = None
    term_months = None
    
    if not text:
        return start_date, end_date, term_months
    
    # Date patterns
    date_patterns = [
        r'(?:effective|commencement|start)\s*date[:\s]*(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s/\-\.]+\d{4})',
        r'(?:effective|commencement|start)\s*date[:\s]*(\d{1,2}/\d{1,2}/\d{2,4})',
        r'(?:effective|commencement|start)\s*date[:\s]*(\d{4}-\d{2}-\d{2})',
        r'from\s+(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s/\-\.]+\d{4})',
    ]
    
    end_patterns = [
        r'(?:end|termination|expir)\s*date[:\s]*(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s/\-\.]+\d{4})',
        r'(?:end|termination|expir)\s*date[:\s]*(\d{1,2}/\d{1,2}/\d{2,4})',
        r'until\s+(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s/\-\.]+\d{4})',
    ]
    
    term_patterns = [
        r'(?:term|duration)[:\s]*(\d+)\s*months?',
        r'(\d+)\s*months?\s*(?:term|duration|period)',
        r'for\s+(?:a\s+period\s+of\s+)?(\d+)\s*months?',
    ]
    
    # Parse dates
    def parse_date(date_str):
        formats = [
            "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%d/%m/%y",
            "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%m-%Y"
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt)
            except:
                continue
        return None
    
    # Find start date
    for pattern in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            parsed = parse_date(match.group(1))
            if parsed:
                start_date = parsed.strftime('%Y-%m-%d')
                break
    
    # Find end date
    for pattern in end_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            parsed = parse_date(match.group(1))
            if parsed:
                end_date = parsed.strftime('%Y-%m-%d')
                break
    
    # Find term
    for pattern in term_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            term_months = int(match.group(1))
            break
    
    # Calculate term if we have both dates but no explicit term
    if start_date and end_date and not term_months:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            term_months = max(1, round((end_dt - start_dt).days / 30))
        except:
            pass
    
    # Default term if none found
    if not term_months:
        term_months = 12  # Default 12 months
    
    # Default start date if none found
    if not start_date:
        start_date = datetime.now().strftime('%Y-%m-%d')
    
    return start_date, end_date, term_months

def extract_pdf_text(pdf_path):
    """Extract text from PDF"""
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages[:5]:  # First 5 pages usually have key info
            text += page.extract_text() or ""
        return text
    except:
        return ""

def process_contract(client_folder, pdf_file, contract_values):
    """Process a single contract into Salesforce record format"""
    pdf_path = os.path.join(CONTRACTS_DIR, client_folder, pdf_file)
    
    # Extract text
    text = extract_pdf_text(pdf_path)
    
    # Get contract name (clean filename)
    contract_name = pdf_file.replace('.pdf', '').replace('.PDF', '')
    # Clean up common prefixes
    contract_name = re.sub(r'^(Complete_with_Docusign_|Client Statement of Works[_\s]*)', '', contract_name)
    # Add client prefix for clarity
    full_contract_name = f"{client_folder} - {contract_name[:80]}"
    
    # Get dates and term
    start_date, end_date, term_months = extract_dates_from_text(text)
    
    # Get contract type
    contract_type = detect_contract_type(pdf_file, text)
    
    # Get product line
    product_line = detect_product_line(pdf_file, text)
    
    # Get monetary values from deep mining results
    acv_usd = 0
    monthly_amount = 0
    total_value = 0
    
    # Find in contract_values
    # Escape special regex characters in contract name
    search_name = re.escape(contract_name[:30])
    matching_value = contract_values[
        (contract_values['client'].str.lower() == client_folder.lower()) &
        (contract_values['contract'].str.contains(search_name, case=False, na=False, regex=True))
    ]
    
    if not matching_value.empty:
        acv_usd = matching_value['acv_usd'].values[0] or 0
        monthly_amount = acv_usd / 12 if acv_usd else 0
        total_value = acv_usd * (term_months / 12) if acv_usd and term_months else acv_usd
    
    return {
        'Contract_Name_Campfire__c': full_contract_name,
        'Account_Folder': client_folder,
        'AccountId': '',  # Will need Account ID lookup
        'StartDate': start_date,
        'ContractTerm': term_months,
        'Contract_Type__c': contract_type,
        'Status': 'Draft',
        'OwnerId': DEFAULT_OWNER_ID,
        'AI_Enabled__c': 'TRUE',
        'Currency__c': 'USD',
        'Contract_Value__c': round(total_value, 2) if total_value else '',
        'Annualized_Revenue__c': round(acv_usd, 2) if acv_usd else '',
        'Amount__c': round(monthly_amount, 2) if monthly_amount else '',
        'Product_Line__c': product_line,
        'Parent_Product__c': product_line.split(';')[0] if product_line else 'Contracting',
        'PDF_Filename': pdf_file,
        'Extraction_Notes': f"Extracted from {client_folder} folder"
    }

def main():
    print("=" * 100)
    print("CREATING CONTRACTS DATALOADER FILE")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    # Load folder to SF account mapping
    folder_to_sf = load_account_ids()
    
    # Load contract values from deep mining
    try:
        df_values = pd.read_excel(DEEP_MINING_FILE, sheet_name='All Contracts Deep')
    except:
        df_values = pd.DataFrame(columns=['client', 'contract', 'acv_usd'])
    
    print(f"Loaded {len(df_values)} contract values from deep mining")
    
    # Process all contracts
    all_contracts = []
    
    client_folders = [d for d in os.listdir(CONTRACTS_DIR) if os.path.isdir(os.path.join(CONTRACTS_DIR, d))]
    
    print(f"\nProcessing {len(client_folders)} client folders...")
    
    for client_folder in sorted(client_folders):
        folder_path = os.path.join(CONTRACTS_DIR, client_folder)
        pdf_files = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            continue
        
        print(f"\n{client_folder}: {len(pdf_files)} contracts")
        
        for pdf_file in pdf_files:
            contract = process_contract(client_folder, pdf_file, df_values)
            
            # Add SF account name for lookup
            contract['SF_Account_Name'] = folder_to_sf.get(client_folder, client_folder)
            
            all_contracts.append(contract)
            
            acv_str = f"${contract['Annualized_Revenue__c']:,.0f}" if contract['Annualized_Revenue__c'] else "No ACV"
            print(f"  ✓ {contract['Contract_Name_Campfire__c'][:60]}: {acv_str}")
    
    # Create DataFrame
    df_contracts = pd.DataFrame(all_contracts)
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    print(f"Total contracts: {len(df_contracts)}")
    print(f"Contracts with ACV: {len(df_contracts[df_contracts['Annualized_Revenue__c'] != ''])}")
    
    acv_total = df_contracts['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
    print(f"Total ACV: ${acv_total:,.2f}")
    
    # By client
    print("\nBy Client Folder:")
    for folder in df_contracts['Account_Folder'].unique():
        folder_df = df_contracts[df_contracts['Account_Folder'] == folder]
        folder_acv = folder_df['Annualized_Revenue__c'].replace('', 0).astype(float).sum()
        print(f"  {folder}: {len(folder_df)} contracts, ${folder_acv:,.0f}")
    
    # Save outputs
    print("\n" + "=" * 80)
    print("SAVING FILES")
    print("=" * 80)
    
    # CSV for DataLoader
    # Reorder columns for DataLoader format
    dataloader_columns = [
        'Contract_Name_Campfire__c',
        'AccountId',
        'SF_Account_Name',
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
    
    df_dataloader = df_contracts[dataloader_columns].copy()
    df_dataloader.to_csv(OUTPUT_CSV, index=False)
    print(f"DataLoader CSV: {OUTPUT_CSV}")
    
    # Full Excel with all columns
    df_contracts.to_excel(OUTPUT_XLSX, index=False)
    print(f"Full Excel: {OUTPUT_XLSX}")
    
    # Instructions
    print("\n" + "=" * 80)
    print("NEXT STEPS")
    print("=" * 80)
    print("""
    1. LOOKUP ACCOUNT IDs:
       - Query Salesforce for Account IDs matching 'SF_Account_Name' column
       - Update 'AccountId' column with actual 18-character Salesforce IDs
       
    2. VERIFY OWNER ID:
       - Current placeholder: {owner_id}
       - Replace with actual Salesforce User ID for contract owner
       
    3. REVIEW PRODUCT LINES:
       - Verify Product_Line__c values match your Salesforce picklist
       - Valid values should be semicolon-separated for multi-select
       
    4. UPLOAD VIA DATALOADER:
       - Use Salesforce Data Loader to insert Contract records
       - Object: Contract
       - Map CSV columns to API field names
       
    5. ATTACH PDFs:
       - After contracts are created, upload PDF files as ContentVersions
       - Link to Contract records via ContentDocumentLink
    """.format(owner_id=DEFAULT_OWNER_ID))
    
    return df_contracts

if __name__ == "__main__":
    main()

