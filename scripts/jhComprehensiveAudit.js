/**
 * Comprehensive JH Revenue Audit - SF vs RR Revenue Month-by-Month
 * Analyzes when deals started, duration, and correct ACV values
 */

const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const SF_FILE = '/Users/keiganpesenti/Desktop/JOHNSON HANA CLOSED WON SALESFORCE UPDATED.xls';
const OUTPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Comprehensive_Audit.xlsx';

// RR Revenue data from user's paste - Account -> { month: revenue } with November as final target
// Format: account name -> array of monthly revenues (Jan-Nov 2025) + type
const RR_REVENUE = {
  'ACS': { jan: 113687, feb: 104338, mar: 106341, apr: 33911, may: 135877, jun: 326962, jul: 161983, aug: 159963, sep: 130294, oct: 180188, nov: 156453, type: 'Recurring' },
  'Airbnb': { jan: 172580, feb: 81221, mar: 166968, apr: 197411, may: 235823, jun: 328897, jul: 288095, aug: 344115, sep: 288114, oct: 263480, nov: 211907, type: 'Recurring' },
  'Airship': { jan: 121142, feb: 187434, mar: 194526, apr: 201852, may: 203004, jun: 207288, jul: 210186, aug: 209358, sep: 211176, oct: 167733, nov: 166528, type: 'Recurring' },
  'Aryza': { nov: 104080, type: 'Recurring' },
  'BOI': { jan: 403309, feb: 556179, mar: 640898, apr: 545323, may: 426850, jun: 607354, jul: 507809, aug: 633657, sep: 553281, oct: 1922567, nov: 1652400, type: 'Recurring' },
  'CommScope': { jan: 110034, feb: 218248, mar: 271169, apr: 160553, may: 146163, jun: 186559, jul: 151334, aug: 188422, sep: 152047, oct: 150960, nov: 158201, type: 'Recurring' },
  'Consensys': { mar: 75282, apr: 78117, may: 78563, jun: 75407, oct: 35280, nov: 79101, type: 'Recurring' },
  'Datalex': { jan: 84489, feb: 84970, mar: 110231, apr: 91506, may: 92028, jun: 117463, jul: 202479, aug: 118636, sep: 95733, oct: 95049, nov: 104913, type: 'Recurring' },
  'Dropbox': { jan: 96913, feb: 210301, mar: 283878, apr: 233879, may: 310596, jun: 463772, jul: 381137, aug: 408527, sep: 311696, oct: 389140, nov: 222037, type: 'Recurring' },
  'ESB': { jan: 392748, feb: 324042, mar: 409801, apr: 527944, may: 555926, jun: 666051, jul: 451199, aug: 418925, sep: 542375, oct: 526960, nov: 473355, type: 'Recurring' },
  'Etsy': { jan: 163597, feb: 306792, mar: 318079, apr: 246794, may: 284713, jun: 343735, jul: 248661, aug: 338877, sep: 127181, oct: 283678, nov: 304330, type: 'Recurring' },
  'Gilead': { may: 90833, jun: 182704, jul: 186559, aug: 132417, sep: 188422, oct: 237573, nov: 188699, nov: 186511, type: 'Recurring' },
  'Glanbia': { jan: 49202, feb: 77660, mar: 80599, apr: 74012, may: 80390, jun: 107168, jul: 90940, aug: 168128, sep: 201800, oct: 86872, nov: 90341, type: 'Recurring' },
  'Indeed': { jan: 356530, feb: 323011, mar: 349758, apr: 427613, may: 641425, jun: 659397, jul: 444754, aug: 552984, sep: 597628, oct: 425063, nov: 417846, type: 'Recurring' },
  'Irish Water': { jan: 350069, feb: 483642, mar: 722398, apr: 581885, may: 653977, jun: 729861, jul: 537298, aug: 557618, sep: 465052, oct: 458498, nov: 440882, type: 'Recurring' },
  'Kellanova': { jan: 188857, feb: 229919, mar: 36312, jun: 126112, aug: 117240, sep: 135153, oct: 134186, nov: 150291, type: 'Recurring' },
  'Kingspan': { oct: 27257, nov: 97086, type: 'Recurring' },
  'Northern Trust': { apr: 237479, may: 155569, jun: 157401, jul: 168849, aug: 182316, sep: 149794, oct: 127023, nov: 145712, type: 'Recurring' },
  'OpenAi': { jan: 661993, feb: 671514, mar: 875108, apr: 620897, may: 685883, jun: 880145, jul: 786376, aug: 919779, sep: 857093, oct: 1183634, nov: 1537052, type: 'Recurring' },
  'Orsted': { may: 45473, jun: 132664, jul: 134519, aug: 133989, sep: 121637, oct: 107349, nov: 104080, type: 'Recurring' },
  'Perrigo': { jun: 79030, aug: 160787, sep: 130338, oct: 122445, nov: 127394, type: 'Recurring' },
  'Sisk': { feb: 24179, mar: 45389, apr: 15812, may: 448504, jun: 32295, jul: 322250, aug: 183572, sep: 123573, oct: 137922, nov: 69387, type: 'Recurring' },
  'Stripe': { jan: 317032, feb: 299570, mar: 789231, apr: 666569, may: 885503, jun: 1126900, jul: 1359676, aug: 920519, sep: 1318787, oct: 1267501, nov: 1223979, type: 'Recurring' },
  'Taoglas': { apr: 40601, may: 51822, jun: 63056, jul: 62807, aug: 63353, sep: 73383, oct: 60783, nov: 60783, type: 'Recurring' },
  'Teamwork': { jan: 65603, feb: 70100, mar: 85591, apr: 71052, may: 71457, jun: 127689, jul: 73985, aug: 92118, sep: 74334, oct: 73802, nov: 70358, type: 'Recurring' },
  'TikTok': { jan: 1272225, feb: 1181055, mar: 1504691, apr: 1542533, may: 1462718, jun: 1542503, jul: 1970368, aug: 1347760, sep: 1582666, oct: 300259, nov: 208160, type: 'Recurring' },
  'Tinder': { jan: 150961, feb: 151822, mar: 197833, apr: 129898, may: 158039, jun: 205215, jul: 179709, aug: 235528, sep: 167251, oct: 205682, nov: 228976, type: 'Recurring' },
  'Udemy': { jan: 33469, feb: 119958, mar: 93372, apr: 103348, may: 129923, jun: 33166, jul: 39235, aug: 93792, sep: 382932, oct: 383829, nov: 533722, type: 'Recurring' },
  // Project accounts
  'Coillte': { apr: 16994, may: 281242, jun: 463752, jul: 275910, aug: 624369, sep: 231560, oct: 311287, nov: 294422, dec: 201119, nov: 194838, type: 'Project' },
  'Coleman Legal': { jan: 99398, feb: 182779, mar: 251239, apr: 534041, may: 488945, jun: 598060, jul: 1059351, aug: 68642, sep: 36959, oct: 18524, nov: 16653, type: 'Project' },
  'Creed McStay': { jan: 549648, feb: 374624, mar: 704681, apr: 125384, may: 50920, jun: 54931, jul: 40286, aug: 39028, sep: 39367, oct: 39085, nov: 38804, type: 'Project' },
  'DCEDIY': { apr: 2093044, may: 4003943, jun: 3254467, jul: 2320401, aug: 1709077, sep: 565918, oct: 37422, nov: 37153, type: 'Project' },
  'Hayes': { jan: 37274, feb: 23492, mar: 1060737, apr: 755675, may: 158037, jun: 157411, jul: 169981, aug: 123200, sep: 88293, oct: 87661, nov: 69387, type: 'Project' },
  'ICON': { sep: 175128, type: 'Project' },
  'NTMA': { jan: 99398, feb: 77848, mar: 198806, apr: 57730, may: 90201, jun: 483148, jul: 598213, aug: 1515284, sep: 294658, oct: 170691, nov: 170691, type: 'Project' },
  'Coimisiún na Meán': { aug: 212987, sep: 249328, oct: 383829, nov: 389675, type: 'Recurring' },
  'Meta': { oct: 1558211, nov: 1558211, type: 'Recurring' },
};

