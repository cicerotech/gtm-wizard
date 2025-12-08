# GTM Brain - Complete Project Handoff

## Quick Reference
| Item | Value |
|------|-------|
| GitHub | `cicerotech/gtm-wizard` |
| Live Dashboard | https://gtm-wizard.onrender.com/account-dashboard |
| Password | `eudia-gtm` |
| Slack Bot | GTM Brain in Eudia workspace |
| Host | Render.com (auto-deploy on push) |

---

## Project Overview

GTM Brain is a comprehensive **Slack bot + web dashboard** platform that provides real-time Go-To-Market intelligence by integrating with Salesforce. It's not just a dashboard - it's an all-encompassing RevOps platform.

### Core Capabilities
1. **Natural Language Salesforce Queries** - Ask questions in Slack, get pipeline data
2. **Contract Analysis & Creation** - PDF extraction → Salesforce contract records
3. **Web Dashboard** - 5-tab visual interface with real-time + blended data
4. **Pipeline Export** - Excel exports via Slack
5. **Account Management** - Create accounts, assign BLs, save account plans
6. **Smart BL Assignment** - Workload + region-based recommendations
7. **Hyprnote Meeting Sync** - Local meeting notes → Salesforce
8. **Competitive Landscape** - Query accounts mentioning competitors
9. **Scheduled Reports** - Daily/weekly automated summaries

---

## Architecture

```
gtm-brain/
├── src/
│   ├── app.js                      # Express server + Slack Bolt app entry point
│   ├── slack/
│   │   ├── events.js               # Slack message handlers, ALL intent routing (~3800 lines)
│   │   ├── accountDashboard.js     # Dashboard HTML generation (~2200 lines)
│   │   ├── commands.js             # Slash commands (/pipeline, /forecast)
│   │   └── responseFormatter.js    # Slack message formatting
│   ├── services/
│   │   ├── contractAnalyzer.js     # PDF text extraction & field parsing (~1750 lines)
│   │   ├── contractCreation.js     # Salesforce contract record creation
│   │   ├── accountAssignment.js    # BL workload/region logic (~280 lines)
│   │   └── hyprnoteSyncService.js  # Meeting notes → Salesforce sync
│   ├── salesforce/
│   │   ├── connection.js           # jsforce connection management
│   │   └── queries.js              # SOQL query builder
│   ├── ai/
│   │   ├── intentParser.js         # Message → intent classification (~1500 lines)
│   │   ├── contextManager.js       # Conversation context tracking
│   │   ├── socratesAdapter.js      # Internal AI platform adapter
│   │   ├── queryOptimizer.js       # Query performance optimization
│   │   └── feedbackLearning.js     # Reaction-based feedback learning
│   ├── data/
│   │   └── johnsonHanaData.js      # Static JH pipeline data (updated weekly)
│   └── utils/
│       ├── cache.js                # Redis/in-memory caching
│       ├── logger.js               # Structured logging
│       └── formatters.js           # Currency, date, stage formatting
├── data/
│   ├── sample-queries.json         # Example queries for training
│   ├── schema-opportunity.json     # Opportunity field definitions
│   ├── schema-account.json         # Account field definitions
│   └── business-logic.json         # Business rules (segments, stages)
├── hyprnote-sync/                  # Distributable meeting sync tool
│   ├── lib/                        # Core sync libraries
│   ├── setup-quick.js              # User setup wizard
│   ├── sync.js                     # Manual sync execution
│   ├── auto-sync.js                # Scheduled 3-hour sync
│   ├── install.command             # macOS one-click installer
│   └── hyprnote-setup.html         # Onboarding guide
└── scripts/
    └── test-hyprnote-sync.js       # Local sync testing
```

---

## 1. SLACK BOT - Natural Language Queries

### Intent Types (from `src/ai/intentParser.js` & `src/slack/events.js`)

