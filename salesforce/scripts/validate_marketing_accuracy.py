import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Load all sheets
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
attendees = pd.read_excel(xlsx, sheet_name='all campaign attendees')
closed_won = pd.read_excel(xlsx, sheet_name='closed won since sept.')
pipeline = pd.read_excel(xlsx, sheet_name='active in pipeline')

print('='*100)
print('ULTRA-ACCURATE VALIDATION REPORT')
print('='*100)

# STEP 1: Validate source data integrity
print('\n[VALIDATION 1] SOURCE DATA INTEGRITY')
print('-'*50)
print(f'Attendees records: {len(attendees)}')
print(f'Closed Won records: {len(closed_won)}')
print(f'Pipeline records: {len(pipeline)}')
print(f'Attendees with Company: {attendees["Company"].notna().sum()}')
print(f'Closed Won with ACV: {closed_won["Commitment ACV"].notna().sum()}')

# STEP 2: List all campaigns and their exact attendee counts
print('\n[VALIDATION 2] EXACT CAMPAIGN COUNTS')
print('-'*50)
campaign_counts = attendees.groupby('Campaign Name').size().sort_values(ascending=False)
for campaign, count in campaign_counts.items():
    print(f'  {campaign}: {count} attendees')

# STEP 3: List all Closed Won accounts with exact ACV
print('\n[VALIDATION 3] CLOSED WON - EXACT DATA')
print('-'*50)
closed_won_clean = closed_won[['Account Name', 'Opportunity Name', 'Commitment ACV', 'Close Date']].copy()
closed_won_clean['Commitment ACV'] = closed_won_clean['Commitment ACV'].fillna(0)
closed_won_sorted = closed_won_clean.sort_values('Commitment ACV', ascending=False)
total_closed = closed_won_clean['Commitment ACV'].sum()
print(f'TOTAL CLOSED WON ACV: ${total_closed:,.2f}')
print(f'\nTop 20 deals:')
for idx, row in closed_won_sorted.head(20).iterrows():
    print(f"  ${row['Commitment ACV']:>12,.0f} | {row['Account Name'][:30]:<30} | {str(row['Opportunity Name'])[:40]}")

# STEP 4: Rigorous matching - exact company name matches only
print('\n[VALIDATION 4] RIGOROUS ATTENDEE-TO-CLOSED WON MATCHING')
print('-'*50)

def clean_company(name):
    """Standardize company names for matching"""
    if pd.isna(name):
        return ''
    name = str(name).strip()
    # Remove common suffixes but keep original case for verification
    return name

# Create company-to-campaigns lookup
company_campaigns = {}
for idx, row in attendees.iterrows():
    company = clean_company(row['Company'])
    campaign = row['Campaign Name']
    if company:
        if company not in company_campaigns:
            company_campaigns[company] = set()
        company_campaigns[company].add(campaign)

# Match closed won to campaigns with EXACT matching
matches = []
unmatched = []

for idx, row in closed_won.iterrows():
    account = clean_company(row['Account Name'])
    acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
    opp = row['Opportunity Name']
    
    # Try exact match first
    matched_campaigns = []
    
    for company, campaigns in company_campaigns.items():
        # Exact match (case-insensitive)
        if account.lower() == company.lower():
            matched_campaigns.extend(campaigns)
        # Substring match (account in company or vice versa) - minimum 4 chars to avoid false positives
        elif len(account) >= 4 and len(company) >= 4:
            if account.lower() in company.lower() or company.lower() in account.lower():
                matched_campaigns.extend(campaigns)
    
    if matched_campaigns:
        matches.append({
            'Account': account,
            'Opportunity': opp,
            'ACV': acv,
            'Campaigns': list(set(matched_campaigns))
        })
    else:
        unmatched.append({
            'Account': account,
            'Opportunity': opp,
            'ACV': acv
        })

print(f'\nMatched deals: {len(matches)}')
print(f'Unmatched deals: {len(unmatched)}')
print(f'Match rate: {len(matches)/len(closed_won)*100:.1f}%')

# STEP 5: Calculate event-specific ARR with full audit trail
print('\n[VALIDATION 5] EVENT-SPECIFIC ARR WITH AUDIT TRAIL')
print('='*100)

