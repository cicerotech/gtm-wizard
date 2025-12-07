# GTM Brain - Project Handoff Document

## Quick Reference
- **GitHub**: `cicerotech/gtm-wizard`
- **Live Dashboard**: `https://gtm-wizard.onrender.com/account-dashboard`
- **Password**: `eudia-gtm`
- **Slack Bot**: GTM Brain in Eudia workspace

---

## Project Overview

GTM Brain is a Slack bot + web dashboard that provides real-time GTM (Go-To-Market) intelligence by integrating with Salesforce. It answers questions about pipeline, accounts, opportunities, and provides a visual dashboard for leadership.

### Core Capabilities
1. **Slack Bot** - Natural language queries about pipeline, accounts, opportunities
2. **Web Dashboard** - 5-tab visual interface with real-time Salesforce data + static JH data
3. **Contract Analysis** - PDF extraction for new contracts
4. **Pipeline Export** - Excel exports of pipeline data
5. **Account Assignment** - Smart BL (Business Lead) recommendations

---

## Architecture

```
gtm-brain/
├── src/
│   ├── app.js                    # Express server + Slack Bolt app
│   ├── slack/
│   │   ├── events.js             # Slack message handlers, intent routing
│   │   └── accountDashboard.js   # Main dashboard HTML generation (~2200 lines)
│   ├── services/
│   │   ├── contractAnalyzer.js   # PDF text extraction
│   │   ├── contractCreation.js   # Salesforce contract creation
│   │   ├── accountAssignment.js  # BL workload/region logic
│   │   └── hyprnoteSyncService.js # Meeting notes sync (WIP)
│   ├── salesforce/
│   │   └── connection.js         # jsforce connection management
│   ├── ai/
│   │   ├── intentParser.js       # Message intent classification
│   │   └── socratesAdapter.js    # Internal AI platform adapter
│   ├── data/
│   │   └── johnsonHanaData.js    # Static JH pipeline data
│   └── utils/
│       └── cache.js              # Redis/in-memory caching
├── hyprnote-sync/                # Local meeting notes sync tool
└── package.json
```

---

## Critical File: `src/slack/accountDashboard.js`

This is the heart of the dashboard. **~2200 lines**. Structure:

### Function Order
1. `generateTopCoTab()` - Pipeline tab (lines 44-445)
2. `generateWeeklyTab()` - Weekly RevOps summary (lines 448-875)
3. `generateAccountDashboard()` - Main orchestrator (lines 896-2200+)

### Tab Structure (in order)
| Tab Name | HTML ID | Purpose |
|----------|---------|---------|
| Pipeline | `#topco` | Combined pipeline by stage, top accounts, product/service tiles |
| Weekly | `#weekly` | Friday RevOps email format - forecast, logos, deals |
| Business Leads | `#summary` | Accounts grouped by stage with BL breakdown |
| Revenue | `#revenue` | Active contracts, signed deals, logos by type |
| Accounts | `#account-plans` | Searchable account list with plans |

### Data Sources
- **Salesforce (Live)**: Opportunities, Accounts, Contracts, Events
- **Johnson Hana (Static)**: From `src/data/johnsonHanaData.js` - updated weekly

### Key Variables in `generateAccountDashboard()`
```javascript
// Salesforce data
const accountMap = new Map();        // Account Name -> { opportunities, totalACV, ... }
const stageBreakdown = {};           // Stage -> { count, totalACV, weightedACV }
const productBreakdown = {};         // Product -> { count, totalACV, byStage }
const meetingData = new Map();       // Account ID -> { lastMeeting, nextMeeting, contacts }
const logosByType = { revenue: [], pilot: [], loi: [] };

// Johnson Hana data (imported in function)
const jhSummary = getJohnsonHanaSummary();  // Aggregated metrics
const jhAccounts = getAccountSummaries();   // Individual accounts
```

---

## Johnson Hana Acquisition Context

**IMPORTANT**: Johnson Hana was acquired by Eudia. All JH references should be subtle:

### Display Convention
- **No "Johnson Hana" visible** - removed from all headers
- **Use `•` indicator** for legacy acquisition data
- **Combine data** into unified "Eudia" views
- **Legend**: `• = legacy acquisition (updated weekly)`

### Code Locations for JH Data
```javascript
// In generateTopCoTab:
const jhSummary = getJohnsonHanaSummary();
const jhAccounts = getAccountSummaries();
const closedWonNovDec = require('../data/johnsonHanaData').closedWonNovDec;

// In generateAccountDashboard (added for Accounts tab):
const { getJohnsonHanaSummary, getAccountSummaries } = require('../data/johnsonHanaData');
const jhSummary = getJohnsonHanaSummary();
const jhAccounts = getAccountSummaries();
```

