#!/usr/bin/env python3
"""
Generate Salesforce correction file for Johnson Hana opportunities
Creates a Data Loader ready CSV with field updates
"""
import pandas as pd
from datetime import datetime

# Load the reconciliation report
recon_path = '/Users/keiganpesenti/Desktop/JH_Contract_Reconciliation_Full.xlsx'
recon_df = pd.read_excel(recon_path, sheet_name='Reconciliation')
quality_df = pd.read_excel(recon_path, sheet_name='Data Quality')

# Load original SF data
excel_path = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
df_opps = pd.read_excel(excel_path, sheet_name='All Closed Won Opportunities')
df_opps.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']

print("=" * 100)
print("SALESFORCE CORRECTION REPORT")
print("Generated:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
print("=" * 100)

# Corrections list
corrections = []

# Product line mapping based on contract analysis
product_line_mapping = {
    'Privacy': 'Privacy',
    'Commercial Contracts': 'Commercial Contracts',
    'DSAR': 'DSAR',
    'Litigation': 'Litigation',
    'CDS Legal': 'CDS Legal',
    'NSIC Project': 'NSIC Project',
    'Compliance': 'Compliance',
}

# Process matched contracts with discrepancies
print("\n" + "=" * 80)
print("RECOMMENDED CORRECTIONS")
print("=" * 80)

for _, row in recon_df.iterrows():
    if row['Match_Status'] == 'MATCHED' and pd.notna(row.get('SF_Opp_ID')):
        opp_id = row['SF_Opp_ID']
        correction = {
            'Id': opp_id,
            'Opportunity_Name': row['SF_Opp_Name'],
            'Client': row['Client'],
            'Contract': row['Contract_Name'],
        }
        
        needs_update = False
        update_notes = []
        
        # Check Term discrepancy
        if pd.notna(row.get('Term_Discrepancy')):
            contract_term = row.get('Contract_Term_Months')
            if contract_term:
                correction['Term__c'] = int(contract_term)
                correction['Term_Current'] = row['SF_Term']
                needs_update = True
                update_notes.append(f"Term: {row['SF_Term']} -> {contract_term}")
        
        # Check Product Line
        if pd.notna(row.get('Contract_Product_Line')):
            product_line = row['Contract_Product_Line']
            if product_line in product_line_mapping:
                correction['Product_Line__c'] = product_line_mapping[product_line]
                needs_update = True
                update_notes.append(f"Product Line: {product_line}")
        
        # Check Revenue Type (if missing)
        if pd.isna(row.get('SF_Revenue_Type')) or row.get('SF_Revenue_Type') == '':
            # Determine from term
            term = row.get('Contract_Term_Months', 0)
            if term and term >= 12:
                correction['Revenue_Type__c'] = 'Recurring'
            else:
                correction['Revenue_Type__c'] = 'Project'
            needs_update = True
            update_notes.append(f"Revenue Type: {correction['Revenue_Type__c']}")
        
        if needs_update:
            corrections.append(correction)
            print(f"\n{row['Client']} - {row['Contract_Name']}")
            print(f"  Opp ID: {opp_id}")
            for note in update_notes:
                print(f"    - {note}")

# Process data quality issues
print("\n" + "=" * 80)
print("DATA QUALITY FIXES")
print("=" * 80)

term_fixes = quality_df[quality_df['Issue'].str.contains('Term', na=False)]
revenue_type_fixes = quality_df[quality_df['Issue'].str.contains('Revenue Type', na=False)]

print(f"\nOpportunities with Invalid Term: {len(term_fixes)}")
print(f"Opportunities with Missing Revenue Type: {len(revenue_type_fixes)}")

# Generate correction CSV for Data Loader
corrections_df = pd.DataFrame(corrections)

# Filter to just update columns
if len(corrections_df) > 0:
    update_cols = ['Id', 'Term__c', 'Product_Line__c', 'Revenue_Type__c']
    available_cols = [c for c in update_cols if c in corrections_df.columns]
    update_df = corrections_df[available_cols].copy()
    
    # Save Data Loader file
    dataloader_path = '/Users/keiganpesenti/Desktop/JH_SF_Updates_DataLoader.csv'
    update_df.to_csv(dataloader_path, index=False)
    print(f"\nData Loader file saved to: {dataloader_path}")

# Generate detailed report
report_path = '/Users/keiganpesenti/Desktop/JH_Correction_Report.xlsx'
with pd.ExcelWriter(report_path, engine='openpyxl') as writer:
    # All corrections with context
    if len(corrections_df) > 0:
        corrections_df.to_excel(writer, sheet_name='Corrections', index=False)
    
    # Term fixes needed
    term_fixes.to_excel(writer, sheet_name='Term Fixes', index=False)
    
    # Revenue type fixes
    revenue_type_fixes.to_excel(writer, sheet_name='Revenue Type Fixes', index=False)
    
    # Summary
    summary = pd.DataFrame([
        {'Category': 'Matched Contracts', 'Count': len(recon_df[recon_df['Match_Status'] == 'MATCHED'])},
        {'Category': 'Unmatched Contracts', 'Count': len(recon_df[recon_df['Match_Status'] == 'UNMATCHED'])},
        {'Category': 'Term Corrections Needed', 'Count': len(term_fixes)},
        {'Category': 'Revenue Type Corrections', 'Count': len(revenue_type_fixes)},
        {'Category': 'Product Line Updates', 'Count': len([c for c in corrections if 'Product_Line__c' in c])},
    ])
    summary.to_excel(writer, sheet_name='Summary', index=False)

print(f"\nDetailed report saved to: {report_path}")

# Print specific high-priority corrections
print("\n" + "=" * 100)
print("HIGH PRIORITY CORRECTIONS (Manual Review Required)")
print("=" * 100)

high_priority = [
    {
        'client': 'BOI',
        'issue': 'F&P Solution SOW 4 - No matching SF opportunity',
        'action': 'Create new opportunity or verify correct mapping',
        'contract_value': '€850/search (rate card)',
        'term': '6 months (Sep 2025 - Mar 2026)'
    },
    {
        'client': 'BOI', 
        'issue': 'Tracker Mortgage - Term mismatch',
        'action': 'Contract shows 24 months, SF shows 14 months. Verify correct term.',
        'contract_value': '€80/hr x 125 hrs/week',
        'term': '24 months (Mar 2024 - Mar 2026)'
    },
    {
        'client': 'OpenAI',
        'issue': 'Multiple overlapping SOWs not clearly mapped',
        'action': 'Review all OpenAI opportunities to ensure each SOW has a corresponding opportunity',
        'contract_value': 'Feb 2024 SOW: €37,600/month for 24 months = €451K/year',
        'term': 'Various'
    },
    {
        'client': 'Airbnb',
        'issue': 'Rory Collins Litigation SOW - No matching SF opportunity',
        'action': 'Create opportunity or map to existing',
        'contract_value': '€65/hr x 25 hrs/week for 24 months',
        'term': '24 months (Mar 2024 - Mar 2026)'
    },
]

for item in high_priority:
    print(f"\n{item['client']}:")
    print(f"  Issue: {item['issue']}")
    print(f"  Action: {item['action']}")
    print(f"  Contract Value: {item['contract_value']}")
    print(f"  Term: {item['term']}")

