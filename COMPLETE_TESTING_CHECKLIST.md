# Complete Testing Checklist - All New Features

Status: ✅ DEPLOYED  
Git Commit: 6a9c971  
Time: November 19, 2025, 9:40 PM PST  
Tests: 6/6 opportunity creation + 10/10 comprehensive passing  

---

## ⚠️ FIRST: Add Clay API Key to Render

CRITICAL for account creation enrichment:

1. Go to: https://dashboard.render.com/
2. Select: `gtm-wizard` service
3. Click: Environment tab
4. Add variable:
   - Key: `CLAY_API_KEY`
   - Value: `994eefbafaf68d2b47b4`
5. Save (wait 2-3 minutes for redeploy)

---

## Test Suite A: Account Management

### A1: Account Existence - Existing Account

Command:
```
@gtm-brain does Intel exist?
```

Expected response:
```
✅ Account "Intel Corporation" exists

Current owner: Himanshu Agarwal (Business Lead)
Email: himanshu@eudia.com
```

Verify: Shows owner is a Business Lead

---

### A2: Account Existence - Non-Existing Account

Command:
```
@gtm-brain does GTM Test Company exist?
```

Expected response:
```
❌ Account "GTM Test Company" not found in Salesforce.

Reply "create GTM Test Company and assign to BL" to create it with auto-assignment.
```

Verify: Suggests creation command

---

### A3: Account Creation with Clay Enrichment

Command:
```
@gtm-brain create GTM Test Company and assign to BL
```

Expected response (if Clay working):
```
✅ Account created: GTM Test Company

Assigned to: [BL Name - varies based on workload]

Reasoning:
• Company HQ: [City, State from Clay]
• Region: [westCoast/eastCoast/international]
• Revenue: $[Amount from Clay]
• Current coverage: [BL Name] has [X] active opps (Stage 1+) and [Y] closing this month

<View Account in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Account "GTM Test Company" exists
- [ ] Owner is a Business Lead (Julie, Himanshu, or Olivia)
- [ ] Billing City populated (from Clay)
- [ ] Billing State populated (from Clay)
- [ ] Billing Country populated
- [ ] Annual Revenue populated (if Clay found it)
- [ ] Website populated (if Clay found it)

If Clay enrichment fails:
```
⚠️  Clay enrichment failed
Some fields may need manual entry.
```
- [ ] Account still created (just empty fields)

---

## Test Suite B: Opportunity Creation (Smart Modes)

### B1: Simple Mode - All Defaults

Command:
```
@gtm-brain create an opp for GTM Test Company
```

Expected response:
```
✅ Opportunity created for GTM Test Company

Defaults applied:
• ACV: $300,000 (default)
• Stage: Stage 1 - Discovery (default)
• Target Sign: [DATE +150 days] (default: +150 days)
• Product Line: AI-Augmented Contracting (default)
• Revenue Type: Revenue (default)

Owner: [BL Name from account]
Term: 36 months

<View Opportunity in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Opportunity exists: "GTM Test Company - AI-Augmented Contracting"
- [ ] Account: GTM Test Company
- [ ] ACV__c: 300000
- [ ] Amount: 300000 (same as ACV)
- [ ] TCV__c: 300000
- [ ] StageName: Stage 1 - Discovery
- [ ] Product_Line__c: AI-Augmented Contracting
- [ ] Target_LOI_Date__c: ~5 months from today
- [ ] CloseDate: Same as Target_LOI_Date__c
- [ ] Revenue_Type__c: Revenue
- [ ] LeadSource: Inbound
- [ ] Probability: 10 (for Stage 1)
- [ ] Owner: Same as account owner
- [ ] IsClosed: false

---

### B2: Detailed Mode - Partial Custom (Stage + ACV)

Command:
```
@gtm-brain create an opp for GTM Test Company. stage 4 and $500k acv
```

