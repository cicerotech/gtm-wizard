import pandas as pd

xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')

print('='*80)
print('SHEET NAMES:')
print('='*80)
for i, name in enumerate(xlsx.sheet_names):
    print(f'  {i+1}. "{name}"')
print()

# Read first sheet specifically (Marketing Campaigns)
if len(xlsx.sheet_names) > 0:
    first_sheet = xlsx.sheet_names[0]
    print(f'\n{"="*80}')
    print(f'SHEET 1: {first_sheet}')
    print('='*80)
    df1 = pd.read_excel(xlsx, sheet_name=first_sheet)
    print(f'Columns: {list(df1.columns)}')
    print(f'Rows: {len(df1)}')
    print('\nFull Content:')
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 300)
    pd.set_option('display.max_colwidth', 60)
    print(df1.to_string())
