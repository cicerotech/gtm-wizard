# Q1 FY26 Manager Dashboard Requirements

## Overview

This document outlines the Salesforce dashboard requirements for manager visibility. Dashboards should be created in Salesforce Setup using the objects and fields defined in this project.

## Data Sources

### Pipeline Snapshots (P2)
- **Object:** `Pipeline_Snapshot__c`
- **Key Fields:** `Snapshot_Date__c`, `Business_Lead__c`, `Total_Pipeline_ACV__c`, `Weighted_Pipeline__c`, `Attainment_At_Snapshot__c`
- **Use:** Week-over-week pipeline trending

### BL Attainment (P3)
- **Object:** `BL_Performance_Metrics__c`
- **Key Fields:** `Quota_Attainment__c`, `Fiscal_QTD_ACV__c`, `Annual_Quota__c`
- **Use:** Attainment leaderboard

### Outbound Targets (P6)
- **Object:** `Outbound_Target__c`
- **Key Fields:** `Status__c`, `Response_Status__c`, `Touch_Count__c`, `Assigned_BL__c`
- **Use:** Outbound campaign performance

### Call Intelligence (P5)
- **Source:** GTM Brain SQLite database
- **Access:** `/api/call-intelligence/leaderboard` endpoint
- **Use:** Coaching metrics leaderboard

---

## Mitchell (VP Sales) Dashboard

### Components

1. **Pipeline Snapshot Trends**
   - Chart Type: Line chart
   - X-Axis: Snapshot_Date__c (last 12 weeks)
   - Y-Axis: Total_Pipeline_ACV__c (sum by week)
   - Grouping: By Business_Lead__c

2. **Attainment Leaderboard**
   - Chart Type: Horizontal bar
   - Metric: Quota_Attainment__c
   - Filter: Current quarter
   - Sort: Descending

3. **Outbound Campaign Performance**
   - Chart Type: Donut
   - Metric: Count of Outbound_Target__c by Status__c
   - Filter: Current quarter

4. **Call Coaching Insights**
   - Chart Type: Table
   - Columns: Rep Name, Avg Score, Call Count, Next Step Rate
   - Source: GTM Brain API

### Filters
- Date range (default: current quarter)
- Business Lead (multi-select)

---

## Steven (VP CS) Dashboard

### Components

1. **Inbound Queue**
   - Chart Type: Table
   - Object: Case
   - Columns: Subject, Account, Urgency__c, Created Date, Status
   - Filter: Origin = 'Email', Status != 'Closed'
   - Sort: Created Date DESC

2. **Case Volume by Type**
   - Chart Type: Bar
   - Metric: Count of Case
   - Grouping: Request_Type__c
   - Filter: Last 30 days

3. **Account Health Overview**
   - Chart Type: Gauge or Heat Map
   - Source: Account health scores (custom field)

4. **Renewal Pipeline**
   - Chart Type: Table
   - Object: Opportunity
   - Filter: RecordType = 'Renewal', CloseDate in current quarter

### Filters
- Date range
- Account Owner

---

## Team Lead Dashboards (Rina, Nikita, John)

Same structure as Steven's dashboard with additional filter:
- **Team Filter:** Based on Role hierarchy or custom Team__c field

---

## Mobile Optimization

All dashboards should:
- Use responsive Salesforce Lightning components
- Limit to 6 components per dashboard for mobile readability
- Use high-contrast colors for outdoor viewing

---

## Refresh Settings

- **Real-time:** No caching for Case and Opportunity views
- **Scheduled:** Pipeline Snapshot reports can cache for 1 hour
- **Manual Refresh:** Include refresh button on all dashboards

---

## Implementation Steps

1. Create Custom Report Types in Salesforce Setup:
   - "Pipeline Snapshots" (Pipeline_Snapshot__c)
   - "Outbound Targets" (Outbound_Target__c)
   - "Cases with Classification" (Case with custom fields)

2. Build reports in Salesforce Reports tab

3. Assemble dashboards from reports

4. Assign to manager home pages via Lightning App Builder

5. Set up dashboard subscriptions for weekly email delivery
