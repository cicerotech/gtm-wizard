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

import { AudioRecorder, RecordingState, RecordingResult, AudioDiagnostic, AudioCaptureMode, AudioRecordingOptions, AudioDeviceInfo, SystemAudioMethod, SystemAudioProbeResult } from './src/AudioRecorder';
import { TranscriptionService, TranscriptionResult, MeetingContext, ProcessedSections, AccountDetector, accountDetector, AccountDetectionResult, detectPipelineMeeting } from './src/TranscriptionService';
import { CalendarService, CalendarMeeting, TodayResponse, WeekResponse } from './src/CalendarService';
import { SmartTagService, SmartTags } from './src/SmartTagService';
import { AccountOwnershipService, OwnedAccount, generateAccountOverviewNote, isAdminUser, isCSUser, isCSManager, getCSManagerDirectReports, ADMIN_EMAILS, CS_EMAILS, CS_STATIC_ACCOUNTS } from './src/AccountOwnership';

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
  // Salesforce connection status
  salesforceConnected: boolean;
  // Account import tracking
  accountsImported: boolean;
  importedAccountCount: number;
  // Smart tagging
  enableSmartTags: boolean;
  // Calendar
  showCalendarView: boolean;
  // Timezone for calendar display
  timezone: string;
  // Daily account folder refresh tracking
  lastAccountRefreshDate: string | null;
  // Dynamic sync settings
  archiveRemovedAccounts: boolean;
  syncAccountsOnStartup: boolean;
  // Salesforce auto-sync settings
  sfAutoSyncEnabled: boolean;
  sfAutoSyncIntervalMinutes: number;
  // Audio capture settings
  audioCaptureMode: 'full_call' | 'mic_only';
  audioMicDeviceId: string;
  audioSystemDeviceId: string;
  audioSetupDismissed: boolean;
  // Meeting template
  meetingTemplate: 'meddic' | 'demo' | 'general';
}

// Common timezone options for US/EU sales teams
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'UTC', label: 'UTC' }
];

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
  salesforceConnected: false,
  accountsImported: false,
  importedAccountCount: 0,
  timezone: 'America/New_York',
  lastAccountRefreshDate: null,
  archiveRemovedAccounts: true,
  syncAccountsOnStartup: true,
  sfAutoSyncEnabled: true,
  sfAutoSyncIntervalMinutes: 15,
  audioCaptureMode: 'full_call',
  audioMicDeviceId: '',
  audioSystemDeviceId: '',
  audioSetupDismissed: false,
  meetingTemplate: 'meddic'
};

interface SalesforceAccount {
  id: string;
  name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEMETRY SERVICE - Optional remote debugging (non-blocking, privacy-conscious)
// ═══════════════════════════════════════════════════════════════════════════

class TelemetryService {
  private serverUrl: string;
  private userEmail: string;
  private enabled: boolean = true; // Can be disabled via settings in future
  private pluginVersion: string = '4.2.0';
  
  constructor(serverUrl: string, userEmail: string = '') {
    this.serverUrl = serverUrl;
    this.userEmail = userEmail;
  }
  
  setUserEmail(email: string): void {
    this.userEmail = email;
  }
  
  /**
   * Report an error to the server for debugging
   * Non-blocking - will not throw or interrupt user flow
   */
  async reportError(message: string, context?: Record<string, any>): Promise<void> {
    if (!this.enabled) return;
    this.send('error', message, context);
  }
  
  /**
   * Report a warning
   */
  async reportWarning(message: string, context?: Record<string, any>): Promise<void> {
    if (!this.enabled) return;
    this.send('warning', message, context);
  }
  
  /**
   * Report an info event (for debugging specific flows)
   */
  async reportInfo(message: string, context?: Record<string, any>): Promise<void> {
    if (!this.enabled) return;
    this.send('info', message, context);
  }
  