// Map SF account names to RR account names
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
  'ICON Clinical Research Limited': 'ICON',
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
  'Department of Children, Disability and Equality': 'DCEDIY',
  'Meta Platforms, Inc.': 'Meta',
  'Airship Group Inc': 'Airship',
  'Coimisiún na Meán': 'Coimisiún na Meán',
};

function readSFData() {
  const workbook = XLSX.readFile(SF_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const sfData = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[14]) continue;
    
    const accountName = row[14] || '';
    const oppName = row[2] || '';
    const acv = parseFloat(row[5]) || 0;
    const tcv = parseFloat(row[6]) || 0;
    const term = parseFloat(row[10]) || 0;
    const endDateSerial = row[9];
    const targetSignDateSerial = row[4];
    const type = row[12] || '';
    
    const endDate = endDateSerial ? new Date((endDateSerial - 25569) * 86400 * 1000) : null;
    const targetSignDate = targetSignDateSerial ? new Date((targetSignDateSerial - 25569) * 86400 * 1000) : null;
    
    sfData.push({
      accountName,
      oppName,
      acv,
      tcv,
      term,
      endDate,
      targetSignDate,
      type,
    });
  }
  
  return sfData;
}

function aggregateSFByAccount(sfData) {
  const byAccount = {};
  
  for (const opp of sfData) {
    if (!byAccount[opp.accountName]) {
      byAccount[opp.accountName] = { 
        totalACV: 0, 
        opps: [],
        types: new Set(),
      };
    }
    byAccount[opp.accountName].totalACV += opp.acv;
    byAccount[opp.accountName].opps.push(opp);
    if (opp.type) byAccount[opp.accountName].types.add(opp.type);
  }
  
  return byAccount;
}

