#!/usr/bin/env node
/**
 * Vault Builder Script
 * Creates a pre-configured Obsidian vault with:
 * - All 266 accounts from accts.xlsx with 5 blank notes each
 * - Pre-configured Eudia transcription plugin
 * - Setup folder with getting started guide
 * - OpenAI API key pre-loaded
 * 
 * Usage: node scripts/build-vault.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const archiver = require('archiver');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const VAULT_NAME = 'BL Sales Vault';
const ACCOUNTS_FILE = path.join(__dirname, '..', '..', '..', 'Desktop', 'Business Lead 2026 Accounts.xlsx');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'vault');
const ZIP_OUTPUT = path.join(__dirname, '..', 'dist', 'BL-Sales-Vault.zip');
const PLUGIN_DIR = path.join(__dirname, '..', 'obsidian-plugin');
const CALENDAR_PLUGIN_DIR = path.join(__dirname, '..', 'eudia-calendar-plugin');

// OpenAI API key (read from environment)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-proj-YOUR_API_KEY_HERE') {
  console.warn('⚠️  Warning: OPENAI_API_KEY not set in .env - transcription will require manual key entry');
}

/**
 * Sanitize folder name for filesystem
 */
function sanitizeFolderName(name) {
  if (!name) return 'Unknown';
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

/**
 * Read accounts from Excel file
 */
function readAccounts(filePath) {
  console.log(`📊 Reading accounts from ${filePath}...`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`   Found ${data.length} accounts`);
  
  return data.map(row => ({
    name: row['Account Name'] || row['Name'] || 'Unknown',
    owner: row['Account Owner'] || row['Owner'] || 'Unassigned',
    id: row['ID_Acct_18'] || row['Account ID'] || ''
  }));
}

/**
 * Create note template content
 */
function createNoteTemplate(accountName, accountId, accountOwner, noteNumber) {
  return `---
title: Meeting Notes ${noteNumber}
date: 
account: "${accountName}"
account_id: "${accountId}"
owner: "${accountOwner}"
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# Meeting Notes - ${accountName}

*Click the microphone icon to transcribe a meeting, or start typing notes.*

## Pre-Call Notes

*Add context, preparation, or questions here*

---

## Meeting Summary

*Transcription will appear here after recording*

---

## Next Steps

- [ ] *Action items will be extracted here*

`;
}

/**
 * Create Setup folder contents
 */
function createSetupFiles(outputDir) {
  const setupDir = path.join(outputDir, '00 - Setup');
  fs.mkdirSync(setupDir, { recursive: true });
  
  // Welcome.md
  const welcomeContent = `# Welcome to ${VAULT_NAME}

This vault is pre-configured with:
- **266 accounts** from your pipeline, each with 5 note templates
- **AI-powered transcription** for your customer meetings
- **Automatic Salesforce sync** for meeting notes

## Quick Start

1. **Connect your calendar** by clicking the Calendar icon in the left sidebar
2. **Enter your @eudia.com email** when prompted
3. **Start transcribing meetings** by clicking the microphone icon

## How to Use

### Before a Meeting
1. Find the account folder in the sidebar
2. Open one of the pre-created notes
3. Add any prep notes or questions

### During the Meeting
1. Click the microphone icon to start transcription
2. The status bar shows "Listening..." while capturing audio
3. Click Stop when the meeting ends

### After the Meeting
1. AI generates a structured summary with:
   - Key discussion points
   - MEDDICC signals
   - Next steps (as checkboxes)
2. Click "Sync to Salesforce" to push notes to the account

## Note Properties

Each note has frontmatter properties you can edit:
- **clo_meeting**: Check if this was a CLO (Chief Legal Officer) meeting
- **source**: How the meeting came about. Recommended values:
  - \`referral\`
  - \`cold outreach\`
  - \`BL sourced\`

## Tips

- Use **Cmd/Ctrl + P** → "Transcribe Meeting" for keyboard shortcut
- Notes are organized by account for easy reference
- The calendar view shows upcoming meetings with auto-detected accounts

---

*Need help? Contact your RevOps team.*
`;

  fs.writeFileSync(path.join(setupDir, 'Welcome.md'), welcomeContent);
  
  // Quick Start Guide.md
  const quickStartContent = `# Quick Start Guide

## Step 1: Connect Your Calendar

Click the **Calendar** icon in the left sidebar, then enter your @eudia.com email.

Your calendar syncs automatically via Microsoft 365.

---

## Step 2: Find Your Account

All accounts are pre-loaded in the **Accounts** folder.

Use **Cmd/Ctrl + O** to quick-switch between files.

---

## Step 3: Transcribe a Meeting

1. Open a note for the account
2. Click the **Microphone** icon
3. Meeting audio is captured automatically
4. Click **Stop** when finished
5. AI generates the summary

---

## Step 4: Sync to Salesforce

After transcription:
1. Review the AI-generated summary
2. Check the boxes for completed next steps
3. Click **Sync to Salesforce** in settings or use the sidebar icon

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Start/Stop Transcription | Cmd/Ctrl + Shift + R |
| Open Calendar | Cmd/Ctrl + Shift + C |
| Quick Switch Files | Cmd/Ctrl + O |
| Sync to Salesforce | Cmd/Ctrl + Shift + S |

---

## Troubleshooting

**Calendar shows 404?**
→ Make sure you've entered your @eudia.com email in settings

**Transcription not starting?**
→ Allow microphone access when prompted

**Sync failing?**
→ Check your internet connection and try again in 30 seconds

`;

  fs.writeFileSync(path.join(setupDir, 'Quick Start Guide.md'), quickStartContent);
  
  console.log('📝 Created Setup folder with guides');
}

/**
 * Create plugin data.json with pre-configured settings
 */
function createPluginData(pluginDir) {
  const dataJson = {
    serverUrl: 'https://gtm-wizard.onrender.com',
    accountsFolder: 'Accounts',
    recordingsFolder: 'Recordings',
    syncOnStartup: true,
    autoSyncAfterTranscription: true,
    saveAudioFiles: true,
    appendTranscript: true,
    lastSyncTime: null,
    cachedAccounts: [],
    enableSmartTags: true,
    showCalendarView: true,
    userEmail: '',
    setupCompleted: false,
    calendarConfigured: false,
    openaiApiKey: OPENAI_API_KEY
  };
  
  fs.writeFileSync(
    path.join(pluginDir, 'data.json'),
    JSON.stringify(dataJson, null, 2)
  );
  
  console.log('⚙️  Created plugin data.json with pre-configured settings');
}

/**
 * Copy plugin files to vault
 */
function copyPluginFiles(sourceDir, destDir) {
  const pluginDest = path.join(destDir, '.obsidian', 'plugins', 'eudia-transcription');
  fs.mkdirSync(pluginDest, { recursive: true });
  
  // Copy main.js, styles.css, manifest.json
  const filesToCopy = ['main.js', 'styles.css', 'manifest.json'];
  
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(pluginDest, file));
      console.log(`   Copied ${file}`);
    } else {
      console.warn(`   Warning: ${file} not found in ${sourceDir}`);
    }
  }
  
  // Create pre-configured data.json
  createPluginData(pluginDest);
  
  return pluginDest;
}