  /**
   * Send a heartbeat to update user presence and status.
   * Returns the server response (includes latestVersion for update checks).
   */
  async sendHeartbeat(accountCount: number, connections: Record<string, string>): Promise<any> {
    if (!this.enabled || !this.userEmail) return null;
    try {
      const resp = await requestUrl({
        url: `${this.serverUrl}/api/plugin/telemetry`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'heartbeat',
          userEmail: this.userEmail,
          pluginVersion: this.pluginVersion,
          platform: 'obsidian',
          accountCount,
          connections
        })
      });
      return resp.json;
    } catch {
      return null;
    }
  }
  
  /**
   * Report sync results
   */
  async reportSync(result: { added: number; archived: number; success: boolean; error?: string }): Promise<void> {
    if (!this.enabled) return;
    try {
      requestUrl({
        url: `${this.serverUrl}/api/plugin/telemetry`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'sync',
          userEmail: this.userEmail || 'anonymous',
          pluginVersion: this.pluginVersion,
          platform: 'obsidian',
          context: result
        })
      }).catch(() => {});
    } catch {
      // Never throw from telemetry
    }
  }
  
  /**
   * Check for pushed config from admin
   * Returns array of config updates if any
   */
  async checkForPushedConfig(): Promise<{ key: string; value: any }[]> {
    if (!this.userEmail) return [];
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/admin/users/${encodeURIComponent(this.userEmail)}/config`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.json?.hasUpdates && response.json?.updates) {
        console.log('[Eudia] Received pushed config from admin:', response.json.updates);
        return response.json.updates;
      }
      return [];
    } catch {
      // Silently ignore - config push is optional
      return [];
    }
  }
  
  private async send(event: string, message: string, context?: Record<string, any>): Promise<void> {
    try {
      // Fire and forget - don't await, don't block
      requestUrl({
        url: `${this.serverUrl}/api/plugin/telemetry`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          message,
          context,
          userEmail: this.userEmail || 'anonymous',
          pluginVersion: this.pluginVersion,
          platform: 'obsidian'
        })
      }).catch(() => {}); // Silently ignore failures
    } catch {
      // Never throw from telemetry
    }
  }
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
const SETUP_VIEW_TYPE = 'eudia-setup-view';

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
// RECORDING STATUS BAR - Clean, Quiet, Professional UI
// ═══════════════════════════════════════════════════════════════════════════

class RecordingStatusBar {
  private containerEl: HTMLElement | null = null;
  private waveformBars: HTMLElement[] = [];
  private durationEl: HTMLElement | null = null;
  private waveformData: number[] = new Array(16).fill(0);
  
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
    
    // Recording indicator dot
    const recordingDot = document.createElement('div');
    recordingDot.className = 'eudia-recording-dot';
    this.containerEl.appendChild(recordingDot);
    
    // Waveform visualization - 16 bars
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'eudia-waveform';
    this.waveformBars = [];
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('div');
      bar.className = 'eudia-waveform-bar';
      bar.style.height = '2px';
      waveformContainer.appendChild(bar);
      this.waveformBars.push(bar);
    }
    this.containerEl.appendChild(waveformContainer);
    
    // Duration timer
    this.durationEl = document.createElement('div');
    this.durationEl.className = 'eudia-duration';
    this.durationEl.textContent = '0:00';
    this.containerEl.appendChild(this.durationEl);

    // Minimal controls
    const controls = document.createElement('div');
    controls.className = 'eudia-controls-minimal';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'eudia-control-btn stop';
    stopBtn.innerHTML = '<span class="eudia-stop-icon"></span>';
    stopBtn.title = 'Stop and summarize';
    stopBtn.onclick = () => this.onStop();
    controls.appendChild(stopBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'eudia-control-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => this.onCancel();
    controls.appendChild(cancelBtn);

    this.containerEl.appendChild(controls);
    document.body.appendChild(this.containerEl);
  }

  hide(): void {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
      this.waveformBars = [];
      this.durationEl = null;
    }
  }

  updateState(state: RecordingState): void {
    if (!this.containerEl) return;
    
    // Update waveform - shift left and add new sample
    this.waveformData.shift();
    this.waveformData.push(state.audioLevel);
    
    // Render waveform bars with smooth heights
    this.waveformBars.forEach((bar, i) => {
      const level = this.waveformData[i] || 0;
      const height = Math.max(2, Math.min(24, level * 0.24));
      bar.style.height = `${height}px`;
    });
    
    // Update duration display
    if (this.durationEl) {
      const mins = Math.floor(state.duration / 60);
      const secs = Math.floor(state.duration % 60);
      this.durationEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    this.containerEl.className = state.isPaused 
      ? 'eudia-transcription-bar paused' 
      : 'eudia-transcription-bar active';
  }

  showProcessing(): void {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = '';
    this.containerEl.className = 'eudia-transcription-bar processing';
    
    // Processing spinner
    const spinner = document.createElement('div');
    spinner.className = 'eudia-processing-spinner';
    this.containerEl.appendChild(spinner);
    
    // Processing text
    const text = document.createElement('div');
    text.className = 'eudia-processing-text';
    text.textContent = 'Processing...';
    this.containerEl.appendChild(text);
  }

  showComplete(stats: {
    duration: number;
    confidence: number;
    meddiccCount: number;
    nextStepsCount: number;
    summaryPreview?: string;
  }): void {
    if (!this.containerEl) return;
    
    this.containerEl.innerHTML = '';
    this.containerEl.className = 'eudia-transcription-bar complete';
    
    // Success checkmark (CSS-based, no emoji)
    const successIcon = document.createElement('div');
    successIcon.className = 'eudia-complete-checkmark';
    this.containerEl.appendChild(successIcon);
    
    // Summary preview or stats
    const content = document.createElement('div');
    content.className = 'eudia-complete-content';
    
    if (stats.summaryPreview) {
      const preview = document.createElement('div');
      preview.className = 'eudia-summary-preview';
      preview.textContent = stats.summaryPreview.length > 80 
        ? stats.summaryPreview.substring(0, 80) + '...'
        : stats.summaryPreview;
      content.appendChild(preview);
    }
    
    const statsRow = document.createElement('div');
    statsRow.className = 'eudia-complete-stats-row';
    const mins = Math.floor(stats.duration / 60);
    const secs = Math.floor(stats.duration % 60);
    statsRow.textContent = `${mins}:${secs.toString().padStart(2, '0')} recorded`;
    if (stats.nextStepsCount > 0) {
      statsRow.textContent += ` | ${stats.nextStepsCount} action${stats.nextStepsCount > 1 ? 's' : ''}`;
    }
    if (stats.meddiccCount > 0) {
      statsRow.textContent += ` | ${stats.meddiccCount} signals`;
    }
    content.appendChild(statsRow);
    
    this.containerEl.appendChild(content);
    
    // Dismiss button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'eudia-control-btn close';
    closeBtn.textContent = 'Dismiss';
    closeBtn.onclick = () => this.hide();
    this.containerEl.appendChild(closeBtn);
    
    setTimeout(() => this.hide(), 8000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING MODAL - Clean staged progress
// ═══════════════════════════════════════════════════════════════════════════

class ProcessingModal extends Modal {
  private stepsContainer: HTMLElement;
  private steps: { el: HTMLElement; completed: boolean }[] = [];

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-processing-modal');
    
    // Title
    contentEl.createEl('div', { 
      text: 'Processing recording', 
      cls: 'eudia-processing-title' 
    });
    
    // Steps container
    this.stepsContainer = contentEl.createDiv({ cls: 'eudia-processing-steps' });
    
    const stepLabels = [
      'Transcribing audio',
      'Analyzing content', 
      'Extracting insights'
    ];
    
    this.steps = stepLabels.map((label, i) => {
      const stepEl = this.stepsContainer.createDiv({ cls: 'eudia-processing-step' });
      const indicator = stepEl.createDiv({ cls: 'eudia-step-indicator' });
      if (i === 0) indicator.addClass('active');
      stepEl.createSpan({ text: label, cls: 'eudia-step-label' });
      return { el: stepEl, completed: false };
    });
    
    contentEl.createEl('div', { 
      text: 'Usually completes in under 2 minutes.', 
      cls: 'eudia-processing-note' 
    });
  }

  setMessage(message: string) {
    // Map messages to step indices
    const stepIndex = message.toLowerCase().includes('transcrib') ? 0
      : message.toLowerCase().includes('summary') || message.toLowerCase().includes('analyz') ? 1
      : 2;
    
    // Complete previous steps and activate current
    this.steps.forEach((step, i) => {
      const indicator = step.el.querySelector('.eudia-step-indicator');
      if (i < stepIndex) {
        step.completed = true;
        indicator?.removeClass('active');
        indicator?.addClass('completed');
      } else if (i === stepIndex) {
        indicator?.addClass('active');
      }
    });
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
// INTELLIGENCE QUERY MODAL - Granola-style conversational queries
// ═══════════════════════════════════════════════════════════════════════════

class IntelligenceQueryModal extends Modal {
  plugin: EudiaSyncPlugin;
  private queryInput: HTMLTextAreaElement;
  private responseContainer: HTMLElement;
  private threadContainer: HTMLElement;
  private accountContext: { id: string; name: string } | null = null;
  private sessionId: string | null = null;

  constructor(app: App, plugin: EudiaSyncPlugin, accountContext?: { id: string; name: string }) {
    super(app);
    this.plugin = plugin;
    this.accountContext = accountContext || null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-intelligence-modal');
    
    // Header
    const header = contentEl.createDiv({ cls: 'eudia-intelligence-header' });
    header.createEl('h2', { 
      text: this.accountContext 
        ? `Ask about ${this.accountContext.name}` 
        : 'Ask gtm-brain'
    });
    
    if (this.accountContext) {
      header.createEl('p', { 
        text: 'Get insights, prep for meetings, or ask about this account.',
        cls: 'eudia-intelligence-subtitle'
      });
    } else {
      header.createEl('p', { 
        text: 'Ask questions about your accounts, deals, or pipeline.',
        cls: 'eudia-intelligence-subtitle'
      });
    }
    
    // Query input
    const inputContainer = contentEl.createDiv({ cls: 'eudia-intelligence-input-container' });
    this.queryInput = inputContainer.createEl('textarea', {
      placeholder: this.accountContext 
        ? `e.g., "What should I know before my next meeting?" or "What's the deal status?"`
        : `e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`
    }) as HTMLTextAreaElement;
    this.queryInput.addClass('eudia-intelligence-input');
    this.queryInput.rows = 3;
    
    // Submit button
    const actions = contentEl.createDiv({ cls: 'eudia-intelligence-actions' });
    const askButton = actions.createEl('button', { text: 'Ask', cls: 'eudia-btn-primary' });
    askButton.onclick = () => this.submitQuery();
    
    // Also submit on Enter (but not Shift+Enter)
    this.queryInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submitQuery();
      }
    };
    
    // Thread container for multi-turn conversation
    this.threadContainer = contentEl.createDiv({ cls: 'eudia-intelligence-thread' });
    
    // Response container (kept for backward compat — not visible in thread mode)
    this.responseContainer = contentEl.createDiv({ cls: 'eudia-intelligence-response' });
    this.responseContainer.style.display = 'none';

    // New chat button
    const threadActions = contentEl.createDiv({ cls: 'eudia-intelligence-thread-actions' });
    const newChatBtn = threadActions.createEl('button', { text: 'New conversation', cls: 'eudia-btn-secondary' });
    newChatBtn.onclick = () => {
      this.threadContainer.empty();
      this.sessionId = null;
      this.queryInput.value = '';
      this.queryInput.focus();
    };
    
    // Suggested questions - dynamic based on context
    const suggestions = contentEl.createDiv({ cls: 'eudia-intelligence-suggestions' });
    suggestions.createEl('p', { text: 'Suggested:', cls: 'eudia-suggestions-label' });
    
    let suggestionList: string[];
    if (this.accountContext) {
      // Account-specific suggestions
      suggestionList = [
        'What should I know before my next meeting?',
        'Summarize our relationship and deal status',
        'What are the key pain points?'
      ];
    } else {
      // Use real accounts from cache for dynamic suggestions
      const cachedAccounts = this.plugin.settings.cachedAccounts || [];
      const sampleAccounts = cachedAccounts.slice(0, 3).map(a => a.name);
      
      if (sampleAccounts.length >= 2) {
        suggestionList = [
          `What should I know about ${sampleAccounts[0]} before my next meeting?`,
          `What's the account history with ${sampleAccounts[1]}?`,
          `What's my late-stage pipeline?`
        ];
      } else {
        suggestionList = [
          "What should I know before my next meeting?",
          "What accounts need attention this week?",
          "What is my late-stage pipeline?"
        ];
      }
    }
    
    suggestionList.forEach(s => {
      const btn = suggestions.createEl('button', { text: s, cls: 'eudia-suggestion-btn' });
      btn.onclick = () => {
        this.queryInput.value = s;
        this.submitQuery();
      };
    });
    
    // Focus the input
    setTimeout(() => this.queryInput.focus(), 100);
  }

  private async submitQuery(): Promise<void> {
    const query = this.queryInput.value.trim();
    if (!query) return;
    
    // Add user message to thread
    const userMsg = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-user' });
    userMsg.setText(query);
    this.queryInput.value = '';
    
    // Add loading indicator
    const loadingMsg = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-loading' });
    const accountMsg = this.accountContext?.name ? ` about ${this.accountContext.name}` : '';
    loadingMsg.setText(`Thinking${accountMsg}...`);
    this.scrollThread();
    
    try {
      const payload: any = {
        query: query,
        accountId: this.accountContext?.id,
        accountName: this.accountContext?.name,
        userEmail: this.plugin.settings.userEmail
      };
      if (this.sessionId) payload.sessionId = this.sessionId;

      const response = await requestUrl({
        url: `${this.plugin.settings.serverUrl}/api/intelligence/query`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        throw: false,
        contentType: 'application/json'
      });
      
      // Remove loading indicator
      loadingMsg.remove();
      
      if (response.status >= 400) {
        const errorMsg = response.json?.error || `Server error (${response.status}). Please try again.`;
        const errDiv = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-error' });
        errDiv.setText(errorMsg);
        this.scrollThread();
        return;
      }
      
      if (response.json?.success) {
        // Track session for follow-ups
        if (response.json.sessionId) this.sessionId = response.json.sessionId;
        
        // Extract follow-up suggestions from end of response
        let mainAnswer = response.json.answer || '';
        const suggestions: string[] = [];
        const suggestMatch = mainAnswer.match(/---\s*\n\s*You might also ask:\s*\n((?:\d+\.\s*.+\n?)+)/i);
        if (suggestMatch) {
          mainAnswer = mainAnswer.substring(0, mainAnswer.indexOf(suggestMatch[0])).trim();
          const lines = suggestMatch[1].trim().split('\n');
          for (const line of lines) {
            const cleaned = line.replace(/^\d+\.\s*/, '').trim();
            if (cleaned.length > 5) suggestions.push(cleaned);
          }
        }

        // Add AI response to thread
        const aiMsg = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-ai' });
        const answerDiv = aiMsg.createDiv({ cls: 'eudia-intelligence-answer' });
        answerDiv.innerHTML = this.formatResponse(mainAnswer);
        
        // Context info
        if (response.json.context) {
          const ctx = response.json.context;
          const parts: string[] = [];
          if (ctx.accountName) parts.push(ctx.accountName);
          if (ctx.opportunityCount > 0) parts.push(`${ctx.opportunityCount} opps`);
          if (ctx.hasNotes) parts.push('notes');
          if (ctx.hasCustomerBrain) parts.push('history');
          const freshness = (ctx.dataFreshness === 'cached' || ctx.dataFreshness === 'session-cached') ? ' (cached)' : '';
          if (parts.length) {
            const contextInfo = aiMsg.createDiv({ cls: 'eudia-intelligence-context-info' });
            contextInfo.setText(`${parts.join(' \u2022 ')}${freshness}`);
          }
        }

        // Render follow-up suggestions as clickable chips
        if (suggestions.length > 0) {
          const suggestDiv = aiMsg.createDiv({ cls: 'eudia-suggestions-inline' });
          for (const suggestion of suggestions.slice(0, 3)) {
            const chip = suggestDiv.createEl('button', { text: suggestion, cls: 'eudia-suggestion-chip-inline' });
            chip.onclick = () => {
              this.queryInput.value = suggestion;
              this.submitQuery();
            };
          }
        }

        // Feedback buttons
        const feedbackDiv = aiMsg.createDiv({ cls: 'eudia-feedback-row' });
        const thumbsUp = feedbackDiv.createEl('button', { text: '\u2191 Helpful', cls: 'eudia-feedback-btn' });
        const thumbsDown = feedbackDiv.createEl('button', { text: '\u2193 Not helpful', cls: 'eudia-feedback-btn' });
        
        const sendFeedback = async (rating: string, btn: HTMLButtonElement, otherBtn: HTMLButtonElement) => {
          btn.disabled = true;
          btn.style.fontWeight = '600';
          btn.style.color = rating === 'helpful' ? 'var(--text-success)' : 'var(--text-error)';
          otherBtn.style.display = 'none';
          try {
            await requestUrl({
              url: `${this.plugin.settings.serverUrl}/api/intelligence/feedback`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: query,
                answerSnippet: mainAnswer.substring(0, 300),
                accountName: this.accountContext?.name || '',
                accountId: this.accountContext?.id || '',
                userEmail: this.plugin.settings.userEmail,
                sessionId: this.sessionId || '',
                rating
              }),
              throw: false
            });
          } catch (e) { /* silent */ }
        };
        thumbsUp.onclick = () => sendFeedback('helpful', thumbsUp as HTMLButtonElement, thumbsDown as HTMLButtonElement);
        thumbsDown.onclick = () => sendFeedback('not_helpful', thumbsDown as HTMLButtonElement, thumbsUp as HTMLButtonElement);
      } else {
        const errorMsg = response.json?.error || 'Could not get an answer. Try rephrasing your question.';
        const errDiv = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-error' });
        errDiv.setText(errorMsg);
      }
      this.scrollThread();
    } catch (error: any) {
      loadingMsg.remove();
      console.error('[GTM Brain] Intelligence query error:', error);
      let errorMsg = 'Unable to connect. Please check your internet connection and try again.';
      if (error?.message?.includes('timeout')) {
        errorMsg = 'Request timed out. The server may be busy - please try again.';
      } else if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
        errorMsg = 'Network error. Please check your connection and try again.';
      }
      const errDiv = this.threadContainer.createDiv({ cls: 'eudia-thread-msg eudia-thread-msg-error' });
      errDiv.setText(errorMsg);
      this.scrollThread();
    }
  }

  private scrollThread(): void {
    this.threadContainer.scrollTop = this.threadContainer.scrollHeight;
  }
  
  private formatResponse(text: string): string {
    let html = text;
    // Strip emojis
    html = html.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '');
    // Normalize: collapse 3+ newlines, remove blank lines between bullets and after headers
    html = html.replace(/\n{3,}/g, '\n\n');
    html = html.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm, '$1\n');
    html = html.replace(/^(#{2,3}\s+.+)\n\n/gm, '$1\n');
    // Remove empty sections
    html = html.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm, '');
    // Headers
    html = html.replace(/^#{2,3}\s+(.+)$/gm, '</p><h3 class="eudia-intel-header">$1</h3><p>');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Checkboxes
    html = html.replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="eudia-intel-todo">$1</li>');
    html = html.replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="eudia-intel-done">$1</li>');
    // Bullet points
    html = html.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive li into ul
    html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="eudia-intel-list">$&</ul>');
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    // Strip p-tags wrapping block elements
    html = html.replace(/<p>\s*(<ul)/g, '$1');
    html = html.replace(/<\/ul>\s*<\/p>/g, '</ul>');
    html = html.replace(/<p>\s*(<h3)/g, '$1');
    html = html.replace(/<\/h3>\s*<\/p>/g, '</h3>');
    // Clean up: remove <br> inside lists
    html = html.replace(/<\/li>\s*<br>\s*<li/g, '</li><li');
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*<br>\s*<\/p>/g, '');
    html = html.replace(/(<br>\s*){2,}/g, '');
    html = html.replace(/<\/h3>\s*<br>/g, '</h3>');
    html = html.replace(/<br>\s*<h3/g, '<h3');
    html = html.replace(/<br>\s*<ul/g, '<ul');
    html = html.replace(/<\/ul>\s*<br>/g, '</ul>');
    html = html.replace(/^(<br>)+|(<br>)+$/g, '');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\/p>/g, '');
    return html;
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

    // Step 2: Import tailored accounts based on user email
    this.updateStep('accounts', 'running');
    const quickLeftSplit = (this.plugin.app.workspace as any).leftSplit;
    const quickWasCollapsed = quickLeftSplit?.collapsed;
    try {
      const ownershipService = new AccountOwnershipService(this.plugin.settings.serverUrl);
      const userEmail = this.plugin.settings.userEmail;
      const userGroup = isAdminUser(userEmail) ? 'admin' : isCSUser(userEmail) ? 'cs' : 'bl';
      console.log(`[Eudia Quick Setup] Importing accounts for ${userEmail} (group: ${userGroup})`);
      
      // Route to correct account fetch based on user type
      let accounts: OwnedAccount[];
      let prospects: OwnedAccount[] = [];
      if (userGroup === 'cs') {
        // CS FAST PATH: Use static accounts (no server dependency)
        accounts = [...CS_STATIC_ACCOUNTS];
        console.log(`[Eudia] CS user detected — using ${accounts.length} static accounts`);
      } else if (userGroup === 'admin') {
        console.log('[Eudia] Admin user detected - importing all accounts');
        accounts = await ownershipService.getAllAccountsForAdmin(userEmail);
      } else {
        const result = await ownershipService.getAccountsWithProspects(userEmail);
        accounts = result.accounts;
        prospects = result.prospects;
      }
      
      if (accounts.length > 0 || prospects.length > 0) {
        // Collapse left sidebar to hide folder-by-folder creation (smoother UX)
        if (quickLeftSplit && !quickWasCollapsed) {
          quickLeftSplit.collapse();
        }

        // Create folder structures
        if (userGroup === 'admin') {
          await this.plugin.createAdminAccountFolders(accounts);
        } else {
          await this.plugin.createTailoredAccountFolders(accounts, {});
          if (prospects.length > 0) {
            await this.plugin.createProspectAccountFiles(prospects);
          }
        }
        // CS Manager dashboard (non-blocking)
        if (isCSManager(userEmail)) {
          try { await this.plugin.createCSManagerDashboard(userEmail, accounts); } catch { /* non-blocking */ }
        }
        this.plugin.settings.accountsImported = true;
        this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
        await this.plugin.saveSettings();

        // Remove placeholder
        try {
          const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
          if (setupFile) await this.plugin.app.vault.delete(setupFile);
        } catch { /* ok */ }

        // Expand left sidebar now that all folders exist (clean reveal, no flickering)
        if (quickLeftSplit && !quickWasCollapsed) {
          quickLeftSplit.expand();
        }

        // BACKGROUND: Enrich from Salesforce (non-blocking)
        if (userGroup === 'cs') {
          const csEmail = userEmail;
          setTimeout(async () => {
            try {
              const serverResult = await ownershipService.getCSAccounts(csEmail);
              if (serverResult.accounts.length > 0) {
                await this.plugin.enrichAccountFolders(serverResult.accounts);
              }
            } catch { /* server may be warming up */ }
          }, 2000);
        } else {
          const allAccounts = [...accounts, ...prospects];
          setTimeout(async () => {
            try {
              await this.plugin.enrichAccountFolders(allAccounts);
            } catch (e) {
              console.log('[Eudia] Background enrichment skipped:', e);
            }
          }, 500);
        }
      } else {
        console.warn(`[Eudia Quick Setup] No accounts returned for ${userEmail}. Server may be cold.`);
      }
      this.updateStep('accounts', 'complete');
    } catch (e) {
      console.error('[Eudia] Account import failed:', e);
      this.updateStep('accounts', 'error');
      // Re-expand sidebar on error
      if (quickLeftSplit && !quickWasCollapsed) quickLeftSplit.expand();
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
// EUDIA SETUP VIEW - Full-Page Onboarding Experience
// ═══════════════════════════════════════════════════════════════════════════

interface SetupStep {
  id: 'calendar' | 'salesforce' | 'transcribe';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'error';
  errorMessage?: string;
}

class EudiaSetupView extends ItemView {
  plugin: EudiaSyncPlugin;
  private steps: SetupStep[];
  private emailInput: HTMLInputElement | null = null;
  private pollInterval: number | null = null;
  private accountOwnershipService: AccountOwnershipService;

  constructor(leaf: WorkspaceLeaf, plugin: EudiaSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.accountOwnershipService = new AccountOwnershipService(plugin.settings.serverUrl);
    this.steps = [
      {
        id: 'calendar',
        title: 'Connect Your Calendar',
        description: 'View your meetings and create notes with one click',
        status: 'pending'
      },
      {
        id: 'salesforce',
        title: 'Connect to Salesforce',
        description: 'Sync notes and access your accounts',
        status: 'pending'
      },
      {
        id: 'transcribe',
        title: 'Ready to Transcribe',
        description: 'Record and summarize meetings automatically',
        status: 'pending'
      }
    ];
  }

  getViewType(): string {
    return SETUP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Setup';
  }

  getIcon(): string {
    return 'settings';
  }

  async onOpen(): Promise<void> {
    await this.checkExistingStatus();
    await this.render();
  }

  async onClose(): Promise<void> {
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check existing connection status on load
   */
  private async checkExistingStatus(): Promise<void> {
    // Check if email is already configured
    if (this.plugin.settings.userEmail) {
      this.steps[0].status = 'complete';  // Calendar step complete if email set
      
      // Check Salesforce status
      try {
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: 'GET',
          throw: false
        });
        
        if (response.json?.authenticated === true) {
          this.steps[1].status = 'complete';
          this.plugin.settings.salesforceConnected = true;
        }
      } catch {
        // Salesforce not connected
      }
      
      // Check if accounts are imported — if email is set but accounts haven't loaded, auto-retry
      if (this.plugin.settings.accountsImported) {
        // VERIFY: Check that account folders actually exist in the filesystem
        const verifyFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder || 'Accounts');
        const verifyChildren = (verifyFolder as any)?.children?.filter((c: any) => c.children !== undefined) || [];
        
        if (verifyChildren.length > 0) {
          this.steps[2].status = 'complete';
          console.log(`[Eudia] Vault reopen: ${verifyChildren.length} account folders verified`);
        } else {
          // Flag says imported but no folders exist — reset for re-import
          console.warn(`[Eudia] accountsImported=true but 0 account folders found — resetting for re-import`);
          this.plugin.settings.accountsImported = false;
          this.plugin.settings.importedAccountCount = 0;
          await this.plugin.saveSettings();
          // Fall through to the auto-retry block below (line ~1247)
        }

        // Clean up placeholder if still present
        try {
          const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
          if (setupFile) await this.plugin.app.vault.delete(setupFile);
        } catch { /* ok */ }

        // CS/BL users: check if accounts need enrichment on vault reopen
        // Look for any account folder where Contacts.md has no enriched_at timestamp
        const email = this.plugin.settings.userEmail;
        const cachedAccts = this.plugin.settings.cachedAccounts || [];
        const realIdAccts = cachedAccts.filter((a: any) => a.id && String(a.id).startsWith('001'));
        if (email && realIdAccts.length > 0) {
          // Check if at least one account is unenriched
          const acctFolder = this.plugin.settings.accountsFolder || 'Accounts';
          let needsEnrichment = false;
          for (const acc of realIdAccts.slice(0, 5)) { // Sample first 5
            const safeName = (acc.name || '').replace(/[<>:"/\\|?*]/g, '_').trim();
            const contactsPath = `${acctFolder}/${safeName}/Contacts.md`;
            const file = this.plugin.app.vault.getAbstractFileByPath(contactsPath);
            if (file instanceof TFile) {
              const cache = this.plugin.app.metadataCache.getFileCache(file);
              if (!cache?.frontmatter?.enriched_at) {
                needsEnrichment = true;
                break;
              }
            }
          }
          if (needsEnrichment) {
            console.log(`[Eudia Setup] Accounts need enrichment — triggering on vault reopen...`);
            // Non-blocking enrichment on vault reopen (3s delay to let vault fully load)
            setTimeout(async () => {
              try {
                const accts = realIdAccts.map((a: any) => ({ id: a.id, name: a.name, type: '', isOwned: false, hadOpportunity: true, website: null, industry: null }));
                await this.plugin.enrichAccountFolders(accts);
                console.log(`[Eudia] Vault-reopen enrichment complete: ${accts.length} accounts enriched`);
              } catch (e) {
                console.log(`[Eudia] Vault-reopen enrichment failed (will retry next open):`, e);
              }
            }, 3000);
          }
        }
      } else {
        // Email connected but accounts never imported (server may have been down). Auto-retry.
        console.log('[Eudia Setup] Email set but accounts not imported — auto-retrying import...');
        const leftSplit = (this.plugin.app.workspace as any).leftSplit;
        const wasCollapsed = leftSplit?.collapsed;
        
        try {
          const email = this.plugin.settings.userEmail;
          const userGroup = isAdminUser(email) ? 'admin' : isCSUser(email) ? 'cs' : 'bl';
          let accounts: OwnedAccount[] = [];
          let prospects: OwnedAccount[] = [];
          
          console.log(`[Eudia Setup] Auto-retry for ${email} (group: ${userGroup})`);
          
          if (userGroup === 'cs') {
            // CS FAST PATH: Use static accounts (no server dependency)
            accounts = [...CS_STATIC_ACCOUNTS];
            console.log(`[Eudia Setup] Auto-retry CS: using ${accounts.length} static accounts`);
          } else if (userGroup === 'admin') {
            accounts = await this.accountOwnershipService.getAllAccountsForAdmin(email);
          } else {
            const result = await this.accountOwnershipService.getAccountsWithProspects(email);
            accounts = result.accounts;
            prospects = result.prospects;
          }
          
          if (accounts.length > 0 || prospects.length > 0) {
            // Collapse sidebar during folder creation
            if (leftSplit && !wasCollapsed) leftSplit.collapse();
            
            if (userGroup === 'admin') {
              await this.plugin.createAdminAccountFolders(accounts);
            } else {
              await this.plugin.createTailoredAccountFolders(accounts, {});
              if (prospects.length > 0) {
                await this.plugin.createProspectAccountFiles(prospects);
              }
            }
            // CS Manager dashboard (non-blocking)
            if (isCSManager(email)) {
              try { await this.plugin.createCSManagerDashboard(email, accounts); } catch { /* non-blocking */ }
            }
            
            this.plugin.settings.accountsImported = true;
            this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
            await this.plugin.saveSettings();
            this.steps[2].status = 'complete';
            
            // Remove placeholder
            try {
              const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
              if (setupFile) await this.plugin.app.vault.delete(setupFile);
            } catch { /* ok */ }
            
            if (leftSplit && !wasCollapsed) leftSplit.expand();
            
            console.log(`[Eudia Setup] Auto-retry imported ${accounts.length} accounts for ${email}`);
            
            // Synchronous enrichment — populate contacts immediately
            new Notice(`Enriching ${accounts.length} accounts with Salesforce contacts...`);
            try {
              const allAccounts = userGroup === 'cs' ? accounts : [...accounts, ...prospects];
              await this.plugin.enrichAccountFolders(allAccounts);
              new Notice(`${accounts.length} accounts loaded and enriched!`);
              console.log(`[Eudia Setup] Auto-retry enrichment complete`);
            } catch (e) {
              console.log(`[Eudia Setup] Auto-retry enrichment failed:`, e);
              new Notice(`${accounts.length} accounts imported! Contacts will populate on next open.`);
            }
          } else {
            console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${email}. Server may still be starting.`);
            // Re-expand sidebar since we collapsed it
            if (leftSplit && !wasCollapsed) leftSplit.expand();
          }
        } catch (retryErr) {
          console.error('[Eudia Setup] Auto-retry account import failed:', retryErr);
          // Re-expand sidebar on error
          if (leftSplit && !wasCollapsed) leftSplit.expand();
        }
      }
    }
  }

  /**
   * Calculate completion percentage
   */
  private getCompletionPercentage(): number {
    const completed = this.steps.filter(s => s.status === 'complete').length;
    return Math.round((completed / this.steps.length) * 100);
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('eudia-setup-view');

    // Header with progress
    this.renderHeader(container);
    
    // Steps
    this.renderSteps(container);
    
    // Footer actions
    this.renderFooter(container);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'eudia-setup-header' });
    
    // Logo and title
    const titleSection = header.createDiv({ cls: 'eudia-setup-title-section' });
    titleSection.createEl('h1', { text: 'Welcome to Eudia Sales Vault', cls: 'eudia-setup-main-title' });
    titleSection.createEl('p', { 
      text: 'Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.',
      cls: 'eudia-setup-subtitle'
    });
    
    // Progress bar
    const progressSection = header.createDiv({ cls: 'eudia-setup-progress-section' });
    const percentage = this.getCompletionPercentage();
    
    const progressLabel = progressSection.createDiv({ cls: 'eudia-setup-progress-label' });
    progressLabel.createSpan({ text: 'Setup Progress' });
    progressLabel.createSpan({ text: `${percentage}%`, cls: 'eudia-setup-progress-value' });
    
    const progressBar = progressSection.createDiv({ cls: 'eudia-setup-progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'eudia-setup-progress-fill' });
    progressFill.style.width = `${percentage}%`;
  }

  private renderSteps(container: HTMLElement): void {
    const stepsContainer = container.createDiv({ cls: 'eudia-setup-steps-container' });
    
    // Step 1: Calendar / Email
    this.renderCalendarStep(stepsContainer);
    
    // Step 2: Salesforce
    this.renderSalesforceStep(stepsContainer);
    
    // Step 3: Transcription
    this.renderTranscribeStep(stepsContainer);
  }

  private renderCalendarStep(container: HTMLElement): void {
    const step = this.steps[0];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    
    // Step header
    const stepHeader = stepEl.createDiv({ cls: 'eudia-setup-step-header' });
    const stepNumber = stepHeader.createDiv({ cls: 'eudia-setup-step-number' });
    stepNumber.setText(step.status === 'complete' ? '' : '1');
    if (step.status === 'complete') stepNumber.addClass('eudia-step-complete');
    
    const stepInfo = stepHeader.createDiv({ cls: 'eudia-setup-step-info' });
    stepInfo.createEl('h3', { text: step.title });
    stepInfo.createEl('p', { text: step.description });
    
    // Step content
    const stepContent = stepEl.createDiv({ cls: 'eudia-setup-step-content' });
    
    if (step.status === 'complete') {
      stepContent.createDiv({ 
        cls: 'eudia-setup-complete-message',
        text: `Connected as ${this.plugin.settings.userEmail}`
      });
    } else {
      const inputGroup = stepContent.createDiv({ cls: 'eudia-setup-input-group' });
      
      this.emailInput = inputGroup.createEl('input', {
        type: 'email',
        placeholder: 'yourname@eudia.com',
        cls: 'eudia-setup-input'
      }) as HTMLInputElement;
      
      if (this.plugin.settings.userEmail) {
        this.emailInput.value = this.plugin.settings.userEmail;
      }
      
      const connectBtn = inputGroup.createEl('button', {
        text: 'Connect',
        cls: 'eudia-setup-btn primary'
      });
      
      connectBtn.onclick = async () => {
        await this.handleCalendarConnect();
      };
      
      this.emailInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          await this.handleCalendarConnect();
        }
      };
      
      // Validation message
      stepContent.createDiv({ cls: 'eudia-setup-validation-message' });
      
      // Help text
      stepContent.createEl('p', {
        cls: 'eudia-setup-help-text',
        text: 'Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings.'
      });
    }
  }

  private async handleCalendarConnect(): Promise<void> {
    if (!this.emailInput) return;
    
    const email = this.emailInput.value.trim().toLowerCase();
    const validationEl = this.containerEl.querySelector('.eudia-setup-validation-message');
    
    // Validate email
    if (!email) {
      if (validationEl) {
        validationEl.textContent = 'Please enter your email';
        validationEl.className = 'eudia-setup-validation-message error';
      }
      return;
    }
    
    if (!email.endsWith('@eudia.com')) {
      if (validationEl) {
        validationEl.textContent = 'Please use your @eudia.com email address';
        validationEl.className = 'eudia-setup-validation-message error';
      }
      return;
    }
    
    // Show loading
    if (validationEl) {
      validationEl.textContent = 'Validating...';
      validationEl.className = 'eudia-setup-validation-message loading';
    }
    
    try {
      // Validate with server
      const response = await requestUrl({
        url: `${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(email)}`,
        method: 'GET',
        throw: false
      });
      
      if (response.status === 200 && response.json?.authorized) {
        // Success!
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        
        this.steps[0].status = 'complete';
        new Notice('Calendar connected successfully!');
        
        // Import tailored accounts based on user email
        if (validationEl) {
          validationEl.textContent = 'Importing your accounts...';
          validationEl.className = 'eudia-setup-validation-message loading';
        }
        
        // Collapse left sidebar early to hide folder-by-folder creation (smoother UX)
        const leftSplit = (this.plugin.app.workspace as any).leftSplit;
        const wasCollapsed = leftSplit?.collapsed;
        if (leftSplit && !wasCollapsed) {
          leftSplit.collapse();
        }

        try {
          // Route to correct account fetch based on user type
          let accounts: OwnedAccount[];
          let prospects: OwnedAccount[] = [];
          const userGroup = isAdminUser(email) ? 'admin' : isCSUser(email) ? 'cs' : 'bl';
          console.log(`[Eudia] User group detected: ${userGroup} for ${email}`);
          
          if (userGroup === 'cs') {
            // ─── CS FAST PATH: Use static accounts IMMEDIATELY (no server dependency) ───
            console.log(`[Eudia] CS user detected — loading ${CS_STATIC_ACCOUNTS.length} accounts from static data (instant, no server needed)`);
            accounts = [...CS_STATIC_ACCOUNTS]; // Copy to avoid mutation
            prospects = [];
            
            if (validationEl) {
              validationEl.textContent = `Loading ${accounts.length} Customer Success accounts...`;
            }

            // Create folder structures from static data — guaranteed to work
            await this.plugin.createTailoredAccountFolders(accounts, {});
            
            // CS Manager dashboard (non-blocking)
            if (isCSManager(email)) {
              try {
                await this.plugin.createCSManagerDashboard(email, accounts);
              } catch (dashErr) {
                console.error('[Eudia] CS Manager dashboard creation failed (non-blocking):', dashErr);
              }
            }
            
            // Verify folders were actually created before setting flag
            const csAccountsFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder || 'Accounts');
            const csFolderChildren = (csAccountsFolder as any)?.children?.filter((c: any) => c.children !== undefined) || [];
            if (csFolderChildren.length > 0) {
              this.plugin.settings.accountsImported = true;
              this.plugin.settings.importedAccountCount = accounts.length;
              console.log(`[Eudia] CS accounts verified: ${csFolderChildren.length} folders created`);
            } else {
              console.warn(`[Eudia] CS folder creation may have failed — ${csFolderChildren.length} folders found. Keeping accountsImported=false for retry.`);
              this.plugin.settings.accountsImported = false;
            }
            await this.plugin.saveSettings();

            // Remove _Setup Required.md placeholder
            try {
              const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
              if (setupFile) {
                await this.plugin.app.vault.delete(setupFile);
              }
            } catch { /* ok if already gone */ }

            console.log(`[Eudia] CS accounts created: ${accounts.length} folders from static data`);

            // SYNCHRONOUS enrichment — populate contacts, intelligence, etc. immediately
            // Accounts already have real SF IDs (001*) so enrichAccountFolders will process them
            if (validationEl) {
              validationEl.textContent = `Enriching ${accounts.length} accounts with Salesforce contacts...`;
            }
            new Notice(`Enriching ${accounts.length} accounts with contacts from Salesforce...`);
            console.log(`[Eudia] Starting synchronous enrichment for ${accounts.length} CS accounts...`);
            
            try {
              await this.plugin.enrichAccountFolders(accounts);
              console.log(`[Eudia] Synchronous enrichment complete`);
              new Notice(`${accounts.length} accounts loaded with contacts from Salesforce!`);
              if (validationEl) {
                validationEl.textContent = `${accounts.length} accounts loaded and enriched with Salesforce contacts!`;
              }
            } catch (enrichErr) {
              console.log(`[Eudia] Synchronous enrichment failed, will retry in background:`, enrichErr);
              new Notice(`${accounts.length} accounts loaded! Contacts will populate shortly...`);
              // Fallback: retry enrichment in background if synchronous call failed
              const csEmail = email;
              const retryDelays = [5000, 20000, 60000];
              const bgEnrich = async (attempt: number): Promise<void> => {
                const delay = retryDelays[attempt];
                if (delay === undefined) return;
                await new Promise(r => setTimeout(r, delay));
                try {
                  await this.plugin.enrichAccountFolders(accounts);
                  console.log(`[Eudia] Background enrichment retry ${attempt + 1} succeeded`);
                } catch {
                  return bgEnrich(attempt + 1);
                }
              };
              bgEnrich(0);
            }
            
          } else if (userGroup === 'admin') {
            console.log('[Eudia] Admin user detected - importing all accounts');
            accounts = await this.accountOwnershipService.getAllAccountsForAdmin(email);
            
            if (accounts.length > 0) {
              if (validationEl) {
                validationEl.textContent = `Creating ${accounts.length} account folders...`;
              }
              await this.plugin.createAdminAccountFolders(accounts);
              
              // Verify folders were actually created before setting flag
              const adminAcctFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder || 'Accounts');
              const adminFolderChildren = (adminAcctFolder as any)?.children?.filter((c: any) => c.children !== undefined) || [];
              if (adminFolderChildren.length > 0) {
                this.plugin.settings.accountsImported = true;
                this.plugin.settings.importedAccountCount = accounts.length;
                console.log(`[Eudia] Admin accounts verified: ${adminFolderChildren.length} folders created`);
              } else {
                console.warn(`[Eudia] Admin folder creation may have failed — keeping accountsImported=false for retry`);
                this.plugin.settings.accountsImported = false;
              }
              await this.plugin.saveSettings();

              try {
                const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
                if (setupFile) await this.plugin.app.vault.delete(setupFile);
              } catch { /* ok if already gone */ }

              new Notice(`Imported ${accounts.length} accounts! Enriching with Salesforce data...`);

              // SYNCHRONOUS enrichment for admin/exec — populate contacts, intelligence, meeting notes
              const enrichableAdminAccounts = accounts.filter(a => a.id && a.id.startsWith('001'));
              if (enrichableAdminAccounts.length > 0) {
                if (validationEl) {
                  validationEl.textContent = `Enriching ${enrichableAdminAccounts.length} accounts with Salesforce contacts...`;
                }
                try {
                  await this.plugin.enrichAccountFolders(enrichableAdminAccounts);
                  new Notice(`${accounts.length} accounts loaded and enriched with Salesforce data!`);
                  console.log(`[Eudia] Admin/exec synchronous enrichment complete: ${enrichableAdminAccounts.length} accounts`);
                  if (validationEl) {
                    validationEl.textContent = `${accounts.length} accounts loaded and enriched!`;
                  }
                } catch (enrichErr) {
                  console.log('[Eudia] Admin/exec synchronous enrichment failed, will retry on next open:', enrichErr);
                  new Notice(`${accounts.length} accounts imported! Contacts will populate on next vault open.`);
                  // Background retry with delays
                  const retryDelays = [5000, 20000, 60000];
                  const bgEnrich = async (attempt: number): Promise<void> => {
                    const delay = retryDelays[attempt];
                    if (delay === undefined) return;
                    await new Promise(r => setTimeout(r, delay));
                    try {
                      await this.plugin.enrichAccountFolders(enrichableAdminAccounts);
                      console.log(`[Eudia] Admin/exec background enrichment retry ${attempt + 1} succeeded`);
                    } catch {
                      return bgEnrich(attempt + 1);
                    }
                  };
                  bgEnrich(0);
                }
              }
            }
          } else {
            // Business Lead path — server-dependent
            const result = await this.accountOwnershipService.getAccountsWithProspects(email);
            accounts = result.accounts;
            prospects = result.prospects;
            
            if (accounts.length > 0 || prospects.length > 0) {
              if (validationEl) {
                validationEl.textContent = `Creating ${accounts.length} account folders...`;
              }
              await this.plugin.createTailoredAccountFolders(accounts, {});
              if (prospects.length > 0) {
                await this.plugin.createProspectAccountFiles(prospects);
              }
              
              // Verify folders were actually created before setting flag
              const blAcctFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder || 'Accounts');
              const blFolderChildren = (blAcctFolder as any)?.children?.filter((c: any) => c.children !== undefined) || [];
              if (blFolderChildren.length > 0) {
                this.plugin.settings.accountsImported = true;
                this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
                console.log(`[Eudia] BL accounts verified: ${blFolderChildren.length} folders created`);
              } else {
                console.warn(`[Eudia] BL folder creation may have failed — keeping accountsImported=false for retry`);
                this.plugin.settings.accountsImported = false;
              }
              await this.plugin.saveSettings();

              try {
                const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
                if (setupFile) await this.plugin.app.vault.delete(setupFile);
              } catch { /* ok if already gone */ }

              new Notice(`Imported ${accounts.length} active accounts + ${prospects.length} prospects!`);

              // BACKGROUND: Enrich from Salesforce (non-blocking)
              const allImported = [...accounts, ...prospects];
              setTimeout(async () => {
                try {
                  await this.plugin.enrichAccountFolders(allImported);
                } catch (e) {
                  console.log('[Eudia] Background enrichment skipped:', e);
                }
              }, 500);
            } else {
              // Auto-retry: server may be cold-starting after deploy
              console.warn(`[Eudia] No accounts returned for ${email} — auto-retrying...`);
              let retrySuccess = false;
              for (let retry = 1; retry <= 3; retry++) {
                if (validationEl) {
                  validationEl.textContent = `Server warming up... retrying in 10s (attempt ${retry}/3)`;
                  validationEl.className = 'eudia-setup-validation-message warning';
                }
                await new Promise(r => setTimeout(r, 10000));
                try {
                  const retryResult = await this.plugin.accountOwnershipService.getAccountsWithProspects(email);
                  if (retryResult.accounts.length > 0 || retryResult.prospects.length > 0) {
                    accounts = retryResult.accounts;
                    prospects = retryResult.prospects;
                    if (validationEl) {
                      validationEl.textContent = `Creating ${accounts.length} account folders...`;
                    }
                    await this.plugin.createTailoredAccountFolders(accounts, {});
                    if (prospects.length > 0) {
                      await this.plugin.createProspectAccountFiles(prospects);
                    }
                    const blAcctFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder || 'Accounts');
                    const blFolderChildren = (blAcctFolder as any)?.children?.filter((c: any) => c.children !== undefined) || [];
                    if (blFolderChildren.length > 0) {
                      this.plugin.settings.accountsImported = true;
                      this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
                    }
                    await this.plugin.saveSettings();
                    new Notice(`Imported ${accounts.length} accounts + ${prospects.length} prospects!`);
                    retrySuccess = true;
                    break;
                  }
                } catch (retryErr) {
                  console.warn(`[Eudia] Retry ${retry} failed:`, retryErr);
                }
              }
              if (!retrySuccess) {
                if (validationEl) {
                  validationEl.textContent = `Could not load accounts after 3 attempts. Close this window, wait 1 minute, then re-open Obsidian and try again.`;
                  validationEl.className = 'eudia-setup-validation-message error';
                }
                new Notice('Account import failed after retries. Wait 1 minute and try again.');
              }
            }
          }
        } catch (importError) {
          console.error('[Eudia] Account import failed:', importError);
          if (validationEl) {
            validationEl.textContent = 'Account import failed. Please try again.';
            validationEl.className = 'eudia-setup-validation-message error';
          }
          new Notice('Account import failed — please try again.');
        } finally {
          // ALWAYS re-expand left sidebar (even on error)
          if (leftSplit && !wasCollapsed) {
            leftSplit.expand();
          }
        }
        
        await this.render();
      } else {
        if (validationEl) {
          validationEl.innerHTML = `<strong>${email}</strong> is not authorized for calendar access. Contact your admin.`;
          validationEl.className = 'eudia-setup-validation-message error';
        }
      }
    } catch (error) {
      if (validationEl) {
        validationEl.textContent = 'Connection failed. Please try again.';
        validationEl.className = 'eudia-setup-validation-message error';
      }
    }
  }

  private renderSalesforceStep(container: HTMLElement): void {
    const step = this.steps[1];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    
    // Step header
    const stepHeader = stepEl.createDiv({ cls: 'eudia-setup-step-header' });
    const stepNumber = stepHeader.createDiv({ cls: 'eudia-setup-step-number' });
    stepNumber.setText(step.status === 'complete' ? '' : '2');
    if (step.status === 'complete') stepNumber.addClass('eudia-step-complete');
    
    const stepInfo = stepHeader.createDiv({ cls: 'eudia-setup-step-info' });
    stepInfo.createEl('h3', { text: step.title });
    stepInfo.createEl('p', { text: step.description });
    
    // Step content
    const stepContent = stepEl.createDiv({ cls: 'eudia-setup-step-content' });
    
    if (!this.plugin.settings.userEmail) {
      // Disabled state - need to complete step 1 first
      stepContent.createDiv({
        cls: 'eudia-setup-disabled-message',
        text: 'Complete the calendar step first'
      });
      return;
    }
    
    if (step.status === 'complete') {
      stepContent.createDiv({ 
        cls: 'eudia-setup-complete-message',
        text: 'Salesforce connected successfully'
      });
      
      // Show account import status
      if (this.plugin.settings.accountsImported) {
        stepContent.createDiv({
          cls: 'eudia-setup-account-status',
          text: `${this.plugin.settings.importedAccountCount} accounts imported`
        });
      }
    } else {
      const buttonGroup = stepContent.createDiv({ cls: 'eudia-setup-button-group' });
      
      const sfButton = buttonGroup.createEl('button', {
        text: 'Connect to Salesforce',
        cls: 'eudia-setup-btn primary'
      });
      
      const statusEl = stepContent.createDiv({ cls: 'eudia-setup-sf-status' });
      
      sfButton.onclick = async () => {
        // Open OAuth flow
        const authUrl = `${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;
        window.open(authUrl, '_blank');
        
        statusEl.textContent = 'Complete the login in the popup window...';
        statusEl.className = 'eudia-setup-sf-status loading';
        
        new Notice('Complete the Salesforce login in the popup window', 5000);
        
        // Start polling for OAuth completion
        this.startSalesforcePolling(statusEl);
      };
      
      stepContent.createEl('p', {
        cls: 'eudia-setup-help-text',
        text: 'This links your Obsidian notes to your Salesforce account for automatic sync.'
      });
    }
  }

  private startSalesforcePolling(statusEl: HTMLElement): void {
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
    }
    
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 5 minutes
    
    this.pollInterval = window.setInterval(async () => {
      attempts++;
      
      try {
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: 'GET',
          throw: false
        });
        
        if (response.json?.authenticated === true) {
          // Success!
          if (this.pollInterval) {
            window.clearInterval(this.pollInterval);
            this.pollInterval = null;
          }
          
          this.plugin.settings.salesforceConnected = true;
          await this.plugin.saveSettings();
          
          this.steps[1].status = 'complete';
          new Notice('Salesforce connected successfully!');
          
          // Import tailored account folders
          await this.importTailoredAccounts(statusEl);
          
          await this.render();
        } else if (attempts >= maxAttempts) {
          // Timeout
          if (this.pollInterval) {
            window.clearInterval(this.pollInterval);
            this.pollInterval = null;
          }
          statusEl.textContent = 'Connection timed out. Please try again.';
          statusEl.className = 'eudia-setup-sf-status error';
        }
      } catch (error) {
        // Continue polling
      }
    }, 5000);
  }

  private async importTailoredAccounts(statusEl: HTMLElement): Promise<void> {
    statusEl.textContent = 'Importing your accounts...';
    statusEl.className = 'eudia-setup-sf-status loading';
    
    try {
      const userEmail = this.plugin.settings.userEmail;
      const userGroup = isAdminUser(userEmail) ? 'admin' : isCSUser(userEmail) ? 'cs' : 'bl';
      console.log(`[Eudia SF Import] Importing for ${userEmail} (group: ${userGroup})`);
      
      // Route to correct account fetch based on user type
      let accounts: OwnedAccount[];
      let prospects: OwnedAccount[] = [];
      if (userGroup === 'cs') {
        // CS users: SF Connect = sync with live Salesforce data (real IDs, CSM assignments, enrichment)
        console.log('[Eudia SF Import] CS user SF Connect — fetching live data from Salesforce...');
        statusEl.textContent = 'Syncing with Salesforce for latest account data...';
        try {
          const serverResult = await this.accountOwnershipService.getCSAccounts(userEmail);
          accounts = serverResult.accounts;
          prospects = serverResult.prospects;
          console.log(`[Eudia SF Import] CS server sync: ${accounts.length} accounts (with real SF IDs + CSM data)`);
        } catch {
          if (this.plugin.settings.accountsImported) {
            // Server unavailable but accounts already loaded from static data
            statusEl.textContent = 'Salesforce connected! Account folders already loaded. Enrichment will retry later.';
            statusEl.className = 'eudia-setup-sf-status success';
            this.steps[1].status = 'complete';
            return;
          }
          // First time, no static loaded either — use static fallback
          accounts = [...CS_STATIC_ACCOUNTS];
          console.log(`[Eudia SF Import] CS server unavailable — using ${accounts.length} static accounts`);
        }
      } else if (userGroup === 'admin') {
        console.log('[Eudia] Admin user detected - importing all accounts');
        statusEl.textContent = 'Admin detected - importing all accounts...';
        accounts = await this.accountOwnershipService.getAllAccountsForAdmin(userEmail);
      } else {
        const result = await this.accountOwnershipService.getAccountsWithProspects(userEmail);
        accounts = result.accounts;
        prospects = result.prospects;
      }
      
      if (accounts.length === 0 && prospects.length === 0) {
        statusEl.textContent = 'No accounts found for your email. Contact your admin.';
        statusEl.className = 'eudia-setup-sf-status warning';
        return;
      }
      
      // FAST PATH: Create folder structures immediately (templates only)
      statusEl.textContent = `Creating ${accounts.length} account folders...`;

      // Collapse left sidebar to hide folder-by-folder creation (smoother UX)
      const importLeftSplit = (this.plugin.app.workspace as any).leftSplit;
      const importWasCollapsed = importLeftSplit?.collapsed;
      if (importLeftSplit && !importWasCollapsed) {
        importLeftSplit.collapse();
      }

      if (isAdminUser(userEmail)) {
        await this.plugin.createAdminAccountFolders(accounts);
      } else {
        await this.plugin.createTailoredAccountFolders(accounts, {}); // Empty = fast templates
        if (prospects.length > 0) {
          await this.plugin.createProspectAccountFiles(prospects);
        }
      }
      // CS Manager dashboard (non-blocking)
      if (isCSManager(userEmail)) {
        try { await this.plugin.createCSManagerDashboard(userEmail, accounts); } catch { /* non-blocking */ }
      }
      
      this.plugin.settings.accountsImported = true;
      this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
      await this.plugin.saveSettings();

      // Remove placeholder
      try {
        const setupFile = this.plugin.app.vault.getAbstractFileByPath('Accounts/_Setup Required.md');
        if (setupFile) await this.plugin.app.vault.delete(setupFile);
      } catch { /* ok */ }

      // Expand left sidebar now that all folders exist (clean reveal, no flickering)
      if (importLeftSplit && !importWasCollapsed) {
        importLeftSplit.expand();
      }
      
      this.steps[2].status = 'complete';
      
      const ownedCount = accounts.filter(a => a.isOwned !== false).length;
      const viewOnlyCount = accounts.filter(a => a.isOwned === false).length;
      
      if (userGroup === 'admin' && viewOnlyCount > 0) {
        statusEl.textContent = `${ownedCount} owned + ${viewOnlyCount} view-only accounts imported! Enriching...`;
      } else {
        statusEl.textContent = `${accounts.length} active + ${prospects.length} prospect accounts imported! Enriching...`;
      }
      statusEl.className = 'eudia-setup-sf-status success';

      // BACKGROUND: Enrich account data from Salesforce + regenerate CS Manager dashboard (non-blocking)
      const allSetupAccounts = [...accounts, ...prospects];
      const sfUserEmail = userEmail;
      const sfUserGroup = userGroup;
      setTimeout(async () => {
        try {
          // Enrich folders with Salesforce data (contacts, intelligence, opportunities, next steps)
          const enrichableAccounts = allSetupAccounts.filter(a => a.id && a.id.startsWith('001'));
          if (enrichableAccounts.length > 0) {
            statusEl.textContent = `Enriching ${enrichableAccounts.length} accounts with Salesforce data...`;
            await this.plugin.enrichAccountFolders(enrichableAccounts);
            statusEl.textContent = `${accounts.length} accounts imported, ${enrichableAccounts.length} enriched with Salesforce data`;
          } else {
            statusEl.textContent = `${accounts.length} accounts imported (enrichment requires Salesforce IDs)`;
          }
          
          // CS Manager: regenerate dashboard with real CSM assignments from Salesforce
          if (sfUserGroup === 'cs' && isCSManager(sfUserEmail)) {
            try {
              console.log('[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data...');
              await this.plugin.createCSManagerDashboard(sfUserEmail, accounts);
              console.log('[Eudia SF Import] CS Manager dashboard updated with CSM assignments');
            } catch (dashErr) {
              console.error('[Eudia SF Import] Dashboard regeneration failed (non-blocking):', dashErr);
            }
          }
        } catch (e) {
          console.log('[Eudia] Background enrichment skipped:', e);
          statusEl.textContent = `${accounts.length + prospects.length} accounts imported (enrichment will retry on next launch)`;
        }
      }, 500);
      
    } catch (error) {
      statusEl.textContent = 'Failed to import accounts. Please try again.';
      statusEl.className = 'eudia-setup-sf-status error';
      // Re-expand sidebar on error
      const importLeftSplit2 = (this.plugin.app.workspace as any).leftSplit;
      if (importLeftSplit2?.collapsed === false) {
        try { importLeftSplit2.expand(); } catch { /* ok */ }
      }
    }
  }

  private renderTranscribeStep(container: HTMLElement): void {
    const step = this.steps[2];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    
    // Step header
    const stepHeader = stepEl.createDiv({ cls: 'eudia-setup-step-header' });
    const stepNumber = stepHeader.createDiv({ cls: 'eudia-setup-step-number' });
    stepNumber.setText(step.status === 'complete' ? '' : '3');
    if (step.status === 'complete') stepNumber.addClass('eudia-step-complete');
    
    const stepInfo = stepHeader.createDiv({ cls: 'eudia-setup-step-info' });
    stepInfo.createEl('h3', { text: step.title });
    stepInfo.createEl('p', { text: step.description });
    
    // Step content - always show instructions
    const stepContent = stepEl.createDiv({ cls: 'eudia-setup-step-content' });
    
    const instructions = stepContent.createDiv({ cls: 'eudia-setup-instructions' });
    
    const instruction1 = instructions.createDiv({ cls: 'eudia-setup-instruction' });
    instruction1.createSpan({ cls: 'eudia-setup-instruction-icon', text: '🎙' });
    instruction1.createSpan({ text: 'Click the microphone icon in the left sidebar during a call' });
    
    const instruction2 = instructions.createDiv({ cls: 'eudia-setup-instruction' });
    instruction2.createSpan({ cls: 'eudia-setup-instruction-icon', text: '⌨' });
    instruction2.createSpan({ text: 'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"' });
    
    const instruction3 = instructions.createDiv({ cls: 'eudia-setup-instruction' });
    instruction3.createSpan({ cls: 'eudia-setup-instruction-icon', text: '📝' });
    instruction3.createSpan({ text: 'AI will summarize and extract key insights automatically' });
    
    if (step.status !== 'complete') {
      stepContent.createEl('p', {
        cls: 'eudia-setup-help-text muted',
        text: 'This step completes automatically after connecting to Salesforce and importing accounts.'
      });
    }
  }

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'eudia-setup-footer' });
    
    const allComplete = this.steps.every(s => s.status === 'complete');
    
    if (allComplete) {
      // Show completion message
      const completionMessage = footer.createDiv({ cls: 'eudia-setup-completion' });
      completionMessage.createEl('h2', { text: '🎉 You\'re all set!' });
      completionMessage.createEl('p', { text: 'Your sales vault is ready. Click below to start using Eudia.' });
      
      const finishBtn = footer.createEl('button', {
        text: 'Open Calendar →',
        cls: 'eudia-setup-btn primary large'
      });
      
      finishBtn.onclick = async () => {
        this.plugin.settings.setupCompleted = true;
        await this.plugin.saveSettings();
        
        // Close setup view and open calendar
        this.plugin.app.workspace.detachLeavesOfType(SETUP_VIEW_TYPE);
        await this.plugin.activateCalendarView();
      };
    } else {
      // Show skip option
      const skipBtn = footer.createEl('button', {
        text: 'Skip Setup (I\'ll do this later)',
        cls: 'eudia-setup-btn secondary'
      });
      
      skipBtn.onclick = async () => {
        // Mark as partially completed so we don't show again automatically
        this.plugin.settings.setupCompleted = true;
        await this.plugin.saveSettings();
        
        this.plugin.app.workspace.detachLeavesOfType(SETUP_VIEW_TYPE);
        new Notice('You can complete setup anytime from Settings → Eudia Sync');
      };
    }
    
    // Settings link
    const settingsLink = footer.createEl('a', {
      text: 'Advanced Settings',
      cls: 'eudia-setup-settings-link'
    });
    settingsLink.onclick = () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('eudia-sync');
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EUDIA CALENDAR VIEW - Beautiful Native Calendar Panel
// ═══════════════════════════════════════════════════════════════════════════

