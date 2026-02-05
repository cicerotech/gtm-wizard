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

import { AudioRecorder, RecordingState, RecordingResult, AudioDiagnostic } from './src/AudioRecorder';
import { TranscriptionService, TranscriptionResult, MeetingContext, ProcessedSections, AccountDetector, accountDetector, AccountDetectionResult } from './src/TranscriptionService';
import { CalendarService, CalendarMeeting, TodayResponse, WeekResponse } from './src/CalendarService';
import { SmartTagService, SmartTags } from './src/SmartTagService';
import { AccountOwnershipService, OwnedAccount, generateAccountOverviewNote, isAdminUser, ADMIN_EMAILS } from './src/AccountOwnership';

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
  syncAccountsOnStartup: true
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
  private pluginVersion: string = '4.1.0';
  
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
   * Send a heartbeat to update user presence and status
   */
  async sendHeartbeat(accountCount: number, connections: Record<string, string>): Promise<void> {
    if (!this.enabled || !this.userEmail) return;
    try {
      requestUrl({
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
      }).catch(() => {});
    } catch {
      // Never throw from telemetry
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
    
    // Subtle note
    contentEl.createEl('div', { 
      text: 'This may take a moment for longer recordings.', 
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
  private accountContext: { id: string; name: string } | null = null;

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
    
    // Response container
    this.responseContainer = contentEl.createDiv({ cls: 'eudia-intelligence-response' });
    this.responseContainer.style.display = 'none';
    
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
    
    // Show loading state with context-aware message
    this.responseContainer.style.display = 'block';
    const accountMsg = this.accountContext?.name ? ` about ${this.accountContext.name}` : '';
    this.responseContainer.innerHTML = `<div class="eudia-intelligence-loading">Gathering intelligence${accountMsg}...</div>`;
    
    try {
      const response = await requestUrl({
        url: `${this.plugin.settings.serverUrl}/api/intelligence/query`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          accountId: this.accountContext?.id,
          accountName: this.accountContext?.name,
          userEmail: this.plugin.settings.userEmail
        }),
        throw: false,  // Don't throw on HTTP errors - handle them gracefully
        contentType: 'application/json'
      });
      
      // Check HTTP status first (since throw: false)
      if (response.status >= 400) {
        const errorMsg = response.json?.error || `Server error (${response.status}). Please try again.`;
        this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
        return;
      }
      
      if (response.json?.success) {
        this.responseContainer.innerHTML = '';
        const answer = this.responseContainer.createDiv({ cls: 'eudia-intelligence-answer' });
        answer.innerHTML = this.formatResponse(response.json.answer);
        
        // Show rich context info
        if (response.json.context) {
          const ctx = response.json.context;
          const contextInfo = this.responseContainer.createDiv({ cls: 'eudia-intelligence-context-info' });
          
          const parts: string[] = [];
          if (ctx.accountName) parts.push(ctx.accountName);
          if (ctx.opportunityCount > 0) parts.push(`${ctx.opportunityCount} opps`);
          if (ctx.hasNotes) parts.push('notes');
          if (ctx.hasCustomerBrain) parts.push('history');
          
          const freshness = ctx.dataFreshness === 'cached' ? ' (cached)' : '';
          contextInfo.setText(`Based on: ${parts.join(' • ')}${freshness}`);
        }
        
        // Show performance info in debug mode
        if (response.json.performance && process.env.NODE_ENV === 'development') {
          const perfInfo = this.responseContainer.createDiv({ cls: 'eudia-intelligence-perf' });
          perfInfo.setText(`${response.json.performance.durationMs}ms • ${response.json.performance.tokensUsed} tokens`);
        }
      } else {
        const errorMsg = response.json?.error || 'Could not get an answer. Try rephrasing your question.';
        this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
      }
    } catch (error: any) {
      console.error('[GTM Brain] Intelligence query error:', error);
      // Provide more specific error messages
      let errorMsg = 'Unable to connect. Please check your internet connection and try again.';
      if (error?.message?.includes('timeout')) {
        errorMsg = 'Request timed out. The server may be busy - please try again.';
      } else if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
        errorMsg = 'Network error. Please check your connection and try again.';
      }
      this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
    }
  }
  
  private formatResponse(text: string): string {
    // Enhanced markdown formatting for sales-focused responses
    return text
      // Remove any stray emojis (backup cleanup)
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
      // Headers - handle ## and ### (convert both to h3 for consistency)
      .replace(/^#{2,3}\s+(.+)$/gm, '<h3 class="eudia-intel-header">$1</h3>')
      // Bold (**text**)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Bullet points (• or -)
      .replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>')
      // Checkboxes (- [ ] or - [x])
      .replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="eudia-intel-todo">$1</li>')
      .replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="eudia-intel-done">$1</li>')
      // Wrap consecutive <li> in <ul>
      .replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="eudia-intel-list">$&</ul>')
      // Collapse multiple line breaks to single
      .replace(/\n{2,}/g, '\n')
      // Convert remaining newlines to <br>
      .replace(/\n/g, '<br>');
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
    try {
      const ownershipService = new AccountOwnershipService(this.plugin.settings.serverUrl);
      const userEmail = this.plugin.settings.userEmail;
      
      // Check if user is an admin - admins get all accounts
      let accounts: OwnedAccount[];
      if (isAdminUser(userEmail)) {
        console.log('[Eudia] Admin user detected - importing all accounts');
        accounts = await ownershipService.getAllAccountsForAdmin(userEmail);
      } else {
        accounts = await ownershipService.getAccountsForUser(userEmail);
      }
      
      if (accounts.length > 0) {
        // Use admin method for admin users, regular method for others
        if (isAdminUser(userEmail)) {
          await this.plugin.createAdminAccountFolders(accounts);
        } else {
          await this.plugin.createTailoredAccountFolders(accounts);
        }
        this.plugin.settings.accountsImported = true;
        this.plugin.settings.importedAccountCount = accounts.length;
        await this.plugin.saveSettings();
      }
      this.updateStep('accounts', 'complete');
    } catch (e) {
      console.error('[Eudia] Account import failed:', e);
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
      
      // Check if accounts are imported
      if (this.plugin.settings.accountsImported) {
        this.steps[2].status = 'complete';
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
      text: 'Complete these steps to unlock your sales superpowers',
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
        
        try {
          // Check if user is an admin - admins get all accounts
          let accounts: OwnedAccount[];
          if (isAdminUser(email)) {
            console.log('[Eudia] Admin user detected - importing all accounts');
            accounts = await this.accountOwnershipService.getAllAccountsForAdmin(email);
          } else {
            accounts = await this.accountOwnershipService.getAccountsForUser(email);
          }
          
          if (accounts.length > 0) {
            if (isAdminUser(email)) {
              await this.plugin.createAdminAccountFolders(accounts);
            } else {
              await this.plugin.createTailoredAccountFolders(accounts);
            }
            this.plugin.settings.accountsImported = true;
            this.plugin.settings.importedAccountCount = accounts.length;
            await this.plugin.saveSettings();
            new Notice(`Imported ${accounts.length} account folders!`);
          }
        } catch (importError) {
          console.error('[Eudia] Account import failed:', importError);
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
      
      // Check if user is an admin - admins get all accounts
      let accounts: OwnedAccount[];
      if (isAdminUser(userEmail)) {
        console.log('[Eudia] Admin user detected - importing all accounts');
        statusEl.textContent = 'Admin detected - importing all accounts...';
        accounts = await this.accountOwnershipService.getAllAccountsForAdmin(userEmail);
      } else {
        accounts = await this.accountOwnershipService.getAccountsForUser(userEmail);
      }
      
      if (accounts.length === 0) {
        statusEl.textContent = 'No accounts found for your email. Contact your admin.';
        statusEl.className = 'eudia-setup-sf-status warning';
        return;
      }
      
      // Create account folders - use admin method for admin users
      if (isAdminUser(userEmail)) {
        await this.plugin.createAdminAccountFolders(accounts);
      } else {
        await this.plugin.createTailoredAccountFolders(accounts);
      }
      
      this.plugin.settings.accountsImported = true;
      this.plugin.settings.importedAccountCount = accounts.length;
      await this.plugin.saveSettings();
      
      this.steps[2].status = 'complete';
      
      const ownedCount = accounts.filter(a => a.isOwned !== false).length;
      const viewOnlyCount = accounts.filter(a => a.isOwned === false).length;
      
      if (isAdminUser(userEmail) && viewOnlyCount > 0) {
        statusEl.textContent = `${ownedCount} owned + ${viewOnlyCount} view-only accounts imported!`;
      } else {
        statusEl.textContent = `${accounts.length} accounts imported successfully!`;
      }
      statusEl.className = 'eudia-setup-sf-status success';
      
    } catch (error) {
      statusEl.textContent = 'Failed to import accounts. Please try again.';
      statusEl.className = 'eudia-setup-sf-status error';
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
      warning.innerHTML = `<strong>${userEmail}</strong> is not authorized for calendar access. Contact your admin.`;
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
        
        const nowAction = nowCard.createEl('button', { cls: 'eudia-now-action', text: 'Create Note' });
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
        text: CalendarService.formatTime(meeting.start, this.plugin.settings.timezone)
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
   * Extract company name from attendee email domains
   * Higher confidence than subject parsing since emails are definitive
   * Returns the company name derived from the domain (e.g., chsinc.com -> Chsinc)
   */
  private extractAccountFromAttendees(attendees: { name: string; email: string }[]): string | null {
    if (!attendees || attendees.length === 0) return null;
    
    // Common email providers to ignore
    const commonProviders = [
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 
      'icloud.com', 'live.com', 'msn.com', 'aol.com', 'protonmail.com'
    ];
    
    // Extract external domains (not eudia.com and not common providers)
    const externalDomains: string[] = [];
    
    for (const attendee of attendees) {
      if (!attendee.email) continue;
      const email = attendee.email.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      
      if (domainMatch) {
        const domain = domainMatch[1];
        if (!domain.includes('eudia.com') && !commonProviders.includes(domain)) {
          externalDomains.push(domain);
        }
      }
    }
    
    if (externalDomains.length === 0) return null;
    
    // Use the first external domain to get company name
    const domain = externalDomains[0];
    const companyPart = domain.split('.')[0]; // chsinc.com -> chsinc
    
    // Capitalize first letter
    const companyName = companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
    
    console.log(`[Eudia Calendar] Extracted company "${companyName}" from attendee domain ${domain}`);
    return companyName;
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
    const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr} - ${safeName}.md`;
    
    // ─────────────────────────────────────────────────────────────────────────
    // SMART ACCOUNT MATCHING - Find the correct account folder
    // ─────────────────────────────────────────────────────────────────────────
    
    let targetFolder: string | null = null;
    let matchedAccountName: string | null = meeting.accountName || null;
    let matchedAccountId: string | null = null;
    
    console.log(`[Eudia Calendar] === Creating note for meeting: "${meeting.subject}" ===`);
    console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(meeting.attendees?.map(a => a.email) || [])}`);
    
    // PRIORITY 1: Try domain-based matching from attendee emails (highest confidence)
    if (!targetFolder && meeting.attendees && meeting.attendees.length > 0) {
      const domainName = this.extractAccountFromAttendees(meeting.attendees);
      console.log(`[Eudia Calendar] Extracted domain company name: "${domainName || 'none'}"`);
      if (domainName) {
        targetFolder = this.findAccountFolder(domainName);
        console.log(`[Eudia Calendar] Domain-based "${domainName}" -> folder: ${targetFolder || 'not found'}`);
        if (targetFolder && !matchedAccountName) {
          // Extract the actual folder name from path for proper account name
          matchedAccountName = targetFolder.split('/').pop() || domainName;
        }
      }
    }
    
    // PRIORITY 2: Try server-provided accountName
    if (!targetFolder && meeting.accountName) {
      targetFolder = this.findAccountFolder(meeting.accountName);
      console.log(`[Eudia Calendar] Server accountName "${meeting.accountName}" -> folder: ${targetFolder || 'not found'}`);
    }
    
    // PRIORITY 3: Try extracting from subject
    if (!targetFolder) {
      const extractedName = this.extractAccountFromSubject(meeting.subject);
      if (extractedName) {
        targetFolder = this.findAccountFolder(extractedName);
        console.log(`[Eudia Calendar] Subject-based "${extractedName}" -> folder: ${targetFolder || 'not found'}`);
        if (targetFolder && !matchedAccountName) {
          matchedAccountName = targetFolder.split('/').pop() || extractedName;
        }
      }
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
      new Notice(`Created: ${filePath}`);
    } catch (e) {
      console.error('[Eudia Calendar] Failed to create note:', e);
      new Notice(`Could not create note: ${e.message || 'Unknown error'}`);
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

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl
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

    // Register setup view
    this.registerView(
      SETUP_VIEW_TYPE,
      (leaf) => new EudiaSetupView(leaf, this)
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

    this.addCommand({
      id: 'ask-gtm-brain',
      name: 'Ask gtm-brain',
      callback: () => this.openIntelligenceQueryForCurrentNote()
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
              
              // Send heartbeat
              await this.telemetry.sendHeartbeat(accountCount, connections);
              
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
            } catch (e) {
              // Silently ignore - heartbeat is optional
              console.log('[Eudia] Heartbeat/config check skipped');
            }
          }, 3000); // 3 second delay after other startup tasks
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
   */
  async createTailoredAccountFolders(accounts: OwnedAccount[]): Promise<void> {
    const accountsFolder = this.settings.accountsFolder || 'Accounts';
    
    // Ensure the main Accounts folder exists
    const existingFolder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!existingFolder) {
      await this.app.vault.createFolder(accountsFolder);
    }

    let createdCount = 0;
    
    for (const account of accounts) {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      
      // Check if folder already exists
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) {
        console.log(`[Eudia] Account folder already exists: ${safeName}`);
        continue;
      }
      
      try {
        // Create the account folder
        await this.app.vault.createFolder(folderPath);
        
        // Create 7 subnotes for the account (new structure with Next Steps)
        const dateStr = new Date().toISOString().split('T')[0];
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
sync_to_salesforce: false
---

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
        
        createdCount++;
        console.log(`[Eudia] Created account folder with subnotes: ${safeName}`);
      } catch (error) {
        console.error(`[Eudia] Failed to create folder for ${safeName}:`, error);
      }
    }

    // Update cached accounts
    this.settings.cachedAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name
    }));
    await this.saveSettings();

    if (createdCount > 0) {
      new Notice(`Created ${createdCount} account folders`);
    }
    
    // Also create the Next Steps aggregation folder if it doesn't exist
    await this.ensureNextStepsFolderExists();
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
    
    for (const account of accounts) {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      
      // Check if folder already exists
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) {
        continue;
      }
      
      try {
        // Create the account folder
        await this.app.vault.createFolder(folderPath);
        
        if (account.isOwned) {
          // Full folder structure for owned accounts (same as regular users)
          await this.createFullAccountSubnotes(folderPath, account, dateStr);
          createdOwned++;
        } else {
          // Minimal read-only structure for view-only accounts
          await this.createViewOnlyAccountNote(folderPath, account, dateStr);
          createdViewOnly++;
        }
        
        console.log(`[Eudia Admin] Created ${account.isOwned ? 'owned' : 'view-only'} folder: ${safeName}`);
      } catch (error) {
        console.error(`[Eudia Admin] Failed to create folder for ${safeName}:`, error);
      }
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
   * Create view-only account note for admins
   */
  private async createViewOnlyAccountNote(folderPath: string, account: OwnedAccount, dateStr: string): Promise<void> {
    const ownerName = (account as any).ownerName || 'Unknown';
    const content = `---
account: "${account.name}"
account_id: "${account.id}"
type: view_only
owner: "${ownerName}"
read_only: true
created: ${dateStr}
---

# ${account.name}

> **View-Only Account** - Owned by ${ownerName}

This account is owned by another team member. You can view notes here but primary updates should come from the account owner.

## Account Owner
**${ownerName}**

## Quick Info
- Account ID: \`${account.id}\`
- Type: ${account.type || 'Prospect'}

---

*To see recent activity, check Salesforce or reach out to ${ownerName}.*
`;
    
    const notePath = `${folderPath}/_Account Info.md`;
    await this.app.vault.create(notePath, content);
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

    // Estimate processing time based on duration
    const durationMin = Math.ceil(result.duration / 60);
    const estimatedTime = Math.max(1, Math.ceil(durationMin / 5)); // ~1 min per 5 min of audio
    
    // Show non-blocking notice and add processing status to note
    new Notice(`Transcription started. Estimated ${estimatedTime}-${estimatedTime + 1} minutes.`);
    
    // Add processing indicator to the note immediately
    const currentContent = await this.app.vault.read(file);
    const processingIndicator = `\n\n---\n**Transcription in progress...**\nStarted: ${new Date().toLocaleTimeString()}\nEstimated completion: ${estimatedTime}-${estimatedTime + 1} minutes\n\n*You can navigate away. Check back shortly.*\n---\n`;
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
      let accountContext: MeetingContext | undefined;
      const pathParts = file.path.split('/');
      console.log(`[Eudia] Processing transcription for: ${file.path}`);
      console.log(`[Eudia] Path parts: ${JSON.stringify(pathParts)}, accountsFolder: ${this.settings.accountsFolder}`);
      
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const accountName = pathParts[1];
        console.log(`[Eudia] Detected account folder: ${accountName}`);
        
        // Try to find in cached accounts for ID
        const account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === accountName.toLowerCase()
        );
        
        if (account) {
          accountContext = { accountName: account.name, accountId: account.id };
          console.log(`[Eudia] Found cached account: ${account.name} (${account.id})`);
        } else {
          // FALLBACK: Use folder name as account name even if not in cache
          // This ensures Next Steps still works for accounts not yet synced
          accountContext = { accountName: accountName, accountId: '' };
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

      // Transcribe audio
      const transcription = await this.transcriptionService.transcribeAudio(
        result.audioBlob, 
        accountContext ? { ...accountContext, speakerHints } : { speakerHints }
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

      // Build note content - this replaces entire note including processing indicator
      const noteContent = this.buildNoteContent(sections, transcription);
      
      // Update file with final content
      await this.app.vault.modify(file, noteContent);

      // Show completion notice
      const durationMin = Math.floor(result.duration / 60);
      new Notice(`Transcription complete (${durationMin} min recording)`);

      // Extract and update Next Steps for the account
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
    
    // Create folders for new accounts (reuses existing method)
    await this.createTailoredAccountFolders(newAccounts);
    
    return newAccounts.length;
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

      const serverAccounts: { id: string; name: string; customerType?: string; hasOpenOpps?: boolean; ownerName?: string }[] = data.accounts;
      
      // Get existing account folders
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      const existingFolders = new Map<string, TFolder>();
      
      if (accountsFolder && accountsFolder instanceof TFolder) {
        for (const child of accountsFolder.children) {
          if (child instanceof TFolder && !child.name.startsWith('_')) {
            existingFolders.set(child.name.toLowerCase().trim(), child);
          }
        }
      }

      // Determine changes
      const serverAccountNames = new Set(serverAccounts.map(a => a.name.toLowerCase().trim()));
      
      // New accounts = in server but not in local folders
      const newAccounts = serverAccounts.filter(account => {
        const normalizedName = account.name.toLowerCase().trim();
        return !existingFolders.has(normalizedName);
      });

      // Removed accounts = in local folders but not in server
      // NOTE: For admin/exec/sales_leader/cs, we DON'T archive since they have view-only access
      //       to accounts they don't own (removing from SF doesn't mean they lost access)
      const removedFolders: TFolder[] = [];
      if (userGroup === 'bl') {
        // Only BLs should have accounts archived - they own their accounts
        for (const [normalizedName, folder] of existingFolders.entries()) {
          if (!serverAccountNames.has(normalizedName)) {
            removedFolders.push(folder);
          }
        }
      }

      let addedCount = 0;
      let archivedCount = 0;

      // Create new account folders using appropriate method for user group
      if (newAccounts.length > 0) {
        console.log(`[Eudia] Creating ${newAccounts.length} new account folders for ${userGroup}`);
        
        const accountsToCreate = newAccounts.map(a => ({
          id: a.id,
          name: a.name,
          type: a.customerType as 'Customer' | 'Prospect' | 'Target' | undefined,
          // For admin/exec/sales_leader, mark accounts as view-only (they don't "own" most)
          isOwned: userGroup === 'bl',
          ownerName: a.ownerName
        }));
        
        // Use appropriate folder creation method based on group
        if (userGroup === 'admin' || userGroup === 'exec') {
          // Full admin structure with Pipeline folder
          await this.createAdminAccountFolders(accountsToCreate);
        } else {
          // Standard tailored folder structure
          await this.createTailoredAccountFolders(accountsToCreate);
        }
        
        addedCount = newAccounts.length;
        
        // Report to telemetry with group context
        if (this.telemetry) {
          this.telemetry.reportInfo('Accounts synced - added', { 
            count: addedCount,
            userGroup,
            region: region || undefined
          });
        }
      }

      // Archive removed folders (only for BLs with setting enabled)
      if (this.settings.archiveRemovedAccounts && removedFolders.length > 0) {
        console.log(`[Eudia] Archiving ${removedFolders.length} removed account folders`);
        archivedCount = await this.archiveAccountFolders(removedFolders);
        
        // Report to telemetry
        if (this.telemetry) {
          this.telemetry.reportInfo('Accounts synced - archived', { count: archivedCount });
        }
      }

      console.log(`[Eudia] Sync complete: ${addedCount} added, ${archivedCount} archived (group: ${userGroup})`);
      
      return { success: true, added: addedCount, archived: archivedCount, userGroup };

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
        new Notice('Synced to Salesforce');
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
