import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Load data
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
attendees = pd.read_excel(xlsx, sheet_name='all campaign attendees')
closed_won = pd.read_excel(xlsx, sheet_name='closed won since sept.')

print('='*100)
print('FINAL RE-VALIDATION: COMMITMENT vs ACTUAL REVENUE')
print('='*100)

# Categorize by Deal Type from the actual column
print('\n[DATA STRUCTURE]')
print(f"Deal Type column values: {closed_won['Deal Type'].unique().tolist()}")

# Summary by Deal Type
print('\n[SUMMARY BY DEAL TYPE]')
print('-'*80)
for dt in ['Commitment', 'Recurring', 'Project']:
    subset = closed_won[closed_won['Deal Type'] == dt]
    total = subset['Commitment ACV'].fillna(0).sum()
    rev = subset['Revenue'].fillna(0).sum()
    print(f'{dt:12}: {len(subset):>3} deals | Commitment ACV: ${total:>12,.0f} | Revenue: ${rev:>12,.0f}')

# Event mapping
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
}

# Build company-to-campaign mapping
def clean_company(name):
    if pd.isna(name):
        return ''
    return str(name).strip().lower()

company_campaigns = {}
for idx, row in attendees.iterrows():
    company = clean_company(row['Company'])
    campaign = row['Campaign Name']
    if company:
        if company not in company_campaigns:
            company_campaigns[company] = set()
        company_campaigns[company].add(campaign)

# Match closed won to events, now with deal type breakdown
def match_to_events(row):
    account = clean_company(row['Account Name'])
    matched = []
    for company, campaigns in company_campaigns.items():
        if account in company or company in account:
            matched.extend(campaigns)
    return list(set(matched))

closed_won['Matched Events'] = closed_won.apply(match_to_events, axis=1)
closed_won['Has Event Match'] = closed_won['Matched Events'].apply(lambda x: len(x) > 0)

# Now calculate event-specific attribution BY DEAL TYPE
print('\n' + '='*100)
print('EVENT ATTRIBUTION BY DEAL TYPE')
print('='*100)

for event_name, campaigns in EVENT_GROUPS.items():
    print(f'\n\n{"="*80}')
    print(f'{event_name.upper()}')
    print('='*80)
    
    # Filter to deals that match this event's campaigns
    event_deals = closed_won[closed_won['Matched Events'].apply(lambda x: any(c in campaigns for c in x))]
    
    # Deduplicate by account
    seen_accounts = set()
    commitment_total = 0
    commitment_count = 0
    recurring_total = 0
    recurring_count = 0
    project_total = 0
    project_count = 0
    
    commitment_details = []
    recurring_details = []
    project_details = []
    
    for idx, row in event_deals.iterrows():
        account = row['Account Name']
        deal_type = row['Deal Type']
        acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
        
        # Skip if we've already counted this account in this category
        key = f"{account}_{deal_type}"
        if key in seen_accounts:
            continue
        seen_accounts.add(key)
        
        if deal_type == 'Commitment':
            commitment_total += acv
            commitment_count += 1
            commitment_details.append((account, acv, row['Opportunity Name']))
        elif deal_type == 'Recurring':
            recurring_total += acv
            recurring_count += 1
            recurring_details.append((account, acv, row['Opportunity Name']))
        elif deal_type == 'Project':
            project_total += acv
            project_count += 1
            project_details.append((account, acv, row['Opportunity Name']))
    
    print(f'\n┌──────────────────────────────────────────────────────────────────┐')
    print(f'│ CATEGORY           │ DEALS │ AMOUNT         │ STATUS              │')
    print(f'├────────────────────┼───────┼────────────────┼─────────────────────┤')
    print(f'│ Commitment (LOI)   │   {commitment_count:>3} │ ${commitment_total:>12,.0f} │ Committed, not rev  │')
    print(f'│ Recurring Revenue  │   {recurring_count:>3} │ ${recurring_total:>12,.0f} │ Actual revenue      │')
    print(f'│ Project Revenue    │   {project_count:>3} │ ${project_total:>12,.0f} │ Actual revenue      │')
    print(f'├────────────────────┼───────┼────────────────┼─────────────────────┤')
    print(f'│ TOTAL COMMITMENT   │   {commitment_count:>3} │ ${commitment_total:>12,.0f} │ LOI $               │')
    print(f'│ TOTAL REVENUE      │   {recurring_count + project_count:>3} │ ${recurring_total + project_total:>12,.0f} │ Actual $            │')
    print(f'└──────────────────────────────────────────────────────────────────┘')
    
    if commitment_details:
        print(f'\n  Commitment (LOI) Details:')
        for acc, acv, opp in sorted(commitment_details, key=lambda x: x[1], reverse=True):
            print(f'    ${acv:>12,.0f} | {acc[:30]:<30} | {str(opp)[:35]}')
    
    if recurring_details:
        print(f'\n  Recurring Revenue Details:')
        for acc, acv, opp in sorted(recurring_details, key=lambda x: x[1], reverse=True):
            print(f'    ${acv:>12,.0f} | {acc[:30]:<30} | {str(opp)[:35]}')
    
    if project_details:
        print(f'\n  Project Revenue Details:')
        for acc, acv, opp in sorted(project_details, key=lambda x: x[1], reverse=True):
            print(f'    ${acv:>12,.0f} | {acc[:30]:<30} | {str(opp)[:35]}')

