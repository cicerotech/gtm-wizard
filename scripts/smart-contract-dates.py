#!/usr/bin/env python3
"""
Smart Contract Dates - Based on Opp Close Dates and MoM RR First Appearance
"""

import pandas as pd
from datetime import datetime
import numpy as np

# Load opps for close dates and terms
opps = pd.read_excel('/Users/keiganpesenti/Desktop/jh opps.xlsx', sheet_name='JH')

# Month mapping for MoM inference
MONTH_TO_DATE = {
    'Jan': '2024-01-15',
    'Feb': '2024-02-15', 
    'Mar': '2024-03-15',
    'Apr': '2024-04-15',
    'May': '2024-05-15',
    'Jun': '2024-06-15',
    'Jul': '2024-07-15',
    'Aug': '2024-08-15',
    'Sep': '2024-09-15',
    'Oct': '2024-10-15',
    'Nov': '2024-11-15',
    'Dec': '2024-12-15'
}

# MoM first appearance data from screenshot (column with first $)
# Format: Account -> (first_month_with_revenue, approximate_start_date)
mom_first_revenue = {
    'ACS': ('Jan-2024', '2024-01-01'),
    'Airbnb': ('Jan-2024', '2024-01-01'),
    'Airship': ('Jan-2024', '2024-01-01'),
    'Aryza': ('Nov-2024', '2024-11-01'),  # Only has Nov value
    'BOI': ('Jan-2024', '2024-01-01'),
    'Coimisiún na Meán': ('Aug-2024', '2024-08-01'),  # First appears Aug
    'CommScope': ('Jan-2024', '2024-01-01'),
    'Consensys': ('Mar-2024', '2024-03-01'),
    'Datalex': ('Jan-2024', '2024-01-01'),
    'Dropbox': ('Jan-2024', '2024-01-01'),
    'ESB': ('Jan-2024', '2024-01-01'),
    'Etsy': ('Jan-2024', '2024-01-01'),
    'Gilead': ('Apr-2024', '2024-04-01'),  # First appears Apr
    'Glanbia': ('Jan-2024', '2024-01-01'),
    'Indeed': ('Jan-2024', '2024-01-01'),
    'Irish Water': ('Jan-2024', '2024-01-01'),
    'Kellanova': ('Jun-2024', '2024-06-01'),  # First appears Jun
    'Kingspan': ('Oct-2024', '2024-10-01'),  # First appears Oct
    'Northern Trust': ('Apr-2024', '2024-04-01'),  # First appears Apr
    'OpenAi': ('Jan-2024', '2024-01-01'),
    'Orsted': ('May-2024', '2024-05-01'),  # First appears May
    'Perrigo': ('Jul-2024', '2024-07-01'),  # First appears Jul
    'Sisk': ('Feb-2024', '2024-02-01'),
    'Stripe': ('Jan-2024', '2024-01-01'),
    'Taoglas': ('May-2024', '2024-05-01'),  # First appears May
    'Teamwork': ('Jan-2024', '2024-01-01'),
    'TikTok': ('Jan-2024', '2024-01-01'),
    'Tinder': ('Jan-2024', '2024-01-01'),
    'Udemy': ('Jan-2024', '2024-01-01'),
    'Coillte': ('Feb-2024', '2024-02-01'),  # First appears Feb
    'Coleman Legal': ('Jan-2024', '2024-01-01'),
    'Creed McStay': ('Mar-2024', '2024-03-01'),  # First appears Mar
    'DCEDIY': ('May-2024', '2024-05-01'),  # First appears May
    'Hayes': ('Feb-2024', '2024-02-01'),  # First appears Feb
    'NTMA': ('Jun-2024', '2024-06-01'),  # First appears Jun
}

# Account name mapping to find opps
account_mapping = {
    'Udemy': 'Udemy Ireland',
    'Coillte': 'Coillte',
    'NTMA': 'NTMA',
    'ACS': 'Arabic Computer Systems',
    'Kingspan': 'Kingspan',
    'Hayes': 'Hayes Solicitors',
    'Creed McStay': 'McDermott Creed',
    'DCEDIY': 'Department of Children',
    'Coleman Legal': 'Coleman Legal',
    'Irish Water': 'Uisce Eireann',
    'Indeed': 'Indeed Ireland',
    'Etsy': 'Etsy Ireland',
    'TikTok': 'Tiktok Information',
    'Tinder': 'Tinder',
    'Dropbox': 'Dropbox International',
    'Coimisiún na Meán': 'Coimisiun',
    'OpenAi': 'OpenAi',
    'BOI': 'Bank of Ireland',
    'Stripe': 'Stripe Payments',
    'ESB': 'ESB',
    'Perrigo': 'Perrigo'
}

