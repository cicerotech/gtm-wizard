# Salesforce Quick Reference for Sales Team

Last updated: November 20, 2025 | Version: 2.1

---

## Key account fields (in priority order)

**Account Owner** - Business Lead responsible for relationship. Contact before engaging.

**HQ State/Region** - Auto-populated from company data, used for territory assignment.

**Customer Type** - Current relationship status:
- LOI, no $ attached - Signed LOI, no financial commitment
- LOI, with $ attached - Signed LOI with committed amount
- Pilot - Running pilot, not yet customer
- Revenue - Active customer with 12+ month contract

**Account Origin** - How account was sourced

**Industry Grouping** - Company industry category

**Account Plan** - Strategic account plan (use cases, champions, value prop)

**Customer Brain** - Meeting summaries and historical notes

---

## Account assignment

West Coast → Himanshu, Julie  
East Coast → Olivia  
International → Johnson Hana BL

Auto-assigned based on lowest current workload + geography.

New accounts created by Keigan Pesenti + GTM-Wizard with automatic assignment based on HQ location and current BL coverage.

---

## Opportunity basics

An opportunity is a specific deal. Key points:

**Initial engagement:** Account starts with single opportunity

**Stage 2 transition:** Use cases must be identified. Ideally broken into separate opportunities for each use case, but varies by account complexity. May happen at different points.

**Stage 4 requirement:** Single use case must be tagged to opportunity. Can create new Stage 2 opportunities for additional use cases as needed.

**Critical fields** (reviewed weekly on Thursdays):
- ACV - Annual contract value
- Stage - Current sales stage (0-4)
- Product Line - Which product being sold
- Target Sign Date - When deal expected to sign

**Revenue types:**
- Recurring - 12+ month contracts (most common)
- Booking - LOI signings, one-time purchases
- Project - Paid pilots, short-term (< 12 months)

**Product lines:**
- AI-Augmented Contracting
- Augmented-M&A
- Compliance
- sigma
- Cortex
- Multiple (buying multiple products)

---

## Stage progression

0 - Qualifying: Scheduling initial meeting (EA/BDR handles)  
1 - Discovery: Meeting set, discovering needs  
2 - SQO: Qualified, Account Plan created, use cases identified  
3 - Pilot: Running pilot program  
4 - Proposal: Single use case tagged, contract negotiation  
Won: Contract signed  
Lost: Deal lost (document reason)

Movement: 0→1 Meeting scheduled | 1→2 Qualified + Account Plan created | 2→3 Pilot SOW signed | 3→4 Pilot successful | 4→Won Contract signed

---

## Data hygiene

Before Stage 2: ACV set, Target Sign Date set, Product Line selected, Revenue Type set, Account Plan created

Update every Thursday: ACV, Target Sign Date, Stage, Product Line

Never: Create opps without accounts, skip stages, leave ACV at $0 past Stage 1, move to Stage 2 without Account Plan

---

## GTM-Wizard commands

**Accounts:**
`does [Company] exist?` - Check existence  
`who owns [Company]?` - Find owner  
`create [Company] and assign to BL` - Auto-create with assignment  
`add account plan for [Company]:` - Save strategic plan  
`add to customer history: [Company]` - Save meeting notes

**Opportunities:**
`create an opp for [Company]` - Create with defaults  
`create an opp for [Company]. stage 4 and $500k acv` - Custom values  
`post-call summary Company: [Name] [notes]` - AI-structure meeting notes

**Pipeline:**
`late stage contracting` - Stage 4 contracting accounts  
`show me the pipeline` - All active opportunities  
`send pipeline excel report` - Generate report

---

## Common mistakes

Duplicate accounts → Use "does [Company] exist?" first  
Skipping stages → Progress sequentially  
No Account Plan at Stage 2 → Required before advancing  
Wrong revenue type → Recurring = 12+ mo, Booking = LOI, Project = pilots  
Multiple use cases in one opp → Consider splitting at Stage 2

---

Questions? #gtm-wizard-help