class EudiaCalendarView extends ItemView {
  plugin: EudiaSyncPlugin;
  private refreshInterval: number | null = null;
  private lastError: string | null = null;
  private showExternalOnly: boolean = true;
  private weeksBack: number = 2;

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

  private static readonly INTERNAL_SUBJECT_PATTERNS = [
    /^block\b/i, /\bblock\s+for\b/i, /\bcommute\b/i, /\bpersonal\b/i,
    /\blunch\b/i, /\bOOO\b/i, /\bout of office\b/i, /\bfocus time\b/i,
    /\bno meetings?\b/i, /\bmeeting free\b/i, /\btravel\b/i, /\beye appt\b/i,
    /\bdoctor\b/i, /\bdentist\b/i, /\bgym\b/i, /\bworkout\b/i
  ];

  private isExternalMeeting(meeting: CalendarMeeting): boolean {
    if (meeting.isCustomerMeeting) return true;
    if (!meeting.attendees || meeting.attendees.length === 0) return false;

    const userDomain = this.plugin.settings.userEmail?.split('@')[1] || 'eudia.com';
    const hasExternal = meeting.attendees.some(a => {
      if (a.isExternal === true) return true;
      if (a.isExternal === false) return false;
      if (!a.email) return false;
      const domain = a.email.split('@')[1]?.toLowerCase();
      return domain && domain !== userDomain.toLowerCase();
    });
    if (hasExternal) return true;

    for (const pattern of EudiaCalendarView.INTERNAL_SUBJECT_PATTERNS) {
      if (pattern.test(meeting.subject)) return false;
    }
    return false;
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
      (this as any)._forceRefresh = true;
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

    // Filter toggle row
    const filterRow = header.createDiv({ cls: 'eudia-calendar-filter-row' });
    filterRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;padding:4px 0;';

    const filterToggle = filterRow.createEl('button', {
      text: this.showExternalOnly ? 'External Only' : 'All Meetings',
      cls: 'eudia-filter-toggle'
    });
    filterToggle.style.cssText = `font-size:11px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid var(--background-modifier-border);background:${this.showExternalOnly ? 'var(--interactive-accent)' : 'var(--background-secondary)'};color:${this.showExternalOnly ? 'var(--text-on-accent)' : 'var(--text-muted)'};`;
    filterToggle.title = this.showExternalOnly ? 'Showing customer/external meetings only — click to show all' : 'Showing all meetings — click to filter to external only';
    filterToggle.onclick = async () => {
      this.showExternalOnly = !this.showExternalOnly;
      await this.render();
    };
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
      warning.innerHTML = `<strong>${userEmail}</strong> is not authorized for calendar access. Contact your admin.`;
    }
  }

  private async renderCalendarContent(container: HTMLElement): Promise<void> {
    const contentArea = container.createDiv({ cls: 'eudia-calendar-content' });
    
    const loadingEl = contentArea.createDiv({ cls: 'eudia-calendar-loading' });
    loadingEl.innerHTML = '<div class="eudia-spinner"></div><span>Loading meetings...</span>';

    try {
      const calendarService = new CalendarService(
        this.plugin.settings.serverUrl,
        this.plugin.settings.userEmail,
        this.plugin.settings.timezone || 'America/New_York'
      );
      
      const forceRefresh = (this as any)._forceRefresh || false;
      (this as any)._forceRefresh = false;

      // Fetch current week
      const weekData = await calendarService.getWeekMeetings(forceRefresh);
      if (!weekData.success) {
        loadingEl.remove();
        this.renderError(contentArea, weekData.error || 'Failed to load calendar');
        return;
      }

      // Fetch past meetings (2 weeks back by default)
      const now = new Date();
      const pastStart = new Date(now);
      pastStart.setDate(pastStart.getDate() - (this.weeksBack * 7));
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let pastMeetings: CalendarMeeting[] = [];
      try {
        pastMeetings = await calendarService.getMeetingsInRange(pastStart, yesterday);
      } catch {
        console.log('[Calendar] Could not fetch past meetings');
      }

      loadingEl.remove();

      // Build complete day map: past meetings + current week
      const allByDay: Record<string, CalendarMeeting[]> = {};

      for (const meeting of pastMeetings) {
        const day = meeting.start.split('T')[0];
        if (!allByDay[day]) allByDay[day] = [];
        allByDay[day].push(meeting);
      }

      for (const [day, meetings] of Object.entries(weekData.byDay || {})) {
        if (!allByDay[day]) allByDay[day] = [];
        const existingIds = new Set(allByDay[day].map(m => m.id));
        for (const m of meetings) {
          if (!existingIds.has(m.id)) allByDay[day].push(m);
        }
      }

      // Apply external-only filter
      const filteredByDay: Record<string, CalendarMeeting[]> = {};
      for (const [day, meetings] of Object.entries(allByDay)) {
        const filtered = this.showExternalOnly
          ? meetings.filter(m => this.isExternalMeeting(m))
          : meetings;
        if (filtered.length > 0) filteredByDay[day] = filtered;
      }

      const days = Object.keys(filteredByDay).sort();
      
      if (days.length === 0) {
        this.renderEmptyState(contentArea);
        return;
      }

      // Render "Now" indicator
      await this.renderCurrentMeeting(contentArea, calendarService);

      // "Load earlier" button
      const loadEarlierBtn = contentArea.createEl('button', { text: `← Load earlier meetings`, cls: 'eudia-load-earlier' });
      loadEarlierBtn.style.cssText = 'width:100%;padding:8px;margin-bottom:8px;font-size:12px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);';
      loadEarlierBtn.onclick = async () => {
        this.weeksBack += 2;
        await this.render();
      };

      // Find today's date key for visual anchor
      const todayKey = now.toISOString().split('T')[0];
      let todayAnchor: HTMLElement | null = null;

      // Render meetings by day
      for (const day of days) {
        const meetings = filteredByDay[day];
        if (!meetings || meetings.length === 0) continue;
        const section = this.renderDaySection(contentArea, day, meetings);
        if (day === todayKey) todayAnchor = section;
      }

      // Auto-scroll to today so past meetings are visible above
      if (todayAnchor) {
        setTimeout(() => todayAnchor!.scrollIntoView({ block: 'start', behavior: 'auto' }), 100);
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
        
        const nowAction = nowCard.createEl('button', { cls: 'eudia-now-action', text: 'Create Note' });
        nowAction.onclick = () => this.createNoteForMeeting(current.meeting!);
      }
    } catch (e) {
      // Silent fail - current meeting is optional
    }
  }

  private renderDaySection(container: HTMLElement, day: string, meetings: CalendarMeeting[]): HTMLElement {
    const section = container.createDiv({ cls: 'eudia-calendar-day' });

    const today = new Date().toISOString().split('T')[0];
    const isToday = day === today;
    const isPast = day < today;

    const headerText = isToday ? 'TODAY' : CalendarService.getDayName(day);
    const headerEl = section.createEl('div', { 
      cls: `eudia-calendar-day-header ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`,
      text: headerText
    });
    if (isToday) {
      headerEl.style.cssText = 'font-weight:700;color:var(--interactive-accent);';
    } else if (isPast) {
      headerEl.style.cssText = 'opacity:0.7;';
    }

    for (const meeting of meetings) {
      const meetingEl = section.createDiv({ 
        cls: `eudia-calendar-meeting ${meeting.isCustomerMeeting ? 'customer' : 'internal'} ${isPast ? 'past' : ''}`
      });
      if (isPast) meetingEl.style.cssText = 'opacity:0.85;';

      meetingEl.createEl('div', {
        cls: 'eudia-calendar-time',
        text: CalendarService.formatTime(meeting.start, this.plugin.settings.timezone)
      });

      const details = meetingEl.createDiv({ cls: 'eudia-calendar-details' });
      details.createEl('div', { cls: 'eudia-calendar-subject', text: meeting.subject });
      
      if (meeting.accountName) {
        details.createEl('div', { cls: 'eudia-calendar-account', text: meeting.accountName });
      } else if (meeting.attendees && meeting.attendees.length > 0) {
        const attendeeNames = meeting.attendees
          .filter(a => a.isExternal !== false)
          .slice(0, 2)
          .map(a => a.name || a.email?.split('@')[0] || 'Unknown')
          .join(', ');
        if (attendeeNames) {
          details.createEl('div', { cls: 'eudia-calendar-attendees', text: attendeeNames });
        }
      }

      meetingEl.onclick = () => this.createNoteForMeeting(meeting);
      meetingEl.title = 'Click to create meeting note';
    }
    return section;
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
    
    let icon = '';
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
        statusEl.textContent = 'Please use your @eudia.com email';
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
          statusEl.innerHTML = `<strong>${email}</strong> is not authorized. Contact your admin to be added.`;
          statusEl.className = 'eudia-setup-status error';
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          return;
        }
        
        // Save and refresh
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        
        statusEl.textContent = 'Connected';
        statusEl.className = 'eudia-setup-status success';
        
        // Scan local account folders (skip server sync - use only vault folders)
        this.plugin.scanLocalAccountFolders().catch(() => {});
        
        // Refresh view
        setTimeout(() => this.render(), 500);
        
      } catch (error) {
        const msg = error.message || 'Connection failed';
        if (msg.includes('403')) {
          statusEl.innerHTML = `<strong>${email}</strong> is not authorized for calendar access.`;
        } else {
          statusEl.textContent = msg;
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

  // ─────────────────────────────────────────────────────────────────────────
  // SMART ACCOUNT MATCHING METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract company name from a domain, handling subdomains intelligently
   * Examples:
   *   chsinc.com -> Chsinc
   *   mail.medtronic.com -> Medtronic  
   *   app.uber.com -> Uber
   *   john.smith@company.co.uk -> Company
   */
  private extractCompanyFromDomain(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    
    // Common subdomains/prefixes to skip
    const skipPrefixes = [
      'mail', 'email', 'app', 'portal', 'crm', 'www', 'smtp', 
      'sales', 'support', 'login', 'sso', 'auth', 'api', 'my'
    ];
    
    // Common TLDs and country codes
    const tlds = ['com', 'org', 'net', 'io', 'co', 'ai', 'gov', 'edu', 'uk', 'us', 'de', 'fr', 'jp', 'au', 'ca'];
    
    // Filter out TLDs and find the company part
    const nonTldParts = parts.filter(p => !tlds.includes(p) && p.length > 1);
    
    if (nonTldParts.length === 0) return parts[0] || '';
    
    // If first part is a common prefix, use the second part
    if (nonTldParts.length > 1 && skipPrefixes.includes(nonTldParts[0])) {
      return nonTldParts[1].charAt(0).toUpperCase() + nonTldParts[1].slice(1);
    }
    
    // Use the last non-TLD part (usually the company name)
    const companyPart = nonTldParts[nonTldParts.length - 1];
    return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
  }

  /**
   * Extract all external domains from attendees
   * Returns unique domains with company names extracted
   */
  private getExternalDomainsFromAttendees(attendees: { name: string; email: string }[]): Array<{ domain: string; company: string }> {
    if (!attendees || attendees.length === 0) return [];
    
    // Common email providers to ignore
    const commonProviders = [
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 
      'icloud.com', 'live.com', 'msn.com', 'aol.com', 'protonmail.com',
      'googlemail.com', 'mail.com', 'zoho.com', 'ymail.com'
    ];
    
    const seenDomains = new Set<string>();
    const results: Array<{ domain: string; company: string }> = [];
    
    for (const attendee of attendees) {
      if (!attendee.email) continue;
      const email = attendee.email.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      
      if (domainMatch) {
        const domain = domainMatch[1];
        // Skip internal and common providers
        if (domain.includes('eudia.com') || commonProviders.includes(domain)) continue;
        // Skip already seen domains
        if (seenDomains.has(domain)) continue;
        
        seenDomains.add(domain);
        const company = this.extractCompanyFromDomain(domain);
        if (company.length >= 2) {
          results.push({ domain, company });
        }
      }
    }
    
    return results;
  }

  /**
   * Find the best account match from multiple domain candidates
   * Scores each domain against account folders and returns the best match
   */
  private findBestAccountMatch(
    domains: Array<{ domain: string; company: string }>,
    serverAccountName?: string,
    subjectAccountName?: string
  ): { folder: string; accountName: string; source: string } | null {
    const accountsFolder = this.plugin.settings.accountsFolder || 'Accounts';
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    
    if (!(folder instanceof TFolder)) return null;
    
    // Get all account subfolders
    const subfolders: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        subfolders.push(child.name);
      }
    }
    
    if (subfolders.length === 0) return null;
    
    // Score each domain against folders
    const domainScores: Array<{ domain: string; company: string; folder: string | null; score: number }> = [];
    
    for (const { domain, company } of domains) {
      const matchedFolder = this.findAccountFolder(company);
      const score = matchedFolder ? 1.0 : 0;
      domainScores.push({ domain, company, folder: matchedFolder, score });
    }
    
    // Sort by score descending
    domainScores.sort((a, b) => b.score - a.score);
    
    // Return best domain match if found
    if (domainScores.length > 0 && domainScores[0].folder) {
      const best = domainScores[0];
      const folderName = best.folder.split('/').pop() || best.company;
      console.log(`[Eudia Calendar] Best domain match: "${best.company}" from ${best.domain} -> ${best.folder}`);
      return { folder: best.folder, accountName: folderName, source: 'domain' };
    }
    
    // Fallback: try server-provided account name
    if (serverAccountName) {
      const matchedFolder = this.findAccountFolder(serverAccountName);
      if (matchedFolder) {
        const folderName = matchedFolder.split('/').pop() || serverAccountName;
        console.log(`[Eudia Calendar] Server account match: "${serverAccountName}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: folderName, source: 'server' };
      }
    }
    
    // Fallback: try subject-extracted name
    if (subjectAccountName) {
      const matchedFolder = this.findAccountFolder(subjectAccountName);
      if (matchedFolder) {
        const folderName = matchedFolder.split('/').pop() || subjectAccountName;
        console.log(`[Eudia Calendar] Subject match: "${subjectAccountName}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: folderName, source: 'subject' };
      }
    }
    
    // No match found - try to match any domain company name loosely
    for (const { company } of domains) {
      // Try partial matches in folder names
      const partialMatch = subfolders.find(f => {
        const fLower = f.toLowerCase();
        const cLower = company.toLowerCase();
        return fLower.includes(cLower) || cLower.includes(fLower);
      });
      if (partialMatch) {
        const matchedFolder = `${accountsFolder}/${partialMatch}`;
        console.log(`[Eudia Calendar] Partial domain match: "${company}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: partialMatch, source: 'domain-partial' };
      }
    }
    
    return null;
  }

  /**
   * Extract company name from attendee email domains (legacy method for compatibility)
   * Returns the company name derived from the first external domain
   */
  private extractAccountFromAttendees(attendees: { name: string; email: string }[]): string | null {
    const domains = this.getExternalDomainsFromAttendees(attendees);
    if (domains.length === 0) return null;
    
    const bestDomain = domains[0];
    console.log(`[Eudia Calendar] Extracted company "${bestDomain.company}" from attendee domain ${bestDomain.domain}`);
    return bestDomain.company;
  }

  /**
   * Extract account name from meeting subject using common patterns
   * Examples:
   *   "CHS/Eudia - M&A Intro & Demo" -> "CHS"
   *   "Graybar/Eudia Weekly Check in" -> "Graybar"
   *   "Eudia - HATCo Connect | Intros" -> "HATCo"
   */
  private extractAccountFromSubject(subject: string): string | null {
    if (!subject) return null;
    
    // Pattern 1: "CompanyName/Eudia" or "Eudia/CompanyName"
    const slashPattern = subject.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);
    if (slashPattern) {
      const match = (slashPattern[1] || slashPattern[2] || '').trim();
      if (match.toLowerCase() !== 'eudia') return match;
    }
    
    // Pattern 2: "Eudia - CompanyName" or "CompanyName - Eudia"
    const dashPattern = subject.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);
    if (dashPattern) {
      const match = (dashPattern[1] || dashPattern[2] || '').trim();
      // Clean up trailing descriptors like "Connect", "Weekly", etc.
      const cleaned = match.replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i, '').trim();
      if (cleaned.toLowerCase() !== 'eudia' && cleaned.length > 0) return cleaned;
    }
    
    // Pattern 3: Just "CompanyName - something" (if no Eudia in pattern)
    if (!subject.toLowerCase().includes('eudia')) {
      const simplePattern = subject.match(/^([^-–|]+)/);
      if (simplePattern) {
        const match = simplePattern[1].trim();
        if (match.length > 2 && match.length < 50) return match;
      }
    }
    
    return null;
  }

  /**
   * Find matching account folder in the vault
   * Uses multiple matching strategies for robustness
   * Returns the full path if found, null otherwise
   */
  private findAccountFolder(accountName: string): string | null {
    if (!accountName) return null;
    
    const accountsFolder = this.plugin.settings.accountsFolder || 'Accounts';
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    
    if (!(folder instanceof TFolder)) {
      console.log(`[Eudia Calendar] Accounts folder "${accountsFolder}" not found`);
      return null;
    }
    
    const normalizedSearch = accountName.toLowerCase().trim();
    
    // Get all subfolders in Accounts
    const subfolders: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        subfolders.push(child.name);
      }
    }
    
    console.log(`[Eudia Calendar] Searching for "${normalizedSearch}" in ${subfolders.length} folders`);
    
    // Strategy 1: Exact match
    const exactMatch = subfolders.find(f => f.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      console.log(`[Eudia Calendar] Exact match found: ${exactMatch}`);
      return `${accountsFolder}/${exactMatch}`;
    }
    
    // Strategy 2: Folder starts with search term (e.g., "uber" matches "Uber Technologies")
    const folderStartsWith = subfolders.find(f => f.toLowerCase().startsWith(normalizedSearch));
    if (folderStartsWith) {
      console.log(`[Eudia Calendar] Folder starts with match: ${folderStartsWith}`);
      return `${accountsFolder}/${folderStartsWith}`;
    }
    
    // Strategy 3: Search term starts with folder name (e.g., "chsinc" starts with "chs")
    // This handles domain names like chsinc.com matching folder CHS
    const searchStartsWith = subfolders.find(f => normalizedSearch.startsWith(f.toLowerCase()));
    if (searchStartsWith) {
      console.log(`[Eudia Calendar] Search starts with folder match: ${searchStartsWith}`);
      return `${accountsFolder}/${searchStartsWith}`;
    }
    
    // Strategy 4: Search term contains folder name (e.g., "ubertechnologies" contains "uber")
    const searchContains = subfolders.find(f => {
      const folderLower = f.toLowerCase();
      // Only match if folder name is at least 3 chars to avoid false positives
      return folderLower.length >= 3 && normalizedSearch.includes(folderLower);
    });
    if (searchContains) {
      console.log(`[Eudia Calendar] Search contains folder match: ${searchContains}`);
      return `${accountsFolder}/${searchContains}`;
    }
    
    // Strategy 5: Folder name contains search term
    const folderContains = subfolders.find(f => {
      const folderLower = f.toLowerCase();
      return normalizedSearch.length >= 3 && folderLower.includes(normalizedSearch);
    });
    if (folderContains) {
      console.log(`[Eudia Calendar] Folder contains search match: ${folderContains}`);
      return `${accountsFolder}/${folderContains}`;
    }
    
    console.log(`[Eudia Calendar] No folder match found for "${normalizedSearch}"`);
    return null;
  }

  async createNoteForMeeting(meeting: CalendarMeeting): Promise<void> {
    const dateStr = meeting.start.split('T')[0];
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE MEETING DETECTION - before account matching
    // ─────────────────────────────────────────────────────────────────────────
    const userEmail = (this.plugin.settings as any).eudiaEmail || '';
    const isPipelineAdmin = isAdminUser(userEmail);
    const attendeeEmails = (meeting.attendees || []).map(a => a.email).filter(Boolean);
    const pipelineDetection = detectPipelineMeeting(meeting.subject, attendeeEmails);
    
    if (isPipelineAdmin && pipelineDetection.isPipelineMeeting && pipelineDetection.confidence >= 60) {
      await this._createPipelineNote(meeting, dateStr);
      return;
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STANDARD: ENHANCED SMART ACCOUNT MATCHING - Domain-first with scoring
    // ─────────────────────────────────────────────────────────────────────────
    const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr} - ${safeName}.md`;
    
    let targetFolder: string | null = null;
    let matchedAccountName: string | null = meeting.accountName || null;
    let matchedAccountId: string | null = null;
    
    console.log(`[Eudia Calendar] === Creating note for meeting: "${meeting.subject}" ===`);
    console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(meeting.attendees?.map(a => a.email) || [])}`);
    
    // Extract all external domains from attendees
    const externalDomains = this.getExternalDomainsFromAttendees(meeting.attendees || []);
    console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(externalDomains)}`);
    
    // Extract subject-based account name as fallback
    const subjectAccountName = this.extractAccountFromSubject(meeting.subject);
    console.log(`[Eudia Calendar] Subject-extracted name: "${subjectAccountName || 'none'}"`);
    
    // Use unified matching that scores all options
    const bestMatch = this.findBestAccountMatch(
      externalDomains,
      meeting.accountName,
      subjectAccountName || undefined
    );
    
    if (bestMatch) {
      targetFolder = bestMatch.folder;
      matchedAccountName = bestMatch.accountName;
      console.log(`[Eudia Calendar] Best match (${bestMatch.source}): "${matchedAccountName}" -> ${targetFolder}`);
    }
    
    // FALLBACK: Use Accounts folder root if no match found (DO NOT create new folders)
    if (!targetFolder) {
      const accountsFolder = this.plugin.settings.accountsFolder || 'Accounts';
      const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
      if (folder instanceof TFolder) {
        targetFolder = accountsFolder;
        console.log(`[Eudia Calendar] No match found, using Accounts root: ${targetFolder}`);
      }
    }
    
    // Try to find account ID from cached accounts
    if (matchedAccountName) {
      const cachedAccount = this.plugin.settings.cachedAccounts.find(
        a => a.name.toLowerCase() === matchedAccountName?.toLowerCase()
      );
      if (cachedAccount) {
        matchedAccountId = cachedAccount.id;
        matchedAccountName = cachedAccount.name; // Use canonical name from Salesforce
        console.log(`[Eudia Calendar] Matched to cached account: ${cachedAccount.name} (${cachedAccount.id})`);
      }
    }
    
    // Build full file path
    const filePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
    
    // Check if file already exists
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      // Reveal in file explorer so user sees it under the matched account folder
      try {
        const fileExplorer = (this.app as any).internalPlugins?.getPluginById?.('file-explorer')?.instance;
        if (fileExplorer?.revealInFolder) fileExplorer.revealInFolder(existing);
      } catch { /* file explorer API may vary */ }
      new Notice(`Opened existing note: ${fileName}`);
      return;
    }
    
    const attendeeList = (meeting.attendees || [])
      .map(a => a.name || a.email?.split('@')[0] || 'Unknown')
      .slice(0, 5)
      .join(', ');

    const template = `---
title: "${meeting.subject}"
date: ${dateStr}
attendees: [${attendeeList}]
account: "${matchedAccountName || ''}"
account_id: "${matchedAccountId || ''}"
meeting_start: ${meeting.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${meeting.subject}

## Attendees
${(meeting.attendees || []).map(a => `- ${a.name || a.email}`).join('\n')}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` → **"Transcribe Meeting"**

---

`;

    try {
      const file = await this.app.vault.create(filePath, template);
      await this.app.workspace.getLeaf().openFile(file);
      // Reveal in file explorer — auto-scroll and expand the matched account folder
      try {
        const fileExplorer = (this.app as any).internalPlugins?.getPluginById?.('file-explorer')?.instance;
        if (fileExplorer?.revealInFolder) fileExplorer.revealInFolder(file);
      } catch { /* file explorer API may vary */ }
      new Notice(`Created: ${filePath}`);
    } catch (e) {
      console.error('[Eudia Calendar] Failed to create note:', e);
      new Notice(`Could not create note: ${e.message || 'Unknown error'}`);
    }
  }

  /**
   * Create a pipeline meeting note with auto-naming in Pipeline Meetings folder
   */
  private async _createPipelineNote(meeting: CalendarMeeting, dateStr: string): Promise<void> {
    // Format date as MM.DD.YY
    const d = new Date(dateStr + 'T00:00:00');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const formattedDate = `${mm}.${dd}.${yy}`;
    
    const fileName = `Team Pipeline Meeting - ${formattedDate}.md`;
    const folderPath = 'Pipeline Meetings';
    
    // Ensure folder exists
    const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existingFolder) {
      await this.app.vault.createFolder(folderPath);
    }
    
    const filePath = `${folderPath}/${fileName}`;
    
    // Check if file already exists
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      try {
        const fileExplorer = (this.app as any).internalPlugins?.getPluginById?.('file-explorer')?.instance;
        if (fileExplorer?.revealInFolder) fileExplorer.revealInFolder(existing);
      } catch { /* file explorer API may vary */ }
      new Notice(`Opened existing: ${fileName}`);
      return;
    }
    
    const attendeeNames = (meeting.attendees || [])
      .map(a => a.name || a.email?.split('@')[0] || 'Unknown');
    
    const template = `---
title: "Team Pipeline Meeting - ${formattedDate}"
date: ${dateStr}
attendees: [${attendeeNames.slice(0, 10).join(', ')}]
meeting_type: pipeline_review
meeting_start: ${meeting.start}
transcribed: false
---

# Weekly Pipeline Review | ${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}

## Attendees
${attendeeNames.map(a => `- ${a}`).join('\n')}

---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` → **"Transcribe Meeting"**

After transcription, this note will be automatically formatted with:
- **Priority Actions** grouped by urgency
- **BL Deal Context** with commit totals
- **Per-BL Account Tables** (Account | Status | Next Action)
- **Growth & Cross-Team Updates**

---

`;

    try {
      const file = await this.app.vault.create(filePath, template);
      await this.app.workspace.getLeaf().openFile(file);
      try {
        const fileExplorer = (this.app as any).internalPlugins?.getPluginById?.('file-explorer')?.instance;
        if (fileExplorer?.revealInFolder) fileExplorer.revealInFolder(file);
      } catch { /* file explorer API may vary */ }
      new Notice(`Created pipeline note: ${fileName}`);
      console.log(`[Eudia Pipeline] Created pipeline meeting note: ${filePath}`);
    } catch (e) {
      console.error('[Eudia Pipeline] Failed to create pipeline note:', e);
      new Notice(`Could not create pipeline note: ${e.message || 'Unknown error'}`);
    }
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
  private micRibbonIcon: HTMLElement | null = null;
  
  // Live query support - accumulated transcript during recording
  private liveTranscript: string = '';
  private liveTranscriptChunkInterval: NodeJS.Timeout | null = null;
  private isTranscribingChunk: boolean = false;

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl
    );
    
    this.calendarService = new CalendarService(
      this.settings.serverUrl,
      this.settings.userEmail,
      this.settings.timezone || 'America/New_York'
    );
    
    this.smartTagService = new SmartTagService();

    // Pre-configure system audio capture (non-blocking, runs once)
    AudioRecorder.setupDisplayMediaHandler().then(ok => {
      if (ok) console.log('[Eudia] System audio: loopback handler ready');
      else console.log('[Eudia] System audio: handler not available, will try other strategies on record');
    }).catch(() => {});

    // Check for plugin updates on startup (non-blocking, retries on failure)
    setTimeout(() => this.checkForPluginUpdate(), 5000);

    // Periodic update check every 30 minutes
    this.registerInterval(
      window.setInterval(() => this.checkForPluginUpdate(), 30 * 60 * 1000)
    );

    // Register calendar view
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new EudiaCalendarView(leaf, this)
    );

    // Register setup view
    this.registerView(
      SETUP_VIEW_TYPE,
      (leaf) => new EudiaSetupView(leaf, this)
    );

    // Add ribbon icons
    this.addRibbonIcon('calendar', 'Open Calendar', () => this.activateCalendarView());
    
    this.micRibbonIcon = this.addRibbonIcon('microphone', 'Transcribe Meeting', async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    });

    // GTM Brain - one-click access to intelligence queries
    this.addRibbonIcon('message-circle', 'Ask GTM Brain', () => {
      this.openIntelligenceQueryForCurrentNote();
    });

    // Auto-template: when user creates a new note inside an account folder,
    // auto-name it "Note N - Feb 17" and populate frontmatter with account_id
    this.registerEvent(
      this.app.vault.on('create', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        
        const accountsFolder = this.settings.accountsFolder || 'Accounts';
        if (!file.path.startsWith(accountsFolder + '/')) return;
        
        // Only intercept files named "Untitled" (Obsidian default)
        if (!file.basename.startsWith('Untitled')) return;
        
        // Extract account info from path: Accounts/CompanyName/Untitled.md
        const pathParts = file.path.split('/');
        if (pathParts.length < 3) return;
        const accountName = pathParts[1];
        const accountFolder = pathParts.slice(0, 2).join('/');
        
        // Find account_id from sibling files (Contacts.md or Note 1.md have it in frontmatter)
        let accountId = '';
        const siblingPaths = ['Contacts.md', 'Note 1.md', 'Intelligence.md'];
        for (const sib of siblingPaths) {
          const sibFile = this.app.vault.getAbstractFileByPath(`${accountFolder}/${sib}`);
          if (sibFile instanceof TFile) {
            try {
              const content = await this.app.vault.read(sibFile);
              const idMatch = content.match(/account_id:\s*"?([^"\n]+)"?/);
              if (idMatch) { accountId = idMatch[1].trim(); break; }
            } catch { /* skip */ }
          }
        }
        
        // Count existing Note N files to determine next number
        const folder = this.app.vault.getAbstractFileByPath(accountFolder);
        let maxNote = 0;
        if (folder && (folder as any).children) {
          for (const child of (folder as any).children) {
            const match = child.name?.match(/^Note\s+(\d+)/i);
            if (match) maxNote = Math.max(maxNote, parseInt(match[1]));
          }
        }
        const nextNum = maxNote + 1;
        const today = new Date();
        const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dateStr = today.toISOString().split('T')[0];
        const newName = `Note ${nextNum} - ${dateLabel}.md`;
        
        // Build template content
        const template = `---
account: "${accountName}"
account_id: "${accountId}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${accountName} - Meeting Note

**Date:** ${dateLabel}
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`;
        
        // Rename and populate
        try {
          const newPath = `${accountFolder}/${newName}`;
          await this.app.vault.modify(file, template);
          await this.app.fileManager.renameFile(file, newPath);
          console.log(`[Eudia] Auto-templated: ${newPath} (account_id: ${accountId})`);
        } catch (e) {
          console.warn('[Eudia] Auto-template failed:', e);
        }
      })
    );

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

    this.addCommand({
      id: 'ask-gtm-brain',
      name: 'Ask gtm-brain',
      callback: () => this.openIntelligenceQueryForCurrentNote()
    });

    this.addCommand({
      id: 'copy-for-slack',
      name: 'Copy Note for Slack',
      callback: () => this.copyForSlack()
    });

    this.addCommand({
      id: 'check-for-updates',
      name: 'Check for Eudia Updates',
      callback: async () => {
        new Notice('Checking for updates...', 3000);
        const localVersion = this.manifest?.version || '?';
        try {
          const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';
          const resp = await requestUrl({ url: `${serverUrl}/api/plugin/version` });
          const remoteVersion = resp.json?.currentVersion || '?';
          if (resp.json?.success && remoteVersion !== localVersion) {
            const remote = remoteVersion.split('.').map(Number);
            const local = localVersion.split('.').map(Number);
            let needsUpdate = false;
            for (let i = 0; i < 3; i++) {
              if ((remote[i] || 0) > (local[i] || 0)) { needsUpdate = true; break; }
              if ((remote[i] || 0) < (local[i] || 0)) break;
            }
            if (needsUpdate) {
              new Notice(`Updating v${localVersion} → v${remoteVersion}...`, 5000);
              await this.performAutoUpdate(serverUrl, remoteVersion, localVersion);
            } else {
              new Notice(`Eudia is up to date (v${localVersion}).`, 5000);
            }
          } else {
            new Notice(`Eudia is up to date (v${localVersion}).`, 5000);
          }
        } catch (e: any) {
          new Notice(`Update check failed: ${e.message || 'server unreachable'}. Current: v${localVersion}`, 8000);
        }
      }
    });

    this.addCommand({
      id: 'test-system-audio',
      name: 'Test System Audio Capture',
      callback: async () => {
        new Notice('Probing system audio capabilities...', 3000);
        try {
          const probe = await AudioRecorder.probeSystemAudioCapabilities();
          const lines = [
            `Platform: ${probe.platform}`,
            `Electron: ${probe.electronVersion || 'N/A'} | Chromium: ${probe.chromiumVersion || 'N/A'}`,
            `desktopCapturer: ${probe.desktopCapturerAvailable ? `YES (${probe.desktopCapturerSources} sources)` : 'no'}`,
            `@electron/remote: ${probe.remoteAvailable ? 'YES' : 'no'} | session: ${probe.remoteSessionAvailable ? 'YES' : 'no'}`,
            `ipcRenderer: ${probe.ipcRendererAvailable ? 'YES' : 'no'}`,
            `getDisplayMedia: ${probe.getDisplayMediaAvailable ? 'YES' : 'no'}`,
            `Handler setup: ${probe.handlerSetupResult}`,
            '',
            `Best path: ${probe.bestPath}`,
          ];
          new Notice(lines.join('\n'), 20000);
          console.log('[Eudia] System audio probe:', JSON.stringify(probe, null, 2));
        } catch (err: any) {
          new Notice(`Probe failed: ${err.message}`, 5000);
        }
      }
    });

    this.addCommand({
      id: 'enrich-accounts',
      name: 'Enrich Account Folders with Salesforce Data',
      callback: async () => {
        if (!this.settings.userEmail) {
          new Notice('Please set up your email first.');
          return;
        }
        const ownershipService = new AccountOwnershipService(this.settings.serverUrl);
        let result: { accounts: OwnedAccount[]; prospects: OwnedAccount[] };
        if (isCSUser(this.settings.userEmail)) {
          result = await ownershipService.getCSAccounts(this.settings.userEmail);
        } else {
          result = await ownershipService.getAccountsWithProspects(this.settings.userEmail);
        }
        const all = [...result.accounts, ...result.prospects];
        if (all.length === 0) {
          new Notice('No accounts found to enrich.');
          return;
        }
        await this.enrichAccountFolders(all);
      }
    });

    this.addCommand({
      id: 'refresh-analytics',
      name: 'Refresh Analytics Dashboard',
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          await this.refreshAnalyticsDashboard(file);
        } else {
          new Notice('No active file');
        }
      }
    });

    this.addCommand({
      id: 'live-query-transcript',
      name: 'Query Current Transcript (Live)',
      callback: async () => {
        if (!this.audioRecorder?.isRecording()) {
          new Notice('No active recording. Start recording first to use live query.');
          return;
        }
        if (!this.liveTranscript || this.liveTranscript.length < 50) {
          new Notice('Not enough transcript captured yet. Keep recording for a few more minutes.');
          return;
        }
        this.openLiveQueryModal();
      }
    });

    // SF Sync status bar
    this.sfSyncStatusBarEl = this.addStatusBarItem();
    this.sfSyncStatusBarEl.setText('SF Sync: Idle');
    this.sfSyncStatusBarEl.addClass('eudia-sf-sync-status');

    // Add settings tab
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));

    // Register account suggester
    this.registerEditorSuggest(new AccountSuggester(this.app, this));

    // On layout ready
    this.app.workspace.onLayoutReady(async () => {
      // Show setup view for new users (full-page onboarding)
      // This runs after plugin trust, so we always check and redirect
      if (!this.settings.setupCompleted) {
        // Small delay to ensure any settings dialogs have opened
        await new Promise(r => setTimeout(r, 100));
        
        // Close settings modal if open (user just trusted plugins)
        const settingModal = document.querySelector('.modal-container .modal');
        if (settingModal) {
          // Settings modal is open - close it and show setup
          const closeBtn = settingModal.querySelector('.modal-close-button') as HTMLElement;
          if (closeBtn) closeBtn.click();
        }
        
        // Open the setup view in the main content area
        await this.activateSetupView();
      } else if (this.settings.syncOnStartup) {
        // Scan local folders instead of syncing from server
        await this.scanLocalAccountFolders();
        
        // Startup sync: Use new BL accounts endpoint for dynamic folder sync
        // Runs on startup if enabled, and daily to check for changes
        if (this.settings.userEmail && this.settings.syncAccountsOnStartup) {
          const today = new Date().toISOString().split('T')[0];
          const shouldSync = this.settings.lastAccountRefreshDate !== today;
          
          if (shouldSync) {
            // Non-blocking sync after initial load
            setTimeout(async () => {
              try {
                console.log('[Eudia] Startup account sync - checking for changes...');
                const result = await this.syncAccountFolders();
                
                if (result.success) {
                  this.settings.lastAccountRefreshDate = today;
                  await this.saveSettings();
                  
                  if (result.added > 0 || result.archived > 0) {
                    const parts = [];
                    if (result.added > 0) parts.push(`${result.added} added`);
                    if (result.archived > 0) parts.push(`${result.archived} archived`);
                    new Notice(`Account folders synced: ${parts.join(', ')}`);
                  }
                } else {
                  console.log('[Eudia] Sync failed:', result.error);
                }
              } catch (e) {
                // Silently skip if server is unreachable - will retry tomorrow
                console.log('[Eudia] Startup sync skipped (server unreachable), will retry tomorrow');
              }
            }, 2000); // 2 second delay for non-blocking startup
          }
        }
        
        // Activate calendar view if configured
        if (this.settings.showCalendarView && this.settings.userEmail) {
          await this.activateCalendarView();
        }
        
        // Auto-enrich unenriched account folders (non-blocking, background)
        if (this.settings.userEmail && this.settings.cachedAccounts.length > 0) {
          setTimeout(async () => {
            try {
              await this.checkAndAutoEnrich();
            } catch (e) {
              console.log('[Eudia] Auto-enrich skipped (server unreachable)');
            }
          }, 5000); // 5 second delay to avoid startup congestion
        }
        
        // Send heartbeat and check for pushed config (non-blocking)
        if (this.settings.userEmail && this.telemetry) {
          setTimeout(async () => {
            try {
              // Count account folders
              const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
              let accountCount = 0;
              if (accountsFolder && accountsFolder instanceof TFolder) {
                accountCount = accountsFolder.children.filter(
                  c => c instanceof TFolder && !c.name.startsWith('_')
                ).length;
              }
              
              // Get connection status
              const connections = {
                salesforce: this.settings.salesforceConnected ? 'connected' : 'not_configured',
                calendar: this.settings.calendarConfigured ? 'connected' : 'not_configured'
              };
              
              // Send heartbeat (response includes latestVersion for update check)
              const heartbeatResp = await this.telemetry.sendHeartbeat(accountCount, connections);
              if (heartbeatResp?.latestVersion) {
                const remote = heartbeatResp.latestVersion.split('.').map(Number);
                const local = (this.manifest?.version || '0.0.0').split('.').map(Number);
                let needsUpdate = false;
                for (let i = 0; i < 3; i++) {
                  if ((remote[i] || 0) > (local[i] || 0)) { needsUpdate = true; break; }
                  if ((remote[i] || 0) < (local[i] || 0)) break;
                }
                if (needsUpdate) {
                  console.log(`[Eudia Update] Heartbeat detected update: v${this.manifest?.version} → v${heartbeatResp.latestVersion}`);
                  const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';
                  await this.performAutoUpdate(serverUrl, heartbeatResp.latestVersion, this.manifest?.version || '0.0.0');
                }
              }
              
              // Check for pushed config from admin
              const pushedUpdates = await this.telemetry.checkForPushedConfig();
              if (pushedUpdates.length > 0) {
                let settingsChanged = false;
                for (const update of pushedUpdates) {
                  if (update.key && this.settings.hasOwnProperty(update.key)) {
                    (this.settings as any)[update.key] = update.value;
                    settingsChanged = true;
                    console.log(`[Eudia] Applied pushed config: ${update.key} = ${update.value}`);
                  }
                }
                if (settingsChanged) {
                  await this.saveSettings();
                  new Notice('Settings updated by admin');
                }
              }
              
              // Check for sync flags (resync_accounts, etc.)
              await this.checkAndConsumeSyncFlags();

              // Start the Salesforce auto-sync scanner (periodic background sync)
              this.startSalesforceSyncScanner();
            } catch (e) {
              // Silently ignore - heartbeat is optional
              console.log('[Eudia] Heartbeat/config check skipped');
              // Still start the SF sync scanner even if heartbeat fails
              this.startSalesforceSyncScanner();
            }
          }, 3000); // 3 second delay after other startup tasks
        } else {
          // No telemetry, but still start the SF sync scanner
          if (this.settings.sfAutoSyncEnabled && this.settings.salesforceConnected) {
            setTimeout(() => this.startSalesforceSyncScanner(), 5000);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // AUTO-REFRESH ANALYTICS DASHBOARDS
      // ═══════════════════════════════════════════════════════════════════════════
      // Listen for file opens and auto-refresh analytics dashboard notes
      this.app.workspace.on('file-open', async (file: TFile | null) => {
        if (!file) return;
        
        // Check if this is an analytics dashboard note (by folder or frontmatter)
        if (file.path.includes('_Analytics/') || file.path.includes('_Customer Health/')) {
          try {
            const content = await this.app.vault.read(file);
            if (content.includes('type: analytics_dashboard')) {
              // Check if we should refresh (once per hour max)
              const lastUpdatedMatch = content.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/);
              const lastUpdated = lastUpdatedMatch?.[1];
              const today = new Date().toISOString().split('T')[0];
              
              if (lastUpdated !== today) {
                console.log(`[Eudia] Auto-refreshing analytics: ${file.name}`);
                await this.refreshAnalyticsDashboard(file);
              }
            }
          } catch (e) {
            // Ignore errors during auto-refresh
          }
        }
      });
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }

  private _updateRetryCount = 0;
  private static readonly MAX_UPDATE_RETRIES = 3;
  private static readonly UPDATE_RETRY_DELAYS = [15000, 45000, 90000]; // 15s, 45s, 90s

  /**
   * Check the server for a newer plugin version with retry logic.
   * Retries up to 3 times with increasing delays if the check fails.
   */
  private async checkForPluginUpdate(): Promise<void> {
    const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';
    const localVersion = this.manifest?.version || '0.0.0';

    for (let attempt = 0; attempt <= EudiaPlugin.MAX_UPDATE_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = EudiaPlugin.UPDATE_RETRY_DELAYS[attempt - 1] || 90000;
          console.log(`[Eudia Update] Retry ${attempt}/${EudiaPlugin.MAX_UPDATE_RETRIES} in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        }

        const resp = await requestUrl({
          url: `${serverUrl}/api/plugin/version`,
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!resp.json?.success || !resp.json?.currentVersion) {
          console.log(`[Eudia Update] Version endpoint returned unexpected data:`, resp.json);
          continue;
        }

        const remoteVersion = resp.json.currentVersion;
        const remote = remoteVersion.split('.').map(Number);
        const local = localVersion.split('.').map(Number);

        let needsUpdate = false;
        for (let i = 0; i < 3; i++) {
          if ((remote[i] || 0) > (local[i] || 0)) { needsUpdate = true; break; }
          if ((remote[i] || 0) < (local[i] || 0)) break;
        }

        if (needsUpdate) {
          console.log(`[Eudia Update] v${remoteVersion} available (current: v${localVersion})`);
          await this.performAutoUpdate(serverUrl, remoteVersion, localVersion);
        } else {
          console.log(`[Eudia Update] Up to date (v${localVersion})`);
        }
        return; // success — stop retrying
      } catch (e) {
        console.log(`[Eudia Update] Check failed (attempt ${attempt + 1}):`, (e as Error).message || e);
      }
    }
    console.log('[Eudia Update] All retry attempts exhausted — will try again on next cycle');
  }

  /**
   * Download latest plugin files, validate, write to disk, and hot-reload.
   * Never interrupts an active recording. Never deletes user data.
   */
  private async performAutoUpdate(serverUrl: string, remoteVersion: string, localVersion: string): Promise<void> {
    try {
      if (this.audioRecorder?.isRecording()) {
        new Notice(`Eudia v${remoteVersion} available — will update after your recording.`, 8000);
        return;
      }

      const pluginDir = this.manifest.dir;
      if (!pluginDir) {
        console.log('[Eudia Update] Cannot determine plugin directory');
        return;
      }

      const adapter = this.app.vault.adapter;
      console.log(`[Eudia Update] Downloading v${remoteVersion}...`);

      const [mainJsResp, manifestResp, stylesResp] = await Promise.all([
        requestUrl({ url: `${serverUrl}/api/plugin/main.js` }),
        requestUrl({ url: `${serverUrl}/api/plugin/manifest.json` }),
        requestUrl({ url: `${serverUrl}/api/plugin/styles.css` }),
      ]);

      const mainJsText = mainJsResp.text;
      const manifestText = manifestResp.text;
      const stylesText = stylesResp.text;

      // Per-file validation thresholds (manifest is ~370 bytes, styles ~45KB, main ~300KB)
      const validations: Array<[string, string, number, number]> = [
        ['main.js', mainJsText, 10000, 5 * 1024 * 1024],
        ['manifest.json', manifestText, 50, 10000],
        ['styles.css', stylesText, 100, 500000],
      ];

      for (const [name, content, minSize, maxSize] of validations) {
        if (!content || content.length < minSize || content.length > maxSize) {
          console.log(`[Eudia Update] ${name} validation failed (${content?.length ?? 0} bytes, need ${minSize}-${maxSize})`);
          return;
        }
      }

      // Verify the downloaded manifest has the expected version
      try {
        const downloadedManifest = JSON.parse(manifestText);
        if (downloadedManifest.version !== remoteVersion) {
          console.log(`[Eudia Update] Version mismatch: expected ${remoteVersion}, got ${downloadedManifest.version}`);
          return;
        }
      } catch {
        console.log('[Eudia Update] Downloaded manifest is not valid JSON');
        return;
      }

      // Backup current main.js (safety net — never lose a working version)
      try {
        const currentMainJs = await adapter.read(`${pluginDir}/main.js`);
        await adapter.write(`${pluginDir}/main.js.bak`, currentMainJs);
      } catch { /* first install — no backup needed */ }

      // Write new files (ONLY plugin code — never touches notes, accounts, or data.json)
      await adapter.write(`${pluginDir}/main.js`, mainJsText);
      await adapter.write(`${pluginDir}/manifest.json`, manifestText);
      await adapter.write(`${pluginDir}/styles.css`, stylesText);
      console.log(`[Eudia Update] Files written: v${localVersion} → v${remoteVersion}`);

      // Report successful update
      try {
        requestUrl({
          url: `${serverUrl}/api/plugin/telemetry`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'info',
            message: `Auto-updated v${localVersion} → v${remoteVersion}`,
            userEmail: this.settings.userEmail || 'anonymous',
            pluginVersion: remoteVersion,
            platform: 'obsidian'
          })
        }).catch(() => {});
      } catch {}

      // Hot-reload: disable → re-enable plugin (reloads main.js from disk)
      if (!this.audioRecorder?.isRecording()) {
        new Notice(`Eudia updating to v${remoteVersion}...`, 3000);
        setTimeout(async () => {
          try {
            const plugins = (this.app as any).plugins;
            await plugins.disablePlugin(this.manifest.id);
            await plugins.enablePlugin(this.manifest.id);
            console.log(`[Eudia Update] Hot-reloaded: v${localVersion} → v${remoteVersion}`);
            new Notice(`Eudia v${remoteVersion} active.`, 5000);
          } catch {
            new Notice(`Eudia updated to v${remoteVersion}. Restart Obsidian to apply.`, 10000);
          }
        }, 1500);
      } else {
        new Notice(`Eudia v${remoteVersion} downloaded — will apply after recording.`, 10000);
      }
    } catch (e) {
      console.log('[Eudia Update] Update failed:', (e as Error).message || e);
    }
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

  /**
   * Open the setup view in the main content area
   * This provides a full-page onboarding experience for new users
   */
  async activateSetupView(): Promise<void> {
    const workspace = this.app.workspace;
    const leaves = workspace.getLeavesOfType(SETUP_VIEW_TYPE);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      // Open in the main content area (not sidebar)
      const leaf = workspace.getLeaf(true);
      if (leaf) {
        await leaf.setViewState({ type: SETUP_VIEW_TYPE, active: true });
        workspace.revealLeaf(leaf);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAILORED ACCOUNT FOLDER CREATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create account folders for the user's owned accounts only.
   * This provides a tailored vault experience based on account ownership.
   * @param accounts List of accounts to create folders for
   * @param enrichments Optional map of account ID -> enrichment data from /api/accounts/enrich-batch
   */
  async createTailoredAccountFolders(
    accounts: OwnedAccount[],
    enrichments?: Record<string, { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string }>
  ): Promise<void> {
    const accountsFolder = this.settings.accountsFolder || 'Accounts';
    
    // Ensure the main Accounts folder exists
    const existingFolder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!existingFolder) {
      await this.app.vault.createFolder(accountsFolder);
    }

    let createdCount = 0;
    const dateStr = new Date().toISOString().split('T')[0];

    // Helper: create a single account folder with all subnotes
    const createSingleAccount = async (account: OwnedAccount) => {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      
      // Check if folder already exists
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) {
        console.log(`[Eudia] Account folder already exists: ${safeName}`);
        return false;
      }
      
      try {
        // Create the account folder
        await this.app.vault.createFolder(folderPath);
        
        // Lookup enrichment data for this account (if available)
        const enrich = enrichments?.[account.id];
        const hasEnrichment = !!enrich;

        // ── Build Contacts.md content ──
        const contactsContent = this.buildContactsContent(account, enrich, dateStr);

        // ── Build Intelligence.md content ──
        const intelligenceContent = this.buildIntelligenceContent(account, enrich, dateStr);

        // ── Build Meeting Notes.md content (with opportunities + recent activity if available) ──
        const meetingNotesContent = this.buildMeetingNotesContent(account, enrich);

        // ── Build Next Steps.md content ──
        const nextStepsContent = this.buildNextStepsContent(account, enrich, dateStr);

        const subnotes = [
          {
            name: 'Note 1.md',
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Note 2.md',
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Note 3.md',
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Meeting Notes.md',
            content: meetingNotesContent
          },
          {
            name: 'Contacts.md',
            content: contactsContent
          },
          {
            name: 'Intelligence.md',
            content: intelligenceContent
          },
          {
            name: 'Next Steps.md',
            content: nextStepsContent
          }
        ];
        
        for (const subnote of subnotes) {
          const notePath = `${folderPath}/${subnote.name}`;
          await this.app.vault.create(notePath, subnote.content);
        }
        
        const enrichLabel = hasEnrichment ? ' (enriched)' : '';
        console.log(`[Eudia] Created account folder with subnotes${enrichLabel}: ${safeName}`);
        return true;
      } catch (error) {
        console.error(`[Eudia] Failed to create folder for ${safeName}:`, error);
        return false;
      }
    };

    // Parallel batch creation: 5 accounts at a time for speed
    const BATCH_SIZE = 5;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(a => createSingleAccount(a)));
      createdCount += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    }

    // Only update cached accounts if folders were actually created
    if (createdCount > 0) {
      this.settings.cachedAccounts = accounts.map(a => ({
        id: a.id,
        name: a.name
      }));
      await this.saveSettings();
      new Notice(`Created ${createdCount} account folders`);
    } else {
      console.warn(`[Eudia] createTailoredAccountFolders: 0 folders created out of ${accounts.length} accounts — not updating cachedAccounts`);
    }
    
    // Also create the Next Steps aggregation folder if it doesn't exist
    await this.ensureNextStepsFolderExists();
  }

  // ── Enrichment-aware template builders ──

  /**
   * Build Contacts.md content, pre-filled with Salesforce data when available.
   */
  private buildContactsContent(
    account: OwnedAccount,
    enrich?: { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string },
    dateStr?: string
  ): string {
    const enrichedAt = enrich ? `\nenriched_at: "${new Date().toISOString()}"` : '';
    const frontmatter = `---
account: "${account.name}"
account_id: "${account.id}"
type: contacts
sync_to_salesforce: false${enrichedAt}
---`;

    // If we have enrichment data for contacts, use it
    if (enrich?.contacts) {
      return `${frontmatter}

# ${account.name} - Key Contacts

${enrich.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`;
    }

    // Fallback: blank template
    return `${frontmatter}

# ${account.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
| *No contacts on record yet* | | | | |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`;
  }

  /**
   * Build Intelligence.md content, pre-filled with Salesforce data when available.
   */
  private buildIntelligenceContent(
    account: OwnedAccount,
    enrich?: { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string },
    dateStr?: string
  ): string {
    const enrichedAt = enrich ? `\nenriched_at: "${new Date().toISOString()}"` : '';
    const frontmatter = `---
account: "${account.name}"
account_id: "${account.id}"
type: intelligence
sync_to_salesforce: false${enrichedAt}
---`;

    // If we have enrichment data for intelligence, use it
    if (enrich?.intelligence) {
      return `${frontmatter}

# ${account.name} - Account Intelligence

${enrich.intelligence}

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`;
    }

    // Fallback: blank template with placeholders
    return `${frontmatter}

# ${account.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`;
  }

  /**
   * Build Meeting Notes.md content, with opportunity and activity data when available.
   */
  private buildMeetingNotesContent(
    account: OwnedAccount,
    enrich?: { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string }
  ): string {
    const enrichedAt = enrich ? `\nenriched_at: "${new Date().toISOString()}"` : '';
    const frontmatter = `---
account: "${account.name}"
account_id: "${account.id}"
type: meetings_index
sync_to_salesforce: false${enrichedAt}
---`;

    // Build sections from enrichment data
    const sections: string[] = [];
    if (enrich?.opportunities) {
      sections.push(enrich.opportunities);
    }
    if (enrich?.recentActivity) {
      sections.push(enrich.recentActivity);
    }

    if (sections.length > 0) {
      return `${frontmatter}

# ${account.name} - Meeting Notes

${sections.join('\n\n')}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`;
    }

    // Fallback: blank template
    return `${frontmatter}

# ${account.name} - Meeting Notes

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`;
  }

  /**
   * Build Next Steps.md content, pre-filled with active tasks when available.
   */
  private buildNextStepsContent(
    account: OwnedAccount,
    enrich?: { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string },
    dateStr?: string
  ): string {
    const date = dateStr || new Date().toISOString().split('T')[0];
    const enrichedAt = enrich ? `\nenriched_at: "${new Date().toISOString()}"` : '';
    const frontmatter = `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${date}
sync_to_salesforce: false${enrichedAt}
---`;

    if (enrich?.nextSteps) {
      return `${frontmatter}

# ${account.name} - Next Steps

${enrich.nextSteps}

---

## History

*Previous next steps will be archived here.*
`;
    }

    // Fallback: blank template
    return `${frontmatter}

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`;
  }

  /**
   * Fetch enrichment data from the server for a batch of accounts.
   * Returns a map of accountId -> enrichment data, or empty object on failure.
   */
  async fetchEnrichmentData(accounts: OwnedAccount[]): Promise<Record<string, any>> {
    const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';
    const accountsWithIds = accounts.filter(a => a.id && a.id.startsWith('001'));
    if (accountsWithIds.length === 0) return {};

    const allEnrichments: Record<string, any> = {};
    const batchSize = 20;

    console.log(`[Eudia Enrich] Fetching enrichment data for ${accountsWithIds.length} accounts`);

    for (let i = 0; i < accountsWithIds.length; i += batchSize) {
      const batch = accountsWithIds.slice(i, i + batchSize);
      const batchIds = batch.map(a => a.id);

      try {
        const response = await requestUrl({
          url: `${serverUrl}/api/accounts/enrich-batch`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountIds: batchIds,
            userEmail: this.settings.userEmail
          })
        });

        if (response.json?.success && response.json?.enrichments) {
          Object.assign(allEnrichments, response.json.enrichments);
        }
      } catch (err) {
        console.error(`[Eudia Enrich] Batch fetch failed (batch ${i / batchSize + 1}):`, err);
        // Continue with other batches — graceful degradation
      }

      // Minimal delay between batches
      if (i + batchSize < accountsWithIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(allEnrichments).length}/${accountsWithIds.length} accounts`);
    return allEnrichments;
  }

  /**
   * Create full 7-file folder structures for prospect accounts (no opportunity history).
   * These go into Accounts/_Prospects/ with the same structure as active accounts,
   * keeping them organized separately while giving users the full working template.
   */
  async createProspectAccountFiles(prospects: OwnedAccount[]): Promise<number> {
    if (!prospects || prospects.length === 0) return 0;
    
    const accountsFolder = this.settings.accountsFolder || 'Accounts';
    const prospectsFolder = `${accountsFolder}/_Prospects`;
    
    // Ensure _Prospects folder exists
    const existingFolder = this.app.vault.getAbstractFileByPath(prospectsFolder);
    if (!existingFolder) {
      try {
        await this.app.vault.createFolder(prospectsFolder);
      } catch (e) {
        // May already exist from parallel creation
      }
    }
    
    let createdCount = 0;
    
    for (const prospect of prospects) {
      const safeName = prospect.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const folderPath = `${prospectsFolder}/${safeName}`;
      
      // Skip if folder already exists in _Prospects
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) continue;
      
      // Also skip if this account already has a full folder in Accounts/ (active)
      const activeFolderPath = `${accountsFolder}/${safeName}`;
      const activeFolder = this.app.vault.getAbstractFileByPath(activeFolderPath);
      if (activeFolder instanceof TFolder) continue;
      
      // Clean up any old single-file prospect .md that may exist from prior version
      const oldFilePath = `${prospectsFolder}/${safeName}.md`;
      const oldFile = this.app.vault.getAbstractFileByPath(oldFilePath);
      if (oldFile instanceof TFile) {
        try { await this.app.vault.delete(oldFile); } catch (e) { /* ok */ }
      }
      
      try {
        // Create the prospect account folder with full 7-file structure
        await this.app.vault.createFolder(folderPath);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const subnotes = [
          {
            name: 'Note 1.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${dateStr}
---

# ${prospect.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Note 2.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${dateStr}
---

# ${prospect.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Note 3.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${dateStr}
---

# ${prospect.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: 'Meeting Notes.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: meetings_index
tier: prospect
sync_to_salesforce: false
---

# ${prospect.name} - Meeting Notes

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`
          },
          {
            name: 'Contacts.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: contacts
tier: prospect
sync_to_salesforce: false
---

# ${prospect.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`
          },
          {
            name: 'Intelligence.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: intelligence
tier: prospect
sync_to_salesforce: false
---

# ${prospect.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`
          },
          {
            name: 'Next Steps.md',
            content: `---
account: "${prospect.name}"
account_id: "${prospect.id}"
type: next_steps
tier: prospect
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${prospect.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
          }
        ];
        
        for (const subnote of subnotes) {
          const notePath = `${folderPath}/${subnote.name}`;
          await this.app.vault.create(notePath, subnote.content);
        }
        
        createdCount++;
      } catch (err) {
        console.log(`[Eudia] Failed to create prospect folder for ${prospect.name}:`, err);
      }
    }
    
    if (createdCount > 0) {
      console.log(`[Eudia] Created ${createdCount} prospect account folders in _Prospects/`);
    }
    
    return createdCount;
  }

  /**
   * Create CS Manager dashboard folder for managers like Nikhita.
   * Shows a manager overview with rep-level context that auto-updates as
   * new accounts hit Stage 4/5 or become 'Existing'.
   */
  async createCSManagerDashboard(managerEmail: string, accounts: OwnedAccount[]): Promise<void> {
    const dashFolder = 'CS Manager';
    const dateStr = new Date().toISOString().split('T')[0];
    const directReports = getCSManagerDirectReports(managerEmail);
    
    // Ensure the CS Manager folder exists
    if (!this.app.vault.getAbstractFileByPath(dashFolder)) {
      try { await this.app.vault.createFolder(dashFolder); } catch { /* may exist */ }
    }
    
    // Group accounts by owner for rep-level breakdowns
    const byOwner: Record<string, OwnedAccount[]> = {};
    for (const acc of accounts) {
      const owner = (acc as any).ownerName || 'Unassigned';
      if (!byOwner[owner]) byOwner[owner] = [];
      byOwner[owner].push(acc);
    }
    
    // 1. Manager Overview note
    let overviewContent = `---
role: cs_manager
manager: "${managerEmail}"
direct_reports: ${directReports.length}
total_accounts: ${accounts.length}
created: ${dateStr}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${managerEmail}
**Direct Reports:** ${directReports.join(', ') || 'None configured'}
**Total CS Accounts:** ${accounts.length}
**Last Refreshed:** ${dateStr}

---

## Account Distribution by Sales Rep

`;
    
    // Sort owners alphabetically
    const sortedOwners = Object.keys(byOwner).sort();
    for (const owner of sortedOwners) {
      const ownerAccounts = byOwner[owner];
      overviewContent += `### ${owner} (${ownerAccounts.length} accounts)\n`;
      for (const acc of ownerAccounts.slice(0, 10)) {
        overviewContent += `- **${acc.name}** — ${acc.type || 'Account'}\n`;
      }
      if (ownerAccounts.length > 10) {
        overviewContent += `- _...and ${ownerAccounts.length - 10} more_\n`;
      }
      overviewContent += '\n';
    }
    
    overviewContent += `---

## CS Staffing Pipeline

| Account | Type | Owner | CSM |
|---------|------|-------|-----|
`;
    for (const acc of accounts.slice(0, 50)) {
      overviewContent += `| ${acc.name} | ${acc.type || ''} | ${(acc as any).ownerName || ''} | ${(acc as any).csmName || ''} |\n`;
    }
    
    overviewContent += `\n---\n
## How Meeting Notes Sync

Meeting notes created by your direct reports flow through Salesforce:
1. **Rep records a meeting** in their vault and clicks "Sync to Salesforce"
2. **Notes sync to Salesforce** \`Customer_Brain__c\` field on the Account
3. **Your vault refreshes** — account Intelligence and Meeting Notes sub-notes pull the latest activity from Salesforce each time the vault opens or you click "Connect to Salesforce" in Setup

> To see the latest notes from Jon and Farah, ensure they are syncing their meeting notes to Salesforce. Your vault will automatically pull their activity on the next enrichment cycle.

---

*This dashboard auto-updates when the vault syncs. New Stage 4/5 and Existing accounts will appear automatically.*
`;
    
    const overviewPath = `${dashFolder}/CS Manager Overview.md`;
    const existingOverview = this.app.vault.getAbstractFileByPath(overviewPath);
    if (existingOverview instanceof TFile) {
      await this.app.vault.modify(existingOverview, overviewContent);
    } else {
      await this.app.vault.create(overviewPath, overviewContent);
    }

    // 2. Per-rep notes (for each direct report)
    for (const reportEmail of directReports) {
      const repName = reportEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      // Match accounts to rep: check CSM name first (primary), then owner name (fallback)
      const emailPrefix = reportEmail.split('@')[0].replace('.', ' ').toLowerCase();
      const firstName = emailPrefix.split(' ')[0];
      const lastName = emailPrefix.split(' ').pop() || '';
      
      const repAccounts = accounts.filter(a => {
        // Primary: match on CSM assignment (Account.CSM__c in Salesforce)
        const csmNorm = ((a as any).csmName || '').toLowerCase();
        if (csmNorm && (csmNorm.includes(firstName) || csmNorm.includes(lastName))) {
          return true;
        }
        // Fallback: match on account owner (Business Lead)
        const ownerNorm = ((a as any).ownerName || '').toLowerCase();
        return ownerNorm.includes(firstName) || ownerNorm.includes(lastName);
      });
      
      let repContent = `---
rep: "${reportEmail}"
rep_name: "${repName}"
role: cs_rep_summary
account_count: ${repAccounts.length}
created: ${dateStr}
---

# ${repName} — CS Account Summary

**Email:** ${reportEmail}
**CS Accounts:** ${repAccounts.length}

---

## Assigned Accounts

`;
      if (repAccounts.length > 0) {
        repContent += `| Account | Type | Owner | Folder |\n|---------|------|-------|--------|\n`;
        for (const acc of repAccounts) {
          const safeName = acc.name.replace(/[<>:"/\\|?*]/g, '_').trim();
          repContent += `| ${acc.name} | ${acc.type || ''} | ${(acc as any).ownerName || ''} | [[Accounts/${safeName}/Contacts\\|View]] |\n`;
        }
      } else {
        repContent += `*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*\n`;
      }
      
      repContent += `\n---\n
## Recent Activity

Meeting notes and activity for ${repName}'s accounts sync through Salesforce:
- Notes appear in each account's **Meeting Notes** and **Intelligence** sub-notes
- Activity updates when the vault enriches (on open or Salesforce connect)
- Ensure ${repName} is syncing their meeting notes to Salesforce for latest data

---

*Updates automatically as new CS-relevant accounts sync.*
`;
      
      const repPath = `${dashFolder}/${repName}.md`;
      const existingRep = this.app.vault.getAbstractFileByPath(repPath);
      if (existingRep instanceof TFile) {
        await this.app.vault.modify(existingRep, repContent);
      } else {
        await this.app.vault.create(repPath, repContent);
      }
    }
    
    console.log(`[Eudia] Created CS Manager dashboard for ${managerEmail} with ${accounts.length} accounts across ${sortedOwners.length} reps`);
  }

  /**
   * Create account folders for admin users with ALL accounts.
   * Owned accounts get full folder structure, view-only get minimal read-only structure.
   */
  async createAdminAccountFolders(accounts: OwnedAccount[]): Promise<void> {
    const accountsFolder = this.settings.accountsFolder || 'Accounts';
    
    // Ensure the main Accounts folder exists
    const existingFolder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!existingFolder) {
      await this.app.vault.createFolder(accountsFolder);
    }

    // Create Pipeline folder for admin pipeline review notes
    await this.ensurePipelineFolderExists();

    let createdOwned = 0;
    let createdViewOnly = 0;
    const dateStr = new Date().toISOString().split('T')[0];

    // Helper: create a single admin account folder
    const createSingleAdmin = async (account: OwnedAccount): Promise<boolean> => {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      
      // Check if folder already exists
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) {
        return false;
      }
      
      try {
        // Create the account folder
        await this.app.vault.createFolder(folderPath);
        
        // Full folder structure for ALL accounts (owned or view-only)
        // Execs get the same 7-note structure as BLs for full context
        await this.createExecAccountSubnotes(folderPath, account, dateStr);
        if (account.isOwned) {
          createdOwned++;
        } else {
          createdViewOnly++;
        }
        
        console.log(`[Eudia Admin] Created ${account.isOwned ? 'owned' : 'view-only'} folder: ${safeName}`);
        return true;
      } catch (error) {
        console.error(`[Eudia Admin] Failed to create folder for ${safeName}:`, error);
        return false;
      }
    };

    // Parallel batch creation: 5 accounts at a time for speed
    const BATCH_SIZE = 5;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(a => createSingleAdmin(a)));
    }

    // Update cached accounts
    this.settings.cachedAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name
    }));
    await this.saveSettings();

    if (createdOwned + createdViewOnly > 0) {
      new Notice(`Created ${createdOwned} owned + ${createdViewOnly} view-only account folders`);
    }
    
    await this.ensureNextStepsFolderExists();
  }

  /**
   * Create full account subnotes for exec/admin users (same structure as BLs)
   * Gives execs Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps
   */
  private async createExecAccountSubnotes(folderPath: string, account: OwnedAccount, dateStr: string): Promise<void> {
    const ownerName = (account as any).ownerName || 'Unknown';
    const subnotes = [
      {
        name: 'Note 1.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: 'Note 2.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: 'Note 3.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: 'Meeting Notes.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meetings_index
owner: "${ownerName}"
sync_to_salesforce: false
---

# ${account.name} - Meeting Notes

**Account Owner:** ${ownerName}

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`
      },
      {
        name: 'Contacts.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: contacts
sync_to_salesforce: false
---

# ${account.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`
      },
      {
        name: 'Intelligence.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: intelligence
sync_to_salesforce: false
---

# ${account.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`
      },
      {
        name: 'Next Steps.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
      }
    ];

    for (const subnote of subnotes) {
      const notePath = `${folderPath}/${subnote.name}`;
      await this.app.vault.create(notePath, subnote.content);
    }
  }

  /**
   * Create full account subnotes (used by both regular users and admin-owned accounts)
   */
  private async createFullAccountSubnotes(folderPath: string, account: OwnedAccount, dateStr: string): Promise<void> {
    const subnotes = [
      {
        name: 'Note 1.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: 'Next Steps.md',
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
      }
    ];
    
    for (const subnote of subnotes) {
      const notePath = `${folderPath}/${subnote.name}`;
      await this.app.vault.create(notePath, subnote.content);
    }
  }

  /**
   * Ensure Pipeline folder exists for admin pipeline review notes
   */
  private async ensurePipelineFolderExists(): Promise<void> {
    const pipelineFolder = 'Pipeline';
    const dashboardPath = `${pipelineFolder}/Pipeline Review Notes.md`;
    
    const folder = this.app.vault.getAbstractFileByPath(pipelineFolder);
    if (!folder) {
      await this.app.vault.createFolder(pipelineFolder);
    }
    
    const dashboard = this.app.vault.getAbstractFileByPath(dashboardPath);
    if (!dashboard) {
      const dateStr = new Date().toISOString().split('T')[0];
      
      const content = `---
type: pipeline_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# Pipeline Review Notes

This folder contains transcribed notes from internal pipeline review meetings.

## How It Works

1. **Record** a pipeline review meeting (forecast call, deal review, etc.)
2. **Transcribe** using the microphone - the system detects it's a pipeline meeting
3. **Account updates** are extracted per-account discussed
4. **This dashboard** aggregates all pipeline review notes

---

## Recent Pipeline Reviews

| Date | Meeting | Key Updates |
|------|---------|-------------|
|      |         |             |

---

## Pipeline Health Snapshot

*Updated after each pipeline review meeting.*

### Accounts Advancing
*None yet*

### Accounts At Risk
*None yet*

### New Opportunities
*None yet*
`;
      
      await this.app.vault.create(dashboardPath, content);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEXT STEPS MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ensure the Next Steps folder exists with the dashboard file
   */
  async ensureNextStepsFolderExists(): Promise<void> {
    const nextStepsFolder = 'Next Steps';
    const dashboardPath = `${nextStepsFolder}/All Next Steps.md`;
    
    // Create folder if it doesn't exist
    const folder = this.app.vault.getAbstractFileByPath(nextStepsFolder);
    if (!folder) {
      await this.app.vault.createFolder(nextStepsFolder);
    }
    
    // Create dashboard if it doesn't exist
    const dashboard = this.app.vault.getAbstractFileByPath(dashboardPath);
    if (!dashboard) {
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      
      const content = `---
type: next_steps_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# All Next Steps Dashboard

*Last updated: ${dateStr} ${timeStr}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;
      await this.app.vault.create(dashboardPath, content);
    }
  }

  /**
   * Update an account's Next Steps.md file after transcription
   * Appends to history instead of overwriting
   */
  async updateAccountNextSteps(accountName: string, nextStepsContent: string, sourceNotePath: string): Promise<void> {
    try {
      console.log(`[Eudia] updateAccountNextSteps called for: ${accountName}`);
      console.log(`[Eudia] Content length: ${nextStepsContent?.length || 0} chars`);
      
      const safeName = accountName.replace(/[<>:"/\\|?*]/g, '_').trim();
      const nextStepsPath = `${this.settings.accountsFolder}/${safeName}/Next Steps.md`;
      console.log(`[Eudia] Looking for Next Steps file at: ${nextStepsPath}`);
      
      const nextStepsFile = this.app.vault.getAbstractFileByPath(nextStepsPath);
      if (!nextStepsFile || !(nextStepsFile instanceof TFile)) {
        console.log(`[Eudia] ❌ Next Steps file NOT FOUND at: ${nextStepsPath}`);
        // List files in the account folder to debug
        const accountFolder = this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${safeName}`);
        if (accountFolder && accountFolder instanceof TFolder) {
          console.log(`[Eudia] Files in ${safeName} folder:`, accountFolder.children.map(c => c.name));
        } else {
          console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${safeName}`);
        }
        return;
      }
      console.log(`[Eudia] Found Next Steps file, updating...`);
      
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const sourceNote = sourceNotePath.split('/').pop()?.replace('.md', '') || 'Meeting';
      
      // Format next steps as checklist items if not already
      let formattedNextSteps = nextStepsContent;
      if (!nextStepsContent.includes('- [ ]') && !nextStepsContent.includes('- [x]')) {
        // Convert plain text to checklist
        formattedNextSteps = nextStepsContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const cleaned = line.replace(/^[-•*]\s*/, '').trim();
            return cleaned ? `- [ ] ${cleaned}` : '';
          })
          .filter(Boolean)
          .join('\n');
      }
      
      // Read existing content to preserve history
      const existingContent = await this.app.vault.read(nextStepsFile);
      
      // Extract existing history section
      let existingHistory = '';
      const historyMatch = existingContent.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);
      if (historyMatch && historyMatch[1]) {
        existingHistory = historyMatch[1].trim();
      }
      
      // Build new history entry (prepend to existing)
      const newHistoryEntry = `### ${dateStr} - ${sourceNote}\n${formattedNextSteps || '*None*'}`;
      const combinedHistory = existingHistory 
        ? `${newHistoryEntry}\n\n---\n\n${existingHistory}`
        : newHistoryEntry;
      
      // Build new content with preserved history
      const newContent = `---
account: "${accountName}"
account_id: "${this.settings.cachedAccounts.find(a => a.name === accountName)?.id || ''}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${accountName} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${dateStr} ${timeStr} from ${sourceNote}*

${formattedNextSteps || '*No next steps identified*'}

---

## History

*Previous next steps are archived below.*

${combinedHistory}
`;
      
      await this.app.vault.modify(nextStepsFile, newContent);
      console.log(`[Eudia] Updated Next Steps for ${accountName} (history preserved)`);
      
      // Regenerate the aggregated dashboard
      await this.regenerateNextStepsDashboard();
      
    } catch (error) {
      console.error(`[Eudia] Failed to update Next Steps for ${accountName}:`, error);
    }
  }

  /**
   * Regenerate the All Next Steps dashboard by scanning all account folders
   */
  async regenerateNextStepsDashboard(): Promise<void> {
    try {
      const dashboardPath = 'Next Steps/All Next Steps.md';
      const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);
      
      if (!dashboardFile || !(dashboardFile instanceof TFile)) {
        await this.ensureNextStepsFolderExists();
        return;
      }
      
      // Scan all account folders for Next Steps.md files
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      if (!accountsFolder || !(accountsFolder instanceof TFolder)) {
        return;
      }
      
      const accountNextSteps: Array<{
        account: string;
        lastUpdated: string;
        nextSteps: string[];
      }> = [];
      
      for (const child of accountsFolder.children) {
        if (child instanceof TFolder) {
          const nextStepsPath = `${child.path}/Next Steps.md`;
          const nextStepsFile = this.app.vault.getAbstractFileByPath(nextStepsPath);
          
          if (nextStepsFile instanceof TFile) {
            const content = await this.app.vault.read(nextStepsFile);
            
            // Extract last updated date from frontmatter
            const lastUpdatedMatch = content.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/);
            const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1] : 'Unknown';
            
            // Extract next steps (lines starting with - [ ] or - [x])
            const nextStepsLines = content
              .split('\n')
              .filter(line => line.match(/^- \[[ x]\]/))
              .slice(0, 5); // Limit to 5 per account
            
            if (nextStepsLines.length > 0 || lastUpdated !== 'Unknown') {
              accountNextSteps.push({
                account: child.name,
                lastUpdated,
                nextSteps: nextStepsLines
              });
            }
          }
        }
      }
      
      // Sort by last updated (most recent first)
      accountNextSteps.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
      
      // Build dashboard content
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      
      let dashboardContent = `---
type: next_steps_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# All Next Steps Dashboard

*Last updated: ${dateStr} ${timeStr}*

---

`;
      
      if (accountNextSteps.length === 0) {
        dashboardContent += `## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;
      } else {
        // Group by accounts with next steps
        for (const item of accountNextSteps) {
          dashboardContent += `## ${item.account}\n\n`;
          
          if (item.nextSteps.length > 0) {
            dashboardContent += item.nextSteps.join('\n') + '\n';
          } else {
            dashboardContent += '*No current next steps*\n';
          }
          
          dashboardContent += `\n*Updated: ${item.lastUpdated}*\n\n---\n\n`;
        }
        
        // Add summary table
        dashboardContent += `## Summary\n\n`;
        dashboardContent += `| Account | Last Updated | Open Items |\n`;
        dashboardContent += `|---------|--------------|------------|\n`;
        
        for (const item of accountNextSteps) {
          const openCount = item.nextSteps.filter(s => s.includes('- [ ]')).length;
          dashboardContent += `| ${item.account} | ${item.lastUpdated} | ${openCount} |\n`;
        }
      }
      
      await this.app.vault.modify(dashboardFile, dashboardContent);
      console.log('[Eudia] Regenerated All Next Steps dashboard');
      
    } catch (error) {
      console.error('[Eudia] Failed to regenerate Next Steps dashboard:', error);
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

    // Auto-detect virtual audio device if available (non-blocking)
    if (!this.settings.audioSystemDeviceId) {
      try {
        const vd = await AudioRecorder.detectVirtualAudioDevice();
        if (vd) {
          this.settings.audioSystemDeviceId = vd.deviceId;
          await this.saveSettings();
          console.log(`[Eudia] Virtual audio device found: ${vd.label}`);
        }
      } catch { /* proceed without virtual device */ }
    }

    // Show template picker before recording
    const template = await this.showTemplatePicker();
    if (!template) return; // user cancelled
    this.settings.meetingTemplate = template;

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
      const captureMode = this.settings.audioCaptureMode || 'full_call';
      const recordingOptions: AudioRecordingOptions = {
        captureMode,
        micDeviceId: this.settings.audioMicDeviceId || undefined,
        systemAudioDeviceId: this.settings.audioSystemDeviceId || undefined
      };

      await this.audioRecorder.start(recordingOptions);

      if (captureMode === 'full_call' && this.audioRecorder.getState().isRecording) {
        const sysMethod = this.audioRecorder.getSystemAudioMethod();
        if (sysMethod === 'electron' || sysMethod === 'display_media') {
          new Notice('Recording — capturing both sides of the call.', 5000);
        } else if (sysMethod === 'virtual_device') {
          new Notice('Recording (Full Call + Virtual Device) — both sides captured.', 5000);
        } else {
          new Notice(
            'Recording (Mic only) — headphones block call audio capture.\n\n' +
            'Use laptop speakers, or try Settings > Audio Capture > Test System Audio.',
            10000
          );
        }
      } else if (captureMode === 'mic_only') {
        new Notice('Recording (Mic Only — your voice only)', 3000);
      }
      this.recordingStatusBar.show();
      
      // Add glow effect to ribbon icon
      this.micRibbonIcon?.addClass('eudia-ribbon-recording');

      // Auto-detect meeting duration from calendar and set auto-stop
      // ONLY auto-stop if a meeting is actively happening right now (isNow: true)
      // Do NOT auto-stop for upcoming meetings or when no calendar event exists
      let meetingAutoStopTimeout: NodeJS.Timeout | null = null;
      try {
        const currentMeeting = await this.calendarService.getCurrentMeeting();
        if (currentMeeting.isNow && currentMeeting.meeting?.end) {
          const endTime = new Date(currentMeeting.meeting.end);
          const now = new Date();
          const remainingMs = endTime.getTime() - now.getTime();
          if (remainingMs > 60000 && remainingMs < 5400000) {
            const remainingMin = Math.round(remainingMs / 60000);
            new Notice(`Recording aligned to meeting — auto-stops in ${remainingMin} min`);
            meetingAutoStopTimeout = setTimeout(async () => {
              if (this.audioRecorder?.isRecording()) {
                new Notice('Meeting ended — generating summary.');
                await this.stopRecording();
              }
            }, remainingMs);
            console.log(`[Eudia] Auto-stop set for ${remainingMin} min (meeting: ${currentMeeting.meeting.subject})`);
          }
        }
      } catch (e) {
        console.log('[Eudia] Could not detect meeting duration for auto-stop:', e);
      }

      // Update status bar with audio levels + recording time limit checks
      let recordingPromptShown = false;
      const updateInterval = setInterval(() => {
        if (this.audioRecorder?.isRecording()) {
          const state = this.audioRecorder.getState();
          this.recordingStatusBar?.updateState(state);

          // 45-minute prompt: "Still in this meeting?"
          if (state.duration >= 2700 && !recordingPromptShown) {
            recordingPromptShown = true;
            const modal = new (class extends Modal {
              result: boolean = true;
              onOpen() {
                const { contentEl } = this;
                contentEl.createEl('h2', { text: 'Still recording?' });
                contentEl.createEl('p', { text: 'You have been recording for 45 minutes. Are you still in this meeting?' });
                contentEl.createEl('p', { text: 'Recording will auto-stop at 90 minutes.', cls: 'mod-warning' });
                const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
                btnContainer.createEl('button', { text: 'Keep Recording', cls: 'mod-cta' }).onclick = () => { this.close(); };
                btnContainer.createEl('button', { text: 'Stop Recording' }).onclick = () => { this.result = false; this.close(); };
              }
              onClose() {
                if (!this.result) {
                  // User chose to stop
                  plugin.stopRecording();
                }
              }
            })(this.app);
            const plugin = this;
            modal.open();
          }

          // 90-minute hard stop (safety net — AudioRecorder also enforces this)
          if (state.duration >= 5400) {
            new Notice('Recording stopped — maximum 90 minutes reached.');
            this.stopRecording();
            clearInterval(updateInterval);
          }
        } else {
          clearInterval(updateInterval);
        }
      }, 100);

      // Initialize live transcript and start periodic chunk transcription
      this.liveTranscript = '';
      this.startLiveTranscription();

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

      // Pre-transcription audio quality gate
      try {
        const diag = await AudioRecorder.analyzeAudioBlob(result.audioBlob);
        if (!diag.hasAudio) {
          let modeHint: string;
          if (result.systemAudioMethod === 'electron' || result.systemAudioMethod === 'display_media') {
            modeHint = 'System audio capture was active but no sound was detected. Check that the call app is playing audio.';
          } else if (result.captureMode === 'full_call') {
            modeHint = 'Make sure your call audio is playing through laptop speakers (not headphones).';
          } else {
            modeHint = 'Check that your microphone is working and has permission.';
          }
          new Notice(`Recording appears silent. ${modeHint} Open Settings > Audio Capture to test your setup.`, 12000);
        }
      } catch (diagErr) {
        console.warn('[Eudia] Pre-transcription audio check failed:', diagErr);
      }

      await this.processRecording(result, activeFile);
    } catch (error) {
      new Notice(`Transcription failed: ${error.message}`);
    } finally {
      this.micRibbonIcon?.removeClass('eudia-ribbon-recording');
      this.stopLiveTranscription();
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
      this.audioRecorder = null;
    }
  }

  private showTemplatePicker(): Promise<'meddic' | 'demo' | 'general' | null> {
    return new Promise((resolve) => {
      const modal = new (class extends Modal {
        result: 'meddic' | 'demo' | 'general' | null = null;
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl('h3', { text: 'Meeting Type' });
          contentEl.createEl('p', { text: 'Select the template for this recording:', cls: 'setting-item-description' });

          const btnContainer = contentEl.createDiv();
          btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px;';

          const templates: Array<{key: 'meddic'|'demo'|'general', label: string, desc: string}> = [
            { key: 'meddic', label: 'Sales Discovery (MEDDIC)', desc: 'Pain points, decision process, metrics, champions, budget signals' },
            { key: 'demo', label: 'Demo / Presentation', desc: 'Feature reactions, questions, objections, interest signals' },
            { key: 'general', label: 'General Check-In', desc: 'Relationship updates, action items, sentiment' },
          ];

          for (const t of templates) {
            const btn = btnContainer.createEl('button', { text: t.label });
            btn.style.cssText = 'padding:10px 16px;text-align:left;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);';
            const desc = btnContainer.createEl('div', { text: t.desc });
            desc.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:4px;padding-left:4px;';
            btn.onclick = () => { this.result = t.key; this.close(); };
          }
        }
        onClose() { resolve(this.result); }
      })(this.app);
      modal.open();
    });
  }

  async cancelRecording(): Promise<void> {
    if (this.audioRecorder?.isRecording()) {
      this.audioRecorder.cancel();
    }
    // Remove glow effect from ribbon icon
    this.micRibbonIcon?.removeClass('eudia-ribbon-recording');
    this.stopLiveTranscription();
    this.recordingStatusBar?.hide();
    this.recordingStatusBar = null;
    this.audioRecorder = null;
    new Notice('Transcription cancelled');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE TRANSCRIPTION - Periodic chunk transcription for live query support
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start periodic chunk transcription for live query support.
   * Transcribes audio chunks every 2 minutes during recording.
   */
  private startLiveTranscription(): void {
    // Clear any existing interval
    this.stopLiveTranscription();
    
    // Transcribe chunks every 2 minutes (120000ms)
    // This balances responsiveness with API cost/load
    const CHUNK_INTERVAL_MS = 120000;
    
    this.liveTranscriptChunkInterval = setInterval(async () => {
      await this.transcribeCurrentChunk();
    }, CHUNK_INTERVAL_MS);
    
    // Also do an initial transcription after 30 seconds if recording is still going
    setTimeout(async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.transcribeCurrentChunk();
      }
    }, 30000);
    
    console.log('[Eudia] Live transcription started');
  }

  /**
   * Stop periodic chunk transcription
   */
  private stopLiveTranscription(): void {
    if (this.liveTranscriptChunkInterval) {
      clearInterval(this.liveTranscriptChunkInterval);
      this.liveTranscriptChunkInterval = null;
    }
    console.log('[Eudia] Live transcription stopped');
  }

  /**
   * Transcribe the current audio chunk and append to live transcript
   */
  private async transcribeCurrentChunk(): Promise<void> {
    if (!this.audioRecorder?.isRecording() || this.isTranscribingChunk) {
      return;
    }

    const chunkBlob = this.audioRecorder.extractNewChunks();
    if (!chunkBlob || chunkBlob.size < 5000) {
      // Not enough new audio to transcribe
      return;
    }

    this.isTranscribingChunk = true;
    console.log(`[Eudia] Transcribing chunk: ${chunkBlob.size} bytes`);

    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(chunkBlob);
      });
      
      const base64 = await base64Promise;
      const mimeType = this.audioRecorder.getMimeType();

      const result = await this.transcriptionService.transcribeChunk(base64, mimeType);
      
      if (result.success && result.text) {
        // Append to live transcript with a separator
        this.liveTranscript += (this.liveTranscript ? '\n\n' : '') + result.text;
        console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`);
      }
    } catch (error) {
      console.error('[Eudia] Chunk transcription error:', error);
    } finally {
      this.isTranscribingChunk = false;
    }
  }

  /**
   * Open the live query modal to query the accumulated transcript
   */
  private openLiveQueryModal(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText('Query Live Transcript');
    
    const contentEl = modal.contentEl;
    contentEl.addClass('eudia-live-query-modal');
    
    // Instructions
    const instructionsEl = contentEl.createDiv({ cls: 'eudia-live-query-instructions' });
    instructionsEl.setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length / 4)} words captured):`);
    
    // Input
    const inputEl = contentEl.createEl('textarea', { 
      cls: 'eudia-live-query-input',
      attr: { 
        placeholder: 'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',
        rows: '3'
      }
    });
    
    // Response area
    const responseEl = contentEl.createDiv({ cls: 'eudia-live-query-response' });
    responseEl.style.display = 'none';
    
    // Button
    const buttonEl = contentEl.createEl('button', { 
      text: 'Ask',
      cls: 'eudia-btn-primary'
    });
    
    buttonEl.addEventListener('click', async () => {
      const question = inputEl.value.trim();
      if (!question) {
        new Notice('Please enter a question');
        return;
      }
      
      buttonEl.disabled = true;
      buttonEl.setText('Searching...');
      responseEl.style.display = 'block';
      responseEl.setText('Searching transcript...');
      responseEl.addClass('eudia-loading');
      
      try {
        const result = await this.transcriptionService.liveQueryTranscript(
          question,
          this.liveTranscript,
          this.getAccountNameFromActiveFile()
        );
        
        responseEl.removeClass('eudia-loading');
        
        if (result.success) {
          responseEl.setText(result.answer);
        } else {
          responseEl.setText(result.error || 'Failed to query transcript');
          responseEl.addClass('eudia-error');
        }
      } catch (error) {
        responseEl.removeClass('eudia-loading');
        responseEl.setText(`Error: ${error.message}`);
        responseEl.addClass('eudia-error');
      } finally {
        buttonEl.disabled = false;
        buttonEl.setText('Ask');
      }
    });
    
    // Handle enter key
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        buttonEl.click();
      }
    });
    
    modal.open();
    inputEl.focus();
  }

  /**
   * Get account name from the currently active file path
   */
  private getAccountNameFromActiveFile(): string | undefined {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return undefined;
    
    // Try to extract account from path (e.g., Accounts/Acme Corp/...)
    const pathMatch = activeFile.path.match(/Accounts\/([^\/]+)\//i);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    return undefined;
  }

  private async processRecording(result: RecordingResult, file: TFile): Promise<void> {
    // Validate audio was captured
    const blobSize = result.audioBlob?.size || 0;
    console.log(`[Eudia] Audio blob size: ${blobSize} bytes, duration: ${result.duration}s`);
    
    if (blobSize < 1000) {
      new Notice('Recording too short or no audio captured. Please try again.');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUDIO DIAGNOSTIC - Check for silent/low audio before transcription
    // This catches issues that cause Whisper to hallucinate (e.g., "Yes. Yes. Yes.")
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const diagnostic = await AudioRecorder.analyzeAudioBlob(result.audioBlob);
      console.log(`[Eudia] Audio diagnostic: hasAudio=${diagnostic.hasAudio}, peak=${diagnostic.peakLevel}, silent=${diagnostic.silentPercent}%`);
      
      if (diagnostic.warning) {
        console.warn(`[Eudia] Audio warning: ${diagnostic.warning}`);
        
        // For silent audio, warn user but still attempt transcription
        // (in case our detection is wrong)
        if (!diagnostic.hasAudio) {
          new Notice('Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.', 8000);
        } else {
          new Notice(`Warning: ${diagnostic.warning.split(':')[0]}`, 5000);
        }
      }
    } catch (diagError) {
      console.warn('[Eudia] Audio diagnostic failed, continuing anyway:', diagError);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SAFETY NET: Save audio to vault BEFORE sending to server
    // Ensures audio is recoverable even if transcription fails or times out
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const recordingsFolder = this.settings.recordingsFolder || 'Recordings';
      if (!this.app.vault.getAbstractFileByPath(recordingsFolder)) {
        await this.app.vault.createFolder(recordingsFolder);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = result.audioBlob.type?.includes('mp4') ? 'mp4' : 'webm';
      const audioFileName = `${recordingsFolder}/recording-${timestamp}.${ext}`;
      const arrayBuffer = await result.audioBlob.arrayBuffer();
      await this.app.vault.createBinary(audioFileName, arrayBuffer);
      console.log(`[Eudia] Audio saved locally: ${audioFileName} (${(blobSize / 1024 / 1024).toFixed(1)}MB)`);
      new Notice(`Audio saved to ${audioFileName}`);
      (result as any)._savedAudioPath = audioFileName;
    } catch (saveError: any) {
      console.error('[Eudia] Failed to save audio locally:', saveError.message);
    }

    // Estimate processing time: ~30s per 10MB chunk + 30s for summarization
    // At 128kbps, 10MB ≈ 10 min of audio. So chunks = ceil(duration / 600)
    const durationSec = result.duration || 0;
    const estChunks = Math.max(1, Math.ceil(durationSec / 600));
    const estSeconds = (estChunks * 30) + 30;
    const estLabel = estSeconds < 60 ? `~${estSeconds} seconds` : `~${Math.ceil(estSeconds / 60)} minute${Math.ceil(estSeconds / 60) > 1 ? 's' : ''}`;
    
    // Show non-blocking notice and add processing status to note
    new Notice(`Processing ${Math.ceil(durationSec / 60)} min recording. Should take ${estLabel}.`);
    
    // Add processing indicator to the note immediately
    const currentContent = await this.app.vault.read(file);
    const processingIndicator = `\n\n---\n**Processing your recording...**\nStarted: ${new Date().toLocaleTimeString()}\nEstimated: ${estLabel}\n\n*You can navigate away — the summary will appear here when ready.*\n---\n`;
    await this.app.vault.modify(file, currentContent + processingIndicator);

    // Process in background - user can navigate away
    this.processTranscriptionAsync(result, file).catch(error => {
      console.error('Background transcription failed:', error);
      new Notice(`Transcription failed: ${error.message}`);
    });
  }

  private async processTranscriptionAsync(result: RecordingResult, file: TFile): Promise<void> {
    try {
      // Detect account from file path
      let accountContext: any = {};
      const pathParts = file.path.split('/');
      console.log(`[Eudia] Processing transcription for: ${file.path}`);
      console.log(`[Eudia] Path parts: ${JSON.stringify(pathParts)}, accountsFolder: ${this.settings.accountsFolder}`);
      
      // ─── PIPELINE MEETING DETECTION ───────────────────────────────────
      const isPipelineMeetingPath = pathParts[0] === 'Pipeline Meetings';
      let isPipelineReview = false;
      
      // Check frontmatter for meeting_type
      try {
        const fileContent = await this.app.vault.read(file);
        const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          isPipelineReview = /meeting_type:\s*pipeline_review/.test(fmMatch[1]);
        }
      } catch { /* ignore read errors */ }
      
      // Path-based detection as fallback
      if (!isPipelineReview && isPipelineMeetingPath) {
        isPipelineReview = true;
      }
      
      if (isPipelineReview) {
        console.log(`[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt`);
        
        // Fetch pipeline context from server
        let pipelineContext = '';
        try {
          const resp = await requestUrl({
            url: `${this.settings.serverUrl || 'https://gtm-brain.onrender.com'}/api/pipeline-context`,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          if (resp.json?.success && resp.json?.context) {
            pipelineContext = resp.json.context;
            console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${pipelineContext.length} chars)`);
          }
        } catch (e) {
          console.warn('[Eudia Pipeline] Could not fetch pipeline context:', e);
        }
        
        accountContext = { meetingType: 'pipeline_review', pipelineContext };
      } else if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const accountName = pathParts[1];
        console.log(`[Eudia] Detected account folder: ${accountName}`);
        
        // Try to find in cached accounts for ID
        const account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === accountName.toLowerCase()
        );
        
        if (account) {
          accountContext = { accountName: account.name, accountId: account.id, userEmail: this.settings.userEmail };
          console.log(`[Eudia] Found cached account: ${account.name} (${account.id})`);
        } else {
          accountContext = { accountName: accountName, accountId: '', userEmail: this.settings.userEmail };
          console.log(`[Eudia] Account not in cache, using folder name: ${accountName}`);
        }
      } else {
        console.log(`[Eudia] File not in Accounts folder, skipping account context`);
      }

      // Get speaker hints from current calendar meeting
      let speakerHints: string[] = [];
      try {
        const currentMeeting = await this.calendarService.getCurrentMeeting();
        if (currentMeeting.meeting?.attendees) {
          speakerHints = currentMeeting.meeting.attendees
            .map(a => a.name || a.email.split('@')[0])
            .filter(Boolean)
            .slice(0, 10);
        }
      } catch {
        // Calendar service may not be configured
      }

      // Transcribe audio (pass capture metadata + template so server uses correct prompt)
      const transcription = await this.transcriptionService.transcribeAudio(
        result.audioBlob, 
        {
          ...accountContext,
          speakerHints,
          captureMode: result.captureMode,
          hasVirtualDevice: result.hasVirtualDevice,
          meetingTemplate: this.settings.meetingTemplate || 'meddic'
        }
      );

      // Helper to check if sections have actual content
      const hasContent = (s: any): boolean => {
        if (!s) return false;
        return Boolean(s.summary?.trim() || s.nextSteps?.trim());
      };
      
      // Use sections from server if they have content
      let sections = transcription.sections;
      
      if (!hasContent(sections)) {
        if (transcription.text?.trim()) {
          sections = await this.transcriptionService.processTranscription(transcription.text, accountContext);
        }
      }
      
      // Check if we got anything
      if (!hasContent(sections) && !transcription.text?.trim()) {
        // Remove processing indicator and show error
        const currentContent = await this.app.vault.read(file);
        const cleanedContent = currentContent.replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g, '');
        await this.app.vault.modify(file, cleanedContent + '\n\n**Transcription failed:** No audio detected.\n');
        new Notice('Transcription failed: No audio detected.');
        return;
      }

      // Preserve any user-typed notes before overwriting
      const existingContent = await this.app.vault.read(file);
      let userNotes = '';
      
      // Extract user-typed content: anything between the frontmatter and the processing marker
      const processingMarkerIdx = Math.max(
        existingContent.indexOf('---\n**Processing your recording'),
        existingContent.indexOf('---\n**Transcription in progress')
      );
      if (processingMarkerIdx > 0) {
        // Find end of frontmatter (second --- occurrence)
        const firstDash = existingContent.indexOf('---');
        const secondDash = firstDash >= 0 ? existingContent.indexOf('---', firstDash + 3) : -1;
        if (secondDash > 0 && secondDash + 3 < processingMarkerIdx) {
          userNotes = existingContent.substring(secondDash + 3, processingMarkerIdx).trim();
        }
      } else {
        // No processing marker -- extract body content after frontmatter 
        // (user may have typed notes before starting recording)
        const firstDash = existingContent.indexOf('---');
        const secondDash = firstDash >= 0 ? existingContent.indexOf('---', firstDash + 3) : -1;
        if (secondDash > 0) {
          const bodyContent = existingContent.substring(secondDash + 3).trim();
          // Only preserve if it has real content beyond the template placeholders
          const stripped = bodyContent
            .replace(/^#.*$/gm, '')
            .replace(/Date:\s*\nAttendees:\s*/g, '')
            .replace(/Add meeting notes here\.\.\./g, '')
            .replace(/---/g, '')
            .trim();
          if (stripped.length > 10) {
            userNotes = bodyContent;
          }
        }
      }

      // Backup existing content before overwriting
      try {
        const backupFolder = '_backups';
        if (!this.app.vault.getAbstractFileByPath(backupFolder)) {
          await this.app.vault.createFolder(backupFolder);
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupPath = `${backupFolder}/${file.name}_${ts}.md`;
        await this.app.vault.create(backupPath, existingContent);
        console.log(`[Eudia] Backed up note to ${backupPath}`);
      } catch (backupErr) {
        console.warn('[Eudia] Backup failed (non-critical):', (backupErr as Error).message);
      }

      // Build note content
      let noteContent: string;
      
      if (isPipelineReview) {
        noteContent = this.buildPipelineNoteContent(sections, transcription, file.path);
      } else {
        noteContent = this.buildNoteContent(sections, transcription);
      }

      // Prepend user-typed notes if any were captured
      if (userNotes && userNotes.length > 5) {
        // Insert after frontmatter, before the AI-generated content
        const fmEndIdx = noteContent.indexOf('---', noteContent.indexOf('---') + 3);
        if (fmEndIdx > 0) {
          const beforeBody = noteContent.substring(0, fmEndIdx + 3);
          const afterFm = noteContent.substring(fmEndIdx + 3);
          noteContent = beforeBody + '\n\n## My Notes (captured during call)\n\n' + userNotes + '\n\n---\n' + afterFm;
        }
      }
      
      // Update file with final content
      await this.app.vault.modify(file, noteContent);

      // Show completion notice
      const durationMin = Math.floor(result.duration / 60);
      new Notice(`Transcription complete (${durationMin} min recording)`);

      // Extract and update Next Steps for the account (skip for pipeline meetings)
      if (!isPipelineReview) {
        const nextStepsContent = sections.nextSteps || sections.actionItems;
        console.log(`[Eudia] Next Steps extraction - accountContext: ${accountContext?.accountName || 'undefined'}`);
        console.log(`[Eudia] Next Steps content found: ${nextStepsContent ? 'YES (' + nextStepsContent.length + ' chars)' : 'NO'}`);
        console.log(`[Eudia] sections.nextSteps: ${sections.nextSteps ? 'YES' : 'NO'}, sections.actionItems: ${sections.actionItems ? 'YES' : 'NO'}`);
        
        if (nextStepsContent && accountContext?.accountName) {
          console.log(`[Eudia] Calling updateAccountNextSteps for ${accountContext.accountName}`);
          await this.updateAccountNextSteps(accountContext.accountName, nextStepsContent, file.path);
        } else {
          console.log(`[Eudia] Skipping Next Steps update - missing content or account context`);
        }
      }

      // Auto-sync if enabled
      if (this.settings.autoSyncAfterTranscription) {
        await this.syncNoteToSalesforce();
      }

    } catch (error) {
      // Try to update note with error status
      try {
        const currentContent = await this.app.vault.read(file);
        const cleanedContent = currentContent.replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g, '');
        await this.app.vault.modify(file, cleanedContent + `\n\n**Transcription failed:** ${error.message}\n`);
      } catch (e) {
        // File may have been moved/deleted
      }
      throw error;
    }
  }

  /**
   * Build formatted note content for pipeline review meetings.
   * The LLM output from the pipeline prompt is already structured with
   * markdown headers and tables, so we wrap it with frontmatter and the
   * raw transcript.
   */
  private buildPipelineNoteContent(sections: ProcessedSections, transcription: any, filePath: string): string {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const dateStr = today.toISOString().split('T')[0];
    const formattedDate = `${mm}.${dd}.${yy}`;
    
    // The summary from the LLM should already contain the structured pipeline output
    const ensureString = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) return val.map(String).join('\n');
      if (typeof val === 'object') return JSON.stringify(val, null, 2);
      return String(val);
    };
    
    const summaryContent = ensureString(sections.summary);
    const transcript = transcription.transcript || transcription.text || '';
    
    let content = `---
title: "Team Pipeline Meeting - ${formattedDate}"
date: ${dateStr}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${today.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}

`;

    // The LLM summary should already be structured per our prompt
    // (Priority Actions, BL Deal Context, Per-BL Account Details, etc.)
    if (summaryContent) {
      content += summaryContent;
    } else {
      // Fallback: try to use whatever sections are available
      const allSectionContent = [
        sections.painPoints,
        sections.productInterest,
        sections.nextSteps,
        sections.actionItems
      ].filter(Boolean).map(ensureString).join('\n\n');
      
      if (allSectionContent) {
        content += allSectionContent;
      } else {
        content += '*Pipeline summary could not be generated. See transcript below.*';
      }
    }
    
    // Append raw transcript at the end (collapsed)
    if (transcript) {
      content += `

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(transcript.length / 1000)}k chars)</summary>

${transcript}

</details>
`;
    }
    
    return content;
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
    const title = ensureString((sections as any).title) || 'Meeting Notes';
    const summary = ensureString(sections.summary);
    const discussionContext = ensureString(sections.discussionContext);
    const keyQuotes = ensureString(sections.keyQuotes);
    const painPoints = ensureString(sections.painPoints);
    const productInterest = ensureString(sections.productInterest);
    const meddiccSignals = ensureString(sections.meddiccSignals);
    const nextSteps = ensureString(sections.nextSteps);
    const actionItems = ensureString(sections.actionItems);
    const keyDates = ensureString(sections.keyDates);
    const dealSignals = ensureString(sections.dealSignals);
    const risksObjections = ensureString(sections.risksObjections);
    const attendees = ensureString(sections.attendees || (sections as any).keyStakeholders);
    const emailDraft = ensureString(sections.emailDraft);

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

    // Discussion Context — broader conversation topics, background, relationship context
    if (discussionContext && !discussionContext.includes('Not discussed')) {
      content += `## Discussion Context

${discussionContext}

`;
    }

    // Key Quotes — verbatim prospect statements
    if (keyQuotes && !keyQuotes.includes('No significant quotes') && !keyQuotes.includes('Not discussed')) {
      content += `## Key Quotes

${keyQuotes}

`;
    }

    if (painPoints && !painPoints.includes('None explicitly') && !painPoints.includes('Not discussed')) {
      content += `## Pain Points

${painPoints}

`;
    }

    if (productInterest && !productInterest.includes('None identified') && !productInterest.includes('No specific products')) {
      content += `## Product Interest

${productInterest}

`;
    }

    if (meddiccSignals) {
      content += `## MEDDICC Signals

${meddiccSignals}

`;
    }

    if (nextSteps) {
      content += `## Next Steps

${nextSteps}

`;
    }

    if (actionItems) {
      content += `## Action Items

${actionItems}

`;
    }

    if (keyDates && !keyDates.includes('No specific dates') && !keyDates.includes('Not discussed')) {
      content += `## Key Dates

${keyDates}

`;
    }

    if (dealSignals && !dealSignals.includes('No significant deal signals') && !dealSignals.includes('Not discussed')) {
      content += `## Deal Signals

${dealSignals}

`;
    }

    if (risksObjections && !risksObjections.includes('None raised') && !risksObjections.includes('No objections') && !risksObjections.includes('Not discussed')) {
      content += `## Risks and Objections

${risksObjections}

`;
    }

    if (attendees) {
      content += `## Attendees

${attendees}

`;
    }

    if (emailDraft) {
      content += `---

## Draft Follow-Up Email

${emailDraft}

> *Edit this draft to match your voice, then send.*

`;
    }

    // Full transcript — defensive: check both .text and .transcript field names
    const rawTranscript = (transcription as any).text || (transcription as any).transcript || '';
    const diarized = (transcription as any).diarizedTranscript || '';
    if (this.settings.appendTranscript && (diarized || rawTranscript)) {
      const transcriptBody = diarized || rawTranscript;
      const label = diarized ? 'Full Transcript (Speaker-Labeled)' : 'Full Transcript';
      content += `---

## ${label}

${transcriptBody}
`;
    }

    return content;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTELLIGENCE QUERY (GRANOLA-STYLE)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Open the Intelligence Query modal (no account context)
   */
  openIntelligenceQuery(): void {
    new IntelligenceQueryModal(this.app, this).open();
  }

  /**
   * Open the Intelligence Query modal with account context from current note
   */
  openIntelligenceQueryForCurrentNote(): void {
    const activeFile = this.app.workspace.getActiveFile();
    let accountContext: { id: string; name: string } | undefined = undefined;
    
    if (activeFile) {
      const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
      
      // Try to get account from frontmatter
      if (frontmatter?.account_id && frontmatter?.account) {
        accountContext = {
          id: frontmatter.account_id,
          name: frontmatter.account
        };
      } else if (frontmatter?.account) {
        // Try to find account ID from cached accounts
        const account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === frontmatter.account.toLowerCase()
        );
        if (account) {
          accountContext = { id: account.id, name: account.name };
        } else {
          accountContext = { id: '', name: frontmatter.account };
        }
      } else {
        // Try to detect account from file path (e.g., Accounts/Intel/Note1.md)
        const pathParts = activeFile.path.split('/');
        if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
          const folderName = pathParts[1];
          const account = this.settings.cachedAccounts.find(
            a => a.name.replace(/[<>:"/\\|?*]/g, '_').trim() === folderName
          );
          if (account) {
            accountContext = { id: account.id, name: account.name };
          } else {
            accountContext = { id: '', name: folderName };
          }
        }
      }
    }
    
    new IntelligenceQueryModal(this.app, this, accountContext).open();
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

  /**
   * Scan local account folders in the vault instead of fetching from server.
   * This uses ONLY the pre-loaded account folders, avoiding unwanted Salesforce accounts.
   */
  async scanLocalAccountFolders(): Promise<void> {
    try {
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      if (!accountsFolder || !(accountsFolder instanceof TFolder)) {
        // No accounts folder exists yet
        return;
      }

      const accounts: { id: string; name: string }[] = [];
      
      // Scan all subfolders in the Accounts folder
      for (const child of accountsFolder.children) {
        if (child instanceof TFolder) {
          // Use folder name as account name
          accounts.push({
            id: `local-${child.name.replace(/\s+/g, '-').toLowerCase()}`,
            name: child.name
          });
        }
      }

      // Update cached accounts
      this.settings.cachedAccounts = accounts;
      this.settings.lastSyncTime = new Date().toISOString();
      await this.saveSettings();

    } catch (error) {
      console.error('Failed to scan local account folders:', error);
    }
  }

  /**
   * Refresh account folders by checking for new account assignments
   * Creates folders for any accounts the user owns but doesn't have folders for
   * Returns the number of new folders created
   */
  async refreshAccountFolders(): Promise<number> {
    if (!this.settings.userEmail) {
      throw new Error('Please configure your email first');
    }

    const ownershipService = new AccountOwnershipService(this.settings.serverUrl);
    
    // Get current owned accounts from server (live data)
    const ownedAccounts = await ownershipService.getAccountsForUser(this.settings.userEmail);
    
    if (ownedAccounts.length === 0) {
      console.log('[Eudia] No accounts found for user');
      return 0;
    }

    // Get existing folder names
    const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
    const existingFolderNames: string[] = [];
    
    if (accountsFolder && accountsFolder instanceof TFolder) {
      for (const child of accountsFolder.children) {
        if (child instanceof TFolder) {
          existingFolderNames.push(child.name);
        }
      }
    }

    // Find accounts that don't have folders yet
    const newAccounts = await ownershipService.getNewAccounts(
      this.settings.userEmail, 
      existingFolderNames
    );

    if (newAccounts.length === 0) {
      console.log('[Eudia] All account folders exist');
      return 0;
    }

    console.log(`[Eudia] Creating ${newAccounts.length} new account folders`);
    
    // Fetch enrichment data then create folders with pre-populated content
    const enrichments = await this.fetchEnrichmentData(newAccounts);
    await this.createTailoredAccountFolders(newAccounts, enrichments);
    
    return newAccounts.length;
  }

  /**
   * Check for server-side sync flags (e.g. resync_accounts from cron or admin push).
   * If flags are found, trigger the appropriate action and consume the flags.
   */
  async checkAndConsumeSyncFlags(): Promise<void> {
    if (!this.settings.userEmail) return;

    const email = encodeURIComponent(this.settings.userEmail.toLowerCase().trim());
    const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';

    try {
      // Fetch pending sync flags
      const flagsResponse = await requestUrl({
        url: `${serverUrl}/api/admin/users/${email}/sync-flags`,
        method: 'GET',
      });

      const flags = flagsResponse.json?.flags || [];
      const pendingFlags = flags.filter((f: any) => !f.consumed_at);

      if (pendingFlags.length === 0) return;

      console.log(`[Eudia] Found ${pendingFlags.length} pending sync flag(s)`);

      let needsResync = false;

      for (const flag of pendingFlags) {
        if (flag.flag === 'resync_accounts') {
          needsResync = true;
          const payload = flag.payload || {};
          const added = payload.added?.length || 0;
          const removed = payload.removed?.length || 0;
          console.log(`[Eudia] Sync flag: resync_accounts (+${added} / -${removed})`);
        } else if (flag.flag === 'update_plugin') {
          new Notice('A plugin update is available. Please download the latest vault.');
        } else if (flag.flag === 'reset_setup') {
          console.log('[Eudia] Sync flag: reset_setup received');
          this.settings.setupCompleted = false;
          await this.saveSettings();
          new Notice('Setup has been reset by admin. Please re-run the setup wizard.');
        }
      }

      // Trigger account resync if needed
      if (needsResync) {
        console.log('[Eudia] Triggering account folder resync from sync flag...');
        new Notice('Syncing account updates...');
        const result = await this.syncAccountFolders();
        if (result.success) {
          new Notice(`Account sync complete: ${result.added} new, ${result.archived} archived`);
        } else {
          console.log(`[Eudia] Account resync error: ${result.error}`);
        }
      }

      // Consume all flags after processing
      try {
        await requestUrl({
          url: `${serverUrl}/api/admin/users/${email}/sync-flags/consume`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flagIds: pendingFlags.map((f: any) => f.id) }),
        });
        console.log(`[Eudia] Consumed ${pendingFlags.length} sync flag(s)`);
      } catch (consumeErr) {
        console.log('[Eudia] Failed to consume sync flags (will retry next startup)');
      }

    } catch (err) {
      // Non-critical -- silently ignore if endpoint not available
      console.log('[Eudia] Sync flag check skipped (endpoint not available)');
    }
  }

  /**
   * Sync account folders with Salesforce using the BL Book of Business endpoint
   * - Adapts folder creation based on user group (admin, exec, sales_leader, cs, bl)
   * - Adds new accounts as folders
   * - Optionally archives removed accounts
   * Returns sync result with counts
   */
  async syncAccountFolders(): Promise<{ success: boolean; added: number; archived: number; userGroup?: string; error?: string }> {
    if (!this.settings.userEmail) {
      return { success: false, added: 0, archived: 0, error: 'No email configured' };
    }

    const email = this.settings.userEmail.toLowerCase().trim();
    console.log(`[Eudia] Syncing account folders for: ${email}`);

    try {
      // Fetch from /api/bl-accounts/:email endpoint (now group-aware)
      const response = await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(email)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.accounts) {
        throw new Error(data.error || 'Invalid response from server');
      }

      // Extract user group and account info from response
      const userGroup: string = data.meta?.userGroup || 'bl';
      const queryDescription: string = data.meta?.queryDescription || 'accounts';
      const region: string | null = data.meta?.region || null;
      
      console.log(`[Eudia] User group: ${userGroup}, accounts: ${data.accounts.length} (${queryDescription})`);
      if (region) {
        console.log(`[Eudia] Sales Leader region: ${region}`);
      }

      // Two-tier accounts: active (had opp) and prospect (no opp)
      const serverAccounts: { id: string; name: string; customerType?: string; hasOpenOpps?: boolean; ownerName?: string; hadOpportunity?: boolean; website?: string; industry?: string }[] = data.accounts || [];
      const serverProspects: { id: string; name: string; customerType?: string; hadOpportunity?: boolean; website?: string; industry?: string }[] = data.prospectAccounts || [];
      
      const totalServerAccounts = serverAccounts.length + serverProspects.length;
      console.log(`[Eudia] Server returned: ${serverAccounts.length} active + ${serverProspects.length} prospects = ${totalServerAccounts} total`);
      
      // Get existing account folders and prospect files
      const accountsFolderObj = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      const existingFolders = new Map<string, TFolder>();
      const prospectsPath = `${this.settings.accountsFolder}/_Prospects`;
      const prospectsFolderObj = this.app.vault.getAbstractFileByPath(prospectsPath);
      // Track both folder-based and file-based prospect entries (handles migration from old single-file format)
      const existingProspectFolders = new Map<string, TFolder>();
      const existingProspectFiles = new Map<string, TFile>();
      
      if (accountsFolderObj && accountsFolderObj instanceof TFolder) {
        for (const child of accountsFolderObj.children) {
          if (child instanceof TFolder && !child.name.startsWith('_')) {
            existingFolders.set(child.name.toLowerCase().trim(), child);
          }
        }
      }
      
      if (prospectsFolderObj && prospectsFolderObj instanceof TFolder) {
        for (const child of prospectsFolderObj.children) {
          if (child instanceof TFolder) {
            existingProspectFolders.set(child.name.toLowerCase().trim(), child);
          } else if (child instanceof TFile && child.extension === 'md') {
            // Old single-file format -- track for migration
            existingProspectFiles.set(child.basename.toLowerCase().trim(), child);
          }
        }
      }

      // Determine changes for active accounts
      const serverAccountNames = new Set(serverAccounts.map(a => a.name.toLowerCase().trim()));
      
      // New active accounts = in server but not in local folders
      const newAccounts = serverAccounts.filter(account => {
        const normalizedName = account.name.toLowerCase().trim();
        return !existingFolders.has(normalizedName);
      });
      
      // New prospect accounts = not in prospect folders/files and not already an active folder
      const newProspects = serverProspects.filter(prospect => {
        const safeName = prospect.name.replace(/[<>:"/\\|?*]/g, '_').trim().toLowerCase();
        return !existingProspectFolders.has(safeName) && !existingProspectFiles.has(safeName) && !existingFolders.has(prospect.name.toLowerCase().trim());
      });
      
      // Promotion detection: accounts that are now active but still in _Prospects (folder or file)
      const promotedAccounts: typeof serverAccounts = [];
      for (const account of serverAccounts) {
        const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim().toLowerCase();
        const inProspects = existingProspectFolders.has(safeName) || existingProspectFiles.has(safeName);
        if (inProspects && !existingFolders.has(account.name.toLowerCase().trim())) {
          promotedAccounts.push(account);
        }
      }

      // Removed accounts = in local folders but not in server (BLs only)
      const allServerNames = new Set([
        ...serverAccounts.map(a => a.name.toLowerCase().trim()),
        ...serverProspects.map(a => a.name.toLowerCase().trim())
      ]);
      const removedFolders: TFolder[] = [];
      if (userGroup === 'bl') {
        for (const [normalizedName, folder] of existingFolders.entries()) {
          if (!allServerNames.has(normalizedName)) {
            removedFolders.push(folder);
          }
        }
      }

      let addedCount = 0;
      let archivedCount = 0;
      let promotedCount = 0;
      let prospectAddedCount = 0;

      // Handle promotions first: prospect -> active (move from _Prospects/ to Accounts/)
      if (promotedAccounts.length > 0) {
        console.log(`[Eudia] Promoting ${promotedAccounts.length} accounts from prospect to active`);
        for (const account of promotedAccounts) {
          const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
          const prospectFolder = existingProspectFolders.get(safeName.toLowerCase());
          const prospectFile = existingProspectFiles.get(safeName.toLowerCase());
          
          try {
            // Remove the prospect entry (folder or file)
            if (prospectFolder) {
              // Move folder from _Prospects/ to Accounts/ (rename path)
              const newPath = `${this.settings.accountsFolder}/${safeName}`;
              await this.app.vault.rename(prospectFolder, newPath);
              promotedCount++;
              new Notice(`${account.name} promoted to active`);
            } else if (prospectFile) {
              // Old single-file format: delete and create full folder
              await this.app.vault.delete(prospectFile);
              const singleAccount = [{
                id: account.id,
                name: account.name,
                type: account.customerType as 'Customer' | 'Prospect' | 'Target' | undefined,
                isOwned: true,
                hadOpportunity: true
              }];
              const singleEnrich = await this.fetchEnrichmentData(singleAccount);
              await this.createTailoredAccountFolders(singleAccount, singleEnrich);
              promotedCount++;
              new Notice(`${account.name} promoted to active -- full account folder created`);
            }
          } catch (err) {
            console.error(`[Eudia] Failed to promote ${account.name}:`, err);
          }
        }
      }

      // Create new active account folders
      if (newAccounts.length > 0) {
        console.log(`[Eudia] Creating ${newAccounts.length} new active account folders for ${userGroup}`);
        
        // Filter out already-promoted accounts
        const promotedNames = new Set(promotedAccounts.map(a => a.name.toLowerCase().trim()));
        const nonPromotedNew = newAccounts.filter(a => !promotedNames.has(a.name.toLowerCase().trim()));
        
        if (nonPromotedNew.length > 0) {
          const accountsToCreate = nonPromotedNew.map(a => ({
            id: a.id,
            name: a.name,
            type: a.customerType as 'Customer' | 'Prospect' | 'Target' | undefined,
            isOwned: userGroup === 'bl',
            ownerName: a.ownerName,
            hadOpportunity: true
          }));
          
          if (userGroup === 'admin' || userGroup === 'exec') {
            await this.createAdminAccountFolders(accountsToCreate);
          } else {
            const newEnrichments = await this.fetchEnrichmentData(accountsToCreate);
            await this.createTailoredAccountFolders(accountsToCreate, newEnrichments);
          }
          
          addedCount = nonPromotedNew.length;
        }
        
        if (this.telemetry) {
          this.telemetry.reportInfo('Accounts synced - added', { 
            count: addedCount,
            userGroup,
            region: region || undefined
          });
        }
      }
      
      // Create new prospect files
      if (newProspects.length > 0 && userGroup === 'bl') {
        console.log(`[Eudia] Creating ${newProspects.length} new prospect files`);
        prospectAddedCount = await this.createProspectAccountFiles(newProspects.map(p => ({
          id: p.id,
          name: p.name,
          type: 'Prospect' as const,
          hadOpportunity: false,
          website: p.website,
          industry: p.industry
        })));
      }

      // Archive removed folders (only for BLs with setting enabled)
      if (this.settings.archiveRemovedAccounts && removedFolders.length > 0) {
        console.log(`[Eudia] Archiving ${removedFolders.length} removed account folders`);
        archivedCount = await this.archiveAccountFolders(removedFolders);
        
        if (this.telemetry) {
          this.telemetry.reportInfo('Accounts synced - archived', { count: archivedCount });
        }
      }

      console.log(`[Eudia] Sync complete: ${addedCount} active added, ${prospectAddedCount} prospects added, ${promotedCount} promoted, ${archivedCount} archived (group: ${userGroup})`);
      
      return { success: true, added: addedCount + prospectAddedCount + promotedCount, archived: archivedCount, userGroup };

    } catch (error: any) {
      console.error('[Eudia] Account sync error:', error);
      
      // Report error to telemetry
      if (this.telemetry) {
        this.telemetry.reportError('Account sync failed', { error: error.message });
      }
      
      return { success: false, added: 0, archived: 0, error: error.message };
    }
  }

  /**
   * Archive account folders by moving them to _Archived directory
   * Preserves all content, just moves the folder
   */
  async archiveAccountFolders(folders: TFolder[]): Promise<number> {
    let archivedCount = 0;
    
    // Ensure _Archived folder exists
    const archivePath = `${this.settings.accountsFolder}/_Archived`;
    let archiveFolder = this.app.vault.getAbstractFileByPath(archivePath);
    
    if (!archiveFolder) {
      await this.app.vault.createFolder(archivePath);
    }
    
    for (const folder of folders) {
      try {
        const newPath = `${archivePath}/${folder.name}`;
        
        // Check if destination already exists
        const existing = this.app.vault.getAbstractFileByPath(newPath);
        if (existing) {
          // Add timestamp to avoid collision
          const timestamp = new Date().toISOString().split('T')[0];
          await this.app.fileManager.renameFile(folder, `${archivePath}/${folder.name}_${timestamp}`);
        } else {
          await this.app.fileManager.renameFile(folder, newPath);
        }
        
        // Create archive marker file
        const markerPath = `${archivePath}/${folder.name}/_archived.md`;
        const markerContent = `---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;
        try {
          await this.app.vault.create(markerPath, markerContent);
        } catch (e) {
          // Marker creation is non-critical
        }
        
        archivedCount++;
        console.log(`[Eudia] Archived: ${folder.name}`);
        
      } catch (error) {
        console.error(`[Eudia] Failed to archive ${folder.name}:`, error);
      }
    }
    
    return archivedCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SALESFORCE NOTE SYNC
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Core Salesforce sync logic for any given file.
   * Returns success/error status for use by both the manual command and the auto-scanner.
   */
  async syncSpecificNoteToSalesforce(file: TFile): Promise<{ success: boolean; error?: string; authRequired?: boolean }> {
    const content = await this.app.vault.read(file);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

    if (!frontmatter?.sync_to_salesforce) {
      return { success: false, error: 'sync_to_salesforce not enabled' };
    }

    // Find account — check frontmatter first
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
      // Try to detect from path: Accounts/FolderName/... or Accounts/_Prospects/FolderName/...
      const pathParts = file.path.split('/');
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        // Skip _Prospects segment if present
        const folderName = pathParts[1] === '_Prospects' && pathParts.length >= 3
          ? pathParts[2]
          : pathParts[1];
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
      return { success: false, error: `Could not determine account for ${file.path}` };
    }

    try {
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/notes/sync`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountName,
          noteTitle: file.basename,
          notePath: file.path,
          content,
          frontmatter,
          syncedAt: new Date().toISOString(),
          userEmail: this.settings.userEmail
        })
      });

      if (response.json?.success) {
        return { success: true };
      } else {
        return {
          success: false,
          error: response.json?.error || 'Unknown error',
          authRequired: response.json?.authRequired
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Command-palette wrapper: syncs the currently active note to Salesforce.
   */
  async copyForSlack(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No note open to copy');
      return;
    }

    try {
      const content = await this.app.vault.read(activeFile);

      // Extract frontmatter account name
      const accountMatch = content.match(/^account:\s*"?([^"\n]+)"?/m);
      const account = accountMatch?.[1] || activeFile.parent?.name || 'Meeting';

      // Extract date
      const dateMatch = content.match(/^last_updated:\s*(\S+)/m);
      const date = dateMatch?.[1] || new Date().toISOString().split('T')[0];

      // Extract Summary section
      let summary = '';
      const summaryMatch = content.match(/## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);
      if (summaryMatch) {
        const bullets = summaryMatch[1].trim().split('\n')
          .filter(l => l.startsWith('-') || l.startsWith('•'))
          .slice(0, 3)
          .map(l => l.replace(/^[-•]\s*/, '').trim());
        summary = bullets.join('\n');
      }

      // Extract Next Steps
      let nextSteps = '';
      const nsMatch = content.match(/## Next Steps\n([\s\S]*?)(?=\n## |\n---|\Z)/);
      if (nsMatch) {
        const items = nsMatch[1].trim().split('\n')
          .filter(l => l.startsWith('-') || l.startsWith('•'))
          .slice(0, 3)
          .map(l => l.replace(/^[-•\s[\]x]*/, '').trim());
        nextSteps = items.join('\n• ');
      }

      // Extract a key quote
      let quote = '';
      const quoteMatch = content.match(/"([^"]{20,120})"/);
      if (quoteMatch) {
        quote = quoteMatch[1];
      }

      // Build Slack-friendly format
      let slackText = `*${account} — ${date}*\n`;
      if (summary) slackText += `${summary}\n`;
      if (nextSteps) slackText += `\n*Next Steps:*\n• ${nextSteps}\n`;
      if (quote) slackText += `\n> _"${quote}"_\n`;

      await navigator.clipboard.writeText(slackText);
      new Notice('Copied for Slack ✓', 3000);
    } catch (err: any) {
      new Notice('Failed to copy: ' + (err.message || ''));
    }
  }

  async syncNoteToSalesforce(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to sync');
      return;
    }

    const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
    if (!frontmatter?.sync_to_salesforce) {
      new Notice('Set sync_to_salesforce: true in frontmatter to enable sync');
      return;
    }

    new Notice('Syncing to Salesforce...');
    const result = await this.syncSpecificNoteToSalesforce(activeFile);

    if (result.success) {
      new Notice('Synced to Salesforce');
    } else if (result.authRequired) {
      new Notice('Salesforce authentication required. Please reconnect.');
    } else {
      new Notice('Failed to sync: ' + (result.error || 'Unknown error'));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT ENRICHMENT (Pre-populate subnotes with Salesforce data)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Auto-enrich check: scans account folders for unenriched Contacts.md files
   * (missing enriched_at in frontmatter) and triggers enrichment for those accounts.
   * Runs silently in background on startup — no UI blocking.
   */
  async checkAndAutoEnrich(): Promise<void> {
    const accountsFolder = this.settings.accountsFolder || 'Accounts';
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!folder || !(folder instanceof TFolder)) return;

    const unenrichedAccounts: OwnedAccount[] = [];

    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;
      // Skip _Prospects and _Archive folders
      if (child.name.startsWith('_')) continue;

      const contactsPath = `${child.path}/Contacts.md`;
      const contactsFile = this.app.vault.getAbstractFileByPath(contactsPath);

      if (!contactsFile || !(contactsFile instanceof TFile)) {
        // No Contacts.md at all — needs enrichment
      } else {
        // Check frontmatter for enriched_at
        const cache = this.app.metadataCache.getFileCache(contactsFile);
        if (cache?.frontmatter?.enriched_at) {
          // Already enriched, skip
          continue;
        }
      }

      // Find account in cached accounts by folder name
      const safeFolderName = child.name;
      const matched = this.settings.cachedAccounts.find(
        a => a.name.replace(/[<>:"/\\|?*]/g, '_').trim() === safeFolderName
      );

      if (matched && matched.id) {
        unenrichedAccounts.push({
          id: matched.id,
          name: matched.name,
          owner: '',
          ownerEmail: ''
        });
      }
    }

    if (unenrichedAccounts.length === 0) {
      console.log('[Eudia] Auto-enrich: all account folders already enriched');
      return;
    }

    console.log(`[Eudia] Auto-enrich: ${unenrichedAccounts.length} accounts need enrichment`);
    try {
      await this.enrichAccountFolders(unenrichedAccounts);
    } catch (err) {
      console.error('[Eudia] Auto-enrich failed:', err);
    }
  }

  /**
   * Enrich account folders with Salesforce data (contacts, intelligence, opportunities, etc.).
   * Calls the batch enrichment endpoint in groups of 20, then writes formatted markdown
   * into each account's subnotes. Non-blocking — runs after folder creation.
   */
  async enrichAccountFolders(accounts: OwnedAccount[]): Promise<void> {
    if (!accounts || accounts.length === 0) return;

    const serverUrl = this.settings.serverUrl || 'https://gtm-wizard.onrender.com';
    const accountsFolder = this.settings.accountsFolder || 'Accounts';

    // Collect accounts with real Salesforce IDs (18-char, start with '001') — reject static placeholder IDs
    const accountsWithIds = accounts.filter(a => a.id && a.id.startsWith('001'));
    if (accountsWithIds.length === 0) return;

    const totalAccounts = accountsWithIds.length;
    let enrichedCount = 0;
    let errorCount = 0;

    console.log(`[Eudia Enrich] Starting enrichment for ${totalAccounts} accounts`);
    new Notice(`Enriching account data: 0/${totalAccounts}...`);

    // Batch into groups of 20
    const batchSize = 20;
    for (let i = 0; i < accountsWithIds.length; i += batchSize) {
      const batch = accountsWithIds.slice(i, i + batchSize);
      const batchIds = batch.map(a => a.id);

      try {
        const response = await requestUrl({
          url: `${serverUrl}/api/accounts/enrich-batch`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountIds: batchIds,
            userEmail: this.settings.userEmail
          })
        });

        if (response.json?.success && response.json?.enrichments) {
          const enrichments = response.json.enrichments;

          for (const account of batch) {
            const data = enrichments[account.id];
            if (!data) continue;

            try {
              await this.writeEnrichmentToAccount(account, data, accountsFolder);
              enrichedCount++;
            } catch (writeErr) {
              errorCount++;
              console.error(`[Eudia Enrich] Write failed for ${account.name}:`, writeErr);
            }
          }
        }
      } catch (fetchErr) {
        errorCount += batch.length;
        console.error(`[Eudia Enrich] Batch fetch failed:`, fetchErr);
      }

      // Progress notice every batch
      const processed = Math.min(i + batchSize, totalAccounts);
      new Notice(`Enriching account data: ${processed}/${totalAccounts}...`);

      // Minimal delay between batches (server handles concurrency fine)
      if (i + batchSize < accountsWithIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const summary = errorCount > 0
      ? `Enrichment complete: ${enrichedCount} enriched, ${errorCount} skipped`
      : `Enrichment complete: ${enrichedCount} accounts enriched with Salesforce data`;
    console.log(`[Eudia Enrich] ${summary}`);
    new Notice(summary);
  }

  /**
   * Write enrichment data into an account's subnotes.
   * Looks for the account folder (in Accounts/ or Accounts/_Prospects/),
   * then updates Contacts.md, Intelligence.md, Next Steps.md, and Meeting Notes.md.
   */
  private async writeEnrichmentToAccount(
    account: OwnedAccount,
    data: { contacts?: string; intelligence?: string; opportunities?: string; nextSteps?: string; recentActivity?: string; customerBrain?: string },
    accountsFolder: string
  ): Promise<void> {
    const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();

    // Try both regular and prospect paths
    let folderPath = `${accountsFolder}/${safeName}`;
    let folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      folderPath = `${accountsFolder}/_Prospects/${safeName}`;
      folder = this.app.vault.getAbstractFileByPath(folderPath);
    }
    if (!(folder instanceof TFolder)) return;

    const now = new Date().toISOString();

    // Helper: update a subnote by replacing placeholder content after frontmatter
    const updateSubnote = async (filename: string, newContent: string) => {
      const filePath = `${folderPath}/${filename}`;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      const existing = await this.app.vault.read(file);

      // Split frontmatter from body
      let frontmatter = '';
      let body = existing;
      if (existing.startsWith('---')) {
        const endIdx = existing.indexOf('---', 3);
        if (endIdx !== -1) {
          frontmatter = existing.substring(0, endIdx + 3);
          body = existing.substring(endIdx + 3);

          // Add enriched_at to frontmatter
          if (frontmatter.includes('enriched_at:')) {
            frontmatter = frontmatter.replace(/enriched_at:.*/, `enriched_at: "${now}"`);
          } else {
            frontmatter = frontmatter.substring(0, endIdx) + `enriched_at: "${now}"\n---`;
          }
        }
      }

      // Find the heading that matches the note type and preserve the heading
      // For contacts: replace everything after "# AccountName - Key Contacts"
      // For intelligence: replace everything after "# AccountName - Account Intelligence"
      // For next steps: replace everything after "# AccountName - Next Steps"
      // For meeting notes: append recent activity section

      const headingMatch = body.match(/^(\s*#[^\n]+)/);
      const heading = headingMatch ? headingMatch[1] : '';

      const updatedBody = `${heading}\n\n${newContent}\n`;
      await this.app.vault.modify(file, `${frontmatter}\n${updatedBody}`);
    };

    // Update each subnote with enrichment data
    if (data.contacts) {
      await updateSubnote('Contacts.md', `${data.contacts}\n\n## Relationship Map\n\n*Add org chart, decision makers, champions, and blockers here.*`);
    }

    if (data.intelligence) {
      await updateSubnote('Intelligence.md', data.intelligence);
    }

    if (data.nextSteps) {
      await updateSubnote('Next Steps.md', data.nextSteps);
    }

    // Meeting Notes: append opportunities + recent activity (don't replace the whole file)
    if (data.opportunities || data.recentActivity) {
      const meetingPath = `${folderPath}/Meeting Notes.md`;
      const meetingFile = this.app.vault.getAbstractFileByPath(meetingPath);
      if (meetingFile instanceof TFile) {
        const existing = await this.app.vault.read(meetingFile);

        // Split frontmatter
        let frontmatter = '';
        let body = existing;
        if (existing.startsWith('---')) {
          const endIdx = existing.indexOf('---', 3);
          if (endIdx !== -1) {
            frontmatter = existing.substring(0, endIdx + 3);
            body = existing.substring(endIdx + 3);
            if (frontmatter.includes('enriched_at:')) {
              frontmatter = frontmatter.replace(/enriched_at:.*/, `enriched_at: "${now}"`);
            } else {
              frontmatter = frontmatter.substring(0, endIdx) + `enriched_at: "${now}"\n---`;
            }
          }
        }

        const headingMatch = body.match(/^(\s*#[^\n]+)/);
        const heading = headingMatch ? headingMatch[1] : `\n# ${account.name} - Meeting Notes`;

        const sections = [heading, ''];
        if (data.opportunities) sections.push(data.opportunities, '');
        if (data.recentActivity) sections.push(data.recentActivity, '');
        sections.push('## Quick Start', '', '1. Open **Note 1** for your next meeting', '2. Click the **microphone** to record and transcribe', '3. **Next Steps** are auto-extracted after transcription', '4. Set `sync_to_salesforce: true` to sync to Salesforce');

        await this.app.vault.modify(meetingFile, `${frontmatter}\n${sections.join('\n')}\n`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SALESFORCE AUTO-SYNC SCANNER
  // ─────────────────────────────────────────────────────────────────────────

  private sfSyncStatusBarEl: HTMLElement | null = null;
  private sfSyncIntervalId: number | null = null;

  /**
   * Start the periodic Salesforce sync scanner.
   * Every N minutes, scans all notes under Accounts/ (including _Prospects/) for
   * sync_to_salesforce: true, and pushes any that have been modified since last sync.
   */
  startSalesforceSyncScanner(): void {
    if (!this.settings.sfAutoSyncEnabled) {
      console.log('[Eudia SF Sync] Auto-sync is disabled in settings');
      this.updateSfSyncStatusBar('SF Sync: Off');
      return;
    }

    const intervalMs = (this.settings.sfAutoSyncIntervalMinutes || 15) * 60 * 1000;
    console.log(`[Eudia SF Sync] Starting scanner — interval: ${this.settings.sfAutoSyncIntervalMinutes}min`);
    this.updateSfSyncStatusBar('SF Sync: Idle');

    // Run once shortly after startup (30s delay), then on interval
    const startupDelay = window.setTimeout(() => {
      this.runSalesforceSyncScan();
    }, 30000);
    this.registerInterval(startupDelay as unknown as number);

    this.sfSyncIntervalId = window.setInterval(() => {
      this.runSalesforceSyncScan();
    }, intervalMs);
    this.registerInterval(this.sfSyncIntervalId);
  }

  /**
   * Run a single scan cycle: find all flagged notes, sync those that changed.
   */
  private async runSalesforceSyncScan(): Promise<void> {
    if (!this.settings.sfAutoSyncEnabled || !this.settings.userEmail) return;

    console.log('[Eudia SF Sync] Running scan...');

    try {
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      if (!(accountsFolder instanceof TFolder)) {
        console.log('[Eudia SF Sync] Accounts folder not found');
        return;
      }

      // Collect all markdown files recursively under Accounts/
      const allFiles: TFile[] = [];
      const collectFiles = (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile && child.extension === 'md') {
            allFiles.push(child);
          } else if (child instanceof TFolder) {
            collectFiles(child);
          }
        }
      };
      collectFiles(accountsFolder);

      // Filter to notes with sync_to_salesforce: true that have changed since last sync
      const notesToSync: TFile[] = [];
      for (const file of allFiles) {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm?.sync_to_salesforce) continue;

        const lastSfSync = fm.last_sf_sync ? new Date(fm.last_sf_sync).getTime() : 0;
        const lastModified = file.stat.mtime;

        if (lastModified > lastSfSync) {
          notesToSync.push(file);
        }
      }

      if (notesToSync.length === 0) {
        console.log('[Eudia SF Sync] No flagged notes need syncing');
        this.updateSfSyncStatusBar('SF Sync: Idle');
        return;
      }

      console.log(`[Eudia SF Sync] ${notesToSync.length} note(s) queued for sync`);
      this.updateSfSyncStatusBar(`SF Sync: Syncing ${notesToSync.length}...`);

      let successCount = 0;
      let errorCount = 0;

      for (const file of notesToSync) {
        const result = await this.syncSpecificNoteToSalesforce(file);

        if (result.success) {
          successCount++;
          // Update frontmatter with last_sf_sync timestamp
          await this.updateNoteSyncTimestamp(file);
        } else {
          errorCount++;
          console.log(`[Eudia SF Sync] Failed to sync ${file.path}: ${result.error}`);
          if (result.authRequired) {
            // Auth failure — stop the scan, notify user
            new Notice('Salesforce authentication expired. Please reconnect to resume auto-sync.');
            this.updateSfSyncStatusBar('SF Sync: Auth required');
            return;
          }
        }
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const statusMsg = errorCount > 0
        ? `SF Sync: ${successCount} synced, ${errorCount} failed at ${timeStr}`
        : `SF Sync: ${successCount} note${successCount !== 1 ? 's' : ''} synced at ${timeStr}`;

      console.log(`[Eudia SF Sync] ${statusMsg}`);
      this.updateSfSyncStatusBar(statusMsg);

      if (successCount > 0) {
        new Notice(statusMsg);
      }

    } catch (err) {
      console.error('[Eudia SF Sync] Scan error:', err);
      this.updateSfSyncStatusBar('SF Sync: Error');
    }
  }

  /**
   * Update a note's frontmatter to record when it was last synced to Salesforce.
   */
  private async updateNoteSyncTimestamp(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const now = new Date().toISOString();

      if (content.startsWith('---')) {
        // Has frontmatter — insert or update last_sf_sync
        const endIndex = content.indexOf('---', 3);
        if (endIndex !== -1) {
          const fmBlock = content.substring(0, endIndex);
          const rest = content.substring(endIndex);

          if (fmBlock.includes('last_sf_sync:')) {
            // Replace existing
            const updated = fmBlock.replace(/last_sf_sync:.*/, `last_sf_sync: "${now}"`) + rest;
            await this.app.vault.modify(file, updated);
          } else {
            // Add before closing ---
            const updated = fmBlock + `last_sf_sync: "${now}"\n` + rest;
            await this.app.vault.modify(file, updated);
          }
        }
      }
      // If no frontmatter, skip — the note shouldn't have sync_to_salesforce without frontmatter
    } catch (err) {
      console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${file.path}:`, err);
    }
  }

  /**
   * Update the SF sync status bar text.
   */
  updateSfSyncStatusBar(text: string): void {
    if (this.sfSyncStatusBarEl) {
      this.sfSyncStatusBarEl.setText(text);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS DASHBOARD REFRESH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Refresh analytics dashboard notes with data from the API
   * Called when opening analytics notes or on demand
   */
  async refreshAnalyticsDashboard(file: TFile): Promise<void> {
    if (!this.settings.userEmail) {
      console.log('[Eudia] Cannot refresh analytics - no email configured');
      return;
    }

    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return;

    const frontmatter = frontmatterMatch[1];
    if (!frontmatter.includes('type: analytics_dashboard')) return;

    // Determine which analytics to fetch
    const category = frontmatter.match(/category:\s*(\w+)/)?.[1] || 'team';
    
    console.log(`[Eudia] Refreshing analytics dashboard: ${file.name} (${category})`);

    try {
      let data: any = null;
      const serverUrl = this.settings.serverUrl;
      const email = encodeURIComponent(this.settings.userEmail);

      switch (category) {
        case 'pain_points':
          const ppResponse = await requestUrl({
            url: `${serverUrl}/api/analytics/pain-points?days=30`,
            method: 'GET'
          });
          data = ppResponse.json;
          if (data.success) {
            await this.updatePainPointNote(file, data.painPoints);
          }
          break;

        case 'objections':
          const objResponse = await requestUrl({
            url: `${serverUrl}/api/analytics/objection-playbook?days=90`,
            method: 'GET'
          });
          data = objResponse.json;
          if (data.success) {
            await this.updateObjectionNote(file, data);
          }
          break;

        case 'coaching':
        case 'team':
        default:
          const teamResponse = await requestUrl({
            url: `${serverUrl}/api/analytics/team-trends?managerId=${email}`,
            method: 'GET'
          });
          data = teamResponse.json;
          if (data.success) {
            await this.updateTeamPerformanceNote(file, data.trends);
          }
          break;
      }

      if (data?.success) {
        new Notice(`Analytics refreshed: ${file.name}`);
      }

    } catch (error: any) {
      console.error('[Eudia] Analytics refresh error:', error);
      // Don't show error notice for every refresh - might be normal during offline
    }
  }

  /**
   * Update pain point tracker note with API data
   */
  async updatePainPointNote(file: TFile, painPoints: any[]): Promise<void> {
    if (!painPoints || painPoints.length === 0) return;

    const dateStr = new Date().toISOString().split('T')[0];
    
    // Build table rows
    const tableRows = painPoints.slice(0, 10).map(pp => 
      `| ${pp.painPoint || '--'} | ${pp.count || 0} | ${pp.category || '--'} | ${pp.averageSeverity || 'medium'} |`
    ).join('\n');

    // Build by-category sections
    const byCategory: Record<string, any[]> = {};
    for (const pp of painPoints) {
      const cat = pp.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(pp);
    }

    let categoryContent = '';
    for (const [cat, pps] of Object.entries(byCategory)) {
      categoryContent += `\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
      for (const pp of pps.slice(0, 3)) {
        categoryContent += `- ${pp.painPoint}\n`;
      }
    }

    // Build quotes section
    const quotesContent = painPoints
      .filter(pp => pp.exampleQuotes && pp.exampleQuotes.length > 0)
      .slice(0, 5)
      .map(pp => `> "${pp.exampleQuotes[0]}" - on ${pp.painPoint}`)
      .join('\n\n');

    const newContent = `---
type: analytics_dashboard
auto_refresh: true
category: pain_points
last_updated: ${dateStr}
---

# Customer Pain Point Tracker

*Aggregated pain points from customer conversations*

---

## Top Pain Points (Last 30 Days)

| Pain Point | Frequency | Category | Severity |
|------------|-----------|----------|----------|
${tableRows}

---

## By Category
${categoryContent}

---

## Example Quotes

${quotesContent || '*No quotes available*'}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;

    await this.app.vault.modify(file, newContent);
  }

  /**
   * Update objection playbook note with API data
   */
  async updateObjectionNote(file: TFile, data: any): Promise<void> {
    if (!data.objections || data.objections.length === 0) return;

    const dateStr = new Date().toISOString().split('T')[0];
    
    // Build table rows
    const tableRows = data.objections.slice(0, 10).map((obj: any) => {
      const status = obj.handleRatePercent >= 75 ? '✅ Strong' : 
                     obj.handleRatePercent >= 50 ? '⚠️ Moderate' : '❌ Needs Work';
      return `| ${obj.objection?.substring(0, 40) || '--'}... | ${obj.count || 0} | ${obj.handleRatePercent || 0}% | ${status} |`;
    }).join('\n');

    // Build best practices section
    let bestPracticesContent = '';
    for (const obj of data.objections.slice(0, 5)) {
      if (obj.bestResponses && obj.bestResponses.length > 0) {
        bestPracticesContent += `\n### Objection: "${obj.objection?.substring(0, 50)}..."\n\n`;
        bestPracticesContent += `**Frequency:** ${obj.count} times  \n`;
        bestPracticesContent += `**Handle Rate:** ${obj.handleRatePercent}%\n\n`;
        bestPracticesContent += `**Best Responses:**\n`;
        for (const resp of obj.bestResponses.slice(0, 2)) {
          bestPracticesContent += `1. *"${resp.response}"* - ${resp.rep || 'Team member'}\n`;
        }
        bestPracticesContent += '\n';
      }
    }

    const newContent = `---
type: analytics_dashboard
auto_refresh: true
category: objections
last_updated: ${dateStr}
---

# Objection Playbook

*Common objections with handling success rates and best responses*

---

## Top Objections (Last 90 Days)

| Objection | Frequency | Handle Rate | Status |
|-----------|-----------|-------------|--------|
${tableRows}

---

## Best Practices
${bestPracticesContent || '*No best practices available yet*'}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${data.avgHandleRate || 0}%

---

> **Tip:** Review this playbook before important calls.
`;

    await this.app.vault.modify(file, newContent);
  }

  /**
   * Update team performance note with API data
   */
  async updateTeamPerformanceNote(file: TFile, trends: any): Promise<void> {
    if (!trends) return;

    const dateStr = new Date().toISOString().split('T')[0];
    
    // Format trend arrows
    const trendArrow = (val: number) => val > 0 ? `↑ ${Math.abs(val).toFixed(1)}%` : 
                                         val < 0 ? `↓ ${Math.abs(val).toFixed(1)}%` : '--';

    const newContent = `---
type: analytics_dashboard
auto_refresh: true
refresh_interval: daily
last_updated: ${dateStr}
---

# Team Performance Dashboard

*Auto-updated from GTM Brain analytics*

---

## Team Overview

| Metric | This Week | Trend |
|--------|-----------|-------|
| Calls Analyzed | ${trends.callCount || 0} | -- |
| Avg Score | ${trends.avgScore?.toFixed(1) || '--'} | ${trendArrow(trends.scoreTrend)} |
| Talk Ratio | ${trends.avgTalkRatio ? Math.round(trends.avgTalkRatio * 100) : '--'}% | ${trendArrow(trends.talkRatioTrend)} |
| Value Score | ${trends.avgValueScore?.toFixed(1) || '--'} | ${trendArrow(trends.valueScoreTrend)} |
| Next Step Rate | ${trends.nextStepRate ? Math.round(trends.nextStepRate * 100) : '--'}% | -- |

---

## Top Pain Points

${trends.topPainPoints?.slice(0, 5).map((pp: any) => `- **${pp.painPoint}** (${pp.count} mentions)`).join('\n') || '*No pain points captured yet*'}

---

## Trending Topics

${trends.trendingTopics?.slice(0, 8).map((t: any) => `- ${t.topic} (${t.count})`).join('\n') || '*No topics captured yet*'}

---

## Top Objections

${trends.topObjections?.slice(0, 5).map((obj: any) => `- ${obj.objection} - ${obj.handleRatePercent}% handled`).join('\n') || '*No objections captured yet*'}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;

    await this.app.vault.modify(file, newContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO SETUP WIZARD
// ═══════════════════════════════════════════════════════════════════════════

class AudioSetupWizardModal extends Modal {
  plugin: EudiaSyncPlugin;
  private onComplete: () => void;

  constructor(app: App, plugin: EudiaSyncPlugin, onComplete: () => void = () => {}) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = 'max-width: 540px; padding: 24px;';

    contentEl.createEl('h2', { text: 'Audio Setup for Full-Call Recording' });

    const intro = contentEl.createDiv();
    intro.style.cssText = 'margin-bottom: 20px; line-height: 1.6; color: var(--text-muted);';
    intro.setText(
      'To capture both sides of a call with the best quality, install a virtual audio device. ' +
      'This creates a software loopback that lets the plugin record system audio (the other person) ' +
      'alongside your microphone.'
    );

    const isMac = navigator.platform?.toLowerCase().includes('mac') || navigator.userAgent?.includes('Mac');

    // Step 1: Install driver
    const step1 = contentEl.createDiv();
    step1.style.cssText = 'padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 12px;';
    step1.createEl('h4', { text: 'Step 1: Install Virtual Audio Driver' });

    if (isMac) {
      const macInfo = step1.createDiv();
      macInfo.style.cssText = 'line-height: 1.6;';
      macInfo.innerHTML = `
        <p>Install <strong>BlackHole 2ch</strong> (free, open-source):</p>
        <ol style="padding-left: 20px; margin: 8px 0;">
          <li>Download from <a href="https://existential.audio/blackhole/" style="color:var(--text-accent);">existential.audio/blackhole</a></li>
          <li>Run the installer (requires admin password)</li>
          <li>Restart Obsidian after installation</li>
        </ol>
      `;
    } else {
      const winInfo = step1.createDiv();
      winInfo.style.cssText = 'line-height: 1.6;';
      winInfo.innerHTML = `
        <p>Install <strong>VB-Cable</strong> (free):</p>
        <ol style="padding-left: 20px; margin: 8px 0;">
          <li>Download from <a href="https://vb-audio.com/Cable/" style="color:var(--text-accent);">vb-audio.com/Cable</a></li>
          <li>Run the installer as Administrator</li>
          <li>Restart Obsidian after installation</li>
        </ol>
      `;
    }

    // Step 2: Multi-Output Device (Mac only)
    if (isMac) {
      const step2 = contentEl.createDiv();
      step2.style.cssText = 'padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 12px;';
      step2.createEl('h4', { text: 'Step 2: Create Multi-Output Device (macOS)' });
      const macStep2 = step2.createDiv();
      macStep2.style.cssText = 'line-height: 1.6;';
      macStep2.innerHTML = `
        <p>This routes audio to your speakers AND BlackHole simultaneously:</p>
        <ol style="padding-left: 20px; margin: 8px 0;">
          <li>Open <strong>Audio MIDI Setup</strong> (search in Spotlight)</li>
          <li>Click the <strong>+</strong> button at bottom-left, select "Create Multi-Output Device"</li>
          <li>Check both <strong>Built-in Output</strong> (or your speakers) and <strong>BlackHole 2ch</strong></li>
          <li>Right-click the Multi-Output Device and select "Use This Device For Sound Output"</li>
        </ol>
        <p style="color: var(--text-muted); font-size: 12px;">
          You can switch back to normal speakers when not recording. The plugin auto-detects BlackHole.
        </p>
      `;
    }

    // Verify button
    const verifyContainer = contentEl.createDiv();
    verifyContainer.style.cssText = 'padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;';
    verifyContainer.createEl('h4', { text: isMac ? 'Step 3: Verify Setup' : 'Step 2: Verify Setup' });

    const verifyResult = verifyContainer.createDiv();
    verifyResult.style.cssText = 'margin-bottom: 12px; font-size: 13px;';

    const verifyBtn = verifyContainer.createEl('button', { text: 'Scan for Virtual Audio Device' });
    verifyBtn.style.cssText = 'padding: 8px 16px; cursor: pointer; border-radius: 6px; margin-right: 8px;';
    verifyBtn.onclick = async () => {
      verifyResult.setText('Scanning...');
      try {
        try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch {}
        const device = await AudioRecorder.detectVirtualAudioDevice();
        if (device) {
          verifyResult.innerHTML = `<span style="color:#22c55e;">&#10003;</span> Found: <strong>${device.label}</strong>. You're all set!`;
          this.plugin.settings.audioSystemDeviceId = device.deviceId;
          await this.plugin.saveSettings();
        } else {
          verifyResult.innerHTML = '<span style="color:#f59e0b;">&#9888;</span> No virtual audio device found. Make sure the driver is installed and Obsidian was restarted.';
        }
      } catch (e: any) {
        verifyResult.innerHTML = `<span style="color:#ef4444;">Scan failed: ${e.message}</span>`;
      }
    };

    // Action buttons
    const actions = contentEl.createDiv();
    actions.style.cssText = 'display: flex; justify-content: space-between; margin-top: 20px;';

    const skipBtn = actions.createEl('button', { text: 'Skip — I\'ll use Speaker Mode' });
    skipBtn.style.cssText = 'padding: 10px 20px; cursor: pointer; border-radius: 6px; opacity: 0.7;';
    skipBtn.onclick = async () => {
      this.plugin.settings.audioSetupDismissed = true;
      await this.plugin.saveSettings();
      this.close();
      this.onComplete();
    };

    const doneBtn = actions.createEl('button', { text: 'Done' });
    doneBtn.style.cssText = 'padding: 10px 20px; cursor: pointer; border-radius: 6px; font-weight: 600;';
    doneBtn.onclick = () => {
      this.close();
      this.onComplete();
    };
  }

  onClose() {
    this.contentEl.empty();
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

    // ─────────────────────────────────────────────────────────────────────
    // SALESFORCE OAUTH - Define status checking functions FIRST
    // (so they can be referenced by the email onChange handler)
    // ─────────────────────────────────────────────────────────────────────
    
    const sfContainer = containerEl.createDiv();
    sfContainer.style.cssText = 'padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;';
    
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
    
    // Check status - now defined before email setting so it can be called on email change
    const checkStatus = async () => {
      if (!this.plugin.settings.userEmail) {
        statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);';
        statusText.setText('Enter email above first');
        sfButton.setText('Setup Required');
        sfButton.disabled = true;
        sfButton.style.opacity = '0.5';
        sfButton.style.cursor = 'not-allowed';
        return false;
      }
      
      // Enable button immediately when email is entered (while checking status)
      sfButton.disabled = false;
      sfButton.style.opacity = '1';
      sfButton.style.cursor = 'pointer';
      
      try {
        statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;';
        statusText.setText('Checking...');
        
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
          this.plugin.settings.salesforceConnected = true;
          await this.plugin.saveSettings();
          return true;  // Connected
        } else {
          statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;';
          statusText.setText('Not connected');
          sfButton.setText('Connect to Salesforce');
          return false;  // Not connected
        }
      } catch {
        statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #ef4444;';
        statusText.setText('Status unavailable');
        sfButton.setText('Connect to Salesforce');
        return false;
      }
    };

    // Email setting with onChange that triggers Salesforce status re-check
    new Setting(containerEl)
      .setName('Eudia Email')
      .setDesc('Your @eudia.com email address for calendar and Salesforce sync')
      .addText(text => text
        .setPlaceholder('yourname@eudia.com')
        .setValue(this.plugin.settings.userEmail)
        .onChange(async (value) => {
          const email = value.trim().toLowerCase();
          this.plugin.settings.userEmail = email;
          await this.plugin.saveSettings();
          
          // Re-check Salesforce status when email changes
          await checkStatus();
        }));

    // Timezone setting for calendar display
    new Setting(containerEl)
      .setName('Timezone')
      .setDesc('Your local timezone for calendar event display')
      .addDropdown(dropdown => {
        TIMEZONE_OPTIONS.forEach(tz => {
          dropdown.addOption(tz.value, tz.label);
        });
        dropdown.setValue(this.plugin.settings.timezone);
        dropdown.onChange(async (value) => {
          this.plugin.settings.timezone = value;
          await this.plugin.saveSettings();
          // Update calendar service with new timezone
          this.plugin.calendarService?.setTimezone(value);
          new Notice(`Timezone set to ${TIMEZONE_OPTIONS.find(t => t.value === value)?.label || value}`);
        });
      });

    // Move the Salesforce container to after the email setting visually
    // (it was already created above, now we add the header and rest)
    containerEl.createEl('h3', { text: 'Salesforce Connection' });
    containerEl.appendChild(sfContainer);
    
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

    // OpenAI key is now handled server-side - this is for fallback only
    // Hidden by default since server provides the key
    const advancedSection = containerEl.createDiv({ cls: 'settings-advanced-collapsed' });
    
    // Check server transcription capability
    const transcriptionStatus = advancedSection.createDiv({ cls: 'eudia-transcription-status' });
    transcriptionStatus.style.cssText = 'padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;';
    transcriptionStatus.innerHTML = '<span style="color: var(--text-muted);">Checking server transcription status...</span>';
    
    // Async check of server capability
    (async () => {
      try {
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/plugin/config`,
          method: 'GET'
        });
        if (response.json?.capabilities?.serverTranscription) {
          transcriptionStatus.innerHTML = '<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.';
        } else {
          transcriptionStatus.innerHTML = '<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.';
        }
      } catch {
        transcriptionStatus.innerHTML = '<span style="color: #f59e0b;">⚠</span> Could not check server status. Local API key recommended as backup.';
      }
    })();
    
    const advancedToggle = new Setting(containerEl)
      .setName('Advanced Options')
      .setDesc('Show fallback API key (usually not needed)')
      .addToggle(toggle => toggle
        .setValue(false)
        .onChange(value => {
          advancedSection.style.display = value ? 'block' : 'none';
        }));
    
    advancedSection.style.display = 'none';

    // ─────────────────────────────────────────────────────────────────────
    // AUDIO CAPTURE
    // ─────────────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Audio Capture' });

    const audioCaptureDesc = containerEl.createDiv();
    audioCaptureDesc.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;';
    audioCaptureDesc.setText(
      'Full Call mode automatically captures both sides of the call (your mic + the other person\'s audio). ' +
      'No extra software needed — the plugin uses native system audio capture. ' +
      'Run "Test System Audio Capture" from the command palette (Cmd+P) to verify your setup.'
    );

    new Setting(containerEl)
      .setName('Capture Mode')
      .setDesc('Full Call captures both sides; Mic Only captures your voice only.')
      .addDropdown(dropdown => {
        dropdown.addOption('full_call', 'Full Call (Both Sides)');
        dropdown.addOption('mic_only', 'Mic Only');
        dropdown.setValue(this.plugin.settings.audioCaptureMode || 'full_call');
        dropdown.onChange(async (value) => {
          this.plugin.settings.audioCaptureMode = value as 'full_call' | 'mic_only';
          await this.plugin.saveSettings();
        });
      });

    // System audio status indicator
    const vdStatusEl = containerEl.createDiv();
    vdStatusEl.style.cssText = 'padding: 10px 14px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;';
    vdStatusEl.setText('Checking system audio capabilities...');

    // Device selector dropdowns (populated async)
    const micSetting = new Setting(containerEl)
      .setName('Microphone')
      .setDesc('Select your physical microphone');

    const sysSetting = new Setting(containerEl)
      .setName('System Audio Device')
      .setDesc('Override for system audio source (auto-detected — most users should leave this on Auto)');

    // Test audio button
    const testAudioContainer = containerEl.createDiv();
    testAudioContainer.style.cssText = 'margin-bottom: 16px;';
    const testBtn = testAudioContainer.createEl('button', { text: 'Test Audio (3 seconds)' });
    testBtn.style.cssText = 'padding: 8px 16px; cursor: pointer; border-radius: 6px;';
    const testResult = testAudioContainer.createDiv();
    testResult.style.cssText = 'font-size: 12px; margin-top: 6px; color: var(--text-muted);';

    // Populate device lists asynchronously
    (async () => {
      try {
        // Request mic permission first so labels are populated
        try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch {}

        const devices = await AudioRecorder.getAvailableDevices();
        const virtualDevice = devices.find(d => d.isVirtual);

        if (virtualDevice) {
          vdStatusEl.innerHTML = `<span style="color:#22c55e;">&#10003;</span> System audio device detected: <strong>${virtualDevice.label}</strong>`;
          if (!this.plugin.settings.audioSystemDeviceId) {
            this.plugin.settings.audioSystemDeviceId = virtualDevice.deviceId;
            await this.plugin.saveSettings();
          }
        } else {
          const probe = await AudioRecorder.probeSystemAudioCapabilities();
          if (probe.desktopCapturerAvailable || AudioRecorder.isHandlerReady()) {
            vdStatusEl.innerHTML = '<span style="color:#22c55e;">&#10003;</span> Native system audio capture available. Both sides of calls will be recorded automatically.';
          } else if (probe.getDisplayMediaAvailable) {
            vdStatusEl.innerHTML = '<span style="color:#3b82f6;">&#8505;</span> System audio capture ready. On first recording, macOS may ask for Screen Recording permission — this is how the plugin captures the other person\'s audio.';
          } else {
            vdStatusEl.innerHTML = `<span style="color:#f59e0b;">&#9888;</span> System audio not available (Electron ${probe.electronVersion || '?'}). Run "Test System Audio Capture" from Cmd+P for details.`;
          }
        }

        const mics = devices.filter(d => !d.isVirtual);

        micSetting.addDropdown(dropdown => {
          dropdown.addOption('', 'Default Microphone');
          mics.forEach(d => dropdown.addOption(d.deviceId, d.label));
          dropdown.setValue(this.plugin.settings.audioMicDeviceId || '');
          dropdown.onChange(async (value) => {
            this.plugin.settings.audioMicDeviceId = value;
            await this.plugin.saveSettings();
          });
        });

        sysSetting.addDropdown(dropdown => {
          dropdown.addOption('', 'Auto-detect / None');
          devices.filter(d => d.isVirtual).forEach(d => dropdown.addOption(d.deviceId, d.label));
          // Also allow selecting any device as system audio
          devices.filter(d => !d.isVirtual).forEach(d => dropdown.addOption(d.deviceId, `(mic) ${d.label}`));
          dropdown.setValue(this.plugin.settings.audioSystemDeviceId || '');
          dropdown.onChange(async (value) => {
            this.plugin.settings.audioSystemDeviceId = value;
            await this.plugin.saveSettings();
          });
        });
      } catch (e) {
        vdStatusEl.setText('Could not enumerate audio devices.');
        console.warn('[Eudia Settings] Device enumeration failed:', e);
      }
    })();

    // Test recording handler
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      testBtn.setText('Recording...');
      testResult.setText('');
      try {
        const testRecorder = new AudioRecorder();
        await testRecorder.start({
          captureMode: this.plugin.settings.audioCaptureMode as AudioCaptureMode || 'full_call',
          micDeviceId: this.plugin.settings.audioMicDeviceId || undefined,
          systemAudioDeviceId: this.plugin.settings.audioSystemDeviceId || undefined
        });
        await new Promise(r => setTimeout(r, 3000));
        const result = await testRecorder.stop();
        const diag = await AudioRecorder.analyzeAudioBlob(result.audioBlob);
        const methodLabels: Record<string, string> = { electron: 'System Audio (Electron)', display_media: 'System Audio (Screen Share)', virtual_device: 'Virtual Device + Mic' };
        const mode = result.systemAudioMethod ? (methodLabels[result.systemAudioMethod] || 'System Audio') : (result.captureMode === 'full_call' ? 'Speaker Mode' : 'Mic Only');
        testResult.innerHTML = `<strong>${mode}</strong> | Peak: ${diag.peakLevel}% | Avg: ${diag.averageLevel}% | Silent: ${diag.silentPercent}%` +
          (diag.warning ? `<br><span style="color:#ef4444;">${diag.warning}</span>` : '<br><span style="color:#22c55e;">Audio detected — recording should work.</span>');
      } catch (e: any) {
        testResult.innerHTML = `<span style="color:#ef4444;">Test failed: ${e.message}</span>`;
      } finally {
        testBtn.disabled = false;
        testBtn.setText('Test Audio (3 seconds)');
      }
    };

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

    new Setting(containerEl)
      .setName('Auto-Sync Flagged Notes')
      .setDesc('Periodically push notes with sync_to_salesforce: true to Salesforce')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.sfAutoSyncEnabled)
        .onChange(async (value) => {
          this.plugin.settings.sfAutoSyncEnabled = value;
          await this.plugin.saveSettings();
          if (value) {
            this.plugin.startSalesforceSyncScanner();
          } else {
            this.plugin.updateSfSyncStatusBar('SF Sync: Off');
          }
        }));

    new Setting(containerEl)
      .setName('Auto-Sync Interval')
      .setDesc('How often to scan for flagged notes (in minutes)')
      .addDropdown(dropdown => {
        dropdown.addOption('5', 'Every 5 minutes');
        dropdown.addOption('15', 'Every 15 minutes');
        dropdown.addOption('30', 'Every 30 minutes');
        dropdown.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes));
        dropdown.onChange(async (value) => {
          this.plugin.settings.sfAutoSyncIntervalMinutes = parseInt(value);
          await this.plugin.saveSettings();
          new Notice(`SF auto-sync interval set to ${value} minutes. Restart Obsidian for changes to take effect.`);
        });
      });

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
      .setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`)
      .addButton(button => button
        .setButtonText('Sync')
        .setCta()
        .onClick(async () => {
          await this.plugin.syncAccounts();
          this.display();
        }));

    new Setting(containerEl)
      .setName('Refresh Account Folders')
      .setDesc('Check for new account assignments and create folders for them')
      .addButton(button => button
        .setButtonText('Refresh Folders')
        .onClick(async () => {
          button.setButtonText('Checking...');
          button.setDisabled(true);
          try {
            const newCount = await this.plugin.refreshAccountFolders();
            if (newCount > 0) {
              new Notice(`Created ${newCount} new account folder${newCount > 1 ? 's' : ''}`);
            } else {
              new Notice('All account folders are up to date');
            }
          } catch (error) {
            new Notice('Failed to refresh folders: ' + error.message);
          }
          button.setButtonText('Refresh Folders');
          button.setDisabled(false);
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
      text: `Audio transcription: ${AudioRecorder.isSupported() ? 'Supported' : 'Not supported'}`,
      cls: 'setting-item-description'
    });
  }
}
