#!/usr/bin/env python3
"""
Compare Active Contracts vs Active Revenue Reports
"""

import pandas as pd

# Data from screenshots
contracts = {
    'Airbnb': 118250,
    'Airship Group Inc': 180000,
    'Arabic Computer Systems': 156453,
    'Aramark Ireland': 0,
    'Aryza': 230100,
    'Bank of Ireland': 1652400,
    'Coillte': 194838,
    'Coimisiun na Mean': 389675,
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
    'Tesco': 97086,  # This is Kingspan!
    'Tiktok Information Technologies UK Limited': 208160,
    'Tinder LLC': 228976,
    'Udemy Ireland Limited': 533722,
    'Uisce Eireann (Irish Water)': 440882,
}

opps_revenue = {
    'Airbnb': 211907,
    'Airship Group Inc': 166528,
    'Arabic Computer Systems': 156453,
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
    'Dropbox International Unlimited Company': 66816,
    'ESB NI/Electric Ireland': 473355,
    'Etsy Ireland UC': 44960,
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
    'Taoglas Limited': 5800,
    'Teamwork Crew Limited T/A Teamwork.com': 70358,
    'Tiktok Information Technologies UK Limited': 296275,
    'Tinder LLC': 228976,
    'Udemy Ireland Limited': 533722,
    'Uisce Eireann (Irish Water)': 333385,
    'Wellspring Philanthropic Fund': 145000,
}

print("="*100)
print("CONTRACTS vs OPPS COMPARISON - Finding Discrepancies")
print("="*100)

print(f"\nContracts Total: ${sum(contracts.values()):,.0f}")
print(f"Opps Revenue Total: ${sum(opps_revenue.values()):,.0f}")
print(f"Net Difference: ${sum(contracts.values()) - sum(opps_revenue.values()):,.0f}")

# Find overstated
print("\n" + "="*100)
print("⚠️ OVERSTATED IN CONTRACTS (Contract > Opp Revenue)")
print("="*100)
print(f"\n{'Account':<50} {'Contract':>15} {'Opp Rev':>15} {'Overstated':>15}")
print("-"*100)

overstated_total = 0
overstated_items = []

for acct, contract_val in sorted(contracts.items(), key=lambda x: x[1], reverse=True):
    # Find matching opp account
    opp_val = opps_revenue.get(acct, 0)
    
    # Check for name variations
    if opp_val == 0:
        for opp_acct, val in opps_revenue.items():
            if acct.lower()[:10] in opp_acct.lower() or opp_acct.lower()[:10] in acct.lower():
                opp_val = val
                break
    
    if contract_val > opp_val and (contract_val - opp_val) > 1000:
        delta = contract_val - opp_val
        overstated_total += delta
        overstated_items.append((acct, contract_val, opp_val, delta))
        print(f"{acct:<50} ${contract_val:>13,.0f} ${opp_val:>13,.0f} ${delta:>13,.0f}")

print("-"*100)
print(f"{'TOTAL OVERSTATED':<50} {'':<15} {'':<15} ${overstated_total:>13,.0f}")

# Find understated/missing
print("\n" + "="*100)
print("📉 UNDERSTATED/MISSING IN CONTRACTS (Opp Revenue > Contract)")
print("="*100)
print(f"\n{'Account':<50} {'Contract':>15} {'Opp Rev':>15} {'Understated':>15}")
print("-"*100)

understated_total = 0
understated_items = []

for acct, opp_val in sorted(opps_revenue.items(), key=lambda x: x[1], reverse=True):
    if opp_val == 0:
        continue
        
    # Find matching contract account
    contract_val = contracts.get(acct, 0)
    
    # Check for name variations
    if contract_val == 0:
        for c_acct, val in contracts.items():
            if acct.lower()[:10] in c_acct.lower() or c_acct.lower()[:10] in acct.lower():
                contract_val = val
                break
    
    if opp_val > contract_val and (opp_val - contract_val) > 1000:
        delta = opp_val - contract_val
        understated_total += delta
        understated_items.append((acct, contract_val, opp_val, delta))
        print(f"{acct:<50} ${contract_val:>13,.0f} ${opp_val:>13,.0f} ${delta:>13,.0f}")

print("-"*100)
print(f"{'TOTAL UNDERSTATED':<50} {'':<15} {'':<15} ${understated_total:>13,.0f}")

# Summary
print("\n" + "="*100)
print("SUMMARY")
print("="*100)
print(f"""
OVERSTATED (Contract > Opp):       ${overstated_total:>12,.0f}
UNDERSTATED (Opp > Contract):      ${understated_total:>12,.0f}
─────────────────────────────────────────────────
NET DIFFERENCE:                    ${overstated_total - understated_total:>12,.0f}

KEY ISSUES TO ADDRESS:
""")

# Top issues
print("\n🔴 TOP OVERSTATED (need to REDUCE contract values):")
for acct, c, o, d in sorted(overstated_items, key=lambda x: x[3], reverse=True)[:5]:
    print(f"   {acct}: ${d:,.0f} overstated (Contract: ${c:,.0f}, Opp: ${o:,.0f})")

print("\n🟡 TOP UNDERSTATED (need to ADD contract coverage):")
for acct, c, o, d in sorted(understated_items, key=lambda x: x[3], reverse=True)[:5]:
    print(f"   {acct}: ${d:,.0f} understated (Contract: ${c:,.0f}, Opp: ${o:,.0f})")

print("\n🟢 MISSING FROM CONTRACTS (in Opps but not Contracts):")
missing = ['ICON Clinical Research Limited', 'Intuit', 'Sequoia Climate Fund', 'Wellspring Philanthropic Fund', 'Aramark Ireland']
for acct in missing:
    if acct in opps_revenue:
        print(f"   {acct}: ${opps_revenue[acct]:,.0f}")



