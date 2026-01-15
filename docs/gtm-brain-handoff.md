# GTM Brain Project Handoff Document

## Project Identity

### What is GTM Brain?
GTM Brain is a conversational Salesforce data assistant deployed as a Slack bot. It enables real-time pipeline queries, automated reporting, contact enrichment, and go-to-market intelligence for the Eudia sales team.

### User Context
- **Primary User:** Chief of Staff on GTM & Revenue Operations
- **Company:** Eudia — Series A legal tech startup specializing in AI-augmented contracting, compliance, and M&A services
- **Team Structure:** Business Leads (BLs) manage deals, Customer Success Managers (CSMs) manage accounts, Finance uses Campfire ERP for ARR tracking

### Your Role as Agent
You act as a **production engineer, advisor, and go-to-market expert**. You should:
- Understand Salesforce schema and SOQL deeply
- Know the sales process and revenue classification rules
- Be able to modify Node.js code, PDFKit reports, and Slack handlers
- Advise on RevOps best practices and investor reporting
- Act as an expert — don't ask basic questions

---

## Architecture Overview

### Tech Stack
| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Web Framework | Express.js |
| Slack Integration | @slack/bolt |
| Salesforce API | jsforce |
| PDF Generation | PDFKit |
| Excel Reports | ExcelJS |
| Scheduling | node-cron |
| Logging | Winston |
| AI/LLM | OpenAI, Anthropic (via Socrates gateway) |

### Deployment
- **Platform:** Render (Git-based auto-deploy)
- **Repository:** GitHub → pushes to `main` trigger deploy
- **URL:** https://gtm-wizard.onrender.com
- **Health Check:** `GET /health`

### Key Integrations
| System | Purpose | Connection |
|--------|---------|------------|
| Salesforce | Source of truth for pipeline, accounts, opportunities | jsforce with username/password + security token |
| Slack | User interface for queries and reports | Slack Bolt with bot token |
| Campfire | ERP for contract/ARR management (Finance-owned) | REST API |
| Socrates | Internal LLM gateway for Claude access | Okta M2M auth |

---

## Core File Map

### Entry Points
```
src/app.js                    # Main Express + Slack Bolt app
src/routes/emailBuilder.js    # API routes for email builder tool
```

### Salesforce Layer
```
src/salesforce/connection.js  # SF auth, circuit breaker, rate limiting
src/salesforce/queries.js     # SOQL query builders
```

### Slack Handlers
```
src/slack/events.js           # Main @gtm-brain mention handler, SOQL queries
src/slack/commands.js         # Slash command handlers
src/slack/interactive.js      # Button/modal interactions
src/slack/responseFormatter.js # Formats query results for Slack
src/slack/contactFormatter.js  # Contact enrichment formatting
src/slack/scheduled.js        # Cron jobs (CURRENTLY DISABLED)
```

### Report Generation
```
src/slack/blWeeklySummary.js      # Weekly snapshot PDF (Page 1 + 2)
src/slack/accountDashboard.js     # HTML account dashboard
src/slack/weeklyReport.js         # Pipeline reports
src/slack/fullPipelineReport.js   # Full pipeline Excel
src/slack/deliveryWeeklySummary.js # Delivery team reports
src/slack/csmAccountHealth.js     # CSM account health
```

### AI/Intent Parsing
```
src/ai/intentParser.js        # NL → structured query intent
src/ai/intelligentRouter.js   # Routes queries to handlers
src/ai/contextManager.js      # Conversation context
src/ai/semanticMatcher.js     # Fuzzy matching
src/ai/socratesAdapter.js     # LLM gateway integration
```

### Data Schemas & Config
```
data/schema-account.json      # Account object field definitions
data/schema-opportunity.json  # Opportunity object field definitions
data/business-logic.json      # Business rules, stage groups, thresholds
data/intent-patterns.json     # Query pattern matching
src/config/queryPatterns.json # Valid field values, aliases
```

### Services
```
src/services/contactEnrichment.js  # OSINT contact finding
src/services/contractAnalyzer.js   # Contract data processing
src/services/llmContractExtractor.js # LLM-based contract parsing
```

---

## Salesforce Schema — Critical Fields

### Account Object
| API Name | Label | Values | Notes |
|----------|-------|--------|-------|
| `Customer_Type__c` | Customer Type | `Existing`, `New` | Primary segmentation |
| `Customer_Subtype__c` | Customer Subtype | `MSA`, `Pilot`, `LOI` | Only applies to Existing |

**Logo Counting Logic:**
- Count accounts where `Customer_Type__c = 'Existing'`
- Then break down by `Customer_Subtype__c` (MSA, Pilot, LOI)