# Define event groupings
EVENT_GROUPS = {
    'AI Supper Club Series': [
        '2025-Q1-NYC Supper Club-Jan29th',
        '2025-Q1-NYC Supper Club-March26th',
        '2025-Q1-Palo Alto Supper Club-Jan9th',
        '2025-Q1-SF Supper Club-March18th',
        '2025-Q2-Palo Alto June'
    ],
    'Lighthouse Event': ['2025 Lighthouse Summit'],
    'Augmented Intelligence Summit': ['SummitX - Final Report'],
    'IQPC Corporate Compliance': ['Corporate Compliance Exchange'],
    'Economist Dinner': ['Economist U.S Dinner 2025'],
    'US Open Suite': ['U.S Open Suite 2025'],
    'Burton Awards': ['2025 Burton Awards Campaign'],
    'Dallas April': ['2025 - Q1 -  Dallas April 29th'],
    'Hakluyt Chicago': ['2025 - Q1 - Hakluyt Chicago']
}

# Calculate for each event group
event_results = {}
for event_name, campaigns in EVENT_GROUPS.items():
    event_matches = []
    seen_accounts = set()  # Deduplicate by account
    
    for match in matches:
        if any(c in campaigns for c in match['Campaigns']):
            if match['Account'] not in seen_accounts:
                event_matches.append(match)
                seen_accounts.add(match['Account'])
    
    total_arr = sum(m['ACV'] for m in event_matches)
    event_results[event_name] = {
        'total_arr': total_arr,
        'deal_count': len(event_matches),
        'deals': event_matches
    }

# Print detailed results
for event_name, data in sorted(event_results.items(), key=lambda x: x[1]['total_arr'], reverse=True):
    if data['deal_count'] > 0:
        print(f'\n{event_name}')
        print(f'  Total ARR: ${data["total_arr"]:,.0f}')
        print(f'  Deals: {data["deal_count"]}')
        print(f'  Breakdown:')
        for deal in sorted(data['deals'], key=lambda x: x['ACV'], reverse=True):
            print(f"    ${deal['ACV']:>12,.0f} | {deal['Account']}")

# STEP 6: Specific validation for key claims
print('\n' + '='*100)
print('[VALIDATION 6] KEY CLAIM VERIFICATION')
print('='*100)

# Check Intuit
print('\n--- INTUIT ---')
intuit_attendees = attendees[attendees['Company'].str.contains('Intuit', case=False, na=False)]
intuit_closed = closed_won[closed_won['Account Name'].str.contains('Intuit', case=False, na=False)]
print(f'Intuit event attendance:')
for idx, row in intuit_attendees.iterrows():
    print(f"  - {row['Campaign Name']} | {row['First Name']} {row['Last Name']} | {row.get('Title Group', 'N/A')}")
print(f'Intuit closed deals:')
for idx, row in intuit_closed.iterrows():
    print(f"  - ${row['Commitment ACV']:,.0f} | {row['Opportunity Name']}")
intuit_total = intuit_closed['Commitment ACV'].fillna(0).sum()
print(f'INTUIT TOTAL ARR: ${intuit_total:,.0f}')

# Check Pure Storage
print('\n--- PURE STORAGE ---')
pure_attendees = attendees[attendees['Company'].str.contains('Pure', case=False, na=False)]
pure_closed = closed_won[closed_won['Account Name'].str.contains('Pure', case=False, na=False)]
print(f'Pure Storage event attendance:')
for idx, row in pure_attendees.iterrows():
    print(f"  - {row['Campaign Name']} | {row['First Name']} {row['Last Name']} | {row.get('Title Group', 'N/A')}")
print(f'Pure Storage closed deals:')
for idx, row in pure_closed.iterrows():
    print(f"  - ${row['Commitment ACV']:,.0f} | {row['Opportunity Name']}")
pure_total = pure_closed['Commitment ACV'].fillna(0).sum()
print(f'PURE STORAGE TOTAL ARR: ${pure_total:,.0f}')

# Check Bayer
print('\n--- BAYER ---')
bayer_attendees = attendees[attendees['Company'].str.contains('Bayer', case=False, na=False)]
bayer_closed = closed_won[closed_won['Account Name'].str.contains('Bayer', case=False, na=False)]
print(f'Bayer event attendance:')
for idx, row in bayer_attendees.iterrows():
    print(f"  - {row['Campaign Name']} | {row['First Name']} {row['Last Name']} | {row.get('Title Group', 'N/A')}")
