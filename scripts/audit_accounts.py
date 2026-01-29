import pandas as pd

xlsx = pd.ExcelFile('/Users/keiganpesenti/Desktop/create acct audit.xlsx')

# Read ALL accounts from first sheet
df_new = pd.read_excel(xlsx, sheet_name=0)
print('=== ALL NEW ACCOUNTS (91 total) ===')
for idx, row in df_new.iterrows():
    acct = row["Account Name"]
    lead = row["New Business Lead "]
    print(f'{idx+1}. {acct} | {lead}')

print('\n' + '='*80)
print('\n=== CURRENT SF ACCOUNTS (second sheet) ===')
df_sf = pd.read_excel(xlsx, sheet_name=1)
print('Columns:', list(df_sf.columns))
print('Shape:', df_sf.shape)
print('\nAll SF Account Names:')
pd.set_option('display.max_colwidth', 60)
for idx, row in df_sf.iterrows():
    print(f'{idx+1}. {row.iloc[0]}')




