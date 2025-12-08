# Post-Call Summary Feature - Complete Guide

Status: ✅ Implemented - Ready for Testing  
Added: November 19, 2025  
Security: Available to all Business Leads  
AI: Uses Socrates to structure notes automatically

---

## The Problem It Solves

Current workflow for BLs after customer meetings:
1. Get out of meeting
2. Open Socrates
3. Copy/paste the post-call summary prompt
4. Paste meeting notes or audio transcript
5. Wait for Socrates to structure
6. Copy structured output
7. Paste into Salesforce

New workflow with GTM-Wizard:
1. Get out of meeting
2. Paste notes directly in Slack with trigger phrase
3. Done! (AI structures and saves automatically)

Time saved: 80% (5-10 minutes → 1 minute)

---

## How to Use

### Simple format

```
@gtm-brain post-call summary
Company: Intel Corporation
[Paste your meeting notes or audio transcript here]
```

### Full example

```
@gtm-brain post-call summary
Company: Intel
Met with Sarah Johnson (VP Legal) and Tom Chen (General Counsel). 
First meeting. They're drowning in contract review - 200+ contracts per month.
Current process takes 2 weeks per contract. Looking at contracting + M&A.
Mentioned they evaluated LawGeex but didn't like the UI.
Budget is $500K approved for this year. Want to move fast - Q4 initiative.
Tom is the champion, very enthusiastic. Sarah controls budget.
Next steps: Demo scheduled for 11/25 at 2pm. Send pricing ahead of time.
Moving to evaluation phase. Currently in discovery.
```

### What happens

1. AI structures your notes using the standard template
2. Organizes into 8 sections automatically
3. Saves to Customer_Brain field in Salesforce
4. Shows you a preview in Slack
5. Links to Salesforce for full view

---

## The Template (Auto-Applied)

The AI structures your notes into this format automatically:

1. Meeting basics
   - Company, attendees, meeting type, new stakeholders

2. Discovery & current state
   - Use cases, pain points, volumes, tools, timeline

3. Solution discussion
   - Features that resonated, concerns, technical questions

4. Key insights by offering
   - Contracting, M&A, Compliance, Litigation, Sigma, Insights

5. Competitive & decision
   - Other vendors, evaluation criteria, budget, blockers

6. Stakeholder dynamics
   - Champion, decision maker, skeptics, key quotes

7. Next steps
   - Actions with exact dates/times

8. Outcome & stage
   - Result, current stage, risk factors

You don't need to format it yourself - just paste your notes and the AI handles the rest!

---

## Alternate Phrases

All of these work:
- "post-call summary"
- "post call summary"
- "meeting summary"
- "call summary"

---

## Examples

### Example 1: Raw notes

```
@gtm-brain post-call summary
Company: Acme Corp
Just got off call with Lisa (CFO) and Mark (VP Legal).
They have major pain in contract review. 500 contracts waiting.
Current team of 5 lawyers overwhelmed. Want AI solution ASAP.
Budget approved $750K. Demo next Tuesday 10am.
Lisa is champion. Mark skeptical about AI accuracy.
Competing with Harvey. They want proof of accuracy.
```

AI structures this into full template automatically!

### Example 2: Audio transcript

```
@gtm-brain post-call summary  
Company: Microsoft
[Paste entire audio transcript from meeting]
```

AI extracts key information and structures it!

### Example 3: Detailed notes

```
@gtm-brain meeting summary
Company: Apple
Attendee: John Smith - General Counsel
First meeting. Discovery phase.
Use cases: Contracting workflow automation, currently manual
Pain: 3-week review cycle, need down to 3 days
Volumes: 80 contracts/month, growing 40% YoY
Current tools: None (all manual in Word)
Budget: $400K this year, can expand next year
Timeline: Need solution by Q1
Features resonated: AI redlining, workflow automation
Concerns: Integration with existing systems
Technical: Asked about API, data security, SLAs
Champion: John Smith - very enthusiastic
Decision maker: CFO (budget approval needed)
Next steps: Send demo video by Friday, follow-up call Monday 2pm
Outcome: Moving to evaluation
Current stage: Discovery (Stage 1)
```

