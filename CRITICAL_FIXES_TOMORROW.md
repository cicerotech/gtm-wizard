# CRITICAL FIXES - Execute First Tomorrow Morning

## 🎯 **Priority 1: Date Field Consistency (URGENT)**

### **THE RULE:**
**Active Pipeline (Stages 0-4) → ALWAYS show Target_LOI_Sign_Date__c**
**Closed Deals (Stage 6/7) → ALWAYS show CloseDate**

### **Current Issues:**
- Some queries showing CloseDate for active pipeline ❌
- Inconsistent date field display
- Target LOI Sign Date label not showing correctly

### **Fix Locations:**

**1. Response Formatter (src/slack/responseFormatter.js):**
```javascript
// In buildDealsTable function
case 'CloseDate':
  // Check if deal is active or closed
  if (record.IsClosed) {
    value = this.formatDate(record.CloseDate);
  } else {
    // Active deals - show Target LOI Sign Date
    value = this.formatDate(record.Target_LOI_Sign_Date__c);
  }
  break;
```

**2. Blocks Builder (src/slack/events.js):**
```javascript
// In buildResponseBlocks function
{
  type: 'mrkdwn',
  text: `*${record.Owner?.Name || 'Unassigned'}*\n${formatDate(record.IsClosed ? record.CloseDate : record.Target_LOI_Sign_Date__c)}`
}
```

**3. Column Headers:**
Change all references from "CLOSE DATE" to context-aware:
- Active pipeline: "TARGET SIGN DATE"
- Closed deals: "CLOSE DATE"

### **Field API Name (CONFIRMED):**
- API Name: `Target_LOI_Sign_Date__c`
- Label: "Target LOI Sign Date" (not "Target LOI Date")

### **Update ALL formatters to use this consistently**

---

## 📊 **Priority 2: Dashboard Integration Strategy**

### **Dashboard URL:**
https://eudia.lightning.force.com/lightning/r/Dashboard/01ZWj000007nkQfMAI/view?queryScope=userFolders

### **Challenge:**
- Bots cannot directly access Salesforce Dashboards (UI-only)
- Dashboards are rendered client-side
- No API endpoint for dashboard data

### **Solution - Replicate Dashboard Calculations:**

**Dashboard likely shows:**
1. Weighted Pipeline by Stage
2. Pipeline Coverage Ratio
3. Win Rates
4. Average Deal Size
5. Conversion Rates

**We can build these queries:**

```javascript
// Weighted Pipeline
SELECT StageName, 
       SUM(Amount) GrossPipeline,
       SUM(Finance_Weighted_ACV__c) WeightedPipeline,
       COUNT(Id) DealCount
FROM Opportunity
WHERE IsClosed = false
GROUP BY StageName
```

```javascript
// Conversion Rate (Stage 2 → Stage 4)
// Count deals that progressed vs total in Stage 2
// Requires historical data or stage change tracking
```

### **Recommended Approach:**
1. **Ask you** what specific metrics the dashboard shows
2. **Replicate each calculation** in SOQL
3. **Create dedicated finance queries**
4. **Match dashboard format** in response

### **Alternative:**
- Create Salesforce Report instead of Dashboard
- Reports have API access
- Bot can query report results directly
- Easier to maintain

---

## 🧠 **Priority 3: Customer_Brain__c Field**

### **Verify Field Exists:**
**Tomorrow morning, run:**
```bash
node discover-fields.js | grep -i "customer.*brain"
```

**If it exists:** Great, use it!
**If not:** Create it in Salesforce:
- Object: Account
- Type: Long Text Area (131,072 characters)
- Field Name: Customer_Brain__c
- Label: Customer Brain

### **Implementation:**
```javascript
// Query account with Customer_Brain__c
const account = await query(`SELECT Id, Name, Customer_Brain__c FROM Account WHERE Name LIKE '%${accountName}%' LIMIT 1`);

// Get existing notes
const existingNotes = account.records[0].Customer_Brain__c || '';

// Format new note
const dateShort = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
const userName = 'Keigan'; // From Slack user ID mapping
const newNote = `${dateShort} - ${userName}: ${noteContent}`;

// Prepend with spacing
const updatedNotes = newNote + '\n\n' + existingNotes;

// Update account
await connection.sobject('Account').update({
  Id: account.records[0].Id,
  Customer_Brain__c: updatedNotes
});
```

