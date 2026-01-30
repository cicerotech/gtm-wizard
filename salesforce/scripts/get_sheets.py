import pandas as pd
xlsx = pd.ExcelFile('/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING DATA REFERENCE.xlsx')
print('Sheet Names:')
for i, name in enumerate(xlsx.sheet_names):
    df = pd.read_excel(xlsx, sheet_name=name)
    cols = list(df.columns)[:6]
    print(f'{i+1}. "{name}" - {len(df)} rows')
    print(f'   Columns: {cols}')
    print()