---

## Response Format

### Success

```
✅ Post-call summary saved for Intel Corporation

Structured and saved to Customer_Brain
Date: 11/19/2025 | By: Julie Stefanich

Preview:
POST-CALL SUMMARY - 11/19/2025 by Julie Stefanich
============================================================

1. MEETING BASICS
Company: Intel Corporation | Attendee(s): Sarah Johnson - VP Legal...

[Preview of structured summary]

<View Full Summary in Salesforce>
```

### What gets saved to Salesforce

The full structured summary is saved to the `Customer_Brain__c` field with:
- Date and attribution
- All 8 sections properly formatted
- Exact quotes preserved
- Ready for future reference

---

## Tips for Best Results

1. Include company name in first line
2. Paste raw notes - don't pre-format
3. Include attendee names and roles
4. Mention specific numbers (budget, volumes, etc.)
5. Include exact quotes when important
6. Note competitor names
7. Document next steps with dates
8. Indicate current stage

The AI is smart enough to extract and organize everything!

---

## What Makes This Better

Old way (using Socrates directly):
- Copy prompt
- Paste notes
- Wait for structure
- Copy output
- Open Salesforce
- Paste into field
- Total: 5-10 minutes

New way (GTM-Wizard):
- Paste notes in Slack with trigger
- Done!
- Total: 1 minute

Time saved per meeting: 4-9 minutes  
For 5 meetings/week: 20-45 minutes saved  
Per month: 80-180 minutes (1.3-3 hours)

---

## Frequently asked questions

Q: Can I edit the structured output?  
A: Yes! View in Salesforce and edit the Customer_Brain field directly

Q: What if the AI misses something?  
A: Add it manually in Salesforce or mention it in next summary

Q: Can I use audio transcripts?  
A: Yes! Paste the full transcript and AI will extract key info

Q: How long can my notes be?  
A: No limit - AI processes any length (though concise is better)

Q: What if I forget the format?  
A: Just type "@gtm-brain post-call summary" and it will show you

Q: Can other team members see summaries?  
A: Yes! Saved to Customer_Brain field visible to all

---

## Security & access

Who can use this feature:
- All Business Leads
- Any user with Slack access (it's a read from their perspective)
- Summaries saved to Customer_Brain (team-visible)

Why not restricted:
- Post-call summaries are valuable for entire team
- Collaborative intelligence benefits everyone
- Automatic attribution (timestamp + your name)

---

## Example full workflow

```
[After customer meeting]

User: @gtm-brain post-call summary
      Company: Intel
      Met with Sarah (VP Legal) and Tom (GC). First meeting.
      They need contract automation - 200 contracts/month.
      2-week review time, want down to 2 days.
      Budget $500K approved. Evaluating us vs LawGeex.
      Tom is champion. Sarah has final say.
      Demo scheduled 11/25 at 2pm.
      Moving to SQO.

[10 seconds later]

Bot: ✅ Post-call summary saved for Intel Corporation
     
     Structured and saved to Customer_Brain
     Date: 11/19/2025 | By: Julie Stefanich
     
     Preview:
     1. MEETING BASICS
     Company: Intel | Attendee(s): Sarah - VP Legal, Tom - General Counsel...
     
     <View Full Summary in Salesforce>

[Summary automatically structured and saved - ready for next interaction]
```

---

## Technical details

Field saved to: `Account.Customer_Brain__c`  
AI model: Socrates (gpt-4)  
Processing time: 10-15 seconds  
Format: Prepends to existing notes (newest first)  
Attribution: Automatic (date + user name)

---

Status: ✅ Ready to use  
Next: Test with a real meeting summary!

