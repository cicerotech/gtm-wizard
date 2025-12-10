/**
 * Signed Logos Monthly Breakdown - Combined Eudia + Johnson Hana
 * 
 * Generates an Excel file matching the dashboard format:
 * Account | 2024 | Jan-25 | Feb-25 | ... | Dec-25
 * 
 * Usage: node scripts/signedLogosMonthly.js
 * Output: scripts/signed_logos_monthly.xlsx
 */

const ExcelJS = require('exceljs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// STATIC EUDIA DATA (38 accounts)
// ═══════════════════════════════════════════════════════════════════════════
const eudiaSignedByMonth = {
  // 2024 (4 accounts)
  'Cargill': '2024',
  'ECMS': '2024',
  'Graybar Electric': '2024',
  'Southwest Airlines': '2024',
  
  // Feb-25 (1 account)
  'Coherent': 'Feb-25',
  
  // Mar-25 (1 account)
  'Duracell': 'Mar-25',
  
  // May-25 (1 account)
  'Intuit': 'May-25',
  
  // Jun-25 (1 account)
  'Chevron': 'Jun-25',
  
  // Aug-25 (3 accounts)
  'CHS': 'Aug-25',
  'Toshiba US': 'Aug-25',
  'U.S. Air Force': 'Aug-25',
  
  // Sep-25 (12 accounts)
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
  
  // Oct-25 (10 accounts)
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
  
  // Nov-25 (4 accounts)
  'BNY Mellon': 'Nov-25',
  'Delinea': 'Nov-25',
  'IQVIA': 'Nov-25',
  'World Wide Technology': 'Nov-25',
  
  // Dec-25 (1 account)
  'Udemy Ireland Limited': 'Dec-25',
};

// ═══════════════════════════════════════════════════════════════════════════
// JOHNSON HANA DATA (36 accounts)
// ═══════════════════════════════════════════════════════════════════════════
const jhSignedByMonth = {
  // From jhSignedLogos.fy2024 (34 accounts)
  'ACS': '2024',
  'Airbnb': '2024',
  'Airship': '2024',
  'BOI': '2024',
  'Coimisiún na Meán': '2024',
  'CommScope': '2024',
  'Consensys': '2024',
  'Datalex': '2024',
  'Dropbox': '2024',
  'ESB': '2024',
  'Etsy': '2024',
  'Gilead': '2024',
  'Glanbia': '2024',
  'Indeed': '2024',
  'Irish Water': '2024',
  'Kellanova': '2024',
  'Kingspan': '2024',
  'Northern Trust': '2024',
  'OpenAI': '2024',
  'Orsted': '2024',
  'Perrigo': '2024',
  'Sisk': '2024',
  'Stripe': '2024',
  'Taoglas': '2024',
  'Teamwork': '2024',
  'TikTok': '2024',
  'Tinder': '2024',
  'Udemy': '2024',
  'Coillte': '2024',
  'Coleman Legal': '2024',
  'Creed McStay': '2024',
  'DCEDIY': '2024',
  'Hayes': '2024',
  'NTMA': '2024',
  
  // Aryza - closed 2024-11-12
  'Aryza': 'Nov-24',
  
  // Meta - signed Oct 2025
  'Meta': 'Oct-25',
};

// Column headers matching your screenshot
const MONTHS = ['2024', 'Jan-25', 'Feb-25', 'Mar-25', 'Apr-25', 'May-25', 'Jun-25', 'Jul-25', 'Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25'];

// Add Nov-24 for proper ordering (Aryza)
const ALL_MONTHS = ['2024', 'Nov-24', 'Jan-25', 'Feb-25', 'Mar-25', 'Apr-25', 'May-25', 'Jun-25', 'Jul-25', 'Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25'];

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
  console.log(`\nCumulative by Dec-25:    ${cumulativeRow['Dec-25']}`);
  
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
