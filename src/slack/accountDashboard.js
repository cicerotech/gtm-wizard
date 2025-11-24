const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');

/**
 * Generate Account Status Dashboard - Mobile-optimized with tabs
 * Matches v0 interview dashboard quality
 */
async function generateAccountDashboard() {
  // Account Potential Value Mapping (from BL categorization)
  const potentialValueMap = {
    // High-Touch Marquee ($1M+ ARR potential)
    'Amazon': 'marquee',
    'Ecolab': 'marquee',
    'ServiceNow': 'marquee',
    'DHL': 'marquee',
    'IQVIA': 'marquee',
    'Southwest': 'marquee',
    'GE': 'marquee',
    'HSBC': 'marquee',
    'Best Buy': 'marquee',
    'BNY Mellon': 'marquee',
    'Cargill': 'marquee',
    'Uber': 'marquee',
    'Bayer': 'marquee',
    'Air Force': 'marquee',
    'SOCOM': 'marquee',
    'Intuit': 'marquee',
    'Medtronic': 'marquee',
    'Dolby': 'marquee',
    'Weir': 'marquee',
    // High-Velocity ($150K ARR potential)
    'Plusgrade': 'velocity',
    'Asana': 'velocity',
    'Granger': 'velocity',
    'AES': 'velocity',
    'Home Depot': 'velocity',
    'Pega': 'velocity',
    'Pure Storage': 'velocity',
    'Cox': 'velocity',
    'Novelis': 'velocity',
    'National Grid': 'velocity',
    'PetSmart': 'velocity',
    'Samsara': 'velocity',
    'Western': 'velocity',
    'Vista': 'velocity'
  };
  
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
  
  // Query accounts with opportunities AND get Account IDs
  const accountQuery = `SELECT Account.Id, Account.Name, Account.Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c, Account.Customer_Type__c,
                               Name, StageName, ACV__c, Finance_Weighted_ACV__c, Product_Line__c
                        FROM Opportunity
                        WHERE IsClosed = false
                          AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
                        ORDER BY StageName DESC, Account.Name`;
  
  const accountData = await query(accountQuery, true);
  
  // Get unique account IDs for meeting queries
  const accountIds = [...new Set(accountData.records.map(o => o.Account?.Id).filter(id => id))];
  const accountIdList = accountIds.map(id => `'${id}'`).join(',');
  
  // Query Einstein Activity Events WITH Contact details
  let meetingData = new Map();
  try {
    if (accountIds.length > 0) {
      // Get meetings WITH attendee details (Who = Contact)
      const lastMeetingQuery = `SELECT Id, AccountId, ActivityDate, Subject, Type, Who.Name, Who.Title, Who.Email
                                FROM Event
                                WHERE ActivityDate < TODAY
                                  AND AccountId IN (${accountIdList})
                                ORDER BY ActivityDate DESC
                                LIMIT 500`;
      
      const nextMeetingQuery = `SELECT Id, AccountId, ActivityDate, Subject, Type, Who.Name, Who.Title, Who.Email
                                FROM Event
                                WHERE ActivityDate >= TODAY
                                  AND AccountId IN (${accountIdList})
                                ORDER BY ActivityDate ASC
                                LIMIT 500`;
      
      const lastMeetings = await query(lastMeetingQuery, true);
      const nextMeetings = await query(nextMeetingQuery, true);
      
      // Process last meetings - group by account, collect contacts
      const processedLast = new Set();
      if (lastMeetings && lastMeetings.records) {
        lastMeetings.records.forEach(m => {
          if (m.AccountId) {
            if (!meetingData.has(m.AccountId)) meetingData.set(m.AccountId, { contacts: new Set() });
            const accountData = meetingData.get(m.AccountId);
            
            // Store last meeting (first = most recent)
            if (!processedLast.has(m.AccountId)) {
              accountData.lastMeeting = m.ActivityDate;
              accountData.lastMeetingSubject = m.Subject;
              processedLast.add(m.AccountId);
            }
            
            // Collect all meeting contacts (legal titles priority)
            if (m.Who?.Title) {
              const title = m.Who.Title;
              const isLegalTitle = /chief legal|general counsel|legal counsel|vp legal|legal director|associate general counsel|agc|clo|gc/i.test(title);
              if (isLegalTitle) {
                accountData.contacts.add(m.Who.Name + ' (' + title + ')');
              }
            }
          }
        });
      }
      
      // Process next meetings
      const processedNext = new Set();
      if (nextMeetings && nextMeetings.records) {
        nextMeetings.records.forEach(m => {
          if (m.AccountId) {
            if (!meetingData.has(m.AccountId)) meetingData.set(m.AccountId, { contacts: new Set() });
            const accountData = meetingData.get(m.AccountId);
            
            if (!processedNext.has(m.AccountId)) {
              accountData.nextMeeting = m.ActivityDate;
              accountData.nextMeetingSubject = m.Subject;
              processedNext.add(m.AccountId);
            }
            
            if (m.Who?.Title) {
              const title = m.Who.Title;
              const isLegalTitle = /chief legal|general counsel|legal counsel|vp legal|legal director|associate general counsel|agc|clo|gc/i.test(title);
              if (isLegalTitle) {
                accountData.contacts.add(m.Who.Name + ' (' + title + ')');
              }
            }
          }
        });
      }
    }
  } catch (e) {
    console.error('Event query error:', e.message);
  }
  
  // Group by account and CALCULATE totalACV properly
  const accountMap = new Map();
  let newLogoCount = 0;
  
  accountData.records.forEach(opp => {
    const accountName = opp.Account?.Name;
    
    if (!accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        accountId: opp.Account?.Id, // Store Account ID for meeting lookup
        owner: opp.Account?.Owner?.Name,
        isNewLogo: opp.Account?.Is_New_Logo__c,
        hasAccountPlan: !!opp.Account?.Account_Plan_s__c,
        accountPlan: opp.Account?.Account_Plan_s__c,
        customerType: opp.Account?.Customer_Type__c,
        opportunities: [],
        highestStage: 0,
        totalACV: 0,
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
.badge-revenue { background: #dbeafe; color: #1e40af; }
.badge-pilot { background: #fef3c7; color: #92400e; }
.badge-loi { background: #e0e7ff; color: #3730a3; }
.badge-other { background: #f3f4f6; color: #374151; }
.badge-marquee { background: #fce7f3; color: #831843; border: 1px solid #db2777; }
.badge-velocity { background: #e0f2fe; color: #075985; border: 1px solid #0284c7; }
.plan-status { margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; }
.plan-stat { display: inline-block; margin-right: 20px; }
.plan-stat-value { font-weight: 700; font-size: 1.25rem; color: #1f2937; }
.plan-stat-label { font-size: 0.75rem; color: #6b7280; }
@media (min-width: 640px) { .metrics { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>

<div class="header">
  <div style="text-align: center; margin-bottom: 16px;">
    <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAjgCOAAD/7QEIUGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAOwcAVoAAxslRxwCeAAFRXVkaWEcAloACVBBTE8gQUxUTxwCdAABABwCZQABABwCUAAISGFuZC1vdXQcAl8AAkNBHAIZAAEAHAJpAApFdWRpYSBMb2dvHAIFAApFdWRpYSBMb2dvHAI3AAoyMDI1OjA3OjA4HAJzAAVFdWRpYRwCbgAFRXVkaWEcAmcAAQAcAnoAAkNOHAIoAAxTZWUgUmVsZWFzZSAcAhQAO1BSTkFyY2hpdmVfMVllYXJ8V2Vic2l0ZURpc3RyaWJ1dGlvbnxFbnRlcm1lZGlhRGlzdHJpYnV0aW9uHAIPAAEAAP/iAhxJQ0NfUFJPRklMRQABAQAAAgxsY21zAhAAAG1udHJSR0IgWFlaIAfcAAEAGQADACkAOWFjc3BBUFBMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD21gABAAAAANMtbGNtcwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACmRlc2MAAAD8AAAAXmNwcnQAAAFcAAAAC3d0cHQAAAFoAAAAFGJrcHQAAAF8AAAAFHJYWVoAAAGQAAAAFGdYWVoAAAGkAAAAFGJYWVoAAAG4AAAAFHJUUkMAAAHMAAAAQGdUUkMAAAHMAAAAQGJUUkMAAAHMAAAAQGRlc2MAAAAAAAAAA2MyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHRleHQAAAAARkIAAFhZWiAAAAAAAAD21gABAAAAANMtWFlaIAAAAAAAAAMWAAADMwAAAqRYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9jdXJ2AAAAAAAAABoAAADLAckDYwWSCGsL9hA/FVEbNCHxKZAyGDuSRgVRd13ta3B6BYmxmnysab9908PpMP///9sAQwAEAgMDAwIEAwMDBAQEBAUJBgUFBQULCAgGCQ0LDQ0NCwwMDhAUEQ4PEw8MDBIYEhMVFhcXFw4RGRsZFhoUFhcW/8AACwgCdgSwAQERAP/EAB0AAQACAgMBAQAAAAAAAAAAAAAICQUGAQMEAgf/xABfEAABAwMCAQQKCwsJBwIDCQAAAQIDBAUGBxEICRIhMRM4QVFhcXWClLMUFyIyM1NWkbHBFhgjJDQ4RVJ0dpGhstEVGiZCUnKzRVdidYHh8CckJYKSlKLD8TY3RHOio//aACAEBAAA/ANO" alt="Eudia Logo" style="max-width: 180px; height: auto;">
  </div>
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
    <div class="account-list" id="late-stage-list">
${late.slice(0, 5).map((acc, idx) => {
        let badge = '';
        if (acc.isNewLogo) {
          badge = '<span class="badge badge-new">New</span>';
        } else if (acc.customerType) {
          const type = acc.customerType.toLowerCase();
          if (type.includes('revenue') || type === 'arr') {
            badge = '<span class="badge badge-revenue">Revenue</span>';
          } else if (type.includes('pilot')) {
            badge = '<span class="badge badge-pilot">Pilot</span>';
          } else if (type.includes('loi')) {
            badge = '<span class="badge badge-loi">LOI</span>';
          } else {
            badge = '<span class="badge badge-other">' + acc.customerType + '</span>';
          }
        }
        
        // Add potential value badge
        const potentialValue = potentialValueMap[acc.name];
        if (potentialValue === 'marquee') {
          badge += '<span class="badge badge-marquee">High-Touch Marquee</span>';
        } else if (potentialValue === 'velocity') {
          badge += '<span class="badge badge-velocity">High-Velocity</span>';
        }
        
        const acvDisplay = acc.totalACV >= 1000000 
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'M' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'K' 
            : '$' + acc.totalACV.toFixed(0);
        
        const accountMeetings = meetingData.get(acc.accountId) || {};
        const lastMeetingDate = accountMeetings.lastMeeting ? new Date(accountMeetings.lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #10b981; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - $' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'K</div>').join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${late.length > 5 ? `<div id="show-more-late" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${late.length - 5} more... (click to expand)</div>` : ''}
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Mid Stage (${mid.length})</div>
    <div class="account-list" id="mid-stage-list">
${mid.slice(0, 5).map((acc, idx) => {
        let badge = '';
        if (acc.isNewLogo) {
          badge = '<span class="badge badge-new">New</span>';
        } else if (acc.customerType) {
          const type = acc.customerType.toLowerCase();
          if (type.includes('revenue') || type === 'arr') {
            badge = '<span class="badge badge-revenue">Revenue</span>';
          } else if (type.includes('pilot')) {
            badge = '<span class="badge badge-pilot">Pilot</span>';
          } else if (type.includes('loi')) {
            badge = '<span class="badge badge-loi">LOI</span>';
          } else {
            badge = '<span class="badge badge-other">' + acc.customerType + '</span>';
          }
        }
        
        // Add potential value badge
        const potentialValue = potentialValueMap[acc.name];
        if (potentialValue === 'marquee') {
          badge += '<span class="badge badge-marquee">High-Touch Marquee</span>';
        } else if (potentialValue === 'velocity') {
          badge += '<span class="badge badge-velocity">High-Velocity</span>';
        }
        
        const acvDisplay = acc.totalACV >= 1000000 
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'M' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'K' 
            : '$' + acc.totalACV.toFixed(0);
        
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #3b82f6; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - $' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'K</div>').join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${mid.length > 5 ? `<div id="show-more-mid" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${mid.length - 5} more... (click to expand)</div>` : ''}
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Early Stage (${early.length})</div>
    <div class="account-list" id="early-stage-list">
${early.slice(0, 5).map((acc, idx) => {
        let badge = '';
        if (acc.isNewLogo) {
          badge = '<span class="badge badge-new">New</span>';
        } else if (acc.customerType) {
          const type = acc.customerType.toLowerCase();
          if (type.includes('revenue') || type === 'arr') {
            badge = '<span class="badge badge-revenue">Revenue</span>';
          } else if (type.includes('pilot')) {
            badge = '<span class="badge badge-pilot">Pilot</span>';
          } else if (type.includes('loi')) {
            badge = '<span class="badge badge-loi">LOI</span>';
          } else {
            badge = '<span class="badge badge-other">' + acc.customerType + '</span>';
          }
        }
        
        // Add potential value badge
        const potentialValue = potentialValueMap[acc.name];
        if (potentialValue === 'marquee') {
          badge += '<span class="badge badge-marquee">High-Touch Marquee</span>';
        } else if (potentialValue === 'velocity') {
          badge += '<span class="badge badge-velocity">High-Velocity</span>';
        }
        
        const acvDisplay = acc.totalACV >= 1000000 
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'M' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'K' 
            : '$' + acc.totalACV.toFixed(0);
        
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - $' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'K</div>').join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${early.length > 5 ? `<div id="show-more-early" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${early.length - 5} more... (click to expand)</div>` : ''}
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

<!-- TAB 3: ACCOUNT PLANS -->
<div id="account-plans" class="tab-content">
  <div class="stage-section">
    <div class="stage-title">Account Plans & Pipeline</div>
    <div class="stage-subtitle">${accountsWithPlans} have plans • ${accountMap.size - accountsWithPlans} need plans (recently initiated)</div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">All Accounts (${accountMap.size})</div>
    <input type="text" id="account-search" placeholder="Search accounts..." style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.875rem; margin-bottom: 12px;">
    <div id="match-count" style="font-size: 0.75rem; color: #6b7280; margin-bottom: 8px;">Showing top 10 accounts (type to search all ${accountMap.size})</div>
    <div class="account-list">
${Array.from(accountMap.values())
        .sort((a, b) => b.totalACV - a.totalACV)
        .map((acc, idx) => {
          const planIcon = acc.hasAccountPlan ? '📋 ' : '';
          const lastDate = meetingData.get(acc.accountId)?.lastMeeting 
            ? new Date(meetingData.get(acc.accountId).lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) 
            : null;
          
          // Determine badge type based on customer type
          let badge = '';
          if (acc.isNewLogo) {
            badge = '<span class="badge badge-new">New</span>';
          } else if (acc.customerType) {
            const type = acc.customerType.toLowerCase();
            if (type.includes('revenue') || type === 'arr') {
              badge = '<span class="badge badge-revenue">Revenue</span>';
            } else if (type.includes('pilot')) {
              badge = '<span class="badge badge-pilot">Pilot</span>';
            } else if (type.includes('loi')) {
              badge = '<span class="badge badge-loi">LOI</span>';
            } else {
              badge = '<span class="badge badge-other">' + acc.customerType + '</span>';
            }
          }
          
          // Add potential value badge
          const potentialValue = potentialValueMap[acc.name];
          if (potentialValue === 'marquee') {
            badge += '<span class="badge badge-marquee">High-Touch Marquee</span>';
          } else if (potentialValue === 'velocity') {
            badge += '<span class="badge badge-velocity">High-Velocity</span>';
          }
          
          const acvDisplay = acc.totalACV >= 1000000 
            ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'M' 
            : acc.totalACV >= 1000 
              ? '$' + (acc.totalACV / 1000).toFixed(0) + 'K' 
              : '$' + acc.totalACV.toFixed(0);
          
          const accountMeetings = meetingData.get(acc.accountId) || {};
          const lastMeeting = accountMeetings.lastMeeting;
          const lastMeetingSubject = accountMeetings.lastMeetingSubject;
          const nextMeeting = accountMeetings.nextMeeting;
          const nextMeetingSubject = accountMeetings.nextMeetingSubject;
          const legalContacts = accountMeetings.contacts ? Array.from(accountMeetings.contacts) : [];
          
          const lastMeetingDate = lastMeeting ? new Date(lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
          const nextMeetingDate = nextMeeting ? new Date(nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
          
          const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
          const productList = products.join(', ') || 'TBD';
          
          return '<details class="account-expandable" data-account="' + acc.name.toLowerCase() + '" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid ' + (acc.highestStage >= 3 ? '#10b981' : acc.highestStage === 2 ? '#3b82f6' : '#f59e0b') + '; padding: 12px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid #e5e7eb;">' +
            '<summary style="list-style: none; display: flex; justify-content: space-between; align-items: center;">' +
              '<div style="flex: 1;">' +
                '<div style="font-weight: 600; font-size: 0.9375rem; color: #1f2937;">' +
                  planIcon + acc.name + ' ' + badge +
                '</div>' +
                '<div style="font-size: 0.8125rem; color: #6b7280; margin-top: 2px;">' +
                  acc.owner + ' • Stage ' + acc.highestStage + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + (lastMeetingDate ? ' • Last: ' + lastMeetingDate : '') +
                '</div>' +
              '</div>' +
              '<div style="text-align: right;">' +
                '<div style="font-weight: 600; color: #1f2937;">' + acvDisplay + '</div>' +
                '<div style="font-size: 0.75rem; color: #6b7280;">' + products.length + ' product' + (products.length > 1 ? 's' : '') + '</div>' +
              '</div>' +
            '</summary>' +
            '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
              (acc.hasAccountPlan ? '<div style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-bottom: 8px;"><strong style="color: #1e40af;">✓ Account Plan</strong><div style="color: #1e40af; margin-top: 4px; font-size: 0.75rem; white-space: pre-wrap; max-height: 100px; overflow-y: auto;">' + (acc.accountPlan ? acc.accountPlan.substring(0, 200) + (acc.accountPlan.length > 200 ? '...' : '') : '') + '</div></div>' : '') +
              (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 10px; border-radius: 4px; margin-bottom: 8px; font-size: 0.8125rem; color: #065f46;">' + (lastMeetingDate ? '<div style="margin-bottom: 4px;"><strong>📅 Last Meeting:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div><strong>📅 Next Meeting:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '<div style="background: #fef2f2; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #991b1b;">📭 No meetings scheduled</div>') +
              (legalContacts.length > 0 ? '<div style="background: #ede9fe; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #5b21b6;"><strong>Legal Contacts:</strong> ' + legalContacts.join(', ') + '</div>' : '') +
              '<div style="margin-top: 8px; font-size: 0.8125rem;">' +
                '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
                (acc.customerType ? '<div style="color: #374151; margin-bottom: 4px;"><strong>Customer Type:</strong> ' + acc.customerType + '</div>' : '') +
                '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
                acc.opportunities.map(o => '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - $' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'K</div>').join('') +
              '</div>' +
            '</div>' +
          '</details>';
        }).join('')}
      <div id="show-more-accounts" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 12px; background: #eff6ff; border-radius: 6px; margin-top: 8px;">+${accountMap.size - 10} more accounts (click to show all)</div>
    </div>
  </div>
</div>


<script>
// Account Plans tab - Search functionality
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('account-search');
  const matchCount = document.getElementById('match-count');
  const allAccounts = document.querySelectorAll('.account-expandable');
  const showMoreBtn = document.getElementById('show-more-accounts');
  
  if (searchInput && allAccounts.length > 0) {
    searchInput.addEventListener('input', function() {
      const search = this.value.toLowerCase().trim();
      
      if (!search) {
        // No search - show first 10 only
        allAccounts.forEach((acc, idx) => {
          acc.style.display = idx < 10 ? 'block' : 'none';
        });
        if (showMoreBtn) showMoreBtn.style.display = allAccounts.length > 10 ? 'block' : 'none';
        matchCount.textContent = 'Showing top 10 accounts (type to search all ' + allAccounts.length + ')';
        return;
      }
      
      // Find matches
      const matches = [];
      allAccounts.forEach((acc) => {
        const name = acc.getAttribute('data-account') || '';
        if (name.includes(search)) {
          const score = name.startsWith(search) ? 100 : 50;
          matches.push({ element: acc, score });
        }
      });
      
      // Sort by score
      matches.sort((a, b) => b.score - a.score);
      
      // Hide all
      allAccounts.forEach(acc => acc.style.display = 'none');
      
      // Show matches
      matches.forEach(m => m.element.style.display = 'block');
      
      if (showMoreBtn) showMoreBtn.style.display = 'none';
      matchCount.textContent = matches.length + ' account' + (matches.length !== 1 ? 's' : '') + ' found';
    });
  }
  
  // Show more accounts button
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', function() {
      allAccounts.forEach(acc => acc.style.display = 'block');
      this.style.display = 'none';
      matchCount.textContent = 'Showing all ' + allAccounts.length + ' accounts';
    });
  }
  
  // Summary tab - Show more buttons
  const showMoreLate = document.getElementById('show-more-late');
  const showMoreMid = document.getElementById('show-more-mid');
  const showMoreEarly = document.getElementById('show-more-early');
  
  if (showMoreLate) {
    showMoreLate.addEventListener('click', function() {
      const lateList = document.getElementById('late-stage-list');
      const allLate = lateList.querySelectorAll('.summary-expandable');
      allLate.forEach(acc => acc.style.display = 'block');
      this.style.display = 'none';
    });
  }
  
  if (showMoreMid) {
    showMoreMid.addEventListener('click', function() {
      const midList = document.getElementById('mid-stage-list');
      const allMid = midList.querySelectorAll('.summary-expandable');
      allMid.forEach(acc => acc.style.display = 'block');
      this.style.display = 'none';
    });
  }
  
  if (showMoreEarly) {
    showMoreEarly.addEventListener('click', function() {
      const earlyList = document.getElementById('early-stage-list');
      const allEarly = earlyList.querySelectorAll('.summary-expandable');
      allEarly.forEach(acc => acc.style.display = 'block');
      this.style.display = 'none';
    });
  }
});
</script>

</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard
};
