# Opportunity WoW Change Tracker — Design & Implementation Plan

**Date:** February 9, 2026  
**Status:** PLANNING — Awaiting approval  
**Objective:** Surface week-over-week Opportunity changes at a glance — on the record page, in list views/reports, and in a dedicated Pipeline Review view that replaces the manual weekly review document.

---

## Part 0: Flow Validation Summary

Before building anything new, here's the health check on existing Opportunity flows.

### Active Flows on Opportunity (13 total)

| # | Flow | Trigger | Fires On | Status |
|---|------|---------|----------|--------|
| 1 | Create Opp Assist v2 (`Test`) | BeforeSave | Create | OK |
| 2 | Sync ProductLine To Multi On Create | BeforeSave | Create | OK |
| 3 | Auto Assign Pod On Opp Create | BeforeSave | Create | OK |
| 4 | Next Steps History On Create | BeforeSave | Create | OK |
| 5 | Opp Update Sync | BeforeSave | Update | OK |
| 6 | Next Steps History On Update | BeforeSave | Update | OK |
| 7 | Target Close Date Sync | BeforeSave | Create+Update | OK |
| 8 | Default Opp Source For Existing Customer | AfterSave | Create | OK |
| 9 | Sync MultiSelect To Products | AfterSave | Create+Update | OK |
| 10 | Update Account Status Based on Opp Stages | AfterSave | Create+Update | **ISSUE** |
| 11 | Account Sync From Opp | AfterSave | Create+Update | OK |
| 12 | Set Customer Type On Closed Won | AfterSave | Create+Update | OK |
| 13 | Master Probability Handler | AfterSave | Create+Update | OK |
| 14 | Last Update Details | AfterSave | Update | OK (minor issue) |
| 15 | Weighted Change WoW and MoM | Scheduled (daily) | — | OK |

### CRITICAL: Duplicate Flow Still Active

