# gtm-brain v1

**The Challenge:** Poor GTM intelligence—critical account details, pipeline status, and client insights—has been difficult for team members and cross-functional partners to access quickly. This lack of visibility creates bottlenecks and delays decision-making across the organization. As we scale, leadership, product teams, and other departments increasingly need real-time access to reliable GTM data.

Over the past few months, our team has focused on standardizing our go-to-market processes. This standardization has created a structured foundation that now enables us to answer over 50 different types of questions instantly, encompassing three key areas:

• **Pipeline and Forecasting** – Stage-by-stage pipeline analysis, weighted forecasts, conversion rates, and field classifications

• **Account Engagement** – Active client tracking, new logo pipeline entry, and conversion insights

• **Ownership and Activity** – Account ownership mapping, meeting history, and documented next steps

While our processes continue to mature and improve data quality, the core challenge has been making this information easily accessible without manual searches, while ensuring consistency in how we capture, interpret, and communicate our sales data.

---

## Solution approach:

• **Slack-based AI agent** that connects directly to Salesforce, providing real-time answers to GTM questions.

• **Web-based dashboard** for visual pipeline overview with interactive account exploration and search capabilities.

• The development took approximately two weeks, building upon months of foundational work that included restructuring meeting documentation, standardizing data inputs, and establishing clear process definitions.

---

## Technical implementation:

1. Salesforce Connected App with OAuth authentication for secure API access
2. Node.js backend that parses natural language queries and executes Salesforce API calls
3. Deployed on Render with continuous deployment via GitHub
4. Integrated as Slack application accessible via @mention
5. Built using AI-assisted development tools (Cursor). Deployment pipeline allows live updates within minutes.

---

## Current functionality & value

### **Account Intelligence**
Account ownership (current and historical), key decision-makers, competitors mentioned, use case interests, meeting history and context, associated pipeline opportunities

### **Pipeline & Forecasting**
Weighted forecast for current quarter, pipeline reports (Excel exports), LOI counts by time period, customer counts (total and revenue-specific), stage-specific or use case-based filters, contract summaries

### **Workflow Automation**
Route accounts to nurture, add meeting summaries to customer history, generate pipeline reports on demand, smart-assign accounts based on geography and opportunity load, create opportunities in Salesforce, auto-update account plans when opportunities reach Stage 2, manage account reassignment

### **Interactive Dashboard** *(New)*
• **Real-time Pipeline Overview**: Visual metrics showing total pipeline, weighted amounts, account counts, and average deal size

• **Account Search**: Instant search across all accounts with relevance sorting and match highlighting

• **Smart Badges**: Visual indicators for customer types (Revenue, Pilot, LOI, New Logo) for quick account classification

• **Expandable Account Details**: Click any account to view:
  - Account plans and strategic notes
  - Meeting history (past and upcoming with subjects)
  - Legal contacts extracted from calendar sync
  - Product breakdown across opportunities
  - Full opportunity details with stages and values

• **Stage-Based Views**: Accounts organized by Late/Mid/Early stage with expandable lists showing all accounts on demand

• **Business Intelligence Tables**: Breakdowns by stage, business lead, and product line with total ACV and weighted values

---

## Business impact

The system is currently serving **41 team members** with instant access to GTM intelligence, eliminating manual Salesforce searches and ensuring data consistency across the organization. Response times for GTM questions have decreased from hours (or days for complex queries) to seconds, enabling faster decision-making and improved cross-functional collaboration.