| Intent | Examples | Handler |
|--------|----------|---------|
| `pipeline_summary` | "Show pipeline", "What's in Stage 3?" | SOQL aggregation |
| `deal_lookup` | "Tell me about the Acme deal" | Single opp query |
| `account_lookup` | "Who owns DHL?", "Tell me about Cargill" | Account details + pipeline |
| `account_stage_lookup` | "What stage is Resmed in?" | Stage info |
| `account_field_lookup` | "Competitive landscape for Acme" | Specific field query |
| `owner_accounts_list` | "Julie's accounts", "Himanshu's pipeline" | Owner filtering |
| `count_query` | "How many deals closed this month?" | COUNT aggregation |
| `weighted_summary` | "What's our weighted pipeline?" | Finance_Weighted_ACV__c sum |
| `forecasting` | "Are we on track for Q4?" | Forecast vs target |
| `trend_analysis` | "Pipeline trend this quarter" | Historical comparison |
| `contract_query` | "Active contracts", "Expiring contracts" | Contract object query |
| `activity_check` | "Stale deals", "No activity 30+ days" | LastActivityDate check |
| `save_customer_note` | "Add to customer history: [Company]..." | Customer_Brain__c update |
| `save_account_plan` | "Add account plan for [Company]..." | Account_Plan_s__c update |
| `query_account_plan` | "What's the plan for [Company]?" | Read account plan |
| `create_account` | "Create Acme Corp and assign to Julie" | New Account + owner |
| `reassign_account` | "Reassign Acme to Asad" | Owner change |
| `create_opportunity` | "Create opp for Acme, $100k" | New Opportunity |
| `move_to_nurture` | "Move Acme to nurture" | Stage change |
| `close_account_lost` | "Close Acme as lost" | Stage 7 |
| `send_excel_report` | "Send pipeline in Excel" | .xlsx attachment |
| `send_johnson_hana_excel` | "Send JH pipeline" | JH data export |
| `account_status_dashboard` | "Dashboard link" | Dashboard URL |
| `post_call_summary` | "[Call summary]" | Log meeting notes |
| `competitive_landscape_lookup` | "Who mentions Ironclad?" | Account search |

### Key Pattern Matching (in `fallbackPatternMatching`)

```javascript
// Contract upload trigger
if (event.files && event.files.length > 0) {
  const pdfFiles = event.files.filter(f => f.mimetype?.includes('pdf'));
  if (pdfFiles.length > 0) {
    await processContractUpload(pdfFiles[0], client, userId, channelId);
    return;
  }
}

// Contract creation confirmation
const lowerText = cleanText.toLowerCase();
if (lowerText.includes('create') && lowerText.includes('contract')) {
  await handleContractCreationConfirmation(...);
  return;
}

// Contract activation
if (lowerText.includes('activate') && lowerText.includes('contract')) {
  await handleContractActivation(...);
  return;
}

// Hyprnote sync
if (lowerText.includes('sync') && (lowerText.includes('hyprnote') || lowerText.includes('meeting'))) {
  await handleHyprnoteSync(...);
  return;
}
```

### Conversation Context
The bot maintains context for follow-up questions:
```javascript
// In contextManager.js
const context = await getContext(userId);
// Stores: lastQuery, lastFilters, lastResults, timestamp
// Enables: "Show me just Julie's" after "Show pipeline"
```

---

## 2. CONTRACT ANALYSIS & CREATION

### Flow
1. **User uploads PDF** → Slack DM to bot
2. **Bot extracts text** → `contractAnalyzer.js`
3. **Pattern matching** → Extract values (value, term, signers, dates)
4. **Account matching** → Fuzzy match to Salesforce accounts
5. **Display for confirmation** → Formatted Slack message
6. **User says "create contract"** → Draft created in SF
7. **User says "activate contract"** → Status → Activated

### Key Extraction Patterns (`contractAnalyzer.js`)

