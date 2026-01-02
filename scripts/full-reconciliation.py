#!/usr/bin/env python3
"""
Full Johnson Hana Contract Reconciliation
Maps all contracts to Salesforce opportunities and generates correction report
"""
import pandas as pd
import json
from datetime import datetime
import os
import re

# Load data
excel_path = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
df_opps = pd.read_excel(excel_path, sheet_name='All Closed Won Opportunities')
df_opps.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']

df_nov = pd.read_excel(excel_path, sheet_name='EU November Revenue by Client')

# Structured contract data from PDF extraction
all_contracts = [
    # BOI
    {'client': 'BOI', 'contract': 'F&P Solution SOW 4', 'start': '2025-09-01', 'end': '2026-03-01', 'term_months': 6, 
     'product_line': 'Compliance', 'consultants': [], 'hourly_rate': 850, 'notes': 'Fitness & Probity pilot extension'},
    {'client': 'BOI', 'contract': 'Tracker Mortgage Amendment', 'start': '2024-03-01', 'end': '2026-03-01', 'term_months': 24,
     'product_line': 'Litigation', 'consultants': [], 'hourly_rate': 80, 'weekly_hours': 125, 
     'monthly_cost': 40000, 'notes': 'Team of legal consultants 125 hrs/week @ €80/hr'},
    
    # OpenAI
    {'client': 'OpenAI', 'contract': 'Nerea Pérez & Elizabeth Agbaje SOW', 'start': '2025-11-17', 'end': '2026-02-28', 'term_months': 3,
     'product_line': 'Privacy', 'consultants': ['Nerea Pérez', 'Elizabeth Agbaje'], 'hourly_rate': 85,
     'monthly_cost': 27200, 'acv_estimate': 81600, 'notes': '2 consultants @ €13,600/month each'},
    {'client': 'OpenAI', 'contract': 'Himanshu Guar SOW', 'start': '2025-10-20', 'end': '2026-02-28', 'term_months': 4,
     'product_line': 'Privacy', 'consultants': ['Himanshu Guar'], 'hourly_rate': 85,
     'monthly_cost': 13600, 'acv_estimate': 54400, 'notes': 'Data Privacy Support'},
    {'client': 'OpenAI', 'contract': 'Feb 2024 SOW - Julian/AW/Mikhail', 'start': '2024-02-19', 'end': '2026-02-28', 'term_months': 24,
     'product_line': 'Privacy', 'consultants': ['Julian Hayes', 'Arthur-William Nanou', 'Mikhail Borisov'],
     'monthly_cost': 37600, 'acv_estimate': 451200, 'notes': 'Privacy SME €200/hr + 2 consultants'},
    {'client': 'OpenAI', 'contract': 'June 2024 SOW - Sarah Ledgerwood', 'start': '2024-06-19', 'end': '2026-02-28', 'term_months': 20,
     'product_line': 'Privacy', 'consultants': ['Sarah Ledgerwood'], 'hourly_rate': 85,
     'monthly_cost': 13600, 'acv_estimate': 163200},
    
    # Stripe  
    {'client': 'Stripe', 'contract': 'Supplier Framework Agreement (SFA)', 'start': '2025-07-01', 'end': '2027-06-30', 'term_months': 24,
     'product_line': 'Commercial Contracts', 'notes': 'Master framework - rates €120-150/hr'},
    {'client': 'Stripe', 'contract': 'Victoria Byrne SOW', 'start': '2025-10-01', 'end': '2025-12-19', 'term_months': 3,
     'product_line': 'Privacy', 'consultants': ['Victoria Byrne'], 'daily_rate': 1056,
     'notes': 'BAU support for in-house legal team'},
    
    # Irish Water
    {'client': 'Irish Water', 'contract': 'Amal Elbay CDS Support', 'start': '2025-07-28', 'end': '2025-12-28', 'term_months': 5,
     'product_line': 'CDS Legal', 'consultants': ['Amal Elbay'], 'hourly_rate': 77,
     'weekly_hours': 20, 'total_value': 33880},
    {'client': 'Irish Water', 'contract': 'Luke Sexton CDS Support', 'start': '2025-07-28', 'end': '2025-12-28', 'term_months': 5,
     'product_line': 'CDS Legal', 'consultants': ['Luke Sexton'], 'hourly_rate': 77,
     'weekly_hours': 35, 'total_value': 59290},
    {'client': 'Irish Water', 'contract': 'Jamie O\'Gorman CDS Support', 'start': '2025-07-28', 'end': '2025-12-28', 'term_months': 5,
     'product_line': 'CDS Legal', 'consultants': ['Jamie O\'Gorman'], 'hourly_rate': 77,
     'weekly_hours': 40, 'total_value': 67760},
    
    # Indeed
    {'client': 'Indeed', 'contract': 'Stephanie Donald SOW', 'start': '2025-10-23', 'end': '2026-04-23', 'term_months': 6,
     'product_line': 'Commercial Contracts', 'consultants': ['Stephanie Donald'],
     'monthly_cost': 16000, 'acv_estimate': 96000},
    {'client': 'Indeed', 'contract': 'Helen Hewson SOW', 'start': '2025-11-10', 'end': '2026-04-10', 'term_months': 5,
     'product_line': 'Commercial Contracts', 'consultants': ['Helen Hewson'],
     'monthly_cost': 9000, 'total_value': 45000},
    
    # ESB
    {'client': 'ESB', 'contract': 'Simon Downey & Annabel Caldwell NSIC', 'start': '2025-10-31', 'end': '2026-05-01', 'term_months': 6,
     'product_line': 'NSIC Project', 'consultants': ['Simon Downey', 'Annabel Caldwell'],
     'monthly_cost': 34690, 'notes': 'Simon €140/hr 35hrs + Annabel €145/hr 30hrs'},
    
    # Etsy
    {'client': 'Etsy', 'contract': 'Eleanor Power Privacy Support', 'start': '2026-01-01', 'end': '2026-06-30', 'term_months': 6,
     'product_line': 'Privacy', 'consultants': ['Eleanor Power'], 'hourly_rate': 110,
     'weekly_hours': 25, 'notes': 'Change order extending SOW'},
    
    # Tinder
    {'client': 'Tinder', 'contract': 'Donall O\'Riordan SOW', 'start': '2025-07-26', 'end': '2026-01-31', 'term_months': 6,
     'product_line': 'Commercial Contracts', 'consultants': ['Donall O\'Riordan'], 'hourly_rate': 135,
     'weekly_hours': 25, 'notes': 'Aug-Sep 30 hrs/week, then 25 hrs/week'},
    
    # TikTok
    {'client': 'TikTok', 'contract': 'Tara Bannon DSAR Support', 'start': '2025-07-12', 'end': '2025-12-31', 'term_months': 6,
     'product_line': 'DSAR', 'consultants': ['Tara Bannon'], 'hourly_rate': 80,
     'weekly_hours': 32},
    
    # Dropbox
    {'client': 'Dropbox', 'contract': 'SOW 004 Commercial Legal', 'start': '2025-04-29', 'end': '2025-09-01', 'term_months': 4,
     'product_line': 'Commercial Contracts', 'hourly_rate': 120,
     'total_value': 57000},
    {'client': 'Dropbox', 'contract': 'SOW 005 Commercial Legal', 'start': '2025-12-15', 'end': '2026-01-31', 'term_months': 1.5,
     'product_line': 'Commercial Contracts', 'hourly_rate': 120,
     'monthly_cost': 16800},
    
    # Airbnb
    {'client': 'Airbnb', 'contract': 'Erica Gomes Nov-Dec 2025', 'start': '2025-11-18', 'end': '2025-12-31', 'term_months': 1.5,
     'product_line': 'Privacy', 'consultants': ['Erica Gomes'], 'hourly_rate': 75, 'weekly_hours': 25},
    {'client': 'Airbnb', 'contract': 'Erica Gomes Jan-Mar 2026', 'start': '2026-01-01', 'end': '2026-03-31', 'term_months': 3,
     'product_line': 'Privacy', 'consultants': ['Erica Gomes'], 'hourly_rate': 75, 'weekly_hours': 25},
    {'client': 'Airbnb', 'contract': 'Rory Collins Litigation', 'start': '2024-03-05', 'end': '2026-03-05', 'term_months': 24,
     'product_line': 'Litigation', 'consultants': ['Rory Collins'], 'hourly_rate': 65, 'weekly_hours': 25},
]

