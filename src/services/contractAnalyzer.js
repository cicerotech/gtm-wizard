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
    // Pattern 1: "Company Name Corp. ("Customer" or "Name")" - e.g., Coherent Corp. ("Customer" or "Coherent")
    const customerOrPattern = text.match(/([A-Z][A-Za-z\s&]+?(?:Corp|Inc|LLC|Ltd|Co)\.?)\s*\(\s*["']?Customer["']?\s*(?:or\s*["']([A-Z][A-Za-z]+)["'])?\s*\)/i);
    if (customerOrPattern) {
      // Use the short name in "or" clause if available, otherwise use full name
      extracted.accountName = customerOrPattern[2] || customerOrPattern[1].replace(/,?\s*(Inc|Corp|LLC|Ltd|Co)\.?$/i, '').trim();
    }
    
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
    // DATE EXTRACTION - Multiple patterns for different contract formats
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Pattern 1: Signature block dates - "Date: 10/31/2025" or "Date: $10 / 6 / 2025$"
    const signatureDatePatterns = [
      /Date[:\s]+\$?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\$?/gi,  // Date: 10/31/2025 or $10 / 6 / 2025$
      /Date[:\s]+(\d{1,2})\/(\d{1,2})\/(\d{4})/gi,                     // Date: 10/31/2025
    ];
    
    // Find all signature dates
    const foundDates = [];
    for (const pattern of signatureDatePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const month = match[1].trim();
        const day = match[2].trim();
        const year = match[3].trim();
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        if (this.isValidDate(dateStr)) {
          foundDates.push(dateStr);
        }
      }
    }
    
    logger.info(`📅 Found ${foundDates.length} signature dates: ${foundDates.join(', ')}`);
    
    // Use first found date as start date if none found from other patterns
    if (foundDates.length > 0 && !extracted.startDate) {
      extracted.startDate = foundDates[0];
      extracted.signedDate = foundDates[0];
    }
    
    // Pattern 2: Effective Date patterns
    const effectiveDatePatterns = [
      /Effective\s+Date[:\s)]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Order\s+Effective\s+Date/i,  // Just detection, date comes from signature
      /dated\s+(?:as\s+of\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
    ];
    
    for (const pattern of effectiveDatePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const parsed = this.parseDate(match[1]);
        if (parsed) {
          extracted.startDate = parsed;
          break;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TERM & END DATE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Check for anniversary-based terms
    if (text.match(/third\s+anniversary|3rd\s+anniversary/i)) {
      extracted.termMonths = 36;
      logger.info('📅 Found "third anniversary" - setting term to 36 months');
      if (extracted.startDate) {
        extracted.endDate = this.addMonthsToDate(extracted.startDate, 36);
      }
    } else if (text.match(/second\s+anniversary|2nd\s+anniversary/i)) {
      extracted.termMonths = 24;
      if (extracted.startDate) {
        extracted.endDate = this.addMonthsToDate(extracted.startDate, 24);
      }
    } else if (text.match(/first\s+12\s+months|12\s+months|first\s+anniversary|1st\s+anniversary/i)) {
      extracted.termMonths = 12;
      if (extracted.startDate) {
        extracted.endDate = this.addMonthsToDate(extracted.startDate, 12);
      }
    }
    
    // Try explicit term patterns
    const termPatterns = [
      /Contract\s+Term[:\s]*(\d+)\s*months?/i,
      /Term[:\s]+(\d+)\s*months?/i,
      /for\s+(?:a\s+period\s+of\s+)?(\d+)\s*months?/i,
      /(\d+)[\s-]*month\s+term/i,
      /first\s+(\d+)\s+months/i,
    ];
    
    if (!extracted.termMonths) {
      for (const pattern of termPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted.termMonths = parseInt(match[1]);
          logger.info(`📅 Extracted term: ${extracted.termMonths} months`);
          break;
        }
      }
    }
    
    // Calculate end date from start date and term if not already set
    if (extracted.startDate && extracted.termMonths && !extracted.endDate) {
      extracted.endDate = this.addMonthsToDate(extracted.startDate, extracted.termMonths);
    }
    
    // Calculate term from dates if not found explicitly
    if (extracted.startDate && extracted.endDate && !extracted.termMonths) {
      extracted.termMonths = this.calculateTermMonths(extracted.startDate, extracted.endDate);
    }
    
    logger.info(`📅 Final dates: Start=${extracted.startDate}, End=${extracted.endDate}, Term=${extracted.termMonths}mo`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MONETARY VALUE EXTRACTION (only for non-LOI contracts)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!contractType.excludeMonetary) {
      logger.info('💰 Extracting monetary values...');
      
      // Find all dollar amounts in the text
      const dollarPattern = /\$\s*([\d,]+(?:\.\d{2})?)/g;
      const allAmounts = [];
      let amountMatch;
      while ((amountMatch = dollarPattern.exec(text)) !== null) {
        const value = this.parseMoneyValue(amountMatch[1]);
        if (value && value > 1000) { // Filter out small amounts
          allAmounts.push(value);
        }
      }
      
      logger.info(`💰 Found ${allAmounts.length} dollar amounts: ${allAmounts.slice(0, 5).join(', ')}...`);
      
      // Look for Year pricing structure (Year 1, Year 2, Year 3)
      const yearPricing = [];
      const yearPattern = /Year\s*(\d)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/gi;
      while ((amountMatch = yearPattern.exec(text)) !== null) {
        const value = this.parseMoneyValue(amountMatch[2]);
        if (value) {
          yearPricing.push({ year: parseInt(amountMatch[1]), value });
        }
      }
      
      if (yearPricing.length > 0) {
        logger.info(`💰 Found year-based pricing: ${JSON.stringify(yearPricing)}`);
        // Calculate total from all years
        extracted.totalContractValue = yearPricing.reduce((sum, y) => sum + y.value, 0);
        // Annual value is average or Year 1 value
        extracted.annualContractValue = yearPricing.length > 0 
          ? Math.round(extracted.totalContractValue / yearPricing.length)
          : yearPricing[0].value;
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
        ];
        
        for (const pattern of annualPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            extracted.annualContractValue = this.parseMoneyValue(match[1]);
            break;
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
      
      logger.info(`💰 Final values: Total=$${extracted.totalContractValue || 0}, Annual=$${extracted.annualContractValue || 0}`);
      
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

