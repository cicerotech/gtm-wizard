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
 * Format sync time for display (e.g., "2 hours ago")
 */
function formatSyncTime(isoString) {
  if (!isoString) return 'never';
  const syncDate = new Date(isoString);
  const now = new Date();
  const diffMs = now - syncDate;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return syncDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Abbreviate common legal/executive titles for compact display
 */
function abbreviateTitle(title) {
  if (!title) return '';
  const lower = title.toLowerCase();
  
  const abbreviations = {
    'general counsel': 'GC',
    'chief legal officer': 'CLO',
    'chief compliance officer': 'CCO',
    'head of legal': 'Legal',
    'deputy general counsel': 'DGC',
    'associate general counsel': 'AGC',
    'assistant general counsel': 'AGC',
    'vp of legal': 'VP Legal',
    'vice president of legal': 'VP Legal',
    'vp legal': 'VP Legal',
    'vp, legal': 'VP Legal',
    'director of legal': 'Dir Legal',
    'senior counsel': 'Sr. Counsel',
    'corporate counsel': 'Corp Counsel',
    'legal counsel': 'Counsel',
    'corporate secretary': 'Corp Sec',
    'senior director': 'Sr. Dir',
    'senior manager': 'Sr. Mgr',
    'director': 'Dir',
    'manager': 'Mgr',
    'senior vice president': 'SVP',
    'vice president': 'VP',
    'chief executive officer': 'CEO',
    'chief financial officer': 'CFO',
    'chief technology officer': 'CTO',
    'chief operating officer': 'COO'
  };
  
  for (const [full, abbr] of Object.entries(abbreviations)) {
    if (lower.includes(full)) return abbr;
  }
  
  // If title is short enough, return as-is
  if (title.length <= 15) return title;
  
  // Otherwise return first word or first 12 chars
  const firstWord = title.split(' ')[0];
  return firstWord.length <= 12 ? firstWord : firstWord.substring(0, 10) + '...';
}

/**
 * Normalize and format attendee name for display
 * Handles: email-style names (first.last), run-together names (Flastname), 
 * "Last, First" format, ALL CAPS, and mixed case issues
 */
function formatAttendeeName(att) {
  let name = att.name || '';
  
  // If no name or name looks like an email, extract from email
  if (!name || name.includes('@')) {
    const email = att.email || '';
    if (email) {
      const localPart = email.split('@')[0];
      name = parseEmailLocalPart(localPart);
    }
  }
  
  // If name contains periods/underscores but no spaces, it's email-style (e.g., "steve.drake")
  if (name && !name.includes(' ') && /[._-]/.test(name)) {
    name = parseEmailLocalPart(name);
  }
  
  // Handle run-together names like "Dcronkey" or "Njellis" (FirstInitialLastName)
  // Pattern: Single capital followed by lowercase = likely run-together
  if (name && !name.includes(' ') && name.length > 3) {
    // Check if it looks like FirstInitialLastname (e.g., "Dcronkey" -> "D. Cronkey")
    const runTogetherMatch = name.match(/^([A-Z])([a-z]+)$/);
    if (runTogetherMatch) {
      const initial = runTogetherMatch[1];
      const lastName = runTogetherMatch[2];
      name = initial + '. ' + lastName.charAt(0).toUpperCase() + lastName.slice(1);
    }
    // Check for "FirstnameLastname" pattern (e.g., "NickEllis" -> "Nick Ellis")
    const camelMatch = name.match(/^([A-Z][a-z]+)([A-Z][a-z]+)$/);
    if (camelMatch) {
      name = camelMatch[1] + ' ' + camelMatch[2];
    }
  }
  
  // Handle "Last, First" format
  if (name.includes(',')) {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      name = parts[1] + ' ' + parts[0];
    }
  }
  
  // Normalize ALL CAPS
  if (name === name.toUpperCase() && name.length > 3) {
    name = name.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Final cleanup: ensure proper capitalization for single words
  if (name && !name.includes(' ') && name.length > 1) {
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  
  return name || 'Unknown';
}

/**
 * Parse email local part (before @) into a readable name
 * e.g., "john.smith" -> "John Smith", "jsmith123" -> "Jsmith"
 */
function parseEmailLocalPart(localPart) {
  return localPart
    .replace(/\d+$/g, '')           // Remove trailing numbers
    .replace(/[._-]/g, ' ')         // Replace separators with spaces
    .trim()
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Server-side helper: Render attendee chips for meeting card
 * Shows formatted names with title abbreviations when available
 */
function renderAttendeeChips(meeting) {
  const rawExternal = meeting.externalAttendees || [];
  const rawInternal = meeting.internalAttendees || [];
  
  // Filter out ghost attendees and EAs inline (functions defined later in file)
  // Ghost attendee check: conference rooms, dial-ins, system emails
  const isGhost = (a) => {
    const email = (a.email || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    if (email.includes('zoom') || email.includes('teams') || email.includes('webex')) return true;
    if (email.includes('conference') || email.includes('room') || email.includes('bridge')) return true;
    if (name.includes('conference') || name.includes('meeting room') || name.includes('dial-in')) return true;
    return false;
  };
  
  // EA check: Alyssa Gradstein and Cassie Farber
  const isEA = (a) => {
    const email = (a.email || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    if (email.includes('alyssa.gradstein') || email.includes('cassie.farber')) return true;
    if (name.includes('alyssa') && name.includes('gradstein')) return true;
    if (name.includes('cassie') && name.includes('farber')) return true;
    // Catch truncated names
    if (name.includes('alyssa') && name.includes('gradstei')) return true;
    return false;
  };
  
  const external = rawExternal.filter(a => !isGhost(a) && !isEA(a));
  const internal = rawInternal.filter(a => !isEA(a));
  
  // If no attendee data after filtering, show nothing
  if (external.length === 0 && internal.length === 0) {
    return '';
  }
  
  // Show up to 3 external attendees as chips with enhanced formatting
  const externalChips = external.slice(0, 3).map(att => {
    const fullName = formatAttendeeName(att);
    // Get first name and last initial for compact display
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] + '.' : '';
    const displayName = nameParts.length > 1 ? `${firstName} ${lastInitial}` : firstName;
    
    // Add title abbreviation if available
    const titleAbbr = att.title ? abbreviateTitle(att.title) : '';
    const chipContent = titleAbbr 
      ? `${displayName} <span class="chip-title">(${titleAbbr})</span>`
      : displayName;
    
    return `<span class="attendee-chip external" title="${fullName}${att.title ? ' - ' + att.title : ''}">${chipContent}</span>`;
  }).join('');
  
  const moreCount = external.length > 3 ? external.length - 3 : 0;
  const moreChip = moreCount > 0 ? `<span class="attendee-chip external">+${moreCount}</span>` : '';
  
  // Show internal attendees (BLs) as chips - up to 2 for space
  const internalChips = internal.slice(0, 2).map(att => {
    const fullName = formatAttendeeName(att);
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] + '.' : '';
    const displayName = nameParts.length > 1 ? `${firstName} ${lastInitial}` : firstName;
    return `<span class="attendee-chip internal" title="${fullName}">${displayName}</span>`;
  }).join('');
  
  const internalMoreCount = internal.length > 2 ? internal.length - 2 : 0;
  const internalMoreChip = internalMoreCount > 0 ? `<span class="attendee-chip internal">+${internalMoreCount}</span>` : '';
  
  // Build count string
  const countParts = [];
  if (external.length > 0) countParts.push(`<span class="external-count">${external.length} external</span>`);
  if (internal.length > 0) countParts.push(`${internal.length} internal`);
  
  return `
    <div class="meeting-attendees">
      ${externalChips}${moreChip}
    </div>
    <div class="meeting-attendees internal-row">
      ${internalChips}${internalMoreChip}
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
  
  // Get calendar sync status for display
  let syncStatus = null;
  try {
    const { getSyncStatus } = require('../jobs/calendarSyncJob');
    syncStatus = await getSyncStatus();
  } catch (e) {
    logger.debug('Could not get calendar sync status:', e.message);
  }
  
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
  
  // Generate rolling day view - today + next 4 business days
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekDays = [];
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Start of today
  
  while (weekDays.length < 5) {
    const dayOfWeek = currentDate.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      weekDays.push({
        name: dayNames[dayOfWeek],
        key: dayKeys[dayOfWeek],
        date: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: currentDate.toISOString().split('T')[0],
        isToday: weekDays.length === 0 && dayOfWeek === new Date().getDay()
      });
    }
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); // Next day
  }
  
  // Group meetings by date (YYYY-MM-DD format)
  const grouped = {};
  for (const day of weekDays) {
    grouped[day.fullDate] = [];
  }
  
  for (const meeting of meetings) {
    const dateStr = meeting.meetingDate || meeting.meeting_date;
    if (!dateStr) continue;
    
    // Filter out internal-only meetings (no external attendees = internal sync)
    const externalAttendees = meeting.externalAttendees || [];
    // Apply ghost/EA filters to get real external attendees
    const realExternal = externalAttendees.filter(a => {
      const email = (a.email || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      // Ghost check
      if (email.includes('zoom') || email.includes('teams') || email.includes('webex')) return false;
      if (email.includes('conference') || email.includes('room') || email.includes('bridge')) return false;
      if (name.includes('conference') || name.includes('meeting room') || name.includes('dial-in')) return false;
      // EA check
      if (email.includes('alyssa.gradstein') || email.includes('cassie.farber')) return false;
      return true;
    });
    
    // Skip meetings with no real external attendees (internal syncs)
    if (realExternal.length === 0) continue;
    
    const meetingDate = new Date(dateStr);
    const fullDate = meetingDate.toISOString().split('T')[0];
    
    if (grouped[fullDate]) {
      grouped[fullDate].push(meeting);
    }
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

.sync-status {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 4px;
  margin-top: 6px;
  display: inline-block;
}

.sync-status.synced {
  background: #d1fae5;
  color: #065f46;
}

.sync-status.syncing {
  background: #fef3c7;
  color: #92400e;
  animation: pulse 1.5s infinite;
}

.sync-status.no-data {
  background: #fee2e2;
  color: #991b1b;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-badge {
  font-size: 0.65rem;
  background: #8e99e1;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.day-column.today {
  border: 2px solid #8e99e1;
}

.day-column.today .day-header {
  background: linear-gradient(135deg, #eef1ff 0%, #e8ebff 100%);
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

.meeting-attendees.internal-row {
  margin-top: 4px;
}

.attendee-chip {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attendee-chip.external {
  background: #ede9fe;
  color: #5b21b6;
  border: 1px solid #c4b5fd;
}

.attendee-chip .chip-title {
  font-size: 0.55rem;
  color: #b45309;
  font-weight: 500;
  margin-left: 2px;
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

.modal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.copy-link-btn {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-link-btn:hover {
  background: #e5e7eb;
}

.copy-link-btn.copied {
  background: #10b981;
  color: white;
  border-color: #10b981;
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
  background: #ede9fe;
}

.attendee-remove {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.9rem;
}

/* Attendee Card List (with enrichment data) */
.attendee-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.attendee-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  transition: all 0.2s ease;
}

.attendee-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.attendee-card.enriched {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-color: #94a3b8;
}

.attendee-card.enriched:hover {
  border-color: #64748b;
}

/* Summary-first card layout */
.attendee-summary {
  font-size: 0.85rem;
  color: #374151;
  line-height: 1.6;
  margin-bottom: 12px;
}

.attendee-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.08);
}

.company-tag {
  background: #f3f4f6;
  color: #4b5563;
  font-size: 0.7rem;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.attendee-card.enriched .company-tag {
  background: rgba(100, 116, 139, 0.15);
  color: #475569;
}

.linkedin-link {
  text-decoration: none;
  font-size: 1rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.linkedin-link:hover {
  opacity: 1;
}

/* Fallback layout for non-enriched attendees */
.attendee-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.attendee-card-header .attendee-name {
  font-weight: 600;
  color: #111827;
  font-size: 0.9rem;
}

.attendee-pending {
  font-size: 0.75rem;
  color: #9ca3af;
  font-style: italic;
  margin-top: 6px;
}

.attendee-card-header .linkedin-link {
  text-decoration: none;
  font-size: 1rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.attendee-card-header .linkedin-link:hover {
  opacity: 1;
}

.attendee-card-details {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 2px;
}

.attendee-card-details .attendee-title {
  color: #374151;
  font-weight: 500;
}

.attendee-card-details .attendee-company::before {
  content: '•';
  margin-right: 8px;
  color: #9ca3af;
}

.attendee-email {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Attendee meta row (title + company in footer) */
.attendee-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.attendee-title-badge {
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.attendee-card.enriched .attendee-title-badge {
  background: #e2e8f0;
  color: #475569;
}

/* LinkedIn link variations */
.linkedin-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0077b5;
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 500;
  transition: color 0.2s;
}

.linkedin-link:hover {
  color: #005582;
}

.linkedin-link-small {
  display: inline-block;
  color: #0077b5;
  text-decoration: none;
  font-size: 0.7rem;
  margin-top: 6px;
}

.linkedin-link-small:hover {
  text-decoration: underline;
}

/* Unified Attendee Intel Cards */
.attendee-intel-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.unified-attendee-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  transition: all 0.2s ease;
}

.unified-attendee-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.unified-attendee-card.enriched {
  border-color: #64748b;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.attendee-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.attendee-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.attendee-header-info {
  flex: 1;
}

.attendee-header-info .attendee-name {
  font-weight: 600;
  color: #111827;
  font-size: 0.95rem;
  margin-bottom: 2px;
}

.attendee-title-company {
  font-size: 0.8rem;
  color: #6b7280;
}

.attendee-bio {
  font-size: 0.85rem;
  color: #374151;
  line-height: 1.6;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  margin: 10px 0;
}

.unified-attendee-card.enriched .attendee-bio {
  background: #f1f5f9;
}

.attendee-linkedin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0077b5;
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  margin-top: 8px;
  transition: color 0.2s;
}

.attendee-linkedin:hover {
  color: #005582;
  text-decoration: underline;
}

.attendee-linkedin-fallback {
  font-size: 0.65rem;
  color: #6b7280;
  text-decoration: none;
  margin-left: 6px;
}

.attendee-linkedin-fallback:hover {
  color: #0077b5;
  text-decoration: underline;
}

.attendee-linkedin-search {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.75rem;
  margin-top: 8px;
  transition: color 0.2s;
}

.attendee-linkedin-search:hover {
  color: #0077b5;
  text-decoration: underline;
}

.attendee-pending-subtle {
  font-size: 0.75rem;
  color: #9ca3af;
  font-style: italic;
  margin-top: 8px;
}

.ai-badge {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  margin-left: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Legacy Enriched Attendee Intel Section (keeping for backward compat) */
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
      ${syncStatus ? `
        <div class="sync-status ${syncStatus.syncInProgress ? 'syncing' : syncStatus.databaseStats?.totalEvents > 0 ? 'synced' : 'no-data'}">
          ${syncStatus.syncInProgress ? 'Syncing calendars...' : 
            syncStatus.databaseStats?.totalEvents > 0 ? 
              `${syncStatus.databaseStats.customerMeetings} meetings cached (${formatSyncTime(syncStatus.syncStatus?.lastSync)})` :
              'Calendar sync pending...'}
        </div>
      ` : ''}
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
      <div class="day-column ${day.isToday ? 'today' : ''}">
        <div class="day-header">
          <div class="day-name">${day.name}${day.isToday ? ' <span class="today-badge">Today</span>' : ''}</div>
          <div class="day-date">${day.date}</div>
        </div>
        <div class="day-meetings" id="meetings-${day.fullDate}">
          ${(grouped[day.fullDate] || []).length === 0 ? `
            <div class="empty-day">No meetings</div>
          ` : (grouped[day.fullDate] || []).map(meeting => `
            <div class="meeting-card ${meeting.agenda?.some(a => a?.trim()) ? 'has-prep' : ''}" 
                 onclick="openMeetingPrep('${meeting.meeting_id || meeting.meetingId}')"
                 data-meeting-id="${meeting.meeting_id || meeting.meetingId}">
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
      <div class="modal-actions">
        <button class="copy-link-btn" onclick="copyMeetingLink()" title="Copy shareable link">
          🔗 Copy Link
        </button>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
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
const MEETINGS_DATA = ${JSON.stringify(
  meetings.reduce((acc, m) => {
    const id = m.meeting_id || m.meetingId;
    acc[id] = {
      meetingId: id,
      accountName: m.account_name || m.accountName || 'Unknown',
      meetingTitle: m.meeting_title || m.meetingTitle || 'Untitled',
      meetingDate: m.meeting_date || m.meetingDate,
      accountId: m.account_id || m.accountId || null,
      source: m.source || 'unknown',
      externalAttendees: (m.externalAttendees || []).map(a => ({
        name: a.name || '',
        email: a.email || '',
        isExternal: true
      })),
      internalAttendees: (m.internalAttendees || []).map(a => ({
        name: a.name || '',
        email: a.email || '',
        isExternal: false
      }))
    };
    return acc;
  }, {})
)};
let currentMeetingId = null;
let currentMeetingData = null;
let accountsList = [];

// EA exclusion list - Executive Assistants to filter from internal attendees
// Use partial names/emails for robust matching (handles truncated display names)
// EA exclusion list - Executive Assistants to completely exclude from all views
// Uses multiple matching strategies for robust filtering
const EA_EXCLUSIONS = [
  { name: 'alyssa gradstein', email: 'alyssa.gradstein', aliases: ['alyssa', 'gradstein', 'gradstei'] },
  { name: 'cassie farber', email: 'cassie.farber', aliases: ['cassie', 'farber'] }
];

// Check if attendee is an EA (should be excluded from ALL views)
function isExecutiveAssistant(attendee) {
  if (!attendee) return false;
  
  const email = (attendee.email || '').toLowerCase();
  const rawName = attendee.name || attendee.full_name || attendee.fullName || '';
  const name = rawName.toLowerCase().replace(/[,.\-_@]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return EA_EXCLUSIONS.some(ea => {
    // Match by email (partial - handles variations)
    if (email && email.includes(ea.email)) return true;
    
    // Match by any alias (catches truncated names like "Alyssa Gradstei")
    for (const alias of (ea.aliases || [])) {
      if (name.includes(alias) || email.includes(alias)) return true;
    }
    
    // Match by full name parts
    const eaParts = ea.name.split(' ');
    const firstName = eaParts[0] || '';
    const lastName = eaParts[1] || '';
    
    // Match if name contains both first name AND any portion of last name (at least 4 chars)
    if (firstName && lastName) {
      const hasFirst = name.includes(firstName);
      const hasLastPartial = name.includes(lastName.substring(0, Math.min(4, lastName.length)));
      if (hasFirst && hasLastPartial) return true;
    }
    
    return false;
  });
}

// Normalize name display (handles "Last, First" format)
function normalizeName(rawName) {
  if (!rawName) return 'Unknown';
  
  const name = rawName.trim();
  
  // Pattern: "Last, First" or "Last, First Middle"
  if (name.includes(',')) {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const [lastName, ...rest] = parts;
      const firstName = rest.join(' ').trim();
      return firstName + ' ' + lastName;
    }
  }
  
  // Pattern: All caps - normalize to title case
  if (name === name.toUpperCase() && name.length > 3) {
    return name.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  
  return name;
}

/**
 * Extract a readable name from an email address
 * Handles patterns like: first.last@, first_last@, firstlast1@
 * @param {string} email - Email address
 * @returns {string} Extracted name in Title Case
 */
function extractNameFromEmail(email) {
  if (!email || !email.includes('@')) return 'Unknown';
  
  const localPart = email.split('@')[0];
  
  // Handle patterns: first.last, first_last, first-last, firstlast1
  let name = localPart
    .replace(/\d+$/g, '')           // Remove trailing numbers (e.g., jsmith1 → jsmith)
    .replace(/[._-]/g, ' ')         // Replace dots, underscores, hyphens with spaces
    .replace(/(\d+)/g, ' ')         // Replace any remaining numbers with spaces
    .trim();
  
  // If still no spaces (e.g., "jsmith"), try to split on camelCase or common patterns
  if (!name.includes(' ') && name.length > 3) {
    // Try camelCase split: johnSmith → john Smith
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  
  // Title case each word
  return name
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract the best available full name for an attendee
 * Priority: full_name from enrichment > name extracted from summary > raw name > email extraction
 * @param {Object} attendee - Attendee object with name/email/enrichment data
 * @param {string} summary - Parsed summary text (may contain full name at start)
 * @returns {string} Best available full name
 */
function extractBestName(attendee, summary) {
  // Priority 1: full_name from Clay enrichment
  if (attendee.full_name && attendee.full_name.trim().length > 2 && !attendee.full_name.includes('@')) {
    const fullName = normalizeName(attendee.full_name);
    if (fullName.includes(' ') || fullName.length > 5) {
      console.log('[Name Extract] Using full_name:', fullName);
      return fullName;
    }
  }
  
  // Priority 2: Extract name from summary (format: "FirstName LastName – Title...")
  if (summary && typeof summary === 'string') {
    const dashMatch = summary.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[–\-—]/);
    if (dashMatch && dashMatch[1]) {
      console.log('[Name Extract] Extracted from summary:', dashMatch[1]);
      return dashMatch[1].trim();
    }
  }
  
  // Priority 3: Raw name field (normalize it)
  if (attendee.name && attendee.name.trim().length > 2 && !attendee.name.includes('@')) {
    const normalizedName = normalizeName(attendee.name);
    
    // If it's a single word, try to expand from email
    if (!normalizedName.includes(' ') && attendee.email) {
      const emailName = extractNameFromEmail(attendee.email);
      // If email gives us a two-part name, use it but keep the original as last name
      if (emailName.includes(' ')) {
        console.log('[Name Extract] Expanded single name via email:', emailName);
        return emailName;
      }
    }
    
    console.log('[Name Extract] Using normalized name:', normalizedName);
    return normalizedName;
  }
  
  // Priority 4: Extract from email
  if (attendee.email) {
    const emailName = extractNameFromEmail(attendee.email);
    console.log('[Name Extract] Extracted from email:', emailName);
    return emailName;
  }
  
  return 'Unknown';
}

/**
 * Check if an attendee has valid enrichment data (not limited/empty)
 * Returns true if attendee has: title, LinkedIn URL, or valid summary
 * @param {Object} attendee - Attendee object with potential enrichment
 * @returns {boolean} True if has useful enrichment data
 */
function hasValidEnrichment(attendee) {
  // Check for title - valid if exists and non-empty
  const title = attendee.title || '';
  if (title.trim().length > 0) return true;
  
  // Check for LinkedIn URL - valid if exists
  const linkedinUrl = attendee.linkedinUrl || attendee.linkedin_url || '';
  if (linkedinUrl.trim().length > 0) return true;
  
  // Check for summary/bio - use parsed version
  const rawSummary = attendee.summary || attendee.attendee_summary || attendee.bio || '';
  const summary = parseAttendeeSummary(rawSummary);
  
  // No summary at all
  if (!summary || summary.trim().length === 0) return false;
  
  // Filter out "Profile information limited" results
  if (summary.toLowerCase().includes('profile information limited')) return false;
  
  // Too short to be useful (less than 30 chars is probably not a real bio)
  if (summary.trim().length < 30) return false;
  
  return true;
}

/**
 * Parse and clean attendee summary from Clay's JSON response
 * Extracts just the attendeeSummary text, filtering out metadata
 * @param {string} rawSummary - Raw summary (may be JSON or plain text)
 * @returns {string|null} Clean summary text or null if invalid
 */
function parseAttendeeSummary(rawSummary) {
  // CHECKPOINT 1: Validate input
  if (!rawSummary || typeof rawSummary !== 'string') {
    console.log('[Summary Parse] CHECKPOINT 1: Invalid input - null or not string');
    return null;
  }
  
  const trimmed = rawSummary.trim();
  
  // CHECKPOINT 2: Check if JSON format
  if (trimmed.startsWith('{')) {
    console.log('[Summary Parse] CHECKPOINT 2: Detected JSON format, attempting parse...');
    try {
      const parsed = JSON.parse(trimmed);
      
      // CHECKPOINT 3: Extract summary field
      // Priority: attendeeSummary > response > raw fallback
      const summary = parsed.attendeeSummary || parsed.response || null;
      
      if (!summary) {
        console.warn('[Summary Parse] CHECKPOINT 3: JSON parsed but no attendeeSummary/response field found. Keys:', Object.keys(parsed));
        return null;
      }
      
      // CHECKPOINT 4: Filter out "no data" responses
      const lowerSummary = summary.toLowerCase();
      if (lowerSummary.includes('no public linkedin data') || 
          lowerSummary.includes('profile information limited') ||
          lowerSummary.includes('unable to verify')) {
        console.log('[Summary Parse] CHECKPOINT 4: Filtered out "no data" response');
        return null;
      }
      
      console.log('[Summary Parse] SUCCESS: Extracted clean summary (' + summary.length + ' chars)');
      return summary;
      
    } catch (parseError) {
      // CHECKPOINT ERROR: JSON parse failed
      console.error('[Summary Parse] ERROR: Failed to parse JSON:', parseError.message);
      console.error('[Summary Parse] Raw input (first 200 chars):', trimmed.substring(0, 200));
      // Return as-is since it might be malformed but readable
      return trimmed;
    }
  }
  
  // CHECKPOINT 5: Plain text - return as-is (already clean)
  console.log('[Summary Parse] CHECKPOINT 5: Plain text format, returning as-is');
  
  // Still filter "no data" responses in plain text
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed.includes('no public linkedin data') || 
      lowerTrimmed.includes('profile information limited')) {
    console.log('[Summary Parse] Filtered out "no data" plain text');
    return null;
  }
  
  return trimmed;
}

/**
 * Post-process and standardize attendee summary for consistent display
 * Target format: "Name – Title at Company. [Unique details only]"
 * 
 * Key principle: NO DUPLICATION - aggressively strips all redundant name/title mentions
 * 
 * @param {string} summary - Raw or parsed summary
 * @param {string} displayName - The attendee's display name
 * @param {string} title - Job title if available
 * @param {string} company - Company name if available
 * @returns {string} Standardized summary
 */
function standardizeSummary(summary, displayName, title, company) {
  if (!summary) return null;
  
  let cleanSummary = summary.trim();
  
  // Build the header we'll use (this is the ONE place name/title should appear)
  let header = displayName + ' –';
  if (title && company) {
    header = displayName + ' – ' + title + ' at ' + company + '.';
  } else if (title) {
    header = displayName + ' – ' + title + '.';
  } else if (company) {
    header = displayName + ' at ' + company + '.';
  }
  
  // ======================================================================
  // STEP 1: Strip ALL variations of "Name – Title" and "Name is a Title"
  // ======================================================================
  let uniqueContent = cleanSummary;
  
  // Get name parts for matching (handle "First Last" and "First" alone)
  const firstName = displayName.split(' ')[0];
  const namePatterns = [displayName, firstName];
  
  // Remove ALL occurrences of these patterns (not just first):
  for (const name of namePatterns) {
    const escapedName = escapeRegex(name);
    
    // Pattern 1: "Name – Title at Company." (dash format)
    const dashPattern = new RegExp(escapedName + '\\s*[–\\-—]\\s*[^.]+(?:\\s+(?:at|of|for)\\s+[^.]+)?[.]\\s*', 'gi');
    uniqueContent = uniqueContent.replace(dashPattern, '').trim();
    
    // Pattern 2: "Name is a/an/the Title at Company." 
    const isPattern = new RegExp(escapedName + '\\s+is\\s+(?:a|an|the\\s+)?[^.]+(?:\\s+(?:at|of|for)\\s+[^.]+)?[.]\\s*', 'gi');
    uniqueContent = uniqueContent.replace(isPattern, '').trim();
    
    // Pattern 3: "Name, Title at Company," or "Name, the Title"
    const commaPattern = new RegExp(escapedName + ',\\s+(?:the\\s+)?[^,.]+(?:\\s+(?:at|of|for)\\s+[^,.]+)?[,.]\\s*', 'gi');
    uniqueContent = uniqueContent.replace(commaPattern, '').trim();
  }
  
  // Pattern 4: "He/She/They is/are a/the Title" at start
  uniqueContent = uniqueContent.replace(/^(?:They|He|She)\s+(?:is|are)\s+(?:a|an|the\s+)?[^.]+(?:\s+(?:at|of|for)\s+[^.]+)?[.]\s*/gi, '').trim();
  
  // ======================================================================
  // STEP 2: Check for contradictory info (different companies mentioned)
  // ======================================================================
  if (company && uniqueContent.length > 50) {
    const sentences = uniqueContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const mentionedCompanies = [];
    sentences.forEach(s => {
      const atMatch = s.match(/(?:at|for|with)\s+([A-Z][a-zA-Z\s&]+?)(?:\s+(?:since|from|in|\.|,|$))/i);
      if (atMatch) mentionedCompanies.push(atMatch[1].trim().toLowerCase());
    });
    
    // If different companies mentioned, truncate to first valid sentence only
    const uniqueCompanies = [...new Set(mentionedCompanies)].filter(c => c.length > 2);
    if (uniqueCompanies.length > 1) {
      console.log('[Summary Format] Contradictory companies detected:', uniqueCompanies);
      // Keep only first sentence after our header
      const firstSentence = sentences[0] || '';
      uniqueContent = firstSentence.trim();
    }
  }
  
  // ======================================================================
  // STEP 3: Build final summary with header + unique content
  // ======================================================================
  if (uniqueContent && uniqueContent.length > 10) {
    // Capitalize first letter of unique content
    uniqueContent = uniqueContent.charAt(0).toUpperCase() + uniqueContent.slice(1);
    console.log('[Summary Format] Extracted unique content:', uniqueContent.substring(0, 50) + '...');
    return header + ' ' + uniqueContent;
  }
  
  // If no unique content, just return the header (title + company is enough)
  console.log('[Summary Format] No unique content, using header only');
  return header;
}

// Helper: Escape special regex characters
function escapeRegex(str) {
  // Escape special regex characters: . * + ? ^ $ { } ( ) | [ ] \
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Helper: Capitalize first letter
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Build a LinkedIn search query that actually finds the person
 * Handles malformed names (single letters, initials, weird formats)
 * 
 * Example issues this fixes:
 * - "Hmanko I" → searches "Hmanko Charlesbank" (drops single-letter)
 * - "Jr A." → uses just company
 * - "Steve.Drake" → normalizes to "Steve Drake"
 */
function buildLinkedInSearchQuery(displayName, company) {
  if (!displayName) return company || '';
  
  // Normalize the name first (handle Steve.Drake formats)
  let normalizedName = displayName
    .replace(/\./g, ' ')      // Periods to spaces
    .replace(/_/g, ' ')       // Underscores to spaces
    .replace(/\s+/g, ' ')     // Multiple spaces to single
    .trim();
  
  // Split name into parts and filter out garbage
  const nameParts = normalizedName.split(/\s+/).filter(function(part) {
    // Remove single letters
    if (part.length <= 1) return false;
    // Remove common suffixes that don't help search
    if (/^(jr|sr|ii|iii|iv|mr|ms|mrs|dr)\.?$/i.test(part)) return false;
    // Remove parts that are just punctuation
    if (/^[^a-zA-Z]+$/.test(part)) return false;
    return true;
  });
  
  // If we have no valid name parts, just search by company
  if (nameParts.length === 0) {
    return company || '';
  }
  
  // Build search: FirstName + LastName (if valid) + Company
  // This is more reliable than full multi-word names
  var searchTerms = [];
  
  // Always include first name
  searchTerms.push(nameParts[0]);
  
  // Include last name only if it's substantial (>2 chars)
  if (nameParts.length > 1) {
    var lastName = nameParts[nameParts.length - 1];
    if (lastName.length > 2) {
      searchTerms.push(lastName);
    }
  }
  
  // Always include company for disambiguation
  if (company) {
    searchTerms.push(company);
  }
  
  return searchTerms.join(' ');
}

// ============================================================
// GHOST ATTENDEE FILTERING
// Filters out non-human calendar entries (conference rooms, dial-ins, etc.)
// This configuration is designed to be easily extensible
// ============================================================
const GHOST_ATTENDEE_CONFIG = {
  // Name patterns to exclude (case-insensitive partial match)
  namePatterns: [
    'conference',
    'meeting room',
    'video enabled',
    'dial-in',
    'dial in',
    'bridge',
    'huddle room',
    'board room',
    'training room',
    'phone room',
    'zoom room',
    'teams room',
    'webex',
    'polycom',
    'cisco'
  ],
  
  // Email local part prefixes to exclude (before @)
  emailPrefixes: [
    'corp',
    'conf',
    'room',
    'mtg',
    'bridge',
    'dial',
    'noreply',
    'no-reply',
    'calendar',
    'booking'
  ],
  
  // Regex patterns for complex email matching
  emailRegexPatterns: [
    /^[A-Z]{4,}[A-Z0-9]*\d{2,}[A-Z]?@/i,  // All-caps codes with numbers: CORPRMSS2320A@
    /^\d{4,}@/,                             // Starts with 4+ digits
    /^(room|conf|mtg|res)\d+@/i,           // room123@, conf456@, etc.
    /^[a-z]{1,3}\d{5,}@/i                  // Short prefix + many digits: rm12345@
  ]
};

/**
 * Determines if an attendee is a "ghost" (non-human calendar entry)
 * Examples: conference rooms, video bridges, dial-in numbers
 * @param {Object} attendee - { name, email }
 * @returns {boolean} true if should be filtered out
 */
function isGhostAttendee(attendee) {
  const email = (attendee.email || '').toLowerCase();
  const name = (attendee.name || '');
  const nameLower = name.toLowerCase();
  
  // Check name patterns
  for (const pattern of GHOST_ATTENDEE_CONFIG.namePatterns) {
    if (nameLower.includes(pattern)) {
      return true;
    }
  }
  
  // Check email prefixes
  const localPart = email.split('@')[0];
  for (const prefix of GHOST_ATTENDEE_CONFIG.emailPrefixes) {
    if (localPart.startsWith(prefix) && localPart.length > prefix.length) {
      // Ensure it's not a real name like "confalonieri@..."
      const afterPrefix = localPart.slice(prefix.length);
      if (/^\d/.test(afterPrefix) || afterPrefix.startsWith('-') || afterPrefix.startsWith('_')) {
        return true;
      }
    }
  }
  
  // Check email regex patterns
  for (const regex of GHOST_ATTENDEE_CONFIG.emailRegexPatterns) {
    if (regex.test(email)) {
      return true;
    }
  }
  
  // Check if name looks like a room code (e.g., "State Street Salem 2320 (11)")
  // Pattern: Contains both a multi-digit number AND parenthetical number
  if (/\(\d+\)/.test(name) && /\d{3,}/.test(name)) {
    return true;
  }
  
  // Check for very short or numeric-only local parts
  if (localPart.length <= 2 || /^\d+$/.test(localPart)) {
    return true;
  }
  
  return false;
}

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
  
  // Get meeting info from pre-loaded data
  const meetingInfo = MEETINGS_DATA[meetingId] || {};
  
  try {
    // Load saved meeting prep data
    const prepRes = await fetch('/api/meeting-prep/' + meetingId);
    const prepData = await prepRes.json();
    
    // Start with meeting info from Outlook (has attendees)
    currentMeetingData = {
      meetingId,
      accountName: meetingInfo.accountName || '',
      meetingTitle: meetingInfo.meetingTitle || '',
      meetingDate: meetingInfo.meetingDate || '',
      accountId: meetingInfo.accountId || null,
      source: meetingInfo.source || 'unknown',
      externalAttendees: meetingInfo.externalAttendees || [],
      internalAttendees: meetingInfo.internalAttendees || [],
      agenda: ['', '', ''],
      goals: ['', '', ''],
      demoSelections: [{ product: '', subtext: '' }, { product: '', subtext: '' }, { product: '', subtext: '' }],
      context: '',
      additionalNotes: ['', '', '']
    };
    
    // Merge with saved prep data if exists
    if (prepData.success && prepData.prep) {
      const saved = prepData.prep;
      currentMeetingData.agenda = saved.agenda || currentMeetingData.agenda;
      currentMeetingData.goals = saved.goals || currentMeetingData.goals;
      currentMeetingData.demoSelections = saved.demoSelections || currentMeetingData.demoSelections;
      currentMeetingData.context = saved.context || '';
      currentMeetingData.additionalNotes = saved.additionalNotes || ['', '', ''];
      // Merge attendees - prefer saved if they have more data, otherwise use Outlook
      if (saved.externalAttendees?.length > 0) {
        currentMeetingData.externalAttendees = saved.externalAttendees;
      }
      if (saved.internalAttendees?.length > 0) {
        currentMeetingData.internalAttendees = saved.internalAttendees;
      }
    }
    
    // Ensure arrays have 3 slots
    while ((currentMeetingData.agenda || []).length < 3) currentMeetingData.agenda.push('');
    while ((currentMeetingData.goals || []).length < 3) currentMeetingData.goals.push('');
    while ((currentMeetingData.demoSelections || []).length < 3) currentMeetingData.demoSelections.push({ product: '', subtext: '' });
    while ((currentMeetingData.additionalNotes || []).length < 3) currentMeetingData.additionalNotes.push('');
    
    // Fetch enrichment data for external attendees
    const externalEmails = (currentMeetingData.externalAttendees || [])
      .map(a => a.email)
      .filter(e => e);
    
    if (externalEmails.length > 0) {
      try {
        // Step 1: Try Clay enrichment first
        console.log('[Enrichment] Step 1: Fetching Clay enrichment for', externalEmails.length, 'attendees');
        const enrichRes = await fetch('/api/clay/get-enrichment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: externalEmails })
        });
        const enrichData = await enrichRes.json();
        
        if (enrichData.success && enrichData.enrichments) {
          // Merge enrichment data into attendees
          currentMeetingData.externalAttendees = currentMeetingData.externalAttendees.map(a => {
            const enrichment = enrichData.enrichments[a.email?.toLowerCase()];
            if (enrichment) {
              return {
                ...a,
                title: enrichment.title || a.title,
                linkedinUrl: enrichment.linkedinUrl || a.linkedinUrl,
                company: enrichment.company || a.company,
                summary: enrichment.summary || a.summary,
                enriched: true,
                source: 'clay'
              };
            }
            return a;
          });
        }
        
        // Step 2: Identify attendees needing fallback (no title AND no valid summary)
        const needsFallback = currentMeetingData.externalAttendees.filter(a => {
          const hasTitle = a.title && a.title.trim().length > 3;
          const summary = a.summary || '';
          const hasSummary = summary.length > 50 && 
            !summary.toLowerCase().includes('no public linkedin') &&
            !summary.toLowerCase().includes('profile information limited');
          return !hasTitle && !hasSummary;
        });
        
        console.log('[Enrichment] Step 2: ', needsFallback.length, 'attendees need fallback enrichment');
        
        // Step 3: Call fallback enrichment for those without data
        if (needsFallback.length > 0) {
          console.log('[Enrichment] Step 3: Calling Claude fallback for:', needsFallback.map(a => a.email));
          try {
            const fallbackRes = await fetch('/api/attendee/fallback-enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ attendees: needsFallback })
            });
            const fallbackData = await fallbackRes.json();
            
            if (fallbackData.success && fallbackData.enrichedAttendees) {
              console.log('[Enrichment] Step 4: Fallback complete. Sources:', fallbackData.sources);
              
              // Merge fallback data back into main array
              const fallbackMap = {};
              fallbackData.enrichedAttendees.forEach(a => {
                if (a.email) fallbackMap[a.email.toLowerCase()] = a;
              });
              
              currentMeetingData.externalAttendees = currentMeetingData.externalAttendees.map(a => {
                const fallback = fallbackMap[a.email?.toLowerCase()];
                if (fallback && (fallback.title || fallback.summary)) {
                  return {
                    ...a,
                    title: fallback.title || a.title,
                    summary: fallback.summary || a.summary,
                    source: fallback.source || 'claude_fallback',
                    confidence: fallback.confidence
                  };
                }
                return a;
              });
            }
          } catch (fallbackErr) {
            console.warn('[Enrichment] Fallback failed (non-critical):', fallbackErr.message);
          }
        }
        
      } catch (e) {
        console.error('Failed to fetch enrichment:', e);
      }
    }
    
    document.getElementById('modalTitle').textContent = currentMeetingData.accountName || 'Meeting Prep';
    document.getElementById('modalSubtitle').textContent = currentMeetingData.meetingTitle || '';
    
    // Load context - try accountId first, then lookup by external attendee domain
    let contextHtml = '';
    let accountId = currentMeetingData.account_id || currentMeetingData.accountId;
    
    // If no accountId, try to find account by external attendee domain
    if (!accountId && currentMeetingData.externalAttendees?.length > 0) {
      try {
        const firstExternal = currentMeetingData.externalAttendees[0];
        const domain = (firstExternal.email || '').split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain.toLowerCase())) {
          const lookupRes = await fetch('/api/account/lookup-by-domain?domain=' + encodeURIComponent(domain));
          const lookupData = await lookupRes.json();
          if (lookupData.success && lookupData.accountId) {
            accountId = lookupData.accountId;
            console.log('[Context] Found account by domain:', domain, '→', lookupData.accountName);
          }
        }
      } catch (e) {
        console.log('[Context] Domain lookup failed:', e.message);
      }
    }
    
    if (accountId) {
      try {
        const ctxRes = await fetch('/api/meeting-context/' + accountId);
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.context) {
          contextHtml = formatContextSection(ctxData.context, currentMeetingData);
        }
      } catch (e) {
        console.error('Failed to load context:', e);
      }
    }
    
    // Show empty state if no context loaded
    if (!contextHtml) {
      const accountName = currentMeetingData.accountName || 'this account';
      contextHtml = '<div class="context-section"><div class="context-content">';
      contextHtml += '<div style="padding: 16px; background: rgba(251, 191, 36, 0.1); border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.3);">';
      contextHtml += '<div style="font-size: 0.85rem; color: #fbbf24; margin-bottom: 6px;">First Engagement</div>';
      contextHtml += '<div style="font-size: 0.75rem; color: #9ca3af; line-height: 1.5;">No prior meetings on record for ' + accountName + '. ';
      contextHtml += 'Use Hyprnote to record this call and build account history.</div>';
      contextHtml += '</div></div></div>';
    }
    
    // Render form
    renderPrepForm(contextHtml);
    
  } catch (err) {
    console.error('Error loading meeting prep:', err);
    document.getElementById('modalBody').innerHTML = '<div style="color: #dc2626; padding: 20px;">Failed to load meeting: ' + err.message + '</div>';
  }
}

