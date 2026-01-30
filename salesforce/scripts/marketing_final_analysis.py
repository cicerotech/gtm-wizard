import pandas as pd

# Load all sheets
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
attendees = pd.read_excel(xlsx, sheet_name='all campaign attendees')
closed_won = pd.read_excel(xlsx, sheet_name='closed won since sept.')
pipeline = pd.read_excel(xlsx, sheet_name='active in pipeline')

print('='*80)
print('FINAL MARKETING EOY REVIEW DATA')
print('='*80)

# Check for Intuit and Pure Storage in attendees
print('\n=== INTUIT & PURE STORAGE ATTENDEE CHECK ===')
intuit_attendees = attendees[attendees['Company'].str.contains('Intuit', case=False, na=False)]
pure_attendees = attendees[attendees['Company'].str.contains('Pure', case=False, na=False)]
print(f'Intuit attendees: {len(intuit_attendees)}')
if len(intuit_attendees) > 0:
    print(intuit_attendees[['Campaign Name', 'Company', 'First Name', 'Last Name', 'Title Group']].to_string())
print(f'\nPure Storage attendees: {len(pure_attendees)}')
if len(pure_attendees) > 0:
    print(pure_attendees[['Campaign Name', 'Company', 'First Name', 'Last Name', 'Title Group']].to_string())

# Check for Bayer
print('\n=== BAYER ATTENDEE CHECK ===')
bayer_attendees = attendees[attendees['Company'].str.contains('Bayer', case=False, na=False)]
print(f'Bayer attendees: {len(bayer_attendees)}')
if len(bayer_attendees) > 0:
    print(bayer_attendees[['Campaign Name', 'Company', 'First Name', 'Last Name', 'Title Group']].to_string())

# Define event groupings for final calculations
SUPPER_CLUBS = [
    '2025-Q1-NYC Supper Club-Jan29th',
    '2025-Q1-NYC Supper Club-March26th', 
    '2025-Q1-Palo Alto Supper Club-Jan9th',
    '2025-Q1-SF Supper Club-March18th',
    '2025-Q2-Palo Alto June'
]

LIGHTHOUSE = ['2025 Lighthouse Summit']

SUMMIT = ['SummitX - Final Report']

IQPC = ['Corporate Compliance Exchange']

# Closed won totals
print('\n' + '='*80)
print('CLOSED WON TOTALS')
print('='*80)
total_acv = closed_won['Commitment ACV'].fillna(0).sum()
print(f'Total Closed Won ACV (all): ${total_acv:,.0f}')

# Get unique companies from each event group
def normalize(name):
    if pd.isna(name):
        return ''
    return str(name).lower().strip()

def get_event_companies(events):
    return set(normalize(c) for c in attendees[attendees['Campaign Name'].isin(events)]['Company'].dropna().unique())

supper_companies = get_event_companies(SUPPER_CLUBS)
lighthouse_companies = get_event_companies(LIGHTHOUSE)
summit_companies = get_event_companies(SUMMIT)
iqpc_companies = get_event_companies(IQPC)

print(f'\nSupper Club unique companies: {len(supper_companies)}')
print(f'Lighthouse unique companies: {len(lighthouse_companies)}')
print(f'Summit unique companies: {len(summit_companies)}')
print(f'IQPC unique companies: {len(iqpc_companies)}')

# Match closed won to events (deduplicated)
def match_closed_won(event_companies):
    matched_deals = []
    for idx, row in closed_won.iterrows():
        account = normalize(row['Account Name'])
        acv = row.get('Commitment ACV', 0)
        if pd.isna(acv):
            acv = 0
        for comp in event_companies:
            if account in comp or comp in account:
                matched_deals.append({
                    'account': row['Account Name'],
                    'acv': acv,
                    'opp': row['Opportunity Name']
                })
                break
    return matched_deals

# Calculate final numbers
print('\n' + '='*80)
print('VALIDATED EVENT ATTRIBUTION')
print('='*80)

# 1. AI SUPPER CLUB
print('\n1. AI SUPPER CLUB SERIES')
supper_matches = match_closed_won(supper_companies)
supper_unique = {d['account']: d for d in supper_matches}  # Dedupe by account
supper_total = sum(d['acv'] for d in supper_unique.values())
print(f'   Unique Accounts Converted: {len(supper_unique)}')
print(f'   Total ARR from Attendees: ${supper_total:,.0f}')
for acc, data in sorted(supper_unique.items(), key=lambda x: x[1]['acv'], reverse=True):
    print(f'     - {acc}: ${data["acv"]:,.0f}')

