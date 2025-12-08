# Account Plan Feature - Complete Guide

**Status:** ✅ READY FOR TESTING  
**Added:** November 19, 2025  
**Security:** Available to ALL users (read and write)  
**Salesforce Field:** `Account.Account_Plan_s__c`

---

## 🎯 Overview

The Account Plan feature allows your team to collaboratively create and maintain strategic account plans directly from Slack, stored in Salesforce for permanent record-keeping.

**Key Benefits:**
- **Structured Format:** Consistent account planning across all accounts
- **Collaborative:** All team members can create and update plans
- **Integrated:** Stored in Salesforce, accessible everywhere
- **Fast:** Update plans without opening Salesforce
- **Tracked:** Automatically timestamps and attributes updates

---

## 📝 Feature 1: Save Account Plan

### Template Format

```
add account plan for [Company Name]:
CLO engagement: [engagement details]
Budget holder: [name/title]
Champion(s): [names and roles]
Use case(s): [specific use cases]
Why Eudia: [value proposition]
Why now: [timing/urgency]
Why at all: [fundamental value]
```

### How to Use

**Basic Syntax:**
- `add account plan for [Company]:`
- `save account plan for [Company]:`
- `update account plan for [Company]:`

**Complete Example:**

```
@gtm-brain add account plan for Intel:
CLO engagement: Monthly strategic meetings with General Counsel, quarterly reviews with exec team
Budget holder: CFO Jane Smith, approved $500K budget for legal tech
Champion(s): Legal Director John Doe (5 years tenure, strong advocate), VP Operations Sarah Johnson
Use case(s): Contract review automation (200+ contracts/month), M&A due diligence, compliance monitoring
Why Eudia: AI-powered contract analysis proven to save 60% review time in pilot
Why now: Q4 compliance audit requires faster turnaround, current solution sunset in 6 months
Why at all: Manual review process not scalable for 40% YoY growth plans, competitive risk
```

### Field Definitions

| Field | Purpose | Example |
|-------|---------|---------|
| **CLO Engagement** | Current relationship status with legal leadership | "Monthly meetings, quarterly exec reviews" |
| **Budget Holder** | Who controls purchasing decision | "CFO Jane Smith, $500K approved" |
| **Champion(s)** | Internal advocates and their influence | "Legal Director John Doe (5 yrs, strong advocate)" |
| **Use Case(s)** | Specific problems Eudia solves | "Contract review automation, M&A due diligence" |
| **Why Eudia** | Unique value proposition | "AI platform saves 60% review time" |
| **Why Now** | Timing and urgency factors | "Q4 audit, current solution sunset" |
| **Why at All** | Fundamental business value | "Scale for 40% growth, competitive advantage" |

### What Happens

1. **Account Lookup:** Finds the account in Salesforce using fuzzy matching
2. **Parse Fields:** Extracts each section from your message
3. **Format:** Creates structured plan with timestamp and your name
4. **Save:** Updates `Account_Plan_s__c` field in Salesforce
5. **Confirm:** Sends confirmation with Salesforce link

### Success Response

```
✅ Account Plan saved for Intel

*Account Plan - Last Updated: 11/19/2025 by John Smith*

**CLO Engagement:** Monthly strategic meetings...
**Budget Holder:** CFO Jane Smith...
**Champion(s):** Legal Director John Doe...
**Use Case(s):** Contract review automation...
**Why Eudia:** AI-powered contract analysis...
**Why Now:** Q4 compliance audit...
**Why at All:** Manual review not scalable...

<View in Salesforce>
```

### Validation Rules

- **Minimum 3 fields required** (prevents incomplete plans)
- **Account must exist** in Salesforce
- **At least 2 lines** of content (company name + data)

---

## 📖 Feature 2: Query Account Plan

### How to Ask

**Flexible Natural Language:**
- "What's the account plan for [Company]?"
- "Show me [Company]'s account plan"
- "Get account plan for [Company]"
- "Tell me about the account plan for [Company]"
- "Account plan for [Company]"
- "What is [Company]'s strategic plan?"
- "[Company] account plan"

**Examples:**
```
@gtm-brain what's the account plan for Intel?
@gtm-brain show me Apple's account plan
@gtm-brain get account plan for Microsoft
@gtm-brain Intel account plan
@gtm-brain tell me about the account plan for Best Buy
```

### Success Response

