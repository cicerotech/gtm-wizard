# 🧠 gtm-brain Command Cheat Sheet

**For: Keigan Pesenti (Admin)**  
**Last Updated: December 2024**  
**136+ Query Patterns Tested & Confirmed**

---

## 🔑 KEY PRINCIPLES

1. **Be Direct** - gtm-brain prefers clear, concise queries
2. **Use Names** - Include account/person names when relevant
3. **Singular Focus** - One question per message works best
4. **Thread Context** - Follow-ups like "show next 10" work in threads

---

## 📊 1. ACCOUNT QUERIES

### 1a. Who Owns an Account?
```
who owns [Account]
who is the BL for [Account]
BL for [Account]
owner of [Account]
```

**Examples:**
- `who owns Boeing`
- `who is the BL for Intel`
- `BL for Microsoft`
- `owner of Salesforce`

---

### 1b. Account Field Information
```
what is the legal team size at [Account]
legal team size for [Account]
who are the decision makers at [Account]
what use cases is [Account] discussing
competitive landscape for [Account]
```

**Examples:**
- `what is the legal team size at Boeing`
- `who are the decision makers at Microsoft`
- `what use cases is Intel discussing`

---

### 1c. Accounts by Owner
```
what accounts does [Name] own
[Name]'s accounts
accounts owned by [Name]
accounts for [Name]
```

**Examples:**
- `what accounts does Julie own`
- `Himanshu's accounts`
- `accounts owned by Asad`

---

### 1d. Accounts by Stage
```
what accounts are in Stage [X]
accounts in Stage [X]
which accounts are in Stage [X]
what accounts are in SQO
```

**Examples:**
- `what accounts are in Stage 2`
- `accounts in Stage 3`
- `which accounts are in Stage 4`

---

### 1e. Customer List
```
who are our customers
who are our current customers
list our customers
```

---

## 📈 2. PIPELINE QUERIES

### 2a. Show Full Pipeline
```
show me pipeline
show me the pipeline
what is our pipeline
pipeline overview
total pipeline
```

---

### 2b. Owner's Pipeline
```
[Name]'s deals
[Name]'s pipeline
show me my pipeline
my deals
my pipeline
```

**Examples:**
- `Himanshu's deals`
- `Julie's pipeline`
- `show me my pipeline`
- `Justin's deals`

---

### 2c. Stage-Filtered Pipeline
```
early stage pipeline
mid stage deals
late stage pipeline
Stage [X] pipeline
Stage [X] opportunities
proposal stage deals
negotiation pipeline
```

**Examples:**
- `early stage pipeline`
- `late stage pipeline`
- `Stage 2 pipeline`
- `Stage 4 opportunities`

---

### 2d. Product-Filtered Pipeline
```
contracting pipeline
M&A deals
compliance opportunities
sigma pipeline
AI contracting pipeline
late stage contracting
```

**Examples:**
- `contracting pipeline`
- `late stage contracting`
- `M&A deals`

---

### 2e. New Pipeline This Week
```
what deals were added to pipeline this week
new deals this week
deals added this month
new pipeline this week
pipeline added last week
deals created this week
```

---

### 2f. Weighted Pipeline
```
weighted pipeline
finance weighted pipeline
show weighted ACV
```

---

## 💰 3. CLOSED DEALS & BOOKINGS

### 3a. What Closed Recently
```
what closed this month
what closed this week
closed this quarter
recent wins
closed won this month
```

---

### 3b. LOI/Booking Queries
```
what LOIs have we signed
how many LOIs this month
LOIs signed last week
bookings this month
how many bookings
```

---

### 3c. ARR Queries
```
show ARR deals
ARR pipeline
recurring revenue deals
how many ARR contracts
```

---

## 📏 4. METRICS & COUNTS

### 4a. Counting
```
how many deals
how many deals in Stage [X]
count of deals in Stage 2
```

---

### 4b. Average Days in Stage
```
average days in Stage [X]
avg days in Stage [X]
how long in Stage [X]
average time in discovery
```

**Examples:**
- `average days in Stage 2`
- `avg days in Stage 4`
- `how long in Stage 3`

---

## ➕ 5. CREATE OPERATIONS (Admin Only)

### 5a. Create Opportunity
```
create opp for [Account]
create opportunity for [Account]
add opp for [Account]
create a stage [X] opp for [Account]
create opportunity for [Account] with $[X] ACV
```

**Examples:**
- `create opp for Boeing`
- `create opportunity for Intel`
- `create a stage 2 opp for Apple`
- `create opportunity for Amazon with $500k ACV`

---

## ✏️ 6. UPDATE OPERATIONS (Admin Only)

### 6a. Single Account Reassignment
```
reassign [Account] to [BL]
assign [Account] to [BL]
```

**Examples:**
- `reassign Boeing to Julie`
- `assign Intel to Himanshu`
- `reassign Apple to Mike`

---

### 6b. BATCH Account Reassignment ⚡
```
batch reassign: [Account1], [Account2], [Account3] to [BL]
reassign [Account1], [Account2] to [BL]
batch assign: [Account1], [Account2] to [BL]
```

**Examples:**
- `batch reassign: Boeing, Intel, Microsoft to Julie`
- `reassign Boeing, Intel to Himanshu`
- `batch assign: Apple, Amazon, Google to Asad`

