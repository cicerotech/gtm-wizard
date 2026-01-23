"""
Final Stage Analysis - Using Opportunity History Correctly
==========================================================
The opp history shows:
- Last Stage Change Date = when they moved TO "To Stage"
- Days in Stage = how long in that stage
- To calculate stage durations, we look at consecutive stage changes
"""

import pandas as pd
import numpy as np

print("="*70)
print("FINAL STAGE DURATION ANALYSIS")
print("="*70)

xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_opp = pd.read_excel(xl, sheet_name='all opp history')
df_meetings = pd.read_excel(xl, sheet_name='all meetings')

df_opp['Last Stage Change Date'] = pd.to_datetime(df_opp['Last Stage Change Date'])
df_opp['Created Date'] = pd.to_datetime(df_opp['Created Date'])
df_meetings['Date'] = pd.to_datetime(df_meetings['Date'])

# Dedup
df_opp_dedup = df_opp.drop_duplicates(subset=['Opportunity ID', 'From Stage', 'To Stage', 'Last Stage Change Date'])

# Focus on closed won accounts for complete journeys
closed_won = df_opp_dedup[df_opp_dedup['To Stage'].str.contains('Won', case=False, na=False)]
won_accounts = closed_won['Account Name'].unique()
print(f"\nClosed Won Accounts: {len(won_accounts)}")
print(list(won_accounts)[:15])

# For each won opportunity, build the complete stage journey
print("\n" + "="*70)
print("STAGE JOURNEY FOR CLOSED WON ACCOUNTS")
print("="*70)

won_journeys = []

for acct in won_accounts:
    acct_opps = df_opp_dedup[df_opp_dedup['Account Name'] == acct]
    
    # Get the won opportunity
    won_opp = acct_opps[acct_opps['To Stage'].str.contains('Won', case=False, na=False)]
    if len(won_opp) == 0:
        continue
    
    opp_id = won_opp['Opportunity ID'].iloc[0]
    opp_name = won_opp['Opportunity Name'].iloc[0]
    created = won_opp['Created Date'].iloc[0]
    
    # Get all stage changes for this opportunity
    opp_history = df_opp_dedup[df_opp_dedup['Opportunity ID'] == opp_id].sort_values('Last Stage Change Date')
    
    # Build stage dates
    stage_dates = {}
    for _, row in opp_history.iterrows():
        to_stage = row['To Stage']
        change_date = row['Last Stage Change Date']
        if pd.notna(change_date):
            if to_stage not in stage_dates:
                stage_dates[to_stage] = change_date
    
    # Get meetings for this account
    acct_meetings = df_meetings[df_meetings['Company / Account'].str.lower() == acct.lower()]
    acct_meetings_dedup = acct_meetings.drop_duplicates(subset=['Date', 'Subject'])
    
    # First meeting date
    first_meeting = acct_meetings_dedup['Date'].min() if len(acct_meetings_dedup) > 0 else None
    
    record = {
        'Account': acct,
        'Opportunity': opp_name,
        'Created Date': created,
        'First Meeting Date': first_meeting,
        'Total Meetings': len(acct_meetings_dedup),
    }
    
    # Add stage dates
    for stage in ['Stage 0 - Prospecting', 'Stage 0 - Qualifying', 'Stage 1 - Discovery', 
                  'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 6. Closed(Won)']:
        record[f'{stage} Date'] = stage_dates.get(stage)
    
    # Calculate stage durations
    # Stage 0→1: Discovery date - Prospecting/Qualifying date OR Created date
    discovery_date = stage_dates.get('Stage 1 - Discovery')
    prospecting_date = stage_dates.get('Stage 0 - Prospecting') or stage_dates.get('Stage 0 - Qualifying') or created
    if pd.notna(discovery_date) and pd.notna(prospecting_date):
        record['Stage 0→1 (days)'] = (discovery_date - prospecting_date).days
    else:
        record['Stage 0→1 (days)'] = None
    
    # Stage 1→2: SQO date - Discovery date
    sqo_date = stage_dates.get('Stage 2 - SQO')
    if pd.notna(sqo_date) and pd.notna(discovery_date):
        record['Stage 1→2 (days)'] = (sqo_date - discovery_date).days
    else:
        record['Stage 1→2 (days)'] = None
    
    # Stage 2→4: Proposal date - SQO date (skip pilot)
    proposal_date = stage_dates.get('Stage 4 - Proposal')
    if pd.notna(proposal_date) and pd.notna(sqo_date):
        record['Stage 2→4 (days)'] = (proposal_date - sqo_date).days
    else:
        record['Stage 2→4 (days)'] = None
    
    # Stage 4→Won: Won date - Proposal date
    won_date = stage_dates.get('Stage 6. Closed(Won)')
    if pd.notna(won_date) and pd.notna(proposal_date):
        record['Stage 4→Won (days)'] = (won_date - proposal_date).days
    else:
        record['Stage 4→Won (days)'] = None
    
    # Total: Won - Created
    if pd.notna(won_date) and pd.notna(created):
        record['Total (days)'] = (won_date - created).days
    else:
        record['Total (days)'] = None
    
    # First meeting to SQO
    if pd.notna(sqo_date) and pd.notna(first_meeting):
        record['First Meeting → SQO (days)'] = (sqo_date - first_meeting).days
    else:
        record['First Meeting → SQO (days)'] = None
    
    # SQO to Close
    if pd.notna(won_date) and pd.notna(sqo_date):
        record['SQO → Close (days)'] = (won_date - sqo_date).days
    else:
        record['SQO → Close (days)'] = None
    
    won_journeys.append(record)

