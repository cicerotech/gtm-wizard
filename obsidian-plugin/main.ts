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
import { TranscriptionService, TranscriptionResult, MeetingContext, ProcessedSections } from './src/TranscriptionService';
import { CalendarService, CalendarMeeting, TodayResponse } from './src/CalendarService';
import { SmartTagService, SmartTags } from './src/SmartTagService';

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
  serverUrl: 'https://gtm-brain.onrender.com',
  accountsFolder: 'Accounts',
  recordingsFolder: 'Recordings',
  syncOnStartup: true,
  autoSyncAfterTranscription: true,
  saveAudioFiles: true,
  appendTranscript: false,
  lastSyncTime: null,
  cachedAccounts: [],
  // Smart tagging
  enableSmartTags: true,
  // Calendar
  showCalendarView: true,
  // User configuration
  userEmail: '',
  setupCompleted: false,
  calendarConfigured: false,
  // OpenAI configuration
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

/**
 * Account Suggester - provides autocomplete for account names in frontmatter
 */
class AccountSuggester extends EditorSuggest<SalesforceAccount> {
  plugin: EudiaSyncPlugin;

  constructor(app: App, plugin: EudiaSyncPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    
    // Only trigger in frontmatter (between --- markers)
    const content = editor.getValue();
    const cursorOffset = editor.posToOffset(cursor);
    
    // Check if we're in frontmatter
    const frontmatterStart = content.indexOf('---');
    const frontmatterEnd = content.indexOf('---', frontmatterStart + 3);
    
    if (frontmatterStart === -1 || cursorOffset < frontmatterStart || cursorOffset > frontmatterEnd) {
      return null;
    }
    
    // Check if this line is the account property
    const accountMatch = line.match(/^account:\s*(.*)$/);
    if (!accountMatch) {
      return null;
    }
    
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
    
    if (!query) {
      // Return first 10 accounts if no query
      return accounts.slice(0, 10);
    }
    
    // Filter and sort by relevance
    return accounts
      .filter(a => a.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prioritize accounts that START with the query
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
    
    const editor = this.context.editor;
    editor.replaceRange(
      account.name,
      this.context.start,
      this.context.end
    );
  }
}

/**
 * Recording Status Bar UI
 */
class RecordingStatusBar {
  private containerEl: HTMLElement | null = null;
  private durationEl: HTMLElement | null = null;
  private levelBarEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  
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
    this.containerEl.className = 'eudia-recording-bar recording';
    
    // Recording indicator
    const indicator = document.createElement('div');
    indicator.className = 'eudia-recording-indicator';
    this.containerEl.appendChild(indicator);

    // Duration
    this.durationEl = document.createElement('div');
    this.durationEl.className = 'eudia-duration';
    this.durationEl.textContent = '00:00';
    this.containerEl.appendChild(this.durationEl);

    // Audio level meter
    const levelContainer = document.createElement('div');
    levelContainer.className = 'eudia-level-container';
    this.levelBarEl = document.createElement('div');
    this.levelBarEl.className = 'eudia-level-bar';
    this.levelBarEl.style.width = '0%';
    levelContainer.appendChild(this.levelBarEl);
    this.containerEl.appendChild(levelContainer);

    // Status text
    this.statusTextEl = document.createElement('div');
    this.statusTextEl.className = 'eudia-status-text';
    this.statusTextEl.textContent = 'Recording...';
    this.containerEl.appendChild(this.statusTextEl);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'eudia-controls';

    // Pause/Resume button
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'eudia-control-btn pause';
    pauseBtn.innerHTML = '⏸';
    pauseBtn.title = 'Pause';
    pauseBtn.onclick = () => this.onPause();
    controls.appendChild(pauseBtn);

    // Stop button
    const stopBtn = document.createElement('button');
    stopBtn.className = 'eudia-control-btn stop';
    stopBtn.innerHTML = '⏹';
    stopBtn.title = 'Stop & Transcribe';
    stopBtn.onclick = () => this.onStop();
    controls.appendChild(stopBtn);

    // Cancel button
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
    if (!this.containerEl) return;

    // Update duration
    if (this.durationEl) {
      this.durationEl.textContent = AudioRecorder.formatDuration(state.duration);
    }

    // Update audio level
    if (this.levelBarEl) {
      this.levelBarEl.style.width = `${state.audioLevel}%`;
    }

    // Update status text and class
    if (state.isPaused) {
      this.containerEl.className = 'eudia-recording-bar paused';
      if (this.statusTextEl) this.statusTextEl.textContent = 'Paused';
    } else {
      this.containerEl.className = 'eudia-recording-bar recording';
      if (this.statusTextEl) this.statusTextEl.textContent = 'Recording...';
    }
  }

  setProcessing(): void {
    if (!this.containerEl) return;
    this.containerEl.className = 'eudia-recording-bar processing';
    if (this.statusTextEl) this.statusTextEl.textContent = 'Transcribing...';
    
    // Disable buttons
    const buttons = this.containerEl.querySelectorAll('button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));
  }
}

/**
 * Processing Modal
 */
class ProcessingModal extends Modal {
  private messageEl: HTMLElement;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-transcribing-modal');

    const spinner = contentEl.createDiv({ cls: 'spinner' });
    this.messageEl = contentEl.createEl('p', { text: 'Transcribing audio...' });
    contentEl.createEl('p', { text: 'This may take a moment for longer recordings.' });
  }

  setMessage(message: string) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Account Selector Modal
 * Quick account picker for creating new meeting notes
 */
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

