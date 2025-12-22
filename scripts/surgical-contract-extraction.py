#!/usr/bin/env python3
"""
SURGICAL CONTRACT EXTRACTION
Carefully extracts values from each contract with source citations
Every value must be traceable to the exact text in the document
"""

import os
import re
import json
import pandas as pd
from PyPDF2 import PdfReader
from datetime import datetime

# --- Configuration ---
CONTRACTS_DIR = '/Users/keiganpesenti/Desktop/Client Contracts/'
OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_SURGICAL.xlsx'
EUR_TO_USD = 1.18

def extract_full_text(pdf_path):
    """Extract ALL text from PDF"""
    try:
        reader = PdfReader(pdf_path)
        full_text = ""
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            full_text += f"\n--- PAGE {i+1} ---\n{page_text}"
        return full_text
    except Exception as e:
        return f"ERROR: {str(e)}"

def find_hourly_rate(text):
    """Find hourly rate with exact source quote"""
    patterns = [
        # €80 per hour, €80/hour, €80 per hr
        r'[€\$]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:per\s*hour|/\s*hour|per\s*hr|/hr|ph|p\.h\.)',
        # hourly rate of €80
        r'hourly\s+rate\s+(?:of\s+)?[€\$]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',
        # rate: €80/hr
        r'rate[:\s]+[€\$]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:/hr|per hour)',
        # at €80 per hour
        r'at\s+[€\$]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*per\s*hour',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            rate = float(match.group(1).replace(',', ''))
            # Get surrounding context (50 chars before and after)
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].replace('\n', ' ').strip()
            return rate, f'"{context}"'
    
    return None, None

def find_weekly_hours(text):
    """Find weekly hours commitment with exact source"""
    patterns = [
        r'(\d+)\s*hours?\s*per\s*week',
        r'(\d+)\s*hrs?/week',
        r'(\d+)\s*hours?\s*weekly',
        r'for\s+(\d+)\s*hours?\s*(?:per\s*week|weekly)',
        r'(\d+)\s*hours?\s*a\s*week',
        # "Minimum Hours 20 per week"
        r'[Mm]inimum\s+[Hh]ours?\s+(\d+)\s*(?:per\s*week)?',
        # "20 per week" in context of hours
        r'(?:[Hh]ours?|hrs?)\s+(\d+)\s+per\s+week',
        # "20 hours per week" with hours after number
        r'(\d+)\s+hours?\s+per\s+week',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            hours = int(match.group(1))
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].replace('\n', ' ').strip()
            return hours, f'"{context}"'
    
    return None, None

def find_monthly_fee(text):
    """Find monthly fee with exact source"""
    patterns = [
        r'[€\$]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per\s*month|/month|monthly|p\.m\.|pm)',
        r'monthly\s+(?:fee|amount|cost|rate)\s+(?:of\s+)?[€\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
        r'(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:EUR|USD|€|\$)\s*(?:per\s*month|monthly)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            fee = float(match.group(1).replace(',', ''))
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].replace('\n', ' ').strip()
            return fee, f'"{context}"'
    
    return None, None

def find_annual_fee(text):
    """Find annual/yearly fee with exact source"""
    patterns = [
        r'[€\$]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per\s*(?:annum|year)|annually|p\.a\.)',
        r'annual\s+(?:fee|value|cost|amount)\s+(?:of\s+)?[€\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
        r'ACV\s*[:\s]*[€\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            fee = float(match.group(1).replace(',', ''))
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].replace('\n', ' ').strip()
            return fee, f'"{context}"'
    
    return None, None

def find_total_value(text):
    """Find total contract value with exact source"""
    patterns = [
        r'(?:total|aggregate|maximum|not\s+to\s+exceed|NTE)\s+(?:contract\s+)?(?:value|amount|fee|cost)\s*[:\s]*[€\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
        r'[€\$]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:total|in\s+aggregate|NTE)',
        r'TCV\s*[:\s]*[€\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = float(match.group(1).replace(',', ''))
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].replace('\n', ' ').strip()
            return value, f'"{context}"'
    
    return None, None

