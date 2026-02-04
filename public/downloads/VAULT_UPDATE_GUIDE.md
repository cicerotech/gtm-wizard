# GTM Brain Vault Update Guide

## Overview

This guide helps you update to the latest GTM Brain vault. The process has **two steps**:
1. **Step 1**: Run a cleanup command (backs up your notes, removes old files)
2. **Step 2**: Download the fresh vault from the GTM site

---

## Step 1: Cleanup (Run in Terminal)

**Close Obsidian first**, then copy and paste this entire command:

```bash
mkdir -p ~/Desktop/GTM-Notes-Backup && \
find ~/Documents ~/Downloads -maxdepth 2 -type d -name "BL Sales Vault 2026*" 2>/dev/null | while read vault; do
  if [ -d "$vault/Accounts" ]; then
    cp -r "$vault/Accounts" ~/Desktop/GTM-Notes-Backup/ 2>/dev/null
  fi
  if [ -d "$vault/Pipeline" ]; then
    cp -r "$vault/Pipeline" ~/Desktop/GTM-Notes-Backup/ 2>/dev/null
  fi
done && \
find ~/Documents ~/Downloads -maxdepth 2 -type d -name "BL Sales Vault 2026*" -exec rm -rf {} + 2>/dev/null && \
find ~/Downloads -maxdepth 1 -name "BL*Vault*.zip" -exec rm {} + 2>/dev/null && \
echo "✓ Cleanup complete! Your notes are backed up to: ~/Desktop/GTM-Notes-Backup"
```

This command:
- ✅ Backs up any meeting notes you've taken to `~/Desktop/GTM-Notes-Backup`
- ✅ Removes old vault folders and ZIP files
- ❌ Does NOT download anything - you still need Step 2

---

## Step 2: Download Fresh Vault

1. Go to **[GTM Brain Site URL]**
2. Download `Business-Lead-Vault-2026.zip`
3. Extract to your Documents folder
4. Open Obsidian → Click vault icon (bottom-left) → "Open folder as vault"
5. Select the extracted folder
6. Complete the setup wizard with your @eudia.com email

---

## Step-by-Step Process

### Before You Start
1. **Close Obsidian** completely (Cmd+Q)
2. Run the command above in Terminal

### Download Fresh Vault
1. Go to the GTM Brain site
2. Download the latest `Business-Lead-Vault-2026.zip`
3. Extract to Documents folder
4. Open in Obsidian and complete the setup wizard

### Restore Your Notes (If You Had Any)
After completing setup, if you had previous notes:

```bash
# Copy your backed-up notes into the new vault
cp -r ~/Desktop/GTM-Notes-Backup/Accounts/* ~/Documents/Business-Lead-Vault-2026/Accounts/ 2>/dev/null
cp -r ~/Desktop/GTM-Notes-Backup/Pipeline/* ~/Documents/Business-Lead-Vault-2026/Pipeline/ 2>/dev/null
echo "✓ Notes restored!"
```

---

## Troubleshooting

**"Permission denied" error?**
Make sure Obsidian is fully closed, then try again.

**Can't find your old notes?**
Check `~/Desktop/GTM-Notes-Backup/` - they're safely stored there.

**Setup wizard doesn't appear?**
The plugin may need to be enabled: Settings → Community Plugins → Enable "GTM Brain"

---

## Need Help?
Contact the RevOps team if you run into any issues.
