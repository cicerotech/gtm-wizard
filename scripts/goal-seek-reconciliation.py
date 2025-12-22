#!/usr/bin/env python3
"""
Goal Seek Reconciliation - Compare November RR to Contract and SF Values
Identifies gaps and generates correction recommendations
"""

import pandas as pd
import json
import os
from fuzzywuzzy import fuzz, process

# --- Configuration ---
EXCEL_FILE = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
CONTRACT_SUMMARY_FILE = '/Users/keiganpesenti/Desktop/Contract_Value_Summary.xlsx'
CONTRACT_TOTALS_FILE = '/Users/keiganpesenti/Desktop/Contract_Client_Totals.xlsx'
OUTPUT_DIR = '/Users/keiganpesenti/Desktop/'

# Client name mappings (folder name -> SF account name variations)
CLIENT_MAPPINGS = {
    'BOI': ['Bank of Ireland'],
    'OpenAI': ['OpenAi'],
    'Irish Water : Uisce Eireann': ['Uisce Eireann (Irish Water)', 'Irish Water'],
    'AirBnB': ['Airbnb'],
    'TikTok': ['Tiktok Information Technologies UK Limited'],
    'ESB': ['ESB NI/Electric Ireland', 'Electricity Supply Board'],
    'Etsy': ['Etsy Ireland UC'],
    'Indeed': ['Indeed Ireland Operations Limited'],
    'Stripe': ['Stripe Payments Europe Limited'],
    'Tinder': ['Tinder LLC'],
    'Dropbox': ['Dropbox International Unlimited Company'],
    'Northern Trust': ['Northern Trust Management Services (Ireland) Limited'],
    'Consensys': ['Consensys'],
    'Commscope': ['CommScope Technologies LLC'],
    'Gilead': ['Gilead Sciences'],
    'Glanbia': ['Glanbia Management Services Limited'],
    'Taoglas': ['Taoglas Limited'],
    'Teamwork': ['Teamwork Crew Limited T/A Teamwork.com'],
    'Perrigo': ['Perrigo Pharma'],
    'Coillte': ['Coillte'],
    'Udemy': ['Udemy Ireland Limited'],
    'Kellanova': ['Kellanova (Ireland)'],
    'Sisk': ['Sisk Group', 'John Sisk & Son'],
    'Orsted': ['Orsted'],
    'Aryza': ['Aryza'],
    'Airship': ['Airship Group Inc'],
    'Datalex': ['Datalex (Ireland) Limited'],
}

def load_data():
    """Load all required data files"""
    print("Loading data files...\n")
    
    # November RR
    df_november = pd.read_excel(EXCEL_FILE, sheet_name='EU November Revenue by Client')
    print(f"November RR data: {len(df_november)} clients")
    
    # EU Opportunities
    df_eu_opps = pd.read_excel(EU_OPPS_FILE)
    print(f"EU Opportunities: {len(df_eu_opps)} records")
    
    # Contract summaries
    df_contracts = pd.read_excel(CONTRACT_SUMMARY_FILE)
    print(f"Contracts parsed: {len(df_contracts)} contracts")
    
    # Contract totals by client
    df_contract_totals = pd.read_excel(CONTRACT_TOTALS_FILE)
    print(f"Contract client totals: {len(df_contract_totals)} clients")
    
    return df_november, df_eu_opps, df_contracts, df_contract_totals

def match_client_name(folder_name, target_names, threshold=80):
    """Find best match for client name"""
    # Check direct mappings first
    if folder_name in CLIENT_MAPPINGS:
        for mapped_name in CLIENT_MAPPINGS[folder_name]:
            for target in target_names:
                if mapped_name.lower() in target.lower() or target.lower() in mapped_name.lower():
                    return target
    
    # Fuzzy match
    best_match = process.extractOne(folder_name, target_names, scorer=fuzz.token_set_ratio)
    if best_match and best_match[1] >= threshold:
        return best_match[0]
    
    return None

