# Phase 3: GTM Intelligence & Memory System

## 🧠 **Vision: Auto-Capture & Context Intelligence**

Transform GTM-Wizard from a query bot into an intelligent GTM memory system that learns, stores, and recalls context.

---

## 📝 **Auto-Note Capture Workflow**

### **Ideal User Experience:**

**User posts in Slack:**
```
I just met with Sarah from Stripe. Great meeting! 
They're interested in AI-Augmented Contracting for their legal team.
Timeline is Q1 2026. Legal team is ~50 people. 
Decision maker is Jane Smith (CLO).
```

**User tags bot:**
```
@gtm-brain
```

**Bot immediately:**
1. ✅ **Detects account:** "Stripe"
2. ✅ **Extracts key info:**
   - Contact: Sarah
   - Interest: AI-Augmented Contracting
   - Timeline: Q1 2026
   - Legal team: ~50
   - Decision maker: Jane Smith (CLO)
3. ✅ **Formats note:**
   ```
   11/7 - Keigan: Meeting with Sarah. Interested in AI-Augmented Contracting 
   for legal team (~50 people). Timeline Q1 2026. DM: Jane Smith (CLO).
   ```
4. ✅ **Stores to Customer_Brain__c** (prepends to existing notes)
5. ✅ **Responds with confirmation:**
   ```
   ✅ Note saved to Stripe
   
   Link: https://eudia.lightning.force.com/lightning/r/Account/[ID]/view
   
   Extracted:
   • Contact: Sarah
   • Interest: AI-Augmented Contracting
   • Timeline: Q1 2026
   • Team size: ~50 people
   • Decision maker: Jane Smith (CLO)
   ```

---

## 🔍 **Customer_Brain__c Field Format**

### **Storage Format:**
```
11/7 - Keigan: [note content]

11/5 - Julie: [previous note]

10/30 - Keigan: [older note]
```

### **Implementation:**
- Query existing Customer_Brain__c value
- Prepend: "\n\n" + dateShort + " - " + userName + ": " + cleanedNote
- Update Account
- Verify and return link

### **Smart Extraction:**
- Account name detection
- Key phrases (interested in, timeline, decision maker, team size)
- Contact names
- Product mentions
- Sentiment/urgency indicators

---

## 🏗️ **Opportunity & Account Creation**

### **Create Opportunity Workflow:**

**User:** "@gtm-brain create opp for Stripe"

**Bot validates:**
1. ✅ Check if Stripe account exists
2. ❌ If not → "Account 'Stripe' doesn't exist. Create it first? React ✅"
3. ✅ If exists → Show opp creation form

**If account doesn't exist:**
```
Account "Stripe" not found in Salesforce.

Create new account?
- Name: Stripe
- Owner: Keigan Pesenti
- Industry: Technology

React ✅ to create account, then I'll create the opportunity.
```

**After account created, create opp:**
```
Creating opportunity for Stripe...

Defaults:
- Name: Stripe - Discovery
- Account: Stripe
- Amount: $100,000
- ACV: $100,000
- TCV: $300,000
- Stage: Stage 1 - Discovery
- Target Sign Date: April 6, 2026 (150 days)
- Close Date: April 6, 2026
- Opportunity Source: Inbound
- Owner: Keigan Pesenti

React ✅ to confirm or ❌ to cancel
```

**After creation:**
```
✅ Opportunity created!

Stripe - Discovery
Amount: $100K | Stage 1 - Discovery
Target Sign: April 6, 2026

Link: https://eudia.lightning.force.com/lightning/r/Opportunity/[ID]/view
```

---

## 🎓 **Intelligence Layer - Account Memory**

### **Context-Aware Queries:**

**Query:** "where are we at with Best Buy?"

**Bot retrieves:**
1. Customer_Brain__c notes (recent activity)
2. Open opportunities (current pipeline)
3. Last activity date
4. Stage progression
5. Recent closes

