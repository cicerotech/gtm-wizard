import pandas as pd

xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
print('=== ALL SHEETS ===')
for i, name in enumerate(xlsx.sheet_names):
    print(f'{i+1}. {name}')
print()

# Read each sheet and show structure
for sheet in xlsx.sheet_names:
    df = pd.read_excel(xlsx, sheet_name=sheet)
    print(f'=== SHEET: {sheet} ===')
    print(f'Columns: {list(df.columns)}')
    print(f'Rows: {len(df)}')
    if len(df) > 0:
        print('Sample data:')
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', None)
        pd.set_option('display.max_colwidth', 50)
        print(df.to_string())
    print()
    print('='*100)
    print()
