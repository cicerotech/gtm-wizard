import { App, PluginSettingTab, Setting } from 'obsidian';
import type EudiaCalendarPlugin from '../main';

export interface EudiaCalendarSettings {
  // ICS feed URL (from Microsoft 365 or Google)
  icsUrl: string;
  
  // How often to refresh (in minutes)
  refreshInterval: number;
  
  // Default view: Today, This Week, or Upcoming
  defaultView: string;
  
  // Folder for meeting notes
  notesFolder: string;
  
  // Note template
  noteTemplate: string;
  
  // Show cancelled events
  showCancelled: boolean;
  
  // Auto-create notes for upcoming meetings (X minutes before)
  autoCreateNotes: boolean;
  autoCreateMinutesBefore: number;
}

export const DEFAULT_SETTINGS: EudiaCalendarSettings = {
  icsUrl: '',
  refreshInterval: 5,
  defaultView: 'Today',
  notesFolder: 'Meetings',
  noteTemplate: `---
meeting_date: {{date}}
meeting_time: {{time}}
attendees: {{attendees}}
location: {{location}}
synced_to_salesforce: false
---

# {{title}}

## Attendees
{{attendee_list}}

## Notes


## Action Items
- [ ] 

## Next Steps
- [ ] 
`,
  showCancelled: false,
  autoCreateNotes: false,
  autoCreateMinutesBefore: 5
};

export class EudiaCalendarSettingTab extends PluginSettingTab {
  plugin: EudiaCalendarPlugin;

  constructor(app: App, plugin: EudiaCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Eudia Calendar Settings' });

    // ICS URL
    new Setting(containerEl)
      .setName('Calendar ICS URL')
      .setDesc('Your calendar\'s ICS/iCal URL. Get this from Microsoft 365 or Google Calendar.')
      .addText(text => text
        .setPlaceholder('https://outlook.office365.com/owa/calendar/...')
        .setValue(this.plugin.settings.icsUrl)
        .onChange(async (value) => {
          this.plugin.settings.icsUrl = value;
          await this.plugin.saveSettings();
        }));

    // Help text for getting ICS URL
    const helpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
    helpDiv.style.marginTop = '-10px';
    helpDiv.style.marginBottom = '15px';
    helpDiv.innerHTML = `
      <details>
        <summary>How to get your ICS URL</summary>
        <p><strong>Microsoft 365:</strong></p>
        <ol>
          <li>Go to <a href="https://outlook.office365.com/calendar">Outlook Calendar</a></li>
          <li>Settings (gear icon) → View all Outlook settings</li>
          <li>Calendar → Shared calendars</li>
          <li>Under "Publish a calendar", select your calendar</li>
          <li>Choose "Can view all details" and click "Publish"</li>
          <li>Copy the ICS link</li>
        </ol>
        <p><strong>Google Calendar:</strong></p>
        <ol>
          <li>Go to <a href="https://calendar.google.com/calendar/r/settings">Google Calendar Settings</a></li>
          <li>Click on your calendar under "Settings for my calendars"</li>
          <li>Scroll to "Integrate calendar"</li>
          <li>Copy "Secret address in iCal format"</li>
        </ol>
      </details>
    `;

    // Refresh interval
    new Setting(containerEl)
      .setName('Refresh interval')
      .setDesc('How often to refresh the calendar (in minutes)')
      .addSlider(slider => slider
        .setLimits(1, 60, 1)
        .setValue(this.plugin.settings.refreshInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.refreshInterval = value;
          await this.plugin.saveSettings();
        }));

    // Default view
    new Setting(containerEl)
      .setName('Default view')
      .setDesc('Which view to show when opening the calendar')
      .addDropdown(dropdown => dropdown
        .addOption('Today', 'Today')
        .addOption('This Week', 'This Week')
        .addOption('Upcoming', 'Upcoming (14 days)')
        .setValue(this.plugin.settings.defaultView)
        .onChange(async (value) => {
          this.plugin.settings.defaultView = value;
          await this.plugin.saveSettings();
        }));

    // Notes folder
    new Setting(containerEl)
      .setName('Meeting notes folder')
      .setDesc('Where to create meeting notes')
      .addText(text => text
        .setPlaceholder('Meetings')
        .setValue(this.plugin.settings.notesFolder)
        .onChange(async (value) => {
          this.plugin.settings.notesFolder = value;
          await this.plugin.saveSettings();
        }));

    // Show cancelled
    new Setting(containerEl)
      .setName('Show cancelled events')
      .setDesc('Include cancelled meetings in the calendar view')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showCancelled)
        .onChange(async (value) => {
          this.plugin.settings.showCancelled = value;
          await this.plugin.saveSettings();
        }));

    // Note template section
    containerEl.createEl('h3', { text: 'Note Template' });
    containerEl.createEl('p', { 
      text: 'Template for new meeting notes. Available variables: {{title}}, {{date}}, {{time}}, {{location}}, {{attendees}}, {{attendee_list}}, {{description}}',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Note template')
      .addTextArea(text => {
        text
          .setPlaceholder('Enter your template...')
          .setValue(this.plugin.settings.noteTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteTemplate = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 15;
        text.inputEl.cols = 60;
      });

    // Test connection button
    containerEl.createEl('h3', { text: 'Test Connection' });
    
    new Setting(containerEl)
      .setName('Test calendar connection')
      .setDesc('Verify your ICS URL is working correctly')
      .addButton(button => button
        .setButtonText('Test Connection')
        .setCta()
        .onClick(async () => {
          button.setButtonText('Testing...');
          button.setDisabled(true);
          
          try {
            await this.plugin.refreshCalendar();
            const count = this.plugin.events.length;
            button.setButtonText(`✓ Found ${count} events`);
          } catch (error) {
            button.setButtonText('✗ Failed');
            console.error('Calendar test failed:', error);
          }
          
          setTimeout(() => {
            button.setButtonText('Test Connection');
            button.setDisabled(false);
          }, 3000);
        }));
  }
}
