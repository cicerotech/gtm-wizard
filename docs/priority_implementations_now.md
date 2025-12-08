# Priority Implementations - Execute NOW

**Time Frame:** Next 4 hours  
**Approach:** Surgical, production-focused, non-breaking

---

## PRIORITY 1: Fix Fallback Behavior (Finding 1.1, 1.4)

**Issue:** Unknown queries return pipeline instead of helpful error  
**Root Cause:** Default intent is `pipeline_summary` when no pattern matches

**Fix NOW:**
1. Change unknown query default intent from `pipeline_summary` to `unknown_query`
2. Return helpful message with suggested queries
3. Log failed queries for pattern learning

**Time:** 30 minutes  
**Files:** `src/ai/intentParser.js`

---

## PRIORITY 2: Semantic Query Matching (Finding 1.1)

**Issue:** "late stage contracting" works, "stage 4 contracting deals" doesn't  
**Root Cause:** Literal string matching

**Implementation:**
1. Add query similarity library (don't need full LLM)
2. Use simple fuzzy matching for common variations
3. Map synonyms: "stage 4" = "late stage", "contracting deals" = "contracting"

**Time:** 1 hour  
**Files:** Create `src/ai/querySimilarity.js`

---

## PRIORITY 3: In-Memory Caching (Finding 2.1)

**Issue:** Every query hits Salesforce, even duplicates  
**Solution:** 60-second in-memory cache

**Implementation:**
```javascript
const NodeCache = require('node-cache');
const queryCache = new NodeCache({ stdTTL: 60 });

// Before Salesforce query:
const cacheKey = md5(soqlQuery);
const cached = queryCache.get(cacheKey);
if (cached) return cached;

// After Salesforce query:
queryCache.set(cacheKey, result);
```

**Time:** 45 minutes  
**Impact:** 2x faster for duplicate queries, 50% less SF API load

---

## PRIORITY 4: Cache Invalidation on Writes (Finding 3.1)

**Issue:** Cache serves stale data after updates  
**Solution:** Invalidate related queries on write operations

**Implementation:**
- On account update: Clear all queries containing that account ID
- On opp update: Clear pipeline queries
- On reassign: Clear ownership queries

**Time:** 30 minutes  
**Integrates with:** Priority 3

---

## PRIORITY 5: Opportunity Field History (Finding 4.2)

**Issue:** Can't see who updated ACV or when Target Sign changed  
**Solution:** Query OpportunityFieldHistory

**New Queries:**
- "when was ACV updated for [Account]?"
- "who changed the target sign date for [Opp]?"
- "show me field history for [Account]"

**Implementation:**
```sql
SELECT Field, OldValue, NewValue, CreatedDate, CreatedBy.Name
FROM OpportunityFieldHistory
WHERE OpportunityId IN (SELECT Id FROM Opportunity WHERE Account.Name LIKE '%X%')
  AND Field IN ('ACV__c', 'Target_LOI_Date__c', 'StageName')
ORDER BY CreatedDate DESC
LIMIT 20
```

**Time:** 1 hour  
**Files:** Add to `src/salesforce/queries.js`, `src/ai/intentParser.js`, `src/slack/events.js`

---

## PRIORITY 6: Transaction Rollback (Finding 4.1)

**Issue:** If account creates but opp fails, orphaned account exists  
**Solution:** Compensating transactions

**Implementation:**
- Track operations in progress
- If failure, roll back previous steps
- Clear error messages about what succeeded/failed

**Time:** 45 minutes  
**Files:** `src/slack/events.js` - handleCreateOpportunity

---

## PRIORITY 7: Cross-Object Queries (Finding 1.3)

**New Query Patterns:**
- "accounts with opps but no activities in 30 days"
- "accounts missing account plans in Stage 2+"
- "accounts with multiple products"

**Implementation:** Add 5 most valuable cross-object patterns

**Time:** 1.5 hours  
**Files:** `src/ai/intentParser.js`, `src/salesforce/queries.js`

---

## Total Time: ~6 hours for all 7 priorities

**Approach:**
1. Start with fallback fix (30 min) - CRITICAL
2. Add caching (45 min) - Quick win
3. Implement semantic matching (1 hour) - Unlocks rigidity
4. Add field history (1 hour) - New capability
5. Cache invalidation (30 min) - Ties to #2
6. Transaction rollback (45 min) - Data integrity
7. Cross-object queries (1.5 hours) - Expand capabilities

**All non-breaking, production-safe, high-value improvements**

---

Ready to execute? I'll implement all 7 in the next session.

