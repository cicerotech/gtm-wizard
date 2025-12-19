/**
 * Email Builder Routes
 * Smart email template builder with SF integration and context enrichment
 */

const { query } = require('../salesforce/connection');
const enrichmentService = require('../services/companyEnrichment');

/**
 * Search Salesforce accounts with typeahead
 */
async function searchAccounts(req, res) {
  try {
    const searchTerm = req.query.q || '';
    
    if (searchTerm.length < 2) {
      return res.json({ matches: [] });
    }

    // Escape quotes for SOQL
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    
    // Query SF for matching accounts
    const soql = `
      SELECT Id, Name, Owner.Name, Is_New_Logo__c, Type__c,
             (SELECT Id, StageName, ACV__c, Product_Line__c 
              FROM Opportunities 
              WHERE IsClosed = false 
              ORDER BY CreatedDate DESC 
              LIMIT 1)
      FROM Account
      WHERE Name LIKE '%${escapedTerm}%'
      ORDER BY Name
      LIMIT 10
    `;
    
    const result = await query(soql, true);
    
    // Format results for frontend
    const matches = result.records.map(acc => ({
      id: acc.Id,
      name: acc.Name,
      owner: acc.Owner?.Name || 'Unassigned',
      isNewLogo: acc.Is_New_Logo__c,
      customerType: acc.Type__c,
      recentOpp: acc.Opportunities?.records?.[0] ? {
        stage: acc.Opportunities.records[0].StageName,
        acv: acc.Opportunities.records[0].ACV__c,
        product: acc.Opportunities.records[0].Product_Line__c
      } : null
    }));

    res.json({ matches: matches.slice(0, 5) }); // Top 5 matches
    
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

