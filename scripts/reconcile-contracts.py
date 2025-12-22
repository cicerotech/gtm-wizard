#!/usr/bin/env python3
"""
Reconcile Johnson Hana contracts with Salesforce opportunities
Creates a detailed Excel report with discrepancies
"""
import pandas as pd
import json
import re
from datetime import datetime
import os

# Load the Excel data
excel_path = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
df_opps = pd.read_excel(excel_path, sheet_name='All Closed Won Opportunities')
df_opps.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']

df_nov = pd.read_excel(excel_path, sheet_name='EU November Revenue by Client')

# Load contract extractions
with open('/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/contract-extractions.json', 'r') as f:
    contracts = json.load(f)

print("=" * 100)
print("JOHNSON HANA CONTRACT RECONCILIATION REPORT")
print("Generated:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
print("=" * 100)

# Manual contract data extraction based on PDF review
# This is populated from the extracted text previews above
contract_data = [
    # BOI Contracts
    {
        'client': 'BOI',
        'contract_name': 'F&P Solution - Pilot Project SOW 4',
        'filename': 'Contract_8643_36252_GovCo_JohnHana_SOW - September 2025 (F&P).pdf',
        'start_date': '2025-09-01',
        'end_date': '2026-03-01',
        'term_months': 6,
        'rate_per_hour': 850,  # €850 for some services
        'product_line': 'Compliance',
        'notes': 'Fitness and Probity due diligence - extension from pilot'
    },
    {
        'client': 'BOI',
        'contract_name': 'Tracker Mortgage and FSPO Complaints Amendment',
        'filename': 'JHI_Tracker Mortgage and FSPO Complaints_Amendment.pdf',
        'start_date': '2024-03-01',
        'end_date': '2026-03-01',
        'term_months': 24,
        'rate_per_hour': 80,  # €80 per hour for 125 hours/week
        'product_line': 'Litigation',
        'notes': 'Team of legal consultants for 125 hours per week'
    },
    
    # OpenAI Contracts
    {
        'client': 'OpenAI',
        'contract_name': 'Nerea Pérez & Elizabeth Agbaje - Privacy Support',
        'filename': 'Complete_with_Docusign_Client_Statement_of_W.pdf',
        'start_date': '2025-11-17',
        'end_date': '2026-02-28',
        'term_months': 3,
        'monthly_cost': 27200,  # 2 consultants @ €13,600 each
        'annual_value': 81600,  # 3 months x €27,200
        'product_line': 'Privacy',
        'consultants': ['Nerea Pérez', 'Elizabeth Agbaje'],
        'notes': 'Data Privacy Support - template responses, DSR support'
    },
    {
        'client': 'OpenAI',
        'contract_name': 'Himanshu Guar - Privacy Support',
        'filename': 'Client Statement of Works - OpenAI - Himanshu Guar (1).pdf',
        'start_date': '2025-10-20',
        'end_date': '2026-02-28',
        'term_months': 4,
        'monthly_cost': 13600,
        'annual_value': 54400,  # 4 months x €13,600
        'product_line': 'Privacy',
        'consultants': ['Himanshu Guar'],
        'notes': 'Data Privacy Support'
    },
    {
        'client': 'OpenAI',
        'contract_name': 'Feb 2024 SOW - Privacy Team (Julian Hayes, AW Nanou, Mikhail Borisov)',
        'filename': 'Johnson Hana SOW - OpenAI Feb 24.pdf',
        'start_date': '2024-02-19',
        'end_date': '2026-02-28',
        'term_months': 24,
        'monthly_cost': 37600,  # €16,000 + €8,000 + €13,600
        'annual_value': 451200,  # 12 months x €37,600
        'product_line': 'Privacy',
        'consultants': ['Julian Hayes', 'Arthur-William Nanou', 'Mikhail Borisov'],
        'notes': '24 month engagement - Privacy SME + 2 consultants'
    },
    {
        'client': 'OpenAI',
        'contract_name': 'June 2024 SOW - Sarah Ledgerwood',
        'filename': 'Johnson Hana SOW - OpenAI June 2024.pdf',
        'start_date': '2024-06-19',
        'end_date': '2026-02-28',
        'term_months': 20,
        'monthly_cost': 13600,
        'annual_value': 163200,  # 12 months x €13,600
        'product_line': 'Privacy',
        'consultants': ['Sarah Ledgerwood'],
        'notes': 'Data Privacy Support extension'
    },
    
    # Stripe Contracts
    {
        'client': 'Stripe',
        'contract_name': 'Supplier Framework Agreement (SFA)',
        'filename': 'Johnson_Hana_International_Ltd_-_SFA_SOW.pdf',
        'start_date': '2025-07-01',
        'end_date': '2027-06-30',
        'term_months': 24,
        'rate_senior': 150,  # €150/hr senior
        'rate_mid': 120,  # €120/hr mid
        'product_line': 'Commercial Contracts',
        'notes': 'Master framework agreement with rate card'
    },
    {
        'client': 'Stripe',
        'contract_name': 'Victoria Byrne SOW - Privacy',
        'filename': 'Johnson Hana V. Byrne SOW for SPEL 2025 Oct.pdf',
        'start_date': '2025-10-01',
        'end_date': '2026-03-31',
        'term_months': 6,
        'product_line': 'Privacy',
        'consultants': ['Victoria Byrne'],
        'notes': 'Privacy secondment extension'
    },
]

# Map contracts to Salesforce opportunities
def find_matching_opps(client_name, df):
    """Find opportunities matching a client name"""
    patterns = {
        'BOI': ['Bank of Ireland', 'BOI'],
        'OpenAI': ['OpenAi', 'OpenAI', 'Open ai'],
        'Stripe': ['Stripe'],
    }
    
    if client_name not in patterns:
        return df[df['Account_Name'].str.contains(client_name, case=False, na=False)]
    
    mask = df['Account_Name'].str.contains('|'.join(patterns[client_name]), case=False, na=False)
    return df[mask]

# Create reconciliation report
reconciliation = []

print("\n" + "=" * 100)
print("DETAILED RECONCILIATION BY CLIENT")
print("=" * 100)

for contract in contract_data:
    client = contract['client']
    matching_opps = find_matching_opps(client, df_opps)
    
    print(f"\n{'='*80}")
    print(f"CONTRACT: {contract['contract_name']}")
    print(f"File: {contract['filename']}")
    print(f"Client: {client}")
    print(f"Term: {contract.get('term_months', 'N/A')} months")
    print(f"Start: {contract.get('start_date', 'N/A')} | End: {contract.get('end_date', 'N/A')}")
    print(f"Product Line: {contract.get('product_line', 'N/A')}")
    if contract.get('annual_value'):
        print(f"Estimated Annual Value: €{contract['annual_value']:,.0f}")
    if contract.get('monthly_cost'):
        print(f"Monthly Cost: €{contract['monthly_cost']:,.0f}")
    if contract.get('consultants'):
        print(f"Consultants: {', '.join(contract['consultants'])}")
    print(f"{'='*80}")
    
    print(f"\nMATCHING SALESFORCE OPPORTUNITIES ({len(matching_opps)} total for {client}):")
    
    # Try to find best matching opportunity based on name/date
    for _, opp in matching_opps.iterrows():
        opp_name = str(opp['Opp_Name'])
        
        # Check if opportunity name matches contract elements
        match_score = 0
        if contract.get('consultants'):
            for consultant in contract['consultants']:
                if consultant.lower() in opp_name.lower():
                    match_score += 10
        
        if contract.get('product_line'):
            if contract['product_line'].lower() in opp_name.lower():
                match_score += 5
        
        # Check for key terms
        if 'privacy' in opp_name.lower() and contract.get('product_line') == 'Privacy':
            match_score += 3
        if 'tracker' in opp_name.lower() and 'Tracker' in contract.get('contract_name', ''):
            match_score += 10
        if 'f&p' in opp_name.lower() or 'fitness' in opp_name.lower():
            if 'F&P' in contract.get('contract_name', '') or 'Fitness' in contract.get('notes', ''):
                match_score += 10
        
        acv = opp['ACV'] if pd.notna(opp['ACV']) else 0
        term = opp['Term'] if pd.notna(opp['Term']) else 0
        rev_type = opp['Revenue_Type'] if pd.notna(opp['Revenue_Type']) else 'N/A'
        
        marker = ">>> LIKELY MATCH" if match_score >= 5 else ""
        print(f"  {marker}")
        print(f"  - {opp_name[:70]}")
        print(f"    ACV: ${acv:,.0f} | Term: {term} months | Type: {rev_type}")
        
        # Add to reconciliation
        reconciliation.append({
            'Contract_Client': client,
            'Contract_Name': contract['contract_name'],
            'Contract_Term_Months': contract.get('term_months'),
            'Contract_Annual_Value': contract.get('annual_value'),
            'Contract_Monthly_Cost': contract.get('monthly_cost'),
            'Contract_Product_Line': contract.get('product_line'),
            'Contract_Start': contract.get('start_date'),
            'Contract_End': contract.get('end_date'),
            'SF_Opp_Name': opp_name,
            'SF_Opp_ID': opp['Opp_ID'],
            'SF_ACV': acv,
            'SF_Term': term,
            'SF_Revenue_Type': rev_type,
            'Match_Score': match_score,
            'Needs_Review': 'YES' if match_score >= 5 else 'NO'
        })

# Create Excel output
output_df = pd.DataFrame(reconciliation)
output_df = output_df.sort_values(['Contract_Client', 'Match_Score'], ascending=[True, False])

# Save to Excel
output_path = '/Users/keiganpesenti/Desktop/JH_Contract_Reconciliation.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # Reconciliation sheet
    output_df.to_excel(writer, sheet_name='Reconciliation', index=False)
    
    # Summary sheet
    summary_data = []
    for client in ['BOI', 'OpenAI', 'Stripe']:
        opps = find_matching_opps(client, df_opps)
        summary_data.append({
            'Client': client,
            'SF_Opp_Count': len(opps),
            'SF_Total_ACV': opps['ACV'].sum(),
            'Nov_Run_Rate': df_nov[df_nov['Account Name'].str.contains(client, case=False, na=False)]['November Run Rate'].sum()
        })
    
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_excel(writer, sheet_name='Summary', index=False)
    
    # Contracts sheet
    contracts_df = pd.DataFrame(contract_data)
    contracts_df.to_excel(writer, sheet_name='Contracts', index=False)

print(f"\n\n{'='*100}")
print(f"RECONCILIATION REPORT SAVED TO: {output_path}")
print(f"{'='*100}")

# Print key discrepancies
print("\n" + "=" * 100)
print("KEY FINDINGS & RECOMMENDED ACTIONS")
print("=" * 100)

print("""
1. BOI TRACKER MORTGAGE
   - Contract shows 24 months (Mar 2024 - Mar 2026) at €80/hr for 125 hrs/week
   - Multiple SF opportunities exist - verify which maps to this contract
   - ACTION: Confirm term alignment and ACV calculation

2. OPENAI PRIVACY TEAM
   - Multiple overlapping SOWs with different consultants
   - Feb 2024 SOW: 24 months, €37,600/month (Julian, AW Nanou, Mikhail)
   - June 2024 SOW: Sarah Ledgerwood at €13,600/month
   - Oct 2025 SOW: Himanshu Guar at €13,600/month
   - Nov 2025 SOW: Nerea & Elizabeth at €27,200/month combined
   - ACTION: Ensure each consultant has a corresponding SF opportunity with correct term/ACV

3. STRIPE
   - New SFA effective July 2025, supersedes previous MSA
   - Rate card: €120-150/hr depending on seniority
   - Victoria Byrne Privacy SOW: Oct 2025 - Mar 2026 (6 months)
   - ACTION: Verify all active SOWs are captured in SF with correct terms

4. DATA QUALITY ISSUES TO FIX:
   - Term = 0 or negative on some opportunities
   - Revenue Type missing on some opportunities
   - Product Line may need updating
""")

