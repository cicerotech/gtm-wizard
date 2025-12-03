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
      for (const [field, value] of Object.entries(overrides)) {
        if (field === 'ownerName') {
          // Convert owner name to ID
          const ownerId = OWNER_USER_IDS[value];
          if (ownerId) {
            record.OwnerId = ownerId;
          } else {
            // Lookup by name
            const userQuery = `SELECT Id FROM User WHERE Name = '${value}' AND IsActive = true LIMIT 1`;
            const userResult = await query(userQuery);
            if (userResult?.totalSize > 0) {
              record.OwnerId = userResult.records[0].Id;
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
    
    // Download the file
    const pdfBuffer = await downloadSlackFile(file, client);
    
    if (!pdfBuffer) {
      throw new Error('Failed to download PDF file');
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
      message += `• Customer Signer: ${fields.customerSignedName}\n`;
    }
    
    if (fields.eudiaSignedName) {
      message += `• Eudia Signer: ${fields.eudiaSignedName}\n`;
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
    }, 600); // 10 minutes
    
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
    successMessage += `📄 Contract #: ${result.contractNumber}\n`;
    successMessage += `<${result.contractUrl}|View in Salesforce>\n\n`;
    
    if (result.pdfAttached) {
      successMessage += `📎 PDF attached: ${fileName}\n\n`;
    }
    
    successMessage += `*Fields populated:*\n`;
    result.createdFields.forEach(field => {
      successMessage += `${field}\n`;
    });
    
    await client.chat.postMessage({
      channel: channelId,
      text: successMessage,
      thread_ts: threadTs
    });
    
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
 * Download file from Slack using multiple methods
 */
async function downloadSlackFile(file, client) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    // Try url_private_download first (more reliable for authenticated downloads)
    const downloadUrl = file.url_private_download || file.url_private;
    
    if (!downloadUrl) {
      logger.error('No download URL available for file:', file.name);
      throw new Error('No download URL available');
    }
    
    logger.info(`📥 Downloading file from: ${downloadUrl.substring(0, 50)}...`);
    
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Accept': 'application/pdf,*/*'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      logger.error(`Download failed: HTTP ${response.status} - ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    logger.info(`📄 Content-Type: ${contentType}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    logger.info(`📦 Downloaded ${buffer.length} bytes`);
    
    // Validate PDF magic bytes (%PDF)
    if (buffer.length < 4) {
      throw new Error('Downloaded file too small');
    }
    
    const header = buffer.slice(0, 4).toString('utf8');
    if (!header.startsWith('%PDF')) {
      logger.warn(`File header: ${header} (expected %PDF)`);
      // Don't throw - some PDFs have different headers or are encrypted
    }
    
    return buffer;
    
  } catch (error) {
    logger.error('File download failed:', error);
    
    // Try alternative: use Slack API to get file info
    try {
      logger.info('Attempting alternative download via Slack API...');
      const fileInfo = await client.files.info({ file: file.id });
      
      if (fileInfo.file?.url_private_download) {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(fileInfo.file.url_private_download, {
          headers: {
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
          }
        });
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      }
    } catch (altError) {
      logger.error('Alternative download also failed:', altError);
    }
    
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  ContractCreationService,
  processContractUpload,
  handleContractCreationConfirmation,
  downloadSlackFile,
  REQUIRED_ERP_FIELDS
};

