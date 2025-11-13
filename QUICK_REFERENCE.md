# GTM-Wizard Quick Reference - Account Management

## 🚀 New Features (November 13, 2025)

### Move to Nurture
```
@gtm-brain move [Account Name] to nurture
```

**What it does:**
- Sets `Nurture__c = true` on account
- Keeps opportunities open
- Shows current open opps

**Examples:**
```
@gtm-brain move Test Company to nurture
@gtm-brain mark Acme Corp as nurture
```

---

### Close Lost
```
@gtm-brain close [Account Name] as lost
@gtm-brain close [Account Name] lost because [reason]
```

**What it does:**
- Closes ALL open opportunities as lost
- Sets stage to "Stage 7. Closed(Lost)"
- Sets IsClosed=true, IsWon=false

**Examples:**
```
@gtm-brain close Test Company as lost
@gtm-brain close Acme Corp lost because pricing too high
@gtm-brain mark Example Inc as closed lost due to no budget
```

---

## ⚠️ Important Notes

1. **Keigan Only** - Only you can use these commands
2. **Use Test Accounts** - Test with "Test Company" or similar, NOT real customers
3. **Cannot Undo** - Close lost is permanent from Slack (must reopen in Salesforce)
4. **Verify First** - Always check account name: `@gtm-brain who owns [account]`

---

## 📋 Testing Checklist

Before testing on real accounts:

1. ✅ Create test account in Salesforce: "GTM Bot Test Account"
2. ✅ Add 2-3 test opportunities to it
3. ✅ Test move to nurture: `@gtm-brain move GTM Bot Test Account to nurture`
4. ✅ Verify in Salesforce: Nurture__c = true
5. ✅ Test close lost: `@gtm-brain close GTM Bot Test Account as lost because testing`
6. ✅ Verify in Salesforce: All opps closed with Stage 7. Closed(Lost)

---

## 🔍 Existing Features (Still Working)

All your existing queries work exactly the same:

```
@gtm-brain who owns Intel
@gtm-brain weighted pipeline this quarter
@gtm-brain contracts for Cargill
@gtm-brain late stage opportunities
@gtm-brain what closed this week
@gtm-brain add to customer history: Nielsen - Met with Tony...
```

---

## 📚 Full Documentation

- **ACCOUNT_MANAGEMENT_GUIDE.md** - Complete guide with all examples
- **test-account-management.js** - Test script to run locally

---

## 🚀 Deployment Status

✅ **LIVE on Render.com**
- Git pushed: commit `0358aa6`
- Render auto-deploys in 2-3 minutes
- All tests passing (10/10)
- No breaking changes

---

## 💡 Pro Tips

1. **Always verify account exists first:**
   ```
   @gtm-brain who owns Test Company
   @gtm-brain move Test Company to nurture
   ```

2. **Provide loss reasons for better tracking:**
   ```
   @gtm-brain close Test Company lost because chose competitor
   ```

3. **Check open opps before closing:**
   - Move to nurture shows open opps
   - Use this to review before closing lost

---

**Ready to use!** 🎉

