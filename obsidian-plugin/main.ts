import { 
  App, 
  Plugin, 
  PluginSettingTab, 
  Setting, 
  Notice, 
  TFolder, 
  TFile,
  requestUrl,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  Editor,
  EditorPosition,
  Modal,
  MarkdownView,
  ItemView,
  WorkspaceLeaf
} from 'obsidian';

import { AudioRecorder, RecordingState, RecordingResult } from './src/AudioRecorder';
import { TranscriptionService, TranscriptionResult, MeetingContext, ProcessedSections, AccountDetector, accountDetector, AccountDetectionResult } from './src/TranscriptionService';
import { CalendarService, CalendarMeeting, TodayResponse, WeekResponse } from './src/CalendarService';
import { SmartTagService, SmartTags } from './src/SmartTagService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface EudiaSyncSettings {
  serverUrl: string;
  accountsFolder: string;
  recordingsFolder: string;
  syncOnStartup: boolean;
  autoSyncAfterTranscription: boolean;
  saveAudioFiles: boolean;
  appendTranscript: boolean;
  lastSyncTime: string | null;
  cachedAccounts: SalesforceAccount[];
  // User configuration
  userEmail: string;
  setupCompleted: boolean;
  calendarConfigured: boolean;
  // OpenAI configuration (fallback if server key unavailable)
  openaiApiKey: string;
  // Smart tagging
  enableSmartTags: boolean;
  // Calendar
  showCalendarView: boolean;
}

const DEFAULT_SETTINGS: EudiaSyncSettings = {
  serverUrl: 'https://gtm-wizard.onrender.com',
  accountsFolder: 'Accounts',
  recordingsFolder: 'Recordings',
  syncOnStartup: true,
  autoSyncAfterTranscription: true,
  saveAudioFiles: true,
  appendTranscript: true,
  lastSyncTime: null,
  cachedAccounts: [],
  enableSmartTags: true,
  showCalendarView: true,
  userEmail: '',
  setupCompleted: false,
  calendarConfigured: false,
  openaiApiKey: ''
};

interface SalesforceAccount {
  id: string;
  name: string;
}

interface AccountsResponse {
  success: boolean;
  count: number;
  accounts: SalesforceAccount[];
}

interface ConnectionStatus {
  server: 'connected' | 'connecting' | 'error';
  calendar: 'connected' | 'not_configured' | 'error' | 'not_authorized';
  salesforce: 'connected' | 'not_configured' | 'error';
  serverMessage?: string;
  calendarMessage?: string;
  salesforceMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW TYPE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CALENDAR_VIEW_TYPE = 'eudia-calendar-view';

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT SUGGESTER
// ═══════════════════════════════════════════════════════════════════════════

class AccountSuggester extends EditorSuggest<SalesforceAccount> {
  plugin: EudiaSyncPlugin;

  constructor(app: App, plugin: EudiaSyncPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const content = editor.getValue();
    const cursorOffset = editor.posToOffset(cursor);
    
    const frontmatterStart = content.indexOf('---');
    const frontmatterEnd = content.indexOf('---', frontmatterStart + 3);
    
    if (frontmatterStart === -1 || cursorOffset < frontmatterStart || cursorOffset > frontmatterEnd) {
      return null;
    }
    
    const accountMatch = line.match(/^account:\s*(.*)$/);
    if (!accountMatch) return null;
    
    const query = accountMatch[1].trim();
    const startPos = line.indexOf(':') + 1;
    const leadingSpaces = line.substring(startPos).match(/^\s*/)?.[0].length || 0;
    
    return {
      start: { line: cursor.line, ch: startPos + leadingSpaces },
      end: cursor,
      query: query
    };
  }

