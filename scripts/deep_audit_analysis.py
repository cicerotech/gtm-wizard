#!/usr/bin/env python3
"""
COMPREHENSIVE CLOSED WON AUDIT - Deep Analysis
================================================
This script performs a rigorous, multi-layer analysis to prepare 
Data Loader-ready outputs for opportunity cleanup.

Validation Layers:
1. BL Tenure Validation - Don't attribute to BLs before their start date
2. Duplicate Detection - Cross-check against TRUE WON for actual duplicates
3. Amount Validation - Flag $100K placeholders and $0 records
4. Account Ownership Mapping - Use historical account ownership patterns
5. Date Reasonability - Ensure close dates are sensible
"""

import pandas as pd
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION - BL START DATES (CRITICAL FOR ATTRIBUTION)
# ═══════════════════════════════════════════════════════════════════════════════
BL_START_DATES = {
    # NEW THIS QUARTER - Cannot own historical opportunities
    'Tom Clancy': datetime(2025, 11, 1),      # Started Q4 FY25 (Nov 2025)
    'Emer Flynn': datetime(2025, 11, 1),      # Started Q4 FY25 (Nov 2025)
    
    # RAMPED BLs - Can own historical opportunities
    'Nathan Shine': datetime(2023, 1, 1),     # Ramped, historical OK
    'Alex Fox': datetime(2023, 1, 1),         # Ramped, historical OK
    'Julie Stefanich': datetime(2022, 1, 1),  # Ramped, historical OK
    'Olivia Jung': datetime(2024, 1, 1),      # Ramped, historical OK
    'Justin Hills': datetime(2024, 1, 1),     # Ramped, historical OK
    'Asad Hussain': datetime(2024, 6, 1),     # Ramped, historical OK
    'Ananth Cherukupally': datetime(2024, 9, 1),  # Newer but has some history
    
    # POTENTIALLY NEW - Need verification
    'Conor Molloy': datetime(2024, 6, 1),     # Unclear - being conservative
    
    # DEFAULT - Keigan owns historical EU records
    'Keigan Pesenti': datetime(2019, 1, 1),   # Admin/historical owner
}

# Correct stage name for Data Loader
CORRECT_STAGE = 'Stage 6. Closed(Won)'
LEGACY_STAGE = '6.) Closed-won'

# ═══════════════════════════════════════════════════════════════════════════════
# LOAD DATA
# ═══════════════════════════════════════════════════════════════════════════════
file_path = '/Users/keiganpesenti/Desktop/Closed Won Audit for BL Attribution.xlsx'

true_won = pd.read_excel(file_path, sheet_name='TRUE WON THIS QUARTER')
potential_dups = pd.read_excel(file_path, sheet_name='POTENTIAL DUPS FOR AUDIT')

# Standardize column names for easier processing
true_won.columns = ['Opp_ID', 'Owner', 'Account_ID', 'Account', 'Opp_Name', 'Revenue_Type', 'Close_Date', 'ACV', 'Revenue']
potential_dups.columns = ['Opp_ID', 'Owner', 'Account_ID', 'Account', 'Opp_Name', 'Revenue_Type', 'Close_Date', 'ACV', 'Revenue']

# Convert dates
true_won['Close_Date'] = pd.to_datetime(true_won['Close_Date'], errors='coerce')
potential_dups['Close_Date'] = pd.to_datetime(potential_dups['Close_Date'], errors='coerce')

print("="*100)
print("COMPREHENSIVE CLOSED WON AUDIT - DEEP ANALYSIS")
print("="*100)
print(f"\nData Loaded:")
print(f"  TRUE WON THIS QUARTER: {len(true_won)} records")
print(f"  POTENTIAL DUPS FOR AUDIT: {len(potential_dups)} records")

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1: DUPLICATE DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("LAYER 1: DUPLICATE DETECTION")
print("="*100)

def is_potential_duplicate(row, true_won_df):
    """
    Check if a potential dup is actually a duplicate of a TRUE WON record.
    Criteria: Same account + close date within 30 days + ACV within 10%
    """
    matches = true_won_df[true_won_df['Account'] == row['Account']]
    
    for _, tw_row in matches.iterrows():
        # Date within 30 days
        if pd.notna(row['Close_Date']) and pd.notna(tw_row['Close_Date']):
            date_diff = abs((row['Close_Date'] - tw_row['Close_Date']).days)
            if date_diff > 90:  # More than 90 days apart = different deal
                continue
        
        # ACV within 10% (or both small amounts)
        if row['ACV'] > 0 and tw_row['ACV'] > 0:
            acv_diff_pct = abs(row['ACV'] - tw_row['ACV']) / max(row['ACV'], tw_row['ACV'])
            if acv_diff_pct <= 0.15:  # Within 15%
                return True, tw_row['Opp_ID'], tw_row['Opp_Name']
    
    return False, None, None

