"""
Sales Process Timing Analysis - Validated Workbook Builder
===========================================================
This script creates an auditable Excel workbook where:
1. All raw data is preserved and visible
2. Meeting classifications are explicit and can be verified
3. Summary metrics can be traced back to source rows
4. Formulas are used where possible for validation
"""

import pandas as pd
import numpy as np
from datetime import datetime

# Read source data
print("Loading source data...")
xl = pd.ExcelFile('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df_main = pd.read_excel(xl, sheet_name='Sheet1')
df_other = pd.read_excel(xl, sheet_name='other account meetings')

print(f"Main tab: {len(df_main)} rows")
print(f"Other tab: {len(df_other)} rows")

# Combine all data
df_all = pd.concat([df_main, df_other], ignore_index=True)
print(f"Combined: {len(df_all)} rows")

# Ensure date is datetime
df_all['Date'] = pd.to_datetime(df_all['Date'])

# Remove exact duplicates (same Activity ID)
df_all = df_all.drop_duplicates(subset=['Activity ID'])
print(f"After Activity ID dedup: {len(df_all)} rows")

# Create deduplication key: Account + Date + Subject (normalized)
df_all['Subject_Normalized'] = df_all['Subject'].str.lower().str.strip()
df_all['Dedup_Key'] = df_all['Company / Account'] + '|' + df_all['Date'].astype(str) + '|' + df_all['Subject_Normalized']

# Keep first occurrence of each unique meeting
df_dedup = df_all.drop_duplicates(subset=['Dedup_Key'], keep='first').copy()
print(f"After full dedup: {len(df_dedup)} rows")
print(f"Unique accounts: {df_dedup['Company / Account'].nunique()}")

# EXPLICIT MEETING CLASSIFICATION
# Each classification rule is documented for auditability
def classify_meeting_explicit(subject):
    """
    Returns tuple: (classification, matched_keywords, confidence)
    Confidence: HIGH = exact keyword match, MEDIUM = partial match, LOW = inference
    """
    s = str(subject).lower().strip()
    
    # Priority order matters - more specific patterns first
    
    # CAB Discussion (HIGH confidence)
    if 'cab' in s:
        return ('CAB Discussion', 'cab', 'HIGH')
    
    # Use Case (HIGH confidence)
    if 'use case' in s:
        return ('Use Case Discussion', 'use case', 'HIGH')
    
    # Scoping (HIGH confidence)
    if 'scoping' in s:
        return ('Scoping', 'scoping', 'HIGH')
    
    # Pilot/Kickoff (HIGH confidence)
    if 'pilot' in s or 'kick off' in s or 'kickoff' in s:
        return ('Pilot/Kickoff', 'pilot|kickoff', 'HIGH')
    
    # Compliance (HIGH confidence)
    if 'compliance' in s:
        return ('Compliance', 'compliance', 'HIGH')
    
    # Security (MEDIUM confidence)
    if 'security' in s or 'infosec' in s:
        return ('Security/Infosec', 'security|infosec', 'MEDIUM')
    
    # Product Demo (HIGH confidence - specific pattern)
    if 'product' in s and ('demo' in s or 'overview' in s):
        return ('Product Demo', 'product+demo|overview', 'HIGH')
    
    # Follow-up + Demo combo (HIGH confidence)
    if 'follow' in s and 'demo' in s:
        return ('Follow-up + Demo', 'follow+demo', 'HIGH')
    
    # Follow-up only (HIGH confidence)
    if 'follow' in s:
        return ('Follow-up', 'follow', 'HIGH')
    
    # Introduction (HIGH confidence)
    if 'intro' in s or 'introduction' in s:
        return ('Introduction', 'intro|introduction', 'HIGH')
    
    # Demo/Walkthrough (HIGH confidence)
    if 'demo' in s or 'walkthrough' in s:
        return ('Demo', 'demo|walkthrough', 'HIGH')
    
    # Overview (MEDIUM confidence)
    if 'overview' in s:
        return ('Overview', 'overview', 'MEDIUM')
    
    # M&A specific (MEDIUM confidence)
    if 'm&a' in s or 'due diligence' in s:
        return ('M&A Discussion', 'm&a|due diligence', 'MEDIUM')
    
    # Contracting (MEDIUM confidence)
    if 'contract' in s and ('review' in s or 'redline' in s):
        return ('Contracting', 'contract+review|redline', 'MEDIUM')
    
    # Generic meeting patterns - LOW confidence
    if 'meeting' in s or 'call' in s or 'sync' in s:
        return ('General Meeting', 'meeting|call|sync', 'LOW')
    
    # Office hours (MEDIUM confidence)
    if 'office hours' in s:
        return ('Office Hours', 'office hours', 'MEDIUM')
    
    # Unclassified
    return ('Unclassified', '', 'NONE')

# Apply classification
print("\nClassifying meetings...")
classifications = df_dedup['Subject'].apply(classify_meeting_explicit)
df_dedup['Meeting Type'] = [c[0] for c in classifications]
df_dedup['Matched Keywords'] = [c[1] for c in classifications]
df_dedup['Classification Confidence'] = [c[2] for c in classifications]

# Show classification distribution
print("\n=== MEETING TYPE DISTRIBUTION ===")
print(df_dedup['Meeting Type'].value_counts())

print("\n=== CLASSIFICATION CONFIDENCE ===")
print(df_dedup['Classification Confidence'].value_counts())

# Sort by account and date
df_dedup = df_dedup.sort_values(['Company / Account', 'Date'])

# Add row number within each account for tracking
df_dedup['Meeting Sequence'] = df_dedup.groupby('Company / Account').cumcount() + 1

# Calculate days from first meeting for each account
first_dates = df_dedup.groupby('Company / Account')['Date'].transform('min')
df_dedup['Days From First Meeting'] = (df_dedup['Date'] - first_dates).dt.days

# Clean up columns for output
df_output = df_dedup[[
    'Company / Account',
    'Date',
    'Subject',
    'Meeting Type',
    'Matched Keywords',
    'Classification Confidence',
    'Meeting Sequence',
    'Days From First Meeting',
    'Contact',
    'Assigned',
    'Activity ID'
]].copy()

# Create account-level summary
print("\nBuilding account summaries...")
account_summary = []

for acct in df_output['Company / Account'].unique():
    acct_df = df_output[df_output['Company / Account'] == acct].sort_values('Date')
    
    # First meeting info
    first_row = acct_df.iloc[0]
    
    record = {
        'Account': acct,
        'Total Meetings': len(acct_df),
        'First Meeting Date': first_row['Date'],
        'First Meeting Type': first_row['Meeting Type'],
        'First Meeting Subject': str(first_row['Subject'])[:60] if pd.notna(first_row['Subject']) else '',
        'Last Meeting Date': acct_df['Date'].max(),
        'Date Range (days)': (acct_df['Date'].max() - acct_df['Date'].min()).days,
    }
    
    # Find first occurrence of each key meeting type
    key_types = ['Introduction', 'Follow-up', 'Demo', 'CAB Discussion', 'Scoping', 
                 'Use Case Discussion', 'Product Demo', 'Pilot/Kickoff']
    
    for mt in key_types:
        mt_rows = acct_df[acct_df['Meeting Type'] == mt]
        if len(mt_rows) > 0:
            first_mt = mt_rows.iloc[0]
            record[f'{mt} - Date'] = first_mt['Date']
            record[f'{mt} - Days From Start'] = first_mt['Days From First Meeting']
            record[f'{mt} - Subject'] = str(first_mt['Subject'])[:50] if pd.notna(first_mt['Subject']) else ''
        else:
            record[f'{mt} - Date'] = None
            record[f'{mt} - Days From Start'] = None
            record[f'{mt} - Subject'] = None
    
    account_summary.append(record)

summary_df = pd.DataFrame(account_summary)

# Create stage-to-stage transition analysis (only where we have clear data)
print("\nCalculating stage transitions...")
transitions_detail = []

for acct in df_output['Company / Account'].unique():
    acct_df = df_output[df_output['Company / Account'] == acct].sort_values('Date')
    
    # Get first date of each HIGH confidence meeting type
    type_dates = {}
    for _, row in acct_df.iterrows():
        if row['Classification Confidence'] in ['HIGH', 'MEDIUM']:
            mt = row['Meeting Type']
            if mt not in type_dates:
                type_dates[mt] = {
                    'date': row['Date'],
                    'subject': row['Subject'],
                    'confidence': row['Classification Confidence']
                }
    
    # Only calculate transitions where both ends exist
    transition_pairs = [
        ('Introduction', 'Follow-up'),
        ('Introduction', 'Demo'),
        ('Introduction', 'CAB Discussion'),
        ('Introduction', 'Scoping'),
        ('Follow-up', 'Demo'),
        ('Demo', 'Scoping'),
        ('Demo', 'CAB Discussion'),
        ('CAB Discussion', 'Demo'),
    ]
    
    for from_type, to_type in transition_pairs:
        if from_type in type_dates and to_type in type_dates:
            from_date = type_dates[from_type]['date']
            to_date = type_dates[to_type]['date']
            days = (to_date - from_date).days
            
            # Only include if to_date is after from_date
            if days > 0:
                transitions_detail.append({
                    'Account': acct,
                    'From Stage': from_type,
                    'To Stage': to_type,
                    'From Date': from_date,
                    'To Date': to_date,
                    'Days': days,
                    'From Subject': str(type_dates[from_type]['subject'])[:50] if pd.notna(type_dates[from_type]['subject']) else '',
                    'To Subject': str(type_dates[to_type]['subject'])[:50] if pd.notna(type_dates[to_type]['subject']) else '',
                    'From Confidence': type_dates[from_type]['confidence'],
                    'To Confidence': type_dates[to_type]['confidence'],
                })

transitions_df = pd.DataFrame(transitions_detail)

# Create transition summary with source row references
if len(transitions_df) > 0:
    transition_summary = transitions_df.groupby(['From Stage', 'To Stage']).agg({
        'Days': ['count', 'mean', 'median', 'min', 'max', 'std'],
        'Account': lambda x: ', '.join(x.head(5))  # List first 5 accounts for reference
    }).round(1)
    transition_summary.columns = ['Count', 'Mean Days', 'Median Days', 'Min Days', 'Max Days', 'Std Dev', 'Sample Accounts']
    transition_summary = transition_summary.reset_index()
else:
    transition_summary = pd.DataFrame()

# Write to Excel with multiple validation-friendly tabs
output_path = '/Users/keiganpesenti/Desktop/sales_process_validated_analysis.xlsx'
print(f"\nWriting to {output_path}...")

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # Tab 1: All meetings - RAW DATA with classifications
    df_output.to_excel(writer, sheet_name='1_All_Meetings_Classified', index=False)
    
    # Tab 2: Account Summary
    summary_df.to_excel(writer, sheet_name='2_Account_Summary', index=False)
    
    # Tab 3: Transition Detail (every single transition with source data)
    if len(transitions_df) > 0:
        transitions_df.to_excel(writer, sheet_name='3_Transition_Detail', index=False)
    
    # Tab 4: Transition Summary Statistics
    if len(transition_summary) > 0:
        transition_summary.to_excel(writer, sheet_name='4_Transition_Summary', index=False)
    
    # Tab 5: Classification Reference (for auditing)
    class_ref = df_output.groupby(['Meeting Type', 'Classification Confidence']).size().reset_index(name='Count')
    class_ref.to_excel(writer, sheet_name='5_Classification_Reference', index=False)
    
    # Tab 6: Data Quality Notes
    quality_notes = pd.DataFrame({
        'Note': [
            f'Total source rows: {len(df_main) + len(df_other)}',
            f'After Activity ID dedup: {len(df_all)}',
            f'After Account+Date+Subject dedup: {len(df_dedup)}',
            f'Unique accounts: {df_dedup["Company / Account"].nunique()}',
            f'Date range: {df_dedup["Date"].min().strftime("%Y-%m-%d")} to {df_dedup["Date"].max().strftime("%Y-%m-%d")}',
            f'HIGH confidence classifications: {len(df_output[df_output["Classification Confidence"]=="HIGH"])}',
            f'MEDIUM confidence classifications: {len(df_output[df_output["Classification Confidence"]=="MEDIUM"])}',
            f'LOW confidence classifications: {len(df_output[df_output["Classification Confidence"]=="LOW"])}',
            f'Unclassified meetings: {len(df_output[df_output["Classification Confidence"]=="NONE"])}',
            '',
            'HOW TO VALIDATE:',
            '1. Tab 1 shows every meeting with its classification and matched keywords',
            '2. Tab 2 shows each account with dates for each stage type',
            '3. Tab 3 shows EVERY transition calculation with source subjects',
            '4. Tab 4 shows summary stats with sample accounts for spot-checking',
            '5. All "Days From First Meeting" can be verified: Date - First Meeting Date',
        ]
    })
    quality_notes.to_excel(writer, sheet_name='6_Data_Quality_Notes', index=False)

print("\n" + "="*70)
print("OUTPUT COMPLETE")
print("="*70)
print(f"\nFile saved to: {output_path}")
print("\nTabs created:")
print("  1_All_Meetings_Classified - Every meeting with classification (verify here)")
print("  2_Account_Summary - Per-account timeline with all stage dates")
print("  3_Transition_Detail - Every single transition with source rows")
print("  4_Transition_Summary - Statistical summary with sample accounts")
print("  5_Classification_Reference - How meetings were classified")
print("  6_Data_Quality_Notes - Processing steps and validation guide")

# Print summary statistics that can be verified
print("\n" + "="*70)
print("TRANSITION SUMMARY (verify against Tab 4)")
print("="*70)
if len(transition_summary) > 0:
    for _, row in transition_summary.iterrows():
        print(f"\n{row['From Stage']} → {row['To Stage']}")
        print(f"  Count: {row['Count']}")
        print(f"  Median: {row['Median Days']} days")
        print(f"  Range: {row['Min Days']} - {row['Max Days']} days")
        print(f"  Sample accounts: {row['Sample Accounts'][:60]}...")

