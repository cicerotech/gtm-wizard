#!/usr/bin/env python3
import json
import subprocess

result = subprocess.run(
    ['sf', 'sobject', 'describe', '-s', 'Product2', '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)

print("Product2 Custom Fields:")
for f in data.get('result', {}).get('fields', []):
    if f.get('custom'):
        print(f"  {f['name']}: {f['type']}")
