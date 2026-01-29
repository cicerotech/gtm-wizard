#!/usr/bin/env python3
"""
Deep Contract Parser - Full Document Analysis
Extracts fee schedules, rates, hours, discounts from all pages of contract PDFs
"""

import os
import re
import json
from PyPDF2 import PdfReader
from datetime import datetime
import pandas as pd

# --- Configuration ---
CONTRACTS_DIR = '/Users/keiganpesenti/Desktop/Client Contracts/'
OUTPUT_DIR = '/Users/keiganpesenti/Desktop/'

# Clients with November RR (priority order by revenue)
PRIORITY_CLIENTS = [
    'BOI',
    'OpenAI', 
    'Stripe',
    'ESB',
    'Irish Water : Uisce Eireann',
    'Indeed',
    'Udemy',
    'Etsy',
    'TikTok',
    'Tinder',
    'Dropbox',
    'AirBnB',
    'Airbnb',
    'Coillte',
    'Taoglas',
    'Teamwork',
    'Gilead',
    'Glanbia',
    'Kingspan',
    'Northern Trust',
    'Orsted',
    'Perrigo',
    'Sisk',
    'Kellanova',
    'Consensys',
    'Datalex',
    'CommScope',
    'ACS',
    'Airship',
    'Aryza',
    'Coimisiún na Meán',
    'NTMA',
    'DCEDIY',
    'Hayes',
    'Coleman Legal',
    'Creed McStay'
]

def extract_full_text(pdf_path):
    """Extract ALL text from every page of PDF"""
    try:
        reader = PdfReader(pdf_path)
        full_text = ""
        page_texts = []
        
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            page_texts.append({
                'page_num': i + 1,
                'text': page_text,
                'char_count': len(page_text)
            })
            full_text += f"\n--- PAGE {i+1} ---\n" + page_text
        
        return full_text, page_texts, len(reader.pages)
    except Exception as e:
        return None, [], 0

def extract_currency_values(text):
    """Extract all € and $ amounts with context"""
    values = []
    
    # Euro patterns
    euro_patterns = [
        r'€\s*([\d,]+(?:\.\d{2})?)',
        r'EUR\s*([\d,]+(?:\.\d{2})?)',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)',
    ]
    
    for pattern in euro_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            # Get context around the match (50 chars before and after)
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end].replace('\n', ' ')
            
            value_str = m.group(1).replace(',', '')
            try:
                value = float(value_str)
                if value >= 50:  # Ignore trivial amounts
                    values.append({
                        'amount': value,
                        'currency': 'EUR',
                        'context': context
                    })
            except:
                pass
    
    return values