# Client name mapping for Salesforce matching
client_patterns = {
    'BOI': ['Bank of Ireland', 'BOI'],
    'OpenAI': ['OpenAi', 'OpenAI', 'Open ai'],
    'Stripe': ['Stripe'],
    'Irish Water': ['Irish Water', 'Uisce'],
    'Indeed': ['Indeed'],
    'ESB': ['ESB'],
    'Etsy': ['Etsy'],
    'Tinder': ['Tinder'],
    'TikTok': ['TikTok', 'Tiktok'],
    'Dropbox': ['Dropbox'],
    'Airbnb': ['Airbnb', 'AirBnB'],
}

def find_matching_opps(client_name, df):
    """Find opportunities matching a client name"""
    if client_name not in client_patterns:
        return df[df['Account_Name'].str.contains(client_name, case=False, na=False)]
    
    mask = df['Account_Name'].str.contains('|'.join(client_patterns[client_name]), case=False, na=False)
    return df[mask]

def match_contract_to_opp(contract, opps_df):
    """Find the best matching opportunity for a contract"""
    best_match = None
    best_score = 0
    
    for _, opp in opps_df.iterrows():
        opp_name = str(opp['Opp_Name']).lower()
        score = 0
        
        # Match by consultant name
        for consultant in contract.get('consultants', []):
            if consultant.lower() in opp_name:
                score += 20
        
        # Match by product line keywords
        product_line = contract.get('product_line', '').lower()
        if product_line:
            if product_line in opp_name:
                score += 10
            elif 'privacy' in product_line and 'privacy' in opp_name:
                score += 8
            elif 'dsar' in product_line and 'dsar' in opp_name:
                score += 8
            elif 'commercial' in product_line and 'commercial' in opp_name:
                score += 5
            elif 'contract' in product_line and 'contract' in opp_name:
                score += 5
        
        # Match by contract name keywords
        contract_name = contract.get('contract', '').lower()
        for word in contract_name.split():
            if len(word) > 3 and word in opp_name:
                score += 3
        
        if score > best_score:
            best_score = score
            best_match = opp
    
    return best_match, best_score