function runAudit() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('COMPREHENSIVE JH AUDIT - SF vs RR Revenue');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════\n');
  
  const sfData = readSFData();
  const sfByAccount = aggregateSFByAccount(sfData);
  
  const comparison = [];
  let sfTotal = 0;
  let rrTotal = 0;
  
  // Compare each RR account to SF
  for (const [rrName, rrData] of Object.entries(RR_REVENUE)) {
    const novRR = rrData.nov || 0;
    rrTotal += novRR;
    
    // Find matching SF account
    let sfAccountName = null;
    let sfACV = 0;
    
    for (const [sfName, sfAccount] of Object.entries(sfByAccount)) {
      const mappedName = SF_TO_RR[sfName] || sfName;
      if (mappedName === rrName || sfName.toLowerCase().includes(rrName.toLowerCase())) {
        sfAccountName = sfName;
        sfACV = sfAccount.totalACV;
        break;
      }
    }
    
    const gap = sfACV - novRR;
    
    comparison.push({
      rrAccount: rrName,
      sfAccount: sfAccountName || 'NOT FOUND',
      rrNovTarget: novRR,
      sfACV,
      gap,
      type: rrData.type,
      status: !sfAccountName ? 'MISSING' : (Math.abs(gap) < 100 ? 'OK' : (gap > 0 ? 'OVER' : 'UNDER')),
    });
  }
  
  // Check for extra SF accounts not in RR
  for (const [sfName, sfAccount] of Object.entries(sfByAccount)) {
    const mappedName = SF_TO_RR[sfName] || sfName;
    const isInRR = Object.keys(RR_REVENUE).some(rr => 
      rr === mappedName || sfName.toLowerCase().includes(rr.toLowerCase()) || rr.toLowerCase().includes(sfName.toLowerCase())
    );
    
    if (!isInRR && sfAccount.totalACV > 0) {
      comparison.push({
        rrAccount: 'N/A',
        sfAccount: sfName,
        rrNovTarget: 0,
        sfACV: sfAccount.totalACV,
        gap: sfAccount.totalACV,
        type: 'EXTRA',
        status: 'EXTRA',
      });
    }
    
    sfTotal += sfAccount.totalACV;
  }
  
  // Print results
  console.log('─'.repeat(120));
  console.log('ACCOUNTS NEEDING CORRECTION (Gap > $100)');
  console.log('─'.repeat(120) + '\n');
  
  const needsCorrection = comparison.filter(c => c.status !== 'OK');
  needsCorrection.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  
  for (const c of needsCorrection) {
    const gapStr = c.gap >= 0 ? `+$${c.gap.toLocaleString()}` : `-$${Math.abs(c.gap).toLocaleString()}`;
    console.log(`${c.status.padEnd(8)} | ${c.rrAccount.padEnd(25)} | RR: $${c.rrNovTarget.toLocaleString().padStart(12)} | SF: $${c.sfACV.toLocaleString().padStart(12)} | Gap: ${gapStr.padStart(15)}`);
  }
  
  console.log('\n' + '─'.repeat(120));
  console.log('ACCOUNTS ALIGNED (within $100)');
  console.log('─'.repeat(120) + '\n');
  
  const aligned = comparison.filter(c => c.status === 'OK');
  for (const c of aligned) {
    console.log(`✅ ${c.rrAccount.padEnd(28)} | $${c.sfACV.toLocaleString().padStart(12)}`);
  }
  
  // Summary
  console.log('\n' + '═'.repeat(120));
  console.log('SUMMARY');
  console.log('═'.repeat(120) + '\n');
  
  console.log(`SF Total ACV: $${sfTotal.toLocaleString()}`);
  console.log(`RR November Target: $${rrTotal.toLocaleString()}`);
  console.log(`Difference: $${(sfTotal - rrTotal).toLocaleString()}`);
  console.log(`\nAccounts needing correction: ${needsCorrection.length}`);
  console.log(`Accounts aligned: ${aligned.length}`);
  
  // Generate Excel report
  generateExcel(comparison, sfByAccount, needsCorrection);
}

