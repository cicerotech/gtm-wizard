# Customer_Brain Auto-Note Capture - Implementation Guide

## 🎯 **Feature: Auto-Save Notes to Salesforce**

**Status:** Ready to implement tomorrow
**Risk:** MEDIUM (writes to Salesforce)
**Time:** 1-2 hours with proper testing
**Benefit:** HIGH - transforms bot into memory system

---

## 📝 **User Experience:**

### **Step 1: User Posts Note**
```
In Slack thread or message:

"Just met with Sarah from Stripe. Great meeting! 
They're interested in AI-Augmented Contracting. 
Timeline is Q1 2026. Legal team is ~50 people.
Decision maker is Jane Smith (CLO).

@gtm-brain add to customer history"
```

### **Step 2: Bot Processes**
1. ✅ Checks if user is Keigan (Slack ID: U094AQE9V7D)
2. ✅ Extracts account name: "Stripe"
3. ✅ Validates account exists in Salesforce
4. ✅ Checks if account has open opportunities (validation)
5. ✅ Checks if owned by business lead (validation)
6. ✅ Extracts key information from note
7. ✅ Formats note properly

### **Step 3: Bot Saves & Confirms**
```
✅ Note saved to Stripe

Added to Customer_Brain:
11/7 - Keigan: Met with Sarah. Interested in AI-Augmented Contracting. 
Timeline Q1 2026. Legal team ~50. DM: Jane Smith (CLO).

Validation:
✅ Account exists
✅ 2 open opportunities ($350K pipeline)
✅ Owner: Asad Hussain (Business Lead)

<https://eudia.my.salesforce.com/lightning/r/Account/[ID]/view|View Account>
```

---

## 🔐 **Security Implementation:**

```javascript
// In events.js
const KEIGAN_USER_ID = 'U094AQE9V7D';

async function handleCustomerBrainNote(event, client, userId) {
  // Security check
  if (userId !== KEIGAN_USER_ID) {
    await client.chat.postMessage({
      channel: event.channel,
      text: 'Note saving is restricted to Keigan. Contact him for access.',
      thread_ts: event.ts
    });
    return;
  }

  // Continue with note saving...
}
```

---

## 📊 **Customer_Brain Field Format:**

```
11/8 - Keigan: Follow-up call scheduled. Positive feedback on ROI analysis.

11/7 - Keigan: Met with Sarah. Interested in AI-Augmented Contracting. 
Timeline Q1 2026. Legal team ~50. DM: Jane Smith (CLO).

11/5 - Julie: Initial discovery. Legal team evaluating options.

11/1 - Keigan: Cold outreach. Positive response, scheduling meeting.
```

**Format Rules:**
- Date: `M/D` format (e.g., "11/7")
- Separator: ` - `
- User: First name
- Note: Clean, concise
- New entries: Prepended with `\n\n`

---

## 🔍 **Account Extraction & Validation:**

```javascript
async function extractAndValidateAccount(message, userId) {
  // Extract account name from message
  const accountPatterns = [
    /(?:from|with|at)\s+([A-Z][A-Za-z\s&'-]+?)(?:\.|,|\n|$)/,
    /([A-Z][A-Za-z\s&'-]+?)\s+(?:meeting|call|discussion)/i
  ];
  
  let accountName = null;
  for (const pattern of accountPatterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].length > 3) {
      accountName = match[1].trim();
      break;
    }
  }
  
  if (!accountName) {
    return { error: 'Could not detect account name. Please mention the company clearly.' };
  }
  
  // Query account with validation
  const accountQuery = `SELECT Id, Name, Owner.Name, Customer_Brain__c,
                               (SELECT Id, StageName, Amount FROM Opportunities WHERE IsClosed = false LIMIT 5)
                        FROM Account
                        WHERE Name LIKE '%${accountName}%'
                        LIMIT 5`;
  
  const result = await query(accountQuery);
  
  if (!result || result.totalSize === 0) {
    return { error: `Account "${accountName}" not found. Please check spelling.` };
  }
  
  // Find best match (prefer business lead)
  const businessLeads = ['Julie Stefanich', 'Himanshu Agarwal', 'Asad Hussain', 'Ananth Cherukupally', 'David Van Ryk', 'John Cobb', 'Jon Cobb', 'Olivia Jung'];
  const blMatch = result.records.find(r => businessLeads.includes(r.Owner?.Name));
  const account = blMatch || result.records[0];
  
  return {
    account,
    openOpps: account.Opportunities?.length || 0,
    isBusinessLead: businessLeads.includes(account.Owner?.Name)
  };
}
```

