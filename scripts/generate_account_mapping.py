#!/usr/bin/env python3
"""
Generate AccountOwnership.ts content from the Business Lead 2026 Accounts Excel file.
"""
import pandas as pd

# Read the main sheet
xlsx = pd.ExcelFile('data/Business Lead 2026 Accounts_Olivia tab.xlsx')
df = pd.read_excel(xlsx, sheet_name='Account Folders with Subnotes')

# Email mapping 
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

# Group by Account Owner
owners = df.groupby('Account Owner')

print("// ═══════════════════════════════════════════════════════════════════════════")
print("// ACCOUNT OWNERSHIP MAPPING - Auto-generated from Business Lead 2026 Accounts")
print("// ═══════════════════════════════════════════════════════════════════════════")
print()

for owner_name, group in owners:
    email = EMAIL_MAP.get(owner_name, owner_name.split()[0].lower() + '@eudia.com')
    accounts = group[['ID_Acct_18', 'Account Name']].values.tolist()
    
    # Escape single quotes in names
    safe_accounts = []
    for acc_id, acc_name in accounts:
        safe_name = str(acc_name).replace("'", "\\'")
        safe_accounts.append((acc_id, safe_name))
    
    print(f"    // ─────────────────────────────────────────────────────────────────────────")
    print(f"    // {owner_name.upper()} ({len(safe_accounts)} accounts)")
    print(f"    // ─────────────────────────────────────────────────────────────────────────")
    print(f"    '{email}': {{")
    print(f"      email: '{email}',")
    print(f"      name: '{owner_name}',")
    print(f"      accounts: [")
    for acc_id, acc_name in safe_accounts:
        print(f"        {{ id: '{acc_id}', name: '{acc_name}' }},")
    print(f"      ]")
    print(f"    }},")
    print()

print(f"// Total: {len(owners)} business leads, {len(df)} accounts")
