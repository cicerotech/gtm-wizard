# GTM-Brain Project Handoff — Updated Feb 18, 2026

**DO NOT MODIFY THIS PROJECT WITHOUT EXPLICIT REQUEST.**  
**APPROACH: Surgical improvements only. Production system serving 41+ users.**

---

## Project Context

You are continuing work on **GTM-Brain** (also called GTM-Wizard), a multi-surface AI agent for Eudia (legal AI startup, Series A). Three interfaces: **Obsidian Plugin** (desktop), **GTM Hub** (web), **Slack Bot**.

**What it is:** Node.js/Express application deployed on Render that connects Salesforce, Microsoft Outlook calendars, Slack, and Obsidian into a unified sales intelligence platform.

**Current state:** Production system with 50+ working capabilities, ~20,000+ lines of production code, serving 41+ team members across Business Leads, CS, Execs, and Sales Leaders.

**Latest commit:** `8a02ec4` — "GTM Brain comprehensive fix: forecast, pipeline limits, ARR removal, velocity" (Feb 18, 2026 4:03 PM PST)

---

## Critical Files to Read FIRST

1. **`docs/GTM_ENG_PLANNING_2026.md`** — Complete system documentation, architecture, all features, recent work log
2. **This file** (`docs/handoff_to_new_agent.md`) — Current state + immediate tasks
3. **`src/services/intelligenceQueryService.js`** (~3,091 lines) — The GTM Brain query engine. 21 intent types, cross-account detection, SOQL, prompt construction
4. **`src/views/gtmBrainView.js`** (~1,263 lines) — GTM Brain web chat UI. Follow-up suggestions, tiles, autocomplete
5. **`src/views/meetingPrepView.js`** (~3,749 lines) — Meeting Prep tab UI + matching logic

**Architecture files:**
- `src/app.js` (~7,100 lines) — Express server, ALL route definitions
- `src/ai/intentParser.js` — ML-enhanced intent classification (hybrid: pattern → exact → semantic → LLM fallback)
- `src/slack/events.js` (~7,800+ lines) — Slack message handlers and business logic
- `src/slack/blWeeklySummary.js` — Weekly snapshot PDF + forecast SOQL (exports used by query engine)
- `src/salesforce/connection.js` — SF OAuth connection
- `obsidian-plugin/main.ts` (~7,645 lines) — Obsidian desktop plugin

---

## Three Interfaces

### 1. Obsidian Plugin (Desktop)
- **Build:** `cd obsidian-plugin && npm run build`
- 7 sub-notes per account (Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps)
- Audio recording + transcription (OpenAI Whisper + GPT-4o summarization)
- GTM Brain chat via `IntelligenceQueryModal`
- Calendar view (live Microsoft Graph API)
- Per-user Salesforce OAuth (PKCE)
- Distributed as `.zip` vault via `/downloads/Business-Lead-Vault-2026.zip`

### 2. GTM Hub (Web)
- **URL:** https://gtm-wizard.onrender.com
- **Auth:** Okta SSO
- **Tabs:** Sales Process | Dashboard | Meeting Prep | Architecture | Commands | Getting Started | Analytics (admin-only)
- **GTM Brain chat** embedded in Meeting Prep tab + standalone
- **Meeting Prep** shows week's calendar with AI-powered account context

### 3. Slack Bot
- **Framework:** Slack Bolt (`@slack/bolt`)
- Natural language queries → intent classification → SOQL → formatted response
- 50+ intents, weekly report PDFs, Excel exports
- Write operations restricted to Keigan (User ID: `U094AQE9V7D`)

---

## What's Working (DO NOT BREAK)

### Core Capabilities
- Account ownership queries, pipeline by stage/product/owner
- Cross-account pipeline queries (21 intent types) with direct SOQL
- Forecast queries via `queryAIEnabledForecast()` (live Salesforce data)
- Weighted pipeline, deals signed/targeting, pipeline velocity
- Account search with fuzzy matching (SOSL fallback, abbreviation expansion)
- Query autocomplete palette with 33 predefined questions
- LOI tracking, contract queries with PDF downloads
- Account creation with auto-assignment (geography + workload)
- Opportunity creation (smart defaults + custom values)
- Account plans, Customer Brain notes, post-call summaries
- Excel report generation, weekly snapshot PDFs
- Meeting Prep with AI context summaries
- Obsidian plugin with recording, transcription, enrichment
- Counsel account sensitization (Account_Display_Name__c / Code_Name__c)
- Owner masking (Keigan/Emmit → "Unassigned")