def find_best_opp_match(account_short_name, target_acv):
    """Find the best matching opp for an account based on revenue alignment"""
    search_term = account_mapping.get(account_short_name, account_short_name)
    matching = opps[opps['Account Name'].str.contains(search_term, case=False, na=False)]
    
    if len(matching) == 0:
        return None
    
    # Sort by revenue descending
    matching = matching.sort_values('Revenue', ascending=False)
    
    # Return the top match
    return matching.iloc[0]

def get_smart_dates(account_short_name, target_acv):
    """Get smart start date and term based on opps and MoM data"""
    
    # First, try to find a matching opp
    best_opp = find_best_opp_match(account_short_name, target_acv)
    
    if best_opp is not None and pd.notna(best_opp['Close Date']):
        # Use opp close date and term
        close_date = best_opp['Close Date']
        term = best_opp['Term (Months)'] if pd.notna(best_opp['Term (Months)']) and best_opp['Term (Months)'] > 0 else 12
        
        # Parse close date
        if isinstance(close_date, str):
            try:
                # Try MM/DD/YYYY format
                dt = datetime.strptime(close_date, '%m/%d/%Y')
                start_date = dt.strftime('%Y-%m-%d')
            except:
                start_date = '2024-01-01'
        else:
            start_date = close_date.strftime('%Y-%m-%d') if hasattr(close_date, 'strftime') else '2024-01-01'
        
        return {
            'start_date': start_date,
            'term': int(term) if term > 0 else 12,
            'source': f"Opp: {best_opp['Opportunity Name'][:40]}",
            'opp_revenue': best_opp['Revenue']
        }
    
    # Fall back to MoM data
    if account_short_name in mom_first_revenue:
        first_month, start_date = mom_first_revenue[account_short_name]
        return {
            'start_date': start_date,
            'term': 12,  # Default 12 months
            'source': f"MoM First Revenue: {first_month}",
            'opp_revenue': None
        }
    
    # Default fallback
    return {
        'start_date': '2024-01-01',
        'term': 12,
        'source': 'Default',
        'opp_revenue': None
    }

# ============================================================================
# BUILD NEW CONTRACTS WITH SMART DATES
# ============================================================================

# Account IDs from opps
account_ids = {}
for _, row in opps.iterrows():
    if pd.notna(row['Account ID']) and pd.notna(row['Account Name']):
        account_ids[row['Account Name']] = row['Account ID']

DEFAULT_OWNER = '005Wj000002YqYQIA0'

new_contracts = []

# Define contracts to create with target ACVs
contracts_to_create = [
    ('Udemy', 533722, 'Udemy - Active JH Contracts'),
    ('Coillte', 194838, 'Coillte - First Registration & Rights of Way'),
    ('NTMA', 170691, 'NTMA - Mother & Baby Homes Discovery'),
    ('ACS', 156453, 'ACS - Ediscovery Tech Support'),
    ('Kingspan', 97086, 'Kingspan - Legal Support Services'),
    ('Hayes', 69387, 'Hayes Solicitors - Legal Support'),
    ('Creed McStay', 38804, 'Creed McStay - Legal Support'),
    ('DCEDIY', 37153, 'DCEDIY - Legal Support'),
    ('Coleman Legal', 16653, 'Coleman Legal - Support'),
    ('Irish Water', 279952, 'Irish Water - Additional CDS/CPO Contracts'),
    ('Indeed', 267846, 'Indeed - Additional Active Contracts'),
    ('Etsy', 238330, 'Etsy - Additional Privacy Support'),
    ('TikTok', 156960, 'TikTok - Additional DSAR/TDR Contracts'),
    ('Tinder', 142576, 'Tinder - Mat Leave Extension'),
    ('Dropbox', 165037, 'Dropbox - Additional CC Support'),
    ('Coimisiún na Meán', 222195, 'Coimisiún na Meán - Additional Litigation'),
    ('OpenAi', 632428, 'OpenAI - Additional DPA Support'),
]

