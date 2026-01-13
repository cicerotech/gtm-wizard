# Eudia Meeting Sync - Electron App

Native macOS menu bar app for syncing Hyprnote meeting notes to Salesforce.

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
cd electron-app
npm install
```

### Run in Development
```bash
npm start
```

### Build for Distribution
```bash
# Build .dmg installer
npm run build:dmg
```

The built `.dmg` file will be in `dist/` folder.

## Architecture

```
electron-app/
├── main.js           # Electron main process (tray, windows)
├── renderer/         # UI windows
│   ├── index.html    # Main status window
│   └── config.html   # Configuration wizard
├── assets/           # Icons and images
│   └── tray-icon.png # Menu bar icon (16x16)
└── package.json      # Dependencies and build config
```

## Features

- **Menu Bar App**: Lives in macOS menu bar, doesn't clutter Dock
- **One-Click Sync**: Sync button right from the menu
- **Auto-Detection**: Finds any Hyprnote version automatically
- **User Dropdown**: Select your name from the team list (no User IDs)
- **Status Indicator**: Shows sync status at a glance

## Distribution

After building, share the `.dmg` file with sales reps. They:
1. Open the DMG
2. Drag app to Applications
3. Launch and select their name
4. Done!

