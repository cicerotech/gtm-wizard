/**
 * FINAL RECONCILIATION - Current SF vs November RR Targets
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const YTD_FILE = '/Users/keiganpesenti/Desktop/JH YTD Closed Won.csv';
const OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Final_Reconciliation.xlsx';

// CURRENT SF VALUES (from user's screenshot - 72 records, $11,596,876.78 total)
const CURRENT_SF = {
  'Airbnb': 211906.62,
  'Arabic Computer Systems': 156452.86, // ACS
  'Aramark Ireland': 8700.00,
  'Aryza': 104079.87,
  'Bank of Ireland': 1652399.77, // BOI
  'Coimisiún na Meán': 524815.03,
  'Coleman Legal': 16652.78,
  'CommScope Technologies LLC': 158201.40,
  'Consensys': 79100.70,
  'Creed McStay': 38804.44,
  'Datalex (Ireland) Limited': 104912.51,
  'Department of Children, Disability and Equality': 37152.91, // DCEDIY
  'Dropbox International Unlimited Company': 222037.06,
  'ESB NI/Electric Ireland': 473355.25,
  'Etsy Ireland UC': 304329.54,
  'Gilead Sciences': 186511.13,
  'Glanbia Management Services Limited': 90341.33,
  'Hayes Solicitors LLP': 69386.58,
  'ICON Clinical Research Limited': 9819.98,
  'Indeed Ireland Operations Limited': 417845.98,
  'Kellogg Europe Trading Limited': 150291.33, // Kellanova
  'Kingspan': 97085.70,
  'LinkedIn Ireland Unlimited Company': 0,
  'Meta Platforms, Inc.': 1558211.20,
  'Moy Park': 0,
  'Northern Trust Management Services (Ireland) Limited': 145711.82,
  'NTMA': 174000.00,
  'OpenAi': 1537051.52,
  'Orsted': 104079.87,
  'Perrigo Pharma': 127393.76,
  'Sisk Group': 69386.58,
  'Stripe Payments Europe Limited': 1223979.27,
  'Taoglas Limited': 60782.64,
  'Tiktok Information Technologies UK Limited': 208159.74,
  'Tinder LLC': 228975.71,
  'Udemy Ireland Limited': 533721.57,
  'Uisce Éireann (Irish Water)': 440882.33,
};

// Mapping SF names to RR names
const SF_TO_RR = {
  'Arabic Computer Systems': 'ACS',
  'Bank of Ireland': 'BOI',
  'CommScope Technologies LLC': 'CommScope',
  'Datalex (Ireland) Limited': 'Datalex',
  'Dropbox International Unlimited Company': 'Dropbox',
  'ESB NI/Electric Ireland': 'ESB',
  'Etsy Ireland UC': 'Etsy',
  'Gilead Sciences': 'Gilead',
  'Glanbia Management Services Limited': 'Glanbia',
  'Hayes Solicitors LLP': 'Hayes',
  'Indeed Ireland Operations Limited': 'Indeed',
  'Kellogg Europe Trading Limited': 'Kellanova',
  'Northern Trust Management Services (Ireland) Limited': 'Northern Trust',
  'Perrigo Pharma': 'Perrigo',
  'Sisk Group': 'Sisk',
  'Stripe Payments Europe Limited': 'Stripe',
  'Taoglas Limited': 'Taoglas',
  'Tiktok Information Technologies UK Limited': 'TikTok',
  'Tinder LLC': 'Tinder',
  'Udemy Ireland Limited': 'Udemy',
  'Uisce Éireann (Irish Water)': 'Irish Water',
  'Department of Children, Disability and Equality': 'DCEDIY',
  'Meta Platforms, Inc.': 'Meta',
  'ICON Clinical Research Limited': 'ICON',
  'Aramark Ireland': 'Aramark',
  'LinkedIn Ireland Unlimited Company': 'LinkedIn',
  'Moy Park': 'Moy Park',
  'Coimisiún na Meán': 'Coimisiún na Meán',
  'OpenAi': 'OpenAi',
  'Consensys': 'Consensys',
  'Aryza': 'Aryza',
  'Airbnb': 'Airbnb',
  'NTMA': 'NTMA',
  'Kingspan': 'Kingspan',
  'Orsted': 'Orsted',
  'Coleman Legal': 'Coleman Legal',
  'Creed McStay': 'Creed McStay',
};

// Parse YTD data for November RR targets
function parseYTDData() {
  const content = fs.readFileSync(YTD_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const ytdData = {};
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 17) continue;
    
    const accountName = parts[1];
    const novRevenue = parseFloat(parts[12]) || 0;
    const projectType = parts[16]?.trim() || 'Recurring';
    
    ytdData[accountName] = {
      accountName,
      novRevenue,
      projectType,
    };
  }
  
  return ytdData;
}

function runReconciliation() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('FINAL RECONCILIATION - SF vs November RR Revenue');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  // Parse YTD data
  const ytdData = parseYTDData();
  
  // Calculate totals
  const sfTotal = Object.values(CURRENT_SF).reduce((a, b) => a + b, 0);
  console.log(`Current SF Active Total: $${sfTotal.toLocaleString()}`);
  
  // Build comparison
  const comparison = [];
  const missingFromSF = [];
  const extraInSF = [];
  
  // Check each RR account
  for (const [rrName, rrData] of Object.entries(ytdData)) {
    if (rrData.novRevenue === 0) continue; // Skip accounts with no Nov revenue
    
    // Find matching SF account
    let sfValue = 0;
    let sfAccountName = null;
    
    for (const [sfName, sfACV] of Object.entries(CURRENT_SF)) {
      const mappedName = SF_TO_RR[sfName] || sfName;
      if (mappedName === rrName || 
          sfName.toLowerCase().includes(rrName.toLowerCase()) ||
          rrName.toLowerCase().includes(sfName.toLowerCase())) {
        sfValue = sfACV;
        sfAccountName = sfName;
        break;
      }
    }
    
    const gap = sfValue - rrData.novRevenue;
    
    comparison.push({
      rrAccount: rrName,
      sfAccount: sfAccountName || 'NOT FOUND',
      rrTarget: rrData.novRevenue,
      sfACV: sfValue,
      gap,
      type: rrData.projectType,
      status: sfValue === 0 ? 'MISSING' : (Math.abs(gap) < 10 ? 'OK' : (gap > 0 ? 'OVER' : 'UNDER')),
    });
    
    if (sfValue === 0) {
      missingFromSF.push({ account: rrName, amount: rrData.novRevenue, type: rrData.projectType });
    }
  }
  
  // Calculate RR total
  const rrTotal = comparison.reduce((sum, c) => sum + c.rrTarget, 0);
  const matchedSFTotal = comparison.reduce((sum, c) => sum + c.sfACV, 0);
  
  console.log(`November RR Target Total: $${rrTotal.toLocaleString()}`);
  console.log(`Gap: $${(sfTotal - rrTotal).toLocaleString()}\n`);
  
  // Show accounts that are UNDER
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS NEEDING ADDITIONAL ACV (SF < RR Target)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const underAccounts = comparison.filter(c => c.status === 'UNDER' || c.status === 'MISSING');
  underAccounts.sort((a, b) => a.gap - b.gap); // Most under first
  
  let totalShortfall = 0;
  for (const acct of underAccounts) {
    console.log(`${acct.rrAccount.padEnd(30)} | RR: $${acct.rrTarget.toLocaleString().padStart(12)} | SF: $${acct.sfACV.toLocaleString().padStart(12)} | Gap: $${acct.gap.toLocaleString().padStart(12)} | ${acct.status}`);
    totalShortfall += Math.abs(acct.gap);
  }
  console.log('─'.repeat(100));
  console.log(`${'TOTAL SHORTFALL'.padEnd(30)} | ${''.padStart(12)} | ${''.padStart(12)} | $${(-totalShortfall).toLocaleString().padStart(12)}`);
  
  // Show accounts that are OVER
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS OVER RR TARGET (SF > RR Target)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const overAccounts = comparison.filter(c => c.status === 'OVER');
  overAccounts.sort((a, b) => b.gap - a.gap);
  
  let totalOver = 0;
  for (const acct of overAccounts) {
    console.log(`${acct.rrAccount.padEnd(30)} | RR: $${acct.rrTarget.toLocaleString().padStart(12)} | SF: $${acct.sfACV.toLocaleString().padStart(12)} | Gap: $${acct.gap.toLocaleString().padStart(12)}`);
    totalOver += acct.gap;
  }
  console.log('─'.repeat(100));
  console.log(`${'TOTAL OVER'.padEnd(30)} | ${''.padStart(12)} | ${''.padStart(12)} | $${totalOver.toLocaleString().padStart(12)}`);
  
  // Show accounts OK
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS ALIGNED (within $10)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const okAccounts = comparison.filter(c => c.status === 'OK');
  for (const acct of okAccounts) {
    console.log(`✅ ${acct.rrAccount.padEnd(28)} | $${acct.sfACV.toLocaleString().padStart(12)}`);
  }
  
  // Show extra accounts in SF not in RR
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('ACCOUNTS IN SF NOT IN JH RR FILE (Extra/Non-JH)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const rrAccountNames = Object.keys(ytdData);
  let extraTotal = 0;
  
  for (const [sfName, sfACV] of Object.entries(CURRENT_SF)) {
    if (sfACV === 0) continue;
    
    const mappedName = SF_TO_RR[sfName] || sfName;
    const isInRR = rrAccountNames.some(rr => 
      rr === mappedName || 
      rr.toLowerCase().includes(mappedName.toLowerCase()) ||
      mappedName.toLowerCase().includes(rr.toLowerCase())
    );
    
    if (!isInRR) {
      console.log(`❓ ${sfName.padEnd(45)} | $${sfACV.toLocaleString().padStart(12)}`);
      extraTotal += sfACV;
    }
  }
  console.log('─'.repeat(70));
  console.log(`${'TOTAL EXTRA'.padEnd(45)} | $${extraTotal.toLocaleString().padStart(12)}`);
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log(`Current SF Total: $${sfTotal.toLocaleString()}`);
  console.log(`November RR Target: $${rrTotal.toLocaleString()}`);
  console.log(`\nAccounts UNDER target: ${underAccounts.length} (shortfall: $${totalShortfall.toLocaleString()})`);
  console.log(`Accounts OVER target: ${overAccounts.length} (excess: $${totalOver.toLocaleString()})`);
  console.log(`Accounts ALIGNED: ${okAccounts.length}`);
  console.log(`Extra accounts (not in JH RR): $${extraTotal.toLocaleString()}`);
  
  console.log(`\nNet adjustment needed: $${(totalOver - totalShortfall).toLocaleString()}`);
  
  // Generate Excel
  generateExcel(comparison, underAccounts, overAccounts, okAccounts, sfTotal, rrTotal);
}

function generateExcel(comparison, underAccounts, overAccounts, okAccounts, sfTotal, rrTotal) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Accounts needing more ACV
  const underSheet = workbook.addWorksheet('Need More ACV');
  underSheet.columns = [
    { header: 'RR Account', key: 'rrAccount', width: 30 },
    { header: 'SF Account', key: 'sfAccount', width: 40 },
    { header: 'RR Target', key: 'rrTarget', width: 15 },
    { header: 'Current SF ACV', key: 'sfACV', width: 15 },
    { header: 'Additional Needed', key: 'gap', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  underSheet.getRow(1).font = { bold: true };
  underSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
  
  for (const acct of underAccounts) {
    underSheet.addRow({
      ...acct,
      gap: Math.abs(acct.gap),
    });
  }
  
  underSheet.getColumn('rrTarget').numFmt = '"$"#,##0.00';
  underSheet.getColumn('sfACV').numFmt = '"$"#,##0.00';
  underSheet.getColumn('gap').numFmt = '"$"#,##0.00';
  
  // Sheet 2: Full comparison
  const fullSheet = workbook.addWorksheet('Full Comparison');
  fullSheet.columns = [
    { header: 'RR Account', key: 'rrAccount', width: 30 },
    { header: 'SF Account', key: 'sfAccount', width: 40 },
    { header: 'RR Target', key: 'rrTarget', width: 15 },
    { header: 'SF ACV', key: 'sfACV', width: 15 },
    { header: 'Gap', key: 'gap', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  fullSheet.getRow(1).font = { bold: true };
  
  for (const acct of comparison.sort((a, b) => a.gap - b.gap)) {
    const row = fullSheet.addRow(acct);
    if (acct.status === 'MISSING') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    } else if (acct.status === 'UNDER') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    } else if (acct.status === 'OVER') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    }
  }
  
  fullSheet.getColumn('rrTarget').numFmt = '"$"#,##0.00';
  fullSheet.getColumn('sfACV').numFmt = '"$"#,##0.00';
  fullSheet.getColumn('gap').numFmt = '"$"#,##0.00';
  
  workbook.xlsx.writeFile(OUTPUT_FILE).then(() => {
    console.log(`\n✅ Excel saved to: ${OUTPUT_FILE}`);
  });
}

runReconciliation();



