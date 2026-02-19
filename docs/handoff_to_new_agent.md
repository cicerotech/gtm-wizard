# GTM-Brain Project Handoff — Updated Feb 19, 2026 (Evening)

**DO NOT MODIFY THIS PROJECT WITHOUT EXPLICIT REQUEST.**  
**APPROACH: Surgical improvements only. Production system serving 41+ users.**

---

## CRITICAL IMMEDIATE TASK: Meeting Prep Account Intelligence

The Meeting Prep tab's **Account Intelligence** section shows "Intelligence temporarily unavailable" for ALL meeting cards. The modal opens correctly, attendees render, but the intelligence query to `/api/intelligence/query` is failing silently. This is the #1 priority.

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

1. **Check browser console** — The verbose logging (commit `d92c5ec`) should show exactly where the intelligence query fails. Open the Meeting Prep tab, click a meeting card, open DevTools Console (Cmd+Option+I), and look for `[MeetingPrep]` log lines.

2. **Check Render logs** — Look for errors from `intelligenceQueryService.processQuery()` when the meeting prep calls `/api/intelligence/query`. The most likely issues:
   - Salesforce connection degraded or cold (SF auth expired)
   - The `forceRefresh: true` parameter bypasses cache and hits SF directly, which may fail if connection is unhealthy
   - The account matching (abbreviation map, domain lookup) resolves to wrong accountId

3. **Test the API directly** — Use the GTM Brain tab on the site to query "Tell me about CVC" or "Tell me about Airbnb". If this works but Meeting Prep doesn't, the issue is in how Meeting Prep calls the same API.

4. **Consider removing `forceRefresh: true`** — This was added to get fresh data but may be causing failures when SF connection is cold. Try removing it so the intelligence query can use cached data.

5. **Check the `/api/account/lookup-by-domain` endpoint** — If domain lookup fails silently, the accountId is null, and the intelligence query runs without context (producing "I can't find account data").

6. **Check the `/api/search-accounts` endpoint** — Test with short names like "CVC", "CHS", "AES" directly in the browser: `https://gtm-wizard.onrender.com/api/search-accounts?q=CVC`

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
| `d92c5ec` | Verbose client-side logging for intelligence debugging |
| `246db0a` | Move ALL remaining regex to static helpers — zero backslash in template |
| `4110d09` | Fix regex error in concatKey normalization |
| `4928471` | Meeting Prep intelligence overhaul: matching, query quality, UX cleanup |
| `14d621a` | **ROOT CAUSE**: Remove onclick handlers with `/\\/g` regex |
| `7c47f6e` | Delete 564 duplicate helper functions from template |
| `2d4604f` | Extract client-side helpers to static JS file |
| `dbe2cf6` | Isolated script block with error capture + fallback modal |
| `e3f36cf` | PostgreSQL activation: L2 cache, meeting prep repo, intent persistence |
| `b5371d0` | AI-enabled forecast labels, BL commit data, product mapping, code names |
| `8a02ec4` | Comprehensive fix: forecast, pipeline limits, velocity |

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
