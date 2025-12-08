# Salesforce Quick Reference for Sales Team

Last updated: November 20, 2025 | Version: 2.2

---

## Key account fields

Account Owner - Business Lead responsible for relationship. Contact before engaging.

HQ State/Region - Auto-populated from company data, determines territory.

Customer Type - Current relationship status.

Account Origin - How account was sourced.

Industry Grouping - Company industry category.

Account Plan - Strategic plan (use cases, champions, value prop).

Customer Brain - Meeting summaries and historical notes.

---

## Customer types

| Type | Meaning |
|------|---------|
| LOI, no $ attached | Signed LOI, no financial commitment |
| LOI, with $ attached | Signed LOI with committed amount |
| Pilot | Running pilot, not yet customer |
| Revenue | Active customer with 12+ month contract |

---

## Account creation and assignment

New accounts created when meetings are scheduled. Creation triggers automatic assignment based on geography and current pipeline coverage for Business Leads.

Keigan Pesenti + GTM-Wizard handle active assignment.

| Geography | Assigned BL |
|-----------|-------------|
| West Coast | Himanshu, Julie |
| East Coast | Olivia |
| International | Johnson Hana BL |

Assignment based on lowest current workload (active opportunities) within geographic region.

---

## Opportunity basics

An opportunity is a specific deal. Key points:

Initial engagement: Account starts with single opportunity.

Stage 2 transition: Use cases must be identified. Ideally broken into separate opportunities for each use case, but varies by account complexity. May happen at different points.

Stage 4 requirement: Single use case must be tagged to opportunity. Can create new Stage 2 opportunities for additional use cases as needed.

Critical fields (reviewed weekly on Thursdays):

| Field | Purpose |
|-------|---------|
| ACV | Annual contract value |
| Stage | Current sales stage (0-4) |
| Product Line | Which product being sold |
| Target Sign Date | When deal expected to sign |

---

## Revenue types

| Type | Use Case |
|------|----------|
| Recurring | 12+ month contracts (most common) |
| Booking | LOI signings, one-time purchases |
| Project | Paid pilots, short-term (< 12 months) |

---

## Product lines

AI-Augmented Contracting, Augmented-M&A, Compliance, sigma, Cortex, Multiple (buying multiple products)

---

## Stage progression

| Stage | What It Means |
|-------|---------------|
| 0 - Qualifying | Scheduling initial meeting (EA/BDR handles) |
| 1 - Discovery | Meeting set, discovering needs |
| 2 - SQO | Qualified, Account Plan created, use cases identified |
| 3 - Pilot | Running pilot program |
| 4 - Proposal | Single use case tagged, contract negotiation |
| Won | Contract signed |
| Lost | Deal lost (document reason) |

Movement: 0→1 Meeting scheduled | 1→2 Qualified + Account Plan created | 2→3 Pilot SOW signed | 3→4 Pilot successful | 4→Won Contract signed

---

## Data hygiene

Before Stage 2: ACV set, Target Sign Date set, Product Line selected, Revenue Type set, Account Plan created

Update every Thursday: ACV, Target Sign Date, Stage, Product Line

Never: Create opps without accounts, skip stages, leave ACV at $0 past Stage 1, move to Stage 2 without Account Plan

---

## GTM-Wizard commands

Accounts: `does [Company] exist?` | `who owns [Company]?` | `create [Company] and assign to BL` | `add account plan for [Company]:` | `add to customer history: [Company]`

Opportunities: `create an opp for [Company]` | `create an opp for [Company]. stage 4 and $500k acv`

Meeting notes: `post-call summary Company: [Name] [notes]`

Pipeline: `late stage contracting` | `show me the pipeline` | `send pipeline excel report`

---

Questions? #gtm-wizard-help
