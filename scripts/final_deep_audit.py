#!/usr/bin/env python3
"""
FINAL COMPREHENSIVE CLOSED WON AUDIT - Production Ready
=========================================================
This script produces DATA LOADER READY outputs with:
1. Accurate BL attribution based on account ownership
2. Tenure-aware validation (new BLs can't own old deals)
3. Duplicate detection
4. $100K placeholder removal

Key Insight: Records owned by "Keigan Pesenti" should be RE-ATTRIBUTED 
to the BL who currently owns that account, UNLESS that BL wasn't 
employed at the close date.
"""

import pandas as pd
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
# BL TENURE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
BL_START_DATES = {
    # NEW THIS QUARTER - CANNOT own historical pre-Q4 FY25
    'Tom Clancy': datetime(2025, 11, 1),
    'Emer Flynn': datetime(2025, 11, 1),
    
    # RAMPED BLs - CAN own historical
    'Nathan Shine': datetime(2022, 6, 1),
    'Alex Fox': datetime(2022, 6, 1),
    'Julie Stefanich': datetime(2021, 1, 1),
    'Olivia Jung': datetime(2023, 6, 1),
    'Justin Hills': datetime(2023, 6, 1),
    'Asad Hussain': datetime(2024, 3, 1),
    'Ananth Cherukupally': datetime(2024, 6, 1),
    'Conor Molloy': datetime(2024, 3, 1),
    
    # ADMIN - Fallback for unattributable
    'Keigan Pesenti': datetime(2018, 1, 1),
}

CORRECT_STAGE = 'Stage 6. Closed(Won)'

# ═══════════════════════════════════════════════════════════════════════════════
# LOAD AND PREPARE DATA
# ═══════════════════════════════════════════════════════════════════════════════
file_path = '/Users/keiganpesenti/Desktop/Closed Won Audit for BL Attribution.xlsx'

true_won = pd.read_excel(file_path, sheet_name='TRUE WON THIS QUARTER')
potential_dups = pd.read_excel(file_path, sheet_name='POTENTIAL DUPS FOR AUDIT')

# Rename columns
true_won.columns = ['Opp_ID', 'Owner', 'Account_ID', 'Account', 'Opp_Name', 'Revenue_Type', 'Close_Date', 'ACV', 'Revenue']
potential_dups.columns = ['Opp_ID', 'Owner', 'Account_ID', 'Account', 'Opp_Name', 'Revenue_Type', 'Close_Date', 'ACV', 'Revenue']

# Convert dates
true_won['Close_Date'] = pd.to_datetime(true_won['Close_Date'], errors='coerce')
potential_dups['Close_Date'] = pd.to_datetime(potential_dups['Close_Date'], errors='coerce')

print("="*100)
print("FINAL PRODUCTION AUDIT - DATA LOADER READY")
print("="*100)

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD ACCOUNT -> OWNER MAPPING (from TRUE WON)
# ═══════════════════════════════════════════════════════════════════════════════
# This tells us who SHOULD own each account
account_owner_map = true_won.groupby('Account')['Owner'].first().to_dict()

print(f"\nAccount ownership map from TRUE WON ({len(account_owner_map)} accounts):")
for acct, owner in sorted(account_owner_map.items()):
    print(f"  {acct}: {owner}")

# ═══════════════════════════════════════════════════════════════════════════════
# PROCESS EACH RECORD
# ═══════════════════════════════════════════════════════════════════════════════
results = []
deletes = []