    // Search input
    this.searchInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Search accounts...'
    });
    this.searchInput.style.width = '100%';
    this.searchInput.style.padding = '10px';
    this.searchInput.style.marginBottom = '10px';
    this.searchInput.style.borderRadius = '6px';
    this.searchInput.style.border = '1px solid var(--background-modifier-border)';

    // Results container
    this.resultsContainer = contentEl.createDiv({ cls: 'eudia-account-results' });
    this.resultsContainer.style.maxHeight = '300px';
    this.resultsContainer.style.overflowY = 'auto';

    // Show initial results
    this.updateResults('');

    // Handle input
    this.searchInput.addEventListener('input', () => {
      this.updateResults(this.searchInput.value);
    });

    // Focus input
    this.searchInput.focus();
  }

  updateResults(query: string): void {
    this.resultsContainer.empty();

    const accounts = this.plugin.settings.cachedAccounts;
    const lowerQuery = query.toLowerCase();
    
    const filtered = query 
      ? accounts.filter(a => a.name.toLowerCase().includes(lowerQuery))
      : accounts.slice(0, 20);

    if (filtered.length === 0) {
      this.resultsContainer.createEl('div', { 
        text: query ? 'No accounts found' : 'No accounts cached. Run "Sync Accounts" first.',
        cls: 'eudia-no-results'
      }).style.padding = '10px';
      return;
    }

    for (const account of filtered.slice(0, 20)) {
      const item = this.resultsContainer.createEl('div', { cls: 'eudia-account-item' });
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.borderRadius = '4px';
      item.createEl('span', { text: account.name });

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--background-modifier-hover)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });
      item.addEventListener('click', () => {
        this.onSelect(account);
        this.close();
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * First-Launch Setup Wizard
 * Prompts for email, configures calendar, syncs accounts
 */
class SetupWizardModal extends Modal {
  plugin: EudiaSyncPlugin;
  private emailInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private onComplete: () => void;

  constructor(app: App, plugin: EudiaSyncPlugin, onComplete: () => void) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-setup-wizard');

    // Header - Clean, no emojis
    contentEl.createEl('h2', { text: 'Welcome to Eudia Sales Intelligence' });
    contentEl.createEl('p', { 
      text: 'Quick setup to get you recording meetings and syncing to Salesforce.',
      cls: 'setting-item-description'
    });

    // Email input
    const emailSection = contentEl.createDiv({ cls: 'eudia-setup-section' });
    emailSection.createEl('h3', { text: '1. Enter Your Email' });
    emailSection.createEl('p', { 
      text: 'Your Eudia work email (used for calendar sync)',
      cls: 'setting-item-description'
    });
    
    this.emailInput = emailSection.createEl('input', {
      type: 'email',
      placeholder: 'yourname@eudia.com',
      cls: 'eudia-email-input'
    });
    this.emailInput.style.width = '100%';
    this.emailInput.style.padding = '8px 12px';
    this.emailInput.style.marginTop = '8px';
    this.emailInput.style.borderRadius = '6px';
    this.emailInput.style.border = '1px solid var(--background-modifier-border)';

    // Features summary - Clean list without emojis
    const featuresSection = contentEl.createDiv({ cls: 'eudia-setup-section' });
    featuresSection.style.marginTop = '20px';
    featuresSection.createEl('h3', { text: '2. What Gets Configured' });
    
    const featureList = featuresSection.createEl('ul');
    featureList.style.fontSize = '13px';
    featureList.style.color = 'var(--text-muted)';
    
    const features = [
      'Salesforce account folders synced',
      'Calendar connected for meeting context',
      'Recording, transcription, and summary ready',
      'Auto-sync to Salesforce Customer Brain'
    ];
    features.forEach(f => featureList.createEl('li', { text: f }));

    // Status area
    this.statusEl = contentEl.createDiv({ cls: 'eudia-setup-status' });
    this.statusEl.style.marginTop = '16px';
    this.statusEl.style.padding = '12px';
    this.statusEl.style.borderRadius = '8px';
    this.statusEl.style.display = 'none';

    // Button
    const buttonContainer = contentEl.createDiv({ cls: 'eudia-setup-buttons' });
    buttonContainer.style.marginTop = '24px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '12px';

    const skipBtn = buttonContainer.createEl('button', { text: 'Skip for Now' });
    skipBtn.onclick = () => this.close();

    const setupBtn = buttonContainer.createEl('button', { text: 'Complete Setup', cls: 'mod-cta' });
    setupBtn.onclick = () => this.runSetup();
  }

  async runSetup() {
    const email = this.emailInput.value.trim().toLowerCase();
    
    if (!email || !email.includes('@')) {
      this.showStatus('Please enter a valid email address', 'error');
      return;
    }

    this.showStatus('Setting up...', 'info');

    try {
      // Save email
      this.plugin.settings.userEmail = email;
      await this.plugin.saveSettings();

      // Step 1: Sync accounts
      this.showStatus('Syncing Salesforce accounts...', 'info');
      await this.plugin.syncAccounts(true);

      // Step 2: Configure Full Calendar
      this.showStatus('Configuring calendar...', 'info');
      await this.configureCalendar(email);

      // Step 3: Mark setup complete
      this.plugin.settings.setupCompleted = true;
      await this.plugin.saveSettings();

      this.showStatus('Setup complete. You\'re ready to record meetings.', 'success');
      
      // Close after delay
      setTimeout(() => {
        this.close();
        this.onComplete();
        new Notice('Eudia is ready. Click the mic icon to record.');
      }, 1500);

    } catch (error) {
      this.showStatus(`Setup failed: ${error.message}`, 'error');
    }
  }

  async configureCalendar(email: string) {
    try {
      // Get the Full Calendar plugin config file path
      const calendarConfigPath = '.obsidian/plugins/full-calendar/data.json';
      const configFile = this.app.vault.getAbstractFileByPath(calendarConfigPath);
      
      const icsUrl = `${this.plugin.settings.serverUrl}/api/calendar/${email}/feed.ics`;
      
      const calendarConfig = {
        defaultCalendar: 0,
        recursiveLocal: false,
        calendars: [
          {
            type: 'ical',
            name: 'Work Calendar',
            url: icsUrl,
            color: '#8e99e1'
          }
        ],
        firstDay: 0,
        initialView: {
          desktop: 'timeGridWeek',
          mobile: 'timeGrid3Days'
        }
      };

      if (configFile && configFile instanceof TFile) {
        await this.app.vault.modify(configFile, JSON.stringify(calendarConfig, null, 2));
      } else {
        // Ensure plugins folder exists
        const pluginsFolder = this.app.vault.getAbstractFileByPath('.obsidian/plugins/full-calendar');
        if (!pluginsFolder) {
          await this.app.vault.createFolder('.obsidian/plugins/full-calendar');
        }
        await this.app.vault.create(calendarConfigPath, JSON.stringify(calendarConfig, null, 2));
      }

      this.plugin.settings.calendarConfigured = true;
      
    } catch (error) {
      console.warn('Could not configure Full Calendar:', error);
      // Non-fatal - continue setup
    }
  }

  showStatus(message: string, type: 'info' | 'success' | 'error') {
    this.statusEl.style.display = 'block';
    this.statusEl.textContent = message;
    
    if (type === 'success') {
      this.statusEl.style.background = 'var(--background-modifier-success)';
      this.statusEl.style.color = 'var(--text-success)';
    } else if (type === 'error') {
      this.statusEl.style.background = 'var(--background-modifier-error)';
      this.statusEl.style.color = 'var(--text-error)';
    } else {
      this.statusEl.style.background = 'var(--background-secondary)';
      this.statusEl.style.color = 'var(--text-muted)';
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Calendar View Type identifier
const CALENDAR_VIEW_TYPE = 'eudia-calendar-view';

export default class EudiaSyncPlugin extends Plugin {
  settings: EudiaSyncSettings;
  accountSuggester: AccountSuggester;
  
  // Recording components
  private audioRecorder: AudioRecorder;
  private transcriptionService: TranscriptionService;
  private calendarService: CalendarService;
  private smartTagService: SmartTagService;
  private recordingStatusBar: RecordingStatusBar | null = null;
  private ribbonIcon: HTMLElement | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.audioRecorder = new AudioRecorder();
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl, 
      this.settings.openaiApiKey
    );
    this.calendarService = new CalendarService(
      this.settings.serverUrl,
      this.settings.userEmail
    );
    this.smartTagService = new SmartTagService(
      this.settings.serverUrl,
      this.settings.openaiApiKey
    );

    // Register calendar view
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new EudiaCalendarView(leaf, this)
    );

    // Set up audio recorder callbacks
    this.audioRecorder.onStateChange((state) => {
      if (this.recordingStatusBar) {
        this.recordingStatusBar.updateState(state);
      }
    });

    // Register account suggester for autocomplete
    this.accountSuggester = new AccountSuggester(this.app, this);
    this.registerEditorSuggest(this.accountSuggester);

    // Add ribbon icon for recording (primary action)
    this.ribbonIcon = this.addRibbonIcon('microphone', 'Record Meeting', async () => {
      await this.toggleRecording();
    });

    // Add calendar ribbon icon
    this.addRibbonIcon('calendar', 'Open Calendar', async () => {
      await this.activateCalendarView();
    });

    // Add secondary ribbon icon for sync
    this.addRibbonIcon('refresh-cw', 'Sync Salesforce Accounts', async () => {
      await this.syncAccounts();
    });

    // Recording commands
    this.addCommand({
      id: 'start-recording',
      name: 'Start Recording',
      callback: async () => {
        if (!this.isRecording) {
          await this.startRecording();
        }
      }
    });

    this.addCommand({
      id: 'stop-recording',
      name: 'Stop Recording & Transcribe',
      callback: async () => {
        if (this.isRecording) {
          await this.stopRecording();
        }
      }
    });

    this.addCommand({
      id: 'toggle-recording',
      name: 'Toggle Recording',
      callback: async () => {
        await this.toggleRecording();
      }
    });

    this.addCommand({
      id: 'open-calendar',
      name: 'Open Calendar View',
      callback: async () => {
        await this.activateCalendarView();
      }
    });

    this.addCommand({
      id: 'pause-recording',
      name: 'Pause/Resume Recording',
      callback: () => {
        if (this.isRecording) {
          this.togglePause();
        }
      }
    });

    // Existing commands
    this.addCommand({
      id: 'sync-salesforce-accounts',
      name: 'Sync Salesforce Accounts',
      callback: async () => {
        await this.syncAccounts();
      }
    });

    this.addCommand({
      id: 'sync-note-to-salesforce',
      name: 'Sync Current Note to Salesforce',
      callback: async () => {
        await this.syncNoteToSalesforce();
      }
    });

    this.addCommand({
      id: 'fetch-meeting-context',
      name: 'Fetch Pre-Call Context',
      callback: async () => {
        await this.fetchAndInsertContext();
      }
    });

    this.addCommand({
      id: 'create-meeting-note',
      name: 'Create New Meeting Note',
      callback: async () => {
        await this.createMeetingNote();
      }
    });

    // Register file creation hook to auto-apply template
    this.registerEvent(
      this.app.vault.on('create', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Check if file is in Accounts folder and is empty
          if (file.path.startsWith(this.settings.accountsFolder + '/')) {
            const content = await this.app.vault.read(file);
            if (content.trim() === '') {
              // Auto-apply meeting template
              await this.applyMeetingTemplate(file);
            }
          }
        }
      })
    );

    // Add settings tab
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));

    // Add command to run setup wizard manually
    this.addCommand({
      id: 'run-setup-wizard',
      name: 'Run Setup Wizard',
      callback: () => {
        new SetupWizardModal(this.app, this, () => {}).open();
      }
    });

    // Show setup wizard on first launch
    if (!this.settings.setupCompleted) {
      // Delay to let vault fully load
      setTimeout(() => {
        new SetupWizardModal(this.app, this, () => {
          // After setup, sync accounts
          this.syncAccounts(true);
        }).open();
      }, 1500);
    } else if (this.settings.syncOnStartup) {
      // Already set up - just sync accounts
      setTimeout(() => {
        this.syncAccounts(true);
      }, 2000);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update transcription service settings if changed
    if (this.transcriptionService) {
      this.transcriptionService.setServerUrl(this.settings.serverUrl);
      this.transcriptionService.setOpenAIKey(this.settings.openaiApiKey);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORDING FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle recording on/off
   */
  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * Start audio recording
   * Auto-detects current calendar meeting and populates note metadata
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    // Check browser support
    if (!AudioRecorder.isSupported()) {
      new Notice('Audio recording is not supported in this browser');
      return;
    }

    // Check for active note
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Please open or create a note first');
      return;
    }

    try {
      // Start recording
      await this.audioRecorder.startRecording();
      this.isRecording = true;
      this.isPaused = false;

      // Update ribbon icon
      if (this.ribbonIcon) {
        this.ribbonIcon.addClass('eudia-ribbon-recording');
      }

      // Show status bar
      this.recordingStatusBar = new RecordingStatusBar(
        () => this.togglePause(),
        () => this.togglePause(),
        () => this.stopRecording(),
        () => this.cancelRecording()
      );
      this.recordingStatusBar.show();

      new Notice('Recording started');

      // Auto-detect current calendar meeting (non-blocking)
      this.autoDetectCurrentMeeting(activeFile);

    } catch (error) {
      new Notice(`Failed to start recording: ${error.message}`);
      this.isRecording = false;
    }
  }

  /**
   * Auto-detect current calendar meeting and update note metadata
   * Runs in background - doesn't block recording start
   */
  async autoDetectCurrentMeeting(file: TFile): Promise<void> {
    if (!this.settings.userEmail) return;

    try {
      // Fetch today's meetings from GTM Brain
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/calendar/${this.settings.userEmail}/today`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.json.success || !response.json.meetings?.length) {
        return; // No meetings found
      }

      // Find meeting happening now (within ±15 min window)
      const now = new Date();
      const meetings = response.json.meetings;
      
      const currentMeeting = meetings.find((m: any) => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        // Expand window: 15 min before start to end of meeting
        const windowStart = new Date(start.getTime() - 15 * 60 * 1000);
        return now >= windowStart && now <= end;
      });

      if (!currentMeeting) {
        return; // No meeting happening now
      }

      // Extract attendees (external only)
      const attendees = currentMeeting.attendees
        ?.filter((a: any) => !a.email?.includes('@eudia.com'))
        ?.map((a: any) => a.name || a.email)
        ?.slice(0, 5)
        ?.join(', ') || '';

      // Update frontmatter with meeting info
      await this.updateFrontmatter(file, {
        meeting_title: currentMeeting.subject,
        attendees: attendees,
        meeting_start: currentMeeting.start
      });

      console.log('Auto-detected meeting:', currentMeeting.subject);

    } catch (error) {
      // Silent fail - calendar auto-detect is optional
      console.warn('Calendar auto-detect failed:', error.message);
    }
  }

  /**
   * Stop recording and process - NON-BLOCKING
   * User regains control immediately while transcription happens in background
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) return;

    try {
      // Update UI to processing state
      if (this.recordingStatusBar) {
        this.recordingStatusBar.setProcessing();
      }

      // Stop recording and get audio
      const result = await this.audioRecorder.stopRecording();
      this.isRecording = false;
      this.isPaused = false;

      // Hide status bar immediately
      if (this.recordingStatusBar) {
        this.recordingStatusBar.hide();
        this.recordingStatusBar = null;
      }

      // Update ribbon icon
      if (this.ribbonIcon) {
        this.ribbonIcon.removeClass('eudia-ribbon-recording');
      }

      // Get active file BEFORE any async operations
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice('No active file to save transcription');
        return;
      }

      // Insert placeholder immediately so user can continue working
      await this.insertProcessingPlaceholder(activeFile);
      new Notice('Processing audio... You can continue working.');

      // Process in background - don't await
      this.processRecordingInBackground(result, activeFile);

    } catch (error) {
      this.isRecording = false;
      if (this.recordingStatusBar) {
        this.recordingStatusBar.hide();
        this.recordingStatusBar = null;
      }
      if (this.ribbonIcon) {
        this.ribbonIcon.removeClass('eudia-ribbon-recording');
      }
      new Notice(`Error stopping recording: ${error.message}`);
    }
  }

  /**
   * Insert a placeholder while transcription is processing
   */
  async insertProcessingPlaceholder(file: TFile): Promise<void> {
    let content = await this.app.vault.read(file);
    
    const placeholder = `
---

> **Transcription in progress...**  
> Your audio is being processed. This section will update automatically when complete.

---

`;
    
    // Find insertion point
    const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);
    if (titleMatch) {
      const insertPoint = titleMatch[0].length;
      content = content.substring(0, insertPoint) + placeholder + content.substring(insertPoint);
    } else {
      const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
      if (frontmatterMatch) {
        const insertPoint = frontmatterMatch[0].length;
        content = content.substring(0, insertPoint) + placeholder + content.substring(insertPoint);
      } else {
        content = placeholder + content;
      }
    }
    
    await this.app.vault.modify(file, content);
  }

  /**
   * Process recording in background without blocking UI
   */
  async processRecordingInBackground(result: RecordingResult, activeFile: TFile): Promise<void> {
    try {
      // Detect account from folder path
      const accountInfo = this.detectAccountFromPath(activeFile.path);
      
      // Get meeting context if we have an account
      let context: MeetingContext | undefined;
      if (accountInfo) {
        context = await this.transcriptionService.getMeetingContext(accountInfo.id);
      }

      // Convert audio to base64
      const audioBase64 = await AudioRecorder.blobToBase64(result.audioBlob);

      // Save audio file if enabled
      let savedAudioPath: string | undefined;
      if (this.settings.saveAudioFiles) {
        savedAudioPath = await this.saveAudioFile(result, activeFile);
      }

      // Send for transcription
      const transcriptionResult = await this.transcriptionService.transcribeAndSummarize(
        audioBase64,
        result.mimeType,
        accountInfo?.name,
        accountInfo?.id,
        context
      );

      if (!transcriptionResult.success) {
        // Replace placeholder with error
        await this.replaceProcessingPlaceholder(
          activeFile, 
          `> **Transcription failed:** ${transcriptionResult.error}\n> \n> Try recording again or check your settings.`
        );
        new Notice(`Transcription failed: ${transcriptionResult.error}`);
        return;
      }

      // Replace placeholder with actual results
      await this.insertTranscriptionResults(activeFile, transcriptionResult, savedAudioPath);
      new Notice('Transcription complete');

      // Extract smart tags if enabled (secondary AI call)
      if (this.settings.enableSmartTags) {
        try {
          const tagResult = await this.smartTagService.extractTags(transcriptionResult.sections);
          if (tagResult.success) {
            await this.applySmartTags(activeFile, tagResult.tags);
            console.log('Smart tags applied:', tagResult.tags);
          }
        } catch (tagError) {
          console.warn('Smart tag extraction failed:', tagError.message);
          // Non-fatal - continue without tags
        }
      }

      // Auto-sync to Salesforce if enabled
      if (this.settings.autoSyncAfterTranscription && accountInfo) {
        await this.transcriptionService.syncToSalesforce(
          accountInfo.id,
          accountInfo.name,
          activeFile.basename,
          transcriptionResult.sections,
          transcriptionResult.transcript
        );
        new Notice('Synced to Salesforce');
      }

    } catch (error) {
      console.error('Background transcription error:', error);
      new Notice(`Transcription failed: ${error.message}`);
      
      // Try to update the placeholder with error
      try {
        await this.replaceProcessingPlaceholder(
          activeFile,
          `> **Transcription failed:** ${error.message}`
        );
      } catch (e) {
        // File may have been closed/deleted
      }
    }
  }

  /**
   * Apply smart tags to note frontmatter
   */
  async applySmartTags(file: TFile, tags: SmartTags): Promise<void> {
    const updates: Record<string, any> = {};
    
    if (tags.product_interest.length > 0) {
      updates.product_interest = tags.product_interest;
    }
    
    if (tags.meddicc_signals.length > 0) {
      updates.meddicc_signals = tags.meddicc_signals;
    }
    
    updates.deal_health = tags.deal_health;
    updates.meeting_type = tags.meeting_type;
    
    if (tags.key_stakeholders.length > 0) {
      updates.key_stakeholders = tags.key_stakeholders;
    }
    
    updates.tag_confidence = Math.round(tags.confidence * 100);
    
    await this.updateFrontmatter(file, updates);
  }

  /**
   * Replace processing placeholder with error message
   */
  async replaceProcessingPlaceholder(file: TFile, replacement: string): Promise<void> {
    let content = await this.app.vault.read(file);
    
    // Find and replace placeholder
    const placeholderRegex = /\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;
    if (placeholderRegex.test(content)) {
      content = content.replace(placeholderRegex, `\n${replacement}\n\n`);
      await this.app.vault.modify(file, content);
    }
  }

  /**
   * Toggle pause/resume
   */
  togglePause(): void {
    if (!this.isRecording) return;

    if (this.isPaused) {
      this.audioRecorder.resumeRecording();
      this.isPaused = false;
    } else {
      this.audioRecorder.pauseRecording();
      this.isPaused = true;
    }
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording(): void {
    if (!this.isRecording) return;

    this.audioRecorder.cancelRecording();
    this.isRecording = false;
    this.isPaused = false;

    if (this.recordingStatusBar) {
      this.recordingStatusBar.hide();
      this.recordingStatusBar = null;
    }

    if (this.ribbonIcon) {
      this.ribbonIcon.removeClass('eudia-ribbon-recording');
    }

    new Notice('Recording cancelled');
  }

  /**
   * Process recorded audio - transcribe and summarize
   */
  async processRecording(result: RecordingResult, modal: ProcessingModal): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    // Detect account from folder path
    const accountInfo = this.detectAccountFromPath(activeFile.path);
    
    // Get meeting context if we have an account
    let context: MeetingContext | undefined;
    if (accountInfo) {
      modal.setMessage('Fetching account context...');
      context = await this.transcriptionService.getMeetingContext(accountInfo.id);
    }

    // Convert audio to base64
    modal.setMessage('Preparing audio...');
    const audioBase64 = await AudioRecorder.blobToBase64(result.audioBlob);

    // Save audio file if enabled
    let savedAudioPath: string | undefined;
    if (this.settings.saveAudioFiles) {
      modal.setMessage('Saving audio file...');
      savedAudioPath = await this.saveAudioFile(result, activeFile);
    }

    // Send for transcription
    modal.setMessage('Transcribing audio...');
    const transcriptionResult = await this.transcriptionService.transcribeAndSummarize(
      audioBase64,
      result.mimeType,
      accountInfo?.name,
      accountInfo?.id,
      context
    );

    if (!transcriptionResult.success) {
      throw new Error(transcriptionResult.error || 'Transcription failed');
    }

    // Insert results into note
    modal.setMessage('Updating note...');
    await this.insertTranscriptionResults(activeFile, transcriptionResult, savedAudioPath);

    // Auto-sync to Salesforce if enabled
    if (this.settings.autoSyncAfterTranscription && accountInfo) {
      modal.setMessage('Syncing to Salesforce...');
      await this.transcriptionService.syncToSalesforce(
        accountInfo.id,
        accountInfo.name,
        activeFile.basename,
        transcriptionResult.sections,
        transcriptionResult.transcript
      );
    }
  }

  /**
   * Detect account from file path
   */
  detectAccountFromPath(filePath: string): SalesforceAccount | null {
    // Check if file is in Accounts folder
    const accountsFolder = this.settings.accountsFolder;
    if (!filePath.startsWith(accountsFolder + '/')) {
      return null;
    }

    // Extract account folder name
    const relativePath = filePath.substring(accountsFolder.length + 1);
    const accountFolderName = relativePath.split('/')[0];

    if (!accountFolderName) {
      return null;
    }

    // Find matching account in cache
    const account = this.settings.cachedAccounts.find(
      a => this.sanitizeFolderName(a.name).toLowerCase() === accountFolderName.toLowerCase()
    );

    return account || null;
  }

  /**
   * Save audio file to recordings folder
   * Returns the path to the saved file
   */
  async saveAudioFile(result: RecordingResult, sourceFile: TFile): Promise<string | undefined> {
    try {
      // Ensure recordings folder exists
      await this.ensureFolderExists(this.settings.recordingsFolder);

      // Create filename based on source file
      const audioFilename = `${sourceFile.basename}-${result.filename}`;
      const audioPath = `${this.settings.recordingsFolder}/${audioFilename}`;

      // Convert blob to array buffer and save
      const arrayBuffer = await AudioRecorder.blobToArrayBuffer(result.audioBlob);
      await this.app.vault.createBinary(audioPath, arrayBuffer);
      
      return audioFilename; // Return just filename for Obsidian embed

    } catch (error) {
      console.warn('Failed to save audio file:', error);
      return undefined; // Don't throw - audio saving is optional
    }
  }

  /**
   * Insert transcription results into the active note
   * Removes placeholder if present, then inserts structured sections
   */
  async insertTranscriptionResults(
    file: TFile, 
    result: TranscriptionResult, 
    audioFilePath?: string
  ): Promise<void> {
    let content = await this.app.vault.read(file);
    
    // Remove processing placeholder if present
    const placeholderRegex = /\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;
    content = content.replace(placeholderRegex, '\n');
    
    // Format the sections with audio (if saved)
    const formattedContent = TranscriptionService.formatSectionsWithAudio(
      result.sections,
      this.settings.appendTranscript ? result.transcript : undefined,
      audioFilePath
    );

    // Find where to insert - after frontmatter and title
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);

    if (titleMatch) {
      // Insert after title
      const insertPoint = titleMatch[0].length;
      content = content.substring(0, insertPoint) + '\n' + formattedContent + content.substring(insertPoint);
    } else if (frontmatterMatch) {
      // Insert after frontmatter
      const insertPoint = frontmatterMatch[0].length;
      content = content.substring(0, insertPoint) + '\n' + formattedContent + content.substring(insertPoint);
    } else {
      // Prepend to content
      content = formattedContent + content;
    }

    await this.app.vault.modify(file, content);

    // Update frontmatter with transcription metadata
    await this.updateFrontmatter(file, {
      transcribed: true,
      transcribed_at: new Date().toISOString(),
      duration_seconds: result.duration
    });
  }

  /**
   * Create a new meeting note with template
   */
  async createMeetingNote(): Promise<void> {
    // Show account selector modal
    new AccountSelectorModal(this.app, this, async (account) => {
      if (!account) {
        new Notice('No account selected');
        return;
      }

      // Generate filename
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const fileName = `${dateStr} Meeting.md`;
      
      // Ensure account folder exists
      const accountFolder = `${this.settings.accountsFolder}/${this.sanitizeFolderName(account.name)}`;
      await this.ensureFolderExists(accountFolder);

      // Create file path
      const filePath = `${accountFolder}/${fileName}`;
      
      // Check if file exists
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing) {
        // Open existing file
        const leaf = this.app.workspace.getLeaf();
        await leaf.openFile(existing as TFile);
        return;
      }

      // Create meeting template content
      const templateContent = this.getMeetingTemplate(account.name, dateStr);
      
      // Create file
      const file = await this.app.vault.create(filePath, templateContent);
      
      // Open the file
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(file);

      new Notice(`Created meeting note for ${account.name}`);
    }).open();
  }

  /**
   * Apply meeting template to a new file
   */
  async applyMeetingTemplate(file: TFile): Promise<void> {
    const accountInfo = this.detectAccountFromPath(file.path);
    if (!accountInfo) return;

    const dateStr = new Date().toISOString().split('T')[0];
    const templateContent = this.getMeetingTemplate(accountInfo.name, dateStr);
    
    await this.app.vault.modify(file, templateContent);
  }

  /**
   * Get meeting note template - Clean, professional format
   */
  getMeetingTemplate(accountName: string, dateStr: string): string {
    return `---
title: Meeting with ${accountName}
date: ${dateStr}
attendees: 
tags: meeting
account: ${accountName}
product_interest: []
stage_signals: 
sync_to_salesforce: pending
---

# Meeting with ${accountName}

## Agenda
- 

## Pre-Call Notes


---

*To record: Click the microphone icon in the sidebar or use Cmd/Ctrl+P → "Start Recording"*

`;
  }

  /**
   * Fetch and insert pre-call context for current note
   */
  async fetchAndInsertContext(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note');
      return;
    }

    const accountInfo = this.detectAccountFromPath(activeFile.path);
    if (!accountInfo) {
      new Notice('Could not detect account from folder path');
      return;
    }

    new Notice('Fetching meeting context...');

    const context = await this.transcriptionService.getMeetingContext(accountInfo.id);
    if (!context.success) {
      new Notice(`Failed to fetch context: ${context.error}`);
      return;
    }

    // Format and insert context
    const formattedContext = TranscriptionService.formatContextForNote(context);
    
    let content = await this.app.vault.read(activeFile);
    
    // Find insertion point (after frontmatter and title)
    const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);
    if (titleMatch) {
      const insertPoint = titleMatch[0].length;
      content = content.substring(0, insertPoint) + '\n' + formattedContext + content.substring(insertPoint);
    } else {
      content = formattedContext + content;
    }

    await this.app.vault.modify(activeFile, content);
    new Notice('Meeting context added');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXISTING SYNC FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main sync function - fetches accounts from GTM Brain and creates missing folders
   */
  async syncAccounts(silent: boolean = false): Promise<void> {
    try {
      if (!silent) {
        new Notice('Syncing Salesforce accounts...');
      }

      // Fetch accounts from GTM Brain API
      const accounts = await this.fetchAccounts();
      
      if (accounts.length === 0) {
        if (!silent) {
          new Notice('No accounts found or server unavailable');
        }
        return;
      }

      // Cache accounts for autocomplete
      this.settings.cachedAccounts = accounts;

      // Ensure base accounts folder exists
      await this.ensureFolderExists(this.settings.accountsFolder);

      // Get existing folders
      const existingFolders = this.getExistingAccountFolders();

      // Create missing folders
      let created = 0;
      for (const account of accounts) {
        const safeName = this.sanitizeFolderName(account.name);
        const folderPath = `${this.settings.accountsFolder}/${safeName}`;
        
        if (!existingFolders.includes(safeName.toLowerCase())) {
          await this.ensureFolderExists(folderPath);
          created++;
        }
      }

      // Update last sync time
      this.settings.lastSyncTime = new Date().toISOString();
      await this.saveSettings();

      if (!silent) {
        if (created > 0) {
          new Notice(`Sync complete! Created ${created} new account folders. ${accounts.length} accounts available for autocomplete.`);
        } else {
          new Notice(`Sync complete. All ${accounts.length} accounts ready for autocomplete.`);
        }
      }

    } catch (error) {
      console.error('Eudia Sync error:', error);
      if (!silent) {
        new Notice(`Sync failed: ${error.message}`);
      }
    }
  }

  /**
   * Fetch accounts from GTM Brain API
   */
  async fetchAccounts(): Promise<SalesforceAccount[]> {
    try {
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/accounts/obsidian`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      const data: AccountsResponse = response.json;
      
      if (!data.success) {
        throw new Error('API returned unsuccessful response');
      }

      return data.accounts || [];
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      throw new Error('Could not connect to GTM Brain server');
    }
  }

  /**
   * Sync the current note to Salesforce
   */
  async syncNoteToSalesforce(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note to sync');
      return;
    }

    try {
      const content = await this.app.vault.read(activeFile);
      const frontmatter = this.parseFrontmatter(content);
      
      // Try to get account from frontmatter or folder path
      let account: SalesforceAccount | null = null;
      
      if (frontmatter.account) {
        account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === frontmatter.account.toLowerCase()
        ) || null;
      }
      
      if (!account) {
        account = this.detectAccountFromPath(activeFile.path);
      }

      if (!account) {
        // More helpful error with action
        new Notice('No account found. Add an "account" property or move note to an account folder.', 5000);
        
        // Offer to show account selector
        new AccountSelectorModal(this.app, this, async (selectedAccount) => {
          if (selectedAccount) {
            // Update frontmatter with selected account
            await this.updateFrontmatter(activeFile, { account: selectedAccount.name });
            new Notice(`Account set to ${selectedAccount.name}. Try syncing again.`);
          }
        }).open();
        return;
      }

      new Notice('Syncing note to Salesforce...');

      // Post to GTM Brain API
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/notes/sync`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: account.id,
          accountName: account.name,
          noteTitle: activeFile.basename,
          notePath: activeFile.path,
          content: content,
          frontmatter: frontmatter,
          syncedAt: new Date().toISOString()
        })
      });

      if (response.json.success) {
        new Notice('Note synced to Salesforce');
        
        // Update frontmatter to mark as synced
        await this.updateFrontmatter(activeFile, {
          synced_to_salesforce: true,
          last_synced: new Date().toISOString()
        });
      } else {
        new Notice(`Sync failed: ${response.json.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('Sync to Salesforce failed:', error);
      new Notice(`Sync failed: ${error.message}`);
    }
  }

  /**
   * Parse frontmatter from note content
   */
  parseFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter: Record<string, any> = {};
    const lines = match[1].split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }
    
    return frontmatter;
  }

  /**
   * Update frontmatter properties in a file
   * Handles arrays, objects, and primitive values
   */
  async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
    let content = await this.app.vault.read(file);
    
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (frontmatterMatch) {
      let frontmatterContent = frontmatterMatch[1];
      
      for (const [key, value] of Object.entries(updates)) {
        // Skip null/undefined values
        if (value === null || value === undefined) continue;
        
        // Format value based on type
        let formattedValue: string;
        if (Array.isArray(value)) {
          // YAML array format
          if (value.length === 0) continue;
          formattedValue = `\n${value.map(v => `  - ${v}`).join('\n')}`;
        } else if (typeof value === 'object') {
          // Simple YAML object format
          formattedValue = JSON.stringify(value);
        } else {
          formattedValue = String(value);
        }
        
        const newLine = `${key}:${Array.isArray(value) ? formattedValue : ` ${formattedValue}`}`;
        
        // Remove existing key (including multiline arrays)
        const existingKeyRegex = new RegExp(`^${key}:.*(?:\\n  - .*)*`, 'm');
        if (existingKeyRegex.test(frontmatterContent)) {
          frontmatterContent = frontmatterContent.replace(existingKeyRegex, newLine);
        } else {
          frontmatterContent += `\n${newLine}`;
        }
      }
      
      content = content.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${frontmatterContent}\n---`
      );
      
      await this.app.vault.modify(file, content);
    }
  }

  /**
   * Get list of existing account folder names (lowercase for comparison)
   */
  getExistingAccountFolders(): string[] {
    const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
    
    if (!accountsFolder || !(accountsFolder instanceof TFolder)) {
      return [];
    }

    return accountsFolder.children
      .filter(f => f instanceof TFolder)
      .map(f => f.name.toLowerCase());
  }

  /**
   * Ensure a folder exists, creating it if necessary
   */
  async ensureFolderExists(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!existing) {
      await this.app.vault.createFolder(path);
    }
  }

  /**
   * Sanitize account name for use as folder name
   */
  sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Activate or create the calendar view
   */
  async activateCalendarView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);

    if (leaves.length > 0) {
      // View already open - focus it
      leaf = leaves[0];
    } else {
      // Create new leaf in right sidebar
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

/**
 * Calendar View - Shows upcoming meetings from GTM Brain
 */
class EudiaCalendarView extends ItemView {
  plugin: EudiaSyncPlugin;
  private refreshInterval: number | null = null;

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
    
    // Auto-refresh every 5 minutes
    this.refreshInterval = window.setInterval(() => {
      this.render();
    }, 5 * 60 * 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
    }
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('eudia-calendar-view');

    // Header
    const header = container.createDiv({ cls: 'eudia-calendar-header' });
    header.createEl('h4', { text: 'Upcoming Meetings' });
    
    const refreshBtn = header.createEl('button', { cls: 'eudia-calendar-refresh' });
    refreshBtn.innerHTML = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.onclick = () => this.render();

    // Check if email is configured
    if (!this.plugin.settings.userEmail) {
      container.createDiv({ cls: 'eudia-calendar-empty' }).createEl('p', {
        text: 'Configure your email in plugin settings to see your calendar.'
      });
      return;
    }

    // Loading state
    const loadingEl = container.createDiv({ cls: 'eudia-calendar-loading' });
    loadingEl.textContent = 'Loading calendar...';

    try {
      // Fetch week's meetings
      const calendarService = new CalendarService(
        this.plugin.settings.serverUrl,
        this.plugin.settings.userEmail
      );
      const weekData = await calendarService.getWeekMeetings();

      loadingEl.remove();

      if (!weekData.success || Object.keys(weekData.byDay).length === 0) {
        container.createDiv({ cls: 'eudia-calendar-empty' }).createEl('p', {
          text: weekData.error || 'No upcoming meetings found.'
        });
        return;
      }

      // Render by day
      const days = Object.keys(weekData.byDay).sort();
      
      for (const day of days) {
        const meetings = weekData.byDay[day];
        if (meetings.length === 0) continue;

        const daySection = container.createDiv({ cls: 'eudia-calendar-day' });
        daySection.createEl('div', { 
          cls: 'eudia-calendar-day-header',
          text: CalendarService.getDayName(day)
        });

        for (const meeting of meetings) {
          const meetingEl = daySection.createDiv({ 
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
            details.createEl('div', { 
              cls: 'eudia-calendar-account', 
              text: meeting.accountName 
            });
          } else if (meeting.attendees.length > 0) {
            details.createEl('div', { 
              cls: 'eudia-calendar-attendees', 
              text: meeting.attendees.slice(0, 2).map(a => a.name || a.email.split('@')[0]).join(', ')
            });
          }

          // Click to create note
          meetingEl.onclick = async () => {
            await this.createNoteForMeeting(meeting);
          };
          meetingEl.title = 'Click to create meeting note';
        }
      }

    } catch (error) {
      loadingEl.remove();
      container.createDiv({ cls: 'eudia-calendar-error' }).createEl('p', {
        text: `Error loading calendar: ${error.message}`
      });
    }
  }

  /**
   * Create a note for a calendar meeting
   */
  async createNoteForMeeting(meeting: CalendarMeeting): Promise<void> {
    const dateStr = meeting.start.split('T')[0];
    
    // Try to find account folder
    let folderPath = this.plugin.settings.accountsFolder;
    if (meeting.accountName) {
      const sanitizedName = meeting.accountName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
      const accountFolder = `${this.plugin.settings.accountsFolder}/${sanitizedName}`;
      
      // Check if folder exists
      const folder = this.app.vault.getAbstractFileByPath(accountFolder);
      if (folder && folder instanceof TFolder) {
        folderPath = accountFolder;
      }
    }

    // Create filename from meeting subject
    const sanitizedSubject = meeting.subject
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
    
    const fileName = `${dateStr} ${sanitizedSubject}.md`;
    const filePath = `${folderPath}/${fileName}`;

    // Check if file exists
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing && existing instanceof TFile) {
      // Open existing file
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(existing);
      return;
    }

    // Create template content
    const attendees = meeting.attendees
      .map(a => a.name || a.email.split('@')[0])
      .slice(0, 5)
      .join(', ');

    const template = `---
title: ${meeting.subject}
date: ${dateStr}
attendees: ${attendees}
account: ${meeting.accountName || ''}
meeting_start: ${meeting.start}
tags: meeting
sync_to_salesforce: pending
product_interest: []
---

# ${meeting.subject}

## Pre-Call Notes


---

*To record: Click the microphone icon or use Cmd/Ctrl+P → "Start Recording"*

`;

    // Create file
    const file = await this.app.vault.create(filePath, template);
    
    // Open the file
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file);
    
    new Notice(`Created meeting note for ${meeting.subject}`);
  }
}

/**
 * Settings tab for the plugin
 */
class EudiaSyncSettingTab extends PluginSettingTab {
  plugin: EudiaSyncPlugin;

  constructor(app: App, plugin: EudiaSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Eudia Sync & Scribe Settings' });

    // Server settings
    containerEl.createEl('h3', { text: 'Connection' });

    new Setting(containerEl)
      .setName('GTM Brain Server URL')
      .setDesc('The URL of your GTM Brain server')
      .addText(text => text
        .setPlaceholder('https://gtm-brain.onrender.com')
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async (value) => {
          this.plugin.settings.serverUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('Your OpenAI API key for transcription. Required if server is unavailable.')
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.style.width = '300px';
      });

    // Folder settings
    containerEl.createEl('h3', { text: 'Folders' });

    new Setting(containerEl)
      .setName('Accounts Folder')
      .setDesc('Folder where account subfolders will be created')
      .addText(text => text
        .setPlaceholder('Accounts')
        .setValue(this.plugin.settings.accountsFolder)
        .onChange(async (value) => {
          this.plugin.settings.accountsFolder = value || 'Accounts';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Recordings Folder')
      .setDesc('Folder where audio recordings will be saved')
      .addText(text => text
        .setPlaceholder('Recordings')
        .setValue(this.plugin.settings.recordingsFolder)
        .onChange(async (value) => {
          this.plugin.settings.recordingsFolder = value || 'Recordings';
          await this.plugin.saveSettings();
        }));

    // Recording settings
    containerEl.createEl('h3', { text: 'Recording' });

    new Setting(containerEl)
      .setName('Save Audio Files')
      .setDesc('Save the original audio recording alongside the note')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.saveAudioFiles)
        .onChange(async (value) => {
          this.plugin.settings.saveAudioFiles = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Append Full Transcript')
      .setDesc('Include the full transcript at the end of the structured summary')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.appendTranscript)
        .onChange(async (value) => {
          this.plugin.settings.appendTranscript = value;
          await this.plugin.saveSettings();
        }));

    // Sync settings
    containerEl.createEl('h3', { text: 'Salesforce Sync' });

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
      .setDesc('Automatically sync meeting notes to Salesforce after transcription')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSyncAfterTranscription)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncAfterTranscription = value;
          await this.plugin.saveSettings();
        }));

    // Status
    containerEl.createEl('h3', { text: 'Status' });
    
    if (this.plugin.settings.lastSyncTime) {
      const lastSync = new Date(this.plugin.settings.lastSyncTime);
      containerEl.createEl('p', { 
        text: `Last synced: ${lastSync.toLocaleString()}`,
        cls: 'setting-item-description'
      });
    }

    containerEl.createEl('p', { 
      text: `Cached accounts: ${this.plugin.settings.cachedAccounts.length}`,
      cls: 'setting-item-description'
    });

    // Browser support check
    const isSupported = AudioRecorder.isSupported();
    containerEl.createEl('p', { 
      text: `Audio recording: ${isSupported ? '✓ Supported' : '✗ Not supported'}`,
      cls: 'setting-item-description'
    });

    // Action buttons
    containerEl.createEl('h3', { text: 'Actions' });

    new Setting(containerEl)
      .setName('Sync Accounts')
      .setDesc('Manually sync Salesforce accounts and create folders')
      .addButton(button => button
        .setButtonText('Sync Now')
        .setCta()
        .onClick(async () => {
          await this.plugin.syncAccounts();
          this.display();
        }));

    new Setting(containerEl)
      .setName('Sync Current Note')
      .setDesc('Push the current note\'s data to Salesforce')
      .addButton(button => button
        .setButtonText('Sync to Salesforce')
        .onClick(async () => {
          await this.plugin.syncNoteToSalesforce();
        }));

    new Setting(containerEl)
      .setName('Fetch Context')
      .setDesc('Get pre-call context for the current note')
      .addButton(button => button
        .setButtonText('Fetch Context')
        .onClick(async () => {
          await this.plugin.fetchAndInsertContext();
        }));
  }
}