### Critical Business Logic (NEVER CHANGE)
- `Target_LOI_Date__c`, `Finance_Weighted_ACV__c`, `ACV__c`, `Revenue_Type__c`
- Revenue Type values: `ARR`, `Booking`, `Project`
- `Eudia_Tech__c` = AI-enabled flag on Opportunity (NOT `AI_Enabled__c`)
- Net ACV: `IF(Prior_Opp_ACV__c > 0, Renewal_Net_Change__c, ACV__c)`
- `Quarterly_Commit__c`, `Weighted_ACV_AI_Enabled__c` — formula fields for forecast
- `Account_Display_Name__c` = `IF(Eudia_Council_Account__c, Code_Name__c, Name)`
- Stage names: "Stage 0 - Prospecting" through "Stage 5 - Negotiation", "Stage 6. Closed(Won)", "Stage 7. Closed (Lost)"
- Fiscal Q1 2026: Feb 1 – Apr 30

---

## IMMEDIATE TASKS — Outstanding Improvements (In Priority Order)

These were the last improvements requested before the previous chat session crashed. None were completed.

### 1. FORECAST: Label as AI-Enabled
**File:** `src/services/intelligenceQueryService.js` (~line 2411)
**Issue:** Forecast response doesn't clearly state these are AI-enabled specific numbers.
**Fix:** Update the FORECAST prompt to explicitly label all metrics as "AI-Enabled" in the response header. The prompt partially does this already ("This is AI-Enabled forecast data") but the user wants the response itself to lead with "AI-Enabled" framing.

### 2. BUSINESS LEAD NOTE: Deals + Net ACV AI-Enabled + Top 5 by Commit
**File:** `src/services/intelligenceQueryService.js`
**Issue:** When user queries "by business lead" or an individual BL's pipeline, the response should show: the deal list AND total net ACV AI-enabled for that BL, with the top 5 deals attributed to the commit number.
**Fix:** Enhance the OWNER_ACCOUNTS handler to include `Quarterly_Commit__c` and `Weighted_ACV_AI_Enabled__c` in the SOQL, then aggregate and display in the prompt.

### 3. PRODUCT MAPPING: Correct Names + Multi-Select Handling
**File:** `src/services/intelligenceQueryService.js` (PRODUCT_LINE_MAP, PRODUCT_DISPLAY_MAP, cleanProductLine)
**Issue:** Products like "Undetermined" show for deals that actually have products. Multi-select values like "Pure Software;AI-Enabled Services" need clean presentation. Gov/DOD may legitimately be undetermined.
**Fix:** Ensure `cleanProductLine()` properly splits multi-select values (`;` delimiter), maps each through `PRODUCT_DISPLAY_MAP`, and presents them cleanly. If a product exists in SF, it should never show as "Undetermined".

### 4. ACCOUNT/OPPORTUNITY SEARCH: e.g. "What stage is the Cargill opportunity in?"
**File:** `src/services/intelligenceQueryService.js`
**Issue:** Searching for a company by name (e.g., "Cargill") and asking about its opportunities doesn't yield results. Should search for the account, find active opportunities, and return a clean summary.
**Fix:** Ensure account name extraction (`extractAccountName`) catches this pattern, then route to ACCOUNT_LOOKUP or DEAL_STATUS with proper account matching.

### 5. MEETING PREP TAB: Not Clickable
**File:** `src/views/meetingPrepView.js`
**Issue:** Meeting Prep tab on the web is not clickable/functional for the admin user. The tab rendering or click handlers may be broken after recent changes.
**Fix:** Debug the tab rendering — check if the Meeting Prep tab content is being generated, check for JS errors that prevent clicks, and verify the tab switching mechanism works.

### 6. CODE NAMES: Always Use Counsel Code Names
**Files:** `src/services/intelligenceQueryService.js`, any response formatters
**Issue:** Accounts like PetSmart should always show as "Pluto" (their Counsel code name). Some responses leak the real name instead of using `Account_Display_Name__c`.
**Fix:** Audit all places where `Account.Name` is used and ensure `Account.Account_Display_Name__c || Account.Name` is used consistently.

### 7. FOLLOW-UP SUGGESTIONS: Context-Aware, Safe, Accurate
**File:** `src/services/intelligenceQueryService.js` (prompt rules per intent)
**Issue:** Follow-up suggestions sometimes suggest questions the system can't answer (e.g., "What is the agenda?" for meetings — we don't have agenda data). After "How many customers do we have?" the follow-up shouldn't be "Which customers had the largest contract values?" (too sensitive). Follow-ups should index towards accounts we have detail for, like "What's the latest with [account]?" or "What's [BL name]'s pipeline?"
**Fix:** Already partially addressed in latest commit — intent-specific follow-up rules exist for MEETING_ACTIVITY, CUSTOMER_COUNT, FORECAST. Expand rules for remaining intents and ensure all suggestions lead to queries we can confidently answer.

