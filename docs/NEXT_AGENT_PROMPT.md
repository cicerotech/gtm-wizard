# Eudia Lite — Critical Fix Session

Paste this entire block into a new agent chat.

---

Read `docs/handoff_to_new_agent.md` first. It has the full project architecture, file locations, and current state. Do not start work until you have read it.

You are a senior full-stack engineer executing critical fixes on a live production system. Users are actively testing. A demo to the sales org is tomorrow. You do not guess. You read code, trace execution paths, validate assumptions, and ship fixes that work the first time.

## RULES

1. Read the actual code before editing any file. No assumptions.
2. After every change to `obsidian-plugin/main.ts` or any `.ts` file: run `cd obsidian-plugin && npm run build`
3. Before pushing: `npm run copy-to-vault && cd .. && node scripts/build-tailored-vault.js`
4. One commit per logical fix. Push to main. Render auto-deploys in 3-5 min.
5. Verify each deploy: `curl -s https://gtm-wizard.onrender.com/api/plugin/version`
6. Do not break what works. Users on v4.9.7 are live right now.

## FIX THESE IN ORDER

### FIX 1 — Transcription fails on calls longer than ~8 minutes

A 29-minute recording produced 4 chunks. Only chunk 1 transcribed. Chunks 2, 3, 4 all failed after 4 retry attempts each. The user sees placeholder text like `[~8:32 – 17:04 — audio not transcribed (chunk 2/4 failed after 4 attempts)]`.

**Investigate these files in this order:**
- `obsidian-plugin/src/TranscriptionService.ts` — find `transcribeAudioChunked`. How large are the chunks? How is audio split? What is the retry logic?
- `src/app.js` — find `/api/transcribe-chunk` endpoint. What is the request size limit? Is there a timeout?
- `src/services/transcriptionService.js` — find the Whisper API call. What is the file size sent to OpenAI? Is there a timeout?

**Likely root cause:** Chunks are too large for the Render request timeout. Base64 encoding inflates size by 33%. A 29-min WebM file is ~20-30MB; split into 4 chunks that's ~5-7MB each, base64-encoded to ~7-10MB per request. Render may be timing out.

**Fix:** Reduce chunk size threshold (currently 15MB, try 8MB). Add explicit request timeout. Ensure retry delays are sufficient. Test by checking if chunk 1 succeeds consistently (it does — which means the issue is payload size or cumulative server load, not auth or endpoint).

### FIX 2 — Show only the user's accounts, not all 699

Riley and Sean see every account in Salesforce in their vault sidebar. Their actual book of business (~50-80 accounts) is buried in `Accounts/_Prospects/`. The rest is noise.

**What to change:**
- `obsidian-plugin/main.ts` — find `createProspectAccountFiles`. Currently puts prospects in `Accounts/_Prospects/[name]/`. Change this: for BL users, put ALL their accounts (active + prospect) at the top level of `Accounts/`. No `_Prospects` subfolder.
- `obsidian-plugin/main.ts` — find `createTailoredAccountFolders`. This creates active account folders. Combine with prospects so they're all siblings in `Accounts/`.
- Add a one-time migration in `onload()`: if `_Prospects/` exists, move its children up to `Accounts/` and delete the empty `_Prospects` folder. Gate this with a settings flag (`prospectsMigrated`) so it runs once.
- The vault should NOT contain accounts the user doesn't own. The `/api/accounts/ownership/:email` endpoint already returns only owned accounts — verify the setup wizard isn't loading extras.

### FIX 3 — Calendar meeting notes don't file under prospect accounts

When Riley clicks a Yahoo meeting in the calendar, the note should be created inside `Accounts/Yahoo/Note 1.md`. Instead it goes to a generic location.

**Investigate:** Search `main.ts` for the calendar-to-account matching logic. Look for how meeting attendee email domains are matched to account folder names. The matching likely only searches direct children of `Accounts/`, missing `_Prospects/` subfolders.

**Fix:** After FIX 2 moves prospects to top level, this should resolve. But verify the matching logic handles the case where the account folder name doesn't exactly match the meeting subject or attendee domain (fuzzy match, cachedAccounts lookup by ID).

### FIX 4 — macOS microphone permission redirects to Siri

When the plugin prompts "Open System Settings" for mic permission, macOS opens Siri settings instead. User thinks they allowed it but didn't.

**Find:** Search `main.ts` for `showPermissionGuide`. Replace the generic system settings open with macOS deep-links:
- Microphone: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
- Screen Recording: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

Add a validation check after permission is supposedly granted: call `navigator.mediaDevices.getUserMedia({audio: true})` and if it fails, show "Microphone permission not detected. Go to System Settings > Privacy & Security > Microphone > toggle Obsidian ON."

### FIX 5 — Hide sidebar clutter for demo

Riley flagged: too many folders visible. _Analytics, _Customer Health, _Backups, Next Steps, Recordings are distracting.

**Quick fix for demo:** In `styles.css`, add CSS rules to hide folders starting with `_` and utility folders from the file explorer. Use Obsidian's `.nav-folder-title[data-path]` selectors. Alternatively, in the build script and plugin startup, rename these folders to start with `.` (dot prefix hides them in Obsidian's file explorer).

### FIX 6 — Multi-vault install script picks wrong vault

`/api/plugin/install.sh` uses `find | head -1` which picks the first vault found. Users with multiple vaults get the wrong one updated.

**Fix in `src/app.js`:** In the install.sh script content, when `find` returns multiple results, list them numbered and prompt the user to pick. Only auto-select when exactly one vault is found.

### FIX 7 — Salesforce sync confirmation dialog

Notes default to `sync_to_salesforce: false` (private). But there's no visual indicator that notes are private, and no confirmation when syncing.

**Add:** When `syncNoteToSalesforce()` is called, show an Obsidian Modal: "Push this note to Salesforce under [Account Name]? Only notes you explicitly sync are shared." with Confirm/Cancel buttons. Search `main.ts` for `syncNoteToSalesforce` and wrap the call in a modal.

## WHAT IS WORKING — DO NOT BREAK

- Plugin auto-update (v4.4.0+ checks server every 10 min, downloads + hot-reloads)
- Light theme auto-correction on startup
- Editable mode (Live Preview) auto-correction on startup
- Headphone/AirPods audio capture (attempts system audio before falling back to mic-only)
- Post-transcription error suppression (doesn't show error banner when content exists)
- Deal Code auto-generation on Closed Won opportunities
- Calendar view with external-only filter
- Meeting note templates (MEDDIC, Demo, CS, General, Internal)

## VERIFY AFTER EACH PUSH

```bash
curl -s https://gtm-wizard.onrender.com/api/plugin/version
# Should show new version number and "name":"Eudia Lite"

curl -s https://gtm-wizard.onrender.com/health
# Should show "healthy" and "salesforce.connected: true"
```

## ACTIVE USERS

| User | Email | Version | Platform | Vault Path |
|------|-------|---------|----------|------------|
| Sean Boyd | sean.boyd@eudia.com | v4.9.7 | Mac | Latest download |
| Riley Stack | riley.stack@eudia.com | v4.9.7 | Mac | `/Users/rileystack/Downloads/Business-Lead-Vault-2026` |
| Rajeev Patel | — | v4.9.7 | Mac | Setup completed |
| Greg MacHale | greg.machale@eudia.com | v4.1.0 | Windows PC | Needs PowerShell update from /update-plugin |
