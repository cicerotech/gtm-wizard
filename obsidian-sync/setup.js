#!/usr/bin/env node
/**
 * Obsidian Sync Setup
 * Interactive setup for connecting Obsidian vault to Salesforce
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'config.json');

async function question(rl, prompt, defaultVal = '') {
  return new Promise(resolve => {
    const display = defaultVal ? `${prompt} [${defaultVal}]: ` : `${prompt}: `;
    rl.question(display, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

/**
 * Find Obsidian vaults on the system
 */
function findVaults() {
  const homeDir = os.homedir();
  const vaults = [];
  
  const searchPaths = [
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Obsidian'),
    homeDir,
    // iCloud
    path.join(homeDir, 'Library/Mobile Documents/iCloud~md~obsidian/Documents'),
  ];
  
  for (const searchPath of searchPaths) {
    try {
      if (!fs.existsSync(searchPath)) continue;
      
      const dirs = fs.readdirSync(searchPath, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        
        const obsidianDir = path.join(searchPath, dir.name, '.obsidian');
        if (fs.existsSync(obsidianDir)) {
          vaults.push({
            name: dir.name,
            path: path.join(searchPath, dir.name)
          });
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
  
  return vaults;
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         OBSIDIAN → SALESFORCE SYNC SETUP                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // Step 1: Find or specify vault
    console.log('[1/4] Finding Obsidian vaults...\n');
    
    const vaults = findVaults();
    let vaultPath = '';
    
    if (vaults.length > 0) {
      console.log('   Found vaults:');
      vaults.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.name} (${v.path})`);
      });
      console.log('');
      
      const choice = await question(rl, '   Select vault number or enter custom path', '1');
      
      if (/^\d+$/.test(choice) && parseInt(choice) <= vaults.length) {
        vaultPath = vaults[parseInt(choice) - 1].path;
      } else {
        vaultPath = choice;
      }
    } else {
      console.log('   No vaults found automatically.');
      vaultPath = await question(rl, '   Enter full path to your Obsidian vault');
    }
    
    // Expand ~ if present
    if (vaultPath.startsWith('~')) {
      vaultPath = path.join(os.homedir(), vaultPath.slice(1));
    }
    
    // Verify vault
    if (!fs.existsSync(vaultPath)) {
      console.log(`\n❌ Vault not found at: ${vaultPath}`);
      rl.close();
      process.exit(1);
    }
    
    console.log(`\n   ✓ Using vault: ${vaultPath}\n`);
    
    // Step 2: Meetings folder
    console.log('[2/4] Meetings folder configuration...\n');
    
    // Check if Meetings folder exists
    const meetingsPath = path.join(vaultPath, 'Meetings');
    const hasMeetingsFolder = fs.existsSync(meetingsPath);
    
    if (hasMeetingsFolder) {
      console.log('   ✓ Found "Meetings" folder in vault');
    } else {
      console.log('   ⚠️  No "Meetings" folder found');
      const createIt = await question(rl, '   Create "Meetings" folder? (Y/n)', 'Y');
      if (createIt.toLowerCase() !== 'n') {
        fs.mkdirSync(meetingsPath, { recursive: true });
        console.log('   ✓ Created Meetings folder');
      }
    }
    
    const meetingsFolder = await question(rl, '\n   Folder name for meeting notes', 'Meetings');
    
    // Step 3: Your name (for attribution)
    console.log('\n[3/4] User configuration...\n');
    
    const repName = await question(rl, '   Your name (for meeting attribution)');
    
    // Step 4: Sync settings
    console.log('\n[4/4] Sync settings...\n');
    
    const syncDays = await question(rl, '   Sync notes from last N days', '30');
    
    // Save config
    const config = {
      vaultPath,
      meetingsFolder,
      repName,
      syncDays: parseInt(syncDays),
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n');
    console.log('  Configuration saved to: config.json');
    console.log('');
    console.log('  📋 RECOMMENDED FOLDER STRUCTURE:');
    console.log('');
    console.log(`     ${vaultPath}/`);
    console.log('     ├── Meetings/');
    console.log('     │   ├── AT&T/');
    console.log('     │   │   └── 2025-01-22 - Discovery Call.md');
    console.log('     │   └── Pure Storage/');
    console.log('     │       └── 2025-01-21 - Demo.md');
    console.log('     └── Templates/');
    console.log('         └── Meeting Note.md');
    console.log('');
    console.log('  🎤 WHISPER CONFIGURATION:');
    console.log('');
    console.log('     In Obsidian Settings → Whisper plugin:');
    console.log(`     • Recordings folder: Recordings`);
    console.log(`     • Transcriptions folder: ${meetingsFolder}/_Inbox`);
    console.log('');
    console.log('     This way, raw transcriptions go to _Inbox,');
    console.log('     and you can organize them into account folders.');
    console.log('');
    console.log('  📤 TO SYNC NOTES TO SALESFORCE:');
    console.log('');
    console.log('     npm run sync');
    console.log('');
    
    rl.close();
    
  } catch (err) {
    console.error('Setup error:', err);
    rl.close();
    process.exit(1);
  }
}

main();