# Create reconciliation report
reconciliation_rows = []
issues = []

print("=" * 100)
print("JOHNSON HANA CONTRACT RECONCILIATION")
print("=" * 100)

for contract in all_contracts:
    client = contract['client']
    opps = find_matching_opps(client, df_opps)
    best_opp, score = match_contract_to_opp(contract, opps)
    
    row = {
        'Client': client,
        'Contract_Name': contract['contract'],
        'Contract_Start': contract.get('start'),
        'Contract_End': contract.get('end'),
        'Contract_Term_Months': contract.get('term_months'),
        'Contract_Monthly_Cost': contract.get('monthly_cost'),
        'Contract_Total_Value': contract.get('total_value'),
        'Contract_ACV_Estimate': contract.get('acv_estimate'),
        'Contract_Product_Line': contract.get('product_line'),
        'Contract_Consultants': ', '.join(contract.get('consultants', [])),
        'Contract_Hourly_Rate': contract.get('hourly_rate'),
        'Contract_Notes': contract.get('notes', ''),
    }
    
    if best_opp is not None and score >= 5:
        row['SF_Opp_Name'] = best_opp['Opp_Name']
        row['SF_Opp_ID'] = best_opp['Opp_ID']
        row['SF_ACV'] = best_opp['ACV']
        row['SF_Term'] = best_opp['Term']
        row['SF_Revenue_Type'] = best_opp['Revenue_Type']
        row['Match_Score'] = score
        row['Match_Status'] = 'MATCHED'
        
        # Check for discrepancies
        contract_term = contract.get('term_months')
        sf_term = best_opp['Term']
        if contract_term and sf_term and abs(contract_term - sf_term) > 1:
            row['Term_Discrepancy'] = f"Contract: {contract_term}mo, SF: {sf_term}mo"
            issues.append(f"{client} - {contract['contract']}: Term mismatch")
        
        # Check ACV alignment
        contract_acv = contract.get('acv_estimate') or contract.get('total_value')
        sf_acv = best_opp['ACV']
        if contract_acv and sf_acv and abs(contract_acv - sf_acv) / max(contract_acv, sf_acv) > 0.1:
            row['ACV_Discrepancy'] = f"Contract: €{contract_acv:,.0f}, SF: ${sf_acv:,.0f}"
            issues.append(f"{client} - {contract['contract']}: ACV mismatch")
    else:
        row['SF_Opp_Name'] = 'NO MATCH FOUND'
        row['SF_Opp_ID'] = ''
        row['SF_ACV'] = 0
        row['SF_Term'] = 0
        row['SF_Revenue_Type'] = ''
        row['Match_Score'] = score
        row['Match_Status'] = 'UNMATCHED'
        issues.append(f"{client} - {contract['contract']}: No matching SF opportunity found")
    
    reconciliation_rows.append(row)
    
    print(f"\n{client}: {contract['contract']}")
    print(f"  Term: {contract.get('term_months')} months | Product: {contract.get('product_line')}")
    if best_opp is not None and score >= 5:
        print(f"  >>> MATCHED to: {best_opp['Opp_Name'][:60]}")
        print(f"      SF ACV: ${best_opp['ACV']:,.0f} | SF Term: {best_opp['Term']}mo")
    else:
        print(f"  !!! NO MATCH FOUND (score={score})")

