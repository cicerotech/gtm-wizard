import pandas as pd
import re

# Load all sheets
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
attendees = pd.read_excel(xlsx, sheet_name='all campaign attendees')
closed_won = pd.read_excel(xlsx, sheet_name='closed won since sept.')
pipeline = pd.read_excel(xlsx, sheet_name='active in pipeline')

print('='*80)
print('MARKETING EVENT ROI ANALYSIS')
print('='*80)

# Get unique campaign names
print('\n=== UNIQUE CAMPAIGN NAMES ===')
campaigns = attendees['Campaign Name'].unique()
for c in sorted(campaigns):
    count = len(attendees[attendees['Campaign Name'] == c])
    print(f'  - "{c}" ({count} attendees)')

# Define campaign groups
SUPPER_CLUB = ['AI Supper Club']
LIGHTHOUSE = ['Lighthouse']
SUMMIT = ['SummitX - Final Report', 'Sept Summit']
IQPC = ['IQPC']
ECONOMIST = ['US Economist', 'London Economist', 'Economist']

print('\n' + '='*80)
print('CLOSED WON ANALYSIS')
print('='*80)
print(f'\nTotal Closed Won Deals: {len(closed_won)}')
print(f'Columns: {list(closed_won.columns)}')

# Get unique account names from closed won
print('\nClosed Won Account Names:')
for idx, row in closed_won.iterrows():
    acv = row.get('Commitment ACV', row.get('Revenue', 0))
    print(f"  - {row['Account Name']}: ${acv:,.0f}")

# Calculate total closed won revenue
total_closed = closed_won['Commitment ACV'].sum() if 'Commitment ACV' in closed_won.columns else closed_won['Revenue'].sum()
print(f'\nTotal Closed Won ACV: ${total_closed:,.0f}')

print('\n' + '='*80)
print('MATCHING ATTENDEES TO CLOSED WON')
print('='*80)

def normalize(name):
    """Normalize company name for matching"""
    if pd.isna(name):
        return ''
    name = str(name).lower().strip()
    # Remove common suffixes
    for suffix in [' inc', ' inc.', ' llc', ' corp', ' corporation', ' ltd', ' limited', ' plc', ' group']:
        name = name.replace(suffix, '')
    return name

# Create lookup of attendee companies by campaign
campaign_companies = {}
for campaign in campaigns:
    companies = attendees[attendees['Campaign Name'] == campaign]['Company'].dropna().unique()
    campaign_companies[campaign] = [normalize(c) for c in companies]

# Match closed won accounts to campaigns
print('\n=== EVENT ATTRIBUTION FOR CLOSED WON ===')

results = {}
for campaign in campaigns:
    results[campaign] = {'companies': [], 'total_acv': 0, 'count': 0}

for idx, row in closed_won.iterrows():
    account = normalize(row['Account Name'])
    acv = row.get('Commitment ACV', row.get('Revenue', 0))
    if pd.isna(acv):
        acv = 0
    
    for campaign in campaigns:
        for company in campaign_companies[campaign]:
            # Fuzzy match - check if account contains company or vice versa
            if account in company or company in account or account == company:
                results[campaign]['companies'].append((row['Account Name'], acv))
                results[campaign]['total_acv'] += acv
                results[campaign]['count'] += 1
                break

print('\n=== RESULTS BY CAMPAIGN ===\n')
for campaign in sorted(results.keys()):
    data = results[campaign]
    if data['count'] > 0:
        print(f'{campaign}:')
        print(f'  Closed Won Deals: {data["count"]}')
        print(f'  Total ACV: ${data["total_acv"]:,.0f}')
        for company, acv in data['companies']:
            print(f'    - {company}: ${acv:,.0f}')
        print()

# Now let's also analyze pipeline
print('\n' + '='*80)
print('PIPELINE ANALYSIS')
print('='*80)

# Extract company name from opportunity name
def extract_company(opp_name):
    if pd.isna(opp_name):
        return ''
    # Usually format is "Company - Description"
    parts = str(opp_name).split(' - ')
    return parts[0].strip() if parts else ''

