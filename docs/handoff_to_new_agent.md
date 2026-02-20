# GTM-Brain Project Handoff — Updated Feb 20, 2026 (Morning)

**DO NOT MODIFY THIS PROJECT WITHOUT EXPLICIT REQUEST.**  
**APPROACH: Surgical improvements only. Production system serving 41+ users.**

---

## CRITICAL ACTIVE TASK: Obsidian Plugin Two-Way Audio Capture WITHOUT BlackHole

### Problem Statement
The Obsidian transcription plugin cannot capture the other person's audio on sales calls when the user has headphones plugged in. The current `full_call` mode disables echo cancellation on the mic so it can pick up speaker audio, but with headphones, the call audio routes to headphones — the mic hears nothing.

The existing "solution" requires installing BlackHole (a third-party virtual audio driver) and creating a Multi-Output Device in macOS Audio MIDI Setup. **This is unacceptable** — it's too complex for sales reps, introduces a confusing setup wizard popup that blocks recording, and adds a third-party dependency.

### What's Needed
Build a NATIVE two-way audio capture solution that works with headphones, without requiring BlackHole or any third-party virtual audio driver. This is the #1 priority.

### Technical Context
- **Plugin location**: `obsidian-plugin/main.ts` (8,400+ lines) and `obsidian-plugin/src/AudioRecorder.ts`
- **Current architecture**: Uses `navigator.mediaDevices.getUserMedia()` with `echoCancellation: false` for mic capture. If a virtual device (BlackHole) is detected, it creates a second stream from the virtual device and mixes them via Web Audio API.
- **Obsidian runs on Electron** (Chromium-based). Electron has access to `desktopCapturer` API which can capture system audio without a virtual device. This may be the path forward.
- **Current plugin version**: v4.6.0 (deployed to Render, serves via `/api/plugin/main.js`)
- **Auto-update**: Plugin checks `/api/plugin/version` on startup, downloads new files if version is higher

### Approaches to Investigate
1. **Electron `desktopCapturer`**: Can capture system audio natively. The challenge is Obsidian may sandbox plugins from accessing Electron APIs directly. Test: `require('electron').desktopCapturer.getSources({ types: ['audio'] })`
2. **`getDisplayMedia()` with `audio: true`**: Chrome/Electron supports tab audio capture. The user shares a tab or screen and the audio is captured. Downside: requires user to click "Share" each time.
3. **Obsidian's audio API**: Check if Obsidian exposes any native audio capture that bypasses the web sandbox.
4. **WebRTC loopback**: Create a local WebRTC connection that captures system audio — possible in some Electron configurations.

### Files to Edit
- `obsidian-plugin/src/AudioRecorder.ts` — Core audio capture class. Add a new capture mode (e.g., `system_audio`) that uses Electron APIs.
- `obsidian-plugin/main.ts` — `startRecording()` at line ~5443. Remove the wizard gate (already done in v4.5.3+). Add the new capture mode selection.

### What Was Already Done (Feb 19-20, 2026 session)
1. **Removed the blocking AudioSetupWizardModal** from `startRecording()` — recording now starts immediately (v4.5.3)
2. **Added 3 meeting note templates** — Sales Discovery (MEDDIC), Demo/Presentation, General Check-In (v4.6.0)
3. **Added Slack Copy command** — Cmd+P > "Copy Note for Slack" (v4.6.0)
4. **Added audio safety net** — Saves recording to vault `Recordings/` folder before sending to server (v4.5.2)
5. **Fixed version endpoint** — Server fallback was returning stale version, preventing auto-updates (v4.5.2)
6. **Non-blocking headphone warning** — Shows notice about mic-only mode when no virtual device detected

### What's NOT Working
- Two-way audio capture with headphones (without BlackHole)
- The non-blocking notice still appears when recording starts, confusing users

### Deployment
- `cd obsidian-plugin && npm run build` (uses esbuild, takes <1s)
- Bump version in `obsidian-plugin/manifest.json` AND `src/app.js` version endpoint fallback
- `git push origin main` deploys to Render (auto-builds, ~3 min)
- Users get the update on next Obsidian restart (auto-update checks on `onload()`)
- Manual update: terminal command downloads 3 files directly from server

