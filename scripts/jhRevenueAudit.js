/**
 * Johnson Hana Revenue Audit - FINAL VALIDATED
 * 
 * Using YTD monthly revenue data to validate and create accurate Data Loader file
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const YTD_FILE = '/Users/keiganpesenti/Desktop/JH YTD Closed Won.csv';
const ALL_CLOSED_WON_FILE = '/Users/keiganpesenti/Desktop/All JH Closed Won.xlsx';
const OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_DataLoader_FINAL.xlsx';

// Parse YTD CSV
function parseYTDData() {
  const content = fs.readFileSync(YTD_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const ytdData = {};
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 17) continue;
    
    const accountName = parts[1];
    const monthlyRevenue = {
      'Jan-25': parseFloat(parts[2]) || 0,
      'Feb-25': parseFloat(parts[3]) || 0,
      'Mar-25': parseFloat(parts[4]) || 0,
      'Apr-25': parseFloat(parts[5]) || 0,
      'May-25': parseFloat(parts[6]) || 0,
      'Jun-25': parseFloat(parts[7]) || 0,
      'Jul-25': parseFloat(parts[8]) || 0,
      'Aug-25': parseFloat(parts[9]) || 0,
      'Sep-25': parseFloat(parts[10]) || 0,
      'Oct-25': parseFloat(parts[11]) || 0,
      'Nov-25': parseFloat(parts[12]) || 0,
      'Dec-25': parseFloat(parts[13]) || 0,
      'Jan-26': parseFloat(parts[14]) || 0,
    };
    
    const projectType = parts[16]?.trim() || 'Recurring';
    
    ytdData[accountName] = {
      accountName,
      monthlyRevenue,
      novRevenue: monthlyRevenue['Nov-25'],
      decRevenue: monthlyRevenue['Dec-25'],
      projectType,
    };
  }
  
  return ytdData;
}

// Account name normalization
function normalizeAccountName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/limited|ltd|llc|inc|plc|ireland|international|unlimited|company|technologies|uk|sciences|payments|europe|trading|services|management|ni|electric|crew|information|pharma|group/g, '')
    .trim();
}

// Mapping from SF account names to YTD account names
const SF_TO_YTD_MAPPING = {
  'Arabic Computer Systems': 'ACS',
  'Bank of Ireland': 'BOI',
  'CommScope Technologies LLC': 'CommScope',
  'Datalex (Ireland) Limited': 'Datalex',
  'Dropbox International Unlimited Company': 'Dropbox',
  'ESB NI/Electric Ireland': 'ESB',
  'Etsy Ireland UC': 'Etsy',
  'Gilead Sciences': 'Gilead',
  'Glanbia Management Services Limited': 'Glanbia',
  'Indeed Ireland Operations Limited': 'Indeed',
  'Kellogg Europe Trading Limited': 'Kellanova',
  'Northern Trust Management Services (Ireland) Limited': 'Northern Trust',
  'Perrigo Pharma': 'Perrigo',
  'Sisk Group': 'Sisk',
  'Stripe Payments Europe Limited': 'Stripe',
  'Taoglas Limited': 'Taoglas',
  'Teamwork Crew Limited T/A Teamwork.com': 'Teamwork',
  'Tiktok Information Technologies UK Limited': 'TikTok',
  'Tinder LLC': 'Tinder',
  'Udemy Ireland Limited': 'Udemy',
  'Uisce Éireann (Irish Water)': 'Irish Water',
  'Gas Networks Ireland': 'GNI',
  'NTMA': 'NTMA',
  'OpenAi': 'OpenAi',
  'Coimisiún na Meán': 'Coimisiún na Meán',
  'Consensys': 'Consensys',
  'Aryza': 'Aryza',
  'Airbnb': 'Airbnb',
  'Airship': 'Airship',
  'Coillte': 'Coillte',
  'Coleman Legal': 'Coleman Legal',
  'Kingspan': 'Kingspan',
  'Hayes': 'Hayes',
  'Creed & McStay': 'Creed McStay',
};

function matchYTDAccount(sfAccountName) {
  if (!sfAccountName) return null;
  
  // Direct mapping
  if (SF_TO_YTD_MAPPING[sfAccountName]) {
    return SF_TO_YTD_MAPPING[sfAccountName];
  }
  
  // Try normalized match
  const sfNormalized = normalizeAccountName(sfAccountName);
  for (const [sf, ytd] of Object.entries(SF_TO_YTD_MAPPING)) {
    if (normalizeAccountName(sf) === sfNormalized) {
      return ytd;
    }
  }
  
  // Return as-is for direct matches
  return sfAccountName;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parts = value.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
  }
  return new Date(value);
}

function calculateEndDate(closeDate, termMonths) {
  if (!closeDate || !termMonths) return null;
  const end = new Date(closeDate);
  end.setMonth(end.getMonth() + Math.round(termMonths));
  return end;
}

async function runFinalAudit() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('JOHNSON HANA REVENUE AUDIT - FINAL VALIDATED');
  console.log('Cross-referencing YTD monthly data with SF opportunities');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  // Parse YTD data
  const ytdData = parseYTDData();
  console.log(`YTD Data loaded: ${Object.keys(ytdData).length} accounts`);
  
  // Calculate totals
  let novTotal = 0;
  let decTotal = 0;
  for (const data of Object.values(ytdData)) {
    if (data.projectType === 'Recurring') {
      novTotal += data.novRevenue;
      decTotal += data.decRevenue;
    }
  }
  console.log(`November RR Total (Recurring): $${novTotal.toLocaleString()}`);
  console.log(`December RR Total (Recurring): $${decTotal.toLocaleString()}\n`);
  
  // Load SF opportunities
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ALL_CLOSED_WON_FILE);
  const worksheet = workbook.worksheets[0];
  
  const today = new Date();
  const allOpps = [];
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const accountName = row.getCell(3).value?.toString() || '';
    const oppName = row.getCell(4).value?.toString() || '';
    const closeDateStr = row.getCell(6).value?.toString() || '';
    const closeDate = parseDate(closeDateStr);
    const acv = parseFloat(row.getCell(7).value) || 0;
    const tcv = parseFloat(row.getCell(8).value) || 0;
    const term = parseFloat(row.getCell(11).value) || 0;
    const oppId = row.getCell(12).value?.toString() || '';
    
    const endDate = calculateEndDate(closeDate, term);
    const isActive = endDate && endDate >= today;
    const ytdAccount = matchYTDAccount(accountName);
    
    allOpps.push({
      accountName,
      oppName,
      closeDateStr,
      closeDate,
      acv,
      tcv,
      term,
      oppId,
      endDate,
      endDateStr: endDate ? endDate.toISOString().split('T')[0] : 'N/A',
      isActive,
      ytdAccount,
    });
  });
  
  console.log(`SF Opportunities loaded: ${allOpps.length}`);
  console.log(`Active opportunities: ${allOpps.filter(o => o.isActive).length}\n`);
  
  // Group active opps by YTD account
  const activeByYTDAccount = {};
  for (const opp of allOpps.filter(o => o.isActive)) {
    const key = opp.ytdAccount || opp.accountName;
    if (!activeByYTDAccount[key]) {
      activeByYTDAccount[key] = [];
    }
    activeByYTDAccount[key].push(opp);
  }
  
  // Analyze each YTD account
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNT-BY-ACCOUNT ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const dataLoaderRows = [];
  
  // Focus on recurring accounts with November revenue
  const recurringAccounts = Object.entries(ytdData)
    .filter(([name, data]) => data.projectType === 'Recurring' && data.novRevenue > 0)
    .sort((a, b) => b[1].novRevenue - a[1].novRevenue);
  
  for (const [ytdAccountName, ytdInfo] of recurringAccounts) {
    const activeOpps = activeByYTDAccount[ytdAccountName] || [];
    const sfActiveACV = activeOpps.reduce((sum, o) => sum + o.acv, 0);
    const targetACV = ytdInfo.novRevenue;
    const gap = sfActiveACV - targetACV;
    
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`${ytdAccountName}`);
    console.log(`${'─'.repeat(100)}`);
    
    // Show YTD trend (last 4 months with values)
    const recentMonths = ['Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25'];
    const trend = recentMonths
      .map(m => `${m}: $${Math.round(ytdInfo.monthlyRevenue[m] || 0).toLocaleString()}`)
      .join(' → ');
    console.log(`  Trend: ${trend}`);
    
    console.log(`  November Target: $${targetACV.toLocaleString()}`);
    console.log(`  SF Active ACV: $${sfActiveACV.toLocaleString()}`);
    console.log(`  Gap: $${gap.toLocaleString()}`);
    
    if (activeOpps.length === 0) {
      console.log(`  ❌ NO ACTIVE OPPS`);
      
      // Find most recent expired opp
      const expiredOpps = allOpps.filter(o => !o.isActive && o.ytdAccount === ytdAccountName);
      if (expiredOpps.length > 0) {
        const mostRecent = expiredOpps.sort((a, b) => (b.closeDate || 0) - (a.closeDate || 0))[0];
        console.log(`  → EXTEND: "${mostRecent.oppName}" (ID: ${mostRecent.oppId})`);
        console.log(`     Set ACV to: $${targetACV.toLocaleString()}, extend term to 12 months`);
        
        dataLoaderRows.push({
          oppId: mostRecent.oppId,
          ytdAccount: ytdAccountName,
          sfAccountName: mostRecent.accountName,
          oppName: mostRecent.oppName,
          currentACV: mostRecent.acv,
          targetACV: targetACV,
          newACV: targetACV,
          currentTerm: mostRecent.term,
          newTerm: 12,
          action: 'EXTEND & UPDATE ACV',
          notes: `Extend end date, set ACV to $${Math.round(targetACV).toLocaleString()}`,
        });
      } else {
        console.log(`  → CREATE NEW RECORD`);
        dataLoaderRows.push({
          oppId: 'CREATE_NEW',
          ytdAccount: ytdAccountName,
          sfAccountName: ytdAccountName,
          oppName: `${ytdAccountName} - RR Revenue`,
          currentACV: 0,
          targetACV: targetACV,
          newACV: targetACV,
          currentTerm: 0,
          newTerm: 12,
          action: 'CREATE NEW',
          notes: `Create new Closed Won opp with ACV $${Math.round(targetACV).toLocaleString()}`,
        });
      }
    } else if (Math.abs(gap) > 100) {
      // Need correction
      console.log(`  Active Opps (${activeOpps.length}):`);
      for (const opp of activeOpps.slice(0, 5)) {
        console.log(`    • ${opp.oppName.substring(0, 45).padEnd(45)} | $${opp.acv.toLocaleString().padStart(12)} | ID: ${opp.oppId}`);
      }
      if (activeOpps.length > 5) {
        console.log(`    ... and ${activeOpps.length - 5} more`);
      }
      
      // Strategy: Adjust the largest active opp to make up the difference
      const sortedOpps = [...activeOpps].sort((a, b) => b.acv - a.acv);
      const primaryOpp = sortedOpps[0];
      const otherOppsACV = sortedOpps.slice(1).reduce((sum, o) => sum + o.acv, 0);
      const newPrimaryACV = targetACV - otherOppsACV;
      
      console.log(`  → UPDATE: "${primaryOpp.oppName.substring(0, 50)}"`);
      console.log(`     Current: $${primaryOpp.acv.toLocaleString()} → New: $${Math.max(0, newPrimaryACV).toLocaleString()}`);
      if (otherOppsACV > 0) {
        console.log(`     (Other opps contribute: $${otherOppsACV.toLocaleString()})`);
      }
      
      dataLoaderRows.push({
        oppId: primaryOpp.oppId,
        ytdAccount: ytdAccountName,
        sfAccountName: primaryOpp.accountName,
        oppName: primaryOpp.oppName,
        currentACV: primaryOpp.acv,
        targetACV: targetACV,
        newACV: Math.max(0, newPrimaryACV),
        currentTerm: primaryOpp.term,
        newTerm: primaryOpp.term,
        otherOppsACV: otherOppsACV,
        action: gap > 0 ? 'REDUCE ACV' : 'INCREASE ACV',
        notes: otherOppsACV > 0 
          ? `Adjust primary. Other opps: $${Math.round(otherOppsACV).toLocaleString()}`
          : `Update ACV to match Nov RR`,
      });
    } else {
      console.log(`  ✅ ALIGNED`);
    }
  }
  
  // Generate Excel
  await generateDataLoaderFile(dataLoaderRows, ytdData, activeByYTDAccount);
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log(`November RR Target: $${novTotal.toLocaleString()}`);
  
  const sfRecurringTotal = Object.entries(activeByYTDAccount)
    .filter(([name]) => ytdData[name]?.projectType === 'Recurring')
    .reduce((sum, [name, opps]) => sum + opps.reduce((s, o) => s + o.acv, 0), 0);
  
  console.log(`SF Active ACV (matched accounts): $${sfRecurringTotal.toLocaleString()}`);
  console.log(`Gap: $${(sfRecurringTotal - novTotal).toLocaleString()}`);
  console.log(`\nData Loader corrections: ${dataLoaderRows.length}`);
  console.log(`  - Updates to existing: ${dataLoaderRows.filter(r => r.oppId !== 'CREATE_NEW').length}`);
  console.log(`  - New records needed: ${dataLoaderRows.filter(r => r.oppId === 'CREATE_NEW').length}`);
  console.log(`\n✅ Data Loader file: ${OUTPUT_FILE}`);
}

async function generateDataLoaderFile(dataLoaderRows, ytdData, activeByYTDAccount) {
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Data Loader Ready
  const dlSheet = workbook.addWorksheet('Data Loader - ACV Updates');
  dlSheet.columns = [
    { header: 'Opportunity ID', key: 'oppId', width: 20 },
    { header: 'YTD Account', key: 'ytdAccount', width: 25 },
    { header: 'SF Account Name', key: 'sfAccountName', width: 40 },
    { header: 'Opportunity Name', key: 'oppName', width: 50 },
    { header: 'Current ACV', key: 'currentACV', width: 15 },
    { header: 'Nov RR Target', key: 'targetACV', width: 15 },
    { header: 'New ACV', key: 'newACV', width: 15 },
    { header: 'ACV Change', key: 'acvChange', width: 12 },
    { header: 'Other Opps ACV', key: 'otherOppsACV', width: 15 },
    { header: 'Current Term', key: 'currentTerm', width: 12 },
    { header: 'New Term', key: 'newTerm', width: 12 },
    { header: 'Action', key: 'action', width: 20 },
    { header: 'Notes', key: 'notes', width: 60 },
  ];
  
  dlSheet.getRow(1).font = { bold: true };
  dlSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  dlSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  
  for (const row of dataLoaderRows) {
    const excelRow = dlSheet.addRow({
      ...row,
      acvChange: row.newACV - row.currentACV,
      otherOppsACV: row.otherOppsACV || 0,
    });
    
    if (row.action === 'CREATE NEW') {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    } else if (row.action.includes('EXTEND')) {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    } else if (row.action.includes('INCREASE')) {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    } else if (row.action.includes('REDUCE')) {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    }
  }
  
  dlSheet.getColumn('currentACV').numFmt = '"$"#,##0.00';
  dlSheet.getColumn('targetACV').numFmt = '"$"#,##0.00';
  dlSheet.getColumn('newACV').numFmt = '"$"#,##0.00';
  dlSheet.getColumn('acvChange').numFmt = '"$"#,##0.00';
  dlSheet.getColumn('otherOppsACV').numFmt = '"$"#,##0.00';
  
  // Sheet 2: SF Import Format (just ID and ACV for Data Loader)
  const importSheet = workbook.addWorksheet('SF Import Format');
  importSheet.columns = [
    { header: 'Id', key: 'oppId', width: 20 },
    { header: 'ACV__c', key: 'newACV', width: 15 },
  ];
  importSheet.getRow(1).font = { bold: true };
  
  for (const row of dataLoaderRows.filter(r => r.oppId && r.oppId !== 'CREATE_NEW')) {
    importSheet.addRow({
      oppId: row.oppId,
      newACV: row.newACV,
    });
  }
  
  // Sheet 3: YTD vs SF Comparison
  const compareSheet = workbook.addWorksheet('YTD vs SF Comparison');
  compareSheet.columns = [
    { header: 'Account', key: 'account', width: 25 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Sep-25', key: 'sep', width: 12 },
    { header: 'Oct-25', key: 'oct', width: 12 },
    { header: 'Nov-25', key: 'nov', width: 15 },
    { header: 'Dec-25', key: 'dec', width: 12 },
    { header: 'SF Active ACV', key: 'sfACV', width: 15 },
    { header: 'Gap (Nov)', key: 'gap', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
  ];
  compareSheet.getRow(1).font = { bold: true };
  
  for (const [account, data] of Object.entries(ytdData)
    .filter(([n, d]) => d.novRevenue > 0)
    .sort((a, b) => b[1].novRevenue - a[1].novRevenue)) {
    
    const activeOpps = activeByYTDAccount[account] || [];
    const sfACV = activeOpps.reduce((sum, o) => sum + o.acv, 0);
    const gap = sfACV - data.novRevenue;
    
    let status = 'OK';
    if (activeOpps.length === 0) status = 'MISSING';
    else if (Math.abs(gap) > 100) status = gap > 0 ? 'OVERSTATED' : 'UNDERSTATED';
    
    compareSheet.addRow({
      account,
      type: data.projectType,
      sep: data.monthlyRevenue['Sep-25'] || 0,
      oct: data.monthlyRevenue['Oct-25'] || 0,
      nov: data.novRevenue,
      dec: data.decRevenue,
      sfACV,
      gap,
      status,
    });
  }
  
  compareSheet.getColumn('sep').numFmt = '"$"#,##0';
  compareSheet.getColumn('oct').numFmt = '"$"#,##0';
  compareSheet.getColumn('nov').numFmt = '"$"#,##0';
  compareSheet.getColumn('dec').numFmt = '"$"#,##0';
  compareSheet.getColumn('sfACV').numFmt = '"$"#,##0';
  compareSheet.getColumn('gap').numFmt = '"$"#,##0';
  
  // Sheet 4: Create New Records
  const newSheet = workbook.addWorksheet('Create New Opps');
  newSheet.columns = [
    { header: 'Account', key: 'account', width: 25 },
    { header: 'Nov RR Revenue', key: 'revenue', width: 15 },
    { header: 'Suggested Opp Name', key: 'oppName', width: 50 },
    { header: 'Term (Months)', key: 'term', width: 12 },
  ];
  newSheet.getRow(1).font = { bold: true };
  
  for (const row of dataLoaderRows.filter(r => r.oppId === 'CREATE_NEW')) {
    newSheet.addRow({
      account: row.ytdAccount,
      revenue: row.targetACV,
      oppName: `${row.ytdAccount} - Recurring Revenue FY25`,
      term: 12,
    });
  }
  
  newSheet.getColumn('revenue').numFmt = '"$"#,##0.00';
  
  await workbook.xlsx.writeFile(OUTPUT_FILE);
}

runFinalAudit().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