print("="*120)
print("SMART CONTRACT DATES - Based on Opp Close Dates and MoM First Revenue")
print("="*120)

for account_short, target_acv, contract_name in contracts_to_create:
    dates = get_smart_dates(account_short, target_acv)
    
    # Find account ID
    search_term = account_mapping.get(account_short, account_short)
    acct_id = None
    for name, aid in account_ids.items():
        if search_term.lower() in name.lower():
            acct_id = aid
            break
    
    if acct_id is None:
        acct_id = 'LOOKUP_REQUIRED'
    
    # Determine contract type based on term
    contract_type = 'Recurring' if dates['term'] >= 12 else 'Project'
    
    contract = {
        'AccountId': acct_id,
        'Contract_Name_Campfire__c': contract_name,
        'StartDate': dates['start_date'],
        'ContractTerm': dates['term'],
        'Contract_Type__c': contract_type,
        'Status': 'Draft',
        'OwnerId': DEFAULT_OWNER,
        'AI_Enabled__c': 'TRUE',
        'Currency__c': 'USD',
        'Annualized_Revenue__c': target_acv,
        'Contract_Value__c': target_acv * (dates['term'] / 12) if dates['term'] < 12 else target_acv,
        'Parent_Product__c': 'Other',
        'Description': dates['source']
    }
    
    new_contracts.append(contract)
    
    print(f"\n{account_short}:")
    print(f"  Start Date: {dates['start_date']}")
    print(f"  Term: {dates['term']} months")
    print(f"  Source: {dates['source']}")
    if dates['opp_revenue']:
        print(f"  Matched Opp Revenue: ${dates['opp_revenue']:,.0f}")

# ============================================================================
# UPDATES TO EXISTING (with smart dates based on opps)
# ============================================================================

print("\n\n" + "="*120)
print("UPDATES TO EXISTING CONTRACTS")
print("="*120)

# For updates, we keep existing contract dates but add the missing ACV
updates = [
    {
        'Id': '800Wj00000pZnlJ',
        'Annualized_Revenue__c': 1376400,
        'Contract_Value__c': 2752800,
        'Description': 'BOI Tracker Amendment - aligns to Nov RR'
    },
    {
        'Id': '800Wj00000pZnlX', 
        'Annualized_Revenue__c': 452105,
        'Contract_Value__c': 452105,
        'Description': 'ESB SOW - aligns to Nov RR'
    },
    {
        'Id': '800Wj00000pZnlj',
        'Annualized_Revenue__c': 79394,
        'Contract_Value__c': 79394,
        'Description': 'Perrigo Change Order - aligns to Nov RR'
    },
    {
        'Id': '800Wj00000pZnlq',
        'Annualized_Revenue__c': 1171179,
        'Contract_Value__c': 3513537,
        'Description': 'Stripe SFA - aligns to Nov RR'
    }
]

for u in updates:
    print(f"  {u['Id']}: ${u['Annualized_Revenue__c']:,.0f}")

# ============================================================================
# SAVE FILES
# ============================================================================

# Save new contracts
new_df = pd.DataFrame(new_contracts)
new_df.to_csv('/Users/keiganpesenti/Desktop/JH_Contract_INSERTS_SMARTDATES.csv', index=False)

# Save updates
update_df = pd.DataFrame(updates)
update_df.to_csv('/Users/keiganpesenti/Desktop/JH_Contract_UPDATES_FINAL.csv', index=False)

# Combined Excel
with pd.ExcelWriter('/Users/keiganpesenti/Desktop/JH_Contract_DATALOADER_SMARTDATES.xlsx') as writer:
    update_df.to_excel(writer, sheet_name='UPDATES', index=False)
    new_df.to_excel(writer, sheet_name='INSERTS', index=False)

print("\n\n" + "="*120)
print("SUMMARY")
print("="*120)

print("\nNEW CONTRACTS WITH SMART DATES:")
print(new_df[['Contract_Name_Campfire__c', 'StartDate', 'ContractTerm', 'Annualized_Revenue__c', 'Description']].to_string())

print("\n\n✓ SAVED FILES:")
print("  1. ~/Desktop/JH_Contract_UPDATES_FINAL.csv")
print("  2. ~/Desktop/JH_Contract_INSERTS_SMARTDATES.csv")
print("  3. ~/Desktop/JH_Contract_DATALOADER_SMARTDATES.xlsx")


