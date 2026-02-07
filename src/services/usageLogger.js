/**
 * usageLogger.js
 * 
 * Service for logging GTM site usage events to Salesforce.
 * Tracks logins, page views, and user engagement for analytics.
 * 
 * Events are pushed to GTM_Usage_Log__c custom object in Salesforce
 * for persistent storage that survives server restarts.
 */

const logger = require('../utils/logger');
const { sfConnection } = require('../salesforce/connection');

/**
 * Log a usage event to Salesforce
 * Uses fire-and-forget pattern - doesn't block page loads
 * 
 * @param {Object} event - Event details
 * @param {string} event.email - User email (required)
 * @param {string} event.name - User display name
 * @param {string} event.eventType - Type: Login, Page_View, Logout, Feature_Use
 * @param {string} event.pageName - Page/route path
 * @param {string} event.sessionId - Session identifier for grouping
 * @param {string} event.userAgent - Browser/device info
 * @param {string} event.ip - IP address
 */
async function logUsageEvent({ email, name, eventType, pageName, sessionId, userAgent, ip }) {
  // Skip if no email (required field)
  if (!email) {
    logger.debug('[UsageLogger] Skipping event - no email provided');
    return { success: false, reason: 'No email provided' };
  }

  // Skip if Salesforce not connected
  if (!sfConnection.isConnected) {
    logger.debug('[UsageLogger] Skipping event - Salesforce not connected');
    return { success: false, reason: 'Salesforce not connected' };
  }

  try {
    const now = new Date();
    const eventDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const eventTimestamp = now.toISOString();

    const record = {
      User_Email__c: email,
      Event_Type__c: eventType || 'Page_View',
      Page_Name__c: pageName?.substring(0, 255) || null,
      Event_Date__c: eventDate,
      Event_Timestamp__c: eventTimestamp,
      Session_Id__c: sessionId?.substring(0, 50) || null,
      User_Agent__c: userAgent?.substring(0, 255) || null,
      IP_Address__c: ip?.replace('::ffff:', '')?.substring(0, 50) || null
    };

    // Use the underlying jsforce connection
    const result = await sfConnection.conn.sobject('GTM_Usage_Log__c').create(record);

    if (result.success) {
      logger.debug(`[UsageLogger] Logged ${eventType} for ${email} on ${pageName}`);
      return { success: true, id: result.id };
    } else {
      logger.warn(`[UsageLogger] Failed to create record:`, result.errors);
      return { success: false, errors: result.errors };
    }

  } catch (error) {
    // Don't let logging failures affect user experience
    logger.warn(`[UsageLogger] Error logging event: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Log a login event (convenience wrapper)
 */
async function logLogin(session, req) {
  return logUsageEvent({
    email: session.email,
    name: session.name,
    eventType: 'Login',
    pageName: '/gtm',
    sessionId: session.sub,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
}

/**
 * Log a page view event (convenience wrapper)
 */
async function logPageView(session, pageName, req) {
  return logUsageEvent({
    email: session.email,
    name: session.name,
    eventType: 'Page_View',
    pageName: pageName,
    sessionId: session.sub,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
}

/**
 * Log a logout event (convenience wrapper)
 */
async function logLogout(session, req) {
  return logUsageEvent({
    email: session.email,
    name: session.name,
    eventType: 'Logout',
    pageName: '/gtm/logout',
    sessionId: session.sub,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
}

/**
 * Query usage analytics from Salesforce
 * Returns aggregated data for the analytics dashboard
 */
async function getUsageAnalytics() {
  if (!sfConnection.isConnected) {
    return { success: false, reason: 'Salesforce not connected' };
  }

  try {
    // Daily active users (last 30 days)
    const dailyQuery = `
      SELECT Event_Date__c, COUNT(Id) eventCount
      FROM GTM_Usage_Log__c
      WHERE Event_Type__c = 'Login' AND Event_Date__c = LAST_N_DAYS:30
      GROUP BY Event_Date__c
      ORDER BY Event_Date__c
    `;
    const dailyResult = await sfConnection.query(dailyQuery);

    // User activity summary
    const userQuery = `
      SELECT User_Email__c, MAX(Event_Timestamp__c) lastActive, COUNT(Id) totalEvents
      FROM GTM_Usage_Log__c
      GROUP BY User_Email__c
      ORDER BY MAX(Event_Timestamp__c) DESC
      LIMIT 100
    `;
    const userResult = await sfConnection.query(userQuery);

    // Page popularity
    const pageQuery = `
      SELECT Page_Name__c, COUNT(Id) views
      FROM GTM_Usage_Log__c
      WHERE Event_Type__c = 'Page_View' AND Page_Name__c != null
      GROUP BY Page_Name__c
      ORDER BY COUNT(Id) DESC
    `;
    const pageResult = await sfConnection.query(pageQuery);

    // Recent activity (last 50 events)
    const recentQuery = `
      SELECT User_Email__c, Event_Type__c, Page_Name__c, Event_Timestamp__c
      FROM GTM_Usage_Log__c
      ORDER BY Event_Timestamp__c DESC
      LIMIT 50
    `;
    const recentResult = await sfConnection.query(recentQuery);

    // Today's stats
    const todayQuery = `
      SELECT COUNT(Id) totalEvents
      FROM GTM_Usage_Log__c
      WHERE Event_Date__c = TODAY
    `;
    const todayResult = await sfConnection.query(todayQuery);

    // Unique users today
    const uniqueTodayQuery = `
      SELECT COUNT_DISTINCT(User_Email__c) uniqueUsers
      FROM GTM_Usage_Log__c
      WHERE Event_Date__c = TODAY
    `;
    let uniqueTodayCount = 0;
    try {
      const uniqueTodayResult = await sfConnection.query(uniqueTodayQuery);
      uniqueTodayCount = uniqueTodayResult.records[0]?.expr0 || 0;
    } catch {
      // COUNT_DISTINCT may not be supported in all orgs
      logger.debug('[UsageLogger] COUNT_DISTINCT not supported, falling back');
    }

    return {
      success: true,
      data: {
        dailyLogins: dailyResult.records || [],
        users: userResult.records || [],
        pagePopularity: pageResult.records || [],
        recentActivity: recentResult.records || [],
        todayStats: {
          totalEvents: todayResult.records[0]?.totalEvents || 0,
          uniqueUsers: uniqueTodayCount
        }
      }
    };

  } catch (error) {
    logger.error('[UsageLogger] Error fetching analytics:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  logUsageEvent,
  logLogin,
  logPageView,
  logLogout,
  getUsageAnalytics
};
