# Phase 2 Enhancements - DO NOT IMPLEMENT YET

## 🎯 **Weighted Pipeline Summary Format**

### **Current Behavior:**
Query: "what's the weighted pipeline?"
Returns: List of 192 deals (wrong format)

### **Desired Behavior:**
Query: "what's the weighted pipeline?"
Returns:
```
*Weighted Pipeline Summary*

Total Active Opportunities: 192 deals
Gross Pipeline: $45.2M
Weighted Pipeline: $12.3M (Finance_Weighted_ACV__c)
Average Deal Size: $235K

*By Stage:*
Stage 2 - SQO: $8.5M weighted ($23M gross, 85 deals)
Stage 3 - Pilot: $2.1M weighted ($8.7M gross, 32 deals)
Stage 4 - Proposal: $1.7M weighted ($13.5M gross, 75 deals)
```

### **Implementation:**
- Detect "weighted pipeline" query
- Aggregate SUM(Amount) and SUM(Finance_Weighted_ACV__c)
- Group by stage
- Clean summary table format

---

## 💰 **Finance Team Queries**

### **New Query Types:**
1. "what's the weighted ACV this month?"
2. "what's the weighted pipeline this quarter?"
3. "what's ARR plus pipeline?"
4. "conversion rate from stage 2 to stage 4?"

### **Fields to Use:**
- Finance_Weighted_ACV__c (weighted values)
- ACV__c (annual contract value)
- Revenue_Type__c = 'ARR' (for ARR calculations)

---

## 📊 **Dashboard Integration**

### **Dashboard URL:**
https://eudia.lightning.force.com/lightning/r/Dashboard/01ZWj000007nkQfMAI/view?queryScope=userFolders

### **Cannot Access:**
- Bots can't access Salesforce Dashboards directly
- BUT can replicate the calculations using SOQL

### **Approach:**
- Query the same fields the dashboard uses
- Calculate metrics in code
- Present in clean format

---

## 🔐 **Admin Write Capabilities (Keigan-Only)**

### **User Authentication:**
- Check Slack user ID = U094AQE9V7D (Keigan)
- Only allow write actions for this user
- Everyone else gets "Permission denied"

### **Create Opportunity:**
**Trigger:** "@gtm-brain create opp for [Account]"

**Confirmation:**
```
Create opportunity for Amazon?

Defaults:
- Amount: $100,000
- ACV: $100,000
- TCV: $300,000
- Stage: Stage 1 - Discovery
- Target Sign Date: 150 days from now (April 7, 2026)
- Close Date: 150 days from now
- Opportunity Source: Inbound

React ✅ to confirm or ❌ to cancel
```

**After confirmation:**
- Creates opportunity in Salesforce
- Returns opportunity link
- Logs action

### **Log Notes to Customer_Brain__c:**
**Trigger:** "@gtm-brain note for [Account]: [text]"

**Format in Customer_Brain__c:**
```
11/7 - Keigan: [note text]

[existing notes...]
```

**Implementation:**
- Query Account.Customer_Brain__c
- Prepend: "\n\n" + date + " - " + user + ": " + note
- Update Account record
- Confirm to user

### **Update Opportunity:**
**Trigger:** "@gtm-brain update [Opp Name] target sign to [Date]"

**Confirmation:**
- Shows current value
- Shows new value
- Requires ✅ react
- Updates after confirmation

---

## 🧠 **Intelligent Clarification**

### **Current:**
Generic: "Please try rephrasing..."

### **New:**
Contextual: 
```
Did you mean:
1. Weighted pipeline summary? (total weighted value)
2. Pipeline by stage? (breakdown)
3. Specific account pipeline? (which account?)

Reply with number or rephrase.
```

### **Implementation:**
- Detect low confidence (<70%)
- Extract keywords from query
- Suggest 2-3 likely intents
- Accept number or natural language response

---

## 📋 **Enhanced Follow-up Suggestions**

### **Account Lookup:**
After showing account owner, suggest:
```
*About Amazon:*
- 2 active opportunities ($350K pipeline)
- Last activity: 3 days ago
- Stage: 1 in Discovery, 1 in SQO

*What's next?*
• "what use cases is Amazon discussing?"
• "who are the decision makers at Amazon?"
• "show me Amazon's pipeline"
```

### **Count Queries:**
After showing customer count, suggest:
```
*What's next?*
• "what accounts have signed LOIs?" - See the list
• "breakdown by product line?" - ARR by solution
• "what's the average deal size?" - Pipeline metrics
```

---

## 🎯 **Implementation Priority:**

**Phase 2A (Tomorrow AM - 1 hour):**
1. Weighted pipeline summary format
2. Finance team queries
3. Enhanced suggestions

**Phase 2B (Tomorrow PM - 2 hours):**
1. User authentication layer
2. Create opportunity capability
3. Update field capability

**Phase 2C (Next Week - 2 hours):**
1. Customer_Brain__c note logging
2. Intelligent clarification
3. Confirmation workflows

---

## ⚠️ **Risk Mitigation:**

- Test each feature in isolation
- Deploy one at a time
- Verify before adding next
- Always have rollback plan (git revert)

---

**STATUS: DOCUMENTED, NOT IMPLEMENTED**
**Ready to build tomorrow when fresh!**

