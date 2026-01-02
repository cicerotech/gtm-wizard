const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = path.join(__dirname, '../../data/delivery-snapshots.json');
const DELIVERY_CHANNEL = process.env.DELIVERY_OPS_CHANNEL || process.env.GTM_ACCOUNT_PLANNING_CHANNEL || '#delivery-ops';

// Delivery statuses
const DELIVERY_STATUSES = [
  'Planning',
  'In Progress',
  'At Risk',
  'On Hold',
  'Completed',
  'Cancelled'
];

// Delivery Owners - same team members as BL
const DELIVERY_OWNERS = [
  'Ananth Cherukupally',
  'Asad Hussain',
  'Conor Molloy',
  'Julie Stefanich',
  'Nathan Shine',
  'Olivia Jung',
  'Mike Masiello',
  'Justin Hills',
  'Tom Clancy',
  'Greg MacHale',
  'Alex Fox',
  'Nicola Fratini',
  'Emer Flynn'
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}m`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  } else {
    return `$${Math.round(amount)}`;
  }
}

function formatCurrencyFull(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

function readSnapshots() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const data = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Failed to read delivery snapshots file:', error);
  }
  return { snapshots: {} };
}

function writeSnapshots(data) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
    logger.info('Delivery snapshots saved to file');
  } catch (error) {
    logger.error('Failed to write delivery snapshots file:', error);
    throw error;
  }
}

function getLastSnapshotDate(snapshots) {
  const dates = Object.keys(snapshots.snapshots || {}).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function saveSnapshot(date, deliveryData) {
  const data = readSnapshots();
  data.snapshots[date] = deliveryData;
  
  // Keep only last 12 weeks of snapshots
  const dates = Object.keys(data.snapshots).sort();
  if (dates.length > 12) {
    const toRemove = dates.slice(0, dates.length - 12);
    toRemove.forEach(d => delete data.snapshots[d]);
  }
  
  writeSnapshots(data);
}

// ═══════════════════════════════════════════════════════════════════════════
// SALESFORCE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

async function queryDeliveryData() {
  try {
    logger.info('Querying delivery data from Salesforce...');
    
    const soql = `
      SELECT 
        Id, Name, 
        Account__c, Account__r.Name,
        Opportunity__c, Opportunity__r.Name, Opportunity__r.CloseDate,
        Contract_Value__c, 
        Status__c, 
        Product_Line__c,
        Kickoff_Date__c,
        Target_Go_Live_Date__c,
        Actual_Go_Live_Date__c,
        Planned_JH_Hours__c,
        Actual_JH_Hours__c,
        Delivery_Model__c,
        Eudia_Delivery_Owner__c, Eudia_Delivery_Owner__r.Name,
        Health_Score__c,
        Phase__c
      FROM Delivery__c
      WHERE Status__c != 'Cancelled'
      ORDER BY Eudia_Delivery_Owner__r.Name, Kickoff_Date__c ASC NULLS LAST
    `;
    
    const result = await query(soql, false);
    
    if (!result || !result.records) {
      logger.warn('No delivery records found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} delivery records`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query delivery data:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

