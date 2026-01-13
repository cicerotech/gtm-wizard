const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../salesforce/connection');
const logger = require('../utils/logger');
const { ALL_BUSINESS_LEADS, BL_ASSIGNMENTS } = require('../services/accountAssignment');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = path.join(__dirname, '../../data/bl-snapshots.json');
const GTM_CHANNEL = process.env.GTM_ACCOUNT_PLANNING_CHANNEL || '#gtm-account-planning';
const CAPACITY_ALERT_THRESHOLD = parseInt(process.env.BL_CAPACITY_ALERT_THRESHOLD) || 10;
const MAX_DEALS_PER_BL = 3; // Max deals to show per BL in proposal section
const DIVIDER = '───────────────────────';

// Active pipeline stages (must match Salesforce "All Active Pipeline" report)
const ACTIVE_STAGES = [
  'Stage 0 - Prospecting',
  'Stage 1 - Discovery',
  'Stage 2 - SQO',
  'Stage 3 - Pilot',
  'Stage 4 - Proposal'
];

// US and EU Pod categorization for display
const US_POD = [
  'Asad Hussain',
  'Himanshu Agarwal',
  'Julie Stefanich',
  'Olivia Jung',
  'Ananth Cherukupally',
  'Justin Hills',
  'Mike Masiello'
];

const EU_POD = [
  'Greg MacHale',
  'Nathan Shine',
  'Tom Clancy',
  'Conor Molloy',
  'Alex Fox',
  'Nicola Fratini',
  'Emer Flynn',
  'Riona McHale'
];

// Proposal stage = Stage 4 - Proposal
const PROPOSAL_STAGE = 'Stage 4 - Proposal';

// ═══════════════════════════════════════════════════════════════════════════
// RUN RATE HISTORICAL DATA (Static - update manually as needed)
// These are displayed in the RevOps Page 1 Run Rate section
// Values are in MILLIONS (e.g., 17.5 = $17.5M)
// ═══════════════════════════════════════════════════════════════════════════
const RUN_RATE_HISTORICAL = {
  // FY25 Historical Run Rate by Month (in millions USD)
  // Update these values manually based on finance reporting
  'August': 17.5,
  'September': 18.2,
  'October': 19.0,
  'November': 19.5,
  'December': 20.1,
  // January is calculated dynamically from New Business weighted ACV query
};

// ═══════════════════════════════════════════════════════════════════════════
// FISCAL QUARTER LOGIC (Feb-Jan Fiscal Year)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get fiscal quarter end date
 * Fiscal year runs Feb 1 - Jan 31
 * Q1: Feb 1 - Apr 30
 * Q2: May 1 - Jul 31
 * Q3: Aug 1 - Oct 31
 * Q4: Nov 1 - Jan 31
 */
function getFiscalQuarterEnd() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  const year = now.getFullYear();
  
  // Feb-Jan fiscal year, quarters end: Apr 30, Jul 31, Oct 31, Jan 31
  if (month >= 1 && month <= 3) {       // Feb(1)-Apr(3) = Q1
    return new Date(year, 3, 30);       // Apr 30
  } else if (month >= 4 && month <= 6) { // May(4)-Jul(6) = Q2
    return new Date(year, 6, 31);       // Jul 31
  } else if (month >= 7 && month <= 9) { // Aug(7)-Oct(9) = Q3
    return new Date(year, 9, 31);       // Oct 31
  } else {                               // Nov(10)-Dec(11) or Jan(0) = Q4
    // If Nov-Dec, quarter ends next year Jan 31
    // If Jan, quarter ends this year Jan 31
    const qEndYear = month === 0 ? year : year + 1;
    return new Date(qEndYear, 0, 31);   // Jan 31
  }
}

/**
 * Get fiscal quarter label for display (e.g., "thru Jan 31")
 */
function getFiscalQuarterLabel() {
  const qEnd = getFiscalQuarterEnd();
  return `thru ${qEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Check if a date falls within the current fiscal quarter (between today and quarter end)
 */
function isInCurrentFiscalQuarter(dateStr) {
  if (!dateStr) return false;
  
  // Parse as UTC to avoid timezone issues
  const targetDate = new Date(dateStr + 'T12:00:00Z');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const quarterEnd = getFiscalQuarterEnd();
  // Set to end of day on quarter end
  quarterEnd.setHours(23, 59, 59, 999);
  
  return targetDate >= today && targetDate <= quarterEnd;
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
    logger.error('Failed to read snapshots file:', error);
  }
  return { snapshots: {} };
}

function writeSnapshots(data) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
    logger.info('Snapshots saved to file');
  } catch (error) {
    logger.error('Failed to write snapshots file:', error);
    throw error;
  }
}

function getLastSnapshotDate(snapshots) {
  const dates = Object.keys(snapshots.snapshots || {}).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function saveSnapshot(date, blData) {
  const data = readSnapshots();
  data.snapshots[date] = blData;
  
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

async function queryPipelineData() {
  try {
    logger.info('Querying pipeline data from Salesforce...');
    
    // Build stage filter to match "All Active Pipeline" report (Stages 0-4)
    const stageFilter = ACTIVE_STAGES.map(s => `'${s}'`).join(', ');
    
    const soql = `
      SELECT Owner.Name, AccountId, Account.Name, 
             ACV__c, Weighted_ACV__c, StageName,
             Target_LOI_Date__c, Product_Line__c
      FROM Opportunity
      WHERE IsClosed = false
        AND StageName IN (${stageFilter})
      ORDER BY Owner.Name, Target_LOI_Date__c ASC NULLS LAST
    `;
    
    // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
    const result = await query(soql, true);
    
    if (!result || !result.records) {
      logger.warn('No opportunity records found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} active pipeline opportunities (Stages 0-4)`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query pipeline data:', error);
    throw error;
  }
}

/**
 * Query current logos by Account.Customer_Type__c and Customer_Subtype__c
 * 
 * CORRECT FIELD MAPPING (per Salesforce setup):
 * - Customer_Type__c = "Existing" or "New" (parent filter)
 * - Customer_Subtype__c = "MSA", "Pilot", "LOI" (breakdown categories)
 * 
 * Primary count: Customer_Type__c = 'Existing'
 * Breakdown: Customer_Subtype__c values (MSA, Pilot, LOI)
 */
async function queryLogosByType() {
  try {
    logger.info('Querying logos by type from Salesforce...');
    
    // Query accounts with Customer_Type__c = 'Existing'
    const soql = `
      SELECT Name, Customer_Type__c, Customer_Subtype__c, First_Deal_Closed__c
      FROM Account
      WHERE Customer_Type__c = 'Existing'
      ORDER BY Customer_Subtype__c, Name
    `;
    
    // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
    const result = await query(soql, true);
    
    if (!result || !result.records) {
      logger.warn('No logos found with Customer_Type__c = Existing');
      return { 
        existing: [], 
        msa: [], 
        pilot: [], 
        loi: [],
        // Legacy fields for backward compatibility
        revenue: [], 
        project: []
      };
    }
    
    // Log unique values for debugging
    const uniqueSubtypes = [...new Set(result.records.map(a => a.Customer_Subtype__c).filter(Boolean))];
    logger.info(`Found ${result.records.length} accounts with Customer_Type__c = 'Existing'`);
    logger.info(`Customer_Subtype__c values: ${JSON.stringify(uniqueSubtypes)}`);
    
    // Initialize counts
    const logos = { 
      existing: [],   // All existing customers (Customer_Type__c = 'Existing')
      msa: [],        // MSA customers (Customer_Subtype__c = 'MSA')
      pilot: [],      // Pilot customers (Customer_Subtype__c = 'Pilot')
      loi: [],        // LOI customers (Customer_Subtype__c = 'LOI')
      // Legacy fields for backward compatibility
      revenue: [], 
      project: []
    };
    
    result.records.forEach(acc => {
      const subtype = (acc.Customer_Subtype__c || '').toLowerCase().trim();
      const entry = { name: acc.Name, firstClosed: acc.First_Deal_Closed__c };
      
      // Log first few records for debugging
      if (logos.existing.length < 3) {
        logger.info(`  Sample: "${acc.Name}" - Customer_Type__c="${acc.Customer_Type__c}", Customer_Subtype__c="${acc.Customer_Subtype__c}"`);
      }
      
      // All records with Customer_Type__c = 'Existing' count as existing
      logos.existing.push(entry);
      
      // Categorize by Customer_Subtype__c for breakdown
      // Customer_Subtype__c values: MSA, Pilot, LOI
      if (subtype === 'msa') {
        logos.msa.push(entry);
        logos.revenue.push(entry); // Legacy
      } else if (subtype === 'pilot') {
        logos.pilot.push(entry);
      } else if (subtype === 'loi') {
        logos.loi.push(entry);
      }
      // Note: If Customer_Subtype__c is null/empty, they count in existing total only
    });
    
    logger.info(`Logos: Existing=${logos.existing.length} (MSA=${logos.msa.length}, Pilot=${logos.pilot.length}, LOI=${logos.loi.length})`);
    return logos;
    
  } catch (error) {
    logger.error('Failed to query logos:', error);
    return { 
      existing: [], 
      msa: [], 
      pilot: [], 
      loi: [],
      revenue: [], 
      project: []
    };
  }
}

/**
 * Query closed-won deals for this fiscal quarter
 */
async function querySignedDeals() {
  try {
    logger.info('Querying signed deals from Salesforce...');
    
    // Get fiscal quarter date range (Q4: Nov 1 - Jan 31)
    const now = new Date();
    const month = now.getMonth();
    
    // Calculate fiscal quarter start
    let fiscalQStart;
    if (month >= 1 && month <= 3) {       // Feb-Apr = Q1
      fiscalQStart = new Date(now.getFullYear(), 1, 1);
    } else if (month >= 4 && month <= 6) { // May-Jul = Q2
      fiscalQStart = new Date(now.getFullYear(), 4, 1);
    } else if (month >= 7 && month <= 9) { // Aug-Oct = Q3
      fiscalQStart = new Date(now.getFullYear(), 7, 1);
    } else {                               // Nov-Dec or Jan = Q4
      fiscalQStart = month === 0 
        ? new Date(now.getFullYear() - 1, 10, 1)  // Jan -> Nov last year
        : new Date(now.getFullYear(), 10, 1);     // Nov-Dec -> Nov this year
    }
    
    const startStr = fiscalQStart.toISOString().split('T')[0];
    
    const soql = `
      SELECT AccountId, Account.Name, Name, ACV__c, CloseDate, Revenue_Type__c, Owner.Name
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND CloseDate >= ${startStr}
      ORDER BY CloseDate DESC
    `;
    
    // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
    const result = await query(soql, true);
    
    if (!result || !result.records) {
      logger.warn('No signed deals found');
      return [];
    }
    
    logger.info(`Found ${result.totalSize} signed deals this fiscal quarter`);
    return result.records;
    
  } catch (error) {
    logger.error('Failed to query signed deals:', error);
    return []; // Don't fail if signed query fails
  }
}

/**
 * Process signed deals data - by Revenue_Type__c
 * Revenue_Type__c values: Recurring (ARR), Commitment (LOI), Project, Pilot
 */
