# Update Closed Won Alerts Flow

## Manual Steps Required

The "Closed Won Alerts" flow needs to be updated to pass the new `Products_Breakdown__c` field to the Platform Event.

### Step 1: Open Flow Builder
1. Go to **Setup → Flows**
2. Find and open **"Closed Won Alerts"** (should show as Active)
3. Click to edit

### Step 2: Update the Create Records Element
1. Click on the **"Publish Alert" / "Create Records"** element
2. In the panel on the right, find **"Set Field Values for the Closed Won Alert"**
3. Click **"+ Add Field"**
4. Select: **Products Breakdown** (Products_Breakdown__c)
5. Set Value to: **{!$Record.Products_Breakdown__c}** (from the triggering Opportunity)

### Step 3: Save and Activate
1. Click **Save**
2. If prompted, save as a **New Version**
3. Click **Activate** (if creating new version)

### Verification
After saving, the Create Records element should show:
- ACV → Triggering Opportunity > ACV
- Account Name → ...ng Opportunity > Account ID > Account Name
- Close Date → Triggering Opportunity > Close Date
- Eudia Counsel Opp → Triggering Opportunity > Eudia Counsel Opp
- Opportunity Name → Triggering Opportunity > Name
- Owner Name → Triggering Opportunity > Owner ID
- Product Line → Triggering Opportunity > Product Line
- **Products Breakdown → Triggering Opportunity > Products Breakdown** ← NEW
- Renewal Net Change → Triggering Opportunity > Net ACV
- Revenue Type → ... Opportunity > Recurring, Project, or Commit
- Sales Type → Triggering Opportunity > Sales Type

### Notes
- The `Products_Breakdown__c` field on Opportunity is auto-populated by the "Update Products Breakdown" flow when OpportunityLineItems are added/modified
- If no products are added, this field will be null/empty
- The GTM Brain code handles the fallback to single Product Line when Products Breakdown is empty

