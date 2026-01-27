#!/usr/bin/env python3
"""Generate comprehensive audit summary"""

import pandas as pd
from datetime import datetime

file_path = '/Users/keiganpesenti/Desktop/Closed Won Audit for BL Attribution.xlsx'

true_won = pd.read_excel(file_path, sheet_name='TRUE WON THIS QUARTER')
potential_dups = pd.read_excel(file_path, sheet_name='POTENTIAL DUPS FOR AUDIT')

# Convert dates
potential_dups['Close Date'] = pd.to_datetime(potential_dups['Close Date'], errors='coerce')
potential_dups['Year'] = potential_dups['Close Date'].dt.year

print("="*80)
print("EXECUTIVE SUMMARY - CLOSED WON AUDIT")
print("="*80)

print(f"""
VALIDATED DATA (TRUE WON THIS QUARTER):
  Records: {len(true_won)}
  Total ACV: ${true_won['ACV'].sum():,.0f}
  
NEEDS REVIEW (POTENTIAL DUPS FOR AUDIT):
  Records: {len(potential_dups)}
  Total ACV: ${potential_dups['ACV'].sum():,.0f}
""")

print("="*80)
print("YEAR-BY-YEAR BREAKDOWN OF POTENTIAL DUPS")
print("="*80)
year_summary = potential_dups.groupby('Year').agg({
    'ID_Oppt_18': 'count',
    'ACV': 'sum'
}).rename(columns={'ID_Oppt_18': 'Count'})
year_summary['ACV'] = year_summary['ACV'].apply(lambda x: f"${x:,.0f}")
print(year_summary)

# Critical: 2025 records
print("\n" + "="*80)
print("CRITICAL: 2025+ RECORDS (NEEDS IMMEDIATE ATTENTION)")
print("="*80)
recent = potential_dups[potential_dups['Year'] >= 2025].sort_values('Close Date')
print(f"\nTotal 2025+ records: {len(recent)}")
print(f"Total 2025+ ACV: ${recent['ACV'].sum():,.0f}")
print("\nRecords:")
print(recent[['Account Name: Account Name', 'Opportunity Name', 'Close Date', 'ACV']].to_string())

# Categorization recommendations
print("\n" + "="*80)
print("CATEGORIZATION RECOMMENDATIONS")
print("="*80)

# 1. $100K placeholders
placeholder_100k = potential_dups[potential_dups['ACV'] == 100000]
print(f"\n1. $100K PLACEHOLDERS (LIKELY DELETE): {len(placeholder_100k)} records")

# 2. Pre-2025 records (less critical, but still historical)
pre_2024 = potential_dups[potential_dups['Year'] < 2024]
print(f"\n2. PRE-2024 RECORDS (LOW PRIORITY): {len(pre_2024)} records, ${pre_2024['ACV'].sum():,.0f}")

# 3. 2024 records (medium priority)
y2024 = potential_dups[potential_dups['Year'] == 2024]
print(f"\n3. 2024 RECORDS (MEDIUM PRIORITY): {len(y2024)} records, ${y2024['ACV'].sum():,.0f}")

# 4. 2025+ records (HIGH priority)
print(f"\n4. 2025+ RECORDS (HIGH PRIORITY): {len(recent)} records, ${recent['ACV'].sum():,.0f}")

# Owner re-attribution mapping
print("\n" + "="*80)
print("OWNER RE-ATTRIBUTION FROM TRUE WON ACCOUNTS")
print("="*80)
true_won_mapping = true_won.groupby('Account Name: Account Name')['Opportunity Owner: Full Name'].first().to_dict()
keigan_2025 = recent[recent['Opportunity Owner: Full Name'] == 'Keigan Pesenti']

print(f"\n2025+ records owned by Keigan that need re-attribution:")
for idx, row in keigan_2025.iterrows():
    acct = row['Account Name: Account Name']
    suggested = true_won_mapping.get(acct, 'NO MATCH - MANUAL REVIEW')
    print(f"  {acct}: ${row['ACV']:,.0f} -> Suggested Owner: {suggested}")

# Generate action Excel
output_path = '/Users/keiganpesenti/Desktop/BL_Attribution_Recommendations.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    # 1. 2025+ records (HIGH PRIORITY)
    recent_with_suggested = recent.copy()
    recent_with_suggested['Suggested Owner'] = recent_with_suggested['Account Name: Account Name'].map(
        lambda x: true_won_mapping.get(x, 'MANUAL REVIEW')
    )
    recent_with_suggested.to_excel(writer, sheet_name='HIGH PRIORITY 2025+', index=False)
    
    # 2. 2024 records (MEDIUM PRIORITY)
    y2024_with_suggested = y2024.copy()
    y2024_with_suggested['Suggested Owner'] = y2024_with_suggested['Account Name: Account Name'].map(
        lambda x: true_won_mapping.get(x, 'MANUAL REVIEW')
    )
    y2024_with_suggested.to_excel(writer, sheet_name='MEDIUM PRIORITY 2024', index=False)
    
    # 3. $100K placeholders (DELETE)
    placeholder_100k.to_excel(writer, sheet_name='DELETE $100K Placeholders', index=False)
    
    # 4. Pre-2024 (LOW PRIORITY)
    pre_2024.to_excel(writer, sheet_name='LOW PRIORITY pre-2024', index=False)
    
    # 5. Summary
    summary_df = pd.DataFrame({
        'Category': ['High Priority (2025+)', 'Medium Priority (2024)', '$100K Placeholders', 'Low Priority (pre-2024)', 'TOTAL'],
        'Count': [len(recent), len(y2024), len(placeholder_100k), len(pre_2024), len(potential_dups)],
        'Total ACV': [recent['ACV'].sum(), y2024['ACV'].sum(), placeholder_100k['ACV'].sum(), pre_2024['ACV'].sum(), potential_dups['ACV'].sum()],
        'Action': ['Re-attribute + Reclassify Stage', 'Review + Re-attribute', 'DELETE', 'Keep as historical (low priority)', '']
    })
    summary_df.to_excel(writer, sheet_name='SUMMARY', index=False)

print(f"\n*** Recommendations saved to: {output_path} ***")

