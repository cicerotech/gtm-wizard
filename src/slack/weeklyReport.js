const cron = require('node-cron');
const { query } = require('../salesforce/connection');
const { emailService } = require('../utils/emailService');
const logger = require('../utils/logger');

/**
 * Query for Johnson Hana weekly pipeline report
 */
async function getJohnsonHanaReport() {
  // Report filters: Stages 2, 3, 4 + Product lines: Contracting, Multiple, sigma, Insights
  const reportQuery = `SELECT Account.Name,
                              Name,
                              StageName,
                              Product_Line__c,
                              ACV__c,
                              Finance_Weighted_ACV__c,
                              Target_LOI_Date__c,
                              Owner.Name,
                              Days_in_Stage1__c
                       FROM Opportunity
                       WHERE IsClosed = false
                         AND StageName IN ('Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                         AND (Product_Line__c LIKE 'AI-Augmented Contracting%'
                              OR Product_Line__c LIKE 'AI-Augmented Compliance%'
                              OR Product_Line__c LIKE 'AI-Augmented M&A%'
                              OR Product_Line__c = 'FDE - Custom AI Solution'
                              OR Product_Line__c = 'Multiple'
                              OR Product_Line__c = 'AI Platform - Sigma'
                              OR Product_Line__c = 'AI Platform - Insights'
                              OR Product_Line__c = 'AI Platform - Litigation')
                       ORDER BY StageName, Account.Name`;

  // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
  return await query(reportQuery, true);
}

/**
 * Send Johnson Hana weekly report
 */
async function sendJohnsonHanaReport(testMode = false) {
  try {
    logger.info('📊 Generating Johnson Hana weekly pipeline report...');

    // Get report data
    const reportData = await getJohnsonHanaReport();
    
    if (!reportData || !reportData.records || reportData.records.length === 0) {
      logger.warn('No data for Johnson Hana report');
      return;
    }

    logger.info(`Report data: ${reportData.totalSize} opportunities`);

    // Create Excel
    const excelBuffer = await emailService.createPipelineExcel(reportData.records);

    // Email details
    const recipients = testMode 
      ? ['keigan.pesenti@eudia.com'] // Test mode
      : [
          'davidacres@johnsonhana.com',
          'leemorrissey@johnsonhana.com',
          'jessicakiely@johnsonhana.com',
          'rionamchale@johnsonhana.com',
          'charleslindon@johnsonhana.com'
        ];

    const subject = 'Eudia Weekly Pipeline Johnson Hana';
    
    const body = `Here's this week's pipeline filtered to Stage 2, 3, and 4.

Includes contracting opportunities and those tagged as Multiple/Sigma/Insights/Litigation.

Total Opportunities: ${reportData.totalSize}

Please see attached Excel for full details.

Best regards,
Eudia GTM Team`;

    // Send email
    const result = await emailService.sendReportEmail(
      recipients,
      subject,
      body,
      excelBuffer,
      `Eudia_Pipeline_Report_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    logger.info('✅ Johnson Hana report sent successfully', result);
    return result;

  } catch (error) {
    logger.error('❌ Failed to send Johnson Hana report:', error);
    throw error;
  }
}

/**
 * Schedule weekly report (Thursday 5 PM PST)
 */
function scheduleWeeklyReport() {
  // Thursday at 5 PM Pacific Time
  // Cron: minute hour day-of-month month day-of-week
  // 0 17 * * 4 = 5 PM on Thursdays
  
  cron.schedule('0 17 * * 4', async () => {
    logger.info('⏰ Running scheduled Johnson Hana report (Thursday 5 PM)');
    
    try {
      await sendJohnsonHanaReport(false); // Production mode
      logger.info('✅ Weekly report completed');
    } catch (error) {
      logger.error('❌ Weekly report failed:', error);
    }
  }, {
    timezone: 'America/Los_Angeles' // Pacific Time
  });

  logger.info('📅 Weekly Johnson Hana report scheduled (Thursday 5 PM PST)');
}

/**
 * Manual trigger for testing
 */
async function sendReportNow(testMode = true) {
  logger.info(`📧 Sending report now (test mode: ${testMode})`);
  return await sendJohnsonHanaReport(testMode);
}

module.exports = {
  scheduleWeeklyReport,
  sendReportNow,
  getJohnsonHanaReport
};

