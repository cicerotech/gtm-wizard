/**
 * Johnson Hana Revenue Analysis
 * 
 * Compares RR Revenue (accurate) vs Salesforce Closed Won (dirty) 
 * to identify discrepancies that need correction for Data Loader upload.
 */

const ExcelJS = require('exceljs');
const path = require('path');

const RR_REVENUE_FILE = '/Users/keiganpesenti/Desktop/Johnson Hana 2025 Month over Month RR Revenue.xlsx';
const SF_CLOSED_WON_FILE = '/Users/keiganpesenti/Desktop/Book77777.xlsx';

// Excel date serial to JS Date
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  return new Date(utc_days * 86400 * 1000);
}

function formatDate(date) {
  if (!date) return 'N/A';
  if (typeof date === 'number') date = excelDateToJS(date);
  if (!(date instanceof Date)) return 'N/A';
  return date.toISOString().split('T')[0];
}

async function loadExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function worksheetToJson(worksheet) {
  const rows = [];
  const headers = [];
  
  worksheet.eachRow((row, rowNumber) => {
    const rowData = {};
    row.eachCell((cell, colNumber) => {
      if (rowNumber === 1) {
        headers[colNumber] = cell.value?.toString().trim() || `Col${colNumber}`;
      } else {
        const header = headers[colNumber] || `Col${colNumber}`;
        rowData[header] = cell.value;
      }
    });
    if (rowNumber > 1 && Object.keys(rowData).length > 0) {
      rows.push(rowData);
    }
  });
  
  return { headers, rows };
}

