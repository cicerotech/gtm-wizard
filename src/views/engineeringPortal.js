/**
 * Engineering Customer Keys Portal
 * 
 * Displays closed-won customers with their legal entity names and context
 * for engineering deployment purposes.
 * 
 * Features:
 * - Password-protected access
 * - Search/filter customers
 * - One-click Excel export
 * - Styled to match the light GTM Resources site theme
 */

function generateEngineeringPortal(customers = [], options = {}) {
  const { fieldsAccessible = true } = options;
  const lastUpdated = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  // Generate JSON for export functionality
  const customersJson = JSON.stringify(customers.map(c => ({
    account: c.accountName || '',
    legalEntity: c.legalEntity || c.accountName || '',
    context: c.context || '',
    dealValue: c.dealValue || '',
    closeDate: c.closeDate || ''
  })));

  const customerRows = customers.map(c => `
    <tr data-account="${escapeHtml(c.accountName || '')}" data-legal="${escapeHtml(c.legalEntity || c.accountName || '')}" data-context="${escapeHtml(c.context || '')}">
      <td class="account-name">
        <a href="https://eudia.lightning.force.com/lightning/r/Account/${c.accountId}/view" target="_blank">
          ${escapeHtml(c.accountName || '')}
        </a>
      </td>
      <td class="legal-entity">${escapeHtml(c.legalEntity || c.accountName || '')}</td>
      <td class="context">${escapeHtml(c.context || '').replace(/\n/g, '<br>')}</td>
      <td class="deal-value">${c.dealValue || '-'}</td>
      <td class="date">${c.closeDate || '-'}</td>
      <td class="actions">
        <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(c.legalEntity || c.accountName || '')}', this)" title="Copy Legal Entity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Customer Deployments - GTM Engineering</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f7fe;
      color: #1f2937;
      min-height: 100vh;
    }
    
    /* Header - matches GTM site */
    .header {
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .header-logo {
      display: flex;
      align-items: center;
      text-decoration: none;
    }
    
    .header-logo img {
      height: 32px;
      width: auto;
    }
    
    .header-title {
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .header-badge {
      background: #8b9bf4;
      color: #fff;
      font-size: 0.65rem;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .header-meta {
      font-size: 0.75rem;
      color: #6b7280;
    }
    
    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: color 0.15s;
    }
    
    .back-link:hover {
      color: #8b9bf4;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    
    /* Page title section */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    
    .page-title h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 4px;
    }
    
    .page-title p {
      font-size: 0.875rem;
      color: #6b7280;
    }
    
    /* Export button */
    .export-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    
    .export-btn:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }
    
    .export-btn:active {
      background: #f3f4f6;
    }
    
    .export-btn svg {
      color: #6b7280;
    }
    
    /* Search and filters */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 16px;
      flex-wrap: wrap;
    }
    
    .search-bar {
      flex: 1;
      max-width: 400px;
    }
    
    .search-bar input {
      width: 100%;
      padding: 10px 14px 10px 38px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #1f2937;
      font-size: 0.875rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      transition: all 0.15s;
    }
    
    .search-bar input:focus {
      outline: none;
      border-color: #8b9bf4;
      box-shadow: 0 0 0 3px rgba(139, 155, 244, 0.15);
    }
    
    .search-bar input::placeholder {
      color: #9ca3af;
    }
    
    .search-wrapper {
      position: relative;
    }
    
    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #9ca3af;
    }
    
    .stats {
      font-size: 0.875rem;
      color: #6b7280;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .stats .count {
      color: #8b9bf4;
      font-weight: 600;
    }
    
    /* Table */
    .table-container {
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      text-align: left;
      padding: 14px 16px;
      background: #f9fafb;
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    td {
      padding: 16px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 0.875rem;
      vertical-align: top;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover {
      background: #f9fafb;
    }
    
    .account-name {
      font-weight: 600;
    }
    
    .account-name a {
      color: #1f2937;
      text-decoration: none;
      transition: color 0.15s;
    }
    
    .account-name a:hover {
      color: #8b9bf4;
    }
    
    .legal-entity {
      color: #059669;
      font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
      font-size: 0.8rem;
      background: #ecfdf5;
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
    }
    
    .context {
      color: #6b7280;
      font-size: 0.8rem;
      line-height: 1.5;
      max-width: 300px;
    }
    
    .deal-value {
      color: #1f2937;
      font-weight: 500;
      white-space: nowrap;
    }
    
    .date {
      color: #9ca3af;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    
    .actions {
      text-align: center;
    }
    
    .copy-btn {
      background: #fff;
      border: 1px solid #e5e7eb;
      color: #6b7280;
      padding: 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    
    .copy-btn:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
      color: #1f2937;
    }
    
    .copy-btn.copied {
      background: #8b9bf4;
      border-color: #8b9bf4;
      color: #fff;
    }
    
    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 80px 20px;
    }
    
    .empty-state .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: #f3f4f6;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
    }
    
    .empty-state h3 {
      font-size: 1.125rem;
      color: #1f2937;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .empty-state p {
      color: #6b7280;
      font-size: 0.875rem;
      max-width: 400px;
      margin: 0 auto;
    }
    
    .hidden {
      display: none !important;
    }
    
    .setup-required {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
    }
    
    .setup-required h3 {
      color: #92400e;
      margin-bottom: 12px;
    }
    
    .setup-required ul {
      color: #78716c;
      font-size: 14px;
      line-height: 2;
      margin-left: 20px;
    }
    
    .setup-required code {
      background: #fef3c7;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: #92400e;
    }
    
    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1f2937;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 1000;
    }
    
    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }
    
    .toast svg {
      color: #10b981;
    }
    
    /* Responsive */
    @media (max-width: 1024px) {
      .context {
        max-width: 200px;
      }
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 16px;
      }
      
      .table-container {
        overflow-x: auto;
      }
      
      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      
      .search-bar {
        max-width: none;
      }
      
      .page-header {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <a href="/gtm" class="header-logo">
        <img src="/logo" alt="Eudia">
      </a>
      <span class="header-title">
        Customer Deployments
        <span class="header-badge">Engineering</span>
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 24px;">
      <a href="/gtm" class="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to GTM
      </a>
      <div class="header-meta">
        Updated ${lastUpdated} PT
      </div>
    </div>
  </header>
  
  <div class="container">
    <div class="page-header">
      <div class="page-title">
        <h1>Customer Deployments</h1>
        <p>Legal entities and context for active customers</p>
      </div>
      ${customers.length > 0 ? `
      <button class="export-btn" onclick="exportToExcel()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export to Excel
      </button>
      ` : ''}
    </div>
    
    <div class="toolbar">
      <div class="search-bar">
        <div class="search-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
          <input 
            type="text" 
            id="search" 
            placeholder="Search by account name or legal entity..." 
            onkeyup="filterTable()"
          >
        </div>
      </div>
      <div class="stats">
        <span class="count" id="customer-count">${customers.length}</span> customers
      </div>
    </div>
    
    ${!fieldsAccessible ? `
    <div class="setup-required">
      <h3>Salesforce Connection Issue</h3>
      <p style="margin-bottom: 16px;">Unable to retrieve customer data. This may be a permissions issue.</p>
      <p style="color: #78716c; font-size: 12px;">Contact the admin to verify Salesforce integration access.</p>
    </div>
    ` : customers.length > 0 ? `
    <div class="table-container">
      <table id="customers-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Legal Entity</th>
            <th>Industry / Context</th>
            <th>Deal Value</th>
            <th>Close Date</th>
            <th style="width: 60px;"></th>
          </tr>
        </thead>
        <tbody>
          ${customerRows}
        </tbody>
      </table>
    </div>
    ` : `
    <div class="table-container">
      <div class="empty-state">
        <div class="icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h3>No customers yet</h3>
        <p>Customers will appear here once opportunities are marked as Closed Won in Salesforce with Legal Entity information.</p>
      </div>
    </div>
    `}
  </div>
  
  <!-- Toast notification -->
  <div id="toast" class="toast">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span id="toast-message">Copied!</span>
  </div>
  
  <script>
    // Customer data for export
    const customers = ${customersJson};
    
    function filterTable() {
      const query = document.getElementById('search').value.toLowerCase();
      const rows = document.querySelectorAll('#customers-table tbody tr');
      let visibleCount = 0;
      
      rows.forEach(row => {
        const accountName = row.dataset.account?.toLowerCase() || '';
        const legalEntity = row.dataset.legal?.toLowerCase() || '';
        const context = row.dataset.context?.toLowerCase() || '';
        
        if (accountName.includes(query) || legalEntity.includes(query) || context.includes(query)) {
          row.classList.remove('hidden');
          visibleCount++;
        } else {
          row.classList.add('hidden');
        }
      });
      
      document.getElementById('customer-count').textContent = visibleCount;
    }
    
    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        showToast('Legal entity copied to clipboard');
        setTimeout(() => {
          btn.classList.remove('copied');
        }, 2000);
      });
    }
    
    function showToast(message) {
      const toast = document.getElementById('toast');
      document.getElementById('toast-message').textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
    
    function exportToExcel() {
      // Generate CSV content
      const headers = ['Account Name', 'Legal Entity', 'Industry/Context', 'Deal Value', 'Close Date'];
      const rows = customers.map(c => [
        c.account,
        c.legalEntity,
        c.context,
        c.dealValue,
        c.closeDate
      ]);
      
      // Create CSV string with proper escaping
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          // Escape quotes and wrap in quotes if contains comma, newline, or quote
          const escaped = String(cell || '').replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('\\n') || escaped.includes('"') 
            ? '"' + escaped + '"' 
            : escaped;
        }).join(','))
      ].join('\\n');
      
      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'customer_deployments_' + new Date().toISOString().split('T')[0] + '.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast('Downloaded customer_deployments.csv');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { generateEngineeringPortal };
