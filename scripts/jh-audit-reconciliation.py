#!/usr/bin/env python3
"""
JH Audit Reconciliation - Comprehensive Analysis
Goal-seeks from November RR benchmark to Salesforce opportunities
Converts EUR contracts to USD, identifies mismatches, generates impact analysis
"""

import pandas as pd
import numpy as np
import json
import os
import re
from fuzzywuzzy import fuzz, process
from datetime import datetime

# --- Configuration ---
EXCEL_FILE = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
CONTRACT_JSON = '/Users/keiganpesenti/Desktop/Deep_Contract_Analysis.json'
OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Audit_Reconciliation_Master.xlsx'

# EUR to USD conversion rate
EUR_TO_USD = 1.18

# Account name mappings (JH folder name -> SF account name variations)
ACCOUNT_MAPPINGS = {
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
    'CommScope': ['CommScope Technologies LLC'],
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
    'ACS': ['Arabic Computer Systems'],
    'Coimisiún na Meán': ['Coimisiun na Mean'],
    'NTMA': ['NTMA'],
    'Kingspan': ['Kingspan'],
    'Hayes': ['Hayes Solicitors LLP'],
    'Coleman Legal': ['Coleman Legal'],
    'Creed McStay': ['Creed McStay', 'McDermott Creed & Martyn'],
    'DCEDIY': ['Department of Children, Disability and Equality'],
}

def detect_currency(text):
    """Detect if contract values are in EUR or USD"""
    if not text:
        return 'EUR'  # Default to EUR for JH contracts
    
    # Count currency indicators
    eur_count = len(re.findall(r'€|EUR|Euro', text, re.IGNORECASE))
    usd_count = len(re.findall(r'\$|USD|Dollar', text, re.IGNORECASE))
    
    if usd_count > eur_count:
        return 'USD'
    return 'EUR'

def convert_to_usd(value, currency):
    """Convert value to USD if needed"""
    if currency == 'EUR':
        return value * EUR_TO_USD
    return value

def load_november_rr():
    """Load November RR benchmark (already annual USD)"""
    print("=" * 80)
    print("PHASE 1: LOADING NOVEMBER RR BENCHMARK")
    print("=" * 80)
    
    df = pd.read_excel(EXCEL_FILE, sheet_name='EU November Revenue by Client')
    
    # Clean up column names
    df.columns = ['Entity', 'Account_Name', 'Annual_RR_USD']
    
    # Remove any $ signs and convert to float
    if df['Annual_RR_USD'].dtype == 'object':
        df['Annual_RR_USD'] = df['Annual_RR_USD'].replace('[\$,]', '', regex=True).astype(float)
    
    print(f"Loaded {len(df)} accounts with November RR benchmarks")
    print(f"Total Annual RR: ${df['Annual_RR_USD'].sum():,.2f}")
    
    return df

def load_sf_opportunities():
    """Load EU Salesforce opportunities"""
    print("\n" + "=" * 80)
    print("PHASE 2: LOADING SALESFORCE OPPORTUNITIES")
    print("=" * 80)
    
    df = pd.read_excel(EU_OPPS_FILE)
    
    # Standardize column names
    df.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']
    
    print(f"Loaded {len(df)} EU opportunities")
    print(f"Total SF ACV: ${df['ACV'].sum():,.2f}")
    
    # Group by account
    account_summary = df.groupby('Account_Name').agg({
        'ACV': 'sum',
        'Opp_ID': 'count',
        'Term': lambda x: x.dropna().mean() if len(x.dropna()) > 0 else None
    }).reset_index()
    account_summary.columns = ['Account_Name', 'SF_Total_ACV', 'SF_Opp_Count', 'SF_Avg_Term']
    
    print(f"Grouped into {len(account_summary)} accounts")
    
    return df, account_summary

