#!/usr/bin/env python3
"""
ACV Redistribution Analysis
Analyze updated Eudia All Time Won data to determine proper ACV distribution
for December expiring opportunities
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 300)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

# List all sheets to see what's available
print('Available sheets:')
for sheet in xl.sheet_names:
    print(f'   - {sheet}')
print()

# Load the updated tabs
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 120)
print('UPDATED DATA SUMMARY')
print('=' * 120)
print()

print(f'Eudia SF (December Expiring): {len(eudia_dec)} rows')
print(f'   Columns: {list(eudia_dec.columns)}')
print(f'   Total Revenue: ${eudia_dec["Revenue"].sum():,.2f}')
print()

print(f'Eudia All Time Won: {len(eudia_all)} rows')
print(f'   Columns: {list(eudia_all.columns)}')
if 'Revenue' in eudia_all.columns:
    print(f'   Total Revenue: ${eudia_all["Revenue"].sum():,.2f}')
print()

print(f'Johnson Hana 2024-2025 Won: {len(jh_full)} rows')
print(f'   Total ACV: ${jh_full["ACV (USD)"].sum():,.2f}')
print()

# =============================================================================
# FOCUS: December Expiring Accounts
# =============================================================================
print('=' * 120)
print('FOCUS: DECEMBER EXPIRING ACCOUNTS - FULL HISTORICAL CONTEXT')
print('=' * 120)
print()

# Get unique accounts from December expiring
dec_accounts = eudia_dec['Account Name'].unique()
print(f'December expiring accounts: {len(dec_accounts)}')
print()

# For each December account, show FULL history from Eudia All Time Won + JH
for acct in dec_accounts:
    print('=' * 100)
    print(f'ACCOUNT: {acct}')
    print('=' * 100)
    
    # December expiring for this account
    dec_opps = eudia_dec[eudia_dec['Account Name'] == acct]
    print(f'\n📅 DECEMBER EXPIRING ({len(dec_opps)} opps):')
    print('-' * 80)
    for _, opp in dec_opps.iterrows():
        print(f"   {opp['Opportunity Name'][:55]}")
        print(f"      Revenue: ${opp['Revenue']:,.2f} | Term: {opp['Term (Months)']} mo | End: {opp['End Date']}")
    dec_total = dec_opps['Revenue'].sum()
    print(f'   DECEMBER TOTAL: ${dec_total:,.2f}')
    
    # All EUDIA history for this account
    acct_clean = str(acct).lower()[:20]
    # Handle different column names depending on export
    acct_col = 'Account Name' if 'Account Name' in eudia_all.columns else 'Account Name: Account Name'
    eudia_all_acct = eudia_all[eudia_all[acct_col].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    print(f'\n📊 EUDIA ALL TIME WON ({len(eudia_all_acct)} opps):')
    print('-' * 80)
    if len(eudia_all_acct) > 0:
        for _, opp in eudia_all_acct.iterrows():
            end_date = opp.get('End Date', 'N/A')
            term = opp.get('Term (Months)', 'N/A')
            rev = opp.get('Revenue', 0)
            opp_name = opp.get('Opportunity Name', 'Unknown')
            print(f"   {opp_name[:55]}")
            print(f"      Revenue: ${rev:,.2f} | Term: {term} mo | End: {end_date}")
        eudia_total = eudia_all_acct['Revenue'].sum()
        print(f'   EUDIA ALL TIME TOTAL: ${eudia_total:,.2f}')
    else:
        print('   No historical opportunities found')
    
    # JH history for this account
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    print(f'\n🔗 JOHNSON HANA HISTORY ({len(jh_acct)} opps):')
    print('-' * 80)
    if len(jh_acct) > 0:
        for _, opp in jh_acct.iterrows():
            end_date = opp.get('Scheduled End Date', 'N/A')
            term = opp.get('Term', 'N/A')
            acv = opp.get('ACV (USD)', 0)
            opp_name = opp.get('Opportunity Name', 'Unknown')
            print(f"   {opp_name[:55]}")
            print(f"      ACV: ${acv:,.2f} | Term: {term} mo | End: {end_date}")
        jh_total = jh_acct['ACV (USD)'].sum()
        print(f'   JH TOTAL ACV: ${jh_total:,.2f}')
    else:
        print('   No JH history (may be US pod or EUDIA-originated)')
    
    # ANALYSIS
    print(f'\n💡 REDISTRIBUTION ANALYSIS:')
    print('-' * 80)
    
    if len(jh_acct) > 0 and len(eudia_all_acct) > 0:
        jh_total = jh_acct['ACV (USD)'].sum()
        eudia_total = eudia_all_acct['Revenue'].sum()
        variance = eudia_total - jh_total
        
        print(f'   EUDIA Total: ${eudia_total:,.2f}')
        print(f'   JH Total: ${jh_total:,.2f}')
        print(f'   Variance: ${variance:,.2f}')
        
        if abs(variance) < 1000:
            print(f'   ✅ ALIGNED - minimal variance')
        elif variance > 0:
            print(f'   ⚠️ EUDIA higher than JH by ${variance:,.2f}')
            print(f'      Possible bundled ACV that should be redistributed')
        else:
            print(f'   ⚠️ EUDIA lower than JH by ${abs(variance):,.2f}')
            print(f'      Missing opportunities or understatement')
        
        # Check if December has more ACV than it should
        # by comparing # of JH opps expiring Dec vs EUDIA Dec
        jh_dec = jh_acct[jh_acct['Scheduled End Date'].astype(str).str.contains('2025-12', na=False)]
        if len(jh_dec) > 0:
            jh_dec_total = jh_dec['ACV (USD)'].sum()
            dec_variance = dec_total - jh_dec_total
            print(f'\n   📅 December Comparison:')
            print(f'      EUDIA Dec: ${dec_total:,.2f}')
            print(f'      JH Dec: ${jh_dec_total:,.2f}')
            if dec_variance > 1000:
                print(f'      🔄 REDISTRIBUTE: Move ${dec_variance:,.2f} from Dec to other opps')
    
    print()

# =============================================================================
# SUMMARY: REDISTRIBUTION RECOMMENDATIONS
# =============================================================================
print()
print('=' * 120)
print('REDISTRIBUTION RECOMMENDATIONS SUMMARY')
print('=' * 120)
print()

redistributions = []

for acct in dec_accounts:
    acct_clean = str(acct).lower()[:20]
    
    dec_opps = eudia_dec[eudia_dec['Account Name'] == acct]
    dec_total = dec_opps['Revenue'].sum()
    
    acct_col = 'Account Name' if 'Account Name' in eudia_all.columns else 'Account Name: Account Name'
    eudia_all_acct = eudia_all[eudia_all[acct_col].str.lower().str.contains(acct_clean, na=False, regex=False)]
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    
    if len(jh_acct) > 0:
        jh_total = jh_acct['ACV (USD)'].sum()
        
        # Find JH December opps
        jh_dec = jh_acct[jh_acct['Scheduled End Date'].astype(str).str.contains('2025-12', na=False)]
        jh_dec_total = jh_dec['ACV (USD)'].sum() if len(jh_dec) > 0 else 0
        
        if dec_total - jh_dec_total > 5000:
            redistributions.append({
                'Account': acct,
                'EUDIA_Dec_Total': dec_total,
                'JH_Dec_Total': jh_dec_total,
                'Redistribution': dec_total - jh_dec_total,
                'JH_All_Time': jh_total,
                'JH_Dec_Count': len(jh_dec),
                'JH_Other_Count': len(jh_acct) - len(jh_dec)
            })

if len(redistributions) > 0:
    redis_df = pd.DataFrame(redistributions)
    redis_df = redis_df.sort_values('Redistribution', ascending=False)
    print('Accounts requiring ACV redistribution from December:')
    print('-' * 100)
    for _, row in redis_df.iterrows():
        print(f"   {row['Account'][:40]}")
        print(f"      EUDIA December: ${row['EUDIA_Dec_Total']:,.2f}")
        print(f"      JH December: ${row['JH_Dec_Total']:,.2f}")
        print(f"      🔄 Move ${row['Redistribution']:,.2f} to other opportunities")
        print(f"      JH has {row['JH_Other_Count']} non-December opps to distribute to")
        print()
else:
    print('No significant redistributions needed based on JH data.')

print()
print('Analysis complete.')

