# Council Security - Quick Setup Checklist

**Status:** Framework deployed, ready for final configuration

---

## Deployed (Complete)

| Component | Status |
|-----------|--------|
| Council fields (Account + Opportunity) | ✅ Deployed |
| Council_Code_Name_Sync Flow | ✅ Deployed |
| councilHighlights LWC Component | ✅ Deployed |
| Eudia_Council_Leadership Group | ✅ Configured (9 members) |
| Code Names Apex Script (18 accounts) | ✅ Ready |

---

## Manual Steps Required

### Step 1: Clone Profile (5 min)

1. **Setup** → Quick Find: "Profiles"
2. Find **Eudia Standard Sales Profile**
3. Click the profile name to open it
4. Click **Clone**
5. Profile Name: `Eudia Standard Sales - Council View`
6. Click **Save**

**Result:** New profile created. No users assigned yet.

---

### Step 2: Create Sharing Rule (5 min)

1. **Setup** → Quick Find: "Sharing Settings"
2. Scroll down to **Account Sharing Rules**
3. Click **New**
4. Configure:
   - **Label:** `Council Leadership Full Access`
   - **Rule Name:** `Council_Leadership_Full_Access` (auto-fills)
   - **Rule Type:** Select "Based on criteria"
   - **Field:** `Eudia Council Account`
   - **Operator:** `equals`
   - **Value:** `True`
   - **Share with:** Public Group → `Eudia Council Leadership`
   - **Account Access:** `Read/Write`
   - **Opportunity Access:** `Read/Write`
5. Click **Save**

**Result:** Leadership group has access to all Council accounts.

---

### Step 3: Configure Lightning Page with Council Component (10 min)

1. **Setup** → Quick Find: "Lightning App Builder"
2. Click **New**
3. Select **Record Page** → Next
4. Label: `Account Record Page - Council View`
5. Object: **Account**
6. Clone from: Select your current Account Record Page → **Finish**
7. In the left panel, find **councilHighlights** under Custom Components
8. Drag `councilHighlights` to the top of the page (above Highlights Panel)
9. Click the **councilHighlights** component
10. On the right panel, click **Set Component Visibility**
11. Add filter: `Eudia_Council_Account__c` = `True`
12. Click **Done**
13. Now click the **Record Detail** or **Highlights Panel** component
14. Set visibility: `Eudia_Council_Account__c` = `False` (hide real name for Council)
15. Click **Save**
16. Click **Activation**
17. Click **Assign as Org Default** or assign to specific apps
18. **IMPORTANT:** Under "Form Factor", assign to the cloned profile only for testing

---

### Step 4: Assign Page to Cloned Profile (2 min)

1. In Lightning App Builder activation screen
2. Click **Assign to Apps, Record Types, and Profiles**
3. For profile `Eudia Standard Sales - Council View`:
   - Assign the new `Account Record Page - Council View`
4. Click **Save**

---

### Step 5: Pilot Test (5 min)

1. **Setup** → **Users**
2. Find your own user (or a test user)
3. Click **Edit**
4. Change **Profile** from `Eudia Standard Sales Profile` → `Eudia Standard Sales - Council View`
5. **Save**
6. Navigate to a Council account (e.g., Peregrine once code names are populated)
7. Verify you see "Pete" (code name) instead of "Peregrine"
8. Navigate to a non-Council account
9. Verify you see the real account name

---

### Step 6: Populate Code Names (When Ready)

After pilot test succeeds, run the Apex script:

```bash
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce
sf apex run --file scripts/apex/updateCouncilCodeNames.apex --target-org eudia-prod
```

This will:
- Mark 18 accounts as Council (`Eudia_Council_Account__c = TRUE`)
- Populate their Code Names
- Trigger the flow to sync to related Opportunities

---

## Rollback Procedure

**To revert a user:**
1. Setup → Users → Edit user
2. Change profile back to `Eudia Standard Sales Profile`
3. Save

**To disable feature entirely:**
- Simply don't assign users to the Council View profile
- Sharing rule has no effect if no accounts are marked as Council

---

## Summary

| Step | Action | Who |
|------|--------|-----|
| 1 | Clone profile | You (Salesforce UI) |
| 2 | Create sharing rule | You (Salesforce UI) |
| 3 | Configure Lightning page | You (Salesforce UI) |
| 4 | Assign page to profile | You (Salesforce UI) |
| 5 | Pilot test | You |
| 6 | Run Apex script | You (CLI) |
| 7 | Gradual user rollout | You (Salesforce UI) |

---

*Last Updated: January 27, 2026*

