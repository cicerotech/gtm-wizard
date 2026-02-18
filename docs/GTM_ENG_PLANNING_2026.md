# GTM Engineering Planning 2026

**Last Updated:** February 18, 2026
**Latest Commit:** `37191a7` (GTM Brain pipeline intelligence + critical data fix)
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
6. [Account Enrichment System](#account-enrichment-system)
7. [CS User Experience (Nikhita / CSMs)](#cs-user-experience)
8. [GTM Hub (Web)](#gtm-hub-web)
9. [Slack Bot](#slack-bot)
10. [AI / Intelligence Layer](#ai--intelligence-layer)
11. [Calendar Integration](#calendar-integration)
12. [Salesforce Integration](#salesforce-integration)
13. [Salesforce Flows & Automation](#salesforce-flows--automation)
14. [Data Flow & Storage Architecture](#data-flow--storage-architecture)
15. [Weekly Reports & Automation](#weekly-reports--automation)
16. [Infrastructure & Deployment](#infrastructure--deployment)
17. [Recent Work (Feb 2026 — Complete Log)](#recent-work-feb-2026--complete-log)
18. [Weekly Snapshot Overhaul (Feb 13)](#weekly-snapshot-overhaul-feb-13)
19. [Pipeline Review LWC — Net ACV Update](#pipeline-review-lwc--net-acv-update)
20. [Salesforce Metadata Updates (Feb 13)](#salesforce-metadata-updates-feb-13)
21. [Q1 Account Targeting Exercise](#q1-account-targeting-exercise)
22. [Resolved Issues (Feb 2026)](#resolved-issues-feb-2026)
23. [Known Issues & Pending Work](#known-issues--pending-work)
24. [File Map](#file-map)
25. [Environment Variables](#environment-variables)
26. [How to Deploy](#how-to-deploy)
27. [Key Constants & Configuration](#key-constants--configuration)

---

## WHAT GTM BRAIN IS

GTM Brain is an internal sales intelligence platform for Eudia (legal AI company). It connects Salesforce, Microsoft Outlook calendars, Slack, and Obsidian (desktop note-taking app) into a unified system that helps Business Leads (BLs), Customer Success (CS), Executives, and Sales Leaders prepare for meetings, track deals, and manage accounts.

**Three interfaces:**
- **Obsidian Plugin** — Desktop app where users take meeting notes, record/transcribe calls, ask the GTM Brain AI about accounts, and view their calendar. Pre-loaded with account folders, contacts, and intelligence data from Salesforce.
- **GTM Hub** (web) — Browser-based dashboard at gtm-wizard.onrender.com with meeting prep, pipeline views, architecture docs, and admin analytics.
- **Slack Bot** — Natural language queries in Slack for pipeline, deal status, account lookups, and automated weekly reports.

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
                    │  - Enrichment Engine  │
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

**Query routing:** Intent-classified retrieval (not an orchestrator). Queries are classified by intent (PRE_MEETING, DEAL_STATUS, STAKEHOLDERS, PIPELINE_OVERVIEW, etc.), then the relevant data sources are fetched in parallel based on that intent. Each query is stateless — context assembled fresh from retrieval, not from prior turns.

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
| AI — LLM | Anthropic Claude (via direct API + Socrates internal gateway) |
| AI — Transcription | OpenAI Whisper + GPT-4o summarization |
| AI — Enrichment | Clay API for attendee/company enrichment |
| Chat Platform | Slack (Bolt framework) |
| Desktop Plugin | Obsidian (TypeScript, esbuild) |
| PDF Generation | PDFKit |
| Excel Generation | ExcelJS |
| Auth | Okta (SSO for GTM Hub), per-user Salesforce OAuth (PKCE) |
| Logging | Winston (structured, correlation IDs) |
| Testing | Jest + Supertest |

---

## USER GROUPS & ACCESS CONTROL

Defined in `src/app.js` and `obsidian-plugin/src/AccountOwnership.ts`.

| Group | Emails | Account Access | Calendar | Analytics |
|-------|--------|---------------|----------|-----------|
| **Admin** | keigan.pesenti, michael.ayers, mike.flynn, zach | All accounts | Yes | Yes (admin-only tab) |
| **Exec** | omar, david, ashish, siddharth.saxena | All BL accounts (full 7-note structure) | Yes | No |
| **Sales Leader** | mitchell.loquaci, stephen.mulholland, riona.mchale | Direct reports' accounts | Yes | No |
| **BL** | 16 Business Leads (US, EMEA, IRE_UK regions) | Own accounts only | Yes | No |
| **CS** | nikhita.godiwala, jon.dedych, farah.haddad | Existing customers + CS Staffing flagged | Yes | No |
| **CS Manager** | nikhita.godiwala | CS accounts + direct reports' notes/dashboard | Yes | No |

### BL Regions (from `BL_REGIONS`)

- **US:** asad.hussain, nathan.shine, julie.stefanich, olivia, ananth, justin.hills, mike.masiello, sean.boyd, riley.stack
- **EMEA:** greg.machale, tom.clancy, nicola.fratini, stephen.mulholland
- **IRE_UK:** conor.molloy, alex.fox, emer.flynn, riona.mchale

### Sales Leader Direct Reports

- Mitchell Loquaci (US RVP): Justin, Olivia, Sean, Riley
- Stephen Mulholland (EMEA VP): Tom, Conor, Nathan, Nicola
- Riona McHale (IRE_UK Head): Conor, Alex, Emer

### CS Manager Direct Reports

- Nikhita Godiwala (CS Manager): Jon Dedych, Farah Haddad

**Calendar access** is gated by `BL_EMAILS_PILOT` in `src/services/calendarService.js`. All of the above users plus siddharth.saxena are in this list.

---

## OBSIDIAN PLUGIN

**Location:** `obsidian-plugin/`
**Entry point:** `main.ts` (~7,645 lines)
**Build:** `cd obsidian-plugin && npm run build` (esbuild, outputs `main.js`)
**Distribution:** Bundled into `.zip` vault via `scripts/build-tailored-vault.js`, hosted at `/downloads/Business-Lead-Vault-2026.zip` (88KB)

### Key Features

1. **Setup Wizard** — Enter email -> connects calendar -> optionally connects Salesforce -> account folders load -> enrichment runs synchronously
2. **Account Folders** — 7 sub-notes per account: Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps
3. **Synchronous Enrichment** — Contacts, intelligence, and activity data populate from Salesforce during setup (not background). Users see progress notices.
4. **Calendar View** — Shows today's meetings fetched LIVE from Microsoft Graph API. Refresh button triggers fresh fetch.
5. **Auto-Navigate to Meeting Notes** — When user creates a meeting note, plugin auto-opens the note and reveals it in the file explorer (scrolls sidebar to the account folder)
6. **GTM Brain Chat** — Natural language queries about accounts via `IntelligenceQueryModal` -> `/api/intelligence/query`
7. **Audio Recording & Transcription** — MediaRecorder API -> OpenAI Whisper -> GPT-4o summarization
8. **Salesforce Sync** — Per-user OAuth (PKCE flow), syncs meeting notes to `Customer_Brain__c` field
9. **Smart Tags** — Auto-extracts product lines, MEDDICC fields from transcripts
10. **Auto-Enrich on Vault Reopen** — Checks for unenriched accounts (missing `enriched_at` frontmatter) and triggers background enrichment

### Key Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `main.ts` | Plugin entry: all UI (setup wizard, calendar view, chat modal, recording, settings), enrichment engine, account management | ~7,645 |
| `src/AccountOwnership.ts` | User group classification, static CS account mapping (100 accounts with real SF IDs), server-side fetching | ~2,151 |
| `src/CalendarService.ts` | Fetches calendar data from backend, timezone-aware date handling | — |
| `src/AudioRecorder.ts` | MediaRecorder wrapper for meeting recording | — |
| `src/TranscriptionService.ts` | Backend communication for transcription/summarization | — |
| `src/SmartTagService.ts` | Tag extraction from transcripts | — |

### Account Folder Creation Flow

- **BLs** (`createTailoredAccountFolders`): 7 sub-notes per account, then synchronous enrichment
- **CS Users** (`handleCalendarConnect` CS path): Uses `CS_STATIC_ACCOUNTS` (100 accounts with real 18-char SF IDs) for instant folder creation, then synchronous enrichment
- **Execs/Admins** (`createAdminAccountFolders` -> `createExecAccountSubnotes`): Same 7-note structure as BLs
- **Sales Leaders**: Direct reports' accounts aggregated
- **Data source:** Live Salesforce via `/api/bl-accounts/:email`, with static fallback in `AccountOwnership.ts`

### Meeting Note Creation Flow

1. User clicks a meeting in the Calendar View
2. Plugin matches meeting to an account using `findBestAccountMatch` (attendee domain -> account name/website matching)
3. If matched: creates note at `Accounts/{AccountName}/Meeting Notes/{MeetingTitle} - {Date}.md` with frontmatter including `account_id` (real SF ID)
4. If unmatched: creates note in `Pipeline Meetings/` folder
5. After creation: auto-opens the note in the editor AND calls `revealInFolder()` to scroll the file explorer sidebar to the note

---

## ACCOUNT ENRICHMENT SYSTEM

This section details the enrichment pipeline that populates Contacts, Intelligence, and other sub-notes with live Salesforce data.

### How It Works

```
Plugin Setup/Reopen
  └── enrichAccountFolders(accounts)
        └── Filter accounts with real SF IDs (starts with '001')
              └── POST /api/accounts/enrich-batch (batches of 20)
                    └── Backend: intelligenceQueryService
                          ├── getContacts(accountId) — SOQL: Contact WHERE AccountId
                          ├── getAccountDetails(accountId) — Account fields
                          ├── getOpportunities(accountId)
                          ├── getRecentTasks(accountId)
                          └── getRecentEvents(accountId)
              └── formatEnrichmentMarkdown (per account)
              └── writeEnrichmentToAccount
                    ├── Contacts.md — Names, titles, emails, phones
                    ├── Intelligence.md — Company context, pain points, competitive landscape
                    ├── Meeting Notes.md — Customer_Brain__c history
                    └── Next Steps.md — Open tasks, upcoming events
```

### Three Enrichment Triggers

| Trigger | When | Blocking? | Code Location |
|---------|------|-----------|---------------|
| **Initial Setup** | User enters email, clicks Connect | **Yes** — synchronous, user sees progress | `handleCalendarConnect` in `main.ts` |
| **Auto-Retry Import** | Email set but accounts missing (vault reopen) | **Yes** — synchronous after folder creation | `checkExistingStatus` in `main.ts` |
| **Vault Reopen Check** | Any cached account lacks `enriched_at` in Contacts.md frontmatter | No — background, 3s delay | `checkExistingStatus` in `main.ts` |

### Enrichment Data Written to Sub-Notes

| Sub-Note | Data Source | Content |
|----------|------------|---------|
| **Contacts.md** | `Contact` object WHERE AccountId | Name, Title, Email, Phone, MobilePhone (up to 10 contacts) |
| **Intelligence.md** | Account fields + opportunities | Company_Context__c, Key_Decision_Makers__c, Pain_Points__c, Competitive_Landscape__c, active opportunities |
| **Meeting Notes.md** | `Customer_Brain__c` field | Historical meeting notes synced by BLs/reps |
| **Next Steps.md** | Tasks + Events | Open tasks, upcoming events for the account |

### Frontmatter Tracking

Each enriched sub-note gets an `enriched_at` timestamp in its YAML frontmatter:

```yaml
---
account_id: "001Hp00003kIrCyIAK"
enriched_at: "2026-02-12T08:31:30.000Z"
---
```

This timestamp is checked on vault reopen. If missing, the account is flagged for re-enrichment.

### Fallback Behavior

If synchronous enrichment fails during setup (e.g., Render cold start, network timeout):
- User sees "Accounts loaded! Contacts will populate shortly..."
- Background retry fires with delays: `[5000ms, 20000ms, 60000ms]`
- On next vault open, `checkExistingStatus` catches any remaining unenriched accounts

---

## CS USER EXPERIENCE

### Nikhita Godiwala (CS Manager)

**Email:** nikhita.godiwala@eudia.com
**Role:** CS Manager — sees all 100 CS accounts + manager dashboard + direct reports' activity

**What She Gets:**

1. **100 Account Folders** — Existing customers + CS Staffing flagged accounts (late-stage pipeline). Each has 7 sub-notes.
2. **Pre-Populated Contacts** — Salesforce contacts auto-enriched during setup (synchronous). Names, titles, emails, phone numbers.
3. **Intelligence Data** — Company context, pain points, competitive landscape, active opportunities.
4. **CS Manager Dashboard** — Folder at `CS Manager Dashboard/` containing:
   - `CS Manager Overview.md` — Team overview, account-to-CSM table, CS Staffing pipeline table, "How Meeting Notes Sync" explainer
   - `Jon Dedych.md` — Jon's assigned accounts with links to vault account folders
   - `Farah Haddad.md` — Farah's assigned accounts with links to vault account folders
5. **Calendar Integration** — Live Outlook calendar with meeting-to-account matching
6. **Meeting Notes** — Auto-created under the matched account folder with correct SF Account ID in frontmatter

### Jon Dedych & Farah Haddad (CSMs)

**Same vault structure as Nikhita** — 100 CS accounts with contacts and intelligence. No manager dashboard (they are not managers). Their meeting notes sync to Salesforce `Customer_Brain__c`, which Nikhita's vault picks up on enrichment refresh.

### CS Static Accounts (`CS_STATIC_ACCOUNTS`)

Defined in `obsidian-plugin/src/AccountOwnership.ts` (~2,151 lines). 100 accounts with:
- **Real 18-character Salesforce Account IDs** (e.g., `001Hp00003kIrQDIA0`) — NOT placeholder IDs
- Authentic `website` and `industry` values
- `ownerName` and `csmName` fields for manager dashboard rep matching
- Source: Live server API `/api/bl-accounts/nikhita.godiwala@eudia.com` (Feb 12, 2026)

These enable instant folder creation (no server dependency) and immediate enrichment (real IDs work with the `/api/accounts/enrich-batch` endpoint).

### Manager-to-Rep Note Sync

Meeting notes flow from CSMs to Nikhita's vault via Salesforce:

```
Jon/Farah record meeting → Sync to Salesforce Customer_Brain__c
                                    ↓
Nikhita opens vault → enrichment pulls Customer_Brain__c
                                    ↓
Meeting Notes.md in each account folder shows latest activity
```

### Onboarding Note

A shareable onboarding note for CS users exists at `docs/nikhita-onboarding-note.md`. Covers:
- Install Obsidian (free)
- Download vault from Getting Started page
- Open in Obsidian
- Enter email — 100 accounts + contacts load
- Tips on usage

---

## GTM HUB (WEB)

**URL:** https://gtm-wizard.onrender.com
**Auth:** Okta SSO (redirects to `/login`)
**Main view:** `src/views/unifiedHub.js` — Tabbed interface

### Tabs

| Tab | Content | View File |
|-----|---------|-----------|
| Sales Process | Sales methodology docs | `docs/sales-process.html` |
| Dashboard | Account dashboard | `src/slack/accountDashboard.js` |
| Meeting Prep | Week-at-a-glance with AI context | `src/views/meetingPrepView.js` |
| Architecture | System architecture diagram | `docs/gtm-brain-architecture.html` |
| Commands | Slack command reference | Inline in `unifiedHub.js` |
| Getting Started | Obsidian setup guide + vault download | `docs/getting-started.html` |
| Analytics | Admin-only usage stats | `src/views/analyticsView.js` |

### Meeting Prep Flow

1. User opens Meeting Prep tab
2. `meetingPrepView.js` loads week's calendar from `/api/meetings`
3. User clicks a meeting -> fetches `/api/meeting-context/:accountId?summarize=true`
4. Backend uses the GTM Brain query pipeline (replaced the separate AI Brief system)
5. Returns JSON summary with executive summary, key takeaways, deal intel, next steps, sentiment
6. Displayed in-browser with formatted sections

---

## SLACK BOT

**Framework:** Slack Bolt (`@slack/bolt`)
**Main files:** `src/slack/events.js` (~7,800+ lines), `src/slack/commands.js`, `src/slack/interactive.js`

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

**Enrichment methods** (also used by the plugin's batch enrichment endpoint):
- `getContacts(accountId)` — `SELECT Id, Name, Title, Email, Phone, MobilePhone FROM Contact WHERE AccountId = :id LIMIT 10`
- `getAccountDetails(accountId)` — Full account record with custom fields
- `getOpportunities(accountId)` — Active opportunities
- `getRecentTasks(accountId)` — Recent tasks for the account
- `getRecentEvents(accountId)` — Recent events/meetings

**Prompt construction:**
- `buildSystemPrompt()` — Injects TODAY'S DATE, response guidelines, date accuracy rules, objectivity rules, formatting rules, stale deal definitions
- `buildUserPrompt()` — Assembles account context, opportunities, contacts, events with recency tags, meeting history
- Sends to Claude via Anthropic API or Socrates adapter

**Key prompt rules (added Feb 6, 2026):**
- TODAY'S DATE injected into every prompt
- Absolute dates required (no "yesterday" unless literally yesterday)
- No editorializing — factual and objective only
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
- No stale SQLite dependency — live data every time
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
| Contact | Contacts with enrichment fields (Apollo_Last_Sent__c, LinkedIn_InMail_Sent__c) |
| Contract | Contracts with Contract_Line_Item__c children |
| Delivery__c | Custom object for delivery tracking (Account, Opportunity, Status, Health Score, etc.) |
| Pipeline_Snapshot__c | Weekly pipeline snapshots for trending |
| BL_Performance_Metrics__c | BL attainment metrics |
| GTM_Usage_Log__c | Usage analytics for GTM site |
| Outbound_Target__c | Outbound campaign targeting |
| Customer_Brain__c (Account field) | Meeting notes/intelligence aggregation field |

**Per-user OAuth:** `src/services/userTokenService.js` manages encrypted tokens (AES-256-GCM) in Git-versioned files. PKCE flow starts at `/api/sf/auth/start`, callback at `/api/sf/auth/callback`.

**Platform Events:** `Closed_Won_Alert__e`, `CS_Staffing_Alert__e`, `Case_Created__e` — subscribed via jsforce streaming API, posted to Slack channels.

### CS Account Queries (Backend)

CS users get accounts via two separate SOQL queries in `src/app.js` (split because Salesforce SOQL doesn't support OR with subselects):

1. **CS Staffing Query** — `Customer_Type__c IN (...)` with `CS_Staffing_Flag__c = true` (late-stage pipeline)
2. **Existing Customers Query** — `Customer_Type__c = 'Existing Customer - JH Owned'` OR `'Existing Customer'`

Both queries deduplicate and return combined results. CSM field queries (`CSM__r.Name`, `CSMa__c`) were removed to prevent 502 errors — CSM name is stored in static account data instead.

---

## SALESFORCE FLOWS & AUTOMATION

165+ Salesforce flows for automation. Key flows tracked in `salesforce/force-app/main/default/flows/`:

### Opportunity Flows

| Flow | Purpose |
|------|---------|
| `Auto_Update_Opportunity_Close_Date_and_Probability` | Auto-adjusts close date and probability based on stage |
| `Quick_Create_Opp_v4` | Latest quick-create opportunity screen flow |
| `Opp_Update_Sync` | Syncs opportunity updates across related records |
| `Opportunity_MEDDICC_Template` | Creates MEDDICC assessment on opportunity creation |
| `Opportunity_Next_Steps_History` | Tracks next steps changes |
| `Opportunity_Stage_Snapshot` | Snapshots stage changes for historical tracking |
| `Forecast_Probabilities` | Manages AI-enabled probability calculations |
| `Last_Update_Details` | Tracks last update timestamps and details |

### Account Flows

| Flow | Purpose |
|------|---------|
| `Update_Account_status_based_on_Opportunity_Stages` | Auto-sets Customer_Type__c based on opportunity stages |
| `Account_Health_History_On_Update` | Tracks account health score changes |
| `CS_Staffing_Alert` | Fires platform event when CS_Staffing_Flag__c changes |

### Outreach Tracking Flows

| Flow | Purpose |
|------|---------|
| `Auto_Populate_Lead_First_Outreach` | Sets First_Outreach_Date__c on Lead when first outreach activity is logged |
| `Auto_Populate_Contact_First_Outreach` | Sets First_Outreach_Date__c on Contact when first outreach activity is logged |
| `Set_LinkedIn_InMail_From_Activity` | Auto-populates LinkedIn_InMail_Sent__c on Contact from activity subject line matching |

### Outreach Tracking Deploy Package

New Salesforce metadata in `salesforce/outreach-tracking-deploy/`:
- **Custom Fields:** `Apollo_Last_Sent__c` and `LinkedIn_InMail_Sent__c` on Contact
- **Permission Set:** `Apollo_LinkedIn_Outreach_Tracking` — grants field-level access to outreach tracking fields
- **Package XML:** `package.xml` and `package-fields-only.xml` for selective deployment

### Other Flows

| Flow | Purpose |
|------|---------|
| `Auto_Assign_Pod_On_Opp_Create` | Assigns Pod based on opportunity owner |
| `Auto_Set_AI_Enabled_On_Product_Line` | Flags AI-Enabled product lines |
| `Council_Code_Name_Sync` | Syncs council code names across objects |
| `Create_Delivery_Multi_Product` | Creates delivery records for multi-product deals |
| `Next_Steps_History_On_Create/Update` | Tracks next steps changes |
| `Referral_Launch_From_Opportunity` | Launches referral process from opportunity |
| `Sync_MultiSelect_To_Products` | Syncs multi-select picklist to product records |
| `Sync_ProductLine_To_Multi_On_Create` | Product line to multi-select sync on creation |
| `Sync_Product_Lines_To_Text` | Product lines to text field sync |
| `Sync_Products_to_ACV` / `_On_Delete` | Syncs product line ACV values |
| `Update_Custom_Create_Date_on_Opportunity` | Sets custom create date |
| `Update_Delivery_Forecast_Status` | Updates delivery forecast status |
| `Update_Products_Breakdown` | Updates products breakdown field |

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

### Enrichment Batch Endpoint

`POST /api/accounts/enrich-batch` — accepts `{ accountIds: string[], userEmail: string }` and returns enrichment data for all accounts in a single response. Used by the Obsidian plugin to populate sub-notes. Backend calls `intelligenceQueryService` methods in parallel for each account.

---

## WEEKLY REPORTS & AUTOMATION

### GTM Weekly Snapshot (`blWeeklySummary.js`)

2-page PDF posted to Slack every Thursday 9 AM EST:
- **Page 1:** Q1 FY26 Forecast table (Target, Commit Net, Weighted Net, Midpoint — all LIVE from SF), Signed Revenue Q1, Q1 Pipeline Opportunities (Targeting February + Top 10 Q1), Q1 Pipeline by Sales Type (live SOQL), Q1 Pipeline by Solution (hardcoded weekly)
- **Page 2:** AI-Enabled Midpoint metric, Pipeline Overview, Avg Deal Size, Current Logos, Stage Distribution, BL Summary table with live commit data
- **Live queries:** `queryAIEnabledForecast()` (SUM of `Quarterly_Commit__c` + `Weighted_ACV_AI_Enabled__c`), `queryPipelineBySalesType()`, plus 5 other parallel queries
- **Hardcoded (update weekly):** `Q1_BY_SOLUTION` — from SF "Q1 Forecast by Solution Bucket" report
- **Subheader:** "AI-Enabled, Net-New . Target Sign Date <= Q1"
- **Footnote:** "Commit = 100% Net ACV, 'Commit' category. Weighted = stage-probability x Net ACV. Midpoint = avg. AI-Enabled only."

### Delivery Weekly Summary (`deliveryWeeklySummary.js`)

PDF + Excel + Slack message:
- Queries `Delivery__c` with `Opportunity__r.StageName`
- Segments by Deal Status: "In Delivery" (Won) vs "Late Stage" (Active)
- Slack message shows count + $ per segment with top owners

### Other Reports

- `fullPipelineReport.js` — Full pipeline Excel with Active + Closed Won tabs
- `csmAccountHealth.js` — CSM account health Excel
- `financeWeeklyAudit.js` — Finance audit Excel from SF report
- `unifiedWeeklyReport.js` — Consolidates all into single Friday delivery

---

## INFRASTRUCTURE & DEPLOYMENT

### Current: Render.com

- **Service:** Web Service (Node.js)
- **Auto-deploy:** Push to `main` branch -> Render deploys in ~2-3 minutes
- **Start command:** `node src/app.js`
- **Health check:** `/health`
- **Environment:** All secrets in Render env vars (see Environment Variables section)
- **Persistent disk:** Not used (Zero Render Storage pattern)
- **Deploy optimization:** `.renderignore` file excludes ~33MB of unnecessary files from deploy uploads

### Future: AWS (prepared but not active)

Terraform configs in `infrastructure/`:
- ECS Fargate cluster, ALB, EFS for persistent storage, Secrets Manager
- VPC with public/private subnets
- IAM roles and policies
- Not deployed — Render is current production

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

## RECENT WORK (FEB 2026 — COMPLETE LOG)

### Commits (Feb 17-18, 2026 — GTM Brain Intelligence Overhaul)

| Commit | Date | Description |
|--------|------|-------------|
| `37191a7` | Feb 18 | **Critical fix: Pipeline queries return real data** — Fix disambiguation guard blocking CUSTOMER_COUNT/CONTACT_SEARCH, bypass SOQL cache for cross-account queries, add ML intent priority overrides, bridge weekly snapshot data functions into pipeline context |
| `52e8b41` | Feb 17 | **Pipeline intelligence expansion** — Stage 5 Negotiation everywhere, product line filtering (12 entries), cross-account signal detection (15 regex patterns), CUSTOMER_COUNT/CONTACT_SEARCH intents, owner accounts with BL name map, weekly snapshot bridge, env-configurable model |
| `108bfdc` | Feb 17 | **Intelligence overhaul: 30+ surgical fixes** — Past/upcoming event split, unassigned owner masking, free-text account extraction, disambiguation fallback, AbortController timeout, queryGeneration guard, fuzzy search (SOSL), contact title ranking, session TTL, context re-injection |

**GTM Brain Capabilities Added (Feb 17-18):**

1. **Pipeline Queries** — "What deals are late stage?", "Deals in negotiation?", "Late stage contracting?" now return real data from Salesforce via weekly snapshot bridge
2. **Stage 5 Negotiation** — Added to all stage definitions (late stage = S3 + S4 + S5)
3. **Product Line Filtering** — "Late stage contracting deals", "Compliance deals" filter by Product_Line__c
4. **Cross-Account Detection** — 15 regex patterns detect pipeline questions even when an account is selected, preventing account-lock
5. **Customer/Logo Counts** — "How many customers do we have?" queries Account.Customer_Type__c and groups by type
6. **BL Ownership** — "What accounts does Riley own?" resolves BL name to SF User ID, queries their accounts and pipeline
7. **Contact Search** — "CLOs based in Los Angeles?" cross-account contact queries by title + 9 metro areas
8. **Meeting Activity** — "What accounts did we meet with this week?" queries Events
9. **Unassigned Owner Masking** — Keigan/Emmit/etc. show as "Unassigned" (ported from Slack bot)
10. **Date Handling** — Past events (< TODAY) vs upcoming (>= TODAY) cleanly separated, no more "future is error"
11. **Fuzzy Account Search** — SOSL fallback, abbreviation map (27 entries), SOQL wildcard escaping
12. **Frontend Hardening** — 30s fetch timeout, stale response guard, search AbortController, account-bound suggestion chips
13. **Session Intelligence** — Context TTL enforcement, condensed context re-injection on long conversations
14. **Weekly Snapshot Bridge** — Pipeline queries use `queryPipelineData()` from blWeeklySummary.js (same proven SOQL as weekly PDF)

### Commits (Feb 13, 2026 — Weekly Snapshot, Pipeline, Account Targeting)

| Commit | Date | Description |
|--------|------|-------------|
| `77e1bc7` | Feb 13 | **Hardcode solution table actuals** — fix Product_Line__c multi-select mapping issue |
| `b53f50b` | Feb 13 | **Use Net ACV formula fields** — Quarterly_Commit__c + Weighted_ACV_AI_Enabled__c |
| `183a845` | Feb 13 | **Commit at 100% ACV** — align with Pipeline Review, fix solution bucket mapping |
| `fdc7577` | Feb 13 | **Blended Forecast AI-Enabled as midpoint** — Commit@95% + Gut@prob |
| `83e8a68` | Feb 13 | **Restore Q1_FY26_FORECAST defaults** — fix undefined.toFixed() crash |
| `1f4822b` | Feb 13 | **Use Salesforce formula fields** — Eudia_Tech__c (not AI_Enabled__c) |
| `671c7fd` | Feb 13 | **Live AI-enabled forecast** — replace hardcoded values, fix count alignment, blank page |

### Commits (Feb 12-13, 2026 — Plugin, Flows, Salesforce)

| Commit | Date | Description |
|--------|------|-------------|
| `e2bec29` | Feb 12 | **Account loading fix + recording time limits** — filesystem verification, 45min/90min limits |
| `e703239` | Feb 12 | **Synchronous enrichment for admin/exec** users during setup |
| `ed82ff3` | Feb 12 | **Split admin/exec SOQL** into two queries (SF OR-with-subselect limitation) |
| `353cf9a` | Feb 12 | Add Siddharth to exec group, hide cold prospects from admin/exec view |

### Commits (Feb 11-12, 2026 — CS & Enrichment Sprint)

| Commit | Date | Description |
|--------|------|-------------|
| `43d32cd` | Feb 12 | **Synchronous enrichment** — contacts populate during setup, not background |
| `85b46a3` | Feb 12 | **Real SF Account IDs** — replaced cs-static placeholder IDs with real 18-char Salesforce IDs in CS_STATIC_ACCOUNTS |
| `ccdddb4` | Feb 12 | CS enrichment on vault reopen, auto-navigate to meeting notes, update cachedAccounts |
| `0cedf6a` | Feb 11 | Robust CS enrichment retry + auto-populate contacts from Salesforce |
| `a4d9328` | Feb 11 | Use CSMa__c (text field) instead of CSM__r.Name for CSM name |
| `63b0fb5` | Feb 11 | Use CSM__r.Name instead of CSM__c to get CSM name (not ID) |
| `4f3fb5c` | Feb 11 | CS Manager dashboard uses CSM__c field + enrichment on SF Connect |
| `6901657` | Feb 11 | **Expand CS static accounts from 36 to 100** (add Existing Customers) |
| `eb4e787` | Feb 11 | CS accounts load instantly from static data — no server dependency |
| `c72fc79` | Feb 11 | CS accounts: static fallback when server returns 0 accounts |
| `74f417c` | Feb 11 | CS account loading with static fallback + suppress release notes |
| `bdaf4ea` | Feb 11 | Rebuild vault ZIP with CS account resilience fixes |
| `6745bac` | Feb 11 | CS account import resilience: retry logic, error recovery, no-cache vault |
| `89333d8` | Feb 11 | Auto-retry account import when email is set but accounts missing |
| `d973b96` | Feb 11 | Rebuild vault ZIP |
| `66bbb2b` | Feb 11 | CS account query: split OR-with-subselect into two queries (SF SOQL limitation) |
| `d2c5e9a` | Feb 11 | Fix duplicate userGroup variable declaration in ownership endpoint |
| `bb448df` | Feb 11 | CS user account loading: correct SF field name, add CS manager dashboard |
| `08fc012` | Feb 11 | UI polish: clean up logo on getting-started page, hide sidebar during account import |
| `33171ad` | Feb 11 | Optimize account loading speed + ensure admin profiles get enrichment |
| `066bb00` | Feb 11 | Fix vault enrichment: rebuild plugin with auto-enrich, demo walkthrough, product line selector LWC |
| `00a2047` | Feb 11 | Add .renderignore to cut ~33MB from deploy uploads |
| `07e7c99` | Feb 11 | **Pre-populate Obsidian vault Contacts & Intelligence with Salesforce data** |
| `39b286b` | Feb 11 | Remove CRITICAL DATA ISSUE warning, add editable context, fix tone |
| `e49e6b0` | Feb 11 | **Replace meeting prep AI Brief with GTM Brain query pipeline** |

### Commits (Feb 2-6, 2026 — Exec Rollout & Calendar Fix)

| Commit | Date | Description |
|--------|------|-------------|
| `bca0bd9` | Feb 6 | Surgical exec rollout: Live calendar, date-accurate GTM Brain, resilient analytics |
| `8c4d35a` | Feb 6 | Exec rollout: Add Siddharth to execs, fix calendar refresh, improve Quick Start |
| `f2ccd0d` | Feb 6 | Fix analytics SOQL error: Remove User_Name__c field not in Salesforce org |
| `bf3ce45` | Feb 6 | Fix deploy: Add missing mobileVault.js required by app.js mobile routes |
| `dd2fe05` | Feb 6 | Simplify Delivery Snapshot Slack message — segment by Deal Status |

### What Was Built (Summary by Feature)

**1. Full CS User Support (New — Feb 11-12)**
- Complete vault experience for CS team (Nikhita, Jon, Farah)
- 100 account folders with real Salesforce IDs embedded in static data
- Synchronous enrichment: contacts, intelligence, meeting notes, next steps populate immediately during setup
- CS Manager dashboard with direct reports' account views and "How Meeting Notes Sync" explainer
- Static-first architecture: folders load instantly from `CS_STATIC_ACCOUNTS`, enrichment pulls live data

**2. Account Enrichment Engine (New — Feb 11-12)**
- Batch enrichment endpoint (`/api/accounts/enrich-batch`) for parallel Salesforce data fetching
- Auto-enrich on vault startup (`checkAndAutoEnrich`) scans for unenriched folders
- `enriched_at` frontmatter tracking prevents redundant re-enrichment
- Progress notices: "Enriching account data: X/100..."
- Contacts, Intelligence, Meeting Notes, and Next Steps sub-notes all populated from Salesforce

**3. Synchronous Enrichment UX (Feb 12)**
- Enrichment was previously fire-and-forget background process — users saw "Accounts loaded!" but contacts were blank
- Now runs synchronously during setup — user sees progress notices, setup doesn't complete until contacts are populated
- Fallback: if synchronous fails, background retry with `[5s, 20s, 60s]` delays
- Vault reopen: checks frontmatter for `enriched_at`, triggers background enrichment if missing

**4. Real Salesforce Account IDs for CS (Feb 12)**
- Replaced all `cs-static-*` placeholder IDs with real 18-char SF Account IDs
- Source: live API response for nikhita.godiwala@eudia.com
- Enables immediate enrichment (IDs start with `001`, pass the enrichment filter)
- Includes `website`, `industry`, `ownerName`, `csmName` for all 100 accounts

**5. Auto-Navigate to Meeting Notes (Feb 12)**
- When user creates a meeting note from calendar, the note auto-opens AND the file explorer sidebar scrolls to reveal it
- Uses Obsidian internal API: `revealInFolder(file)` on the file-explorer plugin instance
- Works for both account-matched notes and pipeline meeting notes

**6. Meeting Prep Pipeline Replacement (Feb 11)**
- Replaced the separate "AI Brief" system in Meeting Prep with the GTM Brain query pipeline
- Meeting context now uses the same intelligence query engine as the Obsidian chat
- Unified experience across web and desktop

**7. Exec Account Folders Upgraded (Feb 6)**
- Execs get full 7-note BL structure (Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps)
- Previously got single `_Account Info.md` placeholder
- Siddharth Saxena added to exec list

**8. Live Calendar (Feb 6)**
- `/api/calendar/:email/today` and `/week` fetch DIRECTLY from Microsoft Graph API per-user
- Replaced stale SQLite reads
- Returns ALL meetings (internal + external), live and accurate

**9. GTM Brain Date Accuracy (Feb 6)**
- TODAY'S DATE injected into all AI system/user prompts
- Strict date rules, objectivity rules, anti-duplication rules
- Date-aware cache keys in contextSummarizer (summaries regenerate daily)

**10. Analytics Page Hardened (Feb 6)**
- Each SOQL query in independent try/catch
- Removed non-existent fields (`User_Name__c`, `Page_Name__c`)
- Admin-only access

**11. Outreach Tracking Flows & Fields (Feb 5-10)**
- `Auto_Populate_Lead_First_Outreach` and `Auto_Populate_Contact_First_Outreach` flows
- `Set_LinkedIn_InMail_From_Activity` flow for auto-tagging LinkedIn outreach
- Custom fields: `Apollo_Last_Sent__c`, `LinkedIn_InMail_Sent__c` on Contact
- Permission set for field-level access

**12. Deploy Optimization (Feb 11)**
- `.renderignore` cuts ~33MB from deploy uploads
- Faster builds and deploys on Render

**13. Weekly Snapshot Overhaul (Feb 13)**
- Replaced hardcoded forecast values with live SOQL queries
- Fixed blank second page, count misalignment, stale BL commit data
- See [Weekly Snapshot Overhaul](#weekly-snapshot-overhaul-feb-13) section below

**14. Pipeline Review LWC Net ACV (Feb 13)**
- Updated Apex controller and LWC to expose Net ACV fields for AI-enabled metrics
- See [Pipeline Review LWC](#pipeline-review-lwc--net-acv-update) section below

**15. Salesforce Metadata Sprint (Feb 13)**
- Deactivated Campaign Influence flow (was blocking Opp creation)
- Fixed Account Health History flow, CS Staffing Alert flow
- TCV calculation update, Marketing Admin profile, CS fields on Opportunity
- See [Salesforce Metadata Updates](#salesforce-metadata-updates-feb-13) section below

**16. Q1 Account Targeting Exercise (Feb 13)**
- Full Salesforce account audit (1,233 accounts), ICP scoring, Keep/Release recommendations
- Target distribution: Ramped BLs ~50 accounts, Senior/Ramping ~80-85
- EU Account Audit: 12 US/EU conflicts, 24 EU-based US accounts flagged
- T1/T2/T3 tiering with enrichment from multiple sources
- See [Q1 Account Targeting Exercise](#q1-account-targeting-exercise) section below

**17. Obsidian Plugin Fixes (Feb 12-13)**
- Account loading: filesystem verification before setting `accountsImported = true`
- Recording limits: 45-minute popup prompt, 90-minute hard stop
- Plugin version bumped to 4.2.0

---

## WEEKLY SNAPSHOT OVERHAUL (FEB 13)

### What Changed (`src/slack/blWeeklySummary.js` — 7 commits)

The GTM Weekly Snapshot PDF was overhauled to use live Salesforce data for the Q1 FY26 Forecast table, fix a blank page issue, and align deal counts.

**Forecast Table (Page 1):**

| Row | Source | Description |
|-----|--------|-------------|
| Q1 Target | Fixed ($6.0M) | Budget target |
| Commit (Net) | `SUM(Quarterly_Commit__c)` via live SOQL | 100% Net ACV, BL Forecast Category = "Commit", AI-enabled |
| Weighted (Net) | `SUM(Weighted_ACV_AI_Enabled__c)` via live SOQL | Stage probability x Net ACV, AI-enabled |
| Midpoint | Computed: (Commit + Weighted) / 2 | Balanced forecast |

**Key technical details:**
- `Eudia_Tech__c` (checkbox) is the AI-enabled flag on Opportunity. NOT `AI_Enabled__c` (does not exist on Opportunity).
- Net ACV logic in formula fields: `IF(Prior_Opp_ACV__c > 0, Renewal_Net_Change__c, ACV__c)` — uses net change for existing customers, full ACV for new business.
- `Q1_FY26_FORECAST` constant retained with fallback defaults (`floor: 4.30, expected: 5.40, midpoint: 4.80`) in case live query fails.
- `BL_COMMIT_SNAPSHOT` retained as fallback for per-BL commit values; live data comes from `queryAIEnabledForecast()`.
- Subheader text: "AI-Enabled, Net-New . Target Sign Date <= Q1"
- Footnote: "Commit = 100% Net ACV, 'Commit' category. Weighted = stage-probability x Net ACV. Midpoint = (Commit + Weighted) / 2. AI-Enabled deals only, target sign <= Q1 end."

**Solution Table (`Q1 PIPELINE BY SOLUTION`):**
- `Product_Line__c` is a multi-select picklist. Live SOQL returns compound values like "Pure Software;AI-Enabled Services" that don't match exact bucket names.
- Solution: hardcode `Q1_BY_SOLUTION` constant from SF "Q1 Forecast by Solution Bucket" report. **Must be updated weekly.**
- Current values (Feb 13): Pure Software $15.6M/60 deals, AI-Enabled Services $2.3M/14, Mixed $2.7M/8, Legacy Services $2.4M/7, Undetermined $2.8M/8. Total: $25.8M, 97 deals, 82 AI-enabled.

**Blank Page Fix:**
- Footer y-position on both pages capped at 760pt (within 792pt Letter page).
- `lineBreak: false` on footer text calls prevents PDFKit from creating overflow pages.

**New functions added:**
- `queryAIEnabledForecast()` — Queries `Quarterly_Commit__c` and `Weighted_ACV_AI_Enabled__c` via SUM aggregates. Returns `{ commitNet, weightedNet, midpoint, dealCount, blCommits }`. Includes per-BL commit breakdown via separate GROUP BY query.
- `queryPipelineBySolution()` — Attempts live query (unreliable due to multi-select), falls back to `Q1_BY_SOLUTION`.

### Salesforce Formula Fields Referenced

| Field | Formula | Description |
|-------|---------|-------------|
| `Quarterly_Commit__c` | `IF(AND(Eudia_Tech__c, ISPICKVAL(BL_Forecast_Category__c, "Commit"), net > 0), net, 0)` | AI-Enabled Net Commit (100% of deal value) |
| `Weighted_ACV_AI_Enabled__c` | `IF(AND(Eudia_Tech__c, net > 0), net * probability, 0)` | AI-Enabled stage-probability weighted |
| `Blended_Forecast_AI_Enabled__c` | `IF(AND(Eudia_Tech__c, net > 0), net * CASE(FC, "Commit", 0.95, "Gut", prob, 0), 0)` | Commit@95% + Gut@stage prob |
| `AI_Enabled_ACV__c` | `IF(Eudia_Tech__c, ACV__c, 0)` | Gross ACV if AI-enabled |

Where `net` = `IF(Prior_Opp_ACV__c > 0, Renewal_Net_Change__c, ACV__c)`

### Pipeline Delta Analysis (Feb 5 to Feb 13)

| Event | Impact | Detail |
|-------|--------|--------|
| Southwest Airlines closed Won | -$180k commit | Left open pipeline Feb 6 (revenue, not a loss) |
| IQVIA target date pushed | -$120k weighted | Feb 5: Mar 31 -> May 29 (out of Q1) |
| Consensys ACV cut + pushed | -$36k weighted | ACV $120k->$36k AND target pushed May 1 |
| Intel target date pushed | -$100k weighted | Apr 24 -> May 29 (out of Q1) |
| Verizon ACV reduced | -$380k ACV | $500k -> $120k |
| Udemy renewal at par | -$350k commit | $350k ACV but Renewal_Net_Change=$0 (no uplift) |
| Army Corps $1.25M pushed | Out of Q1 | Target June 30 (separate opp from $250k still in Q1) |
| Stripe ACV increased | +$400k ACV | $400k -> $800k |
| Wellspring corrected | +$300k ACV | $800k -> $1.1M (after corrections) |

---

## PIPELINE REVIEW LWC — NET ACV UPDATE

### Apex Controller (`PipelineReviewController.cls`)

Added Net ACV fields to the SOQL query and `PipelineRow` inner class:

**New fields in SOQL:**
```
Quarterly_Commit__c, Weighted_ACV_AI_Enabled__c, Renewal_Net_Change__c, Prior_Opp_ACV__c
```

**New PipelineRow properties:**
```java
@AuraEnabled public Decimal commitNet;        // Quarterly_Commit__c
@AuraEnabled public Decimal weightedNetAI;    // Weighted_ACV_AI_Enabled__c
@AuraEnabled public Decimal netAcv;           // Computed: net change for existing, ACV for new
```

**Net ACV computation in constructor:**
```java
if (opp.Prior_Opp_ACV__c != null && opp.Prior_Opp_ACV__c > 0 && opp.Renewal_Net_Change__c != null) {
    this.netAcv = opp.Renewal_Net_Change__c;
} else {
    this.netAcv = opp.ACV__c != null ? opp.ACV__c : 0;
}
```

### LWC Updates (`pipelineReviewCenter.js`)

**`_computeSummary()` changes:**
- `s.totalAIACV` now uses `row.netAcv || acv` (Net ACV for AI-enabled)
- `s.weightedAIACV` now uses `row.weightedNetAI || wtd` (Net weighted for AI-enabled)
- `s.commitAITotal` and `s.commitAIInQtr` use `row.commitNet || 0`

**BL-level AI tracking:**
- `groups[owner].aiEnabledAcv` uses `row.netAcv || row.acv || 0`

**Note:** Deployment was attempted but may need retry. Deploy command:
```bash
sf project deploy start --source-dir salesforce/force-app/main/default/classes/PipelineReviewController.cls --source-dir salesforce/force-app/main/default/lwc/pipelineReviewCenter --target-org eudia-prod
```

---

## SALESFORCE METADATA UPDATES (FEB 13)

### Campaign Influence Flow (CRITICAL FIX)

**Problem:** `Campaign_Influence_Primary_Contact_on_Opp_Creation` flow was creating duplicate `CampaignInfluence` records, conflicting with Salesforce native auto-association. Error: `CANNOT_EXECUTE_FLOW_TRIGGER, FIELD_INTEGRITY_EXCEPTION` — blocked ALL Opportunity creation.

**Fix:** Deactivated via Salesforce Tooling API:
```
PATCH /services/data/v59.0/tooling/sobjects/FlowDefinition/Campaign_Influence_Primary_Contact_on_Opp_Creation
{ "activeVersionNumber": 0 }
```
Version 1 set to Obsolete, Version 2 left as Draft. Flow is permanently disabled.

### Account Health History Flow

- Changed from `RecordBeforeSave` to `RecordAfterSave` with explicit `recordUpdates` element
- Enables correct use of `$Record__Prior` to capture old values
- Version 2 deployed as Active

### CS Staffing Alert Flow

- Fixed field name mismatch: `CS_Staffing_Flag__c` corrected to `CS_Staffing__c` in trigger filter and update action
- Version 6 deployed as Active

### TCV Calculation

- `ProductsBreakdownService.cls` updated: calculates `TCV__c` per-product as `TotalPrice x (Product_Term_Months__c / 12)`
- `Term__c` on Opportunity reflects longest `Product_Term_Months__c` across line items
- `TCV_Calculated__c` formula updated: prioritizes trigger-calculated `TCV__c`, falls back to `ACV__c * Term__c / 12`
- `buildBreakdown()` includes per-product term and separate ACV Total/TCV Total lines

### Marketing Admin Profile

| Component | File | Description |
|-----------|------|-------------|
| Lightning App | `applications/Marketing_Admin.app-meta.xml` | Custom app with Campaigns, Leads, Accounts, Dashboards tabs |
| Home Page | `flexipages/Marketing_Admin_Home.flexipage-meta.xml` | 3-column layout: Pipeline Impact, Campaign Operations, Marketing Intelligence |
| Profile | `profiles/Eudia Marketing Profile.profile-meta.xml` | Tab visibilities + app assignment |

**Users:** molly.ryan@eudia.com, sinead.moloney@eudia.com, caroline.kelly@eudia.com

### CS Fields on Opportunity

Created for CS handover workflow:
- `CSM_Requested__c` (Checkbox) — triggers CS staffing
- `CS_Key_Stakeholders__c`, `CS_Products_Purchased__c`, `CS_Commercial_Terms__c`, `CS_Contract_Term__c`, `CS_Auto_Renew__c`, `CS_Customer_Goals__c`
- Validation rules created then **deactivated** for controlled rollout

### Account CS Outcomes

- `CS_Outcomes__c` Rich Text Area on Account (10,000 chars)
- For CS team to track against agreed success criteria

### CS Home Dashboard LWC

- `csHomeDashboard.css` updated: removed `max-width`, increased padding, font sizes for readability
- Full-width layout with larger scorecard values and overview text

---

## Q1 ACCOUNT TARGETING EXERCISE

### Overview

Full Salesforce account audit and ICP-based targeting exercise for Q1 FY26. Produced a multi-tab Excel workbook used for sales leadership review and BL account assignment.

### Workbooks Produced

| File | Contents |
|------|----------|
| `V7 Q1FY26 Target Planning.xlsx` | Latest working version — Summary, US Targets, EU Targets, Q1 Targets, Current State, Open for Reassignment |
| `EU Account Audit — Q1 FY26.xlsx` | EU/US ownership conflict analysis |

### Q1 Targets Summary Formula Structure

| Column | Name | Formula | Description |
|--------|------|---------|-------------|
| A | Business Lead | Static | BL name |
| B | Territory | Static | US or EMEA |
| C | Q1 Book | `=COUNTIFS(CS Keep) + COUNTIFS(Q1 Reassign)` | Full Q1 ownership count |
| D | Active Pipeline | `=COUNTIFS(CS Keep, Open Opps > 0)` | Accounts with open opportunities |
| E | New Targets | `=C-D` | Accounts without pipeline (activation targets) |
| F | Listed Below | `=COUNTIFS(Q1 data, owner, not Released)` | Count in data table (reconciliation) |
| G | Coverage | `=C/75` | Q1 Book / 75 target |

### Distribution Targets

| Category | BLs | Target | Rationale |
|----------|-----|--------|-----------|
| Ramped | Olivia, Julie, Asad, Nathan | ~50 CS Keeps | Warm leads only, focused book |
| Senior/Ramping | Greg, Tom, Nicola, Conor, Ananth, Rajeev | ~80-85 CS Keeps | Larger existing books, outbound |
| New BDRs | Sean Boyd | 3 CS + 41 net new = 44 | Net new cold outbound targets |
| New BDRs | Riley Stack | 5 CS + 39 net new = 44 | Net new cold outbound targets |

### ICP Scoring System (Keep/Release in Current State)

| Factor | Points | Detail |
|--------|--------|--------|
| Existing Customer | +40 | Highest engagement |
| Active Pipeline | +35 | Open opportunities |
| Opp History (Dormant) | +15 | Past engagement |
| Prior Engagement | +10 | Some activity |
| No History | +2 | Minimal signal |
| Open opps >= 3 | +15 | Strong pipeline |
| Open opps >= 1 | +8 | Some pipeline |
| Open ACV >= $100k | +15 | Material pipeline |
| Revenue >= $50B | +20 | Mega-cap |
| Revenue >= $10B | +15 | Large-cap |
| Revenue >= $1B | +10 | Mid-cap |
| Marquee source | +20 | High-priority list |
| Industry fit (legal/financial/pharma) | +12 | Core ICP |
| Industry fit (tech/consulting) | +6 | Adjacent ICP |

### T1/T2/T3 Tiering System

| Tier | Score | Description |
|------|-------|-------------|
| T1 (Priority) | 10+ | ICP fit + large/complex org + CLO identified + engagement/marquee. Green rows. |
| T2 (Target) | 6-9 | Strong ICP + mid-to-large enterprise + moderate complexity. Blue rows. |
| T3 (Develop) | <6 | Passed screening but smaller, lower complexity, or limited intelligence. Gray rows. |

### EU Account Audit Findings

| Finding | Count | Detail |
|---------|-------|--------|
| US/EU ownership conflicts | 12 | Airbus (Julie), Bayer (Julie), Merck Group (Olivia), Salesforce (Asad), Pfizer (Olivia), etc. |
| US-assigned, EU-headquartered | 24 | Shell (London), Ericsson (Stockholm), Flutter (Dublin), Aptiv (Dublin), Stellantis (Amsterdam), etc. |
| Duplicates within EU list | 58 | Same account listed twice in same BL's tab |
| Jazz Pharmaceuticals duplicate | 1 | Appeared twice for Tom Clancy — second instance marked Released |

### Data Sources Used

| Source | Accounts | Fields |
|--------|----------|--------|
| `combined_enrichment.json` | 3,968 | Industry, Revenue, HQ |
| `Q1 TARGET LIST ENRICHED.xlsx` | 572 | Full ICP: Industry, Size Tier, Revenue, HQ, CLO/GC, Legal Complexity, Product Fit, ICP Score |
| `Q1 FY26 Targets v2.xlsx` | 258 | Company Profiles (CLO, Why Now, News), Segmentation (Pain Points, Product Fit), Positioning Playbook |
| Salesforce OpportunityFieldHistory | Live | ACV changes, target date slips, forecast category changes |

---

## RESOLVED ISSUES (FEB 2026)

### 1. CS Accounts Not Loading

**Problem:** Nikhita's vault showed "Account import failed" — CS accounts depended on server call that failed during Render cold start.
**Root Cause:** No static fallback for CS users; server was sole source of account data.
**Fix:** Created `CS_STATIC_ACCOUNTS` with 100 accounts for instant local loading. Server call used for enrichment only, not folder creation.

### 2. Only ~30 Accounts Loaded (Missing Existing Customers)

**Problem:** Initial CS static list had only 36 accounts (late-stage pipeline). Nikhita needed all existing customers too.
**Fix:** Expanded `CS_STATIC_ACCOUNTS` from 36 to 100 accounts by adding all Existing Customer accounts from Salesforce.

### 3. Placeholder Account IDs (`cs-static-*`)

**Problem:** CS accounts had fake IDs like `cs-static-0`, `cs-static-1`, which prevented enrichment (filter requires `001*` prefix).
**Root Cause:** Static fallback data was created with placeholder IDs instead of real Salesforce IDs.
**Fix:** Replaced all 100 entries in `CS_STATIC_ACCOUNTS` with real 18-char SF Account IDs sourced from live API.

### 4. Contacts Sub-Notes Blank for All CS Accounts

**Problem:** Account IDs were correct, but "Contacts" sub-note was empty for every account.
**Root Cause:** Enrichment ran as a background, fire-and-forget process with 3-second delay. Users saw "Accounts loaded!" and assumed setup was complete, but contacts hadn't populated yet.
**Fix:** Made enrichment **synchronous** during setup — `handleCalendarConnect` now `await`s `enrichAccountFolders(accounts)` before showing success. Added vault-reopen check that scans `enriched_at` frontmatter and re-enriches if missing.

### 5. Server 502 on CSM Field Queries

**Problem:** Adding `CSM__r.Name` or `CSMa__c` to SOQL queries caused Render server to crash with HTTP 502.
**Root Cause:** Relationship field access pattern wasn't compatible with the jsforce query pattern used.
**Fix:** Removed CSM fields from server SOQL. CSM name data is stored in `CS_STATIC_ACCOUNTS` instead.

### 6. Meeting Notes Not Tagged with Correct Account ID (CS)

**Problem:** Meeting notes created for CS users had `cs-static-*` IDs in frontmatter instead of real SF Account IDs.
**Fix:** Resolved by replacing static IDs with real IDs at the source (`CS_STATIC_ACCOUNTS`). `cachedAccounts` in plugin settings now always contains real IDs.

### 7. User Not Auto-Navigated to Meeting Note

**Problem:** After creating a meeting note from calendar, user had to manually scroll and find the account folder in the sidebar.
**Fix:** Added `revealInFolder(file)` call after note creation, which auto-expands the account folder and scrolls the file explorer to the new note.

### 8. Manager Dashboard Appeared Fake

**Problem:** Nikhita's manager view of direct reports' notes seemed faked — unclear how data flowed.
**Fix:** Enhanced CS Manager dashboard with transparent "How Meeting Notes Sync" section explaining the Salesforce `Customer_Brain__c` flow. Added per-rep account tables with direct links to vault folders.

### 9. Campaign Influence Flow Blocking Opp Creation (Feb 13)

**Problem:** `Campaign_Influence_Primary_Contact_on_Opp_Creation` flow created duplicate `CampaignInfluence` records, clashing with Salesforce native auto-association. Error: `CANNOT_EXECUTE_FLOW_TRIGGER, FIELD_INTEGRITY_EXCEPTION` — blocked ALL Opportunity creation for standard sales profile.
**Root Cause:** Active flow Version 1 lacked fault handling and conflicted with native Campaign Influence.
**Fix:** Deactivated via Tooling API (`activeVersionNumber: 0`). Version 1 set to Obsolete, Version 2 left as Draft.

### 10. Weekly Snapshot Blank Second Page (Feb 13)

**Problem:** PDF generated with a blank page between RevOps Summary and GTM Snapshot.
**Root Cause:** Footer text could overflow page bounds, causing PDFKit to create an extra page.
**Fix:** Footer y-position capped at 760pt on both pages. Added `lineBreak: false` to prevent text wrapping overflow.

### 11. Weekly Snapshot Stale Forecast Data (Feb 13)

**Problem:** Forecast table used hardcoded values from Feb 5 ($4.3M commit, $5.4M weighted, $4.8M midpoint) that didn't reflect current Salesforce data.
**Root Cause:** `Q1_FY26_FORECAST` constant was manually maintained, not queried.
**Fix:** Added `queryAIEnabledForecast()` function that queries live SUM aggregates of `Quarterly_Commit__c` and `Weighted_ACV_AI_Enabled__c`. Hardcoded values retained as fallback only.

### 12. Weekly Snapshot Solution Table Count Mismatch (Feb 13)

**Problem:** "Q1 Pipeline by Sales Type" showed 97 deals but "Q1 Pipeline by Solution" showed 102 deals.
**Root Cause:** Sales Type was queried live but Solution data (`Q1_BY_SOLUTION`) was hardcoded from Feb 5 (stale data).
**Fix:** Updated `Q1_BY_SOLUTION` with current actuals. Live query attempted but unreliable due to `Product_Line__c` being a multi-select picklist. Must be updated weekly from SF report.

### 13. Obsidian Accounts Not Loading for New Users (Feb 12)

**Problem:** New users (Olivia, Asad) opened vault but accounts didn't load — "setup required" still shown.
**Root Cause:** `accountsImported = true` was set prematurely during setup even if folder creation failed silently.
**Fix:** Added filesystem verification: `accountsImported = true` only set if at least one folder actually exists. `checkExistingStatus` resets flag if no folders found.

### 14. Recording No Time Limits (Feb 12)

**Problem:** No time limits on meeting recordings — users could record indefinitely.
**Fix:** 45-minute popup prompt via `ConfirmModal` ("Still recording?"). 90-minute hard stop in `AudioRecorder.ts`. Safety net in `main.ts` update interval.

---

## KNOWN ISSUES & PENDING WORK

### Active Issues

1. **Obsidian Plugin TypeScript Errors** — Pre-existing TS errors in `main.ts` that don't affect build (esbuild ignores type errors). Non-blocking.
2. **Test Suite Failures** — Multiple test files fail (pre-existing). Tests need updating for recent changes.
3. **Scheduled Jobs Disabled** — `src/slack/scheduled.js` has cron jobs commented out pending SF auth fixes.
4. **GTM_Usage_Log__c Missing Fields** — Salesforce object exists but is missing `Page_Name__c`, `User_Name__c`, `Session_Id__c`, `User_Agent__c`, `IP_Address__c`. Only `User_Email__c`, `Event_Type__c`, `Event_Date__c`, `Event_Timestamp__c` confirmed working.
5. **Mobile PWA** — `src/views/mobileVault.js` and routes exist but are early-stage. Login, account browsing, recording work but not polished.
6. **No Auto-Update for Plugin** — Users must delete old vault and re-download fresh `.zip` to get latest plugin code. No in-place update mechanism.
7. **Product_Line__c Multi-Select Picklist** — Cannot reliably query and parse for live solution table. Must hardcode `Q1_BY_SOLUTION` weekly from SF report "Q1 Forecast by Solution Bucket".
8. **Udemy $0 Net ACV Anomaly** — $350k Commit deal shows $0 Net ACV because `Renewal_Net_Change__c = $0` and `Prior_Opp_ACV__c = $350k` (renewal at same price). May need field update if there is actual net uplift.
9. **Pipeline Review LWC Net ACV Deployment** — Apex controller and LWC updated locally but deployment may need retry (`sf project deploy start`).
10. **Q1 Targets "Listed Below" Gap** — For ramped BLs, "Listed Below" < "Q1 Book" because only a subset of CS Keeps are in the targeting list data rows. By design, but can confuse users.

### Pending Enhancements

1. **Deploy Pipeline Review LWC** — Push Net ACV fields to production Salesforce.
2. **GTM Brain Response Quality** — Continue testing across accounts. Validate intelligence grounding for all accounts, not just high-activity ones.
3. **Calendar Accuracy Validation** — Live Graph API deployed but needs broader multi-user, multi-timezone validation.
4. **Exec Vault Testing** — Siddharth testing blind setup. Collect feedback on UX, confusion points, feature gaps.
5. **Render Subprocessor Approval** — Working with engineering/legal (Pankaj/Terry/Raghu) for Render approval. SOC 2 Type II, ISO 27001, DPA available.
6. **Orchestrator Architecture** — On roadmap for multi-step reasoning queries.
7. **Plugin Auto-Update Mechanism** — Investigate Obsidian's update API or custom check-for-updates flow to eliminate manual re-download.
8. **CSM Field in SOQL** — CSM name is currently static-only; investigate alternative SOQL patterns or custom fields to get CSM assignment dynamically.
9. **Enrichment Refresh Cadence** — Currently enrichment runs on setup and vault reopen. Consider periodic refresh (daily/weekly) for accounts with stale data.
10. **Outreach Tracking Validation** — Apollo/LinkedIn InMail tracking flows deployed to Salesforce but need field-level validation across all user profiles.
11. **Q1 Account Targeting Follow-ups:**
    - EU-based US accounts (24) need transfer decision from sales leadership
    - Justin Hills' 64 v2 targets: redistribute to Sean/Riley if approved
    - Investigate Disqualified/Nurtured opp history accounts in Q1 targets for possible removal
    - Automate `Q1_BY_SOLUTION` update (parse multi-select picklist values from individual records)
12. **Weekly Snapshot Enhancements:**
    - Automate solution table from live data (needs multi-select picklist parsing)
    - Add WoW change indicators to forecast table
    - Consider adding signed revenue WoW delta

---

## FILE MAP

### Core Backend (`src/`)

```
src/
├── app.js                          # Express server, ALL route definitions (~7,100 lines)
├── services/                       # 45 service modules
│   ├── intelligenceQueryService.js  # GTM Brain AI query engine + enrichment methods
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
│   ├── mobileVault.js               # Mobile PWA views
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
├── main.ts                # Plugin entry (~7,645 lines)
├── main.js                # Built output (esbuild)
├── manifest.json          # Plugin manifest v4.0.0
├── styles.css             # Plugin styles
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── src/
    ├── AccountOwnership.ts  # User/account mapping (~2,151 lines, includes 100 CS_STATIC_ACCOUNTS)
    ├── CalendarService.ts   # Calendar API client
    ├── AudioRecorder.ts     # Recording
    ├── TranscriptionService.ts
    └── SmartTagService.ts
```

### Salesforce Metadata (`salesforce/`)

```
salesforce/
├── force-app/main/default/
│   ├── classes/
│   │   ├── PipelineReviewController.cls    # Apex controller for Pipeline Review LWC (Net ACV fields added Feb 13)
│   │   ├── ProductsBreakdownService.cls    # TCV calculation (updated Feb 13)
│   │   └── ProductsBreakdownServiceTest.cls
│   ├── flows/                              # 31+ flow definitions
│   │   ├── Campaign_Influence_Primary_Contact_on_Opp_Creation  # DEACTIVATED (was blocking Opp creation)
│   │   ├── Account_Health_History_On_Update  # V2 Active (RecordAfterSave)
│   │   ├── CS_Staffing_Alert               # V6 Active (field name fix)
│   │   └── ...
│   ├── lwc/
│   │   ├── pipelineReviewCenter/           # Pipeline Review LWC (Net ACV for AI-enabled, Feb 13)
│   │   └── csHomeDashboard/                # CS Home Dashboard LWC (CSS readability update)
│   ├── applications/
│   │   └── Marketing_Admin.app-meta.xml    # Marketing Admin Lightning App
│   ├── flexipages/
│   │   └── Marketing_Admin_Home.flexipage-meta.xml  # Marketing Admin Home Page
│   ├── profiles/
│   │   ├── Eudia Marketing Profile.profile-meta.xml
│   │   └── Marketing Admin.profile-meta.xml
│   ├── objects/
│   │   ├── Opportunity/fields/             # TCV__c, Term__c, TCV_Calculated__c, CS fields
│   │   ├── Account/fields/CS_Outcomes__c   # Rich Text for CS outcome tracking
│   │   └── Contact/fields/                 # Apollo_Last_Sent__c, LinkedIn_InMail_Sent__c
│   └── permissionsets/
├── outreach-tracking-deploy/               # Deploy-ready outreach tracking package
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

### Docs (`docs/`)

```
docs/
├── GTM_ENG_PLANNING_2026.md        # This document
├── GTM_BRAIN_FY26Q1_HANDOFF.md     # Previous handoff document (Feb 6)
├── SECURITY.md                     # Security & compliance documentation
├── nikhita-onboarding-note.md      # CS onboarding instructions for Nikhita
├── sales-process.html              # Sales methodology docs (web tab)
├── getting-started.html            # Obsidian setup guide (web tab)
└── gtm-brain-architecture.html     # Architecture diagram (web tab)
```

### Distribution

```
public/downloads/
└── Business-Lead-Vault-2026.zip    # 88KB — distributable vault with embedded plugin
scripts/
└── build-tailored-vault.js         # Builds the vault ZIP from plugin + templates
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
npm run build                        # Outputs main.js (~144KB minified)
cd ..
node scripts/build-tailored-vault.js # Rebuilds .zip with new plugin
git add . && git commit -m "Update plugin" && git push origin main
```

### New User Vault Setup

1. User downloads `.zip` from GTM site Getting Started page
2. Unzips anywhere on their machine
3. Opens folder as vault in Obsidian
4. Enters their @eudia.com email in setup wizard
5. Account folders load automatically (static data for CS, live Salesforce for BLs)
6. Contacts and intelligence auto-enrich from Salesforce (synchronous — user sees progress)
7. Optional: Connect Salesforce for per-user OAuth and note sync

### Existing User Vault Update

User must delete old vault and re-download fresh `.zip` to get latest plugin code. There is no auto-update mechanism for the Obsidian plugin.

---

## KEY CONSTANTS & CONFIGURATION

### GTM Weekly Snapshot (`blWeeklySummary.js`)

**Forecast data is now LIVE from Salesforce.** These are fallback defaults only:

```javascript
// Fallback defaults (used if live query fails)
const Q1_FY26_FORECAST = { target: 6.00, floor: 4.30, expected: 5.40, midpoint: 4.80 };

// Fallback BL commits (used if live query fails)
const BL_COMMIT_SNAPSHOT = {
  'Ananth Cherukupally': 395000, 'Asad Hussain': 180000, 'Julie Stefanich': 650000,
  'Justin Hills': 120000, 'Mike Masiello': 350000, 'Olivia Jung': 240000,
  'Alex Fox': 0, 'Conor Molloy': 1280000, 'Emer Flynn': 0,
  'Nathan Shine': 757550, 'Nicola Fratini': 320000
};

// Solution table — MUST BE UPDATED WEEKLY from SF "Q1 Forecast by Solution Bucket" report
// Product_Line__c is multi-select picklist, live query unreliable
const Q1_BY_SOLUTION = {
  'Pure Software': { acv: 15609560, count: 60, aiEnabled: 60 },
  'AI-Enabled Services': { acv: 2263000, count: 14, aiEnabled: 14 },
  'Mixed': { acv: 2682000, count: 8, aiEnabled: 8 },
  'Legacy Services': { acv: 2390575, count: 7, aiEnabled: 0 },
  'Undetermined': { acv: 2820000, count: 8, aiEnabled: 0 }
};
```

**Live query function:** `queryAIEnabledForecast()` runs SUM aggregates on `Quarterly_Commit__c` and `Weighted_ACV_AI_Enabled__c`, filtered by open stages + `Target_LOI_Date__c <= Q1 end`. Returns `{ commitNet, weightedNet, midpoint, dealCount, blCommits }`.

### Static CS Account Mapping (`AccountOwnership.ts`)

- **Count:** 100 accounts (Existing Customers + CS Staffing flagged)
- **Source:** Live API `/api/bl-accounts/nikhita.godiwala@eudia.com` (Feb 12, 2026)
- **IDs:** Real 18-char Salesforce Account IDs (e.g., `001Hp00003kIrQDIA0`)
- **Fields per account:** `id`, `name`, `type`, `isOwned`, `hadOpportunity`, `website`, `industry`, `csmName`, `ownerName`

### Static BL Account Mapping (`AccountOwnership.ts`)

- **Version:** `2026-02`
- **Last updated:** `2026-02-03`
- **Total:** 14 business leads, 266 accounts
- **Source:** Business Lead 2026 Accounts spreadsheet

### Enrichment Configuration

- **Batch size:** 20 accounts per API call
- **Contacts limit:** 10 per account (SOQL LIMIT 10)
- **Enrichment triggers:** Setup (sync), vault reopen (background if needed), auto-retry (sync)
- **Fallback retry delays:** `[5000ms, 20000ms, 60000ms]`
- **Vault reopen delay:** 3000ms (wait for vault to fully load)

---

*End of GTM Engineering Planning 2026. This document contains the complete current state of GTM Brain as of February 13, 2026 — architecture, features, recent work (including weekly snapshot overhaul, Pipeline Review Net ACV, Salesforce metadata updates, Q1 account targeting exercise, and plugin fixes), resolved issues, and everything needed to continue development.*