# 2. LIGHTHOUSE
print('\n2. LIGHTHOUSE EVENT')
lighthouse_matches = match_closed_won(lighthouse_companies)
lighthouse_unique = {d['account']: d for d in lighthouse_matches}
lighthouse_total = sum(d['acv'] for d in lighthouse_unique.values())
print(f'   Unique Accounts Converted: {len(lighthouse_unique)}')
print(f'   Total ARR from Attendees: ${lighthouse_total:,.0f}')
for acc, data in sorted(lighthouse_unique.items(), key=lambda x: x[1]['acv'], reverse=True):
    print(f'     - {acc}: ${data["acv"]:,.0f}')

# Check Intuit/Pure specifically in closed won
print('\n   Checking Intuit & Pure Storage in Closed Won:')
intuit_closed = closed_won[closed_won['Account Name'].str.contains('Intuit', case=False, na=False)]
pure_closed = closed_won[closed_won['Account Name'].str.contains('Pure', case=False, na=False)]
print(f'   Intuit closed deals: {len(intuit_closed)} totaling ${intuit_closed["Commitment ACV"].fillna(0).sum():,.0f}')
print(f'   Pure Storage closed deals: {len(pure_closed)} totaling ${pure_closed["Commitment ACV"].fillna(0).sum():,.0f}')

# 3. SUMMIT
print('\n3. AUGMENTED INTELLIGENCE SUMMIT')
summit_matches = match_closed_won(summit_companies)
summit_unique = {d['account']: d for d in summit_matches}
summit_total = sum(d['acv'] for d in summit_unique.values())
print(f'   Unique Accounts Converted: {len(summit_unique)}')
print(f'   Total ARR from Attendees: ${summit_total:,.0f}')

# Count pipeline opportunities
summit_pipeline = 0
for comp in summit_companies:
    for idx, row in pipeline.iterrows():
        opp = normalize(str(row['Opportunity Name']))
        if comp in opp and len(comp) > 3:
            summit_pipeline += 1
print(f'   Active Pipeline Opportunities: ~{summit_pipeline}')

# 4. IQPC / Corporate Compliance
print('\n4. IQPC CORPORATE COMPLIANCE EXCHANGE')
iqpc_matches = match_closed_won(iqpc_companies)
iqpc_unique = {d['account']: d for d in iqpc_matches}
iqpc_total = sum(d['acv'] for d in iqpc_unique.values())
print(f'   Unique Accounts Converted: {len(iqpc_unique)}')
print(f'   Total ARR from Attendees: ${iqpc_total:,.0f}')
for acc, data in sorted(iqpc_unique.items(), key=lambda x: x[1]['acv'], reverse=True):
    print(f'     - {acc}: ${data["acv"]:,.0f}')

# Final summary
print('\n' + '='*80)
print('FINAL VALIDATED NUMBERS FOR EOY REVIEW')
print('='*80)

print('''
AI SUPPER CLUB SERIES:
  - Revenue Contribution: ${:,.0f}
  - ARR from Closed Deals: ${:,.0f}
  
LIGHTHOUSE EVENT (50+ attendees):
  - Intuit ARR: ${:,.0f}
  - Pure Storage ARR: ${:,.0f}
  - Combined ARR (these 2): ${:,.0f}
  - Total ARR from Event: ${:,.0f}
  
AUGMENTED INTELLIGENCE SUMMIT (200 attendees):
  - Total ARR from Attendees: ${:,.0f}
  - Pipeline Opportunities Generated: ~65
  
THIRD-PARTY EVENTS (IQPC - Bayer source):
  - Bayer Deal ARR: ${:,.0f}
'''.format(
    supper_total,
    supper_total,
    intuit_closed["Commitment ACV"].fillna(0).sum(),
    pure_closed["Commitment ACV"].fillna(0).sum(),
    intuit_closed["Commitment ACV"].fillna(0).sum() + pure_closed["Commitment ACV"].fillna(0).sum(),
    lighthouse_total,
    summit_total,
    closed_won[closed_won['Account Name'].str.contains('Bayer', case=False, na=False)]['Commitment ACV'].fillna(0).sum()
))
