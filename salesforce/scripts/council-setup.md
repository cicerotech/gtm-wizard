# Eudia Council Security Framework - Setup Guide

## Pre-Deployment Checklist

Before deploying, ensure you have:
1. Salesforce CLI (`sf`) installed and authenticated
2. Admin access to your Salesforce org

## Step 1: Authenticate to Salesforce

```bash
cd salesforce
sf org login web --set-default --alias eudia-prod --instance-url https://eudia.my.salesforce.com
```

Complete the browser authentication when prompted.

## Step 2: Deploy Metadata

**Already deployed via CLI:**
- ✅ Public Group: Eudia_Council_Leadership
- ✅ Account fields: Eudia_Council_Account__c, Code_Name__c, Account_Display_Name__c
- ✅ Opportunity fields: Eudia_Council_Op__c, Code_Name__c, Opportunity_Display_Name__c
- ✅ Flow: Council_Code_Name_Sync

**Manual deployment required (due to OWD dependencies):**
- ⚠️ Sharing Rules - must be created manually in Setup

To re-deploy if needed:

```bash
sf project deploy start --source-dir force-app/main/default/objects/Account --target-org eudia-prod
sf project deploy start --source-dir force-app/main/default/objects/Opportunity --target-org eudia-prod
sf project deploy start --source-dir force-app/main/default/groups --target-org eudia-prod
sf project deploy start --source-dir force-app/main/default/flows --target-org eudia-prod
```

## Step 3: Manual Configuration - Public Group Members

1. Go to **Setup → Users → Public Groups**
2. Find "Eudia Council Leadership" group
3. Add the following users:
   - Mitchell
   - Steven
   - Rina
   - Zach
   - Mike Flynn
   - (Add other leadership as needed)

## Step 3.5: Manual Configuration - Sharing Rules

The Account sharing rule must be created manually due to OWD settings dependencies:

1. Go to **Setup → Security → Sharing Settings**
2. Scroll down to "Account Sharing Rules"
3. Click "New"
4. Configure:
   - **Label**: Council Leadership Full Access
   - **Rule Name**: Council_Leadership_Full_Access
   - **Rule Type**: Based on criteria
   - **Criteria**: `Eudia_Council_Account__c` equals `True`
   - **Share with**: Public Group: "Eudia Council Leadership"
   - **Access Level**: Read/Write
5. Save

## Step 4: Manual Configuration - Profiles

### Profile 1: Eudia Council Restricted Sales
1. Go to **Setup → Profiles**
2. Clone "Standard Sales User" profile
3. Name it "Eudia Council Restricted Sales"
4. Under Field-Level Security for Account:
   - Set `Name` field to NOT visible (hidden)
   - Set `Account_Display_Name__c` to VISIBLE
   - Set `Code_Name__c` to VISIBLE
   - Set `Eudia_Council_Account__c` to VISIBLE
5. Save

### Profile 2: Standard Sales User
- No changes needed (current state)

### Profile 3: Eudia Sales Leadership
1. Clone "System Administrator" profile
2. Name it "Eudia Sales Leadership"
3. Remove destructive permissions:
   - Uncheck "Delete All Data"
   - Uncheck "Modify All Data" (except on Accounts, Opportunities, Contacts, Cases)
4. Ensure View All + Modify All on:
   - Accounts ✓
   - Opportunities ✓
   - Contacts ✓
   - Cases ✓
5. Under Field-Level Security for Account:
   - Set ALL fields to VISIBLE (including Name, Code_Name__c, Account_Display_Name__c)
6. Save
7. Assign to: Mitchell, Steven, Rina, Zach, Mike Flynn

## Step 5: Manual Configuration - Stage 5 Reactivation

1. Go to **Setup → Object Manager → Opportunity → Fields & Relationships**
2. Click on "Stage" field
3. Under "Opportunity Stages", add or reactivate:
   - **Stage Name**: Stage 5 - Negotiation
   - **Type**: Open
   - **Probability**: 75% (or your preferred value)
   - **Description**: Negotiation stage for deals in contracting
4. If using Sales Path:
   - Go to **Setup → Sales Path**
   - Edit your Opportunity path
   - Add "Stage 5 - Negotiation" between Stage 4 and Stage 6
   - Add guidance text for the negotiation stage

## Step 6: Page Layout Updates

1. Go to **Setup → Object Manager → Account → Page Layouts**
2. For each layout:
   - Add `Account_Display_Name__c` as a prominent field
   - Add `Eudia_Council_Account__c` checkbox
   - Add `Code_Name__c` field

3. Go to **Setup → Object Manager → Opportunity → Page Layouts**
4. For each layout:
   - Add `Opportunity_Display_Name__c` as a prominent field
   - Add `Code_Name__c` field

## Step 7: Grant Field-Level Security (if needed)

After deployment, if fields are not visible:
1. Go to **Setup → Object Manager → Account → Fields & Relationships**
2. For each new field (Eudia_Council_Account__c, Code_Name__c, Account_Display_Name__c):
   - Click on the field
   - Click "Set Field-Level Security"
   - Grant visibility to appropriate profiles

## Step 8: Configure Lightning Page with Component Visibility

This is the recommended approach - use a SINGLE page with conditional component visibility:

### In Lightning App Builder:

1. Go to **Setup → Lightning App Builder**
2. Find and edit "Account Record Page - Three Column" (or your active Account page)
3. Click on the **Account Highlights Panel** component in the left column
4. In the right panel, click **Set Component Visibility**
5. Click **Add Filter**
6. Configure:
   - **Field**: `Eudia_Council_Account__c`
   - **Operator**: `Equals`
   - **Value**: `False`
7. Click **Done**

### Add Council Highlights Component:

1. In the Components panel (left), search for "Council Highlights"
2. Drag it to the TOP of the left column (above or where Highlights Panel is)
3. Click on the Council Highlights component
4. Click **Set Component Visibility**
5. Add Filter:
   - **Field**: `Eudia_Council_Account__c`
   - **Operator**: `Equals`
   - **Value**: `True`
6. Click **Done**

### Hide Logo for Council Accounts:

1. Click on the **AccountLogo** component
2. Click **Set Component Visibility**
3. Add Filter:
   - **Field**: `Eudia_Council_Account__c`
   - **Operator**: `Equals`
   - **Value**: `False`
4. Click **Done**

### Save and Activate:

1. Click **Save**
2. Click **Activation**
3. Assign as Org Default (or by App/Profile as needed)

### Result:
- **Non-Council accounts**: See standard Highlights Panel + Logo + real Name
- **Council accounts**: See Council Highlights (Code Name) + no Logo

## Verification Checklist

- [ ] Account fields deployed: Eudia_Council_Account__c, Code_Name__c, Account_Display_Name__c
- [ ] Opportunity fields deployed: Code_Name__c, Opportunity_Display_Name__c
- [ ] Public Group created: Eudia Council Leadership
- [ ] Sharing Rule created: Council_Leadership_Full_Access
- [ ] Flow deployed and active: Council Code Name Sync
- [ ] Three profiles configured with correct FLS
- [ ] Stage 5 - Negotiation reactivated
- [ ] Page layouts updated

## Testing

1. Log in as a user with "Eudia Council Restricted Sales" profile
2. Create a test Council account:
   - Set `Eudia_Council_Account__c` = TRUE
   - Set `Code_Name__c` = "Project TestRedwood"
3. Verify the user sees "Project TestRedwood" instead of the real account name
4. Verify leadership users see both the real name and code name

