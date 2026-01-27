# Eudia Council Security Setup - Manual Steps

## Overview

This framework anonymizes sensitive account names for restricted users while maintaining full access for leadership.

---

## Already Deployed (via CLI)

| Component | Status |
|-----------|--------|
| Public Group: `Eudia_Council_Leadership` | ✅ Deployed |
| Account Field: `Eudia_Council_Account__c` (Checkbox) | ✅ Deployed |
| Account Field: `Code_Name__c` (Text) | ✅ Deployed |
| Account Field: `Account_Display_Name__c` (Formula) | ✅ Deployed |
| Opportunity Field: `Eudia_Council_Op__c` (Checkbox) | ✅ Deployed |
| Opportunity Field: `Code_Name__c` (Text) | ✅ Deployed |
| Opportunity Field: `Opportunity_Display_Name__c` (Formula) | ✅ Deployed |
| Flow: `Council_Code_Name_Sync` | ✅ Deployed |

---

## Manual Steps Required

### Step 1: Add Members to Public Group

1. Setup → Users → Public Groups
2. Find "Eudia Council Leadership"
3. Click Edit
4. Add leadership users (VP Sales, RevOps, etc.)
5. Save

### Step 2: Mark Council Accounts

1. Go to each sensitive account
2. Check the "Eudia Council Account" checkbox
3. Enter a Code Name (e.g., "Project Alpha", "Project Beta")
4. Save

**OR run the Apex script:**
```bash
cd salesforce
sf apex run --file scripts/apex/updateCouncilCodeNames.apex --target-org eudia-prod
```

### Step 3: Create Sharing Rule (Manual - Cannot Deploy via CLI)

1. Setup → Sharing Settings
2. Scroll to Account Sharing Rules
3. Click "New"
4. Configure:
   - Rule Name: `Council_Leadership_Full_Access`
   - Rule Type: Based on criteria
   - Criteria: `Eudia_Council_Account__c` equals `True`
   - Share with: `Eudia Council Leadership` (Public Group)
   - Access Level: `Read/Write`
5. Save

### Step 4: Configure Page Layouts (Optional - For Restricted Profiles)

For profiles that should NOT see real account names on Council accounts:

**Option A: Component Visibility (Recommended)**
1. Lightning App Builder → Account Record Page
2. Add conditional visibility to Account Name component
3. Set: Show when `Eudia_Council_Account__c` = FALSE
4. Add `Account_Display_Name__c` field with opposite condition

**Option B: Separate Page Layout**
1. Create "Council Account Layout" without Name field
2. Assign to restricted profiles via Page Layout Assignment

### Step 5: Hide Logo on Council Accounts (Optional)

If using Account logo in Highlights Panel:
1. Lightning App Builder → Account Record Page
2. Select Highlights Panel component
3. Add visibility rule: Hide when `Eudia_Council_Account__c` = TRUE
4. Save and Activate

### Step 6: Reactivate Stage 5 - Negotiation (If Needed)

1. Setup → Object Manager → Opportunity → Fields & Relationships
2. Find "Stage" field
3. Click "Stage"
4. Add/reactivate: "Stage 5 - Negotiation"
5. Update Sales Processes to include Stage 5
6. Update Path settings if using Sales Path

---

## Testing Checklist

| Test | Expected Result |
|------|-----------------|
| Mark account as Council | Checkbox saves |
| Add Code Name to account | Field populates |
| Create opp on Council account | Opp inherits Council flag and Code Name |
| View Account_Display_Name__c | Shows Code Name (not real name) for Council accounts |
| Leadership user views Council account | Has full read/write access |
| Standard user views Council account | Access per normal sharing + page layout restrictions |

---

## How It Works

1. **Account marked as Council** → `Eudia_Council_Account__c` = TRUE
2. **Code Name entered** → `Code_Name__c` = "Project Alpha"
3. **Formula field evaluates** → `Account_Display_Name__c` shows "Project Alpha"
4. **Opportunity created** → Flow syncs `Eudia_Council_Op__c` and `Code_Name__c` from Account
5. **Sharing rule applies** → Leadership group gets Read/Write access
6. **Page layout restricts** → Standard users see Code Name instead of real Name

---

## Notes

- **Sales reps who own Council accounts** still have access via ownership
- **Opportunity team members** retain their assigned access
- **The real Account.Name is NOT deleted** - it's just hidden in certain views
- **Reports** should use `Account_Display_Name__c` for Council-safe exports

---

*Last Updated: January 27, 2026*
