#!/usr/bin/env node
/**
 * Tailored Vault Builder Script
 * Creates a CLEAN Obsidian vault that imports accounts dynamically based on user email.
 * 
 * This version:
 * - Does NOT pre-create account folders (those are imported on setup)
 * - Includes the updated Eudia plugin with Setup View
 * - Creates QuickStart guide and essential folders only
 * 
 * Usage: node scripts/build-tailored-vault.js
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const VAULT_NAME = 'BL Sales Vault';
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'vault-tailored');
const ZIP_OUTPUT = path.join(__dirname, '..', 'public', 'downloads', 'BL-Sales-Vault.zip');
const PLUGIN_DIR = path.join(__dirname, '..', 'obsidian-plugin');
const CALENDAR_PLUGIN_DIR = path.join(__dirname, '..', 'eudia-calendar-plugin');

// OpenAI API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Create QuickStart guide
 */
function createQuickStart(destDir) {
  console.log('📝 Creating QuickStart guide...');
  
  const quickStartContent = `# Welcome to Your Sales Vault

## Getting Started

When you opened this vault, a **Setup Wizard** should have appeared. If not, go to:
\`Settings → Eudia Sync & Scribe → Setup\`

### Step 1: Connect Your Calendar
Enter your @eudia.com email to sync your Microsoft 365 calendar.

### Step 2: Connect to Salesforce
Click "Connect to Salesforce" and complete the OAuth flow in the popup.
Your account folders will be automatically imported based on your ownership.

### Step 3: Start Transcribing
- Click the **microphone icon** in the left sidebar during a call
- Or press \`Cmd/Ctrl+P\` and search for "Transcribe Meeting"

---

## Quick Reference

| Action | How |
|--------|-----|
| View Calendar | Click calendar icon in sidebar |
| New Meeting Note | Click any meeting in calendar |
| Transcribe | Click microphone or Cmd+P → Transcribe |
| Sync to Salesforce | Set \`sync_to_salesforce: true\` in note |

---

## Need Help?

- **Plugin Settings**: Settings → Eudia Sync & Scribe
- **Keyboard Shortcuts**: Settings → Hotkeys → search "Eudia"

Happy selling! 🎯
`;

  fs.writeFileSync(path.join(destDir, 'QUICKSTART.md'), quickStartContent);
}

/**
 * Create Accounts folder (empty - will be populated on setup)
 */
function createAccountsFolder(destDir) {
  console.log('📁 Creating Accounts folder...');
  const accountsDir = path.join(destDir, 'Accounts');
  fs.mkdirSync(accountsDir, { recursive: true });
  
  // Create a placeholder note
  const placeholderContent = `# Your Accounts

Your account folders will appear here after you complete the setup wizard.

1. Enter your @eudia.com email
2. Connect to Salesforce
3. Your owned accounts will be imported automatically

Delete this note after setup is complete.
`;
  fs.writeFileSync(path.join(accountsDir, '_Setup Required.md'), placeholderContent);
}

/**
 * Create Recordings folder
 */
function createRecordingsFolder(destDir) {
  console.log('🎙️  Creating Recordings folder...');
  const recordingsDir = path.join(destDir, 'Recordings');
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.writeFileSync(path.join(recordingsDir, '.gitkeep'), '');
}

/**
 * Create Obsidian configuration
 */