  getSuggestions(context: EditorSuggestContext): SalesforceAccount[] {
    const query = context.query.toLowerCase();
    const accounts = this.plugin.settings.cachedAccounts;
    
    if (!query) return accounts.slice(0, 10);
    
    return accounts
      .filter(a => a.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }

  renderSuggestion(account: SalesforceAccount, el: HTMLElement): void {
    el.createEl('div', { text: account.name, cls: 'suggestion-title' });
  }

  selectSuggestion(account: SalesforceAccount, evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    this.context.editor.replaceRange(account.name, this.context.start, this.context.end);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RECORDING STATUS BAR - Minimal, Non-Distracting UI
// ═══════════════════════════════════════════════════════════════════════════

class RecordingStatusBar {
  private containerEl: HTMLElement | null = null;
  private levelBarEl: HTMLElement | null = null;
  
  private onPause: () => void;
  private onResume: () => void;
  private onStop: () => void;
  private onCancel: () => void;

  constructor(
    onPause: () => void,
    onResume: () => void,
    onStop: () => void,
    onCancel: () => void
  ) {
    this.onPause = onPause;
    this.onResume = onResume;
    this.onStop = onStop;
    this.onCancel = onCancel;
  }

  show(): void {
    if (this.containerEl) return;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'eudia-transcription-bar active';
    
    // Audio level meter
    const levelContainer = document.createElement('div');
    levelContainer.className = 'eudia-level-container';
    this.levelBarEl = document.createElement('div');
    this.levelBarEl.className = 'eudia-level-bar';
    this.levelBarEl.style.width = '0%';
    levelContainer.appendChild(this.levelBarEl);
    this.containerEl.appendChild(levelContainer);

    // Minimal controls
    const controls = document.createElement('div');
    controls.className = 'eudia-controls-minimal';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'eudia-control-btn stop';
    stopBtn.innerHTML = '⏹';
    stopBtn.title = 'Stop & Summarize';
    stopBtn.onclick = () => this.onStop();
    controls.appendChild(stopBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'eudia-control-btn cancel';
    cancelBtn.innerHTML = '✕';
    cancelBtn.title = 'Cancel';
    cancelBtn.onclick = () => this.onCancel();
    controls.appendChild(cancelBtn);

    this.containerEl.appendChild(controls);
    document.body.appendChild(this.containerEl);
  }

  hide(): void {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }

  updateState(state: RecordingState): void {
    if (!this.containerEl || !this.levelBarEl) return;
    this.levelBarEl.style.width = `${state.audioLevel}%`;
    this.containerEl.className = state.isPaused 
      ? 'eudia-transcription-bar paused' 
      : 'eudia-transcription-bar active';
  }

  showProcessing(): void {
    if (!this.containerEl) return;
    this.containerEl.className = 'eudia-transcription-bar processing';
    if (this.levelBarEl?.parentElement) {
      this.levelBarEl.parentElement.style.display = 'none';
    }
  }

  showComplete(stats: {
    duration: number;
    confidence: number;
    meddiccCount: number;
    nextStepsCount: number;
    dealHealth?: string;
  }): void {
    if (!this.containerEl) return;
    
    this.containerEl.innerHTML = '';
    this.containerEl.className = 'eudia-transcription-bar complete';
    
    const successIcon = document.createElement('div');
    successIcon.className = 'eudia-complete-icon';
    successIcon.innerHTML = '✓';
    this.containerEl.appendChild(successIcon);
    
    const statsContainer = document.createElement('div');
    statsContainer.className = 'eudia-complete-stats';
    
    const durationStat = document.createElement('div');
    durationStat.className = 'eudia-stat';
    durationStat.innerHTML = `<span class="eudia-stat-value">${Math.round(stats.duration / 60)}m</span><span class="eudia-stat-label">Duration</span>`;
    statsContainer.appendChild(durationStat);
    
    const confidenceStat = document.createElement('div');
    confidenceStat.className = 'eudia-stat';
    const confidenceClass = stats.confidence >= 90 ? 'high' : stats.confidence >= 70 ? 'medium' : 'low';
    confidenceStat.innerHTML = `<span class="eudia-stat-value ${confidenceClass}">${stats.confidence}%</span><span class="eudia-stat-label">Confidence</span>`;
    statsContainer.appendChild(confidenceStat);
    
    const meddiccStat = document.createElement('div');
    meddiccStat.className = 'eudia-stat';
    meddiccStat.innerHTML = `<span class="eudia-stat-value">${stats.meddiccCount}/7</span><span class="eudia-stat-label">MEDDICC</span>`;
    statsContainer.appendChild(meddiccStat);
    
    this.containerEl.appendChild(statsContainer);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'eudia-control-btn close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = () => this.hide();
    this.containerEl.appendChild(closeBtn);
    
    setTimeout(() => this.hide(), 8000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING MODAL
// ═══════════════════════════════════════════════════════════════════════════

class ProcessingModal extends Modal {
  private messageEl: HTMLElement;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-transcribing-modal');
    contentEl.createDiv({ cls: 'spinner' });
    this.messageEl = contentEl.createEl('p', { text: 'Transcribing audio...' });
    contentEl.createEl('p', { text: 'This may take a moment for longer transcriptions.' });
  }

  setMessage(message: string) {
    if (this.messageEl) this.messageEl.textContent = message;
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT SELECTOR MODAL
// ═══════════════════════════════════════════════════════════════════════════

class AccountSelectorModal extends Modal {
  plugin: EudiaSyncPlugin;
  private searchInput: HTMLInputElement;
  private resultsContainer: HTMLElement;
  private onSelect: (account: SalesforceAccount | null) => void;

  constructor(app: App, plugin: EudiaSyncPlugin, onSelect: (account: SalesforceAccount | null) => void) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-account-selector');
    contentEl.createEl('h3', { text: 'Select Account for Meeting Note' });

    this.searchInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Search accounts...'
    });
    this.searchInput.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);';

    this.resultsContainer = contentEl.createDiv({ cls: 'eudia-account-results' });
    this.resultsContainer.style.cssText = 'max-height: 300px; overflow-y: auto;';

    this.updateResults('');
    this.searchInput.addEventListener('input', () => this.updateResults(this.searchInput.value));
    this.searchInput.focus();
  }

  updateResults(query: string): void {
    this.resultsContainer.empty();
    const accounts = this.plugin.settings.cachedAccounts;
    const filtered = query
      ? accounts.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15)
      : accounts.slice(0, 15);

    if (filtered.length === 0) {
      this.resultsContainer.createDiv({ cls: 'eudia-no-results', text: 'No accounts found' });
      return;
    }

    filtered.forEach(account => {
      const item = this.resultsContainer.createDiv({ cls: 'eudia-account-item', text: account.name });
      item.onclick = () => {
        this.onSelect(account);
        this.close();
      };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP WIZARD MODAL
// ═══════════════════════════════════════════════════════════════════════════

class SetupWizardModal extends Modal {
  plugin: EudiaSyncPlugin;
  private currentStep: number = 0;
  private steps: { id: string; label: string; status: 'pending' | 'running' | 'complete' | 'error' }[];

  constructor(app: App, plugin: EudiaSyncPlugin) {
    super(app);
    this.plugin = plugin;
    this.steps = [
      { id: 'email', label: 'Setting up your profile', status: 'pending' },
      { id: 'accounts', label: 'Syncing Salesforce accounts', status: 'pending' },
      { id: 'calendar', label: 'Connecting calendar', status: 'pending' }
    ];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-setup-wizard');
    this.renderWelcome();
  }

  private renderWelcome(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Welcome to Eudia' });
    contentEl.createEl('p', { text: 'Let\'s get you set up in 30 seconds.' });

    const infoBox = contentEl.createDiv({ cls: 'eudia-setup-info' });
    infoBox.innerHTML = `
      <p style="margin: 0 0 8px 0;"><strong>Transcribe meetings</strong> with one click</p>
      <p style="margin: 0 0 8px 0;"><strong>View your calendar</strong> and create notes</p>
      <p style="margin: 0;"><strong>Sync to Salesforce</strong> automatically</p>
    `;

    const section = contentEl.createDiv({ cls: 'eudia-setup-section' });
    section.createEl('h3', { text: 'Your Eudia Email' });

    const emailInput = section.createEl('input', {
      type: 'email',
      placeholder: 'yourname@eudia.com'
    }) as HTMLInputElement;
    emailInput.addClass('eudia-email-input');
    if (this.plugin.settings.userEmail) {
      emailInput.value = this.plugin.settings.userEmail;
    }

    const buttons = contentEl.createDiv({ cls: 'eudia-setup-buttons' });
    
    const skipBtn = buttons.createEl('button', { text: 'Skip for now' });
    skipBtn.onclick = () => this.close();

    const startBtn = buttons.createEl('button', { text: 'Get Started →' });
    startBtn.setCssStyles({ background: 'var(--interactive-accent)', color: 'white' });
    startBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.endsWith('@eudia.com')) {
        new Notice('Please enter your @eudia.com email address');
        return;
      }
      this.plugin.settings.userEmail = email;
      await this.plugin.saveSettings();
      await this.runSetup();
    };
  }

  private async runSetup(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Setting Up...' });
    
    const statusContainer = contentEl.createDiv({ cls: 'eudia-setup-status-list' });
    this.steps.forEach(step => {
      const stepEl = statusContainer.createDiv({ cls: 'eudia-setup-step' });
      stepEl.id = `step-${step.id}`;
      stepEl.createSpan({ text: '-', cls: 'step-icon' });
      stepEl.createSpan({ text: step.label, cls: 'step-label' });
    });

    // Step 1: Email validated (already done)
    this.updateStep('email', 'complete');

    // Step 2: Sync accounts
    this.updateStep('accounts', 'running');
    try {
      await this.plugin.syncAccounts(true);
      this.updateStep('accounts', 'complete');
    } catch (e) {
      this.updateStep('accounts', 'error');
    }

    // Step 3: Calendar
    this.updateStep('calendar', 'running');
    this.plugin.settings.calendarConfigured = true;
    await this.plugin.saveSettings();
    this.updateStep('calendar', 'complete');

    this.plugin.settings.setupCompleted = true;
    await this.plugin.saveSettings();

    // Show success
    await new Promise(r => setTimeout(r, 500));
    this.renderSuccess();
  }

  private updateStep(stepId: string, status: 'pending' | 'running' | 'complete' | 'error'): void {
    const step = this.steps.find(s => s.id === stepId);
    if (step) step.status = status;

    const stepEl = document.getElementById(`step-${stepId}`);
    if (stepEl) {
      const icon = stepEl.querySelector('.step-icon');
      if (icon) {
        if (status === 'running') icon.textContent = '...';
        else if (status === 'complete') icon.textContent = '[done]';
        else if (status === 'error') icon.textContent = '[x]';
      }
      stepEl.className = `eudia-setup-step ${status}`;
    }
  }

  private renderSuccess(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Setup Complete' });
    
    const tips = contentEl.createDiv({ cls: 'eudia-setup-tips' });
    tips.innerHTML = `
      <p style="margin: 0 0 12px 0; font-weight: 600;">Quick Reference:</p>
      <p style="margin: 0 0 8px 0;">1. <strong>Calendar</strong> - Click calendar icon in left sidebar to view meetings</p>
      <p style="margin: 0 0 8px 0;">2. <strong>Transcription</strong> - Click microphone icon or Cmd/Ctrl+P and search "Transcribe"</p>
      <p style="margin: 0 0 8px 0;">3. <strong>Accounts</strong> - Pre-loaded folders are in the Accounts directory</p>
      <p style="margin: 0;">4. <strong>Create notes</strong> - Click any meeting to create a note in the correct account folder</p>
    `;

    const button = contentEl.createEl('button', { text: 'Continue' });
    button.setCssStyles({ 
      background: 'var(--interactive-accent)', 
      color: 'white', 
      marginTop: '16px', 
      padding: '12px 24px',
      cursor: 'pointer'
    });
    button.onclick = () => {
      this.close();
      this.plugin.activateCalendarView();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EUDIA CALENDAR VIEW - Beautiful Native Calendar Panel
// ═══════════════════════════════════════════════════════════════════════════

class EudiaCalendarView extends ItemView {
  plugin: EudiaSyncPlugin;
  private refreshInterval: number | null = null;
  private lastError: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: EudiaSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Calendar';
  }

  getIcon(): string {
    return 'calendar';
  }

  async onOpen(): Promise<void> {
    await this.render();
    this.refreshInterval = window.setInterval(() => this.render(), 5 * 60 * 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval) window.clearInterval(this.refreshInterval);
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('eudia-calendar-view');

    // Check if email is configured
    if (!this.plugin.settings.userEmail) {
      this.renderSetupPanel(container);
      return;
    }

    // Render header with status
    this.renderHeader(container);

    // Render calendar content
    await this.renderCalendarContent(container);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'eudia-calendar-header' });
    
    const titleRow = header.createDiv({ cls: 'eudia-calendar-title-row' });
    titleRow.createEl('h4', { text: 'Your Meetings' });
    
    const actions = titleRow.createDiv({ cls: 'eudia-calendar-actions' });
    
    const refreshBtn = actions.createEl('button', { cls: 'eudia-btn-icon', text: '↻' });
    refreshBtn.title = 'Refresh';
    refreshBtn.onclick = async () => {
      refreshBtn.addClass('spinning');
      await this.render();
      refreshBtn.removeClass('spinning');
    };
    
    const settingsBtn = actions.createEl('button', { cls: 'eudia-btn-icon', text: '⚙' });
    settingsBtn.title = 'Settings';
    settingsBtn.onclick = () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('eudia-sync');
    };
    
    // Connection status bar
    const statusBar = header.createDiv({ cls: 'eudia-status-bar' });
    this.renderConnectionStatus(statusBar);
  }

  private async renderConnectionStatus(container: HTMLElement): Promise<void> {
    const status: ConnectionStatus = {
      server: 'connecting',
      calendar: 'not_configured',
      salesforce: 'not_configured'
    };

    const serverUrl = this.plugin.settings.serverUrl;
    const userEmail = this.plugin.settings.userEmail;

    // Check server
    try {
      const healthResponse = await requestUrl({
        url: `${serverUrl}/api/health`,
        method: 'GET',
        throw: false
      });
      if (healthResponse.status === 200) {
        status.server = 'connected';
        status.serverMessage = 'Server online';
      } else {
        status.server = 'error';
        status.serverMessage = 'Server unavailable';
      }
    } catch {
      status.server = 'error';
      status.serverMessage = 'Cannot reach server';
    }

    // Check calendar access
    if (userEmail && status.server === 'connected') {
      try {
        const validateResponse = await requestUrl({
          url: `${serverUrl}/api/calendar/validate/${encodeURIComponent(userEmail)}`,
          method: 'GET',
          throw: false
        });
        
        if (validateResponse.status === 200 && validateResponse.json?.authorized) {
          status.calendar = 'connected';
          status.calendarMessage = 'Calendar synced';
        } else {
          status.calendar = 'not_authorized';
          status.calendarMessage = 'Not authorized';
        }
      } catch {
        status.calendar = 'error';
        status.calendarMessage = 'Error checking access';
      }
    }

    // Check Salesforce OAuth
    if (userEmail && status.server === 'connected') {
      try {
        const sfResponse = await requestUrl({
          url: `${serverUrl}/api/sf/auth/status?email=${encodeURIComponent(userEmail)}`,
          method: 'GET',
          throw: false
        });
        
        if (sfResponse.status === 200 && sfResponse.json?.connected) {
          status.salesforce = 'connected';
          status.salesforceMessage = 'Salesforce connected';
        } else {
          status.salesforce = 'not_configured';
          status.salesforceMessage = 'Not connected';
        }
      } catch {
        status.salesforce = 'not_configured';
      }
    }

    // Render status indicators
    const indicators = container.createDiv({ cls: 'eudia-status-indicators' });
    
    const serverDot = indicators.createSpan({ cls: `eudia-status-dot ${status.server}` });
    serverDot.title = status.serverMessage || 'Server';
    
    const calendarDot = indicators.createSpan({ cls: `eudia-status-dot ${status.calendar}` });
    calendarDot.title = status.calendarMessage || 'Calendar';
    
    const sfDot = indicators.createSpan({ cls: `eudia-status-dot ${status.salesforce}` });
    sfDot.title = status.salesforceMessage || 'Salesforce';
    
    // Add labels
    const labels = container.createDiv({ cls: 'eudia-status-labels' });
    labels.createSpan({ cls: 'eudia-status-label', text: this.plugin.settings.userEmail });
    
    // Show warning if not authorized
    if (status.calendar === 'not_authorized') {
      const warning = container.createDiv({ cls: 'eudia-status-warning' });
      warning.innerHTML = `⚠️ <strong>${userEmail}</strong> is not authorized for calendar access. Contact your admin.`;
    }
  }

  private async renderCalendarContent(container: HTMLElement): Promise<void> {
    const contentArea = container.createDiv({ cls: 'eudia-calendar-content' });
    
    // Loading state
    const loadingEl = contentArea.createDiv({ cls: 'eudia-calendar-loading' });
    loadingEl.innerHTML = '<div class="eudia-spinner"></div><span>Loading meetings...</span>';

    try {
      const calendarService = new CalendarService(
        this.plugin.settings.serverUrl,
        this.plugin.settings.userEmail
      );
      
      const weekData = await calendarService.getWeekMeetings();
      loadingEl.remove();

      if (!weekData.success) {
        this.renderError(contentArea, weekData.error || 'Failed to load calendar');
        return;
      }

      const days = Object.keys(weekData.byDay || {}).sort();
      
      if (days.length === 0) {
        this.renderEmptyState(contentArea);
        return;
      }

      // Render "Now" indicator if there's a current meeting
      await this.renderCurrentMeeting(contentArea, calendarService);

      // Render meetings by day
      for (const day of days) {
        const meetings = weekData.byDay[day];
        if (!meetings || meetings.length === 0) continue;
        this.renderDaySection(contentArea, day, meetings);
      }

    } catch (error) {
      loadingEl.remove();
      this.renderError(contentArea, error.message || 'Failed to load calendar');
    }
  }

  private async renderCurrentMeeting(container: HTMLElement, calendarService: CalendarService): Promise<void> {
    try {
      const current = await calendarService.getCurrentMeeting();
      
      if (current.meeting) {
        const nowCard = container.createDiv({ cls: 'eudia-now-card' });
        
        if (current.isNow) {
          nowCard.createDiv({ cls: 'eudia-now-badge', text: '● NOW' });
        } else {
          nowCard.createDiv({ cls: 'eudia-now-badge soon', text: `In ${current.minutesUntilStart}m` });
        }
        
        const nowContent = nowCard.createDiv({ cls: 'eudia-now-content' });
        nowContent.createEl('div', { cls: 'eudia-now-subject', text: current.meeting.subject });
        
        if (current.meeting.accountName) {
          nowContent.createEl('div', { cls: 'eudia-now-account', text: current.meeting.accountName });
        }
        
        const nowAction = nowCard.createEl('button', { cls: 'eudia-now-action', text: '📝 Create Note' });
        nowAction.onclick = () => this.createNoteForMeeting(current.meeting!);
      }
    } catch (e) {
      // Silent fail - current meeting is optional
    }
  }

  private renderDaySection(container: HTMLElement, day: string, meetings: CalendarMeeting[]): void {
    const section = container.createDiv({ cls: 'eudia-calendar-day' });
    
    section.createEl('div', { 
      cls: 'eudia-calendar-day-header',
      text: CalendarService.getDayName(day)
    });

    for (const meeting of meetings) {
      const meetingEl = section.createDiv({ 
        cls: `eudia-calendar-meeting ${meeting.isCustomerMeeting ? 'customer' : 'internal'}`
      });

      // Time
      meetingEl.createEl('div', {
        cls: 'eudia-calendar-time',
        text: CalendarService.formatTime(meeting.start)
      });

      // Details
      const details = meetingEl.createDiv({ cls: 'eudia-calendar-details' });
      details.createEl('div', { cls: 'eudia-calendar-subject', text: meeting.subject });
      
      if (meeting.accountName) {
        details.createEl('div', { cls: 'eudia-calendar-account', text: meeting.accountName });
      } else if (meeting.attendees && meeting.attendees.length > 0) {
        const attendeeNames = meeting.attendees
          .slice(0, 2)
          .map(a => a.name || a.email?.split('@')[0] || 'Unknown')
          .join(', ');
        details.createEl('div', { cls: 'eudia-calendar-attendees', text: attendeeNames });
      }

      // Click handler
      meetingEl.onclick = () => this.createNoteForMeeting(meeting);
      meetingEl.title = 'Click to create meeting note';
    }
  }

  private renderEmptyState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: 'eudia-calendar-empty' });
    empty.innerHTML = `
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `;
  }

  private renderError(container: HTMLElement, message: string): void {
    const error = container.createDiv({ cls: 'eudia-calendar-error' });
    
    let icon = '⚠️';
    let title = 'Unable to load calendar';
    let action = '';
    
    if (message.includes('not authorized') || message.includes('403')) {
      icon = '🔒';
      title = 'Calendar Access Required';
      action = 'Contact your admin to be added to the authorized users list.';
    } else if (message.includes('network') || message.includes('fetch')) {
      icon = '📡';
      title = 'Connection Issue';
      action = 'Check your internet connection and try again.';
    } else if (message.includes('server') || message.includes('500')) {
      icon = '🔧';
      title = 'Server Unavailable';
      action = 'The server may be waking up. Try again in 30 seconds.';
    }
    
    error.innerHTML = `
      <div class="eudia-error-icon">${icon}</div>
      <p class="eudia-error-title">${title}</p>
      <p class="eudia-error-message">${message}</p>
      ${action ? `<p class="eudia-error-action">${action}</p>` : ''}
    `;
    
    const retryBtn = error.createEl('button', { cls: 'eudia-btn-retry', text: 'Try Again' });
    retryBtn.onclick = () => this.render();
  }

  private renderSetupPanel(container: HTMLElement): void {
    const setup = container.createDiv({ cls: 'eudia-calendar-setup-panel' });
    
    setup.innerHTML = `
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;
    
    const inputGroup = setup.createDiv({ cls: 'eudia-setup-input-group' });
    
    const emailInput = inputGroup.createEl('input', {
      type: 'email',
      placeholder: 'yourname@eudia.com'
    }) as HTMLInputElement;
    emailInput.addClass('eudia-setup-email');
    
    const connectBtn = inputGroup.createEl('button', { cls: 'eudia-setup-connect', text: 'Connect' });
    
    const statusEl = setup.createDiv({ cls: 'eudia-setup-status' });
    
    connectBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      
      if (!email || !email.endsWith('@eudia.com')) {
        statusEl.textContent = '⚠️ Please use your @eudia.com email';
        statusEl.className = 'eudia-setup-status error';
        return;
      }
      
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      statusEl.textContent = '';
      
      try {
        // Validate email
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/calendar/validate/${email}`,
          method: 'GET'
        });
        
