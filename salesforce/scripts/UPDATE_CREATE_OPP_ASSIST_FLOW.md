# Update Create Opp Assist v2 Flow

## Overview

This document describes the required changes to the existing "Create Opp Assist v2" flow to integrate with Opportunity Products.

## Current Behavior

The flow currently has a decision element "ACV Check" with:
- **Outcome: User_Provided_ACV** - When `ACV__c IS NOT NULL`
- **Default: use defaults** - When ACV is null, applies default values

## Required Changes

### Modified Decision Logic

Update the "ACV Check" decision to include a third outcome that checks for Products:

```
┌─────────────────────────────────────────────────────────┐
│                     ACV Check                            │
│                     Decision                             │
├─────────────────────────────────────────────────────────┤
│  Outcome 1: User_Provided_ACV                           │
│    Condition: ACV__c IS NOT NULL                        │
│    Action: Use user's ACV value (no changes)            │
│                                                         │
│  Outcome 2: Products_Provide_ACV  [NEW]                 │
│    Condition: Amount > 0 AND ACV__c IS NULL             │
│    Action: Set ACV__c = Amount                          │
│                                                         │
│  Default: use defaults                                  │
│    Action: Apply default ACV (existing behavior)        │
└─────────────────────────────────────────────────────────┘
```

### Step-by-Step Instructions

1. **Open Flow Builder**
   - Setup → Flows → Find "Create Opp Assist v2"
   - Click to edit

2. **Modify the ACV Check Decision**
   - Click on the "ACV Check" decision element
   - Add new outcome before "use defaults":
     - **Outcome Label:** `Products_Provide_ACV`
     - **Outcome API Name:** `Products_Provide_ACV`
     - **Condition Requirements:** All Conditions Are Met (AND)
     - **Conditions:**
       1. `{!$Record.Amount}` Greater Than `0`
       2. `{!$Record.ACV__c}` Is Null `True`

3. **Create Assignment Element for Products Path**
   - Add new Assignment element after `Products_Provide_ACV` outcome
   - **Label:** `Set ACV from Products`
   - **API Name:** `Set_ACV_from_Products`
   - **Assignment:**
     - Variable: `{!$Record.ACV__c}`
     - Operator: Equals
     - Value: `{!$Record.Amount}`

4. **Connect the Flow**
   - Connect `Products_Provide_ACV` → `Set ACV from Products` → (continue to existing flow)
   - Ensure `use defaults` path still applies the default ACV

5. **Test in Sandbox**
   - Create Opp without Products or ACV → Default ACV applied
   - Create Opp with Products (Add Line Items first) → ACV = Sum of line items
   - Create Opp with manual ACV entry → Manual value preserved

6. **Save and Activate**
   - Save as New Version
   - Activate

## Flow Diagram After Changes

```
┌─────────────────────┐
│       Start         │
│  Record Created     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Get Account      │
│    (existing)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     ACV Check       │
│     Decision        │
└──────────┬──────────┘
           │
     ┌─────┼─────────────────┐
     │     │                 │
     ▼     ▼                 ▼
┌─────────┐ ┌──────────────┐ ┌─────────────┐
│ User    │ │ Products     │ │ use defaults│
│ ACV     │ │ Provide ACV  │ │             │
└────┬────┘ └──────┬───────┘ └──────┬──────┘
     │             │                │
     │             ▼                │
     │      ┌──────────────┐        │
     │      │ Set ACV from │        │
     │      │ Products     │        │
     │      └──────┬───────┘        │
     │             │                │
     └─────────────┼────────────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  Close Date      │
          │  Decision        │
          │  (existing)      │
          └──────────────────┘
                   │
                   ▼
               Continue...
```

## Important Notes

1. **Order matters** - `User_Provided_ACV` must be checked FIRST
2. **Products can be added after Opp creation** - The separate `Sync_Products_to_ACV` flow handles this case
3. **This flow handles initial creation** - When Products are added during Opp creation (rare but possible via API)

## Validation

After making changes, verify:

| Test Case | Expected Result |
|-----------|-----------------|
| New Opp, no Products, no ACV entered | Default ACV applied |
| New Opp, Products added, no ACV entered | ACV = Sum of Products |
| New Opp, manual ACV entered | Manual ACV preserved |
| New Opp, Products added AND manual ACV | Manual ACV preserved (user wins) |

