# Salesforce Quick Reference for Sales Team

Last updated: November 19, 2025 | Version: 2.0

---

## Account basics

An account is a company you're selling to. Each account has one owner (Business Lead) responsible for the relationship.

Key fields to know:
- Customer Type - Current relationship status (LOI, Pilot, Revenue customer)
- Account Owner - Contact them before engaging with their account
- Headquarters Location - Auto-populated, used for assignment

Customer types:
- LOI, no $ attached - Signed LOI, no financial commitment
- LOI, with $ attached - Signed LOI with committed amount
- Pilot - Running pilot, not yet customer
- Revenue - Active customer with 12+ month contract

Account assignment:
- West Coast states → Himanshu, Julie, or Justin
- East Coast states → Olivia
- International → Johnson or Hannah
- Auto-assigned based on lowest current workload

Don't create accounts yourself - use GTM-Wizard to auto-assign correctly.

---

## Opportunity basics

An opportunity is a specific deal or sales cycle. One account can have multiple opportunities.

Critical fields (reviewed weekly on Thursdays):
- ACV - Annual contract value
- Stage - Current sales stage (0-4, Won, Lost)
- Product Line - Which product(s) they're buying
- Target Sign Date - When deal expected to sign

Revenue types:
- Recurring - 12+ month contracts (subscription/recurring revenue)
- Booking - One-time purchase or LOI signing
- Project - Short-term projects (e.g., paid pilots)

Product lines:
- AI-Augmented Contracting - Contract review and automation
- Augmented-M&A - M&A due diligence
- Compliance - Compliance monitoring
- sigma - Analytics platform
- Cortex - [Product name]
- Multiple - Buying multiple products

---

## Stage definitions

Stage 0 - Qualifying
- Trying to schedule initial meeting
- EA/BDR schedules on behalf of BL

Stage 1 - Discovery
- Meeting set, discovering needs
- Document use cases and pain points

Stage 2 - SQO
- Opportunity qualified, path to close defined
- Account Plan must be created and shared
- Prepare proposal

Stage 3 - Pilot
- Running pilot program
- Drive success, gather metrics

Stage 4 - Proposal
- Contract negotiation
- Legal review, close the deal

Closed Won
- Contract signed, customer onboarded

Closed Lost
- Deal lost, document reason

---

## When to move stages

0 → 1: Meeting successfully scheduled

1 → 2: Meeting completed, opportunity qualified, Account Plan created

2 → 3: Proposal accepted, pilot SOW signed

3 → 4: Pilot successful, ready for commercial discussion

4 → Won: Contract signed, payment agreed

---

## Data hygiene

Before moving to Stage 2:
- ACV populated (best estimate)
- Target Sign Date set
- Product Line selected
- Revenue Type set
- Account Plan created and shared

Update every Thursday:
- ACV (if changed)
- Target Sign Date (if timeline shifted)
- Stage (if progressed)
- Product Line (if expanded)

Never:
- Create opportunities without accounts
- Skip stages
- Leave ACV at $0 past Stage 1
- Move to Stage 2 without Account Plan
- Forget loss reasons when closing lost

---

## GTM-Wizard quick commands

Account checks:
- `does [Company] exist?` - Check if account exists
- `who owns [Company]?` - Find account owner

Account management:
- `create [Company] and assign to BL` - Auto-create with assignment
- `assign [Company] to [BL Name]` - Manual reassignment

Opportunity management:
- `create an opp for [Company]` - Create with defaults
- `create an opp for [Company]. stage 4 and $500k acv` - Custom values

Meeting notes:
- `post-call summary Company: [Name] [your notes]` - AI structures automatically
- `add account plan for [Company]:` - Save strategic plan

Pipeline queries:
- `late stage contracting` - See Stage 4 contracting accounts
- `show me the pipeline` - All active opportunities
- `what deals closed this week?` - Recent wins

Reports:
- `send pipeline excel report` - Generate current pipeline

---

## Who to ask

Salesforce access → IT  
Forecasting → RevOps  
Deal structure → Sales Leadership  
Contract terms → Legal  
GTM-Wizard help → #gtm-wizard-help

---

## Field naming

Accounts: Use company legal name  
Example: "Intel Corporation" not "Intel (West)"

Opportunities: Auto-generated  
Format: [Account] - [Product Line]  
Example: "Intel - AI-Augmented Contracting"

---

## Common mistakes

Creating duplicate accounts → Use "does [Company] exist?" first  
Skipping stages → Progress sequentially  
No ACV → Enter best estimate, update as you learn  
Wrong revenue type → Booking = LOI, Revenue = 12+ mo, Project = pilots  
No Account Plan at Stage 2 → Required before moving to SQO

---

End of guide. Questions? Ask in #gtm-wizard-help