---

## RECENT COMPLETED TASKS (Feb 19-20, 2026)

### Salesforce: Account Highlights Panel Cleanup (Deployed)
- Restructured from horizontal flex (causing vertical letter stacking) to vertical column layout
- Logo (40px) → Account Name (18px bold) → Icon-only action buttons row
- Edit button replaced with dropdown menu: "Edit Account" + "Delete Account" (with confirmation)
- Request Info changed to icon-only button
- Multiple CSS iterations to find proportionate sizing for the narrow sidebar
- Files: `accountHighlightsPanel.html`, `.css`, `.js`

### Salesforce: Pipeline Review Inline Edit Fix (Deployed)
- Edits (Next Steps, Products, Stage, ACV, etc.) now persist visually on the page immediately
- Root cause: LWC CDN was serving cached old JS with `setTimeout(() => _loadData(), 3000)` that overwrote local updates
- Fix: Removed all server re-fetch after save. Local `_applyLocalUpdate()` updates `pipelineData` → `_buildOwnerGroups()` rebuilds view. `_forceRerender()` empties and re-sets `ownerGroups` to force DOM rebuild. Key versioning (`_editVersion`) ensures LWC treats edited rows as new.
- Products → AI-Enabled: When Products change, `aiEnabled` flag recalculates locally, updating owner group AI totals
- API version bumped (65.0 → 63.0) to force CDN cache invalidation

### Salesforce: Pod Auto-Assignment on Opportunity Creation (Deployed)
- `AccountLookupController.cls`: Added `getDefaultPod()` — checks running user email against EU team set, defaults to US
- `createOpportunity()` now accepts `pod` parameter, sets `Pod__c` on the Opportunity
- LWC `opportunityCreator`: Pod radio toggle (US/EU) auto-detected from current user, always overridable
- No restrictions — new users default to US; opp always creates successfully

### Salesforce: Pipeline Review Stage Options (Deployed)
- Added Nurture, Disqualified, Lost to stage dropdown in inline edit
- "Lost" maps to "Lost" (not "Closed Lost") matching actual org stage path

### F500 Excel Prioritization (v9.2 — Formula-Driven)
- Complete rebuild with formula-driven scores tied to adjustable assumption tables
- Distribution table: Industry Group | F500 | Customer | Active | Dormant (formula: Total-Customer-Active)
- 3 visible sub-score columns: Legal Spend Score | CLO Score | AI/Industry Score
- VLOOKUP formulas reference `$E$6:$G$10` for industry factors
- 500 companies with AI signals researched, 292 CLOs identified, 47 AI-Forward
- Read Me tab with AI scoring rubric (what makes a 7 vs 10)
- Files: `scripts/f500_excel_v9.py`, `data/F500_Raw_Data.xlsx`, `data/f500_ai_signals_cache.json`

---

## CURRENT STATE: F500 Prioritization Exercise

### Completed — F500 Prioritization
All 500 Fortune 500 companies scored across 7 dimensions for Eudia fit. Output:
- **`data/f500_prioritization.csv`** — Full ranked list with composite scores, tier assignments, estimated legal spend, recommended Eudia products, and SF overlap flags
- **`scripts/f500_prioritization.py`** — Rerunnable scoring model
- **`data/f500_legal_spend_multipliers.csv`** — 65 F500 industry categories mapped to legal spend % of revenue
- **`docs/clay_f500_workflow.md`** — Copy-paste Clay column guide (if user wants to add web-sourced enrichment later)
- **`data/f500_test_sample.csv`** — 10-company test sample for Clay workflow validation

Results: 137 Tier 1 (48 new to SF), 81 Tier 2 (35 new), 98 Tier 3, 129 Tier 4, 55 Tier 5. 254 of 500 already in Salesforce.

