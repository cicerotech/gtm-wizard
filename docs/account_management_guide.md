# Account Management Features - Usage Guide

**Status:** ✅ LIVE - Keigan Only  
**Added:** November 13, 2025  
**Security:** Restricted to Keigan Pesenti (User ID: U094AQE9V7D)

---

## 🎯 Overview

Two new account management features have been added to GTM-Wizard:

1. **Move to Nurture** - Mark accounts as nurture status
2. **Close Lost** - Close account and all open opportunities as lost

Both features are **Keigan-only** and include safety checks.

---

## 📝 Feature 1: Move to Nurture

### What It Does
- Sets `Nurture__c = true` on the account
- Keeps all opportunities open (no changes to opps)
- Shows current open opportunities for reference

### How to Use

**Basic Syntax:**
```
move [Account Name] to nurture
mark [Account Name] as nurture
set [Account Name] to nurture
```

**Examples:**
```
move Test Company to nurture
mark Acme Corp as nurture
set Example Inc to nurture
```

### What You'll See

✅ **Success Response:**
```
✅ Test Company moved to Nurture

Account Details:
Owner: Keigan Pesenti
Open Opportunities: 2

Open Opportunities:
• Test Opp 1 - Discovery ($50K)
• Test Opp 2 - Proposal ($100K)

💡 Note: Open opportunities remain active. Close them manually if needed.

<View Account in Salesforce>
```

❌ **Account Not Found:**
```
❌ Account "Unknown Company" not found.

Try: "who owns Unknown Company" to verify the account exists.
```

---

## 📝 Feature 2: Close Lost

### What It Does
- Closes **ALL open opportunities** on the account as lost
- Sets `StageName` to `"Stage 7. Closed(Lost)"`
- Sets `IsClosed = true` and `IsWon = false`
- Captures loss reason (optional)

### How to Use

**Basic Syntax:**
```
close [Account Name] as lost
close [Account Name] lost
mark [Account Name] as closed lost
```

**With Loss Reason:**
```
close [Account Name] as lost because [reason]
close [Account Name] lost due to [reason]
```

**Examples:**
```
close Test Company as lost
close Acme Corp lost because pricing too high
mark Example Inc as closed lost due to no budget
```

### What You'll See

✅ **Success Response:**
```
✅ Closed Lost: Test Company

Results:
• 2 opportunities closed as lost

Loss Reason: pricing too high

Closed Opportunities:
✅ Test Opp 1 ($50K)
✅ Test Opp 2 ($100K)

<View Account in Salesforce>
```

⚠️ **No Open Opportunities:**
```
⚠️  Test Company has no open opportunities to close.

Account Owner: Keigan Pesenti

No action taken.
```

❌ **Error:**
```
❌ Account "Unknown Company" not found.

Try: "who owns Unknown Company" to verify the account exists.
```

---

## 🔐 Security & Permissions

### Who Can Use These Features?
- **Keigan Pesenti ONLY** (Slack User ID: `U094AQE9V7D`)
- All other users will receive:
  ```
  🔒 Account management is restricted to Keigan. Contact him for assistance.
  ```

### Why Restricted?
- **Write operations** to Salesforce
- **Bulk opportunity updates** can't be undone easily
- **Business impact** of closing deals
- **Data integrity** protection

---

## ⚠️ Important Notes

### Before Using Close Lost:
1. **Use test accounts only** during testing
2. **Verify account name** with "who owns [account]" first  
3. **Check open opportunities** before closing
4. **Cannot be undone** from Slack (must reopen in Salesforce)

### Fuzzy Matching:
- Both features use fuzzy name matching
- "Test" will match "Test Company", "Test Corp", etc.
- If multiple matches, uses first match
- **Always verify** with ownership lookup first

### Test Accounts:
- Create test accounts in Salesforce for testing
- Name them clearly: "Test Company", "Demo Account", etc.
- Add test opportunities with various stages
- **Do not test on real customer accounts**

---

## 🧪 Testing Guide

### Step 1: Create Test Account
In Salesforce:
1. Create new Account: "GTM Bot Test Account"
2. Set Owner: Keigan Pesenti
3. Add 2-3 test opportunities with different stages

### Step 2: Test Move to Nurture
In Slack (as Keigan):
```
@gtm-brain move GTM Bot Test Account to nurture
```

Verify:
- Account has `Nurture__c = true` in Salesforce
- Opportunities remain open
- Response shows correct details

