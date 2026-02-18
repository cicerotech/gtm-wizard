# GTM Brain — Session Handoff (Feb 18, 2026)

## Session Summary

Massive development sprint across 6 plans. Multiple provider errors interrupted the final work, leaving several changes incomplete or unverified. This handoff captures the **exact state** so the next session can pick up cleanly.

---

## What Was Built / Changed Today

### 1. Full-Call Audio Recording (Obsidian Plugin)
**Status: Code committed, needs real-call testing**
- Removed broken `getDisplayMedia` code path from `AudioRecorder.ts`
- Added `captureMode` setting (`full_call` / `mic_only`) with echo cancellation toggle
- Added virtual audio device detection (`detectVirtualAudioDevice()` using `enumerateDevices()`)
- Added dual-stream mixing (physical mic + virtual device via Web Audio API)
- Added settings UI for capture mode, device selector, and test recording button
- Commit: `10027e3` (v4.5.0)

**Key limitation:** In `full_call` mode without a virtual audio device, the user MUST use laptop speakers (not headphones) for the mic to pick up the other person's voice.

### 2. Transcription Output Quality (Obsidian Plugin)
**Status: Code committed, needs testing**
- Added `emailDraft` to `ProcessedSections` TypeScript interface
- Added `Key Quotes` and `Discussion Context` sections to sales template
- Updated email draft prompt for BL framing (peer tone, not exec supplicant)
- Fixed transcript rendering (`text || transcript` fallback)
- Commit: `ccec276` (v4.5.1)

### 3. Meeting Prep Intelligence Overhaul
**Status: Code committed, bugs found and patched in this follow-up**
- Unified to single-path architecture: intelligence query is the ONLY data source
- Sequential account resolution: card data → domain lookup → account search → intelligence query
- Eliminated the dual-path race condition (meetingContextService vs intelligenceQueryService)
- Commit: `8ce3599`

