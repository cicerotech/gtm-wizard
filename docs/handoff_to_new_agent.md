# GTM Engineering Q1 FY26 — Project Handoff

**Updated: February 26, 2026**
**DO NOT MODIFY THIS PROJECT WITHOUT EXPLICIT REQUEST.**
**APPROACH: Surgical improvements only. Production system serving 41+ users.**

---

## Project Overview

GTM-Brain (GTM-Wizard) is a multi-surface GTM Engineering platform for Eudia (legal AI startup, Series A). It connects Salesforce, Microsoft Outlook, Slack, and Obsidian into a unified revenue operations system.

| Item | Value |
|------|-------|
| GitHub | `cicerotech/gtm-wizard` (private) |
| Production | https://gtm-wizard.onrender.com |
| Host | Render.com (auto-deploy on push to main) |
| Slack Bot | GTM Brain in Eudia workspace |
| Auth | Okta SSO (web), SF OAuth PKCE (plugin) |
| Database | PostgreSQL on Render + file fallback |
| Technical Walkthrough | `/technical` route |

---

## Current Systems & State

### 1. Obsidian Sales Workspace — "Eudia Lite" (v4.9.7)

Desktop tool for all Business Leads. Electron-based Obsidian plugin.

**Capabilities:**
- Two-way meeting transcription (mic + system audio via 6-strategy Electron fallback chain)
- Pre-meeting intelligence briefs pulled live from Salesforce (contacts, deal history, account context)
- Account-specific AI context within each meeting note
- CS-specific transcription format with quotable moments
- Meeting note templates (Sales Discovery/MEDDIC, Demo/Presentation, Customer Success, General Check-In, Internal Call)
- Slack Copy command (Cmd+P > "Copy Note for Slack")
- Audio safety net (saves recording to vault before server upload, double-write with retry)
- Silent auto-update (zero user action required for v4.4.0+)
- Calendar view with external-only filter and past meeting scrollback
- Auto-correct dark theme to light on startup (ensureLightTheme)
- Auto-correct read-only mode to editable Live Preview (ensureEditableMode)
- Prospect account folders with Salesforce contact enrichment

**Architecture:**
- Plugin source: `obsidian-plugin/main.ts` (~9,800 lines) + `obsidian-plugin/src/AudioRecorder.ts`
- Build: `cd obsidian-plugin && npm run build` (esbuild, <1s)
- Served via `/api/plugin/main.js`, version check at `/api/plugin/version`
- Vault structure: accounts (prospect/active split), 7 sub-notes per account
- Per-user Salesforce OAuth (PKCE) for plugin writes
- Auto-update checks on `onload()` (5s + 3min + every 10min), downloads new files if version is higher
- Plugin update page at `/update-plugin` (Mac Terminal + Windows PowerShell copy-paste commands)
- Install scripts: `/api/plugin/install.sh` (Mac), `/api/plugin/install.ps1` (Windows)

