# Salesforce Field Cleanup Guide

## Overview

This guide documents the process for safely removing unused fields from Salesforce Opportunity and Account page layouts. Follow these steps in order to minimize risk.

---

## Quick Start Workflow

```
1. Run population analysis     → analyzeFieldPopulation.apex
2. Update tracker              → field-cleanup-tracker.csv
3. Run categorization          → node scripts/categorize-fields.js
4. Review SAFE candidates      → field-cleanup-recommendations.json
5. Remove from layouts         → Salesforce Setup (instructions below)
6. Wait 30 days                → Monitor for issues
7. Deactivate fields           → Object Manager (optional final step)
```

---

## Step 1: Run Population Analysis

1. Open Salesforce Developer Console:
   - Setup > Developer Console (or keyboard: Cmd+Shift+D on Mac)

2. Open Execute Anonymous Window:
   - Debug > Open Execute Anonymous Window

3. Copy and paste the contents of:
   ```
   salesforce/scripts/apex/analyzeFieldPopulation.apex
   ```

4. Click "Execute"

5. Open the Debug Log:
   - Debug > Open Execute Anonymous Window Results
   - Or: Logs > Open Log

6. Find the CSV output and copy it

---

## Step 2: Update the Tracker

1. Open `data/field-cleanup-tracker.csv` in a spreadsheet app (Excel, Google Sheets)

2. Update the following columns with data from the Apex script output:
   - `Population Count`
   - `Population %`

3. For each field with low population (<5%), check "Where Is This Used?" in Salesforce:
   - Object Manager > [Object] > Fields > [Field] > View Field Dependencies
   - Update the `In Flows`, `In Reports`, `In Formulas` columns

4. Save the file

---

## Step 3: Run Categorization

```bash
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain
node scripts/categorize-fields.js
```

Review the output:
- **KEEP**: Do not touch these fields
- **RISKY**: Need manual verification before removal
- **SAFE**: Can be removed from layouts (after final verification)
- **PENDING**: Need population data from Salesforce

---

## Step 4: Review SAFE Candidates

Before removing any fields, verify each SAFE candidate:

1. Open `data/field-cleanup-recommendations.json`
2. For each SAFE field:
   - [ ] Confirm population < 5%
   - [ ] Run "Where Is This Used?" in Salesforce
   - [ ] Verify no reports depend on it
   - [ ] Verify no formulas reference it
   - [ ] Check with business users if uncertain

---

## Step 5: Remove from Page Layouts

### Navigate to Page Layouts

**For Opportunity:**
1. Setup > Object Manager > Opportunity > Page Layouts
2. Click on your layout name (e.g., "Opportunity Layout")

**For Account:**
1. Setup > Object Manager > Account > Page Layouts
2. Click on your layout name (e.g., "Account Layout")

### Remove Fields from Layout

1. In the layout editor, find the field you want to remove
2. Drag it back to the field palette on the left (or click the X)
3. Repeat for all SAFE fields
4. Click **Save**

### Document Changes

Add an entry to the changelog below with:
- Date
- Field removed
- Reason
- Your name

---

## Step 6: Monitoring Period (30 Days)

After removing fields from layouts:

1. **Do NOT deactivate the fields yet**
   - Data is preserved
   - Fields can still be queried via API
   - Easy rollback if needed

2. **Monitor for issues:**
   - User complaints about missing fields
   - Report errors
   - Integration failures
   - Apex/Flow errors

3. **If issues arise:**
   - Re-add the field to the layout
   - Update the tracker with notes

---

## Step 7: Final Deactivation (Optional)

After 30 days with no issues, you may deactivate the fields:

1. Setup > Object Manager > [Object] > Fields & Relationships
2. Click on the field name
3. Click **Deactivate** (NOT Delete)

**Why deactivate instead of delete:**
- Preserves historical data
- Can be reactivated if needed
- No risk of breaking dependent metadata

---

## Field Removal Changelog

| Date | Field | Object | Action | Reason | By |
|------|-------|--------|--------|--------|-----|
| | | | | | |

---

## Files Created by This Process

| File | Purpose |
|------|---------|
| `salesforce/scripts/apex/analyzeFieldPopulation.apex` | Apex script to get field population stats |
| `scripts/analyze-field-dependencies.js` | Scans codebase for field references |
| `scripts/categorize-fields.js` | Categorizes fields based on usage |
| `data/field-cleanup-tracker.csv` | Master spreadsheet for tracking cleanup |
| `data/field-dependency-report.json` | JSON report of code dependencies |
| `data/field-dependencies-analysis.md` | Detailed dependency documentation |
| `data/field-cleanup-recommendations.json` | Categorized recommendations |
| `data/field-cleanup-guide.md` | This guide |

---

## Safety Checklist

Before removing ANY field from layouts:

- [ ] Population is < 5%?
- [ ] No code references in GTM Brain?
- [ ] No Flow dependencies?
- [ ] No Report dependencies?
- [ ] No Formula dependencies?
- [ ] No Validation Rule dependencies?
- [ ] Verified with "Where Is This Used?"?
- [ ] Business owner approval (if uncertain)?

---

## Rollback Procedure

If you need to restore a removed field:

### If field was removed from layout only:
1. Open the Page Layout
2. Find the field in the left palette
3. Drag it to the desired section
4. Save

### If field was deactivated:
1. Setup > Object Manager > [Object] > Fields
2. Change view filter to "All" or "Inactive"
3. Click on the field
4. Click "Activate"

### If field was deleted (not recommended):
- Cannot be recovered
- Historical data is lost
- This is why we always deactivate instead of delete

---

## Questions?

If you're unsure about removing a field, ask:
1. Is this field ever used in reports?
2. Does any automation depend on this field?
3. Will users miss this field?

When in doubt, leave it alone. Unused fields cost nothing, but removing needed fields can break things.

