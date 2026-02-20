/**
 * Populate CS_Outcomes__c on Account records from spreadsheet data.
 * Uses the server's Salesforce connection to update accounts.
 * 
 * Usage: node scripts/populate_cs_outcomes.js
 * Requires: SERVER running (uses /api/sf/query endpoint) or direct SF connection
 */

const outcomes = [
  // ── Delivered Outcomes ──
  { account: "Coherent", product: "Contracting", status: "Delivered", outcome: "61% faster total turnaround time; 82% faster first response time; Shift from hourly billing to outcome-based pricing" },
  { account: "Coherent", product: "Sigma", status: "Delivered", outcome: "Created ~1.1k hours of incremental team capacity per month" },
  { account: "Coherent", product: "M&A", status: "Delivered", outcome: "Reduction of 75 hours in legal diligence effort for a transaction" },
  { account: "Coherent", product: "Insights", status: "Delivered", outcome: "Created ~120.5k hours of incremental team capacity per month" },
  { account: "Chevron", product: "Compliance", status: "Delivered", outcome: "54% reduction in marketing compliance review time" },
  { account: "Cargill", product: "Sigma", status: "Delivered", outcome: "Created ~26.8k hours of incremental team capacity per month" },
  { account: "Cargill", product: "Insights", status: "Delivered", outcome: "50% reduction in legal research time to uncover strategic Insights alongside business partners" },
  { account: "CN - Nordy", product: "Insights", status: "Delivered", outcome: "64% reduction in outside counsel spend on contract analysis in legal crisis" },
  { account: "CN - Dory", product: "M&A", status: "Delivered", outcome: "50% reduction in commercial legal diligence cost and 90% faster (2 days instead of 3 weeks)" },
  { account: "CN - Pete", product: "Contracting", status: "Delivered", outcome: "39% reduction in legal review time for contracting" },
  { account: "Stripe", product: "Contracting", status: "Delivered", outcome: "Delivered 60% outside counsel cost savings across 5 agreement types" },
  { account: "Duracell", product: "Contracting", status: "Delivered", outcome: "Delivered 50%+ reduction in contracting spend" },
  { account: "Intuit", product: "Compliance", status: "Delivered", outcome: "Delivered 30% improvement in marketing compliance review time" },
  { account: "CN - Goofy", product: "M&A", status: "Delivered", outcome: "Delivered 40% faster M&A diligence report on critical transaction" },
  { account: "Southwest", product: "Litigation", status: "Delivered", outcome: "90% efficiency in creating labor arbitration briefs; Increased win rates for arbitration with a potential for $15-20M savings" },
  { account: "Duracell", product: "Insights", status: "Delivered", outcome: "50 bps increase in margins due to better pricing and faster deals; >$10M value identified via real-time insights on pricing and rebate terms from contracts" },
  { account: "Toshiba", product: "Litigation", status: "Delivered", outcome: "Hours of time saved per person per day driving accelerated case preparation and enhanced case strategy (13k case documents)" },
  { account: "Graybar", product: "Contracting", status: "Delivered", outcome: "NDA reviews from 55 minutes to 2 minutes" },

  // ── In Delivery ──
  { account: "Cargill", product: "Contracting", status: "In Delivery", outcome: "Transformation of GCG - a 35+ person shared services center - into an AI-native contracting engine, delivering faster transactions with a scalable model" },
  { account: "Cargill", product: "Litigation", status: "In Delivery", outcome: "Faster case prep, enhanced case strategy" },
  { account: "Asana", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "Intuit", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "Intuit", product: "Sigma", status: "In Delivery", outcome: "Daily AI time savings across full legal team (wide variety of activities)" },
  { account: "Chevron", product: "Litigation", status: "In Delivery", outcome: "Faster case prep, enhanced case strategy" },
  { account: "Bayer", product: "Compliance", status: "In Delivery", outcome: "Faster compliance review, improved intelligence across risk areas, consistent application of Bayer standards to reduce risk" },
  { account: "U.S. Air Force", product: "Compliance", status: "In Delivery", outcome: "50% reduction in procurement administrative lead time (PALT)" },
  { account: "CN - Goofy", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "ECMS", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "AES", product: "Sigma", status: "In Delivery", outcome: "Daily AI time savings across full legal team (wide variety of activities)" },
  { account: "WPCG", product: "Insights", status: "In Delivery", outcome: "Enhanced negotiation strategy against consistent counterparties in M&A transactions" },
  { account: "IQVIA", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "IQVIA", product: "Sigma", status: "In Delivery", outcome: "Daily AI time savings across full legal team (wide variety of activities)" },
  { account: "IQVIA", product: "Insights", status: "In Delivery", outcome: "Faster, enhanced insights across 100,000+ legal documents" },
  { account: "DHL", product: "Insights", status: "In Delivery", outcome: "Improve M&A diligence, execution, and integration activities via document intelligence pre and post acquisition" },
  { account: "Wellspring Foundation", product: "Sigma", status: "In Delivery", outcome: "Faster and cheaper grant diligence processes" },
  { account: "Sequoia Foundation", product: "Sigma", status: "In Delivery", outcome: "Faster and cheaper grant diligence processes" },
  { account: "Dropbox", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "Ecolab", product: "Compliance", status: "In Delivery", outcome: "Faster compliance review with reduced headcount" },
  { account: "Aryza", product: "Contracting", status: "In Delivery", outcome: "Faster compliance review execution" },
  { account: "PetSmart", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "ServiceNow", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },
  { account: "ServiceNow", product: "Compliance", status: "In Delivery", outcome: "Faster compliance review" },
  { account: "ServiceNow", product: "Sigma", status: "In Delivery", outcome: "Daily AI time savings across full legal team (wide variety of activities)" },
  { account: "ServiceNow", product: "Insights", status: "In Delivery", outcome: "Faster, enhanced insights across legal documents" },
  { account: "The Wonderful Company", product: "Sigma", status: "In Delivery", outcome: "Daily AI time savings across full legal team (wide variety of activities)" },
  { account: "The Wonderful Company", product: "Insights", status: "In Delivery", outcome: "Faster, enhanced insights across legal documents" },
  { account: "Perrigo", product: "Contracting", status: "In Delivery", outcome: "Faster contract execution" },

  // ── Near-Term Pipeline (kick-off 30-60 days) ──
  { account: "Udemy", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Udemy", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Udemy", product: "Contracting", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "CN - Albert", product: "Contracting", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "CN - Albert", product: "Compliance", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Home Depot", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Home Depot", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Home Depot", product: "Compliance", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "CHS", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "CHS", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Best Buy", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Best Buy", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Western Digital", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Western Digital", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Western Digital", product: "Contracting", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Wier Group", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Wier Group", product: "Insights", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Wier Group", product: "Contracting", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "Southwest", product: "Contracting", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
  { account: "World Wide Technology", product: "Sigma", status: "Near-Term", outcome: "Target outcomes being defined with CLO ahead of kick-off" },
];

// Group by account
const byAccount = {};
for (const o of outcomes) {
  if (!byAccount[o.account]) byAccount[o.account] = [];
  byAccount[o.account].push({ status: o.status, product: o.product, outcome: o.outcome });
}

// Output the JSON per account for manual verification
console.log(`\n=== CS Outcomes Data: ${Object.keys(byAccount).length} accounts, ${outcomes.length} outcomes ===\n`);

for (const [account, items] of Object.entries(byAccount)) {
  const delivered = items.filter(i => i.status === 'Delivered').length;
  const inDelivery = items.filter(i => i.status === 'In Delivery').length;
  const nearTerm = items.filter(i => i.status === 'Near-Term').length;
  console.log(`${account}: ${delivered} delivered, ${inDelivery} in delivery, ${nearTerm} near-term`);
}

// Generate SOQL + DML for Salesforce deployment
console.log('\n=== Salesforce Anonymous Apex Script ===\n');
console.log('// Run this in Developer Console > Execute Anonymous\n');

for (const [account, items] of Object.entries(byAccount)) {
  const json = JSON.stringify(items).replace(/'/g, "\\'");
  // Use LIKE for fuzzy matching (handles "CN - " codenames and partial names)
  const searchName = account.replace(/'/g, "\\'");
  console.log(`try {`);
  console.log(`  Account a = [SELECT Id, CS_Outcomes__c FROM Account WHERE Name LIKE '${searchName}%' LIMIT 1];`);
  console.log(`  a.CS_Outcomes__c = '${json}';`);
  console.log(`  update a;`);
  console.log(`  System.debug('Updated: ${searchName}');`);
  console.log(`} catch (Exception e) { System.debug('SKIP ${searchName}: ' + e.getMessage()); }\n`);
}
