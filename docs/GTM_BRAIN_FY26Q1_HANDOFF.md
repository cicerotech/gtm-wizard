# GTM Brain FY26Q1 - Complete Project Handoff

**Last Updated:** February 6, 2026
**Latest Commit:** `bca0bd9` (Surgical exec rollout: Live calendar, date-accurate GTM Brain, resilient analytics)
**Production:** Live on Render.com at https://gtm-wizard.onrender.com (auto-deploys from `main`)
**Salesforce:** eudia.my.salesforce.com (Production Org)
**GitHub:** github.com/cicerotech/gtm-wizard (private)
**Builder:** Keigan Pesenti (keigan.pesenti@eudia.com)

---

## TABLE OF CONTENTS

1. [What GTM Brain Is](#what-gtm-brain-is)
2. [Architecture Overview](#architecture-overview)
3. [Tech Stack](#tech-stack)
4. [User Groups & Access Control](#user-groups--access-control)
5. [Obsidian Plugin](#obsidian-plugin)
6. [GTM Hub (Web)](#gtm-hub-web)
7. [Slack Bot](#slack-bot)
8. [AI / Intelligence Layer](#ai--intelligence-layer)
9. [Calendar Integration](#calendar-integration)
10. [Salesforce Integration](#salesforce-integration)
11. [Data Flow & Storage Architecture](#data-flow--storage-architecture)
12. [Weekly Reports & Automation](#weekly-reports--automation)
13. [Infrastructure & Deployment](#infrastructure--deployment)
14. [Recent Work (Feb 2026 Session)](#recent-work-feb-2026-session)
15. [Known Issues & Pending Work](#known-issues--pending-work)
16. [File Map](#file-map)
17. [Environment Variables](#environment-variables)
18. [How to Deploy](#how-to-deploy)

---

## WHAT GTM BRAIN IS

GTM Brain is an internal sales intelligence platform for Eudia (legal AI company). It connects Salesforce, Microsoft Outlook calendars, Slack, and Obsidian (desktop note-taking app) into a unified system that helps Business Leads (BLs) prepare for meetings, track deals, and manage accounts.

**Three interfaces:**
- **Obsidian Plugin** - Desktop app where BLs take meeting notes, record/transcribe calls, ask the GTM Brain AI about accounts, and view their calendar
- **GTM Hub** (web) - Browser-based dashboard at gtm-wizard.onrender.com with meeting prep, pipeline views, architecture docs, and admin analytics
- **Slack Bot** - Natural language queries in Slack for pipeline, deal status, account lookups, and automated weekly reports

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Obsidian Plugin │    │   GTM Hub (Web)  │    │   Slack Bot     │
│  (Desktop App)   │    │  (Browser)       │    │  (Slack API)    │
└────────┬────────┘    └────────┬─────────┘    └────────┬────────┘
         │                      │                        │
         └──────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Node.js / Express   │
                    │   (Render.com)        │
                    │                       │
                    │  - API Routes         │
                    │  - Intelligence Query │
                    │  - Calendar Service   │
                    │  - Transcription      │
                    │  - Report Generation  │
                    └───────────┬───────────┘
                                │
         ┌──────────┬───────────┼───────────┬──────────┐
         │          │           │           │          │
    ┌────▼────┐ ┌───▼───┐ ┌────▼────┐ ┌────▼───┐ ┌───▼────┐
    │Salesforce│ │MS Graph│ │ Claude  │ │ OpenAI │ │ SQLite │
    │(jsforce) │ │Calendar│ │(Anthro.)│ │Whisper │ │  (DB)  │
    └─────────┘ └───────┘ └─────────┘ └────────┘ └────────┘
```

**Query routing:** Intent-classified retrieval (not an orchestrator). Queries are classified by intent (PRE_MEETING, DEAL_STATUS, STAKEHOLDERS, PIPELINE_OVERVIEW, etc.), then the relevant data sources are fetched in parallel based on that intent. Each query is stateless -- context assembled fresh from retrieval, not from prior turns.

**Memory:** No conversation memory on the intelligence query side. Multi-layer caching: in-memory (15-min TTL for account context, 2-hr for AI summaries) -> file-based JSON caches (Slack intel, meeting prep) -> SQLite -> Salesforce as source of truth. Slack has separate short-lived conversation context (last 5 interactions, 30-min TTL).

---

## TECH STACK

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express.js |
| Hosting | Render.com (auto-deploy from GitHub `main`) |
| Database | SQLite (intelligence, calendar, notes) |
| CRM | Salesforce (jsforce v2 beta) |
| Calendar | Microsoft Graph API (Azure AD app) |
| AI - LLM | Anthropic Claude (via direct API + Socrates internal gateway) |
| AI - Transcription | OpenAI Whisper + GPT-4o summarization |
| AI - Enrichment | Clay API for attendee/company enrichment |
| Chat Platform | Slack (Bolt framework) |
| Desktop Plugin | Obsidian (TypeScript, esbuild) |
| PDF Generation | PDFKit |
| Excel Generation | ExcelJS |
| Auth | Okta (SSO for GTM Hub), per-user Salesforce OAuth (PKCE) |
| Logging | Winston (structured, correlation IDs) |
| Testing | Jest + Supertest |

---

## USER GROUPS & ACCESS CONTROL

Defined in `src/app.js` (lines 69-134) and `obsidian-plugin/src/AccountOwnership.ts` (lines 14-105).

| Group | Emails | Account Access | Calendar | Analytics |
|-------|--------|---------------|----------|-----------|
| **Admin** | keigan.pesenti, michael.ayers, zach | All accounts | Yes | Yes (admin-only tab) |
| **Exec** | omar, david, ashish, siddharth.saxena | All BL accounts (full 7-note structure) | Yes | No |
| **Sales Leader** | mitchell.loquaci, stephen.mulholland, riona.mchale | Direct reports' accounts | Yes | No |
| **BL** | 16 Business Leads (US, EMEA, IRE_UK regions) | Own accounts only | Yes | No |
| **CS** | nikhita.godiwala, jon.dedych, farah.haddad | Existing customers only | Yes | No |

**BL Regions (from `BL_REGIONS`):**
- **US:** asad.hussain, nathan.shine, julie.stefanich, olivia, ananth, justin.hills, mike.masiello, sean.boyd, riley.stack
- **EMEA:** greg.machale, tom.clancy, nicola.fratini, stephen.mulholland
- **IRE_UK:** conor.molloy, alex.fox, emer.flynn, riona.mchale

**Sales Leader Direct Reports:**
- Mitchell Loquaci (US RVP): Justin, Olivia, Sean, Riley
- Stephen Mulholland (EMEA VP): Tom, Conor, Nathan, Nicola
- Riona McHale (IRE_UK Head): Conor, Alex, Emer

**Calendar access** is gated by `BL_EMAILS_PILOT` in `src/services/calendarService.js` (lines 42-84). All of the above users plus siddharth.saxena are in this list.

---

## OBSIDIAN PLUGIN

**Location:** `obsidian-plugin/`
**Entry point:** `main.ts` (~5,300 lines)
**Build:** `cd obsidian-plugin && npm run build` (esbuild, outputs `main.js`)
**Distribution:** Bundled into `.zip` vault via `scripts/build-tailored-vault.js`, hosted at `/downloads/Business-Lead-Vault-2026.zip`

### Key Features

1. **Setup Wizard** - Enter email -> connects calendar -> optionally connects Salesforce -> account folders load
2. **Account Folders** - 7 sub-notes per account: Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps
3. **Calendar View** - Shows today's meetings fetched LIVE from Microsoft Graph API. Refresh button triggers fresh fetch.
4. **GTM Brain Chat** - Natural language queries about accounts via `IntelligenceQueryModal` -> `/api/intelligence/query`
5. **Audio Recording & Transcription** - MediaRecorder API -> OpenAI Whisper -> GPT-4o summarization
6. **Salesforce Sync** - Per-user OAuth (PKCE flow), syncs meeting notes to `Customer_Brain__c` field
7. **Smart Tags** - Auto-extracts product lines, MEDDICC fields from transcripts

### Key Source Files

| File | Purpose |
|------|---------|
| `main.ts` | Plugin entry, all UI (setup wizard, calendar view, chat modal, recording, settings) |
| `src/AccountOwnership.ts` | User group classification, static account mapping (266 accounts across 14 BLs), server-side fetching |
| `src/CalendarService.ts` | Fetches calendar data from backend, timezone-aware date handling |
| `src/AudioRecorder.ts` | MediaRecorder wrapper for meeting recording |
| `src/TranscriptionService.ts` | Backend communication for transcription/summarization |
| `src/SmartTagService.ts` | Tag extraction from transcripts |

### Account Folder Creation Flow

- **BLs** (`createTailoredAccountFolders`): 7 sub-notes per account
- **Execs/Admins** (`createAdminAccountFolders` -> `createExecAccountSubnotes`): Same 7-note structure as BLs (changed Feb 6 from single `_Account Info.md`)
- **Sales Leaders**: Direct reports' accounts aggregated
- Data source: Live Salesforce via `/api/bl-accounts/:email`, with static fallback in `AccountOwnership.ts`

---

## GTM HUB (WEB)

**URL:** https://gtm-wizard.onrender.com
**Auth:** Okta SSO (redirects to `/login`)
**Main view:** `src/views/unifiedHub.js` - Tabbed interface

### Tabs

| Tab | Content | View File |
|-----|---------|-----------|
| Sales Process | Sales methodology docs | `docs/sales-process.html` |
| Dashboard | Account dashboard | `src/slack/accountDashboard.js` |
| Meeting Prep | Week-at-a-glance with AI context | `src/views/meetingPrepView.js` |
| Architecture | System architecture diagram | `docs/gtm-brain-architecture.html` |
| Commands | Slack command reference | Inline in `unifiedHub.js` |
| Getting Started | Obsidian setup guide | `docs/getting-started.html` |
| Analytics | Admin-only usage stats | `src/views/analyticsView.js` |

### Meeting Prep Flow

1. User opens Meeting Prep tab
2. `meetingPrepView.js` loads week's calendar from `/api/meetings`
3. User clicks a meeting -> fetches `/api/meeting-context/:accountId?summarize=true`
4. Backend aggregates context from Salesforce (account, opps, contacts, tasks, events, Customer_Brain__c) + Slack intel + Obsidian notes
5. If `summarize=true`, passes context to Claude via `contextSummarizer.js` for AI brief
6. Returns JSON summary with executive summary, key takeaways, deal intel, next steps, sentiment

---

## SLACK BOT

**Framework:** Slack Bolt (`@slack/bolt`)
**Main files:** `src/slack/events.js` (7,800+ lines), `src/slack/commands.js`, `src/slack/interactive.js`

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/pipeline` | Pipeline summary with breakdown |
| `/forecast` | Forecast overview |
| `/deals` | Deal lookup |
| `/account` | Account information |
| `/contacts` | Contact lookup |

### Event-Driven Query System

`events.js` handles natural language messages in Slack channels. Flow:
1. Message received -> `intentParser.parseIntent()` classifies intent
2. Multi-layer classification: pattern match -> exact match -> semantic similarity -> LLM fallback
3. Intent routes to specialized handler (account lookup, pipeline query, deal status, etc.)
4. Handler builds SOQL query, fetches from Salesforce, formats response
5. Response posted back to thread

### Intelligence Extraction

`channelIntelligence.js` monitors designated Slack channels, extracts deal signals using LLM, stores in `intelligenceStore` (SQLite + file cache). Approved items sync to Salesforce `Customer_Brain__c`.

### Weekly Reports

| Report | File | Schedule |
|--------|------|----------|
| GTM Weekly Snapshot PDF | `blWeeklySummary.js` | Friday |
| Delivery Weekly Summary PDF | `deliveryWeeklySummary.js` | Friday |
| Full Pipeline Excel | `fullPipelineReport.js` | Friday |
| CSM Account Health Excel | `csmAccountHealth.js` | Friday |
| Finance Audit Excel | `financeWeeklyAudit.js` | Friday |
| Pipeline Report Excel | `reportToSlack.js` | On-demand |

---

## AI / INTELLIGENCE LAYER

### Query Service (`src/services/intelligenceQueryService.js`)

**Entry:** `processQuery({ query, accountId, accountName, userEmail })`

**Intent classification** (`classifyQueryIntent`):
- PRE_MEETING, DEAL_STATUS, STAKEHOLDERS, HISTORY, NEXT_STEPS, PAIN_POINTS, COMPETITIVE, PIPELINE_OVERVIEW, ACCOUNT_LOOKUP

**Context gathering** (`gatherContext`): Parallel fetch from Salesforce (account, opps, contacts, tasks, events), Slack intel cache, Obsidian notes, Customer_Brain__c field. 15-min in-memory cache.

**Prompt construction:**
- `buildSystemPrompt()` - Injects TODAY'S DATE, response guidelines, date accuracy rules, objectivity rules, formatting rules, stale deal definitions
- `buildUserPrompt()` - Assembles account context, opportunities, contacts, events with recency tags, meeting history
- Sends to Claude via Anthropic API or Socrates adapter

**Key prompt rules (added Feb 6, 2026):**
- TODAY'S DATE injected into every prompt
- Absolute dates required (no "yesterday" unless literally yesterday)
- No editorializing -- factual and objective only
- No unsolicited recommendations
- No duplicated sections
- No empty sections

### Context Summarizer (`src/services/contextSummarizer.js`)

Generates AI-powered meeting context summaries. Uses Claude with structured JSON output. In-memory cache with 2-hour TTL, date-aware cache keys (regenerates daily). Rate limited: 3 per account per hour, 50 per day.

### Intent Parser (`src/ai/intentParser.js`)

ML-enhanced intent classification for Slack queries. Hybrid cascade: pattern match -> exact match -> semantic similarity (embeddings) -> LLM fallback. Supports 50+ intents.

### ML Classifier (`src/ai/mlIntentClassifier.js`)

Multi-layer classification with persistent learning. Stores learned patterns in `data/intent-learning.json`.

---

## CALENDAR INTEGRATION

**Service:** `src/services/calendarService.js`
**API:** Microsoft Graph API via `@microsoft/microsoft-graph-client`
**Auth:** Azure AD app with delegated calendar read permissions

### How It Works

**For Obsidian Plugin (per-user, live):**
- `/api/calendar/:email/today` and `/api/calendar/:email/week` endpoints fetch DIRECTLY from Microsoft Graph API for that specific user on every request
- Returns ALL meetings (internal + external), not just customer meetings
- No stale SQLite dependency -- live data every time
- Changed Feb 6, 2026 from reading stale SQLite to live Graph API

**For GTM Hub / Meeting Prep (batch, cached):**
- `getUpcomingMeetingsForAllBLs()` fetches calendars for all BLs in parallel (batches of 3)
- Filters to customer meetings only (external attendees, no internal keywords)
- In-memory cache with 10-minute TTL
- Used by Meeting Prep view, intelligence queries, and enrichment

**Meeting classification:** Pattern-based classification of meeting type (intro, demo, discovery, scoping, compliance, proposal, negotiation, followup, CAB) for sales velocity tracking.

**Calendar access gating:** All calendar endpoints validate against `BL_EMAILS_PILOT` in `calendarService.js`. Users not in this list get 403.

---

## SALESFORCE INTEGRATION

**Client:** jsforce v2 beta
**Connection:** Service account + per-user OAuth (PKCE)
**Key objects:**

| Object | Purpose |
|--------|---------|
| Account | Customer/prospect accounts with custom fields (Company_Context__c, Key_Decision_Makers__c, Pain_Points__c, Competitive_Landscape__c) |
| Opportunity | Deals with ACV__c, Sales_Type__c, Pod__c, Product_Lines_Multi__c, Calculated_Probability__c |
| Contact | Contacts with enrichment fields |
| Contract | Contracts with Contract_Line_Item__c children |
| Delivery__c | Custom object for delivery tracking (Account, Opportunity, Status, Health Score, etc.) |
| Pipeline_Snapshot__c | Weekly pipeline snapshots for trending |
| BL_Performance_Metrics__c | BL attainment metrics |
| GTM_Usage_Log__c | Usage analytics for GTM site |
| Outbound_Target__c | Outbound campaign targeting |
| Customer_Brain__c (Account field) | Meeting notes/intelligence aggregation field |

**Per-user OAuth:** `src/services/userTokenService.js` manages encrypted tokens (AES-256-GCM) in Git-versioned files. PKCE flow starts at `/api/sf/auth/start`, callback at `/api/sf/auth/callback`.

**Platform Events:** `Closed_Won_Alert__e`, `CS_Staffing_Alert__e`, `Case_Created__e` -- subscribed via jsforce streaming API, posted to Slack channels.

**Flows:** 165+ Salesforce flows for automation (auto-assignment, field sync, health tracking, etc.)

---

## DATA FLOW & STORAGE ARCHITECTURE

### "Zero Render Storage" Pattern

Customer data does NOT persist to Render disk. Architecture:

| Data Type | Storage | Persistence |
|-----------|---------|-------------|
| Account/Opp/Contact data | Salesforce | Permanent (source of truth) |
| Meeting notes | Salesforce Customer_Brain__c | Permanent |
| Calendar events | In-memory cache | Ephemeral (10-15 min TTL, lost on restart) |
| AI summaries | In-memory cache | Ephemeral (2-hr TTL, daily regeneration) |
| Account context | In-memory cache | Ephemeral (15-min TTL) |
| Slack intelligence | File cache (JSON) | Survives deploys (Git-versioned) |
| Meeting prep | File cache (JSON) | Survives deploys (Git-versioned) |
| OAuth tokens | Encrypted file (AES-256-GCM) | Survives deploys (Git-versioned) |
| Plugin telemetry | File (JSON) | Survives deploys (Git-versioned) |
| Intelligence extraction | SQLite | Persistent on Render disk |
| Obsidian synced notes | SQLite | Persistent on Render disk |

### Data Sources Per Intelligence Query

```
User asks about account
  -> Salesforce: Account fields, Opportunities, Contacts, Tasks, Events
  -> Customer_Brain__c: Meeting history (truncated to 3K chars)
  -> Slack Intel Cache: Channel signals (top 3)
  -> Obsidian Notes: Synced vault notes (top 3)
  -> Calendar: Recent/upcoming meetings (top 5)
  -> All assembled into single-turn Claude prompt
```

---

## WEEKLY REPORTS & AUTOMATION

### GTM Weekly Snapshot (`blWeeklySummary.js`)

2-page PDF posted to Slack every Friday:
- **Page 1:** Q1 FY26 Forecast table (Target, AI-Enabled Commit/Weighted/Midpoint), Q1 Pipeline by Sales Type, Q1 Pipeline by Solution (with Mix %), Targeting Q1 FY26 Close Top 10 Opps, Targeting This Month deals
- **Page 2:** AI-Enabled Commit thru EOQ with BL breakdown bar chart, Business Lead Summary table (Commit*, Weighted, # Opps, Avg ACV, Avg Days), footnote "*Commit reflects AI-Enabled Net-New only"
- **Constants:** `Q1_FY26_FORECAST` (target: $6m, floor: $4.3m, expected: $5.4m, midpoint: $4.8m), `BL_COMMIT_SNAPSHOT` with per-BL AI-Enabled Commit amounts

### Delivery Weekly Summary (`deliveryWeeklySummary.js`)

PDF + Excel + Slack message:
- Queries `Delivery__c` with `Opportunity__r.StageName`
- Segments by Deal Status: "In Delivery" (Won) vs "Late Stage" (Active)
- Slack message shows count + $ per segment with top owners

### Other Reports

- `fullPipelineReport.js` - Full pipeline Excel with Active + Closed Won tabs
- `csmAccountHealth.js` - CSM account health Excel
- `financeWeeklyAudit.js` - Finance audit Excel from SF report
- `unifiedWeeklyReport.js` - Consolidates all into single Friday delivery

---

## INFRASTRUCTURE & DEPLOYMENT

### Current: Render.com

- **Service:** Web Service (Node.js)
- **Auto-deploy:** Push to `main` branch -> Render deploys in ~2-3 minutes
- **Start command:** `node src/app.js`
- **Health check:** `/health`
- **Environment:** All secrets in Render env vars (see Environment Variables section)
- **Persistent disk:** Not used (Zero Render Storage pattern)

### Future: AWS (prepared but not active)

Terraform configs in `infrastructure/`:
- ECS Fargate cluster, ALB, EFS for persistent storage, Secrets Manager
- VPC with public/private subnets
- IAM roles and policies
- Not deployed -- Render is current production

### Deployment Process

```bash
# 1. Make changes
# 2. Build plugin if obsidian-plugin/ changed
cd obsidian-plugin && npm run build

# 3. Rebuild vault if plugin or build-tailored-vault.js changed
cd .. && node scripts/build-tailored-vault.js

# 4. Commit and push
git add . && git commit -m "description" && git push origin main

# 5. Render auto-deploys (2-3 min)
```

---

## RECENT WORK (FEB 2026 SESSION)

### Commits (chronological)

| Commit | Description |
|--------|-------------|
| `dd2fe05` | Simplify Delivery Snapshot Slack message - segment by Deal Status (Won vs Active) |
| `bf3ce45` | Fix deploy: Add missing mobileVault.js required by app.js mobile routes |
| `f2ccd0d` | Fix analytics SOQL error: Remove User_Name__c field not in Salesforce org |
| `8c4d35a` | Exec rollout: Add Siddharth to execs, fix calendar refresh, improve Quick Start |
| `bca0bd9` | Surgical exec rollout: Live calendar, date-accurate GTM Brain, resilient analytics |

### What Was Done

**1. New Exec User Added**
- `siddharth.saxena@eudia.com` added to `EXEC_EMAILS` in `AccountOwnership.ts` and `BL_EMAILS_PILOT` in `calendarService.js`
- Gets full account access (all BL accounts with 7-note structure)

**2. Exec Account Folders Upgraded**
- Previously: execs got single `_Account Info.md` placeholder per account
- Now: execs get full 7-note BL structure (Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps)
- Changed `createAdminAccountFolders()` in `main.ts` to use new `createExecAccountSubnotes()` method

**3. Calendar Fixed -- Live Graph API**
- `/api/calendar/:email/today` and `/week` endpoints now fetch DIRECTLY from Microsoft Graph API per-user
- Previously read from stale SQLite data (synced every 6 hours, only customer meetings)
- Now returns ALL meetings (internal + external), live and accurate
- No more wrong meetings or stale data

**4. GTM Brain Date Accuracy Fixed**
- `TODAY'S DATE` injected into all AI system prompts and user prompts
- Strict rules: no "yesterday" unless literally yesterday, absolute dates required
- Objectivity rules: no editorializing, no unsolicited recommendations
- Anti-duplication: each fact appears exactly once
- Date-aware cache keys in `contextSummarizer.js` (summaries regenerate daily)

**5. Analytics Page Fixed**
- Each SOQL query wrapped in independent try/catch (missing fields don't crash page)
- Removed `User_Name__c` and `Page_Name__c` from queries (fields don't exist in SF org)
- Simplified record insert to only core fields known to exist
- Analytics tab is admin-only (keigan, michael, zach)

**6. Delivery Snapshot Refined**
- SOQL query updated to include `Opportunity__r.StageName`
- Slack message segments into "In Delivery" (Won) and "Late Stage" (Active)
- Fixed duplicate `oppStage` declaration syntax error

**7. Quick Start Guide Rewritten**
- `scripts/build-tailored-vault.js` Quick Start content rewritten for exec clarity
- Clear distinction between Account Folders (sidebar) and GTM Brain (chat)
- Simplified workflow instructions for non-technical users

**8. GTM Weekly Snapshot PDF Updates (earlier in session)**
- Renamed to "Q1 Pipeline by Sales Type"
- Removed Late Stage section, FY25 Close row, RR components
- Added Q1 FY26 Forecast table with refined styling (light green/blue, 9pt amounts, italicized subtext)
- Added Mix % column to Q1 Pipeline by Solution
- Updated BL commit values to AI-Enabled Commit (Net)
- Changed page 2 header to "AI-Enabled Commit thru EOQ"
- Added asterisk footnote to Business Lead Summary: "*Commit reflects AI-Enabled Net-New only"
- Replaced 'Gov - DOD' with 'Space Systems Command'
- Corrected deal counts, added net ACV callouts

---

## KNOWN ISSUES & PENDING WORK

### Active Issues

1. **Obsidian Plugin TypeScript Errors** - Pre-existing TS errors in `main.ts` that don't affect build (esbuild ignores type errors). Non-blocking.
2. **Test Suite Failures** - Multiple test files fail (pre-existing). Tests need updating for recent changes.
3. **Scheduled Jobs Disabled** - `src/slack/scheduled.js` has cron jobs commented out pending SF auth fixes.
4. **GTM_Usage_Log__c Missing Fields** - Salesforce object exists but is missing `Page_Name__c`, `User_Name__c`, `Session_Id__c`, `User_Agent__c`, `IP_Address__c`. Only `User_Email__c`, `Event_Type__c`, `Event_Date__c`, `Event_Timestamp__c` confirmed working.
5. **Mobile PWA** - `src/views/mobileVault.js` and routes exist but are early-stage. Login, account browsing, recording work but not polished.

### Pending Enhancements

1. **GTM Brain Response Quality** - Continue testing across accounts. Validate intelligence grounding for all accounts, not just high-activity ones. Assess which accounts have enough data for high-value answers.
2. **Calendar Accuracy Validation** - Live Graph API is deployed but needs validation across multiple users and timezones.
3. **Exec Vault Testing** - Siddharth testing blind setup. Collect feedback on UX, confusion points, feature gaps.
4. **Render Subprocessor Approval** - Working with engineering/legal (Pankaj/Terry/Raghu) to get Render approved. SOC 2 Type II, ISO 27001, DPA available.
5. **Orchestrator Architecture** - On roadmap for multi-step reasoning queries. Current intent-classified retrieval handles single-turn queries well.

---

## FILE MAP

### Core Backend (`src/`)

```
src/
├── app.js                          # Express server, ALL route definitions (~7,100 lines)
├── services/                       # 45 service modules
│   ├── intelligenceQueryService.js  # GTM Brain AI query engine
│   ├── intelligenceStore.js         # SQLite storage for intelligence
│   ├── calendarService.js           # Microsoft Graph calendar integration
│   ├── contextSummarizer.js         # Claude-powered meeting context summaries
│   ├── meetingPrepService.js        # Meeting preparation data aggregation
│   ├── transcriptionService.js      # OpenAI Whisper transcription
│   ├── userTokenService.js          # Per-user OAuth token management
│   ├── usageLogger.js               # GTM site analytics logging
│   ├── slackIntelCache.js           # File-based Slack intel cache
│   └── ... (40 more)
├── slack/                           # Slack bot + reports
│   ├── events.js                    # Event handler (~7,800 lines)
│   ├── commands.js                  # Slash commands
│   ├── blWeeklySummary.js           # GTM Weekly Snapshot PDF
│   ├── deliveryWeeklySummary.js     # Delivery Weekly Summary PDF
│   └── ... (14 more)
├── ai/                              # AI/ML layer
│   ├── intentParser.js              # Intent classification
│   ├── mlIntentClassifier.js        # ML classifier
│   ├── socratesAdapter.js           # LLM gateway adapter
│   └── ... (7 more)
├── views/                           # HTML/JS view generators
│   ├── unifiedHub.js                # GTM Hub main view
│   ├── meetingPrepView.js           # Meeting prep UI
│   ├── analyticsView.js             # Admin analytics
│   └── ... (6 more)
├── routes/                          # Route modules
│   ├── analytics.js
│   └── emailBuilder.js
├── config/
│   └── queryPatterns.json           # Query pattern definitions
├── jobs/
│   └── refreshIntelCache.js         # Scheduled cache refresh (every 6 hours)
└── data/
    └── johnsonHanaData.js           # JH-specific data
```

### Obsidian Plugin (`obsidian-plugin/`)

```
obsidian-plugin/
├── main.ts                # Plugin entry (~5,300 lines)
├── main.js                # Built output (esbuild)
├── manifest.json          # Plugin manifest v4.0.0
├── styles.css             # Plugin styles
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── src/
    ├── AccountOwnership.ts  # User/account mapping (~900 lines)
    ├── CalendarService.ts   # Calendar API client
    ├── AudioRecorder.ts     # Recording
    ├── TranscriptionService.ts
    └── SmartTagService.ts
```

### Data (`data/`)

```
data/
├── slack-intel-cache.json       # Slack intelligence cache (Git-versioned)
├── meeting-prep-cache.json      # Meeting prep cache
├── tokens/                      # Encrypted OAuth tokens
├── intent-learning.json         # ML intent learning data
├── telemetry-events.json        # Plugin telemetry
└── intelligence.db              # SQLite database
```

---

## ENVIRONMENT VARIABLES

Required in Render (or `.env` locally):

| Variable | Purpose |
|----------|---------|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | Slack request verification |
| `SLACK_APP_TOKEN` | Slack app-level token (Socket Mode) |
| `SF_LOGIN_URL` | Salesforce login URL |
| `SF_USERNAME` | Salesforce service account |
| `SF_PASSWORD` | Salesforce password |
| `SF_SECURITY_TOKEN` | Salesforce security token |
| `SF_CLIENT_ID` | Salesforce Connected App client ID |
| `SF_CLIENT_SECRET` | Salesforce Connected App secret |
| `SF_REDIRECT_URI` | OAuth callback URL |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (Whisper + GPT-4o) |
| `AZURE_TENANT_ID` | Azure AD tenant |
| `AZURE_CLIENT_ID` | Azure AD app client ID |
| `AZURE_CLIENT_SECRET` | Azure AD app secret |
| `CLAY_API_KEY` | Clay enrichment API key |
| `OKTA_ISSUER` | Okta OIDC issuer URL |
| `OKTA_CLIENT_ID` | Okta client ID |
| `OKTA_CLIENT_SECRET` | Okta client secret |
| `OKTA_REDIRECT_URI` | Okta callback URL |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for OAuth token encryption |
| `SESSION_SECRET` | Express session secret |
| `GITHUB_TOKEN` | GitHub PAT for Git operations |
| `PORT` | Server port (default 10000 on Render) |

---

## HOW TO DEPLOY

### Standard Deploy (Render)

```bash
git push origin main
# Render auto-deploys in 2-3 minutes
# Monitor at dashboard.render.com
```

### Plugin Update

```bash
cd obsidian-plugin
npm run build                        # Outputs main.js (144KB minified)
cd ..
node scripts/build-tailored-vault.js # Rebuilds .zip with new plugin
git add . && git commit -m "Update plugin" && git push origin main
```

### New User Vault Setup

1. User downloads `.zip` from GTM site Getting Started page
2. Unzips anywhere on their machine
3. Opens folder as vault in Obsidian
4. Enters their @eudia.com email in setup wizard
5. Account folders load automatically (live from Salesforce, or static fallback)
6. Optional: Connect Salesforce for per-user OAuth

### Existing User Vault Update

User must delete old vault and re-download fresh `.zip` to get latest plugin code. There is no auto-update mechanism for the Obsidian plugin.

---

## KEY CONSTANTS & CONFIGURATION

### GTM Weekly Snapshot (`blWeeklySummary.js`)

```javascript
const Q1_FY26_FORECAST = { floor: 4.30, target: 6.00, expected: 5.40, midpoint: 4.80 };

const BL_COMMIT_SNAPSHOT = {
  'Olivia Jung': 2.08, 'Ananth Cherukupally': 0.75, 'Justin Hills': 0.00,
  'Nathan Shine': 0.27, 'Asad Hussain': 0.00, 'Julie Stefanich': 0.16,
  'Greg MacHale': 0.30, 'Tom Clancy': 0.35, 'Conor Molloy': 0.16,
  'Alex Fox': 0.15, 'Nicola Fratini': 0.00, 'Sean Boyd': 0.00,
  'Riley Stack': 0.00, 'Mike Masiello': 0.10
};
```

### Static Account Mapping (`AccountOwnership.ts`)

- Version: `2026-02`
- Last updated: `2026-02-03`
- Total: 14 business leads, 266 accounts
- Auto-generated from Excel spreadsheet

---

*End of handoff document. This document contains everything needed to continue development on GTM Brain.*
