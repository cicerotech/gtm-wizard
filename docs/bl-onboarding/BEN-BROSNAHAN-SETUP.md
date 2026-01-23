# Obsidian Setup Guide for Ben Brosnahan

**Your Details:**
- Email: ben.brosnahan@eudia.com
- Salesforce User ID: 005Wj00000aq1jFIAQ

---

## Step 1: Download Obsidian (2 minutes)

1. Go to [obsidian.md/download](https://obsidian.md/download)
2. Download the Mac version
3. Open the installer and drag Obsidian to Applications
4. Launch Obsidian

**Done?** You should see Obsidian's welcome screen.

---

## Step 2: Connect to Shared Vault (2 minutes)

1. Click **"Open another vault"** (or go to Settings if already open)
2. Click **"Sign in"** to create/login to your Obsidian account
   - Use your Eudia email: ben.brosnahan@eudia.com
   - Create a password (this is separate from your Eudia password)
3. Go to **Settings** (gear icon, bottom left)
4. Click **"Sync"** in the left sidebar
5. Click **"Enter sync key"**
6. Paste the key Keigan sent you via Slack/1Password
7. Wait 1-2 minutes for the vault to download

**Done?** You should see folders appear: `Meetings/`, `Templates/`, `Recordings/`

---

## Step 3: Grant Microphone Access (1 minute)

The first time you use Wispr Flow, macOS will ask for microphone permission.

1. When prompted, click **"Allow"**
2. If you missed the prompt: 
   - Go to System Settings > Privacy & Security > Microphone
   - Enable Obsidian

**Done?** Microphone icon should appear in Obsidian.

---

## Step 4: Test Wispr Flow (1 minute)

1. Press **Cmd + Shift + R** to start recording
2. Say a few words
3. Press **Cmd + Shift + R** again to stop
4. You should see your transcription appear

**Done?** You heard yourself transcribed!

---

## Step 5: Create Your First Meeting Note

### Before a Meeting:

1. Navigate to `Meetings/` folder in the left sidebar
2. Find or create a subfolder for the account (e.g., `Mass Mutual/`)
3. Right-click the folder > **New note**
4. Name it: `2026-01-24 - Discovery Call.md` (use today's date)
5. Copy the template content from `Templates/Meeting Note.md`
6. Fill in the frontmatter at the top:

```yaml
---
account: "Mass Mutual"    # MUST match Salesforce account name exactly
date: 2026-01-24
attendees: ["John Smith", "Jane Doe"]
type: meeting
sync: true
synced_to_sf: false
---
```

### During the Meeting:

1. Press **Cmd + Shift + R** to start Wispr transcription
2. Have your meeting
3. Press **Cmd + Shift + R** to stop when done
4. Paste transcription in the "Transcription" section

### After the Meeting:

1. Fill in:
   - Key Discussion Points
   - Action Items
   - Next Steps
   - Buying Signals / Objections
2. Save (Cmd + S) - it syncs automatically!

---

## How Syncing Works

```
Your Mac          Cloud           GTM Brain
   │                │                 │
   ├──► Note saved ─┼──► Auto-sync ──►│
   │    (Cmd+S)     │    (1-2 min)    │
   │                │                 ▼
   │                │           Appears in
   │                │           Meeting Prep
```

- **Automatic:** Notes sync every 1-2 minutes
- **No action needed:** Just save your notes normally
- **Visible in:** GTM Brain Meeting Prep tab within ~10 minutes

---

## Folder Structure

```
Eudia Vault/
├── Meetings/
│   ├── _Inbox/              ← Raw transcriptions land here
│   ├── Mass Mutual/
│   │   └── 2026-01-24 - Discovery Call.md
│   └── AT&T/
│       └── 2026-01-23 - Demo.md
├── Templates/
│   └── Meeting Note.md      ← Copy this for each meeting
└── Recordings/              ← Audio files (optional)
```

---

## Quick Reference

| Action | Shortcut |
|--------|----------|
| Start/Stop Recording | Cmd + Shift + R |
| Save Note | Cmd + S |
| New Note | Cmd + N |
| Open Settings | Cmd + , |

---

## Need Help?

Message **@keigan** in Slack with:
- What you were trying to do
- What happened instead
- Screenshot if possible

---

*Setup guide for Ben Brosnahan | January 2026*

