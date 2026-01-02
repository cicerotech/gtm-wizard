#!/usr/bin/env python3
"""
Align Opps to Contracts - Ensure everything ties together
"""

import pandas as pd
import numpy as np

# Load files
opps_to_update = pd.read_excel('/Users/keiganpesenti/Desktop/JH opps to update.xlsx')
contracts = pd.read_excel('/Users/keiganpesenti/Desktop/Loaded Contracts.xlsx')

print("="*120)
print("ALIGNING OPPORTUNITIES TO CONTRACTS")
print("="*120)

print(f"\nOpps to Update: {len(opps_to_update)} records")
print(f"Total Opp Revenue: ${opps_to_update['Revenue'].sum():,.2f}")
print(f"\nLoaded Contracts: {len(contracts)} records")
print(f"Total Contract ACV: ${contracts['Annual Contract Value'].sum():,.2f}")

# Create contract lookup by account
contract_by_account = {}
for _, row in contracts.iterrows():
    acct = row['Account Name']
    if acct not in contract_by_account:
        contract_by_account[acct] = []
    contract_by_account[acct].append({
        'name': row['Contract Name (Campfire)'],
        'acv': row['Annual Contract Value'] if pd.notna(row['Annual Contract Value']) else 0,
        'tcv': row['Total Contract Value'] if pd.notna(row['Total Contract Value']) else 0,
        'start': row['Contract Start Date'],
        'end': row['Contract End Date'],
        'id': row['Contract ID']
    })

# Sum contract ACV by account
contract_acv_by_account = {}
for acct, conts in contract_by_account.items():
    contract_acv_by_account[acct] = sum(c['acv'] for c in conts)

# Sum opp revenue by account
opp_rev_by_account = opps_to_update.groupby('Account Name')['Revenue'].sum().to_dict()

# Compare
print("\n" + "="*120)
print("ACCOUNT-LEVEL COMPARISON")
print("="*120)
print(f"\n{'Account':<50} {'Contract ACV':>15} {'Opp Revenue':>15} {'Delta':>15} {'Status'}")
print("-"*120)

all_accounts = set(list(contract_acv_by_account.keys()) + list(opp_rev_by_account.keys()))
discrepancies = []

for acct in sorted(all_accounts):
    c_acv = contract_acv_by_account.get(acct, 0)
    o_rev = opp_rev_by_account.get(acct, 0)
    delta = c_acv - o_rev
    
    if abs(delta) > 100:  # Significant difference
        status = "⚠️ MISMATCH"
        discrepancies.append({
            'Account': acct,
            'Contract_ACV': c_acv,
            'Opp_Revenue': o_rev,
            'Delta': delta
        })
    else:
        status = "✓ OK"
    
    if c_acv > 0 or o_rev > 0:
        print(f"{acct[:48]:<50} ${c_acv:>13,.0f} ${o_rev:>13,.0f} ${delta:>13,.0f} {status}")

print("\n" + "="*120)
print(f"DISCREPANCIES FOUND: {len(discrepancies)}")
print("="*120)

# Detailed discrepancy analysis
if discrepancies:
    disc_df = pd.DataFrame(discrepancies)
    disc_df = disc_df.sort_values('Delta', key=abs, ascending=False)
    print("\nTop discrepancies to resolve:")
    print(disc_df.head(20).to_string(index=False))

# Create DataLoader update file for opps
print("\n\n" + "="*120)
print("OPP UPDATE RECOMMENDATIONS")
print("="*120)

opp_updates = []

for _, opp in opps_to_update.iterrows():
    acct = opp['Account Name']
    opp_rev = opp['Revenue']
    opp_term = opp['Term (Months)']
    opp_id = opp['Opportunity ID']
    opp_name = opp['Opportunity Name']
    
    # Find matching contract
    if acct in contract_by_account:
        contracts_for_acct = contract_by_account[acct]
        
        # Try to find best match
        for contract in contracts_for_acct:
            c_acv = contract['acv']
            
            # If contract ACV is significantly different from opp revenue
            if abs(c_acv - opp_rev) > 1000 and c_acv > 0:
                # Check if this opp should be updated to match contract
                # (only if it's the primary opp for this account)
                pass

# For now, let's just verify which opps align to contracts
print("\nOpps that appear to MATCH contracts:")
matched = 0
unmatched = []

for _, opp in opps_to_update.iterrows():
    acct = opp['Account Name']
    opp_rev = opp['Revenue']
    
    c_acv = contract_acv_by_account.get(acct, 0)
    
    # Check if this opp's revenue is close to contract ACV
    if c_acv > 0:
        if abs(opp_rev - c_acv) < 1000:
            matched += 1
        else:
            unmatched.append({
                'Account': acct,
                'Opp_Name': opp['Opportunity Name'][:50],
                'Opp_ID': opp['Opportunity ID'],
                'Opp_Revenue': opp_rev,
                'Contract_ACV': c_acv,
                'Delta': opp_rev - c_acv
            })

print(f"\nMatched opps: {matched}")
print(f"Unmatched opps: {len(unmatched)}")

# Show unmatched for review
if unmatched:
    print("\nUnmatched opps (may need updates):")
    unmatched_df = pd.DataFrame(unmatched)
    unmatched_df = unmatched_df.sort_values('Delta', key=abs, ascending=False)
    print(unmatched_df.head(30).to_string(index=False))

# Save analysis
analysis = opps_to_update.copy()
analysis['Contract_ACV'] = analysis['Account Name'].map(contract_acv_by_account).fillna(0)
analysis['Delta'] = analysis['Revenue'] - analysis['Contract_ACV']
analysis['Needs_Review'] = abs(analysis['Delta']) > 1000

analysis.to_excel('/Users/keiganpesenti/Desktop/JH_Opp_Contract_Alignment_Analysis.xlsx', index=False)
print("\n\nSaved: ~/Desktop/JH_Opp_Contract_Alignment_Analysis.xlsx")


