# Flow Assessment & Strategy Guide

**Created:** 2026-01-27  
**Status:** Active Assessment

---

## 1. PERFORMANCE ASSESSMENT

### Flows Firing on Opportunity Save

| Flow | Trigger | Impact | Notes |
|------|---------|--------|-------|
| Next Steps History On Update | Before Save (Update) | LOW | Only fires when Next_Steps__c changes. No SOQL/DML. |
| Create Contract on Opp Close | After Save (Update) | MEDIUM | Only fires on Closed Won. Creates records. |
| Create Delivery on Close v8* | After Save (Update) | MEDIUM | Only fires on Stage change. Creates Delivery records. |
| Opportunity Stage Snapshot* | After Save (Update) | LOW | Only fires on Stage change. Creates snapshot record. |

*Exists in Production only (not in codebase)

### Flows Firing on OpportunityLineItem Save

| Flow | Trigger | Impact | Notes |
|------|---------|--------|-------|
| Update Products Breakdown | After Save | MEDIUM | Calls Apex to rebuild breakdown. Bulkified. |
| Sync Products to ACV | After Save | LOW | Simple field update, only if ACV is null. |
| Sync Products to ACV On Delete | After Delete | LOW | Only on delete, simple recalc. |

### Performance Observations

**Cumulative Impact:** When saving an Opportunity that:
1. Changes Next Steps → 1 flow fires
2. Changes Stage → 2-3 flows fire (Delivery, Snapshot, maybe others)
3. Hits Closed Won → Additional contract/alert flows fire

**Recommendation:** 
- Current setup is reasonable. Flows are scoped to specific conditions.
- If slow saves persist, check for:
  - Apex Triggers on Opportunity (not visible in Flow list)
  - Process Builders (legacy, should be converted)
  - Workflow Rules (legacy)
  - Validation Rules with expensive SOQL

**To Diagnose Slow Saves:**
1. Go to Setup → Debug Logs → Create a trace on your user
2. Reproduce the slow save
3. Download log → Search for "FLOW_START" and "FLOW_END" to see flow duration
4. Look for multiple flows firing in sequence

---

## 2. NEXT STEPS HISTORY FIX

### Problem
The `Next_Step_Eudia__c` field shows jumbled text like:
```
2026-01-27: Schedule follow-up<br>---<br>2026-01-26: Initial call
```

### Root Cause
Flow formulas using `BR()` output literal `<br>` HTML tags. Long Text Area fields display these as plain text, not rendered HTML.

### Solution Applied
Updated `Next_Steps_History_On_Update` flow to use **Text Template** instead of formula:
- Text Templates preserve actual newline characters
- The template uses `isViewedAsPlainText=true` for clean output

### Expected Output After Fix
```
2026-01-27: Schedule follow-up

---

2026-01-26: Initial call
```

---

## 3. DELIVERY AUTOMATION FOR MULTI-PRODUCT

### Current State
- **Your flow:** "Create Delivery on Close v8" (last saved 1/13/2026)
- **Behavior:** Creates single Delivery using `Product_Line__c` field

### New Capability Available
`DeliveryCreationService` (Apex) that:
1. Checks if Opportunity has OpportunityLineItems
2. If YES → Creates **one Delivery per product** with individual ACV
3. If NO → Falls back to single Delivery using `Product_Line__c` (legacy)
4. Skips creation if Deliveries already exist

### Integration Options

#### Option A: Replace Create Records with Apex Action (Recommended)
1. Open "Create Delivery on Close v8" in Flow Builder
2. Find the "Create Delivery Record" element
3. Delete it
4. Add new Action → Apex Action → "Create Deliveries from Opportunity"
5. Set input: Opportunity ID = `{!$Record.Id}`
6. Save as v9

**Pros:** One Delivery per product, automatic fallback
**Cons:** Requires flow modification

#### Option B: Keep Your Flow + Add Condition
1. Add Decision: "Has Products?"
2. Query OpportunityLineItems for this Opp
3. If count > 0 → Call Apex Action
4. If count = 0 → Use your existing Create Records

**Pros:** Minimal change to existing logic
**Cons:** More complex flow

