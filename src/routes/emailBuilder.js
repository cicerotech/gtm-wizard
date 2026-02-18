/**
 * Email Builder Routes
 * Smart email template builder with SF integration and context enrichment
 */

const { query, sfConnection, isSalesforceAvailable, resetCircuitBreaker, initializeSalesforce } = require('../salesforce/connection');
const enrichmentService = require('../services/companyEnrichment');

async function ensureSfConnection() {
  if (!isSalesforceAvailable()) {
    console.warn('[EmailBuilder] SF unavailable — resetting circuit breaker');
    resetCircuitBreaker();
    await Promise.race([
      initializeSalesforce(),
      new Promise((_, r) => setTimeout(() => r(new Error('SF init timeout')), 8000))
    ]).catch(e => console.error(`[EmailBuilder] SF re-init failed: ${e.message}`));
  }
}

const ABBREVIATION_MAP = {
  'wwt': 'World Wide Technology',
  'chs': 'CHS Inc',
  'dhl': 'DHL Supply Chain',
  'ge': 'General Electric',
  'jnj': 'Johnson & Johnson',
  'jpmc': 'JPMorgan Chase',
  'jpm': 'JPMorgan Chase',
  'bofa': 'Bank of America',
  'nat grid': 'National Grid',
  'nationalgrid': 'National Grid',
  'tmobile': 'T-Mobile',
  't mobile': 'T-Mobile',
  'oreilly': "O'Reilly",
  'basf': 'BASF',
  'ibm': 'IBM',
  'hp': 'Hewlett Packard',
  'hpe': 'Hewlett Packard Enterprise',
  'att': 'AT&T',
  'at&t': 'AT&T',
  'msft': 'Microsoft',
  'gm': 'General Motors',
  'pg': 'Procter & Gamble',
  'p&g': 'Procter & Gamble',
  'gs': 'Goldman Sachs',
  'ubs': 'UBS',
  'sfdc': 'Salesforce',
  'sap': 'SAP',
};

