#!/usr/bin/env python3
"""
Analyze Johnson Hana contracts vs Salesforce opportunities
"""
import pandas as pd
import os

# File paths
excel_path = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
contracts_path = '/Users/keiganpesenti/Desktop/Client Contracts'

# Read Excel data
df = pd.read_excel(excel_path, sheet_name='All Closed Won Opportunities')
df.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']

df_nov = pd.read_excel(excel_path, sheet_name='EU November Revenue by Client')

print('=' * 80)
print('JOHNSON HANA CONTRACT RECONCILIATION ANALYSIS')
print('=' * 80)

print('\n=== NOVEMBER REVENUE BY CLIENT ===')
print(df_nov.to_string(index=False))

print('\n=== CONTRACT FOLDERS AVAILABLE ===')
folders = os.listdir(contracts_path)
folders = [f for f in folders if os.path.isdir(os.path.join(contracts_path, f))]
for f in sorted(folders):
    files = os.listdir(os.path.join(contracts_path, f))
    pdf_count = len([x for x in files if x.endswith('.pdf')])
    print(f'  {f}: {pdf_count} contract PDFs')

# Key client mapping (folder name -> potential Salesforce account name patterns)
client_mapping = {
    'AirBnB': ['Airbnb'],
    'Airship': ['Airship'],
    'Aramark': ['Aramark'],
    'Aryza': ['Aryza'],
    'BOI': ['Bank of Ireland', 'BOI'],
    'Coillte': ['Coillte'],
    'Comisiun na Mean': ['Coimisi', 'Mean'],
    'Commscope': ['CommScope'],
    'Consensys': ['Consensys'],
    'Datalex': ['Datalex'],
    'Dropbox': ['Dropbox'],
    'ESB': ['ESB'],
    'Etsy': ['Etsy'],
    'Gilead': ['Gilead'],
    'Glanbia': ['Glanbia'],
    'Indeed': ['Indeed'],
    'Irish Water : Uisce Eireann': ['Irish Water', 'Uisce'],
    'Kellanova': ['Kellanova'],
    'Northern Trust': ['Northern Trust'],
    'OpenAI': ['OpenAi', 'OpenAI'],
    'Orsted': ['Orsted'],
    'Perrigo': ['Perrigo'],
    'Sisk': ['Sisk'],
    'Stripe': ['Stripe'],
    'Taoglas': ['Taoglas'],
    'Teamwork': ['Teamwork'],
    'TikTok': ['TikTok', 'Tiktok'],
    'Tinder': ['Tinder'],
    'Udemy': ['Udemy'],
}

print('\n' + '=' * 80)
print('OPPORTUNITIES BY CLIENT (with contract folders)')
print('=' * 80)

for folder, patterns in client_mapping.items():
    # Find matching opportunities
    mask = df['Account_Name'].str.contains('|'.join(patterns), case=False, na=False)
    client_opps = df[mask].copy()
    
    if len(client_opps) > 0:
        total_acv = client_opps['ACV'].sum()
        total_rev = client_opps['Revenue'].sum()
        
        # Get November revenue
        nov_match = df_nov[df_nov['Account Name'].str.contains('|'.join(patterns), case=False, na=False)]
        nov_rev = nov_match['November Run Rate'].sum() if len(nov_match) > 0 else 0
        
        print(f'\n{"="*60}')
        print(f'{folder.upper()}')
        print(f'{"="*60}')
        print(f'November Run Rate: ${nov_rev:,.2f}')
        print(f'Salesforce Total ACV: ${total_acv:,.0f}')
        print(f'Salesforce Total Revenue: ${total_rev:,.0f}')
        print(f'Opportunities: {len(client_opps)}')
        print('-' * 60)
        
        # Show each opportunity
        for _, row in client_opps.iterrows():
            opp_name = row['Opp_Name'][:55] if pd.notna(row['Opp_Name']) else 'N/A'
            acv = row['ACV'] if pd.notna(row['ACV']) else 0
            term = row['Term'] if pd.notna(row['Term']) else 'N/A'
            rev_type = row['Revenue_Type'] if pd.notna(row['Revenue_Type']) else 'N/A'
            print(f'  {opp_name}')
            print(f'    ACV: ${acv:,.0f} | Term: {term} months | Type: {rev_type}')

print('\n' + '=' * 80)
print('SUMMARY: Clients needing contract validation')
print('=' * 80)
print('Review each contract folder against the Salesforce opportunities listed above.')
print('Key fields to validate: ACV, Term, TCV (ACV*Term/12 if >12mo), Product Line')


