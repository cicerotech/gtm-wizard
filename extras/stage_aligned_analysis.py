"""
Stage-Aligned Sales Process Analysis
=====================================
Correlates meetings with opportunity stage timelines to understand
engagement patterns within each stage of the sales process.

Outputs a formula-driven Excel workbook.
"""

import pandas as pd
import numpy as np
from datetime import datetime
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.utils import get_column_letter

print("="*80)
print("STAGE-ALIGNED SALES PROCESS ANALYSIS")
print("="*80)

# =============================================================================
# STEP 1: LOAD AND CLEAN ALL DATA SOURCES
# =============================================================================
print("\n[STEP 1] Loading and cleaning data sources...")

xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')

# Load all tabs
df_meetings = pd.read_excel(xl, sheet_name='all meetings')
df_opp_hist = pd.read_excel(xl, sheet_name='all opp history')
df_more_opps = pd.read_excel(xl, sheet_name='more opps')
df_closed = pd.read_excel(xl, sheet_name='Sheet6')

print(f"  Loaded: meetings={len(df_meetings)}, opp_hist={len(df_opp_hist)}, more_opps={len(df_more_opps)}, closed={len(df_closed)}")

# Combine opportunity data
df_all_opps = pd.concat([df_opp_hist, df_more_opps], ignore_index=True)

# Clean dates
df_meetings['Date'] = pd.to_datetime(df_meetings['Date'], errors='coerce')
df_all_opps['Last Stage Change Date'] = pd.to_datetime(df_all_opps['Last Stage Change Date'], errors='coerce')
df_all_opps['Created Date'] = pd.to_datetime(df_all_opps['Created Date'], errors='coerce')
df_closed['First Meeting Date'] = pd.to_datetime(df_closed['First Meeting Date'], errors='coerce')
df_closed['First Deal Closed'] = pd.to_datetime(df_closed['First Deal Closed'], errors='coerce')

# Exclude invalid dates (before 2020)
df_meetings = df_meetings[df_meetings['Date'] >= '2020-01-01'].copy()

# Exclude test accounts
test_accounts = ['event triage', 'johnson hana', 'jhi', 'eudia', 'eudia ai', 'test account']
df_meetings = df_meetings[~df_meetings['Company / Account'].str.lower().isin(test_accounts)].copy()

# Deduplicate meetings (same account + date + subject)
df_meetings['Subject_Lower'] = df_meetings['Subject'].fillna('').str.lower().str.strip()
df_meetings = df_meetings.drop_duplicates(subset=['Company / Account', 'Date', 'Subject_Lower'])
df_meetings = df_meetings.sort_values(['Company / Account', 'Date']).reset_index(drop=True)

# Deduplicate opp history
df_all_opps = df_all_opps.drop_duplicates(subset=['Account Name', 'Opportunity ID', 'To Stage', 'Last Stage Change Date'])

print(f"  Cleaned: meetings={len(df_meetings)}, opps={len(df_all_opps)}")
print(f"  Unique accounts with meetings: {df_meetings['Company / Account'].nunique()}")
print(f"  Unique accounts in opp history: {df_all_opps['Account Name'].nunique()}")

print("\n[STEP 1] COMPLETE - Data loaded and cleaned")

# =============================================================================
# STEP 2: BUILD ACCOUNT STAGE TIMELINE
# =============================================================================
print("\n[STEP 2] Building account stage timelines...")

# For each account, find when they entered each stage
stage_timeline = []

