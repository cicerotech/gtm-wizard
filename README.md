# GTM Brain

Slack-based sales operations platform for Eudia. Handles natural language Salesforce queries, contract analysis, pipeline reporting, meeting note sync, and provides a web-based GTM dashboard with blended data from multiple sources.

**Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard)

---

## Overview

GTM Brain serves as the central intelligence hub for sales operations, combining data from:
- **Eudia Salesforce** — Primary CRM with opportunities, accounts, contracts
- **Johnson Hana Pipeline** — Legacy pipeline data (81 opportunities, weekly sync)
- **Out-House Revenue** — Partner revenue (Meta)
- **Hyprnote** — Local meeting note sync

All data is accessible via Slack natural language queries or the web dashboard.

---

## Capabilities

### 1. Salesforce Queries

Natural language to SOQL conversion with conversation context and fuzzy matching.

| Query Type | Examples |
|------------|----------|
| Pipeline | "Show pipeline", "What's in Stage 3?", "Julie's deals" |
| Closed Deals | "What closed this week?", "November wins", "Q4 bookings" |
| Forecasting | "Are we on track?", "Pipeline coverage ratio" |
| Account Lookup | "Tell me about Acme", "Who owns DHL?" |
| Stale Deals | "What's stale?", "Deals with no activity 30+ days" |
| Product Line | "Contracting deals in Stage 4", "M&A pipeline" |
| LOI/Bookings | "LOIs signed this month", "Recent bookings" |
| ARR | "ARR customers", "Recurring revenue deals" |

**Intent Classification**: Pattern-based matching with 30+ intent types (see `src/ai/intentParser.js`).

### 2. Contract Analysis

Upload PDF contracts via Slack DM. The bot extracts:
- Contract value, term, monthly amount
- Start date, end date (auto-calculated from term)
- Customer signer (name, title)
- Eudia signer (Omar Haroun, David Van Ryk)
- Product lines (AI-Augmented Contracting, M&A, sigma, etc.)
- Account matching (fuzzy match to Salesforce accounts)

**Supported Contract Types:**
- **LOI** — Customer Advisory Board agreements (no monetary values)
- **Recurring** — MSA, subscription, multi-year contracts
- **Amendment** — Contract modifications

<details>
<summary>Contract Creation Flow</summary>

1. User uploads PDF to bot DM
2. Bot extracts text using 4 fallback methods (pdf-parse → structure → strings → aggressive)
3. Bot displays extracted values for confirmation
4. User says "create contract" or "create contract assign to [Name]"
5. Contract created as Draft in Salesforce
6. User says "activate contract" to move to Activated status

</details>

### 3. GTM Dashboard

Web-based dashboard with pipeline, revenue, and account views. Password protected, mobile-optimized.

| Tab | Content |
|-----|---------|
| **Summary** | Blended pipeline overview, stage concentration (S1-S5), top accounts, key metrics |
| **Weekly** | Q4 opportunities, signed logos by fiscal period, current logo grid |
| **Pipeline** | Pipeline by stage (expandable), business lead overview, top opportunities |
| **Revenue** | Active revenue by account ($19.26m Nov ARR), all closed won deals by type |
| **Accounts** | Customer type breakdown (Revenue/Pilot/LOI), account plans, new logos |

**Data Sources:**
- EUDIA Salesforce (live queries)
- Johnson Hana static data (weekly updated)
- November ARR static data (54 accounts)
- Out-House revenue (Meta: $1.56m)

### 4. Pipeline Export

Export pipeline data to Excel via Slack:
- "Send me pipeline in Excel"
- "Export Q4 forecast"
- "Generate Johnson Hana pipeline report"

Generates `.xlsx` with deal details, stages, values, owners.

### 5. Meeting Notes Sync (Hyprnote Integration)

Syncs meeting notes from local Hyprnote SQLite database to Salesforce.

<details>
<summary>Sync Flow</summary>

