# Critical Fixes Needed - Failing Queries

## Issue Summary

New intent patterns were added to intentParser.js but handlers were NOT added to events.js, causing these queries to fail with errors:

- ❌ "what do we know about HSBC?" → `account_context` intent detected, no handler
- ❌ "Julie's accounts" → `owner_accounts` intent detected, no handler
- ❌ "what opportunities does Domino's have?" → `account_opportunities` intent detected, no handler
- ❌ "show me Amazon's meeting history" → `account_meetings` intent detected, no handler

## Fix Required

Add handlers in `src/slack/events.js` around line 200-300 where other intent handlers are (after `account_lookup` handler):

```javascript
} else if (parsedIntent.intent === 'account_context') {
  await handleAccountContext(parsedIntent.entities, userId, channelId, client, threadTs);
  return;
  
} else if (parsedIntent.intent === 'owner_accounts') {
  await handleOwnerAccounts(parsedIntent.entities, userId, channelId, client, threadTs);
  return;
  
} else if (parsedIntent.intent === 'account_opportunities') {
  await handleAccountOpportunities(parsedIntent.entities, userId, channelId, client, threadTs);
  return;
  
} else if (parsedIntent.intent === 'account_meetings') {
  await handleAccountMeetings(parsedIntent.entities, userId, channelId, client, threadTs);
  return;
}
```

Then implement the 4 handler functions at the bottom of events.js (around line 2400+):

```javascript
/**
 * Handle "what do we know about [Company]?" queries
 */
async function handleAccountContext(entities, userId, channelId, client, threadTs) {
  // Implementation needed
}

/**
 * Handle "[Name]'s accounts" queries  
 */
async function handleOwnerAccounts(entities, userId, channelId, client, threadTs) {
  // Implementation needed
}

/**
 * Handle "what opportunities does [Company] have?" queries
 */
async function handleAccountOpportunities(entities, userId, channelId, client, threadTs) {
  // Implementation needed
}

/**
 * Handle "show me [Company]'s meeting history" queries
 */
async function handleAccountMeetings(entities, userId, channelId, client, threadTs) {
  // Implementation needed
}
```

## Alternative: Quick Fix (Remove New Intents)

If handlers can't be added immediately, remove the new intent patterns from intentParser.js (lines 556-647) to prevent errors until handlers are ready.

## Root Cause

Session was very long with many changes. New intent patterns were added without completing the full implementation loop (parser → router → handler). This is incomplete feature deployment.

## Estimated Fix Time

- 1-2 hours to implement all 4 handlers properly
- OR 5 minutes to remove intent patterns temporarily

## Recommendation

Remove new intent patterns for now (prevent errors), implement handlers properly in next focused session when there's time to test thoroughly.

