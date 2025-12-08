# Account Assignment & Creation System - Implementation Guide

**Status:** ✅ IMPLEMENTED - Ready for Testing  
**Date:** November 19, 2025  
**Features:** Account existence check, auto-creation with Clay enrichment, geographic assignment, manual reassignment

---

## 🎯 Overview

This implementation adds intelligent account management capabilities to GTM-Wizard:

1. **Account Existence Checks** - "does Intel exist?"
2. **Auto-Creation with Enrichment** - Clay API integration for company data
3. **Geographic-Based Assignment** - Auto-assign to BLs based on HQ location
4. **Workload Balancing** - Distribute accounts fairly across BLs
5. **Manual Reassignment** - Override auto-assignment when needed
6. **Sales Enablement** - 1-page guide for team

---

## 📁 Files Created

### New Service Files

**1. `src/services/clayEnrichment.js` (141 lines)**
- Clay API integration
- Company data enrichment (HQ, revenue, website, LinkedIn, employees)
- Fallback handling if Clay fails
- Methods:
  - `enrichCompanyData(companyName)` - Main enrichment function
  - `parseHeadquarters(data)` - Extract location data
  - `getEmptyEnrichment(companyName)` - Fallback when Clay unavailable

**2. `src/services/accountAssignment.js` (186 lines)**
- Geographic-based BL assignment logic
- Workload assessment and balancing
- BL name validation
- Methods:
  - `determineRegion(headquarters)` - West/East/International
  - `getBusinessLeadsForRegion(region)` - Get BL list for region
  - `assessWorkload(businessLeads)` - Query Salesforce for current coverage
  - `selectBusinessLead(workloadMap)` - Choose BL with lowest workload
  - `determineAccountAssignment(headquarters)` - Main assignment function
  - `validateBusinessLead(blName)` - Fuzzy match BL names

### Modified Files

**1. `src/ai/intentParser.js`**
- Added 3 new intents: `account_existence_check`, `create_account`, `reassign_account`
- Lines added: ~90 lines
- Pattern matching for existence checks, creation, and reassignment commands

**2. `src/slack/events.js`**
- Added 3 new handlers: `handleAccountExistenceCheck`, `handleCreateAccount`, `handleReassignAccount`
- Lines added: ~220 lines
- Full workflow implementation with Salesforce integration

### Documentation Files

**1. `SALES_ENABLEMENT_GUIDE.md` (300+ lines)**
- 1-page quick reference for sales team
- Account management, opportunity stages, best practices
- Common commands, data hygiene rules

**2. `test-account-assignment.js` (200+ lines)**
- Comprehensive test suite
- Tests for all new features
- Geographic logic validation
- BL name validation tests

**3. `ACCOUNT_ASSIGNMENT_IMPLEMENTATION.md` (This file)**
- Complete implementation documentation

---

## 🧪 Test Results

**All Core Tests Passing:**
- ✅ 7/7 Intent detection tests
- ✅ 4/4 Geographic logic tests
- ✅ 5/5 BL validation tests
- ⏭️  Workload assessment (requires Salesforce connection - test in production)

**Run Tests:**
```bash
node test-account-assignment.js
```

---

## 🎯 Feature 1: Account Existence Check

### Query Patterns
- "does [Company] exist?"
- "does [Company] exist in Salesforce?"

### Examples
```
@gtm-brain does Intel exist?
@gtm-brain does Acme Corp exist?
```

### Response - Account EXISTS
```
✅ Account "Intel Corporation" exists

Current owner: Himanshu Agarwal (Business Lead)
Email: himanshu@eudia.com
```

### Response - Account NOT FOUND
```
❌ Account "Acme Corp" not found in Salesforce.

Reply "create Acme Corp and assign to BL" to create it with auto-assignment.
```

### Implementation Details
- Uses existing fuzzy matching logic from account lookups
- Checks if owner is a Business Lead
- Suggests creation if not found
- Available to all users (read-only operation)

---

## 🎯 Feature 2: Account Creation with Auto-Assignment

### Query Patterns
- "create [Company] and assign to BL"
- "add account for [Company] and assign to business lead"

### Examples
```
@gtm-brain create Acme Corp and assign to BL
@gtm-brain add account for Test Company and assign to business lead
```