pipeline['Company'] = pipeline['Opportunity Name'].apply(extract_company)

print('\n=== EVENT ATTRIBUTION FOR ACTIVE PIPELINE ===')

pipeline_results = {}
for campaign in campaigns:
    pipeline_results[campaign] = {'companies': [], 'total_acv': 0, 'count': 0}

for idx, row in pipeline.iterrows():
    company = normalize(row['Company'])
    acv = row.get('ACV', row.get('ACV__c', 100000))  # Default estimate
    if pd.isna(acv):
        acv = 100000
    
    for campaign in campaigns:
        for camp_company in campaign_companies[campaign]:
            if company in camp_company or camp_company in company or company == camp_company:
                if len(company) > 2:  # Avoid false matches on short strings
                    pipeline_results[campaign]['companies'].append((row['Company'], row['Stage']))
                    pipeline_results[campaign]['count'] += 1
                    break

print('\n=== PIPELINE RESULTS BY CAMPAIGN ===\n')
for campaign in sorted(pipeline_results.keys()):
    data = pipeline_results[campaign]
    if data['count'] > 0:
        print(f'{campaign}:')
        print(f'  Active Pipeline Deals: {data["count"]}')
        for company, stage in data['companies'][:10]:  # Limit to first 10
            print(f'    - {company} ({stage})')
        if len(data['companies']) > 10:
            print(f'    ... and {len(data["companies"]) - 10} more')
        print()

# Final summary
print('\n' + '='*80)
print('SUMMARY FOR EOY REVIEW')
print('='*80)

# Group campaigns for the review
print('\n1. AI SUPPER CLUB SERIES:')
supper_total = sum(results[c]['total_acv'] for c in results if 'supper' in c.lower())
supper_count = sum(results[c]['count'] for c in results if 'supper' in c.lower())
print(f'   Closed Won ARR: ${supper_total:,.0f}')
print(f'   Deals: {supper_count}')

print('\n2. LIGHTHOUSE EVENT:')
lighthouse_total = sum(results[c]['total_acv'] for c in results if 'lighthouse' in c.lower())
lighthouse_count = sum(results[c]['count'] for c in results if 'lighthouse' in c.lower())
# Check for Intuit and Pure Storage specifically
intuit_match = [r for r in results.get('Lighthouse', {}).get('companies', []) if 'intuit' in r[0].lower()]
pure_match = [r for r in results.get('Lighthouse', {}).get('companies', []) if 'pure' in r[0].lower()]
print(f'   Closed Won ARR: ${lighthouse_total:,.0f}')
print(f'   Deals: {lighthouse_count}')
print(f'   Intuit matched: {len(intuit_match) > 0}')
print(f'   Pure Storage matched: {len(pure_match) > 0}')

print('\n3. AUGMENTED INTELLIGENCE SUMMIT (SummitX):')
summit_total = sum(results[c]['total_acv'] for c in results if 'summit' in c.lower())
summit_count = sum(results[c]['count'] for c in results if 'summit' in c.lower())
summit_pipeline = sum(pipeline_results[c]['count'] for c in pipeline_results if 'summit' in c.lower())
print(f'   Closed Won ARR: ${summit_total:,.0f}')
print(f'   Deals Closed: {summit_count}')
print(f'   Active Pipeline Opps: {summit_pipeline}')

print('\n4. THIRD-PARTY EVENTS (IQPC, Economist):')
iqpc_total = sum(results[c]['total_acv'] for c in results if 'iqpc' in c.lower())
economist_total = sum(results[c]['total_acv'] for c in results if 'economist' in c.lower())
# Check for Bayer specifically
bayer_match = any('bayer' in str(r).lower() for c in results.values() for r in c.get('companies', []))
print(f'   IQPC Closed Won ARR: ${iqpc_total:,.0f}')
print(f'   Economist Closed Won ARR: ${economist_total:,.0f}')
print(f'   Bayer deal sourced from IQPC: {bayer_match}')
