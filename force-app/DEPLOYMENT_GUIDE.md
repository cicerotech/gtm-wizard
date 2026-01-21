# Delivery Object Deployment Guide

## Deployment Options

Since you don't see the SFDX deploy option in VS Code, here are the most efficient ways to deploy:

### Option 1: Salesforce CLI (Recommended - Fastest)
If you have Salesforce CLI installed, use the terminal:

```bash
# Navigate to your project root
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain

# Authenticate to your org (if not already done)
sfdx auth:web:login -a YourOrgAlias

# Deploy all metadata
sfdx force:source:deploy -p force-app -u YourOrgAlias

# Or deploy specific path
sfdx force:source:deploy -p force-app/main/default/objects/Delivery__c -u YourOrgAlias
```

### Option 2: VS Code Salesforce Extensions
1. Install Salesforce Extensions Pack if not already installed
2. Open Command Palette (Cmd+Shift+P)
3. Type: "SFDX: Authorize an Org" (if not authenticated)
4. Then: "SFDX: Deploy Source to Org"
5. Select the `force-app` folder

### Option 3: Change Sets (Most Reliable)
1. In Salesforce Setup → Deploy → Outbound Change Sets
2. Create New Change Set
3. Add components:
   - Custom Object: Delivery
   - All Custom Fields on Delivery
   - Custom Field: Delivery on Opportunity
   - Page Layout: Delivery Layout
   - Flow: Create Delivery on Opportunity Close
   - Flow: Auto Populate Delivery Account
   - Validation Rule: Actual Go-Live After Kickoff
   - Report Types: Deliveries with Opportunities, Deliveries with Accounts and Opportunities
4. Upload and Deploy

### Option 4: Workbench (For Quick Testing)
1. Go to workbench.developerforce.com
2. Login to your org
3. Migration → Deploy
4. Select the `force-app` folder as a ZIP
5. Deploy

## Recommended Approach
**Use Option 1 (Salesforce CLI)** - It's the fastest and most reliable for metadata deployment.

## Post-Deployment Steps
1. Complete Flow logic in Flow Builder (flows have basic structure)
2. Test the exclusion logic for Commitment + ARR/Project
3. Create reports in Salesforce UI
4. Update dashboard references
5. Configure security settings




