/**
 * Meeting Prep View
 * Week-at-a-glance layout with meeting cards and detail modal
 */

const meetingPrepService = require('../services/meetingPrepService');
const logger = require('../utils/logger');

function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
    
    return `<span class="attendee-chip external" title="${escapeAttr(fullName)}${att.title ? ' - ' + escapeAttr(att.title) : ''}">${chipContent}</span>`;
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
    return `<span class="attendee-chip internal" title="${escapeAttr(fullName)}">${escapeAttr(displayName)}</span>`;
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
  // Check calendar cache status FIRST — determines if we can render instantly or need async loading
  let syncStatus = null;
  let cacheWarm = false;
  try {
    const { getCalendarCacheStatus } = require('../services/calendarService');
    syncStatus = getCalendarCacheStatus();
    cacheWarm = syncStatus && syncStatus.cacheValid && syncStatus.databaseStats?.totalEvents > 0;
  } catch (e) {
    logger.debug('Could not get calendar cache status:', e.message);
  }

  // FAST PATH: If cache is warm, getUpcomingMeetings returns instantly from memory
  // SLOW PATH: If cache is cold, still fetch but set a tight timeout to avoid blocking
  let meetings = [];
  const weekRange = meetingPrepService.getCurrentWeekRange();
  
  if (cacheWarm) {
    // Cache hit — instant, no Graph API call
    meetings = await meetingPrepService.getUpcomingMeetings(weekRange.start, weekRange.end);
    logger.info('[MeetingPrep] FAST PATH: cache warm, rendered with ' + meetings.length + ' meetings');
  } else {
    // Cache cold — render shell immediately, client will hydrate via AJAX
    // DO NOT fire a background fetch here — it would compete with the AJAX request
    // and cause both to block on the inProgress lock for 15s per attempt
    logger.info('[MeetingPrep] SLOW PATH: cache cold, rendering loading shell (client will hydrate via AJAX)');
  }
  
  // needsClientHydration = true means the page will fetch meeting data via AJAX after render
  const needsClientHydration = !cacheWarm;
  
  // Get BL users for filter dropdown (fast - doesn't depend on Graph API)
  let blUsers = [];
  try {
    blUsers = await meetingPrepService.getBLUsers();
  } catch (e) {
    logger.error('Failed to load BL users:', e);
  }
  
  // Filter by user if specified (pass both userId and email for Outlook matching)
  if (filterUserId && meetings.length > 0) {
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

/* Loading skeleton */
.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-card {
  height: 72px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
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
  display: inline-flex;
  align-items: center;
  color: #4b5563;
  font-weight: 500;
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

/* Skeleton loader for enrichment loading state */
.skeleton-loader {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-bio {
  height: 60px;
  margin-top: 12px;
  border-radius: 6px;
}

.skeleton-title {
  height: 14px;
  width: 60%;
  margin-top: 4px;
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
      <div id="syncBanner" class="sync-status ${needsClientHydration ? 'syncing' : (syncStatus?.databaseStats?.totalEvents > 0 ? 'synced' : 'no-data')}">
        ${needsClientHydration ? 'Loading calendar data...' : 
          (syncStatus?.databaseStats?.totalEvents > 0 ? 
            `${syncStatus.databaseStats.customerMeetings} meetings loaded${syncStatus?.lastSync ? ' (' + formatSyncTime(syncStatus.lastSync) + ')' : ''}` :
            'Loading calendar data...')}
      </div>
    </div>
    <div class="header-actions">
      <select class="filter-dropdown" id="userFilter" onchange="filterByUser(this.value)">
        <option value="">All Meetings</option>
        ${blUsers.map(u => `<option value="${u.userId}"${u.userId === filterUserId ? ' selected' : ''}>${u.name}</option>`).join('')}
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
          ${needsClientHydration ? `
            <div class="loading-skeleton">
              <div class="skeleton-card"></div>
              <div class="skeleton-card"></div>
            </div>
          ` : (grouped[day.fullDate] || []).length === 0 ? `
            <div class="empty-day">No meetings</div>
          ` : (grouped[day.fullDate] || []).map(meeting => `
            <div class="meeting-card ${meeting.agenda?.some(a => a?.trim()) ? 'has-prep' : ''}" 
                 data-meeting-id="${escapeAttr(meeting.meeting_id || meeting.meetingId)}">
              <div class="meeting-account">${escapeAttr(meeting.account_name || meeting.accountName || 'Unknown')}</div>
              <div class="meeting-title">${escapeAttr(meeting.meeting_title || meeting.meetingTitle || 'Untitled')}</div>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy Link
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

<script src="/assets/meeting-prep-helpers.js"></script>

<script>
// ISOLATED CLICK + ERROR HANDLER — Completely independent from main script.
// If the main script block fails, this still works and shows why.
window._mpErrors = [];
window.onerror = function(msg, url, line, col, err) {
  window._mpErrors.push(msg + ' at line ' + line);
  console.error('[MeetingPrep JS ERROR]', msg, 'line:', line, 'col:', col);
};

document.addEventListener('click', function(e) {
  var card = e.target.closest ? e.target.closest('.meeting-card') : null;
  if (!card) return;
  var mid = card.getAttribute('data-meeting-id');
  if (!mid) return;
  
  // Try the full openMeetingPrep if available
  if (typeof window.openMeetingPrep === 'function') {
    try {
      window.openMeetingPrep(mid);
    } catch(err) {
      console.error('[MeetingPrep] openMeetingPrep threw:', err);
      alert('Meeting Prep error: ' + err.message);
    }
    return;
  }
  
  // FALLBACK: Main script failed. Show modal with diagnostic info.
  var modal = document.getElementById('prepModal');
  var titleEl = document.getElementById('modalTitle');
  var subtitleEl = document.getElementById('modalSubtitle');
  var bodyEl = document.getElementById('modalBody');
  
  if (modal && titleEl) {
    var acctDiv = card.querySelector('.meeting-account');
    var mtgDiv = card.querySelector('.meeting-title');
    titleEl.textContent = acctDiv ? acctDiv.textContent : 'Meeting Prep';
    if (subtitleEl) subtitleEl.textContent = mtgDiv ? mtgDiv.textContent : '';
    if (bodyEl) {
      var errInfo = window._mpErrors.length > 0
        ? '<div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:0.75rem;color:#991b1b;text-align:left;"><strong>JavaScript errors detected:</strong><br>' + window._mpErrors.join('<br>') + '</div>'
        : '<div style="margin-top:12px;font-size:0.7rem;color:#9ca3af;">No JS errors captured. The main script may not have loaded.</div>';
      bodyEl.innerHTML = '<div style="padding:20px;">' +
        '<div style="font-size:1rem;font-weight:600;margin-bottom:8px;">' + (acctDiv ? acctDiv.textContent : 'Meeting') + '</div>' +
        '<div style="font-size:0.85rem;color:#6b7280;margin-bottom:16px;">' + (mtgDiv ? mtgDiv.textContent : '') + '</div>' +
        '<div style="font-size:0.8rem;color:#ef4444;font-weight:500;">Meeting prep modal is running in fallback mode.</div>' +
        '<div style="font-size:0.75rem;color:#6b7280;margin-top:8px;">The full meeting prep interface could not load. This diagnostic view shows what went wrong.</div>' +
        errInfo +
        '<div style="margin-top:12px;font-size:0.7rem;color:#9ca3af;">Meeting ID: ' + mid + '</div>' +
        '</div>';
    }
    modal.classList.add('active');
  }
});

// Close modal on overlay click or close button
document.addEventListener('click', function(e) {
  if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
  }
  if (e.target.classList && e.target.classList.contains('modal-close')) {
    var overlay = e.target.closest('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }
});

console.log('[MeetingPrep] Isolated click + error handler registered');
</script>

<script>
var DEMO_PRODUCTS, MEETINGS_DATA;
try {
  DEMO_PRODUCTS = ${safeJsonForScript(demoProducts)};
  MEETINGS_DATA = ${safeJsonForScript(
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
} catch(e) {
  console.error('[MeetingPrep] Data initialization error:', e);
  DEMO_PRODUCTS = DEMO_PRODUCTS || [];
  MEETINGS_DATA = MEETINGS_DATA || {};
}
var NEEDS_HYDRATION = ${needsClientHydration};
var currentMeetingId = null;
var currentMeetingData = null;
var accountsList = [];

// All helper functions (normalizeName, extractNameFromEmail, isValidHumanName,
// extractNamesFromSummary, extractBestName, hasValidEnrichment, parseAttendeeSummary,
// standardizeSummary, escapeRegex, capitalizeFirst, escapeHtml, getInitials,
// getSeniorityClass, formatTime, buildLinkedInSearchQuery, isGhostAttendee,
// renderMarkdownToHtml, EA_EXCLUSIONS, GHOST_ATTENDEE_CONFIG)
// are defined in /assets/meeting-prep-helpers.js (loaded via <script src> above).
// They MUST NOT be redefined here — template literal escaping breaks regex patterns.

// ═══════════════════════════════════════════════════════════════════
// ASYNC HYDRATION — when server rendered a loading shell (cold cache)
// ═══════════════════════════════════════════════════════════════════
function hydrateFromAPI() {
  if (!NEEDS_HYDRATION) return;
  
  console.log('[Hydration] Cache was cold — fetching meetings via AJAX...');
  const filterUser = document.getElementById('userFilter')?.value || '';
  const apiUrl = '/api/meeting-prep/meetings' + (filterUser ? '?filterUser=' + encodeURIComponent(filterUser) : '');
  
  let polls = 0;
  const maxPolls = 30;  // Up to 30 polls (60s total at 2s intervals)
  const startTime = Date.now();
  
  // Update the banner to show progress
  function updateBanner(msg) {
    const banner = document.getElementById('syncBanner');
    if (banner) {
      banner.className = 'sync-status syncing';
      banner.textContent = msg;
    }
  }
  
  function attemptFetch() {
    polls++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    updateBanner('Loading calendar data... (' + elapsed + 's)');
    
    fetch(apiUrl, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        // Server says calendar is still being fetched — poll again quickly
        if (data.loading) {
          if (polls < maxPolls) {
            console.log('[Hydration] Server still loading, poll ' + polls + '/' + maxPolls);
            setTimeout(attemptFetch, 2000);
            return;
          }
          console.log('[Hydration] Server still loading after max polls, showing empty state');
        }
        
        // Server returned meetings (even if empty after fetch completed)
        if (!data.loading && (!data.meetings || data.meetings.length === 0)) {
          if (polls < 5) {
            // First few polls with empty result — might be timing, retry
            console.log('[Hydration] Empty result, quick retry ' + polls);
            setTimeout(attemptFetch, 2000);
            return;
          }
          console.log('[Hydration] No meetings found (calendar fetch completed with 0 results)');
        }
        
        console.log('[Hydration] Got ' + (data.meetings?.length || 0) + ' meetings, rendering cards...');
        
        // Update MEETINGS_DATA for modal usage
        const newData = {};
        (data.meetings || []).forEach(m => {
          const id = m.meeting_id || m.meetingId;
          newData[id] = {
            meetingId: id,
            accountName: m.account_name || m.accountName || 'Unknown',
            meetingTitle: m.meeting_title || m.meetingTitle || 'Untitled',
            meetingDate: m.meeting_date || m.meetingDate,
            accountId: m.account_id || m.accountId || null,
            source: m.source || 'unknown',
            externalAttendees: (m.externalAttendees || []).map(a => ({
              name: a.name || '', email: a.email || '', isExternal: true
            })),
            internalAttendees: (m.internalAttendees || []).map(a => ({
              name: a.name || '', email: a.email || '', isExternal: false
            }))
          };
        });
        MEETINGS_DATA = newData;
        
        // Group by date and render into day columns
        const grouped = {};
        document.querySelectorAll('.day-meetings').forEach(el => {
          const dateKey = el.id.replace('meetings-', '');
          grouped[dateKey] = [];
        });
        
        (data.meetings || []).forEach(meeting => {
          const dateStr = meeting.meetingDate || meeting.meeting_date;
          if (!dateStr) return;
          // Filter ghosts/EAs
          const ext = (meeting.externalAttendees || []).filter(a => {
            const email = (a.email || '').toLowerCase();
            const name = (a.name || '').toLowerCase();
            if (email.includes('zoom') || email.includes('teams') || email.includes('webex')) return false;
            if (email.includes('conference') || email.includes('room') || email.includes('bridge')) return false;
            if (name.includes('conference') || name.includes('meeting room') || name.includes('dial-in')) return false;
            if (email.includes('alyssa.gradstein') || email.includes('cassie.farber')) return false;
            return true;
          });
          if (ext.length === 0) return;
          
          const fullDate = new Date(dateStr).toISOString().split('T')[0];
          if (grouped[fullDate]) grouped[fullDate].push(meeting);
        });
        
        // Render cards into each day column
        Object.keys(grouped).forEach(dateKey => {
          const container = document.getElementById('meetings-' + dateKey);
          if (!container) return;
          
          if (grouped[dateKey].length === 0) {
            container.innerHTML = '<div class="empty-day">No meetings</div>';
          } else {
            container.innerHTML = grouped[dateKey].map(meeting => {
              const id = meeting.meeting_id || meeting.meetingId;
              const account = meeting.account_name || meeting.accountName || 'Unknown';
              const title = meeting.meeting_title || meeting.meetingTitle || 'Untitled';
              const date = meeting.meeting_date || meeting.meetingDate || '';
              const source = meeting.source || 'unknown';
              const hasPrep = meeting.agenda?.some(a => a?.trim());
              const ext = (meeting.externalAttendees || []).filter(a => !isGhostAttendee(a));
              
              let attendeeChips = '';
              if (ext.length > 0) {
                const shown = ext.slice(0, 3);
                attendeeChips = '<div class="attendee-chips">' +
                  shown.map(a => '<span class="attendee-chip">' + escapeHtml(a.name || a.email || '?') + '</span>').join('') +
                  (ext.length > 3 ? '<span class="attendee-chip more">+' + (ext.length - 3) + '</span>' : '') +
                  '</div>';
              }
              
              return '<div class="meeting-card' + (hasPrep ? ' has-prep' : '') + '" ' +
                'data-meeting-id="' + escapeHtml(id) + '">' +
                '<div class="meeting-account">' + escapeHtml(account) + '</div>' +
                '<div class="meeting-title">' + escapeHtml(title) + '</div>' +
                '<div class="meeting-time">' + formatTime(date) + ' <span class="meeting-source ' + source + '">' + source + '</span></div>' +
                attendeeChips +
                '</div>';
            }).join('');
          }
        });
        
        // Update sync banner
        const banner = document.getElementById('syncBanner');
        if (banner && data.syncStatus) {
          const ss = data.syncStatus;
          if (ss.databaseStats?.totalEvents > 0) {
            banner.className = 'sync-status synced';
            banner.textContent = ss.databaseStats.customerMeetings + ' meetings loaded' + (ss.lastSync ? ' (' + new Date(ss.lastSync).toLocaleTimeString() + ')' : '');
          }
        }
        
        // DEEP-LINK: After hydration completes, check for autoOpen param
        // This is the reliable path — data is guaranteed to be in MEETINGS_DATA now
        const urlParams = new URLSearchParams(window.location.search);
        const autoOpenId = urlParams.get('autoOpen');
        if (autoOpenId && !document.getElementById('prepModal')?.classList.contains('active')) {
          console.log('[Deep Link] Hydration complete, auto-opening meeting:', autoOpenId);
          openMeetingPrep(autoOpenId);
        }
      })
      .catch(err => {
        console.error('[Hydration] Fetch failed:', err);
        if (polls < maxPolls) {
          setTimeout(attemptFetch, 3000);
        }
      });
  }
  
  attemptFetch();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadAccounts();
  
  // Click handling is in the isolated <script> block above (immune to parse errors).
  
  // If page was rendered with loading skeletons, hydrate via AJAX
  hydrateFromAPI();
  
  // Handle autoOpen deep-link parameter (from Copy Link feature)
  // On WARM CACHE: MEETINGS_DATA is already populated from SSR, open immediately.
  // On COLD CACHE: MEETINGS_DATA is empty; hydrateFromAPI() handles it after data loads.
  const urlParams = new URLSearchParams(window.location.search);
  const autoOpenId = urlParams.get('autoOpen');
  if (autoOpenId && !NEEDS_HYDRATION) {
    // Warm cache — data is available, open immediately
    setTimeout(function() {
      if (MEETINGS_DATA[autoOpenId]) {
        console.log('[Deep Link] Warm cache, auto-opening meeting:', autoOpenId);
        openMeetingPrep(autoOpenId);
      } else {
        // Meeting ID might not be in pre-loaded data (edge case) — try anyway
        console.log('[Deep Link] Meeting not in pre-loaded data, trying anyway:', autoOpenId);
        openMeetingPrep(autoOpenId);
      }
    }, 300);
  }
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

// formatTime: defined in /assets/meeting-prep-helpers.js

/**
 * Render modal content - handles both initial (enriching) and final states
 * @param {Object} data - Meeting data to render
 * @param {Object} options - { isEnriching: boolean } - shows loading indicator for attendees
 */
function renderModalContent(data, options = {}) {
  const { isEnriching = false } = options;
  
  // Filter attendees
  const allExternal = data.externalAttendees || [];
  const externalAttendees = allExternal.filter(a => !isGhostAttendee(a) && !isExecutiveAssistant(a));
  const allInternal = data.internalAttendees || [];
  const internalAttendees = allInternal.filter(a => !isExecutiveAssistant(a));
  
  // Build attendee cards with enrichment status
  let attendeesHtml = '';
  
  if (externalAttendees.length > 0) {
    attendeesHtml += '<div class="attendees-group"><div class="attendees-group-title" style="color: #ea580c;">EXTERNAL ATTENDEES (' + externalAttendees.length + ')</div>';
    
    if (isEnriching) {
      // Show basic attendee info with enrichment indicator
      attendeesHtml += externalAttendees.map(a => {
        const displayName = extractBestName(a, null);
        const initials = displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        return '<div class="attendee-card">' +
          '<div class="attendee-avatar" style="background: #c4b5fd;">' + initials + '</div>' +
          '<div class="attendee-info">' +
          '<div class="attendee-name">' + displayName + '</div>' +
          '<div class="attendee-title" style="color: #9ca3af; font-style: italic;">Enriching...</div>' +
          '</div></div>';
      }).join('');
    } else {
      // Full attendee cards (handled by renderPrepForm)
      attendeesHtml += '<div style="color: #6b7280; font-size: 0.8rem;">Loading enriched profiles...</div>';
    }
    attendeesHtml += '</div>';
  }
  
  if (internalAttendees.length > 0) {
    attendeesHtml += '<div class="attendees-group"><div class="attendees-group-title" style="color: #ea580c;">INTERNAL ATTENDEES (' + internalAttendees.length + ')</div>';
    attendeesHtml += internalAttendees.map(a => {
      const displayName = normalizeName(a.name) || extractNameFromEmail(a.email);
      const initials = displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      return '<div class="attendee-card">' +
        '<div class="attendee-avatar" style="background: #86efac;">' + initials + '</div>' +
        '<div class="attendee-info">' +
        '<div class="attendee-name">' + displayName + '</div>' +
        '</div></div>';
    }).join('');
    attendeesHtml += '</div>';
  }
  
  // Initial render - show attendees and loading indicator for context
  const loadingContext = isEnriching ? 
    '<div class="context-section"><div class="context-content" style="padding: 20px; text-align: center;">' +
    '<div class="spinner" style="margin: 0 auto 10px;"></div>' +
    '<div style="color: #6b7280; font-size: 0.85rem;">Loading account context...</div></div></div>' : '';
  
  document.getElementById('modalBody').innerHTML = 
    loadingContext +
    '<div class="form-section">' +
    '<div class="form-section-title">Attendees</div>' +
    attendeesHtml +
    '</div>' +
    (isEnriching ? '' : '<div id="prepFormContent"></div>');
}

// Open meeting prep modal
async function openMeetingPrep(meetingId) {
  // STEP 1: Clear previous state IMMEDIATELY (prevents stale data flash)
  currentMeetingId = meetingId;
  currentMeetingData = null;
  
  // Get meeting info from pre-loaded data (ALREADY AVAILABLE - no API call needed!)
  const meetingInfo = MEETINGS_DATA[meetingId] || {};
  
  // STEP 2: Show modal with pre-loaded data INSTANTLY (no spinner!)
  document.getElementById('modalTitle').textContent = meetingInfo.accountName || 'Meeting Prep';
  document.getElementById('modalSubtitle').textContent = meetingInfo.meetingTitle || '';
  document.getElementById('prepModal').classList.add('active');
  
  // Initialize currentMeetingData from pre-loaded info
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
  
  // STEP 3: Render final form immediately with skeleton loaders for enrichment data
  // Pass empty context and isEnriching flag - no more interim state flash!
  renderPrepForm('', { isEnriching: true });
  
  // STEP 4: Fetch saved prep + enrichment data in BACKGROUND
  try {
    const prepRes = await fetch('/api/meeting-prep/' + meetingId);
    const prepData = await prepRes.json();
    
    // Merge with saved prep data if exists
    if (prepData.success && prepData.prep) {
      const saved = prepData.prep;
      currentMeetingData.agenda = saved.agenda || currentMeetingData.agenda;
      currentMeetingData.goals = saved.goals || currentMeetingData.goals;
      currentMeetingData.demoSelections = saved.demoSelections || currentMeetingData.demoSelections;
      currentMeetingData.context = saved.context || '';
      currentMeetingData.additionalNotes = saved.additionalNotes || ['', '', ''];
      // Restore context override if the rep previously edited the intelligence brief
      if (saved.contextOverride) {
        currentMeetingData._contextOverride = saved.contextOverride;
      }
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
    
    // Enrichment runs in the BACKGROUND — modal renders immediately with names/emails,
    // then attendee cards are updated progressively as enrichment data arrives.
    const externalEmails = (currentMeetingData.externalAttendees || [])
      .map(a => a.email)
      .filter(e => e);
    
    if (externalEmails.length > 0) {
      // Fire-and-forget: enrichment happens after modal is visible
      (async function backgroundEnrich() {
        try {
          const enrichRes = await fetch('/api/clay/get-enrichment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: externalEmails })
          });
          const enrichData = await enrichRes.json();
          
          if (enrichData.success && enrichData.enrichments) {
            currentMeetingData.externalAttendees = currentMeetingData.externalAttendees.map(a => {
              const enrichment = enrichData.enrichments[a.email?.toLowerCase()];
              if (enrichment) {
                return { ...a, title: enrichment.title || a.title, linkedinUrl: enrichment.linkedinUrl || a.linkedinUrl, company: enrichment.company || a.company, summary: enrichment.summary || a.summary, enriched: true, source: 'clay' };
              }
              return a;
            });
            // Re-render attendee section with enriched data
            const attendeesContainer = document.getElementById('attendeesSection');
            if (attendeesContainer && typeof renderAttendeesSection === 'function') {
              attendeesContainer.innerHTML = renderAttendeesSection(currentMeetingData);
            }
          }

          // Fallback enrichment for attendees still missing data
          const needsFallback = currentMeetingData.externalAttendees.filter(a => {
            const hasTitle = a.title && a.title.trim().length > 3;
            const summary = a.summary || '';
            const hasSummary = summary.length > 50 && !summary.toLowerCase().includes('no public linkedin') && !summary.toLowerCase().includes('profile information limited');
            return !hasTitle && !hasSummary;
          });

          if (needsFallback.length > 0) {
            const fallbackRes = await fetch('/api/attendee/fallback-enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ attendees: needsFallback })
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.success && fallbackData.enrichedAttendees) {
              const fallbackMap = {};
              fallbackData.enrichedAttendees.forEach(a => { if (a.email) fallbackMap[a.email.toLowerCase()] = a; });
              currentMeetingData.externalAttendees = currentMeetingData.externalAttendees.map(a => {
                const fb = fallbackMap[a.email?.toLowerCase()];
                if (fb && (fb.title || fb.summary)) return { ...a, title: fb.title || a.title, summary: fb.summary || a.summary, source: fb.source || 'claude_fallback', confidence: fb.confidence };
                return a;
              });
              const attendeesContainer = document.getElementById('attendeesSection');
              if (attendeesContainer && typeof renderAttendeesSection === 'function') {
                attendeesContainer.innerHTML = renderAttendeesSection(currentMeetingData);
              }
            }
          }
        } catch (e) {
          console.warn('[Enrichment] Background enrichment failed (non-blocking):', e.message);
        }
      })();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ACCOUNT INTELLIGENCE — Non-blocking async loading
    // Modal renders IMMEDIATELY with a loading skeleton for intelligence.
    // Intelligence query fires in background and updates the DOM when ready.
    // ═══════════════════════════════════════════════════════════════
    const accountName = currentMeetingData.accountName || currentMeetingData.account_name || '';
    
    // Render form IMMEDIATELY with intelligence loading state
    var intelLoadingHtml = '<div class="context-section" id="accountIntelSection">';
    intelLoadingHtml += '<div class="context-header"><span class="context-label">Account Intelligence</span><span class="context-badge">PRE-MEETING CONTEXT</span></div>';
    intelLoadingHtml += '<div class="context-content"><div style="padding:16px;background:#f8f9fa;border-radius:6px;border:1px solid #e5e7eb;">';
    intelLoadingHtml += '<div style="display:flex;align-items:center;gap:8px;">';
    intelLoadingHtml += '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>';
    intelLoadingHtml += '<div style="font-size:0.8rem;color:#374151;">Loading account intelligence for ' + escapeHtml(accountName || 'this meeting') + '...</div>';
    intelLoadingHtml += '</div></div></div></div>';
    
    renderPrepForm(intelLoadingHtml);
    
    // Fire intelligence loading in background (non-blocking)
    (async function loadAccountIntelligence() {
      try {
        let accountId = currentMeetingData.account_id || currentMeetingData.accountId;

        // Step 1a: Domain lookup — try ALL external attendees' domains
        var personalDomains = ['gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','aol.com','icloud.com','me.com','protonmail.com','mail.com'];
        if (!accountId && currentMeetingData.externalAttendees?.length > 0) {
          var uniqueDomains = [];
          currentMeetingData.externalAttendees.forEach(function(att) {
            var d = (att.email || '').split('@')[1];
            if (d && !personalDomains.includes(d.toLowerCase()) && uniqueDomains.indexOf(d) === -1) {
              uniqueDomains.push(d);
            }
          });
          for (var di = 0; di < uniqueDomains.length && !accountId; di++) {
            try {
              var lookupRes = await fetch('/api/account/lookup-by-domain?domain=' + encodeURIComponent(uniqueDomains[di]));
              var lookupData = await lookupRes.json();
              if (lookupData.success && lookupData.accountId) {
                accountId = lookupData.accountId;
                console.log('[Context] Domain lookup resolved:', uniqueDomains[di], '->', lookupData.accountName, accountId);
              }
            } catch (e) { /* try next domain */ }
          }
          // If domain lookup failed, try using domain company name as search term
          if (!accountId && uniqueDomains.length > 0) {
            var domainCompany = uniqueDomains[0].split('.')[0];
            if (domainCompany.length >= 3) {
              try {
                var domSearchRes = await fetch('/api/search-accounts?q=' + encodeURIComponent(domainCompany));
                var domSearchData = await domSearchRes.json();
                if (domSearchData.matches?.length > 0) {
                  accountId = domSearchData.matches[0].id;
                  console.log('[Context] Domain company search resolved:', domainCompany, '->', domSearchData.matches[0].name, accountId);
                }
              } catch (e) { /* continue to name search */ }
            }
          }
        }

        // Step 1b: Account search if still no accountId but we have a name
        if (!accountId && accountName && accountName !== 'Unknown') {
          // Normalize garbled calendar names before searching
          var searchName = accountName;
          // Uppercase short names (2-4 chars): "Cvc" -> "CVC", "Chs" -> "CHS"
          if (searchName.length <= 4 && searchName.length >= 2) searchName = searchName.toUpperCase();
          // Split concatenated names: "Chsinc" -> "Chs Inc", "Servicenow" -> "Service Now"
          searchName = searchName.replace(/([a-z])([A-Z])/g, '$1 $2');
          // Common concatenation fixes
          var concatFixes = {'chsinc':'CHS','servicenow':'ServiceNow','blackstone':'Blackstone','goldmansachs':'Goldman Sachs'};
          var concatKey = accountName.toLowerCase().replace(/\s+/g, '').replace(/[._-]/g, '');
          if (concatFixes[concatKey]) searchName = concatFixes[concatKey];

          try {
            var searchRes = await fetch('/api/search-accounts?q=' + encodeURIComponent(searchName));
            var searchData = await searchRes.json();
            if (searchData.matches?.length > 0) {
              accountId = searchData.matches[0].id;
              console.log('[Context] Account search resolved:', searchName, '->', searchData.matches[0].name, accountId);
            } else if (searchName !== accountName) {
              // Try original name as fallback
              searchRes = await fetch('/api/search-accounts?q=' + encodeURIComponent(accountName));
              searchData = await searchRes.json();
              if (searchData.matches?.length > 0) {
                accountId = searchData.matches[0].id;
                console.log('[Context] Account search (original) resolved:', accountName, '->', searchData.matches[0].name, accountId);
              }
            }
          } catch (e) { console.log('[Context] Account search failed:', e.message); }
        }

        // Step 2: Fire GTM Brain intelligence query
        var contextHtml = '';
        if (accountId || accountName) {
          var prepQuery = accountId
            ? 'Give me a full account overview for my upcoming meeting: deal status and stage, key contacts with titles, recent activity and meetings, and competitive landscape.'
            : 'prep me for my upcoming meeting with ' + accountName;
          const queryPayload = {
            query: prepQuery,
            accountName: accountName,
            userEmail: document.cookie.replace(/(?:(?:^|.*;\s*)userEmail\s*=\s*([^;]*).*$)|^.*$/, '$1') || '',
            forceRefresh: true
          };
          if (accountId) queryPayload.accountId = accountId;

          let gtmBrief = '';
          let queryContext = null;

          if (currentMeetingData._contextOverride) {
            gtmBrief = currentMeetingData._contextOverride;
          } else {
            const queryRes = await fetch('/api/intelligence/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(queryPayload)
            }).catch(function(e) { console.warn('[Context] GTM Brain query failed:', e.message); return null; });

            if (queryRes) {
              try {
                const queryData = await queryRes.json();
                if (queryData.success && queryData.answer) {
                  gtmBrief = queryData.answer;
                  queryContext = queryData.context || null;
                }
              } catch (qe) { console.warn('[Context] GTM Brain parse error:', qe.message); }
            }
          }

          // Step 3: Build context HTML — clean metadata (hide Unassigned, hide intent)
          let metaHtml = '';
          if (queryContext) {
            const parts = [];
            if (queryContext.accountType && queryContext.accountType !== 'unknown') {
              const typeMap = { 'existing_customer': 'Existing Customer', 'active_pipeline': 'Active Pipeline', 'historical': 'Historical', 'cold': 'Net New' };
              parts.push('<strong>' + (typeMap[queryContext.accountType] || queryContext.accountType) + '</strong>');
            }
            if (queryContext.owner && queryContext.owner !== 'Unassigned') {
              parts.push(queryContext.owner);
            }
            if (queryContext.opportunityCount > 0) {
              parts.push(queryContext.opportunityCount + ' open opp' + (queryContext.opportunityCount > 1 ? 's' : ''));
            }
            if (queryContext.contactCount > 0) {
              parts.push(queryContext.contactCount + ' contacts');
            }
            if (parts.length > 0) {
              metaHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap;padding:6px 0;border-top:1px solid #f0f0f0;margin-top:8px;font-size:0.7rem;color:#6b7280;">';
              metaHtml += parts.join(' &bull; ');
              metaHtml += '</div>';
            }
          }

          // Strip follow-up suggestions (not useful in meeting prep context)
          if (gtmBrief) {
            gtmBrief = gtmBrief.replace(/---\s*\n\s*You might also ask:[\s\S]*$/m, '').trim();
            gtmBrief = gtmBrief.replace(/\n\s*You might also ask:\s*\n[\s\S]*$/m, '').trim();
          }

          if (gtmBrief && gtmBrief.length > 30) {
            contextHtml = '<div class="context-section">';
            contextHtml += '<div class="context-header"><span class="context-label">Account Intelligence</span><span class="context-badge">PRE-MEETING CONTEXT</span>';
            contextHtml += '<button class="edit-btn" onclick="toggleEditContext()">Edit</button></div>';
            contextHtml += '<div class="context-content"><div class="intelligence-brief" id="contextBrief">';
            contextHtml += renderMarkdownToHtml(gtmBrief);
            contextHtml += '</div></div>';
            contextHtml += metaHtml;
            contextHtml += '</div>';
          } else {
            contextHtml = '<div class="context-section">';
            contextHtml += '<div class="context-header"><span class="context-label">Account Intelligence</span><span class="context-badge">PRE-MEETING CONTEXT</span></div>';
            contextHtml += '<div class="context-content"><div style="padding:12px;background:#f8f9fa;border-radius:6px;border:1px solid #e5e7eb;">';
            if (accountName && accountName !== 'Unknown') {
              contextHtml += '<div style="font-size:0.8rem;color:#374151;font-weight:500;">Meeting with ' + escapeHtml(accountName) + '</div>';
              contextHtml += '<div style="font-size:0.75rem;color:#6b7280;margin-top:6px;">Account intelligence temporarily unavailable.</div>';
              contextHtml += '<div style="font-size:0.7rem;color:#9ca3af;margin-top:4px;">Try the GTM Brain tab: "Tell me about ' + escapeHtml(accountName) + '"</div>';
            } else {
              contextHtml += '<div style="font-size:0.75rem;color:#6b7280;">No account matched for this meeting.</div>';
            }
            contextHtml += '</div></div>';
            contextHtml += metaHtml;
            contextHtml += '</div>';
          }
        }

        if (!contextHtml) {
          contextHtml = '<div class="context-section"><div class="context-content">';
          contextHtml += '<div style="padding:12px;background:#f8f9fa;border-radius:6px;border:1px solid #e5e7eb;">';
          contextHtml += '<div style="font-size:0.75rem;color:#6b7280;">No account context available.</div>';
          contextHtml += '</div></div></div>';
        }

        // Update the intel section in the already-rendered modal
        var intelSection = document.getElementById('accountIntelSection');
        if (intelSection) {
          intelSection.outerHTML = contextHtml;
        }
      } catch (e) {
        console.error('[Context] Intelligence loading error:', e);
        var intelSection = document.getElementById('accountIntelSection');
        if (intelSection) {
          intelSection.innerHTML = '<div class="context-content"><div style="padding:12px;background:#fef2f2;border-radius:6px;border:1px solid #fecaca;font-size:0.8rem;color:#991b1b;">Intelligence temporarily unavailable. Try the GTM Brain tab.</div></div>';
        }
      }
    })();
    
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
  
  return '<div style="margin-bottom: 10px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e5e7eb;">' +
         '<div style="font-size: 0.8rem; line-height: 1.5; color: #374151;">' + parts.join(' ') + '</div>' +
         '</div>';
}

// Format context section — uses GTM Brain query response (same pipeline as GTM Brain tab + Obsidian)
// gtmBrief: markdown string from intelligenceQueryService, or empty string if unavailable
function formatContextSection(ctx, meetingData, gtmBrief) {
  let html = '<div class="context-section"><div class="context-header"><span class="context-title" style="font-size: 0.8rem; color: #374151; font-weight: 600;">Account Intelligence</span></div><div class="context-content">';
  
  // ── GTM BRAIN INTELLIGENCE BRIEF ──
  if (gtmBrief && gtmBrief.length > 20) {
    html += renderGtmBriefCard(gtmBrief);
  } else if (ctx) {
    html += renderIntelFallback(ctx, meetingData);
  }
  
  // Account basics: Type and Owner — quiet inline metadata
  if (ctx && ctx.salesforce) {
    const sf = ctx.salesforce;
    html += '<div style="display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 0; border-top: 1px solid #f0f0f0; margin-top: 8px;">';
    if (sf.customerType) html += '<span style="font-size: 0.7rem; color: #6b7280;"><strong style="color: #374151;">Type:</strong> ' + sf.customerType + (sf.customerSubtype ? ' (' + sf.customerSubtype + ')' : '') + '</span>';
    if (sf.owner) html += '<span style="font-size: 0.7rem; color: #6b7280;"><strong style="color: #374151;">Owner:</strong> ' + sf.owner + '</span>';
    html += '</div>';
  }
  
  // ── COLLAPSIBLE RAW SOURCES ──
  if (ctx) { html += renderRawSourcesToggle(ctx); }
  
  // Open Opportunities — quiet inline display
  if (ctx && ctx.salesforce?.openOpportunities?.length) {
    html += '<div style="margin-top: 8px; border-top: 1px solid #f0f0f0; padding-top: 8px;">';
    html += '<div style="font-size: 0.65rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-bottom: 4px;">Pipeline (' + ctx.salesforce.openOpportunities.length + ')</div>';
    ctx.salesforce.openOpportunities.slice(0, 3).forEach(function(opp) {
      const acvStr = opp.acv ? '$' + (opp.acv / 1000).toFixed(0) + 'k' : '';
      html += '<div style="font-size: 0.75rem; color: #374151; margin-bottom: 3px;">';
      html += opp.name + ' <span style="color: #9ca3af;">(' + opp.stage + ')</span>';
      if (acvStr) html += ' <span style="color: #374151; font-weight: 500;">' + acvStr + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Key Contacts removed — GTM Brain brief already surfaces contacts with richer context
  // Keeping them here would create conflicting lists from different data sources
  
  html += '</div></div>';
  return html;
}

// ── GTM Brain Brief Card ──
// Renders the markdown response from intelligenceQueryService in a quiet, exec-ready card.
// Same output the rep sees in the GTM Brain tab and Obsidian plugin.
// Includes edit toggle so reps can override with their own context.
function renderGtmBriefCard(markdownText) {
  let html = '';
  html += '<div style="margin-bottom: 10px;">';
  
  // Header row with edit toggle
  html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">';
  html += '<span style="font-size: 0.65rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px;">Pre-Meeting Context</span>';
  html += '<button onclick="toggleContextEdit()" id="contextEditBtn" style="background: none; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px; font-size: 0.65rem; color: #6b7280; cursor: pointer;">Edit</button>';
  html += '</div>';
  
  // Read-only rendered view (visible by default)
  var rendered = renderMarkdownToHtml(markdownText);
  
  html += '<div id="contextReadView" style="padding: 14px 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e5e7eb;">';
  html += '<div style="font-size: 0.82rem; line-height: 1.55; color: #374151;">' + rendered + '</div>';
  html += '</div>';
  
  // Editable textarea (hidden by default) — stores raw markdown for editing
  html += '<textarea id="contextEditArea" style="display: none; width: 100%; min-height: 200px; padding: 14px 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #3b82f6; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; line-height: 1.55; color: #374151; resize: vertical; outline: none;">' + markdownText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>';
  
  html += '</div>';
  return html;
}

// Toggle between read view and edit view for the context section
function toggleContextEdit() {
  var readView = document.getElementById('contextReadView');
  var editArea = document.getElementById('contextEditArea');
  var btn = document.getElementById('contextEditBtn');
  
  if (editArea.style.display === 'none') {
    // Switch to edit mode
    readView.style.display = 'none';
    editArea.style.display = 'block';
    editArea.focus();
    btn.textContent = 'Done';
    btn.style.color = '#3b82f6';
    btn.style.borderColor = '#3b82f6';
    // Store that we are editing
    currentMeetingData._contextEdited = true;
  } else {
    // Switch back to read mode — re-render the edited text
    var editedText = editArea.value;
    currentMeetingData._contextOverride = editedText;
    
    // Re-render the markdown
    var newRendered = renderMarkdownToHtml(editedText);
    
    readView.innerHTML = '<div style="font-size: 0.82rem; line-height: 1.55; color: #374151;">' + newRendered + '</div>';
    readView.style.display = 'block';
    editArea.style.display = 'none';
    btn.textContent = 'Edit';
    btn.style.color = '#6b7280';
    btn.style.borderColor = '#e5e7eb';
  }
}

// ── Fallback: shown when GTM Brain query is unavailable ──
// Quiet, compact, same grey palette
function renderIntelFallback(ctx, meetingData) {
  let html = '';
  
  // Try Story So Far from structured Salesforce data
  const storyHtml = generateStorySoFar(ctx, meetingData);
  if (storyHtml) {
    html += storyHtml;
  }
  
  const sourceCount = (ctx.meetingNotes?.length || 0) + (ctx.obsidianNotes?.length || 0) + (ctx.slackIntel?.length || 0) + (ctx.priorMeetings?.length || 0);
  if (sourceCount > 0) {
    html += '<div style="margin-bottom: 10px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e5e7eb;">';
    html += '<div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 6px;">' + sourceCount + ' data source' + (sourceCount > 1 ? 's' : '') + ' available — intelligence brief loading</div>';
    html += '<div style="font-size: 0.65rem; color: #9ca3af;">Reopen this meeting to view the full GTM Brain brief.</div>';
    html += '</div>';
  } else if (!storyHtml) {
    html += '<div style="margin-bottom: 10px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e5e7eb;">';
    html += '<div style="font-size: 0.75rem; color: #6b7280;">No prior context on record.</div>';
    html += '<div style="font-size: 0.65rem; color: #9ca3af; margin-top: 4px;">Use Obsidian to capture this call and build account intelligence.</div>';
    html += '</div>';
  }
  
  return html;
}

// ── Collapsible Raw Sources: always available as secondary view ──
function renderRawSourcesToggle(ctx) {
  let html = '';
  const hasMeetingNotes = ctx.meetingNotes?.length > 0;
  const hasSlackIntel = ctx.slackIntel?.length > 0;
  const hasPriorMeetings = ctx.priorMeetings?.length > 0;
  const hasObsidianNotes = ctx.obsidianNotes?.length > 0;
  const hasAnySources = hasMeetingNotes || hasSlackIntel || hasPriorMeetings || hasObsidianNotes;
  
  if (!hasAnySources) return '';
  
  // Generate a unique ID for the toggle
  const toggleId = 'rawSources_' + Date.now();
  
  html += '<div style="margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 10px;">';
  // Clickable toggle header
  html += '<div onclick="(function(){ var el=document.getElementById(\\'' + toggleId + '\\'); var arrow=document.getElementById(\\'' + toggleId + '_arrow\\'); if(el.style.display===\\'none\\'){ el.style.display=\\'block\\'; arrow.textContent=\\'▾\\'; } else { el.style.display=\\'none\\'; arrow.textContent=\\'▸\\'; } })()" style="cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">';
  html += '<span id="' + toggleId + '_arrow" style="font-size: 0.7rem; color: #6b7280; transition: transform 0.2s;">▸</span>';
  html += '<span style="font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">View Raw Sources</span>';
  html += '</div>';
  
  // Collapsible content (hidden by default)
  html += '<div id="' + toggleId + '" style="display: none; margin-top: 8px;">';
  
  // Meeting Notes
  if (hasMeetingNotes) {
    ctx.meetingNotes.slice(0, 3).forEach(function(note) {
      html += '<div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #6b7280;">';
      html += '<div style="font-size: 0.65rem; color: #374151; font-weight: 500;">Meeting Notes</div>';
      html += '<div style="font-size: 0.65rem; color: #9ca3af; margin-bottom: 3px;">' + (note.date || '') + (note.rep ? ' • ' + note.rep : '') + '</div>';
      html += '<div style="font-size: 0.75rem; line-height: 1.4; color: #1f2937;">' + (note.summary || '').substring(0, 300) + ((note.summary || '').length > 300 ? '...' : '') + '</div>';
      html += '</div>';
    });
  }
  
  // Slack Intel
  if (hasSlackIntel) {
    ctx.slackIntel.slice(0, 3).forEach(function(intel) {
      html += '<div style="margin-bottom: 6px; padding: 6px 8px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #d1d5db;">';
      html += '<div style="font-size: 0.65rem; color: #374151; font-weight: 500;">Slack</div>';
      html += '<div style="font-size: 0.75rem; color: #1f2937;"><span style="color: #9ca3af;">[' + (intel.category || 'Intel') + ']</span> ' + (intel.summary || '') + '</div>';
      html += '</div>';
    });
  }
  
  // Prior Meeting Preps
  if (hasPriorMeetings) {
    ctx.priorMeetings.slice(0, 3).forEach(function(m) {
      const dateStr = m.date ? new Date(m.date).toLocaleDateString() : '';
      html += '<div style="margin-bottom: 6px; padding: 6px 8px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #6b7280;">';
      html += '<div style="font-size: 0.65rem; color: #374151; font-weight: 500;">Prior Prep</div>';
      html += '<div style="font-size: 0.75rem; color: #1f2937;">' + dateStr + ' – ' + (m.title || 'Meeting') + '</div>';
      html += '</div>';
    });
  }
  
  // Obsidian Notes
  if (hasObsidianNotes) {
    ctx.obsidianNotes.slice(0, 3).forEach(function(note) {
      const dateStr = note.date ? new Date(note.date).toLocaleDateString() : '';
      const sentimentColor = note.sentiment === 'Positive' ? '#10b981' : 
                            note.sentiment === 'Negative' ? '#ef4444' : '#6b7280';
      html += '<div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #d1d5db;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: center;">';
      html += '<div style="font-size: 0.65rem; color: #374151; font-weight: 500;">Obsidian Note</div>';
      if (note.sentiment) {
        html += '<span style="font-size: 0.6rem; padding: 2px 5px; background: ' + sentimentColor + '15; color: ' + sentimentColor + '; border-radius: 3px;">' + note.sentiment + '</span>';
      }
      html += '</div>';
      html += '<div style="font-size: 0.65rem; color: #9ca3af; margin-bottom: 3px;">' + dateStr + ' • ' + (note.title || 'Meeting Note') + '</div>';
      if (note.summary) {
        html += '<div style="font-size: 0.75rem; line-height: 1.4; color: #1f2937;">' + note.summary.substring(0, 250) + (note.summary.length > 250 ? '...' : '') + '</div>';
      }
      html += '</div>';
    });
  }
  
  html += '</div>'; // close collapsible content
  html += '</div>'; // close wrapper
  
  return html;
}

// Render the prep form
// options.isEnriching: shows skeleton loaders for bio sections while fetching enrichment data
function renderPrepForm(contextHtml, options = {}) {
  const { isEnriching = false } = options;
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
                      \${isEnriching && !title ? '<div class="skeleton-loader skeleton-title"></div>' : ''}
                      \${!isEnriching && title ? title : ''}
                      \${!isEnriching && title && companyDisplay ? ' • ' : ''}
                      \${!isEnriching && companyDisplay ? companyDisplay : ''}
                      \${!isEnriching && !title && !companyDisplay ? '' : ''}
                    </div>
                  </div>
                </div>
                \${isEnriching ? \`
                  <div class="skeleton-loader skeleton-bio"></div>
                \` : (isEnriched && standardizedSummary ? \`
                  <div class="attendee-bio">\${standardizedSummary}</div>
                \` : '')}
                <a href="https://www.linkedin.com/search/results/all/?keywords=\${encodeURIComponent(buildLinkedInSearchQuery(displayName, companyDisplay))}" target="_blank" class="attendee-linkedin">Find on LinkedIn</a>
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
  
  // Include context override if the rep edited it
  var contextOverride = currentMeetingData._contextOverride || null;
  
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
    contextOverride,
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
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied!';
    btn.classList.add('copied');
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
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

// escapeHtml, getInitials, getSeniorityClass: defined in /assets/meeting-prep-helpers.js

// Listen for messages from parent window (for deep linking via Copy Link)
window.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'openMeeting' && event.data.meetingId) {
    console.log('[Deep Link] Received request to open meeting:', event.data.meetingId);
    openMeetingPrep(event.data.meetingId);
  }
});

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

