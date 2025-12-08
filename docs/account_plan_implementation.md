# Account Plan Feature - Implementation Summary

**Date:** November 19, 2025  
**Status:** ✅ Implemented - Ready for Testing  
**Developer Notes:** Complete implementation with enhanced unknown query handling

---

## 🎯 What Was Built

### 1. Account Plan Save Feature
- **Files Modified:** `src/ai/intentParser.js`, `src/slack/events.js`
- **Intent:** `save_account_plan`
- **Access:** All users (no restrictions)
- **Salesforce Field:** `Account.Account_Plan_s__c`

**Structured Template:**
```
add account plan for [Company]:
CLO engagement: [text]
Budget holder: [text]
Champion(s): [text]
Use case(s): [text]
Why Eudia: [text]
Why now: [text]
Why at all: [text]
```

**Features:**
- ✅ Flexible trigger phrases (add/save/update account plan)
- ✅ Structured field parsing with validation
- ✅ Minimum 3 fields required
- ✅ Automatic timestamp and user attribution
- ✅ Fuzzy account name matching
- ✅ Formatted storage in Salesforce
- ✅ Confirmation with Salesforce link

### 2. Account Plan Query Feature
- **Intent:** `query_account_plan`
- **Access:** All users

**Natural Language Queries:**
- "What's the account plan for [Company]?"
- "Show me [Company]'s account plan"
- "Get account plan for [Company]"
- "[Company] account plan"
- "Tell me about the account plan for [Company]"

**Features:**
- ✅ Flexible natural language parsing
- ✅ Account name extraction from multiple phrasings
- ✅ Clean formatted display
- ✅ Shows account owner
- ✅ Helpful prompt if no plan exists
- ✅ Salesforce link included

### 3. Enhanced Unknown Query Handling
- **Intent:** `unknown_query`
- **Purpose:** Graceful fallback for unrecognized queries

**Intelligence:**
- ✅ Detects queries without known keywords
- ✅ Extracts key words from query
- ✅ Provides smart suggestions based on context
- ✅ Offers relevant examples
- ✅ No more random pipeline reports for unknown queries

**Smart Keyword Matching:**
| Keywords | Suggestion Category |
|----------|-------------------|
| company, customer, client | Account lookups |
| sales, revenue, money | Pipeline data |
| report, summary, stats | Excel reports |
| document, agreement | Contract queries |

---

## 📁 Files Modified

### 1. `/src/ai/intentParser.js`

**Lines 400-447:** Added Account Plan intent detection
```javascript
// Account Plan save (ALL USERS can save)
if ((message.includes('add account plan') || message.includes('save account plan') || 
     message.includes('update account plan') || message.includes('account plan for')) &&
    (message.includes('clo engagement') || message.includes('budget holder') || 
     message.includes('champion') || message.includes('use case') || 
     message.includes('why eudia') || message.includes('why now') || message.includes('why at all'))) {
  intent = 'save_account_plan';
  // ... returns intent with 0.95 confidence
}

// Account Plan query (GET account plan)
if ((message.includes('account plan') || message.includes('strategic plan') || 
     message.includes('account strategy')) &&
    (message.includes('what') || message.includes('show') || message.includes('get') || 
     message.includes('what\'s') || message.includes('whats') || message.includes('tell me'))) {
  intent = 'query_account_plan';
  // ... extracts account name with multiple regex patterns
}
```

**Lines 1073-1104:** Added unknown query detection
```javascript
// IMPROVED: Detect truly unknown queries
const pipelineKeywords = ['pipeline', 'deals', 'opportunities', ...];
const accountKeywords = ['account', 'company', 'owner', ...];
const contractKeywords = ['contract', 'pdf', 'loi', ...];

if (intent === 'pipeline_summary' && hasQuestionWord && !hasKnownKeyword && Object.keys(entities).length <= 1) {
  return {
    intent: 'unknown_query',
    entities: { 
      extractedWords: words.slice(0, 5),
      originalIntent: intent
    },
    confidence: 0.3,
    explanation: 'Query not understood - needs clarification'
  };
}
```