def build_reconciliation(df_november, df_eu_opps, df_contracts, df_contract_totals):
    """Build complete reconciliation by client"""
    
    reconciliation = []
    
    # Get unique account names from SF
    sf_account_names = df_eu_opps['Account Name: Account Name'].unique().tolist()
    
    for _, nov_row in df_november.iterrows():
        client = nov_row['Account Name']
        november_rr = nov_row['November Run Rate']
        
        # Find matching SF account
        sf_account = match_client_name(client, sf_account_names)
        
        # Find matching contract folder
        contract_folder = None
        for folder in CLIENT_MAPPINGS.keys():
            if client.lower() in folder.lower() or folder.lower() in client.lower():
                contract_folder = folder
                break
        
        if not contract_folder:
            # Try fuzzy match on contract client names
            contract_clients = df_contract_totals['Client'].unique().tolist()
            match = match_client_name(client, contract_clients)
            if match:
                contract_folder = match
        
        # Get SF totals
        sf_opps = pd.DataFrame()
        sf_total_acv = 0
        sf_opp_count = 0
        
        if sf_account:
            sf_opps = df_eu_opps[df_eu_opps['Account Name: Account Name'] == sf_account]
            sf_total_acv = sf_opps['ACV'].sum()
            sf_opp_count = len(sf_opps)
        
        # Get contract totals
        contract_total_acv = 0
        contract_monthly = 0
        contract_count = 0
        
        if contract_folder:
            contract_match = df_contract_totals[df_contract_totals['Client'].str.lower() == contract_folder.lower()]
            if contract_match.empty:
                # Try partial match
                contract_match = df_contract_totals[df_contract_totals['Client'].str.contains(contract_folder, case=False, na=False)]
            
            if not contract_match.empty:
                contract_total_acv = contract_match['Total_ACV'].sum()
                contract_monthly = contract_match['Total_Monthly'].sum()
                contract_count = contract_match['Contract_Count'].sum()
        
        # Calculate gaps
        annual_rr = november_rr * 12
        gap_sf = annual_rr - sf_total_acv
        gap_contract = annual_rr - contract_total_acv
        
        reconciliation.append({
            'Client_NovRR': client,
            'November_RR': november_rr,
            'Annual_RR': annual_rr,
            'SF_Account': sf_account or 'NO MATCH',
            'SF_Total_ACV': sf_total_acv,
            'SF_Opp_Count': sf_opp_count,
            'Contract_Folder': contract_folder or 'NO FOLDER',
            'Contract_Total_ACV': contract_total_acv,
            'Contract_Monthly': contract_monthly,
            'Contract_Count': contract_count,
            'Gap_vs_SF': gap_sf,
            'Gap_vs_Contract': gap_contract,
            'Coverage_SF_Pct': (sf_total_acv / annual_rr * 100) if annual_rr > 0 else 0,
            'Coverage_Contract_Pct': (contract_total_acv / annual_rr * 100) if annual_rr > 0 else 0,
        })
    
    return pd.DataFrame(reconciliation)

def generate_corrections(df_reconciliation, df_eu_opps, df_contracts):
    """Generate recommended corrections for Salesforce"""
    
    corrections = []
    
    for _, row in df_reconciliation.iterrows():
        client = row['Client_NovRR']
        sf_account = row['SF_Account']
        contract_folder = row['Contract_Folder']
        
        if sf_account == 'NO MATCH' or contract_folder == 'NO FOLDER':
            continue
        
        # Get SF opportunities for this client
        sf_opps = df_eu_opps[df_eu_opps['Account Name: Account Name'] == sf_account]
        
        # Get contracts for this client
        client_contracts = df_contracts[df_contracts['Client'].str.contains(contract_folder, case=False, na=False)]
        
        for _, contract in client_contracts.iterrows():
            contract_name = contract['Contract']
            contract_acv = contract.get('Calculated_ACV', 0)
            contract_term = contract.get('Term_Months')
            contract_rate = contract.get('Hourly_Rate')
            contract_hours = contract.get('Weekly_Hours')
            
            if pd.isna(contract_acv) or contract_acv == 0:
                continue
            
            # Try to match to SF opportunity
            best_match_opp = None
            best_match_score = 0
            
            for _, opp in sf_opps.iterrows():
                opp_name = opp['Opportunity Name']
                score = fuzz.token_set_ratio(contract_name.lower(), opp_name.lower())
                
                if score > best_match_score:
                    best_match_score = score
                    best_match_opp = opp
            
            if best_match_opp is not None and best_match_score >= 60:
                sf_acv = best_match_opp['ACV']
                sf_term = best_match_opp['Term (Months)']
                opp_id = best_match_opp['Opportunity ID']
                
                # Check for discrepancies
                acv_variance = abs(contract_acv - sf_acv) / contract_acv if contract_acv > 0 else 0
                term_mismatch = contract_term and not pd.isna(contract_term) and sf_term != contract_term
                
                if acv_variance > 0.10 or term_mismatch:  # >10% variance or term mismatch
                    corrections.append({
                        'Client': client,
                        'Contract': contract_name,
                        'Contract_ACV': contract_acv,
                        'Contract_Term': contract_term,
                        'Contract_Rate': contract_rate,
                        'Contract_Hours': contract_hours,
                        'SF_Opp_Name': best_match_opp['Opportunity Name'],
                        'SF_Opp_ID': opp_id,
                        'SF_ACV': sf_acv,
                        'SF_Term': sf_term,
                        'ACV_Variance_Pct': acv_variance * 100,
                        'Term_Mismatch': term_mismatch,
                        'Recommended_ACV': contract_acv,
                        'Recommended_Term': contract_term if contract_term else sf_term,
                        'Match_Score': best_match_score
                    })
            else:
                # No matching SF opportunity
                corrections.append({
                    'Client': client,
                    'Contract': contract_name,
                    'Contract_ACV': contract_acv,
                    'Contract_Term': contract_term,
                    'Contract_Rate': contract_rate,
                    'Contract_Hours': contract_hours,
                    'SF_Opp_Name': 'NO MATCH',
                    'SF_Opp_ID': 'CREATE NEW',
                    'SF_ACV': 0,
                    'SF_Term': None,
                    'ACV_Variance_Pct': 100,
                    'Term_Mismatch': False,
                    'Recommended_ACV': contract_acv,
                    'Recommended_Term': contract_term,
                    'Match_Score': best_match_score if best_match_score > 0 else 0
                })
    
    return pd.DataFrame(corrections)

