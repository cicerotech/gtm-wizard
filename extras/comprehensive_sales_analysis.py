"""
COMPREHENSIVE SALES CYCLE ANALYSIS
===================================
Using ALL data sources:
1. Sheet6 (Closed deals) - Source of truth for total cycle
2. all meetings - Activity data
3. all opp history + more opps - Stage progression data

Output will align with the sales process:
- Stage 0: Prospecting
- Stage 1: Discovery
- Stage 2: SQO
- Stage 3: Pilot
- Stage 4: Proposal
- Closed Won
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*80)
print("COMPREHENSIVE SALES CYCLE ANALYSIS")
print("="*80)

# Load all data
xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_meetings = pd.read_excel(xl, sheet_name='all meetings')
df_opp_hist = pd.read_excel(xl, sheet_name='all opp history')
df_more_opps = pd.read_excel(xl, sheet_name='more opps')
df_closed = pd.read_excel(xl, sheet_name='Sheet6')

print(f"\nData Sources:")
print(f"  All Meetings: {len(df_meetings)} rows")
print(f"  Opp History: {len(df_opp_hist)} rows")
print(f"  More Opps: {len(df_more_opps)} rows")
print(f"  Closed Deals (Sheet6): {len(df_closed)} rows")

# SECTION 1: DATA QUALITY DIAGNOSTIC
print("\n" + "="*80)
print("SECTION 1: DATA QUALITY DIAGNOSTIC")
print("="*80)

# Clean dates
df_meetings['Date'] = pd.to_datetime(df_meetings['Date'], errors='coerce')
df_closed['First Meeting Date'] = pd.to_datetime(df_closed['First Meeting Date'], errors='coerce')
df_closed['First Deal Closed'] = pd.to_datetime(df_closed['First Deal Closed'], errors='coerce')

# Meetings quality
print("\n--- Meetings Data Quality ---")
total_meetings = len(df_meetings)
invalid_dates = df_meetings[df_meetings['Date'] < '2020-01-01'].shape[0]
duplicate_activities = df_meetings.duplicated(subset=['Activity ID']).sum()
duplicate_meetings = df_meetings.duplicated(subset=['Company / Account', 'Date', 'Subject']).sum()

print(f"Total rows: {total_meetings}")
print(f"Invalid dates (before 2020): {invalid_dates}")
print(f"Duplicate Activity IDs: {duplicate_activities}")
print(f"Duplicate meetings (same account+date+subject): {duplicate_meetings}")
print(f"Unique accounts: {df_meetings['Company / Account'].nunique()}")

# Exclude test accounts
test_accounts = ['Event Triage', 'Johnson Hana', 'JHI', 'Eudia', 'Eudia AI', 'Test']
meetings_test = df_meetings[df_meetings['Company / Account'].str.lower().str.contains('|'.join([t.lower() for t in test_accounts]), na=False)]
print(f"Test account meetings to exclude: {len(meetings_test)}")

# Closed deals quality
print("\n--- Closed Deals (Sheet6) Quality ---")
print(f"Total closed accounts: {len(df_closed)}")
print(f"With First Meeting Date: {df_closed['First Meeting Date'].notna().sum()}")
print(f"With Days to Close: {df_closed['Days to Close'].notna().sum()}")
valid_cycles = df_closed[(df_closed['Days to Close'] > 0) & (df_closed['Days to Close'].notna())]
print(f"Valid positive cycles: {len(valid_cycles)}")
negative_cycles = df_closed[df_closed['Days to Close'] < 0]
print(f"Negative cycles (data error): {len(negative_cycles)}")
if len(negative_cycles) > 0:
    print(f"  Accounts with negative days: {list(negative_cycles['Account Name'])}")

# SECTION 2: OVERALL SALES CYCLE (from Sheet6)
print("\n" + "="*80)
print("SECTION 2: OVERALL SALES CYCLE (First Meeting → Close)")
print("="*80)

valid_cycles = df_closed[(df_closed['Days to Close'] > 0) & (df_closed['Days to Close'].notna())]
days_to_close = valid_cycles['Days to Close']

print(f"\nFull Sales Cycle (n={len(days_to_close)} closed deals):")
print(f"  Mean: {days_to_close.mean():.1f} days")
print(f"  Median: {days_to_close.median():.1f} days")
print(f"  Std Dev: {days_to_close.std():.1f} days")
print(f"  Min: {days_to_close.min():.0f} days")
print(f"  Max: {days_to_close.max():.0f} days")

# Percentiles
print(f"\nPercentiles:")
print(f"  25th: {days_to_close.quantile(0.25):.0f} days")
print(f"  50th: {days_to_close.quantile(0.50):.0f} days")
print(f"  75th: {days_to_close.quantile(0.75):.0f} days")
print(f"  90th: {days_to_close.quantile(0.90):.0f} days")

# SECTION 3: SUB-STAGE ANALYSIS FROM MEETINGS
print("\n" + "="*80)
print("SECTION 3: SUB-STAGE TIMING (from Meeting Sequences)")
print("="*80)

# Clean meetings data
df_meetings_clean = df_meetings[df_meetings['Date'] >= '2020-01-01'].copy()
df_meetings_clean = df_meetings_clean[~df_meetings_clean['Company / Account'].str.lower().str.contains('|'.join([t.lower() for t in test_accounts]), na=False)]
df_meetings_clean = df_meetings_clean.drop_duplicates(subset=['Company / Account', 'Date', 'Subject'])
df_meetings_clean = df_meetings_clean.sort_values(['Company / Account', 'Date'])

print(f"\nCleaned meetings: {len(df_meetings_clean)} unique meetings")
print(f"Unique accounts with meetings: {df_meetings_clean['Company / Account'].nunique()}")

# For closed accounts only, analyze meeting patterns
closed_accounts = set(df_closed['Account Name'].str.lower().dropna())

# Match meetings to closed accounts
closed_account_meetings = []
for _, closed_row in df_closed.iterrows():
    acct = closed_row['Account Name']
    if pd.isna(acct):
        continue
    
    # Find meetings for this account
    acct_meetings = df_meetings_clean[
        df_meetings_clean['Company / Account'].str.lower() == acct.lower()
    ].sort_values('Date')
    
    if len(acct_meetings) == 0:
        # Try partial match
        acct_meetings = df_meetings_clean[
            df_meetings_clean['Company / Account'].str.lower().str.contains(acct.lower().split()[0], na=False)
        ].sort_values('Date')
    
    closed_account_meetings.append({
        'Account': acct,
        'First Meeting Date (Sheet6)': closed_row['First Meeting Date'],
        'Close Date': closed_row['First Deal Closed'],
        'Days to Close': closed_row['Days to Close'],
        'Meeting Count': len(acct_meetings),
        'First Meeting (from meetings)': acct_meetings['Date'].min() if len(acct_meetings) > 0 else None,
        'Last Meeting': acct_meetings['Date'].max() if len(acct_meetings) > 0 else None,
    })
    
    # Add meeting sequence data
    if len(acct_meetings) >= 2:
        dates = acct_meetings['Date'].tolist()
        closed_account_meetings[-1]['Days 1→2'] = (dates[1] - dates[0]).days if len(dates) >= 2 else None
        closed_account_meetings[-1]['Days 2→3'] = (dates[2] - dates[1]).days if len(dates) >= 3 else None
        closed_account_meetings[-1]['Days 3→4'] = (dates[3] - dates[2]).days if len(dates) >= 4 else None
        closed_account_meetings[-1]['Days 4→5'] = (dates[4] - dates[3]).days if len(dates) >= 5 else None

closed_df = pd.DataFrame(closed_account_meetings)

# Calculate meeting-based metrics
print("\n--- Meeting Sequence Timing (Closed Accounts) ---")

for col in ['Days 1→2', 'Days 2→3', 'Days 3→4', 'Days 4→5']:
    valid = closed_df[col].dropna()
    valid = valid[(valid >= 0) & (valid < 365)]  # Exclude outliers
    if len(valid) > 0:
        print(f"\n{col}:")
        print(f"  Count: {len(valid)}")
        print(f"  Mean: {valid.mean():.1f} days")
        print(f"  Median: {valid.median():.1f} days")

# SECTION 4: STAGE DURATION FROM OPP HISTORY
print("\n" + "="*80)
print("SECTION 4: STAGE DURATION (from Opp History)")
print("="*80)

# Combine opp history data
df_all_opps = pd.concat([df_opp_hist, df_more_opps], ignore_index=True)
df_all_opps = df_all_opps.drop_duplicates()
df_all_opps['Last Stage Change Date'] = pd.to_datetime(df_all_opps['Last Stage Change Date'], errors='coerce')
df_all_opps['Created Date'] = pd.to_datetime(df_all_opps['Created Date'], errors='coerce')

print(f"\nCombined opp data: {len(df_all_opps)} rows")
print(f"Unique opportunities: {df_all_opps['Opportunity ID'].nunique()}")

# Days in Stage by Stage (using existing Days in Stage column)
print("\n--- Days in Stage (from Opp History) ---")
stage_groups = df_all_opps.groupby('To Stage')['Days in Stage'].agg(['count', 'mean', 'median', 'min', 'max'])
stage_groups = stage_groups[stage_groups['count'] >= 5].round(1)  # At least 5 data points
print(stage_groups.to_string())

# SECTION 5: COMPLETE ACCOUNT ANALYSIS
print("\n" + "="*80)
print("SECTION 5: COMPLETE ACCOUNT ANALYSIS (Closed Deals)")
print("="*80)

# For each closed account, build complete picture
complete_analysis = []

for _, closed_row in valid_cycles.iterrows():
    acct = closed_row['Account Name']
    
    # Get meetings
    acct_meetings = df_meetings_clean[
        df_meetings_clean['Company / Account'].str.lower().str.contains(acct.lower().split()[0], na=False)
    ].sort_values('Date').drop_duplicates(subset=['Date', 'Subject'])
    
    # Get opp history
    acct_opps = df_all_opps[
        df_all_opps['Account Name'].str.lower().str.contains(acct.lower().split()[0], na=False)
    ]
    
    record = {
        'Account': acct,
        'Account Owner': closed_row['Account Owner'],
        'Days to Close (Sheet6)': closed_row['Days to Close'],
        'First Meeting Date': closed_row['First Meeting Date'],
        'Close Date': closed_row['First Deal Closed'],
        'Meeting Count': len(acct_meetings),
    }
    
    # Meeting sequence
    if len(acct_meetings) >= 2:
        dates = acct_meetings['Date'].tolist()
        record['Meeting 1→2'] = (dates[1] - dates[0]).days
    if len(acct_meetings) >= 3:
        record['Meeting 2→3'] = (dates[2] - dates[1]).days
    if len(acct_meetings) >= 4:
        record['Meeting 3→4'] = (dates[3] - dates[2]).days
    
    # Stage info
    stages = acct_opps['To Stage'].unique() if len(acct_opps) > 0 else []
    record['Stages Reached'] = ', '.join([s for s in stages if pd.notna(s)])
    
    complete_analysis.append(record)

complete_df = pd.DataFrame(complete_analysis)

# Print sample
print("\nTop 15 closed accounts by Days to Close:")
print(complete_df.nlargest(15, 'Days to Close (Sheet6)')[['Account', 'Days to Close (Sheet6)', 'Meeting Count', 'Meeting 1→2', 'Meeting 2→3']].to_string(index=False))

# SECTION 6: SUMMARY STATISTICS FOR YOUR TEMPLATE
print("\n" + "="*80)
print("SECTION 6: SUMMARY FOR YOUR TEMPLATE")
print("="*80)

summary = []

# Overall cycle
summary.append({
    'Metric': 'Full Sales Cycle (First Meeting → Close)',
    'Source': 'Sheet6',
    'Count': len(valid_cycles),
    'Mean (days)': round(valid_cycles['Days to Close'].mean(), 0),
    'Median (days)': round(valid_cycles['Days to Close'].median(), 0),
    'Min': int(valid_cycles['Days to Close'].min()),
    'Max': int(valid_cycles['Days to Close'].max()),
})

# Meeting sequence timing
for col, label in [('Days 1→2', 'Meeting 1 → Meeting 2'), 
                   ('Days 2→3', 'Meeting 2 → Meeting 3'),
                   ('Days 3→4', 'Meeting 3 → Meeting 4')]:
    valid = closed_df[col].dropna()
    valid = valid[(valid >= 0) & (valid < 365)]
    if len(valid) >= 5:
        summary.append({
            'Metric': label,
            'Source': 'Meeting Data',
            'Count': len(valid),
            'Mean (days)': round(valid.mean(), 0),
            'Median (days)': round(valid.median(), 0),
            'Min': int(valid.min()),
            'Max': int(valid.max()),
        })

# Stage durations
for stage in ['Stage 0 - Prospecting', 'Stage 0 - Qualifying', 'Stage 1 - Discovery', 
              'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal']:
    stage_data = df_all_opps[df_all_opps['To Stage'] == stage]['Days in Stage'].dropna()
    stage_data = stage_data[(stage_data > 0) & (stage_data < 500)]
    if len(stage_data) >= 5:
        summary.append({
            'Metric': f'Days in {stage}',
            'Source': 'Opp History',
            'Count': len(stage_data),
            'Mean (days)': round(stage_data.mean(), 0),
            'Median (days)': round(stage_data.median(), 0),
            'Min': int(stage_data.min()),
            'Max': int(stage_data.max()),
        })

summary_df = pd.DataFrame(summary)
print("\n")
print(summary_df.to_string(index=False))

# OUTPUT
output_path = '/Users/keiganpesenti/Desktop/comprehensive_sales_analysis.xlsx'
print(f"\n\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # Tab 1: Summary for template
    summary_df.to_excel(writer, sheet_name='1_Summary_For_Template', index=False)
    
    # Tab 2: All closed accounts with full metrics
    complete_df.to_excel(writer, sheet_name='2_Closed_Accounts_Detail', index=False)
    
    # Tab 3: Meeting sequence for closed accounts
    closed_df.to_excel(writer, sheet_name='3_Meeting_Sequences', index=False)
    
    # Tab 4: Data quality diagnostic
    quality_df = pd.DataFrame({
        'Metric': [
            'Total meetings (raw)',
            'Meetings after cleanup',
            'Unique accounts with meetings',
            'Closed deals with valid cycle data',
            'Combined opp history records',
            'Test accounts excluded',
        ],
        'Value': [
            len(df_meetings),
            len(df_meetings_clean),
            df_meetings_clean['Company / Account'].nunique(),
            len(valid_cycles),
            len(df_all_opps),
            ', '.join(test_accounts),
        ]
    })
    quality_df.to_excel(writer, sheet_name='4_Data_Quality', index=False)
    
    # Tab 5: Stage duration from opp history
    stage_groups.reset_index().to_excel(writer, sheet_name='5_Stage_Durations', index=False)

print("\nDone!")
print(f"\nFile: {output_path}")

