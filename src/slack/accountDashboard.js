const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');

/**
 * Generate Account Status Dashboard - Clean web view for executives
 */
async function generateAccountDashboard() {
  // Query all active pipeline
  const dashboardQuery = `SELECT Account.Name, Account.Owner.Name, Account.Is_New_Logo__c,
                                 Name, StageName, ACV__c, Product_Line__c, Target_LOI_Date__c,
                                 Account.Industry_Grouping__c, Account.Customer_Type__c
                          FROM Opportunity
                          WHERE IsClosed = false
                            AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                          ORDER BY StageName DESC, Account.Name`;
  
  const result = await query(dashboardQuery);
  
  if (!result || !result.records || result.totalSize === 0) {
    return '<html><body><h1>No active pipeline found</h1></body></html>';
  }
  
  // Group by account
  const accountMap = new Map();
  let newLogoCount = 0;
  
  result.records.forEach(opp => {
    const accountName = opp.Account?.Name;
    
    if (!accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        owner: opp.Account?.Owner?.Name,
        isNewLogo: opp.Account?.Is_New_Logo__c,
        customerType: opp.Account?.Customer_Type__c,
        industry: opp.Account?.Industry_Grouping__c,
        opportunities: [],
        highestStage: 0
      });
      if (opp.Account?.Is_New_Logo__c) newLogoCount++;
    }
    
    const account = accountMap.get(accountName);
    account.opportunities.push(opp);
    
    // Track highest stage
    const stageNum = parseInt(opp.StageName.match(/Stage (\d)/)?.[1] || 0);
    account.highestStage = Math.max(account.highestStage, stageNum);
  });
  
  // Categorize
  const early = [];
  const mid = [];
  const late = [];
  
  accountMap.forEach(account => {
    if (account.highestStage === 1) early.push(account);
    else if (account.highestStage === 2) mid.push(account);
    else if (account.highestStage >= 3) late.push(account);
  });
  
  // Generate HTML
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account Status Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }
.container { max-width: 1200px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
h1 { color: #000; font-size: 1.8em; margin-bottom: 20px; border-bottom: 3px solid #000; padding-bottom: 10px; }
.summary { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-bottom: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
.stat { text-align: center; }
.stat-number { font-size: 2.5em; font-weight: 700; color: #000; }
.stat-label { color: #666; font-size: 0.9em; margin-top: 5px; }
h2 { color: #000; font-size: 1.3em; margin: 25px 0 15px 0; padding: 10px; background: #000; color: #fff; border-radius: 4px; }
.account-card { background: #fff; border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; border-left: 4px solid #667eea; }
.account-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.account-name { font-size: 1.1em; font-weight: 600; color: #000; margin-bottom: 5px; }
.account-owner { color: #666; font-size: 0.9em; margin-bottom: 10px; }
.opp-list { margin-top: 10px; }
.opp-item { background: #f9f9f9; padding: 8px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; }
.badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 0.75em; font-weight: 600; margin-left: 8px; }
.badge-new-logo { background: #28a745; color: #fff; }
.badge-customer { background: #17a2b8; color: #fff; }
.stage-1 { border-left-color: #ffc107; }
.stage-2 { border-left-color: #17a2b8; }
.stage-3 { border-left-color: #667eea; }
.stage-4 { border-left-color: #28a745; }
.updated { text-align: center; color: #999; margin-top: 30px; font-size: 0.85em; }
@media (max-width: 768px) { .summary { grid-template-columns: 1fr 1fr; } .stat-number { font-size: 2em; } }
</style>
</head>
<body>
<div class="container">
<h1>Account Status Dashboard</h1>

<div class="summary">
  <div class="stat"><div class="stat-number">${accountMap.size}</div><div class="stat-label">Active Accounts</div></div>
  <div class="stat"><div class="stat-number">${newLogoCount}</div><div class="stat-label">New Logos</div></div>
  <div class="stat"><div class="stat-number">${early.length}</div><div class="stat-label">Early Stage</div></div>
  <div class="stat"><div class="stat-number">${mid.length}</div><div class="stat-label">Mid Stage</div></div>
  <div class="stat"><div class="stat-number">${late.length}</div><div class="stat-label">Late Stage</div></div>
</div>

<h2>Late Stage (Pilot/Proposal) - ${late.length} Accounts</h2>
${late.map(acc => `
<div class="account-card stage-${acc.highestStage}">
  <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new-logo">New Logo</span>' : ''}${acc.customerType ? '<span class="badge badge-customer">' + acc.customerType + '</span>' : ''}</div>
  <div class="account-owner">Owner: ${acc.owner}${acc.industry ? ' | ' + acc.industry : ''}</div>
  <div class="opp-list">
    ${acc.opportunities.map(o => `<div class="opp-item">${cleanStageName(o.StageName)} - ${o.Product_Line__c || 'TBD'} - $${((o.ACV__c || 0) / 1000).toFixed(0)}K${o.Target_LOI_Date__c ? ' - Target: ' + new Date(o.Target_LOI_Date__c).toLocaleDateString() : ''}</div>`).join('')}
  </div>
</div>
`).join('')}

<h2>Mid Stage (SQO) - ${mid.length} Accounts</h2>
${mid.map(acc => `
<div class="account-card stage-${acc.highestStage}">
  <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new-logo">New Logo</span>' : ''}</div>
  <div class="account-owner">Owner: ${acc.owner}${acc.industry ? ' | ' + acc.industry : ''}</div>
  <div class="opp-list">
    ${acc.opportunities.map(o => `<div class="opp-item">${cleanStageName(o.StageName)} - ${o.Product_Line__c || 'TBD'} - $${((o.ACV__c || 0) / 1000).toFixed(0)}K</div>`).join('')}
  </div>
</div>
`).join('')}

<h2>Early Stage (Discovery) - ${early.length} Accounts</h2>
${early.map(acc => `
<div class="account-card stage-${acc.highestStage}">
  <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new-logo">New Logo</span>' : ''}</div>
  <div class="account-owner">Owner: ${acc.owner}${acc.industry ? ' | ' + acc.industry : ''}</div>
  <div class="opp-list">
    ${acc.opportunities.map(o => `<div class="opp-item">${o.Product_Line__c || 'TBD'} - $${((o.ACV__c || 0) / 1000).toFixed(0)}K</div>`).join('')}
  </div>
</div>
`).join('')}

<div class="updated">Last updated: ${new Date().toLocaleString()} | Auto-refreshes on page reload</div>
</div>
</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard
};

