# Strategic Action Plan - Systematic Implementation

## 🎯 **Core Principle: Interconnected Logic**

All features must share:
1. **Same field mappings** (one source of truth)
2. **Same validation rules** (product lines, stages, dates)
3. **Same error handling** (consistent "no results" messages)
4. **Same formatting logic** (dates, currency, stage names)

---

## 📋 **Immediate Fixes (Next 30 min)**

### **✅ COMPLETED:**
- [x] Date fields show Target_LOI_Date__c for active
- [x] Target queries exclude closed deals  
- [x] M&A mapped to "Augmented-M&A"
- [x] Litigation returns proper "not found" message

### **⏳ DEPLOYING NOW:**
- [ ] Litigation no-results message (wait 2-3 min)

---

## 🎯 **Next Priority Actions (In Order)**

### **Action #1: Weighted Pipeline Summary (30 min) - HIGHEST IMPACT**

**Why First:**
- Finance team needs this immediately
- Doesn't touch existing query logic
- Pure additive (new intent + formatter)
- Low risk, high value

**Implementation:**
```javascript
// 1. Add new intent detection
if (message.includes('weighted pipeline') || message.includes('weighted acv')) {
  intent = 'weighted_summary';
  return earlyWithHighConfidence();
}

// 2. New SOQL query
SELECT StageName,
       SUM(Amount) GrossAmount,
       SUM(Finance_Weighted_ACV__c) WeightedAmount,
       COUNT(Id) DealCount
FROM Opportunity
WHERE IsClosed = false
GROUP BY StageName

// 3. New formatter - clean summary table
*Weighted Pipeline Summary*
Total: $45.2M gross, $12.3M weighted (192 deals)

By Stage:
Stage 4 - Proposal: $13.5M gross → $4.2M weighted (15 deals)
Stage 2 - SQO: $23M gross → $6.1M weighted (85 deals)
...
```

**Testing:**
- "what's the weighted pipeline?" → summary
- "show me my pipeline" → still shows deals (unchanged)
- No interference with existing queries

**Time to deploy:** 2-3 min

---

### **Action #2: Product Line Consistency (15 min) - PREVENTS FUTURE BUGS**

**Why Second:**
- Fixes current M&A/Litigation issues
- Creates single source of truth for product lines
- Prevents future "no results" bugs

**Implementation:**
Create `src/constants/productLines.js`:
```javascript
const PRODUCT_LINES = {
  'contracting': 'AI-Augmented Contracting',
  'ai-augmented contracting': 'AI-Augmented Contracting',
  'm&a': 'Augmented-M&A',
  'mna': 'Augmented-M&A',
  'augmented-m&a': 'Augmented-M&A',
  'compliance': 'Compliance',
  'sigma': 'sigma',
  'cortex': 'Cortex',
  'multiple': 'Multiple'
};

const VALID_PRODUCT_LINES = [
  'AI-Augmented Contracting',
  'Augmented-M&A',
  'Compliance',
  'sigma',
  'Cortex',
  'Multiple',
  'Undetermined'
];

function mapProductLine(keyword) {
  const mapped = PRODUCT_LINES[keyword.toLowerCase()];
  if (mapped) return mapped;
  
  // Check if it's a valid exact match
  if (VALID_PRODUCT_LINES.includes(keyword)) return keyword;
  
  return 'NOT_FOUND';
}
```

**Use everywhere:**
- Intent parser
- Query builder
- Account field queries
- All share same logic

**Testing:**
- All product line queries
- "litigation" → proper message
- M&A variations all work

---

### **Action #3: Stage Name Normalization (10 min) - CRITICAL CONSISTENCY**

**Why Third:**
- "Stage 6. Closed(Won)" vs "Closed Won" inconsistency
- Need single source of truth
- Affects queries AND display

**Implementation:**
Create `src/constants/stages.js`:
```javascript
const STAGE_DISPLAY_MAP = {
  'Stage 6. Closed(Won)': 'Closed Won',
  'Stage 7. Closed(Lost)': 'Closed Lost',
  'Stage 6.Closed(Won)': 'Closed Won',
  'Stage 7.Closed(Lost)': 'Closed Lost'
};

const ACTIVE_STAGES = [
  'Stage 0 - Qualifying',
  'Stage 1 - Discovery',
  'Stage 2 - SQO',
  'Stage 3 - Pilot',
  'Stage 4 - Proposal'
];

const CLOSED_STAGES = [
  'Stage 6. Closed(Won)',
  'Stage 7. Closed(Lost)'
];

function isActiveStage(stageName) {
  return ACTIVE_STAGES.includes(stageName);
}

function isClosedStage(stageName) {
  return CLOSED_STAGES.includes(stageName) || 
         stageName.includes('Closed(Won)') || 
         stageName.includes('Closed(Lost)');
}
```

**Use everywhere:**
- Formatters
- Query builders
- Validation

---

### **Action #4: Date Field Logic Constants (10 min) - PREVENTS DATE BUGS**

**Why Fourth:**
- Centralizes "which date field to use" logic
- Currently scattered across multiple files
- One change updates everywhere

**Implementation:**
```javascript
function getDateField(queryContext) {
  // Closed deals → CloseDate
  if (queryContext.isClosed) return 'CloseDate';
  
  // Pipeline/Target queries → Target_LOI_Date__c
  if (queryContext.isTargetQuery || !queryContext.isClosed) {
    return 'Target_LOI_Date__c';
  }
  
  // Creation queries → CreatedDate or Week_Created__c
  if (queryContext.isCreationQuery) {
    return 'CreatedDate'; // or Week_Created__c for this week
  }
  
  return 'CloseDate'; // Default fallback
}
```

---

## 🚀 **Why This Order Saves Time:**

1. **Weighted Pipeline** (30 min) → Immediate business value
2. **Product Line Constants** (15 min) → Prevents future bugs in #1
3. **Stage Constants** (10 min) → Used by #1 and #2
4. **Date Constants** (10 min) → Used by all above

**Total: 65 minutes for bulletproof foundation**

Then all future features build on this solid base!

---

## 📊 **Interconnected Logic Strategy:**

### **Central Constants (src/constants/):**
- `productLines.js` - Single source for product mapping
- `stages.js` - Stage definitions and helpers
- `dateFields.js` - Date field selection logic
- `businessLeads.js` - BL list (used everywhere)

### **All Features Import From Constants:**
```javascript
const { mapProductLine, VALID_PRODUCT_LINES } = require('./constants/productLines');
const { cleanStageName, ACTIVE_STAGES } = require('./constants/stages');
const { getDateField } = require('./constants/dateFields');
```

**One change in constants → updates everywhere automatically!**

---

## ✅ **Current Deploy Status:**

Pushing litigation fix now, then implementing Action #1-4 systematically.

**Ready to proceed?** This approach ensures:
- No logic duplication
- No inconsistencies
- Easy to maintain
- Fast to add new features

🚀