def load_contracts():
    """Load extracted contract data and convert EUR to USD"""
    print("\n" + "=" * 80)
    print("PHASE 3: LOADING AND CONVERTING CONTRACTS")
    print("=" * 80)
    
    with open(CONTRACT_JSON, 'r') as f:
        contracts = json.load(f)
    
    print(f"Loaded {len(contracts)} contracts")
    
    # Process each contract
    processed = []
    for c in contracts:
        if 'error' in c:
            continue
            
        # Detect currency from contract text
        text_preview = c.get('text_preview', '') or ''
        currency = detect_currency(text_preview)
        
        # Get calculated ACV
        acv_eur = c.get('calculated_acv', 0) or 0
        
        # Convert to USD
        acv_usd = convert_to_usd(acv_eur, currency)
        
        # Get hourly rate and convert
        hourly_rate = None
        if c.get('hourly_rates'):
            hourly_rate_eur = c['hourly_rates'][0].get('rate', 0)
            hourly_rate = convert_to_usd(hourly_rate_eur, currency)
        
        processed.append({
            'Client': c.get('client', ''),
            'Contract': c.get('filename', '').replace('.pdf', ''),
            'Currency_Detected': currency,
            'ACV_Original': acv_eur,
            'ACV_USD': acv_usd,
            'Monthly_USD': acv_usd / 12 if acv_usd else 0,
            'Hourly_Rate_USD': hourly_rate,
            'Weekly_Hours': c['weekly_hours'][0]['hours'] if c.get('weekly_hours') else None,
            'Term_Months': c.get('term_info', {}).get('term_months'),
            'Start_Date': c.get('term_info', {}).get('start_date'),
            'End_Date': c.get('term_info', {}).get('end_date'),
            'Consultants': ', '.join(c.get('consultants', []))[:100],
            'Calculation_Method': c.get('acv_calculation_method', '')
        })
    
    df = pd.DataFrame(processed)
    
    # Summary by client
    eur_contracts = df[df['Currency_Detected'] == 'EUR']
    usd_contracts = df[df['Currency_Detected'] == 'USD']
    
    print(f"  EUR contracts: {len(eur_contracts)} (converted at {EUR_TO_USD})")
    print(f"  USD contracts: {len(usd_contracts)} (no conversion)")
    print(f"Total Contract Value (USD): ${df['ACV_USD'].sum():,.2f}")
    
    return df

def match_account_name(name, target_names, threshold=75):
    """Match account name with fuzzy logic and mappings"""
    # Check direct mappings first
    for folder_name, sf_names in ACCOUNT_MAPPINGS.items():
        if name.lower() == folder_name.lower():
            for sf_name in sf_names:
                for target in target_names:
                    if sf_name.lower() in target.lower() or target.lower() in sf_name.lower():
                        return target
    
    # Check if name is in mappings values
    for folder_name, sf_names in ACCOUNT_MAPPINGS.items():
        for sf_name in sf_names:
            if name.lower() == sf_name.lower():
                for target in target_names:
                    if sf_name.lower() in target.lower() or target.lower() in sf_name.lower():
                        return target
    
    # Fuzzy match
    best_match = process.extractOne(name, target_names, scorer=fuzz.token_set_ratio)
    if best_match and best_match[1] >= threshold:
        return best_match[0]
    
    return None