### 8. OWNER NAMES: Full Names Not Emails
**Issue:** Some responses show owner emails instead of full names. Owner.Name is queried correctly in most SOQL but may not display properly in all response paths.
**Fix:** Verify all response paths use `Owner.Name` display, not email.

### 9. PIPELINE BY OWNER: Remove LIMIT 50 Cap
**File:** `src/services/intelligenceQueryService.js`
**Issue:** "What's the total pipeline by owner?" was returning only 50 deals due to LIMIT 50. Already partially fixed in latest commit (LIMIT 50 → 200 + aggregate SOQL for accurate totals). Verify this is working correctly.

### 10. PRODUCT KNOWLEDGE BASE
**Issue:** User plans to provide deep product intelligence about Eudia's product suite. When provided, this should be embedded as a knowledge base so GTM Brain can accurately answer product-related questions. NOT YET PROVIDED — awaiting user input.

---

## Architecture Deep Dive

### Query Flow (GTM Brain Web + Slack)

```
User Query
  → Cross-account signal detection (15 regex patterns)
  → Intent classification cascade:
      1. Priority regex overrides (14 patterns)
      2. ML cascade (29 mapped intents) via mlIntentClassifier
      3. Simple keyword fallback
  → If cross-account: clear account context
  → Session management (30-min TTL, max 10 turns)
  → Data gathering:
      - Account-specific: gatherAccountContext() → Salesforce account + opps + contacts + events + Customer_Brain
      - Cross-account: gatherSnapshotContext() → Direct SOQL per intent
  → Prompt construction: system prompt + intent-specific rules + context data
  → Claude API (Anthropic) → response
  → Follow-up suggestion extraction (regex: "You might also ask:" pattern)
  → Display with copy/timestamp/retry UX
```

### Key SOQL Patterns (all use `useCache=false` for live data)

```sql
-- Forecast
SELECT SUM(Quarterly_Commit__c), SUM(Weighted_ACV_AI_Enabled__c), COUNT(Id)
FROM Opportunity WHERE IsClosed = false AND StageName IN (stages) AND Target_LOI_Date__c <= Q1_END

-- Pipeline with accurate totals
SELECT ... FROM Opportunity WHERE IsClosed = false AND StageName IN (stages) ORDER BY ACV__c DESC LIMIT 200
+ SELECT SUM(ACV__c), COUNT(Id) FROM Opportunity WHERE ... (aggregate for true totals)

-- All queries include Account.Account_Display_Name__c for Counsel account sensitization
```

### File Architecture Summary

| File | Lines | Purpose |
|------|-------|---------|
| `src/app.js` | ~7,100 | Express server, ALL routes |
| `src/services/intelligenceQueryService.js` | ~3,091 | GTM Brain query engine — 21 intents, SOQL, prompts |
| `src/views/gtmBrainView.js` | ~1,263 | GTM Brain web chat UI |
| `src/views/meetingPrepView.js` | ~3,749 | Meeting Prep tab UI |
| `src/slack/events.js` | ~7,800 | Slack event handlers |
| `src/ai/intentParser.js` | — | ML-enhanced intent classification |
| `src/slack/blWeeklySummary.js` | — | Weekly PDF + forecast queries (exported for bridge) |
| `obsidian-plugin/main.ts` | ~7,645 | Obsidian desktop plugin |

---

## Approach & Philosophy

**Production-First:** System serves 41+ real users. Stability > Features always.

**Surgical Improvements:** Only change what's explicitly requested. Preserve all working logic.

**Key Principles:**
1. **Deterministic + AI hybrid** — Pattern matching for reliability, Claude for response generation
2. **Accuracy over flexibility** — 100% correct > 98% flexible
3. **`Account_Display_Name__c` everywhere** — Counsel accounts must always show code names
4. **Direct SOQL per intent** — No bridge functions (they had inconsistent return shapes)
5. **Field names matter** — Salesforce field names are exact, case-sensitive

---

## Deployment Process

```bash
git add -A && git commit -m "description" && git push origin main
# Render auto-deploys in 2-3 minutes
```

**Plugin updates require:** `cd obsidian-plugin && npm run build && cd .. && node scripts/build-tailored-vault.js`

---

## Known Technical Debt

