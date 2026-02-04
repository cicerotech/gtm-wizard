# Olivia's Vault Update Guide

## The Issue

The "Yes. Yes. Yes..." transcription output is a Whisper API hallucination caused by audio capture issues - not an API key problem. This update fixes the audio handling and resets your setup.

---

## Step-by-Step Instructions

### Step 1: Close Obsidian

Close Obsidian completely before making any changes.

### Step 2: Locate Your Vault's Plugin Folder

Navigate to your vault folder and find:
```
[Your Vault]/.obsidian/plugins/eudia-transcription/
```

**Tip:** The `.obsidian` folder is hidden. On Mac, press `Cmd+Shift+.` in Finder to show hidden files.

### Step 3: Replace the Plugin Files

Copy ALL files from this update folder into your plugin folder, replacing the existing files:

- `main.js` (replaces existing)
- `styles.css` (replaces existing)
- `manifest.json` (replaces existing)
- `data.json` (replaces existing - this resets your setup)

### Step 4: Reopen Obsidian

1. Open Obsidian
2. Open your vault
3. The **Setup Wizard** should appear automatically

### Step 5: Complete the Setup Wizard

1. **Enter your email**: `olivia.jung@eudia.com`
2. **Connect to Salesforce**: Click the button and complete the OAuth flow
3. **Import Accounts**: Your accounts will be imported based on ownership

### Step 6: Test Transcription

**Before a real meeting**, test with a short recording:

1. Click the **microphone icon** in the left sidebar
2. Speak for 10-15 seconds (just say anything)
3. Click **Stop**
4. Verify the transcription shows what you said (not gibberish)

---

## Audio Troubleshooting

If transcription still shows "Yes. Yes. Yes..." or similar:

### Check 1: Correct Audio Input

- Go to **System Preferences → Sound → Input**
- Make sure the correct microphone is selected
- Speak and verify the input level meter moves

### Check 2: Meeting Audio

For meeting recordings (Zoom, Teams, etc.):
- The plugin captures your **microphone**, not system audio
- For meeting audio, you may need to use the meeting's built-in recording feature
- Alternatively, use a virtual audio device (like BlackHole on Mac) to capture both

### Check 3: Microphone Permissions

- Go to **System Preferences → Security & Privacy → Privacy → Microphone**
- Ensure **Obsidian** is checked

---

## Need Help?

Ping **@Keigan** in Slack with:
1. A screenshot of any error messages
2. What meeting tool you're using (Zoom, Teams, etc.)
3. Whether the test recording (Step 6) worked
