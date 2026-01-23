#!/usr/bin/env node

/**
 * Auto-Sync Daemon
 * 
 * Runs every 3 hours to sync Hyprnote meetings to Salesforce.
 * Skips internal meetings (only Eudia participants).
 * 
 * Install: node auto-sync.js --install
 * Uninstall: node auto-sync.js --uninstall
 * Run once: node auto-sync.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PLIST_NAME = 'com.eudia.hyprnote-sync.plist';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', PLIST_NAME);
const SYNC_SCRIPT = path.join(__dirname, 'sync.js');
const LOG_FILE = path.join(__dirname, 'data', 'auto-sync.log');

// Internal domains to skip (meetings with only these = internal)
const INTERNAL_DOMAINS = ['eudia.com', 'cicerotech.com', 'johnstonhana.com'];

function isInternalMeeting(participants) {
  if (!participants || participants.length === 0) return true;
  
  const externalParticipants = participants.filter(p => {
    if (!p.email) return false;
    const domain = p.email.split('@')[1]?.toLowerCase();
    return domain && !INTERNAL_DOMAINS.some(d => domain.includes(d));
  });
  
  return externalParticipants.length === 0;
}

function generatePlist() {
  const nodeCmd = execSync('which node').toString().trim();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME.replace('.plist', '')}</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>${nodeCmd}</string>
        <string>${SYNC_SCRIPT}</string>
    </array>
    
    <key>StartInterval</key>
    <integer>10800</integer>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
    
    <key>WorkingDirectory</key>
    <string>${__dirname}</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>`;
}

function install() {
  console.log('\n========================================');
  console.log('  INSTALLING AUTO-SYNC (every 3 hours)');
  console.log('========================================\n');
  
  // Ensure LaunchAgents directory exists
  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }
  
  // Write plist
  const plistContent = generatePlist();
  fs.writeFileSync(PLIST_PATH, plistContent);
  console.log('Created: ' + PLIST_PATH);
  
  // Load the LaunchAgent
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`);
    execSync(`launchctl load "${PLIST_PATH}"`);
    console.log('Loaded LaunchAgent successfully!\n');
    console.log('Auto-sync is now running in the background.');
    console.log('Meetings will sync every 3 hours automatically.');
    console.log('Internal meetings (Eudia-only) are skipped.\n');
    console.log('To check status: node auto-sync.js --status');
    console.log('To uninstall: node auto-sync.js --uninstall\n');
  } catch (err) {
    console.error('Failed to load LaunchAgent:', err.message);
    process.exit(1);
  }
}

function uninstall() {
  console.log('\n========================================');
  console.log('  UNINSTALLING AUTO-SYNC');
  console.log('========================================\n');
  
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`);
    if (fs.existsSync(PLIST_PATH)) {
      fs.unlinkSync(PLIST_PATH);
    }
    console.log('Auto-sync has been disabled.');
    console.log('You can re-enable with: node auto-sync.js --install\n');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

function status() {
  console.log('\n========================================');
  console.log('  AUTO-SYNC STATUS');
  console.log('========================================\n');
  
  const installed = fs.existsSync(PLIST_PATH);
  console.log('Installed: ' + (installed ? 'Yes' : 'No'));
  
  if (installed) {
    try {
      const result = execSync(`launchctl list | grep hyprnote-sync`).toString();
      const running = result.includes('hyprnote-sync');
      console.log('Running: ' + (running ? 'Yes' : 'No'));
    } catch {
      console.log('Running: No');
    }
    
    console.log('Interval: Every 3 hours');
    console.log('Log file: ' + LOG_FILE);
    
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      console.log('Last run: ' + stats.mtime.toLocaleString());
    }
  }
  
  console.log('\nCommands:');
  console.log('  --install   Enable auto-sync');
  console.log('  --uninstall Disable auto-sync');
  console.log('  --status    Show this status\n');
}

// CLI handling
const args = process.argv.slice(2);

if (args.includes('--install')) {
  install();
} else if (args.includes('--uninstall')) {
  uninstall();
} else if (args.includes('--status')) {
  status();
} else {
  // Run sync once
  console.log('Running one-time sync...');
  require('./sync.js');
}

// Export for use in other scripts
module.exports = { isInternalMeeting, INTERNAL_DOMAINS };