Expected response:
```
✅ Opportunity created for GTM Test Company

Your values:
• ACV: $500,000
• Stage: Stage 4 - Proposal

Defaults applied:
• Target Sign: [DATE +150 days] (default: +150 days)
• Product Line: AI-Augmented Contracting (default)
• Revenue Type: Revenue (default)

Owner: [BL Name]
Term: 36 months

<View Opportunity in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Second opportunity created
- [ ] ACV__c: 500000 (YOUR VALUE)
- [ ] Amount: 500000
- [ ] StageName: Stage 4 - Proposal (YOUR VALUE)
- [ ] Product_Line__c: AI-Augmented Contracting (DEFAULT)
- [ ] Target_LOI_Date__c: ~5 months out (DEFAULT)
- [ ] Revenue_Type__c: Revenue (DEFAULT)
- [ ] Probability: 75 (for Stage 4)

---

### B3: Detailed Mode - All Custom Fields

Command:
```
@gtm-brain create an opp for GTM Test Company. stage 2 and $400k acv and target sign of 12/31/2025
```

Expected response:
```
✅ Opportunity created for GTM Test Company

Your values:
• ACV: $400,000
• Stage: Stage 2 - SQO
• Target Sign: 12/31/2025

Defaults applied:
• Product Line: AI-Augmented Contracting (default)
• Revenue Type: Revenue (default)

Owner: [BL Name]
Term: 36 months

<View Opportunity in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Third opportunity created
- [ ] ACV__c: 400000 (YOUR VALUE)
- [ ] StageName: Stage 2 - SQO (YOUR VALUE)
- [ ] Target_LOI_Date__c: 2025-12-31 (YOUR VALUE)
- [ ] Product_Line__c: AI-Augmented Contracting (DEFAULT)
- [ ] Revenue_Type__c: Revenue (DEFAULT)
- [ ] Probability: 25 (for Stage 2)

---

### B4: Different Product Line

Command:
```
@gtm-brain create an opp for Intel. stage 3 and $600k acv and product line Augmented-M&A and target sign of 01/31/2026 and revenue type Booking
```

Expected: Opportunity with M&A product line, Booking type

VERIFY IN SALESFORCE:
- [ ] Product_Line__c: Augmented-M&A (YOUR VALUE)
- [ ] Revenue_Type__c: Booking (YOUR VALUE)
- [ ] All other custom values applied correctly

---

## Test Suite C: Account Reassignment

### C1: Manual Reassignment

Command:
```
@gtm-brain assign GTM Test Company to Julie Stefanich
```

Expected response:
```
✅ GTM Test Company reassigned to Julie Stefanich

• Previous owner: [Previous BL]
• New owner: Julie Stefanich
• 3 opportunities transferred

<View in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Account owner: Julie Stefanich
- [ ] All 3 opportunities owner: Julie Stefanich
- [ ] Previous owner noted

---

### C2: Invalid BL Name

Command:
```
@gtm-brain assign GTM Test Company to Bob Smith
```

Expected response:
```
❌ "Bob Smith" is not a valid Business Lead.

Valid BLs:
Julie Stefanich, Himanshu Agarwal, Asad Hussain, Ananth Cherukupally, David Van Ryk, John Cobb, Jon Cobb, Olivia Jung
```

Verify: Lists all valid BL names

---

## Test Suite D: Post-Call Summary

### D1: Post-Call Summary with Notes

Command:
```
@gtm-brain post-call summary
Company: GTM Test Company
Met with Sarah Johnson (VP Legal) and Tom Chen (General Counsel). First meeting.
They're processing 200 contracts per month, currently takes 2 weeks per contract.
Interested in AI-Augmented Contracting to reduce to 2 days.
Budget $500K approved by CFO for this year.
Evaluated LawGeex but UI was poor.
Tom is the champion - very enthusiastic about AI.
Sarah controls final budget decision.
Concerns about data security and accuracy metrics.
Demo scheduled for 11/25 at 2pm.
Need to send pricing before demo.
Moving to SQO stage.
Competing with LawGeex and manual process.
```

Expected response:
```
🤖 Structuring post-call summary for GTM Test Company...

[10-15 seconds later]

✅ Post-call summary saved for GTM Test Company

Structured and saved to Customer_Brain
Date: 11/19/2025 | By: [Your Name]

Preview:
POST-CALL SUMMARY - 11/19/2025 by [Your Name]
============================================================

1. MEETING BASICS
Company: GTM Test Company | Attendee(s): Sarah Johnson - VP Legal, Tom Chen - General Counsel | Meeting #: First...

[More sections...]

