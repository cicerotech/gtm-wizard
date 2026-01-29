#!/usr/bin/env python3
"""
Compare Salesforce Contracts vs Opps - Find mismatches that need fixing
"""

import pandas as pd

# Data from screenshots - Salesforce Active Contracts by Type
contracts_data = {
    'Airbnb': 118250,
    'Airship Group Inc': 180000,
    'Arabic Computer Systems': 156453,
    'Aramark Ireland': 0,
    'Aryza': 230100,
    'Bank of Ireland': 1652400,
    'Coillte': 194838,
    'Coimisiun na Mean': 389675,  # Note: screenshot shows $389,675 in contracts? Let me check
    'Coleman Legal': 16653,
    'CommScope Technologies LLC': 150480,
    'Consensys': 69660,
    'Datalex (Ireland) Limited': 408000,
    'Department of Children, Disability and Equality': 37153,
    'Dropbox International Unlimited Company': 222037,
    'ESB NI/Electric Ireland': 473355,
    'Etsy Ireland UC': 304330,
    'Fox': 0,
    'Gilead Sciences': 162000,
    'Glanbia Management Services Limited': 72000,
    'Hayes Solicitors LLP': 69387,
    'Indeed Ireland Operations Limited': 417846,
    'Kellanova (Ireland)': 124800,
    'McDermott Creed & Martyn': 38804,
    'Northern Trust Management Services (Ireland) Limited': 129700,
    'NTMA': 170691,
    'OpenAi': 1537052,
    'Orsted': 67200,
    'Perrigo Pharma': 127394,
    'Sisk Group': 12000,
    'Stripe Payments Europe Limited': 1223979,
    'Taoglas Limited': 30000,
    'Teamwork Crew Limited T/A Teamwork.com': 1320,
    'Tesco': 97086,
    'Tiktok Information Technologies UK Limited': 208160,
    'Tinder LLC': 228976,
    'Udemy Ireland Limited': 533722,
    'Uisce Eireann (Irish Water)': 440882,
}

# Data from screenshots - Salesforce Active Revenue + Projects (Opps)
opps_data = {
    'Airbnb': 211907,
    'Airship Group Inc': 166528,
    'Arabic Computer Systems': 156453,
    'Aramark Ireland': 8700,
    'Aryza': 104080,
    'Bank of Ireland': 1652400,
    'Coillte': 194838,
    'Coimisiun na Mean': 524815,
    'Coleman Legal': 16653,
    'CommScope Technologies LLC': 158201,
    'Consensys': 79101,
    'Creed McStay': 38804,
    'Datalex (Ireland) Limited': 104913,
    'Department of Children, Disability and Equality': 37153,
    'Dropbox International Unlimited Company': 237813,
    'ESB NI/Electric Ireland': 473355,
    'Etsy Ireland UC': 304330,
    'Gilead Sciences': 186511,
    'Glanbia Management Services Limited': 90341,
    'Hayes Solicitors LLP': 69387,
    'ICON Clinical Research Limited': 9820,
    'Indeed Ireland Operations Limited': 417846,
    'Intuit': 75000,
    'Kellanova (Ireland)': 150291,
    'Kingspan': 97086,
    'LinkedIn Ireland Unlimited Company': 0,
    'Moy Park': 0,
    'Northern Trust Management Services (Ireland) Limited': 145712,
    'NTMA': 170691,
    'OpenAi': 1537052,
    'Orsted': 104080,
    'Perrigo Pharma': 208594,
    'Sequoia Climate Fund': 87000,
    'Sisk Group': 69387,
    'Stripe Payments Europe Limited': 1223979,
    'Taoglas Limited': 60783,
    'Teamwork Crew Limited T/A Teamwork.com': 70358,
    'Tiktok Information Technologies UK Limited': 296275,
    'Tinder LLC': 228976,
    'Udemy Ireland Limited': 533722,
    'Uisce Eireann (Irish Water)': 440882,
    'Wellspring Philanthropic Fund': 145000,
}

print("="*120)
print("SALESFORCE CONTRACTS vs OPPS COMPARISON")
print("="*120)

contracts_total = sum(contracts_data.values())
opps_total = sum(opps_data.values())

