const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { enrichCompanyData } = require('./clayEnrichment');
const { determineAccountAssignment } = require('./accountAssignment');

/**
 * Comprehensive Account Creation with Full Logging
 * Addresses: Casing, enrichment, workload, duplicate detection
 */

async function createAccountWithEnrichment(companyName, userId) {
  logger.info(`🚀 Starting account creation for: "${companyName}" (Original input)`);
  
  try {
    // STEP 1: Duplicate Detection (using fuzzy matching from "who owns" logic)
    const escapeQuotes = (str) => str.replace(/'/g, "\\'");
    const normalizedSearch = companyName.trim();
    const withoutThe = normalizedSearch.replace(/^the\s+/i, '');
    const withHyphen = normalizedSearch.replace(/\s/g, '-');
    const withoutHyphen = normalizedSearch.replace(/-/g, ' ');
    const withAmpersand = normalizedSearch.replace(/\sand\s/gi, ' & ');
    
    const duplicateConditions = [
      `Name = '${escapeQuotes(normalizedSearch)}'`,
      `Name = '${escapeQuotes(withoutThe)}'`,
      `Name = 'The ${escapeQuotes(withoutThe)}'`,
      `Name = '${escapeQuotes(withHyphen)}'`,
      `Name = '${escapeQuotes(withoutHyphen)}'`,
      `Name = '${escapeQuotes(withAmpersand)}'`,
      `Name LIKE '%${escapeQuotes(normalizedSearch)}%'`
    ].filter((v, i, a) => a.indexOf(v) === i);
    
    const duplicateQuery = `SELECT Id, Name, Owner.Name FROM Account WHERE (${duplicateConditions.join(' OR ')}) LIMIT 1`;
    const duplicateResult = await query(duplicateQuery);
    
    if (duplicateResult && duplicateResult.totalSize > 0) {
      logger.warn(`❌ Duplicate detected: ${duplicateResult.records[0].Name}`);
      return {
        success: false,
        duplicate: true,
        existingAccount: duplicateResult.records[0]
      };
    }
    
    logger.info('✅ No duplicate found - proceeding with creation');
    
    // STEP 2: Enrich company data
    logger.info(`📊 Calling enrichCompanyData for: "${companyName}"`);
    const enrichment = await enrichCompanyData(companyName);
    
    logger.info('📊 Enrichment result:', {
      companyName: enrichment.companyName,
      success: enrichment.success,
      website: enrichment.website,
      linkedIn: enrichment.linkedIn,
      revenue: enrichment.revenue,
      hqCity: enrichment.headquarters?.city,
      hqState: enrichment.headquarters?.state,
      hqCountry: enrichment.headquarters?.country
    });
    
    // STEP 3: Determine assignment
    logger.info('📍 Determining BL assignment based on HQ');
    const assignment = await determineAccountAssignment(enrichment.headquarters);
    
    logger.info('📍 Assignment result:', {
      assignedTo: assignment.assignedTo,
      region: assignment.region,
      sfRegion: assignment.sfRegion,
      activeOpps: assignment.reasoning.activeOpportunities,
      closingThisMonth: assignment.reasoning.closingThisMonth
    });
    
    // STEP 4: Build account data
    const accountData = {
      Name: companyName // CRITICAL: Use ORIGINAL input name exactly as provided
    };
    
    logger.info(`🏷️  Account Name being used: "${accountData.Name}" (from original input: "${companyName}")`);
    
    // Add 5 enrichment fields
    if (enrichment.website) accountData.Website = enrichment.website;
    if (enrichment.linkedIn) accountData.Linked_in_URL__c = enrichment.linkedIn;
    if (enrichment.revenue) accountData.Rev_MN__c = Number((enrichment.revenue / 1000000).toFixed(1));
    
    // State and Region
    if (assignment.sfRegion) accountData.Region__c = assignment.sfRegion;
    
    // State__c logic
    if (enrichment.headquarters?.country && enrichment.headquarters.country !== 'USA' && enrichment.headquarters.country !== 'US') {
      const validCountries = ['Vietnam', 'Netherlands', 'Spain', 'United Kingdom', 'Japan', 'Hong Kong', 'Ireland', 'Australia', 'China'];
      if (validCountries.includes(enrichment.headquarters.country)) {
        accountData.State__c = enrichment.headquarters.country;
      }
    } else if (enrichment.headquarters?.state) {
      accountData.State__c = enrichment.headquarters.state.toUpperCase();
    }
    
    // Query for BL's Salesforce User ID
    const userQuery = `SELECT Id, Name FROM User WHERE Name = '${assignment.assignedTo}' AND IsActive = true LIMIT 1`;
    const userResult = await query(userQuery);
    
    if (!userResult || userResult.totalSize === 0) {
      logger.error(`❌ Could not find user: ${assignment.assignedTo}`);
      throw new Error(`Could not find active user: ${assignment.assignedTo}`);
    }
    
    accountData.OwnerId = userResult.records[0].Id;
    
    logger.info('🚀 Final accountData to create:', JSON.stringify(accountData, null, 2));
    
    // STEP 5: Create in Salesforce
    const { sfConnection } = require('../salesforce/connection');
    const conn = sfConnection.getConnection();
    
    const createResult = await conn.sobject('Account').create(accountData);
    
    if (!createResult.success) {
      logger.error('❌ Salesforce create failed:', createResult.errors);
      throw new Error(`Salesforce account creation failed: ${createResult.errors?.join(', ')}`);
    }
    
    logger.info(`✅ Account created successfully: ${createResult.id}`);
    
    // STEP 6: Verify what was actually created
    const verifyQuery = `SELECT Id, Name, Website, Linked_in_URL__c, State__c, Region__c, Rev_MN__c, Owner.Name 
                         FROM Account WHERE Id = '${createResult.id}'`;
    const verifyResult = await query(verifyQuery);
    
    if (verifyResult && verifyResult.records[0]) {
      logger.info('✅ Verified created account:', verifyResult.records[0]);
    }
    
    return {
      success: true,
      accountId: createResult.id,
      accountData,
      enrichment,
      assignment,
      verifiedAccount: verifyResult?.records[0]
    };
    
  } catch (error) {
    logger.error('❌ Account creation failed:', error);
    throw error;
  }
}

module.exports = {
  createAccountWithEnrichment
};

