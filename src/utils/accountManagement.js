const { sfConnection } = require('../salesforce/connection');
const logger = require('./logger');

/**
 * Move account to nurture - checks Nurture__c and closes opportunities
 */
async function moveAccountToNurture(accountName, reason, userId) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  if (userId !== KEIGAN_USER_ID) {
    return { error: 'Only Keigan can perform account updates.' };
  }

  try {
    // Find account
    const accountQuery = `SELECT Id, Name, Owner.Name, Nurture__c,
                                 (SELECT Id, Name, StageName, Amount FROM Opportunities WHERE IsClosed = false)
                          FROM Account
                          WHERE Name LIKE '%${accountName}%'
                          LIMIT 5`;
    
    const { query } = require('../salesforce/connection');
    const result = await query(accountQuery);
    
    if (!result || result.totalSize === 0) {
      return { error: `Account "${accountName}" not found.` };
    }

    const account = result.records[0];
    const openOpps = account.Opportunities || [];

    return {
      account,
      openOpps,
      action: 'nurture',
      reason: reason || 'Moved to nurture'
    };

  } catch (error) {
    logger.error('Failed to prepare nurture move:', error);
    return { error: error.message };
  }
}

/**
 * Execute the nurture move (after confirmation)
 */
async function executeNurtureMove(accountId, opportunityIds, reason) {
  try {
    const conn = sfConnection.getConnection();
    
    // Update account - check Nurture box
    await conn.sobject('Account').update({
      Id: accountId,
      Nurture__c: true
    });

    // Update all opportunities - close lost with reason
    if (opportunityIds && opportunityIds.length > 0) {
      const oppUpdates = opportunityIds.map(oppId => ({
        Id: oppId,
        StageName: 'Stage 7. Closed Lost', // Exact Salesforce value
        IsClosed: true,
        IsWon: false,
        Closed_Lost_Detail__c: reason
      }));

      await conn.sobject('Opportunity').update(oppUpdates);
    }

    return { success: true, updatedOpps: opportunityIds.length };

  } catch (error) {
    logger.error('Failed to execute nurture move:', error);
    throw error;
  }
}

/**
 * Close lost opportunities (no nurture check)
 */
async function closeLostOpportunities(accountName, reason, userId) {
  const KEIGAN_USER_ID = 'U094AQE9V7D';
  
  if (userId !== KEIGAN_USER_ID) {
    return { error: 'Only Keigan can close opportunities.' };
  }

  try {
    // Find opportunities
    const oppQuery = `SELECT Id, Name, Account.Name, StageName, Amount
                      FROM Opportunity
                      WHERE Account.Name LIKE '%${accountName}%' 
                        AND IsClosed = false`;
    
    const { query } = require('../salesforce/connection');
    const result = await query(oppQuery);
    
    if (!result || result.totalSize === 0) {
      return { error: `No open opportunities found for "${accountName}".` };
    }

    return {
      opportunities: result.records,
      action: 'close_lost',
      reason: reason || 'Closed lost'
    };

  } catch (error) {
    logger.error('Failed to prepare close lost:', error);
    return { error: error.message };
  }
}

/**
 * Execute close lost (after confirmation)
 */
async function executeCloseLost(opportunityIds, reason) {
  try {
    const conn = sfConnection.getConnection();
    
    const oppUpdates = opportunityIds.map(oppId => ({
      Id: oppId,
      StageName: 'Stage 7. Closed Lost',
      IsClosed: true,
      IsWon: false,
      Closed_Lost_Detail__c: reason
    }));

    await conn.sobject('Opportunity').update(oppUpdates);

    return { success: true, updatedOpps: opportunityIds.length };

  } catch (error) {
    logger.error('Failed to execute close lost:', error);
    throw error;
  }
}

module.exports = {
  moveAccountToNurture,
  executeNurtureMove,
  closeLostOpportunities,
  executeCloseLost
};

