const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = path.join(__dirname, '../../data/delivery-snapshots.json');
const DELIVERY_CHANNEL = process.env.DELIVERY_OPS_CHANNEL || process.env.GTM_ACCOUNT_PLANNING_CHANNEL || '#delivery-ops';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}m`;
  } else if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}k`;
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
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(num);
}

function formatPercent(num) {
  if (num === null || num === undefined) return '-';
  return `${Math.round(num * 100) / 100}%`;
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
    logger.info('📦 Querying delivery data from Salesforce...');
    
    // Query fields from the Delivery__c object
    // Include Opportunity stage to determine Deal Status (Won vs Active)
    const soql = `
      SELECT 
        Id, 
        Name,
        Account__c, 
        Account__r.Name,
        Opportunity__c, 
        Opportunity__r.Name,
        Opportunity__r.CloseDate,
        Opportunity__r.StageName,
        Contract_Value__c,
        Status__c,
        Product_Line__c,
        Deployment_Model__c,
        Contract_Volume__c,
        Project_Size__c,
        Kickoff_Date__c,
        Planned_JH_Hours__c,
        Eudia_Delivery_Owner__c,
        Eudia_Delivery_Owner__r.Name
      FROM Delivery__c
      ORDER BY Status__c, Eudia_Delivery_Owner__r.Name, Kickoff_Date__c ASC NULLS LAST
    `;
    
    logger.info('📦 Executing SOQL query...');
    // Enable caching (true) so we can fall back to cached data if SF is temporarily unavailable
    // Cache TTL is 5 minutes by default - delivery data doesn't change frequently
    const result = await query(soql, true);
    
    if (!result || !result.records) {
      logger.warn('📦 No delivery records found');
      return [];
    }
    
    logger.info(`📦 Found ${result.totalSize} delivery records`);
    
    // Log sample record for debugging
    if (result.records.length > 0) {
      const sample = result.records[0];
      logger.info(`📦 Sample record: ${sample.Name}, Status: ${sample.Status__c}, Owner: ${sample.Eudia_Delivery_Owner__r?.Name || 'None'}`);
    }
    
    return result.records;
    
  } catch (error) {
    logger.error('📦 Failed to query delivery data:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA PROCESSING - Dynamic based on actual Salesforce data
// ═══════════════════════════════════════════════════════════════════════════

function processDeliveryData(records) {
  logger.info(`📦 Processing ${records.length} delivery records...`);
  
  // Dynamic tracking - let the data define the categories
  const byStatus = {};
  const byOwner = {};
  const byProductLine = {};
  const byProjectSize = {};
  const byDeploymentModel = {};
  const byDealStatus = {};  // Won vs Active based on Opportunity stage
  
  // Totals
  let totalContractValue = 0;
  let totalPlannedHours = 0;
  let activeCount = 0;
  let completedCount = 0;
  const uniqueAccounts = new Set();
  
  // All deliveries for detailed display
  const allDeliveries = [];
  
  records.forEach(record => {
    // Extract fields with null safety - ONLY fields we're querying
    const status = record.Status__c || 'Unknown';
    const productLine = record.Product_Line__c || 'Undetermined';
    const ownerName = record.Eudia_Delivery_Owner__r?.Name || 'Unassigned';
    const deploymentModel = record.Deployment_Model__c || 'Unknown';
    const projectSize = record.Project_Size__c || 'Unknown';
    const contractVolume = record.Contract_Volume__c || '-';
    
    const contractValue = record.Contract_Value__c || 0;
    const plannedHours = record.Planned_JH_Hours__c || 0;
    
    // Update totals
    totalContractValue += contractValue;
    totalPlannedHours += plannedHours;
    
    // Track unique accounts
    if (record.Account__c) {
      uniqueAccounts.add(record.Account__c);
    }
    
    // Track active vs completed
    const statusLower = status.toLowerCase();
    if (statusLower.includes('completed') || statusLower.includes('closed') || statusLower.includes('live')) {
      completedCount++;
    } else if (!statusLower.includes('cancelled') && !statusLower.includes('on hold')) {
      activeCount++;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // DEAL STATUS - Won vs Active based on Opportunity stage
    // Won = Closed stages, Active = Open/Late stages
    // ═══════════════════════════════════════════════════════════════════════
    const oppStage = record.Opportunity__r?.StageName || '';
    const dealStatus = oppStage.toLowerCase().includes('closed') || oppStage.includes('Won') ? 'Won' : 'Active';
    
    if (!byDealStatus[dealStatus]) {
      byDealStatus[dealStatus] = {
        count: 0,
        contractValue: 0,
        accounts: new Set(),
        owners: {}
      };
    }
    byDealStatus[dealStatus].count++;
    byDealStatus[dealStatus].contractValue += contractValue;
    if (record.Account__c) byDealStatus[dealStatus].accounts.add(record.Account__c);
    
    // Track owners within deal status
    if (!byDealStatus[dealStatus].owners[ownerName]) {
      byDealStatus[dealStatus].owners[ownerName] = { count: 0, contractValue: 0 };
    }
    byDealStatus[dealStatus].owners[ownerName].count++;
    byDealStatus[dealStatus].owners[ownerName].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY STATUS (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byStatus[status]) {
      byStatus[status] = {
        count: 0,
        contractValue: 0,
        plannedHours: 0,
        accounts: new Set()
      };
    }
    byStatus[status].count++;
    byStatus[status].contractValue += contractValue;
    byStatus[status].plannedHours += plannedHours;
    if (record.Account__c) byStatus[status].accounts.add(record.Account__c);
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY OWNER (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byOwner[ownerName]) {
      byOwner[ownerName] = {
        deliveries: 0,
        contractValue: 0,
        plannedHours: 0,
        accounts: new Set(),
        byStatus: {}
      };
    }
    byOwner[ownerName].deliveries++;
    byOwner[ownerName].contractValue += contractValue;
    byOwner[ownerName].plannedHours += plannedHours;
    if (record.Account__c) byOwner[ownerName].accounts.add(record.Account__c);
    
    // Track status within owner
    if (!byOwner[ownerName].byStatus[status]) {
      byOwner[ownerName].byStatus[status] = 0;
    }
    byOwner[ownerName].byStatus[status]++;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY PRODUCT LINE (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byProductLine[productLine]) {
      byProductLine[productLine] = { count: 0, contractValue: 0 };
    }
    byProductLine[productLine].count++;
    byProductLine[productLine].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY PROJECT SIZE (M&A Project Size)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byProjectSize[projectSize]) {
      byProjectSize[projectSize] = { count: 0, contractValue: 0 };
    }
    byProjectSize[projectSize].count++;
    byProjectSize[projectSize].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY DEPLOYMENT MODEL
    // ═══════════════════════════════════════════════════════════════════════
    if (!byDeploymentModel[deploymentModel]) {
      byDeploymentModel[deploymentModel] = { count: 0, contractValue: 0 };
    }
    byDeploymentModel[deploymentModel].count++;
    byDeploymentModel[deploymentModel].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // ADD TO ALL DELIVERIES LIST
    // ═══════════════════════════════════════════════════════════════════════
    allDeliveries.push({
      id: record.Id,
      name: record.Name,
      accountId: record.Account__c,
      accountName: record.Account__r?.Name || 'Unknown',
      opportunityName: record.Opportunity__r?.Name || '-',
      closeDate: record.Opportunity__r?.CloseDate,
      ownerName,
      ownerFirstName: ownerName.split(' ')[0],
      contractValue,
      status,
      productLine,
      deploymentModel,
      projectSize,
      contractVolume,
      kickoffDate: record.Kickoff_Date__c,
      plannedHours
    });
  });
  
  // Convert owner Sets to counts
  const ownerMetrics = {};
  Object.entries(byOwner).forEach(([owner, data]) => {
    ownerMetrics[owner] = {
      ...data,
      accounts: data.accounts.size
    };
  });
  
  // Convert status Sets to counts
  const statusBreakdown = {};
  Object.entries(byStatus).forEach(([status, data]) => {
    statusBreakdown[status] = {
      ...data,
      accounts: data.accounts.size
    };
  });
  
  // Sort deliveries by contract value (highest first)
  allDeliveries.sort((a, b) => b.contractValue - a.contractValue);
  
  const result = {
    ownerMetrics,
    statusBreakdown,
    dealStatusBreakdown: byDealStatus,  // Won vs Active segmentation
    productLineBreakdown: byProductLine,
    projectSizeBreakdown: byProjectSize,
    deploymentModelBreakdown: byDeploymentModel,
    allDeliveries,
    totals: {
      totalRecords: records.length,
      activeCount,
      completedCount,
      totalAccounts: uniqueAccounts.size,
      totalContractValue,
      totalPlannedHours
    }
  };
  
  logger.info(`📦 Processing complete:
    - ${records.length} total records
    - ${Object.keys(statusBreakdown).length} unique statuses: ${Object.keys(statusBreakdown).join(', ')}
    - ${Object.keys(ownerMetrics).length} owners
    - ${uniqueAccounts.size} accounts
    - ${formatCurrency(totalContractValue)} total contract value`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// PDF Design constants - matches GTM snapshot style
const GREEN_ACCENT = '#10b981';
const BLUE_ACCENT = '#3b82f6';
const DARK_TEXT = '#1a1a1a';
const LIGHT_TEXT = '#999999';
const BORDER_GRAY = '#e5e5e5';
const GREEN_BG = '#f0fdf4';
const RED_ACCENT = '#dc2626';
const YELLOW_ACCENT = '#f59e0b';

function generateDeliveryPDF(deliveryData, dateStr) {
  return new Promise((resolve, reject) => {
    try {
      const { ownerMetrics, statusBreakdown, productLineBreakdown, projectSizeBreakdown, deploymentModelBreakdown, allDeliveries, totals } = deliveryData;
      
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
      
      // Column 1: Total Deliveries
      let colX = LEFT;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('DELIVERY OVERVIEW', colX, metricsY);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Total Deliveries', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(totals.totalRecords.toString(), colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(`${totals.totalAccounts} accounts`, colX, metricsY + 42);
      
      // Column 2: Contract Value
      colX = LEFT + colWidth;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Total Contract Value', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.totalContractValue), colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(`Active: ${totals.activeCount} / Completed: ${totals.completedCount}`, colX, metricsY + 42);
      
      // Column 3: Hours
      colX = LEFT + colWidth * 2;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Total Planned Hours', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(`${formatNumber(totals.totalPlannedHours)}`, colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('JH Hours', colX, metricsY + 42);
      
      // Column 4: Status summary
      colX = LEFT + colWidth * 3;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('BY STATUS', colX, metricsY);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      let statusY = metricsY + 12;
      const sortedStatuses = Object.entries(statusBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 4);
      
      sortedStatuses.forEach(([status, data]) => {
        const shortStatus = status.length > 15 ? status.substring(0, 13) + '...' : status;
        doc.text(`${shortStatus}: ${data.count}`, colX, statusY);
        statusY += 10;
      });
      
      y = metricsY + 58 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TWO COLUMN SECTION: Status/Phase (left) + Health Score/Product (right)
      // ═══════════════════════════════════════════════════════════════════════
      const twoColY = y;
      
      // LEFT: Status Breakdown Table
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY STATUS', LEFT, twoColY);
      
      let tableY = twoColY + 14;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Status', LEFT, tableY);
      doc.text('Count', LEFT + 110, tableY, { width: 35, align: 'right' });
      doc.text('Value', LEFT + 150, tableY, { width: 55, align: 'right' });
      
      tableY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, tableY).lineTo(LEFT + halfWidth, tableY).stroke();
      tableY += 5;
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      const allStatuses = Object.entries(statusBreakdown)
        .sort((a, b) => b[1].count - a[1].count);
      
      allStatuses.forEach(([status, data]) => {
        const shortStatus = status.length > 18 ? status.substring(0, 16) + '...' : status;
        
        // Color code certain statuses
        const statusLower = status.toLowerCase();
        if (statusLower.includes('at risk') || statusLower.includes('blocked')) {
          doc.fillColor(RED_ACCENT);
        } else if (statusLower.includes('on hold') || statusLower.includes('delayed')) {
          doc.fillColor(YELLOW_ACCENT);
        } else if (statusLower.includes('completed') || statusLower.includes('live')) {
          doc.fillColor(GREEN_ACCENT);
        } else {
          doc.fillColor(DARK_TEXT);
        }
        
        doc.text(shortStatus, LEFT, tableY);
        doc.fillColor(DARK_TEXT);
        doc.text(data.count.toString(), LEFT + 110, tableY, { width: 35, align: 'right' });
        doc.text(formatCurrency(data.contractValue), LEFT + 150, tableY, { width: 55, align: 'right' });
        tableY += 11;
      });
      
      tableY += 6;
      
      // Project Size breakdown below status
      doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
      doc.text('BY M&A PROJECT SIZE', LEFT, tableY);
      tableY += 12;
      
      const sortedSizes = Object.entries(projectSizeBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedSizes.forEach(([size, data]) => {
        const shortSize = size.length > 18 ? size.substring(0, 16) + '...' : size;
        doc.text(`${shortSize}: ${data.count}`, LEFT, tableY);
        tableY += 10;
      });
      
      // RIGHT: Product Line & Deployment Model
      let rightY = twoColY;
      
      // Product Line breakdown
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY PRODUCT LINE', RIGHT_COL, rightY);
      rightY += 14;
      
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Product', RIGHT_COL, rightY);
      doc.text('Count', RIGHT_COL + 120, rightY, { width: 35, align: 'right' });
      doc.text('Value', RIGHT_COL + 160, rightY, { width: 55, align: 'right' });
      
      rightY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(RIGHT_COL, rightY).lineTo(LEFT + PAGE_WIDTH, rightY).stroke();
      rightY += 5;
      
      const sortedProductLines = Object.entries(productLineBreakdown)
        .sort((a, b) => b[1].count - a[1].count);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedProductLines.forEach(([product, data]) => {
        const shortProduct = product.length > 18 ? product.substring(0, 16) + '...' : product;
        doc.text(shortProduct, RIGHT_COL, rightY);
        doc.text(data.count.toString(), RIGHT_COL + 120, rightY, { width: 35, align: 'right' });
        doc.text(formatCurrency(data.contractValue), RIGHT_COL + 160, rightY, { width: 55, align: 'right' });
        rightY += 11;
      });
      
      rightY += 6;
      
      // Deployment Model breakdown
      doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
      doc.text('BY DEPLOYMENT MODEL', RIGHT_COL, rightY);
      rightY += 12;
      
      const sortedDeployment = Object.entries(deploymentModelBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedDeployment.forEach(([model, data]) => {
        const shortModel = model.length > 20 ? model.substring(0, 18) + '...' : model;
        doc.text(`${shortModel}: ${data.count} (${formatCurrency(data.contractValue)})`, RIGHT_COL, rightY);
        rightY += 10;
      });
      
      y = Math.max(tableY, rightY) + SECTION_GAP + 5;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BY DELIVERY OWNER SECTION
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY DELIVERY OWNER', LEFT, y);
      y += 14;
      
      // Table header
      doc.font(fontBold).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Owner', LEFT, y);
      doc.text('Deliveries', LEFT + 160, y, { width: 50, align: 'right' });
      doc.text('Accounts', LEFT + 220, y, { width: 50, align: 'right' });
      doc.text('Contract Value', LEFT + 280, y, { width: 80, align: 'right' });
      doc.text('Planned Hrs', LEFT + 370, y, { width: 70, align: 'right' });
      
      y += 10;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
      y += 4;
      
      // Sort owners by contract value
      const sortedOwners = Object.entries(ownerMetrics)
        .filter(([_, m]) => m.deliveries > 0)
        .sort((a, b) => b[1].contractValue - a[1].contractValue);
      
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      sortedOwners.slice(0, 10).forEach(([owner, metrics]) => {
        const shortOwner = owner.length > 25 ? owner.substring(0, 23) + '...' : owner;
        doc.text(shortOwner, LEFT, y);
        doc.text(metrics.deliveries.toString(), LEFT + 160, y, { width: 50, align: 'right' });
        doc.text(metrics.accounts.toString(), LEFT + 220, y, { width: 50, align: 'right' });
        doc.text(formatCurrency(metrics.contractValue), LEFT + 280, y, { width: 80, align: 'right' });
        doc.text(formatNumber(metrics.plannedHours), LEFT + 370, y, { width: 70, align: 'right' });
        y += 10;
      });
      
      if (sortedOwners.length > 10) {
        doc.font(fontRegular).fontSize(7).fillColor(LIGHT_TEXT);
        doc.text(`+${sortedOwners.length - 10} more owners`, LEFT, y);
        y += 10;
      }
      
      y += SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP DELIVERIES TABLE (if space)
      // ═══════════════════════════════════════════════════════════════════════
      if (y < 620) {
        doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
        doc.text('TOP DELIVERIES BY VALUE', LEFT, y);
        y += 14;
        
        doc.font(fontBold).fontSize(7).fillColor(DARK_TEXT);
        doc.text('Delivery', LEFT, y);
        doc.text('Account', LEFT + 55, y);
        doc.text('Owner', LEFT + 175, y);
        doc.text('Status', LEFT + 250, y);
        doc.text('Product', LEFT + 330, y);
        doc.text('Value', LEFT + 410, y, { width: 55, align: 'right' });
        doc.text('Kickoff', LEFT + 470, y, { width: 55, align: 'right' });
        
        y += 9;
        doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
        y += 4;
        
        // Show top deliveries
        const topDeliveries = allDeliveries.slice(0, 8);
        doc.font(fontRegular).fontSize(7).fillColor(DARK_TEXT);
        
        topDeliveries.forEach(del => {
          const shortAccount = del.accountName.length > 18 ? del.accountName.substring(0, 16) + '...' : del.accountName;
          const shortStatus = del.status.length > 12 ? del.status.substring(0, 10) + '...' : del.status;
          const shortProduct = del.productLine.length > 12 ? del.productLine.substring(0, 10) + '...' : del.productLine;
          
          doc.text(del.name, LEFT, y);
          doc.text(shortAccount, LEFT + 55, y);
          doc.text(del.ownerFirstName, LEFT + 175, y);
          doc.text(shortStatus, LEFT + 250, y);
          doc.text(shortProduct, LEFT + 330, y);
          doc.text(formatCurrency(del.contractValue), LEFT + 410, y, { width: 55, align: 'right' });
          doc.text(formatDate(del.kickoffDate), LEFT + 470, y, { width: 55, align: 'right' });
          y += 9;
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
// EXCEL GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateDeliveryExcel(deliveryData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Eudia GTM Brain';
  workbook.created = new Date();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: ALL DELIVERIES (RAW DATA)
  // ═══════════════════════════════════════════════════════════════════════════
  const rawSheet = workbook.addWorksheet('All Deliveries');
  
  // Define columns
  rawSheet.columns = [
    { header: 'Account', key: 'accountName', width: 30 },
    { header: 'Delivery Name', key: 'name', width: 35 },
    { header: 'Opportunity', key: 'opportunityName', width: 35 },
    { header: 'Delivery Owner', key: 'ownerName', width: 20 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Product Line', key: 'productLine', width: 20 },
    { header: 'Deployment Model', key: 'deploymentModel', width: 18 },
    { header: 'Project Size', key: 'projectSize', width: 15 },
    { header: 'Contract Value', key: 'contractValue', width: 18 },
    { header: 'Planned Hours', key: 'plannedHours', width: 15 },
    { header: 'Kickoff Date', key: 'kickoffDate', width: 14 },
    { header: 'Close Date', key: 'closeDate', width: 14 }
  ];
  
  // Style header row - Black fill, white text, Times New Roman
  const rawHeaderRow = rawSheet.getRow(1);
  rawHeaderRow.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  rawHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  rawHeaderRow.alignment = { vertical: 'middle', horizontal: 'left' };
  rawHeaderRow.height = 22;
  
  // Add data rows
  deliveryData.allDeliveries.forEach(delivery => {
    rawSheet.addRow({
      accountName: delivery.accountName,
      name: delivery.name,
      opportunityName: delivery.opportunityName,
      ownerName: delivery.ownerName,
      status: delivery.status,
      productLine: delivery.productLine,
      deploymentModel: delivery.deploymentModel,
      projectSize: delivery.projectSize,
      contractValue: delivery.contractValue,
      plannedHours: delivery.plannedHours || 0,
      kickoffDate: delivery.kickoffDate || '-',
      closeDate: delivery.closeDate || '-'
    });
  });
  
  // Format data rows with Times New Roman
  rawSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.font = { name: 'Times New Roman', size: 12 };
      row.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });
  
  // Format currency column
  rawSheet.getColumn('contractValue').numFmt = '$#,##0.00';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: SUMMARY BY OWNER
  // ═══════════════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('Summary by Owner');
  
  summarySheet.columns = [
    { header: 'Delivery Owner', key: 'owner', width: 25 },
    { header: 'Deliveries', key: 'deliveries', width: 12 },
    { header: 'Accounts', key: 'accounts', width: 12 },
    { header: 'Contract Value', key: 'contractValue', width: 18 },
    { header: 'Active', key: 'active', width: 10 },
    { header: 'Completed', key: 'completed', width: 12 }
  ];
  
  // Style header row
  const summaryHeaderRow = summarySheet.getRow(1);
  summaryHeaderRow.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'left' };
  summaryHeaderRow.height = 22;
  
  // Add owner data
  const sortedOwners = Object.entries(deliveryData.ownerMetrics)
    .sort((a, b) => b[1].contractValue - a[1].contractValue);
  
  sortedOwners.forEach(([owner, metrics]) => {
    summarySheet.addRow({
      owner: owner,
      deliveries: metrics.deliveries,
      accounts: metrics.accounts,
      contractValue: metrics.contractValue,
      active: metrics.byStatus?.['Active'] || 0,
      completed: metrics.byStatus?.['Completed'] || 0
    });
  });
  
  // Format data rows
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.font = { name: 'Times New Roman', size: 12 };
      row.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });
  
  summarySheet.getColumn('contractValue').numFmt = '$#,##0.00';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 3: SUMMARY BY STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  const statusSheet = workbook.addWorksheet('Summary by Status');
  
  statusSheet.columns = [
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Deliveries', key: 'count', width: 12 },
    { header: 'Accounts', key: 'accounts', width: 12 },
    { header: 'Contract Value', key: 'contractValue', width: 18 }
  ];
  
  // Style header row
  const statusHeaderRow = statusSheet.getRow(1);
  statusHeaderRow.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  statusHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  statusHeaderRow.alignment = { vertical: 'middle', horizontal: 'left' };
  statusHeaderRow.height = 22;
  
  // Add status data
  const sortedStatuses = Object.entries(deliveryData.statusBreakdown)
    .sort((a, b) => b[1].count - a[1].count);
  
  sortedStatuses.forEach(([status, data]) => {
    statusSheet.addRow({
      status: status,
      count: data.count,
      accounts: data.accounts,
      contractValue: data.contractValue
    });
  });
  
  // Format data rows
  statusSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.font = { name: 'Times New Roman', size: 12 };
      row.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });
  
  statusSheet.getColumn('contractValue').numFmt = '$#,##0.00';
  
  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info('📦 Delivery Excel workbook generated successfully');
  return buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatSlackMessage(deliveryData, dateStr) {
  const { dealStatusBreakdown, totals } = deliveryData;
  
  let message = `*Eudia Delivery Weekly Snapshot — ${dateStr}*\n\n`;
  
  // Get Won (In Delivery) and Active (Late Stage) data
  const wonData = dealStatusBreakdown['Won'] || { count: 0, contractValue: 0, owners: {} };
  const activeData = dealStatusBreakdown['Active'] || { count: 0, contractValue: 0, owners: {} };
  
  // ═══════════════════════════════════════════════════════════════════════
  // IN DELIVERY (Won deals)
  // ═══════════════════════════════════════════════════════════════════════
  message += `*IN DELIVERY*\n`;
  message += `${wonData.count} deliveries, ${formatCurrency(wonData.contractValue)}\n`;
  
  // Top owners for Won
  const wonOwners = Object.entries(wonData.owners || {})
    .sort((a, b) => b[1].contractValue - a[1].contractValue)
    .slice(0, 5);
  
  if (wonOwners.length > 0) {
    wonOwners.forEach(([owner, data]) => {
      const firstName = owner.split(' ')[0];
      message += `• ${firstName}: ${data.count}, ${formatCurrency(data.contractValue)}\n`;
    });
  }
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // LATE STAGE (Active deals with deliveries)
  // ═══════════════════════════════════════════════════════════════════════
  message += `*LATE STAGE*\n`;
  message += `${activeData.count} deliveries, ${formatCurrency(activeData.contractValue)}\n`;
  
  // Top owners for Active
  const activeOwners = Object.entries(activeData.owners || {})
    .sort((a, b) => b[1].contractValue - a[1].contractValue)
    .slice(0, 5);
  
  if (activeOwners.length > 0) {
    activeOwners.forEach(([owner, data]) => {
      const firstName = owner.split(' ')[0];
      message += `• ${firstName}: ${data.count}, ${formatCurrency(data.contractValue)}\n`;
    });
  }
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // TOTAL
  // ═══════════════════════════════════════════════════════════════════════
  message += `*TOTAL:* ${totals.totalRecords} deliveries, ${formatCurrency(totals.totalContractValue)}\n\n`;
  
  message += '_See attached PDF and Excel for full details._';
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sendDeliveryWeeklySummary(app, testMode = false, targetChannel = null) {
  try {
    logger.info('📦 Generating weekly delivery summary with PDF...');
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Query delivery data from Salesforce
    const records = await queryDeliveryData();
    
    if (records.length === 0) {
      logger.warn('📦 No delivery records found - sending empty report');
    }
    
    // Process into metrics
    const deliveryData = processDeliveryData(records);
    
    // Get previous week's snapshot for comparison
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`📦 Previous delivery snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the Slack message
    const message = formatSlackMessage(deliveryData, displayDate);
    
    // Generate PDF
    logger.info('📦 Generating Delivery PDF snapshot...');
    const pdfBuffer = await generateDeliveryPDF(deliveryData, displayDate);
    const pdfFilename = `Eudia_Delivery_Weekly_Snapshot_${dateStr}.pdf`;
    
    // Generate Excel
    logger.info('📦 Generating Delivery Excel workbook...');
    const excelBuffer = await generateDeliveryExcel(deliveryData);
    const excelFilename = `Eudia_Delivery_Weekly_Data_${dateStr}.xlsx`;
    
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
    
    // Upload PDF and Excel together
    logger.info(`📦 Uploading Delivery PDF and Excel to channel: ${channel}`);
    const uploadResult = await app.client.files.uploadV2({
      channel_id: channel,
      initial_comment: message,
      file_uploads: [
        { 
          file: pdfBuffer, 
          filename: pdfFilename, 
          title: `Eudia Delivery Weekly Snapshot — ${displayDate}` 
        },
        { 
          file: excelBuffer, 
          filename: excelFilename, 
          title: `Eudia Delivery Weekly Data — ${displayDate}` 
        }
      ]
    });
    
    logger.info(`✅ Weekly Delivery summary with PDF and Excel sent to ${channel}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // THREADED REPLY: CSM Account Health Excel
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      // Get the message timestamp from the upload result
      const messageTs = uploadResult?.files?.[0]?.shares?.public?.[channel]?.[0]?.ts ||
                        uploadResult?.files?.[0]?.shares?.private?.[channel]?.[0]?.ts;
      
      if (messageTs && deliveryData.allDeliveries && deliveryData.allDeliveries.length > 0) {
        logger.info(`📋 Generating CSM Account Health Excel as threaded reply...`);
        
        const { generateCSMExcelFromDeliveries } = require('./csmAccountHealth');
        const csmResult = await generateCSMExcelFromDeliveries(deliveryData.allDeliveries);
        
        if (csmResult.buffer) {
          const csmFilename = `Eudia_CSM_Account_Health_${dateStr}.xlsx`;
          
          // Salesforce CSM Report URL
          const csmReportUrl = 'https://eudia.lightning.force.com/lightning/r/Report/00OWj000004tO7RMAU/view?queryScope=userFolders';
          
          // Format CSM message with Salesforce link
          let csmMessage = `📋 *CSM Account Health Report*\n\n`;
          csmMessage += `*Accounts with Active Deliveries:* ${csmResult.accountCount}\n\n`;
          csmMessage += `👉 *<${csmReportUrl}|Update Account Health in Salesforce>*\n\n`;
          csmMessage += `_CSMs: Please review and update Account Health and Account Health Details directly in Salesforce._\n\n`;
          csmMessage += `_For accounts without CSM assignment, Business Leads will need to populate relevant updates._`;
          
          // Upload CSM Excel as threaded reply
          await app.client.files.uploadV2({
            channel_id: channel,
            thread_ts: messageTs,
            file: csmResult.buffer,
            filename: csmFilename,
            title: `CSM Account Health — ${displayDate}`,
            initial_comment: csmMessage
          });
          
          logger.info(`✅ CSM Account Health Excel threaded to delivery report`);
        }
      } else {
        logger.warn('📋 Could not get message timestamp for CSM reply, skipping thread');
      }
    } catch (csmError) {
      logger.error('📋 Failed to generate CSM threaded reply:', csmError);
      // Don't throw - the main report was successful
    }
    
    return {
      success: true,
      channel,
      dateStr,
      deliveryCount: deliveryData.totals.totalRecords,
      totals: deliveryData.totals,
      message,
      pdfFilename,
      excelFilename
    };
    
  } catch (error) {
    logger.error('📦 Failed to send weekly delivery summary:', error);
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

  logger.info('📦 Delivery Weekly Summary scheduled (Friday 9 AM EST)');
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
  generateDeliveryExcel
};
