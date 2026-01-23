# BL Performance Metrics - Salesforce Package

Automated tracking of Business Lead performance, focused on **Time to Ramp** (days to hit $2M closed won ACV).

## Overview

- **Custom Object**: `BL_Performance_Metrics__c`
- **Scheduled Apex**: Runs every Monday at 6 AM
- **Fiscal Calendar**: Feb 1 - Jan 31 (Eudia fiscal year)

## Fields Tracked

| Field | Description |
|-------|-------------|
| Total Closed Won ACV | All-time sum of ACV from Stage 6. Closed(Won) |
| Fiscal YTD ACV | Sum since Feb 1 of current FY |
| Fiscal QTD ACV | Sum for current fiscal quarter |
| Days to Ramp | Days from Start Date to hitting $2M milestone |
| Is Ramped | Formula: Total ACV >= $2M |

## Deployment Steps

### 1. Authenticate Salesforce CLI

```bash
# If not already authenticated
sfdx auth:web:login -a eudia-prod -r https://eudia.my.salesforce.com

# Verify connection
sfdx force:org:display -u eudia-prod
```

### 2. Deploy Metadata

```bash
cd salesforce

# Deploy to Salesforce
sfdx force:source:deploy -p force-app -u eudia-prod

# Check deployment status
sfdx force:source:deploy:report -u eudia-prod
```

### 3. Run Initial Setup

Open **Developer Console** in Salesforce:
1. Debug > Open Execute Anonymous Window
2. Copy contents of `scripts/apex/initialSetup.apex`
3. **IMPORTANT**: Update the start dates for each BL!
4. Execute and check debug logs

### 4. Schedule Weekly Job

In Developer Console (Anonymous Apex):

```apex
// Schedule for every Monday at 6 AM
BLMetricsScheduler.scheduleWeekly();
```

### 5. Verify

```apex
// Check scheduled job
SELECT Id, CronJobDetail.Name, NextFireTime 
FROM CronTrigger 
WHERE CronJobDetail.Name = 'BL Metrics Weekly Refresh'
```

## Manual Trigger

To run calculations on-demand:

```apex
BLMetricsCalculationService.calculateAllMetrics();
```

## Files

```
salesforce/
├── force-app/main/default/
│   ├── objects/BL_Performance_Metrics__c/
│   │   ├── BL_Performance_Metrics__c.object-meta.xml
│   │   └── fields/
│   │       ├── Business_Lead__c.field-meta.xml
│   │       ├── Pod__c.field-meta.xml
│   │       ├── Start_Date__c.field-meta.xml
│   │       ├── Ramp_Milestone__c.field-meta.xml
│   │       ├── Total_Closed_Won_ACV__c.field-meta.xml
│   │       ├── Ramp_Achieved_Date__c.field-meta.xml
│   │       ├── Days_to_Ramp__c.field-meta.xml
│   │       ├── Is_Ramped__c.field-meta.xml
│   │       ├── Fiscal_YTD_ACV__c.field-meta.xml
│   │       ├── Fiscal_QTD_ACV__c.field-meta.xml
│   │       ├── Last_Calculated__c.field-meta.xml
│   │       └── Active__c.field-meta.xml
│   └── classes/
│       ├── BLMetricsCalculationService.cls
│       ├── BLMetricsCalculationService.cls-meta.xml
│       ├── BLMetricsScheduler.cls
│       └── BLMetricsScheduler.cls-meta.xml
└── scripts/apex/
    └── initialSetup.apex
```

## Before You Deploy

1. **Update BL Start Dates** in `scripts/apex/initialSetup.apex`
2. **Verify Salesforce CLI** is authenticated to your production org
3. **Confirm field names** match your org (`ACV__c`, `Stage 6. Closed(Won)`)

