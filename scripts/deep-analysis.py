#!/usr/bin/env python3
"""
Deep Analysis: EUDIA vs JH CRM Reconciliation
Analyzes discrepancies while maintaining total Active Revenue
"""

import pandas as pd
import os

pd.set_option('display.max_rows', 200)
pd.set_option('display.width', 400)
pd.set_option('display.max_colwidth', 80)

# Load data
xl = pd.ExcelFile(os.path.expanduser('~/Desktop/MASTER FILE.xlsx'))
active = pd.read_excel(xl, sheet_name='Active Rev + Projects - Eudia')
qtd = pd.read_excel(xl, sheet_name='QTD Closed Won - Eudia')
alltime = pd.read_excel(xl, sheet_name='All time Closed Won - Eudia')
jh = pd.read_excel(xl, sheet_name='JOHNSON HANA CRM - WON YTD')
rr = pd.read_excel(xl, sheet_name='RUN RATE REVENUE MoM')

# Parse JH dates
jh['Close Date'] = pd.to_datetime(jh['Close Date'], format='mixed')
jh_q4 = jh[(jh['Close Date'] >= '2025-10-01') & (jh['Close Date'] <= '2025-12-31')].copy()

print('=' * 80)
print('DEEP ANALYSIS: REVENUE RECONCILIATION')
print('Goal: Align with JH CRM while MAINTAINING total Active Revenue')
print('=' * 80)
print()

# =============================================================================
# SECTION 1: BASELINE TOTALS
# =============================================================================
print('SECTION 1: BASELINE TOTALS (These must NOT change)')
print('-' * 60)
active_total = active['Revenue'].sum()
print(f"  Active Rev + Projects:  ${active_total:,.2f}")
print(f"  Total Records:          {len(active)}")
print()

# =============================================================================
# SECTION 2: QTD CLOSED WON ANALYSIS
# =============================================================================
print('SECTION 2: QTD CLOSED WON BREAKDOWN')
print('-' * 60)

# Identify November RR Revenue deals (synthetic run rate captures)
rr_deals = qtd[qtd['Opportunity Name'].str.contains('November RR|RR Revenue', case=False, na=False)]
actual_deals = qtd[~qtd['Opportunity Name'].str.contains('November RR|RR Revenue', case=False, na=False)]

print(f"  Total QTD Closed Won: ${qtd['Revenue'].sum():,.2f} ({len(qtd)} deals)")
print()
print(f"  'November RR Revenue' (run rate captures): ${rr_deals['Revenue'].sum():,.2f} ({len(rr_deals)} deals)")
for _, row in rr_deals.iterrows():
    print(f"     - {row['Account Name'][:30]}: ${row['Revenue']:,.2f}")
print()
print(f"  Actual Q4 closed deals: ${actual_deals['Revenue'].sum():,.2f} ({len(actual_deals)} deals)")
print()

# =============================================================================
# SECTION 3: TERM CORRECTIONS NEEDED
# =============================================================================
print('SECTION 3: TERM CORRECTIONS (from JH CRM)')
print('-' * 60)
print('These opportunities need TERM updates to align with JH:')
print()

term_fixes = []
for _, e_row in actual_deals.iterrows():
    e_acct = str(e_row['Account Name'])
    e_opp = str(e_row['Opportunity Name'])
    e_rev = e_row['Revenue']
    e_term = e_row['Term (Months)']
    e_id = e_row['Opportunity ID']
    
    # Find JH match
    jh_match = jh_q4[jh_q4['Account Name'].str.contains(e_acct[:15], case=False, na=False, regex=False)]
    
    for _, j_row in jh_match.iterrows():
        j_opp = str(j_row['Opportunity Name'])
        e_words = set(word.lower() for word in e_opp.split() if len(word) > 3)
        j_words = set(word.lower() for word in j_opp.split() if len(word) > 3)
        
        if len(e_words & j_words) >= 2:
            j_term = j_row['Term']
            j_acv = j_row['ACV ']
            
            if pd.notna(e_term) and pd.notna(j_term) and e_term != j_term:
                term_fixes.append({
                    'Id': e_id,
                    'Account': e_acct[:35],
                    'Opportunity': e_opp[:45],
                    'Current_Term': int(e_term),
                    'JH_Term': int(j_term),
                    'Revenue': e_rev,
                    'JH_ACV': j_acv
                })
            break

term_df = pd.DataFrame(term_fixes)
if len(term_df) > 0:
    print(term_df[['Account', 'Current_Term', 'JH_Term', 'Revenue', 'JH_ACV']].to_string())
else:
    print('  No term corrections needed')
print()

