/**
 * Create Data Loader file for missing JH opportunities
 */

const ExcelJS = require('exceljs');

const OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Create_Missing_Opps.xlsx';

// Missing accounts that need opportunities created
const MISSING_OPPS = [
  { 
    accountId: '', // User needs to fill in Account ID
    accountName: 'Coillte',
    amount: 194837.52,
    acv: 194837.52,
    tcv: 194837.52,
    source: 'Johnson Hana',
    stage: '6.) Closed-won',
    termMonths: 12,
    closeDate: '11/1/2025',
    targetSignDate: '11/1/2025'
  },
  { 
    accountId: '',
    accountName: 'Airship',
    amount: 166527.79,
    acv: 166527.79,
    tcv: 166527.79,
    source: 'Johnson Hana',
    stage: '6.) Closed-won',
    termMonths: 12,
    closeDate: '11/1/2025',
    targetSignDate: '11/1/2025'
  },
  { 
    accountId: '',
    accountName: 'Teamwork',
    amount: 70357.99,
    acv: 70357.99,
    tcv: 70357.99,
    source: 'Johnson Hana',
    stage: '6.) Closed-won',
    termMonths: 12,
    closeDate: '11/1/2025',
    targetSignDate: '11/1/2025'
  },
];

async function createDataLoaderFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Create Opps');
  
  // Set up columns matching the user's format
  sheet.columns = [
    { header: 'Account ID', key: 'accountId', width: 20 },
    { header: 'Opportunity Name', key: 'oppName', width: 40 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'ACV', key: 'acv', width: 15 },
    { header: 'tcv', key: 'tcv', width: 15 },
    { header: 'Opportunity Source', key: 'source', width: 18 },
    { header: 'Stage', key: 'stage', width: 15 },
    { header: 'Term (Months)', key: 'termMonths', width: 14 },
    { header: 'Close Date', key: 'closeDate', width: 12 },
    { header: 'Target Sign Date', key: 'targetSignDate', width: 15 },
  ];
  
  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { 
    type: 'pattern', 
    pattern: 'solid', 
    fgColor: { argb: 'FFE2EFDA' } 
  };
  
  // Add data rows
  for (const opp of MISSING_OPPS) {
    sheet.addRow({
      accountId: opp.accountId,
      oppName: `${opp.accountName} - November RR Revenue`,
      amount: opp.amount,
      acv: opp.acv,
      tcv: opp.tcv,
      source: opp.source,
      stage: opp.stage,
      termMonths: opp.termMonths,
      closeDate: opp.closeDate,
      targetSignDate: opp.targetSignDate,
    });
  }
  
  // Format currency columns
  sheet.getColumn('amount').numFmt = '"$"#,##0.00';
  sheet.getColumn('acv').numFmt = '"$"#,##0.00';
  sheet.getColumn('tcv').numFmt = '"$"#,##0.00';
  
  await workbook.xlsx.writeFile(OUTPUT_FILE);
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('DATA LOADER FILE CREATED - Missing JH Opportunities');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log('File saved to:', OUTPUT_FILE);
  console.log('\nOpportunities to create:\n');
  
  let total = 0;
  for (const opp of MISSING_OPPS) {
    console.log(`  ${opp.accountName.padEnd(20)} | ACV: $${opp.acv.toLocaleString().padStart(12)} | Term: ${opp.termMonths} months`);
    total += opp.acv;
  }
  
  console.log('─'.repeat(60));
  console.log(`  ${'TOTAL'.padEnd(20)} | ACV: $${total.toLocaleString().padStart(12)}`);
  
  console.log('\n⚠️  NOTE: You need to fill in the Account IDs before uploading to Data Loader');
}

createDataLoaderFile();