won_df = pd.DataFrame(won_journeys)

# Print each account
for _, row in won_df.iterrows():
    print(f"\n{row['Account']}:")
    print(f"  Stage 0→1 (Discovery): {row['Stage 0→1 (days)']} days" if pd.notna(row['Stage 0→1 (days)']) else "  Stage 0→1: N/A")
    print(f"  Stage 1→2 (SQO): {row['Stage 1→2 (days)']} days" if pd.notna(row['Stage 1→2 (days)']) else "  Stage 1→2: N/A")
    print(f"  Stage 2→4 (Proposal): {row['Stage 2→4 (days)']} days" if pd.notna(row['Stage 2→4 (days)']) else "  Stage 2→4: N/A")
    print(f"  Stage 4→Won: {row['Stage 4→Won (days)']} days" if pd.notna(row['Stage 4→Won (days)']) else "  Stage 4→Won: N/A")
    print(f"  Total: {row['Total (days)']} days | Meetings: {row['Total Meetings']}")

# Calculate averages
print("\n" + "="*70)
print("SUMMARY STATISTICS (Closed Won Accounts)")
print("="*70)

summary = []
for col in ['Stage 0→1 (days)', 'Stage 1→2 (days)', 'Stage 2→4 (days)', 'Stage 4→Won (days)', 
            'Total (days)', 'First Meeting → SQO (days)', 'SQO → Close (days)']:
    valid = won_df[col].dropna()
    valid = valid[valid >= 0]  # Remove negative values
    if len(valid) > 0:
        summary.append({
            'Metric': col.replace(' (days)', ''),
            'Count': len(valid),
            'Mean': round(valid.mean(), 1),
            'Median': round(valid.median(), 1),
            'Min': int(valid.min()),
            'Max': int(valid.max()),
        })
        print(f"{col:30} | n={len(valid):2} | Mean: {valid.mean():6.1f} | Median: {valid.median():6.1f} | Range: {valid.min():.0f}-{valid.max():.0f}")

summary_df = pd.DataFrame(summary)

# Also get the specific target accounts from your template
print("\n" + "="*70)
print("YOUR TEMPLATE ACCOUNTS")
print("="*70)

target_accounts = ['Ecolab', 'Bayer', 'BNY Mellon', 'Pure Storage', 'Amazon', 'ServiceNow', 'Petsmart']

template_data = []
for acct in target_accounts:
    row = won_df[won_df['Account'].str.contains(acct.split()[0], case=False, na=False)]
    if len(row) > 0:
        r = row.iloc[0]
        template_data.append({
            'Account': acct,
            'Stage 0→1': r['Stage 0→1 (days)'],
            'Stage 1→2': r['Stage 1→2 (days)'],
            'Stage 2→4': r['Stage 2→4 (days)'],
            'Stage 4→Won': r['Stage 4→Won (days)'],
            'SQO → Close': r['SQO → Close (days)'],
            'Total Days': r['Total (days)'],
            'Meetings': r['Total Meetings'],
        })
        print(f"{acct}: 0→1={r['Stage 0→1 (days)']}, 1→2={r['Stage 1→2 (days)']}, 2→4={r['Stage 2→4 (days)']}, 4→Won={r['Stage 4→Won (days)']}")
    else:
        print(f"{acct}: Not in Closed Won")
        template_data.append({
            'Account': acct,
            'Stage 0→1': None, 'Stage 1→2': None, 'Stage 2→4': None, 
            'Stage 4→Won': None, 'SQO → Close': None, 'Total Days': None, 'Meetings': None,
        })

template_df = pd.DataFrame(template_data)

# Output
output_path = '/Users/keiganpesenti/Desktop/stage_duration_analysis.xlsx'
print(f"\n\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    summary_df.to_excel(writer, sheet_name='1_Summary_Averages', index=False)
    template_df.to_excel(writer, sheet_name='2_Template_Accounts', index=False)
    won_df.to_excel(writer, sheet_name='3_All_Won_Accounts', index=False)
    
print("\nDone!")

