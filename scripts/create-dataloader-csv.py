#!/usr/bin/env python3
"""
Phase 5: Create Data Loader CSV with Validated Corrections
Consolidated file ready for Salesforce import

IMPORTANT: Following plan rules:
- Safe Updates: Term corrections, End Date alignment, JH_Original_ACV__c population
- Do NOT change Amount/Revenue fields to protect run rate totals
- All changes are traceable via JH_Original_ACV__c and ACV_Variance_Reason__c
"""

import pandas as pd
import os
from datetime import datetime

pd.set_option('display.max_rows', 200)
pd.set_option('display.width', 500)
pd.set_option('display.max_colwidth', 60)

# Load the Excel file
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/revenue audit 1.xlsx'))

eudia_all = pd.read_excel(xl, sheet_name='Eudia All Time Won')
jh_full = pd.read_excel(xl, sheet_name='Johnson Hana 20204-2025 won')
eudia_dec = pd.read_excel(xl, sheet_name='Eudia SF')

# Convert dates
jh_full['Scheduled End Date'] = pd.to_datetime(jh_full['Scheduled End Date'], errors='coerce')

print('=' * 100)
print('DATA LOADER CSV GENERATION')
print('=' * 100)
print()

# =============================================================================
# BUILD CONSOLIDATED CORRECTIONS
# =============================================================================

corrections = []
processed_ids = set()

# Match each EUDIA opportunity to JH
for _, e in eudia_all.iterrows():
    e_id = e['Opportunity ID']
    e_acct = e['Account Name: Account Name']
    e_opp = e['Opportunity Name']
    e_rev = e['Revenue']
    e_term = e['Term (Months)']
    e_end = e['End Date']
    
    if e_id in processed_ids:
        continue
    
    # Find JH match
    jh_acct = jh_full[jh_full['Account Name'].str.lower().str.contains(str(e_acct).lower()[:15], na=False, regex=False)]
    
    best_match = None
    best_score = 0
    
    for _, j in jh_acct.iterrows():
        j_opp = str(j['Opportunity Name'])
        e_words = set(str(e_opp).lower().split())
        j_words = set(j_opp.lower().split())
        overlap = len(e_words & j_words)
        
        if overlap > best_score:
            best_score = overlap
            best_match = j
    
    if best_match is not None and best_score >= 2:
        j_acv = best_match['ACV (USD)']
        j_term = best_match['Term']
        j_end = best_match['Scheduled End Date']
        
        # Calculate variance
        variance = e_rev - j_acv if pd.notna(e_rev) and pd.notna(j_acv) else None
        
        # Determine variance reason
        variance_reason = None
        if variance is not None:
            if abs(variance) < 100:
                variance_reason = 'No Variance'
            elif variance > 0:
                # EUDIA higher than JH
                if abs(variance) > e_rev * 0.5:
                    variance_reason = 'Bundle Allocation'
                else:
                    variance_reason = 'Rate Adjustment'
            else:
                # EUDIA lower than JH
                if abs(variance) > j_acv * 0.5:
                    variance_reason = 'Multi-Year Annualization'
                else:
                    variance_reason = 'Term Difference'
        
        # Check for November RR Revenue
        if 'november rr' in str(e_opp).lower():
            variance_reason = 'Run Rate Capture'
        
        # Term correction needed?
        term_correction = None
        if pd.notna(j_term) and pd.notna(e_term) and j_term != e_term:
            # JH shows term as contracted; EUDIA might have annualized
            # Only flag significant differences
            if abs(j_term - e_term) >= 2:
                term_correction = j_term
        
        # End date correction
        end_date_correction = None
        if pd.notna(j_end) and j_end.year > 1970:  # Valid date
            end_date_correction = j_end.strftime('%Y-%m-%d')
        
        corrections.append({
            'Id': e_id,
            'Account': e_acct[:40],
            'Opportunity': e_opp[:50],
            'Current_Revenue': e_rev,
            'JH_Original_ACV__c': j_acv,
            'ACV_Variance_Reason__c': variance_reason,
            'Current_Term': e_term,
            'JH_Term': j_term,
            'Term_Correction': term_correction,
            'JH_End_Date': end_date_correction,
            'Variance_Amount': variance,
            'Match_Score': best_score
        })
        processed_ids.add(e_id)

corr_df = pd.DataFrame(corrections)

print(f"Total opportunities matched: {len(corr_df)}")
print()

# =============================================================================
# FILTER TO ACTIONABLE CORRECTIONS
# =============================================================================