1. User completes meeting in Hyprnote
2. Hyprnote generates AI summary locally
3. User triggers sync via Slack: `sync hyprnote`
4. Bot reads Hyprnote SQLite database (`~/Library/Application Support/hyprnote/data.db`)
5. For each new meeting:
   - Creates/updates Contact records
   - Matches to Salesforce Account (fuzzy matching)
   - Creates Event with meeting notes
   - Updates `Customer_Brain__c` field on Account
6. Tracks synced notes in `data/hyprnote-synced.json`

</details>

### 6. Account Management

| Command | Action |
|---------|--------|
| "Create [Company] and assign to [BL]" | Creates account with owner assignment |
| "Add account plan for [Company]: [plan text]" | Saves to `Account_Plan_s__c` field |
| "Add to customer history: [Company]" | Appends to `Customer_Brain__c` field |
| "Move [Company] to nurture" | Updates account status |
| "Close [Company] lost" | Closes all opportunities as lost |

### 7. Scheduled Reports

| Report | Schedule | Destination |
|--------|----------|-------------|
| Daily Summary | 8 AM PT | Configured channel |
| Weekly Pipeline | Monday 9 AM PT | Leadership channel |
| End of Day | 6 PM PT | Sales channel |
| Deal Health | Every 2 hours | Managers channel |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Redis server (for caching)
- Slack workspace with admin access
- Salesforce org with API access
- OpenAI API key (optional, uses pattern matching by default)

### Installation

```bash
git clone <repository-url>
cd gtm-brain
npm install
cp .env.example .env  # Configure environment
npm start
```

### Health Check

```bash
curl http://localhost:3000/health
```

---

## Configuration

### Environment Variables

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# Salesforce
SF_CLIENT_ID=...
SF_CLIENT_SECRET=...
SF_INSTANCE_URL=https://yourorg.my.salesforce.com
SF_USERNAME=...
SF_PASSWORD=...
SF_SECURITY_TOKEN=...

# AI (optional - pattern matching is default)
OPENAI_API_KEY=...
SOCRATES_MODEL=gpt-4
USE_OPENAI=false

# Redis
REDIS_URL=redis://localhost:6379

# Dashboard
DASHBOARD_PASSWORD=...
```

### Salesforce Field Mappings

| Object | Field | Purpose |
|--------|-------|---------|
| Account | `Customer_Brain__c` | Meeting notes, insights |
| Account | `Account_Plan_s__c` | Strategic account plans |
| Account | `Customer_Type__c` | Revenue, Pilot, LOI classification |
| Opportunity | `ACV__c` | Annual contract value |
| Opportunity | `Finance_Weighted_ACV__c` | Weighted pipeline value |
| Opportunity | `Revenue_Type__c` | ARR, Project, Booking |
| Opportunity | `Target_LOI_Date__c` | Target signing date |
| Opportunity | `Product_Line_s__c` | Product/service line |
| Contract | `Contract_Name_Campfire__c` | Contract display name |
| Contract | `Contract_Type__c` | Recurring, LOI, Amendment |
| Contract | `AI_Enabled__c` | AI-enabled flag (always true) |

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Slack     │◄───►│  GTM Brain  │◄───►│ Salesforce  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │  OpenAI/  │   │   Redis   │   │  Hyprnote │
    │  Pattern  │   │   Cache   │   │  (local)  │
    └───────────┘   └───────────┘   └───────────┘
```

### Key Features
- **Retry Logic**: Exponential backoff for Salesforce API failures
- **Token Refresh**: Automatic 90-minute token refresh cycle
- **Query Caching**: 5-minute cache for frequently accessed data
- **Fuzzy Matching**: Account name matching with similarity scoring

---

## Project Structure

