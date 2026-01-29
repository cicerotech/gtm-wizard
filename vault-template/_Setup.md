# Welcome to Your Eudia Sales Vault

This vault is pre-configured for capturing sales meeting intelligence. Everything works out of the box.

---

## First Launch Setup

When you first open this vault, a **Setup Wizard** will appear:

1. **Enter your Eudia email** (e.g., yourname@eudia.com)
2. **Click "Complete Setup"**

That's it. The wizard automatically:
- Syncs your Salesforce account folders
- Connects your Outlook calendar  
- Activates recording and transcription

If you missed the wizard, run it anytime: `Cmd/Ctrl + P` → "Run Setup Wizard"

---

## Quick Start

### Recording a Meeting

1. Navigate to the account folder (e.g., `Accounts/Amazon/`)
2. Create a new note: Right-click → New note → Name it `YYYY-MM-DD Meeting Type`
3. Click the **microphone icon** in the left sidebar (or `Cmd/Ctrl + P` → "Start Recording")
4. A recording bar appears at the bottom showing duration and audio levels
5. When done, click **Stop** - your note updates with a placeholder while processing
6. Continue working - the structured summary appears automatically when ready

### What Gets Generated

After each recording, you get structured sections:

- **Summary** - 5-7 bullet points of key takeaways with quotes
- **Attendees** - People on the call with roles
- **Product Interest** - Tagged product lines from Eudia's portfolio
- **Pain Points** - Challenges mentioned with direct quotes
- **Buying Triggers** - What prompted this conversation
- **MEDDICC Signals** - Detailed qualification intelligence
- **Key Dates** - Timelines and deadlines mentioned
- **Next Steps** - Agreed actions as checkboxes with owners
- **Action Items (Internal)** - Follow-ups for Eudia team
- **Deal Signals** - Stage progression indicators
- **Risks & Objections** - Concerns to address
- **Competitive Intelligence** - Competitor mentions

### Smart Tags (Auto-extracted)

Your note's frontmatter is automatically updated with:

- **product_interest** - Product lines mentioned (ai-contracting-tech, sigma, etc.)
- **meddicc_signals** - Champion identified, pain confirmed, metrics discussed, etc.
- **deal_health** - progressing, at-risk, stalled, early-stage
- **meeting_type** - discovery, demo, negotiation, qbr, etc.
- **key_stakeholders** - Names and roles of key people

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
| **Record** | Click microphone icon → recording bar appears |
| **Transcribe** | Stop recording → AI processes in background |
| **Summarize** | Structured notes appear in your file |
| **Smart Tags** | Auto-extracts product lines, MEDDICC signals, deal health |
| **Sync** | Pushes to Salesforce Customer Brain |
| **Pre-Call Context** | `Cmd/Ctrl + P` → "Fetch Pre-Call Context" |

---

## Calendar Integration (Native)

Your Outlook calendar is built directly into the plugin:

- **View**: Click the **calendar icon** in the left sidebar
- **Weekly view**: See upcoming meetings grouped by day
- **Customer vs. Internal**: Customer meetings are highlighted
- **One-click notes**: Click any meeting to create a pre-filled note

The calendar auto-detects your current meeting when you start recording, filling in the title and attendees automatically.

Calendar data syncs from Outlook via GTM-Brain and updates every 5 minutes.

---

## Team Visibility

Notes sync to Salesforce, making them visible to your entire team:
- **Customer Brain field** on Account records
- **Event records** for each meeting
- **Tasks** auto-created from action items

Everyone with Salesforce access can see your meeting notes.

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
| Run Setup Wizard | Configure email and calendar |
| Open Calendar View | Show native calendar sidebar |
| Start Recording | Begin audio capture |
| Stop Recording & Transcribe | End recording and process |
| Toggle Recording | Start or stop |
| Pause/Resume Recording | Pause active recording |
| Sync Salesforce Accounts | Refresh account folders |
| Sync Current Note to Salesforce | Push note to SF |
| Fetch Pre-Call Context | Get meeting prep data |

---

## Need Help?

- **Meeting Prep:** Visit the Meeting Prep tab at gtm-brain.onrender.com/gtm
- **Sales Process:** Review stages and MEDDICC at the Sales Process tab
- **Issues:** Contact RevOps or message in #gtm-brain
