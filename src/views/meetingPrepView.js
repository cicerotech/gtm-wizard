/**
 * Meeting Prep View
 * Week-at-a-glance layout with meeting cards and detail modal
 */

const meetingPrepService = require('../services/meetingPrepService');

/**
 * Generate the Meeting Prep HTML page
 */
async function generateMeetingPrepHTML() {
  const weekRange = meetingPrepService.getCurrentWeekRange();
  const meetings = await meetingPrepService.getUpcomingMeetings(weekRange.start, weekRange.end);
  const grouped = meetingPrepService.groupMeetingsByDay(meetings);
  
  // Generate week dates
  const monday = new Date(weekRange.mondayDate);
  const weekDays = [];
  for (let i = 0; i < 5; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    weekDays.push({
      name: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][i],
      key: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'][i],
      date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: day.toISOString().split('T')[0]
    });
  }
  
  const demoProducts = meetingPrepService.DEMO_PRODUCTS;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meeting Prep</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  background: #f5f7fe; 
  min-height: 100vh;
  padding: 20px;
}

.meeting-prep-container {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
}

.page-subtitle {
  font-size: 0.85rem;
  color: #6b7280;
  margin-top: 4px;
}

.btn-primary {
  background: #8e99e1;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-primary:hover {
  background: #7a86d4;
}

/* Week Grid */
.week-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.day-column {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  min-height: 400px;
}

.day-header {
  background: #f9fafb;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.day-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2937;
}

.day-date {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 2px;
}

