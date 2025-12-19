# Flow Completion Instructions

## Create Delivery on Opportunity Close Flow

The flow has been created with basic structure and exclusion logic. You need to complete it in Flow Builder:

### Current Structure:
1. **Start Element**: Triggers on Opportunity After Save when StageName = "Closed Won"

### CRITICAL: Exclusion Logic Required
**You MUST add a Decision element immediately after Start to exclude Commitment + ARR/Project opportunities.**

### What You Need to Add:

#### Step 1: Exclusion Decision Element (CRITICAL)
**Add this FIRST before creating Delivery records:**

1. Add **"Decision"** element after Start
2. Name it: "Check Exclusion Criteria"
3. Add two outcome paths:
   - **Outcome 1**: "Exclude Commitment + ARR/Project"
     - Condition 1: `ForecastCategory` Equals `Commit`
     - Condition 2: `Revenue_Type__c` Equals `ARR` OR `Revenue_Type__c` Equals `Project`
     - Condition Logic: AND
     - Connector: → End Flow (no Delivery created)
   - **Outcome 2**: "Create Delivery" (default/otherwise)
     - Connector: → Continue to Step 2

#### Step 2: Create Delivery Record Element
After the decision element (when exclusion criteria is NOT met):

1. Add **"Create Records"** element
2. Name it: "Create Delivery Record"
3. Set Object: `Delivery__c`
4. Set field values:
   - `Opportunity__c` = `{!$Record.Id}`
   - `Account__c` = `{!$Record.AccountId}`
   - `Product_Line__c` = `{!$Record.Product_Line__c}`
   - `Contract_Value__c` = `IF(ISBLANK({!$Record.Amount}), {!$Record.ACV__c}, {!$Record.Amount})`
   - `Eudia_Delivery_Owner__c` = `{!$Record.OwnerId}`
   - `Status__c` = `"Planning"`
5. Store the created record ID in a variable: `deliveryId`

#### Step 2: Update Opportunity Element
After creating the Delivery record:

1. Add **"Update Records"** element
2. Name it: "Update Opportunity with Delivery"
3. Set Object: `Opportunity`
4. Set Record ID: `{!$Record.Id}`
5. Set field value:
   - `Delivery__c` = `{!deliveryId}` (the variable from Step 1)

#### Step 3: End Element
Add an **"End"** element after the update

### Final Flow Path:
```
Start (Closed Won) 
  → Decision (Check Exclusion)
    → [Excluded] → End (No Delivery)
    → [Not Excluded] → Create Delivery → Update Opportunity → End
```

## Auto Populate Delivery Account Flow

This flow needs completion:

### Current Structure:
1. **Start Element**: Triggers on Delivery Before Save

### What You Need to Add:

#### Step 1: Decision Element
1. Add **"Decision"** element
2. Name it: "Check if Account is Blank"
3. Condition: `ISBLANK({!$Record.Account__c})`
4. AND Condition: `NOT(ISBLANK({!$Record.Opportunity__c}))`

#### Step 2: Assignment Element
If Account is blank AND Opportunity is populated:

1. Add **"Assignment"** element
2. Name it: "Set Account from Opportunity"
3. Set `Account__c` = `{!$Record.Opportunity__c.AccountId}`

#### Step 3: End Element
Add an **"End"** element

### Final Flow Path:
```
Start (Before Save)
  → Decision (Account Blank?)
    → [Yes + Opportunity exists] → Assignment (Set Account) → End
    → [No] → End
```

## Testing After Completion

1. Create test Opportunity with StageName = "Closed Won", ForecastCategory = "Commit", Revenue_Type__c = "ARR"
   - **Expected**: No Delivery created
2. Create test Opportunity with StageName = "Closed Won", ForecastCategory = "Commit", Revenue_Type__c = "Project"
   - **Expected**: No Delivery created
3. Create test Opportunity with StageName = "Closed Won", ForecastCategory = "Commit", Revenue_Type__c = "Booking"
   - **Expected**: Delivery created
4. Create test Opportunity with StageName = "Closed Won", ForecastCategory = "Best Case", Revenue_Type__c = "ARR"
   - **Expected**: Delivery created
5. Create Delivery manually without Account but with Opportunity
   - **Expected**: Account auto-populated

