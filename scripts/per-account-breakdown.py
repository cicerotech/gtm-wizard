#!/usr/bin/env python3
"""
Per-Account ACV Redistribution Breakdown
Clear, actionable recommendations for each December-expiring account
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 300)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 70)

# Load data
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')
eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')

print('=' * 120)
print('PER-ACCOUNT ACV REDISTRIBUTION BREAKDOWN')
print('=' * 120)
print()

# Summary totals
print('CURRENT TOTALS:')
print('-' * 60)
print(f'EUDIA All Time Won: ${eudia_all["Revenue"].sum():,.2f} ({len(eudia_all)} opps)')
print(f'EUDIA December Expiring: ${eudia_dec["Revenue"].sum():,.2f} ({len(eudia_dec)} opps)')
print(f'JH Total ACV: ${jh_full["ACV (USD)"].sum():,.2f} ({len(jh_full)} opps)')
print()

# =============================================================================
# DETAILED BREAKDOWN BY ACCOUNT
# =============================================================================

recommendations = []

for acct in eudia_dec['Account Name'].unique():
    print()
    print('=' * 120)
    print(f'📋 {acct.upper()}')
    print('=' * 120)
    
    # December expiring
    dec_opps = eudia_dec[eudia_dec['Account Name'] == acct]
    dec_total = dec_opps['Revenue'].sum()
    
    # All EUDIA for this account
    acct_clean = acct.lower()[:20]
    eudia_acct = eudia_all[eudia_all['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    eudia_total = eudia_acct['Revenue'].sum()
    
    # JH for this account
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(acct_clean, na=False, regex=False)]
    jh_total = jh_acct['ACV (USD)'].sum() if len(jh_acct) > 0 else 0
    
    print(f'\nSUMMARY:')
    print(f'   EUDIA All-Time: ${eudia_total:,.2f} ({len(eudia_acct)} opps)')
    print(f'   EUDIA Dec Expiring: ${dec_total:,.2f} ({len(dec_opps)} opps)')
    print(f'   JH Total ACV: ${jh_total:,.2f} ({len(jh_acct)} opps)')
    
    # Variance analysis
    variance = eudia_total - jh_total
    dec_pct = (dec_total / eudia_total * 100) if eudia_total > 0 else 0
    
    print(f'\n   EUDIA vs JH Variance: ${variance:,.2f}')
    print(f'   December as % of EUDIA Total: {dec_pct:.1f}%')
    
    # DECEMBER OPPORTUNITIES DETAIL
    print(f'\n📅 DECEMBER EXPIRING:')
    print('-' * 100)
    for _, opp in dec_opps.iterrows():
        print(f"   {opp['Opportunity Name'][:60]}")
        print(f"      Revenue: ${opp['Revenue']:,.2f} | Term: {opp['Term (Months)']} mo | End: {opp['End Date']}")
    
    # JH OPPORTUNITIES DETAIL (for comparison)
    if len(jh_acct) > 0:
        print(f'\n🔗 JOHNSON HANA OPPORTUNITIES:')
        print('-' * 100)
        for _, opp in jh_acct.iterrows():
            print(f"   {opp['Opportunity Name'][:60]}")
            print(f"      ACV: ${opp['ACV (USD)']:,.2f} | Term: {opp['Term']}")
    
    # ALL EUDIA (non-December) for redistribution targets
    eudia_non_dec = eudia_acct[~eudia_acct['Opportunity Name'].isin(dec_opps['Opportunity Name'].tolist())]
    
    if len(eudia_non_dec) > 0:
        print(f'\n📊 OTHER EUDIA OPPORTUNITIES (potential redistribution targets):')
        print('-' * 100)
        for _, opp in eudia_non_dec.head(10).iterrows():
            opp_name = opp['Opportunity Name']
            opp_rev = opp['Revenue'] if pd.notna(opp['Revenue']) else 0
            opp_id = opp['Opportunity ID']
            
            # Find JH match
            jh_match = jh_acct[jh_acct['Opportunity Name'].str.lower().str.contains(opp_name.lower()[:20], na=False, regex=False)]
            if len(jh_match) > 0:
                jh_acv = jh_match.iloc[0]['ACV (USD)']
                diff = jh_acv - opp_rev if pd.notna(jh_acv) else 0
                if diff > 500:
                    print(f"   ⬆️ {opp_name[:55]}")
                    print(f"      EUDIA: ${opp_rev:,.2f} → JH: ${jh_acv:,.2f} (understated by ${diff:,.2f})")
                    print(f"      ID: {opp_id}")
                elif diff < -500:
                    print(f"   ⬇️ {opp_name[:55]}")
                    print(f"      EUDIA: ${opp_rev:,.2f} → JH: ${jh_acv:,.2f} (overstated by ${abs(diff):,.2f})")
                    print(f"      ID: {opp_id}")
                else:
                    print(f"   ✅ {opp_name[:55]}")
                    print(f"      EUDIA: ${opp_rev:,.2f} ≈ JH: ${jh_acv:,.2f}")
            else:
                print(f"   ❓ {opp_name[:55]}")
                print(f"      EUDIA: ${opp_rev:,.2f} | No JH match")
    
    # RECOMMENDATION
    print(f'\n💡 RECOMMENDATION:')
    print('-' * 100)
    
    if len(jh_acct) == 0:
        print(f'   ℹ️ NO JH DATA - This appears to be a US pod or EUDIA-originated account')
        print(f'   ➡️ No redistribution needed - December expiring may be correct')
        recommendation = 'NO ACTION - No JH data'
    elif abs(variance) < 5000:
        print(f'   ✅ ALIGNED - EUDIA total matches JH total closely')
        print(f'   ➡️ Minor adjustments may be needed within opportunities')
        recommendation = 'ALIGNED - Minor adjustments'
    elif variance > 0:
        # EUDIA higher - may have bundled amounts
        if dec_pct > 50:
            print(f'   ⚠️ HIGH DECEMBER CONCENTRATION - {dec_pct:.0f}% of account revenue expires in December')
            print(f'   ➡️ Likely bundled ACV - redistribute to other opportunities')
            print(f'   ➡️ Reduce December by ~${dec_total - (jh_total * dec_pct/100):,.2f}')
            recommendation = f'REDISTRIBUTE - High Dec concentration ({dec_pct:.0f}%)'
        else:
            print(f'   ⚠️ EUDIA HIGHER - May have pre-JH historical revenue')
            print(f'   ➡️ Verify if variance is from EUDIA-only deals')
            recommendation = 'VERIFY - EUDIA higher than JH'
    else:
        # EUDIA lower - may be missing opportunities
        print(f'   ⚠️ EUDIA LOWER - May be missing JH opportunities')
        print(f'   ➡️ Create missing opportunities or increase existing amounts')
        recommendation = 'ADD - Missing JH opportunities'
    
    recommendations.append({
        'Account': acct,
        'EUDIA_Total': eudia_total,
        'December_Expiring': dec_total,
        'December_Pct': dec_pct,
        'JH_Total': jh_total,
        'Variance': variance,
        'Recommendation': recommendation
    })

# =============================================================================
# SUMMARY TABLE
# =============================================================================
print()
print('=' * 120)
print('SUMMARY: ALL DECEMBER EXPIRING ACCOUNTS')
print('=' * 120)
print()

rec_df = pd.DataFrame(recommendations)
rec_df = rec_df.sort_values('December_Expiring', ascending=False)

print(f"{'Account':<35} {'Dec Exp':>12} {'Dec %':>8} {'EUDIA Tot':>14} {'JH Tot':>14} {'Variance':>12} {'Recommendation':<30}")
print('-' * 130)
for _, row in rec_df.iterrows():
    print(f"{row['Account'][:34]:<35} ${row['December_Expiring']:>10,.0f} {row['December_Pct']:>7.0f}% ${row['EUDIA_Total']:>12,.0f} ${row['JH_Total']:>12,.0f} ${row['Variance']:>10,.0f}  {row['Recommendation'][:28]}")

print()
print(f"TOTAL DECEMBER EXPIRING: ${rec_df['December_Expiring'].sum():,.2f}")
print()

# Save summary
output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'
rec_df.to_csv(output_dir + 'account-redistribution-summary.csv', index=False)
print(f'Summary saved to: {output_dir}account-redistribution-summary.csv')

