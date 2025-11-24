# Smart Email Builder - Implementation Plan

## Vision
Transform static email templates into an intelligent workflow tool that:
- Searches Salesforce accounts with typeahead
- Auto-populates company name throughout email
- Enriches with real-time context (news, acquisitions, funding)
- Minimizes manual research for Business Leads

## Architecture

### 1. Frontend (Email Builder Interface)
**URL:** `/email-builder` endpoint

**UX Flow:**
1. User selects email category (Cold Outreach, Follow-Up, etc.)
2. User selects specific template
3. **Company Search:**
   - Input field with real-time Salesforce search
   - Top 3 matches appear as user types
   - Click to select → auto-fills ALL `[Company]` variables in template
4. **Auto-Enrichment:**
   - System fetches recent news about company
   - Pulls latest SF data (recent opps, meetings, owner)
   - Suggests context for `[recent trigger]` variable
5. **Manual Variables:**
   - User fills remaining variables (name, specific pain points from discovery)
6. **Preview & Copy:**
   - Live preview of email
   - One-click copy to clipboard
   - Optional: Send via Gmail/Outlook integration

### 2. Backend APIs

#### A. Salesforce Company Search
```javascript
// Already have SF connection!
GET /api/search-accounts?query={searchTerm}

Response:
{
  "matches": [
    {
      "name": "Intel",
      "owner": "Julie Stefanich",
      "stage": "Stage 3",
      "recentActivity": "Meeting 2 days ago",
      "lastOpportunity": "Compliance - Stage 3 - $800K"
    },
    // ... top 3 matches
  ]
}
```

#### B. Context Enrichment APIs

**Option 1: News API (Free tier available)**
```javascript
GET /api/enrich-company?company={name}

// Calls Google News API or NewsAPI.org
Response:
{
  "recentNews": [
    "Announced acquisition of XYZ Corp (Nov 2024)",
    "Raised $100M Series C (Oct 2024)",
    "New CLO appointed: John Smith"
  ],
  "triggers": [
    "recent acquisition of XYZ",
    "Series C funding round",
    "CLO transition"
  ]
}
```

**Option 2: Clearbit/ZoomInfo (Paid but comprehensive)**
```javascript
// Company data, tech stack, employee count, recent changes
```

**Option 3: Internal Salesforce Data (Free, already have)**
```javascript
// Latest opportunities created
// Recent meetings
// Account updates
// Customer Brain notes
```

### 3. Data Sources (Ranked by Cost/Value)

| Source | Data Provided | Cost | Effort |
|--------|---------------|------|--------|
| **Salesforce** | Account owner, recent opps, meetings, notes | $0 | 2 hours |
| **Google News API** | Recent news, acquisitions, leadership | $0 (quota limits) | 4 hours |
| **LinkedIn API** | Leadership changes, company updates | Expensive | 8 hours |
| **Clearbit** | Comprehensive company data | $$$  | 3 hours |
| **Crunchbase** | Funding rounds, acquisitions | $$ | 4 hours |

### 4. Recommended Implementation (Phased)

**Phase 1 (MVP - 1 week):**
- Email builder interface at `/email-builder`
- Salesforce company search with typeahead
- Auto-populate [Company] variable throughout template
- Manual entry for other variables
- Copy to clipboard functionality

**Phase 2 (Smart Context - 1 week):**
- Google News API integration
- Suggest `[recent trigger]` based on news
- Pull recent SF activity (meetings, opps)
- Display context suggestions user can select

**Phase 3 (Full Automation - 1 week):**
- Auto-fill [Name] from SF (Owner.Name or latest Contact)
- Pre-populate [comparable] based on industry/size
- Suggest outcomes based on similar customers
- Gmail/Outlook send integration

## Technical Stack

**Frontend:**
- Vanilla JavaScript (matches dashboard approach)
- Real-time search with debouncing
- Clean UI matching dashboard aesthetic

**Backend:**
- Express.js (already have)
- jsforce for SF queries (already integrated)
- axios for external APIs
- Caching for enrichment data (reduce API calls)

**APIs Needed:**
1. ✅ Salesforce (already have)
2. Google News API (free tier)
3. Optional: Clearbit, Crunchbase, LinkedIn

## Salesforce Integration Code (Already Have!)

```javascript
// In src/salesforce/queries.js
async function searchAccounts(searchTerm) {
  const query = `
    SELECT Id, Name, Owner.Name, 
           (SELECT StageName, ACV__c FROM Opportunities 
            WHERE IsClosed = false 
            ORDER BY CreatedDate DESC LIMIT 1)
    FROM Account
    WHERE Name LIKE '%${escapeQuotes(searchTerm)}%'
    ORDER BY Name
    LIMIT 10
  `;
  return await query(query, true);
}
```

This already works! We just need to expose it via API endpoint.

## User Experience Mockup

```
╔══════════════════════════════════════════╗
║  Eudia Email Builder                      ║
╠══════════════════════════════════════════╣
║                                          ║
║  Select Category: [Cold Outreach ▼]     ║
║                                          ║
║  Select Template: [CLO: Compliance ▼]    ║
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │ Company: Intel___                  │ ║
║  │  ↓ Intel (Julie Stefanich)         │ ║
║  │  ↓ Intuit (Himanshu Agarwal)       │ ║
║  │  ↓ Integra (David Van Ryk)         │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║  Recent Context (auto-detected):         ║
║  ☑ Announced Q4 expansion into EMEA      ║
║  ☐ New CLO appointed                     ║
║  ☑ Recent compliance challenge (news)    ║
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │ EMAIL PREVIEW                      │ ║
║  │                                    │ ║
║  │ Subject: Compliance at Intel       │ ║
║  │                                    │ ║
║  │ Hi Julie,                          │ ║
║  │                                    │ ║
║  │ Saw Intel is expanding into EMEA.  │ ║
║  │ We help legal teams reduce...      │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║  [Copy to Clipboard]  [Send via Gmail]  ║
╚══════════════════════════════════════════╝
```

## Next Steps

**Option A: Build This (Recommended)**
- I can implement Phase 1 (MVP) in this session
- Salesforce search + auto-populate + clipboard copy
- ~200 lines of code
- Working prototype in 30-60 minutes

**Option B: Spec First**
- Document requirements in detail
- Get your approval on UX/features
- Build in next session

**Which would you prefer?** I'm ready to build the MVP now if you want to see it working.

## Value Proposition

**Current State:** BL spends 10-15 minutes per email researching context, copying template, filling variables

**Future State:** BL spends 2-3 minutes selecting template, searching company, reviewing auto-populated email, sending

**Time Savings:** 70-80% reduction in email prep time
**Quality Improvement:** Enriched context from news/SF data catches triggers BL might miss
**Consistency:** All BLs using same high-quality templates with accurate data

This is exactly the kind of surgical, high-value improvement that fits the GTM-Brain philosophy. Want me to build it?