def build_account_reconciliation(df_rr, df_sf_summary, df_contracts):
    """Build account-level reconciliation"""
    print("\n" + "=" * 80)
    print("PHASE 4: ACCOUNT-LEVEL RECONCILIATION")
    print("=" * 80)
    
    sf_accounts = df_sf_summary['Account_Name'].unique().tolist()
    
    reconciliation = []
    
    for _, rr_row in df_rr.iterrows():
        rr_account = rr_row['Account_Name']
        target_usd = rr_row['Annual_RR_USD']
        
        # Find matching SF account
        sf_account = match_account_name(rr_account, sf_accounts)
        
        # Get SF totals
        sf_total = 0
        sf_count = 0
        if sf_account:
            sf_match = df_sf_summary[df_sf_summary['Account_Name'] == sf_account]
            if not sf_match.empty:
                sf_total = sf_match['SF_Total_ACV'].values[0]
                sf_count = sf_match['SF_Opp_Count'].values[0]
        
        # Find matching contracts
        contract_total = 0
        contract_count = 0
        for folder_name, sf_names in ACCOUNT_MAPPINGS.items():
            if rr_account.lower() == folder_name.lower() or rr_account in sf_names:
                contract_match = df_contracts[df_contracts['Client'].str.lower() == folder_name.lower()]
                if not contract_match.empty:
                    contract_total = contract_match['ACV_USD'].sum()
                    contract_count = len(contract_match)
                break
        
        # If no mapping found, try fuzzy match on contract clients
        if contract_count == 0:
            contract_clients = df_contracts['Client'].unique().tolist()
            matched_client = match_account_name(rr_account, contract_clients, threshold=70)
            if matched_client:
                contract_match = df_contracts[df_contracts['Client'] == matched_client]
                contract_total = contract_match['ACV_USD'].sum()
                contract_count = len(contract_match)
        
        # Calculate gaps and coverage
        gap_sf = target_usd - sf_total
        gap_contract = target_usd - contract_total
        coverage_sf = (sf_total / target_usd * 100) if target_usd > 0 else 0
        coverage_contract = (contract_total / target_usd * 100) if target_usd > 0 else 0
        
        # Variance category
        if coverage_sf >= 90:
            status = 'ALIGNED'
        elif coverage_sf >= 50:
            status = 'PARTIAL'
        elif sf_total > target_usd * 1.1:
            status = 'OVER'
        else:
            status = 'UNDER'
        
        reconciliation.append({
            'RR_Account': rr_account,
            'Target_USD': target_usd,
            'SF_Account': sf_account or 'NO MATCH',
            'SF_Total_ACV': sf_total,
            'SF_Opp_Count': sf_count,
            'Contract_Total_USD': contract_total,
            'Contract_Count': contract_count,
            'Gap_to_Target': gap_sf,
            'Coverage_Pct': coverage_sf,
            'Status': status
        })
    
    df_recon = pd.DataFrame(reconciliation)
    df_recon = df_recon.sort_values('Target_USD', ascending=False)
    
    print(f"\nAccount Reconciliation Summary:")
    print(f"  ALIGNED (>90% coverage): {len(df_recon[df_recon['Status'] == 'ALIGNED'])}")
    print(f"  PARTIAL (50-90%): {len(df_recon[df_recon['Status'] == 'PARTIAL'])}")
    print(f"  UNDER (<50%): {len(df_recon[df_recon['Status'] == 'UNDER'])}")
    print(f"  OVER (>110%): {len(df_recon[df_recon['Status'] == 'OVER'])}")
    
    return df_recon

