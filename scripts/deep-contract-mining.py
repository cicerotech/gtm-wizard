#!/usr/bin/env python3
"""
Deep Contract Value Mining - Finding Hidden Revenue
Extracts values from contracts using enhanced patterns for day rates, retainers, caps, etc.
"""

import os
import re
import json
import pandas as pd
from PyPDF2 import PdfReader
from datetime import datetime

# --- Configuration ---
CONTRACTS_DIR = '/Users/keiganpesenti/Desktop/Client Contracts/'
PREVIOUS_ANALYSIS = '/Users/keiganpesenti/Desktop/Deep_Contract_Analysis.json'
NOVEMBER_RR_FILE = '/Users/keiganpesenti/Desktop/EU Run Rate 2025 + Opportunity Records.xlsx'
EU_OPPS_FILE = '/Users/keiganpesenti/Desktop/EU_Only_Closed_Won.xlsx'
OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Deep_Mining_Results.xlsx'

EUR_TO_USD = 1.18

# Priority clients by RR
PRIORITY_CLIENTS = [
    ('BOI', 1652399.77),
    ('OpenAi', 1537051.52),
    ('Stripe', 1223979.27),
    ('Udemy', 533721.57),
    ('ESB', 473355.25),
    ('Irish Water', 440882.33),
    ('Indeed', 417845.98),
    ('Coimisiún na Meán', 389675.03),
    ('Etsy', 304329.54),
    ('Tinder', 228975.71),
    ('Dropbox', 222037.06),
    ('Airbnb', 211906.62),
    ('TikTok', 208159.74),
    ('Coillte', 194837.52),
    ('Gilead', 186511.13),
]

def extract_full_text_all_pages(pdf_path):
    """Extract text from ALL pages of PDF"""
    try:
        reader = PdfReader(pdf_path)
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append({
                'page': i + 1,
                'text': text,
                'chars': len(text)
            })
        full_text = "\n\n".join([p['text'] for p in pages_text])
        return full_text, pages_text, len(reader.pages)
    except Exception as e:
        return None, [], 0

def detect_currency(text):
    """Detect primary currency in text"""
    eur_count = len(re.findall(r'€|EUR', text))
    usd_count = len(re.findall(r'\$|USD', text))
    return 'EUR' if eur_count >= usd_count else 'USD'

def extract_all_monetary_values(text):
    """Extract ALL monetary values with context"""
    values = []
    
    # Comprehensive patterns
    patterns = [
        # Euro amounts
        (r'€\s*([\d,]+(?:\.\d{2})?)', 'EUR'),
        (r'EUR\s*([\d,]+(?:\.\d{2})?)', 'EUR'),
        (r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)', 'EUR'),
        # USD amounts
        (r'\$\s*([\d,]+(?:\.\d{2})?)', 'USD'),
        (r'USD\s*([\d,]+(?:\.\d{2})?)', 'USD'),
    ]
    
    for pattern, currency in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            start = max(0, match.start() - 150)
            end = min(len(text), match.end() + 150)
            context = text[start:end].replace('\n', ' ').strip()
            
            value_str = match.group(1).replace(',', '')
            try:
                value = float(value_str)
                if value >= 50:  # Ignore trivial amounts
                    values.append({
                        'value': value,
                        'currency': currency,
                        'context': context,
                        'position': match.start()
                    })
            except:
                pass
    
    return values

