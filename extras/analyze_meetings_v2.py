import pandas as pd
import numpy as np

df = pd.read_excel('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df['Date'] = pd.to_datetime(df['Date'])

# Deduplicate - same account + date + subject = one meeting
df_dedup = df.drop_duplicates(subset=['Company / Account', 'Date', 'Subject']).copy()
print(f'Original: {len(df)} | Deduplicated: {len(df_dedup)} | Removed: {len(df) - len(df_dedup)} duplicates')

# Classify meeting types
def classify_meeting(subject):
    s = str(subject).lower()
    
    if 'cab' in s:
        return 'CAB Discussion'
    elif 'use case' in s:
        return 'Use Case Identification'
    elif 'scoping' in s:
        return 'Scoping'
    elif 'compliance' in s:
        return 'Compliance'
    elif 'pilot' in s or 'kickoff' in s:
        return 'Pilot/Kickoff'
    elif 'product' in s and ('demo' in s or 'overview' in s):
        return 'Product Demo'
    elif 'follow' in s and 'demo' in s:
        return 'Follow-up + Demo'
    elif 'follow' in s:
        return 'Follow-up'
    elif 'intro' in s or 'introduction' in s:
        return 'Introduction'
    elif 'demo' in s or 'walkthrough' in s:
        return 'Demo'
    elif 'overview' in s:
        return 'Overview'
    else:
        return 'Other'

df_dedup['Meeting Type'] = df_dedup['Subject'].apply(classify_meeting)

# Define stage order for progression analysis
stage_order = [
    'Introduction',
    'Follow-up',
    'CAB Discussion', 
    'Use Case Identification',
    'Scoping',
    'Demo',
    'Product Demo',
    'Compliance',
    'Pilot/Kickoff'
]

# For each account, build the timeline
account_timelines = []

for acct in df_dedup['Company / Account'].unique():
    acct_df = df_dedup[df_dedup['Company / Account'] == acct].sort_values('Date')
    
    # Get first date of each meeting type
    first_by_type = {}
    for _, row in acct_df.iterrows():
        mt = row['Meeting Type']
        if mt not in first_by_type:
            first_by_type[mt] = row['Date']
    
    # Get first meeting overall
    first_meeting_date = acct_df['Date'].min()
    first_meeting_type = acct_df.iloc[0]['Meeting Type']
    
    record = {
        'Account': acct,
        'First Meeting Date': first_meeting_date,
        'First Meeting Type': first_meeting_type,
        'Total Unique Meetings': len(acct_df),
    }
    
    # Get date for each stage
    for stage in stage_order:
        if stage in first_by_type:
            record[f'{stage} Date'] = first_by_type[stage]
        else:
            record[f'{stage} Date'] = pd.NaT
    
    account_timelines.append(record)

timeline_df = pd.DataFrame(account_timelines)

# Now calculate STAGE-TO-STAGE transitions
print('\n' + '='*80)
print('STAGE-TO-STAGE TRANSITION ANALYSIS')
print('='*80)

transitions = {
    'Introduction → Follow-up': [],
    'Introduction → Demo': [],
    'Introduction → CAB Discussion': [],
    'Introduction → Scoping': [],
    'Follow-up → Demo': [],
    'Follow-up → CAB Discussion': [],
    'Demo → Use Case Identification': [],
    'Demo → Scoping': [],
    'Demo → Product Demo': [],
    'CAB Discussion → Demo': [],
    'CAB Discussion → Scoping': [],
    'Scoping → Demo': [],
    'First Meeting → Introduction': [],
    'First Meeting → Demo': [],
    'First Meeting → Follow-up': [],
    'First Meeting → CAB Discussion': [],
}

for _, row in timeline_df.iterrows():
    first_date = row['First Meeting Date']
    
    intro_date = row.get('Introduction Date', pd.NaT)
    followup_date = row.get('Follow-up Date', pd.NaT)
    demo_date = row.get('Demo Date', pd.NaT)
    cab_date = row.get('CAB Discussion Date', pd.NaT)
    scoping_date = row.get('Scoping Date', pd.NaT)
    usecase_date = row.get('Use Case Identification Date', pd.NaT)
    product_demo_date = row.get('Product Demo Date', pd.NaT)
    
    # From First Meeting
    if pd.notna(intro_date) and row['First Meeting Type'] != 'Introduction':
        days = (intro_date - first_date).days
        if days > 0:
            transitions['First Meeting → Introduction'].append(days)
    
    if pd.notna(demo_date) and row['First Meeting Type'] != 'Demo':
        days = (demo_date - first_date).days
        if days > 0:
            transitions['First Meeting → Demo'].append(days)
    
    if pd.notna(followup_date) and row['First Meeting Type'] != 'Follow-up':
        days = (followup_date - first_date).days
        if days > 0:
            transitions['First Meeting → Follow-up'].append(days)
    
    if pd.notna(cab_date) and row['First Meeting Type'] != 'CAB Discussion':
        days = (cab_date - first_date).days
        if days > 0:
            transitions['First Meeting → CAB Discussion'].append(days)
    
    # From Introduction
    if pd.notna(intro_date):
        if pd.notna(followup_date) and followup_date > intro_date:
            transitions['Introduction → Follow-up'].append((followup_date - intro_date).days)
        if pd.notna(demo_date) and demo_date > intro_date:
            transitions['Introduction → Demo'].append((demo_date - intro_date).days)
        if pd.notna(cab_date) and cab_date > intro_date:
            transitions['Introduction → CAB Discussion'].append((cab_date - intro_date).days)
        if pd.notna(scoping_date) and scoping_date > intro_date:
            transitions['Introduction → Scoping'].append((scoping_date - intro_date).days)
    
    # From Follow-up
    if pd.notna(followup_date):
        if pd.notna(demo_date) and demo_date > followup_date:
            transitions['Follow-up → Demo'].append((demo_date - followup_date).days)
        if pd.notna(cab_date) and cab_date > followup_date:
            transitions['Follow-up → CAB Discussion'].append((cab_date - followup_date).days)
    
    # From Demo
    if pd.notna(demo_date):
        if pd.notna(usecase_date) and usecase_date > demo_date:
            transitions['Demo → Use Case Identification'].append((usecase_date - demo_date).days)
        if pd.notna(scoping_date) and scoping_date > demo_date:
            transitions['Demo → Scoping'].append((scoping_date - demo_date).days)
        if pd.notna(product_demo_date) and product_demo_date > demo_date:
            transitions['Demo → Product Demo'].append((product_demo_date - demo_date).days)
    
    # From CAB
    if pd.notna(cab_date):
        if pd.notna(demo_date) and demo_date > cab_date:
            transitions['CAB Discussion → Demo'].append((demo_date - cab_date).days)
        if pd.notna(scoping_date) and scoping_date > cab_date:
            transitions['CAB Discussion → Scoping'].append((scoping_date - cab_date).days)
    
    # From Scoping
    if pd.notna(scoping_date):
        if pd.notna(demo_date) and demo_date > scoping_date:
            transitions['Scoping → Demo'].append((scoping_date - demo_date).days)

# Print summary
summary_data = []
for transition, days_list in transitions.items():
    if len(days_list) >= 2:  # Only show transitions with at least 2 data points
        summary_data.append({
            'Transition': transition,
            'Count': len(days_list),
            'Mean (days)': round(np.mean(days_list), 1),
            'Median (days)': round(np.median(days_list), 1),
            'Min (days)': min(days_list),
            'Max (days)': max(days_list),
            'Std Dev': round(np.std(days_list), 1)
        })

summary_df = pd.DataFrame(summary_data).sort_values('Count', ascending=False)
print('\n')
print(summary_df.to_string(index=False))

# Create a detailed account-by-account view
print('\n\n' + '='*80)
print('DETAILED ACCOUNT TIMELINES (accounts with 3+ meetings)')
print('='*80)

detailed_accounts = timeline_df[timeline_df['Total Unique Meetings'] >= 3].sort_values('First Meeting Date')

for _, row in detailed_accounts.head(15).iterrows():
    print(f"\n{row['Account']}:")
    print(f"  First Meeting: {row['First Meeting Date'].strftime('%Y-%m-%d')} ({row['First Meeting Type']})")
    
    for stage in stage_order:
        date_col = f'{stage} Date'
        if pd.notna(row.get(date_col)):
            stage_date = row[date_col]
            days_from_first = (stage_date - row['First Meeting Date']).days
            if days_from_first > 0:
                print(f"  {stage}: {stage_date.strftime('%Y-%m-%d')} (+{days_from_first} days)")

# Save comprehensive output
output_path = '/Users/keiganpesenti/Desktop/meetings_stage_analysis.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # Sheet 1: Deduplicated meetings with classification
    df_dedup.to_excel(writer, sheet_name='All Meetings (Deduped)', index=False)
    
    # Sheet 2: Account timelines
    timeline_df.to_excel(writer, sheet_name='Account Timelines', index=False)
    
    # Sheet 3: Transition summary
    summary_df.to_excel(writer, sheet_name='Stage Transitions', index=False)
    
    # Sheet 4: Process benchmark template (matching your screenshot format)
    benchmark_data = []
    key_transitions = [
        ('First Meeting → Introduction', 'Days to Introduction'),
        ('Introduction → Follow-up', 'Intro to Follow-up'),
        ('Introduction → CAB Discussion', 'Intro to CAB Discussion'),
        ('Introduction → Demo', 'Intro to Demo'),
        ('Follow-up → Demo', 'Follow-up to Demo'),
        ('Demo → Scoping', 'Demo to Scoping'),
        ('Introduction → Scoping', 'Intro to Scoping'),
    ]
    
    for transition_key, label in key_transitions:
        days_list = transitions.get(transition_key, [])
        if len(days_list) > 0:
            benchmark_data.append({
                'Stage': label,
                'Sample Size': len(days_list),
                'Avg Days': round(np.mean(days_list), 1),
                'Median Days': round(np.median(days_list), 1),
                'Min': min(days_list),
                'Max': max(days_list)
            })
    
    pd.DataFrame(benchmark_data).to_excel(writer, sheet_name='Process Benchmark', index=False)

print(f'\n\nOutput saved to: {output_path}')

# Print final benchmark summary
print('\n\n' + '='*80)
print('PROCESS IMPROVEMENT BENCHMARK (Key Transitions)')
print('='*80)
print('\n{:<30} {:>8} {:>10} {:>12} {:>8} {:>8}'.format(
    'Stage Transition', 'Count', 'Avg Days', 'Median Days', 'Min', 'Max'))
print('-'*80)

for transition_key, label in key_transitions:
    days_list = transitions.get(transition_key, [])
    if len(days_list) > 0:
        print('{:<30} {:>8} {:>10.1f} {:>12.1f} {:>8} {:>8}'.format(
            label, len(days_list), np.mean(days_list), np.median(days_list), 
            min(days_list), max(days_list)))

