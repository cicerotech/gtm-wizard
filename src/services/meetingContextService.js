/**
 * Meeting Context Service
 * Aggregates context from multiple sources for meeting preparation
 */

const { query } = require('../salesforce/connection');
const intelligenceStore = require('./intelligenceStore');
const logger = require('../utils/logger');

/**
 * Parse Customer_Brain__c field into structured meeting notes
 * Format: "--- Meeting: Jan 15, 10:30 AM ---\nRep: Name\nDuration: X min\nParticipants: ...\n\n[notes]"
 */
function parseCustomerBrainNotes(rawBrain) {
  if (!rawBrain || typeof rawBrain !== 'string') return [];
  
  // Split by meeting delimiter
  const entries = rawBrain.split(/---\s*Meeting:/i);
  
  return entries
    .filter(e => e && e.trim().length > 10)
    .slice(0, 5)  // Last 5 meetings
    .map(entry => {
      const lines = entry.trim().split('\n');
      
      // Parse date from first line (e.g., "Jan 15, 10:30 AM ---")
      const dateMatch = lines[0]?.match(/^(.+?)\s*---/);
      const date = dateMatch?.[1]?.trim() || 'Unknown date';
      
      // Parse metadata fields
      const repMatch = entry.match(/Rep:\s*(.+)/i);
      const durationMatch = entry.match(/Duration:\s*(.+)/i);
      const participantsMatch = entry.match(/Participants:\s*(.+)/i);
      
      // Extract notes content (everything after the empty line following metadata)
      let summary = '';
      const doubleNewline = entry.indexOf('\n\n');
      if (doubleNewline > -1) {
        const notesContent = entry.substring(doubleNewline + 2).trim();
        // Take first 300 chars as summary
        summary = notesContent.substring(0, 300);
        if (notesContent.length > 300) summary += '...';
      }
      
      return {
        date,
        rep: repMatch?.[1]?.trim() || 'Unknown',
        duration: durationMatch?.[1]?.trim() || null,
        participants: participantsMatch?.[1]?.trim() || null,
        summary: summary || 'No summary available'
      };
    })
    .filter(note => note.summary && note.summary !== 'No summary available');
}

/**
 * Generate aggregated meeting context for an account
 * Combines: Salesforce data, Slack intel, prior meeting preps, recent activities
 * Uses priority-based fallbacks when Customer_Brain is empty
 */
async function generateMeetingContext(accountId) {
  try {
    const [salesforce, slackIntel, priorMeetings, activities] = await Promise.all([
      getSalesforceContext(accountId),
      getSlackIntelligence(accountId),
      getPriorMeetingContext(accountId),
      getRecentActivities(accountId)
    ]);
    
    // Parse Customer Brain meeting notes if available
    const meetingNotes = salesforce?.customerBrain 
      ? parseCustomerBrainNotes(salesforce.customerBrain)
      : [];
    
    // Determine context richness for UI feedback
    const hasRichContext = meetingNotes.length > 0 || 
                           slackIntel.length > 0 || 
                           activities.length > 0 ||
                           priorMeetings.length > 0;
    
    return {
      salesforce,
      slackIntel,
      priorMeetings,
      meetingNotes,       // Parsed from Customer_Brain__c
      activities,         // Recent Events/Tasks as fallback
      hasRichContext,     // Flag for UI to show/hide empty state
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error generating meeting context:', error);
    return {
      salesforce: null,
      slackIntel: [],
      priorMeetings: [],
      meetingNotes: [],
      activities: [],
      hasRichContext: false,
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
    // Get account details including Customer_Brain__c for meeting notes
    const accountQuery = `
      SELECT Id, Name, Customer_Type__c, Customer_Subtype__c, 
             Industry, Website, Owner.Name, Description,
             First_Deal_Closed__c, BillingCity, BillingState, BillingCountry,
             Customer_Brain__c
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
      customerBrain: account.Customer_Brain__c,
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
 * Get recent Activities (Events + Tasks) from Salesforce
 * Provides fallback context when Customer_Brain is empty
 */
async function getRecentActivities(accountId) {
  try {
    // Get recent completed Tasks (last 90 days)
    const tasksQuery = `
      SELECT Id, Subject, ActivityDate, Description, Owner.Name, Type
      FROM Task
      WHERE AccountId = '${accountId}'
        AND ActivityDate >= LAST_N_DAYS:90
        AND Status = 'Completed'
      ORDER BY ActivityDate DESC
      LIMIT 10
    `;
    
    // Get recent Events (last 90 days)
    const eventsQuery = `
      SELECT Id, Subject, StartDateTime, Description, Owner.Name
      FROM Event
      WHERE AccountId = '${accountId}'
        AND StartDateTime >= LAST_N_DAYS:90
      ORDER BY StartDateTime DESC
      LIMIT 10
    `;
    
    const [tasksResult, eventsResult] = await Promise.all([
      query(tasksQuery, true).catch(() => ({ records: [] })),
      query(eventsQuery, true).catch(() => ({ records: [] }))
    ]);
    
    const tasks = (tasksResult?.records || []).map(t => ({
      type: 'task',
      subject: t.Subject,
      date: t.ActivityDate,
      description: t.Description?.substring(0, 200),
      owner: t.Owner?.Name,
      taskType: t.Type
    }));
    
    const events = (eventsResult?.records || []).map(e => ({
      type: 'event',
      subject: e.Subject,
      date: e.StartDateTime,
      description: e.Description?.substring(0, 200),
      owner: e.Owner?.Name
    }));
    
    // Combine and sort by date (most recent first)
    const combined = [...tasks, ...events].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    return combined.slice(0, 10);
  } catch (error) {
    logger.error('Error fetching recent activities:', error);
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
  getRecentActivities,
  parseCustomerBrainNotes,
  formatContextSummary
};