.day-meetings {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Meeting Card */
.meeting-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.meeting-card:hover {
  border-color: #8e99e1;
  box-shadow: 0 2px 8px rgba(142, 153, 225, 0.15);
}

.meeting-card.has-prep {
  border-left: 3px solid #10b981;
}

.meeting-account {
  font-size: 0.8rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.meeting-title {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meeting-time {
  font-size: 0.7rem;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 4px;
}

.meeting-source {
  font-size: 0.6rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: auto;
}

.meeting-source.salesforce { background: #dbeafe; color: #1e40af; }
.meeting-source.manual { background: #f3e8ff; color: #7c3aed; }

.empty-day {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 0.75rem;
}

/* Modal */
.modal-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 20px;
  overflow-y: auto;
}

.modal-overlay.active {
  display: flex;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 10;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 4px;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
}

.modal-close:hover {
  color: #1f2937;
}

.modal-body {
  padding: 24px;
}

/* Context Section */
.context-section {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.context-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.context-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
}

.context-toggle {
  font-size: 0.7rem;
  color: #8e99e1;
  cursor: pointer;
}

.context-content {
  font-size: 0.75rem;
  color: #4b5563;
  line-height: 1.6;
}

.context-item {
  margin-bottom: 8px;
  padding-left: 12px;
  border-left: 2px solid #e5e7eb;
}

.context-label {
  font-weight: 600;
  color: #374151;
}

/* Form Sections */
.form-section {
  margin-bottom: 24px;
}

.form-section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-section-title .badge {
  font-size: 0.6rem;
  background: #fef3c7;
  color: #92400e;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Input Rows */
.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.input-number {
  font-size: 0.75rem;
  color: #9ca3af;
  width: 20px;
}

.input-field {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.85rem;
}

.input-field:focus {
  outline: none;
  border-color: #8e99e1;
  box-shadow: 0 0 0 3px rgba(142, 153, 225, 0.1);
}

textarea.input-field {
  min-height: 100px;
  resize: vertical;
}

/* Demo Section */
.demo-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.demo-select {
  width: 180px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
}

.demo-subtext {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.85rem;
}

.demo-subtext:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

/* Attendees */
.attendees-section {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.attendees-dropdown {
  flex: 1;
}

.add-external-btn {
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  color: #6b7280;
  cursor: pointer;
}

.add-external-btn:hover {
  background: #e5e7eb;
}

.attendee-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.attendee-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f3f4f6;
  padding: 6px 10px;
  border-radius: 16px;
  font-size: 0.75rem;
}

.attendee-chip.external {
  background: #fef3c7;
}

.attendee-remove {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.9rem;
}

/* Submit Button */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  position: sticky;
  bottom: 0;
  background: #fff;
}

.btn-save {
  background: #10b981;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-save:hover {
  background: #059669;
}

.btn-cancel {
  background: #f3f4f6;
  color: #374151;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.875rem;
  cursor: pointer;
}

/* Create Meeting Modal */
.create-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #374151;
}

/* Loading State */
.loading {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #8e99e1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 1024px) {
  .week-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .week-grid {
    grid-template-columns: 1fr;
  }
  
  .day-column {
    min-height: auto;
  }
}
</style>
</head>
<body>

<div class="meeting-prep-container">
  <div class="page-header">
    <div>
      <h1 class="page-title">Meeting Prep</h1>
      <p class="page-subtitle">Week of ${weekDays[0].date} - ${weekDays[4].date}</p>
    </div>
    <button class="btn-primary" onclick="openCreateModal()">
      <span>+</span> Create Meeting
    </button>
  </div>

  <div class="week-grid">
    ${weekDays.map(day => `
      <div class="day-column">
        <div class="day-header">
          <div class="day-name">${day.name}</div>
          <div class="day-date">${day.date}</div>
        </div>
        <div class="day-meetings" id="meetings-${day.key}">
          ${(grouped[day.key] || []).length === 0 ? `
            <div class="empty-day">No meetings</div>
          ` : (grouped[day.key] || []).map(meeting => `
            <div class="meeting-card ${meeting.agenda?.some(a => a?.trim()) ? 'has-prep' : ''}" 
                 onclick="openMeetingPrep('${meeting.meeting_id || meeting.meetingId}')">
              <div class="meeting-account">${meeting.account_name || meeting.accountName || 'Unknown'}</div>
              <div class="meeting-title">${meeting.meeting_title || meeting.meetingTitle || 'Untitled'}</div>
              <div class="meeting-time">
                <span>🕐</span>
                ${formatTime(meeting.meeting_date || meeting.meetingDate)}
                <span class="meeting-source ${meeting.source}">${meeting.source}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>
</div>

<!-- Meeting Prep Detail Modal -->
<div class="modal-overlay" id="prepModal">
  <div class="modal">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="modalTitle">Meeting Prep</div>
        <div class="modal-subtitle" id="modalSubtitle">Loading...</div>
      </div>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body" id="modalBody">
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading meeting details...</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-save" onclick="saveMeetingPrep()">Save Prep</button>
    </div>
  </div>
</div>

<!-- Create Meeting Modal -->
<div class="modal-overlay" id="createModal">
  <div class="modal" style="max-width: 500px;">
    <div class="modal-header">
      <div>
        <div class="modal-title">Create Meeting</div>
        <div class="modal-subtitle">Add a new meeting to prepare for</div>
      </div>
      <button class="modal-close" onclick="closeCreateModal()">&times;</button>
    </div>
    <div class="modal-body">
      <form class="create-form" id="createForm">
        <div class="form-group">
          <label class="form-label">Account *</label>
          <select class="input-field" id="createAccount" required>
            <option value="">Select an account...</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Meeting Title *</label>
          <input type="text" class="input-field" id="createTitle" placeholder="e.g., Q1 Roadmap Review" required>
        </div>
        <div class="form-group">
          <label class="form-label">Date & Time *</label>
          <input type="datetime-local" class="input-field" id="createDate" required>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeCreateModal()">Cancel</button>
      <button class="btn-save" onclick="createMeeting()">Create Meeting</button>
    </div>
  </div>
</div>

<script>
const DEMO_PRODUCTS = ${JSON.stringify(demoProducts)};
let currentMeetingId = null;
let currentMeetingData = null;
let accountsList = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadAccounts();
});

// Load accounts for dropdown
async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const data = await res.json();
    if (data.success) {
      accountsList = data.accounts;
      const select = document.getElementById('createAccount');
      select.innerHTML = '<option value="">Select an account...</option>' +
        accountsList.map(a => '<option value="' + a.accountId + '" data-name="' + a.accountName + '">' + a.accountName + '</option>').join('');
    }
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}

// Format time from ISO string
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Open meeting prep modal
async function openMeetingPrep(meetingId) {
  currentMeetingId = meetingId;
  document.getElementById('prepModal').classList.add('active');
  document.getElementById('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading meeting details...</p></div>';
  
  try {
    // Load meeting prep data
    const prepRes = await fetch('/api/meeting-prep/' + meetingId);
    const prepData = await prepRes.json();
    
    if (!prepData.success || !prepData.prep) {
      // Meeting exists but no prep yet - create structure
      currentMeetingData = {
        meetingId,
        attendees: [],
        agenda: ['', '', ''],
        goals: ['', '', ''],
        demoSelections: [{ product: '', subtext: '' }, { product: '', subtext: '' }, { product: '', subtext: '' }]
      };
    } else {
      currentMeetingData = prepData.prep;
      // Ensure arrays have 3 slots
      while ((currentMeetingData.agenda || []).length < 3) currentMeetingData.agenda.push('');
      while ((currentMeetingData.goals || []).length < 3) currentMeetingData.goals.push('');
      while ((currentMeetingData.demoSelections || []).length < 3) currentMeetingData.demoSelections.push({ product: '', subtext: '' });
    }
    
    document.getElementById('modalTitle').textContent = currentMeetingData.account_name || currentMeetingData.accountName || 'Meeting Prep';
    document.getElementById('modalSubtitle').textContent = currentMeetingData.meeting_title || currentMeetingData.meetingTitle || '';
    
    // Load context
    let contextHtml = '<div class="context-section"><div class="context-content">No context available</div></div>';
    if (currentMeetingData.account_id || currentMeetingData.accountId) {
      try {
        const ctxRes = await fetch('/api/meeting-context/' + (currentMeetingData.account_id || currentMeetingData.accountId));
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.context) {
          contextHtml = formatContextSection(ctxData.context);
        }
      } catch (e) {
        console.error('Failed to load context:', e);
      }
    }
    
    // Render form
    renderPrepForm(contextHtml);
    
  } catch (err) {
    console.error('Error loading meeting prep:', err);
    document.getElementById('modalBody').innerHTML = '<div style="color: #dc2626; padding: 20px;">Failed to load meeting: ' + err.message + '</div>';
  }
}

// Format context section HTML
function formatContextSection(ctx) {
  let html = '<div class="context-section"><div class="context-header"><span class="context-title">📊 Account Context</span></div><div class="context-content">';
  
  if (ctx.salesforce) {
    const sf = ctx.salesforce;
    if (sf.customerType) html += '<div class="context-item"><span class="context-label">Type:</span> ' + sf.customerType + (sf.customerSubtype ? ' (' + sf.customerSubtype + ')' : '') + '</div>';
    if (sf.industry) html += '<div class="context-item"><span class="context-label">Industry:</span> ' + sf.industry + '</div>';
    if (sf.openOpportunities?.length) {
      html += '<div class="context-item"><span class="context-label">Open Opps:</span> ' + sf.openOpportunities.length + ' opportunities</div>';
    }
    if (sf.keyContacts?.length) {
      html += '<div class="context-item"><span class="context-label">Key Contacts:</span> ' + sf.keyContacts.map(c => c.name).join(', ') + '</div>';
    }
  }
  
  if (ctx.slackIntel?.length) {
    html += '<div class="context-item" style="margin-top: 12px;"><span class="context-label">💬 Recent Slack Insights:</span></div>';
    ctx.slackIntel.slice(0, 3).forEach(intel => {
      html += '<div class="context-item" style="margin-left: 12px; font-size: 0.7rem;">[' + intel.category + '] ' + intel.summary + '</div>';
    });
  }
  
  if (ctx.priorMeetings?.length) {
    html += '<div class="context-item" style="margin-top: 12px;"><span class="context-label">📅 Prior Meetings:</span> ' + ctx.priorMeetings.length + '</div>';
  }
  
  html += '</div></div>';
  return html;
}

// Render the prep form
function renderPrepForm(contextHtml) {
  const data = currentMeetingData;
  const attendees = data.attendees || [];
  const agenda = data.agenda || ['', '', ''];
  const goals = data.goals || ['', '', ''];
  const demos = data.demoSelections || [{ product: '', subtext: '' }, { product: '', subtext: '' }, { product: '', subtext: '' }];
  
  const demoOptions = '<option value="">Select product...</option>' + 
    DEMO_PRODUCTS.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  
  document.getElementById('modalBody').innerHTML = \`
    \${contextHtml}
    
    <div class="form-section">
      <div class="form-section-title">👥 Attendees</div>
      <div class="attendees-section">
        <select class="input-field attendees-dropdown" id="attendeeSelect" onchange="addAttendee(this)">
          <option value="">Add from contacts...</option>
        </select>
        <button class="add-external-btn" onclick="addExternalAttendee()">+ Add External</button>
      </div>
      <div class="attendee-chips" id="attendeeChips">
        \${attendees.map((a, i) => \`
          <span class="attendee-chip \${a.isExternal ? 'external' : ''}">
            \${a.name}
            <button class="attendee-remove" onclick="removeAttendee(\${i})">&times;</button>
          </span>
        \`).join('')}
      </div>
    </div>
    
    <div class="form-section">
      <div class="form-section-title">📋 Agenda</div>
      \${agenda.map((item, i) => \`
        <div class="input-row">
          <span class="input-number">\${i + 1}.</span>
          <input type="text" class="input-field agenda-input" value="\${escapeHtml(item || '')}" placeholder="Agenda item \${i + 1}">
        </div>
      \`).join('')}
    </div>
    
    <div class="form-section">
      <div class="form-section-title">🎯 Meeting Goals</div>
      \${goals.map((item, i) => \`
        <div class="input-row">
          <span class="input-number">\${i + 1}.</span>
          <input type="text" class="input-field goal-input" value="\${escapeHtml(item || '')}" placeholder="Goal \${i + 1}">
        </div>
      \`).join('')}
    </div>
    
    <div class="form-section">
      <div class="form-section-title">🖥️ Demo Requirements</div>
      \${demos.map((demo, i) => \`
        <div class="demo-row">
          <select class="demo-select" data-index="\${i}" onchange="toggleDemoSubtext(this)">
            \${demoOptions.replace('value="' + (demo.product || '') + '"', 'value="' + (demo.product || '') + '" selected')}
          </select>
          <input type="text" class="demo-subtext" data-index="\${i}" value="\${escapeHtml(demo.subtext || '')}" placeholder="Additional details..." \${!demo.product ? 'disabled' : ''}>
        </div>
      \`).join('')}
    </div>
  \`;
  
  // Load contacts for attendee dropdown
  loadContactsForAttendee();
}

// Load contacts for attendee dropdown
async function loadContactsForAttendee() {
  const accountId = currentMeetingData.account_id || currentMeetingData.accountId;
  if (!accountId) return;
  
  try {
    const res = await fetch('/api/accounts/contacts/' + accountId);
    const data = await res.json();
    if (data.success && data.contacts) {
      const select = document.getElementById('attendeeSelect');
      const existingIds = new Set((currentMeetingData.attendees || []).map(a => a.contactId).filter(Boolean));
      
      select.innerHTML = '<option value="">Add from contacts...</option>' +
        data.contacts
          .filter(c => !existingIds.has(c.contactId))
          .map(c => '<option value="' + c.contactId + '" data-name="' + c.name + '" data-title="' + (c.title || '') + '">' + c.name + (c.title ? ' - ' + c.title : '') + '</option>')
          .join('');
    }
  } catch (err) {
    console.error('Failed to load contacts:', err);
  }
}

// Add attendee from dropdown
function addAttendee(select) {
  const option = select.options[select.selectedIndex];
  if (!option.value) return;
  
  if (!currentMeetingData.attendees) currentMeetingData.attendees = [];
  currentMeetingData.attendees.push({
    name: option.dataset.name,
    contactId: option.value,
    title: option.dataset.title,
    isExternal: false
  });
  
  renderAttendeeChips();
  select.selectedIndex = 0;
  loadContactsForAttendee();
}

// Add external attendee
function addExternalAttendee() {
  const name = prompt('Enter attendee name:');
  if (!name) return;
  
  if (!currentMeetingData.attendees) currentMeetingData.attendees = [];
  currentMeetingData.attendees.push({
    name: name.trim(),
    isExternal: true
  });
  
  renderAttendeeChips();
}

// Remove attendee
function removeAttendee(index) {
  currentMeetingData.attendees.splice(index, 1);
  renderAttendeeChips();
  loadContactsForAttendee();
}

// Render attendee chips
function renderAttendeeChips() {
  const chips = document.getElementById('attendeeChips');
  chips.innerHTML = (currentMeetingData.attendees || []).map((a, i) => \`
    <span class="attendee-chip \${a.isExternal ? 'external' : ''}">
      \${a.name}
      <button class="attendee-remove" onclick="removeAttendee(\${i})">&times;</button>
    </span>
  \`).join('');
}

// Toggle demo subtext field
function toggleDemoSubtext(select) {
  const index = select.dataset.index;
  const subtext = document.querySelector('.demo-subtext[data-index="' + index + '"]');
  subtext.disabled = !select.value;
  if (!select.value) subtext.value = '';
}

// Save meeting prep
async function saveMeetingPrep() {
  // Gather form data
  const agenda = Array.from(document.querySelectorAll('.agenda-input')).map(el => el.value);
  const goals = Array.from(document.querySelectorAll('.goal-input')).map(el => el.value);
  const demoSelections = Array.from(document.querySelectorAll('.demo-select')).map((sel, i) => ({
    product: sel.value,
    subtext: document.querySelector('.demo-subtext[data-index="' + i + '"]').value
  }));
  
  const demoRequired = demoSelections.some(d => d.product);
  
  const payload = {
    meetingId: currentMeetingId,
    accountId: currentMeetingData.account_id || currentMeetingData.accountId,
    accountName: currentMeetingData.account_name || currentMeetingData.accountName,
    meetingTitle: currentMeetingData.meeting_title || currentMeetingData.meetingTitle,
    meetingDate: currentMeetingData.meeting_date || currentMeetingData.meetingDate,
    attendees: currentMeetingData.attendees || [],
    agenda,
    goals,
    demoRequired,
    demoSelections,
    contextSnapshot: {}
  };
  
  try {
    const res = await fetch('/api/meeting-prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.success) {
      closeModal();
      location.reload();
    } else {
      alert('Failed to save: ' + data.error);
    }
  } catch (err) {
    alert('Error saving meeting prep: ' + err.message);
  }
}

// Close modal
function closeModal() {
  document.getElementById('prepModal').classList.remove('active');
  currentMeetingId = null;
  currentMeetingData = null;
}

// Open create modal
function openCreateModal() {
  document.getElementById('createModal').classList.add('active');
  document.getElementById('createDate').value = '';
  document.getElementById('createTitle').value = '';
  document.getElementById('createAccount').selectedIndex = 0;
}

// Close create modal
function closeCreateModal() {
  document.getElementById('createModal').classList.remove('active');
}

// Create new meeting
async function createMeeting() {
  const accountSelect = document.getElementById('createAccount');
  const accountId = accountSelect.value;
  const accountName = accountSelect.options[accountSelect.selectedIndex]?.dataset?.name || '';
  const meetingTitle = document.getElementById('createTitle').value;
  const meetingDate = document.getElementById('createDate').value;
  
  if (!accountId || !meetingTitle || !meetingDate) {
    alert('Please fill in all required fields');
    return;
  }
  
  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId,
        accountName,
        meetingTitle,
        meetingDate: new Date(meetingDate).toISOString()
      })
    });
    
    const data = await res.json();
    if (data.success) {
      closeCreateModal();
      location.reload();
    } else {
      alert('Failed to create meeting: ' + data.error);
    }
  } catch (err) {
    alert('Error creating meeting: ' + err.message);
  }
}

// Escape HTML for safe insertion
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
</script>

</body>
</html>`;
}

// Format time helper
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

module.exports = {
  generateMeetingPrepHTML
};

