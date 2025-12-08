# GTM-Wizard Query Guide

## 🎯 Comprehensive Query Examples

### ACCOUNT OWNERSHIP & BUSINESS LEADS

**Business Lead Lookups:**
```
@GTM-Wizard who owns Apple?
@GTM-Wizard who's the BL for Intel?
@GTM-Wizard business lead at Microsoft?
@GTM-Wizard who is the BL for IBM?
```
**Returns:** Clean account info with owner, email, industry (business leads only)

---

### ACCOUNT INTELLIGENCE

**Legal Team Information:**
```
@GTM-Wizard what's the legal team size at Best Buy?
@GTM-Wizard legal department size at Apple?
```
**Returns:** Legal team size, owner

**Decision Makers:**
```
@GTM-Wizard who are the decision makers at Microsoft?
@GTM-Wizard key stakeholders at Intel?
```
**Returns:** Key decision makers list

**Competitor Intelligence:**
```
@GTM-Wizard which accounts have mentioned Harvey?
@GTM-Wizard accounts mentioning Harvey pilot?
```
**Returns:** Comma-separated account list

**Product Interest:**
```
@GTM-Wizard which accounts are discussing contracting?
@GTM-Wizard accounts interested in M&A?
@GTM-Wizard compliance use cases?
```
**Returns:** Comma-separated account list

---

### PIPELINE BY STAGE

**Stage Groups:**
```
@GTM-Wizard early stage deals
Returns: Stage 1 - Discovery opportunities

@GTM-Wizard mid stage pipeline  
Returns: Stage 2 - SQO + Stage 3 - Pilot

@GTM-Wizard late stage opportunities
Returns: Stage 4 - Proposal
```

**Specific Stages:**
```
@GTM-Wizard what accounts are in Stage 2?
@GTM-Wizard Stage 3 deals?
@GTM-Wizard discovery stage pipeline?
```

---

### PRODUCT LINE QUERIES

**Product + Stage Combinations:**
```
@GTM-Wizard which opportunities are late stage contracting?
Returns: Stage 4 + AI-Augmented Contracting product line

@GTM-Wizard M&A deals in mid stage?
@GTM-Wizard compliance opportunities in discovery?
@GTM-Wizard litigation deals in proposal?
```

**Available Product Lines:**
- AI-Augmented Contracting
- M&A
- Compliance
- Litigation
- Undetermined

---

### BOOKINGS & LOIs

**LOI Signing (uses Target LOI Date):**
```
@GTM-Wizard what LOIs have we signed in the last two weeks?
@GTM-Wizard signed LOIs this month?
```
**Returns:** Only "Booking" opportunities with Target LOI Date

**Bookings Count:**
```
@GTM-Wizard how many bookings have we signed this week?
@GTM-Wizard bookings this month?
```
**Returns:** Booking opportunities (New Business + Upsells)

**ARR Deals:**
```
@GTM-Wizard show me ARR deals
@GTM-Wizard recurring revenue opportunities?
```
**Returns:** ARR-tagged opportunities (Renewals + Upsells)

---

### RECENT ACTIVITY & TIME-BASED

**Closed Deals:**
```
@GTM-Wizard what deals have we closed recently?
@GTM-Wizard what closed this week?
@GTM-Wizard recent wins this month?
```

**Pipeline Additions:**
```
@GTM-Wizard what deals were added to pipeline this week?
@GTM-Wizard new deals created this month?
```
**Returns:** Uses CreatedDate field

---

### CROSS-OBJECT QUERIES

**Combined Filters:**
```
@GTM-Wizard which accounts are interested in contracting and in stage 4?
Returns: Accounts with "contracting" in use cases + Stage 4 opportunities
```

---

### NATURAL CONVERSATION

**Chat Capability:**
```
@GTM-Wizard hey, can we chat?
@GTM-Wizard what can you help me with?
@GTM-Wizard tell me about your capabilities
```
**Returns:** Natural conversational responses using Socrates AI

---

## 🔑 KEY FEATURES

**Business Lead Detection:**
- Julie Stefanich, Himanshu Agarwal, Asad Hussain, Ananth Cherukupally, David Van Ryk, John Cobb, Olivia Jung
- Accounts owned by others = "Unassigned"

**Date Fields:**
- **Target LOI Date**: Used for pipeline and LOI queries
- **Close Date**: Used for closed deal queries
- **Created Date**: Used for "deals added" queries

**Smart Prioritization:**
- Exact name matches first
- Business lead accounts prioritized
- Relevant results only

**Output Formats:**
- **Detailed tiles**: For pipeline/deals (shows amount, stage, owner, dates)
- **Account lists**: For competitor/product queries (comma-separated)
- **Clean lookups**: For ownership (name, owner, email, industry only)

---

## 💡 TIPS

1. **Be specific**: "late stage contracting" vs just "contracting"
2. **Use natural language**: "who's the BL for Apple?" works great
3. **Combine filters**: "early stage M&A deals"
4. **Ask about recency**: "last two weeks", "this month", "recently"
5. **Product line queries**: Always mention the product (contracting, M&A, etc.)

---

## 🚀 ADVANCED EXAMPLES

```
@GTM-Wizard which opportunities are late stage contracting?
→ Stage 4 + AI-Augmented Contracting product line

@GTM-Wizard which accounts are discussing litigation?
→ Accounts with "litigation" in use cases field

@GTM-Wizard what LOIs have we signed in the last two weeks?
→ Booking opportunities with Target LOI Date in last 14 days

@GTM-Wizard who are the key decision makers at Intel?
→ Decision makers from account page

@GTM-Wizard what's the legal department size at Best Buy?
→ Legal team size number
```

