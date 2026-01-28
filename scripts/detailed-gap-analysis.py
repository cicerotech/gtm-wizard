#!/usr/bin/env python3
"""
Detailed Gap Analysis - What's missing from contracts?
"""

import pandas as pd
import numpy as np

# Load files
opps_to_update = pd.read_excel('/Users/keiganpesenti/Desktop/JH opps to update.xlsx')
contracts = pd.read_excel('/Users/keiganpesenti/Desktop/Loaded Contracts.xlsx')

print("="*120)
print("DETAILED GAP ANALYSIS")
print("="*120)

# Show contract summary
print("\n" + "="*80)
print("LOADED CONTRACTS SUMMARY")
print("="*80)
print(f"\nTotal Contracts: {len(contracts)}")
print(f"Total Contract ACV: ${contracts['Annual Contract Value'].sum():,.2f}")

# Show by account in contracts
contract_summary = contracts.groupby('Account Name').agg({
    'Annual Contract Value': 'sum',
    'Contract Name (Campfire)': 'count'
}).rename(columns={'Contract Name (Campfire)': 'Count'})
contract_summary = contract_summary.sort_values('Annual Contract Value', ascending=False)
print("\nContract ACV by Account:")
print(contract_summary.head(20))

# Show opp summary
print("\n" + "="*80)
print("OPPS TO UPDATE SUMMARY") 
print("="*80)
print(f"\nTotal Opps: {len(opps_to_update)}")
print(f"Total Opp Revenue: ${opps_to_update['Revenue'].sum():,.2f}")

# Show by account in opps
opp_summary = opps_to_update.groupby('Account Name').agg({
    'Revenue': 'sum',
    'Opportunity Name': 'count'
}).rename(columns={'Opportunity Name': 'Count'})
opp_summary = opp_summary.sort_values('Revenue', ascending=False)
print("\nOpp Revenue by Account:")
print(opp_summary.head(20))

# Show accounts in Opps but NOT in Contracts (with revenue)
print("\n" + "="*80)
print("ACCOUNTS IN OPPS BUT NOT IN CONTRACTS (MISSING!)")
print("="*80)

opp_accounts = set(opps_to_update['Account Name'].unique())
contract_accounts = set(contracts['Account Name'].unique())

missing_from_contracts = opp_accounts - contract_accounts
print(f"\nAccounts in Opps but NOT in Contracts: {len(missing_from_contracts)}")

missing_rev = opps_to_update[opps_to_update['Account Name'].isin(missing_from_contracts)].groupby('Account Name')['Revenue'].sum()
missing_rev = missing_rev.sort_values(ascending=False)
print(f"\nMissing Revenue: ${missing_rev.sum():,.2f}")
print("\nMissing accounts by revenue:")
for acct, rev in missing_rev.items():
    print(f"  {acct}: ${rev:,.2f}")

# Show accounts in Contracts but NOT in Opps
extra_in_contracts = contract_accounts - opp_accounts
print(f"\n\nAccounts in Contracts but NOT in Opps: {extra_in_contracts}")

# SHOW THE STRATEGY
print("\n" + "="*120)
print("STRATEGY TO ALIGN")
print("="*120)

print("""
OPTION A: UPDATE CONTRACTS TO MATCH OPPS
-----------------------------------------
- Opps are the source of truth (already validated against Nov RR)
- Contracts need to be updated/added to match opp revenue
- This means adding more contracts for the missing $7.1M

OPTION B: UPDATE OPPS TO MATCH CONTRACTS  
-----------------------------------------
- Contracts are the source of truth (signed agreements)
- Opps need to be updated to match contract values
- This would REDUCE opp revenue from $10.9M to $3.8M (UNLIKELY CORRECT)

OPTION C: HYBRID APPROACH (RECOMMENDED)
-----------------------------------------
- For accounts WHERE WE HAVE CONTRACTS: Update opps to match contract terms
- For accounts WITHOUT CONTRACTS: Keep opps as-is (they represent real revenue)
- Missing contracts need to be sourced/created later

CURRENT STATE:
- Contract ACV: $3,797,194
- Opp Revenue: $10,888,813
- Gap: $7,091,619 (65% of opp revenue has no contract!)

QUESTION: Are the opps correct and contracts incomplete?
OR are contracts correct and opps overstated?
""")

# Create recommendation file
print("\n\nCreating recommendations for accounts WITH contracts...")

# For accounts that have BOTH contracts and opps, compare and recommend
both = opp_accounts & contract_accounts
recommendations = []

for acct in both:
    c_acv = contracts[contracts['Account Name'] == acct]['Annual Contract Value'].sum()
    o_rev = opps_to_update[opps_to_update['Account Name'] == acct]['Revenue'].sum()
    opp_count = len(opps_to_update[opps_to_update['Account Name'] == acct])
    contract_count = len(contracts[contracts['Account Name'] == acct])
    
    delta = c_acv - o_rev
    
    recommendations.append({
        'Account': acct,
        'Contract_ACV': c_acv,
        'Contract_Count': contract_count,
        'Opp_Revenue': o_rev,
        'Opp_Count': opp_count,
        'Delta': delta,
        'Recommendation': 'Update Opps to match Contract' if abs(delta) > 1000 else 'OK - Already aligned'
    })

rec_df = pd.DataFrame(recommendations)
rec_df = rec_df.sort_values('Delta', key=abs, ascending=False)
print(f"\n{len(rec_df)} accounts with both contracts and opps:")
print(rec_df.to_string(index=False))

rec_df.to_excel('/Users/keiganpesenti/Desktop/JH_Contract_Opp_Recommendations.xlsx', index=False)
print("\n\nSaved: ~/Desktop/JH_Contract_Opp_Recommendations.xlsx")





