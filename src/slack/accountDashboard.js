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
<title>Eudia GTM Dashboard</title>
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
  <h1>Eudia GTM Dashboard</h1>
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
 * Format product line for display - replace underscores with dashes
 */
function formatProductLine(productLine) {
  if (!productLine) return 'TBD';
  return productLine.replace(/_/g, ' - ').replace(/  +/g, ' ');
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
  
  // Top Product/Service Line calculation (Undetermined goes last)
  const sortedProducts = Object.entries(productBreakdown)
    .filter(([name, data]) => name !== 'Undetermined' && name)
    .sort((a, b) => b[1].totalACV - a[1].totalACV);
  // Add Undetermined at end if it exists
  if (productBreakdown['Undetermined']) {
    sortedProducts.push(['Undetermined', productBreakdown['Undetermined']]);
  }
  const topProduct = sortedProducts[0] || ['N/A', { totalACV: 0, count: 0 }];
  const topProductPct = blendedGross > 0 ? Math.round((topProduct[1].totalACV / blendedGross) * 100) : 0;
  const avgDealSize = blendedDeals > 0 ? Math.round((blendedGross / blendedDeals) / 1000) : 0;
  
  // Count opportunities over $100k (from Eudia accounts)
  const allOpps = Array.from(accountMap.values()).flatMap(acc => acc.opportunities);
  const oppsOver100k = allOpps.filter(o => (o.ACV__c || 0) >= 100000).length;
  
  // Late stage accounts (S3-S4) calculation - S5 blended into S4
  const lateStageNames = ['Stage 3 - Pilot', 'Stage 4 - Proposal'];
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
  // S5 Negotiation is blended into S4 Proposal
  const s5Data = stageBreakdown['Stage 5 - Negotiation'] || { count: 0, totalACV: 0 };
  const s5JH = jhSummary.byStage['Stage 5 - Negotiation'] || { count: 0, totalACV: 0 };
  const s4Combined = { 
    count: s4Data.count + s4JH.count + s5Data.count + s5JH.count, 
    totalACV: (s4Data.totalACV || 0) + (s4JH.totalACV || 0) + (s5Data.totalACV || 0) + (s5JH.totalACV || 0) 
  };
  const s4Pct = blendedGross > 0 ? Math.round((s4Combined.totalACV / blendedGross) * 100) : 0;
  
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
  
  // Count all accounts with AI Enabled (Eudia_Tech__c = true on any opp)
  const eudiaAIEnabledAccounts = Array.from(accountMap.values()).filter(a => a.hasEudiaTech);
  const jhAIEnabledAccounts = allJHAccounts.filter(a => a.hasEudiaTech);
  const totalAIEnabledAccounts = eudiaAIEnabledAccounts.length + jhAIEnabledAccounts.length;
  
  // Eudia closed deals - Last 60 days, includes Recurring, Project, and Pilot (excludes LOI)
  const eudiaRevenueDeals = novDecRevenue || [];
  const eudiaRevenueTotal = novDecRevenueTotal || 0;
  
  // JH closed deals
  const jhClosedDeals = closedWonNovDec;
  const jhClosedTotal = jhSummary.closedTotal;
  
  // Combined closed (using revenue-only for Eudia)
  const combinedClosedTotal = eudiaRevenueTotal + jhClosedTotal;
  const combinedClosedCount = eudiaRevenueDeals.length + jhClosedDeals.length;
  
  console.log(`[Dashboard] Closed Revenue Total: Eudia=$${eudiaRevenueTotal}, JH=$${jhClosedTotal}, Combined=$${combinedClosedTotal}, Count=${combinedClosedCount}`);
  
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
      ${stageOrder.map(stage => {
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
    <div><strong>S4</strong> Proposal - Formal proposal & negotiation</div>
  </div>
  
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TOP ACCOUNTS (Consolidated) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="stage-section" style="margin-top: 16px;">
    <div class="stage-title">Eudia Top Accounts</div>
    <div class="stage-subtitle">${blendedAccounts} accounts in pipeline</div>
    <div style="font-size: 0.65rem; color: #374151; margin-bottom: 6px;">
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; vertical-align: middle;"></span>
      AI Enabled: ${totalAIEnabledAccounts} accounts
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
          const aiEnabledDot = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;" title="AI Enabled"></span>' : '';
          
          return '<details class="topco-account" style="border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; overflow: hidden; display: ' + (idx < 10 ? 'block' : 'none') + ';">' +
            '<summary style="padding: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; font-size: 0.8rem;">' +
              '<div>' +
                '<span style="font-weight: 500;">' + acc.name + '</span>' + legacyDot + aiEnabledDot +
                '<div style="font-size: 0.65rem; color: #6b7280;">S' + acc.highestStage + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + (products.length ? ' • ' + products.slice(0,2).join(', ') : '') + '</div>' +
              '</div>' +
              '<div style="text-align: right;">' +
                '<div style="font-weight: 600;">' + fmt(acc.totalACV) + '</div>' +
                '<div style="font-size: 0.65rem; color: #6b7280;">Wtd: ' + fmt(acc.weightedACV) + '</div>' +
              '</div>' +
            '</summary>' +
            '<div style="padding: 10px; font-size: 0.75rem; border-top: 1px solid #e5e7eb;">' +
              (acc.source === 'eudia' && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #f3f4f6; padding: 6px; border-radius: 4px; margin-bottom: 6px; font-size: 0.7rem; color: #374151; border: 1px solid #e5e7eb;">' + (lastMeetingDate ? '<div><strong>Prior Meeting:</strong> ' + lastMeetingDate + '</div>' : '') + (nextMeetingDate ? '<div><strong>Next Meeting:</strong> ' + nextMeetingDate + '</div>' : (lastMeetingDate ? '<div style="color: #991b1b;"><strong>No next meeting scheduled</strong></div>' : '')) + '</div>' : '') +
              (legalContacts.length > 0 ? '<div style="font-size: 0.65rem; color: #6b7280; margin-bottom: 6px;"><strong>Legal:</strong> ' + legalContacts.slice(0,2).join(', ') + '</div>' : '') +
              '<div style="font-weight: 600; margin-bottom: 4px;">Opportunities (' + acc.opportunities.length + '):</div>' +
              acc.opportunities.map(o => {
                if (acc.source === 'eudia') {
                  const stageMatch = o.StageName ? o.StageName.match(/Stage\\s*(\\d)\\s*[-–]?\\s*(.*)/i) : null;
                  const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.StageName || 'TBD');
                  const targetDate = o.Target_LOI_Date__c ? new Date(o.Target_LOI_Date__c).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
                  const acvVal = o.ACV__c || 0;
                  const acvFmt = acvVal >= 1000000 ? '$' + (acvVal / 1000000).toFixed(1) + 'm' : '$' + (acvVal / 1000).toFixed(0) + 'k';
                  return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + formatProductLine(o.Product_Line__c) + '</span><div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (targetDate ? ' • Target: ' + targetDate : '') + '</div></div><span style="font-weight: 600;">' + acvFmt + '</span></div>';
                } else {
                  const stageMatch = o.stage ? o.stage.match(/Stage\\s*(\\d)\\s*(.*)/i) : null;
                  const stageLabel = stageMatch ? 'S' + stageMatch[1] + (stageMatch[2] ? ' ' + stageMatch[2].trim() : '') : (o.stage || 'TBD');
                  const targetDate = o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : null;
                  const ownerName = o.owner ? o.owner.split(' ')[0] : '';
                  const jhAcvVal = o.acv || 0;
                  const jhAcvFmt = jhAcvVal >= 1000000 ? '$' + (jhAcvVal / 1000000).toFixed(1) + 'm' : '$' + (jhAcvVal / 1000).toFixed(0) + 'k';
                  return '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f3f5;"><div><span style="font-weight: 500;">' + (o.mappedServiceLine || 'Other') + '</span>' + (o.eudiaTech ? ' <span style="color: #047857; font-size: 0.6rem;" title="AI Enabled">●</span>' : '') + '<div style="font-size: 0.6rem; color: #6b7280;">' + stageLabel + (ownerName ? ' • ' + ownerName : '') + (targetDate ? ' • ' + targetDate : '') + '</div></div><span style="font-weight: 600;">' + jhAcvFmt + '</span></div>';
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
    <div class="stage-title">Closed Revenue (Last 60 Days)</div>
    <div class="stage-subtitle">${combinedClosedCount} revenue deals • ${fmt(combinedClosedTotal)} total</div>
    <div style="font-size: 0.6rem; color: #9ca3af; margin-bottom: 6px;">Recurring, Project & Pilot deals. LOI excluded.</div>
    
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
      
      // Generate HTML for product tiles (blue, on top) - Format product name with dashes instead of underscores
      const productHTML = productTiles.map(t => 
        '<details style="flex: 0 0 auto;">' +
          '<summary style="background: #eff6ff; padding: 6px 10px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; list-style: none;">' +
            '<div style="font-weight: 600; color: #1e40af;">' + formatProductLine(t.name) + ' ▾</div>' +
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
    logosByType = { revenue: [], project: [], pilot: [], loi: [] },
    newOppsThisWeek = [], newOppsTotal = 0,
    signedThisWeek = [], signedThisWeekTotal = 0,
    signedByFiscalQuarter = {},
    customerAccounts = [],
    salesTypeByPod = {},
    salesTypeTotals = { acv: 0, weighted: 0, count: 0 }
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
            month: month,
            year: year
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
  
  // ═══════════════════════════════════════════════════════════════════════
  // THIS MONTH OPPORTUNITIES - Deals targeting current month
  // ═══════════════════════════════════════════════════════════════════════
  const currentMonth = new Date().getMonth(); // 0 = January
  const currentYear = new Date().getFullYear();
  
  const thisMonthOpps = q4Opps.filter(o => o.month === currentMonth && o.year === currentYear);
  thisMonthOpps.sort((a, b) => b.weighted - a.weighted);
  const thisMonthTotalACV = thisMonthOpps.reduce((sum, o) => sum + o.acv, 0);
  const thisMonthTotalWeighted = thisMonthOpps.reduce((sum, o) => sum + o.weighted, 0);
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonthName = monthNames[currentMonth];
  
  console.log(`[Dashboard] This Month (${currentMonthName}): ${thisMonthOpps.length} opps, Weighted: $${(thisMonthTotalWeighted/1000000).toFixed(2)}M`);
  
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
  
  // Last week's combined baseline values (Dec 12, 2025 - from SF report screenshot)
  // NOTE: S5 Negotiation is blended into S4 Proposal for reporting simplicity
  const lastWeekBaseline = {
    'Stage 0 - Qualifying': { acv: 5000000, oppCount: 61 },
    'Stage 1 - Discovery': { acv: 13100000, oppCount: 105 },
    'Stage 2 - SQO': { acv: 10700000, oppCount: 50 },
    'Stage 3 - Pilot': { acv: 325000, oppCount: 3 },
    'Stage 4 - Proposal': { acv: 8500000, oppCount: 44 }, // Includes S5 Negotiation
    'Total': { acv: 37500000, oppCount: 263 }
  };
  const baselineDate = 'Dec 12, 2025';
  
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
  // NOTE: S5 Negotiation is blended into S4 Proposal for reporting simplicity
  const s4Acv = (stageBreakdown['Stage 4 - Proposal']?.totalACV || 0) + getJHStageValue('Stage 4 - Proposal', 'totalACV');
  const s5Acv = (stageBreakdown['Stage 5 - Negotiation']?.totalACV || 0) + getJHStageValue('Stage 5 - Negotiation', 'totalACV');
  const s4Count = (stageBreakdown['Stage 4 - Proposal']?.count || 0) + getJHStageValue('Stage 4 - Proposal', 'count');
  const s5Count = (stageBreakdown['Stage 5 - Negotiation']?.count || 0) + getJHStageValue('Stage 5 - Negotiation', 'count');
  
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
      stage: 'Stage 4 - Proposal', // Combined with S5 for reporting
      acv: s4Acv + s5Acv,
      oppCount: s4Count + s5Count,
      lastAcv: lastWeekBaseline['Stage 4 - Proposal'].acv, // Already includes S5
      lastOppCount: lastWeekBaseline['Stage 4 - Proposal'].oppCount
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
  
  // Current logos count - LIVE from Salesforce Customer_Type__c = 'Revenue'
  const currentLogosCount = customerAccounts.length;
  const uniqueLogos = customerAccounts.map(a => a.name).sort();
  
  // Also keep signed by fiscal quarter for the "Signed Logos by Quarter" section
  const quarterOrder = ['FY2024 & Prior', 'Q4 2024', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025 (QTD)'];
  
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
    <div style="display: flex; gap: 8px;">
    <button onclick="copyWeeklyForEmail()" style="background: #1f2937; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">📧 Copy for Email</button>
      <button onclick="downloadWeeklyHTML()" style="background: #374151; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">💾 Download HTML</button>
    </div>
  </div>
  <div id="email-copy-status" style="display: none; background: #d1fae5; color: #065f46; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; font-size: 0.75rem;">✓ Copied to clipboard! Paste into your email.</div>

  <!-- SECTION 1: PIPELINE SNAPSHOT -->
  <div class="weekly-section">
    <div class="weekly-section-title">1. Pipeline Snapshot</div>
    
    <!-- Opportunities with Target Sign Date - Two Column Layout -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Target Close by Month</div>
      
      <!-- Q4 Stats Tiles - Live from Salesforce -->
          ${(() => {
        const totalQ4Count = q4Opps.length;
        const avgDealSize = totalQ4Count > 0 ? Math.round(q4TotalWeighted / totalQ4Count) : 0;
        
        return `
      <div style="display: flex; gap: 8px; margin-top: 8px; margin-bottom: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 100px; background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #111827; margin-bottom: 2px;">Q4 WEIGHTED PIPELINE</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #111827;">${fmt(q4TotalWeighted)}</div>
        </div>
        <div style="flex: 1; min-width: 100px; background: #dbeafe; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #1e40af; margin-bottom: 2px;">${currentMonthName.toUpperCase()} WEIGHTED</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #1e3a8a;">${fmt(thisMonthTotalWeighted)}</div>
        </div>
        <div style="flex: 1; min-width: 100px; background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.6rem; font-weight: 600; color: #6b7280; margin-bottom: 2px;">AVG DEAL SIZE</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #374151;">${fmt(avgDealSize)}</div>
        </div>
      </div>`;
      })()}
      
      <!-- Two Column Layout: This Month | Q4 -->
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        
        <!-- LEFT COLUMN: Targeting This Month -->
        <div style="flex: 1 1 calc(50% - 6px); min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px; border-left: 4px solid #6b7280;">
          <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 0.75rem;">TARGETING ${currentMonthName.toUpperCase()} (${thisMonthOpps.length})</div>
          <div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 8px;">Deals with Target Sign Date in ${currentMonthName} ${currentYear}</div>
          ${thisMonthOpps.length > 0 ? `
            <ol class="weekly-list" style="font-size: 0.7rem; margin: 0; padding-left: 16px; line-height: 1.5; color: #374151;">
              ${thisMonthOpps.slice(0, 10).map(o => {
                const tgt = o.targetDate ? new Date(o.targetDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
                return '<li style="margin-bottom: 3px;">' + o.account + ', ' + fmt(o.acv) + (tgt ? ' <span style="color: #6b7280; font-size: 0.65rem;">(' + tgt + ')</span>' : '') + '</li>';
              }).join('')}
            </ol>
            ${thisMonthOpps.length > 10 ? `
              <details style="margin-top: 6px;">
                <summary style="cursor: pointer; font-size: 0.65rem; color: #374151; font-weight: 600;">+${thisMonthOpps.length - 10} more opportunities</summary>
                <ol start="11" style="font-size: 0.65rem; margin: 4px 0 0 0; padding-left: 20px; line-height: 1.4; color: #6b7280;">
                  ${thisMonthOpps.slice(10).map(o => {
                    const tgt = o.targetDate ? new Date(o.targetDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
                    return '<li style="margin-bottom: 2px;">' + o.account + ', ' + fmt(o.acv) + (tgt ? ' (' + tgt + ')' : '') + '</li>';
                  }).join('')}
                </ol>
              </details>
            ` : ''}
          ` : '<div style="font-size: 0.7rem; color: #9ca3af; font-style: italic;">No deals targeting ${currentMonthName}</div>'}
        </div>
        
        <!-- RIGHT COLUMN: Top Q4 Opportunities -->
        <div style="flex: 1 1 calc(50% - 6px); min-width: 280px; background: #f9fafb; border-radius: 8px; padding: 12px; border-left: 4px solid #6b7280;">
          <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 0.75rem;">TOP Q4 OPPORTUNITIES (${q4Opps.length})</div>
          <div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 8px;">All Q4 FY2025 (Nov 1 - Jan 31)</div>
      ${(() => {
        const allQ4Sorted = q4Opps.map(o => ({ 
              account: o.account,
          acv: o.acv,
          weighted: o.weighted,
              targetDate: o.targetDate,
          isNov: o.month === 10,
          isDec: o.month === 11,
          isJan: o.month === 0
        })).sort((a, b) => b.acv - a.acv);
            
        const top10 = allQ4Sorted.slice(0, 10);
        const remaining = allQ4Sorted.slice(10);
        
            return (top10.length > 0 ? `
              <ol class="weekly-list" style="font-size: 0.7rem; margin: 0; padding-left: 16px; line-height: 1.5; color: #374151;">
                ${top10.map(o => {
                  const tgt = o.targetDate ? new Date(o.targetDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
                  return '<li style="margin-bottom: 3px;">' + o.account + ', ' + fmt(o.acv) + (tgt ? ' <span style="color: #6b7280; font-size: 0.65rem;">(' + tgt + ')</span>' : '') + '</li>';
                }).join('')}
              </ol>
              ${remaining.length > 0 ? `
                <details style="margin-top: 6px;">
                  <summary style="cursor: pointer; font-size: 0.65rem; color: #374151; font-weight: 600;">+${remaining.length} more opportunities</summary>
                  <ol start="11" style="font-size: 0.65rem; margin: 4px 0 0 0; padding-left: 20px; line-height: 1.4; color: #6b7280;">
                    ${remaining.map(o => {
                      const tgt = o.targetDate ? new Date(o.targetDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
                      return '<li style="margin-bottom: 2px;">' + o.account + ', ' + fmt(o.acv) + (tgt ? ' (' + tgt + ')' : '') + '</li>';
                    }).join('')}
                  </ol>
                </details>
              ` : ''}
            ` : '<div style="font-size: 0.7rem; color: #9ca3af; font-style: italic;">No Q4 opportunities</div>');
          })()}
        </div>
        
      </div>
    </div>
    
    <!-- Current Customers by Type -->
    <div class="weekly-subsection" style="margin-top: 16px;">
      <div class="weekly-subsection-title">Current Logos (${logosByType.revenue.length + logosByType.project.length + logosByType.pilot.length + logosByType.loi.length})</div>
      <div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 4px;">Accounts by Customer_Type__c: Revenue, Pilot, Project, LOI</div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin-top: 8px;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
          <div style="flex: 1; min-width: 80px; background: #d1fae5; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 0.6rem; color: #065f46; font-weight: 600;">REVENUE</div>
            <div style="font-size: 1rem; font-weight: 700; color: #047857;">${logosByType.revenue.length}</div>
          </div>
          <div style="flex: 1; min-width: 80px; background: #fef3c7; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 0.6rem; color: #92400e; font-weight: 600;">PILOT</div>
            <div style="font-size: 1rem; font-weight: 700; color: #d97706;">${logosByType.pilot.length}</div>
          </div>
          <div style="flex: 1; min-width: 80px; background: #dbeafe; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 0.6rem; color: #1e40af; font-weight: 600;">PROJECT</div>
            <div style="font-size: 1rem; font-weight: 700; color: #1e3a8a;">${logosByType.project.length}</div>
          </div>
          <div style="flex: 1; min-width: 80px; background: #f3f4f6; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 0.6rem; color: #374151; font-weight: 600;">LOI</div>
            <div style="font-size: 1rem; font-weight: 700; color: #1f2937;">${logosByType.loi.length}</div>
          </div>
        </div>
        <details>
          <summary style="cursor: pointer; font-weight: 600; font-size: 0.75rem; color: #111827;">
            ▸ All Logos (${logosByType.revenue.length + logosByType.project.length + logosByType.pilot.length + logosByType.loi.length} accounts) - click to expand
          </summary>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px; font-size: 0.65rem; color: #374151; margin-top: 8px;">
            ${[...logosByType.revenue, ...logosByType.project, ...logosByType.pilot, ...logosByType.loi]
              .sort((a, b) => a.localeCompare(b))
              .map(name => '<div style="padding: 2px 0;">' + name + '</div>')
              .join('')}
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
      <div style="font-size: 0.6rem; color: #9ca3af; margin-top: 4px; font-style: italic;">
        Baseline: Last week's combined Eudia + JH totals (${baselineDate})
      </div>
    </div>
    
    <!-- Pipeline by Sales Type - Dynamic from Sales_Type__c -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title">Pipeline by Sales Type</div>
      <div style="font-size: 0.65rem; color: #6b7280; margin-bottom: 8px;">New business, Expansion, Renewal, Eudia Counsel, Pilot</div>
      <table style="width: 100%; font-size: 0.7rem; margin-top: 8px; border-collapse: collapse; border: 1px solid #e5e7eb;">
        <thead>
          <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 6px 8px; text-align: left; color: #374151; font-weight: 600;">Sales Type</th>
            <th style="padding: 6px 8px; text-align: right; color: #374151; font-weight: 600;">Sum of ACV</th>
            <th style="padding: 6px 8px; text-align: center; color: #374151; font-weight: 600;">% ACV</th>
            <th style="padding: 6px 8px; text-align: right; color: #374151; font-weight: 600;">Weighted ACV</th>
            <th style="padding: 6px 8px; text-align: center; color: #374151; font-weight: 600;">% Wtd</th>
            <th style="padding: 6px 8px; text-align: center; color: #374151; font-weight: 600;">Count</th>
          </tr>
        </thead>
        <tbody style="color: #374151;">
          ${(() => {
            // Aggregate by sales type across all pods
            const bySalesType = {};
            Object.values(salesTypeByPod).forEach(pod => {
              Object.entries(pod).forEach(([type, data]) => {
                if (!bySalesType[type]) bySalesType[type] = { acv: 0, weighted: 0, count: 0 };
                bySalesType[type].acv += data.acv || 0;
                bySalesType[type].weighted += data.weighted || 0;
                bySalesType[type].count += data.count || 0;
              });
            });
            
            // Sort by ACV descending
            const sortedTypes = Object.entries(bySalesType).sort((a, b) => b[1].acv - a[1].acv);
            
            return sortedTypes.map(([type, data]) => {
              const acvPct = salesTypeTotals.acv > 0 ? Math.round((data.acv / salesTypeTotals.acv) * 100) : 0;
              const wtdPct = salesTypeTotals.weighted > 0 ? Math.round((data.weighted / salesTypeTotals.weighted) * 100) : 0;
              return '<tr style="border-bottom: 1px solid #e5e7eb;">' +
                '<td style="padding: 6px 8px;">' + type + '</td>' +
                '<td style="padding: 6px 8px; text-align: right;">' + fmt(data.acv) + '</td>' +
                '<td style="padding: 6px 8px; text-align: center; color: #6b7280;">' + acvPct + '%</td>' +
                '<td style="padding: 6px 8px; text-align: right;">' + fmt(data.weighted) + '</td>' +
                '<td style="padding: 6px 8px; text-align: center; color: #6b7280;">' + wtdPct + '%</td>' +
                '<td style="padding: 6px 8px; text-align: center;">' + data.count + '</td>' +
              '</tr>';
            }).join('') + 
            '<tr style="font-weight: 600; background: #e5e7eb;">' +
              '<td style="padding: 6px 8px;">Total</td>' +
              '<td style="padding: 6px 8px; text-align: right;">' + fmt(salesTypeTotals.acv) + '</td>' +
              '<td style="padding: 6px 8px; text-align: center;">100%</td>' +
              '<td style="padding: 6px 8px; text-align: right;">' + fmt(salesTypeTotals.weighted) + '</td>' +
              '<td style="padding: 6px 8px; text-align: center;">100%</td>' +
              '<td style="padding: 6px 8px; text-align: center;">' + salesTypeTotals.count + '</td>' +
            '</tr>';
          })()}
        </tbody>
      </table>
    </div>
    
    <!-- Total Pipeline by Pod - All Pipeline (no target sign filter) -->
    <div class="weekly-subsection">
      <div class="weekly-subsection-title" style="font-size: 0.7rem;">Total Pipeline by Pod</div>
      <div style="font-size: 0.65rem; color: #6b7280; margin-bottom: 8px;">All active pipeline (no target sign filter)</div>
      <table style="width: 100%; font-size: 0.7rem; margin-top: 8px; border-collapse: collapse; border: 1px solid #e5e7eb;">
        <thead>
          <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 6px 8px; text-align: left; color: #374151; font-weight: 600;">Pod</th>
            <th style="padding: 6px 8px; text-align: left; color: #374151; font-weight: 600;">Sales Type</th>
            <th style="padding: 6px 8px; text-align: right; color: #374151; font-weight: 600;">Sum of ACV</th>
            <th style="padding: 6px 8px; text-align: right; color: #374151; font-weight: 600;">Weighted ACV</th>
            <th style="padding: 6px 8px; text-align: center; color: #374151; font-weight: 600;">Count</th>
          </tr>
        </thead>
        <tbody style="color: #374151;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px; font-weight: 600;">US</td>
            <td style="padding: 6px 8px;">New business</td>
            <td style="padding: 6px 8px; text-align: right;">$18.0m</td>
            <td style="padding: 6px 8px; text-align: right;">$2.6m</td>
            <td style="padding: 6px 8px; text-align: center;">124</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px;"></td>
            <td style="padding: 6px 8px;">Expansion / Upsell</td>
            <td style="padding: 6px 8px; text-align: right;">$2.7m</td>
            <td style="padding: 6px 8px; text-align: right;">$814k</td>
            <td style="padding: 6px 8px; text-align: center;">21</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px;"></td>
            <td style="padding: 6px 8px;">New business via LOI</td>
            <td style="padding: 6px 8px; text-align: right;">$6.4m</td>
            <td style="padding: 6px 8px; text-align: right;">$1.8m</td>
            <td style="padding: 6px 8px; text-align: center;">20</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px; font-weight: 600;">EU</td>
            <td style="padding: 6px 8px;">New business</td>
            <td style="padding: 6px 8px; text-align: right;">$7.6m</td>
            <td style="padding: 6px 8px; text-align: right;">$865k</td>
            <td style="padding: 6px 8px; text-align: center;">51</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px;"></td>
            <td style="padding: 6px 8px;">Expansion / Upsell</td>
            <td style="padding: 6px 8px; text-align: right;">$8.1m</td>
            <td style="padding: 6px 8px; text-align: right;">$2.4m</td>
            <td style="padding: 6px 8px; text-align: center;">36</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 8px;"></td>
            <td style="padding: 6px 8px;">Renewal + Expansion</td>
            <td style="padding: 6px 8px; text-align: right;">$400k</td>
            <td style="padding: 6px 8px; text-align: right;">$100k</td>
            <td style="padding: 6px 8px; text-align: center;">2</td>
          </tr>
        </tbody>
      </table>
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
      <div style="flex: 1; min-width: 100px; background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb;">
        <div style="font-size: 0.6rem; font-weight: 600; color: #111827; margin-bottom: 2px;">TOP DEALS TOTAL</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #065f46;">${fmt(combinedTotal)}</div>
      </div>
      <div style="flex: 1; min-width: 100px; background: #dbeafe; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #bfdbfe;">
        <div style="font-size: 0.6rem; font-weight: 600; color: #1e40af; margin-bottom: 2px;">LATE STAGE (S4)</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #1e40af;">${lateStageCount} deals</div>
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
  // SIGNED LOGOS BY QUARTER - Query Accounts with First_Deal_Closed__c
  // This field on Account object stores when the account's first deal closed
  // Group accounts by fiscal quarter (Q4 2025 = Nov 1, 2025 - Jan 31, 2026)
  // ═══════════════════════════════════════════════════════════════════════
  const signedAccountsQuery = `
    SELECT Name, First_Deal_Closed__c, Customer_Type__c
    FROM Account
    WHERE First_Deal_Closed__c != null
      AND (NOT Name LIKE '%Sample%')
      AND (NOT Name LIKE '%Acme%')
      AND (NOT Name LIKE '%Sandbox%')
      AND (NOT Name LIKE '%Test%')
      AND (NOT Name LIKE '%MasterCard Rose%')
      AND (NOT Name LIKE '%DXC Technology%')
    ORDER BY First_Deal_Closed__c DESC
  `;
  
  // Also keep opportunity query for Revenue/Pilot/LOI categorization
  const signedDealsQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, Product_Line__c, Revenue_Type__c, StageName, Contract_Term_Months__c
    FROM Opportunity
    WHERE (StageName = 'Closed Won' OR StageName = 'Stage 6. Closed(Won)')
      AND (NOT Account.Name LIKE '%Sample%')
      AND (NOT Account.Name LIKE '%Acme%')
      AND (NOT Account.Name LIKE '%Sandbox%')
      AND (NOT Account.Name LIKE '%Test%')
      AND (NOT Account.Name LIKE '%MasterCard Rose%')
      AND (NOT Account.Name LIKE '%DXC Technology%')
    ORDER BY CloseDate DESC
  `;
  
  // LAST 60 DAYS - Dynamic lookback for closed revenue
  // For Top Co Closed Revenue section - includes Recurring, Project, Pilot (excludes LOI/Commitment)
  const novDecDealsQuery = `
    SELECT Account.Name, Name, ACV__c, CloseDate, Product_Line__c, Revenue_Type__c, StageName, Eudia_Tech__c
    FROM Opportunity
    WHERE (StageName = 'Closed Won' OR StageName = 'Stage 6. Closed(Won)')
      AND CloseDate >= LAST_N_DAYS:60
      AND Revenue_Type__c IN ('Recurring', 'Project', 'Pilot')
      AND (NOT Account.Name LIKE '%Sample%')
      AND (NOT Account.Name LIKE '%Acme%')
      AND (NOT Account.Name LIKE '%Sandbox%')
      AND (NOT Account.Name LIKE '%Test%')
      AND (NOT Account.Name LIKE '%MasterCard Rose%')
      AND (NOT Account.Name LIKE '%DXC Technology%')
    ORDER BY CloseDate DESC
  `;
  
  // Categorize by Revenue_Type__c and Contract_Term_Months__c
  // LOI = Commitment (letters of intent to spend $X over specified period)
  // Revenue = Recurring OR (Project with term >= 12 months)
  // Pilot = Project with term < 12 months (short-term revenue deal)
  const categorizeByRevenueType = (revType, contractTermMonths) => {
    if (!revType) {
      // If no revenue type, check contract term
      if (!contractTermMonths || contractTermMonths === 0) return 'loi';
      return contractTermMonths < 12 ? 'pilot' : 'project';
    }
    const rt = revType.toLowerCase().trim();
    // LOI = Commitment
    if (rt === 'commitment') return 'loi';
    // Revenue = Recurring (ARR)
    if (rt === 'recurring' || rt === 'arr') return 'revenue';
    // Project = Project type (any term length)
    if (rt === 'project') {
      // Pilot is for short-term projects < 12 months
      if (contractTermMonths && contractTermMonths < 12) return 'pilot';
      return 'project'; // Project category for >= 12 months or no term specified
    }
    // Default: check contract term
    if (!contractTermMonths || contractTermMonths === 0) return 'loi';
    return contractTermMonths < 12 ? 'pilot' : 'project';
  };
  
  let signedByType = { revenue: [], project: [], pilot: [], loi: [] };
  let signedDealsTotal = { revenue: 0, project: 0, pilot: 0, loi: 0 };
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
    // FIRST: Query Accounts by First_Deal_Closed__c for signed logos by quarter
    const signedAccountsData = await query(signedAccountsQuery, true);
    console.log(`[Dashboard] Signed Accounts (First_Deal_Closed__c) returned ${signedAccountsData?.records?.length || 0} records`);
    
    if (signedAccountsData?.records) {
      signedAccountsData.records.forEach(acc => {
        const accountName = acc.Name;
        if (!accountName || isSampleAccount(accountName)) return;
        if (!acc.First_Deal_Closed__c) return;
        
        const closeDate = new Date(acc.First_Deal_Closed__c);
        const month = closeDate.getMonth(); // 0-11
        const year = closeDate.getFullYear();
        
        // Fiscal quarter logic: Q4 = Nov-Jan, Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct
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
    }
    
    console.log(`[Dashboard] Signed by fiscal quarter: Q4 2025 QTD=${signedByFiscalQuarter['Q4 2025 (QTD)']?.size || 0}, Q3 2025=${signedByFiscalQuarter['Q3 2025']?.size || 0}, Total=${Array.from(Object.values(signedByFiscalQuarter)).reduce((sum, set) => sum + set.size, 0)}`);
    
    // SECOND: Query Opportunities for Revenue/Pilot/LOI categorization
    const signedData = await query(signedDealsQuery, true);
    console.log(`[Dashboard] All Closed Won Opportunities returned ${signedData?.records?.length || 0} records`);
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
          revenueType: opp.Revenue_Type__c || '',
          contractTermMonths: opp.Contract_Term_Months__c || null
        };
        
        const category = categorizeByRevenueType(deal.revenueType, deal.contractTermMonths);
        signedByType[category].push(deal);
        signedDealsTotal[category] += deal.acv;
      });
    }
    console.log(`[Dashboard] All Closed Won by type: revenue=${signedByType.revenue.length}, project=${signedByType.project.length}, pilot=${signedByType.pilot.length}, loi=${signedByType.loi.length}`);
    
    // Query last 60 days deals for Top Co section (includes Recurring, Project, Pilot)
    const novDecData = await query(novDecDealsQuery, true);
    console.log(`[Dashboard] Last 60 Days Closed Won returned ${novDecData?.records?.length || 0} records`);
    if (novDecData?.records) {
      novDecData.records.forEach(opp => {
        const accountName = opp.Account?.Name || 'Unknown';
        // Skip sample/test accounts
        if (isSampleAccount(accountName)) return;
        
        const revType = (opp.Revenue_Type__c || '').toLowerCase().trim();
        // Include Recurring, Project, and Pilot deals (already filtered in query)
        novDecRevenue.push({
          accountName,
          oppName: opp.Name || '',
          closeDate: opp.CloseDate,
          acv: opp.ACV__c || 0,
          product: opp.Product_Line__c || '',
          revenueType: opp.Revenue_Type__c || '',
          aiEnabled: opp.Eudia_Tech__c || false
        });
        novDecRevenueTotal += opp.ACV__c || 0;
      });
    }
    console.log(`[Dashboard] Last 60 Days Revenue deals: ${novDecRevenue.length}, total: $${novDecRevenueTotal}`);
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
  
  let logosByType = { revenue: [], project: [], pilot: [], loi: [] };
  
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
        if (ct.includes('revenue') || ct === 'arr' || ct === 'recurring') {
          logosByType.revenue.push({ accountName: acc.Name });
        } else if (ct.includes('project')) {
          logosByType.project.push({ accountName: acc.Name });
        } else if (ct.includes('pilot')) {
          logosByType.pilot.push({ accountName: acc.Name });
        } else if (ct.includes('loi') || ct === 'commitment') {
          logosByType.loi.push({ accountName: acc.Name });
        }
      });
    }
    console.log(`[Dashboard] Logos by type: revenue=${logosByType.revenue.length}, project=${logosByType.project.length}, pilot=${logosByType.pilot.length}, loi=${logosByType.loi.length}`);
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
  // Check for closed Commitment/LOI deals on each Revenue account
  // ═══════════════════════════════════════════════════════════════════════
  const loiHistoryQuery = `
    SELECT Account.Name, Revenue_Type__c
    FROM Opportunity
    WHERE Revenue_Type__c = 'Commitment' AND IsClosed = true AND IsWon = true
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
  // Fetches Closed_Lost_Reason__c and Closed_Lost_Detail__c for display
  // ═══════════════════════════════════════════════════════════════════════
  const closedLostQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, Closed_Lost_Detail__c, Closed_Lost_Reason__c,
           LastModifiedDate, Owner.Name, Description
    FROM Opportunity
    WHERE (StageName = 'Closed Lost' OR StageName = 'Stage 7. Closed Lost' OR StageName = 'Stage 7 - Closed Lost')
      AND LastModifiedDate >= LAST_N_DAYS:7
    ORDER BY LastModifiedDate DESC
    LIMIT 20
  `;
  
  let closedLostDeals = [];
  
  try {
    const closedLostData = await query(closedLostQuery, true);
    console.log(`[Dashboard] Closed Lost This Week query returned ${closedLostData?.records?.length || 0} records`);
    
    if (closedLostData?.records && closedLostData.records.length > 0) {
      // Log sample record to debug field names and values
      const sample = closedLostData.records[0];
      console.log(`[Dashboard] Sample Closed Lost record:`, {
        account: sample.Account?.Name,
        oppName: sample.Name,
        stage: sample.StageName,
        reason: sample.Closed_Lost_Reason__c,
        reasonAlt: sample.Lost_Reason__c,
        detail: sample.Closed_Lost_Detail__c,
        detailAlt: sample.Lost_Detail__c,
        description: sample.Description ? sample.Description.substring(0, 100) : null,
        lastModified: sample.LastModifiedDate
      });
      
      closedLostData.records.forEach(opp => {
        const reason = opp.Closed_Lost_Reason__c || opp.Lost_Reason__c || 'Closed Lost';
        const detail = opp.Closed_Lost_Detail__c || opp.Lost_Detail__c || opp.Description || '-';
        closedLostDeals.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          closedLostDetail: detail,
          closedLostReason: reason,
          acv: opp.ACV__c || 0,
          owner: opp.Owner?.Name || '',
          closedDate: opp.LastModifiedDate
        });
      });
      
      console.log(`[Dashboard] Closed Lost deals processed: ${closedLostDeals.length} with actual Reason/Detail`);
    } else {
      console.log(`[Dashboard] No Closed Lost opportunities found - only showing Nurtured accounts`);
    }
  } catch (e) { 
    console.error('Closed Lost query error:', e.message);
    // Fallback to empty - no hardcoded data
    closedLostDeals = [];
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CLOSED WON THIS WEEK - Deals moved to Closed Won stage in last 7 days
  // Uses LastModifiedDate to catch stage changes (not just CloseDate)
  // Filters: Revenue_Type__c = Recurring, Project, or Commitment
  // ═══════════════════════════════════════════════════════════════════════
  const closedWonThisWeekQuery = `
    SELECT Account.Name, Name, ACV__c, Amount, CloseDate, Product_Line__c, 
           Contract_Term_Months__c, TCV__c, Revenue_Type__c, Owner.Name, LastModifiedDate
    FROM Opportunity
    WHERE (StageName = 'Stage 6. Closed Won' OR StageName = 'Stage 6. Closed(Won)' OR StageName = 'Closed Won')
      AND LastModifiedDate >= LAST_N_DAYS:7
      AND Revenue_Type__c IN ('Recurring', 'Project', 'Commitment', 'Pilot')
    ORDER BY Amount DESC
  `;
  
  // Fallback query without Revenue_Type__c filter (catches all closed won this week)
  const closedWonFallbackQuery = `
    SELECT Account.Name, Name, ACV__c, Amount, CloseDate, Product_Line__c, 
           Contract_Term_Months__c, TCV__c, Revenue_Type__c, Owner.Name, LastModifiedDate
    FROM Opportunity
    WHERE (StageName = 'Stage 6. Closed Won' OR StageName = 'Stage 6. Closed(Won)' OR StageName = 'Closed Won')
      AND LastModifiedDate >= LAST_N_DAYS:7
    ORDER BY Amount DESC
  `;
  
  let signedThisWeek = [];
  let signedThisWeekTotal = 0;
  
  try {
    let closedWonData = await query(closedWonThisWeekQuery, true);
    console.log(`[Dashboard] Closed Won This Week (filtered) query returned ${closedWonData?.records?.length || 0} records`);
    
    // If no results with filter, try without filter
    if (!closedWonData?.records || closedWonData.records.length === 0) {
      console.log('[Dashboard] No results with Revenue_Type filter, trying fallback query...');
      closedWonData = await query(closedWonFallbackQuery, true);
      console.log(`[Dashboard] Closed Won Fallback query returned ${closedWonData?.records?.length || 0} records`);
    }
    
    if (closedWonData?.records) {
      closedWonData.records.forEach(opp => {
        const revenue = opp.Amount || opp.ACV__c || 0;
        signedThisWeek.push({
          accountName: opp.Account?.Name || 'Unknown',
          oppName: opp.Name || '',
          acv: opp.ACV__c || 0,
          amount: opp.Amount || 0,
          revenue: revenue,
          tcv: opp.TCV__c || 0,
          termMonths: opp.Contract_Term_Months__c || 12,
          productLine: opp.Product_Line__c || '',
          revenueType: opp.Revenue_Type__c || '',
          owner: opp.Owner?.Name || '',
          closeDate: opp.CloseDate
        });
        signedThisWeekTotal += revenue;
      });
    }
    console.log(`[Dashboard] Signed This Week: ${signedThisWeek.length} deals, Total: $${(signedThisWeekTotal/1000).toFixed(0)}k`);
  } catch (e) { 
    console.error('Closed Won This Week query error:', e.message);
    signedThisWeek = [];
    signedThisWeekTotal = 0;
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
  // CURRENT LOGOS - Accounts with Customer_Type__c = 'Revenue' or 'Pilot' 
  // Fallback: Query unique accounts from Closed Won opportunities
  // ═══════════════════════════════════════════════════════════════════════
  const customerAccountsQuery = `
    SELECT Name, Owner.Name, Customer_Type__c
    FROM Account
    WHERE Customer_Type__c IN ('Revenue', 'Pilot', 'LOI, with $ attached', 'LOI, no $ attached')
    ORDER BY Name ASC
  `;
  
  // Fallback: Get unique accounts from Closed Won opportunities
  const closedWonAccountsQuery = `
    SELECT Account.Name
    FROM Opportunity
    WHERE (StageName = 'Stage 6. Closed Won' OR StageName = 'Stage 6. Closed(Won)' OR StageName = 'Closed Won')
      AND IsWon = true
    ORDER BY Account.Name ASC
  `;
  
  let customerAccounts = [];
  
  try {
    let customerData = await query(customerAccountsQuery, true);
    console.log(`[Dashboard] Customer Accounts (Customer_Type__c) query returned ${customerData?.records?.length || 0} records`);
    
    // If no results from Customer_Type__c, try getting unique accounts from Closed Won opps
    if (!customerData?.records || customerData.records.length === 0) {
      console.log('[Dashboard] No Customer_Type__c customers, trying Closed Won accounts fallback...');
      customerData = await query(closedWonAccountsQuery, true);
      console.log(`[Dashboard] Closed Won Accounts fallback returned ${customerData?.records?.length || 0} records`);
      
      if (customerData?.records) {
        // Get unique account names
        const uniqueAccounts = new Set();
        customerData.records.forEach(opp => {
          if (opp.Account?.Name) uniqueAccounts.add(opp.Account.Name);
        });
        customerAccounts = [...uniqueAccounts].sort().map(name => ({ name, owner: '' }));
      }
    } else {
      // Customer_Type__c query returned results
      if (customerData?.records) {
        customerData.records.forEach(acc => {
          customerAccounts.push({
            name: acc.Name || 'Unknown',
            owner: acc.Owner?.Name || ''
          });
        });
      }
    }
  } catch (e) { 
    console.error('Customer Accounts query error:', e.message);
    customerAccounts = [];
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
  // DAYS IN STAGE - Using Salesforce's Days_in_Stage1__c field (formula field)
  // Top 10 opportunities per stage with longest duration in stage
  // ═══════════════════════════════════════════════════════════════════════
  const daysInStageQuery = `
    SELECT Account.Name, Name, StageName, ACV__c, Days_in_Stage1__c
    FROM Opportunity
    WHERE IsClosed = false
      AND StageName IN ('Stage 1 - Discovery', 'Stage 2 - SQO', 'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation')
    ORDER BY Days_in_Stage1__c DESC NULLS LAST
  `;
  
  let daysInStageByStage = {
    'Stage 1 - Discovery': [],
    'Stage 2 - SQO': [],
    'Stage 3 - Pilot': [],
    'Stage 4 - Proposal': []
  };
  
  try {
    const daysData = await query(daysInStageQuery, true);
    console.log(`[Dashboard] Days in Stage query returned ${daysData?.records?.length || 0} records`);
    if (daysData?.records) {
      daysData.records.forEach(opp => {
        const stage = opp.StageName;
        // Map S5 to S4 for combined reporting
        let displayStage = stage;
        if (stage === 'Stage 4 - Proposal' || stage === 'Stage 5 - Negotiation') {
          displayStage = 'Stage 4 - Proposal';
        }
        if (daysInStageByStage[displayStage]) {
          daysInStageByStage[displayStage].push({
            accountName: opp.Account?.Name || 'Unknown',
            oppName: opp.Name || '',
            acv: opp.ACV__c || 0,
            daysInStage: opp.Days_in_Stage1__c || 0
          });
        }
      });
      // Sort by days in stage descending and keep only top 10 per stage
      Object.keys(daysInStageByStage).forEach(stage => {
        daysInStageByStage[stage].sort((a, b) => b.daysInStage - a.daysInStage);
        daysInStageByStage[stage] = daysInStageByStage[stage].slice(0, 10);
      });
      
      // Manual overrides for specific accounts (static days values)
      const daysOverrides = {
        'USDA': 212,
        'CoreBridge': 199,
        'Corebridge': 199,
        'UK Government': 168,
        'UK government': 168,
        'Southwest Airlines': 167,
        'Intuit': 211
      };
      
      // Apply overrides to all stages
      Object.keys(daysInStageByStage).forEach(stage => {
        daysInStageByStage[stage].forEach(deal => {
          if (daysOverrides[deal.accountName]) {
            deal.daysInStage = daysOverrides[deal.accountName];
          }
        });
        // Re-sort after overrides
        daysInStageByStage[stage].sort((a, b) => b.daysInStage - a.daysInStage);
      });
    }
  } catch (e) { console.error('Days in Stage query error:', e.message); }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PIPELINE BY SALES TYPE & POD - Active pipeline breakdown by deal type
  // ═══════════════════════════════════════════════════════════════════════
  const salesTypeBreakdownQuery = `
    SELECT Owner.Pod__c, Sales_Type__c, SUM(ACV__c) acvSum, SUM(Weighted_ACV__c) weightedSum, COUNT(Id) recordCount
    FROM Opportunity
    WHERE IsClosed = false
      AND ACV__c > 0
    GROUP BY Owner.Pod__c, Sales_Type__c
    ORDER BY Owner.Pod__c, Sales_Type__c
  `;
  
  let salesTypeByPod = {
    'US': {},
    'EU': {}
  };
  let salesTypeTotals = { acv: 0, weighted: 0, count: 0 };
  
  try {
    const salesTypeData = await query(salesTypeBreakdownQuery, true);
    console.log(`[Dashboard] Sales Type Breakdown query returned ${salesTypeData?.records?.length || 0} records`);
    if (salesTypeData?.records) {
      salesTypeData.records.forEach(row => {
        const pod = row.Pod__c || 'Other';
        const salesType = row.Sales_Type__c || 'Unknown';
        const acv = row.acvSum || 0;
        const weighted = row.weightedSum || 0;
        const count = row.recordCount || 0;
        
        if (!salesTypeByPod[pod]) salesTypeByPod[pod] = {};
        salesTypeByPod[pod][salesType] = { acv, weighted, count };
        
        salesTypeTotals.acv += acv;
        salesTypeTotals.weighted += weighted;
        salesTypeTotals.count += count;
      });
    }
  } catch (e) { 
    console.error('Sales Type Breakdown query error:', e.message);
  }
  
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
                               Target_LOI_Date__c, Johnson_Hana_Owner__c, Eudia_Tech__c, Sales_Type__c
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
      
      // Query meetings from today onwards, then filter to only future dates in JavaScript
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
      
      // Process next meetings - filter to only future dates (after today)
      const processedNext = new Set();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (nextMeetings && nextMeetings.records) {
        nextMeetings.records.forEach(m => {
          if (m.AccountId) {
            const meetingDate = new Date(m.ActivityDate);
            meetingDate.setHours(0, 0, 0, 0);
            
            // Only process meetings that are actually in the future (after today)
            if (meetingDate > today) {
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
        isJohnsonHana: !!opp.Johnson_Hana_Owner__c, // Track if this is a JH opportunity
        hasEudiaTech: false // Track AI Enabled (Eudia_Tech__c)
      });
      if (opp.Account?.Is_New_Logo__c) newLogoCount++;
    }
    
    const account = accountMap.get(accountName);
    account.opportunities.push(opp);
    account.totalACV += (opp.ACV__c || 0); // SUM the ACVs!
    account.weightedACV += (opp.Weighted_ACV__c || 0);
    // Track AI Enabled - if any opp has Eudia_Tech__c, mark account as AI Enabled
    if (opp.Eudia_Tech__c) account.hasEudiaTech = true;
    
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
  // FIXED: Blend Stage 5 into Stage 4 for consistent reporting
  const stageBreakdown = {
    'Stage 4 - Proposal': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 3 - Pilot': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 2 - SQO': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 1 - Discovery': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 0 - Qualifying': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 },
    'Stage 5 - Negotiation': { accounts: [], totalACV: 0, weightedACV: 0, count: 0 } // Blended into S4 for display
  };
  
  pipelineData.records.forEach(r => {
    if (stageBreakdown[r.StageName]) {
      stageBreakdown[r.StageName].totalACV = r.GrossAmount || 0;
      stageBreakdown[r.StageName].weightedACV = r.WeightedAmount || 0;
      stageBreakdown[r.StageName].count = r.DealCount || 0;
    }
  });
  
  // Blend Stage 5 into Stage 4 for reporting consistency, then ZERO OUT Stage 5 to prevent double-counting
  stageBreakdown['Stage 4 - Proposal'].totalACV += stageBreakdown['Stage 5 - Negotiation'].totalACV;
  stageBreakdown['Stage 4 - Proposal'].weightedACV += stageBreakdown['Stage 5 - Negotiation'].weightedACV;
  stageBreakdown['Stage 4 - Proposal'].count += stageBreakdown['Stage 5 - Negotiation'].count;
  // Zero out Stage 5 after blending to prevent double-counting in stageWoW calculations
  stageBreakdown['Stage 5 - Negotiation'].totalACV = 0;
  stageBreakdown['Stage 5 - Negotiation'].weightedACV = 0;
  stageBreakdown['Stage 5 - Negotiation'].count = 0;
  
  // Group by BL with stage breakdown
  const blBreakdown = {};
  const stageOrder = ['Stage 5 - Negotiation', 'Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery', 'Stage 0 - Qualifying'];
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
<title>Eudia GTM Dashboard</title>
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
#tab-summary:checked ~ .tabs label[for="tab-summary"],
#tab-revenue:checked ~ .tabs label[for="tab-revenue"],
#tab-account-plans:checked ~ .tabs label[for="tab-account-plans"] { background: #8e99e1; color: #fff; }
.tab-content { display: none; }
#tab-topco:checked ~ #topco,
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
.badge-project { background: #f3e8ff; color: #6b21a8; }
.badge-pilot { background: #fef3c7; color: #92400e; }
.badge-loi { background: #fef3c7; color: #d97706; }
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
  <h1>Eudia GTM Dashboard</h1>
  <p>Real-time pipeline overview • Updated ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PT</p>
  <div style="margin-top: 8px; font-size: 0.75rem;">
    <a href="/cheat-sheet" target="_blank" style="color: #1e40af; text-decoration: none; font-weight: 500;">📋 Query Commands</a>
    <span style="color: #d1d5db; margin: 0 8px;">|</span>
    <a href="/account-dashboard/logout" style="color: #9ca3af; text-decoration: none;">🔒 Logout</a>
  </div>
</div>

<!-- Pure CSS Tabs (No JavaScript - CSP Safe) -->
<input type="radio" name="tabs" id="tab-topco" checked style="display: none;">
<input type="radio" name="tabs" id="tab-summary" style="display: none;">
<input type="radio" name="tabs" id="tab-revenue" style="display: none;">
<input type="radio" name="tabs" id="tab-account-plans" style="display: none;">

<div class="tabs">
  <label for="tab-topco" class="tab">Summary</label>
  <label for="tab-summary" class="tab">Pipeline</label>
  <label for="tab-revenue" class="tab">Revenue</label>
  <label for="tab-account-plans" class="tab">Accounts</label>
</div>

<!-- TAB 1: PIPELINE -->
<div id="summary" class="tab-content">
  <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #374151;">
    <strong>Pipeline Overview</strong> — Sales Type breakdown and Product Line details.
  </div>
  
  <!-- SALES TYPE SUMMARY -->
  <div class="stage-section" style="margin-bottom: 16px;">
    <div class="stage-title">Pipeline by Sales Type</div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
      ${(() => {
        // Aggregate by Sales Type from all opportunities
        const salesTypeAgg = {};
        Array.from(accountMap.values()).forEach(acc => {
          acc.opportunities.forEach(opp => {
            const sType = opp.Sales_Type__c || 'Unassigned';
            if (!salesTypeAgg[sType]) salesTypeAgg[sType] = { count: 0, acv: 0, weighted: 0 };
            salesTypeAgg[sType].count++;
            salesTypeAgg[sType].acv += opp.ACV__c || 0;
            salesTypeAgg[sType].weighted += opp.Weighted_ACV__c || 0;
          });
        });
        
        const salesTypeOrder = ['New business', 'Expansion', 'Renewal', 'Eudia Counsel', 'Pilot'];
        const sortedTypes = [...salesTypeOrder.filter(t => salesTypeAgg[t]), ...Object.keys(salesTypeAgg).filter(t => !salesTypeOrder.includes(t)).sort()];
        const fmt = (val) => val >= 1000000 ? '$' + (val / 1000000).toFixed(1) + 'm' : '$' + (val / 1000).toFixed(0) + 'k';
        const colors = { 'New business': '#dbeafe', 'Expansion': '#d1fae5', 'Renewal': '#fef3c7', 'Eudia Counsel': '#e0e7ff', 'Pilot': '#fce7f3' };
        const textColors = { 'New business': '#1e40af', 'Expansion': '#047857', 'Renewal': '#92400e', 'Eudia Counsel': '#4338ca', 'Pilot': '#be185d' };
        
        return sortedTypes.map(type => {
          const data = salesTypeAgg[type] || { count: 0, acv: 0, weighted: 0 };
          const bgColor = colors[type] || '#f3f4f6';
          const txtColor = textColors[type] || '#374151';
          return '<div style="flex: 1; min-width: 140px; background: ' + bgColor + '; padding: 10px; border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.65rem; font-weight: 600; color: ' + txtColor + '; margin-bottom: 4px;">' + type.toUpperCase() + '</div>' +
            '<div style="font-size: 1.1rem; font-weight: 700; color: ' + txtColor + ';">' + fmt(data.acv) + '</div>' +
            '<div style="font-size: 0.6rem; color: ' + txtColor + ';">' + data.count + ' opps • ' + fmt(data.weighted) + ' wtd</div>' +
          '</div>';
        }).join('');
      })()}
    </div>
  </div>
  
  <!-- PRODUCT LINE BREAKDOWN -->
  <div class="stage-section" style="margin-bottom: 16px;">
    <div class="stage-title">Pipeline by Product Line</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; margin-top: 8px;">
      <thead>
        <tr style="background: #1f2937; color: white;">
          <th style="padding: 8px 10px; text-align: left;">Product Line</th>
          <th style="padding: 8px 10px; text-align: right;">Sum of ACV</th>
          <th style="padding: 8px 10px; text-align: right;">Weighted ACV</th>
          <th style="padding: 8px 10px; text-align: center;">Opps</th>
        </tr>
      </thead>
      <tbody>
        ${(() => {
          const fmt = (val) => val >= 1000000 ? '$' + (val / 1000000).toFixed(2) + 'm' : '$' + (val / 1000).toFixed(0) + 'k';
          
          // Sort product breakdown by ACV, put Undetermined last
          const sortedProducts = Object.entries(productBreakdown)
            .filter(([name]) => name && name !== 'Undetermined')
            .sort((a, b) => b[1].totalACV - a[1].totalACV);
          if (productBreakdown['Undetermined']) {
            sortedProducts.push(['Undetermined', productBreakdown['Undetermined']]);
          }
          
          let totalACV = 0, totalWeighted = 0, totalCount = 0;
          sortedProducts.forEach(([,data]) => {
            totalACV += data.totalACV || 0;
            totalWeighted += data.weightedACV || 0;
            totalCount += data.count || 0;
          });
          
          const rows = sortedProducts.map(([name, data]) => {
            return '<tr style="border-bottom: 1px solid #e5e7eb;">' +
              '<td style="padding: 6px 10px;">' + formatProductLine(name) + '</td>' +
              '<td style="padding: 6px 10px; text-align: right;">' + fmt(data.totalACV) + '</td>' +
              '<td style="padding: 6px 10px; text-align: right;">' + fmt(data.weightedACV) + '</td>' +
              '<td style="padding: 6px 10px; text-align: center;">' + data.count + '</td>' +
            '</tr>';
          }).join('');
          
          return rows + '<tr style="font-weight: 600; background: #e5e7eb;">' +
            '<td style="padding: 6px 10px;">Total</td>' +
            '<td style="padding: 6px 10px; text-align: right;">' + fmt(totalACV) + '</td>' +
            '<td style="padding: 6px 10px; text-align: right;">' + fmt(totalWeighted) + '</td>' +
            '<td style="padding: 6px 10px; text-align: center;">' + totalCount + '</td>' +
          '</tr>';
        })()}
      </tbody>
    </table>
  </div>
  
  <!-- ACCOUNTS BY STAGE -->
  <div class="stage-section">
    <div class="stage-title">Late Stage (${late.length})</div>
    <div class="account-list" id="late-stage-list">
${late.map((acc, idx) => {
        let badge = '';
        const legacyDot = '';
        const aiEnabledBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;" title="AI Enabled"></span>' : '';
        
        if (acc.isNewLogo) {
          badge = '<span class="badge badge-new">New</span>';
        } else if (acc.customerType) {
          const type = acc.customerType.toLowerCase();
          if (type.includes('revenue') || type === 'arr' || type === 'recurring') {
            badge = '<span class="badge badge-revenue">Revenue</span>';
          } else if (type.includes('project')) {
            badge = '<span class="badge badge-project">Project</span>';
          } else if (type.includes('pilot')) {
            badge = '<span class="badge badge-pilot">Pilot</span>';
          } else if (type.includes('loi') || type === 'commitment') {
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
        const productList = products.map(p => formatProductLine(p)).join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #34d399; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + legacyDot + aiEnabledBadge + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (!acc.isLegacy && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Prior:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : (lastMeetingDate ? '<div style="margin-top: 4px; color: #991b1b;"><strong>📭 No next meeting scheduled</strong></div>' : '')) + '</div>' : '') +
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
        const aiEnabledBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;" title="AI Enabled"></span>' : '';
        
        if (acc.isNewLogo) {
          badge = '<span class="badge badge-new">New</span>';
        } else if (acc.customerType) {
          const type = acc.customerType.toLowerCase();
          if (type.includes('revenue') || type === 'arr' || type === 'recurring') {
            badge = '<span class="badge badge-revenue">Revenue</span>';
          } else if (type.includes('project')) {
            badge = '<span class="badge badge-project">Project</span>';
          } else if (type.includes('pilot')) {
            badge = '<span class="badge badge-pilot">Pilot</span>';
          } else if (type.includes('loi') || type === 'commitment') {
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
        const productList = products.map(p => formatProductLine(p)).join(', ') || 'TBD';
        
        return '<details class="summary-expandable" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid #3b82f6; padding: 10px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; font-size: 0.875rem;">' +
            '<div class="account-name">' + acc.name + legacyDot + aiEnabledBadge + ' ' + badge + '</div>' +
            '<div class="account-owner">' + acc.owner + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + ' • ' + acvDisplay + '</div>' +
          '</summary>' +
          '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
            (!acc.isLegacy && (lastMeetingDate || nextMeetingDate) ? '<div style="background: #ecfdf5; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #065f46;">' + (lastMeetingDate ? '<div><strong>📅 Prior:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div style="margin-top: 4px;"><strong>📅 Next:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : (lastMeetingDate ? '<div style="margin-top: 4px; color: #991b1b;"><strong>📭 No next meeting scheduled</strong></div>' : '')) + '</div>' : '') +
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
              ${['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery'].filter(s => bl.byStage[s]?.count > 0).map(stage => 
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
                const order = ['Stage 4 - Proposal', 'Stage 3 - Pilot', 'Stage 2 - SQO', 'Stage 1 - Discovery'];
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
    <div class="stage-subtitle">${combinedRevenue.length} revenue • ${signedByType.project.length} project • ${signedByType.pilot.length} pilot • ${signedByType.loi.length} LOI</div>
    <div style="font-size: 0.6rem; color: #6b7280; margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 4px;">
      <strong>Revenue:</strong> Recurring/ARR subscription contracts &nbsp;|&nbsp;
      <strong>Project:</strong> Long-term project deals (12+ months) &nbsp;|&nbsp;
      <strong>Pilot:</strong> Short-term deals (less than 12 months) &nbsp;|&nbsp;
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
    
    ${signedByType.project.length > 0 ? `
    <details open style="margin-bottom: 12px;">
      <summary style="background: #7c3aed; padding: 8px 12px; border-radius: 6px 6px 0 0; font-size: 0.75rem; font-weight: 700; color: #fff; display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
        <span>PROJECT</span>
        <span>${formatCurrency(signedDealsTotal.project)} • ${signedByType.project.length} deal${signedByType.project.length !== 1 ? 's' : ''}</span>
      </summary>
      <div style="padding: 0 12px 12px 12px; background: #faf5ff; border-radius: 0 0 6px 6px;">
      ${signedByType.project.slice(0, 5).map(d => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3e8ff; font-size: 0.75rem;">
          <span style="font-weight: 500;">${d.accountName}</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
            <span style="color: #6b21a8; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
          </div>
        </div>
      `).join('')}
      ${signedByType.project.length > 5 ? `
        <details style="margin-top: 4px;">
          <summary style="font-size: 0.65rem; color: #6b21a8; cursor: pointer; padding: 4px 0;">+${signedByType.project.length - 5} more deals ›</summary>
          ${signedByType.project.slice(5).map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3e8ff; font-size: 0.75rem;">
              <span style="font-weight: 500;">${d.accountName}</span>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="color: #6b7280; font-size: 0.65rem;">${formatDateAbbrev(d.closeDate)}</span>
                <span style="color: #6b21a8; font-weight: 600; min-width: 55px; text-align: right;">${formatCurrency(d.acv)}</span>
              </div>
            </div>
          `).join('')}
        </details>` : ''}
      </div>
    </details>` : ''}
    
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
    
    ${signedByType.revenue.length === 0 && signedByType.project.length === 0 && signedByType.pilot.length === 0 && signedByType.loi.length === 0 ? '<div style="text-align: center; color: #9ca3af; padding: 16px; font-size: 0.8rem;">No closed deals in last 90 days</div>' : ''}
  </div>
</div>

<!-- TAB 4: ACCOUNTS -->
<div id="account-plans" class="tab-content">
  <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem; color: #374151;">
    <strong>All Accounts</strong> — Current active accounts and pipeline. Totals based on Salesforce Customer_Type__c field.
  </div>
  
  <!-- Logos by Customer Type - Using consistent logosByType data -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;">
    <!-- REVENUE Tile -->
    <div style="background: #f0fdf4; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #059669;">REVENUE</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #15803d;">${logosByType.revenue.length}</div>
      </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Recurring/ARR contracts</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #059669; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.revenue.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
      </div>
    
    <!-- PROJECT Tile -->
    <div style="background: #faf5ff; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #7c3aed;">PROJECT</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #6b21a8;">${logosByType.project.length}</div>
    </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Long-term projects (12+ mo)</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #7c3aed; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.project.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
    </div>
    
    <!-- PILOT Tile -->
    <div style="background: #eff6ff; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #2563eb;">PILOT</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af;">${logosByType.pilot.length}</div>
    </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Short-term deals (< 12 mo)</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #2563eb; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.pilot.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
    </div>
      </details>
    </div>
    
    <!-- LOI Tile -->
    <div style="background: #fef3c7; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.7rem; font-weight: 700; color: #d97706;">LOI</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #92400e;">${logosByType.loi.length}</div>
      </div>
      <div style="font-size: 0.55rem; color: #6b7280; margin: 4px 0;">Signed LOI, pending contract</div>
      <details style="font-size: 0.6rem; color: #6b7280;">
        <summary style="cursor: pointer; color: #d97706; font-weight: 500;">View accounts ›</summary>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 200px; overflow-y: auto;">
          ${logosByType.loi.map(a => '<div style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">' + a.accountName + '</div>').sort().join('') || '-'}
        </div>
      </details>
    </div>
  </div>
  
  <!-- Total Signed Logos Summary -->
  <div style="background: #1f2937; color: white; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 0.75rem; font-weight: 600;">Total Signed Logos</span>
    <span style="font-size: 1rem; font-weight: 700;">${logosByType.revenue.length + logosByType.project.length + logosByType.pilot.length + logosByType.loi.length}</span>
  </div>
  
  <div class="section-card" style="padding: 12px; margin-bottom: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <div class="stage-title" style="margin: 0;">Account Plans & Pipeline</div>
      <div style="font-size: 0.7rem; color: #6b7280;">${accountsWithPlans} have plans</div>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 0.6rem; color: #9ca3af;">
      <span><strong style="color: #22c55e;">Revenue</strong> = ARR/Recurring</span>
      <span><strong style="color: #7c3aed;">Project</strong> = Long-term (12+ mo)</span>
      <span><strong style="color: #2563eb;">Pilot</strong> = Short-term (&lt;12 mo)</span>
      <span><strong style="color: #d97706;">LOI</strong> = Signed commitment</span>
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
            if (type.includes('revenue') || type === 'arr' || type === 'recurring') {
              badge = '<span class="badge badge-revenue">Revenue</span>';
            } else if (type.includes('project')) {
              badge = '<span class="badge badge-project">Project</span>';
            } else if (type.includes('pilot')) {
              badge = '<span class="badge badge-pilot">Pilot</span>';
            } else if (type.includes('loi') || type === 'commitment') {
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
          const productList = products.map(p => formatProductLine(p)).join(', ') || 'TBD';
        
          return '<details class="account-expandable" data-account="' + acc.name.toLowerCase() + '" style="display: ' + (idx < 10 ? 'block' : 'none') + '; background: #fff; border-left: 3px solid ' + (acc.highestStage >= 3 ? '#34d399' : acc.highestStage === 2 ? '#3b82f6' : '#f59e0b') + '; padding: 12px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid #e5e7eb;">' +
            '<summary style="list-style: none; display: flex; justify-content: space-between; align-items: center;">' +
              '<div style="flex: 1;">' +
                '<div style="font-weight: 600; font-size: 0.9375rem; color: #1f2937;">' +
                  planIcon + acc.name + ' ' + badge +
                '</div>' +
                '<div style="font-size: 0.8125rem; color: #6b7280; margin-top: 2px;">' +
                  acc.owner + ' • Stage ' + acc.highestStage + ' • ' + acc.opportunities.length + ' opp' + (acc.opportunities.length > 1 ? 's' : '') + (lastMeetingDate ? ' • Prior: ' + lastMeetingDate : '') +
                '</div>' +
              '</div>' +
              '<div style="text-align: right;">' +
                '<div style="font-weight: 600; color: #1f2937;">' + acvDisplay + '</div>' +
                '<div style="font-size: 0.75rem; color: #6b7280;">' + products.length + ' product' + (products.length > 1 ? 's' : '') + '</div>' +
              '</div>' +
            '</summary>' +
            '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 0.8125rem;">' +
              (acc.hasAccountPlan ? '<div style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-bottom: 8px;"><strong style="color: #1e40af;">✓ Account Plan</strong><div style="color: #1e40af; margin-top: 4px; font-size: 0.75rem; white-space: pre-wrap;">' + (acc.accountPlan || '') + '</div></div>' : '') +
              (lastMeetingDate || nextMeetingDate ? '<div style="background: #ecfdf5; padding: 10px; border-radius: 4px; margin-bottom: 8px; font-size: 0.8125rem; color: #065f46;">' + (lastMeetingDate ? '<div style="margin-bottom: 4px;"><strong>📅 Prior Meeting:</strong> ' + lastMeetingDate + (lastMeetingSubject ? ' - ' + lastMeetingSubject : '') + '</div>' : '') + (nextMeetingDate ? '<div><strong>📅 Next Meeting:</strong> ' + nextMeetingDate + (nextMeetingSubject ? ' - ' + nextMeetingSubject : '') + '</div>' : (lastMeetingDate ? '<div style="color: #991b1b;"><strong>📭 No next meeting scheduled</strong></div>' : '')) + '</div>' : '<div style="background: #fef2f2; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; color: #991b1b;">📭 No meetings scheduled</div>') +
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
        const aiEnabledBadge = acc.hasEudiaTech ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-left: 4px; vertical-align: middle;" title="AI Enabled"></span>' : '';
        
        return '<details class="account-expandable" data-account="' + acc.name.toLowerCase() + '" style="display: none; background: #fff; border-left: 3px solid #9ca3af; padding: 12px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid #e5e7eb;">' +
          '<summary style="list-style: none; display: flex; justify-content: space-between; align-items: center;">' +
            '<div style="flex: 1;">' +
              '<div style="font-weight: 600; font-size: 0.9375rem; color: #1f2937;">' +
                acc.name + ' <span style="color: #9ca3af;">•</span>' + aiEnabledBadge +
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

// Copy Weekly tab for email - FULL DASHBOARD with all sections
function copyWeeklyForEmail() {
  const weeklyTab = document.getElementById('weekly');
  if (!weeklyTab) return;
  
  const formattedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // === EXTRACT ALL DATA FROM DOM ===
  
  // Get signed revenue this week
  const signedRevenueSection = [];
  weeklyTab.querySelectorAll('.weekly-section, [style*="background"]').forEach(section => {
    if (section.textContent.includes('SIGNED REVENUE') || section.textContent.includes('Signed Revenue')) {
      const items = section.querySelectorAll('[style*="padding"]');
      items.forEach(item => {
        const text = item.textContent.trim();
        if (text && text.includes('$') && !text.includes('Total')) {
          signedRevenueSection.push(text);
        }
      });
    }
  });
  
  // Get targeting December deals (first ol.weekly-list)
  const targetingList = weeklyTab.querySelectorAll('ol.weekly-list');
  const targetingDec = targetingList[0] ? Array.from(targetingList[0].querySelectorAll('li')).slice(0, 10).map(li => li.textContent.trim()) : [];
  const targetingDecCount = targetingList[0]?.closest('div')?.querySelector('[style*="font-weight: 600"]')?.textContent?.match(/\\((\\d+)\\)/)?.[1] || targetingDec.length;
  
  // Get Q4 opportunities (second ol.weekly-list)
  const q4Opps = targetingList[1] ? Array.from(targetingList[1].querySelectorAll('li')).slice(0, 10).map(li => li.textContent.trim()) : [];
  const q4Count = targetingList[1]?.closest('div')?.querySelector('[style*="font-weight: 600"]')?.textContent?.match(/\\((\\d+)\\)/)?.[1] || q4Opps.length;
  
  // Extract signed logos by quarter
  const logoQuarters = [];
  weeklyTab.querySelectorAll('details').forEach(d => {
    const summary = d.querySelector('summary');
    if (summary && (summary.textContent.includes('FY') || summary.textContent.includes('Prior'))) {
      const text = summary.textContent.trim();
      const parts = text.match(/(.+?)\\s+(\\d+)$/);
      if (parts) {
        logoQuarters.push({ quarter: parts[1].trim(), count: parts[2] });
      }
    }
  });
  const totalSigned = '81';
  
  // Get run-rate forecast
  const runRateRows = [];
  weeklyTab.querySelectorAll('table.weekly-table tbody tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 2) {
      runRateRows.push({ month: cells[0].textContent.trim(), value: cells[1].textContent.trim() });
    }
  });
  
  // Extract week-over-week change data
  const wowRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Week-over-week Change')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
          wowRows.push({
            stage: cells[0].textContent.trim(),
            acv: cells[1].textContent.trim(),
            acvWow: cells[2].textContent.trim(),
            opps: cells[3].textContent.trim(),
            oppsWow: cells[4].textContent.trim()
          });
        }
      });
    }
  });
  
  // Extract Pipeline by Sales Type (Combined)
  const salesTypeRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Pipeline by Sales Type (Combined)')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
          salesTypeRows.push({
            type: cells[0].textContent.trim(),
            acv: cells[1].textContent.trim(),
            pctAcv: cells[2].textContent.trim(),
            weighted: cells[3].textContent.trim(),
            pctWtd: cells[4].textContent.trim(),
            count: cells[5]?.textContent?.trim() || ''
          });
        }
      });
    }
  });
  
  // Extract Pipeline by Pod
  const podRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Pipeline by Pod') && !section.textContent.includes('Combined')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 4) {
          podRows.push({
            pod: cells[0].textContent.trim(),
            type: cells[1].textContent.trim(),
            acv: cells[2].textContent.trim(),
            weighted: cells[3].textContent.trim(),
            count: cells[4]?.textContent?.trim() || ''
          });
        }
      });
    }
  });
  
  // Extract closed lost this week
  const closedLostRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Closed Lost This Week')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 2) {
          closedLostRows.push({
            name: cells[0].textContent.trim(),
            detail: cells[1].textContent.trim()
          });
        }
      });
    }
  });
  
  // Extract top deals impacting forecast
  const topDeals = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Top Deals Impacting')) {
      section.querySelectorAll('li').forEach((item, i) => {
        if (i < 10 && item.textContent.trim()) {
          topDeals.push(item.textContent.trim());
        }
      });
    }
  });
  
  // Extract longest deals by stage
  const longestDealsText = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Longest Deals by Stage')) {
      section.querySelectorAll('[style*="font-weight: 600"], [style*="margin-bottom"]').forEach(item => {
        const text = item.textContent.trim();
        if (text.startsWith('Stage') || (text.length > 10 && text.includes(','))) {
          longestDealsText.push(text);
        }
      });
    }
  });
  
  // === BUILD FULL EMAIL HTML ===
  const emailHtml = \`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 720px; margin: 0 auto; background: #ffffff;">
  <tr>
    <td style="padding: 24px;">
      
      <!-- Header - Just date, no links -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
        <tr>
          <td style="font-size: 20px; font-weight: 700; color: #111827;">
            RevOps Weekly Update - \${formattedDate}
          </td>
        </tr>
      </table>
      
      <!-- Signed Revenue This Week -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px; background: #f0fdf4; border: 1px solid #bbf7d0;">
        <tr>
          <td style="padding: 16px;">
            <div style="font-size: 13px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 12px;">💰 SIGNED REVENUE SINCE LAST WEEK</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 12px;">
              <tr style="background: #dcfce7;">
                <td style="padding: 8px; font-weight: 600; color: #166534;">Company</td>
                <td style="padding: 8px; font-weight: 600; color: #166534; text-align: right;">Revenue</td>
                <td style="padding: 8px; font-weight: 600; color: #166534;">Type</td>
                <td style="padding: 8px; font-weight: 600; color: #166534;">Product</td>
              </tr>
              <tr><td style="padding: 6px 8px; color: #374151;">Intuit</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$410,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">BNY Mellon</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$360,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">IQVIA</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$250,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">Delinea</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$200,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">Aramark Ireland</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$100,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">Aryza</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$80,000</td><td style="padding: 6px 8px; color: #6b7280;">Recurring</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">Wellspring Philanthropic</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$40,000</td><td style="padding: 6px 8px; color: #6b7280;">Project</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr><td style="padding: 6px 8px; color: #374151;">World Wide Technology</td><td style="padding: 6px 8px; text-align: right; color: #374151;">$20,000</td><td style="padding: 6px 8px; color: #6b7280;">Project</td><td style="padding: 6px 8px; color: #6b7280;">JH</td></tr>
              <tr style="background: #dcfce7; font-weight: 700;">
                <td style="padding: 8px; color: #166534;">Total (8 deals)</td>
                <td style="padding: 8px; text-align: right; color: #166534;">$1,460,000</td>
                <td colspan="2"></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      
      <!-- Section 1: Revenue Forecast -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
        <tr>
          <td style="font-size: 15px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
            1. Revenue Forecast Snapshot
                </td>
              </tr>
      </table>
      
      <!-- Two-column: Targeting Dec + Q4 Opportunities -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
        <tr valign="top">
          <td width="48%" style="padding-right: 8px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9fafb; border: 1px solid #e5e7eb;">
              <tr><td style="background: #1f2937; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">TARGETING DECEMBER (\${targetingDecCount})</td></tr>
              <tr><td style="padding: 3px 12px; font-size: 10px; color: #6b7280;">Deals with Target Sign Date in December 2025</td></tr>
              <tr><td style="padding: 10px 12px; font-size: 11px; color: #374151;">
                \${targetingDec.map((opp, i) => \`<div style="padding: 2px 0;">\${i+1}. \${opp}</div>\`).join('')}
              </td></tr>
            </table>
          </td>
          <td width="48%" style="padding-left: 8px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9fafb; border: 1px solid #e5e7eb;">
              <tr><td style="background: #1f2937; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">TOP Q4 OPPORTUNITIES (\${q4Count})</td></tr>
              <tr><td style="padding: 3px 12px; font-size: 10px; color: #6b7280;">All Q4 FY2025 (Nov 1 - Jan 31)</td></tr>
              <tr><td style="padding: 10px 12px; font-size: 11px; color: #374151;">
                \${q4Opps.map((opp, i) => \`<div style="padding: 2px 0;">\${i+1}. \${opp}</div>\`).join('')}
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 16px;">¹ = Nov, ² = Dec, ³ = Jan target</div>
      
      <!-- Two-column: Signed Logos + Run-Rate -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
        <tr valign="top">
          <td width="48%" style="padding-right: 8px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb;">
              <tr><td colspan="2" style="background: #1f2937; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">SIGNED LOGOS BY QUARTER</td></tr>
              \${logoQuarters.map(q => \`<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 6px 12px; font-size: 12px; color: #374151;">\${q.quarter}</td><td style="padding: 6px 12px; font-size: 12px; color: #374151; text-align: right; font-weight: 600;">\${q.count}</td></tr>\`).join('')}
              <tr style="background: #e5e7eb;"><td style="padding: 6px 12px; font-size: 12px; font-weight: 700; color: #111827;">Total Signed</td><td style="padding: 6px 12px; font-size: 12px; font-weight: 700; color: #111827; text-align: right;">\${totalSigned}</td></tr>
            </table>
            <div style="font-size: 9px; color: #9ca3af; margin-top: 4px;">* Minor adjustments during migration</div>
          </td>
          <td width="48%" style="padding-left: 8px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb;">
              <tr><td colspan="2" style="background: #1f2937; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">RUN-RATE FORECAST ($)</td></tr>
              \${runRateRows.map(r => {
                const isHighlight = r.month.includes('December') || r.month.includes('Q4') || r.month.includes('FY2025');
                const bg = isHighlight ? 'background: #dbeafe;' : '';
                const color = isHighlight ? 'color: #1e40af; font-weight: 600;' : 'color: #374151;';
                return \`<tr style="border-bottom: 1px solid #e5e7eb; \${bg}"><td style="padding: 6px 12px; font-size: 12px; \${color}">\${r.month}</td><td style="padding: 6px 12px; font-size: 12px; text-align: right; \${color}">\${r.value}</td></tr>\`;
              }).join('')}
            </table>
          </td>
        </tr>
      </table>
      
      <!-- Section 2: Gross Pipeline Breakdown -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr>
          <td style="font-size: 15px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
            2. Gross Pipeline Breakdown
          </td>
        </tr>
      </table>
      
      <!-- Week-over-Week Change by Stage -->
      \${wowRows.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr><td style="font-size: 12px; font-weight: 600; color: #374151; padding-bottom: 6px;">Week-over-week Change by Stage</td></tr>
        <tr><td>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 11px;">
              <tr style="background: #1f2937; color: white;">
              <td style="padding: 6px 8px; font-weight: 600;">Stage</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">ACV</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">% WoW</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">Opps</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">% WoW</td>
              </tr>
            \${wowRows.map(r => {
              const isTotal = r.stage.includes('Total');
              const isLate = r.stage.includes('S4');
              const bg = isTotal ? 'background: #e5e7eb; font-weight: 600;' : (isLate ? 'background: #dbeafe;' : '');
              return \`<tr style="border-bottom: 1px solid #e5e7eb; \${bg}"><td style="padding: 5px 8px; color: #374151;">\${r.stage}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.acv}</td><td style="padding: 5px 8px; text-align: center; color: \${r.acvWow.includes('+') ? '#059669' : r.acvWow.includes('-') ? '#dc2626' : '#6b7280'};">\${r.acvWow}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.opps}</td><td style="padding: 5px 8px; text-align: center; color: \${r.oppsWow.includes('+') ? '#059669' : r.oppsWow.includes('-') ? '#dc2626' : '#6b7280'};">\${r.oppsWow}</td></tr>\`;
              }).join('')}
            </table>
        </td></tr>
      </table>\` : ''}
      
      <!-- Pipeline by Sales Type (Combined) -->
      \${salesTypeRows.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr><td style="font-size: 12px; font-weight: 600; color: #374151; padding-bottom: 6px;">Pipeline by Sales Type (Combined)</td></tr>
        <tr><td>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 11px;">
            <tr style="background: #1f2937; color: white;">
              <td style="padding: 6px 8px; font-weight: 600;">Sales Type</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">Sum of ACV</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">% ACV</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">Weighted</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">% Wtd</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">Count</td>
        </tr>
            \${salesTypeRows.map(r => {
              const isTotal = r.type.includes('Total');
              const bg = isTotal ? 'background: #e5e7eb; font-weight: 600;' : '';
              return \`<tr style="border-bottom: 1px solid #e5e7eb; \${bg}"><td style="padding: 5px 8px; color: #374151;">\${r.type}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.acv}</td><td style="padding: 5px 8px; text-align: center; color: #6b7280;">\${r.pctAcv}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.weighted}</td><td style="padding: 5px 8px; text-align: center; color: #6b7280;">\${r.pctWtd}</td><td style="padding: 5px 8px; text-align: center; color: #374151;">\${r.count}</td></tr>\`;
            }).join('')}
      </table>
        </td></tr>
      </table>\` : ''}
      
      <!-- Pipeline by Pod -->
      \${podRows.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr><td style="font-size: 12px; font-weight: 600; color: #374151; padding-bottom: 6px;">Pipeline by Pod</td></tr>
        <tr><td>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 11px;">
            <tr style="background: #1f2937; color: white;">
              <td style="padding: 6px 8px; font-weight: 600;">Pod</td>
              <td style="padding: 6px 8px; font-weight: 600;">Sales Type</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">Sum of ACV</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 600;">Weighted ACV</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: 600;">Count</td>
            </tr>
            \${podRows.map(r => {
              const isTotal = r.pod.includes('Total');
              const bg = isTotal ? 'background: #e5e7eb; font-weight: 600;' : '';
              return \`<tr style="border-bottom: 1px solid #e5e7eb; \${bg}"><td style="padding: 5px 8px; color: #374151;">\${r.pod}</td><td style="padding: 5px 8px; color: #374151;">\${r.type}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.acv}</td><td style="padding: 5px 8px; text-align: right; color: #374151;">\${r.weighted}</td><td style="padding: 5px 8px; text-align: center; color: #374151;">\${r.count}</td></tr>\`;
            }).join('')}
          </table>
        </td></tr>
      </table>\` : ''}
      
      <!-- Closed Lost This Week -->
      \${closedLostRows.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr><td style="font-size: 12px; font-weight: 600; color: #374151; padding-bottom: 6px;">Closed Lost This Week</td></tr>
        <tr><td>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 11px;">
            <tr style="background: #1f2937; color: white;">
              <td style="padding: 6px 8px; font-weight: 600;">Opportunity Name</td>
              <td style="padding: 6px 8px; font-weight: 600;">Closed Lost Detail</td>
            </tr>
            \${closedLostRows.map(r => \`<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 5px 8px; color: #374151;">\${r.name}</td><td style="padding: 5px 8px; color: #6b7280;">\${r.detail}</td></tr>\`).join('')}
          </table>
        </td></tr>
      </table>\` : ''}
      
      <!-- Section 3: Top Deals -->
      \${topDeals.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr>
          <td style="font-size: 15px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
            3. Top Deals Impacting the Forecast
          </td>
        </tr>
        <tr>
          <td style="padding-top: 10px; font-size: 11px; color: #374151;">
            \${topDeals.map((deal, i) => \`<div style="padding: 3px 0;">\${i+1}. \${deal}</div>\`).join('')}
          </td>
        </tr>
      </table>\` : ''}
      
      <!-- Section 4: Longest Deals by Stage -->
      \${longestDealsText.length > 0 ? \`
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
        <tr>
          <td style="font-size: 15px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
            4. Longest Deals by Stage (T10)
          </td>
        </tr>
        <tr>
          <td style="padding-top: 8px; font-size: 10px; color: #6b7280;">
            Top 10 deals per stage • Numbers show days in current stage
          </td>
        </tr>
        <tr>
          <td style="padding-top: 8px; font-size: 11px; color: #374151; line-height: 1.6;">
            \${longestDealsText.map(text => {
              if (text.startsWith('Stage')) {
                return \`<div style="font-weight: 600; margin-top: 8px; color: #111827;">\${text}</div>\`;
              }
              return \`<div style="color: #6b7280; margin-left: 8px;">\${text}</div>\`;
            }).join('')}
          </td>
        </tr>
      </table>\` : ''}
      
    </td>
  </tr>
</table>
</body>
</html>\`;
  
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
    alert('Copy failed. Try using Download HTML instead.');
  });
}

// Download Weekly tab as HTML file - MIRRORS DASHBOARD FORMAT
function downloadWeeklyHTML() {
  const weeklyTab = document.getElementById('weekly');
  if (!weeklyTab) return;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const formattedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // Clone the entire weekly tab
  const clone = weeklyTab.cloneNode(true);
  
  // Remove buttons
  clone.querySelectorAll('button').forEach(btn => btn.remove());
  
  // Remove email copy status
  const status = clone.querySelector('#email-copy-status');
  if (status) status.remove();
  
  // Remove "+X more opportunities" expandable sections and keep only top 10
  clone.querySelectorAll('details').forEach(details => {
    const summary = details.querySelector('summary');
    if (summary && summary.textContent.includes('more opportunities')) {
      details.remove(); // Remove the expandable section entirely
    }
  });
  
  // Convert remaining <details> (like logos by quarter) to static tables
  clone.querySelectorAll('details').forEach(details => {
    const summary = details.querySelector('summary');
    if (summary) {
      // Get the content
      const summaryText = summary.textContent.trim();
      const content = details.querySelector('div');
      
      // Create a static row
      const staticDiv = document.createElement('div');
      staticDiv.style.cssText = 'display: flex; justify-content: space-between; padding: 8px 4px; border-bottom: 1px solid #e5e7eb;';
      
      // Parse quarter and count
      const match = summaryText.match(/(.+?)\\s+(\\d+)$/);
      if (match) {
        staticDiv.innerHTML = \`<span style="color: #374151;">\${match[1].trim()}</span><span style="font-weight: 600; color: #374151;">\${match[2]}</span>\`;
      } else {
        staticDiv.innerHTML = \`<span style="color: #374151;">\${summaryText}</span>\`;
      }
      
      // Replace details with static div
      details.parentNode.replaceChild(staticDiv, details);
    }
  });
  
  // Limit opportunity lists to top 10
  clone.querySelectorAll('ol.weekly-list').forEach(ol => {
    const items = ol.querySelectorAll('li');
    items.forEach((li, i) => {
      if (i >= 10) li.remove();
    });
  });
  
  // Build standalone HTML
  const html = \`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RevOps Weekly Summary - \${formattedDate}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 20px auto; padding: 20px; background: #f9fafb; color: #1f2937; }
    .weekly-section { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .weekly-section-title { font-size: 14px; font-weight: 700; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
    .weekly-subsection { margin-bottom: 16px; }
    .weekly-subsection-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #1f2937; color: white; font-weight: 700; }
    .weekly-table th { background: #1f2937; color: white; }
    ol.weekly-list { margin: 0; padding-left: 20px; }
    ol.weekly-list li { padding: 3px 0; font-size: 13px; color: #374151; }
  </style>
</head>
<body>
  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="margin: 0 0 8px 0; font-size: 1.25rem; color: #111827;">RevOps Weekly Summary</h1>
    <p style="margin: 0; color: #6b7280; font-size: 0.875rem;">\${formattedDate}</p>
  </div>
  \${clone.innerHTML}
</body>
</html>\`;
  
  // Create download
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`revops-weekly-\${formattedDate.replace(/,?\\s+/g, '-')}.html\`;
  a.click();
  URL.revokeObjectURL(url);
}

// LEGACY CODE BELOW - kept for reference but not used
function downloadWeeklyHTML_legacy() {
  const weeklyTab = document.getElementById('weekly');
  if (!weeklyTab) return;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const formattedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // Helper to extract text
  const getText = (selector) => weeklyTab.querySelector(selector)?.textContent?.trim() || '';
  
  // Extract TOP OPPORTUNITIES - only first 10 from each section
  const extractTopOpps = (containerSelector, limit = 10) => {
    const container = weeklyTab.querySelector(containerSelector);
    if (!container) return [];
    const items = container.querySelectorAll('li, [style*="display: flex"]');
    const opps = [];
    items.forEach((item, i) => {
      if (i < limit && item.textContent.trim()) {
        opps.push(item.textContent.trim().replace(/^\\d+\\.\\s*/, ''));
      }
    });
    return opps;
  };
  
  // Get targeting December deals (first ol.weekly-list)
  const targetingList = weeklyTab.querySelectorAll('ol.weekly-list');
  const targetingDec = targetingList[0] ? Array.from(targetingList[0].querySelectorAll('li')).slice(0, 10).map(li => li.textContent.trim()) : [];
  const targetingDecCount = targetingList[0]?.closest('div')?.querySelector('[style*="font-weight: 600"]')?.textContent?.match(/\\((\\d+)\\)/)?.[1] || targetingDec.length;
  
  // Get Q4 opportunities (second ol.weekly-list) 
  const q4Opps = targetingList[1] ? Array.from(targetingList[1].querySelectorAll('li')).slice(0, 10).map(li => li.textContent.trim()) : [];
  const q4Count = targetingList[1]?.closest('div')?.querySelector('[style*="font-weight: 600"]')?.textContent?.match(/\\((\\d+)\\)/)?.[1] || q4Opps.length;
  
  // Extract signed logos by quarter from details elements
  const logoQuarters = [];
  weeklyTab.querySelectorAll('details').forEach(d => {
    const summary = d.querySelector('summary');
    if (summary && (summary.textContent.includes('FY') || summary.textContent.includes('Prior'))) {
      const text = summary.textContent.trim();
      const parts = text.match(/(.+?)\\s+(\\d+)$/);
      if (parts) {
        logoQuarters.push({ quarter: parts[1].trim(), count: parts[2] });
      }
    }
  });
  
  // Get total signed
  const totalSignedEl = weeklyTab.querySelector('[style*="Total Signed"]');
  const totalSigned = totalSignedEl?.nextElementSibling?.textContent?.trim() || 
                      weeklyTab.querySelector('[style*="Total Signed"] ~ span')?.textContent?.trim() || '81';
  
  // Extract run-rate forecast
  const runRateRows = [];
  weeklyTab.querySelectorAll('table.weekly-table tbody tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 2) {
      runRateRows.push({ month: cells[0].textContent.trim(), value: cells[1].textContent.trim() });
    }
  });
  
  // Extract week-over-week change data
  const wowRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Week-over-week Change')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
          wowRows.push({
            stage: cells[0].textContent.trim(),
            acv: cells[1].textContent.trim(),
            acvWow: cells[2].textContent.trim(),
            opps: cells[3].textContent.trim(),
            oppsWow: cells[4].textContent.trim()
          });
        }
      });
    }
  });
  
  // Extract Pipeline by Sales Type (Combined)
  const salesTypeRows = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Pipeline by Sales Type (Combined)')) {
      section.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
          salesTypeRows.push({
            type: cells[0].textContent.trim(),
            acv: cells[1].textContent.trim(),
            pctAcv: cells[2].textContent.trim(),
            weighted: cells[3].textContent.trim(),
            pctWtd: cells[4].textContent.trim(),
            count: cells[5]?.textContent?.trim() || ''
          });
        }
      });
    }
  });
  
  // Extract top deals impacting forecast
  const topDeals = [];
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Top Deals Impacting')) {
      section.querySelectorAll('li, [style*="padding: 4px"]').forEach((item, i) => {
        if (i < 10 && item.textContent.trim()) {
          topDeals.push(item.textContent.trim());
        }
      });
    }
  });
  
  // Extract longest deals by stage
  const longestDeals = {};
  weeklyTab.querySelectorAll('.weekly-subsection').forEach(section => {
    if (section.textContent.includes('Longest Deals by Stage')) {
      let currentStage = '';
      section.querySelectorAll('li, [style*="font-weight: 600"]').forEach(item => {
        const text = item.textContent.trim();
        if (text.startsWith('Stage')) {
          currentStage = text;
          longestDeals[currentStage] = [];
        } else if (currentStage && text && !text.includes('Top 10')) {
          longestDeals[currentStage].push(text);
        }
      });
    }
  });
  
  // Build static email-optimized HTML
  const html = \`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RevOps \${timestamp} Weekly Update Preview</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 700px; margin: 0 auto; background: #ffffff;">
    <tr>
      <td style="padding: 24px;">
        
        <!-- Header -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
          <tr>
            <td style="font-size: 20px; font-weight: 700; color: #111827;">
              RevOps Weekly Summary
            </td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #6b7280; padding-top: 4px;">
              \${formattedDate}
            </td>
          </tr>
        </table>
        
        <!-- Section 1: Revenue Forecast -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 28px;">
          <tr>
            <td style="font-size: 14px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
              1. Revenue Forecast Snapshot
            </td>
          </tr>
        </table>
        
        <!-- Two-column layout for Targeting Dec + Q4 Opportunities -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
          <tr valign="top">
            <!-- Targeting December -->
            <td width="48%" style="padding-right: 12px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9fafb; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="background: #1f2937; color: white; padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    TARGETING DECEMBER (\${targetingDecCount})
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 12px; font-size: 11px; color: #6b7280;">Deals with Target Sign Date in December 2025</td>
                </tr>
                <tr>
                  <td style="padding: 12px; font-size: 12px; color: #374151;">
                    \${targetingDec.map((opp, i) => \`<div style="padding: 3px 0;">\${i+1}. \${opp}</div>\`).join('')}
                  </td>
                </tr>
              </table>
            </td>
            <!-- Q4 Opportunities -->
            <td width="48%" style="padding-left: 12px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9fafb; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="background: #1f2937; color: white; padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    TOP Q4 OPPORTUNITIES (\${q4Count})
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 12px; font-size: 11px; color: #6b7280;">All Q4 FY2025 (Nov 1 - Jan 31)</td>
                </tr>
                <tr>
                  <td style="padding: 12px; font-size: 12px; color: #374151;">
                    \${q4Opps.map((opp, i) => \`<div style="padding: 3px 0;">\${i+1}. \${opp}</div>\`).join('')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size: 11px; color: #9ca3af; padding-bottom: 20px;">¹ = Nov, ² = Dec, ³ = Jan target</td></tr>
        </table>
        
        <!-- Two-column: Signed Logos + Run-Rate Forecast -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
          <tr valign="top">
            <!-- Signed Logos by Quarter -->
            <td width="48%" style="padding-right: 12px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb;">
                <tr>
                  <td colspan="2" style="background: #1f2937; color: white; padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    SIGNED LOGOS BY QUARTER
                  </td>
                </tr>
                \${logoQuarters.map(q => \`
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 12px; font-size: 13px; color: #374151;">\${q.quarter}</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #374151; text-align: right; font-weight: 600;">\${q.count}</td>
                </tr>\`).join('')}
                <tr style="background: #e5e7eb;">
                  <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #111827;">Total Signed</td>
                  <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #111827; text-align: right;">\${totalSigned}</td>
                </tr>
              </table>
              <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">* Minor adjustments during migration</div>
            </td>
            <!-- Run-Rate Forecast -->
            <td width="48%" style="padding-left: 12px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb;">
                <tr>
                  <td colspan="2" style="background: #1f2937; color: white; padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    RUN-RATE FORECAST ($)
                  </td>
                </tr>
                \${runRateRows.map(r => {
                  const isHighlight = r.month.includes('December') || r.month.includes('Q4') || r.month.includes('FY2025');
                  const bgColor = isHighlight ? 'background: #dbeafe;' : '';
                  const textColor = isHighlight ? 'color: #1e40af; font-weight: 600;' : 'color: #374151;';
                  return \`
                <tr style="border-bottom: 1px solid #e5e7eb; \${bgColor}">
                  <td style="padding: 8px 12px; font-size: 13px; \${textColor}">\${r.month}</td>
                  <td style="padding: 8px 12px; font-size: 13px; text-align: right; \${textColor}">\${r.value}</td>
                </tr>\`;
                }).join('')}
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Section 2: Gross Pipeline Breakdown -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td style="font-size: 14px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
              2. Gross Pipeline Breakdown
            </td>
          </tr>
        </table>
        
        <!-- Week-over-Week Change by Stage -->
        \${wowRows.length > 0 ? \`
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td style="font-size: 13px; font-weight: 600; color: #374151; padding-bottom: 8px;">Week-over-week Change by Stage</td>
          </tr>
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 12px;">
                <tr style="background: #1f2937; color: white;">
                  <td style="padding: 8px 10px; font-weight: 600;">Stage</td>
                  <td style="padding: 8px 10px; text-align: right; font-weight: 600;">ACV</td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: 600;">% WoW</td>
                  <td style="padding: 8px 10px; text-align: right; font-weight: 600;">Opps</td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: 600;">% WoW</td>
                </tr>
                \${wowRows.map((r, i) => {
                  const isTotal = r.stage.includes('Total');
                  const isLate = r.stage.includes('S4');
                  const bg = isTotal ? 'background: #e5e7eb; font-weight: 600;' : (isLate ? 'background: #dbeafe;' : '');
                  return \`
                <tr style="border-bottom: 1px solid #e5e7eb; \${bg}">
                  <td style="padding: 6px 10px; color: #374151;">\${r.stage}</td>
                  <td style="padding: 6px 10px; text-align: right; color: #374151;">\${r.acv}</td>
                  <td style="padding: 6px 10px; text-align: center; color: \${r.acvWow.includes('+') ? '#059669' : r.acvWow.includes('-') ? '#dc2626' : '#6b7280'};">\${r.acvWow}</td>
                  <td style="padding: 6px 10px; text-align: right; color: #374151;">\${r.opps}</td>
                  <td style="padding: 6px 10px; text-align: center; color: \${r.oppsWow.includes('+') ? '#059669' : r.oppsWow.includes('-') ? '#dc2626' : '#6b7280'};">\${r.oppsWow}</td>
                </tr>\`;
                }).join('')}
              </table>
            </td>
          </tr>
        </table>\` : ''}
        
        <!-- Pipeline by Sales Type (Combined) -->
        \${salesTypeRows.length > 0 ? \`
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td style="font-size: 13px; font-weight: 600; color: #374151; padding-bottom: 8px;">Pipeline by Sales Type (Combined)</td>
          </tr>
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e5e7eb; font-size: 12px;">
                <tr style="background: #1f2937; color: white;">
                  <td style="padding: 8px 10px; font-weight: 600;">Sales Type</td>
                  <td style="padding: 8px 10px; text-align: right; font-weight: 600;">Sum of ACV</td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: 600;">% ACV</td>
                  <td style="padding: 8px 10px; text-align: right; font-weight: 600;">Weighted ACV</td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: 600;">% Wtd</td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: 600;">Count</td>
                </tr>
                \${salesTypeRows.map(r => {
                  const isTotal = r.type.includes('Total');
                  const bg = isTotal ? 'background: #e5e7eb; font-weight: 600;' : '';
                  return \`
                <tr style="border-bottom: 1px solid #e5e7eb; \${bg}">
                  <td style="padding: 6px 10px; color: #374151;">\${r.type}</td>
                  <td style="padding: 6px 10px; text-align: right; color: #374151;">\${r.acv}</td>
                  <td style="padding: 6px 10px; text-align: center; color: #6b7280;">\${r.pctAcv}</td>
                  <td style="padding: 6px 10px; text-align: right; color: #374151;">\${r.weighted}</td>
                  <td style="padding: 6px 10px; text-align: center; color: #6b7280;">\${r.pctWtd}</td>
                  <td style="padding: 6px 10px; text-align: center; color: #374151;">\${r.count}</td>
                </tr>\`;
                }).join('')}
              </table>
            </td>
          </tr>
        </table>\` : ''}
        
        <!-- Section 3: Top Deals Impacting the Forecast -->
        \${topDeals.length > 0 ? \`
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td style="font-size: 14px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
              3. Top Deals Impacting the Forecast
            </td>
          </tr>
          <tr>
            <td style="padding-top: 12px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 12px; color: #374151;">
                \${topDeals.slice(0, 10).map((deal, i) => \`
                <tr><td style="padding: 4px 0;">\${i+1}. \${deal}</td></tr>\`).join('')}
              </table>
            </td>
          </tr>
        </table>\` : ''}
        
        <!-- Section 4: Longest Deals by Stage -->
        \${Object.keys(longestDeals).length > 0 ? \`
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td style="font-size: 14px; font-weight: 700; color: #111827; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
              4. Longest Deals by Stage (T10)
            </td>
          </tr>
          <tr>
            <td style="padding-top: 12px; font-size: 11px; color: #6b7280;">
              Top 10 deals per stage • Numbers show days in current stage • Live from Salesforce
            </td>
          </tr>
          \${Object.entries(longestDeals).map(([stage, deals]) => \`
          <tr>
            <td style="padding-top: 16px;">
              <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 8px;">\${stage}</div>
              <ul style="margin: 0; padding-left: 24px; font-size: 12px; color: #6b7280; line-height: 1.7;">
                \${deals.slice(0, 10).map(d => \`<li>\${d}</li>\`).join('')}
              </ul>
            </td>
          </tr>\`).join('')}
        </table>\` : ''}
        
        
      </td>
    </tr>
  </table>
</body>
</html>\`;
  
  // Create download
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`revops-weekly-\${timestamp}.html\`;
  a.click();
  URL.revokeObjectURL(url);
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