```
*Account Plan: Intel*

*Account Plan - Last Updated: 11/19/2025 by John Smith*

**CLO Engagement:** Monthly strategic meetings...
**Budget Holder:** CFO Jane Smith, approved $500K...
**Champion(s):** Legal Director John Doe...
**Use Case(s):** Contract review automation...
**Why Eudia:** AI-powered contract analysis...
**Why Now:** Q4 compliance audit requires...
**Why at All:** Manual review not scalable...

*Account Owner:* Himanshu Agarwal
<View in Salesforce>
```

### No Plan Found Response

```
*Intel*

⚠️  No account plan found.

Owner: Himanshu Agarwal

Create one with:
```
add account plan for Intel:
CLO engagement: [details]
Budget holder: [name]
Champion(s): [names]
Use case(s): [details]
Why Eudia: [reason]
Why now: [timing]
Why at all: [value prop]
```
```

---

## 🤔 Feature 3: Improved Unknown Query Handling

### What Changed

**Before:**
- Unknown queries returned random pipeline reports
- Poor user experience
- Confusing responses

**After:**
- Detects truly unknown queries
- Asks clarifying questions
- Provides smart suggestions based on keywords
- Graceful fallback without breaking functionality

### How It Works

When you ask something GTM-Wizard doesn't understand, it:

1. **Extracts key words** from your query
2. **Analyzes context** to guess what you might be asking about
3. **Provides smart suggestions** based on the words you used
4. **Offers examples** of how to rephrase

### Example Interactions

**Query:** "How many employees work at Intel?"

**Response:**
```
🤔 I'm not sure I understand that query.

I noticed you mentioned: *employees, work, intel*

Are you asking about:
• Account information? Try: "who owns Intel"
• Pipeline data? Try: "show me the pipeline"

Or try rephrasing your question, or ask "hello" for more examples.
```

**Query:** "What's the weather like?"

**Response:**
```
🤔 I'm not sure I understand that query.

I noticed you mentioned: *weather, like*

*I can help with:*
• Account ownership: "who owns [company]?"
• Pipeline queries: "show me late stage contracting"
• LOI/ARR tracking: "what LOIs signed last week?"
• Contract queries: "contracts for [company]"
• Account plans: "what's the account plan for [company]?"
• Excel reports: "send pipeline excel report"

Try rephrasing your question, or ask "hello" for more examples.
```

### Smart Suggestions

Based on keywords detected, GTM-Wizard suggests relevant features:

| Keywords Detected | Suggestion |
|-------------------|------------|
| company, customer, client | Account information lookups |
| sales, revenue, money | Pipeline data queries |
| report, summary, stats | Excel reports |
| document, agreement | Contract queries |

---

## 🎯 Use Cases & Examples

### Use Case 1: Pre-Call Planning

**Scenario:** You have a call with Intel tomorrow and need to review the strategy.

```
@gtm-brain what's the account plan for Intel?

[Reviews the plan]

Ready for meeting with full context on:
- Current engagement status
- Key champions to mention
- Specific use cases to discuss
- Value props to emphasize
```

### Use Case 2: Post-Discovery Update

**Scenario:** Just finished discovery call, need to capture insights.

```
@gtm-brain add account plan for Acme Corp:
CLO engagement: First meeting today, very positive, wants follow-up next week
Budget holder: CFO mentioned $300K allocated for legal tech this year
Champion(s): Legal Director Sarah Lee (enthusiastic, mentioned pain points)
Use case(s): Contract redlining takes 2 weeks, need to reduce to 3 days, also interested in compliance monitoring
Why Eudia: Only platform with AI redlining + compliance in one
Why now: Budget expires end of Q4, need to move fast
Why at all: Current growth (50+ contracts/month) unsustainable with current team size

[Plan saved with timestamp]

Now entire team has visibility into account strategy
```

### Use Case 3: Account Handoff

**Scenario:** Account ownership changing from Keigan to Julie.

```
[Keigan saved comprehensive account plan]

@gtm-brain what's the account plan for Microsoft?

[Julie sees full history and strategy]

Seamless handoff with complete context preserved
```

### Use Case 4: Pre-QBR Preparation

**Scenario:** Preparing for quarterly business review, need account status.

```
@gtm-brain get account plan for Intel

[Reviews all strategic accounts]

Full context on:
- Engagement levels
- Budget status
- Champion relationships
- Pipeline alignment with use cases
```

---

## 🔐 Security & Permissions

### Who Can Use

