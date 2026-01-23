/**
 * Finance Weekly Audit Report Generator
 * 
 * Generates Excel report from Salesforce Finance Audit - Target Opps This Quarter
 * Report ID: 00OWj0000050WOSMA2
 * 
 * Includes: Opportunities with Target Sign Date this fiscal quarter
 * Groups by: Pod (US/EU) and Opportunity Owner
 * Metrics: ACV, BL Quarterly Forecast, Weighted ACV, Blended Forecast (base)
 */

const { query } = require('../salesforce/connection');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

// Salesforce Report URLs
const FINANCE_AUDIT_REPORT_URL = 'https://eudia.lightning.force.com/lightning/r/Report/00OWj0000050WOSMA2/view?queryScope=userFolders';
const CONTRACTS_REPORT_URL = 'https://eudia.lightning.force.com/lightning/r/Report/00OWj000004joxdMAA/view?queryScope=userFolders';

/**
 * Calculate fiscal quarter end date
 * Eudia fiscal year: Feb 1 - Jan 31
 * Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
 */
function getFiscalQuarterEndDate() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0 = Jan)
  const year = now.getFullYear();
  
  let quarterEnd;
  if (month >= 1 && month <= 3) {       // Feb-Apr = Q1 -> ends May 1
    quarterEnd = new Date(year, 4, 1);
  } else if (month >= 4 && month <= 6) { // May-Jul = Q2 -> ends Aug 1
    quarterEnd = new Date(year, 7, 1);
  } else if (month >= 7 && month <= 9) { // Aug-Oct = Q3 -> ends Nov 1
    quarterEnd = new Date(year, 10, 1);
  } else if (month >= 10) {              // Nov-Dec = Q4 -> ends Feb 1 next year
    quarterEnd = new Date(year + 1, 1, 1);
  } else {                               // Jan = Q4 -> ends Feb 1 this year
    quarterEnd = new Date(year, 1, 1);
  }
  
  return quarterEnd.toISOString().split('T')[0];
}

/**
 * Query finance audit data from Opportunities
 * EXACT MATCH to SF Report "Finance Audit - Target Opps this Quarter"
 * 
 * Filters (from SF report):
 * - Stage: Stage 0 - Prospecting, Stage 1 - Discovery, Stage 2 - SQO, Stage 3 - Pilot, Stage 4 - Proposal
 * - Target sign date: less than [fiscal quarter end]
 * 
 * Groups by: Pod and Opportunity Owner
 */
async function getFinanceAuditData() {
  const quarterEnd = getFiscalQuarterEndDate();
  
  // EXACT filter match to SF Report
  // Stage IN (0-4 open stages), Target_LOI_Date__c < quarter end
  const opportunitiesQuery = `
    SELECT 
      Id,
      Name,
      Account.Name,
      Owner.Name,
      Pod__c,
      StageName,
      ACV__c,
      BL_Quarterly_Forecast__c,
      Weighted_ACV__c,
      Blended_Forecast_base__c,
      Target_LOI_Date__c,
      Sales_Type__c,
      Product_Line__c
    FROM Opportunity
    WHERE StageName IN (
      'Stage 0 - Prospecting',
      'Stage 1 - Discovery',
      'Stage 2 - SQO',
      'Stage 3 - Pilot',
      'Stage 4 - Proposal'
    )
    AND Target_LOI_Date__c < ${quarterEnd}
    AND Owner.Name != 'Keigan Pesenti'
    ORDER BY Pod__c, Owner.Name, ACV__c DESC
  `;

  try {
    const result = await query(opportunitiesQuery, true);
    logger.info(`[FinanceAudit] Queried ${result?.records?.length || 0} opportunities (Stages 0-4, Target Sign Date < ${quarterEnd})`);
    
    // VALIDATION: Log totals for verification
    if (result?.records) {
      const totals = result.records.reduce((acc, opp) => ({
        acv: acc.acv + (opp.ACV__c || 0),
        blForecast: acc.blForecast + (opp.BL_Quarterly_Forecast__c || 0),
        weightedACV: acc.weightedACV + (opp.Weighted_ACV__c || 0),
        blendedForecast: acc.blendedForecast + (opp.Blended_Forecast_base__c || 0)
      }), { acv: 0, blForecast: 0, weightedACV: 0, blendedForecast: 0 });
      
      logger.info(`[FinanceAudit] VALIDATION - Raw totals from query:`);
      logger.info(`  ACV: $${totals.acv.toLocaleString()}`);
      logger.info(`  BL Forecast: $${totals.blForecast.toLocaleString()}`);
      logger.info(`  Weighted ACV: $${totals.weightedACV.toLocaleString()}`);
      logger.info(`  Blended Forecast: $${totals.blendedForecast.toLocaleString()}`);
    }
    
    return { opportunities: result };
  } catch (error) {
    logger.error('Finance audit query failed:', error.message);
    return { opportunities: { records: [] } };
  }
}

/**
 * Process opportunities into pod/owner breakdown
 */
