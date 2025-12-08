# gtm-brain

A conversational sales intelligence platform that connects Slack to Salesforce through natural language. Ask questions about your pipeline, upload contracts for automatic parsing, and access a unified executive dashboard—all without writing SOQL or navigating CRM screens.

**Live Dashboard**: [gtm-wizard.onrender.com/account-dashboard](https://gtm-wizard.onrender.com/account-dashboard)

---

## What It Does

gtm-brain acts as an intelligent layer between your sales team and Salesforce data. Instead of navigating dashboards, writing reports, or searching for account records, team members ask questions in plain English via Slack and receive immediate, formatted answers.

### Account Ownership & Lookup

When someone asks "Who owns Boeing?" or "What's the BL for Intel?", gtm-brain queries Salesforce, identifies the account owner, and returns the ownership details along with any active opportunities. The system handles company name variations (matching "BofA" to "Bank of America Corporation") through fuzzy matching algorithms.

### Pipeline Analysis

The core use case: understanding pipeline state. Queries like "Show me pipeline," "What's in Stage 3?", or "Julie's late-stage deals" return formatted opportunity lists with amounts, stages, and close dates. The system understands sales terminology—"late stage" maps to Stage 4 (Proposal), "early stage" to Stage 1 (Discovery).

**Supported query patterns include:**
- Stage-specific: "What accounts are in Stage 2?" → SQO opportunities
- Owner-specific: "Himanshu's deals" → Opportunities by owner
- Product-specific: "Contracting pipeline" → AI-Augmented Contracting opportunities
- Time-based: "What closed this month?" → Recent closed-won deals
- Health-based: "Stale deals over $200k" → Opportunities with no activity 30+ days

### Closed Deal Tracking

Track bookings and wins with queries like "What LOIs have we signed in the last two weeks?" or "How many bookings this month?" The system distinguishes between revenue types (ARR, Booking, Project) and can filter by signing date, close date, or creation date.

### Contract Analysis

Upload a PDF contract to the Slack bot via DM. The system extracts:
- **Contract value and term** — Total value, annual amount, monthly amount
- **Dates** — Start date, end date (calculated from term), signing date
- **Parties** — Customer name, customer signer (name and title), Eudia signer
- **Products** — Maps to known product lines (AI-Augmented Contracting, M&A, Compliance, sigma)
- **Contract type** — Recurring, LOI, Amendment

After extraction, reply "create contract" to generate a Draft contract record in Salesforce, or "create contract assign to [Name]" to specify the owner.

### Executive Dashboard

A password-protected web dashboard provides a consolidated view across five tabs:

| Tab | Content |
|-----|---------|
| **Summary** | Blended pipeline totals (Eudia + acquired pipeline), stage concentration breakdown (S1-S5 percentages), top accounts by ACV |
| **Weekly** | Q4 target opportunities, signed logos organized by fiscal quarter, current customer logo grid |
| **Pipeline** | Expandable pipeline by stage, business lead overview showing each rep's deals and totals, top opportunities by ACV |
| **Revenue** | Active revenue by account (November ARR totals), all closed-won deals grouped by Revenue/Pilot/LOI |
| **Accounts** | Customer type breakdown, account plan summaries, new logo tracking |

The dashboard blends live Salesforce data with static pipeline data (from acquired company integration) and displays combined totals as a unified view.

### Meeting Note Sync (Hyprnote Integration)

For users with Hyprnote (local meeting transcription tool), gtm-brain syncs meeting summaries to Salesforce:
- Creates Contact records if they don't exist
- Matches attendees to Accounts using fuzzy name matching
- Creates Event records with meeting notes attached
- Updates the Account's `Customer_Brain__c` field with conversation insights

Trigger via Slack: "sync hyprnote" or "hyprnote status" to check sync state.

### Account & Opportunity Management

Beyond queries, the system supports write operations:
- **Create accounts**: "Create Boeing and assign to BL" → Creates account with proper owner assignment
- **Reassign accounts**: "Reassign Intel to Julie" → Changes account ownership
- **Create opportunities**: "Create opp for Microsoft" → Creates Stage 1 opportunity with defaults, or specify inline: "Create a stage 4 opportunity for Acme with $300k ACV"
- **Account plans**: "Add account plan for Intel: [plan text]" → Saves to Account_Plan_s__c field
- **Customer notes**: "Add to customer history: Intel met with CLO..." → Appends to Customer_Brain__c

### Pipeline Export

Generate Excel reports via Slack: "Send me pipeline in Excel" produces a formatted .xlsx file with deal details, stages, amounts, and owners.

---

## How It Works

### Intent Classification

When a message arrives, gtm-brain runs it through a multi-layer classification system:

1. **Exact match** — Previously seen queries with known good classifications (instant response)
2. **Semantic similarity** — Compares against known query patterns using OpenAI embeddings
3. **Pattern matching** — 30+ regex patterns covering common sales query types
4. **LLM classification** — GPT-4 for complex or ambiguous queries

The system learns from successful classifications, storing them for future exact matching. This means repeated queries get faster over time.

### Salesforce Integration

All data queries translate to SOQL and execute against the connected Salesforce org. The connection maintains:
- OAuth2 authentication with automatic token refresh (90-minute cycle)
- Query caching (5-minute TTL) to reduce API calls
- Retry logic with exponential backoff for transient failures
- Rate limiting to stay within Salesforce API limits

### Data Blending

The dashboard combines data from multiple sources:
- **Eudia Salesforce** — Live queries for opportunities, accounts, contracts
- **Acquired pipeline** — Static data representing pipeline from company acquisition (synced weekly)
- **Active revenue** — November ARR figures for all revenue-generating accounts

These sources blend into unified totals, showing the complete picture without manual reconciliation.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Slack       │◄───►│    gtm-brain    │◄───►│   Salesforce    │
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

**Key patterns:**
- Graceful degradation: If OpenAI is unavailable, pattern matching handles queries
- If Redis is unavailable, in-memory caching provides fallback
- Structured logging with Winston for debugging and monitoring
- Error recovery with automatic reconnection for Slack socket mode

---

## Project Structure

```
gtm-brain/
├── src/
│   ├── app.js                     # Express server, Slack Bolt app initialization
│   ├── ai/
│   │   ├── intentParser.js        # Intent classification (30+ patterns)
│   │   ├── mlIntentClassifier.js  # Hybrid ML classification with learning
│   │   ├── semanticMatcher.js     # Embedding-based query matching
│   │   ├── feedbackLearning.js    # User feedback processing
│   │   └── contextManager.js      # Conversation state tracking
│   ├── salesforce/
│   │   ├── connection.js          # SF connection with retry logic
│   │   └── queries.js             # SOQL query generation
│   ├── services/
│   │   ├── contractAnalyzer.js    # PDF text extraction and parsing
│   │   ├── llmContractExtractor.js # LLM-based contract field extraction
│   │   ├── contractCreation.js    # Salesforce contract record creation
│   │   └── hyprnoteSyncService.js # Meeting note sync to Salesforce
│   ├── slack/
│   │   ├── events.js              # Message event handlers (3,800+ lines of query logic)
│   │   ├── accountDashboard.js    # HTML dashboard generation
│   │   ├── commands.js            # Slash command handlers
│   │   └── responseFormatter.js   # Query result formatting
│   ├── data/
│   │   └── johnsonHanaData.js     # Static acquired pipeline data
│   └── utils/
│       ├── fuzzyAccountMatcher.js # Company name matching
│       ├── cache.js               # Redis/memory caching
│       └── formatters.js          # Currency, date formatting
├── data/
│   ├── intent-learning.json       # Learned query classifications
│   ├── query-embeddings.json      # Cached embeddings for semantic search
│   └── schema-*.json              # Salesforce field schemas
├── docs/                          # Documentation (50+ files)
├── tests/                         # Test and debug scripts
└── logs/                          # Runtime logs (gitignored)
```

---

## Salesforce Integration

### Required Custom Fields

| Object | Field | Purpose |
|--------|-------|---------|
| Account | `Customer_Brain__c` | Meeting notes and conversation insights |
| Account | `Account_Plan_s__c` | Strategic account plans |
| Account | `Customer_Type__c` | Customer classification (Revenue/Pilot/LOI) |
| Opportunity | `ACV__c` | Annual contract value |
| Opportunity | `Finance_Weighted_ACV__c` | Probability-weighted pipeline value |
| Opportunity | `Product_Line_s__c` | Product/service line categorization |
| Opportunity | `Target_LOI_Date__c` | Target signing date |
| Contract | `Contract_Name_Campfire__c` | Contract display name |
| Contract | `Contract_Type__c` | Recurring/LOI/One-Time/Amendment |
| Contract | `AI_Enabled__c` | Flag for AI-created contracts |

---

## Security

- Dashboard protected by password authentication with 30-day session cookies
- Salesforce connection uses OAuth2 with automatic token refresh
- All credentials stored in environment variables (never in code)
- Sensitive data (tokens, passwords) redacted from logs
- Rate limiting on dashboard (30 requests/minute per IP)

---

## Deployment

Deployed on Render (gtm-wizard.onrender.com):
- **Build command**: `npm install`
- **Start command**: `npm start`
- **Health check**: `/health` endpoint
- Docker option available via `docker-compose up`

---

## License

MIT
