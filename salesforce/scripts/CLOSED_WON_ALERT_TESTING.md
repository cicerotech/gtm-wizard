# Closed Won Alert Testing Guide

## Prerequisites

Before testing, complete these manual steps:

### 1. Update the Closed Won Alerts Flow (REQUIRED)
Follow the instructions in `UPDATE_CLOSED_WON_ALERTS_FLOW.md`:
1. Open Flow Builder → "Closed Won Alerts"
2. Add `Products_Breakdown__c` field to the Create Records element
3. Save and Activate new version

### 2. Ensure Products Breakdown Flow is Active
1. Go to Setup → Flows
2. Find "Update Products Breakdown"
3. Verify it shows as **Active**
4. If not, click to open and Activate

---

## Test Scenarios

### Test 1: Single Product Deal
1. Create or find an Opportunity with **one** product line item
2. Move to Stage 6. Closed(Won)
3. **Expected Slack Message:**
   ```
   *A Deal has been Won!*

   *Client:* Test Account
   *Deal Owner:* Your Name
   *Product Line:* AI-Augmented Contracting - In-House Technology
   *ACV:* $120,000
   *Sales Type:* New Business
   *Type:* Recurring
   *Close Date:* 2026-01-28
   ```

### Test 2: Multi-Product Deal
1. Create or find an Opportunity with **multiple** product line items
2. Move to Stage 6. Closed(Won)
3. **Expected Slack Message:**
   ```
   *A Deal has been Won!*

   *Client:* Plusgrade
   *Deal Owner:* Asad Hussain
   *ACV:* $288,000
     • AI-Augmented Contracting - In-House Technology: $120K
     • Sigma: $120K
     • Contracting - Secondee: $48K
   *Sales Type:* New Business
   *Type:* Recurring
   *Close Date:* 2026-01-31
   ```

### Test 3: Renewal/Expansion Deal
1. Create Opportunity with Sales Type = "Expansion" or "Renewal"
2. Set Net ACV to a positive or negative value
3. Close Won
4. **Expected:** Net Change line appears with +/- prefix

### Test 4: Confidential (Counsel) Deal
1. Create Opportunity linked to Counsel Account
2. Ensure Eudia_Council_Op__c = true
3. Close Won
4. **Expected:** Account name replaced with codename from Opp name

---

## Troubleshooting

### Products Breakdown Not Showing
- Verify `Products_Breakdown__c` is populated on the Opportunity (View record)
- Check "Update Products Breakdown" flow is Active
- Run the backfill script if needed:
  ```bash
  sf apex run --file salesforce/scripts/apex/updateProductsBreakdown.apex --target-org eudia-prod
  ```

### Platform Event Not Receiving Field
- Verify field was added to `Closed_Won_Alert__e` Platform Event
- Verify flow is passing the field value (check Flow debug logs)

### Slack Message Missing Products
- Check GTM Brain logs for incoming payload
- Verify `Products_Breakdown__c` is in the event payload

