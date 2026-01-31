/**
 * Eudia Calendar Plugin v1.1.0
 * 
 * Simple calendar plugin that shows your Microsoft 365 calendar
 * by connecting to the GTM Brain server.
 * 
 * Setup: Enter your email in settings, calendar appears.
 * 
 * CHANGELOG:
 * - v1.1.0: Added robust error handling, server health checks, better logging
 */
import { Plugin, Notice, ItemView, WorkspaceLeaf, Setting, PluginSettingTab, requestUrl } from 'obsidian';

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING - For debugging plugin load issues
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[Eudia Calendar]';

function log(message: string, ...args: any[]): void {
  console.log(`${LOG_PREFIX} ${message}`, ...args);
}

function logError(message: string, error?: any): void {
  console.error(`${LOG_PREFIX} ERROR: ${message}`, error || '');
}

function logWarn(message: string): void {
  console.warn(`${LOG_PREFIX} WARN: ${message}`);
}

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
    
    log(`Fetching meetings for ${userEmail} from ${serverUrl}`);
    
    try {
      // First, check server health
      try {
        const healthCheck = await requestUrl({
          url: `${serverUrl}/api/health`,
          method: 'GET',
          throw: false
        });
        
        if (healthCheck.status !== 200) {
          logWarn('Server health check failed');
        }
      } catch (healthError) {
        logWarn('Server may be starting up...');
      }
      
      // Fetch calendar data
      const response = await requestUrl({
        url: `${serverUrl}/api/calendar/${encodeURIComponent(userEmail)}/week`,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        throw: false
      });

      log(`Calendar API response status: ${response.status}`);
      
      if (response.status === 403) {
        return {
          success: false,
          totalMeetings: 0,
          byDay: {},
          error: 'Email not authorized. Please use your @eudia.com email address.'
        };
      }
      
      if (response.status !== 200) {
        return {
          success: false,
          totalMeetings: 0,
          byDay: {},
          error: `Server returned ${response.status}. Please try again.`
        };
      }

      const data = response.json as WeekResponse;
      log(`Received ${data.totalMeetings || 0} meetings`);
      return data;
      
    } catch (error) {
      logError('Failed to fetch meetings:', error);
      return {
        success: false,
        totalMeetings: 0,
        byDay: {},
        error: error.message || 'Network error. Check your connection.'
      };
    }
  }

  renderEmailSetup(container: Element): void {
    const setup = container.createDiv({ cls: 'eudia-cal-setup' });
    setup.createEl('h4', { text: 'Connect Your Calendar' });
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
    log('Plugin loading...');
    
    // #region agent log - H2: Track plugin initialization
    fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:onload',message:'Plugin onload START',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    
    try {
      // Step 1: Load settings
      await this.loadSettings();
      log('Settings loaded:', { 
        hasEmail: !!this.settings.userEmail, 
        serverUrl: this.settings.serverUrl 
      });
      
      // #region agent log - H4: Check settings after load
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:afterSettings',message:'Settings loaded successfully',data:{settings:this.settings},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      // Step 2: Register the view type
      // #region agent log - H5: Track view registration
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:beforeRegisterView',message:'About to register view',data:{viewType:VIEW_TYPE},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      
      this.registerView(VIEW_TYPE, (leaf) => {
        log('Creating EudiaCalendarView');
        return new EudiaCalendarView(leaf, this);
      });
      log('View registered with type:', VIEW_TYPE);
      
      // #region agent log - H5: View registration complete
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:afterRegisterView',message:'View registered successfully',data:{viewType:VIEW_TYPE},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
      // #endregion

      // Step 3: Add ribbon icon
      this.addRibbonIcon('calendar', 'Eudia Calendar', () => {
        log('Ribbon icon clicked');
        this.openCalendar();
      });
      log('Ribbon icon added');

      // Step 4: Register commands
      this.addCommand({
        id: 'open-calendar',
        name: 'Open Calendar',
        callback: () => this.openCalendar()
      });
      log('Command registered');

      // Step 5: Add settings tab
      this.addSettingTab(new CalendarSettingsTab(this.app, this));
      log('Settings tab added');

      // Step 6: Auto-open if email is configured
      if (this.settings.userEmail) {
        this.app.workspace.onLayoutReady(() => {
          log('Workspace ready, auto-opening calendar');
          this.openCalendar();
        });
      }

      log('Plugin loaded successfully!');
      
      // #region agent log - H2: Plugin load complete
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:loadComplete',message:'Plugin loaded SUCCESSFULLY',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
    } catch (error) {
      logError('Failed to load plugin:', error);
      
      // #region agent log - H2: Plugin load FAILED
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:loadFailed',message:'Plugin load FAILED',data:{error:String(error),stack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
      new Notice('Eudia Calendar: Failed to load. Check console for details.');
    }
  }

  async loadSettings(): Promise<void> {
    // #region agent log - H4: Settings load start
    fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:loadSettingsStart',message:'loadSettings called',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    
    try {
      const data = await this.loadData();
      
      // #region agent log - H4: Raw data from loadData
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:loadDataResult',message:'loadData returned',data:{rawData:data,type:typeof data},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
      log('Settings merged:', Object.keys(this.settings));
    } catch (error) {
      logError('Failed to load settings, using defaults:', error);
      
      // #region agent log - H4: Settings load error
      fetch('http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eudia-calendar/main.ts:loadSettingsError',message:'loadSettings FAILED',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await this.saveData(this.settings);
      log('Settings saved');
    } catch (error) {
      logError('Failed to save settings:', error);
      new Notice('Failed to save calendar settings');
    }
  }

  async openCalendar(): Promise<void> {
    log('Opening calendar view...');
    
    try {
      const { workspace } = this.app;
      
      let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
      log('Existing leaf found:', !!leaf);
      
      if (!leaf) {
        const rightLeaf = workspace.getRightLeaf(false);
        if (rightLeaf) {
          log('Creating new view in right leaf');
          await rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
          leaf = rightLeaf;
        } else {
          logWarn('Could not get right leaf');
        }
      }

      if (leaf) {
        workspace.revealLeaf(leaf);
        log('Calendar view revealed');
      } else {
        logError('No leaf available for calendar view');
      }
    } catch (error) {
      logError('Failed to open calendar:', error);
      new Notice('Could not open calendar view');
    }
  }

  onunload(): void {
    log('Plugin unloading...');
  }
}
