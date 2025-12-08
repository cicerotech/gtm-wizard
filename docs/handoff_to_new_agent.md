# GTM-Brain Project Handoff - Copy This Entire Prompt

**DO NOT MODIFY THIS PROJECT WITHOUT EXPLICIT REQUEST.**  
**APPROACH: Surgical improvements only. Production system serving 41 users.**

---

## Project Context

You are continuing work on **GTM-Brain** (also called GTM-Wizard), a Slack-based AI agent that provides conversational access to Salesforce data for a legal AI startup (Eudia, Series A).

**What it is:** Node.js/Express application deployed on Render that translates natural language queries in Slack into Salesforce API calls, returning formatted results. Think of it as "Salesforce for people who don't want to use Salesforce."

**Current state:** Production system with 50+ working capabilities, ~11,500 lines of production code, proven $576K/year ROI, serving 41 team members.

**Your role:** Continue development with same surgical, production-focused approach used in prior session.

---

## Critical Files to Read FIRST

**Before making ANY changes, read these files to understand what's been built:**

1. **`FINAL_SESSION_STATUS.md`** - Complete session summary, what works, what doesn't
2. **`DASHBOARD_FINAL_FIX_NEEDED.md`** - EXACT TASK you need to complete (Account Plans tab)
3. **`GTM_BRAIN_ENHANCEMENT_ASSESSMENT.html`** - 23 findings, strategic improvements
4. **`COMPLETE_PROJECT_HANDOFF.md`** - Original project documentation
5. **`EINSTEIN_ACTIVITY_DATA_GAP_ASSESSMENT.html`** - Meeting data strategy

**Architecture files:**
- `src/app.js` - Main Express application
- `src/ai/intentParser.js` - Query pattern matching (deterministic, not LLM-driven)
- `src/slack/events.js` - Message handlers and business logic
- `src/slack/accountDashboard.js` - **CURRENT TASK** - Account Plans tab to fix
- `src/salesforce/queries.js` - SOQL query builder
- `src/salesforce/connection.js` - SF OAuth connection

---

## What's Working (DO NOT BREAK THESE)

### Core Capabilities (47+)
- Account ownership queries ("who owns Intel?")
- Pipeline queries by stage/product ("late stage contracting")
- LOI/ARR tracking
- Contract queries with PDF downloads
- Weighted pipeline summaries
- Account creation with auto-assignment (geography + workload)
- Opportunity creation (smart defaults + custom values)
- Account plans (save/query structured templates)
- Customer Brain notes (meeting summaries)
- Post-call AI summaries (Socrates structuring)
- Account reassignment
- Excel report generation (sorted Stage 4 first)
- **Account Status Dashboard** (web endpoint at `/dashboard`)

### Critical Business Logic (NEVER CHANGE)
- Field names: `Target_LOI_Date__c`, `Finance_Weighted_ACV__c`, `ACV__c`, `Revenue_Type__c`
- Revenue Type values: `ARR` (not "Recurring"), `Booking`, `Project`
- Business Leads list: Julie Stefanich, Himanshu Agarwal, Asad Hussain, Ananth Cherukupally, David Van Ryk, John Cobb, Jon Cobb, Olivia Jung
- Stage names: "Stage 0 - Qualifying" through "Stage 4 - Proposal"
- Product lines: AI-Augmented Contracting, Augmented-M&A, Compliance, sigma, Cortex, Multiple

