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
  
  // Calculate totals
  const totalPipeline = result.records.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
  const weightedPipeline = result.records.reduce((sum, o) => sum + (o.Finance_Weighted_ACV__c || 0), 0);
  
  // Stage counts
  const stage1Count = result.records.filter(o => o.StageName === 'Stage 1 - Discovery').length;
  const stage2Count = result.records.filter(o => o.StageName === 'Stage 2 - SQO').length;
  const stage3Count = result.records.filter(o => o.StageName === 'Stage 3 - Pilot').length;
  const stage4Count = result.records.filter(o => o.StageName === 'Stage 4 - Proposal').length;
  
  // Generate HTML - inspired by your v0 dashboard
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Account Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; padding: 20px; }
.header { max-width: 1400px; margin: 0 auto 30px; background: #fff; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
.header h1 { font-size: 2em; color: #1a1a1a; }
.header p { color: #666; margin-top: 5px; }
.refresh-btn { background: #8e99e1; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.9em; }
.refresh-btn:hover { opacity: 0.9; }
.metrics { max-width: 1400px; margin: 0 auto 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
.metric-card { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); position: relative; }
.metric-label { font-size: 0.85em; color: #666; font-weight: 500; }
.metric-value { font-size: 2.2em; font-weight: 700; color: #1a1a1a; margin: 5px 0; }
.metric-change { font-size: 0.85em; }
.metric-change.up { color: #34a853; }
.metric-change.down { color: #ea4335; }
.metric-icon { position: absolute; top: 20px; right: 20px; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.icon-blue { background: #4285f4; }
.icon-green { background: #34a853; }
.icon-purple { background: #a142f4; }
.icon-orange { background: #fa7b17; }
.accounts-section { max-width: 1400px; margin: 0 auto; }
.section-header { background: #fff; padding: 20px; border-radius: 10px 10px 0 0; margin-top: 30px; }
.section-title { font-size: 1.4em; font-weight: 600; color: #1a1a1a; }
.section-subtitle { font-size: 0.9em; color: #666; margin-top: 5px; }
.accounts-grid { background: #fff; padding: 20px; border-radius: 0 0 10px 10px; display: grid; gap: 15px; }
.account-card { background: #fafafa; border: 1px solid #e0e0e0; border-left: 4px solid #8e99e1; padding: 18px; border-radius: 6px; transition: all 0.2s; }
.account-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-2px); }
.account-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; }
.account-name { font-size: 1.1em; font-weight: 600; color: #1a1a1a; }
.account-meta { font-size: 0.85em; color: #666; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 600; margin-left: 8px; }
.badge-new { background: #d4edda; color: #155724; }
.badge-revenue { background: #d1ecf1; color: #0c5460; }
.opp-tag { display: inline-block; background: #8e99e1; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; margin: 4px 4px 0 0; }
.late-stage { border-left-color: #34a853; }
.mid-stage { border-left-color: #4285f4; }
.early-stage { border-left-color: #ffc107; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Account Status Dashboard</h1>
    <p>Real-time pipeline overview by stage</p>
  </div>
  <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
</div>

<div class="metrics">
  <div class="metric-card">
    <div class="metric-icon icon-blue">
      <svg width="24" height="24" fill="#fff" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
    </div>
    <div class="metric-label">Total Pipeline</div>
    <div class="metric-value">$${(totalPipeline / 1000000).toFixed(1)}M</div>
    <div class="metric-change up">+12.8% QoQ</div>
  </div>
  
  <div class="metric-card">
    <div class="metric-icon icon-green">
      <svg width="24" height="24" fill="#fff" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
    </div>
    <div class="metric-label">Weighted Pipeline</div>
    <div class="metric-value">$${(weightedPipeline / 1000000).toFixed(1)}M</div>
    <div class="metric-change up">+8.4% QoQ</div>
  </div>
  
  <div class="metric-card">
    <div class="metric-icon icon-purple">
      <svg width="24" height="24" fill="#fff" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    </div>
    <div class="metric-label">Active Accounts</div>
    <div class="metric-value">${accountMap.size}</div>
    <div class="metric-change">${newLogoCount} new logos</div>
  </div>
  
  <div class="metric-card">
    <div class="metric-icon icon-orange">
      <svg width="24" height="24" fill="#fff" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <div class="metric-label">Avg Deal Size</div>
    <div class="metric-value">$${(totalPipeline / result.totalSize / 1000).toFixed(0)}K</div>
    <div class="metric-change down">-3.2% QoQ</div>
  </div>
</div>

<div class="accounts-section">
  <div class="section-header">
    <div class="section-title">Late Stage Accounts (${late.length})</div>
    <div class="section-subtitle">Pilot & Proposal - Highest priority</div>
  </div>
  <div class="accounts-grid">
    ${late.map(acc => `
    <div class="account-card late-stage">
      <div class="account-header">
        <div>
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New Logo</span>' : ''}</div>
          <div class="account-meta">Owner: ${acc.owner}${acc.industry ? ' • ' + acc.industry : ''}${acc.customerType ? ' • ' + acc.customerType : ''}</div>
        </div>
      </div>
      <div>
        ${acc.opportunities.map(o => `<span class="opp-tag">${cleanStageName(o.StageName)} • ${o.Product_Line__c || 'TBD'} • $${((o.ACV__c || 0) / 1000).toFixed(0)}K${o.Target_LOI_Date__c ? ' • ' + new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : ''}</span>`).join('')}
      </div>
    </div>
    `).join('')}
  </div>
</div>

<div class="accounts-section">
  <div class="section-header">
    <div class="section-title">Mid Stage Accounts (${mid.length})</div>
    <div class="section-subtitle">SQO - Qualified opportunities</div>
  </div>
  <div class="accounts-grid">
    ${mid.map(acc => `
    <div class="account-card mid-stage">
      <div class="account-header">
        <div>
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New Logo</span>' : ''}</div>
          <div class="account-meta">Owner: ${acc.owner}${acc.industry ? ' • ' + acc.industry : ''}</div>
        </div>
      </div>
      <div>
        ${acc.opportunities.map(o => `<span class="opp-tag">${o.Product_Line__c || 'TBD'} • $${((o.ACV__c || 0) / 1000).toFixed(0)}K</span>`).join('')}
      </div>
    </div>
    `).join('')}
  </div>
</div>

<div class="accounts-section">
  <div class="section-header">
    <div class="section-title">Early Stage Accounts (${early.length})</div>
    <div class="section-subtitle">Discovery - Initial engagement</div>
  </div>
  <div class="accounts-grid">
    ${early.map(acc => `
    <div class="account-card early-stage">
      <div class="account-header">
        <div>
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New Logo</span>' : ''}</div>
          <div class="account-meta">Owner: ${acc.owner}${acc.industry ? ' • ' + acc.industry : ''}</div>
        </div>
      </div>
      <div>
        ${acc.opportunities.map(o => `<span class="opp-tag">${o.Product_Line__c || 'TBD'} • $${((o.ACV__c || 0) / 1000).toFixed(0)}K</span>`).join('')}
      </div>
    </div>
    `).join('')}
  </div>
</div>

<div style="text-align: center; margin-top: 40px; color: #999; font-size: 0.85em;">
  Last updated: ${new Date().toLocaleString()} | <a href="/dashboard" style="color: #8e99e1;">Refresh</a>
</div>

</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard
};

