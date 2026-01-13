const { query } = require('../salesforce/connection');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

/**
 * Generate Full Active Pipeline Excel Report
 */
async function generateFullPipelineExcel() {
  // Query: ALL active pipeline (Stages 0-4, all products)
  // Order by ACV descending (highest value deals first), then by Name
  // Note: SOQL doesn't support CASE in ORDER BY
  const reportQuery = `SELECT Name,
                              Account.Name,
                              Product_Line__c,
                              StageName,
                              Target_LOI_Date__c,
                              ACV__c,
                              Owner.Name
                       FROM Opportunity
                       WHERE IsClosed = false
                         AND StageName != 'Stage 6. Closed(Won)'
                         AND StageName != 'Stage 7. Closed Lost'
                       ORDER BY ACV__c DESC NULLS LAST, Name`;

  // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
  const data = await query(reportQuery, true);
  
  // Sort in memory by stage (Stage 4 first, then 3, 2, 1, 0) then by ACV
  const stageOrder = {
    'Stage 4 - Proposal': 1,
    'Stage 4. Proposal': 1,
    'Stage 3 - Pilot': 2,
    'Stage 3. Pilot': 2,
    'Stage 2 - SQO': 3,
    'Stage 2. SQO': 3,
    'Stage 1 - Discovery': 4,
    'Stage 1. Discovery': 4,
    'Stage 0 - Prospecting': 5,
    'Stage 0. Prospecting': 5
  };
  
  if (data && data.records) {
    data.records.sort((a, b) => {
      const stageA = stageOrder[a.StageName] || 6;
      const stageB = stageOrder[b.StageName] || 6;
      if (stageA !== stageB) return stageA - stageB;
      return (b.ACV__c || 0) - (a.ACV__c || 0); // Then by ACV desc
    });
  }

  if (!data || !data.records || data.records.length === 0) {
    throw new Error('No active pipeline data found');
  }

  // Calculate stage counts (handle both formats: "Stage X - Name" and "Stage X. Name")
  const isStage = (record, stageNum) => {
    const s = record.StageName || '';
    return s.includes(`Stage ${stageNum}`) && !s.includes('Closed');
  };
  
  const stage0Count = data.records.filter(r => isStage(r, '0')).length;
  const stage1Count = data.records.filter(r => isStage(r, '1')).length;
  const stage2Count = data.records.filter(r => isStage(r, '2')).length;
  const stage3Count = data.records.filter(r => isStage(r, '3')).length;
  const stage4Count = data.records.filter(r => isStage(r, '4')).length;
  const stage5Count = data.records.filter(r => isStage(r, '5')).length;
  
  // Calculate total ACV
  const totalACV = data.records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

  // Create Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Active Pipeline');

  // Define columns for full pipeline
  worksheet.columns = [
    { header: 'Account', key: 'account', width: 35 },
    { header: 'Opportunity Name', key: 'oppName', width: 40 },
    { header: 'Product Line', key: 'productLine', width: 25 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Target Sign Date', key: 'targetDate', width: 16 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'Owner', key: 'owner', width: 20 }
  ];

  // Header styling - BLACK background with WHITE bold text
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF000000' }
  };
  headerRow.height = 22;
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  // Add data
  data.records.forEach(record => {
    worksheet.addRow({
      account: record.Account?.Name || '',
      oppName: record.Name || '',
      productLine: record.Product_Line__c || '',
      stage: record.StageName || '',
      targetDate: record.Target_LOI_Date__c || '',
      acv: record.ACV__c || 0,
      owner: record.Owner?.Name || ''
    });
  });

  // Format currency
  worksheet.getColumn('acv').numFmt = '$#,##0';

  // Add borders
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    recordCount: data.records.length,
    totalACV,
    stage0Count,
    stage1Count,
    stage2Count,
    stage3Count,
    stage4Count,
    stage5Count
  };
}

/**
 * Send full pipeline report to Slack
 */
async function sendFullPipelineToSlack(client, channelId, userId) {
  try {
    logger.info('Generating full active pipeline report for Slack...');

    const result = await generateFullPipelineExcel();
    const { buffer, recordCount, totalACV, stage0Count, stage1Count, stage2Count, stage3Count, stage4Count, stage5Count } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Full_Active_Pipeline_${date}.xlsx`;
    
    // Format currency
    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    };

    // Format message with summary
    let message = `*Full Active Pipeline Report*\n`;
    message += `_${recordCount} opportunities • ${formatCurrency(totalACV)} total ACV_\n\n`;
    message += `*By Stage:*\n`;
    if (stage4Count > 0) message += `• Stage 4 (Proposal): ${stage4Count}\n`;
    if (stage3Count > 0) message += `• Stage 3 (Pilot): ${stage3Count}\n`;
    if (stage2Count > 0) message += `• Stage 2 (SQO): ${stage2Count}\n`;
    if (stage1Count > 0) message += `• Stage 1 (Discovery): ${stage1Count}\n`;
    if (stage0Count > 0) message += `• Stage 0 (Prospecting): ${stage0Count}\n`;
    if (stage5Count > 0) message += `• Stage 5 (Negotiation): ${stage5Count}\n`;
    message += `\n_Sorted by stage (late to early), then by ACV. All product lines included._`;

    // Upload to Slack
    const uploadResult = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Full Active Pipeline Report",
      initial_comment: message
    });

    logger.info('✅ Full pipeline report uploaded to Slack');
    return uploadResult;

  } catch (error) {
    logger.error('Failed to send full pipeline report to Slack:', error);
    throw error;
  }
}

module.exports = {
  generateFullPipelineExcel,
  sendFullPipelineToSlack
};

