# Welcome to Your Eudia Sales Vault

This vault is pre-configured for capturing sales meeting intelligence. Complete these quick steps to finish setup.

---

## Step 1: Enter Your OpenAI API Key

1. Open **Settings** (gear icon or `Cmd + ,`)
2. Go to **Community Plugins** → **Scribe**
3. Click the **AI Providers** tab
4. Paste the API key provided by RevOps
5. Select **GPT-4o** as the model

---

## Step 2: Verify Eudia Sync Plugin

The **Eudia Sync** plugin keeps your account folders in sync with Salesforce automatically.

1. Go to **Settings** → **Community Plugins** → **Eudia Sync**
2. Verify the server URL is: `https://gtm-brain.onrender.com`
3. "Sync on Startup" should be ON (default)
4. Click **Sync Accounts** to manually refresh account folders

> **Tip:** You can also click the refresh icon in the left ribbon to sync anytime.

---

## Step 3: Connect Your Calendar (Optional)

1. Go to **Settings** → **Community Plugins** → **Full Calendar**
2. Click **Add Calendar**
3. Choose **Remote/ICS**
4. Paste your calendar ICS URL (get it from: `https://gtm-brain.onrender.com/api/calendar/feeds`)
5. Name it "Work Calendar" and save

---

## Step 4: Verify Scribe Settings

1. Go to **Settings** → **Scribe** → **General** tab
2. Ensure **Append transcript to active file** is ON
3. Ensure **Save audio file** is ON

---

## Step 5: Set Active Template

1. Go to **Settings** → **Scribe** → **Templates** tab
2. Select **Eudia Sales** from the Active Template dropdown

---

## You're Ready!

### To Record a Meeting:
1. Navigate to the account folder (e.g., `Accounts/Amazon/`)
2. Create a new note: Right-click → New note → Name it `YYYY-MM-DD Meeting Type`
3. Click Scribe's mic icon → Start Recording
4. When done, your structured summary appears automatically

### Folder Structure:
- `Accounts/` - One folder per Salesforce account
- `Templates/` - Template files (don't edit)
- `Recordings/` - Audio files (created automatically)

---

## Need Help?

- **Meeting Prep:** Visit the Meeting Prep tab at `https://gtm-brain.onrender.com/gtm`
- **Sales Process:** Review stages and MEDDICC at the Sales Process tab
- **Commands:** Slack commands at the Commands tab

