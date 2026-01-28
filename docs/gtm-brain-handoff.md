# GTM Brain - Complete Technical Handoff Document

## Project Overview

**GTM Brain** is Eudia's internal go-to-market intelligence platform that:
- Aggregates meeting prep data from Outlook calendars, Salesforce, and Obsidian notes
- Enriches attendee profiles via Clay integration
- Provides AI-powered meeting context summaries via Claude
- Automates Salesforce data entry (Contacts, Events, Customer Brain notes)
- Tracks BL performance metrics and sales velocity
- Generates weekly reports (Finance, Delivery, Pipeline Snapshot)
- Serves a unified web dashboard for Business Leads (BLs)

**Primary Users:** 15-25 Business Leads (sales reps) across US and EU pods

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  Microsoft Graph API     │  Salesforce API      │  Obsidian Vaults           │
│  (Outlook Calendars)     │  (Accounts, Contacts,│  (Meeting Notes via        │
│                          │   Opps, Deliveries)  │   Wispr dictation)         │
└────────────┬─────────────┴──────────┬───────────┴──────────────┬─────────────┘
             │                        │                          │
             ▼                        ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       GTM BRAIN BACKEND (Node.js/Express)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Calendar Sync │ Clay Enrichment │ SF Contact Sync │ Obsidian Sync │ Reports│
│  (6-hourly)    │ (HTTP Webhook)  │ (Auto-create)   │ (BL Notes)    │ (Slack)│
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  SQLite Database │ Salesforce Custom Objects │ Slack Channels               │
│  (Render Disk)   │ (BL_Performance_Metrics,  │ (Weekly Reports, Alerts)     │
│                  │  Stage_Snapshot, etc.)    │                              │
└──────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DOWNSTREAM SYSTEMS                                                          │
│  Campfire (Finance) ← Contract auto-creation Flow on Closed Won             │
│  Rocket Lane (Delivery) ← Delivery auto-creation Flow on Proposal stage     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Recent Enhancements (January 2026)

### ✅ Salesforce Flows - Opportunity Automation

| Flow | Trigger | Purpose |
|------|---------|---------|
| `Opportunity_MEDDICC_Template` | Create | Auto-populates MEDDICC Qualification field with template |
| `Next_Steps_History_On_Create` | Create | Copies initial Next Steps to Customer History |
| `Next_Steps_History_On_Update` | Update (Next Steps changed) | Prepends OLD Next Steps value to Customer History |
| `Opportunity_Stage_Snapshot` | Update (Stage changed) | Creates Stage_Snapshot__c record with ACV, BL Forecast, Target Sign Date |
| `Create_Delivery_on_Proposal` | Stage → Proposal | Creates Delivery__c record |
| `Create_Contract_on_Close` | Stage → Closed Won | Creates Contract record with dynamic naming |
| `Sync_Products_to_ACV` | OpportunityLineItem Create/Update | Syncs Product totals to ACV__c when ACV is null |
| `Sync_Products_to_ACV_On_Delete` | OpportunityLineItem Delete | Recalculates ACV when Products removed |

### ✅ Custom Objects Created

**BL_Performance_Metrics__c** - Tracks sales rep performance:
- `Business_Lead__c` (Lookup to User)
- `Pod__c`, `Start_Date__c`, `Ramp_Milestone__c`
- `Total_Closed_Won_ACV__c`, `Fiscal_YTD_ACV__c`, `Fiscal_QTD_ACV__c`
- `Avg_Monthly_Productivity__c`, `Days_to_Ramp__c`, `Is_Ramped__c`
- Weekly refresh via scheduled Apex: `BLMetricsScheduler`

**Stage_Snapshot__c** - Tracks stage changes with key metrics:
- `Opportunity__c` (Master-Detail)
- `Stage__c`, `ACV__c`, `BL_Forecast_Category__c`, `Target_Sign_Date__c`
- `Modified_By__c`, `Snapshot_Date__c`

### ✅ MEDDICC Qualification Template

New field on Opportunity: `MEDDICC_Qualification__c` (Long Text Area)
- Auto-populated on new Opportunity creation
- Clean template format with section headers and pre-created bullets:
```
[M] METRICS (quantifiable impact/ROI)
- 
- 

[E] ECONOMIC BUYER (budget holder)
- 

[D] DECISION CRITERIA (key requirements)
...
```

### ✅ Next Steps → Customer History Flow

**Behavior:**
- Rep enters/updates `Next_Steps__c` field freely
- Flow ONLY READS from Next Steps, NEVER modifies it
- Flow ONLY WRITES to `Next_Step_Eudia__c` (Customer History)
- Creates running history with date stamps:
```
2026-01-27: Previous next steps text
---

2026-01-26: Earlier next steps text
---
```

### ✅ Slack Reports

