#!/usr/bin/env python3
import json
import subprocess
import sys

# Fetch the data
result = subprocess.run(
    ['curl', '-s', 'https://gtm-wizard.onrender.com/api/contacts/gap-analysis?days=90&minMeetings=1'],
    capture_output=True, text=True
)

try:
    data = json.loads(result.stdout)
except:
    print("Error parsing response:")
    print(result.stdout[:500])
    sys.exit(1)

print('=== SUMMARY ===')
s = data['summary']
print(f"Total External Attendees: {s['totalExternalAttendees']}")
print(f"BL-Owned Accounts: {s['blOwnedAccounts']}")
print(f"Matched to Accounts: {s['matchedToAccounts']}")
print(f"Already in Salesforce: {s['alreadyInSalesforce']}")
print(f"MISSING CONTACTS: {s['missingContacts']}")
print()

print('=== TOP 30 MISSING CONTACTS (CLEANED NAMES) ===')
print(f"{'#':>2} | {'Name':28} | {'Title':32} | {'Account':16} | {'Owner':14} | Mtgs")
print('-' * 110)
for i, c in enumerate(data['missingContacts'][:30], 1):
    first = c.get('firstName', '')
    last = c.get('lastName', '')
    name = f"{first} {last}".strip()[:28]
    title = (c.get('title') or '-')[:32]
    acct = c['account']['name'][:16]
    owner = c['account']['owner'][:14]
    meetings = c['meetingCount']
    print(f"{i:2} | {name:28} | {title:32} | {acct:16} | {owner:14} | {meetings}")

print()
print('=== BY ACCOUNT OWNER ===')
by_owner = {}
for c in data['missingContacts']:
    owner = c['account']['owner']
    by_owner[owner] = by_owner.get(owner, 0) + 1

for owner, count in sorted(by_owner.items(), key=lambda x: -x[1]):
    print(f"  {owner}: {count} missing contacts")

