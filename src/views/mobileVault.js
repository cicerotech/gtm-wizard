/**
 * Eudia Sales Vault - Mobile PWA View
 * Progressive Web App interface for mobile access to the Sales Vault
 * Syncs with Salesforce Customer_Brain__c field via existing backend
 */

/**
 * Generate the mobile vault HTML
 * @param {object} options - Configuration options
 * @param {string} options.userEmail - Authenticated user email
 * @param {string} options.userName - Display name
 * @param {boolean} options.sfAuthenticated - Whether user has SF OAuth
 * @param {string} options.tab - Initial tab to show (accounts|calendar|record)
 * @param {string} options.action - Action to perform (record)
 */
function generateMobileVault(options = {}) {
  const { 
    userEmail = '', 
    userName = 'User', 
    sfAuthenticated = false,
    tab = 'accounts',
    action = null
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#7c3aed">
  <title>Sales Vault</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/logo">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="/mobile-recorder.js"></script>
  <script src="/offline-storage.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    
    :root {
      --primary: #7c3aed;
      --primary-light: #a78bfa;
      --primary-dark: #5b21b6;
      --bg: #f5f7fe;
      --card-bg: #ffffff;
      --text: #1f2937;
      --text-secondary: #6b7280;
      --border: #e5e7eb;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --safe-area-bottom: env(safe-area-inset-bottom, 20px);
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    
    /* Header */
    .header {
      background: var(--primary);
      color: white;
      padding: 12px 16px;
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header img {
      height: 32px;
      width: auto;
      border-radius: 4px;
    }
    
    .header h1 {
      font-size: 1.1rem;
      font-weight: 600;
    }
    
    .header-user {
      font-size: 0.75rem;
      opacity: 0.9;
    }
    
    .sync-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.7rem;
      opacity: 0.8;
    }
    
    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
    }
    
    .sync-dot.offline { background: var(--warning); }
    .sync-dot.error { background: var(--error); }
    
    /* Main Content */
    .main-content {
      flex: 1;
      padding: 16px;
      padding-bottom: calc(80px + var(--safe-area-bottom));
      overflow-y: auto;
    }
    
    /* Search Bar */
    .search-container {
      position: relative;
      margin-bottom: 16px;
    }
    
    .search-input {
      width: 100%;
      padding: 12px 16px 12px 44px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 1rem;
      background: var(--card-bg);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    .search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
    }
    
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
    }
    
    /* Account Cards */
    .account-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .account-card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    
    .account-card:active {
      transform: scale(0.98);
    }
    
    .account-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    
    .account-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text);
    }
    
    .account-stage {
      font-size: 0.7rem;
      padding: 4px 8px;
      border-radius: 12px;
      background: rgba(124, 58, 237, 0.1);
      color: var(--primary);
      font-weight: 500;
    }
    
    .account-meta {
      font-size: 0.8rem;
      color: var(--text-secondary);
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    /* Calendar View */
    .calendar-section {
      margin-bottom: 24px;
    }
    
    .section-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .meeting-card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border-left: 4px solid var(--primary);
    }
    
    .meeting-time {
      font-size: 0.8rem;
      color: var(--primary);
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .meeting-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .meeting-attendees {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    /* Recording UI */
    .recording-container {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 200;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .recording-container.active {
      display: flex;
    }
    
    .recording-timer {
      font-size: 3rem;
      font-weight: 700;
      color: white;
      font-variant-numeric: tabular-nums;
      margin-bottom: 20px;
    }
    
    .recording-waveform {
      width: 80%;
      height: 60px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    
    .waveform-bar {
      width: 4px;
      background: var(--primary-light);
      border-radius: 2px;
      animation: waveform 0.8s ease-in-out infinite;
    }
    
    @keyframes waveform {
      0%, 100% { height: 10px; }
      50% { height: 40px; }
    }
    
    .recording-controls {
      display: flex;
      gap: 20px;
    }
    
    .record-btn {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: none;
      background: var(--error);
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
      transition: transform 0.15s;
    }
    
    .record-btn:active {
      transform: scale(0.95);
    }
    
    .record-btn.recording {
      animation: pulse-record 1.5s infinite;
    }
    
    @keyframes pulse-record {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
    }
    
    .stop-btn, .query-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px solid white;
      background: transparent;
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
    }
    
    .live-transcript {
      position: absolute;
      bottom: 120px;
      left: 20px;
      right: 20px;
      max-height: 200px;
      overflow-y: auto;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      color: white;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    
    /* Note Editor */
    .note-editor {
      display: none;
      position: fixed;
      inset: 0;
      background: var(--bg);
      z-index: 150;
      flex-direction: column;
    }
    
    .note-editor.active {
      display: flex;
    }
    
    .note-header {
      background: var(--card-bg);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }
    
    .note-back {
      background: none;
      border: none;
      font-size: 1rem;
      color: var(--primary);
      cursor: pointer;
      padding: 8px;
    }
    
    .note-title-input {
      flex: 1;
      text-align: center;
      font-weight: 600;
      border: none;
      background: transparent;
      font-size: 1rem;
      outline: none;
    }
    
    .note-save {
      background: var(--primary);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .note-save:disabled {
      opacity: 0.5;
    }
    
    .note-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }
    
    .note-textarea {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      font-family: 'SF Mono', 'Menlo', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      resize: none;
      outline: none;
    }
    
    .note-sync-status {
      padding: 8px 16px;
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    /* Bottom Navigation */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-around;
      padding: 8px 0;
      padding-bottom: calc(8px + var(--safe-area-bottom));
      z-index: 100;
    }
    
    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.7rem;
      cursor: pointer;
      border: none;
      background: none;
      transition: color 0.2s;
    }
    
    .nav-item.active {
      color: var(--primary);
    }
    
    .nav-icon {
      font-size: 1.4rem;
    }
    
    .nav-record {
      background: var(--primary);
      color: white !important;
      border-radius: 50%;
      width: 56px;
      height: 56px;
      margin-top: -20px;
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    }
    
    .nav-record .nav-icon {
      font-size: 1.6rem;
    }
    
    .nav-record span:last-child {
      display: none;
    }
    
    /* Auth Required Modal */
    .auth-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 300;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .auth-modal.active {
      display: flex;
    }
    
    .auth-modal-content {
      background: var(--card-bg);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      text-align: center;
    }
    
    .auth-modal h2 {
      margin-bottom: 12px;
    }
    
    .auth-modal p {
      color: var(--text-secondary);
      margin-bottom: 20px;
    }
    
    .auth-btn {
      background: var(--primary);
      color: white;
      border: none;
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
    }
    
    /* Loading States */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: var(--text-secondary);
    }
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 12px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Empty States */
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }
    
    .empty-state-icon {
      font-size: 3rem;
      margin-bottom: 12px;
      opacity: 0.5;
    }
    
    /* Live Query Modal */
    .query-modal {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--card-bg);
      border-radius: 20px 20px 0 0;
      padding: 20px;
      padding-bottom: calc(20px + var(--safe-area-bottom));
      z-index: 250;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
    }
    
    .query-modal.active {
      display: block;
    }
    
    .query-input-container {
      display: flex;
      gap: 8px;
    }
    
    .query-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 24px;
      font-size: 1rem;
      outline: none;
    }
    
    .query-send {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      border: none;
      font-size: 1.2rem;
      cursor: pointer;
    }
    
    .query-response {
      margin-top: 16px;
      padding: 16px;
      background: var(--bg);
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
    }
    
    /* Install Banner */
    .install-banner {
      display: none;
      background: var(--primary);
      color: white;
      padding: 12px 16px;
      align-items: center;
      justify-content: space-between;
    }
    
    .install-banner.show {
      display: flex;
    }
    
    .install-banner button {
      background: white;
      color: var(--primary);
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    
    .install-banner .dismiss {
      background: transparent;
      color: white;
      padding: 8px;
      font-size: 1.2rem;
    }
  </style>
</head>
<body>
  <!-- Install Banner -->
  <div class="install-banner" id="installBanner">
    <span>Install Sales Vault for quick access</span>
    <div>
      <button onclick="installPWA()">Install</button>
      <button class="dismiss" onclick="dismissInstall()">×</button>
    </div>
  </div>

  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <img src="/logo" alt="Eudia">
      <div>
        <h1>Sales Vault</h1>
        <div class="header-user">${userName}</div>
      </div>
    </div>
    <div class="sync-status">
      <div class="sync-dot" id="syncDot"></div>
      <span id="syncText">Synced</span>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main-content" id="mainContent">
    <!-- Accounts Tab -->
    <div class="tab-content" id="accountsTab">
      <div class="search-container">
        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input type="text" class="search-input" id="searchInput" placeholder="Search accounts...">
      </div>
      <div class="account-list" id="accountList">
        <div class="loading">
          <div class="spinner"></div>
          Loading accounts...
        </div>
      </div>
    </div>

    <!-- Calendar Tab -->
    <div class="tab-content" id="calendarTab" style="display: none;">
      <div class="calendar-section">
        <div class="section-title">Today's Meetings</div>
        <div id="todayMeetings">
          <div class="loading">
            <div class="spinner"></div>
            Loading calendar...
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Bottom Navigation -->
  <nav class="bottom-nav">
    <button class="nav-item active" data-tab="accounts" onclick="switchTab('accounts')">
      <span class="nav-icon">📋</span>
      <span>Accounts</span>
    </button>
    <button class="nav-item" data-tab="calendar" onclick="switchTab('calendar')">
      <span class="nav-icon">📅</span>
      <span>Calendar</span>
    </button>
    <button class="nav-item nav-record" onclick="startRecording()">
      <span class="nav-icon">🎙️</span>
      <span>Record</span>
    </button>
    <button class="nav-item" onclick="askIntelligence()">
      <span class="nav-icon">🧠</span>
      <span>Ask AI</span>
    </button>
    <button class="nav-item" onclick="showSettings()">
      <span class="nav-icon">⚙️</span>
      <span>Settings</span>
    </button>
  </nav>

  <!-- Recording UI -->
  <div class="recording-container" id="recordingContainer">
    <div class="recording-timer" id="recordingTimer">00:00</div>
    <div class="recording-waveform" id="waveform"></div>
    <div class="recording-controls">
      <button class="query-btn" onclick="openQueryModal()">💬</button>
      <button class="record-btn recording" id="stopBtn" onclick="stopRecording()">⏹️</button>
      <button class="stop-btn" onclick="cancelRecording()">✕</button>
    </div>
    <div class="live-transcript" id="liveTranscript"></div>
  </div>

  <!-- Note Editor -->
  <div class="note-editor" id="noteEditor">
    <div class="note-header">
      <button class="note-back" onclick="closeNoteEditor()">← Back</button>
      <input type="text" class="note-title-input" id="noteTitleInput" placeholder="Note title">
      <button class="note-save" id="noteSaveBtn" onclick="saveNote()">Save</button>
    </div>
    <div class="note-content">
      <textarea class="note-textarea" id="noteTextarea" placeholder="Start typing your notes..."></textarea>
    </div>
    <div class="note-sync-status" id="noteSyncStatus">
      <div class="sync-dot"></div>
      <span>All changes saved</span>
    </div>
  </div>

  <!-- Query Modal -->
  <div class="query-modal" id="queryModal">
    <div class="query-input-container">
      <input type="text" class="query-input" id="queryInput" placeholder="Ask about the conversation...">
      <button class="query-send" onclick="sendQuery()">→</button>
    </div>
    <div class="query-response" id="queryResponse" style="display: none;"></div>
  </div>

  <!-- Auth Modal -->
  <div class="auth-modal" id="authModal">
    <div class="auth-modal-content">
      <h2>Connect to Salesforce</h2>
      <p>To sync your notes and access account data, please connect your Salesforce account.</p>
      <a href="/api/sf/auth/start?email=${encodeURIComponent(userEmail)}&redirect=/mobile" class="auth-btn">Connect Salesforce</a>
    </div>
  </div>

  <script>
    // ═══════════════════════════════════════════════════════════════════════
    // STATE & CONFIG
    // ═══════════════════════════════════════════════════════════════════════
    const userEmail = '${userEmail}';
    const userName = '${userName}';
    const sfAuthenticated = ${sfAuthenticated};
    const initialTab = '${tab}';
    const initialAction = ${action ? `'${action}'` : 'null'};
    
    let accounts = [];
    let currentAccount = null;
    let isRecording = false;
    let recordingStartTime = null;
    let recorder = null; // MobileAudioRecorder instance
    let liveTranscript = '';
    let transcriptionInterval = null;
    
    // ═══════════════════════════════════════════════════════════════════════
    // SERVICE WORKER REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.error('SW registration failed:', err));
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PWA INSTALL PROMPT
    // ═══════════════════════════════════════════════════════════════════════
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!localStorage.getItem('pwa-install-dismissed')) {
        document.getElementById('installBanner').classList.add('show');
      }
    });
    
    function installPWA() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(result => {
          deferredPrompt = null;
          document.getElementById('installBanner').classList.remove('show');
        });
      }
    }
    
    function dismissInstall() {
      localStorage.setItem('pwa-install-dismissed', 'true');
      document.getElementById('installBanner').classList.remove('show');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', async () => {
      // Initialize offline storage
      try {
        await offlineStorage.init();
        console.log('[MobileVault] Offline storage initialized');
      } catch (e) {
        console.warn('[MobileVault] Offline storage init failed:', e);
      }
      
      // Check SF auth
      if (!sfAuthenticated) {
        document.getElementById('authModal').classList.add('active');
      }
      
      // Load data
      await loadAccounts();
      await loadCalendar();
      
      // Setup search
      document.getElementById('searchInput').addEventListener('input', filterAccounts);
      
      // Switch to initial tab
      if (initialTab !== 'accounts') {
        switchTab(initialTab);
      }
      
      // Handle initial action
      if (initialAction === 'record') {
        startRecording();
      }
      
      // Setup online/offline detection
      updateOnlineStatus();
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    });
    
    function handleOnline() {
      updateOnlineStatus();
      // Try to sync pending items when back online
      syncPendingItems();
    }
    
    function handleOffline() {
      updateOnlineStatus();
    }
    
    async function syncPendingItems() {
      try {
        const count = await offlineStorage.processSyncQueue();
        if (count > 0) {
          console.log('[MobileVault] Synced ' + count + ' pending items');
        }
      } catch (e) {
        console.warn('[MobileVault] Sync failed:', e);
      }
    }
    
    function updateOnlineStatus() {
      const dot = document.getElementById('syncDot');
      const text = document.getElementById('syncText');
      if (navigator.onLine) {
        dot.className = 'sync-dot';
        text.textContent = 'Synced';
      } else {
        dot.className = 'sync-dot offline';
        text.textContent = 'Offline';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // TAB NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════
    function switchTab(tabName) {
      // Update nav buttons
      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      
      // Show/hide tabs
      document.getElementById('accountsTab').style.display = tabName === 'accounts' ? 'block' : 'none';
      document.getElementById('calendarTab').style.display = tabName === 'calendar' ? 'block' : 'none';
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ACCOUNT LOADING & DISPLAY
    // ═══════════════════════════════════════════════════════════════════════
    async function loadAccounts() {
      try {
        // First, try to load from cache for instant display
        const cachedAccounts = await offlineStorage.getCachedAccounts();
        if (cachedAccounts && cachedAccounts.length > 0) {
          accounts = cachedAccounts;
          renderAccounts(accounts);
          console.log('[MobileVault] Loaded ' + accounts.length + ' accounts from cache');
        }
        
        // Then fetch fresh data if online
        if (navigator.onLine) {
          const response = await fetch('/api/accounts/obsidian?email=' + encodeURIComponent(userEmail));
          const data = await response.json();
          
          if (data.success && data.accounts) {
            accounts = data.accounts;
            renderAccounts(accounts);
            
            // Update cache
            await offlineStorage.cacheAccounts(accounts);
            console.log('[MobileVault] Updated cache with ' + accounts.length + ' accounts');
          }
        } else if (!cachedAccounts || cachedAccounts.length === 0) {
          showAccountsError('You are offline. No cached accounts available.');
        }
      } catch (error) {
        console.error('Error loading accounts:', error);
        
        // Try to load from cache if fetch failed
        if (!accounts || accounts.length === 0) {
          try {
            const cached = await offlineStorage.getCachedAccounts();
            if (cached && cached.length > 0) {
              accounts = cached;
              renderAccounts(accounts);
            } else {
              showAccountsError('Failed to load accounts');
            }
          } catch (cacheError) {
            showAccountsError('Failed to load accounts');
          }
        }
      }
    }
    
    function renderAccounts(accountList) {
      const container = document.getElementById('accountList');
      
      if (accountList.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <p>No accounts found</p>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = accountList.map(acc => \`
        <div class="account-card" onclick="openAccount('\${acc.id}')">
          <div class="account-card-header">
            <div class="account-name">\${escapeHtml(acc.name)}</div>
            \${acc.stage ? \`<div class="account-stage">\${escapeHtml(acc.stage)}</div>\` : ''}
          </div>
          <div class="account-meta">
            \${acc.owner ? \`<span>👤 \${escapeHtml(acc.owner)}</span>\` : ''}
            \${acc.lastActivity ? \`<span>📅 \${formatDate(acc.lastActivity)}</span>\` : ''}
          </div>
        </div>
      \`).join('');
    }
    
    function filterAccounts() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const filtered = accounts.filter(acc => 
        acc.name.toLowerCase().includes(query) ||
        (acc.owner && acc.owner.toLowerCase().includes(query))
      );
      renderAccounts(filtered);
    }
    
    function showAccountsError(message) {
      document.getElementById('accountList').innerHTML = \`
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <p>\${message}</p>
        </div>
      \`;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CALENDAR
    // ═══════════════════════════════════════════════════════════════════════
    async function loadCalendar() {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(\`/api/calendar/\${encodeURIComponent(userEmail)}/today?timezone=\${encodeURIComponent(tz)}\`);
        const data = await response.json();
        
        if (data.success && data.events) {
          renderMeetings(data.events);
        }
      } catch (error) {
        console.error('Error loading calendar:', error);
        document.getElementById('todayMeetings').innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <p>Unable to load calendar</p>
          </div>
        \`;
      }
    }
    
    function renderMeetings(events) {
      const container = document.getElementById('todayMeetings');
      
      if (events.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">✨</div>
            <p>No meetings today</p>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = events.map(evt => \`
        <div class="meeting-card" onclick="prepMeeting('\${evt.eventId}')">
          <div class="meeting-time">\${formatTime(evt.startDateTime)} - \${formatTime(evt.endDateTime)}</div>
          <div class="meeting-title">\${escapeHtml(evt.subject)}</div>
          <div class="meeting-attendees">
            \${(evt.externalAttendees || []).slice(0, 3).map(a => a.name || a.email).join(', ')}
            \${evt.externalAttendees?.length > 3 ? ' +' + (evt.externalAttendees.length - 3) + ' more' : ''}
          </div>
        </div>
      \`).join('');
    }
    
    function prepMeeting(eventId) {
      // Open meeting prep for this event
      alert('Meeting prep coming soon!');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // RECORDING
    // ═══════════════════════════════════════════════════════════════════════
    async function startRecording() {
      try {
        // Check if recording is supported
        if (!MobileAudioRecorder.isSupported()) {
          alert('Audio recording is not supported on this device.');
          return;
        }
        
        // Show mobile-specific instructions if applicable
        const instructions = MobileAudioRecorder.getMobileInstructions();
        if (instructions) {
          console.log('[Recording]', instructions);
        }
        
        // Initialize the recorder
        recorder = new MobileAudioRecorder();
        liveTranscript = '';
        
        // Set up state change callback
        recorder.onStateChange((state) => {
          if (state.isRecording) {
            document.getElementById('recordingTimer').textContent = 
              MobileAudioRecorder.formatDuration(state.duration);
          }
        });
        
        // Start recording
        await recorder.startRecording();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Show recording UI
        document.getElementById('recordingContainer').classList.add('active');
        
        // Start waveform animation
        createWaveform();
        
        // Start live transcription
        startLiveTranscription();
        
      } catch (error) {
        console.error('Error starting recording:', error);
        alert('Unable to access microphone. ' + (error.message || 'Please check permissions.'));
      }
    }
    
    function createWaveform() {
      const container = document.getElementById('waveform');
      container.innerHTML = '';
      for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.animationDelay = (i * 0.05) + 's';
        container.appendChild(bar);
      }
    }
    
    async function startLiveTranscription() {
      transcriptionInterval = setInterval(async () => {
        if (!isRecording || !recorder) return;
        
        try {
          // Get new chunks since last extraction
          const newChunks = recorder.extractNewChunks();
          if (!newChunks) return;
          
          const base64 = await MobileAudioRecorder.blobToBase64(newChunks);
          
          const response = await fetch('/api/transcribe-chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64,
              mimeType: recorder.getMimeType()
            })
          });
          
          const data = await response.json();
          if (data.success && data.text) {
            liveTranscript += ' ' + data.text;
            document.getElementById('liveTranscript').textContent = liveTranscript.trim();
          }
        } catch (error) {
          console.error('Live transcription error:', error);
        }
      }, 15000); // Transcribe every 15 seconds for mobile (less frequent to save battery)
    }
    
    async function stopRecording() {
      if (!isRecording || !recorder) return;
      
      isRecording = false;
      clearInterval(transcriptionInterval);
      
      document.getElementById('recordingContainer').classList.remove('active');
      
      try {
        // Stop and get the recording
        const result = await recorder.stopRecording();
        
        // Check audio diagnostic
        const diagnostic = recorder.getAudioDiagnostic();
        if (diagnostic.warning) {
          console.warn('[Recording]', diagnostic.warning);
        }
        
        // Process the recording
        await processRecording(result.audioBlob);
      } catch (error) {
        console.error('Error stopping recording:', error);
        alert('Error processing recording: ' + error.message);
      }
      
      recorder = null;
    }
    
    function cancelRecording() {
      if (!isRecording) return;
      
      isRecording = false;
      clearInterval(transcriptionInterval);
      
      if (recorder) {
        recorder.cancelRecording();
        recorder = null;
      }
      
      document.getElementById('recordingContainer').classList.remove('active');
    }
    
    async function processRecording(audioBlob) {
      // Show loading state
      const loadingEl = document.createElement('div');
      loadingEl.className = 'loading';
      loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:500;';
      loadingEl.innerHTML = '<div class="spinner"></div>Processing recording...';
      document.body.appendChild(loadingEl);
      
      try {
        // Convert to base64 using our helper
        const base64 = await MobileAudioRecorder.blobToBase64(audioBlob);
        
        // Determine MIME type
        const mimeType = audioBlob.type || 'audio/webm';
        
        // Send for transcription
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: base64,
            mimeType: mimeType
          })
        });
        
        const data = await response.json();
        
        if (data.success && data.text) {
          // Combine with any live transcript we captured
          const fullText = (liveTranscript + ' ' + data.text).trim();
          // Open note editor with transcription
          openNoteEditor(fullText || data.text);
        } else {
          throw new Error(data.error || 'Transcription failed');
        }
        
      } catch (error) {
        console.error('Error processing recording:', error);
        
        // If we have live transcript, use that
        if (liveTranscript.trim()) {
          alert('Full transcription failed, but we captured some text during the call.');
          openNoteEditor(liveTranscript.trim());
        } else {
          alert('Failed to process recording: ' + error.message);
        }
      } finally {
        loadingEl.remove();
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // NOTE EDITOR
    // ═══════════════════════════════════════════════════════════════════════
    function openAccount(accountId) {
      currentAccount = accounts.find(a => a.id === accountId);
      if (!currentAccount) return;
      
      document.getElementById('noteTitleInput').value = currentAccount.name;
      document.getElementById('noteTextarea').value = currentAccount.notes || '';
      document.getElementById('noteEditor').classList.add('active');
    }
    
    function openNoteEditor(content = '') {
      document.getElementById('noteTitleInput').value = new Date().toLocaleDateString() + ' Meeting Notes';
      document.getElementById('noteTextarea').value = content;
      document.getElementById('noteEditor').classList.add('active');
    }
    
    function closeNoteEditor() {
      document.getElementById('noteEditor').classList.remove('active');
      currentAccount = null;
    }
    
    async function saveNote() {
      const title = document.getElementById('noteTitleInput').value;
      const content = document.getElementById('noteTextarea').value;
      const saveBtn = document.getElementById('noteSaveBtn');
      const syncStatus = document.getElementById('noteSyncStatus');
      
      saveBtn.disabled = true;
      syncStatus.innerHTML = '<div class="spinner" style="width:12px;height:12px;"></div><span>Saving...</span>';
      
      const noteData = {
        accountId: currentAccount?.id,
        accountName: currentAccount?.name || title,
        noteTitle: title,
        content: content,
        notePath: 'mobile/' + title.replace(/[^a-zA-Z0-9]/g, '_') + '.md'
      };
      
      // Always cache locally first
      try {
        await offlineStorage.cacheNote(
          noteData.accountId || 'draft-' + Date.now(),
          noteData.accountName,
          content,
          { noteTitle: title }
        );
      } catch (cacheError) {
        console.warn('Failed to cache note locally:', cacheError);
      }
      
      // If offline, queue for sync
      if (!navigator.onLine) {
        try {
          await offlineStorage.queueForSync('note-update', noteData, userEmail);
          syncStatus.innerHTML = '<div class="sync-dot offline"></div><span>Saved offline - will sync when connected</span>';
        } catch (queueError) {
          syncStatus.innerHTML = '<div class="sync-dot error"></div><span>Failed to save</span>';
        }
        saveBtn.disabled = false;
        return;
      }
      
      // Try to sync immediately
      try {
        const response = await fetch('/api/notes/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': userEmail
          },
          body: JSON.stringify(noteData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          syncStatus.innerHTML = '<div class="sync-dot"></div><span>Saved to Salesforce</span>';
        } else {
          throw new Error(data.error || 'Failed to save');
        }
      } catch (error) {
        console.error('Error saving note:', error);
        
        // Queue for background sync
        try {
          await offlineStorage.queueForSync('note-update', noteData, userEmail);
          syncStatus.innerHTML = '<div class="sync-dot offline"></div><span>Queued for sync</span>';
        } catch (queueError) {
          syncStatus.innerHTML = '<div class="sync-dot error"></div><span>Save failed</span>';
        }
      } finally {
        saveBtn.disabled = false;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // LIVE QUERY
    // ═══════════════════════════════════════════════════════════════════════
    function openQueryModal() {
      document.getElementById('queryModal').classList.add('active');
      document.getElementById('queryInput').focus();
    }
    
    async function sendQuery() {
      const input = document.getElementById('queryInput');
      const response = document.getElementById('queryResponse');
      const question = input.value.trim();
      
      if (!question || !liveTranscript) return;
      
      response.style.display = 'block';
      response.textContent = 'Thinking...';
      
      try {
        const res = await fetch('/api/live-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question,
            transcript: liveTranscript
          })
        });
        
        const data = await res.json();
        response.textContent = data.answer || 'No answer found';
      } catch (error) {
        response.textContent = 'Error getting answer. Please try again.';
      }
      
      input.value = '';
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // AI INTELLIGENCE
    // ═══════════════════════════════════════════════════════════════════════
    function askIntelligence() {
      const question = prompt('Ask about any account:');
      if (!question) return;
      
      // Simple intelligence query
      fetch('/api/intelligence/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        body: JSON.stringify({ query: question, userEmail: userEmail })
      })
      .then(res => res.json())
      .then(data => {
        alert(data.answer || data.error || 'No answer');
      })
      .catch(err => {
        alert('Error: ' + err.message);
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════════════════════
    function showSettings() {
      const confirmed = confirm('Sign out of Sales Vault?');
      if (confirmed) {
        // Clear local storage and redirect
        localStorage.clear();
        window.location.href = '/mobile/logout';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
    }
    
    function formatDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    function formatTime(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    
    // Handle back button for modals
    window.addEventListener('popstate', () => {
      if (document.getElementById('noteEditor').classList.contains('active')) {
        closeNoteEditor();
      }
      if (document.getElementById('queryModal').classList.contains('active')) {
        document.getElementById('queryModal').classList.remove('active');
      }
    });
    
    // Query modal keyboard handling
    document.getElementById('queryInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendQuery();
    });
  </script>
</body>
</html>`;
}

module.exports = { generateMobileVault };
