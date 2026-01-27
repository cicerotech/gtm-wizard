# Eudia Council Security - Safe Implementation Guide

## Overview

This guide provides a **staged rollout approach** for the Council Security feature that anonymizes sensitive account names for non-leadership users. The approach uses **profile cloning** to ensure zero impact on users until explicitly activated.

---

## Current State (Already Deployed)

| Component | Status | Notes |
|-----------|--------|-------|
| Public Group: `Eudia_Council_Leadership` | ✅ Ready | 9 members configured |
| Account Field: `Eudia_Council_Account__c` | ✅ Deployed | Checkbox to mark sensitive accounts |
| Account Field: `Code_Name__c` | ✅ Deployed | Text field for anonymous name |
| Account Field: `Account_Display_Name__c` | ✅ Deployed | Formula: shows Code_Name if Council |
| Opportunity Field: `Eudia_Council_Op__c` | ✅ Deployed | Inherited from Account |
| Opportunity Field: `Code_Name__c` | ✅ Deployed | Synced from Account |
| Opportunity Field: `Opportunity_Display_Name__c` | ✅ Deployed | Formula field |
| Flow: `Council_Code_Name_Sync` | ✅ Deployed | Syncs code names to opportunities |
| Sharing Rule | ⏳ Manual | Needs to be created in Setup |

---

## Council Accounts & Code Names (18 Accounts)

| Code Name | Company Name |
|-----------|--------------|
| Pete | Peregrine |
| Sparky | Seyfarth |
| Nordy | Novelis |
| Goofy | Graybar |
| Albert | Amazon |
| Cosmo | Cox Media |
| Dinger | Del Monte |
| Fredbird | Fox |
| Clutch | Corebridge |
| Daisy | Duracell |
| Dory | DHL |
| Goldy | GE Vernova |
| Pluto | Petsmart |
| Eddie | Ecolab USA |
| Ace | American Express |
| Vic | Vista |
| Nemo | National Grid |
| Atari | JSRK dba Away |

**Note:** Plusgrade excluded (no code name assigned yet)

---

## Leadership Group Members (Already Configured)

**Group:** `Eudia_Council_Leadership`

| Member | Access Type |
|--------|-------------|
| Zach Huffstutter | Group Member |
| Riona Mchale | Group Member |
| Michael Flynn | Group Member |
| Mitch Loquaci | Group Member |
| Stephen Mulholland | Group Member |
| Paul Lacey Lacey | Manager of Group Member |
| Kepner Norris_Quint | Manager of Group Member |
| Kirby Dorsey | Manager of Group Member |
| Caroline Kelly | Manager of Group Member |

---

## Safe Rollout Phases

### Phase 1: Clone Profile (No User Impact)

**Objective:** Create a staging profile that mirrors production but can be configured separately.

**Steps:**
1. Setup → Profiles
2. Find `Eudia Standard Sales Profile`
3. Click Clone
4. Name: `Eudia Standard Sales - Council View`
5. Save

**Result:** New profile exists but NO users are assigned to it yet.

---

### Phase 2: Create Council-Specific Page Layouts

**Objective:** Create page layouts that show `Account_Display_Name__c` instead of real Account Name for Council accounts.

#### Option A: Lightning Component Visibility (Recommended)

1. Setup → Lightning App Builder
2. Edit the Account Record Page
3. Clone the page → Name: `Account Record Page - Council View`
4. On the cloned page:
   - Find the Account Name field/component
   - Add Visibility Rule: `Eudia_Council_Account__c` = FALSE (only show for non-Council)
   - Add new field `Account_Display_Name__c` 
   - Add Visibility Rule: `Eudia_Council_Account__c` = TRUE (only show for Council)
5. Save but DO NOT Activate yet

#### Option B: Separate Page Layout

1. Setup → Object Manager → Account → Page Layouts
2. Clone `Account Layout` → Name: `Account Layout - Council View`
3. Remove `Account Name` field from Details section
4. Add `Account_Display_Name__c` field in its place
5. Save

**Repeat for Opportunity object if needed.**

---

### Phase 3: Assign Page Layout to Cloned Profile

