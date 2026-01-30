/**
 * ICS Calendar Parser
 * Parses iCalendar (.ics) feeds from Microsoft 365, Google Calendar, etc.
 */

export interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
  organizer: string;
  attendees: Attendee[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string;
  raw: string;
}

export interface Attendee {
  name: string;
  email: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  role: 'required' | 'optional' | 'chair';
}

/**
 * Parse ICS feed content into structured calendar events
 */
export function parseICS(icsContent: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  // Split into VEVENT blocks
  const eventBlocks = icsContent.split('BEGIN:VEVENT');
  
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split('END:VEVENT')[0];
    
    try {
      const event = parseEventBlock(block);
      if (event) {
        events.push(event);
      }
    } catch (error) {
      console.warn('Failed to parse calendar event:', error);
    }
  }
  
  // Sort by start date
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  
  return events;
}

/**
 * Parse a single VEVENT block
 */
function parseEventBlock(block: string): CalendarEvent | null {
  const lines = unfoldLines(block);
  
  const getValue = (key: string): string => {
    for (const line of lines) {
      if (line.startsWith(key + ':') || line.startsWith(key + ';')) {
        const colonIndex = line.indexOf(':');
        return colonIndex > 0 ? line.substring(colonIndex + 1).trim() : '';
      }
    }
    return '';
  };
  
  const uid = getValue('UID');
  const summary = decodeICSText(getValue('SUMMARY'));
  const description = decodeICSText(getValue('DESCRIPTION'));
  const location = decodeICSText(getValue('LOCATION'));
  
  // Parse dates
  const dtstart = parseDateValue(lines, 'DTSTART');
  const dtend = parseDateValue(lines, 'DTEND');
  
  if (!dtstart) {
    return null; // Skip events without start date
  }
  
  // Check if all-day event (DATE vs DATE-TIME)
  const allDay = lines.some(l => 
    l.includes('DTSTART;VALUE=DATE:') || 
    (l.startsWith('DTSTART:') && l.length === 17) // DTSTART:YYYYMMDD
  );
  
  // Parse attendees
  const attendees = parseAttendees(lines);
  
  // Parse organizer
  const organizerLine = lines.find(l => l.startsWith('ORGANIZER'));
  let organizer = '';
  if (organizerLine) {
    const cnMatch = organizerLine.match(/CN=([^;:]+)/);
    organizer = cnMatch ? cnMatch[1].replace(/"/g, '') : '';
  }
  
  // Parse status
  const statusValue = getValue('STATUS').toLowerCase();
  let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
  if (statusValue === 'tentative') status = 'tentative';
  if (statusValue === 'cancelled') status = 'cancelled';
  
  return {
    uid,
    title: summary || '(No title)',
    description,
    location,
    start: dtstart,
    end: dtend || new Date(dtstart.getTime() + 60 * 60 * 1000), // Default 1 hour
    allDay,
    organizer,
    attendees,
    status,
    raw: block
  };
}

/**
 * Unfold ICS lines (lines can be split with CRLF + space/tab)
 */
function unfoldLines(content: string): string[] {
  // Replace line continuations
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  return unfolded.split(/\r?\n/).filter(l => l.trim());
}

/**
 * Parse date value from ICS (handles both DATE and DATE-TIME)
 */
function parseDateValue(lines: string[], key: string): Date | null {
  for (const line of lines) {
    if (!line.startsWith(key)) continue;
    
    const colonIndex = line.indexOf(':');
    if (colonIndex < 0) continue;
    
    const value = line.substring(colonIndex + 1).trim();
    
    // Check for timezone in the property
    const tzMatch = line.match(/TZID=([^:;]+)/);
    
    // DATE-TIME format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    if (value.includes('T')) {
      return parseDateTimeString(value, tzMatch?.[1]);
    }
    
    // DATE format: YYYYMMDD
    if (value.length === 8) {
      const year = parseInt(value.substring(0, 4));
      const month = parseInt(value.substring(4, 6)) - 1;
      const day = parseInt(value.substring(6, 8));
      return new Date(year, month, day);
    }
  }
  
  return null;
}

/**
 * Parse DATE-TIME string (YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ)
 */
function parseDateTimeString(value: string, timezone?: string): Date {
  const year = parseInt(value.substring(0, 4));
  const month = parseInt(value.substring(4, 6)) - 1;
  const day = parseInt(value.substring(6, 8));
  const hour = parseInt(value.substring(9, 11));
  const minute = parseInt(value.substring(11, 13));
  const second = parseInt(value.substring(13, 15)) || 0;
  
  // If ends with Z, it's UTC
  if (value.endsWith('Z')) {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  
  // Otherwise, treat as local time (or use timezone if provided)
  return new Date(year, month, day, hour, minute, second);
}

/**
 * Parse attendees from ATTENDEE lines
 */
function parseAttendees(lines: string[]): Attendee[] {
  const attendees: Attendee[] = [];
  
  for (const line of lines) {
    if (!line.startsWith('ATTENDEE')) continue;
    
    // Extract CN (common name)
    const cnMatch = line.match(/CN=([^;:]+)/);
    const name = cnMatch ? cnMatch[1].replace(/"/g, '') : '';
    
    // Extract email (mailto:)
    const emailMatch = line.match(/mailto:([^>\s]+)/i);
    const email = emailMatch ? emailMatch[1] : '';
    
    // Extract participation status
    const partstatMatch = line.match(/PARTSTAT=([^;:]+)/);
    let status: Attendee['status'] = 'needs-action';
    if (partstatMatch) {
      const ps = partstatMatch[1].toLowerCase();
      if (ps === 'accepted') status = 'accepted';
      else if (ps === 'declined') status = 'declined';
      else if (ps === 'tentative') status = 'tentative';
    }
    
    // Extract role
    const roleMatch = line.match(/ROLE=([^;:]+)/);
    let role: Attendee['role'] = 'required';
    if (roleMatch) {
      const r = roleMatch[1].toLowerCase();
      if (r === 'opt-participant') role = 'optional';
      else if (r === 'chair') role = 'chair';
    }
    
    if (name || email) {
      attendees.push({ name, email, status, role });
    }
  }
  
  return attendees;
}

/**
 * Decode ICS text (handle escaped characters and encoding)
 */
function decodeICSText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Filter events by date range
 */
export function filterEventsByDateRange(
  events: CalendarEvent[],
  start: Date,
  end: Date
): CalendarEvent[] {
  return events.filter(event => 
    event.start >= start && event.start <= end
  );
}

/**
 * Get events for today
 */
export function getTodayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return filterEventsByDateRange(events, today, tomorrow);
}

/**
 * Get events for this week
 */
export function getWeekEvents(events: CalendarEvent[]): CalendarEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  
  return filterEventsByDateRange(events, startOfWeek, endOfWeek);
}