### Step 3: Test Close Lost
In Slack (as Keigan):
```
@gtm-brain close GTM Bot Test Account as lost because testing feature
```

Verify:
- All opportunities closed in Salesforce
- Stage = "Stage 7. Closed(Lost)"
- IsClosed = true, IsWon = false
- Response shows all opportunities closed

### Step 4: Test Error Handling
```
@gtm-brain move Nonexistent Account to nurture
@gtm-brain close Another Fake Account as lost
```

Verify:
- Error messages are helpful
- No Salesforce changes made
- Suggests verification steps

---

## 📊 Example Scenarios

### Scenario 1: Account Going Dormant
```
User (Keigan): We're not actively pursuing Intel right now
User: @gtm-brain move Intel to nurture

Bot: ✅ Intel moved to Nurture
     [Shows open opps]
     💡 Note: Open opportunities remain active. Close them manually if needed.
```

### Scenario 2: Lost Deal with Reason
```
User (Keigan): Apple went with a competitor
User: @gtm-brain close Apple as lost because chose competitor

Bot: ✅ Closed Lost: Apple
     Results:
     • 3 opportunities closed as lost
     Loss Reason: chose competitor
     [Lists closed opps]
```

### Scenario 3: Accidental Misspelling
```
User (Keigan): @gtm-brain close Appple as lost

Bot: ❌ Account "Appple" not found.
     Try: "who owns Appple" to verify the account exists.

User: @gtm-brain who owns Apple

Bot: Apple, Owner: Julie Stefanich...

User: @gtm-brain close Apple as lost

Bot: ✅ Closed Lost: Apple...
```

---

## 🔧 Technical Details

### Fields Modified

**Move to Nurture:**
- `Account.Nurture__c` → `true`

**Close Lost:**
- `Opportunity.StageName` → `"Stage 7. Closed(Lost)"`
- `Opportunity.IsClosed` → `true`
- `Opportunity.IsWon` → `false`

### SOQL Queries Used

**Account Lookup with Opportunities:**
```sql
SELECT Id, Name, Owner.Name, Nurture__c,
       (SELECT Id, Name, StageName, Amount, IsClosed 
        FROM Opportunities 
        WHERE IsClosed = false)
FROM Account
WHERE Name LIKE '%{accountName}%'
LIMIT 5
```

### Bulk Updates

Close Lost uses `jsforce` bulk update:
```javascript
const updates = openOpps.map(opp => ({
  Id: opp.Id,
  StageName: 'Stage 7. Closed(Lost)',
  IsClosed: true,
  IsWon: false
}));

const results = await conn.sobject('Opportunity').update(updates);
```

---

## 🚨 Troubleshooting

### "Account not found" errors:
1. Verify spelling with: `@gtm-brain who owns [account]`
2. Check if account exists in Salesforce
3. Try partial name: "Test" instead of "Test Company Inc."

### "No open opportunities" message:
- Account exists but has no open opps to close
- Check Salesforce directly
- Use "move to nurture" instead if just marking account

### Permission denied:
- Feature is Keigan-only
- Other users cannot access
- Contact Keigan for account management needs

### Salesforce errors:
- Check Render logs for details
- Verify field permissions in Salesforce
- Ensure Nurture__c field exists on Account

---

## 📈 Future Enhancements

Potential additions (not yet implemented):
- [ ] Confirmation step before closing opportunities
- [ ] Loss reason field mapping (if field exists)
- [ ] Ability to close specific opportunities (not all)
- [ ] Reopen functionality
- [ ] Bulk account management
- [ ] Activity log/audit trail

---

## 🎓 Best Practices

1. **Always verify account name first**
   ```
   who owns [account] → then → close [account] lost
   ```

2. **Use test accounts for testing**
   - Never test on real customer accounts
   - Create dedicated test data

3. **Provide loss reasons**
   ```
   close [account] lost because [specific reason]
   ```

4. **Double-check before closing**
   - Closing multiple opportunities is irreversible from Slack
   - Must reopen in Salesforce if mistake

5. **Use nurture for dormant accounts**
   - Preserve opportunity history
   - Can reactivate later

---

## 📞 Support

**Questions or Issues:**
- Check this guide first
- Review error messages (they're helpful!)
- Check Salesforce directly to verify state
- Review Render logs for technical errors

**Feature Requests:**
- Document needed enhancements
- Discuss with development team
- Test thoroughly before deploying

---

**Last Updated:** November 13, 2025  
**Version:** 1.0  
**Status:** Production Ready ✅

