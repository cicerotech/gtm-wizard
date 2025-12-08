# GTM-Brain Contract Ingestion System

## Overview

The Contract Ingestion System enables GTM-Brain to analyze PDF contracts uploaded via Slack, extract key fields, and create Salesforce Contract records with attached PDFs. The system is designed with surgical precision to ensure accurate field mapping for Campfire ERP sync.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SLACK MESSAGE WITH PDF                        │
│         (Mention @gtm-brain with contract attachment)            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PDF TEXT EXTRACTION                           │
│              (pdf-parse library)                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               CONTRACT TYPE CLASSIFICATION                       │
│                                                                  │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   │   CAB/LOI    │  │  RECURRING   │  │  AMENDMENT   │         │
│   │ (no monetary)│  │ (full fields)│  │              │         │
│   └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FIELD EXTRACTION ENGINE                         │
│                                                                  │
│  • Account Name          • Start Date           • Products      │
│  • Contract Name         • End Date             • Signers       │
│  • Term (months)         • Total Value*         • Currency      │
│  • Contract Type         • Annual Value*        • Notes         │
│                          • Monthly Value*                        │
│                          (* excluded for CAB/LOI)                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               SALESFORCE DATA ENRICHMENT                         │
│                                                                  │
│  • Match Account Name → Account ID                               │
│  • Match Customer Signer → Contact ID                            │
│  • Match Eudia Signer → User ID (CompanySignedId)                │
│  • Get Account Owner → Default Contract Owner                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              VALIDATION & CONFIRMATION                           │
│                                                                  │
│  • Show extracted fields to user                                 │
│  • Display confidence scores                                     │
│  • Flag missing required fields                                  │
│  • Allow owner override                                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            SALESFORCE CONTRACT CREATION                          │
│                                                                  │
│  1. Create Contract record with mapped fields                    │
│  2. Upload PDF as ContentVersion                                 │
│  3. Link ContentVersion to Contract                              │
│  4. Return Salesforce URL                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Contract Type Classification

### 1. CAB/LOI Contracts (Customer Advisory Board, Letters of Intent)

**Characteristics:**
- Keywords: "Customer Advisory Board", "CAB", "Memorandum", "LOI", "Letter of Intent"
- File names containing "CAB" or "Memorandum"
- Non-binding or advisory nature

**Field Rules:**
- **NO monetary values** (Total Contract Value, Annual Contract Value, Monthly Amount = null)
- Exception: Delinea (per your specification)
- Contract Type = "LOI"
- Notes = "LOI - Committed spend" or "Customer Advisory Board Agreement"

**Examples from your data:**
- `Eudia - CAB Memorandum- Pure Storage.pdf`
- `Eudia_CAB Memorandum- BestBuy 2025-10-06.pdf`

### 2. Recurring Contracts

**Characteristics:**
- Keywords: "Master Services Agreement", "Subscription", "Annual", "Statement of Work"
- Multi-year terms (Year 1, Year 2, Year 3)
- Contains pricing tables with fees

**Field Rules:**
- All monetary fields populated
- Contract Type = "Recurring"
- Calculate Monthly from Annual if not explicit

**Examples from your data:**
- `Coherent A&R AI-Augmented Contracting Support Order`
- `Chevron - Gibson Dunn Agreement`

### 3. Amendments

**Characteristics:**
- Keywords: "Amendment", "Amended and Restated", "Addendum"
- References original agreement

**Field Rules:**
- Update existing values
- Contract Type = "Amendment"

## Salesforce Field Mapping (Campfire ERP Sync)

### Required Fields (Highlighted in your screenshot)

| Salesforce API Name | Label | Extraction Method |
|---------------------|-------|-------------------|
| `Contract_Name_Campfire__c` | Contract Name | First heading containing "Agreement/Order/Memorandum" |
| `AccountId` | Account Name | Customer/Client party extraction + fuzzy match |
| `StartDate` | Contract Start Date | "Effective Date", "Commencement Date" patterns |
| `EndDate` | Contract End Date | "End Date", anniversary calculations |
| `ContractTerm` | Term (months) | Explicit term or calculated from dates |
| `Contract_Type__c` | Contract Type | Classification engine |
| `Status` | Status | Default: "Activated" |
| `OwnerId` | Contract Owner | Account Owner or manual override |

### Monetary Fields (Non-LOI Only)

| Salesforce API Name | Label | Extraction Method |
|---------------------|-------|-------------------|
| `Contract_Value__c` | Total Contract Value | Sum of all years, NTE amounts |
| `Annualized_Revenue__c` | Annual Contract Value | Per-year fee, derived from total/term |
| `Amount__c` | Monthly Amount | Annual/12 or explicit monthly fee |

### Product Fields

