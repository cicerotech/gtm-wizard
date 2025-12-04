# gtm-brain

Slack-based sales operations platform. Handles natural language Salesforce queries, contract analysis, pipeline reporting, meeting note sync, and provides a web-based GTM dashboard.

**Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard)

## Capabilities

### Salesforce Queries
Natural language to SOQL conversion with conversation context.

| Query Type | Examples |
|------------|----------|
| Pipeline | "Show pipeline", "What's in Stage 3?", "Julie's deals" |
| Closed Deals | "What closed this week?", "November wins", "Q4 bookings" |
| Forecasting | "Are we on track?", "Pipeline coverage ratio" |
| Account Lookup | "Tell me about Acme", "Who owns DHL?" |
| Stale Deals | "What's stale?", "Deals with no activity 30+ days" |

### Contract Analysis
Upload PDF contracts via Slack DM. The bot extracts:
- Contract value, term, monthly amount
- Start date, end date
- Customer signer (name, title)
- Account matching (fuzzy match to Salesforce accounts)

Then creates the contract record in Salesforce with proper field mapping.

<details>
<summary>Contract Creation Flow</summary>

1. User uploads PDF to bot DM
2. Bot extracts text and parses key fields
3. Bot displays extracted values for confirmation
4. User says "create contract" or "create contract assign to [Name]"
5. Contract created as Draft in Salesforce
6. User says "activate contract" to move to Activated status

</details>

### GTM Dashboard
Web-based dashboard with pipeline, revenue, and account views.

| Tab | Content |
|-----|---------|
| Top Co | Blended Eudia + Johnson Hana pipeline, closed deals, service lines |
| Summary | Pipeline by stage, business lead breakdown, weighted forecast |
| Revenue | Active contracts by account, closed won deals, forecast |
| Accounts | Customer type breakdown, account plans, new logos |

Password protected. Mobile-optimized.

### Pipeline Export
Export pipeline data to Excel via Slack:
- "Send me pipeline in Excel"
- "Export Q4 forecast"
- Generates `.xlsx` with deal details, stages, values

### Meeting Notes Sync (Hyprnote Integration)
Syncs meeting notes from Hyprnote to Salesforce.

<details>
<summary>Sync Flow</summary>

1. User completes meeting in Hyprnote
2. Hyprnote generates AI summary locally
3. User triggers sync via Slack: `sync hyprnote`
4. Bot reads Hyprnote SQLite database
5. For each new meeting:
   - Creates/updates Contact records
   - Matches to Salesforce Account (fuzzy matching)
   - Creates Event with meeting notes
   - Updates `Customer_Brain__c` field on Account

</details>

### Account Management
- "Create [Company] and assign to [BL]" - Creates account with owner
- "Add account plan for [Company]: [plan text]" - Saves strategic plan
- "Add to customer history: [Company]" - Appends to Customer Brain field

### Scheduled Reports

| Report | Schedule | Destination |
|--------|----------|-------------|
| Daily Summary | 8 AM | Configured channel |
| Weekly Pipeline | Monday 9 AM | Leadership channel |
| End of Day | 6 PM | Sales channel |
| Deal Health | Every 2 hours | Managers channel |

## Quick Start

### Prerequisites
- Node.js 18+
- Redis server
- Slack workspace with admin access
- Salesforce org with API access
- OpenAI API key (or Socrates endpoint)

### Installation

```bash
git clone <repository-url>
cd gtm-brain
npm run setup   # Follow wizard
npm start
```

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

# AI (OpenAI or custom endpoint)
OPENAI_API_KEY=...
SOCRATES_MODEL=gpt-4  # Optional: custom model endpoint

# Redis
REDIS_URL=redis://localhost:6379
```

### Salesforce Field Mappings

The bot uses these custom fields:

| Object | Field | Purpose |
|--------|-------|---------|
| Account | `Customer_Brain__c` | Meeting notes, insights |
| Account | `Account_Plan_s__c` | Strategic account plans |
| Account | `Customer_Type__c` | Revenue, Pilot, LOI classification |
| Opportunity | `ACV__c` | Annual contract value |
| Opportunity | `Finance_Weighted_ACV__c` | Weighted pipeline value |
| Opportunity | `Revenue_Type__c` | ARR, Project, Booking |
| Opportunity | `Target_LOI_Date__c` | Target signing date |
| Contract | `Contract_Name_Campfire__c` | Contract display name |

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
    │  Socrates │   │   Cache   │   │  (local)  │
    └───────────┘   └───────────┘   └───────────┘
```

### Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Intent Parser | `src/ai/intentParser.js` | NL to structured query |
| Contract Analyzer | `src/services/contractAnalyzer.js` | PDF extraction |
| Dashboard | `src/slack/accountDashboard.js` | HTML dashboard generation |
| Hyprnote Sync | `src/services/hyprnoteSyncService.js` | Meeting note sync |
| Query Builder | `src/salesforce/queries.js` | SOQL generation |

## Slack Commands

| Command | Description |
|---------|-------------|
| `/pipeline` | Pipeline analysis |
| `/forecast` | Forecast review |
| `/deals` | Deal lookup |
| DM: file upload | Contract analysis |
| DM: `sync hyprnote` | Sync meeting notes |
| DM: `hyprnote status` | Check sync status |

## Dashboard Access

**URL**: `https://gtm-wizard.onrender.com/account-dashboard`

**Password**: Configured in application

Features:
- Mobile-optimized responsive design
- Tab-based navigation
- Expandable account details with meeting history
- Real-time data from Salesforce

## Development

```bash
npm test              # Run tests
npm run dev           # Development with auto-reload
LOG_LEVEL=debug npm start  # Debug logging
```

### Project Structure

```
gtm-brain/
├── src/
│   ├── app.js                    # Entry point
│   ├── ai/                       # Intent parsing, context
│   ├── salesforce/               # Connection, queries
│   ├── services/                 # Contract, Hyprnote sync
│   ├── slack/                    # Events, commands, dashboard
│   └── utils/                    # Cache, logging, formatting
├── data/
│   ├── johnsonHanaData.js        # External pipeline data
│   ├── hyprnote-synced.json      # Sync tracking
│   └── schema-*.json             # Salesforce field mappings
└── scripts/
    └── test-hyprnote-sync.js     # Local sync testing
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| Salesforce connection | Credentials, IP whitelist, security token |
| Slack events missing | Socket Mode enabled, App Token valid |
| Dashboard not loading | Render deployment status, password |
| Contract parsing fails | PDF format, text extraction quality |

Health check: `GET /health`

## License

MIT
