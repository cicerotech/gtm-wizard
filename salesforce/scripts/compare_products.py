#!/usr/bin/env python3
"""Compare Product_Lines_Multi__c picklist values with Pricebook product names."""
import json
import subprocess

result = subprocess.run(
    ['sf', 'sobject', 'describe', '-s', 'Opportunity', '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)

print("="*60)
print("PRODUCT_LINES_MULTI__C PICKLIST VALUES:")
print("="*60)
picklist_values = []
for f in data.get('result', {}).get('fields', []):
    if f['name'] == 'Product_Lines_Multi__c':
        for pv in f.get('picklistValues', []):
            if pv.get('active'):
                print(f"  {pv['value']}")
                picklist_values.append(pv['value'])

print("\n" + "="*60)
print("PRICEBOOK PRODUCT NAMES:")
print("="*60)

result2 = subprocess.run(
    ['sf', 'data', 'query', '-q', 
     "SELECT Product2.Name FROM PricebookEntry WHERE Pricebook2.IsStandard = true AND IsActive = true",
     '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data2 = json.loads(result2.stdout)
pricebook_names = []
for rec in data2.get('result', {}).get('records', []):
    name = rec.get('Product2', {}).get('Name', '')
    if name and name not in pricebook_names:
        pricebook_names.append(name)
        print(f"  {name}")

print("\n" + "="*60)
print("MISMATCHES (in picklist but NOT in pricebook):")
print("="*60)
mismatches = []
for pv in picklist_values:
    if pv not in pricebook_names and pv != 'Undetermined':
        print(f"  ❌ {pv}")
        mismatches.append(pv)

if not mismatches:
    print("  ✅ All picklist values have matching products")