function processDeliveryData(records) {
  // Initialize owner metrics
  const ownerMetrics = {};
  
  // Initialize status breakdown
  const statusBreakdown = {};
  DELIVERY_STATUSES.forEach(status => {
    statusBreakdown[status] = { count: 0, contractValue: 0, plannedHours: 0 };
  });
  
  // Initialize product line breakdown
  const productLineBreakdown = {};
  
  // Totals
  let totalContractValue = 0;
  let totalPlannedHours = 0;
  let totalActualHours = 0;
  
  // All deliveries for display
  const allDeliveries = [];
  
  records.forEach(record => {
    const ownerName = record.Eudia_Delivery_Owner__r?.Name || 'Unassigned';
    const status = record.Status__c || 'Planning';
    const productLine = record.Product_Line__c || 'Undetermined';
    const contractValue = record.Contract_Value__c || 0;
    const plannedHours = record.Planned_JH_Hours__c || 0;
    const actualHours = record.Actual_JH_Hours__c || 0;
    
    // Update totals
    totalContractValue += contractValue;
    totalPlannedHours += plannedHours;
    totalActualHours += actualHours;
    
    // Update owner metrics
    if (!ownerMetrics[ownerName]) {
      ownerMetrics[ownerName] = {
        deliveries: 0,
        contractValue: 0,
        plannedHours: 0,
        actualHours: 0,
        accounts: new Set(),
        byStatus: {}
      };
    }
    
    ownerMetrics[ownerName].deliveries++;
    ownerMetrics[ownerName].contractValue += contractValue;
    ownerMetrics[ownerName].plannedHours += plannedHours;
    ownerMetrics[ownerName].actualHours += actualHours;
    
    if (record.Account__c) {
      ownerMetrics[ownerName].accounts.add(record.Account__c);
    }
    
    if (!ownerMetrics[ownerName].byStatus[status]) {
      ownerMetrics[ownerName].byStatus[status] = 0;
    }
    ownerMetrics[ownerName].byStatus[status]++;
    
    // Update status breakdown
    if (statusBreakdown[status]) {
      statusBreakdown[status].count++;
      statusBreakdown[status].contractValue += contractValue;
      statusBreakdown[status].plannedHours += plannedHours;
    }
    
    // Update product line breakdown
    if (!productLineBreakdown[productLine]) {
      productLineBreakdown[productLine] = { count: 0, contractValue: 0 };
    }
    productLineBreakdown[productLine].count++;
    productLineBreakdown[productLine].contractValue += contractValue;
    
    // Add to all deliveries
    allDeliveries.push({
      id: record.Id,
      name: record.Name,
      accountName: record.Account__r?.Name || 'Unknown',
      opportunityName: record.Opportunity__r?.Name || '-',
      closeDate: record.Opportunity__r?.CloseDate,
      ownerName,
      ownerFirstName: ownerName.split(' ')[0],
      contractValue,
      status,
      productLine,
      kickoffDate: record.Kickoff_Date__c,
      targetGoLive: record.Target_Go_Live_Date__c,
      actualGoLive: record.Actual_Go_Live_Date__c,
      plannedHours,
      actualHours,
      deliveryModel: record.Delivery_Model__c || '-',
      healthScore: record.Health_Score__c || '-',
      phase: record.Phase__c || '-'
    });
  });
  
  // Convert Set to count for owner metrics
  const finalOwnerMetrics = {};
  Object.entries(ownerMetrics).forEach(([owner, metrics]) => {
    finalOwnerMetrics[owner] = {
      ...metrics,
      accounts: metrics.accounts.size
    };
  });
  
  // Sort deliveries by contract value desc
  allDeliveries.sort((a, b) => b.contractValue - a.contractValue);
  
  return {
    ownerMetrics: finalOwnerMetrics,
    statusBreakdown,
    productLineBreakdown,
    allDeliveries,
    totals: {
      totalRecords: records.length,
      totalContractValue,
      totalPlannedHours,
      totalActualHours,
      totalAccounts: new Set(records.map(r => r.Account__c).filter(Boolean)).size,
      utilizationPercent: totalPlannedHours > 0 ? (totalActualHours / totalPlannedHours * 100) : 0
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// PDF Design constants - matches GTM snapshot style
const GREEN_ACCENT = '#10b981';
const BLUE_ACCENT = '#3b82f6';
const DARK_TEXT = '#1a1a1a';
const MEDIUM_TEXT = '#333333';
const LIGHT_TEXT = '#999999';
const BORDER_GRAY = '#e5e5e5';
const GREEN_BG = '#f0fdf4';

function generateDeliveryPDF(deliveryData, dateStr) {
  return new Promise((resolve, reject) => {
    try {
      const { ownerMetrics, statusBreakdown, productLineBreakdown, allDeliveries, totals } = deliveryData;
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 30, bottom: 25, left: 40, right: 40 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Page dimensions
      const LEFT = 40;
      const PAGE_WIDTH = 532;
      const MID = LEFT + PAGE_WIDTH / 2;
      const halfWidth = PAGE_WIDTH / 2 - 10;
      const RIGHT_COL = MID + 10;
      const SECTION_GAP = 10;
      
      const fontRegular = 'Helvetica';
      const fontBold = 'Helvetica-Bold';
      
      let y = 30;
      
      // ═══════════════════════════════════════════════════════════════════════
      // HEADER
      // ═══════════════════════════════════════════════════════════════════════
      
      const logoPath = path.join(__dirname, '../../assets/eudia-logo.jpg');
      const logoWidth = 160;
      const pageCenter = LEFT + (PAGE_WIDTH / 2);
      const logoX = pageCenter - (logoWidth / 2);
      
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoX, y, { fit: [logoWidth, 50], align: 'center' });
          y += 38;
        } else {
          doc.font(fontBold).fontSize(24).fillColor(DARK_TEXT);
          doc.text('EUDIA', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
          y += 28;
        }
      } catch (logoErr) {
        doc.font(fontBold).fontSize(24).fillColor(DARK_TEXT);
        doc.text('EUDIA', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
        y += 28;
      }
      
      y += 6;
      
      // Title
      doc.font(fontBold).fontSize(16).fillColor(DARK_TEXT);
      doc.text('Delivery Weekly Snapshot', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
      y += 22;
      
      // Date
      doc.font(fontRegular).fontSize(12).fillColor(DARK_TEXT);
      doc.text(dateStr, LEFT, y, { width: PAGE_WIDTH, align: 'center' });
      y += 16;
      
      // Gradient line
      const gradientY = y;
      const grad = doc.linearGradient(LEFT, gradientY, LEFT + PAGE_WIDTH, gradientY);
      grad.stop(0, GREEN_ACCENT).stop(1, BLUE_ACCENT);
      doc.rect(LEFT, gradientY, PAGE_WIDTH, 2).fill(grad);
      y += 2 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP METRICS - 4 columns
      // ═══════════════════════════════════════════════════════════════════════
      const metricsY = y;
      const colWidth = PAGE_WIDTH / 4;
      
      // Column 1: Total Records
      let colX = LEFT;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('DELIVERY OVERVIEW', colX, metricsY);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Total Records', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(totals.totalRecords.toString(), colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(`${totals.totalAccounts} accounts`, colX, metricsY + 42);
      
      // Column 2: Contract Value
      colX = LEFT + colWidth;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Contract Value', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.totalContractValue), colX, metricsY + 22);
      
      // Column 3: Planned Hours
      colX = LEFT + colWidth * 2;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Planned JH Hours', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatNumber(totals.totalPlannedHours), colX, metricsY + 22);
      
      // Column 4: By Status summary
      colX = LEFT + colWidth * 3;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('BY STATUS', colX, metricsY);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      const planningCount = statusBreakdown['Planning']?.count || 0;
      const inProgressCount = statusBreakdown['In Progress']?.count || 0;
      const completedCount = statusBreakdown['Completed']?.count || 0;
      const atRiskCount = statusBreakdown['At Risk']?.count || 0;
      doc.text(`Planning: ${planningCount}`, colX, metricsY + 14);
      doc.text(`In Progress: ${inProgressCount}`, colX, metricsY + 24);
      doc.text(`Completed: ${completedCount}`, colX, metricsY + 34);
      if (atRiskCount > 0) {
        doc.fillColor('#dc2626');
        doc.text(`At Risk: ${atRiskCount}`, colX, metricsY + 44);
        doc.fillColor(DARK_TEXT);
      }
      
      y = metricsY + 58 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TWO COLUMN SECTION: Status Breakdown (left) + Product Line (right)
      // ═══════════════════════════════════════════════════════════════════════
      const twoColY = y;
      
      // LEFT: Status Breakdown Table
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('STATUS BREAKDOWN', LEFT, twoColY);
      
      let tableY = twoColY + 14;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Status', LEFT, tableY);
      doc.text('Count', LEFT + 100, tableY, { width: 40, align: 'right' });
      doc.text('Value', LEFT + 145, tableY, { width: 60, align: 'right' });
      
      tableY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, tableY).lineTo(LEFT + halfWidth, tableY).stroke();
      tableY += 5;
      
      doc.font(fontRegular).fontSize(10).fillColor(DARK_TEXT);
      DELIVERY_STATUSES.filter(s => s !== 'Cancelled').forEach(status => {
        const data = statusBreakdown[status] || { count: 0, contractValue: 0 };
        if (data.count > 0) {
          doc.text(status, LEFT, tableY);
          doc.text(data.count.toString(), LEFT + 100, tableY, { width: 40, align: 'right' });
          doc.text(formatCurrency(data.contractValue), LEFT + 145, tableY, { width: 60, align: 'right' });
          tableY += 11;
        }
      });
      
      // RIGHT: Product Line Breakdown
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY PRODUCT LINE', RIGHT_COL, twoColY);
      
      let rightTableY = twoColY + 14;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Product', RIGHT_COL, rightTableY);
      doc.text('Count', RIGHT_COL + 140, rightTableY, { width: 40, align: 'right' });
      doc.text('Value', RIGHT_COL + 185, rightTableY, { width: 60, align: 'right' });
      
      rightTableY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(RIGHT_COL, rightTableY).lineTo(RIGHT_COL + halfWidth, rightTableY).stroke();
      rightTableY += 5;
      
      // Sort by count
      const sortedProductLines = Object.entries(productLineBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 6);
      
      doc.font(fontRegular).fontSize(10).fillColor(DARK_TEXT);
      sortedProductLines.forEach(([productLine, data]) => {
        const shortName = productLine.length > 20 ? productLine.substring(0, 18) + '...' : productLine;
        doc.text(shortName, RIGHT_COL, rightTableY);
        doc.text(data.count.toString(), RIGHT_COL + 140, rightTableY, { width: 40, align: 'right' });
        doc.text(formatCurrency(data.contractValue), RIGHT_COL + 185, rightTableY, { width: 60, align: 'right' });
        rightTableY += 11;
      });
      
      y = Math.max(tableY, rightTableY) + SECTION_GAP + 10;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BY DELIVERY OWNER SECTION
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY DELIVERY OWNER', LEFT, y);
      y += 14;
      
      // Table header
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Owner', LEFT, y);
      doc.text('Deliveries', LEFT + 150, y, { width: 50, align: 'right' });
      doc.text('Accounts', LEFT + 205, y, { width: 50, align: 'right' });
      doc.text('Contract Value', LEFT + 260, y, { width: 80, align: 'right' });
      doc.text('Planned Hrs', LEFT + 345, y, { width: 60, align: 'right' });
      
      y += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
      y += 5;
      
      // Sort owners by contract value
      const sortedOwners = Object.entries(ownerMetrics)
        .filter(([_, m]) => m.deliveries > 0)
        .sort((a, b) => b[1].contractValue - a[1].contractValue);
      
      doc.font(fontRegular).fontSize(10).fillColor(DARK_TEXT);
      sortedOwners.forEach(([owner, metrics]) => {
        doc.text(owner, LEFT, y);
        doc.text(metrics.deliveries.toString(), LEFT + 150, y, { width: 50, align: 'right' });
        doc.text(metrics.accounts.toString(), LEFT + 205, y, { width: 50, align: 'right' });
        doc.text(formatCurrency(metrics.contractValue), LEFT + 260, y, { width: 80, align: 'right' });
        doc.text(formatNumber(metrics.plannedHours), LEFT + 345, y, { width: 60, align: 'right' });
        y += 11;
      });
      
      y += SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP DELIVERIES TABLE
      // ═══════════════════════════════════════════════════════════════════════
      if (y < 600) { // Only if there's space
        doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
        doc.text('TOP DELIVERIES BY VALUE', LEFT, y);
        y += 14;
        
        doc.font(fontBold).fontSize(8).fillColor(DARK_TEXT);
        doc.text('Delivery', LEFT, y);
        doc.text('Account', LEFT + 70, y);
        doc.text('Owner', LEFT + 200, y);
        doc.text('Status', LEFT + 300, y);
        doc.text('Value', LEFT + 380, y, { width: 70, align: 'right' });
        doc.text('Kickoff', LEFT + 455, y, { width: 60, align: 'right' });
        
        y += 10;
        doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
        y += 4;
        
        // Show top 8 deliveries
        const topDeliveries = allDeliveries.slice(0, 8);
        doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
        
        topDeliveries.forEach(del => {
          const shortAccount = del.accountName.length > 20 ? del.accountName.substring(0, 18) + '...' : del.accountName;
          doc.text(del.name, LEFT, y);
          doc.text(shortAccount, LEFT + 70, y);
          doc.text(del.ownerFirstName, LEFT + 200, y);
          doc.text(del.status, LEFT + 300, y);
          doc.text(formatCurrency(del.contractValue), LEFT + 380, y, { width: 70, align: 'right' });
          doc.text(formatDate(del.kickoffDate), LEFT + 455, y, { width: 60, align: 'right' });
          y += 10;
        });
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontRegular).fontSize(8).fillColor(LIGHT_TEXT);
      doc.text(
        'Generated by Eudia GTM Brain • www.eudia.com • Internal use only',
        LEFT,
        750,
        { width: PAGE_WIDTH, align: 'center' }
      );
      
      doc.end();
      
    } catch (error) {
      logger.error('PDF generation failed:', error);
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatOwnerLineForSlack(ownerName, metrics) {
  if (!metrics) return null;
  const firstName = ownerName.split(' ')[0];
  const deliveryWord = metrics.deliveries === 1 ? 'delivery' : 'deliveries';
  return `• ${firstName} — ${metrics.deliveries} ${deliveryWord}, ${formatCurrency(metrics.contractValue)}`;
}

function formatSlackMessage(deliveryData, dateStr) {
  const { ownerMetrics, statusBreakdown, totals } = deliveryData;
  
  let message = `*Eudia Delivery Weekly Snapshot — ${dateStr}*\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // DELIVERY OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════
  message += '*DELIVERY OVERVIEW*\n';
  message += `Total Records: ${totals.totalRecords}\n`;
  message += `Total Contract Value: ${formatCurrencyFull(totals.totalContractValue)}\n`;
  message += `Total Planned JH Hours: ${formatNumber(totals.totalPlannedHours)}\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY STATUS
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY STATUS*\n';
  DELIVERY_STATUSES.filter(s => s !== 'Cancelled').forEach(status => {
    const data = statusBreakdown[status] || { count: 0 };
    if (data.count > 0) {
      const deliveryWord = data.count === 1 ? 'delivery' : 'deliveries';
      message += `• ${status}: ${data.count} ${deliveryWord}\n`;
    }
  });
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY DELIVERY OWNER
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY DELIVERY OWNER*\n';
  
  const sortedOwners = Object.entries(ownerMetrics)
    .filter(([_, m]) => m.deliveries > 0)
    .sort((a, b) => b[1].contractValue - a[1].contractValue);
  
  sortedOwners.forEach(([owner, metrics]) => {
    const line = formatOwnerLineForSlack(owner, metrics);
    if (line) {
      message += line + '\n';
    }
  });
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // PDF REFERENCE
  // ═══════════════════════════════════════════════════════════════════════
  message += '_See attached PDF for full details._';
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sendDeliveryWeeklySummary(app, testMode = false, targetChannel = null) {
  try {
    logger.info('Generating weekly delivery summary with PDF...');
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Query delivery data from Salesforce
    const records = await queryDeliveryData();
    
    // Process into metrics
    const deliveryData = processDeliveryData(records);
    
    // Get previous week's snapshot for comparison
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`Previous delivery snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the Slack message
    const message = formatSlackMessage(deliveryData, displayDate);
    
    // Generate PDF
    logger.info('Generating Delivery PDF snapshot...');
    const pdfBuffer = await generateDeliveryPDF(deliveryData, displayDate);
    const pdfFilename = `Eudia_Delivery_Weekly_Snapshot_${dateStr}.pdf`;
    
    // Save current snapshot
    saveSnapshot(dateStr, {
      totals: deliveryData.totals,
      ownerMetrics: deliveryData.ownerMetrics,
      statusBreakdown: deliveryData.statusBreakdown
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CHANNEL SELECTION
    // ═══════════════════════════════════════════════════════════════════════════
    logger.info(`📦 Channel selection: targetChannel=${targetChannel}, testMode=${testMode}`);
    
    let channel;
    if (targetChannel) {
      channel = targetChannel;
      logger.info(`📦 Using targetChannel: ${channel}`);
    } else if (testMode) {
      channel = process.env.TEST_CHANNEL || 'U094AQE9V7D';
      logger.info(`📦 Test mode - using: ${channel}`);
    } else {
      channel = DELIVERY_CHANNEL;
      logger.info(`📦 Production mode - using DELIVERY_CHANNEL: ${channel}`);
    }
    
    // For DMs (user IDs start with 'U'), we need to open a conversation first
    if (channel.startsWith('U')) {
      logger.info(`📦 Channel ${channel} is a user ID - opening DM conversation`);
      const conversation = await app.client.conversations.open({
        users: channel
      });
      channel = conversation.channel.id;
      logger.info(`📦 DM conversation opened: ${channel}`);
    } else {
      logger.info(`📦 Channel ${channel} is a channel ID - posting directly`);
    }
    
    // Upload PDF and send message together
    logger.info(`📦 Uploading Delivery PDF to channel: ${channel}`);
    await app.client.files.uploadV2({
      channel_id: channel,
      file: pdfBuffer,
      filename: pdfFilename,
      title: `Eudia Delivery Weekly Snapshot — ${displayDate}`,
      initial_comment: message
    });
    
    logger.info(`✅ Weekly Delivery summary with PDF sent to ${channel}`);
    
    return {
      success: true,
      channel,
      dateStr,
      deliveryCount: deliveryData.totals.totalRecords,
      totals: deliveryData.totals,
      message,
      pdfFilename
    };
    
  } catch (error) {
    logger.error('Failed to send weekly delivery summary:', error);
    throw error;
  }
}

function scheduleDeliveryWeeklySummary(app) {
  // Schedule for Friday 9 AM EST (different from GTM Thursday)
  cron.schedule('0 9 * * 5', async () => {
    logger.info('Running scheduled Delivery weekly summary (Friday 9 AM EST)');
    
    try {
      await sendDeliveryWeeklySummary(app, false);
      logger.info('Scheduled Delivery weekly summary completed');
    } catch (error) {
      logger.error('Scheduled Delivery weekly summary failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('Delivery Weekly Summary scheduled (Friday 9 AM EST)');
}

async function sendDeliverySummaryNow(app, testMode = true, targetChannel = null) {
  logger.info(`📦 sendDeliverySummaryNow called with: testMode=${testMode}, targetChannel=${targetChannel || 'NOT PROVIDED'}`);
  
  if (targetChannel) {
    logger.info(`📦 Target channel explicitly set: ${targetChannel} - PDF will be sent here`);
  } else {
    logger.info(`📦 No target channel provided - will use default (testMode=${testMode})`);
  }
  
  return await sendDeliveryWeeklySummary(app, testMode, targetChannel);
}

function getDeliverySnapshotData() {
  return readSnapshots();
}

module.exports = {
  scheduleDeliveryWeeklySummary,
  sendDeliverySummaryNow,
  sendDeliveryWeeklySummary,
  getDeliverySnapshotData,
  formatSlackMessage,
  queryDeliveryData,
  processDeliveryData,
  DELIVERY_STATUSES,
  DELIVERY_OWNERS
};