### Opportunity Object
| API Name | Label | Values |
|----------|-------|--------|
| `StageName` | Stage | `Stage 0 - Prospecting`, `Stage 1 - Discovery`, `Stage 2 - SQO`, `Stage 3 - Pilot`, `Stage 4 - Proposal`, `Stage 6. Closed(Won)`, `Stage 7. Closed Lost` |
| `Sales_Type__c` | Sales Type | `New business`, `Expansion`, `Renewal`, `Eudia Counsel` |
| `Revenue_Type__c` | Revenue Type | `Recurring`, `Project`, `Pilot`, `Commitment` |
| `Product_Line__c` | Product Line | See table below |
| `ACV__c` | Annual Contract Value | Currency |
| `Weighted_ACV__c` | Weighted ACV | Currency (stage-based) |
| `Finance_Weighted_ACV__c` | Finance Weighted ACV | Currency (Finance uses this) |
| `Target_LOI_Date__c` | Target Sign Date | Date |
| `Eudia_Tech__c` | AI Enabled | Boolean |

### Product Line Values (Exact API Names)
```
AI-Augmented Contracting_In-House Technology
AI-Augmented Contracting_Managed Services
AI-Augmented Compliance_In-House Technology
AI-Augmented M&A_Managed Service
Augmented-M&A
Custom Agents
Contracting - Secondee
Other_Managed Service
Other_Secondee
Litigation
sigma
Multiple
Undetermined
```
**Important:** Use exact API names with underscores, not display labels with dashes.

### Contract Object (Different from Opportunity)
| API Name | Values |
|----------|--------|
| `Parent_Product__c` | Different optionality than Opportunity |
| `Product_Line__c` | Slightly different values |
| `Status` | `Draft`, `Activated`, `Expired` |

---

## Business Logic Definitions

### Revenue Classification
| Type | Definition | ARR? |
|------|------------|------|
| **Recurring** | Term >= 12 months, predictable contracted revenue | Yes |
| **Project** | Term < 12 months, one-time or short-term | No |
| **Pilot** | Trial engagement | No |
| **Managed Services** | Variable utilization-based (if not fixed monthly) | No |

**Critical:** ARR = only truly recurring, predictable revenue. Do not annualize project or variable managed services revenue.

### Sales Type Classification
| Type | Definition |
|------|------------|
| **New business** | Net new logos OR net new product lines at existing customers |
| **Expansion** | Growth within existing product lines for existing ARR customers |
| **Renewal** | Full annualized renewal value (not just uplift) |
| **Eudia Counsel** | Eudia Counsel engagements |

### Stage Definitions
| Stage | Milestone |
|-------|-----------|
| Stage 0 - Prospecting | Initial outreach, no meeting yet |
| Stage 1 - Discovery | First meeting held, pain points identified |
| Stage 2 - SQO | Sales Qualified Opportunity, use cases defined, account plan developed |
| Stage 3 - Pilot | Active pilot or POC |
| Stage 4 - Proposal | Proposal sent, delivery details populated |
| Stage 6. Closed(Won) | Contract signed |
| Stage 7. Closed Lost | Lost deal |

**Note:** Stage 0 was renamed from "Qualifying" to "Prospecting" (label only, API name unchanged).

### Qualification Framework
MEDDPICC:
- **M**etrics — Quantified business impact
- **E**conomic Buyer — Identified and engaged
- **D**ecision Criteria — Understood
- **D**ecision Process — Mapped
- **P**aper Process — Known (legal, procurement)
- **I**dentify Pain — Explicit pain documented
- **C**hampion — Internal advocate confirmed

---

## Recent Changes Log

### Stage Cleanup (January 2026)
- Attempted to rename "Stage 0 - Qualifying" to "Stage 0 - Prospecting" via metadata API
- **Limitation discovered:** Salesforce does not allow label changes on OpportunityStage values via metadata API
- **Workaround:** Changed label in code/docs; API name unchanged
- Deactivated 40 unused stages, kept 9 active

### Weekly Snapshot Revamp
- Added **Page 1** with RevOps summary (run rate, signed revenue, top deals)
- Existing GTM snapshot content moved to **Page 2**
- Key queries added:
  - `querySignedRevenueQTD()` — Fiscal quarter closed won deals
  - `querySignedRevenueLastWeek()` — Last 7 days signed
  - `queryQ4WeightedPipeline()` — New Business + Expansion weighted ACV
  - `queryLogosByType()` — Existing accounts by subtype

### Account Dashboard Updates
- Replaced `UDATechEnabled` with `Eudia_Tech__c` (AI Enabled)
- Updated closed revenue to use `LAST_N_DAYS:60` dynamic lookback
- Removed Weekly tab
- Updated Pipeline tab with Sales Type and Product Line breakdowns
- Fixed account classification to use `Customer_Type__c` / `Customer_Subtype__c`

