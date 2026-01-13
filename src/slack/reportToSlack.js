/**
 * Pipeline Report Generator
 * 
 * Generates Excel report with full active pipeline data:
 * - Tab 1: Raw Pipeline (all active opportunities, sorted by stage then ACV)
 * - Tab 2: Late Stage Summary (S3/S4 breakdown by product line)
 * 
 * Styling: Times New Roman 12pt, black header with white text
 */

const { query } = require('../salesforce/connection');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

/**
 * Generate Pipeline Excel Report with 2 tabs
 */
async function generatePipelineExcel() {
  // Query ALL active pipeline (no product line filter)
  const reportQuery = `SELECT Name,
                              Account.Name,
                              Product_Line__c,
                              StageName,
                              Target_LOI_Date__c,
                              ACV__c,
                              Weighted_ACV__c,
                              Owner.Name
                       FROM Opportunity
                       WHERE IsClosed = false
                         AND StageName IN (
                           'Stage 0 - Prospecting',
                           'Stage 1 - Discovery',
                           'Stage 2 - SQO',
                           'Stage 3 - Pilot',
                           'Stage 4 - Proposal'
                         )
                       ORDER BY StageName DESC, ACV__c DESC NULLS LAST`;

  // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
  const data = await query(reportQuery, true);

  if (!data || !data.records || data.records.length === 0) {
    throw new Error('No pipeline data found for report');
  }

  // Sort by stage priority (Stage 4 first) then by ACV
  const stageOrder = {
    'Stage 4 - Proposal': 1,
    'Stage 3 - Pilot': 2,
    'Stage 2 - SQO': 3,
    'Stage 1 - Discovery': 4,
    'Stage 0 - Prospecting': 5
  };

  data.records.sort((a, b) => {
    const stageA = stageOrder[a.StageName] || 6;
    const stageB = stageOrder[b.StageName] || 6;
    if (stageA !== stageB) return stageA - stageB;
    return (b.ACV__c || 0) - (a.ACV__c || 0);
  });

  // Calculate metrics
  const stage4Count = data.records.filter(r => r.StageName === 'Stage 4 - Proposal').length;
  const stage3Count = data.records.filter(r => r.StageName === 'Stage 3 - Pilot').length;
  const stage2Count = data.records.filter(r => r.StageName === 'Stage 2 - SQO').length;
  const stage1Count = data.records.filter(r => r.StageName === 'Stage 1 - Discovery').length;
  const stage0Count = data.records.filter(r => r.StageName === 'Stage 0 - Prospecting').length;
  
  const totalACV = data.records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);
  
  // Late stage (S3 + S4)
  const lateStageRecords = data.records.filter(r => 
    r.StageName === 'Stage 4 - Proposal' || r.StageName === 'Stage 3 - Pilot'
  );
  const lateStageACV = lateStageRecords.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

  // Calculate "targeting signature this month"
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthCount = data.records.filter(r => {
    if (!r.Target_LOI_Date__c) return false;
    const targetDate = new Date(r.Target_LOI_Date__c);
    return targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear;
  }).length;

  // ═══════════════════════════════════════════════════════════════════════════
  // Create Excel Workbook
  // ═══════════════════════════════════════════════════════════════════════════
  const workbook = new ExcelJS.Workbook();
  
  // Common styling
  const headerStyle = {
    font: { 
      name: 'Times New Roman', 
      size: 12, 
      bold: true, 
      color: { argb: 'FFFFFFFF' } 
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' }
    },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  const bodyStyle = {
    font: { name: 'Times New Roman', size: 12 },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: Raw Pipeline
  // ═══════════════════════════════════════════════════════════════════════════
  const rawSheet = workbook.addWorksheet('Raw Pipeline');

  rawSheet.columns = [
    { header: 'Account', key: 'account', width: 35 },
    { header: 'Opportunity Name', key: 'oppName', width: 45 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Target Sign Date', key: 'targetDate', width: 18 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'Owner', key: 'owner', width: 20 }
  ];

  // Apply header styling
  const rawHeader = rawSheet.getRow(1);
  rawHeader.height = 24;
  rawHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add data rows
  data.records.forEach(record => {
    const row = rawSheet.addRow({
      account: record.Account?.Name || '',
      oppName: record.Name || '',
      productLine: record.Product_Line__c || '',
      stage: record.StageName || '',
      targetDate: record.Target_LOI_Date__c || '',
      acv: record.ACV__c || 0,
      owner: record.Owner?.Name || ''
    });
    
    // Apply body styling
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format ACV column as currency
  rawSheet.getColumn('acv').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Late Stage Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Late Stage Summary');

  // Build summary data: S3 + S4 grouped by Product Line
  const summaryData = {};
  
  lateStageRecords.forEach(record => {
    const stage = record.StageName;
    const productLine = record.Product_Line__c || 'Unassigned';
    const key = `${stage}|${productLine}`;
    
    if (!summaryData[key]) {
      summaryData[key] = {
        stage,
        productLine,
        count: 0,
        totalACV: 0,
        targetingThisMonth: 0
      };
    }
    
    summaryData[key].count++;
    summaryData[key].totalACV += record.ACV__c || 0;
    
    // Check if targeting this month
    if (record.Target_LOI_Date__c) {
      const targetDate = new Date(record.Target_LOI_Date__c);
      if (targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear) {
        summaryData[key].targetingThisMonth++;
      }
    }
  });

  // Sort by stage (S4 first) then by ACV
  const summaryRows = Object.values(summaryData).sort((a, b) => {
    const stageA = stageOrder[a.stage] || 6;
    const stageB = stageOrder[b.stage] || 6;
    if (stageA !== stageB) return stageA - stageB;
    return b.totalACV - a.totalACV;
  });

  summarySheet.columns = [
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Product Line', key: 'productLine', width: 30 },
    { header: 'Count', key: 'count', width: 12 },
    { header: 'Total ACV', key: 'totalACV', width: 18 },
    { header: 'Targeting This Month', key: 'targetingThisMonth', width: 22 }
  ];

  // Apply header styling
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.height = 24;
  summaryHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add summary data
  summaryRows.forEach(item => {
    const row = summarySheet.addRow({
      stage: item.stage,
      productLine: item.productLine,
      count: item.count,
      totalACV: item.totalACV,
      targetingThisMonth: item.targetingThisMonth
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format ACV column as currency
  summarySheet.getColumn('totalACV').numFmt = '$#,##0';

  // Add totals row
  const totalsRow = summarySheet.addRow({
    stage: 'TOTAL',
    productLine: '',
    count: summaryRows.reduce((sum, r) => sum + r.count, 0),
    totalACV: summaryRows.reduce((sum, r) => sum + r.totalACV, 0),
    targetingThisMonth: summaryRows.reduce((sum, r) => sum + r.targetingThisMonth, 0)
  });
  
  totalsRow.eachCell((cell) => {
    cell.font = { ...headerStyle.font, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate Buffer
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();

  return { 
    buffer, 
    recordCount: data.totalSize,
    stage4Count,
    stage3Count,
    stage2Count,
    stage1Count,
    stage0Count,
    totalACV,
    lateStageACV,
    thisMonthCount
  };
}

/**
 * Send pipeline report to Slack
 */
async function sendPipelineReportToSlack(client, channelId, userId) {
  try {
    logger.info('Generating pipeline report for Slack...');

    const result = await generatePipelineExcel();
    const { buffer, recordCount, stage4Count, stage3Count, stage2Count, stage1Count, stage0Count, totalACV, lateStageACV, thisMonthCount } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Eudia_Pipeline_Report_${date}.xlsx`;

    // Format currency
    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    };

    // Format message
    let message = `*Pipeline Report*\n\n`;
    message += `*Overview:* ${recordCount} opps • ${formatCurrency(totalACV)} total ACV\n`;
    message += `*Late Stage (S3+S4):* ${stage3Count + stage4Count} opps • ${formatCurrency(lateStageACV)}\n\n`;
    message += `*By Stage:*\n`;
    if (stage4Count > 0) message += `• Stage 4 - Proposal: ${stage4Count}\n`;
    if (stage3Count > 0) message += `• Stage 3 - Pilot: ${stage3Count}\n`;
    if (stage2Count > 0) message += `• Stage 2 - SQO: ${stage2Count}\n`;
    if (stage1Count > 0) message += `• Stage 1 - Discovery: ${stage1Count}\n`;
    if (stage0Count > 0) message += `• Stage 0 - Prospecting: ${stage0Count}\n`;
    message += `\nTargeting Signature this Month: ${thisMonthCount}\n\n`;
    message += `_Excel includes 2 tabs: Raw Pipeline + Late Stage Summary_`;

    // Upload to Slack
    const uploadResult = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Pipeline Report",
      initial_comment: message
    });

    logger.info('✅ Pipeline report uploaded to Slack');
    return uploadResult;

  } catch (error) {
    logger.error('Failed to send pipeline report to Slack:', error);
    throw error;
  }
}

/**
 * Generate Late-Stage Pipeline Excel Report (S3/S4 only)
 * Specifically for deal-focused stakeholders
 */
async function generateLateStageExcel() {
  // Query ONLY Stage 3 (Pilot) and Stage 4 (Proposal)
  const reportQuery = `SELECT Name,
                              Account.Name,
                              Product_Line__c,
                              StageName,
                              Target_LOI_Date__c,
                              ACV__c,
                              Weighted_ACV__c,
                              Owner.Name,
                              Pod__c,
                              CloseDate,
                              NextStep
                       FROM Opportunity
                       WHERE IsClosed = false
                         AND StageName IN (
                           'Stage 3 - Pilot',
                           'Stage 4 - Proposal'
                         )
                       ORDER BY StageName DESC, ACV__c DESC NULLS LAST`;

  // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
  const data = await query(reportQuery, true);

  if (!data || !data.records) {
    logger.info('No late-stage pipeline data found');
    return { buffer: null, recordCount: 0, totalACV: 0, stage4Count: 0, stage3Count: 0 };
  }

  const records = data.records;
  
  // Sort by stage priority (Stage 4 first) then by ACV
  const stageOrder = {
    'Stage 4 - Proposal': 1,
    'Stage 3 - Pilot': 2
  };

  records.sort((a, b) => {
    const stageA = stageOrder[a.StageName] || 3;
    const stageB = stageOrder[b.StageName] || 3;
    if (stageA !== stageB) return stageA - stageB;
    return (b.ACV__c || 0) - (a.ACV__c || 0);
  });

  // Calculate metrics
  const stage4Count = records.filter(r => r.StageName === 'Stage 4 - Proposal').length;
  const stage3Count = records.filter(r => r.StageName === 'Stage 3 - Pilot').length;
  const totalACV = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

  // Calculate "targeting signature this month"
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthCount = records.filter(r => {
    if (!r.Target_LOI_Date__c) return false;
    const targetDate = new Date(r.Target_LOI_Date__c);
    return targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear;
  }).length;

  // ═══════════════════════════════════════════════════════════════════════════
  // Create Excel Workbook
  // ═══════════════════════════════════════════════════════════════════════════
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Eudia GTM Brain';
  workbook.created = new Date();
  
  // Common styling
  const headerStyle = {
    font: { 
      name: 'Times New Roman', 
      size: 12, 
      bold: true, 
      color: { argb: 'FFFFFFFF' } 
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' }
    },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  const bodyStyle = {
    font: { name: 'Times New Roman', size: 12 },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: Late-Stage Deals (S3 + S4)
  // ═══════════════════════════════════════════════════════════════════════════
  const dealsSheet = workbook.addWorksheet('Late-Stage Deals');

  dealsSheet.columns = [
    { header: 'Account', key: 'account', width: 35 },
    { header: 'Opportunity Name', key: 'oppName', width: 45 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'Target Sign Date', key: 'targetDate', width: 18 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Pod', key: 'pod', width: 10 },
    { header: 'Next Step', key: 'nextStep', width: 35 }
  ];

  // Apply header styling
  const dealsHeader = dealsSheet.getRow(1);
  dealsHeader.height = 24;
  dealsHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add data rows
  records.forEach(record => {
    const row = dealsSheet.addRow({
      account: record.Account?.Name || '',
      oppName: record.Name || '',
      stage: record.StageName || '',
      productLine: record.Product_Line__c || '',
      targetDate: record.Target_LOI_Date__c || '',
      acv: record.ACV__c || 0,
      owner: record.Owner?.Name || '',
      pod: record.Pod__c || '',
      nextStep: record.NextStep || ''
    });
    
    // Apply body styling
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format ACV column as currency
  dealsSheet.getColumn('acv').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Summary by Product Line
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Summary by Product Line');

  // Build summary data
  const summaryData = {};
  records.forEach(record => {
    const productLine = record.Product_Line__c || 'Unassigned';
    
    if (!summaryData[productLine]) {
      summaryData[productLine] = {
        productLine,
        stage4Count: 0,
        stage3Count: 0,
        totalCount: 0,
        totalACV: 0,
        targetingThisMonth: 0
      };
    }
    
    summaryData[productLine].totalCount++;
    summaryData[productLine].totalACV += record.ACV__c || 0;
    
    if (record.StageName === 'Stage 4 - Proposal') {
      summaryData[productLine].stage4Count++;
    } else if (record.StageName === 'Stage 3 - Pilot') {
      summaryData[productLine].stage3Count++;
    }
    
    // Check if targeting this month
    if (record.Target_LOI_Date__c) {
      const targetDate = new Date(record.Target_LOI_Date__c);
      if (targetDate.getMonth() === currentMonth && targetDate.getFullYear() === currentYear) {
        summaryData[productLine].targetingThisMonth++;
      }
    }
  });

  // Sort by total ACV
  const summaryRows = Object.values(summaryData).sort((a, b) => b.totalACV - a.totalACV);

  summarySheet.columns = [
    { header: 'Product Line', key: 'productLine', width: 30 },
    { header: 'Stage 4 (Proposal)', key: 'stage4Count', width: 18 },
    { header: 'Stage 3 (Pilot)', key: 'stage3Count', width: 18 },
    { header: 'Total', key: 'totalCount', width: 12 },
    { header: 'Total ACV', key: 'totalACV', width: 18 },
    { header: 'Targeting This Month', key: 'targetingThisMonth', width: 22 }
  ];

  // Apply header styling
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.height = 24;
  summaryHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add summary data
  summaryRows.forEach(item => {
    const row = summarySheet.addRow({
      productLine: item.productLine,
      stage4Count: item.stage4Count,
      stage3Count: item.stage3Count,
      totalCount: item.totalCount,
      totalACV: item.totalACV,
      targetingThisMonth: item.targetingThisMonth
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format ACV column as currency
  summarySheet.getColumn('totalACV').numFmt = '$#,##0';

  // Add totals row
  const totalsRow = summarySheet.addRow({
    productLine: 'TOTAL',
    stage4Count: summaryRows.reduce((sum, r) => sum + r.stage4Count, 0),
    stage3Count: summaryRows.reduce((sum, r) => sum + r.stage3Count, 0),
    totalCount: summaryRows.reduce((sum, r) => sum + r.totalCount, 0),
    totalACV: summaryRows.reduce((sum, r) => sum + r.totalACV, 0),
    targetingThisMonth: summaryRows.reduce((sum, r) => sum + r.targetingThisMonth, 0)
  });
  
  totalsRow.eachCell((cell) => {
    cell.font = { ...headerStyle.font, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate Buffer
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`📊 Late-Stage Excel generated: ${records.length} opps, ${stage4Count} S4, ${stage3Count} S3`);

  return { 
    buffer, 
    recordCount: records.length,
    stage4Count,
    stage3Count,
    totalACV,
    thisMonthCount
  };
}

/**
 * Send late-stage pipeline report to Slack
 */
async function sendLateStageReportToSlack(client, channelId) {
  try {
    logger.info('Generating late-stage pipeline report for Slack...');

    const result = await generateLateStageExcel();
    
    if (!result.buffer || result.recordCount === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '📊 *Late-Stage Pipeline Report*\n\nNo Stage 3 or Stage 4 opportunities currently in pipeline.'
      });
      return;
    }
    
    const { buffer, recordCount, stage4Count, stage3Count, totalACV, thisMonthCount } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Eudia_LateStage_Pipeline_${date}.xlsx`;

    // Format currency
    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    };

    // Format message
    let message = `*Late-Stage Pipeline Report (S3 + S4)*\n\n`;
    message += `*Total:* ${recordCount} opportunities • ${formatCurrency(totalACV)} ACV\n\n`;
    message += `*Breakdown:*\n`;
    if (stage4Count > 0) message += `• Stage 4 - Proposal: ${stage4Count}\n`;
    if (stage3Count > 0) message += `• Stage 3 - Pilot: ${stage3Count}\n`;
    message += `\n*Targeting Signature This Month:* ${thisMonthCount}\n\n`;
    message += `_See attached Excel for full details by product line._`;

    // Upload to Slack
    const uploadResult = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Late-Stage Pipeline Report (S3+S4)",
      initial_comment: message
    });

    logger.info('✅ Late-stage pipeline report uploaded to Slack');
    return uploadResult;

  } catch (error) {
    logger.error('Failed to send late-stage pipeline report to Slack:', error);
    throw error;
  }
}

module.exports = {
  generatePipelineExcel,
  sendPipelineReportToSlack,
  generateLateStageExcel,
  sendLateStageReportToSlack
};
