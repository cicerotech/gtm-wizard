#!/usr/bin/env python3
"""
FINAL CORRECTION PLAN
Based on validated JH screenshots and bundling analysis
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 500)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 80)

# Load data
xl_999 = pd.ExcelFile(os.path.expanduser('~/Desktop/999.xlsx'))
xl_audit = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

df_999 = pd.read_excel(xl_999, sheet_name='Additional JH Closed Won')
eudia_dec = pd.read_excel(xl_audit, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl_audit, sheet_name='Eudia All Time Won')

print('=' * 120)
print('FINAL CORRECTION PLAN')
print('Based on Validated JH Data & Bundling Analysis')
print('=' * 120)
print()

# =============================================================================
# JH VALIDATED VALUES (from screenshots)
# =============================================================================

jh_december_validated = {
    'Uisce Eireann CDS Jamie O\'Gorman extension August December': {
        'jh_acv': 78601.60,
        'jh_term': 5,
        'jh_end': '12/28/2025'
    },
    'Uisce Eireann CDS Luke Sexton extension August December': {
        'jh_acv': 68776.40,
        'jh_term': 5,
        'jh_end': '12/31/2025'
    },
    'Uisce Eireann CDS Amal Elbay extension August December': {
        'jh_acv': 38720.80,
        'jh_term': 5,
        'jh_end': '12/28/2025'
    },
    'TikTok DSAR Support ODL Extension 1 Tara Bannon': {
        'jh_acv': 98601.16,
        'jh_term': 6,
        'jh_end': '12/31/2025'
    }
}

print('VALIDATED DECEMBER DEALS FROM JH:')
print('-' * 100)
for opp, vals in jh_december_validated.items():
    print(f"   {opp}")
    print(f"      JH ACV: ${vals['jh_acv']:,.2f} | Term: {vals['jh_term']} mo | End: {vals['jh_end']}")
print()

# =============================================================================
# COMPARE TO EUDIA DECEMBER EXPIRING (from Excel)
# =============================================================================
print('COMPARISON: EUDIA December Expiring vs JH Validated')
print('=' * 120)
print()

corrections = []

for _, row in eudia_dec.iterrows():
    opp_name = row['Opportunity Name']
    eudia_rev = row['Revenue']
    eudia_term = row['Term (Months)']
    eudia_end = row['End Date']
    acct = row['Account Name']
    
    # Check if this is a validated JH December deal
    matched = False
    for jh_opp, jh_vals in jh_december_validated.items():
        if jh_opp.lower()[:30] in opp_name.lower() or opp_name.lower()[:30] in jh_opp.lower():
            matched = True
            variance = eudia_rev - jh_vals['jh_acv']
            
            print(f"📋 {opp_name[:60]}")
            print(f"   Account: {acct}")
            print(f"   EUDIA Revenue: ${eudia_rev:,.2f}")
            print(f"   JH ACV: ${jh_vals['jh_acv']:,.2f}")
            print(f"   VARIANCE: ${variance:,.2f}")
            
            if abs(variance) > 100:
                if variance > 0:
                    print(f"   ⚠️ ACTION: REDUCE by ${variance:,.2f} (bundled ACV)")
                else:
                    print(f"   ⚠️ ACTION: INCREASE by ${abs(variance):,.2f} (understated)")
                
                corrections.append({
                    'Account': acct,
                    'Opportunity_Name': opp_name,
                    'Current_Revenue': eudia_rev,
                    'JH_ACV': jh_vals['jh_acv'],
                    'Variance': variance,
                    'Action': 'REDUCE' if variance > 0 else 'INCREASE',
                    'New_Revenue': jh_vals['jh_acv'],
                    'JH_Term': jh_vals['jh_term'],
                    'JH_End': jh_vals['jh_end']
                })
            else:
                print(f"   ✅ ALIGNED (within $100)")
            
            print()
            break
    
    if not matched:
        # Check if this is a deal that should be in JH but isn't matched
        if any(kw in acct.lower() for kw in ['uisce', 'tiktok', 'etsy', 'indeed', 'dropbox']):
            print(f"❓ {opp_name[:60]}")
            print(f"   Account: {acct}")
            print(f"   EUDIA Revenue: ${eudia_rev:,.2f}")
            print(f"   JH Match: NOT FOUND - may need investigation")
            print()

# =============================================================================
# BUNDLED ACV REDISTRIBUTION
# =============================================================================
print()
print('=' * 120)
print('BUNDLED ACV REDISTRIBUTION')
print('=' * 120)
print()

# For each correction that's a REDUCE, we need to find where the excess should go
for corr in corrections:
    if corr['Action'] == 'REDUCE' and corr['Variance'] > 1000:
        print(f"Account: {corr['Account']}")
        print(f"Reducing: {corr['Opportunity_Name'][:50]}")
        print(f"Amount to redistribute: ${corr['Variance']:,.2f}")
        print()
        
        # Find historical opportunities for this account from 999.xlsx
        acct_clean = corr['Account'].lower()[:15]
        acct_999 = df_999[df_999['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
        
        # Find opportunities with BLANK classification (not in reports)
        rpc_col = 'Recurring, Project, or Commit'
        blank_opps = acct_999[acct_999[rpc_col].isna()]
        
        if len(blank_opps) > 0:
            print(f"   Found {len(blank_opps)} historical opps NOT in reports:")
            for _, opp in blank_opps.iterrows():
                print(f"      - {opp['Opportunity Name'][:50]}: ${opp['Revenue']:,.2f}")
                print(f"        ID: {opp['Opportunity ID']}")
        else:
            # Check all opps for this account
            print(f"   All {len(acct_999)} opps have classification (in reports)")
            print(f"   The excess ${corr['Variance']:,.2f} may already be captured elsewhere")
        
        print()

# =============================================================================
# FINAL UPDATE FILE
# =============================================================================
print()
print('=' * 120)
print('FINAL UPDATE SUMMARY')
print('=' * 120)
print()

if len(corrections) > 0:
    corr_df = pd.DataFrame(corrections)
    
    total_reductions = corr_df[corr_df['Action'] == 'REDUCE']['Variance'].sum()
    total_increases = abs(corr_df[corr_df['Action'] == 'INCREASE']['Variance'].sum())
    
    print(f"Total corrections needed: {len(corrections)}")
    print(f"Total reductions: ${total_reductions:,.2f}")
    print(f"Total increases: ${total_increases:,.2f}")
    print(f"Net impact: ${total_reductions - total_increases:,.2f}")
    print()
    
    print('CORRECTIONS TO MAKE:')
    print('-' * 100)
    for _, row in corr_df.iterrows():
        print(f"{row['Action']}: {row['Opportunity_Name'][:50]}")
        print(f"   ${row['Current_Revenue']:,.2f} → ${row['New_Revenue']:,.2f}")
        print(f"   Term: {row['JH_Term']} mo | End: {row['JH_End']}")
        print()
    
    # Save to CSV
    output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'
    corr_df.to_csv(output_dir + 'final-corrections.csv', index=False)
    print(f"Saved to: {output_dir}final-corrections.csv")
else:
    print("No corrections needed based on validated JH data!")

print()
print('=' * 120)
print('DONE')
print('=' * 120)