for acct in df_all_opps['Account Name'].unique():
    acct_opps = df_all_opps[df_all_opps['Account Name'] == acct].copy()
    
    record = {'Account': acct}
    
    # Get first occurrence of each stage
    for stage_name, stage_value in [
        ('Stage_0_Date', 'Stage 0 - Prospecting'),
        ('Stage_0Q_Date', 'Stage 0 - Qualifying'),
        ('Stage_1_Date', 'Stage 1 - Discovery'),
        ('Stage_2_Date', 'Stage 2 - SQO'),
        ('Stage_3_Date', 'Stage 3 - Pilot'),
        ('Stage_4_Date', 'Stage 4 - Proposal'),
        ('Close_Won_Date', 'Stage 6. Closed(Won)'),
    ]:
        stage_rows = acct_opps[acct_opps['To Stage'] == stage_value]
        if len(stage_rows) > 0:
            first_date = stage_rows['Last Stage Change Date'].min()
            record[stage_name] = first_date
        else:
            record[stage_name] = None
    
    # Get created date (earliest opp start)
    record['Created_Date'] = acct_opps['Created Date'].min()
    
    # Get days in stage data
    # "Days in Stage" when transitioning TO a new stage = time spent in the FROM stage
    # So Days in Stage when To Stage = Stage 2 means time spent in Stage 1
    for stage_name, stage_value in [
        ('Days_in_Stage_1', 'Stage 2 - SQO'),       # Days in Stage 1 = when moving TO Stage 2
        ('Days_in_Stage_2', 'Stage 4 - Proposal'),  # Days in Stage 2 = when moving TO Stage 4
        ('Days_in_Stage_4', 'Stage 6. Closed(Won)'),# Days in Stage 4 = when moving TO Closed Won
    ]:
        stage_rows = acct_opps[acct_opps['To Stage'] == stage_value]
        if len(stage_rows) > 0:
            days = stage_rows['Days in Stage'].max()
            record[stage_name] = days if pd.notna(days) else None
    
    stage_timeline.append(record)

timeline_df = pd.DataFrame(stage_timeline)

# Calculate stage durations
# Use the first available Stage 0 date (Prospecting or Qualifying)
timeline_df['Stage_0_Effective'] = timeline_df['Stage_0_Date'].combine_first(
    timeline_df['Stage_0Q_Date']).combine_first(timeline_df['Created_Date'])

# Use the "Days in Stage" values from opp history (more accurate than date calculation)
# The "Days in Stage" when transitioning TO a new stage represents time spent in the previous stage

# Days in Stage 1 = Days in Stage value when transitioning TO Stage 2
timeline_df['Days_Stage_1_to_2'] = timeline_df['Days_in_Stage_1']

# Days in Stage 2 = Days in Stage value when transitioning TO Stage 4
timeline_df['Days_Stage_2_to_4'] = timeline_df['Days_in_Stage_2']

# Days Stage 4 → Close = calculate from dates (or use Days in Stage 4 if available)
timeline_df['Days_Stage_4_to_Close'] = timeline_df['Days_in_Stage_4']

# Also add calculated days as backup/validation
timeline_df['Days_Stage_1_to_2_Calc'] = (timeline_df['Stage_2_Date'] - timeline_df['Stage_1_Date']).dt.days
timeline_df['Days_Stage_2_to_4_Calc'] = (timeline_df['Stage_4_Date'] - timeline_df['Stage_2_Date']).dt.days
timeline_df['Days_Stage_4_to_Close_Calc'] = (timeline_df['Close_Won_Date'] - timeline_df['Stage_4_Date']).dt.days

# If Days in Stage values are missing, use calculated
timeline_df['Days_Stage_1_to_2'] = timeline_df['Days_Stage_1_to_2'].fillna(timeline_df['Days_Stage_1_to_2_Calc'])
timeline_df['Days_Stage_2_to_4'] = timeline_df['Days_Stage_2_to_4'].fillna(timeline_df['Days_Stage_2_to_4_Calc'])
timeline_df['Days_Stage_4_to_Close'] = timeline_df['Days_Stage_4_to_Close'].fillna(timeline_df['Days_Stage_4_to_Close_Calc'])

# Filter to accounts that have at least Stage 1 → Stage 2 progression
qualifying_timeline = timeline_df[
    (timeline_df['Stage_1_Date'].notna()) & 
    (timeline_df['Stage_2_Date'].notna())
].copy()

print(f"  Total accounts in opp history: {len(timeline_df)}")
print(f"  Accounts with Stage 1→2 progression: {len(qualifying_timeline)}")

print("\n[STEP 2] COMPLETE - Account stage timelines built")

# =============================================================================
# STEP 3: CLASSIFY MEETINGS BY SUBJECT KEYWORDS
# =============================================================================
print("\n[STEP 3] Classifying meetings by subject keywords...")

