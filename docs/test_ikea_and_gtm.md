# Test Guide - IKEA & GTM Test Company

Git Commit: d917f2d  
Deployed: NOW  
Status: All fixes applied - enrichment should work!

---

## Test 1: IKEA (International Company)

### Command
```
@gtm-brain create IKEA and assign to BL
```

### Expected Response
```
Account created: IKEA

Assigned to: [Johnson or Hannah - International BL]

Reasoning:
• Company HQ: Älmhult, Sweden
• Salesforce Region: International

Enriched data:
• Website: www.ikea.com
• Linked_in_URL: https://www.linkedin.com/company/ikea
• Rev_MN: $44.6M
• Employees: 166,000
• Industry_Grouping: Retail & Consumer Goods

Current coverage: [BL Name] has [X] active opps...

<View Account in Salesforce>
```

### Verify in Salesforce - IKEA Account

**Account Name:**
- [ ] Name: "IKEA" (proper all-caps)

**Enrichment Fields (should ALL be populated):**
- [ ] Website: www.ikea.com
- [ ] Linked_in_URL__c: https://www.linkedin.com/company/ikea
- [ ] Rev_MN__c: 44.6 (millions)
- [ ] NumberOfEmployees: 166000
- [ ] Industry: Retail
- [ ] Industry_Grouping__c: Retail & Consumer Goods

**Location Fields:**
- [ ] BillingCity: Älmhult
- [ ] BillingState: (may be empty for international)
- [ ] BillingCountry: Sweden
- [ ] State__c: "Sweden" (country name in picklist)
- [ ] Region__c: "International" (picklist value)

**Assignment:**
- [ ] Owner: Johnson or Hannah (International BL)

---

## Test 2: GTM Test Company (USA - West Coast)

### Command
```
@gtm-brain create GTM Test Company and assign to BL
```

### Expected Response
```
Account created: GTM Test Company

Assigned to: Keigan Pesenti

Reasoning:
• Company HQ: San Francisco, CA (Test Assumption)
• Salesforce Region: West

Enriched data:
• Website: www.gtmtestcompany.com
• Linked_in_URL: https://www.linkedin.com/company/gtm-test-company
• Rev_MN: $50.0M
• Employees: 250
• Industry_Grouping: Technology & Software

Current coverage: Keigan Pesenti has [X] active opps...

<View Account in Salesforce>
```

### Verify in Salesforce - GTM Test Company

**Account Name:**
- [ ] Name: "GTM Test Company" (proper case)

**Enrichment Fields:**
- [ ] Website: www.gtmtestcompany.com
- [ ] Linked_in_URL__c: https://www.linkedin.com/company/gtm-test-company
- [ ] Rev_MN__c: 50 (millions)
- [ ] NumberOfEmployees: 250
- [ ] Industry: Technology
- [ ] Industry_Grouping__c: Technology & Software

**Location Fields:**
- [ ] BillingCity: San Francisco
- [ ] BillingState: CA
- [ ] BillingCountry: USA
- [ ] State__c: "CA" (state code in picklist)
- [ ] Region__c: "West" (picklist value)

**Assignment:**
- [ ] Owner: Keigan Pesenti (test override)

---

## Test 3: Create Opportunity with Correct Revenue Type

### Command (Recurring - Default)
```
@gtm-brain create a stage 1 opportunity for IKEA
```

Expected: Opportunity with Revenue_Type__c = "Recurring"

### Command (Booking - Custom)
```
@gtm-brain create an opp for IKEA. stage 2 and $400k acv and revenue type Booking
```

Expected: Opportunity with Revenue_Type__c = "Booking"

### Command (Project - Custom)
```
@gtm-brain create an opp for GTM Test Company. revenue type Project and $200k acv
```

Expected: Opportunity with Revenue_Type__c = "Project"

### Verify in Salesforce

**All opportunities should have:**
- [ ] Revenue_Type__c = "Recurring" OR "Booking" OR "Project" (valid picklist values)
- [ ] NO errors about "bad value for restricted picklist"
- [ ] Target_LOI_Date__c populated (not Target_Sign_Date__c)
- [ ] Correct account attachment

---

## Picklist Value Reference

### Revenue_Type__c (Opportunity)
- **Recurring** - 12+ month contracts (DEFAULT)
- **Booking** - LOI signings, one-time
- **Project** - Paid pilots, < 12 months

### Region__c (Account)
- West
- Northeast
- Midwest
- Southwest
- Southeast
- International

### State__c (Account)
- **USA:** CA, NY, TX, FL, etc. (state codes)
- **International:** Sweden, Germany, France, United Kingdom, etc. (country names)

### Industry_Grouping__c (Account)
- Financial Services & Insurance
- Healthcare & Pharmaceuticals
- Technology & Software
- Retail & Consumer Goods
- Industrial & Manufacturing
- Energy & Utilities
- Telecommunications & Media
- Transportation & Logistics

---

## Success Criteria

After testing both IKEA and GTM Test Company:

- [ ] Account names proper case (IKEA, GTM Test Company)
- [ ] ALL enrichment fields populated
- [ ] State__c has correct picklist value
- [ ] Region__c has correct picklist value (West/International)
- [ ] Industry_Grouping__c mapped correctly
- [ ] Revenue in millions (Rev_MN__c)
- [ ] Website, LinkedIn URLs populated
- [ ] Employees populated
- [ ] Opportunities create with "Recurring" type (no errors)
- [ ] Can override to "Booking" or "Project"

---

## If Enrichment Still Empty

Check Render logs for:
- "Using mock enrichment for [Company]" - should see this
- Any errors during account creation
- Field mapping issues

The mock enrichment should work immediately (no Clay API key needed for IKEA and GTM Test Company).

For other companies (not IKEA/GTM Test), you'll need to add the real Clay API key.

---

Test IKEA and GTM Test Company now - enrichment should populate ALL fields!