def main():
    print("=" * 100)
    print("GOAL SEEK RECONCILIATION")
    print("Validating November RR vs Contract vs Salesforce Values")
    print("=" * 100 + "\n")
    
    # Load data
    df_november, df_eu_opps, df_contracts, df_contract_totals = load_data()
    
    # Build reconciliation
    print("\n" + "=" * 100)
    print("BUILDING RECONCILIATION BY CLIENT")
    print("=" * 100 + "\n")
    
    df_reconciliation = build_reconciliation(df_november, df_eu_opps, df_contracts, df_contract_totals)
    
    # Sort by November RR descending
    df_reconciliation = df_reconciliation.sort_values('November_RR', ascending=False)
    
    # Print summary
    print("RECONCILIATION SUMMARY (sorted by November RR):\n")
    print(df_reconciliation.to_string(index=False))
    
    # Calculate totals
    total_nov_rr = df_reconciliation['November_RR'].sum()
    total_annual_rr = df_reconciliation['Annual_RR'].sum()
    total_sf_acv = df_reconciliation['SF_Total_ACV'].sum()
    total_contract_acv = df_reconciliation['Contract_Total_ACV'].sum()
    
    print("\n" + "=" * 100)
    print("AGGREGATE TOTALS")
    print("=" * 100)
    print(f"  Total November RR:        €{total_nov_rr:,.0f}")
    print(f"  Annualized RR:            €{total_annual_rr:,.0f}")
    print(f"  SF Closed Won ACV:        €{total_sf_acv:,.0f}")
    print(f"  Contract Extracted ACV:   €{total_contract_acv:,.0f}")
    print(f"  Gap (RR vs SF):           €{total_annual_rr - total_sf_acv:,.0f}")
    print(f"  Gap (RR vs Contract):     €{total_annual_rr - total_contract_acv:,.0f}")
    print("=" * 100 + "\n")
    
    # Generate corrections
    print("=" * 100)
    print("GENERATING CORRECTIONS")
    print("=" * 100 + "\n")
    
    df_corrections = generate_corrections(df_reconciliation, df_eu_opps, df_contracts)
    
    if not df_corrections.empty:
        df_corrections = df_corrections.sort_values('ACV_Variance_Pct', ascending=False)
        print("CORRECTIONS NEEDED (sorted by variance):\n")
        print(df_corrections.head(30).to_string(index=False))
    else:
        print("No corrections identified.")
    
    # Save outputs
    print("\n" + "=" * 100)
    print("SAVING OUTPUTS")
    print("=" * 100)
    
    output_file = os.path.join(OUTPUT_DIR, 'JH_Goal_Seek_Reconciliation.xlsx')
    with pd.ExcelWriter(output_file) as writer:
        df_reconciliation.to_excel(writer, sheet_name='Client Reconciliation', index=False)
        df_corrections.to_excel(writer, sheet_name='SF Corrections', index=False)
        
        # Create Data Loader format
        if not df_corrections.empty:
            df_dataloader = df_corrections[df_corrections['SF_Opp_ID'] != 'CREATE NEW'][
                ['SF_Opp_ID', 'Recommended_ACV', 'Recommended_Term']
            ].copy()
            df_dataloader.columns = ['Id', 'ACV__c', 'Term__c']
            df_dataloader = df_dataloader.dropna(subset=['Id'])
            df_dataloader.to_excel(writer, sheet_name='DataLoader Updates', index=False)
    
    print(f"Saved to: {output_file}")
    
    # High priority actions
    print("\n" + "=" * 100)
    print("HIGH PRIORITY ACTIONS")
    print("=" * 100 + "\n")
    
    # Top 10 clients by gap
    high_gap = df_reconciliation[df_reconciliation['Gap_vs_SF'] > 100000].head(10)
    print("Clients with >€100K annual gap (RR vs SF):\n")
    for _, row in high_gap.iterrows():
        print(f"  {row['Client_NovRR']}")
        print(f"    Annual RR: €{row['Annual_RR']:,.0f}")
        print(f"    SF ACV:    €{row['SF_Total_ACV']:,.0f}")
        print(f"    Gap:       €{row['Gap_vs_SF']:,.0f} ({100 - row['Coverage_SF_Pct']:.1f}% missing)")
        print()
    
    return df_reconciliation, df_corrections

if __name__ == "__main__":
    main()