async function analyze() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('JOHNSON HANA REVENUE ANALYSIS - DEEP SCRUB');
  console.log('Comparing RR Revenue vs Salesforce Closed Won');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');

  // Load both files
  console.log('📊 Loading files...');
  const rrWorkbook = await loadExcel(RR_REVENUE_FILE);
  const sfWorkbook = await loadExcel(SF_CLOSED_WON_FILE);
  
  const rrSheet = rrWorkbook.worksheets[0];
  const sfSheet = sfWorkbook.worksheets[0];
  
  const rrData = worksheetToJson(rrSheet);
  const sfData = worksheetToJson(sfSheet);
  
  console.log(`   RR Revenue: ${rrData.rows.length} accounts`);
  console.log(`   SF Closed Won: ${sfData.rows.length} opportunities\n`);
  
  // Column mappings
  const accountCol = 'Account Name: Account Name';
  const acvCol = 'ACV';
  const termCol = 'Term (Months)';
  const endDateCol = 'End Date';
  const oppNameCol = 'Opportunity Name';
  const closeDateCol = 'Close Date';
  const oppIdCol = 'Opportunity ID';
  
  // Get RR Revenue November data
  const novColKey = rrData.headers.find(h => h && h.includes('Nov 30 2025'));
  const rrAccountCol = 'Account Name';
  
  const rrAccountTotals = {};
  let rrNovTotal = 0;
  
  rrData.rows.forEach(row => {
    const account = row[rrAccountCol];
    const novValue = parseFloat(row[novColKey]) || 0;
    
    if (account && account !== 'Total' && account !== 'Grand Total') {
      rrAccountTotals[account] = {
        novRevenue: novValue,
        type: row['Project / Recurring'] || 'Unknown'
      };
      rrNovTotal += novValue;
    }
  });
  
  // Today's date for filtering active agreements
  const today = new Date();
  const todaySerial = Math.floor((today.getTime() / 86400000) + 25569);
  
  console.log(`📅 Today: ${formatDate(today)}`);
  console.log(`📅 Filtering agreements with End Date >= today\n`);
  
  // Process SF Closed Won data
  const sfAccountTotals = {};
  const activeOpps = [];
  const expiredOpps = [];
  let totalActiveACV = 0;
  let activeRecurring = 0;
  let activeProject = 0;
  
  sfData.rows.forEach(row => {
    const account = row[accountCol];
    const acv = parseFloat(row[acvCol]) || 0;
    const term = parseFloat(row[termCol]) || 0;
    const endDate = row[endDateCol];
    const oppName = row[oppNameCol];
    const oppId = row[oppIdCol];
    const closeDate = row[closeDateCol];
    
    if (!account) return;
    
    const isRecurring = term >= 12;
    const isActive = endDate && endDate >= todaySerial;
    
    const opp = {
      account,
      oppName,
      oppId,
      acv,
      term,
      type: isRecurring ? 'Recurring' : 'Project',
      endDate: formatDate(endDate),
      closeDate: formatDate(closeDate),
      isActive
    };
    
    if (isActive) {
      activeOpps.push(opp);
      totalActiveACV += acv;
      
      if (isRecurring) {
        activeRecurring += acv;
      } else {
        activeProject += acv;
      }
      
      if (!sfAccountTotals[account]) {
        sfAccountTotals[account] = { recurring: 0, project: 0, opps: [] };
      }
      
      if (isRecurring) {
        sfAccountTotals[account].recurring += acv;
      } else {
        sfAccountTotals[account].project += acv;
      }
      sfAccountTotals[account].opps.push(opp);
    } else {
      expiredOpps.push(opp);
    }
  });
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SALESFORCE ACTIVE AGREEMENTS SUMMARY (End Date >= Today)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`   Total Active ACV: $${totalActiveACV.toLocaleString()}`);
  console.log(`   Active Recurring (term >= 12): $${activeRecurring.toLocaleString()}`);
  console.log(`   Active Project (term < 12): $${activeProject.toLocaleString()}`);
  console.log(`   Active Opps: ${activeOpps.length}`);
  console.log(`   Expired Opps: ${expiredOpps.length}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('RR REVENUE NOVEMBER SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`   Total November RR Revenue: $${rrNovTotal.toLocaleString()}`);
  console.log(`   Accounts: ${Object.keys(rrAccountTotals).length}`);
  
  // DISCREPANCY ANALYSIS
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('DISCREPANCY ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`\n   SF Active Recurring: $${activeRecurring.toLocaleString()}`);
  console.log(`   RR November Total: $${rrNovTotal.toLocaleString()}`);
  console.log(`   OVERSTATED BY: $${(activeRecurring - rrNovTotal).toLocaleString()}`);
  
  // Account-by-account comparison
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNT-LEVEL COMPARISON (SF Active Recurring vs RR November)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const allAccounts = new Set([...Object.keys(sfAccountTotals), ...Object.keys(rrAccountTotals)]);
  const discrepancies = [];
  
  // Sort accounts
  const sortedAccounts = Array.from(allAccounts).sort();
  
  sortedAccounts.forEach(account => {
    const sfRec = sfAccountTotals[account]?.recurring || 0;
    const sfProj = sfAccountTotals[account]?.project || 0;
    const rrRev = rrAccountTotals[account]?.novRevenue || 0;
    const diff = sfRec - rrRev;
    
    // Flag significant discrepancies
    if (Math.abs(diff) > 1000 || (sfRec > 0 && rrRev === 0) || (sfRec === 0 && rrRev > 0)) {
      discrepancies.push({ account, sfRec, sfProj, rrRev, diff, opps: sfAccountTotals[account]?.opps || [] });
    }
  });
  
  console.log('ACCOUNTS WITH SIGNIFICANT DISCREPANCIES:\n');
  console.log('| Account                    | SF Recurring    | RR Nov Revenue  | Difference      | Issue |');
  console.log('|----------------------------|-----------------|-----------------|-----------------|-------|');
  
  discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  
  discrepancies.forEach(d => {
    let issue = '';
    if (d.sfRec > 0 && d.rrRev === 0) issue = 'SF ONLY';
    else if (d.sfRec === 0 && d.rrRev > 0) issue = 'RR ONLY';
    else if (d.diff > 0) issue = 'OVER';
    else issue = 'UNDER';
    
    console.log(`| ${d.account.substring(0, 26).padEnd(26)} | $${d.sfRec.toLocaleString().padStart(13)} | $${d.rrRev.toLocaleString().padStart(13)} | $${d.diff.toLocaleString().padStart(13)} | ${issue.padEnd(5)} |`);
  });
  
  // Detailed breakdown of overstatement
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS IN SF BUT NOT IN RR REVENUE (Potential Overstatement)');
  console.log('These may need to be removed or have incorrect end dates');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  let sfOnlyTotal = 0;
  discrepancies.filter(d => d.sfRec > 0 && d.rrRev === 0).forEach(d => {
    console.log(`\n📍 ${d.account}: $${d.sfRec.toLocaleString()} in SF, $0 in RR`);
    d.opps.forEach(opp => {
      if (opp.type === 'Recurring') {
        console.log(`   - ${opp.oppName}`);
        console.log(`     ACV: $${opp.acv.toLocaleString()} | Term: ${opp.term}mo | End: ${opp.endDate} | ID: ${opp.oppId}`);
        sfOnlyTotal += opp.acv;
      }
    });
  });
  
  console.log(`\n📊 Total SF-Only Recurring: $${sfOnlyTotal.toLocaleString()}`);
  
  // Accounts with partial discrepancy
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS WITH PARTIAL DISCREPANCY (SF > RR)');
  console.log('May have duplicate opps or incorrect ACV values');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  discrepancies.filter(d => d.sfRec > 0 && d.rrRev > 0 && d.diff > 1000).forEach(d => {
    console.log(`\n📍 ${d.account}: SF $${d.sfRec.toLocaleString()} vs RR $${d.rrRev.toLocaleString()} (OVER by $${d.diff.toLocaleString()})`);
    d.opps.forEach(opp => {
      if (opp.type === 'Recurring') {
        console.log(`   - ${opp.oppName}`);
        console.log(`     ACV: $${opp.acv.toLocaleString()} | Term: ${opp.term}mo | End: ${opp.endDate}`);
      }
    });
  });
  
  // Accounts in RR but not in SF
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS IN RR BUT NOT IN SF (Missing Closed Won records)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  discrepancies.filter(d => d.sfRec === 0 && d.rrRev > 0).forEach(d => {
    console.log(`   - ${d.account}: $${d.rrRev.toLocaleString()}/mo in RR Revenue`);
  });
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY & RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`\n1. Total SF Active Recurring: $${activeRecurring.toLocaleString()}`);
  console.log(`2. Total RR November Revenue: $${rrNovTotal.toLocaleString()}`);
  console.log(`3. Overstatement: $${(activeRecurring - rrNovTotal).toLocaleString()}`);
  console.log(`4. Discrepancy accounts: ${discrepancies.length}`);
  console.log(`\nTo fix in Salesforce via Data Loader:`);
  console.log(`   - Update End Dates for expired agreements`);
  console.log(`   - Remove/correct duplicate opportunities`);
  console.log(`   - Verify ACV amounts match contracted values`);
  
  return { sfData, rrData, discrepancies, activeOpps, sfAccountTotals, rrAccountTotals };
}

// Run
analyze()
  .then(result => {
    console.log('\n✅ Analysis complete!');
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });


