"""
Sales Sub-Steps Analysis
========================
Aligned to the Zack Bible sales process structure:

STAGE 1 - DISCOVERY:
- Meeting 1: Intro (CLO engagement)
- Follow-up 1, Follow-up 2
- Meeting 2a: CAB Discussion (position CLO as advisor, identify champion)
- Meeting 2b: Use case identification (identify use cases, landing path)

STAGE 2 - SQO:
- Meeting 3: Products overview / Demo
- Scoping, pricing, delivery assessment (internal)

STAGE 4 - PROPOSAL:
- Meeting 4: Proposal and delivery plan
- Deal desk, Infosec, followups
- Share proposal / negotiations

Focus: Days between sub-steps, not just stage totals
"""

import pandas as pd
import numpy as np
from datetime import datetime

print("="*80)
print("SALES SUB-STEPS ANALYSIS")
print("Aligned to Sales Process Bible")
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

# Combine meetings
df_meetings_raw = pd.concat([df_meetings_audit, df_meetings_secondary], ignore_index=True)

# Parse and clean
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

print(f"  Meetings: {len(df_meetings)}")

# =============================================================================
# IDENTIFY ACCOUNTS - Include more, segment legacy
# =============================================================================
print("\n[STEP 2] Identifying accounts...")

def normalize_name(name):
    if pd.isna(name):
        return ''
    s = str(name).lower().strip()
    for suffix in [' inc', ' inc.', ' llc', ' ltd', ' limited', ' corp', ' corporation', ' plc', ' global', ' group']:
        if s.endswith(suffix):
            s = s[:-len(suffix)].strip()
    return s

# Legacy accounts to segment separately (high volume, distort averages)
legacy_accounts = ['cargill', 'coherent', 'intuit', 'duracell', 'graybar electric', 'ecms']

# Get meeting counts per account
df_meetings['_norm_acct'] = df_meetings['Company / Account'].apply(normalize_name)
account_meeting_counts = df_meetings.groupby('_norm_acct').size().reset_index(name='meeting_count')

# Get validated info
validated_info = {}
for _, row in df_accts.iterrows():
    norm = normalize_name(row['Account Name'])
    validated_info[norm] = {
        'first_meeting': pd.to_datetime(row['First Meeting Date']) if pd.notna(row['First Meeting Date']) else None,
        'first_close': pd.to_datetime(row['First Deal Closed']) if pd.notna(row['First Deal Closed']) else None,
    }

# Build account list - include all accounts with 3+ meetings
all_accounts = []
for _, row in account_meeting_counts.iterrows():
    norm = row['_norm_acct']
    if row['meeting_count'] >= 3:
        is_legacy = norm in legacy_accounts
        is_validated = norm in validated_info
        
        # Get first meeting from data
        acct_meetings = df_meetings[df_meetings['_norm_acct'] == norm].sort_values('Date')
        first_mtg_date = acct_meetings['Date'].min() if len(acct_meetings) > 0 else None
        
        # Get original name
        orig_name = acct_meetings['Company / Account'].iloc[0] if len(acct_meetings) > 0 else norm
        
        all_accounts.append({
            'normalized': norm,
            'name': orig_name,
            'meeting_count': row['meeting_count'],
            'is_legacy': is_legacy,
            'is_validated': is_validated,
            'first_meeting_date': first_mtg_date,
            'close_date': validated_info.get(norm, {}).get('first_close'),
        })

print(f"  Total accounts with 3+ meetings: {len(all_accounts)}")
print(f"  Legacy accounts (segmented): {len([a for a in all_accounts if a['is_legacy']])}")
print(f"  Recent accounts: {len([a for a in all_accounts if not a['is_legacy']])}")

# =============================================================================
# CLASSIFY MEETINGS BY SUB-STEP
# =============================================================================
print("\n[STEP 3] Classifying meetings by sub-step...")

