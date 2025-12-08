# Contract & Document Management Integration

## 🎯 **High Priority Feature: Contract Querying & PDF Access**

### **Custom Object:**
- **Object:** `Contract_Line_Item__c`
- **Purpose:** Store individual line items and subscriptions
- **Integration:** Campfire AI
- **Contains:** Contract PDFs, terms, line items

### **Key Fields Visible in Screenshots:**
- Contract__c (Master-Detail relationship)
- Contract_URL__c
- Contract_Sign_Date_Campfire__c (Date)
- Customer_Name_Payee__c (Text 250)
- Customer_Email_Payee__c (Text 250)
- Customer_Address_1_Payee__c
- Duration__c (Number)
- End_Date_Campfire__c
- Legal_Entity__c
- Notes_Campfire__c (Long Text Area 32768)
- Parent_Product__c (Picklist)
- Product_Amount_Campfire__c (Currency)
- Product_Name_Campfire__c (Text 255)
- Product_Notes_Campfire__c
- Start_Date_Campfire__c

---

## 📋 **User Queries to Support:**

### **Query Contracts for Account:**
```
@gtm-brain contracts for Best Buy
@gtm-brain LOI contracts for Intel
@gtm-brain PDFs for Amazon
```

**Response:**
```
*Contracts for Best Buy*

1. **Best Buy - AI Contracting LOI**
   Signed: Oct 7, 2025
   Amount: $2.0M
   Duration: 12 months
   📎 [View PDF](Contract_URL__c)

2. **Best Buy - M&A Agreement**
   Signed: Sep 15, 2025  
   Amount: $500K
   Duration: 6 months
   📎 [View PDF](Contract_URL__c)

*Total: 2 contracts, $2.5M*
```

### **List All Contracts/LOIs:**
```
@gtm-brain show me all LOI contracts
@gtm-brain what contracts do we have?
```

**Response:**
```
*All LOI Contracts* (15 total)

Best Buy ($2.0M), Intel ($1.5M), Apple ($3.0M), Amazon ($2.2M)...

Total Value: $24.7M across 15 contracts
```

---

## 🔍 **Implementation Strategy:**

### **Query Builder:**
```javascript
function buildContractQuery(entities) {
  if (entities.accounts && entities.accounts.length > 0) {
    // Specific account
    const accountName = entities.accounts[0];
    return `SELECT Id, Name, Contract_URL__c, Contract_Sign_Date_Campfire__c,
                   Product_Amount_Campfire__c, Product_Name_Campfire__c,
                   Duration__c, Customer_Name_Payee__c
            FROM Contract_Line_Item__c
            WHERE Customer_Name_Payee__c LIKE '%${accountName}%'
            ORDER BY Contract_Sign_Date_Campfire__c DESC
            LIMIT 10`;
  } else {
    // All contracts
    return `SELECT Id, Name, Contract_URL__c, Contract_Sign_Date_Campfire__c,
                   Product_Amount_Campfire__c, Customer_Name_Payee__c
            FROM Contract_Line_Item__c
            WHERE Contract_URL__c != null
            ORDER BY Contract_Sign_Date_Campfire__c DESC
            LIMIT 20`;
  }
}
```

### **Intent Detection:**
```javascript
// Contract/PDF queries
if (message.includes('contracts') || message.includes('pdfs') || 
    (message.includes('loi') && message.includes('contract'))) {
  intent = 'contract_query';
  
  // Extract account name
  const accountMatch = message.match(/contracts for (.+?)(?:\?|$)/i) ||
                      message.match(/pdfs for (.+?)(?:\?|$)/i);
  
  if (accountMatch) {
    entities.accounts = [accountMatch[1].trim()];
  }
  
  return earlyWithHighConfidence('contract_query');
}
```

