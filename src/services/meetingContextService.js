/**
 * Meeting Context Service
 * Aggregates context from multiple sources for meeting preparation
 */

const { query } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');
const logger = require('../utils/logger');

/**
 * Generate aggregated meeting context for an account
 * Combines: Salesforce data, Slack intel, prior meeting preps
 */
async function generateMeetingContext(accountId) {
  try {
    const [salesforce, slackIntel, priorMeetings] = await Promise.all([
      getSalesforceContext(accountId),
      getSlackIntelligence(accountId),
      getPriorMeetingContext(accountId)
    ]);
    
    return {
      salesforce,
      slackIntel,
      priorMeetings,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error generating meeting context:', error);
    return {
      salesforce: null,
      slackIntel: [],
      priorMeetings: [],
      generatedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * Get Salesforce context for an account
 */
async function getSalesforceContext(accountId) {
  try {
    // Get account details
    const accountQuery = `
      SELECT Id, Name, Customer_Type__c, Customer_Subtype__c, 
             Industry, Website, Owner.Name, Description,
             First_Deal_Closed__c, BillingCity, BillingState, BillingCountry
      FROM Account
      WHERE Id = '${accountId}'
    `;
    
    const accountResult = await query(accountQuery, true);
    const account = accountResult?.records?.[0];
    
    if (!account) {
      return null;
    }
    
    // Get open opportunities
    const oppsQuery = `
      SELECT Id, Name, StageName, ACV__c, CloseDate, 
             Product_Line__c, Owner.Name, Sales_Type__c
      FROM Opportunity
      WHERE AccountId = '${accountId}'
        AND IsClosed = false
      ORDER BY CloseDate ASC
      LIMIT 10
    `;
    
    const oppsResult = await query(oppsQuery, true);
    const openOpportunities = (oppsResult?.records || []).map(opp => ({
      id: opp.Id,
      name: opp.Name,
      stage: opp.StageName,
      acv: opp.ACV__c,
      closeDate: opp.CloseDate,
      productLine: opp.Product_Line__c,
      owner: opp.Owner?.Name,
      salesType: opp.Sales_Type__c
    }));
    
    // Get key contacts
    const contactsQuery = `
      SELECT Id, Name, Title, Email, Phone
      FROM Contact
      WHERE AccountId = '${accountId}'
      ORDER BY CreatedDate DESC
      LIMIT 5
    `;
    
    const contactsResult = await query(contactsQuery, true);
    const keyContacts = (contactsResult?.records || []).map(c => ({
      id: c.Id,
      name: c.Name,
      title: c.Title,
      email: c.Email,
      phone: c.Phone
    }));
    
    // Get recent closed-won deals
    const closedWonQuery = `
      SELECT Name, ACV__c, CloseDate, Product_Line__c
      FROM Opportunity
      WHERE AccountId = '${accountId}'
        AND IsClosed = true
        AND IsWon = true
      ORDER BY CloseDate DESC
      LIMIT 5
    `;
    
    const closedWonResult = await query(closedWonQuery, true);
    const recentWins = (closedWonResult?.records || []).map(opp => ({
      name: opp.Name,
      acv: opp.ACV__c,
      closeDate: opp.CloseDate,
      productLine: opp.Product_Line__c
    }));
    
    return {
      accountName: account.Name,
      customerType: account.Customer_Type__c,
      customerSubtype: account.Customer_Subtype__c,
      industry: account.Industry,
      website: account.Website,
      owner: account.Owner?.Name,
      description: account.Description,
      firstDealClosed: account.First_Deal_Closed__c,
      location: [account.BillingCity, account.BillingState, account.BillingCountry]
        .filter(Boolean).join(', '),
      openOpportunities,
      keyContacts,
      recentWins
    };
  } catch (error) {
    logger.error('Error fetching Salesforce context:', error);
    return null;
  }
}

/**
 * Get Slack channel intelligence for an account
 */
async function getSlackIntelligence(accountId) {
  try {
    // Get recent intelligence from the intelligence store
    const allIntel = await intelligenceStore.getPendingIntelligence();
    
    // Filter by account
    const accountIntel = allIntel.filter(intel => 
      intel.account_id === accountId || 
      (intel.account_name && intel.account_name.toLowerCase().includes(accountId.toLowerCase()))
    );
    
    // Also try to find by looking up account name from Salesforce
    let accountName = null;
    try {
      const accountQuery = `SELECT Name FROM Account WHERE Id = '${accountId}'`;
      const result = await query(accountQuery, true);
      accountName = result?.records?.[0]?.Name;
    } catch (e) {
      // Ignore errors
    }
    
    if (accountName) {
      const nameIntel = allIntel.filter(intel => 
        intel.account_name && 
        intel.account_name.toLowerCase() === accountName.toLowerCase()
      );
      
      // Merge, avoiding duplicates
      const existingIds = new Set(accountIntel.map(i => i.id));
      for (const intel of nameIntel) {
        if (!existingIds.has(intel.id)) {
          accountIntel.push(intel);
        }
      }
    }
    
    // Sort by date and limit
    accountIntel.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
    
    return accountIntel.slice(0, 10).map(intel => ({
      date: intel.captured_at,
      category: intel.category,
      summary: intel.summary,
      channel: intel.channel_name,
      author: intel.message_author_name,
      confidence: intel.confidence
    }));
  } catch (error) {
    logger.error('Error fetching Slack intelligence:', error);
    return [];
  }
}

/**
 * Get prior meeting prep summaries for context
 */
async function getPriorMeetingContext(accountId) {
  try {
    const priorPreps = await intelligenceStore.getMeetingPrepsByAccount(accountId);
    
    // Only return past meetings (meeting_date < today)
    const now = new Date();
    const pastMeetings = priorPreps.filter(prep => 
      new Date(prep.meeting_date) < now
    );
    
    return pastMeetings.slice(0, 5).map(prep => ({
      date: prep.meeting_date,
      title: prep.meeting_title,
      goals: prep.goals,
      agenda: prep.agenda,
      demoProducts: prep.demoSelections?.map(d => d.product).filter(Boolean) || [],
      attendees: prep.attendees?.map(a => a.name).filter(Boolean) || []
    }));
  } catch (error) {
    logger.error('Error fetching prior meeting context:', error);
    return [];
  }
}

/**
 * Format context for display (summarized text version)
 */
function formatContextSummary(context) {
  const lines = [];
  
  if (context.salesforce) {
    const sf = context.salesforce;
    lines.push(`📊 **${sf.accountName}**`);
    if (sf.customerType) lines.push(`Type: ${sf.customerType}${sf.customerSubtype ? ` (${sf.customerSubtype})` : ''}`);
    if (sf.industry) lines.push(`Industry: ${sf.industry}`);
    if (sf.owner) lines.push(`Owner: ${sf.owner}`);
    
    if (sf.openOpportunities?.length > 0) {
      lines.push(`\n📈 Open Opportunities: ${sf.openOpportunities.length}`);
      for (const opp of sf.openOpportunities.slice(0, 3)) {
        const acvStr = opp.acv ? `$${(opp.acv / 1000).toFixed(0)}k` : 'TBD';
        lines.push(`  • ${opp.name} (${opp.stage}) - ${acvStr}`);
      }
    }
    
    if (sf.keyContacts?.length > 0) {
      lines.push(`\n👥 Key Contacts:`);
      for (const contact of sf.keyContacts.slice(0, 3)) {
        lines.push(`  • ${contact.name}${contact.title ? ` - ${contact.title}` : ''}`);
      }
    }
    
    if (sf.recentWins?.length > 0) {
      lines.push(`\n✅ Recent Wins: ${sf.recentWins.length}`);
    }
  }
  
  if (context.slackIntel?.length > 0) {
    lines.push(`\n💬 Recent Slack Insights: ${context.slackIntel.length}`);
    for (const intel of context.slackIntel.slice(0, 3)) {
      lines.push(`  • [${intel.category}] ${intel.summary}`);
    }
  }
  
  if (context.priorMeetings?.length > 0) {
    lines.push(`\n📅 Prior Meetings: ${context.priorMeetings.length}`);
    for (const meeting of context.priorMeetings.slice(0, 2)) {
      const date = new Date(meeting.date).toLocaleDateString();
      lines.push(`  • ${date}: ${meeting.title}`);
      if (meeting.goals?.length > 0) {
        const goalsStr = meeting.goals.filter(g => g).slice(0, 2).join(', ');
        if (goalsStr) lines.push(`    Goals: ${goalsStr}`);
      }
    }
  }
  
  return lines.join('\n');
}

module.exports = {
  generateMeetingContext,
  getSalesforceContext,
  getSlackIntelligence,
  getPriorMeetingContext,
  formatContextSummary
};