**Changes made Feb 26, 2026 (this session):**
- Renamed plugin from "Eudia Transcription Plugin" to "Eudia Lite"
- Fixed dark theme bug: dynamic vault generator was setting theme "obsidian" (dark) instead of "moonstone" (light)
- Fixed prospect contacts: enrichment was async/background and failing silently; now synchronous
- Fixed auto-enrich scanner to include _Prospects/ folder (was skipping it)
- Fixed prospect accounts not added to cachedAccounts (auto-enrich couldn't match them)
- Fixed headphone/AirPods audio: removed preemptive mic_only switch; now attempts system audio capture first
- Fixed note editing: added defaultViewMode: source + livePreview: true to app.json
- Fixed false "Transcription failed" banner: post-processing errors (SF sync, Next Steps) no longer trigger error banner when transcription content was already written successfully
- Added plugin auto-update bootstrap for v4.0.x-4.3.x users (install.sh/install.ps1 commands, /update-plugin page)
- Removed all python3 dependencies from install scripts (was triggering Xcode install on fresh Macs)
- All install scripts auto-close Obsidian after update
- Hardened auto-update: 5 retries, 10-min periodic check, secondary 3-min startup check
- Removed duplicate Express route registrations for plugin files and telemetry
- Merged PostgreSQL persistence into primary telemetry route

**CRITICAL KNOWN ISSUES (must fix next session):**
1. **Audio chunking failures on 29-min calls**: Chunked transcription (>15MB) fails chunks 2-4 of 4. Server timeout or Render request limit issue. Must investigate `/api/transcribe-chunk` endpoint and chunk size/timeout.
2. **Account overload for BLs**: Riley and Sean see ALL 699 accounts. Their owned/prospect accounts (~50-80) are buried in _Prospects subfolder. Need to restructure: show ONLY their accounts at the top level, remove unrelated accounts.
3. **Calendar-to-account matching broken for prospects**: Meeting notes created from calendar don't smart-log under the correct prospect account folder. Yahoo meeting → note doesn't go under Yahoo. Matching logic needs to check _Prospects/ subfolders, not just top-level Accounts/.
4. **macOS permission flow broken**: Plugin's "Open System Settings" redirects to Siri settings instead of Microphone/Screen Recording. Users think they granted permission but didn't. Need explicit step-by-step permission guide with validation.
5. **Multi-vault install script**: `install.sh` picks the first vault found; users with multiple vaults (old downloads, test vaults) get the wrong one updated. Need selection prompt when count > 1.
6. **Deal Code field label**: Renamed from "BOI Deal Code" to "Deal Code" in metadata but SFDX deploy showed "Unchanged" — may not have propagated to org. Need to verify via API.
7. **Build script doesn't auto-build plugin**: `scripts/build-tailored-vault.js` copies main.js but doesn't run `npm run build` first. Risk of shipping stale compiled code.

**Users currently set up on v4.9.7:**
- Sean Boyd (sean.boyd@eudia.com) — tested, working
- Riley Stack (riley.stack@eudia.com) — vault at `/Users/rileystack/Downloads/Business-Lead-Vault-2026`, has old `Eudia-Sales-Vault` in Documents (should be deleted)
- Rajeev Patel — setup attempted, hit python3/Xcode issue (now fixed)
- Greg MacHale (greg.machale@eudia.com) — PC user, v4.1.0, needs PowerShell update via /update-plugin

**Users NOT yet updated (still on old versions, no auto-update):**
- Any user on v4.0.x - v4.3.x must use Terminal/PowerShell command from `/update-plugin`

### 2. GTM Brain Conversational AI

Natural language Salesforce assistant accessible via Slack and the Obsidian plugin.

**Capabilities:**
- 21+ cross-account intent types with direct SOQL
- Multi-turn chat with Claude-style UX
- Account search with fuzzy matching (SOSL fallback, abbreviation expansion)
- Forecast, pipeline, deals signed/targeting, pipeline velocity
- Account-specific queries (contacts, opportunities, events, competitive landscape)
- Counsel account sensitization (Account_Display_Name__c / Code_Name__c)
- Follow-up suggestion quality controls per intent type
- Feedback system with reaction-based learning

**Key Files:**
- `src/services/intelligenceQueryService.js` (~3,100 lines) — Query engine, 21 intents, SOQL, prompts
- `src/ai/intentParser.js` (~1,500 lines) — Message to intent classification
- `src/views/gtmBrainView.js` (~1,260 lines) — Web chat UI

### 3. Weekly Snapshot PDF

Friday report to leadership. Generated via PDFKit, delivered through Slack.

**Current format (2 pages):**

Page 1 — RevOps Summary:
- Q1 FY26 Forecast (Target, Commit, Weighted, Midpoint) with WoW % change (gray italic)
- Signed Revenue Q1 (QTD total + last week breakdown with full product line names)
- Q1 FY26 Pipeline Opportunities (two tables: Targeting February, Targeting Q1 Top 10) — company name first, ACV, product line on second row
- Q1 Pipeline by Sales Type (ACV with % distribution, count)
- Q1 Pipeline by Product Line (Pipeline with % distribution, Late Stage count)

Page 2 — GTM Snapshot:
- Pipeline Overview (Total Gross ACV, AI-Enabled Midpoint, Avg Deal Size, Current Logos)
- Stage Distribution with WoW % change column (gray italic, centered)
- Targeting This Month green box (deal name, ACV, date + product line beneath)
- Business Lead Summary (US Pod, EU Pod — accounts, opps, gross, commit)
- Top Deals by Business Lead

**Key File:** `src/slack/blWeeklySummary.js` (~3,100 lines)

**Manual deal overrides** (line ~2854): Temporary additions not yet in Salesforce. Currently includes Donald $25k under Olivia Jung. Remove once recorded as Closed Won in SF.

**Snapshot WoW comparison:** Uses `data/bl-snapshots.json`. Function `getLastSnapshotDate()` excludes the current date to avoid comparing against today's own data. Hardcoded prior week stage ACV values as fallback when no prior snapshot exists.

**Date handling:** Uses `America/Los_Angeles` timezone (not UTC) to match the team's working day.

**Product line resolution:** `resolveProductLine()` function uses `Product_Lines_Multi__c` (multi-select) instead of `Product_Line__c` (which returns "Multiple" for multi-product deals).

**Triggering:**
- Slack: `@gtm-brain send weekly snapshot` in any channel — sends to that channel
- HTTP test: `curl localhost:3000/send-bl-summary-test` — sends to Keigan's DM
- HTTP prod: `curl localhost:3000/send-bl-summary-prod` — sends to #gtm-account-planning

### 4. Pipeline Review Center (Salesforce LWC — v2.2)

Live Salesforce dashboard for pipeline management.

**Capabilities:**
- Per-BL pipeline grouped by owner with expandable deal rows
- Header metrics: Q1 Commit (original baseline) | Current Commit | BL Forecast | In-Qtr | AI | Won QTD
- Q1 FY26 baseline constants per pod and per BL for WoW delta tracking (from Feb 2, 2026 workbook snapshot)
- Commit and Weighted delta drill-down sections (expandable)
- Won QTD section: Closed Won deals in current fiscal quarter via `getClosedWonQTD()`
- BL quick-nav sidebar for jumping between business leads
- WoW Forecast Category tracking (deals moving in/out of Commit)
- Inline edit: Next Steps, Products, Stage, ACV, Target Sign Date
- Product edit via multi-select checkbox group (12 product options)
- Changes Only toggle is display-only (never recalculates aggregate metrics)

**Key Files:**
- `salesforce/force-app/main/default/classes/PipelineReviewController.cls`
- `salesforce/force-app/main/default/lwc/pipelineReviewCenter/`

**Header calculation:**
- Q1 Commit = static baseline from `Q1_BASELINES` (verified from Q1_2026_Forecast_Workbook). Update at Q2 start.
- Current Commit = sum of ACV for Commit-category deals targeting current fiscal quarter
- BL Forecast = sum of `BL_Quarterly_Forecast__c` (Quarterly Forecast Net for all deals)
- In-Qtr = BL Forecast narrowed to deals targeting Q1
- AI = In-Qtr filtered to AI-enabled deals only (`Eudia_Tech__c = true`)
- Won QTD = Closed Won deals via `getClosedWonQTD()` Apex method

**SF formula fields used:**
- `BL_Quarterly_Forecast__c` — Quarterly Forecast Net (replaces Blended_Forecast_base__c for header)
- `AI_Enabled_Quarterly_Forecast_Net__c` — AI-enabled quarterly forecast
- `Weighted_ACV_AI_Enabled__c` — Weighted ACV (AI-enabled, net, stage-probability)
- Q1 snapshot fields: `Q1_2026_Commit_Snapshot__c`, `Q1_2026_ACV_Snapshot__c`, `Q1_2026_Forecast_Category_Snapshot__c`

**Per-BL baselines (Q1_COMMIT_BY_BL):** Static map in LWC JS with per-BL commit values from Feb 2 workbook. Used for delta display. Must be updated at Q2 start.

### 5. Customer Success Dashboard (Salesforce LWC)

**Capabilities:**
- Outcomes tab: structured JSON outcomes (Delivered / In Delivery / Near-Term) parsed from `CS_Outcome_Data__c`
- 67 outcomes populated across 38 accounts
- Late-Stage Pipeline tab: deals with `CS_Staffing__c = true`
- CS Staffing Handover modal on Opportunity record page — rich context from `CSStaffingController.getStaffingContext()`

**CS Staffing Modal (rewritten Feb 23-24):**
- Triggered by banner when `CS_Staffing_Flag__c = true` (set by CS_Staffing_Alert flow at Stage 4+)
- Deal summary header (account name, ACV, stage, term)
- Contact role chips: click-to-add from Account contacts above stakeholder text area
- Per-product term/price table from OpportunityLineItem data with TCV column for multi-year deals
- CSM intelligence: surfaces assigned CSM from `Account.CSM__c`
- Varying term detection with range label
- Fields: Key Stakeholders, Products (dual listbox), Commercial Terms, Contract Term, Auto-Renew, Customer Goals

**Key Files:**
- `salesforce/force-app/main/default/classes/CSHomeController.cls`
- `salesforce/force-app/main/default/classes/CSStaffingController.cls`
- `salesforce/force-app/main/default/lwc/csHomeDashboard/`
- `salesforce/force-app/main/default/lwc/csStaffingModal/`

**CS Staffing fields:** Both `CS_Staffing__c` and `CS_Staffing_Flag__c` exist. The flow sets both to true at Stage 4+. The LWC watches `CS_Staffing_Flag__c` for the banner trigger.

### 6. Target Pool Center (Salesforce LWC — v5)

Account management dashboard with three tabs for BL book management and targeting.

**Tab 1 — Account Distribution:**
- Per-BL account counts grouped by US Pod / EU Pod
- Columns: Q1 Book, Front Book (active pipeline or existing customer), Back Book (prior engagement/cold)
- Tier 1 Exec and Tier 2 BL counts per BL
- Click BL row to expand → shows all assigned accounts with sort, geo/industry summary
- Outreach tier toggle: T1/T2 buttons per account (T1 capped at 15 per BL)
- Drop and Transfer actions per account

**Tab 2 — Target Pool:**
- Unassigned accounts available for claim (pod-restricted: US BLs claim US Pod, EU BLs claim EU Pod)
- Filters: Tier (revenue-based: T1=$10B+, T2=$3-10B, T3=under $3B), Pod, Industry, State, Search
- Sortable columns (account, industry, revenue, HQ state, positioning)
- Scorecard summary row (total accounts, by tier, by pod)
- Claim and Assign actions

**Tab 3 — Weekly Focus (Top of Funnel):**
- `TopOfFunnelController.cls` — Back-book activity metrics per BL
- Tasks on back-book accounts, accounts touched, new opps created this quarter
- Per-BL summary with stage distribution (S0/S1/S2)
- New opp table (expandable)

**Key Files:**
- `salesforce/force-app/main/default/classes/TargetPoolController.cls` (v5)
- `salesforce/force-app/main/default/classes/TopOfFunnelController.cls`
- `salesforce/force-app/main/default/lwc/targetPoolCenter/`

**Industry grouping:** 18 consolidated industry groups mapped from ~100+ raw Salesforce industry values. Defined as static `INDUSTRY_GROUPS` in the LWC JS. Also available as `data/industry_group_mapping.csv` (502 companies mapped).

**State normalization:** `STATE_NORMALIZE` static map converts abbreviations to full state names.

**BL capacity:** Per-BL account caps defined in `BL_CAPS` (Ramped=60, BDRs=85, default=100).

**Account_Pool_Sync Flow:** When account ownership changes and `In_Target_Pool__c = true`, auto-sets `In_Target_Pool__c = false` and `Q1_Target_Book__c = true`.

### 7. Account Scoring Engine

**Completed artifacts:**
- `data/f500_prioritization.csv` — 500 F500 companies scored (composite: legal spend 50%, CLO warmth 30%, AI/industry fit 20%)
- `data/f500_prioritization_enriched.csv` — Enriched with CLO names, AI-forward signals, Salesforce overlap
- `data/F500_Raw_Data.xlsx` — Excel with formula-driven scores, assumption tables, distribution sheet
- `data/non_f500_top50_prioritized.csv` — Top 50 non-F500 companies (mid-market, private, international)
- `data/non_f500_candidates_master.json` — 72 researched candidates
- `scripts/build_non_f500_top50.py` — Reproducible scoring script
- `data/f500_legal_spend_multipliers.csv` — 65 industry categories mapped to legal spend % of revenue

### 8. Meeting Prep Intelligence

Pre-meeting briefing on the web dashboard and Obsidian plugin.

**Architecture:**
1. Click handler reads `data-meeting-id` from DOM
2. Account resolution: domain lookup > name search > abbreviation map > SOSL fuzzy
3. Intelligence query via `POST /api/intelligence/query` with accountId
4. Response rendered as markdown HTML

**Critical rule:** NEVER put regex with backslash sequences (`\s`, `\d`, `\n`, `\w`) inside the template literal in `meetingPrepView.js`. All regex patterns must go in `public/assets/meeting-prep-helpers.js` (static file).

**Key Files:**
- `src/views/meetingPrepView.js` (~3,200 lines)
- `public/assets/meeting-prep-helpers.js` (~380 lines)

### 9. Opportunity Creator (Salesforce LWC)

Quick opportunity creation component deployed on the New_Opportunity_Creator flexipage.

**Capabilities:**
- Account search with fuzzy matching
- Default stage: Stage 0 - Prospecting
- Default product line: Undetermined (can multi-select others)
- Pod auto-detection via `getDefaultPod()` (US/EU based on logged-in user)
- Target sign date defaults to 100 days from now
- ACV defaults to $100K
- Opportunity source selection (Inbound/Outbound)

**Key Files:**
- `salesforce/force-app/main/default/classes/AccountLookupController.cls`
- `salesforce/force-app/main/default/lwc/opportunityCreator/`

### 10. Account Highlights Panel (Salesforce LWC)

Account record page header component showing key account metadata.

**Capabilities:**
- Account health badge, revenue, industry
- Info Request button (sends to Slack)
- Edit and Delete actions via menu (delete with confirmation dialog)

**Key Files:**
- `salesforce/force-app/main/default/lwc/accountHighlightsPanel/`

### 11. Salesforce Configuration

**Custom objects/fields deployed:**
- Opportunity: TCV__c, TCV_Calculated__c (formula: `ACV * MAX(1, Term/12)`), Term__c, BOI_Deal_Code__c, CS_Staffing_Flag__c, CS fields (CSM_Requested__c, CS_Key_Stakeholders__c, CS_Products_Purchased__c, CS_Commercial_Terms__c, CS_Contract_Term__c, CS_Auto_Renew__c, CS_Customer_Goals__c, CS_Commercial_Notes__c), Q1 snapshot fields (Q1_2026_Commit_Snapshot__c, Q1_2026_ACV_Snapshot__c, Q1_2026_Forecast_Category_Snapshot__c)
- Account: CS_Outcome_Data__c, CS_Outcomes__c, In_Target_Pool__c, Target_Pod__c, Q1_Target_Book__c, Industry_Grouping__c, Company_Revenue__c, Outreach_Tier__c, Pool_Context__c, State__c
- Campaign: Content_Type__c, Cost_Per_Lead__c, Event fields, Funnel_Stage__c, ROI__c, Target_Industry__c, Seniority_Level__c, Type__c
- BOI_Counter__c: custom object with Next_Number__c for auto-generated deal codes
- Product_Feedback__c: custom object with Account__c, Feedback_Type__c, Priority__c, Product_Area__c, Raw_Message__c, Slack_Message_Link__c, Slack_Message_Ts__c

**Flows:**
- Account_Health_History_On_Update (API 60.0, After Save context, uses `$Record__Prior`)
- CS_Staffing_Alert (fires at Stage 4+: sets CS_Staffing__c AND CS_Staffing_Flag__c, creates Task for BL)
- Account_Pool_Sync (on ownership change: if In_Target_Pool__c was true, sets it false and Q1_Target_Book__c true)

**Triggers:**
- OpportunityLineItemTrigger (product sync, ACV validation, TCV calculation, delivery sync)
- BOIDealCodeTrigger (auto-generate deal codes)

**Services:**
- ProductsBreakdownService (TCV calculation, product breakdown text, term tracking)
- ProductLineSyncService (multi-select picklist sync with line items)

---

## Salesforce Auth

**Primary method:** SF CLI token fallback (added Feb 20, 2026). The `initialAuthentication()` function in `src/salesforce/connection.js` first tries to get an access token from the SF CLI (`sf org display --target-org eudia-prod --json`). If the CLI is not available, falls back to username/password + security token login.

**Circuit breaker:** 3 failed attempts triggers a 15-minute cooldown (1 hour for INVALID_LOGIN). Reset by killing and restarting the server process.

**Common auth failure causes:**
1. Password/security token changed (SF resets token on password change)
2. Multiple server instances competing for Socket Mode connection
3. Token refresh timer (every 90 minutes) calling `initialAuthentication()` when no refresh token is cached
4. `/api/account/lookup-by-domain` endpoint resets circuit breaker and re-initializes (can burn attempts)

**DO NOT** run `node -e` scripts that call `initializeSalesforce()` — competes with the running server's connection.

---

## Deployment

```bash
git push origin main  # Render auto-deploys in 2-3 minutes
```

- `.renderignore` excludes `docs/`, `salesforce/`, `obsidian-plugin/src/` (~33MB saved)
- `public/assets/` is in `.gitignore` — use `git add -f public/assets/meeting-prep-helpers.js`
- Plugin updates: `cd obsidian-plugin && npm run build && cd .. && git push origin main`
- Salesforce deploys: `cd salesforce && sfdx force:source:deploy -p force-app/main/default/... -u production`

---

## Critical Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/app.js` | ~8,800 | Express server, ALL routes, Slack Bolt app |
| `src/slack/blWeeklySummary.js` | ~3,100 | Weekly snapshot PDF + Slack message |
| `src/slack/events.js` | ~7,800 | Slack event handlers, intent routing |
| `src/services/intelligenceQueryService.js` | ~3,100 | GTM Brain query engine |
| `src/views/meetingPrepView.js` | ~3,200 | Meeting Prep tab |
| `src/salesforce/connection.js` | ~700 | SF connection, auth, circuit breaker |
| `src/services/calendarService.js` | ~1,020 | Calendar integration (MS Graph) |
| `src/services/feedbackExtractor.js` | — | Product feedback poller + AI classifier |
| `src/services/feedbackStore.js` | — | Feedback SQLite/JSON/SFDC storage |
| `src/utils/textSanitizer.js` | — | Text sanitization for SF writes |
| `obsidian-plugin/main.ts` | ~8,400 | Obsidian plugin source |

### Salesforce LWC Components

| Component | Controller | Purpose |
|-----------|-----------|---------|
| `pipelineReviewCenter` | `PipelineReviewController.cls` | Pipeline dashboard (v2.2) |
| `targetPoolCenter` | `TargetPoolController.cls` + `TopOfFunnelController.cls` | Account/target management (v5) |
| `csStaffingModal` | `CSStaffingController.cls` | CS handover modal on Opp record |
| `csHomeDashboard` | `CSHomeController.cls` | CS dashboard home |
| `opportunityCreator` | `AccountLookupController.cls` | Quick opp creation |
| `accountHighlightsPanel` | — (uses `@wire` getRecord) | Account record header |

---

## Recent Completed Work (Feb 23-24, 2026)

### Target Pool Center (NEW — Feb 23-24)
- **3-tab LWC** for account management: Distribution, Target Pool, Weekly Focus
- **Tab 1 — Distribution**: Per-BL book breakdown with T1 Exec / T2 BL tier columns, click-to-expand accounts
- **Outreach tier system**: T1 Exec (top 10-15 for VP/C-suite outreach), T2 (BL-driven). Toggle buttons per account with T1 cap at 15.
- **Sortable tables** on all tabs — click column headers to sort by name, HQ, industry, revenue, tier, status
- **Geographic + industry summaries** when expanding a BL's accounts
- **State filter** on Target Pool tab with state normalization (abbreviations → full names)
- **Industry grouping**: 18 consolidated groups mapping ~100+ raw industry values (static map in JS + `data/industry_group_mapping.csv`)
- **Account_Pool_Sync Flow**: auto-transitions accounts from pool to target book when ownership changes
- **Apex**: `TargetPoolController.cls` (v5) — distribution, pool, claim/drop/transfer, `setOutreachTier`, `getWeeklyFocus`, `getAllWeeklyFocus`
- **Apex**: `TopOfFunnelController.cls` — back-book activity (tasks, accounts touched), new opps created this quarter per BL with stage distribution
- Key files: `salesforce/force-app/main/default/lwc/targetPoolCenter/`, `classes/TargetPoolController.cls`, `classes/TopOfFunnelController.cls`

### Pipeline Review Center (v2.2 — Feb 23-24)
- **Q1 baselines**: Static per-pod and per-BL commit baselines from Feb 2, 2026 workbook snapshot for delta tracking
- **Won QTD section**: `getClosedWonQTD()` Apex method showing Closed Won deals in current fiscal quarter
- **Commit/Weighted delta drill-down**: Expandable sections showing delta from Q1 baseline
- **Formula field switch**: Header now uses `BL_Quarterly_Forecast__c` and `AI_Enabled_Quarterly_Forecast_Net__c` (replaces Blended_Forecast_base__c)
- **Q1 snapshot fields**: `Q1_2026_Commit_Snapshot__c`, `Q1_2026_ACV_Snapshot__c`, `Q1_2026_Forecast_Category_Snapshot__c`
- **changesOnly fix**: Display-only filter — metrics always calculated from full dataset
- **Date parsing fix**: `_parseLocalDate()` for target sign dates (avoids UTC offset issues)
- Header reordered: Q1 Commit | Current Commit | BL Forecast | In-Qtr | AI | Won QTD

### CS Staffing Handover Module (Rewrite — Feb 23-24)
- **Full rewrite** of `csStaffingModal` LWC using `CSStaffingController.getStaffingContext()` for rich context
- **Deal summary header**: account name, ACV, stage, term at top of modal
- **Clickable contact chips** from Account contacts above stakeholder text area (one-click to add)
- **Per-product term/price table** from OpportunityLineItem data with TCV column for multi-year deals
- **Varying term detection**: shows range label when products have different term lengths
- **CSM intelligence**: surfaces assigned CSM from `Account.CSM__c` if exists
- **Auto-trigger at Stage 4**: CS_Staffing_Alert Flow sets both `CS_Staffing__c` AND `CS_Staffing_Flag__c`, creates "Complete CS Handover" Task for Opp Owner
- Platform Event (`CS_Staffing_Alert__e`) ready for Slack notification — gated by `CS_STAFFING_ALERTS_ENABLED` env var (currently `false`)
- Test class: 7 methods, all passing, 100% coverage

### Opportunity Creator (Enhanced — Feb 23-24)
- Default stage changed from Stage 1 to **Stage 0 - Prospecting**
- **Undetermined** added back to product line options (pre-selected as default)
- **Pod field** with auto-detection via `getDefaultPod()` Apex method (US/EU based on logged-in user)
- Pod value passed through to opportunity creation

### Account Highlights Panel (Enhanced — Feb 24)
- **Account delete** functionality with confirmation dialog
- **Menu-based actions**: Edit and Delete via lightning-button-menu

### Text Sanitization (NEW — Feb 24)
- `src/utils/textSanitizer.js` — utility for sanitizing text before Salesforce writes
- Applied to `hyprnoteSyncService.js` (contact creation) and `salesforceContactSync.js` (contact sync)
- Prevents bad characters/encoding from breaking SF API calls

### Salesforce Flexipages (18 NEW — Feb 23-24)
- Multiple Lightning home pages for different personas deployed:
  - Sales: `Sales_Leadership_Home`, `EU_Sales_Leadership_Home`, `US_Sales_Leadership_Home`, `Exec_Sales_Home`, `Test_Sales_Home`
  - CS/Delivery: `CS_Home`, `CS_Dashboard_Home`, `Delivery_Home`, `Delivery_Dashboard_Home`
  - Product: `Product_Home`, `Product_Dashboard_Home`
  - Marketing: `Marketing_Admin_Home`, `Marketing_Analytics_Center`
  - Dashboards: `Pipeline_Review_Center`, `Target_Pool_Center`, `Tuesday_Targeting`
  - Record Pages: `Counsel_Account_Record_Page` (code-named accounts)
  - `Integration_UtilityBar`
- Salesforce Apps: `Marketing_Admin.app`, `Sales_Leadership.app`

### Account Health History Flow (Updated — Feb 24)
- Switched to **After Save context** (uses `$Record__Prior` for prior values)
- API version bumped to 60.0

### Product Feedback Tracker (NEW — Feb 23)
- `src/services/feedbackExtractor.js` — polls `#eudia_product_channel` (C09F9MUVA3F) on schedule, AI-classifies messages into Issue/Feature Request/Quality Feedback/Use Case Query
- `src/services/feedbackStore.js` — SQLite storage + JSON cache + SFDC sync capability (Product_Feedback__c object not yet deployed)
- `src/slack/feedbackDigest.js` — weekly Slack digest grouped by product area with trending tags
- Schedule: Tue/Thu/Sat 5 AM ET (cron: `0 10 * * 2,4,6` UTC)
- 50-message cap per cycle, dry-run mode available via `FEEDBACK_DRY_RUN=true`
- Digest routed to Keigan DM (test) — not production channel yet
- API endpoints: `/api/feedback/status`, `/api/feedback/poll`, `/api/feedback/backfill`, `/api/feedback/stats`, `/api/feedback/digest`, `/api/feedback/sync-sfdc`

### Unified Intel Pipeline (Feb 23 — Phase 1)
- Channel intelligence schedule changed from hourly to 3x/week (Tue/Thu/Sat 5:30 AM ET, cron: `30 10 * * 2,4,6` UTC)
- 50-message cap per channel per cycle added to `channelIntelligence.js`
- Token usage tracking: logs estimated tokens per cycle
- `INTEL_SCRAPER_ENABLED=true` on Render, `INTEL_TARGET_CHANNELS` configured with Bayer, Cargill, DHL, CHS, and others
- `INTEL_DIGEST_CHANNEL=C09RDPLlTUK` for intel digest
- Phase 2 (unified classification prompt) and Phase 3 (production channel routing) planned but not implemented
- Plan documented in `.cursor/plans/unified_intel_architecture_88074177.plan.md`

### Obsidian Plugin (v4.7.2 to v4.7.3 — Feb 23)
- **Chunked transcription**: recordings >15MB split into 8MB chunks sent individually to `/api/transcribe-chunk`
- **Auto-heal**: on plugin load, scans for notes with "Transcription failed", matches to saved recordings, re-transcribes automatically
- **Force update**: `forceUpdate: true` in version endpoint accelerates update check cycle
- UTC timezone fix for recording filename matching in auto-heal
- Backward-compatible with old server response fields (`text` vs `transcript`)
- Plugin version bumped to 4.7.3

### Sales Workspaces (NEW — Feb 23-24)
- `sales-workspaces/riley-stack/` — Riley Stack's sales workspace with:
  - `.cursor/rules/eudia-sales-brain.mdc` — Sales intelligence rules
  - `.cursor/rules/riley-context.mdc` — 85 accounts, sales methodology context
  - `.cursor/rules/salesforce-guardrails.mdc` — Phase 1: full confirmation mode
  - `templates/` — Email templates, meeting prep briefs
  - `playbook/` — Sales playbooks and guides
- `sales-workspaces/marketing-caroline/` — Caroline Kelly's marketing workspace with:
  - `.cursor/rules/eudia-marketing-brain.mdc` — Marketing intelligence rules
  - `.cursor/rules/caroline-context.mdc` — Marketing context
  - `.cursor/rules/salesforce-guardrails.mdc` — Marketing permissions

### Pipeline Lookback LWC (NEW — Feb 25, updated Feb 25)
- **Investor-grade point-in-time pipeline view** deployed as `Pipeline_Lookback` Lightning Page Tab
- **Pipeline Snapshot tab**: Monthly metrics table (rows=metrics, columns=months Sep '25 - live current)
  - Total Gross (restated values), Total Weighted, Unique Logos, SQO Avg Deal ($), Avg Days to Close, MoM Growth %
  - Historical months use restated values from pipeline cleanup exercise; current month is live SOQL
  - Sep '25 Total Weighted normalized to $9.8M (~38% of gross, consistent with Oct '25 ratio) to account for pipeline event
  - Customer Type breakdown: MSA / Pilot / LOI / New with Opp Count, ACV, Wtd ACV, % of ACV, % of Wtd
  - Existing vs New summary table with total row
  - Stage Distribution vertical bar chart with percentage labels above bars
  - **On-hover tooltips**: Hover over stage bars to see top 15 deals in that stage (account name + ACV). Tooltips are per-stage (only the hovered bar shows its tooltip).
  - **Click-to-expand**: Customer Type and Existing vs New rows expand to show top 20 deals for that specific group. Expansion is per-row (only the clicked row expands, not all rows). Hover over rows for quick deal preview via native tooltip.
- **Pipeline Created tab**: Monthly metrics table + bar chart + Pipeline Created by Business Lead table
  - Per-month: Total ACV, SQO Count, Avg SQO Deal Size, Deal Count, MoM Growth %
  - Per-BL: Total ACV, Deals, SQOs, Avg Deal, SQO Avg Deal (sorted by ACV desc)
  - Dec '25 visually annotated (orange bar, highlighted column header) — includes deals migrated from prior Salesforce org
  - **Avg SQO Deal Size**: = total SQO ACV / SQO count for that month. SQO = deals currently at Stage 2+. Tooltips clarify metric definition.
  - **Click-to-expand BL rows**: Only the clicked BL expands to show their top 20 deals. Other BLs remain collapsed. (Fixed bug where clicking one BL expanded deals under all BLs.)
- **Excel Export**: Via Apex `saveExcelExport()` method — generates ContentVersion in Salesforce Files, downloads via native `/sfc/servlet.shepherd/version/download/{id}` URL (bypasses LWC CSP/sandbox restrictions on blob URLs). 4-tab .xls: Tab 1 (Summary metrics), Tab 2 (Breakdown — customer type/stage or BL pipeline), Tab 3 (Source Deals — full active pipeline), Tab 4 (Restatement Audit — monthly reconciliation table + 154 removed deal list). Per-tab export: Snapshot and Created tabs each generate their own file.
- **Data source footnotes**: Compact footnotes beneath every data section explaining source fields, methodology, and how to validate in Salesforce.
- **BL roster**: Alex Fox and Emer Flynn removed from BL_ORDER and EU_BLS in controller (Feb 25).
- **QTD filter**: When "QTD" is selected on Pipeline Created tab, passes fiscal quarter start date (e.g., `2026-02-01` for Q1 FY26) as `createdSinceDate` parameter to controller. Controller method signature: `getMonthlyLookback(Integer monthsBack, String createdSinceDate)`. When `createdSinceDate` is provided, it overrides `monthsBack` for Pipeline Created sections only.
- **BL expanded deals**: Shows Created Date column alongside account name, ACV, stage, and products.
- **Excel export**: Uses hidden `<a>` element in template (`data-id="download-link"`) with Blob URL. Template anchor approach works within LWC Shadow DOM where `document.createElement` clicks are blocked by CSP. Per-tab export: Snapshot tab exports metrics + customer type + stage + source deals; Created tab exports created metrics + BL pipeline + source deals.
- **Visibility**: Eudia System Admin profile only (tab + flexipage)
- Key files: `salesforce/force-app/main/default/classes/PipelineLookbackController.cls`, `lwc/pipelineLookback/`, `tabs/Pipeline_Lookback.tab-meta.xml`
- Historical restated values (lines 65-71 of controller): Sep $25.85M (wtd $9.8M, 193 logos, $185K SQO avg), Oct $24.45M (246 logos, $185K), Nov $25.68M (181 logos, $255K), Dec $32.16M (200 logos), Jan $35.96M (200 logos). Logos and SQO avg adjusted for ~15 placeholder-only accounts and ~8-10 placeholder $100K SQO deals per month.
- **Dec '25 Pipeline Created adjustment**: $9M / 59 migration deals subtracted from December 2025 Pipeline Created metrics to show organic pipeline creation (migration from prior Salesforce org). Applied before MoM calculation.
- To update historical values: edit `getHistoricalSnapshots()` in controller and redeploy
- **Fiscal quarters**: Q1=Feb-Apr, Q2=May-Jul, Q3=Aug-Oct, Q4=Nov-Jan. FY starts Feb 1. Pipeline Review Center `_computeDateBoundaries()` already implements this correctly.

### Pipeline Restatement & Cleanup (Feb 24-25, expanded Feb 25)
- **154 opportunities zeroed** in Salesforce ($16.1M total ACV set to $0, records retained for audit trail)
  - Phase 1 (Feb 24): 79 deals ($8.62M) — audit log at `data/sf_pipeline_cleanup_log.json`
  - Phase 2 (Feb 25): 83 additional deals ($7.4M) — all confirmed at $0 (were already zeroed from prior Phase 2 batch operation)
  - Reviewed and approved via `OPP UPDATES FOR CURSOR REVIEW.xlsx` → 'VALID OPP DATA AND ACTIONS' tab
  - 23 deals explicitly marked KEEP IN PIPELINE ($2.06M)
- **144 unique accounts** across the 154 removed deals
- **Historical snapshot restatement** (Zack-approved — `VALID OPP DATA AND ACTIONS` tab):
  - Sep '25: $27.65M gross, 116 logos (original $39M - $11.35M removed, 92 logos with no other pipeline)
  - Oct '25: $26.15M gross, 170 logos (original $37.2M - $11.05M removed, 91 accounts)
  - Nov '25: $27.34M gross, 116 logos (original $37M - $9.66M removed, 80 accounts)
  - Dec '25: $33.22M gross, 160 logos (original $39M - $5.78M removed, 55 accounts)
  - Jan '26: $37.02M gross, 156 logos (original $43.2M - $6.18M removed, 59 accounts)
  - Methodology: Original pipeline - REMOVE deals = Restated. 23 KEEP deals retained per Zack review.
  - Logo reductions: cross-referenced REMOVE accounts against active pipeline (`wtd pipeline ref` tab). Only subtracted accounts with NO other active deals.
- **Sep weighted**: $9.8M (38% of first-restate gross, consistent with Oct ratio)
- **5 Lookback formula fields** deployed on Opportunity: `Lookback_Sep25__c` through `Lookback_Jan26__c`. Each shows ACV if deal was open at month-end. Sum validates against Pipeline Lookback restated totals.
- **Dec Pipeline Created**: $9M / 59 migration deals subtracted (prior SF org, separate from placeholder cleanup)
- **Controls deployed**: Opp Creator defaults to Stage 0 with "Undetermined" product line, Pipeline Review validates product-ACV alignment, weekly snapshot pulls live SOQL
- **Restatement audit**: Full 154-deal list included in Pipeline Lookback Excel export (Tab 4: Restatement Audit)

### Other (Feb 23-24)
- CursorClip tool: fixed duplicate sound and paste-targeting bugs
- Product Feedback Tracker files committed to repo (were causing Render deploy crash)
- Multiple Render deploy fixes (missing files, stale variable references, timezone dependency)

### Session Work (Feb 25, 2026 — Afternoon)

### Pipeline Lookback Excel Export Overhaul
- **XMLSS format**: Rewrote entire export from HTML-based `.xls` (broken on Mac) to XML Spreadsheet 2003 format — all tabs now render on every Excel version
- **MoM Pipeline tab**: Company-level monthly pivot — one row per company, months as columns (Mar '24 through current), ACV appears when deals enter pipeline and drops when they close. Total row with `=SUM()` formulas. ~350 companies with active pipeline history.
- **Deal Detail tab**: Deal-level view with Sep 25 through Current lookback columns, per-deal ACV lifecycle
- **Historical deals Apex method**: `getHistoricalPipelineDeals()` queries all opps with `CreatedDate <= 2026-01-31` and computes lookback values in Apex (not formula fields) via `computeLookback()` method — avoids non-selective query timeouts
- **Pipeline Snapshot**: Static restated values for historical months (Zack-approved), live SOQL for current month
- **6 tabs on Snapshot export**: Pipeline Snapshot, Breakdown, MoM Pipeline, Deal Detail, Source Deals, Restatement Audit
- **Python investor export**: `scripts/build_pipeline_lookback_investor.py` generates `Pipeline_Lookback_Investor.xlsx` with real Excel formulas via openpyxl
- Key files: `PipelineLookbackController.cls` (lines 416-540), `pipelineLookback.js` (export functions)

### CS Staffing Handover — Deployed and Working
- **CS fields deployed**: All 8 CS_ fields on Opportunity now deployed to org with FLS granted for Eudia System Admin profile (CS_Customer_Goals__c, CS_Key_Stakeholders__c, CS_Products_Purchased__c, CS_Commercial_Terms__c, CS_Contract_Term__c, CS_Auto_Renew__c, CS_Commercial_Notes__c, CS_Staffing__c)
- **PM_Handover_Flag__c deployed**: Field created on org with FLS granted
- **Handover_Type__c**: NOT deployed (formula uses multi-select picklist in unsupported way). Handover type computed in Apex instead: `opp.Eudia_Tech__c == true ? 'CS' : 'PM'`
- **Save method**: Rewrote from `updateRecord` (UI API) to Apex `saveHandover()` — bypasses all UI API restrictions on Closed Won records, page layouts, and field-level quirks
- **CS_Auto_Renew__c**: Fixed — Checkbox can't be null, now defaults to `false` when TBD selected
- Key files: `CSStaffingController.cls` (saveHandover method), `csStaffingModal.js`

### GC Intro Status Audit
- **Excel deliverable**: `GC_Intro_Status_Audit.xlsx` with 4 tabs — GC Intro Status (company pivot with EA data), Contact Directory, By Category, EA Validated Data (Source)
- **111 GC companies** categorized into 7 buckets: Customer (14), Active Pipeline (11), Intro Made — Meeting Scheduled (3), Intro Made — Outreach Initiated (10), No Contact (22), Nurture (48), DQ (1)
- **Salesforce fields created**: `Investor_Intro_Source__c` and `Investor_Intro_Status__c` on Account (picklist fields for background GC tagging)
- **F500 cross-reference**: Updated `GC ACCTS TO AUDIT.xlsx` F500 tab with GC Intro Status column
- **Unique company count formula**: `=SUMPRODUCT((B13:B200="Customer")/IF(B13:B200="Customer",COUNTIFS(A13:A200,A13:A200,B13:B200,"Customer"),1))`

### Obsidian Plugin v4.8.0 → v4.8.1
- **v4.8.0 — Audio Recording Reliability Overhaul**:
  - Device monitoring: `devicechange` listener during recording, detects connects/disconnects
  - Headphone detection: AirPods/Beats/Bluetooth pattern matching, warns about one-sided capture in full_call mode
  - Silence watchdog: 30-second alert threshold with context-specific troubleshooting hints
  - Permission-first flow: checks mic access before template picker, shows guided macOS Settings modal if denied
  - Internal Call template: 4th option alongside MEDDIC, Demo, General Check-In
  - Error wrapping: guaranteed UI cleanup on any failure
  - Telemetry hooks: console logging for device changes, silence events, recording errors
- **v4.8.1 — Auto-Heal Fix for Partial Transcripts**:
  - Fixed skip logic: notes with explicit `**Transcription failed:**` marker now always re-processed, even if they contain partial `## Summary`
  - Recording search expanded to include `_backups` folder alongside `Recordings`
  - Fixes John Dedych's partial Coherent Patent Insights transcript recovery
- **Missing styles.css**: Identified that plugin update commands were only downloading main.js + manifest.json. All update commands now include styles.css (fixes recording waveform, calendar card layout, mic glow animation)

### Prior Work (Feb 10-20, 2026)

### Obsidian Plugin (v4.0 to v4.7.2)
- Full vault architecture: 1,109 accounts, two-tier folder structure
- Native system audio capture (6-strategy Electron fallback)
- Silent auto-update pipeline (fixed from scratch multiple times)
- CS-specific transcription prompts
- Meeting note templates, Slack copy command
- Calendar: external-only filter, past meeting scrollback
- Transcript recovery admin endpoints
- Audio safety net (saves before upload)

### Weekly Snapshot PDF
- Product line visibility across all sections (using Product_Lines_Multi__c)
- WoW % on Forecast (Commit, Weighted) and Stage Distribution
- Pipeline opportunities: company first, ACV, product line (two-line rows)
- Donald deal fix ($25k under Olivia, was $45k under Asad)
- Live SOQL data replacing hardcoded values
- Slack message: WoW change summary replacing Commit by BL
- Date timezone fix (PST, not UTC)
- Overflow prevention (dynamic row limits, tightened spacing)

### Pipeline Review Center
- Header calculations fixed (correct SF formula fields)
- BL quick-nav sidebar
- WoW Forecast Category tracking
- Text wrapping and Next Steps visibility
- Multiple CDN cache busts

### Customer Success
- Structured outcomes model (JSON in CS_Outcome_Data__c)
- 67 outcomes populated across 38 accounts
- CS Staffing Request modal for Opportunity record page
- Stage 3+ retroactive flagging
- CS-specific transcription format

### GTM Brain AI
- Multi-turn chat, Claude-style UX
- 30+ query fixes across intent parsing and SOQL
- Pipeline intelligence expansion
- PostgreSQL L2 cache, intent persistence
- Feedback system and suggestion quality

### Account Scoring
- F500: 500 companies scored, 292 CLOs identified, 47 AI-forward
- Non-F500 Top 50: 72 candidates researched, 16 AI-forward CLOs

### Salesforce Config
- TCV formula fix: `MAX(1, Term/12)` for sub-annual deals
- Product line selector LWC, product ACV override
- Lead tracking automation (auto-progress, auto-nurture, auto-convert)
- BOI deal codes, Account Info Request button
- Campaign attribution schema, marketing ops infrastructure

### Infrastructure
- SF CLI token fallback auth
- Production hardening (rate limiting, health checks)
- Deploy optimization (.renderignore)
- Technical walkthrough page

---

## Pending Task: F500 Prioritization Excel Rebuild

**File:** `Fortune500 - Prioritization - ENHANCED FEB 23.xlsx` in gtm-brain root
**Fixed reference:** `F500-Prioritization-FIXED.xlsx` — 500 companies, 29 columns, but composite scores range 1-500 (uncapped)
**Reference data:** `data/F500_Prioritization_Final.xlsx`, `data/F500_Raw_Data.xlsx`, `data/f500_prioritization.csv`, `data/f500_prioritization_enriched.csv`
**Prior research cache:** `data/f500_cost_transform_batch1.json` through `batch8.json`, `data/f500_cost_transform_merged.json`

### Current File Diagnostics:

**FIXED version** (`F500-Prioritization-FIXED.xlsx`):
- 500 companies, 29 columns (Rank through Tier)
- Columns: Rank, Company, CLO AI Rank, F500 Rank, Industry, Ind. Group, Revenue, Est Legal Spend, Legal Spend Score, CLO Score, AI-Ind Score, Cost Transform, Composite, CLO/GC, CLO AI-Fwd Score, CLO Evidence, CLO Evidence URL, Company AI Signal, Company AI Signal URL, Cost Transform Evidence, Cost Transform URL, AI-Ind Basis, Cost Transform Basis, Industry Peers, Status, Owner, Pipeline, Entry Point, Tier
- Composite range: 1 to 500 (400 companies > 100 -- BROKEN)

**ENHANCED version** (`Fortune500 - Prioritization - ENHANCED FEB 23.xlsx`):
- 515 rows, 27 columns
- Assumption weights table at rows 6-13: Legal Spend (0.35), CLO Maverick (0.35), AI & Industry (0.15), Cost Transform (0.15)
- Industry factor table with multipliers (Financial Services 1.25, Healthcare 1.15, etc.)
- Distribution summary by Industry Group
- Data starts at row 15

### What needs to happen:

**1. Formula fixes (CRITICAL)**
- Composite score must max at 100. Currently uncapped (ranges up to 500 in FIXED version).
- When assumption weights are changed (Legal Spend %, CLO Maverick %, AI & Industry Fit %, Cost Transformation %), the composite scores and rankings in the data table MUST recalculate automatically.
- Rank column must use `RANK()` referencing composite. Currently static/manual.
- Ideally the table auto-sorts by new composite via `SORTBY` (Excel 365) so rankings physically reorder.
- Assumption tables are in rows 6-13 of the F500 Prioritization tab. Weight cells must be unlocked and clearly labeled for non-technical users to adjust.

**2. CLO/GC accuracy (CRITICAL)**
- CLO/GC column sometimes lists a person who is NOT the CLO (noted in evidence as "Not CLO" or similar).
- CLO AI-Forward column (`TRUE`/`FALSE`) must reflect CLO-SPECIFIC evidence, not just company-level AI signals.
- If CLO Evidence says "no specific CLO evidence found" but AI-Forward is `TRUE`, that's a contradiction — should be `FALSE`.
- Need to cross-reference and correct across ~150 CLOs currently marked TRUE.
- Add `CLO Evidence URL` column with hyperlinked source material.

**3. Cost Transformation dimension**
- New scoring column added but evidence quality varies. Some entries are generic/thin.
- Evidence URLs are plain text — need to be hyperlinked.
- Score should be 0-10 scale based on actual evidence of cost transformation programs, restructuring, consulting engagements, earnings call language.
- Research data exists in `data/f500_cost_transform_batch*.json` and `data/f500_cost_transform_merged.json`.

**4. Formatting (executive presentation quality)**
- Font: Times New Roman throughout
- Header rows: black fill, white bold text
- Data rows: alternating white / light grey fill, black text
- NO blue fill anywhere
- Evidence URLs must be hyperlinked (clickable), not raw text
- Conditional formatting on Composite and Rank columns (green-to-red gradient)
- Status column color-coded (Active=green, Pipeline=blue, Dormant=gray)

**5. Cross-reference with owned accounts**
- Status column (R) should reflect current Salesforce pipeline status
- Cross-reference with `sf acct owners` and `sf active pipeline` tabs if they exist
- Tier should reflect current engagement level

**6. Research quality**
- Company AI Signal should be company-specific, not industry-general
- Add `Company AI Signal URL` column with hyperlinks
- Use parallel web search for any companies with thin/missing evidence
- Cost transformation evidence must be substantive and sourced

### Key constraints:
- Use the parallel-web-search or parallel-data-enrichment skills for batch research
- Do NOT fabricate evidence. If confidence is low, leave blank or mark "Insufficient data"
- The file must be defensible for executive review
- Non-technical users must be able to toggle weights and see the table update

---

## Completed: Pipeline Cleanup Phase 2 (Verified Feb 25)

**Status:** VERIFIED — All 84 Phase 2 deals already at $0 ACV in Salesforce. No additional action was needed.
**Backup:** `data/pipeline_phase2_backup.csv` (84 records, all confirmed $0)
**Log:** `data/pipeline_phase2_cleanup_log.json`

---

## Completed: Opportunity Updates from Excel (Verified Feb 25)

**File:** `OPP UPDATES FOR CURSOR REVIEW.xlsx` in gtm-brain root
**Processed data:** `data/pipeline_revert_queue.json`, `data/pipeline_phase2_queue.json`

### 177 deals reviewed, 4 action groups — all verified against live Salesforce:

**1. REVERT (9 deals) — VERIFIED: All already have correct ACV in SF**
Phase 1 log recorded these as zeroed, but Salesforce shows original values ($100K each, $58,580 for Sisk Group). No revert action was needed.
Verification log: `data/pipeline_revert_log.json`

**2. Phase 2 Cleanup (84 deals) — VERIFIED: All already at $0 ACV in SF**
All 84 deals confirmed at $0 in Salesforce. Cleanup was previously executed.
Backup: `data/pipeline_phase2_backup.csv` | Log: `data/pipeline_phase2_cleanup_log.json`

**3. KEEP AS IS (14 deals)** — Confirmed, no action taken.

**4. KEEP AS UPDATED (70 deals)** — Phase 1 correctly handled, confirmed.

---

## Completed: Contact/Account ID Reconciliation (Verified Feb 25)

**File:** `contacts and accts ids.xlsx` in gtm-brain root
**Processed data:** `data/contacts_accts_import.json`
**Reconciliation results:** `data/account_reconciliation_results.json`, `data/contact_reconciliation_log.json`

### Account Reconciliation:
- **76 accounts** queried against Salesforce — **all 76 exist**, all fields current. No updates needed.

### Contact Reconciliation:
- **208 contacts** processed:
  - **118 already exist** in Salesforce (matched by email)
  - **18 new contacts** flagged for manual review (NOT auto-created). Several have mismatched email domains (former employees or bad data) — review `data/contact_reconciliation_log.json` before creating.
  - **72 contacts** have no email address — cannot be matched programmatically

### Remaining action:
- Review 18 new contacts in `data/contact_reconciliation_log.json` and manually create valid ones in Salesforce if desired
- 72 no-email contacts need manual lookup if they are needed

---

## Pending Task: Weekly Pipeline Update Processing

**Files:** `Eudia Weekly Pipeline Updates - 2.23.2026.docx`, `Eudia Weekly Pipeline Updates - FOR CURSOR FEB 23 REFERENCE.docx` in gtm-brain root
**Extracted data:** `data/weekly_pipeline_update_feb23.json`

### Key Pipeline State (Feb 23, 2026):
- **43 deals tracked** across US and EU pods
- **7 NEW deals**: Toshiba, ServiceNow (~$200K+), Petco ($120K), Nextdoor, Alnylam, Liberty Mutual, Perrigo (>$300K)
- **11 deals at Commit**: Asana ($250K, sent for signature), Wellspring ($1.1M), Army Corps ($250K), Bank of Ireland (~$170K), Novelis ($95K), Home Depot, National Grid, Udemy (~$120K), Daedalus, Return, CommScope
- **TE Connectivity moved from Commit to Gut** (budget <$80K, exploring Anthropic)
- **5 Key Asks**: Lock Wellspring signing (Dublin visit), Airbnb ownership resolution (Nathan vs Asad), Cummins CLO intro via CAB, Toshiba pricing call, Perrigo EB engagement

### What needs to happen:
1. Cross-reference deal statuses against current Salesforce state
2. Update weekly snapshot hardcoded values (`Q1_BY_SOLUTION` in `blWeeklySummary.js`) if solution mix has changed
3. Verify new deals (Toshiba, ServiceNow, Petco, Perrigo) are created in Salesforce with correct ACV/stage
4. Confirm TE Connectivity forecast category change is reflected in SF

---

## Completed: Pipeline Lookback MoM Report Fix (Feb 25)

**Status:** CODE COMPLETE — Report metadata updated, needs deployment to Salesforce.

### What was done:
- Report filter updated from single `Lookback_Sep25__c > 0` to `booleanFilter` with `1 OR 2 OR 3 OR 4 OR 5` across all 5 Lookback months
- All 5 Lookback columns already have Sum aggregates, `showGrandTotal` is enabled
- Grand totals should validate against restated values: Sep $27.65M, Oct $26.15M, Nov $27.34M, Dec $33.22M, Jan $37.02M

### To deploy:
```bash
cd salesforce && sfdx force:source:deploy -p force-app/main/default/reports/Sales_Home_Reports/Pipeline_Lookback_Source.report-meta.xml -u production
```

### Key files:
- `salesforce/force-app/main/default/reports/Sales_Home_Reports/Pipeline_Lookback_Source.report-meta.xml`

---

## Completed: CS Staffing Workflow Overhaul (Feb 25)

**Status:** CODE COMPLETE — All components updated, needs deployment to Salesforce + Render redeploy.

### What was built:

**1. New Salesforce fields:**
- `PM_Handover_Flag__c` (Checkbox) on Opportunity — parallel to CS_Staffing_Flag__c for non-AI deals
- `Handover_Type__c` (Formula, Text) on Opportunity — auto-computes 'CS', 'PM', or 'Both' based on `Eudia_Tech__c` and `Product_Lines_Multi__c` content
- `Handover_Type__c` (Text) on `CS_Staffing_Alert__e` Platform Event — carries handover type to Slack

**2. Flow overhaul (`CS_Staffing_Alert`):**
- Entry condition: `StageName IsChanged` (removed `CS_Staffing__c = false` entry guard to enable Stage 5 follow-ups)
- Decision chain: Stage 4/5? → First time? → Determine Handover Type (CS/PM/Both)
- CS path: sets `CS_Staffing__c` + `CS_Staffing_Flag__c`, creates "Complete CS Handover" task
- PM path: sets `CS_Staffing__c` + `PM_Handover_Flag__c`, creates "Complete PM Handover" task
- Both path: sets all three flags, creates "Complete CS + PM Handover" task
- Stage 5 follow-up: for AI deals already processed at Stage 4, publishes follow-up Platform Event
- Each path publishes `CS_Staffing_Alert__e` with appropriate `Handover_Type__c` value

**3. LWC updates (`csStaffingModal`):**
- Watches both `CS_Staffing_Flag__c` and `PM_Handover_Flag__c`
- Dynamic banner: adapts text, color, and subtext based on handover mode (CS/PM/Both)
- Dynamic modal: title, subtitle, submit button, goals placeholder all adapt
- CSM section hidden for PM-only deals
- Deal type badge in deal summary bar (AI-Enabled / Managed Services / AI + Managed Services)
- PM banner uses amber/orange color scheme (distinct from CS blue)

**4. Apex controller (`CSStaffingController`):**
- Added `Eudia_Tech__c` and `Handover_Type__c` to SOQL query
- Added `isAiEnabled` and `handoverType` to `StaffingContext` response

**5. Slack handler (`csStaffingAlerts.js`):**
- Routes alerts by handover type: CS → `CS_STAFFING_ALERT_CHANNEL`, PM → `PM_HANDOVER_ALERT_CHANNEL`, Both → both channels
- Stage 5 Follow-up messages with distinct emoji and copy
- New `getTargetChannels()` function for channel routing
- PM channel defaults to CS channel if `PM_HANDOVER_ALERT_CHANNEL` not set

**6. Test coverage:**
- 9 test methods covering: basic context, terms (short/long), contacts, products, account contacts, AI-enabled, and non-AI scenarios

### To deploy:
```bash
# 1. Deploy new fields first
cd salesforce && sfdx force:source:deploy -p force-app/main/default/objects/Opportunity/fields/PM_Handover_Flag__c.field-meta.xml,force-app/main/default/objects/Opportunity/fields/Handover_Type__c.field-meta.xml,force-app/main/default/objects/CS_Staffing_Alert__e/fields/Handover_Type__c.field-meta.xml -u production

# 2. Deploy Apex + LWC + Flow
sfdx force:source:deploy -p force-app/main/default/classes/CSStaffingController.cls,force-app/main/default/classes/CSStaffingControllerTest.cls,force-app/main/default/lwc/csStaffingModal/,force-app/main/default/flows/CS_Staffing_Alert.flow-meta.xml -u production

# 3. Redeploy to Render (for Slack handler)
git push origin main
```

### Remaining manual actions:
- Remove John from CS Pipeline Alerts Slack channel
- Add David and Flynn to CS Pipeline Alerts Slack channel
- Set `PM_HANDOVER_ALERT_CHANNEL` env var on Render if PM alerts go to a different channel

---

## Completed: CS Renewals Quarterly Digest (Feb 25)

**Status:** CODE COMPLETE — New "AI Renewals" tab added to CS Home Dashboard, needs deployment.

### What was built:

**1. Apex method (`CSHomeController.getAIRenewalDigest()`):**
- Queries Contracts for accounts with Closed Won AI-enabled Opportunities (`Eudia_Tech__c = true`)
- Computes effective end date: uses `EndDate` if set, else `StartDate + ContractTerm` months
- Categorizes contracts into three groups:
  - **Expiring Soon**: effective end date within next 90 days
  - **Needs Validation**: missing both EndDate and StartDate/ContractTerm (no computable end date)
  - **Upcoming**: beyond 90 days with valid dates
- Includes associated AI-enabled won deal data (product lines, ACV, TCV, term, close date) per account
- Returns `AIRenewalDigest` with counts + categorized rows

**2. LWC "AI Renewals" tab on CS Home Dashboard:**
- Summary strip: total AI contracts, expiring count, validation issue count
- Three sections: Expiring <90 Days (urgent), Needs Validation (warning), All AI Contracts (beyond 90d)
- Each row: account name (linked), health dot, end date, days remaining, CSM
- Expiring rows show associated deal chips (product line + ACV)
- Validation rows show missing data flag with amber styling
- Days-until-end color coding: urgent (≤30d), warning (≤60d), ok (60+d)

### To deploy:
```bash
cd salesforce && sfdx force:source:deploy -p force-app/main/default/classes/CSHomeController.cls,force-app/main/default/lwc/csHomeDashboard/ -u production
```

### Remaining actions:
- Validate/clean up EU, Wellspring, and Certinia-origin contracts (manual data check)
- Check if CVC has a signed pilot agreement — enter into Salesforce if so
- Review contracts flagged as "Needs Validation" and populate missing dates

---

## Completed: Account Health History Cleanup (Feb 25)

**Status:** CODE COMPLETE — Apex invocable service + flow update, needs deployment.

### What was built:

**1. `AccountHealthArchiveService.cls` (Apex Invocable):**
- Called by the Account Health History flow after each health update
- **Truncation**: Parses `---`-separated history entries, keeps only the 4 most recent on the Account field
- **Archive**: Creates/updates a ContentVersion file ("Account Health History - {name}.txt") attached to the Account
- Smart file management: checks for existing archive doc per account (via ContentDocumentLink), creates a new version of the same document on subsequent updates rather than creating duplicates
- Handles blank history gracefully (no-op)

**2. Flow update (`Account_Health_History_On_Update`):**
- Previous: built full history text and directly updated `Account_Health_History__c`
- New: builds full history text and calls `AccountHealthArchiveService` invocable action instead
- The invocable handles both the field update (truncated to 4 entries) and the file archive (full history)
- Still uses `$Record__Prior` for prior values (After Save context, API 60.0)

**3. Test class (`AccountHealthArchiveServiceTest.cls`):**
- 4 test methods: truncation with 6 entries, fewer than 4 entries, updating existing doc, blank history
- Validates entry count, newest entry preserved, file creation, and no-op for blank input

### To deploy:
```bash
# Deploy in order: new class + meta, then flow
cd salesforce && sfdx force:source:deploy -p force-app/main/default/classes/AccountHealthArchiveService.cls,force-app/main/default/classes/AccountHealthArchiveService.cls-meta.xml,force-app/main/default/classes/AccountHealthArchiveServiceTest.cls,force-app/main/default/classes/AccountHealthArchiveServiceTest.cls-meta.xml -u production

sfdx force:source:deploy -p force-app/main/default/flows/Account_Health_History_On_Update.flow-meta.xml -u production
```

### Stretch goal (not implemented):
- LLM-assisted summary at top of health history field/document
- Would require Apex callout to Claude API or server-side processing via Node.js
- Recommend implementing as a separate scheduled batch job that processes accounts with recent health updates

---

## Pending Task: Opp WoW Change Tracker

**Plan:** `.cursor/plans/opp_wow_change_tracker.plan.md`
**Status:** PLANNING — Awaiting approval

### Summary:
7-part implementation plan for week-over-week Opportunity change tracking:
1. Data Foundation — 7 Prior_Week_* snapshot fields + 9 WoW formula fields on Opportunity
2. Weekly Snapshot Scheduled Apex Job (Sunday 11 PM)
3. Record Page "Change Pulse" LWC (`oppChangePulse`) — compact sidebar card showing WoW deltas
4. Pipeline Review Center enhancement — auto-generated highlights, conditional formatting, export
5. Standard Report/List View columns with WoW indicators
6. Flow cleanup prerequisites (deactivate duplicate `Update_Account_status_based_on_Opportunity_Stages`)

### Key constraints:
- Requires flow validation first (deactivate duplicate flow via Tooling API)
- Formula field count audit needed (Salesforce limit: 500 per object)
- Weekly snapshot job must batch in groups of 200 to avoid governor limit conflicts with triggered flows

---

## CRITICAL: Obsidian Plugin v4.9.0 — Auto-Update Not Reaching Users (Feb 25-26, 2026)

### What was built and deployed
Plugin v4.9.0 was pushed to git, Render deployed, and the server correctly serves it:
- `/api/plugin/version` returns `{"success":true,"currentVersion":"4.9.0","forceUpdate":true}`
- `/api/plugin/main.js` serves 350KB (the new build with all fixes)
- `/api/plugin/manifest.json` returns v4.9.0
- `/vault/download` generates fresh vaults dynamically (stale pre-built ZIP deleted)

### What v4.9.0 includes
- **Chunked transcription retry**: 3 attempts per chunk with exponential backoff, gap markers for failed chunks
- **Recording-to-note linkage**: `recording_path:` in frontmatter, one-click "Retry Transcription" command (Cmd+P)
- **Persistent heal queue**: Failed transcriptions retry with backoff (1min, 5min, 30min, 2hr, 8hr) across restarts
- **Recording lifecycle telemetry**: `recording_start`, `recording_stop`, `transcription_result`, `autoheal_scan` events
- **Auto-update with SHA-256 checksums**: Version endpoint returns checksums, plugin verifies before writing
- **Auto-rollback**: If plugin crashes within 2 minutes of update, `.bak` file restored
- **Deferred updates**: If update available during recording, resumes after recording stops
- **Double-write audio safety net**: Saves to `Recordings/` AND `_backups/` simultaneously
- **AirPods auto-handling**: Pre-recording headphone scan, auto-switches to `mic_only` mode
- **CS template**: 5th template in picker — health signals, feature requests, adoption, renewal/expansion
- **Eudia name correction**: Added UDF/variants to glossary, phonetic hint in Whisper prompt
- **Internal template refinement**: Added Strategic Takeaways, Parking Lot, Key Metrics sections
- **Live Query sidebar**: `EudiaLiveQueryView` in right sidebar, auto-opens during recording, chat-style with quick actions
- **Speaker diarization**: Verified pipeline, AssemblyAI `speakers_expected` raised to 4

### THE UNSOLVED PROBLEM
**Users on v4.7.3 (and likely v4.0-4.8.1) are NOT auto-updating to v4.9.0.**

The version endpoint was broken for weeks — it returned a hardcoded `4.7.3` fallback due to a manifest read failure on Render. We fixed this (now uses `require()` to cache the manifest at startup), and the server correctly reports v4.9.0. BUT:

- Keigan's vault has been open for 3+ hours on v4.7.3 and has NOT updated
- The old v4.7.3 plugin code's `checkForPluginUpdate()` may have cached "up to date" and never re-checked
- The old plugin checks `/api/plugin/version` every 30 minutes, but the response handling or hot-reload in the OLD code may be broken
- This is a **chicken-and-egg problem**: the fix for auto-update is in v4.9.0, but v4.9.0 can't be delivered because the old auto-update is broken

### What the next agent MUST do
1. **Read the OLD v4.7.3 plugin's `checkForPluginUpdate()` code** — this is what's actually running in users' vaults. The OLD code is at commit `29da384` (before our changes). Check out that commit's `obsidian-plugin/main.ts` and trace the update flow.
2. **Identify WHY the old code doesn't pick up the new version** — possible causes:
   - The old code checks `resp.json?.currentVersion` but the response format changed
   - The old code's semver comparison has a bug
   - The old code's `performAutoUpdate()` silently fails on download
   - The old code caches the "up to date" result and skips subsequent checks
   - The hot-reload via `plugins.disablePlugin/enablePlugin` throws silently
3. **Fix the server-side response** to be backward-compatible with whatever the OLD code expects
4. **If the old code is unfixable from the server side**, the only option is sending users a one-time terminal command:
```bash
VAULT=$(find ~/Documents -name ".obsidian" -type d -maxdepth 6 2>/dev/null | head -1 | sed 's/\/.obsidian//') && P="$VAULT/.obsidian/plugins/gtm-brain" && mkdir -p "$P" && curl -s https://gtm-wizard.onrender.com/api/plugin/main.js -o "$P/main.js" && curl -s https://gtm-wizard.onrender.com/api/plugin/manifest.json -o "$P/manifest.json" && curl -s https://gtm-wizard.onrender.com/api/plugin/styles.css -o "$P/styles.css" && echo "Updated to $(grep -o '"version":"[^"]*"' "$P/manifest.json")" && osascript -e 'quit app "Obsidian"' 2>/dev/null; echo "Reopen Obsidian."
```
5. After users are on v4.9.0, future updates should work because the new auto-update code has checksums, rollback, persistent state, and the fixed version endpoint.

### Version endpoint fix history
- **Original**: Read manifest via `fs.readFileSync()` → failed on Render → returned hardcoded `4.7.3`
- **First fix**: Changed fallback to `success: false` → but `readFileSync` still failed
- **Second fix**: Tried multiple path strategies → all failed on Render
- **Working fix**: Used `require('../obsidian-plugin/manifest.json')` to cache at startup → **this works**
- The `require()` approach works because Node.js resolves module paths differently than `fs` path resolution on Render's file system

---

### Session Work (Feb 25-26, 2026) — Salesforce Updates

### Eudia Counsel Account Sensitization (Complete)
- **`Is_Counsel_Sensitized__c`** formula field on Account: evaluates per-viewing-user. Returns TRUE when the user should see the sensitized view (not owner, not CSM, not admin/leadership). Returns FALSE for authorized users.
- **`Account_Record_Page_Three_Column1`** flexipage: Uses `Is_Counsel_Sensitized__c` for component visibility rules. Shows `councilHighlights` (code name tile) when sensitized, `accountHighlightsPanel` (normal tile) when not.
- **councilHighlights LWC updated**: Removed CLO from header, compact sidebar styling matching `accountHighlightsPanel`, icon-only buttons, routes New Opportunity to custom creator tab.
- **Counsel_Account_Record_Page** flexipage: Removed CLO, Prep Link, Account Plans, System Information.
- **21 Counsel accounts** flagged with code names: Ace (AmEx), Albert (Amazon), Catdog (Cargill), Clutch (Corebridge), Cosmo (Cox Media), Daisy (Duracell), Dinger (Del Monte), Donald (Dolby), Dory (DHL), Echo (Testing), Fredbird (Fox), Goldy (GE Vernova), Goofy (Graybar), Nemo (National Grid), Nordy (Novelis), Pete (Peregrine), Plus (Plusgrade), Pluto (Petsmart), Vic (Vista/Avista/Envista).
- **Field name**: The live field is `Eudia_Counsel_2__c` (NOT `Eudia_Council_Account__c` from old metadata). All repo references corrected.
- **Profile**: "Eudia Standard Sales - Counsel View" — tested with Ben Brosnahan and Justin Hills. Has Target Pool tab, all Apex class access granted, all FLS matching Standard Sales.
- **Council Code Name Sync Flow** updated: When `Eudia_Council_Op__c` is checked on an Opportunity, the flow syncs `Code_Name__c` from Account AND renames the Opportunity Name to use the code name via SUBSTITUTE formula.
- **All existing Counsel opportunity names** already renamed (42 opps).
- **Sharing approach**: OWD is Public Read/Write; full record-level hiding is not possible without changing to Private. Sensitization is handled via the record page (dynamic component visibility).

### Pipeline Review Center Updates (Deployed)
- **Contrast improvement**: CSS variables darkened — text-secondary from `#706e6b` to `#4a4a4a`, text-tertiary from `#9e9e9e` to `#737373`, borders and alt backgrounds adjusted.
- **Counsel code names**: `getClosedWonQTD()` and `getPipelineData()` now use `Account.Account_Display_Name__c` for all account name references. Counsel accounts show code names throughout.
- **Net ACV for Closed Won**: Uses `Renewal_Net_Change__c` (labeled "Net ACV"). Asana shows $225k instead of $300k.
- **Won QTD in Forecast Tracking**: Moved beneath Commit in the tracking card. Shows total, deal count, recurring/project breakdown. Click to expand deal table.
- **Delta sign fix**: `numericDelta()` in `PipelineReviewController.cls` corrected — `oldValue` and `newValue` were swapped.
- **ACV changes logic fix**: Highlights now show increases and decreases separately.
- **Changes timeframe toggle**: Dropdown with Last 7 days, QTD, Last 14 days, Last 30 days. Controls the field history lookback period. Always visible in filter bar.
- **Dynamic column label**: WoW column header changes to "QTD", "14d", "30d" based on selected timeframe.
- **Sortable delta columns**: Δ ACV and Δ Days headers are clickable sort buttons.
- **Alternating row backgrounds**: Every other deal row has `#fafafa` background.
- **Products column widened**: `flex: 1.5` with `min-width: 140px` and wrapping enabled.
- **Highlights card restyled**: White background with left accent border instead of dark grey fill.
- **Tracking card**: White background, Commit and Weighted constrained to `max-width: 600px`.
- **`daysBack` parameter**: Added to `getPipelineData()` Apex method. Field history query now uses dynamic `DateTime` comparison instead of `LAST_N_DAYS:7`.

### Counsel View Profile Rollout
- **Justin Hills** moved to "Eudia Standard Sales - Counsel View" profile for testing
- **6 Apex classes** granted access: TargetPoolController, TopOfFunnelController, PipelineReviewController, PipelineLookbackController, CSHomeController, CSStaffingController
- **5 Account FLS** granted: Company_Revenue__c, In_Target_Pool__c, Target_Pod__c, Pool_Context__c, Outreach_Tier__c
- **Target Pool tab** added to Counsel View profile (`DefaultOn`)
- Ready to roll out to all sales reps by adding Account page assignment to "Eudia Standard Sales Profile" in app metadata

---

## Pending: John Dedych Transcript Recovery (URGENT)

**Status:** Command provided to user, awaiting John's execution.
John recorded an hour-long call (Coherent Patent Insights, Feb 24) but only got a partial transcript. The full recording is saved locally in his vault (Recordings or _backups folder). Plugin v4.8.1 fixes the auto-heal to handle this case. John needs to paste a terminal command that:
1. Updates his plugin to v4.8.1
2. Finds and marks his note with `**Transcription failed:** partial capture`
3. Restarts Obsidian (auto-heal runs 30s after startup, finds recording, re-transcribes)

If John reports it didn't work, check:
- Did the `find` locate his note? (look for "Coherent Patent" in .md files)
- Is the recording in `Recordings/` or `_backups/`?
- Check auto-heal logs in Obsidian dev console (`[Eudia AutoHeal]` prefix)

## Pending: Deploy Remaining Salesforce Metadata

Several items were coded but not all deployed:
- **Handover_Type__c formula field**: Cannot deploy — uses `CONTAINS(TEXT(Product_Lines_Multi__c))` which Salesforce doesn't support for multi-select picklists in formulas. Handover type is computed in Apex instead. The formula field metadata file exists but should NOT be deployed.
- **CS_Staffing_Alert flow overhaul**: Code complete but not deployed. Uses `Handover_Type__c` field reference — will need the flow updated to reference the Apex-computed value or use `Eudia_Tech__c` directly.
- **Account Health Archive Service + Flow**: Code complete, not deployed.
- **CS Renewals Quarterly Digest**: Code complete, not deployed.
- **Pipeline Lookback MoM Report**: Code complete, not deployed.

Use `sf project deploy start` (not `sfdx force:source:deploy`). The CLI is v2 (`sf`), not v1 (`sfdx`).

## Pending: Obsidian Plugin — Rajeev's Vault Setup

Rajeev's vault was set up Feb 25. Key issues identified:
- **styles.css was missing**: Plugin update commands must always include `styles.css` alongside `main.js` and `manifest.json`
- **Calendar display**: Fixed by including styles.css (meeting cards need the CSS for proper layout)
- **Update command for any user**: Always use this pattern:
```bash
VAULT=$(find ~/Documents -name ".obsidian" -type d -maxdepth 6 2>/dev/null | head -1 | sed 's/\/.obsidian//') && P="$VAULT/.obsidian/plugins/gtm-brain" && mkdir -p "$P" && curl -s https://gtm-wizard.onrender.com/api/plugin/main.js -o "$P/main.js" && curl -s https://gtm-wizard.onrender.com/api/plugin/manifest.json -o "$P/manifest.json" && curl -s https://gtm-wizard.onrender.com/api/plugin/styles.css -o "$P/styles.css" && echo '{"gtm-brain":true}' > "$VAULT/.obsidian/community-plugins.json" && echo "Updated to $(grep -o '"version":"[^"]*"' "$P/manifest.json")" && osascript -e 'quit app "Obsidian"' 2>/dev/null; echo "Reopen Obsidian."
```

---

## What NOT to Do

- Do NOT put regex with `\s`, `\d`, `\n`, `\w` inside template literals in `meetingPrepView.js`
- Do NOT redefine functions that exist in `public/assets/meeting-prep-helpers.js`
- Do NOT run scripts that call `initializeSalesforce()` while the server is running
- Do NOT change Salesforce field names without updating all references
- Do NOT add features not explicitly requested
- Do NOT send to #gtm-account-planning without explicit approval — use test endpoint or #testtest channel
- Do NOT reset the SF security token unless absolutely confirmed necessary (wastes time)
- Do NOT change Pipeline Review baseline values (`Q1_BASELINES`, `Q1_COMMIT_BY_BL`) mid-quarter — these are point-in-time snapshots from Q1 start
- Do NOT deploy Salesforce metadata without checking that test classes pass (`sfdx force:apex:test:run`)
- Do NOT modify `TargetPoolController.BL_ORDER`, `US_BLS`, `EU_BLS`, or `BL_CAPS` without confirming current BL roster

---

## Session Work (Feb 26, 2026 — Afternoon/Evening)

### Obsidian Plugin v4.9.8 → v4.10.2 (Major Overhaul)

**v4.9.8:** Fixed transcription chunking (4MB chunks, 90s timeout, 8MB threshold). Hidden utility folders via CSS.

**v4.9.9:** Flattened prospect accounts into Accounts/. Calendar matching includes _Prospects/. Mic permission validation with getUserMedia. SF sync confirmation modal. Multi-vault install script. Auto-update banner on hot-reload failure.

**v4.10.0:** Fixed auto-update spazzing loop (3 interacting bugs: hot-reload race condition, cooldown cleared by rollback check, migration moving 600+ folders). Added team role selector (Sales/CS/Executive/Product/Ops Admin). Exec/product account endpoint (Existing + active pipeline stages 1-5). Renamed all "vault" references to "Eudia Notetaker". Added sales leaders to EXEC_EMAILS.

**v4.10.1:** Calendar validation accepts any @eudia.com email (was BL_EMAILS whitelist). Fixed undefined variable `userGroup`→`role` in runSetup(). Added 120s timeout to non-chunked transcription. Fixed dynamic vault fallback name. Created `/fresh-install` page and `/api/plugin/fresh-install.sh` for clean installs. Pruned cachedAccounts after migration.

**v4.10.2:** Added catch-all Account Owner query to BL endpoint (Yahoo was missing). Added "Other" role for general notetaking. Essential folders (Recordings, _backups, _Analytics, _Customer Health, Next Steps) created for all roles. Smart scroll activates file explorer tab before revealInFolder.

### Key Architecture Changes

- **BL account query** now uses 4 SOQL queries: pipeline (user's open opps), target book (Q1_Target_Book__c), existing customers, catch-all owned. Pod-view aggregation removed from ownership endpoint (reserved for SF LWC).
- **Setup flow:** Role selector → Email → Account loading → Enrichment (with progress bar) → Folders created → SF connect (optional) → Quickstart
- **Fresh install script:** `/api/plugin/fresh-install.sh` — nukes old vaults, clears Obsidian registry, downloads fresh ZIP, registers vault, opens Obsidian. Served at `/fresh-install`.
- **Enrichment:** Progress bar replaces notice spam. Per-account updates. Batch size 10.
- **Calendar validation:** Any @eudia.com email accepted (no whitelist).

### Known Issues / Next Steps

1. **Internal debrief detection:** Transcripts that include post-call internal discussion (e.g., Riley/Mitch coaching session) should be auto-separated. Need to add heuristic to summarization prompt.
2. **Meeting note → wrong account:** Yahoo meeting logged under Warner Bros because Yahoo wasn't in Riley's account set. Fixed in v4.10.2 with catch-all query. Verify after deploy.
3. **Quickstart guide:** Needs embedded screenshots and more visual walkthrough. Current version is text-only. User wants actual UI screenshots integrated.
4. **Auto-update reliability:** Hot-reload via disablePlugin/enablePlugin is inherently fragile. Banner fallback exists but users still sometimes need Cmd+Q restart.
5. **Email-to-role mapping:** Hardcoded in ADMIN_EMAILS, EXEC_EMAILS, CS_EMAILS in TWO places (plugin + server). Should be moved to a server-side config endpoint.
6. **No authentication on ownership endpoint:** Anyone can query account data. Needs API key or Okta token.

### Active Users (Updated)

| User | Email | Version | Status |
|------|-------|---------|--------|
| Keigan | keigan.pesenti@eudia.com | v4.10.2 | Testing |
| Riley Stack | riley.stack@eudia.com | Needs fresh install | Send /fresh-install link |
| Sean Boyd | sean.boyd@eudia.com | v4.9.7 → auto-update | Send /fresh-install link |
| Zack | zack@eudia.com | Old version | Send /fresh-install link |
| Mike Ayres | michael.ayres@eudia.com | Needs setup | Admin role, 1856 accounts |
| Omar | omar@eudia.com | Not set up | Exec role, 204 accounts |
| Greg MacHale | greg.machale@eudia.com | v4.1.0 | Needs PowerShell update |

### Fresh Install Command (for any Mac user)

```bash
curl -sL https://gtm-wizard.onrender.com/api/plugin/fresh-install.sh | bash
```

Or send: https://gtm-wizard.onrender.com/fresh-install

---

## Security & Permissions

- Write operations restricted to Keigan (User ID: `U094AQE9V7D`)
- Meeting Prep auto-filtered to logged-in user's meetings
- Okta SSO for all web access
- Per-user Salesforce OAuth (PKCE) for plugin writes
- AES-256-GCM encryption for stored tokens
- Render PostgreSQL: SOC 2 Type II, data encrypted at rest

---

## Support

- **RevOps / GTM Engineering**: Keigan Pesenti (keigan.pesenti@eudia.com)
- **Product**: Zack Huffstutter
- **Engineering**: #eng-support Slack
