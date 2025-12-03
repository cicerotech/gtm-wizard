/**
 * Contract Analyzer Service
 * Analyzes PDF contracts to extract fields for Salesforce Contract object creation
 * 
 * ARCHITECTURE:
 * 1. PDF Text Extraction
 * 2. Contract Type Classification (CAB/LOI, Recurring, Other)
 * 3. Entity/Field Extraction using pattern matching + NLP
 * 4. Field Mapping to Salesforce API names
 * 5. Validation & Confidence Scoring
 * 6. Learning from successful extractions
 */

const logger = require('../utils/logger');
const { query, sfConnection } = require('../salesforce/connection');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// SALESFORCE CONTRACT FIELD MAPPINGS (Campfire ERP Sync Fields)
// ═══════════════════════════════════════════════════════════════════════════
const SALESFORCE_CONTRACT_FIELDS = {
  // REQUIRED FOR ERP SYNC (highlighted in your screenshot)
  'Contract_Name_Campfire__c': { label: 'Contract Name', required: true, type: 'text' },
  'AccountId': { label: 'Account Name', required: true, type: 'lookup' },
  'StartDate': { label: 'Contract Start Date', required: true, type: 'date' },
  'EndDate': { label: 'Contract End Date', required: true, type: 'date' },
  'ContractTerm': { label: 'Contract Term (months)', required: true, type: 'number' },
  'Contract_Type__c': { label: 'Contract Type', required: true, type: 'picklist', values: ['Recurring', 'LOI', 'One-Time', 'Amendment'] },
  'Status': { label: 'Status', required: true, type: 'picklist', values: ['Draft', 'In Approval', 'Activated', 'Terminated', 'Expired'] },
  'OwnerId': { label: 'Contract Owner', required: true, type: 'lookup' },
  
  // MONETARY FIELDS (NOT for CAB/LOI - except Delinea)
  'Contract_Value__c': { label: 'Total Contract Value', required: false, type: 'currency' },
  'Annualized_Revenue__c': { label: 'Annual Contract Value', required: false, type: 'currency' },
  'Amount__c': { label: 'Monthly Amount (subscription)', required: false, type: 'currency' },
  
  // PRODUCT FIELDS
  // Parent Product is SINGLE SELECT
  'Parent_Product__c': { 
    label: 'Parent Product', 
    required: false, 
    type: 'picklist', 
    values: ['AI Augmented - Contracting', 'AI Augmented - M&A', 'Compliance', 'Litigation', 'sigma', 'Other', 'Insights', 'Multiple', 'None specified'] 
  },
  // Product Line(s) is MULTI-SELECT
  'Product_Line__c': { 
    label: 'Product Line(s)', 
    required: false, 
    type: 'multipicklist',
    values: ['AI Augmented - Contracting', 'AI Augmented - M&A', 'sigma', 'Litigation', 'Cortex', 'Compliance']
  },
  
  // SIGNATURE FIELDS
  'CustomerSignedId': { label: 'Customer Signed By', required: false, type: 'lookup' },
  'Contact_Signed__c': { label: 'Customer Signed By (Name)', required: false, type: 'text' },
  'CustomerSignedDate': { label: 'Customer Signed Date', required: false, type: 'date' },
  'CompanySignedId': { label: 'Company Signed By', required: false, type: 'lookup' },
  
  // ADDITIONAL FIELDS
  'Legal_Entity__c': { label: 'Legal Entity', required: false, type: 'text' },
  'Currency__c': { label: 'Currency', required: false, type: 'picklist', values: ['USD', 'EUR', 'GBP'] },
  'Billing_Frequency__c': { label: 'Billing Frequency', required: false, type: 'picklist' },
  'Notes__c': { label: 'Notes', required: false, type: 'textarea' },
  'Related_Opp_s__c': { label: 'Related Opp(s)', required: false, type: 'text' },
  'AI_Enabled__c': { label: 'AI Enabled', required: false, type: 'checkbox', default: true },
  'Industry__c': { label: 'Industry', required: false, type: 'picklist' }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TYPE CLASSIFICATION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════
const CONTRACT_TYPE_PATTERNS = {
  CAB_LOI: {
    keywords: [
      'Customer Advisory Board', 'CAB', 'Advisory Board Appointment',
      'Letter of Intent', 'LOI', 'Memorandum', 'CAB Memorandum',
      'Non-binding', 'advisory capacity', 'committed spend'
    ],
    excludeMonetaryFields: true, // CAB/LOI = NO monetary values (except Delinea)
    defaultContractType: 'LOI',
    confidenceBoost: 0.15
  },
  RECURRING: {
    keywords: [
      'Master Services Agreement', 'MSA', 'Subscription', 'Annual',
      'Recurring', 'Service Order', 'Statement of Work', 'SOW',
      'Year 1', 'Year 2', 'Year 3', 'annual fee', 'monthly fee',
      'AI-Augmented', 'Contracting Support Order', 'Agreement'
    ],
    excludeMonetaryFields: false,
    defaultContractType: 'Recurring',
    confidenceBoost: 0.1
  },
  AMENDMENT: {
    keywords: [
      'Amendment', 'Amended and Restated', 'Addendum', 'Modification',
      'Supplemental', 'extends', 'amends'
    ],
    excludeMonetaryFields: false,
    defaultContractType: 'Amendment',
    confidenceBoost: 0.1
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIELD EXTRACTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════
const EXTRACTION_PATTERNS = {
  // DATES
  effectiveDate: [
    /effective\s+(?:as\s+of\s+)?(?:date[:\s]+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:Order\s+)?Effective\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /dated\s+(?:as\s+of\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(?:Start|Commencement)\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  ],
  endDate: [
    /(?:Contract\s+)?End\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:Expir(?:ation|es?)|terminat(?:es?|ion))[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:third|second|first)\s+anniversary\s+of\s+the\s+(?:Order\s+)?Effective\s+Date/i,
    /until\s+(\w+\s+\d{1,2},?\s+\d{4})/i
  ],
  term: [
    /(?:Contract\s+)?Term[:\s]+(\d+)\s*(?:months?|years?)/i,
    /(\d+)[\s-]*(?:month|year)\s+(?:term|period|duration)/i,
    /(?:for\s+a\s+period\s+of|lasting)\s+(\d+)\s*(?:months?|years?)/i,
    /(?:Year\s+1|Year\s+2|Year\s+3)/gi // Multi-year detection
  ],
  
  // MONETARY (for Recurring contracts)
  totalValue: [
    /Total\s+Contract\s+Value[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /aggregate\s+(?:total\s+)?(?:fees?|amount)[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /not\s+to\s+exceed\s+\$?([\d,]+(?:\.\d{2})?)/i
  ],
  annualValue: [
    /Annual\s+(?:Contract\s+)?(?:Value|Fee)[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /(?:per\s+)?(?:annual|yearly)\s+fee[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s+)?(?:annum|year|annually)/i
  ],
  monthlyValue: [
    /Monthly\s+(?:Amount|Fee|Subscription)[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s+)?month(?:ly)?/i
  ],
  perUnitValue: [
    /\$?([\d,]+(?:\.\d{2})?)\s*per\s+(?:Contract|Agreement|Unit|Document)/i,
    /(?:Rate|Fee)[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:each|per)/i
  ],
  
  // PARTIES - Multiple patterns for different contract formats
  customerName: [
    // Direct "Account Name: X" format
    /Account\s+Name[:\s]+([A-Z][A-Za-z\s&,.'()-]+?)(?:\n|$)/i,
    // "Customer or Company" format (e.g., Coherent contracts)
    /["']Customer["']\s+or\s+["']([A-Z][A-Za-z\s&,.'()-]+)["']/,
    // Appointment format (e.g., "Appointment – Pure Storage, Inc.")
    /Appointment\s*[–-]\s*([A-Z][A-Za-z\s&,.'()-]+?)(?:,?\s*Inc\.?|,?\s*Corp\.?|,?\s*LLC)?(?:\n|$)/i,
    // Between X and Y format
    /between.*?and\s+([A-Z][A-Za-z\s&,.'()-]+?)(?:\s*\(|,?\s*["']Customer)/i,
    // Memorandum format (e.g., "CAB Memorandum- BestBuy")
    /Memorandum[:\s-]+([A-Z][A-Za-z\s&,.'()-]+?)(?:\s+\d{4}|\n|$)/i,
    // Agreement with customer (e.g., "Agreement is entered into...and Chevron")
    /Agreement.*?(?:and|with)\s+([A-Z][A-Za-z\s&,.'()-]+?)(?:\.|,|\n)/i,
    // Fallback: "Company" at start of line
    /^Company[:\s]+([A-Z][A-Za-z\s&,.'()-]+?)(?:\n|$)/im
  ],
  
  // SIGNATURES
  customerSignature: [
    /Customer[:\s]*(?:Signed\s+By)?[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/,
    /(?:Authorized\s+Representative|Signatory)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i
  ],
  customerTitle: [
    /Title[:\s]*([A-Za-z\s,]+(?:Officer|Counsel|Director|VP|President|CEO|CLO|CFO|General))/i
  ],
  eudiaSignature: [
    /(?:Eudia|Cicero)[:\s]*(?:Signed\s+By)?[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /Omar\s+Haroun/i, // Eudia CEO
    /David\s+Van\s+(?:Ryk|Reyk)/i // Common signer
  ],
  
  // PRODUCTS
  products: [
    /(?:Product|Service)[s\s]*(?:Line)?[:\s]*((?:AI[- ]?Augmented|Contracting|Insights|sigma|Compliance|M&A|Litigation)[,;\s]+)+/i,
    /(?:sigma|insights|contracting|compliance)/gi
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// EUDIA COMPANY SIGNERS (for Company Signed By lookup)
// ═══════════════════════════════════════════════════════════════════════════
const EUDIA_SIGNERS = {
  'Omar Haroun': { id: null, role: 'CEO', searchName: 'Omar Haroun' },
  'David Van Ryk': { id: null, role: 'President', searchName: 'David Van Ryk' },
  'David Van Reyk': { id: null, role: 'President', searchName: 'David Van Ryk' },
  'Keigan Pesenti': { id: null, role: 'RevOps', searchName: 'Keigan Pesenti' }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT OWNER TO CONTRACT OWNER MAPPING (Business Leads)
// ═══════════════════════════════════════════════════════════════════════════
const OWNER_USER_IDS = {
  'Julie Stefanich': '005Wj00000KDcFqIAL',
  'Himanshu Agarwal': '005Wj00000M2FnHIAV',
  'Asad Hussain': '005Wj00000L8YuNIAV',
  'Olivia Jung': '005Wj00000UVn0XIAT',
  'Justin Hills': '005Wj00000UVn1ZIAT',
  'Ananth Cherukupally': '005Wj00000KDcFrIAL',
  'David Van Ryk': '005Wj00000L8YuOIAV',
  'Keigan Pesenti': '005Wj00000KDcFsIAL'
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════
class ContractAnalyzer {
  constructor() {
    this.extractionPatterns = EXTRACTION_PATTERNS;
    this.learnedPatterns = new Map(); // For ML-style pattern learning
    this.validationRules = [];
    this.confidenceThreshold = 0.7; // Minimum confidence for auto-population
  }

  /**
   * Main entry point: Analyze contract PDF and extract fields
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} fileName - Original filename
   * @returns {Object} Extracted fields with confidence scores
   */
  async analyzeContract(pdfBuffer, fileName) {
    logger.info(`📄 Analyzing contract: ${fileName}`);
    
    try {
      // Step 1: Extract text from PDF
      const text = await this.extractTextFromPDF(pdfBuffer);
      logger.info(`📝 Extracted ${text.length} characters from PDF`);
      
      // Step 2: Classify contract type
      const contractType = this.classifyContractType(text, fileName);
      logger.info(`🏷️ Contract type: ${contractType.type} (confidence: ${contractType.confidence})`);
      
      // Step 3: Extract all fields
      const extractedFields = await this.extractFields(text, contractType, fileName);
      
      // Step 4: Validate and calculate confidence
      const validatedFields = this.validateAndScore(extractedFields, contractType);
      
      // Step 5: Match to Salesforce accounts/contacts
      const enrichedFields = await this.enrichWithSalesforceData(validatedFields);
      
      return {
        success: true,
        contractType: contractType,
        fields: enrichedFields,
        rawText: text.substring(0, 2000), // First 2000 chars for reference
        fileName: fileName,
        analyzedAt: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Contract analysis failed:', error);
      return {
        success: false,
        error: error.message,
        fileName: fileName
      };
    }
  }

  /**
   * Extract text from PDF buffer
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      // Validate we have a buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Empty PDF buffer');
      }
      
      logger.info(`📄 Processing PDF buffer: ${pdfBuffer.length} bytes`);
      
      // Check PDF header
      const header = pdfBuffer.slice(0, 8).toString('utf8');
      logger.info(`📄 PDF header: ${header}`);
      
      // Dynamic import for pdf-parse
      let pdfParse;
      try {
        pdfParse = require('pdf-parse');
      } catch (e) {
        logger.warn('pdf-parse not available, using fallback text extraction');
        return this.fallbackTextExtraction(pdfBuffer);
      }
      
      // Try pdf-parse with error handling
      try {
        const data = await pdfParse(pdfBuffer, {
          // Options to handle various PDF types
          max: 0, // No page limit
        });
        
        if (data.text && data.text.length > 0) {
          logger.info(`✅ Extracted ${data.text.length} characters from PDF`);
          return data.text;
        } else {
          logger.warn('pdf-parse returned empty text, trying fallback');
          return this.fallbackTextExtraction(pdfBuffer);
        }
      } catch (parseError) {
        logger.warn(`pdf-parse failed: ${parseError.message}, trying fallback`);
        return this.fallbackTextExtraction(pdfBuffer);
      }
      
    } catch (error) {
      logger.error('PDF parsing failed:', error);
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Fallback text extraction for problematic PDFs
   */
  fallbackTextExtraction(pdfBuffer) {
    logger.info('Using fallback text extraction...');
    
    // Convert buffer to string and extract readable text
    let text = pdfBuffer.toString('utf8');
    
    // Clean up binary characters but keep text
    text = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    
    // Try to find text between stream markers (common in PDFs)
    const streamMatches = text.match(/stream[\s\S]*?endstream/gi) || [];
    let extractedText = '';
    
    for (const stream of streamMatches) {
      // Extract readable characters from streams
      const readable = stream.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                             .replace(/\s+/g, ' ')
                             .trim();
      if (readable.length > 20) {
        extractedText += readable + '\n';
      }
    }
    
    // Also try to find text objects (Tj, TJ operators)
    const textMatches = text.match(/\(([^)]+)\)\s*Tj/gi) || [];
    for (const match of textMatches) {
      const content = match.replace(/\(([^)]+)\)\s*Tj/i, '$1');
      extractedText += content + ' ';
    }
    
    // If we got some text, return it; otherwise return cleaned buffer
    if (extractedText.length > 100) {
      logger.info(`✅ Fallback extracted ${extractedText.length} characters`);
      return extractedText;
    }
    
    // Last resort: return the cleaned buffer text
    const cleaned = text.replace(/\s+/g, ' ').trim();
    logger.info(`📝 Using cleaned buffer: ${cleaned.length} characters`);
    return cleaned;
  }

  /**
   * Classify contract type based on content
   */
  classifyContractType(text, fileName) {
    const textLower = text.toLowerCase();
    const fileNameLower = fileName.toLowerCase();
    
    let bestMatch = { type: 'Recurring', confidence: 0.5, excludeMonetary: false };
    
    for (const [typeName, config] of Object.entries(CONTRACT_TYPE_PATTERNS)) {
      let matchCount = 0;
      let totalKeywords = config.keywords.length;
      
      for (const keyword of config.keywords) {
        if (textLower.includes(keyword.toLowerCase()) || 
            fileNameLower.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
      
      const confidence = (matchCount / totalKeywords) + config.confidenceBoost;
      
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: config.defaultContractType,
          confidence: Math.min(confidence, 1.0),
          excludeMonetary: config.excludeMonetaryFields,
          matchedKeywords: matchCount
        };
      }
    }
    
    // Special case: CAB in filename = strong LOI signal
    if (fileNameLower.includes('cab') || fileNameLower.includes('memorandum')) {
      bestMatch.type = 'LOI';
      bestMatch.excludeMonetary = true;
      bestMatch.confidence = Math.max(bestMatch.confidence, 0.9);
    }
    
    return bestMatch;
  }

  /**
   * Extract all fields from contract text
   * @param {string} text - Contract text content
   * @param {Object} contractType - Classification result
   * @param {string} fileName - Original filename (for pattern matching)
   */
  async extractFields(text, contractType, fileName = '') {
    const extracted = {
      // Core fields
      contractName: null,
      accountName: null,
      startDate: null,
      endDate: null,
      termMonths: null,
      contractTypeValue: contractType.type,
      
      // Monetary (null for CAB/LOI)
      totalContractValue: null,
      annualContractValue: null,
      monthlyAmount: null,
      
      // Products
      parentProduct: null,
      productLine: null,
      
      // Signatures
      customerSignedName: null,
      customerSignedTitle: null,
      eudiaSignedName: null,
      signedDate: null,
      
      // Other
      notes: null,
      currency: 'USD',
      aiEnabled: true
    };
    
    // Extract contract name from filename or first heading
    const contractNameMatch = text.match(/^#?\s*(?:Exhibit\s+[A-Z])?[\s\n]*(.+?(?:Order|Agreement|Memorandum|Contract))/im);
    if (contractNameMatch) {
      extracted.contractName = contractNameMatch[1].trim().replace(/\s+/g, ' ');
    }
    
    // Extract customer/account name with improved logic
    // First, try to find explicit "Account Name:" field
    const accountNameDirect = text.match(/Account\s+Name[:\s]+([A-Za-z][A-Za-z\s&,.'()-]+?)(?:\n|Contract|Status)/i);
    if (accountNameDirect && accountNameDirect[1]) {
      extracted.accountName = accountNameDirect[1].trim().replace(/,?\s*(Inc|Corp|LLC|Ltd|Company|Co)\.?$/i, '');
    }
    
    // Try from filename for CAB/Memorandum contracts
    if (!extracted.accountName) {
      const fileNameMatch = fileName.match(/(?:CAB|Memorandum)[:\s-]+([A-Za-z][A-Za-z\s&]+?)(?:\s+\d{4}|\.|$)/i);
      if (fileNameMatch && fileNameMatch[1]) {
        extracted.accountName = fileNameMatch[1].trim();
      }
    }
    
    // Try appointment format
    if (!extracted.accountName) {
      const appointmentMatch = text.match(/Appointment\s*[–-]\s*([A-Z][A-Za-z\s&]+?)(?:,?\s*Inc\.?|,?\s*Corp\.?|\n)/i);
      if (appointmentMatch && appointmentMatch[1]) {
        extracted.accountName = appointmentMatch[1].trim().replace(/,?\s*(Inc|Corp|LLC|Ltd)\.?$/i, '');
      }
    }
    
    // Try "Customer" or "Company" definition in contract
    if (!extracted.accountName) {
      const customerDefMatch = text.match(/["']\s*(?:Customer|Company)\s*["']\s*(?:or\s*["'])?\s*([A-Z][A-Za-z\s&]+?)(?:["']|\))/i);
      if (customerDefMatch && customerDefMatch[1]) {
        const name = customerDefMatch[1].trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
        }
      }
    }
    
    // Try between...and format
    if (!extracted.accountName) {
      const betweenMatch = text.match(/between.*?(?:Eudia|Cicero).*?and\s+([A-Z][A-Za-z\s&]+?)(?:\s*\(|,?\s*["']|\.|dated)/i);
      if (betweenMatch && betweenMatch[1]) {
        extracted.accountName = betweenMatch[1].trim().replace(/,?\s*(Inc|Corp|LLC|Ltd)\.?$/i, '');
      }
    }
    
    // Fallback to pattern matching
    if (!extracted.accountName) {
      for (const pattern of this.extractionPatterns.customerName) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim()
            .replace(/["'()]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/,?\s*(Inc|Corp|LLC|Ltd|Company|Co)\.?$/i, '');
          
          // Exclude Eudia/Cicero and generic terms
          if (!name.toLowerCase().includes('eudia') && 
              !name.toLowerCase().includes('cicero') &&
              !name.toLowerCase().includes('advisory board') &&
              !name.toLowerCase().includes('signed by') &&
              name.length > 2) {
            extracted.accountName = name;
            break;
          }
        }
      }
    }
    
    // Extract dates
    for (const pattern of this.extractionPatterns.effectiveDate) {
      const match = text.match(pattern);
      if (match && match[1]) {
        extracted.startDate = this.parseDate(match[1]);
        break;
      }
    }
    
    // Check for anniversary-based end date
    const anniversaryMatch = text.match(/(?:third|3rd)\s+anniversary/i);
    if (anniversaryMatch && extracted.startDate) {
      extracted.termMonths = 36;
      extracted.endDate = this.addMonthsToDate(extracted.startDate, 36);
    } else if (text.match(/(?:second|2nd)\s+anniversary/i) && extracted.startDate) {
      extracted.termMonths = 24;
      extracted.endDate = this.addMonthsToDate(extracted.startDate, 24);
    } else if (text.match(/(?:first|1st)\s+anniversary/i) && extracted.startDate) {
      extracted.termMonths = 12;
      extracted.endDate = this.addMonthsToDate(extracted.startDate, 12);
    } else {
      // Try explicit end date
      for (const pattern of this.extractionPatterns.endDate) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.endDate = this.parseDate(match[1]);
          break;
        }
      }
    }
    
    // First try to extract explicit term
    const explicitTermMatch = text.match(/Contract\s+Term[:\s]*(\d+)\s*months?/i) ||
                              text.match(/Term[:\s]*(\d+)\s*months?/i);
    if (explicitTermMatch && explicitTermMatch[1]) {
      extracted.termMonths = parseInt(explicitTermMatch[1]);
    }
    
    // Calculate term from dates if not found explicitly
    if (extracted.startDate && extracted.endDate && !extracted.termMonths) {
      extracted.termMonths = this.calculateTermMonths(extracted.startDate, extracted.endDate);
    }
    
    // Extract monetary values (only for non-LOI contracts)
    if (!contractType.excludeMonetary) {
      // Total Value
      for (const pattern of this.extractionPatterns.totalValue) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.totalContractValue = this.parseMoneyValue(match[1]);
          break;
        }
      }
      
      // Annual Value
      for (const pattern of this.extractionPatterns.annualValue) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.annualContractValue = this.parseMoneyValue(match[1]);
          break;
        }
      }
      
      // Monthly Value
      for (const pattern of this.extractionPatterns.monthlyValue) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.monthlyAmount = this.parseMoneyValue(match[1]);
          break;
        }
      }
      
      // Infer monthly from annual if not found
      if (extracted.annualContractValue && !extracted.monthlyAmount) {
        extracted.monthlyAmount = Math.round(extracted.annualContractValue / 12);
      }
      
      // Infer annual from total if multi-year
      if (extracted.totalContractValue && extracted.termMonths && !extracted.annualContractValue) {
        const years = extracted.termMonths / 12;
        if (years >= 1) {
          extracted.annualContractValue = Math.round(extracted.totalContractValue / years);
        }
      }
    }
    
    // Extract products - match various keywords
    const productPatterns = [
      /AI[- ]?Augmented[- ]?Contracting/gi,
      /AI[- ]?Augmented[- ]?M&A/gi,
      /Insights?/gi,
      /\bsigma\b/gi,
      /Compliance/gi,
      /Litigation/gi,
      /Cortex/gi,
      /M&A/gi,
      /Contracting/gi
    ];
    
    const foundProducts = new Set();
    for (const pattern of productPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const normalized = this.normalizeProductName(m);
          if (normalized) foundProducts.add(normalized);
        });
      }
    }
    
    // Also check for explicit Product Line(s) field
    const productLineMatch = text.match(/Product\s+Line\(s\)[:\s]+([^\n]+)/i);
    if (productLineMatch && productLineMatch[1]) {
      const productList = productLineMatch[1].split(/[;,]/);
      productList.forEach(p => {
        const normalized = this.normalizeProductName(p.trim());
        if (normalized) foundProducts.add(normalized);
      });
    }
    
    const productsArray = Array.from(foundProducts);
    extracted.parentProduct = this.determineParentProduct(productsArray);
    extracted.productLine = this.formatProductLines(productsArray);
    
    // Extract signatures
    for (const pattern of this.extractionPatterns.customerSignature) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Exclude Eudia people
        if (!Object.keys(EUDIA_SIGNERS).some(s => s.toLowerCase() === name.toLowerCase())) {
          extracted.customerSignedName = name;
          break;
        }
      }
    }
    
    for (const pattern of this.extractionPatterns.eudiaSignature) {
      const match = text.match(pattern);
      if (match) {
        extracted.eudiaSignedName = match[1] || match[0];
        break;
      }
    }
    
    // Extract signed date
    const dateMatch = text.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dateMatch) {
      extracted.signedDate = this.parseDate(dateMatch[1]);
    }
    
    // For CAB/LOI, add appropriate notes
    if (contractType.excludeMonetary) {
      if (text.toLowerCase().includes('committed spend')) {
        extracted.notes = 'LOI - Committed spend';
      } else {
        extracted.notes = 'Customer Advisory Board Agreement';
      }
    }
    
    return extracted;
  }

  /**
   * Validate extracted fields and assign confidence scores
   */
  validateAndScore(fields, contractType) {
    const validated = { ...fields, confidence: {}, warnings: [] };
    
    // Account name confidence
    if (fields.accountName) {
      validated.confidence.accountName = 0.8;
    } else {
      validated.warnings.push('Could not extract account/customer name');
      validated.confidence.accountName = 0;
    }
    
    // Date confidence
    if (fields.startDate) {
      validated.confidence.startDate = this.isValidDate(fields.startDate) ? 0.9 : 0.5;
    }
    if (fields.endDate) {
      validated.confidence.endDate = this.isValidDate(fields.endDate) ? 0.9 : 0.5;
    }
    
    // Term validation
    if (fields.termMonths && fields.termMonths > 0 && fields.termMonths <= 120) {
      validated.confidence.termMonths = 0.9;
    } else if (fields.termMonths) {
      validated.warnings.push(`Unusual term: ${fields.termMonths} months`);
      validated.confidence.termMonths = 0.5;
    }
    
    // Monetary validation (skip for LOI)
    if (!contractType.excludeMonetary) {
      if (fields.totalContractValue && fields.totalContractValue > 0) {
        validated.confidence.totalContractValue = 0.85;
      }
      if (fields.annualContractValue && fields.annualContractValue > 0) {
        validated.confidence.annualContractValue = 0.85;
      }
    } else {
      // Ensure monetary fields are null for CAB/LOI
      validated.totalContractValue = null;
      validated.annualContractValue = null;
      validated.monthlyAmount = null;
    }
    
    // Calculate overall confidence
    const confidenceValues = Object.values(validated.confidence);
    validated.overallConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0;
    
    return validated;
  }

  /**
   * Enrich extracted fields with Salesforce data (account matching, contact lookup)
   */
  async enrichWithSalesforceData(fields) {
    const enriched = { ...fields, salesforce: {} };
    
    // Match account name to Salesforce account
    if (fields.accountName) {
      try {
        const accountName = fields.accountName.replace(/'/g, "\\'");
        const accountQuery = `
          SELECT Id, Name, OwnerId, Owner.Name, Industry
          FROM Account
          WHERE Name LIKE '%${accountName}%'
          ORDER BY Name
          LIMIT 5
        `;
        
        const result = await query(accountQuery);
        
        if (result && result.totalSize > 0) {
          const bestMatch = result.records[0];
          enriched.salesforce.accountId = bestMatch.Id;
          enriched.salesforce.accountName = bestMatch.Name;
          enriched.salesforce.accountOwner = bestMatch.Owner?.Name;
          enriched.salesforce.accountOwnerId = bestMatch.OwnerId;
          enriched.salesforce.industry = bestMatch.Industry;
          enriched.confidence.accountMatch = 0.9;
          
          // Default contract owner to account owner (Business Lead)
          enriched.salesforce.contractOwnerId = bestMatch.OwnerId;
        } else {
          enriched.warnings.push(`No matching account found for: ${fields.accountName}`);
        }
        
      } catch (error) {
        logger.error('Account lookup failed:', error);
        enriched.warnings.push(`Account lookup failed: ${error.message}`);
      }
    }
    
    // Match customer signer to Contact
    if (fields.customerSignedName && enriched.salesforce.accountId) {
      try {
        const signerName = fields.customerSignedName.replace(/'/g, "\\'");
        const contactQuery = `
          SELECT Id, Name, Email, Title
          FROM Contact
          WHERE AccountId = '${enriched.salesforce.accountId}'
          AND Name LIKE '%${signerName}%'
          LIMIT 1
        `;
        
        const result = await query(contactQuery);
        
        if (result && result.totalSize > 0) {
          enriched.salesforce.customerSignedId = result.records[0].Id;
          enriched.salesforce.customerSignedName = result.records[0].Name;
        }
        
      } catch (error) {
        logger.warn('Contact lookup failed:', error.message);
      }
    }
    
    // Match Eudia signer
    if (fields.eudiaSignedName) {
      const normalizedName = fields.eudiaSignedName.replace(/Van\s+Reyk/i, 'Van Ryk');
      const signer = EUDIA_SIGNERS[normalizedName] || EUDIA_SIGNERS['Omar Haroun'];
      
      if (signer) {
        try {
          const userQuery = `SELECT Id, Name FROM User WHERE Name = '${signer.searchName}' AND IsActive = true LIMIT 1`;
          const result = await query(userQuery);
          
          if (result && result.totalSize > 0) {
            enriched.salesforce.companySignedId = result.records[0].Id;
            enriched.salesforce.companySignedName = result.records[0].Name;
          }
        } catch (error) {
          logger.warn('Eudia signer lookup failed:', error.message);
        }
      }
    }
    
    return enriched;
  }

  /**
   * Convert extracted fields to Salesforce Contract sObject format
   */
  toSalesforceRecord(enrichedFields) {
    const record = {
      // Required fields
      Contract_Name_Campfire__c: enrichedFields.contractName,
      AccountId: enrichedFields.salesforce?.accountId,
      StartDate: enrichedFields.startDate,
      EndDate: enrichedFields.endDate,
      ContractTerm: enrichedFields.termMonths,
      Contract_Type__c: enrichedFields.contractTypeValue,
      Status: 'Activated',
      OwnerId: enrichedFields.salesforce?.contractOwnerId,
      
      // AI Enabled - ALWAYS TRUE for all contracts
      AI_Enabled__c: true,
      
      // Currency
      Currency__c: 'USD'
    };
    
    // Monetary fields (only if not LOI)
    if (enrichedFields.totalContractValue) {
      record.Contract_Value__c = enrichedFields.totalContractValue;
    }
    if (enrichedFields.annualContractValue) {
      record.Annualized_Revenue__c = enrichedFields.annualContractValue;
    }
    if (enrichedFields.monthlyAmount) {
      record.Amount__c = enrichedFields.monthlyAmount;
    }
    
    // PRODUCT FIELDS - Properly formatted
    // Parent_Product__c = Single select (string)
    if (enrichedFields.parentProduct && enrichedFields.parentProduct !== 'None specified') {
      record.Parent_Product__c = enrichedFields.parentProduct;
    }
    
    // Product_Line__c = Multi-select (semicolon-separated string)
    if (enrichedFields.productLine) {
      record.Product_Line__c = enrichedFields.productLine;
    }
    
    // Signature fields
    if (enrichedFields.salesforce?.customerSignedId) {
      record.CustomerSignedId = enrichedFields.salesforce.customerSignedId;
    }
    if (enrichedFields.customerSignedName) {
      record.Contact_Signed__c = enrichedFields.customerSignedName;
    }
    if (enrichedFields.signedDate) {
      record.CustomerSignedDate = enrichedFields.signedDate;
    }
    if (enrichedFields.salesforce?.companySignedId) {
      record.CompanySignedId = enrichedFields.salesforce.companySignedId;
    }
    
    // Notes
    if (enrichedFields.notes) {
      record.Notes__c = enrichedFields.notes;
    }
    
    // Industry from account
    if (enrichedFields.salesforce?.industry) {
      record.Industry__c = enrichedFields.salesforce.industry;
    }
    
    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Handle MM/DD/YYYY format
    const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (slashMatch) {
      let year = parseInt(slashMatch[3]);
      if (year < 100) year += 2000;
      return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
    }
    
    // Handle "Month DD, YYYY" format
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthMatch = dateStr.toLowerCase().match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (monthMatch) {
      const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
      if (monthIdx >= 0) {
        return `${monthMatch[3]}-${String(monthIdx + 1).padStart(2, '0')}-${monthMatch[2].padStart(2, '0')}`;
      }
    }
    
    return null;
  }

  addMonthsToDate(dateStr, months) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + months);
    // Subtract one day for anniversary logic
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  }

  calculateTermMonths(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Calculate difference in months (don't add 1 - the term is the duration, not inclusive count)
    let months = (end.getFullYear() - start.getFullYear()) * 12 + 
                 (end.getMonth() - start.getMonth());
    
    // If end day is >= start day, it's a full month
    if (end.getDate() >= start.getDate()) {
      months = months; // Keep as is
    }
    
    // Round to nearest common term (12, 24, 36, etc.) if within 1 month
    const commonTerms = [12, 24, 36, 48, 60];
    for (const term of commonTerms) {
      if (Math.abs(months - term) <= 1) {
        return term;
      }
    }
    
    return Math.max(1, months);
  }

  parseMoneyValue(str) {
    if (!str) return null;
    // Remove $ and commas, parse as number
    const cleaned = str.replace(/[$,\s]/g, '');
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  }

  /**
   * Normalize product name to match Salesforce picklist values EXACTLY
   */
  normalizeProductName(product) {
    const normalized = product.toLowerCase().trim();
    
    // Match to exact Salesforce picklist values
    if (normalized.includes('contracting') || 
        (normalized.includes('ai') && normalized.includes('augmented') && !normalized.includes('m&a'))) {
      return 'AI Augmented - Contracting';
    }
    if (normalized.includes('m&a') || normalized.includes('merger') || normalized.includes('acquisition')) {
      return 'AI Augmented - M&A';
    }
    if (normalized.includes('insight')) return 'Insights';
    if (normalized.includes('sigma')) return 'sigma';
    if (normalized.includes('compliance')) return 'Compliance';
    if (normalized.includes('litigation')) return 'Litigation';
    if (normalized.includes('cortex')) return 'Cortex';
    
    return null; // Unknown product
  }

  /**
   * Determine Parent Product (single select) from list of products
   */
  determineParentProduct(products) {
    if (!products || products.length === 0) return 'None specified';
    
    // Filter out nulls
    const validProducts = products.filter(p => p !== null);
    
    if (validProducts.length === 0) return 'None specified';
    if (validProducts.length > 1) return 'Multiple';
    
    return validProducts[0];
  }

  /**
   * Format Product Lines for multi-select field (semicolon separated)
   */
  formatProductLines(products) {
    if (!products || products.length === 0) return null;
    
    // Filter valid products and join with semicolons
    const validProducts = products.filter(p => p !== null);
    
    if (validProducts.length === 0) return null;
    
    return validProducts.join(';');
  }

  isValidDate(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2035;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════
const contractAnalyzer = new ContractAnalyzer();

module.exports = {
  contractAnalyzer,
  ContractAnalyzer,
  SALESFORCE_CONTRACT_FIELDS,
  CONTRACT_TYPE_PATTERNS,
  OWNER_USER_IDS
};

