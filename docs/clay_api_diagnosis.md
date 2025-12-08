# Clay API Integration - Root Cause Analysis

**Issue:** Clay API key is set but enrichment fails for all companies

**Evidence from Render logs:**
```
Calling Clay API for: levi strauss
Clay enrichment failed for levi strauss: [ERROR]
Enrichment result: success=false, all fields null
```

---

## Root Cause

The Clay API integration is **incorrectly implemented** because:

1. **Unknown API endpoint** - I guessed `https://api.clay.com/v1/enrichment/company` but this might be wrong
2. **Unknown request format** - Request body structure might be wrong
3. **Unknown response format** - Can't map response without seeing real response

**Current code:**
```javascript
const response = await fetch(`${this.baseUrl}/enrichment/company`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${this.apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ company_name: companyName })
});
```

This is a **GUESS** - might be completely wrong!

---

## Solutions (In Priority Order)

### Option A: Get Clay API Documentation (BEST)

**Need from you:**
1. Clay API documentation URL
2. OR example Clay API call that works
3. OR Clay dashboard showing API format

**Once I have this:** Can properly integrate in 30 minutes

---

### Option B: Simple Hardcoded Enrichment Table (WORKS NOW)

**Create enrichment database for common companies:**
- Fortune 500 companies
- Companies you commonly sell to
- Manually curate proper names, HQ, revenue

**Pros:** Works immediately, 100% accurate  
**Cons:** Manual maintenance, limited to known companies

**Implementation:** 2 hours to add 100-200 companies

---

### Option C: Web Scraping Enrichment (MEDIUM EFFORT)

**Use public data sources:**
- Company websites for HQ
- LinkedIn for company info
- Wikipedia for revenue/employees

**Pros:** Works for any company  
**Cons:** Less reliable, slower, might miss data

**Implementation:** 4-6 hours

---

### Option D: Different Enrichment API

**Alternatives to Clay:**
- Clearbit API
- ZoomInfo API
- People Data Labs
- Hunter.io

**Need:** API credentials for one of these

---

## Immediate Fix (While We Decide)

### Proper Company Name Casing Function

**Problem:** Even with enrichment, names are lowercase

**Solution:** Title case function for company names

```javascript
function toProperCompanyCase(name) {
  // Handle special cases
  const allCaps = ['IKEA', 'IBM', 'HP', 'AT&T', '3M', 'GE'];
  const found = allCaps.find(c => name.toUpperCase() === c);
  if (found) return found;
  
  // Title case with special handling
  return name
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Handle Mc/Mac
      if (word.startsWith('mc')) return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
      if (word.startsWith('mac')) return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4);
      // Regular title case
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
```

**This would fix:** "levi strauss" → "Levi Strauss"

---

## My Recommendation

**SHORT TERM (Today):**
1. Add title case function (fixes naming for ALL companies)
2. Expand mock enrichment to 20-30 common companies you sell to
3. Use this while we get real Clay API working

**MEDIUM TERM (This Week):**
4. Get Clay API documentation from Clay support
5. Properly integrate Clay API
6. Test with real companies

**Question for you:**
Can you get Clay API documentation? Or share a screenshot of Clay dashboard showing how to make API calls?

---

## Immediate Action

I'll implement the title case fix NOW so at minimum account names are proper case.

Then you decide:
- Option A: Get Clay docs (best long-term)
- Option B: I create enrichment table for your common companies (works today)
- Option C: I implement web scraping (works for any company)

Which direction?

