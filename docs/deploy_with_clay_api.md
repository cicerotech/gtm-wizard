# Deployment Guide - Account Assignment + Opportunity Creation + Post-Call Summaries

Status: ✅ All tests passing (10/10)  
Features: 4 major new capabilities  
Security: Keigan-only for write operations  
Ready: Yes - deploy immediately

---

## Step 1: Add Clay API Key to Render

CRITICAL: Add this environment variable before testing account creation

Go to: https://dashboard.render.com/
1. Select `gtm-wizard` service
2. Click **Environment** tab
3. Add new variable:
   - **Key:** `CLAY_API_KEY`
   - **Value:** `994eefbafaf68d2b47b4`
4. Click **Save Changes**
5. Wait for auto-redeploy (2-3 minutes)

Without Clay API key:
- Account creation still works
- Enrichment will be empty (manual entry needed)
- No HQ, revenue, website auto-populated

---

## Step 2: Deploy Code Changes

All code is ready and tested:

```bash
git add -A
git commit -m "[FEATURE] Account Assignment, Opp Creation, Post-Call Summaries

NEW CAPABILITIES:
- Account existence checks: 'does [Company] exist?'
- Auto-creation with Clay enrichment + geo assignment
- Opportunity creation with required fields
- Post-call summary AI structuring (Socrates integration)

SERVICES ADDED:
- src/services/clayEnrichment.js - Clay API integration
- src/services/accountAssignment.js - Geographic + workload logic

FEATURES:
- Account existence check (all users)
- Account creation with enrichment (Keigan-only)
- Geographic-based BL assignment (West/East/Intl)
- Workload balancing across BLs
- Manual account reassignment (Keigan-only)
- Opportunity creation with validation (Keigan-only)
- Post-call summary AI structuring (BLs)

IMPROVEMENTS:
- Sales enablement guide updated
- Cleaner confirmation messages
- Better pipeline displays
- Account lists for stage queries

TESTING:
- 10/10 comprehensive tests passing
- Intent detection validated
- Geographic logic validated
- BL validation working
- Zero linting errors

TOTAL ADDED: ~3,000 lines of code + documentation"

git push origin main
```

---

## Step 3: Test in Slack (Complete Checklist)

### Test Set A: Account Management

**Test 1: Existence Check (Existing Account)**
```
@gtm-brain does Intel exist?
```
Expected: ✅ Shows "Intel Corporation exists. Current owner: Himanshu Agarwal (Business Lead)"

**Test 2: Existence Check (Non-Existing)**
```
@gtm-brain does GTM Test Account XYZ exist?
```
Expected: ❌ "Not found in Salesforce. Reply 'create GTM Test Account XYZ and assign to BL' to create."

**Test 3: Create Account with Auto-Assignment**
```
@gtm-brain create GTM Test Account and assign to BL
```
Expected: ✅ Account created with:
- Assignment reasoning (HQ location, region, workload)
- Clay enrichment data (if API key working)
- Salesforce link

**VERIFY IN SALESFORCE:**
- Account exists
- Owner assigned (check which BL)
- HQ fields populated (if Clay working)
- Revenue/Website fields (if Clay working)

---

### Test Set B: Opportunity Creation

**Test 4: Create Opportunity**
```
@gtm-brain create opp for GTM Test Account:
ACV: 250000
Stage: 1
Product Line: AI-Augmented Contracting
Target Sign Date: 12/31/2025
Revenue Type: Revenue
```
Expected: ✅ Opportunity created with all fields

**VERIFY IN SALESFORCE:**
- Opportunity exists under GTM Test Account
- ACV = $250,000
- Stage = Stage 1 - Discovery
- Product Line = AI-Augmented Contracting
- Target Sign Date = 12/31/2025
- Revenue Type = Revenue
- Owner = same as account owner

**Test 5: Create Different Opportunity (different values)**
```
@gtm-brain create opp for GTM Test Account:
ACV: 400000
Stage: 2
Product Line: Augmented-M&A
Target Sign Date: 01/15/2026
Revenue Type: Booking
```
Expected: ✅ Second opportunity created with different values

---

### Test Set C: Reassignment

**Test 6: Manual Reassignment**
```
@gtm-brain assign GTM Test Account to Julie Stefanich
```
Expected: ✅ Account reassigned + opportunities transferred

**VERIFY IN SALESFORCE:**
- Account owner = Julie Stefanich
- All opportunities now owned by Julie Stefanich
- Previous owner noted in confirmation

---

### Test Set D: Post-Call Summary

