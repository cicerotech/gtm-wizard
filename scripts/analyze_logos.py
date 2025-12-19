import pandas as pd
from datetime import datetime

df = pd.read_excel('/Users/keiganpesenti/Desktop/4444.xlsx')
df['First Deal Closed'] = pd.to_datetime(df['First Deal Closed'])

def get_quarter(date):
    if pd.isna(date):
        return 'Unknown'
    month = date.month
    year = date.year
    
    if month == 11 or month == 12:
        return f'Q4 {year}'
    elif month == 1:
        return f'Q4 {year - 1}'
    elif month >= 2 and month <= 4:
        return f'Q1 {year}'
    elif month >= 5 and month <= 7:
        return f'Q2 {year}'
    elif month >= 8 and month <= 10:
        return f'Q3 {year}'
    return 'Unknown'

df['Quarter'] = df['First Deal Closed'].apply(get_quarter)

print('=== LOGOS BY QUARTER ===')
quarter_order = ['Q4 2020', 'Q1 2021', 'Q2 2021', 'Q3 2021', 'Q4 2021', 
                 'Q1 2022', 'Q2 2022', 'Q3 2022', 'Q4 2022',
                 'Q1 2023', 'Q2 2023', 'Q3 2023', 'Q4 2023',
                 'Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024',
                 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025']
for q in quarter_order:
    count = len(df[df['Quarter'] == q])
    if count > 0:
        print(f'{q}: {count}')

print(f'\nTOTAL: {len(df)}')

print('\n=== LOGOS BY TYPE ===')
print(df['Type'].value_counts().to_string())

# FY2024 & Prior (before Nov 2024)
prior = df[df['First Deal Closed'] < datetime(2024, 11, 1)]
print(f'\n=== FY2024 & Prior: {len(prior)} logos ===')
for _, row in prior.iterrows():
    print(f"  - {row['Account Name']} (closed {row['First Deal Closed'].strftime('%Y-%m-%d')})")

# Q4 2024 (Nov 2024 - Jan 2025)
q4_2024 = df[df['Quarter'] == 'Q4 2024']
print(f'\n=== Q4 2024: {len(q4_2024)} logos ===')
for _, row in q4_2024.iterrows():
    print(f"  - {row['Account Name']}")

# Q4 2025 (Nov 2025 - Jan 2026) - current quarter
q4_2025 = df[df['Quarter'] == 'Q4 2025']
print(f'\n=== Q4 2025 (QTD): {len(q4_2025)} logos ===')
for _, row in q4_2025.iterrows():
    print(f"  - {row['Account Name']}")