# Check each potential dup
duplicates = []
for idx, row in potential_dups.iterrows():
    is_dup, matching_id, matching_name = is_potential_duplicate(row, true_won)
    if is_dup:
        duplicates.append({
            'Potential_Dup_ID': row['Opp_ID'],
            'Potential_Dup_Name': row['Opp_Name'],
            'Account': row['Account'],
            'ACV': row['ACV'],
            'Close_Date': row['Close_Date'],
            'TRUE_WON_Match_ID': matching_id,
            'TRUE_WON_Match_Name': matching_name,
            'Action': 'DELETE - Duplicate of TRUE WON record'
        })

duplicates_df = pd.DataFrame(duplicates)
print(f"\nActual Duplicates Found: {len(duplicates_df)}")
if len(duplicates_df) > 0:
    print(duplicates_df.to_string())

# Remove duplicates from processing
dup_ids = set(duplicates_df['Potential_Dup_ID']) if len(duplicates_df) > 0 else set()
remaining = potential_dups[~potential_dups['Opp_ID'].isin(dup_ids)].copy()
print(f"\nRecords remaining after removing duplicates: {len(remaining)}")

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2: FLAG $100K PLACEHOLDERS AND $0 RECORDS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("LAYER 2: PLACEHOLDER/TEST RECORD DETECTION")
print("="*100)

# $100K exactly = placeholder
placeholder_100k = remaining[remaining['ACV'] == 100000].copy()
placeholder_100k['Reason'] = '$100K placeholder value - likely test data'
print(f"\n$100K Placeholder Records: {len(placeholder_100k)}")
if len(placeholder_100k) > 0:
    print(placeholder_100k[['Opp_ID', 'Account', 'Opp_Name', 'Close_Date']].to_string())

# $0 records - may be valid (amendments) or invalid
zero_records = remaining[remaining['ACV'] == 0].copy()
zero_records['Reason'] = '$0 ACV - review if legitimate amendment'
print(f"\n$0 ACV Records: {len(zero_records)}")

# Remove placeholders from processing
placeholder_ids = set(placeholder_100k['Opp_ID'])
remaining = remaining[~remaining['Opp_ID'].isin(placeholder_ids)]
print(f"\nRecords remaining after removing $100K placeholders: {len(remaining)}")

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 3: BL TENURE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("LAYER 3: BL TENURE VALIDATION")
print("="*100)

def get_valid_owner(row, account_owner_map, true_won_df):
    """
    Determine the correct owner for an opportunity based on:
    1. If current owner can own it (based on tenure)
    2. Historical account ownership patterns
    3. Fallback to Keigan Pesenti for unattributable records
    """
    close_date = row['Close_Date']
    current_owner = row['Owner']
    account = row['Account']
    
    # If current owner is valid for this date, keep them
    if current_owner in BL_START_DATES:
        bl_start = BL_START_DATES[current_owner]
        if pd.notna(close_date) and close_date >= bl_start:
            return current_owner, 'Owner valid for close date'
    
    # Look up account owner from TRUE WON
    if account in account_owner_map:
        suggested_owner = account_owner_map[account]
        # Validate suggested owner against tenure
        if suggested_owner in BL_START_DATES:
            bl_start = BL_START_DATES[suggested_owner]
            if pd.notna(close_date) and close_date >= bl_start:
                return suggested_owner, f'Account owner from TRUE WON (tenure valid)'
            else:
                # Suggested owner wasn't employed yet
                pass
    
    # Find any ramped BL who was employed at close date
    ramped_bls = ['Nathan Shine', 'Alex Fox', 'Julie Stefanich']
    for bl in ramped_bls:
        if bl in BL_START_DATES:
            bl_start = BL_START_DATES[bl]
            if pd.notna(close_date) and close_date >= bl_start:
                # Check if this BL has any deals with this account
                bl_accounts = true_won_df[true_won_df['Owner'] == bl]['Account'].unique()
                if account in bl_accounts:
                    return bl, f'BL has other deals with this account'
    
    # Default: Keep with Keigan Pesenti for historical EU records
    return 'Keigan Pesenti', 'Historical EU record - admin ownership'

# Build account owner map from TRUE WON
account_owner_map = true_won.groupby('Account')['Owner'].first().to_dict()

# Process each remaining record
results = []
for idx, row in remaining.iterrows():
    recommended_owner, rationale = get_valid_owner(row, account_owner_map, true_won)
    
    owner_change_needed = row['Owner'] != recommended_owner
    
    results.append({
        'Opp_ID': row['Opp_ID'],
        'Account': row['Account'],
        'Opp_Name': row['Opp_Name'],
        'Close_Date': row['Close_Date'],
        'ACV': row['ACV'],
        'Revenue_Type': row['Revenue_Type'],
        'Current_Owner': row['Owner'],
        'Recommended_Owner': recommended_owner,
        'Owner_Change_Needed': 'YES' if owner_change_needed else 'NO',
        'Owner_Rationale': rationale,
        'New_Stage': CORRECT_STAGE,
        'Action': 'UPDATE Stage + Owner' if owner_change_needed else 'UPDATE Stage only'
    })