def classify_substep(subject, meeting_number):
    """Classify meeting into sales process sub-step."""
    if pd.isna(subject):
        subject = ''
    s = str(subject).lower().strip()
    
    # INTRO (Meeting 1 or explicit intro)
    if meeting_number == 1:
        return 'M1_Intro'
    if 'intro' in s or 'introduction' in s:
        return 'M1_Intro'
    
    # DEMO / PRODUCT (Meeting 3 in the bible = Products overview)
    # Bucket: demo, sigma, cortex, platform, walkthrough, product-specific
    if any(kw in s for kw in ['demo', 'sigma', 'cortex', 'platform', 'walkthrough', 'product', 'eudia ai']):
        return 'M3_Demo_Product'
    
    # CAB DISCUSSION (Meeting 2a)
    if any(kw in s for kw in ['cab', 'customer advisory', 'advisory board']):
        return 'M2a_CAB'
    
    # USE CASE IDENTIFICATION (Meeting 2b)
    if any(kw in s for kw in ['use case', 'use-case', 'requirements', 'landing']):
        return 'M2b_UseCase'
    
    # SCOPING / PRICING (Stage 2 internal)
    if any(kw in s for kw in ['scoping', 'scope', 'pricing', 'delivery assessment']):
        return 'S2_Scoping'
    
    # PROPOSAL (Meeting 4+)
    if any(kw in s for kw in ['proposal', 'delivery plan']):
        return 'M4_Proposal'
    
    # INFOSEC / COMPLIANCE (Stage 4)
    if any(kw in s for kw in ['infosec', 'security', 'compliance']):
        return 'S4_Infosec'
    
    # CONTRACTING / NEGOTIATIONS (Stage 4)
    if any(kw in s for kw in ['contract', 'redline', 'msa', 'negotiation', 'terms']):
        return 'S4_Contracting'
    
    # PILOT / POC
    if any(kw in s for kw in ['pilot', 'poc', 'kickoff', 'kick off']):
        return 'S3_Pilot'
    
    # FOLLOW-UP (default for meetings 2-3 without specific keywords)
    if meeting_number <= 3:
        return 'Followup_Early'
    
    return 'Followup_General'

# Process all accounts
account_analysis = []
all_meetings_classified = []

for acct in all_accounts:
    norm = acct['normalized']
    acct_name = acct['name']
    
    # Get meetings sorted by date
    acct_meetings = df_meetings[df_meetings['_norm_acct'] == norm].copy()
    acct_meetings = acct_meetings.sort_values('Date').reset_index(drop=True)
    
    if len(acct_meetings) == 0:
        continue
    
    # Classify each meeting
    substep_dates = {}
    demo_count = 0
    demo_dates = []
    
    for idx, row in acct_meetings.iterrows():
        meeting_num = idx + 1
        substep = classify_substep(row['Subject'], meeting_num)
        
        all_meetings_classified.append({
            'Account': acct_name,
            'Is_Legacy': 'Yes' if acct['is_legacy'] else 'No',
            'Meeting_Number': meeting_num,
            'Date': row['Date'],
            'Subject': row['Subject'],
            'Sub_Step': substep,
        })
        
        # Track first occurrence of each substep
        if substep not in substep_dates:
            substep_dates[substep] = row['Date']
        
        # Track demos
        if substep == 'M3_Demo_Product':
            demo_count += 1
            demo_dates.append(row['Date'])
    
    # Calculate timing metrics
    first_meeting = acct_meetings['Date'].min()
    
    record = {
        'Account': acct_name,
        'Is_Legacy': 'Yes' if acct['is_legacy'] else 'No',
        'Is_Validated': 'Yes' if acct['is_validated'] else 'No',
        'Total_Meetings': len(acct_meetings),
        'First_Meeting': first_meeting,
        'Close_Date': acct['close_date'],
    }
    
    # Sales cycle if closed
    if acct['close_date']:
        record['Sales_Cycle_Days'] = (acct['close_date'] - first_meeting).days
    else:
        record['Sales_Cycle_Days'] = None
    
    # Days to each sub-step (from first meeting)
    for substep in ['M1_Intro', 'Followup_Early', 'M2a_CAB', 'M2b_UseCase', 'M3_Demo_Product', 'S2_Scoping', 'M4_Proposal', 'S4_Contracting']:
        if substep in substep_dates:
            record[f'Days_to_{substep}'] = (substep_dates[substep] - first_meeting).days
        else:
            record[f'Days_to_{substep}'] = None
    
    # Demo metrics
    record['Demo_Count'] = demo_count
    if len(demo_dates) > 0:
        record['Days_to_First_Demo'] = (demo_dates[0] - first_meeting).days
        if len(demo_dates) > 1:
            # Average days between demos
            demo_gaps = [(demo_dates[i+1] - demo_dates[i]).days for i in range(len(demo_dates)-1)]
            record['Avg_Days_Between_Demos'] = sum(demo_gaps) / len(demo_gaps)
        else:
            record['Avg_Days_Between_Demos'] = None
    else:
        record['Days_to_First_Demo'] = None
        record['Avg_Days_Between_Demos'] = None
    
    # Count by substep
    for substep in ['M1_Intro', 'Followup_Early', 'Followup_General', 'M2a_CAB', 'M2b_UseCase', 'M3_Demo_Product', 'S2_Scoping', 'M4_Proposal', 'S4_Infosec', 'S4_Contracting', 'S3_Pilot']:
        count = len([m for m in all_meetings_classified if m['Account'] == acct_name and m['Sub_Step'] == substep])
        record[f'Count_{substep}'] = count
    
    account_analysis.append(record)

