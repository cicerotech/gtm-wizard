# Obsidian Vault — Clean Install Guide (Olivia)

Follow these steps **in order**. This removes all old vault data and gives you a fresh start.

---

## Step 1: Force Quit Obsidian

- Right-click the Obsidian icon in the Dock → **Quit**
- Or: `Cmd + Q` while Obsidian is focused
- If it won't quit: Open **Activity Monitor** (Spotlight → "Activity Monitor"), find "Obsidian", click it, then click the **X** button → **Force Quit**

## Step 2: Delete ALL Old Vaults

Open **Terminal** (Spotlight → "Terminal") and paste this entire block, then press Enter:

```
rm -rf ~/Documents/Business-Lead-Vault*
rm -rf ~/Documents/BL\ Sales\ Vault*
rm -rf ~/Downloads/Business-Lead-Vault*
rm -rf ~/Downloads/BL\ Sales\ Vault*
rm -rf ~/Desktop/Business-Lead-Vault*
rm -rf ~/Desktop/BL\ Sales\ Vault*
rm -rf "$HOME/Library/Application Support/obsidian/obsidian.json"
echo "✅ Old vaults and vault registry cleared"
```

This removes:
- All old vault folders (Documents, Downloads, Desktop)
- The Obsidian vault registry (so old vaults don't auto-open)

## Step 3: Download Fresh Vault

Open this link in your browser:

**https://gtm-wizard.onrender.com/vault/download**

This downloads `Business-Lead-Vault-2026.zip` to your Downloads folder.

## Step 4: Unzip and Move

1. Double-click `Business-Lead-Vault-2026.zip` in Downloads to unzip it
2. Drag the `Business-Lead-Vault-2026` folder to **Documents**

## Step 5: Open in Obsidian

1. Open the **Obsidian** app
2. It will ask you to open a vault — click **"Open folder as vault"**
3. Navigate to `Documents` → `Business-Lead-Vault-2026` → click **Open**
4. If prompted about "Trust author", click **Trust** and **Enable plugins**

## Step 6: Setup Wizard

The Eudia setup wizard will appear automatically:
1. Enter your **Eudia email** (olivia.jung@eudia.com)
2. Click **Connect to Salesforce** — you'll be redirected to login, then back
3. Click **Import Accounts** — this creates account folders from your SF assignments
4. Done! You should see your accounts in the sidebar

## Step 7: Test Recording

1. Open any account folder (e.g., click "Apple" in the sidebar)
2. Click the **microphone icon** in the left toolbar
3. Record for 30 seconds, then click **Stop**
4. Wait for transcription to complete (~30 seconds)
5. Verify you see a clean meeting summary

---

**If anything goes wrong**: Screenshot the error and send to Keigan.