def classify_meeting(subject, account_name):
    """Classify meeting based on subject line keywords."""
    if pd.isna(subject):
        return 'Unclassified'
    
    s = str(subject).lower().strip()
    acct_lower = str(account_name).lower() if pd.notna(account_name) else ''
    
    # Order matters - more specific patterns first
    
    # CAB Discussion (Stage 1)
    if 'cab' in s or 'customer advisory' in s or 'advisory board' in s:
        return 'CAB Discussion'
    
    # Use Case Identification (Stage 1 → 2)
    if 'use case' in s or 'use-case' in s or 'requirements' in s:
        return 'Use Case ID'
    
    # Scoping/Pricing (Stage 2 → 4)
    if 'scoping' in s or 'scope' in s or 'pricing' in s or 'proposal prep' in s:
        return 'Scoping'
    
    # Proposal (Stage 4)
    if 'proposal' in s or 'terms' in s or 'agreement' in s or 'contract review' in s:
        return 'Proposal'
    
    # Compliance/Contracting (Stage 2)
    if 'compliance' in s or 'contracting' in s or 'redline' in s or 'redlining' in s:
        return 'Compliance/Contracting'
    
    # Sigma/Product specific (Stage 2)
    if 'sigma' in s or 'insights' in s:
        return 'Sigma/Product'
    
    # Demo (Stage 2)
    if 'demo' in s or 'walkthrough' in s or 'platform' in s:
        return 'Demo'
    
    # Follow-up (Stage 1)
    if 'follow' in s or 'reconnect' in s:
        return 'Follow-up'
    
    # Intro/First Meeting (Stage 1 entry)
    if 'intro' in s or 'introduction' in s:
        return 'Intro'
    
    # Check if subject is just company name (likely first meeting)
    if acct_lower and (s == acct_lower or s.startswith(acct_lower + ' ') or 
                       s.endswith(' ' + acct_lower) or '<> ' + acct_lower in s or
                       acct_lower + ' <>' in s):
        return 'First Meeting'
    
    # Security/Infosec (Stage 2-4)
    if 'security' in s or 'infosec' in s:
        return 'Security Review'
    
    # Pilot (Stage 3)
    if 'pilot' in s or 'kickoff' in s or 'kick off' in s:
        return 'Pilot/Kickoff'
    
    # Office Hours (ongoing)
    if 'office hours' in s:
        return 'Office Hours'
    
    # M&A (variable)
    if 'm&a' in s or 'due diligence' in s:
        return 'M&A Discussion'
    
    # Generic meeting/call
    if 'meeting' in s or 'call' in s or 'sync' in s:
        return 'General Meeting'
    
    return 'Unclassified'

# Apply classification
df_meetings['Meeting_Type'] = df_meetings.apply(
    lambda row: classify_meeting(row['Subject'], row['Company / Account']), 
    axis=1
)

# Show distribution
print("\n  Meeting Type Distribution:")
type_counts = df_meetings['Meeting_Type'].value_counts()
for mt, count in type_counts.head(15).items():
    print(f"    {mt}: {count}")

print("\n[STEP 3] COMPLETE - Meetings classified")

# =============================================================================
# STEP 4: MATCH MEETINGS TO STAGE WINDOWS
# =============================================================================
print("\n[STEP 4] Matching meetings to account stage windows...")

# Build account name mapping for fuzzy matching
def normalize_name(name):
    """Normalize account name for matching."""
    if pd.isna(name):
        return ''
    s = str(name).lower().strip()
    # Remove common suffixes
    for suffix in [' inc', ' inc.', ' llc', ' ltd', ' limited', ' corp', ' corporation', ' plc', ' global']:
        if s.endswith(suffix):
            s = s[:-len(suffix)].strip()
    return s

# Create lookup with normalized names
stage_lookup = {}
for _, row in qualifying_timeline.iterrows():
    acct = row['Account']
    norm = normalize_name(acct)
    stage_lookup[norm] = {
        'orig_name': acct,
        'Stage_1_Date': row['Stage_1_Date'],
        'Stage_2_Date': row['Stage_2_Date'],
        'Stage_4_Date': row['Stage_4_Date'],
        'Close_Won_Date': row['Close_Won_Date'],
    }
    # Also add first word as key
    first_word = norm.split()[0] if norm else ''
    if first_word and len(first_word) > 3 and first_word not in stage_lookup:
        stage_lookup[f"_first_{first_word}"] = stage_lookup[norm]