def extract_hourly_rates(text):
    """Extract hourly rate information"""
    rates = []
    
    patterns = [
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:per|/)\s*hour',
        r'([\d,]+(?:\.\d{2})?)\s*(?:Euro|EUR|€)\s*(?:per|/)\s*hour',
        r'hourly\s*rate[:\s]*€?\s*([\d,]+(?:\.\d{2})?)',
        r'rate\s*of\s*€?\s*([\d,]+(?:\.\d{2})?)\s*per\s*hour',
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end].replace('\n', ' ')
            
            value_str = m.group(1).replace(',', '')
            try:
                rate = float(value_str)
                if 30 <= rate <= 500:  # Reasonable hourly rate range
                    rates.append({
                        'rate': rate,
                        'context': context
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
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end].replace('\n', ' ')
            
            try:
                hrs = int(m.group(1))
                if 5 <= hrs <= 200:  # Reasonable weekly hours
                    hours.append({
                        'hours': hrs,
                        'context': context
                    })
            except:
                pass
    
    return hours

def extract_fixed_fees(text):
    """Extract fixed fee arrangements"""
    fees = []
    
    patterns = [
        r'fixed\s*fee[:\s]*€?\s*([\d,]+(?:\.\d{2})?)',
        r'€\s*([\d,]+(?:\.\d{2})?)\s*(?:fixed|flat)\s*fee',
        r'fee\s*(?:of|:)\s*€?\s*([\d,]+(?:\.\d{2})?)\s*(?:per|for)\s*([\d]+)\s*months?',
        r'([\d]+)\s*months?\s*[=:\-]\s*€?\s*([\d,]+(?:\.\d{2})?)',
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            start = max(0, m.start() - 80)
            end = min(len(text), m.end() + 80)
            context = text[start:end].replace('\n', ' ')
            
            groups = m.groups()
            fee_info = {
                'context': context,
                'raw_match': m.group(0)
            }
            
            # Try to extract amount
            for g in groups:
                if g:
                    try:
                        val = float(g.replace(',', ''))
                        if val > 1000:
                            fee_info['amount'] = val
                        elif val <= 60:
                            fee_info['term_months'] = int(val)
                    except:
                        pass
            
            if 'amount' in fee_info:
                fees.append(fee_info)
    
    return fees

def extract_discounts(text):
    """Extract discount percentages"""
    discounts = []
    
    patterns = [
        r'([\d]+(?:\.\d+)?)\s*%\s*discount',
        r'discount[:\s]*([\d]+(?:\.\d+)?)\s*%',
        r'([\d]+(?:\.\d+)?)\s*(?:percent|%)\s*(?:off|reduction)',
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end].replace('\n', ' ')
            
            try:
                pct = float(m.group(1))
                if 0 < pct < 100:
                    discounts.append({
                        'percentage': pct,
                        'context': context
                    })
            except:
                pass
    
    return discounts

def extract_term_dates(text):
    """Extract contract term and dates"""
    term_info = {}
    
    # Term in months/years
    term_patterns = [
        r'term[:\s]*(?:of\s*)?([\d]+)\s*(months?|years?)',
        r'([\d]+)\s*(months?|years?)\s*(?:term|duration|period)',
        r'duration[:\s]*([\d]+)\s*(months?|years?)',
        r'(?:for\s+a\s+period\s+of\s+)([\d]+)\s*(months?|years?)',
    ]
    
    for pattern in term_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            num = int(match.group(1))
            unit = match.group(2).lower()
            if 'year' in unit:
                num = num * 12
            term_info['term_months'] = num
            break
    
    # Date patterns
    date_patterns = [
        r'(?:effective|commencement|start)\s*date[:\s]*(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s/\-\.]+\d{4})',
        r'(?:effective|commencement|start)\s*date[:\s]*(\d{1,2}[\s/\-\.]+\d{1,2}[\s/\-\.]+\d{2,4})',
        r'(?:expir|terminat|end)\s*(?:es?|ion)?\s*(?:date)?[:\s]*(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s/\-\.]+\d{4})',
        r'from\s+(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s/\-\.]+\d{4})',
        r'until\s+(\d{1,2}[\s/\-\.]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s/\-\.]+\d{4})',
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            if 'effective' in pattern.lower() or 'commencement' in pattern.lower() or 'start' in pattern.lower() or 'from' in pattern.lower():
                term_info['start_date'] = matches[0] if matches else None
            if 'expir' in pattern.lower() or 'terminat' in pattern.lower() or 'end' in pattern.lower() or 'until' in pattern.lower():
                term_info['end_date'] = matches[0] if matches else None
    
    return term_info

def extract_consultant_info(text):
    """Extract consultant names and roles"""
    consultants = []
    
    patterns = [
        r'(?:consultant|lawyer|associate)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'(?:Lead|Senior|Junior)\s+(?:Consultant|Lawyer)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)',
        r'(?:assigned|appointed)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        consultants.extend(matches)
    
    return list(set(consultants))

def find_fee_schedule_pages(page_texts):
    """Find pages that likely contain fee schedules"""
    fee_pages = []
    
    keywords = [
        'charges schedule', 'fee schedule', 'pricing schedule',
        'fixed fee', 'hourly rate', 'monthly fee', 'annual fee',
        'charges', 'fees', 'compensation', 'payment terms'
    ]
    
    for page in page_texts:
        text_lower = page['text'].lower()
        for keyword in keywords:
            if keyword in text_lower:
                fee_pages.append({
                    'page_num': page['page_num'],
                    'keyword': keyword,
                    'text_preview': page['text'][:500]
                })
                break
    
    return fee_pages

def calculate_acv(contract_data):
    """Calculate ACV from extracted contract data"""
    acv = None
    calculation_method = None
    
    # Method 1: Fixed fee with term
    if contract_data.get('fixed_fees'):
        for fee in contract_data['fixed_fees']:
            if 'amount' in fee and 'term_months' in fee:
                monthly = fee['amount'] / fee['term_months']
                acv = monthly * 12
                calculation_method = f"Fixed fee €{fee['amount']:,.0f} / {fee['term_months']} months * 12"
                break
    
    # Method 2: Hourly rate * weekly hours * 52
    if not acv and contract_data.get('hourly_rates') and contract_data.get('weekly_hours'):
        rate = contract_data['hourly_rates'][0]['rate']
        hours = contract_data['weekly_hours'][0]['hours']
        acv = rate * hours * 52
        calculation_method = f"€{rate}/hr * {hours} hrs/week * 52 weeks"
    
    # Method 3: Monthly fee * 12
    if not acv and contract_data.get('currency_values'):
        # Look for monthly references
        for val in contract_data['currency_values']:
            if 'month' in val['context'].lower() and val['amount'] > 5000:
                acv = val['amount'] * 12
                calculation_method = f"Monthly €{val['amount']:,.0f} * 12"
                break
    
    # Apply discount if found
    if acv and contract_data.get('discounts'):
        discount_pct = contract_data['discounts'][0]['percentage']
        original_acv = acv
        acv = acv * (1 - discount_pct / 100)
        calculation_method += f" minus {discount_pct}% discount"
    
    return acv, calculation_method

def process_contract(client_name, pdf_path):
    """Process a single contract PDF with deep analysis"""
    filename = os.path.basename(pdf_path)
    
    full_text, page_texts, total_pages = extract_full_text(pdf_path)
    
    if not full_text:
        return {
            'client': client_name,
            'filename': filename,
            'error': 'Could not extract text',
            'total_pages': 0
        }
    
    # Extract all components
    contract_data = {
        'client': client_name,
        'filename': filename,
        'total_pages': total_pages,
        'total_chars': len(full_text),
        'currency_values': extract_currency_values(full_text),
        'hourly_rates': extract_hourly_rates(full_text),
        'weekly_hours': extract_weekly_hours(full_text),
        'fixed_fees': extract_fixed_fees(full_text),
        'discounts': extract_discounts(full_text),
        'term_info': extract_term_dates(full_text),
        'consultants': extract_consultant_info(full_text),
        'fee_schedule_pages': find_fee_schedule_pages(page_texts)
    }
    
    # Calculate ACV
    acv, calc_method = calculate_acv(contract_data)
    contract_data['calculated_acv'] = acv
    contract_data['acv_calculation_method'] = calc_method
    
    # Get monthly value
    if acv:
        contract_data['monthly_value'] = acv / 12
    
    return contract_data

def main():
    print("=" * 100)
    print("DEEP CONTRACT PARSER - FULL DOCUMENT ANALYSIS")
    print("Extracting fee schedules, rates, hours, discounts from ALL pages")
    print("=" * 100 + "\n")
    
    all_contracts = []
    summary_data = []
    
    # Get list of client folders
    available_clients = [d for d in os.listdir(CONTRACTS_DIR) if os.path.isdir(os.path.join(CONTRACTS_DIR, d))]
    print(f"Available client folders: {len(available_clients)}")
    print(f"  {available_clients}\n")
    
    for client in PRIORITY_CLIENTS:
        # Find matching folder
        matching_folder = None
        for folder in available_clients:
            if client.lower() in folder.lower() or folder.lower() in client.lower():
                matching_folder = folder
                break
        
        if not matching_folder:
            continue
        
        client_path = os.path.join(CONTRACTS_DIR, matching_folder)
        pdf_files = [f for f in os.listdir(client_path) if f.lower().endswith('.pdf')]
        
        print("=" * 100)
        print(f"CLIENT: {matching_folder}")
        print(f"PDFs: {len(pdf_files)}")
        print("=" * 100)
        
        for pdf_file in pdf_files:
            pdf_path = os.path.join(client_path, pdf_file)
            print(f"\n  Processing: {pdf_file}")
            
            contract_data = process_contract(matching_folder, pdf_path)
            all_contracts.append(contract_data)
            
            # Print summary
            print(f"    Pages: {contract_data.get('total_pages', 0)}")
            print(f"    Fee schedule pages: {len(contract_data.get('fee_schedule_pages', []))}")
            
            if contract_data.get('hourly_rates'):
                rates = [r['rate'] for r in contract_data['hourly_rates']]
                print(f"    Hourly rates found: €{', €'.join([f'{r:.0f}' for r in rates])}")
            
            if contract_data.get('weekly_hours'):
                hours = [h['hours'] for h in contract_data['weekly_hours']]
                print(f"    Weekly hours found: {hours}")
            
            if contract_data.get('fixed_fees'):
                print(f"    Fixed fees found: {len(contract_data['fixed_fees'])}")
                for fee in contract_data['fixed_fees'][:3]:
                    if 'amount' in fee:
                        print(f"      - €{fee['amount']:,.0f}")
            
            if contract_data.get('discounts'):
                for d in contract_data['discounts']:
                    print(f"    Discount: {d['percentage']}%")
            
            if contract_data.get('term_info'):
                if 'term_months' in contract_data['term_info']:
                    print(f"    Term: {contract_data['term_info']['term_months']} months")
                if 'start_date' in contract_data['term_info']:
                    print(f"    Start: {contract_data['term_info']['start_date']}")
                if 'end_date' in contract_data['term_info']:
                    print(f"    End: {contract_data['term_info']['end_date']}")
            
            if contract_data.get('calculated_acv'):
                print(f"    >>> CALCULATED ACV: €{contract_data['calculated_acv']:,.0f}")
                print(f"        Method: {contract_data['acv_calculation_method']}")
                print(f"        Monthly: €{contract_data['monthly_value']:,.0f}")
            
            # Add to summary
            summary_data.append({
                'Client': matching_folder,
                'Contract': pdf_file.replace('.pdf', ''),
                'Pages': contract_data.get('total_pages', 0),
                'Hourly_Rate': contract_data['hourly_rates'][0]['rate'] if contract_data.get('hourly_rates') else None,
                'Weekly_Hours': contract_data['weekly_hours'][0]['hours'] if contract_data.get('weekly_hours') else None,
                'Fixed_Fee': contract_data['fixed_fees'][0].get('amount') if contract_data.get('fixed_fees') else None,
                'Discount_Pct': contract_data['discounts'][0]['percentage'] if contract_data.get('discounts') else None,
                'Term_Months': contract_data.get('term_info', {}).get('term_months'),
                'Start_Date': contract_data.get('term_info', {}).get('start_date'),
                'End_Date': contract_data.get('term_info', {}).get('end_date'),
                'Calculated_ACV': contract_data.get('calculated_acv'),
                'Calculation_Method': contract_data.get('acv_calculation_method'),
                'Monthly_Value': contract_data.get('monthly_value'),
                'Consultants': ', '.join(contract_data.get('consultants', []))[:100]
            })
        
        print("\n")
    
    # Save results
    print("=" * 100)
    print("SAVING RESULTS")
    print("=" * 100)
    
    # Save full JSON
    with open(os.path.join(OUTPUT_DIR, 'Deep_Contract_Analysis.json'), 'w') as f:
        json.dump(all_contracts, f, indent=2, default=str)
    print(f"Full analysis saved to: {os.path.join(OUTPUT_DIR, 'Deep_Contract_Analysis.json')}")
    
    # Save summary Excel
    df_summary = pd.DataFrame(summary_data)
    df_summary.to_excel(os.path.join(OUTPUT_DIR, 'Contract_Value_Summary.xlsx'), index=False)
    print(f"Summary saved to: {os.path.join(OUTPUT_DIR, 'Contract_Value_Summary.xlsx')}")
    
    # Print summary by client
    print("\n" + "=" * 100)
    print("SUMMARY BY CLIENT")
    print("=" * 100 + "\n")
    
    df_by_client = df_summary.groupby('Client').agg({
        'Contract': 'count',
        'Calculated_ACV': 'sum',
        'Monthly_Value': 'sum'
    }).reset_index()
    df_by_client.columns = ['Client', 'Contract_Count', 'Total_ACV', 'Total_Monthly']
    df_by_client = df_by_client.sort_values('Total_ACV', ascending=False)
    
    print(df_by_client.to_string(index=False))
    
    # Save client summary
    df_by_client.to_excel(os.path.join(OUTPUT_DIR, 'Contract_Client_Totals.xlsx'), index=False)
    print(f"\nClient totals saved to: {os.path.join(OUTPUT_DIR, 'Contract_Client_Totals.xlsx')}")
    
    return all_contracts, df_summary

if __name__ == "__main__":
    main()






