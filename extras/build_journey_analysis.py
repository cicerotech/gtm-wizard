"""
Sales Journey Analysis - Chronological Per-Account View
========================================================
For each account, track:
1. Meeting 1, Meeting 2, Meeting 3, etc. (in chronological order)
2. Days between each consecutive meeting
3. Which meeting was the CAB discussion, Demo, Proposal, etc.
4. Total journey metrics

This aligns with:
- Stage 0: Prospecting (before first meeting)
- Stage 1: Discovery (early meetings, CAB)
- Stage 2: SQO (Demo, Products overview, Scoping)
- Stage 3: Pilot (if applicable)
- Stage 4: Proposal
- Closed Won
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*70)
print("SALES JOURNEY ANALYSIS - CHRONOLOGICAL VIEW")
print("="*70)

# Load data
xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_main = pd.read_excel(xl, sheet_name='Sheet1')
df_other = pd.read_excel(xl, sheet_name='other account meetings')

df_all = pd.concat([df_main, df_other], ignore_index=True)
df_all['Date'] = pd.to_datetime(df_all['Date'])

# Exclude invalid dates
df_all = df_all[df_all['Date'] >= '2020-01-01']

# Dedup
df_all = df_all.drop_duplicates(subset=['Activity ID'])
df_all['Subject_Clean'] = df_all['Subject'].fillna('').str.lower().str.strip()
df_all['Dedup_Key'] = df_all['Company / Account'].astype(str) + '|' + df_all['Date'].astype(str) + '|' + df_all['Subject_Clean']
df_all = df_all.drop_duplicates(subset=['Dedup_Key'], keep='first').copy()

# Exclude test accounts
test_accounts = ['Event Triage', 'Johnson Hana', 'JHI', 'Eudia', 'Eudia AI', 'Test Account']
df_clean = df_all[~df_all['Company / Account'].str.lower().isin([a.lower() for a in test_accounts])].copy()

print(f"Clean data: {len(df_clean)} meetings, {df_clean['Company / Account'].nunique()} accounts")

# Classify meeting TYPES (for milestone identification)
def get_meeting_type(subject):
    s = str(subject).lower()
    if 'cab' in s:
        return 'CAB'
    elif 'intro' in s or 'introduction' in s:
        return 'Intro'
    elif 'use case' in s:
        return 'Use Case'
    elif 'product' in s and ('demo' in s or 'overview' in s):
        return 'Product Demo'
    elif 'scoping' in s or 'scope' in s:
        return 'Scoping'
    elif 'proposal' in s:
        return 'Proposal'
    elif 'pilot' in s or 'kickoff' in s:
        return 'Pilot'
    elif 'follow' in s:
        return 'Follow-up'
    elif 'demo' in s or 'walkthrough' in s:
        return 'Demo'
    elif 'compliance' in s:
        return 'Compliance'
    elif 'security' in s or 'infosec' in s:
        return 'Security'
    else:
        return 'Meeting'

df_clean['Meeting_Type'] = df_clean['Subject'].apply(get_meeting_type)

# Sort by account and date
df_clean = df_clean.sort_values(['Company / Account', 'Date'])

# For each account, create the chronological journey
print("\nBuilding chronological journeys per account...")

journeys = []

for acct in df_clean['Company / Account'].unique():
    acct_df = df_clean[df_clean['Company / Account'] == acct].sort_values('Date').reset_index(drop=True)
    
    if len(acct_df) == 0:
        continue
    
    first_date = acct_df['Date'].iloc[0]
    
    for i, row in acct_df.iterrows():
        meeting_num = i + 1  # 1st, 2nd, 3rd, etc.
        
        # Days from previous meeting
        if i == 0:
            days_from_prev = 0
        else:
            days_from_prev = (row['Date'] - acct_df['Date'].iloc[i-1]).days
        
        # Days from first meeting
        days_from_first = (row['Date'] - first_date).days
        
        journeys.append({
            'Account': acct,
            'Meeting #': meeting_num,
            'Date': row['Date'],
            'Subject': row['Subject'],
            'Meeting Type': row['Meeting_Type'],
            'Days From Previous': days_from_prev,
            'Days From First': days_from_first,
            'Contact': row['Contact'],
            'Assigned': row['Assigned'],
        })

journey_df = pd.DataFrame(journeys)

# Create account-level summary
print("Building account summaries...")

account_metrics = []

for acct in df_clean['Company / Account'].unique():
    acct_journey = journey_df[journey_df['Account'] == acct].sort_values('Meeting #')
    
    if len(acct_journey) == 0:
        continue
    
    total_meetings = len(acct_journey)
    first_date = acct_journey['Date'].min()
    last_date = acct_journey['Date'].max()
    total_days = (last_date - first_date).days
    
    # Find key milestones (which meeting # was each type)
    milestone_info = {}
    for mt in ['Intro', 'CAB', 'Demo', 'Product Demo', 'Scoping', 'Proposal', 'Pilot', 'Use Case']:
        mt_rows = acct_journey[acct_journey['Meeting Type'] == mt]
        if len(mt_rows) > 0:
            first_occurrence = mt_rows.iloc[0]
            milestone_info[f'{mt}_Meeting#'] = first_occurrence['Meeting #']
            milestone_info[f'{mt}_Date'] = first_occurrence['Date']
            milestone_info[f'{mt}_Days_From_First'] = first_occurrence['Days From First']
    
    # Calculate days between consecutive meetings
    days_1_to_2 = None
    days_2_to_3 = None
    days_3_to_4 = None
    days_4_to_5 = None
    
    if total_meetings >= 2:
        days_1_to_2 = acct_journey[acct_journey['Meeting #'] == 2]['Days From Previous'].values[0]
    if total_meetings >= 3:
        days_2_to_3 = acct_journey[acct_journey['Meeting #'] == 3]['Days From Previous'].values[0]
    if total_meetings >= 4:
        days_3_to_4 = acct_journey[acct_journey['Meeting #'] == 4]['Days From Previous'].values[0]
    if total_meetings >= 5:
        days_4_to_5 = acct_journey[acct_journey['Meeting #'] == 5]['Days From Previous'].values[0]
    
    record = {
        'Account': acct,
        'Total Meetings': total_meetings,
        'First Meeting': first_date,
        'Last Meeting': last_date,
        'Total Days Engaged': total_days,
        'Meeting 1→2 (days)': days_1_to_2,
        'Meeting 2→3 (days)': days_2_to_3,
        'Meeting 3→4 (days)': days_3_to_4,
        'Meeting 4→5 (days)': days_4_to_5,
    }
    
    # Add milestone info
    record.update(milestone_info)
    
    account_metrics.append(record)

metrics_df = pd.DataFrame(account_metrics)

# Calculate AVERAGES for each metric
print("\nCalculating averages...")

avg_metrics = {
    'Metric': [],
    'Count (accounts with data)': [],
    'Mean (days)': [],
    'Median (days)': [],
    'Min': [],
    'Max': [],
}

for col in ['Meeting 1→2 (days)', 'Meeting 2→3 (days)', 'Meeting 3→4 (days)', 'Meeting 4→5 (days)']:
    valid = metrics_df[col].dropna()
    if len(valid) > 0:
        avg_metrics['Metric'].append(col)
        avg_metrics['Count (accounts with data)'].append(len(valid))
        avg_metrics['Mean (days)'].append(round(valid.mean(), 1))
        avg_metrics['Median (days)'].append(round(valid.median(), 1))
        avg_metrics['Min'].append(int(valid.min()))
        avg_metrics['Max'].append(int(valid.max()))

# Add milestone metrics
for mt in ['Intro', 'CAB', 'Demo', 'Product Demo', 'Scoping', 'Proposal']:
    col = f'{mt}_Days_From_First'
    if col in metrics_df.columns:
        valid = metrics_df[col].dropna()
        # Only include where it's > 0 (not the first meeting)
        valid = valid[valid > 0]
        if len(valid) > 0:
            avg_metrics['Metric'].append(f'First Meeting → {mt}')
            avg_metrics['Count (accounts with data)'].append(len(valid))
            avg_metrics['Mean (days)'].append(round(valid.mean(), 1))
            avg_metrics['Median (days)'].append(round(valid.median(), 1))
            avg_metrics['Min'].append(int(valid.min()))
            avg_metrics['Max'].append(int(valid.max()))

avg_df = pd.DataFrame(avg_metrics)

# OUTPUT
output_path = '/Users/keiganpesenti/Desktop/sales_journey_analysis.xlsx'
print(f"\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # Tab 1: Summary Metrics (the key output)
    avg_df.to_excel(writer, sheet_name='1_Summary_Metrics', index=False)
    
    # Tab 2: Account Metrics (per-account view)
    # Reorder columns for clarity
    col_order = [
        'Account', 'Total Meetings', 'First Meeting', 'Last Meeting', 'Total Days Engaged',
        'Meeting 1→2 (days)', 'Meeting 2→3 (days)', 'Meeting 3→4 (days)', 'Meeting 4→5 (days)',
    ]
    # Add milestone columns that exist
    for mt in ['Intro', 'CAB', 'Demo', 'Product Demo', 'Scoping', 'Proposal', 'Pilot', 'Use Case']:
        for suffix in ['_Meeting#', '_Date', '_Days_From_First']:
            col = f'{mt}{suffix}'
            if col in metrics_df.columns:
                col_order.append(col)
    
    cols_present = [c for c in col_order if c in metrics_df.columns]
    metrics_df[cols_present].to_excel(writer, sheet_name='2_Account_Metrics', index=False)
    
    # Tab 3: Full Journey Detail (every meeting in sequence)
    journey_df.to_excel(writer, sheet_name='3_Journey_Detail', index=False)
    
    # Tab 4: Accounts with 3+ meetings (for reliable analysis)
    multi_meeting = metrics_df[metrics_df['Total Meetings'] >= 3][cols_present]
    multi_meeting.to_excel(writer, sheet_name='4_Accounts_3+_Meetings', index=False)
    
    # Tab 5: Sample Deep Dives (top 10 accounts by meeting count)
    top_accounts = metrics_df.nlargest(10, 'Total Meetings')['Account'].tolist()
    sample_journeys = journey_df[journey_df['Account'].isin(top_accounts)]
    sample_journeys.to_excel(writer, sheet_name='5_Sample_Deep_Dives', index=False)

print("\n" + "="*70)
print("SUMMARY METRICS")
print("="*70)

print("\n--- Days Between Consecutive Meetings ---")
for _, row in avg_df[avg_df['Metric'].str.contains('Meeting')].iterrows():
    print(f"{row['Metric']:25} | n={row['Count (accounts with data)']:3} | Median: {row['Median (days)']:5.0f} days | Range: {row['Min']}-{row['Max']}")

print("\n--- Days from First Meeting to Key Milestones ---")
for _, row in avg_df[avg_df['Metric'].str.contains('→')].iterrows():
    print(f"{row['Metric']:30} | n={row['Count (accounts with data)']:3} | Median: {row['Median (days)']:5.0f} days | Range: {row['Min']}-{row['Max']}")

print(f"\n\nFile saved: {output_path}")
print("\nTabs:")
print("  1_Summary_Metrics - Key averages to plug into your template")
print("  2_Account_Metrics - Per-account: meetings 1→2, 2→3, etc. + milestone dates")
print("  3_Journey_Detail - Every single meeting in sequence (for verification)")
print("  4_Accounts_3+_Meetings - Only accounts with 3+ meetings (more reliable)")
print("  5_Sample_Deep_Dives - Top 10 accounts by engagement (spot check)")

# Also show the top accounts for reference
print("\n\n--- Top 10 Accounts by Meeting Count ---")
top10 = metrics_df.nlargest(10, 'Total Meetings')[['Account', 'Total Meetings', 'Total Days Engaged', 'Meeting 1→2 (days)', 'Meeting 2→3 (days)']]
print(top10.to_string(index=False))

