# gtm-brain

**Live Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard)

---

## Overview

gtm-brain is an intelligent layer between our teams and our CRM. It handles pipeline queries, contract processing, and account management through Slack and natural language, syncs meeting data to Salesforce, and provides unified dashboard reporting.

**Core capabilities:** Natural language queries • Account management actions • GTM team insights

---

## The Problem

**Before gtm-brain: Fragmented GTM intelligence**

```
         Meetings & Calls
               │
               ▼
      ┌────────────────────┐
      │   Slack Messages   │ ──► Lost context
      │   (scattered)      │ ──► No searchability
      └────────────────────┘ ──► Manual entry required
               │
               ▼
      ┌────────────────────┐
      │    Salesforce      │ ──► Incomplete data
      │  (manual updates)  │ ──► Delayed visibility
      └────────────────────┘ ──► Siloed information
```

**Pain points:**
- Critical deal context lives in Slack threads, never captured in CRM
- Cross-functional teams lack real-time pipeline visibility
- Account ownership and opportunity details require navigating multiple Salesforce views
- Contract details extracted manually, prone to errors
- Meeting insights lost unless someone manually logs them

---

## Key Features

### 1. Conversational Intelligence

Query Salesforce naturally through Slack:

```
"Who owns Intel?" → Account owner + active opportunities + recent activity
"What's in Stage 3?" → All Pilot stage opportunities with amounts and close dates
"Stale deals over $200k" → Opportunities >$200k with no activity in 30+ days
```

**Supported query patterns:**
- **Stage-specific**: "What accounts are in Stage 2?" → SQO opportunities
- **Owner-specific**: "Himanshu's deals" → All opportunities by owner
- **Product-specific**: "Contracting pipeline" → AI-Augmented Contracting opps
- **Time-based**: "What closed this month?" → Recent closed-won deals
- **Health metrics**: "Show me Q4 targets" → Deals closing in current quarter
- **Ownership lookup**: "Who owns Boeing?" → Account owner and opportunity details

### 2. Account & Opportunity Management

Perform CRM operations directly through Slack conversation.

**Account operations:**
```
"Create Boeing and assign to BL" → New account with specified owner
"Reassign Intel to Julie" → Update account ownership
"Add account plan for Intel: [plan]" → Update Account_Plan_s__c field
"Add to customer history: Intel met with CLO..." → Append to Customer_Brain__c
```

**Opportunity operations:**
```
"Create opp for Microsoft" → Stage 1 opportunity with defaults
"Create a stage 4 opportunity for Acme with $300k ACV" → Detailed opp with specific stage and value
"Update Microsoft opp to Stage 3" → Move opportunity through pipeline
```

**Smart account assignment:**

When creating accounts, gtm-brain intelligently assigns based on:
- Business lead (BL) territories
- Product line specialization
- Existing account relationships
- Workload distribution

**Pipeline export:** `"Send me pipeline in Excel"` → Formatted .xlsx with all deal details

### 3. Intelligent Contract Processing

Upload contract PDFs → Automatic extraction → One-click Salesforce record creation

**Extracts:** Financial terms • Key dates • Parties and signers • Product mapping • Contract type

Reply `create contract` to generate a Draft contract record, or `create contract assign to Julie` to specify owner.

**Detailed extraction capabilities:**
- **Financial terms** — Total value, annual/monthly amounts, term length
- **Key dates** — Start date, end date, signing date
- **Parties** — Customer name, signers and titles
- **Product mapping** — Matches to your product catalog (AI-Augmented Contracting, M&A, Compliance, sigma)
- **Contract type** — Recurring, LOI, Amendment, One-Time

### 4. GTM Dashboard

Unified view of entire revenue operation, accessible to all go-to-market teams—not just sales leadership.

| Tab | Content |
|-----|---------|
| **Summary** | Pipeline totals, stage distribution, top accounts by ACV |
| **Weekly** | Q4 targets, signed logos by quarter, customer logo grid |
| **Pipeline** | Expandable pipeline by stage, per-rep breakdowns |
| **Revenue** | Active revenue by account, all closed-won deals |
| **Accounts** | Customer segmentation, account plans, new logos |

Password-protected with 30-day session cookies.

### 5. Meeting Note Sync

Automatically sync meeting transcriptions to Salesforce, capturing conversation context that would otherwise live only in Slack.

**Flow:** Hyprnote transcription → gtm-brain → Salesforce (Contacts, Events, Account insights)

Trigger: `sync hyprnote` • Check status: `hyprnote status`

**What gets synced:**
- Creates Contact records for new attendees
- Matches attendees to Accounts using intelligent name matching
- Creates Event records with meeting summaries attached
- Updates Account's `Customer_Brain__c` field with conversation insights

**Result**: Meeting intelligence flows directly into CRM, eliminating manual note-taking and ensuring institutional knowledge is preserved.

---

## How It Works

### Intent Classification with Continuous Learning

**Ensemble classification approach:**

```
Your Question
      │
      ├─► Pattern Matching (30%)  ──┐
      │   30+ regex patterns         │
      │                              │
      ├─► Semantic Matching (35%)  ──┤──► Ensemble Vote
      │   OpenAI embeddings          │    + Confidence Score
      │                              │
      └─► Neural Network (35%)  ─────┘
          Custom feedforward classifier
```

**The system learns from every interaction:**

1. **Successful classifications stored** → Growing knowledge base in `intent-learning.json`
2. **Exact match optimization** → Repeated queries get instant responses
3. **Semantic clustering** → Similar questions benefit from past classifications
4. **User feedback incorporation** → Corrections update classification weights
5. **Confidence scoring** → Low-confidence triggers LLM fallback and learning

