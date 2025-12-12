#!/usr/bin/env python3
"""
Johnson Hana Salesforce Audit Script
Compares Eudia Salesforce opportunities against Johnson Hana Salesforce export
to identify opportunities that need to be created, updated, or are already synced.
"""

import pandas as pd
import os
from datetime import datetime

# File path
AUDIT_FILE = os.path.expanduser("~/Desktop/audit sf_check rev customers.xls")
OUTPUT_DIR = os.path.expanduser("~/Desktop")

def normalize_opp_name(name):
    """Normalize opportunity name for matching - strip 'Johnson Hana - ' prefix"""
    if not isinstance(name, str):
        return ""
    name = name.strip()
    # Strip "Johnson Hana - " prefix if present
    if name.lower().startswith("johnson hana - "):
        name = name[15:].strip()
    elif name.lower().startswith("johnson hana -"):
        name = name[14:].strip()
    elif name.lower().startswith("jh - "):
        name = name[5:].strip()
    return name.lower()

def main():
    print("=" * 60)
    print("Johnson Hana Salesforce Audit")
    print("=" * 60)
    
    # Read the Excel file
    print(f"\nReading: {AUDIT_FILE}")
    
    try:
        # Get sheet names
        xl = pd.ExcelFile(AUDIT_FILE)
        print(f"Available sheets: {xl.sheet_names}")
        
        # Read both tabs
        eudia_df = None
        jh_df = None
        
        for sheet in xl.sheet_names:
            sheet_lower = sheet.lower()
            if 'eudia' in sheet_lower or 'udia' in sheet_lower:
                eudia_df = pd.read_excel(AUDIT_FILE, sheet_name=sheet)
                print(f"\n✓ Found Eudia Salesforce tab: '{sheet}' ({len(eudia_df)} rows)")
            elif 'jh' in sheet_lower or 'johnson' in sheet_lower or 'hana' in sheet_lower:
                jh_df = pd.read_excel(AUDIT_FILE, sheet_name=sheet)
                print(f"✓ Found Johnson Hana tab: '{sheet}' ({len(jh_df)} rows)")
        
        if eudia_df is None or jh_df is None:
            print("\n⚠️ Could not find both tabs. Showing all sheets for manual selection:")
            for i, sheet in enumerate(xl.sheet_names):
                df = pd.read_excel(AUDIT_FILE, sheet_name=sheet, nrows=5)
                print(f"\n[{i}] Sheet: '{sheet}'")
                print(f"    Columns: {list(df.columns)[:5]}...")
                print(f"    Sample: {df.iloc[0].to_dict() if len(df) > 0 else 'Empty'}")
            return
        
        # Print column names for debugging
        print(f"\nEudia columns: {list(eudia_df.columns)}")
        print(f"JH columns: {list(jh_df.columns)}")
        
        # Find opportunity name column (be specific to avoid owner name)
        eudia_opp_col = None
        jh_opp_col = None
        
        # Look for exact "Opportunity Name" first
        for col in eudia_df.columns:
            if col.lower() == 'opportunity name':
                eudia_opp_col = col
                break
        if not eudia_opp_col:
            for col in eudia_df.columns:
                if 'opportunity' in col.lower() and 'name' in col.lower() and 'owner' not in col.lower():
                    eudia_opp_col = col
                    break
        
        for col in jh_df.columns:
            if col.lower() == 'opportunity name':
                jh_opp_col = col
                break
        if not jh_opp_col:
            for col in jh_df.columns:
                if 'opportunity' in col.lower() and 'name' in col.lower() and 'owner' not in col.lower():
                    jh_opp_col = col
                    break
        
        if eudia_opp_col:
            print(f"\nUsing Eudia opp name column: '{eudia_opp_col}'")
        if jh_opp_col:
            print(f"Using JH opp name column: '{jh_opp_col}'")
        
        # Find owner column
        eudia_owner_col = None
        for col in eudia_df.columns:
            if 'owner' in col.lower():
                eudia_owner_col = col
                break
        
        # Filter Eudia for JH-transferred opportunities (owned by Keigan, Nathan, Greg)
        jh_transferred_owners = ['keigan', 'nathan', 'greg']
        
        if eudia_owner_col:
            print(f"\nFiltering Eudia by owner column: '{eudia_owner_col}'")
            eudia_jh_opps = eudia_df[eudia_df[eudia_owner_col].astype(str).str.lower().str.contains('|'.join(jh_transferred_owners), na=False)]
            print(f"Found {len(eudia_jh_opps)} Eudia opportunities owned by Keigan/Nathan/Greg")
        else:
            eudia_jh_opps = eudia_df
            print("No owner column found - using all Eudia opportunities")
        
        # Create normalized name lookup
        eudia_names = {}
        if eudia_opp_col:
            for idx, row in eudia_jh_opps.iterrows():
                normalized = normalize_opp_name(str(row[eudia_opp_col]))
                if normalized:
                    eudia_names[normalized] = row
        
        jh_names = {}
        if jh_opp_col:
            for idx, row in jh_df.iterrows():
                normalized = normalize_opp_name(str(row[jh_opp_col]))
                if normalized:
                    jh_names[normalized] = row
        
        print(f"\nNormalized names: {len(eudia_names)} Eudia, {len(jh_names)} JH")
        
        # Match opportunities
        matched = []
        missing_from_eudia = []
        need_update = []
        
        for jh_name, jh_row in jh_names.items():
            if jh_name in eudia_names:
                matched.append({
                    'jh_name': jh_row[jh_opp_col] if jh_opp_col else jh_name,
                    'eudia_name': eudia_names[jh_name][eudia_opp_col] if eudia_opp_col else jh_name,
                    'status': 'MATCHED'
                })
            else:
                missing_from_eudia.append({
                    'jh_name': jh_row[jh_opp_col] if jh_opp_col else jh_name,
                    'jh_row': jh_row.to_dict(),
                    'status': 'MISSING - Need to create in Eudia'
                })
        
        # Print results
        print("\n" + "=" * 60)
        print("AUDIT RESULTS")
        print("=" * 60)
        print(f"\n✓ MATCHED: {len(matched)} opportunities exist in both systems")
        print(f"⚠️ MISSING FROM EUDIA: {len(missing_from_eudia)} opportunities need to be created")
        
        if missing_from_eudia:
            print("\nMissing opportunities (first 20):")
            for i, item in enumerate(missing_from_eudia[:20]):
                print(f"  {i+1}. {item['jh_name']}")
        
        # Export results to Excel
        output_file = os.path.join(OUTPUT_DIR, f"JH_Audit_Results_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx")
        
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            # Matched
            if matched:
                pd.DataFrame(matched).to_excel(writer, sheet_name='Matched', index=False)
            
            # Missing
            if missing_from_eudia:
                missing_df = pd.DataFrame([{
                    'JH Opportunity Name': item['jh_name'],
                    'Status': item['status'],
                    **{k: v for k, v in item['jh_row'].items() if k != 'jh_name'}
                } for item in missing_from_eudia])
                missing_df.to_excel(writer, sheet_name='Missing - Create in Eudia', index=False)
            
            # Summary
            summary_df = pd.DataFrame([
                {'Metric': 'Total JH Opportunities', 'Count': len(jh_df)},
                {'Metric': 'Total Eudia Opportunities (JH owners)', 'Count': len(eudia_jh_opps)},
                {'Metric': 'Matched', 'Count': len(matched)},
                {'Metric': 'Missing from Eudia', 'Count': len(missing_from_eudia)},
            ])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        print(f"\n✓ Results exported to: {output_file}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