def enhanced_opportunity_matching(df_sf, df_contracts):
    """Match contracts to SF opportunities with multiple criteria"""
    print("\n" + "=" * 80)
    print("PHASE 5: ENHANCED OPPORTUNITY MATCHING")
    print("=" * 80)
    
    matches = []
    
    for _, contract in df_contracts.iterrows():
        if contract['ACV_USD'] == 0:
            continue
            
        client = contract['Client']
        contract_name = contract['Contract']
        contract_acv = contract['ACV_USD']
        contract_term = contract['Term_Months']
        consultants = contract['Consultants']
        
        # Get SF account name for this client
        sf_account_name = None
        for folder_name, sf_names in ACCOUNT_MAPPINGS.items():
            if client.lower() == folder_name.lower():
                sf_account_name = sf_names[0] if sf_names else None
                break
        
        # Filter SF opportunities for this account
        if sf_account_name:
            account_opps = df_sf[df_sf['Account_Name'].str.contains(sf_account_name, case=False, na=False)]
        else:
            account_opps = df_sf[df_sf['Account_Name'].str.contains(client, case=False, na=False)]
        
        if account_opps.empty:
            # No matching account in SF
            matches.append({
                'Client': client,
                'Contract': contract_name,
                'Contract_ACV_USD': contract_acv,
                'Contract_Term': contract_term,
                'Contract_Consultants': consultants,
                'SF_Opp_ID': None,
                'SF_Opp_Name': None,
                'SF_ACV': None,
                'SF_Term': None,
                'Match_Type': 'NO_ACCOUNT_MATCH',
                'Match_Score': 0,
                'ACV_Variance': None,
                'ACV_Variance_Pct': None,
                'Term_Match': None,
                'Action': 'CREATE_NEW_OPP'
            })
            continue
        
        # Try multiple matching strategies
        best_match = None
        best_score = 0
        match_type = None
        
        for _, opp in account_opps.iterrows():
            opp_name = opp['Opp_Name']
            opp_acv = opp['ACV']
            score = 0
            
            # Strategy 1: Consultant name in opportunity name
            if consultants:
                for consultant in consultants.split(','):
                    consultant = consultant.strip()
                    if consultant and len(consultant) > 3:
                        if consultant.lower() in opp_name.lower():
                            score += 50
                            break
            
            # Strategy 2: Contract name similarity
            name_score = fuzz.token_set_ratio(contract_name.lower(), opp_name.lower())
            score += name_score * 0.3
            
            # Strategy 3: ACV similarity (within 30%)
            if opp_acv and contract_acv:
                acv_ratio = min(opp_acv, contract_acv) / max(opp_acv, contract_acv)
                if acv_ratio >= 0.7:
                    score += 30 * acv_ratio
            
            # Strategy 4: Keywords from contract in opp name
            keywords = ['extension', 'renewal', 'sow', 'secondment', 'support', 'privacy', 'litigation', 'dsar']
            for kw in keywords:
                if kw in contract_name.lower() and kw in opp_name.lower():
                    score += 10
                    break
            
            if score > best_score:
                best_score = score
                best_match = opp
                if score >= 70:
                    match_type = 'STRONG_MATCH'
                elif score >= 50:
                    match_type = 'LIKELY_MATCH'
                else:
                    match_type = 'WEAK_MATCH'
        
        if best_match is not None and best_score >= 40:
            sf_acv = best_match['ACV']
            sf_term = best_match['Term']
            acv_variance = contract_acv - sf_acv
            acv_variance_pct = (acv_variance / sf_acv * 100) if sf_acv else 100
            
            # Determine action
            if abs(acv_variance_pct) <= 10:
                action = 'NO_CHANGE'
            elif acv_variance > 0:
                action = 'UPDATE_ACV_INCREASE'
            else:
                action = 'REVIEW_ACV_DECREASE'
            
            # Check term
            term_match = None
            if contract_term and sf_term:
                term_match = contract_term == sf_term
                if not term_match:
                    action = action + '+UPDATE_TERM'
            
            matches.append({
                'Client': client,
                'Contract': contract_name,
                'Contract_ACV_USD': contract_acv,
                'Contract_Term': contract_term,
                'Contract_Consultants': consultants,
                'SF_Opp_ID': best_match['Opp_ID'],
                'SF_Opp_Name': best_match['Opp_Name'],
                'SF_ACV': sf_acv,
                'SF_Term': sf_term,
                'Match_Type': match_type,
                'Match_Score': best_score,
                'ACV_Variance': acv_variance,
                'ACV_Variance_Pct': acv_variance_pct,
                'Term_Match': term_match,
                'Action': action
            })
        else:
            matches.append({
                'Client': client,
                'Contract': contract_name,
                'Contract_ACV_USD': contract_acv,
                'Contract_Term': contract_term,
                'Contract_Consultants': consultants,
                'SF_Opp_ID': None,
                'SF_Opp_Name': None,
                'SF_ACV': None,
                'SF_Term': None,
                'Match_Type': 'NO_OPP_MATCH',
                'Match_Score': best_score,
                'ACV_Variance': None,
                'ACV_Variance_Pct': None,
                'Term_Match': None,
                'Action': 'CREATE_NEW_OPP'
            })
    
    df_matches = pd.DataFrame(matches)
    
    print(f"\nMatching Results:")
    print(f"  STRONG_MATCH: {len(df_matches[df_matches['Match_Type'] == 'STRONG_MATCH'])}")
    print(f"  LIKELY_MATCH: {len(df_matches[df_matches['Match_Type'] == 'LIKELY_MATCH'])}")
    print(f"  WEAK_MATCH: {len(df_matches[df_matches['Match_Type'] == 'WEAK_MATCH'])}")
    print(f"  NO_OPP_MATCH: {len(df_matches[df_matches['Match_Type'] == 'NO_OPP_MATCH'])}")
    print(f"  NO_ACCOUNT_MATCH: {len(df_matches[df_matches['Match_Type'] == 'NO_ACCOUNT_MATCH'])}")
    
    return df_matches

