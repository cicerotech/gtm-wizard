# Delivery Enhancement Setup Guide

The 5 new fields have been deployed. Complete these steps in Salesforce Setup to finish the configuration.

---

## Step 1: Set Field-Level Security (5 minutes)

### Quick Method - Profile Settings:

1. **Setup → Profiles → System Administrator**
2. Scroll to **Field-Level Security** section
3. Click on **Delivery**
4. Check **Visible** and **Editable** for these new fields:
   - Phase
   - Adoption Target %
   - Adoption Actual %
   - Efficiency Target %
   - Efficiency Actual %
5. Click **Save**
6. Repeat for any other profiles that need access (Sales, Delivery Team, etc.)

---

## Step 2: Update Delivery Page Layout (10 minutes)

1. **Setup → Object Manager → Delivery → Page Layouts**
2. Click on your layout (e.g., "Delivery Layout")
3. Reorganize into these sections:

### Section 1: Delivery Overview (2-column)
| Left Column | Right Column |
|-------------|--------------|
| Delivery Name | Status |
| Opportunity | **Phase** ← NEW |
| Account | Delivery Model |
| Product Line | Health Score |

### Section 2: Timeline (2-column)
| Left Column | Right Column |
|-------------|--------------|
| Kickoff Date | Target Go-Live Date |
| Actual Go-Live Date | |

### Section 3: Team (2-column)
| Left Column | Right Column |
|-------------|--------------|
| Eudia Delivery Owner | Client Sponsor |
| Johnson Hana Delivery Manager | |

### Section 4: Success Metrics (2-column) ← ADD THIS SECTION
| Left Column | Right Column |
|-------------|--------------|
| **Adoption Target %** ← NEW | **Adoption Actual %** ← NEW |
| **Efficiency Target %** ← NEW | **Efficiency Actual %** ← NEW |
| Time Savings Percent | Client Satisfaction Score |

### Section 5: Financials (2-column)
| Left Column | Right Column |
|-------------|--------------|
| Contract Value | Services Revenue Recognized |
| Planned JH Hours | Actual JH Hours |
| Utilization Percent | |

### Section 6: Rocketlane Integration (2-column, collapsed)
| Left Column | Right Column |
|-------------|--------------|
| Rocketlane Project ID | Rocketlane Project URL |
| Rocketlane Sync Status | Last Synced from Rocketlane |

### Section 7: Notes (full width)
| Field |
|-------|
| Expansion Opportunities |

4. Click **Save**

---

## Step 3: Configure Compact Layout (2 minutes)

1. **Setup → Object Manager → Delivery → Compact Layouts**
2. Click **New** (or edit existing)
3. Name: "Delivery Compact Layout"
4. Add these fields in order:
   - Delivery Name
   - Product Line
   - Status
   - Phase
   - Account
5. Click **Save**
6. Click **Compact Layout Assignment** → Set as primary

---

## Step 4: Add Deliveries Related List to Opportunity (3 minutes)

1. **Setup → Object Manager → Opportunity → Page Layouts**
2. Edit your Opportunity layout
3. Scroll to **Related Lists** section at the bottom
4. From the left palette, drag **Deliveries** to the Related Lists area
5. Click the wrench icon on the Deliveries related list
6. Configure columns to show:
   - Delivery Name
   - Product Line
   - Status
   - Phase
   - Health Score
   - Target Go-Live Date
7. Click **OK** then **Save**

---

## Step 5: Update Flow with Product-Specific Defaults (5 minutes)

1. **Setup → Flows → Create Delivery on Opp Close**
2. Click to edit the active version
3. Click on **Create_Delivery_Record** element
4. Add these new fields:

| Field | Value |
|-------|-------|
| Phase | Month 1 - Setup and Development |
| Adoption Target % | 100 (or use formula based on Product Line) |
| Efficiency Target % | 25 (or use formula based on Product Line) |

### For Product-Specific Defaults (Advanced):

Add a **Decision** element BEFORE Create_Delivery_Record:
- **Outcome: Sigma** → If Product Line = "Sigma" → Set Adoption Target = 60%
- **Outcome: Litigation** → If Product Line = "Litigation" → Set Adoption Target = 80%
- **Default Outcome** → Set Adoption Target = 100%

Or keep it simple: Set 100% / 25% as defaults and let the delivery team adjust.

5. Click **Save** and **Activate**

---

## Verification Checklist

- [ ] New fields visible on Delivery record
- [ ] Page layout organized into 7 sections
- [ ] Phase field appears in Overview section
- [ ] Success Metrics section shows all 4 adoption/efficiency fields
- [ ] Deliveries related list appears on Opportunity page
- [ ] New Delivery records get Phase = "Month 1 - Setup and Development"
- [ ] Compact layout shows key fields in list views

---

## Done!

Your Delivery object is now enhanced with:
- Phase tracking for the 3-month journey
- Adoption & Efficiency KPI tracking (Target vs Actual)
- Organized page layout
- Visibility from Opportunity record