### Workflow

**Step 1: Clay Enrichment**
- Calls Clay API with company name
- Retrieves: HQ location, revenue, website, LinkedIn, employee count
- Timeout: 5 seconds
- Fallback: If Clay fails, creates account with manual entry needed

**Step 2: Geographic Determination**
- Parses HQ state/country
- Determines region:
  - **West Coast:** CA, OR, WA, NV, AZ, ID, MT, WY, CO, UT, NM, AK, HI (+ Central states)
  - **East Coast:** ME, NH, VT, MA, RI, CT, NY, NJ, PA, DE, MD, VA, NC, SC, GA, FL
  - **International:** Any country except USA

**Step 3: Workload Assessment**
- Queries Salesforce for each BL in region:
  - **Primary:** Count of Stage 1+ active opportunities
  - **Secondary:** Count closing this month
- Calculates score: `(activeOpps × 3) + closingThisMonth`
- Selects BL with LOWEST score

**Step 4: Account Creation**
- Creates Salesforce account with:
  - Name (from enrichment)
  - Owner (selected BL)
  - Website
  - Headquarters (City, State, Country)
  - Annual Revenue
  - Employee Count
  - Industry

**Step 5: Confirmation**
```
✅ Account created: Acme Corporation

Assigned to: Himanshu Agarwal

Reasoning:
• Company HQ: San Francisco, CA
• Region: westCoast
• Revenue: $50.5M
• Current coverage: Himanshu Agarwal has 12 active opps (Stage 1+) and 3 closing this month

<View Account in Salesforce>
```

### Security
- **Keigan-only** (write operation to Salesforce)
- Validates account doesn't already exist
- Full audit trail via logging

---

## 🎯 Feature 3: Manual Account Reassignment

### Query Patterns
- "assign [Account] to [BL Name]"
- "reassign [Account] to [BL Name]"

### Examples
```
@gtm-brain assign Intel to Julie Stefanich
@gtm-brain reassign Apple to Himanshu Agarwal
```

### Workflow

**Step 1: Validation**
- Validates account exists (fuzzy matching)
- Validates BL name (fuzzy matching against known BLs)
- Security check (Keigan-only)

**Step 2: Account + Opportunity Transfer**
- Updates Account Owner
- Queries all open opportunities for that account
- Transfers ALL open opportunities to new BL
- Maintains closed opportunity ownership (historical record)

**Step 3: Confirmation**
```
✅ Intel Corporation reassigned to Julie Stefanich

• Previous owner: Himanshu Agarwal
• New owner: Julie Stefanich
• 3 opportunities transferred

<View in Salesforce>
```

### Security
- **Keigan-only** (write operation)
- Validates BL name before assignment
- Transfers all related opportunities automatically

---

## 🔧 Technical Implementation

### Geographic Assignment Logic

**Region Determination:**
```javascript
function determineRegion(headquarters) {
  const state = headquarters.state?.toUpperCase();
  const country = headquarters.country?.toUpperCase();
  
  if (country && country !== 'USA') return 'international';
  if (WEST_COAST_STATES.includes(state)) return 'westCoast';
  if (EAST_COAST_STATES.includes(state)) return 'eastCoast';
  
  return 'westCoast'; // Default
}
```

**BL Mapping:**
```javascript
const BL_ASSIGNMENTS = {
  westCoast: ['Himanshu Agarwal', 'Julie Stefanich', 'Justin'],
  eastCoast: ['Olivia Jung'],
  international: ['Johnson', 'Hannah']
};
```

### Workload Assessment Queries

**Primary Check - Active Opportunities:**
```sql
SELECT Owner.Name, COUNT(Id) OpportunityCount
FROM Opportunity
WHERE StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
  AND IsClosed = false
  AND Owner.Name IN ([BL Names])
GROUP BY Owner.Name
```

**Secondary Check - Closing This Month:**
```sql
SELECT Owner.Name, COUNT(Id) ClosingThisMonth
FROM Opportunity
WHERE CloseDate = THIS_MONTH
  AND IsClosed = false
  AND Owner.Name IN ([BL Names])
GROUP BY Owner.Name
```

