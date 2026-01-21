"""
Sales Sub-Steps Analysis v3
===========================
Aligned to user's manual data structure:
- Account-level columns showing days between each sub-stage
- Traceable to source data
- Focus accounts: Ecolab, Bayer, BNY, Pure Storage, Amazon, ServiceNow, Petsmart
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*80)
print("SALES SUB-STEPS ANALYSIS v3")
print("Account-Level Breakdown with Traceability")
print("="*80)

# =============================================================================
# LOAD DATA
# =============================================================================
print("\n[STEP 1] Loading data...")

audit_file = '/Users/keiganpesenti/Desktop/latest audits v0.xlsx'
secondary_file = '/Users/keiganpesenti/Desktop/meetings with accounts.xlsx'

xl_audit = pd.ExcelFile(audit_file)
xl_secondary = pd.ExcelFile(secondary_file)

df_accts = pd.read_excel(xl_audit, sheet_name='all accts')
df_meetings_audit = pd.read_excel(xl_audit, sheet_name='latest audits v0')
df_meetings_secondary = pd.read_excel(xl_secondary, sheet_name='all meetings')
df_opps = pd.read_excel(xl_audit, sheet_name='all opps')

# Combine and clean meetings
df_meetings_raw = pd.concat([df_meetings_audit, df_meetings_secondary], ignore_index=True)
df_meetings_raw['Date'] = pd.to_datetime(df_meetings_raw['Date'], errors='coerce')
df_meetings_raw['Date_Only'] = df_meetings_raw['Date'].dt.date

# Deduplicate
df_meetings_raw['_key'] = (
    df_meetings_raw['Company / Account'].fillna('').str.lower().str.strip() + '|' +
    df_meetings_raw['Date_Only'].astype(str) + '|' +
    df_meetings_raw['Subject'].fillna('').str.lower().str.strip()
)
df_meetings = df_meetings_raw.drop_duplicates(subset='_key', keep='first').copy()
df_meetings = df_meetings[df_meetings['Date'] >= '2020-01-01'].copy()

# Exclude test accounts
test_patterns = ['event triage', 'johnson hana', 'jhi', 'eudia', 'test account']
df_meetings['_acct_lower'] = df_meetings['Company / Account'].fillna('').str.lower().str.strip()
for pattern in test_patterns:
    df_meetings = df_meetings[~df_meetings['_acct_lower'].str.contains(pattern, na=False)]

print(f"  Meetings loaded: {len(df_meetings)}")

# =============================================================================
# IDENTIFY TARGET ACCOUNTS (from user's screenshot + others with good data)
# =============================================================================
print("\n[STEP 2] Identifying target accounts...")

def normalize_name(name):
    if pd.isna(name):
        return ''
    s = str(name).lower().strip()
    for suffix in [' inc', ' inc.', ' llc', ' ltd', ' limited', ' corp', ' corporation', ' plc', ' global', ' group']:
        if s.endswith(suffix):
            s = s[:-len(suffix)].strip()
    return s

# Priority accounts from user's screenshot
priority_accounts = ['ecolab', 'bayer', 'bny mellon', 'pure storage', 'amazon', 'servicenow', 'petsmart']

# Get all accounts with 3+ meetings
df_meetings['_norm_acct'] = df_meetings['Company / Account'].apply(normalize_name)
account_counts = df_meetings.groupby('_norm_acct').size().reset_index(name='count')
accounts_with_data = account_counts[account_counts['count'] >= 3]['_norm_acct'].tolist()

print(f"  Priority accounts from screenshot: {len(priority_accounts)}")
print(f"  Total accounts with 3+ meetings: {len(accounts_with_data)}")

# =============================================================================
# CLASSIFY MEETINGS BY SUB-STEP
# =============================================================================
print("\n[STEP 3] Classifying meetings...")

def classify_substep(subject, meeting_number):
    """Classify meeting into sales process sub-step."""
    if pd.isna(subject):
        subject = ''
    s = str(subject).lower().strip()
    
    # First meeting = Intro
    if meeting_number == 1:
        return 'Intro'
    if 'intro' in s or 'introduction' in s:
        return 'Intro'
    
    # Demo / Product
    if any(kw in s for kw in ['demo', 'sigma', 'cortex', 'platform', 'walkthrough', 'product', 'eudia ai']):
        return 'Demo'
    
    # CAB
    if any(kw in s for kw in ['cab', 'customer advisory', 'advisory board']):
        return 'CAB'
    
    # Use Case
    if any(kw in s for kw in ['use case', 'use-case', 'requirements']):
        return 'UseCase'
    
    # Scoping
    if any(kw in s for kw in ['scoping', 'scope', 'pricing']):
        return 'Scoping'
    
    # Proposal
    if any(kw in s for kw in ['proposal', 'delivery plan']):
        return 'Proposal'
    
    # Compliance/Infosec
    if any(kw in s for kw in ['infosec', 'security', 'compliance']):
        return 'Compliance'
    
    # Contracting
    if any(kw in s for kw in ['contract', 'redline', 'msa', 'negotiation']):
        return 'Contracting'
    
    # Pilot
    if any(kw in s for kw in ['pilot', 'poc', 'kickoff']):
        return 'Pilot'
    
    # Follow-up
    return 'Follow-up'

# =============================================================================
# BUILD ACCOUNT-LEVEL METRICS
# =============================================================================
print("\n[STEP 4] Building account-level metrics...")

# Get validated info
validated_info = {}
for _, row in df_accts.iterrows():
    norm = normalize_name(row['Account Name'])
    validated_info[norm] = {
        'first_meeting': pd.to_datetime(row['First Meeting Date']) if pd.notna(row['First Meeting Date']) else None,
        'first_close': pd.to_datetime(row['First Deal Closed']) if pd.notna(row['First Deal Closed']) else None,
    }

# Process each account
account_data = []
all_meetings = []

for norm_acct in accounts_with_data:
    # Get meetings for this account
    acct_meetings = df_meetings[df_meetings['_norm_acct'] == norm_acct].copy()
    acct_meetings = acct_meetings.sort_values('Date').reset_index(drop=True)
    
    if len(acct_meetings) < 3:
        continue
    
    orig_name = acct_meetings['Company / Account'].iloc[0]
    
    # Classify meetings
    meeting_dates = {}
    for idx, row in acct_meetings.iterrows():
        meeting_num = idx + 1
        substep = classify_substep(row['Subject'], meeting_num)
        
        all_meetings.append({
            'Account': orig_name,
            'Meeting_Number': meeting_num,
            'Date': row['Date'],
            'Subject': row['Subject'],
            'Sub_Step': substep,
        })
        
        # Track dates by substep
        if substep not in meeting_dates:
            meeting_dates[substep] = []
        meeting_dates[substep].append(row['Date'])
    
    # Calculate metrics
    first_meeting = acct_meetings['Date'].min()
    
    record = {
        'Account': orig_name,
        'Normalized': norm_acct,
        'Is_Priority': 'Yes' if norm_acct in priority_accounts else 'No',
        'Total_Meetings': len(acct_meetings),
        'First_Meeting_Date': first_meeting,
    }
    
    # Validated close date
    if norm_acct in validated_info and validated_info[norm_acct]['first_close']:
        record['Close_Date'] = validated_info[norm_acct]['first_close']
        record['Total_Sales_Cycle'] = (validated_info[norm_acct]['first_close'] - first_meeting).days
    else:
        record['Close_Date'] = None
        record['Total_Sales_Cycle'] = None
    
    # Days to FIRST occurrence of each substep (from first meeting) and counts
    all_substeps = ['Intro', 'Follow-up', 'CAB', 'UseCase', 'Demo', 'Scoping', 'Proposal', 'Compliance', 'Contracting', 'Pilot']
    for substep in all_substeps:
        if substep in meeting_dates and len(meeting_dates[substep]) > 0:
            first_date = min(meeting_dates[substep])
            record[f'Days_to_{substep}'] = (first_date - first_meeting).days
            record[f'Date_{substep}'] = first_date
            record[f'Count_{substep}'] = len(meeting_dates[substep])
        else:
            record[f'Days_to_{substep}'] = None
            record[f'Date_{substep}'] = None
            record[f'Count_{substep}'] = 0
    
    # Calculate BETWEEN sub-steps (like user's screenshot)
    # First Meeting to Second Meeting
    if len(acct_meetings) >= 2:
        record['First_to_Second_Meeting'] = (acct_meetings.iloc[1]['Date'] - acct_meetings.iloc[0]['Date']).days
    else:
        record['First_to_Second_Meeting'] = None
    
    # Demo metrics
    if 'Demo' in meeting_dates and len(meeting_dates['Demo']) > 0:
        demo_dates = sorted(meeting_dates['Demo'])
        record['Days_to_First_Demo'] = (demo_dates[0] - first_meeting).days
        record['Demo_Count'] = len(demo_dates)
        if len(demo_dates) > 1:
            gaps = [(demo_dates[i+1] - demo_dates[i]).days for i in range(len(demo_dates)-1)]
            record['Avg_Days_Between_Demos'] = sum(gaps) / len(gaps)
        else:
            record['Avg_Days_Between_Demos'] = None
    else:
        record['Days_to_First_Demo'] = None
        record['Demo_Count'] = 0
        record['Avg_Days_Between_Demos'] = None
    
    account_data.append(record)

accounts_df = pd.DataFrame(account_data)
meetings_df = pd.DataFrame(all_meetings)

# Separate priority accounts
priority_df = accounts_df[accounts_df['Is_Priority'] == 'Yes'].copy()
other_df = accounts_df[accounts_df['Is_Priority'] == 'No'].copy()

print(f"  Total accounts analyzed: {len(accounts_df)}")
print(f"  Priority accounts found: {len(priority_df)}")
print(f"  Priority accounts: {priority_df['Account'].tolist()}")

# =============================================================================
# CREATE EXCEL WORKBOOK
# =============================================================================
print("\n[STEP 5] Creating Excel workbook...")

output_path = '/Users/keiganpesenti/Desktop/sales_substeps_v3.xlsx'

with pd.ExcelWriter(output_path, engine='openpyxl', date_format='MM/DD/YYYY') as writer:
    
    # --- Tab 1: Days Between Sub-stages by Account (clean matrix, no redundant columns) ---
    
    # Get priority accounts + more accounts with good data (expand the view)
    focus_accounts = priority_df['Account'].tolist()
    # Add more accounts sorted by meeting count
    other_sorted = other_df.nlargest(20, 'Total_Meetings')['Account'].tolist()
    all_focus = focus_accounts + [a for a in other_sorted if a not in focus_accounts]
    # Limit to reasonable width
    all_focus = all_focus[:18]
    
    # Build matrix (clean - no redundant Accounts_Included column)
    matrix_rows = []
    
    matrix_rows.append({'Sub_Stage': 'DAYS FROM FIRST MEETING TO SUB-STEP'} | {a: '' for a in all_focus} | {'Average': '', 'Count': ''})
    
    substep_labels = [
        ('First_to_Second_Meeting', 'First → Second Meeting'),
        ('Days_to_Follow-up', 'First → Follow-up'),
        ('Days_to_CAB', 'First → CAB Discussion'),
        ('Days_to_UseCase', 'First → Use Case ID'),
        ('Days_to_Demo', 'First → Demo'),
        ('Days_to_Scoping', 'First → Scoping'),
        ('Days_to_Proposal', 'First → Proposal'),
        ('Days_to_Contracting', 'First → Contracting'),
    ]
    
    for col, label in substep_labels:
        row = {'Sub_Stage': label}
        values = []
        
        for acct in all_focus:
            acct_row = accounts_df[accounts_df['Account'] == acct]
            if len(acct_row) > 0 and col in acct_row.columns:
                val = acct_row.iloc[0][col]
                if pd.notna(val) and val >= 0:
                    row[acct] = int(val)
                    values.append(val)
                else:
                    row[acct] = '-'
            else:
                row[acct] = '-'
        
        row['Average'] = round(sum(values) / len(values), 0) if values else '-'
        row['Count'] = len(values)  # How many accounts have this data
        matrix_rows.append(row)
    
    # Blank row
    matrix_rows.append({'Sub_Stage': ''} | {a: '' for a in all_focus} | {'Average': '', 'Count': ''})
    
    # Meeting counts section
    matrix_rows.append({'Sub_Stage': 'MEETING COUNTS'} | {a: '' for a in all_focus} | {'Average': '', 'Count': ''})
    
    for col, label in [
        ('Total_Meetings', 'Total Meetings'),
        ('Demo_Count', 'Demo Meetings'),
        ('Count_CAB', 'CAB Discussions'),
        ('Count_Scoping', 'Scoping Meetings'),
        ('Count_Contracting', 'Contracting Meetings'),
        ('Count_Compliance', 'Compliance Meetings'),
    ]:
        row = {'Sub_Stage': label}
        values = []
        
        for acct in all_focus:
            acct_row = accounts_df[accounts_df['Account'] == acct]
            if len(acct_row) > 0 and col in acct_row.columns:
                val = acct_row.iloc[0][col]
                if pd.notna(val) and val > 0:
                    row[acct] = int(val)
                    values.append(val)
                else:
                    row[acct] = 0
            else:
                row[acct] = 0
        
        row['Average'] = round(sum(values) / len(values), 1) if values else '-'
        row['Count'] = len([v for v in values if v > 0])
        matrix_rows.append(row)
    
    # Blank row
    matrix_rows.append({'Sub_Stage': ''} | {a: '' for a in all_focus} | {'Average': '', 'Count': ''})
    
    # Sales cycle section
    matrix_rows.append({'Sub_Stage': 'SALES CYCLE'} | {a: '' for a in all_focus} | {'Average': '', 'Count': ''})
    
    row = {'Sub_Stage': 'First Meeting → Close (days)'}
    values = []
    for acct in all_focus:
        acct_row = accounts_df[accounts_df['Account'] == acct]
        if len(acct_row) > 0:
            val = acct_row.iloc[0]['Total_Sales_Cycle']
            if pd.notna(val) and val > 0:
                row[acct] = int(val)
                values.append(val)
            else:
                row[acct] = '-'
        else:
            row[acct] = '-'
    row['Average'] = round(sum(values) / len(values), 0) if values else '-'
    row['Count'] = len(values)
    matrix_rows.append(row)
    
    matrix_df = pd.DataFrame(matrix_rows)
    matrix_df.to_excel(writer, sheet_name='1_SubStage_Matrix', index=False)
    
    # --- Tab 2: Account Detail (full data for validation) ---
    detail_cols = ['Account', 'Is_Priority', 'Total_Meetings', 'First_Meeting_Date', 'Close_Date', 'Total_Sales_Cycle',
                   'First_to_Second_Meeting', 'Days_to_Follow-up', 'Days_to_CAB', 'Days_to_UseCase',
                   'Days_to_Demo', 'Demo_Count', 'Days_to_Scoping', 'Days_to_Proposal', 
                   'Days_to_Compliance', 'Days_to_Contracting']
    detail_cols = [c for c in detail_cols if c in accounts_df.columns]
    
    detail_output = accounts_df[detail_cols].copy()
    detail_output['First_Meeting_Date'] = pd.to_datetime(detail_output['First_Meeting_Date']).dt.strftime('%m/%d/%Y')
    detail_output['Close_Date'] = pd.to_datetime(detail_output['Close_Date']).dt.strftime('%m/%d/%Y')
    detail_output = detail_output.sort_values(['Is_Priority', 'Total_Meetings'], ascending=[False, False])
    detail_output.to_excel(writer, sheet_name='2_Account_Detail', index=False)
    
    # --- Tab 3: Meeting Chronology (source data for validation) ---
    meetings_output = meetings_df.copy()
    meetings_output['Date'] = pd.to_datetime(meetings_output['Date']).dt.strftime('%m/%d/%Y')
    meetings_output = meetings_output.sort_values(['Account', 'Meeting_Number'])
    meetings_output.to_excel(writer, sheet_name='3_Meeting_Source', index=False)
    
    # --- Tab 4: Summary Stats (structured format with separate columns, accounts listed) ---
    summary_rows = []
    
    # Helper to get accounts with valid values for a column
    def get_accounts_with_data(df, col, condition='> 0'):
        if condition == '>= 0':
            mask = df[col] >= 0
        elif condition == '> 0':
            mask = df[col] > 0
        else:
            mask = df[col].notna()
        return df[mask]['Account'].tolist()
    
    # === SECTION 1: Overview ===
    summary_rows.append({'Category': 'DATA OVERVIEW', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    summary_rows.append({'Category': '', 'Metric': 'Total accounts analyzed', 'Average': len(accounts_df), 'Sample_n': '', 'Median': '', 'Accounts_Included': 'See 2_Account_Detail tab', 'Notes': 'Accounts with 3+ meetings'})
    summary_rows.append({'Category': '', 'Metric': 'Total meetings analyzed', 'Average': len(meetings_df), 'Sample_n': '', 'Median': '', 'Accounts_Included': 'See 3_Meeting_Source tab', 'Notes': 'Deduplicated, since 2020'})
    closed_accts = accounts_df[accounts_df['Total_Sales_Cycle'] > 0]['Account'].tolist()
    summary_rows.append({'Category': '', 'Metric': 'Closed deals in dataset', 'Average': len(closed_accts), 'Sample_n': '', 'Median': '', 'Accounts_Included': ', '.join(closed_accts), 'Notes': 'Accounts with validated close date'})
    summary_rows.append({'Category': '', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    # === SECTION 2: Sales Cycle ===
    summary_rows.append({'Category': 'SALES CYCLE (days)', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    valid_cycle = accounts_df[accounts_df['Total_Sales_Cycle'] > 0]['Total_Sales_Cycle'].dropna()
    cycle_accts = get_accounts_with_data(accounts_df, 'Total_Sales_Cycle', '> 0')
    if len(valid_cycle) > 0:
        summary_rows.append({'Category': '', 'Metric': 'First Meeting → Close', 'Average': round(valid_cycle.mean(), 0), 'Sample_n': len(valid_cycle), 'Median': round(valid_cycle.median(), 0), 'Accounts_Included': ', '.join(cycle_accts), 'Notes': 'Use median for forecasting'})
        fastest_acct = accounts_df.loc[accounts_df['Total_Sales_Cycle'].idxmin(), 'Account']
        fastest_days = int(valid_cycle.min())
        longest_acct = accounts_df.loc[accounts_df['Total_Sales_Cycle'].idxmax(), 'Account']
        longest_days = int(valid_cycle.max())
        summary_rows.append({'Category': '', 'Metric': 'Fastest close', 'Average': fastest_days, 'Sample_n': 1, 'Median': '', 'Accounts_Included': fastest_acct, 'Notes': ''})
        summary_rows.append({'Category': '', 'Metric': 'Longest close', 'Average': longest_days, 'Sample_n': 1, 'Median': '', 'Accounts_Included': longest_acct, 'Notes': ''})
    summary_rows.append({'Category': '', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    # === SECTION 3: Time to Key Milestones ===
    summary_rows.append({'Category': 'TIME TO MILESTONE (days from first meeting)', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    milestone_cols = [
        ('First_to_Second_Meeting', 'First → Second Meeting', 'Engagement velocity indicator'),
        ('Days_to_Demo', 'First → Demo', 'Key: faster demo = faster qualification'),
        ('Days_to_CAB', 'First → CAB Discussion', 'Champion identification milestone'),
        ('Days_to_UseCase', 'First → Use Case ID', 'Requirements gathering'),
        ('Days_to_Scoping', 'First → Scoping/Pricing', 'Moving toward proposal'),
        ('Days_to_Proposal', 'First → Proposal', 'Deal stage progression'),
        ('Days_to_Contracting', 'First → Contracting', 'Late stage - near close'),
        ('Days_to_Compliance', 'First → Compliance/Infosec', 'Security review milestone'),
    ]
    
    for col, label, note in milestone_cols:
        if col in accounts_df.columns:
            valid = accounts_df[accounts_df[col] >= 0][col].dropna()
            accts = get_accounts_with_data(accounts_df, col, '>= 0')
            if len(valid) > 0:
                summary_rows.append({
                    'Category': '', 
                    'Metric': label, 
                    'Average': round(valid.mean(), 0), 
                    'Sample_n': len(valid), 
                    'Median': round(valid.median(), 0), 
                    'Accounts_Included': ', '.join(accts[:15]) + ('...' if len(accts) > 15 else ''), 
                    'Notes': note
                })
    summary_rows.append({'Category': '', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    # === SECTION 4: Demo Metrics ===
    summary_rows.append({'Category': 'DEMO METRICS', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    valid_demo_days = accounts_df[accounts_df['Days_to_First_Demo'] >= 0]['Days_to_First_Demo'].dropna()
    demo_days_accts = get_accounts_with_data(accounts_df, 'Days_to_First_Demo', '>= 0')
    if len(valid_demo_days) > 0:
        summary_rows.append({'Category': '', 'Metric': 'Days to first demo', 'Average': round(valid_demo_days.mean(), 0), 'Sample_n': len(valid_demo_days), 'Median': round(valid_demo_days.median(), 0), 'Accounts_Included': ', '.join(demo_days_accts[:15]) + ('...' if len(demo_days_accts) > 15 else ''), 'Notes': 'Target: Reduce to accelerate pipeline'})
    
    valid_demo_count = accounts_df[accounts_df['Demo_Count'] > 0]['Demo_Count']
    demo_count_accts = get_accounts_with_data(accounts_df, 'Demo_Count', '> 0')
    if len(valid_demo_count) > 0:
        summary_rows.append({'Category': '', 'Metric': 'Demos per account', 'Average': round(valid_demo_count.mean(), 1), 'Sample_n': len(valid_demo_count), 'Median': round(valid_demo_count.median(), 0), 'Accounts_Included': ', '.join(demo_count_accts[:15]) + ('...' if len(demo_count_accts) > 15 else ''), 'Notes': 'Resource planning for qualified opps'})
        max_demo_acct = accounts_df.loc[accounts_df['Demo_Count'].idxmax(), 'Account']
        max_demos = int(valid_demo_count.max())
        summary_rows.append({'Category': '', 'Metric': 'Max demos (single account)', 'Average': max_demos, 'Sample_n': 1, 'Median': '', 'Accounts_Included': max_demo_acct, 'Notes': 'Potential outlier for averaging'})
    
    valid_demo_gap = accounts_df[accounts_df['Avg_Days_Between_Demos'] > 0]['Avg_Days_Between_Demos'].dropna()
    demo_gap_accts = get_accounts_with_data(accounts_df, 'Avg_Days_Between_Demos', '> 0')
    if len(valid_demo_gap) > 0:
        summary_rows.append({'Category': '', 'Metric': 'Days between demos', 'Average': round(valid_demo_gap.mean(), 0), 'Sample_n': len(valid_demo_gap), 'Median': round(valid_demo_gap.median(), 0), 'Accounts_Included': ', '.join(demo_gap_accts[:10]) + ('...' if len(demo_gap_accts) > 10 else ''), 'Notes': 'Accounts with 2+ demos only'})
    summary_rows.append({'Category': '', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    # === SECTION 5: Meeting Volume ===
    summary_rows.append({'Category': 'MEETING COUNTS (per account)', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    meeting_cols = [
        ('Count_Intro', 'Intro meetings', 'First engagement'),
        ('Count_Follow-up', 'Follow-up meetings', 'Ongoing nurture'),
        ('Count_CAB', 'CAB discussions', 'Champion alignment'),
        ('Count_UseCase', 'Use case meetings', 'Requirements'),
        ('Demo_Count', 'Demo/Product meetings', 'Product engagement'),
        ('Count_Scoping', 'Scoping meetings', 'Deal sizing'),
        ('Count_Proposal', 'Proposal discussions', 'Closing activities'),
        ('Count_Compliance', 'Compliance meetings', 'Security/legal'),
        ('Count_Contracting', 'Contracting meetings', 'Final negotiations'),
    ]
    
    for col, label, note in meeting_cols:
        if col in accounts_df.columns:
            all_vals = accounts_df[col]
            accts_with = accounts_df[accounts_df[col] > 0]['Account'].tolist()
            if all_vals.sum() > 0:
                summary_rows.append({
                    'Category': '', 
                    'Metric': label, 
                    'Average': round(all_vals.mean(), 1), 
                    'Sample_n': len(accts_with), 
                    'Median': round(all_vals[all_vals > 0].median(), 0) if len(accts_with) > 0 else '', 
                    'Accounts_Included': ', '.join(accts_with[:12]) + ('...' if len(accts_with) > 12 else ''), 
                    'Notes': f'{note} | Total: {int(all_vals.sum())}'
                })
    summary_rows.append({'Category': '', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    # === SECTION 6: Insights ===
    summary_rows.append({'Category': 'STARTUP INSIGHTS', 'Metric': '', 'Average': '', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': ''})
    
    if len(valid_cycle) > 0:
        summary_rows.append({'Category': '', 'Metric': 'Pipeline coverage needed', 'Average': f'{int(valid_cycle.median() * 2)} days', 'Sample_n': '', 'Median': '', 'Accounts_Included': '', 'Notes': f'2x median cycle ({int(valid_cycle.median())} days)'})
    
    if len(valid_demo_days) > 0:
        demo_rate = len(valid_demo_days) / len(accounts_df) * 100
        summary_rows.append({'Category': '', 'Metric': 'Demo conversion rate', 'Average': f'{demo_rate:.0f}%', 'Sample_n': len(valid_demo_days), 'Median': '', 'Accounts_Included': f'{len(valid_demo_days)} of {len(accounts_df)} accounts', 'Notes': 'Optimize first meeting to demo'})
    
    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_excel(writer, sheet_name='4_Summary', index=False)
    
    # --- Tab 5: Methodology ---
    methodology = [
        {'Item': 'DATA SOURCES', 'Details': ''},
        {'Item': 'Meetings', 'Details': 'latest audits v0.xlsx + meetings with accounts.xlsx (combined, deduplicated)'},
        {'Item': 'Validated dates', 'Details': 'latest audits v0.xlsx - all accts tab (First Meeting Date, First Deal Closed)'},
        {'Item': '', 'Details': ''},
        {'Item': 'HOW DAYS ARE CALCULATED', 'Details': ''},
        {'Item': 'Days to [Sub-Step]', 'Details': 'Date of FIRST occurrence of that sub-step MINUS date of first meeting with account'},
        {'Item': 'First to Second Meeting', 'Details': 'Date of 2nd meeting MINUS date of 1st meeting'},
        {'Item': 'Total Sales Cycle', 'Details': 'Close Date (from validated data) MINUS First Meeting Date'},
        {'Item': '', 'Details': ''},
        {'Item': 'SUB-STEP CLASSIFICATION KEYWORDS', 'Details': ''},
        {'Item': 'Intro', 'Details': 'First meeting chronologically, OR subject contains "intro"'},
        {'Item': 'Follow-up', 'Details': 'Default for meetings 2+ without specific keywords'},
        {'Item': 'CAB', 'Details': '"cab", "customer advisory", "advisory board"'},
        {'Item': 'UseCase', 'Details': '"use case", "requirements"'},
        {'Item': 'Demo', 'Details': '"demo", "sigma", "cortex", "platform", "walkthrough", "product"'},
        {'Item': 'Scoping', 'Details': '"scoping", "scope", "pricing"'},
        {'Item': 'Proposal', 'Details': '"proposal", "delivery plan"'},
        {'Item': 'Compliance', 'Details': '"infosec", "security", "compliance"'},
        {'Item': 'Contracting', 'Details': '"contract", "redline", "msa", "negotiation"'},
        {'Item': '', 'Details': ''},
        {'Item': 'VALIDATION', 'Details': ''},
        {'Item': 'To validate any metric', 'Details': '1. Find account in 2_Account_Detail tab'},
        {'Item': '', 'Details': '2. Filter 3_Meeting_Source by that account'},
        {'Item': '', 'Details': '3. Check meeting dates and classifications match'},
        {'Item': 'To override', 'Details': 'Update classifications in 3_Meeting_Source and re-run analysis'},
    ]
    
    methodology_df = pd.DataFrame(methodology)
    methodology_df.to_excel(writer, sheet_name='5_Methodology', index=False)

print(f"\n  Workbook saved: {output_path}")
print("\n  Tabs:")
print("    1_SubStage_Matrix - Account columns with days to each sub-stage (like your screenshot)")
print("    2_Account_Detail - Full account metrics for validation")
print("    3_Meeting_Source - Raw meeting data to trace back")
print("    4_Summary - Summary stats with account lists")
print("    5_Methodology - How calculations work")

print("\n" + "="*80)
print("ANALYSIS COMPLETE")
print("="*80)

# Print priority accounts found
print("\nPriority accounts from your screenshot:")
for _, row in priority_df.iterrows():
    demo_days = row.get('Days_to_First_Demo', 'N/A')
    demo_days_str = f"{int(demo_days)}" if pd.notna(demo_days) and demo_days >= 0 else 'N/A'
    print(f"  {row['Account']}: {row['Total_Meetings']} meetings, {demo_days_str} days to first demo")

