#!/usr/bin/env python3
"""
Extract contract terms from Johnson Hana client contract PDFs
"""
import os
import re
import json
from datetime import datetime

# Try multiple PDF extraction methods
def extract_pdf_text(pdf_path):
    """Extract text from PDF using available libraries"""
    text = ""
    
    # Try pdfplumber first (best for tables)
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        if text.strip():
            return text
    except ImportError:
        pass
    except Exception as e:
        print(f"  pdfplumber failed: {e}")
    
    # Try PyPDF2
    try:
        import PyPDF2
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        if text.strip():
            return text
    except ImportError:
        pass
    except Exception as e:
        print(f"  PyPDF2 failed: {e}")
    
    # Try pdf2image + pytesseract for scanned PDFs
    try:
        from pdf2image import convert_from_path
        import pytesseract
        images = convert_from_path(pdf_path)
        for img in images:
            text += pytesseract.image_to_string(img) + "\n"
        if text.strip():
            return text
    except ImportError:
        pass
    except Exception as e:
        print(f"  OCR failed: {e}")
    
    return text

def extract_contract_terms(text, filename):
    """Extract key contract terms from text"""
    terms = {
        'filename': filename,
        'contract_value': None,
        'annual_value': None,
        'term_months': None,
        'start_date': None,
        'end_date': None,
        'consultant_names': [],
        'product_line': None,
        'raw_excerpts': []
    }
    
    # Extract monetary values
    money_patterns = [
        r'\$[\d,]+(?:\.\d{2})?',
        r'€[\d,]+(?:\.\d{2})?',
        r'[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP)',
        r'(?:Total|Value|Amount|Fee|Price)[:\s]+\$?€?[\d,]+(?:\.\d{2})?',
    ]
    
    for pattern in money_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            terms['raw_excerpts'].extend(matches[:5])
    
    # Extract dates
    date_patterns = [
        r'\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}',
        r'(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}',
        r'\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}',
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            terms['raw_excerpts'].extend(matches[:5])
    
    # Extract term/duration
    term_patterns = [
        r'(\d+)\s*(?:month|months)',
        r'(?:term|duration|period)[:\s]+(\d+)\s*(?:month|months)',
        r'(\d+)\s*(?:year|years)',
    ]
    
    for pattern in term_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            for m in matches[:3]:
                terms['raw_excerpts'].append(f"Term: {m}")
    
    # Extract consultant names (common patterns)
    name_patterns = [
        r'(?:Consultant|Resource|Secondee)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)',
        r'([A-Z][a-z]+\s+(?:O\')?[A-Z][a-z]+)\s+(?:will|shall)',
    ]
    
    for pattern in name_patterns:
        matches = re.findall(pattern, text)
        if matches:
            terms['consultant_names'].extend(matches[:5])
    
    return terms

def process_client_folder(client_path, client_name):
    """Process all PDFs in a client folder"""
    results = []
    
    if not os.path.exists(client_path):
        print(f"  Folder not found: {client_path}")
        return results
    
    files = [f for f in os.listdir(client_path) if f.lower().endswith('.pdf')]
    
    for filename in files:
        filepath = os.path.join(client_path, filename)
        print(f"  Processing: {filename}")
        
        text = extract_pdf_text(filepath)
        if text:
            terms = extract_contract_terms(text, filename)
            terms['client'] = client_name
            terms['text_length'] = len(text)
            terms['text_preview'] = text[:2000]  # First 2000 chars for manual review
            results.append(terms)
        else:
            print(f"    Could not extract text from {filename}")
            results.append({
                'client': client_name,
                'filename': filename,
                'error': 'Could not extract text',
                'text_length': 0
            })
    
    return results

# Main execution
if __name__ == "__main__":
    base_path = "/Users/keiganpesenti/Desktop/Client Contracts"
    
    # High priority clients
    high_priority = ['BOI', 'OpenAI', 'Stripe']
    
    # Medium priority clients  
    medium_priority = [
        'Irish Water : Uisce Eireann', 'Indeed', 'ESB', 
        'Etsy', 'Tinder', 'TikTok', 'Dropbox', 'AirBnB'
    ]
    
    all_results = []
    
    print("=" * 80)
    print("CONTRACT EXTRACTION - HIGH PRIORITY")
    print("=" * 80)
    
    for client in high_priority:
        print(f"\n{client}:")
        client_path = os.path.join(base_path, client)
        results = process_client_folder(client_path, client)
        all_results.extend(results)
    
    print("\n" + "=" * 80)
    print("CONTRACT EXTRACTION - MEDIUM PRIORITY")
    print("=" * 80)
    
    for client in medium_priority:
        print(f"\n{client}:")
        client_path = os.path.join(base_path, client)
        results = process_client_folder(client_path, client)
        all_results.extend(results)
    
    # Output results
    print("\n" + "=" * 80)
    print("EXTRACTION RESULTS")
    print("=" * 80)
    
    for result in all_results:
        print(f"\n{'='*60}")
        print(f"Client: {result.get('client', 'Unknown')}")
        print(f"File: {result.get('filename', 'Unknown')}")
        print(f"Text extracted: {result.get('text_length', 0)} chars")
        
        if result.get('error'):
            print(f"Error: {result['error']}")
        elif result.get('text_preview'):
            print(f"\n--- TEXT PREVIEW (first 2000 chars) ---")
            print(result['text_preview'])
            print(f"--- END PREVIEW ---")
        
        if result.get('raw_excerpts'):
            print(f"\nKey excerpts found: {result['raw_excerpts']}")
    
    # Save to JSON for further processing
    output_path = "/Users/keiganpesenti/revops_weekly_update/gtm-brain/data/contract-extractions.json"
    with open(output_path, 'w') as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n\nResults saved to: {output_path}")






