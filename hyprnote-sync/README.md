# Hyprnote to Salesforce Sync

Automatically sync your Hyprnote meeting notes to Salesforce.

## What It Does

After you record a meeting in Hyprnote:
- Creates an **Event** in Salesforce with your meeting notes
- Links the Event to the correct **Account** and **Contact**
- Updates the **Customer Brain** field with meeting insights
- Attributes the meeting to **you** (your Salesforce user)

---

## Quick Start

### Prerequisites
- Node.js 18+ installed ([download](https://nodejs.org/))
- Hyprnote installed with at least one recorded meeting
- Your Salesforce User ID (ask your admin if needed)

### Installation

```bash
# 1. Navigate to this folder
cd hyprnote-sync

# 2. Install dependencies
npm install

# 3. Run setup wizard
npm run setup
```

### Daily Usage

After your meetings:

```bash
npm run sync
```

That's it! Check Salesforce for your synced notes.

---

## Commands

| Command | What it does |
|---------|--------------|
| `npm run setup` | Configure your profile (run once) |
| `npm run sync` | Sync new meetings to Salesforce |
| `npm run status` | View sync status and pending meetings |

---

## How Account Matching Works

The sync automatically finds the right Salesforce Account:

1. **Email Match** (most reliable): If a meeting participant's email exists in Salesforce, we link to their Account
2. **Company Name**: If the participant's company matches an Account name
3. **Meeting Title**: Extracts company name from titles like "Acme Corp Demo"

If no match is found, the meeting is skipped (you'll see a warning).

---

## FAQ

**Q: Where do I find my Salesforce User ID?**  
A: In Salesforce, go to Setup → Users → click your user → look at the URL. It's the ID starting with `005`.

**Q: Can I re-sync a meeting?**  
A: Synced meetings are tracked to prevent duplicates. Delete the entry from `data/synced-sessions.json` to re-sync.

**Q: What if a meeting doesn't match an Account?**  
A: It's skipped. You can manually add the meeting in Salesforce, or ensure the participant has a Contact record with their email.

**Q: How far back does it sync?**  
A: Last 7 days by default. Change `lookbackHours` in `data/config.json`.

---

## Troubleshooting

### "Hyprnote database not found"
Hyprnote isn't installed, or no meetings have been recorded yet.

### "Salesforce connection failed"  
Check your credentials. If using `.env` file, ensure these are set:
```
SF_USERNAME=your-username
SF_PASSWORD=your-password
SF_SECURITY_TOKEN=your-token
SF_INSTANCE_URL=https://yourorg.my.salesforce.com
```

### "Account: NOT FOUND (skipping)"
The sync couldn't match the meeting to a Salesforce Account. Ensure:
1. The participant's email exists as a Contact in Salesforce
2. Or the participant's company name matches an Account name

---

## Support

Contact your Sales Operations team for help.

