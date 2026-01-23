"""
Template-Aligned Output
=======================
Creates an Excel file that directly matches your template format:
- Days Between Sub-stages by Account
- Averages that align with your stage progression view
"""

import pandas as pd
import numpy as np

print("="*70)
print("TEMPLATE-ALIGNED OUTPUT")
print("="*70)

xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_opp = pd.read_excel(xl, sheet_name='all opp history')
df_meetings = pd.read_excel(xl, sheet_name='all meetings')

# Clean dates
df_opp['Last Stage Change Date'] = pd.to_datetime(df_opp['Last Stage Change Date'])
df_opp['Created Date'] = pd.to_datetime(df_opp['Created Date'])
df_meetings['Date'] = pd.to_datetime(df_meetings['Date'])

# Exclude invalid dates
df_meetings = df_meetings[df_meetings['Date'] >= '2020-01-01']

# Your target accounts from the template
target_accounts = ['Ecolab', 'Bayer', 'BNY Mellon', 'Pure Storage', 'Amazon', 'ServiceNow', 'Petsmart']

# For each target account, build the detailed metrics
print("\nBuilding metrics for target accounts...")

results = []

for acct_name in target_accounts:
    # Find meetings for this account
    acct_meetings = df_meetings[df_meetings['Company / Account'].str.contains(acct_name.split()[0], case=False, na=False)]
    acct_meetings = acct_meetings.drop_duplicates(subset=['Date', 'Subject']).sort_values('Date')
    
    # Find opp history for this account
    acct_opp = df_opp[df_opp['Account Name'].str.contains(acct_name.split()[0], case=False, na=False)]
    acct_opp = acct_opp.drop_duplicates(subset=['Opportunity ID', 'From Stage', 'To Stage', 'Last Stage Change Date'])
    acct_opp = acct_opp.sort_values('Last Stage Change Date')
    
    record = {'Account': acct_name}
    
    # Total meetings
    total_meetings = len(acct_meetings)
    record['Number of Meetings'] = total_meetings
    
    if total_meetings == 0:
        results.append(record)
        continue
    
    # Meeting-based metrics (chronological)
    first_meeting = acct_meetings['Date'].min()
    record['First Meeting Date'] = first_meeting
    
    # Days between consecutive meetings
    if total_meetings >= 2:
        mtg_dates = acct_meetings['Date'].tolist()
        record['Meeting 1→2 (days)'] = (mtg_dates[1] - mtg_dates[0]).days
    if total_meetings >= 3:
        record['Meeting 2→3 (days)'] = (mtg_dates[2] - mtg_dates[1]).days
    if total_meetings >= 4:
        record['Meeting 3→4 (days)'] = (mtg_dates[3] - mtg_dates[2]).days
    
    # Stage dates from opp history
    stage_dates = {}
    for _, row in acct_opp.iterrows():
        to_stage = row['To Stage']
        change_date = row['Last Stage Change Date']
        if pd.notna(change_date) and to_stage not in stage_dates:
            stage_dates[to_stage] = change_date
    
    # Calculate stage durations
    created = acct_opp['Created Date'].min() if len(acct_opp) > 0 else None
    
    # Stage 0→1 (Prospecting to Discovery)
    discovery_date = stage_dates.get('Stage 1 - Discovery')
    sqo_date = stage_dates.get('Stage 2 - SQO')
    proposal_date = stage_dates.get('Stage 4 - Proposal')
    won_date = stage_dates.get('Stage 6. Closed(Won)')
    
    if pd.notna(discovery_date) and pd.notna(created):
        record['Email to First Meeting (Stage 0)'] = (discovery_date - pd.to_datetime(created)).days
    
    # Stage 1 (Discovery) metrics
    if pd.notna(sqo_date) and pd.notna(discovery_date):
        days = (sqo_date - discovery_date).days
        record['Discovery to SQO (Stage 1→2)'] = days if days > 0 else 'same day'
    
    # Stage 2 (SQO) metrics  
    if pd.notna(proposal_date) and pd.notna(sqo_date):
        days = (proposal_date - sqo_date).days
        record['SQO to Proposal (Stage 2→4)'] = days if days > 0 else 'same day'
    
    # Stage 4 (Proposal to Won)
    if pd.notna(won_date) and pd.notna(proposal_date):
        days = (won_date - proposal_date).days
        record['Proposal to Won (Stage 4→Won)'] = days if days > 0 else 'same day'
    
    # First meeting to SQO
    if pd.notna(sqo_date) and pd.notna(first_meeting):
        record['First Meeting → SQO (days)'] = (sqo_date - first_meeting).days
    
    # SQO to Close
    if pd.notna(won_date) and pd.notna(sqo_date):
        record['SQO → Close (days)'] = (won_date - sqo_date).days
    
    # Count meetings to SQO
    if pd.notna(sqo_date):
        meetings_before_sqo = len(acct_meetings[acct_meetings['Date'] <= sqo_date])
        record['Meetings to SQO'] = meetings_before_sqo
    
    results.append(record)