**Returns:**
```
*Best Buy Status*

*Recent Activity:*
11/7 - Keigan: Met with Sarah, interested in contracting. Timeline Q1.
11/5 - Julie: Follow-up meeting scheduled for 11/15
10/30 - Keigan: Initial discovery call, positive reception

*Current Pipeline:*
• Best Buy - Contracting: Stage 2 - SQO ($2.0M)
• Best Buy - M&A: Stage 1 - Discovery ($500K)

*Total: $2.5M in pipeline*
Last activity: 2 days ago

*What's next?*
• Schedule decision maker meeting
• Send ROI analysis
• Prep for Stage 3
```

---

**Query:** "is the deal progressing with Stripe?"

**Bot analyzes:**
- Stage changes over time
- Activity frequency
- Note sentiment
- Days in current stage

**Returns:**
```
*Stripe Deal Progress*

Current Stage: Stage 2 - SQO ($250K)
Days in stage: 23 days (avg for SQO: 43 days)

*Recent Progress:*
✅ Advanced from Discovery to SQO (11/1)
✅ Met with CLO (10/30)
✅ ROI analysis sent (10/28)

*Momentum: POSITIVE* 
Activity is consistent, advancing on schedule.

*Next milestone:*
Pilot agreement (target: 20 days)
```

---

**Query:** "what accounts are similar to Best Buy?"

**Bot finds:**
- Similar industry
- Similar deal size
- Similar product interest
- Similar stage

**Returns:**
```
*Accounts Similar to Best Buy:*

Based on: Industry (Retail), Deal size ($2M), Product (Contracting)

1. *Target* - $1.8M in Stage 2 (Owner: Himanshu)
2. *Walmart* - $3.2M in Stage 3 (Owner: Julie)
3. *Costco* - $1.5M in Stage 1 (Owner: Asad)

*Common patterns:*
• All retail with large legal teams
• Interested in AI-Augmented Contracting
• Similar deal cycles (40-50 days/stage)
```

---

## 🔐 **Security & Permissions**

### **User ID Mapping:**
```javascript
const ADMIN_USERS = {
  'U094AQE9V7D': 'Keigan Pesenti' // Only user who can write
};

const FINANCE_USERS = {
  'U094AQE9V7D': 'Keigan Pesenti',
  // Add finance team user IDs
};
```

### **Permission Checks:**
- Create/Update/Delete → Keigan only
- Finance queries → Finance team + Keigan
- Read queries → Everyone

---

## 🎨 **Response Formatting Strategy**

### **Summary Queries (weighted, counts):**
- Clean table format
- Key metrics highlighted
- Context provided
- No long lists

### **Account Queries:**
- Account name bold
- Owner info
- Context snippet if available
- Link to Salesforce

### **Intelligence Queries:**
- Rich context from Customer_Brain__c
- Recent activity timeline
- Current status
- Suggested next steps

---

## 📊 **Customer_Brain__c as Intelligence Base**

### **What Gets Stored:**
- Meeting notes (auto-captured)
- Key insights (extracted)
- Contact mentions
- Product interests
- Timeline commitments
- Decision maker info
- Objections/concerns

### **What Gets Retrieved:**
- Recent context (last 3-5 notes)
- Sentiment analysis
- Progress indicators
- Pattern recognition

### **Query Intelligence:**
"where are we at with X?" → Parse Customer_Brain__c for status
"latest engagement with X?" → Most recent note + activity
"is deal progressing?" → Stage changes + note sentiment

---

## 🚀 **Implementation Phases:**

**Phase 2A: Finance Queries (Safe, Read-Only)**
- Weighted pipeline calculations
- ARR + pipeline metrics
- Conversion rates
- Summary formats

**Phase 2B: Auto-Note Capture (Medium Risk)**
- Message parsing
- Account detection
- Customer_Brain__c updates
- Confirmation + links

**Phase 2C: Manual Actions (High Risk - Requires Auth)**
- Create opportunities
- Update fields
- User authentication
- Confirmation workflows

**Phase 3: Intelligence Layer (Advanced)**
- Context-aware responses
- Progress analysis
- Similar account matching
- Strategic suggestions

---

## 📋 **Fields to Map:**

**Account:**
- Customer_Brain__c (new text area field for notes)
- All existing fields we're using

**Opportunity:**
- All existing fields
- Any new fields for tracking

---

**STATUS: VISION DOCUMENTED**
**Ready to implement systematically starting tomorrow!**

This evolution will make GTM-Wizard a true GTM intelligence system.