1. Setup → Object Manager → Account → Page Layouts
2. Click "Page Layout Assignment"
3. Click "Edit Assignment"
4. For profile `Eudia Standard Sales - Council View`:
   - Set Account Layout to `Account Layout - Council View`
   - Set Opportunity Layout to `Opportunity Layout - Council View` (if created)
5. Save

---

### Phase 4: Create Sharing Rule

1. Setup → Sharing Settings
2. Scroll to "Account Sharing Rules"
3. Click "New"
4. Configure:
   - **Label:** `Council Leadership Full Access`
   - **Rule Name:** `Council_Leadership_Full_Access`
   - **Rule Type:** Based on criteria
   - **Criteria:** `Eudia Council Account` equals `True`
   - **Share with:** `Eudia Council Leadership` (Public Group)
   - **Account Access:** Read/Write
   - **Opportunity Access:** Read/Write
   - **Case Access:** Read Only (or as needed)
5. Save

---

### Phase 5: Pilot Test (Single User)

**Objective:** Validate with one test user before wider rollout.

**Steps:**
1. Identify test user (suggest: your own account or a willing BL)
2. Setup → Users → Edit test user
3. Change Profile from `Eudia Standard Sales Profile` → `Eudia Standard Sales - Council View`
4. Save

**Test Checklist:**
| Test | Expected Result | Pass? |
|------|-----------------|-------|
| View non-Council account | Normal Account Name displayed | ☐ |
| View Council account (e.g., "Peregrine") | Shows "Pete" (code name) | ☐ |
| View Council opportunity | Shows code name, not real name | ☐ |
| Edit Council account fields | Normal editing works | ☐ |
| Search by code name | Account findable | ☐ |
| Reports using Display_Name | Code names appear | ☐ |

---

### Phase 6: Rollback Procedure (If Issues)

**To immediately revert a user:**
1. Setup → Users → Edit user
2. Change Profile back to `Eudia Standard Sales Profile`
3. Save

**To deactivate entire feature:**
1. Do not assign any users to `Eudia Standard Sales - Council View`
2. Delete the cloned profile (optional)
3. Sharing rule remains but has no effect if accounts aren't marked as Council

---

### Phase 7: Gradual Rollout

Once pilot is successful:
1. Migrate users in small batches (5-10 at a time)
2. Monitor for issues after each batch
3. Complete rollout over 1-2 weeks

---

## Apex Script: Populate Code Names

**Location:** `salesforce/scripts/apex/updateCouncilCodeNames.apex`

**⚠️ DO NOT RUN until:**
1. Profile cloning is complete
2. Page layouts are configured
3. Sharing rule is created
4. Pilot test is successful

**When ready, run:**
```bash
cd salesforce
sf apex run --file scripts/apex/updateCouncilCodeNames.apex --target-org eudia-prod
```

This script will:
- Mark 18 accounts as `Eudia_Council_Account__c = TRUE`
- Populate `Code_Name__c` with the assigned code names
- Trigger the `Council_Code_Name_Sync` flow to propagate to opportunities

---

## Post-Implementation Considerations

### Reports
- Update any customer-facing reports to use `Account_Display_Name__c`
- Internal leadership reports can still use `Account.Name`

### List Views
- Consider creating "Council Accounts" list view filtered by `Eudia_Council_Account__c = TRUE`

### Slack/GTM Brain
- The `blWeeklySummary.js` already has a helper for anonymized display names
- Verify Slack reports use display names for Council accounts

### Future Accounts
- When new sensitive accounts are identified:
  1. Check `Eudia Council Account` checkbox
  2. Enter Code Name
  3. Flow automatically propagates to opportunities

---

## Quick Reference: Who Sees What

| User Type | Non-Council Accounts | Council Accounts |
|-----------|---------------------|------------------|
| Leadership (in group) | Real Name | Real Name |
| Standard Sales (new profile) | Real Name | Code Name |
| Account Owner | Real Name | Real Name (via ownership) |
| System Admin | Real Name | Real Name |

---

*Last Updated: January 27, 2026*
*Status: Framework Ready - Awaiting Validation*