def find_account_in_lookup(acct):
    """Find account in lookup using fuzzy matching."""
    norm = normalize_name(acct)
    
    # Exact match
    if norm in stage_lookup and not norm.startswith('_first_'):
        return stage_lookup[norm]
    
    # First word match
    first_word = norm.split()[0] if norm else ''
    if first_word and len(first_word) > 3:
        key = f"_first_{first_word}"
        if key in stage_lookup:
            return stage_lookup[key]
    
    # Substring match - check if any lookup key is contained in or contains the account name
    for key, value in stage_lookup.items():
        if key.startswith('_first_'):
            continue
        if len(key) > 4 and (key in norm or norm in key):
            return value
    
    return None

def get_meeting_stage(row):
    """Determine which stage a meeting falls into based on date."""
    acct = row['Company / Account']
    meeting_date = row['Date']
    
    if pd.isna(meeting_date):
        return 'Unknown'
    
    # Find account in lookup
    match = find_account_in_lookup(acct)
    
    if match is None:
        return 'No Stage Data'
    
    stage1 = match['Stage_1_Date']
    stage2 = match['Stage_2_Date']
    stage4 = match['Stage_4_Date']
    close = match['Close_Won_Date']
    
    # Determine stage based on date range
    if pd.notna(stage1) and pd.notna(stage2):
        if meeting_date >= stage1 and meeting_date < stage2:
            return 'Stage 1'
    
    if pd.notna(stage2) and pd.notna(stage4):
        if meeting_date >= stage2 and meeting_date < stage4:
            return 'Stage 2'
    elif pd.notna(stage2) and pd.isna(stage4):
        # No Stage 4 yet, check if still in Stage 2
        if pd.notna(close):
            if meeting_date >= stage2 and meeting_date < close:
                return 'Stage 2'
        else:
            if meeting_date >= stage2:
                return 'Stage 2'
    
    if pd.notna(stage4):
        if pd.notna(close):
            if meeting_date >= stage4 and meeting_date < close:
                return 'Stage 4'
        else:
            if meeting_date >= stage4:
                return 'Stage 4'
    
    if pd.notna(close) and meeting_date >= close:
        return 'Post-Close'
    
    if pd.notna(stage1) and meeting_date < stage1:
        return 'Pre-Stage 1'
    
    return 'Unknown'

# Apply stage matching
df_meetings['Assigned_Stage'] = df_meetings.apply(get_meeting_stage, axis=1)

# Show distribution
print("\n  Assigned Stage Distribution:")
stage_counts = df_meetings['Assigned_Stage'].value_counts()
for stage, count in stage_counts.items():
    print(f"    {stage}: {count}")

print("\n[STEP 4] COMPLETE - Meetings matched to stages")

# =============================================================================
# STEP 5: BUILD ANALYSIS SUMMARIES
# =============================================================================
print("\n[STEP 5] Building analysis summaries...")

# Stage 1 Analysis: For each account, count meetings by type during Stage 1
stage1_analysis = []

for acct in qualifying_timeline['Account'].unique():
    acct_meetings = df_meetings[
        (df_meetings['Company / Account'].str.lower() == acct.lower()) &
        (df_meetings['Assigned_Stage'] == 'Stage 1')
    ]
    
    timeline_row = qualifying_timeline[qualifying_timeline['Account'] == acct].iloc[0]
    
    record = {
        'Account': acct,
        'Stage_1_Date': timeline_row['Stage_1_Date'],
        'Stage_2_Date': timeline_row['Stage_2_Date'],
        'Days_in_Stage_1': timeline_row['Days_Stage_1_to_2'],
        'Total_Stage_1_Meetings': len(acct_meetings),
    }
    
    # Count by type
    for mt in ['Intro', 'First Meeting', 'Follow-up', 'CAB Discussion', 'Use Case ID', 'Demo', 'General Meeting']:
        record[f'Stage1_{mt.replace(" ", "_")}'] = len(acct_meetings[acct_meetings['Meeting_Type'] == mt])
    
    stage1_analysis.append(record)

