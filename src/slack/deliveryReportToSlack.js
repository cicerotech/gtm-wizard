/**
 * Weekly Delivery Report Generator
 * 
 * Generates Excel report from Salesforce Delivery Weekly report
 * Report ID: 00OWj000004joxdMAA
 * 
 * Includes: Closed won deals & opportunities in proposal stage
 */

const { query } = require('../salesforce/connection');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

// Salesforce Report URL for reference
const DELIVERY_REPORT_URL = 'https://eudia.lightning.force.com/lightning/r/Report/00OWj000004joxdMAA/view?queryScope=userFolders';

/**
 * Query delivery data from Opportunities with Delivery records
 * Note: This function attempts a nested query, but falls back to separate queries if it fails
 */
async function getDeliveryData() {
  // For now, use the simple approach (separate queries) as it's more reliable
  // Nested SOQL queries from Opportunity to Delivery__c may require specific relationship name
  return await getDeliveryDataSimple();
}

/**
 * Query from Delivery__c object directly (matches the Salesforce Report structure)
 * Report ID: 00OWj000004joxdMAA
 * 
 * The report groups by Deal Status (Won vs Active/Proposal)
 * Won = Opportunities where IsClosed=true AND IsWon=true
 * Active = Opportunities in Stage 4 - Proposal
 */
async function getDeliveryDataSimple() {
  // Query Deliveries with their related Opportunity data
  // This matches the "Delivery Weekly" report structure exactly
  const deliveriesQuery = `
    SELECT 
      Id,
      Name,
      Opportunity__c,
      Opportunity__r.Id,
      Opportunity__r.Name,
      Opportunity__r.Account.Name,
      Opportunity__r.StageName,
      Opportunity__r.IsClosed,
      Opportunity__r.IsWon,
      Opportunity__r.CloseDate,
      Opportunity__r.ACV__c,
      Opportunity__r.Owner.Name,
      Account__c,
      Account__r.Name,
      Product_Line__c,
      Contract_Value__c,
      Kickoff_Date__c,
      Status__c,
      Delivery_Model__c,
      Phase__c,
      Eudia_Delivery_Owner__c,
      Eudia_Delivery_Owner__r.Name
    FROM Delivery__c
    ORDER BY Opportunity__r.CloseDate DESC, Account__r.Name
  `;

  try {
    const deliveriesData = await query(deliveriesQuery, true);
    logger.info(`📊 Queried ${deliveriesData?.records?.length || 0} delivery records`);
    return { deliveries: deliveriesData };
  } catch (error) {
    logger.error('Deliveries query failed:', error.message);
    return { deliveries: { records: [] } };
  }
}

/**
 * Generate Delivery Excel Report
 * 
 * Categories based on Opportunity status:
 * - Won: IsClosed=true AND IsWon=true (Stage 6. Closed(Won))
 * - Active (Proposal): Stage 4 - Proposal or any other open stage
 */
