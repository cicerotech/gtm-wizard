import { App, Plugin, PluginSettingTab, Setting, Notice, TFolder, requestUrl } from 'obsidian';

interface EudiaSyncSettings {
  serverUrl: string;
  accountsFolder: string;
  syncOnStartup: boolean;
  lastSyncTime: string | null;
}

const DEFAULT_SETTINGS: EudiaSyncSettings = {
  serverUrl: 'https://gtm-brain.onrender.com',
  accountsFolder: 'Accounts',
  syncOnStartup: true,
  lastSyncTime: null
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

export default class EudiaSyncPlugin extends Plugin {
  settings: EudiaSyncSettings;

  async onload() {
    await this.loadSettings();

    // Add ribbon icon for manual sync
    this.addRibbonIcon('refresh-cw', 'Sync Salesforce Accounts', async () => {
      await this.syncAccounts();
    });

    // Add command for manual sync
    this.addCommand({
      id: 'sync-salesforce-accounts',
      name: 'Sync Salesforce Accounts',
      callback: async () => {
        await this.syncAccounts();
      }
    });

    // Add settings tab
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));

    // Sync on startup if enabled
    if (this.settings.syncOnStartup) {
      // Delay sync slightly to let vault fully load
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
  }

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
          new Notice(`Sync complete! Created ${created} new account folders`);
        } else {
          new Notice(`Sync complete. All ${accounts.length} accounts already have folders.`);
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
    // Remove characters not allowed in folder names
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
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

    containerEl.createEl('h2', { text: 'Eudia Sync Settings' });

    // Server URL
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

    // Accounts folder
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

    // Sync on startup
    new Setting(containerEl)
      .setName('Sync on Startup')
      .setDesc('Automatically sync accounts when Obsidian opens')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.syncOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.syncOnStartup = value;
          await this.plugin.saveSettings();
        }));

    // Last sync time
    if (this.plugin.settings.lastSyncTime) {
      const lastSync = new Date(this.plugin.settings.lastSyncTime);
      containerEl.createEl('p', { 
        text: `Last synced: ${lastSync.toLocaleString()}`,
        cls: 'setting-item-description'
      });
    }

    // Manual sync button
    new Setting(containerEl)
      .setName('Sync Now')
      .setDesc('Manually sync Salesforce accounts')
      .addButton(button => button
        .setButtonText('Sync Accounts')
        .setCta()
        .onClick(async () => {
          await this.plugin.syncAccounts();
        }));
  }
}

