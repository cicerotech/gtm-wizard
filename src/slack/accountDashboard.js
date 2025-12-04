const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');

/**
 * Generate password-protected Account Status Dashboard
 */
function generateLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account Status Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-container { background: #fff; padding: 40px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 360px; width: 90%; }
.login-container h1 { font-size: 1.25rem; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
.login-container p { font-size: 0.875rem; color: #6b7280; margin-bottom: 24px; }
.login-container input { width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.875rem; margin-bottom: 16px; }
.login-container input:focus { outline: none; border-color: #8e99e1; }
.login-container button { width: 100%; padding: 12px; background: #8e99e1; color: #fff; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
.login-container button:hover { background: #7c8bd4; }
.error { color: #ef4444; font-size: 0.75rem; margin-bottom: 12px; display: none; }
</style>
</head>
<body>
<div class="login-container">
  <h1>Account Status Dashboard</h1>
  <p>Enter password to continue</p>
  <form method="POST" action="/account-dashboard">
    <input type="password" name="password" placeholder="Password" required autocomplete="off">
    <div class="error" id="error">Incorrect password</div>
    <button type="submit">Continue</button>
  </form>
</div>
</body>
</html>`;
}

/**
 * Generate Account Status Dashboard - Mobile-optimized with tabs
 */
async function generateAccountDashboard() {
  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVE CONTRACTS QUERY (Status = Activated)
  // ═══════════════════════════════════════════════════════════════════════
  const contractsQuery = `
    SELECT Account.Name, Contract_Type__c, Contract_Value__c, Annualized_Revenue__c,
           Amount__c, StartDate, EndDate, Status, Product_Line__c, Parent_Product__c,
           ContractNumber
    FROM Contract
    WHERE Status = 'Activated'
    ORDER BY Account.Name ASC, Annualized_Revenue__c DESC NULLS LAST
  `;
  
  let contractsByAccount = new Map();
  let recurringTotal = 0;
  let projectTotal = 0;
  let totalARR = 0;
  
  try {
    const contractData = await query(contractsQuery, true);
    if (contractData?.records) {
      contractData.records.forEach(c => {
        const accountName = c.Account?.Name || 'Unknown';
        if (!contractsByAccount.has(accountName)) {
          contractsByAccount.set(accountName, { recurring: [], project: [], totalARR: 0, totalProject: 0 });
        }
        const acct = contractsByAccount.get(accountName);
        const acv = c.Annualized_Revenue__c || c.Contract_Value__c || 0;
        
        if (c.Contract_Type__c === 'Recurring') {
          acct.recurring.push(c);
          acct.totalARR += acv;
          recurringTotal += acv;
          totalARR += acv;
        } else {
          // LOI, Project, One-Time
          acct.project.push(c);
          acct.totalProject += (c.Contract_Value__c || 0);
          projectTotal += (c.Contract_Value__c || 0);
        }
      });
    }
  } catch (e) { console.error('Contracts query error:', e.message); }

  // ═══════════════════════════════════════════════════════════════════════
  // SIGNED DEALS (Last 90 Days) - Grouped by Account.Customer_Type__c
  // Customer_Type__c picklist values: Revenue, Pilot, LOI with $ attached, LOI no $ attached
  // ═══════════════════════════════════════════════════════════════════════
  const signedDealsQuery = `
    SELECT Account.Name, Account.Customer_Type__c, Name, ACV__c, CloseDate, Product_Line__c
    FROM Opportunity
    WHERE StageName = 'Closed Won' AND CloseDate >= LAST_N_DAYS:90
    ORDER BY CloseDate DESC
  `;
  
  let signedByType = { revenue: [], pilot: [], loi: [] };
  let signedDealsTotal = { revenue: 0, pilot: 0, loi: 0 };
  
  // Helper to categorize by Customer_Type__c
  // Picklist values: Revenue, Pilot, LOI with $ attached, LOI no $ attached
  const categorizeByCustomerType = (custType) => {
    if (!custType) return 'pilot'; // Default if not set
    const ct = custType.toLowerCase().trim();
    if (ct === 'revenue' || ct === 'arr') return 'revenue';
    if (ct === 'pilot') return 'pilot';
    if (ct.includes('loi')) return 'loi';
    return 'pilot'; // Default fallback
  };
  
  try {
    const signedData = await query(signedDealsQuery, true);
    console.log(`[Dashboard] Signed deals query returned ${signedData?.records?.length || 0} records`);
    if (signedData?.records) {
      // Log unique customer types found
      const uniqueTypes = [...new Set(signedData.records.map(o => o.Account?.Customer_Type__c).filter(Boolean))];
      console.log(`[Dashboard] Unique Customer_Type__c values found: ${JSON.stringify(uniqueTypes)}`);
      
      signedData.records.forEach(opp => {
        const deal = {
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          closeDate: opp.CloseDate,
          acv: opp.ACV__c || 0,
          product: opp.Product_Line__c || '',
          customerType: opp.Account?.Customer_Type__c || ''
        };
        
        const category = categorizeByCustomerType(deal.customerType);
        signedByType[category].push(deal);
        signedDealsTotal[category] += deal.acv;
      });
    }
    console.log(`[Dashboard] Categorized: revenue=${signedByType.revenue.length}, pilot=${signedByType.pilot.length}, loi=${signedByType.loi.length}`);
  } catch (e) { console.error('Signed deals query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // NEW LOGOS - Accounts where First_Deal_Closed__c is within last 90 days
  // Categorized by Account.Customer_Type__c
  // ═══════════════════════════════════════════════════════════════════════
  const newLogosQuery = `
    SELECT Id, Name, First_Deal_Closed__c, Customer_Type__c, Owner.Name
    FROM Account
    WHERE First_Deal_Closed__c >= LAST_N_DAYS:90 AND First_Deal_Closed__c != null
    ORDER BY First_Deal_Closed__c DESC
  `;
  
  let newLogosByType = { revenue: [], pilot: [], loi: [] };
  
  try {
    const newLogoAccounts = await query(newLogosQuery, true);
    console.log(`[Dashboard] New logos query returned ${newLogoAccounts?.records?.length || 0} accounts`);
    if (newLogoAccounts?.records) {
      // Log unique customer types found
      const uniqueTypes = [...new Set(newLogoAccounts.records.map(a => a.Customer_Type__c).filter(Boolean))];
      console.log(`[Dashboard] New logos Customer_Type__c values: ${JSON.stringify(uniqueTypes)}`);
      
      newLogoAccounts.records.forEach(acc => {
        const logo = {
          accountName: acc.Name,
          closeDate: acc.First_Deal_Closed__c,
          customerType: acc.Customer_Type__c || ''
        };
        
        const category = categorizeByCustomerType(logo.customerType);
        newLogosByType[category].push(logo);
      });
    }
    console.log(`[Dashboard] New logos categorized: revenue=${newLogosByType.revenue.length}, pilot=${newLogosByType.pilot.length}, loi=${newLogosByType.loi.length}`);
  } catch (e) { console.error('New logos query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // Q4 WEIGHTED PIPELINE - Opportunities with Target_LOI_Date__c in Q4
  // ═══════════════════════════════════════════════════════════════════════
  const q4PipelineQuery = `
    SELECT SUM(Finance_Weighted_ACV__c) Q4Weighted, SUM(ACV__c) Q4Total
    FROM Opportunity
    WHERE Target_LOI_Date__c = THIS_FISCAL_QUARTER
    AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
  `;
  
  let q4WeightedPipeline = 0;
  let q4TotalPipeline = 0;
  try {
    const q4Data = await query(q4PipelineQuery, true);
    if (q4Data?.records?.[0]) {
      q4WeightedPipeline = q4Data.records[0].Q4Weighted || 0;
      q4TotalPipeline = q4Data.records[0].Q4Total || 0;
    }
  } catch (e) { console.error('Q4 pipeline query error:', e.message); }
  
  // Helper function to format currency
  const formatCurrency = (val) => {
    if (!val || val === 0) return '-';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';
    return '$' + (val / 1000).toFixed(0) + 'k';
  };

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
  // FIXED: Include ALL stages (0-4) to match SF report totals
  const pipelineQuery = `SELECT StageName,
                                SUM(ACV__c) GrossAmount,
                                SUM(Finance_Weighted_ACV__c) WeightedAmount,
                                COUNT(Id) DealCount
                         FROM Opportunity
                         WHERE IsClosed = false 
                           AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
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
  // FIXED: Include ALL stages (0-4) to match SF report totals
  // FIXED: Use Owner.Name (Opportunity Owner) not Account.Owner.Name (Account Owner)
  const accountQuery = `SELECT Account.Id, Account.Name, Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c, Account.Customer_Type__c,
                               Name, StageName, ACV__c, Finance_Weighted_ACV__c, Product_Line__c
                        FROM Opportunity
                        WHERE IsClosed = false
                          AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal')
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
        owner: opp.Owner?.Name,
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
  // FIXED: Include Stage 0 to match all opportunities
  const stageBreakdown = {
    'Stage 4 - Proposal': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 3 - Pilot': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 2 - SQO': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 1 - Discovery': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 0 - Qualifying': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 }
  };
  
  pipelineData.records.forEach(r => {
    if (stageBreakdown[r.StageName]) {
      stageBreakdown[r.StageName].totalACV = r.GrossAmount || 0;
      stageBreakdown[r.StageName].weightedACV = r.WeightedAmount || 0;
      stageBreakdown[r.StageName].count = r.DealCount || 0;
    }
  });
  
  // Group by BL with stage breakdown
  const blBreakdown = {};
  const stageOrder = ['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'];
  accountData.records.forEach(opp => {
    const blName = opp.Owner?.Name || 'Unassigned';
    const stage = opp.StageName || 'Unknown';
    if (!blBreakdown[blName]) {
      blBreakdown[blName] = { 
        totalACV: 0, weightedACV: 0, count: 0,
        byStage: {}
      };
      stageOrder.forEach(s => blBreakdown[blName].byStage[s] = { count: 0, acv: 0, weighted: 0 });
    }
    blBreakdown[blName].totalACV += (opp.ACV__c || 0);
    blBreakdown[blName].weightedACV += (opp.Finance_Weighted_ACV__c || 0);
    blBreakdown[blName].count++;
    if (blBreakdown[blName].byStage[stage]) {
      blBreakdown[blName].byStage[stage].count++;
      blBreakdown[blName].byStage[stage].acv += (opp.ACV__c || 0);
      blBreakdown[blName].byStage[stage].weighted += (opp.Finance_Weighted_ACV__c || 0);
    }
  });
  
  // Group by product with stage breakdown
  const productBreakdown = {};
  accountData.records.forEach(opp => {
    const product = opp.Product_Line__c || 'Undetermined';
    const stage = opp.StageName || 'Unknown';
    if (!productBreakdown[product]) {
      productBreakdown[product] = { 
        totalACV: 0, weightedACV: 0, count: 0,
        byStage: {}
      };
      stageOrder.forEach(s => productBreakdown[product].byStage[s] = { count: 0, acv: 0, weighted: 0 });
    }
    productBreakdown[product].totalACV += (opp.ACV__c || 0);
    productBreakdown[product].weightedACV += (opp.Finance_Weighted_ACV__c || 0);
    productBreakdown[product].count++;
    if (productBreakdown[product].byStage[stage]) {
      productBreakdown[product].byStage[stage].count++;
      productBreakdown[product].byStage[stage].acv += (opp.ACV__c || 0);
      productBreakdown[product].byStage[stage].weighted += (opp.Finance_Weighted_ACV__c || 0);
    }
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
#tab-revenue:checked ~ .tabs label[for="tab-revenue"],
#tab-account-plans:checked ~ .tabs label[for="tab-account-plans"] { background: #8e99e1; color: #fff; }
.tab-content { display: none; }
#tab-summary:checked ~ #summary,
#tab-by-stage:checked ~ #by-stage,
#tab-revenue:checked ~ #revenue,
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
  <img src="/logo" alt="Eudia" style="max-width: 200px; max-height: 60px; margin-bottom: 20px; display: block;">
  <h1>Account Status Dashboard</h1>
  <p>Real-time pipeline overview • Updated ${new Date().toLocaleTimeString()}</p>
</div>

<!-- Pure CSS Tabs (No JavaScript - CSP Safe) -->
<input type="radio" name="tabs" id="tab-summary" checked style="display: none;">
<input type="radio" name="tabs" id="tab-by-stage" style="display: none;">
<input type="radio" name="tabs" id="tab-revenue" style="display: none;">
<input type="radio" name="tabs" id="tab-account-plans" style="display: none;">

<div class="tabs">
  <label for="tab-summary" class="tab">Summary</label>
  <label for="tab-by-stage" class="tab">By Stage</label>
  <label for="tab-revenue" class="tab">Revenue</label>
  <label for="tab-account-plans" class="tab">Accounts</label>
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
${late.map((acc, idx) => {
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
        const nextMeetingDate = accountMeetings.nextMeeting ? new Date(accountMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const lastMeetingSubject = accountMeetings.lastMeetingSubject || '';
        const nextMeetingSubject = accountMeetings.nextMeetingSubject || '';
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #10b981; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Last:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '') +
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
${mid.map((acc, idx) => {
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
        const nextMeetingDate = accountMeetings.nextMeeting ? new Date(accountMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const lastMeetingSubject = accountMeetings.lastMeetingSubject || '';
        const nextMeetingSubject = accountMeetings.nextMeetingSubject || '';
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #3b82f6; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Last:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '') +
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
${early.map((acc, idx) => {
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
        const nextMeetingDate = accountMeetings.nextMeeting ? new Date(accountMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const lastMeetingSubject = accountMeetings.lastMeetingSubject || '';
        const nextMeetingSubject = accountMeetings.nextMeetingSubject || '';
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 5 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Last:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '') +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - $' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'K</div>').join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${early.length > 5 ? `<div id="show-more-early" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${early.length - 5} more... (click to expand)</div>` : ''}
    </div>
  </div>
  
  <!-- Account Tags Legend -->
  <div style="margin-top: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.65rem; color: #6b7280;">
    <div style="margin-bottom: 4px;"><span class="badge badge-marquee" style="font-size: 0.6rem;">High-Touch Marquee</span> Large enterprise, $1m+ ARR potential, requires senior engagement</div>
    <div style="margin-bottom: 4px;"><span class="badge badge-velocity" style="font-size: 0.6rem;">High-Velocity</span> Mid-market, ~$150k ARR potential, faster sales cycle</div>
    <div><span class="badge badge-new" style="font-size: 0.6rem;">New</span> Account with no prior closed deals</div>
  </div>
</div>

<!-- TAB 2: BY STAGE (Detailed Breakdowns) -->
<div id="by-stage" class="tab-content">
  <div class="stage-section">
    <div class="stage-title">Stage Overview</div>
    <table style="width: 100%; font-size: 0.875rem; margin-top: 12px;">
<tr style="background: #f9fafb; font-weight: 600;"><td>Stage</td><td style="text-align: center;">Opps</td><td style="text-align: center;">Total ACV</td><td style="text-align: center;">Weighted</td></tr>
      ${Object.entries(stageBreakdown).map(([stage, data]) => `
        <tr><td>${cleanStageName(stage)}</td><td style="text-align: center;">${data.count}</td><td style="text-align: center;">$${(data.totalACV / 1000000).toFixed(2)}M</td><td style="text-align: center;">$${(data.weightedACV / 1000000).toFixed(2)}M</td></tr>
      `).join('')}
      <tr style="background: #e5e7eb; font-weight: 700;"><td>TOTAL</td><td style="text-align: center;">${totalDeals}</td><td style="text-align: center;">$${(totalGross / 1000000).toFixed(2)}M</td><td style="text-align: center;">$${(totalWeighted / 1000000).toFixed(2)}M</td></tr>
    </table>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Business Lead Overview</div>
    <div style="margin-top: 12px;">
      ${Object.entries(blBreakdown).sort((a, b) => b[1].totalACV - a[1].totalACV).map(([bl, data]) => `
        <details style="background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; overflow: hidden;">
          <summary style="padding: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
            <span style="font-weight: 600;">${bl}</span>
            <span style="font-size: 0.875rem; color: #6b7280;">${data.count} opps • <strong style="color: #1f2937;">$${(data.totalACV / 1000000).toFixed(2)}M</strong> • W: $${(data.weightedACV / 1000000).toFixed(2)}M</span>
          </summary>
          <div style="padding: 12px; border-top: 1px solid #e5e7eb;">
            <table style="width: 100%; font-size: 0.8125rem;">
              <tr style="background: #f3f4f6;"><td style="padding: 4px 8px; font-weight: 600;">Stage</td><td style="text-align: center; padding: 4px;">Opps</td><td style="text-align: center; padding: 4px;">ACV</td><td style="text-align: center; padding: 4px;">Wtd</td></tr>
              ${['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'].filter(s => data.byStage[s]?.count > 0).map(stage => `
                <tr><td style="padding: 4px 8px; font-size: 0.75rem;">${cleanStageName(stage)}</td><td style="text-align: center; padding: 4px;">${data.byStage[stage].count}</td><td style="text-align: center; padding: 4px;">$${(data.byStage[stage].acv / 1000000).toFixed(2)}M</td><td style="text-align: center; padding: 4px;">$${(data.byStage[stage].weighted / 1000000).toFixed(2)}M</td></tr>
              `).join('')}
            </table>
          </div>
        </details>
      `).join('')}
    </div>
    <div style="background: #e5e7eb; padding: 12px; border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; font-weight: 700;">
      <span>TOTAL</span>
      <span>${Object.values(blBreakdown).reduce((sum, data) => sum + data.count, 0)} opps • $${(Object.values(blBreakdown).reduce((sum, data) => sum + data.totalACV, 0) / 1000000).toFixed(2)}M • W: $${(Object.values(blBreakdown).reduce((sum, data) => sum + data.weightedACV, 0) / 1000000).toFixed(2)}M</span>
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Products by Stage</div>
    <div style="margin-top: 12px;">
      ${Object.entries(productBreakdown).sort((a, b) => b[1].totalACV - a[1].totalACV).map(([product, data]) => `
        <details style="background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; overflow: hidden;">
          <summary style="padding: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
            <span style="font-weight: 600;">${product}</span>
            <span style="font-size: 0.875rem; color: #6b7280;">${data.count} opps • <strong style="color: #1f2937;">$${(data.totalACV / 1000000).toFixed(2)}M</strong> • W: $${(data.weightedACV / 1000000).toFixed(2)}M</span>
          </summary>
          <div style="padding: 12px; border-top: 1px solid #e5e7eb;">
            <table style="width: 100%; font-size: 0.8125rem;">
              <tr style="background: #f3f4f6;"><td style="padding: 4px 8px; font-weight: 600;">Stage</td><td style="text-align: center; padding: 4px;">Opps</td><td style="text-align: center; padding: 4px;">ACV</td><td style="text-align: center; padding: 4px;">Wtd</td></tr>
              ${['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'].filter(s => data.byStage[s]?.count > 0).map(stage => `
                <tr><td style="padding: 4px 8px; font-size: 0.75rem;">${cleanStageName(stage)}</td><td style="text-align: center; padding: 4px;">${data.byStage[stage].count}</td><td style="text-align: center; padding: 4px;">$${(data.byStage[stage].acv / 1000000).toFixed(2)}M</td><td style="text-align: center; padding: 4px;">$${(data.byStage[stage].weighted / 1000000).toFixed(2)}M</td></tr>
              `).join('')}
            </table>
          </div>
        </details>
      `).join('')}
    </div>
    <div style="background: #e5e7eb; padding: 12px; border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; font-weight: 700;">
      <span>TOTAL</span>
      <span>${Object.values(productBreakdown).reduce((sum, data) => sum + data.count, 0)} opps • $${(Object.values(productBreakdown).reduce((sum, data) => sum + data.totalACV, 0) / 1000000).toFixed(2)}M • W: $${(Object.values(productBreakdown).reduce((sum, data) => sum + data.weightedACV, 0) / 1000000).toFixed(2)}M</span>
    </div>
  </div>
</div>

<!-- TAB 3: REVENUE -->
<div id="revenue" class="tab-content">
  <!-- Active Revenue by Account -->
  <div class="stage-section">
    <div class="stage-title">Active Revenue by Account</div>
    <div class="stage-subtitle">${contractsByAccount.size} accounts • ${formatCurrency(recurringTotal)} ARR • ${formatCurrency(projectTotal)} project</div>
  </div>
  
  <div class="section-card">
    <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb; text-align: left;">
          <th style="padding: 8px 4px; font-weight: 600;">Account</th>
          <th style="padding: 8px 4px; font-weight: 600; text-align: right;">ARR</th>
          <th style="padding: 8px 4px; font-weight: 600; text-align: right;">Project</th>
        </tr>
      </thead>
      <tbody>
        ${/* ARR accounts first (sorted by ARR desc), then Project-only accounts */
          [...Array.from(contractsByAccount.entries())
            .filter(([name, data]) => data.totalARR > 0)
            .sort((a, b) => b[1].totalARR - a[1].totalARR),
          ...Array.from(contractsByAccount.entries())
            .filter(([name, data]) => data.totalARR === 0 && data.totalProject > 0)
            .sort((a, b) => b[1].totalProject - a[1].totalProject)]
          .slice(0, 25)
          .map(([name, data]) => `
        <tr style="border-bottom: 1px solid #f1f3f5;">
          <td style="padding: 6px 4px;">${name}</td>
          <td style="padding: 6px 4px; text-align: right;">${formatCurrency(data.totalARR)}</td>
          <td style="padding: 6px 4px; text-align: right;">${formatCurrency(data.totalProject)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="border-top: 2px solid #e5e7eb; font-weight: 600;">
          <td style="padding: 8px 4px;">TOTAL</td>
          <td style="padding: 8px 4px; text-align: right;">${formatCurrency(recurringTotal)}</td>
          <td style="padding: 8px 4px; text-align: right;">${formatCurrency(projectTotal)}</td>
        </tr>
      </tfoot>
    </table>
    ${contractsByAccount.size === 0 ? '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No active contracts</div>' : ''}
  </div>

  <!-- Signed Last 90 Days by Customer Type -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Signed (Last 90 Days)</div>
    <div class="stage-subtitle">${signedByType.revenue.length} revenue • ${signedByType.pilot.length} pilot • ${signedByType.loi.length} LOI</div>
  </div>
  
  <div class="section-card">
    ${signedByType.revenue.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #16a34a; margin-bottom: 6px;">REVENUE (${formatCurrency(signedDealsTotal.revenue)})</div>
    ${signedByType.revenue.map(d => `
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <span style="color: #6b7280;">${formatCurrency(d.acv)}</span>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.pilot.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #2563eb; margin-top: 10px; margin-bottom: 6px;">PILOT (${formatCurrency(signedDealsTotal.pilot)})</div>
    ${signedByType.pilot.map(d => `
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <span style="color: #6b7280;">${formatCurrency(d.acv)}</span>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.loi.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #7c3aed; margin-top: 10px; margin-bottom: 6px;">LOI (${formatCurrency(signedDealsTotal.loi)})</div>
    ${signedByType.loi.map(d => `
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <span style="color: #6b7280;">${formatCurrency(d.acv)}</span>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.revenue.length === 0 && signedByType.pilot.length === 0 && signedByType.loi.length === 0 ? 
      '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No closed deals in last 90 days</div>' : ''}
  </div>
  
  <!-- Revenue Forecast -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Revenue + Pipeline Forecast</div>
  </div>
  
  <div class="section-card">
    <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
      <tr style="border-bottom: 1px solid #f1f3f5;">
        <td style="padding: 8px 4px;">Active Revenue (Contracts)</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: 600;">${formatCurrency(recurringTotal + projectTotal)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f3f5;">
        <td style="padding: 8px 4px;">Q4 Weighted Pipeline</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: 600;">${formatCurrency(q4WeightedPipeline)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f3f5; background: #f0fdf4;">
        <td style="padding: 8px 4px; font-weight: 600;">Q4 Forecasted Revenue</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: 600;">${formatCurrency(recurringTotal + projectTotal + q4WeightedPipeline)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f3f5;">
        <td style="padding: 8px 4px;">+ Total Weighted Pipeline</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: 600;">${formatCurrency(Object.values(stageBreakdown).reduce((sum, s) => sum + s.weightedACV, 0))}</td>
      </tr>
      <tr style="border-top: 2px solid #e5e7eb; background: #f9fafb;">
        <td style="padding: 8px 4px; font-weight: 700;">Total Forecasted Revenue</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: 700;">${formatCurrency(recurringTotal + projectTotal + Object.values(stageBreakdown).reduce((sum, s) => sum + s.weightedACV, 0))}</td>
      </tr>
    </table>
  </div>
  
  <!-- Definitions -->
  <div style="margin-top: 16px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.65rem; color: #6b7280;">
    <div style="margin-bottom: 4px;"><strong>Revenue:</strong> ARR customers with recurring subscription contracts</div>
    <div style="margin-bottom: 4px;"><strong>Pilot:</strong> Short-term, one-time project engagement</div>
    <div style="margin-bottom: 4px;"><strong>LOI:</strong> Signed commitment to spend over defined period</div>
    <div><strong>Weighted Pipeline:</strong> ACV adjusted by stage probability</div>
  </div>
</div>

<!-- TAB 4: ACCOUNTS -->
<div id="account-plans" class="tab-content">
  <!-- New Logos Summary Tiles -->
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <div style="flex: 1; background: #f0fdf4; padding: 10px; border-radius: 6px;">
      <div style="font-size: 0.65rem; font-weight: 600; color: #16a34a; margin-bottom: 4px;">REVENUE</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #166534;">${newLogosByType.revenue.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">${newLogosByType.revenue.map(l => l.accountName).join(', ') || '-'}</div>
    </div>
    <div style="flex: 1; background: #eff6ff; padding: 10px; border-radius: 6px;">
      <div style="font-size: 0.65rem; font-weight: 600; color: #2563eb; margin-bottom: 4px;">PILOT</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af;">${newLogosByType.pilot.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">${newLogosByType.pilot.map(l => l.accountName).join(', ') || '-'}</div>
    </div>
    <div style="flex: 1; background: #f5f3ff; padding: 10px; border-radius: 6px;">
      <div style="font-size: 0.65rem; font-weight: 600; color: #7c3aed; margin-bottom: 4px;">LOI</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #5b21b6;">${newLogosByType.loi.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">${newLogosByType.loi.map(l => l.accountName).join(', ') || '-'}</div>
    </div>
  </div>
  
  <!-- Recently Signed (Collapsed) -->
  <details style="margin-bottom: 12px;">
    <summary style="cursor: pointer; font-size: 0.75rem; font-weight: 600; color: #374151; padding: 8px; background: #f9fafb; border-radius: 6px;">
      New Logos (Last 90 Days) - ${newLogosByType.revenue.length + newLogosByType.pilot.length + newLogosByType.loi.length} total
    </summary>
    <div style="padding: 8px; font-size: 0.7rem;">
      ${[...newLogosByType.revenue, ...newLogosByType.pilot, ...newLogosByType.loi]
        .sort((a, b) => b.closeDate?.localeCompare(a.closeDate) || 0)
        .map(l => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f3f5;">
            <span>${l.accountName}</span>
            <span style="color: #6b7280;">${l.closeDate ? new Date(l.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '-'}</span>
          </div>
        `).join('') || '<div style="color: #9ca3af; text-align: center; padding: 8px;">No new logos in last 90 days</div>'}
    </div>
  </details>

  <div class="stage-section">
    <div class="stage-title">Account Plans & Pipeline</div>
    <div class="stage-subtitle">${accountsWithPlans} have plans • ${accountMap.size - accountsWithPlans} need plans</div>
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
  generateAccountDashboard,
  generateLoginPage
};