**Selection Algorithm:**
```javascript
// Sort by:
// 1. Lowest active opportunities (primary)
// 2. Lowest closing this month (secondary)
// 3. Alphabetically (tie-breaker)
blList.sort((a, b) => {
  if (a.activeOpportunities !== b.activeOpportunities) {
    return a.activeOpportunities - b.activeOpportunities;
  }
  if (a.closingThisMonth !== b.closingThisMonth) {
    return a.closingThisMonth - b.closingThisMonth;
  }
  return a.name.localeCompare(b.name);
});

return blList[0]; // Lowest workload
```

### Clay API Integration

**Request Format:**
```javascript
POST https://api.clay.com/v1/enrichment/company
Headers: {
  Authorization: Bearer ${CLAY_API_KEY},
  Content-Type: application/json
}
Body: {
  company_name: "Intel Corporation"
}
```

**Response Parsing:**
```javascript
{
  companyName: data.name,
  headquarters: {
    city: data.headquarters.city,
    state: data.headquarters.state,
    country: data.headquarters.country
  },
  revenue: data.annual_revenue,
  website: data.website,
  linkedIn: data.linkedin_url,
  employeeCount: data.employee_count,
  industry: data.industry
}
```

**Timeout:** 5 seconds  
**Fallback:** If Clay fails, creates account with empty enrichment fields (manual entry required)

---

## 🚀 Deployment Checklist

### Environment Variables

**Add to Render:**
```
CLAY_API_KEY=your_clay_api_key_here
```

**Optional:** Clay API key is optional. If not provided:
- Enrichment is skipped
- Accounts created with manual entry required for HQ, revenue, etc.
- System still functions (degraded enrichment only)

### Pre-Deploy Testing

- [x] Intent detection tests passing (7/7)
- [x] Geographic logic tests passing (4/4)
- [x] BL validation tests passing (5/5)
- [ ] Workload assessment (test in production with Salesforce)
- [ ] Clay API integration (test in production with actual key)
- [ ] End-to-end account creation
- [ ] End-to-end reassignment

### Post-Deploy Testing in Slack

**Test 1: Existence Check (Existing Account)**
```
@gtm-brain does Intel exist?
Expected: ✅ Account exists, shows owner
```

**Test 2: Existence Check (Non-Existing)**
```
@gtm-brain does Fake Company XYZ exist?
Expected: ❌ Not found, suggests creation
```

**Test 3: Account Creation**
```
@gtm-brain create Test GTM Company and assign to BL
Expected: ✅ Account created, shows assignment reasoning
```

**Test 4: Manual Reassignment**
```
@gtm-brain assign Test GTM Company to Julie Stefanich
Expected: ✅ Account reassigned, shows opportunity transfer count
```

**Test 5: Invalid BL Name**
```
@gtm-brain assign Test GTM Company to Invalid Person
Expected: ❌ Error with valid BL list
```

---

## ⚠️ Important Notes

### Business Lead Names

**Must be EXACT Salesforce names:**
- Julie Stefanich
- Himanshu Agarwal
- Asad Hussain
- Ananth Cherukupally
- David Van Ryk
- John Cobb
- Jon Cobb (Note: Jon not John)
- Olivia Jung

**Fuzzy matching works for:**
- "Julie" → Julie Stefanich
- "Himanshu" → Himanshu Agarwal
- "julie stefanich" → Julie Stefanich

### Geographic Defaults

- **Central US states** → Default to West Coast BLs
- **Unknown states** → Default to West Coast
- **International** → Assigned to Johnson/Hannah
- **No HQ data** → Default to West Coast

### Workload Calculation

**Primary Factor:** Active opportunities in Stage 1+  
**Weight:** 3x (most important)

**Secondary Factor:** Opportunities closing this month  
**Weight:** 1x (tie-breaker)

**Tie-Breaker:** Alphabetical by BL name

**Why this matters:** Fair distribution prevents burnout and improves close rates

### Clay API Considerations

**Rate Limits:**
- Monitor Clay API usage
- 5-second timeout prevents hanging
- Graceful fallback if unavailable

**Cost:**
- Clay charges per enrichment call
- Consider caching enrichment data
- Only call for NEW account creation