```javascript
// Contract value patterns
/\$[\d,]+(?:\.\d{2})?\s*(?:per\s+)?(?:month|mo|monthly|year|yr|annually|total)/gi

// Term patterns  
/(?:term|period|duration)[:\s]+(\d+)\s*(month|year|mo|yr)/gi

// Signer patterns
/(?:by|signature|signed)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)/g

// Date patterns
/(?:effective|start|commence)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi
```

### Salesforce Contract Fields

| Field | API Name | Purpose |
|-------|----------|---------|
| Contract Name | `Contract_Name_Campfire__c` | From PDF filename |
| Account | `AccountId` | Lookup - fuzzy matched |
| Start Date | `StartDate` | Extracted or today |
| Term (months) | `ContractTerm` | Extracted |
| Status | `Status` | Draft → Activated |
| Owner | `OwnerId` | Assigned BL |
| Total Value | `Contract_Value__c` | Currency |
| Annual Value | `Annualized_Revenue__c` | Calculated |
| Monthly | `Amount__c` | TotalValue / Term |
| Customer Signer | `Contact_Signed__c` | Lookup or text |
| Product | `Parent_Product__c` | AI-Augmented Contracting, etc. |

### Contract Type Classification
- **CAB/LOI**: Non-binding, advisory (excludes monetary fields)
- **Recurring**: Subscription contracts (monthly amounts)
- **One-Time**: Project/pilot engagements

---

## 3. WEB DASHBOARD

### Tab Structure
| Tab | HTML ID | Purpose |
|-----|---------|---------|
| Pipeline | `#topco` | Combined pipeline by stage, top accounts, product tiles |
| Weekly | `#weekly` | Friday RevOps email format - forecast, logos, deals |
| Business Leads | `#summary` | Accounts grouped by stage with BL breakdown |
| Revenue | `#revenue` | Active contracts, signed deals, forecast |
| Accounts | `#account-plans` | Searchable list with account plans |

### Data Sources
- **Salesforce (Live)**: Opportunities, Accounts, Contracts, Events
- **Johnson Hana (Static)**: From `src/data/johnsonHanaData.js`

### Johnson Hana Acquisition Context
JH was acquired by Eudia. All JH data now displays under Eudia branding:
- **No "Johnson Hana" visible** - removed from all headers
- **Use `•` indicator** for legacy acquisition data
- **Legend**: `• = legacy acquisition (updated weekly)`

### Key Variables in `generateAccountDashboard()`
```javascript
const accountMap = new Map();         // Account → { opportunities, totalACV, ... }
const stageBreakdown = {};            // Stage → { count, totalACV, weightedACV }
const productBreakdown = {};          // Product → { count, totalACV, byStage }
const meetingData = new Map();        // AccountId → { lastMeeting, nextMeeting }
const logosByType = { revenue: [], pilot: [], loi: [] };

// JH data (must import in both generateTopCoTab AND generateAccountDashboard)
const jhSummary = getJohnsonHanaSummary();
const jhAccounts = getAccountSummaries();
```

### Dashboard Gotchas
1. **Variable Scope**: `jhSummary`/`jhAccounts` must be imported in BOTH tab generators
2. **CSS Tabs**: Pure CSS (no JS) for CSP compliance
3. **Stage Regex**: `stage.match(/Stage (\d)/)?.[1]` - not double escaped
4. **Currency**: Use `fmt()` helper - lowercase 'm' and 'k'

---

## 4. ACCOUNT ASSIGNMENT

### Smart BL Suggestions (`src/services/accountAssignment.js`)

When user says "reassign Acme to BL" (without specifying who):

```javascript
// 1. Determine region from account location
const region = determineRegion({ state: account.BillingState, country: account.BillingCountry });

// 2. Get BLs for that region
const candidates = BL_ASSIGNMENTS[region.blRegion];

// 3. Assess workload for each
for (const bl of candidates) {
  const workload = await assessWorkload(bl);  // Open opps + closing deals
  scores.push({ name: bl, score: workload });
}

// 4. Suggest lowest workload
const recommended = scores.sort((a, b) => a.score - b.score)[0];
```

