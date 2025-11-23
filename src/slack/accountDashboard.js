const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');

/**
 * Generate Account Status Dashboard - Mobile-optimized with tabs
 * Matches v0 interview dashboard quality
 */
async function generateAccountDashboard() {
  // Use SAME logic as weighted pipeline query (from events.js)
  const pipelineQuery = `SELECT StageName,
                                SUM(ACV__c) GrossAmount,
                                SUM(Finance_Weighted_ACV__c) WeightedAmount,
                                COUNT(Id) DealCount
                         FROM Opportunity
                         WHERE IsClosed = false 
                           AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                         GROUP BY StageName`;
  
  const pipelineData = await query(pipelineQuery, true);
  
  // Calculate totals (REAL data, not mock)
  let totalGross = 0;
  let totalWeighted = 0;
  let totalDeals = 0;
  
  pipelineData.records.forEach(r => {
    totalGross += r.GrossAmount || 0;
    totalWeighted += r.WeightedAmount || 0;
    totalDeals += r.DealCount || 0;
  });
  
  const avgDealSize = totalDeals > 0 ? totalGross / totalDeals : 0;
  
  // Query accounts with opportunities
  const accountQuery = `SELECT Account.Name, Account.Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c,
                               Name, StageName, ACV__c, Product_Line__c
                        FROM Opportunity
                        WHERE IsClosed = false
                          AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                        ORDER BY StageName DESC, Account.Name`;
  
  const accountData = await query(accountQuery, true);
  
  // Group by account
  const accountMap = new Map();
  let newLogoCount = 0;
  
  accountData.records.forEach(opp => {
    const accountName = opp.Account?.Name;
    
    if (!accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        owner: opp.Account?.Owner?.Name,
        isNewLogo: opp.Account?.Is_New_Logo__c,
        hasAccountPlan: !!opp.Account?.Account_Plan_s__c,
        opportunities: [],
        highestStage: 0
      });
      if (opp.Account?.Is_New_Logo__c) newLogoCount++;
    }
    
    const account = accountMap.get(accountName);
    account.opportunities.push(opp);
    
    const stageNum = parseInt(opp.StageName.match(/Stage (\d)/)?.[1] || 0);
    account.highestStage = Math.max(account.highestStage, stageNum);
  });
  
  // Categorize by stage
  const late = [], mid = [], early = [];
  accountMap.forEach(acc => {
    if (acc.highestStage >= 3) late.push(acc);
    else if (acc.highestStage === 2) mid.push(acc);
    else early.push(acc);
  });
  
  // Count accounts with/without plans
  const accountsWithPlans = Array.from(accountMap.values()).filter(a => a.hasAccountPlan).length;
  const accountsWithoutPlans = accountMap.size - accountsWithPlans;
  
  // For "By Stage" tab - group by stage for detailed breakdown
  const stageBreakdown = {
    'Stage 4 - Proposal': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 3 - Pilot': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 2 - SQO': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 1 - Discovery': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 }
  };
  
  pipelineData.records.forEach(r => {
    if (stageBreakdown[r.StageName]) {
      stageBreakdown[r.StageName].totalACV = r.GrossAmount || 0;
      stageBreakdown[r.StageName].weightedACV = r.WeightedAmount || 0;
      stageBreakdown[r.StageName].count = r.DealCount || 0;
    }
  });
  
  // Group by BL
  const blBreakdown = {};
  accountData.records.forEach(opp => {
    const blName = opp.Account?.Owner?.Name || 'Unassigned';
    if (!blBreakdown[blName]) {
      blBreakdown[blName] = { totalACV: 0, weightedACV: 0, count: 0 };
    }
    blBreakdown[blName].totalACV += opp.ACV__c || 0;
    blBreakdown[blName].weightedACV += opp.Finance_Weighted_ACV__c || 0;
    blBreakdown[blName].count++;
  });
  
  // Group by product
  const productBreakdown = {};
  accountData.records.forEach(opp => {
    const product = opp.Product_Line__c || 'Undetermined';
    if (!productBreakdown[product]) {
      productBreakdown[product] = { totalACV: 0, weightedACV: 0, count: 0 };
    }
    productBreakdown[product].totalACV += opp.ACV__c || 0;
    productBreakdown[product].weightedACV += opp.Finance_Weighted_ACV__c || 0;
    productBreakdown[product].count++;
  });
  
  // Generate mobile-optimized tabbed HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account Status Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; padding: 16px; }