def extract_hourly_rates(text):
    """Extract hourly rate patterns"""
    rates = []
    patterns = [
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*hour',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)\s*(?:per|/)\s*hour',
        r'hourly\s*rate[:\s]*€?\s*([\d,]+(?:\.\d{2})?)',
        r'rate\s*of\s*€?\s*([\d,]+(?:\.\d{2})?)\s*per\s*hour',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*hour',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value_str = match.group(1).replace(',', '')
            try:
                rate = float(value_str)
                if 30 <= rate <= 500:
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    rates.append({
                        'rate': rate,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return rates

def extract_day_rates(text):
    """Extract daily rate patterns"""
    rates = []
    patterns = [
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*day',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)\s*(?:per|/)\s*day',
        r'daily\s*rate[:\s]*€?\s*([\d,]+(?:\.\d{2})?)',
        r'day\s*rate[:\s]*€?\s*([\d,]+(?:\.\d{2})?)',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*day',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value_str = match.group(1).replace(',', '')
            try:
                rate = float(value_str)
                if 200 <= rate <= 3000:  # Reasonable day rate range
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    rates.append({
                        'rate': rate,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return rates

def extract_weekly_hours(text):
    """Extract weekly hour commitments"""
    hours = []
    patterns = [
        r'([\d]+)\s*hours?\s*per\s*week',
        r'([\d]+)\s*hrs?(?:/|\s+per\s+)week',
        r'weekly\s*(?:hours?|commitment)[:\s]*([\d]+)',
        r'([\d]+)\s*hours?\s*(?:weekly|a week)',
        r'([\d]+)\s*hours?\s*pw',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            try:
                hrs = int(match.group(1))
                if 5 <= hrs <= 200:
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    hours.append({
                        'hours': hrs,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return hours

def extract_monthly_retainers(text):
    """Extract monthly retainer/fixed fee patterns"""
    retainers = []
    patterns = [
        r'monthly\s*(?:retainer|fee|payment)[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/|a)\s*month',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/|a)\s*month',
        r'retainer[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'fixed\s*(?:monthly|fee)[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)\s*(?:per|/|a)\s*month',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value_str = match.group(1).replace(',', '')
            try:
                value = float(value_str)
                if value >= 1000:  # Reasonable monthly retainer
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    retainers.append({
                        'monthly': value,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return retainers

def extract_annual_fees(text):
    """Extract annual/yearly fee patterns"""
    fees = []
    patterns = [
        r'annual\s*(?:fee|value|amount)[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'yearly\s*(?:fee|value|amount)[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'per\s*annum[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*(?:year|annum)',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*(?:year|annum)',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value_str = match.group(1).replace(',', '')
            try:
                value = float(value_str)
                if value >= 10000:  # Reasonable annual fee
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    fees.append({
                        'annual': value,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return fees

def extract_fixed_period_fees(text):
    """Extract fixed fees for specific periods (6 months, 12 months, etc.)"""
    fees = []
    patterns = [
        r'([\d]+)\s*months?[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:for|over)\s*([\d]+)\s*months?',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:for|over)\s*([\d]+)\s*months?',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)\s*(?:for|over)\s*([\d]+)\s*months?',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            try:
                groups = match.groups()
                if len(groups) >= 2:
                    # Determine which group is months vs amount
                    g1, g2 = groups[0].replace(',', ''), groups[1].replace(',', '')
                    if float(g1) <= 60:  # Months
                        months = int(float(g1))
                        amount = float(g2)
                    else:
                        amount = float(g1)
                        months = int(float(g2))
                    
                    if amount >= 10000 and 1 <= months <= 60:
                        start = max(0, match.start() - 100)
                        end = min(len(text), match.end() + 100)
                        fees.append({
                            'amount': amount,
                            'months': months,
                            'monthly': amount / months,
                            'annual': (amount / months) * 12,
                            'context': text[start:end].replace('\n', ' ')
                        })
            except:
                pass
    return fees

def extract_caps_and_maximums(text):
    """Extract capped/maximum fee arrangements"""
    caps = []
    patterns = [
        r'(?:cap|maximum|not to exceed|up to|ceiling)[:\s]*€?\$?\s*([\d,]+(?:\.\d{2})?)',
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:cap|maximum|ceiling)',
        r'\$\s*([\d,]+(?:\.\d{2})?)\s*(?:cap|maximum|ceiling)',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value_str = match.group(1).replace(',', '')
            try:
                value = float(value_str)
                if value >= 10000:
                    start = max(0, match.start() - 100)
                    end = min(len(text), match.end() + 100)
                    caps.append({
                        'cap': value,
                        'context': text[start:end].replace('\n', ' ')
                    })
            except:
                pass
    return caps

def find_fee_sections(pages_text):
    """Find pages likely containing fee schedules"""
    fee_keywords = [
        'charges schedule', 'fee schedule', 'pricing', 'fees and charges',
        'compensation', 'payment terms', 'rates', 'schedule of fees',
        'fixed fee', 'hourly rate', 'daily rate', 'retainer',
        'annex', 'appendix', 'schedule 1', 'schedule 2'
    ]
    
    fee_pages = []
    for page in pages_text:
        text_lower = page['text'].lower()
        for keyword in fee_keywords:
            if keyword in text_lower:
                fee_pages.append({
                    'page': page['page'],
                    'keyword': keyword,
                    'text': page['text']
                })
                break
    return fee_pages

def calculate_acv(data):
    """Calculate ACV from extracted data using priority logic"""
    acv = None
    method = None
    currency = data.get('currency', 'EUR')
    
    # Priority 1: Annual fees (most direct)
    if data.get('annual_fees'):
        fee = data['annual_fees'][0]
        acv = fee['annual']
        method = f"Annual fee: {currency}{acv:,.0f}"
    
    # Priority 2: Monthly retainers x 12
    elif data.get('monthly_retainers'):
        retainer = data['monthly_retainers'][0]
        acv = retainer['monthly'] * 12
        method = f"Monthly retainer {currency}{retainer['monthly']:,.0f} x 12"
    
    # Priority 3: Fixed period fees (annualized)
    elif data.get('fixed_period_fees'):
        fee = data['fixed_period_fees'][0]
        acv = fee['annual']
        method = f"{currency}{fee['amount']:,.0f} / {fee['months']} months x 12"
    
    # Priority 4: Hourly rate x weekly hours x 52
    elif data.get('hourly_rates') and data.get('weekly_hours'):
        rate = data['hourly_rates'][0]['rate']
        hours = data['weekly_hours'][0]['hours']
        acv = rate * hours * 52
        method = f"{currency}{rate}/hr x {hours} hrs/week x 52"
    
    # Priority 5: Day rate x days/week x 52
    elif data.get('day_rates') and data.get('weekly_hours'):
        rate = data['day_rates'][0]['rate']
        days = data['weekly_hours'][0]['hours'] / 8  # Convert hours to days
        acv = rate * days * 52
        method = f"{currency}{rate}/day x {days:.1f} days/week x 52"
    
    # Priority 6: Day rate x 5 days x 52 (assume full time)
    elif data.get('day_rates'):
        rate = data['day_rates'][0]['rate']
        acv = rate * 5 * 52
        method = f"{currency}{rate}/day x 5 days x 52 (assumed FT)"
    
    # Priority 7: Hourly rate x 40 hrs x 52 (assume full time)
    elif data.get('hourly_rates'):
        rate = data['hourly_rates'][0]['rate']
        acv = rate * 40 * 52
        method = f"{currency}{rate}/hr x 40 hrs x 52 (assumed FT)"
    
    # Priority 8: Use largest cap/maximum as proxy
    elif data.get('caps'):
        cap = max(c['cap'] for c in data['caps'])
        acv = cap
        method = f"Cap/maximum: {currency}{cap:,.0f}"
    
    # Convert to USD if EUR
    if acv and currency == 'EUR':
        acv_usd = acv * EUR_TO_USD
        method += f" → ${acv_usd:,.0f} USD"
    else:
        acv_usd = acv
    
    return acv_usd, method

def process_contract_deep(client, pdf_path):
    """Deep process a single contract"""
    filename = os.path.basename(pdf_path)
    
    full_text, pages_text, total_pages = extract_full_text_all_pages(pdf_path)
    
    if not full_text:
        return {
            'client': client,
            'contract': filename.replace('.pdf', ''),
            'pages': 0,
            'status': 'ERROR',
            'error': 'Could not extract text'
        }
    
    # Detect currency
    currency = detect_currency(full_text)
    
    # Extract all value types
    data = {
        'currency': currency,
        'all_values': extract_all_monetary_values(full_text),
        'hourly_rates': extract_hourly_rates(full_text),
        'day_rates': extract_day_rates(full_text),
        'weekly_hours': extract_weekly_hours(full_text),
        'monthly_retainers': extract_monthly_retainers(full_text),
        'annual_fees': extract_annual_fees(full_text),
        'fixed_period_fees': extract_fixed_period_fees(full_text),
        'caps': extract_caps_and_maximums(full_text),
        'fee_sections': find_fee_sections(pages_text)
    }
    
    # Calculate ACV
    acv_usd, method = calculate_acv(data)
    
    return {
        'client': client,
        'contract': filename.replace('.pdf', ''),
        'pages': total_pages,
        'currency': currency,
        'hourly_rates': [r['rate'] for r in data['hourly_rates']],
        'day_rates': [r['rate'] for r in data['day_rates']],
        'weekly_hours': [h['hours'] for h in data['weekly_hours']],
        'monthly_retainers': [r['monthly'] for r in data['monthly_retainers']],
        'annual_fees': [f['annual'] for f in data['annual_fees']],
        'fixed_period_fees': [(f['amount'], f['months']) for f in data['fixed_period_fees']],
        'caps': [c['cap'] for c in data['caps']],
        'fee_section_pages': [p['page'] for p in data['fee_sections']],
        'all_values_count': len(data['all_values']),
        'acv_usd': acv_usd,
        'calculation_method': method,
        'status': 'VALUE_FOUND' if acv_usd else 'NO_VALUE'
    }

def load_november_rr():
    """Load November RR as targets"""
    df = pd.read_excel(NOVEMBER_RR_FILE, sheet_name='EU November Revenue by Client')
    df.columns = ['Entity', 'Account', 'Annual_RR_USD']
    return df

def load_sf_opportunities():
    """Load SF opportunities for proxy values"""
    df = pd.read_excel(EU_OPPS_FILE)
    df.columns = ['Revenue_Type', 'Owner', 'Account_Name', 'Opp_Name', 'Revenue', 'ACV', 'Term', 'Pod', 'Opp_ID']
    return df

def main():
    print("=" * 100)
    print("DEEP CONTRACT VALUE MINING")
    print(f"Run Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    # Phase 1: Identify zero-value contracts from previous analysis
    print("\n" + "=" * 80)
    print("PHASE 1: IDENTIFYING ZERO-VALUE CONTRACTS")
    print("=" * 80)
    
    with open(PREVIOUS_ANALYSIS, 'r') as f:
        previous = json.load(f)
    
    zero_value = [c for c in previous if not c.get('calculated_acv')]
    has_value = [c for c in previous if c.get('calculated_acv')]
    
    print(f"Previous analysis: {len(previous)} contracts")
    print(f"  With values: {len(has_value)}")
    print(f"  Zero value (need deep dive): {len(zero_value)}")
    
    # Phase 2-5: Deep extraction from all contracts
    print("\n" + "=" * 80)
    print("PHASE 2-5: DEEP EXTRACTION WITH ENHANCED PATTERNS")
    print("=" * 80)
    
    all_results = []
    
    # Get all client folders
    client_folders = [d for d in os.listdir(CONTRACTS_DIR) if os.path.isdir(os.path.join(CONTRACTS_DIR, d))]
    
    for client in client_folders:
        client_path = os.path.join(CONTRACTS_DIR, client)
        pdf_files = [f for f in os.listdir(client_path) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            continue
            
        print(f"\n{client} ({len(pdf_files)} contracts)")
        
        for pdf_file in pdf_files:
            pdf_path = os.path.join(client_path, pdf_file)
            result = process_contract_deep(client, pdf_path)
            all_results.append(result)
            
            acv = result.get('acv_usd', 0) or 0
            status_icon = "✓" if acv > 0 else "✗"
            acv_str = f"${acv:,.0f}" if acv > 0 else "NO VALUE"
            print(f"  {status_icon} {result.get('contract', 'unknown')[:50]}: {acv_str}")
    
    df_results = pd.DataFrame(all_results)
    
    # Summary
    print("\n" + "=" * 80)
    print("EXTRACTION SUMMARY")
    print("=" * 80)
    
    with_value = df_results[df_results['acv_usd'] > 0]
    no_value = df_results[df_results['acv_usd'].isna() | (df_results['acv_usd'] == 0)]
    
    print(f"Total contracts processed: {len(df_results)}")
    print(f"  With values extracted: {len(with_value)}")
    print(f"  Still no value: {len(no_value)}")
    print(f"Total ACV extracted: ${with_value['acv_usd'].sum():,.2f}")
    
    # Phase 6: Account-level gap analysis
    print("\n" + "=" * 80)
    print("PHASE 6: ACCOUNT-LEVEL GAP ANALYSIS")
    print("=" * 80)
    
    df_rr = load_november_rr()
    df_sf = load_sf_opportunities()
    
    gap_analysis = []
    
    for _, rr_row in df_rr.iterrows():
        account = rr_row['Account']
        target = rr_row['Annual_RR_USD']
        
        # Find contracts for this account
        client_contracts = df_results[df_results['client'].str.lower().str.contains(account.lower()[:5], na=False)]
        contract_total = client_contracts['acv_usd'].sum()
        contract_count = len(client_contracts)
        
        # Find SF opportunities
        sf_opps = df_sf[df_sf['Account_Name'].str.contains(account[:5], case=False, na=False)]
        sf_total = sf_opps['ACV'].sum()
        sf_count = len(sf_opps)
        
        gap = target - contract_total
        coverage = (contract_total / target * 100) if target > 0 else 0
        
        gap_analysis.append({
            'Account': account,
            'Nov_RR_Target': target,
            'Contract_Total': contract_total,
            'Contract_Count': contract_count,
            'SF_Total': sf_total,
            'SF_Count': sf_count,
            'Gap_to_Target': gap,
            'Coverage_Pct': coverage,
            'Status': 'ALIGNED' if coverage >= 80 else ('PARTIAL' if coverage >= 40 else 'UNDER')
        })
    
    df_gap = pd.DataFrame(gap_analysis)
    df_gap = df_gap.sort_values('Nov_RR_Target', ascending=False)
    
    print("\nTop 15 Accounts by RR:")
    print(df_gap.head(15).to_string(index=False))
    
    # Phase 7: SF proxy for contracts without values
    print("\n" + "=" * 80)
    print("PHASE 7: SF PROXY VALUES FOR MISSING CONTRACTS")
    print("=" * 80)
    
    proxy_values = []
    for _, row in no_value.iterrows():
        client = row['client']
        contract = row['contract']
        
        # Find potential SF match
        sf_matches = df_sf[df_sf['Account_Name'].str.contains(client[:5], case=False, na=False)]
        
        best_match = None
        best_score = 0
        
        for _, sf_row in sf_matches.iterrows():
            # Simple keyword matching
            score = sum(1 for word in contract.lower().split() if word in sf_row['Opp_Name'].lower())
            if score > best_score:
                best_score = score
                best_match = sf_row
        
        if best_match is not None and best_score >= 2:
            proxy_values.append({
                'Client': client,
                'Contract': contract,
                'SF_Opp_Name': best_match['Opp_Name'],
                'SF_Opp_ID': best_match['Opp_ID'],
                'SF_ACV': best_match['ACV'],
                'Match_Score': best_score,
                'Source': 'SF_PROXY'
            })
            print(f"  {client}: {contract[:40]} → SF ACV ${best_match['ACV']:,.0f}")
    
    df_proxy = pd.DataFrame(proxy_values)
    
    # Phase 8: Generate final outputs
    print("\n" + "=" * 80)
    print("PHASE 8: GENERATING FINAL OUTPUTS")
    print("=" * 80)
    
    # Create comprehensive update file
    updates = []
    
    # Add contracts with extracted values
    for _, row in with_value.iterrows():
        updates.append({
            'Client': row['client'],
            'Contract': row['contract'],
            'ACV_USD': row['acv_usd'],
            'Method': row['calculation_method'],
            'Source': 'CONTRACT_EXTRACTED',
            'Confidence': 'HIGH' if row['calculation_method'] else 'MEDIUM'
        })
    
    # Add proxy values
    for _, row in df_proxy.iterrows():
        updates.append({
            'Client': row['Client'],
            'Contract': row['Contract'],
            'ACV_USD': row['SF_ACV'],
            'Method': f"SF Proxy: {row['SF_Opp_Name'][:50]}",
            'Source': 'SF_PROXY',
            'Confidence': 'LOW'
        })
    
    df_updates = pd.DataFrame(updates)
    
    # Save outputs
    with pd.ExcelWriter(OUTPUT_FILE, engine='openpyxl') as writer:
        df_results.to_excel(writer, sheet_name='All Contracts Deep', index=False)
        df_gap.to_excel(writer, sheet_name='Account Gap Analysis', index=False)
        with_value.to_excel(writer, sheet_name='Contracts With Values', index=False)
        no_value.to_excel(writer, sheet_name='Contracts Still Missing', index=False)
        if not df_proxy.empty:
            df_proxy.to_excel(writer, sheet_name='SF Proxy Values', index=False)
        df_updates.to_excel(writer, sheet_name='All Updates Combined', index=False)
    
    print(f"\nOutput saved to: {OUTPUT_FILE}")
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    
    total_rr = df_rr['Annual_RR_USD'].sum()
    total_extracted = with_value['acv_usd'].sum()
    total_proxy = df_proxy['SF_ACV'].sum() if not df_proxy.empty else 0
    total_combined = total_extracted + total_proxy
    
    print(f"November RR Target:      ${total_rr:>15,.2f}")
    print(f"Contract Extracted:      ${total_extracted:>15,.2f}")
    print(f"SF Proxy Values:         ${total_proxy:>15,.2f}")
    print(f"Total Combined:          ${total_combined:>15,.2f}")
    print(f"Remaining Gap:           ${total_rr - total_combined:>15,.2f}")
    print(f"Coverage:                {(total_combined/total_rr*100):>14.1f}%")
    
    return df_results, df_gap, df_updates

if __name__ == "__main__":
    main()

