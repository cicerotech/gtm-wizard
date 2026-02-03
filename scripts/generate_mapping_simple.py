#!/usr/bin/env python3
import pandas as pd

xlsx = pd.ExcelFile('data/Business Lead 2026 Accounts_Olivia tab.xlsx')
df = pd.read_excel(xlsx, sheet_name='Account Folders with Subnotes')

EMAIL_MAP = {
    'Keigan Pesenti': 'keigan@eudia.com',
    'Alex Fox': 'alex@eudia.com',
    'Ananth Cherukupally': 'ananth@eudia.com',
    'Asad Hussain': 'asad@eudia.com',
    'Conor Molloy': 'conor@eudia.com',
    'Emer Flynn': 'emer@eudia.com',
    'Greg MacHale': 'greg@eudia.com',
    'Julie Stefanich': 'julie@eudia.com',
    'Justin Hills': 'justin@eudia.com',
    'Mike Masiello': 'mike@eudia.com',
    'Nathan Shine': 'nathan@eudia.com',
    'Nicola Fratini': 'nicola@eudia.com',
    'Olivia Jung': 'olivia@eudia.com',
    'Tom Clancy': 'tom@eudia.com'
}

owners = df.groupby('Account Owner')
lines = []

for owner_name, group in owners:
    email = EMAIL_MAP.get(owner_name, owner_name.split()[0].lower() + '@eudia.com')
    accounts = group[['ID_Acct_18', 'Account Name']].values.tolist()
    
    lines.append(f"    // {owner_name.upper()} ({len(accounts)} accounts)")
    lines.append(f"    '{email}': {{")
    lines.append(f"      email: '{email}',")
    lines.append(f"      name: '{owner_name}',")
    lines.append(f"      accounts: [")
    for acc_id, acc_name in accounts:
        safe_name = str(acc_name).replace("'", "\\'")
        lines.append(f"        {{ id: '{acc_id}', name: '{safe_name}' }},")
    lines.append(f"      ]")
    lines.append(f"    }},")
    lines.append("")

with open('data/account_mapping_output.txt', 'w') as f:
    f.write('\n'.join(lines))

print(f"Done! {len(owners)} owners, {len(df)} accounts -> data/account_mapping_output.txt")
