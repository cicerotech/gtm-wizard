# Cursor: Tactical Improvements for GTM-Brain
**From:** Stanford CS Faculty (Project Advisor)  
**Priority:** Critical gaps that reduce grade from B+ to A

## Critical Fix #1: Add Automated Testing (REQUIRED)
**Why:** Production system with zero test automation is unacceptable
**Impact:** Grade +8 points (68→76)
**Time:** 4 hours

Add jest test suite:
```bash
npm install --save-dev jest supertest
```

Create tests for:
- Intent detection (15 test cases)
- Query building (10 test cases)
- Account creation workflow (5 test cases)
- Response formatting (5 test cases)

Target: 40% code coverage minimum

## Critical Fix #2: Usage Analytics (PROVE VALUE)
**Why:** Can't defend ROI without measurement
**Impact:** Grade +5 points
**Time:** 2 hours

Track in Redis/database:
- User ID, timestamp, query, intent, success/failure
- Daily/weekly active users
- Query type distribution
- Success rate

Build /metrics endpoint showing usage over time.

## Critical Fix #3: Complete Dashboard Fix
**Why:** Half-finished feature damages credibility
**Impact:** Grade +3 points
**Time:** 30 minutes

File: src/slack/accountDashboard.js line 377
Replace Account Plans tab complex structure with simple list matching Summary tab.
NO yellow fills, NO expandable details, top 10 accounts only.

## High-Value Fix #4: Semantic Query Matching
**Why:** Unlocks rigidity problem
**Impact:** Grade +4 points
**Time:** 3 hours

Use embeddings for fuzzy matching:
- "late stage deals" = "stage 4 opportunities" = "proposal phase"
- Cosine similarity >0.85 = match
- Keeps deterministic execution

These 4 fixes take 9.5 hours total and move grade from 68 to 80+.
Focus on #1 and #2 first - testing and measurement are non-negotiable for production.
