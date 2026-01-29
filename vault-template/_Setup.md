# Welcome to Your Eudia Sales Vault

This vault is pre-configured for capturing sales meeting intelligence. Everything works out of the box - no external plugins or API keys required.

---

## First Launch Setup

When you first open this vault, a **Setup Wizard** will appear:

1. **Enter your Eudia email** (e.g., yourname@eudia.com)
2. **Click "Complete Setup"**

That's it! The wizard automatically:
- ✅ Syncs your Salesforce account folders
- ✅ Connects your Outlook calendar  
- ✅ Activates recording & transcription

If you missed the wizard, run it anytime: `Cmd/Ctrl + P` → "Run Setup Wizard"

---

## Quick Start

### Recording a Meeting

1. Navigate to the account folder (e.g., `Accounts/Amazon/`)
2. Create a new note: Right-click → New note → Name it `YYYY-MM-DD Meeting Type`
3. Click the **mic icon** in the left sidebar (or `Cmd/Ctrl + P` → "Start Recording")
4. A recording bar appears at the bottom showing duration and audio levels
5. When done, click **Stop** - your structured summary appears automatically

### What Gets Generated

After each recording, you get structured sections:
- **Summary** - 3-5 bullet points of key takeaways
- **Key Stakeholders** - People mentioned with roles
- **MEDDICC Signals** - Qualification intelligence
- **Product Interest** - Tagged product lines discussed
- **Key Dates** - Timelines and deadlines mentioned
- **Next Steps** - Agreed actions as checkboxes
- **Action Items** - Internal follow-ups
- **Deal Signals** - Stage progression indicators
- **Risks & Objections** - Concerns to address

### Automatic Salesforce Sync

When you finish recording:
- **Customer Brain** on the Account is updated with the summary
- **Event** record is created with meeting details
- **Tasks** are generated from your action items

---

## Plugin Features

The **Eudia Transcription Plugin** handles everything:

| Feature | How |
|---------|-----|
| **Record** | Click 🎙️ mic icon → recording bar appears |
| **Transcribe** | Stop recording → AI processes automatically |
| **Summarize** | Structured notes appear in your file |
| **Sync** | Pushes to Salesforce Customer Brain |
| **Pre-Call Context** | `Cmd/Ctrl + P` → "Fetch Pre-Call Context" |

---

## Calendar Integration

Your Outlook calendar appears in the Full Calendar plugin:
- **View**: Click the calendar icon in the left sidebar
- **Weekly view**: See upcoming meetings at a glance
- **Click any event** to see details and prepare

The calendar is synced from your Outlook via GTM-Brain - updates every 5 minutes.

---

## Team Sharing

Notes sync to Salesforce, making them visible to your entire team:
- **Customer Brain field** on Account records
- **Event records** for each meeting
- **Tasks** auto-created from action items

Everyone with Salesforce access can see your meeting notes - no separate sharing needed.

---

## Folder Structure

```
Accounts/           ← One folder per Salesforce account
├── Amazon/
│   └── 2026-01-28 Discovery Call.md
├── Microsoft/
└── ...

Recordings/         ← Audio files (if saving enabled)
Templates/          ← Note templates
```

---

## Commands

Open Command Palette (`Cmd/Ctrl + P`) and search:

| Command | Description |
|---------|-------------|
| Run Setup Wizard | Configure email and calendar (first launch) |
| Start Recording | Begin audio capture |
| Stop Recording & Transcribe | End recording and process |
| Toggle Recording | Start or stop |
| Pause/Resume Recording | Pause active recording |
| Sync Salesforce Accounts | Refresh account folders |
| Sync Current Note to Salesforce | Push note to SF |
| Fetch Pre-Call Context | Get meeting prep data |

---

## Need Help?

- **Meeting Prep:** Visit the Meeting Prep tab at `https://gtm-brain.onrender.com/gtm`
- **Sales Process:** Review stages and MEDDICC at the Sales Process tab
- **Commands:** Slack commands at the Commands tab
- **Issues:** Contact RevOps or message in #gtm-brain