analysis_df = pd.DataFrame(account_analysis)
meetings_df = pd.DataFrame(all_meetings_classified)

print(f"  Analyzed {len(analysis_df)} accounts")
print(f"  Total meetings classified: {len(meetings_df)}")

# =============================================================================
# COMPUTE SUMMARY METRICS
# =============================================================================
print("\n[STEP 4] Computing summary metrics...")

# Separate legacy vs recent
legacy_df = analysis_df[analysis_df['Is_Legacy'] == 'Yes']
recent_df = analysis_df[analysis_df['Is_Legacy'] == 'No']

print(f"\n  RECENT ACCOUNTS (excluding legacy): {len(recent_df)}")

# =============================================================================
# CREATE EXCEL WORKBOOK
# =============================================================================
print("\n[STEP 5] Creating Excel workbook...")

output_path = '/Users/keiganpesenti/Desktop/sales_substeps_analysis.xlsx'

with pd.ExcelWriter(output_path, engine='openpyxl', date_format='MM/DD/YYYY') as writer:
    
    # --- Tab 1: Summary ---
    summary_rows = []
    
    # Overview
    summary_rows.append({'Category': 'ANALYSIS OVERVIEW', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    summary_rows.append({'Category': '', 'Metric': 'Total accounts analyzed', 'Recent_Accounts': len(recent_df), 'Legacy_Accounts': len(legacy_df), 'All_Accounts': len(analysis_df)})
    summary_rows.append({'Category': '', 'Metric': 'Total meetings', 'Recent_Accounts': len(meetings_df[meetings_df['Is_Legacy'] == 'No']), 'Legacy_Accounts': len(meetings_df[meetings_df['Is_Legacy'] == 'Yes']), 'All_Accounts': len(meetings_df)})
    summary_rows.append({'Category': '', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    # Sales Cycle
    summary_rows.append({'Category': 'SALES CYCLE (First Meeting → Close)', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    for df, col in [(recent_df, 'Recent_Accounts'), (legacy_df, 'Legacy_Accounts'), (analysis_df, 'All_Accounts')]:
        valid = df[df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
        if len(valid) > 0:
            summary_rows.append({'Category': '', 'Metric': f'Average days to close', 'Recent_Accounts': f'{recent_df[recent_df["Sales_Cycle_Days"] > 0]["Sales_Cycle_Days"].mean():.0f}' if col == 'Recent_Accounts' else '', 'Legacy_Accounts': f'{legacy_df[legacy_df["Sales_Cycle_Days"] > 0]["Sales_Cycle_Days"].mean():.0f}' if col == 'Legacy_Accounts' else '', 'All_Accounts': f'{analysis_df[analysis_df["Sales_Cycle_Days"] > 0]["Sales_Cycle_Days"].mean():.0f}' if col == 'All_Accounts' else ''})
            break
    
    valid_recent = recent_df[recent_df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
    valid_legacy = legacy_df[legacy_df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
    valid_all = analysis_df[analysis_df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
    
    summary_rows.append({'Category': '', 'Metric': 'Average days', 
                         'Recent_Accounts': f'{valid_recent.mean():.0f}' if len(valid_recent) > 0 else 'N/A',
                         'Legacy_Accounts': f'{valid_legacy.mean():.0f}' if len(valid_legacy) > 0 else 'N/A',
                         'All_Accounts': f'{valid_all.mean():.0f}' if len(valid_all) > 0 else 'N/A'})
    summary_rows.append({'Category': '', 'Metric': 'Median days', 
                         'Recent_Accounts': f'{valid_recent.median():.0f}' if len(valid_recent) > 0 else 'N/A',
                         'Legacy_Accounts': f'{valid_legacy.median():.0f}' if len(valid_legacy) > 0 else 'N/A',
                         'All_Accounts': f'{valid_all.median():.0f}' if len(valid_all) > 0 else 'N/A'})
    summary_rows.append({'Category': '', 'Metric': 'Accounts with data', 
                         'Recent_Accounts': len(valid_recent),
                         'Legacy_Accounts': len(valid_legacy),
                         'All_Accounts': len(valid_all)})
    summary_rows.append({'Category': '', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    # Days to Sub-Steps
    summary_rows.append({'Category': 'DAYS TO EACH SUB-STEP (from first meeting)', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    substep_labels = {
        'Days_to_Followup_Early': 'Follow-up 1/2 (early engagement)',
        'Days_to_M2a_CAB': 'CAB Discussion (champion identification)',
        'Days_to_M2b_UseCase': 'Use Case Identification',
        'Days_to_M3_Demo_Product': 'First Demo / Product Overview',
        'Days_to_S2_Scoping': 'Scoping / Pricing',
        'Days_to_M4_Proposal': 'Proposal Discussion',
        'Days_to_S4_Contracting': 'Contracting / Negotiations',
    }
    
    for col, label in substep_labels.items():
        valid_recent = recent_df[recent_df[col] > 0][col].dropna() if col in recent_df.columns else pd.Series()
        valid_legacy = legacy_df[legacy_df[col] > 0][col].dropna() if col in legacy_df.columns else pd.Series()
        valid_all = analysis_df[analysis_df[col] > 0][col].dropna() if col in analysis_df.columns else pd.Series()
        
        summary_rows.append({'Category': '', 'Metric': label,
                             'Recent_Accounts': f'{valid_recent.median():.0f} days ({len(valid_recent)} accts)' if len(valid_recent) > 0 else 'N/A',
                             'Legacy_Accounts': f'{valid_legacy.median():.0f} days ({len(valid_legacy)} accts)' if len(valid_legacy) > 0 else 'N/A',
                             'All_Accounts': f'{valid_all.median():.0f} days ({len(valid_all)} accts)' if len(valid_all) > 0 else 'N/A'})
    
    summary_rows.append({'Category': '', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    # Demo Metrics
    summary_rows.append({'Category': 'DEMO METRICS', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    valid_recent = recent_df[recent_df['Days_to_First_Demo'] >= 0]['Days_to_First_Demo'].dropna()
    valid_legacy = legacy_df[legacy_df['Days_to_First_Demo'] >= 0]['Days_to_First_Demo'].dropna()
    valid_all = analysis_df[analysis_df['Days_to_First_Demo'] >= 0]['Days_to_First_Demo'].dropna()
    
    summary_rows.append({'Category': '', 'Metric': 'Average days to first demo',
                         'Recent_Accounts': f'{valid_recent.mean():.0f}' if len(valid_recent) > 0 else 'N/A',
                         'Legacy_Accounts': f'{valid_legacy.mean():.0f}' if len(valid_legacy) > 0 else 'N/A',
                         'All_Accounts': f'{valid_all.mean():.0f}' if len(valid_all) > 0 else 'N/A'})
    
    valid_recent = recent_df[recent_df['Demo_Count'] > 0]['Demo_Count']
    valid_legacy = legacy_df[legacy_df['Demo_Count'] > 0]['Demo_Count']
    valid_all = analysis_df[analysis_df['Demo_Count'] > 0]['Demo_Count']
    
    summary_rows.append({'Category': '', 'Metric': 'Average demos per account',
                         'Recent_Accounts': f'{valid_recent.mean():.1f}' if len(valid_recent) > 0 else 'N/A',
                         'Legacy_Accounts': f'{valid_legacy.mean():.1f}' if len(valid_legacy) > 0 else 'N/A',
                         'All_Accounts': f'{valid_all.mean():.1f}' if len(valid_all) > 0 else 'N/A'})
    
    summary_rows.append({'Category': '', 'Metric': 'Accounts with demos',
                         'Recent_Accounts': len(valid_recent),
                         'Legacy_Accounts': len(valid_legacy),
                         'All_Accounts': len(valid_all)})
    
    valid_recent = recent_df[recent_df['Avg_Days_Between_Demos'] > 0]['Avg_Days_Between_Demos'].dropna()
    valid_legacy = legacy_df[legacy_df['Avg_Days_Between_Demos'] > 0]['Avg_Days_Between_Demos'].dropna()
    valid_all = analysis_df[analysis_df['Avg_Days_Between_Demos'] > 0]['Avg_Days_Between_Demos'].dropna()
    
    summary_rows.append({'Category': '', 'Metric': 'Avg days between demos (if multiple)',
                         'Recent_Accounts': f'{valid_recent.mean():.0f}' if len(valid_recent) > 0 else 'N/A',
                         'Legacy_Accounts': f'{valid_legacy.mean():.0f}' if len(valid_legacy) > 0 else 'N/A',
                         'All_Accounts': f'{valid_all.mean():.0f}' if len(valid_all) > 0 else 'N/A'})
    
    summary_rows.append({'Category': '', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    # Sub-step counts
    summary_rows.append({'Category': 'SUB-STEP MEETING COUNTS (avg per account)', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    substep_count_labels = {
        'Count_M1_Intro': 'Intro meetings',
        'Count_Followup_Early': 'Early follow-ups (meetings 2-3)',
        'Count_Followup_General': 'General follow-ups',
        'Count_M2a_CAB': 'CAB discussions',
        'Count_M2b_UseCase': 'Use case identification',
        'Count_M3_Demo_Product': 'Demo / Product meetings',
        'Count_S2_Scoping': 'Scoping / Pricing',
        'Count_M4_Proposal': 'Proposal discussions',
        'Count_S4_Infosec': 'Infosec / Compliance',
        'Count_S4_Contracting': 'Contracting / Negotiations',
        'Count_S3_Pilot': 'Pilot / POC',
    }
    
    for col, label in substep_count_labels.items():
        if col in recent_df.columns:
            avg_recent = recent_df[col].mean()
            avg_legacy = legacy_df[col].mean()
            avg_all = analysis_df[col].mean()
            
            summary_rows.append({'Category': '', 'Metric': label,
                                 'Recent_Accounts': f'{avg_recent:.1f}',
                                 'Legacy_Accounts': f'{avg_legacy:.1f}',
                                 'All_Accounts': f'{avg_all:.1f}'})
    
    summary_rows.append({'Category': '', 'Metric': '', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    summary_rows.append({'Category': 'NOTE', 'Metric': 'Legacy accounts = Cargill, Coherent, Intuit, Duracell, Graybar, ECMS (long-term, high-volume - shown separately to avoid distortion)', 'Recent_Accounts': '', 'Legacy_Accounts': '', 'All_Accounts': ''})
    
    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_excel(writer, sheet_name='1_Summary', index=False)
    
    # --- Tab 2: Account Detail ---
    cols = ['Account', 'Is_Legacy', 'Is_Validated', 'Total_Meetings', 'First_Meeting', 'Close_Date', 'Sales_Cycle_Days',
            'Days_to_Followup_Early', 'Days_to_M2a_CAB', 'Days_to_M2b_UseCase', 'Days_to_M3_Demo_Product',
            'Days_to_S2_Scoping', 'Days_to_M4_Proposal', 'Days_to_S4_Contracting',
            'Demo_Count', 'Days_to_First_Demo', 'Avg_Days_Between_Demos']
    cols = [c for c in cols if c in analysis_df.columns]
    
    account_output = analysis_df[cols].copy()
    account_output['First_Meeting'] = pd.to_datetime(account_output['First_Meeting']).dt.strftime('%m/%d/%Y')
    account_output['Close_Date'] = pd.to_datetime(account_output['Close_Date']).dt.strftime('%m/%d/%Y')
    account_output = account_output.sort_values('Total_Meetings', ascending=False)
    account_output.to_excel(writer, sheet_name='2_Account_Detail', index=False)
    
    # --- Tab 3: Meeting Chronology ---
    meetings_output = meetings_df.copy()
    meetings_output['Date'] = pd.to_datetime(meetings_output['Date']).dt.strftime('%m/%d/%Y')
    meetings_output = meetings_output.sort_values(['Account', 'Meeting_Number'])
    meetings_output.to_excel(writer, sheet_name='3_Meeting_Chronology', index=False)
    
    # --- Tab 4: Sub-Step Reference ---
    reference = [
        {'Stage': 'STAGE 1 - DISCOVERY', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': '', 'Sub_Step': 'M1_Intro', 'Description': 'First meeting / CLO engagement', 'Keywords': 'intro, introduction, OR chronologically first meeting'},
        {'Stage': '', 'Sub_Step': 'Followup_Early', 'Description': 'Early follow-ups, relationship building', 'Keywords': 'meetings 2-3 without specific keywords'},
        {'Stage': '', 'Sub_Step': 'M2a_CAB', 'Description': 'CAB discussion, position CLO as advisor', 'Keywords': 'cab, customer advisory, advisory board'},
        {'Stage': '', 'Sub_Step': 'M2b_UseCase', 'Description': 'Use case identification, landing path', 'Keywords': 'use case, requirements, landing'},
        {'Stage': '', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': 'STAGE 2 - SQO', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': '', 'Sub_Step': 'M3_Demo_Product', 'Description': 'Product overview, demos', 'Keywords': 'demo, sigma, cortex, platform, walkthrough, product'},
        {'Stage': '', 'Sub_Step': 'S2_Scoping', 'Description': 'Scoping, pricing, delivery assessment', 'Keywords': 'scoping, pricing, delivery'},
        {'Stage': '', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': 'STAGE 3 - PILOT (optional)', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': '', 'Sub_Step': 'S3_Pilot', 'Description': 'Pilot / POC activities', 'Keywords': 'pilot, poc, kickoff'},
        {'Stage': '', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': 'STAGE 4 - PROPOSAL', 'Sub_Step': '', 'Description': '', 'Keywords': ''},
        {'Stage': '', 'Sub_Step': 'M4_Proposal', 'Description': 'Proposal and delivery plan', 'Keywords': 'proposal, delivery plan'},
        {'Stage': '', 'Sub_Step': 'S4_Infosec', 'Description': 'Infosec / Compliance review', 'Keywords': 'infosec, security, compliance'},
        {'Stage': '', 'Sub_Step': 'S4_Contracting', 'Description': 'Contract negotiations', 'Keywords': 'contract, redline, msa, negotiation'},
    ]
    reference_df = pd.DataFrame(reference)
    reference_df.to_excel(writer, sheet_name='4_SubStep_Reference', index=False)

print(f"\n  Workbook saved: {output_path}")
print("\n  Tabs:")
print("    1_Summary - Metrics split by Recent vs Legacy accounts")
print("    2_Account_Detail - Per-account timing metrics")
print("    3_Meeting_Chronology - All meetings in sequence")
print("    4_SubStep_Reference - Classification rules")

print("\n" + "="*80)
print("ANALYSIS COMPLETE")
print("="*80)

# Print key insights
print("\nKEY INSIGHTS (Recent accounts only - excluding legacy):")
recent_df = analysis_df[analysis_df['Is_Legacy'] == 'No']

valid = recent_df[recent_df['Days_to_M3_Demo_Product'] >= 0]['Days_to_First_Demo'].dropna()
if len(valid) > 0:
    print(f"  Days to first demo: Median {valid.median():.0f} days ({len(valid)} accounts)")

valid = recent_df[recent_df['Demo_Count'] > 0]['Demo_Count']
if len(valid) > 0:
    print(f"  Demos per account: Avg {valid.mean():.1f} ({len(valid)} accounts with demos)")

valid = recent_df[recent_df['Sales_Cycle_Days'] > 0]['Sales_Cycle_Days'].dropna()
if len(valid) > 0:
    print(f"  Sales cycle: Median {valid.median():.0f} days ({len(valid)} closed accounts)")