# =============================================================================
# SECTION 4: REVENUE VARIANCE ANALYSIS
# =============================================================================
print('SECTION 4: REVENUE VARIANCE ANALYSIS')
print('-' * 60)
print('Understanding why EUDIA Revenue differs from JH ACV:')
print()

variance_analysis = []
for _, e_row in actual_deals.iterrows():
    e_acct = str(e_row['Account Name'])
    e_opp = str(e_row['Opportunity Name'])
    e_rev = e_row['Revenue']
    e_id = e_row['Opportunity ID']
    
    jh_match = jh_q4[jh_q4['Account Name'].str.contains(e_acct[:15], case=False, na=False, regex=False)]
    
    for _, j_row in jh_match.iterrows():
        j_opp = str(j_row['Opportunity Name'])
        e_words = set(word.lower() for word in e_opp.split() if len(word) > 3)
        j_words = set(word.lower() for word in j_opp.split() if len(word) > 3)
        
        if len(e_words & j_words) >= 2:
            j_acv = j_row['ACV ']
            variance = e_rev - j_acv if pd.notna(e_rev) else None
            
            if variance and abs(variance) > 1000:
                # Determine reason
                if abs(variance) > e_rev * 0.8:
                    reason = 'Bundle Allocation / Rate Adjustment'
                elif abs(variance) > e_rev * 0.3:
                    reason = 'Term or Scope Difference'
                else:
                    reason = 'Minor Variance'
                
                variance_analysis.append({
                    'Id': e_id,
                    'Account': e_acct[:30],
                    'EUDIA_Rev': e_rev,
                    'JH_ACV': j_acv,
                    'Variance': variance,
                    'Reason': reason
                })
            break

var_df = pd.DataFrame(variance_analysis)
if len(var_df) > 0:
    var_df = var_df.sort_values('Variance', key=abs, ascending=False)
    print(var_df[['Account', 'EUDIA_Rev', 'JH_ACV', 'Variance', 'Reason']].to_string())
    print()
    print(f"  Total positive variance (EUDIA > JH): ${var_df[var_df['Variance'] > 0]['Variance'].sum():,.2f}")
    print(f"  Total negative variance (JH > EUDIA): ${var_df[var_df['Variance'] < 0]['Variance'].sum():,.2f}")
    print(f"  Net variance: ${var_df['Variance'].sum():,.2f}")
else:
    print('  No significant variances found')
print()

# =============================================================================
# SECTION 5: KEY FINDINGS SUMMARY
# =============================================================================
print('=' * 80)
print('SECTION 5: KEY FINDINGS SUMMARY')
print('=' * 80)
print()

print('1. NOVEMBER RR REVENUE DEALS:')
print('   These are NOT new Q4 closed-won deals. They represent existing')
print('   recurring revenue for accounts from previous contracts.')
print(f'   Total: ${rr_deals["Revenue"].sum():,.2f} ({len(rr_deals)} deals)')
print()

print('2. TERM CORRECTIONS NEEDED:')
if len(term_df) > 0:
    print(f'   {len(term_df)} deals need term updates to align with JH CRM')
else:
    print('   No term corrections needed')
print()

print('3. WHY EUDIA REVENUE != JH ACV:')
print('   - Bundle Allocation: EUDIA shows run rate, JH shows deal value')
print('   - Multi-Year Deals: Different annualization approaches')
print('   - Rate Adjustments: Pricing differences or amendments')
print('   - Term Differences: Different contract periods')
print()

print('4. CRITICAL CONSTRAINT:')
print(f'   Active Revenue Total MUST remain: ${active_total:,.2f}')
print('   Any new opportunities must offset existing ones (breakouts, not additions)')
print()

# =============================================================================
# SECTION 6: RECOMMENDED ACTIONS
# =============================================================================
print('=' * 80)
print('SECTION 6: RECOMMENDED ACTIONS')
print('=' * 80)
print()

print('SAFE UPDATES (No revenue impact):')
print('  1. Update Term fields to match JH where different')
print('  2. Populate JH_Original_ACV__c with JH values for documentation')
print('  3. Set ACV_Variance_Reason__c to document discrepancy reasons')
print()

print('REQUIRES REVIEW:')
print('  1. November RR Revenue deals - confirm these should remain as Q4 QTD')
print('  2. Missing JH Q4 deals - only create if offsetting reductions elsewhere')
print('  3. Opportunity breakouts - only if splitting existing revenue')
print()

# Save term fixes for Data Loader
if len(term_df) > 0:
    output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/reconciliation/term-corrections.csv'
    term_df[['Id', 'Account', 'Opportunity', 'Current_Term', 'JH_Term']].to_csv(output_path, index=False)
    print(f'Term corrections saved to: {output_path}')

print()
print('=' * 80)
print('END OF ANALYSIS')
print('=' * 80)