function normalizeSearchTerm(term) {
  if (!term || typeof term !== 'string') return '';
  let clean = term.trim();
  clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lower = clean.toLowerCase();
  if (ABBREVIATION_MAP[lower]) return ABBREVIATION_MAP[lower];
  clean = clean.replace(/[\u2018\u2019'']/g, "'");
  clean = clean.replace(/[\u201C\u201D""]/g, '"');
  clean = clean.replace(/[-\u2013\u2014]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function formatAccountResult(acc) {
  if (!acc) return null;
  return {
    id: acc.Id,
    name: acc.Account_Display_Name__c || acc.Name,
    owner: acc.Owner?.Name || 'Unassigned',
    isNewLogo: acc.Is_New_Logo__c,
    customerType: acc.Customer_Type__c,
    industry: acc.Industry || null,
    lastActivityDate: acc.LastActivityDate || null,
    recentOpp: acc.Opportunities?.records?.[0] ? {
      stage: acc.Opportunities.records[0].StageName,
      acv: acc.Opportunities.records[0].ACV__c,
      product: acc.Opportunities.records[0].Product_Line__c
    } : null
  };
}

async function searchAccounts(req, res) {
  try {
    const rawTerm = req.query.q || '';
    if (rawTerm.length < 2) return res.json({ matches: [] });

    await ensureSfConnection();
    const searchTerm = normalizeSearchTerm(rawTerm);
    const escapedTerm = searchTerm.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/_/g, '\\_');

    const soql = `
      SELECT Id, Name, Account_Display_Name__c, Owner.Name, Is_New_Logo__c, Customer_Type__c, Industry, LastActivityDate,
             (SELECT Id, StageName, ACV__c, Product_Line__c 
              FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1)
      FROM Account
      WHERE Name LIKE '%${escapedTerm}%' OR Account_Display_Name__c LIKE '%${escapedTerm}%'
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 10
    `;
    const result = await query(soql, true);
    let matches = (result?.records || []).map(formatAccountResult).filter(Boolean);

    // Strategy 2: If no LIKE results, try with hyphen/space variants
    if (matches.length === 0) {
      const variants = [
        searchTerm.replace(/\s+/g, '-'),
        searchTerm.replace(/\s+/g, ''),
        searchTerm.replace(/-/g, ' '),
      ].filter((v, i, arr) => v !== searchTerm && arr.indexOf(v) === i);
      for (const variant of variants) {
        if (matches.length > 0) break;
        const safeV = variant.replace(/'/g, "\\'");
        const vResult = await query(`
          SELECT Id, Name, Account_Display_Name__c, Owner.Name, Is_New_Logo__c, Customer_Type__c, Industry, LastActivityDate,
                 (SELECT Id, StageName, ACV__c, Product_Line__c 
                  FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1)
          FROM Account WHERE Name LIKE '%${safeV}%' OR Account_Display_Name__c LIKE '%${safeV}%'
          ORDER BY LastActivityDate DESC NULLS LAST LIMIT 10
        `, true);
        matches = (vResult?.records || []).map(formatAccountResult).filter(Boolean);
      }
    }

    // Strategy 3: SOSL fuzzy search (handles typos, phonetic matching)
    if (matches.length === 0 && searchTerm.length >= 3) {
      try {
        const soslTerm = searchTerm.replace(/['"\\{}()\[\]]/g, '');
        const conn = sfConnection.getConnection ? sfConnection.getConnection() : null;
        if (conn && conn.search) {
          const soslQuery = `FIND {${soslTerm}} IN NAME FIELDS RETURNING Account(Id, Name, Owner.Name, Customer_Type__c, Industry, LastActivityDate ORDER BY LastActivityDate DESC NULLS LAST LIMIT 10)`;
          const soslResult = await conn.search(soslQuery);
          matches = (soslResult?.searchRecords || []).map(acc => ({
            id: acc.Id,
            name: acc.Name,
            owner: acc.Owner?.Name || 'Unassigned',
            customerType: acc.Customer_Type__c,
            industry: acc.Industry || null,
            lastActivityDate: acc.LastActivityDate || null,
            fuzzyMatch: true
          }));
        }
      } catch (soslErr) {
        console.warn('[Search] SOSL fallback failed:', soslErr.message);
      }
    }

    res.json({ matches });
  } catch (error) {
    console.error('[EmailBuilder] Account search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
}

/**
 * Enrich company with recent context
 */
async function enrichCompany(req, res) {
  try {
    const companyName = req.query.company;
    
    if (!companyName) {
      return res.status(400).json({ error: 'Company name required' });
    }

    const enrichment = await enrichmentService.enrichCompany(companyName);
    
    res.json(enrichment);
    
  } catch (error) {
    console.error('[EmailBuilder] Enrichment error:', error);
    res.status(500).json({ error: 'Enrichment failed' });
  }
}

/**
 * Generate email from template with variables filled
 */
async function generateEmail(req, res) {
  try {
    const { templateId, company, variables } = req.body;
    
    // Get template
    const template = getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get SF data for company
    const sfData = await getCompanyFromSF(company);
    
    // Get enrichment data
    const enrichment = await enrichmentService.enrichCompany(company);
    
    // Auto-fill variables
    const filledEmail = applyVariables(template, {
      company: sfData.name,
      ownerName: sfData.owner,
      ...variables,
      ...extractAutoVariables(enrichment)
    });
    
    res.json({
      email: filledEmail,
      enrichment: enrichmentService.getSummary(enrichment),
      sfData
    });
    
  } catch (error) {
    console.error('[EmailBuilder] Email generation error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
}

/**
 * Helper: Get company data from Salesforce
 */
async function getCompanyFromSF(companyName) {
  const escapedName = companyName.replace(/'/g, "\\'");
  
  const soql = `
    SELECT Id, Name, Owner.Name, Owner.Email
    FROM Account
    WHERE Name = '${escapedName}'
    LIMIT 1
  `;
  
  const result = await query(soql, true);
  
  if (result.records.length === 0) {
    throw new Error('Company not found in Salesforce');
  }
  
  return {
    id: result.records[0].Id,
    name: result.records[0].Name,
    owner: result.records[0].Owner?.Name,
    ownerEmail: result.records[0].Owner?.Email
  };
}

/**
 * Helper: Extract auto-fillable variables from enrichment
 */
function extractAutoVariables(enrichment) {
  const auto = {};
  
  // Recent trigger (top trigger)
  if (enrichment.triggers.length > 0) {
    auto.recentTrigger = enrichment.triggers[0].text;
    auto.triggerSource = enrichment.triggers[0].source;
  }
  
  // Specific situation (combine triggers)
  if (enrichment.triggers.length >= 2) {
    auto.specificSituation = enrichment.triggers.slice(0, 2).map(t => t.text).join(' and ');
  } else if (enrichment.triggers.length === 1) {
    auto.specificSituation = enrichment.triggers[0].text;
  }
  
  return auto;
}

/**
 * Helper: Apply variables to template
 */
function applyVariables(template, variables) {
  let email = template.content;
  
  // Replace all [variable] placeholders
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `[${key}]`;
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    email = email.replace(regex, value || placeholder);
  });
  
  return {
    subject: applyVariablesToString(template.subject, variables),
    body: email
  };
}

function applyVariablesToString(str, variables) {
  let result = str;
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `[${key}]`;
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, value || placeholder);
  });
  return result;
}

/**
 * Helper: Get template by ID
 */
function getTemplate(templateId) {
  const templates = require('../config/emailTemplates.json');
  return templates.find(t => t.id === templateId);
}

module.exports = {
  searchAccounts,
  enrichCompany,
  generateEmail
};