```
gtm-brain/
├── src/
│   ├── app.js                    # Entry point, Express server
│   ├── server.js                 # Server startup
│   ├── ai/
│   │   ├── intentParser.js       # NL intent classification (30+ intents)
│   │   ├── contextManager.js     # Conversation context
│   │   └── socratesAdapter.js    # AI model adapter
│   ├── salesforce/
│   │   ├── connection.js         # SF connection with retry logic
│   │   └── queries.js            # SOQL query generation
│   ├── services/
│   │   ├── contractAnalyzer.js   # PDF extraction & parsing
│   │   ├── hyprnoteSyncService.js # Meeting note sync
│   │   └── accountAssignment.js  # Business lead assignment
│   ├── slack/
│   │   ├── accountDashboard.js   # HTML dashboard generation
│   │   ├── commands.js           # Slash command handlers
│   │   ├── events.js             # Message event handlers
│   │   └── scheduled.js          # Scheduled reports
│   ├── data/
│   │   └── johnsonHanaData.js    # JH pipeline + November ARR data
│   └── utils/
│       ├── cache.js              # Redis caching
│       ├── formatters.js         # Currency, date formatting
│       └── fuzzyAccountMatcher.js # Account name matching
├── data/
│   ├── business-logic.json       # Business rules, segments
│   ├── hyprnote-synced.json      # Sync tracking
│   └── schema-*.json             # Salesforce field schemas
├── docs/                         # Documentation (89 files)
├── tests/                        # Test & debug scripts (47 files)
├── logs/                         # Log files (gitignored)
├── hyprnote-sync/                # Hyprnote integration module
├── Dockerfile                    # Container configuration
├── docker-compose.yml            # Local development
└── package.json
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/account-dashboard` | GET | Dashboard login page |
| `/account-dashboard` | POST | Dashboard with password auth |
| `/slack/events` | POST | Slack event subscription |
| `/slack/interactions` | POST | Slack interactive components |

---

## Slack Commands

| Command | Description |
|---------|-------------|
| `/pipeline` | Pipeline analysis |
| `/forecast` | Forecast review |
| `/deals` | Deal lookup |
| DM: file upload | Contract analysis |
| DM: `sync hyprnote` | Sync meeting notes |
| DM: `hyprnote status` | Check sync status |
| DM: `gtm` or `dashboard` | Get dashboard link |

---

## Data Sources

### Johnson Hana Pipeline
- **Source**: `src/data/johnsonHanaData.js`
- **Update**: Weekly manual update
- **Content**: 81 opportunities, service lines, close dates
- **Integration**: Blended into dashboard totals

### November ARR Data
- **EUDIA**: 18 accounts ($7.46m)
- **Johnson Hana**: 35 accounts ($10.24m)
- **Out-House (Meta)**: 1 account ($1.56m)
- **Total**: 54 accounts, $19.26m ARR

### Signed Logos by Fiscal Period
- FY2024: Q1-Q4 historical logos
- FY2025: Q1-Q4 (current year)
- Source: Combination of EUDIA Salesforce + JH revenue appearance dates

---

## Deployment

### Render (Production)
- **URL**: gtm-wizard.onrender.com
- **Build**: `npm install`
- **Start**: `npm start`
- **Health Check**: `/health`

### Docker (Local)
```bash
docker-compose up
```

### Environment
- Node.js 18+
- Redis for caching
- Port 3000 (configurable via PORT env)

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Salesforce connection | Credentials, IP whitelist, security token |
| Slack events missing | Socket Mode enabled, App Token valid |
| Dashboard not loading | Render deployment status, password |
| Contract parsing fails | PDF format, text extraction quality |
| JH data not showing | Check `johnsonHanaData.js` exports |
| Revenue totals wrong | Verify `totalNovemberARR` in data file |

### Debug Logging
```bash
LOG_LEVEL=debug npm start
```

### Test Scripts
```bash
node tests/test-connection.js      # Salesforce connection
node tests/test-all-queries.js     # Query execution
node tests/test-contract-fields.js # Contract field mapping
```

---

## Development

```bash
npm test              # Run tests
npm run dev           # Development with auto-reload
LOG_LEVEL=debug npm start  # Debug logging
```

### Code Style
- Lowercase filenames in docs/ and tests/
- camelCase for JavaScript
- Descriptive function names
- Comprehensive logging with emojis (📦, ✅, ❌, 🔄)

---

## Security

- **Dashboard**: Password protected
- **Salesforce**: OAuth2 with token refresh
- **Credentials**: Environment variables only (not in code)
- **Redis**: Connection string in env
- **Logs**: Sensitive data redacted

---

## License

MIT