.header { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.header h1 { font-size: 1.5rem; font-weight: 700; color: #1f2937; margin-bottom: 4px; }
.header p { font-size: 0.875rem; color: #6b7280; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; }
.tab { background: #fff; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; white-space: nowrap; color: #6b7280; }
.tab.active { background: #8e99e1; color: #fff; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
.metric { background: #fff; padding: 16px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.metric-label { font-size: 0.75rem; color: #6b7280; font-weight: 500; margin-bottom: 4px; }
.metric-value { font-size: 1.75rem; font-weight: 700; color: #1f2937; margin-bottom: 2px; }
.metric-change { font-size: 0.75rem; font-weight: 500; }
.up { color: #10b981; }
.down { color: #ef4444; }
.stage-section { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; }
.stage-title { font-size: 1.125rem; font-weight: 600; color: #1f2937; margin-bottom: 4px; }
.stage-subtitle { font-size: 0.875rem; color: #6b7280; margin-bottom: 16px; }
.account-list { display: flex; flex-direction: column; gap: 8px; }
.account-item { font-size: 0.875rem; color: #374151; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
.account-item:last-child { border-bottom: none; }
.account-name { font-weight: 600; color: #1f2937; }
.account-owner { color: #6b7280; font-size: 0.8125rem; margin-top: 2px; }
.account-card { background: #fafafa; border-left: 4px solid #8e99e1; padding: 12px; border-radius: 6px; margin-bottom: 12px; }
.card-late { border-left-color: #10b981; }
.card-mid { border-left-color: #3b82f6; }
.card-early { border-left-color: #f59e0b; }
.opp-pill { display: inline-block; background: #8e99e1; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; margin: 4px 4px 0 0; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; margin-left: 6px; }
.badge-new { background: #d1fae5; color: #065f46; }
.plan-status { margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; }
.plan-stat { display: inline-block; margin-right: 20px; }
.plan-stat-value { font-weight: 700; font-size: 1.25rem; color: #1f2937; }
.plan-stat-label { font-size: 0.75rem; color: #6b7280; }
@media (min-width: 640px) { .metrics { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>

<div class="header">
  <h1>Account Status Dashboard</h1>
  <p>Real-time pipeline overview • Updated ${new Date().toLocaleTimeString()}</p>
</div>

<div class="tabs">
  <button class="tab active" data-tab="summary">Summary</button>
  <button class="tab" data-tab="by-stage">By Stage</button>
  <button class="tab" data-tab="account-plans">Account Plans</button>
</div>

<!-- TAB 1: SUMMARY -->
<div id="summary" class="tab-content active">
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Pipeline</div>
      <div class="metric-value">$${(totalGross / 1000000).toFixed(1)}M</div>
    </div>
    <div class="metric">
      <div class="metric-label">Weighted</div>
      <div class="metric-value">$${(totalWeighted / 1000000).toFixed(1)}M</div>
    </div>
    <div class="metric">
      <div class="metric-label">Accounts</div>
      <div class="metric-value">${accountMap.size}</div>
      <div class="metric-change">${newLogoCount} new</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Deal</div>
      <div class="metric-value">$${(avgDealSize / 1000).toFixed(0)}K</div>
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Late Stage (${late.length})</div>
    <div class="account-list">
      ${late.slice(0, 5).map(acc => `
        <div class="account-item">
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : ''}</div>
          <div class="account-owner">${acc.owner} • ${acc.opportunities.length} opp${acc.opportunities.length > 1 ? 's' : ''}</div>
        </div>
      `).join('')}
      ${late.length > 5 ? `<div class="account-item" style="color: #6b7280;">+${late.length - 5} more...</div>` : ''}
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Mid Stage (${mid.length})</div>
    <div class="account-list">
      ${mid.slice(0, 5).map(acc => `
        <div class="account-item">
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : ''}</div>
          <div class="account-owner">${acc.owner}</div>
        </div>
      `).join('')}
      ${mid.length > 5 ? `<div class="account-item" style="color: #6b7280;">+${mid.length - 5} more...</div>` : ''}
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Early Stage (${early.length})</div>
    <div class="account-list">
      ${early.slice(0, 5).map(acc => `
        <div class="account-item">
          <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : ''}</div>
          <div class="account-owner">${acc.owner}</div>
        </div>
      `).join('')}
      ${early.length > 5 ? `<div class="account-item" style="color: #6b7280;">+${early.length - 5} more...</div>` : ''}
    </div>
  </div>
</div>

<!-- TAB 2: BY STAGE (Detailed Breakdowns) -->
<div id="by-stage" class="tab-content">
  <div class="stage-section">
    <div class="stage-title">Stage Overview</div>
    <table style="width: 100%; font-size: 0.875rem; margin-top: 12px;">
      <tr style="background: #f9fafb; font-weight: 600;"><td>Stage</td><td>Opps</td><td>Total ACV</td><td>Weighted</td></tr>
      ${Object.entries(stageBreakdown).map(([stage, data]) => `
        <tr><td>${cleanStageName(stage)}</td><td>${data.count}</td><td>$${(data.totalACV / 1000000).toFixed(2)}M</td><td>$${(data.weightedACV / 1000000).toFixed(2)}M</td></tr>
      `).join('')}
    </table>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Business Lead Overview</div>
    <table style="width: 100%; font-size: 0.875rem; margin-top: 12px;">
      <tr style="background: #f9fafb; font-weight: 600;"><td>BL</td><td>Opps</td><td>Total ACV</td><td>Weighted</td></tr>
      ${Object.entries(blBreakdown).sort((a, b) => b[1].totalACV - a[1].totalACV).map(([bl, data]) => `
        <tr><td>${bl}</td><td>${data.count}</td><td>$${(data.totalACV / 1000000).toFixed(2)}M</td><td>$${(data.weightedACV / 1000000).toFixed(2)}M</td></tr>
      `).join('')}
    </table>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Products by Stage</div>
    <table style="width: 100%; font-size: 0.875rem; margin-top: 12px;">
      <tr style="background: #f9fafb; font-weight: 600;"><td>Product</td><td>Opps</td><td>Total ACV</td><td>Weighted</td></tr>
      ${Object.entries(productBreakdown).sort((a, b) => b[1].totalACV - a[1].totalACV).map(([product, data]) => `
        <tr><td>${product}</td><td>${data.count}</td><td>$${(data.totalACV / 1000000).toFixed(2)}M</td><td>$${(data.weightedACV / 1000000).toFixed(2)}M</td></tr>
      `).join('')}
    </table>
  </div>
</div>

<!-- TAB 3: ACCOUNT PLANS (Smart Summaries) -->
<div id="account-plans" class="tab-content">
  <div class="metrics" style="margin-bottom: 16px;">
    <div class="metric">
      <div class="metric-label">With Plans</div>
      <div class="metric-value">${accountsWithPlans}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Missing Plans</div>
      <div class="metric-value">${accountsWithoutPlans}</div>
    </div>
  </div>
  
  ${Array.from(accountMap.values()).sort((a, b) => b.totalACV - a.totalACV).map(acc => {
    const oppCount = acc.opportunities.length;
    const totalACV = acc.totalACV;
    const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
    const productList = products.join(', ') || 'TBD';
    
    return `
    <div class="account-card card-${acc.highestStage >= 3 ? 'late' : acc.highestStage === 2 ? 'mid' : 'early'}">
      <div class="account-name">${acc.name}${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : ''}</div>
      <div class="account-owner" style="margin-bottom: 8px;">${acc.owner} • Stage ${acc.highestStage}</div>
      
      ${acc.hasAccountPlan ? `
        <div style="background: #f0f9ff; padding: 8px; border-radius: 4px; font-size: 0.8125rem; color: #1e40af;">
          ✓ Account Plan exists
        </div>
      ` : `
        <div style="background: #fefce8; padding: 8px; border-radius: 4px; font-size: 0.8125rem; color: #713f12;">
          <strong>Summary:</strong> ${oppCount} open opp${oppCount > 1 ? 's' : ''} totaling $${(totalACV / 1000000) >= 1 ? (totalACV / 1000000).toFixed(2) + 'M' : (totalACV / 1000).toFixed(0) + 'K'} across ${products.length > 1 ? products.length + ' products' : productList}.
          ${acc.highestStage >= 2 ? '<br><strong>⚠️ Account Plan required for Stage 2+</strong>' : ''}
        </div>
      `}
    </div>
    `;
  }).join('')}
</div>

<script>
// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  console.log('Dashboard loaded, initializing tabs...');
  
  // Get all tab buttons
  const tabButtons = document.querySelectorAll('.tab');
  
  console.log('Found', tabButtons.length, 'tab buttons');
  
  // Add click handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      console.log('Tab clicked:', tabName);
      
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // Deactivate all tab buttons
      document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // Show selected tab
      const tabContent = document.getElementById(tabName);
      if (tabContent) {
        tabContent.classList.add('active');
        console.log('Showing tab:', tabName);
      } else {
        console.error('Tab not found:', tabName);
      }
      
      // Activate clicked button
      this.classList.add('active');
    });
  });
  
  console.log('Tab initialization complete');
});
</script>

</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard
};
