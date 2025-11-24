# Dashboard Final Fix - Account Plans Tab

**Issue:** Account Plans tab doesn't match Summary tab structure  
**Current:** Yellow fills, expandable details, search doesn't work  
**Needed:** Clean compact list like Summary tab

---

## Exact Changes Needed

### Replace Account Plans Tab with Summary-Style Structure

**Model After Summary Tab (lines 304-339):**
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

**Apply to Account Plans Tab (starting line 377):**
```html
<div id="account-plans" class="tab-content">
  <!-- Single metric tile -->
  <div class="stage-section">
    <div class="stage-title">Account Plans & Pipeline</div>
    <div class="stage-subtitle">2 accounts have plans | 116 need plans (recently initiated)</div>
  </div>
  
  <!-- Clean list (NO yellow fills, NO expandable details) -->
  <div class="stage-section">
    <div class="stage-title">Top 10 Accounts</div>
    <div class="account-list">
      <!-- For each of top 10 accounts by ACV: -->
      <div class="account-item">
        <div class="account-name">📋 Gov - DOD [ARR]</div>
        <div class="account-owner">Mike Masiello • Stage 4 • $5.3M • Last: Oct 31</div>
      </div>
      <!-- Repeat for 10 accounts -->
    </div>
  </div>
</div>
```

### Key Points
- NO `<details>` expandable elements
- NO yellow background (#fefce8)
- NO search box (remove it completely if not working)
- Use SAME `.account-item` class as Summary tab
- Show 📋 emoji INLINE in account name (not separate box)
- Show Last meeting date inline
- Top 10 accounts only
- Clean, scannable, like Summary tab

---

## Remove Search Box Entirely

If search doesn't work due to CSP, just remove it:
```html
<!-- DELETE THIS: -->
<input type="text" id="account-search"...>
<div id="match-count"...>

<!-- Keep simple static list -->
```

---

## Current State vs Needed

**Current (Wrong):**
- Shows 20+ accounts with expandable details
- Yellow background fills for missing plans
- Search box that doesn't work
- Too busy, too much scrolling

**Needed (Correct):**
- Shows top 10 accounts (compact list)
- NO yellow fills
- Simple inline indicators
- Like Summary tab exactly

---

**Next Session: Apply these changes line-by-line, test immediately, verify matches Summary tab structure.**

