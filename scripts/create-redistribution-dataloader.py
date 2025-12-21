#!/usr/bin/env python3
"""
Create specific Data Loader files for ACV redistribution
Based on the December Redistribution Plan analysis
"""

import pandas as pd
import os

pd.set_option('display.width', 500)

# Load data
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

print('=' * 100)
print('GENERATING DATA LOADER FILES FOR ACV REDISTRIBUTION')
print('=' * 100)
print()

# =============================================================================
# DECEMBER REDUCTIONS (Decrease bundled amounts)
# =============================================================================

december_reductions = []

# Etsy - Eleanor Power Extension
etsy_dec = eudia_dec[eudia_dec['Account Name'] == 'Etsy Ireland UC']
if len(etsy_dec) > 0:
    for _, opp in etsy_dec.iterrows():
        if 'Eleanor Power' in str(opp['Opportunity Name']):
            # Find in Eudia All to get ID
            match = eudia_all[eudia_all['Opportunity Name'].str.contains('Eleanor Power Extension', na=False, regex=False)]
            if len(match) > 0:
                december_reductions.append({
                    'Account': 'Etsy Ireland UC',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 69600.00,
                    'Change': 69600.00 - opp['Revenue'],
                    'Reason': 'JH shows $69,600 for this contract'
                })

# TikTok - DSAR Support ODL Extension
tiktok_dec = eudia_dec[eudia_dec['Account Name'] == 'Tiktok Information Technologies UK Limited']
if len(tiktok_dec) > 0:
    for _, opp in tiktok_dec.iterrows():
        if 'DSAR Support ODL Extension' in str(opp['Opportunity Name']):
            match = eudia_all[eudia_all['Opportunity Name'].str.contains('DSAR Support ODL Extension 1', na=False, regex=False)]
            if len(match) > 0:
                december_reductions.append({
                    'Account': 'Tiktok Information Technologies UK Limited',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 98601.16,
                    'Change': 98601.16 - opp['Revenue'],
                    'Reason': 'JH shows $98,601 for this contract'
                })

# Indeed - DPO ODL
indeed_dec = eudia_dec[eudia_dec['Account Name'] == 'Indeed Ireland Operations Limited']
if len(indeed_dec) > 0:
    for _, opp in indeed_dec.iterrows():
        if 'DPO ODL' in str(opp['Opportunity Name']):
            match = eudia_all[eudia_all['Opportunity Name'] == 'Indeed DPO ODL']
            if len(match) > 0:
                december_reductions.append({
                    'Account': 'Indeed Ireland Operations Limited',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 104400.00,
                    'Change': 104400.00 - opp['Revenue'],
                    'Reason': 'JH shows $104,400 for this contract'
                })

# Teamwork - extension no.4
teamwork_dec = eudia_dec[eudia_dec['Account Name'].str.contains('Teamwork', na=False)]
if len(teamwork_dec) > 0:
    for _, opp in teamwork_dec.iterrows():
        if 'extension no.4' in str(opp['Opportunity Name']):
            match = eudia_all[eudia_all['Opportunity Name'].str.contains('extension no.4', na=False, regex=False)]
            if len(match) > 0:
                december_reductions.append({
                    'Account': 'Teamwork Crew Limited',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 36748.80,
                    'Change': 36748.80 - opp['Revenue'],
                    'Reason': 'JH shows $36,749 for this contract'
                })

# Taoglas - ODL Support 2025
taoglas_dec = eudia_dec[eudia_dec['Account Name'] == 'Taoglas Limited']
if len(taoglas_dec) > 0:
    for _, opp in taoglas_dec.iterrows():
        if 'ODL Support 2025' in str(opp['Opportunity Name']):
            match = eudia_all[eudia_all['Opportunity Name'] == 'Taoglas ODL Support 2025']
            if len(match) > 0:
                december_reductions.append({
                    'Account': 'Taoglas Limited',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 34800.00,
                    'Change': 34800.00 - opp['Revenue'],
                    'Reason': 'JH shows $34,800 for this contract'
                })

# =============================================================================
# INCREASES (Redistribute to other opps)
# =============================================================================

increases = []

# Datalex - needs INCREASE (understated)
datalex_dec = eudia_dec[eudia_dec['Account Name'].str.contains('Datalex', na=False)]
if len(datalex_dec) > 0:
    for _, opp in datalex_dec.iterrows():
        match = eudia_all[eudia_all['Opportunity Name'].str.contains('Datalex Extension RL 2024 \\(2\\)', na=False, regex=True)]
        if len(match) > 0:
            increases.append({
                'Account': 'Datalex (Ireland) Limited',
                'Opportunity_Name': opp['Opportunity Name'],
                'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                'Current_Revenue': opp['Revenue'],
                'New_Revenue': 106488.00,
                'Change': 106488.00 - opp['Revenue'],
                'Reason': 'JH shows $106,488 for December 2025 expiring contract'
            })