function processSignedDeals(records) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  
  // Totals
  let totalDeals = 0;
  let totalACV = 0;
  const uniqueAccounts = new Set();
  
  // By Revenue Type
  let recurringDeals = 0, recurringACV = 0;
  let loiDeals = 0, loiACV = 0;       // Commitment = LOI
  let projectDeals = 0, projectACV = 0;
  let pilotDeals = 0, pilotACV = 0;   // Pilot engagements
  
  // This month
  let thisMonthDeals = 0;
  let thisMonthACV = 0;
  const thisMonthAccountSet = new Set();
  const thisMonthDealsList = [];
  
  records.forEach(opp => {
    const acv = opp.ACV__c || 0;
    const closeDate = opp.CloseDate ? new Date(opp.CloseDate) : null;
    const revenueType = (opp.Revenue_Type__c || '').toLowerCase().trim();
    const accountId = opp.AccountId;
    
    totalDeals++;
    totalACV += acv;
    uniqueAccounts.add(accountId);
    
    // Revenue type breakdown
    if (revenueType.includes('recurring') || revenueType === 'arr') {
      recurringDeals++;
      recurringACV += acv;
    } else if (revenueType.includes('commitment') || revenueType.includes('booking') || revenueType.includes('loi')) {
      loiDeals++;
      loiACV += acv;
    } else if (revenueType.includes('pilot')) {
      pilotDeals++;
      pilotACV += acv;
    } else if (revenueType.includes('project')) {
      projectDeals++;
      projectACV += acv;
    } else {
      // Default to project if unknown
      projectDeals++;
      projectACV += acv;
    }
    
    // This month check
    if (closeDate && closeDate.getMonth() === thisMonth && closeDate.getFullYear() === thisYear) {
      thisMonthDeals++;
      thisMonthACV += acv;
      thisMonthAccountSet.add(accountId);
      thisMonthDealsList.push({
        accountName: opp.Account?.Name || 'Unknown',
        oppName: opp.Name,
        acv,
        closeDate: opp.CloseDate,
        revenueType: opp.Revenue_Type__c
      });
    }
  });
  
  return {
    // Total quarter
    totalLogos: uniqueAccounts.size,
    totalDeals,
    totalACV,
    // By type
    recurringDeals,
    recurringACV,
    loiDeals,
    loiACV,
    projectDeals,
    projectACV,
    pilotDeals,
    pilotACV,
    // This month
    thisMonthLogos: thisMonthAccountSet.size,
    thisMonthDeals,
    thisMonthACV,
    thisMonthDealsList: thisMonthDealsList.sort((a, b) => b.acv - a.acv)
  };
}

/**
 * Query ACTIVE revenue - Closed Won deals where contract is still active
 * Active = CloseDate + Term (months) >= Today
 * 
 * This matches the Salesforce report "Active Revenue + Projects"
 * Report ID: 00OWj000003hVoPMAU
 */
