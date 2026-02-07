/**
 * CalendarService - Fetches calendar data from GTM Brain
 * 
 * Uses existing Microsoft Graph infrastructure on the server side.
 * No OAuth configuration needed in Obsidian - server handles auth.
 */

import { requestUrl } from 'obsidian';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface CalendarAttendee {
  name: string;
  email: string;
  isExternal?: boolean;
}

export interface CalendarMeeting {
  id: string;
  subject: string;
  start: string;
  end: string;
  location?: string;
  attendees: CalendarAttendee[];
  isCustomerMeeting: boolean;
  accountName?: string;
  accountId?: string;
  onlineMeetingUrl?: string;
}

export interface TodayResponse {
  success: boolean;
  date: string;
  email: string;
  meetingCount: number;
  meetings: CalendarMeeting[];
  error?: string;
}

export interface WeekResponse {
  success: boolean;
  startDate: string;
  endDate: string;
  email: string;
  totalMeetings: number;
  byDay: Record<string, CalendarMeeting[]>;
  error?: string;
}

export interface CurrentMeeting {
  meeting: CalendarMeeting | null;
  isNow: boolean;
  minutesUntilStart?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CalendarService {
  private serverUrl: string;
  private userEmail: string;
  private timezone: string;

  constructor(serverUrl: string, userEmail: string, timezone: string = 'America/New_York') {
    this.serverUrl = serverUrl;
    this.userEmail = userEmail.toLowerCase();
    this.timezone = timezone;
  }

  /**
   * Update user email
   */
  setUserEmail(email: string): void {
    this.userEmail = email.toLowerCase();
  }

  /**
   * Update server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  /**
   * Update timezone
   */
  setTimezone(timezone: string): void {
    this.timezone = timezone;
  }

  /**
   * Fetch today's meetings
   * @param forceRefresh - If true, forces server to sync fresh data from Microsoft Graph
   */
  async getTodaysMeetings(forceRefresh: boolean = false): Promise<TodayResponse> {
    if (!this.userEmail) {
      return {
        success: false,
        date: new Date().toISOString().split('T')[0],
        email: '',
        meetingCount: 0,
        meetings: [],
        error: 'User email not configured'
      };
    }

    try {
      const tz = encodeURIComponent(this.timezone);
      const refreshParam = forceRefresh ? '&forceRefresh=true' : '';
      const response = await requestUrl({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${tz}${refreshParam}`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      return response.json;
    } catch (error) {
      console.error('Failed to fetch today\'s meetings:', error);
      return {
        success: false,
        date: new Date().toISOString().split('T')[0],
        email: this.userEmail,
        meetingCount: 0,
        meetings: [],
        error: error.message || 'Failed to fetch calendar'
      };
    }
  }

  /**
   * Fetch this week's meetings
   * @param forceRefresh - If true, forces server to fetch fresh data from Microsoft Graph
   */
  async getWeekMeetings(forceRefresh: boolean = false): Promise<WeekResponse> {
    if (!this.userEmail) {
      return {
        success: false,
        startDate: '',
        endDate: '',
        email: '',
        totalMeetings: 0,
        byDay: {},
        error: 'User email not configured'
      };
    }

    try {
      const tz = encodeURIComponent(this.timezone);
      const refreshParam = forceRefresh ? '&forceRefresh=true' : '';
      const response = await requestUrl({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${tz}${refreshParam}`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      return response.json;
    } catch (error) {
      console.error('Failed to fetch week\'s meetings:', error);
      return {
        success: false,
        startDate: '',
        endDate: '',
        email: this.userEmail,
        totalMeetings: 0,
        byDay: {},
        error: error.message || 'Failed to fetch calendar'
      };
    }
  }

  /**
   * Fetch meetings for a custom date range
   */
  async getMeetingsInRange(startDate: Date, endDate: Date): Promise<CalendarMeeting[]> {
    if (!this.userEmail) {
      return [];
    }

    try {
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      
      const response = await requestUrl({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${start}&end=${end}`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.json.success) {
        return response.json.meetings || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch calendar range:', error);
      return [];
    }
  }

  /**
   * Get the current or upcoming meeting (within 15 min window)
   * Used for auto-detecting meeting at recording start
   */
  async getCurrentMeeting(): Promise<CurrentMeeting> {
    const todayResponse = await this.getTodaysMeetings();
    
    if (!todayResponse.success || todayResponse.meetings.length === 0) {
      return { meeting: null, isNow: false };
    }

    const now = new Date();
    
    for (const meeting of todayResponse.meetings) {
      const start = new Date(meeting.start);
      const end = new Date(meeting.end);
      
      // Meeting is happening now
      if (now >= start && now <= end) {
        return { 
          meeting, 
          isNow: true 
        };
      }
      
      // Meeting starts within next 15 minutes
      const minutesUntilStart = (start.getTime() - now.getTime()) / (1000 * 60);
      if (minutesUntilStart > 0 && minutesUntilStart <= 15) {
        return { 
          meeting, 
          isNow: false, 
          minutesUntilStart: Math.ceil(minutesUntilStart) 
        };
      }
    }
    
    return { meeting: null, isNow: false };
  }

  /**
   * Find upcoming meetings for a specific account
   */
  async getMeetingsForAccount(accountName: string): Promise<CalendarMeeting[]> {
    const weekResponse = await this.getWeekMeetings();
    
    if (!weekResponse.success) {
      return [];
    }

    const allMeetings: CalendarMeeting[] = [];
    Object.values(weekResponse.byDay).forEach(dayMeetings => {
      allMeetings.push(...dayMeetings);
    });

    // Filter by account name match (case-insensitive partial match)
    const lowerAccountName = accountName.toLowerCase();
    return allMeetings.filter(m => 
      m.accountName?.toLowerCase().includes(lowerAccountName) ||
      m.subject.toLowerCase().includes(lowerAccountName) ||
      m.attendees.some(a => 
        a.email.toLowerCase().includes(lowerAccountName.split(' ')[0])
      )
    );
  }

  /**
   * Format meeting for note template
   */
  static formatMeetingForNote(meeting: CalendarMeeting): {
    title: string;
    attendees: string;
    meetingStart: string;
    accountName?: string;
  } {
    const externalAttendees = meeting.attendees
      .filter(a => a.isExternal !== false)
      .map(a => a.name || a.email.split('@')[0])
      .slice(0, 5)
      .join(', ');

    return {
      title: meeting.subject,
      attendees: externalAttendees,
      meetingStart: meeting.start,
      accountName: meeting.accountName
    };
  }

  /**
   * Get day name from date string
   * Handles YYYY-MM-DD format correctly by parsing as local time
   */
  static getDayName(dateString: string): string {
    // Parse the date string as local time, not UTC
    // new Date('2026-02-04') is interpreted as UTC midnight, which can be the wrong day locally
    // new Date('2026-02-04T00:00:00') is interpreted as local midnight
    let date: Date;
    if (dateString.length === 10 && dateString.includes('-')) {
      // YYYY-MM-DD format - parse as local time
      date = new Date(dateString + 'T00:00:00');
    } else {
      // Full ISO string or other format
      date = new Date(dateString);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const meetingDate = new Date(date);
    meetingDate.setHours(0, 0, 0, 0);
    
    const diff = Math.round((meetingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  /**
   * Format time for display (e.g., "10:00 AM")
   * @param isoString - ISO date string
   * @param timezone - Optional IANA timezone (e.g., 'America/New_York')
   */
  static formatTime(isoString: string, timezone?: string): string {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    };
    if (timezone) {
      options.timeZone = timezone;
    }
    return date.toLocaleTimeString('en-US', options);
  }

  /**
   * Calculate meeting duration in minutes
   */
  static getMeetingDuration(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  }
}