#### Option C: Dual Flow Strategy
1. Keep your existing flow for legacy (no products)
2. Create new flow that calls Apex only when products exist
3. Add entry condition to your flow: `Amount = 0 OR Amount IS NULL`

**Pros:** No change to working flow
**Cons:** Two flows to maintain

### ⚠️ IMPORTANT: Do NOT Activate Both
If you choose Option A or B, you only need ONE flow. Having both your v8 flow AND a new Apex-based flow will create duplicate Deliveries.

---

## 4. FLOW ACTIVATION RECOMMENDATIONS

### ✅ ACTIVATE These Flows

| Flow | Reason | Action |
|------|--------|--------|
| **Update Products Breakdown** | Already Active. Populates `Products_Breakdown__c` field. | ✅ Done |
| **Next Steps History On Create** | Captures initial Next Steps on new Opps. | Activate now |
| **Opportunity Stage Snapshot** | Creates stage change history records. Useful for reporting. | Activate now |

### ⚠️ OPTIONAL - User Preference

| Flow | Reason | Decision Needed |
|------|--------|-----------------|
| **Sync Products to ACV** | Auto-sets `ACV__c` from product total when ACV is null. | If you want auto-population |
| **Sync Products to ACV On Delete** | Recalculates when products removed. | If you activate the above |
| **Council Code Name Sync** | Auto-syncs code names for Counsel accounts. | If you use Counsel feature |
| **Opportunity MEDDICC Template** | Pre-populates MEDDICC fields on create. | If you want templates |

### ❌ DO NOT ACTIVATE

| Flow | Reason |
|------|--------|
| **Opportunity Next Steps History** | OLD version that uses `BR()` function. Will create jumbled text. Keep `Next Steps History On Update` and `Next Steps History On Create` instead. |

---

## 5. ACTION PLAN

### Immediate Actions (Do Now)

1. **Deploy Next Steps fix:**
   ```bash
   sf project deploy start --source-dir force-app/main/default/flows/Next_Steps_History_On_Update.flow-meta.xml --target-org eudia-prod
   ```

2. **Activate Next Steps History On Create:**
   - Go to Setup → Flows
   - Find "Next Steps History On Create"
   - Click → Activate

3. **Activate Opportunity Stage Snapshot:**
   - Go to Setup → Flows
   - Find "Opportunity Stage Snapshot"  
   - Click → Activate

### Delivery Integration (Scheduled)

4. **Update "Create Delivery on Close v8":**
   - Open in Flow Builder
   - Add Decision: Check if `{!$Record.Amount} > 0` (has products)
   - If Yes → Use Apex Action "Create Deliveries from Opportunity"
   - If No → Use existing Create Records element
   - Save as v9

### Performance Monitoring

5. **Monitor for 1 week:**
   - Note any slow saves
   - Check Debug Logs if issues persist
   - Consider deactivating non-essential flows if needed

---

## 6. QUICK REFERENCE: Flow Dependencies

```
Opportunity Save
├── Next Steps changes? → Next Steps History On Update
├── Is Create? → Next Steps History On Create  
├── Stage changes? → Opportunity Stage Snapshot
├── Stage = Closed Won? → Create Contract on Opp Close
│                       → Create Delivery on Close v8
│                       → Closed Won Alert (Platform Event)
└── Council Account? → Council Code Name Sync

OpportunityLineItem Save
├── Create/Update → Update Products Breakdown
├── Create/Update → Sync Products to ACV (if ACV null)
└── Delete → Sync Products to ACV On Delete
          → OpportunityLineItemTrigger (Apex)
```

---

## 7. DEACTIVATION GUIDE

If you need to reduce flow load:

**Safe to Deactivate (low impact):**
- Opportunity Stage Snapshot (only affects reporting)
- Council Code Name Sync (only affects Counsel accounts)
- Opportunity MEDDICC Template (only affects new Opp creation)

**Do NOT Deactivate:**
- Next Steps History On Update (core functionality)
- Create Delivery on Close v8 (revenue operations critical)
- Create Contract on Opp Close (contract generation)
- Update Products Breakdown (product tracking)

---

*Document maintained by GTM Brain*