function processFinanceData(opportunities) {
  const podData = {};
  const totals = {
    acv: 0,
    blForecast: 0,
    weightedACV: 0,
    blendedForecast: 0,
    recordCount: 0
  };

  opportunities.forEach(opp => {
    const pod = opp.Pod__c || 'Other';
    const owner = opp.Owner?.Name || 'Unassigned';
    
    // Initialize pod if needed
    if (!podData[pod]) {
      podData[pod] = {
        owners: {},
        totals: { acv: 0, blForecast: 0, weightedACV: 0, blendedForecast: 0, recordCount: 0 }
      };
    }
    
    // Initialize owner if needed
    if (!podData[pod].owners[owner]) {
      podData[pod].owners[owner] = {
        acv: 0,
        blForecast: 0,
        weightedACV: 0,
        blendedForecast: 0,
        recordCount: 0,
        opportunities: []
      };
    }
    
    // Add to owner totals
    const acv = opp.ACV__c || 0;
    const blForecast = opp.BL_Quarterly_Forecast__c || 0;
    const weightedACV = opp.Weighted_ACV__c || 0;
    const blendedForecast = opp.Blended_Forecast_base__c || 0;
    
    podData[pod].owners[owner].acv += acv;
    podData[pod].owners[owner].blForecast += blForecast;
    podData[pod].owners[owner].weightedACV += weightedACV;
    podData[pod].owners[owner].blendedForecast += blendedForecast;
    podData[pod].owners[owner].recordCount += 1;
    podData[pod].owners[owner].opportunities.push(opp);
    
    // Add to pod totals
    podData[pod].totals.acv += acv;
    podData[pod].totals.blForecast += blForecast;
    podData[pod].totals.weightedACV += weightedACV;
    podData[pod].totals.blendedForecast += blendedForecast;
    podData[pod].totals.recordCount += 1;
    
    // Add to grand totals
    totals.acv += acv;
    totals.blForecast += blForecast;
    totals.weightedACV += weightedACV;
    totals.blendedForecast += blendedForecast;
    totals.recordCount += 1;
  });
  
  return { podData, totals };
}

/**
 * Generate Finance Audit Excel Report
 */