def classify_and_generate_updates(df_matches, df_sf):
    """Classify findings and generate update recommendations"""
    print("\n" + "=" * 80)
    print("PHASE 6: CLASSIFYING FINDINGS & GENERATING UPDATES")
    print("=" * 80)
    
    # Separate by action type
    updates = df_matches[df_matches['Action'].str.contains('UPDATE', na=False)].copy()
    creates = df_matches[df_matches['Action'] == 'CREATE_NEW_OPP'].copy()
    no_change = df_matches[df_matches['Action'] == 'NO_CHANGE'].copy()
    reviews = df_matches[df_matches['Action'].str.contains('REVIEW', na=False)].copy()
    
    print(f"\nAction Summary:")
    print(f"  Updates needed: {len(updates)}")
    print(f"  New opps to create: {len(creates)}")
    print(f"  No change needed: {len(no_change)}")
    print(f"  Manual review needed: {len(reviews)}")
    
    # Generate DataLoader format for updates
    update_records = []
    for _, row in updates.iterrows():
        if pd.notna(row['SF_Opp_ID']):
            record = {'Id': row['SF_Opp_ID']}
            
            if 'UPDATE_ACV' in row['Action']:
                record['ACV__c'] = round(row['Contract_ACV_USD'], 2)
            
            if 'UPDATE_TERM' in row['Action'] and pd.notna(row['Contract_Term']):
                record['Term__c'] = int(row['Contract_Term'])
            
            record['Notes'] = f"Updated from contract: {row['Contract']}"
            update_records.append(record)
    
    df_updates = pd.DataFrame(update_records)
    
    return updates, creates, no_change, reviews, df_updates

def calculate_impact(df_recon, df_matches, df_updates, df_creates):
    """Calculate before/after impact analysis"""
    print("\n" + "=" * 80)
    print("PHASE 7: IMPACT ANALYSIS")
    print("=" * 80)
    
    # Current state
    current_sf_total = df_recon['SF_Total_ACV'].sum()
    target_total = df_recon['Target_USD'].sum()
    
    # Proposed changes
    acv_increases = df_matches[df_matches['ACV_Variance'] > 0]['ACV_Variance'].sum()
    acv_decreases = df_matches[df_matches['ACV_Variance'] < 0]['ACV_Variance'].sum()
    new_opp_acv = df_creates['Contract_ACV_USD'].sum() if not df_creates.empty else 0
    
    # Proposed state
    proposed_sf_total = current_sf_total + acv_increases + acv_decreases + new_opp_acv
    
    impact = {
        'Target_Total_USD': target_total,
        'Current_SF_Total': current_sf_total,
        'Current_Coverage_Pct': (current_sf_total / target_total * 100) if target_total else 0,
        'ACV_Increases': acv_increases,
        'ACV_Decreases': acv_decreases,
        'New_Opp_ACV': new_opp_acv,
        'Net_Change': acv_increases + acv_decreases + new_opp_acv,
        'Proposed_SF_Total': proposed_sf_total,
        'Proposed_Coverage_Pct': (proposed_sf_total / target_total * 100) if target_total else 0,
        'Gap_Remaining': target_total - proposed_sf_total
    }
    
    print(f"\n{'='*50}")
    print("IMPACT SUMMARY")
    print(f"{'='*50}")
    print(f"Target (RR Benchmark):     ${impact['Target_Total_USD']:>15,.2f}")
    print(f"Current SF Total:          ${impact['Current_SF_Total']:>15,.2f}")
    print(f"Current Coverage:          {impact['Current_Coverage_Pct']:>14.1f}%")
    print(f"{'='*50}")
    print(f"ACV Increases:             ${impact['ACV_Increases']:>15,.2f}")
    print(f"ACV Decreases:             ${impact['ACV_Decreases']:>15,.2f}")
    print(f"New Opportunities:         ${impact['New_Opp_ACV']:>15,.2f}")
    print(f"Net Change:                ${impact['Net_Change']:>15,.2f}")
    print(f"{'='*50}")
    print(f"Proposed SF Total:         ${impact['Proposed_SF_Total']:>15,.2f}")
    print(f"Proposed Coverage:         {impact['Proposed_Coverage_Pct']:>14.1f}%")
    print(f"Remaining Gap:             ${impact['Gap_Remaining']:>15,.2f}")
    print(f"{'='*50}")
    
    return impact

