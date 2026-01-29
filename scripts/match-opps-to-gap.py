#!/usr/bin/env python3
"""
Match Won Opps to the Gap - Find which opps fill the missing revenue
"""

import pandas as pd

# Load opps
opps = pd.read_excel('/Users/keiganpesenti/Desktop/jh opps.xlsx', sheet_name='JH')

# November RR targets
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

# Contract ACV already captured
contracts_acv = {
    'Airbnb': 118250, 'Airship': 180000, 'Aryza': 230100, 'BOI': 276000,
    'Coimisiún na Meán': 167480, 'CommScope': 150480, 'Consensys': 69660,
    'Datalex': 408000, 'Dropbox': 57000, 'ESB': 21250, 'Etsy': 66000,
    'Gilead': 162000, 'Glanbia': 72000, 'Indeed': 150000, 'Irish Water': 160930,
    'Kellanova': 124800, 'Northern Trust': 129700, 'OpenAi': 904624,
    'Orsted': 67200, 'Perrigo': 48000, 'Sisk': 12000, 'Stripe': 52800,
    'Taoglas': 30000, 'Teamwork': 1320, 'TikTok': 51200, 'Tinder': 86400,
    'ACS': 0, 'Kingspan': 0, 'Udemy': 0, 'Coillte': 0, 'Coleman Legal': 0,
    'Creed McStay': 0, 'DCEDIY': 0, 'Hayes': 0, 'NTMA': 0
}

# Account name mapping (opps use full names)
account_mapping = {
    'ACS': ['Arabic Computer Systems'],
    'Airbnb': ['Airbnb'],
    'Airship': ['Airship Group'],
    'Aryza': ['Aryza'],
    'BOI': ['Bank of Ireland'],
    'Coimisiún na Meán': ['Coimisiun na Mean', 'Coimisiún'],
    'CommScope': ['CommScope Technologies'],
    'Consensys': ['Consensys'],
    'Datalex': ['Datalex'],
    'Dropbox': ['Dropbox International'],
    'ESB': ['ESB NI/Electric Ireland', 'Electricity Supply Board', 'ESB'],
    'Etsy': ['Etsy Ireland'],
    'Gilead': ['Gilead Sciences'],
    'Glanbia': ['Glanbia Management'],
    'Indeed': ['Indeed Ireland'],
    'Irish Water': ['Uisce Eireann', 'Irish Water'],
    'Kellanova': ['Kellanova'],
    'Kingspan': ['Kingspan'],
    'Northern Trust': ['Northern Trust'],
    'OpenAi': ['OpenAi', 'OpenAI'],
    'Orsted': ['Orsted'],
    'Perrigo': ['Perrigo'],
    'Sisk': ['Sisk'],
    'Stripe': ['Stripe Payments'],
    'Taoglas': ['Taoglas'],
    'Teamwork': ['Teamwork'],
    'TikTok': ['Tiktok Information', 'TikTok'],
    'Tinder': ['Tinder'],
    'Udemy': ['Udemy Ireland'],
    'Coillte': ['Coillte'],
    'Coleman Legal': ['Coleman Legal'],
    'Creed McStay': ['Creed McStay', 'McDermott Creed'],
    'DCEDIY': ['Department of Children', 'DCEDIY'],
    'Hayes': ['Hayes Solicitors'],
    'NTMA': ['NTMA']
}

# Top gap accounts to analyze
top_gap_accounts = ['BOI', 'Stripe', 'OpenAi', 'Udemy', 'ESB', 'Irish Water', 
                    'Indeed', 'Etsy', 'Coimisiún na Meán', 'Coillte', 'NTMA',
                    'Dropbox', 'TikTok', 'ACS', 'Tinder']

print("="*120)
print("MATCHING WON OPPS TO REVENUE GAP - Finding Missing Contract Revenue")
print("="*120)

all_matches = []

