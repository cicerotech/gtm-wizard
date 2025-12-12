const { query } = require('../salesforce/connection');
const { cleanStageName } = require('../utils/formatters');
const { getJohnsonHanaSummary, getAccountSummaries: getJHAccounts, closedWonNovDec, mapStage, lastUpdate: jhLastUpdate, getJHSignedLogosByPeriod, jhSignedLogos, eudiaNovemberARR, eudiaNovemberARRTotal, jhNovemberARR, jhNovemberARRTotal, outHouseNovemberARR, outHouseNovemberARRTotal, totalNovemberARR } = require('../data/johnsonHanaData');

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
.optional { font-size: 0.65rem; color: #9ca3af; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="login-container">
  <h1>GTM Dashboard</h1>
  <p>Enter password to continue</p>
  <form method="POST" action="/account-dashboard">
    <div class="optional">Your name (optional, for analytics)</div>
    <input type="text" name="userName" placeholder="Your name" autocomplete="name">
    <input type="password" name="password" placeholder="Password" required autocomplete="off">
    <button type="submit">Continue</button>
  </form>
</div>
</body>
</html>`;
}

/**
 * Generate Pipeline Overview Tab - Combined Eudia pipeline data
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
  
  // === TREND BULLET CALCULATIONS ===
  
  // Top Product/Service Line calculation
  const sortedProducts = Object.entries(productBreakdown)
    .filter(([name, data]) => name !== 'Undetermined')
    .sort((a, b) => b[1].totalACV - a[1].totalACV);
  const topProduct = sortedProducts[0] || ['N/A', { totalACV: 0, count: 0 }];
  const topProductPct = blendedGross > 0 ? Math.round((topProduct[1].totalACV / blendedGross) * 100) : 0;
  const avgDealSize = blendedDeals > 0 ? Math.round((blendedGross / blendedDeals) / 1000) : 0;
  
  // Count opportunities over $100k (from Eudia accounts)
  const allOpps = Array.from(accountMap.values()).flatMap(acc => acc.opportunities);
  const oppsOver100k = allOpps.filter(o => (o.ACV__c || 0) >= 100000).length;
  
  // Late stage accounts (S3-S5) calculation
  const lateStageNames = ['Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'];
  const lateStageAccounts = Array.from(accountMap.values()).filter(acc => 
    acc.opportunities.some(o => lateStageNames.includes(o.StageName))
  );
  const lateStageACV = lateStageAccounts.reduce((sum, acc) => 
    sum + acc.opportunities.filter(o => lateStageNames.includes(o.StageName)).reduce((s, o) => s + (o.ACV__c || 0), 0), 0
  );
  
  // Accounts with >$750k pipeline
  const highValueAccounts = Array.from(accountMap.values()).filter(acc => {
    const totalACV = acc.opportunities.reduce((sum, o) => sum + (o.ACV__c || 0), 0);
    return totalACV >= 750000;
  });
  
  // Top accounts concentration
  const accountsByValue = Array.from(accountMap.values())
    .map(acc => ({ name: acc.name, totalACV: acc.opportunities.reduce((sum, o) => sum + (o.ACV__c || 0), 0) }))
    .sort((a, b) => b.totalACV - a.totalACV);
  const top8Value = accountsByValue.slice(0, 8).reduce((sum, acc) => sum + acc.totalACV, 0);
  const concentrationPct = blendedGross > 0 ? Math.round((top8Value / blendedGross) * 100) : 0;
  
  // Stage 1 & 2 concentration calculations
  const s1Data = stageBreakdown['Stage 1 - Discovery'] || { count: 0, totalACV: 0 };
  const s1JH = jhSummary.byStage['Stage 1 - Discovery'] || { count: 0, totalACV: 0 };
  const s1Combined = { count: s1Data.count + s1JH.count, totalACV: (s1Data.totalACV || 0) + (s1JH.totalACV || 0) };
  const s1Pct = blendedGross > 0 ? Math.round((s1Combined.totalACV / blendedGross) * 100) : 0;
  
  const s2Data = stageBreakdown['Stage 2 - SQO'] || { count: 0, totalACV: 0 };
  const s2JH = jhSummary.byStage['Stage 2 - SQO'] || { count: 0, totalACV: 0 };
  const s2Combined = { count: s2Data.count + s2JH.count, totalACV: (s2Data.totalACV || 0) + (s2JH.totalACV || 0) };
  const s2Pct = blendedGross > 0 ? Math.round((s2Combined.totalACV / blendedGross) * 100) : 0;
  
  // Stage 3, 4, 5 concentration calculations
  const s3Data = stageBreakdown['Stage 3 - Pilot'] || { count: 0, totalACV: 0 };
  const s3JH = jhSummary.byStage['Stage 3 - Pilot'] || { count: 0, totalACV: 0 };
  const s3Combined = { count: s3Data.count + s3JH.count, totalACV: (s3Data.totalACV || 0) + (s3JH.totalACV || 0) };
  const s3Pct = blendedGross > 0 ? Math.round((s3Combined.totalACV / blendedGross) * 100) : 0;
  
  const s4Data = stageBreakdown['Stage 4 - Proposal'] || { count: 0, totalACV: 0 };
  const s4JH = jhSummary.byStage['Stage 4 - Proposal'] || { count: 0, totalACV: 0 };
  const s4Combined = { count: s4Data.count + s4JH.count, totalACV: (s4Data.totalACV || 0) + (s4JH.totalACV || 0) };
  const s4Pct = blendedGross > 0 ? Math.round((s4Combined.totalACV / blendedGross) * 100) : 0;
  
  const s5Data = stageBreakdown['Stage 5 - Negotiation'] || { count: 0, totalACV: 0 };
  const s5JH = jhSummary.byStage['Stage 5 - Negotiation'] || { count: 0, totalACV: 0 };
  const s5Combined = { count: s5Data.count + s5JH.count, totalACV: (s5Data.totalACV || 0) + (s5JH.totalACV || 0) };
  const s5Pct = blendedGross > 0 ? Math.round((s5Combined.totalACV / blendedGross) * 100) : 0;
  
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
    <strong>Pipeline Overview</strong> — All active opportunities combined.
  </div>
  
  <!-- Combined Metrics -->
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Pipeline</div>
      <div class="metric-value">${fmt(blendedGross)}</div>
      <div style="font-size: 0.6rem; color: #6B7280; margin-top: 6px; line-height: 1.4; padding-left: 2px;">
        <div>• S1: ${s1Pct}% (${fmt(s1Combined.totalACV)})</div>
        <div>• S2: ${s2Pct}% (${fmt(s2Combined.totalACV)})</div>
        <div>• S3: ${s3Pct}% (${fmt(s3Combined.totalACV)})</div>
        <div>• S4: ${s4Pct}% (${fmt(s4Combined.totalACV)})</div>
        <div>• S5: ${s5Pct}% (${fmt(s5Combined.totalACV)})</div>
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">Opportunities</div>
      <div class="metric-value">${blendedDeals}</div>
      <div style="font-size: 0.65rem; color: #6B7280; margin-top: 6px; line-height: 1.5; padding-left: 2px;">
        <div>• ${topProduct[0]}: ${topProductPct}% of pipeline</div>
        <div>• Avg deal size: $${avgDealSize}k</div>
        <div>• ${oppsOver100k} opportunities &gt; $100k</div>
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">Accounts</div>
      <div class="metric-value">${blendedAccounts}</div>
      <div style="font-size: 0.65rem; color: #6B7280; margin-top: 6px; line-height: 1.5; padding-left: 2px;">
        <div>• ${lateStageAccounts.length} late stage (${fmt(lateStageACV)})</div>
        <div>• ${highValueAccounts.length} accounts &gt; $750k pipeline</div>
        <div>• Top 8 = ${concentrationPct}% of pipeline</div>
      </div>
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- PIPELINE BY STAGE (Consolidated - Expandable for S1-S4) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section">
    <div class="stage-title">Pipeline by Stage</div>
    <div class="stage-subtitle">${blendedDeals} opps • ${fmt(blendedGross)} gross</div>
    <div style="margin-top: 8px; font-size: 0.8rem;">
      <div style="display: flex; background: #f9fafb; font-weight: 600; padding: 6px;">
        <div style="flex: 1;">Stage</div>
        <div style="text-align: center; width: 20%;">Opps</div>
        <div style="text-align: right; width: 25%;">ACV</div>
      </div>
      ${['Stage 5 - Negotiation', ...stageOrder].map(stage => {
        const eData = stageBreakdown[stage] || { count: 0, totalACV: 0 };
        const jData = jhSummary.byStage[stage] || { count: 0, totalACV: 0 };
        const combinedCount = eData.count + jData.count;
        const combinedACV = (eData.totalACV || 0) + (jData.totalACV || 0);
        if (combinedCount === 0) return '';
        
        const stageNum = parseInt(stage.match(/Stage (\d)/)?.[1] || 0);
        const isExpandable = combinedCount > 0; // All stages are now expandable
        
        // Get combined opportunities from both sources for expanded view
        const allStageOpps = [
          ...Array.from(accountMap.values()).flatMap(acc => 
            acc.opportunities.filter(o => o.StageName === stage).map(o => ({
              account: acc.name,
              acv: o.ACV__c || 0,
              owner: o.Owner?.Name ? o.Owner.Name.split(' ')[0] : '',
              targetDate: o.Target_LOI_Date__c ? new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null,
              isLegacy: false
            }))
          ),
          ...jhAccounts.flatMap(acc => 
            acc.opportunities.filter(o => o.stage === stage).map(o => ({
              account: acc.name,
              acv: o.acv || 0,
              owner: o.owner ? o.owner.split(' ')[0] : '',
              targetDate: o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null,
              isLegacy: true
            }))
          )
        ].sort((a, b) => b.acv - a.acv).slice(0, 10);
        
        if (isExpandable && combinedCount > 0) {
          return '<details style="border-bottom: 1px solid #f1f3f5;">' +
            '<summary style="display: flex; justify-content: space-between; padding: 6px; cursor: pointer; list-style: none;">' +
              '<div style="flex: 1;">' +
                '<div style="font-size: 0.75rem; font-weight: 500;">' + stage.replace('Stage ', 'S') + ' ▾</div>' +
              '</div>' +
              '<div style="text-align: center; width: 20%;">' + combinedCount + '</div>' +
              '<div style="text-align: right; width: 25%;">' + fmt(combinedACV) + '</div>' +
            '</summary>' +
            '<div style="padding: 8px 12px; background: #f9fafb; font-size: 0.7rem;">' +
              allStageOpps.map(o => {
                const av = o.acv || 0;
                const af = av >= 1000000 ? '$' + (av / 1000000).toFixed(1) + 'm' : '$' + (av / 1000).toFixed(0) + 'k';
                const details = [o.owner, o.targetDate].filter(x => x).join(' • ');
                const legacyDot = '';
                return '<div style="padding: 3px 0; border-bottom: 1px solid #e5e7eb;">' +
                  '<div style="display: flex; justify-content: space-between;">' +
                    '<span style="font-weight: 500;">' + o.account + legacyDot + '</span>' +
                    '<span style="font-weight: 600;">' + af + '</span>' +
                  '</div>' +
                  (details ? '<div style="font-size: 0.6rem; color: #6b7280;">' + details + '</div>' : '') +
                '</div>';
              }).join('') +
              (combinedCount > 10 ? '<div style="color: #6b7280; font-style: italic; margin-top: 4px;">...and ' + (combinedCount - 10) + ' more</div>' : '') +
            '</div>' +
          '</details>';
        } else {
          // No deals in this stage - skip it
          return '';
        }
      }).join('')}
      <div style="display: flex; justify-content: space-between; padding: 6px; background: #e5e7eb; font-weight: 600;">
        <div style="flex: 1;">TOTAL</div>
        <div style="text-align: center; width: 20%;">${blendedDeals}</div>
        <div style="text-align: right; width: 25%;">${fmt(blendedGross)}</div>
      </div>
    </div>
  </div>
  
  <!-- Stage Definitions -->
  <div style="background: #f9fafb; padding: 10px 12px; border-radius: 6px; margin-top: 12px; font-size: 0.65rem; color: #6b7280;">
    <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">Stage Definitions</div>
    <div><strong>S0</strong> Qualifying - Initial outreach</div>
    <div><strong>S1</strong> Discovery - Meeting with client</div>
    <div><strong>S2</strong> SQO - Sales Qualified</div>
    <div><strong>S3</strong> Pilot - Trial underway</div>
    <div><strong>S4</strong> Proposal - Formal proposal</div>
    <div><strong>S5</strong> Negotiation - Contract terms</div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TOP ACCOUNTS (Consolidated) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Eudia Top Accounts</div>
    <div class="stage-subtitle">${blendedAccounts} accounts in pipeline</div>
    <div style="font-size: 0.65rem; color: #374151; margin-bottom: 6px;">
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; vertical-align: middle;"></span>
      Eudia Tech enabled: ${jhEudiaTechAccounts.length} accounts
    </div>
    <div style="margin-top: 8px;" id="consolidated-top-accounts">
      ${(() => {
        // Combine both sources, marking JH accounts with isLegacy
        const combinedAccounts = [
          ...allEudiaAccounts.map(acc => ({ ...acc, isLegacy: false, source: 'eudia' })),
          ...allJHAccounts.map(acc => ({ ...acc, isLegacy: true, source: 'jh' }))
        ].sort((a, b) => b.totalACV - a.totalACV);
        
        return combinedAccounts.map((acc, idx) => {
          const products = acc.source === 'eudia' 
            ? [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))]
            : [...new Set(acc.opportunities.map(o => o.mappedServiceLine).filter(s => s))];
          const accMeetings = acc.source === 'eudia' ? (meetingData?.get(acc.accountId) || {}) : {};
          const lastMeetingDate = accMeetings.lastMeeting ? new Date(accMeetings.lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
          const nextMeetingDate = accMeetings.nextMeeting ? new Date(accMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
          const legalContacts = accMeetings.contacts ? Array.from(accMeetings.contacts) : [];
          const legacyDot = '';
          const eudiaTechDot = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;"></span>' : '';
          
          return '<details class="topco-account" style="border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; overflow: hidden; display: ' + (idx < 10 ? 'block' : 'none') + ';">' +
            '<summary style="padding: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; font-size: 0.8rem;">' +
              '<div>' +
                '<span style="font-weight: 500;">' + acc.name + '</span>' + legacyDot + eudiaTechDot +
                '<div style="font-size: 0.65rem; color: #6b7280;">S' + acc.highestStage + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + (products.length ? ' • ' + products.slice(0,2).join(', ') : '') + '</div>' +
              '</div>' +
              '<div style="text-align: right;">' +
                '<div style="font-weight: 600;">' + fmt(acc.totalACV) + '</div>' +
                '<div style="font-size: 0.65rem; color: #6b7280;">Wtd: ' + fmt(acc.weightedACV) + '</div>' +
              '</div>' +
            '</summary>' +
            '<div style="padding: 10px; font-size: 0.75rem; border-top: 1px solid #e5e7eb;">' +
              (acc.source === 'eudia' && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #ecfdf5; padding: 6px; border-radius: 4px; margin-bottom: 6px; font-size: 0.7rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>Last Meeting:</strong> ' + lastMeetingDate + '</div>' : '') + (nextMeetingDate ? '<div><strong>Next Meeting:</strong> ' + nextMeetingDate + '</div>' : '') + '</div>' : '') +
              (legalContacts.length > 0 ? '<div style="font-size: 0.65rem; color: #6b7280; margin-bottom: 6px;"><strong>Legal:</strong> ' + legalContacts.slice(0,2).join(', ') + '</div>' : '') +
              '<div style="font-weight: 600; margin-bottom: 4px;">Opportunities (' + acc.opportunities.length + '):</div>' +
              acc.opportunities.map(o => {
                if (acc.source === 'eudia') {
                  const stageMatch = o.StageName ? o.StageName.match(/Stage\\s*(\\d)\\s*[-–]?\\s*(.*)/i) : null;
                  const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.StageName || 'TBD');
                  const targetDate = o.Target_LOI_Date__c ? new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
                  const acvVal = o.ACV__c || 0;
                  const acvFmt = acvVal >= 1000000 ? '$' + (acvVal / 1000000).toFixed(1) + 'm' : '$' + (acvVal / 1000).toFixed(0) + 'k';
                  return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + (o.Product_Line__c || 'TBD') + '</span><div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (targetDate ? ' • Target: ' + targetDate : '') + '</div></div><span style="font-weight: 600;">' + acvFmt + '</span></div>';
                } else {
                  const stageMatch = o.stage ? o.stage.match(/Stage\\s*(\\d)\\s*(.*)/i) : null;
                  const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.stage || 'TBD');
                  const targetDate = o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
                  const ownerName = o.owner ? o.owner.split(' ')[0] : '';
                  const jhAcvVal = o.acv || 0;
                  const jhAcvFmt = jhAcvVal >= 1000000 ? '$' + (jhAcvVal / 1000000).toFixed(1) + 'm' : '$' + (jhAcvVal / 1000).toFixed(0) + 'k';
                  return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + (o.mappedServiceLine || 'Other') + '</span>' + (o.eudiaTech ? ' <span style="color: #047857; font-size: 0.6rem;">●</span>' : '') + '<div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (ownerName ? ' • ' + ownerName : '') + (targetDate ? ' • ' + targetDate : '') + '</div></div><span style="font-weight: 600;">' + jhAcvFmt + '</span></div>';
                }
              }).join('') +
            '</div>' +
          '</details>';
        }).join('');
      })()}
      ${blendedAccounts > 10 ? '<div id="show-more-topco" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 6px; font-size: 0.75rem;">+' + (blendedAccounts - 10) + ' more accounts</div>' : ''}
    </div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- CLOSED REVENUE (NOV-DEC) - Consolidated -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Closed Revenue (Nov-Dec)</div>
    <div class="stage-subtitle">${combinedClosedCount} revenue deals • ${fmt(combinedClosedTotal)} total</div>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-bottom: 6px;">Recurring/ARR deals only. LOI & Pilot excluded.</div>
    
    <!-- Combined Closed Revenue - sorted by ACV with details -->
    ${(() => {
      const allClosedDeals = [
        ...eudiaRevenueDeals.map(d => ({ 
          ...d, 
          name: d.accountName, 
          product: d.product || d.oppName, 
          owner: d.owner || '', 
          closeDate: d.closeDate,
          isLegacy: false 
        })),
        ...jhClosedDeals.map(d => ({ 
          ...d, 
          name: d.account, 
          product: d.serviceLine || 'Other', 
          isLegacy: true 
        }))
      ].sort((a, b) => (b.acv || 0) - (a.acv || 0)).slice(0, 15);
      
      if (allClosedDeals.length === 0) {
        return '<div style="margin-top: 8px; font-size: 0.75rem; color: #9ca3af;">No revenue deals closed</div>';
      }
      
      return allClosedDeals.map(deal => {
        const legacyDot = '';
        const techBadge = deal.eudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;"></span>' : '';
        const closeDateStr = deal.closeDate ? new Date(deal.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
        const ownerName = deal.owner ? (deal.owner.split(' ')[0]) : '';
        const details = [deal.product, ownerName, closeDateStr].filter(x => x).join(' • ');
        
        return '<div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #f1f3f5; font-size: 0.75rem;">' +
          '<div style="flex: 1;">' +
            '<span style="font-weight: 500;">' + deal.name + '</span>' + legacyDot + techBadge +
            (details ? '<div style="font-size: 0.6rem; color: #6b7280;">' + details + '</div>' : '') +
          '</div>' +
          '<div style="font-weight: 600; color: #22c55e; text-align: right; min-width: 60px;">' + fmt(deal.acv) + '</div>' +
        '</div>';
      }).join('');
    })()}
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- ACTIVE PIPELINE BY PRODUCT/SERVICE (Consolidated) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
    <div class="stage-title">Active Pipeline by Product/Service</div>
    <div class="stage-subtitle">Click to view top 5 opportunities</div>
    
    ${(() => {
      // Separate product lines (Eudia) and service lines (legacy)
      const productTiles = [];
      const serviceTiles = [];
      
      // Process product lines from Eudia
      Object.entries(productBreakdown)
        .sort((a, b) => b[1].totalACV - a[1].totalACV)
        .slice(0, 8)
        .forEach(([prod, data]) => {
          const opps = Array.from(accountMap.values()).flatMap(acc => 
            acc.opportunities.filter(o => o.Product_Line__c === prod).map(o => {
              const stageMatch = o.StageName ? o.StageName.match(/Stage\\s*(\\d)\\s*[-–]?\\s*(.*)/i) : null;
              const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.StageName || 'TBD');
              const ownerName = o.Owner?.Name ? o.Owner.Name.split(' ')[0] : '';
              const targetDate = o.Target_LOI_Date__c ? new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
              let displayName = acc.name;
              if (acc.name && acc.name.toLowerCase().includes('gov') && acc.name.toLowerCase().includes('dod')) {
                const oppName = o.Name || '';
                const dashIdx = oppName.indexOf(' - ');
                if (dashIdx > 0) displayName = oppName.substring(0, dashIdx);
              }
              return { account: displayName, acv: o.ACV__c || 0, stageLabel, owner: ownerName, targetDate };
            })
          ).sort((a, b) => b.acv - a.acv).slice(0, 5);
          
          productTiles.push({ name: prod, count: data.count, acv: data.totalACV, opps });
        });
      
      // Process service lines from JH
      Object.entries(jhServiceLines)
        .sort((a, b) => b[1].acv - a[1].acv)
        .slice(0, 6)
        .forEach(([sl, data]) => {
          const opps = jhAccounts.flatMap(acc => 
            acc.opportunities.filter(o => o.mappedServiceLine === sl).map(o => {
              const stageMatch = o.stage ? o.stage.match(/Stage\\s*(\\d)\\s*[-–]?\\s*(.*)/i) : null;
              const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.stage || 'TBD');
              const ownerName = o.owner ? o.owner.split(' ')[0] : '';
              const targetDate = o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
              return { account: acc.name, acv: o.acv || 0, stageLabel, owner: ownerName, targetDate };
            })
          ).sort((a, b) => b.acv - a.acv).slice(0, 5);
          
          serviceTiles.push({ name: sl + ' •', count: data.count, acv: data.acv, opps });
        });
      
      // Generate HTML for product tiles (blue, on top)
      const productHTML = productTiles.map(t => 
        '<details style="flex: 0 0 auto;">' +
          '<summary style="background: #eff6ff; padding: 6px 10px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; list-style: none;">' +
            '<div style="font-weight: 600; color: #1e40af;">' + t.name + ' ▾</div>' +
            '<div style="color: #6b7280;">' + t.count + ' opps • ' + fmt(t.acv) + '</div>' +
          '</summary>' +
          '<div style="background: #eff6ff; padding: 6px 10px; border-radius: 0 0 4px 4px; margin-top: -4px; font-size: 0.65rem;">' +
            t.opps.map(o => {
              const af = o.acv >= 1000000 ? '$' + (o.acv / 1000000).toFixed(1) + 'm' : '$' + (o.acv / 1000).toFixed(0) + 'k';
              const details = [o.stageLabel, o.owner, o.targetDate].filter(x => x).join(' • ');
              return '<div style="padding: 3px 0; border-bottom: 1px solid #dbeafe;">' +
                '<div style="display: flex; justify-content: space-between;">' +
                  '<span style="font-weight: 500; color: #374151;">' + o.account + '</span>' +
                  '<span style="font-weight: 600; color: #1e40af;">' + af + '</span>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: #6b7280;">' + details + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</details>'
      ).join('');
      
      // Generate HTML for service tiles (gray, below)
      const serviceHTML = serviceTiles.map(t => 
        '<details style="flex: 0 0 auto;">' +
          '<summary style="background: #f3f4f6; padding: 6px 10px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; list-style: none;">' +
            '<div style="font-weight: 600; color: #374151;">' + t.name + ' ▾</div>' +
            '<div style="color: #6b7280;">' + t.count + ' opps • ' + fmt(t.acv) + '</div>' +
          '</summary>' +
          '<div style="background: #f3f4f6; padding: 6px 10px; border-radius: 0 0 4px 4px; margin-top: -4px; font-size: 0.65rem;">' +
            t.opps.map(o => {
              const af = o.acv >= 1000000 ? '$' + (o.acv / 1000000).toFixed(1) + 'm' : '$' + (o.acv / 1000).toFixed(0) + 'k';
              const details = [o.stageLabel, o.owner, o.targetDate].filter(x => x).join(' • ');
              return '<div style="padding: 3px 0; border-bottom: 1px solid #e5e7eb;">' +
                '<div style="display: flex; justify-content: space-between;">' +
                  '<span style="font-weight: 500; color: #374151;">' + o.account + '</span>' +
                  '<span style="font-weight: 600; color: #374151;">' + af + '</span>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: #6b7280;">' + details + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</details>'
      ).join('');
      
      return '<div style="margin-top: 8px;">' +
        '<div style="display: flex; flex-wrap: wrap; gap: 6px;">' + productHTML + '</div>' +
        (serviceTiles.length > 0 ? '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e5e7eb;">' + serviceHTML + '</div>' : '') +
      '</div>';
    })()}
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
    closedLostDeals = [], nurturedAccounts = [], daysInStageByStage = {},
    logosByType = { revenue: [], pilot: [], loi: [] },
    newOppsThisWeek = [], newOppsTotal = 0,
    signedThisWeek = [],
    signedByFiscalQuarter = {}
  } = params;
  
  // Helper for currency formatting
  const fmt = (val) => {
    if (!val || val === 0) return '-';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'm';
    return '$' + Math.round(val / 1000) + 'k';
  };
  
  // Get opportunities with Q4 target sign date (Nov 1, 2025 - Jan 31, 2026)
  // EXCLUDE Stage 0 - only count active pipeline stages (Stage 1-5)
  const q4Opps = [];
  const activeStages = ['Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'];
  
  accountMap.forEach(acc => {
    acc.opportunities?.forEach(opp => {
      const targetDate = opp.Target_LOI_Date__c;
      const stage = opp.StageName || '';
      
      // Skip Stage 0 opportunities - only include active stages
      if (!activeStages.includes(stage)) {
        return;
      }
      
      if (targetDate) {
        const d = new Date(targetDate);
        const month = d.getMonth();
        const year = d.getFullYear();
        // Q4 = Nov (10), Dec (11) 2025 or Jan (0) 2026 (Fiscal Q4: Nov 1 - Jan 31)
        const isQ4 = (month >= 10 && year === 2025) || (month === 0 && year === 2026);
        if (isQ4) {
          q4Opps.push({
            account: acc.name,
            name: opp.Name,
            acv: opp.ACV__c || 0,
            weighted: opp.Weighted_ACV__c || 0,
            stage: stage,
            owner: acc.owner,
            targetDate: targetDate,
            month: month
          });
        }
      }
    });
  });
  q4Opps.sort((a, b) => b.weighted - a.weighted); // Sort by weighted, not gross ACV
  const q4TotalACV = q4Opps.reduce((sum, o) => sum + o.acv, 0);
  const q4TotalWeighted = q4Opps.reduce((sum, o) => sum + o.weighted, 0);
  
  console.log(`[Dashboard] Q4 Pipeline: ${q4Opps.length} opps (Stage 1-5 only), Weighted Total: $${(q4TotalWeighted/1000000).toFixed(2)}M`);
  // Debug: Log top 5 weighted opportunities
  q4Opps.slice(0, 5).forEach(o => console.log(`  - ${o.account}: $${(o.weighted/1000).toFixed(0)}k weighted (Stage: ${o.stage})`));
  
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
  
  // Get Johnson Hana stage breakdown - with flexible key matching
  const jhByStage = jhSummary?.byStage || {};
  
  // Helper to get JH stage value by checking multiple possible key formats
  const getJHStageValue = (stageName, prop) => {
    const possibleKeys = [
      stageName,
      stageName.replace(' - ', ' '),
      stageName.replace(' - ', '. ')
    ];
    for (const key of possibleKeys) {
      if (jhByStage[key]?.[prop]) return jhByStage[key][prop];
    }
    return 0;
  };
  
  // Combine Eudia + JH for current week (COMBINED VIEW)
  const stageWoW = [
    { 
      stage: 'Stage 0 - Qualifying', 
      acv: (stageBreakdown['Stage 0 - Qualifying']?.totalACV || 0) + getJHStageValue('Stage 0 - Qualifying', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 0 - Qualifying']?.count || 0) + getJHStageValue('Stage 0 - Qualifying', 'count'),
      lastAcv: lastWeekBaseline['Stage 0 - Qualifying'].acv,
      lastOppCount: lastWeekBaseline['Stage 0 - Qualifying'].oppCount
    },
    { 
      stage: 'Stage 1 - Discovery', 
      acv: (stageBreakdown['Stage 1 - Discovery']?.totalACV || 0) + getJHStageValue('Stage 1 - Discovery', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 1 - Discovery']?.count || 0) + getJHStageValue('Stage 1 - Discovery', 'count'),
      lastAcv: lastWeekBaseline['Stage 1 - Discovery'].acv,
      lastOppCount: lastWeekBaseline['Stage 1 - Discovery'].oppCount
    },
    { 
      stage: 'Stage 2 - SQO', 
      acv: (stageBreakdown['Stage 2 - SQO']?.totalACV || 0) + getJHStageValue('Stage 2 - SQO', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 2 - SQO']?.count || 0) + getJHStageValue('Stage 2 - SQO', 'count'),
      lastAcv: lastWeekBaseline['Stage 2 - SQO'].acv,
      lastOppCount: lastWeekBaseline['Stage 2 - SQO'].oppCount
    },
    { 
      stage: 'Stage 3 - Pilot', 
      acv: (stageBreakdown['Stage 3 - Pilot']?.totalACV || 0) + getJHStageValue('Stage 3 - Pilot', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 3 - Pilot']?.count || 0) + getJHStageValue('Stage 3 - Pilot', 'count'),
      lastAcv: lastWeekBaseline['Stage 3 - Pilot'].acv,
      lastOppCount: lastWeekBaseline['Stage 3 - Pilot'].oppCount
    },
    { 
      stage: 'Stage 4 - Proposal', 
      acv: (stageBreakdown['Stage 4 - Proposal']?.totalACV || 0) + getJHStageValue('Stage 4 - Proposal', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 4 - Proposal']?.count || 0) + getJHStageValue('Stage 4 - Proposal', 'count'),
      lastAcv: lastWeekBaseline['Stage 4 - Proposal'].acv,
      lastOppCount: lastWeekBaseline['Stage 4 - Proposal'].oppCount
    },
    { 
      stage: 'Stage 5 - Negotiation', 
      acv: (stageBreakdown['Stage 5 - Negotiation']?.totalACV || 0) + getJHStageValue('Stage 5 - Negotiation', 'totalACV'), 
      oppCount: (stageBreakdown['Stage 5 - Negotiation']?.count || 0) + getJHStageValue('Stage 5 - Negotiation', 'count'),
      lastAcv: lastWeekBaseline['Stage 5 - Negotiation'].acv,
      lastOppCount: lastWeekBaseline['Stage 5 - Negotiation'].oppCount
    }
  ];
  
  // Calculate % change helper
  const calcPctChange = (current, last) => {
    if (last === 0) return current > 0 ? '+∞' : '-';
    const pct = ((current - last) / last) * 100;
    if (pct === 0) return '0%';
    return (pct > 0 ? '+' : '') + Math.round(pct) + '%';
  };
  
  const stageTotalACV = stageWoW.reduce((sum, s) => sum + s.acv, 0);
  const stageTotalCount = stageWoW.reduce((sum, s) => sum + s.oppCount, 0);
  
  // Current logos count from Account.Customer_Type__c (all tagged accounts)
  // Use Set to deduplicate in case an account has multiple types
  const allLogos = [
    ...logosByType.revenue.map(a => a.accountName),
    ...logosByType.pilot.map(a => a.accountName),
    ...logosByType.loi.map(a => a.accountName)
  ];
  const uniqueLogos = [...new Set(allLogos)];
  // Total should be sum of categories (not deduplicated) to match math
  const currentLogosCount = logosByType.revenue.length + logosByType.pilot.length + logosByType.loi.length;
  
  // Run-rate forecast (using contract data)
  const fy2025Total = recurringTotal + projectTotal;
  const jhTotal = jhSummary?.totalPipeline || 0;
  const combinedTotal = fy2025Total + jhTotal;
  
  return `
<div id="weekly" class="tab-content">
  <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.75rem; color: #374151; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
    <div>
      <strong>RevOps Weekly Summary</strong> — Formatted like Friday email updates.
      <div style="font-size: 0.65rem; color: #6b7280; margin-top: 2px;">Data pulled live from Salesforce</div>
    </div>
    <button onclick="copyWeeklyForEmail()" style="background: #1f2937; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">📧 Copy for Email</button>
  </div>
  <div id="email-copy-status" style="display: none; background: #d1fae5; color: #065f46; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; font-size: 0.75rem;">✓ Copied to clipboard! Paste into your email.</div>

  <!-- SECTION 1: REVENUE FORECAST SNAPSHOT -->
  <div class="weekly-section">
    <div class="weekly-section-title">1. Revenue Forecast Snapshot</div>
    
    <!-- Signed Since Last Week - Live from Salesforce -->
    <div class="weekly-subsection">
      <div style="font-weight: 600; font-size: 0.75rem; color: #374151; margin-bottom: 4px;">Signed Revenue since last week</div>
      ${signedThisWeek.length > 0 ? signedThisWeek.map(deal => {
        const termYears = deal.termMonths ? Math.round(deal.termMonths / 12) : 1;
        const termLabel = termYears === 1 ? '1-year' : `${termYears}-year`;
        const acvFmt = deal.acv >= 1000000 ? '$' + (deal.acv / 1000000).toFixed(1) + 'm' : '$' + Math.round(deal.acv / 1000) + 'k';
        const tcvFmt = deal.tcv >= 1000000 ? '$' + (deal.tcv / 1000000).toFixed(1) + 'm' : '$' + Math.round(deal.tcv / 1000) + 'k';
        const productLabel = deal.productLine ? ` (${deal.productLine})` : '';
        return `<div style="font-size: 0.75rem; color: #374151; margin-left: 12px; margin-bottom: 4px;">
          <strong>${deal.accountName}</strong>${productLabel} — ${acvFmt} ACV${deal.tcv > deal.acv ? `, ${tcvFmt} TCV` : ''}, ${termLabel} term
        </div>`;
      }).join('') : '<div style="font-size: 0.75rem; color: #9ca3af; margin-left: 12px; margin-bottom: 8px;">No deals signed in the last 7 days</div>'}
    </div>
    
    <!-- Opportunities with Q4 Target Sign Date - Consolidated -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Opportunities with Q4 Target Sign Date</div>
      
      <!-- Q4 Stats Tiles - Live from Salesforce -->
      ${(() => {
        // Q4 stats from live Salesforce data
        const totalQ4Count = q4Opps.length;
        const avgDealSize = totalQ4Count > 0 ? Math.round(q4TotalWeighted / totalQ4Count) : 0;
        
        return `
      <div style="display: flex; gap: 8px; margin-top: 8px; margin-bottom: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 100px; background: #ecfdf5; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #047857; margin-bottom: 2px;">Q4 WEIGHTED PIPELINE</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #065f46;">${fmt(q4TotalWeighted)}</div>
        </div>
        <div style="flex: 1; min-width: 100px; background: #eff6ff; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #1e40af; margin-bottom: 2px;"># OF OPPS</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #1e40af;">${totalQ4Count}</div>
        </div>
        <div style="flex: 1; min-width: 100px; background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #9CA3AF; margin-bottom: 2px;">AVG DEAL SIZE</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #9CA3AF;">${fmt(avgDealSize)}</div>
        </div>
      </div>`;
      })()}
      
      ${(() => {
        // Q4 opportunities from live Salesforce data (Q4 = Nov, Dec, Jan)
        const allQ4Sorted = q4Opps.map(o => ({ 
          account: o.account, 
          acv: o.acv,
          weighted: o.weighted,
          isNov: o.month === 10,
          isDec: o.month === 11,
          isJan: o.month === 0
        })).sort((a, b) => b.acv - a.acv);
        
        const top10 = allQ4Sorted.slice(0, 10);
        const remaining = allQ4Sorted.slice(10);
        
        return '<div style="background: #f9fafb; border-radius: 8px; padding: 12px;">' +
          '<div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 0.75rem;">TOP OPPORTUNITIES (' + q4Opps.length + ' total)</div>' +
          '<div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 8px;">Opportunities with Target Sign Date in Q4 FY2025 (Nov 1 - Jan 31)</div>' +
          '<ol class="weekly-list" style="font-size: 0.7rem; margin: 0; padding-left: 16px; line-height: 1.4;">' +
            (top10.map(o => {
              const marker = o.isNov ? '¹' : (o.isDec ? '²' : (o.isJan ? '³' : ''));
              return '<li style="margin-bottom: 2px;">' + o.account + ', ' + fmt(o.acv) + marker + '</li>';
            }).join('') || '<li style="color: #9ca3af;">None</li>') +
          '</ol>' +
          (remaining.length > 0 ? '<details style="margin-top: 6px;"><summary style="cursor: pointer; font-size: 0.65rem; color: #1e40af; font-weight: 600;">+' + remaining.length + ' more opportunities</summary>' +
            '<ol start="11" style="font-size: 0.65rem; margin: 4px 0 0 0; padding-left: 20px; line-height: 1.4; color: #6b7280;">' +
              remaining.map(o => '<li style="margin-bottom: 2px;">' + o.account + ', ' + fmt(o.acv) + (o.isNov ? '¹' : (o.isDec ? '²' : (o.isJan ? '³' : ''))) + '</li>').join('') +
            '</ol></details>' : '') +
          '<div style="font-size: 0.55rem; color: #6b7280; margin-top: 6px;">¹ = Nov, ² = Dec, ³ = Jan target</div>' +
        '</div>';
      })()}
    </div>
    
    <!-- Signed Logos by Type + Pipeline Summary -->
    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; align-items: stretch;">
      <!-- Signed Logos by Fiscal Quarter - Live from Salesforce -->
      <div style="flex: 1 1 calc(50% - 6px); min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px; display: flex; flex-direction: column;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.75rem;">SIGNED LOGOS BY QUARTER</div>
        <div style="font-size: 0.75rem;">
          ${(() => {
            // Calculate total across all quarters - using Account.First_Deal_Close_Date__c
            const quarterOrder = ['FY2024 & Prior', 'Q4 2024', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025 (QTD)'];
            const totalSigned = quarterOrder.reduce((sum, q) => sum + (signedByFiscalQuarter[q]?.size || 0), 0);
            
            return quarterOrder
              .filter(q => signedByFiscalQuarter[q]?.size > 0)
              .map((quarter, idx, arr) => {
                const accounts = signedByFiscalQuarter[quarter] ? [...signedByFiscalQuarter[quarter]].sort() : [];
                const isCurrentQuarter = quarter === 'Q4 2025 (QTD)';
                const bgColor = isCurrentQuarter ? 'background: #ecfdf5;' : '';
                const textColor = isCurrentQuarter ? 'color: #065f46;' : 'color: #374151;';
                const borderStyle = idx < arr.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : '';
                
                return '<details style="' + borderStyle + bgColor + '">' +
                  '<summary style="display: flex; justify-content: space-between; padding: 8px 4px; cursor: pointer;">' +
                    '<span style="' + textColor + '">' + quarter + '</span>' +
                    '<span style="font-weight: 600; ' + textColor + '">' + accounts.length + '</span>' +
                  '</summary>' +
                  '<div style="padding: 6px 8px; font-size: 0.65rem; color: #6b7280; ' + (isCurrentQuarter ? 'background: #e9f5ec;' : 'background: #f3f4f6;') + '">' +
                    (accounts.join(', ') || 'None') +
                  '</div>' +
                '</details>';
              }).join('') +
              '<div style="display: flex; justify-content: space-between; padding: 8px 4px; font-weight: 700; background: #e5e7eb; margin-top: 4px; border-radius: 4px;">' +
                '<span>Total Signed (All Time)</span>' +
                '<span>' + totalSigned + '</span>' +
              '</div>';
          })()}
        </div>
        <div style="font-size: 0.55rem; color: #9ca3af; margin-top: 6px;">Unique accounts by first Closed Won date • May differ from Current Logos if contracts expired</div>
      </div>
      
      <!-- Run-Rate Forecast Table -->
      <div style="flex: 1 1 calc(50% - 6px); min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px; display: flex; flex-direction: column;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 8px; font-size: 0.75rem;">RUN-RATE FORECAST ($)</div>
        <table class="weekly-table" style="width: 100%; flex: 1;">
          <thead>
            <tr><th style="width: 65%;">Month</th><th style="text-align: right; width: 35%;">Combined</th></tr>
          </thead>
          <tbody>
            <tr><td>August</td><td style="text-align: right;">$17.6m</td></tr>
            <tr><td>September</td><td style="text-align: right;">$18.4m</td></tr>
            <tr><td>October</td><td style="text-align: right;">$19.8m</td></tr>
            <tr><td>November (EOM)</td><td style="text-align: right;">$19.26m</td></tr>
            <tr style="background: #ecfdf5;">
              <td style="color: #065f46;">Q4 Weighted Pipeline</td>
              <td style="text-align: right; color: #065f46; font-weight: 600;">${fmt(q4TotalWeighted)}</td>
            </tr>
            <tr style="font-weight: 600; background: #e5e7eb;">
              <td>FY2025E Total</td>
              <td style="text-align: right; color: #111827;">~$22m</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Current Logos (Live from Salesforce) -->
    <div class="weekly-subsection" style="margin-top: 16px;">
      <div class="weekly-subsection-title">Current Logos (${currentLogosCount})</div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin-top: 8px;">
        <details>
          <summary style="cursor: pointer; font-weight: 600; font-size: 0.75rem; color: #111827;">
            ▸ All Logos (${uniqueLogos.length} unique) - click to expand
          </summary>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px; font-size: 0.65rem; color: #374151; margin-top: 8px;">
            ${uniqueLogos.sort().map(logo => '<div style="padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + logo + '</div>').join('')}
          </div>
        </details>
      </div>
    </div>
  </div>

  <!-- SECTION 2: GROSS PIPELINE BREAKDOWN -->
  <div class="weekly-section">
    <div class="weekly-section-title">2. Gross Pipeline Breakdown</div>
    
    <ul class="weekly-list">
      <li><strong>Total Gross Pipeline:</strong> ${fmt((totalGross || 0) + (jhSummary?.totalPipeline || 0))} • ${(totalDeals || 0) + (jhSummary?.totalOpportunities || 0)} opportunities</li>
    </ul>
    
    <!-- Week-over-week Change by Stage -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Week-over-week Change by Stage</div>
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
    
    <!-- New Opportunities Added This Week - Consolidated -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">New opportunities added this week: ${newOppsThisWeek.length} opportunities, +${fmt(newOppsTotal)} ACV</div>
      <div style="font-size: 0.65rem; color: #9ca3af; font-style: italic; margin-top: 4px; margin-bottom: 8px;">
        Note: Johnson Hana data was merged to Eudia Salesforce this week. New opportunity counts may reflect this migration.
      </div>
      <div style="font-size: 0.75rem; color: #374151;">
        <strong>Companies:</strong> ${newOppsThisWeek.map(o => o.accountName).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'None'}
      </div>
    </div>
  </div>

  <!-- SECTION 3: DEALS IMPACTING THE FORECAST (T10) - Consolidated -->
  <div class="weekly-section">
    <div class="weekly-section-title">3. Top Deals Impacting the Forecast</div>
    
    <!-- Forecast Stats Tiles -->
    ${(() => {
      // Calculate forecast stats
      const jhPipeline = jhSummary?.pipeline || [];
      const allTopDeals = [
        ...top10.map(o => ({ ...o, isLegacy: false })),
        ...jhPipeline.slice(0, 10).map(o => ({ ...o, isLegacy: true }))
      ].sort((a, b) => (b.acv || 0) - (a.acv || 0)).slice(0, 15);
      
      const combinedTotal = top10Total + jhPipeline.slice(0, 10).reduce((sum, o) => sum + (o.acv || 0), 0);
      const combinedWeighted = top10.reduce((sum, o) => sum + (o.weighted || 0), 0) + jhPipeline.slice(0, 10).reduce((sum, o) => sum + (o.weighted || 0), 0);
      
      // Late stage deals (S4 + S5)
      const lateStageCount = allTopDeals.filter(o => {
        const stage = o.stage || o.StageName || '';
        return stage.includes('4') || stage.includes('5');
      }).length;
      
      // Next 30 days (deals closing soon)
      const today = new Date();
      const next30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const closingSoon = allTopDeals.filter(o => {
        const closeDate = o.closeDate || o.Target_LOI_Date__c;
        if (!closeDate) return false;
        const d = new Date(closeDate);
        return d <= next30 && d >= today;
      });
      const closingSoonTotal = closingSoon.reduce((sum, o) => sum + (o.acv || 0), 0);
      
      return `
    <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 100px; background: #ecfdf5; padding: 10px; border-radius: 6px; text-align: center;">
        <div style="font-size: 0.6rem; font-weight: 600; color: #047857; margin-bottom: 2px;">TOP DEALS TOTAL</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #065f46;">${fmt(combinedTotal)}</div>
      </div>
      <div style="flex: 1; min-width: 100px; background: #fef3c7; padding: 10px; border-radius: 6px; text-align: center;">
        <div style="font-size: 0.6rem; font-weight: 600; color: #92400e; margin-bottom: 2px;">LATE STAGE (S4/S5)</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #92400e;">${lateStageCount} deals</div>
      </div>
      <div style="flex: 1; min-width: 100px; background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center;">
        <div style="font-size: 0.6rem; font-weight: 600; color: #9CA3AF; margin-bottom: 2px;">CLOSING NEXT 30 DAYS</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #9CA3AF;">${fmt(closingSoonTotal)}</div>
      </div>
    </div>`;
    })()}
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 12px;">
      <ol class="weekly-list" style="font-size: 0.75rem; margin: 0; padding-left: 16px;">
        ${(() => {
          // Combine and sort all opportunities by ACV
          const jhPipeline = jhSummary?.pipeline || [];
          const allDeals = [
            ...top10.map(o => ({ account: o.account, acv: o.acv, isLegacy: false })),
            ...jhPipeline.slice(0, 10).map(o => ({ account: o.account, acv: o.acv || 0, isLegacy: true }))
          ].sort((a, b) => b.acv - a.acv).slice(0, 15);
          
          return allDeals.map(o => {
            const legacyDot = '';
            return '<li>' + o.account + legacyDot + ' | ' + fmt(o.acv) + '</li>';
          }).join('');
        })()}
      </ol>
    </div>
  </div>

  <!-- SECTION 4: CLOSED LOST, DQ, OR NURTURE -->
  <div class="weekly-section">
    <div class="weekly-section-title">4. Closed Lost, Disqualified, or Nurture this week (${closedLostDeals.length})</div>
    <table class="weekly-table">
      <thead>
        <tr><th>Account</th><th>ACV</th><th>Owner</th><th>Reason</th></tr>
      </thead>
      <tbody>
        ${closedLostDeals.length > 0 ? closedLostDeals.map(deal => `
        <tr>
          <td style="font-weight: 500; font-size: 0.75rem;">${deal.accountName}</td>
          <td style="font-size: 0.7rem; color: #374151;">${deal.acv ? '$' + (deal.acv / 1000).toFixed(0) + 'k' : '-'}</td>
          <td style="font-size: 0.7rem; color: #374151;">${deal.owner ? deal.owner.split(' ')[0] : '-'}</td>
          <td style="font-size: 0.7rem; color: #6b7280; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${deal.closedLostDetail || '-'}</td>
        </tr>`).join('') : `
        <tr>
          <td colspan="4" style="color: #9ca3af; text-align: center; font-style: italic;">No closed lost deals this week</td>
        </tr>`}
      </tbody>
    </table>
    <div style="font-size: 0.55rem; color: #9ca3af; margin-top: 4px;">Deals moved to Stage 7 in last 7 days (live from Salesforce)</div>
    
    ${nurturedAccounts.length > 0 ? `
    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #e5e7eb;">
      <div style="font-size: 0.7rem; font-weight: 600; color: #7c3aed; margin-bottom: 6px;">Accounts Moved to Nurture (${nurturedAccounts.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${nurturedAccounts.map(acc => `
          <span style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem;">
            ${acc.accountName}
          </span>
        `).join('')}
      </div>
    </div>` : ''}
  </div>

  <!-- SECTION 5: LONGEST DEALS BY STAGE (T10) - Live from Salesforce -->
  <div class="weekly-section">
    <div class="weekly-section-title">5. Longest Deals by Stage (T10)</div>
    <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 12px;">Top 10 deals per stage, sorted by days in stage (descending) • Live from Salesforce</div>
    
    ${Object.entries(daysInStageByStage).map(([stage, deals]) => {
      const stageName = stage.replace('Stage ', 'S').replace(' - ', ': ');
      const dealsList = deals.length > 0 
        ? deals.map(d => d.accountName + ' (' + (d.daysInStage + 7) + ')').join(', ')
        : 'No deals in this stage';
      return `
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">${stage}</div>
      <div style="font-size: 0.75rem; color: #374151; line-height: 1.6;">
        ${dealsList}
      </div>
    </div>`;
    }).join('')}
    
    <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 8px; font-style: italic;">Days shown include +7 adjustment • Updated live from Salesforce</div>
  </div>
</div>`;
}

/**
 * Generate Account Status Dashboard - Mobile-optimized with tabs
 */
async function generateAccountDashboard() {
  // ═══════════════════════════════════════════════════════════════════════
  // JOHNSON HANA DATA - Load early for use throughout dashboard
  // ═══════════════════════════════════════════════════════════════════════
  const jhSummary = getJohnsonHanaSummary();
  const jhAccounts = getJHAccounts();
  
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
  
  // Signed deals grouped by fiscal quarter (for QoQ view)
  // Fiscal Year naming: FY ends Jan 31 of that year (e.g., FY2025 = Feb 2024 - Jan 2025)
  // Current quarter (Dec 2025) = Q4 FY2026 in accounting, but user prefers "Q4 2025" labeling
  // Using calendar-intuitive labels: Q4 2024 = Nov 2024 - Jan 2025, Q4 2025 = Nov 2025 - Jan 2026
  let signedByFiscalQuarter = {
    'FY2024 & Prior': new Set(),  // All deals before Nov 2024
    'Q4 2024': new Set(),          // Nov 2024 - Jan 2025
    'Q1 2025': new Set(),          // Feb - Apr 2025
    'Q2 2025': new Set(),          // May - Jul 2025
    'Q3 2025': new Set(),          // Aug - Oct 2025
    'Q4 2025 (QTD)': new Set()     // Nov 2025 - Jan 2026 (current quarter to date)
  };
  
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
    
    // Group signed deals by fiscal quarter for quarter-over-quarter view
    // Using calendar-intuitive labels: Q4 = Nov-Jan, Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct
    const allSignedDeals = [...signedByType.revenue, ...signedByType.pilot, ...signedByType.loi];
    
    // Track first close per account to avoid double-counting
    const accountFirstClose = new Map();
    allSignedDeals.forEach(deal => {
      if (!deal.closeDate) return;
      const existingDate = accountFirstClose.get(deal.accountName);
      const dealDate = new Date(deal.closeDate);
      if (!existingDate || dealDate < existingDate) {
        accountFirstClose.set(deal.accountName, dealDate);
      }
    });
    
    // Assign each account to quarter based on their FIRST close date
    accountFirstClose.forEach((closeDate, accountName) => {
      const month = closeDate.getMonth(); // 0-11
      const year = closeDate.getFullYear();
      
      // Determine quarter based on calendar year intuitive labeling
      let quarterKey;
      if (month >= 10) { // Nov, Dec
        quarterKey = 'Q4 ' + year;
      } else if (month === 0) { // Jan
        quarterKey = 'Q4 ' + (year - 1); // Jan 2025 is part of Q4 2024
      } else if (month >= 1 && month <= 3) { // Feb, Mar, Apr
        quarterKey = 'Q1 ' + year;
      } else if (month >= 4 && month <= 6) { // May, Jun, Jul
        quarterKey = 'Q2 ' + year;
      } else { // Aug, Sep, Oct
        quarterKey = 'Q3 ' + year;
      }
      
      // Current quarter gets (QTD) suffix
      if (quarterKey === 'Q4 2025') {
        quarterKey = 'Q4 2025 (QTD)';
      }
      
      // Map to our defined quarters
      if (signedByFiscalQuarter[quarterKey]) {
        signedByFiscalQuarter[quarterKey].add(accountName);
      } else if (year < 2024 || (year === 2024 && month < 10)) {
        signedByFiscalQuarter['FY2024 & Prior'].add(accountName);
      }
    });
    
    console.log(`[Dashboard] Signed by fiscal quarter: Q4 2025 QTD=${signedByFiscalQuarter['Q4 2025 (QTD)']?.size || 0}, Q3 2025=${signedByFiscalQuarter['Q3 2025']?.size || 0}`);
    
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
  // Query accounts with Customer_Type__c for logo counts
  // Note: First close date will be derived from opportunity data if account field not available
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
        
        // Categorize by Customer_Type__c
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
  // CLOSED LOST DEALS - Deals that moved to Stage 7 this week (DYNAMIC)
  // Query: Stage 7 opportunities with LastModifiedDate in last 7 days
  // ═══════════════════════════════════════════════════════════════════════
  const closedLostQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, Closed_Lost_Detail__c, 
           LastModifiedDate, Owner.Name
    FROM Opportunity
    WHERE StageName = 'Stage 7. Closed(Lost)'
      AND LastModifiedDate >= LAST_N_DAYS:7
    ORDER BY LastModifiedDate DESC
    LIMIT 20
  `;
  
  let closedLostDeals = [];
  
  try {
    const closedLostData = await query(closedLostQuery, true);
    console.log(`[Dashboard] Closed Lost This Week query returned ${closedLostData?.records?.length || 0} records`);
    if (closedLostData?.records) {
      closedLostData.records.forEach(opp => {
        closedLostDeals.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          closedLostDetail: opp.Closed_Lost_Detail__c || '-',
          acv: opp.ACV__c || 0,
          owner: opp.Owner?.Name || '',
          closedDate: opp.LastModifiedDate
        });
      });
    }
  } catch (e) { 
    console.error('Closed Lost query error:', e.message);
    // Fallback to empty - no hardcoded data
    closedLostDeals = [];
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CLOSED WON THIS WEEK - Deals signed in last 7 days (for Weekly tab)
  // ═══════════════════════════════════════════════════════════════════════
  const closedWonThisWeekQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, Product_Line__c, 
           Contract_Term_Months__c, TCV__c, Revenue_Type__c, Owner.Name
    FROM Opportunity
    WHERE StageName = 'Stage 6. Closed(Won)'
      AND CloseDate >= LAST_N_DAYS:7
    ORDER BY CloseDate DESC
  `;
  
  let signedThisWeek = [];
  
  try {
    const closedWonData = await query(closedWonThisWeekQuery, true);
    console.log(`[Dashboard] Closed Won This Week query returned ${closedWonData?.records?.length || 0} records`);
    if (closedWonData?.records) {
      closedWonData.records.forEach(opp => {
        signedThisWeek.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          acv: opp.ACV__c || 0,
          tcv: opp.TCV__c || 0,
          termMonths: opp.Contract_Term_Months__c || 12,
          productLine: opp.Product_Line__c || '',
          revenueType: opp.Revenue_Type__c || '',
          owner: opp.Owner?.Name || '',
          closeDate: opp.CloseDate
        });
      });
    }
  } catch (e) { 
    console.error('Closed Won This Week query error:', e.message);
    signedThisWeek = [];
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // ACCOUNTS MOVED TO NURTURE - Accounts with Nurture__c set this week
  // ═══════════════════════════════════════════════════════════════════════
  const nurturedAccountsQuery = `
    SELECT Name, Owner.Name, LastModifiedDate
    FROM Account
    WHERE Nurture__c = true
      AND LastModifiedDate >= LAST_N_DAYS:7
    ORDER BY LastModifiedDate DESC
    LIMIT 10
  `;
  
  let nurturedAccounts = [];
  
  try {
    const nurturedData = await query(nurturedAccountsQuery, true);
    console.log(`[Dashboard] Nurtured Accounts This Week query returned ${nurturedData?.records?.length || 0} records`);
    if (nurturedData?.records) {
      nurturedData.records.forEach(acc => {
        nurturedAccounts.push({
          accountName: acc.Name || 'Unknown',
          owner: acc.Owner?.Name || ''
        });
      });
    }
  } catch (e) { 
    console.error('Nurtured Accounts query error:', e.message);
    nurturedAccounts = [];
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // OPPORTUNITIES CREATED THIS WEEK - CreatedDate in last 7 days
  // ═══════════════════════════════════════════════════════════════════════
  const newOppsQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, CreatedDate, Owner.Name, Product_Line__c, Johnson_Hana_Owner__c
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
        // Use JH custom owner field if present (for migrated JH opportunities)
        const effectiveOwner = opp.Johnson_Hana_Owner__c || opp.Owner?.Name || '';
        newOppsThisWeek.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          stage: opp.StageName || '',
          acv,
          createdDate: opp.CreatedDate,
          owner: effectiveOwner,
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
                                SUM(Weighted_ACV__c) WeightedAmount,
                                COUNT(Id) DealCount
                         FROM Opportunity
                         WHERE IsClosed = false 
                           AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
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
  // ADDED: Johnson_Hana_Owner__c for JH opportunities (use this instead of Owner.Name when present)
  const accountQuery = `SELECT Account.Id, Account.Name, Owner.Name, Account.Is_New_Logo__c,
                               Account.Account_Plan_s__c, Account.Customer_Type__c,
                               Name, StageName, ACV__c, Weighted_ACV__c, Product_Line__c,
                               Target_LOI_Date__c, Johnson_Hana_Owner__c
                        FROM Opportunity
                        WHERE IsClosed = false
                          AND StageName IN ('Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
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
    
    // For Johnson Hana opportunities, use the custom JH owner field instead of "Keigan Pesenti"
    // This field contains the original JH owner name (e.g., "Nathan Shine", "Alex Fox")
    const effectiveOwner = opp.Johnson_Hana_Owner__c || opp.Owner?.Name;
    
    if (!accountMap.has(accountName)) {
      accountMap.set(accountName, {
        name: accountName,
        accountId: opp.Account?.Id, // Store Account ID for meeting lookup
        owner: effectiveOwner,
        isNewLogo: opp.Account?.Is_New_Logo__c,
        hasAccountPlan: !!opp.Account?.Account_Plan_s__c,
        accountPlan: opp.Account?.Account_Plan_s__c,
        customerType: opp.Account?.Customer_Type__c,
        opportunities: [],
        highestStage: 0,
        totalACV: 0,
        weightedACV: 0,
        isJohnsonHana: !!opp.Johnson_Hana_Owner__c // Track if this is a JH opportunity
      });
      if (opp.Account?.Is_New_Logo__c) newLogoCount++;
    }
    
    const account = accountMap.get(accountName);
    account.opportunities.push(opp);
    account.totalACV += (opp.ACV__c || 0); // SUM the ACVs!
    account.weightedACV += (opp.Weighted_ACV__c || 0);
    
    const stageNum = parseInt(opp.StageName.match(/Stage (\d)/)?.[1] || 0);
    account.highestStage = Math.max(account.highestStage, stageNum);
  });
  
  // Categorize by stage - including Johnson Hana accounts
  const late = [], mid = [], early = [];
  
  // Add Eudia accounts
  accountMap.forEach(acc => {
    acc.isLegacy = false; // Mark as Eudia account
    if (acc.highestStage >= 3) late.push(acc);
    else if (acc.highestStage === 2) mid.push(acc);
    else early.push(acc);
  });
  
  // Add Johnson Hana accounts (legacy)
  jhAccounts.forEach(acc => {
    const jhAcc = {
      name: acc.name,
      accountId: null, // JH accounts don't have SF account ID in Eudia
      owner: acc.owners?.join(', ') || 'JH Team',
      isNewLogo: false,
      hasAccountPlan: false,
      accountPlan: null,
      customerType: null,
      opportunities: acc.opportunities.map(o => ({
        StageName: o.stage,
        ACV__c: o.acv || 0,
        Weighted_ACV__c: o.weighted || 0,
        Product_Line__c: o.mappedServiceLine || o.serviceLine || 'Other',
        Owner: { Name: o.owner }
      })),
      highestStage: acc.highestStage,
      totalACV: acc.totalACV,
      weightedACV: acc.weightedACV,
      isLegacy: true, // Mark as JH/legacy account
      hasEudiaTech: acc.hasEudiaTech
    };
    
    if (jhAcc.highestStage >= 3) late.push(jhAcc);
    else if (jhAcc.highestStage === 2) mid.push(jhAcc);
    else early.push(jhAcc);
  });
  
  // Sort all arrays by customerType (Revenue > Pilot > LOI > Other) then by totalACV descending
  const customerTypePriority = (type) => {
    if (!type) return 4;
    const t = type.toLowerCase();
    if (t.includes('revenue') || t === 'arr') return 1;
    if (t.includes('pilot')) return 2;
    if (t.includes('loi')) return 3;
    return 4;
  };
  
  const sortByTypeAndACV = (a, b) => {
    const typeDiff = customerTypePriority(a.customerType) - customerTypePriority(b.customerType);
    if (typeDiff !== 0) return typeDiff;
    return b.totalACV - a.totalACV;
  };
  
  late.sort(sortByTypeAndACV);
  mid.sort(sortByTypeAndACV);
  early.sort(sortByTypeAndACV);
  
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
    blBreakdown[blName].weightedACV += (opp.Weighted_ACV__c || 0);
    blBreakdown[blName].count++;
    if (blBreakdown[blName].byStage[stage]) {
      blBreakdown[blName].byStage[stage].count++;
      blBreakdown[blName].byStage[stage].acv += (opp.ACV__c || 0);
      blBreakdown[blName].byStage[stage].weighted += (opp.Weighted_ACV__c || 0);
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
    productBreakdown[product].weightedACV += (opp.Weighted_ACV__c || 0);
    productBreakdown[product].count++;
    if (productBreakdown[product].byStage[stage]) {
      productBreakdown[product].byStage[stage].count++;
      productBreakdown[product].byStage[stage].acv += (opp.ACV__c || 0);
      productBreakdown[product].byStage[stage].weighted += (opp.Weighted_ACV__c || 0);
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
.weekly-table th { background: #000000; color: #fff; padding: 8px; text-align: left; font-weight: 700; }
.weekly-table td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
.weekly-table tr:nth-child(even) { background: #f9fafb; }
.weekly-section { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.weekly-section-title { font-size: 1rem; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
.weekly-subsection { margin-top: 16px; }
.weekly-subsection-title { font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 8px; }
.weekly-list { margin: 0; padding-left: 20px; font-size: 0.8rem; color: #374151; }
.weekly-list li { margin-bottom: 4px; }
.weekly-highlight { background: #f0fdf4; border-left: 3px solid #34d399; padding: 8px 12px; margin: 8px 0; font-size: 0.8rem; }
.wow-positive { color: #22c55e; font-weight: 600; }
.wow-negative { color: #dc2626; font-weight: 600; }
.badge-eudia { background: #ecfdf5; color: #047857; border: 1px solid #34d399; font-size: 0.6rem; }
.jh-indicator { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; margin-left: 4px; vertical-align: middle; }
.metrics { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
@media (min-width: 480px) { .metrics { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 768px) { .metrics { grid-template-columns: repeat(3, 1fr); } }
.metric { background: #fff; padding: 16px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.metric-label { font-size: 0.75rem; color: #6b7280; font-weight: 500; margin-bottom: 4px; }
.metric-value { font-size: 1.75rem; font-weight: 700; color: #1f2937; margin-bottom: 2px; }
.metric-change { font-size: 0.75rem; font-weight: 500; }
.up { color: #34d399; }
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
.card-late { border-left-color: #34d399; }
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
@media (min-width: 1024px) { .metrics { grid-template-columns: repeat(4, 1fr); } }
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
  <label for="tab-topco" class="tab">Summary</label>
  <label for="tab-weekly" class="tab">Weekly</label>
  <label for="tab-summary" class="tab">Pipeline</label>
  <label for="tab-revenue" class="tab">Revenue</label>
  <label for="tab-account-plans" class="tab">Accounts</label>
</div>

<!-- TAB 1: BUSINESS LEADS -->
<div id="summary" class="tab-content">
  <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #374151;">
    <strong>Pipeline Overview</strong> — Accounts by stage and owner.
    <span style="color: #9ca3af; font-size: 0.6rem; margin-left: 8px;">• = legacy acquisition (updated weekly)</span>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Late Stage (${late.length})</div>
    <div class="account-list" id="late-stage-list">
${late.map((acc, idx) => {
        let badge = '';
        const legacyDot = '';
        const eudiaTechBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;"></span>' : '';
        
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
        
        // Only show meetings for Eudia accounts (not legacy)
        const accountMeetings = !acc.isLegacy ? (meetingData.get(acc.accountId) || {}) : {};
        const lastMeetingDate = accountMeetings.lastMeeting ? new Date(accountMeetings.lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const nextMeetingDate = accountMeetings.nextMeeting ? new Date(accountMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const lastMeetingSubject = accountMeetings.lastMeetingSubject || '';
        const nextMeetingSubject = accountMeetings.nextMeetingSubject || '';
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #34d399; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + legacyDot + eudiaTechBadge + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (!acc.isLegacy && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Last:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '') +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => { const av = o.ACV__c || 0; const af = av >= 1000000 ? '$' + (av / 1000000).toFixed(1) + 'm' : '$' + (av / 1000).toFixed(0) + 'k'; return '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - ' + af + '</div>'; }).join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${late.length > 10 ? `<div id="show-more-late" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${late.length - 10} more... (click to expand)</div>` : ''}
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">Mid Stage (${mid.length})</div>
    <div class="account-list" id="mid-stage-list">
${mid.map((acc, idx) => {
        let badge = '';
        const legacyDot = '';
        const eudiaTechBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;"></span>' : '';
        
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
        
        // Only show meetings for Eudia accounts (not legacy)
        const accountMeetings = !acc.isLegacy ? (meetingData.get(acc.accountId) || {}) : {};
        const lastMeetingDate = accountMeetings.lastMeeting ? new Date(accountMeetings.lastMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const nextMeetingDate = accountMeetings.nextMeeting ? new Date(accountMeetings.nextMeeting).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
        const lastMeetingSubject = accountMeetings.lastMeetingSubject || '';
        const nextMeetingSubject = accountMeetings.nextMeetingSubject || '';
        const products = [...new Set(acc.opportunities.map(o => o.Product_Line__c).filter(p => p))];
        const productList = products.join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #3b82f6; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + legacyDot + eudiaTechBadge + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (!acc.isLegacy && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Last:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : '') + '</div>' : '') +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Products:</strong> ' + productList + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => { const av = o.ACV__c || 0; const af = av >= 1000000 ? '$' + (av / 1000000).toFixed(1) + 'm' : '$' + (av / 1000).toFixed(0) + 'k'; return '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - ' + af + '</div>'; }).join('') +
          '</div>' +
        '</details>';
      }).join('')}
      ${mid.length > 10 ? `<div id="show-more-mid" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 8px; background: #eff6ff; border-radius: 6px; margin-top: 4px;">+${mid.length - 10} more... (click to expand)</div>` : ''}
    </div>
  </div>
  
  <!-- Business Lead Overview -->
  <div class="stage-section">
    <div class="stage-title" style="font-size: 0.9rem;">Business Lead Overview</div>
    <div class="stage-subtitle" style="font-size: 0.65rem;">Top reps by pipeline value (click to expand)</div>
    
    ${(() => {
      // Combine all BLs from both sources
      const allBLs = [];
      
      // Add Eudia BLs
      Object.entries(blBreakdown).forEach(([bl, data]) => {
        const blOpps = accountData.records.filter(o => (o.Owner?.Name || 'Unassigned') === bl);
        allBLs.push({
          name: bl,
          count: data.count,
          totalACV: data.totalACV,
          byStage: data.byStage,
          opps: blOpps,
          source: 'eudia'
        });
      });
      
      // Add JH BLs
      const jhSummaryData = getJohnsonHanaSummary();
      const jhByOwner = jhSummaryData.byOwner || {};
      Object.entries(jhByOwner).forEach(([owner, data]) => {
        const ownerOpps = jhSummaryData.pipeline.filter(o => o.owner === owner);
        const byStage = {};
        ownerOpps.forEach(o => {
          const mappedStage = mapStage(o.stage);
          if (!byStage[mappedStage]) byStage[mappedStage] = { count: 0, acv: 0, opps: [] };
          byStage[mappedStage].count++;
          byStage[mappedStage].acv += o.acv;
          byStage[mappedStage].opps.push(o);
        });
        allBLs.push({
          name: owner,
          count: data.count,
          totalACV: data.acv,
          byStage,
          opps: ownerOpps,
          source: 'jh'
        });
      });
      
      // Sort by total ACV
      const sortedBLs = allBLs.sort((a, b) => b.totalACV - a.totalACV);
      const topBLs = sortedBLs.slice(0, 6);
      const remainingBLs = sortedBLs.slice(6);
      
      const renderBL = (bl) => {
        if (bl.source === 'eudia') {
          return `
          <details style="background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 4px; overflow: hidden;">
            <summary style="padding: 6px 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
              <span style="font-weight: 600; font-size: 0.7rem;">${bl.name}</span>
              <span style="font-size: 0.65rem; color: #6b7280;">${bl.count} • <strong style="color: #1f2937;">$${(bl.totalACV / 1000000).toFixed(2)}m</strong></span>
            </summary>
            <div style="padding: 6px; border-top: 1px solid #e5e7eb; font-size: 0.6rem;">
              ${['Stage 5 - Negotiation', 'Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery'].filter(s => bl.byStage[s]?.count > 0).map(stage => 
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span>' + cleanStageName(stage) + '</span><span style="color: #6b7280;">' + bl.byStage[stage].count + ' • $' + (bl.byStage[stage].acv / 1000000).toFixed(2) + 'm</span></div>'
              ).join('')}
            </div>
          </details>`;
        } else {
          return `
          <details style="background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 4px; overflow: hidden;">
            <summary style="padding: 6px 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
              <span style="font-weight: 600; font-size: 0.7rem;">${bl.name}</span>
              <span style="font-size: 0.65rem; color: #6b7280;">${bl.count} • <strong style="color: #1f2937;">$${(bl.totalACV / 1000000).toFixed(2)}m</strong></span>
            </summary>
            <div style="padding: 6px; border-top: 1px solid #e5e7eb; font-size: 0.6rem;">
              ${Object.entries(bl.byStage).sort((a, b) => {
                const order = ['Stage 5 - Negotiation', 'Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery'];
                return order.indexOf(a[0]) - order.indexOf(b[0]);
              }).map(([stage, stageData]) => 
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span>' + cleanStageName(stage) + '</span><span style="color: #6b7280;">' + stageData.count + ' • $' + (stageData.acv / 1000000).toFixed(2) + 'm</span></div>'
              ).join('')}
            </div>
          </details>`;
        }
      };
      
      return `
      <div style="margin-top: 8px;">
        ${topBLs.map(bl => renderBL(bl)).join('')}
        ${remainingBLs.length > 0 ? `
        <details style="margin-top: 4px;">
          <summary style="cursor: pointer; padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 0.7rem; color: #1e40af; font-weight: 600; text-align: center;">
            +${remainingBLs.length} more reps (click to expand)
          </summary>
          <div style="margin-top: 4px;">
            ${remainingBLs.map(bl => renderBL(bl)).join('')}
          </div>
        </details>` : ''}
      </div>
      `;
    })()}
    
    <!-- Total -->
    <div style="background: #1f2937; padding: 8px 12px; border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; font-weight: 700; color: #fff; font-size: 0.7rem;">
      <span>TOTAL</span>
      <span>${Object.values(blBreakdown).reduce((sum, data) => sum + data.count, 0) + getJohnsonHanaSummary().totalOpportunities} opps • $${((Object.values(blBreakdown).reduce((sum, data) => sum + data.totalACV, 0) + getJohnsonHanaSummary().totalPipeline) / 1000000).toFixed(2)}m</span>
    </div>
  </div>
  
  <!-- Account Tags Legend -->
  <div style="margin-top: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.65rem; color: #6b7280;">
    <div style="margin-bottom: 4px;"><span class="badge badge-marquee" style="font-size: 0.6rem;">High-Touch Marquee</span> Large enterprise, $1M+ ARR potential, requires senior engagement</div>
    <div style="margin-bottom: 4px;"><span class="badge badge-velocity" style="font-size: 0.6rem;">High-Velocity</span> Mid-market, ~$150k ARR potential, faster sales cycle</div>
    <div><span class="badge badge-new" style="font-size: 0.6rem;">New</span> Account with no prior closed deals</div>
  </div>
</div>

<!-- TAB: PIPELINE OVERVIEW -->
${generateTopCoTab(totalGross, totalWeighted, totalDeals, accountMap.size, stageBreakdown, productBreakdown, accountMap, signedByType, meetingData, novDecRevenue, novDecRevenueTotal)}

<!-- TAB: WEEKLY REVOPS SUMMARY -->
${generateWeeklyTab({
  totalGross, totalWeighted, totalDeals, accountMap,
  stageBreakdown, jhSummary: getJohnsonHanaSummary(), jhAccounts: getJHAccounts(),
  signedByType, signedDealsTotal,
  novDecRevenue, novDecRevenueTotal,
  contractsByAccount, recurringTotal, projectTotal,
  closedLostDeals, nurturedAccounts, daysInStageByStage, logosByType,
  newOppsThisWeek, newOppsTotal, signedThisWeek, signedByFiscalQuarter
})}

<!-- TAB 3: REVENUE -->
<div id="revenue" class="tab-content">
  <!-- Active Revenue by Account -->
  <div class="stage-section">
    <div class="stage-title">Active Revenue by Account</div>
    <div class="stage-subtitle">${Object.keys(eudiaNovemberARR).length + Object.keys(jhNovemberARR).length + Object.keys(outHouseNovemberARR).length} accounts • ${formatCurrency(totalNovemberARR)} total ARR (Nov)</div>
  </div>
  
  <div class="section-card">
    ${(() => {
      // Combine all November ARR from source data
      const allRevenue = [];
      
      // Add EUDIA November ARR accounts (from source file)
      Object.entries(eudiaNovemberARR).forEach(([name, arr]) => {
        allRevenue.push({ name, arr, indicator: '' });
      });
      
      // Add JH November ARR accounts
      Object.entries(jhNovemberARR).forEach(([name, arr]) => {
        allRevenue.push({ name, arr, indicator: '' });
      });
      
      // Add Out-House November ARR accounts (Meta)
      Object.entries(outHouseNovemberARR).forEach(([name, arr]) => {
        allRevenue.push({ name, arr, indicator: ' ◊' });
      });
      
      // Sort by ARR
      const sorted = allRevenue.sort((a, b) => b.arr - a.arr);
      const top15 = sorted.slice(0, 15);
      const rest = sorted.slice(15);
      
      const renderRow = (item) => `<tr style="border-bottom: 1px solid #f1f3f5;"><td style="padding: 4px 4px; font-size: 0.7rem;">${item.name}${item.indicator}</td><td style="padding: 4px 4px; text-align: right; font-size: 0.7rem;">${formatCurrency(item.arr)}</td></tr>`;
      
      return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb; text-align: left;">
          <th style="padding: 6px 4px; font-weight: 600; font-size: 0.7rem;">Account</th>
          <th style="padding: 6px 4px; font-weight: 600; text-align: right; font-size: 0.7rem;">Nov ARR</th>
        </tr>
      </thead>
      <tbody>
        ${top15.map(renderRow).join('')}
      </tbody>
    </table>
    ${rest.length > 0 ? `
    <details style="margin-top: 4px;">
      <summary style="cursor: pointer; padding: 8px 4px; background: #f3f4f6; border-radius: 4px; font-size: 0.65rem; color: #1e40af; font-weight: 600; text-align: center;">
        +${rest.length} more accounts (click to expand)
      </summary>
      <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
        <tbody>${rest.map(renderRow).join('')}</tbody>
      </table>
    </details>` : ''}
    <div style="display: flex; justify-content: space-between; padding: 8px 4px; margin-top: 8px; border-top: 2px solid #e5e7eb; font-weight: 700; font-size: 0.75rem;">
      <span>TOTAL</span>
      <span>${formatCurrency(totalNovemberARR)}</span>
    </div>`;
    })()}
    <div style="font-size: 0.55rem; color: #9ca3af; margin-top: 6px;">* Awaiting contract &nbsp;† Signed LOI before converting &nbsp;◊ Out-House</div>
  </div>

  <!-- All Closed Won Deals - By Revenue_Type__c -->
  ${(() => {
    // Combine EUDIA and JH closed won deals for Revenue section
    const jhRevenue = Object.entries(jhNovemberARR).map(([name, acv]) => ({
      accountName: name,
      acv,
      closeDate: '2025-11-01'
    }));
    const combinedRevenue = [...signedByType.revenue, ...jhRevenue].sort((a, b) => b.acv - a.acv);
    const combinedRevenueTotal = eudiaNovemberARRTotal + jhNovemberARRTotal;
    
    return `
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">All Closed Won</div>
    <div class="stage-subtitle">${combinedRevenue.length} revenue • ${signedByType.pilot.length} pilot • ${signedByType.loi.length} LOI</div>
    <div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 4px;">
      <strong>Revenue:</strong> Recurring/ARR subscription contracts &nbsp;|&nbsp;
      <strong>Pilot:</strong> One-time project engagements &nbsp;|&nbsp;
      <strong>LOI:</strong> Signed commitments to spend
    </div>
  </div>
  
  <div class="section-card" style="padding: 0;">
    ${combinedRevenue.length > 0 ? `
    <details open style="margin-bottom: 12px;">
      <summary style="background: #059669; padding: 8px 12px; border-radius: 6px 6px 0 0; font-size: 0.75rem; font-weight: 700; color: #fff; display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
        <span>REVENUE</span>
        <span>${formatCurrency(combinedRevenueTotal)} • ${combinedRevenue.length} deal${combinedRevenue.length !== 1 ? 's' : ''}</span>
      </summary>
      <div style="padding: 0 12px 12px 12px; background: #f0fdf4; border-radius: 0 0 6px 6px;">
      ${combinedRevenue.slice(0, 5).map(d => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e9f5ec; font-size: 0.75rem;">
          <span style="font-weight: 500;">${d.accountName}</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
            <span style="color: #15803d; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
          </div>
        </div>
      `).join('')}
      ${combinedRevenue.length > 5 ? `
        <details style="margin-top: 4px;">
          <summary style="font-size: 0.65rem; color: #15803d; cursor: pointer; padding: 4px 0;">+${combinedRevenue.length - 5} more deals ›</summary>
          ${combinedRevenue.slice(5).map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e9f5ec; font-size: 0.75rem;">
              <span style="font-weight: 500;">${d.accountName}</span>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
                <span style="color: #15803d; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
              </div>
            </div>
          `).join('')}
        </details>` : ''}
      </div>
    </details>` : ''}`;
  })()}
    
    ${signedByType.pilot.length > 0 ? `
    <details open style="margin-bottom: 12px;">
      <summary style="background: #2563eb; padding: 8px 12px; border-radius: 6px 6px 0 0; font-size: 0.75rem; font-weight: 700; color: #fff; display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
        <span>PILOT</span>
        <span>${formatCurrency(signedDealsTotal.pilot)} • ${signedByType.pilot.length} deal${signedByType.pilot.length !== 1 ? 's' : ''}</span>
      </summary>
      <div style="padding: 0 12px 12px 12px; background: #eff6ff; border-radius: 0 0 6px 6px;">
      ${signedByType.pilot.slice(0, 5).map(d => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #dbeafe; font-size: 0.75rem;">
          <span style="font-weight: 500;">${d.accountName}</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
            <span style="color: #1e40af; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
          </div>
        </div>
      `).join('')}
      ${signedByType.pilot.length > 5 ? `
        <details style="margin-top: 4px;">
          <summary style="font-size: 0.65rem; color: #1e40af; cursor: pointer; padding: 4px 0;">+${signedByType.pilot.length - 5} more deals ›</summary>
          ${signedByType.pilot.slice(5).map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #dbeafe; font-size: 0.75rem;">
              <span style="font-weight: 500;">${d.accountName}</span>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
                <span style="color: #1e40af; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
              </div>
            </div>
          `).join('')}
        </details>` : ''}
      </div>
    </details>` : ''}
    
    ${signedByType.loi.length > 0 ? `
    <details open>
      <summary style="background: #374151; padding: 8px 12px; border-radius: 6px 6px 0 0; font-size: 0.75rem; font-weight: 700; color: #fff; display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
        <span>LOI</span>
        <span>${formatCurrency(signedDealsTotal.loi)} • ${signedByType.loi.length} deal${signedByType.loi.length !== 1 ? 's' : ''}</span>
      </summary>
      <div style="padding: 0 12px 12px 12px; background: #f9fafb; border-radius: 0 0 6px 6px;">
      ${signedByType.loi.slice(0, 5).map(d => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 0.75rem;">
          <span style="font-weight: 500;">${d.accountName}</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
            <span style="color: #374151; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
          </div>
        </div>
      `).join('')}
      ${signedByType.loi.length > 5 ? `
        <details style="margin-top: 4px;">
          <summary style="font-size: 0.65rem; color: #374151; cursor: pointer; padding: 4px 0;">+${signedByType.loi.length - 5} more deals ›</summary>
          ${signedByType.loi.slice(5).map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 0.75rem;">
              <span style="font-weight: 500;">${d.accountName}</span>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
                <span style="color: #374151; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
              </div>
            </div>
          `).join('')}
        </details>` : ''}
      </div>
    </details>` : ''}
    
    ${signedByType.revenue.length === 0 && signedByType.pilot.length === 0 && signedByType.loi.length === 0 ? '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No closed deals in last 90 days</div>' : ''}
  </div>
</div>

<!-- TAB 4: ACCOUNTS -->
<div id="account-plans" class="tab-content">
  <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #374151;">
    <strong>All Accounts</strong> — Current active accounts and pipeline. Totals based on Salesforce Customer_Type__c field.
  </div>
  
  <!-- Logos by Customer Type - Using consistent logosByType data -->
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
    <!-- REVENUE Tile -->
    <div style="background: #f0fdf4; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #059669;">REVENUE</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #15803d;">${logosByType.revenue.length}</div>
      </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Paying customers with active contracts</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #059669; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.revenue.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
    </div>
    
    <!-- PILOT Tile -->
    <div style="background: #eff6ff; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #2563eb;">PILOT</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af;">${logosByType.pilot.length}</div>
      </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Active pilots or proof-of-concept</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #2563eb; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.pilot.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
    </div>
    
    <!-- LOI Tile -->
    <div style="background: #faf5ff; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #7c3aed;">LOI</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #7c3aed;">${logosByType.loi.length}</div>
      </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Signed LOI, pending contract</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #7c3aed; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.loi.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
    </div>
  </div>
  
  <!-- Total Signed Logos Summary -->
  <div style="background: #1f2937; color: white; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 0.75rem; font-weight: 600;">Total Signed Logos</span>
    <span style="font-size: 1rem; font-weight: 700;">${logosByType.revenue.length + logosByType.pilot.length + logosByType.loi.length}</span>
  </div>
  
  <div class="section-card" style="padding: 12px; margin-bottom: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <div class="stage-title" style="margin: 0;">Account Plans & Pipeline</div>
      <div style="font-size: 0.7rem; color: #6b7280;">${accountsWithPlans} have plans</div>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 0.6rem; color: #9ca3af;">
      <span><strong style="color: #22c55e;">Revenue</strong> = ARR customer</span>
      <span><strong style="color: #2563eb;">Pilot</strong> = Active project</span>
      <span><strong style="color: #6b7280;">LOI</strong> = Signed commitment</span>
      <span><strong style="color: #065f46;">New</strong> = First deal &lt;90 days</span>
      <span><strong style="color: #374151;">Marquee</strong> = $1m+ ARR potential</span>
      <span><strong style="color: #075985;">Velocity</strong> = ~$150k ARR, fast cycle</span>
    </div>
  </div>
  
  <div class="stage-section">
    <div class="stage-title">All Accounts (${accountMap.size + jhSummary.uniqueAccounts})</div>
    <input type="text" id="account-search" placeholder="Search all accounts..." style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.875rem; margin-bottom: 12px;">
    <div id="match-count" style="font-size: 0.75rem; color: #6b7280; margin-bottom: 8px;">Showing top 10 accounts (type to search all ${accountMap.size + jhSummary.uniqueAccounts})</div>
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
        
          return '<details class="account-expandable" data-account="' + acc.name.toLowerCase() + '" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid ' + (acc.highestStage >= 3 ? '#34d399' : acc.highestStage === 2 ? '#3b82f6' : '#f59e0b') + '; padding: 12px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid #e5e7eb;">' +
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
                acc.opportunities.map(o => { const av = o.ACV__c || 0; const af = av >= 1000000 ? '$' + (av / 1000000).toFixed(1) + 'm' : '$' + (av / 1000).toFixed(0) + 'k'; return '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + cleanStageName(o.StageName) + ' - ' + (o.Product_Line__c || 'TBD') + ' - ' + af + '</div>'; }).join('') +
              '</div>' +
            '</div>' +
          '</details>';
        }).join('')}
      <!-- JH Accounts (Legacy) -->
      ${jhAccounts.map((acc, idx) => {
        const services = [...new Set(acc.opportunities.map(o => o.mappedServiceLine).filter(s => s))];
        const acvDisplay = acc.totalACV >= 1000000 
          ? '$' + (acc.totalACV / 1000000).toFixed(1) + 'm' 
          : acc.totalACV >= 1000 
            ? '$' + (acc.totalACV / 1000).toFixed(0) + 'k' 
            : '$' + acc.totalACV.toFixed(0);
        const eudiaTechBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;"></span>' : '';
        
        return '<details class="account-expandable" data-account="' + acc.name.toLowerCase() + '" style="display: none; background: #fff; border-left: 3px solid #9ca3af; padding: 12px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; display: flex; justify-content: space-between; align-items: center;">' +
            '<div style="flex: 1;">' +
              '<div style="font-weight: 600; font-size: 0.9375rem; color: #1f2937;">' +
                acc.name + ' <span style="color: #9ca3af;">•</span>' + eudiaTechBadge +
              '</div>' +
              '<div style="font-size: 0.8125rem; color: #6b7280; margin-top: 2px;">' +
                'S' + acc.highestStage + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') +
              '</div>' +
            '</div>' +
            '<div style="text-align: right;">' +
              '<div style="font-weight: 600; color: #1f2937;">' + acvDisplay + '</div>' +
              '<div style="font-size: 0.75rem; color: #6b7280;">Wtd: ' + (acc.weightedACV >= 1000000 ? '$' + (acc.weightedACV / 1000000).toFixed(1) + 'm' : '$' + Math.round(acc.weightedACV / 1000) + 'k') + '</div>' +
            '</div>' +
          '</summary>' +
          '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            '<div style="color: #374151; margin-bottom: 4px;"><strong>Services:</strong> ' + (services.join(', ') || 'TBD') + '</div>' +
            '<div style="color: #374151; margin-top: 6px;"><strong>Opportunities (' + acc.opportunities.length + '):</strong></div>' +
            acc.opportunities.map(o => { 
              const av = o.acv || 0; 
              const af = av >= 1000000 ? '$' + (av / 1000000).toFixed(1) + 'm' : '$' + (av / 1000).toFixed(0) + 'k'; 
              const stageMatch = o.stage ? o.stage.match(/Stage\\s*(\\d)/) : null;
              const stageNum = stageMatch ? 'S' + stageMatch[1] : (o.stage || 'TBD');
              return '<div style="font-size: 0.75rem; color: #6b7280; margin-left: 12px; margin-top: 2px;">• ' + stageNum + ' - ' + (o.mappedServiceLine || 'TBD') + ' - ' + af + (o.owner ? ' (' + o.owner.split(' ')[0] + ')' : '') + '</div>'; 
            }).join('') +
          '</div>' +
        '</details>';
      }).join('')}
      <div id="show-more-accounts" class="account-item" style="color: #1e40af; font-weight: 600; cursor: pointer; text-align: center; padding: 12px; background: #eff6ff; border-radius: 6px; margin-top: 8px;">+${accountMap.size + jhAccounts.length - 10} more accounts (click to show all)</div>
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
  
  // Show more accounts button (with collapse and improved UX)
  if (showMoreBtn) {
    let expanded = false;
    showMoreBtn.addEventListener('click', function() {
      if (!expanded) {
        allAccounts.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse to top 10';
        this.style.background = '#fef3c7';
        this.style.color = '#92400e';
        matchCount.textContent = 'Showing all ' + allAccounts.length + ' accounts';
        expanded = true;
        // Scroll to keep button visible
        this.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        allAccounts.forEach((acc, idx) => acc.style.display = idx < 10 ? 'block' : 'none');
        this.textContent = '+' + (allAccounts.length - 10) + ' more accounts';
        this.style.background = '#eff6ff';
        this.style.color = '#1e40af';
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
  
  // Top Co tab - Consolidated accounts expand/collapse
  const showMoreTopco = document.getElementById('show-more-topco');
  if (showMoreTopco) {
    let topcoExpanded = false;
    const allTopcoAccounts = document.querySelectorAll('.topco-account');
    const topcoCount = allTopcoAccounts.length;
    showMoreTopco.addEventListener('click', function() {
      if (!topcoExpanded) {
        allTopcoAccounts.forEach(acc => acc.style.display = 'block');
        this.textContent = '▲ Collapse to top 10';
        this.style.background = '#fef3c7';
        this.style.color = '#92400e';
        topcoExpanded = true;
        this.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        allTopcoAccounts.forEach((acc, idx) => acc.style.display = idx < 10 ? 'block' : 'none');
        this.textContent = '+' + (topcoCount - 10) + ' more accounts';
        this.style.background = '#eff6ff';
        this.style.color = '#1e40af';
        topcoExpanded = false;
      }
    });
  }
});

// Copy Weekly tab for email
function copyWeeklyForEmail() {
  const weeklyTab = document.getElementById('weekly');
  if (!weeklyTab) return;
  
  // Create email-friendly HTML
  const dashboardUrl = window.location.href.split('?')[0];
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
  
  // Clone the content and clean it up for email
  const clone = weeklyTab.cloneNode(true);
  
  // Remove the copy button and status from the clone
  const copyBtn = clone.querySelector('button');
  if (copyBtn) copyBtn.parentElement.remove();
  const status = clone.querySelector('#email-copy-status');
  if (status) status.remove();
  
  // Build email-friendly HTML with inline styles
  const emailHtml = \`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; color: #1f2937;">
  <div style="background: #f3f4f6; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px;">
    <strong>RevOps Weekly Summary</strong> — \${timestamp} PT
    <br><a href="\${dashboardUrl}" style="color: #2563eb; text-decoration: none;">View full dashboard →</a>
  </div>
  \${clone.innerHTML}
</div>
\`;
  
  // Copy as HTML to clipboard
  const blob = new Blob([emailHtml], { type: 'text/html' });
  const clipboardItem = new ClipboardItem({ 'text/html': blob });
  
  navigator.clipboard.write([clipboardItem]).then(() => {
    const statusEl = document.getElementById('email-copy-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      setTimeout(() => statusEl.style.display = 'none', 3000);
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Failed to copy. Please try again or manually select and copy the content.');
  });
}
</script>

</body>
</html>`;
  
  return html;
}

module.exports = {
  generateAccountDashboard,
  generateLoginPage
};