### JH Data Structure (`src/data/johnsonHanaData.js`)
```javascript
// Key exports:
getJohnsonHanaSummary() => {
  totalPipeline,      // $11.3m
  totalWeighted,      // ~$7m
  totalOpportunities, // 81
  uniqueAccounts,     // 53
  eudiaTech: { opportunityCount, pipelineValue, percentOfValue },
  byStage: { 'Stage 4 - Proposal': { count, totalACV }, ... },
  pipeline: [{ account, acv, weighted, stage, ... }]
}

getAccountSummaries() => [
  { name, totalACV, weightedACV, highestStage, hasEudiaTech, opportunities: [...] }
]

closedWonNovDec => [{ account, acv, serviceLine, eudiaTech, owner }]
```

---

## Salesforce Field Mappings

### Opportunity Object
| Field | API Name | Purpose |
|-------|----------|---------|
| Stage | `StageName` | "Stage 0 - Qualifying" through "Stage 6. Closed(Won)" |
| ACV | `ACV__c` | Annual Contract Value |
| Weighted ACV | `Finance_Weighted_ACV__c` | Probability-weighted ACV |
| Product Line | `Product_Line__c` | AI-Augmented Contracting, Compliance, sigma, etc. |
| Target Sign Date | `Target_LOI_Date__c` | Expected close date |
| Revenue Type | `Revenue_Type__c` | "ARR", "Booking" (LOI), etc. |
| Owner | `Owner.Name` | Opportunity owner (BL) |
| Days in Stage | `Days_in_Stage__c` | Days since stage entry |
| Closed Lost Detail | `Closed_Lost_Detail__c` | Reason for loss |

### Account Object
| Field | API Name | Purpose |
|-------|----------|---------|
| Customer Type | `Customer_Type__c` | "Revenue", "Pilot", "LOI with $ attached", etc. |
| Account Plan | `Account_Plan_s__c` | Long-text account strategy |
| First Deal Closed | `First_Deal_Closed__c` | Date of first closed won deal |
| Is New Logo | `Is_New_Logo__c` | Boolean for new customer |
| Customer Brain | `Customer_Brain__c` | AI-generated insights field |

### Contract Object
| Field | API Name | Purpose |
|-------|----------|---------|
| Contract Name | `Contract_Name_Campfire__c` | Extracted from PDF filename |
| Status | `Status` | "Draft" → "Activated" |
| Start Date | `StartDate` | Contract start |
| Term | `ContractTerm` | Months |
| Total Value | `Contract_Value__c` | Total contract value |
| ARR | `Annualized_Revenue__c` | Annual recurring revenue |

---

## Dashboard Queries (Key SOQL)

### Pipeline Query (includes Stage 5)
```sql
SELECT StageName, SUM(ACV__c) GrossAmount, SUM(Finance_Weighted_ACV__c) WeightedAmount, COUNT(Id) DealCount
FROM Opportunity
WHERE IsClosed = false 
  AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 
                    'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
GROUP BY StageName
```

### Signed Deals (Last 90 Days)
```sql
SELECT Account.Name, Name, ACV__c, CloseDate, Revenue_Type__c, Account.Customer_Type__c, Owner.Name, Product_Line__c
FROM Opportunity
WHERE StageName = 'Stage 6. Closed(Won)' 
  AND CloseDate >= LAST_N_DAYS:90
  AND (NOT Account.Name LIKE '%Sample%')
  AND (NOT Account.Name LIKE '%Acme%')
  AND (NOT Account.Name LIKE '%Sandbox%')
  AND (NOT Account.Name LIKE '%Test%')
ORDER BY CloseDate DESC
```

### Active Contracts
```sql
SELECT Account.Name, Annualized_Revenue__c, Contract_Value__c, StartDate, EndDate, Contract_Type__c
FROM Contract
WHERE Status = 'Activated'
ORDER BY Annualized_Revenue__c DESC NULLS LAST
```

---

## Common Patterns & Gotchas

### 1. Stage Name Regex
Different data sources use different formats:
```javascript
// Salesforce: "Stage 4 - Proposal"
// JH Data: "Stage 4 Proposal" or "Stage 4 - Proposal"

// Safe extraction:
const stageNum = stage.match(/Stage\s*(\d)/)?.[1] || '?';
const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
```