---

### 6c. Move to Nurture (Single)
```
move [Account] to nurture
mark [Account] as nurture
set [Account] to nurture
```

**Examples:**
- `move Boeing to nurture`
- `mark Intel as nurture`
- `set Microsoft to nurture`

**What happens:** Sets `Nurture__c = true` AND closes all open opportunities as `Stage 7. Closed(Lost)`

---

### 6d. BATCH Move to Nurture ⚡
```
batch nurture: [Account1], [Account2], [Account3]
move [Account1], [Account2], [Account3] to nurture
batch nurture: [Account1] and [Account2] and [Account3]
```

**Examples:**
- `batch nurture: Boeing, Intel, Microsoft`
- `move Boeing, Intel, Microsoft to nurture`
- `batch nurture: Apple and Amazon and Google`

---

### 6e. Close Lost
```
close [Account] lost
mark [Account] as lost
close lost [Account]
```

**Examples:**
- `close Boeing lost`
- `mark Intel as lost`
- `close lost Microsoft`

---

### 6f. Save Account Notes
```
add to customer history: [Account] [note]
```

**Example:**
- `add to customer history: Boeing met with CLO today`

---

## 📤 7. EXPORTS & REPORTS

### 7a. Excel Export
```
send pipeline excel
pipeline excel report
export active pipeline
```

---

### 7b. Johnson Hana Excel
```
johnson hana pipeline excel
send jh excel
```

---

## 📜 8. CONTRACTS

```
show contracts
active contracts
contracts for [Account]
what contracts do we have
list contracts
```

---

## ⏭️ 9. PAGINATION (In Threads)

After any list result:
```
show next 10
next 10
show more
more
next
show all
```

---

## 🌐 10. DASHBOARD

**Access via browser:**
```
https://gtm-wizard.onrender.com/account-dashboard
```

---

## 🎯 QUICK REFERENCE TABLE

| I Want To... | Say This |
|--------------|----------|
| Find account owner | `who owns [Account]` |
| See my deals | `show me my pipeline` |
| See someone's deals | `[Name]'s deals` |
| Late stage pipeline | `late stage pipeline` |
| Contracting deals | `contracting pipeline` |
| New deals this week | `what deals were added to pipeline this week` |
| Accounts in Stage 2 | `what accounts are in Stage 2` |
| What closed | `what closed this month` |
| LOI count | `how many LOIs this month` |
| Days in stage | `average days in Stage 2` |
| Create opportunity | `create opp for [Account]` |
| Reassign account | `reassign [Account] to [BL]` |
| Batch reassign | `batch reassign: [A1], [A2] to [BL]` |
| Move to nurture | `move [Account] to nurture` |
| Batch nurture | `batch nurture: [A1], [A2], [A3]` |
| Close lost | `close [Account] lost` |
| See more results | `show next 10` |
| Export Excel | `send pipeline excel` |

---

## ⚠️ IMPORTANT NOTES

1. **Admin Functions** - Create, reassign, nurture, and close operations are restricted to you (Keigan)

2. **Batch Syntax** - Always use commas between accounts: `account1, account2, account3`

3. **Nurture = Close** - Moving to nurture automatically closes all open opportunities

4. **Thread Context** - Pagination only works in the same thread as the original query

5. **Stage Names:**
   - Stage 0 = Qualifying
   - Stage 1 = Discovery
   - Stage 2 = SQO
   - Stage 3 = Pilot
   - Stage 4 = Proposal
   - Stage 5 = Negotiation
   - Stage 6 = Closed Won
   - Stage 7 = Closed Lost

6. **BL Names** (use first name):
   - Julie (Smith)
   - Himanshu (Agrawal)
   - Asad (Hashmi)
   - Mike (McMahon)
   - Olivia (Jung)
   - Justin (Hartman)
   - Ananth (Chidambaram)

---

## 📋 11. TECH STACK CLEANUP (December 2024)

### Tech Stack Data Processing

**Location:** `/Users/keiganpesenti/revops_weekly_update/mrr-waterfall-model/cleanup_tech_stack.py`

**Input File:** `/Users/keiganpesenti/Desktop/Accounts and Tech Stack.xlsx`
- Tabs: `Active In Pipeline`, `Signed Logo`

**Output File:** `/Users/keiganpesenti/Desktop/Accounts and Tech Stack - Cleaned.xlsx`

**What It Does:**
1. Extracts verified technologies from Response column
2. Creates clickable hyperlinks for source URLs
3. Removes accounts with incorrect company data (CSL, TPG)
4. Validates: Only shows technologies when sources exist
5. Filters out negative confirmations ("No evidence found...")

**Key Features:**
- Technologies shown as comma-separated list (AWS, Microsoft Azure, Salesforce)
- Source URLs as clickable "Source 1", "Source 2", etc. hyperlinks
- Quality validation: No tech shown without source links
- Negative confirmation detection: Blank if "No reliable evidence found"

**Run Command:**
```bash
cd /Users/keiganpesenti/revops_weekly_update/mrr-waterfall-model
source venv/bin/activate
python3 cleanup_tech_stack.py
```

---

*All queries in this cheat sheet have been validated against 136+ test cases.*

