#!/usr/bin/env python3
import pandas as pd

# Read contacts
contacts = pd.read_csv('/Users/keiganpesenti/Desktop/contacts january 2026.csv', encoding='latin-1')
contacts['FirstName_lower'] = contacts['First Name'].str.lower().str.strip()
contacts['LastName_lower'] = contacts['Last Name'].str.lower().str.strip()
contacts['Account_lower'] = contacts['Account Name'].str.lower().str.strip()

# CAB Attendees extracted from the document
cab_attendees = [
    {"Account": "Asana", "FirstName": "Eleanor", "LastName": "Lacey", "Title": "General Counsel", "Attendance": "Remote"},
    {"Account": "Bayer", "FirstName": "Jeremey", "LastName": "Jessen", "Title": "Global General Counsel", "Attendance": "In Person"},
    {"Account": "Best Buy", "FirstName": "Todd", "LastName": "Hartman", "Title": "CLO", "Attendance": "In Person"},
    {"Account": "BNY", "FirstName": "Watt", "LastName": "Wanapha", "Title": "DGC", "Attendance": "In Person"},
    {"Account": "Cargill", "FirstName": "Rishi", "LastName": "Varma", "Title": "EVP, Chief Legal Officer", "Attendance": "In Person"},
    {"Account": "CHS Inc.", "FirstName": "Brandon", "LastName": "Smith", "Title": "EVP and General Counsel", "Attendance": "In Person"},
    {"Account": "DHL", "FirstName": "Mark", "LastName": "Smolik", "Title": "Chief Legal Officer", "Attendance": "Remote"},
    {"Account": "Dolby", "FirstName": "Andy", "LastName": "Sherman", "Title": "EVP, General Counsel", "Attendance": "In Person"},
    {"Account": "Delinea", "FirstName": "Suzanne", "LastName": "Tom", "Title": "SVP, GC", "Attendance": "In Person"},
    {"Account": "Duracell", "FirstName": "Gary", "LastName": "Hood", "Title": "Chief Legal Officer", "Attendance": "In Person"},
    {"Account": "Ecolab", "FirstName": "Jandeen", "LastName": "Boone", "Title": "EVP and General Counsel", "Attendance": "Remote"},
    {"Account": "Fresh Del Monte", "FirstName": "Effie", "LastName": "Silva", "Title": "SVP, General Counsel", "Attendance": "In Person"},
    {"Account": "GE Vernova", "FirstName": "Rich", "LastName": "Foehr", "Title": "General Counsel", "Attendance": "In Person"},
    {"Account": "Graybar", "FirstName": "Matt", "LastName": "Geekie", "Title": "SVP, General Counsel", "Attendance": "In Person"},
    {"Account": "Intuit", "FirstName": "Kerry", "LastName": "Mclean", "Title": "GC", "Attendance": "Virtual"},
    {"Account": "Intuit", "FirstName": "Stephanie", "LastName": "Cherny", "Title": "DGC", "Attendance": "In Person"},
    {"Account": "IQVIA", "FirstName": "Eric", "LastName": "Sherbet", "Title": "EVP & General Counsel", "Attendance": "Remote"},
    {"Account": "National Grid", "FirstName": "Justine", "LastName": "Campbell", "Title": "Chief Legal Officer", "Attendance": "In Person"},
    {"Account": "Novelis", "FirstName": "Chris", "LastName": "Courts", "Title": "EVP & CLO", "Attendance": "In Person"},
    {"Account": "PetSmart", "FirstName": "Lacey", "LastName": "Bundy", "Title": "CLO", "Attendance": "In Person"},
    {"Account": "Pure Storage", "FirstName": "Niki", "LastName": "Armstrong", "Title": "CLO", "Attendance": "In Person"},
    {"Account": "ServiceNow", "FirstName": "Russ", "LastName": "Elmer", "Title": "Special Counsel", "Attendance": "In Person"},
    {"Account": "Silver Lake", "FirstName": "Karen", "LastName": "King", "Title": "Managing Director", "Attendance": "In Person"},
    {"Account": "AES Corporation", "FirstName": "Raquel", "LastName": "Rodriguez", "Title": "Associate General Counsel", "Attendance": "Remote"},
    {"Account": "The Home Depot", "FirstName": "Jocelyn", "LastName": "Hunter", "Title": "VP, Deputy General Counsel", "Attendance": "In Person"},
    {"Account": "The Weir Group", "FirstName": "Akshar", "LastName": "Patel", "Title": "General Counsel", "Attendance": "In Person"},
    {"Account": "Toshiba", "FirstName": "Tim", "LastName": "Fraser", "Title": "VP, Chief Legal Officer", "Attendance": "In Person"},
    {"Account": "Udemy", "FirstName": "Ken", "LastName": "Hirschman", "Title": "General Counsel", "Attendance": "In Person"},
    {"Account": "Vista Equity Partners", "FirstName": "Alan", "LastName": "Schwartz", "Title": "CLO", "Attendance": "In Person"},
    {"Account": "Wealth Partners Capital Group", "FirstName": "Paul", "LastName": "Lawler", "Title": "General Counsel", "Attendance": "In Person"},
    {"Account": "Worldwide Technology", "FirstName": "Erika", "LastName": "Schenk", "Title": "General Counsel & EVP", "Attendance": "In Person"},
]

