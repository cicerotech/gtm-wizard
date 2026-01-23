# Hyprnote Sync - Team Setup Guide

## For: Eudia Sales Team

### Pre-Configured Users
The following team members are pre-registered - setup will auto-detect you:

| Name | Role | Team |
|------|------|------|
| Julie Stefanich | Business Lead | Sales |
| Justin Hills | Business Lead | Sales |
| Asad Hussain | Business Lead | Sales |
| Himanshu Agarwal | Business Lead | Sales |
| Ananth Cherukupally | Business Lead | Sales |
| Olivia Jung | Business Lead | Sales |
| Jon Cobb | Business Lead | Sales |
| Zack Huffstutter | Product | Product |
| Omar Haroun | CEO | Executive |
| David Van Reyk | COO | Executive |

---

## Quick Start (5 minutes)

### Step 1: Prerequisites
- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/) if not installed
- **Hyprnote**: Download from [hyprnote.com](https://hyprnote.com/)

### Step 2: Get the Folder
Your admin will share the `hyprnote-sync` folder with you.
1. Download/copy it to your `Documents` folder
2. Open Terminal (Cmd+Space, type "Terminal")

### Step 3: Install & Setup
```bash
cd ~/Documents/hyprnote-sync
npm install
npm run setup
```

The setup will auto-detect your profile based on your Hyprnote email.
Just confirm with 'Y' and you're done!

---

## Daily Usage

### Recording Meetings
1. Open Hyprnote before your call
2. Click **New Note** → **Record**
3. Hyprnote captures audio and generates AI notes
4. Click **Stop** when done

### Syncing to Salesforce
After your calls (end of day recommended):
```bash
cd ~/Documents/hyprnote-sync
npm run sync
```

**What happens:**
- Creates Events on matched Accounts
- Updates Customer Brain with meeting insights
- Attributes everything to you

---

## How Account Matching Works

The sync uses smart matching to find the right Account:

| Priority | Method | Confidence |
|----------|--------|------------|
| 1st | Your owned accounts | 98% |
| 2nd | Calendar attendee email | 95% |
| 3rd | Participant email | 90% |
| 4th | Company name | 75% |
| 5th | Meeting title | 60% |

**Pro tip:** Accounts you own in Salesforce are matched first with highest confidence!

---

## Troubleshooting

### "No account match found"
- Add participant emails in Hyprnote before recording
- The meeting will still sync when you meet with that company next time

### "npm: command not found"
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Close and reopen Terminal

### "Hyprnote database not found"
- Make sure Hyprnote is installed
- Record at least one test meeting first

### Need to re-run setup?
```bash
npm run setup
```

---

## Commands Reference

| Command | What It Does |
|---------|--------------|
| `npm run setup` | Configure your profile (auto-detects you) |
| `npm run sync` | Sync new meetings to Salesforce |
| `npm run status` | Check sync status |
| `npm test` | Run connection tests |

---

## Questions?

Contact **Keigan Pesenti** (RevOps) for help.