async function queryActiveRevenue() {
  try {
    logger.info('Querying active revenue (Closed Won with active contracts)...');
    
    // Query all Closed Won deals with Recurring, Project, or Pilot revenue type
    // Include Term__c to calculate end date
    const soql = `
      SELECT Id, Name, AccountId, Account.Name, ACV__c, Revenue_Type__c, 
             CloseDate, Term__c, Owner.Name
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND Revenue_Type__c IN ('Recurring', 'Project', 'Pilot')
      ORDER BY ACV__c DESC
    `;
    
    // Enable caching (5 min TTL) to avoid SF rate limits when multiple reports run back-to-back
    const result = await query(soql, true);
    
    if (!result || !result.records) {
      logger.warn('No closed won revenue deals found');
      return { recurringACV: 0, projectACV: 0, totalActiveACV: 0, activeDeals: [] };
    }
    
    logger.info(`Found ${result.totalSize} total Closed Won revenue deals`);
    
    // Filter to ACTIVE contracts only (end date >= today)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today for comparison
    
    let activeRecurringACV = 0;
    let activeProjectACV = 0;
    const activeDeals = [];
    
    result.records.forEach(opp => {
      const closeDate = opp.CloseDate ? new Date(opp.CloseDate) : null;
      if (!closeDate) return; // Skip if no close date
      
      // Calculate end date: CloseDate + Term (months)
      // Default to 12 months if Term__c is not set
      const termMonths = opp.Term__c || 12;
      const endDate = new Date(closeDate);
      endDate.setMonth(endDate.getMonth() + termMonths);
      
      // Check if contract is still active (end date >= today)
      if (endDate >= today) {
        const acv = opp.ACV__c || 0;
        const revenueType = (opp.Revenue_Type__c || '').toLowerCase().trim();
        
        if (revenueType.includes('recurring') || revenueType === 'arr') {
          activeRecurringACV += acv;
        } else if (revenueType.includes('project')) {
          activeProjectACV += acv;
        }
        
        activeDeals.push({
          id: opp.Id,
          name: opp.Name,
          accountName: opp.Account?.Name || 'Unknown',
          acv,
          revenueType: opp.Revenue_Type__c,
          closeDate: opp.CloseDate,
          termMonths,
          endDate: endDate.toISOString().split('T')[0],
          owner: opp.Owner?.Name
        });
      }
    });
    
    const totalActiveACV = activeRecurringACV + activeProjectACV;
    
    logger.info(`Active revenue: Recurring $${(activeRecurringACV/1000000).toFixed(2)}M, Project $${(activeProjectACV/1000000).toFixed(2)}M`);
    logger.info(`Total active deals: ${activeDeals.length} with $${(totalActiveACV/1000000).toFixed(2)}M ACV`);
    
    return {
      recurringACV: activeRecurringACV,
      projectACV: activeProjectACV,
      totalActiveACV,
      activeDeals,
      dealCount: activeDeals.length
    };
    
  } catch (error) {
    logger.error('Failed to query active revenue:', error);
    return { recurringACV: 0, projectACV: 0, totalActiveACV: 0, activeDeals: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 1 REVOPS QUERY FUNCTIONS
// These power the RevOps dashboard metrics on Page 1 of the weekly snapshot
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query January Closed Won New Business revenue
 * Sum of New Business deals that moved to Closed Won with close date this month
 * This is used for the January row in the Run Rate Forecast table
 */
async function queryJanuaryClosedWonNewBusiness() {
  try {
    logger.info('Querying January Closed Won New Business...');
    
    // Get current month boundaries
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    
    const soql = `
      SELECT SUM(ACV__c) totalACV, COUNT(Id) dealCount
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND Sales_Type__c = 'New business'
        AND CloseDate >= ${monthStart}
        AND CloseDate <= ${monthEnd}
    `;
    
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      return { totalACV: 0, dealCount: 0 };
    }
    
    const row = result.records[0];
    const data = {
      totalACV: row.totalACV || 0,
      dealCount: row.dealCount || 0
    };
    
    logger.info(`January Closed Won New Business: $${(data.totalACV/1000000).toFixed(2)}M (${data.dealCount} deals)`);
    return data;
    
  } catch (error) {
    logger.error('Failed to query January Closed Won New Business:', error);
    return { totalACV: 0, dealCount: 0 };
  }
}

/**
 * Query Q4 weighted pipeline - deals with Target_LOI_Date__c within fiscal Q4 (Nov 1 - Jan 31)
 * Sum of Finance_Weighted_ACV__c for open opportunities targeting this fiscal quarter
 */
async function queryQ4WeightedPipeline() {
  try {
    logger.info('Querying Q4 weighted pipeline (Target_LOI_Date within fiscal Q4)...');
    
    // Calculate fiscal Q4 date range (Nov 1 - Jan 31)
    const now = new Date();
    const month = now.getMonth(); // 0-indexed (0 = Jan)
    
    let q4Start, q4End;
    if (month === 0) { 
      // January - Q4 ends this month (Nov 1 last year to Jan 31 this year)
      q4Start = new Date(now.getFullYear() - 1, 10, 1); // Nov 1 last year
      q4End = new Date(now.getFullYear(), 0, 31);       // Jan 31 this year
    } else if (month >= 10) { 
      // Nov-Dec - Q4 spans into next year
      q4Start = new Date(now.getFullYear(), 10, 1);     // Nov 1 this year
      q4End = new Date(now.getFullYear() + 1, 0, 31);   // Jan 31 next year
    } else {
      // Feb-Oct - use upcoming Q4 for reference
      q4Start = new Date(now.getFullYear(), 10, 1);     // Nov 1 this year
      q4End = new Date(now.getFullYear() + 1, 0, 31);   // Jan 31 next year
    }
    
    const q4StartStr = q4Start.toISOString().split('T')[0];
    const q4EndStr = q4End.toISOString().split('T')[0];
    
    logger.info(`Fiscal Q4 end date: ${q4EndStr}`);
    
    // Filter by Target_LOI_Date__c <= Q4 end date (no lower bound to match SF report)
    // Only include New Business and Expansion (exclude Renewal)
    const soql = `
      SELECT SUM(ACV__c) totalACV, SUM(Weighted_ACV__c) weightedACV, COUNT(Id) dealCount
      FROM Opportunity
      WHERE IsClosed = false
        AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
        AND Target_LOI_Date__c <= ${q4EndStr}
        AND Sales_Type__c IN ('New business', 'Expansion')
    `;
    
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      return { totalACV: 0, weightedACV: 0, dealCount: 0 };
    }
    
    const row = result.records[0];
    const data = {
      totalACV: row.totalACV || 0,
      weightedACV: row.weightedACV || 0,
      dealCount: row.dealCount || 0
    };
    
    logger.info(`Q4 Weighted Pipeline: $${(data.weightedACV/1000000).toFixed(2)}M weighted (${data.dealCount} deals targeting Q4)`);
    return data;
    
  } catch (error) {
    logger.error('Failed to query Q4 weighted pipeline:', error);
    return { totalACV: 0, weightedACV: 0, dealCount: 0 };
  }
}

/**
 * Query signed revenue Quarter-to-Date (Closed Won this fiscal quarter)
 * Includes Recurring, Project, and Pilot deals with CloseDate in fiscal quarter
 * Fiscal Q4: Nov 1 - Jan 31
 */
async function querySignedRevenueQTD() {
  try {
    logger.info('Querying signed revenue QTD (fiscal quarter)...');
    
    // Calculate FISCAL quarter start date (Feb-Jan fiscal year)
    // Q1: Feb 1 - Apr 30, Q2: May 1 - Jul 31, Q3: Aug 1 - Oct 31, Q4: Nov 1 - Jan 31
    const now = new Date();
    const month = now.getMonth(); // 0-indexed (0 = Jan)
    
    let fiscalQStart;
    if (month >= 1 && month <= 3) {       // Feb-Apr = Q1
      fiscalQStart = new Date(now.getFullYear(), 1, 1);     // Feb 1
    } else if (month >= 4 && month <= 6) { // May-Jul = Q2
      fiscalQStart = new Date(now.getFullYear(), 4, 1);     // May 1
    } else if (month >= 7 && month <= 9) { // Aug-Oct = Q3
      fiscalQStart = new Date(now.getFullYear(), 7, 1);     // Aug 1
    } else {                               // Nov-Dec or Jan = Q4
      fiscalQStart = month === 0 
        ? new Date(now.getFullYear() - 1, 10, 1)  // Jan -> Nov 1 last year
        : new Date(now.getFullYear(), 10, 1);     // Nov-Dec -> Nov 1 this year
    }
    
    const fiscalQStartStr = fiscalQStart.toISOString().split('T')[0];
    logger.info(`Fiscal quarter start: ${fiscalQStartStr}`);
    
    // Filter by Revenue_Type__c (Recurring, Project, Pilot) - NOT Sales_Type__c
    const soql = `
      SELECT SUM(ACV__c) totalACV, COUNT(Id) dealCount
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND CloseDate >= ${fiscalQStartStr}
        AND Revenue_Type__c IN ('Recurring', 'Project', 'Pilot')
    `;
    
    const result = await query(soql, true);
    
    if (!result || !result.records || result.records.length === 0) {
      return { totalACV: 0, totalDeals: 0 };
    }
    
    const row = result.records[0];
    const data = {
      totalACV: row.totalACV || 0,
      totalDeals: row.dealCount || 0
    };
    
    logger.info(`Signed QTD: $${(data.totalACV/1000000).toFixed(2)}M (${data.totalDeals} deals)`);
    return data;
    
  } catch (error) {
    logger.error('Failed to query signed revenue QTD:', error);
    return { totalACV: 0, totalDeals: 0 };
  }
}

/**
 * Query signed revenue in last 7 days with individual deal details
 * Returns deals array and breakdown by revenue type for PDF rendering
 * Only includes Recurring, Project, and Pilot deals
 */
async function querySignedRevenueLastWeek() {
  try {
    logger.info('Querying signed revenue last week (Recurring/Project/Pilot only)...');
    
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    // Query individual deals (not aggregate) to get deal details
    // Filter by Revenue_Type__c to include only Recurring, Project, Pilot
    const soql = `
      SELECT Id, Name, Account.Name, ACV__c, Owner.Name, 
             Sales_Type__c, Revenue_Type__c, Product_Line__c, CloseDate
      FROM Opportunity
      WHERE StageName = 'Stage 6. Closed(Won)'
        AND CloseDate >= ${weekAgoStr}
        AND Revenue_Type__c IN ('Recurring', 'Project', 'Pilot')
      ORDER BY ACV__c DESC
    `;
    
    const result = await query(soql, true);
    
    // Default empty structure
    const emptyResult = { 
      totalACV: 0, 
      totalDeals: 0, 
      deals: [], 
      byRevenueType: {} 
    };
    
    if (!result || !result.records || result.records.length === 0) {
      return emptyResult;
    }
    
    // Map records to deal objects
    const deals = result.records.map(opp => ({
      id: opp.Id,
      name: opp.Name,
      accountName: opp.Account?.Name || 'Unknown',
      acv: opp.ACV__c || 0,
      ownerName: opp.Owner?.Name || 'Unknown',
      salesType: opp.Sales_Type__c || 'N/A',
      revenueType: opp.Revenue_Type__c || 'Other',
      productLine: opp.Product_Line__c || 'N/A',
      closeDate: opp.CloseDate
    }));
    
    // Calculate totals
    const totalACV = deals.reduce((sum, d) => sum + d.acv, 0);
    const totalDeals = deals.length;
    
    // Group by revenue type
    const byRevenueType = {};
    deals.forEach(deal => {
      const type = deal.revenueType || 'Other';
      if (!byRevenueType[type]) {
        byRevenueType[type] = { deals: [], totalACV: 0 };
      }
      byRevenueType[type].deals.push(deal);
      byRevenueType[type].totalACV += deal.acv;
    });
    
    const data = {
      totalACV,
      totalDeals,
      deals,
      byRevenueType
    };
    
    logger.info(`Signed Last Week: $${(totalACV/1000000).toFixed(2)}M (${totalDeals} deals)`);
    return data;
    
  } catch (error) {
    logger.error('Failed to query signed revenue last week:', error);
    return { totalACV: 0, totalDeals: 0, deals: [], byRevenueType: {} };
  }
}

/**
 * Query Top 10 deals targeting January (current year)
 * Also returns totalCount of all matching opportunities
 */
async function queryTop10TargetingJanuary() {
  try {
    logger.info('Querying top 10 deals targeting January...');
    
    const now = new Date();
    const year = now.getFullYear();
    const janStart = `${year}-01-01`;
    const janEnd = `${year}-01-31`;
    
    // Query top 10 deals by ACV
    const soql = `
      SELECT Id, Name, Account.Name, ACV__c, Finance_Weighted_ACV__c, Target_LOI_Date__c, 
             StageName, Owner.Name, Sales_Type__c
      FROM Opportunity
      WHERE IsClosed = false
        AND Target_LOI_Date__c >= ${janStart}
        AND Target_LOI_Date__c <= ${janEnd}
      ORDER BY ACV__c DESC
      LIMIT 10
    `;
    
    // Also query total count of all matching opportunities
    const countSoql = `
      SELECT COUNT(Id) totalCount
      FROM Opportunity
      WHERE IsClosed = false
        AND Target_LOI_Date__c >= ${janStart}
        AND Target_LOI_Date__c <= ${janEnd}
    `;
    
    const [result, countResult] = await Promise.all([
      query(soql, true),
      query(countSoql, true)
    ]);
    
    if (!result || !result.records) {
      return { deals: [], totalACV: 0, totalCount: 0 };
    }
    
    const deals = result.records.map(opp => ({
      id: opp.Id,
      name: opp.Name,
      accountName: opp.Account?.Name || 'Unknown',
      acv: opp.ACV__c || 0,
      weightedACV: opp.Finance_Weighted_ACV__c || 0,
      targetDate: opp.Target_LOI_Date__c,
      stage: opp.StageName,
      owner: opp.Owner?.Name,
      salesType: opp.Sales_Type__c
    }));
    
    const totalACV = deals.reduce((sum, d) => sum + d.acv, 0);
    const totalCount = countResult?.records?.[0]?.totalCount || deals.length;
    
    logger.info(`Top 10 January: ${deals.length} deals (${totalCount} total), $${(totalACV/1000000).toFixed(2)}M`);
    return { deals, totalACV, totalCount };
    
  } catch (error) {
    logger.error('Failed to query top 10 targeting January:', error);
    return { deals: [], totalACV: 0, totalCount: 0 };
  }
}

/**
 * Query Top 10 deals targeting Q1 (Jan-Mar current year)
 * Also returns totalCount of all matching opportunities
 */
async function queryTop10TargetingQ1() {
  try {
    logger.info('Querying top 10 deals targeting Q1...');
    
    const now = new Date();
    const year = now.getFullYear();
    const q1Start = `${year}-01-01`;
    const q1End = `${year}-03-31`;
    
    // Query top 10 deals by ACV
    const soql = `
      SELECT Id, Name, Account.Name, ACV__c, Finance_Weighted_ACV__c, Target_LOI_Date__c, 
             StageName, Owner.Name, Sales_Type__c
      FROM Opportunity
      WHERE IsClosed = false
        AND Target_LOI_Date__c >= ${q1Start}
        AND Target_LOI_Date__c <= ${q1End}
      ORDER BY ACV__c DESC
      LIMIT 10
    `;
    
    // Also query total count of all matching opportunities
    const countSoql = `
      SELECT COUNT(Id) totalCount
      FROM Opportunity
      WHERE IsClosed = false
        AND Target_LOI_Date__c >= ${q1Start}
        AND Target_LOI_Date__c <= ${q1End}
    `;
    
    const [result, countResult] = await Promise.all([
      query(soql, true),
      query(countSoql, true)
    ]);
    
    if (!result || !result.records) {
      return { deals: [], totalACV: 0, totalCount: 0 };
    }
    
    const deals = result.records.map(opp => ({
      id: opp.Id,
      name: opp.Name,
      accountName: opp.Account?.Name || 'Unknown',
      acv: opp.ACV__c || 0,
      weightedACV: opp.Finance_Weighted_ACV__c || 0,
      targetDate: opp.Target_LOI_Date__c,
      stage: opp.StageName,
      owner: opp.Owner?.Name,
      salesType: opp.Sales_Type__c
    }));
    
    const totalACV = deals.reduce((sum, d) => sum + d.acv, 0);
    const totalCount = countResult?.records?.[0]?.totalCount || deals.length;
    
    logger.info(`Top 10 Q1: ${deals.length} deals (${totalCount} total), $${(totalACV/1000000).toFixed(2)}M`);
    return { deals, totalACV, totalCount };
    
  } catch (error) {
    logger.error('Failed to query top 10 targeting Q1:', error);
    return { deals: [], totalACV: 0, totalCount: 0 };
  }
}

/**
 * Query pipeline grouped by Sales Type
 * Returns breakdown: New business, Expansion, Renewal, Eudia Counsel
 * Returns structure expected by PDF: { bySalesType, totalACV, totalWeighted, totalCount }
 */
async function queryPipelineBySalesType() {
  try {
    logger.info('Querying pipeline by Sales Type...');
    
    const soql = `
      SELECT Sales_Type__c, SUM(ACV__c) totalACV, SUM(Finance_Weighted_ACV__c) weightedACV, COUNT(Id) dealCount
      FROM Opportunity
      WHERE IsClosed = false
        AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
      GROUP BY Sales_Type__c
      ORDER BY Sales_Type__c
    `;
    
    const result = await query(soql, true);
    
    // Default empty structure matching PDF expectations
    const emptyResult = { bySalesType: {}, totalACV: 0, totalWeighted: 0, totalCount: 0 };
    
    if (!result || !result.records) {
      return emptyResult;
    }
    
    // First pass: collect raw totals
    let totalACV = 0;
    let totalWeighted = 0;
    let totalCount = 0;
    const rawData = {};
    
    result.records.forEach(row => {
      const salesType = row.Sales_Type__c || 'Unassigned';
      const acv = row.totalACV || 0;
      const weighted = row.weightedACV || 0;
      const count = row.dealCount || 0;
      
      rawData[salesType] = { acv, weighted, count };
      totalACV += acv;
      totalWeighted += weighted;
      totalCount += count;
    });
    
    // Second pass: calculate percentages and build final structure
    const bySalesType = {};
    Object.entries(rawData).forEach(([salesType, data]) => {
      bySalesType[salesType] = {
        acv: data.acv,
        weighted: data.weighted,
        count: data.count,
        acvPercent: totalACV > 0 ? `${Math.round((data.acv / totalACV) * 100)}%` : '0%',
        weightedPercent: totalWeighted > 0 ? `${Math.round((data.weighted / totalWeighted) * 100)}%` : '0%'
      };
    });
    
    logger.info(`Pipeline by Sales Type: ${Object.keys(bySalesType).length} types, $${(totalWeighted/1000000).toFixed(2)}M weighted, ${totalCount} deals`);
    return { bySalesType, totalACV, totalWeighted, totalCount };
    
  } catch (error) {
    logger.error('Failed to query pipeline by Sales Type:', error);
    return { bySalesType: {}, totalACV: 0, totalWeighted: 0, totalCount: 0 };
  }
}

/**
 * Check if date is in current month
 */
function isInCurrentMonth(dateStr) {
  if (!dateStr) return false;
  const targetDate = new Date(dateStr + 'T12:00:00Z');
  const now = new Date();
  return targetDate.getMonth() === now.getMonth() && targetDate.getFullYear() === now.getFullYear();
}

/**
 * Process raw opportunity data into metrics
 */
function processPipelineData(records) {
  // Initialize accumulators
  const blMetrics = {};
  const proposalDeals = [];
  const allDeals = []; // All active pipeline deals for Top 5 section
  let totalGrossACV = 0;
  let totalWeightedACV = 0;
  let totalWeightedThisQuarter = 0;
  const allAccountIds = new Set();
  
  // Revenue type tracking
  let recurringACV = 0;
  let projectACV = 0;
  
  // Stage breakdown with weighted
  const stageBreakdown = {};
  ACTIVE_STAGES.forEach(s => {
    stageBreakdown[s] = { count: 0, grossACV: 0, weightedACV: 0 };
  });
  
  records.forEach(opp => {
    const ownerName = opp.Owner?.Name;
    const accountId = opp.AccountId;
    const accountName = opp.Account?.Name || 'Unknown';
    const acv = opp.ACV__c || 0;
    const weightedAcv = opp.Weighted_ACV__c || 0;
    const stageName = opp.StageName;
    const targetDate = opp.Target_LOI_Date__c;
    const productLine = opp.Product_Line__c || '';
    
    if (!ownerName) return;
    
    // Track all unique accounts
    allAccountIds.add(accountId);
    
    // Add to totals
    totalGrossACV += acv;
    totalWeightedACV += weightedAcv;
    
    // Track stage breakdown (with weighted)
    if (stageBreakdown[stageName]) {
      stageBreakdown[stageName].count++;
      stageBreakdown[stageName].grossACV += acv;
      stageBreakdown[stageName].weightedACV += weightedAcv;
    }
    
    // Add to weighted this quarter if target date is between today and fiscal quarter end
    if (isInCurrentFiscalQuarter(targetDate)) {
      totalWeightedThisQuarter += weightedAcv;
    }
    
    // Initialize BL if not exists
    if (!blMetrics[ownerName]) {
      blMetrics[ownerName] = {
        accounts: new Set(),
        opportunities: 0,
        grossACV: 0,
        weightedACV: 0
      };
    }
    
    // Add to BL metrics (including weighted)
    blMetrics[ownerName].accounts.add(accountId);
    blMetrics[ownerName].opportunities++;
    blMetrics[ownerName].grossACV += acv;
    blMetrics[ownerName].weightedACV += weightedAcv;
    
    // Track all deals for Top 5 section (all stages, sorted by target date)
    allDeals.push({
      accountName,
      acv,
      weightedAcv,
      targetDate,
      productLine,
      stageName,
      ownerName,
      ownerFirstName: ownerName.split(' ')[0]
    });
    
    // Collect proposal stage deals (Stage 4)
    if (stageName === PROPOSAL_STAGE) {
      proposalDeals.push({
        accountName,
        acv,
        weightedAcv,
        targetDate,
        productLine,
        ownerName,
        ownerFirstName: ownerName.split(' ')[0]
      });
    }
  });
  
  // Convert BL Sets to counts
  const finalBLMetrics = {};
  Object.entries(blMetrics).forEach(([bl, data]) => {
    finalBLMetrics[bl] = {
      accounts: data.accounts.size,
      opportunities: data.opportunities,
      grossACV: data.grossACV,
      weightedACV: data.weightedACV
    };
  });
  
  // Sort proposal deals by target date (soonest first)
  proposalDeals.sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });
  
  // Sort all deals by target date for Top 5 section
  allDeals.sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });
  
  // Calculate proposal stage totals
  const proposalGrossACV = proposalDeals.reduce((sum, d) => sum + d.acv, 0);
  
  // Calculate proposal targeting this month vs this quarter
  const proposalThisMonth = proposalDeals.filter(d => isInCurrentMonth(d.targetDate));
  const proposalThisQuarter = proposalDeals.filter(d => isInCurrentFiscalQuarter(d.targetDate));
  
  return {
    blMetrics: finalBLMetrics,
    proposalDeals,
    allDeals, // All deals for Top 5 section
    proposalThisMonth, // Include for PDF
    stageBreakdown,
    totals: {
      grossACV: totalGrossACV,
      weightedACV: totalWeightedACV,
      weightedThisQuarter: totalWeightedThisQuarter,
      totalOpportunities: records.length,
      totalAccounts: allAccountIds.size,
      avgDealSize: records.length > 0 ? totalGrossACV / records.length : 0,
      proposalCount: proposalDeals.length,
      proposalGrossACV,
      // This month targeting
      proposalThisMonthCount: proposalThisMonth.length,
      proposalThisMonthACV: proposalThisMonth.reduce((sum, d) => sum + d.acv, 0),
      proposalThisMonthWeightedACV: proposalThisMonth.reduce((sum, d) => sum + d.weightedAcv, 0),
      // This quarter targeting
      proposalThisQuarterCount: proposalThisQuarter.length,
      proposalThisQuarterGrossACV: proposalThisQuarter.reduce((sum, d) => sum + d.acv, 0),
      proposalThisQuarterWeightedACV: proposalThisQuarter.reduce((sum, d) => sum + d.weightedAcv, 0)
    },
    fiscalQuarterLabel: getFiscalQuarterLabel()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format product line name for display
 * Replaces underscores with dashes (e.g., "Contracting_Managed" → "Contracting-Managed")
 */
function formatProductLine(productLine) {
  if (!productLine) return 'N/A';
  return productLine.replace(/_/g, '-');
}

// PDF Design constants - matches gtm-snapshot-fixed.html exactly
const GREEN_ACCENT = '#10b981';   // Pod titles, targeting box, gradient start
const BLUE_ACCENT = '#3b82f6';    // Gradient end
const DARK_TEXT = '#1a1a1a';      // Headers, values
const MEDIUM_TEXT = '#333333';    // Labels, subtexts - Changed from #666666 for better readability
const LIGHT_TEXT = '#999999';     // Footer, muted text
const BODY_TEXT = '#333333';      // Table content
const BORDER_GRAY = '#e5e5e5';    // Table header borders
const LIGHT_BORDER = '#f3f4f6';   // Table row borders
const GREEN_BG = '#f0fdf4';       // Targeting box background

/**
 * Generate Page 1: RevOps Summary
 * Includes: Run-Rate Forecast, Signed Revenue QTD/Weekly, Top 10 Pipeline, Pipeline by Sales Type
 * 
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {Object} revOpsData - Data for Page 1 sections
 * @param {string} dateStr - Display date string
 * @returns {number} Final y position after rendering
 */
function generatePage1RevOpsSummary(doc, revOpsData, dateStr) {
  const {
    runRateHistorical,
    januaryClosedWon,
    q4WeightedPipeline,
    signedQTD,
    signedLastWeek,
    top10January,
    top10Q1,
    pipelineBySalesType
  } = revOpsData;
  
  // Page dimensions
  const LEFT = 40;
  const PAGE_WIDTH = 532;
  const RIGHT = LEFT + PAGE_WIDTH;
  const MID = LEFT + PAGE_WIDTH / 2;
  const SECTION_GAP = 14;
  
  // Fonts
  const fontRegular = 'Helvetica';
  const fontBold = 'Helvetica-Bold';
  
  let y = 30;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - Title and date
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Add Eudia logo centered
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
  
  // Subtitle
  doc.font(fontBold).fontSize(16).fillColor(DARK_TEXT);
  doc.text('RevOps Weekly Update', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
  y += 22;
  
  // Date
  doc.font(fontRegular).fontSize(12).fillColor(DARK_TEXT);
  doc.text(dateStr, LEFT, y, { width: PAGE_WIDTH, align: 'center' });
  y += 16;
  
  // Gradient line
  const grad = doc.linearGradient(LEFT, y, RIGHT, y);
  grad.stop(0, GREEN_ACCENT).stop(1, BLUE_ACCENT);
  doc.rect(LEFT, y, PAGE_WIDTH, 2).fill(grad);
  y += 2 + SECTION_GAP;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RUN-RATE FORECAST TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  const runRateY = y;
  const runRateWidth = 260;  // Increased from 220 for subtext
  const col1Width = 175;     // First column (Month labels + subtext)
  const col2Width = runRateWidth - col1Width;  // Second column (values)
  
  // Header
  doc.rect(LEFT, y, runRateWidth, 22).fill('#1f2937');
  doc.font(fontBold).fontSize(10).fillColor('#ffffff');
  doc.text('RUN-RATE FORECAST ($)', LEFT + 8, y + 6);
  
  // Column headers
  y += 22;
  doc.rect(LEFT, y, col1Width, 18).fill('#374151');
  doc.rect(LEFT + col1Width, y, col2Width, 18).fill('#374151');
  doc.font(fontBold).fontSize(9).fillColor('#ffffff');
  doc.text('Month', LEFT + 8, y + 5);
  doc.text('RR ($)', LEFT + col1Width + 8, y + 5);
  y += 18;
  
  // Historical rows
  const months = ['August', 'September', 'October', 'November', 'December'];
  doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
  
  months.forEach((month, i) => {
    const bg = i % 2 === 0 ? '#f9fafb' : '#ffffff';
    doc.rect(LEFT, y, runRateWidth, 16).fill(bg);
    doc.fillColor(DARK_TEXT);
    doc.text(month, LEFT + 8, y + 4);
    doc.text(`${runRateHistorical[month] || 0}m`, LEFT + col1Width + 8, y + 4);
    y += 16;
  });
  
  // January row - highlighted (green background) - increased height for subtext
  // Shows Closed Won New Business deals this month
  doc.rect(LEFT, y, runRateWidth, 28).fill('#dcfce7');
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text('January', LEFT + 8, y + 5);
  doc.font(fontRegular).fontSize(7).fillColor('#6b7280');
  doc.text('New Business Closed Won only', LEFT + 8, y + 16);
  const janValue = (januaryClosedWon?.totalACV || 0) / 1000000;
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text(`${janValue.toFixed(1)}m`, LEFT + col1Width + 8, y + 10);
  y += 28;
  
  // + Q4 Weighted Pipeline row - highlighted - increased height for subtext
  // Shows sum of all active pipeline weighted ACV
  doc.rect(LEFT, y, runRateWidth, 28).fill('#dcfce7');
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text('+ Q4 Weighted Pipeline', LEFT + 8, y + 5);
  doc.font(fontRegular).fontSize(7).fillColor('#6b7280');
  doc.text('New Business + Expansion wtd ACV', LEFT + 8, y + 16);
  const q4Value = (q4WeightedPipeline?.weightedACV || 0) / 1000000;
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text(`${q4Value.toFixed(1)}m`, LEFT + col1Width + 8, y + 10);
  y += 28;
  
  // FY2025E Total row - dark
  // Formula: December (20.1m) + January Closed Won New Business + Q4 Weighted Pipeline
  doc.rect(LEFT, y, runRateWidth, 22).fill('#1f2937');
  doc.font(fontBold).fontSize(10).fillColor('#ffffff');
  doc.text('FY2025E Total', LEFT + 8, y + 6);
  const fy2025Total = (runRateHistorical['December'] || 20.1) + janValue + q4Value;
  doc.text(`${fy2025Total.toFixed(1)}m*`, LEFT + col1Width + 8, y + 6);
  y += 22;
  
  // Note
  y += 4;
  doc.font(fontRegular).fontSize(7).fillColor('#9ca3af');
  doc.text('Note: This week\'s forecast reflects post-migration reconciliation of EU data, including contract-level review and revenue segmentation. Renewal attribution remains subject to further review.', LEFT, y, { width: runRateWidth });
  
  const runRateEndY = y + 24;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNED REVENUE QTD (Right column, same row as Run-Rate)
  // ═══════════════════════════════════════════════════════════════════════════
  const signedX = LEFT + runRateWidth + 20;
  const signedWidth = PAGE_WIDTH - runRateWidth - 20;
  y = runRateY;
  
  // Signed Revenue QTD header
  doc.rect(signedX, y, signedWidth, 22).fill('#1f2937');
  doc.font(fontBold).fontSize(10).fillColor('#ffffff');
  doc.text('SIGNED REVENUE QTD', signedX + 8, y + 6);
  y += 22;
  
  // Total signed box - font sizes match header (10pt)
  doc.rect(signedX, y, signedWidth, 36).fill('#f3f4f6');
  doc.strokeColor('#e5e7eb').lineWidth(1).rect(signedX, y, signedWidth, 36).stroke();
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text(`TOTAL SIGNED (${signedQTD.totalDeals} deals)`, signedX + 10, y + 8);
  doc.font(fontBold).fontSize(12).fillColor(DARK_TEXT);
  const qtdValue = signedQTD.totalACV >= 1000000 
    ? `$${(signedQTD.totalACV / 1000000).toFixed(1)}m`
    : `$${(signedQTD.totalACV / 1000).toFixed(0)}k`;
  doc.text(qtdValue, signedX + 10, y + 21);
  y += 36;
  
  // Signed Revenue since last week
  y += 8;
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text('Signed Revenue since last week', signedX, y);
  y += 14;
  
  // Weekly signed box
  const weeklyValue = signedLastWeek.totalACV >= 1000000
    ? `$${(signedLastWeek.totalACV / 1000000).toFixed(1)}m`
    : `$${(signedLastWeek.totalACV / 1000).toFixed(0)}k`;
  
  doc.rect(signedX, y, signedWidth, 32).fill('#f3f4f6');
  doc.strokeColor('#e5e7eb').lineWidth(1).rect(signedX, y, signedWidth, 32).stroke();
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text(`TOTAL SIGNED (${signedLastWeek.totalDeals} deals | ${weeklyValue})`, signedX + 10, y + 6);
  
  // Kudos line (first 2 owners)
  const owners = [...new Set(signedLastWeek.deals.map(d => d.ownerName?.split(' ')[0]).filter(Boolean))].slice(0, 2);
  if (owners.length > 0) {
    doc.font(fontRegular).fontSize(9).fillColor('#6b7280');
    doc.text(`#kudos @${owners.join(' + @')}`, signedX + 10, y + 19);
  }
  y += 32;
  
  // Revenue type breakdown - improved spacing to prevent text overlap
  y += 10;
  Object.entries(signedLastWeek.byRevenueType || {}).forEach(([type, data]) => {
    if (data.deals.length > 0) {
      // Section header (9pt bold)
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text(`${type.toUpperCase()} (${data.deals.length})`, signedX, y);
      y += 14;
      
      // Show top deals for this type (8pt regular, clean compact format)
      data.deals.slice(0, 2).forEach(deal => {
        const dealValue = deal.acv >= 1000000 
          ? `$${(deal.acv / 1000000).toFixed(1)}m`
          : `$${(deal.acv / 1000).toFixed(0)}k`;
        // Truncate account name to 10 chars for compact display (reduced to prevent overlap)
        const name = deal.accountName.length > 10 ? deal.accountName.substring(0, 10) + '...' : deal.accountName;
        // Format product line: replace underscores with dashes, truncate to 15 chars
        let formattedProductLine = formatProductLine(deal.productLine);
        if (formattedProductLine.length > 15) {
          formattedProductLine = formattedProductLine.substring(0, 15) + '...';
        }
        // Compact format: remove salesType (redundant with RECURRING/PROJECT header)
        doc.font(fontRegular).fontSize(8).fillColor(BODY_TEXT);
        doc.text(`• ${dealValue}, ${name} | ${formattedProductLine}`, signedX + 4, y);
        y += 14;
      });
      y += 10; // Increased from 6 for better section separation
    }
  });
  
  const signedEndY = y;
  y = Math.max(runRateEndY, signedEndY) + SECTION_GAP;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OPPORTUNITIES WITH Q4 TARGET SIGN DATE
  // ═══════════════════════════════════════════════════════════════════════════
  doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
  doc.text('Opportunities with Q4 Target Sign Date', LEFT, y);
  y += 16;
  
  // Two columns: Targeting January (left) + Targeting Q1 (right)
  const oppColWidth = (PAGE_WIDTH - 20) / 2;
  const oppLeftX = LEFT;
  const oppRightX = MID + 10;
  
  // Left column: TARGETING JANUARY
  let leftY = y;
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text(`TARGETING JANUARY (${top10January.totalCount})`, oppLeftX, leftY);
  leftY += 12;
  doc.font(fontRegular).fontSize(8).fillColor('#6b7280');
  doc.text('Q4 Deals & aggregate open ACV by Account', oppLeftX, leftY);
  leftY += 14;
  
  // Top 10 list for January
  doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
  top10January.deals.slice(0, 10).forEach((deal, i) => {
    const value = deal.acv >= 1000000 
      ? `$${(deal.acv / 1000000).toFixed(1)}m`
      : `$${(deal.acv / 1000).toFixed(0)}k`;
    const name = deal.accountName.length > 22 ? deal.accountName.substring(0, 22) + '...' : deal.accountName;
    doc.text(`${i + 1}. ${value}, ${name}`, oppLeftX, leftY);
    leftY += 11;
  });
  
  // Right column: TARGETING Q1 FY2026
  let rightY = y;
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text('TARGETING Q1 FY2026 CLOSE', oppRightX, rightY);
  rightY += 14;
  
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text('TOP 10 OPPORTUNITIES (ACV)', oppRightX, rightY);
  rightY += 12;
  
  // Top 10 list for Q1
  doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
  top10Q1.deals.slice(0, 10).forEach((deal, i) => {
    const value = deal.acv >= 1000000 
      ? `$${(deal.acv / 1000000).toFixed(1)}m`
      : `$${(deal.acv / 1000).toFixed(0)}k`;
    const name = deal.accountName.length > 22 ? deal.accountName.substring(0, 22) + '...' : deal.accountName;
    doc.text(`${i + 1}. ${value}, ${name}`, oppRightX, rightY);
    rightY += 11;
  });
  
  // Q1 Summary line
  rightY += 6;
  doc.font(fontBold).fontSize(8).fillColor(GREEN_ACCENT);
  const q1AcvValue = top10Q1.totalACV >= 1000000 
    ? `$${(top10Q1.totalACV / 1000000).toFixed(1)}m`
    : `$${(top10Q1.totalACV / 1000).toFixed(0)}k`;
  doc.text(`Q1 FY2026: (${top10Q1.totalCount}) opportunities $300K+, totaling ${q1AcvValue} in ACV potential`, oppRightX, rightY);
  
  y = Math.max(leftY, rightY) + SECTION_GAP + 4;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE TARGETING SIGNATURE IN JANUARY - By Sales Type
  // ═══════════════════════════════════════════════════════════════════════════
  doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
  doc.text('PIPELINE TARGETING SIGNATURE IN JANUARY', LEFT, y);
  y += 16;
  
  doc.font(fontBold).fontSize(10).fillColor(DARK_TEXT);
  doc.text('By Sales Type', LEFT, y);
  y += 14;
  
  // Sales Type table
  const salesTypeTableWidth = PAGE_WIDTH;
  
  // Header row
  doc.rect(LEFT, y, salesTypeTableWidth, 20).fill('#1f2937');
  doc.font(fontBold).fontSize(9).fillColor('#ffffff');
  doc.text('Sales Type', LEFT + 8, y + 6, { width: 160 });
  doc.text('ACV (%)', LEFT + 180, y + 6, { width: 100, align: 'center' });
  doc.text('Wtd ACV (%)', LEFT + 300, y + 6, { width: 100, align: 'center' });
  doc.text('Count', LEFT + 420, y + 6, { width: 80, align: 'center' });
  y += 20;
  
  // Data rows - ordered: New business, Expansion, Renewal
  const salesTypeOrder = ['New business', 'Expansion', 'Renewal'];
  const { bySalesType, totalACV: salesTypeTotalACV, totalWeighted: salesTypeTotalWeighted, totalCount: salesTypeTotalCount } = pipelineBySalesType;
  
  doc.font(fontRegular).fontSize(9).fillColor(DARK_TEXT);
  
  salesTypeOrder.forEach((type, i) => {
    const data = bySalesType[type] || { acv: 0, weighted: 0, count: 0, acvPercent: 0, weightedPercent: 0 };
    const bg = i % 2 === 0 ? '#f9fafb' : '#ffffff';
    doc.rect(LEFT, y, salesTypeTableWidth, 18).fill(bg);
    doc.fillColor(DARK_TEXT);
    doc.text(type, LEFT + 8, y + 5, { width: 160 });
    
    const acvStr = data.acv >= 1000000 
      ? `${(data.acv / 1000000).toFixed(1)}m (${data.acvPercent})`
      : `${(data.acv / 1000).toFixed(0)}k (${data.acvPercent})`;
    const wtdStr = data.weighted >= 1000000
      ? `${(data.weighted / 1000000).toFixed(1)}m (${data.weightedPercent})`
      : `${(data.weighted / 1000).toFixed(0)}k (${data.weightedPercent})`;
    
    doc.text(acvStr, LEFT + 180, y + 5, { width: 100, align: 'center' });
    doc.text(wtdStr, LEFT + 300, y + 5, { width: 100, align: 'center' });
    doc.text(data.count.toString(), LEFT + 420, y + 5, { width: 80, align: 'center' });
    y += 18;
  });
  
  // Total row
  doc.rect(LEFT, y, salesTypeTableWidth, 20).fill('#e5e7eb');
  doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
  doc.text('Total', LEFT + 8, y + 6, { width: 160 });
  
  const totalAcvStr = salesTypeTotalACV >= 1000000 
    ? `${(salesTypeTotalACV / 1000000).toFixed(1)}m`
    : `${(salesTypeTotalACV / 1000).toFixed(0)}k`;
  const totalWtdStr = salesTypeTotalWeighted >= 1000000
    ? `${(salesTypeTotalWeighted / 1000000).toFixed(1)}m*`
    : `${(salesTypeTotalWeighted / 1000).toFixed(0)}k*`;
  
  doc.text(totalAcvStr, LEFT + 180, y + 6, { width: 100, align: 'center' });
  doc.text(totalWtdStr, LEFT + 300, y + 6, { width: 100, align: 'center' });
  doc.text(salesTypeTotalCount.toString(), LEFT + 420, y + 6, { width: 80, align: 'center' });
  y += 20;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════
  y += 10;
  doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
  
  doc.font(fontRegular).fontSize(7).fillColor(LIGHT_TEXT);
  doc.text('Generated by Eudia GTM Brain • www.eudia.com • Internal use only', LEFT, y + 4, { width: PAGE_WIDTH, align: 'center' });
  
  return y + 20;
}

/**
 * Generate professional PDF snapshot - COMPACT ONE-PAGE VERSION
 * All typography and spacing optimized to fit on single Letter page
 * 
 * @param {Object} activeRevenue - Active revenue data from queryActiveRevenue()
 *   Contains recurringACV and projectACV for contracts still in term
 */
function generatePDFSnapshot(pipelineData, dateStr, activeRevenue = {}, logosByType = {}, revOpsData = null) {
  return new Promise((resolve, reject) => {
    try {
      const { blMetrics, stageBreakdown, totals, fiscalQuarterLabel, proposalThisMonth, allDeals } = pipelineData;
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE SETUP - Letter size, tight margins for maximum content
      // ═══════════════════════════════════════════════════════════════════════
      const doc = new PDFDocument({ 
        size: 'LETTER',  // 612 x 792 points
        margins: { top: 30, bottom: 25, left: 40, right: 40 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: RevOps Summary (if data provided)
      // ═══════════════════════════════════════════════════════════════════════
      if (revOpsData) {
        generatePage1RevOpsSummary(doc, revOpsData, dateStr);
        doc.addPage(); // Add page break before GTM Snapshot
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: GTM Weekly Snapshot (existing content)
      // ═══════════════════════════════════════════════════════════════════════
      
      // Page dimensions - COMPACT
      const LEFT = 40;
      const PAGE_WIDTH = 532;  // 612 - 40 - 40
      const MID = LEFT + PAGE_WIDTH / 2;
      const halfWidth = PAGE_WIDTH / 2 - 10;
      const RIGHT_COL = MID + 10;
      const SECTION_GAP = 10;  // Reduced from 30 to 10
      
      // Fonts
      const fontRegular = 'Helvetica';
      const fontBold = 'Helvetica-Bold';
      
      let y = 30;  // Start position
      
      // ═══════════════════════════════════════════════════════════════════════
      // HEADER - Logo + title + date + gradient line
      // ═══════════════════════════════════════════════════════════════════════
      
      // Add Eudia logo centered - use fit to preserve aspect ratio
      const logoPath = path.join(__dirname, '../../assets/eudia-logo.jpg');
      const logoWidth = 160;  // Wider logo for proper visibility
      // Center calculation: page center is at LEFT + PAGE_WIDTH/2, logo center should be at logoX + logoWidth/2
      const pageCenter = LEFT + (PAGE_WIDTH / 2);
      const logoX = pageCenter - (logoWidth / 2);  // Properly center the logo
      
      try {
        if (fs.existsSync(logoPath)) {
          // Use 'fit' to preserve aspect ratio - logo will scale proportionally
          doc.image(logoPath, logoX, y, { fit: [logoWidth, 50], align: 'center' });
          y += 38;  // Space after logo (logo height ~25px at this scale)
        } else {
          // Fallback to text if logo not found
          doc.font(fontBold).fontSize(24).fillColor(DARK_TEXT);
          doc.text('EUDIA', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
          y += 28;
        }
      } catch (logoErr) {
        // Fallback to text
        doc.font(fontBold).fontSize(24).fillColor(DARK_TEXT);
        doc.text('EUDIA', LEFT, y, { width: PAGE_WIDTH, align: 'center' });
        y += 28;
      }
      
      // Add spacing before gradient line (no duplicate title - title is on Page 1 only)
      y += 6;
      
      // Gradient line (green to blue) - visual separator for Page 2
      const gradientY = y;
      const grad = doc.linearGradient(LEFT, gradientY, LEFT + PAGE_WIDTH, gradientY);
      grad.stop(0, GREEN_ACCENT).stop(1, BLUE_ACCENT);
      doc.rect(LEFT, gradientY, PAGE_WIDTH, 2).fill(grad);
      y += 2 + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP METRICS - 4 columns (removed BY REVENUE TYPE), COMPACT typography
      // ═══════════════════════════════════════════════════════════════════════
      const metricsY = y;
      const colWidth = PAGE_WIDTH / 4;  // 4 columns now
      
      // Calculate logos (aligned with accountDashboard.js)
      // Use Customer_Subtype__c = Existing as the top-level count
      const existingCount = (logosByType.existing || []).length;
      const msaCount = (logosByType.msa || []).length;
      const pilotCount = (logosByType.pilot || []).length;
      const loiCount = (logosByType.loi || []).length;
      
      // Column 1: Pipeline Overview - Total Gross ACV
      let colX = LEFT;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('PIPELINE OVERVIEW', colX, metricsY);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Total Gross ACV', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.grossACV), colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(`${totals.totalOpportunities} opps • ${totals.totalAccounts} accts`, colX, metricsY + 42);
      
      // Column 2: Weighted Pipeline
      colX = LEFT + colWidth;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Weighted Pipeline', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.weightedThisQuarter), colX, metricsY + 22);
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text(fiscalQuarterLabel, colX, metricsY + 42);
      
      // Column 3: Avg Deal Size
      colX = LEFT + colWidth * 2;
      doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);
      doc.text('Avg Deal Size', colX, metricsY + 12);
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(formatCurrency(totals.avgDealSize), colX, metricsY + 22);
      
      // Column 4: Current Logos - Shows Existing count with MSA/Pilot/LOI breakdown
      colX = LEFT + colWidth * 3;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('CURRENT LOGOS', colX, metricsY, { width: colWidth, align: 'center' });
      doc.font(fontBold).fontSize(18).fillColor(DARK_TEXT);
      doc.text(existingCount.toString(), colX, metricsY + 12, { width: colWidth, align: 'center' });
      doc.font(fontRegular).fontSize(7).fillColor(DARK_TEXT);
      doc.text(`MSA: ${msaCount} • Pilot: ${pilotCount} • LOI: ${loiCount}`, colX, metricsY + 32, { width: colWidth, align: 'center' });
      
      // Add extra spacing after header section (quarter inch = ~18 points)
      y = metricsY + 48 + SECTION_GAP + 18;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TWO COLUMN SECTION: Stage Distribution (left) + Proposal Stage (right)
      // ═══════════════════════════════════════════════════════════════════════
      const twoColY = y;
      
      // LEFT: Stage Distribution
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('STAGE DISTRIBUTION', LEFT, twoColY);
      
      // Table header
      let tableY = twoColY + 14;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Stage', LEFT, tableY);
      doc.text('Deals', LEFT + 100, tableY, { width: 30, align: 'right' });
      doc.text('Gross ACV', LEFT + 135, tableY, { width: 50, align: 'right' });
      doc.text('Weighted', LEFT + 190, tableY, { width: 45, align: 'right' });
      
      tableY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, tableY).lineTo(LEFT + halfWidth, tableY).stroke();
      tableY += 5;
      
      // Table rows - increased font for readability
      const stageOrder = [...ACTIVE_STAGES].reverse();
      doc.font(fontRegular).fontSize(10).fillColor(DARK_TEXT);
      stageOrder.forEach(stage => {
        const data = stageBreakdown[stage] || { count: 0, grossACV: 0, weightedACV: 0 };
        const stageLabel = stage.replace('Stage ', 'S').replace(' - ', ' ');
        doc.text(stageLabel, LEFT, tableY);
        doc.text(data.count.toString(), LEFT + 100, tableY, { width: 30, align: 'right' });
        doc.text(formatCurrency(data.grossACV), LEFT + 135, tableY, { width: 50, align: 'right' });
        doc.text(formatCurrency(data.weightedACV), LEFT + 190, tableY, { width: 45, align: 'right' });
        tableY += 11;
      });
      
      // RIGHT: Proposal Stage (S4)
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('PROPOSAL STAGE (S4)', RIGHT_COL, twoColY);
      
      // Proposal table header
      let propTableY = twoColY + 14;
      doc.font(fontBold).fontSize(9).fillColor(DARK_TEXT);
      doc.text('Metric', RIGHT_COL, propTableY);
      doc.text('Deals', RIGHT_COL + 80, propTableY, { width: 30, align: 'right' });
      doc.text('Gross ACV', RIGHT_COL + 115, propTableY, { width: 50, align: 'right' });
      doc.text('Wtd ACV', RIGHT_COL + 170, propTableY, { width: 45, align: 'right' });
      
      propTableY += 11;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(RIGHT_COL, propTableY).lineTo(LEFT + PAGE_WIDTH, propTableY).stroke();
      propTableY += 5;
      
      // Proposal rows - increased font for readability
      doc.font(fontRegular).fontSize(10).fillColor(DARK_TEXT);
      const s4Data = stageBreakdown['Stage 4 - Proposal'] || { weightedACV: 0 };
      
      // Total
      doc.text('Total', RIGHT_COL, propTableY);
      doc.text(totals.proposalCount.toString(), RIGHT_COL + 80, propTableY, { width: 30, align: 'right' });
      doc.text(formatCurrency(totals.proposalGrossACV), RIGHT_COL + 115, propTableY, { width: 50, align: 'right' });
      doc.text(formatCurrency(s4Data.weightedACV), RIGHT_COL + 170, propTableY, { width: 45, align: 'right' });
      propTableY += 11;
      
      // This Month
      doc.text('This Month', RIGHT_COL, propTableY);
      doc.text(totals.proposalThisMonthCount.toString(), RIGHT_COL + 80, propTableY, { width: 30, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisMonthACV), RIGHT_COL + 115, propTableY, { width: 50, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisMonthWeightedACV || 0), RIGHT_COL + 170, propTableY, { width: 45, align: 'right' });
      propTableY += 11;
      
      // This Quarter
      doc.text('This Quarter', RIGHT_COL, propTableY);
      doc.text(totals.proposalThisQuarterCount.toString(), RIGHT_COL + 80, propTableY, { width: 30, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisQuarterGrossACV), RIGHT_COL + 115, propTableY, { width: 50, align: 'right' });
      doc.text(formatCurrency(totals.proposalThisQuarterWeightedACV || 0), RIGHT_COL + 170, propTableY, { width: 45, align: 'right' });
      propTableY += 12;
      
      // Targeting This Month box - COMPACT
      if (proposalThisMonth && proposalThisMonth.length > 0) {
        const boxX = RIGHT_COL;
        const boxY = propTableY;
        const boxWidth = PAGE_WIDTH / 2 - 5;
        const dealsToShow = proposalThisMonth.slice(0, 5);
        const boxHeight = dealsToShow.length * 9 + 18;
        
        // Green background
        doc.rect(boxX, boxY, boxWidth, boxHeight).fill(GREEN_BG);
        // Green left border
        doc.rect(boxX, boxY, 2, boxHeight).fill(GREEN_ACCENT);
        
        // Title
        doc.font(fontBold).fontSize(7).fillColor(GREEN_ACCENT);
        doc.text('TARGETING THIS MONTH', boxX + 8, boxY + 4);
        
        // Deal list - COMPACT
        doc.font(fontRegular).fontSize(7).fillColor(BODY_TEXT);
        let dealY = boxY + 14;
        dealsToShow.forEach(d => {
          const name = d.accountName.length > 20 ? d.accountName.substring(0, 20) + '...' : d.accountName;
          doc.text(`${name} • ${formatCurrency(d.acv)} • ${formatDate(d.targetDate)}`, boxX + 8, dealY);
          dealY += 9;
        });
        if (proposalThisMonth.length > 5) {
          doc.fillColor(DARK_TEXT);
          doc.text(`+${proposalThisMonth.length - 5} more deals`, boxX + 8, dealY);
        }
        propTableY += boxHeight + 4;
      }
      
      y = Math.max(tableY, propTableY) + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BUSINESS LEAD SUMMARY
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('BUSINESS LEAD SUMMARY', LEFT, y);
      y += 12;
      
      // Helper function to draw BL table - COMPACT
      const drawBLTable = (title, blList, startX, startY, colWidth) => {
        const activeBLs = blList
          .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
          .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
        
        if (activeBLs.length === 0) return startY;
        
        // Pod title (green)
        doc.font(fontBold).fontSize(8).fillColor(GREEN_ACCENT);
        doc.text(title, startX, startY);
        
        // Table header
        let headerY = startY + 10;
        doc.font(fontBold).fontSize(8).fillColor(DARK_TEXT);
        doc.text('Name', startX, headerY);
        doc.text('Accts', startX + 50, headerY, { width: 25, align: 'right' });
        doc.text('Opps', startX + 80, headerY, { width: 25, align: 'right' });
        doc.text('Gross', startX + 110, headerY, { width: 45, align: 'right' });
        doc.text('Wtd', startX + 160, headerY, { width: 40, align: 'right' });
        
        headerY += 9;
        doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(startX, headerY).lineTo(startX + colWidth - 10, headerY).stroke();
        
        let rowY = headerY + 5;
        doc.font(fontRegular).fontSize(8).fillColor(DARK_TEXT);  // Increased from 7 to 8
        activeBLs.forEach(bl => {
          const m = blMetrics[bl];
          const displayName = bl.split(' ')[0];
          doc.text(displayName, startX, rowY);
          doc.text(m.accounts.toString(), startX + 50, rowY, { width: 25, align: 'right' });
          doc.text(m.opportunities.toString(), startX + 80, rowY, { width: 25, align: 'right' });
          doc.text(formatCurrency(m.grossACV), startX + 110, rowY, { width: 45, align: 'right' });
          doc.text(formatCurrency(m.weightedACV), startX + 160, rowY, { width: 40, align: 'right' });
          rowY += 10;  // Increased from 9 to 10 for larger font
        });
        
        return rowY;
      };
      
      const usEndY = drawBLTable('US Pod', US_POD, LEFT, y, halfWidth + 15);
      const euEndY = drawBLTable('EU Pod', EU_POD, RIGHT_COL, y, halfWidth + 15);
      
      y = Math.max(usEndY, euEndY) + SECTION_GAP;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TOP DEALS BY BUSINESS LEAD - COMPACT (4 BLs x 4 deals per column)
      // ═══════════════════════════════════════════════════════════════════════
      doc.font(fontBold).fontSize(11).fillColor(DARK_TEXT);
      doc.text('TOP DEALS BY BUSINESS LEAD', LEFT, y);
      y += 12;
      doc.font(fontRegular).fontSize(8).fillColor('#6b7280');
      doc.text('Sorted by Target Sign Date', LEFT, y);
      y += 10;
      
      // Get deals sorted by target date per BL
      const dealsForTop5 = allDeals || [];
      const dealsByBL = {};
      dealsForTop5.forEach(deal => {
        const blName = deal.ownerFirstName || deal.ownerName?.split(' ')[0] || 'Unknown';
        if (!dealsByBL[blName]) dealsByBL[blName] = [];
        dealsByBL[blName].push(deal);
      });
      
      // Sort by target date and limit to 4 deals per BL
      Object.keys(dealsByBL).forEach(bl => {
        dealsByBL[bl].sort((a, b) => {
          if (!a.targetDate && !b.targetDate) return 0;
          if (!a.targetDate) return 1;
          if (!b.targetDate) return -1;
          return new Date(a.targetDate) - new Date(b.targetDate);
        });
        dealsByBL[bl] = dealsByBL[bl].slice(0, 4);  // Limit to 4 deals
      });
      
      // Sort BLs by total ACV
      const sortedBLs = Object.keys(dealsByBL)
        .map(bl => ({ name: bl, deals: dealsByBL[bl], totalACV: dealsByBL[bl].reduce((sum, d) => sum + (d.acv || 0), 0) }))
        .sort((a, b) => b.totalACV - a.totalACV);
      
      // Split into 2 columns (4 BLs each) - LIMIT TO 4 PER COLUMN
      const leftBLs = sortedBLs.filter((_, i) => i % 2 === 0).slice(0, 4);
      const rightBLs = sortedBLs.filter((_, i) => i % 2 === 1).slice(0, 4);
      
      // Draw BL deals - COMPACT
      const drawDealsColumn = (bls, startX, startY, maxWidth) => {
        let dealY = startY;
        
        bls.forEach(bl => {
          if (bl.deals.length === 0) return;
          
          // BL Name (green) - compact font
          doc.font(fontBold).fontSize(8).fillColor(GREEN_ACCENT);
          doc.text(bl.name, startX, dealY);
          dealY += 10;
          
          // Deals - reduced font size (7pt) to prevent text overflow
          doc.font(fontRegular).fontSize(7).fillColor(DARK_TEXT);
          bl.deals.forEach(deal => {
            // Truncate account names at 18 chars to prevent overflow
            const name = deal.accountName.length > 18 ? deal.accountName.substring(0, 18) + '...' : deal.accountName;
            doc.text(`${name} • ${formatCurrency(deal.acv)} • ${formatDate(deal.targetDate)}`, startX, dealY);
            dealY += 9;
          });
          
          dealY += 6;  // Gap between BLs
        });
        
        return dealY;
      };
      
      const dealsStartY = y;
      const leftEndY = drawDealsColumn(leftBLs, LEFT, dealsStartY, halfWidth);
      const rightEndY = drawDealsColumn(rightBLs, RIGHT_COL, dealsStartY, halfWidth);
      
      y = Math.max(leftEndY, rightEndY);
      
      // ═══════════════════════════════════════════════════════════════════════
      // FOOTER - Compact, simple gray border-top with centered text
      // ═══════════════════════════════════════════════════════════════════════
      const footerY = y + 6;
      doc.strokeColor(BORDER_GRAY).lineWidth(0.5).moveTo(LEFT, footerY).lineTo(LEFT + PAGE_WIDTH, footerY).stroke();
      
      doc.font(fontRegular).fontSize(7).fillColor(LIGHT_TEXT);
      doc.text('Generated by Eudia GTM Brain • www.eudia.com • Internal use only', LEFT, footerY + 4, { width: PAGE_WIDTH, align: 'center' });
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format currency for display (lowercase m and k)
 */
function formatCurrency(amount) {
  if (!amount || amount === 0) return '$0';
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}m`;  // lowercase m
  } else if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}k`;      // lowercase k
  } else {
    return `$${Math.round(amount)}`;
  }
}

/**
 * Format date for display (Dec 20)
 */
function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format change indicator with sign
 */
function formatChange(current, previous) {
  if (previous === undefined || previous === null) {
    return '';
  }
  
  const diff = current - previous;
  if (diff === 0) {
    return ' (+0)';
  } else if (diff > 0) {
    return ` (+${diff})`;
  } else {
    return ` (${diff})`;
  }
}

/**
 * Format ACV change indicator
 */
function formatACVChange(current, previous) {
  if (previous === undefined || previous === null) {
    return '';
  }
  
  const diff = current - previous;
  if (Math.abs(diff) < 1000) {
    return '';
  } else if (diff > 0) {
    return ` (+${formatCurrency(diff)})`;
  } else {
    return ` (${formatCurrency(diff)})`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a single BL line for the message (compact format)
 */
function formatBLLine(blName, current, previous) {
  const currentAccounts = current?.accounts || 0;
  const currentOpps = current?.opportunities || 0;
  const currentACV = current?.grossACV || 0;
  
  const previousAccounts = previous?.accounts;
  const previousOpps = previous?.opportunities;
  const previousACV = previous?.grossACV;
  
  const accountChange = formatChange(currentAccounts, previousAccounts);
  const oppChange = formatChange(currentOpps, previousOpps);
  const acvChange = formatACVChange(currentACV, previousACV);
  
  const firstName = blName.split(' ')[0];
  
  // Use 'accts' for brevity, remove 'gross' to shorten
  return `• ${firstName} — ${currentAccounts} accts${accountChange}, ${currentOpps} opps${oppChange}, ${formatCurrency(currentACV)}${acvChange}`;
}

/**
 * Format proposal deals grouped by BL - vertical scannable format
 * Each BL gets a header line, then indented deal lines
 */
function formatProposalDealsByBL(proposalDeals) {
  if (proposalDeals.length === 0) return '';
  
  // Group by owner first name
  const byOwner = {};
  proposalDeals.forEach(deal => {
    const owner = deal.ownerFirstName;
    if (!byOwner[owner]) {
      byOwner[owner] = [];
    }
    byOwner[owner].push(deal);
  });
  
  // Sort owners by total ACV descending
  const sortedOwners = Object.entries(byOwner)
    .map(([owner, deals]) => ({
      owner,
      deals,
      totalACV: deals.reduce((sum, d) => sum + d.acv, 0)
    }))
    .sort((a, b) => b.totalACV - a.totalACV);
  
  // Format each owner's deals - vertical format
  let output = '';
  sortedOwners.forEach(({ owner, deals }) => {
    const dealCount = deals.length;
    
    // Sort deals by ACV descending for display
    deals.sort((a, b) => b.acv - a.acv);
    
    // BL header line with bold name and deal count
    output += `*${owner}* (${dealCount} ${dealCount === 1 ? 'deal' : 'deals'})\n`;
    
    // Show top deals, each on its own indented line
    const dealsToShow = deals.slice(0, MAX_DEALS_PER_BL);
    dealsToShow.forEach(d => {
      output += `  › ${d.accountName} — ${formatCurrency(d.acv)} — ${formatDate(d.targetDate)}\n`;
    });
    
    // Add "+X more" if needed
    if (deals.length > MAX_DEALS_PER_BL) {
      output += `  › +${deals.length - MAX_DEALS_PER_BL} more\n`;
    }
    
    // Add blank line between BLs for readability
    output += '\n';
  });
  
  return output;
}

/**
 * Format BL line for Slack message
 */
function formatBLLineForSlack(blName, metrics) {
  if (!metrics) return null;
  const firstName = blName.split(' ')[0];
  return `• ${firstName} — ${metrics.accounts} accts, ${metrics.opportunities} opps, ${formatCurrency(metrics.grossACV)}`;
}

/**
 * Format the complete Slack message - blended format with BL details
 */
function formatSlackMessage(pipelineData, previousMetrics, dateStr) {
  const { blMetrics, totals, fiscalQuarterLabel } = pipelineData;
  
  let message = `*Eudia GTM Weekly Snapshot — ${dateStr}*\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // PIPELINE SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════
  message += '*PIPELINE SNAPSHOT*\n';
  message += `Total Gross ACV: ${formatCurrency(totals.grossACV)} (${totals.totalOpportunities} opps across ${totals.totalAccounts} accounts)\n`;
  message += `Weighted Pipeline (${fiscalQuarterLabel}): ${formatCurrency(totals.weightedThisQuarter)}\n`;
  message += `Avg Deal Size: ${formatCurrency(totals.avgDealSize)}\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // PROPOSAL STAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  message += `*PROPOSAL STAGE (S4)* — ${totals.proposalCount} deals, ${formatCurrency(totals.proposalGrossACV)} gross ACV\n`;
  message += `Targeting This Month: ${totals.proposalThisMonthCount} deals, ${formatCurrency(totals.proposalThisMonthACV)} ACV\n`;
  message += `Targeting This Quarter: ${totals.proposalThisQuarterCount} deals, ${formatCurrency(totals.proposalThisQuarterGrossACV)} gross, ${formatCurrency(totals.proposalThisQuarterWeightedACV)} weighted\n\n`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // BY REGION BUSINESS LEAD VIEW
  // ═══════════════════════════════════════════════════════════════════════
  message += '*BY BUSINESS LEAD* _(accounts, opps, gross ACV)_\n\n';
  
  // US Pod
  const usPodBLs = US_POD
    .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (usPodBLs.length > 0) {
    message += '*US Pod*\n';
    usPodBLs.forEach(bl => {
      message += formatBLLineForSlack(bl, blMetrics[bl]) + '\n';
    });
    message += '\n';
  }
  
  // EU Pod
  const euPodBLs = EU_POD
    .filter(bl => blMetrics[bl] && (blMetrics[bl].accounts > 0 || blMetrics[bl].opportunities > 0))
    .sort((a, b) => (blMetrics[b]?.grossACV || 0) - (blMetrics[a]?.grossACV || 0));
  
  if (euPodBLs.length > 0) {
    message += '*EU Pod*\n';
    euPodBLs.forEach(bl => {
      message += formatBLLineForSlack(bl, blMetrics[bl]) + '\n';
    });
    message += '\n';
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PDF REFERENCE
  // ═══════════════════════════════════════════════════════════════════════
  message += '_See attached PDF for full details._';
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sendBLWeeklySummary(app, testMode = false, targetChannel = null) {
  try {
    logger.info('Generating weekly BL summary with PDF...');
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const displayDate = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Query pipeline data from Salesforce
    const records = await queryPipelineData();
    
    // Query signed deals and logos
    const signedRecords = await querySignedDeals();
    const signedData = processSignedDeals(signedRecords);
    const logosByType = await queryLogosByType();
    
    // Query ACTIVE revenue (closed won deals where contract is still active)
    // This calculates: CloseDate + Term >= Today for Recurring/Project deals
    const activeRevenue = await queryActiveRevenue();
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Query Page 1 RevOps Data
    // ═══════════════════════════════════════════════════════════════════════════
    logger.info('Querying Page 1 RevOps data...');
    
    // Query all RevOps data in parallel to minimize API calls
    const [
      januaryClosedWon,
      q4WeightedPipeline,
      signedQTD,
      signedLastWeek,
      top10January,
      top10Q1,
      pipelineBySalesType
    ] = await Promise.all([
      queryJanuaryClosedWonNewBusiness(),
      queryQ4WeightedPipeline(),
      querySignedRevenueQTD(),
      querySignedRevenueLastWeek(),
      queryTop10TargetingJanuary(),
      queryTop10TargetingQ1(),
      queryPipelineBySalesType()
    ]);
    
    // Assemble RevOps data for Page 1
    const revOpsData = {
      runRateHistorical: RUN_RATE_HISTORICAL,
      januaryClosedWon,
      q4WeightedPipeline,
      signedQTD,
      signedLastWeek,
      top10January,
      top10Q1,
      pipelineBySalesType
    };
    
    logger.info('Page 1 RevOps data queried successfully');
    
    // Process into metrics
    const pipelineData = processPipelineData(records);
    
    // Get previous week's snapshot
    const snapshotData = readSnapshots();
    const lastSnapshotDate = getLastSnapshotDate(snapshotData);
    const previousMetrics = lastSnapshotDate ? snapshotData.snapshots[lastSnapshotDate] : null;
    
    logger.info(`Previous snapshot date: ${lastSnapshotDate || 'none'}`);
    
    // Format the condensed Slack message
    const message = formatSlackMessage(pipelineData, previousMetrics, displayDate);
    
    // Generate PDF snapshot with Page 1 RevOps + Page 2 GTM Snapshot
    logger.info('Generating 2-page PDF snapshot...');
    const pdfBuffer = await generatePDFSnapshot(pipelineData, displayDate, activeRevenue, logosByType, revOpsData);
    const pdfFilename = `Eudia_GTM_Weekly_Snapshot_${dateStr}.pdf`;
    
    // Save current snapshot (BL metrics only for comparison)
    saveSnapshot(dateStr, pipelineData.blMetrics);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CHANNEL SELECTION - CRITICAL FOR RESPONDING IN CORRECT LOCATION
    // Priority: targetChannel (from request) > testMode default > GTM_CHANNEL
    // ═══════════════════════════════════════════════════════════════════════════
    logger.info(`📊 Channel selection: targetChannel=${targetChannel}, testMode=${testMode}`);
    
    let channel;
    if (targetChannel) {
      // Use the channel where the request was made
      channel = targetChannel;
      logger.info(`📊 Using targetChannel: ${channel}`);
    } else if (testMode) {
      // Test mode - use TEST_CHANNEL env var or default user
      channel = process.env.TEST_CHANNEL || 'U094AQE9V7D';
      logger.info(`📊 Test mode - using: ${channel}`);
    } else {
      // Production scheduled run - use GTM channel
      channel = GTM_CHANNEL;
      logger.info(`📊 Production mode - using GTM_CHANNEL: ${channel}`);
    }
    
    // For DMs (user IDs start with 'U'), we need to open a conversation first
    // Channel IDs start with 'C' or 'G' and don't need this
    if (channel.startsWith('U')) {
      logger.info(`📊 Channel ${channel} is a user ID - opening DM conversation`);
      const conversation = await app.client.conversations.open({
        users: channel
      });
      channel = conversation.channel.id;
      logger.info(`📊 DM conversation opened: ${channel}`);
    } else {
      logger.info(`📊 Channel ${channel} is a channel ID - posting directly`);
    }
    
    // Upload PDF and send message together
    logger.info(`📊 Uploading PDF to channel: ${channel}`);
    const uploadResult = await app.client.files.uploadV2({
      channel_id: channel,
      file: pdfBuffer,
      filename: pdfFilename,
      title: `Eudia GTM Weekly Snapshot — ${displayDate}`,
      initial_comment: message
    });
    
    logger.info(`✅ Weekly BL summary with PDF sent to ${channel}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // THREADED REPLY: Late-Stage Pipeline Excel (S3 + S4)
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      // Get the message timestamp from the upload result
      const messageTs = uploadResult?.files?.[0]?.shares?.public?.[channel]?.[0]?.ts ||
                        uploadResult?.files?.[0]?.shares?.private?.[channel]?.[0]?.ts;
      
      if (messageTs) {
        logger.info(`📊 Generating Late-Stage Pipeline Excel as threaded reply...`);
        
        const { generateLateStageExcel } = require('./reportToSlack');
        const lateStageResult = await generateLateStageExcel();
        
        if (lateStageResult.buffer && lateStageResult.recordCount > 0) {
          const lateStageFilename = `Eudia_LateStage_Pipeline_${dateStr}.xlsx`;
          
          // Format currency
          const formatCurrency = (amount) => {
            if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
            if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
            return `$${amount.toLocaleString()}`;
          };
          
          // Format late-stage summary message
          let lateStageMessage = `📊 *Late-Stage Pipeline (S3 + S4)*\n\n`;
          lateStageMessage += `*Total:* ${lateStageResult.recordCount} opportunities • ${formatCurrency(lateStageResult.totalACV)} ACV\n\n`;
          lateStageMessage += `*Breakdown:*\n`;
          if (lateStageResult.stage4Count > 0) lateStageMessage += `• Stage 4 - Proposal: ${lateStageResult.stage4Count}\n`;
          if (lateStageResult.stage3Count > 0) lateStageMessage += `• Stage 3 - Pilot: ${lateStageResult.stage3Count}\n`;
          lateStageMessage += `\n*Targeting Signature This Month:* ${lateStageResult.thisMonthCount}\n\n`;
          lateStageMessage += `_See attached Excel for full details by product line._`;
          
          // Upload Late-Stage Excel as threaded reply
          await app.client.files.uploadV2({
            channel_id: channel,
            thread_ts: messageTs,
            file: lateStageResult.buffer,
            filename: lateStageFilename,
            title: `Late-Stage Pipeline (S3+S4) — ${displayDate}`,
            initial_comment: lateStageMessage
          });
          
          logger.info(`✅ Late-Stage Pipeline Excel threaded to GTM snapshot`);
        } else {
          // Post a message if no late-stage opportunities
          await app.client.chat.postMessage({
            channel: channel,
            thread_ts: messageTs,
            text: `📊 *Late-Stage Pipeline (S3 + S4)*\n\nNo Stage 3 or Stage 4 opportunities currently in pipeline.`
          });
          logger.info(`📊 No late-stage opps - posted informational thread`);
        }
      } else {
        logger.warn('📊 Could not get message timestamp for late-stage reply, skipping thread');
      }
    } catch (lateStageError) {
      logger.error('📊 Failed to generate late-stage threaded reply:', lateStageError);
      // Don't throw - the main report was successful
    }
    
    return {
      success: true,
      channel,
      dateStr,
      blCount: Object.keys(pipelineData.blMetrics).length,
      totals: pipelineData.totals,
      fiscalQuarterLabel: pipelineData.fiscalQuarterLabel,
      message,
      pdfFilename
    };
    
  } catch (error) {
    logger.error('Failed to send weekly BL summary:', error);
    throw error;
  }
}

function scheduleBLWeeklySummary(app) {
  cron.schedule('0 9 * * 4', async () => {
    logger.info('Running scheduled BL weekly summary (Thursday 9 AM EST)');
    
    try {
      await sendBLWeeklySummary(app, false);
      logger.info('Scheduled BL weekly summary completed');
    } catch (error) {
      logger.error('Scheduled BL weekly summary failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('BL Weekly Summary scheduled (Thursday 9 AM EST)');
}

async function sendBLSummaryNow(app, testMode = true, targetChannel = null) {
  logger.info(`📊 sendBLSummaryNow called with: testMode=${testMode}, targetChannel=${targetChannel || 'NOT PROVIDED'}`);
  
  // CRITICAL: Ensure targetChannel is passed through correctly
  if (targetChannel) {
    logger.info(`📊 Target channel explicitly set: ${targetChannel} - PDF will be sent here`);
  } else {
    logger.info(`📊 No target channel provided - will use default (testMode=${testMode})`);
  }
  
  return await sendBLWeeklySummary(app, testMode, targetChannel);
}

function getSnapshotData() {
  return readSnapshots();
}

async function queryBLMetrics() {
  const records = await queryPipelineData();
  const pipelineData = processPipelineData(records);
  return pipelineData.blMetrics;
}

module.exports = {
  scheduleBLWeeklySummary,
  sendBLSummaryNow,
  sendBLWeeklySummary,
  queryBLMetrics,
  getSnapshotData,
  formatSlackMessage,
  queryPipelineData,
  processPipelineData,
  getFiscalQuarterEnd,
  getFiscalQuarterLabel,
  isInCurrentFiscalQuarter,
  US_POD,
  EU_POD,
  CAPACITY_ALERT_THRESHOLD
};
