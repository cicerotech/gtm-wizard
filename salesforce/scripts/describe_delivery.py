#!/usr/bin/env python3
import json
import subprocess

# Get Delivery__c fields
result = subprocess.run(
    ['sf', 'sobject', 'describe', '-s', 'Delivery__c', '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)

print("="*60)
print("DELIVERY__C FIELDS:")
print("="*60)
for f in data.get('result', {}).get('fields', []):
    name = f['name']
    ftype = f['type']
    if f.get('custom') or name == 'Name':
        print(f"  {name}: {ftype}")

# Get Product2 fields
print("\n" + "="*60)
print("PRODUCT2 FIELDS (custom):")
print("="*60)
result2 = subprocess.run(
    ['sf', 'sobject', 'describe', '-s', 'Product2', '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data2 = json.loads(result2.stdout)
for f in data2.get('result', {}).get('fields', []):
    if f.get('custom') or f['name'] in ['Name', 'ProductCode']:
        print(f"  {f['name']}: {f['type']}")