results_df = pd.DataFrame(results)

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 4: FINAL VALIDATION AND CATEGORIZATION
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("LAYER 4: FINAL CATEGORIZATION")
print("="*100)

# Categorize by year for prioritization
results_df['Year'] = pd.to_datetime(results_df['Close_Date']).dt.year

# Split by priority
high_priority = results_df[results_df['Year'] >= 2025].copy()
medium_priority = results_df[results_df['Year'] == 2024].copy()
low_priority = results_df[results_df['Year'] < 2024].copy()

print(f"\nHigh Priority (2025+): {len(high_priority)} records, ${high_priority['ACV'].sum():,.0f}")
print(f"Medium Priority (2024): {len(medium_priority)} records, ${medium_priority['ACV'].sum():,.0f}")
print(f"Low Priority (Pre-2024): {len(low_priority)} records, ${low_priority['ACV'].sum():,.0f}")

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5: OWNERSHIP SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("LAYER 5: OWNERSHIP CHANGE SUMMARY")
print("="*100)

# Count owner changes by recommended owner
owner_changes = results_df[results_df['Owner_Change_Needed'] == 'YES']
print(f"\nTotal records needing owner change: {len(owner_changes)}")
print(f"\nOwner changes by recommended owner:")
print(owner_changes.groupby('Recommended_Owner').agg({
    'Opp_ID': 'count',
    'ACV': 'sum'
}).rename(columns={'Opp_ID': 'Count'}).sort_values('ACV', ascending=False))

# ═══════════════════════════════════════════════════════════════════════════════
# GENERATE DATA LOADER FILES
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("GENERATING DATA LOADER FILES")
print("="*100)

output_path = '/Users/keiganpesenti/Desktop/FINAL_Closed_Won_Audit_DataLoader.xlsx'

# Data Loader format for Salesforce
def create_data_loader_sheet(df, include_owner=True):
    """Create Data Loader ready format"""
    dl_df = pd.DataFrame({
        'Id': df['Opp_ID'],
        'StageName': CORRECT_STAGE
    })
    if include_owner:
        dl_df['OwnerId'] = df['Recommended_Owner'].map(lambda x: f'[LOOKUP: {x}]')
    return dl_df

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    
    # SHEET 1: EXECUTIVE SUMMARY
    summary_data = {
        'Category': [
            'DUPLICATES - DELETE',
            '$100K PLACEHOLDERS - DELETE',
            'HIGH PRIORITY (2025+) - UPDATE',
            'MEDIUM PRIORITY (2024) - UPDATE',
            'LOW PRIORITY (Pre-2024) - UPDATE',
            'TOTAL TO UPDATE'
        ],
        'Count': [
            len(duplicates_df),
            len(placeholder_100k),
            len(high_priority),
            len(medium_priority),
            len(low_priority),
            len(results_df)
        ],
        'ACV': [
            duplicates_df['ACV'].sum() if len(duplicates_df) > 0 else 0,
            placeholder_100k['ACV'].sum() if len(placeholder_100k) > 0 else 0,
            high_priority['ACV'].sum(),
            medium_priority['ACV'].sum(),
            low_priority['ACV'].sum(),
            results_df['ACV'].sum()
        ],
        'Action': [
            'Delete from Salesforce',
            'Delete from Salesforce',
            'Update Stage to "Stage 6. Closed(Won)" + Owner if needed',
            'Update Stage to "Stage 6. Closed(Won)" + Owner if needed',
            'Update Stage to "Stage 6. Closed(Won)" + Owner if needed',
            ''
        ]
    }
    pd.DataFrame(summary_data).to_excel(writer, sheet_name='EXECUTIVE SUMMARY', index=False)
    
    # SHEET 2: DELETE - DUPLICATES
    if len(duplicates_df) > 0:
        duplicates_df.to_excel(writer, sheet_name='DELETE - Duplicates', index=False)
    
    # SHEET 3: DELETE - $100K PLACEHOLDERS
    if len(placeholder_100k) > 0:
        delete_100k = placeholder_100k[['Opp_ID', 'Account', 'Opp_Name', 'Close_Date', 'ACV', 'Reason']].copy()
        delete_100k.to_excel(writer, sheet_name='DELETE - $100K Placeholders', index=False)
    
    # SHEET 4: HIGH PRIORITY - FULL DETAIL
    high_priority.to_excel(writer, sheet_name='HIGH PRIORITY 2025+', index=False)
    
    # SHEET 5: HIGH PRIORITY - DATA LOADER READY
    if len(high_priority) > 0:
        hp_dl = pd.DataFrame({
            'Id': high_priority['Opp_ID'],
            'StageName': CORRECT_STAGE,
            'Owner_Change': high_priority['Owner_Change_Needed'],
            'Recommended_Owner_Name': high_priority['Recommended_Owner'],
            'Rationale': high_priority['Owner_Rationale']
        })
        hp_dl.to_excel(writer, sheet_name='DL_HIGH_2025+', index=False)
    
    # SHEET 6: MEDIUM PRIORITY - FULL DETAIL
    medium_priority.to_excel(writer, sheet_name='MEDIUM PRIORITY 2024', index=False)
    
    # SHEET 7: MEDIUM PRIORITY - DATA LOADER READY
    if len(medium_priority) > 0:
        mp_dl = pd.DataFrame({
            'Id': medium_priority['Opp_ID'],
            'StageName': CORRECT_STAGE,
            'Owner_Change': medium_priority['Owner_Change_Needed'],
            'Recommended_Owner_Name': medium_priority['Recommended_Owner'],
            'Rationale': medium_priority['Owner_Rationale']
        })
        mp_dl.to_excel(writer, sheet_name='DL_MEDIUM_2024', index=False)
    
    # SHEET 8: LOW PRIORITY - FULL DETAIL
    low_priority.to_excel(writer, sheet_name='LOW PRIORITY pre-2024', index=False)
    
    # SHEET 9: OWNER LOOKUP HELPER
    # For Data Loader, you need User IDs. This sheet helps with the lookup.
    owner_lookup = pd.DataFrame({
        'Owner_Name': list(BL_START_DATES.keys()),
        'Start_Date': [BL_START_DATES[k].strftime('%Y-%m-%d') for k in BL_START_DATES.keys()],
        'Can_Own_Historical': ['NO' if k in ['Tom Clancy', 'Emer Flynn'] else 'YES' for k in BL_START_DATES.keys()],
        'User_ID': ['[Lookup in Salesforce Setup > Users]'] * len(BL_START_DATES)
    })
    owner_lookup.to_excel(writer, sheet_name='OWNER LOOKUP', index=False)
    
    # SHEET 10: BL TENURE VIOLATIONS (records where suggested owner wouldn't work)
    tenure_issues = results_df[results_df['Owner_Rationale'].str.contains('admin ownership|Historical EU', na=False)]
    if len(tenure_issues) > 0:
        tenure_issues.to_excel(writer, sheet_name='TENURE ISSUES - REVIEW', index=False)

