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
const VAULT_NAME = 'Business Lead Vault 2026';
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'vault-tailored');
const ZIP_OUTPUT = path.join(__dirname, '..', 'public', 'downloads', 'Business-Lead-Vault-2026.zip');
const PLUGIN_DIR = path.join(__dirname, '..', 'obsidian-plugin');
const CALENDAR_PLUGIN_DIR = path.join(__dirname, '..', 'eudia-calendar-plugin');

// OpenAI API key from environment (for local fallback transcription)
// NOTE: This is OPTIONAL - server-side transcription is the primary method
// The server has its own OPENAI_API_KEY, so users don't typically need this
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Log warning if no API key is set (informational, not critical)
if (!OPENAI_API_KEY) {
  console.log('ℹ️  Note: No OPENAI_API_KEY set in environment.');
  console.log('   This is OK - server-side transcription will be used.');
  console.log('   Local fallback transcription will be unavailable.');
}

/**
 * Create QuickStart guide
 */
function createQuickStart(destDir) {
  console.log('📝 Creating QuickStart guide...');
  
  const quickStartContent = `# Quick Reference

Your sales vault: record meetings, transcribe with AI, sync to Salesforce.

---

## What This Does

- **Transcribes** your customer calls with speaker identification
- **Extracts** next steps, pain points, and MEDDICC data automatically  
- **Syncs** everything to Salesforce and the GTM Hub for meeting prep

---

## Your Daily Workflow

### Before a Call
1. Click the **calendar icon** → find your meeting → click to create a note
2. Review context in GTM Hub's Meeting Prep tab

### During a Call  
1. Click the **microphone icon** to start recording
2. Take any manual notes as needed

### After a Call
1. Click microphone again to stop → AI transcribes in ~30 seconds
2. Next steps auto-populate to your dashboards
3. Note syncs to Salesforce (if enabled)

---

## Key Locations

| Folder | What's There |
|--------|--------------|
| **Accounts/** | One folder per account with notes, contacts, intelligence |
| **Next Steps/** | All action items across every account |
| **_Analytics/** | Team performance, objections, coaching (managers) |
| **_Customer Health/** | At-risk accounts, expansion signals, feature requests |

---

## Sidebar Icons

| Icon | Action |
|------|--------|
| Calendar | View meetings, create notes |
| Microphone | Start/stop recording |
| Message | Ask GTM Brain about current account |

---

## How Data Flows

**Meeting Note** → AI extracts insights → Saved to account folder

↓

**All Next Steps** dashboard aggregates action items across accounts

↓

**GTM Hub** displays context for your next meeting prep

---

## Common Tasks

| Task | How |
|------|-----|
| Ask about an account | Click message icon or \`Cmd+P\` → "Ask GTM Brain" |
| Refresh accounts | \`Cmd+P\` → "Sync Salesforce Accounts" |
| Sync note to SF | Add \`sync_to_salesforce: true\` to note header |

---

## Need Help?

**GTM Hub**: gtm-wizard.onrender.com  
**Settings**: Settings → Community Plugins → Eudia Sync & Scribe  
**Slack**: #gtm-tools
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
 * Create Next Steps folder (aggregated dashboard)
 */
function createNextStepsFolder(destDir) {
  console.log('📋 Creating Next Steps folder...');
  const nextStepsDir = path.join(destDir, 'Next Steps');
  fs.mkdirSync(nextStepsDir, { recursive: true });
  
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  // Create the All Next Steps dashboard
  const dashboardContent = `---
type: next_steps_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# All Next Steps Dashboard

*Last updated: ${dateStr} ${timeStr}*

---

## How This Works

This dashboard automatically aggregates next steps from all your account meetings.

1. **Record a meeting** in any account folder
2. **Transcribe** using the microphone button
3. **Next steps are extracted** by AI and added to the account's Next Steps note
4. **This dashboard updates** to show all accounts' next steps in one view

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Meeting | Next Steps |
|---------|--------------|------------|
| *None yet* | - | Complete a meeting transcription |

`;
  
  fs.writeFileSync(path.join(nextStepsDir, 'All Next Steps.md'), dashboardContent);
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
  
  // Core plugins - explicitly disable daily-notes to remove duplicate calendar icon
  // Core plugins - minimal set for sales users
  // Disabled: global-search (use file explorer), switcher, markdown-importer, canvas
  const corePlugins = {
    "file-explorer": true,
    "global-search": false,
    "switcher": false,
    "markdown-importer": false,
    "word-count": true,
    "open-with-default-app": false,
    "file-recovery": true,
    "daily-notes": false,
    "templates": false,
    "canvas": false,
    "graph": true
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
    "openaiApiKey": OPENAI_API_KEY,
    "timezone": "America/New_York",
    "lastAccountRefreshDate": null
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
 * Create Analytics folder for managers (auto-populated by plugin)
 * Creates placeholder templates that are refreshed from the API
 */
function createAnalyticsFolder(destDir) {
  console.log('📊 Creating Analytics folder for managers...');
  const analyticsDir = path.join(destDir, '_Analytics');
  fs.mkdirSync(analyticsDir, { recursive: true });
  
  const dateStr = new Date().toISOString().split('T')[0];
  
  // Team Performance note
  const teamPerformanceContent = `---
type: analytics_dashboard
auto_refresh: true
refresh_interval: daily
last_updated: ${dateStr}
---

# Team Performance Dashboard

*This note auto-updates with data from the GTM Brain analytics API.*

---

## Team Overview

| Metric | This Week | Trend |
|--------|-----------|-------|
| Calls Analyzed | -- | -- |
| Avg Score | -- | -- |
| Talk Ratio | -- | -- |

---

## Top Performers

*Connect to server to load team data*

---

## Coaching Focus Areas

*Analytics will populate based on call analysis*

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;
  fs.writeFileSync(path.join(analyticsDir, 'Team Performance.md'), teamPerformanceContent);
  
  // Pain Point Tracker note
  const painPointContent = `---
type: analytics_dashboard
auto_refresh: true
category: pain_points
last_updated: ${dateStr}
---

# Customer Pain Point Tracker

*Aggregated pain points from customer conversations*

---

## Top Pain Points (Last 30 Days)

| Pain Point | Frequency | Category | Severity |
|------------|-----------|----------|----------|
| -- | -- | -- | -- |

---

## By Category

### Legal
*Pain points related to legal processes...*

### Efficiency
*Pain points related to efficiency/speed...*

### Cost
*Pain points related to budget/cost...*

### Risk
*Pain points related to compliance/risk...*

---

## Example Quotes

*Customer quotes will appear here for reference in sales conversations*

---

> **Tip:** Use these pain points to prepare for customer calls.
`;
  fs.writeFileSync(path.join(analyticsDir, 'Pain Point Tracker.md'), painPointContent);
  
  // Objection Playbook note
  const objectionContent = `---
type: analytics_dashboard
auto_refresh: true
category: objections
last_updated: ${dateStr}
---

# Objection Playbook

*Common objections with handling success rates and best responses*

---

## Top Objections (Last 90 Days)

| Objection | Frequency | Handle Rate | Status |
|-----------|-----------|-------------|--------|
| -- | -- | -- | -- |

---

## Best Practices

### Objection: [Example]

**Frequency:** X times  
**Handle Rate:** Y%

**Best Responses:**
1. *Response that worked well*
2. *Another effective response*

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

---

> **Tip:** Review this playbook before important calls.
`;
  fs.writeFileSync(path.join(analyticsDir, 'Objection Playbook.md'), objectionContent);
  
  // Coaching Insights note
  const coachingContent = `---
type: analytics_dashboard
auto_refresh: true
category: coaching
last_updated: ${dateStr}
---

# Coaching Insights

*AI-generated coaching recommendations for your team*

---

## Talk Time Analysis

**Optimal Range:** 40-50% rep talk time

| Rep | Talk Ratio | Status |
|-----|------------|--------|
| -- | -- | -- |

---

## Question Quality

**Goal:** >60% open-ended questions

| Rep | Open Question Rate | Trend |
|-----|-------------------|-------|
| -- | -- | -- |

---

## Value Articulation

**Scale:** 0-10

| Rep | Avg Score | Top Area | Focus Area |
|-----|-----------|----------|------------|
| -- | -- | -- | -- |

---

## This Week's Focus

*Coaching recommendations will appear here based on call analysis*

---

> **Note:** Schedule 1:1s with reps showing declining trends.
`;
  fs.writeFileSync(path.join(analyticsDir, 'Coaching Insights.md'), coachingContent);
}