---

## 🔍 **Priority 4: Intelligent Note Extraction**

### **Keywords to Detect:**

**People:**
- "met with [Name]"
- "spoke to [Name]"
- "call with [Name]"

**Product Interest:**
- "interested in [Product]"
- "discussing [Product]"
- "considering [Product]"

**Timeline:**
- "Q1 2026", "next quarter", "by March"
- Extract and normalize

**Team Size:**
- "legal team is X people"
- "~50 lawyers"

**Decision Makers:**
- "CLO is [Name]"
- "decision maker: [Name]"
- "GC: [Name]"

**Sentiment:**
- "great meeting", "positive", "excited"
- "concerns about", "hesitant", "on fence"

### **Extraction Logic:**
```javascript
function extractNoteInfo(message) {
  return {
    contacts: extractContacts(message),
    products: extractProducts(message),
    timeline: extractTimeline(message),
    teamSize: extractTeamSize(message),
    decisionMakers: extractDecisionMakers(message),
    sentiment: analyzeSentiment(message),
    rawNote: message
  };
}
```

---

## 🎯 **Priority 5: Context-Aware Intelligence**

### **Account Status Query:**
**"where are we at with Best Buy?"**

**Response should include:**
1. Latest Customer_Brain__c notes (last 3)
2. Open opportunities with stages
3. Total pipeline value
4. Last activity date
5. Next steps/suggested actions

### **Deal Progression Query:**
**"is the Stripe deal progressing?"**

**Analyze:**
- Days in current stage vs average
- Stage advancement history
- Activity frequency
- Note sentiment trends

**Return:**
- Progress indicator (✅ On Track, ⚠️ Stalled, 🚀 Accelerating)
- Momentum analysis
- Recommended actions

---

## 🔐 **Priority 6: User Authentication**

### **Slack User ID Mapping:**
```javascript
const USERS = {
  'U094AQE9V7D': { 
    name: 'Keigan Pesenti',
    email: 'keigan.pesenti@eudia.com',
    permissions: ['read', 'write', 'create', 'update', 'delete']
  },
  // Other users get read-only by default
};
```

### **Permission Gates:**
```javascript
async function requireWritePermission(userId) {
  const user = USERS[userId];
  if (!user || !user.permissions.includes('write')) {
    return {
      allowed: false,
      message: 'Write actions are restricted to admins. Contact Keigan for access.'
    };
  }
  return { allowed: true, user };
}
```

---

## 📋 **Implementation Order (Tomorrow):**

### **Morning Session (2 hours):**
1. ✅ Fix date field consistency (30 min) - CRITICAL
2. ✅ Add weighted pipeline summary (30 min)
3. ✅ Verify Customer_Brain__c field exists (5 min)
4. ✅ Test thoroughly (25 min)
5. ✅ Deploy (git push)

### **Afternoon Session (3 hours):**
1. 🔐 Add user authentication layer (45 min)
2. 📝 Build auto-note capture (1 hour)
3. 🏗️ Add create opportunity (1 hour)
4. ✅ Test with confirmations (15 min)
5. ✅ Deploy

### **Evening (Optional - 2 hours):**
1. 🧠 Intelligence queries (where are we at, is deal progressing)
2. 📊 Finance team queries (conversion rates, ARR+pipeline)
3. 🎯 Similar account matching

---

## ⚠️ **Risk Management:**

**Each change:**
1. Make in local code
2. Test locally first
3. Git commit with clear message
4. Push to trigger Render deploy
5. Watch logs for errors
6. Test in Slack
7. If broken → `git revert HEAD && git push`

**Never push multiple features at once** - one at a time!

---

## 🎯 **Success Criteria:**

**Tomorrow End of Day:**
- ✅ Date fields always correct (Target LOI Sign Date for active)
- ✅ Weighted pipeline shows summary (not deal list)
- ✅ Auto-note capture working (Keigan-only)
- ✅ Create opportunity working (with validation)
- ✅ Customer_Brain__c populated correctly
- ✅ Confirmation links work
- ✅ No regressions in existing queries

---

**READY TO EXECUTE WITH PRECISION TOMORROW!** 🎯

All context captured. Sleep well - we'll build this systematically!

