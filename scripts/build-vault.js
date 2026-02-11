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

// OpenAI API key - read from environment variable or .env.local file
// For Eudia: Set OPENAI_API_KEY in your .env or .env.local file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if (OPENAI_API_KEY) {
  console.log('OpenAI API key configured for transcription');
} else {
  console.warn('Warning: OPENAI_API_KEY not set - users will need to configure in plugin settings');
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
    refreshMinutes: 5,
    accountsFolder: 'Accounts'
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
 * Fetch enrichment data from the GTM Brain server for a batch of account IDs.
 * Returns a map of accountId -> enrichment data. Gracefully returns {} on failure.
 */
async function fetchEnrichmentData(accounts) {
  const SERVER_URL = process.env.GTM_SERVER_URL || 'https://gtm-wizard.onrender.com';
  const accountsWithIds = accounts.filter(a => a.id && a.id.length >= 15);
  if (accountsWithIds.length === 0) return {};

  const allEnrichments = {};
  const batchSize = 20;

  console.log(`🔍 Fetching enrichment data for ${accountsWithIds.length} accounts from ${SERVER_URL}...`);

  for (let i = 0; i < accountsWithIds.length; i += batchSize) {
    const batch = accountsWithIds.slice(i, i + batchSize);
    const batchIds = batch.map(a => a.id);

    try {
      const response = await fetch(`${SERVER_URL}/api/accounts/enrich-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: batchIds, userEmail: 'build-script@eudia.com' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.enrichments) {
          Object.assign(allEnrichments, data.enrichments);
        }
      }
    } catch (err) {
      console.warn(`   ⚠ Batch ${Math.floor(i / batchSize) + 1} fetch failed: ${err.message}`);
    }

    // Small delay between batches
    if (i + batchSize < accountsWithIds.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`   Enriched ${Object.keys(allEnrichments).length}/${accountsWithIds.length} accounts`);
  return allEnrichments;
}

/**
 * Create account folders with notes + enriched Contacts.md, Intelligence.md, etc.
 */
function createAccountFolders(accounts, outputDir, enrichments = {}) {
  const accountsDir = path.join(outputDir, 'Accounts');
  fs.mkdirSync(accountsDir, { recursive: true });
  
  console.log(`📁 Creating ${accounts.length} account folders...`);
  
  const dateStr = new Date().toISOString().split('T')[0];
  let created = 0;
  let enrichedCount = 0;

  for (const account of accounts) {
    const safeName = sanitizeFolderName(account.name);
    const accountDir = path.join(accountsDir, safeName);
    
    try {
      fs.mkdirSync(accountDir, { recursive: true });
      const enrich = enrichments[account.id];
      const hasEnrichment = !!enrich;

      // Create 3 meeting note templates
      for (let i = 1; i <= 3; i++) {
        const noteContent = createNoteTemplate(account.name, account.id, account.owner, i);
        fs.writeFileSync(path.join(accountDir, `Note ${i}.md`), noteContent);
      }

      // ── Contacts.md ──
      const enrichedAtContacts = hasEnrichment ? `\nenriched_at: "${new Date().toISOString()}"` : '';
      let contactsBody;
      if (enrich?.contacts) {
        contactsBody = `${enrich.contacts}\n\n## Relationship Map\n\n*Add org chart, decision makers, champions, and blockers here.*\n\n## Contact History\n\n*Log key interactions and relationship developments.*`;
      } else {
        contactsBody = `| Name | Title | Email | Phone | Notes |\n|------|-------|-------|-------|-------|\n| *No contacts on record yet* | | | | |\n\n## Relationship Map\n\n*Add org chart, decision makers, champions, and blockers here.*\n\n## Contact History\n\n*Log key interactions and relationship developments.*`;
      }
      fs.writeFileSync(path.join(accountDir, 'Contacts.md'), `---\naccount: "${account.name}"\naccount_id: "${account.id}"\ntype: contacts\nsync_to_salesforce: false${enrichedAtContacts}\n---\n\n# ${account.name} - Key Contacts\n\n${contactsBody}\n`);

      // ── Intelligence.md ──
      const enrichedAtIntel = hasEnrichment ? `\nenriched_at: "${new Date().toISOString()}"` : '';
      let intelBody;
      if (enrich?.intelligence) {
        intelBody = `${enrich.intelligence}\n\n## News & Signals\n\n*Recent news, earnings mentions, leadership changes.*`;
      } else {
        intelBody = `## Company Overview\n\n*Industry, size, headquarters, key facts.*\n\n## Strategic Priorities\n\n*What's top of mind for leadership? Digital transformation initiatives?*\n\n## Legal/Compliance Landscape\n\n*Regulatory environment, compliance challenges, legal team structure.*\n\n## Competitive Intelligence\n\n*Incumbent vendors, evaluation history, competitive positioning.*\n\n## News & Signals\n\n*Recent news, earnings mentions, leadership changes.*`;
      }
      fs.writeFileSync(path.join(accountDir, 'Intelligence.md'), `---\naccount: "${account.name}"\naccount_id: "${account.id}"\ntype: intelligence\nsync_to_salesforce: false${enrichedAtIntel}\n---\n\n# ${account.name} - Account Intelligence\n\n${intelBody}\n`);

      // ── Meeting Notes.md ──
      const enrichedAtMeetings = hasEnrichment ? `\nenriched_at: "${new Date().toISOString()}"` : '';
      let meetingsBody;
      if (enrich?.opportunities || enrich?.recentActivity) {
        const sections = [];
        if (enrich.opportunities) sections.push(enrich.opportunities);
        if (enrich.recentActivity) sections.push(enrich.recentActivity);
        meetingsBody = sections.join('\n\n');
      } else {
        meetingsBody = `*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*\n\n## Recent Meetings\n\n| Date | Note | Key Outcomes |\n|------|------|--------------|\n|      |      |              |`;
      }
      fs.writeFileSync(path.join(accountDir, 'Meeting Notes.md'), `---\naccount: "${account.name}"\naccount_id: "${account.id}"\ntype: meetings_index\nsync_to_salesforce: false${enrichedAtMeetings}\n---\n\n# ${account.name} - Meeting Notes\n\n${meetingsBody}\n\n## Quick Start\n\n1. Open **Note 1** for your next meeting\n2. Click the **microphone** to record and transcribe\n3. **Next Steps** are auto-extracted after transcription\n4. Set \`sync_to_salesforce: true\` to sync to Salesforce\n`);

      // ── Next Steps.md ──
      const enrichedAtNext = hasEnrichment ? `\nenriched_at: "${new Date().toISOString()}"` : '';
      let nextBody;
      if (enrich?.nextSteps) {
        nextBody = enrich.nextSteps;
      } else {
        nextBody = `*This note is automatically updated after each meeting transcription.*\n\n## Current Next Steps\n\n*No next steps yet. Record a meeting to auto-populate.*`;
      }
      fs.writeFileSync(path.join(accountDir, 'Next Steps.md'), `---\naccount: "${account.name}"\naccount_id: "${account.id}"\ntype: next_steps\nauto_updated: true\nlast_updated: ${dateStr}\nsync_to_salesforce: false${enrichedAtNext}\n---\n\n# ${account.name} - Next Steps\n\n${nextBody}\n\n---\n\n## History\n\n*Previous next steps will be archived here.*\n`);

      created++;
      if (hasEnrichment) enrichedCount++;
    } catch (err) {
      console.warn(`   Warning: Could not create folder for ${account.name}: ${err.message}`);
    }
  }
  
  console.log(`   Created ${created} account folders (${enrichedCount} enriched with Salesforce data)`);
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
  
  // Step 1.5: Fetch enrichment data from the server (contacts, intelligence, etc.)
  const enrichments = await fetchEnrichmentData(accounts);
  
  // Step 2: Create folder structure
  createSetupFiles(OUTPUT_DIR);
  createAccountFolders(accounts, OUTPUT_DIR, enrichments);
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