### Completed — Pipeline Review Product Filter Fix (Deployed to Prod)
- **Root cause**: `Product_Line__c` multi-select picklist stores different API names for the same product. Also, 38 deals tagged as `"Multiple"` were excluded from all product filters.
- **Fix**: Added `normalizeProductCategory()` and `categoryToLikePattern()` to Apex controller. Product filter now uses keyword LIKE (`%Compliance%`) plus OR clause for `Product_Line__c = 'Multiple'` deals matched by Opp Name.
- **Result**: Compliance filter now returns 42 deals / $10M (was 9 deals / $1.1M). Verified via SOQL against prod data.
- **Test class**: `PipelineReviewControllerTest.cls` — 19 tests, all passing, deployed to prod.
- **Debug cleanup**: Removed `background:#f0f2ff` from Next Steps inline style.

### Completed — Next Steps Text Wrapping (Deployed to Prod)
- Inline `white-space:normal; word-break:break-word` bypasses CDN CSS caching.
- JS truncation removed — full text wraps across multiple lines.

### Completed — Pipeline Review UI Refinements (Deployed to Prod)
- **Owner ordering**: BL sections now display in fixed order (US: Olivia, Julie, Asad, Ananth, Mitch, Mike, Riley, Rajeev, Sean; EU: Nathan, Conor, Nicola, Greg) instead of sorted by pipeline ACV.
- **Products column**: Multi-product deals now show abbreviated list ("Compliance / Sigma / Contracting") instead of "3 products".
- **Products edit**: Clicking the Products cell opens a multi-select checkbox group (all 12 product options) instead of a raw text field. Selection saved as semicolon-separated values to `Product_Lines_Multi__c`. Flows through to the Opportunity record.
- **Next Steps edit modal**: Widened from 420px to 560px max-width. Textarea has 160px min-height for readability. Max-length increased from 255 to 1000.
- **F500 Positioning Enrichment**: Web-researched 92 priority-industry companies. Positioning in `data/f500_positioning_cache.json`. Final output: `data/F500_Raw_Data.xlsx` with full-length tailored positioning per company.

### Files Deployed to Salesforce Prod
- `PipelineReviewController.cls` + `PipelineReviewControllerTest.cls`
- `pipelineReviewCenter/` LWC bundle (html, js, css, meta.xml)

---

## PRIOR CRITICAL TASK: Meeting Prep Account Intelligence

The Meeting Prep tab's **Account Intelligence** section had "Intelligence temporarily unavailable" for ALL meeting cards. This was addressed in commits `50a3e2d` (dedicated pipeline) and `a1dd9e9` (compact styling). The root cause was intent misclassification — query text containing "meeting" + "upcoming" triggered `MEETING_ACTIVITY` cross-account intent.

**Read the FULL "Meeting Prep Intelligence Debugging History" section below before attempting ANY fix.** Multiple approaches have been tried and failed due to a specific class of bugs (regex in template literals). Understanding the full history prevents repeating the same mistakes.

---

## Project Context

GTM-Brain (GTM-Wizard) is a multi-surface AI agent for Eudia (legal AI startup, Series A). Three interfaces: **Obsidian Plugin** (desktop), **GTM Hub** (web), **Slack Bot**.

**What it is:** Node.js/Express on Render connecting Salesforce, Microsoft Outlook calendars, Slack, and Obsidian.

**Latest commit:** `d92c5ec` — "Add verbose client-side logging for intelligence query debugging"

**Production URL:** https://gtm-wizard.onrender.com (Okta SSO)
**GitHub:** cicerotech/gtm-wizard (private)
**Technical walkthrough:** /technical route

---

## Critical Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/services/intelligenceQueryService.js` | ~3,100 | GTM Brain query engine — 21 intents, SOQL, prompts |
| `src/views/meetingPrepView.js` | ~3,200 | Meeting Prep tab — modal, account intel, attendees |
| `public/assets/meeting-prep-helpers.js` | ~380 | **Static JS file** — ALL regex-containing helper functions |
| `src/views/gtmBrainView.js` | ~1,260 | GTM Brain web chat UI |
| `src/services/calendarService.js` | ~1,020 | Calendar integration (MS Graph) |
| `src/app.js` | ~8,800 | Express server, ALL routes |
| `src/slack/events.js` | ~7,800 | Slack event handlers |
| `src/db/connection.js` | ~160 | PostgreSQL connection pool |
| `docs/GTM_ENG_PLANNING_2026.md` | ~1,500 | Complete system documentation |