### **Formatter:**
```javascript
function formatContractResults(queryResult, parsedIntent) {
  if (!queryResult || !queryResult.records || queryResult.totalSize === 0) {
    const accountName = parsedIntent.entities.accounts?.[0];
    return accountName 
      ? `No contracts found for ${accountName}.`
      : `No contracts found in the system.`;
  }

  const records = queryResult.records;
  const accountName = parsedIntent.entities.accounts?.[0];
  
  let response = accountName 
    ? `*Contracts for ${accountName}*\n\n`
    : `*All Contracts* (${records.length} total)\n\n`;

  records.forEach((contract, i) => {
    response += `${i + 1}. *${contract.Product_Name_Campfire__c || contract.Name}*\n`;
    if (contract.Contract_Sign_Date_Campfire__c) {
      response += `   Signed: ${formatDate(contract.Contract_Sign_Date_Campfire__c)}\n`;
    }
    if (contract.Product_Amount_Campfire__c) {
      response += `   Amount: ${formatCurrency(contract.Product_Amount_Campfire__c)}\n`;
    }
    if (contract.Duration__c) {
      response += `   Duration: ${contract.Duration__c} months\n`;
    }
    if (contract.Contract_URL__c) {
      response += `   📎 [View PDF](${contract.Contract_URL__c})\n`;
    }
    response += '\n';
  });

  // Calculate total if amounts available
  const totalAmount = records.reduce((sum, r) => sum + (r.Product_Amount_Campfire__c || 0), 0);
  if (totalAmount > 0) {
    response += `\n*Total: ${records.length} contracts, ${formatCurrency(totalAmount)}*`;
  }

  return response;
}
```

---

## 📎 **PDF/Document Access Strategy:**

### **Salesforce File Storage:**
Contracts can be stored as:
1. **URL in Contract_URL__c** → Direct link
2. **Salesforce Files** (ContentVersion)
3. **External storage** (Box, Google Drive) with links

### **PDF Access Methods:**

**Method 1: Direct URL (Simplest):**
```javascript
// If Contract_URL__c has direct link
response += `📎 [View Contract](${contract.Contract_URL__c})\n`;
```

**Method 2: Salesforce Files API:**
```javascript
// Query ContentDocumentLink for the contract
const filesQuery = `SELECT ContentDocument.LatestPublishedVersion.VersionDataUrl,
                           ContentDocument.Title
                    FROM ContentDocumentLink
                    WHERE LinkedEntityId = '${contractId}'
                    LIMIT 5`;

// Returns Salesforce file URLs
```

**Method 3: Attachment in Slack:**
```javascript
// Upload file to Slack thread
await client.files.uploadV2({
  channel_id: channelId,
  file: pdfBuffer,
  filename: 'Best_Buy_LOI.pdf',
  thread_ts: threadTs
});
```

---

## 🚀 **Implementation Priority:**

### **Phase 1 (Tonight - 30 min):**
1. ✅ Fix weighted pipeline fields (ACV__c, Finance_Weighted_ACV__c)
2. ✅ Filter to active stages only
3. ✅ This quarter filter on Target_LOI_Date__c

### **Phase 2 (Tomorrow - 1 hour):**
1. Add contract query detection
2. Query Contract_Line_Item__c object
3. Format with PDF links
4. Test with Best Buy, Intel, Apple

### **Phase 3 (Later - 2 hours):**
1. Add Salesforce Files API integration
2. Direct PDF download/upload to Slack
3. Contract creation from Slack messages

---

## ⚠️ **Complexity Assessment:**

**Contract Querying:** LOW (30 min)
- Just another query type
- Link to PDFs in response

**PDF Attachments in Slack:** MEDIUM (1 hour)
- Need to download from Salesforce
- Upload to Slack
- Handle file permissions

**Auto-create contracts from Slack:** HIGH (2+ hours)
- Parse message for contract details
- Create Contract_Line_Item__c records
- Upload PDF if attached
- Validation and confirmation

---

## 🎯 **Recommended Approach:**

**Tonight:**
1. Fix weighted pipeline (fields + stages) - 10 min
2. Deploy and test
3. STOP for the night

**Tomorrow AM:**
1. Add contract querying with PDF links - 30 min
2. Test thoroughly
3. Deploy

**Tomorrow PM:**
1. PDF download/upload to Slack - 1 hour
2. Auto-contract creation - 2 hours

---

**Proceeding now with weighted pipeline fix, then we can tackle contracts tomorrow!**