**Bugs found and fixed in this follow-up session:**
- `meetingPrepView.js` line 2874: regex `\\n` → `\n` (wasn't replacing newlines in fallback rendering)
- `meetingPrepView.js` line 2860: condition checked `accountName` instead of `owner` for displaying Owner metadata

### 4. GTM Brain Query Refinements
**Status: Code committed, user reported still not working for some queries**
- Added date parsing to PIPELINE_OVERVIEW (month names, `this quarter`, Q1)
- Defined `FISCAL_Q1_START`/`FISCAL_Q1_END` constants (Feb 1 – Apr 30)
- Added `PRODUCT_DISPLAY_MAP` + `cleanProductLine()` for clean product names
- Added MEETING_ACTIVITY intent routing priority (before PIPELINE_OVERVIEW)
- Added close/closing/sign intent routing to DEALS_TARGETING
- Commit: `44504b4`

### 5. GTM Brain Pipeline Fix
**Status: Code committed, was the core "$0 pipeline" issue**
- Added `ensureSalesforceConnection()` reusable helper
- Called at top of `gatherPipelineContext()`, `gatherSnapshotContext()`, `findAccountByName()`
- Routed PIPELINE_OVERVIEW through `gatherSnapshotContext` (proven working SOQL path)
- Added stage-semantic mapping, product line filtering, prospecting filters
- Added error surfacing in prompt builder (no more silent "$0" reporting)
- Commits: `745998b`, `582b8a7`, `54be947`, `1e496c6`, `cc3b34b`

### 6. Production Hardening
**Status: Partially committed**
- `ensureSalesforceConnection()` added to all query paths
- Null-safety (optional chaining) added to `gatherContext()`
- Salesforce ID format validation added
- Rate limiting on `/api/intelligence/query` (30/min per user)
- Health check endpoint at `/api/health`
- Commit: `582b8a7`

**Not yet done from production hardening plan:**
- PostgreSQL query_logs table and migration
- Feedback migration from JSON to PostgreSQL
- Feedback analytics endpoint

---

## Fixes Applied in This Follow-Up Session (Post Provider Errors)

1. **`/api/search-accounts` — SF connection health check**
   - `src/routes/emailBuilder.js`: Added `ensureSfConnection()` — search would silently fail on cold starts
   - Also added `Account_Display_Name__c` to WHERE clause so codename search works

2. **`/api/account/lookup-by-domain` — SF connection health check**
   - `src/app.js`: Added SF availability check + reconnection before domain lookup SOQL

3. **`meetingPrepView.js` — regex and logic bugs**
   - Line 2874: `\\n` → `\n` for proper newline replacement in fallback rendering
   - Line 2860: Changed condition from `queryContext.accountName` to `queryContext.owner`

---

## What's Still Broken / Needs Verification

### HIGH PRIORITY — Verify after this push deploys to Render (~3 min):

1. **Account search in GTM Brain tab**
   - Test: Type "Airbnb" or "CHS" in the account search bar
   - Expected: Account appears in typeahead results
   - Root cause fixed: SF connection wasn't being checked before search SOQL ran

2. **Pipeline queries returning $0 / 0 deals**
   - Test: Ask "What deals are late stage?" or "What's the total pipeline?"
   - Expected: Returns actual deal data with stage breakdown
   - Root cause fixed: `ensureSalesforceConnection()` now called before all pipeline SOQL
   - If still failing: Check Render logs for SF connection errors — may need environment variable refresh

3. **"Cannot access models" crash**
   - This was an Anthropic API connectivity issue, not a code bug
   - Verify `ANTHROPIC_API_KEY` environment variable is set on Render
   - Test: Ask any question in GTM Brain tab
   - If failing: Check Render dashboard for deploy errors or environment variable issues

### MEDIUM PRIORITY — Functional testing needed:

4. **Meeting Prep intelligence matching**
   - Test: Click a meeting card (e.g., Gilead, CHS, Airbnb) in Meeting Prep tab
   - Expected: Account Intelligence section shows context from GTM Brain query
   - Test accounts: KLA (`kla.com`), Airbnb, PetSmart, an account with codename
   - Watch for: "I don't have specific account data" (means `findAccountByName` failed)

5. **Date-filtered pipeline queries**
   - Test: "Which deals close in February?" → should return deals with Target_LOI_Date in Feb
   - Test: "What's targeting this quarter?" → should return Q1 (Feb 1 – Apr 30) deals
   - Test: "Late stage contracting deals" → should filter by stage AND product line

6. **Meetings this week tile**
   - Test: Click "Meetings this week" suggested tile
   - Expected: Returns list of accounts with meetings this week from calendar cache
   - If failing: Calendar cache may be cold — check if Sunday cron ran

7. **Product line display**
   - Test: Ask any pipeline query
   - Expected: Product names show clean labels (e.g., "AI Contracting (Managed)") not raw SF values

### LOWER PRIORITY — Future work:

8. **PostgreSQL feedback loop** (from Production Hardening plan, Tier 2)
   - `query_logs` table for tracking every GTM Brain query
   - `feedback` table linked to query_logs
   - Analytics endpoint for quality monitoring

9. **Audio Setup Wizard** (from Full-Call Recording plan, Phase 3)
   - Guide users through BlackHole/VB-Cable installation
   - OS detection, step-by-step instructions, verification

10. **Speaker Diarization** (from Full-Call Recording plan, Phase 4)
    - Pre-transcription audio quality check
    - Wire `callIntelligence.js` into standard transcription flow
    - Speaker-labeled transcript formatting

---

## Key Files Modified Today

| File | Changes |
|------|---------|
| `src/services/intelligenceQueryService.js` | ensureSalesforceConnection, classifyQueryIntent improvements, gatherSnapshotContext date/stage/product filters, FISCAL_Q1 constants, PRODUCT_DISPLAY_MAP, cleanProductLine, error surfacing |
| `src/views/meetingPrepView.js` | Single-path architecture, sequential resolution, regex fix, owner logic fix |
| `src/routes/emailBuilder.js` | SF connection check on search, Account_Display_Name__c in WHERE clause |
| `src/app.js` | SF connection check on domain lookup, rate limiting, health check |
| `obsidian-plugin/src/AudioRecorder.ts` | captureMode, virtual device detection, dual-stream, echo cancellation toggle |
| `obsidian-plugin/main.ts` | captureMode setting, device selector UI, recording notices |
| `src/services/transcriptionService.js` | Key Quotes, Discussion Context, email draft improvements |

---

## Deploy Steps

All code is on `main` branch, pushed to `origin/main`. Render auto-deploys.

1. Wait ~3 min for Render deploy
2. Verify with: `curl https://[your-render-url]/health` — should return `{ status: "ok", salesforce: { connected: true } }`
3. Test the high-priority items above in order
4. If Salesforce shows `connected: false`, the connection may need a manual trigger — visit `/api/health` in browser

---

## Architecture Notes for Next Session

- **Pipeline queries** now route through `gatherSnapshotContext()` (not `gatherPipelineContext()`). The snapshot path was more reliable because it runs direct SOQL instead of going through the weekly snapshot bridge functions.
- **Meeting Prep** uses a single intelligence query path. The old dual-path (meetingContextService + intelligenceQueryService in parallel) was eliminated to fix the race condition.
- **Account search** uses 3 strategies: LIKE match → hyphen/space variants → SOSL fuzzy search. All now check SF connection health first.
- **Codenames** (`Account_Display_Name__c`) are used in all display contexts: search results, dashboard, pipeline queries, meeting prep.