// Generate "Story So Far" narrative synthesis
// Combines meeting history, opportunity stage, and recent activity into a 2-3 sentence summary
function generateStorySoFar(ctx, meetingData) {
  const parts = [];
  const sf = ctx.salesforce;
  
  // Determine engagement phase
  const meetingCount = (ctx.meetingNotes?.length || 0) + (ctx.priorMeetings?.length || 0);
  const hasOpps = sf?.openOpportunities?.length > 0;
  const hasWins = sf?.recentWins?.length > 0;
  
  // Build narrative based on available data
  if (hasWins && sf.recentWins.length > 0) {
    // Existing customer
    const lastWin = sf.recentWins[0];
    const winDate = lastWin.closeDate ? new Date(lastWin.closeDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
    parts.push('Existing customer' + (winDate ? ' since ' + winDate : '') + '.');
    if (hasOpps) {
      const opp = sf.openOpportunities[0];
      parts.push('Active ' + (opp.salesType || 'opportunity') + ' in ' + (opp.stage || 'pipeline') + '.');
    }
  } else if (hasOpps) {
    // Active prospect with opportunity
    const opp = sf.openOpportunities[0];
    const stage = opp.stage || 'Unknown Stage';
    parts.push('Active prospect in ' + stage + '.');
    if (meetingCount > 0) {
      parts.push(meetingCount + ' meeting' + (meetingCount > 1 ? 's' : '') + ' on record.');
    }
  } else if (meetingCount > 0) {
    // Early engagement - meetings but no opp yet
    parts.push('Early engagement - ' + meetingCount + ' meeting' + (meetingCount > 1 ? 's' : '') + ' held.');
    parts.push('No active opportunity yet.');
  } else if (ctx.slackIntel?.length > 0) {
    // Only Slack intel
    parts.push('Account mentioned in Slack discussions.');
  }
  
  // Add most recent meeting context if available
  if (ctx.meetingNotes?.length > 0) {
    const lastNote = ctx.meetingNotes[0];
    if (lastNote.date && lastNote.rep) {
      parts.push('Last meeting: ' + lastNote.date + ' (' + lastNote.rep + ').');
    }
  }
  
  if (parts.length === 0) return '';
  
  return '<div style="margin-bottom: 12px; padding: 10px 12px; background: #f3f4f6; border-radius: 8px; border-left: 3px solid #6b7280;">' +
         '<div style="font-size: 0.7rem; color: #374151; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Story So Far</div>' +
         '<div style="font-size: 0.8rem; line-height: 1.5; color: #1f2937;">' + parts.join(' ') + '</div>' +
         '</div>';
}

// Format context section HTML with priority-based display
// Shows: Story So Far, Type, Owner, Recent Context (from various sources), Key Contacts
function formatContextSection(ctx, meetingData) {
  let html = '<div class="context-section"><div class="context-header"><span class="context-title">Account Context</span></div><div class="context-content">';
  
  // === STORY SO FAR (Synthesized Narrative) ===
  const storyHtml = generateStorySoFar(ctx, meetingData);
  if (storyHtml) {
    html += storyHtml;
  }
  
  // Account basics: Type and Owner only (industry removed - not actionable)
  if (ctx.salesforce) {
    const sf = ctx.salesforce;
    if (sf.customerType) html += '<div class="context-item"><span class="context-label">Type:</span> ' + sf.customerType + (sf.customerSubtype ? ' (' + sf.customerSubtype + ')' : '') + '</div>';
    if (sf.owner) html += '<div class="context-item"><span class="context-label">Owner:</span> ' + sf.owner + '</div>';
  }
  
  // === RECENT CONTEXT SECTION ===
  // Dynamic context from multiple sources with source indicators
  let hasRecentContext = false;
  let recentContextHtml = '<div style="margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px;">';
  recentContextHtml += '<div style="margin-bottom: 10px; font-size: 0.7rem; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Recent Context</div>';
  
  // Source 1: Meeting Notes from Customer Brain
  if (ctx.meetingNotes?.length) {
    hasRecentContext = true;
    ctx.meetingNotes.slice(0, 2).forEach(note => {
      recentContextHtml += '<div style="margin-bottom: 10px; padding: 8px; background: #f3f4f6; border-radius: 6px; border-left: 3px solid #6b7280;">';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #374151; margin-bottom: 2px; font-weight: 500;">Meeting Notes</div>';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 4px;">' + note.date + ' • ' + note.rep + '</div>';
      recentContextHtml += '<div style="font-size: 0.8rem; line-height: 1.4; color: #1f2937;">' + note.summary + '</div>';
      recentContextHtml += '</div>';
    });
  }
  
  // Source 2: Slack Intel
  if (ctx.slackIntel?.length) {
    hasRecentContext = true;
    ctx.slackIntel.slice(0, 2).forEach(intel => {
      recentContextHtml += '<div style="margin-bottom: 8px; padding: 8px; background: #f3f4f6; border-radius: 6px; border-left: 3px solid #6b7280;">';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #374151; margin-bottom: 2px; font-weight: 500;">Slack</div>';
      recentContextHtml += '<div style="font-size: 0.75rem; color: #1f2937;"><span style="color: #6b7280;">[' + intel.category + ']</span> ' + intel.summary + '</div>';
      recentContextHtml += '</div>';
    });
  }
  
  // Source 3: Prior Meeting Preps
  if (ctx.priorMeetings?.length) {
    hasRecentContext = true;
    ctx.priorMeetings.slice(0, 2).forEach(m => {
      const dateStr = m.date ? new Date(m.date).toLocaleDateString() : '';
      recentContextHtml += '<div style="margin-bottom: 6px; padding: 6px 8px; background: #f3f4f6; border-radius: 6px; border-left: 3px solid #6b7280;">';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #374151; margin-bottom: 2px; font-weight: 500;">Prior Prep</div>';
      recentContextHtml += '<div style="font-size: 0.75rem; color: #1f2937;">' + dateStr + ' - ' + (m.title || 'Meeting') + '</div>';
      recentContextHtml += '</div>';
    });
  }
  
  // Source 4: Obsidian Notes (synced from BL vaults)
  if (ctx.obsidianNotes?.length) {
    hasRecentContext = true;
    ctx.obsidianNotes.slice(0, 2).forEach(note => {
      const dateStr = note.date ? new Date(note.date).toLocaleDateString() : '';
      const sentimentColor = note.sentiment === 'Positive' ? '#10b981' : 
                            note.sentiment === 'Negative' ? '#ef4444' : '#6b7280';
      recentContextHtml += '<div style="margin-bottom: 10px; padding: 8px; background: #f3f4f6; border-radius: 6px; border-left: 3px solid #8b5cf6;">';
      recentContextHtml += '<div style="display: flex; justify-content: space-between; align-items: center;">';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #7c3aed; margin-bottom: 2px; font-weight: 500;">Obsidian Notes</div>';
      if (note.sentiment) {
        recentContextHtml += '<span style="font-size: 0.65rem; padding: 2px 6px; background: ' + sentimentColor + '20; color: ' + sentimentColor + '; border-radius: 4px;">' + note.sentiment + '</span>';
      }
      recentContextHtml += '</div>';
      recentContextHtml += '<div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 4px;">' + dateStr + ' • ' + (note.title || 'Meeting Note') + '</div>';
      if (note.summary) {
        recentContextHtml += '<div style="font-size: 0.8rem; line-height: 1.4; color: #1f2937;">' + note.summary.substring(0, 200) + (note.summary.length > 200 ? '...' : '') + '</div>';
      }
      recentContextHtml += '</div>';
    });
  }
  
  recentContextHtml += '</div>';
  
  // Only add Recent Context section if we have content
  if (hasRecentContext) {
    html += recentContextHtml;
  } else {
    // Empty state - first meeting or no context yet
    html += '<div style="margin-top: 12px; padding: 12px; background: rgba(251, 191, 36, 0.1); border-radius: 6px; border: 1px solid rgba(251, 191, 36, 0.3);">';
    html += '<div style="font-size: 0.8rem; color: #fbbf24;">No recent context available</div>';
    html += '<div style="font-size: 0.7rem; color: #9ca3af; margin-top: 4px;">First meeting? Record with Obsidian + Wispr Flow to build account history.</div>';
    html += '</div>';
  }
  
  // Always show: Open Opportunities
  if (ctx.salesforce?.openOpportunities?.length) {
    html += '<div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">';
    html += '<div class="context-label" style="margin-bottom: 8px;">Open Opportunities (' + ctx.salesforce.openOpportunities.length + ')</div>';
    ctx.salesforce.openOpportunities.slice(0, 3).forEach(opp => {
      const acvStr = opp.acv ? '$' + (opp.acv / 1000).toFixed(0) + 'k' : '';
      html += '<div style="font-size: 0.75rem; margin-bottom: 4px;">';
      html += opp.name + ' <span style="color: #60a5fa;">(' + opp.stage + ')</span>';
      if (acvStr) html += ' - ' + acvStr;
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Always show: Key Contacts
  if (ctx.salesforce?.keyContacts?.length) {
    html += '<div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">';
    html += '<div class="context-label" style="margin-bottom: 8px;">Key Contacts</div>';
    ctx.salesforce.keyContacts.slice(0, 4).forEach(c => {
      html += '<div style="font-size: 0.75rem; margin-bottom: 4px;">';
      html += c.name;
      if (c.title) html += ' <span style="color: #9ca3af;">- ' + c.title + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  
  html += '</div></div>';
  return html;
}

// Render the prep form
function renderPrepForm(contextHtml) {
  const data = currentMeetingData;
  const attendees = data.attendees || [];
  const meetingSource = data.source || 'unknown';
  
  // Filter external attendees: remove ghost entries (conference rooms, dial-ins, etc.) AND EAs
  const allExternal = data.externalAttendees || attendees.filter(a => a.isExternal);
  const externalAttendees = allExternal.filter(a => !isGhostAttendee(a) && !isExecutiveAssistant(a));
  
  // Filter out EAs from internal attendees
  const allInternal = data.internalAttendees || attendees.filter(a => !a.isExternal);
  const internalAttendees = allInternal.filter(a => !isExecutiveAssistant(a));
  
  // Determine empty attendees message based on source
  const noAttendeesMessage = meetingSource === 'salesforce' 
    ? 'Attendees not specified — see Key Contacts above'
    : 'No external attendees';
  
  const agenda = data.agenda || ['', '', ''];
  const goals = data.goals || ['', '', ''];
  const demos = data.demoSelections || [{ product: '', subtext: '' }, { product: '', subtext: '' }, { product: '', subtext: '' }];
  
  // Check if any attendees have valid enrichment data
  // Uses hasValidEnrichment to filter out "Profile information limited" results
  const enrichedAttendees = externalAttendees.filter(a => hasValidEnrichment(a));
  const hasEnrichedAttendees = enrichedAttendees.length > 0;
  
  const demoOptions = '<option value="">Select product...</option>' + 
    DEMO_PRODUCTS.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  
  // Unified attendee section - uses clean card format for all attendees
  document.getElementById('modalBody').innerHTML = \`
    \${contextHtml}
    
    <div class="form-section">
      <div class="form-section-title">
        Attendees
        \${hasEnrichedAttendees ? '<span class="ai-badge">AI-Enhanced</span>' : ''}
      </div>
      
      \${externalAttendees.length > 0 ? \`
        <div class="attendee-section-label external">External Attendees (\${externalAttendees.length})</div>
        <div class="attendee-intel-cards">
          \${externalAttendees.map((a, i) => {
            // QUALITY CHECK: Log attendee data for debugging
            console.log('[Attendee ' + i + '] Processing:', a.email, '| full_name:', a.full_name, '| name:', a.name);
            
            // Get enrichment data - PARSE the summary to extract clean text
            const rawSummary = a.summary || a.attendee_summary || a.bio || null;
            const summary = parseAttendeeSummary(rawSummary);
            const title = a.title || null;
            const linkedinUrl = a.linkedinUrl || a.linkedin_url || null;
            
            // Extract FULL name with priority: full_name > name from summary > name > email
            let displayName = extractBestName(a, summary);
            
            // Get company from enrichment or parse from email
            const company = a.company || (a.email ? a.email.split('@')[1]?.split('.')[0] : '');
            const companyDisplay = company ? company.charAt(0).toUpperCase() + company.slice(1) : '';
            
            // Standardize the summary format for consistent display
            const standardizedSummary = summary ? standardizeSummary(summary, displayName, title, companyDisplay) : null;
            
            // QUALITY CHECK: Log parsed result
            console.log('[Attendee ' + i + '] Display name:', displayName, '| Has summary:', !!standardizedSummary);
            
            // Check if has valid enrichment (filters out "Profile information limited")
            const isEnriched = hasValidEnrichment(a);
            
            return \`
              <div class="unified-attendee-card \${isEnriched ? 'enriched' : ''}">
                <div class="attendee-card-top">
                  <div class="attendee-avatar">\${getInitials(displayName)}</div>
                  <div class="attendee-header-info">
                    <div class="attendee-name">\${displayName}</div>
                    <div class="attendee-title-company">
                      \${title ? title : ''}
                      \${title && companyDisplay ? ' • ' : ''}
                      \${companyDisplay ? companyDisplay : ''}
                      \${!title && !companyDisplay ? 'Details pending...' : ''}
                    </div>
                  </div>
                </div>
                \${isEnriched && standardizedSummary ? \`
                  <div class="attendee-bio">\${standardizedSummary}</div>
                \` : ''}
                <a href="https://www.linkedin.com/search/results/all/?keywords=\${encodeURIComponent(buildLinkedInSearchQuery(displayName, companyDisplay))}" target="_blank" class="attendee-linkedin">Find on LinkedIn</a>
                \${!isEnriched ? \`
                  <div class="attendee-pending-subtle">Enrichment in progress...</div>
                \` : ''}
              </div>
            \`;
          }).join('')}
        </div>
      \` : '<div class="no-attendees">' + noAttendeesMessage + '</div>'}
      
      \${internalAttendees.length > 0 ? \`
        <div class="attendee-section-label internal">Internal Attendees (\${internalAttendees.length})</div>
        <div class="attendee-chips">
          \${internalAttendees.map((a, i) => {
            // Extract name properly - use extractNameFromEmail if no name provided
            const rawName = a.name && !a.name.includes('@') 
              ? a.name 
              : extractNameFromEmail(a.email);
            const displayName = normalizeName(rawName);
            return \`
              <span class="attendee-chip internal" title="\${a.email || ''}">
                \${displayName}
              </span>
            \`;
          }).join('')}
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
    
    <div class="form-section">
      <div class="form-section-title">Additional Notes</div>
      \${(data.additionalNotes || ['', '', '']).map((note, i) => \`
        <div class="input-row">
          <span class="input-number">\${i + 1}.</span>
          <input type="text" class="input-field note-input" value="\${escapeHtml(note || '')}" placeholder="Note \${i + 1}">
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
  const additionalNotes = Array.from(document.querySelectorAll('.note-input')).map(el => el.value);
  
  const demoRequired = demoSelections.some(d => d.product);
  
  const payload = {
    meetingId: currentMeetingId,
    accountId: currentMeetingData.accountId,
    accountName: currentMeetingData.accountName,
    meetingTitle: currentMeetingData.meetingTitle,
    meetingDate: currentMeetingData.meetingDate,
    externalAttendees: currentMeetingData.externalAttendees || [],
    internalAttendees: currentMeetingData.internalAttendees || [],
    agenda,
    goals,
    demoRequired,
    demoSelections,
    additionalNotes,
    savedAt: new Date().toISOString()
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

// Copy shareable meeting prep link
function copyMeetingLink() {
  const shareUrl = window.location.origin + '/gtm?tab=meeting-prep&meeting=' + currentMeetingId;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn = document.querySelector('.copy-link-btn');
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy link:', err);
    alert('Failed to copy link. URL: ' + shareUrl);
  });
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

