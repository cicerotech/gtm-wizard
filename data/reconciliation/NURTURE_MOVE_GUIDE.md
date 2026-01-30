# Nurture Move Guide - Ananth & Asad Accounts

**Date:** January 30, 2026

## Summary

43 accounts to be moved to Closed Lost (Nurture) with categorized reasons.

---

## Close Loss Reason Categories (Picklist)

Based on the notes, these are the buckets for `Closed_Lost_Reason__c`:

| Category | Count | Description |
|----------|-------|-------------|
| **Unresponsive** | 11 | Went cold, ghosting, stopped responding, no response to emails |
| **Never Met** | 12 | No meeting occurred, never connected |
| **Not Qualified** | 5 | Too small, limited budget, 1 lawyer |
| **Timing** | 5 | Too early in AI journey, not ready, consolidated AI elsewhere |
| **No Path to DM** | 4 | HOLO/DGC trap, no CLO access |
| **RFP Process** | 2 | Competitive RFP, went to RFP |
| **Competitor** | 2 | Built internal solution, cannot use non-DeepMind models |
| **Unknown** | 1 | Solventum - unclear |
| **Reassign Only** | 1 | CNA → Move to EU (Alex Fox/Conor Molloy) |

---

## Step 1: Run Query to Get Opportunity IDs

Run this in **Developer Console** → **Anonymous Apex**:

```
salesforce/scripts/apex/queryNurtureOpps.apex
```

This will output a CSV with all open opportunities for these accounts.

---

## Step 2: Update the CSV with IDs

Replace `QUERY_FOR_ID` in this file with actual Opportunity IDs:

```
data/reconciliation/nurture-moves-dataloader.csv
```

**Columns for Data Loader:**
- `Id` - Opportunity ID
- `StageName` - "Stage 7. Closed Lost"  
- `Closed_Lost_Reason__c` - One of the categories above
- `Closed_Lost_Detail__c` - Full text from BL notes
- `Closed_Lost_Date__c` - 2026-01-30

---

## Step 3: CNA Exception

CNA needs **reassignment only** (to Alex Fox or Conor Molloy), NOT stage change.

Create separate Data Loader file:
- Update `OwnerId` to EU team member
- Keep stage as-is

---

## Stage Picklist Question

⚠️ **The Nurture/Disqualified/Lost stage buckets have NOT been implemented yet.**

Currently, the flow is:
1. User moves deal to "Stage 7. Closed Lost"
2. User manually selects `Closed_Lost_Reason__c` (Nurture, Disqualified, Lost)

### What you asked for:
- Add **Nurture**, **Disqualified**, **Lost** as visible stage "buckets" at the top of the stage bar
- Make it easy for BLs to click directly vs going through "Closed Lost" first

### Why this is sensitive:
- Stage picklist changes affect **all historical reports**
- Stage progression formulas would need updates
- Existing Flows reference specific stage names
- Conversion rate calculations depend on stage values

### Recommended Safe Approach:
1. Keep "Stage 7. Closed Lost" as the technical stage
2. Add `Closed_Lost_Reason__c` values: **Nurture**, **Disqualified**, **Lost - No Budget**, **Lost - Timing**, etc.
3. Create a **Validation Rule** requiring reason when moving to Closed Lost
4. Use **Path component** on Opportunity layout to visually show the closed options

This preserves historical data while giving BLs the UX they want.

---

## Files Created

| File | Purpose |
|------|---------|
| `salesforce/scripts/apex/queryNurtureOpps.apex` | Query to get Opportunity IDs |
| `data/reconciliation/nurture-moves-dataloader.csv` | Data Loader template with reasons |
| `data/reconciliation/NURTURE_MOVE_GUIDE.md` | This guide |

---

## Next Steps

1. ☐ Run the Apex query to get Opportunity IDs
2. ☐ Update CSV with actual IDs
3. ☐ Verify `Closed_Lost_Reason__c` picklist has these values in org
4. ☐ Import via Data Loader
5. ☐ Handle CNA reassignment separately
6. ☐ Decide on stage bucket UI approach