/**
 * Create CS-specific analytics folder for Customer Success
 */
function createCSAnalyticsFolder(destDir) {
  console.log('🎯 Creating CS Analytics folder...');
  const csDir = path.join(destDir, '_Customer Health');
  fs.mkdirSync(csDir, { recursive: true });
  
  const dateStr = new Date().toISOString().split('T')[0];
  
  // At-Risk Accounts note
  const atRiskContent = `---
type: analytics_dashboard
auto_refresh: true
category: at_risk
last_updated: ${dateStr}
---

# At-Risk Accounts

*Accounts showing risk indicators from recent calls*

---

## High Risk

| Account | Health Score | Risk Indicators | Last Call |
|---------|--------------|-----------------|-----------|
| -- | -- | -- | -- |

---

## Medium Risk

| Account | Health Score | Risk Indicators | Last Call |
|---------|--------------|-----------------|-----------|
| -- | -- | -- | -- |

---

## Risk Trends

*Accounts with declining sentiment over past 30 days*

---

> **Action:** Prioritize outreach to high-risk accounts.
`;
  fs.writeFileSync(path.join(csDir, 'At-Risk Accounts.md'), atRiskContent);
  
  // Feature Requests Tracker
  const featureContent = `---
type: analytics_dashboard
auto_refresh: true
category: feature_requests
last_updated: ${dateStr}
---

# Feature Requests Tracker

*Feature requests aggregated from customer calls*

---

## Top Requests

| Feature | Customer Count | Priority | Status |
|---------|----------------|----------|--------|
| -- | -- | -- | -- |

---

## By Product Area

### AI Contracting
- ...

### AI Compliance
- ...

### AI M&A
- ...

---

## Customer Quotes

*Selected quotes to share with Product team*

---

> **Tip:** Share this monthly with the Product team.
`;
  fs.writeFileSync(path.join(csDir, 'Feature Requests Tracker.md'), featureContent);
  
  // Expansion Opportunities note
  const expansionContent = `---
type: analytics_dashboard
auto_refresh: true
category: expansion
last_updated: ${dateStr}
---

# Expansion Opportunities

*Upsell and cross-sell signals from customer conversations*

---

## Hot Opportunities

| Account | Opportunity Type | Signal | Readiness |
|---------|-----------------|--------|-----------|
| -- | -- | -- | -- |

---

## Warm Opportunities

| Account | Opportunity Type | Signal | Next Step |
|---------|-----------------|--------|-----------|
| -- | -- | -- | -- |

---

## Signals by Type

### New Use Cases
*Customers exploring new applications...*

### Additional Users
*Customers wanting to expand user base...*

### New Products
*Interest in other Eudia products...*

---

> **Action:** Prioritize hot opportunities for this quarter.
`;
  fs.writeFileSync(path.join(csDir, 'Expansion Opportunities.md'), expansionContent);
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
  createNextStepsFolder(OUTPUT_DIR);
  createRecordingsFolder(OUTPUT_DIR);
  
  // Step 2: Create analytics folders for managers
  createAnalyticsFolder(OUTPUT_DIR);
  createCSAnalyticsFolder(OUTPUT_DIR);
  
  // Step 3: Configure Obsidian
  createObsidianConfig(OUTPUT_DIR);
  
  // Step 4: Copy plugin files
  copyPluginFiles(PLUGIN_DIR, OUTPUT_DIR);
  
  // Step 5: Create ZIP archive (directly to public/downloads)
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
