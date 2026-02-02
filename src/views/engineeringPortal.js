/**
 * Engineering Customer Keys Portal
 * 
 * Displays approved customers with their legal entity names and context
 * for engineering deployment purposes.
 */

function generateEngineeringPortal(customers = []) {
  const lastUpdated = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const customerRows = customers.map(c => `
    <tr>
      <td class="account-name">${escapeHtml(c.accountName || '')}</td>
      <td class="legal-entity">${escapeHtml(c.legalEntity || '')}</td>
      <td class="context">${escapeHtml(c.context || '').replace(/\n/g, '<br>')}</td>
      <td class="date">${c.approvedDate || '-'}</td>
      <td class="actions">
        <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(c.legalEntity || '')}', this)" title="Copy Legal Entity">
          Copy
        </button>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Engineering Customer Keys</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #f0f6fc;
    }
    
    .header-badge {
      background: #238636;
      color: #fff;
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
    }
    
    .header-meta {
      font-size: 0.75rem;
      color: #8b949e;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    
    .search-bar {
      margin-bottom: 20px;
    }
    
    .search-bar input {
      width: 100%;
      max-width: 400px;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 0.875rem;
    }
    
    .search-bar input:focus {
      outline: none;
      border-color: #58a6ff;
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    
    .search-bar input::placeholder {
      color: #6e7681;
    }
    
    .stats {
      display: flex;
      gap: 24px;
      margin-bottom: 20px;
      font-size: 0.875rem;
      color: #8b949e;
    }
    
    .stats span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .stats .count {
      color: #58a6ff;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: #161b22;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #30363d;
    }
    
    th {
      text-align: left;
      padding: 12px 16px;
      background: #21262d;
      font-size: 0.75rem;
      font-weight: 600;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #30363d;
    }
    
    td {
      padding: 14px 16px;
      border-bottom: 1px solid #21262d;
      font-size: 0.875rem;
      vertical-align: top;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover {
      background: #1c2128;
    }
    
    .account-name {
      font-weight: 600;
      color: #f0f6fc;
      white-space: nowrap;
    }
    
    .legal-entity {
      color: #7ee787;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
    }
    
    .context {
      color: #8b949e;
      font-size: 0.8rem;
      line-height: 1.5;
      max-width: 500px;
    }
    
    .date {
      color: #6e7681;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    
    .actions {
      text-align: center;
    }
    
    .copy-btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .copy-btn:hover {
      background: #30363d;
      border-color: #8b949e;
    }
    
    .copy-btn.copied {
      background: #238636;
      border-color: #238636;
      color: #fff;
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #6e7681;
    }
    
    .empty-state h3 {
      font-size: 1.25rem;
      color: #8b949e;
      margin-bottom: 8px;
    }
    
    .hidden {
      display: none !important;
    }
    
    @media (max-width: 1024px) {
      .context {
        max-width: 300px;
      }
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 16px;
      }
      
      table {
        display: block;
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <span class="header-title">Engineering Customer Keys</span>
      <span class="header-badge">Internal</span>
    </div>
    <div class="header-meta">
      Last updated: ${lastUpdated} PT
    </div>
  </header>
  
  <div class="container">
    <div class="search-bar">
      <input 
        type="text" 
        id="search" 
        placeholder="Search by account name or legal entity..." 
        onkeyup="filterTable()"
      >
    </div>
    
    <div class="stats">
      <span><span class="count" id="customer-count">${customers.length}</span> approved customers</span>
    </div>
    
    ${customers.length > 0 ? `
    <table id="customers-table">
      <thead>
        <tr>
          <th>Account Name</th>
          <th>Legal Entity</th>
          <th>Context</th>
          <th>Approved</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${customerRows}
      </tbody>
    </table>
    ` : `
    <div class="empty-state">
      <h3>No approved customers yet</h3>
      <p>Customers will appear here when Deployment Approved is checked on their Account.</p>
    </div>
    `}
  </div>
  
  <script>
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function filterTable() {
      const query = document.getElementById('search').value.toLowerCase();
      const rows = document.querySelectorAll('#customers-table tbody tr');
      let visibleCount = 0;
      
      rows.forEach(row => {
        const accountName = row.querySelector('.account-name')?.textContent.toLowerCase() || '';
        const legalEntity = row.querySelector('.legal-entity')?.textContent.toLowerCase() || '';
        
        if (accountName.includes(query) || legalEntity.includes(query)) {
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
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
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