function createObsidianConfig(destDir) {
  console.log('⚙️  Configuring Obsidian settings...');
  const obsidianDir = path.join(destDir, '.obsidian');
  fs.mkdirSync(obsidianDir, { recursive: true });
  
  // App config
  const appConfig = {
    "alwaysUpdateLinks": true,
    "newFileLocation": "folder",
    "attachmentFolderPath": "Recordings",
    "showViewHeader": true,
    "readableLineLength": true,
    "strictLineBreaks": false,
    "showFrontmatter": false,
    "foldHeading": true,
    "foldIndent": true
  };
  fs.writeFileSync(path.join(obsidianDir, 'app.json'), JSON.stringify(appConfig, null, 2));
  
  // Appearance config - Light theme to match GTM site branding
  const appearanceConfig = {
    "accentColor": "#8e99e1",
    "theme": "moonstone",
    "cssTheme": ""
  };
  fs.writeFileSync(path.join(obsidianDir, 'appearance.json'), JSON.stringify(appearanceConfig, null, 2));
  
  // Community plugins list
  const communityPlugins = ["eudia-transcription"];
  fs.writeFileSync(path.join(obsidianDir, 'community-plugins.json'), JSON.stringify(communityPlugins, null, 2));
  
  // Core plugins
  const corePlugins = {
    "file-explorer": true,
    "global-search": true,
    "switcher": true,
    "markdown-importer": true,
    "word-count": true,
    "open-with-default-app": true,
    "file-recovery": true
  };
  fs.writeFileSync(path.join(obsidianDir, 'core-plugins.json'), JSON.stringify(corePlugins, null, 2));
}

/**
 * Copy and configure the main transcription plugin
 */
function copyPluginFiles(sourceDir, destDir) {
  console.log('🔌 Copying Eudia plugin...');
  const pluginDest = path.join(destDir, '.obsidian', 'plugins', 'eudia-transcription');
  fs.mkdirSync(pluginDest, { recursive: true });
  
  // Copy main.js, styles.css, manifest.json
  const filesToCopy = ['main.js', 'styles.css', 'manifest.json'];
  
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(pluginDest, file));
      console.log(`   ✓ ${file}`);
    } else {
      console.warn(`   ⚠ ${file} not found`);
    }
  }
  
  // Create plugin data.json with default settings
  // Note: setupCompleted is FALSE so the Setup View appears on first open
  const pluginData = {
    "serverUrl": "https://gtm-wizard.onrender.com",
    "accountsFolder": "Accounts",
    "recordingsFolder": "Recordings",
    "syncOnStartup": true,
    "autoSyncAfterTranscription": true,
    "saveAudioFiles": true,
    "appendTranscript": true,
    "lastSyncTime": null,
    "cachedAccounts": [],
    "enableSmartTags": true,
    "showCalendarView": true,
    "userEmail": "",
    "setupCompleted": false,
    "calendarConfigured": false,
    "salesforceConnected": false,
    "accountsImported": false,
    "importedAccountCount": 0,
    "openaiApiKey": OPENAI_API_KEY
  };
  fs.writeFileSync(path.join(pluginDest, 'data.json'), JSON.stringify(pluginData, null, 2));
  console.log('   ✓ data.json (plugin settings)');
}

/**
 * Create ZIP archive
 */
async function createZipArchive(sourceDir, outputPath) {
  console.log('📦 Creating ZIP archive...');
  
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`   ✓ ${sizeMB} MB`);
      resolve();
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, VAULT_NAME);
    archive.finalize();
  });
}

/**
 * Main build function
 */
async function buildVault() {
  console.log(`\n🏗️  Building Tailored ${VAULT_NAME}\n`);
  console.log('='.repeat(50));
  console.log('This vault starts EMPTY and imports accounts');
  console.log('based on user email during setup.\n');
  
  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Step 1: Create basic structure
  createQuickStart(OUTPUT_DIR);
  createAccountsFolder(OUTPUT_DIR);
  createRecordingsFolder(OUTPUT_DIR);
  
  // Step 2: Configure Obsidian
  createObsidianConfig(OUTPUT_DIR);
  
  // Step 3: Copy plugin files
  copyPluginFiles(PLUGIN_DIR, OUTPUT_DIR);
  
  // Step 4: Create ZIP archive (directly to public/downloads)
  await createZipArchive(OUTPUT_DIR, ZIP_OUTPUT);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Tailored vault build complete!');
  console.log(`\n📍 Output: ${ZIP_OUTPUT}`);
  console.log('\n📋 Next steps:');
  console.log('1. git add .');
  console.log('2. git commit -m "Update vault with tailored onboarding"');
  console.log('3. git push (Render will auto-deploy)\n');
}

// Run the build
buildVault().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
