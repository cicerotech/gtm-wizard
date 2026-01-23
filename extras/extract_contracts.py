import pdfplumber

files = [
    '/Users/keiganpesenti/Desktop/SRF Jamie O Gorman 29th December 2025 - 27th of Dec 2026.pdf',
    '/Users/keiganpesenti/Desktop/SRF Luke Sexton  29th December 2025 - 27th of Dec 2026.pdf',
    '/Users/keiganpesenti/Desktop/SRF Amal Elbay  29th December 2025 - 27th of Dec 2026.pdf'
]

for f in files:
    print("\n" + "="*80)
    print("FILE: " + f.split("/")[-1])
    print("="*80)
    try:
        with pdfplumber.open(f) as pdf:
            for i, page in enumerate(pdf.pages[:5]):
                text = page.extract_text()
                if text:
                    print("\n--- Page " + str(i+1) + " ---")
                    print(text)
    except Exception as e:
        print("Error: " + str(e))

