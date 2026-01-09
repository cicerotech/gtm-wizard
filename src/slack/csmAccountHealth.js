/**
 * CSM Account Health Report
 * 
 * Generates an Excel report for Customer Success Managers containing:
 * - All accounts with active deliveries (derived from delivery data)
 * - Account Name, Account Health, Account Health Details
 * - Delivery items breakdown
 * 
 * This report is generated FROM delivery data - no separate SF query needed
 * CSMs use this to populate and update account health in Salesforce
 * 
 * Styling: Times New Roman 12pt, black header with white text
 */

const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

/**
 * Generate CSM Account Health Excel from delivery data
 * @param {Array} allDeliveries - Array of delivery records from processDeliveryData()
 * @returns {Object} { buffer, recordCount, accountCount }
 */
async function generateCSMExcelFromDeliveries(allDeliveries) {
  if (!allDeliveries || allDeliveries.length === 0) {
    logger.info('📋 No deliveries provided for CSM report');
    return { buffer: null, recordCount: 0, accountCount: 0 };
  }

  // Group deliveries by account
  const accountMap = new Map();
  allDeliveries.forEach(delivery => {
    const accountName = delivery.accountName || 'Unknown';
    
    if (!accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        accountId: delivery.accountId,
        deliveries: [],
        totalContractValue: 0
      });
    }
    
    const account = accountMap.get(accountName);
    account.deliveries.push(delivery);
    account.totalContractValue += delivery.contractValue || 0;
  });

  const accounts = Array.from(accountMap.values());
  accounts.sort((a, b) => a.name.localeCompare(b.name));

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
  // TAB 1: CSM Account Overview (for CSMs to update health)
  // ═══════════════════════════════════════════════════════════════════════════
  const csmSheet = workbook.addWorksheet('CSM Account Health');

  csmSheet.columns = [
    { header: 'Account Name', key: 'name', width: 35 },
    { header: 'Account Health', key: 'health', width: 18 },
    { header: 'Account Health Details', key: 'healthDetails', width: 50 },
    { header: 'Active Deliveries', key: 'deliveryCount', width: 18 },
    { header: 'Total Contract Value', key: 'totalContractValue', width: 20 },
    { header: 'Delivery Owner(s)', key: 'owners', width: 25 }
  ];

  // Apply header styling
  const csmHeader = csmSheet.getRow(1);
  csmHeader.height = 24;
  csmHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add data rows
  accounts.forEach(account => {
    // Get unique owners for this account
    const owners = [...new Set(account.deliveries.map(d => d.ownerName))].join(', ');
    
    const row = csmSheet.addRow({
      name: account.name,
      health: '', // Empty for CSM to fill in
      healthDetails: '', // Empty for CSM to fill in
      deliveryCount: account.deliveries.length,
      totalContractValue: account.totalContractValue,
      owners: owners
    });
    
    // Apply body styling
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format currency column
  csmSheet.getColumn('totalContractValue').numFmt = '$#,##0.00';

  // Set row heights for readability
  csmSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 25;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: Delivery Details (all delivery items)
  // ═══════════════════════════════════════════════════════════════════════════
  const deliverySheet = workbook.addWorksheet('Delivery Details');

  deliverySheet.columns = [
    { header: 'Account Name', key: 'accountName', width: 30 },
    { header: 'Delivery Name', key: 'name', width: 35 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Product Line', key: 'productLine', width: 22 },
    { header: 'Delivery Owner', key: 'ownerName', width: 20 },
    { header: 'Contract Value', key: 'contractValue', width: 18 },
    { header: 'Kickoff Date', key: 'kickoffDate', width: 14 },
    { header: 'Planned Hours', key: 'plannedHours', width: 14 }
  ];

  // Apply header styling
  const deliveryHeader = deliverySheet.getRow(1);
  deliveryHeader.height = 24;
  deliveryHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = headerStyle.border;
  });

  // Add all delivery records
  allDeliveries.forEach(delivery => {
    const row = deliverySheet.addRow({
      accountName: delivery.accountName,
      name: delivery.name,
      status: delivery.status,
      productLine: delivery.productLine,
      ownerName: delivery.ownerName,
      contractValue: delivery.contractValue || 0,
      kickoffDate: delivery.kickoffDate || '-',
      plannedHours: delivery.plannedHours || 0
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format currency column
  deliverySheet.getColumn('contractValue').numFmt = '$#,##0.00';

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 3: Summary by Status
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Status Summary');

  // Calculate status breakdown
  const statusBreakdown = {};
  allDeliveries.forEach(delivery => {
    const status = delivery.status || 'Unknown';
    if (!statusBreakdown[status]) {
      statusBreakdown[status] = { count: 0, contractValue: 0, accounts: new Set() };
    }
    statusBreakdown[status].count++;
    statusBreakdown[status].contractValue += delivery.contractValue || 0;
    statusBreakdown[status].accounts.add(delivery.accountName);
  });

  summarySheet.columns = [
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Deliveries', key: 'count', width: 12 },
    { header: 'Accounts', key: 'accountCount', width: 12 },
    { header: 'Total Contract Value', key: 'contractValue', width: 22 }
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
  const sortedStatuses = Object.entries(statusBreakdown)
    .sort((a, b) => b[1].count - a[1].count);

  sortedStatuses.forEach(([status, data]) => {
    const row = summarySheet.addRow({
      status: status,
      count: data.count,
      accountCount: data.accounts.size,
      contractValue: data.contractValue
    });
    
    row.eachCell((cell) => {
      cell.font = bodyStyle.font;
      cell.alignment = bodyStyle.alignment;
      cell.border = bodyStyle.border;
    });
  });

  // Format currency column
  summarySheet.getColumn('contractValue').numFmt = '$#,##0.00';

  // Add totals row
  const totalContractValue = sortedStatuses.reduce((sum, [_, data]) => sum + data.contractValue, 0);
  const totalsRow = summarySheet.addRow({
    status: 'TOTAL',
    count: allDeliveries.length,
    accountCount: accounts.length,
    contractValue: totalContractValue
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
  logger.info(`📋 CSM Account Health Excel generated: ${accounts.length} accounts, ${allDeliveries.length} deliveries`);

  return { 
    buffer, 
    recordCount: allDeliveries.length,
    accountCount: accounts.length
  };
}

module.exports = {
  generateCSMExcelFromDeliveries
};