async function generateExcel(comparison, sfByAccount, needsCorrection) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Corrections needed
  const corrSheet = workbook.addWorksheet('Corrections Needed');
  corrSheet.columns = [
    { header: 'Status', key: 'status', width: 10 },
    { header: 'RR Account', key: 'rrAccount', width: 25 },
    { header: 'SF Account', key: 'sfAccount', width: 40 },
    { header: 'RR Nov Target', key: 'rrNovTarget', width: 15 },
    { header: 'SF ACV', key: 'sfACV', width: 15 },
    { header: 'Gap', key: 'gap', width: 15 },
    { header: 'Action', key: 'action', width: 30 },
  ];
  corrSheet.getRow(1).font = { bold: true };
  
  for (const c of needsCorrection) {
    let action = '';
    if (c.status === 'MISSING') action = 'Add opportunity';
    else if (c.status === 'UNDER') action = `Increase ACV by $${Math.abs(c.gap).toLocaleString()}`;
    else if (c.status === 'OVER') action = `Reduce ACV by $${c.gap.toLocaleString()}`;
    else if (c.status === 'EXTRA') action = 'Verify if JH account or remove';
    
    const row = corrSheet.addRow({ ...c, action });
    
    if (c.status === 'MISSING') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    else if (c.status === 'UNDER') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    else if (c.status === 'OVER') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
    else if (c.status === 'EXTRA') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } };
  }
  
  corrSheet.getColumn('rrNovTarget').numFmt = '"$"#,##0.00';
  corrSheet.getColumn('sfACV').numFmt = '"$"#,##0.00';
  corrSheet.getColumn('gap').numFmt = '"$"#,##0.00';
  
  // Sheet 2: Full comparison
  const fullSheet = workbook.addWorksheet('Full Comparison');
  fullSheet.columns = [
    { header: 'RR Account', key: 'rrAccount', width: 25 },
    { header: 'SF Account', key: 'sfAccount', width: 40 },
    { header: 'RR Nov Target', key: 'rrNovTarget', width: 15 },
    { header: 'SF ACV', key: 'sfACV', width: 15 },
    { header: 'Gap', key: 'gap', width: 15 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Type', key: 'type', width: 12 },
  ];
  fullSheet.getRow(1).font = { bold: true };
  
  for (const c of comparison.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))) {
    fullSheet.addRow(c);
  }
  
  fullSheet.getColumn('rrNovTarget').numFmt = '"$"#,##0.00';
  fullSheet.getColumn('sfACV').numFmt = '"$"#,##0.00';
  fullSheet.getColumn('gap').numFmt = '"$"#,##0.00';
  
  await workbook.xlsx.writeFile(OUTPUT_FILE);
  console.log(`\n✅ Excel report saved to: ${OUTPUT_FILE}`);
}

runAudit();