---

## Meeting Prep Intelligence — Debugging History (READ ALL OF THIS)

### The Architecture

When a user clicks a meeting card in the Meeting Prep tab:

1. **Click handler** (isolated `<script>` block) reads `data-meeting-id` from DOM
2. **openMeetingPrep(meetingId)** fires — shows modal instantly with loading skeleton
3. **Account resolution** runs in background:
   - Step 1a: Try ALL external attendees' email domains via `/api/account/lookup-by-domain`
   - Step 1b: If no match, search by account name via `/api/search-accounts?q=...`
   - Step 1c: Account name normalized via `normalizeCalendarAccountName()` (handles Chsinc→CHS, Cvc→CVC)
4. **Intelligence query** fires via `POST /api/intelligence/query` with accountId + accountName
5. **Response rendering**: Strip follow-up suggestions, render markdown to HTML, update DOM

### What's Working Now

- Meeting cards render correctly (140+ meetings loaded)
- Clicking a card opens the modal (no JavaScript errors)
- Attendee sections render with names and "Find on LinkedIn" links
- The GTM Brain tab on the SAME site returns rich intelligence for accounts like CVC
- The `/api/intelligence/query` endpoint works when called from the GTM Brain tab

### What's NOT Working

- The Account Intelligence section in the Meeting Prep modal shows "Intelligence temporarily unavailable" for ALL meetings
- This means the `/api/intelligence/query` call is either failing, timing out, or returning empty data
- Verbose logging was added (commit `d92c5ec`) but the user hasn't yet been able to check browser console output

### 12 Fix Attempts Made (All Addressing Different Issues)

| # | Commit | What Was Tried | What Actually Happened |
|---|--------|----------------|----------------------|
| 1 | `3ca4fb8` | Fix `marked.js` ReferenceError + non-blocking intel loading | Fixed a real bug but wasn't the click blocker |
| 2 | `32e6379` | `safeJsonForScript()` to prevent `</script>` injection | Good defensive fix but not the root cause |
| 3 | `01404b4` | Delegated click handler via `document.addEventListener` | Click still didn't work because script block was broken |
| 4 | `dbe2cf6` | Isolated `<script>` with error capture + fallback modal | **Breakthrough**: showed the actual error in screenshots |
| 5 | `2d4604f` | Extract helper functions to static JS file | Created correct static file BUT left duplicates in template |
| 6 | `7c47f6e` | Delete 564 lines of duplicate functions from template | Removed duplicates but missed the onclick `/\\/g` regex |
| 7 | `14d621a` | Remove onclick handlers entirely (use delegated handler) | **Fixed the click!** But inline onclick regex `/\\/g` was the actual fatal line |
| 8 | `4928471` | Intelligence overhaul: abbreviation map, query quality, metadata | Introduced NEW regex bug: `/[\s\-_.]+/g` in template |
| 9 | `4110d09` | Fix `[s-_]` range error (split into two simple replaces) | Fixed that error but missed follow-up stripping regex |
| 10 | `246db0a` | Move ALL remaining regex to static helpers | Fixed regex errors — modal opens clean now |
| 11 | `4928471` | Account matching improvements (abbreviation expansion, domain resolution) | Logic correct but intelligence API still returns empty |
| 12 | `d92c5ec` | Add verbose client-side logging | Deployed, awaiting console output from user |
| 13 | (pending) | **ROOT CAUSE FOUND**: Fix intent misclassification + add timeout | Query text contained "meeting" + "upcoming" → triggered `MEETING_ACTIVITY` cross-account intent → accountId discarded → wrong/empty response |

### Root Cause (Fix #13) — Intent Misclassification

The Meeting Prep intelligence queries contained the words "meeting" + "upcoming" which triggered line 747 of `intelligenceQueryService.js`:
```
if (/meet|met |meeting/i.test(query) && /this week|today|tomorrow|scheduled|upcoming/i.test(query)) return 'MEETING_ACTIVITY';
```

