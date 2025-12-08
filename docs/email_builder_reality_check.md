# Email Builder - Pragmatic Implementation Plan

## Current Reality

**newsapi.ai Status:** API not responding in test environment. Possible issues:
- Incorrect endpoint format
- Authentication method wrong
- Network/firewall blocking
- API key needs activation

**Decision:** Build Email Builder with what WORKS (Salesforce data), make news enrichment pluggable later.

## What We CAN Deliver Tonight (100% Reliable)

### Email Builder with Salesforce Integration

**Features:**
1. ✅ Company search (typeahead from SF)
2. ✅ Auto-populate throughout email:
   - [Company] → Account name
   - [Name] / [First Name] → Owner name
   - [Owner Email] → For follow-ups
3. ✅ SF Context Display:
   - Recent opportunities (stage, ACV, product)
   - Last meeting date
   - Customer Brain notes
   - Account owner
4. ✅ Template selection (17 Omar-style templates)
5. ✅ Live preview
6. ✅ Copy to clipboard

**Value Delivered:**
- BL types "Int" → sees "Intel (Julie Stefanich, Stage 3, $800K)"
- Clicks Intel → Email auto-fills with Intel throughout
- Sees SF context: "Last meeting 2 days ago with Sarah Chen (VP Legal)"
- Can reference this in email manually
- Copies finished email in 2 minutes vs. 10-15 minutes manual

**Time Savings:** 60-70% reduction in email prep time
**Data Quality:** 100% accurate (from SF, not guessing)

## What We ADD Later (Once API Working)

**News Enrichment Layer:**
- Recent acquisitions
- Funding announcements
- Leadership changes
- Geographic expansion
- Regulatory news

**Integration Point:** Already built into enrichmentService.js
**Effort to Add:** 30 minutes once API endpoint figured out

## Recommendation

**Build Tonight:**
- Email Builder web interface (`/email-builder`)
- SF company search working
- Template system functional
- BLs can use it immediately

**Next Session:**
- Debug newsapi.ai with their support docs
- OR use alternative (Google News API, Clearbit, manual)
- Plug into existing enrichment service
- No changes to Email Builder needed

**This is the surgical, production-focused approach.**
Deliver value now. Enhance incrementally.

Agree?

