#!/usr/bin/env python3
"""Check for dependencies on IsClosed/IsWon fields."""
import json
import sys
import subprocess

# Get Opportunity field metadata
result = subprocess.run(
    ['sf', 'sobject', 'describe', '-s', 'Opportunity', '-o', 'eudia-prod', '--json'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)

print("="*60)
print("FORMULA FIELDS REFERENCING IsClosed or IsWon:")
print("="*60)
found = False
for f in data.get('result', {}).get('fields', []):
    if f.get('calculated') and f.get('calculatedFormula'):
        formula = f.get('calculatedFormula', '')
        if 'IsClosed' in formula or 'IsWon' in formula:
            print(f"\n  Field: {f['name']}")
            print(f"  Formula: {formula[:200]}...")
            found = True

if not found:
    print("  None found.")

print("\n" + "="*60)
print("CHECKING VALIDATION RULES...")
print("="*60)

# Get validation rules
result2 = subprocess.run(
    ['sf', 'project', 'retrieve', 'start', '-m', 'ValidationRule:Opportunity.*', '-o', 'eudia-prod'],
    capture_output=True, text=True
)
print(result2.stdout if result2.stdout else "  Check validation rules manually in Setup.")