`MEETING_ACTIVITY` is a cross-account intent (line 502), so the accountId was discarded at line 563 (`isCrossAccountIntent ? '' : accountId`). The query was routed to `gatherMeetingActivityContext()` which fetches weekly meeting data for ALL BLs — not account-specific intelligence.

**Fix:** Changed query text from "...for my upcoming meeting..." to "Give me a full account briefing..." (no "meeting"/"upcoming" keywords). Also added 30s AbortController timeout and `credentials: 'same-origin'` to match the GTM Brain tab's fetch pattern.

### The Fundamental Rule Discovered

**NEVER put any regex with backslash sequences (`\s`, `\d`, `\n`, `\w`, `\-`, `\S`, `\[`) inside the template literal script block in `meetingPrepView.js`.** The Node.js template literal processing consumes the backslashes, producing invalid regex in the browser. This kills the ENTIRE script block.

ALL regex patterns with backslash sequences MUST go in `public/assets/meeting-prep-helpers.js` (the static file loaded via `<script src>`).

### Current State of the Code

The template literal script block (`meetingPrepView.js`) now has:
- **ZERO** regex patterns with backslash sequences
- Only simple patterns: `/</g`, `/>/g`, `/([a-z])([A-Z])/g`, `/[._-]/g`
- All complex regex in `public/assets/meeting-prep-helpers.js`

The click handler is in a separate isolated `<script>` block that:
- Captures `window.onerror` events
- Reads `data-meeting-id` from DOM (no inline onclick)
- Shows fallback modal with error messages if main script fails

### What the Next Agent Should Do

1. **Deploy and verify** — Push the fix (query text change + timeout + credentials) and verify intelligence renders for at least 3 different meetings. Check browser console for `[MeetingPrep]` log lines showing `Response status: 200` and `hasAnswer: true`.

2. **If intelligence still fails after deploy** — Check Render server logs for `[Intelligence] Query intent:` to confirm the intent is now classified as `HISTORY` or `GENERAL` (NOT `MEETING_ACTIVITY`). If it's still `MEETING_ACTIVITY`, the query text change didn't deploy properly.

3. **If timeout errors appear** — The 30s AbortController may be too short if Salesforce connection is cold. Consider increasing to 45s, or removing `forceRefresh: true` so the query can use cached data (faster response).

4. **If wrong content appears** — The query may be classifying as `HISTORY` instead of `PRE_MEETING`. This is fine — HISTORY with a resolved accountId fetches the same data. But if the response focus is too narrow, adjust the query text to better guide Claude (e.g., include "deal status, contacts, competitive landscape" in the prompt).

---

## What's Working (DO NOT BREAK)

### GTM Brain Chat (Web + Slack)
- 21 cross-account intent types with direct SOQL
- Account search with fuzzy matching (SOSL fallback, abbreviation expansion)
- Forecast, pipeline, deals signed/targeting, pipeline velocity
- Account-specific queries with contacts, opportunities, events
- Counsel account sensitization (Account_Display_Name__c / Code_Name__c)
- Follow-up suggestion quality controls per intent type

### Obsidian Plugin
- 7 sub-notes per account, audio recording + transcription
- Per-user Salesforce OAuth (PKCE)
- Calendar view (live Microsoft Graph)

### Infrastructure
- PostgreSQL L2 cache active (DATABASE_URL set on Render)
- Calendar cache persists across restarts
- Meeting prep data in Postgres + file fallback
- Intent learning in Postgres + JSON fallback
- Generic cache L2 in `cache.js`
- Technical walkthrough at `/technical`

---

## Recent Session Log (Feb 17-19, 2026)