### Geographic Mapping
| Region | States | BLs |
|--------|--------|-----|
| West | CA, OR, WA, NV, AZ, CO, UT... | Himanshu, Julie, Justin |
| Northeast | ME, NH, VT, MA, NY, NJ, PA... | Olivia |
| Midwest | OH, MI, IN, WI, IL, MN... | West Coast BLs |
| International | Non-USA | JH Team |

### Business Lead IDs
```javascript
const BUSINESS_LEAD_IDS = {
  'Julie Stefanich': '005Hp00000kywEtIAI',
  'Justin Hills': '005Wj00000UVn1ZIAT',
  'Asad Hussain': '005Wj00000DT05BIAT',
  'Himanshu Agarwal': '005Hp00000kywEeIAI',
  'Ananth Cherukupally': '005Wj00000DSlJ6IAL',
  'Olivia Jung': '005Hp00000kywEiIAI',
  'Jon Cobb': '005Wj00000MxJI6IAN',
  'Keigan Pesenti': '005Wj00000IPqFZIA1'  // RevOps - not a BL
};
```

---

## 5. HYPRNOTE MEETING SYNC

### Purpose
Syncs AI-generated meeting notes from local Hyprnote app to Salesforce.

### Architecture
```
hyprnote-sync/
├── lib/
│   ├── hyprnote.js       # Read local SQLite database
│   ├── matcher.js        # Account/contact fuzzy matching
│   ├── salesforce.js     # SF API operations
│   └── team-registry.js  # Pre-configured user IDs
├── setup-quick.js        # Interactive setup wizard
├── sync.js               # Main sync script
├── auto-sync.js          # 3-hour scheduled sync
├── install.command       # macOS one-click installer
└── hyprnote-setup.html   # Onboarding guide (HTML)
```

### Sync Flow
1. User completes meeting in Hyprnote
2. Hyprnote generates AI summary locally (runs on device)
3. Sync runs automatically every 3 hours (or manual via Slack: `sync hyprnote`)
4. For each new meeting:
   - Fuzzy match to Salesforce Account
   - Create/update Contact record
   - Create Event with meeting notes attached
   - Append insights to `Customer_Brain__c` on Account

### Database Path
```javascript
const HYPRNOTE_DB_PATH = path.join(
  os.homedir(), 
  'Library/Application Support/com.hyprnote.stable/db.sqlite'
);
```

### Team Registry (`lib/team-registry.js`)
Pre-configured SF User IDs for team members - enables auto-detection during setup.

### Onboarding HTML
`hyprnote-setup.html` provides:
- Two modes: "Sales Team" (syncs to SF) vs "Internal Use" (local only)
- Direct download links for Hyprnote and Node.js
- Step-by-step setup instructions
- Privacy/security messaging

---

## 6. SALESFORCE FIELD MAPPINGS

### Opportunity Object
| Field | API Name | Purpose |
|-------|----------|---------|
| Stage | `StageName` | "Stage 0 - Qualifying" → "Stage 6. Closed(Won)" |
| ACV | `ACV__c` | Annual Contract Value |
| Weighted ACV | `Finance_Weighted_ACV__c` | Probability-weighted value |
| Product Line | `Product_Line__c` | AI-Augmented Contracting, Compliance, sigma, etc. |
| Target Sign Date | `Target_LOI_Date__c` | Expected close date |
| Revenue Type | `Revenue_Type__c` | "ARR", "Booking" (LOI), etc. |
| Days in Stage | `Days_in_Stage__c` | Days since stage entry |
| Closed Lost Detail | `Closed_Lost_Detail__c` | Reason for loss |
| Closed Lost Reason | `Closed_Lost_Reason__c` | Category |

