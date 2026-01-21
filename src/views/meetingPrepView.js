/**
 * Meeting Prep View
 * Week-at-a-glance layout with meeting cards and detail modal
 */

const meetingPrepService = require('../services/meetingPrepService');
const logger = require('../utils/logger');

/**
 * Server-side helper: Format time from ISO string
 */
function formatTimeServer(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Server-side helper: Render attendee chips for meeting card
 */
function renderAttendeeChips(meeting) {
  const external = meeting.externalAttendees || [];
  const internal = meeting.internalAttendees || [];
  
  // If no attendee data, show nothing
  if (external.length === 0 && internal.length === 0) {
    return '';
  }
  
  // Show up to 3 external attendees as chips, then count
  const externalChips = external.slice(0, 3).map(att => {
    const firstName = (att.name || att.email || 'Unknown').split(' ')[0].split('@')[0];
    return `<span class="attendee-chip external" title="${att.name || att.email}">${firstName}</span>`;
  }).join('');
  
  const moreCount = external.length > 3 ? external.length - 3 : 0;
  const moreChip = moreCount > 0 ? `<span class="attendee-chip external">+${moreCount}</span>` : '';
  
  // Build count string
  const countParts = [];
  if (external.length > 0) countParts.push(`<span class="external-count">${external.length} external</span>`);
  if (internal.length > 0) countParts.push(`${internal.length} internal`);
  
  return `
    <div class="meeting-attendees">
      ${externalChips}${moreChip}
    </div>
    <div class="attendee-count">${countParts.join(', ')}</div>
  `;
}

/**
 * Generate the Meeting Prep HTML page
 */
async function generateMeetingPrepHTML(filterUserId = null) {
  const weekRange = meetingPrepService.getCurrentWeekRange();
  let meetings = await meetingPrepService.getUpcomingMeetings(weekRange.start, weekRange.end);
  
  // Get BL users for filter dropdown
  let blUsers = [];
  try {
    blUsers = await meetingPrepService.getBLUsers();
  } catch (e) {
    logger.error('Failed to load BL users:', e);
  }
  
  // Filter by user if specified (pass both userId and email for Outlook matching)
  if (filterUserId) {
    const selectedUser = blUsers.find(u => u.userId === filterUserId);
    const userEmail = selectedUser?.email || null;
    meetings = meetingPrepService.filterMeetingsByUser(meetings, filterUserId, userEmail);
  }
  
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
  const firstMeetingTemplate = meetingPrepService.FIRST_MEETING_BL_TEMPLATE;
  
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-dropdown {
  padding: 10px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  background: #fff;
  color: #374151;
  cursor: pointer;
  min-width: 180px;
}

.filter-dropdown:focus {
  outline: none;
  border-color: #8e99e1;
}

.template-btn {
  background: #f0f9ff;
  border: 1px dashed #0ea5e9;
  color: #0369a1;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.template-btn:hover {
  background: #e0f2fe;
}

.attendee-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b7280;
  margin: 12px 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.attendee-section-label.external {
  color: #d97706;
}

.attendee-section-label.internal {
  color: #059669;
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
.meeting-source.outlook { background: #ecfdf5; color: #047857; }

/* Attendee Chips */
.meeting-attendees {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.attendee-chip {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attendee-chip.external {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.attendee-chip.internal {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.attendee-count {
  font-size: 0.65rem;
  color: #6b7280;
  margin-top: 6px;
}

.attendee-count .external-count {
  color: #d97706;
  font-weight: 500;
}

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

/* Enriched Attendee Intel Section */
.attendee-intel-section {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #0ea5e9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.attendee-intel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.attendee-intel-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0369a1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-badge {
  font-size: 0.6rem;
  background: #7c3aed;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.enriched-attendee {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.enriched-attendee:last-child {
  margin-bottom: 0;
}

.enriched-attendee-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.attendee-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #8e99e1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9rem;
}

.attendee-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.attendee-info {
  flex: 1;
}

.attendee-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1f2937;
}

.attendee-title-company {
  font-size: 0.75rem;
  color: #6b7280;
}

.seniority-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.seniority-badge.clo { background: #fef3c7; color: #92400e; }
.seniority-badge.gc { background: #dbeafe; color: #1e40af; }
.seniority-badge.director { background: #e0e7ff; color: #4338ca; }
.seniority-badge.manager { background: #f3e8ff; color: #7c3aed; }
.seniority-badge.other { background: #f3f4f6; color: #4b5563; }

.attendee-bio {
  font-size: 0.75rem;
  color: #4b5563;
  line-height: 1.5;
  margin-top: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.attendee-linkedin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: #0077b5;
  text-decoration: none;
  margin-top: 6px;
}

.attendee-linkedin:hover {
  text-decoration: underline;
}

.talking-points {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.talking-points-title {
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 4px;
}

.talking-point {
  font-size: 0.7rem;
  color: #4b5563;
  padding-left: 12px;
  position: relative;
  margin-bottom: 2px;
}

.talking-point::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: #8e99e1;
}

.enrichment-pending {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  padding: 12px;
  font-size: 0.75rem;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 8px;
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
    <div class="header-actions">
      <select class="filter-dropdown" id="userFilter" onchange="filterByUser(this.value)">
        <option value="">All Meetings</option>
        ${blUsers.map(u => `<option value="${u.userId}">${u.name}</option>`).join('')}
      </select>
      <button class="btn-primary" onclick="openCreateModal()">
        <span>+</span> Create Meeting
      </button>
    </div>
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
                 onclick="openMeetingPrep('${meeting.meeting_id || meeting.meetingId}')"
                 data-attendees='${JSON.stringify((meeting.attendees || meeting.externalAttendees || []).map(a => ({name: a.name, email: a.email, isExternal: a.isExternal})))}'>
              <div class="meeting-account">${meeting.account_name || meeting.accountName || 'Unknown'}</div>
              <div class="meeting-title">${meeting.meeting_title || meeting.meetingTitle || 'Untitled'}</div>
              <div class="meeting-time">
                ${formatTimeServer(meeting.meeting_date || meeting.meetingDate)}
                <span class="meeting-source ${meeting.source}">${meeting.source}</span>
              </div>
              ${renderAttendeeChips(meeting)}
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

// Format time from ISO string (client-side version for modal)
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
    
    // Trigger Clay enrichment for external attendees (fire and forget)
    const externalAttendees = currentMeetingData.externalAttendees || 
      (currentMeetingData.attendees || []).filter(a => a.isExternal);
    
    if (externalAttendees.length > 0) {
      triggerClayEnrichment(externalAttendees);
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
  let html = '<div class="context-section"><div class="context-header"><span class="context-title">Account Context</span></div><div class="context-content">';
  
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
    html += '<div class="context-item" style="margin-top: 12px;"><span class="context-label">Recent Slack Insights:</span></div>';
    ctx.slackIntel.slice(0, 3).forEach(intel => {
      html += '<div class="context-item" style="margin-left: 12px; font-size: 0.7rem;">[' + intel.category + '] ' + intel.summary + '</div>';
    });
  }
  
  if (ctx.priorMeetings?.length) {
    html += '<div class="context-item" style="margin-top: 12px;"><span class="context-label">Prior Meetings:</span> ' + ctx.priorMeetings.length + '</div>';
  }
  
  html += '</div></div>';
  return html;
}

// Render the prep form
function renderPrepForm(contextHtml) {
  const data = currentMeetingData;
  const attendees = data.attendees || [];
  const externalAttendees = data.externalAttendees || attendees.filter(a => a.isExternal);
  const internalAttendees = data.internalAttendees || attendees.filter(a => !a.isExternal);
  const agenda = data.agenda || ['', '', ''];
  const goals = data.goals || ['', '', ''];
  const demos = data.demoSelections || [{ product: '', subtext: '' }, { product: '', subtext: '' }, { product: '', subtext: '' }];
  
  // Check if any attendees have enriched bios
  const enrichedAttendees = externalAttendees.filter(a => a.bio && a.confidence !== 'low');
  const hasEnrichedAttendees = enrichedAttendees.length > 0;
  
  const demoOptions = '<option value="">Select product...</option>' + 
    DEMO_PRODUCTS.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  
  // Generate enriched attendee intel section
  const attendeeIntelHtml = hasEnrichedAttendees ? \`
    <div class="attendee-intel-section">
      <div class="attendee-intel-header">
        <span class="attendee-intel-title">
          👥 Attendee Intel <span class="ai-badge">AI-Generated</span>
        </span>
      </div>
      \${enrichedAttendees.map(a => \`
        <div class="enriched-attendee">
          <div class="enriched-attendee-header">
            <div class="attendee-avatar">
              \${a.headshotUrl ? '<img src="' + a.headshotUrl + '" alt="' + a.name + '">' : getInitials(a.name)}
            </div>
            <div class="attendee-info">
              <div class="attendee-name">\${a.name}</div>
              <div class="attendee-title-company">\${a.title || 'Title unknown'} • \${a.company || 'Company unknown'}</div>
            </div>
            <span class="seniority-badge \${getSeniorityClass(a.seniority)}">\${a.seniority || 'Unknown'}</span>
          </div>
          \${a.bio ? '<div class="attendee-bio">' + a.bio + '</div>' : ''}
          \${a.linkedinUrl ? '<a href="' + a.linkedinUrl + '" target="_blank" class="attendee-linkedin">🔗 LinkedIn Profile</a>' : ''}
          \${a.talkingPoints && a.talkingPoints.length > 0 ? \`
            <div class="talking-points">
              <div class="talking-points-title">Suggested Talking Points</div>
              \${a.talkingPoints.map(tp => '<div class="talking-point">' + tp + '</div>').join('')}
            </div>
          \` : ''}
        </div>
      \`).join('')}
    </div>
  \` : (externalAttendees.length > 0 ? \`
    <div class="enrichment-pending">
      ⏳ Attendee enrichment pending — profiles will be generated automatically
    </div>
  \` : '');
  
  document.getElementById('modalBody').innerHTML = \`
    \${contextHtml}
    
    \${attendeeIntelHtml}
    
    <div class="form-section">
      <div class="form-section-title">Attendees</div>
      
      \${externalAttendees.length > 0 ? \`
        <div class="attendee-section-label external">External Attendees (\${externalAttendees.length})</div>
        <div class="attendee-chips">
          \${externalAttendees.map((a, i) => \`
            <span class="attendee-chip external">
              \${a.name}\${a.title ? ' - ' + a.title : ''}
              <button class="attendee-remove" onclick="removeAttendee(\${i}, true)">&times;</button>
            </span>
          \`).join('')}
        </div>
      \` : ''}
      
      \${internalAttendees.length > 0 ? \`
        <div class="attendee-section-label internal">Internal Attendees (\${internalAttendees.length})</div>
        <div class="attendee-chips">
          \${internalAttendees.map((a, i) => \`
            <span class="attendee-chip">
              \${a.name}
            </span>
          \`).join('')}
        </div>
      \` : ''}
      
      <div class="attendees-section" style="margin-top: 12px;">
        <select class="input-field attendees-dropdown" id="attendeeSelect" onchange="addAttendee(this)">
          <option value="">Add from contacts...</option>
        </select>
        <button class="add-external-btn" onclick="addExternalAttendee()">+ Add External</button>
      </div>
      <div class="attendee-chips" id="attendeeChips">
        \${(data.addedAttendees || []).map((a, i) => \`
          <span class="attendee-chip \${a.isExternal ? 'external' : ''}">
            \${a.name}
            <button class="attendee-remove" onclick="removeAddedAttendee(\${i})">&times;</button>
          </span>
        \`).join('')}
      </div>
    </div>
    
    <div class="form-section">
      <div class="form-section-title">Agenda</div>
      <button class="template-btn" onclick="loadFirstMeetingTemplate()">Load First Meeting Template</button>
      \${agenda.map((item, i) => \`
        <div class="input-row">
          <span class="input-number">\${i + 1}.</span>
          <input type="text" class="input-field agenda-input" value="\${escapeHtml(item || '')}" placeholder="Agenda item \${i + 1}">
        </div>
      \`).join('')}
    </div>
    
    <div class="form-section">
      <div class="form-section-title">Meeting Goals</div>
      \${goals.map((item, i) => \`
        <div class="input-row">
          <span class="input-number">\${i + 1}.</span>
          <input type="text" class="input-field goal-input" value="\${escapeHtml(item || '')}" placeholder="Goal \${i + 1}">
        </div>
      \`).join('')}
    </div>
    
    <div class="form-section">
      <div class="form-section-title">Demo Requirements</div>
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

// Filter by user
function filterByUser(userId) {
  // Store in localStorage for persistence
  if (userId) {
    localStorage.setItem('meetingPrepUserFilter', userId);
  } else {
    localStorage.removeItem('meetingPrepUserFilter');
  }
  
  // Reload the page with filter parameter
  const url = new URL(window.location.href);
  if (userId) {
    url.searchParams.set('filterUser', userId);
  } else {
    url.searchParams.delete('filterUser');
  }
  window.location.href = url.toString();
}

// Load first meeting template (standard BL template)
function loadFirstMeetingTemplate() {
  const hasContent = 
    Array.from(document.querySelectorAll('.agenda-input')).some(el => el.value.trim()) ||
    Array.from(document.querySelectorAll('.goal-input')).some(el => el.value.trim());
  
  if (hasContent && !confirm('This will overwrite existing agenda and goals. Continue?')) {
    return;
  }
  
  // BL Standard First Meeting Template
  const template = {
    agenda: [
      'Discovery around current state of AI at the customer (qualification opportunity)',
      'Give the pitch',
      'Introduce the CAB'
    ],
    goals: [
      'Qualify customer',
      'Identify stakeholder for priority use case, CLO agrees to connect us',
      'CLO agrees to learn more about CAB and/or sign a memorandum'
    ]
  };
  
  // Populate agenda fields
  const agendaInputs = document.querySelectorAll('.agenda-input');
  template.agenda.forEach((item, i) => {
    if (agendaInputs[i]) agendaInputs[i].value = item;
  });
  
  // Populate goals fields
  const goalInputs = document.querySelectorAll('.goal-input');
  template.goals.forEach((item, i) => {
    if (goalInputs[i]) goalInputs[i].value = item;
  });
  
  // Update currentMeetingData
  currentMeetingData.agenda = template.agenda;
  currentMeetingData.goals = template.goals;
  
  // Show confirmation
  const templateBtn = document.querySelector('.template-btn');
  if (templateBtn) {
    templateBtn.textContent = 'Template Applied';
    templateBtn.style.background = '#dcfce7';
    templateBtn.style.borderColor = '#10b981';
    templateBtn.style.color = '#166534';
    templateBtn.disabled = true;
  }
}

// Remove added attendee (ones added via form, not from SF event)
function removeAddedAttendee(index) {
  if (!currentMeetingData.addedAttendees) return;
  currentMeetingData.addedAttendees.splice(index, 1);
  renderAddedAttendeeChips();
}

// Render added attendee chips
function renderAddedAttendeeChips() {
  const chips = document.getElementById('attendeeChips');
  if (!chips) return;
  chips.innerHTML = (currentMeetingData.addedAttendees || []).map((a, i) => \`
    <span class="attendee-chip \${a.isExternal ? 'external' : ''}">
      \${a.name}
      <button class="attendee-remove" onclick="removeAddedAttendee(\${i})">&times;</button>
    </span>
  \`).join('');
}

// Initialize user filter from localStorage on page load
(function initUserFilter() {
  const savedFilter = localStorage.getItem('meetingPrepUserFilter');
  if (savedFilter) {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('filterUser')) {
      // Apply saved filter if not already in URL
      const select = document.getElementById('userFilter');
      if (select) {
        select.value = savedFilter;
        // Reload with filter (only once)
        filterByUser(savedFilter);
      }
    } else {
      // Set dropdown to match URL param
      const select = document.getElementById('userFilter');
      if (select) select.value = urlParams.get('filterUser');
    }
  }
})();

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

// Get initials from name
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

// Get CSS class for seniority badge
function getSeniorityClass(seniority) {
  if (!seniority) return 'other';
  const s = seniority.toLowerCase();
  if (s.includes('clo') || s.includes('chief')) return 'clo';
  if (s.includes('gc') || s.includes('general counsel')) return 'gc';
  if (s.includes('director') || s.includes('vp')) return 'director';
  if (s.includes('manager')) return 'manager';
  return 'other';
}

// Trigger Clay enrichment for external attendees (fire and forget)
async function triggerClayEnrichment(attendees) {
  if (!attendees || attendees.length === 0) return;
  
  try {
    const response = await fetch('/api/clay/enrich-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendees: attendees.map(a => ({
          name: a.name || '',
          email: a.email || ''
        }))
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Clay enrichment triggered:', result.submitted, 'attendees submitted');
    } else {
      console.warn('Clay enrichment failed:', result.error);
    }
  } catch (err) {
    console.warn('Failed to trigger Clay enrichment:', err.message);
    // Don't throw - this is fire and forget
  }
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

