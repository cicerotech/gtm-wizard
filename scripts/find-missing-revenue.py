#!/usr/bin/env python3
"""
Find Missing Revenue - Compare Contracts vs Won Opportunities
"""

import pandas as pd
import numpy as np

# Load jh opps
opps = pd.read_excel('/Users/keiganpesenti/Desktop/jh opps.xlsx', sheet_name='JH')

# Load contracts
contracts = pd.read_excel('/Users/keiganpesenti/Desktop/JH_Contracts_FINAL_UPLOAD.xlsx')

print("="*100)
print("JH OPPS vs CONTRACTS RECONCILIATION")
print("="*100)

print(f"\nTotal Opps: {len(opps)}")
print(f"Total Opp Revenue: ${opps['Revenue'].sum():,.2f}")
print(f"\nTotal Contracts: {len(contracts)}")

# Clean up contract data - get ACV from contracts
contracts_clean = contracts.copy()
# Try to get monetary values - Contract_Value__c or Annualized_Revenue__c
if 'Contract_Value__c' in contracts.columns:
    contracts_clean['ACV'] = pd.to_numeric(contracts['Contract_Value__c'], errors='coerce').fillna(0)
elif 'Annualized_Revenue__c' in contracts.columns:
    contracts_clean['ACV'] = pd.to_numeric(contracts['Annualized_Revenue__c'], errors='coerce').fillna(0)
else:
    contracts_clean['ACV'] = 0

print(f"Total Contract ACV: ${contracts_clean['ACV'].sum():,.2f}")

# Group opps by account
opps_by_account = opps.groupby('Account Name')['Revenue'].agg(['sum', 'count']).reset_index()
opps_by_account.columns = ['Account', 'Opp_Revenue', 'Opp_Count']
opps_by_account = opps_by_account.sort_values('Opp_Revenue', ascending=False)

print("\n" + "="*100)
print("TOP 30 ACCOUNTS BY OPP REVENUE")
print("="*100)
print(opps_by_account.head(30).to_string(index=False))
print(f"\nTotal: ${opps_by_account['Opp_Revenue'].sum():,.2f} across {opps_by_account['Opp_Count'].sum()} opps")

# Now identify duplicates - same opp name
print("\n" + "="*100)
print("DUPLICATE OPPORTUNITY NAMES (Potential Duplicates from Migration)")
print("="*100)

opp_name_counts = opps.groupby('Opportunity Name').size().reset_index(name='Count')
duplicates = opp_name_counts[opp_name_counts['Count'] > 1].sort_values('Count', ascending=False)
print(f"\nFound {len(duplicates)} duplicate opportunity names:")

for idx, row in duplicates.head(20).iterrows():
    dupe_opps = opps[opps['Opportunity Name'] == row['Opportunity Name']]
    total_rev = dupe_opps['Revenue'].sum()
    print(f"\n  '{row['Opportunity Name'][:60]}...' (x{row['Count']})")
    print(f"    Total Revenue: ${total_rev:,.2f}")
    for _, opp in dupe_opps.iterrows():
        print(f"      - {opp['Account Name']}: ${opp['Revenue']:,.2f}")

# Calculate duplicate revenue
duplicate_opp_names = duplicates['Opportunity Name'].tolist()
duplicate_opps = opps[opps['Opportunity Name'].isin(duplicate_opp_names)]
duplicate_revenue = duplicate_opps['Revenue'].sum()
print(f"\n\nTOTAL REVENUE IN DUPLICATE OPP NAMES: ${duplicate_revenue:,.2f}")

# Accounts with NO Recurring tag - potential missing revenue type
print("\n" + "="*100)
print("OPPS WITHOUT RECURRING/PROJECT TAG (Revenue Type = NaN)")
print("="*100)

no_tag = opps[opps['Recurring, Project, or Commit'].isna()]
print(f"Opps without tag: {len(no_tag)}")
print(f"Revenue without tag: ${no_tag['Revenue'].sum():,.2f}")

no_tag_by_acct = no_tag.groupby('Account Name')['Revenue'].agg(['sum', 'count']).reset_index()
no_tag_by_acct.columns = ['Account', 'Revenue', 'Count']
no_tag_by_acct = no_tag_by_acct.sort_values('Revenue', ascending=False)
print("\nTop accounts with untagged opps:")
print(no_tag_by_acct.head(20).to_string(index=False))

# Compare accounts in opps vs accounts in contracts
print("\n" + "="*100)
print("ACCOUNTS IN OPPS BUT NOT IN CONTRACTS (MISSING FROM CONTRACT UPLOAD)")
print("="*100)

opp_accounts = set(opps['Account Name'].unique())
# Contract accounts are harder to match since they use IDs, but let's try to extract from name
contract_accounts = set()
if 'Contract_Name_Campfire__c' in contracts.columns:
    for name in contracts['Contract_Name_Campfire__c'].dropna():
        # Extract account name from contract name (typically before the first " - ")
        if ' - ' in str(name):
            acct = str(name).replace('[Review ACV] ', '').split(' - ')[0]
            contract_accounts.add(acct)

print(f"\nUnique accounts in Opps: {len(opp_accounts)}")
print(f"Unique accounts extracted from Contracts: {len(contract_accounts)}")

# Fuzzy match - check which opp accounts aren't in contracts
missing_from_contracts = []
for acct in opp_accounts:
    found = False
    acct_lower = acct.lower().strip()
    for c_acct in contract_accounts:
        if c_acct.lower().strip() in acct_lower or acct_lower in c_acct.lower().strip():
            found = True
            break
    if not found:
        rev = opps[opps['Account Name'] == acct]['Revenue'].sum()
        missing_from_contracts.append({'Account': acct, 'Revenue': rev})

missing_df = pd.DataFrame(missing_from_contracts)
if len(missing_df) > 0:
    missing_df = missing_df.sort_values('Revenue', ascending=False)
    print("\nAccounts with Opps but NO matching Contract:")
    print(missing_df.head(30).to_string(index=False))
    print(f"\nTotal Missing Revenue (no contract): ${missing_df['Revenue'].sum():,.2f}")

# Summary
print("\n" + "="*100)
print("SUMMARY - POTENTIAL PLACES TO FIND MISSING REVENUE")
print("="*100)

print(f"""
1. DUPLICATE OPP NAMES: ${duplicate_revenue:,.2f}
   - These may be duplicates from migration that should be consolidated
   
2. UNTAGGED OPPS (no Recurring/Project): ${no_tag['Revenue'].sum():,.2f}
   - May need revenue type classification

3. ACCOUNTS WITHOUT CONTRACTS: ${missing_df['Revenue'].sum() if len(missing_df) > 0 else 0:,.2f}
   - May need contracts uploaded for these accounts
   
4. CONTRACT vs OPP GAP: ${opps['Revenue'].sum() - contracts_clean['ACV'].sum():,.2f}
   - Opps Revenue: ${opps['Revenue'].sum():,.2f}
   - Contracts ACV: ${contracts_clean['ACV'].sum():,.2f}
""")

# Export detailed analysis
output = pd.DataFrame()
output['Account'] = opps_by_account['Account']
output['Opp_Revenue'] = opps_by_account['Opp_Revenue']
output['Opp_Count'] = opps_by_account['Opp_Count']
output.to_excel('/Users/keiganpesenti/Desktop/JH_Revenue_Gap_Analysis.xlsx', index=False)
print("Saved: ~/Desktop/JH_Revenue_Gap_Analysis.xlsx")