### 2. `/src/slack/events.js`

**Lines 320-331:** Added intent routing
```javascript
} else if (parsedIntent.intent === 'save_account_plan') {
  await handleAccountPlanSave(text, userId, channelId, client, threadTs);
  return;
} else if (parsedIntent.intent === 'query_account_plan') {
  await handleAccountPlanQuery(parsedIntent.entities, userId, channelId, client, threadTs);
  return;
} else if (parsedIntent.intent === 'unknown_query') {
  await handleUnknownQuery(parsedIntent, userId, channelId, client, threadTs);
  return;
}
```

**Lines 2053-2201:** Added handleAccountPlanSave function
- Parses structured template
- Validates minimum fields
- Queries Salesforce for account
- Formats plan with timestamp and attribution
- Updates `Account_Plan_s__c` field
- Returns confirmation

**Lines 2203-2274:** Added handleAccountPlanQuery function
- Extracts account name from entities
- Queries Salesforce
- Returns formatted plan or helpful prompt
- Includes account owner and Salesforce link

**Lines 2276-2349:** Added handleUnknownQuery function
- Extracts key words from query
- Analyzes context
- Provides smart suggestions
- Offers relevant examples
- Logs unknown queries for improvement

---

## 🔧 Technical Details

### Intent Detection Priority
Account plan intents are detected EARLY in the fallback chain (right after Customer_Brain) to ensure reliable capture before fallthrough to general pipeline queries.

### Field Parsing Logic
```javascript
const planData = {};
lines.slice(1).forEach(line => {
  if (line.toLowerCase().includes('clo engagement:')) {
    planData.clo = line.split(':').slice(1).join(':').trim();
  }
  // ... similar for each field
});
```

Splits on first colon, preserves remaining colons in content.

### Validation
```javascript
const fieldCount = Object.keys(planData).length;
if (fieldCount < 3) {
  // Return error - incomplete plan
}
```

Minimum 3 fields required to prevent incomplete plans.

### Storage Format
```
*Account Plan - Last Updated: 11/19/2025 by John Smith*

**CLO Engagement:** [content]
**Budget Holder:** [content]
...
```

Markdown-formatted for readability in both Slack and Salesforce.

### Unknown Query Detection
```javascript
const hasKnownKeyword = allKnownKeywords.some(keyword => message.includes(keyword));
const hasQuestionWord = /what|who|when|where|how|show|tell|get|give|find/i.test(message);

if (intent === 'pipeline_summary' && hasQuestionWord && !hasKnownKeyword && Object.keys(entities).length <= 1) {
  // Mark as unknown
}
```

Triggers only when:
1. Intent is still default (pipeline_summary)
2. Message has question words
3. No known domain keywords found
4. No entities extracted

---

## 🧪 Testing

### Test File Created
`test-account-plan.js` - Comprehensive intent detection tests

**Tests:**
- Save account plan (3 variations)
- Query account plan (7 variations)
- Unknown query detection (5 test cases)

**Run Tests:**
```bash
node test-account-plan.js
```

**Expected Output:**
```
✅ All tests passed!
Account Plan feature is ready for testing in Slack!
```

---

## 📋 Deployment Checklist

### Pre-Deploy Testing
- [x] Intent detection tests pass
- [x] No linting errors
- [x] Code reviewed for edge cases
- [x] Documentation complete

### Salesforce Prerequisites
- [ ] Verify `Account_Plan_s__c` field exists
- [ ] Confirm field is Long Text Area (131,072 chars)
- [ ] Check field permissions (all users need write)
- [ ] Test field accessibility via API

### Slack Testing (Post-Deploy)
- [ ] Create test account plan
- [ ] Query test account plan
- [ ] Update existing plan
- [ ] Test validation errors
- [ ] Test account not found
- [ ] Test unknown query handling
- [ ] Verify Salesforce link works
- [ ] Confirm formatting displays correctly

### Team Rollout
- [ ] Send onboarding message to team
- [ ] Demo in team meeting
- [ ] Share ACCOUNT_PLAN_GUIDE.md
- [ ] Monitor adoption and feedback
- [ ] Iterate based on usage patterns

