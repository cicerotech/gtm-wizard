# CS Staffing Alert - Implementation

## Overview
**This is already built and deployed.** When an Opportunity reaches **Stage 4 (Proposal)** or **Stage 5 (Negotiation)**, the system:

1. Sets `CS_Staffing__c = TRUE` on the Opportunity (one-time flag)
2. Fires a Platform Event `CS_Staffing_Alert__e` to notify GTM-Brain
3. GTM-Brain posts a notification to the configured Slack channel

## Components (Already Deployed in Salesforce)

### 1. Platform Event: `CS_Staffing_Alert__e`
**Location:** `salesforce/force-app/main/default/objects/CS_Staffing_Alert__e/`

Fields:
- `Account_Id__c` - Salesforce Account ID
- `Account_Name__c` - Account name
- `Opportunity_Id__c` - Salesforce Opportunity ID
- `Opportunity_Name__c` - Opportunity name  
- `Owner_Id__c` - Deal owner User ID
- `ACV__c` - Annual Contract Value
- `Product_Line__c` - Product line(s) from the Opportunity
- `Stage_Name__c` - Current stage (Stage 4 or 5)
- `Target_Sign_Date__c` - Expected sign date

### 2. Flow: `CS_Staffing_Alert`
**Location:** `salesforce/force-app/main/default/flows/CS_Staffing_Alert.flow-meta.xml`
**Status:** ✅ ACTIVE

**Trigger:** Opportunity update where:
- `StageName` is changed
- `CS_Staffing__c` is currently FALSE (prevents duplicate alerts)
- New `StageName` = "Stage 4 - Proposal" OR "Stage 5 - Negotiation"

**Actions:**
1. Update record: Set `CS_Staffing__c = TRUE`
2. Create record: Publish `CS_Staffing_Alert__e` Platform Event

### 3. GTM-Brain Handler: `csStaffingAlerts.js`
**Location:** `src/services/csStaffingAlerts.js`

Subscribes to `/event/CS_Staffing_Alert__e` and posts to Slack.

## Activation (GTM-Brain Side)

To enable in GTM-Brain, add these environment variables in Render:

```
CS_STAFFING_ALERTS_ENABLED=true
CS_STAFFING_ALERT_CHANNEL=C0ACE4VJ140
```

Then redeploy GTM-Brain to pick up the changes.

## Slack Message Format

```
📋 CS Staffing Alert: Proposal

Account: Acme Corp
Opportunity: Acme Corp - AI Contracting
Stage: Stage 4 - Proposal
ACV: $150,000
Product Line: AI Contracting – Managed Services
Deal Owner: Nathan Shine
Target Sign: Feb 15, 2026

This deal has entered the proposal stage and may require CS staffing planning.
```

For Stage 5, the emoji changes to 📝 and the label says "Negotiation".

## Key Behavior

- **One-time alert:** The `CS_Staffing__c` checkbox ensures each opportunity only triggers ONE alert, even if it moves back and forth between stages.
- **Deduplication:** The GTM-Brain handler tracks ReplayIds to prevent duplicate Slack posts during zero-downtime deployments.
- **Owner lookup:** The handler queries Salesforce to get the owner's name from the User ID.

## Customization

### Change Target Slack Channel
Update `CS_STAFFING_ALERT_CHANNEL` env var with the desired channel ID.

### Modify Stage Names
If your stage names differ, update the Flow's decision criteria in Salesforce Setup → Flows → CS Staffing Alert.