- ✅ **ALL users** can save account plans
- ✅ **ALL users** can query account plans
- ✅ **NO restrictions** (unlike Customer_Brain which is Keigan-only)

### Why Open Access?

Account plans are **strategic documents** that benefit from team collaboration:
- Multiple touchpoints create better plans
- Different perspectives add value
- Collaborative planning improves accuracy
- Transparency benefits entire team

### Audit Trail

Every plan includes:
- **Timestamp:** When it was last updated
- **Attribution:** Who made the update
- **Full history:** Stored in Salesforce field history (if enabled)

---

## 🧪 Testing Guide

### Step 1: Create Test Account Plan

**In Slack:**
```
@gtm-brain add account plan for Test Company:
CLO engagement: Testing engagement field
Budget holder: Test CFO
Champion(s): Test Champion 1, Test Champion 2
Use case(s): Contract automation testing
Why Eudia: Testing value prop
Why now: Testing timing
Why at all: Testing fundamental value
```

**Verify:**
- ✅ Confirmation message appears
- ✅ All fields are present
- ✅ Timestamp and your name included
- ✅ Salesforce link works

### Step 2: Query Account Plan

**In Slack:**
```
@gtm-brain what's the account plan for Test Company?
```

**Verify:**
- ✅ Plan displays correctly
- ✅ All fields are formatted properly
- ✅ Timestamp and attribution visible
- ✅ Account owner shown
- ✅ Salesforce link works

### Step 3: Test Unknown Queries

**In Slack:**
```
@gtm-brain what color is the sky?
@gtm-brain how many employees at Google?
```

**Verify:**
- ✅ Recognizes as unknown query
- ✅ Provides helpful suggestions
- ✅ Doesn't return random pipeline data
- ✅ Offers ways to rephrase

### Step 4: Update Existing Plan

**In Slack:**
```
@gtm-brain update account plan for Test Company:
CLO engagement: UPDATED engagement
Budget holder: NEW CFO
Champion(s): Updated champions
Use case(s): New use cases
Why Eudia: Updated value
Why now: New timing
Why at all: New reasoning
```

**Verify:**
- ✅ Plan updates successfully
- ✅ New timestamp
- ✅ Your name as updater
- ✅ Previous content replaced

### Step 5: Test Validation

**Try incomplete plan:**
```
@gtm-brain add account plan for Test Company:
CLO engagement: Only one field
```

**Verify:**
- ⚠️  Validation error appears
- ⚠️  Prompts for minimum 3 fields
- ⚠️  No Salesforce update made

**Try non-existent account:**
```
@gtm-brain add account plan for Fake Company XYZ:
[Full plan]
```

**Verify:**
- ❌ Account not found error
- ❌ Suggests verification command
- ❌ No Salesforce update made

---

## 💡 Best Practices

### 1. Be Specific and Detailed

**❌ Bad:**
```
CLO engagement: Met once
Budget holder: CFO
Champion(s): Someone
```

**✅ Good:**
```
CLO engagement: Monthly strategic meetings with General Counsel since March, quarterly reviews with exec team, strong relationship
Budget holder: CFO Jane Smith, approved $500K budget for legal tech, decision authority confirmed
Champion(s): Legal Director John Doe (5 years tenure, strong advocate, reports to GC), VP Operations Sarah Johnson (budget influence)
```

### 2. Update After Every Major Interaction

- After discovery calls
- Following budget discussions
- When champions identified
- After pilot milestones
- When timing changes

### 3. Include Context, Not Just Facts

**❌ Fact only:**
```
Why now: Budget available
```

**✅ Context included:**
```
Why now: Budget expires end of Q4 (Dec 31), CFO wants to allocate before year-end, current solution contract ends Jan 15, creates urgency window
```

### 4. Use Plans for Preparation

Before ANY customer interaction:
```
@gtm-brain what's the account plan for [Company]?
```

Review:
- Current engagement status
- Who to mention
- What to discuss
- Why they care

### 5. Make it Team Sport

Encourage everyone to update:
- Sales: Budget and timing info
- CS: Use case details and pain points
- Leadership: Strategic alignment
- BDRs: Champion identification

### 6. Keep Plans Current

Set reminders to review/update:
- Weekly for active deals
- Monthly for pipeline accounts
- Quarterly for existing customers

---

## 🚨 Troubleshooting

### "Account not found" Error

**Problem:** Account doesn't exist or name mismatch