async function generateFinanceAuditExcel() {
  logger.info('📊 Generating Finance Audit Excel report...');
  
  const { opportunities } = await getFinanceAuditData();
  
  if (!opportunities || !opportunities.records || opportunities.records.length === 0) {
    logger.warn('No finance audit records found');
    return { buffer: null, totalRecords: 0 };
  }
  
  const opps = opportunities.records;
  const { podData, totals } = processFinanceData(opps);
  
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
      fgColor: { argb: 'FF1B365D' } // Navy blue to match finance theme
    },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  const bodyStyle = {
    font: { name: 'Times New Roman', size: 11 },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
    }
  };
  
  const subtotalStyle = {
    font: { name: 'Times New Roman', size: 11, bold: true },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F4FD' } // Light blue for subtotals
    },
    alignment: { vertical: 'middle', horizontal: 'right' },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: Summary by Pod & Owner (matches SF report layout)
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.columns = [
    { header: 'Pod', key: 'pod', width: 12 },
    { header: 'Opportunity Owner', key: 'owner', width: 25 },
    { header: 'Sum of ACV', key: 'acv', width: 18 },
    { header: 'Sum of BL Quarterly Forecast', key: 'blForecast', width: 26 },
    { header: 'Sum of Weighted ACV', key: 'weightedACV', width: 20 },
    { header: 'Sum of Blended Forecast (base)', key: 'blendedForecast', width: 26 },
    { header: 'Record Count', key: 'recordCount', width: 14 }
  ];

  // Apply header styling
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.height = 28;
  summaryHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add data rows grouped by Pod
  const pods = Object.keys(podData).sort(); // Sort pods (EU, US, Other)
  
  pods.forEach(pod => {
    const podInfo = podData[pod];
    const owners = Object.keys(podInfo.owners).sort();
    
    owners.forEach((owner, idx) => {
      const ownerData = podInfo.owners[owner];
      const row = summarySheet.addRow({
        pod: idx === 0 ? pod : '', // Only show pod name on first row
        owner: owner,
        acv: ownerData.acv,
        blForecast: ownerData.blForecast,
        weightedACV: ownerData.weightedACV,
        blendedForecast: ownerData.blendedForecast,
        recordCount: ownerData.recordCount
      });
      
      row.eachCell((cell) => {
        cell.font = bodyStyle.font;
        cell.alignment = bodyStyle.alignment;
        cell.border = bodyStyle.border;
      });
    });
    
    // Add subtotal row for pod
    const subtotalRow = summarySheet.addRow({
      pod: '',
      owner: 'Subtotal',
      acv: podInfo.totals.acv,
      blForecast: podInfo.totals.blForecast,
      weightedACV: podInfo.totals.weightedACV,
      blendedForecast: podInfo.totals.blendedForecast,
      recordCount: podInfo.totals.recordCount
    });
    
    subtotalRow.eachCell((cell) => {
      cell.font = subtotalStyle.font;
      cell.fill = subtotalStyle.fill;
      cell.alignment = subtotalStyle.alignment;
      cell.border = subtotalStyle.border;
    });
  });
  
  // Add grand total row
  const totalRow = summarySheet.addRow({
    pod: 'Total',
    owner: '',
    acv: totals.acv,
    blForecast: totals.blForecast,
    weightedACV: totals.weightedACV,
    blendedForecast: totals.blendedForecast,
    recordCount: totals.recordCount
  });
  
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 12, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.border = headerStyle.border;
  });
  
  // Format currency columns
  ['acv', 'blForecast', 'weightedACV', 'blendedForecast'].forEach(col => {
    summarySheet.getColumn(col).numFmt = '$#,##0.00';
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Detailed Opportunities
  // ═══════════════════════════════════════════════════════════════════════════
  const detailSheet = workbook.addWorksheet('Details');

  detailSheet.columns = [
    { header: 'Pod', key: 'pod', width: 10 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Account', key: 'account', width: 30 },
    { header: 'Opportunity', key: 'opportunity', width: 35 },
    { header: 'Stage', key: 'stage', width: 18 },
    { header: 'Sales Type', key: 'salesType', width: 14 },
    { header: 'Product Line', key: 'productLine', width: 20 },
    { header: 'ACV', key: 'acv', width: 14 },
    { header: 'BL Forecast', key: 'blForecast', width: 14 },
    { header: 'Weighted ACV', key: 'weightedACV', width: 14 },
    { header: 'Blended (base)', key: 'blendedForecast', width: 14 },
    { header: 'Target Sign Date', key: 'targetSignDate', width: 14 }
  ];

  // Apply header styling
  const detailHeader = detailSheet.getRow(1);
  detailHeader.height = 24;
  detailHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add all opportunities
  opps.forEach(opp => {
    const row = detailSheet.addRow({
      pod: opp.Pod__c || '',
      owner: opp.Owner?.Name || '',
      account: opp.Account?.Name || '',
      opportunity: opp.Name || '',
      stage: opp.StageName || '',
      salesType: opp.Sales_Type__c || '',
      productLine: opp.Product_Line__c || '',
      acv: opp.ACV__c || 0,
      blForecast: opp.BL_Quarterly_Forecast__c || 0,
      weightedACV: opp.Weighted_ACV__c || 0,
      blendedForecast: opp.Blended_Forecast_base__c || 0,
      targetSignDate: opp.Target_LOI_Date__c || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format currency columns
  ['acv', 'blForecast', 'weightedACV', 'blendedForecast'].forEach(col => {
    detailSheet.getColumn(col).numFmt = '$#,##0.00';
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  return {
    buffer,
    totalRecords: totals.recordCount,
    totals,
    podData
  };
}

/**
 * Format currency for Slack message
 */
function formatCurrency(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

/**
 * Send Finance Audit report to Slack
 */
async function sendFinanceAuditToSlack(client, channelId, userId) {
  try {
    logger.info('Generating Finance Weekly Audit report for Slack...');

    const result = await generateFinanceAuditExcel();
    
    if (!result.buffer || result.totalRecords === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '*Finance Weekly Audit - Target Opps This Quarter*\n\nNo opportunities found with Target Sign Date this quarter.'
      });
      return;
    }
    
    const { buffer, totalRecords, totals, podData } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Finance_Weekly_Audit_${date}.xlsx`;

    // Format message matching the SF report style
    let message = `*Finance Weekly Audit - Target Opps This Quarter*\n\n`;
    
    // Summary totals line
    message += `*Total ACV:* ${formatCurrency(totals.acv)} | `;
    message += `*BL Forecast:* ${formatCurrency(totals.blForecast)} | `;
    message += `*Weighted ACV:* ${formatCurrency(totals.weightedACV)} | `;
    message += `*Blended:* ${formatCurrency(totals.blendedForecast)}\n\n`;
    
    // Pod breakdown
    const pods = Object.keys(podData).sort();
    pods.forEach(pod => {
      const p = podData[pod].totals;
      message += `• *${pod}:* ${formatCurrency(p.acv)} ACV, ${formatCurrency(p.blForecast)} BL Forecast, ${formatCurrency(p.weightedACV)} Weighted (${p.recordCount} opps)\n`;
    });
    
    message += `\n`;
    message += `View the <${FINANCE_AUDIT_REPORT_URL}|Finance Audit Report> in Salesforce\n`;
    message += `View the <${CONTRACTS_REPORT_URL}|Contracts Report> in Salesforce\n\n`;
    message += `_If you select 'Enable Field Editing' in the upper right, you can edit inputs within the report view._`;

    // Upload to Slack
    const uploadResult = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Finance Weekly Audit",
      initial_comment: message
    });

    logger.info('✅ Finance Weekly Audit report uploaded to Slack');
    return uploadResult;

  } catch (error) {
    logger.error('Failed to send Finance Weekly Audit report to Slack:', error);
    throw error;
  }
}

module.exports = {
  generateFinanceAuditExcel,
  sendFinanceAuditToSlack,
  FINANCE_AUDIT_REPORT_URL,
  CONTRACTS_REPORT_URL
};