| Salesforce API Name | Label | Extraction Method |
|---------------------|-------|-------------------|
| `Parent_Product__c` | Parent Product | Product keywords (Contracting, Insights, sigma, etc.) |
| `Product_Line__c` | Product Line | Semi-colon separated list |

### Signature Fields

| Salesforce API Name | Label | Extraction Method |
|---------------------|-------|-------------------|
| `CustomerSignedId` | Customer Signed By | Contact lookup on matched Account |
| `Contact_Signed__c` | Customer Signed By (Name) | Name extraction from signature block |
| `CustomerSignedDate` | Signed Date | Date near signature |
| `CompanySignedId` | Company Signed By | User lookup (Omar Haroun, David Van Ryk) |

### Other Fields

| Salesforce API Name | Label | Default/Extraction |
|---------------------|-------|-------------------|
| `AI_Enabled__c` | AI Enabled | `true` (always) |
| `Currency__c` | Currency | `USD` (default) |
| `Notes__c` | Notes | LOI indicators, special terms |
| `Industry__c` | Industry | From matched Account |

## Usage

### Step 1: Upload Contract

In Slack, mention @gtm-brain with a PDF attachment:

```
@gtm-brain [attach contract PDF]
```

Or send directly via DM with the PDF attached.

### Step 2: Review Analysis

GTM-Brain will respond with:

```
✅ Contract Analysis Complete

📋 Type: Recurring (92% confidence)

Extracted Fields:
• Account: Coherent Corp
  → Matched: Coherent
• Start Date: 2025-10-31
• End Date: 2028-10-30
• Term: 36 months
• Total Value: $3,450,000
• Annual Value: $1,150,000
• Monthly: $95,833
• Product: AI Augmented - Contracting
• Customer Signer: Rob Beard
• Eudia Signer: Omar Haroun

Overall Confidence: 87%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply with:
• `create contract` - Create with extracted data
• `create contract assign to Julie` - Create and assign to specific BL
• `cancel` - Don't create
```

### Step 3: Confirm Creation

```
create contract
```

Or with owner override:

```
create contract assign to Himanshu
```

### Step 4: Confirmation

```
✅ Contract Created Successfully!

📄 Contract #: 00000165
View in Salesforce: [link]

📎 PDF attached: Coherent A&R Agreement.pdf

Fields populated:
📄 Name: Coherent A&R AI-Augmented Contracting Support Order
📋 Type: Recurring
📅 Start: 2025-10-31
📅 End: 2028-10-30
⏱️ Term: 36 months
💰 TCV: $3,450,000
📊 ACV: $1,150,000
💵 Monthly: $95,833
🏷️ Product: AI Augmented - Contracting
```

## Business Lead Owner Mapping

| Owner Name | User ID |
|------------|---------|
| Julie Stefanich | 005Wj00000KDcFqIAL |
| Himanshu Agarwal | 005Wj00000M2FnHIAV |
| Asad Hussain | 005Wj00000L8YuNIAV |
| Olivia Jung | 005Wj00000UVn0XIAT |
| Justin Hills | 005Wj00000UVn1ZIAT |
| Ananth Cherukupally | 005Wj00000KDcFrIAL |
| David Van Ryk | 005Wj00000L8YuOIAV |
| Keigan Pesenti | 005Wj00000KDcFsIAL |

## Learning & Improvement

The system stores successful extractions and will improve pattern recognition over time:

1. **Keyword Patterns**: New keywords discovered in contracts are added to extraction patterns
2. **Date Formats**: Different date format variations are learned
3. **Company Name Variations**: Fuzzy matching improves with each successful account match
4. **Product Keywords**: New product terminology is captured

## Validation Rules

Before creating a contract, the system validates:

1. **Required Fields**: All ERP sync fields must be present
2. **Date Logic**: End date must be after start date
3. **Term Consistency**: Term must match date range
4. **Account Match**: Account must exist in Salesforce
5. **Owner Assignment**: Must be a valid active User

If validation fails, the system prompts for manual input of missing fields.

## Error Handling

| Error | Resolution |
|-------|------------|
| PDF parsing fails | Falls back to raw text extraction |
| Account not found | Prompt user to create account first |
| Required field missing | Show specific field prompt |
| Salesforce creation fails | Display error and suggest retry |

## Security

- Only authorized users can create contracts (Keigan's access pattern)
- PDF files are downloaded with bot token authentication
- Stored analysis expires after 10 minutes
- All operations logged for audit

## Files

- `src/services/contractAnalyzer.js` - PDF parsing and field extraction
- `src/services/contractCreation.js` - Salesforce record creation
- `src/slack/events.js` - File attachment handling integration

## Dependencies

- `pdf-parse` - PDF text extraction
- `jsforce` - Salesforce API
- `@slack/bolt` - Slack integration