for idx, row in potential_dups.iterrows():
    opp_id = row['Opp_ID']
    account = row['Account']
    opp_name = row['Opp_Name']
    close_date = row['Close_Date']
    acv = row['ACV']
    current_owner = row['Owner']
    
    # ─── CHECK 1: $100K Placeholder ───
    if acv == 100000:
        deletes.append({
            'Opp_ID': opp_id,
            'Account': account,
            'Opp_Name': opp_name,
            'Close_Date': close_date,
            'ACV': acv,
            'Reason': 'DELETE: $100K placeholder value'
        })
        continue
    
    # ─── CHECK 2: Duplicate of TRUE WON ───
    matching_true_won = true_won[
        (true_won['Account'] == account) & 
        (abs((true_won['Close_Date'] - close_date).dt.days) <= 60)
    ]
    if len(matching_true_won) > 0:
        for _, tw in matching_true_won.iterrows():
            if acv > 0 and tw['ACV'] > 0:
                acv_diff_pct = abs(acv - tw['ACV']) / max(acv, tw['ACV'])
                if acv_diff_pct <= 0.15:  # Within 15%
                    deletes.append({
                        'Opp_ID': opp_id,
                        'Account': account,
                        'Opp_Name': opp_name,
                        'Close_Date': close_date,
                        'ACV': acv,
                        'Reason': f"DELETE: Duplicate of TRUE WON '{tw['Opp_Name']}'"
                    })
                    continue
    
    # ─── DETERMINE CORRECT OWNER ───
    # Priority:
    # 1. If account is in TRUE WON, use that owner (if tenure allows)
    # 2. Otherwise keep current owner (if tenure allows)
    # 3. Fallback to Keigan Pesenti
    
    recommended_owner = None
    owner_rationale = None
    
    # Try account owner from TRUE WON first
    if account in account_owner_map:
        suggested = account_owner_map[account]
        if suggested in BL_START_DATES:
            bl_start = BL_START_DATES[suggested]
            if pd.notna(close_date) and close_date >= bl_start:
                recommended_owner = suggested
                owner_rationale = f'Account owner from TRUE WON (tenure valid from {bl_start.strftime("%Y-%m")})'
            else:
                # BL wasn't employed yet - check for alternative
                owner_rationale = f'{suggested} not employed at close date ({close_date.strftime("%Y-%m-%d") if pd.notna(close_date) else "unknown"})'
        else:
            # Unknown BL - use as-is
            recommended_owner = suggested
            owner_rationale = 'Account owner from TRUE WON'
    
    # If no valid recommendation yet, try current owner
    if recommended_owner is None:
        if current_owner in BL_START_DATES:
            bl_start = BL_START_DATES[current_owner]
            if pd.notna(close_date) and close_date >= bl_start:
                recommended_owner = current_owner
                owner_rationale = f'Current owner valid (tenure from {bl_start.strftime("%Y-%m")})'
            else:
                # Current owner wasn't employed - need fallback
                pass
        elif current_owner == 'Keigan Pesenti':
            # Keigan is default - try to re-attribute if possible
            pass
    
    # Final fallback: Use Keigan for historical EU records
    if recommended_owner is None:
        recommended_owner = 'Keigan Pesenti'
        owner_rationale = 'Fallback: Historical EU record or no valid BL for date'
    
    # Determine if owner change is needed
    owner_change = current_owner != recommended_owner
    
    results.append({
        'Opp_ID': opp_id,
        'Account_ID': row['Account_ID'],
        'Account': account,
        'Opp_Name': opp_name,
        'Close_Date': close_date,
        'Year': close_date.year if pd.notna(close_date) else None,
        'ACV': acv,
        'Revenue_Type': row['Revenue_Type'],
        'Current_Owner': current_owner,
        'Recommended_Owner': recommended_owner,
        'Owner_Change_Needed': 'YES' if owner_change else 'NO',
        'Owner_Rationale': owner_rationale,
        'New_Stage': CORRECT_STAGE
    })

results_df = pd.DataFrame(results)
deletes_df = pd.DataFrame(deletes)

# ═══════════════════════════════════════════════════════════════════════════════
# ANALYSIS SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("ANALYSIS RESULTS")
print("="*100)

print(f"\nDELETES: {len(deletes_df)} records")
print(f"UPDATES: {len(results_df)} records")

# Owner change breakdown
owner_changes = results_df[results_df['Owner_Change_Needed'] == 'YES']
print(f"\nOWNER CHANGES NEEDED: {len(owner_changes)}")

if len(owner_changes) > 0:
    print("\nOwner transition summary:")
    transition = owner_changes.groupby(['Current_Owner', 'Recommended_Owner']).agg({
        'Opp_ID': 'count',
        'ACV': 'sum'
    }).rename(columns={'Opp_ID': 'Count'}).reset_index()
    print(transition.to_string())

# By recommended owner
print("\nFinal attribution by BL:")
final_attribution = results_df.groupby('Recommended_Owner').agg({
    'Opp_ID': 'count',
    'ACV': 'sum'
}).rename(columns={'Opp_ID': 'Count'}).sort_values('ACV', ascending=False)
print(final_attribution.to_string())

# By year
print("\nBy year:")
by_year = results_df.groupby('Year').agg({
    'Opp_ID': 'count',
    'ACV': 'sum'
}).rename(columns={'Opp_ID': 'Count'})
print(by_year.to_string())

# ═══════════════════════════════════════════════════════════════════════════════
# DETAILED 2025+ RECORDS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("HIGH PRIORITY: 2025+ RECORDS (DETAILED)")
print("="*100)

high_priority = results_df[results_df['Year'] >= 2025].sort_values('Close_Date')
print(f"\nTotal: {len(high_priority)} records, ${high_priority['ACV'].sum():,.0f}")

# Show each 2025+ record with attribution
print("\n{:<20} {:<50} {:<12} {:>12} {:<20} {:<30}".format(
    'Opp_ID', 'Opp_Name', 'Close_Date', 'ACV', 'Recommended_Owner', 'Rationale'
))
print("-"*160)
for _, row in high_priority.iterrows():
    print("{:<20} {:<50} {:<12} {:>12,.0f} {:<20} {:<30}".format(
        row['Opp_ID'][-15:],
        row['Opp_Name'][:48],
        row['Close_Date'].strftime('%Y-%m-%d') if pd.notna(row['Close_Date']) else '',
        row['ACV'],
        row['Recommended_Owner'],
        row['Owner_Rationale'][:28]
    ))

# ═══════════════════════════════════════════════════════════════════════════════
# GENERATE DATA LOADER FILES
# ═══════════════════════════════════════════════════════════════════════════════
output_path = '/Users/keiganpesenti/Desktop/FINAL_Closed_Won_DataLoader_PRODUCTION.xlsx'

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # SHEET 1: EXECUTIVE SUMMARY
    summary = pd.DataFrame({
        'Action': ['DELETE Records', 'UPDATE Stage Only', 'UPDATE Stage + Owner', 'TOTAL UPDATES'],
        'Count': [
            len(deletes_df),
            len(results_df[results_df['Owner_Change_Needed'] == 'NO']),
            len(results_df[results_df['Owner_Change_Needed'] == 'YES']),
            len(results_df)
        ],
        'ACV': [
            deletes_df['ACV'].sum() if len(deletes_df) > 0 else 0,
            results_df[results_df['Owner_Change_Needed'] == 'NO']['ACV'].sum(),
            results_df[results_df['Owner_Change_Needed'] == 'YES']['ACV'].sum(),
            results_df['ACV'].sum()
        ]
    })
    summary.to_excel(writer, sheet_name='SUMMARY', index=False)
    
    # SHEET 2: DELETES
    if len(deletes_df) > 0:
        deletes_df.to_excel(writer, sheet_name='DELETE THESE', index=False)
    
    # SHEET 3: ALL UPDATES - Full detail
    results_df.to_excel(writer, sheet_name='ALL UPDATES - Detail', index=False)
    
    # SHEET 4: DATA LOADER - Stage Only (no owner change)
    stage_only = results_df[results_df['Owner_Change_Needed'] == 'NO'][['Opp_ID', 'New_Stage']].copy()
    stage_only.columns = ['Id', 'StageName']
    stage_only.to_excel(writer, sheet_name='DL_STAGE_ONLY', index=False)
    
    # SHEET 5: DATA LOADER - Stage + Owner
    stage_owner = results_df[results_df['Owner_Change_Needed'] == 'YES'][
        ['Opp_ID', 'New_Stage', 'Recommended_Owner', 'Current_Owner', 'Account', 'Opp_Name', 'ACV', 'Owner_Rationale']
    ].copy()
    stage_owner.to_excel(writer, sheet_name='DL_STAGE_AND_OWNER', index=False)
    
    # SHEET 6: HIGH PRIORITY 2025+
    high_priority.to_excel(writer, sheet_name='HIGH PRIORITY 2025+', index=False)
    
    # SHEET 7: USER ID LOOKUP
    user_lookup = pd.DataFrame({
        'BL_Name': list(BL_START_DATES.keys()),
        'Start_Date': [d.strftime('%Y-%m-%d') for d in BL_START_DATES.values()],
        'User_ID': ['[FILL IN FROM SF]'] * len(BL_START_DATES)
    })
    user_lookup.to_excel(writer, sheet_name='USER ID LOOKUP', index=False)

print(f"\n*** PRODUCTION FILE SAVED: {output_path} ***")

# ═══════════════════════════════════════════════════════════════════════════════
# CRITICAL VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("CRITICAL VALIDATION CHECKS")
print("="*100)

# Check for Tom Clancy / Emer Flynn owning pre-Q4 deals
new_bl_issues = results_df[
    (results_df['Recommended_Owner'].isin(['Tom Clancy', 'Emer Flynn'])) &
    (results_df['Close_Date'] < datetime(2025, 11, 1))
]
if len(new_bl_issues) > 0:
    print(f"\n⚠️  WARNING: {len(new_bl_issues)} records would be attributed to new BLs before their start date!")
    print(new_bl_issues[['Opp_ID', 'Account', 'Close_Date', 'Recommended_Owner']].to_string())
else:
    print("\n✓ No tenure violations for new BLs (Tom Clancy, Emer Flynn)")

# Check for very large ACV records
large_acv = results_df[results_df['ACV'] > 500000]
print(f"\n✓ Large ACV records (>$500K): {len(large_acv)}")
if len(large_acv) > 0:
    print(large_acv[['Opp_ID', 'Account', 'ACV', 'Recommended_Owner']].to_string())

# Final counts
print("\n" + "="*100)
print("FINAL ACTION SUMMARY")
print("="*100)
print(f"""
DELETE: {len(deletes_df)} records
  - $100K placeholders: {len(deletes_df[deletes_df['Reason'].str.contains('100K')])}
  - Duplicates: {len(deletes_df[deletes_df['Reason'].str.contains('Duplicate')])}

UPDATE STAGE TO "{CORRECT_STAGE}": {len(results_df)} records
  - Stage only (keep current owner): {len(stage_only)}
  - Stage + Owner change: {len(stage_owner)}

BY RECOMMENDED OWNER:
""")

for owner, group in results_df.groupby('Recommended_Owner'):
    print(f"  {owner}: {len(group)} records, ${group['ACV'].sum():,.0f}")

print(f"""
DATA LOADER FILES:
  1. DELETE THESE: Use Id column for delete operation
  2. DL_STAGE_ONLY: Use for bulk stage update (no owner change)
  3. DL_STAGE_AND_OWNER: Requires User ID lookup, then update

LOCATION: {output_path}
""")