for short_name in top_gap_accounts:
    rr = november_rr.get(short_name, 0)
    acv = contracts_acv.get(short_name, 0)
    gap = rr - acv
    
    if gap <= 0:
        continue
    
    print(f"\n{'='*120}")
    print(f"ACCOUNT: {short_name}")
    print(f"November RR: ${rr:,.0f} | Contract ACV: ${acv:,.0f} | GAP: ${gap:,.0f}")
    print("="*120)
    
    # Find matching opps
    search_terms = account_mapping.get(short_name, [short_name])
    matching_opps = opps[opps['Account Name'].str.contains('|'.join(search_terms), case=False, na=False)]
    
    if len(matching_opps) == 0:
        print(f"  ⚠️ No opps found for {short_name}")
        continue
    
    # Sort by revenue descending
    matching_opps = matching_opps.sort_values('Revenue', ascending=False)
    
    total_opp_rev = matching_opps['Revenue'].sum()
    print(f"Found {len(matching_opps)} opps | Total Opp Revenue: ${total_opp_rev:,.0f}")
    print("-"*120)
    
    # Show opps that could fill the gap
    running_total = acv  # Start with what's already in contracts
    
    print(f"{'Rev Type':<12} {'Opp Name':<55} {'Revenue':>12} {'Running':>12} {'vs RR':>12}")
    print("-"*120)
    
    for idx, opp in matching_opps.iterrows():
        rev_type = str(opp['Recurring, Project, or Commit'])[:10] if pd.notna(opp['Recurring, Project, or Commit']) else 'N/A'
        opp_name = str(opp['Opportunity Name'])[:53]
        rev = opp['Revenue'] if pd.notna(opp['Revenue']) else 0
        
        running_total += rev
        vs_rr = running_total - rr
        
        # Flag if this opp would help close the gap
        flag = "✓" if running_total <= rr else "OVER"
        
        print(f"{rev_type:<12} {opp_name:<55} ${rev:>10,.0f} ${running_total:>10,.0f} {flag:>12}")
        
        all_matches.append({
            'Account': short_name,
            'November_RR': rr,
            'Contract_ACV': acv,
            'Gap': gap,
            'Rev_Type': rev_type,
            'Opp_Name': opp['Opportunity Name'],
            'Opp_Revenue': rev,
            'Running_Total': running_total
        })
    
    print(f"\nSummary: Need ${gap:,.0f} more to match Nov RR. Opps total ${total_opp_rev:,.0f}")
    if total_opp_rev >= gap:
        print(f"  ✓ Sufficient opps exist to cover the gap")
    else:
        print(f"  ⚠️ Opps only cover ${total_opp_rev:,.0f} of ${gap:,.0f} gap")

# Summary
print("\n\n" + "="*120)
print("SUMMARY: OPPS THAT SHOULD BE CONVERTED TO CONTRACTS")
print("="*120)

df = pd.DataFrame(all_matches)
df.to_excel('/Users/keiganpesenti/Desktop/JH_Opps_to_Fill_Gap.xlsx', index=False)
print("\nSaved detailed analysis: ~/Desktop/JH_Opps_to_Fill_Gap.xlsx")

# Show key recommendations
print("\n" + "="*120)
print("KEY RECOMMENDATIONS - Opps to Convert to Contracts")
print("="*120)

for short_name in ['BOI', 'Stripe', 'ESB', 'Udemy', 'OpenAi']:
    rr = november_rr.get(short_name, 0)
    acv = contracts_acv.get(short_name, 0)
    gap = rr - acv
    
    search_terms = account_mapping.get(short_name, [short_name])
    matching = opps[opps['Account Name'].str.contains('|'.join(search_terms), case=False, na=False)]
    matching = matching[matching['Revenue'] > 0].sort_values('Revenue', ascending=False)
    
    print(f"\n{short_name} (Gap: ${gap:,.0f})")
    print("-"*60)
    
    cumulative = acv
    for idx, opp in matching.head(5).iterrows():
        rev = opp['Revenue']
        cumulative += rev
        remaining = rr - cumulative
        print(f"  + ${rev:>10,.0f}  {str(opp['Opportunity Name'])[:45]}...")
        if cumulative >= rr:
            print(f"    → Covers RR target (${cumulative:,.0f} >= ${rr:,.0f})")
            break






