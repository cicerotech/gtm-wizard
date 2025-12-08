# gtm-brain

An intelligent sales operations platform that combines natural language processing, machine learning, and real-time CRM integration. Built for conversational data access via Slack, automated contract analysis, and comprehensive pipeline visibility through a unified web dashboard.

**Live Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard)

---

## What It Does

GTM-Brain serves as the central intelligence layer for sales operations, enabling teams to:

- **Query pipeline data in natural language** — Ask "What's closing this month?" or "Show me Julie's late-stage deals" and get instant answers from Salesforce
- **Analyze contracts automatically** — Upload PDFs via Slack and extract contract terms, values, signers, and dates with AI-powered parsing
- **Track pipeline health** — Visualize blended pipeline data from multiple sources with real-time metrics and deal-level insights
- **Sync meeting intelligence** — Capture meeting notes and sync them to CRM with automatic account matching
- **Surface actionable insights** — Identify at-risk deals, stale opportunities, and forecast accuracy through ML-enhanced analysis

---

## Core Capabilities

### Natural Language Salesforce Queries

Converts conversational questions into SOQL queries with full context awareness. Supports 30+ intent types including pipeline analysis, deal lookups, forecasting, and account research.

**Example queries:**
- "Show me pipeline" → Full pipeline breakdown by stage
- "What closed this week?" → Recent closed-won deals with values
- "Who owns Boeing?" → Account ownership and opportunity summary
- "Stale deals over $200k" → High-value opportunities with no recent activity

The intent classification system uses a hybrid approach combining semantic embeddings, pattern matching, and LLM enhancement for nuanced query understanding.

### Contract Analysis

PDF contract upload via Slack DM with intelligent field extraction:

| Extracted Field | Method |
|-----------------|--------|
| Contract value & term | LLM + regex patterns |
| Start/end dates | Date parsing with term calculation |
| Customer signer | Named entity recognition |
| Product lines | Classification against known products |
| Account matching | Semantic fuzzy matching to CRM |

Supports MSA, subscription, LOI, and amendment contract types with automatic Salesforce record creation.

### GTM Dashboard

Password-protected web dashboard with five core views:

| View | Purpose |
|------|---------|
| **Summary** | Blended pipeline overview, stage concentration (S1-S5), key metrics |
| **Weekly** | Q4 opportunities, signed logos by fiscal period, current customer grid |
| **Pipeline** | Expandable stage breakdown, business lead overview, top opportunities |
| **Revenue** | Active revenue by account, all closed-won deals categorized by type |
| **Accounts** | Customer type breakdown, account plans, new logo tracking |

Mobile-optimized with responsive design and real-time Salesforce data integration.

### Meeting Intelligence (Hyprnote)

Syncs meeting notes from local Hyprnote database to Salesforce:
- Creates/updates Contact records
- Matches to existing Accounts (fuzzy matching)
- Creates Event records with meeting summaries
- Updates `Customer_Brain__c` field with insights

### Pipeline Export

Generate Excel reports via Slack commands with deal details, stages, values, and owner information.

---

## ML Enhancements

The platform includes an extensible ML module (`src/ml/mlOpportunities.js`) with eight enhancement areas:

| Capability | Description |
|------------|-------------|
| **Semantic Account Matching** | Embedding-based company name resolution (handles "IBM" → "International Business Machines") |
| **Deal Health Prediction** | ML-scored opportunity health with LLM enhancement for edge cases |
| **Intelligent Forecasting** | Dynamic probability weighting based on owner performance and deal attributes |
| **Meeting Intelligence Extraction** | LLM-powered action item, sentiment, and stakeholder extraction from notes |
| **Query Suggestion Engine** | Context-aware follow-up question recommendations |
| **Anomaly Detection** | Automated flagging of stale deals, stage regressions, and neglected opportunities |
| **Account Lookalike Scoring** | Profile matching to identify high-potential prospects |
| **Response Quality Learning** | Implicit feedback collection to improve intent classification |

These capabilities enable continuous improvement without manual retraining.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Slack       │◄───►│   GTM-Brain     │◄───►│   Salesforce    │
│ (Commands/DMs)  │     │   (Node.js)     │     │   (SOQL/API)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  ┌───────────┐         ┌───────────┐         ┌───────────┐
  │  OpenAI   │         │   Redis   │         │  Hyprnote │
  │ (GPT-4 +  │         │  (Cache)  │         │  (SQLite) │
  │ Embeddings│         │           │         │           │
  └───────────┘         └───────────┘         └───────────┘
```

**Key Patterns:**
- Retry logic with exponential backoff for Salesforce API
- 90-minute automatic token refresh cycle
- 5-minute query caching for performance
- Semantic fuzzy matching for account resolution

---

## Project Structure

```
gtm-brain/
├── src/
│   ├── app.js                     # Express server entry point
│   ├── ai/
│   │   ├── intentParser.js        # NL intent classification
│   │   ├── mlIntentClassifier.js  # Hybrid ML classification
│   │   ├── semanticMatcher.js     # Embedding-based matching
│   │   └── feedbackLearning.js    # User feedback processing
│   ├── ml/
│   │   ├── intentClassifier.js    # Neural network classifier
│   │   └── mlOpportunities.js     # ML enhancement modules
│   ├── salesforce/
│   │   ├── connection.js          # SF connection with retry
│   │   └── queries.js             # SOQL generation
│   ├── services/
│   │   ├── contractAnalyzer.js    # PDF extraction & parsing
│   │   ├── llmContractExtractor.js # LLM-based extraction
│   │   └── hyprnoteSyncService.js # Meeting note sync
│   ├── slack/
│   │   ├── accountDashboard.js    # HTML dashboard generation
│   │   ├── commands.js            # Slash command handlers
│   │   └── events.js              # Message event handlers
│   └── data/
│       └── johnsonHanaData.js     # Static pipeline data
├── data/
│   ├── intent-learning.json       # ML training data
│   └── query-embeddings.json      # Cached embeddings
├── docs/                          # Documentation
├── tests/                         # Test scripts
└── logs/                          # Runtime logs (gitignored)
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Redis server
- Salesforce org with API access
- Slack workspace with admin access
- OpenAI API key (optional, pattern matching fallback available)

### Installation

```bash
git clone <repository-url>
cd gtm-brain
npm install
cp .env.example .env  # Configure credentials
npm start
```

### Environment Configuration

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

# AI (optional)
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4

# Infrastructure
REDIS_URL=redis://localhost:6379
DASHBOARD_PASSWORD=...
```

### Deployment

Deployed on Render with automatic builds:
- **Build**: `npm install`
- **Start**: `npm start`
- **Health Check**: `/health`

Docker option available via `docker-compose up`.

---

## Salesforce Integration

### Required Custom Fields

| Object | Field | Purpose |
|--------|-------|---------|
| Account | `Customer_Brain__c` | Meeting notes and insights |
| Account | `Account_Plan_s__c` | Strategic account plans |
| Account | `Customer_Type__c` | Revenue/Pilot/LOI classification |
| Opportunity | `ACV__c` | Annual contract value |
| Opportunity | `Finance_Weighted_ACV__c` | Weighted pipeline value |
| Opportunity | `Product_Line_s__c` | Product/service categorization |
| Contract | `Contract_Name_Campfire__c` | Contract display name |
| Contract | `Contract_Type__c` | Recurring/LOI/Amendment |

---

## Security

- Dashboard access is password protected
- Salesforce uses OAuth2 with automatic token refresh
- All credentials stored in environment variables
- Sensitive data redacted from logs
- Redis connections encrypted in production

---

## License

MIT