### Account Object
| Field | API Name | Purpose |
|-------|----------|---------|
| Customer Type | `Customer_Type__c` | "Revenue", "Pilot", "LOI with $ attached" |
| Account Plan | `Account_Plan_s__c` | Long-text strategic plan |
| Customer Brain | `Customer_Brain__c` | Meeting notes, AI insights |
| First Deal Closed | `First_Deal_Closed__c` | Date of first win |
| Is New Logo | `Is_New_Logo__c` | Boolean |
| Competitive Landscape | `Competitive_Landscape__c` | Competitor mentions |

### Stage Mapping
```javascript
const STAGES = [
  'Stage 0 - Qualifying',
  'Stage 1 - Discovery',
  'Stage 2 - SQO',
  'Stage 3 - Pilot',
  'Stage 4 - Proposal',
  'Stage 5 - Negotiation',
  'Stage 6. Closed(Won)',
  'Stage 7. Closed (Lost)'
];
```

---

## 7. KEY SOQL QUERIES

### Pipeline (includes Stage 5)
```sql
SELECT StageName, SUM(ACV__c) Gross, SUM(Finance_Weighted_ACV__c) Weighted, COUNT(Id) Count
FROM Opportunity
WHERE IsClosed = false 
  AND StageName IN ('Stage 0...', 'Stage 1...', ..., 'Stage 5 - Negotiation')
GROUP BY StageName
```

### Signed Deals (Last 90 Days)
```sql
SELECT Account.Name, Name, ACV__c, CloseDate, Revenue_Type__c, Owner.Name
FROM Opportunity
WHERE StageName = 'Stage 6. Closed(Won)' 
  AND CloseDate >= LAST_N_DAYS:90
  AND (NOT Account.Name LIKE '%Sample%')
  AND (NOT Account.Name LIKE '%Test%')
ORDER BY CloseDate DESC
```

### Active Contracts
```sql
SELECT Account.Name, Annualized_Revenue__c, Contract_Value__c, StartDate, EndDate
FROM Contract
WHERE Status = 'Activated'
ORDER BY Annualized_Revenue__c DESC NULLS LAST
```

### Logos by Type
```sql
SELECT Name, Customer_Type__c, First_Deal_Closed__c
FROM Account
WHERE Customer_Type__c != null
```

---

## 8. HARDCODED VALUES

### Run Rate Forecast (Weekly Tab)
```javascript
// Historical actuals - update monthly
August:   Eudia $5.1m  | JH $10.2m | OH $1.5m | Combined $17.6m
September: Eudia $5.4m | JH $10.2m | OH $1.5m | Combined $18.4m
October:  Eudia $7.3m  | JH $10.2m | OH $1.5m | Combined $19.8m
November: Eudia $7.46m | JH $10.2m | OH $1.5m | Combined $19.2m
```

### Net New Logos
```javascript
FY2024 Total: 4
Q1 FY2025: 2
Q2 FY2025: 2
Q3 FY2025: 25
Q4 FY2025: 5 (BNY Mellon, Delinea, IQVIA, Udemy, WWT)
```

### JH Logos (35 total)
```
ACS, Airbnb, Airship, Aryza, BOI, Coimisiún na Meán, Coillte, Coleman Legal, 
CommScope, Consensys, Creed McStay, Datalex, DCEDIY, Dropbox, ESB, Etsy, Gilead, 
Glanbia, Hayes, Indeed, Irish Water, Kellanova, Kingspan, Northern Trust, NTMA, 
OpenAI, Orsted, Perrigo, Sisk, Stripe, Taoglas, Teamwork, TikTok, Tinder, Udemy
```

---

## 9. COMMON PATTERNS & GOTCHAS

### Currency Formatting
```javascript
const fmt = (val) => {
  if (!val || val === 0) return '-';
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';  // lowercase
  return '$' + Math.round(val / 1000) + 'k';  // lowercase
};
```

### Stage Name Regex
```javascript
// Salesforce: "Stage 4 - Proposal"
// JH Data: "Stage 4 Proposal" or "Stage 4 - Proposal"

// Safe extraction:
const stageNum = stage.match(/Stage\s*(\d)/)?.[1] || '?';
const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
```

