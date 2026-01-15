# AI & Tooling in GTM: Team Update

*For distribution to the broader team*

---

## SLACK POST

---

**AI & Tooling in GTM: What We've Built**

Sharing an update on the tooling we've developed to reduce manual work and improve data access across Go-To-Market.

---

**GTM Brain: Salesforce via Slack**

We built a Slack bot that queries Salesforce data using natural language. Instead of navigating Salesforce screens or waiting for report requests, you can ask questions directly:

- `@gtm-brain who owns [account]?` — Returns account owner and context
- `@gtm-brain [account] pipeline` — Shows opportunities for that account
- `@gtm-brain show me late stage deals` — Filters by stage
- `@gtm-brain weekly snapshot` — Generates the RevOps weekly PDF

The goal is straightforward: make pipeline data accessible without requiring Salesforce navigation or RevOps requests for routine lookups.

**What it handles:**
- Account ownership queries
- Pipeline filtering by stage, product line, owner
- Opportunity lookups
- Contract queries with PDF access
- Excel exports on demand
- Weekly reporting

---

**Contact Enrichment**

The bot includes a contact finder. Ask `@gtm-brain contact [name] at [company]` and it searches public sources to find email, LinkedIn, and title information. Useful for prospecting without switching to external tools.

---

**Hyprnote Meeting Sync**

For those using Hyprnote (AI transcription that runs locally on your Mac), we have a sync tool that pushes meeting notes to Salesforce automatically. It creates Event records, links to Accounts, and updates the Customer Brain field with conversation insights.

This is optional — only useful if you're already using Hyprnote for meetings.

---

**Account Dashboard**

Live dashboard at: `gtm-wizard.onrender.com/account-dashboard`

Shows pipeline by stage, closed revenue, account breakdowns, and delivery metrics. Accessible to anyone on the team who needs visibility.

---

**How It Was Built**

The system was developed using Cursor (AI-assisted coding) with Claude/OpenAI for the intelligence layer. This allowed us to move quickly — from concept to production deployment in about two weeks.

Tech stack: Node.js, Slack Bolt, jsforce (Salesforce API), PDFKit for reports.

---

**Current Limitations**

This is not a replacement for Salesforce — it's a read layer for common queries. Write operations (creating/updating records) are limited and controlled. Complex reporting still requires Salesforce reports or BI tools.

Some queries may not work as expected. If you hit an issue, let me know so we can improve the intent parsing.

---

**How to Use**

DM `@gtm-brain` or mention it in a channel where it's been added.

Start with something simple like:
- `who owns Intel?`
- `show me my pipeline`
- `dashboard`

---

**Questions or Feedback**

Reach out in #gtm-auto or DM Keigan. Feature requests and bug reports help prioritize what to improve next.

---

## CONTEXT FOR LEADERSHIP

**What this solves:**
Routine Salesforce lookups (account ownership, pipeline status, deal lists) previously required either logging into Salesforce and navigating multiple views, or asking RevOps. This puts those answers in Slack where work already happens.

**What it doesn't solve:**
Complex analytics, forecasting, or trend analysis. Those still require dedicated reports or BI tools.

**Effort invested:**
Approximately 80 development hours over 2 weeks, plus ongoing maintenance.

**Infrastructure cost:**
$25/month (Render hosting).

**Adoption:**
Available to the GTM team. Usage has been growing as people discover what queries work.

**Built with AI tooling:**
We used Cursor (AI pair programming) to build this, which significantly accelerated development. The intent parsing layer uses OpenAI/Claude for understanding natural language queries.

---

## KEY CAPABILITIES

| Capability | Description |
|------------|-------------|
| Account lookup | Owner, business lead, legal team size, decision makers |
| Pipeline queries | By stage, product line, owner, time period |
| Contract access | List contracts, download PDFs directly from Slack |
| Contact enrichment | Find professional contact info via public sources |
| Excel exports | Pipeline data formatted and uploaded to Slack |
| Weekly snapshot | RevOps summary PDF with run rate, signed revenue, top deals |
| Meeting sync | Hyprnote transcripts to Salesforce Events |

---

## TECHNICAL NOTES

- Deployed on Render with auto-deploy from GitHub
- Salesforce connection via jsforce with circuit breaker for rate limiting
- Intent parsing uses pattern matching + LLM fallback
- Dashboard renders server-side HTML (no frontend framework)
- Cron jobs currently disabled pending auth stability improvements

---

*Last updated: January 2026*
