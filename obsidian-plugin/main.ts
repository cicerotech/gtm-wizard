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
  EditorPosition
} from 'obsidian';

interface EudiaSyncSettings {
  serverUrl: string;
  accountsFolder: string;
  syncOnStartup: boolean;
  lastSyncTime: string | null;
  cachedAccounts: SalesforceAccount[];
}

const DEFAULT_SETTINGS: EudiaSyncSettings = {
  serverUrl: 'https://gtm-brain.onrender.com',
  accountsFolder: 'Accounts',
  syncOnStartup: true,
  lastSyncTime: null,
  cachedAccounts: []
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
    const beforeCursor = content.substring(0, cursorOffset);
    
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

export default class EudiaSyncPlugin extends Plugin {
  settings: EudiaSyncSettings;
  accountSuggester: AccountSuggester;

  async onload() {
    await this.loadSettings();

    // Register account suggester for autocomplete
    this.accountSuggester = new AccountSuggester(this.app, this);
    this.registerEditorSuggest(this.accountSuggester);

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

    // Add command to sync current note to Salesforce
    this.addCommand({
      id: 'sync-note-to-salesforce',
      name: 'Sync Current Note to Salesforce',
      callback: async () => {
        await this.syncNoteToSalesforce();
      }
    });

    // Add command to create note from meeting prep
    this.addCommand({
      id: 'create-from-meeting-prep',
      name: 'Create Note from Meeting Prep',
      callback: async () => {
        await this.createFromMeetingPrep();
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
   * Reads frontmatter and posts to GTM Brain API
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
      
      if (!frontmatter.account) {
        new Notice('No account specified in note. Add an "account" property first.');
        return;
      }

      // Find account ID from cached accounts
      const account = this.settings.cachedAccounts.find(
        a => a.name.toLowerCase() === frontmatter.account.toLowerCase()
      );

      if (!account) {
        new Notice(`Account "${frontmatter.account}" not found in Salesforce`);
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
        new Notice('✓ Note synced to Salesforce');
        
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
   * Create a note from meeting prep data
   */
  async createFromMeetingPrep(): Promise<void> {
    try {
      // For now, just show a notice - full implementation would:
      // 1. Fetch upcoming meetings from calendar
      // 2. Let user select one
      // 3. Fetch meeting prep from GTM Brain
      // 4. Create note with pre-filled content
      new Notice('Meeting Prep integration coming soon. Use the Meeting Prep tab at gtm-brain.onrender.com for now.');
    } catch (error) {
      console.error('Create from meeting prep failed:', error);
      new Notice(`Failed: ${error.message}`);
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
   */
  async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
    let content = await this.app.vault.read(file);
    
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (frontmatterMatch) {
      let frontmatterContent = frontmatterMatch[1];
      
      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}:.*$`, 'm');
        const newLine = `${key}: ${value}`;
        
        if (regex.test(frontmatterContent)) {
          frontmatterContent = frontmatterContent.replace(regex, newLine);
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

    // Stats
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

    // Manual sync button
    new Setting(containerEl)
      .setName('Sync Now')
      .setDesc('Manually sync Salesforce accounts')
      .addButton(button => button
        .setButtonText('Sync Accounts')
        .setCta()
        .onClick(async () => {
          await this.plugin.syncAccounts();
          this.display(); // Refresh to show new count
        }));

    // Salesforce sync section
    containerEl.createEl('h3', { text: 'Salesforce Integration' });

    new Setting(containerEl)
      .setName('Sync Current Note')
      .setDesc('Push the current note\'s data to Salesforce')
      .addButton(button => button
        .setButtonText('Sync to Salesforce')
        .onClick(async () => {
          await this.plugin.syncNoteToSalesforce();
        }));
  }
}
