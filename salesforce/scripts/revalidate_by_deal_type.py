import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Load data
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
attendees = pd.read_excel(xlsx, sheet_name='all campaign attendees')
closed_won = pd.read_excel(xlsx, sheet_name='closed won since sept.')

print('='*100)
print('RE-VALIDATION: ISOLATING DEAL TYPES')
print('='*100)

# First, let's see ALL columns in closed won
print('\n[STEP 1] CLOSED WON DATA STRUCTURE')
print('-'*50)
print(f'Columns: {list(closed_won.columns)}')
print(f'\nFirst 5 rows:')
print(closed_won.head(5).to_string())

# Check the Deal Type column
print('\n\n[STEP 2] DEAL TYPES BREAKDOWN')
print('-'*50)
if 'Deal Type' in closed_won.columns:
    deal_types = closed_won['Deal Type'].value_counts()
    print('Deal Type distribution:')
    for dt, count in deal_types.items():
        print(f'  {dt}: {count} deals')
    
    # Show breakdown by deal type with totals
    print('\n\n[STEP 3] REVENUE BY DEAL TYPE')
    print('-'*50)
    for deal_type in closed_won['Deal Type'].unique():
        subset = closed_won[closed_won['Deal Type'] == deal_type]
        total_acv = subset['Commitment ACV'].fillna(0).sum()
        total_rev = subset['Revenue'].fillna(0).sum() if 'Revenue' in subset.columns else 0
        print(f'\n{deal_type}:')
        print(f'  Count: {len(subset)}')
        print(f'  Commitment ACV: ${total_acv:,.0f}')
        print(f'  Revenue: ${total_rev:,.0f}')
        print(f'  Deals:')
        for idx, row in subset.iterrows():
            acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
            rev = row['Revenue'] if pd.notna(row.get('Revenue')) else 0
            print(f"    - {row['Account Name']}: ACV ${acv:,.0f} | Rev ${rev:,.0f}")

# Check if there are other columns that indicate deal stage
print('\n\n[STEP 4] FULL DATA INSPECTION')
print('-'*50)
print('\nAll unique values in each column:')
for col in closed_won.columns:
    unique_vals = closed_won[col].dropna().unique()
    if len(unique_vals) <= 10:
        print(f'\n{col}: {list(unique_vals)}')
    else:
        print(f'\n{col}: {len(unique_vals)} unique values')

# Now let's isolate Commitment vs Actual Revenue
print('\n\n[STEP 5] ISOLATING COMMITMENT (LOI) vs ACTUAL REVENUE')
print('='*100)

# Check the Opportunity Name for patterns
print('\nOpportunity Name patterns:')
loi_pattern = closed_won['Opportunity Name'].str.contains('LOI', case=False, na=False)
recurring_pattern = closed_won['Opportunity Name'].str.contains('Recurring|Renewal|Extension', case=False, na=False)
contract_pattern = closed_won['Opportunity Name'].str.contains('Contract|Sigma|Insight', case=False, na=False)

print(f'LOI in name: {loi_pattern.sum()} deals')
print(f'Recurring/Renewal/Extension in name: {recurring_pattern.sum()} deals')
print(f'Contracting/Sigma/Insights in name: {contract_pattern.sum()} deals')

# Categorize deals
def categorize_deal(row):
    opp_name = str(row['Opportunity Name']).lower() if pd.notna(row['Opportunity Name']) else ''
    deal_type = str(row.get('Deal Type', '')).lower() if pd.notna(row.get('Deal Type')) else ''
    
    if 'loi' in opp_name:
        return 'Commitment (LOI)'
    elif 'recurring' in opp_name or 'renewal' in opp_name or 'extension' in opp_name:
        return 'Recurring Revenue'
    elif 'expansion' in deal_type:
        return 'Expansion'
    elif 'new business' in deal_type:
        return 'New Business'
    else:
        return 'Other/Project'

closed_won['Revenue Category'] = closed_won.apply(categorize_deal, axis=1)

print('\n\n[STEP 6] CATEGORIZED BREAKDOWN')
print('-'*50)
for cat in closed_won['Revenue Category'].unique():
    subset = closed_won[closed_won['Revenue Category'] == cat]
    total = subset['Commitment ACV'].fillna(0).sum()
    print(f'\n{cat}:')
    print(f'  Deals: {len(subset)}')
    print(f'  Total ACV: ${total:,.0f}')
    for idx, row in subset.sort_values('Commitment ACV', ascending=False).head(10).iterrows():
        acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
        print(f"    ${acv:>12,.0f} | {row['Account Name'][:25]:<25} | {str(row['Opportunity Name'])[:40]}")

# Final summary
print('\n\n' + '='*100)
print('SUMMARY: COMMITMENT (LOI) vs ACTUAL REVENUE')
print('='*100)

loi_deals = closed_won[closed_won['Revenue Category'] == 'Commitment (LOI)']
recurring_deals = closed_won[closed_won['Revenue Category'] == 'Recurring Revenue']
other_deals = closed_won[~closed_won['Revenue Category'].isin(['Commitment (LOI)', 'Recurring Revenue'])]

print(f'''
┌────────────────────────────────────────────────────────────────────────────┐
│ CATEGORY              │ DEALS │ TOTAL ACV        │ NOTES                   │
├───────────────────────┼───────┼──────────────────┼─────────────────────────┤
│ Commitment (LOI)      │   {len(loi_deals):>3} │ ${loi_deals['Commitment ACV'].fillna(0).sum():>14,.0f} │ Not yet revenue         │
│ Recurring Revenue     │   {len(recurring_deals):>3} │ ${recurring_deals['Commitment ACV'].fillna(0).sum():>14,.0f} │ Actual recurring        │
│ Other (New/Expansion) │   {len(other_deals):>3} │ ${other_deals['Commitment ACV'].fillna(0).sum():>14,.0f} │ Projects/New deals      │
├───────────────────────┼───────┼──────────────────┼─────────────────────────┤
│ TOTAL                 │   {len(closed_won):>3} │ ${closed_won['Commitment ACV'].fillna(0).sum():>14,.0f} │                         │
└────────────────────────────────────────────────────────────────────────────┘
''')

# List all LOI deals
print('\n\nALL COMMITMENT (LOI) DEALS:')
print('-'*80)
for idx, row in loi_deals.sort_values('Commitment ACV', ascending=False).iterrows():
    acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
    print(f"  ${acv:>12,.0f} | {row['Account Name']:<25} | {row['Opportunity Name']}")

print('\n\nALL RECURRING REVENUE DEALS:')
print('-'*80)
for idx, row in recurring_deals.sort_values('Commitment ACV', ascending=False).iterrows():
    acv = row['Commitment ACV'] if pd.notna(row['Commitment ACV']) else 0
    print(f"  ${acv:>12,.0f} | {row['Account Name']:<25} | {row['Opportunity Name']}")
