# Premium Features Roadmap

## Vision
Transform this from a "note sync tool" into an **AI-powered Sales Intelligence Platform** that:
- Keeps reps moving fast
- Captures institutional knowledge automatically
- Surfaces insights across all customer interactions
- Ensures data quality without manual effort

---

## 🔥 High-Impact Features

### 1. Smart Query Across All Notes (Cross-Rep Intelligence)

**What:** Natural language queries across all synced meeting notes.

**User Experience:**
```
Rep asks in Slack:  "What did anyone discuss with Best Buy about pricing?"

GTM Brain responds:
───────────────────────────────────────────────────────────────
📋 BEST BUY - PRICING DISCUSSIONS (3 meetings)
───────────────────────────────────────────────────────────────

Dec 4, 2025 (Keigan)
  - $5M annual outside counsel spend
  - Goal: offset 50% with UDF
  - Budget decision by Jan 2026

Nov 15, 2025 (Julie)
  - Discussed 50-seat pilot at $X/seat
  - Procurement team pushing for volume discount

Oct 28, 2025 (Himanshu)
  - Initial pricing presented: $XXk annual
  - Competitor mentioned: Harvey pricing as benchmark
───────────────────────────────────────────────────────────────
```

**Implementation:**
- Index all Customer_Brain__c content in vector database
- Use OpenAI embeddings for semantic search
- Query via existing GTM Brain Slack integration

### 2. Automatic Action Item Extraction

**What:** AI extracts action items and creates Salesforce Tasks.

**From meeting notes:**
```
"Schedule a demo with John in early 2026"
"Send pricing proposal by Friday"
"Follow up on contract review"
```

**Auto-creates:**
- Task: "Schedule demo with John" → Due: Jan 15, 2026
- Task: "Send pricing proposal" → Due: Dec 6, 2025
- Task: "Follow up on contract review" → Due: Dec 9, 2025

### 3. Deal Health Alerts

**What:** AI monitors meeting sentiment and flags at-risk deals.

**Triggers alerts when:**
- Competitor mentioned multiple times
- Budget concerns raised
- Timeline pushed back
- Key stakeholder went silent
- Negative sentiment detected

**Alert in Slack:**
```
⚠️ DEAL HEALTH ALERT: Best Buy

Risk Factors Detected:
• Budget reduction mentioned (Q1 2026)
• Harvey competitor discussed as alternative
• Timeline slipped: "decision by Jan 2026" → was Q4 2025

Recommended Action: Schedule executive alignment call
```

### 4. Smart Meeting Prep

**What:** Before a call, AI generates briefing from all past interactions.

**Rep asks:** "Prep me for my Best Buy call tomorrow"

**GTM Brain responds:**
```
═══════════════════════════════════════════════════════════════
MEETING PREP: Best Buy
Call tomorrow, Dec 6 at 2:00 PM with John Jones
═══════════════════════════════════════════════════════════════

KEY CONTEXT
  • $5M outside counsel spend, want to cut 50%
  • Staffing reductions on contracting team
  • Decision deadline: End of January 2026
  • Budget constraints in Q1 may impact

OPEN ACTION ITEMS
  • Send demo recording (promised Dec 4)
  • Provide pilot pricing proposal

LAST 3 INTERACTIONS
  • Dec 4: Discussed IPO readiness, legal strategy
  • Nov 15: Demo with procurement team
  • Oct 28: Initial discovery call

WATCH OUT FOR
  • They've evaluated Harvey - know their pricing
  • Procurement team is driving timeline
═══════════════════════════════════════════════════════════════
```

### 5. Rep Leaderboard & Coaching Insights

**What:** Analytics on meeting activity and deal progression.

**Dashboard shows:**
- Meetings recorded per rep this week
- Accounts with most recent activity
- Reps who haven't synced in 3+ days
- Top accounts by meeting frequency
- Deals advancing vs stalling (based on meeting sentiment)

### 6. Auto-Categorize Meeting Types

**What:** AI classifies meetings automatically.

**Categories:**
- Discovery
- Demo
- Negotiation
- Legal/Contract
- Technical
- Executive Sponsor
- Check-in

**Enables:**
- "Show all discovery calls this month"
- "Which deals haven't had an exec meeting?"

### 7. Competitive Intelligence Aggregation

**What:** Auto-extract and aggregate competitor mentions.

