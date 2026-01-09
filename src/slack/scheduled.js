const cron = require('node-cron');
const logger = require('../utils/logger');
const { query } = require('../salesforce/connection');
const { queryBuilder } = require('../salesforce/queries');
const { formatResponse } = require('./responseFormatter');

/**
 * Start scheduled jobs
 */
function startScheduledJobs(app) {
  
  // Daily morning summary - 8:00 AM EST
  cron.schedule('0 8 * * 1-5', async () => {
    try {
      await sendDailySummary(app);
    } catch (error) {
      logger.error('Daily summary job failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // Weekly pipeline review - Monday 9:00 AM EST
  cron.schedule('0 9 * * 1', async () => {
    try {
      await sendWeeklyPipelineReview(app);
    } catch (error) {
      logger.error('Weekly pipeline review job failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // End of day alerts - 6:00 PM EST
  cron.schedule('0 18 * * 1-5', async () => {
    try {
      await sendEndOfDayAlerts(app);
    } catch (error) {
      logger.error('End of day alerts job failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // Monthly forecast review - First Monday of month, 10:00 AM EST
  cron.schedule('0 10 1-7 * 1', async () => {
    try {
      await sendMonthlyForecastReview(app);
    } catch (error) {
      logger.error('Monthly forecast review job failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // Deal health check - Every 2 hours during business hours
  cron.schedule('0 9-17/2 * * 1-5', async () => {
    try {
      await checkDealHealth(app);
    } catch (error) {
      logger.error('Deal health check job failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FRIDAY WEEKLY REPORTS - DISABLED UNTIL SF AUTH IS RESOLVED
  // These schedules were causing login storms when SF credentials are invalid
  // Re-enable once SF_PASSWORD and SF_SECURITY_TOKEN are updated in Render
  // ═══════════════════════════════════════════════════════════════════════════
  
  // const GTM_CHANNEL = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || 'C09RDPL1TUK';
  
  // DISABLED: 1. GTM Weekly Snapshot PDF + Late-Stage Pipeline (threaded) - Friday 00:00 PST
  // cron.schedule('0 0 * * 5', async () => {
  //   logger.info('📅 Running GTM Weekly Snapshot + Late-Stage Pipeline (Friday 00:00 PST)');
  //   try {
  //     const { sendBLWeeklySummary } = require('./blWeeklySummary');
  //     await sendBLWeeklySummary(app, false, GTM_CHANNEL);
  //     logger.info('✅ GTM Weekly Snapshot + Late-Stage thread sent');
  //   } catch (error) {
  //     logger.error('❌ GTM Weekly Snapshot failed:', error);
  //   }
  // }, {
  //   timezone: 'America/Los_Angeles'
  // });
  
  // DISABLED: 2. Delivery Report (PDF + Excel) + CSM Account Health (threaded) - Friday 00:02 PST
  // cron.schedule('2 0 * * 5', async () => {
  //   logger.info('📅 Running Delivery Report + CSM Account Health (Friday 00:02 PST)');
  //   try {
  //     const { sendDeliveryWeeklySummary } = require('./deliveryWeeklySummary');
  //     await sendDeliveryWeeklySummary(app, false, GTM_CHANNEL);
  //     logger.info('✅ Delivery Report + CSM thread sent');
  //   } catch (error) {
  //     logger.error('❌ Delivery Report failed:', error);
  //   }
  // }, {
  //   timezone: 'America/Los_Angeles'
  // });
  
  logger.info('⚠️ Friday Weekly Reports DISABLED - pending SF auth resolution');
  logger.info('   To re-enable: Update SF credentials in Render, then uncomment schedules');

  logger.info('✅ Scheduled jobs started');
}

/**
 * Send daily summary to sales channels
 */
async function sendDailySummary(app) {
  logger.info('📅 Running daily summary job');

  try {
    // Get deals closing today
    const closingToday = await query(`
      SELECT Name, Amount, Owner.Name, Account.Name, StageName
      FROM Opportunity
      WHERE CloseDate = TODAY AND IsClosed = false
      ORDER BY Amount DESC
    `);

    // Get deals closed yesterday
    const closedYesterday = await query(`
      SELECT Name, Amount, Owner.Name, Account.Name, IsWon
      FROM Opportunity
      WHERE CloseDate = YESTERDAY AND IsClosed = true
      ORDER BY Amount DESC
    `);

    // Get stale deals
    const staleDeals = await query(`
      SELECT Name, Amount, Owner.Name, StageName, LastActivityDate
      FROM Opportunity
      WHERE IsClosed = false 
        AND LastActivityDate < LAST_N_DAYS:14
        AND Amount > 50000
      ORDER BY Amount DESC
      LIMIT 10
    `);

    // Build summary message
    let message = `🌅 *Daily Sales Summary - ${new Date().toLocaleDateString()}*\n\n`;

    // Deals closing today
    if (closingToday.totalSize > 0) {
      const totalClosingAmount = closingToday.records.reduce((sum, r) => sum + (r.Amount || 0), 0);
      message += `🎯 *${closingToday.totalSize} deals closing today* (${formatCurrency(totalClosingAmount)})\n`;
      
      closingToday.records.slice(0, 5).forEach(deal => {
        message += `• ${deal.Name} - ${formatCurrency(deal.Amount)} (${deal.Owner?.Name})\n`;
      });
      message += '\n';
    }

    // Deals closed yesterday
    if (closedYesterday.totalSize > 0) {
      const wonDeals = closedYesterday.records.filter(r => r.IsWon);
      const lostDeals = closedYesterday.records.filter(r => !r.IsWon);
      const wonAmount = wonDeals.reduce((sum, r) => sum + (r.Amount || 0), 0);
      
      message += `📊 *Yesterday's Results*\n`;
      message += `• Won: ${wonDeals.length} deals (${formatCurrency(wonAmount)})\n`;
      message += `• Lost: ${lostDeals.length} deals\n\n`;
    }

    // Stale deals alert
    if (staleDeals.totalSize > 0) {
      const staleAmount = staleDeals.records.reduce((sum, r) => sum + (r.Amount || 0), 0);
      message += `⚠️ *Attention Needed*\n`;
      message += `${staleDeals.totalSize} high-value deals with no activity 14+ days (${formatCurrency(staleAmount)})\n`;
      
      staleDeals.records.slice(0, 3).forEach(deal => {
        const daysStale = Math.floor((Date.now() - new Date(deal.LastActivityDate)) / (1000 * 60 * 60 * 24));
        message += `• ${deal.Name} - ${daysStale} days (${deal.Owner?.Name})\n`;
      });
    }

    // Send to sales leadership channel
    await app.client.chat.postMessage({
      channel: process.env.SALES_LEADERSHIP_CHANNEL || '#sales-leadership',
      text: message
    });

    logger.info('✅ Daily summary sent successfully');

  } catch (error) {
    logger.error('Daily summary failed:', error);
  }
}

/**
 * Send weekly pipeline review
 */
async function sendWeeklyPipelineReview(app) {
  logger.info('📅 Running weekly pipeline review');

  try {
    // Get pipeline by stage
    const pipelineByStage = await query(`
      SELECT StageName, COUNT(Id) RecordCount, SUM(Amount) TotalAmount
      FROM Opportunity
      WHERE IsClosed = false
      GROUP BY StageName
      ORDER BY TotalAmount DESC
    `);

    // Get week over week comparison
    const thisWeekCreated = await query(`
      SELECT COUNT(Id) RecordCount, SUM(Amount) TotalAmount
      FROM Opportunity
      WHERE CreatedDate = THIS_WEEK
    `);

    const lastWeekCreated = await query(`
      SELECT COUNT(Id) RecordCount, SUM(Amount) TotalAmount
      FROM Opportunity
      WHERE CreatedDate = LAST_WEEK
    `);

    let message = `📊 *Weekly Pipeline Review - Week of ${new Date().toLocaleDateString()}*\n\n`;

    // Pipeline by stage
    message += `*Current Pipeline by Stage:*\n`;
    pipelineByStage.records.forEach(stage => {
      message += `• ${stage.StageName}: ${stage.RecordCount} deals (${formatCurrency(stage.TotalAmount || 0)})\n`;
    });
    message += '\n';

    // Week over week
    const thisWeekAmount = thisWeekCreated.records[0]?.TotalAmount || 0;
    const lastWeekAmount = lastWeekCreated.records[0]?.TotalAmount || 0;
    const weeklyGrowth = lastWeekAmount > 0 ? ((thisWeekAmount - lastWeekAmount) / lastWeekAmount * 100) : 0;

    message += `*Week over Week:*\n`;
    message += `• This week: ${thisWeekCreated.records[0]?.RecordCount || 0} deals (${formatCurrency(thisWeekAmount)})\n`;
    message += `• Last week: ${lastWeekCreated.records[0]?.RecordCount || 0} deals (${formatCurrency(lastWeekAmount)})\n`;
    message += `• Growth: ${weeklyGrowth > 0 ? '+' : ''}${weeklyGrowth.toFixed(1)}%\n`;

    await app.client.chat.postMessage({
      channel: process.env.SALES_TEAM_CHANNEL || '#sales-team',
      text: message
    });

    logger.info('✅ Weekly pipeline review sent successfully');

  } catch (error) {
    logger.error('Weekly pipeline review failed:', error);
  }
}

/**
 * Send end of day alerts
 */
async function sendEndOfDayAlerts(app) {
  logger.info('📅 Running end of day alerts');

  try {
    // Check for deals that moved stages today
    const stageMovements = await query(`
      SELECT Name, Amount, Owner.Name, StageName
      FROM Opportunity
      WHERE LastModifiedDate = TODAY 
        AND IsClosed = false
      ORDER BY Amount DESC
      LIMIT 10
    `);

    // Check for deals with close dates pushed out
    const pushedDeals = await query(`
      SELECT Name, Amount, Owner.Name, CloseDate
      FROM Opportunity
      WHERE LastModifiedDate = TODAY 
        AND CloseDate > TODAY
        AND IsClosed = false
      ORDER BY Amount DESC
      LIMIT 5
    `);

    if (stageMovements.totalSize > 0 || pushedDeals.totalSize > 0) {
      let message = `🌆 *End of Day Update*\n\n`;

      if (stageMovements.totalSize > 0) {
        message += `📈 *${stageMovements.totalSize} deals updated today:*\n`;
        stageMovements.records.forEach(deal => {
          message += `• ${deal.Name} - ${deal.StageName} (${deal.Owner?.Name})\n`;
        });
        message += '\n';
      }

      if (pushedDeals.totalSize > 0) {
        message += `⏰ *${pushedDeals.totalSize} deals had close dates moved:*\n`;
        pushedDeals.records.forEach(deal => {
          message += `• ${deal.Name} - now ${new Date(deal.CloseDate).toLocaleDateString()} (${deal.Owner?.Name})\n`;
        });
      }

      await app.client.chat.postMessage({
        channel: process.env.SALES_MANAGERS_CHANNEL || '#sales-managers',
        text: message
      });
    }

    logger.info('✅ End of day alerts sent successfully');

  } catch (error) {
    logger.error('End of day alerts failed:', error);
  }
}

/**
 * Send monthly forecast review
 */
async function sendMonthlyForecastReview(app) {
  logger.info('📅 Running monthly forecast review');

  try {
    // Get forecast by category
    const forecastByCategory = await query(`
      SELECT ForecastCategory, COUNT(Id) RecordCount, SUM(Amount) TotalAmount
      FROM Opportunity
      WHERE CloseDate = THIS_MONTH AND IsClosed = false
      GROUP BY ForecastCategory
      ORDER BY TotalAmount DESC
    `);

    let message = `📈 *Monthly Forecast Review - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*\n\n`;

    message += `*Forecast by Category:*\n`;
    forecastByCategory.records.forEach(category => {
      message += `• ${category.ForecastCategory || 'Pipeline'}: ${category.RecordCount} deals (${formatCurrency(category.TotalAmount || 0)})\n`;
    });

    await app.client.chat.postMessage({
      channel: process.env.REVENUE_OPS_CHANNEL || '#revenue-ops',
      text: message
    });

    logger.info('✅ Monthly forecast review sent successfully');

  } catch (error) {
    logger.error('Monthly forecast review failed:', error);
  }
}

/**
 * Check deal health and send alerts
 */
async function checkDealHealth(app) {
  // Only run during business hours
  const hour = new Date().getHours();
  if (hour < 9 || hour > 17) return;

  try {
    // Check for at-risk deals
    const atRiskDeals = await query(`
      SELECT Name, Amount, Owner.Name, CloseDate, Probability
      FROM Opportunity
      WHERE CloseDate = NEXT_N_DAYS:7 
        AND Probability < 50 
        AND IsClosed = false
        AND Amount > 100000
      ORDER BY Amount DESC
    `);

    if (atRiskDeals.totalSize > 0) {
      const targetChannel = process.env.SALES_MANAGERS_CHANNEL;
      
      // Skip if no channel configured
      if (!targetChannel) {
        logger.info('⏭️ Deal health check: No SALES_MANAGERS_CHANNEL configured, skipping alert');
        return;
      }
      
      const totalAtRisk = atRiskDeals.records.reduce((sum, r) => sum + (r.Amount || 0), 0);
      
      let message = `🚨 *Deal Health Alert*\n\n`;
      message += `${atRiskDeals.totalSize} high-value deals closing within 7 days with <50% probability (${formatCurrency(totalAtRisk)} at risk)\n\n`;
      
      atRiskDeals.records.slice(0, 5).forEach(deal => {
        message += `• ${deal.Name} - ${formatCurrency(deal.Amount)} (${deal.Probability}%) - ${deal.Owner?.Name}\n`;
      });

      try {
        await app.client.chat.postMessage({
          channel: targetChannel,
          text: message
        });
        logger.info('🚨 At-risk deals alert sent', { count: atRiskDeals.totalSize });
      } catch (postError) {
        if (postError.data?.error === 'channel_not_found') {
          logger.warn(`⚠️ Deal health alert skipped: Channel ${targetChannel} not found or bot not invited`);
        } else {
          throw postError;
        }
      }
    }

  } catch (error) {
    logger.error('Deal health check failed:', error);
  }
}

/**
 * Format currency for notifications
 */
function formatCurrency(amount) {
  if (!amount || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  } else {
    return `$${amount.toLocaleString()}`;
  }
}

module.exports = {
  startScheduledJobs
};

