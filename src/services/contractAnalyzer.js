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
  // EndDate is auto-calculated by Salesforce from StartDate + ContractTerm - DO NOT SET
  'ContractTerm': { label: 'Contract Term (months)', required: true, type: 'number' },
  'Contract_Type__c': { label: 'Contract Type', required: true, type: 'picklist', values: ['Recurring', 'LOI', 'One-Time', 'Amendment'] },
  'Status': { label: 'Status', required: true, type: 'picklist', values: ['Draft', 'In Approval', 'Activated', 'Terminated', 'Expired'] },
  'OwnerId': { label: 'Contract Owner', required: true, type: 'lookup' },
  
  // MONETARY FIELDS (NOT for CAB/LOI - except Delinea)
  'Contract_Value__c': { label: 'Total Contract Value', required: false, type: 'currency' },
  'Annualized_Revenue__c': { label: 'Annual Contract Value', required: false, type: 'currency' },
  'Amount__c': { label: 'Monthly Amount (subscription)', required: false, type: 'currency' },
  
  // PRODUCT FIELDS (Contract object - different from Opportunity!)
  // Parent Product is SINGLE SELECT
  'Parent_Product__c': { 
    label: 'Parent Product', 
    required: false, 
    type: 'picklist', 
    values: [
      'AI Augmented - Contracting',
      'AI Augmented - M&A',
      'Compliance',
      'AI Platform - Litigation',
      'AI Platform - Sigma',
      'Other',
      'AI Platform - Insights',
      'Multiple',
      'None specified',
      'Cortex',
      'Contracting',
      'MLS',
      'ODL',
      'Lift & Shift'
    ] 
  },
  // Product Line(s) is MULTI-SELECT (Contract object - includes EU service lines)
  'Product_Line__c': { 
    label: 'Product Line(s)', 
    required: false, 
    type: 'multipicklist',
    values: [
      'AI Augmented - Contracting',
      'AI Augmented - M&A',
      'AI Platform - Sigma',
      'AI Platform - Litigation',
      'Compliance',
      'Cortex',
      'Multiple',
      'Undetermined',
      'AI Platform - Insights',
      'Other',
      'Data Privacy Support',
      'Legal Support',
      'BAU',
      'Paralegal Support',
      'Discovery',
      'Privacy',
      'Legal & Compliance',
      'Contracting',
      'Lift & Shift',
      'DSAR'
    ]
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
    confidenceBoost: 0.20  // Higher boost for CAB detection
  },
  RECURRING: {
    keywords: [
      'Master Services Agreement', 'MSA', 'Subscription', 'Annual',
      'Recurring', 'Service Order', 'Statement of Work', 'SOW',
      'Year 1', 'Year 2', 'Year 3', 'annual fee', 'monthly fee',
      'AI-Augmented', 'Contracting Support Order', 'Support Order',
      'managed legal service', 'SCOPE OF SERVICES', 'FEES AND PAYMENT'
    ],
    excludeMonetaryFields: false,
    defaultContractType: 'Recurring',
    confidenceBoost: 0.15  // Strong boost for recurring indicators
  },
  AMENDMENT: {
    keywords: [
      'Addendum', 'Modification', 'Supplemental', 'extends'
    ],
    // NOTE: "Amended and Restated" does NOT mean Amendment type
    // It means a new version that replaces the old - still Recurring
    excludeMonetaryFields: false,
    defaultContractType: 'Amendment',
    confidenceBoost: 0.05  // Lower boost - be careful about amendments
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
// Maps extracted names to their Salesforce User search name
// ═══════════════════════════════════════════════════════════════════════════
const EUDIA_SIGNERS = {
  // Leadership
  'Omar Haroun': { id: null, role: 'CEO', searchName: 'Omar Haroun' },
  'David Van Ryk': { id: null, role: 'President', searchName: 'David Van Ryk' },
  'David Van Reyk': { id: null, role: 'President', searchName: 'David Van Ryk' },
  // Legal/Compliance
  'Zoila Mena Harpin': { id: null, role: 'Compliance Officer', searchName: 'Zoila Mena Harpin' },
  'Zoila Harpin': { id: null, role: 'Compliance Officer', searchName: 'Zoila Mena Harpin' },
  'Zoila Mena': { id: null, role: 'Compliance Officer', searchName: 'Zoila Mena Harpin' },
  // Operations
  'Keigan Pesenti': { id: null, role: 'RevOps', searchName: 'Keigan Pesenti' }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT OWNER TO CONTRACT OWNER MAPPING (Business Leads)
// ═══════════════════════════════════════════════════════════════════════════
// IMPORTANT: These IDs must match active Salesforce User records
// If contract creation fails with "Owner ID not found", verify the ID in Salesforce
const OWNER_USER_IDS = {
  'Julie Stefanich': '005Wj00000KDcFqIAL',
  'Nathan Agarwal': '005Wj00000M2FnHIAV',
  'Asad Hussain': '005Wj00000DT05BIAT',    // Updated 2025-12-03
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
   * Extract text from PDF buffer - Multi-method approach
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      // Validate we have a buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Empty PDF buffer');
      }
      
      logger.info(`📄 Processing PDF buffer: ${pdfBuffer.length} bytes`);
      
      // Check first 20 bytes to understand file type
      const headerBytes = pdfBuffer.slice(0, 20);
      const headerStr = headerBytes.toString('utf8');
      const headerHex = headerBytes.toString('hex');
      logger.info(`📄 File header (string): "${headerStr.substring(0, 15)}"`);
      logger.info(`📄 File header (hex): ${headerHex.substring(0, 20)}`);
      
      // Check if this is actually a PDF
      const isPDF = headerStr.includes('%PDF');
      logger.info(`📄 Is valid PDF: ${isPDF}`);
      
      // METHOD 1: Try pdf-parse first
      let text = await this.tryPdfParse(pdfBuffer);
      if (text && text.length > 100) {
        logger.info(`✅ Method 1 (pdf-parse) succeeded: ${text.length} chars`);
        return text;
      }
      
      // METHOD 2: Try raw text extraction from PDF structure
      logger.info('📄 Trying Method 2: PDF structure extraction...');
      text = this.extractFromPDFStructure(pdfBuffer);
      if (text && text.length > 100) {
        logger.info(`✅ Method 2 (structure) succeeded: ${text.length} chars`);
        return text;
      }
      
      // METHOD 3: Try extracting readable strings
      logger.info('📄 Trying Method 3: String extraction...');
      text = this.extractReadableStrings(pdfBuffer);
      if (text && text.length > 100) {
        logger.info(`✅ Method 3 (strings) succeeded: ${text.length} chars`);
        return text;
      }
      
      // METHOD 4: Aggressive text recovery
      logger.info('📄 Trying Method 4: Aggressive recovery...');
      text = this.aggressiveTextRecovery(pdfBuffer);
      if (text && text.length > 50) {
        logger.info(`✅ Method 4 (aggressive) succeeded: ${text.length} chars`);
        return text;
      }
      
      throw new Error('All extraction methods failed - PDF may be image-only or encrypted');
      
    } catch (error) {
      logger.error('PDF parsing failed:', error);
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Method 1: Try pdf-parse library, with pdfjs-dist fallback
   */
  async tryPdfParse(pdfBuffer) {
    // First try pdf-parse
    try {
      let pdfParse;
      try {
        pdfParse = require('pdf-parse');
        logger.info('📦 pdf-parse module loaded');
      } catch (e) {
        logger.warn(`📦 pdf-parse not available: ${e.message}`);
        // Fall through to pdfjs-dist
      }
      
      if (pdfParse) {
        const data = await pdfParse(pdfBuffer);
        if (data.text && data.text.length > 50) {
          return data.text;
        }
      }
    } catch (error) {
      logger.warn(`pdf-parse error: ${error.message}`);
    }
    
    // Try pdfjs-dist as fallback
    try {
      logger.info('📦 Trying pdfjs-dist...');
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      
      // Disable worker for Node.js
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdfDoc = await loadingTask.promise;
      
      let fullText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      if (fullText.length > 50) {
        logger.info(`✅ pdfjs-dist extracted ${fullText.length} chars`);
        return fullText;
      }
    } catch (pdfjsError) {
      logger.warn(`pdfjs-dist error: ${pdfjsError.message}`);
    }
    
    return null;
  }

  /**
   * Method 2: Extract text from PDF internal structure
   */
  extractFromPDFStructure(pdfBuffer) {
    try {
      const text = pdfBuffer.toString('binary');
      let extracted = '';
      
      // Look for text between BT (begin text) and ET (end text) operators
      const btEtPattern = /BT\s*([\s\S]*?)\s*ET/gi;
      const btEtMatches = text.match(btEtPattern) || [];
      
      for (const block of btEtMatches) {
        // Extract Tj and TJ operators (text showing)
        const tjPattern = /\(([^)]*)\)\s*Tj/gi;
        let match;
        while ((match = tjPattern.exec(block)) !== null) {
          extracted += this.decodePDFString(match[1]) + ' ';
        }
        
        // TJ arrays
        const tjArrayPattern = /\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/gi;
        while ((match = tjArrayPattern.exec(block)) !== null) {
          const items = match[1].match(/\(([^)]*)\)/g) || [];
          for (const item of items) {
            extracted += this.decodePDFString(item.slice(1, -1)) + '';
          }
          extracted += ' ';
        }
      }
      
      return extracted.replace(/\s+/g, ' ').trim();
    } catch (error) {
      logger.warn(`Structure extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Method 3: Extract all readable strings from buffer
   */
  extractReadableStrings(pdfBuffer) {
    try {
      const text = pdfBuffer.toString('utf8');
      
      // Find all sequences of printable ASCII characters
      const stringPattern = /[\x20-\x7E]{4,}/g;
      const matches = text.match(stringPattern) || [];
      
      // Filter out PDF operators and binary garbage
      const filtered = matches.filter(s => {
        // Skip PDF operators and technical strings
        if (/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/i.test(s)) return false;
        if (/^[\d\s.]+$/.test(s)) return false; // Just numbers
        if (s.length < 5) return false;
        // Keep strings with actual words
        return /[a-zA-Z]{3,}/.test(s);
      });
      
      return filtered.join(' ').replace(/\s+/g, ' ').trim();
    } catch (error) {
      logger.warn(`String extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Method 4: Aggressive text recovery - last resort
   */
  aggressiveTextRecovery(pdfBuffer) {
    try {
      // Try multiple encodings
      const encodings = ['utf8', 'latin1', 'ascii'];
      let bestText = '';
      
      for (const encoding of encodings) {
        try {
          const text = pdfBuffer.toString(encoding);
          
          // Extract anything that looks like sentences
          const sentencePattern = /[A-Z][a-z]+(?:\s+[a-zA-Z]+){2,}[.!?]?/g;
          const sentences = text.match(sentencePattern) || [];
          
          // Extract potential keywords
          const keywordPattern = /(?:Customer|Agreement|Eudia|Contract|Date|Term|Service|Board|Advisory|CAB|Sigma|Legal)/gi;
          const keywords = text.match(keywordPattern) || [];
          
          // Build recovered text
          const recovered = [...new Set([...sentences, ...keywords])].join(' ');
          
          if (recovered.length > bestText.length) {
            bestText = recovered;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Also try to find structured data
      const structuredPatterns = [
        /Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /(?:Best Buy|Chevron|Coherent|Pure Storage)[^.]*\./gi,
        /Customer Advisory Board/gi,
        /Effective Date/gi
      ];
      
      const text = pdfBuffer.toString('utf8');
      for (const pattern of structuredPatterns) {
        const matches = text.match(pattern) || [];
        bestText += ' ' + matches.join(' ');
      }
      
      return bestText.replace(/\s+/g, ' ').trim();
    } catch (error) {
      logger.warn(`Aggressive recovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Decode PDF string escapes
   */
  decodePDFString(str) {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\(\d{3})/g, (match, oct) => String.fromCharCode(parseInt(oct, 8)));
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
    
    // Special case: "Amended and Restated" is NOT an Amendment - it's a new Recurring contract
    // that replaces an old one. Check for service delivery indicators.
    if (textLower.includes('amended and restated') && 
        (textLower.includes('scope of services') || 
         textLower.includes('fees and payment') ||
         textLower.includes('managed legal service'))) {
      bestMatch.type = 'Recurring';
      bestMatch.excludeMonetary = false;
      bestMatch.confidence = Math.max(bestMatch.confidence, 0.85);
      logger.info('📋 "Amended and Restated" with service terms → Recurring (not Amendment)');
    }
    
    // If we have Year pricing, it's definitely Recurring
    if (textLower.includes('year 1') || textLower.includes('year 2') || textLower.includes('year 3')) {
      bestMatch.type = 'Recurring';
      bestMatch.excludeMonetary = false;
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
    
    // Contract Name = PDF filename (cleaned up)
    // This is what gets synced to Campfire ERP, so it should match the document name
    if (fileName) {
      // Clean the filename: remove extension, .cleaned, dates in parens, version numbers
      let cleanName = fileName
        .replace(/\.pdf$/i, '')
        .replace(/\.cleaned$/i, '')
        .replace(/\.docx$/i, '')
        .replace(/\s*\(\d+\)\s*/g, '')           // Remove (1), (2) version numbers
        .replace(/\s*\(\d+\.\d+\.\d+[^)]*\)/g, '') // Remove (10.31.25 Final)
        .replace(/\s+/g, ' ')
        .trim();
      
      extracted.contractName = cleanName;
      logger.info(`📄 Contract Name (from filename): "${cleanName}"`);
    } else {
      // Fallback: extract from text
      const contractNameMatch = text.match(/^#?\s*(?:Exhibit\s+[A-Z])?[\s\n]*(.+?(?:Order|Agreement|Memorandum|Contract))/im);
      if (contractNameMatch) {
        extracted.contractName = contractNameMatch[1].trim().replace(/\s+/g, ' ');
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ACCOUNT NAME EXTRACTION - Multiple strategies
    // ═══════════════════════════════════════════════════════════════════════════
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STRATEGY 1: Extract from FILENAME (most reliable)
    // Account name is ALWAYS in the filename - it's the CLIENT, NEVER Eudia/Cicero
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Terms that are NEVER the account (internal/generic)
    const INVALID_ACCOUNT_NAMES = [
      'eudia', 'cicero', 'the', 'this', 'cab', 'msa', 'agreement', 'contract', 
      'order', 'exhibit', 'final', 'execution', 'executed', 'cleaned', 'pdf',
      'docx', 'inc', 'llc', 'corp', 'ltd', 'technologies', 'project', 'ai'
    ];
    
    logger.info(`📋 Attempting to extract account from filename: "${fileName}"`);
    
    // Clean filename for matching
    const cleanFileName = fileName
      .replace(/\.pdf$/i, '')
      .replace(/\.cleaned$/i, '')
      .replace(/\.docx$/i, '')
      .replace(/\(\d+\.\d+\.\d+[^)]*\)/g, '')  // Remove (10.31.25 Final)
      .replace(/\(\d+\)/g, '')                  // Remove (2) version numbers
      .replace(/\d{4}-\d{2}-\d{2}/g, '')        // Remove 2025-10-06
      .replace(/\d{8}/g, '')                    // Remove 20251113
      .replace(/\s+/g, ' ')
      .trim();
    
    logger.info(`📋 Cleaned filename: "${cleanFileName}"`);
    
    // Helper function to validate account name
    const isValidAccountName = (name) => {
      if (!name || name.length < 2) return false;
      const lowerName = name.toLowerCase().trim();
      return !INVALID_ACCOUNT_NAMES.some(invalid => lowerName === invalid || lowerName.startsWith(invalid + ' '));
    };
    
    // Pattern priority order - PRIORITIZE patterns that find CLIENT name (not Eudia)
    // Allow multi-word company names like "Pure Storage"
    const fileNamePatterns = [
      // HIGHEST PRIORITY: "CompanyName_Description_SOW_..." - account name at start with underscore separator
      // e.g., "Ecolab_Marketing_Compliance_SOW_25_Nov_2025" → "Ecolab"
      { pattern: /^([A-Z][A-Za-z]+)_(?:Marketing|Sales|Legal|Compliance|AI|M&A|Contracting|Service|Support|SOW|MSA|Agreement)/i, group: 1 },
      // Generic: First word before underscore if it looks like a company name (capitalized, 3+ chars)
      { pattern: /^([A-Z][A-Za-z]{2,})_/i, group: 1 },
      // "CompanyName-Eudia" or "CompanyName_Eudia" (Company BEFORE Eudia)
      { pattern: /^([A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+)?)[-_\s]+(?:Eudia|Cicero)/i, group: 1 },
      // "CompanyName_AI Managed" or "CompanyName_AI Augmented" (underscore + AI)
      { pattern: /^([A-Z][A-Za-z]+)[-_]AI\s/i, group: 1 },
      // "Eudia - CompanyName Order" or "Eudia - CompanyName, Inc." or "Eudia - CAB Memorandum- Company"
      { pattern: /Eudia\s*[-–]\s*(?:CAB\s+)?(?:Memorandum)?[-–\s]*([A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+)?)/i, group: 1 },
      // "Memorandum- CompanyName" (CAB memorandums)
      { pattern: /Memorandum[-_\s]+([A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+)?)/i, group: 1 },
      // "CompanyName A&R" or "CompanyName Agreement" at START
      { pattern: /^([A-Z][A-Za-z]+)\s+(?:A&R|AI|Agreement|MSA|Order)/i, group: 1 },
      // "CompanyName - Description" at START
      { pattern: /^([A-Z][A-Za-z]+)\s*[-–]/, group: 1 },
    ];
    
    for (const { pattern, group } of fileNamePatterns) {
      const match = cleanFileName.match(pattern);
      if (match && match[group]) {
        let name = match[group].trim()
          .replace(/[-_]/g, ' ')
          .replace(/,?\s*(Inc|LLC|Corp|Ltd)\.?$/i, '')
          .trim();
        
        if (isValidAccountName(name)) {
          extracted.accountName = name;
          logger.info(`📋 Account from filename: "${extracted.accountName}" (pattern: ${pattern.toString()})`);
          break;
        }
      }
    }
    
    // Strategy 2: "DBA [Company Name]" pattern (e.g., "Exel Inc. DBA DHL Supply Chain")
    if (!extracted.accountName) {
      const dbaMatch = text.match(/DBA\s+([A-Z][A-Za-z\s]+?)(?:\s+and|\s+\(|,)/i);
      if (dbaMatch && dbaMatch[1]) {
        extracted.accountName = dbaMatch[1].trim();
        logger.info(`📋 Account from DBA pattern: "${extracted.accountName}"`);
      }
    }
    
    // Strategy 3: "between [Company] and Eudia/Cicero"
    if (!extracted.accountName) {
      const betweenMatch = text.match(/between\s+([A-Z][A-Za-z\s&,.]+?)(?:\s+and\s+(?:Eudia|Cicero)|\s+\()/i);
      if (betweenMatch && betweenMatch[1]) {
        const name = betweenMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?$/i, '')
          .trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
          logger.info(`📋 Account from 'between' pattern: "${extracted.accountName}"`);
        }
      }
    }
    
    // Strategy 4: "Company Corp. ("Customer" or "Name")"
    if (!extracted.accountName) {
      const customerOrPatterns = [
        /([A-Z][A-Za-z\s&]+?(?:Corp|Inc|LLC|Ltd|Co)\.?)\s*\(\s*["']?Customer["']?\s*or\s*["']([A-Z][A-Za-z]+)["']\s*\)/i,
        /([A-Z][A-Za-z\s&]+?(?:Corp|Inc|LLC|Ltd|Co)\.?)\s*\(\s*["']?Customer["']?\s*\)/i,
      ];
      
      for (const pattern of customerOrPatterns) {
        const match = text.match(pattern);
        if (match) {
          const shortName = match[2];
          const fullName = match[1]?.replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?$/i, '').trim();
          
          if (shortName && !shortName.toLowerCase().includes('customer')) {
            extracted.accountName = shortName;
          } else if (fullName && !fullName.toLowerCase().includes('eudia') && !fullName.toLowerCase().includes('cicero')) {
            extracted.accountName = fullName;
          }
          
          if (extracted.accountName) {
            logger.info(`📋 Account from Customer pattern: "${extracted.accountName}"`);
            break;
          }
        }
      }
    }
    
    // Strategy 5: Title line - "Agreement - Company Name" or "Appointment - Company Name"
    if (!extracted.accountName) {
      const titleMatch = text.match(/(?:Agreement|Appointment|MSA)\s*[-–]\s*([A-Z][A-Za-z\s&,.]+?)(?:\s*\n|$)/i);
      if (titleMatch && titleMatch[1]) {
        const name = titleMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?,?\s*$/i, '')
          .trim();
        if (!name.toLowerCase().includes('eudia') && name.length > 2) {
          extracted.accountName = name;
          logger.info(`📋 Account from title: "${extracted.accountName}"`);
        }
      }
    }
    
    // Clean up and VALIDATE account name
    if (extracted.accountName) {
      extracted.accountName = extracted.accountName
        .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co|Company|Technologies)\.?,?\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // CRITICAL: Account can NEVER be Eudia/Cicero - these are internal
      const invalidNames = ['eudia', 'cicero', 'customer', 'company', 'the', 'this'];
      const lowerName = extracted.accountName.toLowerCase();
      
      if (invalidNames.includes(lowerName) || extracted.accountName.length < 3) {
        logger.warn(`📋 Rejecting invalid account name: "${extracted.accountName}"`);
        extracted.accountName = null;
      }
    }
    
    // If still no account, try extracting from text content
    if (!extracted.accountName) {
      // Look for "between Eudia and [Company]" pattern
      const betweenMatch = text.match(/between\s+(?:Eudia|Cicero)[^a-z]*and\s+([A-Z][A-Za-z\s]+?)(?:\s*\(|\s*dated|\s*,)/i);
      if (betweenMatch && betweenMatch[1]) {
        const name = betweenMatch[1].trim().replace(/,?\s*(Inc|Corp|LLC|Ltd)\.?$/i, '').trim();
        if (name.length >= 3 && !name.toLowerCase().includes('eudia')) {
          extracted.accountName = name;
          logger.info(`📋 Account from 'between Eudia and' pattern: "${extracted.accountName}"`);
        }
      }
    }
    
    // Try "Customer" definition in text: "Company Name ("Customer")"
    if (!extracted.accountName) {
      const customerDefMatch = text.match(/([A-Z][A-Za-z\s&]+?(?:Inc|Corp|LLC|Ltd)?\.?)\s*\(\s*["']?Customer["']?\s*\)/i);
      if (customerDefMatch && customerDefMatch[1]) {
        const name = customerDefMatch[1].trim().replace(/,?\s*(Inc|Corp|LLC|Ltd)\.?$/i, '').trim();
        if (name.length >= 3 && !name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
          logger.info(`📋 Account from Customer definition: "${extracted.accountName}"`);
        }
      }
    }
    
    logger.info(`📋 Final account name: "${extracted.accountName || 'NOT FOUND'}"`);
    
    
    // Pattern 2: Appointment format - "Appointment - Best Buy Co., Inc."
    if (!extracted.accountName) {
      const appointmentMatch = text.match(/Appointment\s*[–-]\s*([A-Z][A-Za-z\s&,.']+?)(?:\s*\.|$|\n)/i);
      if (appointmentMatch && appointmentMatch[1]) {
        extracted.accountName = appointmentMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?,?\s*$/i, '')
          .trim();
      }
    }
    
    // Pattern 3: From filename for CAB/Memorandum contracts - "CAB Memorandum- BestBuy"
    if (!extracted.accountName) {
      const fileNameMatch = fileName.match(/(?:CAB|Memorandum)[_\s-]+([A-Za-z][A-Za-z\s&]+?)(?:\s+\d{4}|\.|\s+EXECUTION|$)/i);
      if (fileNameMatch && fileNameMatch[1]) {
        extracted.accountName = fileNameMatch[1].trim().replace(/-/g, ' ');
      }
    }
    
    // Pattern 4: "between Eudia and [Company]" - simple format
    if (!extracted.accountName) {
      const betweenMatch = text.match(/between\s+(?:Eudia|Cicero[^)]*?)\s+and\s+([A-Z][A-Za-z\s&,.]+?)(?:\s*\.|,|\n)/i);
      if (betweenMatch && betweenMatch[1]) {
        const name = betweenMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?$/i, '')
          .trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
        }
      }
    }
    
    // Pattern 5: Title contains company - "Eudia Customer Advisory Board Appointment - Best Buy Co., Inc."
    if (!extracted.accountName) {
      const titleMatch = text.match(/(?:Advisory\s+Board\s+Appointment|Agreement)\s*[–-]\s*([A-Z][A-Za-z\s&,.]+?)(?:\s*\n|$)/i);
      if (titleMatch && titleMatch[1]) {
        extracted.accountName = titleMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?,?\s*$/i, '')
          .trim();
      }
    }
    
    // Pattern 6: Simple "Title - Company" format - "Chevron - Gibson Dunn Agreement"
    if (!extracted.accountName) {
      const simpleTitleMatch = text.match(/^([A-Z][A-Za-z]+)\s*[-–]\s*(?:Gibson|Agreement)/im);
      if (simpleTitleMatch && simpleTitleMatch[1]) {
        const name = simpleTitleMatch[1].trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('exhibit')) {
          extracted.accountName = name;
        }
      }
    }
    
    // Pattern 7: "entered into...and [Company]"
    if (!extracted.accountName) {
      const enteredMatch = text.match(/entered\s+into.*?and\s+([A-Z][A-Za-z]+)(?:\s*\.|,|\n)/i);
      if (enteredMatch && enteredMatch[1]) {
        const name = enteredMatch[1].trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
        }
      }
    }
    
    // Pattern 6: Direct "Customer" definition - '("Customer")'  
    if (!extracted.accountName) {
      const customerDefMatch = text.match(/([A-Z][A-Za-z\s&,.]+?(?:Corp|Inc|LLC|Ltd|Co)\.?)\s*\(\s*["']?Customer["']?\s*\)/i);
      if (customerDefMatch && customerDefMatch[1]) {
        const name = customerDefMatch[1].trim()
          .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?$/i, '')
          .trim();
        if (!name.toLowerCase().includes('eudia') && !name.toLowerCase().includes('cicero')) {
          extracted.accountName = name;
        }
      }
    }
    
    logger.info(`📋 Extracted account name: "${extracted.accountName || 'NOT FOUND'}"`);
    
    // Log a snippet of text for debugging
    logger.info(`📋 Text sample (first 500 chars): ${text.substring(0, 500).replace(/\n/g, ' ')}`);
    
    // Clean up account name
    if (extracted.accountName) {
      extracted.accountName = extracted.accountName
        .replace(/,?\s*(Inc|Corp|LLC|Ltd|Co|Company)\.?,?\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SIGNATURE EXTRACTION - Names from signature blocks
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Known Eudia/Cicero signers (check for these specifically)
    // These are internal team members who sign on behalf of Eudia
    const KNOWN_EUDIA_SIGNERS = [
      // Leadership
      'Omar Haroun', 'OMAR HAROUN',
      'David Van Ryk', 'David VanRyk', 'DAVID VAN RYK', 'David Van Reyk', 'DAVID VAN REYK',
      // Legal/Compliance
      'Zoila Mena Harpin', 'ZOILA MENA HARPIN', 'Zoila Harpin', 'Zoila Mena',
      // Operations
      'Keigan Pesenti', 'KEIGAN PESENTI',
      // Add other signers as needed
    ];
    
    // Map signer names to their canonical form for Salesforce lookup
    const EUDIA_SIGNER_CANONICAL = {
      'omar': 'Omar Haroun',
      'david': 'David Van Ryk',
      'zoila': 'Zoila Mena Harpin',
      'keigan': 'Keigan Pesenti'
    };
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DOCUSIGN SIGNATURE BLOCK EXTRACTION
    // DocuSign format typically has signature blocks with:
    // - "Signed by:" or signature line
    // - Person's name (e.g., "Zoila Mena Harpin, Compliance Officer")
    // - Company name (e.g., "Eudia Counsel, LLC" or "Ecolab Inc.")
    // - Date line
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Find all signature blocks with name + company patterns
    const signatureBlockPatterns = [
      // DocuSign format: Name, Title \n Company
      // e.g., "Zoila Mena Harpin, Compliance Officer\nEudia Counsel, LLC"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}),?\s*(?:Compliance Officer|President|CEO|CFO|COO|CTO|CLO|General Counsel|VP|Vice President|Director|Officer|Secretary|Manager)[^]*?(Eudia|Cicero|Ecolab|Inc\.|LLC|Corp)/gi,
      
      // Name followed by company on same or next line
      /([A-Z][a-z]+\s+(?:[A-Z][a-z]+\s*)+)[,\s\n]+(Eudia\s+Counsel|Cicero|Ecolab\s+Inc)/gi,
    ];
    
    // Strategy 1: Look for signature blocks near "Eudia Counsel" - these are Eudia signers
    const eudiaSignatureMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})[,\s]+(?:Compliance\s+Officer|President|CEO|VP)[,\s\n]*Eudia\s+Counsel/i);
    if (eudiaSignatureMatch && eudiaSignatureMatch[1]) {
      const name = eudiaSignatureMatch[1].trim();
      if (name.length > 4 && !name.match(/^(The|This|Such|Said)/i)) {
            extracted.eudiaSignedName = name;
        logger.info(`✍️ Eudia signer (DocuSign block): ${name}`);
      }
    }
    
    // Strategy 2: Look for signature blocks near customer company name - these are customer signers
    // Use the extracted account name to find the customer's signature block
    const customerCompany = extracted.accountName || '';
    
    // Words that are NEVER part of a person's name - filter these out
    const INVALID_NAME_WORDS = [
      'the', 'this', 'such', 'said', 'date', 'name', 'title', 'by', 'letter', 
      'between', 'agreement', 'contract', 'engagement', 'statement', 'exhibit',
      'scope', 'services', 'eudia', 'cicero', 'counsel', 'client', 'firm',
      'attached', 'made', 'entered', 'party', 'parties', 'hereto', 'whereas',
      'marketing', 'compliance', 'software', 'license', 'terms'
    ];
    
    // Function to check if a name is valid (not contract jargon)
    const isValidPersonName = (name) => {
      if (!name || name.length < 5) return false;
      const words = name.toLowerCase().split(/\s+/);
      // All words must be actual names (not contract terms)
      return words.every(w => !INVALID_NAME_WORDS.includes(w)) &&
             // Names should be properly capitalized words
             name.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/);
    };
    
    if (customerCompany && !extracted.customerSignedName) {
      // Build pattern to find name near the company name
      const escapedCompany = customerCompany.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Strategy 2a: Look in "AGREED AND ACCEPTED" section for customer signature
      // This section is specifically for signatures
      const agreedSection = text.match(/AGREED\s+AND\s+ACCEPTED[\s\S]*$/i);
      if (agreedSection) {
        const signatureText = agreedSection[0];
        
        // Look for name followed by title near company name
        // Pattern: "Jandeen Boone\nExecutive Vice President...\nEcolab Inc."
        const customerBlockMatch = signatureText.match(
          new RegExp(`([A-Z][a-z]+\\s+[A-Z][a-z]+)\\s*\\n[^\\n]*(?:President|VP|Vice|Director|Counsel|Officer|Secretary|Manager|Chief)[^\\n]*\\n[^\\n]*${escapedCompany}`, 'i')
        );
        
        if (customerBlockMatch && customerBlockMatch[1]) {
          const name = customerBlockMatch[1].trim();
          if (isValidPersonName(name)) {
            extracted.customerSignedName = name;
            logger.info(`✍️ Customer signer (AGREED section): ${name}`);
        }
      }
        
        // Alternative: Name on line right before company name
        if (!extracted.customerSignedName) {
          const nameBeforeCompanyMatch = signatureText.match(
            new RegExp(`([A-Z][a-z]+\\s+[A-Z][a-z]+)[\\s\\n]+[^]*?${escapedCompany}\\s*(?:Inc|LLC|Corp)?`, 'i')
          );
          if (nameBeforeCompanyMatch && nameBeforeCompanyMatch[1]) {
            const name = nameBeforeCompanyMatch[1].trim();
            const isEudiaPerson = KNOWN_EUDIA_SIGNERS.some(es => 
              name.toLowerCase().includes(es.split(' ')[0].toLowerCase())
            );
            if (!isEudiaPerson && isValidPersonName(name)) {
              extracted.customerSignedName = name;
              logger.info(`✍️ Customer signer (before ${customerCompany}): ${name}`);
            }
          }
        }
      }
      
      // Strategy 2b: Look for "By:" line near customer company
      if (!extracted.customerSignedName) {
        const byLineMatch = text.match(
          new RegExp(`By[:\\s]+[_\\/s]*\\s*([A-Z][a-z]+\\s+[A-Z][a-z]+)[^]*?${escapedCompany}`, 'i')
        );
        if (byLineMatch && byLineMatch[1]) {
          const name = byLineMatch[1].trim();
          const isEudiaPerson = KNOWN_EUDIA_SIGNERS.some(es => 
            name.toLowerCase().includes(es.split(' ')[0].toLowerCase())
          );
          if (!isEudiaPerson && isValidPersonName(name)) {
            extracted.customerSignedName = name;
            logger.info(`✍️ Customer signer (By line near ${customerCompany}): ${name}`);
          }
        }
      }
    }
    
    // Strategy 3: Check for known Eudia signers anywhere in text (fallback)
    if (!extracted.eudiaSignedName) {
      for (const signer of KNOWN_EUDIA_SIGNERS) {
        if (text.includes(signer)) {
          // Use canonical form
          const firstName = signer.split(' ')[0].toLowerCase();
          extracted.eudiaSignedName = EUDIA_SIGNER_CANONICAL[firstName] || signer;
          logger.info(`✍️ Eudia signer (known name match): ${extracted.eudiaSignedName}`);
          break;
        }
      }
    }
    
    // Strategy 4: Explicit patterns like "Customer Signed By:" and "Company Signed By:"
    const explicitSignerPatterns = [
      { pattern: /Customer\s+Signed\s+(?:By)?[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i, type: 'customer' },
      { pattern: /Company\s+Signed\s+(?:By)?[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i, type: 'eudia' },
      { pattern: /Eudia\s+Signed\s+(?:By)?[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i, type: 'eudia' },
      ];
      
    for (const { pattern, type } of explicitSignerPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim().split(/\s+/).slice(0, 3).join(' ');
        if (type === 'customer' && !extracted.customerSignedName) {
          extracted.customerSignedName = name;
          logger.info(`✍️ Customer signer (explicit): ${name}`);
        } else if (type === 'eudia' && !extracted.eudiaSignedName) {
          const firstName = name.split(' ')[0].toLowerCase();
          extracted.eudiaSignedName = EUDIA_SIGNER_CANONICAL[firstName] || name;
          logger.info(`✍️ Eudia signer (explicit): ${extracted.eudiaSignedName}`);
        }
      }
    }
    
    // Strategy 5: Find all person names in text, then classify as Eudia vs Customer
    // by checking what company appears nearby
    if (!extracted.customerSignedName || !extracted.eudiaSignedName) {
      // Look for "By:" or signature lines with names
      const byLinePattern = /By[:\s]+[_\/s]*\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
        let match;
      byLinePattern.lastIndex = 0;
      
      while ((match = byLinePattern.exec(text)) !== null) {
          const name = match[1].trim();
        const position = match.index;
          
        // Get surrounding context (200 chars before and after)
        const contextStart = Math.max(0, position - 200);
        const contextEnd = Math.min(text.length, position + 200);
        const context = text.substring(contextStart, contextEnd).toLowerCase();
        
        const isEudiaPerson = KNOWN_EUDIA_SIGNERS.some(es => 
              name.toLowerCase().includes(es.split(' ')[0].toLowerCase())
        ) || context.includes('eudia') || context.includes('cicero');
        
        const isValidName = name.length > 4 && 
          !name.match(/^(The|This|Such|Said|Date|Name|Title|Overview|Board|Agreement)/i);
            
        if (!isValidName) continue;
        
        if (isEudiaPerson && !extracted.eudiaSignedName) {
          const firstName = name.split(' ')[0].toLowerCase();
          extracted.eudiaSignedName = EUDIA_SIGNER_CANONICAL[firstName] || name;
          logger.info(`✍️ Eudia signer (By line + context): ${extracted.eudiaSignedName}`);
        } else if (!isEudiaPerson && !extracted.customerSignedName) {
              extracted.customerSignedName = name;
          logger.info(`✍️ Customer signer (By line): ${name}`);
            }
      }
    }
    
    logger.info(`✍️ Final Signers - Customer: "${extracted.customerSignedName || 'Not found'}", Eudia: "${extracted.eudiaSignedName || 'Not found'}"`);
    
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DATE EXTRACTION - From signature blocks
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Pattern: "Date: 10/31/2025" or "Date: $10 / 6 / 2025$" (PDF formatting)
    const datePatterns = [
      /Date[:\s]+\$?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*\$?/gi,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,  // Simple date format
    ];
    
    const foundDates = [];
    for (const pattern of datePatterns) {
      let match;
      const textCopy = text; // Reset for each pattern
      pattern.lastIndex = 0;
      while ((match = pattern.exec(textCopy)) !== null) {
        const month = match[1].trim();
        const day = match[2].trim();
        const year = match[3].trim();
        // Validate it's a reasonable date
        const m = parseInt(month), d = parseInt(day), y = parseInt(year);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2030) {
          const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          if (!foundDates.includes(dateStr)) {
            foundDates.push(dateStr);
          }
        }
      }
    }
    
    logger.info(`📅 Found dates: ${foundDates.join(', ')}`);
    
    // The LAST date found is typically the signature/execution date
    // The signature date IS the start date for contracts
    if (foundDates.length > 0) {
      // Use the most recent date as the signing date
      const sortedDates = foundDates.sort();
      extracted.signedDate = sortedDates[sortedDates.length - 1]; // Latest date
      
      // For start date, use the earliest date found OR the signed date
      if (!extracted.startDate) {
        extracted.startDate = sortedDates[0];
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TERM & END DATE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Check for explicit term mentions first
    const termPatterns = [
      /Contract\s+Term[:\s]*(\d+)\s*months?/i,
      /Term[:\s]+(\d+)\s*months?/i,
      /for\s+(?:a\s+period\s+of\s+)?(\d+)\s*months?/i,
      /(\d+)[\s-]*month\s+term/i,
      /first\s+(\d+)\s+months/i,
      /access[^.]*?(\d+)\s+months/i,  // "access at no fee for the first 12 months"
    ];
    
    for (const pattern of termPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const term = parseInt(match[1]);
        if (term > 0 && term <= 120) { // Reasonable term
          extracted.termMonths = term;
          logger.info(`📅 Found explicit term: ${term} months`);
          break;
        }
      }
    }
    
    // Check for anniversary-based terms
    if (!extracted.termMonths) {
      if (text.match(/third\s+anniversary|3rd\s+anniversary/i)) {
        extracted.termMonths = 36;
        logger.info('📅 Found "third anniversary" - 36 months');
      } else if (text.match(/second\s+anniversary|2nd\s+anniversary/i)) {
        extracted.termMonths = 24;
      } else if (text.match(/first\s+anniversary|1st\s+anniversary/i)) {
        extracted.termMonths = 12;
      }
    }
    
    // DEFAULT TERMS:
    // - CAB/LOI contracts: Default to 12 months
    // - Recurring contracts with no term: Check for common patterns
    if (!extracted.termMonths) {
      if (contractType.type === 'LOI') {
        extracted.termMonths = 12;
        logger.info('📅 CAB/LOI contract - defaulting to 12 months');
      } else if (contractType.type === 'Recurring') {
        // Check for Year references to infer term
        if (text.match(/Year\s*3|third\s+year/i)) {
          extracted.termMonths = 36;
          logger.info('📅 Found Year 3 reference - setting to 36 months');
        } else if (text.match(/Year\s*2|second\s+year/i)) {
          extracted.termMonths = 24;
          logger.info('📅 Found Year 2 reference - setting to 24 months');
        } else {
          // Default recurring to 12 months if no other indication
          extracted.termMonths = 12;
          logger.info('📅 Recurring contract - defaulting to 12 months');
        }
      }
    }
    
    // Calculate end date from start date + term
    if (extracted.startDate && extracted.termMonths && !extracted.endDate) {
      extracted.endDate = this.addMonthsToDate(extracted.startDate, extracted.termMonths);
    }
    
    logger.info(`📅 Final: Start=${extracted.startDate}, End=${extracted.endDate}, Term=${extracted.termMonths}mo`);
    logger.info(`✍️ Signers: Customer="${extracted.customerSignedName}", Eudia="${extracted.eudiaSignedName}"`);
    
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MONETARY VALUE EXTRACTION (only for non-LOI contracts)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!contractType.excludeMonetary) {
      logger.info('💰 Extracting monetary values...');
      
      // Find all dollar amounts in the text (must be > $1000 to be contract values)
      const dollarPattern = /\$\s*([\d,]+(?:\.\d{2})?)/g;
      const allAmounts = [];
      let amountMatch;
      while ((amountMatch = dollarPattern.exec(text)) !== null) {
        const value = this.parseMoneyValue(amountMatch[1]);
        if (value && value >= 10000) { // Contract values are typically $10K+
          allAmounts.push(value);
        }
      }
      
      logger.info(`💰 Found ${allAmounts.length} significant dollar amounts: ${allAmounts.join(', ')}`);
      
      // Look for Year pricing structure: "Year 2" followed by $ amount
      // Pattern: Year 2: $1,150,000.00 or Year 2 | $1,150,000
      const yearPricing = [];
      
      // Try multiple patterns for year-based pricing
      const yearPatterns = [
        /Year\s*(\d)\s*[:\|]?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi,
        /\("Year\s*(\d)"\)[^$]*\$\s*([\d,]+(?:\.\d{2})?)/gi,
        /Year\s*(\d)[^$\d]*\$\s*([\d,]+(?:\.\d{2})?)/gi,
      ];
      
      for (const pattern of yearPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          const yearNum = parseInt(match[1]);
          const value = this.parseMoneyValue(match[2]);
          // Only include significant amounts (likely annual values)
          if (value && value >= 100000 && yearNum >= 1 && yearNum <= 5) {
            // Check if we already have this year
            if (!yearPricing.find(y => y.year === yearNum)) {
              yearPricing.push({ year: yearNum, value });
            }
          }
        }
        if (yearPricing.length > 0) break;
      }
      
      if (yearPricing.length > 0) {
        yearPricing.sort((a, b) => a.year - b.year);
        logger.info(`💰 Year-based pricing: ${JSON.stringify(yearPricing)}`);
        
        // Calculate total from all years
        extracted.totalContractValue = yearPricing.reduce((sum, y) => sum + y.value, 0);
        
        // Annual value is average across years
        const years = extracted.termMonths ? extracted.termMonths / 12 : yearPricing.length;
        extracted.annualContractValue = Math.round(extracted.totalContractValue / years);
        
        // Monthly is annual / 12
        extracted.monthlyAmount = Math.round(extracted.annualContractValue / 12);
        
        logger.info(`💰 Calculated: Total=$${extracted.totalContractValue}, Annual=$${extracted.annualContractValue}, Monthly=$${extracted.monthlyAmount}`);
      }
      
      // Fallback: Look for explicit Total Contract Value
      if (!extracted.totalContractValue) {
        const totalPatterns = [
          /Total\s+(?:Contract\s+)?Value[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
          /aggregate\s+(?:total\s+)?(?:fees?|amount)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
          /not\s+to\s+exceed\s+\$?\s*([\d,]+(?:\.\d{2})?)/i,
        ];
        
        for (const pattern of totalPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            extracted.totalContractValue = this.parseMoneyValue(match[1]);
            logger.info(`💰 Found total value: $${extracted.totalContractValue}`);
            break;
          }
        }
      }
      
      // Fallback: Look for Annual Value
      if (!extracted.annualContractValue) {
        const annualPatterns = [
          /Annual\s+(?:Contract\s+)?Value[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
          /per\s+(?:annum|year)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
          /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per\s+)?(?:annum|annually|year)/i,
          /annual\s+fee[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
        ];
        
        for (const pattern of annualPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const value = this.parseMoneyValue(match[1]);
            // Only accept if it's a reasonable annual value (>= $10K)
            if (value && value >= 10000) {
              extracted.annualContractValue = value;
              break;
            }
          }
        }
      }
      
      // If we have total and term but no annual, calculate it
      if (extracted.totalContractValue && extracted.termMonths && !extracted.annualContractValue) {
        const years = extracted.termMonths / 12;
        if (years >= 1) {
          extracted.annualContractValue = Math.round(extracted.totalContractValue / years);
        }
      }
      
      // If we have annual but no total, and we have term, calculate total
      if (extracted.annualContractValue && extracted.termMonths && !extracted.totalContractValue) {
        const years = extracted.termMonths / 12;
        extracted.totalContractValue = Math.round(extracted.annualContractValue * years);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // MONTHLY CALCULATION - Always derive from Total/Term or Annual/12
      // NEVER extract small numbers like $6, $12 from text
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Reset monthly - we'll calculate it properly
      extracted.monthlyAmount = null;
      
      // Calculate monthly from annual
      if (extracted.annualContractValue && extracted.annualContractValue >= 10000) {
        extracted.monthlyAmount = Math.round(extracted.annualContractValue / 12);
      }
      // Or calculate from total / term
      else if (extracted.totalContractValue && extracted.termMonths) {
        extracted.monthlyAmount = Math.round(extracted.totalContractValue / extracted.termMonths);
      }
      
      // Validate monthly is reasonable (>= $1000 for contract values)
      if (extracted.monthlyAmount && extracted.monthlyAmount < 1000) {
        logger.warn(`💰 Monthly value ${extracted.monthlyAmount} too low, clearing`);
        extracted.monthlyAmount = null;
      }
      
      logger.info(`💰 Final: Total=$${extracted.totalContractValue || '—'}, Annual=$${extracted.annualContractValue || '—'}, Monthly=$${extracted.monthlyAmount || '—'}`);
      
      // NOTE: Monthly should ALWAYS be calculated from Total/Term or Annual/12
      // Do NOT extract from text patterns as they often match garbage numbers
      // The calculation is already done earlier in the extraction process (lines 1161-1178)
      
      // Only calculate here if not already set
      if (!extracted.monthlyAmount && extracted.annualContractValue && extracted.annualContractValue >= 10000) {
        extracted.monthlyAmount = Math.round(extracted.annualContractValue / 12);
      } else if (!extracted.monthlyAmount && extracted.totalContractValue && extracted.termMonths) {
        extracted.monthlyAmount = Math.round(extracted.totalContractValue / extracted.termMonths);
      }
      
      // Validate monthly is reasonable (>= $1000)
      if (extracted.monthlyAmount && extracted.monthlyAmount < 1000) {
        logger.warn(`💰 Monthly value ${extracted.monthlyAmount} too low, recalculating`);
        if (extracted.annualContractValue >= 10000) {
          extracted.monthlyAmount = Math.round(extracted.annualContractValue / 12);
        } else if (extracted.totalContractValue && extracted.termMonths) {
          extracted.monthlyAmount = Math.round(extracted.totalContractValue / extracted.termMonths);
        } else {
          extracted.monthlyAmount = null;
        }
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
    
    // NOTE: Signer extraction is now handled earlier in the code with better patterns
    // (Customer Signed By:, Company Signed By:, and Name: patterns)
    // Only use legacy patterns if signers weren't already found
    if (!extracted.customerSignedName) {
      for (const pattern of this.extractionPatterns.customerSignature) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          // Exclude Eudia people
          if (!Object.keys(EUDIA_SIGNERS).some(s => s.toLowerCase() === name.toLowerCase())) {
            extracted.customerSignedName = name;
            logger.info(`✍️ Customer signer (legacy): ${name}`);
            break;
          }
        }
      }
    }
    
    if (!extracted.eudiaSignedName) {
      for (const pattern of this.extractionPatterns.eudiaSignature) {
        const match = text.match(pattern);
        if (match) {
          extracted.eudiaSignedName = match[1] || match[0];
          logger.info(`✍️ Eudia signer (legacy): ${extracted.eudiaSignedName}`);
          break;
        }
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
      // NOTE: EndDate is READ-ONLY in Salesforce - it's auto-calculated from StartDate + ContractTerm
      // EndDate: enrichedFields.endDate,  // DO NOT SET - will cause permission error
      ContractTerm: enrichedFields.termMonths,
      Contract_Type__c: enrichedFields.contractTypeValue,
      // Contracts must be created as "Draft" - can be activated after creation
      Status: 'Draft',
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
    // CustomerSignedId is a lookup to Contact - only set if we found the contact
    if (enrichedFields.salesforce?.customerSignedId) {
      record.CustomerSignedId = enrichedFields.salesforce.customerSignedId;
    }
    // Contact_Signed__c is ALSO a lookup field - use the same ID if found
    // DO NOT set text names here - it will fail with "id value of incorrect type"
    if (enrichedFields.salesforce?.customerSignedId) {
      record.Contact_Signed__c = enrichedFields.salesforce.customerSignedId;
    }
    // If customer signer name was extracted but not found in Salesforce, add to notes
    if (enrichedFields.customerSignedName && !enrichedFields.salesforce?.customerSignedId) {
      const existingNotes = record.Notes__c || '';
      record.Notes__c = existingNotes + (existingNotes ? '\n' : '') + 
        `Customer Signed: ${enrichedFields.customerSignedName} (Contact not found in Salesforce - needs to be added)`;
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
    // SKIP: Industry__c field needs to be fixed in Salesforce (picklist value mismatch)
    // if (enrichedFields.salesforce?.industry) {
    //   record.Industry__c = enrichedFields.salesforce.industry;
    // }
    
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
    if (normalized.includes('insight')) return 'AI Platform - Insights';
    if (normalized.includes('sigma')) return 'AI Platform - Sigma';
    if (normalized.includes('compliance')) return 'Compliance';
    if (normalized.includes('litigation')) return 'AI Platform - Litigation';
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