def find_start_date(text):
    """Find contract start/effective date with exact source"""
    patterns = [
        # "with effect from March 1st, 2024 and shall expire" - prioritize this pattern
        r'with\s+effect\s+from\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'with\s+effect\s+from\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "extended with effect from March 1st, 2024"
        r'extended\s+with\s+effect\s+from\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        r'extended\s+with\s+effect\s+from\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        # "effective from March 1st, 2024"
        r'(?:effective|commencement|start)\s+(?:date\s+)?(?:from\s+|on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "from March 1, 2024"
        r'from\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'from\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "01/03/2024" format
        r'(?:effective|start|commencement)\s+(?:date)?[:\s]+(\d{1,2}/\d{1,2}/\d{2,4})',
        # "2024-03-01" format
        r'(?:effective|start|commencement)\s+(?:date)?[:\s]+(\d{4}-\d{2}-\d{2})',
        # Standalone month year "January 2025"
        r'(?:commencing|starting|from)\s+(\d{1,2}(?:st|nd|rd|th)?\s+)?(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1) if match.group(1) else match.group(0)
            start = max(0, match.start() - 30)
            end = min(len(text), match.end() + 30)
            context = text[start:end].replace('\n', ' ').strip()
            
            # Parse the date
            parsed_date = parse_date_string(date_str)
            return parsed_date, f'"{context}"'
    
    return None, None

def find_end_date(text):
    """Find contract end/expiry date with exact source"""
    patterns = [
        # "shall expire on March 1st, 2026" - prioritize this
        r'shall\s+expire\s+on\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'shall\s+expire\s+on\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "expire on March 1st, 2026"
        r'(?:expire|expiry|end|terminate|termination)\s+(?:date\s+)?(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'(?:expire|expiry|end|terminate|termination)\s+(?:date\s+)?(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "until March 1, 2026"
        r'until\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'until\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "ending on March 1, 2026"
        r'ending\s+(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'ending\s+(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
        # "and expire on"
        r'and\s+(?:shall\s+)?expire\s+on\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})',
        r'and\s+(?:shall\s+)?expire\s+on\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            start = max(0, match.start() - 30)
            end = min(len(text), match.end() + 30)
            context = text[start:end].replace('\n', ' ').strip()
            
            parsed_date = parse_date_string(date_str)
            return parsed_date, f'"{context}"'
    
    return None, None

def find_term_months(text):
    """Find term in months with exact source"""
    patterns = [
        r'(?:term|duration|period)\s+(?:of\s+)?(\d+)\s*months?',
        r'(\d+)\s*months?\s+(?:term|duration|period)',
        r'for\s+(?:a\s+)?(?:period\s+of\s+)?(\d+)\s*months?',
        r'(\d+)\s*-?\s*month\s+(?:term|engagement|contract)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            months = int(match.group(1))
            start = max(0, match.start() - 30)
            end = min(len(text), match.end() + 30)
            context = text[start:end].replace('\n', ' ').strip()
            return months, f'"{context}"'
    
    # Check for years
    year_patterns = [
        r'(?:term|duration)\s+(?:of\s+)?(\d+)\s*years?',
        r'(\d+)\s*years?\s+(?:term|duration)',
    ]
    
    for pattern in year_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            years = int(match.group(1))
            months = years * 12
            start = max(0, match.start() - 30)
            end = min(len(text), match.end() + 30)
            context = text[start:end].replace('\n', ' ').strip()
            return months, f'"{context}"'
    
    return None, None

def parse_date_string(date_str):
    """Parse various date formats"""
    if not date_str:
        return None
    
    # Clean up
    date_str = date_str.strip()
    date_str = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)  # Remove ordinals
    
    formats = [
        "%d %B, %Y", "%d %B %Y", "%B %d, %Y", "%B %d %Y",
        "%d/%m/%Y", "%m/%d/%Y", "%d/%m/%y", "%m/%d/%y",
        "%Y-%m-%d", "%d-%m-%Y",
    ]
    
    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime('%Y-%m-%d')
        except:
            continue
    
    return date_str  # Return raw if can't parse

def detect_currency(text):
    """Detect if contract is in EUR or USD"""
    eur_count = len(re.findall(r'€|EUR|Euro', text, re.IGNORECASE))
    usd_count = len(re.findall(r'\$|USD|Dollar', text, re.IGNORECASE))
    
    if eur_count > usd_count:
        return 'EUR'
    elif usd_count > eur_count:
        return 'USD'
    else:
        return 'EUR'  # Default for JH EU contracts

def calculate_acv(hourly_rate, weekly_hours, monthly_fee, annual_fee, total_value, term_months):
    """Calculate ACV from available data"""
    
    # Priority 1: Direct annual fee
    if annual_fee:
        return annual_fee, "annual_fee"
    
    # Priority 2: Monthly fee × 12
    if monthly_fee:
        return monthly_fee * 12, "monthly_fee × 12"
    
    # Priority 3: Hourly rate × weekly hours × 52
    if hourly_rate and weekly_hours:
        return hourly_rate * weekly_hours * 52, "hourly_rate × weekly_hours × 52"
    
    # Priority 4: Total value ÷ term years
    if total_value and term_months and term_months > 0:
        years = term_months / 12
        return total_value / years, f"total_value ÷ {years:.1f} years"
    
    return None, None

def process_contract(client, pdf_file, pdf_path):
    """Process a single contract surgically"""
    print(f"\n{'='*80}")
    print(f"PROCESSING: {client} / {pdf_file}")
    print(f"{'='*80}")
    
    text = extract_full_text(pdf_path)
    
    if text.startswith("ERROR"):
        return {
            'Client': client,
            'Contract': pdf_file.replace('.pdf', ''),
            'Error': text,
        }
    
    # Extract each field with source
    hourly_rate, hourly_source = find_hourly_rate(text)
    weekly_hours, hours_source = find_weekly_hours(text)
    monthly_fee, monthly_source = find_monthly_fee(text)
    annual_fee, annual_source = find_annual_fee(text)
    total_value, total_source = find_total_value(text)
    start_date, start_source = find_start_date(text)
    end_date, end_source = find_end_date(text)
    term_months, term_source = find_term_months(text)
    currency = detect_currency(text)
    
    # Calculate term from dates if not explicit
    if not term_months and start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            term_months = max(1, round((end_dt - start_dt).days / 30))
            term_source = f"Calculated from {start_date} to {end_date}"
        except:
            pass
    
    # Calculate ACV
    acv_eur, acv_calc_method = calculate_acv(hourly_rate, weekly_hours, monthly_fee, annual_fee, total_value, term_months)
    
    # Convert to USD if EUR
    acv_usd = None
    if acv_eur:
        if currency == 'EUR':
            acv_usd = acv_eur * EUR_TO_USD
        else:
            acv_usd = acv_eur
    
    # Build source citation for ACV
    acv_source = ""
    if acv_calc_method:
        if "hourly" in acv_calc_method:
            acv_source = f"{acv_calc_method}: €{hourly_rate}/hr × {weekly_hours}hrs/wk × 52wks"
        elif "monthly" in acv_calc_method:
            acv_source = f"{acv_calc_method}: €{monthly_fee}/mo × 12"
        elif "annual" in acv_calc_method:
            acv_source = f"Direct annual fee: €{annual_fee}"
        else:
            acv_source = acv_calc_method
        
        if currency == 'EUR':
            acv_source += f" = €{acv_eur:,.0f} × 1.18 = ${acv_usd:,.0f}"
    
    # Print findings
    print(f"\n📋 EXTRACTED:")
    print(f"   Start Date: {start_date or 'NOT FOUND'}")
    if start_source: print(f"      Source: {start_source[:100]}")
    print(f"   End Date: {end_date or 'NOT FOUND'}")
    if end_source: print(f"      Source: {end_source[:100]}")
    print(f"   Term: {term_months or 'NOT FOUND'} months")
    if term_source: print(f"      Source: {term_source[:100]}")
    print(f"   Hourly Rate: {'€' + str(hourly_rate) if hourly_rate else 'NOT FOUND'}")
    if hourly_source: print(f"      Source: {hourly_source[:100]}")
    print(f"   Weekly Hours: {weekly_hours or 'NOT FOUND'}")
    if hours_source: print(f"      Source: {hours_source[:100]}")
    print(f"   Currency: {currency}")
    print(f"   ACV (USD): {'$' + f'{acv_usd:,.0f}' if acv_usd else 'NOT FOUND'}")
    if acv_source: print(f"      Calculation: {acv_source}")
    
    return {
        'Client': client,
        'Contract': pdf_file.replace('.pdf', '').replace('.PDF', ''),
        'Start_Date': start_date,
        'Start_Date_Source': start_source,
        'End_Date': end_date,
        'End_Date_Source': end_source,
        'Term_Months': term_months,
        'Term_Source': term_source,
        'Hourly_Rate_EUR': hourly_rate,
        'Hourly_Rate_Source': hourly_source,
        'Weekly_Hours': weekly_hours,
        'Weekly_Hours_Source': hours_source,
        'Monthly_Fee_EUR': monthly_fee,
        'Monthly_Fee_Source': monthly_source,
        'Annual_Fee_EUR': annual_fee,
        'Annual_Fee_Source': annual_source,
        'Total_Value_EUR': total_value,
        'Total_Value_Source': total_source,
        'Currency': currency,
        'ACV_EUR': acv_eur,
        'ACV_USD': acv_usd,
        'ACV_Calculation': acv_source,
        'Text_Length': len(text),
    }

def main():
    print("=" * 100)
    print("SURGICAL CONTRACT EXTRACTION")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    all_results = []
    
    # Process each client folder
    client_folders = sorted([d for d in os.listdir(CONTRACTS_DIR) 
                            if os.path.isdir(os.path.join(CONTRACTS_DIR, d))])
    
    for client in client_folders:
        client_path = os.path.join(CONTRACTS_DIR, client)
        pdf_files = [f for f in os.listdir(client_path) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            print(f"\n⚠️  {client}: No PDF files found")
            continue
        
        for pdf_file in pdf_files:
            pdf_path = os.path.join(client_path, pdf_file)
            result = process_contract(client, pdf_file, pdf_path)
            all_results.append(result)
    
    # Create DataFrame
    df = pd.DataFrame(all_results)
    
    # Summary
    print("\n" + "=" * 100)
    print("EXTRACTION SUMMARY")
    print("=" * 100)
    
    total = len(df)
    with_acv = len(df[df['ACV_USD'].notna()])
    with_dates = len(df[df['Start_Date'].notna()])
    with_term = len(df[df['Term_Months'].notna()])
    
    print(f"Total contracts: {total}")
    print(f"With ACV extracted: {with_acv} ({100*with_acv/total:.0f}%)")
    print(f"With start date: {with_dates} ({100*with_dates/total:.0f}%)")
    print(f"With term: {with_term} ({100*with_term/total:.0f}%)")
    
    total_acv = df['ACV_USD'].sum()
    print(f"\nTotal ACV: ${total_acv:,.2f}")
    
    # By client
    print("\nBy Client:")
    for client in df['Client'].unique():
        client_df = df[df['Client'] == client]
        client_acv = client_df['ACV_USD'].sum()
        contracts = len(client_df)
        with_value = len(client_df[client_df['ACV_USD'].notna()])
        print(f"  {client}: {contracts} contracts, {with_value} with value, ${client_acv:,.0f}")
    
    # Save
    print("\n" + "=" * 100)
    print("SAVING OUTPUT")
    print("=" * 100)
    
    # Reorder columns for readability
    column_order = [
        'Client', 'Contract',
        'Start_Date', 'Start_Date_Source',
        'End_Date', 'End_Date_Source',
        'Term_Months', 'Term_Source',
        'Hourly_Rate_EUR', 'Weekly_Hours', 'Hourly_Rate_Source', 'Weekly_Hours_Source',
        'Monthly_Fee_EUR', 'Monthly_Fee_Source',
        'Annual_Fee_EUR', 'Annual_Fee_Source',
        'Total_Value_EUR', 'Total_Value_Source',
        'Currency', 'ACV_EUR', 'ACV_USD', 'ACV_Calculation',
        'Text_Length'
    ]
    
    # Only include columns that exist
    cols = [c for c in column_order if c in df.columns]
    df = df[cols]
    
    df.to_excel(OUTPUT_XLSX, index=False)
    print(f"Saved to: {OUTPUT_XLSX}")
    
    # Also save a validation sheet
    print("\n📋 CONTRACTS NEEDING MANUAL REVIEW:")
    needs_review = df[df['ACV_USD'].isna() | df['Start_Date'].isna()]
    for _, row in needs_review.iterrows():
        print(f"  ⚠️  {row['Client']} - {row['Contract'][:50]}")
        if pd.isna(row['ACV_USD']):
            print(f"      Missing: ACV")
        if pd.isna(row['Start_Date']):
            print(f"      Missing: Start Date")
    
    print(f"\n✅ Complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()

