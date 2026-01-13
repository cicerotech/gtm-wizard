/**
 * Eudia Meeting Sync - Electron Main Process
 * 
 * Native macOS menu bar app for syncing Hyprnote → Salesforce
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Paths
const isDev = !app.isPackaged;
const resourcesPath = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath);
const libPath = isDev ? path.join(__dirname, '..', 'lib') : path.join(resourcesPath, 'lib');
const dataPath = isDev ? path.join(__dirname, '..', 'data') : path.join(resourcesPath, 'data');

// Load our modules
const hyprnote = require(path.join(libPath, 'hyprnote'));
const teamRegistry = require(path.join(libPath, 'team-registry'));

let tray = null;
let mainWindow = null;
let configWindow = null;

// App state
let syncStatus = 'idle'; // 'idle', 'syncing', 'success', 'error'
let lastSyncTime = null;
let config = null;

/**
 * Load configuration
 */
function loadConfig() {
  const configPath = path.join(dataPath, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return true;
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return false;
}

/**
 * Save configuration
 */
function saveConfig(newConfig) {
  const configPath = path.join(dataPath, 'config.json');
  try {
    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    config = newConfig;
    return true;
  } catch (err) {
    console.error('Failed to save config:', err);
    return false;
  }
}

/**
 * Create the tray icon
 */
function createTray() {
  // Create tray icon (16x16 for menu bar)
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon;
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Fallback: create a simple icon programmatically
    icon = nativeImage.createEmpty();
  }
  
  tray = new Tray(icon);
  tray.setToolTip('Eudia Meeting Sync');
  
  updateTrayMenu();
}

/**
 * Update the tray menu based on current state
 */
function updateTrayMenu() {
  const isConfigured = config && config.rep && config.rep.salesforceUserId;
  
  let statusLabel = '⚪ Not configured';
  if (isConfigured) {
    switch (syncStatus) {
      case 'idle':
        statusLabel = '🟢 Ready to sync';
        break;
      case 'syncing':
        statusLabel = '🔄 Syncing...';
        break;
      case 'success':
        statusLabel = '✅ Last sync successful';
        break;
      case 'error':
        statusLabel = '🔴 Sync error';
        break;
    }
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Eudia Meeting Sync', enabled: false },
    { type: 'separator' },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: '🔄 Sync Now',
      enabled: isConfigured && syncStatus !== 'syncing',
      click: () => runSync()
    },
    { type: 'separator' },
    {
      label: '⚙️ Configure',
      click: () => openConfigWindow()
    },
    {
      label: '📊 View Status',
      click: () => openMainWindow()
    },
    { type: 'separator' },
    {
      label: isConfigured ? `Logged in as: ${config.rep.name}` : 'Not logged in',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '❓ Help',
      click: () => shell.openExternal('https://github.com/cicerotech/gtm-wizard/blob/main/hyprnote-sync/ONBOARDING.md')
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

/**
 * Open the main status window
 */
function openMainWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }
  
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    title: 'Eudia Meeting Sync',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Open the configuration window
 */
function openConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  
  configWindow = new BrowserWindow({
    width: 450,
    height: 500,
    resizable: false,
    title: 'Configure',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  configWindow.loadFile(path.join(__dirname, 'renderer', 'config.html'));
  
  configWindow.on('closed', () => {
    configWindow = null;
    updateTrayMenu();
  });
}

/**
 * Run sync process
 */
async function runSync() {
  if (syncStatus === 'syncing') return;
  
  syncStatus = 'syncing';
  updateTrayMenu();
  
  try {
    // Import sync module
    const syncModule = require(path.join(libPath, '..', 'sync'));
    
    // This would be async sync logic
    // For now, just simulate
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    syncStatus = 'success';
    lastSyncTime = new Date();
  } catch (err) {
    console.error('Sync failed:', err);
    syncStatus = 'error';
  }
  
  updateTrayMenu();
}

// IPC Handlers
ipcMain.handle('get-config', () => config);
ipcMain.handle('save-config', (event, newConfig) => saveConfig(newConfig));
ipcMain.handle('get-team-members', () => teamRegistry.getAllMembers());
ipcMain.handle('check-hyprnote', async () => hyprnote.testConnection());
ipcMain.handle('run-sync', () => runSync());
ipcMain.handle('get-status', () => ({
  syncStatus,
  lastSyncTime,
  isConfigured: !!(config && config.rep)
}));

// App lifecycle
app.whenReady().then(() => {
  // Load config first
  loadConfig();
  
  // Create tray
  createTray();
  
  // Don't show dock icon (menu bar app only)
  app.dock.hide();
  
  // Open config window if not configured
  if (!config || !config.rep) {
    openConfigWindow();
  }
});

app.on('window-all-closed', () => {
  // Don't quit when windows are closed (menu bar app)
});

app.on('activate', () => {
  if (mainWindow === null) {
    openMainWindow();
  }
});