<View Full Summary in Salesforce>
```

VERIFY IN SALESFORCE:
- [ ] Go to GTM Test Company account
- [ ] Check Customer_Brain__c field
- [ ] Should see full structured summary with 8 sections:
  1. Meeting Basics
  2. Discovery & Current State
  3. Solution Discussion
  4. Key Insights by Offering
  5. Competitive & Decision
  6. Stakeholder Dynamics
  7. Next Steps
  8. Outcome & Stage
- [ ] Properly formatted with headers
- [ ] Key information extracted correctly
- [ ] Quotes preserved
- [ ] Competitor names exact

---

## Test Suite E: Regression Tests (Existing Features)

### E1: Late Stage Pipeline (Improved UX)

Command:
```
@gtm-brain late stage contracting
```

Expected:
```
*AI-Augmented Contracting opportunities in Proposal* (14 total)

14 opportunities across 14 accounts
Total value: $4,200,000

*Companies:*
Intuit, The Weir Group PLC, Home Depot, Medtronic, W.W. Grainger, Dolby, CHS...
[ALL companies listed]
```

Verify: Shows ALL company names (not truncated to 10)

---

### E2: Account Plan

Command:
```
@gtm-brain what's the account plan for Intel?
```

Expected: Shows account plan with numbered sections (or "not found")

---

### E3: Who Owns

Command:
```
@gtm-brain who owns Intel?
```

Expected: Shows owner details

---

## Validation Checklist

After all tests complete:

### Salesforce Data Quality
- [ ] All test opportunities have correct AccountId
- [ ] No orphaned opportunities (all linked to accounts)
- [ ] All ACV fields match Amount fields
- [ ] All CloseDate fields match Target_LOI_Date__c
- [ ] All opportunities have correct owner (matches account)
- [ ] TCV always = 300000 (36 month term)
- [ ] LeadSource always = Inbound
- [ ] Probability matches stage correctly

### Feature Behavior
- [ ] Simple mode uses ALL defaults
- [ ] Detailed mode ONLY overrides mentioned fields
- [ ] Account existence checks work
- [ ] Account creation assigns based on geography
- [ ] Reassignment transfers all opportunities
- [ ] Post-call summaries structure correctly
- [ ] No hallucinations (correct account attachments)

### Security
- [ ] Only Keigan can create accounts
- [ ] Only Keigan can create opportunities
- [ ] Only Keigan can reassign accounts
- [ ] All users can check existence
- [ ] All users (or all BLs) can use post-call summaries

---

## Default Values Reference

For opportunity creation:

| Field | Default Value | Override Example |
|-------|---------------|------------------|
| ACV | $300,000 | "and $500k acv" |
| Stage | 1 (Discovery) | "stage 4" |
| Target Sign | TODAY + 150 days | "target sign of 12/31/2025" |
| Product Line | AI-Augmented Contracting | "product line Augmented-M&A" |
| Revenue Type | Revenue | "revenue type Booking" |
| Term | 36 months | Cannot override (always 36) |
| Opportunity Source | Inbound | Cannot override (always Inbound) |
| TCV | 300000 | Auto-calculated from ACV |

Probability by stage:
- Stage 0: 5%
- Stage 1: 10%
- Stage 2: 25%
- Stage 3: 50%
- Stage 4: 75%

---

## Clean Up After Testing

Delete test data in Salesforce:
1. Find "GTM Test Company" account
2. Delete all opportunities under it
3. Delete the account
4. Or keep for future testing

---

## Common Issues & Solutions

### "Account not found"
- Check spelling
- Use: "does [Company] exist?" first
- Account must exist before creating opportunity

### "Multiple accounts match"
- Be more specific with account name
- Use exact name from Salesforce

### "Missing required fields"
- In detailed mode, include at least: ACV or Stage or Target Date
- Or use simple mode for all defaults

### "Clay enrichment failed"
- Not a blocker - account still creates
- Add fields manually in Salesforce
- Check CLAY_API_KEY in Render

### "Post-call summary failed"
- Check Socrates (OPENAI_API_KEY) configured
- Notes must be > 50 characters
- Company name in first line

---

## Success Criteria

All tests should result in:
- ✅ Correct account attachments (no hallucinations)
- ✅ Proper field values (defaults or custom as specified)
- ✅ Complete opportunity records in Salesforce
- ✅ Structured post-call summaries in Customer_Brain
- ✅ No errors or failures
- ✅ Existing features still working

---

Ready to test! Start with A1 and work through the checklist systematically.

