# Strategic Fix Plan - Account Creation & Enrichment

**Date:** November 20, 2025  
**Priority:** CRITICAL  
**Approach:** Methodical, test each fix before moving to next

---

## Current Issues (In Priority Order)

### 1. CRITICAL: Account Name Still Lowercase
- Input: "IKEA" or "levi strauss"
- Created: "ikea" or "levi strauss" (all lowercase)
- Expected: "IKEA" or "Levi Strauss" (proper casing)
- Root cause: Unknown - need to trace where lowercase conversion happens

### 2. CRITICAL: Clay Enrichment "Unavailable"
- Mock enrichment returns data (tested locally)
- But Salesforce account has no Website, LinkedIn, State, Region, Rev_MN
- Message says "Clay enrichment unavailable"
- Need to verify: Is enrichment.success = false? Are fields actually in accountData?

### 3. CRITICAL: Workload Assessment Wrong
- Says "Himanshu Agarwal has 0 active opps"
- This is factually wrong - he has many active opportunities
- Query may be broken or returning wrong data
- Need to test workload query directly

### 4. Customer Brain Intent Routing (FIXED but verify)
- Was routing to existence check instead of save note
- Should be fixed now (moved to top priority)
- Test to confirm

---

## Strategic Fix Plan (Execute in Order)

### Phase 1: Diagnostic Testing (30 minutes)

**1.1 Test Workload Query Directly**
- Run Salesforce query for Himanshu's active opps
- Verify query syntax
- Check if records return
- Fix query if broken

**1.2 Test Enrichment Data Flow**
- Add console.log at every step of enrichment
- Verify mock data returns
- Verify accountData contains fields
- Verify Salesforce receives fields

**1.3 Test Account Name Preservation**
- Trace where companyName variable goes
- Check if Salesforce API lowercases
- Check if jsforce modifies Name field
- Find exact point of lowercase conversion

**1.4 Test Customer Brain Intent**
- Send Pegasystems message
- Check Render logs for intent detected
- Verify routes to save_customer_note
- Verify extracts "Pegasystems"

---

### Phase 2: Fix Workload Assessment (HIGH PRIORITY)

**Issue:** Query returning 0 when Himanshu has active opportunities

**Hypothesis:** Query syntax wrong or field names incorrect

**Fix Steps:**
1. Review actual Opportunity fields in Salesforce
2. Test query in Salesforce directly
3. Update query to match actual field structure
4. Verify returns correct counts

**Test:**
- Create test account
- Should assign based on REAL workload
- Verify correct BL selection

---

### Phase 3: Fix Enrichment Population (HIGH PRIORITY)

**Issue:** Fields not populating despite mock enrichment returning data

**Hypothesis:** accountData has fields but Salesforce not receiving them

**Fix Steps:**
1. Add logging: console.log(accountData) before Salesforce create
2. Verify accountData contains all 5 fields
3. Check jsforce create call succeeds
4. Check Salesforce API response
5. If accountData correct but SF empty → check field permissions
6. If accountData missing fields → fix assignment logic

**Test:**
- Create IKEA
- Check Render logs for accountData JSON
- Verify contains: Website, Linked_in_URL__c, State__c, Region__c, Rev_MN__c
- Check Salesforce account

---

### Phase 4: Fix Account Name Casing (HIGH PRIORITY)

**Issue:** Account created as lowercase despite using original companyName

**Hypothesis:** Salesforce or jsforce lowercasing the Name field

**Fix Steps:**
1. Log companyName before create: logger.info('Original name:', companyName)
2. Log accountData.Name before create
3. Check jsforce documentation for Name field handling
4. Check if Salesforce has auto-lowercase setting
5. If needed, explicitly set Name in EXACT case

**Potential solutions:**
- Force case preservation in jsforce options
- Use different field assignment method
- Check Salesforce field settings

**Test:**
- Create "IKEA" → Should be "IKEA"
- Create "Levi Strauss" → Should be "Levi Strauss"
- Verify exact case preservation

---

### Phase 5: Real Clay API Integration (FUTURE)

**Current:** Mock data for IKEA/GTM Test only  
**Goal:** Real Clay API for all Fortune 2000 companies

**Required:**
1. Clay API documentation or working example
2. Test API call with real company
3. Map Clay response to 5 Salesforce fields
4. Handle errors gracefully
5. Cache enrichment data (optional)

**Not blocking current testing** - mock data sufficient for now

---

## Execution Order

**NOW (Next 2 hours):**
1. ✅ Fix duplicate Customer Brain intent (DONE)
2. ⏳ Fix workload assessment query
3. ⏳ Fix enrichment field population
4. ⏳ Fix account name casing

**THEN:**
5. Test full workflow end-to-end
6. Verify all issues resolved
7. Document final state

**LATER:**
8. Real Clay API integration (need API docs/examples)

---

## Testing Approach

**For each fix:**
1. Make ONE change
2. Deploy
3. Test in Slack
4. Check Render logs
5. Verify in Salesforce
6. Move to next fix ONLY if current fix works

**No more multiple fixes at once** - methodical approach only

---

## Next Immediate Actions

1. I'll fix workload assessment query
2. I'll add comprehensive enrichment logging
3. I'll trace account name casing issue
4. Deploy and test ONE at a time

Ready to execute?