        if (!response.json?.authorized) {
          statusEl.innerHTML = `⚠️ <strong>${email}</strong> is not authorized.<br>Contact your admin to be added.`;
          statusEl.className = 'eudia-setup-status error';
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          return;
        }
        
        // Save and refresh
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        
        statusEl.textContent = '✓ Connected!';
        statusEl.className = 'eudia-setup-status success';
        
        // Sync accounts in background
        this.plugin.syncAccounts(true).catch(() => {});
        
        // Refresh view
        setTimeout(() => this.render(), 500);
        
      } catch (error) {
        const msg = error.message || 'Connection failed';
        if (msg.includes('403')) {
          statusEl.innerHTML = `⚠️ <strong>${email}</strong> is not authorized for calendar access.`;
        } else {
          statusEl.textContent = '⚠️ ' + msg;
        }
        statusEl.className = 'eudia-setup-status error';
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
      }
    };
    
    emailInput.onkeydown = (e) => {
      if (e.key === 'Enter') connectBtn.click();
    };
    
    setup.createEl('p', {
      cls: 'eudia-setup-help',
      text: 'Your calendar syncs automatically via Microsoft 365.'
    });
  }

  async createNoteForMeeting(meeting: CalendarMeeting): Promise<void> {
    const dateStr = meeting.start.split('T')[0];
    
    let folderPath = this.plugin.settings.accountsFolder;
    if (meeting.accountName) {
      const sanitizedName = meeting.accountName.replace(/[<>:"/\\|?*]/g, '_').trim();
      const accountFolder = `${this.plugin.settings.accountsFolder}/${sanitizedName}`;
      const folder = this.app.vault.getAbstractFileByPath(accountFolder);
      if (folder instanceof TFolder) {
        folderPath = accountFolder;
      }
    }

    const sanitizedSubject = meeting.subject.replace(/[<>:"/\\|?*]/g, '_').trim().substring(0, 50);
    const fileName = `${dateStr} ${sanitizedSubject}.md`;
    const filePath = `${folderPath}/${fileName}`;

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      return;
    }

    const attendees = (meeting.attendees || [])
      .map(a => a.name || a.email?.split('@')[0] || 'Unknown')
      .slice(0, 5)
      .join(', ');

    const template = `---
title: "${meeting.subject}"
date: ${dateStr}
attendees: [${attendees}]
account: "${meeting.accountName || ''}"
meeting_start: ${meeting.start}
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# ${meeting.subject}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` → **"Transcribe Meeting"**

---

`;

    const file = await this.app.vault.create(filePath, template);
    await this.app.workspace.getLeaf().openFile(file);
    new Notice(`Created note for: ${meeting.subject}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PLUGIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

export default class EudiaSyncPlugin extends Plugin {
  settings: EudiaSyncSettings;
  private audioRecorder: AudioRecorder | null = null;
  private transcriptionService: TranscriptionService;
  private calendarService: CalendarService;
  private smartTagService: SmartTagService;
  private recordingStatusBar: RecordingStatusBar | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl,
      this.settings.openaiApiKey
    );
    
    this.calendarService = new CalendarService(
      this.settings.serverUrl,
      this.settings.userEmail
    );
    
    this.smartTagService = new SmartTagService();

    // Register calendar view
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new EudiaCalendarView(leaf, this)
    );

    // Add ribbon icons
    this.addRibbonIcon('calendar', 'Open Calendar', () => this.activateCalendarView());
    
    this.addRibbonIcon('microphone', 'Transcribe Meeting', async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    });

    // Add commands
    this.addCommand({
      id: 'transcribe-meeting',
      name: 'Transcribe Meeting',
      callback: async () => {
        if (this.audioRecorder?.isRecording()) {
          await this.stopRecording();
        } else {
          await this.startRecording();
        }
      }
    });

    this.addCommand({
      id: 'open-calendar',
      name: 'Open Calendar',
      callback: () => this.activateCalendarView()
    });

    this.addCommand({
      id: 'sync-accounts',
      name: 'Sync Salesforce Accounts',
      callback: () => this.syncAccounts()
    });

    this.addCommand({
      id: 'sync-note',
      name: 'Sync Note to Salesforce',
      callback: () => this.syncNoteToSalesforce()
    });

    this.addCommand({
      id: 'new-meeting-note',
      name: 'New Meeting Note',
      callback: () => this.createMeetingNote()
    });

    // Add settings tab
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));

    // Register account suggester
    this.registerEditorSuggest(new AccountSuggester(this.app, this));

    // On layout ready
    this.app.workspace.onLayoutReady(async () => {
      // Show setup wizard for new users
      if (!this.settings.setupCompleted && !this.settings.userEmail) {
        new SetupWizardModal(this.app, this).open();
      } else if (this.settings.syncOnStartup) {
        await this.syncAccounts(true);
      }
      
      // Activate calendar view if configured
      if (this.settings.showCalendarView && this.settings.userEmail) {
        this.activateCalendarView();
      }
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateCalendarView(): Promise<void> {
    const workspace = this.app.workspace;
    const leaves = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
        workspace.revealLeaf(rightLeaf);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECORDING METHODS
  // ─────────────────────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (!AudioRecorder.isSupported()) {
      new Notice('Audio transcription is not supported in this browser');
      return;
    }

    // Ensure we have an active file
    let activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      await this.createMeetingNote();
      activeFile = this.app.workspace.getActiveFile();
    }

    if (!activeFile) {
      new Notice('Please open or create a note first');
      return;
    }

    // Initialize recorder
    this.audioRecorder = new AudioRecorder();
    
    this.recordingStatusBar = new RecordingStatusBar(
      () => this.audioRecorder?.pause(),
      () => this.audioRecorder?.resume(),
      () => this.stopRecording(),
      () => this.cancelRecording()
    );

    try {
      await this.audioRecorder.start();
      this.recordingStatusBar.show();

      // Update status bar with audio levels
      const updateInterval = setInterval(() => {
        if (this.audioRecorder?.isRecording()) {
          const state = this.audioRecorder.getState();
          this.recordingStatusBar?.updateState(state);
        } else {
          clearInterval(updateInterval);
        }
      }, 100);

      new Notice('Transcription started. Click stop when finished.');

    } catch (error) {
      new Notice(`Failed to start transcription: ${error.message}`);
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.audioRecorder?.isRecording()) return;

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to save transcription');
      this.cancelRecording();
      return;
    }

    this.recordingStatusBar?.showProcessing();

    try {
      const result = await this.audioRecorder.stop();
      await this.processRecording(result, activeFile);
    } catch (error) {
      new Notice(`Transcription failed: ${error.message}`);
    } finally {
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
      this.audioRecorder = null;
    }
  }

  async cancelRecording(): Promise<void> {
    if (this.audioRecorder?.isRecording()) {
      this.audioRecorder.cancel();
    }
    this.recordingStatusBar?.hide();
    this.recordingStatusBar = null;
    this.audioRecorder = null;
    new Notice('Transcription cancelled');
  }

  private async processRecording(result: RecordingResult, file: TFile): Promise<void> {
    const modal = new ProcessingModal(this.app);
    modal.open();

    try {
      // Detect account from file path
      let accountContext: MeetingContext | undefined;
      const pathParts = file.path.split('/');
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const accountName = pathParts[1];
        const account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === accountName.toLowerCase()
        );
        if (account) {
          accountContext = { accountName: account.name, accountId: account.id };
        }
      }

      modal.setMessage('Transcribing audio...');
      const transcription = await this.transcriptionService.transcribeAudio(result.blob, accountContext);

      modal.setMessage('Generating summary...');
      
      // Get processed sections
      const sections = await this.transcriptionService.processTranscription(
        transcription.text,
        accountContext
      );

      // Build note content
      const noteContent = this.buildNoteContent(sections, transcription);
      
      // Update file
      await this.app.vault.modify(file, noteContent);

      // Show completion stats - handle both string and array inputs defensively
      const countItems = (val: any): number => {
        if (!val) return 0;
        if (Array.isArray(val)) return val.length;
        if (typeof val === 'string') return val.split('\n').filter(l => l.trim()).length;
        return 0;
      };
      this.recordingStatusBar?.showComplete({
        duration: result.duration,
        confidence: transcription.confidence,
        meddiccCount: countItems(sections.meddiccSignals),
        nextStepsCount: countItems(sections.nextSteps)
      });

      modal.close();
      new Notice('Transcription complete!');

      // Auto-sync if enabled
      if (this.settings.autoSyncAfterTranscription) {
        await this.syncNoteToSalesforce();
      }

    } catch (error) {
      modal.close();
      throw error;
    }
  }

  private buildNoteContent(sections: ProcessedSections, transcription: TranscriptionResult): string {
    // Defensive helper: ensure any value is converted to string
    // Handles arrays, objects, or already-strings from any code path
    const ensureString = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) {
        return val.map(item => {
          if (typeof item === 'object') {
            // Handle MEDDICC signal objects
            if (item.category) return `**${item.category}**: ${item.signal || item.insight || ''}`;
            return JSON.stringify(item);
          }
          return String(item);
        }).join('\n');
      }
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };

    // Normalize all sections to strings
    const title = ensureString(sections.title) || 'Meeting Notes';
    const summary = ensureString(sections.summary);
    const painPoints = ensureString(sections.painPoints);
    const productInterest = ensureString(sections.productInterest);
    const meddiccSignals = ensureString(sections.meddiccSignals);
    const nextSteps = ensureString(sections.nextSteps);
    const actionItems = ensureString(sections.actionItems);
    const keyDates = ensureString(sections.keyDates);
    const risksObjections = ensureString(sections.risksObjections);
    const attendees = ensureString(sections.attendees);

    let content = `---
title: "${title}"
date: ${new Date().toISOString().split('T')[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${transcription.confidence}
---

# ${title}

## Summary

${summary || '*AI summary will appear here*'}

`;

    // Key points / pain points section
    if (painPoints && !painPoints.includes('None explicitly')) {
      content += `## Pain Points

${painPoints}

`;
    }

    // Product interest
    if (productInterest && !productInterest.includes('None identified')) {
      content += `## Product Interest

${productInterest}

`;
    }

    // MEDDICC signals (string format)
    if (meddiccSignals) {
      content += `## MEDDICC Signals

${meddiccSignals}

`;
    }

    // Next steps (string format, already has checkboxes from AI)
    if (nextSteps) {
      content += `## Next Steps

${nextSteps}

`;
    }

    // Action items
    if (actionItems) {
      content += `## Action Items

${actionItems}

`;
    }

    // Key dates
    if (keyDates && !keyDates.includes('No specific dates')) {
      content += `## Key Dates

${keyDates}

`;
    }

    // Risks and objections
    if (risksObjections && !risksObjections.includes('None raised')) {
      content += `## Risks and Objections

${risksObjections}

`;
    }

    // Attendees
    if (attendees) {
      content += `## Attendees

${attendees}

`;
    }

    // Full transcript
    if (this.settings.appendTranscript && transcription.text) {
      content += `---

## Full Transcript

${transcription.text}
`;
    }

    return content;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT SYNC METHODS
  // ─────────────────────────────────────────────────────────────────────────

  async syncAccounts(silent: boolean = false): Promise<void> {
    if (!silent) new Notice('Syncing Salesforce accounts...');

    try {
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/accounts/obsidian`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      const data = response.json as AccountsResponse;

      if (!data.success || !data.accounts) {
        if (!silent) new Notice('Failed to fetch accounts from server');
        return;
      }

      // Update cached accounts for autocomplete and matching
      // Note: We do NOT create folders here - account folders are pre-loaded in the vault
      this.settings.cachedAccounts = data.accounts.map(a => ({
        id: a.id,
        name: a.name
      }));
      this.settings.lastSyncTime = new Date().toISOString();
      await this.saveSettings();

      if (!silent) {
        new Notice(`Synced ${data.accounts.length} accounts for matching`);
      }

    } catch (error) {
      if (!silent) {
        new Notice(`Failed to sync accounts: ${error.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SALESFORCE NOTE SYNC
  // ─────────────────────────────────────────────────────────────────────────

  async syncNoteToSalesforce(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to sync');
      return;
    }

    const content = await this.app.vault.read(activeFile);
    const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;

    if (!frontmatter?.sync_to_salesforce) {
      new Notice('Set sync_to_salesforce: true in frontmatter to enable sync');
      return;
    }

    // Find account
    let accountId = frontmatter.account_id;
    let accountName = frontmatter.account;

    if (!accountId && accountName) {
      const account = this.settings.cachedAccounts.find(
        a => a.name.toLowerCase() === accountName.toLowerCase()
      );
      if (account) {
        accountId = account.id;
      }
    }

    if (!accountId) {
      // Try to detect from path
      const pathParts = activeFile.path.split('/');
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const folderName = pathParts[1];
        const account = this.settings.cachedAccounts.find(
          a => a.name.replace(/[<>:"/\\|?*]/g, '_').trim() === folderName
        );
        if (account) {
          accountId = account.id;
          accountName = account.name;
        }
      }
    }

    if (!accountId) {
      new Notice('Could not determine account for this note');
      return;
    }

    try {
      new Notice('Syncing to Salesforce...');

      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/notes/sync`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountName,
          noteTitle: activeFile.basename,
          notePath: activeFile.path,
          content,
          frontmatter,
          syncedAt: new Date().toISOString(),
          userEmail: this.settings.userEmail
        })
      });

      if (response.json?.success) {
        new Notice('✓ Synced to Salesforce');
      } else {
        new Notice('Failed to sync: ' + (response.json?.error || 'Unknown error'));
      }

    } catch (error) {
      new Notice(`Sync failed: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MEETING NOTE CREATION
  // ─────────────────────────────────────────────────────────────────────────

  async createMeetingNote(): Promise<void> {
    return new Promise((resolve) => {
      const modal = new AccountSelectorModal(this.app, this, async (account) => {
        if (!account) {
          resolve();
          return;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const sanitizedName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
        const folderPath = `${this.settings.accountsFolder}/${sanitizedName}`;
        const fileName = `${dateStr} Meeting.md`;
        const filePath = `${folderPath}/${fileName}`;

        // Ensure folder exists
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
          await this.app.vault.createFolder(folderPath);
        }

        const template = `---
title: "Meeting with ${account.name}"
date: ${dateStr}
account: "${account.name}"
account_id: "${account.id}"
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# Meeting with ${account.name}

## Pre-Call Notes

*Add context or questions here*



---

## Ready to Transcribe

Click the microphone icon or \`Cmd/Ctrl+P\` → "Transcribe Meeting"

---

`;

        const file = await this.app.vault.create(filePath, template);
        await this.app.workspace.getLeaf().openFile(file);
        new Notice(`Created meeting note for ${account.name}`);
        resolve();
      });
      modal.open();
    });
  }

  async fetchAndInsertContext(): Promise<void> {
    new Notice('Fetching pre-call context...');
    // Implementation for fetching context from server
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

class EudiaSyncSettingTab extends PluginSettingTab {
  plugin: EudiaSyncPlugin;

  constructor(app: App, plugin: EudiaSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Eudia Sync & Scribe' });

    // ─────────────────────────────────────────────────────────────────────
    // USER PROFILE
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Your Profile' });

    new Setting(containerEl)
      .setName('Eudia Email')
      .setDesc('Your @eudia.com email address for calendar and Salesforce sync')
      .addText(text => text
        .setPlaceholder('yourname@eudia.com')
        .setValue(this.plugin.settings.userEmail)
        .onChange(async (value) => {
          this.plugin.settings.userEmail = value.trim().toLowerCase();
          await this.plugin.saveSettings();
        }));

    // ─────────────────────────────────────────────────────────────────────
    // SALESFORCE OAUTH
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Salesforce Connection' });
    
    const sfContainer = containerEl.createDiv();
    sfContainer.style.cssText = 'padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;';
    
    const sfStatus = sfContainer.createDiv();
    sfStatus.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';
    
    const statusDot = sfStatus.createSpan();
    const statusText = sfStatus.createSpan();
    
    const sfDesc = sfContainer.createDiv();
    sfDesc.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 16px;';
    sfDesc.setText('Connect with Salesforce to sync notes with your user attribution.');
    
    const sfButton = sfContainer.createEl('button');
    sfButton.style.cssText = 'padding: 10px 20px; cursor: pointer; border-radius: 6px;';
    
    // Polling interval for OAuth status
    let pollInterval: number | null = null;
    
    // Check status
    const checkStatus = async () => {
      if (!this.plugin.settings.userEmail) {
        statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);';
        statusText.setText('Enter email first');
        sfButton.setText('Setup Required');
        sfButton.disabled = true;
        return false;
      }
      
      try {
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: 'GET',
          throw: false
        });
        
        // API returns 'authenticated' not 'connected'
        if (response.json?.authenticated === true) {
          statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #22c55e;';
          statusText.setText('Connected to Salesforce');
          sfButton.setText('Reconnect');
          sfButton.disabled = false;
          return true;  // Connected
        } else {
          statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;';
          statusText.setText('Not connected');
          sfButton.setText('Connect to Salesforce');
          sfButton.disabled = false;
          return false;  // Not connected
        }
      } catch {
        statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #ef4444;';
        statusText.setText('Status unavailable');
        sfButton.setText('Connect to Salesforce');
        sfButton.disabled = false;
        return false;
      }
    };
    
    // Start polling for OAuth completion
    const startPolling = () => {
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
      
      let attempts = 0;
      const maxAttempts = 30;  // Poll for up to 2.5 minutes
      
      pollInterval = window.setInterval(async () => {
        attempts++;
        const isConnected = await checkStatus();
        
        if (isConnected) {
          // Success! Stop polling
          if (pollInterval) {
            window.clearInterval(pollInterval);
            pollInterval = null;
          }
          new Notice('Salesforce connected successfully!');
        } else if (attempts >= maxAttempts) {
          // Timeout, stop polling
          if (pollInterval) {
            window.clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      }, 5000);  // Check every 5 seconds
    };
    
    sfButton.onclick = async () => {
      if (!this.plugin.settings.userEmail) {
        new Notice('Please enter your email first');
        return;
      }
      const authUrl = `${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;
      window.open(authUrl, '_blank');
      new Notice('Complete the Salesforce login in the popup window', 5000);
      
      // Start polling for OAuth completion
      startPolling();
    };
    
    checkStatus();

    // ─────────────────────────────────────────────────────────────────────
    // SERVER CONNECTION
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Server' });

    new Setting(containerEl)
      .setName('GTM Brain Server')
      .setDesc('Server URL for calendar, accounts, and sync')
      .addText(text => text
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async (value) => {
          this.plugin.settings.serverUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('For transcription (optional if server provides)')
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    // ─────────────────────────────────────────────────────────────────────
    // TRANSCRIPTION
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Transcription' });

    new Setting(containerEl)
      .setName('Save Audio Files')
      .setDesc('Keep original audio recordings')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.saveAudioFiles)
        .onChange(async (value) => {
          this.plugin.settings.saveAudioFiles = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Append Full Transcript')
      .setDesc('Include complete transcript in notes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.appendTranscript)
        .onChange(async (value) => {
          this.plugin.settings.appendTranscript = value;
          await this.plugin.saveSettings();
        }));

    // ─────────────────────────────────────────────────────────────────────
    // SYNC OPTIONS
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Sync' });

    new Setting(containerEl)
      .setName('Sync on Startup')
      .setDesc('Automatically sync accounts when Obsidian opens')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.syncOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.syncOnStartup = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto-Sync After Transcription')
      .setDesc('Push notes to Salesforce after transcription')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSyncAfterTranscription)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncAfterTranscription = value;
          await this.plugin.saveSettings();
        }));

    // ─────────────────────────────────────────────────────────────────────
    // FOLDERS
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Folders' });

    new Setting(containerEl)
      .setName('Accounts Folder')
      .setDesc('Where account folders are stored')
      .addText(text => text
        .setValue(this.plugin.settings.accountsFolder)
        .onChange(async (value) => {
          this.plugin.settings.accountsFolder = value || 'Accounts';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Recordings Folder')
      .setDesc('Where audio files are saved')
      .addText(text => text
        .setValue(this.plugin.settings.recordingsFolder)
        .onChange(async (value) => {
          this.plugin.settings.recordingsFolder = value || 'Recordings';
          await this.plugin.saveSettings();
        }));

    // ─────────────────────────────────────────────────────────────────────
    // ACTIONS
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Actions' });

    new Setting(containerEl)
      .setName('Sync Accounts Now')
      .setDesc(`${this.plugin.settings.cachedAccounts.length} accounts cached`)
      .addButton(button => button
        .setButtonText('Sync')
        .setCta()
        .onClick(async () => {
          await this.plugin.syncAccounts();
          this.display();
        }));

    // Status
    if (this.plugin.settings.lastSyncTime) {
      containerEl.createEl('p', {
        text: `Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,
        cls: 'setting-item-description'
      });
    }

    containerEl.createEl('p', {
      text: `Audio transcription: ${AudioRecorder.isSupported() ? '✓ Supported' : '✗ Not supported'}`,
      cls: 'setting-item-description'
    });
  }
}
