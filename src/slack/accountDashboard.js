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
  
  // Query accounts with opportunities AND Finance_Weighted_ACV__c
  const accountQuery = `SELECT Account.Name, Account.Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c, Account.Customer_Type__c,
                               Name, StageName, ACV__c, Finance_Weighted_ACV__c, Product_Line__c
                        FROM Opportunity
                        WHERE IsClosed = false
                          AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                        ORDER BY StageName DESC, Account.Name`;
  
  const accountData = await query(accountQuery, true);
  
  // Query Einstein Activity for meeting dates per account
  let meetingData = new Map();
  try {
    // Get last and next meetings per account
    const lastMeetingQuery = `SELECT WhatId, MAX(ActivityDate) LastMeeting
                              FROM Event
                              WHERE ActivityDate < TODAY
                                AND (Type = 'Meeting' OR Type = 'Call')
                                AND WhatId != null
                              GROUP BY WhatId`;
    
    const nextMeetingQuery = `SELECT WhatId, MIN(ActivityDate) NextMeeting
                              FROM Event
                              WHERE ActivityDate >= TODAY
                                AND (Type = 'Meeting' OR Type = 'Call')
                                AND WhatId != null
                              GROUP BY WhatId`;
    
    const lastMeetings = await query(lastMeetingQuery, true);
    const nextMeetings = await query(nextMeetingQuery, true);
    
    // Map to account IDs
    lastMeetings.records.forEach(m => {
      if (!meetingData.has(m.WhatId)) meetingData.set(m.WhatId, {});
      meetingData.get(m.WhatId).lastMeeting = m.LastMeeting;
    });
    
    nextMeetings.records.forEach(m => {
      if (!meetingData.has(m.WhatId)) meetingData.set(m.WhatId, {});
      meetingData.get(m.WhatId).nextMeeting = m.NextMeeting;
    });
  } catch (e) {
    // Einstein Activity not available, continue without meeting data
  }
  
  // Group by account and CALCULATE totalACV properly
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
        accountPlan: opp.Account?.Account_Plan_s__c,
        customerType: opp.Account?.Customer_Type__c,
        opportunities: [],
        highestStage: 0,
        totalACV: 0, // CRITICAL: Initialize to 0
        weightedACV: 0
      });
      if (opp.Account?.Is_New_Logo__c) newLogoCount++;
    }
    
    const account = accountMap.get(accountName);
    account.opportunities.push(opp);
    account.totalACV += (opp.ACV__c || 0); // SUM the ACVs!
    account.weightedACV += (opp.Finance_Weighted_ACV__c || 0);
    
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
  
  // Group by BL (using actual Finance_Weighted_ACV__c field)
  const blBreakdown = {};
  accountData.records.forEach(opp => {
    const blName = opp.Account?.Owner?.Name || 'Unassigned';
    if (!blBreakdown[blName]) {
      blBreakdown[blName] = { totalACV: 0, weightedACV: 0, count: 0 };
    }
    blBreakdown[blName].totalACV += (opp.ACV__c || 0);
    blBreakdown[blName].weightedACV += (opp.Finance_Weighted_ACV__c || 0);
    blBreakdown[blName].count++;
  });
  
  // Group by product
  const productBreakdown = {};
  accountData.records.forEach(opp => {
    const product = opp.Product_Line__c || 'Undetermined';
    if (!productBreakdown[product]) {
      productBreakdown[product] = { totalACV: 0, weightedACV: 0, count: 0 };
    }
    productBreakdown[product].totalACV += (opp.ACV__c || 0);
    productBreakdown[product].weightedACV += (opp.Finance_Weighted_ACV__c || 0);
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
.tab { background: #fff; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; white-space: nowrap; color: #6b7280; transition: all 0.2s; }
.tab:hover { background: #e5e7eb; }
#tab-summary:checked ~ .tabs label[for="tab-summary"],
#tab-by-stage:checked ~ .tabs label[for="tab-by-stage"],
#tab-account-plans:checked ~ .tabs label[for="tab-account-plans"] { background: #8e99e1; color: #fff; }
.tab-content { display: none; }
#tab-summary:checked ~ #summary,
#tab-by-stage:checked ~ #by-stage,
#tab-account-plans:checked ~ #account-plans { display: block; }
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

<!-- Pure CSS Tabs (No JavaScript - CSP Safe) -->
<input type="radio" name="tabs" id="tab-summary" checked style="display: none;">
<input type="radio" name="tabs" id="tab-by-stage" style="display: none;">
<input type="radio" name="tabs" id="tab-account-plans" style="display: none;">

<div class="tabs">
  <label for="tab-summary" class="tab">Summary</label>
  <label for="tab-by-stage" class="tab">By Stage</label>
  <label for="tab-account-plans" class="tab">Account Plans</label>
</div>

<!-- TAB 1: SUMMARY -->
<div id="summary" class="tab-content">
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

<!-- TAB 3: ACCOUNT PLANS (Searchable, Expandable) -->
<div id="account-plans" class="tab-content">
  <div class="metrics" style="margin-bottom: 12px;">
    <div class="metric">
      <div class="metric-label">With Plans</div>
      <div class="metric-value">${accountsWithPlans}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Need Plans (Stage 2+)</div>
      <div class="metric-value">${Array.from(accountMap.values()).filter(a => !a.hasAccountPlan && a.highestStage >= 2).length}</div>
    </div>
  </div>
  
  <input type="text" id="account-search" placeholder="Search accounts..." style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; margin-bottom: 12px;" oninput="filterAccounts(this.value)">
  
  <div id="accounts-container" data-all-accounts='${JSON.stringify(Array.from(accountMap.values()).sort((a, b) => b.totalACV - a.totalACV).slice(0, 25).map(acc => acc.name))}'>
    ${Array.from(accountMap.values())
      .sort((a, b) => b.totalACV - a.totalACV)
      .slice(0, 25)
      .map((acc, idx) => {
        const oppCount = acc.opportunities.length;
        const totalACV = acc.totalACV || 0;
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        const acvDisplay = totalACV >= 1000000 ? '$' + (totalACV / 1000000).toFixed(1) + 'M' : totalACV >= 1000 ? '$' + (totalACV / 1000).toFixed(0) + 'K' : '$' + totalACV.toFixed(0);
        const needsPlan = !acc.hasAccountPlan && acc.highestStage >= 2;
        
        // Meeting data (if available)
        const lastMeeting = meetingData.get(acc.accountId)?.lastMeeting;
        const nextMeeting = meetingData.get(acc.accountId)?.nextMeeting;
        const lastMeetingDate = lastMeeting ? new Date(lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : null;
        const nextMeetingDate = nextMeeting ? new Date(nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : null;
        
        // Customer type badge (if not new logo)
        const customerTypeBadge = !acc.isNewLogo && acc.customerType ? `<span class="badge" style="background: #dbeafe; color: #1e40af;">${acc.customerType}</span>` : '';
        
        return `
        <details class="account-expandable" data-account="${acc.name.toLowerCase()}" style="background: ${needsPlan ? '#fefce8' : '#fff'}; border-left: 3px solid ${acc.hasAccountPlan ? '#10b981' : needsPlan ? '#f59e0b' : '#d1d5db'}; padding: 12px; border-radius: 4px; margin-bottom: 8px; cursor: pointer;">
          <summary style="list-style: none; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.9375rem; color: #1f2937;">
                ${acc.name}
                ${acc.isNewLogo ? '<span class="badge badge-new">New</span>' : customerTypeBadge}
              </div>
              <div style="font-size: 0.8125rem; color: #6b7280; margin-top: 2px;">
                ${acc.owner} • Stage ${acc.highestStage} • ${oppCount} opp${oppCount > 1 ? 's' : ''}
                ${lastMeetingDate ? ' • Last: ' + lastMeetingDate : ''}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600; color: #1f2937;">${acvDisplay}</div>
              <div style="font-size: 0.75rem; color: #6b7280;">${products.length} product${products.length > 1 ? 's' : ''}</div>
            </div>
          </summary>
          
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">
            ${acc.hasAccountPlan ? `
              <div style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-bottom: 8px;">
                <strong style="color: #1e40af;">✓ Account Plan</strong>
                <div style="color: #1e40af; margin-top: 4px; font-size: 0.75rem; white-space: pre-wrap; max-height: 100px; overflow-y: auto;">${acc.accountPlan.substring(0, 200)}${acc.accountPlan.length > 200 ? '...' : ''}</div>
              </div>
            ` : needsPlan ? `
              <div style="background: #fef3c7; padding: 8px; border-radius: 4px; margin-bottom: 8px; color: #92400e; font-size: 0.75rem;">
                <strong>⚠️ Account Plan Required</strong>
              </div>
            ` : ''}
            
            ${lastMeetingDate || nextMeetingDate ? `
            <div style="background: #f0fdf4; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">
              ${lastMeetingDate ? '<div><strong>Last Meeting:</strong> ' + lastMeetingDate + '</div>' : ''}
              ${nextMeetingDate ? '<div><strong>Next Meeting:</strong> ' + nextMeetingDate + '</div>' : ''}
            </div>
            ` : ''}
            
            <div style="margin-top: 8px; font-size: 0.8125rem;">
              <div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ${productList}</div>
              ${acc.customerType ? '<div style="color: #374151; margin-bottom: 4px;"><strong>Customer Type:</strong> ' + acc.customerType + '</div>' : ''}
              <div style="color: #374151; margin-top: 6px;"><strong>Opportunities (${oppCount}):</strong></div>
              ${acc.opportunities.map(o => `
                <div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">
                  • ${cleanStageName(o.StageName)} - ${o.Product_Line__c || 'TBD'} - $${((o.ACV__c || 0) / 1000).toFixed(0)}K
                </div>
              `).join('')}
            </div>
          </div>
        </details>
        `;
      }).join('')}
  </div>
</div>

<style>
details[open] summary { font-weight: 600; }
.account-expandable:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
</style>

<script>
// Search functionality - WORKING version
function filterAccounts(searchValue) {
  const search = searchValue.toLowerCase().trim();
  const accounts = document.querySelectorAll('.account-expandable');
  
  accounts.forEach(acc => {
    const name = acc.getAttribute('data-account') || '';
    if (name.includes(search)) {
      acc.style.display = 'block';
    } else {
      acc.style.display = 'none';
    }
  });
}
</script>

<!-- No JavaScript needed - Pure CSS tabs work with CSP! -->

</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard
};
