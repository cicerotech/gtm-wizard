#!/usr/bin/env python3
"""
Creates final Data Loader CSV file with revenue-neutral updates
"""

import pandas as pd
import os

xl = pd.ExcelFile(os.path.expanduser('~/Desktop/MASTER FILE.xlsx'))
active = pd.read_excel(xl, sheet_name='Active Rev + Projects - Eudia')
qtd = pd.read_excel(xl, sheet_name='QTD Closed Won - Eudia')
jh = pd.read_excel(xl, sheet_name='JOHNSON HANA CRM - WON YTD')

# Parse JH dates
jh['Close Date'] = pd.to_datetime(jh['Close Date'], format='mixed')
jh_q4 = jh[(jh['Close Date'] >= '2025-10-01') & (jh['Close Date'] <= '2025-12-31')].copy()

# Build final updates dataframe
updates = []

# Process QTD deals
for _, e_row in qtd.iterrows():
    e_id = e_row['Opportunity ID']
    e_acct = str(e_row['Account Name'])
    e_opp = str(e_row['Opportunity Name'])
    e_rev = e_row['Revenue']
    e_term = e_row['Term (Months)']
    
    # Check if November RR Revenue
    is_rr = 'November RR' in e_opp or 'RR Revenue' in e_opp
    
    # Find JH match
    jh_match = jh_q4[jh_q4['Account Name'].str.contains(e_acct[:15], case=False, na=False, regex=False)]
    
    jh_acv = None
    jh_term = None
    jh_opp_name = None
    matched = False
    
    for _, j_row in jh_match.iterrows():
        j_opp = str(j_row['Opportunity Name'])
        e_words = set(word.lower() for word in e_opp.split() if len(word) > 3)
        j_words = set(word.lower() for word in j_opp.split() if len(word) > 3)
        
        if len(e_words & j_words) >= 2:
            jh_acv = j_row['ACV ']
            jh_term = j_row['Term']
            jh_opp_name = j_row['Opportunity Name']
            matched = True
            break
    
    # Determine variance reason
    if is_rr:
        reason = 'Run Rate Capture'
    elif not matched:
        reason = None  # Skip if no JH match
    elif jh_acv and pd.notna(e_rev):
        variance = abs(e_rev - jh_acv)
        if variance < 500:
            reason = 'No Variance'
        elif variance > e_rev * 0.5:
            reason = 'Bundle Allocation'
        elif pd.notna(e_term) and pd.notna(jh_term) and e_term != jh_term:
            reason = 'Term Difference'
        else:
            reason = 'Rate Adjustment'
    else:
        reason = None
    
    # Determine if term update needed
    term_update = None
    if matched and pd.notna(e_term) and pd.notna(jh_term) and e_term != jh_term:
        term_update = int(jh_term)
    
    if reason or term_update or jh_acv:
        updates.append({
            'Id': e_id,
            'Account_Name': e_acct[:40],
            'Opportunity_Name': e_opp[:50],
            'JH_Original_ACV__c': jh_acv if jh_acv else '',
            'ACV_Variance_Reason__c': reason if reason else '',
            'Term_Months__c': term_update if term_update else '',
            'Notes': f'Matched to: {jh_opp_name[:40]}' if jh_opp_name else ('RR Capture' if is_rr else 'No JH match')
        })

# Create DataFrame
update_df = pd.DataFrame(updates)

# Save to CSV
output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/final-dataloader-updates.csv'
update_df.to_csv(output_path, index=False)

print('FINAL DATA LOADER FILE CREATED')
print('=' * 60)
print(f'Total records: {len(update_df)}')
print()
print('Updates by type:')
print(f"  With JH_Original_ACV: {len(update_df[update_df['JH_Original_ACV__c'] != ''])}")
print(f"  With Term corrections: {len(update_df[update_df['Term_Months__c'] != ''])}")
print(f"  With Variance Reason: {len(update_df[update_df['ACV_Variance_Reason__c'] != ''])}")
print()
print('Variance Reasons breakdown:')
print(update_df['ACV_Variance_Reason__c'].value_counts().to_string())
print()
print(f'File saved to: {output_path}')
print()
print('Preview:')
print(update_df[['Id', 'Account_Name', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c', 'Term_Months__c']].to_string())