stage1_df = pd.DataFrame(stage1_analysis)

# Stage 2 Analysis: For each account, count meetings by type during Stage 2
stage2_analysis = []

for acct in qualifying_timeline['Account'].unique():
    acct_meetings = df_meetings[
        (df_meetings['Company / Account'].str.lower() == acct.lower()) &
        (df_meetings['Assigned_Stage'] == 'Stage 2')
    ]
    
    timeline_row = qualifying_timeline[qualifying_timeline['Account'] == acct].iloc[0]
    
    record = {
        'Account': acct,
        'Stage_2_Date': timeline_row['Stage_2_Date'],
        'Stage_4_Date': timeline_row['Stage_4_Date'],
        'Days_in_Stage_2': timeline_row['Days_Stage_2_to_4'],
        'Total_Stage_2_Meetings': len(acct_meetings),
    }
    
    # Count by type
    for mt in ['Demo', 'Compliance/Contracting', 'Sigma/Product', 'Scoping', 'Security Review', 'General Meeting']:
        record[f'Stage2_{mt.replace(" ", "_").replace("/", "_")}'] = len(acct_meetings[acct_meetings['Meeting_Type'] == mt])
    
    stage2_analysis.append(record)

stage2_df = pd.DataFrame(stage2_analysis)

# Summary Metrics
print("\n  === SUMMARY METRICS ===")

# Stage 1 metrics
valid_stage1 = stage1_df[stage1_df['Days_in_Stage_1'] > 0]['Days_in_Stage_1'].dropna()
valid_stage1_meetings = stage1_df[stage1_df['Total_Stage_1_Meetings'] > 0]['Total_Stage_1_Meetings']

print(f"\n  Stage 1 (Discovery → SQO):")
print(f"    Accounts with data: {len(valid_stage1)}")
if len(valid_stage1) > 0:
    print(f"    Avg Days in Stage 1: {valid_stage1.mean():.1f}")
    print(f"    Median Days: {valid_stage1.median():.1f}")
if len(valid_stage1_meetings) > 0:
    print(f"    Avg Meetings in Stage 1: {valid_stage1_meetings.mean():.1f}")

# Stage 2 metrics
valid_stage2 = stage2_df[stage2_df['Days_in_Stage_2'] > 0]['Days_in_Stage_2'].dropna()
valid_stage2_meetings = stage2_df[stage2_df['Total_Stage_2_Meetings'] > 0]['Total_Stage_2_Meetings']

print(f"\n  Stage 2 (SQO → Proposal):")
print(f"    Accounts with data: {len(valid_stage2)}")
if len(valid_stage2) > 0:
    print(f"    Avg Days in Stage 2: {valid_stage2.mean():.1f}")
    print(f"    Median Days: {valid_stage2.median():.1f}")
if len(valid_stage2_meetings) > 0:
    print(f"    Avg Meetings in Stage 2: {valid_stage2_meetings.mean():.1f}")

print("\n[STEP 5] COMPLETE - Analysis summaries built")

# =============================================================================
# STEP 6: CREATE FORMULA-DRIVEN EXCEL WORKBOOK
# =============================================================================
print("\n[STEP 6] Creating formula-driven Excel workbook...")

output_path = '/Users/keiganpesenti/Desktop/stage_aligned_workbook.xlsx'

