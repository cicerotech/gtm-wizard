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
    
    // Query all fields from the Delivery__c object that we need
    // Based on the Salesforce Object Manager screenshot
    // NOTE: Target_Go_Live_Date__c was removed - doesn't exist on object
    const soql = `
      SELECT 
        Id, 
        Name,
        Account__c, 
        Account__r.Name,
        Opportunity__c, 
        Opportunity__r.Name,
        Opportunity__r.CloseDate,
        Contract_Value__c,
        Services_Revenue_Recognized__c,
        Status__c,
        Phase__c,
        Health_Score__c,
        Product_Line__c,
        Delivery_Model__c,
        Deployment_Model__c,
        Project_Size__c,
        Kickoff_Date__c,
        Actual_Go_Live_Date__c,
        Planned_JH_Hours__c,
        Actual_JH_Hours__c,
        Utilization_Percent__c,
        Client_Satisfaction_Score__c,
        Eudia_Delivery_Owner__c,
        Eudia_Delivery_Owner__r.Name,
        JH_Delivery_Manager__c,
        JH_Delivery_Manager__r.Name,
        CreatedDate,
        LastModifiedDate
      FROM Delivery__c
      ORDER BY Status__c, Eudia_Delivery_Owner__r.Name, Kickoff_Date__c ASC NULLS LAST
    `;
    
    logger.info('📦 Executing SOQL query...');
    const result = await query(soql, false);
    
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
  const byPhase = {};
  const byProductLine = {};
  const byHealthScore = {};
  
  // Totals
  let totalContractValue = 0;
  let totalRevenueRecognized = 0;
  let totalPlannedHours = 0;
  let totalActualHours = 0;
  let activeCount = 0;
  let completedCount = 0;
  const uniqueAccounts = new Set();
  
  // All deliveries for detailed display
  const allDeliveries = [];
  
  records.forEach(record => {
    // Extract fields with null safety
    const status = record.Status__c || 'Unknown';
    const phase = record.Phase__c || 'Unknown';
    const healthScore = record.Health_Score__c || 'Unknown';
    const productLine = record.Product_Line__c || 'Undetermined';
    const ownerName = record.Eudia_Delivery_Owner__r?.Name || 'Unassigned';
    const jhManager = record.JH_Delivery_Manager__r?.Name || null;
    
    const contractValue = record.Contract_Value__c || 0;
    const revenueRecognized = record.Services_Revenue_Recognized__c || 0;
    const plannedHours = record.Planned_JH_Hours__c || 0;
    const actualHours = record.Actual_JH_Hours__c || 0;
    const utilizationPercent = record.Utilization_Percent__c || null;
    const satisfactionScore = record.Client_Satisfaction_Score__c || null;
    
    // Update totals
    totalContractValue += contractValue;
    totalRevenueRecognized += revenueRecognized;
    totalPlannedHours += plannedHours;
    totalActualHours += actualHours;
    
    // Track unique accounts
    if (record.Account__c) {
      uniqueAccounts.add(record.Account__c);
    }
    
    // Track active vs completed
    const statusLower = status.toLowerCase();
    if (statusLower.includes('completed') || statusLower.includes('closed')) {
      completedCount++;
    } else if (!statusLower.includes('cancelled') && !statusLower.includes('on hold')) {
      activeCount++;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY STATUS (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byStatus[status]) {
      byStatus[status] = {
        count: 0,
        contractValue: 0,
        revenueRecognized: 0,
        plannedHours: 0,
        accounts: new Set()
      };
    }
    byStatus[status].count++;
    byStatus[status].contractValue += contractValue;
    byStatus[status].revenueRecognized += revenueRecognized;
    byStatus[status].plannedHours += plannedHours;
    if (record.Account__c) byStatus[status].accounts.add(record.Account__c);
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY OWNER (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byOwner[ownerName]) {
      byOwner[ownerName] = {
        deliveries: 0,
        contractValue: 0,
        revenueRecognized: 0,
        plannedHours: 0,
        actualHours: 0,
        accounts: new Set(),
        byStatus: {},
        byPhase: {}
      };
    }
    byOwner[ownerName].deliveries++;
    byOwner[ownerName].contractValue += contractValue;
    byOwner[ownerName].revenueRecognized += revenueRecognized;
    byOwner[ownerName].plannedHours += plannedHours;
    byOwner[ownerName].actualHours += actualHours;
    if (record.Account__c) byOwner[ownerName].accounts.add(record.Account__c);
    
    // Track status within owner
    if (!byOwner[ownerName].byStatus[status]) {
      byOwner[ownerName].byStatus[status] = 0;
    }
    byOwner[ownerName].byStatus[status]++;
    
    // Track phase within owner
    if (!byOwner[ownerName].byPhase[phase]) {
      byOwner[ownerName].byPhase[phase] = 0;
    }
    byOwner[ownerName].byPhase[phase]++;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY PHASE (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byPhase[phase]) {
      byPhase[phase] = { count: 0, contractValue: 0 };
    }
    byPhase[phase].count++;
    byPhase[phase].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY PRODUCT LINE (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byProductLine[productLine]) {
      byProductLine[productLine] = { count: 0, contractValue: 0 };
    }
    byProductLine[productLine].count++;
    byProductLine[productLine].contractValue += contractValue;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GROUP BY HEALTH SCORE (dynamic)
    // ═══════════════════════════════════════════════════════════════════════
    if (!byHealthScore[healthScore]) {
      byHealthScore[healthScore] = { count: 0, contractValue: 0 };
    }
    byHealthScore[healthScore].count++;
    byHealthScore[healthScore].contractValue += contractValue;
    
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
      jhManager,
      contractValue,
      revenueRecognized,
      status,
      phase,
      healthScore,
      productLine,
      deliveryModel: record.Delivery_Model__c || '-',
      deploymentModel: record.Deployment_Model__c || '-',
      projectSize: record.Project_Size__c || '-',
      kickoffDate: record.Kickoff_Date__c,
      actualGoLive: record.Actual_Go_Live_Date__c,
      plannedHours,
      actualHours,
      utilizationPercent,
      satisfactionScore
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
  
  // Calculate utilization
  const utilizationPercent = totalPlannedHours > 0 
    ? (totalActualHours / totalPlannedHours * 100) 
    : 0;
  
  const result = {
    ownerMetrics,
    statusBreakdown,
    phaseBreakdown: byPhase,
    productLineBreakdown: byProductLine,
    healthScoreBreakdown: byHealthScore,
    allDeliveries,
    totals: {
      totalRecords: records.length,
      activeCount,
      completedCount,
      totalAccounts: uniqueAccounts.size,
      totalContractValue,
      totalRevenueRecognized,
      totalPlannedHours,
      totalActualHours,
      utilizationPercent
    }
  };
  
  logger.info(`📦 Processing complete:
    - ${records.length} total records
    - ${Object.keys(statusBreakdown).length} unique statuses: ${Object.keys(statusBreakdown).join(', ')}
    - ${Object.keys(ownerMetrics).length} owners
    - ${Object.keys(byPhase).length} phases
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
      const { ownerMetrics, statusBreakdown, phaseBreakdown, productLineBreakdown, healthScoreBreakdown, allDeliveries, totals } = deliveryData;
      
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
      doc.text(`Recognized: ${formatCurrency(totals.totalRevenueRecognized)}`, colX, metricsY + 42);
      
      // Column 3: Hours
      colX = LEFT + colWidth * 2;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Planned / Actual Hours', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(`${formatNumber(totals.totalPlannedHours)}`, colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(`Actual: ${formatNumber(totals.totalActualHours)} (${Math.round(totals.utilizationPercent)}% util)`, colX, metricsY + 42);
      
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
      
      // Phase breakdown below status
      doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
      doc.text('BY PHASE', LEFT, tableY);
      tableY += 12;
      
      const sortedPhases = Object.entries(phaseBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedPhases.forEach(([phase, data]) => {
        const shortPhase = phase.length > 18 ? phase.substring(0, 16) + '...' : phase;
        doc.text(`${shortPhase}: ${data.count}`, LEFT, tableY);
        tableY += 10;
      });
      
      // RIGHT: Health Score & Product Line
      let rightY = twoColY;
      
      // Health Score breakdown
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BY HEALTH SCORE', RIGHT_COL, rightY);
      rightY += 14;
      
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Health', RIGHT_COL, rightY);
      doc.text('Count', RIGHT_COL + 120, rightY, { width: 35, align: 'right' });
      doc.text('Value', RIGHT_COL + 160, rightY, { width: 55, align: 'right' });
      
      rightY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(RIGHT_COL, rightY).lineTo(LEFT + PAGE_WIDTH, rightY).stroke();
      rightY += 5;
      
      const sortedHealth = Object.entries(healthScoreBreakdown)
        .sort((a, b) => b[1].count - a[1].count);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedHealth.forEach(([health, data]) => {
        const healthLower = health.toLowerCase();
        if (healthLower.includes('red') || healthLower.includes('at risk') || healthLower.includes('poor')) {
          doc.fillColor(RED_ACCENT);
        } else if (healthLower.includes('yellow') || healthLower.includes('concern')) {
          doc.fillColor(YELLOW_ACCENT);
        } else if (healthLower.includes('green') || healthLower.includes('good') || healthLower.includes('healthy')) {
          doc.fillColor(GREEN_ACCENT);
        } else {
          doc.fillColor(DARK_TEXT);
        }
        
        doc.text(health, RIGHT_COL, rightY);
        doc.fillColor(DARK_TEXT);
        doc.text(data.count.toString(), RIGHT_COL + 120, rightY, { width: 35, align: 'right' });
        doc.text(formatCurrency(data.contractValue), RIGHT_COL + 160, rightY, { width: 55, align: 'right' });
        rightY += 11;
      });
      
      rightY += 6;
      
      // Product Line breakdown
      doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
      doc.text('BY PRODUCT LINE', RIGHT_COL, rightY);
      rightY += 12;
      
      const sortedProductLines = Object.entries(productLineBreakdown)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      
      doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
      sortedProductLines.forEach(([product, data]) => {
        const shortProduct = product.length > 20 ? product.substring(0, 18) + '...' : product;
        doc.text(`${shortProduct}: ${data.count} (${formatCurrency(data.contractValue)})`, RIGHT_COL, rightY);
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
      doc.text('Del', LEFT + 140, y, { width: 30, align: 'right' });
      doc.text('Accts', LEFT + 175, y, { width: 35, align: 'right' });
      doc.text('Contract $', LEFT + 215, y, { width: 65, align: 'right' });
      doc.text('Recognized', LEFT + 285, y, { width: 65, align: 'right' });
      doc.text('Hrs (P/A)', LEFT + 355, y, { width: 70, align: 'right' });
      
      y += 10;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
      y += 4;
      
      // Sort owners by contract value
      const sortedOwners = Object.entries(ownerMetrics)
        .filter(([_, m]) => m.deliveries > 0)
        .sort((a, b) => b[1].contractValue - a[1].contractValue);
      
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      sortedOwners.slice(0, 10).forEach(([owner, metrics]) => {
        const shortOwner = owner.length > 22 ? owner.substring(0, 20) + '...' : owner;
        doc.text(shortOwner, LEFT, y);
        doc.text(metrics.deliveries.toString(), LEFT + 140, y, { width: 30, align: 'right' });
        doc.text(metrics.accounts.toString(), LEFT + 175, y, { width: 35, align: 'right' });
        doc.text(formatCurrency(metrics.contractValue), LEFT + 215, y, { width: 65, align: 'right' });
        doc.text(formatCurrency(metrics.revenueRecognized), LEFT + 285, y, { width: 65, align: 'right' });
        doc.text(`${formatNumber(metrics.plannedHours)}/${formatNumber(metrics.actualHours)}`, LEFT + 355, y, { width: 70, align: 'right' });
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
        doc.text('Owner', LEFT + 180, y);
        doc.text('Status', LEFT + 260, y);
        doc.text('Health', LEFT + 335, y);
        doc.text('Value', LEFT + 395, y, { width: 55, align: 'right' });
        doc.text('Go-Live', LEFT + 455, y, { width: 55, align: 'right' });
        
        y += 9;
        doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + PAGE_WIDTH, y).stroke();
        y += 4;
        
        // Show top deliveries
        const topDeliveries = allDeliveries.slice(0, 8);
        doc.font(fontRegular).fontSize(7).fillColor(DARK_TEXT);
        
        topDeliveries.forEach(del => {
          const shortAccount = del.accountName.length > 18 ? del.accountName.substring(0, 16) + '...' : del.accountName;
          const shortStatus = del.status.length > 12 ? del.status.substring(0, 10) + '...' : del.status;
          const shortHealth = del.healthScore.length > 10 ? del.healthScore.substring(0, 8) + '...' : del.healthScore;
          
          doc.text(del.name, LEFT, y);
          doc.text(shortAccount, LEFT + 55, y);
          doc.text(del.ownerFirstName, LEFT + 180, y);
          doc.text(shortStatus, LEFT + 260, y);
          doc.text(shortHealth, LEFT + 335, y);
          doc.text(formatCurrency(del.contractValue), LEFT + 395, y, { width: 55, align: 'right' });
          doc.text(formatDate(del.actualGoLive || del.kickoffDate), LEFT + 455, y, { width: 55, align: 'right' });
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
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatSlackMessage(deliveryData, dateStr) {
  const { ownerMetrics, statusBreakdown, healthScoreBreakdown, totals } = deliveryData;
  
  let message = `*Eudia Delivery Weekly Snapshot — ${dateStr}*\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // DELIVERY OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════
  message += '*DELIVERY OVERVIEW*\n';
  message += `Total Deliveries: ${totals.totalRecords} across ${totals.totalAccounts} accounts\n`;
  message += `Total Contract Value: ${formatCurrencyFull(totals.totalContractValue)}\n`;
  message += `Revenue Recognized: ${formatCurrencyFull(totals.totalRevenueRecognized)}\n`;
  message += `Hours: ${formatNumber(totals.totalPlannedHours)} planned / ${formatNumber(totals.totalActualHours)} actual (${Math.round(totals.utilizationPercent)}% utilization)\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY STATUS
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY STATUS*\n';
  const sortedStatuses = Object.entries(statusBreakdown)
    .sort((a, b) => b[1].count - a[1].count);
  
  sortedStatuses.forEach(([status, data]) => {
    const deliveryWord = data.count === 1 ? 'delivery' : 'deliveries';
    message += `• ${status}: ${data.count} ${deliveryWord} (${formatCurrency(data.contractValue)})\n`;
  });
  message += '\n';
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY HEALTH SCORE
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY HEALTH SCORE*\n';
  const sortedHealth = Object.entries(healthScoreBreakdown)
    .sort((a, b) => b[1].count - a[1].count);
  
  sortedHealth.forEach(([health, data]) => {
    const healthLower = health.toLowerCase();
    let emoji = '⚪';
    if (healthLower.includes('green') || healthLower.includes('good') || healthLower.includes('healthy')) {
      emoji = '🟢';
    } else if (healthLower.includes('yellow') || healthLower.includes('concern')) {
      emoji = '🟡';
    } else if (healthLower.includes('red') || healthLower.includes('at risk') || healthLower.includes('poor')) {
      emoji = '🔴';
    }
    message += `${emoji} ${health}: ${data.count}\n`;
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
    const firstName = owner.split(' ')[0];
    const deliveryWord = metrics.deliveries === 1 ? 'delivery' : 'deliveries';
    message += `• ${firstName} — ${metrics.deliveries} ${deliveryWord}, ${formatCurrency(metrics.contractValue)}\n`;
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
  processDeliveryData
};
