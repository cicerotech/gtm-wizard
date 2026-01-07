#!/usr/bin/env python3
"""
Goal Seek: Find missing revenue by comparing November RR to Contracts
"""

import pandas as pd

# November Run Rate targets (from user's screenshot)
november_rr = {
    'ACS': 156452.86,
    'Airbnb': 211906.62,
    'Airship': 166527.79,
    'Aryza': 104079.87,
    'BOI': 1652399.77,
    'Coimisiún na Meán': 389675.03,
    'CommScope': 158201.40,
    'Consensys': 79100.70,
    'Datalex': 104912.51,
    'Dropbox': 222037.06,
    'ESB': 473355.25,
    'Etsy': 304329.54,
    'Gilead': 186511.13,
    'Glanbia': 90341.33,
    'Indeed': 417845.98,
    'Irish Water': 440882.33,
    'Kellanova': 150291.33,
    'Kingspan': 97085.70,
    'Northern Trust': 145711.82,
    'OpenAi': 1537051.52,
    'Orsted': 104079.87,
    'Perrigo': 127393.76,
    'Sisk': 69386.58,
    'Stripe': 1223979.27,
    'Taoglas': 60782.64,
    'Teamwork': 70357.99,
    'TikTok': 208159.74,
    'Tinder': 228975.71,
    'Udemy': 533721.57,
    'Coillte': 194837.52,
    'Coleman Legal': 16652.78,
    'Creed McStay': 38804.44,
    'DCEDIY': 37152.91,
    'Hayes': 69386.58,
    'NTMA': 170690.99
}

# Contract ACV from the contracts report (from earlier analysis)
contracts_acv = {
    'Airbnb': 118250,
    'Airship': 180000,
    'Aramark': 0,
    'Aryza': 230100,
    'BOI': 276000,
    'Coimisiún na Meán': 167480,
    'CommScope': 150480,
    'Consensys': 69660,
    'Datalex': 408000,
    'Dropbox': 57000,
    'ESB': 21250,
    'Etsy': 66000,
    'Gilead': 162000,
    'Glanbia': 72000,
    'Indeed': 150000,
    'Irish Water': 160930,
    'Kellanova': 124800,
    'Northern Trust': 129700,
    'OpenAi': 904624,
    'Orsted': 67200,
    'Perrigo': 48000,
    'Sisk': 12000,
    'Stripe': 52800,
    'Taoglas': 30000,
    'Teamwork': 1320,
    'TikTok': 51200,
    'Tinder': 86400,
    # These had $0 in contracts
    'ACS': 0,
    'Kingspan': 0,
    'Udemy': 0,
    'Coillte': 0,
    'Coleman Legal': 0,
    'Creed McStay': 0,
    'DCEDIY': 0,
    'Hayes': 0,
    'NTMA': 0
}

# Calculate gap for each account
print("="*100)
print("NOVEMBER RR vs CONTRACT ACV - GOAL SEEK ANALYSIS")
print("="*100)
print(f"\n{'Account':<25} {'Nov RR':>15} {'Contract ACV':>15} {'GAP':>15} {'% Captured':>12}")
print("-"*85)

total_rr = 0
total_acv = 0
total_gap = 0

results = []
for account, rr in sorted(november_rr.items(), key=lambda x: x[1], reverse=True):
    acv = contracts_acv.get(account, 0)
    gap = rr - acv
    pct = (acv / rr * 100) if rr > 0 else 0
    
    total_rr += rr
    total_acv += acv
    total_gap += gap
    
    results.append({
        'Account': account,
        'November_RR': rr,
        'Contract_ACV': acv,
        'Gap': gap,
        'Pct_Captured': pct
    })
    
    flag = "⚠️" if gap > 50000 else ""
    print(f"{account:<25} ${rr:>13,.0f} ${acv:>13,.0f} ${gap:>13,.0f} {pct:>10.1f}% {flag}")

print("-"*85)
print(f"{'TOTAL':<25} ${total_rr:>13,.0f} ${total_acv:>13,.0f} ${total_gap:>13,.0f} {(total_acv/total_rr*100):>10.1f}%")

print(f"\n\n{'='*100}")
print("TOP ACCOUNTS BY GAP (Missing Revenue)")
print("="*100)

results_df = pd.DataFrame(results)
results_df = results_df.sort_values('Gap', ascending=False)

print(f"\n{'Account':<25} {'Gap':>15} {'% Missing':>12}")
print("-"*55)
for _, row in results_df.head(15).iterrows():
    pct_missing = 100 - row['Pct_Captured']
    print(f"{row['Account']:<25} ${row['Gap']:>13,.0f} {pct_missing:>10.1f}%")

# Accounts with NO contract coverage at all
print(f"\n\n{'='*100}")
print("ACCOUNTS WITH ZERO CONTRACT COVERAGE (100% MISSING)")
print("="*100)
zero_coverage = results_df[results_df['Contract_ACV'] == 0].sort_values('November_RR', ascending=False)
print(f"\nThese accounts have November RR but NO contracts uploaded:\n")
for _, row in zero_coverage.iterrows():
    print(f"  {row['Account']:<25} ${row['November_RR']:>12,.0f} RR → Need contracts for this revenue")

print(f"\n  Total Zero Coverage Gap: ${zero_coverage['Gap'].sum():,.0f}")

# Summary
print(f"\n\n{'='*100}")
print("SUMMARY")
print("="*100)
print(f"""
Total November Run Rate:     ${total_rr:,.0f}
Total Contract ACV:          ${total_acv:,.0f}
─────────────────────────────────────────
TOTAL GAP:                   ${total_gap:,.0f}

The ~$6M gap comes from:
1. Accounts with ZERO contracts:     ${zero_coverage['Gap'].sum():,.0f}
2. Accounts with PARTIAL coverage:   ${total_gap - zero_coverage['Gap'].sum():,.0f}
""")

# Save to Excel
results_df.to_excel('/Users/keiganpesenti/Desktop/JH_November_RR_Gap_Analysis.xlsx', index=False)
print("Saved: ~/Desktop/JH_November_RR_Gap_Analysis.xlsx")



