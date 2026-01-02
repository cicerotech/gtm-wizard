#!/usr/bin/env python3
"""
Final JH Reconciliation - Complete Analysis with Recommendations
Produces the final DataLoader file and identifies remaining gaps
"""

import pandas as pd
import json
import os
from datetime import datetime

# Configuration
DEEP_MINING_FILE = '/Users/keiganpesenti/Desktop/JH_Deep_Mining_Results.xlsx'
NOVEMBER_RR_FILE = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_FINAL_Reconciliation.xlsx'

EUR_TO_USD = 1.18

def main():
    print("=" * 100)
    print("FINAL JH RECONCILIATION")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    # Load all data
    print("\nLoading data...")
    
    df_rr = pd.read_excel(NOVEMBER_RR_FILE, sheet_name='EU November Revenue by Client')
    df_rr.columns = ['Entity', 'Account', 'Annual_RR_USD']
    
    df_sf = pd.read_excel(EU_OPPS_FILE)
    df_sf.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']
    
    df_contracts = pd.read_excel(DEEP_MINING_FILE, sheet_name='Contracts With Values')
    df_missing = pd.read_excel(DEEP_MINING_FILE, sheet_name='Contracts Still Missing')
    df_proxy = pd.read_excel(DEEP_MINING_FILE, sheet_name='SF Proxy Values')
    df_gap = pd.read_excel(DEEP_MINING_FILE, sheet_name='Account Gap Analysis')
    
    print(f"  November RR accounts: {len(df_rr)}")
    print(f"  SF opportunities: {len(df_sf)}")
    print(f"  Contracts with values: {len(df_contracts)}")
    print(f"  Contracts still missing: {len(df_missing)}")
    print(f"  SF proxy values: {len(df_proxy)}")
    
    # Build final reconciliation by account
    print("\n" + "=" * 80)
    print("FINAL ACCOUNT-BY-ACCOUNT ANALYSIS")
    print("=" * 80)
    
    final_recon = []
    
    for _, rr_row in df_rr.iterrows():
        account = rr_row['Account']
        target = rr_row['Annual_RR_USD']
        
        # Get gap analysis row
        gap_row = df_gap[df_gap['Account'].str.contains(account[:5], case=False, na=False)]
        
        contract_total = gap_row['Contract_Total'].sum() if not gap_row.empty else 0
        sf_total = gap_row['SF_Total'].sum() if not gap_row.empty else 0
        
        # Get proxy values for this account
        proxy_rows = df_proxy[df_proxy['Client'].str.contains(account[:5], case=False, na=False)]
        proxy_total = proxy_rows['SF_ACV'].sum() if not proxy_rows.empty else 0
        
        # Combined total
        combined = contract_total + proxy_total
        gap = target - combined
        coverage = (combined / target * 100) if target > 0 else 0
        
        # Determine status and action
        if coverage >= 80:
            status = 'ALIGNED'
            action = 'Ready for upload'
        elif coverage >= 40:
            status = 'PARTIAL'
            action = 'Need additional contract review'
        else:
            status = 'CRITICAL'
            action = 'Missing contracts - request from JH'
        
        final_recon.append({
            'Account': account,
            'Nov_RR_Target': target,
            'Contract_Extracted': contract_total,
            'SF_Proxy': proxy_total,
            'Combined_Total': combined,
            'Gap_Remaining': gap,
            'Coverage_Pct': coverage,
            'Status': status,
            'Action': action
        })
    
    df_final = pd.DataFrame(final_recon)
    df_final = df_final.sort_values('Nov_RR_Target', ascending=False)
    
    # Summary by status
    aligned = df_final[df_final['Status'] == 'ALIGNED']
    partial = df_final[df_final['Status'] == 'PARTIAL']
    critical = df_final[df_final['Status'] == 'CRITICAL']
    
    print(f"\n{'='*60}")
    print("STATUS SUMMARY")
    print(f"{'='*60}")
    print(f"ALIGNED (>=80%):    {len(aligned):>3} accounts, ${aligned['Combined_Total'].sum():>12,.0f}")
    print(f"PARTIAL (40-80%):   {len(partial):>3} accounts, ${partial['Combined_Total'].sum():>12,.0f}")
    print(f"CRITICAL (<40%):    {len(critical):>3} accounts, ${critical['Combined_Total'].sum():>12,.0f}")
    print(f"{'='*60}")
    
    # Detailed breakdown
    print(f"\n{'='*80}")
    print("DETAILED ACCOUNT BREAKDOWN (Top 20)")
    print(f"{'='*80}")
    print(df_final.head(20).to_string(index=False))
    
    # Contracts needing manual review
    print(f"\n{'='*80}")
    print("CONTRACTS REQUIRING MANUAL REVIEW (No extractable value)")
    print(f"{'='*80}")
    
    for _, row in df_missing.head(20).iterrows():
        print(f"  {row['client']}: {row['contract'][:60]}")
        if row.get('fee_section_pages'):
            print(f"    → Fee sections found on pages: {row['fee_section_pages']}")
    
    # Create DataLoader ready file
    print(f"\n{'='*80}")
    print("GENERATING DATALOADER FILE")
    print(f"{'='*80}")
    
    # Combine contract extractions and proxy values for upload
    upload_records = []
    
    # From extracted contracts
    for _, row in df_contracts.iterrows():
        upload_records.append({
            'Client': row['client'],
            'Contract': row['contract'],
            'ACV_USD': row['acv_usd'],
            'Calculation': row['calculation_method'],
            'Source': 'CONTRACT',
            'Confidence': 'HIGH'
        })
    
    # From SF proxy
    for _, row in df_proxy.iterrows():
        upload_records.append({
            'Client': row['Client'],
            'Contract': row['Contract'],
            'ACV_USD': row['SF_ACV'],
            'Calculation': f"SF Proxy: {row['SF_Opp_Name'][:40]}",
            'Source': 'SF_PROXY',
            'Confidence': 'MEDIUM'
        })
    
    df_upload = pd.DataFrame(upload_records)
    
    # Summary
    print(f"  Records ready for upload: {len(df_upload)}")
    print(f"  Total ACV: ${df_upload['ACV_USD'].sum():,.2f}")
    
    # Identify critical gaps
    print(f"\n{'='*80}")
    print("CRITICAL GAPS - CONTRACTS NEEDED FROM JH")
    print(f"{'='*80}")
    
    for _, row in critical.iterrows():
        if row['Gap_Remaining'] > 50000:  # Only show significant gaps
            print(f"\n  {row['Account']}")
            print(f"    Target: ${row['Nov_RR_Target']:,.0f}")
            print(f"    Have: ${row['Combined_Total']:,.0f}")
            print(f"    Gap: ${row['Gap_Remaining']:,.0f} ({100-row['Coverage_Pct']:.0f}% missing)")
            print(f"    Action: {row['Action']}")
    
    # Save final outputs
    print(f"\n{'='*80}")
    print("SAVING FINAL OUTPUTS")
    print(f"{'='*80}")
    
    with pd.ExcelWriter(OUTPUT_FILE, engine='openpyxl') as writer:
        df_final.to_excel(writer, sheet_name='Account Reconciliation', index=False)
        df_upload.to_excel(writer, sheet_name='Upload Ready', index=False)
        aligned.to_excel(writer, sheet_name='Aligned Accounts', index=False)
        partial.to_excel(writer, sheet_name='Partial Accounts', index=False)
        critical.to_excel(writer, sheet_name='Critical Gaps', index=False)
        df_missing.to_excel(writer, sheet_name='Manual Review Queue', index=False)
    
    print(f"Output saved to: {OUTPUT_FILE}")
    
    # Final totals
    print(f"\n{'='*80}")
    print("FINAL RECONCILIATION SUMMARY")
    print(f"{'='*80}")
    
    total_target = df_final['Nov_RR_Target'].sum()
    total_combined = df_final['Combined_Total'].sum()
    total_gap = df_final['Gap_Remaining'].sum()
    overall_coverage = (total_combined / total_target * 100) if total_target > 0 else 0
    
    print(f"""
    November RR Target:     ${total_target:>15,.2f}
    Contract Extracted:     ${df_contracts['acv_usd'].sum():>15,.2f}
    SF Proxy Added:         ${df_proxy['SF_ACV'].sum():>15,.2f}
    Total Combined:         ${total_combined:>15,.2f}
    ─────────────────────────────────────────────
    Remaining Gap:          ${total_gap:>15,.2f}
    Overall Coverage:       {overall_coverage:>14.1f}%
    
    Status Breakdown:
      ✓ Aligned accounts:   {len(aligned)} (ready for upload)
      ~ Partial accounts:   {len(partial)} (need additional review)
      ✗ Critical accounts:  {len(critical)} (request contracts from JH)
    
    Recommendation:
      1. Upload {len(df_upload)} records from 'Upload Ready' sheet
      2. Request missing contracts for {len(critical)} critical accounts
      3. Manually review {len(df_missing)} contracts in 'Manual Review Queue'
    """)
    
    return df_final, df_upload

if __name__ == "__main__":
    main()


