const { query } = require('../salesforce/connection');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

/**
 * Generate Johnson Hana Weekly Pipeline Excel Report
 */
async function generateJohnsonHanaExcel() {
  // Query: Stages 2+ + Product lines: AI-Augmented Contracting, sigma, Insights
  const reportQuery = `SELECT Name,
                              Product_Line__c,
                              StageName,
                              Target_LOI_Date__c
                       FROM Opportunity
                       WHERE IsClosed = false
                         AND (StageName = 'Stage 2 - SQO'
                              OR StageName = 'Stage 3 - Pilot'
                              OR StageName = 'Stage 4 - Proposal')
                         AND (Product_Line__c = 'AI-Augmented Contracting'
                              OR Product_Line__c = 'sigma'
                              OR Product_Line__c = 'Insights')
                       ORDER BY StageName, Name`;

  const data = await query(reportQuery, false);

  if (!data || !data.records || data.records.length === 0) {
    throw new Error('No pipeline data found for report');
  }

  // Calculate stage counts
  const stage4Count = data.records.filter(r => r.StageName === 'Stage 4 - Proposal').length;
  const stage3Count = data.records.filter(r => r.StageName === 'Stage 3 - Pilot').length;
  const stage2Count = data.records.filter(r => r.StageName === 'Stage 2 - SQO').length;
  
  // Calculate "targeting signature this month"
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthCount = data.records.filter(r => {
    if (!r.Target_LOI_Date__c) return false;
    const targetDate = new Date(r.Target_LOI_Date__c);
    return targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear;
  }).length;

  // Create Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pipeline Report');

  // Define 4 visible columns + 2 blank columns
  worksheet.columns = [
    { header: 'Opportunity Name', key: 'oppName', width: 40 },
    { header: 'Product Line', key: 'productLine', width: 30 },
    { header: 'Stage', key: 'stage', width: 20 },
    { header: 'Target Sign Date', key: 'targetDate', width: 18 },
    { header: '', key: 'blank1', width: 10 }, // Blank column 1
    { header: '', key: 'blank2', width: 10 }  // Blank column 2
  ];

  // Header styling - BLACK background with WHITE bold text
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF000000' } // Black background
  };
  headerRow.height = 22;
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  // Add data - only 4 visible columns
  data.records.forEach(record => {
    worksheet.addRow({
      oppName: record.Name || '',
      productLine: record.Product_Line__c || '',
      stage: record.StageName || '',
      targetDate: record.Target_LOI_Date__c || '',
      blank1: '',
      blank2: ''
    });
  });

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
  });

  // Hide columns after the blank ones (columns G onwards)
  for (let i = 7; i <= 26; i++) {
    const col = worksheet.getColumn(i);
    col.hidden = true;
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return { 
    buffer, 
    recordCount: data.totalSize,
    stage4Count,
    stage3Count,
    stage2Count,
    thisMonthCount
  };
}

/**
 * Send pipeline report to Slack
 */
async function sendPipelineReportToSlack(client, channelId, userId) {
  try {
    logger.info('Generating pipeline report for Slack...');

    const { buffer, recordCount, stage4Count, stage3Count, stage2Count, thisMonthCount } = await generateJohnsonHanaExcel();
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Johnson_Hana_Weekly_Pipeline_${date}.xlsx`;

    // Format message
    let message = `*Johnson Hana - Weekly Pipeline Report*\n\n`;
    message += `Total Opps: ${recordCount}\n`;
    message += `Stage 4 - Proposal: ${stage4Count}\n`;
    message += `Stage 3 - Pilot: ${stage3Count}\n`;
    message += `Stage 2 - SQO: ${stage2Count}\n`;
    message += `Targeting Signature this Month: ${thisMonthCount}\n\n`;
    message += `Report filters: Contracting or sigma/insights tagged opportunities that are stage 2+.\n\n`;
    message += `If you would like Gov excluded, or any other adjustments let me know.`;

    // Upload to Slack
    const result = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Johnson Hana - Weekly Pipeline Report",
      initial_comment: message
    });

    logger.info('✅ Pipeline report uploaded to Slack');
    return result;

  } catch (error) {
    logger.error('Failed to send pipeline report to Slack:', error);
    throw error;
  }
}

module.exports = {
  generateJohnsonHanaExcel,
  sendPipelineReportToSlack
};
