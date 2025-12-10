/**
 * Signed Logos Monthly Breakdown - Combined Eudia + Johnson Hana
 * 
 * Generates an Excel file matching the dashboard format.
 * JH accounts mapped to dashboard quarterly assignments (Eudia fiscal calendar).
 * 
 * Usage: node scripts/signedLogosMonthly.js
 * Output: scripts/signed_logos_monthly.xlsx
 */

const ExcelJS = require('exceljs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// EUDIA FISCAL CALENDAR
// FY starts February
// Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct, Q4 = Nov-Jan
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// STATIC EUDIA DATA (38 accounts) - from user's spreadsheet with exact months
// ═══════════════════════════════════════════════════════════════════════════
const eudiaSignedByMonth = {
  // 2024 / FY2024 (4 accounts)
  'Cargill': '2024',
  'ECMS': '2024',
  'Graybar Electric': '2024',
  'Southwest Airlines': '2024',
  
  // Q1 FY2025: Feb-25 (1), Mar-25 (1)
  'Coherent': 'Feb-25',
  'Duracell': 'Mar-25',
  
  // Q2 FY2025: May-25 (1), Jun-25 (1)
  'Intuit': 'May-25',
  'Chevron': 'Jun-25',
  
  // Q3 FY2025: Aug-25 (3), Sep-25 (12), Oct-25 (10)
  'CHS': 'Aug-25',
  'Toshiba US': 'Aug-25',
  'U.S. Air Force': 'Aug-25',
  
  'AES': 'Sep-25',
  'Asana': 'Sep-25',
  'Bayer': 'Sep-25',
  'Best Buy': 'Sep-25',
  'Fresh Del Monte': 'Sep-25',
  'GE Vernova': 'Sep-25',
  'Novelis': 'Sep-25',
  'Peregrine Hospitality': 'Sep-25',
  'Sandbox': 'Sep-25',
  'Tailored Brands': 'Sep-25',
  'The Weir Group PLC': 'Sep-25',
  'The Wonderful Company': 'Sep-25',
  
  'Amazon': 'Oct-25',
  'Cox Media Group': 'Oct-25',
  'DHL North America': 'Oct-25',
  'Dolby': 'Oct-25',
  'Ecolab': 'Oct-25',
  'National Grid': 'Oct-25',
  'Petsmart': 'Oct-25',
  'Pure Storage': 'Oct-25',
  'Wealth Partners Capital Group': 'Oct-25',
  'Western Digital': 'Oct-25',
  
  // Q4 FY2025: Nov-25 (4), Dec-25 (1)
  'BNY Mellon': 'Nov-25',
  'Delinea': 'Nov-25',
  'IQVIA': 'Nov-25',
  'World Wide Technology': 'Nov-25',
  
  'Udemy Ireland Limited': 'Dec-25',
};

// ═══════════════════════════════════════════════════════════════════════════
// JOHNSON HANA DATA (36 accounts)
// Mapped to dashboard quarterly assignments using Eudia fiscal calendar
// JH accounts placed at start of their respective quarters
// ═══════════════════════════════════════════════════════════════════════════
const jhSignedByMonth = {
  // FY2024 (27 JH accounts from dashboard) → "2024" column
  'ACS': '2024',
  'Airbnb': '2024',
  'Airship': '2024',
  'BOI': '2024',
  'Coleman Legal': '2024',
  'CommScope': '2024',
  'Creed McStay': '2024',
  'Datalex': '2024',
  'Dropbox': '2024',
  'ESB': '2024',
  'Etsy': '2024',
  'Glanbia': '2024',
  'Hayes': '2024',
  'Indeed': '2024',
  'Irish Water': '2024',
  'Kellanova': '2024',
  'NTMA': '2024',
  'OpenAI': '2024',
  'Stripe': '2024',
  'Teamwork': '2024',
  'TikTok': '2024',
  'Tinder': '2024',
  'Udemy': '2024',
  
  // Q1 FY2025 (6 JH accounts from dashboard) → Feb-25
  'Coillte': 'Feb-25',
  'Consensys': 'Feb-25',
  'DCEDIY': 'Feb-25',
  'Gilead': 'Feb-25',
  'Northern Trust': 'Feb-25',
  'Sisk': 'Feb-25',
  
  // Q2 FY2025 (3 JH accounts from dashboard) → May-25
  'Orsted': 'May-25',
  'Perrigo': 'May-25',
  'Taoglas': 'May-25',
  
  // Q3 FY2025 (3 JH accounts from dashboard) → Aug-25
  'Coimisiún na Meán': 'Aug-25',
  'Kingspan': 'Aug-25',
  'Meta': 'Oct-25', // OutHouse - signed Oct 2025
  
  // Q4 FY2025 (1 JH account from dashboard) → Nov-25
  'Aryza': 'Nov-25',
};

// Column headers matching the spreadsheet format
const ALL_MONTHS = ['2024', 'Jan-25', 'Feb-25', 'Mar-25', 'Apr-25', 'May-25', 'Jun-25', 'Jul-25', 'Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25'];

async function generateExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Signed Logos');

  // Combine all accounts
  const allSignedByMonth = {};
  
  // Add Eudia accounts
  Object.entries(eudiaSignedByMonth).forEach(([account, month]) => {
    allSignedByMonth[account] = { month, source: 'Eudia' };
  });
  
  // Add JH accounts
  Object.entries(jhSignedByMonth).forEach(([account, month]) => {
    if (!allSignedByMonth[account]) {
      allSignedByMonth[account] = { month, source: 'JH' };
    }
  });
  
  // Sort accounts alphabetically
  const sortedAccounts = Object.keys(allSignedByMonth).sort();
  
  // Build rows
  const rows = sortedAccounts.map(account => {
    const { month } = allSignedByMonth[account];
    const row = { Account: account };
    ALL_MONTHS.forEach(m => {
      row[m] = (month === m) ? 1 : 0;
    });
    return row;
  });
  
  // Calculate totals
  const totalRow = { Account: 'Total' };
  const cumulativeRow = { Account: 'Cumulative Total' };
  let cumulative = 0;
  
  ALL_MONTHS.forEach(m => {
    const monthTotal = rows.reduce((sum, row) => sum + row[m], 0);
    totalRow[m] = monthTotal;
    cumulative += monthTotal;
    cumulativeRow[m] = cumulative;
  });

  // === SET UP COLUMNS ===
  worksheet.columns = [
    { header: 'Account', key: 'Account', width: 28 },
    ...ALL_MONTHS.map(m => ({ header: m, key: m, width: 8 }))
  ];

  // === ADD HEADER ROW (Row 1) ===
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell, colNumber) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // === ADD DATA ROWS ===
  rows.forEach((row, index) => {
    const excelRow = worksheet.addRow(row);
    excelRow.eachCell((cell, colNumber) => {
      if (colNumber > 1) {
        cell.alignment = { horizontal: 'center' };
        // Highlight cells with 1
        if (cell.value === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9D9D9' }
          };
        }
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };
    });
  });

  // === ADD TOTAL ROW ===
  const totalExcelRow = worksheet.addRow(totalRow);
  totalExcelRow.font = { bold: true };
  totalExcelRow.eachCell((cell, colNumber) => {
    if (colNumber > 1) {
      cell.alignment = { horizontal: 'center' };
    }
    cell.border = {
      top: { style: 'medium' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // === ADD CUMULATIVE TOTAL ROW ===
  const cumulativeExcelRow = worksheet.addRow(cumulativeRow);
  cumulativeExcelRow.font = { bold: true };
  cumulativeExcelRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F0F0' }
  };
  cumulativeExcelRow.eachCell((cell, colNumber) => {
    if (colNumber > 1) {
      cell.alignment = { horizontal: 'center' };
    }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  });

  // === FREEZE HEADER ROW ===
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // === AUTO-FILTER ===
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(65 + ALL_MONTHS.length)}1`
  };

  // === SAVE FILE ===
  const outputPath = path.join(__dirname, 'signed_logos_monthly.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SIGNED LOGOS MONTHLY - EXCEL FILE GENERATED');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  console.log(`✅ File saved: ${outputPath}\n`);
  console.log('SUMMARY:');
  console.log(`  Eudia accounts:        ${Object.keys(eudiaSignedByMonth).length}`);
  console.log(`  Johnson Hana accounts: ${Object.keys(jhSignedByMonth).length}`);
  console.log(`  Total:                 ${sortedAccounts.length}`);
  console.log(`\nMONTHLY TOTALS (aligns with dashboard quarters):`);
  
  // Show quarterly summary
  const q1 = (totalRow['Feb-25'] || 0) + (totalRow['Mar-25'] || 0) + (totalRow['Apr-25'] || 0);
  const q2 = (totalRow['May-25'] || 0) + (totalRow['Jun-25'] || 0) + (totalRow['Jul-25'] || 0);
  const q3 = (totalRow['Aug-25'] || 0) + (totalRow['Sep-25'] || 0) + (totalRow['Oct-25'] || 0);
  const q4 = (totalRow['Nov-25'] || 0) + (totalRow['Dec-25'] || 0);
  
  console.log(`  FY2024:      ${totalRow['2024']} (dashboard: 27)`);
  console.log(`  Q1 FY2025:   ${q1} (dashboard: 8)`);
  console.log(`  Q2 FY2025:   ${q2} (dashboard: 5)`);
  console.log(`  Q3 FY2025:   ${q3} (dashboard: 28)`);
  console.log(`  Q4 FY2025:   ${q4} (dashboard: 6)`);
  console.log(`\nCumulative by Dec-25: ${cumulativeRow['Dec-25']}`);
  
  return outputPath;
}

// Run
generateExcel()
  .then(filePath => {
    console.log('\n✅ Done! Open the file in Excel.');
  })
  .catch(err => {
    console.error('Error generating Excel:', err);
    process.exit(1);
  });