results_df = pd.DataFrame(results)

# Print results
print("\n" + "="*70)
print("RESULTS BY ACCOUNT (matching your template)")
print("="*70)

for _, row in results_df.iterrows():
    print(f"\n{row['Account']}:")
    for col in results_df.columns:
        if col != 'Account' and pd.notna(row.get(col)):
            print(f"  {col}: {row[col]}")

# Now create the AVERAGES that match your existing stage benchmark
print("\n" + "="*70)
print("AVERAGES (for your summary section)")
print("="*70)

# Get all opportunities with stage data for broader averages
all_opps = df_opp.drop_duplicates(subset=['Opportunity ID', 'From Stage', 'To Stage', 'Last Stage Change Date'])

# Calculate stage durations for ALL opportunities (not just target accounts)
stage_durations = {
    'Stage 0→1': [],
    'Stage 1→2': [],
    'Stage 2→4': [],
    'Stage 4→Won': [],
}

for opp_id in all_opps['Opportunity ID'].unique():
    opp_data = all_opps[all_opps['Opportunity ID'] == opp_id].sort_values('Last Stage Change Date')
    
    stage_dates = {}
    for _, row in opp_data.iterrows():
        to_stage = row['To Stage']
        change_date = row['Last Stage Change Date']
        if pd.notna(change_date) and to_stage not in stage_dates:
            stage_dates[to_stage] = change_date
    
    created = opp_data['Created Date'].iloc[0] if len(opp_data) > 0 else None
    
    # Stage 0→1
    discovery = stage_dates.get('Stage 1 - Discovery')
    if pd.notna(discovery) and pd.notna(created):
        days = (discovery - pd.to_datetime(created)).days
        if days > 0:
            stage_durations['Stage 0→1'].append(days)
    
    # Stage 1→2
    sqo = stage_dates.get('Stage 2 - SQO')
    if pd.notna(sqo) and pd.notna(discovery):
        days = (sqo - discovery).days
        if days > 0:
            stage_durations['Stage 1→2'].append(days)
    
    # Stage 2→4
    proposal = stage_dates.get('Stage 4 - Proposal')
    if pd.notna(proposal) and pd.notna(sqo):
        days = (proposal - sqo).days
        if days > 0:
            stage_durations['Stage 2→4'].append(days)
    
    # Stage 4→Won
    won = stage_dates.get('Stage 6. Closed(Won)')
    if pd.notna(won) and pd.notna(proposal):
        days = (won - proposal).days
        if days > 0:
            stage_durations['Stage 4→Won'].append(days)

averages = []
for stage, durations in stage_durations.items():
    if len(durations) > 0:
        averages.append({
            'Stage Transition': stage,
            'Sample Size': len(durations),
            'Mean (days)': round(np.mean(durations), 1),
            'Median (days)': round(np.median(durations), 1),
            'Min': min(durations),
            'Max': max(durations),
        })
        print(f"{stage}: n={len(durations)}, Mean={np.mean(durations):.1f}, Median={np.median(durations):.1f}, Range={min(durations)}-{max(durations)}")

avg_df = pd.DataFrame(averages)

# Output
output_path = '/Users/keiganpesenti/Desktop/template_aligned_analysis.xlsx'
print(f"\n\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # Tab 1: Target accounts matching your template format
    results_df.to_excel(writer, sheet_name='1_Target_Accounts', index=False)
    
    # Tab 2: Stage duration averages
    avg_df.to_excel(writer, sheet_name='2_Stage_Averages', index=False)
    
    # Tab 3: Raw meeting data for target accounts
    target_meetings = df_meetings[
        df_meetings['Company / Account'].str.contains('|'.join([a.split()[0] for a in target_accounts]), 
                                                       case=False, na=False, regex=True)
    ].drop_duplicates(subset=['Date', 'Subject', 'Company / Account']).sort_values(['Company / Account', 'Date'])
    target_meetings.to_excel(writer, sheet_name='3_Target_Account_Meetings', index=False)

print("\nDone!")
print(f"\nFile saved: {output_path}")
print("\nTabs:")
print("  1_Target_Accounts - Ecolab, Bayer, BNY, etc. with all metrics")
print("  2_Stage_Averages - Overall averages by stage transition")
print("  3_Target_Account_Meetings - Raw meetings for verification")