### 2. Currency Formatting
Use the `fmt` helper consistently:
```javascript
const fmt = (val) => {
  if (!val || val === 0) return '-';
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';  // lowercase m
  return '$' + Math.round(val / 1000) + 'k';  // lowercase k
};
```

### 3. Variable Scope
`jhSummary` and `jhAccounts` must be imported in BOTH:
- `generateTopCoTab()` - for Pipeline tab
- `generateAccountDashboard()` - for Accounts tab

### 4. CSS Tabs (No JavaScript)
The dashboard uses pure CSS tabs for security (CSP):
```html
<input type="radio" name="tabs" id="tab-topco" checked>
#tab-topco:checked ~ #topco { display: block; }
```

### 5. Template Escaping in JavaScript Strings
When building HTML in JS template literals, use:
```javascript
// Single backslash for regex in template strings:
stage.match(/Stage\\s*(\\d)/)?.[1]  // Wrong - double escaped
stage.match(/Stage\s*(\d)/)?.[1]    // Correct in template literal context
```

---

## Recent Changes (Dec 2024)

### JH Consolidation
- Removed all "Johnson Hana" visible text
- Added `•` indicator for legacy data
- Merged stage tables into single "Pipeline by Stage"
- Merged top accounts into single "Eudia Top Accounts"
- Merged product/service tiles (blue above gray)

### Tab Renames
- "Top Co" → "Pipeline"
- "Eudia Summary" → "Business Leads"
- "Eudia Accounts" → "Accounts"

### Accounts Tab Enhancements
- Added JH accounts to searchable list
- JH accounts show with `•` indicator
- Updated logos count to include legacy (+35)

### Product/Service Tiles
- Blue (Eudia products) stacked above gray (legacy services)
- Dashed separator between groups
- Extra spacing at section top

---

## Testing Checklist

Before deploying changes:

1. **Syntax Check**: Run `node --check src/slack/accountDashboard.js`
2. **Lint Check**: Use `read_lints` tool
3. **Variable Scope**: Ensure all variables used in templates are defined
4. **JH Data Access**: Both tab generators need their own imports
5. **Regex Escaping**: Check stage matching patterns
6. **Currency Format**: Use `fmt()` helper, not inline formatting

---

## Deployment

```bash
# Commit and push triggers Render auto-deploy
git add -A
git commit -m "Description"
git push

# Render takes ~30-60 seconds to rebuild
# Check logs at render.com dashboard
```

---

## Environment Variables (Render)

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

## Key Hardcoded Values

### Run Rate Forecast (Weekly Tab)
```javascript
// Historical actuals - update monthly
August: $17.6m combined
September: $18.4m combined
October: $19.8m combined
November (EOM): $19.2m combined

// Eudia breakdown
Eudia: $5.1m → $5.4m → $7.3m → $7.46m

// JH breakdown (static until migration)
JH: $10.2m (as of EOM Nov)

// OutHouse
Meta: $1.5m
```

### Logo Counts (Weekly Tab)
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

## Business Lead IDs

```javascript
const BUSINESS_LEAD_IDS = {
  'Julie Stefanich': '005Hp00000kywEtIAI',
  'Justin Hills': '005Wj00000UVn1ZIAT',
  'Asad Hussain': '005Wj00000DT05BIAT',
  'Himanshu Agarwal': '005Hp00000kywEeIAI',
  'Ananth Cherukupally': '005Wj00000DSlJ6IAL',
  'Olivia Jung': '005Hp00000kywEiIAI',
  'Jon Cobb': '005Wj00000MxJI6IAN'
};
```

---

## Support Contacts

- **RevOps**: Keigan Pesenti (keigan.pesenti@eudia.com)
- **Product**: Zack Huffstutter
- **Engineering**: Check #eng-support Slack

---

## Quick Fix Reference

### "jhSummary is not defined"
Add to `generateAccountDashboard()`:
```javascript
const { getJohnsonHanaSummary, getAccountSummaries } = require('../data/johnsonHanaData');
const jhSummary = getJohnsonHanaSummary();
const jhAccounts = getAccountSummaries();
```

### Stage expansion not working
Check regex - should be:
```javascript
stage.match(/Stage (\d)/)?.[1]  // Not double-escaped
```

### Dashboard shows wrong totals
Ensure Stage 5 - Negotiation is included in queries:
```sql
StageName IN ('Stage 0...', 'Stage 1...', ..., 'Stage 5 - Negotiation')
```

### Product tiles mixed up
Stack blue (Eudia) above gray (JH):
```javascript
const productTiles = [];  // Eudia - process first
const serviceTiles = [];  // JH - render below with separator
```

