import pandas as pd
import re
from difflib import SequenceMatcher

xlsx = pd.ExcelFile('/Users/keiganpesenti/Desktop/create acct audit.xlsx')

# Read both sheets
df_new = pd.read_excel(xlsx, sheet_name=0)
df_sf = pd.read_excel(xlsx, sheet_name=1)

print('='*100)
print('COMPLETE AUDIT OF NEW ACCOUNTS TO CREATE')
print('='*100)

print(f'\nTotal new accounts to create: {len(df_new)}')
print(f'Total existing SF accounts: {len(df_sf)}')

# Get column name for SF accounts
sf_col = df_sf.columns[0]
print(f'\nSF Account column name: {sf_col}')

# List all 91 new accounts
print('\n' + '='*100)
print('ALL NEW ACCOUNTS TO CREATE:')
print('='*100)
for idx, row in df_new.iterrows():
    print(f'{idx+1:3}. {row["Account Name"]:<55} | {row["New Business Lead "]}')

# Normalize function for matching
def normalize(name):
    if pd.isna(name):
        return ''
    name = str(name).lower().strip()
    # Remove common suffixes
    suffixes = [
        r'\s+inc\.?$', r'\s+llc\.?$', r'\s+ltd\.?$', r'\s+limited$',
        r'\s+corp\.?$', r'\s+corporation$', r'\s+plc\.?$', r'\s+gmbh$',
        r'\s+ag$', r'\s+s\.?a\.?$', r'\s+group$', r'\s+holdings?$',
        r'\s+&\s+co\.?$', r'\s+company$', r'\,?\s+inc\.?$'
    ]
    for suffix in suffixes:
        name = re.sub(suffix, '', name, flags=re.IGNORECASE)
    # Remove special characters
    name = re.sub(r'[^\w\s]', '', name)
    # Collapse whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name

# Create normalized versions
df_new['normalized'] = df_new['Account Name'].apply(normalize)
df_sf['normalized'] = df_sf[sf_col].apply(normalize)
sf_normalized_set = set(df_sf['normalized'].tolist())
sf_names = df_sf[sf_col].tolist()

# Similarity check
def find_similar(name, threshold=0.75):
    norm_name = normalize(name)
    matches = []
    for sf_name in sf_names:
        sf_norm = normalize(sf_name)
        ratio = SequenceMatcher(None, norm_name, sf_norm).ratio()
        if ratio >= threshold and ratio < 1.0:  # Similar but not exact
            matches.append((sf_name, ratio))
    return sorted(matches, key=lambda x: -x[1])[:3]

print('\n' + '='*100)
print('NAMING CONVENTION ISSUES & POTENTIAL DUPLICATES')
print('='*100)

issues = []
for idx, row in df_new.iterrows():
    name = row['Account Name']
    lead = row['New Business Lead ']
    
    # Check for potential matches
    similar = find_similar(name, 0.70)
    
    # Check for naming issues
    naming_issues = []
    
    # Parentheses with aliases
    if '(' in name and ')' in name:
        naming_issues.append('Contains parenthetical alias')
    
    # Lowercase company name
    if name == name.lower():
        naming_issues.append('All lowercase')
    
    # Contains abbreviations mixed with full names
    if re.search(r'\b[A-Z]{2,}\b', name) and len(name.split()) > 1:
        abbrevs = re.findall(r'\b[A-Z]{2,}\b', name)
        if abbrevs:
            naming_issues.append(f'Contains abbreviation(s): {", ".join(abbrevs)}')
    
    # Trailing/leading whitespace
    if name != name.strip():
        naming_issues.append('Has extra whitespace')
    
    # "The" prefix
    if name.lower().startswith('the '):
        naming_issues.append('Starts with "The"')
    
    # Special characters
    if re.search(r'[&\-\']', name):
        naming_issues.append('Contains special chars (&, -, \')')
    
    if similar or naming_issues:
        issues.append({
            'name': name,
            'lead': lead,
            'similar': similar,
            'naming_issues': naming_issues
        })
        
        print(f'\n{idx+1}. {name}')
        print(f'   Lead: {lead}')
        if naming_issues:
            print(f'   ⚠️  Naming: {"; ".join(naming_issues)}')
        if similar:
            print(f'   🔍 Potential SF matches:')
            for match, score in similar:
                print(f'      - {match} ({score:.0%} similar)')

# Check for duplicates within the new accounts list itself
print('\n' + '='*100)
print('DUPLICATES WITHIN NEW ACCOUNTS LIST')
print('='*100)

new_normalized = df_new['normalized'].tolist()
new_names = df_new['Account Name'].tolist()
internal_dupes = []

for i, (name1, norm1) in enumerate(zip(new_names, new_normalized)):
    for j, (name2, norm2) in enumerate(zip(new_names, new_normalized)):
        if i < j:
            ratio = SequenceMatcher(None, norm1, norm2).ratio()
            if ratio >= 0.80:
                internal_dupes.append((name1, name2, ratio))
                print(f'⚠️  {name1} <-> {name2} ({ratio:.0%} similar)')

if not internal_dupes:
    print('No internal duplicates found.')

# Business lead summary
print('\n' + '='*100)
print('BUSINESS LEAD ASSIGNMENT SUMMARY')
print('='*100)

lead_counts = df_new['New Business Lead '].value_counts()
for lead, count in lead_counts.items():
    print(f'{lead}: {count} accounts')

# Check for lead name inconsistencies
print('\n⚠️  Lead Name Variations:')
leads = df_new['New Business Lead '].unique()
for i, lead1 in enumerate(leads):
    for lead2 in leads[i+1:]:
        ratio = SequenceMatcher(None, lead1.lower(), lead2.lower()).ratio()
        if ratio >= 0.80:
            print(f'   {lead1} vs {lead2} ({ratio:.0%} similar)')



