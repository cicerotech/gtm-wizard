/**
 * Eudia Calendar Plugin
 * 
 * Simple calendar plugin that shows your Microsoft 365 calendar
 * by connecting to the GTM Brain server.
 * 
 * Setup: Enter your email in settings, calendar appears.
 */
import { Plugin, Notice, ItemView, WorkspaceLeaf, Setting, PluginSettingTab, requestUrl } from 'obsidian';

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

interface CalendarSettings {
  userEmail: string;
  serverUrl: string;
  refreshMinutes: number;
}

const DEFAULT_SETTINGS: CalendarSettings = {
  userEmail: '',
  serverUrl: 'https://gtm-wizard.onrender.com',
  refreshMinutes: 5
};

// ═══════════════════════════════════════════════════════════════════════════
// MEETING INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

interface Meeting {
  id: string;
  subject: string;
  start: string;
  end: string;
  location?: string;
  attendees: { name: string; email: string }[];
  isCustomerMeeting: boolean;
  accountName?: string;
}

interface WeekResponse {
  success: boolean;
  totalMeetings: number;
  byDay: Record<string, Meeting[]>;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════

const VIEW_TYPE = 'eudia-calendar-view';

class EudiaCalendarView extends ItemView {
  plugin: EudiaCalendarPlugin;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: EudiaCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Calendar'; }
  getIcon(): string { return 'calendar'; }

  async onOpen(): Promise<void> {
    await this.render();
    
    // Auto-refresh
    const intervalMs = (this.plugin.settings.refreshMinutes || 5) * 60 * 1000;
    this.refreshTimer = window.setInterval(() => this.render(), intervalMs);
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
    }
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('eudia-cal-container');

    // Header
    const header = container.createDiv({ cls: 'eudia-cal-header' });
    header.createEl('h4', { text: 'Upcoming Meetings' });
    
    const refreshBtn = header.createEl('button', { cls: 'eudia-cal-refresh', text: '↻' });
    refreshBtn.title = 'Refresh';
    refreshBtn.onclick = () => this.render();

    // Check email
    if (!this.plugin.settings.userEmail) {
      this.renderEmailSetup(container);
      return;
    }

    // Loading
    const loadingEl = container.createDiv({ cls: 'eudia-cal-loading', text: 'Loading...' });

    try {
      const data = await this.fetchMeetings();
      loadingEl.remove();

      if (!data.success) {
        this.renderError(container, data.error || 'Failed to load calendar');
        return;
      }

      if (data.totalMeetings === 0) {
        container.createDiv({ cls: 'eudia-cal-empty', text: 'No upcoming meetings this week' });
        return;
      }

      // Render meetings by day
      const days = Object.keys(data.byDay).sort();
      for (const day of days) {
        const meetings = data.byDay[day];
        if (!meetings || meetings.length === 0) continue;

        const daySection = container.createDiv({ cls: 'eudia-cal-day' });
        daySection.createEl('div', { cls: 'eudia-cal-day-header', text: this.formatDayName(day) });

        for (const meeting of meetings) {
          const meetingEl = daySection.createDiv({ 
            cls: `eudia-cal-meeting ${meeting.isCustomerMeeting ? 'customer' : ''}` 
          });

          meetingEl.createEl('div', { cls: 'eudia-cal-time', text: this.formatTime(meeting.start) });
          
          const details = meetingEl.createDiv({ cls: 'eudia-cal-details' });
          details.createEl('div', { cls: 'eudia-cal-subject', text: meeting.subject });
          
          if (meeting.accountName) {
            details.createEl('div', { cls: 'eudia-cal-account', text: meeting.accountName });
          } else if (meeting.attendees.length > 0) {
            const names = meeting.attendees.slice(0, 2).map(a => a.name || a.email.split('@')[0]).join(', ');
            details.createEl('div', { cls: 'eudia-cal-attendees', text: names });
          }

          meetingEl.title = 'Click to create note';
          meetingEl.onclick = () => this.createNoteForMeeting(meeting);
        }
      }

    } catch (error) {
      loadingEl.remove();
      this.renderError(container, error.message || 'Connection failed');
    }
  }