### Product Line API Names
- Corrected all code to use exact Salesforce API names (underscores, not dashes)
- Updated: `events.js`, `intentParser.js`, `queryPatterns.json`, `schema-opportunity.json`

### Authentication Issues (January 2026)
- Hit Salesforce login attempt limits due to multiple local processes running
- **Root cause:** `nodemon` respawning processes with old credentials
- **Fix:** Disabled all scheduled cron jobs in `scheduled.js`
- Added circuit breaker logic in `connection.js`
- Added enhanced logging for auth diagnostics

---

## Known Issues / Watch Items

### Salesforce API Limits
- Circuit breaker implemented in `src/salesforce/connection.js`
- If auth fails 5+ times, enters degraded mode for 15 minutes
- Reset via `POST /sf-reset` endpoint

### Scheduled Jobs (DISABLED)
All cron jobs in `src/slack/scheduled.js` are currently commented out:
- Weekly snapshot
- Delivery summary
- BL reports
These must be manually re-enabled after confirming auth stability.

### Stage Label Limitation
- Cannot rename existing OpportunityStage labels via Salesforce Metadata API
- "Stage 0 - Qualifying" cannot be changed to "Stage 0 - Prospecting" at the platform level
- Code and documentation updated, but Salesforce UI still shows old label

### Dependent Picklist: Product Line
- `Product_Line__c` depends on `Sales_Type__c`
- When editing opportunities, must select Sales Type first to enable Product Line
- This is Salesforce configuration, not a bug

### Weighted ACV Field Discrepancy
- `Weighted_ACV__c` — Used in most code
- `Finance_Weighted_ACV__c` — Used by Finance in some contexts
- Ensure correct field is used based on context

---

## Key Commands and Queries

### Slack Commands
| Command | Description |
|---------|-------------|
| `@gtm-brain weekly snapshot` | Generates RevOps Weekly PDF |
| `@gtm-brain who owns [account]` | Returns account owner |
| `@gtm-brain [account] pipeline` | Shows account's opportunities |
| `@gtm-brain dashboard` | Returns account dashboard link |
| `@gtm-brain contact [name] at [company]` | Contact enrichment |

### Deployment Process
```bash
# Make changes
git add .
git commit -m "description"
git push origin main

# Render auto-deploys from main branch
# If issues, do "Clear build cache & deploy" in Render dashboard
```

### Local Development
```bash
# Install dependencies
npm install

# Run locally (ensure .env has SF credentials)
npm run dev

# Run tests
npm test
```

### Environment Variables (Required in Render)
```
SALESFORCE_USERNAME
SALESFORCE_PASSWORD
SALESFORCE_SECURITY_TOKEN
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
SLACK_APP_TOKEN
```

---

## User Preferences and Communication Style

### What the User Expects
- **Short, tactical responses** — Don't over-explain
- **No emojis** in code output or Slack messages
- **Accuracy over speed** — Validate logic before claiming it's done
- **Expert behavior** — Don't ask basic questions; research first
- **Proactive problem identification** — Flag issues before they become blockers

### Common Feedback Patterns
- "This is still not correct" — Usually means a query filter or field name is wrong
- "Remove [X]" — Wants cleaner, simpler output
- "Make this dynamic" — Wants real-time data, not static values
- "Act as an advisor" — Wants strategic input, not just code

### Things That Frustrate the User
- Repeating the same mistake after being corrected
- Claiming changes were made when they weren't deployed
- Over-engineering simple requests
- Adding emojis or unnecessary formatting

---

## Quick Reference: File Locations by Task

| Task | Primary File |
|------|--------------|
| Fix a Slack query response | `src/slack/events.js` |
| Update weekly snapshot PDF | `src/slack/blWeeklySummary.js` |
| Modify account dashboard | `src/slack/accountDashboard.js` |
| Change field mappings | `data/schema-*.json` |
| Update business rules | `data/business-logic.json` |
| Fix intent parsing | `src/ai/intentParser.js` |
| Debug SF connection | `src/salesforce/connection.js` |
| Update sales process doc | `docs/sales-process.html` |

---

## Fiscal Calendar Reference

- **Fiscal Year:** February 1 - January 31
- **Q4 FY25:** November 1, 2025 - January 31, 2026
- **Current Month (January 2026):** Last month of Q4

---

## Final Notes

This project is actively used by the sales team. Changes to queries, reports, or field mappings directly impact how leadership views pipeline and revenue data. Always:

1. Test queries before deploying
2. Verify field API names match Salesforce exactly
3. Check for existing patterns in the codebase before creating new ones
4. Deploy cautiously — circuit breaker and auth issues are real risks

When in doubt, ask clarifying questions about business intent, but never about technical basics you should already know.