**Output:**
```
COMPETITOR MENTIONS (Last 30 Days)
═══════════════════════════════════════════════════════════════

Harvey (mentioned in 8 meetings)
  - "They quoted $X per seat" (Best Buy, Dec 4)
  - "Using Harvey for doc review" (Chevron, Nov 28)
  - "Harvey lacks workflow features" (DHL, Nov 15)

Legora (mentioned in 3 meetings)
  - "Negative past experience" (Best Buy, Dec 4)
  - "Considering for compliance" (Amazon, Nov 20)

Key Insight: Harvey positioning on price, we win on workflow.
═══════════════════════════════════════════════════════════════
```

### 8. Stakeholder Mapping

**What:** Auto-build org charts from meeting participants.

**From notes:**
- Detect names and titles mentioned
- Build relationship map per account
- Identify missing stakeholders (no legal sponsor yet?)
- Track who attends what types of meetings

### 9. Follow-Up Reminder System

**What:** AI detects commitments and sends Slack reminders.

**From meeting:** "I'll send the proposal by Friday"

**Friday morning Slack DM:**
```
📋 FOLLOW-UP REMINDER

You committed to send a proposal to Best Buy.
Meeting: Dec 4 with John Jones
Due: Today (Friday)

[Mark Done] [Snooze 1 Day] [Reschedule]
```

### 10. Voice-Activated Quick Capture

**What:** While in a meeting, rep can voice-tag key moments.

**Rep says:** "Hey Brain, note this - they want a 3-year contract"

**System:**
- Timestamps the moment in recording
- Tags as "key insight: contract term"
- Highlights in synced notes

---

## 🛠 Implementation Priority

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Smart Query (Cross-Rep) | High | Medium | P1 |
| Meeting Prep Briefs | High | Low | P1 |
| Action Item Extraction | High | Medium | P1 |
| Deal Health Alerts | High | High | P2 |
| Auto-Categorize | Medium | Low | P2 |
| Competitive Intel | Medium | Medium | P2 |
| Follow-Up Reminders | Medium | Low | P3 |
| Rep Leaderboard | Low | Medium | P3 |
| Stakeholder Mapping | Medium | High | P3 |
| Voice Quick Capture | Medium | High | P4 |

---

## Quick Wins (This Week)

### A. Add Search Command to GTM Brain

```javascript
// In events.js
if (text.includes('search notes') || text.includes('what did we discuss')) {
  const query = extractSearchQuery(text);
  const results = await searchCustomerBrain(query);
  // Return formatted results
}
```

### B. Add Meeting Count to Account Dashboard

Show: "Last meeting: Dec 4" and "Total meetings: 12" per account.

### C. Pre-Meeting Slack Reminder

When calendar event starts in 15 min, send Slack DM with Account context.

---

## Data Model Enhancement

To enable premium features, add these fields to synced data:

```javascript
// Enhanced sync data structure
{
  sessionId: "uuid",
  title: "Best Buy Legal Strategy",
  dateTime: "2025-12-04T13:43:00Z",
  duration: "45 min",
  accountId: "001xxx",
  accountName: "Best Buy",
  participants: [
    { name: "John Jones", role: "external", title: "Head of Legal Ops" },
    { name: "Keigan Pesenti", role: "internal", title: "AE" }
  ],
  meetingType: "discovery",  // AI classified
  sentiment: 0.72,  // Positive sentiment score
  actionItems: [
    { text: "Send proposal", dueDate: "2025-12-06", status: "pending" }
  ],
  keyInsights: [
    "$5M outside counsel spend",
    "Decision by Jan 2026",
    "Harvey competitor evaluation"
  ],
  competitorsMentioned: ["Harvey", "Legora"],
  topics: ["pricing", "budget", "timeline", "legal ops"],
  fullNotes: "...",
  vectorEmbedding: [0.123, -0.456, ...]  // For semantic search
}
```

---

## Revenue Impact Estimate

| Feature | Time Saved/Rep/Week | Deal Velocity Impact |
|---------|---------------------|---------------------|
| Smart Query | 2 hours | +10% (better prep) |
| Meeting Prep | 1 hour | +15% (stronger calls) |
| Action Items | 30 min | +5% (better follow-up) |
| Deal Alerts | - | +8% (save at-risk deals) |

**For 10 reps:** ~35 hours/week saved, potential 15-20% pipeline acceleration.

---

## Next Steps

1. **Validate with users:** Which features would they use daily?
2. **Quick win:** Add search command to GTM Brain this week
3. **Data foundation:** Start storing meeting embeddings
4. **Iterate:** Launch features one at a time, measure adoption