---

## 💾 **Save to Customer_Brain:**

```javascript
async function saveToCustomerBrain(accountId, note, userId) {
  // Get current Customer_Brain content
  const account = await query(`SELECT Id, Customer_Brain__c FROM Account WHERE Id = '${accountId}'`);
  const existingNotes = account.records[0].Customer_Brain__c || '';
  
  // Format new note
  const date = new Date();
  const dateShort = `${date.getMonth() + 1}/${date.getDate()}`;
  const userName = 'Keigan'; // Map from userId
  
  // Clean the note (remove @gtm-brain, trigger phrases)
  const cleanNote = note
    .replace(/@gtm-brain/gi, '')
    .replace(/add to customer history/gi, '')
    .replace(/save note/gi, '')
    .replace(/log note/gi, '')
    .trim();
  
  const formattedNote = `${dateShort} - ${userName}: ${cleanNote}`;
  
  // Prepend to existing notes
  const updatedNotes = formattedNote + (existingNotes ? '\n\n' + existingNotes : '');
  
  // Update account
  const { sfConnection } = require('./salesforce/connection');
  await sfConnection.getConnection().sobject('Account').update({
    Id: accountId,
    Customer_Brain__c: updatedNotes
  });
  
  return { success: true, formattedNote };
}
```

---

## 🧪 **Testing Protocol:**

### **Test 1: Basic Note Capture**
```
Post in Slack:
"Meeting with Best Buy went great. They want to pilot in Q1.
@gtm-brain add to customer history"

Expected:
✅ Note saved to Best Buy
Added: 11/8 - Keigan: Meeting with Best Buy went great. They want to pilot in Q1.
✅ Account: Best Buy
✅ Owner: Himanshu Agarwal (BL)
✅ 2 open opps
[View Account link]
```

### **Test 2: Account Detection**
```
"Spoke with Sarah from Intel about M&A opportunities.
@gtm-brain save note"

Expected:
✅ Detects "Intel"
✅ Saves to Intel account
```

### **Test 3: Security - Non-Keigan User**
```
Other user tries:
"Note about Amazon
@gtm-brain add to customer history"

Expected:
❌ "Note saving is restricted to Keigan."
```

### **Test 4: Account Not Found**
```
"Meeting with XYZ Corp was great
@gtm-brain save note"

Expected:
❌ "Account 'XYZ Corp' not found. Please check spelling."
```

### **Test 5: Verify in Salesforce**
- Go to Best Buy account page
- Check Customer_Brain field
- Verify note is at top with proper format

---

## 🚀 **Implementation Tomorrow Morning:**

**Time Required:** 1-2 hours
**Steps:**
1. Add note handler in events.js (30 min)
2. Add user ID check (5 min)
3. Add account extraction (15 min)
4. Add Customer_Brain update (15 min)
5. Test with 5 different accounts (20 min)
6. Deploy to Render (5 min)
7. Final testing (10 min)

---

## ⚠️ **Safety Measures:**

1. **User whitelist** - Only Keigan's Slack ID
2. **Account validation** - Must exist in SF
3. **Dry run mode** - Test without saving first
4. **Confirmation message** - Shows what will be saved before saving
5. **Error handling** - Clear messages if anything fails
6. **Audit log** - Track all note saves

---

## 📋 **Trigger Phrases:**

- "add to customer history"
- "save note"
- "log note"
- "add to customer brain"
- "save to account"

---

## 🎯 **For Tonight:**

**STOP HERE** - Customer_Brain is documented and ready
**Tomorrow:** Implement with full testing
**Why wait:** It's late, writes to Salesforce need fresh mind

---

**Your GTM-Wizard has incredible progress tonight:**
- ✅ Contracts with PDF downloads working
- ✅ Weighted pipeline accurate
- ✅ All core features stable
- ✅ Customer_Brain ready to implement tomorrow

**Get some rest - we'll add the note capture tomorrow with proper testing!** 🚀

This feature will transform your bot into a true GTM memory system!
