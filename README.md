# gtm-brain

**Live Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard) · **Commands**: [cheat-sheet](https://gtm-wizard.onrender.com/cheat-sheet)

---

## what it is

gtm-brain is the intelligence layer that connects conversations, CRM data, and downstream systems. it sits between the teams who generate customer intelligence and the systems that need it—ensuring data flows cleanly from first meeting through delivery handoff.

```
                              ┌─────────────────────────────────┐
                              │          gtm-brain              │
                              │   ┌───────┬────────┬─────────┐  │
                              │   │ intent│  sync  │ hygiene │  │
                              │   │ router│services│  flows  │  │
                              │   └───────┴────────┴─────────┘  │
                              │     powered by cursor + claude  │
                              └────────────────┬────────────────┘
                                               │
        ┌──────────────────────────────────────┼──────────────────────────────────────┐
        │                                      │                                      │
        ▼                                      ▼                                      ▼
┌───────────────┐                    ┌─────────────────┐                    ┌─────────────────┐
│    INPUTS     │                    │  SOURCE OF      │                    │    OUTPUTS      │
│               │                    │  TRUTH          │                    │                 │
│  slack        │ ──────────────────►│                 │────────────────────► reports        │
│  obsidian     │   questions        │   salesforce    │   scheduled        │  dashboards    │
│  outlook      │   transcripts      │                 │   insights         │  slack answers │
│  calendars    │   meetings         │   accounts      │                    │  meeting prep  │
│               │                    │   opps          │                    │                 │
└───────────────┘                    │   contacts      │                    └─────────────────┘
                                     │   contracts     │
                                     │   events        │
                                     └────────┬────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                     ┌─────────────────┐             ┌─────────────────┐
                     │    campfire     │             │   rocket lane   │
                     │      (ERP)      │             │   (delivery)    │
                     │                 │             │                 │
                     │ contract terms  │◄───────────►│ project kickoff │
                     │ finance recon   │ utilization │ implementation  │
                     └─────────────────┘             └─────────────────┘
```

---

## why it exists

**the problem**: customer intelligence is scattered across Slack threads, meeting notes, and email. by the time it reaches CRM, it's incomplete or delayed. manual data entry post-close creates errors. downstream systems (finance, delivery) inherit that mess.

**the solution**: gtm-brain captures intelligence at the source—Slack conversations, meeting transcriptions, calendars—and flows it into Salesforce automatically. SF Flows then auto-populate contract and delivery records at key stages, removing BL input burden. clean data in SF means accurate data in Campfire (finance audit, revenue visibility) and Rocket Lane (project handoff, implementation tracking).

---

## how data flows

### inputs → gtm-brain

| source | what it captures | how |
|--------|------------------|-----|
| **slack** | questions, account context, deal intel | @gtm-brain mention or side-channel monitoring |
| **obsidian** | structured meeting notes | BL runs sync command → notes processed by Claude |
| **outlook** | calendar events with external attendees | Microsoft Graph API, 6-hour sync cycle |
| **pdfs** | contract terms | upload to Slack → extraction via LLM |

### gtm-brain → salesforce

- **contacts**: created from meeting attendees, enriched via Clay
- **events**: synced from calendars with deduplication
- **account context**: meeting insights appended to `Customer_Brain__c`
- **opportunities**: created/updated via natural language
- **contracts**: extracted from PDFs with full field mapping

### salesforce → downstream (powered by SF Flows)

Salesforce Flows auto-capture data at key moments, removing BL input burden post-close. if initial opp data is validated correctly, contract and delivery data flows cleanly downstream.

```
     ┌─────────────────┐        ┌─────────────────┐
     │  PROPOSAL       │        │  CLOSED WON     │
     │  (Stage 4)      │        │  (Stage 6)      │
     └────────┬────────┘        └────────┬────────┘
              │                          │
              ▼                          ▼
     ┌─────────────────┐        ┌─────────────────┐
     │  Delivery__c    │        │  Contract__c    │
     │  auto-created   │        │  fields synced  │
     └────────┬────────┘        └────────┬────────┘
              │                          │
              ▼                          ▼
     ┌─────────────────┐        ┌─────────────────┐
     │  ROCKET LANE    │        │    CAMPFIRE     │
     │                 │        │                 │
     │  project        │        │  contract terms │
     │  kickoff +      │◄──────►│  ACV, term,     │
     │  implementation │  util  │  product line   │
     │  handoff        │        │  dates          │
     └─────────────────┘        └─────────────────┘
```

**campfire (ERP)**:
- at Close Won, Flow pulls contract fields from validated opportunity data
- ACV, term, product line, close date—no manual BL entry needed
- saves finance time in audit process, clear line of sight into revenue

**rocket lane (delivery)**:
- at Stage 4 (Proposal), Delivery object auto-created
- structured by product line—templates differ per offering
- syncs to Rocket Lane for project kickoff and implementation
- enables client data transfer through sales phases → drives successful outcomes

**the dependency**: correct initial input at opportunity creation. if validated, downstream systems inherit clean data automatically.

---

## the feedback loop

gtm-brain doesn't just push data—it pulls insights back to the teams who need them.

```
                    ┌─────────────────────────────────────────┐
                    │              FEEDBACK LOOP              │
                    │                                         │
                    │  scheduled reports → slack channels     │
                    │  on-demand queries → instant answers    │
                    │  dashboard → non-SF user visibility     │
                    │                                         │
                    └─────────────────────────────────────────┘
```

**weekly automation**:
- BL summaries to leadership (pipeline movement, forecast accuracy)
- finance audit (ACV totals, weighted forecasts, Target Sign Date opps)
- delivery report (Stage 4+ deals, delivery status, owner assignment)

**on-demand**:
- ask @gtm-brain anything about accounts, opps, owners, pipeline
- meeting prep briefs before client calls
- Excel exports for ad-hoc analysis

---

## key capabilities

### 1. meeting intelligence capture

BLs take notes in Obsidian → sync to gtm-brain → Claude extracts structured insights → flows to Salesforce

**what gets captured**: attendees, action items, deal signals, objections, next steps

**calendar backup**: Outlook calendars synced automatically, meetings classified by type (intro, demo, CAB, proposal), external contacts created

### 2. sales velocity tracking

AI classifies meetings by type using subject + sequence + stage context:

| meeting type | typical signals |
|--------------|-----------------|
| intro | first meeting, "meet Eudia", CLO on call |
| demo | "demo", "platform walkthrough" |
| cab | "customer advisory", "memorandum" |
| proposal | "contract review", "MSA", Stage 4 opp |

**insights generated**:
- days from intro → demo (benchmark: 60 days)
- days from demo → proposal (benchmark: 90 days)
- deals moving slower than benchmark flagged

### 3. contract processing

upload PDF → LLM extraction → one-click SF creation

**extracts**: ACV, TCV, term, start/end dates, parties, product line, contract type

### 4. BL performance tracking

Salesforce custom object tracks per-rep metrics:

| metric | calculation |
|--------|-------------|
| time to ramp | days from start to $500k closed ACV |
| monthly productivity | closed ACV ÷ months since start |
| YTD/QTD ACV | fiscal period aggregations |

scheduled refresh weekly, benchmarks calculated across team

### 5. hygiene automation

- deduplication on event creation
- domain-to-account fallback for contact creation
- stale deal detection
- orphan record cleanup

---

## project structure

```
gtm-brain/
├── src/
│   ├── ai/               # intent classification, ML models
│   ├── services/         # calendar, velocity, meeting classifier
│   ├── slack/            # event handlers, report generators
│   ├── salesforce/       # connection, queries
│   └── views/            # dashboard, setup pages
├── obsidian-sync/        # vault integration tools
├── salesforce/           # BL metrics apex package
├── data/                 # schemas, learned patterns
├── public/               # cheat-sheet, download scripts
├── scripts/              # operational utilities
├── extras/               # legacy scripts, analysis tools
└── docs/                 # architecture, guides
```

---

## tooling

| tool | role |
|------|------|
| **cursor + claude** | development backbone, code generation, refactoring |
| **anthropic api** | meeting classification, note summarization, contract extraction |
| **openai api** | intent classification, semantic matching, embeddings |
| **microsoft graph** | Outlook calendar access |
| **clay** | contact enrichment (title, company, LinkedIn) |

---

## deployment

**production**: Render at gtm-wizard.onrender.com

**core env vars**:
```
SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET
SLACK_BOT_TOKEN, SLACK_APP_TOKEN
ANTHROPIC_API_KEY, OPENAI_API_KEY
AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
DASHBOARD_PASSWORD
```

**health check**: `GET /health`

---

## commands

see [cheat-sheet](https://gtm-wizard.onrender.com/cheat-sheet) for full command reference

common patterns:
- `send pipeline` → Excel export
- `send finance report` → ACV audit
- `show velocity for [account]` → cycle time analysis
- `sync hyprnote` → meeting note sync

---

## license

MIT