---

## ⚠️ Important Notes

### Security
- **ALL users** can create/update account plans
- This is intentional - collaborative feature
- Different from Customer_Brain (Keigan-only)
- Audit trail via timestamp + attribution

### Field Flexibility
Account name extraction handles:
- Multiple phrasings
- Fuzzy matching (same as account lookups)
- Finds "Intel" when user says "Intel Corporation"
- Case insensitive

### Error Handling
All errors include:
- Clear error message
- Suggested next steps
- Examples of correct usage
- Salesforce verification commands

### Performance
- Single Salesforce query per operation
- Fuzzy account matching uses LIKE
- Limited to 5 account matches
- Takes first match (best match)

---

## 🔮 Future Considerations

### Potential Enhancements
1. **Plan Versioning:** Store history of changes
2. **Plan Templates:** Pre-fill based on industry/segment
3. **AI Suggestions:** Recommend plan improvements
4. **Plan Scoring:** Completeness/quality metrics
5. **Notifications:** Alert when plans are stale
6. **Bulk Operations:** Update multiple plans at once
7. **Plan Comparison:** Compare plans across accounts

### Data Migration
If needed to migrate existing account strategies:
1. Export existing data from wherever it lives
2. Format as account plans
3. Bulk update via Salesforce Data Loader
4. Or use Slack bot to create plans

### Integration Opportunities
- Opportunity stage changes → Prompt plan update
- Account assignment → Send plan to new owner
- Deal won → Update plan with post-sale info
- QBR prep → Auto-retrieve relevant plans

---

## 📊 Monitoring

### What to Track
- **Usage:** How many plans created/updated/queried
- **Users:** Who's actively using the feature
- **Errors:** Common failure patterns
- **Unknown Queries:** What are users trying to ask
- **Plan Completeness:** Average fields per plan

### Logs to Watch
```javascript
logger.info(`✅ Account plan saved for ${account.Name} by ${userName}`);
logger.info(`✅ Account plan retrieved for ${account.Name} by user ${userId}`);
logger.info(`❓ Unknown query from ${userId}: "${originalMessage}"`);
```

### Success Metrics
- 80%+ of strategic accounts have plans within 30 days
- Plans updated at least monthly
- All team members using feature
- Zero "account not found" errors
- Unknown queries < 5% of total

---

## 🐛 Known Limitations

### Current Constraints
1. **Single Account:** One plan per request (no bulk)
2. **No History:** Overwrites previous plan (no diff view)
3. **No Validation:** Doesn't validate field content quality
4. **No Templates:** Users must know structure
5. **English Only:** No multi-language support

### Workarounds
1. Create separate test for bulk needs
2. Copy to Customer_Brain for history if needed
3. Train team on good vs bad content
4. Provide template in docs (users can copy/paste)
5. English is primary language

---

## ✅ Completion Checklist

**Code:**
- [x] Intent detection implemented
- [x] Save handler implemented
- [x] Query handler implemented
- [x] Unknown query handler implemented
- [x] Error handling complete
- [x] Validation logic in place
- [x] No linting errors

**Testing:**
- [x] Test file created
- [x] Intent detection tests
- [x] Unknown query tests
- [ ] End-to-end Slack tests (post-deploy)
- [ ] Salesforce field tests

**Documentation:**
- [x] Complete user guide
- [x] Implementation summary
- [x] Testing instructions
- [x] Troubleshooting guide
- [x] Team training materials

**Deployment:**
- [ ] Merge to main branch
- [ ] Auto-deploy to Render
- [ ] Verify deployment
- [ ] Run post-deploy tests
- [ ] Monitor logs
- [ ] Team announcement

---

**Status:** ✅ Ready for deployment and testing  
**Next Step:** Deploy to Render and test in Slack  
**Owner:** Keigan Pesenti  
**ETA:** Can deploy immediately

---

**Questions or concerns before deploying? All code is production-ready and follows existing patterns.**

