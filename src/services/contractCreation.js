/**
 * Contract Creation Service
 * Handles creating Salesforce Contract records and attaching PDF files
 * 
 * WORKFLOW:
 * 1. Receive analyzed contract data from ContractAnalyzer
 * 2. Validate required fields for ERP sync
 * 3. Create Contract record in Salesforce
 * 4. Upload PDF as ContentVersion linked to Contract
 * 5. Return confirmation with Salesforce link
 */

const logger = require('../utils/logger');
const { query, sfConnection } = require('../salesforce/connection');
const { contractAnalyzer, SALESFORCE_CONTRACT_FIELDS, OWNER_USER_IDS } = require('./contractAnalyzer');

// ═══════════════════════════════════════════════════════════════════════════
// REQUIRED FIELDS FOR CAMPFIRE ERP SYNC
// ═══════════════════════════════════════════════════════════════════════════
const REQUIRED_ERP_FIELDS = [
  'Contract_Name_Campfire__c',
  'AccountId',
  'StartDate',
  'EndDate',
  'ContractTerm',
  'Contract_Type__c',
  'Status',
  'OwnerId'
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT CREATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class ContractCreationService {
  constructor() {
    this.validationErrors = [];
  }

  /**
   * Main entry: Create contract from analyzed data
   * @param {Object} analysisResult - Output from ContractAnalyzer
   * @param {Buffer} pdfBuffer - Original PDF buffer
   * @param {string} fileName - Original filename
   * @param {string} userId - Slack user ID (for audit)
   * @returns {Object} Creation result with contract ID and URL
   */
  async createContractFromAnalysis(analysisResult, pdfBuffer, fileName, userId) {
    logger.info(`📝 Creating contract from analysis: ${fileName}`);
    
    try {
      // Step 1: Validate analysis result
      if (!analysisResult.success) {
        throw new Error(`Analysis failed: ${analysisResult.error}`);
      }
      
      // Step 2: Convert to Salesforce record format
      const contractRecord = contractAnalyzer.toSalesforceRecord(analysisResult.fields);
      
      // Step 3: Validate required ERP fields
      const validation = this.validateForERP(contractRecord, analysisResult.fields);
      if (!validation.valid) {
        return {
          success: false,
          needsConfirmation: true,
          validationErrors: validation.errors,
          suggestedFixes: validation.suggestedFixes,
          partialRecord: contractRecord,
          analysisResult: analysisResult
        };
      }
      
      // Step 4: Create contract in Salesforce
      const createResult = await this.createContract(contractRecord);
      
      if (!createResult.success) {
        throw new Error(`Contract creation failed: ${createResult.error}`);
      }
      
      // Step 5: Attach PDF file to contract
      const attachResult = await this.attachPDFToContract(
        createResult.contractId,
        pdfBuffer,
        fileName
      );
      
      // Step 6: Build confirmation response
      const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
      const contractUrl = `${sfBaseUrl}/lightning/r/Contract/${createResult.contractId}/view`;
      
      return {
        success: true,
        contractId: createResult.contractId,
        contractNumber: createResult.contractNumber,
        contractUrl: contractUrl,
        pdfAttached: attachResult.success,
        pdfContentDocumentId: attachResult.contentDocumentId,
        createdFields: this.summarizeCreatedFields(contractRecord),
        analysisResult: analysisResult
      };
      
    } catch (error) {
      logger.error('Contract creation failed:', error);
      return {
        success: false,
        error: error.message,
        fileName: fileName
      };
    }
  }

  /**
   * Validate contract record has all required ERP sync fields
   */
  validateForERP(record, analysisFields) {
    const errors = [];
    const suggestedFixes = [];
    
    for (const field of REQUIRED_ERP_FIELDS) {
      if (!record[field] || record[field] === null || record[field] === '') {
        const fieldConfig = SALESFORCE_CONTRACT_FIELDS[field];
        errors.push({
          field: field,
          label: fieldConfig?.label || field,
          message: `Missing required field: ${fieldConfig?.label || field}`
        });
        
        // Suggest fixes based on field type
        if (field === 'AccountId') {
          suggestedFixes.push({
            field: field,
            suggestion: `Please confirm account name: "${analysisFields.accountName || 'Not detected'}"`,
            type: 'account_lookup'
          });
        } else if (field === 'OwnerId') {
          suggestedFixes.push({
            field: field,
            suggestion: 'Assign to a Business Lead (Julie, Himanshu, Asad, Olivia, Justin)',
            type: 'owner_select',
            options: Object.keys(OWNER_USER_IDS)
          });
        } else if (field === 'StartDate' || field === 'EndDate') {
          suggestedFixes.push({
            field: field,
            suggestion: `Please provide ${fieldConfig.label} in MM/DD/YYYY format`,
            type: 'date_input'
          });
        } else if (field === 'ContractTerm') {
          suggestedFixes.push({
            field: field,
            suggestion: 'Please provide contract term in months (e.g., 12, 24, 36)',
            type: 'number_input'
          });
        }
      }
    }
    
    // Additional validations
    if (record.StartDate && record.EndDate) {
      const start = new Date(record.StartDate);
      const end = new Date(record.EndDate);
      if (end <= start) {
        errors.push({
          field: 'EndDate',
          message: 'End date must be after start date'
        });
      }
    }
    
    // Validate monetary fields for non-LOI
    if (record.Contract_Type__c === 'Recurring') {
      if (!record.Contract_Value__c && !record.Annualized_Revenue__c) {
        suggestedFixes.push({
          field: 'Contract_Value__c',
          suggestion: 'Recurring contracts typically need Total or Annual Contract Value',
          type: 'currency_input'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      suggestedFixes: suggestedFixes
    };
  }

  /**
   * Validate lookup IDs exist in Salesforce before creating
   */
  async validateLookupIds(record) {
    const errors = [];
    
    // Validate AccountId
    if (record.AccountId) {
      try {
        const accountCheck = await query(`SELECT Id, Name FROM Account WHERE Id = '${record.AccountId}' LIMIT 1`);
        if (!accountCheck || accountCheck.totalSize === 0) {
          errors.push({
            field: 'AccountId',
            message: `Account ID not found: ${record.AccountId}`,
            suggestion: 'Please verify the account name matches a Salesforce account'
          });
        } else {
          logger.info(`✅ Account verified: ${accountCheck.records[0].Name}`);
        }
      } catch (e) {
        errors.push({
          field: 'AccountId', 
          message: `Invalid Account ID format: ${record.AccountId}`,
          suggestion: 'The account lookup may have returned an invalid ID'
        });
      }
    }
    
    // Validate OwnerId
    if (record.OwnerId) {
      try {
        const ownerCheck = await query(`SELECT Id, Name FROM User WHERE Id = '${record.OwnerId}' AND IsActive = true LIMIT 1`);
        if (!ownerCheck || ownerCheck.totalSize === 0) {
          errors.push({
            field: 'OwnerId',
            message: `Owner ID not found or inactive: ${record.OwnerId}`,
            suggestion: 'Please assign to an active Business Lead'
          });
        } else {
          logger.info(`✅ Owner verified: ${ownerCheck.records[0].Name}`);
        }
      } catch (e) {
        errors.push({
          field: 'OwnerId',
          message: `Invalid Owner ID format: ${record.OwnerId}`,
          suggestion: 'Please use "assign to [Name]" with a valid BL name'
        });
      }
    }
    
    // Validate Contact_Signed__c (if set)
    if (record.Contact_Signed__c) {
      try {
        const contactCheck = await query(`SELECT Id, Name FROM Contact WHERE Id = '${record.Contact_Signed__c}' LIMIT 1`);
        if (!contactCheck || contactCheck.totalSize === 0) {
          // Remove invalid contact - it will be noted in the record
          logger.warn(`Contact ID not found: ${record.Contact_Signed__c}, removing from record`);
          delete record.Contact_Signed__c;
        }
      } catch (e) {
        delete record.Contact_Signed__c;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Create Contract record in Salesforce
   */
  async createContract(record) {
    try {
      const conn = sfConnection.getConnection();
      
      // Clean record - remove null/undefined values
      const cleanRecord = {};
      for (const [key, value] of Object.entries(record)) {
        if (value !== null && value !== undefined && value !== '') {
          cleanRecord[key] = value;
        }
      }
      
      // Validate lookup IDs before creating
      const lookupValidation = await this.validateLookupIds(cleanRecord);
      if (!lookupValidation.valid) {
        const errorMessages = lookupValidation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
        logger.error('Lookup validation failed:', errorMessages);
        return {
          success: false,
          error: errorMessages
        };
      }
      
      logger.info('Creating contract with data:', JSON.stringify(cleanRecord, null, 2));
      
      const result = await conn.sobject('Contract').create(cleanRecord);
      
      if (!result.success) {
        logger.error('Salesforce contract creation failed:', result.errors);
        return {
          success: false,
          error: result.errors?.map(e => e.message).join(', ') || 'Unknown error'
        };
      }
      
      logger.info(`✅ Contract created: ${result.id}`);
      
      // Get the contract number
      const contractQuery = `SELECT ContractNumber FROM Contract WHERE Id = '${result.id}'`;
      const contractResult = await query(contractQuery);
      
      return {
        success: true,
        contractId: result.id,
        contractNumber: contractResult?.records?.[0]?.ContractNumber || 'N/A'
      };
      
    } catch (error) {
      logger.error('Contract creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Attach PDF file to Contract record using ContentVersion
   */
  async attachPDFToContract(contractId, pdfBuffer, fileName) {
    try {
      const conn = sfConnection.getConnection();
      
      // Create ContentVersion (file upload)
      const contentVersion = await conn.sobject('ContentVersion').create({
        Title: fileName.replace(/\.pdf$/i, ''),
        PathOnClient: fileName,
        VersionData: pdfBuffer.toString('base64'),
        FirstPublishLocationId: contractId // This links it directly to the Contract
      });
      
      if (!contentVersion.success) {
        logger.error('ContentVersion creation failed:', contentVersion.errors);
        return {
          success: false,
          error: contentVersion.errors?.map(e => e.message).join(', ')
        };
      }
      
      logger.info(`✅ PDF attached to contract: ${contentVersion.id}`);
      
      // Get the ContentDocumentId for reference
      const cvQuery = `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${contentVersion.id}'`;
      const cvResult = await query(cvQuery);
      
      return {
        success: true,
        contentVersionId: contentVersion.id,
        contentDocumentId: cvResult?.records?.[0]?.ContentDocumentId
      };
      
    } catch (error) {
      logger.error('PDF attachment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create contract with manual field overrides
   */
  async createContractWithOverrides(analysisResult, overrides, pdfBuffer, fileName, userId) {
    logger.info('Creating contract with manual overrides');
    
    try {
      // Start with analyzed fields
      const record = contractAnalyzer.toSalesforceRecord(analysisResult.fields);
      
      // Apply overrides
      logger.info(`📝 Applying overrides: ${JSON.stringify(overrides)}`);
      
      for (const [field, value] of Object.entries(overrides)) {
        if (field === 'ownerName') {
          // ALWAYS query Salesforce for the user ID to ensure we have the correct, current ID
          // Hardcoded IDs can become stale when user records are recreated
          logger.info(`🔍 Looking up owner: ${value}`);
          
          const userQuery = `SELECT Id, Name FROM User WHERE Name LIKE '%${value}%' AND IsActive = true LIMIT 1`;
          const userResult = await query(userQuery);
          
          if (userResult?.totalSize > 0) {
            record.OwnerId = userResult.records[0].Id;
            logger.info(`✅ Owner found: ${userResult.records[0].Name} → ${userResult.records[0].Id}`);
          } else {
            // Fallback to hardcoded IDs only if query fails
            const ownerId = OWNER_USER_IDS[value];
            if (ownerId) {
              record.OwnerId = ownerId;
              logger.info(`✅ Owner set from cache: ${value} → ${ownerId}`);
            } else {
              logger.warn(`⚠️ Owner not found: ${value}`);
            }
          }
        } else if (field === 'accountName') {
          // Lookup account ID
          const accountQuery = `SELECT Id FROM Account WHERE Name LIKE '%${value}%' LIMIT 1`;
          const accountResult = await query(accountQuery);
          if (accountResult?.totalSize > 0) {
            record.AccountId = accountResult.records[0].Id;
          }
        } else {
          // Direct field mapping
          record[field] = value;
        }
      }
      
      // Create the contract
      const createResult = await this.createContract(record);
      
      if (!createResult.success) {
        return createResult;
      }
      
      // Attach PDF if provided
      if (pdfBuffer) {
        await this.attachPDFToContract(createResult.contractId, pdfBuffer, fileName);
      }
      
      const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
      const contractUrl = `${sfBaseUrl}/lightning/r/Contract/${createResult.contractId}/view`;
      
      return {
        success: true,
        contractId: createResult.contractId,
        contractUrl: contractUrl,
        createdFields: this.summarizeCreatedFields(record)
      };
      
    } catch (error) {
      logger.error('Contract creation with overrides failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Summarize created fields for confirmation message
   */
  summarizeCreatedFields(record) {
    const summary = [];
    
    if (record.Contract_Name_Campfire__c) {
      summary.push(`📄 Name: ${record.Contract_Name_Campfire__c}`);
    }
    if (record.Contract_Type__c) {
      summary.push(`📋 Type: ${record.Contract_Type__c}`);
    }
    if (record.StartDate) {
      summary.push(`📅 Start: ${record.StartDate}`);
    }
    if (record.EndDate) {
      summary.push(`📅 End: ${record.EndDate}`);
    }
    if (record.ContractTerm) {
      summary.push(`⏱️ Term: ${record.ContractTerm} months`);
    }
    if (record.Contract_Value__c) {
      summary.push(`💰 TCV: $${record.Contract_Value__c.toLocaleString()}`);
    }
    if (record.Annualized_Revenue__c) {
      summary.push(`📊 ACV: $${record.Annualized_Revenue__c.toLocaleString()}`);
    }
    if (record.Amount__c) {
      summary.push(`💵 Monthly: $${record.Amount__c.toLocaleString()}`);
    }
    if (record.Parent_Product__c) {
      summary.push(`🏷️ Product: ${record.Parent_Product__c}`);
    }
    
    return summary;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLACK FILE HANDLER FOR CONTRACT UPLOADS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a contract PDF uploaded to Slack
 * @param {Object} file - Slack file object
 * @param {Object} client - Slack client
 * @param {string} userId - User who uploaded
 * @param {string} channelId - Channel where uploaded
 * @param {string} threadTs - Thread timestamp
 */
async function processContractUpload(file, client, userId, channelId, threadTs) {
  const creationService = new ContractCreationService();
  
  try {
    // Validate file type
    if (!file.mimetype?.includes('pdf') && !file.name?.toLowerCase().endsWith('.pdf')) {
      await client.chat.postMessage({
        channel: channelId,
        text: '📄 Please upload a PDF contract file. I can analyze and create contracts from PDF files.',
        thread_ts: threadTs
      });
      return;
    }
    
    // Send analyzing message
    await client.chat.postMessage({
      channel: channelId,
      text: `🔍 *Analyzing contract:* ${file.name}\n\n_Extracting fields, matching account, classifying type..._`,
      thread_ts: threadTs
    });
    
    // Download the file with enhanced logging
    logger.info(`📥 Starting download for: ${file.name}`);
    logger.info(`📥 File info: id=${file.id}, size=${file.size}, mimetype=${file.mimetype}`);
    logger.info(`📥 URLs: private=${file.url_private?.substring(0, 50)}..., download=${file.url_private_download?.substring(0, 50)}...`);
    
    const pdfBuffer = await downloadSlackFile(file, client);
    
    if (!pdfBuffer) {
      throw new Error('Failed to download PDF file from Slack');
    }
    
    logger.info(`📦 Downloaded buffer size: ${pdfBuffer.length} bytes`);
    
    // Quick validation of downloaded content
    const firstBytes = pdfBuffer.slice(0, 50).toString('utf8');
    logger.info(`📦 First 50 chars: "${firstBytes.replace(/[^\x20-\x7E]/g, '?')}"`);
    
    // Check if we got HTML error instead of PDF - but don't fail yet
    // The download function already handles HTML detection and retries
    if (firstBytes.includes('<!DOCTYPE') || firstBytes.includes('<html')) {
      logger.error('❌ Content appears to be HTML - likely a permissions issue');
      logger.error('💡 Ensure the Slack bot has the "files:read" scope');
      logger.error('💡 Re-install the app to workspace if needed');
      throw new Error('Slack returned HTML instead of PDF. Bot needs "files:read" scope. Try re-installing the app.');
    }
    
    // Also check for PDF magic bytes
    if (!firstBytes.startsWith('%PDF') && pdfBuffer.length > 0) {
      logger.warn(`⚠️ File does not start with %PDF header, but continuing...`);
    }
    
    // Analyze the contract
    const analysisResult = await contractAnalyzer.analyzeContract(pdfBuffer, file.name);
    
    if (!analysisResult.success) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ *Analysis failed:* ${analysisResult.error}\n\nPlease try again or manually create the contract.`,
        thread_ts: threadTs
      });
      return;
    }
    
    // Build confirmation message
    const fields = analysisResult.fields;
    const contractType = analysisResult.contractType;
    
    let message = `✅ *Contract Analysis Complete*\n\n`;
    message += `📋 *Type:* ${contractType.type} (${Math.round(contractType.confidence * 100)}% confidence)\n\n`;
    
    message += `*Extracted Fields:*\n`;
    message += `• Account: ${fields.accountName || '❓ Not detected'}\n`;
    
    if (fields.salesforce?.accountId) {
      message += `  _→ Matched: ${fields.salesforce.accountName}_\n`;
    }
    
    message += `• Start Date: ${fields.startDate || '❓ Not detected'}\n`;
    message += `• End Date: ${fields.endDate || '❓ Not detected'}\n`;
    message += `• Term: ${fields.termMonths ? fields.termMonths + ' months' : '❓ Not detected'}\n`;
    
    if (!contractType.excludeMonetary) {
      message += `• Total Value: ${fields.totalContractValue ? '$' + fields.totalContractValue.toLocaleString() : '—'}\n`;
      message += `• Annual Value: ${fields.annualContractValue ? '$' + fields.annualContractValue.toLocaleString() : '—'}\n`;
      message += `• Monthly: ${fields.monthlyAmount ? '$' + fields.monthlyAmount.toLocaleString() : '—'}\n`;
    } else {
      message += `• _Monetary fields excluded (${contractType.type})_\n`;
    }
    
    if (fields.parentProduct) {
      message += `• Product: ${fields.parentProduct}\n`;
    }
    
    if (fields.customerSignedName) {
      if (fields.salesforce?.customerSignedId) {
        message += `• Customer Signed: ${fields.customerSignedName} ✓\n`;
      } else {
        message += `• Customer Signed: ${fields.customerSignedName} _(will be added to notes - contact not in SF)_\n`;
      }
    }
    
    if (fields.eudiaSignedName) {
      message += `• Eudia Signed: ${fields.eudiaSignedName}\n`;
    }
    
    message += `\n*Overall Confidence:* ${Math.round(fields.overallConfidence * 100)}%\n`;
    
    if (fields.warnings && fields.warnings.length > 0) {
      message += `\n⚠️ *Warnings:*\n`;
      fields.warnings.forEach(w => {
        message += `• ${w}\n`;
      });
    }
    
    // Add action prompt
    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `*Reply with:*\n`;
    message += `• \`create contract\` - Create with extracted data\n`;
    message += `• \`create contract assign to [Name]\` - Create and assign to specific BL\n`;
    message += `• \`cancel\` - Don't create\n`;
    
    // Store the analysis for follow-up
    const { cache } = require('../utils/cache');
    await cache.set(`contract_analysis_${userId}_${channelId}`, {
      analysisResult: analysisResult,
      pdfBuffer: pdfBuffer.toString('base64'),
      fileName: file.name,
      timestamp: Date.now()
    }, 1800); // 30 minutes - gives more time to review before creating
    
    await client.chat.postMessage({
      channel: channelId,
      text: message,
      thread_ts: threadTs
    });
    
  } catch (error) {
    logger.error('Contract upload processing failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ *Error processing contract:* ${error.message}\n\nPlease try again or contact support.`,
      thread_ts: threadTs
    });
  }
}

/**
 * Handle confirmation to create contract
 */
async function handleContractCreationConfirmation(message, userId, channelId, client, threadTs) {
  const creationService = new ContractCreationService();
  const { cache } = require('../utils/cache');
  
  try {
    // Get stored analysis
    const storedData = await cache.get(`contract_analysis_${userId}_${channelId}`);
    
    if (!storedData) {
      await client.chat.postMessage({
        channel: channelId,
        text: '❌ No pending contract analysis found. Please upload a contract PDF first.',
        thread_ts: threadTs
      });
      return false;
    }
    
    const { analysisResult, pdfBuffer, fileName } = storedData;
    const pdfBuf = Buffer.from(pdfBuffer, 'base64');
    
    // Check for owner override
    const ownerMatch = message.match(/assign\s+to\s+(\w+)/i);
    let overrides = {};
    
    if (ownerMatch) {
      const ownerName = ownerMatch[1];
      // Find matching owner
      const matchingOwner = Object.keys(OWNER_USER_IDS).find(
        name => name.toLowerCase().includes(ownerName.toLowerCase())
      );
      
      if (matchingOwner) {
        overrides.ownerName = matchingOwner;
      }
    }
    
    // Send creating message
    await client.chat.postMessage({
      channel: channelId,
      text: `📝 *Creating contract...*\n_Saving to Salesforce and attaching PDF_`,
      thread_ts: threadTs
    });
    
    let result;
    if (Object.keys(overrides).length > 0) {
      result = await creationService.createContractWithOverrides(
        analysisResult,
        overrides,
        pdfBuf,
        fileName,
        userId
      );
    } else {
      result = await creationService.createContractFromAnalysis(
        analysisResult,
        pdfBuf,
        fileName,
        userId
      );
    }
    
    if (result.needsConfirmation) {
      // Need more info from user
      let message = `⚠️ *Additional information needed:*\n\n`;
      result.validationErrors.forEach(err => {
        message += `• ${err.message}\n`;
      });
      message += `\n*Please provide:*\n`;
      result.suggestedFixes.forEach(fix => {
        message += `• ${fix.suggestion}\n`;
      });
      
      await client.chat.postMessage({
        channel: channelId,
        text: message,
        thread_ts: threadTs
      });
      return false;
    }
    
    if (!result.success) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ *Contract creation failed:* ${result.error}`,
        thread_ts: threadTs
      });
      return false;
    }
    
    // Success!
    let successMessage = `✅ *Contract Created Successfully!*\n\n`;
    successMessage += `📄 *Contract #:* ${result.contractNumber}\n`;
    successMessage += `📋 *Status:* Draft\n`;
    successMessage += `<${result.contractUrl}|View in Salesforce>\n\n`;
    
    if (result.pdfAttached) {
      successMessage += `📎 PDF attached: ${fileName}\n\n`;
    }
    
    successMessage += `*Fields populated:*\n`;
    result.createdFields.forEach(field => {
      successMessage += `${field}\n`;
    });
    
    successMessage += `\n────────────────────────────────\n`;
    successMessage += `*Next Step:*\n`;
    successMessage += `Reply \`activate contract\` to change status from Draft → Activated\n`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: successMessage,
      thread_ts: threadTs
    });
    
    // Store Draft contract for activation
    // When user says "activate contract", we'll use this to know which one to activate
    logger.info(`📝 Storing draft contract: draft_contract_${userId}_${channelId}`);
    logger.info(`📝 Contract ID: ${result.contractId}, Number: ${result.contractNumber}`);
    
    await cache.set(`draft_contract_${userId}_${channelId}`, {
      contractId: result.contractId,
      contractNumber: result.contractNumber,
      createdAt: Date.now()
    }, 3600); // 1 hour TTL - plenty of time to activate
    
    // Clear stored analysis
    await cache.del(`contract_analysis_${userId}_${channelId}`);
    
    return true;
    
  } catch (error) {
    logger.error('Contract creation confirmation failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ *Error:* ${error.message}`,
      thread_ts: threadTs
    });
    return false;
  }
}

/**
 * Download file from Slack - Multiple methods with comprehensive error handling
 */
async function downloadSlackFile(file, client) {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`📥 DOWNLOADING FILE: ${file.name}`);
  logger.info(`📥 File ID: ${file.id}`);
  logger.info(`📥 File size: ${file.size} bytes`);
  logger.info(`📥 Mimetype: ${file.mimetype}`);
  logger.info(`📥 url_private: ${file.url_private?.substring(0, 80)}...`);
  logger.info(`📥 url_private_download: ${file.url_private_download?.substring(0, 80)}...`);
  logger.info(`${'='.repeat(60)}\n`);

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    logger.error('❌ SLACK_BOT_TOKEN is not set!');
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 1: Use Slack Web API client directly (most reliable)
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    logger.info('📥 Method 1: Using Slack client.files.info...');
    
    const fileInfo = await client.files.info({ file: file.id });
    
    if (!fileInfo.ok) {
      logger.warn(`files.info returned error: ${fileInfo.error}`);
    } else {
      logger.info(`📥 files.info succeeded, file: ${fileInfo.file?.name}`);
      
      const downloadUrl = fileInfo.file?.url_private_download || fileInfo.file?.url_private;
      
      if (downloadUrl) {
        const buffer = await downloadWithToken(downloadUrl, token);
        if (buffer && buffer.length > 100) {
          logger.info(`✅ Method 1 SUCCESS: Downloaded ${buffer.length} bytes`);
          return buffer;
        }
      }
    }
  } catch (err) {
    logger.warn(`Method 1 failed: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 2: Direct download from url_private_download
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    logger.info('📥 Method 2: Direct download from url_private_download...');
    
    const downloadUrl = file.url_private_download || file.url_private;
    if (downloadUrl) {
      const buffer = await downloadWithToken(downloadUrl, token);
      if (buffer && buffer.length > 100) {
        logger.info(`✅ Method 2 SUCCESS: Downloaded ${buffer.length} bytes`);
        return buffer;
      }
    }
  } catch (err) {
    logger.warn(`Method 2 failed: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 3: Use https module directly (bypasses any node-fetch issues)
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    logger.info('📥 Method 3: Using native https module...');
    
    const downloadUrl = file.url_private_download || file.url_private;
    if (downloadUrl) {
      const buffer = await downloadWithHttps(downloadUrl, token);
      if (buffer && buffer.length > 100) {
        logger.info(`✅ Method 3 SUCCESS: Downloaded ${buffer.length} bytes`);
        return buffer;
      }
    }
  } catch (err) {
    logger.warn(`Method 3 failed: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 4: Try to get public URL
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    logger.info('📥 Method 4: Attempting to create shared public URL...');
    
    const publicUrl = await client.files.sharedPublicURL({ file: file.id });
    
    if (publicUrl.ok && publicUrl.file?.permalink_public) {
      logger.info(`📥 Got public URL: ${publicUrl.file.permalink_public}`);
      
      // Extract the direct download link
      const pubSecret = publicUrl.file.permalink_public?.split('-').pop();
      const directPublicUrl = `${file.url_private}?pub_secret=${pubSecret}`;
      
      const buffer = await downloadWithToken(directPublicUrl, token);
      if (buffer && buffer.length > 100) {
        logger.info(`✅ Method 4 SUCCESS: Downloaded ${buffer.length} bytes`);
        return buffer;
      }
    }
  } catch (err) {
    // This often fails if file is already public or bot lacks permission
    logger.warn(`Method 4 failed: ${err.message}`);
  }

  logger.error(`\n❌ ALL DOWNLOAD METHODS FAILED for: ${file.name}`);
  logger.error(`\n🔧 TROUBLESHOOTING:`);
  logger.error(`   1. Ensure bot has 'files:read' scope in Slack App settings`);
  logger.error(`   2. Reinstall the app to workspace after adding scope`);
  logger.error(`   3. Make sure bot is a member of the channel where file was shared`);
  logger.error(`   4. Try sharing the file via DM to the bot directly\n`);
  
  return null;
}

/**
 * Download using node-fetch with proper token
 */
async function downloadWithToken(url, token) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    logger.info(`📥 Fetching: ${url.substring(0, 60)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'GTM-Brain/1.0'
      },
      redirect: 'follow'
    });
    
    logger.info(`📥 Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      logger.warn(`HTTP error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await response.text();
      logger.warn(`Received HTML: ${text.substring(0, 100)}...`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
    
  } catch (err) {
    logger.warn(`downloadWithToken error: ${err.message}`);
    return null;
  }
}

/**
 * Download using native Node.js https module
 */
function downloadWithHttps(url, token) {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      const { URL } = require('url');
      
      const parsedUrl = new URL(url);
      
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GTM-Brain/1.0'
        }
      };
      
      const req = https.request(options, (res) => {
        logger.info(`📥 HTTPS Status: ${res.statusCode}`);
        
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          logger.info(`📥 Following redirect to: ${res.headers.location}`);
          return resolve(downloadWithHttps(res.headers.location, token));
        }
        
        if (res.statusCode !== 200) {
          logger.warn(`HTTPS error: ${res.statusCode}`);
          return resolve(null);
        }
        
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          logger.info(`📥 HTTPS downloaded: ${buffer.length} bytes`);
          resolve(buffer);
        });
      });
      
      req.on('error', (err) => {
        logger.warn(`HTTPS request error: ${err.message}`);
        resolve(null);
      });
      
      req.setTimeout(30000, () => {
        logger.warn('HTTPS request timeout');
        req.destroy();
        resolve(null);
      });
      
      req.end();
      
    } catch (err) {
      logger.warn(`HTTPS setup error: ${err.message}`);
      resolve(null);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Activate a Draft contract (change status from Draft to Activated)
 */
async function handleContractActivation(userId, channelId, client, threadTs) {
  const { cache } = require('../utils/cache');
  
  try {
    // Check for recently created Draft contract
    const draftContract = await cache.get(`draft_contract_${userId}_${channelId}`);
    
    logger.info(`🔄 Looking for draft contract: draft_contract_${userId}_${channelId}`);
    logger.info(`🔄 Found: ${draftContract ? JSON.stringify(draftContract) : 'null'}`);
    
    if (!draftContract) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❓ No Draft contract found to activate.\n\nCreate a contract first (it will be in Draft status), then reply \`activate contract\`.`,
        thread_ts: threadTs
      });
      return false;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: `🔄 Activating Contract #${draftContract.contractNumber}...\n_Changing status from Draft → Activated_`,
      thread_ts: threadTs
    });
    
    // Update contract status from Draft to Activated
    const conn = sfConnection.getConnection();
    
    logger.info(`🔄 Updating contract ${draftContract.contractId} to Activated`);
    
    const updateResult = await conn.sobject('Contract').update({
      Id: draftContract.contractId,
      Status: 'Activated'
    });
    
    if (!updateResult.success) {
      throw new Error(updateResult.errors?.map(e => e.message).join(', ') || 'Activation failed');
    }
    
    const sfBaseUrl = process.env.SF_INSTANCE_URL || 'https://eudia.my.salesforce.com';
    const contractUrl = `${sfBaseUrl}/lightning/r/Contract/${draftContract.contractId}/view`;
    
    await client.chat.postMessage({
      channel: channelId,
      text: `✅ *Contract Activated!*\n\n📄 Contract #${draftContract.contractNumber}\n📋 Status: *Draft → Activated*\n<${contractUrl}|View in Salesforce>`,
      thread_ts: threadTs
    });
    
    // Clear the draft contract from cache (it's now activated)
    await cache.del(`draft_contract_${userId}_${channelId}`);
    
    return true;
    
  } catch (error) {
    logger.error('Contract activation failed:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ *Activation failed:* ${error.message}`,
      thread_ts: threadTs
    });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  ContractCreationService,
  processContractUpload,
  handleContractCreationConfirmation,
  handleContractActivation,
  downloadSlackFile,
  REQUIRED_ERP_FIELDS
};

