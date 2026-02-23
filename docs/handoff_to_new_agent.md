# GTM Engineering Q1 FY26 — Project Handoff

**Updated: February 20, 2026**
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

### 1. Obsidian Sales Workspace (v4.7.2)

Desktop tool for all Business Leads. Electron-based Obsidian plugin.

**Capabilities:**
- Two-way meeting transcription (mic + system audio via 6-strategy Electron fallback chain)
- Pre-meeting intelligence briefs pulled live from Salesforce (contacts, deal history, account context)
- Account-specific AI context within each meeting note
- CS-specific transcription format with quotable moments
- Meeting note templates (Sales Discovery/MEDDIC, Demo/Presentation, General Check-In)
- Slack Copy command (Cmd+P > "Copy Note for Slack")
- Audio safety net (saves recording to vault before server upload)
- Silent auto-update (zero user action required)
- Calendar view with external-only filter and past meeting scrollback

**Architecture:**
- Plugin source: `obsidian-plugin/main.ts` (~8,400 lines) + `obsidian-plugin/src/AudioRecorder.ts`
- Build: `cd obsidian-plugin && npm run build` (esbuild, <1s)
- Served via `/api/plugin/main.js`, version check at `/api/plugin/version`
- Vault structure: 1,109 accounts (prospect/active split), 7 sub-notes per account
- Per-user Salesforce OAuth (PKCE) for plugin writes
- Auto-update checks on `onload()`, downloads new files if version is higher

**Known Issue:**
- Two-way audio capture works but is not 100% reliable across all hardware configs
- Non-blocking notice appears when no virtual device detected

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

### 4. Pipeline Review Center (Salesforce LWC)

Live Salesforce dashboard for pipeline management.

**Capabilities:**
- Per-BL pipeline grouped by owner with expandable deal rows
- Header metrics: Commit, BL Forecast, In-Qtr, AI-Enabled
- BL quick-nav sidebar for jumping between business leads
- WoW Forecast Category tracking (deals moving in/out of Commit)
- Inline edit: Next Steps, Products, Stage, ACV, Target Sign Date
- Product edit via multi-select checkbox group (12 product options)

**Key Files:**
- `salesforce/force-app/main/default/classes/PipelineReviewController.cls`
- `salesforce/force-app/main/default/lwc/pipelineReviewCenter/`

**Header calculation:**
- Commit = sum of ACV for deals with Forecast Category = Commit
- BL Forecast = sum of `Blended_Forecast_base__c` (SF formula: 100% Commit, 60% Gut)
- In-Qtr = Commit deals with target sign date in current quarter
- AI = `Weighted_ACV_AI_Enabled__c`

### 5. Customer Success Dashboard (Salesforce LWC)

**Capabilities:**
- Outcomes tab: structured JSON outcomes (Delivered / In Delivery / Near-Term) parsed from `CS_Outcome_Data__c`
- 67 outcomes populated across 38 accounts
- Late-Stage Pipeline tab: deals with `CS_Staffing__c = true`
- CS Staffing Request modal on Opportunity record page (fields: Key Stakeholders, Products Purchased, Commercial Terms, Contract Term, Auto-Renew, Customer Goals)

**Key Files:**
- `salesforce/force-app/main/default/classes/CSHomeController.cls`
- `salesforce/force-app/main/default/lwc/csHomeDashboard/`
- `salesforce/force-app/main/default/lwc/csStaffingModal/`

**Known issue:** `CS_Staffing__c` field was previously named `CS_Staffing_Flag__c` in some code paths. All references should use `CS_Staffing__c`.

### 6. Account Scoring Engine

**Completed artifacts:**
- `data/f500_prioritization.csv` — 500 F500 companies scored (composite: legal spend 50%, CLO warmth 30%, AI/industry fit 20%)
- `data/f500_prioritization_enriched.csv` — Enriched with CLO names, AI-forward signals, Salesforce overlap
- `data/F500_Raw_Data.xlsx` — Excel with formula-driven scores, assumption tables, distribution sheet
- `data/non_f500_top50_prioritized.csv` — Top 50 non-F500 companies (mid-market, private, international)
- `data/non_f500_candidates_master.json` — 72 researched candidates
- `scripts/build_non_f500_top50.py` — Reproducible scoring script
- `data/f500_legal_spend_multipliers.csv` — 65 industry categories mapped to legal spend % of revenue

### 7. Meeting Prep Intelligence

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

### 8. Salesforce Configuration

**Custom objects/fields deployed:**
- Opportunity: TCV__c, TCV_Calculated__c (formula: `ACV * MAX(1, Term/12)`), Term__c, BOI_Deal_Code__c, CS fields (CSM_Requested__c, CS_Key_Stakeholders__c, CS_Products_Purchased__c, CS_Commercial_Terms__c, CS_Contract_Term__c, CS_Auto_Renew__c, CS_Customer_Goals__c)
- Account: CS_Outcome_Data__c, In_Target_Pool__c, Target_Pod__c, Q1_Target_Book__c, Industry_Grouping__c, Company_Revenue__c, Outreach_Tier__c, Pool_Context__c
- Campaign: Content_Type__c, Cost_Per_Lead__c, Event fields, Funnel_Stage__c, ROI__c, Target_Industry__c

**Flows:**
- Account_Health_History_On_Update
- CS_Staffing_Alert (fires at Stage 4)
- Account_Pool_Sync

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
| `obsidian-plugin/main.ts` | ~8,400 | Obsidian plugin source |

---

## Recent Completed Work (Feb 10-20, 2026)

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

## What NOT to Do

- Do NOT put regex with `\s`, `\d`, `\n`, `\w` inside template literals in `meetingPrepView.js`
- Do NOT redefine functions that exist in `public/assets/meeting-prep-helpers.js`
- Do NOT run scripts that call `initializeSalesforce()` while the server is running
- Do NOT change Salesforce field names without updating all references
- Do NOT add features not explicitly requested
- Do NOT send to #gtm-account-planning without explicit approval — use test endpoint or #testtest channel
- Do NOT reset the SF security token unless absolutely confirmed necessary (wastes time)

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
