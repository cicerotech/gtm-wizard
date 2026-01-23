# Sales Rep Onboarding Guide

## Overview

This tool syncs your Hyprnote meeting recordings to Salesforce automatically:
- Meeting notes become **Events** on the Account
- Key insights update the **Customer Brain** field
- Everything is attributed to you

---

## For New Reps: Step-by-Step Setup

### Step 1: Install Prerequisites

**A. Install Node.js** (if not already installed)
1. Go to https://nodejs.org/
2. Download and install the LTS version (18+)
3. Verify: Open Terminal and run `node --version`

**B. Install Hyprnote**
1. Go to https://hyprnote.com/
2. Download and install the macOS app
3. Launch Hyprnote and sign in
4. Connect your calendar (Outlook/Google) in Hyprnote settings

### Step 2: Get the Sync Tool

Your admin will provide you with the `hyprnote-sync` folder.

1. Copy the folder to your computer (e.g., Documents)
2. Open Terminal
3. Navigate to the folder:
   ```bash
   cd ~/Documents/hyprnote-sync
   ```
4. Install dependencies:
   ```bash
   npm install
   ```

### Step 3: Configure Your Profile

Run the setup wizard:
```bash
npm run setup
```

You'll need:
- Your name and email
- Your Salesforce User ID (ask your admin)

### Step 4: Record Meetings

1. Open Hyprnote before your meeting
2. Click "New Note" → "Record"
3. Hyprnote captures audio and generates notes
4. Stop recording when the meeting ends

### Step 5: Sync to Salesforce

After your meetings, run:
```bash
npm run sync
```

The tool will:
1. Find new recordings (not yet synced)
2. Match each meeting to a Salesforce Account
3. Create an Event with your notes
4. Update the Customer Brain field

---

## How Matching Works

The sync uses these methods to find the right Account (in order):

| Method | Confidence | How It Works |
|--------|------------|--------------|
| Calendar Email | 95% | Looks up attendee email → finds Contact → gets Account |
| Participant Email | 90% | Same, but from Hyprnote participant list |
| Company Name | 75% | Fuzzy matches participant company to Account name |
| Meeting Title | 60% | Extracts company from titles like "Acme Corp Demo" |

**Best practice:** Add external participants in Hyprnote with their email addresses for reliable matching.

---

## Speaker Identification Best Practices

Hyprnote uses AI to transcribe and identify who said what. To improve accuracy:

### Before the Meeting

1. **Connect your calendar** - Hyprnote pre-populates attendees from calendar invites
2. **Add participants manually** - If no calendar event, add attendee names/emails before recording
3. **Include company names** - Add participant's company (e.g., "John Smith - IQVIA")

### During the Meeting

1. **Say names clearly** - When referencing someone, use their full name
2. **Minimize crosstalk** - One person speaking at a time improves transcription
3. **Use headphones** - Reduces audio bleed between speakers

### Known Transcription Fixes

The sync automatically corrects common name confusions:
- **Justin/Julie** - Phonetically similar names are corrected based on who recorded
- More corrections can be added to `sync.js` as patterns are identified

### If Names Are Still Wrong

1. Edit the notes in Hyprnote before syncing
2. Or report the pattern to RevOps to add automatic correction

---

## Daily Workflow

```
Morning:
  ├── Open Hyprnote
  └── Connect calendar (auto-populated meetings)

Before each call:
  ├── Click "New Note" 
  └── Click "Record"

After each call:
  └── Stop recording (notes auto-generate)

End of day:
  ├── Open Terminal
  ├── cd ~/Documents/hyprnote-sync
  └── npm run sync
```

---

## Commands Reference

| Command | What It Does |
|---------|--------------|
| `npm run setup` | Configure your profile (run once) |
| `npm run sync` | Sync new meetings to Salesforce |
| `npm run status` | Check sync status, see pending meetings |
| `node test-connection.js` | Test Hyprnote + Salesforce connections |

---

## What Gets Created in Salesforce

### Event Record
- **Subject:** Meeting title from Hyprnote
- **Description:** Full meeting notes (cleaned and formatted)
- **Start/End Time:** Actual meeting time
- **Linked To:** Matched Account (and Contact if found)
- **Owner:** You (your SF User ID)

### Customer Brain Update
- Prepends to the Account's `Customer_Brain__c` field
- Includes: Date, rep name, duration, participants, notes summary
- Most recent meetings appear first

---

## Troubleshooting

### "No account match found"
The sync couldn't identify which Account this meeting belongs to.
- Add participant emails in Hyprnote before recording
- Or manually add the meeting in Salesforce

### "Salesforce connection failed"
- Check your internet connection
- Verify credentials in `data/config.json`
- Contact your admin if issues persist

### "Hyprnote database not found"
- Ensure Hyprnote is installed
- Record at least one meeting first
- Check the path in config matches your Hyprnote installation

### Meeting already synced
Each meeting is tracked to prevent duplicates. To re-sync:
1. Open `data/synced-sessions.json`
2. Remove the session entry
3. Run `npm run sync` again

---

## FAQ

**Q: Can I edit notes before syncing?**
A: Notes are pulled directly from Hyprnote. Edit them in Hyprnote first.

**Q: What if I record a personal call by mistake?**
A: If it doesn't match an Account, it won't sync. You can also delete sessions from Hyprnote.

**Q: How far back does it sync?**
A: Last 7 days by default. Older meetings are ignored.

**Q: Can I sync on my phone?**
A: Not currently. The sync runs on your Mac.

**Q: What if two people record the same meeting?**
A: Both will sync - Salesforce will have two Events. Coordinate with your team.

**Q: Why does the transcription mix up names (e.g., calling me by someone else's name)?**
A: AI transcription struggles with phonetically similar names (Julie/Justin, Mike/Mark). The sync has built-in corrections for known patterns. To minimize this:
- Add participants in Hyprnote before recording
- Connect your calendar so attendees are pre-populated
- Speak names clearly during the call

---

## Getting Help

- **Technical issues:** Contact your Sales Operations team
- **Salesforce questions:** Check with your Salesforce admin
- **Hyprnote issues:** Visit https://hyprnote.com/support

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│         HYPRNOTE SYNC CHEAT SHEET       │
├─────────────────────────────────────────┤
│                                         │
│  RECORD:  Hyprnote → New Note → Record  │
│                                         │
│  SYNC:    Terminal → npm run sync       │
│                                         │
│  STATUS:  Terminal → npm run status     │
│                                         │
│  BEST PRACTICE:                         │
│  Add attendee emails in Hyprnote for    │
│  accurate Account matching              │
│                                         │
└─────────────────────────────────────────┘
```