# Create DataFrames
recon_df = pd.DataFrame(reconciliation_rows)

# Summary by client
summary_data = []
for client in client_patterns.keys():
    opps = find_matching_opps(client, df_opps)
    contracts = [c for c in all_contracts if c['client'] == client]
    matched = len([r for r in reconciliation_rows if r['Client'] == client and r['Match_Status'] == 'MATCHED'])
    
    nov_rev = df_nov[df_nov['Account Name'].str.contains('|'.join(client_patterns.get(client, [client])), case=False, na=False)]['November Run Rate'].sum()
    
    summary_data.append({
        'Client': client,
        'November_Run_Rate': nov_rev,
        'SF_Opportunity_Count': len(opps),
        'SF_Total_ACV': opps['ACV'].sum(),
        'Contracts_Reviewed': len(contracts),
        'Contracts_Matched': matched,
        'Match_Rate': f"{matched/max(len(contracts),1)*100:.0f}%"
    })

summary_df = pd.DataFrame(summary_data)

# Issues list
issues_df = pd.DataFrame({'Issue': issues})

# Data quality issues in SF
quality_issues = []
for _, opp in df_opps.iterrows():
    if pd.isna(opp['Term']) or opp['Term'] <= 0:
        quality_issues.append({
            'Opp_ID': opp['Opp_ID'],
            'Opp_Name': opp['Opp_Name'],
            'Account': opp['Account_Name'],
            'Issue': f"Invalid Term: {opp['Term']}",
            'Current_ACV': opp['ACV'],
            'Current_Revenue_Type': opp['Revenue_Type']
        })
    if pd.isna(opp['Revenue_Type']) or opp['Revenue_Type'] == '':
        quality_issues.append({
            'Opp_ID': opp['Opp_ID'],
            'Opp_Name': opp['Opp_Name'],
            'Account': opp['Account_Name'],
            'Issue': 'Missing Revenue Type',
            'Current_ACV': opp['ACV'],
            'Current_Revenue_Type': opp['Revenue_Type']
        })

quality_df = pd.DataFrame(quality_issues)

# Save to Excel
output_path = '/Users/keiganpesenti/Desktop/JH_Contract_Reconciliation_Full.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    recon_df.to_excel(writer, sheet_name='Reconciliation', index=False)
    summary_df.to_excel(writer, sheet_name='Summary', index=False)
    issues_df.to_excel(writer, sheet_name='Issues', index=False)
    quality_df.to_excel(writer, sheet_name='Data Quality', index=False)
    
    # All opportunities for reference
    df_opps.to_excel(writer, sheet_name='All SF Opps', index=False)

print("\n" + "=" * 100)
print("SUMMARY")
print("=" * 100)
print(f"Contracts Reviewed: {len(all_contracts)}")
print(f"Matched to SF: {len([r for r in reconciliation_rows if r['Match_Status'] == 'MATCHED'])}")
print(f"Unmatched: {len([r for r in reconciliation_rows if r['Match_Status'] == 'UNMATCHED'])}")
print(f"Data Quality Issues: {len(quality_issues)}")
print(f"\nReport saved to: {output_path}")

print("\n" + "=" * 100)
print("ISSUES REQUIRING ACTION")
print("=" * 100)
for issue in issues[:20]:
    print(f"  - {issue}")