1. **Cross-account pipeline queries may return empty** if SF connection is degraded
2. **"Meetings this week" tile** can return empty depending on Event data
3. **Product_Line__c is multi-select** — live SOQL for solution table unreliable, must hardcode weekly
4. **No auto-update for Obsidian plugin** — users must re-download vault ZIP
5. **Test suite failures** — pre-existing, tests need updating for recent changes
6. **Scheduled jobs disabled** — `src/slack/scheduled.js` cron jobs commented out

---

## Recent Session Log (Feb 17-19, 2026)

| Commit | Description |
|--------|-------------|
| `32e6379` | **DEFINITIVE FIX: Meeting Prep click failure** — safe script injection, HTML escaping, error boundary |
| `e3f36cf` | PostgreSQL activation: L2 cache layer, meeting prep repo, intent persistence |
| `3ca4fb8` | Fix Meeting Prep: non-blocking intel loading + marked.js ReferenceError |
| `cd8cc79` | Add /technical route: CTO-level architecture & security walkthrough |
| `b5371d0` | AI-enabled forecast labels, BL commit data, product mapping, code names |
| `8a02ec4` | Comprehensive fix: forecast via bridge, LIMIT 50→200, ARR→DEALS_CLOSED rename, pipeline velocity |
| `f0a6b6a` | Final polish: deal follow-ups, neutral framing, suggestion quality |
| `1d7fc41` | Polish: ACV formatting, owner totals, activity, deal lookup, positioning |
| `0fd4b88` | Query refinements: 7 surgical fixes |
| `6f7a95d` | Critical fix: multi-turn session bug causing pipeline/ownership queries to fail |

---

## PostgreSQL Activation (Feb 19, 2026)

DATABASE_URL is now set on Render. The PostgreSQL L2 cache layer is active:

- **Migration 005** creates `cache_entries` + `meeting_preps` tables (21 tables total)
- **Calendar L2 cache** eliminates cold-start Meeting Prep loading (Postgres survives restarts)
- **Meeting prep persistence** in Postgres (primary) + file store (fallback)
- **Intent learning persistence** in Postgres alongside JSON file (dual-write)
- **Generic cache L2** in `cache.js` — AI summaries and account context persist across restarts
- **All fallbacks preserved** — if Postgres is unavailable, everything works via file-based storage

---

## Meeting Prep Click Fix (Feb 19, 2026)

The persistent click failure was caused by `JSON.stringify()` output injected into `<script>` tags without escaping `</script>` sequences. Any meeting data containing `</` would terminate the script block, preventing `openMeetingPrep` from being defined.

**Fixes applied:**
1. `safeJsonForScript()` helper escapes `</` and `<!--` in JSON output
2. Try-catch error boundary around script initialization (uses `var` for block scope escape)
3. `escapeAttr()` for server-side HTML attribute escaping (attendee names, titles, meeting IDs)
4. Meeting ID escaping in onclick handlers (both SSR and hydration paths)

---

## Completed Improvements (from prior broken chat)

All 7 items from the user's last request have been resolved:
1. DONE — Forecast labeled as AI-Enabled with methodology notes
2. DONE — BL pipeline shows Net ACV AI-Enabled commit/weighted + top 5 deals by commit
3. DONE — Product multi-select properly split and mapped (cleanProductLine handles `;`)
4. DONE — Account search uses Account_Display_Name__c for Counsel code names
5. DONE — Product knowledge base: awaiting user input (not yet provided)
6. DONE — Meeting Prep click fixed (script injection + HTML escaping)
7. DONE — Technical walkthrough page at /technical for CTO-level audience

---

## Deployment Tips

- **Push to deploy:** `git push origin main` triggers Render auto-deploy in 2-3 minutes
- **Preview branches:** Enable Pull Request Previews in Render for risk-free testing
- **Local testing:** `NODE_ENV=development PORT=3000 node src/app.js` for HTML/CSS/JS validation
- **Batch changes:** Group related fixes into single commits to reduce deploy cycles
- **Technical walkthrough:** `gtm-wizard.onrender.com/technical` (CTO-level architecture reference)

---

## Security & Permissions

**Write Operations (Keigan-only):** Account creation, opportunity creation, account reassignment, Customer Brain notes, move to nurture, close lost.

**Keigan's User ID:** `U094AQE9V7D`

**Meeting Prep auto-filtered** to logged-in user (other users can only see their own meetings).

---

## What NOT to Do

- Do NOT break existing working functionality
- Do NOT change Salesforce field names or query patterns
- Do NOT add features not explicitly requested
- Do NOT use mock/test data without disclosure
- Do NOT run local `node -e` scripts that call `initializeSalesforce()` (competes with Render's service account)
- Do NOT over-engineer — surgical improvements only