from openpyxl.worksheet.table import Table, TableStyleInfo

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # Tab 1: Raw Meetings (with classification and stage)
    meetings_output = df_meetings[[
        'Company / Account', 'Date', 'Subject', 'Meeting_Type', 
        'Assigned_Stage', 'Contact', 'Assigned', 'Activity ID'
    ]].copy()
    meetings_output = meetings_output.rename(columns={'Company / Account': 'Account'})
    meetings_output.to_excel(writer, sheet_name='1_Meetings', index=False)
    
    # Tab 2: Account Stage Timeline
    timeline_output = qualifying_timeline[[
        'Account', 'Created_Date', 'Stage_0_Effective', 'Stage_1_Date', 
        'Stage_2_Date', 'Stage_4_Date', 'Close_Won_Date',
        'Days_Stage_1_to_2', 'Days_Stage_2_to_4', 'Days_Stage_4_to_Close'
    ]].copy()
    timeline_output.to_excel(writer, sheet_name='2_Timeline', index=False)
    
    # Tab 3: Stage 1 Analysis
    stage1_df.to_excel(writer, sheet_name='3_Stage1', index=False)
    
    # Tab 4: Stage 2 Analysis
    stage2_df.to_excel(writer, sheet_name='4_Stage2', index=False)
    
    # Tab 5: Account Detail View - comprehensive per-account view
    # This shows each account's full journey with meetings in each stage
    account_detail = []
    for acct in qualifying_timeline['Account'].unique():
        row = {'Account': acct}
        
        tl = qualifying_timeline[qualifying_timeline['Account'] == acct].iloc[0]
        row['Stage_1_Date'] = tl['Stage_1_Date']
        row['Stage_2_Date'] = tl['Stage_2_Date']
        row['Stage_4_Date'] = tl['Stage_4_Date']
        row['Close_Date'] = tl['Close_Won_Date']
        row['Days_S1_to_S2'] = tl['Days_Stage_1_to_2']
        row['Days_S2_to_S4'] = tl['Days_Stage_2_to_4']
        row['Days_S4_to_Close'] = tl['Days_Stage_4_to_Close']
        
        # Get meetings for this account
        acct_mtgs = df_meetings[df_meetings['Company / Account'].str.lower() == acct.lower()]
        
        # Stage 1 meetings
        s1_mtgs = acct_mtgs[acct_mtgs['Assigned_Stage'] == 'Stage 1']
        row['S1_Total_Meetings'] = len(s1_mtgs)
        row['S1_Meeting_Types'] = ', '.join(s1_mtgs['Meeting_Type'].unique()) if len(s1_mtgs) > 0 else ''
        
        # Stage 2 meetings
        s2_mtgs = acct_mtgs[acct_mtgs['Assigned_Stage'] == 'Stage 2']
        row['S2_Total_Meetings'] = len(s2_mtgs)
        row['S2_Meeting_Types'] = ', '.join(s2_mtgs['Meeting_Type'].unique()) if len(s2_mtgs) > 0 else ''
        
        # Stage 4 meetings
        s4_mtgs = acct_mtgs[acct_mtgs['Assigned_Stage'] == 'Stage 4']
        row['S4_Total_Meetings'] = len(s4_mtgs)
        
        # First meeting date for this account
        if len(acct_mtgs) > 0:
            row['First_Meeting_Date'] = acct_mtgs['Date'].min()
            row['Total_Meetings'] = len(acct_mtgs)
        else:
            row['First_Meeting_Date'] = None
            row['Total_Meetings'] = 0
        
        account_detail.append(row)
    
    account_detail_df = pd.DataFrame(account_detail)
    account_detail_df.to_excel(writer, sheet_name='5_AccountDetail', index=False)
    
    # Tab 6: Summary with Formulas
    summary_data = [
        {'Metric': 'STAGE DURATION METRICS', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'Days in Stage 1 (Discovery → SQO)', 'Count': len(valid_stage1), 
         'Mean': round(valid_stage1.mean(), 1) if len(valid_stage1) > 0 else '',
         'Median': round(valid_stage1.median(), 1) if len(valid_stage1) > 0 else '',
         'Formula': '=AVERAGEIF(\'2_Timeline\'!H:H,">0")'},
        {'Metric': 'Days in Stage 2 (SQO → Proposal)', 'Count': len(valid_stage2), 
         'Mean': round(valid_stage2.mean(), 1) if len(valid_stage2) > 0 else '',
         'Median': round(valid_stage2.median(), 1) if len(valid_stage2) > 0 else '',
         'Formula': '=AVERAGEIF(\'2_Timeline\'!I:I,">0")'},
        {'Metric': 'Days Stage 4 to Close', 'Count': len(qualifying_timeline[qualifying_timeline['Days_Stage_4_to_Close'] > 0]), 
         'Mean': round(qualifying_timeline[qualifying_timeline['Days_Stage_4_to_Close'] > 0]['Days_Stage_4_to_Close'].mean(), 1) if len(qualifying_timeline[qualifying_timeline['Days_Stage_4_to_Close'] > 0]) > 0 else '',
         'Median': '',
         'Formula': '=AVERAGEIF(\'2_Timeline\'!J:J,">0")'},
        {'Metric': '', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'MEETING COUNT METRICS', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'Meetings in Stage 1', 'Count': len(valid_stage1_meetings), 
         'Mean': round(valid_stage1_meetings.mean(), 1) if len(valid_stage1_meetings) > 0 else '',
         'Median': round(valid_stage1_meetings.median(), 1) if len(valid_stage1_meetings) > 0 else '',
         'Formula': '=AVERAGEIF(\'3_Stage1\'!E:E,">0")'},
        {'Metric': 'Meetings in Stage 2', 'Count': len(valid_stage2_meetings), 
         'Mean': round(valid_stage2_meetings.mean(), 1) if len(valid_stage2_meetings) > 0 else '',
         'Median': round(valid_stage2_meetings.median(), 1) if len(valid_stage2_meetings) > 0 else '',
         'Formula': '=AVERAGEIF(\'4_Stage2\'!E:E,">0")'},
        {'Metric': '', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'MEETING TYPE COUNTS (Stage 1)', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'Intro meetings', 'Count': stage1_df['Stage1_Intro'].sum(), 
         'Mean': round(stage1_df[stage1_df['Stage1_Intro'] > 0]['Stage1_Intro'].mean(), 1) if len(stage1_df[stage1_df['Stage1_Intro'] > 0]) > 0 else '',
         'Median': '', 'Formula': '=COUNTIF(\'1_Meetings\'!D:D,"Intro")'},
        {'Metric': 'Follow-up meetings', 'Count': stage1_df['Stage1_Follow-up'].sum() if 'Stage1_Follow-up' in stage1_df.columns else 0, 
         'Mean': '',
         'Median': '', 'Formula': '=COUNTIF(\'1_Meetings\'!D:D,"Follow-up")'},
        {'Metric': 'CAB discussions', 'Count': stage1_df['Stage1_CAB_Discussion'].sum(), 
         'Mean': '',
         'Median': '', 'Formula': '=COUNTIF(\'1_Meetings\'!D:D,"CAB Discussion")'},
        {'Metric': '', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'MEETING TYPE COUNTS (Stage 2)', 'Count': '', 'Mean': '', 'Median': '', 'Formula': ''},
        {'Metric': 'Demo meetings', 'Count': stage2_df['Stage2_Demo'].sum(), 
         'Mean': '',
         'Median': '', 'Formula': '=COUNTIF(\'1_Meetings\'!D:D,"Demo")'},
        {'Metric': 'Compliance/Contracting', 'Count': stage2_df['Stage2_Compliance_Contracting'].sum() if 'Stage2_Compliance_Contracting' in stage2_df.columns else 0, 
         'Mean': '',
         'Median': '', 'Formula': '=COUNTIF(\'1_Meetings\'!D:D,"Compliance/Contracting")'},
    ]
    
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_excel(writer, sheet_name='6_Summary', index=False)
    
    # Tab 7: Closed Accounts (from Sheet6 for validation)
    df_closed_clean = df_closed[df_closed['Days to Close'] > 0].copy()
    df_closed_clean.to_excel(writer, sheet_name='7_ClosedDeals', index=False)
    
    # Tab 8: Meeting Chronology - for detailed validation
    # Shows meetings per account in chronological order with sequence numbers
    meeting_chron = df_meetings.copy()
    meeting_chron = meeting_chron.sort_values(['Company / Account', 'Date'])
    meeting_chron['Meeting_Seq'] = meeting_chron.groupby('Company / Account').cumcount() + 1
    meeting_chron = meeting_chron[[
        'Company / Account', 'Meeting_Seq', 'Date', 'Subject', 
        'Meeting_Type', 'Assigned_Stage'
    ]]
    meeting_chron.to_excel(writer, sheet_name='8_MeetingChronology', index=False)
    
    # Tab 9: Validated Accounts - accounts with both meeting data and stage progression
    # These are the accounts with the best data for analysis
    validated = []
    for acct in qualifying_timeline['Account'].unique():
        tl = qualifying_timeline[qualifying_timeline['Account'] == acct].iloc[0]
        
        # Find meetings for this account
        acct_meetings = df_meetings[df_meetings['Company / Account'].str.lower() == acct.lower()]
        if len(acct_meetings) == 0:
            # Try fuzzy match
            acct_meetings = df_meetings[df_meetings['Company / Account'].str.lower().str.contains(normalize_name(acct)[:5], na=False)]
        
        s1_meetings = acct_meetings[acct_meetings['Assigned_Stage'] == 'Stage 1']
        s2_meetings = acct_meetings[acct_meetings['Assigned_Stage'] == 'Stage 2']
        
        # Only include accounts with at least 1 meeting in Stage 1 or Stage 2
        if len(s1_meetings) > 0 or len(s2_meetings) > 0:
            validated.append({
                'Account': acct,
                'Stage_1_Start': tl['Stage_1_Date'],
                'Stage_2_Start': tl['Stage_2_Date'],
                'Days_Stage_1': tl['Days_Stage_1_to_2'],
                'Stage_1_Meetings': len(s1_meetings),
                'Stage_1_Types': ', '.join(s1_meetings['Meeting_Type'].unique()),
                'Stage_2_Start_': tl['Stage_2_Date'],
                'Stage_4_Start': tl['Stage_4_Date'],
                'Days_Stage_2': tl['Days_Stage_2_to_4'],
                'Stage_2_Meetings': len(s2_meetings),
                'Stage_2_Types': ', '.join(s2_meetings['Meeting_Type'].unique()),
                'Close_Date': tl['Close_Won_Date'],
                'Total_Meetings': len(acct_meetings),
            })
    
    validated_df = pd.DataFrame(validated)
    validated_df.to_excel(writer, sheet_name='9_ValidatedAccounts', index=False)