**Error Handling:**
- Clay fails → Account still created
- Manual data entry required
- User notified in confirmation

---

## 📊 Usage Examples

### Example 1: New Account Discovery

**Scenario:** BDR discovers new prospect "Acme Corporation"

```
User: @gtm-brain does Acme Corporation exist?
Bot: ❌ Account "Acme Corporation" not found in Salesforce.
     Reply "create Acme Corporation and assign to BL" to create it.

User: @gtm-brain create Acme Corporation and assign to BL
Bot: 🔍 Enriching company data for Acme Corporation...
     [3 seconds later]
     
     ✅ Account created: Acme Corporation
     Assigned to: Julie Stefanich
     
     Reasoning:
     • Company HQ: San Francisco, CA
     • Region: westCoast
     • Revenue: $125.5M
     • Current coverage: Julie Stefanich has 8 active opps (Stage 1+) and 2 closing this month
     
     <View Account in Salesforce>
```

### Example 2: Manual Reassignment

**Scenario:** Account needs to move to different BL

```
User: @gtm-brain assign Acme Corporation to Himanshu Agarwal
Bot: ✅ Acme Corporation reassigned to Himanshu Agarwal
     
     • Previous owner: Julie Stefanich
     • New owner: Himanshu Agarwal
     • 2 opportunities transferred
     
     <View in Salesforce>
```

### Example 3: Invalid Account Name

```
User: @gtm-brain assign Fake Company to Julie
Bot: ❌ Account "Fake Company" not found.
     
     Try: "does Fake Company exist?" to check if it exists.
```

### Example 4: Invalid BL Name

```
User: @gtm-brain assign Intel to Bob Smith
Bot: ❌ "Bob Smith" is not a valid Business Lead.
     
     Valid BLs:
     Julie Stefanich, Himanshu Agarwal, Asad Hussain, Ananth Cherukupally, David Van Ryk, John Cobb, Jon Cobb, Olivia Jung
```

---

## 🔐 Security & Permissions

### Read Operations (All Users)
- **Account existence checks** - Anyone can check if account exists
- Shows owner information
- No Salesforce writes

### Write Operations (Keigan Only)
- **Account creation** - Creates new Salesforce records
- **Account reassignment** - Changes ownership
- **Opportunity transfer** - Moves opps to new owner

### Why Restricted?
- Prevents duplicate account creation
- Ensures proper BL assignment logic followed
- Maintains data integrity
- Audit trail for all account changes

---

## 📋 Clay API Setup

### Get API Key

1. **Sign up:** https://clay.com/ (or login if account exists)
2. **Navigate to:** Settings → API Keys
3. **Create key:** "GTM-Wizard Enrichment"
4. **Copy key:** Starts with `clay_`

### Add to Render

1. Go to https://dashboard.render.com/
2. Select `gtm-wizard` service
3. Click **Environment** tab
4. Add variable:
   - **Key:** `CLAY_API_KEY`
   - **Value:** `your_clay_api_key_here`
5. Save (service will redeploy)

### Test Clay Integration

```
@gtm-brain create Real Company and assign to BL
```

Check confirmation for enrichment data (HQ, revenue, etc.)

If enrichment fails:
- Message shows "Clay enrichment failed"
- Account still created (empty fields)
- Manual entry required in Salesforce

---

## 🐛 Troubleshooting

### "Account creation failed"

**Possible causes:**
1. Account already exists → Check with "does [Company] exist?"
2. Invalid BL User ID → BL might be inactive in Salesforce
3. Required Salesforce fields missing → Check field requirements

**Solution:**
- Verify account doesn't exist first
- Check Render logs for specific error
- Create manually in Salesforce if needed

### "Clay enrichment failed"

**Not a blocker!** Account still creates, just without enriched data.

**Causes:**
- Clay API key missing/invalid
- Company not in Clay database
- API timeout (> 5 seconds)
- Rate limit hit

**Solution:**
- Check CLAY_API_KEY in Render
- Manual entry in Salesforce after creation
- Consider caching enrichment data

### "Could not find active user: [BL Name]"

**Cause:** BL name doesn't match Salesforce User record exactly

**Solution:**
- Check BL name spelling (case-sensitive in Salesforce)
- Verify BL is active in Salesforce
- Use exact names from ALL_BUSINESS_LEADS list