# Dropbox - minor increase
dropbox_dec = eudia_dec[eudia_dec['Account Name'].str.contains('Dropbox', na=False)]
if len(dropbox_dec) > 0:
    for _, opp in dropbox_dec.iterrows():
        if 'Fabiane Arguello 2025 extension' in str(opp['Opportunity Name']):
            match = eudia_all[eudia_all['Opportunity Name'] == 'Fabiane Arguello 2025 extension']
            if len(match) > 0:
                increases.append({
                    'Account': 'Dropbox International Unlimited Company',
                    'Opportunity_Name': opp['Opportunity Name'],
                    'Opportunity_ID': match.iloc[0]['Opportunity ID'],
                    'Current_Revenue': opp['Revenue'],
                    'New_Revenue': 180960.00,
                    'Change': 180960.00 - opp['Revenue'],
                    'Reason': 'JH shows $180,960 for this contract'
                })

# TikTok ODL 2026 - increase to absorb some redistribution
tiktok_all = eudia_all[eudia_all['Account Name'].str.lower().str.contains('tiktok', na=False)]
tiktok_odl_2026 = tiktok_all[tiktok_all['Opportunity Name'].str.contains('DSAR support ODL 2026', na=False, regex=False)]
if len(tiktok_odl_2026) > 0:
    row = tiktok_odl_2026.iloc[0]
    increases.append({
        'Account': 'Tiktok Information Technologies UK Limited',
        'Opportunity_Name': row['Opportunity Name'],
        'Opportunity_ID': row['Opportunity ID'],
        'Current_Revenue': row['Revenue'],
        'New_Revenue': 111360.00,  # JH ACV for this opp
        'Change': 111360.00 - row['Revenue'] if pd.notna(row['Revenue']) else 111360.00,
        'Reason': 'Absorb redistribution from Dec extension - JH shows $111,360'
    })

# =============================================================================
# OUTPUT FILES
# =============================================================================

print('DECEMBER REDUCTIONS (Decrease bundled amounts):')
print('-' * 80)
reductions_df = pd.DataFrame(december_reductions)
if len(reductions_df) > 0:
    total_reduction = reductions_df['Change'].sum()
    for _, row in reductions_df.iterrows():
        print(f"   {row['Account'][:35]}")
        print(f"      {row['Opportunity_Name'][:50]}")
        print(f"      ${row['Current_Revenue']:,.2f} → ${row['New_Revenue']:,.2f} ({row['Change']:+,.2f})")
        print(f"      ID: {row['Opportunity_ID']}")
        print()
    print(f"   TOTAL REDUCTION: ${total_reduction:,.2f}")
    
    # Save Data Loader file
    dl_reductions = reductions_df[['Opportunity_ID', 'New_Revenue', 'Reason']].copy()
    dl_reductions.columns = ['Id', 'Revenue', 'Notes']
    dl_reductions.to_csv(output_dir + 'dataloader-december-reductions.csv', index=False)
    print(f"\n✅ Saved: {output_dir}dataloader-december-reductions.csv")
else:
    print("   No reductions identified")

print()
print('INCREASES (Redistribute to other opps / understated Dec):')
print('-' * 80)
increases_df = pd.DataFrame(increases)
if len(increases_df) > 0:
    total_increase = increases_df['Change'].sum()
    for _, row in increases_df.iterrows():
        print(f"   {row['Account'][:35]}")
        print(f"      {row['Opportunity_Name'][:50]}")
        print(f"      ${row['Current_Revenue']:,.2f} → ${row['New_Revenue']:,.2f} ({row['Change']:+,.2f})")
        print(f"      ID: {row['Opportunity_ID']}")
        print()
    print(f"   TOTAL INCREASE: ${total_increase:,.2f}")
    
    # Save Data Loader file
    dl_increases = increases_df[['Opportunity_ID', 'New_Revenue', 'Reason']].copy()
    dl_increases.columns = ['Id', 'Revenue', 'Notes']
    dl_increases.to_csv(output_dir + 'dataloader-increases.csv', index=False)
    print(f"\n✅ Saved: {output_dir}dataloader-increases.csv")
else:
    print("   No increases identified")

# =============================================================================
# COMBINED FILE
# =============================================================================

print()
print('=' * 100)
print('COMBINED REDISTRIBUTION FILE')
print('=' * 100)

all_changes = pd.concat([reductions_df, increases_df], ignore_index=True)
if len(all_changes) > 0:
    net_change = all_changes['Change'].sum()
    print(f"\nTotal opportunities to update: {len(all_changes)}")
    print(f"Total reductions: ${reductions_df['Change'].sum():,.2f}")
    print(f"Total increases: ${increases_df['Change'].sum():,.2f}")
    print(f"NET CHANGE: ${net_change:,.2f}")
    
    # Save combined file
    all_changes.to_csv(output_dir + 'dataloader-all-redistribution.csv', index=False)
    print(f"\n✅ Saved: {output_dir}dataloader-all-redistribution.csv")

print()
print('=' * 100)
print('IMPORTANT NOTES')
print('=' * 100)
print('''
1. The net change should be close to $0 (this is a redistribution, not removal)

2. For accounts with reductions, you may need to identify OTHER opportunities
   to increase by the corresponding amount to maintain total revenue

3. The reductions identified here are for December-expiring opps that have
   bundled ACV from contracts that should expire later

4. BEFORE IMPORTING: Verify current totals match expected totals
   - Current Active Revenue: ~$19.8M
   - December Expiring Total: $1,696,300
''')

