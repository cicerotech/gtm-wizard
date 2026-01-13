/**
 * Unified Weekly Report Module
 * 
 * Consolidates all weekly reports into a single Friday midnight delivery:
 * 1. GTM Weekly Snapshot PDF
 * 2. Delivery Report PDF
 * 3. Pipeline Excel (2 tabs: raw data + late-stage summary)
 * 
 * Supports test channel override via WEEKLY_REPORT_TEST_CHANNEL env var.
 */

const cron = require('node-cron');
const logger = require('../utils/logger');

// Import existing report generators
const blWeeklySummary = require('./blWeeklySummary');
const deliveryWeeklySummary = require('./deliveryWeeklySummary');
const { generatePipelineExcel } = require('./reportToSlack');

// Configuration
const PRODUCTION_CHANNEL = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || 'C04JZLGQAMU'; // #gtm-account-planning
const TEST_CHANNEL = process.env.WEEKLY_REPORT_TEST_CHANNEL || null;

/**
 * Get the target channel for reports
 * If TEST_CHANNEL is set, use it for testing; otherwise use production
 */
function getTargetChannel() {
  if (TEST_CHANNEL) {
    logger.info(`📋 Using test channel: ${TEST_CHANNEL}`);
    return TEST_CHANNEL;
  }
  return PRODUCTION_CHANNEL;
}

/**
 * Generate and send the unified weekly report
 * 
 * @param {Object} app - Slack app instance
 * @param {boolean} testMode - If true, uses test channel
 * @param {string} targetChannel - Optional override channel
 */
async function sendUnifiedWeeklyReport(app, testMode = false, targetChannel = null) {
  try {
    const channel = targetChannel || (testMode ? TEST_CHANNEL : null) || getTargetChannel();
    
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('📊 UNIFIED WEEKLY REPORT - Starting generation');
    logger.info(`📍 Target channel: ${channel}`);
    logger.info('═══════════════════════════════════════════════════════════════');
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Track results
    const results = {
      gtmSnapshot: null,
      deliveryReport: null,
      pipelineExcel: null,
      errors: []
    };
    
    // ═══════════════════════════════════════════════════════════════════════
    // 1. Generate GTM Weekly Snapshot PDF
    // ═══════════════════════════════════════════════════════════════════════
    logger.info('📊 [1/3] Generating GTM Weekly Snapshot PDF...');
    try {
      results.gtmSnapshot = await blWeeklySummary.sendBLWeeklySummary(app, testMode, channel);
      logger.info('✅ GTM Weekly Snapshot sent successfully');
    } catch (error) {
      logger.error('❌ GTM Weekly Snapshot failed:', error.message);
      results.errors.push({ report: 'GTM Snapshot', error: error.message });
    }
    
    // Small delay between uploads to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ═══════════════════════════════════════════════════════════════════════
    // 2. Generate Delivery Report PDF
    // ═══════════════════════════════════════════════════════════════════════
    logger.info('📦 [2/3] Generating Delivery Report PDF...');
    try {
      results.deliveryReport = await deliveryWeeklySummary.sendDeliverySummaryNow(app, testMode, channel);
      logger.info('✅ Delivery Report sent successfully');
    } catch (error) {
      logger.error('❌ Delivery Report failed:', error.message);
      results.errors.push({ report: 'Delivery Report', error: error.message });
    }
    
    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ═══════════════════════════════════════════════════════════════════════
    // 3. Generate Pipeline Excel Report
    // ═══════════════════════════════════════════════════════════════════════
    logger.info('📈 [3/3] Generating Pipeline Excel Report...');
    try {
      const { buffer, recordCount, stage4Count, stage3Count, stage2Count, stage1Count, stage0Count, totalACV, lateStageACV } = await generatePipelineExcel();
      
      const filename = `Eudia_Pipeline_Report_${dateStr}.xlsx`;
      
      // Format summary message
      const formatCurrency = (amount) => {
        if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
        return `$${amount.toLocaleString()}`;
      };
      
      let message = `*Pipeline Report — ${displayDate}*\n\n`;
      message += `*Overview:* ${recordCount} opportunities • ${formatCurrency(totalACV)} total ACV\n`;
      message += `*Late Stage (S3+S4):* ${stage3Count + stage4Count} opps • ${formatCurrency(lateStageACV)}\n\n`;
      message += `*By Stage:*\n`;
      if (stage4Count > 0) message += `• Stage 4 - Proposal: ${stage4Count}\n`;
      if (stage3Count > 0) message += `• Stage 3 - Pilot: ${stage3Count}\n`;
      if (stage2Count > 0) message += `• Stage 2 - SQO: ${stage2Count}\n`;
      if (stage1Count > 0) message += `• Stage 1 - Discovery: ${stage1Count}\n`;
      if (stage0Count > 0) message += `• Stage 0 - Prospecting: ${stage0Count}\n`;
      message += `\n_See attached Excel for full pipeline data and late-stage summary._`;
      
      // Upload to Slack
      await app.client.files.uploadV2({
        channel_id: channel,
        file: buffer,
        filename: filename,
        title: `Pipeline Report — ${displayDate}`,
        initial_comment: message
      });
      
      results.pipelineExcel = { success: true, recordCount, totalACV };
      logger.info('✅ Pipeline Excel sent successfully');
      
    } catch (error) {
      logger.error('❌ Pipeline Excel failed:', error.message);
      results.errors.push({ report: 'Pipeline Excel', error: error.message });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('📊 UNIFIED WEEKLY REPORT - Complete');
    logger.info(`   GTM Snapshot: ${results.gtmSnapshot ? '✅' : '❌'}`);
    logger.info(`   Delivery Report: ${results.deliveryReport ? '✅' : '❌'}`);
    logger.info(`   Pipeline Excel: ${results.pipelineExcel ? '✅' : '❌'}`);
    if (results.errors.length > 0) {
      logger.warn(`   Errors: ${results.errors.length}`);
      results.errors.forEach(e => logger.warn(`   - ${e.report}: ${e.error}`));
    }
    logger.info('═══════════════════════════════════════════════════════════════');
    
    return results;
    
  } catch (error) {
    logger.error('❌ Unified Weekly Report failed:', error);
    throw error;
  }
}

/**
 * Schedule the unified weekly report
 * Runs Friday at midnight PST
 */
function scheduleUnifiedWeeklyReport(app) {
  // Friday at midnight Pacific Time
  // Cron: minute hour day-of-month month day-of-week
  // 0 0 * * 5 = midnight on Fridays
  cron.schedule('0 0 * * 5', async () => {
    logger.info('⏰ Running scheduled Unified Weekly Report (Friday midnight PST)');
    
    try {
      await sendUnifiedWeeklyReport(app, false);
      logger.info('✅ Scheduled Unified Weekly Report completed');
    } catch (error) {
      logger.error('❌ Scheduled Unified Weekly Report failed:', error);
    }
  }, {
    timezone: 'America/Los_Angeles' // Pacific Time
  });
  
  logger.info('📅 Unified Weekly Report scheduled (Friday midnight PST)');
}

/**
 * Manual trigger for testing
 * Sends to test channel if configured, otherwise to specified channel
 */
async function sendUnifiedReportNow(app, targetChannel = null) {
  logger.info('📧 Sending Unified Weekly Report now (manual trigger)');
  const channel = targetChannel || TEST_CHANNEL || PRODUCTION_CHANNEL;
  return await sendUnifiedWeeklyReport(app, true, channel);
}

module.exports = {
  scheduleUnifiedWeeklyReport,
  sendUnifiedWeeklyReport,
  sendUnifiedReportNow,
  getTargetChannel
};