| Commit | Description |
|--------|-------------|
| `bdf5d5e` | Pipeline Review: fix text wrapping with explicit white-space:normal and min-width:0 |
| `d81d39e` | Pipeline Review: expand Next Steps visibility, allow text wrapping |
| `9ad0803` | Marketing campaign tracking: event taxonomy, budget, attribution schema |
| `40299d5` | Account Info Request: button on highlights panel + Slack notification |
| `bad914d` | Technical walkthrough: light theme, 7 sections, SVG icons |
| `a1dd9e9` | Meeting Prep intelligence: compact styling, CLO-first contacts, editable summary |
| `50a3e2d` | Meeting Prep intelligence: dedicated pipeline bypassing GTM Brain chat path |
| `288704d` | Comprehensive handoff update: Meeting Prep debugging history + current state |
| `d92c5ec` | Verbose client-side logging for intelligence debugging |
| `246db0a` | Move ALL remaining regex to static helpers — zero backslash in template |
| `e3f36cf` | PostgreSQL activation: L2 cache, meeting prep repo, intent persistence |
| `b5371d0` | AI-enabled forecast labels, BL commit data, product mapping, code names |
| `8a02ec4` | Comprehensive fix: forecast, pipeline limits, velocity |
| (pending) | **Product filter normalization** — category-based matching for Product_Line__c variants |

---

## PostgreSQL Activation

DATABASE_URL is set on Render. The L2 cache layer is active:

- Migration 005: `cache_entries` + `meeting_preps` tables (21 tables total)
- Calendar L2 cache eliminates cold-start Meeting Prep loading
- `src/db/repositories/meetingPrepRepository.js` — Postgres primary + file fallback
- `src/db/repositories/calendarRepository.js` — built but not yet wired to calendarService
- `src/utils/cache.js` — Postgres L2 between memory and cache miss
- All file-based fallbacks preserved

---

## Key Architecture Details

### Meeting Prep View (`meetingPrepView.js`)

Three `<script>` blocks in generated HTML:
1. `<script src="/assets/meeting-prep-helpers.js">` — Static file with ALL regex-containing helpers
2. `<script>` (isolated) — Click handler + error capture + fallback modal
3. `<script>` (main) — Data initialization, state, openMeetingPrep, renderPrepForm, hydration

The main script block uses `safeJsonForScript()` for JSON injection and `var` (not const/let) for try-catch scope.

### Intelligence Query Flow

```
meetingPrepView.js (client) 
  → POST /api/intelligence/query (app.js:4669)
    → intelligenceQueryService.processQuery()
      → classifyQueryIntent() — 4-layer cascade
      → gatherContext() or gatherSnapshotContext()
        → findAccountByName() — 7 strategies + abbreviation map
        → getOpportunities(), getContacts(), getRecentEvents()
      → Claude API — generates response
    → Response: { success, answer, context }
  → Strip follow-up suggestions
  → renderMarkdownToHtml()
  → Update DOM
```

### Account Resolution in Meeting Prep

```
1. Domain lookup: attendee@cvc.com → /api/account/lookup-by-domain?domain=cvc.com
2. Name search: "Cvc" → normalizeCalendarAccountName → "CVC" → /api/search-accounts?q=CVC
3. Abbreviation map in findAccountByName: "cvc" → "CVC", "chsinc" → "CHS", etc.
4. Case-insensitive Strategy 0: WHERE Name = 'CVC' OR Name = 'cvc'
5. LIKE search, stripped suffixes, first-word, SOSL fuzzy
```

---

## Security & Permissions

- Write operations restricted to Keigan (User ID: `U094AQE9V7D`)
- Meeting Prep auto-filtered to logged-in user's meetings
- Okta SSO for all web access
- Per-user Salesforce OAuth (PKCE) for plugin writes
- AES-256-GCM encryption for stored tokens
- Render PostgreSQL: SOC 2 Type II, data encrypted at rest

---

## Deployment

```bash
git push origin main  # Render auto-deploys in 2-3 minutes
```

- `.renderignore` excludes `docs/`, `salesforce/`, `obsidian-plugin/src/`
- `public/assets/` is in `.gitignore` — use `git add -f public/assets/meeting-prep-helpers.js`
- Plugin updates: `cd obsidian-plugin && npm run build && cd .. && node scripts/build-tailored-vault.js`

---

## What NOT to Do

- Do NOT put regex with `\s`, `\d`, `\n`, `\w`, `\-` inside the template literal in `meetingPrepView.js`
- Do NOT redefine functions that exist in `public/assets/meeting-prep-helpers.js` inside the template
- Do NOT run `node -e` scripts that call `initializeSalesforce()` (competes with Render's service account)
- Do NOT change Salesforce field names or query patterns
- Do NOT add features not explicitly requested