**Solutions:**
1. Verify spelling: `@gtm-brain who owns [Company]?`
2. Try shorter name: "Microsoft" instead of "Microsoft Corporation"
3. Check account exists in Salesforce
4. Try partial match: "Intel" finds "Intel Corporation"

### "Account plan incomplete" Error

**Problem:** Less than 3 fields provided

**Solution:** Include at least 3 of the 7 fields:
- CLO engagement
- Budget holder
- Champion(s)
- Use case(s)
- Why Eudia
- Why now
- Why at all

### Plan Not Formatting Correctly

**Problem:** Fields not recognized

**Common Issues:**
- Missing colon after field name `:` 
- Misspelled field names
- Using different field names

**Solution:** Use EXACT field names:
```
CLO engagement:  ✅
CLO Engagement:  ✅ (case insensitive)
CLO:             ❌ (wrong name)
Legal engagement: ❌ (wrong name)
```

### Can't See Updated Plan

**Problem:** Updated in Slack but Salesforce shows old

**Solutions:**
1. Check Salesforce field: `Account_Plan_s__c`
2. Refresh Salesforce page
3. Verify update confirmation appeared in Slack
4. Check Render logs if error occurred

---

## 📊 Field Mapping

### Salesforce Side

```
Object: Account
Field API Name: Account_Plan_s__c
Field Type: Long Text Area
Character Limit: 131,072 characters
Accessible: All users with Account read/write
```

### Storage Format

```
*Account Plan - Last Updated: 11/19/2025 by John Smith*

**CLO Engagement:** [content]
**Budget Holder:** [content]
**Champion(s):** [content]
**Use Case(s):** [content]
**Why Eudia:** [content]
**Why Now:** [content]
**Why at All:** [content]
```

### Query Used

```sql
SELECT Id, Name, Owner.Name, Account_Plan_s__c
FROM Account
WHERE Name LIKE '%{accountName}%'
LIMIT 5
```

---

## 🎓 Training Your Team

### Onboarding Message

```
🎉 New Feature: Account Plans in Slack!

Create and update strategic account plans directly in Slack:

1️⃣ Save a plan:
@gtm-brain add account plan for [Company]:
CLO engagement: [details]
Budget holder: [name]
Champion(s): [names]
Use case(s): [details]
Why Eudia: [value]
Why now: [timing]
Why at all: [reason]

2️⃣ View a plan:
@gtm-brain what's the account plan for [Company]?

All plans saved to Salesforce automatically!

Questions? Ask in #gtm-wizard-help
```

### Team Workshop Agenda

**15-Minute Training Session:**

1. **Demo save plan** (3 min)
   - Show live example
   - Walk through template
   - Explain each field

2. **Demo query plan** (2 min)
   - Show how to retrieve
   - Point out Salesforce link
   - Show in actual Salesforce

3. **Practice session** (7 min)
   - Each person saves test plan
   - Query someone else's plan
   - Discuss best practices

4. **Q&A** (3 min)
   - Common questions
   - Troubleshooting
   - Use case examples

---

## 📈 Success Metrics

Track these to measure adoption:

- **Plans Created:** Count of accounts with plans
- **Plan Updates:** Frequency of updates
- **Plan Queries:** How often plans are accessed
- **Users Active:** Number of team members using feature
- **Win Rate:** Compare accounts with plans vs without

---

## 🔮 Future Enhancements

Potential additions (not yet implemented):

- [ ] Plan templates by account segment
- [ ] Plan change history/diff view
- [ ] Automated reminders to update stale plans
- [ ] AI-suggested plan improvements
- [ ] Plan completeness scoring
- [ ] Integration with opportunity stages
- [ ] Multi-language support
- [ ] Plan sharing/export to PDF
- [ ] Plan comparison across similar accounts

---

## 📞 Support

**Issues or Questions:**
- Test with "Test Company" first
- Check error messages (they're helpful!)
- Verify account exists: `who owns [Company]?`
- Review this guide
- Check Render logs for technical errors

**Feature Requests:**
- Document needed improvements
- Share use cases we haven't covered
- Suggest better ways to phrase things

---

**Last Updated:** November 19, 2025  
**Version:** 1.0  
**Status:** Ready for Testing ✅

**Related Documentation:**
- ACCOUNT_MANAGEMENT_GUIDE.md - Move to nurture, close lost
- CUSTOMER_BRAIN_IMPLEMENTATION.md - Note capture feature
- QUERY_EXAMPLES.md - All query types

---

**Ready to test!** Start with a test account and iterate based on your team's feedback.

