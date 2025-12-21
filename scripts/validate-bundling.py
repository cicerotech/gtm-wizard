#!/usr/bin/env python3
"""
Validate Bundling Hypothesis:
Are the "extra" amounts in December opps actually original contracts + extensions bundled together?
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 80)

# Load all data sources
xl_999 = pd.ExcelFile(os.path.expanduser('~/Desktop/999.xlsx'))
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

df_999 = pd.read_excel(xl_999, sheet_name='Additional JH Closed Won')
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')
jh_full = pd.read_excel(xl_audit, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 120)
print('VALIDATING BUNDLING HYPOTHESIS')
print('Are higher EUDIA amounts = Original Contract + Extension bundled together?')
print('=' * 120)
print()

# Focus on the specific high-amount December deals
focus_deals = [
    {
        'account': 'Etsy',
        'december_opp': 'Etsy Privacy Support Eleanor Power Extension',
        'december_amount': 259369.68,
        'jh_amount': 69600.00,
        'difference': 189769.68
    },
    {
        'account': 'Uisce Eireann',
        'december_opp': 'Uisce Eireann CDS Jamie O\'Gorman extension August December',
        'december_amount': 327388.82,
        'jh_amount': 0,  # Not in JH
        'difference': 327388.82
    },
    {
        'account': 'TikTok',
        'december_opp': 'TikTok DSAR Support ODL Extension 1 Tara Bannon',
        'december_amount': 198879.74,
        'jh_amount': 98601.16,
        'difference': 100278.58
    },
    {
        'account': 'Indeed',
        'december_opp': 'Indeed DPO ODL',
        'december_amount': 163565.98,
        'jh_amount': 104400.00,
        'difference': 59165.98
    },
    {
        'account': 'Dropbox',
        'december_opp': 'Fabiane Arguello 2025 extension',
        'december_amount': 170997.06,
        'jh_amount': 180960.00,
        'difference': -9962.94  # Actually understated
    }
]

for deal in focus_deals:
    print('=' * 120)
    print(f"ACCOUNT: {deal['account'].upper()}")
    print(f"December Opp: {deal['december_opp']}")
    print(f"December Amount: ${deal['december_amount']:,.2f}")
    print(f"JH Amount: ${deal['jh_amount']:,.2f}")
    print(f"Difference to explain: ${deal['difference']:,.2f}")
    print('=' * 120)
    
    acct_clean = deal['account'].lower()[:15]
    
    # Get ALL opportunities for this account from 999.xlsx
    acct_999 = df_999[df_999['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    # Get ALL JH opportunities
    acct_jh = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    print(f'\n📊 ALL OPPORTUNITIES FROM 999.xlsx ({len(acct_999)} total):')
    print('-' * 100)
    
    # Sort by close date to see the history
    if 'Close Date' in acct_999.columns:
        acct_999_sorted = acct_999.sort_values('Close Date', ascending=True)
    else:
        acct_999_sorted = acct_999
    
    # Look for keywords that might indicate original contract vs extension
    for _, row in acct_999_sorted.iterrows():
        opp_name = row['Opportunity Name']
        rev = row['Revenue'] if pd.notna(row['Revenue']) else 0
        close_date = row['Close Date'] if 'Close Date' in row else 'N/A'
        rpc = row['Recurring, Project, or Commit'] if pd.notna(row.get('Recurring, Project, or Commit')) else 'BLANK'
        
        # Check if this might be related to the December deal
        dec_keywords = deal['december_opp'].lower().split()[:3]
        is_related = any(kw in opp_name.lower() for kw in dec_keywords if len(kw) > 4)
        
        marker = '⭐' if is_related else '  '
        
        print(f"{marker} {opp_name[:60]}")
        print(f"      Revenue: ${rev:,.2f} | Close: {close_date} | Class: {rpc}")
    
    # Now look for combinations that might add up to the December amount
    print(f'\n🔍 LOOKING FOR COMBINATIONS THAT EQUAL ${deal["december_amount"]:,.2f}:')
    print('-' * 100)
    
    # Get all revenues for this account
    revenues = acct_999_sorted[acct_999_sorted['Revenue'].notna()]['Revenue'].tolist()
    opp_names = acct_999_sorted[acct_999_sorted['Revenue'].notna()]['Opportunity Name'].tolist()
    
    target = deal['december_amount']
    found_combo = False
    
    # Check pairs
    for i in range(len(revenues)):
        for j in range(i+1, len(revenues)):
            if abs(revenues[i] + revenues[j] - target) < 100:
                print(f"   MATCH FOUND!")
                print(f"      {opp_names[i][:50]}: ${revenues[i]:,.2f}")
                print(f"    + {opp_names[j][:50]}: ${revenues[j]:,.2f}")
                print(f"    = ${revenues[i] + revenues[j]:,.2f} (target: ${target:,.2f})")
                found_combo = True
    
    # Check triples
    if not found_combo:
        for i in range(len(revenues)):
            for j in range(i+1, len(revenues)):
                for k in range(j+1, len(revenues)):
                    if abs(revenues[i] + revenues[j] + revenues[k] - target) < 100:
                        print(f"   MATCH FOUND!")
                        print(f"      {opp_names[i][:45]}: ${revenues[i]:,.2f}")
                        print(f"    + {opp_names[j][:45]}: ${revenues[j]:,.2f}")
                        print(f"    + {opp_names[k][:45]}: ${revenues[k]:,.2f}")
                        print(f"    = ${revenues[i] + revenues[j] + revenues[k]:,.2f}")
                        found_combo = True
    
    if not found_combo:
        print(f"   No exact combination found in 999.xlsx")
        print(f"   The ${deal['difference']:,.2f} difference may be:")
        print(f"      - EUDIA-originated revenue (not from JH)")
        print(f"      - A rate/calculation difference")
        print(f"      - Run rate capture")
    
    # Show JH history for comparison
    print(f'\n🔗 JH OPPORTUNITIES FOR COMPARISON ({len(acct_jh)} total):')
    print('-' * 100)
    for _, row in acct_jh.iterrows():
        opp_name = row['Opportunity Name']
        acv = row['ACV (USD)'] if pd.notna(row['ACV (USD)']) else 0
        term = row['Term'] if pd.notna(row['Term']) else 'N/A'
        print(f"   {opp_name[:60]}")
        print(f"      ACV: ${acv:,.2f} | Term: {term}")
    
    print()

print('=' * 120)
print('VALIDATION COMPLETE')
print('=' * 120)