print(f"\n*** DATA LOADER FILE SAVED: {output_path} ***")

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("FINAL SUMMARY - ACTION ITEMS")
print("="*100)

print(f"""
STEP 1: DELETE RECORDS ({len(duplicates_df) + len(placeholder_100k)} total)
  - {len(duplicates_df)} duplicates (exact matches with TRUE WON)
  - {len(placeholder_100k)} $100K placeholder records

STEP 2: UPDATE RECORDS ({len(results_df)} total)
  - ALL get StageName changed to "{CORRECT_STAGE}"
  - {len(owner_changes)} also need OwnerId updated

PRIORITY ORDER:
  1. HIGH (2025+): {len(high_priority)} records - ${high_priority['ACV'].sum():,.0f}
  2. MEDIUM (2024): {len(medium_priority)} records - ${medium_priority['ACV'].sum():,.0f}
  3. LOW (Pre-2024): {len(low_priority)} records - ${low_priority['ACV'].sum():,.0f}

OWNER CHANGE BREAKDOWN (for High Priority 2025+):
""")

if len(high_priority) > 0:
    hp_owner_summary = high_priority.groupby(['Current_Owner', 'Recommended_Owner', 'Owner_Change_Needed']).agg({
        'Opp_ID': 'count',
        'ACV': 'sum'
    }).rename(columns={'Opp_ID': 'Count'}).reset_index()
    print(hp_owner_summary.to_string())

print("\n" + "="*100)
print("DATA LOADER INSTRUCTIONS")
print("="*100)
print(f"""
1. Open: {output_path}

2. For DELETES:
   - Use sheets "DELETE - Duplicates" and "DELETE - $100K Placeholders"
   - Use Data Loader DELETE operation with the "Id" column

3. For UPDATES:
   - Use sheets "DL_HIGH_2025+", "DL_MEDIUM_2024" 
   - First, lookup User IDs for each owner in "OWNER LOOKUP" sheet
   - Replace "Recommended_Owner_Name" with actual User IDs
   - Use Data Loader UPDATE operation

4. For Stage-only updates (Owner_Change = NO):
   - You can batch update all these with just the StageName field

5. After Data Loader:
   - Re-run BL Metrics calculation in Salesforce
   - Verify totals match expected values
""")

