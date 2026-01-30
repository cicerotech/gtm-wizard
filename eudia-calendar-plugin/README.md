# Eudia Calendar Plugin for Obsidian

Display your Microsoft 365 or Google Calendar meetings directly in Obsidian. Click any meeting to create a linked note.

## Features

- **ICS Calendar Integration** - Connect via your calendar's published ICS URL
- **Meeting Sidebar** - View Today, This Week, or Upcoming meetings
- **One-Click Notes** - Create meeting notes with pre-filled template
- **Attendee Display** - See who's on each call
- **Auto-Refresh** - Calendar stays in sync automatically

## Installation

### Manual Installation

1. Download the latest release
2. Extract to your vault's `.obsidian/plugins/eudia-calendar/` folder
3. Enable the plugin in Obsidian Settings → Community plugins

### Development

```bash
cd eudia-calendar-plugin
npm install
npm run build
```

## Configuration

### Getting Your ICS URL

#### Microsoft 365

1. Go to [Outlook Calendar](https://outlook.office365.com/calendar)
2. Settings (gear icon) → View all Outlook settings
3. Calendar → Shared calendars
4. Under "Publish a calendar", select your calendar
5. Choose "Can view all details" and click "Publish"
6. Copy the **ICS link**

#### Google Calendar

1. Go to [Google Calendar Settings](https://calendar.google.com/calendar/r/settings)
2. Click on your calendar under "Settings for my calendars"
3. Scroll to "Integrate calendar"
4. Copy **Secret address in iCal format**

### Plugin Settings

- **Calendar ICS URL** - Your calendar's ICS feed URL
- **Refresh Interval** - How often to refresh (1-60 minutes)
- **Default View** - Today, This Week, or Upcoming
- **Meeting Notes Folder** - Where to create meeting notes
- **Note Template** - Customizable template with variables

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{title}}` | Meeting title |
| `{{date}}` | Formatted date |
| `{{time}}` | Start - End time |
| `{{location}}` | Meeting location |
| `{{attendees}}` | Comma-separated attendee names |
| `{{attendee_list}}` | Bulleted list of attendees |
| `{{description}}` | Meeting description |
| `{{organizer}}` | Meeting organizer |

## Commands

- **Open Calendar** - Open the calendar sidebar
- **Refresh Calendar** - Force refresh from ICS feed
- **Create Note for Next Meeting** - Quick create note for upcoming meeting

## Privacy

This plugin fetches your calendar directly from Microsoft/Google via the ICS URL you provide. No data is sent to any third-party server. The ICS URL is stored locally in your vault.

## Troubleshooting

### "Calendar blocked by CORS"

Some calendar providers don't allow direct browser access. Solutions:

1. Use a different ICS URL format if available
2. Set up a CORS proxy (advanced)
3. Check if your organization allows external calendar sharing

### Events not showing

1. Verify your ICS URL is correct (test in browser)
2. Check that the calendar is set to "Can view all details"
3. Try the "Refresh Calendar" command
4. Check Obsidian's developer console for errors

## License

MIT License - see LICENSE file