/**
 * Copy calendar plugin files to vault
 */
function copyCalendarPlugin(sourceDir, destDir) {
  const pluginDest = path.join(destDir, '.obsidian', 'plugins', 'eudia-calendar');
  fs.mkdirSync(pluginDest, { recursive: true });
  
  // Copy main.js, styles.css, manifest.json
  const filesToCopy = ['main.js', 'styles.css', 'manifest.json'];
  
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(pluginDest, file));
      console.log(`   Copied calendar ${file}`);
    } else {
      console.warn(`   Warning: calendar ${file} not found in ${sourceDir}`);
    }
  }
  
  // Create pre-configured data.json for calendar plugin
  const calendarData = {
    userEmail: '',
    serverUrl: 'https://gtm-wizard.onrender.com',
    refreshMinutes: 5
  };
  
  fs.writeFileSync(
    path.join(pluginDest, 'data.json'),
    JSON.stringify(calendarData, null, 2)
  );
  
  console.log('📅 Copied calendar plugin with settings');
  return pluginDest;
}

/**
 * Create Obsidian configuration files
 */
function createObsidianConfig(outputDir) {
  const obsidianDir = path.join(outputDir, '.obsidian');
  fs.mkdirSync(obsidianDir, { recursive: true });
  
  // app.json - Basic app settings
  const appConfig = {
    promptDelete: true,
    alwaysUpdateLinks: true,
    newFileLocation: 'folder',
    attachmentFolderPath: 'Attachments',
    showLineNumber: true,
    strictLineBreaks: false,
    foldHeading: true,
    foldIndent: true,
    showFrontmatter: false
  };
  
  fs.writeFileSync(
    path.join(obsidianDir, 'app.json'),
    JSON.stringify(appConfig, null, 2)
  );
  
  // community-plugins.json - Enable both plugins
  const communityPlugins = ['eudia-transcription', 'eudia-calendar'];
  
  fs.writeFileSync(
    path.join(obsidianDir, 'community-plugins.json'),
    JSON.stringify(communityPlugins, null, 2)
  );
  
  // appearance.json - Theme settings
  const appearance = {
    accentColor: '#8e99e1',
    baseFontSize: 16
  };
  
  fs.writeFileSync(
    path.join(obsidianDir, 'appearance.json'),
    JSON.stringify(appearance, null, 2)
  );
  
  console.log('🎨 Created Obsidian configuration files');
}

