#!/usr/bin/env python3
"""
Deep Historical Analysis
For each account with December bundled ACV, find where redistribution should go
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 70)

# Load data
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 120)
print('DEEP HISTORICAL ANALYSIS: Finding Where Bundled ACV Belongs')
print('=' * 120)
print()

# Focus accounts with bundled December ACV
focus_accounts = [
    ('Etsy Ireland UC', 189769.68),
    ('Tiktok Information Technologies UK Limited', 100278.58),
    ('Indeed Ireland Operations Limited', 59165.98),
    ('Teamwork Crew Limited T/A Teamwork.com', 33609.19),
    ('Taoglas Limited', 20182.64),
]

for acct_name, amount_to_redistribute in focus_accounts:
    print()
    print('=' * 120)
    print(f'ACCOUNT: {acct_name}')
    print(f'AMOUNT TO REDISTRIBUTE: ${amount_to_redistribute:,.2f}')
    print('=' * 120)
    
    # Get all EUDIA opps for this account
    acct_clean = acct_name.lower()[:20]
    eudia_acct = eudia_all[eudia_all['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    # Get all JH opps for this account
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    print(f'\nEUDIA has {len(eudia_acct)} opportunities for this account')
    print(f'JH has {len(jh_acct)} opportunities for this account')
    print()
    
    # ==========================================================================
    # COMPARE EACH JH OPP TO EUDIA
    # ==========================================================================
    print('OPPORTUNITY-BY-OPPORTUNITY COMPARISON (JH → EUDIA):')
    print('-' * 100)
    
    understated_opps = []
    missing_opps = []
    
    for _, j in jh_acct.iterrows():
        j_name = j['Opportunity Name']
        j_acv = j['ACV (USD)']
        j_term = j['Term']
        j_end = j['Scheduled End Date']
        
        # Try to find match in EUDIA
        # First try exact name match
        eudia_match = eudia_acct[eudia_acct['Opportunity Name'].str.lower() == j_name.lower()]
        
        if len(eudia_match) == 0:
            # Try partial match
            j_words = j_name.lower().split()[:3]  # First 3 words
            for word in j_words:
                if len(word) > 4:  # Skip short words
                    eudia_match = eudia_acct[eudia_acct['Opportunity Name'].str.lower().str.contains(word, na=False, regex=False)]
                    if len(eudia_match) > 0:
                        break
        
        if len(eudia_match) > 0:
            e = eudia_match.iloc[0]
            e_rev = e['Revenue'] if pd.notna(e['Revenue']) else 0
            e_id = e['Opportunity ID']
            e_name = e['Opportunity Name']
            
            diff = j_acv - e_rev if pd.notna(j_acv) else 0
            
            if diff > 1000:
                print(f'⬆️ UNDERSTATED: {j_name[:55]}')
                print(f'      JH ACV: ${j_acv:,.2f} | EUDIA: ${e_rev:,.2f} | Gap: ${diff:,.2f}')
                print(f'      EUDIA ID: {e_id}')
                print(f'      EUDIA Name: {e_name[:55]}')
                understated_opps.append({
                    'JH_Opp': j_name,
                    'EUDIA_Opp': e_name,
                    'EUDIA_ID': e_id,
                    'JH_ACV': j_acv,
                    'EUDIA_Rev': e_rev,
                    'Gap': diff,
                    'JH_End': j_end
                })
            elif diff < -1000:
                print(f'⬇️ OVERSTATED: {j_name[:55]}')
                print(f'      JH ACV: ${j_acv:,.2f} | EUDIA: ${e_rev:,.2f} | Over: ${abs(diff):,.2f}')
            else:
                print(f'✅ ALIGNED: {j_name[:55]}')
                print(f'      JH: ${j_acv:,.2f} ≈ EUDIA: ${e_rev:,.2f}')
        else:
            print(f'❓ NOT IN EUDIA: {j_name[:55]}')
            print(f'      JH ACV: ${j_acv:,.2f} | Term: {j_term} | End: {j_end}')
            if pd.notna(j_acv) and j_acv > 1000:
                missing_opps.append({
                    'JH_Opp': j_name,
                    'JH_ACV': j_acv,
                    'JH_Term': j_term,
                    'JH_End': j_end
                })
        print()
    
    # ==========================================================================
    # SUMMARY: WHERE THE BUNDLED ACV SHOULD GO
    # ==========================================================================
    print()
    print(f'REDISTRIBUTION TARGETS FOR ${amount_to_redistribute:,.2f}:')
    print('-' * 100)
    
    total_gap = sum(o['Gap'] for o in understated_opps)
    total_missing = sum(o['JH_ACV'] for o in missing_opps)
    
    print(f'Understated opportunities can absorb: ${total_gap:,.2f}')
    print(f'Missing opportunities (need to create): ${total_missing:,.2f}')
    print(f'Total available capacity: ${total_gap + total_missing:,.2f}')
    print()
    
    if total_gap >= amount_to_redistribute:
        print(f'✅ Can redistribute ${amount_to_redistribute:,.2f} to existing understated opps')
    elif total_gap + total_missing >= amount_to_redistribute:
        print(f'⚠️ Need to create some missing opps to fully redistribute')
    else:
        print(f'❌ Gap exceeds available targets - may be EUDIA-only revenue')
    
    print()
    print('SPECIFIC OPPS TO INCREASE:')
    remaining = amount_to_redistribute
    for o in sorted(understated_opps, key=lambda x: x['Gap'], reverse=True):
        if remaining <= 0:
            break
        add_amount = min(o['Gap'], remaining)
        print(f"   {o['EUDIA_Opp'][:55]}")
        print(f"      Current: ${o['EUDIA_Rev']:,.2f} → Target: ${o['EUDIA_Rev'] + add_amount:,.2f}")
        print(f"      Add: ${add_amount:,.2f}")
        print(f"      ID: {o['EUDIA_ID']}")
        remaining -= add_amount
        print()
    
    if remaining > 0:
        print(f'⚠️ Still ${remaining:,.2f} remaining to redistribute')
        if len(missing_opps) > 0:
            print('   Could create these missing JH opps:')
            for o in missing_opps[:5]:
                print(f"      - {o['JH_Opp'][:50]}: ${o['JH_ACV']:,.2f}")

print()
print('=' * 120)
print('ANALYSIS COMPLETE')
print('=' * 120)

