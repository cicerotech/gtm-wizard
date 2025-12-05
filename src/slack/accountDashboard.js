const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');
const { getJohnsonHanaSummary, getAccountSummaries: getJHAccounts, closedWonNovDec, mapStage, lastUpdate: jhLastUpdate } = require('../data/johnsonHanaData');

/**
 * Generate password-protected Account Status Dashboard
 */
function generateLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Dashboard</title>
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
  <h1>GTM Dashboard</h1>
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
 * Generate Top Co Overview Tab - Blended Eudia + Johnson Hana data
 * Updated weekly until systems sync
 */
function generateTopCoTab(eudiaGross, eudiaWeighted, eudiaDeals, eudiaAccounts, stageBreakdown, productBreakdown, accountMap, signedByType, meetingData, novDecRevenue, novDecRevenueTotal) {
  const jhSummary = getJohnsonHanaSummary();
  const jhAccounts = getJHAccounts();
  
  // Blended totals
  const blendedGross = eudiaGross + jhSummary.totalPipeline;
  const blendedWeighted = eudiaWeighted + jhSummary.totalWeighted;
  const blendedDeals = eudiaDeals + jhSummary.totalOpportunities;
  const blendedAccounts = eudiaAccounts + jhSummary.uniqueAccounts;
  
  // Format currency helper - lowercase m
  const fmt = (val) => {
    if (!val || val === 0) return '-';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';
    return '$' + (val / 1000).toFixed(0) + 'k';
  };
  
  // All Eudia accounts (for expandable view)
  const allEudiaAccounts = Array.from(accountMap.values())
    .sort((a, b) => b.totalACV - a.totalACV);
  const topEudiaAccounts = allEudiaAccounts.slice(0, 10);
  
  // All JH accounts (for expandable view)
  const allJHAccounts = jhAccounts;
  const topJHAccounts = allJHAccounts.slice(0, 10);
  
  // Count JH accounts with Eudia Tech
  const jhEudiaTechAccounts = allJHAccounts.filter(a => a.hasEudiaTech);
  const jhEudiaTechAccountPct = Math.round((jhEudiaTechAccounts.length / allJHAccounts.length) * 100);
  
  // Eudia closed deals - Nov-Dec ONLY, REVENUE (ARR/Recurring) only, not LOI/Pilot
  const eudiaRevenueDeals = novDecRevenue || [];
  const eudiaRevenueTotal = novDecRevenueTotal || 0;
  
  // JH closed deals
  const jhClosedDeals = closedWonNovDec;
  const jhClosedTotal = jhSummary.closedTotal;
  
  // Combined closed (using revenue-only for Eudia)
  const combinedClosedTotal = eudiaRevenueTotal + jhClosedTotal;
  const combinedClosedCount = eudiaRevenueDeals.length + jhClosedDeals.length;
  
  // Eudia stage order
  const stageOrder = ['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'];
  
  // JH Service lines breakdown
  const jhServiceLines = {};
  jhAccounts.forEach(acc => {
    acc.opportunities.forEach(opp => {
      const sl = opp.mappedServiceLine || 'Other';
      if (!jhServiceLines[sl]) jhServiceLines[sl] = { count: 0, acv: 0, weighted: 0 };
      jhServiceLines[sl].count++;
      jhServiceLines[sl].acv += opp.acv || 0;
      jhServiceLines[sl].weighted += opp.weighted || 0;
    });
  });
  
  return `
<div id="topco" class="tab-content">
  <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #374151;">
    <strong>Top Co Overview</strong> — Blended pipeline (Eudia + Johnson Hana).
    <span style="color: #6b7280; margin-left: 8px;">JH data updated: ${jhLastUpdate?.time || 'recently'} ${jhLastUpdate?.date || ''}</span>
  </div>
  
  <!-- Blended Metrics -->
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Combined Pipeline</div>
      <div class="metric-value">${fmt(blendedGross)}</div>
      <div class="metric-change" style="font-size: 0.65rem; color: #6b7280;">E: ${fmt(eudiaGross)} • JH: ${fmt(jhSummary.totalPipeline)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Weighted</div>
      <div class="metric-value">${fmt(blendedWeighted)}</div>
      <div class="metric-change" style="font-size: 0.65rem; color: #6b7280;">E: ${fmt(eudiaWeighted)} • JH: ${fmt(jhSummary.totalWeighted)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Opportunities</div>
      <div class="metric-value">${blendedDeals}</div>
      <div class="metric-change" style="font-size: 0.65rem; color: #6b7280;">E: ${eudiaDeals} • JH: ${jhSummary.totalOpportunities}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Accounts</div>
      <div class="metric-value">${blendedAccounts}</div>
      <div class="metric-change" style="font-size: 0.65rem; color: #6b7280;">E: ${eudiaAccounts} • JH: ${jhSummary.uniqueAccounts}</div>
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- EUDIA BY STAGE -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section">
    <div class="stage-title">Eudia by Stage</div>
    <div class="stage-subtitle">${eudiaDeals} opps • ${fmt(eudiaGross)} gross • ${fmt(eudiaWeighted)} weighted</div>
    <table style="width: 100%; font-size: 0.8rem; margin-top: 8px;">
      <tr style="background: #f9fafb; font-weight: 600;">
        <td style="padding: 6px;">Stage</td>
        <td style="text-align: center; padding: 6px;">Opps</td>
        <td style="text-align: right; padding: 6px;">ACV</td>
        <td style="text-align: right; padding: 6px;">Wtd</td>
      </tr>
      ${stageOrder.map(stage => {
        const data = stageBreakdown[stage] || { count: 0, totalACV: 0, weightedACV: 0 };
        // Get top products for this stage
        const stageProducts = {};
        Object.entries(productBreakdown).forEach(([prod, pData]) => {
          if (pData.byStage[stage]?.count > 0) {
            stageProducts[prod] = pData.byStage[stage];
          }
        });
        const topProds = Object.entries(stageProducts)
          .sort((a, b) => b[1].acv - a[1].acv)
          .slice(0, 3)
          .map(([p]) => p)
          .join(', ');
        return `
        <tr style="border-bottom: 1px solid #f1f3f5;">
          <td style="padding: 6px;">
            <div style="font-size: 0.75rem;">${stage.replace('Stage ', 'S')}</div>
            ${topProds ? '<div style="font-size: 0.6rem; color: #9ca3af;">' + topProds + '</div>' : ''}
          </td>
          <td style="text-align: center; padding: 6px;">${data.count}</td>
          <td style="text-align: right; padding: 6px;">${fmt(data.totalACV)}</td>
          <td style="text-align: right; padding: 6px;">${fmt(data.weightedACV)}</td>
        </tr>`;
      }).join('')}
      <tr style="background: #e5e7eb; font-weight: 600;">
        <td style="padding: 6px;">TOTAL</td>
        <td style="text-align: center; padding: 6px;">${eudiaDeals}</td>
        <td style="text-align: right; padding: 6px;">${fmt(eudiaGross)}</td>
        <td style="text-align: right; padding: 6px;">${fmt(eudiaWeighted)}</td>
      </tr>
    </table>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- JOHNSON HANA BY STAGE -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
      <div>
        <div class="stage-title">Johnson Hana by Stage</div>
        <div class="stage-subtitle">${jhSummary.totalOpportunities} opps • ${fmt(jhSummary.totalPipeline)} gross • ${fmt(jhSummary.totalWeighted)} weighted</div>
      </div>
      <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 6px 10px; border-radius: 6px; font-size: 0.65rem; text-align: right;">
        <div style="font-weight: 600; color: #047857;">Eudia Tech: ${jhSummary.eudiaTech.opportunityCount} opps</div>
        <div style="color: #065f46;">${fmt(jhSummary.eudiaTech.pipelineValue)} (${jhSummary.eudiaTech.percentOfValue}%)</div>
      </div>
    </div>
    <table style="width: 100%; font-size: 0.8rem; margin-top: 8px;">
      <tr style="background: #f9fafb; font-weight: 600;">
        <td style="padding: 6px;">Stage</td>
        <td style="text-align: center; padding: 6px;">Opps</td>
        <td style="text-align: right; padding: 6px;">ACV</td>
        <td style="text-align: right; padding: 6px;">Wtd</td>
      </tr>
      ${['Stage 5 - Negotiation', ...stageOrder].map(stage => {
        const data = jhSummary.byStage[stage];
        if (!data || data.count === 0) return '';
        // Get top service lines for this stage
        const stageServiceLines = {};
        jhAccounts.forEach(acc => {
          acc.opportunities.forEach(opp => {
            if (opp.stage === stage) {
              const sl = opp.mappedServiceLine || 'Other';
              if (!stageServiceLines[sl]) stageServiceLines[sl] = 0;
              stageServiceLines[sl] += opp.acv || 0;
            }
          });
        });
        const topSLs = Object.entries(stageServiceLines)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([sl]) => sl)
          .join(', ');
        return `
        <tr style="border-bottom: 1px solid #f1f3f5;">
          <td style="padding: 6px;">
            <div style="font-size: 0.75rem;">${stage.replace('Stage ', 'S')}</div>
            ${topSLs ? '<div style="font-size: 0.6rem; color: #9ca3af;">' + topSLs + '</div>' : ''}
          </td>
          <td style="text-align: center; padding: 6px;">${data.count}</td>
          <td style="text-align: right; padding: 6px;">${fmt(data.acv)}</td>
          <td style="text-align: right; padding: 6px;">${fmt(data.weighted)}</td>
        </tr>`;
      }).join('')}
      <tr style="background: #e5e7eb; font-weight: 600;">
        <td style="padding: 6px;">TOTAL</td>
        <td style="text-align: center; padding: 6px;">${jhSummary.totalOpportunities}</td>
        <td style="text-align: right; padding: 6px;">${fmt(jhSummary.totalPipeline)}</td>
        <td style="text-align: right; padding: 6px;">${fmt(jhSummary.totalWeighted)}</td>
      </tr>
    </table>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- COMBINED STAGE VIEW (MERGE) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Combined by Stage</div>
    <div class="stage-subtitle">Blended Eudia + JH</div>
    <table style="width: 100%; font-size: 0.8rem; margin-top: 8px;">
      <tr style="background: #f9fafb; font-weight: 600;">
        <td style="padding: 6px;">Stage</td>
        <td style="text-align: center; padding: 6px;">Opps</td>
        <td style="text-align: right; padding: 6px;">ACV</td>
        <td style="text-align: right; padding: 6px;">Wtd</td>
      </tr>
      ${['Stage 5 - Negotiation', ...stageOrder].map(stage => {
        const eData = stageBreakdown[stage] || { count: 0, totalACV: 0, weightedACV: 0 };
        const jData = jhSummary.byStage[stage] || { count: 0, acv: 0, weighted: 0 };
        const combined = {
          count: eData.count + jData.count,
          acv: (eData.totalACV || 0) + (jData.acv || 0),
          weighted: (eData.weightedACV || 0) + (jData.weighted || 0)
        };
        if (combined.count === 0) return '';
        return `
        <tr style="border-bottom: 1px solid #f1f3f5;">
          <td style="padding: 6px; font-size: 0.75rem;">${stage.replace('Stage ', 'S')}</td>
          <td style="text-align: center; padding: 6px;">${combined.count}</td>
          <td style="text-align: right; padding: 6px;">${fmt(combined.acv)}</td>
          <td style="text-align: right; padding: 6px;">${fmt(combined.weighted)}</td>
        </tr>`;
      }).join('')}
      <tr style="background: #e5e7eb; font-weight: 600;">
        <td style="padding: 6px;">TOTAL</td>
        <td style="text-align: center; padding: 6px;">${blendedDeals}</td>
        <td style="text-align: right; padding: 6px;">${fmt(blendedGross)}</td>
        <td style="text-align: right; padding: 6px;">${fmt(blendedWeighted)}</td>
      </tr>
    </table>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TOP EUDIA ACCOUNTS -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Eudia Top Accounts</div>
    <div class="stage-subtitle">${eudiaAccounts} accounts in pipeline</div>
    <div style="margin-top: 8px;" id="eudia-top-accounts">
      ${allEudiaAccounts.map((acc, idx) => {
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const accMeetings = meetingData?.get(acc.accountId) || {};
        const lastMeetingDate = accMeetings.lastMeeting ? new Date(accMeetings.lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const nextMeetingDate = accMeetings.nextMeeting ? new Date(accMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const legalContacts = accMeetings.contacts ? Array.from(accMeetings.contacts) : [];
        return `
        <details class="eudia-topco-account" style="border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; overflow: hidden; display: ${idx < 10 ? 'block' : 'none'};">
          <summary style="padding: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; font-size: 0.8rem;">
            <div>
              <span style="font-weight: 500;">${acc.name}</span>
              <div style="font-size: 0.65rem; color: #6b7280;">S${acc.highestStage} • ${acc.opportunities.length} opp${acc.opportunities.length > 1 ? 's' : ''}${products.length ? ' • ' + products.slice(0,2).join(', ') : ''}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600;">${fmt(acc.totalACV)}</div>
              <div style="font-size: 0.65rem; color: #6b7280;">Wtd: ${fmt(acc.weightedACV)}</div>
            </div>
          </summary>
          <div style="padding: 10px; font-size: 0.75rem; border-top: 1px solid #e5e7eb;">
            ${lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 6px; border-radius: 4px; margin-bottom: 6px; font-size: 0.7rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>Last Meeting:</strong> ' + lastMeetingDate + '</div>' : '') + (nextMeetingDate ? '<div><strong>Next Meeting:</strong> ' + nextMeetingDate + '</div>' : '') + '</div>' : '<div style="font-size: 0.65rem; color: #9ca3af; margin-bottom: 6px;">No meetings on file</div>'}
            ${legalContacts.length > 0 ? '<div style="font-size: 0.65rem; color: #6b7280; margin-bottom: 6px;"><strong>Legal:</strong> ' + legalContacts.slice(0,2).join(', ') + '</div>' : ''}
            <div style="font-weight: 600; margin-bottom: 4px;">Opportunities (${acc.opportunities.length}):</div>
            ${acc.opportunities.map(o => {
              // Extract clean stage name (e.g., "Stage 2 - SQO" → "S2 SQO")
              const stageMatch = o.StageName ? o.StageName.match(/Stage\\s*(\\d)\\s*[-–]?\\s*(.*)/i) : null;
              const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.StageName || 'TBD');
              // Format target date if available
              const targetDate = o.Target_LOI_Date__c ? new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
              return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + (o.Product_Line__c || 'TBD') + '</span><div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (targetDate ? ' • Target: ' + targetDate : '') + '</div></div><span style="font-weight: 600;">$' + ((o.ACV__c || 0) / 1000).toFixed(0) + 'k</span></div>';
            }).join('')}
          </div>
        </details>`;
      }).join('')}
      ${allEudiaAccounts.length > 10 ? '<div id="show-more-eudia-topco" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 6px; font-size: 0.75rem;">+' + (allEudiaAccounts.length - 10) + ' more accounts</div>' : ''}
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TOP JH ACCOUNTS -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Johnson Hana Top Accounts</div>
    <div class="stage-subtitle">${jhSummary.uniqueAccounts} accounts in pipeline</div>
    <div style="font-size: 0.65rem; color: #047857; margin-bottom: 6px;">
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; vertical-align: middle;"></span>
      Eudia Tech: ${jhEudiaTechAccounts.length} accounts (${jhEudiaTechAccountPct}%) • ${fmt(jhSummary.eudiaTech.pipelineValue)} ACV (${jhSummary.eudiaTech.percentOfValue}%)
    </div>
    <div style="margin-top: 8px;" id="jh-top-accounts">
      ${allJHAccounts.map((acc, idx) => {
        const serviceLines = [...new Set(acc.opportunities.map(o => o.mappedServiceLine).filter(s => s))];
        return `
        <details class="jh-topco-account" style="border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; overflow: hidden; display: ${idx < 10 ? 'block' : 'none'};">
          <summary style="padding: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; font-size: 0.8rem;">
            <div>
              <span style="font-weight: 500;">${acc.name}</span>
              ${acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; margin-left: 4px; vertical-align: middle;"></span>' : ''}
              <div style="font-size: 0.65rem; color: #6b7280;">S${acc.highestStage} • ${acc.opportunities.length} opp${acc.opportunities.length > 1 ? 's' : ''}${serviceLines.length ? ' • ' + serviceLines.slice(0,2).join(', ') : ''}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600;">${fmt(acc.totalACV)}</div>
              <div style="font-size: 0.65rem; color: #6b7280;">Wtd: ${fmt(acc.weightedACV)}</div>
            </div>
          </summary>
          <div style="padding: 10px; font-size: 0.75rem; border-top: 1px solid #e5e7eb;">
            <div style="font-weight: 600; margin-bottom: 4px;">Opportunities (${acc.opportunities.length}):</div>
            ${acc.opportunities.map(o => {
              // Extract clean stage from JH data (e.g., "Stage 2 SQO" → "S2 SQO")
              const stageMatch = o.stage ? o.stage.match(/Stage\\s*(\\d)\\s*(.*)/i) : null;
              const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.stage || 'TBD');
              // Format target date if available
              const targetDate = o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
              // Get owner name (first name only for brevity)
              const ownerName = o.owner ? o.owner.split(' ')[0] : '';
              return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + (o.mappedServiceLine || 'Other') + '</span>' + (o.eudiaTech ? ' <span style="color: #047857; font-size: 0.6rem;">●</span>' : '') + '<div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (ownerName ? ' • ' + ownerName : '') + (targetDate ? ' • ' + targetDate : '') + '</div></div><span style="font-weight: 600;">$' + ((o.acv || 0) / 1000).toFixed(0) + 'k</span></div>';
            }).join('')}
          </div>
        </details>`;
      }).join('')}
      ${allJHAccounts.length > 10 ? '<div id="show-more-jh-topco" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 6px; font-size: 0.75rem;">+' + (allJHAccounts.length - 10) + ' more accounts</div>' : ''}
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TOP CO CLOSED WON (NOV-DEC) - Revenue Only -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Top Co Closed Revenue (Nov-Dec)</div>
    <div class="stage-subtitle">${combinedClosedCount} revenue deals • ${fmt(combinedClosedTotal)} total</div>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-bottom: 6px;">Recurring/ARR deals only. LOI & Pilot excluded.</div>
    
    <!-- Eudia Closed - Revenue Only -->
    ${eudiaRevenueDeals.length > 0 ? `
    <div style="margin-top: 10px; margin-bottom: 6px; font-size: 0.7rem; font-weight: 600; color: #6b7280;">EUDIA (${eudiaRevenueDeals.length} deals • ${fmt(eudiaRevenueTotal)})</div>
    ${eudiaRevenueDeals.slice(0, 8).map(deal => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <div>
          <span style="font-weight: 500;">${deal.accountName}</span>
          <div style="font-size: 0.6rem; color: #9ca3af;">${deal.product || deal.oppName || ''}</div>
        </div>
        <div style="font-weight: 600; color: #16a34a;">${fmt(deal.acv)}</div>
      </div>
    `).join('')}` : '<div style="margin-top: 8px; font-size: 0.75rem; color: #9ca3af;">No Eudia revenue deals closed in last 90 days</div>'}
    
    <!-- JH Closed -->
    <div style="margin-top: 12px; margin-bottom: 6px; font-size: 0.7rem; font-weight: 600; color: #6b7280;">JOHNSON HANA (${jhClosedDeals.length} deals • ${fmt(jhClosedTotal)})</div>
    ${jhClosedDeals.slice(0, 8).map(deal => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <div>
          <span style="font-weight: 500;">${deal.account}</span>
          ${deal.eudiaTech ? '<span class="badge badge-eudia" style="margin-left: 4px;">Eudia Tech</span>' : ''}
          <div style="font-size: 0.6rem; color: #9ca3af;">${deal.serviceLine || 'Other'}${deal.owner ? ' • ' + deal.owner.split(' ')[0] : ''}</div>
        </div>
        <div style="font-weight: 600; color: #16a34a;">${fmt(deal.acv)}</div>
      </div>
    `).join('')}
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- EUDIA ACTIVE PIPELINE BY PRODUCT LINE -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Eudia Active Pipeline by Product</div>
    <div class="stage-subtitle">Open opportunities by product line</div>
    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
      ${Object.entries(productBreakdown)
        .sort((a, b) => b[1].totalACV - a[1].totalACV)
        .slice(0, 8)
        .map(([prod, data]) => `
          <div style="background: #eff6ff; padding: 6px 10px; border-radius: 4px; font-size: 0.7rem;">
            <div style="font-weight: 600; color: #1e40af;">${prod}</div>
            <div style="color: #6b7280;">${data.count} opps • ${fmt(data.totalACV)}</div>
          </div>
        `).join('')}
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- JH ACTIVE PIPELINE BY SERVICE LINE -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">JH Active Pipeline by Service Line</div>
    <div class="stage-subtitle">Open opportunities by service line</div>
    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
      ${Object.entries(jhServiceLines)
        .sort((a, b) => b[1].acv - a[1].acv)
        .slice(0, 8)
        .map(([sl, data]) => `
          <div style="background: #fef3c7; padding: 6px 10px; border-radius: 4px; font-size: 0.7rem;">
            <div style="font-weight: 600; color: #92400e;">${sl}</div>
            <div style="color: #6b7280;">${data.count} opps • ${fmt(data.acv)}</div>
          </div>
        `).join('')}
    </div>
  </div>
</div>`;
}

/**
 * Generate Weekly RevOps Summary Tab
 * Replicates Friday "RevOps Weekly Update" email format
 */
function generateWeeklyTab(params) {
  const {
    totalGross, totalWeighted, totalDeals, accountMap,
    stageBreakdown, jhSummary, jhAccounts,
    signedByType, signedDealsTotal,
    novDecRevenue, novDecRevenueTotal,
    contractsByAccount, recurringTotal, projectTotal,
    closedLostDeals = [], daysInStageByStage = {},
    logosByType = { revenue: [], pilot: [], loi: [] },
    newOppsThisWeek = [], newOppsTotal = 0
  } = params;
  
  // Helper for currency formatting
  const fmt = (val) => {
    if (!val || val === 0) return '-';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';
    return '$' + Math.round(val / 1000) + 'k';
  };
  
  // Get opportunities with December sign date (Target_LOI_Date__c)
  const decemberOpps = [];
  accountMap.forEach(acc => {
    acc.opportunities?.forEach(opp => {
      const targetDate = opp.Target_LOI_Date__c;
      if (targetDate) {
        const d = new Date(targetDate);
        if (d.getMonth() === 11 && d.getFullYear() === 2025) { // December 2025
          decemberOpps.push({
            account: acc.name,
            name: opp.Name,
            acv: opp.ACV__c || 0,
            stage: opp.StageName,
            owner: acc.owner
          });
        }
      }
    });
  });
  decemberOpps.sort((a, b) => b.acv - a.acv);
  const decTotalACV = decemberOpps.reduce((sum, o) => sum + o.acv, 0);
  
  // Top 10 by ACV (from pipeline)
  const top10Opps = [];
  accountMap.forEach(acc => {
    acc.opportunities?.forEach(opp => {
      top10Opps.push({
        account: acc.name,
        name: opp.Name,
        acv: opp.ACV__c || 0,
        stage: opp.StageName
      });
    });
  });
  top10Opps.sort((a, b) => b.acv - a.acv);
  const top10 = top10Opps.slice(0, 10);
  const top10Total = top10.reduce((sum, o) => sum + o.acv, 0);
  
  // Last week's combined baseline values (Dec 5, 2025 - from SF report)
  const lastWeekBaseline = {
    'Stage 0 - Qualifying': { acv: 3000000, oppCount: 43 },
    'Stage 1 - Discovery': { acv: 13600000, oppCount: 110 },
    'Stage 2 - SQO': { acv: 11100000, oppCount: 53 },
    'Stage 3 - Pilot': { acv: 400000, oppCount: 4 },
    'Stage 4 - Proposal': { acv: 5600000, oppCount: 37 },
    'Stage 5 - Negotiation': { acv: 1800000, oppCount: 6 },
    'Total': { acv: 35500000, oppCount: 253 }
  };
  
  // Get Johnson Hana stage breakdown
  const jhByStage = jhSummary?.byStage || {};
  
  // Combine Eudia + JH for current week (COMBINED VIEW)
  const stageWoW = [
    { 
      stage: 'Stage 0 - Qualifying', 
      acv: (stageBreakdown['Stage 0 - Qualifying']?.totalACV || 0) + (jhByStage['Stage 0 - Qualifying']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 0 - Qualifying']?.count || 0) + (jhByStage['Stage 0 - Qualifying']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 0 - Qualifying'].acv,
      lastOppCount: lastWeekBaseline['Stage 0 - Qualifying'].oppCount
    },
    { 
      stage: 'Stage 1 - Discovery', 
      acv: (stageBreakdown['Stage 1 - Discovery']?.totalACV || 0) + (jhByStage['Stage 1 - Discovery']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 1 - Discovery']?.count || 0) + (jhByStage['Stage 1 - Discovery']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 1 - Discovery'].acv,
      lastOppCount: lastWeekBaseline['Stage 1 - Discovery'].oppCount
    },
    { 
      stage: 'Stage 2 - SQO', 
      acv: (stageBreakdown['Stage 2 - SQO']?.totalACV || 0) + (jhByStage['Stage 2 - SQO']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 2 - SQO']?.count || 0) + (jhByStage['Stage 2 - SQO']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 2 - SQO'].acv,
      lastOppCount: lastWeekBaseline['Stage 2 - SQO'].oppCount
    },
    { 
      stage: 'Stage 3 - Pilot', 
      acv: (stageBreakdown['Stage 3 - Pilot']?.totalACV || 0) + (jhByStage['Stage 3 - Pilot']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 3 - Pilot']?.count || 0) + (jhByStage['Stage 3 - Pilot']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 3 - Pilot'].acv,
      lastOppCount: lastWeekBaseline['Stage 3 - Pilot'].oppCount
    },
    { 
      stage: 'Stage 4 - Proposal', 
      acv: (stageBreakdown['Stage 4 - Proposal']?.totalACV || 0) + (jhByStage['Stage 4 - Proposal']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 4 - Proposal']?.count || 0) + (jhByStage['Stage 4 - Proposal']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 4 - Proposal'].acv,
      lastOppCount: lastWeekBaseline['Stage 4 - Proposal'].oppCount
    },
    { 
      stage: 'Stage 5 - Negotiation', 
      acv: (stageBreakdown['Stage 5 - Negotiation']?.totalACV || 0) + (jhByStage['Stage 5 - Negotiation']?.totalACV || 0), 
      oppCount: (stageBreakdown['Stage 5 - Negotiation']?.count || 0) + (jhByStage['Stage 5 - Negotiation']?.count || 0),
      lastAcv: lastWeekBaseline['Stage 5 - Negotiation'].acv,
      lastOppCount: lastWeekBaseline['Stage 5 - Negotiation'].oppCount
    }
  ];
  
  // Calculate % change helper
  const calcPctChange = (current, last) => {
    if (last === 0) return current > 0 ? '+∞' : '-';
    const pct = ((current - last) / last) * 100;
    if (pct === 0) return '0%';
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  };
  
  const stageTotalACV = stageWoW.reduce((sum, s) => sum + s.acv, 0);
  const stageTotalCount = stageWoW.reduce((sum, s) => sum + s.oppCount, 0);
  
  // Current logos count from Account.Customer_Type__c (all tagged accounts)
  const allLogos = [
    ...logosByType.revenue.map(a => a.accountName),
    ...logosByType.pilot.map(a => a.accountName),
    ...logosByType.loi.map(a => a.accountName)
  ];
  const currentLogosCount = allLogos.length;
  
  // Run-rate forecast (using contract data)
  const fy2025Total = recurringTotal + projectTotal;
  const jhTotal = jhSummary?.totalPipeline || 0;
  const combinedTotal = fy2025Total + jhTotal;
  
  return `
<div id="weekly" class="tab-content">
  <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.75rem; color: #374151;">
    <strong>RevOps Weekly Summary</strong> — Formatted like Friday email updates. Data pulled live from Salesforce.
  </div>

  <!-- SECTION 1: REVENUE FORECAST SNAPSHOT -->
  <div class="weekly-section">
    <div class="weekly-section-title">1. Revenue Forecast Snapshot</div>
    
    <!-- Opportunities with December Sign Date - Side by Side -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Opportunities with December Target Sign Date</div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px;">
        <!-- Eudia -->
        <div style="flex: 1; min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.8rem;">EUDIA (${decemberOpps.length} opps)</div>
          <ol class="weekly-list" style="font-size: 0.75rem; margin: 0; padding-left: 16px;">
            ${decemberOpps.slice(0, 10).map((o, i) => `<li>${o.account}, ${fmt(o.acv)}</li>`).join('') || '<li style="color: #9ca3af;">None</li>'}
          </ol>
          <div style="margin-top: 8px; font-size: 0.75rem; font-weight: 600; color: #059669;">Total: ${fmt(decTotalACV)}</div>
        </div>
        <!-- Johnson Hana -->
        <div style="flex: 1; min-width: 280px; background: #fdf4ff; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.8rem;">JOHNSON HANA ${(() => {
            const jhDecOpps = (jhSummary?.pipeline || []).filter(o => {
              if (!o.closeDate) return false;
              const d = new Date(o.closeDate);
              return d.getMonth() === 11 && d.getFullYear() === 2025;
            });
            return '(' + jhDecOpps.length + ' opps)';
          })()}</div>
          <ol class="weekly-list" style="font-size: 0.75rem; margin: 0; padding-left: 16px;">
            ${(() => {
              const jhDecOpps = (jhSummary?.pipeline || []).filter(o => {
                if (!o.closeDate) return false;
                const d = new Date(o.closeDate);
                return d.getMonth() === 11 && d.getFullYear() === 2025;
              }).sort((a, b) => (b.acv || 0) - (a.acv || 0)).slice(0, 10);
              return jhDecOpps.map(o => `<li>${o.account}, ${fmt(o.acv || 0)}</li>`).join('') || '<li style="color: #9ca3af;">None</li>';
            })()}
          </ol>
          <div style="margin-top: 8px; font-size: 0.75rem; font-weight: 600; color: #7c3aed;">Total: ${fmt((jhSummary?.pipeline || []).filter(o => {
            if (!o.closeDate) return false;
            const d = new Date(o.closeDate);
            return d.getMonth() === 11 && d.getFullYear() === 2025;
          }).reduce((sum, o) => sum + (o.acv || 0), 0))}</div>
        </div>
      </div>
    </div>
    
    <!-- Signed Net New Logos Table - FY2025 Focus -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Eudia - Signed Net New Logos</div>
      <table class="weekly-table">
        <thead>
          <tr><th>Period</th><th style="text-align: center;">Logos Signed</th></tr>
        </thead>
        <tbody>
          <tr style="color: #6b7280;"><td>FY2024 Total</td><td style="text-align: center;">4</td></tr>
          <tr><td>Q1 FY2025</td><td style="text-align: center;">2</td></tr>
          <tr><td>Q2 FY2025</td><td style="text-align: center;">2</td></tr>
          <tr><td>Q3 FY2025</td><td style="text-align: center;">25</td></tr>
          <tr style="background: #f0fdf4;"><td>Q4 FY2025 (to date)</td><td style="text-align: center;">5</td></tr>
          <tr style="font-weight: 600; background: #e5e7eb;"><td>Total</td><td style="text-align: center;">38</td></tr>
        </tbody>
      </table>
      <div style="font-size: 0.65rem; color: #374151; margin-top: 4px;"><strong>Q4 FY2025 Logos (Nov-Dec to date):</strong> BNY Mellon, Delinea, IQVIA, Udemy Ireland Limited, World Wide Technology</div>
    </div>
    
    <!-- Current Logos -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Current Logos: (${currentLogosCount})</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        ${allLogos.sort().join(', ')}
      </div>
    </div>
    
    <!-- Run-Rate Forecast Table -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Eudia - Run-Rate Forecast ($)</div>
      <table class="weekly-table">
        <thead>
          <tr><th>Month</th><th>Cumulative*</th><th>Net New</th></tr>
        </thead>
        <tbody>
          <tr><td>August</td><td>$4.9</td><td>-</td></tr>
          <tr><td>September</td><td>$5.0</td><td>$0.1</td></tr>
          <tr><td>October</td><td>$6.8</td><td>$1.8</td></tr>
          <tr><td>November Forecast</td><td>$7.2</td><td>$0.4</td></tr>
          <tr style="font-weight: 600; background: #f0fdf4;">
            <td>FY2025E - Eudia Only</td><td>${fmt(fy2025Total)}</td><td>-</td>
          </tr>
          <tr style="font-style: italic; color: #6b7280;">
            <td>Including JH</td><td>~$23m</td><td></td>
          </tr>
        </tbody>
      </table>
      <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 4px; font-style: italic;">*Historical figures adjusted based on Finance review of 'recurring' and 'project' contract signature dates, terms, and pricing.</div>
    </div>
  </div>

  <!-- SECTION 2: GROSS PIPELINE BREAKDOWN BY ENTITY -->
  <div class="weekly-section">
    <div class="weekly-section-title">2. Gross Pipeline Breakdown by Entity</div>
    
    <ul class="weekly-list">
      <li><strong>Eudia:</strong> ${fmt(totalGross)} Gross || ${fmt(totalWeighted)} Weighted || ${totalDeals} opportunities</li>
      <li><strong>Johnson Hana:</strong> ${fmt(jhSummary?.totalPipeline || 0)} || ${fmt(jhSummary?.totalWeighted || 0)} Weighted || ${jhSummary?.totalOpportunities || 0} opportunities <span style="font-size: 0.7rem; color: #047857;">(${jhSummary?.eudiaTech?.opportunityCount || 0} tagged as 'Eudia Tech enabled')</span></li>
      <li><strong>Total Gross Pipeline:</strong> ${fmt((totalGross || 0) + (jhSummary?.totalPipeline || 0))} || ${fmt((totalWeighted || 0) + (jhSummary?.totalWeighted || 0))} Weighted || ${(totalDeals || 0) + (jhSummary?.totalOpportunities || 0)} opportunities</li>
    </ul>
    
    <!-- Week-over-week Change by Stage - Combined View (Eudia + JH) -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Week-over-week Change by Stage - Combined (Eudia + JH)</div>
      <table class="weekly-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th style="text-align: right;">ACV</th>
            <th style="text-align: center;">% WoW</th>
            <th style="text-align: center;">Opps</th>
            <th style="text-align: center;">% WoW</th>
          </tr>
        </thead>
        <tbody>
          ${stageWoW.map(s => {
            const acvPct = calcPctChange(s.acv, s.lastAcv);
            const oppPct = calcPctChange(s.oppCount, s.lastOppCount);
            const acvColor = acvPct.startsWith('+') ? '#059669' : acvPct.startsWith('-') ? '#dc2626' : '#6b7280';
            const oppColor = oppPct.startsWith('+') ? '#059669' : oppPct.startsWith('-') ? '#dc2626' : '#6b7280';
            return `
          <tr>
            <td>${s.stage.replace('Stage ', 'S').replace(' - ', ' ')}</td>
            <td style="text-align: right;">${fmt(s.acv)}</td>
            <td style="text-align: center; color: ${acvColor}; font-size: 0.7rem;">${acvPct}</td>
            <td style="text-align: center;">${s.oppCount}</td>
            <td style="text-align: center; color: ${oppColor}; font-size: 0.7rem;">${oppPct}</td>
          </tr>`;
          }).join('')}
          <tr style="font-weight: 600; background: #e5e7eb;">
            <td>Total</td>
            <td style="text-align: right;">${fmt(stageTotalACV)}</td>
            <td style="text-align: center; color: ${calcPctChange(stageTotalACV, lastWeekBaseline.Total.acv).startsWith('+') ? '#059669' : calcPctChange(stageTotalACV, lastWeekBaseline.Total.acv).startsWith('-') ? '#dc2626' : '#6b7280'}; font-size: 0.7rem;">${calcPctChange(stageTotalACV, lastWeekBaseline.Total.acv)}</td>
            <td style="text-align: center;">${stageTotalCount}</td>
            <td style="text-align: center; color: ${calcPctChange(stageTotalCount, lastWeekBaseline.Total.oppCount).startsWith('+') ? '#059669' : calcPctChange(stageTotalCount, lastWeekBaseline.Total.oppCount).startsWith('-') ? '#dc2626' : '#6b7280'}; font-size: 0.7rem;">${calcPctChange(stageTotalCount, lastWeekBaseline.Total.oppCount)}</td>
          </tr>
        </tbody>
      </table>
      <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 4px; font-style: italic;">Baseline: Last week's combined Eudia + JH totals (Dec 5, 2025)</div>
    </div>
    
    <!-- New Opportunities Added This Week -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Eudia new opportunities added this week: ${newOppsThisWeek.length} opportunities, +${fmt(newOppsTotal)} ACV</div>
      <div style="font-size: 0.75rem; color: #374151; margin-top: 8px;">
        <strong>Companies:</strong> ${newOppsThisWeek.map(o => {
          // Add note for DECA/Army split opportunity
          if (o.accountName?.includes('DOD') && o.oppName?.toLowerCase().includes('deca')) {
            return o.accountName + ' <span style="font-size: 0.65rem; color: #6b7280;">(split from bundled opp - potential Phase 0 EOY)</span>';
          }
          return o.accountName + (o.productLine ? ' (' + o.productLine + ')' : '');
        }).join(', ') || 'None'}
      </div>
    </div>
    
    <!-- Johnson Hana New Opps -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Johnson Hana new opportunities added this week: 1 opportunity, +$70k ACV</div>
      <div style="font-size: 0.75rem; color: #374151; margin-top: 8px;">
        <strong>Companies:</strong> Version1 (Contracting-BAU, Tom Clancy)
      </div>
    </div>
  </div>

  <!-- SECTION 3: DEALS IMPACTING THE FORECAST (T10) - Side by Side -->
  <div class="weekly-section">
    <div class="weekly-section-title">3. Deals Impacting the Forecast (T10)</div>
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
      <!-- Eudia -->
      <div style="flex: 1; min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.8rem;">EUDIA</div>
        <ol class="weekly-list" style="font-size: 0.75rem; margin: 0; padding-left: 16px;">
          ${top10.map((o, i) => `<li>${o.account} | ${fmt(o.acv)}</li>`).join('')}
        </ol>
        <div style="margin-top: 8px; font-size: 0.75rem; font-weight: 600; color: #059669;">Total: ${fmt(top10Total)}</div>
      </div>
      <!-- Johnson Hana -->
      <div style="flex: 1; min-width: 280px; background: #fdf4ff; border-radius: 8px; padding: 12px;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.8rem;">JOHNSON HANA</div>
        <ol class="weekly-list" style="font-size: 0.75rem; margin: 0; padding-left: 16px;">
          ${(() => {
            const jhPipeline = jhSummary?.pipeline || [];
            const jhTop10 = [...jhPipeline].sort((a, b) => (b.weighted || 0) - (a.weighted || 0)).slice(0, 10);
            return jhTop10.map(o => `<li>${o.account} | ${fmt(o.acv)}</li>`).join('') || '<li style="color: #9ca3af;">No data</li>';
          })()}
        </ol>
        <div style="margin-top: 8px; font-size: 0.75rem; font-weight: 600; color: #7c3aed;">Total: ${fmt(jhSummary?.pipeline?.slice(0, 10).reduce((sum, o) => sum + (o.acv || 0), 0) || 0)}</div>
      </div>
    </div>
  </div>

  <!-- SECTION 4: CLOSED LOST, DQ, OR NURTURE -->
  <div class="weekly-section">
    <div class="weekly-section-title">4. Closed Lost, Disqualified, or Nurture this week</div>
    <table class="weekly-table">
      <thead>
        <tr><th>Account</th><th>Closed Lost Detail</th></tr>
      </thead>
      <tbody>
        ${closedLostDeals.length > 0 ? closedLostDeals.map(deal => `
        <tr>
          <td style="font-weight: 500;">${deal.accountName}</td>
          <td style="font-size: 0.75rem; color: #374151;">${deal.closedLostDetail || deal.closedLostReason || 'No detail provided'}</td>
        </tr>`).join('') : `
        <tr>
          <td colspan="2" style="color: #9ca3af; text-align: center; font-style: italic;">No closed lost deals this week</td>
        </tr>`}
      </tbody>
    </table>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 4px;">Source: Stage 7. Closed (Lost) opportunities from last 7 days</div>
  </div>

  <!-- SECTION 5: LONGEST DEALS BY STAGE (T10) -->
  <div class="weekly-section">
    <div class="weekly-section-title">5. Longest Deals by Stage (T10)</div>
    <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 12px;">Top 10 deals per stage, sorted by days in stage (descending)</div>
    
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Stage 1 - Discovery</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        USDA (191), Apple (105), Goldman Sachs (102), Army Futures Command (102), MetLife (86), Advent (79), JP Morgan (79), CSL (79), HG (78), Centene (76)
      </div>
    </div>
    
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Stage 2 - SQO</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        Corebridge Financial (178), UK Government (147), Southwest Airlines (143), Blackstone (105), Amazon (105), Cummins (105), Petsmart (105), Instacart (101), Uber (87), The Weir Group (79)
      </div>
    </div>
    
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Stage 3 - Pilot</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        Intuit (190), US Marine Corp (105)
      </div>
    </div>
    
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Stage 4 - Proposal</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        NATO (105), Air Force STTR (105), The Weir Group (102), Western Digital (73), DHL (64), WW Grainger (64), USAF SBIR Phase 1 (64), Intuit (57), Medtronic (35), Dolby (35)
      </div>
    </div>
    
    <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 8px; font-style: italic;">Last updated: Dec 5, 2025 (based on prior week + 7 days)</div>
  </div>
</div>`;
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
  // ALL CLOSED WON DEALS - Only 'Stage 6. Closed(Won)' opportunities
  // Excludes deals from other closed stages (like Glanbia, OpenAI, etc.)
  // Excludes sample/test accounts (Acme, Sample, Sandbox, etc.)
  // Categorized by Revenue_Type__c: ARR = Revenue, Booking = LOI, Project = Pilot
  // ═══════════════════════════════════════════════════════════════════════
  const signedDealsQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, Product_Line__c, Revenue_Type__c, StageName
    FROM Opportunity
    WHERE StageName = 'Stage 6. Closed(Won)'
      AND (NOT Account.Name LIKE '%Sample%')
      AND (NOT Account.Name LIKE '%Acme%')
      AND (NOT Account.Name LIKE '%Sandbox%')
      AND (NOT Account.Name LIKE '%Test%')
      AND (NOT Account.Name LIKE '%MasterCard Rose%')
      AND (NOT Account.Name LIKE '%DXC Technology%')
    ORDER BY CloseDate DESC
  `;
  
  // FQ4 TO DATE (Fiscal Q4: Nov 1, 2025 - Jan 31, 2026)
  // For Top Co Closed Revenue section - only deals closed since fiscal quarter start
  const novDecDealsQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, Product_Line__c, Revenue_Type__c, StageName
    FROM Opportunity
    WHERE StageName = 'Stage 6. Closed(Won)' 
      AND CloseDate >= 2025-11-01
      AND (NOT Account.Name LIKE '%Sample%')
      AND (NOT Account.Name LIKE '%Acme%')
      AND (NOT Account.Name LIKE '%Sandbox%')
      AND (NOT Account.Name LIKE '%Test%')
      AND (NOT Account.Name LIKE '%MasterCard Rose%')
      AND (NOT Account.Name LIKE '%DXC Technology%')
    ORDER BY CloseDate DESC
  `;
  
  // Categorize by Revenue_Type__c (ARR = Revenue, Booking = LOI, Project = Pilot)
  const categorizeByRevenueType = (revType) => {
    if (!revType) return 'pilot';
    const rt = revType.toLowerCase().trim();
    if (rt === 'arr' || rt === 'recurring') return 'revenue';
    if (rt === 'booking') return 'loi';
    return 'pilot'; // Project or default
  };
  
  let signedByType = { revenue: [], pilot: [], loi: [] };
  let signedDealsTotal = { revenue: 0, pilot: 0, loi: 0 };
  // Nov-Dec deals for Top Co section (revenue only)
  let novDecRevenue = [];
  let novDecRevenueTotal = 0;
  
  // Helper to check if account is a sample/test/dummy account
  const isSampleAccount = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    // Exclude sample, test, sandbox accounts
    if (lower.includes('sample') || lower.includes('acme') || lower.includes('sandbox') || lower.includes('test')) return true;
    // Exclude specific dummy accounts
    if (lower.includes('mastercard rose') || lower.includes('dxc technology')) return true;
    return false;
  };
  
  try {
    const signedData = await query(signedDealsQuery, true);
    console.log(`[Dashboard] All Closed Won (Stage 6) returned ${signedData?.records?.length || 0} records`);
    if (signedData?.records) {
      const uniqueTypes = [...new Set(signedData.records.map(o => o.Revenue_Type__c).filter(Boolean))];
      console.log(`[Dashboard] Revenue_Type__c values: ${JSON.stringify(uniqueTypes)}`);
      
      signedData.records.forEach(opp => {
        const accountName = opp.Account?.Name || 'Unknown';
        // Skip sample/test accounts
        if (isSampleAccount(accountName)) return;
        
        const deal = {
          accountName,
          oppName: opp.Name || '',
          closeDate: opp.CloseDate,
          acv: opp.ACV__c || 0,
          product: opp.Product_Line__c || '',
          revenueType: opp.Revenue_Type__c || ''
        };
        
        const category = categorizeByRevenueType(deal.revenueType);
        signedByType[category].push(deal);
        signedDealsTotal[category] += deal.acv;
      });
    }
    console.log(`[Dashboard] All Closed Won by type: revenue=${signedByType.revenue.length}, pilot=${signedByType.pilot.length}, loi=${signedByType.loi.length}`);
    
    // Query Nov 1, 2024+ deals separately for Top Co section
    const novDecData = await query(novDecDealsQuery, true);
    console.log(`[Dashboard] Nov 1+ Closed Won returned ${novDecData?.records?.length || 0} records`);
    if (novDecData?.records) {
      novDecData.records.forEach(opp => {
        const accountName = opp.Account?.Name || 'Unknown';
        // Skip sample/test accounts
        if (isSampleAccount(accountName)) return;
        
        const revType = (opp.Revenue_Type__c || '').toLowerCase().trim();
        // Only include recurring/ARR deals for revenue section
        if (revType === 'arr' || revType === 'recurring') {
          novDecRevenue.push({
            accountName,
            oppName: opp.Name || '',
            closeDate: opp.CloseDate,
            acv: opp.ACV__c || 0,
            product: opp.Product_Line__c || ''
          });
          novDecRevenueTotal += opp.ACV__c || 0;
        }
      });
    }
    console.log(`[Dashboard] Nov 1+ Revenue deals: ${novDecRevenue.length}, total: $${novDecRevenueTotal}`);
  } catch (e) { console.error('Signed deals query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // LOGOS BY TYPE - Query Account directly for Customer_Type__c
  // Includes ALL accounts with Customer_Type__c set (not just open pipeline)
  // ═══════════════════════════════════════════════════════════════════════
  const logosQuery = `
    SELECT Name, Customer_Type__c
    FROM Account
    WHERE Customer_Type__c != null
    ORDER BY Name
  `;
  
  let logosByType = { revenue: [], pilot: [], loi: [] };
  
  try {
    const logosData = await query(logosQuery, true);
    console.log(`[Dashboard] Logos query returned ${logosData?.records?.length || 0} accounts with Customer_Type__c`);
    if (logosData?.records) {
      // Log all unique Customer_Type__c values for debugging
      const uniqueTypes = [...new Set(logosData.records.map(a => a.Customer_Type__c).filter(Boolean))];
      console.log(`[Dashboard] Customer_Type__c values found: ${JSON.stringify(uniqueTypes)}`);
      
      logosData.records.forEach(acc => {
        const ct = (acc.Customer_Type__c || '').toLowerCase().trim();
        // Match badge logic: includes('revenue') OR equals 'arr'
        if (ct.includes('revenue') || ct === 'arr') {
          logosByType.revenue.push({ accountName: acc.Name });
        } else if (ct.includes('pilot')) {
          logosByType.pilot.push({ accountName: acc.Name });
        } else if (ct.includes('loi')) {
          logosByType.loi.push({ accountName: acc.Name });
        }
      });
    }
    console.log(`[Dashboard] Logos by type: revenue=${logosByType.revenue.length}, pilot=${logosByType.pilot.length}, loi=${logosByType.loi.length}`);
  } catch (e) { console.error('Logos query error:', e.message); }
  
  // Helper function to format currency
  const formatCurrency = (val) => {
    if (!val || val === 0) return '-';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';
    return '$' + (val / 1000).toFixed(0) + 'k';
  };
  
  // Helper function to format date as abbreviated (MAR-5)
  const formatDateAbbrev = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[date.getMonth()]}-${date.getDate()}`;
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // LOI HISTORY - Find Revenue accounts that signed LOIs before converting
  // Check for closed Booking/LOI deals on each Revenue account
  // ═══════════════════════════════════════════════════════════════════════
  const loiHistoryQuery = `
    SELECT Account.Name, Revenue_Type__c
    FROM Opportunity
    WHERE Revenue_Type__c = 'Booking' AND IsClosed = true AND IsWon = true
  `;
  
  let accountsWithLOIHistory = new Set();
  
  try {
    const loiHistoryData = await query(loiHistoryQuery, true);
    if (loiHistoryData?.records) {
      loiHistoryData.records.forEach(opp => {
        if (opp.Account?.Name) {
          accountsWithLOIHistory.add(opp.Account.Name);
        }
      });
    }
    console.log(`[Dashboard] Accounts with LOI history: ${accountsWithLOIHistory.size}`);
  } catch (e) { console.error('LOI history query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CLOSED LOST DEALS - Stage 7 opportunities from last 7 days
  // ═══════════════════════════════════════════════════════════════════════
  const closedLostQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, 
           Closed_Lost_Detail__c, Closed_Lost_Reason__c, StageName
    FROM Opportunity
    WHERE StageName = 'Stage 7. Closed (Lost)'
      AND CloseDate >= LAST_N_DAYS:7
    ORDER BY CloseDate DESC
  `;
  
  let closedLostDeals = [];
  
  try {
    const closedLostData = await query(closedLostQuery, true);
    console.log(`[Dashboard] Closed Lost query returned ${closedLostData?.records?.length || 0} records`);
    if (closedLostData?.records) {
      closedLostData.records.forEach(opp => {
        closedLostDeals.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          acv: opp.ACV__c || 0,
          closeDate: opp.CloseDate,
          closedLostDetail: opp.Closed_Lost_Detail__c || '',
          closedLostReason: opp.Closed_Lost_Reason__c || ''
        });
      });
    }
  } catch (e) { console.error('Closed Lost query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // OPPORTUNITIES CREATED THIS WEEK - CreatedDate in last 7 days
  // ═══════════════════════════════════════════════════════════════════════
  const newOppsQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, CreatedDate, Owner.Name, Product_Line__c
    FROM Opportunity
    WHERE CreatedDate >= LAST_N_DAYS:7
      AND IsClosed = false
    ORDER BY CreatedDate DESC
  `;
  
  let newOppsThisWeek = [];
  let newOppsTotal = 0;
  
  try {
    const newOppsData = await query(newOppsQuery, true);
    console.log(`[Dashboard] New Opps This Week query returned ${newOppsData?.records?.length || 0} records`);
    if (newOppsData?.records) {
      newOppsData.records.forEach(opp => {
        const acv = opp.ACV__c || 0;
        newOppsThisWeek.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          stage: opp.StageName || '',
          acv,
          createdDate: opp.CreatedDate,
          owner: opp.Owner?.Name || '',
          productLine: opp.Product_Line__c || ''
        });
        newOppsTotal += acv;
      });
    }
  } catch (e) { console.error('New Opps query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DAYS IN STAGE - Using Salesforce's Days_in_Stage__c field
  // ═══════════════════════════════════════════════════════════════════════
  const daysInStageQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, Days_in_Stage__c
    FROM Opportunity
    WHERE IsClosed = false
      AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
    ORDER BY Days_in_Stage__c DESC NULLS LAST
  `;
  
  let daysInStageByStage = {
    'Stage 1 - Discovery': [],
    'Stage 2 - SQO': [],
    'Stage 3 - Pilot': [],
    'Stage 4 - Proposal': [],
    'Stage 5 - Negotiation': []
  };
  
  try {
    const daysData = await query(daysInStageQuery, true);
    console.log(`[Dashboard] Days in Stage query returned ${daysData?.records?.length || 0} records`);
    if (daysData?.records) {
      daysData.records.forEach(opp => {
        const stage = opp.StageName;
        if (daysInStageByStage[stage]) {
          daysInStageByStage[stage].push({
            accountName: opp.Account?.Name || 'Unknown',
            oppName: opp.Name || '',
            acv: opp.ACV__c || 0,
            daysInStage: opp.Days_in_Stage__c || 0
          });
        }
      });
      // Keep only top 10 per stage (already sorted by Days_in_Stage__c DESC)
      Object.keys(daysInStageByStage).forEach(stage => {
        daysInStageByStage[stage] = daysInStageByStage[stage].slice(0, 10);
      });
    }
  } catch (e) { console.error('Days in Stage query error:', e.message); }
  
  // Add manual entry for Ecolab (waiting for contract)
  if (!contractsByAccount.has('Ecolab')) {
    contractsByAccount.set('Ecolab', { recurring: [], project: [], totalARR: 200000, totalProject: 0, pending: true });
    recurringTotal += 200000;
  } else if (contractsByAccount.get('Ecolab').totalARR === 0) {
    const ecolab = contractsByAccount.get('Ecolab');
    ecolab.totalARR = 200000;
    ecolab.pending = true;
    recurringTotal += 200000;
  }

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
  // ADDED: Target_LOI_Date__c for target sign date display
  const accountQuery = `SELECT Account.Id, Account.Name, Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c, Account.Customer_Type__c,
                               Name, StageName, ACV__c, Finance_Weighted_ACV__c, Product_Line__c,
                               Target_LOI_Date__c
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
  
  // ═══════════════════════════════════════════════════════════════════════
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
<title>GTM Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; padding: 16px; }
.header { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.header h1 { font-size: 1.5rem; font-weight: 700; color: #1f2937; margin-bottom: 4px; }
.header p { font-size: 0.875rem; color: #6b7280; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; }
.tab { background: #fff; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; white-space: nowrap; color: #6b7280; transition: all 0.2s; }
.tab:hover { background: #e5e7eb; }
#tab-topco:checked ~ .tabs label[for="tab-topco"],
#tab-weekly:checked ~ .tabs label[for="tab-weekly"],
#tab-summary:checked ~ .tabs label[for="tab-summary"],
#tab-revenue:checked ~ .tabs label[for="tab-revenue"],
#tab-account-plans:checked ~ .tabs label[for="tab-account-plans"] { background: #8e99e1; color: #fff; }
.tab-content { display: none; }
#tab-topco:checked ~ #topco,
#tab-weekly:checked ~ #weekly,
#tab-summary:checked ~ #summary,
#tab-revenue:checked ~ #revenue,
#tab-account-plans:checked ~ #account-plans { display: block; }
.weekly-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; margin: 8px 0; }
.weekly-table th { background: #1f2937; color: #fff; padding: 8px; text-align: left; font-weight: 600; }
.weekly-table td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
.weekly-table tr:nth-child(even) { background: #f9fafb; }
.weekly-section { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.weekly-section-title { font-size: 1rem; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
.weekly-subsection { margin-top: 16px; }
.weekly-subsection-title { font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 8px; }
.weekly-list { margin: 0; padding-left: 20px; font-size: 0.8rem; color: #374151; }
.weekly-list li { margin-bottom: 4px; }
.weekly-highlight { background: #f0fdf4; border-left: 3px solid #10b981; padding: 8px 12px; margin: 8px 0; font-size: 0.8rem; }
.wow-positive { color: #16a34a; font-weight: 600; }
.wow-negative { color: #dc2626; font-weight: 600; }
.badge-eudia { background: #ecfdf5; color: #047857; border: 1px solid #10b981; font-size: 0.6rem; }
.jh-indicator { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; margin-left: 4px; vertical-align: middle; }
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
.badge-loi { background: #f3f4f6; color: #4b5563; }
.badge-other { background: #f3f4f6; color: #374151; }
.badge-marquee { background: #fff; color: #6b7280; border: 1px solid #d1d5db; font-weight: 500; }
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
  <h1>GTM Dashboard</h1>
  <p>Real-time pipeline overview • Updated ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PT</p>
  <a href="/account-dashboard/logout" style="font-size: 0.7rem; color: #9ca3af; text-decoration: none; margin-top: 8px; display: inline-block;">🔒 Logout (end session)</a>
</div>

<!-- Pure CSS Tabs (No JavaScript - CSP Safe) -->
<input type="radio" name="tabs" id="tab-topco" checked style="display: none;">
<input type="radio" name="tabs" id="tab-weekly" style="display: none;">
<input type="radio" name="tabs" id="tab-summary" style="display: none;">
<input type="radio" name="tabs" id="tab-revenue" style="display: none;">
<input type="radio" name="tabs" id="tab-account-plans" style="display: none;">

<div class="tabs">
  <label for="tab-topco" class="tab">Top Co</label>
  <label for="tab-weekly" class="tab">Weekly</label>
  <label for="tab-summary" class="tab">Eudia Summary</label>
  <label for="tab-revenue" class="tab">Revenue</label>
  <label for="tab-account-plans" class="tab">Eudia Accounts</label>
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
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'm' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'k' 
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
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'm' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'k' 
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
  
  <!-- Business Lead Overview -->
  <div class="stage-section">
    <div class="stage-title">Business Lead Overview</div>
    <div class="stage-subtitle">Click BL to expand → Click stage to see opportunities</div>
    <div style="margin-top: 12px;">
      ${Object.entries(blBreakdown).sort((a, b) => b[1].totalACV - a[1].totalACV).slice(0, 6).map(([bl, data]) => {
        const blOpps = accountData.records.filter(o => (o.Owner?.Name || 'Unassigned') === bl);
        return `
        <details style="background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; overflow: hidden;">
          <summary style="padding: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
            <span style="font-weight: 600;">${bl}</span>
            <span style="font-size: 0.875rem; color: #6b7280;">${data.count} opps • <strong style="color: #1f2937;">$${(data.totalACV / 1000000).toFixed(2)}m</strong></span>
          </summary>
          <div style="padding: 12px; border-top: 1px solid #e5e7eb;">
            ${['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'].filter(s => data.byStage[s]?.count > 0).map(stage => {
              const stageOpps = blOpps.filter(o => o.StageName === stage);
              return `
              <details style="margin-bottom: 6px; border: 1px solid #e5e7eb; border-radius: 4px;">
                <summary style="padding: 8px; cursor: pointer; background: #f3f4f6; font-size: 0.8rem; display: flex; justify-content: space-between;">
                  <span>${cleanStageName(stage)}</span>
                  <span style="color: #6b7280;">${data.byStage[stage].count} opps • $${(data.byStage[stage].acv / 1000000).toFixed(2)}m</span>
                </summary>
                <div style="padding: 8px; font-size: 0.75rem;">
                  ${stageOpps.map(o => `
                    <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f3f5;">
                      <div>
                        <div style="font-weight: 500;">${o.Account?.Name || 'Unknown'}</div>
                        <div style="font-size: 0.65rem; color: #9ca3af;">${o.Product_Line__c || 'TBD'}</div>
                      </div>
                      <div style="text-align: right;">
                        <div style="font-weight: 500;">$${((o.ACV__c || 0) / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </details>`;
            }).join('')}
          </div>
        </details>`;
      }).join('')}
    </div>
    <div style="background: #e5e7eb; padding: 12px; border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; font-weight: 700;">
      <span>TOTAL</span>
      <span>${Object.values(blBreakdown).reduce((sum, data) => sum + data.count, 0)} opps • $${(Object.values(blBreakdown).reduce((sum, data) => sum + data.totalACV, 0) / 1000000).toFixed(2)}m</span>
    </div>
  </div>
  
  <!-- Account Tags Legend -->
  <div style="margin-top: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.65rem; color: #6b7280;">
    <div style="margin-bottom: 4px;"><span class="badge badge-marquee" style="font-size: 0.6rem;">High-Touch Marquee</span> Large enterprise, $1M+ ARR potential, requires senior engagement</div>
    <div style="margin-bottom: 4px;"><span class="badge badge-velocity" style="font-size: 0.6rem;">High-Velocity</span> Mid-market, ~$150k ARR potential, faster sales cycle</div>
    <div><span class="badge badge-new" style="font-size: 0.6rem;">New</span> Account with no prior closed deals</div>
  </div>
</div>

<!-- TAB: TOP CO OVERVIEW (Blended Eudia + Johnson Hana) -->
${generateTopCoTab(totalGross, totalWeighted, totalDeals, accountMap.size, stageBreakdown, productBreakdown, accountMap, signedByType, meetingData, novDecRevenue, novDecRevenueTotal)}

<!-- TAB: WEEKLY REVOPS SUMMARY -->
${generateWeeklyTab({
  totalGross, totalWeighted, totalDeals, accountMap,
  stageBreakdown, jhSummary: getJohnsonHanaSummary(), jhAccounts: getJHAccounts(),
  signedByType, signedDealsTotal,
  novDecRevenue, novDecRevenueTotal,
  contractsByAccount, recurringTotal, projectTotal,
  closedLostDeals, daysInStageByStage, logosByType,
  newOppsThisWeek, newOppsTotal
})}

<!-- TAB 3: REVENUE -->
<div id="revenue" class="tab-content">
  <!-- JH Revenue Note -->
  <div style="background: #fffbeb; border: 1px solid #fcd34d; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #92400e;">
    <strong>Note:</strong> Johnson Hana revenue data not yet added. Contract migration in progress — see Top Co tab for blended pipeline view.
  </div>
  
  <!-- Active Revenue by Account -->
  <div class="stage-section">
    <div class="stage-title">Active Revenue by Account</div>
    <div class="stage-subtitle">${contractsByAccount.size} accounts • ${formatCurrency(recurringTotal)} recurring • ${formatCurrency(projectTotal)} project</div>
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
        ${Array.from(contractsByAccount.entries())
          .filter(([name, data]) => data.totalARR > 0 || data.totalProject > 0)
          .sort((a, b) => {
            // Sort ARR accounts first (by ARR amount), then Project-only accounts
            const aHasARR = a[1].totalARR > 0;
            const bHasARR = b[1].totalARR > 0;
            if (aHasARR && !bHasARR) return -1; // A has ARR, B doesn't -> A first
            if (!aHasARR && bHasARR) return 1;  // B has ARR, A doesn't -> B first
            // Both have ARR or both have only Project -> sort by value
            if (aHasARR && bHasARR) return b[1].totalARR - a[1].totalARR;
            return b[1].totalProject - a[1].totalProject;
          })
          .slice(0, 30)
          .map(([name, data]) => {
            const hasLOIHistory = accountsWithLOIHistory.has(name);
            const isPending = data.pending;
            const indicator = isPending ? ' *' : (hasLOIHistory ? ' †' : '');
            return `
        <tr style="border-bottom: 1px solid #f1f3f5;">
          <td style="padding: 6px 4px;">${name}${indicator}</td>
          <td style="padding: 6px 4px; text-align: right;">${formatCurrency(data.totalARR)}</td>
          <td style="padding: 6px 4px; text-align: right;">${formatCurrency(data.totalProject)}</td>
        </tr>`;
          }).join('')}
      </tbody>
      <tfoot>
        <tr style="border-top: 2px solid #e5e7eb; font-weight: 600;">
          <td style="padding: 8px 4px;">TOTAL</td>
          <td style="padding: 8px 4px; text-align: right;">${formatCurrency(recurringTotal)}</td>
          <td style="padding: 8px 4px; text-align: right;">${formatCurrency(projectTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 6px;">* Awaiting contract  † Signed LOI before converting</div>
    ${contractsByAccount.size === 0 ? '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No active contracts</div>' : ''}
  </div>

  <!-- All Closed Won Deals - By Revenue_Type__c -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">All Closed Won</div>
    <div class="stage-subtitle">${signedByType.revenue.length} revenue • ${signedByType.pilot.length} pilot • ${signedByType.loi.length} LOI</div>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-bottom: 4px;">Stage 6. Closed(Won) deals only</div>
  </div>
  
  <div class="section-card">
    ${signedByType.revenue.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #16a34a; margin-bottom: 6px;">REVENUE (${formatCurrency(signedDealsTotal.revenue)})</div>
    ${signedByType.revenue.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <div style="display: flex; gap: 12px;">
          <span style="color: #9ca3af; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
          <span style="color: #6b7280; min-width: 50px; text-align: right;">${formatCurrency(d.acv)}</span>
        </div>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.pilot.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #2563eb; margin-top: 10px; margin-bottom: 6px;">PILOT (${formatCurrency(signedDealsTotal.pilot)})</div>
    ${signedByType.pilot.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <div style="display: flex; gap: 12px;">
          <span style="color: #9ca3af; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
          <span style="color: #6b7280; min-width: 50px; text-align: right;">${formatCurrency(d.acv)}</span>
        </div>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.loi.length > 0 ? `
    <div style="font-size: 0.7rem; font-weight: 600; color: #1f2937; margin-top: 10px; margin-bottom: 6px;">LOI (${formatCurrency(signedDealsTotal.loi)})</div>
    ${signedByType.loi.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">
        <span>${d.accountName}</span>
        <div style="display: flex; gap: 12px;">
          <span style="color: #9ca3af; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
          <span style="color: #6b7280; min-width: 50px; text-align: right;">${formatCurrency(d.acv)}</span>
        </div>
      </div>
    `).join('')}` : ''}
    
    ${signedByType.revenue.length === 0 && signedByType.pilot.length === 0 && signedByType.loi.length === 0 ? '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No closed deals in last 90 days</div>' : ''}
  </div>
  
  <!-- Definitions -->
  <div style="margin-top: 16px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.65rem; color: #6b7280;">
    <div style="margin-bottom: 4px;"><strong>Revenue:</strong> Recurring/ARR subscription contracts</div>
    <div style="margin-bottom: 4px;"><strong>Pilot:</strong> One-time project engagements</div>
    <div><strong>LOI:</strong> Signed commitments to spend over defined period</div>
  </div>
</div>

<!-- TAB 4: ACCOUNTS -->
<div id="account-plans" class="tab-content">
  <!-- Logos by Customer Type (matches badges shown below) -->
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <div style="flex: 1; background: #f0fdf4; padding: 10px; border-radius: 6px; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="font-size: 0.65rem; font-weight: 600; color: #16a34a; margin-bottom: 4px;">REVENUE</div>
        <div style="font-size: 0.5rem; color: #6b7280;">† = via LOI</div>
      </div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #166534;">${logosByType.revenue.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">
        ${logosByType.revenue.filter(a => accountsWithLOIHistory.has(a.accountName)).map(a => a.accountName + '†').join(', ')}${logosByType.revenue.filter(a => accountsWithLOIHistory.has(a.accountName)).length > 0 && logosByType.revenue.filter(a => !accountsWithLOIHistory.has(a.accountName)).length > 0 ? '<br><br>' : ''}${logosByType.revenue.filter(a => !accountsWithLOIHistory.has(a.accountName)).map(a => a.accountName).join(', ') || (logosByType.revenue.filter(a => accountsWithLOIHistory.has(a.accountName)).length === 0 ? '-' : '')}
      </div>
    </div>
    <div style="flex: 1; background: #eff6ff; padding: 10px; border-radius: 6px;">
      <div style="font-size: 0.65rem; font-weight: 600; color: #2563eb; margin-bottom: 4px;">PILOT</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af;">${logosByType.pilot.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">${logosByType.pilot.map(a => a.accountName).join(', ') || '-'}</div>
    </div>
    <div style="flex: 1; background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb;">
      <div style="font-size: 0.65rem; font-weight: 600; color: #6b7280; margin-bottom: 4px;">LOI</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #374151;">${logosByType.loi.length}</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-top: 2px;">${logosByType.loi.map(a => a.accountName).join(', ') || '-'}</div>
    </div>
  </div>
  
  <div class="section-card" style="padding: 12px; margin-bottom: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <div class="stage-title" style="margin: 0;">Account Plans & Pipeline</div>
      <div style="font-size: 0.7rem; color: #6b7280;">${accountsWithPlans} have plans • ${accountMap.size - accountsWithPlans} need plans</div>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 0.6rem; color: #9ca3af;">
      <span><strong style="color: #16a34a;">Revenue</strong> = ARR customer</span>
      <span><strong style="color: #2563eb;">Pilot</strong> = Active project</span>
      <span><strong style="color: #6b7280;">LOI</strong> = Signed commitment</span>
      <span><strong style="color: #065f46;">New</strong> = First deal &lt;90 days</span>
      <span><strong style="color: #374151;">Marquee</strong> = $1m+ ARR potential</span>
      <span><strong style="color: #075985;">Velocity</strong> = ~$150k ARR, fast cycle</span>
    </div>
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
              (acc.hasAccountPlan ? '<div style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-bottom: 8px;"><strong style="color: #1e40af;">✓ Account Plan</strong><div style="color: #1e40af; margin-top: 4px; font-size: 0.75rem; white-space: pre-wrap;">' + (acc.accountPlan || '') + '</div></div>' : '') +
              (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 10px; border-radius: 4px; margin-bottom: 8px; font-size: 0.8125rem; color: #065f46;">' + (lastMeetingDate ? '<div style="margin-bottom: 4px;"><strong>📅 Last Meeting:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div><strong>📅 Next Meeting:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '<div style="background: #fef2f2; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #991b1b;">📭 No meetings scheduled</div>') +
              (legalContacts.length > 0 ? '<div style="background: #f3f4f6; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #374151;"><strong>Legal Contacts:</strong> ' + legalContacts.join(', ') + '</div>' : '') +
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
  
  // Show more accounts button (with collapse)
  if (showMoreBtn) {
    let expanded = false;
    showMoreBtn.addEventListener('click', function() {
      if (!expanded) {
        allAccounts.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse to top 10';
        matchCount.textContent = 'Showing all ' + allAccounts.length + ' accounts';
        expanded = true;
      } else {
        allAccounts.forEach((acc, idx) => acc.style.display = idx < 10 ? 'block' : 'none');
        this.textContent = '+' + (allAccounts.length - 10) + ' more accounts';
        matchCount.textContent = 'Showing top 10 accounts';
        expanded = false;
      }
    });
  }
  
  // Summary tab - Show more buttons
  const showMoreLate = document.getElementById('show-more-late');
  const showMoreMid = document.getElementById('show-more-mid');
  const showMoreEarly = document.getElementById('show-more-early');
  
  // Summary tab expand/collapse handlers
  function setupExpandCollapse(btn, listId, itemClass, defaultCount) {
    if (!btn) return;
    let expanded = false;
    const list = document.getElementById(listId);
    if (!list) return;
    const items = list.querySelectorAll('.' + itemClass);
    const totalCount = items.length;
    
    btn.addEventListener('click', function() {
      if (!expanded) {
        items.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse';
        expanded = true;
      } else {
        items.forEach((acc, idx) => acc.style.display = idx < defaultCount ? 'block' : 'none');
        this.textContent = '+' + (totalCount - defaultCount) + ' more';
        expanded = false;
      }
    });
  }
  
  setupExpandCollapse(showMoreLate, 'late-stage-list', 'summary-expandable', 5);
  setupExpandCollapse(showMoreMid, 'mid-stage-list', 'summary-expandable', 5);
  setupExpandCollapse(showMoreEarly, 'early-stage-list', 'summary-expandable', 5);
  
  // Top Co tab - Eudia accounts expand/collapse
  const showMoreEudiaTopco = document.getElementById('show-more-eudia-topco');
  if (showMoreEudiaTopco) {
    let eudiaExpanded = false;
    const allEudiaTopco = document.querySelectorAll('.eudia-topco-account');
    const eudiaCount = allEudiaTopco.length;
    showMoreEudiaTopco.addEventListener('click', function() {
      if (!eudiaExpanded) {
        allEudiaTopco.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse to top 10';
        eudiaExpanded = true;
      } else {
        allEudiaTopco.forEach((acc, idx) => acc.style.display = idx < 10 ? 'block' : 'none');
        this.textContent = '+' + (eudiaCount - 10) + ' more accounts';
        eudiaExpanded = false;
      }
    });
  }
  
  // Top Co tab - JH accounts expand/collapse
  const showMoreJhTopco = document.getElementById('show-more-jh-topco');
  if (showMoreJhTopco) {
    let jhExpanded = false;
    const allJhTopco = document.querySelectorAll('.jh-topco-account');
    const jhCount = allJhTopco.length;
    showMoreJhTopco.addEventListener('click', function() {
      if (!jhExpanded) {
        allJhTopco.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse to top 10';
        jhExpanded = true;
      } else {
        allJhTopco.forEach((acc, idx) => acc.style.display = idx < 10 ? 'block' : 'none');
        this.textContent = '+' + (jhCount - 10) + ' more accounts';
        jhExpanded = false;
      }
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