### Recent Improvements
- ✅ Fallback behavior fixed (unknown queries don't return random pipeline)
- ✅ In-memory caching (2x faster responses, 50% less SF API load)
- ✅ Account name proper casing (`toProperCompanyCase` function)
- ✅ Einstein Activity integration (meeting dates from calendar sync)
- ✅ Customer Type badges on accounts
- ✅ Legal contacts extracted from Event attendees

---

## IMMEDIATE TASK: Fix Account Plans Tab

**Location:** `src/slack/accountDashboard.js` starting around line 377

**Current state:** Account Plans tab has complex expandable `<details>` elements, yellow background fills, and doesn't match the clean structure of Summary tab.

**What you need to do:**

### Step 1: Look at Summary Tab Structure (lines 304-339)
```html
<div class="stage-section">
  <div class="stage-title">Late Stage (12)</div>
  <div class="account-list">
    <div class="account-item">
      <div class="account-name">CHS</div>
      <div class="account-owner">Olivia Jung • 1 opp</div>
    </div>
    [repeat for top 5]
    <div>+7 more...</div>
  </div>
</div>
```

### Step 2: Replace Account Plans Tab (lines 377+) to Match EXACTLY

**Remove:**
- All `<details>` and `<summary>` tags
- Yellow background fills (`background: #fef3c7`)
- Red background fills (`background: #fef2f2`)  
- Green/blue detail boxes
- Complex nested divs
- Search box (already removed)

**Replace with:**
```html
<!-- TAB 3: ACCOUNT PLANS -->
<div id="account-plans" class="tab-content">
  <div class="stage-section">
    <div class="stage-title">Account Plans & Pipeline</div>
    <div class="stage-subtitle">2 have plans • 116 need plans (recently initiated)</div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Top 10 Accounts (by ACV)</div>
    <div class="account-list">
      ${Array.from(accountMap.values())
        .sort((a, b) => b.totalACV - a.totalACV)
        .slice(0, 10)
        .map(acc => {
          const planIcon = acc.hasAccountPlan ? '📋 ' : '';
          const lastDate = meetingData.get(acc.accountId)?.lastMeeting 
            ? new Date(meetingData.get(acc.accountId).lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) 
            : null;
          const customerType = !acc.isNewLogo && acc.customerType ? \`[\${acc.customerType}]\` : '';
          
          return \`
          <div class="account-item">
            <div class="account-name">\${planIcon}\${acc.name} \${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : customerType}</div>
            <div class="account-owner">\${acc.owner} • Stage \${acc.highestStage} • \${acc.opportunities.length} opp\${acc.opportunities.length > 1 ? 's' : ''}\${lastDate ? ' • Last: ' + lastDate : ''}</div>
          </div>
          \`;
        }).join('')}
      <div class="account-item" style="color: #6b7280; font-style: italic;">+${accountMap.size - 10} more accounts</div>
    </div>
  </div>
</div>
```

### Step 3: Remove Unused JavaScript

Delete the search script at bottom (lines 481+ with `filterAccountList` function) since we removed the search box.

### Step 4: Test Immediately

Deploy and verify Account Plans tab looks EXACTLY like Summary tab - clean compact list, no yellow, no complexity.

---

## Approach & Philosophy

**Production-First:**
- System serves 41 real users
- Stability > Features always
- Test before deploying
- Never break existing functionality

**Surgical Improvements:**
- Only change what's explicitly requested
- Preserve all working logic
- Reference existing patterns in codebase
- Use same field names, query structures

**Fast Iteration:**
- User works quickly, expects updates in hours not weeks
- Make changes, deploy, test immediately
- No over-engineering or premature optimization

**Key Principles:**
1. **Deterministic over AI** - System uses hardcoded pattern matching (intentParser.js), not LLM routing. This is intentional for reliability.
2. **Accuracy over flexibility** - For sales ops, 100% correct > 98% flexible
3. **Reference existing logic** - When adding features, find similar functionality and copy patterns
4. **Field names matter** - Salesforce field names are exact, case-sensitive, and critical

---

## Current System Architecture

**Flow:** Slack message → Intent parser (pattern matching) → Query builder → Salesforce API → Response formatter → Slack

**NOT:** Slack → LLM → Tool selection → Execution  
**IS:** Slack → Hardcoded patterns → Direct SF queries

**Why:** Legal AI context requires reliability. Can't have AI hallucinating account assignments or revenue numbers.

---

## Known Issues & Outstanding Work

### Critical (Fix First)
1. **Account Plans tab** - Needs to match Summary tab structure (YOUR IMMEDIATE TASK)
2. **Clay enrichment** - API endpoint `/v1/companies/enrich` deprecated, need correct endpoint
3. **Einstein Activity data gaps** - Many accounts show "No meetings" because Events not linked to AccountId (backfill needed, see EINSTEIN_ACTIVITY_DATA_GAP_ASSESSMENT.html)

### High Priority (Do Soon)
4. Semantic query matching (unlock rigidity) - 20h effort, high impact
5. Queryable audit log (SOC 2 requirement) - 30h effort
6. Field history tracking (who/when updated ACV, Target_LOI_Date__c) - 1h effort

### Medium Priority
7. Cache invalidation on writes - 30min
8. Cross-object queries - 1.5h
9. Batch operations - 35h

---

## Testing Protocol

**After ANY code change:**
1. Commit and push to GitHub (triggers Render auto-deploy)
2. Wait 2-3 minutes for deployment
3. Test in Slack: `@gtm-brain [query]`
4. Check Render logs if issues
5. Verify no existing features broken

**For dashboard changes:**
1. Test: `@gtm-brain gtm` in Slack
2. Click dashboard link
3. Test all 3 tabs (Summary, By Stage, Account Plans)
4. Check on mobile (phone simulator or actual device)
5. Verify matches design requirements

---

## Critical Field Mappings (DO NOT CHANGE)

**Opportunity fields:**
- `Target_LOI_Date__c` - Target sign date (NOT Target_Sign_Date__c)
- `ACV__c` - Annual contract value
- `Finance_Weighted_ACV__c` - Weighted ACV
- `Revenue_Type__c` - Values: ARR, Booking, Project (NOT "Recurring")
- `Product_Line__c` - Exact values required
- `StageName` - "Stage 1 - Discovery" format

**Account fields:**
- `Account_Plan_s__c` - Account plans
- `Customer_Brain__c` - Meeting notes
- `Linked_in_URL__c` - LinkedIn URL (exact spelling)
- `Rev_MN__c` - Revenue in millions
- `State__c` - State code or country name
- `Region__c` - West/Northeast/Midwest/Southwest/Southeast/International

**Event fields (Einstein Activity):**
- `AccountId` - Links events to accounts
- `ActivityDate` - Date of meeting
- `Subject` - Meeting title
- `Who.Title` - Contact job title (filter for CLO, GC, AGC, VP Legal, etc.)

---

## User Communication Style

**User expectations:**
- Wants updates in hours, not days/weeks
- Expects surgical precision
- Values production stability
- Appreciates honest assessments
- Works iteratively (build, test, refine)

**When user says "fix this":**
1. Acknowledge what's wrong
2. Explain root cause briefly
3. Implement fix immediately
4. Deploy and ask for testing
5. Don't over-explain, just fix it

**When stuck:**
- Be honest about what's not working
- Provide 2-3 solution options
- Ask which approach to take
- Don't guess or make assumptions

---

## Deployment Process

**Local → Production:**
1. Make changes in VSCode/Cursor
2. `git add -A`
3. `git commit -m "[TYPE] description"`
4. `git push origin main`
5. Render auto-deploys in 2-3 minutes
6. Check https://dashboard.render.com/ for logs if issues

**Environment variables in Render:**
- All Slack tokens
- Salesforce OAuth credentials
- `CLAY_API_KEY=994eefbafaf68d2b47b4` (set but endpoint deprecated)
- Socrates/OpenAI key for AI summaries

---

## Key Learnings from Prior Session

1. **Content Security Policy** - Render blocks inline scripts. For dashboard, added CSP header to allow scripts: `res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");`

2. **Einstein Activity** - Events link via `AccountId` (not WhatId). Many accounts have no meetings showing because Events were created before Accounts (order of operations issue).

3. **Weighted Pipeline** - Uses `SUM(Finance_Weighted_ACV__c)` NOT `SUM(ACV__c)`. Query must GROUP BY StageName.

4. **Dashboard Tabs** - Pure CSS tabs using hidden radio buttons + `:checked` selector (no JavaScript needed for tab switching).

5. **Account Name Casing** - Created `toProperCompanyCase()` function to handle "levi strauss" → "Levi Strauss", "ikea" → "IKEA", etc.

6. **No Mock Data** - Don't use hardcoded enrichment unless explicitly for testing. Be honest about what's real data vs mock.

---

## Immediate Next Steps (In Order)

### Task 1: Complete Account Plans Tab Fix (30 min)

**File:** `src/slack/accountDashboard.js` line 377+

**What to do:**
- Replace complex `<details>` structure with simple `.account-item` divs
- Match Summary tab EXACTLY (copy structure from lines 304-339)
- NO yellow fills, NO expandable details
- Show top 10 accounts with plan emoji (📋) inline
- Format: Name, Owner, Stage, Opps, Last meeting date

**Reference:** `DASHBOARD_FINAL_FIX_NEEDED.md` has exact structure

### Task 2: Test Dashboard End-to-End (15 min)

**Command:** `@gtm-brain gtm` in Slack

**Verify:**
- Summary tab: Shows metrics + top 5 per stage
- By Stage tab: Shows breakdowns by stage/BL/product
- Account Plans tab: Clean list matching Summary structure
- All tabs work on mobile
- No JavaScript errors in console

### Task 3: Address User Feedback (Ongoing)

**If user reports issues:**
- Check Render logs immediately
- Identify root cause
- Fix surgically
- Deploy and test

---

## Code Patterns to Follow

### When Adding New Queries

**1. Add intent detection** (`src/ai/intentParser.js`):
```javascript
if (message.includes('your pattern')) {
  intent = 'your_intent_name';
  entities.yourField = extractedValue;
  return { intent, entities, ... };
}
```

**2. Add handler** (`src/slack/events.js`):
```javascript
} else if (parsedIntent.intent === 'your_intent_name') {
  await handleYourFeature(params);
  return;
}
```

**3. Build query** (use existing patterns from `src/salesforce/queries.js`)

**4. Format response** (clean, concise, mobile-friendly)

### When Querying Salesforce

**Always:**
- Use exact field API names
- Escape quotes: `const escapeQuotes = (str) => str.replace(/'/g, "\\'");`
- Use SOQL date literals: `TODAY`, `THIS_MONTH`, `THIS_FISCAL_QUARTER`
- Check cache first if useCache=true
- Log queries for debugging

**Never:**
- Guess field names
- Use JavaScript dates in SOQL (use SOQL literals)
- Query without LIMIT clause
- Modify data without user confirmation (Keigan-only for writes)

---

## Security & Permissions

**Write Operations (Keigan-only):**
- Account creation
- Opportunity creation
- Account reassignment
- Customer Brain notes
- Move to nurture, close lost

**Keigan's User ID:** `U094AQE9V7D`

**Check before writes:**
```javascript
const KEIGAN_USER_ID = 'U094AQE9V7D';
if (userId !== KEIGAN_USER_ID) {
  return error message;
}
```

**Read Operations:** All users can query data

---

## Common Pitfalls & How to Avoid

**1. Hardcoding instead of using existing logic**
- ❌ Don't: Create new weighted pipeline calculation
- ✅ Do: Find existing weighted pipeline query and reuse

**2. Breaking existing patterns**
- ❌ Don't: Change field names or query structures
- ✅ Do: Add new patterns, preserve existing

**3. Over-engineering**
- ❌ Don't: Add MCP server, full AI routing, complex architecture
- ✅ Do: Surgical improvements to what exists

**4. Ignoring CSP**
- ❌ Don't: Use inline onclick handlers
- ✅ Do: Use event listeners or pure CSS solutions

**5. Mock data without disclosure**
- ❌ Don't: Return hardcoded data and claim it's from Salesforce
- ✅ Do: Be explicit when using mock/test data

---

## User's Working Style

**Pace:** Fast. Expects updates in hours, not days.  
**Communication:** Direct. "Fix this" means fix it now, not discuss approaches.  
**Quality:** High standards. Dashboard should match professional design (see v0 App.html reference).  
**Iteration:** Build → Test → Refine rapidly.  
**Decision-making:** Trusts your technical judgment but wants transparency about trade-offs.

**When user shares screenshots:**
- They're showing you EXACT issues
- Fix what's visible in the screenshot
- Don't assume you understand without seeing it
- Test your fix matches their view

---

## Key Context You Need to Know

### Recent Intensive Session (~12 hours)
- Built account creation system (geography + workload assignment)
- Implemented opportunity creation (defaults + custom values)
- Created Account Status Dashboard (3 tabs)
- Integrated Einstein Activity Capture (meeting dates)
- Fixed dozens of field mapping issues (Revenue Type, IsClosed, etc.)
- Created comprehensive assessments and strategic plans

### What We Struggled With
- Clay API endpoint deprecated (still unresolved)
- Dashboard search not working (CSP blocking JavaScript)
- Account Plans tab too complex (YOUR TASK to fix)
- Einstein Activity data gaps (Events not linked to Accounts)

### What Worked Well
- Deterministic approach (vs AI-driven)
- In-memory caching for performance
- Pure CSS tabs (no JavaScript needed)
- Proper company name casing function
- toProperCompanyCase utility

---

## Testing Checklist Before Considering Task Complete

**For Account Plans tab fix:**
- [ ] Looks like Summary tab (same structure, same spacing)
- [ ] Shows top 10 accounts only
- [ ] NO yellow background fills anywhere
- [ ] NO red background fills
- [ ] Simple plan indicator (📋 emoji only)
- [ ] Customer Type shown inline [ARR], [Pilot], etc.
- [ ] Last meeting date shown if available
- [ ] Clean, scannable, mobile-friendly
- [ ] No console errors when opening dashboard
- [ ] Tabs switch correctly (Summary, By Stage, Account Plans)

---

## If You Get Stuck

**1. Check Render Logs**
- https://dashboard.render.com/
- Look for errors, warnings
- Share relevant log lines with user

**2. Reference Working Examples**
- Summary tab works perfectly - copy its structure
- Weighted pipeline query works - reuse its logic
- Account lookup works - use same fuzzy matching

**3. Ask User**
- Be specific about what's unclear
- Provide 2-3 options
- Get direction before proceeding

---

## Success Criteria

**Account Plans tab is DONE when:**
- User says "this looks good" or "this works"
- Matches Summary tab structure visually
- No yellow fills, clean and compact
- Top 10 accounts with "+X more" note
- Mobile-friendly
- No errors in console

**Then move to next task** (likely Einstein backfill or semantic matching)

---

## Files You Might Need to Modify

**For dashboard fix:**
- `src/slack/accountDashboard.js` - Main file

**For other improvements:**
- `src/ai/intentParser.js` - Intent detection
- `src/slack/events.js` - Handlers
- `src/salesforce/queries.js` - Query building
- `src/utils/cache.js` - Caching (has in-memory fallback now)

**Do NOT modify:**
- `src/salesforce/connection.js` - OAuth works, don't touch
- `data/*.json` - Business logic, field mappings
- `package.json` - Dependencies stable

---

## Important Constraints

**Render Deployment:**
- Free tier limitations (no Redis by default)
- Auto-deploys on git push to main
- Uses in-memory cache as fallback
- CSP headers strict (configure per endpoint if needed)

**Salesforce:**
- Target instance: https://eudia.my.salesforce.com
- OAuth connection established
- API limits exist (5K calls/day typically)
- Field permissions vary by user

**Slack:**
- Workspace: Eudia
- Socket Mode enabled
- Bot user: gtm-brain
- 41 team members have access

---

## What NOT to Do

❌ Add MCP server integration (assessed, not needed yet)  
❌ Rewrite deterministic intent matching with full AI (would reduce reliability)  
❌ Change existing field names or query patterns  
❌ Add features not explicitly requested  
❌ Over-complicate the dashboard  
❌ Use mock/test data without being explicit about it  
❌ Ignore CSP security policies  
❌ Break existing working functionality  

---

## Summary

You're picking up a production system that works well. The ONLY task right now is to fix the Account Plans tab to be clean and compact like the Summary tab. This is a visual/UX fix, not a functional change.

**Read:** DASHBOARD_FINAL_FIX_NEEDED.md and FINAL_SESSION_STATUS.md first.

**Then:** Fix Account Plans tab in accountDashboard.js to match Summary tab structure.

**Deploy, test, done.**

After that, ask user what's next. Likely: Einstein Activity backfill script or semantic query matching.

---

**You have all the context. The codebase is well-structured. The documentation is comprehensive. Make the surgical fix to Account Plans tab and you're golden.** 🚀

