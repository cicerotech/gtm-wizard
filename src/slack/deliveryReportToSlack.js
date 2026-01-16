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
 * Fallback: Query opportunities and deliveries separately
 */
async function getDeliveryDataSimple() {
  // Query closed won and proposal stage opportunities
  const oppsQuery = `
    SELECT 
      Id,
      Name,
      Account.Name,
      StageName,
      Product_Line__c,
      ACV__c,
      CloseDate,
      Owner.Name
    FROM Opportunity
    WHERE (StageName = 'Closed Won' OR StageName = 'Stage 4 - Proposal')
      AND CloseDate >= LAST_N_MONTHS:6
    ORDER BY CloseDate DESC, Account.Name
  `;

  const oppsData = await query(oppsQuery, true);
  
  // Query deliveries - using confirmed field names from Salesforce
  const deliveriesQuery = `
    SELECT 
      Id,
      Name,
      Opportunity__c,
      Opportunity__r.Name,
      Opportunity__r.Account.Name,
      Opportunity__r.StageName,
      Opportunity__r.CloseDate,
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
    WHERE Opportunity__r.StageName IN ('Closed Won', 'Stage 4 - Proposal')
      AND Opportunity__r.CloseDate >= LAST_N_MONTHS:6
    ORDER BY Opportunity__r.CloseDate DESC
  `;

  try {
    const deliveriesData = await query(deliveriesQuery, true);
    return { opps: oppsData, deliveries: deliveriesData };
  } catch (error) {
    logger.warn('Deliveries query failed, returning opps only:', error.message);
    return { opps: oppsData, deliveries: { records: [] } };
  }
}

/**
 * Generate Delivery Excel Report
 */
async function generateDeliveryExcel() {
  logger.info('📊 Generating Weekly Delivery Excel report...');
  
  const data = await getDeliveryDataSimple();
  const opps = data.opps?.records || [];
  const deliveries = data.deliveries?.records || [];

  // Build delivery lookup by opportunity ID
  const deliveryByOpp = {};
  deliveries.forEach(d => {
    const oppId = d.Opportunity__c;
    if (!deliveryByOpp[oppId]) deliveryByOpp[oppId] = [];
    deliveryByOpp[oppId].push(d);
  });

  // Separate won deals from proposal stage
  const wonDeals = opps.filter(o => o.StageName === 'Closed Won');
  const proposalDeals = opps.filter(o => o.StageName === 'Stage 4 - Proposal');

  // Calculate metrics
  const totalWonValue = wonDeals.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
  const totalProposalValue = proposalDeals.reduce((sum, o) => sum + (o.ACV__c || 0), 0);

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

  // Add data rows - combine opps with their deliveries
  opps.forEach(opp => {
    const oppDeliveries = deliveryByOpp[opp.Id] || [];
    
    if (oppDeliveries.length > 0) {
      // Add a row for each delivery
      oppDeliveries.forEach(del => {
        const row = summarySheet.addRow({
          status: opp.StageName === 'Closed Won' ? 'Won' : 'Proposal',
          deliveryOwner: del.Eudia_Delivery_Owner__r?.Name || opp.Owner?.Name || '',
          account: del.Account__r?.Name || opp.Account?.Name || '',
          productLine: del.Product_Line__c || opp.Product_Line__c || '',
          deliveryName: del.Name || '',
          contractValue: del.Contract_Value__c || opp.ACV__c || 0,
          closeDate: opp.CloseDate || '',
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
    } else {
      // Add opp without delivery details
      const row = summarySheet.addRow({
        status: opp.StageName === 'Closed Won' ? 'Won' : 'Proposal',
        deliveryOwner: opp.Owner?.Name || '',
        account: opp.Account?.Name || '',
        productLine: opp.Product_Line__c || '',
        deliveryName: '',
        contractValue: opp.ACV__c || 0,
        closeDate: opp.CloseDate || '',
        kickoffDate: '',
        deliveryStatus: '',
        deliveryModel: '',
        phase: ''
      });
      
      row.eachCell((cell) => {
        cell.font = bodyStyle.font;
        cell.alignment = bodyStyle.alignment;
        cell.border = bodyStyle.border;
      });
    }
  });

  // Format currency column
  summarySheet.getColumn('contractValue').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Won Deals
  // ═══════════════════════════════════════════════════════════════════════════
  const wonSheet = workbook.addWorksheet('Won Deals');

  wonSheet.columns = [
    { header: 'Account Name', key: 'account', width: 30 },
    { header: 'Opportunity Name', key: 'oppName', width: 40 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Owner', key: 'owner', width: 20 }
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

  // Add won deals
  wonDeals.forEach(opp => {
    const row = wonSheet.addRow({
      account: opp.Account?.Name || '',
      oppName: opp.Name || '',
      productLine: opp.Product_Line__c || '',
      acv: opp.ACV__c || 0,
      closeDate: opp.CloseDate || '',
      owner: opp.Owner?.Name || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  wonSheet.getColumn('acv').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 3: Proposal Stage
  // ═══════════════════════════════════════════════════════════════════════════
  const proposalSheet = workbook.addWorksheet('Proposal Stage');

  proposalSheet.columns = [
    { header: 'Account Name', key: 'account', width: 30 },
    { header: 'Opportunity Name', key: 'oppName', width: 40 },
    { header: 'Product Line', key: 'productLine', width: 28 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Owner', key: 'owner', width: 20 }
  ];

  // Apply header styling
  const proposalHeader = proposalSheet.getRow(1);
  proposalHeader.height = 24;
  proposalHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add proposal deals
  proposalDeals.forEach(opp => {
    const row = proposalSheet.addRow({
      account: opp.Account?.Name || '',
      oppName: opp.Name || '',
      productLine: opp.Product_Line__c || '',
      acv: opp.ACV__c || 0,
      closeDate: opp.CloseDate || '',
      owner: opp.Owner?.Name || ''
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  proposalSheet.getColumn('acv').numFmt = '$#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate Buffer
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`📊 Delivery Excel generated: ${opps.length} opportunities, ${deliveries.length} deliveries`);

  return { 
    buffer, 
    totalRecords: opps.length,
    wonCount: wonDeals.length,
    proposalCount: proposalDeals.length,
    totalWonValue,
    totalProposalValue,
    deliveryCount: deliveries.length
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
        text: '📊 *Weekly Delivery Report*\n\nNo closed won or proposal stage opportunities found in the last 6 months.'
      });
      return;
    }
    
    const { buffer, totalRecords, wonCount, proposalCount, totalWonValue, totalProposalValue } = result;
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `Weekly_Delivery_Report_${date}.xlsx`;

    // Format currency
    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    };

    // Format message with report link
    let message = `*Weekly Delivery Report*\n\n`;
    message += `*Total Records:* ${totalRecords}\n`;
    message += `• Won: ${wonCount} (${formatCurrency(totalWonValue)})\n`;
    message += `• Proposal: ${proposalCount} (${formatCurrency(totalProposalValue)})\n\n`;
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