# Special handling for Intuit and Pure Storage
print('\n\n' + '='*100)
print('KEY ACCOUNT VERIFICATION: INTUIT & PURE STORAGE')
print('='*100)

for account_name in ['Intuit', 'Pure Storage', 'Bayer']:
    print(f'\n--- {account_name.upper()} ---')
    account_deals = closed_won[closed_won['Account Name'].str.contains(account_name, case=False, na=False)]
    for idx, row in account_deals.iterrows():
        print(f"  Deal Type: {row['Deal Type']:<12} | ACV: ${row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0:>12,.0f} | {row['Opportunity Name']}")
    
    # Show which events they attended
    account_attendees = attendees[attendees['Company'].str.contains(account_name, case=False, na=False)]
    print(f'  Events attended:')
    for idx, row in account_attendees.iterrows():
        print(f"    - {row['Campaign Name']} | {row['First Name']} {row['Last Name']} ({row.get('Title Group', 'N/A')})")

# Final summary for EOY
print('\n\n' + '='*100)
print('FINAL VALIDATED NUMBERS FOR EOY REVIEW')
print('='*100)

# Calculate totals
commitment_by_event = {}
revenue_by_event = {}

for event_name, campaigns in EVENT_GROUPS.items():
    event_deals = closed_won[closed_won['Matched Events'].apply(lambda x: any(c in campaigns for c in x))]
    
    seen = set()
    c_total = 0
    r_total = 0
    
    for idx, row in event_deals.iterrows():
        key = f"{row['Account Name']}_{row['Deal Type']}"
        if key in seen:
            continue
        seen.add(key)
        acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
        
        if row['Deal Type'] == 'Commitment':
            c_total += acv
        else:
            r_total += acv
    
    commitment_by_event[event_name] = c_total
    revenue_by_event[event_name] = r_total

print('''
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                           VALIDATED EOY MARKETING DATA                                    ║
╠═══════════════════════════════════════════════════════════════════════════════════════════╣
║ EVENT                          │ COMMITMENT (LOI) │ ACTUAL REVENUE │ TOTAL ATTRIBUTED     ║
╠────────────────────────────────┼──────────────────┼────────────────┼──────────────────────╣''')

for event_name in EVENT_GROUPS.keys():
    c = commitment_by_event[event_name]
    r = revenue_by_event[event_name]
    t = c + r
    print(f'║ {event_name:<30} │ ${c:>14,.0f} │ ${r:>12,.0f} │ ${t:>18,.0f} ║')

# Add Intuit + Pure Storage line
intuit_pure = closed_won[closed_won['Account Name'].str.contains('Intuit|Pure', case=False, na=False)]
ip_commitment = intuit_pure[intuit_pure['Deal Type'] == 'Commitment']['Commitment ACV'].fillna(0).sum()
ip_revenue = intuit_pure[intuit_pure['Deal Type'] != 'Commitment']['Commitment ACV'].fillna(0).sum()
print(f'╠────────────────────────────────┼──────────────────┼────────────────┼──────────────────────╣')
print(f'║   └─ Intuit + Pure Storage     │ ${ip_commitment:>14,.0f} │ ${ip_revenue:>12,.0f} │ ${ip_commitment + ip_revenue:>18,.0f} ║')

print('''╠═══════════════════════════════════════════════════════════════════════════════════════════╣
║ TOTALS (ALL CLOSED WON)        │                  │                │                      ║''')

all_commitment = closed_won[closed_won['Deal Type'] == 'Commitment']['Commitment ACV'].fillna(0).sum()
all_revenue = closed_won[closed_won['Deal Type'] != 'Commitment']['Commitment ACV'].fillna(0).sum()
print(f'║   Commitment (LOI)             │ ${all_commitment:>14,.0f} │                │                      ║')
print(f'║   Recurring + Project          │                  │ ${all_revenue:>12,.0f} │                      ║')
print(f'║   GRAND TOTAL                  │                  │                │ ${all_commitment + all_revenue:>18,.0f} ║')
print('╚═══════════════════════════════════════════════════════════════════════════════════════════╝')

print('''

TERMINOLOGY GUIDE:
─────────────────────────────────────────────────────────────────────────────
• COMMITMENT (LOI): Letters of Intent - committed $ not yet converted to revenue
• RECURRING: Actual recurring revenue (renewals, extensions, subscriptions)  
• PROJECT: One-time project revenue
• REVENUE: Recurring + Project = Actual revenue received/booked
─────────────────────────────────────────────────────────────────────────────
''')