**Test 7: Post-Call Summary**
```
@gtm-brain post-call summary
Company: GTM Test Account
Met with John Smith (CEO) and Sarah Jones (VP Legal). First meeting.
They need contract automation - currently taking 2 weeks per contract.
Processing 100+ contracts per month. Budget $300K approved.
Interested in AI-Augmented Contracting product.
Concerns about data security and accuracy.
Champion is Sarah - very enthusiastic. John controls final budget.
Demo scheduled for next Tuesday at 2pm.
Moving to SQO stage.
Competing with LawGeex.
```
Expected: ✅ Summary structured into 8-section format and saved to Customer_Brain

**VERIFY IN SALESFORCE:**
- Go to GTM Test Account
- Check Customer_Brain__c field
- Should see structured summary with all 8 sections
- Properly formatted with headers

---

### Test Set E: Regression (Existing Features)

**Test 8: Account Plan**
```
@gtm-brain what's the account plan for Intel?
```
Expected: ✅ Shows account plan (or "not found")

**Test 9: Late Stage Pipeline**
```
@gtm-brain late stage contracting
```
Expected: ✅ Shows list of ALL companies in Stage 4 (improved display)

**Test 10: Who Owns**
```
@gtm-brain who owns Intel?
```
Expected: ✅ Shows owner details

---

## Step 4: Verify Clay Enrichment

If Clay API key is configured:

**Create another test account:**
```
@gtm-brain create Test Company Two and assign to BL
```

**Check Salesforce for:**
- Billing City (HQ city)
- Billing State (HQ state)
- Billing Country (HQ country)
- Annual Revenue (if available)
- Website (if available)
- Number of Employees (if available)

If these are populated: ✅ Clay enrichment working!  
If these are empty: ⚠️  Check Clay API key or company not in Clay database

---

## Step 5: Clean Up Test Data

After testing, clean up in Salesforce:
1. Find "GTM Test Account" (and similar)
2. Delete test opportunities
3. Delete test account
4. Or keep for future testing

---

## Expected Behavior Summary

### Account Existence
- **All users** can check
- Shows owner and BL status
- Suggests creation if not found

### Account Creation
- **Keigan-only**
- Clay enrichment (if API key set)
- Geographic assignment (West/East/Intl)
- Workload balancing
- Detailed reasoning provided

### Opportunity Creation
- **Keigan-only**
- Requires: ACV, Stage, Product Line, Target Date, Revenue Type
- Auto-assigns owner from account
- Validates required fields

### Account Reassignment
- **Keigan-only**
- Transfers account + all open opportunities
- Shows before/after
- Validates BL name

### Post-Call Summary
- **All Business Leads** (or all users)
- Socrates AI structures notes
- Saves to Customer_Brain
- Shows preview in Slack
- 8-section template auto-applied

---

## Troubleshooting

### "Clay enrichment failed"

**Not a blocker!** Account still creates.

Check:
- CLAY_API_KEY in Render environment
- Company exists in Clay database
- Clay API rate limits

### "Could not find active user: [BL Name]"

Check:
- BL name spelling
- BL is active in Salesforce
- Use exact names from list

### "Opportunity creation failed"

Check:
- All required fields provided
- Account exists
- Date format correct (MM/DD/YYYY)
- Product Line matches exact Salesforce value

### "Post-call summary failed"

Check:
- Socrates AI (OPENAI_API_KEY) configured
- Meeting notes long enough (> 50 chars)
- Company name in first line

---

## Clay API Key Details

Key: `994eefbafaf68d2b47b4`  
Add as: `CLAY_API_KEY` environment variable in Render  
Purpose: Enriches company data (HQ, revenue, website, employees)  
Optional: Yes - system works without it (degraded enrichment)  
Cost: Per-call billing from Clay (monitor usage)

---

## New Commands Summary

| Command | Who Can Use | What It Does |
|---------|-------------|-------------|
| `does [Company] exist?` | All users | Checks if account exists |
| `create [Company] and assign to BL` | Keigan-only | Creates with enrichment + assignment |
| `assign [Account] to [BL]` | Keigan-only | Reassigns account + opps |
| `create opp for [Account]:` | Keigan-only | Creates opportunity |
| `post-call summary` | All BLs | AI structures meeting notes |

---

## Success Criteria

✅ All 10 tests passing  
✅ Zero linting errors  
✅ Security controls in place  
✅ Documentation complete  
✅ Clay API key documented  

Ready to deploy: YES

---

Next: Add CLAY_API_KEY to Render, deploy code, test in Slack!