  async fetchMeetings(): Promise<WeekResponse> {
    const { serverUrl, userEmail } = this.plugin.settings;
    
    const response = await requestUrl({
      url: `${serverUrl}/api/calendar/${userEmail}/week`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    return response.json as WeekResponse;
  }

  renderEmailSetup(container: Element): void {
    const setup = container.createDiv({ cls: 'eudia-cal-setup' });
    setup.createEl('h4', { text: '📅 Connect Your Calendar' });
    setup.createEl('p', { text: 'Enter your work email to see your meetings:' });

    const form = setup.createDiv({ cls: 'eudia-cal-form' });
    
    const input = form.createEl('input', {
      type: 'email',
      placeholder: 'you@company.com'
    }) as HTMLInputElement;
    input.addClass('eudia-cal-input');

    const btn = form.createEl('button', { text: 'Connect', cls: 'eudia-cal-btn' });
    
    btn.onclick = async () => {
      const email = input.value.trim();
      if (!email || !email.includes('@')) {
        new Notice('Please enter a valid email');
        return;
      }
      
      btn.textContent = 'Connecting...';
      btn.setAttribute('disabled', 'true');
      
      // Test the connection
      try {
        const testUrl = `${this.plugin.settings.serverUrl}/api/calendar/${email}/today`;
        const response = await requestUrl({ url: testUrl, method: 'GET' });
        
        if (response.json.success !== false) {
          this.plugin.settings.userEmail = email;
          await this.plugin.saveSettings();
          new Notice('✓ Calendar connected!');
          await this.render();
        } else {
          new Notice('Could not connect. Check your email.');
          btn.textContent = 'Connect';
          btn.removeAttribute('disabled');
        }
      } catch (e) {
        new Notice('Connection failed. Try again.');
        btn.textContent = 'Connect';
        btn.removeAttribute('disabled');
      }
    };
  }

  renderError(container: Element, message: string): void {
    const errorEl = container.createDiv({ cls: 'eudia-cal-error' });
    errorEl.createEl('p', { text: `Error: ${message}` });
    
    const retryBtn = errorEl.createEl('button', { text: 'Retry', cls: 'eudia-cal-btn' });
    retryBtn.onclick = () => this.render();
  }

  async createNoteForMeeting(meeting: Meeting): Promise<void> {
    const dateStr = meeting.start.split('T')[0];
    const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr} - ${safeName}.md`;
    
    const attendeeList = meeting.attendees
      .map(a => `- ${a.name || a.email}`)
      .join('\n');

    const content = `---
title: "${meeting.subject}"
date: ${dateStr}
meeting_time: ${this.formatTime(meeting.start)}
attendees: ${meeting.attendees.map(a => a.name || a.email).join(', ')}
account: ${meeting.accountName || 'TBD'}
sync_to_salesforce: false
---

# ${meeting.subject}

## Attendees
${attendeeList}

## Notes


## Next Steps
- [ ] 
`;

    try {
      await this.app.vault.create(fileName, content);
      const file = this.app.vault.getAbstractFileByPath(fileName);
      if (file) {
        await this.app.workspace.openLinkText(fileName, '', true);
      }
      new Notice(`Created: ${fileName}`);
    } catch (e) {
      new Notice('Could not create note');
    }
  }

  formatDayName(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayDate = new Date(date);
    dayDate.setHours(0, 0, 0, 0);
    
    const diff = (dayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: 'numeric', minute: '2-digit', hour12: true 
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

class CalendarSettingsTab extends PluginSettingTab {
  plugin: EudiaCalendarPlugin;

  constructor(app: any, plugin: EudiaCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Eudia Calendar' });

    new Setting(containerEl)
      .setName('Your Email')
      .setDesc('Your work email (e.g., keigan@eudia.com)')
      .addText(text => text
        .setPlaceholder('you@company.com')
        .setValue(this.plugin.settings.userEmail)
        .onChange(async (value) => {
          this.plugin.settings.userEmail = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Refresh Interval')
      .setDesc('How often to refresh (minutes)')
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.refreshMinutes)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.refreshMinutes = value;
          await this.plugin.saveSettings();
        }));

    // Test button
    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify calendar is working')
      .addButton(btn => btn
        .setButtonText('Test')
        .setCta()
        .onClick(async () => {
          if (!this.plugin.settings.userEmail) {
            new Notice('Enter your email first');
            return;
          }
          btn.setButtonText('Testing...');
          try {
            const url = `${this.plugin.settings.serverUrl}/api/calendar/${this.plugin.settings.userEmail}/today`;
            const resp = await requestUrl({ url, method: 'GET' });
            if (resp.json.success) {
              new Notice(`✓ Connected! ${resp.json.meetingCount} meetings today`);
              btn.setButtonText('✓ Success');
            } else {
              new Notice(`Error: ${resp.json.error}`);
              btn.setButtonText('✗ Failed');
            }
          } catch (e) {
            new Notice('Connection failed');
            btn.setButtonText('✗ Failed');
          }
          setTimeout(() => btn.setButtonText('Test'), 2000);
        }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export default class EudiaCalendarPlugin extends Plugin {
  settings: CalendarSettings;

  async onload(): Promise<void> {
    console.log('Loading Eudia Calendar');
    
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new EudiaCalendarView(leaf, this));

    // Ribbon icon
    this.addRibbonIcon('calendar', 'Eudia Calendar', () => this.openCalendar());

    // Commands
    this.addCommand({
      id: 'open-calendar',
      name: 'Open Calendar',
      callback: () => this.openCalendar()
    });

    // Settings tab
    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    // Auto-open if email is configured
    if (this.settings.userEmail) {
      this.app.workspace.onLayoutReady(() => {
        this.openCalendar();
      });
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openCalendar(): Promise<void> {
    const { workspace } = this.app;
    
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  onunload(): void {
    console.log('Unloading Eudia Calendar');
  }
}
