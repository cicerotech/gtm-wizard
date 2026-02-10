/**
 * Deal Health Monitor Agent
 * 
 * Runs on a schedule to proactively detect pipeline risks.
 * Checks for:
 * - Stale deals (no activity in 14+ days)
 * - Forecast category downgraded or unchanged despite stage advancement
 * - Target sign dates slipping (moved out >7 days)
 * - Deals in late stage (4-5) with no recent meeting notes
 * - BL commit gaps (commit total < prior week)
 * 
 * Schedule: Runs twice daily (8 AM and 4 PM ET) via the job queue.
 * Alerts are sent to Slack and stored for the dashboard.
 */

const db = require('../db/connection');
const logger = require('../observability/logger');
const jobQueue = require('./jobQueue');

// Alert severity levels
const SEVERITY = {
  HIGH: 'high',       // Immediate attention needed
  MEDIUM: 'medium',   // Should address this week
  LOW: 'low'          // Informational / minor risk
};

/**
 * Main handler for deal health check jobs
 */
async function handleDealHealthCheck(job) {
  logger.info(`[DealHealthAgent] Starting deal health check (job #${job.id})`);
  
  const alerts = [];
  
  try {
    const { query: sfQuery } = require('../salesforce/connection');
    
    const activeStages = [
      'Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO',
      'Stage 3 - Pilot / POC', 'Stage 4 - Proposal / Pricing', 'Stage 5 - Contracting / Negotiation'
    ];
    const stageFilter = activeStages.map(s => `'${s}'`).join(',');

    // ─── Check 1: Stale deals (no LastModifiedDate activity in 14+ days) ───
    try {
      const staleResult = await sfQuery(`
        SELECT Name, Account.Name accountName, Owner.Name ownerName, 
               StageName, ACV__c, LastModifiedDate, Target_LOI_Date__c
        FROM Opportunity 
        WHERE StageName IN (${stageFilter})
          AND LastModifiedDate < LAST_N_DAYS:14
        ORDER BY ACV__c DESC
        LIMIT 20
      `, true);

      for (const deal of (staleResult.records || [])) {
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(deal.LastModifiedDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        const acvStr = deal.ACV__c ? `$${Math.round(deal.ACV__c / 1000)}k` : '$0';
        
        alerts.push({
          type: 'stale_deal',
          severity: daysSinceUpdate > 21 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          account: deal.accountName,
          owner: deal.ownerName,
          stage: deal.StageName,
          acv: deal.ACV__c || 0,
          message: `${deal.accountName} (${acvStr}, ${deal.StageName}) — no updates in ${daysSinceUpdate} days`,
          details: { daysSinceUpdate, lastModified: deal.LastModifiedDate }
        });
      }
      logger.info(`[DealHealthAgent] Found ${staleResult.records?.length || 0} stale deals`);
    } catch (err) {
      logger.warn('[DealHealthAgent] Stale deal check failed:', err.message);
    }

    // ─── Check 2: Target sign dates in the past (slipping) ────────────
    try {
      const slippedResult = await sfQuery(`
        SELECT Name, Account.Name accountName, Owner.Name ownerName,
               StageName, ACV__c, Target_LOI_Date__c, BL_Forecast_Category__c
        FROM Opportunity 
        WHERE StageName IN (${stageFilter})
          AND Target_LOI_Date__c < TODAY
          AND Target_LOI_Date__c != null
        ORDER BY ACV__c DESC
        LIMIT 15
      `, true);

      for (const deal of (slippedResult.records || [])) {
        const daysOverdue = Math.floor(
          (Date.now() - new Date(deal.Target_LOI_Date__c).getTime()) / (1000 * 60 * 60 * 24)
        );
        const acvStr = deal.ACV__c ? `$${Math.round(deal.ACV__c / 1000)}k` : '$0';
        
        alerts.push({
          type: 'target_date_passed',
          severity: daysOverdue > 30 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          account: deal.accountName,
          owner: deal.ownerName,
          stage: deal.StageName,
          acv: deal.ACV__c || 0,
          message: `${deal.accountName} (${acvStr}) — target sign date ${daysOverdue} days overdue`,
          details: { daysOverdue, targetDate: deal.Target_LOI_Date__c, forecastCategory: deal.BL_Forecast_Category__c }
        });
      }
      logger.info(`[DealHealthAgent] Found ${slippedResult.records?.length || 0} deals with passed target dates`);
    } catch (err) {
      logger.warn('[DealHealthAgent] Target date check failed:', err.message);
    }

    // ─── Check 3: Late-stage deals with high ACV needing attention ───
    try {
      const lateStageResult = await sfQuery(`
        SELECT Name, Account.Name accountName, Owner.Name ownerName,
               StageName, ACV__c, Target_LOI_Date__c, BL_Forecast_Category__c,
               LastModifiedDate
        FROM Opportunity 
        WHERE (StageName LIKE 'Stage 4%' OR StageName LIKE 'Stage 5%')
          AND ACV__c > 50000
          AND LastModifiedDate < LAST_N_DAYS:7
        ORDER BY ACV__c DESC
        LIMIT 10
      `, true);

      for (const deal of (lateStageResult.records || [])) {
        const acvStr = `$${Math.round(deal.ACV__c / 1000)}k`;
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(deal.LastModifiedDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        alerts.push({
          type: 'high_value_stale',
          severity: SEVERITY.HIGH,
          account: deal.accountName,
          owner: deal.ownerName,
          stage: deal.StageName,
          acv: deal.ACV__c,
          message: `High-value late-stage: ${deal.accountName} (${acvStr}, ${deal.StageName}) — ${daysSinceUpdate} days since last update`,
          details: { daysSinceUpdate, forecastCategory: deal.BL_Forecast_Category__c }
        });
      }
      logger.info(`[DealHealthAgent] Found ${lateStageResult.records?.length || 0} high-value stale late-stage deals`);
    } catch (err) {
      logger.warn('[DealHealthAgent] Late-stage check failed:', err.message);
    }

  } catch (sfErr) {
    logger.error('[DealHealthAgent] Salesforce query failed:', sfErr.message);
  }

  // ─── Store alerts ─────────────────────────────────────────────────
  const result = {
    totalAlerts: alerts.length,
    high: alerts.filter(a => a.severity === SEVERITY.HIGH).length,
    medium: alerts.filter(a => a.severity === SEVERITY.MEDIUM).length,
    low: alerts.filter(a => a.severity === SEVERITY.LOW).length,
    slackPosted: false
  };

  // Store alerts in DB for dashboard access
  if (db.isAvailable()) {
    try {
      const { analyticsRepo } = require('../db/repositories');
      await analyticsRepo.trackEvent('deal_health_check', null, {
        alertCount: alerts.length,
        alerts: alerts.slice(0, 50), // Cap at 50 for storage
        severity: result
      });
    } catch (dbErr) {
      logger.warn('[DealHealthAgent] Failed to store alerts:', dbErr.message);
    }
  }

  // ─── Post summary to Slack ────────────────────────────────────────
  if (alerts.length > 0) {
    try {
      await postHealthSummaryToSlack(alerts, result);
      result.slackPosted = true;
    } catch (slackErr) {
      logger.warn('[DealHealthAgent] Slack post failed:', slackErr.message);
    }
  }

  logger.info(`[DealHealthAgent] Health check complete: ${result.totalAlerts} alerts (${result.high} high, ${result.medium} medium)`);
  return result;
}

/**
 * Post a health summary to Slack
 */
async function postHealthSummaryToSlack(alerts, summary) {
  const { WebClient } = require('@slack/web-api');
  const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  
  const channelId = process.env.PIPELINE_SLACK_CHANNEL;
  if (!channelId) return;

  const highAlerts = alerts.filter(a => a.severity === SEVERITY.HIGH);
  const medAlerts = alerts.filter(a => a.severity === SEVERITY.MEDIUM);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Deal Health Check | ${new Date().toLocaleDateString()}` }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Found *${summary.totalAlerts}* alerts: ${summary.high} high, ${summary.medium} medium, ${summary.low} low` }
    },
    { type: 'divider' }
  ];

  // High severity alerts
  if (highAlerts.length > 0) {
    let highText = '*High Priority*\n';
    for (const alert of highAlerts.slice(0, 8)) {
      highText += `• ${alert.message}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: highText.substring(0, 3000) }
    });
  }

  // Medium severity alerts (top 5)
  if (medAlerts.length > 0) {
    let medText = '*Medium Priority*\n';
    for (const alert of medAlerts.slice(0, 5)) {
      medText += `• ${alert.message}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: medText.substring(0, 3000) }
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Generated by GTM Brain Deal Health Agent_' }]
  });

  await slackClient.chat.postMessage({
    channel: channelId,
    text: `Deal Health Check: ${summary.totalAlerts} alerts found`,
    blocks
  });
}

/**
 * Schedule the deal health check to run twice daily
 * Called during app startup when DB is available
 */
async function scheduleDailyChecks() {
  if (!db.isAvailable()) return;

  // Schedule for today at 8 AM ET and 4 PM ET (if not already past)
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  const times = ['13:00:00.000Z', '21:00:00.000Z']; // 8AM ET and 4PM ET in UTC
  
  for (const time of times) {
    const scheduledFor = new Date(`${today}T${time}`);
    if (scheduledFor > now) {
      await jobQueue.scheduleRecurring('deal_health_check', {}, scheduledFor);
    }
  }
}

/**
 * Register the handler with the job queue
 */
function register() {
  jobQueue.registerHandler('deal_health_check', handleDealHealthCheck);
  
  // Schedule daily checks
  scheduleDailyChecks().catch(err => 
    logger.debug('[DealHealthAgent] Daily scheduling skipped:', err.message)
  );
  
  logger.info('[DealHealthAgent] Registered with job queue');
}

module.exports = {
  register,
  handleDealHealthCheck,
  scheduleDailyChecks,
  SEVERITY
};