def run_validation_checks(df_matches, df_recon, impact):
    """Run risk validation checks"""
    print("\n" + "=" * 80)
    print("PHASE 8: RISK VALIDATION CHECKS")
    print("=" * 80)
    
    issues = []
    
    # Check 1: Large single changes
    large_changes = df_matches[abs(df_matches['ACV_Variance']) > 100000]
    if not large_changes.empty:
        for _, row in large_changes.iterrows():
            issues.append({
                'Check': 'LARGE_SINGLE_CHANGE',
                'Severity': 'HIGH',
                'Item': f"{row['Client']} - {row['Contract']}",
                'Details': f"ACV change of ${row['ACV_Variance']:,.0f}",
                'Action': 'Manual review required'
            })
    
    # Check 2: ACV decreases
    decreases = df_matches[df_matches['ACV_Variance'] < 0]
    for _, row in decreases.iterrows():
        issues.append({
            'Check': 'ACV_DECREASE',
            'Severity': 'MEDIUM',
            'Item': f"{row['Client']} - {row['SF_Opp_Name']}",
            'Details': f"Would decrease from ${row['SF_ACV']:,.0f} to ${row['Contract_ACV_USD']:,.0f}",
            'Action': 'Verify contract is current'
        })
    
    # Check 3: Accounts going over target
    over_accounts = df_recon[df_recon['Status'] == 'OVER']
    for _, row in over_accounts.iterrows():
        issues.append({
            'Check': 'OVER_TARGET',
            'Severity': 'MEDIUM',
            'Item': row['RR_Account'],
            'Details': f"SF ${row['SF_Total_ACV']:,.0f} > Target ${row['Target_USD']:,.0f}",
            'Action': 'Review for duplicates or closed deals'
        })
    
    # Check 4: Low match confidence
    weak_matches = df_matches[df_matches['Match_Type'] == 'WEAK_MATCH']
    for _, row in weak_matches.iterrows():
        issues.append({
            'Check': 'LOW_CONFIDENCE_MATCH',
            'Severity': 'LOW',
            'Item': f"{row['Client']} - {row['Contract']}",
            'Details': f"Match score: {row['Match_Score']:.0f}",
            'Action': 'Verify correct opportunity matched'
        })
    
    df_issues = pd.DataFrame(issues)
    
    print(f"\nValidation Issues Found:")
    print(f"  HIGH severity: {len(df_issues[df_issues['Severity'] == 'HIGH'])}")
    print(f"  MEDIUM severity: {len(df_issues[df_issues['Severity'] == 'MEDIUM'])}")
    print(f"  LOW severity: {len(df_issues[df_issues['Severity'] == 'LOW'])}")
    
    return df_issues

