# Agent Handoff Prompt — Critical Fixes for Eudia Lite (Feb 26, 2026)

Copy everything below into a new agent chat.

---

You are picking up a critical, time-sensitive engineering session for the Eudia Lite Obsidian plugin and GTM Brain platform. Read `docs/handoff_to_new_agent.md` FIRST — it has the full project context, architecture, and file locations.

There are users actively testing RIGHT NOW. A demo to the broader sales team is tomorrow. Every fix must be surgical, tested, and pushed to production (Render auto-deploys on git push to main).

## YOUR RULES
- Read code before editing. Always.
- Build the plugin (`cd obsidian-plugin && npm run build`) after every change to main.ts
- Copy to vault template (`npm run copy-to-vault`) and rebuild vault ZIP (`node scripts/build-tailored-vault.js`) before pushing
- Push to main only when changes are complete and tested
- DO NOT break anything that is currently working. Users are live.

## CRITICAL ISSUES TO FIX (in priority order)

### 1. HIGHEST: Audio Chunking Failures on Calls >15 Minutes

**Symptom**: A 29-minute call was recorded. Chunks 2/4, 3/4, and 4/4 all failed transcription after 4 retry attempts each. Only chunk 1 transcribed successfully. The user sees "[~8:32 – 17:04 — audio not transcribed (chunk 2/4 failed after 4 attempts)]" in their note.

**Root cause to investigate**: The chunked transcription path in `obsidian-plugin/src/TranscriptionService.ts` (method `transcribeAudioChunked`) splits audio >15MB into chunks and sends each to `/api/transcribe-chunk` on the server (`src/app.js`). The server then calls OpenAI Whisper. Likely causes:
- Render request timeout (30s free tier, varies on paid) killing long transcription requests
- Chunk size too large for the endpoint
- Base64 encoding inflating payload beyond Express's 100MB limit
- OpenAI Whisper API timeout on large chunks

**What to check**: 
- `src/app.js` — find `/api/transcribe-chunk` endpoint, check timeout and payload handling
- `src/services/transcriptionService.js` — check chunk size, retry logic, Whisper API call
- `obsidian-plugin/src/TranscriptionService.ts` — check `transcribeAudioChunked`, chunk splitting logic, retry delays

**Fix direction**: Reduce chunk size (currently likely too large), add explicit timeouts, improve retry with exponential backoff. Consider streaming the audio file upload instead of base64 encoding.

### 2. HIGH: Account Overload — Show Only User's Accounts

**Symptom**: Riley and Sean see ALL ~699 accounts in their vault sidebar. Their actual owned accounts (~50-80) are buried in `Accounts/_Prospects/`. The sidebar is overwhelming and unusable.

**What needs to happen**:
- For BL users (Riley, Sean), the vault should show ONLY their owned accounts at the top level of `Accounts/`
- Prospect accounts should NOT be in a `_Prospects` subfolder — they should be alongside active accounts since BLs primarily cover prospects
- Accounts they don't own should not be in their vault at all
- This is controlled by the `/api/accounts/ownership/:email` endpoint in `src/app.js` and the folder creation logic in `obsidian-plugin/main.ts` (`createTailoredAccountFolders`, `createProspectAccountFiles`)

**Remote trigger needed**: When the plugin pushes this update, existing vaults for Riley and Sean need to be restructured. Use the `syncAccountFolders()` mechanism or create a one-time migration in `onload()` that moves `_Prospects/` contents up to `Accounts/` and removes unowned account folders.

### 3. HIGH: Calendar-to-Account Matching for Prospect Accounts

**Symptom**: Riley clicks a Yahoo meeting in the calendar sidebar. The meeting note is NOT created under the `Yahoo` account folder. Instead it goes to a generic location or wrong account.

**Root cause**: The calendar matching logic in `main.ts` (search for `createMeetingNote`, `matchAccountFromEvent`, or similar) likely only searches top-level `Accounts/` children, not `_Prospects/` subfolders. When an account is in `_Prospects/Yahoo/`, the matching doesn't find it.

**Fix**: After fixing issue #2 (moving prospects to top level), this may resolve itself. But also verify the matching logic searches all account folders regardless of nesting. Check how the plugin matches calendar event attendee domains to account folders.

### 4. HIGH: macOS Permission Flow — Siri Redirect

**Symptom**: When the plugin tells the user to "Open System Settings" for microphone permission, macOS redirects to Siri settings instead. User thinks they granted permission but didn't. Recording starts with mic-only (their voice only, not the other person).

**What needs to happen**:
- Replace the generic "Open System Settings" with specific deep-links:
  - Microphone: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
  - Screen Recording: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
- Add a permission validation step: after the user says they've granted permission, test `getUserMedia` and `getDisplayMedia` to confirm they actually work before starting a recording
- Show clear inline guidance: "Go to System Settings → Privacy & Security → Microphone → toggle Obsidian ON. Then do the same for Screen & System Audio Recording."
- Search for `showPermissionGuide` in `main.ts` to find the current implementation

### 5. MEDIUM: Privacy/Trust UX for Salesforce Sync

**User feedback (Riley)**: "Notes should default to 'for my eyes only'. I need to explicitly choose to sync to Salesforce, and there should be a confirmation step."

**Current state**: Notes have `sync_to_salesforce: false` in frontmatter by default. The user must manually change it to `true` and then use Cmd+P > "Sync Note to Salesforce". This is actually already private-by-default, but the UI doesn't communicate this clearly.

**What needs to happen**:
- Add a visible "Private" badge or indicator on notes that haven't been synced
- When user clicks sync, show a confirmation dialog: "This will push your meeting notes to Salesforce under [Account Name]. Confirm?"
- Consider adding a "Sync to Salesforce" button in the note itself (not just Cmd+P)

### 6. MEDIUM: Vault Sidebar Simplification

**User feedback (Riley)**: Left sidebar is overloaded. Folders like _Analytics, _Customer Health, _Backups, Next Steps, Recordings create cognitive load.

**What to consider**:
- Hide utility folders by default (prefix with `.` or move to a hidden location)
- The `_` prefix already sorts them to the bottom, but they're still visible
- For the demo: can these be collapsed or filtered in Obsidian's file explorer?

### 7. LOW: Multi-Vault Install Script Fix

**Issue**: `install.sh` finds the first vault on disk, which may not be the active one. Riley had two vaults — script updated the wrong one.

**Fix**: When `find` returns multiple results, list them with numbers and ask the user to pick. Only auto-select if exactly one vault is found.

## CONTEXT ON WHAT'S WORKING

- Auto-update engine (v4.4.0+ users get updates silently on Obsidian restart)
- Light theme auto-correction (ensureLightTheme on startup)
- Editable mode auto-correction (ensureEditableMode on startup)
- Headphone/AirPods audio capture (no longer preemptively blocks system audio)
- False transcription error suppression (post-processing errors don't show banner)
- Plugin update page at /update-plugin (Mac + Windows, auto-detects OS)
- Deal Code field on Opportunity (auto-generates on Closed Won)

## BUILD & DEPLOY CHECKLIST

```bash
cd obsidian-plugin && npm run build          # Compile main.ts → main.js
npm run copy-to-vault                        # Copy to vault-template
cd .. && node scripts/build-tailored-vault.js  # Rebuild vault ZIP
git add [changed files] && git commit -m "..." && git push origin main  # Deploy
```

Render auto-deploys in 3-5 minutes after push. Verify at:
- https://gtm-wizard.onrender.com/api/plugin/version (should show latest version)
- https://gtm-wizard.onrender.com/health (should show healthy + SF connected)
