# Delivery Flow Setup Guide

## What Was Deployed

### New Opportunity Fields:
1. **Delivery__c** (Lookup) - Links Opportunity to its Delivery record
2. **Skip_Delivery_Creation__c** (Checkbox) - Override to prevent auto-creation

### Flow: Create Delivery on Opp Close (DRAFT)
- **Status**: Draft (inactive) - YOU control when to activate
- **Trigger**: Opportunity After Save
- **Entry Conditions**:
  - StageName = "Closed Won"
  - Skip_Delivery_Creation__c = false
  - Delivery__c is null (no existing Delivery)

## Complete the Flow in Flow Builder

### Step 1: Open the Flow
1. Go to Setup → Flows
2. Find "Create Delivery on Opp Close"
3. Click to open in Flow Builder

### Step 2: Add Exclusion Decision (CRITICAL)
After the Start element, add a Decision:

**Decision Name**: Check_Exclusion_Criteria

**Outcome 1: Exclude_Commitment_Recurring**
- Condition 1: {!$Record.ForecastCategory} Equals "Commit"
- Condition 2: {!$Record.Revenue_Type__c} Equals "ARR"
- Logic: All conditions must be true (AND)
- Route to: End (no Delivery created)

**Outcome 2: Exclude_Commitment_Project**
- Condition 1: {!$Record.ForecastCategory} Equals "Commit"
- Condition 2: {!$Record.Revenue_Type__c} Equals "Project"
- Logic: All conditions must be true (AND)
- Route to: End (no Delivery created)

**Default Outcome: Create_Delivery**
- Route to: Create Records element

### Step 3: Add Create Records Element
**Element Name**: Create_Delivery_Record

**Object**: Delivery__c

**Set Field Values**:
| Delivery Field | Value |
|----------------|-------|
| Opportunity__c | {!$Record.Id} |
| Account__c | {!$Record.AccountId} |
| Contract_Value__c | {!$Record.Amount} |
| Product_Line__c | {!$Record.Product_Line__c} |
| Eudia_Delivery_Owner__c | {!$Record.OwnerId} |
| Status__c | "Planning" |

**Store Output**: Store Delivery record ID in variable `newDeliveryId`

### Step 4: Add Update Records Element
**Element Name**: Update_Opportunity_With_Delivery

**Object**: Opportunity
**Record ID**: {!$Record.Id}

**Set Field Values**:
| Field | Value |
|-------|-------|
| Delivery__c | {!newDeliveryId} |

### Step 5: Connect and Save
1. Connect Start → Decision
2. Connect Decision (Default) → Create Records → Update Records → End
3. Connect Decision (Exclude outcomes) → End
4. Save the Flow

## Testing Process

### Test 1: Verify No Retroactive Triggers
1. Go to an existing Closed Won opportunity
2. Edit any field (not Stage) and save
3. Confirm NO Delivery was created

### Test 2: Test with New Close
1. Create a test Opportunity (or use existing open one)
2. Set Stage to "Closed Won"
3. Save
4. Verify Delivery record was created
5. Verify Opportunity.Delivery__c is populated

### Test 3: Test Override
1. Create another test Opportunity
2. Check "Skip Delivery Creation" checkbox
3. Set Stage to "Closed Won"
4. Save
5. Verify NO Delivery was created

### Test 4: Test Exclusion
1. Create test Opportunity with:
   - ForecastCategory = "Commit"
   - Revenue_Type__c = "ARR" or "Project"
2. Set Stage to "Closed Won"
3. Save
4. Verify NO Delivery was created

## Activation

After all tests pass:
1. Open the Flow
2. Click "Activate"
3. The flow is now live

## Troubleshooting

### Delivery not created?
- Check Skip_Delivery_Creation__c is unchecked
- Check Delivery__c is null
- Check exclusion criteria

### Need to create Delivery for existing Closed Won?
- Manually create Delivery record
- Link it to Opportunity via Delivery__c lookup

### Need to prevent creation for specific Opp?
- Check the "Skip Delivery Creation" checkbox before closing

## Future Enhancements

After Rocketlane is set up:
1. Add Platform Event after Delivery creation
2. Rocketlane listens for event and creates project
3. Rocketlane writes back Project ID and URL to Delivery record
4. Add scheduled sync for hours/status updates




