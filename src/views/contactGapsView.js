/**
 * Contact Gaps Dashboard View
 * 
 * Displays missing contacts identified from BL calendar analysis
 * with review and batch creation capabilities.
 */

const contactGapAnalysis = require('../services/contactGapAnalysis');
const logger = require('../utils/logger');

/**
 * Generate the contact gaps dashboard HTML
 * @param {object} options - { daysBack, minMeetings }
 */
async function generateContactGapsHTML(options = {}) {
  const { daysBack = 90, minMeetings = 1 } = options;
  
  let report = null;
  let error = null;
  
  try {
    report = await contactGapAnalysis.analyzeContactGaps({
      daysBack,
      minMeetingCount: minMeetings
    });
  } catch (e) {
    error = e.message;
    logger.error('[ContactGapsView] Analysis failed:', e);
  }
  
  const updateTime = new Date().toLocaleTimeString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contact Gap Analysis | GTM Brain</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  min-height: 100vh;
  color: #f1f5f9;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header h1::before {
  content: '👥';
}

.header-meta {
  font-size: 0.875rem;
  color: #94a3b8;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.stat-card.highlight {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  border-color: #3b82f6;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-card.highlight .stat-label {
  color: rgba(255,255,255,0.8);
}

/* Controls */
.controls {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-size: 0.875rem;
  color: #94a3b8;
}