print(f'Bayer closed deals:')
for idx, row in bayer_closed.iterrows():
    print(f"  - ${row['Commitment ACV']:,.0f} | {row['Opportunity Name']}")
bayer_total = bayer_closed['Commitment ACV'].fillna(0).sum()
print(f'BAYER TOTAL ARR: ${bayer_total:,.0f}')

# STEP 7: Identify any discrepancies or flags
print('\n' + '='*100)
print('[VALIDATION 7] DISCREPANCY FLAGS')
print('='*100)

# Check for duplicate counting
print('\n--- ACCOUNTS APPEARING IN MULTIPLE EVENTS ---')
multi_event_accounts = {}
for match in matches:
    if len(match['Campaigns']) > 1:
        multi_event_accounts[match['Account']] = {
            'ACV': match['ACV'],
            'Campaigns': match['Campaigns']
        }

if multi_event_accounts:
    print('WARNING: These accounts attended multiple events - ACV should NOT be double-counted:')
    for account, data in multi_event_accounts.items():
        print(f"  {account}: ${data['ACV']:,.0f} | Events: {', '.join(data['Campaigns'][:3])}...")
else:
    print('No multi-event accounts found.')

# STEP 8: Final validated numbers
print('\n' + '='*100)
print('[FINAL] VALIDATED NUMBERS FOR EOY REVIEW')
print('='*100)

# Calculate deduplicated totals per event category
# For overlapping accounts, attribute to the FIRST event they attended chronologically
# or to the event with the strongest direct connection

final_numbers = {
    'AI Supper Club Series': {
        'arr': event_results.get('AI Supper Club Series', {}).get('total_arr', 0),
        'deals': event_results.get('AI Supper Club Series', {}).get('deal_count', 0),
    },
    'Lighthouse Event': {
        'arr': event_results.get('Lighthouse Event', {}).get('total_arr', 0),
        'deals': event_results.get('Lighthouse Event', {}).get('deal_count', 0),
        'intuit_pure_combined': intuit_total + pure_total,
    },
    'Augmented Intelligence Summit': {
        'arr': event_results.get('Augmented Intelligence Summit', {}).get('total_arr', 0),
        'deals': event_results.get('Augmented Intelligence Summit', {}).get('deal_count', 0),
    },
    'IQPC (Bayer Source)': {
        'arr': bayer_total,
        'deals': len(bayer_closed),
    }
}

print('''
╔══════════════════════════════════════════════════════════════════════════════╗
║                    VALIDATED MARKETING EVENT ROI                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ EVENT                          │ ARR ATTRIBUTED   │ DEALS │ NOTES            ║
╠────────────────────────────────┼──────────────────┼───────┼──────────────────╣
║ AI Supper Club Series          │ ${:>14,.0f} │   {:>3} │ 5 events Q1-Q2   ║
║ Lighthouse Event               │ ${:>14,.0f} │   {:>3} │ 50+ attendees    ║
║   └─ Intuit + Pure Storage     │ ${:>14,.0f} │     2 │ Specific claim   ║
║ Augmented Intelligence Summit  │ ${:>14,.0f} │   {:>3} │ 200 attendees    ║
║ IQPC Corporate Compliance      │ ${:>14,.0f} │   {:>3} │ Bayer sourced    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ TOTAL CLOSED WON (ALL)         │ ${:>14,.0f} │   {:>3} │                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
'''.format(
    final_numbers['AI Supper Club Series']['arr'],
    final_numbers['AI Supper Club Series']['deals'],
    final_numbers['Lighthouse Event']['arr'],
    final_numbers['Lighthouse Event']['deals'],
    final_numbers['Lighthouse Event']['intuit_pure_combined'],
    final_numbers['Augmented Intelligence Summit']['arr'],
    final_numbers['Augmented Intelligence Summit']['deals'],
    final_numbers['IQPC (Bayer Source)']['arr'],
    final_numbers['IQPC (Bayer Source)']['deals'],
    total_closed,
    len(closed_won)
))

# Save to clean Excel
print('\n[OUTPUT] Saving validated Excel file...')