### Template Escaping
```javascript
// In JS template literals, single backslash:
stage.match(/Stage\s*(\d)/)?.[1]    // Correct
stage.match(/Stage\\s*(\\d)/)?.[1]  // Wrong - double escaped
```

### Sample Account Filtering
```javascript
const isSampleAccount = (name) => {
  const lower = name?.toLowerCase() || '';
  return ['sample', 'acme', 'sandbox', 'test'].some(s => lower.includes(s));
};
```

---

## 10. TESTING CHECKLIST

Before deploying:

1. **Syntax Check**: `node --check src/slack/accountDashboard.js`
2. **Lint Check**: Use `read_lints` tool
3. **Variable Scope**: Ensure all template variables are defined
4. **JH Data Access**: Both `generateTopCoTab` and `generateAccountDashboard` need imports
5. **Regex Escaping**: Check stage matching patterns
6. **Currency Format**: Use `fmt()` helper consistently

---

## 11. DEPLOYMENT

```bash
# Commit and push triggers Render auto-deploy
git add -A
git commit -m "Description"
git push

# Render takes ~30-60 seconds to rebuild
# Check logs at render.com dashboard
```

### Environment Variables (Render)
```
SF_INSTANCE_URL=https://eudia.my.salesforce.com
SF_USERNAME=<service account>
SF_PASSWORD=<password+security_token>
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
REDIS_URL=redis://...
```

---

## 12. QUICK FIX REFERENCE

### "jhSummary is not defined"
```javascript
// Add to generateAccountDashboard():
const { getJohnsonHanaSummary, getAccountSummaries } = require('../data/johnsonHanaData');
const jhSummary = getJohnsonHanaSummary();
const jhAccounts = getAccountSummaries();
```

### Stage expansion not working
```javascript
// Check regex - should be:
stage.match(/Stage (\d)/)?.[1]  // Not double-escaped
```

### Dashboard shows wrong totals
```sql
-- Ensure Stage 5 included:
StageName IN ('Stage 0...', ..., 'Stage 5 - Negotiation')
```

### Contract creation fails with "invalid cross reference id"
- Check `AccountId` exists and is valid
- Check `OwnerId` matches Business Lead ID in `BUSINESS_LEAD_IDS`
- Check `CustomerSignedId` is a valid Contact ID (or leave blank)

### Dashboard not showing accounts in tiles
- Check `Customer_Type__c` field has values
- Ensure categorization logic checks both 'revenue' AND 'arr' (legacy naming)

---

## 13. SUPPORT CONTACTS

- **RevOps**: Keigan Pesenti (keigan.pesenti@eudia.com)
- **Product**: Zack Huffstutter
- **Engineering**: #eng-support Slack

---

## For New Chat Sessions

Copy/paste this to start a new chat with full context:

```
I need help with the GTM Brain project. Full context:

**GitHub**: cicerotech/gtm-wizard
**Dashboard**: https://gtm-wizard.onrender.com/account-dashboard (password: eudia-gtm)

This is a Slack bot + web dashboard that:
1. Answers natural language Salesforce queries
2. Analyzes PDF contracts and creates SF records
3. Provides a 5-tab web dashboard (Pipeline, Weekly, Business Leads, Revenue, Accounts)
4. Exports pipeline to Excel
5. Manages accounts (create, assign, save plans)
6. Syncs Hyprnote meeting notes to Salesforce
7. Provides smart BL assignment based on workload/region

Please read HANDOFF.md in the repo for complete details including:
- File structure and key modules
- All intent types and handlers
- Salesforce field mappings
- Dashboard tab structure
- JH acquisition context (use • indicator, no JH visible)
- Common gotchas (jhSummary scope, regex escaping, fmt helper)
- Hardcoded values (forecast, logos)
- Testing checklist

Current state: Dashboard working with 5 tabs, JH data consolidated under Eudia branding.
```