| Report | Trigger | Output |
|--------|---------|--------|
| `sendDeliveryReport` | Weekly/On-demand | Excel of deliveries, sent to Slack |
| `sendFinanceAuditReport` | Weekly/On-demand | ACV/BL Forecast/Weighted totals for finance |
| `sendWeeklySnapshot` | Weekly | PDF + Slack message with pipeline summary |

**Key Fixes Applied:**
- Excludes data tied to 'Keigan Pesenti' (test data)
- Uses `Target_LOI_Date__c` filtered correctly for fiscal quarters
- "Target LOI" renamed to "Target Sign Date" in all user-facing text

### ✅ Obsidian Integration

**Setup Page:** `/setup/obsidian` - Interactive HTML guide for BL onboarding
**Demo Page:** `/demo` - VP Sales demo walkthrough

**Sync Flow:**
1. BL creates note in local Obsidian vault with frontmatter (account, date, attendees)
2. `Sync-Notes.command` script pushes to GTM Brain
3. Claude summarizes and matches to Salesforce Account
4. Stored in `obsidian_notes` table
5. Optional: Creates Salesforce Event and updates Customer_Brain__c

### ✅ Closed Won Alerts

Platform Event: `Closed_Won_Alert__e`
- Triggers on Opportunity stage change to Closed Won
- Posts to Slack channel `C097L4HK3PY` (GTM Account Planning)
- **CAUTION:** Bulk Data Loader updates can trigger hundreds of alerts
- Toggle: `CLOSED_WON_ALERTS_ENABLED` environment variable

---

## Pending Implementation: Eudia Council Security

**Purpose:** Anonymize sensitive account names for restricted users while maintaining full access for leadership.

### Field Architecture (TO BE DEPLOYED)

**Account Object:**
- `Eudia_Council_Account__c` (Checkbox) - Marks account as Council
- `Code_Name__c` (Text) - Anonymous display name (e.g., "Project Alpha")
- `Account_Display_Name__c` (Formula) - Shows Code_Name if Council, else real Name

**Opportunity Object:**
- `Eudia_Council_Op__c` (Checkbox) - Inherited from Account
- `Code_Name__c` (Text) - Inherits from Account.Code_Name__c
- `Opportunity_Display_Name__c` (Formula) - Shows Code_Name if Council

### Automation Flows (TO BE DEPLOYED)

1. **Council_Code_Name_Sync** - Syncs Account.Code_Name__c to Opportunity.Code_Name__c
2. **Council_Leadership_Auto_Share** - Creates sharing records for leadership group

### Profile/Sharing Strategy (Option B - Page Layout Approach)

- Use page layouts to hide `Name` field on Council accounts for restricted profiles
- Create "Eudia Council Leadership" public group
- Manual sharing rule: Council accounts shared with Leadership group (Read/Write)
- Sales reps who own the account still have access

### Implementation Status

| Item | Status |
|------|--------|
| Public Group: Eudia_Council_Leadership | ✅ Configured (9 members) |
| Account fields (Council checkbox, Code_Name, Display_Name) | ✅ Created |
| Opportunity fields (Council checkbox, Code_Name, Display_Name) | ✅ Created |
| Sharing Rule: Council_Leadership_Full_Access | ⏳ Manual step in Salesforce Setup |
| Council_Code_Name_Sync Flow | ✅ Created |
| Profile cloning strategy | ✅ Documented |
| Page layout configuration | ⏳ After profile cloning |
| Stage 5 Reactivation | ⏳ Manual step needed |
| Code name population script (18 accounts) | ✅ Ready (DO NOT RUN until validation) |

**Full Implementation Guide:** `salesforce/scripts/COUNCIL_SECURITY_IMPLEMENTATION.md`

---

## Pending Implementation: Opportunity Products

**Purpose:** Enable multi-product deal capture with proper ACV attribution and automated Delivery record creation.

### Architecture: Hybrid ACV Integration

```
Opportunity
  ├── ACV__c (Currency) ← MASTER VALUE, user-editable
  │     └── Default populated from SUM(OpportunityLineItems.TotalPrice)
  │         BUT user can override anytime
  └── OpportunityLineItems (Products related list)
        └── Multiple products per opportunity
```

**Key Behavior:**
- If `ACV__c IS NULL` and Products exist → `ACV__c = Amount`
- If user enters `ACV__c` manually → User value preserved, never overwritten
- Products use $120,000 default ACV (user can override per line item)

### Products Available (11 total)

All products match existing `Product_Line__c` picklist values:

| Family | Products |
|--------|----------|
| Contracting | AI-Augmented Contracting - In-House Technology, Managed Services, Secondee |
| M&A | AI-Augmented M&A - In-House Technology, Managed Service |
| Compliance | AI-Augmented Compliance - In-House Technology |
| Platform | Sigma, Custom Agents |
| Litigation | Litigation |
| Other | Other - Managed Service, Other - Secondee |

### Implementation Status

