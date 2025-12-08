# Implementation Guide: Fix Failing Queries

## Failing Queries to Fix:
1. "what do we know about HSBC?"
2. "Julie's accounts" / "what accounts does Asad own?"  
3. "what opportunities does Domino's have?"

## Strategic Approach:

**Extend existing `account_lookup` intent** for #1 and #3 (reuse fuzzy matching)
**Create minimal new handler** for #2 (owner accounts list)

---

## STEP 1: Add Patterns to intentParser.js

**Location:** Line 556, RIGHT BEFORE "// Handle ownership and business lead questions"

**Add this code:**

```javascript
    // NEW: "what do we know about [Company]?" - Map to account_lookup (reuse existing!)
    if (message.match(/what do (?:we|you) know about|tell me (?:everything )?about|info(?:rmation)? (?:on|about)/i)) {
      // Extract company name  
      const companyMatch = message.match(/(?:about|on)\s+(.+?)(?:\?|$)/i);
      
      if (companyMatch && companyMatch[1]) {
        intent = 'account_lookup';
        entities.accounts = [companyMatch[1].trim()];
        entities.includeAccount = true;
        entities.showOpportunities = true; // Flag to show opps in response
        
        return {
          intent: 'account_lookup',
          entities,
          followUp: false,
          confidence: 0.92,
          explanation: 'Account context query - show comprehensive info',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      }
    }

    // NEW: "[Name]'s accounts" or "what accounts does [Name] own?"
    if (message.match(/(\w+)'s accounts|what accounts does (\w+)|show me (\w+)'s accounts|accounts (?:owned by|for) (\w+)/i)) {
      // Extract owner name
      const ownerMatch = message.match(/(\w+)'s accounts/i) ||
                        message.match(/accounts.*?(?:does|for|by|owned by)\s+(\w+)/i);
      
      if (ownerMatch && ownerMatch[1]) {
        intent = 'owner_accounts_list';
        entities.ownerName = ownerMatch[1].trim();
        
        return {
          intent: 'owner_accounts_list',
          entities,
          followUp: false,
          confidence: 0.9,
          explanation: 'List all accounts owned by specific person',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      }
    }

    // NEW: "what opportunities does [Company] have?" or "show me [Company] opportunities"
    if (message.match(/what.*opportunities.*(?:does|for)|show.*opportunities.*(?:for|at)|(?:opportunities|opps).*(?:for|at|does)/i)) {
      // Extract company name
      const companyMatch = message.match(/opportunities.*?(?:does|for|at)\s+(.+?)(?:\s+have|\?|$)/i) ||
                          message.match(/(?:for|at)\s+(.+?)\s+opportunities/i) ||
                          message.match(/show me (.+?)(?:'s)?\s+(?:opportunities|opps)/i);
      
      if (companyMatch && companyMatch[1]) {
        intent = 'account_lookup';
        entities.accounts = [companyMatch[1].trim()];
        entities.includeAccount = true;
        entities.showOpportunities = true; // Reuse account_lookup, just show opps
        
        return {
          intent: 'account_lookup',
          entities,
          followUp: false,
          confidence: 0.9,
          explanation: 'Show opportunities for specific account',
          originalMessage: userMessage,
          timestamp: Date.now()
        };
      }
    }
```

---

## STEP 2: Add Handler Routing in events.js

**Location:** Around line 287, right after `account_lookup` handling

**Add this code:**

```javascript
    } else if (parsedIntent.intent === 'owner_accounts_list') {
      await handleOwnerAccountsList(parsedIntent.entities, userId, channelId, client, threadTs);
      return;
```

---

## STEP 3: Modify formatAccountLookup to Show Opportunities

**Location:** events.js around line 938 (formatAccountLookup function)

**Current logic:** Just shows owner
**New logic:** If `entities.showOpportunities === true`, also query and show opportunities

**Add after line 962 (after primaryResult is found):**