async function generateDeliveryExcel() {
  logger.info('📊 Generating Weekly Delivery Excel report...');
  
  const data = await getDeliveryDataSimple();
  const deliveries = data.deliveries?.records || [];

  // Categorize deliveries by their opportunity status
  // Won = IsClosed=true AND IsWon=true
  // Active = Everything else (primarily Stage 4 - Proposal)
  const wonDeliveries = deliveries.filter(d => 
    d.Opportunity__r?.IsClosed === true && d.Opportunity__r?.IsWon === true
  );
  const activeDeliveries = deliveries.filter(d => 
    !(d.Opportunity__r?.IsClosed === true && d.Opportunity__r?.IsWon === true)
  );

  // Calculate metrics using Contract_Value__c from Delivery records
  const totalWonValue = wonDeliveries.reduce((sum, d) => sum + (d.Contract_Value__c || 0), 0);
  const totalActiveValue = activeDeliveries.reduce((sum, d) => sum + (d.Contract_Value__c || 0), 0);
  
  logger.info(`📊 Delivery breakdown: Won=${wonDeliveries.length} ($${(totalWonValue/1000000).toFixed(1)}M), Active=${activeDeliveries.length} ($${(totalActiveValue/1000000).toFixed(1)}M)`);

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
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
    border: {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: Delivery Summary (All records with delivery details)
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Delivery Summary');

  summarySheet.columns = [
    { header: 'Deal Status', key: 'status', width: 18 },
    { header: 'Delivery Owner', key: 'deliveryOwner', width: 20 },
    { header: 'Account Name', key: 'account', width: 30 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'Delivery Name', key: 'deliveryName', width: 25 },
    { header: 'Contract Value', key: 'contractValue', width: 16 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Kickoff Date', key: 'kickoffDate', width: 14 },
    { header: 'Delivery Status', key: 'deliveryStatus', width: 16 },
    { header: 'Delivery Model', key: 'deliveryModel', width: 18 },
    { header: 'Phase', key: 'phase', width: 14 }
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

  // Add all delivery rows
  deliveries.forEach(del => {
    const isWon = del.Opportunity__r?.IsClosed === true && del.Opportunity__r?.IsWon === true;
    const row = summarySheet.addRow({
      status: isWon ? 'Won' : 'Active',
      deliveryOwner: del.Eudia_Delivery_Owner__r?.Name || del.Opportunity__r?.Owner?.Name || '',
      account: del.Account__r?.Name || del.Opportunity__r?.Account?.Name || '',
      productLine: del.Product_Line__c || '',
      deliveryName: del.Name || '',
      contractValue: del.Contract_Value__c || 0,
      closeDate: del.Opportunity__r?.CloseDate || '',
      kickoffDate: del.Kickoff_Date__c || '',
      deliveryStatus: del.Status__c || '',
      deliveryModel: del.Delivery_Model__c || '',
      phase: del.Phase__c || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format currency column
  summarySheet.getColumn('contractValue').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Won Deliveries
  // ═══════════════════════════════════════════════════════════════════════════
  const wonSheet = workbook.addWorksheet('Won');

  wonSheet.columns = [
    { header: 'Delivery Owner', key: 'deliveryOwner', width: 20 },
    { header: 'Account Name', key: 'account', width: 30 },
    { header: 'Delivery Name', key: 'deliveryName', width: 35 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'Contract Value', key: 'contractValue', width: 16 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Kickoff Date', key: 'kickoffDate', width: 14 },
    { header: 'Status', key: 'status', width: 14 }
  ];

  // Apply header styling
  const wonHeader = wonSheet.getRow(1);
  wonHeader.height = 24;
  wonHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add won deliveries
  wonDeliveries.forEach(del => {
    const row = wonSheet.addRow({
      deliveryOwner: del.Eudia_Delivery_Owner__r?.Name || '',
      account: del.Account__r?.Name || del.Opportunity__r?.Account?.Name || '',
      deliveryName: del.Name || '',
      productLine: del.Product_Line__c || '',
      contractValue: del.Contract_Value__c || 0,
      closeDate: del.Opportunity__r?.CloseDate || '',
      kickoffDate: del.Kickoff_Date__c || '',
      status: del.Status__c || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  wonSheet.getColumn('contractValue').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 3: Active (Proposal) Deliveries
  // ═══════════════════════════════════════════════════════════════════════════
  const activeSheet = workbook.addWorksheet('Active');

  activeSheet.columns = [
    { header: 'Delivery Owner', key: 'deliveryOwner', width: 20 },
    { header: 'Account Name', key: 'account', width: 30 },
    { header: 'Delivery Name', key: 'deliveryName', width: 35 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'Contract Value', key: 'contractValue', width: 16 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Kickoff Date', key: 'kickoffDate', width: 14 },
    { header: 'Status', key: 'status', width: 14 }
  ];

  // Apply header styling
  const activeHeader = activeSheet.getRow(1);
  activeHeader.height = 24;
  activeHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add active deliveries
  activeDeliveries.forEach(del => {
    const row = activeSheet.addRow({
      deliveryOwner: del.Eudia_Delivery_Owner__r?.Name || '',
      account: del.Account__r?.Name || del.Opportunity__r?.Account?.Name || '',
      deliveryName: del.Name || '',
      productLine: del.Product_Line__c || '',
      contractValue: del.Contract_Value__c || 0,
      closeDate: del.Opportunity__r?.CloseDate || '',
      kickoffDate: del.Kickoff_Date__c || '',
      status: del.Status__c || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  activeSheet.getColumn('contractValue').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate Buffer
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`📊 Delivery Excel generated: ${deliveries.length} total deliveries (Won: ${wonDeliveries.length}, Active: ${activeDeliveries.length})`);

  return { 
    buffer, 
    totalRecords: deliveries.length,
    wonCount: wonDeliveries.length,
    activeCount: activeDeliveries.length,
    totalWonValue,
    totalActiveValue
  };
}

/**
 * Send Weekly Delivery report to Slack
 */
async function sendDeliveryReportToSlack(client, channelId, userId) {
  try {
    logger.info('Generating Weekly Delivery report for Slack...');

    const result = await generateDeliveryExcel();
    
    if (!result.buffer || result.totalRecords === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '📊 *Weekly Delivery Report*\n\nNo delivery records found.'
      });
      return;
    }
    
    const { buffer, totalRecords, wonCount, activeCount, totalWonValue, totalActiveValue } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Weekly_Delivery_Report_${date}.xlsx`;

    // Format currency
    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    };

    // Format message with Salesforce report hyperlink
    let message = `*Weekly Delivery Report*\n\n`;
    message += `*Total Records:* ${totalRecords}\n`;
    message += `• Won: ${wonCount} (${formatCurrency(totalWonValue)})\n`;
    message += `• Active: ${activeCount} (${formatCurrency(totalActiveValue)})\n\n`;
    message += `See attached the Weekly Delivery Excel report. This includes closed won deals & opportunities in the proposal stage.\n\n`;
    message += `For updates or adjustments, view the <${DELIVERY_REPORT_URL}|Delivery Report> in Salesforce. If you select 'Enable Field Editing' in the upper right, you can edit the inputs within the report view.`;

    // Upload to Slack
    const uploadResult = await client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: filename,
      title: "Weekly Delivery Report",
      initial_comment: message
    });

    logger.info('✅ Weekly Delivery report uploaded to Slack');
    return uploadResult;

  } catch (error) {
    logger.error('Failed to send Weekly Delivery report to Slack:', error);
    throw error;
  }
}

module.exports = {
  generateDeliveryExcel,
  sendDeliveryReportToSlack,
  DELIVERY_REPORT_URL
};