print(f"\nContracts Total: ${contracts_total:,.0f}")
print(f"Opps Total: ${opps_total:,.0f}")
print(f"Difference: ${opps_total - contracts_total:,.0f}")

# Compare account by account
all_accounts = set(list(contracts_data.keys()) + list(opps_data.keys()))

print("\n" + "="*120)
print("ACCOUNT-BY-ACCOUNT COMPARISON")
print("="*120)
print(f"\n{'Account':<55} {'Contract':>12} {'Opp':>12} {'Delta':>12} {'Status'}")
print("-"*120)

mismatches = []
matches = []

for acct in sorted(all_accounts):
    c_val = contracts_data.get(acct, 0)
    o_val = opps_data.get(acct, 0)
    delta = c_val - o_val
    
    if abs(delta) < 100:
        status = "✓ MATCH"
        matches.append(acct)
    elif c_val == 0 and o_val > 0:
        status = "⚠️ NO CONTRACT"
        mismatches.append({'Account': acct, 'Contract': c_val, 'Opp': o_val, 'Delta': delta, 'Issue': 'No Contract'})
    elif o_val == 0 and c_val > 0:
        status = "⚠️ NO OPP"
        mismatches.append({'Account': acct, 'Contract': c_val, 'Opp': o_val, 'Delta': delta, 'Issue': 'No Opp'})
    else:
        status = "❌ MISMATCH"
        mismatches.append({'Account': acct, 'Contract': c_val, 'Opp': o_val, 'Delta': delta, 'Issue': 'Value Mismatch'})
    
    print(f"{acct[:53]:<55} ${c_val:>10,.0f} ${o_val:>10,.0f} ${delta:>10,.0f} {status}")

print("\n" + "="*120)
print(f"MATCHES: {len(matches)}")
print(f"MISMATCHES: {len(mismatches)}")
print("="*120)

# Show mismatches that need fixing
if mismatches:
    print("\n\n" + "="*120)
    print("ITEMS THAT NEED ALIGNMENT")
    print("="*120)
    
    # Group by issue type
    value_mismatches = [m for m in mismatches if m['Issue'] == 'Value Mismatch']
    no_contracts = [m for m in mismatches if m['Issue'] == 'No Contract']
    no_opps = [m for m in mismatches if m['Issue'] == 'No Opp']
    
    if value_mismatches:
        print("\n📊 VALUE MISMATCHES (Contract ≠ Opp)")
        print("-"*80)
        for m in sorted(value_mismatches, key=lambda x: abs(x['Delta']), reverse=True):
            direction = "Contract > Opp" if m['Delta'] > 0 else "Opp > Contract"
            print(f"  {m['Account'][:45]:<47}: ${m['Contract']:>10,.0f} vs ${m['Opp']:>10,.0f} ({direction})")
    
    if no_contracts:
        print("\n📄 OPPS WITHOUT CONTRACTS")
        print("-"*80)
        for m in sorted(no_contracts, key=lambda x: x['Opp'], reverse=True):
            print(f"  {m['Account'][:45]:<47}: ${m['Opp']:>10,.0f} (needs contract)")
    
    if no_opps:
        print("\n💼 CONTRACTS WITHOUT OPPS")
        print("-"*80)
        for m in no_opps:
            print(f"  {m['Account'][:45]:<47}: ${m['Contract']:>10,.0f} (needs opp)")

# Summary of what to fix
print("\n\n" + "="*120)
print("RECOMMENDED ACTIONS")
print("="*120)

total_contract_delta = sum(m['Delta'] for m in value_mismatches if m['Delta'] > 0)
total_opp_delta = sum(abs(m['Delta']) for m in value_mismatches if m['Delta'] < 0)

print(f"""
1. VALUE MISMATCHES: {len(value_mismatches)} accounts
   - Contracts exceed Opps by: ${total_contract_delta:,.0f}
   - Opps exceed Contracts by: ${total_opp_delta:,.0f}
   
   ACTION: Review each and decide which is correct (contract or opp)
   
2. OPPS WITHOUT CONTRACTS: {len(no_contracts)} accounts (${sum(m['Opp'] for m in no_contracts):,.0f})
   ACTION: These are likely new/recent - may need contracts created
   
3. CONTRACTS WITHOUT OPPS: {len(no_opps)} accounts
   ACTION: Review if these contracts should have associated opps
""")