# Match each attendee
results = []
not_found = []

for att in cab_attendees:
    first = att['FirstName'].lower().strip()
    last = att['LastName'].lower().strip()
    account = att['Account'].lower().strip()
    
    # Try exact match on first + last name
    match = contacts[
        (contacts['FirstName_lower'] == first) & 
        (contacts['LastName_lower'] == last)
    ]
    
    if len(match) == 0:
        # Try partial match on last name only
        match = contacts[contacts['LastName_lower'] == last]
    
    if len(match) == 1:
        row = match.iloc[0]
        results.append({
            'ContactId': row['Contact ID'],
            'CampaignId': '',  # To be filled in after campaign creation
            'Status': 'Responded' if att['Attendance'] in ['In Person', 'Virtual'] else 'Sent',
            'FirstName': row['First Name'],
            'LastName': row['Last Name'],
            'Account': row['Account Name'],
            'CAB_Account': att['Account'],
            'Attendance': att['Attendance']
        })
    elif len(match) > 1:
        # Multiple matches - try to narrow by account
        account_match = match[match['Account_lower'].str.contains(account, na=False)]
        if len(account_match) >= 1:
            row = account_match.iloc[0]
            results.append({
                'ContactId': row['Contact ID'],
                'CampaignId': '',
                'Status': 'Responded' if att['Attendance'] in ['In Person', 'Virtual'] else 'Sent',
                'FirstName': row['First Name'],
                'LastName': row['Last Name'],
                'Account': row['Account Name'],
                'CAB_Account': att['Account'],
                'Attendance': att['Attendance']
            })
        else:
            not_found.append(att)
    else:
        not_found.append(att)

print(f"=== MATCHED: {len(results)} contacts ===")
for r in results:
    print(f"  {r['FirstName']} {r['LastName']} ({r['Account']}) -> {r['ContactId']}")

print(f"\n=== NOT FOUND: {len(not_found)} contacts ===")
for nf in not_found:
    print(f"  {nf['FirstName']} {nf['LastName']} ({nf['Account']})")

# Save results - just the fields needed for Data Loader
output_df = pd.DataFrame(results)[['ContactId', 'CampaignId', 'Status']]
output_df.to_csv('/Users/keiganpesenti/Desktop/CAB_Campaign_Members.csv', index=False)

# Save full details for review
full_df = pd.DataFrame(results)
full_df.to_csv('/Users/keiganpesenti/Desktop/CAB_Campaign_Members_FULL.csv', index=False)

print(f"\n✅ Data Loader CSV saved to: ~/Desktop/CAB_Campaign_Members.csv")
print(f"✅ Full details CSV saved to: ~/Desktop/CAB_Campaign_Members_FULL.csv")
print(f"\nNEXT STEPS:")
print(f"1. Create Campaign in Salesforce (e.g., 'CAB Meeting - January 2026')")
print(f"2. Copy the Campaign ID (starts with 701)")
print(f"3. Paste Campaign ID into the 'CampaignId' column in the CSV")
print(f"4. Use Data Loader to Insert 'CampaignMember' records")