# 1. JH ACV Population (all matched opps)
jh_acv_updates = corr_df[corr_df['JH_Original_ACV__c'].notna()][['Id', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']].copy()
jh_acv_updates.columns = ['Id', 'JH_Original_ACV__c', 'ACV_Variance_Reason__c']

# 2. Term Corrections (where JH differs significantly)
term_updates = corr_df[corr_df['Term_Correction'].notna()][['Id', 'Term_Correction']].copy()
term_updates.columns = ['Id', 'Term_Months__c']

print('SUMMARY OF CORRECTIONS:')
print('-' * 60)
print(f"JH ACV population: {len(jh_acv_updates)} opportunities")
print(f"Term corrections: {len(term_updates)} opportunities")
print()

# =============================================================================
# SAFE UPDATE FILE (JH ACV + Variance Reason only - NO revenue impact)
# =============================================================================
output_dir = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/'

# Safe JH ACV updates
safe_updates = jh_acv_updates.copy()
safe_updates.to_csv(output_dir + 'dataloader-safe-jh-acv.csv', index=False)
print(f"Safe JH ACV updates saved to: {output_dir}dataloader-safe-jh-acv.csv")
print(f"   Records: {len(safe_updates)}")
print()

# =============================================================================
# TERM CORRECTIONS (Separate file - requires review)
# =============================================================================
if len(term_updates) > 0:
    # Merge with account info for context
    term_detail = corr_df[corr_df['Term_Correction'].notna()][['Id', 'Account', 'Opportunity', 'Current_Term', 'Term_Correction', 'Current_Revenue', 'JH_Original_ACV__c']].copy()
    term_detail.to_csv(output_dir + 'dataloader-term-corrections.csv', index=False)
    print(f"Term corrections saved to: {output_dir}dataloader-term-corrections.csv")
    print(f"   Records: {len(term_detail)}")
    print()
    
    print('TERM CORRECTIONS DETAIL:')
    print('-' * 60)
    for _, row in term_detail.head(15).iterrows():
        print(f"   {row['Account'][:30]}")
        print(f"      {row['Opportunity'][:45]}")
        print(f"      Current: {row['Current_Term']} mo → Correct: {row['Term_Correction']} mo")
        print()

# =============================================================================
# VARIANCE SUMMARY
# =============================================================================
print()
print('VARIANCE REASON DISTRIBUTION:')
print('-' * 60)
for reason, group in corr_df.groupby('ACV_Variance_Reason__c'):
    if pd.notna(reason):
        total_variance = group['Variance_Amount'].sum()
        print(f"   {reason}: {len(group)} opps, Net Variance: ${total_variance:,.2f}")

# =============================================================================
# CONSOLIDATED DATALOADER FILE (ALL SAFE UPDATES)
# =============================================================================
print()
print('=' * 100)
print('CONSOLIDATED DATA LOADER FILE')
print('=' * 100)

# Merge all updates by ID
final_updates = jh_acv_updates.copy()
if len(term_updates) > 0:
    final_updates = final_updates.merge(term_updates, on='Id', how='left')

# Export
final_updates.to_csv(output_dir + 'dataloader-final-consolidated.csv', index=False)
print(f"Consolidated file saved to: {output_dir}dataloader-final-consolidated.csv")
print(f"   Total records: {len(final_updates)}")
print()

# Show sample
print('Sample records (first 10):')
print('-' * 100)
print(final_updates.head(10).to_string())

# =============================================================================
# REVENUE IMPACT ANALYSIS
# =============================================================================
print()
print('=' * 100)
print('REVENUE IMPACT ANALYSIS')
print('=' * 100)
print()

# Total current revenue in matched opps
total_current = corr_df['Current_Revenue'].sum()
total_jh_acv = corr_df['JH_Original_ACV__c'].sum()
net_variance = total_current - total_jh_acv

print(f"Matched Opportunities:")
print(f"   EUDIA Total Revenue: ${total_current:,.2f}")
print(f"   JH Total ACV: ${total_jh_acv:,.2f}")
print(f"   Net Variance: ${net_variance:,.2f}")
print()

print('IMPORTANT: These updates do NOT change the Amount/Revenue fields.')
print('The JH_Original_ACV__c field is for documentation and reconciliation only.')
print('Active Revenue totals will remain unchanged.')
print()

# December-specific analysis
dec_corrections = corr_df[corr_df['JH_End_Date'].notna() & (corr_df['JH_End_Date'].str.startswith('2025-12') | corr_df['JH_End_Date'].str.startswith('2026-01'))]
print(f"December/January expiring (in matched set): {len(dec_corrections)} opportunities")
print(f"   Current Revenue: ${dec_corrections['Current_Revenue'].sum():,.2f}")
print(f"   JH ACV: ${dec_corrections['JH_Original_ACV__c'].sum():,.2f}")

print()
print('Data Loader CSV generation complete.')