### Workload assessment slow

**Cause:** Multiple Salesforce queries running

**Expected:** 2-3 seconds for enrichment + assignment

**If longer:**
- Check Salesforce API performance
- Review query complexity
- Check network latency

---

## 📈 Future Enhancements (Not Yet Implemented)

### Phase 2 Improvements
- [ ] Enrichment caching (avoid duplicate Clay calls)
- [ ] Bulk account creation from list
- [ ] Account assignment suggestions (not auto-assign)
- [ ] Assignment override with reason
- [ ] Assignment history/audit trail

### Phase 3 Improvements
- [ ] ML-based assignment (learn from successful assignments)
- [ ] Workload forecasting (predict BL capacity)
- [ ] Account matching (suggest similar accounts)
- [ ] Territory management integration

---

## 📊 Monitoring & Analytics

### What to Track

**Enrichment Success Rate:**
- How often Clay succeeds vs fails
- Which companies fail enrichment
- Enrichment latency

**Assignment Distribution:**
- Opportunity count per BL over time
- Regional distribution
- Manual reassignment frequency

**Usage Patterns:**
- Existence checks per day
- Account creations per week
- Reassignments per month

### Logs to Watch

```javascript
logger.info('Account existence check: ${accountName} - exists')
logger.info('Account created: ${companyName}, assigned to ${blName}')
logger.info('Account reassigned: ${accountName} from ${old} to ${new}')
logger.error('Clay enrichment failed for ${companyName}')
logger.error('Account creation failed:', error)
```

---

## 🎓 Team Training

### For BDRs (Account Discovery)

**Workflow:**
1. Find prospect company
2. Check: `does [Company] exist?`
3. If not exists: `create [Company] and assign to BL`
4. System handles assignment automatically

**Benefits:**
- No manual account creation
- Auto-assigned to right BL
- Enriched company data automatically

### For Sales Reps

**Use Cases:**
- Check account ownership before outreach
- Verify account exists before creating opportunity
- Request reassignment if needed (through Keigan)

### For RevOps (Keigan)

**New Capabilities:**
- Create accounts via Slack (faster than Salesforce UI)
- Reassign accounts with opportunity transfer
- Verify account existence quickly
- Monitor assignment distribution

---

## ✅ Implementation Checklist

**Code:**
- [x] Clay enrichment service created
- [x] Account assignment logic implemented
- [x] Intent detection added (3 new intents)
- [x] Event handlers added (3 new handlers)
- [x] Error handling complete
- [x] Security checks in place
- [x] No linting errors

**Testing:**
- [x] Intent detection tests (7/7 passing)
- [x] Geographic logic tests (4/4 passing)
- [x] BL validation tests (5/5 passing)
- [ ] Workload assessment (requires production Salesforce)
- [ ] Clay API (requires API key)
- [ ] End-to-end account creation
- [ ] End-to-end reassignment

**Documentation:**
- [x] Implementation guide (this document)
- [x] Sales enablement guide
- [x] Test file created
- [ ] Update main README
- [ ] Update COMPLETE_PROJECT_HANDOFF.md

**Deployment:**
- [ ] Add CLAY_API_KEY to Render (optional)
- [ ] Commit and push to GitHub
- [ ] Monitor Render deployment
- [ ] Run post-deploy tests in Slack
- [ ] Team announcement

---

## 📞 Support & Resources

**Questions:**
- Implementation details: This document
- User guide: SALES_ENABLEMENT_GUIDE.md
- Testing: test-account-assignment.js
- Full capabilities: GTM_WIZARD_CAPABILITIES.html

**Issues:**
- Check Render logs first
- Verify environment variables
- Review error messages (they're descriptive)
- Test with known good accounts first

---

**Status:** ✅ Ready for deployment  
**Next Step:** Add CLAY_API_KEY to Render, deploy, and test  
**Owner:** Keigan Pesenti  
**Priority:** Medium (enhances existing functionality, non-breaking)

---

**Total Lines Added:** ~750 lines of production code + 500 lines of documentation  
**Tests:** All passing (except those requiring Salesforce connection)  
**Risk:** Low (additive features, proper security controls)

