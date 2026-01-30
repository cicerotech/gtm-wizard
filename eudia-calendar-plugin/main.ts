import { Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { CalendarView, CALENDAR_VIEW_TYPE } from './src/CalendarView';
import { CalendarEvent, parseICS } from './src/ICSParser';
import { EudiaCalendarSettings, EudiaCalendarSettingTab, DEFAULT_SETTINGS } from './src/settings';

export default class EudiaCalendarPlugin extends Plugin {
  settings: EudiaCalendarSettings;
  events: CalendarEvent[] = [];
  isLoading: boolean = false;
  lastError: string | null = null;
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    console.log('Loading Eudia Calendar plugin');

    // Load settings
    await this.loadSettings();

    // Register the calendar view
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new CalendarView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon('calendar', 'Eudia Calendar', () => {
      this.activateView();
    });

    // Add command to open calendar
    this.addCommand({
      id: 'open-calendar',
      name: 'Open Calendar',
      callback: () => this.activateView()
    });

    // Add command to refresh calendar
    this.addCommand({
      id: 'refresh-calendar',
      name: 'Refresh Calendar',
      callback: async () => {
        await this.refreshCalendar();
        new Notice(`Refreshed: ${this.events.length} events loaded`);
      }
    });

    // Add command to create note from next meeting
    this.addCommand({
      id: 'create-note-next-meeting',
      name: 'Create Note for Next Meeting',
      callback: async () => {
        await this.createNoteForNextMeeting();
      }
    });

    // Add settings tab
    this.addSettingTab(new EudiaCalendarSettingTab(this.app, this));

    // Initial calendar load
    if (this.settings.icsUrl) {
      this.refreshCalendar();
      this.startAutoRefresh();
    }
  }

  onunload(): void {
    console.log('Unloading Eudia Calendar plugin');
    this.stopAutoRefresh();
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    
    // Restart auto-refresh with new interval
    this.stopAutoRefresh();
    this.startAutoRefresh();
  }

  /**
   * Activate the calendar view
   */
  async activateView(): Promise<void> {
    const { workspace } = this.app;

    // Check if view is already open
    let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
    
    if (!leaf) {
      // Open in right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Fetch and parse ICS calendar feed
   */
  async refreshCalendar(): Promise<void> {
    if (!this.settings.icsUrl) {
      this.lastError = 'No ICS URL configured';
      return;
    }

    this.isLoading = true;
    this.lastError = null;

    try {
      // Fetch ICS feed
      const response = await requestUrl({
        url: this.settings.icsUrl,
        method: 'GET',
        headers: {
          'Accept': 'text/calendar, application/calendar+xml, text/plain'
        }
      });

      if (!response.text) {
        throw new Error('Empty response from calendar server');
      }

      // Parse ICS content
      this.events = parseICS(response.text);
      
      // Filter out cancelled if setting is off
      if (!this.settings.showCancelled) {
        this.events = this.events.filter(e => e.status !== 'cancelled');
      }

      console.log(`Loaded ${this.events.length} calendar events`);
      this.lastError = null;

    } catch (error) {
      console.error('Failed to refresh calendar:', error);
      this.lastError = this.getErrorMessage(error);
      this.events = [];
    } finally {
      this.isLoading = false;
      this.updateView();
    }
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    const msg = error.message || String(error);
    
    if (msg.includes('CORS') || msg.includes('NetworkError')) {
      return 'Calendar blocked by CORS. Try using a different ICS URL or a CORS proxy.';
    }
    if (msg.includes('401') || msg.includes('403')) {
      return 'Access denied. Check your ICS URL permissions.';
    }
    if (msg.includes('404')) {
      return 'Calendar not found. Check your ICS URL.';
    }
    if (msg.includes('timeout')) {
      return 'Request timed out. Try again later.';
    }
    
    return `Failed to load calendar: ${msg}`;
  }

  /**
   * Update the calendar view if open
   */
  private updateView(): void {
    const leaves = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as CalendarView;
      if (view && view.render) {
        view.render();
      }
    }
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    if (this.settings.refreshInterval > 0 && this.settings.icsUrl) {
      this.refreshTimer = window.setInterval(
        () => this.refreshCalendar(),
        this.settings.refreshInterval * 60 * 1000
      );
    }
  }

  /**
   * Stop auto-refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Create a note from a calendar event
   */
  async createNoteFromEvent(event: CalendarEvent): Promise<TFile | null> {
    try {
      // Ensure folder exists
      const folder = this.settings.notesFolder;
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }

      // Generate filename
      const dateStr = event.start.toISOString().split('T')[0];
      const safeTitle = event.title.replace(/[\\/:*?"<>|]/g, '-').substring(0, 50);
      const filename = `${folder}/${dateStr} - ${safeTitle}.md`;

      // Check if file already exists
      const existing = this.app.vault.getAbstractFileByPath(filename);
      if (existing) {
        new Notice('Note already exists. Opening...');
        const leaf = this.app.workspace.getLeaf();
        await leaf.openFile(existing as TFile);
        return existing as TFile;
      }

      // Apply template
      const content = this.applyTemplate(event);

      // Create file
      const file = await this.app.vault.create(filename, content);
      
      // Open the new note
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(file);

      new Notice('Meeting note created');
      return file;

    } catch (error) {
      console.error('Failed to create meeting note:', error);
      new Notice(`Failed to create note: ${error.message}`);
      return null;
    }
  }

  /**
   * Apply template variables to create note content
   */
  private applyTemplate(event: CalendarEvent): string {
    let content = this.settings.noteTemplate;

    // Format date and time
    const dateStr = event.start.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const timeStr = event.allDay ? 'All day' : 
      `${event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${event.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

    // Format attendees
    const attendeeNames = event.attendees.map(a => a.name || a.email).filter(Boolean);
    const attendeeList = attendeeNames.map(name => `- ${name}`).join('\n');
    const attendeesStr = attendeeNames.join(', ');

    // Replace template variables
    content = content
      .replace(/\{\{title\}\}/g, event.title)
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{location\}\}/g, event.location || '')
      .replace(/\{\{attendees\}\}/g, attendeesStr)
      .replace(/\{\{attendee_list\}\}/g, attendeeList || '- (none)')
      .replace(/\{\{description\}\}/g, event.description || '')
      .replace(/\{\{organizer\}\}/g, event.organizer || '');

    return content;
  }

  /**
   * Create note for the next upcoming meeting
   */
  async createNoteForNextMeeting(): Promise<void> {
    if (this.events.length === 0) {
      await this.refreshCalendar();
    }

    const now = new Date();
    const nextMeeting = this.events.find(e => e.start > now);

    if (!nextMeeting) {
      new Notice('No upcoming meetings found');
      return;
    }

    await this.createNoteFromEvent(nextMeeting);
  }
}
