#!/usr/bin/env python3
"""
ACV Redistribution Plan
Creates specific updates to redistribute bundled December ACV to other opportunities
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 300)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 70)

# Load data
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 120)
print('ACV REDISTRIBUTION PLAN')
print('Total Revenue Protection: Shuffling, Not Removing')
print('=' * 120)
print()

# =============================================================================
# FOCUS ACCOUNTS: Where December has bundled ACV
# =============================================================================

focus_accounts = [
    'Etsy Ireland UC',
    'Tiktok Information Technologies UK Limited',
    'Indeed Ireland Operations Limited',
    'Teamwork Crew Limited T/A Teamwork.com',
    'Taoglas Limited',
    'Datalex (Ireland) Limited',
    'Dropbox International Unlimited Company'
]

redistribution_plan = []

for acct in focus_accounts:
    print('=' * 120)
    print(f'ACCOUNT: {acct}')
    print('=' * 120)
    
    # Get December expiring opps
    dec_opps = eudia_dec[eudia_dec['Account Name'] == acct]
    
    # Get all EUDIA opps for this account
    acct_clean = acct.lower()[:20]
    eudia_acct = eudia_all[eudia_all['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    # Get JH opps for this account
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    if len(jh_acct) == 0:
        print(f'   ℹ️ No JH data for this account - likely US pod or EUDIA-only')
        print(f'   December total: ${dec_opps["Revenue"].sum():,.2f}')
        print(f'   No redistribution needed from JH perspective')
        continue
    
    print()
    print('📅 DECEMBER EXPIRING OPPORTUNITIES:')
    print('-' * 100)
    for _, opp in dec_opps.iterrows():
        print(f"   {opp['Opportunity Name'][:60]}")
        print(f"      Current Revenue: ${opp['Revenue']:,.2f}")
        print(f"      Current Term: {opp['Term (Months)']} mo | End: {opp['End Date']}")
    dec_total = dec_opps['Revenue'].sum()
    print(f'\n   📊 DECEMBER TOTAL: ${dec_total:,.2f}')
    
    # Find JH December amount
    jh_acct['Scheduled End Date'] = pd.to_datetime(jh_acct['Scheduled End Date'], errors='coerce')
    jh_dec = jh_acct[jh_acct['Scheduled End Date'].dt.month == 12]
    jh_dec_2025 = jh_dec[jh_dec['Scheduled End Date'].dt.year == 2025]
    jh_dec_total = jh_dec_2025['ACV (USD)'].sum() if len(jh_dec_2025) > 0 else 0
    
    print(f'\n🔗 JH DECEMBER AMOUNT: ${jh_dec_total:,.2f}')
    
    # Calculate redistribution needed
    excess = dec_total - jh_dec_total
    
    if excess <= 1000:
        print(f'\n   ✅ December amount aligned with JH (variance: ${excess:,.2f})')
        continue
    
    print(f'\n⚠️ EXCESS TO REDISTRIBUTE: ${excess:,.2f}')
    print()
    
    # Find target opportunities (non-December JH opps with later end dates)
    jh_non_dec = jh_acct[~jh_acct.index.isin(jh_dec_2025.index)]
    jh_non_dec_sorted = jh_non_dec.sort_values('Scheduled End Date', ascending=False)
    
    print('🎯 REDISTRIBUTION TARGETS (JH opps with later end dates):')
    print('-' * 100)
    
    remaining_excess = excess
    target_opps = []
    
    for _, j in jh_non_dec_sorted.head(10).iterrows():
        j_opp = j['Opportunity Name']
        j_acv = j['ACV (USD)']
        j_end = j['Scheduled End Date']
        j_term = j['Term']
        
        # Find matching EUDIA opp
        eudia_match = eudia_acct[eudia_acct['Opportunity Name'].str.lower().str.contains(j_opp.lower()[:20], na=False, regex=False)]
        
        if len(eudia_match) > 0:
            e_rev = eudia_match.iloc[0]['Revenue']
            e_id = eudia_match.iloc[0]['Opportunity ID']
            e_opp = eudia_match.iloc[0]['Opportunity Name']
            
            # Calculate how much to add to this opp
            if pd.notna(j_acv) and pd.notna(e_rev):
                current_diff = j_acv - e_rev
                if current_diff > 0:
                    # This opp is understated in EUDIA - good candidate
                    add_amount = min(current_diff, remaining_excess)
                    if add_amount > 500:
                        print(f"   {e_opp[:55]}")
                        print(f"      EUDIA Current: ${e_rev:,.2f}")
                        print(f"      JH ACV: ${j_acv:,.2f}")
                        print(f"      JH End Date: {j_end}")
                        print(f"      ➕ ADD: ${add_amount:,.2f}")
                        print()
                        
                        target_opps.append({
                            'Account': acct,
                            'Opportunity_Name': e_opp,
                            'Opportunity_ID': e_id,
                            'Current_Revenue': e_rev,
                            'JH_ACV': j_acv,
                            'JH_End_Date': j_end,
                            'Add_Amount': add_amount,
                            'New_Revenue': e_rev + add_amount
                        })
                        remaining_excess -= add_amount
        
        if remaining_excess <= 0:
            break
    
    # Now handle the December opps - reduce them
    print('\n📉 DECEMBER OPPORTUNITIES TO REDUCE:')
    print('-' * 100)
    
    for _, opp in dec_opps.iterrows():
        opp_name = opp['Opportunity Name']
        current_rev = opp['Revenue']
        
        # Find JH match for this December opp
        jh_match = jh_dec_2025[jh_dec_2025['Opportunity Name'].str.lower().str.contains(opp_name.lower()[:20], na=False, regex=False)]
        
        if len(jh_match) > 0:
            jh_amount = jh_match.iloc[0]['ACV (USD)']
            reduction = current_rev - jh_amount
            
            if reduction > 500:
                print(f"   {opp_name[:55]}")
                print(f"      Current Revenue: ${current_rev:,.2f}")
                print(f"      JH Amount: ${jh_amount:,.2f}")
                print(f"      ➖ REDUCE BY: ${reduction:,.2f}")
                print(f"      NEW AMOUNT: ${jh_amount:,.2f}")
                print()
                
                redistribution_plan.append({
                    'Account': acct,
                    'Action': 'REDUCE',
                    'Opportunity_Name': opp_name,
                    'Current_Revenue': current_rev,
                    'JH_Amount': jh_amount,
                    'Change': -reduction,
                    'New_Revenue': jh_amount
                })
        else:
            # No JH match - this may need to move entirely
            print(f"   {opp_name[:55]}")
            print(f"      Current Revenue: ${current_rev:,.2f}")
            print(f"      JH Match: NOT FOUND")
            print(f"      ⚠️ This amount may be bundled from other contracts")
            print()
    
    # Add target opps to redistribution plan
    for t in target_opps:
        redistribution_plan.append({
            'Account': t['Account'],
            'Action': 'INCREASE',
            'Opportunity_Name': t['Opportunity_Name'],
            'Opportunity_ID': t['Opportunity_ID'],
            'Current_Revenue': t['Current_Revenue'],
            'JH_Amount': t['JH_ACV'],
            'Change': t['Add_Amount'],
            'New_Revenue': t['New_Revenue']
        })
    
    print()

# =============================================================================
# SUMMARY: REDISTRIBUTION PLAN
# =============================================================================
print()
print('=' * 120)
print('REDISTRIBUTION SUMMARY')
print('=' * 120)
print()

if len(redistribution_plan) > 0:
    plan_df = pd.DataFrame(redistribution_plan)
    
    # Summary by account
    print('BY ACCOUNT:')
    print('-' * 80)
    for acct, group in plan_df.groupby('Account'):
        increases = group[group['Action'] == 'INCREASE']['Change'].sum()
        decreases = abs(group[group['Action'] == 'REDUCE']['Change'].sum())
        net = group['Change'].sum()
        print(f"   {acct[:40]}")
        print(f"      Increases: ${increases:,.2f}")
        print(f"      Decreases: ${decreases:,.2f}")
        print(f"      Net Impact: ${net:,.2f}")
        print()
    
    total_net = plan_df['Change'].sum()
    print(f'\n📊 TOTAL NET IMPACT: ${total_net:,.2f}')
    print(f'   (Should be near $0 for a true redistribution)')
    
    # Save detailed plan
    output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'
    plan_df.to_csv(output_dir + 'redistribution-plan.csv', index=False)
    print(f'\n✅ Detailed plan saved to: {output_dir}redistribution-plan.csv')
    
    # Create Data Loader files
    increases = plan_df[plan_df['Action'] == 'INCREASE'][['Opportunity_ID', 'New_Revenue', 'Account', 'Opportunity_Name']]
    if len(increases) > 0:
        increases.columns = ['Id', 'Revenue', 'Account', 'Opportunity_Name']
        increases.to_csv(output_dir + 'dataloader-increase-revenue.csv', index=False)
        print(f'✅ Increase file saved to: {output_dir}dataloader-increase-revenue.csv')
    
    decreases = plan_df[plan_df['Action'] == 'REDUCE'][['Opportunity_Name', 'New_Revenue', 'Account']]
    if len(decreases) > 0:
        decreases.to_csv(output_dir + 'dataloader-decrease-revenue.csv', index=False)
        print(f'✅ Decrease file saved to: {output_dir}dataloader-decrease-revenue.csv')
        print(f'   ⚠️ Note: Decrease file needs Opportunity IDs added from Eudia SF')

else:
    print('No redistribution needed based on analysis.')

print()
print('=' * 120)
print('NEXT STEPS')
print('=' * 120)
print('''
1. Review the redistribution plan to confirm amounts
2. Add Opportunity IDs to the decrease file from Eudia SF
3. Verify total revenue before and after remains the same
4. Import using Data Loader (update existing records)
5. Re-run reports to confirm alignment
''')