/**
 * Create account folders with notes
 */
function createAccountFolders(accounts, outputDir) {
  const accountsDir = path.join(outputDir, 'Accounts');
  fs.mkdirSync(accountsDir, { recursive: true });
  
  console.log(`📁 Creating ${accounts.length} account folders...`);
  
  let created = 0;
  for (const account of accounts) {
    const safeName = sanitizeFolderName(account.name);
    const accountDir = path.join(accountsDir, safeName);
    
    try {
      fs.mkdirSync(accountDir, { recursive: true });
      
      // Create 5 blank notes
      for (let i = 1; i <= 5; i++) {
        const noteContent = createNoteTemplate(
          account.name,
          account.id,
          account.owner,
          i
        );
        const notePath = path.join(accountDir, `Note ${i}.md`);
        fs.writeFileSync(notePath, noteContent);
      }
      
      created++;
    } catch (err) {
      console.warn(`   Warning: Could not create folder for ${account.name}: ${err.message}`);
    }
  }
  
  console.log(`   Created ${created} account folders with 5 notes each`);
}

/**
 * Create Recordings folder
 */
function createRecordingsFolder(outputDir) {
  const recordingsDir = path.join(outputDir, 'Recordings');
  fs.mkdirSync(recordingsDir, { recursive: true });
  
  // Create a placeholder file
  fs.writeFileSync(
    path.join(recordingsDir, '.gitkeep'),
    '# Audio recordings will be saved here\n'
  );
  
  console.log('🎙️  Created Recordings folder');
}

/**
 * Create ZIP archive of the vault
 */
async function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Creating ZIP archive...`);
    
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`   Archive created: ${outputPath}`);
      console.log(`   Size: ${sizeMB} MB`);
      resolve();
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    
    // Add vault folder to archive with vault name
    archive.directory(sourceDir, VAULT_NAME);
    
    archive.finalize();
  });
}

/**
 * Main build function
 */
async function buildVault() {
  console.log(`\n🏗️  Building ${VAULT_NAME}\n`);
  console.log('='.repeat(50));
  
  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Check if accounts file exists
  let accountsFile = ACCOUNTS_FILE;
  if (!fs.existsSync(accountsFile)) {
    // Try alternate locations
    const alternates = [
      path.join(__dirname, 'accts.xlsx'),
      path.join(__dirname, '..', 'accts.xlsx'),
      '/Users/keiganpesenti/Desktop/accts.xlsx'
    ];
    
    for (const alt of alternates) {
      if (fs.existsSync(alt)) {
        accountsFile = alt;
        break;
      }
    }
    
    if (!fs.existsSync(accountsFile)) {
      console.error('❌ Could not find accts.xlsx. Please ensure it exists.');
      process.exit(1);
    }
  }
  
  // Step 1: Read accounts
  const accounts = readAccounts(accountsFile);
  
  // Step 2: Create folder structure
  createSetupFiles(OUTPUT_DIR);
  createAccountFolders(accounts, OUTPUT_DIR);
  createRecordingsFolder(OUTPUT_DIR);
  
  // Step 3: Configure Obsidian
  createObsidianConfig(OUTPUT_DIR);
  
  // Step 4: Copy and configure plugins
  copyPluginFiles(PLUGIN_DIR, OUTPUT_DIR);
  copyCalendarPlugin(CALENDAR_PLUGIN_DIR, OUTPUT_DIR);
  
  // Step 5: Create ZIP archive
  await createZipArchive(OUTPUT_DIR, ZIP_OUTPUT);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Vault build complete!');
  console.log(`\n📍 Output: ${ZIP_OUTPUT}`);
  console.log('\nTo distribute:');
  console.log('1. Upload the ZIP to Google Drive or Dropbox');
  console.log('2. Share the link with sales reps');
  console.log('3. They download, extract, and open in Obsidian\n');
}

// Run the build
buildVault().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
