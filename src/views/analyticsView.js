/**
 * analyticsView.js
 * 
 * GTM Site Usage Analytics Dashboard
 * Displays user engagement metrics from Salesforce GTM_Usage_Log__c
 */

const { getUsageAnalytics } = require('../services/usageLogger');
const logger = require('../utils/logger');

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get time ago string
 */
function timeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(timestamp);
}

/**
 * Generate the analytics dashboard HTML
 */
async function generateAnalyticsHTML() {
  let analyticsData = null;
  let error = null;

  try {
    const result = await getUsageAnalytics();
    if (result.success) {
      analyticsData = result.data;
    } else {
      error = result.error || result.reason || 'Failed to load analytics';
    }
  } catch (e) {
    logger.error('[AnalyticsView] Error loading analytics:', e);
    error = e.message;
  }

  // Build daily chart data
  const dailyLabels = [];
  const dailyCounts = [];
  if (analyticsData?.dailyLogins) {
    for (const day of analyticsData.dailyLogins) {
      dailyLabels.push(formatDate(day.Event_Date__c));
      dailyCounts.push(day.eventCount || 0);
    }
  }

  // Build page popularity data
  const pageLabels = [];
  const pageCounts = [];
  if (analyticsData?.pagePopularity && analyticsData.pagePopularity.length > 0) {
    for (const page of analyticsData.pagePopularity.slice(0, 6)) {
      const pageName = page.Page_Name__c || 'Unknown';
      pageLabels.push(pageName.replace('/gtm/', '').replace('/gtm', 'Hub') || 'Hub');
      pageCounts.push(page.views || 0);
    }
  } else {
    // Fallback - show placeholder if page data not available
    pageLabels.push('Hub', 'Meeting Prep', 'Dashboard');
    pageCounts.push(0, 0, 0);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  background: #f5f7fe; 
  min-height: 100vh;
  padding: 24px;
}

.analytics-header {
  margin-bottom: 24px;
}

.analytics-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.analytics-header p {
  color: #6b7280;
  font-size: 0.875rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.stat-card .stat-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.stat-card .stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
}

.stat-card .stat-sub {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 4px;
}

.charts-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.chart-card h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 16px;
}

.chart-container {
  position: relative;
  height: 200px;
}

.tables-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .tables-row {
    grid-template-columns: 1fr;
  }
}

.table-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.table-card h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 16px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
}

.data-table td {
  padding: 10px 0;
  font-size: 0.875rem;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.user-email {
  font-weight: 500;
  color: #1f2937;
}

.user-name {
  font-size: 0.75rem;
  color: #9ca3af;
}

.activity-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
}

.badge-login { background: #dbeafe; color: #1d4ed8; }
.badge-page { background: #dcfce7; color: #15803d; }
.badge-logout { background: #fee2e2; color: #b91c1c; }

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #9ca3af;
}

.refresh-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #8e99e1;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(142, 153, 225, 0.4);
}

.refresh-btn:hover {
  background: #7c8bd4;
}
</style>
</head>
<body>

<div class="analytics-header">
  <h1>GTM Site Analytics</h1>
  <p>User engagement and activity tracking</p>
</div>

${error ? `<div class="error-message">${error}</div>` : ''}

${!error && !analyticsData ? `<div class="no-data">Loading analytics data...</div>` : ''}

${analyticsData ? `
<!-- Stats Cards -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Today's Events</div>
    <div class="stat-value">${analyticsData.todayStats?.totalEvents || 0}</div>
    <div class="stat-sub">Page views & logins</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Active Users Today</div>
    <div class="stat-value">${analyticsData.todayStats?.uniqueUsers || 0}</div>
    <div class="stat-sub">Unique visitors</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Total Users</div>
    <div class="stat-value">${analyticsData.users?.length || 0}</div>
    <div class="stat-sub">All time</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Most Popular</div>
    <div class="stat-value" style="font-size: 1.25rem;">${pageLabels[0] || 'N/A'}</div>
    <div class="stat-sub">${pageCounts[0] || 0} views</div>
  </div>
</div>

<!-- Charts -->
<div class="charts-row">
  <div class="chart-card">
    <h3>Daily Logins (Last 30 Days)</h3>
    <div class="chart-container">
      <canvas id="dailyChart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <h3>Page Popularity</h3>
    <div class="chart-container">
      <canvas id="pageChart"></canvas>
    </div>
  </div>
</div>

<!-- Tables -->
<div class="tables-row">
  <div class="table-card">
    <h3>User Activity</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Last Active</th>
          <th>Events</th>
        </tr>
      </thead>
      <tbody>
        ${(analyticsData.users || []).slice(0, 10).map(user => `
          <tr>
            <td>
              <div class="user-email">${user.User_Email__c || 'Unknown'}</div>
            </td>
            <td>${timeAgo(user.lastActive)}</td>
            <td>${user.totalEvents || 0}</td>
          </tr>
        `).join('')}
        ${(analyticsData.users || []).length === 0 ? '<tr><td colspan="3" class="no-data">No user data yet</td></tr>' : ''}
      </tbody>
    </table>
  </div>
  
  <div class="table-card">
    <h3>Recent Activity</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Action</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        ${(analyticsData.recentActivity || []).slice(0, 10).map(event => `
          <tr>
            <td class="user-email">${(event.User_Email__c || 'Unknown').split('@')[0]}</td>
            <td>
              <span class="activity-badge ${event.Event_Type__c === 'Login' ? 'badge-login' : event.Event_Type__c === 'Logout' ? 'badge-logout' : 'badge-page'}">
                ${event.Event_Type__c || 'Page_View'}
              </span>
            </td>
            <td>${timeAgo(event.Event_Timestamp__c)}</td>
          </tr>
        `).join('')}
        ${(analyticsData.recentActivity || []).length === 0 ? '<tr><td colspan="3" class="no-data">No activity yet</td></tr>' : ''}
      </tbody>
    </table>
  </div>
</div>

<button class="refresh-btn" onclick="location.reload()">Refresh</button>

<script>
// Daily logins chart
const dailyCtx = document.getElementById('dailyChart');
if (dailyCtx) {
  new Chart(dailyCtx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(dailyLabels)},
      datasets: [{
        label: 'Logins',
        data: ${JSON.stringify(dailyCounts)},
        backgroundColor: 'rgba(142, 153, 225, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Page popularity chart
const pageCtx = document.getElementById('pageChart');
if (pageCtx) {
  new Chart(pageCtx, {
    type: 'doughnut',
    data: {
      labels: ${JSON.stringify(pageLabels)},
      datasets: [{
        data: ${JSON.stringify(pageCounts)},
        backgroundColor: [
          'rgba(142, 153, 225, 0.8)',
          'rgba(110, 231, 183, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(244, 114, 182, 0.8)',
          'rgba(129, 140, 248, 0.8)',
          'rgba(167, 139, 250, 0.8)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
      }
    }
  });
}
</script>
` : ''}

</body>
</html>`;
}

module.exports = {
  generateAnalyticsHTML
};
