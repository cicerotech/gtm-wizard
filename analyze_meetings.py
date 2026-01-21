import pandas as pd
import numpy as np

df = pd.read_excel('/Users/keiganpesenti/Desktop/meetings with accounts.xlsx')
df['Date'] = pd.to_datetime(df['Date'])

# Step 1: Deduplicate - same account + date + subject = one meeting
df_dedup = df.drop_duplicates(subset=['Company / Account', 'Date', 'Subject'])
print(f'Original rows: {len(df)}')
print(f'After dedup: {len(df_dedup)}')
print(f'Duplicates removed: {len(df) - len(df_dedup)}')

# Step 2: Classify meeting types
def classify_meeting(subject):
    s = str(subject).lower()
    
    # Order matters - check more specific patterns first
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

print('\n=== MEETING TYPE DISTRIBUTION (after dedup) ===')
print(df_dedup['Meeting Type'].value_counts())

# Step 3: For each account, get first occurrence of each meeting type
print('\n\n=== SAMPLE ACCOUNT TIMELINES ===')
accounts_with_multiple = df_dedup.groupby('Company / Account').size()
sample_accounts = accounts_with_multiple[accounts_with_multiple >= 3].head(10).index.tolist()

for acct in sample_accounts[:5]:
    acct_df = df_dedup[df_dedup['Company / Account'] == acct].sort_values('Date')
    print(f'\n{acct}:')
    for _, row in acct_df.iterrows():
        date_str = row['Date'].strftime('%Y-%m-%d')
        meeting_type = row['Meeting Type']
        subject = row['Subject'][:60]
        print(f'  {date_str} | {meeting_type:20} | {subject}')

# Step 4: Calculate days between meeting types for each account
print('\n\n=== DAYS BETWEEN MEETING STAGES ===')

results = []

for acct in df_dedup['Company / Account'].unique():
    acct_df = df_dedup[df_dedup['Company / Account'] == acct].sort_values('Date')
    
    # Get first date for each meeting type
    first_dates = {}
    for _, row in acct_df.iterrows():
        mt = row['Meeting Type']
        if mt not in first_dates:
            first_dates[mt] = row['Date']
    
    # Get the very first meeting date (any type)
    first_meeting = acct_df['Date'].min()
    
    # Calculate days from first meeting to each type
    result = {
        'Account': acct,
        'First Meeting Date': first_meeting,
        'First Meeting Type': acct_df.iloc[0]['Meeting Type'],
        'Total Meetings': len(acct_df)
    }
    
    # Days to specific meeting types
    for mt in ['Introduction', 'Follow-up', 'CAB Discussion', 'Demo', 'Use Case Identification', 'Scoping', 'Product Demo']:
        if mt in first_dates:
            days = (first_dates[mt] - first_meeting).days
            result[f'Days to {mt}'] = days
        else:
            result[f'Days to {mt}'] = np.nan
    
    results.append(result)

results_df = pd.DataFrame(results)

# Show summary statistics
print('\n=== SUMMARY STATISTICS (Days from First Meeting to Each Type) ===')
cols_to_analyze = [c for c in results_df.columns if c.startswith('Days to')]
for col in cols_to_analyze:
    valid = results_df[col].dropna()
    if len(valid) > 0:
        print(f'\n{col}:')
        print(f'  Count: {len(valid)}')
        print(f'  Mean: {valid.mean():.1f} days')
        print(f'  Median: {valid.median():.1f} days')
        print(f'  Min: {valid.min():.0f} days')
        print(f'  Max: {valid.max():.0f} days')

# Save to Excel
output_path = '/Users/keiganpesenti/Desktop/meetings_analysis_output.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    df_dedup.to_excel(writer, sheet_name='Deduplicated Meetings', index=False)
    results_df.to_excel(writer, sheet_name='Account Timeline Summary', index=False)
    
    # Summary stats
    summary_data = []
    for col in cols_to_analyze:
        valid = results_df[col].dropna()
        if len(valid) > 0:
            summary_data.append({
                'Metric': col.replace('Days to ', ''),
                'Count': len(valid),
                'Mean (days)': round(valid.mean(), 1),
                'Median (days)': round(valid.median(), 1),
                'Min (days)': int(valid.min()),
                'Max (days)': int(valid.max())
            })
    pd.DataFrame(summary_data).to_excel(writer, sheet_name='Summary Statistics', index=False)

print(f'\n\nOutput saved to: {output_path}')

