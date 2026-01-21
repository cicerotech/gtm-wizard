"""
Refined Stage-Aligned Sales Process Analysis v2
================================================
Clearer, self-explanatory output with traceable account references.

Sales Process Context (from GTM Brain):
- Stage 0 - Prospecting: Initial outreach, scheduling meeting
- Stage 1 - Discovery: First meeting held, discovering needs
- Stage 2 - SQO: Sales Qualified Opportunity, use cases identified
- Stage 3 - Pilot: Running pilot/POC
- Stage 4 - Proposal: Proposal sent, contract negotiation
- Stage 6: Closed Won
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*80)
print("REFINED STAGE-ALIGNED ANALYSIS v2")
print("Clearer Output with Traceable References")
print("="*80)

# =============================================================================
# STEP 1: LOAD AND CLEAN DATA
# =============================================================================
print("\n[STEP 1] Loading data...")

audit_file = '/Users/keiganpesenti/Desktop/latest audits v0.xlsx'
secondary_file = '/Users/keiganpesenti/Desktop/meetings with accounts.xlsx'

xl_audit = pd.ExcelFile(audit_file)
xl_secondary = pd.ExcelFile(secondary_file)

# Load data
df_accts = pd.read_excel(xl_audit, sheet_name='all accts')
df_meetings_audit = pd.read_excel(xl_audit, sheet_name='latest audits v0')
df_meetings_secondary = pd.read_excel(xl_secondary, sheet_name='all meetings')
df_opps = pd.read_excel(xl_audit, sheet_name='all opps')

# Combine meetings
df_meetings_raw = pd.concat([df_meetings_audit, df_meetings_secondary], ignore_index=True)

# Parse dates
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

# Clean opp data
df_opps['Last Stage Change Date'] = pd.to_datetime(df_opps['Last Stage Change Date'], errors='coerce')

print(f"  Meetings: {len(df_meetings)}")
print(f"  Validated accounts: {len(df_accts)}")

# =============================================================================
# STEP 2: SELECT VALIDATED ACCOUNTS WITH GOOD DATA
# =============================================================================
print("\n[STEP 2] Selecting validated accounts...")

def normalize_name(name):
    if pd.isna(name):
        return ''
    s = str(name).lower().strip()
    for suffix in [' inc', ' inc.', ' llc', ' ltd', ' limited', ' corp', ' corporation', ' plc', ' global', ' group']:
        if s.endswith(suffix):
            s = s[:-len(suffix)].strip()
    return s

# Build validated account info
validated_accounts = {}
for _, row in df_accts.iterrows():
    acct_name = row['Account Name']
    if pd.notna(acct_name):
        norm = normalize_name(acct_name)
        validated_accounts[norm] = {
            'name': acct_name,
            'first_meeting': pd.to_datetime(row['First Meeting Date']) if pd.notna(row['First Meeting Date']) else None,
            'first_close': pd.to_datetime(row['First Deal Closed']) if pd.notna(row['First Deal Closed']) else None,
        }

# Count meetings per account
df_meetings['_norm_acct'] = df_meetings['Company / Account'].apply(normalize_name)
meeting_counts = df_meetings.groupby('_norm_acct').size().to_dict()

# Select accounts with >= 5 meetings from validated list
selected_accounts = []
for norm, info in validated_accounts.items():
    mtg_count = meeting_counts.get(norm, 0)
    if mtg_count >= 5:
        info['meeting_count'] = mtg_count
        info['normalized'] = norm
        
        # Calculate sales cycle if we have both dates
        if info['first_meeting'] and info['first_close']:
            info['sales_cycle_days'] = (info['first_close'] - info['first_meeting']).days
        else:
            info['sales_cycle_days'] = None
        
        selected_accounts.append(info)

# Sort by meeting count
selected_accounts.sort(key=lambda x: x['meeting_count'], reverse=True)
selected_accounts = selected_accounts[:25]

print(f"  Selected {len(selected_accounts)} accounts with 5+ meetings")
for i, acct in enumerate(selected_accounts[:10], 1):
    cycle = f"{acct['sales_cycle_days']} days" if acct['sales_cycle_days'] else "N/A"
    print(f"    {i:2}. {acct['name'][:30]:30} | {acct['meeting_count']:3} meetings | Cycle: {cycle}")

# =============================================================================
# STEP 3: CLASSIFY MEETINGS IN CHRONOLOGICAL CONTEXT
# =============================================================================
print("\n[STEP 3] Classifying meetings in chronological context...")

def classify_meeting_in_context(subject, is_first_meeting):
    """Classify meeting based on subject AND position in sequence."""
    if pd.isna(subject):
        subject = ''
    s = str(subject).lower().strip()
    
    # First meeting with account = Intro (regardless of subject)
    if is_first_meeting:
        return 'Intro (First Meeting)'
    
    # Explicit intro keywords
    if 'intro' in s or 'introduction' in s:
        return 'Intro (Explicit)'
    
    # Demo/Product specific
    if 'demo' in s:
        return 'Demo'
    if 'sigma' in s or 'cortex' in s:
        return 'Product Demo'
    
    # CAB
    if 'cab' in s or 'customer advisory' in s or 'advisory board' in s:
        return 'CAB Discussion'
    
    # Scoping/Proposal prep
    if 'scoping' in s or 'scope' in s:
        return 'Scoping'
    if 'proposal' in s:
        return 'Proposal Discussion'
    if 'pricing' in s:
        return 'Pricing Discussion'
    
    # Compliance/Contracting (late stage)
    if 'compliance' in s:
        return 'Compliance Review'
    if 'contract' in s or 'redline' in s or 'msa' in s:
        return 'Contracting'
    
    # Pilot
    if 'pilot' in s or 'poc' in s or 'kickoff' in s:
        return 'Pilot/POC'
    
    # Security (late stage)
    if 'security' in s or 'infosec' in s:
        return 'Security Review'
    
    # Use case identification
    if 'use case' in s or 'requirements' in s:
        return 'Use Case Discovery'
    
    # Follow-up (default for subsequent meetings without specific keywords)
    if 'follow' in s:
        return 'Follow-up'
    
    # General/Unspecified
    return 'General Follow-up'

# Process each selected account
account_analysis = []
all_classified_meetings = []

for acct in selected_accounts:
    norm = acct['normalized']
    acct_name = acct['name']
    
    # Get meetings for this account, sorted by date
    acct_meetings = df_meetings[df_meetings['_norm_acct'] == norm].copy()
    acct_meetings = acct_meetings.sort_values('Date').reset_index(drop=True)
    
    if len(acct_meetings) == 0:
        continue
    
    # Classify each meeting
    for i, row in acct_meetings.iterrows():
        is_first = (i == acct_meetings.index[0])
        meeting_type = classify_meeting_in_context(row['Subject'], is_first)
        
        all_classified_meetings.append({
            'Account': acct_name,
            'Date': row['Date'],
            'Meeting_Number': acct_meetings.index.get_loc(i) + 1,
            'Subject': row['Subject'],
            'Meeting_Type': meeting_type,
        })
    
    # Build account summary
    type_counts = {}
    for mtg in all_classified_meetings:
        if mtg['Account'] == acct_name:
            mt = mtg['Meeting_Type']
            type_counts[mt] = type_counts.get(mt, 0) + 1
    
    account_analysis.append({
        'Account': acct_name,
        'Total_Meetings': acct['meeting_count'],
        'Sales_Cycle_Days': acct['sales_cycle_days'],
        'First_Meeting_Date': acct['first_meeting'],
        'Close_Date': acct['first_close'],
        'Intro_Meetings': type_counts.get('Intro (First Meeting)', 0) + type_counts.get('Intro (Explicit)', 0),
        'Follow_up_Meetings': type_counts.get('Follow-up', 0) + type_counts.get('General Follow-up', 0),
        'CAB_Discussions': type_counts.get('CAB Discussion', 0),
        'Demo_Meetings': type_counts.get('Demo', 0) + type_counts.get('Product Demo', 0),
        'Scoping_Meetings': type_counts.get('Scoping', 0) + type_counts.get('Use Case Discovery', 0),
        'Compliance_Meetings': type_counts.get('Compliance Review', 0),
        'Contracting_Meetings': type_counts.get('Contracting', 0),
        'Pilot_Meetings': type_counts.get('Pilot/POC', 0),
    })

analysis_df = pd.DataFrame(account_analysis)
meetings_df = pd.DataFrame(all_classified_meetings)

print(f"  Analyzed {len(analysis_df)} accounts, {len(meetings_df)} meetings")

# =============================================================================
# STEP 4: GET STAGE DURATION FROM OPP HISTORY
# =============================================================================
print("\n[STEP 4] Getting stage durations from opportunity history...")

# Normalize stage names
stage_mapping = {
    'stage 1 - discovery': 'Stage 1',
    'stage 2 - sqo': 'Stage 2',
    'stage 3 - pilot': 'Stage 3',
    'stage 4 - proposal': 'Stage 4',
}

df_opps['_norm_acct'] = df_opps['Account Name'].apply(normalize_name)
df_opps['To Stage Lower'] = df_opps['To Stage'].fillna('').str.lower().str.strip()

# Get days in stage for each account
for acct in account_analysis:
    norm = normalize_name(acct['Account'])
    acct_opps = df_opps[df_opps['_norm_acct'] == norm]
    
    for stage_col, stage_key in [
        ('Days_in_Stage_1', 'stage 2 - sqo'),  # Days in S1 = recorded when moving TO S2
        ('Days_in_Stage_2', 'stage 4 - proposal'),  # Days in S2 = recorded when moving TO S4
        ('Days_in_Stage_4', 'stage 6. closed(won)'),  # Days in S4 = recorded when moving TO Closed
    ]:
        stage_rows = acct_opps[acct_opps['To Stage Lower'] == stage_key]
        if len(stage_rows) > 0:
            days = stage_rows['Days in Stage'].max()
            acct[stage_col] = int(days) if pd.notna(days) else None
        else:
            acct[stage_col] = None

# Update dataframe
analysis_df = pd.DataFrame(account_analysis)

print("[STEP 4] COMPLETE")

# =============================================================================
# STEP 5: CREATE EXCEL WORKBOOK
# =============================================================================
print("\n[STEP 5] Creating Excel workbook...")

output_path = '/Users/keiganpesenti/Desktop/sales_process_analysis.xlsx'

with pd.ExcelWriter(output_path, engine='openpyxl', date_format='MM/DD/YYYY') as writer:
    
    # --- Tab 1: Summary ---
    # Build a clear, self-explanatory summary
    
    summary_rows = []
    
    # Section 1: What is this analysis?
    summary_rows.append({'Description': 'ANALYSIS OVERVIEW', 'Value': '', 'Accounts_Included': ''})
    summary_rows.append({'Description': 'Total accounts analyzed', 'Value': len(analysis_df), 'Accounts_Included': 'See Account Analysis tab'})
    summary_rows.append({'Description': 'Total meetings analyzed', 'Value': len(meetings_df), 'Accounts_Included': 'See Meeting Chronology tab'})
    summary_rows.append({'Description': 'Data source', 'Value': 'Validated closed customers with 5+ meetings', 'Accounts_Included': ''})
    summary_rows.append({'Description': '', 'Value': '', 'Accounts_Included': ''})
    
    # Section 2: Sales Cycle Duration
    summary_rows.append({'Description': 'SALES CYCLE DURATION (First Meeting → Close)', 'Value': '', 'Accounts_Included': ''})
    valid_cycles = analysis_df[analysis_df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
    if len(valid_cycles) > 0:
        summary_rows.append({
            'Description': 'Average days to close', 
            'Value': f"{valid_cycles.mean():.0f} days",
            'Accounts_Included': ', '.join(analysis_df[analysis_df['Sales_Cycle_Days'] > 0]['Account'].head(10).tolist())
        })
        summary_rows.append({
            'Description': 'Median days to close', 
            'Value': f"{valid_cycles.median():.0f} days",
            'Accounts_Included': f"Based on {len(valid_cycles)} accounts"
        })
        summary_rows.append({
            'Description': 'Fastest close', 
            'Value': f"{valid_cycles.min():.0f} days",
            'Accounts_Included': analysis_df.loc[analysis_df['Sales_Cycle_Days'].idxmin(), 'Account'] if len(valid_cycles) > 0 else ''
        })
        summary_rows.append({
            'Description': 'Longest close', 
            'Value': f"{valid_cycles.max():.0f} days",
            'Accounts_Included': analysis_df.loc[analysis_df['Sales_Cycle_Days'].idxmax(), 'Account'] if len(valid_cycles) > 0 else ''
        })
    summary_rows.append({'Description': '', 'Value': '', 'Accounts_Included': ''})
    
    # Section 3: Stage Durations
    summary_rows.append({'Description': 'STAGE DURATIONS (from Salesforce opportunity history)', 'Value': '', 'Accounts_Included': ''})
    
    for stage_col, stage_name, stage_desc in [
        ('Days_in_Stage_1', 'Stage 1 - Discovery', 'First meeting → Qualified (SQO)'),
        ('Days_in_Stage_2', 'Stage 2 - SQO', 'Qualified → Proposal sent'),
        ('Days_in_Stage_4', 'Stage 4 - Proposal', 'Proposal → Close'),
    ]:
        valid = analysis_df[analysis_df[stage_col] > 0][stage_col].dropna()
        if len(valid) > 0:
            accts_with_data = analysis_df[analysis_df[stage_col] > 0]['Account'].tolist()
            summary_rows.append({
                'Description': f'{stage_name}: {stage_desc}', 
                'Value': f"Avg {valid.mean():.0f} days, Median {valid.median():.0f} days",
                'Accounts_Included': f"{len(valid)} accounts: {', '.join(accts_with_data[:5])}" + ("..." if len(accts_with_data) > 5 else "")
            })
    summary_rows.append({'Description': '', 'Value': '', 'Accounts_Included': ''})
    
    # Section 4: Meeting Patterns
    summary_rows.append({'Description': 'MEETING PATTERNS (what types of meetings and how many)', 'Value': '', 'Accounts_Included': ''})
    summary_rows.append({'Description': '', 'Value': '', 'Accounts_Included': ''})
    summary_rows.append({'Description': 'Meeting Type', 'Value': 'Avg per Account | Total', 'Accounts_Included': 'Accounts with this meeting type'})
    
    for mt_col, mt_name, mt_desc in [
        ('Intro_Meetings', 'Intro Meetings', 'First meeting with account OR subject contains "intro"'),
        ('Follow_up_Meetings', 'Follow-up Meetings', 'General follow-ups, exploration calls'),
        ('CAB_Discussions', 'CAB Discussions', 'Customer Advisory Board meetings'),
        ('Demo_Meetings', 'Demo Meetings', 'Product demos, platform walkthroughs'),
        ('Scoping_Meetings', 'Scoping/Use Case', 'Scoping calls, use case identification'),
        ('Compliance_Meetings', 'Compliance Reviews', 'Compliance-related discussions'),
        ('Contracting_Meetings', 'Contracting', 'Contract reviews, redlining, MSA'),
        ('Pilot_Meetings', 'Pilot/POC', 'Pilot kickoffs, POC discussions'),
    ]:
        valid = analysis_df[analysis_df[mt_col] > 0][mt_col]
        if len(valid) > 0:
            total = int(valid.sum())
            avg = valid.mean()
            accts = analysis_df[analysis_df[mt_col] > 0]['Account'].tolist()
            summary_rows.append({
                'Description': f'{mt_name}', 
                'Value': f"{avg:.1f} avg | {total} total",
                'Accounts_Included': f"{len(accts)} accounts: {', '.join(accts[:5])}" + ("..." if len(accts) > 5 else "")
            })
        else:
            summary_rows.append({
                'Description': f'{mt_name}', 
                'Value': '0',
                'Accounts_Included': 'None found'
            })
    
    summary_rows.append({'Description': '', 'Value': '', 'Accounts_Included': ''})
    summary_rows.append({'Description': 'NOTE: Meeting classification based on subject line keywords + chronological position.', 'Value': '', 'Accounts_Included': ''})
    summary_rows.append({'Description': 'The first meeting with any account is classified as Intro regardless of subject.', 'Value': '', 'Accounts_Included': ''})
    
    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_excel(writer, sheet_name='1_Summary', index=False)
    
    # --- Tab 2: Account Analysis ---
    # Show each account with all their metrics
    account_output = analysis_df[[
        'Account', 'Total_Meetings', 'Sales_Cycle_Days',
        'First_Meeting_Date', 'Close_Date',
        'Days_in_Stage_1', 'Days_in_Stage_2', 'Days_in_Stage_4',
        'Intro_Meetings', 'Follow_up_Meetings', 'CAB_Discussions',
        'Demo_Meetings', 'Scoping_Meetings', 'Compliance_Meetings', 
        'Contracting_Meetings', 'Pilot_Meetings'
    ]].copy()
    
    # Format dates
    account_output['First_Meeting_Date'] = pd.to_datetime(account_output['First_Meeting_Date']).dt.strftime('%m/%d/%Y')
    account_output['Close_Date'] = pd.to_datetime(account_output['Close_Date']).dt.strftime('%m/%d/%Y')
    
    account_output.to_excel(writer, sheet_name='2_Account_Analysis', index=False)
    
    # --- Tab 3: Meeting Chronology ---
    # Show every meeting in order for validation
    meetings_output = meetings_df.copy()
    meetings_output['Date'] = pd.to_datetime(meetings_output['Date']).dt.strftime('%m/%d/%Y')
    meetings_output = meetings_output.sort_values(['Account', 'Meeting_Number'])
    meetings_output.to_excel(writer, sheet_name='3_Meeting_Chronology', index=False)
    
    # --- Tab 4: Methodology ---
    methodology = [
        {'Section': 'DATA SOURCES', 'Details': ''},
        {'Section': 'Primary', 'Details': 'latest audits v0.xlsx - all accts tab (validated customers)'},
        {'Section': 'Meetings', 'Details': 'Combined from latest audits v0.xlsx + meetings with accounts.xlsx'},
        {'Section': 'Opportunity history', 'Details': 'latest audits v0.xlsx - all opps tab'},
        {'Section': '', 'Details': ''},
        {'Section': 'ACCOUNT SELECTION', 'Details': ''},
        {'Section': 'Criteria', 'Details': 'Validated closed customers with 5+ meetings'},
        {'Section': 'Count', 'Details': f'{len(selected_accounts)} accounts selected'},
        {'Section': '', 'Details': ''},
        {'Section': 'MEETING CLASSIFICATION RULES', 'Details': ''},
        {'Section': 'Intro (First Meeting)', 'Details': 'Chronologically first meeting with the account'},
        {'Section': 'Intro (Explicit)', 'Details': 'Subject contains "intro" or "introduction"'},
        {'Section': 'Demo', 'Details': 'Subject contains "demo"'},
        {'Section': 'Product Demo', 'Details': 'Subject contains "sigma" or "cortex"'},
        {'Section': 'CAB Discussion', 'Details': 'Subject contains "cab", "customer advisory", or "advisory board"'},
        {'Section': 'Scoping', 'Details': 'Subject contains "scoping" or "scope"'},
        {'Section': 'Use Case Discovery', 'Details': 'Subject contains "use case" or "requirements"'},
        {'Section': 'Compliance Review', 'Details': 'Subject contains "compliance"'},
        {'Section': 'Contracting', 'Details': 'Subject contains "contract", "redline", or "msa"'},
        {'Section': 'Pilot/POC', 'Details': 'Subject contains "pilot", "poc", or "kickoff"'},
        {'Section': 'Follow-up', 'Details': 'Subject contains "follow"'},
        {'Section': 'General Follow-up', 'Details': 'Default for meetings that dont match specific keywords'},
        {'Section': '', 'Details': ''},
        {'Section': 'STAGE DURATION NOTES', 'Details': ''},
        {'Section': 'Source', 'Details': '"Days in Stage" from Salesforce opportunity history'},
        {'Section': 'Stage 1 duration', 'Details': 'Recorded when opportunity moves TO Stage 2'},
        {'Section': 'Stage 2 duration', 'Details': 'Recorded when opportunity moves TO Stage 4'},
        {'Section': 'Stage 4 duration', 'Details': 'Recorded when opportunity moves TO Closed Won'},
        {'Section': '', 'Details': ''},
        {'Section': 'SALES PROCESS CONTEXT (from GTM Brain)', 'Details': ''},
        {'Section': 'Stage 0 - Prospecting', 'Details': 'Initial outreach, scheduling meeting'},
        {'Section': 'Stage 1 - Discovery', 'Details': 'First meeting held, discovering needs'},
        {'Section': 'Stage 2 - SQO', 'Details': 'Sales Qualified Opportunity, use cases identified'},
        {'Section': 'Stage 3 - Pilot', 'Details': 'Running pilot/POC'},
        {'Section': 'Stage 4 - Proposal', 'Details': 'Proposal sent, contract negotiation'},
        {'Section': 'Stage 6 - Closed Won', 'Details': 'Contract signed'},
    ]
    
    methodology_df = pd.DataFrame(methodology)
    methodology_df.to_excel(writer, sheet_name='4_Methodology', index=False)

print(f"\n  Workbook saved: {output_path}")
print("\n  Tabs:")
print("    1_Summary - Clear metrics with account references")
print("    2_Account_Analysis - Per-account detail")
print("    3_Meeting_Chronology - Every meeting in sequence")
print("    4_Methodology - Classification rules and context")

print("\n" + "="*80)
print("ANALYSIS COMPLETE")
print("="*80)
print(f"\nOutput: {output_path}")