def generate_outputs(df_recon, df_matches, updates, creates, df_updates, df_issues, impact):
    """Generate all output files"""
    print("\n" + "=" * 80)
    print("PHASE 9: GENERATING OUTPUT FILES")
    print("=" * 80)
    
    # Create impact summary dataframe
    df_impact = pd.DataFrame([impact])
    
    # Write to Excel
    with pd.ExcelWriter(OUTPUT_FILE, engine='openpyxl') as writer:
        # Sheet 1: Account Summary
        df_recon.to_excel(writer, sheet_name='Account Summary', index=False)
        
        # Sheet 2: All Matches
        df_matches.to_excel(writer, sheet_name='Contract-Opp Matches', index=False)
        
        # Sheet 3: Updates Needed
        if not updates.empty:
            updates.to_excel(writer, sheet_name='Opp Updates Needed', index=False)
        
        # Sheet 4: New Opps to Create
        if not creates.empty:
            creates.to_excel(writer, sheet_name='New Opps to Create', index=False)
        
        # Sheet 5: DataLoader Format
        if not df_updates.empty:
            df_updates.to_excel(writer, sheet_name='DataLoader Updates', index=False)
        
        # Sheet 6: Risk Flags
        if not df_issues.empty:
            df_issues.to_excel(writer, sheet_name='Risk Flags', index=False)
        
        # Sheet 7: Impact Summary
        df_impact.to_excel(writer, sheet_name='Impact Summary', index=False)
    
    print(f"\nMaster workbook saved to: {OUTPUT_FILE}")
    print(f"\nSheets created:")
    print(f"  - Account Summary: {len(df_recon)} accounts")
    print(f"  - Contract-Opp Matches: {len(df_matches)} matches")
    print(f"  - Opp Updates Needed: {len(updates)} updates")
    print(f"  - New Opps to Create: {len(creates)} new opps")
    print(f"  - DataLoader Updates: {len(df_updates)} records")
    print(f"  - Risk Flags: {len(df_issues)} issues")
    print(f"  - Impact Summary: Overall impact analysis")
    
    return OUTPUT_FILE

def main():
    print("\n" + "=" * 80)
    print("JH AUDIT RECONCILIATION - COMPREHENSIVE ANALYSIS")
    print(f"Run Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Phase 1: Load November RR
    df_rr = load_november_rr()
    
    # Phase 2: Load SF Opportunities
    df_sf, df_sf_summary = load_sf_opportunities()
    
    # Phase 3: Load and convert contracts
    df_contracts = load_contracts()
    
    # Phase 4: Account-level reconciliation
    df_recon = build_account_reconciliation(df_rr, df_sf_summary, df_contracts)
    
    # Phase 5: Enhanced matching
    df_matches = enhanced_opportunity_matching(df_sf, df_contracts)
    
    # Phase 6: Classify and generate updates
    updates, creates, no_change, reviews, df_updates = classify_and_generate_updates(df_matches, df_sf)
    
    # Phase 7: Impact analysis
    impact = calculate_impact(df_recon, df_matches, df_updates, creates)
    
    # Phase 8: Validation checks
    df_issues = run_validation_checks(df_matches, df_recon, impact)
    
    # Phase 9: Generate outputs
    output_file = generate_outputs(df_recon, df_matches, updates, creates, df_updates, df_issues, impact)
    
    print("\n" + "=" * 80)
    print("AUDIT RECONCILIATION COMPLETE")
    print("=" * 80)
    print(f"\nReview the output file: {output_file}")
    print("\nNext steps:")
    print("1. Review 'Risk Flags' sheet for items requiring manual attention")
    print("2. Validate 'Opp Updates Needed' against source contracts")
    print("3. Review 'New Opps to Create' for potential duplicates")
    print("4. Use 'DataLoader Updates' sheet for Salesforce import")
    
    return df_recon, df_matches, impact

if __name__ == "__main__":
    main()




