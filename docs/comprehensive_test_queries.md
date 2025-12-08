# GTM-Wizard - Comprehensive Test Queries

## 🧪 **VERIFIED WORKING QUERIES** (Ready to Test)

### **ACCOUNT OWNERSHIP & BUSINESS LEADS**

**Test #1 - Basic Ownership:**
```
@GTM-Wizard who owns Apple?
Expected: Apple, Owner: Julie Stefanich, Email, Industry
```

**Test #2 - Business Lead Lookup:**
```
@GTM-Wizard who's the BL for Intel?
Expected: Intel, Owner: Himanshu Agarwal, Email, Industry
```

**Test #3 - Prior Owner Check:**
```
@GTM-Wizard who is the BL for StubHub?
Expected: Shows current holder (Keigan) + Prior Owner if exists
```

**Test #4 - Company with "The":**
```
@GTM-Wizard who owns The Wonderful Company?
Expected: Exact match with owner
```

---

### **ACCOUNT FIELD INTELLIGENCE**

**Test #5 - Legal Team Size:**
```
@GTM-Wizard what's the legal team size at Best Buy?
Expected:
*Best Buy*
Legal team size: ~100 estimated
Owner: Himanshu Agarwal
```

**Test #6 - Decision Makers:**
```
@GTM-Wizard who are the decision makers at Intel?
Expected: Clean text with decision maker names
```

**Test #7 - Harvey/Competitor Mentions:**
```
@GTM-Wizard which accounts have mentioned Harvey?
Expected: Comma-separated account list
```

**Test #8 - Product Interest:**
```
@GTM-Wizard which accounts are discussing contracting?
Expected: Comma-separated list of accounts with AI-Augmented Contracting opportunities
```

---

### **PIPELINE BY STAGE**

**Test #9 - Early Stage:**
```
@GTM-Wizard early stage deals
Expected: Stage 1 - Discovery opportunities
```

**Test #10 - Mid Stage:**
```
@GTM-Wizard mid stage pipeline
Expected: Stage 2 - SQO + Stage 3 - Pilot
```

**Test #11 - Late Stage:**
```
@GTM-Wizard late stage opportunities
Expected: Stage 4 - Proposal deals
```

**Test #12 - Specific Stage:**
```
@GTM-Wizard what accounts are in Stage 2?
Expected: Account names with SQO opportunities
```

---

### **PRODUCT LINE QUERIES**

**Test #13 - Product + Stage:**
```
@GTM-Wizard which opportunities are late stage contracting?
Expected: Stage 4 + Product_Line__c = 'AI-Augmented Contracting'
```

**Test #14 - M&A Deals:**
```
@GTM-Wizard show me M&A opportunities
Expected: Product_Line__c = 'M&A' deals
```

**Test #15 - Compliance:**
```
@GTM-Wizard compliance deals in mid stage
Expected: Stage 2/3 + Product_Line__c = 'Compliance'
```

---

### **LOIs & BOOKINGS**

**Test #16 - LOIs Last 2 Weeks:**
```
@GTM-Wizard what LOIs have we signed in the last two weeks?
Expected: 
- IsClosed = true, IsWon = true
- Revenue_Type__c = 'Booking'
- Target_LOI_Date__c = LAST_N_DAYS:14
- Should return ~4 deals
```

**Test #17 - LOIs Last Month:**
```
@GTM-Wizard what LOIs have signed last month?
Expected: Revenue_Type__c = 'Booking' + last month
```

**Test #18 - Bookings This Month:**
```
@GTM-Wizard how many bookings this month?
Expected: Revenue_Type__c = 'Booking' + this month
```

**Test #19 - ARR Deals:**
```
@GTM-Wizard show me ARR deals
Expected: Revenue_Type__c = 'Recurring' opportunities
```

---

### **RECENT ACTIVITY & TIME-BASED**

**Test #20 - What Closed Recently:**
```
@GTM-Wizard what deals closed recently?
Expected: Closed Won deals from this week
```

**Test #21 - Pipeline Additions:**
```
@GTM-Wizard what deals were added to pipeline this week?
Expected: CreatedDate = THIS_WEEK, IsClosed = false
```

**Test #22 - Closed This Month:**
```
@GTM-Wizard what closed this month?
Expected: IsClosed = true, IsWon = true, CloseDate = THIS_MONTH
```

---

### **GENERAL PIPELINE**

**Test #23 - My Pipeline:**
```
@GTM-Wizard show me my pipeline
Expected: All open opportunities (IsClosed = false)
```

**Test #24 - Simple Late Stage:**
```
@GTM-Wizard what deals are late stage?
Expected: Stage 4 - Proposal opportunities
```

---

## ✅ **EXPECTED BEHAVIORS**

### **Stage Name Cleaning:**
- "Stage 6. Closed(Won)" → "Closed Won"
- "Stage 7. Closed(Lost)" → "Closed Lost"

### **Account Ownership Logic:**
1. Business Lead owned → Show owner + email + industry
2. Keigan/Emmit/etc owned + has prior owner → Show prior BL owner
3. Keigan/Emmit/etc owned + no prior → Show "Unassigned"

### **Date Field Selection:**
- Closed deals → Use `CloseDate`
- Pipeline/LOIs → Use `Target_LOI_Date__c`
- Created queries → Use `CreatedDate`

### **Revenue Type Filtering:**
- LOIs/Bookings → `Revenue_Type__c = 'Booking'`
- ARR → `Revenue_Type__c = 'Recurring'`
- Project → `Revenue_Type__c = 'Project'`

---

## 🎯 **CUSTOMIZABLE TEST TEMPLATES**

Replace `[ACCOUNT]` with actual account names:

```
@GTM-Wizard who owns [ACCOUNT]?
@GTM-Wizard who's the BL for [ACCOUNT]?
@GTM-Wizard what's the legal team size at [ACCOUNT]?
@GTM-Wizard who are the decision makers at [ACCOUNT]?
```

---

## 📊 **EXPECTED RESPONSE FORMATS**

**Account Ownership (Business Lead):**
```
*Intel*
Owner: Himanshu Agarwal
Email: himanshu@eudia.com
Industry: Semiconductors and Other Electronic Components
```

**Account Ownership (Prior Owner):**
```
*StubHub*
Prior Owner: Julie Stefanich
Current holder: Keigan Pesenti (unassigned)
Industry: Entertainment

Note: This account was previously owned by a business lead but is currently unassigned.
```

**LOI Query:**
```
*Pipeline Summary*
4 deals worth $9.1M
Weighted value: $3.2M

Coherent - LOI signed
Closed Won  ← (cleaned)
$3,000,000
Asad Hussain
Feb 20, 2025
```

**Product Line + Stage:**
```
*Pipeline Summary*
8 deals worth $12.5M

Stage 4 - Proposal + AI-Augmented Contracting
```

---

## 🚀 **READY TO TEST**

All 24 test queries above have been validated and should work correctly.

**Use these exact phrasings for best results!**

