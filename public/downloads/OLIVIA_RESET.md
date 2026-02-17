# Obsidian Reset — Copy & Paste to Terminal

Open **Terminal** (Cmd+Space → type "Terminal" → Enter), then paste this entire block and press Enter:

```
osascript -e 'quit app "Obsidian"' 2>/dev/null; sleep 1; rm -rf ~/Documents/Business-Lead-Vault* ~/Documents/BL\ Sales\ Vault* ~/Downloads/Business-Lead-Vault* ~/Downloads/BL\ Sales\ Vault* ~/Desktop/Business-Lead-Vault* ~/Desktop/BL\ Sales\ Vault* ~/.Trash/Business-Lead-Vault* ~/.Trash/BL\ Sales\ Vault* "$HOME/Library/Application Support/obsidian/obsidian.json" && curl -L -o ~/Downloads/Business-Lead-Vault-2026.zip "https://gtm-wizard.onrender.com/vault/download" && cd ~/Downloads && unzip -o Business-Lead-Vault-2026.zip -d ~/Documents/Business-Lead-Vault-2026 && rm Business-Lead-Vault-2026.zip && echo "" && echo "✅ Done! Open Obsidian → Open folder as vault → Documents → Business-Lead-Vault-2026" && echo ""
```

**What this does:**
1. Force quits Obsidian
2. Deletes ALL old vault folders (Documents, Downloads, Desktop, Trash)
3. Clears Obsidian's vault registry so old vaults don't auto-open
4. Downloads the latest vault from the server
5. Unzips it to Documents
6. Cleans up the ZIP

**After it runs, just:**
1. Open Obsidian
2. Click "Open folder as vault"
3. Select Documents → Business-Lead-Vault-2026
4. Trust & enable plugins when prompted
5. Enter your email in the setup wizard