print(f"\n  Workbook saved to: {output_path}")
print("\n  Tabs created:")
print("    1_Raw_Meetings - All meetings with classification and stage assignment")
print("    2_Account_Timeline - Stage entry dates and durations")
print("    3_Stage_1_Analysis - Meeting counts by type during Stage 1")
print("    4_Stage_2_Analysis - Meeting counts by type during Stage 2")
print("    5_Summary_Metrics - Aggregated averages")
print("    6_Closed_Accounts - Validation data from Sheet6")

print("\n[STEP 6] COMPLETE - Excel workbook created")

print("\n" + "="*80)
print("ANALYSIS COMPLETE")
print("="*80)

# Print validated accounts summary
print("\n  VALIDATED ACCOUNTS (accounts with both stage data and meeting data):")
validated_count = len([a for a in qualifying_timeline['Account'].unique() 
                       if len(df_meetings[(df_meetings['Company / Account'].str.lower() == a.lower()) & 
                                         (df_meetings['Assigned_Stage'].isin(['Stage 1', 'Stage 2']))]) > 0])
print(f"  Total: {validated_count} accounts")

# Show a few examples
print("\n  Best accounts for validation (meetings in Stage 1 AND Stage 2):")
for acct in qualifying_timeline['Account'].unique():
    acct_meetings = df_meetings[(df_meetings['Company / Account'].str.lower() == acct.lower())]
    s1 = len(acct_meetings[acct_meetings['Assigned_Stage'] == 'Stage 1'])
    s2 = len(acct_meetings[acct_meetings['Assigned_Stage'] == 'Stage 2'])
    if s1 > 0 and s2 > 0:
        tl = qualifying_timeline[qualifying_timeline['Account'] == acct].iloc[0]
        print(f"    {acct}: {s1} Stage 1 meetings, {s2} Stage 2 meetings, "
              f"{tl['Days_Stage_1_to_2']:.0f} days in Stage 1")

print("\n  Workbook: /Users/keiganpesenti/Desktop/stage_aligned_workbook.xlsx")
print("  Tabs for validation:")
print("    - 9_ValidatedAccounts: Accounts with both stage progression AND meetings")
print("    - 8_MeetingChronology: All meetings in sequence per account")
print("    - 6_Summary: Formula-driven summary metrics")

