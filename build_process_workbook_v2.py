"""
Sales Process Timing Analysis - V2
===================================
Aligned to the actual Eudia sales process sub-steps:

Stage 1 Discovery:
  - Meeting 1: Eudia intro
  - Follow-up 1
  - Follow-up 2  
  - Meeting 2a: CAB discussion

Stage 1 Discovery / Stage 2 SQO:
  - Meeting 2b: Use case identification

Stage 2 SQO:
  - Meeting 3: Products overview

Stage 2 (internal):
  - Scoping, pricing, delivery assessment

Stage 4 Proposal:
  - Meeting 4: Proposal and delivery plan
  - Deal desk informal
  - Infosec review
  - Meeting 5: Followups
  - Share proposal with counterparty
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*70)
print("SALES PROCESS TIMING ANALYSIS - V2")
print("="*70)

# Read source data
print("\nLoading source data...")
xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_main = pd.read_excel(xl, sheet_name='Sheet1')
df_other = pd.read_excel(xl, sheet_name='other account meetings')

print(f"Sheet1: {len(df_main)} rows")
print(f"Other account meetings: {len(df_other)} rows")

# Combine all data
df_all = pd.concat([df_main, df_other], ignore_index=True)
df_all['Date'] = pd.to_datetime(df_all['Date'])

# EXCLUDE INVALID DATES (1970-01-01 is Unix epoch = missing data)
invalid_dates = df_all[df_all['Date'] < '2020-01-01']
if len(invalid_dates) > 0:
    print(f"\nExcluding {len(invalid_dates)} rows with invalid dates (before 2020):")
    print(invalid_dates[['Company / Account', 'Date', 'Subject']].head(10).to_string())
df_all = df_all[df_all['Date'] >= '2020-01-01']

# Remove exact duplicates by Activity ID
df_all = df_all.drop_duplicates(subset=['Activity ID'])

# Dedup by Account + Date + Subject
df_all['Subject_Clean'] = df_all['Subject'].fillna('').str.lower().str.strip()
df_all['Dedup_Key'] = df_all['Company / Account'].astype(str) + '|' + df_all['Date'].astype(str) + '|' + df_all['Subject_Clean']
df_dedup = df_all.drop_duplicates(subset=['Dedup_Key'], keep='first').copy()

print(f"After deduplication: {len(df_dedup)} rows")

# EXCLUDE TEST/SAMPLE ACCOUNTS
test_accounts = [
    'Event Triage',
    'Johnson Hana',
    'JHI',
    'Test Account',
    'Sample Account',
    'Demo Account',
    'Eudia',  # Internal
    'Eudia AI',  # Internal
]

# Case-insensitive matching
df_clean = df_dedup[~df_dedup['Company / Account'].str.lower().isin([a.lower() for a in test_accounts])].copy()

excluded = df_dedup[df_dedup['Company / Account'].str.lower().isin([a.lower() for a in test_accounts])]['Company / Account'].unique()
print(f"\nExcluded accounts: {list(excluded)}")
print(f"After exclusion: {len(df_clean)} rows, {df_clean['Company / Account'].nunique()} accounts")

# CLASSIFY MEETINGS TO PROCESS SUB-STEPS
def classify_to_substep(subject):
    """
    Maps meeting subject to specific Eudia sales process sub-steps.
    Returns: (substep_name, stage, confidence, matched_pattern)
    """
    s = str(subject).lower().strip()
    
    # Meeting 1: Eudia intro (Stage 1 Discovery)
    if 'intro' in s or 'introduction' in s:
        return ('Meeting 1: Eudia Intro', 'Stage 1 Discovery', 'HIGH', 'intro|introduction')
    
    # Follow-up meetings (Stage 1 Discovery)
    # Note: "follow up + demo" is still a follow-up
    if 'follow' in s:
        return ('Follow-up', 'Stage 1 Discovery', 'HIGH', 'follow')
    
    # Meeting 2a: CAB discussion (Stage 1 Discovery)
    if 'cab' in s:
        return ('Meeting 2a: CAB Discussion', 'Stage 1 Discovery', 'HIGH', 'cab')
    
    # Meeting 2b: Use case identification (Stage 1/2 transition)
    if 'use case' in s:
        return ('Meeting 2b: Use Case ID', 'Stage 1/2 SQO', 'HIGH', 'use case')
    
    # Meeting 3: Products overview (Stage 2 SQO)
    if 'product' in s and ('overview' in s or 'demo' in s):
        return ('Meeting 3: Products Overview', 'Stage 2 SQO', 'HIGH', 'product+overview|demo')
    
    # Scoping (Stage 2 internal)
    if 'scoping' in s or 'scope' in s:
        return ('Scoping/Pricing/Delivery', 'Stage 2 Internal', 'HIGH', 'scoping|scope')
    
    # Proposal meetings (Stage 4)
    if 'proposal' in s:
        return ('Meeting 4: Proposal', 'Stage 4 Proposal', 'HIGH', 'proposal')
    
    # Deal desk (Stage 4)
    if 'deal desk' in s:
        return ('Deal Desk', 'Stage 4 Proposal', 'HIGH', 'deal desk')
    
    # Infosec/Security review (Stage 4)
    if 'infosec' in s or 'security' in s:
        return ('Infosec Review', 'Stage 4 Proposal', 'HIGH', 'infosec|security')
    
    # Compliance (can be early or late stage)
    if 'compliance' in s:
        return ('Compliance Discussion', 'Variable', 'MEDIUM', 'compliance')
    
    # Demo (generic - could be various stages)
    if 'demo' in s or 'walkthrough' in s:
        return ('Demo', 'Variable', 'MEDIUM', 'demo|walkthrough')
    
    # Pilot/Kickoff (late stage)
    if 'pilot' in s or 'kickoff' in s or 'kick off' in s:
        return ('Pilot/Kickoff', 'Stage 4+', 'HIGH', 'pilot|kickoff')
    
    # M&A specific
    if 'm&a' in s or 'due diligence' in s:
        return ('M&A Discussion', 'Variable', 'MEDIUM', 'm&a|due diligence')
    
    # Office hours (ongoing)
    if 'office hours' in s:
        return ('Office Hours', 'Ongoing', 'MEDIUM', 'office hours')
    
    # Generic meeting/call
    if 'meeting' in s or 'call' in s or 'sync' in s:
        return ('General Meeting', 'Unknown', 'LOW', 'meeting|call|sync')
    
    return ('Unclassified', 'Unknown', 'NONE', '')

# Apply classification
print("\nClassifying meetings to process sub-steps...")
classifications = df_clean['Subject'].apply(classify_to_substep)
df_clean['SubStep'] = [c[0] for c in classifications]
df_clean['Stage'] = [c[1] for c in classifications]
df_clean['Confidence'] = [c[2] for c in classifications]
df_clean['Matched_Pattern'] = [c[3] for c in classifications]

# Sort by account and date
df_clean = df_clean.sort_values(['Company / Account', 'Date'])

# Add sequence number within each account
df_clean['Meeting_Seq'] = df_clean.groupby('Company / Account').cumcount() + 1

# Calculate days from first meeting
first_dates = df_clean.groupby('Company / Account')['Date'].transform('min')
df_clean['Days_From_First'] = (df_clean['Date'] - first_dates).dt.days

print("\n=== SUB-STEP DISTRIBUTION (after cleaning) ===")
print(df_clean['SubStep'].value_counts())

print("\n=== CONFIDENCE DISTRIBUTION ===")
print(df_clean['Confidence'].value_counts())

# BUILD ACCOUNT-LEVEL SUMMARY
print("\nBuilding account summaries...")

# Define the ordered sub-steps for the process
ordered_substeps = [
    'Meeting 1: Eudia Intro',
    'Follow-up',
    'Meeting 2a: CAB Discussion',
    'Meeting 2b: Use Case ID',
    'Demo',  # Generic demos
    'Meeting 3: Products Overview',
    'Scoping/Pricing/Delivery',
    'Meeting 4: Proposal',
    'Deal Desk',
    'Infosec Review',
    'Pilot/Kickoff',
]

account_summaries = []

for acct in df_clean['Company / Account'].unique():
    acct_df = df_clean[df_clean['Company / Account'] == acct].sort_values('Date')
    
    if len(acct_df) == 0:
        continue
    
    first_meeting = acct_df.iloc[0]
    
    record = {
        'Account': acct,
        'First Meeting Date': first_meeting['Date'],
        'First Meeting Type': first_meeting['SubStep'],
        'Total Meetings': len(acct_df),
        'Date Range (days)': (acct_df['Date'].max() - acct_df['Date'].min()).days,
    }
    
    # Get first occurrence of each sub-step
    substep_first_dates = {}
    for _, row in acct_df.iterrows():
        ss = row['SubStep']
        if ss not in substep_first_dates and row['Confidence'] in ['HIGH', 'MEDIUM']:
            substep_first_dates[ss] = {
                'date': row['Date'],
                'days_from_first': row['Days_From_First'],
                'subject': row['Subject'],
                'confidence': row['Confidence']
            }
    
    # Add each sub-step's timing
    for ss in ordered_substeps:
        if ss in substep_first_dates:
            record[f'{ss} - Date'] = substep_first_dates[ss]['date']
            record[f'{ss} - Days'] = substep_first_dates[ss]['days_from_first']
        else:
            record[f'{ss} - Date'] = None
            record[f'{ss} - Days'] = None
    
    account_summaries.append(record)

summary_df = pd.DataFrame(account_summaries)

# CALCULATE STEP-TO-STEP TRANSITIONS
print("\nCalculating step-to-step transitions...")

# Define meaningful transitions (previous step → next step)
step_transitions = [
    ('Meeting 1: Eudia Intro', 'Follow-up', 'Intro → Follow-up'),
    ('Meeting 1: Eudia Intro', 'Meeting 2a: CAB Discussion', 'Intro → CAB Discussion'),
    ('Meeting 1: Eudia Intro', 'Demo', 'Intro → Demo'),
    ('Follow-up', 'Meeting 2a: CAB Discussion', 'Follow-up → CAB Discussion'),
    ('Follow-up', 'Demo', 'Follow-up → Demo'),
    ('Meeting 2a: CAB Discussion', 'Meeting 2b: Use Case ID', 'CAB → Use Case ID'),
    ('Meeting 2a: CAB Discussion', 'Demo', 'CAB → Demo'),
    ('Demo', 'Meeting 2b: Use Case ID', 'Demo → Use Case ID'),
    ('Demo', 'Meeting 3: Products Overview', 'Demo → Products Overview'),
    ('Demo', 'Scoping/Pricing/Delivery', 'Demo → Scoping'),
    ('Meeting 2b: Use Case ID', 'Meeting 3: Products Overview', 'Use Case → Products Overview'),
    ('Meeting 3: Products Overview', 'Scoping/Pricing/Delivery', 'Products Overview → Scoping'),
    ('Scoping/Pricing/Delivery', 'Meeting 4: Proposal', 'Scoping → Proposal'),
    ('Meeting 4: Proposal', 'Infosec Review', 'Proposal → Infosec'),
    ('Meeting 4: Proposal', 'Pilot/Kickoff', 'Proposal → Pilot'),
]

transition_details = []

for acct in df_clean['Company / Account'].unique():
    acct_df = df_clean[df_clean['Company / Account'] == acct].sort_values('Date')
    
    # Get first HIGH/MEDIUM confidence occurrence of each sub-step
    substep_info = {}
    for _, row in acct_df.iterrows():
        ss = row['SubStep']
        if ss not in substep_info and row['Confidence'] in ['HIGH', 'MEDIUM']:
            substep_info[ss] = {
                'date': row['Date'],
                'subject': str(row['Subject'])[:60] if pd.notna(row['Subject']) else ''
            }
    
    # Calculate each transition
    for from_step, to_step, label in step_transitions:
        if from_step in substep_info and to_step in substep_info:
            from_date = substep_info[from_step]['date']
            to_date = substep_info[to_step]['date']
            days = (to_date - from_date).days
            
            # Only include positive transitions (to happened after from)
            if days > 0:
                transition_details.append({
                    'Account': acct,
                    'Transition': label,
                    'From Step': from_step,
                    'To Step': to_step,
                    'From Date': from_date,
                    'To Date': to_date,
                    'Days': days,
                    'From Subject': substep_info[from_step]['subject'],
                    'To Subject': substep_info[to_step]['subject'],
                })

transitions_df = pd.DataFrame(transition_details)

# Create transition summary
if len(transitions_df) > 0:
    transition_summary = transitions_df.groupby('Transition').agg({
        'Days': ['count', 'mean', 'median', 'min', 'max', 'std'],
        'Account': lambda x: ', '.join(x.unique()[:5])
    }).round(1)
    transition_summary.columns = ['Count', 'Mean Days', 'Median Days', 'Min Days', 'Max Days', 'Std Dev', 'Sample Accounts']
    transition_summary = transition_summary.reset_index()
    transition_summary = transition_summary.sort_values('Count', ascending=False)
else:
    transition_summary = pd.DataFrame()

# OUTPUT TO EXCEL
output_path = '/Users/keiganpesenti/Desktop/sales_process_timing_v2.xlsx'
print(f"\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # Tab 1: Transition Summary (the key output)
    transition_summary.to_excel(writer, sheet_name='1_Process_Timing_Summary', index=False)
    
    # Tab 2: All meetings classified
    output_cols = [
        'Company / Account', 'Date', 'Subject', 'SubStep', 'Stage', 
        'Confidence', 'Matched_Pattern', 'Meeting_Seq', 'Days_From_First',
        'Contact', 'Assigned', 'Activity ID'
    ]
    df_clean[output_cols].to_excel(writer, sheet_name='2_All_Meetings_Classified', index=False)
    
    # Tab 3: Account Summary
    summary_df.to_excel(writer, sheet_name='3_Account_Summary', index=False)
    
    # Tab 4: Transition Details (for verification)
    if len(transitions_df) > 0:
        transitions_df.to_excel(writer, sheet_name='4_Transition_Details', index=False)
    
    # Tab 5: Process Step Reference
    step_ref = pd.DataFrame({
        'Stage': [
            'Stage 1 Discovery', 'Stage 1 Discovery', 'Stage 1 Discovery', 'Stage 1 Discovery',
            'Stage 1/2 SQO', 'Stage 2 SQO', 'Stage 2 Internal', 
            'Stage 4 Proposal', 'Stage 4 Proposal', 'Stage 4 Proposal', 'Stage 4 Proposal', 'Stage 4 Proposal'
        ],
        'Step': [
            'Meeting 1: Eudia Intro', 'Follow-up 1', 'Follow-up 2', 'Meeting 2a: CAB Discussion',
            'Meeting 2b: Use Case ID', 'Meeting 3: Products Overview', 'Scoping/Pricing/Delivery',
            'Meeting 4: Proposal', 'Deal Desk', 'Infosec Review', 'Meeting 5: Followups', 'Share Proposal'
        ],
        'Keywords Used': [
            'intro, introduction', 'follow', 'follow (2nd occurrence)', 'cab',
            'use case', 'product + overview/demo', 'scoping, scope',
            'proposal', 'deal desk', 'infosec, security', 'follow (late stage)', 'proposal + share'
        ]
    })
    step_ref.to_excel(writer, sheet_name='5_Process_Step_Reference', index=False)
    
    # Tab 6: Excluded accounts
    excluded_df = pd.DataFrame({
        'Excluded Account': list(excluded),
        'Reason': ['Test/Sample/Internal account'] * len(excluded)
    })
    excluded_df.to_excel(writer, sheet_name='6_Excluded_Accounts', index=False)
    
    # Tab 7: Data Quality
    quality = pd.DataFrame({
        'Metric': [
            'Total source rows (combined)',
            'After Activity ID dedup',
            'After Account+Date+Subject dedup',
            'After excluding test accounts',
            'Unique accounts analyzed',
            'HIGH confidence classifications',
            'MEDIUM confidence classifications',
            'LOW confidence classifications',
            'Unclassified meetings',
        ],
        'Value': [
            len(df_main) + len(df_other),
            len(df_all),
            len(df_dedup),
            len(df_clean),
            df_clean['Company / Account'].nunique(),
            len(df_clean[df_clean['Confidence'] == 'HIGH']),
            len(df_clean[df_clean['Confidence'] == 'MEDIUM']),
            len(df_clean[df_clean['Confidence'] == 'LOW']),
            len(df_clean[df_clean['Confidence'] == 'NONE']),
        ]
    })
    quality.to_excel(writer, sheet_name='7_Data_Quality', index=False)

print("\n" + "="*70)
print("OUTPUT COMPLETE")
print("="*70)

# Print the summary
print("\n=== PROCESS TIMING SUMMARY ===")
print("(Median days between process steps)\n")

if len(transition_summary) > 0:
    for _, row in transition_summary.iterrows():
        print(f"{row['Transition']:30} | Count: {row['Count']:3} | Median: {row['Median Days']:5.0f} days | Range: {row['Min Days']:.0f}-{row['Max Days']:.0f}")

print(f"\n\nFile saved: {output_path}")
print("\nTabs:")
print("  1_Process_Timing_Summary - KEY METRICS (plug into your template)")
print("  2_All_Meetings_Classified - Every meeting with sub-step classification")
print("  3_Account_Summary - Per-account timeline with dates for each step")
print("  4_Transition_Details - Every transition calculation (for verification)")
print("  5_Process_Step_Reference - How steps map to your process model")
print("  6_Excluded_Accounts - Test/sample accounts removed")
print("  7_Data_Quality - Processing statistics")