| Item | Status |
|------|--------|
| Products script (`createProductsAndPriceBook.apex`) | ✅ Ready |
| Sync Products to ACV Flow | ✅ Created |
| Sync Products to ACV On Delete Flow | ✅ Created |
| Create Opp Assist v2 update (documentation) | ✅ Documented |
| Delivery trigger update (template) | ✅ Template ready |
| Sandbox testing | ⏳ Ready to run |
| Production deployment | ⏳ After sandbox validation |

**Full Implementation Guide:** `salesforce/scripts/OPPORTUNITY_PRODUCTS_IMPLEMENTATION.md`
**Interactive Testing Guide:** `docs/OPPORTUNITY_PRODUCTS_TESTING.html`

---

## Key Files Reference

### Salesforce Flows
```
salesforce/force-app/main/default/flows/
├── Opportunity_MEDDICC_Template.flow-meta.xml
├── Next_Steps_History_On_Create.flow-meta.xml
├── Next_Steps_History_On_Update.flow-meta.xml
├── Opportunity_Stage_Snapshot.flow-meta.xml
├── Council_Code_Name_Sync.flow-meta.xml
├── Create_Delivery_Record_on_Proposal.flow-meta.xml
└── Create_Contract_on_Close.flow-meta.xml
```

### Apex Classes
```
salesforce/force-app/main/default/classes/
├── BLMetricsCalculationService.cls  - Calculates BL performance metrics
├── BLMetricsScheduler.cls           - Weekly scheduled job
└── BLMetricsCalculationServiceTest.cls
```

### Apex Scripts (one-time execution)
```
salesforce/scripts/apex/
├── backfillMEDDICC.apex             - Backfill MEDDICC template
├── updateMEDDICCFormat.apex         - Update to cleaner format
├── initialSetup.apex                - Create BL_Performance_Metrics records
└── updateCouncilCodeNames.apex      - Populate code names (pending)
```

### Node.js Services
```
src/services/
├── calendarService.js      - Outlook calendar sync
├── clayEnrichment.js       - Clay data enrichment
├── salesforceContactSync.js - Contact/Event creation
├── obsidianSyncService.js  - Obsidian note processing
├── meetingClassifier.js    - AI meeting type classification
├── velocityTracker.js      - Sales velocity tracking
└── intelligenceStore.js    - SQLite database operations
```

### Slack Integration
```
src/slack/
├── events.js               - Slack event handlers
├── blWeeklySummary.js      - Weekly snapshot report
├── financeWeeklyAudit.js   - Finance report
├── deliveryReportToSlack.js - Delivery report
└── fullPipelineReport.js   - Pipeline Excel export
```

---

## Environment Variables

```bash
# Salesforce
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=service.account@eudia.com
SF_PASSWORD=*****
SF_SECURITY_TOKEN=*****

# Microsoft Graph (Calendar Access)
AZURE_TENANT_ID=*****
AZURE_CLIENT_ID=*****
AZURE_CLIENT_SECRET=*****

# Clay
CLAY_WEBHOOK_URL=https://api.clay.com/v3/webhooks/*****
CLAY_API_KEY=*****

# Anthropic (Claude)
ANTHROPIC_API_KEY=*****

# Slack
SLACK_BOT_TOKEN=xoxb-*****
SLACK_SIGNING_SECRET=*****

# Database
INTEL_DB_PATH=/data/intelligence.db

# Feature Flags
USE_FULL_BL_LIST=false
CLOSED_WON_ALERTS_ENABLED=true
```

---

## Deployment

**Platform:** Render (Web Service)
**URL:** https://gtm-wizard.onrender.com
**Database:** SQLite on Render Disk (`/data/intelligence.db`)
**Auto-deploy:** On push to `main` branch

**Salesforce Deployment:**
```bash
cd salesforce
sf project deploy start --source-dir force-app --target-org eudia-prod
```

---

## Known Issues & Cautions

1. **Closed Won Alerts:** Bulk Data Loader updates trigger platform events. Disable alerts before bulk operations.

2. **Next Steps History Flow:** Two separate flows handle Create vs Update. The flow ONLY reads from Next_Steps__c and writes to Next_Step_Eudia__c.

3. **MEDDICC Template:** Backfilled for 266 active stage opportunities. New opportunities auto-populate.

4. **Stage Snapshot:** Only captures when stage actually changes. Historical data not backfilled.

5. **Eudia Council:** Partial implementation - fields and sharing rules deployed, but page layout configuration is manual.

---

## Testing Checklist

| Feature | Test Steps | Expected |
|---------|------------|----------|
| MEDDICC on new Opp | Create new opportunity | Template auto-populates |
| Next Steps → History | Update Next Steps, save | Old value appears in Customer History with date |
| Stage Snapshot | Change opportunity stage | New Stage_Snapshot__c record created |
| Closed Won Alert | Move opp to Closed Won | Slack message in GTM Account Planning |
| Weekly Snapshot | `/api/slack/send-weekly-snapshot` | PDF + Slack message |

---

*Last Updated: January 27, 2026*
*Contact: keigan@eudia.com*