.control-group select,
.control-group input {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  padding: 8px 12px;
  color: #f1f5f9;
  font-size: 0.875rem;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.btn-success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.btn-success:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Table */
.table-container {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.table-title {
  font-size: 1rem;
  font-weight: 600;
  color: #f1f5f9;
}

.select-all-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-all-container label {
  font-size: 0.875rem;
  color: #94a3b8;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
  background: rgba(255,255,255,0.05);
  padding: 12px 16px;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

tbody tr {
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background 0.2s;
}

tbody tr:hover {
  background: rgba(255,255,255,0.03);
}

tbody td {
  padding: 16px;
  font-size: 0.875rem;
  color: #e2e8f0;
}

.contact-name {
  font-weight: 500;
  color: #f1f5f9;
}

.contact-email {
  font-size: 0.75rem;
  color: #64748b;
}

.contact-title {
  color: #94a3b8;
  font-size: 0.8rem;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 500;
  text-transform: uppercase;
}

.badge-clay {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.badge-email {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.meeting-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: #3b82f6;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
}

.empty-state h3 {
  font-size: 1.25rem;
  color: #94a3b8;
  margin-bottom: 8px;
}

/* Modal */
.modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.modal.active {
  display: flex;
}

.modal-content {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h2 {
  font-size: 1.25rem;
  color: #f1f5f9;
}

.modal-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 1.5rem;
  cursor: pointer;
}

.result-item {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
}

.result-item.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.result-item.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.result-item.skipped {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* Error State */
.error-state {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: #ef4444;
}
</style>
</head>
<body>
<div class="container">
  <header class="header">
    <h1>Contact Gap Analysis</h1>
    <div class="header-meta">
      Last updated: ${updateTime} PST
      <br>
      <a href="/hub" style="color: #3b82f6;">← Back to Hub</a>
    </div>
  </header>
  
  ${error ? `
  <div class="error-state">
    <h3>Analysis Error</h3>
    <p>${error}</p>
  </div>
  ` : `
  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${report?.summary?.totalExternalAttendees || 0}</div>
      <div class="stat-label">External Attendees</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${report?.summary?.blOwnedAccounts || 0}</div>
      <div class="stat-label">BL Accounts</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${report?.summary?.matchedToAccounts || 0}</div>
      <div class="stat-label">Matched to Accounts</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${report?.summary?.alreadyInSalesforce || 0}</div>
      <div class="stat-label">Already in SF</div>
    </div>
    <div class="stat-card highlight">
      <div class="stat-value">${report?.summary?.missingContacts || 0}</div>
      <div class="stat-label">Missing Contacts</div>
    </div>
  </div>
  
  <!-- Controls -->
  <div class="controls">
    <div class="control-group">
      <label>Days Back:</label>
      <select id="daysBack" onchange="updateFilters()">
        <option value="30" ${daysBack === 30 ? 'selected' : ''}>30 days</option>
        <option value="60" ${daysBack === 60 ? 'selected' : ''}>60 days</option>
        <option value="90" ${daysBack === 90 ? 'selected' : ''}>90 days</option>
        <option value="180" ${daysBack === 180 ? 'selected' : ''}>180 days</option>
      </select>
    </div>
    <div class="control-group">
      <label>Min Meetings:</label>
      <select id="minMeetings" onchange="updateFilters()">
        <option value="1" ${minMeetings === 1 ? 'selected' : ''}>1+</option>
        <option value="2" ${minMeetings === 2 ? 'selected' : ''}>2+</option>
        <option value="3" ${minMeetings === 3 ? 'selected' : ''}>3+</option>
        <option value="5" ${minMeetings === 5 ? 'selected' : ''}>5+</option>
      </select>
    </div>
    <button class="btn btn-success" id="createBtn" onclick="createSelectedContacts()" disabled>
      Create Selected (0)
    </button>
  </div>
  
  <!-- Table -->
  <div class="table-container">
    <div class="table-header">
      <div class="table-title">Missing Contacts (${report?.missingContacts?.length || 0})</div>
      <div class="select-all-container">
        <input type="checkbox" id="selectAll" onchange="toggleSelectAll()">
        <label for="selectAll">Select All</label>
      </div>
    </div>
    
    ${report?.missingContacts?.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th style="width: 40px;"></th>
          <th>Contact</th>
          <th>Title</th>
          <th>Account</th>
          <th>Owner</th>
          <th>Meetings</th>
          <th>Last Meeting</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${report.missingContacts.map((contact, idx) => `
        <tr data-contact='${JSON.stringify(contact).replace(/'/g, "&#39;")}'>
          <td>
            <input type="checkbox" class="contact-checkbox" data-idx="${idx}" onchange="updateSelectedCount()">
          </td>
          <td>
            <div class="contact-name">${contact.firstName || ''} ${contact.lastName || ''}</div>
            <div class="contact-email">${contact.email}</div>
          </td>
          <td class="contact-title">${contact.title || '—'}</td>
          <td>${contact.account?.name || '—'}</td>
          <td>${contact.account?.owner || '—'}</td>
          <td>
            <div class="meeting-count">
              📅 ${contact.meetingCount}
            </div>
          </td>
          <td>${contact.lastMeeting ? new Date(contact.lastMeeting).toLocaleDateString() : '—'}</td>
          <td>
            <span class="badge ${contact.enrichmentSource === 'clay' ? 'badge-clay' : 'badge-email'}">
              ${contact.enrichmentSource === 'clay' ? '✨ Clay' : '📧 Email'}
            </span>
          </td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `
    <div class="empty-state">
      <h3>No Missing Contacts Found</h3>
      <p>All calendar attendees are either already in Salesforce or don't match a BL-owned account.</p>
    </div>
    `}
  </div>
  `}
</div>

<!-- Results Modal -->
<div class="modal" id="resultsModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Creation Results</h2>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div id="resultsContent"></div>
    <div style="margin-top: 20px; text-align: right;">
      <button class="btn btn-primary" onclick="location.reload()">Refresh Page</button>
    </div>
  </div>
</div>

<script>
function updateFilters() {
  const daysBack = document.getElementById('daysBack').value;
  const minMeetings = document.getElementById('minMeetings').value;
  window.location.href = '/contacts/gaps?days=' + daysBack + '&minMeetings=' + minMeetings;
}

function toggleSelectAll() {
  const selectAll = document.getElementById('selectAll').checked;
  document.querySelectorAll('.contact-checkbox').forEach(cb => {
    cb.checked = selectAll;
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const selected = document.querySelectorAll('.contact-checkbox:checked').length;
  const btn = document.getElementById('createBtn');
  btn.textContent = 'Create Selected (' + selected + ')';
  btn.disabled = selected === 0;
}

async function createSelectedContacts() {
  const checkboxes = document.querySelectorAll('.contact-checkbox:checked');
  const contacts = [];
  
  checkboxes.forEach(cb => {
    const row = cb.closest('tr');
    const contactData = JSON.parse(row.dataset.contact);
    contacts.push(contactData);
  });
  
  if (contacts.length === 0) return;
  if (contacts.length > 10) {
    alert('Maximum 10 contacts per batch. Please deselect some.');
    return;
  }
  
  // Confirm action
  const confirmMsg = 'Create ' + contacts.length + ' contacts in Salesforce?\\n\\n' +
    'This will run in DRY RUN mode first to preview.';
  if (!confirm(confirmMsg)) return;
  
  const btn = document.getElementById('createBtn');
  btn.textContent = 'Creating...';
  btn.disabled = true;
  
  try {
    // First do dry run
    const dryRunResponse = await fetch('/api/contacts/create-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts, dryRun: true, approver: 'dashboard' })
    });
    
    const dryRunResult = await dryRunResponse.json();
    
    // Show dry run results and ask for confirmation
    let resultHtml = '<h3 style="margin-bottom: 16px;">Dry Run Preview</h3>';
    
    if (dryRunResult.created?.length > 0) {
      resultHtml += '<p style="color: #10b981; margin-bottom: 12px;">Will create ' + dryRunResult.created.length + ' contacts:</p>';
      dryRunResult.created.forEach(c => {
        resultHtml += '<div class="result-item success">' + c.firstName + ' ' + c.lastName + ' (' + c.email + ') → ' + c.accountName + '</div>';
      });
    }
    
    if (dryRunResult.skipped?.length > 0) {
      resultHtml += '<p style="color: #f59e0b; margin-top: 16px; margin-bottom: 12px;">Will skip ' + dryRunResult.skipped.length + ' (already exist):</p>';
      dryRunResult.skipped.forEach(c => {
        resultHtml += '<div class="result-item skipped">' + c.email + ' - ' + c.reason + '</div>';
      });
    }
    
    resultHtml += '<div style="margin-top: 20px;"><button class="btn btn-success" onclick="executeCreation()">Confirm & Create</button></div>';
    
    document.getElementById('resultsContent').innerHTML = resultHtml;
    document.getElementById('resultsModal').classList.add('active');
    
    // Store contacts for execution
    window.pendingContacts = contacts;
    
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    updateSelectedCount();
  }
}

async function executeCreation() {
  if (!window.pendingContacts) return;
  
  document.getElementById('resultsContent').innerHTML = '<p>Creating contacts...</p>';
  
  try {
    const response = await fetch('/api/contacts/create-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: window.pendingContacts, dryRun: false, approver: 'dashboard' })
    });
    
    const result = await response.json();
    
    let resultHtml = '<h3 style="margin-bottom: 16px;">Creation Complete</h3>';
    
    if (result.created?.length > 0) {
      resultHtml += '<p style="color: #10b981; margin-bottom: 12px;">Created ' + result.created.length + ' contacts:</p>';
      result.created.forEach(c => {
        resultHtml += '<div class="result-item success">✅ ' + c.firstName + ' ' + c.lastName + ' (' + c.email + ')</div>';
      });
    }
    
    if (result.skipped?.length > 0) {
      resultHtml += '<p style="color: #f59e0b; margin-top: 16px; margin-bottom: 12px;">Skipped ' + result.skipped.length + ':</p>';
      result.skipped.forEach(c => {
        resultHtml += '<div class="result-item skipped">⏭️ ' + c.email + ' - ' + c.reason + '</div>';
      });
    }
    
    if (result.errors?.length > 0) {
      resultHtml += '<p style="color: #ef4444; margin-top: 16px; margin-bottom: 12px;">Errors (' + result.errors.length + '):</p>';
      result.errors.forEach(c => {
        resultHtml += '<div class="result-item error">❌ ' + c.email + ' - ' + c.error + '</div>';
      });
    }
    
    document.getElementById('resultsContent').innerHTML = resultHtml;
    window.pendingContacts = null;
    
  } catch (error) {
    document.getElementById('resultsContent').innerHTML = '<div class="result-item error">Error: ' + error.message + '</div>';
  }
}

function closeModal() {
  document.getElementById('resultsModal').classList.remove('active');
}
</script>
</body>
</html>`;
}

module.exports = { generateContactGapsHTML };

