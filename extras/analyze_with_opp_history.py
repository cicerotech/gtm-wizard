"""
Sales Process Analysis - Using Opportunity History + Meetings
==============================================================
This analysis uses:
1. Opportunity History to understand actual stage progression dates
2. Meetings to understand activities within each stage
3. Maps everything to the Eudia sales stages:
   - Stage 0: Prospecting
   - Stage 1: Discovery  
   - Stage 2: SQO
   - Stage 3: Pilot (optional)
   - Stage 4: Proposal
   - Closed Won
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*70)
print("SALES PROCESS ANALYSIS - OPP HISTORY + MEETINGS")
print("="*70)

# Load data
xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_meetings = pd.read_excel(xl, sheet_name='all meetings')
df_opp = pd.read_excel(xl, sheet_name='all opp history')

print(f"\nMeetings: {len(df_meetings)} rows, {df_meetings['Company / Account'].nunique()} accounts")
print(f"Opp History: {len(df_opp)} rows, {df_opp['Account Name'].nunique()} accounts")

# Clean dates
df_meetings['Date'] = pd.to_datetime(df_meetings['Date'])
df_opp['Created Date'] = pd.to_datetime(df_opp['Created Date'])
df_opp['Last Stage Change Date'] = pd.to_datetime(df_opp['Last Stage Change Date'])

# Dedup opp history - get unique stage transitions per opportunity
df_opp_dedup = df_opp.drop_duplicates(subset=['Opportunity ID', 'From Stage', 'To Stage', 'Last Stage Change Date'])
print(f"Opp History (deduped): {len(df_opp_dedup)} stage transitions")

# Define target accounts (from your template)
target_accounts = ['Ecolab', 'Bayer', 'BNY', 'Pure Storage', 'Amazon', 'ServiceNow', 'Petsmart']

# STAGE ORDER for analysis
stage_order = {
    'Stage 0 - Prospecting': 0,
    'Stage 0 - Qualifying': 0.5,
    'Stage 1 - Discovery': 1,
    'Stage 2 - SQO': 2,
    'Stage 3 - Pilot': 3,
    'Stage 4 - Proposal': 4,
    'Stage 5 - Negotiation': 4.5,
    'Stage 6. Closed(Won)': 5,
    'Stage 7. Closed Lost': -1,
    'Closed Lost': -1,
}

# For each opportunity, build the stage timeline
print("\n" + "="*70)
print("BUILDING STAGE TIMELINES FROM OPP HISTORY")
print("="*70)

opp_timelines = []

for opp_id in df_opp_dedup['Opportunity ID'].unique():
    opp_data = df_opp_dedup[df_opp_dedup['Opportunity ID'] == opp_id].copy()
    
    acct = opp_data['Account Name'].iloc[0]
    opp_name = opp_data['Opportunity Name'].iloc[0]
    created = opp_data['Created Date'].iloc[0]
    
    # Get all stage changes sorted by date
    stage_changes = opp_data[opp_data['Last Stage Change Date'].notna()].sort_values('Last Stage Change Date')
    
    record = {
        'Account': acct,
        'Opportunity': opp_name,
        'Opportunity ID': opp_id,
        'Created Date': created,
    }
    
    # Track when each stage was reached
    stages_reached = {}
    
    for _, change in stage_changes.iterrows():
        to_stage = change['To Stage']
        change_date = change['Last Stage Change Date']
        days_in_stage = change['Days in Stage']
        
        if to_stage not in stages_reached:
            stages_reached[to_stage] = {
                'date': change_date,
                'days_in_stage': days_in_stage
            }
    
    # Add to record
    for stage in ['Stage 0 - Prospecting', 'Stage 0 - Qualifying', 'Stage 1 - Discovery', 
                  'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 
                  'Stage 5 - Negotiation', 'Stage 6. Closed(Won)']:
        if stage in stages_reached:
            record[f'{stage} Date'] = stages_reached[stage]['date']
            record[f'{stage} Days'] = stages_reached[stage]['days_in_stage']
        else:
            record[f'{stage} Date'] = None
            record[f'{stage} Days'] = None
    
    opp_timelines.append(record)

timeline_df = pd.DataFrame(opp_timelines)

# Calculate stage-to-stage durations
print("\nCalculating stage durations...")

def calc_days_between(row, from_stage, to_stage):
    from_date = row.get(f'{from_stage} Date')
    to_date = row.get(f'{to_stage} Date')
    
    if pd.notna(from_date) and pd.notna(to_date):
        days = (to_date - from_date).days
        if days >= 0:
            return days
    return None

timeline_df['Stage 0→1 (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 0 - Prospecting', 'Stage 1 - Discovery') or 
              calc_days_between(r, 'Stage 0 - Qualifying', 'Stage 1 - Discovery'), axis=1)

timeline_df['Stage 1→2 (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 1 - Discovery', 'Stage 2 - SQO'), axis=1)

timeline_df['Stage 2→3 (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 2 - SQO', 'Stage 3 - Pilot'), axis=1)

timeline_df['Stage 2→4 (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 2 - SQO', 'Stage 4 - Proposal'), axis=1)

timeline_df['Stage 3→4 (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 3 - Pilot', 'Stage 4 - Proposal'), axis=1)

timeline_df['Stage 4→Won (days)'] = timeline_df.apply(
    lambda r: calc_days_between(r, 'Stage 4 - Proposal', 'Stage 6. Closed(Won)'), axis=1)

# Now add meeting counts per stage for each opportunity
print("Matching meetings to opportunities...")

# For each account, get meetings
meeting_counts = []

for _, opp_row in timeline_df.iterrows():
    acct = opp_row['Account']
    
    # Find meetings for this account
    acct_meetings = df_meetings[df_meetings['Company / Account'].str.contains(acct, case=False, na=False)]
    
    record = {
        'Account': acct,
        'Opportunity': opp_row['Opportunity'],
        'Total Meetings': len(acct_meetings.drop_duplicates(subset=['Date', 'Subject'])),
    }
    
    # Count meetings in each stage window
    for stage, next_stage in [
        ('Stage 0 - Prospecting', 'Stage 1 - Discovery'),
        ('Stage 1 - Discovery', 'Stage 2 - SQO'),
        ('Stage 2 - SQO', 'Stage 3 - Pilot'),
        ('Stage 2 - SQO', 'Stage 4 - Proposal'),
    ]:
        stage_date = opp_row.get(f'{stage} Date')
        next_date = opp_row.get(f'{next_stage} Date')
        
        if pd.notna(stage_date):
            if pd.notna(next_date):
                stage_meetings = acct_meetings[(acct_meetings['Date'] >= stage_date) & 
                                                (acct_meetings['Date'] < next_date)]
            else:
                stage_meetings = acct_meetings[acct_meetings['Date'] >= stage_date]
            
            record[f'{stage} Meetings'] = len(stage_meetings.drop_duplicates(subset=['Date', 'Subject']))
    
    meeting_counts.append(record)

meetings_by_stage = pd.DataFrame(meeting_counts)

# Merge
combined = timeline_df.merge(meetings_by_stage[['Account', 'Opportunity', 'Total Meetings', 
                                                 'Stage 1 - Discovery Meetings', 
                                                 'Stage 2 - SQO Meetings']], 
                              on=['Account', 'Opportunity'], how='left')

# SUMMARY STATISTICS
print("\n" + "="*70)
print("STAGE DURATION SUMMARY (from Opp History)")
print("="*70)

summary_stats = []
for col in ['Stage 0→1 (days)', 'Stage 1→2 (days)', 'Stage 2→3 (days)', 
            'Stage 2→4 (days)', 'Stage 3→4 (days)', 'Stage 4→Won (days)']:
    valid = timeline_df[col].dropna()
    valid = valid[valid > 0]  # Only positive values
    if len(valid) > 0:
        summary_stats.append({
            'Stage Transition': col.replace(' (days)', ''),
            'Count': len(valid),
            'Mean (days)': round(valid.mean(), 1),
            'Median (days)': round(valid.median(), 1),
            'Min': int(valid.min()),
            'Max': int(valid.max()),
        })
        print(f"{col:25} | n={len(valid):3} | Median: {valid.median():5.0f} | Range: {valid.min():.0f}-{valid.max():.0f}")

summary_df = pd.DataFrame(summary_stats)

# FOCUS ON TARGET ACCOUNTS
print("\n" + "="*70)
print("TARGET ACCOUNTS DETAIL")
print("="*70)

target_data = []
for acct in target_accounts:
    # Find in timeline
    acct_timeline = timeline_df[timeline_df['Account'].str.contains(acct, case=False, na=False)]
    
    if len(acct_timeline) > 0:
        row = acct_timeline.iloc[0]
        
        # Get meeting data
        acct_meetings = df_meetings[df_meetings['Company / Account'].str.contains(acct, case=False, na=False)]
        acct_meetings = acct_meetings.drop_duplicates(subset=['Date', 'Subject']).sort_values('Date')
        
        target_data.append({
            'Account': acct,
            'Stage 0→1 (days)': row.get('Stage 0→1 (days)'),
            'Stage 1→2 (days)': row.get('Stage 1→2 (days)'),
            'Stage 2→4 (days)': row.get('Stage 2→4 (days)'),
            'Stage 4→Won (days)': row.get('Stage 4→Won (days)'),
            'Total Meetings': len(acct_meetings),
            'First Meeting': acct_meetings['Date'].min() if len(acct_meetings) > 0 else None,
            'Last Meeting': acct_meetings['Date'].max() if len(acct_meetings) > 0 else None,
        })
        
        print(f"\n{acct}:")
        print(f"  Stage 0→1: {row.get('Stage 0→1 (days)', 'N/A')} days")
        print(f"  Stage 1→2: {row.get('Stage 1→2 (days)', 'N/A')} days")
        print(f"  Stage 2→4: {row.get('Stage 2→4 (days)', 'N/A')} days")
        print(f"  Total Meetings: {len(acct_meetings)}")
    else:
        print(f"\n{acct}: Not found in Opp History")

target_df = pd.DataFrame(target_data)

# OUTPUT
output_path = '/Users/keiganpesenti/Desktop/sales_process_final_analysis.xlsx'
print(f"\n\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # Tab 1: Summary aligned to your template
    summary_df.to_excel(writer, sheet_name='1_Stage_Duration_Summary', index=False)
    
    # Tab 2: Target accounts detail
    target_df.to_excel(writer, sheet_name='2_Target_Accounts', index=False)
    
    # Tab 3: Full opportunity timeline
    combined.to_excel(writer, sheet_name='3_All_Opp_Timelines', index=False)
    
    # Tab 4: All meetings with stage context
    # Add stage context to meetings based on opp history
    df_meetings_out = df_meetings.drop_duplicates(subset=['Company / Account', 'Date', 'Subject'])
    df_meetings_out = df_meetings_out.sort_values(['Company / Account', 'Date'])
    df_meetings_out.to_excel(writer, sheet_name='4_All_Meetings', index=False)

print("\n" + "="*70)
print("OUTPUT COMPLETE")
print("="*70)
print(f"\nFile: {output_path}")
print("\nTabs:")
print("  1_Stage_Duration_Summary - Days between stages (from Opp History)")
print("  2_Target_Accounts - Ecolab, Bayer, BNY, etc. details")
print("  3_All_Opp_Timelines - Full opportunity progression data")
print("  4_All_Meetings - All meetings for reference")

