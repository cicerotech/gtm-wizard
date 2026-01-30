import { ItemView, WorkspaceLeaf, moment } from 'obsidian';
import type EudiaCalendarPlugin from '../main';
import type { CalendarEvent } from './ICSParser';

export const CALENDAR_VIEW_TYPE = 'eudia-calendar-view';

export class CalendarView extends ItemView {
  plugin: EudiaCalendarPlugin;
  private refreshInterval: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: EudiaCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Eudia Calendar';
  }

  getIcon(): string {
    return 'calendar';
  }

  async onOpen(): Promise<void> {
    this.render();
    
    // Auto-refresh every 5 minutes
    this.refreshInterval = window.setInterval(() => {
      this.plugin.refreshCalendar().then(() => this.render());
    }, 5 * 60 * 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
    }
  }

  /**
   * Main render method
   */
  render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('eudia-calendar-container');

    // Header with refresh button
    const header = container.createDiv({ cls: 'eudia-calendar-header' });
    header.createEl('h3', { text: 'Calendar' });
    
    const refreshBtn = header.createEl('button', { 
      cls: 'eudia-calendar-refresh',
      text: '↻'
    });
    refreshBtn.title = 'Refresh calendar';
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
      await this.plugin.refreshCalendar();
      this.render();
    };

    // Check if configured
    if (!this.plugin.settings.icsUrl) {
      this.renderSetupMessage(container);
      return;
    }

    // Loading state
    if (this.plugin.isLoading) {
      container.createDiv({ cls: 'eudia-calendar-loading', text: 'Loading calendar...' });
      return;
    }

    // Error state
    if (this.plugin.lastError) {
      const errorDiv = container.createDiv({ cls: 'eudia-calendar-error' });
      errorDiv.createEl('p', { text: '⚠️ ' + this.plugin.lastError });
      errorDiv.createEl('button', { text: 'Retry' }).onclick = async () => {
        await this.plugin.refreshCalendar();
        this.render();
      };
      return;
    }

    // Render calendar sections
    this.renderDateNavigator(container);
    this.renderEventList(container);
  }

  /**
   * Render setup message when not configured
   */
  private renderSetupMessage(container: Element): void {
    const setup = container.createDiv({ cls: 'eudia-calendar-setup' });
    setup.createEl('h4', { text: 'Setup Required' });
    setup.createEl('p', { text: 'Add your calendar ICS URL in settings.' });
    
    const instructions = setup.createDiv({ cls: 'eudia-calendar-instructions' });
    instructions.createEl('h5', { text: 'To get your ICS URL:' });
    
    const list = instructions.createEl('ol');
    list.createEl('li', { text: 'Microsoft 365: Outlook → Settings → Calendar → Shared calendars → Publish a calendar' });
    list.createEl('li', { text: 'Google: Calendar → Settings → Integrate calendar → Secret address in iCal format' });
    list.createEl('li', { text: 'Copy the ICS link and paste it in plugin settings' });
    
    setup.createEl('button', { text: 'Open Settings' }).onclick = () => {
      // @ts-ignore - Obsidian internal
      this.app.setting.open();
      // @ts-ignore
      this.app.setting.openTabById('eudia-calendar');
    };
  }

  /**
   * Render date navigator (Today, Week view toggle)
   */
  private renderDateNavigator(container: Element): void {
    const nav = container.createDiv({ cls: 'eudia-calendar-nav' });
    
    const viewOptions = ['Today', 'This Week', 'Upcoming'];
    const currentView = this.plugin.settings.defaultView || 'Today';
    
    for (const view of viewOptions) {
      const btn = nav.createEl('button', {
        text: view,
        cls: `eudia-nav-btn ${view === currentView ? 'active' : ''}`
      });
      btn.onclick = () => {
        this.plugin.settings.defaultView = view;
        this.plugin.saveSettings();
        this.render();
      };
    }
  }

  /**
   * Render the event list
   */
  private renderEventList(container: Element): void {
    const events = this.getFilteredEvents();
    const list = container.createDiv({ cls: 'eudia-calendar-events' });
    
    if (events.length === 0) {
      list.createDiv({ cls: 'eudia-no-events', text: 'No meetings scheduled' });
      return;
    }

    // Group events by date
    const groupedEvents = this.groupEventsByDate(events);
    
    for (const [dateKey, dayEvents] of Object.entries(groupedEvents)) {
      const dateHeader = list.createDiv({ cls: 'eudia-date-header' });
      dateHeader.createEl('span', { text: this.formatDateHeader(dateKey) });
      
      for (const event of dayEvents as CalendarEvent[]) {
        this.renderEventCard(list, event);
      }
    }
  }

  /**
   * Render a single event card
   */
  private renderEventCard(container: Element, event: CalendarEvent): void {
    const card = container.createDiv({ 
      cls: `eudia-event-card ${event.status === 'cancelled' ? 'cancelled' : ''}`
    });
    
    // Time
    const time = card.createDiv({ cls: 'eudia-event-time' });
    if (event.allDay) {
      time.textContent = 'All day';
    } else {
      time.textContent = this.formatTime(event.start) + ' - ' + this.formatTime(event.end);
    }
    
    // Title
    const title = card.createDiv({ cls: 'eudia-event-title' });
    title.textContent = event.title;
    
    // Location (if present)
    if (event.location) {
      const location = card.createDiv({ cls: 'eudia-event-location' });
      location.textContent = '📍 ' + event.location;
    }
    
    // Attendees (collapsible)
    if (event.attendees.length > 0) {
      const attendeesContainer = card.createDiv({ cls: 'eudia-event-attendees' });
      const toggle = attendeesContainer.createEl('span', {
        cls: 'eudia-attendees-toggle',
        text: `👥 ${event.attendees.length} attendees`
      });
      
      const attendeesList = attendeesContainer.createDiv({ cls: 'eudia-attendees-list hidden' });
      for (const att of event.attendees.slice(0, 10)) {
        const statusIcon = att.status === 'accepted' ? '✓' : 
                          att.status === 'declined' ? '✗' : 
                          att.status === 'tentative' ? '?' : '·';
        attendeesList.createDiv({ text: `${statusIcon} ${att.name || att.email}` });
      }
      if (event.attendees.length > 10) {
        attendeesList.createDiv({ text: `... and ${event.attendees.length - 10} more` });
      }
      
      toggle.onclick = () => {
        attendeesList.toggleClass('hidden', !attendeesList.hasClass('hidden'));
      };
    }
    
    // Create Note button
    const createNoteBtn = card.createEl('button', {
      cls: 'eudia-create-note-btn',
      text: '+ Create Note'
    });
    createNoteBtn.onclick = () => this.plugin.createNoteFromEvent(event);
  }

  /**
   * Get events based on current view filter
   */
  private getFilteredEvents(): CalendarEvent[] {
    const view = this.plugin.settings.defaultView || 'Today';
    const allEvents = this.plugin.events;
    const now = new Date();
    
    switch (view) {
      case 'Today': {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        return allEvents.filter(e => e.start >= todayStart && e.start < todayEnd);
      }
      case 'This Week': {
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(now.getDate() - now.getDay()); // Sunday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return allEvents.filter(e => e.start >= weekStart && e.start < weekEnd);
      }
      case 'Upcoming':
      default: {
        // Next 14 days
        const end = new Date(now);
        end.setDate(end.getDate() + 14);
        return allEvents.filter(e => e.start >= now && e.start < end);
      }
    }
  }

  /**
   * Group events by date
   */
  private groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
    const grouped: Record<string, CalendarEvent[]> = {};
    
    for (const event of events) {
      const dateKey = event.start.toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    }
    
    return grouped;
  }

  /**
   * Format date header (e.g., "Today", "Tomorrow", "Monday, Jan 15")
   */
  private formatDateHeader(dateKey: string): string {
    const date = new Date(dateKey + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.getTime() === today.getTime()) {
      return 'Today';
    }
    if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  /**
   * Format time (e.g., "2:30 PM")
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}
