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

    // Build record with only core fields known to exist
    // Additional fields are attempted but won't break if missing
    const record = {
      User_Email__c: email,
      Event_Type__c: eventType || 'Page_View',
      Event_Date__c: eventDate,
      Event_Timestamp__c: eventTimestamp
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

  // Each query is independent - if a field doesn't exist in the org, 
  // the other queries still work. Partial data is better than no data.
  const data = {
    dailyLogins: [],
    users: [],
    pagePopularity: [],
    recentActivity: [],
    todayStats: { totalEvents: 0, uniqueUsers: 0 }
  };
  const queryErrors = [];

  try {
    // Daily active users (last 30 days)
    try {
      const dailyResult = await sfConnection.query(`
        SELECT Event_Date__c, COUNT(Id) eventCount
        FROM GTM_Usage_Log__c
        WHERE Event_Date__c = LAST_N_DAYS:30
        GROUP BY Event_Date__c
        ORDER BY Event_Date__c
      `);
      data.dailyLogins = dailyResult.records || [];
    } catch (e) {
      queryErrors.push(`dailyLogins: ${e.message}`);
      logger.debug(`[UsageLogger] Daily query failed: ${e.message}`);
    }

    // User activity summary (minimal fields - just email and counts)
    try {
      const userResult = await sfConnection.query(`
        SELECT User_Email__c, MAX(Event_Timestamp__c) lastActive, COUNT(Id) totalEvents
        FROM GTM_Usage_Log__c
        GROUP BY User_Email__c
        ORDER BY MAX(Event_Timestamp__c) DESC
        LIMIT 100
      `);
      data.users = userResult.records || [];
    } catch (e) {
      queryErrors.push(`users: ${e.message}`);
      logger.debug(`[UsageLogger] User query failed: ${e.message}`);
    }

    // Recent activity (minimal fields only)
    try {
      const recentResult = await sfConnection.query(`
        SELECT User_Email__c, Event_Type__c, Event_Timestamp__c
        FROM GTM_Usage_Log__c
        ORDER BY Event_Timestamp__c DESC
        LIMIT 50
      `);
      data.recentActivity = recentResult.records || [];
    } catch (e) {
      queryErrors.push(`recentActivity: ${e.message}`);
      logger.debug(`[UsageLogger] Recent activity query failed: ${e.message}`);
    }

    // Today's stats
    try {
      const todayResult = await sfConnection.query(`
        SELECT COUNT(Id) totalEvents
        FROM GTM_Usage_Log__c
        WHERE Event_Date__c = TODAY
      `);
      data.todayStats.totalEvents = todayResult.records[0]?.totalEvents || 0;
    } catch (e) {
      queryErrors.push(`todayStats: ${e.message}`);
      logger.debug(`[UsageLogger] Today stats query failed: ${e.message}`);
    }

    // Unique users today
    try {
      const uniqueTodayResult = await sfConnection.query(`
        SELECT COUNT_DISTINCT(User_Email__c) uniqueUsers
        FROM GTM_Usage_Log__c
        WHERE Event_Date__c = TODAY
      `);
      data.todayStats.uniqueUsers = uniqueTodayResult.records[0]?.expr0 || 0;
    } catch (e) {
      logger.debug(`[UsageLogger] Unique users query failed: ${e.message}`);
    }

    if (queryErrors.length > 0) {
      logger.warn(`[UsageLogger] ${queryErrors.length} analytics queries had issues: ${queryErrors.join('; ')}`);
    }

    return { success: true, data, queryErrors: queryErrors.length > 0 ? queryErrors : undefined };

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