**Result**: The more you use gtm-brain, the faster and more accurate it becomes.

**Salesforce integration:**

All queries translate to SOQL and execute against your Salesforce org:
- **OAuth2 authentication** with automatic token refresh (90-minute cycle)
- **Query caching** (5-minute TTL) to reduce API calls
- **Retry logic** with exponential backoff for transient failures
- **Rate limiting** to stay within Salesforce API limits
- **Intelligent name matching** handles company variations and partial names

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Slack    │◄───►│  gtm-brain  │◄───►│ Salesforce  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │  OpenAI  │      │  Redis   │      │ Hyprnote │
  └──────────┘      └──────────┘      └──────────┘
```

**Design principles:**
- **Graceful degradation** — Pattern matching handles queries if OpenAI is unavailable
- **Resilient caching** — In-memory fallback when Redis is down
- **Structured logging** — Winston-based logging for debugging and monitoring
- **Auto-recovery** — Automatic reconnection for Slack socket mode

---

## Project Structure

```
gtm-brain/
├── src/
│   ├── app.js                      # Express server, Slack Bolt initialization
│   ├── ai/
│   │   ├── intelligentRouter.js    # Ensemble classification engine
│   │   ├── intentParser.js         # Pattern-based intent matching
│   │   ├── semanticMatcher.js      # Embedding-based similarity
│   │   ├── feedbackLearning.js     # User feedback processing
│   │   └── contextManager.js       # Conversation state tracking
│   ├── ml/
│   │   └── intentClassifier.js     # Neural network classifier
│   ├── salesforce/
│   │   ├── connection.js           # SF connection with retry logic
│   │   └── queries.js              # SOQL query generation
│   ├── services/
│   │   ├── contractAnalyzer.js     # PDF text extraction
│   │   ├── llmContractExtractor.js # LLM-based field extraction
│   │   ├── contractCreation.js     # Salesforce contract creation
│   │   └── hyprnoteSyncService.js  # Meeting note sync
│   ├── slack/
│   │   ├── events.js               # Message event handlers
│   │   ├── accountDashboard.js     # Dashboard HTML generation
│   │   ├── commands.js             # Slash command handlers
│   │   └── responseFormatter.js    # Query result formatting
│   └── utils/
│       ├── fuzzyAccountMatcher.js  # Company name matching
│       ├── cache.js                # Redis/memory caching
│       └── formatters.js           # Currency, date formatting
├── __tests__/                      # Jest test suite
├── data/
│   ├── intent-learning.json        # Learned classifications (grows over time)
│   ├── query-embeddings.json       # Cached embeddings for semantic matching
│   └── schema-*.json               # Salesforce field schemas
└── docs/                           # Additional documentation
```

---

## Salesforce Setup

### Required Custom Fields

| Object | Field | Purpose |
|--------|-------|---------|
| **Account** | `Customer_Brain__c` | Meeting notes and conversation insights |
| | `Account_Plan_s__c` | Strategic account plans |
| | `Type__c` | Account classification (Revenue/Pilot/LOI) |
| **Opportunity** | `ACV__c` | Annual contract value |
| | `Finance_Weighted_ACV__c` | Probability-weighted pipeline value |
| | `Product_Line_s__c` | Product/service line categorization |
| | `Target_LOI_Date__c` | Target signing date |
| **Contract** | `Contract_Name_Campfire__c` | Contract display name |
| | `Contract_Type__c` | Recurring/LOI/One-Time/Amendment |
| | `AI_Enabled__c` | Flag for AI-created contracts |

---

## Deployment

**Production**: Render at gtm-wizard.onrender.com • **Health check**: `/health`

**Deployment commands:**

```bash
# Build
npm install

# Start
npm start

# Docker (alternative)
docker-compose up
```

**Required environment variables:**
- `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` — OAuth credentials
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` — Slack app tokens
- `OPENAI_API_KEY` — For LLM classification and embeddings
- `REDIS_URL` — Optional (falls back to in-memory cache)
- `DASHBOARD_PASSWORD` — Dashboard authentication

**Channel Intelligence Scraper (optional):**
- `INTEL_SCRAPER_ENABLED` — Set to `true` to enable the intelligence scraper
- `INTEL_DIGEST_CHANNEL` — Slack channel ID for daily intelligence digest
- `INTEL_DIGEST_TIME` — Time for daily digest (default: `08:00` ET)
- `INTEL_POLL_INTERVAL_HOURS` — Hours between channel polling (default: `1`)
- `INTEL_CONFIDENCE_THRESHOLD` — Minimum confidence for intelligence capture (default: `0.7`)

**Slack App Configuration for Intelligence Scraper:**

To use the Channel Intelligence Scraper, add these to your Slack App:

*Required Scopes (OAuth & Permissions):*
- `channels:history` — Read messages in public channels
- `groups:history` — Read messages in private channels
- `channels:read` — View channel info
- `users:read` — Get user info for message authors

*Required Slash Commands:*
- `/intel` — Channel intelligence management (set-account, status, poll, digest)

*Required Events (Event Subscriptions):*
- `member_joined_channel` — Detect when bot joins channels
- `member_left_channel` — Detect when bot leaves channels
- `channel_rename` — Track channel name changes

---

## Security

- Dashboard protected by password authentication with 30-day session cookies
- Salesforce connection uses OAuth2 with automatic token refresh
- All credentials stored in environment variables (never in code)
- Sensitive data (tokens, passwords) redacted from logs
- Rate limiting on dashboard (30 requests/minute per IP)

---

## License

MIT