```javascript
  // If showOpportunities flag is set, fetch and display opportunities
  if (parsedIntent.entities.showOpportunities) {
    try {
      const oppQuery = `SELECT Name, StageName, ACV__c, Product_Line__c, Target_LOI_Date__c
                        FROM Opportunity
                        WHERE AccountId = '${primaryResult.Id}' AND IsClosed = false
                        ORDER BY CreatedDate DESC`;
      
      const oppResult = await query(oppQuery);
      
      if (oppResult && oppResult.records && oppResult.records.length > 0) {
        response += `\n\n*Active Opportunities (${oppResult.records.length}):*\n`;
        oppResult.records.forEach(opp => {
          const acv = opp.ACV__c ? `$${(opp.ACV__c / 1000).toFixed(0)}K` : 'TBD';
          const loi = opp.Target_LOI_Date__c ? new Date(opp.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'TBD';
          response += `• ${opp.Name}\n  ${cleanStageName(opp.StageName)} | ${opp.Product_Line__c || 'TBD'} | ${acv} | LOI: ${loi}\n`;
        });
      } else {
        response += `\n\n_No active opportunities found._`;
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    }
  }
```

---

## STEP 4: Implement handleOwnerAccountsList Function

**Location:** End of events.js (around line 2430, after other handlers)

**Add this complete function:**

```javascript
/**
 * Handle "[Name]'s accounts" queries
 */
async function handleOwnerAccountsList(entities, userId, channelId, client, threadTs) {
  try {
    if (!entities.ownerName) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Please specify whose accounts you want to see.\n\n*Examples:*\n• "Julie's accounts"\n• "What accounts does Himanshu own?"\n• "Show me Asad's accounts"`,
        thread_ts: threadTs
      });
      return;
    }
    
    const ownerName = entities.ownerName;
    
    // Map first names to full names (Business Leads)
    const ownerMap = {
      'julie': 'Julie Stefanich',
      'himanshu': 'Himanshu Agarwal',
      'asad': 'Asad Hussain',
      'ananth': 'Ananth Cherukupally',
      'david': 'David Van Ryk',
      'john': 'John Cobb',
      'jon': 'Jon Cobb',
      'olivia': 'Olivia Jung'
    };
    
    const fullName = ownerMap[ownerName.toLowerCase()] || ownerName;
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    
    // Query accounts owned by this person
    const accountQuery = `SELECT Id, Name, 
                                 (SELECT Id, StageName, ACV__c FROM Opportunities WHERE IsClosed = false ORDER BY ACV__c DESC)
                          FROM Account
                          WHERE Owner.Name LIKE '%${escapeQuotes(fullName)}%'
                          ORDER BY Name`;
    
    const result = await query(accountQuery);
    
    if (!result || result.totalSize === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: `No accounts found for "${fullName}".\n\nTry:\n• "Julie's accounts"\n• "Himanshu's accounts"\n• "Asad's accounts"`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Calculate total pipeline
    let totalPipeline = 0;
    let totalAccounts = result.records.length;
    let totalOpps = 0;
    
    result.records.forEach(acc => {
      if (acc.Opportunities && acc.Opportunities.records) {
        acc.Opportunities.records.forEach(opp => {
          totalPipeline += (opp.ACV__c || 0);
          totalOpps++;
        });
      }
    });
    
    // Format response
    let response = `*${fullName}'s Accounts (${totalAccounts} total)*\n\n`;
    response += `Total Pipeline: $${(totalPipeline / 1000000).toFixed(2)}M across ${totalOpps} opportunities\n\n`;
    
    // List accounts with pipeline
    result.records.forEach(acc => {
      const opps = acc.Opportunities?.records || [];
      if (opps.length > 0) {
        const accPipeline = opps.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
        const highestStage = Math.max(...opps.map(o => parseInt(o.StageName.match(/\d/)?.[0] || 0)));
        response += `• *${acc.Name}* - ${opps.length} opp${opps.length > 1 ? 's' : ''}, $${(accPipeline / 1000).toFixed(0)}K, Stage ${highestStage}\n`;
      } else {
        response += `• ${acc.Name} - No active opportunities\n`;
      }
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: response,
      thread_ts: threadTs
    });
    
  } catch (error) {
    console.error('[handleOwnerAccountsList] Error:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error retrieving accounts for ${entities.ownerName}.\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}
```

---

## COMPLETE IMPLEMENTATION CHECKLIST

- [ ] Add 3 patterns to intentParser.js (lines 556)
- [ ] Add routing for `owner_accounts_list` in events.js (line ~287)
- [ ] Modify formatAccountLookup to show opportunities when flag set (line ~962)  
- [ ] Add handleOwnerAccountsList function at end of events.js (line ~2430)
- [ ] Test all 3 failing queries
- [ ] Deploy

**Estimated time to implement:** 30-45 minutes if done carefully
**Risk:** Low - extending existing patterns, not creating new architecture

This approach REUSES existing fuzzy matching logic and minimally extends what works.

