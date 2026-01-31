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
  serverUrl: 'https://gtm-wizard.onrender.com',
  accountsFolder: 'Accounts',
  recordingsFolder: 'Recordings',
  syncOnStartup: true,
  autoSyncAfterTranscription: true,
  saveAudioFiles: true,
  appendTranscript: true,  // Enabled by default for full transcript access
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
  // OpenAI configuration - Will be pre-configured in vault distribution data.json
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
    this.containerEl.className = 'eudia-transcription-bar active';
    
    // Minimal design: just volume meter and stop button
    // Audio level meter (primary visual feedback)
    const levelContainer = document.createElement('div');
    levelContainer.className = 'eudia-level-container';
    this.levelBarEl = document.createElement('div');
    this.levelBarEl.className = 'eudia-level-bar';
    this.levelBarEl.style.width = '0%';
    levelContainer.appendChild(this.levelBarEl);
    this.containerEl.appendChild(levelContainer);

    // Hidden duration for internal tracking only
    this.durationEl = document.createElement('div');
    this.durationEl.className = 'eudia-duration-hidden';
    this.durationEl.style.display = 'none';
    this.containerEl.appendChild(this.durationEl);

    // Hidden status text for accessibility
    this.statusTextEl = document.createElement('div');
    this.statusTextEl.className = 'eudia-status-hidden';
    this.statusTextEl.style.display = 'none';
    this.statusTextEl.textContent = 'Transcribing';
    this.containerEl.appendChild(this.statusTextEl);

    // Minimal controls - just stop and cancel
    const controls = document.createElement('div');
    controls.className = 'eudia-controls-minimal';

    // Stop button (primary action)
    const stopBtn = document.createElement('button');
    stopBtn.className = 'eudia-control-btn stop';
    stopBtn.innerHTML = '⏹';
    stopBtn.title = 'Stop & Summarize';
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
      if (this.statusTextEl) this.statusTextEl.textContent = 'Listening...';
    }
  }

  /**
   * Show processing state while transcribing
   */
  showProcessing(): void {
    if (!this.containerEl) return;
    
    this.containerEl.className = 'eudia-recording-bar processing';
    if (this.statusTextEl) this.statusTextEl.textContent = 'Transcribing...';
    
    // Hide audio level during processing
    if (this.levelBarEl && this.levelBarEl.parentElement) {
      this.levelBarEl.parentElement.style.display = 'none';
    }
  }

  /**
   * Show transcription complete with stats
   */
  showComplete(stats: {
    duration: number;
    confidence: number;
    meddiccCount: number;
    nextStepsCount: number;
    dealHealth?: string;
  }): void {
    if (!this.containerEl) return;
    
    // Clear and rebuild container for completion view
    this.containerEl.innerHTML = '';
    this.containerEl.className = 'eudia-recording-bar complete';
    
    // Success indicator
    const successIcon = document.createElement('div');
    successIcon.className = 'eudia-complete-icon';
    successIcon.innerHTML = '✓';
    this.containerEl.appendChild(successIcon);
    
    // Stats container
    const statsContainer = document.createElement('div');
    statsContainer.className = 'eudia-complete-stats';
    
    // Duration
    const durationStat = document.createElement('div');
    durationStat.className = 'eudia-stat';
    durationStat.innerHTML = `<span class="eudia-stat-value">${Math.round(stats.duration / 60)}m</span><span class="eudia-stat-label">Duration</span>`;
    statsContainer.appendChild(durationStat);
    
    // Confidence
    const confidenceStat = document.createElement('div');
    confidenceStat.className = 'eudia-stat';
    const confidenceClass = stats.confidence >= 90 ? 'high' : stats.confidence >= 70 ? 'medium' : 'low';
    confidenceStat.innerHTML = `<span class="eudia-stat-value ${confidenceClass}">${stats.confidence}%</span><span class="eudia-stat-label">Confidence</span>`;
    statsContainer.appendChild(confidenceStat);
    
    // MEDDICC signals
    const meddiccStat = document.createElement('div');
    meddiccStat.className = 'eudia-stat';
    meddiccStat.innerHTML = `<span class="eudia-stat-value">${stats.meddiccCount}/7</span><span class="eudia-stat-label">MEDDICC</span>`;
    statsContainer.appendChild(meddiccStat);
    
    // Next steps
    const nextStepsStat = document.createElement('div');
    nextStepsStat.className = 'eudia-stat';
    nextStepsStat.innerHTML = `<span class="eudia-stat-value">${stats.nextStepsCount}</span><span class="eudia-stat-label">Next Steps</span>`;
    statsContainer.appendChild(nextStepsStat);
    
    this.containerEl.appendChild(statsContainer);
    
    // Deal health badge if available
    if (stats.dealHealth) {
      const healthBadge = document.createElement('div');
      healthBadge.className = `eudia-deal-health-badge ${stats.dealHealth}`;
      healthBadge.textContent = stats.dealHealth.charAt(0).toUpperCase() + stats.dealHealth.slice(1);
      this.containerEl.appendChild(healthBadge);
    }
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'eudia-control-btn close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close';
    closeBtn.onclick = () => this.hide();
    this.containerEl.appendChild(closeBtn);
    
    // Auto-hide after 8 seconds
    setTimeout(() => this.hide(), 8000);
  }

  setProcessing(): void {
    if (!this.containerEl) return;
    this.containerEl.className = 'eudia-recording-bar processing';
    if (this.statusTextEl) this.statusTextEl.textContent = 'Transcribing...';
    
    // Disable buttons
    const buttons = this.containerEl.querySelectorAll('button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));
  }

  /**
   * Set transcribing state with time estimate based on audio duration
   * @param audioDurationSec - Duration of audio in seconds
   */
  setTranscribing(audioDurationSec: number): void {
    if (!this.containerEl) return;
    
    this.containerEl.className = 'eudia-recording-bar transcribing';
    
    // Calculate estimated time (Whisper processes at ~4x realtime for large files)
    // Minimum 15 seconds for API overhead
    const estimatedSeconds = Math.max(15, Math.ceil(audioDurationSec / 4));
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
    
    let timeEstimate: string;
    if (estimatedMinutes <= 1) {
      timeEstimate = '< 1 min';
    } else if (estimatedMinutes <= 5) {
      timeEstimate = `~${estimatedMinutes} min`;
    } else {
      timeEstimate = `~${estimatedMinutes} min`;
    }
    
    if (this.statusTextEl) {
      this.statusTextEl.textContent = `Transcribing (${timeEstimate})...`;
    }
    
    // Update duration display to show processing
    if (this.durationEl) {
      this.durationEl.textContent = timeEstimate;
    }
    
    // Add animated processing indicator
    if (this.levelBarEl) {
      this.levelBarEl.style.width = '100%';
      this.levelBarEl.style.animation = 'eudia-pulse 1.5s ease-in-out infinite';
    }
    
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
 * Polished onboarding with verification
 */
class SetupWizardModal extends Modal {
  plugin: EudiaSyncPlugin;
  private emailInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private stepsContainer: HTMLElement;
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

    // Header
    contentEl.createEl('h2', { text: 'Welcome to Eudia Sales Intelligence' });
    contentEl.createEl('p', { 
      text: 'Get set up in 30 seconds. Just enter your email to connect everything.',
      cls: 'setting-item-description'
    });

    // Email input - prominent
    const emailSection = contentEl.createDiv({ cls: 'eudia-setup-section' });
    emailSection.createEl('h3', { text: 'Your Eudia Email' });
    
    this.emailInput = emailSection.createEl('input', {
      type: 'email',
      placeholder: 'yourname@eudia.com',
      cls: 'eudia-email-input'
    });
    this.emailInput.style.width = '100%';
    this.emailInput.style.padding = '12px 14px';
    this.emailInput.style.marginTop = '8px';
    this.emailInput.style.borderRadius = '8px';
    this.emailInput.style.border = '1px solid var(--background-modifier-border)';
    this.emailInput.style.fontSize = '15px';
    
    // Allow Enter to submit
    this.emailInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.runSetup();
      }
    };

    // Setup steps container (shows progress)
    this.stepsContainer = contentEl.createDiv({ cls: 'eudia-setup-steps' });
    this.stepsContainer.style.marginTop = '20px';
    this.stepsContainer.style.display = 'none';

    // Status area
    this.statusEl = contentEl.createDiv({ cls: 'eudia-setup-status' });
    this.statusEl.style.marginTop = '16px';
    this.statusEl.style.padding = '12px';
    this.statusEl.style.borderRadius = '8px';
    this.statusEl.style.display = 'none';

    // What gets connected
    const infoSection = contentEl.createDiv({ cls: 'eudia-setup-info' });
    infoSection.style.marginTop = '20px';
    infoSection.style.fontSize = '12px';
    infoSection.style.color = 'var(--text-muted)';
    infoSection.innerHTML = `
      <p style="margin: 0 0 8px 0;"><strong>This will automatically:</strong></p>
      <p style="margin: 0;">• Connect your Outlook calendar for meeting context</p>
      <p style="margin: 4px 0 0 0;">• Sync Salesforce accounts as folders for easy filing</p>
      <p style="margin: 4px 0 0 0;">• Enable AI transcription and MEDDICC extraction</p>
    `;

    // Button
    const buttonContainer = contentEl.createDiv({ cls: 'eudia-setup-buttons' });
    buttonContainer.style.marginTop = '24px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '12px';

    const skipBtn = buttonContainer.createEl('button', { text: 'Skip for Now' });
    skipBtn.onclick = () => this.close();

    const setupBtn = buttonContainer.createEl('button', { text: 'Connect & Continue', cls: 'mod-cta' });
    setupBtn.style.padding = '10px 20px';
    setupBtn.onclick = () => this.runSetup();
  }

  async runSetup() {
    const email = this.emailInput.value.trim().toLowerCase();
    
    // Validate email
    if (!email || !email.includes('@')) {
      this.showStatus('Please enter a valid email address', 'error');
      return;
    }
    
    if (!email.endsWith('@eudia.com')) {
      this.showStatus('Please use your @eudia.com email address', 'error');
      return;
    }

    // Show steps container
    this.stepsContainer.style.display = 'block';
    this.stepsContainer.innerHTML = '';
    
    // Create step indicators
    const steps = [
      { id: 'email', label: 'Saving email...' },
      { id: 'accounts', label: 'Syncing Salesforce accounts...' },
      { id: 'calendar', label: 'Connecting calendar...' },
      { id: 'verify', label: 'Verifying connections...' }
    ];
    
    steps.forEach(step => {
      const stepEl = this.stepsContainer.createDiv({ cls: 'eudia-setup-step' });
      stepEl.id = `step-${step.id}`;
      stepEl.innerHTML = `<span class="step-indicator">○</span> ${step.label}`;
      stepEl.style.padding = '6px 0';
      stepEl.style.fontSize = '13px';
      stepEl.style.color = 'var(--text-muted)';
    });

    try {
      // Step 1: Save email
      this.updateStep('email', 'running');
      this.plugin.settings.userEmail = email;
      this.plugin.settings.calendarConfigured = true;
      await this.plugin.saveSettings();
      this.updateStep('email', 'complete');

      // Step 2: Sync accounts
      this.updateStep('accounts', 'running');
      await this.plugin.syncAccounts(true);
      const accountCount = this.plugin.settings.cachedAccounts?.length || 0;
      this.updateStep('accounts', 'complete', `${accountCount} accounts synced`);

      // Step 3: Configure calendar
      this.updateStep('calendar', 'running');
      await this.configureCalendar(email);
      this.updateStep('calendar', 'complete');

      // Step 4: Verify
      this.updateStep('verify', 'running');
      const health = await this.plugin.checkServerHealth();
      this.updateStep('verify', 'complete', health.salesforceConnected ? 'All systems connected' : 'Connected (Salesforce pending)');

      // Mark setup complete
      this.plugin.settings.setupCompleted = true;
      await this.plugin.saveSettings();

      // Show success summary
      this.showSuccessSummary(accountCount, email);

    } catch (error) {
      this.showStatus(`Setup failed: ${(error as Error).message}. You can try again later in settings.`, 'error');
    }
  }
  
  updateStep(stepId: string, status: 'running' | 'complete' | 'error', detail?: string) {
    const stepEl = document.getElementById(`step-${stepId}`);
    if (!stepEl) return;
    
    if (status === 'running') {
      stepEl.querySelector('.step-indicator')!.textContent = '◐';
      stepEl.style.color = 'var(--text-normal)';
    } else if (status === 'complete') {
      stepEl.querySelector('.step-indicator')!.textContent = '✓';
      stepEl.style.color = 'var(--interactive-success)';
      if (detail) {
        stepEl.innerHTML = `<span class="step-indicator">✓</span> ${detail}`;
      }
    } else if (status === 'error') {
      stepEl.querySelector('.step-indicator')!.textContent = '✕';
      stepEl.style.color = 'var(--text-error)';
    }
  }
  
  showSuccessSummary(accountCount: number, email: string) {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('eudia-setup-wizard');
    
    // Success header
    const header = contentEl.createDiv({ cls: 'eudia-setup-success-header' });
    header.innerHTML = `
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
        <h2 style="margin: 0;">You're All Set!</h2>
      </div>
    `;
    
    // Summary
    const summary = contentEl.createDiv({ cls: 'eudia-setup-summary' });
    summary.style.background = 'var(--background-secondary)';
    summary.style.borderRadius = '8px';
    summary.style.padding = '16px';
    summary.style.marginTop = '16px';
    summary.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-muted);">Email</span>
        <span style="font-weight: 500;">${email}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-muted);">Calendar</span>
        <span style="color: var(--interactive-success); font-weight: 500;">Connected</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Accounts</span>
        <span style="font-weight: 500;">${accountCount} available</span>
      </div>
    `;
    
    // Quick start guide
    const guide = contentEl.createDiv({ cls: 'eudia-setup-guide' });
    guide.style.marginTop = '20px';
    guide.innerHTML = `
      <h3 style="margin: 0 0 12px 0; font-size: 14px;">Quick Start</h3>
      <div style="font-size: 13px; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;">🎙️ <strong>Transcribe a meeting:</strong> Click the microphone icon in the sidebar</p>
        <p style="margin: 0 0 8px 0;">📅 <strong>View your calendar:</strong> Click the calendar icon to see upcoming meetings</p>
        <p style="margin: 0;">📁 <strong>File notes:</strong> Save notes in account folders for auto-linking</p>
      </div>
    `;
    
    // Done button
    const buttonContainer = contentEl.createDiv({ cls: 'eudia-setup-buttons' });
    buttonContainer.style.marginTop = '24px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    
    const doneBtn = buttonContainer.createEl('button', { text: 'Start Using Eudia', cls: 'mod-cta' });
    doneBtn.style.padding = '12px 32px';
    doneBtn.onclick = () => {
      this.close();
      this.onComplete();
      new Notice('Ready! Click the microphone to transcribe meetings.');
    };
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

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING UTILITIES - For cross-system traceability
// ═══════════════════════════════════════════════════════════════════════════

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  correlationId?: string;
  plugin: string;
  operation?: string;
  context?: Record<string, unknown>;
}

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Check if verbose logging is enabled via localStorage
function isVerboseLogging(): boolean {
  try {
    return localStorage.getItem('eudia-verbose-logging') === 'true';
  } catch {
    return false;
  }
}

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
  
  // Logging state
  private currentCorrelationId: string | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGING METHODS - Structured JSON logging for debugging and traceability
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Log a structured message
   */
  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.currentCorrelationId || undefined,
      plugin: 'eudia-transcription',
      context
    };
    
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn('[Eudia]', JSON.stringify(entry));
  }

  /**
   * Start a new operation - returns correlation ID for tracing
   */
  private operationStart(operation: string, context?: Record<string, unknown>): string {
    const correlationId = generateCorrelationId();
    this.currentCorrelationId = correlationId;
    
    this.log('info', `[START] ${operation}`, {
      operation,
      correlationId,
      ...context
    });
    
    return correlationId;
  }

  /**
   * Log operation success
   */
  private operationSuccess(operation: string, context?: Record<string, unknown>): void {
    this.log('info', `[SUCCESS] ${operation}`, {
      operation,
      result: 'success',
      ...context
    });
    this.currentCorrelationId = null;
  }

  /**
   * Log operation error with full context
   */
  private operationError(operation: string, error: Error, context?: Record<string, unknown>): void {
    this.log('error', `[ERROR] ${operation}`, {
      operation,
      errorMessage: error.message,
      errorStack: error.stack,
      ...context
    });
    this.currentCorrelationId = null;
  }

  /**
   * Verbose logging - only outputs if EUDIA_VERBOSE_LOGGING is enabled
   */
  private verbose(message: string, context?: Record<string, unknown>): void {
    if (isVerboseLogging()) {
      this.log('debug', `[VERBOSE] ${message}`, context);
    }
  }

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
    
    // Initialize account detector with cached accounts
    if (this.settings.cachedAccounts && this.settings.cachedAccounts.length > 0) {
      accountDetector.setAccounts(this.settings.cachedAccounts.map(a => ({ id: a.id, name: a.name })));
    }

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
    this.ribbonIcon = this.addRibbonIcon('microphone', 'Transcribe Meeting', async () => {
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

    // Transcription commands
    this.addCommand({
      id: 'start-recording',
      name: 'Start Transcribing Meeting',
      callback: async () => {
        if (!this.isRecording) {
          await this.startRecording();
        }
      }
    });

    this.addCommand({
      id: 'stop-recording',
      name: 'Stop & Generate Summary',
      callback: async () => {
        if (this.isRecording) {
          await this.stopRecording();
        }
      }
    });

    this.addCommand({
      id: 'toggle-recording',
      name: 'Toggle Meeting Transcription',
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
      name: 'Pause/Resume Transcription',
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

    const correlationId = this.operationStart('startRecording');

    // Check browser support
    if (!AudioRecorder.isSupported()) {
      new Notice('Audio transcription is not supported in this browser');
      this.log('error', 'Audio recording not supported', { correlationId });
      return;
    }

    // Check for active note
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Please open or create a note first');
      this.log('warn', 'No active file for recording', { correlationId });
      return;
    }

    try {
      this.log('info', 'Starting audio recorder', { file: activeFile.path, correlationId });
      
      // Start recording
      await this.audioRecorder.startRecording();
      this.isRecording = true;
      this.isPaused = false;

      // Update ribbon icon
      if (this.ribbonIcon) {
        this.ribbonIcon.addClass('eudia-ribbon-transcribing');
      }

      // Show status bar
      this.recordingStatusBar = new RecordingStatusBar(
        () => this.togglePause(),
        () => this.togglePause(),
        () => this.stopRecording(),
        () => this.cancelRecording()
      );
      this.recordingStatusBar.show();

      new Notice('Transcription started');
      this.operationSuccess('startRecording', { file: activeFile.path });

      // Auto-detect current calendar meeting (non-blocking)
      this.autoDetectCurrentMeeting(activeFile);

    } catch (error) {
      this.operationError('startRecording', error as Error, { correlationId });
      new Notice(`Failed to start transcription: ${(error as Error).message}`);
      this.isRecording = false;
    }
  }

  /**
   * Auto-detect current calendar meeting and update note metadata
   * Runs in background - doesn't block recording start
   * Also attempts to match account from attendee email domains
   */
  async autoDetectCurrentMeeting(file: TFile): Promise<void> {
    if (!this.settings.userEmail) {
      this.verbose('Calendar auto-detect skipped: no user email configured');
      return;
    }

    const correlationId = this.operationStart('autoDetectCurrentMeeting', { file: file.path });

    try {
      // Fetch today's meetings from GTM Brain
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/calendar/${this.settings.userEmail}/today`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.json.success || !response.json.meetings?.length) {
        this.log('info', 'No meetings found for today', { correlationId });
        return;
      }

      // Find meeting happening now (within ±15 min window)
      const now = new Date();
      const meetings = response.json.meetings;
      
      // Sort meetings by how close they are to current time
      const scoredMeetings = meetings.map((m: any) => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        const windowStart = new Date(start.getTime() - 15 * 60 * 1000);
        const isInWindow = now >= windowStart && now <= end;
        const distanceFromStart = Math.abs(now.getTime() - start.getTime());
        return { meeting: m, isInWindow, distanceFromStart };
      });

      // Find best match (in window, closest to start time)
      const bestMatch = scoredMeetings
        .filter((s: any) => s.isInWindow)
        .sort((a: any, b: any) => a.distanceFromStart - b.distanceFromStart)[0];

      if (!bestMatch) {
        this.log('info', 'No meeting happening now', { correlationId });
        return;
      }

      const currentMeeting = bestMatch.meeting;
      this.log('info', 'Current meeting detected', { 
        correlationId, 
        subject: currentMeeting.subject 
      });

      // Extract attendees (external only)
      const externalAttendees = currentMeeting.attendees
        ?.filter((a: any) => !a.email?.includes('@eudia.com') && !a.email?.includes('@eudia.ai'))
        || [];
      
      const attendeeNames = externalAttendees
        .map((a: any) => a.name || a.email)
        .slice(0, 5)
        .join(', ');

      // Try to match account from attendee email domains
      let matchedAccount = '';
      if (externalAttendees.length > 0) {
        matchedAccount = await this.matchAccountFromAttendees(externalAttendees);
      }

      // Build frontmatter updates
      const frontmatterUpdates: Record<string, any> = {
        meeting_title: currentMeeting.subject,
        attendees: attendeeNames,
        meeting_start: currentMeeting.start
      };

      // Only set account if we found a match and current is empty
      if (matchedAccount) {
        const currentContent = await this.app.vault.read(file);
        const hasAccount = currentContent.match(/^account:\s*\S+/m);
        if (!hasAccount) {
          frontmatterUpdates.account = matchedAccount;
          this.log('info', 'Account matched from attendees', { 
            correlationId, 
            account: matchedAccount 
          });
        }
      }

      // Update frontmatter with meeting info
      await this.updateFrontmatter(file, frontmatterUpdates);
      this.operationSuccess('autoDetectCurrentMeeting', { 
        correlationId, 
        meeting: currentMeeting.subject,
        account: matchedAccount || 'no match'
      });

    } catch (error) {
      // Silent fail - calendar auto-detect is optional
      this.log('warn', 'Calendar auto-detect failed (non-fatal)', { 
        correlationId, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Match a Salesforce account from attendee email domains
   */
  private async matchAccountFromAttendees(attendees: Array<{email?: string, name?: string}>): Promise<string> {
    if (!this.settings.cachedAccounts?.length) {
      return '';
    }

    // Extract unique domains from attendee emails
    const domains = new Set<string>();
    for (const attendee of attendees) {
      if (attendee.email) {
        const domain = attendee.email.split('@')[1]?.toLowerCase();
        if (domain && !domain.includes('gmail') && !domain.includes('outlook') && 
            !domain.includes('yahoo') && !domain.includes('hotmail')) {
          domains.add(domain);
        }
      }
    }

    // Try to match domain to account name
    for (const domain of domains) {
      // Extract company name from domain (e.g., "acme.com" -> "acme")
      const domainParts = domain.split('.');
      const companyPart = domainParts[0];
      
      // Find matching account (case-insensitive partial match)
      const matchedAccount = this.settings.cachedAccounts.find(acc => 
        acc.name.toLowerCase().includes(companyPart) ||
        companyPart.includes(acc.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      );

      if (matchedAccount) {
        return matchedAccount.name;
      }
    }

    return '';
  }

  /**
   * Stop recording and process - NON-BLOCKING
   * User regains control immediately while transcription happens in background
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) return;

    const correlationId = this.operationStart('stopRecording');

    try {
      // Update UI to processing state
      if (this.recordingStatusBar) {
        this.recordingStatusBar.setProcessing();
      }

      // Stop recording and get audio
      this.log('info', 'Stopping audio recorder', { correlationId });
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
        this.ribbonIcon.removeClass('eudia-ribbon-transcribing');
      }

      // Get active file BEFORE any async operations
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice('No active file to save transcription');
        this.log('warn', 'No active file found for transcription', { correlationId });
        return;
      }

      // CRITICAL: Ensure template is applied before inserting placeholder
      this.log('info', 'Ensuring template is applied', { file: activeFile.path, correlationId });
      await this.ensureTemplateApplied(activeFile);

      // Insert placeholder immediately so user can continue working
      // Pass audio duration for time estimate
      const audioDurationSec = result.duration ? result.duration / 1000 : undefined;
      await this.insertProcessingPlaceholder(activeFile, audioDurationSec);
      new Notice('Processing audio... You can continue working.');

      // Process in background - don't await
      this.log('info', 'Starting background transcription', { correlationId, audioDurationSec });
      this.processRecordingInBackground(result, activeFile);

    } catch (error) {
      this.operationError('stopRecording', error as Error, { correlationId });
      this.isRecording = false;
      if (this.recordingStatusBar) {
        this.recordingStatusBar.hide();
        this.recordingStatusBar = null;
      }
      if (this.ribbonIcon) {
        this.ribbonIcon.removeClass('eudia-ribbon-transcribing');
      }
      new Notice(`Error stopping transcription: ${(error as Error).message}`);
    }
  }

  /**
   * Insert a placeholder while transcription is processing
   * @param file - The file to insert the placeholder into
   * @param audioDurationSec - Optional duration to calculate time estimate
   */
  async insertProcessingPlaceholder(file: TFile, audioDurationSec?: number): Promise<void> {
    let content = await this.app.vault.read(file);
    
    // Calculate time estimate
    let timeEstimate = '';
    if (audioDurationSec) {
      const estimatedMinutes = Math.max(1, Math.ceil(audioDurationSec / 4 / 60));
      timeEstimate = estimatedMinutes <= 1 ? '< 1 minute' : `~${estimatedMinutes} minutes`;
    }
    
    const placeholder = `
---

> **Transcription in progress${timeEstimate ? ` (${timeEstimate})` : ''}...**  
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
    const correlationId = this.operationStart('processRecordingInBackground', { 
      file: activeFile.path 
    });
    
    try {
      // Detect account from folder path
      const accountInfo = this.detectAccountFromPath(activeFile.path);
      this.log('info', 'Account detected from path', { 
        correlationId, 
        account: accountInfo?.name || 'none' 
      });
      
      // Get meeting context if we have an account
      let context: MeetingContext | undefined;
      if (accountInfo) {
        context = await this.transcriptionService.getMeetingContext(accountInfo.id);
      }

      // Convert audio to base64
      this.log('info', 'Converting audio to base64', { correlationId });
      const audioBase64 = await AudioRecorder.blobToBase64(result.audioBlob);

      // Save audio file if enabled
      let savedAudioPath: string | undefined;
      if (this.settings.saveAudioFiles) {
        savedAudioPath = await this.saveAudioFile(result, activeFile);
        this.log('info', 'Audio file saved', { correlationId, path: savedAudioPath });
      }

      // Send for transcription - show processing status
      this.log('info', 'Starting transcription API call', { correlationId });
      if (this.recordingStatusBar) {
        this.recordingStatusBar.showProcessing();
      }
      
      const transcriptionResult = await this.transcriptionService.transcribeAndSummarize(
        audioBase64,
        result.mimeType,
        accountInfo?.name,
        accountInfo?.id,
        context
      );

      if (!transcriptionResult.success) {
        // Replace placeholder with error
        this.log('error', 'Transcription failed', { 
          correlationId, 
          error: transcriptionResult.error 
        });
        await this.replaceProcessingPlaceholder(
          activeFile, 
          `> **Transcription failed:** ${transcriptionResult.error}\n> \n> Try recording again or check your settings.`
        );
        new Notice(`Transcription failed: ${transcriptionResult.error}`);
        if (this.recordingStatusBar) {
          this.recordingStatusBar.hide();
        }
        return;
      }

      // Replace placeholder with actual results
      this.log('info', 'Inserting transcription results into note', { correlationId });
      await this.insertTranscriptionResults(activeFile, transcriptionResult, savedAudioPath);
      this.log('info', 'Transcription results inserted successfully', { correlationId });
      
      // Extract stats for completion display
      const meddiccCount = (transcriptionResult as any).meddicc?.summary?.detected_count || 0;
      const nextStepsCount = (transcriptionResult as any).next_steps?.count || 0;
      const confidence = (transcriptionResult as any).meddicc?.summary?.average_confidence || 
                         (transcriptionResult as any).quality?.confidence * 100 || 85;
      const dealHealth = (transcriptionResult as any).meddicc?.summary?.deal_health || 'pending';
      
      // Show completion status with stats
      if (this.recordingStatusBar) {
        this.recordingStatusBar.showComplete({
          duration: transcriptionResult.duration || 0,
          confidence: Math.round(confidence),
          meddiccCount,
          nextStepsCount,
          dealHealth
        });
      }
      
      new Notice('Transcription complete');

      // CRITICAL: Smart tags run AFTER insertTranscriptionResults completes
      if (this.settings.enableSmartTags) {
        this.log('info', 'Starting smart tag extraction (post-transcription)', { correlationId });
        try {
          const tagResult = await this.smartTagService.extractTags(transcriptionResult.sections);
          if (tagResult.success && tagResult.tags) {
            this.log('info', 'Smart tags extracted, applying to frontmatter', { 
              correlationId, 
              products: tagResult.tags.product_interest,
              dealHealth: tagResult.tags.deal_health
            });
            await this.applySmartTags(activeFile, tagResult.tags);
            this.log('info', 'Smart tags applied successfully', { correlationId });
          }
        } catch (tagError) {
          this.log('warn', 'Smart tag extraction failed (non-fatal)', { 
            correlationId, 
            error: (tagError as Error).message 
          });
          // Non-fatal - continue without tags
        }
      }

      // Auto-sync to Salesforce if enabled
      if (this.settings.autoSyncAfterTranscription && accountInfo) {
        this.log('info', 'Auto-syncing to Salesforce', { correlationId, accountId: accountInfo.id });
        await this.transcriptionService.syncToSalesforce(
          accountInfo.id,
          accountInfo.name,
          activeFile.basename,
          transcriptionResult.sections,
          transcriptionResult.transcript
        );
        new Notice('Synced to Salesforce');
      }

      this.operationSuccess('processRecordingInBackground', { correlationId });

    } catch (error) {
      this.operationError('processRecordingInBackground', error as Error, { correlationId });
      new Notice(`Transcription failed: ${(error as Error).message}`);
      
      // Try to update the placeholder with error
      try {
        await this.replaceProcessingPlaceholder(
          activeFile,
          `> **Transcription failed:** ${(error as Error).message}`
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
      this.ribbonIcon.removeClass('eudia-ribbon-transcribing');
    }

    new Notice('Transcription cancelled');
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
   * Get meeting note template - Clean, professional format with enhanced header UI
   */
  getMeetingTemplate(accountName: string, dateStr: string, attendees: string = '', meetingType: string = 'discovery'): string {
    return `---
title: Meeting with ${accountName || 'TBD'}
date: ${dateStr}
account: ${accountName || ''}
attendees: ${attendees}
sync_to_salesforce: false
products: []
meeting_type: ${meetingType}
deal_health: early-stage
auto_tags: []
recording_date: ${dateStr}
---

# Meeting with ${accountName || 'TBD'}

## Agenda
- 

## Pre-Call Notes


---

*To transcribe: Click the microphone icon in the sidebar or use Cmd/Ctrl+P → "Start Transcribing Meeting"*

`;
  }

  /**
   * Check if file has template frontmatter applied
   */
  private hasTemplateFrontmatter(content: string): boolean {
    // Check for key template fields in frontmatter
    return content.includes('---\n') && 
           (content.includes('account:') || content.includes('sync_to_salesforce:'));
  }

  /**
   * Apply template to file if missing - called before recording stops
   */
  private async ensureTemplateApplied(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    
    if (!this.hasTemplateFrontmatter(content)) {
      this.log('info', 'Applying template to blank file', { file: file.path });
      
      const accountInfo = this.detectAccountFromPath(file.path);
      const dateStr = new Date().toISOString().split('T')[0];
      const accountName = accountInfo?.name || '';
      
      // Create template but preserve any existing content after the placeholder
      const templateContent = this.getMeetingTemplate(accountName, dateStr);
      
      // If there's content, append it after the template
      if (content.trim()) {
        const existingContent = content.trim();
        await this.app.vault.modify(file, templateContent + '\n\n' + existingContent);
      } else {
        await this.app.vault.modify(file, templateContent);
      }
    }
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
      let accounts: SalesforceAccount[];
      try {
        accounts = await this.fetchAccounts();
      } catch (fetchError) {
        const errorMsg = (fetchError as Error).message || 'Unknown error';
        
        // Provide specific, actionable error messages
        if (errorMsg.includes('Server unavailable') || errorMsg.includes('starting up')) {
          if (!silent) {
            new Notice('GTM Brain server is warming up. Please try again in 30 seconds.', 6000);
          }
          return;
        }
        
        if (errorMsg.includes('Salesforce is not connected')) {
          if (!silent) {
            new Notice('Salesforce connection pending. Your admin has been notified.', 5000);
          }
          return;
        }
        
        if (errorMsg.includes('No internet')) {
          if (!silent) {
            new Notice('No internet connection. Please check your network.', 4000);
          }
          return;
        }
        
        throw fetchError;
      }
      
      if (accounts.length === 0) {
        if (!silent) {
          new Notice('No accounts found. Check Salesforce or contact your admin.', 5000);
        }
        return;
      }

      // Cache accounts for autocomplete
      this.settings.cachedAccounts = accounts;
      
      // Populate account detector for auto-detection from meeting titles
      accountDetector.setAccounts(accounts.map(a => ({ id: a.id, name: a.name })));

      // Ensure base accounts folder exists
      await this.ensureFolderExists(this.settings.accountsFolder);

      // Get existing folders
      const existingFolders = this.getExistingAccountFolders();

      // Create missing folders (gracefully skip existing)
      let created = 0;
      let skipped = 0;
      for (const account of accounts) {
        const safeName = this.sanitizeFolderName(account.name);
        const folderPath = `${this.settings.accountsFolder}/${safeName}`;
        
        if (existingFolders.includes(safeName.toLowerCase())) {
          // Folder already exists - this is not an error
          skipped++;
          continue;
        }
        
        try {
          await this.ensureFolderExists(folderPath);
          created++;
        } catch (folderError) {
          // Log but don't fail the entire sync for one folder
          console.warn(`Could not create folder for ${account.name}:`, folderError);
        }
      }

      // Update last sync time
      this.settings.lastSyncTime = new Date().toISOString();
      await this.saveSettings();

      if (!silent) {
        if (created > 0) {
          new Notice(`✓ Sync complete! Created ${created} new account folders.`, 4000);
        } else if (skipped > 0) {
          new Notice(`✓ All ${accounts.length} accounts synced and ready.`, 3000);
        } else {
          new Notice(`✓ Sync complete. ${accounts.length} accounts available.`, 3000);
        }
      }

    } catch (error) {
      console.error('Eudia Sync error:', error);
      const errorMsg = (error as Error).message || 'Unknown error';
      
      if (!silent) {
        // Provide friendly, actionable error message
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
          new Notice('Could not reach server. Check your internet and try again.', 5000);
        } else {
          new Notice(`Sync issue: ${errorMsg}`, 5000);
        }
      }
    }
  }

  /**
   * Fetch accounts from GTM Brain API with graceful error handling
   */
  async fetchAccounts(): Promise<SalesforceAccount[]> {
    try {
      // First, check server health
      const health = await this.checkServerHealth();
      
      if (!health.healthy) {
        throw new Error(`Server unavailable. ${health.error || 'Please try again in a moment.'}`);
      }
      
      if (!health.salesforceConnected) {
        throw new Error('Salesforce is not connected. Please contact your administrator.');
      }

      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/accounts/obsidian`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      const data: AccountsResponse = response.json;
      
      if (!data.success) {
        // Provide specific error message based on error type
        const errorMsg = data.error || 'Unknown error';
        if (errorMsg.includes('localeCompare')) {
          // This was the null sorting bug - now fixed but handle gracefully
          throw new Error('Server error processing accounts. This has been reported.');
        }
        throw new Error(`Salesforce sync failed: ${errorMsg}`);
      }

      if (!data.accounts || data.accounts.length === 0) {
        console.warn('No accounts returned from Salesforce');
        return [];
      }

      return data.accounts;
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      
      // Provide user-friendly error messages
      const msg = (error as Error).message || '';
      
      if (msg.includes('net::ERR') || msg.includes('fetch') || msg.includes('network')) {
        throw new Error('No internet connection. Please check your network and try again.');
      }
      
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        throw new Error('Server took too long to respond. Please try again.');
      }
      
      if (msg.includes('401') || msg.includes('403')) {
        throw new Error('Authentication failed. Please check your API key in settings.');
      }
      
      // Re-throw with original message if already user-friendly
      if (msg.includes('Salesforce') || msg.includes('Server') || msg.includes('internet')) {
        throw error;
      }
      
      throw new Error('Could not sync Salesforce accounts. Please try again later.');
    }
  }

  /**
   * Check if GTM Brain server is healthy and Salesforce is connected
   * @returns {Promise<{healthy: boolean, salesforceConnected: boolean, error?: string}>}
   */
  async checkServerHealth(): Promise<{healthy: boolean, salesforceConnected: boolean, error?: string}> {
    try {
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/api/health`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        throw: false // Don't throw on error, handle gracefully
      });

      if (response.status !== 200) {
        return { healthy: false, salesforceConnected: false, error: `Server returned ${response.status}` };
      }

      const data = response.json;
      // Server returns status: "ok" or "degraded" - both are acceptable
      const isHealthy = data.status === 'ok' || data.status === 'degraded';
      return {
        healthy: isHealthy,
        salesforceConnected: data.checks?.salesforce?.status === 'ok',
        error: data.checks?.salesforce?.lastError || undefined
      };
    } catch (error) {
      return {
        healthy: false,
        salesforceConnected: false,
        error: error.message || 'Cannot connect to server'
      };
    }
  }

  /**
   * Get user-friendly error message for sync failures
   */
  getSyncErrorMessage(error: any, healthStatus: any): string {
    // Network/connection errors
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
      return 'Cannot connect to GTM Brain server. Is it running?';
    }
    if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
      return 'Connection timed out. Server may be starting up.';
    }
    if (error.message?.includes('CORS') || error.message?.includes('NetworkError')) {
      return 'Network error. Check your internet connection.';
    }

    // Server health issues
    if (healthStatus && !healthStatus.healthy) {
      return 'GTM Brain server is not responding. It may be restarting.';
    }
    if (healthStatus && !healthStatus.salesforceConnected) {
      return `Salesforce not connected: ${healthStatus.error || 'Check server configuration'}`;
    }

    // API errors
    if (error.status === 401 || error.status === 403) {
      return 'Authentication error. Check API credentials.';
    }
    if (error.status === 404) {
      return 'API endpoint not found. Server may need updating.';
    }
    if (error.status === 500) {
      return 'Server error. Check server logs for details.';
    }

    // Default message
    return error.message || 'Unknown error occurred';
  }

  /**
   * Sync the current note to Salesforce
   * Enhanced with health checks and better error handling
   */
  async syncNoteToSalesforce(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note to sync');
      return;
    }

    try {
      // Step 1: Check server health first
      const healthStatus = await this.checkServerHealth();
      
      if (!healthStatus.healthy) {
        new Notice(`Cannot sync: ${healthStatus.error || 'Server not available'}`, 8000);
        return;
      }
      
      if (!healthStatus.salesforceConnected) {
        new Notice(`Cannot sync: Salesforce not connected. ${healthStatus.error || 'Check server config.'}`, 8000);
        return;
      }

      const content = await this.app.vault.read(activeFile);
      const frontmatter = this.parseFrontmatter(content);
      
      // Step 2: Try to get account from frontmatter or folder path
      let account: SalesforceAccount | null = null;
      
      if (frontmatter.account) {
        account = this.settings.cachedAccounts.find(
          a => a.name.toLowerCase() === frontmatter.account.toLowerCase()
        ) || null;
      }
      
      if (!account) {
        account = this.detectAccountFromPath(activeFile.path);
      }

      // Step 3: If no cached accounts, try to fetch them first
      if (!account && this.settings.cachedAccounts.length === 0) {
        new Notice('Fetching accounts from Salesforce...', 3000);
        try {
          await this.syncAccounts();
          // Try detecting account again after refresh
          if (frontmatter.account) {
            account = this.settings.cachedAccounts.find(
              a => a.name.toLowerCase() === frontmatter.account.toLowerCase()
            ) || null;
          }
          if (!account) {
            account = this.detectAccountFromPath(activeFile.path);
          }
        } catch (fetchError) {
          console.warn('Failed to fetch accounts:', fetchError);
        }
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

      // Step 4: Post to GTM Brain API with retry logic
      let lastError: any = null;
      const maxRetries = 2;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
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
              syncedAt: new Date().toISOString(),
              userEmail: this.settings.userEmail || undefined  // For per-user OAuth attribution
            })
          });

          // Check if authentication is required
          if (response.json.authRequired && response.json.authUrl) {
            new Notice('Salesforce authentication required. Opening login...', 5000);
            window.open(`${this.settings.serverUrl}${response.json.authUrl}`, '_blank');
            return;
          }

          if (response.json.success) {
            const syncedBy = response.json.data?.salesforce?.usedUserToken 
              ? ` (as ${this.settings.userEmail})` 
              : '';
            new Notice(`✓ Note synced to Salesforce${syncedBy}`);
            
            // Update frontmatter to mark as synced
            await this.updateFrontmatter(activeFile, {
              synced_to_salesforce: true,
              last_synced: new Date().toISOString()
            });
            return; // Success, exit function
          } else {
            lastError = new Error(response.json.error || 'Unknown error');
            // Don't retry on API errors (not transient)
            break;
          }
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            // Wait before retry (exponential backoff)
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      // If we get here, all attempts failed
      const errorMessage = this.getSyncErrorMessage(lastError, healthStatus);
      new Notice(`Sync failed: ${errorMessage}`, 8000);
      console.error('Sync to Salesforce failed after retries:', lastError);

    } catch (error) {
      console.error('Sync to Salesforce failed:', error);
      const errorMessage = this.getSyncErrorMessage(error, null);
      new Notice(`Sync failed: ${errorMessage}`, 8000);
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

    // Check if email is configured - show inline setup if not
    if (!this.plugin.settings.userEmail) {
      this.renderCalendarSetup(container);
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
title: "${meeting.subject}"
date: ${dateStr}
attendees: [${attendees}]
account: "${meeting.accountName || ''}"
meeting_start: ${meeting.start}
meeting_type: discovery
deal_health: pending
sync_to_salesforce: false
transcribed: false
product_interest: []
meddicc_signals: []
---

# ${meeting.subject}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## 🎙️ Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` → **"Transcribe Meeting"**

After the meeting:
- AI will generate a structured summary
- MEDDICC signals will be auto-extracted
- Next steps will be formatted as checkboxes
- Full transcript will be available for reference

---

`;

    // Create file
    const file = await this.app.vault.create(filePath, template);
    
    // Open the file
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file);
    
    new Notice(`Created meeting note for ${meeting.subject}`);
  }

  /**
   * Render inline calendar setup form when email not configured
   * Provides a zero-friction setup experience
   */
  renderCalendarSetup(container: Element): void {
    const setupContainer = container.createDiv({ cls: 'eudia-calendar-setup' });
    
    // Header
    setupContainer.createEl('div', { 
      cls: 'eudia-calendar-setup-title',
      text: '📅 Connect Your Calendar'
    });
    
    setupContainer.createEl('p', { 
      cls: 'eudia-calendar-setup-desc',
      text: 'Enter your Eudia email to see your meetings'
    });
    
    // Email input container
    const inputContainer = setupContainer.createDiv({ cls: 'eudia-calendar-setup-input' });
    
    const emailInput = inputContainer.createEl('input', {
      type: 'email',
      placeholder: 'yourname@eudia.com'
    }) as HTMLInputElement;
    emailInput.addClass('eudia-calendar-email-input');
    
    const connectBtn = inputContainer.createEl('button', {
      text: 'Connect',
      cls: 'eudia-calendar-connect-btn'
    });
    
    // Status message area
    const statusEl = setupContainer.createDiv({ cls: 'eudia-calendar-setup-status' });
    
    // Connect button handler
    connectBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      
      // Validate email format
      if (!email || !email.includes('@')) {
        statusEl.textContent = '⚠️ Please enter a valid email address';
        statusEl.addClass('error');
        return;
      }
      
      // Must be @eudia.com email
      if (!email.endsWith('@eudia.com')) {
        statusEl.textContent = '⚠️ Please use your @eudia.com email address';
        statusEl.addClass('error');
        return;
      }
      
      // Show loading state
      connectBtn.disabled = true;
      connectBtn.textContent = 'Validating...';
      statusEl.textContent = '';
      statusEl.removeClass('error');
      
      try {
        // First validate email is authorized using new endpoint
        const serverUrl = this.plugin.settings.serverUrl || 'https://gtm-wizard.onrender.com';
        const validateResponse = await requestUrl({
          url: `${serverUrl}/api/calendar/validate/${email}`,
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        const validation = validateResponse.json;
        
        if (!validation.authorized) {
          // Show helpful error message
          statusEl.innerHTML = `⚠️ <strong>${email}</strong> is not in the authorized users list.<br>Please contact your administrator to be added.`;
          statusEl.addClass('error');
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          return;
        }
        
        // Email is authorized - save and test connection
        connectBtn.textContent = 'Connecting...';
        
        // Save email to settings
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        
        // Show success briefly then reload
        statusEl.textContent = '✓ Calendar connected!';
        statusEl.addClass('success');
        
        // Also sync Salesforce accounts in background
        this.plugin.syncAccounts(true).catch(e => {
          console.warn('Background account sync failed:', e);
        });
        
        // Re-render to show calendar
        setTimeout(() => this.render(), 500);
        
      } catch (error) {
        // Network or server error - provide helpful message
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('403') || errorMsg.includes('not authorized')) {
          statusEl.innerHTML = `⚠️ <strong>${email}</strong> is not authorized for calendar access.<br>Contact your admin to be added to the list.`;
        } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
          statusEl.textContent = '⚠️ Calendar service not available. Server may be starting up - try again in 30 seconds.';
        } else {
          statusEl.textContent = '⚠️ Could not connect to server. Check your internet and try again.';
        }
        statusEl.addClass('error');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
      }
    };
    
    // Allow Enter key to submit
    emailInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        connectBtn.click();
      }
    };
    
    // Help text
    setupContainer.createEl('p', {
      cls: 'eudia-calendar-setup-help',
      text: 'Your calendar syncs automatically via Microsoft 365 - no additional setup required.'
    });
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

    // Salesforce OAuth section
    containerEl.createEl('h3', { text: 'Salesforce Authentication' });
    
    const sfAuthContainer = containerEl.createDiv({ cls: 'sf-auth-container' });
    sfAuthContainer.style.cssText = 'padding: 12px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;';
    
    const sfAuthStatus = sfAuthContainer.createDiv({ cls: 'sf-auth-status' });
    sfAuthStatus.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';
    
    const statusIndicator = sfAuthStatus.createSpan();
    const statusText = sfAuthStatus.createSpan();
    
    const sfAuthDesc = sfAuthContainer.createDiv();
    sfAuthDesc.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 12px;';
    sfAuthDesc.setText('Connect with Salesforce to sync notes with your user attribution (shows your name as LastModifiedBy).');
    
    const sfAuthButton = sfAuthContainer.createEl('button');
    sfAuthButton.style.cssText = 'padding: 8px 16px; cursor: pointer;';
    
    // Check OAuth status
    const checkSfAuthStatus = async () => {
      if (!this.plugin.settings.userEmail) {
        statusIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);';
        statusText.setText('Enter your email above first');
        sfAuthButton.setText('Setup Required');
        sfAuthButton.disabled = true;
        return;
      }
      
      try {
        const response = await requestUrl({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: 'GET'
        });
        
        if (response.json.authenticated) {
          statusIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #22c55e;';
          statusText.setText(`Connected${response.json.expired ? ' (refreshing...)' : ''}`);
          sfAuthButton.setText('Reconnect');
          sfAuthButton.disabled = false;
        } else {
          statusIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;';
          statusText.setText('Not connected');
          sfAuthButton.setText('Connect to Salesforce');
          sfAuthButton.disabled = false;
        }
      } catch (error) {
        statusIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #ef4444;';
        statusText.setText('Unable to check status');
        sfAuthButton.setText('Connect to Salesforce');
        sfAuthButton.disabled = false;
      }
    };
    
    sfAuthButton.addEventListener('click', async () => {
      if (!this.plugin.settings.userEmail) {
        new Notice('Please enter your email address first');
        return;
      }
      
      const authUrl = `${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;
      window.open(authUrl, '_blank');
      
      new Notice('Opening Salesforce login... Complete the login and return here.', 5000);
      
      // Check status after a delay (user may take time to complete OAuth)
      setTimeout(async () => {
        await checkSfAuthStatus();
      }, 5000);
    });
    
    // Initial status check
    checkSfAuthStatus();

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

    // Transcription settings
    containerEl.createEl('h3', { text: 'Transcription' });

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
      text: `Audio transcription: ${isSupported ? '✓ Supported' : '✗ Not supported'}`,
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