`Update_Account_status_based_on_Opportunity_Stages` (#10) is **still active** but has been fully replaced by `Account_Sync_From_Opp` (#11). Both fire on the same trigger, query the same Account Opps, and write to `Account.Account_Status__c`. This means:

- Two separate Account lookups on every stage change
- Two separate DML updates to the same field
- Wasted governor limits; non-deterministic winner

**Action Required:** Deactivate `Update_Account_status_based_on_Opportunity_Stages` in the org via Tooling API.

### CRITICAL: Legacy Flows to Verify in Org

`Account_Sync_From_Opp` and `Master_Probability_Handler` each claim to replace legacy flows. The legacy flows exist in `temp_all_flows/` as Active status. If any remain active in the org:

| Legacy Flow | Replaced By | Risk if Still Active |
|-------------|-------------|---------------------|
| `Update_Type` | Account_Sync_From_Opp | Duplicate DML to `Account.Type__c` |
| `Update_Active_Accounts_NoType` | Account_Sync_From_Opp | Duplicate Account Status logic |
| `Forecast_Probabilities` | Master_Probability_Handler | Duplicate Probability DML + potential loop |
| `Auto_Update_Opp_Close_Date_and_Probability` | Master_Probability_Handler | Duplicate Name/CloseDate/Probability |
| `Update_Custom_Probability` | Master_Probability_Handler | Duplicate Probability logic |
| `Null_Probabilities_when_Closed_Won` | Master_Probability_Handler | Duplicate Probability logic |

**Action Required:** Verify via Tooling API query that all six are deactivated. If any are still active, deactivate them.

### MEDIUM: Redundant Name/CloseDate Logic

- `Master_Probability_Handler` (AfterSave) overwrites `Name` and `CloseDate` for Stage 0/1 transitions, duplicating what `Opp_Update_Sync` (BeforeSave) already sets.
- Not a bug (converges to same values), but wastes an AfterSave DML.
- **Future cleanup:** Move Stage 0/1 naming into `Opp_Update_Sync` and remove from `Master_Probability_Handler`.

### MEDIUM: `Last_Update_Details` Flow — Logic Concern

The `Stage_Change` decision rule checks `$Record__Prior.StageName EqualTo $Record.StageName` (true when stage did NOT change), and both paths lead to the same update node writing `Stage_Change` (a rule reference, not a formula). This flow may not be producing meaningful values in `Last_Update__c`. **Recommendation:** Replace with the new WoW tracking approach below.

### "Type" Field Concern — RESOLVED

No active flow references the standard Opportunity `Type` field. The flows reference:
- `Account.Type__c` — custom field, set by `Account_Sync_From_Opp` based on revenue type
- `Account.Customer_Type__c` — your authoritative field (values: New, Existing)
- `Account.Customer_Subtype__c` — your authoritative field (values: MSA, Pilot, LOI)

These are **separate fields with different purposes**:
- `Type__c` = derived classification from deal revenue type
- `Customer_Type__c` / `Customer_Subtype__c` = relationship classification (New/Existing + MSA/Pilot/LOI)

The WoW tracker design below uses `Customer_Type__c` and `Customer_Subtype__c` for account context, not `Type__c`.

### `Opportunity_Stage_Snapshot` Flow — Currently DRAFT

This flow creates `Stage_Snapshot__c` records on stage change. It is **not firing** (Draft status). We will activate and enhance it as part of this plan.

---

## Part 1: Data Foundation

### 1A. New Fields on Opportunity ("Prior Week Snapshot")

These fields get stamped once per week by a scheduled job, creating a rolling "last known state" baseline.

| Field API Name | Type | Purpose |
|----------------|------|---------|
| `Prior_Week_ACV__c` | Currency(16,2) | ACV as of last weekly snapshot |
| `Prior_Week_Stage__c` | Text(100) | Stage as of last weekly snapshot |
| `Prior_Week_Target_Sign__c` | Date | Target LOI/Sign date as of last snapshot |
| `Prior_Week_Forecast_Cat__c` | Text(50) | BL Forecast Category as of last snapshot |
| `Prior_Week_Owner__c` | Text(100) | Owner name as of last snapshot |
| `Prior_Week_Snapshot_Date__c` | Date | When the snapshot was taken |
| `Prior_Week_Probability__c` | Percent(3,0) | Probability as of last snapshot |

### 1B. Formula Fields on Opportunity ("WoW Deltas")

These calculate in real-time against the prior week snapshot.

| Field API Name | Type | Formula Logic |
|----------------|------|---------------|
| `ACV_WoW_Delta__c` | Currency | `ACV__c - Prior_Week_ACV__c` |
| `ACV_WoW_Pct__c` | Percent | `IF(Prior_Week_ACV__c > 0, (ACV__c - Prior_Week_ACV__c) / Prior_Week_ACV__c, null)` |
| `Stage_Changed_WoW__c` | Checkbox | `TEXT(StageName) != Prior_Week_Stage__c` |
| `Stage_Direction_WoW__c` | Text | `IF(Stage_Changed_WoW__c, Prior_Week_Stage__c & " → " & TEXT(StageName), "—")` |
| `Target_Date_Delta_Days__c` | Number | `Target_LOI_Date__c - Prior_Week_Target_Sign__c` (negative = pulled forward, positive = slipped) |
| `FC_Changed_WoW__c` | Checkbox | `TEXT(BL_Forecast_Category__c) != Prior_Week_Forecast_Cat__c` |
| `Any_Key_Change_WoW__c` | Checkbox | `OR(ACV_WoW_Delta__c != 0, Stage_Changed_WoW__c, Target_Date_Delta_Days__c != 0, FC_Changed_WoW__c)` |
| `WoW_Change_Score__c` | Number | Weighted score: stage advance +3, ACV increase +2, target slip -2, FC upgrade +1 (for sorting) |
| `WoW_Summary_Indicator__c` | Text(255) | Compact one-line summary, e.g., `"↑ ACV +$15k · Stage → SQO · Target ✓"` or `"No changes"` |

The `WoW_Summary_Indicator__c` formula (illustrative):

```
IF(NOT(Any_Key_Change_WoW__c), "No changes",
  IF(ACV_WoW_Delta__c > 0, "↑ ACV +" & TEXT(ROUND(ACV_WoW_Delta__c/1000, 0)) & "k", "") &
  IF(ACV_WoW_Delta__c < 0, "↓ ACV " & TEXT(ROUND(ACV_WoW_Delta__c/1000, 0)) & "k", "") &
  IF(Stage_Changed_WoW__c, " · Stage → " & TEXT(StageName), "") &
  IF(Target_Date_Delta_Days__c > 7, " · Target slipped " & TEXT(Target_Date_Delta_Days__c) & "d", "") &
  IF(Target_Date_Delta_Days__c < -3, " · Target pulled " & TEXT(ABS(Target_Date_Delta_Days__c)) & "d", "") &
  IF(FC_Changed_WoW__c, " · FC → " & TEXT(BL_Forecast_Category__c), "")
)
```

### 1C. Weekly Snapshot Scheduled Job

**Apex Class: `OpportunityWeeklySnapshotService`**

Runs every Sunday at 11 PM (before Monday morning review):

```
System.schedule('Opp Weekly Snapshot', '0 0 23 ? * SUN', new OpportunityWeeklySnapshotService());
```

Logic:
1. Query all open Opportunities (`IsClosed = false`)
2. For each: stamp `Prior_Week_ACV__c = ACV__c`, `Prior_Week_Stage__c = StageName`, etc.
3. Set `Prior_Week_Snapshot_Date__c = Date.today()`
4. Batch update (200 per batch to avoid governor limits from triggered flows)

This is simpler and more reliable than the existing `Weighted_Change_WoW_and_MoM` approach (which queries OpportunityHistory and is fragile). The existing WoW flow can remain for weighted ACV calculations; this new job handles the broader field snapshot.

### 1D. Activate & Enhance Stage_Snapshot__c Flow

Change `Opportunity_Stage_Snapshot` from Draft → Active and enhance:

**Current:** Fires only on Stage change  
**Enhanced:** Fire when StageName OR ACV__c OR Target_LOI_Date__c OR BL_Forecast_Category__c changes

Additional fields to capture in the snapshot:
- `Owner_Name__c` (Text) — who made the change
- `ACV_Delta__c` (Currency) — difference from prior snapshot

This gives a full audit trail per Opportunity, queryable for trend analysis and the LWC history view.

---

## Part 2: Record Page — "Change Pulse" LWC

### Component: `oppChangePulse`

A compact, visually clean card that sits in the Opportunity record page sidebar (right column of the 3-column layout). Designed to answer the question: **"What's different about this deal since last week?"**

### Layout

```
┌─────────────────────────────────────────────┐
│  CHANGES THIS WEEK            ● 3 changes   │
│─────────────────────────────────────────────│
│  ↑  ACV         $45,000 → $60,000  (+$15k) │ ← green
│  ↑  Stage       Discovery → SQO            │ ← green
│  ↓  Target Sign Feb 28 → Mar 15    (+15d)  │ ← red (slipped)
│  —  Forecast    Pipeline                    │ ← muted (no change)
│─────────────────────────────────────────────│
│  Account: Acme Corp                         │
│  Type: Existing · Subtype: MSA              │
│  Pod: US · Owner: Justin Hills              │
│─────────────────────────────────────────────│
│  ▸ Show 4-week trend                        │
│  Snapshot taken: Feb 2, 2026                │
└─────────────────────────────────────────────┘
```

### Visual Rules

| Condition | Color | Icon |
|-----------|-------|------|
| ACV increased | Green (#2e7d32) | ↑ |
| ACV decreased | Red (#c62828) | ↓ |
| Stage advanced | Green | ↑ |
| Stage regressed | Red | ↓ |
| Target date pulled forward | Green | ↑ |
| Target date slipped >7 days | Red | ↓ |
| Target date slipped 1-7 days | Amber (#f57f17) | → |
| Forecast Category upgraded | Green | ↑ |
| No change in field | Gray (#9e9e9e) | — |

### Expandable "4-Week Trend" Section

When expanded, queries `Stage_Snapshot__c` records for this Opportunity (last 4 weeks) and displays a mini timeline:

```
Week of    ACV      Stage       Target Sign
Feb 2      $60k     SQO         Mar 15
Jan 26     $45k     Discovery   Feb 28
Jan 19     $45k     Discovery   Feb 28
Jan 12     $30k     Qualifying  Feb 15
```

### Account Context Bar

Displays `Customer_Type__c` (New/Existing) and `Customer_Subtype__c` (MSA/Pilot/LOI) from the related Account, plus Pod and Owner — giving the reviewer immediate deal context without scrolling.

### Data Source

- Reads Opportunity fields directly (Prior_Week_* vs current values)
- Queries `Stage_Snapshot__c` for trend history
- Queries `Account` for Customer_Type__c, Customer_Subtype__c
- No Apex controller needed for basic view (use `@wire` with `getRecord`)
- Optional Apex for the trend query

### Placement

Drop into the existing `Opportunity_Record_Page_Three_Column2.flexipage-meta.xml` right column, above or below the existing WoW fields (`WoW_Change_Calc__c`, `WgtACV_7D_Prior__c`, etc.). The existing individual WoW fields can eventually be hidden since this component presents them better.

---

## Part 3: Pipeline Review Command Center (LWC)

This is the showpiece. A custom Lightning App Page that **replaces the manual weekly Pipeline Review document** with a live, interactive, conditionally formatted view.

### Component: `pipelineReviewCenter`

### Target Experience

The weekly Monday pipeline call currently uses a manually assembled Word document (see `Pipeline_Review_Summary_Feb2026.md`). This component auto-generates that same view, live from Salesforce data, with visual change indicators.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE REVIEW — Week of Feb 9, 2026                    [Filter ▾] [Export]   │
│                                                                                  │
│  ┌─── THIS WEEK'S HIGHLIGHTS ───────────────────────────────────────────────┐   │
│  │  ↑ 3 deals advanced stage   ↑ 2 deals with ACV increase (+$75k net)    │   │
│  │  ↓ 1 target date slip       ● 2 new deals added to pipeline            │   │
│  │  ★ 1 deal moved to Commit   ⚠ 1 deal at risk (stage regression)       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ─── By Owner ──────────────────────────────────────────────────────────────     │
│                                                                                  │
│  OLIVIA JUNG | Q1 Pipeline: $410k | WoW: +$55k                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ Account     │ Value   │ Δ ACV  │ Target  │ Δ Days│ Stage │ FC    │ WoW  │   │
│  │─────────────│─────────│────────│─────────│───────│───────│───────│──────│   │
│  │ Etsy        │ $55k    │ —      │ Feb 28  │  —    │ S4    │ Pipe  │  —   │   │
│  │ TE Connect  │ $120k   │ ↑+$20k│ Feb 15  │ -7d ↑│ S4    │ Comit │ ★    │   │
│  │ Graybar     │ TBD     │ —      │ Mar 2   │  —    │ S1    │ Pipe  │ NEW  │   │
│  │ Wellspan    │ $80k    │ —      │ Mar 30  │+14d ↓│ S2    │ Pipe  │ ⚠    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  JUSTIN HILLS | Q1 Pipeline: $320k | WoW: -$0                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ ...                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ─── February Revenue Priority Actions (auto-generated) ────────────────────    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Home Depot — Omar to contact Jocelyn (stalled 7+ days)               │   │
│  │ 2. Novelis — MSA redline delivery (target date this week)               │   │
│  │ 3. TE Connectivity — Verbal + paper process mapping                     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Column Definitions

| Column | Source | Conditional Formatting |
|--------|--------|----------------------|
| Account | `Account.Name` | Bold if `Customer_Type__c` = "New" |
| Value (ACV) | `ACV__c` | — |
| Δ ACV | `ACV_WoW_Delta__c` | Green text if positive, red if negative, hidden if 0 |
| Target | `Target_LOI_Date__c` | Red text if past due, bold if this month |
| Δ Days | `Target_Date_Delta_Days__c` | Green if pulled forward, red if slipped >7d, amber 1-7d |
| Stage | `StageName` (abbreviated) | Green badge if advanced WoW, red badge if regressed |
| FC | `BL_Forecast_Category__c` (abbreviated) | ★ icon if Commit, bold if Forecast |
| WoW | `WoW_Summary_Indicator__c` | Combined indicator: ★ = Commit, ⚠ = risk, NEW = created this week, — = no change |

### Row-Level Formatting

| Condition | Style |
|-----------|-------|
| Any positive change this week | Left green border (3px) |
| Any negative change this week | Left red border (3px) |
| No changes | No border (clean/white) |
| Deal created this week | Light blue background tint |
| Stage regression | Light red background tint |
| Target date slipped >14 days | ⚠ icon in WoW column |

### Filters

- **Owner**: Multi-select (defaults to all)
- **Pod**: US / EU / All
- **Stage Range**: Dropdown (S1+, S2+, S3+, S4+)
- **Changes Only**: Toggle to show only Opps with `Any_Key_Change_WoW__c = true`
- **Time Period**: This week / Last 2 weeks / This month

### "This Week's Highlights" Section

Auto-generated summary box at the top, calculated from the data:
- Count of stage advances
- Count of stage regressions
- Net ACV change
- New deals added (created this week)
- Deals moved to Commit
- Deals with target date slips >7 days

### Export

- **"Copy to Clipboard"**: Generates a clean markdown table (matching the Pipeline Review format) for pasting into Slack or docs
- **"Generate Review Doc"**: Calls the existing `generate_pipeline_doc.py` pattern to create the Word document

### Account Context

Each owner section header shows:
- Owner name
- Q1 Pipeline total (sum of ACV for their open Opps)
- WoW net change

Each row implicitly carries `Customer_Type__c` and `Customer_Subtype__c` context — visible on hover or in an expandable detail row.

### Data Source

**Apex Controller: `PipelineReviewController.cls`**

```java
@AuraEnabled(cacheable=true)
public static List<PipelineReviewRow> getPipelineReviewData(String pod, String ownerFilter, String stageMin) {
    // Query open Opportunities with Account context
    // Include: ACV, Prior_Week_ACV, Stage, Prior_Week_Stage, Target dates,
    //          Forecast Category, Owner, Pod, Account.Customer_Type__c,
    //          Account.Customer_Subtype__c, all WoW delta formula fields
    // Return structured list for the LWC
}
```

### Deployment

- Add as a Lightning App Page: "Pipeline Review"
- Add as a tab in the Sales app
- Accessible from the Opportunities app navigation

---

## Part 4: Standard Report/List View Enhancement

For users who still want to use standard Salesforce reports and list views (not the custom LWC), we add lightweight formula field columns.

### Fields to Add to Existing Reports

| Field | Purpose | Report Column Header |
|-------|---------|---------------------|
| `WoW_Summary_Indicator__c` | One-line change summary | "WoW Changes" |
| `WoW_Change_Score__c` | Sortable numeric score | "Change Score" |
| `Any_Key_Change_WoW__c` | Checkbox filter | "Changed This Week" |
| `ACV_WoW_Delta__c` | Raw ACV delta | "ACV Δ" |
| `Stage_Direction_WoW__c` | Stage movement text | "Stage Movement" |
| `Prior_Week_ACV__c` | Prior week baseline | "Prior Week ACV" |

### Recommended Report Modifications

Add to `Pipeline_by_Stage_ACV` and `Q1_BL_Commit_Pipeline_ACV`:

1. Add `WoW_Summary_Indicator__c` as the last column
2. Add `Any_Key_Change_WoW__c` as a filter option (user can toggle "Changed This Week = True")
3. Add `WoW_Change_Score__c` as a secondary sort (descending) to float most-changed deals to top

### List View: "Pipeline — Changed This Week"

Create a new list view filtered to `Any_Key_Change_WoW__c = True`, showing:
- Opp Name, Account, ACV, ACV Δ, Stage, Stage Movement, Target Sign, WoW Changes, Owner

This gives a quick "what moved" view without opening the custom LWC.

---

## Part 5: Implementation Sequence

### Phase 0: Flow Cleanup (prerequisite, ~30 min)

1. Deactivate `Update_Account_status_based_on_Opportunity_Stages` via Tooling API
2. Verify and deactivate any remaining legacy flows via Tooling API query
3. Deploy flow XML status changes to source control

### Phase 1: Data Foundation (~2 hours)

1. Create 7 `Prior_Week_*` custom fields on Opportunity
2. Create 9 WoW formula fields on Opportunity
3. Create `OpportunityWeeklySnapshotService.cls` scheduled Apex
4. Schedule the weekly job
5. Run initial snapshot (backfill current values into Prior_Week_* fields)
6. Activate `Opportunity_Stage_Snapshot` flow (change Draft → Active, add enhanced entry conditions)
7. Add `Owner_Name__c` and `ACV_Delta__c` to `Stage_Snapshot__c`

### Phase 2: Record Page Component (~3 hours)

1. Build `oppChangePulse` LWC (HTML, JS, CSS)
2. Build optional Apex controller for Stage_Snapshot__c trend query
3. Add component to `Opportunity_Record_Page_Three_Column2.flexipage-meta.xml`
4. Test on sample Opportunities

### Phase 3: Pipeline Review Center (~4 hours)

1. Build `PipelineReviewController.cls` Apex
2. Build `pipelineReviewCenter` LWC
3. Create Lightning App Page
4. Add to Sales app navigation
5. Wire up Export/Copy functionality

### Phase 4: Report & List View Updates (~30 min)

1. Add WoW formula fields to existing report layouts
2. Create "Pipeline — Changed This Week" list view
3. Update existing reports with WoW columns

### Phase 5: Polish & Handoff (~1 hour)

1. Add `Customer_Type__c` / `Customer_Subtype__c` context to Pipeline Review Center
2. Test all creation paths (Quick Action, Opp Tab, API)
3. Verify no flow conflicts from new scheduled job
4. Update flexipage to optionally hide redundant individual WoW fields

---

## Part 6: Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Weekly snapshot job fires flows | Use `Database.update()` with `DmlOptions.triggerOtherBeforeFlows = false` if available, or batch in small groups with try-catch |
| Formula field limits (Opportunity has many) | Audit current formula field count before adding; Salesforce limit is 500 per object |
| OpportunityHistory retention | Weighted_Change_WoW_and_MoM depends on OpportunityHistory which has retention limits; the new Prior_Week_* approach avoids this dependency |
| Governor limits on Pipeline Review query | Use `@AuraEnabled(cacheable=true)` and pagination; limit to open Opps only |
| Stage_Snapshot__c volume | Add retention policy (keep last 52 weeks per Opp); purge in scheduled job |

---

## Part 7: What This Replaces / Enhances

| Current State | New State |
|---------------|-----------|
| Manual Pipeline Review Word doc | Live Pipeline Review Center LWC |
| `WoW_Change_Calc__c` / `Weighted_ACV_WoW_Change__c` (individual fields on page) | `oppChangePulse` card (consolidated, visual) |
| `Last_Update_Details` flow (questionable logic) | Formula-based `WoW_Summary_Indicator__c` + `Stage_Snapshot__c` audit trail |
| `Weighted_Change_WoW_and_MoM` (OpportunityHistory-dependent) | `OpportunityWeeklySnapshotService` (direct field stamp, more reliable) |
| No conditional formatting in reports | Formula indicator columns + sortable change scores |
| Separate Slack summary calculations | Pipeline Review Center can be Slack-shared or exported |

---

## Appendix A: Field Mapping — Customer Type Context

Per user clarification, the authoritative Account classification fields are:

| Field | Object | Values | Purpose |
|-------|--------|--------|---------|
| `Customer_Type__c` | Account | New, Existing | Relationship classification |
| `Customer_Subtype__c` | Account | MSA, Pilot, LOI | Deal structure classification |
| `Type__c` | Account | (various) | Revenue type — derived by `Account_Sync_From_Opp` |

The Pipeline Review Center and `oppChangePulse` components will display `Customer_Type__c` and `Customer_Subtype__c` as the primary account context, not `Type__c`.

## Appendix B: Existing Infrastructure Leveraged

| Component | Current State | Role in This Plan |
|-----------|--------------|-------------------|
| `Stage_Snapshot__c` object | Exists, 7 fields defined | Activate flow; add fields for enhanced audit trail |
| `Opportunity_Stage_Snapshot` flow | Draft | Activate + enhance entry conditions |
| `Weighted_Change_WoW_and_MoM` flow | Active (daily) | Keep running for weighted ACV; new snapshot job handles broader fields |
| `PipelineSnapshotService.cls` | Active (weekly, BL-level) | Complements; our new job is Opp-level |
| `WgtACV_7D_Prior__c` / `WgtACV_30D_Prior__c` | Active on Opp | Keep; referenced by existing flexipage fields |
| `blWeeklySummary.js` (Slack) | Active | Can later be enhanced to pull from same Prior_Week_* fields |
| `generate_pipeline_doc.py` | Script exists | Pipeline Review Center export can call similar logic |
| Q1 2026 Snapshot fields | One-time, populated | Reference for quarterly tracking; new weekly snapshots complement |
| `Last_Update_Details` flow | Active | Can deactivate once WoW tracking is live (superseded) |
